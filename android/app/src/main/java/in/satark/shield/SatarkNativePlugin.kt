package `in`.satark.shield

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.util.concurrent.Executors

@CapacitorPlugin(name = "SatarkNative")
class SatarkNativePlugin : Plugin() {
    private val worker = Executors.newSingleThreadExecutor()

    override fun load() {
        instance = this
    }

    @PluginMethod
    fun startSensing(call: PluginCall) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.RECORD_AUDIO), MICROPHONE_REQUEST)
            call.resolve(JSObject().put("status", "permission_requested"))
            return
        }
        if (!SpeechModel.isBundled(context)) {
            call.resolve(JSObject().put("status", "speech_model_missing"))
            return
        }
        val intent = Intent(context, SatarkOverlayService::class.java)
            .setAction(SatarkOverlayService.ACTION_START)
            .putExtra(SatarkOverlayService.EXTRA_FROM_APP, true)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
        call.resolve(JSObject().put("status", "started"))
    }

    @PluginMethod
    fun stopSensing(call: PluginCall) {
        if (SatarkOverlayService.isRunning) startService(SatarkOverlayService.ACTION_STOP)
        call.resolve(JSObject().put("status", "stopped"))
    }

    @PluginMethod
    fun openOverlaySettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            activity.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
        }
        call.resolve()
    }

    /** Opens Android's share sheet with plain text (e.g. a report pack). The user picks where it goes. */
    @PluginMethod
    fun shareText(call: PluginCall) {
        val text = call.getString("text").orEmpty()
        val title = call.getString("title") ?: "Satark"
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, title)
            .putExtra(Intent.EXTRA_TEXT, text)
        activity.startActivity(Intent.createChooser(send, title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        call.resolve(JSObject().put("status", "opened"))
    }

    @PluginMethod
    fun openAppSettings(call: PluginCall) {
        activity.startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        call.resolve()
    }

    @PluginMethod
    fun enableOverlay(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(context)) {
            activity.startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${context.packageName}")))
            call.resolve(JSObject().put("status", "permission_requested"))
            return
        }
        startService(null)
        call.resolve(JSObject().put("status", "enabled"))
    }

    @PluginMethod
    fun getModelStatus(call: PluginCall) {
        call.resolve(modelStatusJson())
    }

    @PluginMethod
    fun downloadLlm(call: PluginCall) {
        ModelManager.startDownload(context) { status ->
            notifyListeners("llmDownloadProgress", llmJson(status))
        }
        call.resolve(modelStatusJson())
    }

    @PluginMethod
    fun cancelLlmDownload(call: PluginCall) {
        ModelManager.cancelDownload()
        call.resolve(modelStatusJson())
    }

    @PluginMethod
    fun deleteLlm(call: PluginCall) {
        worker.execute {
            ModelManager.deleteLlm(context)
            call.resolve(modelStatusJson())
        }
    }

    @PluginMethod
    fun explainAlert(call: PluginCall) {
        val transcript = call.getString("transcript").orEmpty()
        val cuesArray = call.getArray("cues") ?: JSArray()
        val cues = (0 until cuesArray.length()).map { cuesArray.getString(it) }
        worker.execute {
            val outcome = AlertExplainer.explain(context, transcript, cues)
            call.resolve(JSObject().apply {
                put("status", outcome.status)
                outcome.explanation?.let { put("explanation", it) }
                put("millis", outcome.millis)
            })
        }
    }

    /**
     * Lets the user pick a recording (voice note, call recording, any audio
     * file) and turns it into text on this phone. Resolves
     * { status: 'ok', name, durationSeconds, segments: [{ start, end, text }] },
     * { status: 'cancelled' } or { status: 'error', message }.
     */
    @PluginMethod
    fun pickRecording(call: PluginCall) {
        if (!SpeechModel.isBundled(context)) {
            call.resolve(JSObject().put("status", "error").put("message", "The speech model is missing from this build."))
            return
        }
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("audio/*")
            // Some recorders and WhatsApp save voice notes with these types.
            .putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("audio/*", "application/ogg", "video/mp4", "video/3gpp"))
        startActivityForResult(call, intent, "onRecordingPicked")
    }

    @ActivityCallback
    private fun onRecordingPicked(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != android.app.Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("status", "cancelled"))
            return
        }
        analyzeRecording(call, uri, displayName(uri))
    }

    /** Debug builds only: analyse an audio file from the app's external files dir (for automated tests). */
    @PluginMethod
    fun debugAnalyzeRecording(call: PluginCall) {
        if (!BuildConfig.DEBUG) {
            call.reject("debug builds only")
            return
        }
        val name = call.getString("name").orEmpty()
        analyzeRecording(call, Uri.fromFile(File(context.getExternalFilesDir(null), name)), name)
    }

    private fun analyzeRecording(call: PluginCall, uri: Uri, name: String) {
        notifyListeners("recordingProgress", JSObject().put("stage", "decoding").put("name", name))
        worker.execute {
            try {
                val t0 = System.currentTimeMillis()
                val audio = AudioFileDecoder.decode(context, uri)
                val decodeMs = System.currentTimeMillis() - t0
                notifyListeners("recordingProgress", JSObject().put("stage", "transcribing").put("done", 0).put("total", 1))
                val result = RecordingTranscriber.transcribe(context, audio) { done, total ->
                    notifyListeners("recordingProgress", JSObject().put("stage", "transcribing").put("done", done).put("total", total))
                }
                val segments = JSArray()
                for (segment in result.segments) {
                    segments.put(JSObject().put("start", segment.startSeconds).put("end", segment.endSeconds).put("text", segment.text))
                }
                call.resolve(JSObject().apply {
                    put("status", "ok")
                    put("name", name)
                    put("durationSeconds", result.durationSeconds)
                    put("segments", segments)
                    put("decodeMs", decodeMs)
                    put("transcribeMs", result.transcribeMs)
                    put("totalMs", System.currentTimeMillis() - t0)
                })
            } catch (error: AudioFileDecoder.TooLongException) {
                call.resolve(JSObject().put("status", "error").put("message", "Please pick a recording shorter than ${error.maxSeconds / 60} minutes."))
            } catch (error: OutOfMemoryError) {
                call.resolve(JSObject().put("status", "error").put("message", "Not enough memory to check this recording."))
            } catch (error: Exception) {
                android.util.Log.w("SatarkRecording", "could not analyse $name", error)
                call.resolve(JSObject().put("status", "error").put("message", "Could not read this recording (${error.message ?: error.javaClass.simpleName})."))
            }
        }
    }

    private fun displayName(uri: Uri): String = try {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        } ?: uri.lastPathSegment.orEmpty()
    } catch (_: Exception) {
        uri.lastPathSegment.orEmpty()
    }

    @PluginMethod
    fun takePendingAlert(call: PluginCall) {
        val alert = PendingAlertStore.take()
        call.resolve(JSObject().apply { if (alert != null) put("alert", JSObject(alert.toString())) else put("alert", null as Any?) })
    }

    /**
     * Debug builds only: transcribe a 16 kHz mono 16-bit WAV from the app's
     * external files dir, for measuring on-device latency (see docs).
     */
    @PluginMethod
    fun debugTranscribeFile(call: PluginCall) {
        if (!BuildConfig.DEBUG) {
            call.reject("debug builds only")
            return
        }
        val name = call.getString("name").orEmpty()
        val file = File(context.getExternalFilesDir(null), name)
        worker.execute {
            try {
                val result = SpeechModel.transcribeWav(context, file)
                call.resolve(JSObject().apply {
                    put("text", result.text)
                    put("encoderMs", result.encoderMs)
                    put("decoderMs", result.decoderMs)
                    put("tokens", result.tokens)
                })
            } catch (error: Exception) {
                call.reject(error.message ?: "transcription failed")
            }
        }
    }

    /** Debug builds only: feed a WAV from the external files dir into live listening. */
    @PluginMethod
    fun debugFeedWav(call: PluginCall) {
        if (!BuildConfig.DEBUG) {
            call.reject("debug builds only")
            return
        }
        val file = File(context.getExternalFilesDir(null), call.getString("name").orEmpty())
        context.startService(
            Intent(context, SatarkOverlayService::class.java)
                .setAction(SatarkOverlayService.ACTION_DEBUG_FEED)
                .putExtra(SatarkOverlayService.EXTRA_WAV_PATH, file.path)
        )
        call.resolve(JSObject().put("status", "fed"))
    }

    /** Debug builds only: the overlay's current state, for automated checks. */
    @PluginMethod
    fun debugOverlayState(call: PluginCall) {
        if (!BuildConfig.DEBUG) {
            call.reject("debug builds only")
            return
        }
        call.resolve(JSObject(SatarkOverlayService.debugState.toString()))
    }

    /** Debug builds only: press the overlay's "Details & nearby help" button. */
    @PluginMethod
    fun debugOpenDetails(call: PluginCall) {
        if (!BuildConfig.DEBUG) {
            call.reject("debug builds only")
            return
        }
        context.startService(Intent(context, SatarkOverlayService::class.java).setAction(SatarkOverlayService.ACTION_DEBUG_OPEN_DETAILS))
        call.resolve()
    }

    /** Current listening state (status, mic level, live transcript lines, alert). */
    @PluginMethod
    fun getListeningState(call: PluginCall) {
        call.resolve(JSObject(SatarkOverlayService.latestState.toString()))
    }

    fun notifyAlertOpened() = notifyListeners("alertOpened", JSObject())

    fun notifyListeningUpdate(state: org.json.JSONObject) = notifyListeners("listeningUpdate", JSObject(state.toString()))

    private fun modelStatusJson() = JSObject().apply {
        put("speech", JSObject().apply {
            put("state", if (SpeechModel.isBundled(context)) "ready" else "missing")
            put("detail", if (SpeechModel.isBundled(context)) "bundled with the app" else "speech model files are missing from this build")
        })
        put("llm", llmJson(ModelManager.status(context)))
    }

    private fun llmJson(status: ModelManager.Status) = JSObject().apply {
        put("state", status.state.name.lowercase())
        put("bytesDownloaded", status.bytesDownloaded)
        put("totalBytes", status.totalBytes)
        status.detail?.let { put("detail", it) }
    }

    private fun startService(action: String?) {
        val intent = Intent(context, SatarkOverlayService::class.java).setAction(action)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent) else context.startService(intent)
    }

    companion object {
        private const val MICROPHONE_REQUEST = 3201
        @Volatile var instance: SatarkNativePlugin? = null
    }
}
