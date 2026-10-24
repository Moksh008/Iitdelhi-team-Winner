package `in`.satark.shield

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import org.json.JSONObject
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.FloatBuffer
import java.nio.LongBuffer
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sin

/**
 * On-device speech recognition with abhishekgautamm/whisper-tiny-hinglish,
 * exported to ONNX by tools/models/export_whisper_onnx.py.
 *
 * The feature extraction and greedy decoding mirror
 * tools/models/verify_whisper_onnx.py, which was checked to reproduce the
 * transformers reference transcripts exactly. Audio never leaves the device.
 */
class WhisperEngine private constructor(
    private val env: OrtEnvironment,
    private val encoder: OrtSession,
    private val decoder: OrtSession,
    private val config: Config,
    private val melFilters: Array<FloatArray>,
    private val tokenBytes: Array<ByteArray>,
) : AutoCloseable {

    data class Config(
        val sampleRate: Int,
        val nFft: Int,
        val hop: Int,
        val nSamples: Int,
        val nFrames: Int,
        val nMels: Int,
        val layers: Int,
        val heads: Int,
        val headDim: Int,
        val eot: Int,
        val prompt: LongArray,
        val suppressAtBegin: IntArray,
        val firstSpecial: Int,
        val maxNewTokens: Int,
    )

    data class Transcript(val text: String, val encoderMs: Long, val decoderMs: Long, val tokens: Int)

    private val frontEnd = WhisperFrontEnd(config, melFilters)

    /** Transcribes up to 30 s of 16 kHz mono float audio in [-1, 1]. */
    fun transcribe(audio: FloatArray): Transcript {
        val mel = frontEnd.logMel(audio)
        val t0 = System.nanoTime()
        val melTensor = OnnxTensor.createTensor(env, FloatBuffer.wrap(mel), longArrayOf(1, config.nMels.toLong(), config.nFrames.toLong()))
        val encoded = encoder.run(mapOf("mel" to melTensor))
        melTensor.close()
        val t1 = System.nanoTime()
        try {
            val crossK = encoded[0] as OnnxTensor
            val crossV = encoded[1] as OnnxTensor
            val (tokens, steps) = decode(crossK, crossV)
            val t2 = System.nanoTime()
            return Transcript(decodeText(tokens), (t1 - t0) / 1_000_000, (t2 - t1) / 1_000_000, steps)
        } finally {
            encoded.close()
        }
    }

    private fun decode(crossK: OnnxTensor, crossV: OnnxTensor): Pair<List<Int>, Int> {
        val emptyShape = longArrayOf(config.layers.toLong(), 1, config.heads.toLong(), 0, config.headDim.toLong())
        var selfK = OnnxTensor.createTensor(env, FloatBuffer.allocate(0), emptyShape)
        var selfV = OnnxTensor.createTensor(env, FloatBuffer.allocate(0), emptyShape)
        var previous: OrtSession.Result? = null
        var feed = config.prompt
        var offset = 0L
        val out = ArrayList<Int>()
        try {
            for (step in 0 until config.maxNewTokens) {
                val tokenTensor = OnnxTensor.createTensor(env, LongBuffer.wrap(feed), longArrayOf(1, feed.size.toLong()))
                val offsetTensor = OnnxTensor.createTensor(env, offset)
                val result = decoder.run(mapOf(
                    "tokens" to tokenTensor, "self_k" to selfK, "self_v" to selfV,
                    "cross_k" to crossK, "cross_v" to crossV, "offset" to offsetTensor,
                ))
                tokenTensor.close()
                offsetTensor.close()
                if (previous == null) { selfK.close(); selfV.close() } else previous.close()
                previous = result
                offset += feed.size

                val logits = (result[0] as OnnxTensor).floatBuffer
                val vocab = logits.capacity() / feed.size
                val base = (feed.size - 1) * vocab
                var best = -1
                var bestScore = Float.NEGATIVE_INFINITY
                // Only ordinary text tokens or end-of-text may be produced.
                for (id in 0..minOf(config.firstSpecial, vocab - 1)) {
                    if (step == 0 && id in config.suppressAtBegin) continue
                    val score = logits.get(base + id)
                    if (score > bestScore) { bestScore = score; best = id }
                }
                if (best == config.eot || best < 0) break
                out.add(best)
                if (isRepeating(out)) break
                selfK = result[1] as OnnxTensor
                selfV = result[2] as OnnxTensor
                feed = longArrayOf(best.toLong())
            }
        } finally {
            previous?.close()
        }
        return out to out.size
    }

    /** Stops decoding loops such as "array array array" (same 1-3 token n-gram 4 times). */
    private fun isRepeating(tokens: List<Int>): Boolean {
        for (n in 1..3) {
            if (tokens.size < n * 4) continue
            val tail = tokens.takeLast(n)
            if ((1..3).all { r -> tokens.subList(tokens.size - n * (r + 1), tokens.size - n * r) == tail }) return true
        }
        return false
    }

    fun decodeText(tokens: List<Int>): String {
        val bytes = java.io.ByteArrayOutputStream()
        tokens.forEach { id -> if (id in tokenBytes.indices) bytes.write(tokenBytes[id]) }
        return String(bytes.toByteArray(), Charsets.UTF_8).trim()
    }

    override fun close() {
        encoder.close()
        decoder.close()
    }

    companion object {
        const val SAMPLE_RATE = 16_000

        /**
         * Loads the model from files on disk. Loading by path with ONNX Runtime's
         * CPU arena disabled measured ~264 MB vs ~435 MB when loading from bytes
         * with default options (tools/models, PC measurement).
         */
        fun load(dir: java.io.File, threads: Int): WhisperEngine {
            val config = parseConfig(java.io.File(dir, "whisper_config.json").readText())
            val env = OrtEnvironment.getEnvironment()
            // No telemetry: audio-derived data and usage events stay on the device.
            env.setTelemetry(false)
            val options = OrtSession.SessionOptions().apply {
                setIntraOpNumThreads(threads)
                setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
                setCPUArenaAllocator(false)
            }
            val encoder = env.createSession(java.io.File(dir, "encoder.onnx").path, options)
            val decoder = try {
                env.createSession(java.io.File(dir, "decoder.onnx").path, options)
            } catch (error: Exception) {
                encoder.close()
                throw error
            }
            return WhisperEngine(
                env, encoder, decoder, config,
                parseMelFilters(java.io.File(dir, "mel_filters.bin").readBytes()),
                parseTokens(java.io.File(dir, "tokens.bin").readBytes()),
            )
        }

        fun parseConfig(json: String): Config {
            val o = JSONObject(json)
            val prompt = o.getJSONArray("prompt")
            val suppress = o.getJSONArray("suppress_at_begin")
            return Config(
                sampleRate = o.getInt("sample_rate"),
                nFft = o.getInt("n_fft"),
                hop = o.getInt("hop_length"),
                nSamples = o.getInt("n_samples"),
                nFrames = o.getInt("n_frames"),
                nMels = o.getInt("n_mels"),
                layers = o.getInt("decoder_layers"),
                heads = o.getInt("decoder_heads"),
                headDim = o.getInt("head_dim"),
                eot = o.getInt("eot"),
                prompt = LongArray(prompt.length()) { prompt.getLong(it) },
                suppressAtBegin = IntArray(suppress.length()) { suppress.getInt(it) },
                firstSpecial = o.getInt("first_special_token"),
                maxNewTokens = o.getInt("max_new_tokens"),
            )
        }

        fun parseMelFilters(bytes: ByteArray): Array<FloatArray> {
            val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            val nMels = buffer.int
            val nFreq = buffer.int
            return Array(nMels) { FloatArray(nFreq) { buffer.float } }
        }

        fun parseTokens(bytes: ByteArray): Array<ByteArray> {
            val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
            val count = buffer.int
            return Array(count) {
                val length = buffer.short.toInt() and 0xFFFF
                ByteArray(length).also { buffer.get(it) }
            }
        }
    }
}


