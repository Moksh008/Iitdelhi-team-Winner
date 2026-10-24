package `in`.satark.shield

/** JNI wrapper around llama.cpp (see src/main/cpp/satark_llm.cpp). */
class LlmEngine private constructor(private var handle: Long) : AutoCloseable {

    /** Greedy generation; returns null on failure, timeout or abort. */
    fun generate(prompt: String, grammar: String?, maxTokens: Int, timeoutMs: Long): String? {
        val h = handle
        if (h == 0L) return null
        return nativeGenerate(h, prompt, grammar ?: "", maxTokens, timeoutMs)?.toString(Charsets.UTF_8)
    }

    fun abort() {
        if (handle != 0L) nativeAbort(handle)
    }

    override fun close() {
        if (handle != 0L) {
            nativeFree(handle)
            handle = 0L
        }
    }

    companion object {
        init {
            System.loadLibrary("satark_llm")
        }

        fun load(path: String, contextTokens: Int, threads: Int): LlmEngine? {
            val handle = nativeLoad(path, contextTokens, threads)
            return if (handle == 0L) null else LlmEngine(handle)
        }

        @JvmStatic private external fun nativeLoad(path: String, nCtx: Int, nThreads: Int): Long
        @JvmStatic private external fun nativeGenerate(handle: Long, prompt: String, grammar: String, maxTokens: Int, timeoutMs: Long): ByteArray?
        @JvmStatic private external fun nativeAbort(handle: Long)
        @JvmStatic private external fun nativeFree(handle: Long)
    }
}
