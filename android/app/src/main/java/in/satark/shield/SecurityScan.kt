package `in`.satark.shield

import android.app.KeyguardManager
import android.content.Context
import android.os.Build
import android.provider.Settings
import org.json.JSONArray
import org.json.JSONObject

/**
 * A quick on-phone safety check: is protection on, is the threat list fresh,
 * is a screen-sharing app installed / able to control the phone / active, and
 * are there settings scammers abuse. Each check says what to do next.
 */
object SecurityScan {
    private const val PREFS = "satark.scan"

    fun run(context: Context): JSONObject {
        val checks = JSONArray()
        fun check(id: String, status: String, title: String, detail: String, action: String? = null) {
            checks.put(JSONObject().put("id", id).put("status", status).put("title", title).put("detail", detail).put("action", action ?: JSONObject.NULL))
        }

        if (DnsShieldService.isRunning) {
            check("shield", "ok", "Scam link blocking is on", "Websites apps open are checked on this phone.")
        } else {
            check("shield", "warn", "Scam link blocking is off", "Turn it on to block fake bank and phishing sites.", "shield")
        }

        val feed = ThreatFeed.status(context)
        val ageDays = (System.currentTimeMillis() - feed.optLong("updatedAt")) / 86_400_000L
        when {
            feed.optLong("updatedAt") == 0L -> check("feed", "warn", "Threat list not downloaded", "Download the list of reported phishing and malware sites.", "feed")
            ageDays > 3 -> check("feed", "warn", "Threat list is $ageDays days old", "Update it to catch new phishing sites.", "feed")
            else -> check("feed", "ok", "Threat list is up to date", "${feed.optInt("count")} reported phishing and malware sites.")
        }

        val remote = RemoteAccessMonitor.installed(context)
        val accessibility = RemoteAccessMonitor.accessibilityPackages(context)
        val active = RemoteAccessMonitor.recentActivity(context, remote)
        val names = { list: List<String> -> list.joinToString(", ") { RemoteAccessMonitor.label(context, it) } }
        if (remote.isEmpty()) {
            check("remote", "ok", "No screen-sharing app installed", "Scammers often ask you to install AnyDesk or TeamViewer. Never do it for a caller.")
        } else {
            check("remote", "warn", "Screen-sharing app installed: ${names(remote)}",
                "Fine if you use it yourself. If a caller asked you to install it, uninstall it.", "remote")
        }
        remote.filter { it in accessibility }.takeIf { it.isNotEmpty() }?.let {
            check("remote_control", "risk", "${names(it)} can control your phone",
                "Its accessibility permission is on, so it can tap and type for someone else. Turn it off unless you set it up yourself.", "accessibility")
        }
        active.keys.toList().takeIf { it.isNotEmpty() }?.let {
            check("remote_active", "risk", "${names(it)} is active now",
                "Someone may be able to see your screen. If you didn't start this yourself, stop the session.", "checklist")
        }

        val others = RemoteAccessMonitor.thirdPartyAccessibility(context).filter { !RemoteAccessMonitor.isRemoteAccess(it) }
        if (others.isNotEmpty()) {
            check("accessibility", "warn", "${others.size} app${if (others.size > 1) "s" else ""} can read your screen",
                "${names(others)} ${if (others.size > 1) "have" else "has"} accessibility access. Remove it from apps you don't fully trust.", "accessibility")
        }

        val adb = try { Settings.Global.getInt(context.contentResolver, Settings.Global.ADB_ENABLED, 0) == 1 } catch (_: Exception) { false }
        if (adb) check("adb", "warn", "USB debugging is on", "Turn it off in Developer options unless you are developing apps.", "developer")

        val privateDns = try { Settings.Global.getString(context.contentResolver, "private_dns_mode") } catch (_: Exception) { null }
        if (privateDns == "hostname") {
            check("private_dns", "warn", "Private DNS skips link blocking",
                "Android's Private DNS is set to a specific provider, so lookups bypass Satark's check. Set it to Automatic or Off.", "private_dns")
        }

        val keyguard = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !keyguard.isDeviceSecure) {
            check("screen_lock", "warn", "No screen lock", "Set a PIN or fingerprint so no one else can open your payment apps.", "security")
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            check("overlay", "warn", "Call warnings can't appear over other apps", "Allow \"Display over other apps\" so the call guardian can warn you during a call.", "overlay")
        }

        if (!RemoteAccessMonitor.hasUsageAccess(context)) {
            check("usage", "info", "Usage access is off", "Allow it so Satark can tell when a screen-sharing app is running, even with link blocking off.", "usage")
        }

        var issues = 0
        for (i in 0 until checks.length()) if (checks.getJSONObject(i).optString("status") in setOf("warn", "risk")) issues += 1
        val result = JSONObject().put("time", System.currentTimeMillis()).put("issues", issues).put("checks", checks)
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("last", result.toString()).apply()
        return result
    }

    fun last(context: Context): JSONObject? =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("last", null)?.let { try { JSONObject(it) } catch (_: Exception) { null } }
}
