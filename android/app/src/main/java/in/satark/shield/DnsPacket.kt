package `in`.satark.shield

import java.net.InetAddress

/**
 * Minimal IP / UDP / DNS packet handling for the web shield's tunnel. Only
 * what the shield needs: read the addresses of a packet, read the question of
 * a DNS query, build a "no such domain" answer, and wrap a DNS answer back
 * into an IPv4/UDP packet for the app that asked.
 */
object DnsPacket {
    const val PROTO_TCP = 6
    const val PROTO_UDP = 17

    /** Addresses of one packet read from the tunnel. */
    data class Flow(
        val version: Int,
        val protocol: Int,
        val srcIp: String,
        val srcPort: Int,
        val dstIp: String,
        val dstPort: Int,
        val payloadOffset: Int,
        val payloadLength: Int,
    )

    data class Question(val name: String, val type: Int)

    fun readFlow(packet: ByteArray, length: Int): Flow? {
        if (length < 1) return null
        return when ((packet[0].toInt() ushr 4) and 0xF) {
            4 -> readIpv4(packet, length)
            6 -> readIpv6(packet, length)
            else -> null
        }
    }

    private fun readIpv4(p: ByteArray, length: Int): Flow? {
        if (length < 20) return null
        val ihl = (p[0].toInt() and 0xF) * 4
        val total = u16(p, 2).coerceAtMost(length)
        if (ihl < 20 || total < ihl) return null
        val protocol = p[9].toInt() and 0xFF
        val src = InetAddress.getByAddress(p.copyOfRange(12, 16)).hostAddress!!
        val dst = InetAddress.getByAddress(p.copyOfRange(16, 20)).hostAddress!!
        return withPorts(4, protocol, src, dst, p, ihl, total)
    }

    private fun readIpv6(p: ByteArray, length: Int): Flow? {
        if (length < 40) return null
        val protocol = p[6].toInt() and 0xFF // extension headers are rare for app traffic; treated as "other"
        val total = (40 + u16(p, 4)).coerceAtMost(length)
        val src = InetAddress.getByAddress(p.copyOfRange(8, 24)).hostAddress!!
        val dst = InetAddress.getByAddress(p.copyOfRange(24, 40)).hostAddress!!
        return withPorts(6, protocol, src, dst, p, 40, total)
    }

    private fun withPorts(version: Int, protocol: Int, src: String, dst: String, p: ByteArray, offset: Int, total: Int): Flow {
        if ((protocol == PROTO_UDP || protocol == PROTO_TCP) && total >= offset + 4) {
            val headerLength = if (protocol == PROTO_UDP) 8 else ((p.getOrElse(offset + 12) { 0x50 }.toInt() ushr 4) and 0xF) * 4
            val payloadOffset = (offset + headerLength).coerceAtMost(total)
            return Flow(version, protocol, src, u16(p, offset), dst, u16(p, offset + 2), payloadOffset, total - payloadOffset)
        }
        return Flow(version, protocol, src, 0, dst, 0, total, 0)
    }

    /** The first question of a DNS message, or null if it is not a well-formed query. */
    fun readQuestion(dns: ByteArray): Question? {
        if (dns.size < 12) return null
        val isResponse = (dns[2].toInt() and 0x80) != 0
        if (isResponse || u16(dns, 4) < 1) return null
        val labels = mutableListOf<String>()
        var i = 12
        while (true) {
            if (i >= dns.size) return null
            val len = dns[i].toInt() and 0xFF
            if (len == 0) { i += 1; break }
            if (len and 0xC0 != 0 || i + 1 + len > dns.size || labels.size > 127) return null // no compression in questions
            labels += String(dns, i + 1, len, Charsets.US_ASCII).lowercase()
            i += 1 + len
        }
        if (i + 4 > dns.size) return null
        return Question(labels.joinToString("."), u16(dns, i))
    }

    /** "No such domain" answer to a query: same id and question, no records. */
    fun nxdomain(query: ByteArray): ByteArray {
        val questionEnd = questionEnd(query)
        val out = query.copyOf(questionEnd)
        out[2] = (0x80 or (query[2].toInt() and 0x79)).toByte() // QR=1, keep opcode and RD
        out[3] = (0x80 or 0x03).toByte() // RA=1, RCODE=NXDOMAIN
        // One question, no answer / authority / additional records.
        out[4] = 0; out[5] = 1
        for (k in 6 until 12) out[k] = 0
        return out
    }

    private fun questionEnd(dns: ByteArray): Int {
        var i = 12
        while (i < dns.size && dns[i].toInt() != 0) i += 1 + (dns[i].toInt() and 0xFF)
        return (i + 5).coerceAtMost(dns.size)
    }

    /** IPv4/UDP packet carrying [payload] from src to dst, with valid checksums. */
    fun ipv4Udp(srcIp: String, srcPort: Int, dstIp: String, dstPort: Int, payload: ByteArray): ByteArray {
        val src = InetAddress.getByName(srcIp).address
        val dst = InetAddress.getByName(dstIp).address
        val total = 28 + payload.size
        val p = ByteArray(total)
        p[0] = 0x45
        put16(p, 2, total)
        p[6] = 0x40 // don't fragment
        p[8] = 64 // TTL
        p[9] = PROTO_UDP.toByte()
        System.arraycopy(src, 0, p, 12, 4)
        System.arraycopy(dst, 0, p, 16, 4)
        put16(p, 10, checksum(p, 0, 20, 0))
        put16(p, 20, srcPort)
        put16(p, 22, dstPort)
        put16(p, 24, 8 + payload.size)
        System.arraycopy(payload, 0, p, 28, payload.size)
        // UDP checksum over the pseudo-header + UDP header + data.
        var pseudo = 0L
        for (k in 0 until 4 step 2) {
            pseudo += ((src[k].toInt() and 0xFF) shl 8) or (src[k + 1].toInt() and 0xFF)
            pseudo += ((dst[k].toInt() and 0xFF) shl 8) or (dst[k + 1].toInt() and 0xFF)
        }
        pseudo += PROTO_UDP + 8 + payload.size
        val udpSum = checksum(p, 20, 8 + payload.size, pseudo)
        put16(p, 26, if (udpSum == 0) 0xFFFF else udpSum)
        return p
    }

    private fun checksum(data: ByteArray, offset: Int, length: Int, initial: Long): Int {
        var sum = initial
        var i = offset
        while (i + 1 < offset + length) {
            sum += ((data[i].toInt() and 0xFF) shl 8) or (data[i + 1].toInt() and 0xFF)
            i += 2
        }
        if (i < offset + length) sum += (data[i].toInt() and 0xFF) shl 8
        while (sum ushr 16 != 0L) sum = (sum and 0xFFFF) + (sum ushr 16)
        return (sum.inv() and 0xFFFF).toInt()
    }

    private fun u16(b: ByteArray, i: Int) = ((b[i].toInt() and 0xFF) shl 8) or (b[i + 1].toInt() and 0xFF)

    private fun put16(b: ByteArray, i: Int, v: Int) {
        b[i] = (v ushr 8).toByte()
        b[i + 1] = v.toByte()
    }
}
