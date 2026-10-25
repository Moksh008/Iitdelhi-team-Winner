package `in`.satark.shield

import android.content.Context
import android.net.ConnectivityManager
import android.os.Build
import android.os.Process
import java.net.InetSocketAddress

/**
 * Tells which app (Linux uid) sent a packet that arrived in the shield's
 * tunnel, using Android's ConnectivityManager.getConnectionOwnerUid
 * (Android 10+). Older phones report "unknown".
 */
class ConnectionOwner(context: Context) {

    private val connectivity = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    /** The owner's uid, or [UNKNOWN]. Call from a worker thread. */
    fun uidOf(protocol: Int, srcIp: String, srcPort: Int, dstIp: String, dstPort: Int): Int {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return UNKNOWN
        if (protocol != DnsPacket.PROTO_TCP && protocol != DnsPacket.PROTO_UDP) return UNKNOWN
        val local = address(srcIp, srcPort) ?: return UNKNOWN
        // A UDP socket that never called connect() is registered without a remote end,
        // so if the exact lookup fails, ask again with a wildcard remote address.
        val attempts = buildList {
            address(dstIp, dstPort)?.let { add(it) }
            if (protocol == DnsPacket.PROTO_UDP) address(if (dstIp.contains(':')) "::" else "0.0.0.0", 0)?.let { add(it) }
        }
        for (remote in attempts) {
            val uid = try {
                connectivity.getConnectionOwnerUid(protocol, local, remote)
            } catch (_: Exception) {
                UNKNOWN
            }
            if (uid != UNKNOWN) return uid
        }
        return UNKNOWN
    }

    private fun address(ip: String, port: Int): InetSocketAddress? = try {
        InetSocketAddress(ip, port)
    } catch (_: Exception) {
        null
    }

    companion object {
        const val UNKNOWN = Process.INVALID_UID
    }
}
