package `in`.satark.shield

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * One timeline for every detector: blocked links, screen-sharing apps becoming
 * active, scam calls / messages / recordings, and payment apps opened soon after.
 * Signals that arrive within half an hour of each other are joined into one
 * high-risk incident ("a fake bank link was opened, then AnyDesk became active,
 * then PhonePe was opened") instead of separate, unrelated notifications.
 * Stored only on this phone.
 */
object SecurityCenter {

    /** The kinds of evidence that are joined into incidents. */
    enum class Signal(val label: String) {
        LINK("dangerous link"),
        REMOTE("screen-sharing app"),
        SCAM_TALK("scam call or message"),
        PAYMENT("payment app"),
    }

    data class Event(
        val id: Long,
        val time: Long,
        val kind: String,
        val signal: Signal?,
        val severity: String, // "info" | "warning" | "high"
        val title: String,
        val detail: String,
        val app: String? = null,
        var dismissed: Boolean = false,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("id", id).put("time", time).put("kind", kind).put("signal", signal?.name ?: JSONObject.NULL)
            .put("severity", severity).put("title", title).put("detail", detail).put("app", app ?: JSONObject.NULL)
            .put("dismissed", dismissed)

        companion object {
            fun fromJson(o: JSONObject) = Event(
                id = o.optLong("id"), time = o.optLong("time"), kind = o.optString("kind"),
                signal = o.optString("signal").takeIf { !o.isNull("signal") }?.let { name -> Signal.values().firstOrNull { it.name == name } },
                severity = o.optString("severity", "info"), title = o.optString("title"), detail = o.optString("detail"),
                app = o.optString("app").takeIf { !o.isNull("app") && it.isNotEmpty() }, dismissed = o.optBoolean("dismissed"),
            )
        }
    }

    const val WINDOW_MS = 30 * 60 * 1000L
    private const val MAX_EVENTS = 300
    private const val CHANNEL_ID = "satark_threats"
    private const val FILE_NAME = "security-events.json"
    private const val NOTIFY_LINK = 4100
    private const val NOTIFY_REMOTE = 4200
    private const val NOTIFY_HIGH = 4300

    private val saver = Executors.newSingleThreadExecutor()
    private val events = ArrayDeque<Event>()
    private val lastByKey = HashMap<String, Long>()
    private var blockedDay = ""
    private val blockedToday = HashSet<String>()
    private var nextId = 1L
    private var loaded = false
    @Volatile var listener: (() -> Unit)? = null

    // ---- Detectors report here ----

    /** The web shield answered a dangerous lookup with "no such domain". */
    fun onLinkBlocked(context: Context, domain: String, app: String, detail: String, viaShortener: String?) {
        val now = System.currentTimeMillis()
        val fresh = synchronized(this) {
            load(context)
            countBlocked("link:$domain", now)
            throttle("link:$domain", now, 10 * 60 * 1000L)
        }
        if (!fresh) return
        val how = viaShortener?.let { " It was reached through the short link $it, which hid where it really went." }.orEmpty()
        add(context, Event(0, now, if (viaShortener != null) "redirect_blocked" else "link_blocked", Signal.LINK, "warning",
            "Blocked a dangerous site: $domain", "$app tried to open $domain — it $detail.$how", app))
        notify(context, NOTIFY_LINK + (domain.hashCode() and 0xFF), "Satark blocked a dangerous link",
            "$domain — it $detail. Opened by $app. Don't enter any details if the page reopens elsewhere.", high = false)
        correlate(context)
    }

    /** A screen-sharing app is active (used the internet / opened / is running a session). */
    fun onRemoteActive(context: Context, pkg: String, app: String, source: String) {
        val now = System.currentTimeMillis()
        if (!synchronized(this) { load(context); throttle("remote:$pkg", now, 30 * 60 * 1000L) }) return
        val how = when (source) {
            "service" -> "is running a session in the background"
            "foreground" -> "was opened"
            else -> "is using the internet"
        }
        add(context, Event(0, now, "remote_access_active", Signal.REMOTE, "warning", "$app $how",
            "$app lets another person see your screen and read OTPs. If a caller asked you to install or open it, stop the session now.", app))
        notify(context, NOTIFY_REMOTE, "$app $how",
            "If someone on a call asked you to open it, stop now: they can see your screen and OTPs. Open Satark for safety steps.", high = false)
        correlate(context)
    }

    /** The remote-access lock cut screen-sharing apps off. */
    fun onRemoteLocked(context: Context, apps: List<String>, minutes: Long) {
        val now = System.currentTimeMillis()
        synchronized(this) {
            load(context)
            apps.forEach { countBlocked("lock:$it", now) }
        }
        add(context, Event(0, now, "remote_access_locked", null, "info", "Screen-sharing apps cut off",
            "${apps.joinToString(", ")} can't use the internet through this phone for $minutes minutes."))
    }

    /** Live listening raised a scam warning on a call. */
    fun onScamCall(context: Context, title: String, trigger: String) {
        val now = System.currentTimeMillis()
        if (!synchronized(this) { load(context); throttle("call:$title", now, 5 * 60 * 1000L) }) return
        add(context, Event(0, now, "scam_call", Signal.SCAM_TALK, "warning", "Scam call: $title",
            if (trigger.isNotBlank()) "Triggered by: “${trigger.take(160)}”" else "Heard during a call."))
        correlate(context)
    }

    /** The app found scam signs in a checked message / recording or a dangerous link in a message. */
    fun onAppEvent(context: Context, kind: String, title: String, detail: String) {
        val signal = if (kind == "link_flagged") Signal.LINK else Signal.SCAM_TALK
        add(context, Event(0, System.currentTimeMillis(), kind, signal, "warning", title, detail))
        correlate(context)
    }

    /** A payment app was used. Recorded only when other scam signs happened recently. */
    fun onPaymentActive(context: Context, pkg: String, app: String) {
        val now = System.currentTimeMillis()
        val relevant = synchronized(this) {
            load(context)
            val risky = events.any { it.signal != null && it.signal != Signal.PAYMENT && now - it.time <= WINDOW_MS }
            risky && throttle("pay:$pkg", now, 10 * 60 * 1000L)
        }
        if (!relevant) return
        add(context, Event(0, now, "payment_app_active", Signal.PAYMENT, "warning", "$app opened after scam signs",
            "Don't pay or enter your UPI PIN if anyone on a call is guiding you.", app))
        correlate(context)
    }

    // ---- Correlation ----

    private fun correlate(context: Context) {
        val now = System.currentTimeMillis()
        val (incident, remoteInvolved) = synchronized(this) {
            val recent = events.filter { it.signal != null && now - it.time <= WINDOW_MS }.sortedBy { it.time }
            val signals = recent.mapNotNull { it.signal }.toSet()
            // Needs two different kinds of evidence (a payment alone is not evidence).
            if (signals.size < 2) return
            // One incident per combination of signals; a new kind of signal raises a new one.
            val key = "incident:" + signals.map { it.name }.sorted().joinToString("+")
            if (!throttle(key, now, WINDOW_MS)) return
            val clock = SimpleDateFormat("HH:mm", Locale.getDefault())
            val steps = recent.joinToString("\n") { "${clock.format(Date(it.time))} — ${it.title}" }
            val event = Event(0, now, "high_risk", null, "high", "High risk: ${signals.joinToString(" + ") { it.label }}",
                "Several scam signs happened together:\n$steps\n\nStop now. Don't pay, don't share an OTP or PIN, " +
                    "close screen-sharing apps, and call your bank on a number you know.")
            Pair(event, Signal.REMOTE in signals)
        }
        add(context, incident)
        notify(context, NOTIFY_HIGH, incident.title, "Several scam signs happened together. Don't pay or share any OTP. Open Satark for safety steps.", high = true)
        // Someone may be watching the screen: cut screen-sharing apps off if the user allowed it.
        if (remoteInvolved) DnsShieldService.onScamAlert(context)
    }

    // ---- Dashboard ----

    fun threatsBlockedToday(context: Context): Int = synchronized(this) {
        load(context)
        if (blockedDay != today()) 0 else blockedToday.size
    }

    /** Warnings from the last 30 minutes the user has not dismissed, newest first. */
    fun activeAlerts(context: Context): JSONArray = synchronized(this) {
        load(context)
        val now = System.currentTimeMillis()
        JSONArray().apply {
            events.filter { !it.dismissed && it.severity != "info" && now - it.time <= WINDOW_MS }.forEach { put(it.toJson()) }
        }
    }

    fun riskLevel(context: Context): String = synchronized(this) {
        load(context)
        val now = System.currentTimeMillis()
        val active = events.filter { !it.dismissed && now - it.time <= WINDOW_MS }
        when {
            active.any { it.severity == "high" } -> "high"
            active.any { it.severity == "warning" } -> "warning"
            else -> "ok"
        }
    }

    fun timeline(context: Context, limit: Int = 50): JSONArray = synchronized(this) {
        load(context)
        JSONArray().apply { events.take(limit).forEach { put(it.toJson()) } }
    }

    fun dismissActive(context: Context) {
        synchronized(this) {
            load(context)
            events.forEach { it.dismissed = true }
        }
        save(context)
        listener?.invoke()
    }

    fun clear(context: Context) {
        synchronized(this) {
            load(context)
            events.clear()
            lastByKey.clear()
        }
        save(context)
        listener?.invoke()
    }

    // ---- Internals ----

    private fun add(context: Context, event: Event) {
        synchronized(this) {
            load(context)
            events.addFirst(event.copy(id = nextId++))
            while (events.size > MAX_EVENTS) events.removeLast()
        }
        save(context)
        listener?.invoke()
    }

    /** True (and remembers the time) if [key] has not happened within [intervalMs]. */
    private fun throttle(key: String, now: Long, intervalMs: Long): Boolean {
        val last = lastByKey[key]
        if (last != null && now - last < intervalMs) return false
        lastByKey[key] = now
        return true
    }

    private fun countBlocked(key: String, now: Long) {
        val day = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date(now))
        if (day != blockedDay) {
            blockedDay = day
            blockedToday.clear()
        }
        blockedToday += key
    }

    private fun today() = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    private fun load(context: Context) {
        if (loaded) return
        loaded = true
        try {
            val file = File(context.applicationContext.filesDir, FILE_NAME)
            if (!file.exists()) return
            val root = JSONObject(file.readText())
            val array = root.optJSONArray("events") ?: JSONArray()
            for (i in 0 until array.length()) events.addLast(Event.fromJson(array.getJSONObject(i)))
            nextId = (events.maxOfOrNull { it.id } ?: 0) + 1
            blockedDay = root.optString("blockedDay")
            root.optJSONArray("blockedToday")?.let { list -> for (i in 0 until list.length()) blockedToday += list.getString(i) }
        } catch (_: Exception) {
            events.clear()
        }
    }

    private fun save(context: Context) {
        val app = context.applicationContext
        val snapshot = synchronized(this) {
            JSONObject()
                .put("events", JSONArray().apply { events.forEach { put(it.toJson()) } })
                .put("blockedDay", blockedDay)
                .put("blockedToday", JSONArray(blockedToday.toList()))
                .toString()
        }
        saver.execute {
            try {
                File(app.filesDir, FILE_NAME).writeText(snapshot)
            } catch (_: Exception) {
                // Best effort.
            }
        }
    }

    private fun notify(context: Context, id: Int, title: String, text: String, high: Boolean) {
        val app = context.applicationContext
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(app, android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val manager = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Scam and threat warnings", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Blocked scam links, active screen-sharing apps and high-risk warnings"
            })
        }
        val open = PendingIntent.getActivity(
            app, id,
            Intent(app, MainActivity::class.java).putExtra(MainActivity.EXTRA_OPEN, "home")
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(app, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_warning)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(if (high) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        try {
            NotificationManagerCompat.from(app).notify(id, notification)
        } catch (_: SecurityException) {
            // Notifications not allowed.
        }
    }
}
