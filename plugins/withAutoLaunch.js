const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withAutoLaunch(config) {
  // 1. AndroidManifest.xml: receiver + service + permissions + AlarmActivity + AlarmDeleteReceiver
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const app = manifest.manifest.application[0];

    if (!manifest.manifest['uses-permission']) manifest.manifest['uses-permission'] = [];
    const perms = manifest.manifest['uses-permission'];
    const addPerm = (name) => {
      if (!perms.some((p) => p.$?.['android:name'] === name)) {
        perms.push({ $: { 'android:name': name } });
      }
    };
    addPerm('android.permission.FOREGROUND_SERVICE_SPECIAL_USE');
    addPerm('android.permission.WAKE_LOCK');
    addPerm('android.permission.USE_FULL_SCREEN_INTENT');

    // Activity에 showWhenLocked, turnScreenOn 추가
    if (app.activity) {
      app.activity.forEach((activity) => {
        if (activity.$?.['android:name'] === '.MainActivity') {
          activity.$['android:showWhenLocked'] = 'true';
          activity.$['android:turnScreenOn'] = 'true';
        }
      });
    }

    if (!app.receiver) app.receiver = [];
    if (!app.receiver.some((r) => r.$?.['android:name'] === '.BootReceiver')) {
      app.receiver.push({
        $: { 'android:name': '.BootReceiver', 'android:enabled': 'true', 'android:exported': 'true' },
        'intent-filter': [{ action: [{ $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } }] }],
      });
    }

    // AlarmDeleteReceiver
    if (!app.receiver.some((r) => r.$?.['android:name'] === '.AlarmDeleteReceiver')) {
      app.receiver.push({
        $: { 'android:name': '.AlarmDeleteReceiver', 'android:enabled': 'true', 'android:exported': 'false' },
      });
    }

    if (!app.service) app.service = [];
    if (!app.service.some((s) => s.$?.['android:name'] === '.ScreenUnlockService')) {
      app.service.push({
        $: {
          'android:name': '.ScreenUnlockService',
          'android:enabled': 'true',
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse',
        },
      });
    }

    // AlarmActivity
    if (!app.activity) app.activity = [];
    if (!app.activity.some((a) => a.$?.['android:name'] === '.AlarmActivity')) {
      app.activity.push({
        $: {
          'android:name': '.AlarmActivity',
          'android:exported': 'false',
          'android:showWhenLocked': 'true',
          'android:turnScreenOn': 'true',
          'android:excludeFromRecents': 'true',
          'android:theme': '@android:style/Theme.NoTitleBar.Fullscreen',
        },
      });
    }

    return config;
  });

  // 2. Java files + MainActivity/MainApplication modification
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const pkg = config.android?.package || 'com.growthpad.app';
      const pkgPath = pkg.replace(/\./g, '/');
      const projectRoot = config.modRequest.platformProjectRoot;
      const javaDir = path.join(projectRoot, 'app', 'src', 'main', 'java', ...pkgPath.split('/'));

      fs.mkdirSync(javaDir, { recursive: true });

      // BootReceiver.java
      fs.writeFileSync(
        path.join(javaDir, 'BootReceiver.java'),
        `package ${pkg};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            try {
                Intent serviceIntent = new Intent(context, ScreenUnlockService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
}
`
      );

      // ScreenUnlockService.java
      fs.writeFileSync(
        path.join(javaDir, 'ScreenUnlockService.java'),
        `package ${pkg};

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

public class ScreenUnlockService extends Service {
    private static final String CHANNEL_ID = "auto_launch_channel";
    private static final String FULLSCREEN_CHANNEL_ID = "fullscreen_tasks";
    private static final int NOTIFICATION_ID = 2001;
    private static final int FULLSCREEN_NOTIFICATION_ID = 3001;
    private BroadcastReceiver screenReceiver;
    private Handler handler = new Handler(Looper.getMainLooper());

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        createFullScreenChannel();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(NOTIFICATION_ID, buildNotification(),
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(NOTIFICATION_ID, buildNotification());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        registerScreenReceiver();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "자동 실행", NotificationManager.IMPORTANCE_MIN
            );
            channel.setDescription("화면 켤 때 할일 자동 표시");
            channel.setShowBadge(false);
            channel.enableLights(false);
            channel.enableVibration(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    private void createFullScreenChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                FULLSCREEN_CHANNEL_ID, "할일 표시", NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("화면 켤 때 할일 자동 표시");
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setBypassDnd(true);
            channel.enableVibration(false);
            channel.setSound(null, null);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification() {
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder
            .setContentTitle("또박또박")
            .setContentText("화면 켤 때 할일 자동 표시")
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setPriority(Notification.PRIORITY_MIN)
            .build();
    }

    private void registerScreenReceiver() {
        screenReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (Intent.ACTION_SCREEN_ON.equals(intent.getAction())) {
                    handler.postDelayed(() -> launchApp(context), 300);
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(screenReceiver, filter);
        }
    }

    private void launchApp(Context context) {
        try {
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            launchIntent.putExtra("from_screen_on", true);
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.FULL_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                    "growthpad:screen_on_wake");
                wl.acquire(5000);
            }
            context.startActivity(launchIntent);
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void showFullScreenNotification(Context context) {
        try {
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            launchIntent.putExtra("from_screen_on", true);
            PendingIntent fullScreenIntent = PendingIntent.getActivity(context, 1, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            PendingIntent contentIntent = PendingIntent.getActivity(context, 2, launchIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Notification.Builder builder;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder = new Notification.Builder(context, FULLSCREEN_CHANNEL_ID);
            } else {
                builder = new Notification.Builder(context);
            }
            Notification notification = builder
                .setContentTitle("또박또박 - 오늘의 할일")
                .setContentText("탭하여 할일을 확인하세요")
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setFullScreenIntent(fullScreenIntent, true)
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setPriority(Notification.PRIORITY_HIGH)
                .setCategory(Notification.CATEGORY_ALARM)
                .build();
            NotificationManager nm = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.notify(FULLSCREEN_NOTIFICATION_ID, notification);
                handler.postDelayed(() -> { try { nm.cancel(FULLSCREEN_NOTIFICATION_ID); } catch (Exception e) {} }, 3000);
            }
        } catch (Exception e) { e.printStackTrace(); }
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) { return START_STICKY; }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() {
        if (screenReceiver != null) { try { unregisterReceiver(screenReceiver); } catch (Exception e) {} }
        super.onDestroy();
        try {
            Intent restartIntent = new Intent(this, ScreenUnlockService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(restartIntent);
            else startService(restartIntent);
        } catch (Exception e) {}
    }
    @Override public void onTaskRemoved(Intent rootIntent) {
        try {
            Intent restartIntent = new Intent(this, ScreenUnlockService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(restartIntent);
            else startService(restartIntent);
        } catch (Exception e) {}
        super.onTaskRemoved(rootIntent);
    }
}
`
      );

      // AutoLaunchModule.java
      fs.writeFileSync(
        path.join(javaDir, 'AutoLaunchModule.java'),
        `package ${pkg};

import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class AutoLaunchModule extends ReactContextBaseJavaModule {
    public AutoLaunchModule(ReactApplicationContext context) { super(context); }

    @Override public String getName() { return "AutoLaunchModule"; }

    @ReactMethod
    public void checkOverlayPermission(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                promise.resolve(Settings.canDrawOverlays(getReactApplicationContext()));
            } else { promise.resolve(true); }
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void requestOverlayPermission() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getReactApplicationContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getReactApplicationContext().startActivity(intent);
            }
        } catch (Exception e) { e.printStackTrace(); }
    }

    @ReactMethod
    public void checkExactAlarmPermission(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                AlarmManager am = (AlarmManager) getReactApplicationContext().getSystemService(Context.ALARM_SERVICE);
                promise.resolve(am != null && am.canScheduleExactAlarms());
            } else { promise.resolve(true); }
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void requestExactAlarmPermission() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                    Uri.parse("package:" + getReactApplicationContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getReactApplicationContext().startActivity(intent);
            }
        } catch (Exception e) { e.printStackTrace(); }
    }

    @ReactMethod
    public void checkFullScreenIntentPermission(Promise promise) {
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                android.app.NotificationManager nm = (android.app.NotificationManager)
                    getReactApplicationContext().getSystemService(Context.NOTIFICATION_SERVICE);
                promise.resolve(nm != null && nm.canUseFullScreenIntent());
            } else { promise.resolve(true); }
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void requestFullScreenIntentPermission() {
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                    Uri.parse("package:" + getReactApplicationContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getReactApplicationContext().startActivity(intent);
            }
        } catch (Exception e) { e.printStackTrace(); }
    }

    @ReactMethod
    public void startService() {
        try {
            Context context = getReactApplicationContext();
            Intent intent = new Intent(context, ScreenUnlockService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
            else context.startService(intent);
        } catch (Exception e) { e.printStackTrace(); }
    }
}
`
      );

      // AutoLaunchPackage.java
      fs.writeFileSync(
        path.join(javaDir, 'AutoLaunchPackage.java'),
        `package ${pkg};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class AutoLaunchPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new AutoLaunchModule(reactContext));
        return modules;
    }
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
`
      );

      // AlarmModule.java
      fs.writeFileSync(
        path.join(javaDir, 'AlarmModule.java'),
        `package ${pkg};

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

public class AlarmModule extends ReactContextBaseJavaModule {
    public AlarmModule(ReactApplicationContext context) { super(context); }

    @Override public String getName() { return "AlarmModule"; }

    @ReactMethod
    public void scheduleAlarm(String taskId, String title, double triggerTimeMs, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            Intent intent = new Intent(context, AlarmActivity.class);
            intent.putExtra("taskId", taskId);
            intent.putExtra("title", title);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            int requestCode = taskId.hashCode();
            PendingIntent pendingIntent = PendingIntent.getActivity(
                context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            long triggerTime = (long) triggerTimeMs;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent);
            } else {
                alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerTime, pendingIntent);
            }
            promise.resolve(true);
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void cancelAlarm(String taskId, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            Intent intent = new Intent(context, AlarmActivity.class);
            int requestCode = taskId.hashCode();
            PendingIntent pendingIntent = PendingIntent.getActivity(
                context, requestCode, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
            promise.resolve(true);
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void dismissAlarm() {
        try {
            Context context = getReactApplicationContext();
            Intent intent = new Intent("${pkg}.DISMISS_ALARM");
            context.sendBroadcast(intent);
        } catch (Exception e) { e.printStackTrace(); }
    }
}
`
      );

      // AlarmPackage.java
      fs.writeFileSync(
        path.join(javaDir, 'AlarmPackage.java'),
        `package ${pkg};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class AlarmPackage implements ReactPackage {
    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new AlarmModule(reactContext));
        return modules;
    }
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}
`
      );

      // AlarmActivity.java
      fs.writeFileSync(
        path.join(javaDir, 'AlarmActivity.java'),
        `package ${pkg};

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.net.HttpURLConnection;
import java.net.URL;

public class AlarmActivity extends Activity {
    private Ringtone ringtone;
    private Vibrator vibrator;
    private Handler handler = new Handler(Looper.getMainLooper());
    private BroadcastReceiver dismissReceiver;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        String taskId = getIntent().getStringExtra("taskId");
        String title = getIntent().getStringExtra("title");
        if (title == null) title = "알람";

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER);
        layout.setPadding(48, 48, 48, 48);
        layout.setBackgroundColor(0xFF1a1a2e);

        TextView titleView = new TextView(this);
        titleView.setText("\\u23F0 " + title);
        titleView.setTextSize(24);
        titleView.setTextColor(0xFFFFFFFF);
        titleView.setGravity(Gravity.CENTER);
        layout.addView(titleView);

        View spacer = new View(this);
        spacer.setMinimumHeight(48);
        layout.addView(spacer);

        Button dismissBtn = new Button(this);
        dismissBtn.setText("확인");
        dismissBtn.setTextSize(18);
        dismissBtn.setBackgroundColor(0xFF6366f1);
        dismissBtn.setTextColor(0xFFFFFFFF);
        dismissBtn.setPadding(48, 24, 48, 24);
        dismissBtn.setOnClickListener(v -> { stopAlarm(); finish(); });
        layout.addView(dismissBtn);

        if (taskId != null) {
            View spacer2 = new View(this);
            spacer2.setMinimumHeight(24);
            layout.addView(spacer2);
            Button deleteBtn = new Button(this);
            deleteBtn.setText("완료 처리");
            deleteBtn.setTextSize(16);
            deleteBtn.setBackgroundColor(0xFF22c55e);
            deleteBtn.setTextColor(0xFFFFFFFF);
            deleteBtn.setPadding(48, 24, 48, 24);
            final String fTaskId = taskId;
            deleteBtn.setOnClickListener(v -> {
                new Thread(() -> deleteTaskSync(fTaskId)).start();
                stopAlarm();
                finish();
            });
            layout.addView(deleteBtn);
        }

        setContentView(layout);
        startAlarm();
        handler.postDelayed(() -> { stopAlarm(); finish(); }, 60000);

        dismissReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) { stopAlarm(); finish(); }
        };
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(dismissReceiver, new IntentFilter("${pkg}.DISMISS_ALARM"), Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(dismissReceiver, new IntentFilter("${pkg}.DISMISS_ALARM"));
        }
    }

    private void startAlarm() {
        try {
            Uri alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (alarmUri == null) alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            ringtone = RingtoneManager.getRingtone(this, alarmUri);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ringtone.setLooping(true);
            ringtone.play();
        } catch (Exception e) { e.printStackTrace(); }
        try {
            vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null) {
                long[] pattern = {0, 500, 500};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else { vibrator.vibrate(pattern, 0); }
            }
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void stopAlarm() {
        try { if (ringtone != null && ringtone.isPlaying()) ringtone.stop(); } catch (Exception e) {}
        try { if (vibrator != null) vibrator.cancel(); } catch (Exception e) {}
    }

    private void deleteTaskSync(String taskId) {
        try {
            String urlStr = "https://growthpad.simssijjang.workers.dev/api/tasks?id=" + taskId;
            int maxRedirects = 5;
            for (int i = 0; i < maxRedirects; i++) {
                URL url = new URL(urlStr);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("DELETE");
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);
                conn.setRequestProperty("Content-Type", "application/json");
                int code = conn.getResponseCode();
                if (code == 301 || code == 302 || code == 307 || code == 308) {
                    String location = conn.getHeaderField("Location");
                    conn.disconnect();
                    if (location != null) { urlStr = location; continue; }
                }
                conn.disconnect();
                break;
            }
        } catch (Exception e) { e.printStackTrace(); }
    }

    @Override
    protected void onDestroy() {
        stopAlarm();
        handler.removeCallbacksAndMessages(null);
        if (dismissReceiver != null) { try { unregisterReceiver(dismissReceiver); } catch (Exception e) {} }
        super.onDestroy();
    }
}
`
      );

      // AlarmDeleteReceiver.java
      fs.writeFileSync(
        path.join(javaDir, 'AlarmDeleteReceiver.java'),
        `package ${pkg};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.net.HttpURLConnection;
import java.net.URL;

public class AlarmDeleteReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String taskId = intent.getStringExtra("taskId");
        if (taskId == null) return;
        new Thread(() -> {
            try {
                String urlStr = "https://growthpad.simssijjang.workers.dev/api/tasks?id=" + taskId;
                int maxRedirects = 5;
                for (int i = 0; i < maxRedirects; i++) {
                    URL url = new URL(urlStr);
                    HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("DELETE");
                    conn.setInstanceFollowRedirects(false);
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(10000);
                    conn.setRequestProperty("Content-Type", "application/json");
                    int code = conn.getResponseCode();
                    if (code == 301 || code == 302 || code == 307 || code == 308) {
                        String location = conn.getHeaderField("Location");
                        conn.disconnect();
                        if (location != null) { urlStr = location; continue; }
                    }
                    conn.disconnect();
                    break;
                }
            } catch (Exception e) { e.printStackTrace(); }
        }).start();
        Intent dismissIntent = new Intent("${pkg}.DISMISS_ALARM");
        context.sendBroadcast(dismissIntent);
    }
}
`
      );

      // Modify MainActivity.kt to add lock screen flags and start service
      const ktFile = path.join(javaDir, 'MainActivity.kt');
      if (fs.existsSync(ktFile)) {
        let content = fs.readFileSync(ktFile, 'utf8');
        if (!content.includes('ScreenUnlockService')) {
          const onCreatePattern = /super\.onCreate\([^)]*\)/;
          const match = content.match(onCreatePattern);
          if (match) {
            content = content.replace(
              match[0],
              `${match[0]}

    // 잠금화면 위에 앱 표시
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
        android.view.WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
      )
    }

    // 화면 해제 시 자동 실행 서비스
    try {
      val serviceIntent = android.content.Intent(this, ScreenUnlockService::class.java)
      if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        startForegroundService(serviceIntent)
      } else {
        startService(serviceIntent)
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }`
            );
            fs.writeFileSync(ktFile, content);
          }
        }
      }

      // Modify MainApplication.kt to register AutoLaunchPackage and AlarmPackage
      const appKtFile = path.join(javaDir, 'MainApplication.kt');
      if (fs.existsSync(appKtFile)) {
        let content = fs.readFileSync(appKtFile, 'utf8');
        if (!content.includes('AutoLaunchPackage')) {
          content = content.replace(
            '// Packages that cannot be autolinked yet can be added manually here, for example:',
            '// Packages that cannot be autolinked yet can be added manually here, for example:'
          );
          content = content.replace(
            /\/\/ add\(MyReactNativePackage\(\)\)/,
            `add(AutoLaunchPackage())
              add(AlarmPackage())`
          );
          fs.writeFileSync(appKtFile, content);
        }
      }

      return config;
    },
  ]);

  return config;
}

module.exports = withAutoLaunch;
