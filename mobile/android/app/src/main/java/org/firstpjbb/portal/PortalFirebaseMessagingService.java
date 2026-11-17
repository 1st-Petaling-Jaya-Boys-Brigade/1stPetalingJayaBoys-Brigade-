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

        String title = "Company Announcement";
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
            if (data.containsKey("title") && data.get("title") != null) {
                title = data.get("title");
            }
            if (data.containsKey("body") && data.get("body") != null) {
                body = data.get("body");
            } else if (data.containsKey("message") && data.get("message") != null && body.isEmpty()) {
                body = data.get("message");
            }
        }

        if (title == null || title.isEmpty()) title = "1st PJ BB Announcement";
        if (body == null || body.isEmpty()) body = "Tap to open and view announcement.";

        int notifId = (int) (System.currentTimeMillis() % 100000);
        showPushNotification(this, notifId, title, body);
    }

    public static void showPushNotification(Context context, int notifId, String title, String snippet) {
        try {
            createNotificationChannel(context);

            Intent openIntent = new Intent(context, MainActivity.class);
            openIntent.setAction(Intent.ACTION_VIEW);
            openIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getActivity(context, notifId, openIntent, flags);

            Uri soundUri = Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.portal_chime);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setLargeIcon(BitmapFactory.decodeResource(context.getResources(), R.mipmap.ic_launcher))
                .setContentTitle("📢 " + title)
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
                    "Company Announcements",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.setDescription("Instant company announcements and parade alerts");
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