/** Whisper log-mel feature extraction (matches WhisperFeatureExtractor; see verify_whisper_onnx.py). */
class WhisperFrontEnd(private val config: WhisperEngine.Config, private val melFilters: Array<FloatArray>) {
    private val window = FloatArray(config.nFft) { (0.5 - 0.5 * cos(2 * PI * it / config.nFft)).toFloat() }
    private val fft = MixedRadixFft(config.nFft)

    /** Whisper log-mel spectrogram, [nMels * nFrames] row-major. */
    fun logMel(audio: FloatArray): FloatArray {
        val nFft = config.nFft
        val pad = nFft / 2
        val samples = minOf(audio.size, config.nSamples)
        // Zero-padded to 30 s, then reflect-padded by nFft/2 on both sides (as numpy/librosa do).
        fun sampleAt(i: Int): Float {
            val j = i - pad
            val k = when {
                j < 0 -> -j
                j >= config.nSamples -> 2 * (config.nSamples - 1) - j
                else -> j
            }
            return if (k < samples) audio[k] else 0f
        }
        val nFreq = nFft / 2 + 1
        // Frames that only see the zero padding have zero power; skip their FFTs.
        val activeFrames = minOf(config.nFrames, (samples + pad) / config.hop + 1)
        val power = Array(activeFrames) { FloatArray(nFreq) }
        val re = DoubleArray(nFft)
        val im = DoubleArray(nFft)
        for (f in 0 until activeFrames) {
            val start = f * config.hop
            for (n in 0 until nFft) {
                re[n] = (sampleAt(start + n) * window[n]).toDouble()
                im[n] = 0.0
            }
            fft.transform(re, im)
            val p = power[f]
            for (k in 0 until nFreq) p[k] = (re[k] * re[k] + im[k] * im[k]).toFloat()
        }
        val out = FloatArray(config.nMels * config.nFrames)
        var maxLog = Float.NEGATIVE_INFINITY
        for (m in 0 until config.nMels) {
            val filter = melFilters[m]
            for (f in 0 until config.nFrames) {
                var sum = 0.0
                if (f < activeFrames) {
                    val p = power[f]
                    for (k in 0 until nFreq) sum += filter[k] * p[k]
                }
                val value = log10(max(sum, 1e-10)).toFloat()
                out[m * config.nFrames + f] = value
                if (value > maxLog) maxLog = value
            }
        }
        val floor = maxLog - 8f
        for (i in out.indices) out[i] = (max(out[i], floor) + 4f) / 4f
        return out
    }

}

