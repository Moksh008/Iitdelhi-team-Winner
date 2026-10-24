package `in`.satark.shield

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
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
import android.util.Log
import android.view.Gravity
import android.view.WindowManager
import androidx.core.content.ContextCompat
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material.icons.filled.OpenInNew
import androidx.compose.material.icons.filled.Shield
import androidx.compose.material.icons.filled.Stop
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
import androidx.compose.ui.unit.sp
import androidx.core.app.NotificationCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.lifecycle.ViewModelStore
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.SavedStateRegistry
import androidx.savedstate.SavedStateRegistryController
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors

class SatarkLifecycleOwner : LifecycleOwner, SavedStateRegistryOwner, ViewModelStoreOwner {
    private val lifecycleRegistry = LifecycleRegistry(this)
    private val savedStateRegistryController = SavedStateRegistryController.create(this)
    private val store = ViewModelStore()

    init {
        savedStateRegistryController.performRestore(null)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_CREATE)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_START)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_RESUME)
    }

    override val lifecycle: Lifecycle get() = lifecycleRegistry
    override val savedStateRegistry: SavedStateRegistry get() = savedStateRegistryController.savedStateRegistry
    override val viewModelStore: ViewModelStore get() = store

    fun destroy() {
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_PAUSE)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_STOP)
        lifecycleRegistry.handleLifecycleEvent(Lifecycle.Event.ON_DESTROY)
        store.clear()
    }
}

class SatarkOverlayService : Service() {
    companion object {
        const val ACTION_START = "in.satark.shield.START_SENSING"
        const val ACTION_STOP = "in.satark.shield.STOP_SENSING"
        const val EXTRA_SPEECH_LOCALE = "speech_locale"
        const val EXTRA_ANALYSIS_LANGUAGE = "analysis_language"
        const val EXTRA_AUTO_LANGUAGE_DETECTION = "auto_language_detection"
        private const val CHANNEL_ID = "satark_overlay"
        private const val NOTIFICATION_ID = 4242
        private val API_BASE_URL = (if (BuildConfig.SATARK_API_BASE_URL.isNotBlank()) BuildConfig.SATARK_API_BASE_URL else "http://10.0.2.2:8000").trimEnd('/')
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
    private var lifecycleOwner: SatarkLifecycleOwner? = null
    private var recognizer: SpeechRecognizer? = null
    private val executor = Executors.newSingleThreadExecutor()
    private var sensing by mutableStateOf(false)
    private var expanded by mutableStateOf(false)
    private var status by mutableStateOf("Sensing Paused")
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
        promoteToForeground()
        if (Settings.canDrawOverlays(this)) showOverlay()
    }

