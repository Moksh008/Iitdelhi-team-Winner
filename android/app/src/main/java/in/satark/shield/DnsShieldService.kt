package `in`.satark.shield

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.VpnService
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.ParcelFileDescriptor
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * Satark's web shield: a local VPN that never leaves the phone.
 *
 * Normal mode ("filter"): only DNS goes through the tunnel. Every domain an app
 * looks up is checked against ScamDomainRules; scam links get "no such domain",
 * everything else is passed to the phone's normal DNS server. Other traffic
 * never enters the tunnel.
 *
 * Remote-access lock ("lock"): while a scam alert is active (or the user locks
 * by hand), all traffic of installed screen-sharing apps is routed into the
 * tunnel and dropped, which also cuts a session that is already connected.
 * Scam-link checks for other apps pause until the lock ends.
 *
 * Each decision goes to the per-app NetworkLog. Nothing is sent anywhere.
 */
class DnsShieldService : VpnService() {

    private enum class Mode { FILTER, LOCK }

    private val main = Handler(Looper.getMainLooper())
    private val workers = Executors.newFixedThreadPool(4)
    private val generation = AtomicInteger()
    private var tun: ParcelFileDescriptor? = null
    private var output: FileOutputStream? = null
    private var mode = Mode.FILTER
    private lateinit var owner: ConnectionOwner
    /** Last link-shortener lookup per app, to spot a short link that redirects to a scam site. */
    private val recentShortener = ConcurrentHashMap<Int, Pair<String, Long>>()
    private lateinit var rules: ScamDomainRules
    private lateinit var log: NetworkLog
    private var lockedPackages: List<String> = emptyList()

    private val unlockTask = Runnable { setLock(false) }
    private val saveTask = object : Runnable {
        override fun run() {
            log.save()
            main.postDelayed(this, SAVE_INTERVAL_MS)
        }
    }
    /** Watches for screen-sharing / payment apps becoming active (usage history) and keeps the threat list fresh. */
    private val monitorTask = object : Runnable {
        override fun run() {
            workers.execute { checkActivity() }
            main.postDelayed(this, MONITOR_INTERVAL_MS)
        }
    }

