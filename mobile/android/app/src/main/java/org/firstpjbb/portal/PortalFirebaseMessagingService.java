package org.firstpjbb.portal;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
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
            SharedPreferences topicPrefs = getSharedPreferences("bb_portal_topics", Context.MODE_PRIVATE);
            for (String t : topicPrefs.getAll().keySet()) {
                if (t != null && !t.trim().isEmpty()) {
                    FirebaseMessaging.getInstance().subscribeToTopic(t.trim());
                }
            }
        } catch (Exception ignored) {}
    }

    /**
     * Sanitizes notification text: strips emojis, unescapes HTML entities, removes HTML tags,
     * and collapses consecutive whitespace for clean, professional alert cards.
     */
    public static String cleanText(String raw) {
        if (raw == null) return "";
        return raw
            .replace("&nbsp;", " ")
            .replace("&amp;", "&")
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&apos;", "'")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replaceAll("<[^>]*>", " ")
            .replaceAll("[\\p{So}\\p{Cn}\\uFE0F\\u200D\\u2600-\\u26FF\\u2700-\\u27BF]", "")
            .replaceAll("[\\uD83C-\\uDBFF\\uDC00-\\uDFFF]", "")
            .replaceAll("\\s+", " ")
            .trim();
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

            title = cleanText(title);
            body = cleanText(body);

            String tab = (data != null && data.containsKey("tab")) ? data.get("tab") : "home";
            String targetId = (data != null && data.containsKey("targetId")) ? data.get("targetId") : "";
            String category = (data != null && data.containsKey("category")) ? data.get("category") : "announcements";

            if (title.isEmpty()) {
                title = "1st Petaling Jaya Boys' Brigade";
            }
            if (body.isEmpty()) {
                if ("task_assigned".equals(category)) {
                    body = "You have been assigned to a new task. Tap to view requirements.";
                } else if ("task_due_soon".equals(category) || "task_due".equals(category)) {
                    body = "You have tasks due within 2 days. Open Projects & Tasks to review.";
                } else if ("task_overdue".equals(category)) {
                    body = "Open Projects & Tasks to review your overdue tasks.";
                } else if ("mention".equals(category) || "task_comment".equals(category)) {
                    body = "You were mentioned in a task discussion. Tap to view.";
                } else if ("resource".equals(category)) {
                    body = "A new resource document has been published. Tap to view.";
                } else if ("order_status".equals(category)) {
                    body = "Your uniform store order status has been updated.";
                } else if ("forum_reply".equals(category)) {
                    body = "You received a reply on the community forum.";
                } else {
                    body = "New company announcement posted. Tap to view full details.";
                }
            }

            // Deterministic notification tag and ID so repeated/overlapping updates never create stacked duplicate cards
            String notifTag = "portal_" + (targetId != null && !targetId.trim().isEmpty() ? targetId.trim() : (category + "_" + Math.abs((title + ":" + body).hashCode() % 100000)));
            int notifId;
            if (targetId != null && !targetId.trim().isEmpty()) {
                notifId = Math.abs(targetId.trim().hashCode() % 100000) + 1000;
            } else {
                notifId = Math.abs((title + ":" + category).hashCode() % 100000) + 1000;
            }

            // Deduplicate across duplicate FCM arrivals, broadcast + personal topic overlaps, and rapid retries
            try {
                SharedPreferences dedup = getSharedPreferences("bb_portal_dedup", Context.MODE_PRIVATE);
                long lastSeen = dedup.getLong("seen_" + notifTag, 0L);
                long now = System.currentTimeMillis();
                if ((now - lastSeen) < 15000L) {
                    return; // Skip duplicate notification card within 15 seconds
                }
                dedup.edit().putLong("seen_" + notifTag, now).apply();
            } catch (Exception ignored) {}

            showPushNotification(this, notifTag, notifId, title, body, tab, targetId, category);
        } finally {
            try {
                if (wakeLock != null && wakeLock.isHeld()) {
                    wakeLock.release();
                }
            } catch (Exception ignored) {}
        }
    }

    public static void showPushNotification(Context context, int notifId, String title, String snippet, String tab, String targetId, String category) {
        String notifTag = "portal_" + (targetId != null && !targetId.trim().isEmpty() ? targetId.trim() : String.valueOf(notifId));
        showPushNotification(context, notifTag, notifId, title, snippet, tab, targetId, category);
    }

    public static void showPushNotification(Context context, String notifTag, int notifId, String title, String snippet, String tab, String targetId, String category) {
        try {
            if (context != null && notifTag != null) {
                SharedPreferences dedup = context.getSharedPreferences("bb_portal_dedup", Context.MODE_PRIVATE);
                long lastShown = dedup.getLong("shown_" + notifTag, 0L);
                long now = System.currentTimeMillis();
                if ((now - lastShown) < 15000L) {
                    return; // Skip repeated post within 15 seconds
                }
                dedup.edit().putLong("shown_" + notifTag, now).apply();
            }

            createNotificationChannel(context);

            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.setAction(Intent.ACTION_VIEW);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            if (tab != null && !tab.isEmpty()) openIntent.putExtra("tab", tab);
            if (targetId != null && !targetId.isEmpty()) openIntent.putExtra("targetId", targetId);
            if (category != null && !category.isEmpty()) openIntent.putExtra("category", category);
            if (notifTag != null && !notifTag.isEmpty()) openIntent.putExtra("notifId", notifTag);

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getActivity(context, notifId, openIntent, flags);

            Uri soundUri = Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.portal_chime);

            String cleanTitle = cleanText(title);
            String cleanBody = cleanText(snippet);
            if (cleanTitle.isEmpty()) cleanTitle = "1st Petaling Jaya Boys' Brigade";
            if (cleanBody.isEmpty()) cleanBody = "Tap to open and view update in the portal.";

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setLargeIcon(BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher))
                .setContentTitle(cleanTitle)
                .setContentText(cleanBody)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(cleanBody))
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
            nmCompat.notify(notifTag, notifId, builder.build());
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
