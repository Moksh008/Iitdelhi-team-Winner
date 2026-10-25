package `in`.satark.shield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class DnsShieldTest {

    private val rules = ScamDomainRules(File("../../shared/scam-domains.json").takeIf { it.exists() }?.readText()
        ?: File("../shared/scam-domains.json").readText())

    /** A DNS query for [name] (type A), as an app would send it. */
    private fun query(name: String, id: Int = 0x1234): ByteArray {
        val out = java.io.ByteArrayOutputStream()
        out.write(byteArrayOf((id ushr 8).toByte(), id.toByte(), 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0))
        name.split('.').forEach { label -> out.write(label.length); out.write(label.toByteArray()) }
        out.write(byteArrayOf(0, 0, 1, 0, 1))
        return out.toByteArray()
    }

    @Test
    fun readsTheQuestionOfAQuery() {
        assertEquals(DnsPacket.Question("sbi-kyc-update.com", 1), DnsPacket.readQuestion(query("SBI-KYC-update.com")))
        assertNull(DnsPacket.readQuestion(byteArrayOf(1, 2, 3)))
    }

    @Test
    fun nxdomainKeepsIdAndQuestion() {
        val q = query("bad.example", 0xBEEF)
        val answer = DnsPacket.nxdomain(q)
        assertEquals(0xBE.toByte(), answer[0])
        assertEquals(0xEF.toByte(), answer[1])
        assertTrue((answer[2].toInt() and 0x80) != 0) // a response
        assertEquals(3, answer[3].toInt() and 0x0F) // NXDOMAIN
        assertEquals(q.size, answer.size)
        assertNull(DnsPacket.readQuestion(answer)) // responses are not read as queries
    }

    @Test
    fun wrapsAndReadsBackAnIpv4UdpPacket() {
        val payload = query("example.com")
        val packet = DnsPacket.ipv4Udp("10.111.222.1", 40000, DnsShieldService.TUN_DNS, 53, payload)
        val flow = DnsPacket.readFlow(packet, packet.size)
        assertNotNull(flow)
        flow!!
        assertEquals(DnsPacket.PROTO_UDP, flow.protocol)
        assertEquals("10.111.222.1", flow.srcIp)
        assertEquals(40000, flow.srcPort)
        assertEquals(DnsShieldService.TUN_DNS, flow.dstIp)
        assertEquals(53, flow.dstPort)
        assertEquals(payload.toList(), packet.copyOfRange(flow.payloadOffset, flow.payloadOffset + flow.payloadLength).toList())
        // A valid IPv4 header sums to 0xFFFF.
        var sum = 0
        for (i in 0 until 20 step 2) sum += ((packet[i].toInt() and 0xFF) shl 8) or (packet[i + 1].toInt() and 0xFF)
        while (sum ushr 16 != 0) sum = (sum and 0xFFFF) + (sum ushr 16)
        assertEquals(0xFFFF, sum)
    }

    @Test
    fun blocksBankLookalikesAndListedDomains() {
        for (domain in listOf("sbi-kyc-update.com", "hdfc-reward-points.in", "www.paytmcashback.xyz", "yono-sbi-verify.co.in", "satark-scam-test.in", "m.satark-scam-test.in")) {
            assertTrue(domain, rules.check(domain).blocked)
        }
    }

    @Test
    fun blocksTypoSquatsAndFakeShoppingSites() {
        for (domain in listOf("hdfc-bank.com", "icicbank.com", "flipkarrt.com", "amaz0n.in", "paytrn.co", "amazon-diwali-offer.xyz", "flipkart-bigbillion-sale.in", "myntra-free-gift.top", "amaz0n-offer.in", "5bi-kyc.top")) {
            val verdict = rules.check(domain)
            assertTrue("$domain: $verdict", verdict.blocked)
        }
        assertEquals(ScamDomainRules.REASON_TYPOSQUAT, rules.check("hdfc-bank.com").reason)
    }

    @Test
    fun threatFeedAndShorteners() {
        val feed = setOf("evil-login.weebly.com", "bad.top")
        assertTrue(rules.check("evil-login.weebly.com") { d -> generateSequence(d) { it.substringAfter('.', "").ifEmpty { null } }.any { it in feed } }.blocked)
        assertEquals(ScamDomainRules.REASON_FEED, rules.check("www.bad.top") { d -> d == "www.bad.top" }.reason)
        assertFalse(rules.check("weebly.com") { it in feed }.blocked)
        assertFalse(rules.check("hdfcbank.com") { true }.blocked) // official sites always win
        assertTrue(rules.isShortener("bit.ly"))
        assertFalse(rules.isShortener("example.com"))
        assertEquals("bad.example", ThreatFeed.parse("0.0.0.0 Bad.Example"))
        assertEquals("plain.example", ThreatFeed.parse("plain.example # comment"))
        assertNull(ThreatFeed.parse("# just a comment"))
        assertNull(ThreatFeed.parse("0.0.0.0 localhost"))
    }

    @Test
    fun neverBlocksOfficialOrOrdinaryDomains() {
        for (domain in listOf("onlinesbi.sbi", "retail.onlinesbi.sbi", "hdfcbank.com", "netbanking.hdfcbank.com", "paytm.com", "www.incometax.gov.in",
            "google.com", "wikipedia.org", "sbi.co.in", "hdfccareers.com", "kyc.example.com", "lesbiannews.com", "example.com",
            "amazon.co.uk", "flipkartwholesale.com", "www.amazon.in", "m.media-amazon.com", "kodak.com", "hdfclife.com", "icicidirect.com", "sbicard.com",
            "paytmmall.com", "bit.ly", "github.com", "flipkart.com")) {
            assertFalse(domain, rules.check(domain).blocked)
        }
    }
}
