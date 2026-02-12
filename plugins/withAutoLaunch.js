const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withAutoLaunch(config) {
  // 1. AndroidManifest.xml: receiver + service + permissions
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

    return config;
  });

  // 2. Java files + MainActivity modification
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
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void createFullScreenChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                FULLSCREEN_CHANNEL_ID, "할일 표시",
                NotificationManager.IMPORTANCE_HIGH
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
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

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
                String action = intent.getAction();
                if (Intent.ACTION_SCREEN_ON.equals(action)) {
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
        showFullScreenNotification(context);

        try {
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT |
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            );
            launchIntent.putExtra("from_screen_on", true);

            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                PowerManager.WakeLock wl = pm.newWakeLock(
                    PowerManager.FULL_WAKE_LOCK |
                    PowerManager.ACQUIRE_CAUSES_WAKEUP |
                    PowerManager.ON_AFTER_RELEASE,
                    "growthpad:screen_on_wake"
                );
                wl.acquire(5000);
            }

            context.startActivity(launchIntent);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void showFullScreenNotification(Context context) {
        try {
            Intent launchIntent = new Intent(context, MainActivity.class);
            launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_REORDER_TO_FRONT |
                Intent.FLAG_ACTIVITY_SINGLE_TOP
            );
            launchIntent.putExtra("from_screen_on", true);

            PendingIntent fullScreenIntent = PendingIntent.getActivity(
                context, 1, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

            PendingIntent contentIntent = PendingIntent.getActivity(
                context, 2, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );

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
                handler.postDelayed(() -> {
                    try { nm.cancel(FULLSCREEN_NOTIFICATION_ID); } catch (Exception e) {}
                }, 3000);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (screenReceiver != null) {
            try { unregisterReceiver(screenReceiver); } catch (Exception e) { e.printStackTrace(); }
        }
        super.onDestroy();
        try {
            Intent restartIntent = new Intent(this, ScreenUnlockService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(restartIntent);
            } else {
                startService(restartIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        try {
            Intent restartIntent = new Intent(this, ScreenUnlockService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(restartIntent);
            } else {
                startService(restartIntent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
        super.onTaskRemoved(rootIntent);
    }
}
`
      );

      // Modify MainActivity to add lock screen flags and start service
      const ktFile = path.join(javaDir, 'MainActivity.kt');

      if (fs.existsSync(ktFile)) {
        let content = fs.readFileSync(ktFile, 'utf8');
        if (!content.includes('ScreenUnlockService')) {
          // Handle both super.onCreate(null) and super.onCreate(savedInstanceState)
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

      return config;
    },
  ]);

  return config;
}

module.exports = withAutoLaunch;
