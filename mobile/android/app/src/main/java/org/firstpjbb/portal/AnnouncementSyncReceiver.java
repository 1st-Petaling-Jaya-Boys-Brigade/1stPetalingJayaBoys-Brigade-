package org.firstpjbb.portal;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.util.Base64;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.time.Instant;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

public class AnnouncementSyncReceiver extends BroadcastReceiver {
    private static final String PREFS_NAME = "bb_portal_sync_prefs";
    private static final String PREF_LAST_ANN_KEY = "last_seen_announcement_key";
    public static final String CHANNEL_ID = "portal-alerts-v2";
    private static final long INTERVAL_MS = 900000L; // 15-minute passive background safety fallback

    private static final String SUPA_URL = "https://mjfclxcklkbgsivvvlfe.supabase.co/rest/v1/bb_announcements?order=created_at.desc&limit=1&select=id,title,body,created_at";
    private static final String SUPA_KEY_B64 = "ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW0xcVptTnNlR05yYkd0aVozTnBkbloyYkdabElpd2ljbTlzWlNJNkltRnViMjRpTENKcFlYUWlPakUzTnpReE9EVXlNRFlzSW1WNGNDSTZNakE0T1RjMk1USXdObjAuWllzYUhuUEoxTFhyazRpWVA1cFlnTktqeWtzWFBzSzhaeGtYUEZlRWNPTQ==";

    private static String getSupabaseKey() {
        try {
            byte[] data = Base64.decode(SUPA_KEY_B64, Base64.DEFAULT);
            return new String(data, StandardCharsets.UTF_8);
        } catch (Exception e) {
            return "";
        }
    }

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

    private static long parseIsoTimestamp(String iso) {
        if (iso == null || iso.isEmpty()) return 0;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                return Instant.parse(iso).toEpochMilli();
            }
        } catch (Exception ignored) {}
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            return sdf.parse(iso).getTime();
        } catch (Exception ignored) {}
        return 0;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null) return;

        // Reschedule next background tick
        scheduleNext(context);

        // Keep broadcast receiver alive for background network call
        final PendingResult pendingResult = goAsync();

        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        final PowerManager.WakeLock wakeLock = (pm != null)
            ? pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "1stPJBB:AnnouncementSyncLock")
            : null;
        if (wakeLock != null) {
            try {
                wakeLock.acquire(15000L); // Max 15s wake lock safety timeout
            } catch (Exception ignored) {}
        }

        new Thread(() -> {
            try {
                checkForNewAnnouncement(context.getApplicationContext());
            } catch (Exception ignored) {
            } finally {
                try {
                    if (wakeLock != null && wakeLock.isHeld()) {
                        wakeLock.release();
                    }
                } catch (Exception ignored) {}
                try {
                    pendingResult.finish();
                } catch (Exception ignored) {}
            }
        }).start();
    }

    public static void scheduleNext(Context context) {
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

            long triggerAt = System.currentTimeMillis() + INTERVAL_MS;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
            } else {
                alarmManager.set(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent);
            }
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

    private void checkForNewAnnouncement(Context context) {
        try {
            URL url = new URL(SUPA_URL);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            String key = getSupabaseKey();
            conn.setRequestProperty("apikey", key);
            conn.setRequestProperty("Authorization", "Bearer " + key);
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                conn.disconnect();
                return;
            }

            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line);
            }
            reader.close();
            conn.disconnect();

            JSONArray array = new JSONArray(sb.toString());
            if (array.length() == 0) return;

            JSONObject latest = array.getJSONObject(0);
            String idStr = latest.optString("id", "").trim();
            String createdAt = latest.optString("created_at", "").trim();
            if (idStr.isEmpty()) return;

            String uniqueKey = idStr + ":" + createdAt;

            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String lastSeenKey = prefs.getString(PREF_LAST_ANN_KEY, null);

            boolean shouldNotify = false;
            if (lastSeenKey == null) {
                // If initial launch or cold cache, notify if announcement was published recently (< 10 mins)
                long createdTs = parseIsoTimestamp(createdAt);
                long now = System.currentTimeMillis();
                if (createdTs > 0 && (now - createdTs) < 600000L) {
                    shouldNotify = true;
                }
                prefs.edit().putString(PREF_LAST_ANN_KEY, uniqueKey).apply();
            } else if (!uniqueKey.equals(lastSeenKey)) {
                shouldNotify = true;
                prefs.edit().putString(PREF_LAST_ANN_KEY, uniqueKey).apply();
            }

            if (shouldNotify) {
                String notifTag = "portal_" + idStr;
                SharedPreferences dedup = context.getSharedPreferences("bb_portal_dedup", Context.MODE_PRIVATE);
                long lastSeen = dedup.getLong("seen_" + notifTag, 0L);
                long now = System.currentTimeMillis();
                if ((now - lastSeen) < 7200000L) {
                    // Already notified by FCM push within 2 hours; skip duplicate card
                    return;
                }

                String title = cleanText(latest.optString("title", "Company Announcement"));
                String body = latest.optString("body", "");
                String cleanSnippet = cleanText(body);
                if (cleanSnippet.length() > 120) {
                    cleanSnippet = cleanSnippet.substring(0, 117) + "...";
                }
                if (cleanSnippet.isEmpty()) {
                    cleanSnippet = "New company announcement posted. Tap to view full details.";
                }
                if (title.isEmpty()) {
                    title = "Company Announcement";
                }

                // Deterministic notification ID and tag aligned with FCM targetId to avoid dual cards
                int notifId = Math.abs(idStr.hashCode() % 100000) + 1000;
                dedup.edit().putLong("seen_" + notifTag, now).apply();
                postNativeNotification(context, notifTag, notifId, title, cleanSnippet);
            }
        } catch (Exception ignored) {}
    }

    private void postNativeNotification(Context context, String notifTag, int notifId, String title, String snippet) {
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
            nmCompat.notify(notifTag, notifId, builder.build());
        } catch (Exception ignored) {}
    }
}
