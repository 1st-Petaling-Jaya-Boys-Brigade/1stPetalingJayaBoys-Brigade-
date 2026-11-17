package org.firstpjbb.portal;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int PERMISSION_REQUEST_POST_NOTIFICATIONS = 101;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        AnnouncementSyncReceiver.createNotificationChannel(this);
        AnnouncementSyncReceiver.scheduleNext(this);

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
    }
}
