package org.firstpjbb.portal;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQUEST_POST_NOTIFICATIONS = 101;

    public class AndroidFcmBridge {
        @JavascriptInterface
        public void subscribeTopic(String topic) {
            if (topic != null) {
                String clean = topic.trim();
                if (!clean.isEmpty()) {
                    try {
                        FirebaseMessaging.getInstance().subscribeToTopic(clean);
                    } catch (Exception ignored) {}
                }
            }
        }

        @JavascriptInterface
        public void unsubscribeTopic(String topic) {
            if (topic != null) {
                String clean = topic.trim();
                if (!clean.isEmpty()) {
                    try {
                        FirebaseMessaging.getInstance().unsubscribeFromTopic(clean);
                    } catch (Exception ignored) {}
                }
            }
        }

        @JavascriptInterface
        public void openNotificationSettings() {
            try {
                Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                startActivity(intent);
            } catch (Exception e) {
                try {
                    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception ignored) {}
            }
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        AnnouncementSyncReceiver.createNotificationChannel(this);
        AnnouncementSyncReceiver.scheduleNext(this);

        // Always subscribe to general announcements topic
        try {
            FirebaseMessaging.getInstance().subscribeToTopic("announcements");
        } catch (Exception ignored) {}

        // Expose AndroidFCM JavaScript bridge on the WebView
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().addJavascriptInterface(new AndroidFcmBridge(), "AndroidFCM");
            }
        } catch (Exception ignored) {}

        // Explicitly prompt for POST_NOTIFICATIONS runtime permission on Android 13+ (API 33+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    this,
                    new String[]{ Manifest.permission.POST_NOTIFICATIONS },
                    PERMISSION_REQUEST_POST_NOTIFICATIONS
                );
            }
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        AnnouncementSyncReceiver.createNotificationChannel(this);
        AnnouncementSyncReceiver.scheduleNext(this);
        try {
            FirebaseMessaging.getInstance().subscribeToTopic("announcements");
        } catch (Exception ignored) {}
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().addJavascriptInterface(new AndroidFcmBridge(), "AndroidFCM");
            }
        } catch (Exception ignored) {}
    }
}
