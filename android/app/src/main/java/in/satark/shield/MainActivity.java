package in.satark.shield;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int NOTIFICATION_REQUEST = 3202;

    /** True while the Satark screen is visible; the overlay stays a small bubble then. */
    public static volatile boolean isInForeground = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SatarkNativePlugin.class);
        super.onCreate(savedInstanceState);
        requestNotificationPermission();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // The overlay's "Details & nearby help" brings the app forward with a pending alert.
        SatarkNativePlugin plugin = SatarkNativePlugin.Companion.getInstance();
        if (plugin != null) plugin.notifyAlertOpened();
    }

    @Override
    public void onResume() {
        super.onResume();
        isInForeground = true;
        SatarkOverlayService.Companion.onAppVisibilityChanged(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && Settings.canDrawOverlays(this)) {
            startSatarkOverlayService();
        }
    }

    @Override
    public void onPause() {
        isInForeground = false;
        SatarkOverlayService.Companion.onAppVisibilityChanged(false);
        super.onPause();
    }

    private void startSatarkOverlayService() {
        Intent intent = new Intent(this, SatarkOverlayService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent);
        } else {
            startService(intent);
        }
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{android.Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_REQUEST
            );
        }
    }
}
