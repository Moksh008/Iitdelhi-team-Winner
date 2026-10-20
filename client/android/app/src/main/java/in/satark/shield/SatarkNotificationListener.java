package in.satark.shield;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import android.util.Log;

public class SatarkNotificationListener extends NotificationListenerService {
    private static final String TAG = "SatarkNotification";

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String packageName = sbn.getPackageName();

        // Detect Incoming / Ongoing WhatsApp Call Notification
        if ("com.whatsapp".equals(packageName) || "org.telegram.messenger".equals(packageName)) {
            CharSequence title = sbn.getNotification().extras.getCharSequence("android.title");
            CharSequence text = sbn.getNotification().extras.getCharSequence("android.text");
            Log.d(TAG, "VoIP Call Event from " + packageName + " | Caller: " + title);
        }
    }
}
