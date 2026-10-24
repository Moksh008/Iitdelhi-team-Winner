package `in`.satark.shield

import org.json.JSONObject
import java.text.Normalizer
import java.util.Locale

/**
 * On-device deterministic scam rules. Kotlin twin of src/engine/localAnalyzer.js:
 * both load shared/scam-lexicon.json and are tested against
 * shared/scam-rule-vectors.json (see SatarkRulesTest).
 */
class SatarkRules(lexiconJson: String) {

    data class Indicator(val cluster: String, val label: String, val terms: List<String>)

    data class Result(
        val actionTier: Int,
        val riskLevel: String,
        val conversationScore: Double,
        val chunkScore: Double,
        val category: String?,
        val title: String?,
        val advice: String?,
        val indicators: List<Indicator>,
        val ambiguous: Boolean,
    )

    private data class Term(val raw: String, val words: List<String>, val prefix: Boolean)
    private data class Cluster(val name: String, val label: String, val solo: Double, val terms: List<Term>)
    private data class Rule(val id: String, val all: List<String>, val any: List<String>?, val score: Double)
    private data class Category(val title: String, val advice: String)
    private data class Score(val score: Double, val category: String?)
    private class Cue(val terms: LinkedHashSet<String>, var lastSeen: Long)

    val nudgeThreshold: Double
    private val windowMillis: Long
    private val clusters: Map<String, Cluster>
    private val rules: List<Rule>
    private val categories: Map<String, Category>

    init {
        val root = JSONObject(lexiconJson)
        nudgeThreshold = root.getDouble("nudge_threshold")
        windowMillis = root.getLong("session_window_seconds") * 1000
        val clusterJson = root.getJSONObject("clusters")
        clusters = linkedMapOf<String, Cluster>().apply {
            for (name in clusterJson.keys()) {
                val c = clusterJson.getJSONObject(name)
                val terms = c.getJSONArray("terms")
                put(name, Cluster(
                    name,
                    c.getString("label"),
                    c.getDouble("solo"),
                    (0 until terms.length()).map { compileTerm(terms.getString(it)) },
                ))
            }
        }
        val ruleJson = root.getJSONArray("rules")
        rules = (0 until ruleJson.length()).map { i ->
            val r = ruleJson.getJSONObject(i)
            val all = r.getJSONArray("all")
            val any = r.optJSONArray("any")
            Rule(
                r.getString("id"),
                (0 until all.length()).map { all.getString(it) },
                any?.let { a -> (0 until a.length()).map { a.getString(it) } },
                r.getDouble("score"),
            )
        }
        val catJson = root.getJSONObject("categories")
        categories = catJson.keys().asSequence().associateWith { key ->
            val c = catJson.getJSONObject(key)
            Category(c.getString("title"), c.getString("advice"))
        }
    }

    private fun compileTerm(term: String): Term =
        Term(term, normalizeWords(term.removeSuffix("*")), term.endsWith("*"))

    private fun matchesAt(words: List<String>, index: Int, term: Term): Boolean {
        if (term.words.isEmpty() || index + term.words.size > words.size) return false
        for (k in term.words.indices) {
            val word = words[index + k]
            val isLast = k == term.words.size - 1
            val ok = if (isLast && term.prefix) word.startsWith(term.words[k]) else word == term.words[k]
            if (!ok) return false
        }
        return true
    }

    fun matchClusters(text: String): Map<String, List<String>> {
        val words = normalizeWords(text)
        val found = linkedMapOf<String, MutableList<String>>()
        for (cluster in clusters.values) {
            for (term in cluster.terms) {
                if (words.indices.any { matchesAt(words, it, term) }) {
                    found.getOrPut(cluster.name) { mutableListOf() }.add(term.raw)
                }
            }
        }
        return found
    }

    private fun score(present: Set<String>): Score {
        var best = Score(0.0, null)
        var ruleMatched = false
        for (rule in rules) {
            val allOk = rule.all.all { it in present }
            val anyOk = rule.any == null || rule.any.any { it in present }
            if (allOk && anyOk && rule.score > best.score) {
                best = Score(rule.score, rule.id)
                ruleMatched = true
            }
        }
        if (!ruleMatched) {
            for (name in present) {
                val solo = clusters[name]?.solo ?: 0.0
                if (solo > best.score) best = Score(solo, if (solo >= nudgeThreshold) "advisory" else null)
            }
        }
        return best
    }

    /** One call. Cues expire after the shared session window. */
    inner class Session(private val clock: () -> Long = System::currentTimeMillis) {
        private val cues = linkedMapOf<String, Cue>()

        fun reset() = cues.clear()

        fun ingest(text: String): Result {
            val now = clock()
            val matched = matchClusters(text)
            for ((name, terms) in matched) {
                val cue = cues.getOrPut(name) { Cue(LinkedHashSet(), now) }
                cue.terms.addAll(terms)
                cue.lastSeen = now
            }
            cues.entries.removeAll { now - it.value.lastSeen > windowMillis }
            val chunk = score(matched.keys)
            val session = score(cues.keys)
            val tier = if (session.score >= nudgeThreshold) 1 else 0
            val indicators = cues.map { (name, cue) -> Indicator(name, clusters.getValue(name).label, cue.terms.take(4)) }
            val info = session.category?.let { categories[it] }
            return Result(
                actionTier = tier,
                riskLevel = when {
                    tier == 1 && session.score >= 0.85 -> "high"
                    tier == 1 -> "caution"
                    indicators.isNotEmpty() -> "low"
                    else -> "insufficient_evidence"
                },
                conversationScore = round3(session.score),
                chunkScore = round3(chunk.score),
                category = session.category,
                title = info?.title,
                advice = info?.advice,
                indicators = indicators,
                ambiguous = tier == 0 && indicators.isNotEmpty(),
            )
        }
    }

    companion object {
        private val NON_WORD = Regex("[^\\p{L}\\p{M}\\p{N}]+")

        fun normalizeWords(text: String): List<String> =
            Normalizer.normalize(text.lowercase(Locale.ROOT), Normalizer.Form.NFC)
                .replace(NON_WORD, " ")
                .trim()
                .split(' ')
                .filter { it.isNotEmpty() }

        private fun round3(value: Double) = Math.round(value * 1000) / 1000.0
    }
}