    private fun promoteToForeground() {
        val hasMicPermission = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val serviceType = if (hasMicPermission) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE or ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                } else {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                }
            } else {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                } else {
                    0
                }
            }
            try {
                startForeground(NOTIFICATION_ID, buildNotification(), serviceType)
            } catch (e: Exception) {
                Log.w("SatarkOverlayService", "Failed to startForeground with type $serviceType, trying fallback", e)
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                        startForeground(NOTIFICATION_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                    } else {
                        startForeground(NOTIFICATION_ID, buildNotification())
                    }
                } catch (e2: Exception) {
                    Log.e("SatarkOverlayService", "Fallback startForeground failed", e2)
                }
            }
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }
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
            status = "Speech recognition service unavailable on device"
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
        status = "Microphone active (Call Audio Unavailable)"
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
                        status = "Listening for speech..."
                        render()
                    } else {
                        transcriptBuffer = listOf(transcriptBuffer, text)
                            .filter { it.isNotBlank() }
                            .joinToString("\n")
                        status = "Analyzing transcript..."
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
                        status = "Microphone active (Call Audio Unavailable)"
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
                        status = "Detected ${Locale.forLanguageTag(tag).getDisplayLanguage(Locale.getDefault())}; analyzing"
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
            status = "Microphone speech input paused (Use Manual Fallback)"
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
        status = "Microphone retrying... (Call Audio Unavailable)"
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
                    "$API_BASE_URL/api/v1/analyze-transcript",
                    JSONObject()
                        .put("session_id", sessionId)
                        .put("sequence", sequence++)
                        .put("text", text)
                        .put("language", detectedLanguage)
                        .put("is_final", true)
                )
                val result = JSONObject(response)
                val score = result.optDouble("scam_probability", result.optDouble("score", 0.0))
                val tier = result.optInt("action_tier", 0)
                val entities = result.optJSONArray("entities")
                val location = result.optString("extracted_location").takeIf { !it.isNullOrBlank() } ?: entities?.let { array ->
                    (0 until array.length())
                        .map { array.optJSONObject(it) }
                        .firstOrNull {
                            it?.optString("type") == "LOCATION" ||
                                it?.optString("type") == "HOSPITAL"
                        }
                        ?.optString("normalized_text")
                }
                if (tier > 0 || score >= 0.60) {
                    val category = result.optString("place_category", "hospital")
                    val places = if (!location.isNullOrBlank()) searchPlaces(location, category) else emptyList()
                    postToMain {
                        warning = Warning(
                            level = when {
                                tier >= 2 || score >= 0.8 -> "High"
                                tier == 1 || score >= 0.60 -> "Caution"
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
                                ?: result.optString("guidance").takeIf { it.isNotBlank() }
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
                    if (sensing) status = "Backend Offline"
                    render()
                }
            } catch (_: JSONException) {
                postToMain {
                    if (sensing) status = "Analysis Error"
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
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun postJson(endpoint: String, body: JSONObject): String {
        val connection = URL(endpoint).openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 3000
        connection.readTimeout = 5000
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
        Handler(Looper.getMainLooper()).post(action)
    }

    private fun stopSensing() {
        sensing = false
        sessionId = null
        transcriptBuffer = ""
        sequence = 0
        warning = null
        status = "Sensing Paused"
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
        promoteToForeground()
    }

    private fun render() {
        bubbleView?.setContent { OverlayContent() }
    }

    private fun showOverlay() {
        if (bubbleView != null) return
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
            x = 20
            y = 260
        }

        val owner = SatarkLifecycleOwner()
        lifecycleOwner = owner

        bubbleView = ComposeView(this).also { view ->
            view.setViewTreeLifecycleOwner(owner)
            view.setViewTreeSavedStateRegistryOwner(owner)
            view.setViewTreeViewModelStoreOwner(owner)
            view.setContent { OverlayContent() }
            windowManager.addView(view, bubbleParams)
        }
    }

    private fun openFullApp() {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        startActivity(intent)
        expanded = false
        render()
    }

    @Composable
    private fun OverlayContent() {
        MaterialTheme {
            if (!expanded && warning == null) {
                // Circular Assistive Touch Shield Bubble (~54dp)
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(54.dp)
                        .background(
                            color = if (sensing) Color(0xFF0F172A) else Color(0xFF0A0F1D),
                            shape = CircleShape
                        )
                        .border(
                            width = 2.dp,
                            color = if (sensing) Color(0xFF34D399) else Color(0xFF38BDF8),
                            shape = CircleShape
                        )
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
                    IconButton(
                        onClick = { expanded = true; render() },
                        modifier = Modifier.size(48.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Shield,
                            contentDescription = "SATARK Shield Floating Controls",
                            tint = if (sensing) Color(0xFF34D399) else Color(0xFF38BDF8),
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }
            } else {
                // Compact Floating Panel Overlay
                Surface(
                    modifier = Modifier
                        .fillMaxWidth(0.92f)
                        .padding(6.dp),
                    shape = RoundedCornerShape(20.dp),
                    color = Color(0xFF0F172A),
                    contentColor = Color.White,
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFF38BDF8).copy(alpha = 0.4f)),
                    shadowElevation = 16.dp
                ) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        // Header Row
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Shield,
                                    contentDescription = null,
                                    tint = Color(0xFF38BDF8),
                                    modifier = Modifier.size(24.dp)
                                )
                                Text(
                                    text = "SATARK | सतर्क",
                                    style = MaterialTheme.typography.titleMedium,
                                    color = Color.White
                                )
                            }
                            IconButton(onClick = { warning = null; expanded = false; render() }) {
                                Icon(
                                    imageVector = Icons.Default.Close,
                                    contentDescription = "Minimize Panel",
                                    tint = Color(0xFF94A3B8)
                                )
                            }
                        }

                        // Suspicious Call Warning Card (if warning != null)
                        warning?.let { current ->
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = if (current.level == "High") Color(0x33EF4444) else Color(0x33F59E0B),
                                border = androidx.compose.foundation.BorderStroke(
                                    1.dp,
                                    if (current.level == "High") Color(0xFFEF4444) else Color(0xFFF59E0B)
                                ),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Icon(
                                            Icons.Default.Warning,
                                            contentDescription = null,
                                            tint = if (current.level == "High") Color(0xFFF87171) else Color(0xFFFBBF24)
                                        )
                                        Text(
                                            text = if (current.level == "High") "POSSIBLE SCAM DETECTED" else "CAUTION REQUIRED",
                                            color = if (current.level == "High") Color(0xFFF87171) else Color(0xFFFBBF24),
                                            fontSize = 14.sp,
                                            style = MaterialTheme.typography.titleSmall
                                        )
                                    }
                                    Text(text = current.explanation, fontSize = 12.sp, color = Color(0xFFE2E8F0))
                                    Text(
                                        text = "“${current.excerpt}”",
                                        fontSize = 11.sp,
                                        color = Color(0xFF94A3B8),
                                        modifier = Modifier
                                            .background(Color(0x22FFFFFF), RoundedCornerShape(6.dp))
                                            .padding(6.dp)
                                    )
                                    current.location?.let {
                                        Text(text = "Detected location: $it", fontSize = 12.sp, color = Color(0xFF67E8F9))
                                    }
                                    current.places.forEach { place ->
                                        Surface(
                                            shape = RoundedCornerShape(8.dp),
                                            color = Color(0xFF1E293B),
                                            modifier = Modifier.fillMaxWidth().padding(top = 4.dp)
                                        ) {
                                            Column(modifier = Modifier.padding(8.dp)) {
                                                Text(place.name, style = MaterialTheme.typography.titleSmall, fontSize = 12.sp, color = Color.White)
                                                if (place.address.isNotBlank()) Text(place.address, fontSize = 11.sp, color = Color(0xFFCBD5E1))
                                                if (place.phone.isNotBlank()) {
                                                    TextButton(
                                                        onClick = {
                                                            startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${place.phone}")))
                                                        },
                                                        modifier = Modifier.padding(top = 2.dp)
                                                    ) {
                                                        Icon(Icons.Default.Call, contentDescription = null, modifier = Modifier.size(14.dp))
                                                        Text(" Call Official: ${place.phone}", fontSize = 11.sp, color = Color(0xFF38BDF8))
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    Text(
                                        text = "Verify independently before sending money.",
                                        fontSize = 11.sp,
                                        color = Color(0xFFFBBF24),
                                        modifier = Modifier.padding(top = 4.dp)
                                    )
                                }
                            }
                        } ?: run {
                            // Normal Controls Panel
                            Text(
                                text = "Backend: $API_BASE_URL",
                                fontSize = 11.sp,
                                color = Color(0xFF67E8F9)
                            )
                            Text(
                                text = "Status: $status",
                                fontSize = 13.sp,
                                color = if (sensing) Color(0xFF34D399) else Color(0xFFFBBF24)
                            )
                            Text(
                                text = "Note: Uses device microphone only. Android restricts third-party app access to remote cellular/WhatsApp call audio.",
                                fontSize = 10.sp,
                                color = Color(0xFF94A3B8),
                                lineHeight = 14.sp
                            )
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                if (!sensing) {
                                    Button(
                                        onClick = { startSensing() },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF10B981)),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Icon(Icons.Default.Mic, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Text(" Start Sensing", fontSize = 12.sp)
                                    }
                                } else {
                                    Button(
                                        onClick = { stopSensing() },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFEF4444)),
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Icon(Icons.Default.Stop, contentDescription = null, modifier = Modifier.size(16.dp))
                                        Text(" Stop Sensing", fontSize = 12.sp)
                                    }
                                }
                                TextButton(onClick = { openFullApp() }) {
                                    Icon(Icons.Default.OpenInNew, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Text(" Open App", fontSize = 12.sp, color = Color(0xFF38BDF8))
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
                ?.createNotificationChannel(
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
        lifecycleOwner?.destroy()
        lifecycleOwner = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
