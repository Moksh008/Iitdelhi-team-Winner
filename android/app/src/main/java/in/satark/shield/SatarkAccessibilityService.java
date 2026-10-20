package in.satark.shield;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.util.Log;

public class SatarkAccessibilityService extends AccessibilityService {
    private static final String TAG = "SatarkAccessibility";

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null) return;
        CharSequence packageName = event.getPackageName();
        if (packageName == null) return;

        String pkg = packageName.toString();

        // 1. Detect WhatsApp Active Audio/Video Call
        if (pkg.equals("com.whatsapp")) {
            Log.d(TAG, "WhatsApp Activity Detected. Monitoring call state and audio stream.");
            AccessibilityNodeInfo root = getRootInActiveWindow();
            if (root != null) {
                // Read caller window state and pass to on-device Satark RAM buffer
                root.recycle();
            }
        }

        // 2. Detect UPI Pre-Payment Screens
        if (pkg.contains("phonepe") || pkg.contains("paytm") || pkg.contains("paisa") || pkg.contains("upi")) {
            Log.d(TAG, "UPI App Active: " + pkg + ". Checking pre-PIN intent hook.");
        }
    }

    @Override
    public void onInterrupt() {
        Log.d(TAG, "Satark Accessibility Interrupted");
    }
}
