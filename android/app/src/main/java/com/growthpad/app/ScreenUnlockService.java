package com.growthpad.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.app.KeyguardManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.media.AudioManager;
import android.telephony.TelephonyManager;
import android.app.ActivityManager;
import java.util.List;

public class ScreenUnlockService extends Service {
    private static final String CHANNEL_ID = "auto_launch_channel";
    private static final String FULLSCREEN_CHANNEL_ID = "fullscreen_tasks";
    private static final int NOTIFICATION_ID = 2001;
    private static final int FULLSCREEN_NOTIFICATION_ID = 3001;
    private static final long LAUNCH_DEBOUNCE_MS = 2500;
    // USER_PRESENT 후 keyguard dismiss 애니메이션 끝나기 기다림 (0은 일부 기기서 이상동작)
    private static final long USER_PRESENT_LAUNCH_DELAY_MS = 100;
    // SCREEN_ON 부터 USER_PRESENT까지 CPU hot 유지 (잠금해제 지연 대비)
    private static final long SCREEN_ON_WAKELOCK_MS = 3000;
    private BroadcastReceiver screenReceiver;
    private Handler handler = new Handler(Looper.getMainLooper());
    private long lastLaunchTime = 0;

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
            .setVisibility(Notification.VISIBILITY_SECRET) // 잠금화면 노출 차단
            .build();
    }

    private boolean isAppInForeground(Context context) {
        try {
            ActivityManager am = (ActivityManager) context.getSystemService(Context.ACTIVITY_SERVICE);
            if (am == null) return false;
            List<ActivityManager.RunningAppProcessInfo> procs = am.getRunningAppProcesses();
            if (procs == null) return false;
            String pkg = context.getPackageName();
            for (ActivityManager.RunningAppProcessInfo proc : procs) {
                if (proc.processName != null && proc.processName.equals(pkg)
                    && proc.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND) {
                    return true;
                }
            }
        } catch (Exception e) {}
        return false;
    }

    private void registerScreenReceiver() {
        screenReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String action = intent.getAction();
                if (Intent.ACTION_SCREEN_ON.equals(action)) {
                    // SCREEN_ON은 passive wake(알림/센서/도즈종료)에도 fire되므로 여기서는 실행하지 않음.
                    // CPU만 잠깐 깨워 실제 잠금해제(USER_PRESENT)까지 cold 상태 방지.
                    try {
                        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                        if (pm != null) {
                            PowerManager.WakeLock wl = pm.newWakeLock(
                                PowerManager.PARTIAL_WAKE_LOCK,
                                "growthpad:screen_on_cpu");
                            wl.acquire(SCREEN_ON_WAKELOCK_MS);
                        }
                    } catch (Exception e) {}
                } else if (Intent.ACTION_USER_PRESENT.equals(action)) {
                    // 사용자가 실제로 잠금을 해제한 시점에만 launch → passive wake flicker 제거
                    handler.postDelayed(() -> launchApp(context), USER_PRESENT_LAUNCH_DELAY_MS);
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(screenReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(screenReceiver, filter);
        }
    }

    private boolean isPhoneCallActive(Context context) {
        try {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                int mode = am.getMode();
                if (mode == AudioManager.MODE_RINGTONE ||
                    mode == AudioManager.MODE_IN_CALL ||
                    mode == AudioManager.MODE_IN_COMMUNICATION) {
                    return true;
                }
            }
        } catch (Exception e) {}
        try {
            TelephonyManager tm = (TelephonyManager) context.getSystemService(Context.TELEPHONY_SERVICE);
            if (tm != null && tm.getCallState() != TelephonyManager.CALL_STATE_IDLE) {
                return true;
            }
        } catch (Exception e) {}
        return false;
    }

    private void launchApp(Context context) {
        // belt-and-suspenders: USER_PRESENT 직후이긴 하지만 delay 동안 화면이 꺼지거나 재잠금될 수 있음
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) return;
        } catch (Exception e) {}
        try {
            KeyguardManager km = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked()) return;
        } catch (Exception e) {}
        // 전화 수신/통화 중이면 실행하지 않음
        if (isPhoneCallActive(context)) return;
        // 이미 앱이 포그라운드면 재런치 skip
        if (isAppInForeground(context)) return;
        // 디바운싱: 마지막 런치로부터 2.5초 이내면 무시
        long now = System.currentTimeMillis();
        if (now - lastLaunchTime < LAUNCH_DEBOUNCE_MS) return;
        lastLaunchTime = now;
        try {
            Intent launchIntent = new Intent(context, MainActivity.class);
            // NO_ANIMATION: keyguard 위에 진입할 때 window 슬라이드 애니메이션 제거 → 깜빡임 완화
            launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP
                | Intent.FLAG_ACTIVITY_NO_ANIMATION);
            launchIntent.putExtra("from_screen_on", true);
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
        // START_STICKY가 시스템 재시작을 처리 - 수동 재시작 제거 (APK 업데이트 충돌 방지)
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
