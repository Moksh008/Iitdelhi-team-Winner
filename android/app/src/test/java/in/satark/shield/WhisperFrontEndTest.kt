package `in`.satark.shield

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

/** Checks the Kotlin Whisper front end against the NumPy reference (no ONNX Runtime needed). */
class WhisperFrontEndTest {

    @Test
    fun mixedRadixFftMatchesNaiveDft() {
        val n = 400
        val re = DoubleArray(n) { sin(it * 0.37) + 0.25 * cos(it * 1.9) }
        val im = DoubleArray(n)
        val expectRe = DoubleArray(n)
        val expectIm = DoubleArray(n)
        for (k in 0 until n) for (t in 0 until n) {
            val angle = -2 * PI * k * t / n
            expectRe[k] += re[t] * cos(angle)
            expectIm[k] += re[t] * sin(angle)
        }
        MixedRadixFft(n).transform(re, im)
        for (k in 0 until n) {
            assertEquals(expectRe[k], re[k], 1e-9)
            assertEquals(expectIm[k], im[k], 1e-9)
        }
    }

    @Test
    fun logMelMatchesNumpyReference() {
        val assets = File("src/main/assets/whisper")
        assumeTrue("run tools/models/export_whisper_onnx.py first", File(assets, "whisper_config.json").exists())
        val config = WhisperEngine.parseConfig(File(assets, "whisper_config.json").readText())
        val filters = WhisperEngine.parseMelFilters(File(assets, "mel_filters.bin").readBytes())
        val fixture = ByteBuffer.wrap(javaClass.getResource("/whisper_mel_fixture.bin")!!.readBytes()).order(ByteOrder.LITTLE_ENDIAN)
        val audio = FloatArray(fixture.int) { fixture.float }
        val expected = FloatArray(fixture.int) { fixture.float }

        val mel = WhisperFrontEnd(config, filters).logMel(audio)
        assertEquals(expected.size, mel.size)
        var maxDiff = 0f
        for (i in mel.indices) maxDiff = maxOf(maxDiff, abs(mel[i] - expected[i]))
        assertTrue("max |diff| = $maxDiff", maxDiff < 1e-3f)
    }

    @Test
    fun tokenTableDecodesUtf8() {
        val assets = File("src/main/assets/whisper/tokens.bin")
        assumeTrue(assets.exists())
        val tokens = WhisperEngine.parseTokens(assets.readBytes())
        assertEquals(51865, tokens.size)
        // Token 50257 is <|endoftext|>: special tokens decode to nothing.
        assertEquals(0, tokens[50257].size)
    }
}
