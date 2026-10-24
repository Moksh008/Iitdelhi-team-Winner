package `in`.satark.shield

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import java.nio.ByteOrder
import kotlin.math.max
import kotlin.math.min

/**
 * Decodes an audio file the user picked (m4a/AAC, mp3, WhatsApp opus/ogg, wav,
 * amr, 3gp...) with Android's own decoders into 16 kHz mono floats for Whisper.
 * Everything happens on the phone; the file is only read, never copied or uploaded.
 */
object AudioFileDecoder {
    class TooLongException(val maxSeconds: Int) : Exception("Recording is longer than ${maxSeconds / 60} minutes")
    class NoAudioException : Exception("This file has no audio track Satark can read")

    const val MAX_SECONDS = 10 * 60
    private const val TIMEOUT_US = 10_000L

    fun decode(context: Context, uri: Uri): FloatArray {
        val extractor = MediaExtractor()
        try {
            extractor.setDataSource(context, uri, null)
            val track = (0 until extractor.trackCount).firstOrNull {
                extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
            } ?: throw NoAudioException()
            extractor.selectTrack(track)
            val format = extractor.getTrackFormat(track)
            val mime = format.getString(MediaFormat.KEY_MIME)!!
            var sampleRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            var channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            if (format.containsKey(MediaFormat.KEY_DURATION) && format.getLong(MediaFormat.KEY_DURATION) > (MAX_SECONDS + 5) * 1_000_000L) {
                throw TooLongException(MAX_SECONDS)
            }

            val codec = MediaCodec.createDecoderByType(mime)
            codec.configure(format, null, null, 0)
            codec.start()
            var pcmFloat = false
            val mono = FloatList()
            val info = MediaCodec.BufferInfo()
            var inputDone = false
            var outputDone = false
            try {
                while (!outputDone) {
                    if (!inputDone) {
                        val inIndex = codec.dequeueInputBuffer(TIMEOUT_US)
                        if (inIndex >= 0) {
                            val buffer = codec.getInputBuffer(inIndex)!!
                            val size = extractor.readSampleData(buffer, 0)
                            if (size < 0) {
                                codec.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                                inputDone = true
                            } else {
                                codec.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
                                extractor.advance()
                            }
                        }
                    }
                    val outIndex = codec.dequeueOutputBuffer(info, TIMEOUT_US)
                    when {
                        outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                            val out = codec.outputFormat
                            sampleRate = out.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                            channels = out.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                            pcmFloat = out.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
                                out.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
                        }
                        outIndex >= 0 -> {
                            val buffer = codec.getOutputBuffer(outIndex)!!.order(ByteOrder.nativeOrder())
                            buffer.position(info.offset)
                            buffer.limit(info.offset + info.size)
                            // Down-mix every frame to mono.
                            if (pcmFloat) {
                                val floats = buffer.asFloatBuffer()
                                while (floats.remaining() >= channels) {
                                    var sum = 0f
                                    repeat(channels) { sum += floats.get() }
                                    mono.add(sum / channels)
                                }
                            } else {
                                val shorts = buffer.asShortBuffer()
                                while (shorts.remaining() >= channels) {
                                    var sum = 0f
                                    repeat(channels) { sum += shorts.get() / 32768f }
                                    mono.add(sum / channels)
                                }
                            }
                            codec.releaseOutputBuffer(outIndex, false)
                            if (mono.size > (MAX_SECONDS + 5).toLong() * sampleRate) throw TooLongException(MAX_SECONDS)
                            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) outputDone = true
                        }
                    }
                }
            } finally {
                codec.stop()
                codec.release()
            }
            return resample(mono.toArray(), sampleRate, WhisperEngine.SAMPLE_RATE)
        } finally {
            extractor.release()
        }
    }

    /**
     * Resamples by averaging every source sample that falls inside each output
     * sample's time span (a box filter), which also removes most aliasing when
     * going down from 44.1/48 kHz.
     */
    fun resample(input: FloatArray, from: Int, to: Int): FloatArray {
        if (from == to || input.isEmpty()) return input
        val ratio = from.toDouble() / to
        val outLength = (input.size / ratio).toInt()
        val out = FloatArray(outLength)
        for (i in 0 until outLength) {
            val start = i * ratio
            val end = start + ratio
            if (ratio <= 1.0) {
                // Upsampling: linear interpolation.
                val j = start.toInt()
                val frac = (start - j).toFloat()
                val a = input[min(j, input.size - 1)]
                val b = input[min(j + 1, input.size - 1)]
                out[i] = a + (b - a) * frac
            } else {
                val first = start.toInt()
                val last = min(end.toInt(), input.size - 1)
                var sum = 0.0
                for (k in first..last) sum += input[k]
                out[i] = (sum / max(1, last - first + 1)).toFloat()
            }
        }
        return out
    }

    /** Growable float array without boxing. */
    private class FloatList {
        private var data = FloatArray(1 shl 16)
        var size = 0
            private set

        fun add(value: Float) {
            if (size == data.size) data = data.copyOf(data.size * 2)
            data[size++] = value
        }

        fun toArray(): FloatArray = data.copyOf(size)
    }
}
