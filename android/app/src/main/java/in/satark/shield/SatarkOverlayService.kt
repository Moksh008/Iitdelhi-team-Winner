package `in`.satark.shield

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ComponentCallbacks2
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.WindowManager
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
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
import androidx.core.content.ContextCompat
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
import org.json.JSONArray
import org.json.JSONObject
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

/**
 * Floating bubble + microphone sensing. Speech is transcribed on the device by
 * Whisper and checked by the deterministic rules; nothing is sent off the phone.
 * The bubble only shows an advisory — it never blocks payments or calls anyone.
 */
class SatarkOverlayService : Service() {
    companion object {
        const val ACTION_START = "in.satark.shield.START_SENSING"
        const val ACTION_STOP = "in.satark.shield.STOP_SENSING"
        /** Set when listening was started from the Satark screen, which shows the live text itself. */
        const val EXTRA_FROM_APP = "from_app"
        /** Debug builds only: feed a WAV through the same segmenter the microphone uses. */
        const val ACTION_DEBUG_FEED = "in.satark.shield.DEBUG_FEED"
        const val EXTRA_WAV_PATH = "wav_path"
        private const val CHANNEL_ID = "satark_overlay"
        private const val NOTIFICATION_ID = 4242
        private const val MAX_TRANSCRIPT_CHARS = 1200
        private const val MAX_BATCH_SAMPLES = 25 * WhisperEngine.SAMPLE_RATE
        private const val WATCHDOG_MS = 2000L
        private const val RESTART_AFTER_MS = 4000L
        @Volatile var isRunning = false
            private set
        @Volatile var isListening = false
            private set
        /** Debug builds only: last transcript and alert, read by SatarkNativePlugin.debugOverlayState. */
        @Volatile var debugState: JSONObject = JSONObject()
            private set
        const val ACTION_DEBUG_OPEN_DETAILS = "in.satark.shield.DEBUG_OPEN_DETAILS"
        @Volatile private var instance: SatarkOverlayService? = null

        /** Called by MainActivity: hide the bubble while Satark itself is on screen. */
        fun onAppVisibilityChanged(appVisible: Boolean) {
            val service = instance ?: return
            service.mainHandler.post {
                if (appVisible) service.hideOverlay() else service.showOverlay()
            }
        }

        /** Latest listening state, for the app to read when it opens. */
        @Volatile var latestState: JSONObject = JSONObject().put("listening", false).put("status", "Not listening")
            private set
    }

    private lateinit var windowManager: WindowManager
    private var bubbleView: ComposeView? = null
    private var bubbleParams: WindowManager.LayoutParams? = null
    private var lifecycleOwner: SatarkLifecycleOwner? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val transcriber = Executors.newSingleThreadExecutor()
    private val waitingAudio = ArrayDeque<FloatArray>()
    private var transcribeScheduled = false
    private var capture: MicrophoneCapture? = null
    private lateinit var rules: SatarkRules
    private var session: SatarkRules.Session? = null
    private var transcript = ""

