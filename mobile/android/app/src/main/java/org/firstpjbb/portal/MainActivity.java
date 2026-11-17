package org.firstpjbb.portal;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
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
                        getSharedPreferences("bb_portal_topics", Context.MODE_PRIVATE)
                            .edit().putBoolean(clean, true).apply();
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
                        getSharedPreferences("bb_portal_topics", Context.MODE_PRIVATE)
                            .edit().remove(clean).apply();
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

        @JavascriptInterface
        public boolean isIgnoringBatteryOptimizations() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                    if (pm != null) {
                        return pm.isIgnoringBatteryOptimizations(getPackageName());
                    }
                }
            } catch (Exception ignored) {}
            return false;
        }

        @JavascriptInterface
        public void requestIgnoreBatteryOptimizations() {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                }
            } catch (Exception e) {
                try {
                    Intent intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    startActivity(intent);
                } catch (Exception ignored) {}
            }
        }

        @JavascriptInterface
        public boolean isXiaomiDevice() {
            try {
                String manufacturer = Build.MANUFACTURER;
                if (manufacturer != null) {
                    String m = manufacturer.toLowerCase();
                    return m.contains("xiaomi") || m.contains("redmi") || m.contains("poco");
                }
            } catch (Exception ignored) {}
            return false;
        }

        @JavascriptInterface
        public void openAutostartSettings() {
            Intent intent = new Intent();
            try {
                intent.setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
                startActivity(intent);
                return;
            } catch (Exception ignored) {}

            try {
                intent.setComponent(new ComponentName("com.miui.securitycenter", "com.miui.powercenter.PowerSettings"));
                startActivity(intent);
                return;
            } catch (Exception ignored) {}

            try {
                intent.setComponent(new ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"));
                startActivity(intent);
                return;
            } catch (Exception ignored) {}

            try {
                intent.setComponent(new ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"));
                startActivity(intent);
                return;
            } catch (Exception ignored) {}

            try {
                intent.setComponent(new ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"));
                startActivity(intent);
                return;
            } catch (Exception ignored) {}

            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(Uri.parse("package:" + getPackageName()));
                startActivity(fallback);
            } catch (Exception ignored) {}
        }

        @JavascriptInterface
        public void openAppDetails() {
            try {
                Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                intent.setData(Uri.parse("package:" + getPackageName()));
                startActivity(intent);
            } catch (Exception ignored) {}
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
            SharedPreferences topicPrefs = getSharedPreferences("bb_portal_topics", Context.MODE_PRIVATE);
            for (String t : topicPrefs.getAll().keySet()) {
                if (t != null && !t.trim().isEmpty()) {
                    FirebaseMessaging.getInstance().subscribeToTopic(t.trim());
                }
            }
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
            SharedPreferences topicPrefs = getSharedPreferences("bb_portal_topics", Context.MODE_PRIVATE);
            for (String t : topicPrefs.getAll().keySet()) {
                if (t != null && !t.trim().isEmpty()) {
                    FirebaseMessaging.getInstance().subscribeToTopic(t.trim());
                }
            }
        } catch (Exception ignored) {}
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().addJavascriptInterface(new AndroidFcmBridge(), "AndroidFCM");
                getBridge().getWebView().post(() -> {
                    try {
                        getBridge().getWebView().evaluateJavascript(
                            "if (typeof syncMobileDeviceSubscriptions === 'function') { syncMobileDeviceSubscriptions(); }",
                            null
                        );
                    } catch (Exception ignored) {}
                });
            }
        } catch (Exception ignored) {}
    }
}
