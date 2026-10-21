package in.satark.shield;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

@CapacitorPlugin(name = "SatarkNative")
public class SatarkNativePlugin extends Plugin {
    private static final int MICROPHONE_REQUEST = 3201;

    @PluginMethod
    public void startSensing(PluginCall call) {
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    getActivity(),
                    new String[]{Manifest.permission.RECORD_AUDIO},
                    MICROPHONE_REQUEST
            );
            call.resolve(new JSObject().put("status", "permission_requested"));
            return;
        }
        Intent intent = new Intent(getContext(), SatarkOverlayService.class)
                .setAction(SatarkOverlayService.ACTION_START)
                .putExtra(SatarkOverlayService.EXTRA_SPEECH_LOCALE, call.getString("speechLocale"))
                .putExtra(SatarkOverlayService.EXTRA_ANALYSIS_LANGUAGE, call.getString("language"))
                .putExtra(
                        SatarkOverlayService.EXTRA_AUTO_LANGUAGE_DETECTION,
                        Boolean.TRUE.equals(call.getBoolean("autoDetect", false))
                );
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve(new JSObject().put("status", "started"));
    }

    @PluginMethod
    public void stopSensing(PluginCall call) {
        sendServiceAction(SatarkOverlayService.ACTION_STOP);
        call.resolve(new JSObject().put("status", "stopped"));
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName())
            );
            getActivity().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void enableOverlay(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                && !Settings.canDrawOverlays(getContext())) {
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName())
            );
            getActivity().startActivity(intent);
            call.resolve(new JSObject().put("status", "permission_requested"));
            return;
        }
        sendServiceAction(null);
        call.resolve(new JSObject().put("status", "enabled"));
    }

    @PluginMethod
    public void getApiBaseUrl(PluginCall call) {
        call.resolve(new JSObject().put("baseUrl", BuildConfig.SATARK_API_BASE_URL));
    }

    private void sendServiceAction(String action) {
        Intent intent = new Intent(getContext(), SatarkOverlayService.class).setAction(action);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
    }
}
