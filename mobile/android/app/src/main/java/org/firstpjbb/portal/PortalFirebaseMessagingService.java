package org.firstpjbb.portal;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.FirebaseMessaging;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

public class PortalFirebaseMessagingService extends FirebaseMessagingService {
    public static final String CHANNEL_ID = "portal-alerts-v2";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        try {
            FirebaseMessaging.getInstance().subscribeToTopic("announcements");
        } catch (Exception ignored) {}
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = (pm != null)
            ? pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "1stPJBB:FCMPushWakeLock")
            : null;
        if (wakeLock != null) {
            try {
                wakeLock.acquire(10000L); // 10s wake lock for background notification processing
            } catch (Exception ignored) {}
        }

        try {
            String title = "";
            String body = "";

            if (remoteMessage.getNotification() != null) {
                if (remoteMessage.getNotification().getTitle() != null) {
                    title = remoteMessage.getNotification().getTitle();
                }
                if (remoteMessage.getNotification().getBody() != null) {
                    body = remoteMessage.getNotification().getBody();
                }
            }

            Map<String, String> data = remoteMessage.getData();
            if (data != null && !data.isEmpty()) {
                if (data.containsKey("title") && data.get("title") != null && title.isEmpty()) {
                    title = data.get("title");
                }
                if (data.containsKey("body") && data.get("body") != null && body.isEmpty()) {
                    body = data.get("body");
                } else if (data.containsKey("snippet") && data.get("snippet") != null && body.isEmpty()) {
                    body = data.get("snippet");
                } else if (data.containsKey("message") && data.get("message") != null && body.isEmpty()) {
                    body = data.get("message");
                }
            }

            if (title == null || title.isEmpty()) title = "1st Petaling Jaya Boys' Brigade";
            if (body == null || body.isEmpty()) body = "Tap to view updates in the 1st PJ BB portal.";

            String tab = (data != null && data.containsKey("tab")) ? data.get("tab") : "home";
            String targetId = (data != null && data.containsKey("targetId")) ? data.get("targetId") : "";
            String category = (data != null && data.containsKey("category")) ? data.get("category") : "announcements";

            // Deterministic notification ID so repeated/overlapping updates never create stacked duplicate cards
            int notifId;
            if (targetId != null && !targetId.trim().isEmpty()) {
                notifId = Math.abs(targetId.trim().hashCode() % 100000) + 1000;
            } else {
                notifId = Math.abs((title.trim() + ":" + category).hashCode() % 100000) + 1000;
            }

            showPushNotification(this, notifId, title, body, tab, targetId, category);
        } finally {
            try {
                if (wakeLock != null && wakeLock.isHeld()) {
                    wakeLock.release();
                }
            } catch (Exception ignored) {}
        }
    }

    public static void showPushNotification(Context context, int notifId, String title, String snippet, String tab, String targetId, String category) {
        try {
            createNotificationChannel(context);

            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.setAction(Intent.ACTION_VIEW);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            if (tab != null && !tab.isEmpty()) openIntent.putExtra("tab", tab);
            if (targetId != null && !targetId.isEmpty()) openIntent.putExtra("targetId", targetId);
            if (category != null && !category.isEmpty()) openIntent.putExtra("category", category);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getActivity(context, notifId, openIntent, flags);

            Uri soundUri = Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.portal_chime);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setLargeIcon(BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher))
                .setContentTitle(title.trim())
                .setContentText(snippet)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(snippet))
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setSound(soundUri)
                .setVibrate(new long[]{ 0, 300, 150, 300 })
                .setDefaults(NotificationCompat.DEFAULT_ALL)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    return;
                }
            }

            NotificationManagerCompat nmCompat = NotificationManagerCompat.from(context);
            nmCompat.notify(notifId, builder.build());
        } catch (Exception ignored) {}
    }

    public static void createNotificationChannel(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && context != null) {
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "1st PJ BB Alerts",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Instant real-time alerts for announcements, task assignments, and mentions");
                channel.enableVibration(true);
                channel.setVibrationPattern(new long[]{ 0, 300, 150, 300 });
                channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);

                try {
                    Uri soundUri = Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.portal_chime);
                    AudioAttributes audioAttributes = new AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                        .build();
                    channel.setSound(soundUri, audioAttributes);
                } catch (Exception ignored) {}

                nm.createNotificationChannel(channel);
            }
        }
    }
}
