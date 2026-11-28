package org.firstpjbb.portal;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.Window;
import android.webkit.JavascriptInterface;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQUEST_POST_NOTIFICATIONS = 101;
    private volatile String pendingNotificationRouteJson = null;
    private volatile String pendingAuthCallbackHash = null;

    private String readIntentStringExtra(Intent intent, String key) {
        if (intent == null || key == null) return "";
        try {
            Bundle extras = intent.getExtras();
            if (extras == null || !extras.containsKey(key)) return "";
            Object val = extras.get(key);
            return val != null ? String.valueOf(val).trim() : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    private void captureNotificationIntent(Intent intent) {
        if (intent == null) return;
        try {
            String tab = readIntentStringExtra(intent, "tab");
            String targetId = readIntentStringExtra(intent, "targetId");
            String category = readIntentStringExtra(intent, "category");
            String notifId = readIntentStringExtra(intent, "notifId");
            String url = readIntentStringExtra(intent, "url");

            if (tab.isEmpty() && targetId.isEmpty() && category.isEmpty() && url.isEmpty()) {
                return;
            }

            JSONObject payload = new JSONObject();
            if (!tab.isEmpty()) payload.put("tab", tab);
            if (!targetId.isEmpty()) payload.put("targetId", targetId);
            if (!category.isEmpty()) payload.put("category", category);
            if (!notifId.isEmpty()) payload.put("notifId", notifId);
            if (!url.isEmpty()) payload.put("url", url);
            pendingNotificationRouteJson = payload.toString();

            // Clear extras so subsequent activity resumes do not re-trigger the same deep link
            intent.removeExtra("tab");
            intent.removeExtra("targetId");
            intent.removeExtra("category");
            intent.removeExtra("notifId");
            intent.removeExtra("url");
        } catch (Exception ignored) {}
    }

    private void dispatchPendingNotificationToWebView() {
        final String routeJson = pendingNotificationRouteJson;
        if (routeJson == null || routeJson.isEmpty()) return;
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() -> {
                    try {
                        String quoted = JSONObject.quote(routeJson);
                        String js = "(function(){if(typeof window.handlePortalNotificationDeepLink==='function'){try{window.handlePortalNotificationDeepLink(JSON.parse(" + quoted + "));return 'handled';}catch(e){return 'error';}}return 'pending';})();";
                        getBridge().getWebView().evaluateJavascript(js, result -> {
                            if (result != null && result.contains("handled") && routeJson.equals(pendingNotificationRouteJson)) {
                                pendingNotificationRouteJson = null;
                            }
                        });
                    } catch (Exception ignored) {}
                });
            }
        } catch (Exception ignored) {}
    }

    private void captureAuthCallbackIntent(Intent intent) {
        if (intent == null) return;
        try {
            Uri data = intent.getData();
            if (data == null) return;
            if (!"firstpjbb".equalsIgnoreCase(data.getScheme()) || !"auth".equalsIgnoreCase(data.getHost())) {
                return;
            }
            String fragment = intent.getStringExtra("auth_hash");
            if (fragment == null || fragment.trim().isEmpty()) {
                fragment = data.getEncodedFragment();
            }
            if (fragment == null || fragment.trim().isEmpty()) {
                fragment = data.getEncodedQuery();
            }
            if (fragment != null) {
                String clean = fragment.trim();
                if (clean.startsWith("#")) clean = clean.substring(1);
                if (!clean.isEmpty() && clean.length() <= 16384
                    && (clean.contains("id_token=") || clean.contains("error="))
                    && clean.contains("state=")) {
                    pendingAuthCallbackHash = "#" + clean;
                }
            }
            intent.setData(null);
            intent.removeExtra("auth_hash");
        } catch (Exception ignored) {}
    }

    private void dispatchPendingAuthCallbackToWebView() {
        final String authHash = pendingAuthCallbackHash;
        if (authHash == null || authHash.isEmpty()) return;
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().post(() -> {
                    try {
                        String quoted = JSONObject.quote(authHash);
                        String js = "(function(){if(typeof window.handleNativeGoogleAuthCallback==='function'){try{window.handleNativeGoogleAuthCallback(" + quoted + ");return 'handled';}catch(e){return 'error';}}return 'pending';})();";
                        getBridge().getWebView().evaluateJavascript(js, result -> {
                            if (result != null && result.contains("handled") && authHash.equals(pendingAuthCallbackHash)) {
                                pendingAuthCallbackHash = null;
                            }
                        });
                    } catch (Exception ignored) {}
                });
            }
        } catch (Exception ignored) {}
    }

    public class AndroidFcmBridge {
        @JavascriptInterface
        public String consumePendingNotificationRoute() {
            String route = pendingNotificationRouteJson;
            pendingNotificationRouteJson = null;
            return route != null ? route : "";
        }

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

    @SuppressWarnings("deprecation")
    private void applyNavigationTheme(boolean dark) {
        Window window = getWindow();
        int background = dark ? Color.rgb(27, 30, 37) : Color.WHITE;
        // Older WebViews draw inside Capacitor's inset padding. Color the surface behind that padding too.
        window.getDecorView().setBackgroundColor(background);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            // Android 7 only supports light navigation icons.
            window.setNavigationBarColor(Build.VERSION.SDK_INT < Build.VERSION_CODES.O ? Color.BLACK : background);
        }
        WindowCompat.getInsetsController(window, window.getDecorView()).setAppearanceLightNavigationBars(!dark);
    }

    public final class PortalNavigationBridge {
        @JavascriptInterface
        public void setDarkMode(boolean dark) {
            runOnUiThread(() -> applyNavigationTheme(dark));
        }
    }

    public final class PortalAuthBridge {
        @JavascriptInterface
        public String consumePendingAuthCallback() {
            String hash = pendingAuthCallbackHash;
            pendingAuthCallbackHash = null;
            return hash != null ? hash : "";
        }

        @JavascriptInterface
        public boolean openExternalAuthUrl(String url) {
            if (url == null) return false;
            String trimmed = url.trim();
            if (!trimmed.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")) {
                return false;
            }
            try {
                Uri parsed = Uri.parse(trimmed);
                if (!"https".equalsIgnoreCase(parsed.getScheme())
                    || !"accounts.google.com".equalsIgnoreCase(parsed.getHost())) {
                    return false;
                }
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, parsed);
                browserIntent.addCategory(Intent.CATEGORY_BROWSABLE);
                runOnUiThread(() -> {
                    try {
                        startActivity(browserIntent);
                    } catch (Exception ignored) {}
                });
                return true;
            } catch (Exception ignored) {
                return false;
            }
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        captureNotificationIntent(getIntent());
        captureAuthCallbackIntent(getIntent());
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

        // Expose AndroidFCM, PortalNavigation, and PortalAuth JavaScript bridges on the WebView
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().addJavascriptInterface(new AndroidFcmBridge(), "AndroidFCM");
                getBridge().getWebView().addJavascriptInterface(new PortalNavigationBridge(), "PortalNavigation");
                getBridge().getWebView().addJavascriptInterface(new PortalAuthBridge(), "PortalAuth");
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
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureNotificationIntent(intent);
        captureAuthCallbackIntent(intent);
        dispatchPendingNotificationToWebView();
        dispatchPendingAuthCallbackToWebView();
    }

    @Override
    public void onResume() {
        super.onResume();
        captureNotificationIntent(getIntent());
        captureAuthCallbackIntent(getIntent());
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
                getBridge().getWebView().addJavascriptInterface(new PortalAuthBridge(), "PortalAuth");
                getBridge().getWebView().post(() -> {
                    try {
                        getBridge().getWebView().evaluateJavascript(
                            "if (typeof syncMobileDeviceSubscriptions === 'function') { syncMobileDeviceSubscriptions(); }",
                            null
                        );
                    } catch (Exception ignored) {}
                });
                dispatchPendingNotificationToWebView();
                dispatchPendingAuthCallbackToWebView();
            }
        } catch (Exception ignored) {}
    }
}