/** In-place complex FFT for any length made of small factors (Whisper uses 400 = 2^4 * 5^2). */
class MixedRadixFft(private val n: Int) {
    private val cosTable = DoubleArray(n) { cos(-2 * PI * it / n) }
    private val sinTable = DoubleArray(n) { sin(-2 * PI * it / n) }
    private val factors: IntArray

    init {
        val list = ArrayList<Int>()
        var rest = n
        for (p in intArrayOf(4, 2, 3, 5)) while (rest % p == 0) { list.add(p); rest /= p }
        var p = 7
        while (rest > 1) { while (rest % p == 0) { list.add(p); rest /= p }; p += 2 }
        factors = list.toIntArray()
    }

    fun transform(re: DoubleArray, im: DoubleArray) {
        val outRe = DoubleArray(n)
        val outIm = DoubleArray(n)
        recurse(re, im, 0, 1, outRe, outIm, 0, n, 0)
        System.arraycopy(outRe, 0, re, 0, n)
        System.arraycopy(outIm, 0, im, 0, n)
    }

    // DFT of the length-`len` sequence x[offset + stride*j], written to out[outOffset ..].
    private fun recurse(re: DoubleArray, im: DoubleArray, offset: Int, stride: Int,
                        outRe: DoubleArray, outIm: DoubleArray, outOffset: Int, len: Int, factorIndex: Int) {
        if (len == 1) {
            outRe[outOffset] = re[offset]
            outIm[outOffset] = im[offset]
            return
        }
        val p = factors[factorIndex]
        val m = len / p
        for (r in 0 until p) {
            recurse(re, im, offset + r * stride, stride * p, outRe, outIm, outOffset + r * m, m, factorIndex + 1)
        }
        val twStep = n / len
        val tmpRe = DoubleArray(p)
        val tmpIm = DoubleArray(p)
        for (k in 0 until m) {
            for (r in 0 until p) {
                val idx = (r * k * twStep) % n
                val xr = outRe[outOffset + r * m + k]
                val xi = outIm[outOffset + r * m + k]
                tmpRe[r] = xr * cosTable[idx] - xi * sinTable[idx]
                tmpIm[r] = xr * sinTable[idx] + xi * cosTable[idx]
            }
            for (q in 0 until p) {
                var sumRe = 0.0
                var sumIm = 0.0
                for (r in 0 until p) {
                    val idx = (r * q * m * twStep) % n
                    sumRe += tmpRe[r] * cosTable[idx] - tmpIm[r] * sinTable[idx]
                    sumIm += tmpRe[r] * sinTable[idx] + tmpIm[r] * cosTable[idx]
                }
                outRe[outOffset + q * m + k] = sumRe
                outIm[outOffset + q * m + k] = sumIm
            }
        }
    }
}
