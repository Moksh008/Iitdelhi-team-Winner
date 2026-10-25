package `in`.satark.shield

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/**
 * Threat-intelligence list for the web shield: phishing and malware domains
 * from free public feeds, downloaded to the phone about once a day and checked
 * locally. Satark never sends the sites you visit anywhere; it only downloads
 * the list.
 */
object ThreatFeed {
    private val SOURCES = listOf(
        // Phishing domains (combined from OpenPhish, PhishTank and others), updated daily.
        "https://malware-filter.gitlab.io/malware-filter/phishing-filter-hosts.txt",
        // Domains currently serving malware, from URLhaus.
        "https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-hosts-online.txt",
    )
    private const val FILE_NAME = "threat-domains.txt"
    private const val PREFS = "satark.threatfeed"
    private const val MAX_AGE_MS = 24 * 60 * 60 * 1000L
    private const val TAG = "SatarkThreatFeed"
    private val DOMAIN = Regex("^[a-z0-9]([a-z0-9-]{0,62}\\.)+[a-z0-9-]{2,63}$")

    private val executor = Executors.newSingleThreadExecutor()
    @Volatile private var domains: Set<String> = emptySet()
    @Volatile private var loaded = false
    @Volatile var updating = false
        private set
    @Volatile private var lastError: String? = null

    /** True when [domain] or one of its parent domains is on the list. */
    fun contains(domain: String): Boolean {
        val set = domains
        if (set.isEmpty()) return false
        var candidate = domain
        while (candidate.contains('.')) {
            if (candidate in set) return true
            candidate = candidate.substringAfter('.')
        }
        return false
    }

    fun ensureLoaded(context: Context) {
        if (loaded) return
        synchronized(this) {
            if (loaded) return
            val file = File(context.filesDir, FILE_NAME)
            domains = try {
                if (file.exists()) file.readLines().filter { it.isNotBlank() }.toHashSet() else emptySet()
            } catch (_: Exception) {
                emptySet()
            }
            loaded = true
        }
    }

    /** Downloads a fresh list in the background if the saved one is older than a day. */
    fun updateIfStale(context: Context) {
        ensureLoaded(context)
        val updatedAt = prefs(context).getLong("updatedAt", 0)
        if (System.currentTimeMillis() - updatedAt > MAX_AGE_MS && !updating) executor.execute { update(context) }
    }

    /** Downloads every source and replaces the list if at least one worked. Blocking; returns the new status. */
    fun update(context: Context): JSONObject {
        synchronized(this) {
            if (updating) return status(context)
            updating = true
        }
        try {
            val fresh = HashSet<String>(40_000)
            var worked = 0
            var error: String? = null
            for (source in SOURCES) {
                try {
                    val before = fresh.size
                    download(source) { line -> parse(line)?.let { fresh += it } }
                    if (fresh.size > before) worked += 1
                } catch (e: Exception) {
                    Log.w(TAG, "could not download $source", e)
                    error = e.message ?: e.javaClass.simpleName
                }
            }
            if (worked == 0 || fresh.isEmpty()) {
                lastError = "Could not download the threat list (${error ?: "empty response"}). Check the internet connection."
                return status(context)
            }
            val file = File(context.filesDir, FILE_NAME)
            val temp = File(context.filesDir, "$FILE_NAME.tmp")
            temp.writeText(fresh.joinToString("\n"))
            temp.renameTo(file)
            domains = fresh
            loaded = true
            lastError = if (worked < SOURCES.size) "Part of the threat list could not be downloaded ($error)." else null
            prefs(context).edit().putLong("updatedAt", System.currentTimeMillis()).putInt("count", fresh.size).apply()
            return status(context)
        } finally {
            updating = false
        }
    }

    fun status(context: Context): JSONObject = JSONObject()
        .put("count", if (loaded) domains.size else prefs(context).getInt("count", 0))
        .put("updatedAt", prefs(context).getLong("updatedAt", 0))
        .put("updating", updating)
        .put("error", lastError ?: JSONObject.NULL)

    /** Hosts-file ("0.0.0.0 bad.example") or plain-list lines -> a domain, or null. */
    internal fun parse(line: String): String? {
        val trimmed = line.substringBefore('#').trim()
        if (trimmed.isEmpty()) return null
        val parts = trimmed.split(Regex("\\s+"))
        val candidate = (if (parts.size >= 2 && (parts[0] == "0.0.0.0" || parts[0] == "127.0.0.1")) parts[1] else parts[0]).lowercase().trimEnd('.')
        return candidate.takeIf { DOMAIN.matches(it) && it != "localhost" }
    }

    private fun download(source: String, onLine: (String) -> Unit) {
        val connection = URL(source).openConnection() as HttpURLConnection
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        connection.setRequestProperty("User-Agent", "Satark/2.4 (in.satark.shield)")
        try {
            if (connection.responseCode !in 200..299) throw IllegalStateException("HTTP ${connection.responseCode}")
            connection.inputStream.bufferedReader().useLines { lines -> lines.forEach(onLine) }
        } finally {
            connection.disconnect()
        }
    }

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
