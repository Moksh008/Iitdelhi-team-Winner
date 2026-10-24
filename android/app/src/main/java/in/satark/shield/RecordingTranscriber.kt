package `in`.satark.shield

import android.content.Context

/**
 * Turns a whole recording into timed text segments on the phone: the same
 * speech detector as live listening finds the spoken parts, consecutive parts
 * are grouped into windows of up to 25 s (Whisper's limit is 30 s), and each
 * window is transcribed by the bundled Whisper model.
 */
object RecordingTranscriber {
    data class Segment(val startSeconds: Double, val endSeconds: Double, val text: String)
    data class Result(val durationSeconds: Double, val segments: List<Segment>, val transcribeMs: Long)

    private const val FRAME = 1600 // 100 ms at 16 kHz
    private const val MAX_WINDOW_SECONDS = 25.0
    private val lock = Any()

    private class Part(val start: Double, val end: Double, val audio: FloatArray)

    fun transcribe(context: Context, audio: FloatArray, onProgress: (done: Int, total: Int) -> Unit = { _, _ -> }): Result {
        val rate = WhisperEngine.SAMPLE_RATE.toDouble()
        val parts = speechParts(audio, rate)
        val windows = groupIntoWindows(parts)
        val engine = SpeechModel.get(context)
        val segments = ArrayList<Segment>()
        var transcribeMs = 0L
        onProgress(0, windows.size)
        windows.forEachIndexed { index, window ->
            val joined = FloatArray(window.sumOf { it.audio.size })
            var offset = 0
            for (part in window) { part.audio.copyInto(joined, offset); offset += part.audio.size }
            val transcript = synchronized(lock) { engine.transcribe(joined) }
            transcribeMs += transcript.encoderMs + transcript.decoderMs
            if (transcript.text.isNotBlank()) {
                segments.add(Segment(window.first().start, window.last().end, transcript.text.trim()))
            }
            onProgress(index + 1, windows.size)
        }
        return Result(audio.size / rate, segments, transcribeMs)
    }

    /** Spoken parts with their times; falls back to plain 25 s slices if no speech is detected. */
    private fun speechParts(audio: FloatArray, rate: Double): List<Part> {
        val parts = ArrayList<Part>()
        var framesFed = 0
        val segmenter = SpeechSegmenter(onUtterance = { utterance ->
            val end = framesFed * FRAME / rate
            parts.add(Part(maxOf(0.0, end - utterance.size / rate), end, utterance))
        })
        var start = 0
        while (start + FRAME <= audio.size) {
            framesFed += 1
            segmenter.accept(audio.copyOfRange(start, start + FRAME))
            start += FRAME
        }
        segmenter.flush()
        if (parts.isNotEmpty()) return parts

        val slice = (MAX_WINDOW_SECONDS * rate).toInt()
        var from = 0
        while (from < audio.size) {
            val to = minOf(audio.size, from + slice)
            if (to - from > rate / 2) parts.add(Part(from / rate, to / rate, audio.copyOfRange(from, to)))
            from = to
        }
        return parts
    }

    private fun groupIntoWindows(parts: List<Part>): List<List<Part>> {
        val windows = ArrayList<List<Part>>()
        var current = ArrayList<Part>()
        var seconds = 0.0
        for (part in parts) {
            val length = part.audio.size / WhisperEngine.SAMPLE_RATE.toDouble()
            if (current.isNotEmpty() && seconds + length > MAX_WINDOW_SECONDS) {
                windows.add(current)
                current = ArrayList()
                seconds = 0.0
            }
            current.add(part)
            seconds += length
        }
        if (current.isNotEmpty()) windows.add(current)
        return windows
    }
}
