package `in`.satark.shield

import org.json.JSONObject

/**
 * Decides whether a looked-up domain is dangerous, using shared/scam-domains.json
 * (the web app's src/engine/linkRules.js applies the same file the same way):
 *  - "blocked": known scam domains (the domain or any subdomain of it),
 *  - the downloaded threat-intelligence list (ThreatFeed), when given,
 *  - look-alikes: a label names a bank / payment / shopping brand ("sbi",
 *    "hdfc", "flipkart"...) and the domain also uses a bait word ("kyc",
 *    "reward", "offer"...), but it is not under an official domain,
 *  - typo-squats: the name is an official brand name with one letter changed,
 *    digits for letters or an extra hyphen ("hdfc-bank.com", "amaz0n.in").
 * Official domains are never blocked. Pure Kotlin so it can be unit-tested.
 */
class ScamDomainRules(json: String) {

    data class Verdict(val blocked: Boolean, val reason: String? = null, val detail: String? = null)

    private val blocked: Set<String>
    private val official: Set<String>
    private val wholeBrands: Set<String>
    private val partBrands: List<String>
    private val bait: List<String>
    private val shorteners: Set<String>
    /** Names of official sites ("hdfcbank", "flipkart") that typo-squats imitate. */
    private val brandNames: Set<String>

    init {
        val root = JSONObject(json)
        fun strings(key: String, from: JSONObject = root) =
            from.optJSONArray(key)?.let { array -> (0 until array.length()).map { array.getString(it).lowercase() } }.orEmpty()
        blocked = strings("blocked").toSet()
        official = strings("official").toSet()
        val brands = root.optJSONObject("brands") ?: JSONObject()
        wholeBrands = strings("whole", brands).toSet()
        partBrands = strings("part", brands)
        bait = strings("bait")
        shorteners = strings("shorteners").toSet()
        brandNames = official.mapNotNull { domain -> siteName(domain).takeIf { it.length >= 5 && it !in GENERIC_NAMES } }.toSet()
    }

    /** True for link shorteners (bit.ly...), which hide where a link really goes. */
    fun isShortener(rawDomain: String) = underAny(normalize(rawDomain), shorteners)

    fun isOfficial(rawDomain: String) = underAny(normalize(rawDomain), official)

    fun check(rawDomain: String, inThreatFeed: ((String) -> Boolean)? = null): Verdict {
        val domain = normalize(rawDomain)
        if (domain.isEmpty() || !domain.contains('.')) return Verdict(false)
        if (underAny(domain, official)) return Verdict(false)
        if (underAny(domain, blocked)) return Verdict(true, REASON_LISTED, "is on Satark's scam-domain list")
        if (inThreatFeed?.invoke(domain) == true) return Verdict(true, REASON_FEED, "is reported as a phishing or malware site")

        // Words of every label except the top-level domain ("sbi-kyc-update.co.in" -> sbi, kyc, update, co).
        val labels = domain.split('.')
        val words = labels.dropLast(1).flatMap { it.split('-', '_') }.filter { it.isNotEmpty() }
        val joined = labels.dropLast(1).joinToString("")
        // Also look through disguises ("amaz0n", "5bi") when finding the brand.
        val foldedJoined = fold(joined)
        val brand = words.firstOrNull { it in wholeBrands || fold(it) in wholeBrands }?.let { fold(it) }
            ?: partBrands.firstOrNull { joined.contains(it) || foldedJoined.contains(it) }
        if (brand != null) {
            val baitWord = bait.firstOrNull { b -> b != brand && words.any { it == b } || (b.length >= 5 && foldedJoined.replace(brand, "").contains(b)) }
            if (baitWord != null) {
                return Verdict(true, REASON_LOOKALIKE, "uses the name \"$brand\" but is not an official $brand site (and says \"$baitWord\")")
            }
        }

        val name = siteName(domain)
        val squatted = typoSquatOf(name)
        if (squatted != null) return Verdict(true, REASON_TYPOSQUAT, "imitates the official \"$squatted\" site name")
        return Verdict(false)
    }

    private fun typoSquatOf(name: String): String? {
        if (name.length < 5 || name in brandNames) return null
        val folded = fold(name)
        for (brandName in brandNames) {
            if (folded == brandName) return brandName
            if (brandName.length >= 7 && kotlin.math.abs(folded.length - brandName.length) <= 1 && editDistance(folded, brandName) == 1) return brandName
        }
        return null
    }

    private fun underAny(domain: String, suffixes: Set<String>): Boolean {
        var candidate = domain
        while (true) {
            if (candidate in suffixes) return true
            val dot = candidate.indexOf('.')
            if (dot < 0) return false
            candidate = candidate.substring(dot + 1)
        }
    }

    companion object {
        const val REASON_LISTED = "scam_link"
        const val REASON_FEED = "threat_feed"
        const val REASON_LOOKALIKE = "lookalike"
        const val REASON_TYPOSQUAT = "typosquat"

        private val SECOND_LEVEL = setOf("co", "com", "net", "org", "gov", "ac", "edu", "res", "gen", "firm", "ind", "nic")
        private val GENERIC_NAMES = setOf("google", "gstatic", "googleapis")
        private val DIGITS = mapOf('0' to 'o', '1' to 'l', '3' to 'e', '4' to 'a', '5' to 's', '7' to 't', '8' to 'b', '9' to 'g')

        fun normalize(raw: String) = raw.trim().trimEnd('.').lowercase()

        /** The name people recognise: "netbanking.hdfcbank.co.in" -> "hdfcbank". */
        fun siteName(domain: String): String {
            val labels = domain.split('.')
            return when {
                labels.size >= 3 && labels[labels.size - 2] in SECOND_LEVEL -> labels[labels.size - 3]
                labels.size >= 2 -> labels[labels.size - 2]
                else -> labels[0]
            }
        }

        /** Undoes common disguises: hyphens, digits for letters, "rn" for "m", "vv" for "w". */
        private fun fold(name: String) =
            name.replace("-", "").map { DIGITS[it] ?: it }.joinToString("").replace("rn", "m").replace("vv", "w")

        private fun editDistance(a: String, b: String): Int {
            val row = IntArray(b.length + 1) { it }
            for (i in 1..a.length) {
                var previous = row[0]
                row[0] = i
                for (j in 1..b.length) {
                    val temp = row[j]
                    row[j] = minOf(row[j] + 1, row[j - 1] + 1, previous + if (a[i - 1] == b[j - 1]) 0 else 1)
                    previous = temp
                }
            }
            return row[b.length]
        }
    }
}