    override fun onCreate() {
        super.onCreate()
        owner = ConnectionOwner(this)
        rules = ScamDomainRules(assets.open(DOMAINS_ASSET).bufferedReader().use { it.readText() })
        log = networkLog(this)
        instance = this
        ThreatFeed.updateIfStale(this)
        main.postDelayed(saveTask, SAVE_INTERVAL_MS)
        main.postDelayed(monitorTask, 5_000)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                shutdown()
                return START_NOT_STICKY
            }
            ACTION_LOCK -> {
                if (tun == null) establish(Mode.FILTER)
                setLock(true, intent.getLongExtra(EXTRA_MINUTES, DEFAULT_LOCK_MINUTES))
            }
            ACTION_UNLOCK -> setLock(false)
            // Started by the app or by Android's "always-on VPN".
            else -> if (tun == null) establish(if (lockedUntil > System.currentTimeMillis()) Mode.LOCK else Mode.FILTER)
        }
        prefs(this).edit().putBoolean(PREF_ENABLED, true).apply()
        publish()
        return START_STICKY
    }

    override fun onRevoke() {
        // The user turned the VPN off in Android settings, or another VPN took over.
        shutdown()
    }

    override fun onDestroy() {
        main.removeCallbacksAndMessages(null)
        closeTunnel()
        log.save()
        workers.shutdownNow()
        if (instance === this) instance = null
        lockedUntil = 0
        publish()
        super.onDestroy()
    }

    private fun shutdown() {
        prefs(this).edit().putBoolean(PREF_ENABLED, false).apply()
        lockedUntil = 0
        closeTunnel()
        stopSelf()
        publish()
    }

    private fun setLock(on: Boolean, minutes: Long = DEFAULT_LOCK_MINUTES) {
        main.removeCallbacks(unlockTask)
        if (on) {
            lockedPackages = installedRemoteAccessApps(this)
            lockedUntil = System.currentTimeMillis() + minutes * 60_000
            main.postDelayed(unlockTask, minutes * 60_000)
            // Nothing to cut off when no screen-sharing app is installed; keep checking links.
            establish(if (lockedPackages.isEmpty()) Mode.FILTER else Mode.LOCK)
            if (mode == Mode.LOCK) SecurityCenter.onRemoteLocked(this, lockedPackages.map { label(it) }, minutes)
        } else {
            lockedUntil = 0
            establish(Mode.FILTER)
        }
        publish()
    }

    /** Builds the tunnel for [newMode]; the new one is up before the old one closes, so nothing leaks in between. */
    @Synchronized
    private fun establish(newMode: Mode) {
        val builder = Builder()
            .setSession(if (newMode == Mode.LOCK) "Satark: screen-sharing apps locked" else "Satark web shield")
            .addAddress(TUN_CLIENT, 24)
            .addDnsServer(TUN_DNS)
            .setBlocking(true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) builder.setMetered(false)
        // An "allowed apps" tunnel with no app in it would capture every app, so
        // fall back to the normal filter when no locked app could be added.
        val added = if (newMode == Mode.LOCK) lockedPackages.count { pkg ->
            try {
                builder.addAllowedApplication(pkg)
                true
            } catch (_: PackageManager.NameNotFoundException) {
                false
            }
        } else 0
        if (newMode == Mode.LOCK && added == 0) return establish(Mode.FILTER)
        if (newMode == Mode.LOCK) {
            builder.addAddress(TUN_CLIENT_V6, 64).addRoute("0.0.0.0", 0).addRoute("::", 0)
        } else {
            builder.addRoute(TUN_DNS, 32)
            try { builder.addDisallowedApplication(packageName) } catch (_: PackageManager.NameNotFoundException) {}
        }
        val next = try {
            builder.establish()
        } catch (error: Exception) {
            Log.w(TAG, "could not start the tunnel", error)
            null
        } ?: run {
            // VPN permission was revoked: nothing more we can do until the user turns the shield on again.
            lastError = "Android did not allow the web shield to start. Turn it on again from Satark."
            return
        }
        lastError = null
        val previous = tun
        tun = next
        mode = newMode
        output = FileOutputStream(next.fileDescriptor)
        val gen = generation.incrementAndGet()
        Thread({ readLoop(next, gen, newMode) }, "satark-shield-$gen").start()
        try { previous?.close() } catch (_: IOException) {}
    }

    @Synchronized
    private fun closeTunnel() {
        generation.incrementAndGet()
        try { tun?.close() } catch (_: IOException) {}
        tun = null
        output = null
    }

    private fun readLoop(fd: ParcelFileDescriptor, gen: Int, loopMode: Mode) {
        val input = FileInputStream(fd.fileDescriptor)
        val buffer = ByteArray(MAX_PACKET)
        while (generation.get() == gen) {
            val length = try { input.read(buffer) } catch (_: IOException) { break }
            if (length <= 0) continue
            val packet = buffer.copyOf(length)
            val flow = DnsPacket.readFlow(packet, length) ?: continue
            val isDns = flow.protocol == DnsPacket.PROTO_UDP && flow.dstIp == TUN_DNS && flow.dstPort == 53
            when {
                isDns -> workers.execute { handleDns(packet, flow, loopMode, gen) }
                loopMode == Mode.LOCK -> workers.execute { logLockedConnection(flow) }
                // Filter mode routes only the DNS address; anything else is dropped.
            }
        }
    }

    private fun handleDns(packet: ByteArray, flow: DnsPacket.Flow, loopMode: Mode, gen: Int) {
        val query = packet.copyOfRange(flow.payloadOffset, flow.payloadOffset + flow.payloadLength)
        val question = DnsPacket.readQuestion(query) ?: return
        val uid = ownerOf(flow)
        val (pkg, app) = appFor(uid, loopMode)
        val now = System.currentTimeMillis()
        // A short link opened just before by the same app: the blocked site is where it redirected.
        val viaShortener = recentShortener[uid]?.takeIf { now - it.second <= REDIRECT_WINDOW_MS }?.first
        if (loopMode == Mode.FILTER && rules.isShortener(question.name)) recentShortener[uid] = question.name to now
        val verdict = when {
            loopMode == Mode.LOCK -> ScamDomainRules.Verdict(true, REASON_LOCK, "screen-sharing apps are locked during a scam alert")
            question.name in allowedDomains(this) -> ScamDomainRules.Verdict(false)
            else -> rules.check(question.name) { ThreatFeed.contains(it) }
        }
        val answer = if (verdict.blocked) DnsPacket.nxdomain(query) else forward(query)
        val redirected = verdict.blocked && viaShortener != null && loopMode == Mode.FILTER
        log.add(NetworkLog.Entry(
            time = now, uid = uid, packageName = pkg, app = app, target = question.name, kind = "dns",
            action = if (verdict.blocked) "blocked" else "allowed",
            reason = if (redirected) REASON_REDIRECT else verdict.reason,
            detail = if (redirected) "${verdict.detail} — reached through the short link $viaShortener" else verdict.detail,
        ))
        if (verdict.blocked && loopMode == Mode.FILTER) {
            SecurityCenter.onLinkBlocked(this, question.name, app, verdict.detail ?: "is dangerous", viaShortener)
        }
        if (!verdict.blocked && pkg.isNotEmpty()) {
            RemoteAccessMonitor.noteNetwork(pkg, now)
            if (RemoteAccessMonitor.isRemoteAccess(pkg)) SecurityCenter.onRemoteActive(this, pkg, app, "network")
            if (RemoteAccessMonitor.isPayment(pkg)) SecurityCenter.onPaymentActive(this, pkg, app)
        }
        if (verdict.blocked) publish()
        if (answer == null || generation.get() != gen) return
        write(DnsPacket.ipv4Udp(TUN_DNS, 53, flow.srcIp, flow.srcPort, answer))
    }

    /** Usage history (if allowed): a screen-sharing app opened or running a session, or a payment app opened. */
    private fun checkActivity() {
        ThreatFeed.updateIfStale(this)
        if (!RemoteAccessMonitor.hasUsageAccess(this)) return
        val window = MONITOR_INTERVAL_MS * 2
        val remote = RemoteAccessMonitor.installed(this)
        RemoteAccessMonitor.recentActivity(this, remote, window).forEach { (pkg, activity) ->
            if (activity.source != "network") SecurityCenter.onRemoteActive(this, pkg, label(pkg), activity.source)
        }
        val payment = RemoteAccessMonitor.installed(this, RemoteAccessMonitor.PAYMENT_PACKAGES)
        RemoteAccessMonitor.recentActivity(this, payment, window).keys.forEach { SecurityCenter.onPaymentActive(this, it, label(it)) }
    }

    private fun logLockedConnection(flow: DnsPacket.Flow) {
        val uid = ownerOf(flow)
        val (pkg, app) = appFor(uid, Mode.LOCK)
        val target = if (flow.dstPort > 0) "${flow.dstIp}:${flow.dstPort}" else flow.dstIp
        log.add(NetworkLog.Entry(
            time = System.currentTimeMillis(), uid = uid, packageName = pkg, app = app, target = target, kind = "connection",
            action = "blocked", reason = REASON_LOCK, detail = "screen-sharing apps are locked during a scam alert",
        ))
    }

    private fun ownerOf(flow: DnsPacket.Flow): Int =
        if (flow.protocol == DnsPacket.PROTO_UDP || flow.protocol == DnsPacket.PROTO_TCP) {
            owner.uidOf(flow.protocol, flow.srcIp, flow.srcPort, flow.dstIp, flow.dstPort)
        } else ConnectionOwner.UNKNOWN

    private fun appFor(uid: Int, loopMode: Mode): Pair<String, String> {
        if (uid == ConnectionOwner.UNKNOWN) {
            // Only locked apps use the lock tunnel, so a single locked app must be the sender.
            if (loopMode == Mode.LOCK && lockedPackages.size == 1) return lockedPackages[0] to label(lockedPackages[0])
            return "" to "Unknown app"
        }
        if (uid == 0) return "android" to "Android system"
        val pkg = packageManager.getPackagesForUid(uid)?.firstOrNull() ?: return "" to "App $uid"
        return pkg to label(pkg)
    }

    private fun label(pkg: String): String = try {
        packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
    } catch (_: Exception) {
        pkg
    }

    /** Sends the query to the phone's own DNS server outside the tunnel and returns the answer. */
    private fun forward(query: ByteArray): ByteArray? {
        for (server in upstreamServers()) {
            try {
                DatagramSocket().use { socket ->
                    protect(socket)
                    socket.soTimeout = UPSTREAM_TIMEOUT_MS
                    socket.send(DatagramPacket(query, query.size, server, 53))
                    val buffer = ByteArray(MAX_PACKET)
                    val reply = DatagramPacket(buffer, buffer.size)
                    socket.receive(reply)
                    return buffer.copyOf(reply.length)
                }
            } catch (_: Exception) {
                // Try the next server.
            }
        }
        return null
    }

    private fun upstreamServers(): List<InetAddress> {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val servers = mutableListOf<InetAddress>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            @Suppress("DEPRECATION")
            for (network in cm.allNetworks) {
                val caps = cm.getNetworkCapabilities(network) ?: continue
                if (caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) || !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue
                cm.getLinkProperties(network)?.dnsServers?.let { servers += it }
            }
        }
        // Only if the phone reports no DNS server of its own.
        if (servers.isEmpty()) FALLBACK_DNS.forEach { servers += InetAddress.getByName(it) }
        return servers.distinct()
    }

    private fun write(packet: ByteArray) {
        synchronized(this) {
            try { output?.write(packet) } catch (_: IOException) {}
        }
    }

    private fun publish() {
        main.post { listener?.invoke(stateJson(this)) }
    }

    companion object {
        const val TUN_CLIENT = "10.111.222.1"
        const val TUN_DNS = "10.111.222.3"
        private const val TUN_CLIENT_V6 = "fd66:5a7a:4b00::1"
        const val ACTION_START = "in.satark.shield.SHIELD_START"
        const val ACTION_STOP = "in.satark.shield.SHIELD_STOP"
        const val ACTION_LOCK = "in.satark.shield.SHIELD_LOCK"
        const val ACTION_UNLOCK = "in.satark.shield.SHIELD_UNLOCK"
        const val EXTRA_MINUTES = "minutes"
        const val REASON_LOCK = "remote_access_lock"
        const val REASON_REDIRECT = "redirect"
        const val DEFAULT_LOCK_MINUTES = 30L
        private const val DOMAINS_ASSET = "scam-domains.json"
        private const val MAX_PACKET = 32767
        private const val UPSTREAM_TIMEOUT_MS = 4000
        private const val SAVE_INTERVAL_MS = 10_000L
        private const val MONITOR_INTERVAL_MS = 60_000L
        private const val REDIRECT_WINDOW_MS = 20_000L
        private val FALLBACK_DNS = listOf("1.1.1.1", "8.8.8.8")
        private const val TAG = "SatarkShield"
        private const val PREFS = "satark.shield"
        private const val PREF_ENABLED = "enabled"
        private const val PREF_AUTO_LOCK = "autoLock"
        private const val PREF_ALLOWED = "allowedDomains"

        @Volatile var instance: DnsShieldService? = null
            private set
        @Volatile var lockedUntil = 0L
            private set
        @Volatile private var lastError: String? = null
        @Volatile private var sharedLog: NetworkLog? = null
        /** Receives state changes (the plugin forwards them to the app). */
        @Volatile var listener: ((JSONObject) -> Unit)? = null

        val isRunning get() = instance?.tun != null

        fun networkLog(context: Context): NetworkLog =
            sharedLog ?: synchronized(this) { sharedLog ?: NetworkLog(context.applicationContext).also { sharedLog = it } }

        fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        fun autoLock(context: Context) = prefs(context).getBoolean(PREF_AUTO_LOCK, true)

        fun setAutoLock(context: Context, on: Boolean) = prefs(context).edit().putBoolean(PREF_AUTO_LOCK, on).apply()

        fun allowedDomains(context: Context): Set<String> = prefs(context).getStringSet(PREF_ALLOWED, emptySet()) ?: emptySet()

        fun setDomainAllowed(context: Context, domain: String, allowed: Boolean) {
            val next = allowedDomains(context).toMutableSet().apply { if (allowed) add(domain.lowercase()) else remove(domain.lowercase()) }
            prefs(context).edit().putStringSet(PREF_ALLOWED, next).apply()
        }

        fun installedRemoteAccessApps(context: Context): List<String> = RemoteAccessMonitor.installed(context)

        /** True once the user has allowed Satark's VPN (Android asks only the first time). */
        fun hasPermission(context: Context) = VpnService.prepare(context) == null

        fun start(context: Context, action: String, minutes: Long? = null) {
            val intent = Intent(context, DnsShieldService::class.java).setAction(action)
            minutes?.let { intent.putExtra(EXTRA_MINUTES, it) }
            context.startService(intent)
        }

        /**
         * Called by the listening overlay when a call looks like a scam: cut
         * screen-sharing apps off if the user allowed it and the VPN is permitted.
         */
        fun onScamAlert(context: Context) {
            if (!autoLock(context) || !hasPermission(context)) return
            if (installedRemoteAccessApps(context).isEmpty()) return
            if (lockedUntil > System.currentTimeMillis()) return
            start(context, ACTION_LOCK, DEFAULT_LOCK_MINUTES)
        }

        fun stateJson(context: Context): JSONObject {
            val service = instance
            val log = networkLog(context)
            val now = System.currentTimeMillis()
            return JSONObject()
                .put("running", service?.tun != null)
                .put("permission", hasPermission(context))
                .put("mode", if (service?.tun != null) service.mode.name.lowercase() else "off")
                .put("lockedUntil", if (lockedUntil > now) lockedUntil else 0)
                .put("autoLock", autoLock(context))
                .put("remoteAccessApps", JSONArray().apply {
                    installedRemoteAccessApps(context).forEach { pkg ->
                        val name = try {
                            context.packageManager.getApplicationLabel(context.packageManager.getApplicationInfo(pkg, 0)).toString()
                        } catch (_: Exception) { pkg }
                        put(JSONObject().put("packageName", pkg).put("app", name))
                    }
                })
                .put("allowedDomains", JSONArray(allowedDomains(context).sorted()))
                .put("checked", log.checked)
                .put("blocked", log.blocked)
                .put("appIdentification", Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                .put("threatFeed", ThreatFeed.status(context))
                .put("error", lastError ?: JSONObject.NULL)
        }
    }
}
