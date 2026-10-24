package `in`.satark.shield

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.StatFs
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Downloads and verifies the optional on-device language model once, then
 * keeps it in app-private storage. The download is a plain file transfer from
 * Hugging Face's public model repository; no inference ever happens remotely.
 */
object ModelManager {
    /** Qwen3-0.6B, Q8_0 GGUF from the official Qwen repository (Apache-2.0). */
    object Llm {
        const val FILE_NAME = "Qwen3-0.6B-Q8_0.gguf"
        const val REVISION = "23749fefcc72300e3a2ad315e1317431b06b590a"
        const val URL = "https://huggingface.co/Qwen/Qwen3-0.6B-GGUF/resolve/$REVISION/$FILE_NAME"
        const val SHA256 = "9465e63a22add5354d9bb4b99e90117043c7124007664907259bd16d043bb031"
        const val SIZE_BYTES = 639_446_688L
        /** Devices below this total RAM are treated as unsupported (3 GB phones report ~2.7 GB). */
        const val MIN_TOTAL_RAM = 2_500_000_000L
    }

    enum class State { NOT_INSTALLED, DOWNLOADING, VERIFYING, READY, FAILED, UNSUPPORTED }

    data class Status(val state: State, val bytesDownloaded: Long, val totalBytes: Long, val detail: String?)

    private val executor = Executors.newSingleThreadExecutor()
    private val cancelRequested = AtomicBoolean(false)
    @Volatile private var state: State? = null
    @Volatile private var bytesDownloaded = 0L
    @Volatile private var detail: String? = null

    fun modelDir(context: Context) = File(context.filesDir, "models").apply { mkdirs() }
    fun llmFile(context: Context) = File(modelDir(context), Llm.FILE_NAME)
    private fun partFile(context: Context) = File(modelDir(context), Llm.FILE_NAME + ".part")
    private fun okMarker(context: Context) = File(modelDir(context), Llm.FILE_NAME + ".verified")

    fun totalRam(context: Context): Long {
        val info = ActivityManager.MemoryInfo()
        (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
        return info.totalMem
    }

    fun availableRam(context: Context): Pair<Long, Boolean> {
        val info = ActivityManager.MemoryInfo()
        (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(info)
        return info.availMem to info.lowMemory
    }

    fun deviceSupportsLlm(context: Context): Boolean =
        Build.SUPPORTED_64_BIT_ABIS.contains("arm64-v8a") && totalRam(context) >= Llm.MIN_TOTAL_RAM

    fun isLlmReady(context: Context): Boolean {
        val file = llmFile(context)
        return file.length() == Llm.SIZE_BYTES && okMarker(context).readTextOrNull() == Llm.SHA256
    }

    fun status(context: Context): Status {
        val current = state ?: when {
            !deviceSupportsLlm(context) -> State.UNSUPPORTED
            isLlmReady(context) -> State.READY
            else -> State.NOT_INSTALLED
        }
        val downloaded = if (current == State.DOWNLOADING) bytesDownloaded else partFile(context).length()
        return Status(current, downloaded, Llm.SIZE_BYTES, detail ?: if (current == State.UNSUPPORTED)
            "needs a 64-bit ARM phone with at least 3 GB RAM" else null)
    }

    /** Starts (or resumes) the download on a background thread. */
    fun startDownload(context: Context, onProgress: (Status) -> Unit) {
        val app = context.applicationContext
        if (state == State.DOWNLOADING || state == State.VERIFYING || isLlmReady(app)) return
        if (!deviceSupportsLlm(app)) {
            onProgress(status(app))
            return
        }
        cancelRequested.set(false)
        state = State.DOWNLOADING
        detail = null
        executor.execute {
            try {
                download(app, onProgress)
                state = State.VERIFYING
                onProgress(status(app))
                val digest = sha256(partFile(app))
                if (digest != Llm.SHA256) {
                    partFile(app).delete()
                    throw IOException("checksum mismatch; the partial file was discarded")
                }
                llmFile(app).delete()
                if (!partFile(app).renameTo(llmFile(app))) throw IOException("could not finalise the model file")
                okMarker(app).writeText(Llm.SHA256)
                state = null
                detail = null
            } catch (error: CancelledException) {
                state = null
                detail = null
            } catch (error: Exception) {
                Log.w("SatarkModel", "download failed", error)
                state = State.FAILED
                detail = error.message ?: error.javaClass.simpleName
            }
            onProgress(status(app))
        }
    }

    fun cancelDownload() = cancelRequested.set(true)

    fun deleteLlm(context: Context) {
        cancelRequested.set(true)
        AlertExplainer.release()
        listOf(llmFile(context), partFile(context), okMarker(context)).forEach { it.delete() }
        state = null
        detail = null
    }

    private class CancelledException : Exception()

    private fun download(context: Context, onProgress: (Status) -> Unit) {
        val part = partFile(context)
        var offset = part.length().coerceAtMost(Llm.SIZE_BYTES)
        val free = StatFs(modelDir(context).path).availableBytes
        if (free < Llm.SIZE_BYTES - offset + 100_000_000L) {
            throw IOException("not enough free storage (need about ${(Llm.SIZE_BYTES - offset) / 1_000_000 + 100} MB)")
        }
        if (offset == Llm.SIZE_BYTES) return
        val connection = (URL(Llm.URL).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            instanceFollowRedirects = true
            setRequestProperty("User-Agent", "Satark/2.0 (in.satark.shield)")
            if (offset > 0) setRequestProperty("Range", "bytes=$offset-")
        }
        try {
            val code = connection.responseCode
            if (code == 200 && offset > 0) offset = 0 // server ignored the range: start over
            else if (code != 200 && code != 206) throw IOException("server returned HTTP $code")
            FileOutputStream(part, offset > 0).use { out ->
                connection.inputStream.use { input ->
                    val buffer = ByteArray(256 * 1024)
                    var lastReport = 0L
                    bytesDownloaded = offset
                    while (true) {
                        if (cancelRequested.get()) throw CancelledException()
                        val n = input.read(buffer)
                        if (n < 0) break
                        out.write(buffer, 0, n)
                        bytesDownloaded += n
                        if (bytesDownloaded - lastReport > 4_000_000) {
                            lastReport = bytesDownloaded
                            onProgress(status(context))
                        }
                    }
                }
            }
            if (part.length() != Llm.SIZE_BYTES) throw IOException("download incomplete; tap Download to resume")
        } finally {
            connection.disconnect()
        }
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(1 shl 20)
            while (true) {
                val n = input.read(buffer)
                if (n < 0) break
                digest.update(buffer, 0, n)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    private fun File.readTextOrNull() = if (exists()) readText().trim() else null
}
