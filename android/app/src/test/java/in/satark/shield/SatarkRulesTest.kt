package `in`.satark.shield

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/** Runs the same parity vectors as tests/localAnalyzer.test.mjs against the Kotlin rules. */
class SatarkRulesTest {
    private val shared = File("../../shared").takeIf { it.isDirectory } ?: File("../shared")
    private val rules = SatarkRules(File(shared, "scam-lexicon.json").readText())

    @Test
    fun sharedVectorsMatch() {
        val cases = JSONObject(File(shared, "scam-rule-vectors.json").readText()).getJSONArray("cases")
        for (i in 0 until cases.length()) {
            val case = cases.getJSONObject(i)
            val name = case.getString("name")
            val session = rules.Session()
            val utterances = case.getJSONArray("session")
            var result: SatarkRules.Result? = null
            for (u in 0 until utterances.length()) result = session.ingest(utterances.getString(u))
            val expectedClusters = case.getJSONArray("clusters").let { a -> (0 until a.length()).map { a.getString(it) }.sorted() }
            assertEquals(name, expectedClusters, result!!.indicators.map { it.cluster }.sorted())
            assertEquals(name, if (case.isNull("category")) null else case.getString("category"), result.category)
            assertEquals(name, case.getInt("tier"), result.actionTier)
            assertEquals(name, case.getDouble("score"), result.conversationScore, 1e-9)
        }
    }

    @Test
    fun cuesExpireAfterWindow() {
        var now = 0L
        val session = rules.Session { now }
        session.ingest("this is the crime branch inspector")
        now += 11 * 60 * 1000
        assertEquals(0, session.ingest("paise bhej do").actionTier)
    }
}
