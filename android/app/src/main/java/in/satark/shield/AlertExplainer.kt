package `in`.satark.shield

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import org.json.JSONObject
import java.util.concurrent.locks.ReentrantLock

/**
 * Optional on-device LLM that writes a short plain-language note for an alert
 * the deterministic rules have ALREADY raised. It never decides the alert
 * level, never triggers actions, and its output is validated before display.
 * If the model is missing, busy, slow or memory is low, callers fall back to
 * the rule-based advice.
 */
object AlertExplainer {
    data class Outcome(val status: String, val explanation: String? = null, val millis: Long = 0)

    private const val CONTEXT_TOKENS = 1024
    private const val MAX_NEW_TOKENS = 90
    private const val TIMEOUT_MS = 30_000L
    private const val IDLE_UNLOAD_MS = 45_000L
    /** Keep this much RAM free after loading the ~640 MB model. */
    private const val MIN_AVAILABLE_RAM = 1_200_000_000L
    /** Below this total RAM, speech recognition and the LLM are never loaded together. */
    private const val BOTH_MODELS_MIN_TOTAL_RAM = 6_000_000_000L

    private val lock = ReentrantLock()
    private val handler = Handler(Looper.getMainLooper())
    private var engine: LlmEngine? = null
    private val unload = Runnable { release() }

    // Forces output of the form {"explanation": "<20-280 plain characters>"}.
    private const val GRAMMAR = """root ::= "{\"explanation\": \"" chars "\"}"
chars ::= [^"\\\x00-\x1F\x7F]{20,280}"""

    private const val SYSTEM = "You write short safety notes for a phone user in India. A rule-based checker already found " +
        "warning signs in a call. In at most two short sentences of simple English, explain why these signs matter and " +
        "suggest checking independently. Never accuse anyone, never give phone numbers or links, and never tell the user " +
        "to pay, transfer money, share codes or stay on the call. Reply only as JSON: {\"explanation\": \"...\"}"

    private val SHOTS = listOf(
        "Transcript: this is the electricity office your power will be cut tonight pay the bill now\n" +
            "Warning signs: Threatens to disconnect a service; Asks you to send money; Pressure to act immediately" to
            "{\"explanation\": \"Utility offices do not demand instant payment on a call. Check your bill in the official app or at the office before paying anything.\"}",
        "Transcript: beta mera phone kho gaya is naye number pe paise bhej do\n" +
            "Warning signs: Claims to be someone you know calling from a new number; Asks you to send money" to
            "{\"explanation\": \"Scammers often pretend to be a relative using a new number. Call your relative on the number you already have before sending money.\"}",
    )

    // Output that could push the user toward the scam, repeat the caller's threat,
    // vouch for the caller, accuse anyone, or include contact details.
    private val UNSAFE = Regex(
        "(https?://|www\\.|\\b\\d{5,}\\b|\\+91|valid payment|immediate action|stay on the (call|line)|do not disconnect|" +
            "don't disconnect|(might|may|will) be (blocked|frozen|arrested|cut|disconnected|suspended)|if you don't|" +
            "is (definitely|certainly) (a )?(scam|fraud)|is a criminal|arrest them|" +
            "\\bthis (is|was) (a |an )?(real|genuine|legitimate|government|official|police|bank))",
        RegexOption.IGNORE_CASE,
    )
    // A sentence telling the user to do one of these must also say not to, or to verify before.
    private val RISKY_ACTION = Regex("\\b(pay\\w*|send\\w*|transfer\\w*|install\\w*|download\\w*|shar(e|ing)|provid\\w*|giv(e|ing)|read out|stay\\w*|keep\\w*)\\b", RegexOption.IGNORE_CASE)
    private val NEGATION = Regex("\\b(don't|do not|never|not|avoid|before|instead of|no)\\b", RegexOption.IGNORE_CASE)
    private val SAFETY_WORDS = Regex("(verify|check|official|call back|directly|known number|number you already|independent|bank|branch|family|trusted|avoid|do not|don't|never)", RegexOption.IGNORE_CASE)

    fun buildPrompt(transcript: String, cues: List<String>): String {
        val sb = StringBuilder()
        sb.append("<|im_start|>system\n").append(SYSTEM).append("<|im_end|>\n")
        for ((user, assistant) in SHOTS) {
            sb.append("<|im_start|>user\n").append(user).append("<|im_end|>\n")
            sb.append("<|im_start|>assistant\n").append(assistant).append("<|im_end|>\n")
        }
        sb.append("<|im_start|>user\nTranscript: ").append(transcript.replace(Regex("\\s+"), " ").take(500))
        sb.append("\nWarning signs: ").append(cues.joinToString("; ").take(400)).append("<|im_end|>\n")
        // Qwen3 chat format with reasoning disabled (equivalent to enable_thinking=False).
        sb.append("<|im_start|>assistant\n<think>\n\n</think>\n\n")
        return sb.toString()
    }

    /** Returns the explanation if it is safe to show, else null. */
    fun validate(raw: String?): String? {
        if (raw == null) return null
        val text = try {
            JSONObject(raw.trim()).optString("explanation").trim()
        } catch (_: Exception) {
            return null
        }
        if (text.length < 20 || text.length > 300) return null
        if (UNSAFE.containsMatchIn(text)) return null
        for (sentence in text.split(Regex("[.!?]+"))) {
            if (RISKY_ACTION.containsMatchIn(sentence) && !NEGATION.containsMatchIn(sentence)) return null
        }
        if (!SAFETY_WORDS.containsMatchIn(text)) return null
        return text
    }

    fun explain(context: Context, transcript: String, cues: List<String>): Outcome {
        val app = context.applicationContext
        if (!ModelManager.isLlmReady(app)) return Outcome("not_installed")
        if (!lock.tryLock()) return Outcome("busy")
        try {
            handler.removeCallbacks(unload)
            val engine = engine ?: run {
                if (ModelManager.totalRam(app) < BOTH_MODELS_MIN_TOTAL_RAM) {
                    // On 3-4 GB phones both models together got the app killed in testing.
                    // Keep listening (the protective feature) and skip the optional note.
                    if (SatarkOverlayService.isListening) return Outcome("busy_listening")
                    SpeechModel.release()
                }
                val (available, low) = ModelManager.availableRam(app)
                if (low || available < MIN_AVAILABLE_RAM) return Outcome("low_memory")
                val threads = Runtime.getRuntime().availableProcessors().coerceIn(2, 4)
                LlmEngine.load(ModelManager.llmFile(app).absolutePath, CONTEXT_TOKENS, threads)?.also { engine = it }
                    ?: return Outcome("error")
            }
            val started = System.currentTimeMillis()
            val raw = engine.generate(buildPrompt(transcript, cues), GRAMMAR, MAX_NEW_TOKENS, TIMEOUT_MS)
            val millis = System.currentTimeMillis() - started
            Log.i("SatarkLlm", "explanation generated in $millis ms")
            if (raw == null) return Outcome("timeout", millis = millis)
            val safe = validate(raw) ?: return Outcome("rejected", millis = millis)
            return Outcome("ok", safe, millis)
        } catch (error: Throwable) {
            Log.w("SatarkLlm", "explain failed", error)
            return Outcome("error")
        } finally {
            handler.postDelayed(unload, IDLE_UNLOAD_MS)
            lock.unlock()
        }
    }

    /** Frees the model (also called when memory is tight or the model is deleted). */
    fun release() {
        engine?.abort()
        lock.lock()
        try {
            engine?.close()
            engine = null
        } finally {
            lock.unlock()
        }
    }
}
