package `in`.satark.shield

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.Gravity
import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.unit.dp
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.io.IOException
import org.json.JSONException
import java.util.Locale
import java.util.concurrent.Executors

class SatarkOverlayService : Service() {
    companion object {
        const val ACTION_START = "in.satark.shield.START_SENSING"
        const val ACTION_STOP = "in.satark.shield.STOP_SENSING"
        const val EXTRA_SPEECH_LOCALE = "speech_locale"
        const val EXTRA_ANALYSIS_LANGUAGE = "analysis_language"
        const val EXTRA_AUTO_LANGUAGE_DETECTION = "auto_language_detection"
        private const val CHANNEL_ID = "satark_overlay"
        private const val NOTIFICATION_ID = 4242
        private val API_BASE_URL = BuildConfig.SATARK_API_BASE_URL.trimEnd('/')
    }

    private data class Place(
        val name: String,
        val address: String,
        val phone: String,
        val distanceKm: Double?,
        val source: String,
        val retrievedAt: String?
    )

    private data class Warning(
        val level: String,
        val explanation: String,
        val excerpt: String,
        val location: String?,
        val detectedLanguage: String?,
        val places: List<Place>,
        val notice: String?
    )

    private lateinit var windowManager: WindowManager
    private var bubbleView: ComposeView? = null
    private var bubbleParams: WindowManager.LayoutParams? = null
    private var recognizer: SpeechRecognizer? = null
    private val executor = Executors.newSingleThreadExecutor()
    private var sensing by mutableStateOf(false)
    private var expanded by mutableStateOf(false)
    private var status by mutableStateOf("Stopped")
    private var warning by mutableStateOf<Warning?>(null)
    private var sessionId: String? = null
    private var transcriptBuffer = ""
    private var sequence = 0
    private var speechLocale = Locale.getDefault().toLanguageTag()
    private var analysisLanguage = Locale.getDefault().language
    private var autoDetectLanguage = false
    private var currentDetectedLanguage: String? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var recognitionRetryCount = 0
    private var recognitionRetry: Runnable? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        if (Settings.canDrawOverlays(this)) showOverlay()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        intent?.getStringExtra(EXTRA_SPEECH_LOCALE)
            ?.takeIf { it.isNotBlank() }
            ?.let { speechLocale = it }
        intent?.getStringExtra(EXTRA_ANALYSIS_LANGUAGE)
            ?.takeIf { it.isNotBlank() }
            ?.let { analysisLanguage = it }
        autoDetectLanguage = intent?.getBooleanExtra(EXTRA_AUTO_LANGUAGE_DETECTION, false) ?: false
        if (autoDetectLanguage) analysisLanguage = "auto"
        currentDetectedLanguage = null
        when (intent?.action) {
            ACTION_START -> startSensing()
            ACTION_STOP -> stopSensing()
        }
        return START_STICKY
    }

    private fun startSensing() {
        if (!Settings.canDrawOverlays(this)) {
            status = "Overlay permission required"
            expanded = true
            render()
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            status = "Microphone permission required"
            expanded = true
            render()
            return
        }
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            status = "Input Unavailable: speech recognition is not available"
            sensing = false
            expanded = true
            render()
            return
        }
        sensing = true
        warning = null
        sessionId = "native-${System.currentTimeMillis()}"
        transcriptBuffer = ""
        sequence = 0
        recognitionRetryCount = 0
        status = "Microphone sensing active; remote call audio is unavailable"
        expanded = false
        updateSensingNotification()
        recognizer?.destroy()
        recognizer = SpeechRecognizer.createSpeechRecognizer(this).also { speech ->
            speech.setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: android.os.Bundle?) {
                    recognitionRetryCount = 0
                    val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        ?.firstOrNull().orEmpty()
                    if (text.isBlank()) {
                        status = "Waiting for Input"
                        render()
                    } else {
                        transcriptBuffer = listOf(transcriptBuffer, text)
                            .filter { it.isNotBlank() }
                            .joinToString("\n")
                        status = "Analyzing"
                        render()
                        val language = if (autoDetectLanguage) {
                            currentDetectedLanguage ?: "auto"
                        } else {
                            analysisLanguage
                        }
                        analyzeTranscript(transcriptBuffer, language)
                    }
                    currentDetectedLanguage = null
                    if (sensing) listen(speech)
                }

                override fun onError(error: Int) {
                    scheduleRecognitionRetry(speech, error)
                }

                override fun onReadyForSpeech(params: android.os.Bundle?) {
                    if (sensing) {
                        status = "Microphone active; remote call audio is unavailable"
                        render()
                    }
                }
                override fun onBeginningOfSpeech() {
                    currentDetectedLanguage = null
                }
                override fun onLanguageDetection(results: android.os.Bundle) {
                    if (!autoDetectLanguage) return
                    val confidence = results.getInt(
                        SpeechRecognizer.LANGUAGE_DETECTION_CONFIDENCE_LEVEL,
                        SpeechRecognizer.LANGUAGE_DETECTION_CONFIDENCE_LEVEL_UNKNOWN
                    )
                    val tag = results.getString(SpeechRecognizer.DETECTED_LANGUAGE)
                        ?.takeIf { it.isNotBlank() }
                    if (
                        tag != null
                        && confidence >= SpeechRecognizer.LANGUAGE_DETECTION_CONFIDENCE_LEVEL_CONFIDENT
                    ) {
                        currentDetectedLanguage = Locale.forLanguageTag(tag).language
                        status = "Detected ${Locale.forLanguageTag(tag).getDisplayLanguage(Locale.getDefault())}; analyzing transcript"
                        render()
                    }
                }
                override fun onRmsChanged(rmsdB: Float) = Unit
                override fun onBufferReceived(buffer: ByteArray?) = Unit
                override fun onEndOfSpeech() = Unit
                override fun onPartialResults(partialResults: android.os.Bundle?) = Unit
                override fun onEvent(eventType: Int, params: android.os.Bundle?) = Unit
            })
            listen(speech)
        }
        render()
    }

    private fun listen(speech: SpeechRecognizer) {
        if (!sensing || recognizer !== speech) return
        val request = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, speechLocale)
            if (autoDetectLanguage && Build.VERSION.SDK_INT >= 34) {
                val allowedLanguages = arrayListOf(
                    "en-IN", "hi-IN", "bn-IN", "gu-IN", "mr-IN", "ta-IN", "te-IN",
                    "kn-IN", "ml-IN", "pa-IN", "or-IN", "as-IN", "ur-IN", "ne-NP"
                )
                putExtra(RecognizerIntent.EXTRA_ENABLE_LANGUAGE_DETECTION, true)
                putExtra(RecognizerIntent.EXTRA_ENABLE_LANGUAGE_SWITCH, true)
                putStringArrayListExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_DETECTION_ALLOWED_LANGUAGES,
                    allowedLanguages
                )
                putStringArrayListExtra(
                    RecognizerIntent.EXTRA_LANGUAGE_SWITCH_ALLOWED_LANGUAGES,
                    allowedLanguages
                )
            }
        }
        try {
            speech.startListening(request)
        } catch (_: RuntimeException) {
            scheduleRecognitionRetry(speech, SpeechRecognizer.ERROR_CLIENT)
        }
    }

    private fun scheduleRecognitionRetry(speech: SpeechRecognizer, error: Int) {
        if (!sensing || recognizer !== speech) return
        if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS || recognitionRetryCount >= 3) {
            sensing = false
            status = "Microphone recognition unavailable; use manual transcript input"
            recognitionRetry?.let(mainHandler::removeCallbacks)
            recognitionRetry = null
            speech.cancel()
            speech.destroy()
            recognizer = null
            updateSensingNotification()
            render()
            return
        }

        recognitionRetryCount++
        val delayMs = 1000L * recognitionRetryCount
        status = "Microphone input interrupted; retrying. Remote call audio is unavailable."
        recognitionRetry?.let(mainHandler::removeCallbacks)
        recognitionRetry = Runnable {
            recognitionRetry = null
            listen(speech)
        }.also { mainHandler.postDelayed(it, delayMs) }
        updateSensingNotification()
        render()
    }

    private fun analyzeTranscript(text: String, detectedLanguage: String = analysisLanguage) {
        if (text.isBlank() || !sensing) return
        executor.execute {
            try {
                val response = postJson(
                    "$API_BASE_URL/api/v1/analyze-text",
                    JSONObject()
                        .put("session_id", sessionId)
                        .put("sequence", sequence++)
                        .put("text", text)
                        .put("language", detectedLanguage)
                        .put("is_final", true)
                )
                val result = JSONObject(response)
                val score = result.optDouble("scam_probability", 0.0)
                val tier = result.optInt("action_tier", 0)
                val entities = result.optJSONArray("entities")
                val location = entities?.let { array ->
                    (0 until array.length())
                        .map { array.optJSONObject(it) }
                        .firstOrNull {
                            it?.optString("type") == "LOCATION" ||
                                it.optString("type") == "HOSPITAL"
                        }
                        ?.optString("normalized_text")
                }
                if (tier > 0 || score >= 0.65) {
                    val category = result.optString("place_category", "hospital")
                    val places = if (!location.isNullOrBlank()) searchPlaces(location, category) else emptyList()
                    postToMain {
                        warning = Warning(
                            level = when {
                                tier >= 2 || score >= 0.8 -> "High"
                                tier == 1 || score >= 0.65 -> "Caution"
                                else -> "Insufficient Evidence"
                            },
                            explanation = result.optJSONArray("evidence_indicators")
                                ?.let { indicators ->
                                    (0 until indicators.length())
                                        .map { index -> indicators.optString(index) }
                                        .filter { value -> value.isNotBlank() }
                                        .joinToString(", ")
                                }
                                ?.takeIf { value -> value.isNotBlank() }
                                ?: "The analyzer found indicators that warrant independent verification.",
                            excerpt = text,
                            location = location,
                            detectedLanguage = result.optString("detected_language")
                                .takeIf { it.isNotBlank() && it != "auto" },
                            places = places,
                            notice = result.optString("notice").takeIf { it.isNotBlank() }
                        )
                        expanded = true
                        render()
                    }
                }
            } catch (_: IOException) {
                postToMain {
                    if (sensing) status = "Backend Unavailable"
                    render()
                }
            } catch (_: JSONException) {
                postToMain {
                    if (sensing) status = "Analysis Failed"
                    render()
                }
            }
        }
    }

    private fun searchPlaces(location: String, category: String): List<Place> {
        return try {
            val result = JSONObject(
                postJson(
                    "$API_BASE_URL/api/v1/places/search",
                    JSONObject().put("query", location).put("category", category).put("limit", 3)
                )
            )
            val places = result.optJSONArray("places") ?: return emptyList()
            (0 until places.length()).mapNotNull { index ->
                places.optJSONObject(index)?.let {
                    Place(
                        name = it.optString("name", "Unnamed place"),
                        address = it.optString("address"),
                        phone = it.optString("phone"),
                        distanceKm = if (it.has("distance_km") && !it.isNull("distance_km")) {
                            it.optDouble("distance_km")
                        } else {
                            null
                        },
                        source = it.optString("source", result.optString("provider", "provider")),
                        retrievedAt = it.optString("retrieved_at")
                            .takeIf { value -> value.isNotBlank() }
                    )
                }
            }
        } catch (_: IOException) {
            emptyList()
        } catch (_: JSONException) {
            emptyList()
        }
    }

    private fun postJson(endpoint: String, body: JSONObject): String {
        val connection = URL(endpoint).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 2500
        connection.readTimeout = 4000
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        return try {
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            if (connection.responseCode !in 200..299) {
                throw IOException("HTTP ${connection.responseCode}")
            }
            connection.inputStream.bufferedReader().use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    private fun postToMain(action: () -> Unit) {
        android.os.Handler(mainLooper).post(action)
    }

    private fun stopSensing() {
        sensing = false
        sessionId = null
        transcriptBuffer = ""
        sequence = 0
        warning = null
        status = "Stopped"
        recognitionRetry?.let(mainHandler::removeCallbacks)
        recognitionRetry = null
        recognitionRetryCount = 0
        recognizer?.cancel()
        recognizer?.destroy()
        recognizer = null
        updateSensingNotification()
        expanded = false
        render()
    }

    private fun updateSensingNotification() {
        getSystemService(NotificationManager::class.java)
            .notify(NOTIFICATION_ID, buildNotification())
    }

    private fun render() {
        bubbleView?.setContent { OverlayContent() }
    }

    private fun showOverlay() {
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        bubbleParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            x = 18
            y = 240
        }
        bubbleView = ComposeView(this).also { view ->
            view.setContent { OverlayContent() }
            windowManager.addView(view, bubbleParams)
        }
    }

    @Composable
    private fun OverlayContent() {
        MaterialTheme {
            if (!expanded && warning == null) {
                IconButton(
                    onClick = { expanded = true; render() },
                    modifier = Modifier
                        .size(60.dp)
                        .background(if (sensing) Color(0xFFB45309) else Color(0xFF0F172A), CircleShape)
                        .pointerInput(Unit) {
                            detectDragGestures { change, dragAmount ->
                                change.consume()
                                bubbleParams?.let {
                                    it.x -= dragAmount.x.toInt()
                                    it.y += dragAmount.y.toInt()
                                    windowManager.updateViewLayout(bubbleView, it)
                                }
                            }
                        }
                ) {
                    Icon(
                        imageVector = if (sensing) Icons.Default.Warning else Icons.Default.Shield,
                        contentDescription = if (sensing) "Sensing active" else "Open Satark controls",
                        tint = Color.White
                    )
                }
            } else {
                Surface(
                    modifier = Modifier.padding(8.dp),
                    shape = RoundedCornerShape(18.dp),
                    color = Color(0xFF0F172A),
                    contentColor = Color.White,
                    shadowElevation = 12.dp
                ) {
                    Column(
                        modifier = Modifier.padding(14.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Shield, contentDescription = null)
                                Text(" SATARK", style = MaterialTheme.typography.titleMedium)
                            }
                            IconButton(onClick = { warning = null; expanded = false; render() }) {
                                Icon(Icons.Default.Close, contentDescription = "Dismiss")
                            }
                        }
                        warning?.let { current ->
                            Text(current.level, color = if (current.level == "High") Color(0xFFF87171) else Color(0xFFFBBF24))
                            Text(current.explanation)
                            current.detectedLanguage?.let {
                                Text("Detected language: ${Locale.forLanguageTag(it).getDisplayLanguage(Locale.getDefault())}")
                            }
                            Text("Transcript: “${current.excerpt}”")
                            current.location?.let { Text("Detected location: $it") }
                            current.places.forEach { place ->
                                Text(place.name, style = MaterialTheme.typography.titleSmall)
                                if (place.address.isNotBlank()) Text(place.address)
                                place.distanceKm?.let { Text("Approx. ${it} km away") }
                                Text(if (place.phone.isBlank()) "Phone number unavailable." else place.phone)
                                Text("Source: ${place.source}${place.retrievedAt?.let { " • $it" } ?: ""}")
                                if (place.phone.isNotBlank()) {
                                    TextButton(onClick = {
                                        startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${place.phone}")))
                                    }) {
                                        Icon(Icons.Default.Call, contentDescription = null)
                                        Text(" Call to Verify")
                                    }
                                }
                            }
                            current.notice?.let { Text(it, color = Color(0xFFCBD5E1)) }
                            Text("Verify independently before sending money.")
                        } ?: run {
                            Text(status, color = if (sensing) Color(0xFFFBBF24) else Color(0xFF94A3B8))
                            Text(
                                "Uses the device microphone only. Android does not provide remote SIM/WhatsApp call audio to this service.",
                                style = MaterialTheme.typography.bodySmall
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(
                                    onClick = { startSensing() },
                                    enabled = !sensing,
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF16A34A))
                                ) {
                                    Icon(Icons.Default.Mic, contentDescription = null)
                                    Text(" Start Sensing")
                                }
                                TextButton(onClick = { stopSensing() }, enabled = sensing) {
                                    Text("Stop Sensing")
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java)
                .createNotificationChannel(
                    NotificationChannel(CHANNEL_ID, "Satark overlay", NotificationManager.IMPORTANCE_LOW)
                )
        }
    }

    private fun buildNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(if (sensing) "SATARK microphone sensing active" else "SATARK is ready")
            .setContentText(
                if (sensing) "Device microphone only; remote call audio is unavailable."
                else "Tap the floating shield to start or stop sensing."
            )
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        sensing = false
        recognizer?.destroy()
        executor.shutdownNow()
        bubbleView?.let { if (::windowManager.isInitialized) windowManager.removeView(it) }
        bubbleView = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
