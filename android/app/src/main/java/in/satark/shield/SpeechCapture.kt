package `in`.satark.shield

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

/**
 * Splits a stream of 100 ms audio frames into utterances using a simple
 * adaptive energy threshold. Utterances end after ~0.8 s of silence or at
 * [maxSeconds]; very short blips are discarded.
 */
class SpeechSegmenter(
    private val onUtterance: (FloatArray) -> Unit,
    private val frameSamples: Int = 1600,
    private val maxSeconds: Float = 12f,
    /** Called for every frame with its loudness (RMS) and whether speech is in progress. */
    private val onLevel: (rms: Float, inSpeech: Boolean) -> Unit = { _, _ -> },
) {
    private var noiseFloor = 0.003f
    private var speechFrames = 0
    private var silenceFrames = 0
    private var inSpeech = false
    private val preRoll = ArrayDeque<FloatArray>()
    private val current = ArrayList<FloatArray>()

    fun accept(frame: FloatArray) {
        var sum = 0.0
        for (s in frame) sum += s * s
        val rms = sqrt(sum / frame.size).toFloat()
        // Phone microphones are often quiet, so keep the absolute floor low.
        val threshold = max(noiseFloor * 2.5f, 0.005f)
        val loud = rms > threshold
        onLevel(rms, inSpeech || loud)
        if (!inSpeech) {
            // Track background level only while nobody is talking.
            noiseFloor = if (rms < noiseFloor) 0.9f * noiseFloor + 0.1f * rms else min(0.995f * noiseFloor + 0.005f * rms, 0.05f)
            preRoll.addLast(frame)
            if (preRoll.size > 3) preRoll.removeFirst()
            speechFrames = if (loud) speechFrames + 1 else 0
            if (speechFrames >= 2) {
                inSpeech = true
                silenceFrames = 0
                current.clear()
                current.addAll(preRoll)
                preRoll.clear()
            }
            return
        }
        current.add(frame)
        silenceFrames = if (loud) 0 else silenceFrames + 1
        val seconds = current.size * frameSamples / WhisperEngine.SAMPLE_RATE.toFloat()
        if (silenceFrames >= 8 || seconds >= maxSeconds) flush()
    }

    fun flush() {
        if (inSpeech && current.size * frameSamples >= WhisperEngine.SAMPLE_RATE / 2) {
            val audio = FloatArray(current.size * frameSamples)
            current.forEachIndexed { i, f -> f.copyInto(audio, i * frameSamples) }
            onUtterance(audio)
        }
        inSpeech = false
        speechFrames = 0
        silenceFrames = 0
        current.clear()
    }
}

/** Reads the microphone on a background thread and feeds a [SpeechSegmenter]. */
class MicrophoneCapture(
    private val segmenter: SpeechSegmenter,
    private val onError: (String) -> Unit,
    /** Called when the microphone delivers pure silence for several seconds (Android may be blocking it). */
    private val onSilenced: (Boolean) -> Unit = {},
) {
    @Volatile private var running = false
    private var thread: Thread? = null

    @SuppressLint("MissingPermission") // Caller checks RECORD_AUDIO before starting.
    fun start() {
        if (running) return
        val minBuffer = AudioRecord.getMinBufferSize(WhisperEngine.SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        if (minBuffer <= 0) {
            onError("Microphone format not supported on this device")
            return
        }
        val record = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                WhisperEngine.SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                max(minBuffer, 1600 * 2 * 4),
            )
        } catch (error: Exception) {
            onError("Microphone unavailable: ${error.message}")
            return
        }
        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            onError("Microphone is in use by another app or unavailable")
            return
        }
        running = true
        thread = Thread({
            val pcm = ShortArray(1600)
            try {
                record.startRecording()
                if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
                    onError("Microphone could not start (another app may be using it)")
                    return@Thread
                }
                var zeroFrames = 0
                var reportedSilenced = false
                while (running) {
                    var filled = 0
                    while (filled < pcm.size && running) {
                        val n = record.read(pcm, filled, pcm.size - filled)
                        if (n < 0) {
                            onError("Microphone read failed ($n)")
                            running = false
                            break
                        }
                        filled += n
                    }
                    if (filled == pcm.size) {
                        // Real microphones always pick up some noise; exact zeros mean the input is blocked.
                        val allZero = pcm.all { it.toInt() == 0 }
                        zeroFrames = if (allZero) zeroFrames + 1 else 0
                        val silenced = zeroFrames >= 30
                        if (silenced != reportedSilenced) {
                            reportedSilenced = silenced
                            onSilenced(silenced)
                        }
                        segmenter.accept(FloatArray(pcm.size) { pcm[it] / 32768f })
                    }
                }
                segmenter.flush()
            } catch (error: Exception) {
                Log.w("SatarkMic", "capture failed", error)
                onError("Microphone stopped: ${error.message}")
            } finally {
                try { record.stop() } catch (_: Exception) {}
                record.release()
            }
        }, "satark-mic").apply { start() }
    }

    fun stop() {
        running = false
        thread?.join(1500)
        thread = null
    }
}
