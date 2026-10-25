package `in`.satark.shield

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * What Android lets an app know about screen-sharing ("remote access") apps
 * and payment apps, without root:
 *  - installed: the package manager,
 *  - can control the screen: their accessibility service is switched on,
 *  - active: they used the internet through the web shield, or Android's usage
 *    history (needs "usage access") shows them open or running a session service.
 * It cannot see inside another app or close it; Satark only warns and guides.
 */
object RemoteAccessMonitor {
    /** Screen-sharing / remote-control apps scammers ask victims to install. */
    val REMOTE_ACCESS_PACKAGES = listOf(
        "com.anydesk.anydeskandroid", "com.anydesk.adcontrol.ad1",
        "com.teamviewer.quicksupport.market", "com.teamviewer.teamviewer.market.mobile", "com.teamviewer.host.market",
        "com.carriez.flutter_hbb", "com.sand.airdroid", "com.sand.airdroidbiz", "com.sand.airmirror",
        "com.zoho.assist.agent", "com.zoho.assist", "com.google.chromeremotedesktop",
        "com.splashtop.remote.pad.v2", "com.splashtop.streamer.csrs", "com.aomei.anyviewer", "com.rsupport.mobizen.mirroring",
        "com.realvnc.viewer.android", "com.microsoft.rdc.androidx",
    )

    /** UPI and banking apps: using one soon after other scam signs raises the risk. */
    val PAYMENT_PACKAGES = listOf(
        "com.google.android.apps.nbu.paisa.user", "com.phonepe.app", "net.one97.paytm", "in.org.npci.upiapp", "com.dreamplug.androidapp",
        "com.mobikwik_new", "com.sbi.lotusintouch", "com.sbi.SBIFreedomPlus", "com.snapwork.hdfc", "com.csam.icici.bank.imobile",
        "com.axis.mobile", "com.msf.kbank.mobile", "com.bankofbaroda.mconnect", "com.canarabank.mobility",
    )

    private const val ACTIVE_WINDOW_MS = 10 * 60 * 1000L
    private val lastNetwork = ConcurrentHashMap<String, Long>()

    fun isRemoteAccess(pkg: String) = pkg in REMOTE_ACCESS_PACKAGES

    fun isPayment(pkg: String) = pkg in PAYMENT_PACKAGES

    /** Called by the web shield whenever an app looks up a domain. */
    fun noteNetwork(pkg: String, time: Long = System.currentTimeMillis()) {
        if (isRemoteAccess(pkg) || isPayment(pkg)) lastNetwork[pkg] = time
    }

    fun installed(context: Context, packages: List<String> = REMOTE_ACCESS_PACKAGES): List<String> = packages.filter {
        try {
            context.packageManager.getApplicationInfo(it, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }
    }

    fun label(context: Context, pkg: String): String = try {
        context.packageManager.getApplicationLabel(context.packageManager.getApplicationInfo(pkg, 0)).toString()
    } catch (_: Exception) {
        pkg
    }

    /** Packages whose accessibility service is switched on (they can read and control the screen). */
    fun accessibilityPackages(context: Context): Set<String> {
        val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES).orEmpty()
        return enabled.split(':').mapNotNull { it.substringBefore('/').trim().takeIf { pkg -> pkg.isNotEmpty() } }.toSet()
    }

    /** Downloaded (non-system) apps other than Satark with an accessibility service switched on. */
    fun thirdPartyAccessibility(context: Context): List<String> = accessibilityPackages(context).filter { pkg ->
        pkg != context.packageName && try {
            val info = context.packageManager.getApplicationInfo(pkg, 0)
            info.flags and (ApplicationInfo.FLAG_SYSTEM or ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0
        } catch (_: Exception) {
            false
        }
    }

    fun hasUsageAccess(context: Context): Boolean {
        val ops = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        @Suppress("DEPRECATION")
        val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        } else {
            ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    data class Activity(val lastSeen: Long, val sessionRunning: Boolean, val source: String)

    /**
     * When each of [packages] was last active, from usage history (needs usage
     * access) and from the web shield's network log. Only recent activity is returned.
     */
    fun recentActivity(context: Context, packages: List<String>, windowMs: Long = ACTIVE_WINDOW_MS): Map<String, Activity> {
        val now = System.currentTimeMillis()
        val result = HashMap<String, Activity>()
        for (pkg in packages) {
            val seen = lastNetwork[pkg] ?: continue
            if (now - seen <= windowMs) result[pkg] = Activity(seen, false, "network")
        }
        if (!hasUsageAccess(context)) return result
        val usage = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val wanted = packages.toSet()
        // Look back two hours so a session service started earlier is still seen as running.
        val events = try { usage.queryEvents(now - 2 * 60 * 60 * 1000L, now) } catch (_: Exception) { return result }
        val lastForeground = HashMap<String, Long>()
        val running = HashMap<String, Boolean>()
        val event = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(event)
            val pkg = event.packageName ?: continue
            if (pkg !in wanted) continue
            when (event.eventType) {
                UsageEvents.Event.MOVE_TO_FOREGROUND -> lastForeground[pkg] = event.timeStamp
                FOREGROUND_SERVICE_START -> { running[pkg] = true; lastForeground[pkg] = maxOf(lastForeground[pkg] ?: 0, event.timeStamp) }
                FOREGROUND_SERVICE_STOP -> running[pkg] = false
            }
        }
        for (pkg in packages) {
            val sessionRunning = running[pkg] == true
            val seen = maxOf(lastForeground[pkg] ?: 0, result[pkg]?.lastSeen ?: 0)
            if (sessionRunning || now - seen <= windowMs) {
                result[pkg] = Activity(if (sessionRunning) now else seen, sessionRunning, if (sessionRunning) "service" else result[pkg]?.source ?: "foreground")
            }
        }
        return result
    }

    fun status(context: Context): JSONObject {
        val installed = installed(context)
        val accessibility = accessibilityPackages(context)
        val active = recentActivity(context, installed)
        return JSONObject()
            .put("usageAccess", hasUsageAccess(context))
            .put("anyActive", active.isNotEmpty())
            .put("anyAccessibility", installed.any { it in accessibility })
            .put("apps", JSONArray().apply {
                installed.forEach { pkg ->
                    val activity = active[pkg]
                    put(JSONObject()
                        .put("packageName", pkg)
                        .put("app", label(context, pkg))
                        .put("accessibility", pkg in accessibility)
                        .put("active", activity != null)
                        .put("sessionRunning", activity?.sessionRunning == true)
                        .put("lastActive", activity?.lastSeen ?: 0)
                        .put("activeSource", activity?.source ?: JSONObject.NULL))
                }
            })
            .put("otherAccessibility", JSONArray().apply {
                thirdPartyAccessibility(context).filter { !isRemoteAccess(it) }.forEach { pkg ->
                    put(JSONObject().put("packageName", pkg).put("app", label(context, pkg)))
                }
            })
    }

    // UsageEvents.Event.FOREGROUND_SERVICE_START / _STOP (API 29); the values are stable.
    private const val FOREGROUND_SERVICE_START = 19
    private const val FOREGROUND_SERVICE_STOP = 20
}
