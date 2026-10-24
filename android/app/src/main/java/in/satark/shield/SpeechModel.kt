package `in`.satark.shield

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Loads the bundled Whisper model lazily and shares one instance across the app. */
object SpeechModel {
    private const val DIR = "whisper"
    private val required = listOf("encoder.onnx", "decoder.onnx", "tokens.bin", "mel_filters.bin", "whisper_config.json")
    private var engine: WhisperEngine? = null

    fun isBundled(context: Context): Boolean = try {
        val files = context.assets.list(DIR)?.toSet().orEmpty()
        required.all { it in files }
    } catch (_: IOException) {
        false
    }

    @Synchronized
    fun get(context: Context): WhisperEngine {
        engine?.let { return it }
        val threads = Runtime.getRuntime().availableProcessors().coerceIn(2, 4)
        return WhisperEngine.load(extractedDir(context.applicationContext), threads).also { engine = it }
    }

    fun isLoaded(): Boolean = engine != null

    /**
     * ONNX Runtime cannot read APK assets directly, and loading from a file uses
     * far less memory than from a byte array, so the bundled files are copied
     * once into app-private no-backup storage.
     */
    private fun extractedDir(context: Context): File {
        val dir = File(context.noBackupFilesDir, DIR).apply { mkdirs() }
        for (name in required) {
            val target = File(dir, name)
            val expected = context.assets.openFd("$DIR/$name").use { it.length }
            if (target.length() == expected) continue
            val partial = File(dir, "$name.part")
            context.assets.open("$DIR/$name").use { input -> partial.outputStream().use { input.copyTo(it, 1 shl 20) } }
            if (!partial.renameTo(target)) throw IOException("could not install $name")
        }
        return dir
    }

    @Synchronized
    fun release() {
        engine?.close()
        engine = null
    }

    /** Debug helper: reads a 16 kHz mono PCM16 WAV and transcribes it. */
    fun transcribeWav(context: Context, file: File): WhisperEngine.Transcript = get(context).transcribe(readWav(file))

    /** Reads a 16 kHz mono PCM16 WAV into floats in [-1, 1]. */
    fun readWav(file: File): FloatArray {
        val bytes = file.readBytes()
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
        require(String(bytes, 0, 4) == "RIFF" && String(bytes, 8, 4) == "WAVE") { "not a WAV file" }
        var pos = 12
        var sampleRate = 0
        var channels = 0
        var bits = 0
        while (pos + 8 <= bytes.size) {
            val id = String(bytes, pos, 4)
            val size = buffer.getInt(pos + 4)
            if (id == "fmt ") {
                channels = buffer.getShort(pos + 10).toInt()
                sampleRate = buffer.getInt(pos + 12)
                bits = buffer.getShort(pos + 22).toInt()
            } else if (id == "data") {
                require(sampleRate == WhisperEngine.SAMPLE_RATE && channels == 1 && bits == 16) {
                    "need 16 kHz mono 16-bit PCM, got $sampleRate Hz, $channels ch, $bits bit"
                }
                val count = minOf(size, bytes.size - pos - 8) / 2
                return FloatArray(count) { buffer.getShort(pos + 8 + it * 2) / 32768f }
            }
            pos += 8 + size + (size and 1)
        }
        throw IOException("WAV has no data chunk")
    }
}

/** Hands an alert from the overlay to the full app when the user taps "Open details". */
object PendingAlertStore {
    private var pending: JSONObject? = null

    @Synchronized
    fun put(alert: JSONObject) {
        pending = alert
    }

    @Synchronized
    fun take(): JSONObject? = pending.also { pending = null }
}
