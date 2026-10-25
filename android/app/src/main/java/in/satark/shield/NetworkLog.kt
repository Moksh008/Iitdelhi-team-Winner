package `in`.satark.shield

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Per-app network log kept only on this phone: which app looked up which
 * domain (or, while the remote-access lock is on, tried to connect where) and
 * whether Satark let it through. The same app + target within a minute is
 * counted on one line instead of adding a new one.
 */
class NetworkLog(context: Context) {

    data class Entry(
        val time: Long,
        val uid: Int,
        val packageName: String,
        val app: String,
        val target: String,
        val kind: String, // "dns" | "connection"
        val action: String, // "allowed" | "blocked"
        val reason: String?,
        val detail: String?,
        var count: Int = 1,
        var lastTime: Long = time,
    ) {
        fun toJson(): JSONObject = JSONObject()
            .put("time", time).put("lastTime", lastTime).put("uid", uid).put("packageName", packageName).put("app", app)
            .put("target", target).put("kind", kind).put("action", action).put("reason", reason ?: JSONObject.NULL)
            .put("detail", detail ?: JSONObject.NULL).put("count", count)
    }

    private val file = File(context.filesDir, "network-log.json")
    private val entries = ArrayDeque<Entry>()
    @Volatile var checked = 0L
        private set
    @Volatile var blocked = 0L
        private set
    private var dirty = false

    init {
        load()
    }

    @Synchronized
    fun add(entry: Entry) {
        checked += 1
        if (entry.action == "blocked") blocked += 1
        val recent = entries.firstOrNull {
            it.uid == entry.uid && it.target == entry.target && it.action == entry.action && entry.time - it.lastTime < MERGE_WINDOW_MS
        }
        if (recent != null) {
            recent.count += 1
            recent.lastTime = entry.time
        } else {
            entries.addFirst(entry)
            while (entries.size > MAX_ENTRIES) entries.removeLast()
        }
        dirty = true
    }

    @Synchronized
    fun toJson(blockedOnly: Boolean, limit: Int): JSONArray {
        val out = JSONArray()
        entries.asSequence().filter { !blockedOnly || it.action == "blocked" }.take(limit).forEach { out.put(it.toJson()) }
        return out
    }

    @Synchronized
    fun clear() {
        entries.clear()
        checked = 0
        blocked = 0
        dirty = true
        save()
    }

    /** Writes the log to app-private storage if it changed. */
    @Synchronized
    fun save() {
        if (!dirty) return
        dirty = false
        try {
            val array = JSONArray()
            entries.forEach { array.put(it.toJson()) }
            file.writeText(JSONObject().put("checked", checked).put("blocked", blocked).put("entries", array).toString())
        } catch (_: Exception) {
            // Best effort: the log is a convenience, not a record anyone depends on.
        }
    }

    private fun load() {
        try {
            if (!file.exists()) return
            val root = JSONObject(file.readText())
            checked = root.optLong("checked")
            blocked = root.optLong("blocked")
            val array = root.optJSONArray("entries") ?: return
            for (i in 0 until array.length()) {
                val o = array.getJSONObject(i)
                entries.addLast(Entry(
                    time = o.optLong("time"), uid = o.optInt("uid"), packageName = o.optString("packageName"), app = o.optString("app"),
                    target = o.optString("target"), kind = o.optString("kind"), action = o.optString("action"),
                    reason = o.optString("reason").takeIf { !o.isNull("reason") && it.isNotEmpty() },
                    detail = o.optString("detail").takeIf { !o.isNull("detail") && it.isNotEmpty() },
                    count = o.optInt("count", 1), lastTime = o.optLong("lastTime", o.optLong("time")),
                ))
            }
        } catch (_: Exception) {
            entries.clear()
        }
    }

    companion object {
        private const val MAX_ENTRIES = 400
        private const val MERGE_WINDOW_MS = 60_000L
    }
}