    private var sensingState = mutableStateOf(false)
    private var sensing: Boolean
        get() = sensingState.value
        set(value) {
            sensingState.value = value
            isListening = value
        }
    private var expanded by mutableStateOf(false)
    private var status by mutableStateOf("Not listening")
    private var lastHeard by mutableStateOf("")
    /** Last few things heard, newest last, shown live in the bubble and the app. */
    private var heardLines by mutableStateOf(listOf<String>())
    /** Microphone loudness 0..1 for the level meter. */
    private var micLevel by mutableStateOf(0f)
    private var hearingSpeech by mutableStateOf(false)
    private var transcribing by mutableStateOf(false)
    private var micBlocked by mutableStateOf(false)
    private var inCall by mutableStateOf(false)
    private var blockedSince = 0L
    private var lastRestart = 0L
    private var lastLevelPublish = 0L
    private var alert by mutableStateOf<SatarkRules.Result?>(null)
    private var alertExcerpt = ""

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        instance = this
        rules = SatarkRules(assets.open("scam-lexicon.json").bufferedReader().use { it.readText() })
        createNotificationChannel()
        promoteToForeground()
        if (Settings.canDrawOverlays(this)) showOverlay()
    }

    private fun hasMicPermission() =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    private fun promoteToForeground() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val type = when {
                sensing && hasMicPermission() -> ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE -> ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                else -> 0
            }
            try {
                startForeground(NOTIFICATION_ID, notification, type)
            } catch (error: Exception) {
                Log.w("SatarkOverlay", "startForeground with type $type failed", error)
                startForeground(NOTIFICATION_ID, notification)
            }
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> startSensing(fromApp = intent.getBooleanExtra(EXTRA_FROM_APP, false))
            ACTION_STOP -> stopSensing()
            ACTION_DEBUG_FEED -> if (BuildConfig.DEBUG) debugFeed(intent.getStringExtra(EXTRA_WAV_PATH))
            ACTION_DEBUG_OPEN_DETAILS -> if (BuildConfig.DEBUG && alert != null) openDetails()
        }
        return START_NOT_STICKY
    }

    private fun startSensing(fromApp: Boolean = false) {
        if (sensing) return
        when {
            !Settings.canDrawOverlays(this) -> { status = "Allow 'Display over other apps' first"; expanded = true; render(); return }
            !hasMicPermission() -> { status = "Microphone permission required"; expanded = true; render(); return }
            !SpeechModel.isBundled(this) -> { status = "Speech model missing from this build"; expanded = true; render(); return }
        }
        sensing = true
        alert = null
        transcript = ""
        lastHeard = ""
        heardLines = emptyList()
        micBlocked = false
        session = rules.Session()
        status = "Loading on-device speech model…"
        // The app shows the live text itself; open the panel only over other apps.
        expanded = !fromApp && !MainActivity.isInForeground
        promoteToForeground()
        render()
        publish()
        transcriber.execute {
            try {
                SpeechModel.get(this)
                mainHandler.post {
                    if (!sensing) return@post
                    startCapture()
                    status = "Listening - speak now"
                    render()
                    publish()
                    mainHandler.removeCallbacks(micWatchdog)
                    mainHandler.postDelayed(micWatchdog, WATCHDOG_MS)
                }
            } catch (error: Throwable) {
                Log.e("SatarkOverlay", "speech model failed to load", error)
                mainHandler.post {
                    sensing = false
                    status = if (error is OutOfMemoryError) "Not enough memory for speech recognition" else "Speech model failed to load"
                    expanded = true
                    promoteToForeground()
                    render()
                    publish()
                }
            }
        }
    }

    private fun startCapture() {
        val segmenter = SpeechSegmenter(onUtterance = ::onUtterance, onLevel = ::onLevel)
        capture = MicrophoneCapture(
            segmenter,
            onError = { message ->
                mainHandler.post { if (sensing) { stopSensing(); status = message; expanded = true; render(); publish() } }
            },
            onSilenced = { blocked ->
                mainHandler.post {
                    micBlocked = blocked
                    blockedSince = if (blocked) System.currentTimeMillis() else 0L
                    refreshStatus()
                    publish()
                }
            },
        ).also { it.start() }
    }

    /** True while a phone or VoIP call holds the audio system. Needs no permission. */
    private fun phoneCallActive(): Boolean {
        val mode = (getSystemService(AUDIO_SERVICE) as AudioManager).mode
        return mode == AudioManager.MODE_IN_CALL || mode == AudioManager.MODE_IN_COMMUNICATION ||
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && mode == AudioManager.MODE_CALL_SCREENING)
    }

    /**
     * Android gives other apps silence from the microphone during a call (and the
     * recorder can stay silent after it). Every few seconds: note whether a call is
     * on, and once the call is over restart a microphone that is still silent.
     */
    private val micWatchdog = object : Runnable {
        override fun run() {
            if (!sensing) return
            val call = phoneCallActive()
            if (call != inCall) {
                inCall = call
                refreshStatus()
                render()
                publish()
            }
            val now = System.currentTimeMillis()
            if (micBlocked && !call && blockedSince > 0 && now - blockedSince > RESTART_AFTER_MS && now - lastRestart > RESTART_AFTER_MS) {
                lastRestart = now
                Log.i("SatarkOverlay", "microphone still silent after the call; restarting it")
                val old = capture
                capture = null
                Thread({
                    old?.stop()
                    mainHandler.post {
                        if (!sensing) return@post
                        micBlocked = false
                        blockedSince = 0L
                        startCapture()
                        refreshStatus()
                        publish()
                    }
                }, "satark-mic-restart").start()
            }
            mainHandler.postDelayed(this, WATCHDOG_MS)
        }
    }

    private var debugSegmenter: SpeechSegmenter? = null

    private fun debugFeed(path: String?) {
        if (path == null || !sensing) return
        val segmenter = debugSegmenter ?: SpeechSegmenter(onUtterance = ::onUtterance, onLevel = ::onLevel).also { debugSegmenter = it }
        Thread {
            val audio = SpeechModel.readWav(java.io.File(path))
            // 100 ms frames, as from the microphone, followed by 1.5 s of silence.
            val padded = audio.copyOf(audio.size + 24_000)
            for (start in 0 until padded.size - 1599 step 1600) {
                segmenter.accept(padded.copyOfRange(start, start + 1600))
                Thread.sleep(100) // real-time pace, like the microphone
            }
        }.start()
    }

    /** Called on the microphone thread for every 100 ms frame. */
    private fun onLevel(rms: Float, inSpeech: Boolean) {
        val now = System.currentTimeMillis()
        if (now - lastLevelPublish < 200) return
        lastLevelPublish = now
        // Speech is roughly 0.005-0.2 RMS; show it on a log-like 0..1 scale.
        val level = (kotlin.math.ln(1f + rms * 400f) / kotlin.math.ln(81f)).coerceIn(0f, 1f)
        mainHandler.post {
            if (!sensing) return@post
            micLevel = level
            if (hearingSpeech != inSpeech) {
                hearingSpeech = inSpeech
                refreshStatus()
            }
            publish()
        }
    }

    private fun onUtterance(audio: FloatArray) {
        mainHandler.post { transcribing = true; refreshStatus(); publish() }
        // Never drop speech: if the transcriber is busy, utterances wait here and
        // are transcribed together next (Whisper handles up to 30 s at once).
        synchronized(waitingAudio) {
            waitingAudio.add(audio)
            if (transcribeScheduled) return
            transcribeScheduled = true
        }
        transcriber.execute(::transcribeWaiting)
    }

    private fun transcribeWaiting() {
        while (true) {
            val batch = synchronized(waitingAudio) {
                if (waitingAudio.isEmpty()) {
                    transcribeScheduled = false
                    mainHandler.post {
                        transcribing = false
                        refreshStatus()
                        publish()
                    }
                    return
                }
                // Take as many waiting utterances as fit in one 25 s window.
                val taken = ArrayList<FloatArray>()
                var samples = 0
                while (waitingAudio.isNotEmpty() && (taken.isEmpty() || samples + waitingAudio.first().size <= MAX_BATCH_SAMPLES)) {
                    val next = waitingAudio.removeFirst()
                    taken.add(next)
                    samples += next.size
                }
                taken
            }
            val audio = FloatArray(batch.sumOf { it.size })
            var offset = 0
            for (part in batch) { part.copyInto(audio, offset); offset += part.size }
            try {
                val result = SpeechModel.get(this).transcribe(audio)
                Log.i("SatarkOverlay", "transcribed ${audio.size / 16} ms audio (${batch.size} utterance(s)): encoder ${result.encoderMs} ms, decoder ${result.decoderMs} ms, ${result.tokens} tokens")
                if (result.text.isNotBlank()) {
                    mainHandler.post { onTranscript(result.text) }
                } else {
                    mainHandler.post { addHeardLine("(sound heard, but no words could be made out)"); publish() }
                }
            } catch (error: Throwable) {
                Log.w("SatarkOverlay", "transcription failed", error)
                mainHandler.post { status = "Could not transcribe that part"; render(); publish() }
            }
        }
    }

    private fun onTranscript(text: String) {
        if (!sensing) return
        val current = session ?: return
        transcript = (transcript + "\n" + text).takeLast(MAX_TRANSCRIPT_CHARS).trim()
        lastHeard = text
        addHeardLine(text)
        val result = current.ingest(text)
        if (result.actionTier > 0) {
            val previous = alert
            if (previous == null || result.conversationScore > previous.conversationScore || result.category != previous.category) {
                alert = result
                alertExcerpt = transcript.takeLast(400)
                if (!MainActivity.isInForeground) expanded = true
            }
        }
        render()
        publish()
    }

    /** Recomputes the listening status line from the current state. */
    private fun refreshStatus() {
        if (!sensing) return
        status = when {
            micBlocked && inCall -> "Android mutes the microphone for other apps during a phone call, so Satark cannot hear this call. Listening resumes by itself when the call ends. To check a call, run Satark on a second phone next to the speaker."
            micBlocked -> "No sound is reaching Satark from the microphone. Another app (call recorder, voice assistant) may be using it. Trying again by itself…"
            transcribing -> "Converting speech to text on this phone..."
            hearingSpeech -> "Hearing speech..."
            else -> "Listening - speak now"
        }
    }

    private fun addHeardLine(line: String) {
        heardLines = (heardLines + line).takeLast(6)
    }

    /** Current listening state, sent to the app so it can show the live transcript. */
    private fun stateJson(): JSONObject = JSONObject()
        .put("listening", sensing)
        .put("status", status)
        .put("level", micLevel.toDouble())
        .put("hearingSpeech", hearingSpeech)
        .put("transcribing", transcribing)
        .put("micBlocked", micBlocked)
        .put("inCall", inCall)
        .put("lines", JSONArray(heardLines))
        .put("transcript", transcript)
        .put("expanded", expanded)
        .put("alert", alert?.let { alertJson(it) } ?: JSONObject.NULL)

    private fun publish() {
        val state = stateJson()
        latestState = state
        if (BuildConfig.DEBUG) debugState = state
        SatarkNativePlugin.instance?.notifyListeningUpdate(state)
    }

    /** @param collapse close the bubble's panel too (not when Stop was pressed in the panel itself). */
    private fun stopSensing(collapse: Boolean = true) {
        sensing = false
        mainHandler.removeCallbacks(micWatchdog)
        inCall = false
        blockedSince = 0L
        capture?.stop()
        capture = null
        debugSegmenter = null
        synchronized(waitingAudio) { waitingAudio.clear() }
        session = null
        transcript = ""
        lastHeard = ""
        heardLines = emptyList()
        micLevel = 0f
        hearingSpeech = false
        transcribing = false
        micBlocked = false
        alert = null
        status = "Not listening"
        if (collapse) expanded = false
        promoteToForeground()
        render()
        publish()
    }

    private fun alertJson(result: SatarkRules.Result): JSONObject = JSONObject().apply {
        put("action_tier", result.actionTier)
        put("risk_level", result.riskLevel)
        put("conversation_score", result.conversationScore)
        put("category", result.category)
        put("title", result.title)
        put("advice", result.advice)
        put("transcript_excerpt", alertExcerpt)
        put("indicators", JSONArray().apply {
            result.indicators.forEach { indicator ->
                put(JSONObject().put("cluster", indicator.cluster).put("label", indicator.label).put("terms", JSONArray(indicator.terms)))
            }
        })
        put("evidence_indicators", JSONArray(result.indicators.map { it.label }))
    }

    private fun openDetails() {
        alert?.let { PendingAlertStore.put(alertJson(it)) }
        startActivity(Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        })
        SatarkNativePlugin.instance?.notifyAlertOpened()
        expanded = false
        render()
    }

    private fun openFullApp() {
        startActivity(Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        })
        expanded = false
        render()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) {
            AlertExplainer.release()
            if (!sensing) SpeechModel.release()
        }
    }

    private fun render() {
        bubbleView?.setContent { OverlayContent() }
    }

    private fun showOverlay() {
        // Satark's own screen already shows everything; the bubble is only for other apps.
        if (bubbleView != null || MainActivity.isInForeground || !Settings.canDrawOverlays(this)) return
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        val previous = bubbleParams
        bubbleParams = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.END
            // Keep the position the user dragged it to.
            x = previous?.x ?: 20
            y = previous?.y ?: 260
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

    /** Removes the bubble window (it is rebuilt by [showOverlay]). */
    private fun hideOverlay() {
        bubbleView?.let { view -> if (::windowManager.isInitialized) windowManager.removeView(view) }
        bubbleView = null
        lifecycleOwner?.destroy()
        lifecycleOwner = null
    }

    @Composable
    private fun OverlayContent() {
        MaterialTheme {
            if (!expanded) {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier
                        .size(54.dp)
                        .background(color = if (sensing) Color(0xFFFFFFFF) else Color(0xFFFFFFFF), shape = CircleShape)
                        .border(
                            width = 2.dp,
                            color = when {
                                alert != null -> Color(0xFFB45309)
                                sensing -> Color(0xFF047857)
                                else -> Color(0xFF1D4ED8)
                            },
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
                    IconButton(onClick = { expanded = true; render() }, modifier = Modifier.size(48.dp)) {
                        Icon(
                            imageVector = if (alert != null) Icons.Default.Warning else Icons.Default.Shield,
                            contentDescription = "Satark floating controls",
                            tint = when {
                                alert != null -> Color(0xFFB45309)
                                sensing -> Color(0xFF047857)
                                else -> Color(0xFF1D4ED8)
                            },
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }
            } else {
                Surface(
                    modifier = Modifier.fillMaxWidth(0.92f).padding(6.dp),
                    shape = RoundedCornerShape(20.dp),
                    color = Color(0xFFFFFFFF),
                    contentColor = Color(0xFF111827),
                    border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFE3E6EB)),
                    shadowElevation = 16.dp
                ) {
                    // Never taller than ~75% of the screen; scrolls if the content is longer.
                    val maxHeight = (LocalConfiguration.current.screenHeightDp * 0.75f).dp
                    Column(
                        modifier = Modifier
                            .heightIn(max = maxHeight)
                            .verticalScroll(rememberScrollState())
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.Default.Shield, contentDescription = null, tint = Color(0xFF1D4ED8), modifier = Modifier.size(24.dp))
                                Text(text = "SATARK | सतर्क", style = MaterialTheme.typography.titleMedium, color = Color(0xFF111827))
                            }
                            IconButton(onClick = { expanded = false; render() }) {
                                Icon(Icons.Default.Close, contentDescription = "Minimise", tint = Color(0xFF5B6474))
                            }
                        }

                        // Controls first, so they are always reachable.
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (!sensing) {
                                Button(
                                    onClick = { startSensing() },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1D4ED8)),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(Icons.Default.Mic, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Text(" Start listening", fontSize = 12.sp)
                                }
                            } else {
                                Button(
                                    onClick = { stopSensing(collapse = false) },
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFC62828)),
                                    modifier = Modifier.weight(1f)
                                ) {
                                    Icon(Icons.Default.Stop, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Text(" Stop", fontSize = 12.sp)
                                }
                            }
                            TextButton(onClick = { openFullApp() }) {
                                Icon(Icons.Default.OpenInNew, contentDescription = null, modifier = Modifier.size(16.dp))
                                Text(" Open app", fontSize = 12.sp, color = Color(0xFF1D4ED8))
                            }
                        }

                        alert?.let { current ->
                            val high = current.riskLevel == "high"
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = if (high) Color(0xFFFDECEC) else Color(0xFFFFF4E0),
                                border = androidx.compose.foundation.BorderStroke(1.dp, if (high) Color(0xFFC62828) else Color(0xFFB45309)),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                        Icon(Icons.Default.Warning, contentDescription = null, tint = if (high) Color(0xFFC62828) else Color(0xFFB45309))
                                        Text(
                                            text = current.title ?: "Verify this call",
                                            color = if (high) Color(0xFFC62828) else Color(0xFFB45309),
                                            fontSize = 14.sp,
                                            style = MaterialTheme.typography.titleSmall
                                        )
                                    }
                                    current.advice?.let { Text(text = it, fontSize = 12.sp, color = Color(0xFF111827)) }
                                    Text(
                                        text = "Heard: " + current.indicators.joinToString("; ") { it.label },
                                        fontSize = 11.sp,
                                        color = Color(0xFF374151)
                                    )
                                    Text(
                                        text = "“…${alertExcerpt.replace('\n', ' ').takeLast(110)}”",
                                        fontSize = 11.sp,
                                        color = Color(0xFF5B6474),
                                        modifier = Modifier.background(Color(0xFFF1F3F6), RoundedCornerShape(6.dp)).padding(6.dp)
                                    )
                                    Text(
                                        text = "This is advice, not proof. Satark never blocks payments.",
                                        fontSize = 10.sp,
                                        color = Color(0xFF5B6474)
                                    )
                                    Button(
                                        onClick = { openDetails() },
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1D4ED8)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Icon(Icons.Default.OpenInNew, contentDescription = null, modifier = Modifier.size(14.dp))
                                        Text(" Details & nearby help", fontSize = 12.sp)
                                    }
                                    TextButton(onClick = { alert = null; render(); publish() }, modifier = Modifier.fillMaxWidth()) {
                                        Text("Dismiss", fontSize = 12.sp, color = Color(0xFF5B6474))
                                    }
                                }
                            }
                        }

                        Text(text = "Status: $status", fontSize = 13.sp, color = if (sensing) Color(0xFF047857) else Color(0xFFB45309))
                        if (sensing) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.Default.Mic, contentDescription = null, tint = if (hearingSpeech) Color(0xFF047857) else Color(0xFF5B6474), modifier = Modifier.size(16.dp))
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(8.dp)
                                        .background(Color(0xFFF1F3F6), RoundedCornerShape(4.dp))
                                ) {
                                    Box(
                                        modifier = Modifier
                                            .fillMaxWidth(micLevel.coerceIn(0.02f, 1f))
                                            .height(8.dp)
                                            .background(if (hearingSpeech) Color(0xFF047857) else Color(0xFF1D4ED8), RoundedCornerShape(4.dp))
                                    )
                                }
                            }
                            Text(text = "What Satark heard:", fontSize = 11.sp, color = Color(0xFF5B6474))
                            if (heardLines.isEmpty()) {
                                Text(text = "Nothing yet - speak and pause; text appears a moment after each sentence.", fontSize = 12.sp, color = Color(0xFF8A93A3))
                            } else {
                                heardLines.takeLast(2).forEach { line ->
                                    Text(text = "\u201C$line\u201D", fontSize = 12.sp, color = Color(0xFF111827))
                                }
                            }
                        }
                        Text(
                            text = "Speech is transcribed on this phone (Hindi · English · Hinglish) and never uploaded. " +
                                "Microphone only — the other side of SIM/WhatsApp calls is heard only on speaker.",
                            fontSize = 10.sp,
                            color = Color(0xFF5B6474),
                            lineHeight = 14.sp
                        )
                    }
                }
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java)
                ?.createNotificationChannel(NotificationChannel(CHANNEL_ID, "Satark overlay", NotificationManager.IMPORTANCE_LOW))
        }
    }

    private fun buildNotification(): Notification {
        val pendingIntent = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_alert)
            .setContentTitle(if (sensing) "Satark is listening (on-device)" else "Satark is ready")
            .setContentText(
                if (sensing) "Microphone audio is transcribed on this phone and discarded. Tap the bubble to stop."
                else "Tap the floating shield to start listening."
            )
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .build()
    }

    override fun onDestroy() {
        instance = null
        isRunning = false
        sensing = false
        isListening = false
        capture?.stop()
        transcriber.shutdownNow()
        hideOverlay()
        SpeechModel.release()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
