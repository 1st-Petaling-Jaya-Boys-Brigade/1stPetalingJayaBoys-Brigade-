package org.firstpjbb.portal;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;

public class AnnouncementSyncReceiver extends BroadcastReceiver {
    public static final String CHANNEL_ID = "portal-alerts-v2";
    public static final long INTERVAL_MS = 900000L; // 15-minute safety constant
    public static final String PREF_DEDUP = "bb_portal_dedup";

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
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;
        // FCM v1 handles real-time push delivery; cancel any legacy polling alarms to prevent duplicate notifications
        cancelLegacyAlarm(context);
    }

    public static void cancelLegacyAlarm(Context context) {
        if (context == null) return;
        try {
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            if (alarmManager == null) return;

            Intent intent = new Intent(context, AnnouncementSyncReceiver.class);
            intent.setAction("org.firstpjbb.portal.SYNC_ANNOUNCEMENTS");
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getBroadcast(context, 101, intent, flags);
            alarmManager.cancel(pendingIntent);
        } catch (Exception ignored) {}
    }

    public static void scheduleNext(Context context) {
        // FCM v1 handles real-time notifications; cancel legacy polling alarms to save battery & prevent duplicates
        cancelLegacyAlarm(context);
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
