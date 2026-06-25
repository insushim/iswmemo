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
    private static final int NOTIFICATION_ID = 2001;
    private static final long LAUNCH_DEBOUNCE_MS = 2500;
    // keyguard window 준비 기다림 + passive wake 감지 (너무 짧으면 isInteractive 체크가 false negative)
    private static final long SCREEN_ON_LAUNCH_DELAY_MS = 350;
    private static final long USER_PRESENT_LAUNCH_DELAY_MS = 100;
    private static final long SCREEN_ON_WAKELOCK_MS = 2500;
    // 서비스 시작 직후(업데이트 설치/부팅 등) N초 동안 auto-launch 억제 — JS 번들 cold init 충돌 방지
    private static final long SERVICE_COLD_START_GUARD_MS = 15000;
    private BroadcastReceiver screenReceiver;
    private Handler handler = new Handler(Looper.getMainLooper());
    private long lastLaunchTime = 0;
    // 부팅/업데이트 직후 JS 콜드 init 중 launch 억제 종료 시각(0=가드 없음).
    // 부팅(BootReceiver)에서 시작된 경우에만 onStartCommand에서 무장한다.
    // process-death 후 START_STICKY/onTaskRemoved 재시작에는 무장하지 않아
    // 그때 잠금화면 자동표시가 15초간 죽는 문제(S-3)를 막는다.
    private long guardUntil = 0;
    // 콜백 중복 누적 방지용 단일 Runnable. rapid on/off 시 stale 콜백을 제거한다.
    private final Runnable launchRunnable = new Runnable() {
        @Override public void run() { launchApp(getApplicationContext()); }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
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
                    // 잠금화면 위 자동 표시가 이 앱의 core UX. SCREEN_ON에서 launch 예약.
                    // CPU hot 유지로 keyguard 위 진입 버벅임 완화.
                    try {
                        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
                        if (pm != null) {
                            PowerManager.WakeLock wl = pm.newWakeLock(
                                PowerManager.PARTIAL_WAKE_LOCK,
                                "growthpad:screen_on_cpu");
                            wl.acquire(SCREEN_ON_WAKELOCK_MS);
                        }
                    } catch (Exception e) {}
                    // 이전 예약을 취소하고 다시 예약 → rapid on/off 시 콜백 누적·중복 launch 방지(S-2)
                    handler.removeCallbacks(launchRunnable);
                    handler.postDelayed(launchRunnable, SCREEN_ON_LAUNCH_DELAY_MS);
                } else if (Intent.ACTION_USER_PRESENT.equals(action)) {
                    // 잠금해제 시점 보조 트리거. 기존 예약 취소 후 단일 예약.
                    handler.removeCallbacks(launchRunnable);
                    handler.postDelayed(launchRunnable, USER_PRESENT_LAUNCH_DELAY_MS);
                } else if (Intent.ACTION_SCREEN_OFF.equals(action)) {
                    // passive wake(알림/센서/도즈)로 화면이 잠깐 켜졌다 꺼지는 경우:
                    // delay 안에 SCREEN_OFF가 도착하면 예약된 launch를 취소한다.
                    // → "잠금 안 풀렸는데 떴다 사라짐 / 혼자 꺼짐"(S-1) 방지.
                    // core UX인 SCREEN_ON 자동표시는 유지하되, 실제로 꺼지는 wake만 거른다.
                    handler.removeCallbacks(launchRunnable);
                }
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(Intent.ACTION_SCREEN_ON);
        filter.addAction(Intent.ACTION_USER_PRESENT);
        filter.addAction(Intent.ACTION_SCREEN_OFF);
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
        long now = System.currentTimeMillis();
        // 부팅/업데이트 직후 JS 번들 cold init 중 MainActivity launch → "엄청난 깜빡임" 방지.
        // 단 boot 경로에서만 무장되므로(S-3), process-death 재시작 후엔 즉시 자동표시 가능.
        if (guardUntil > 0 && now < guardUntil) return;
        // passive wake(알림/센서/도즈종료) 대응: delay 동안 화면이 이미 꺼져가는 중이면 abort.
        // 주의: isKeyguardLocked 체크는 하지 않음 — 잠금화면 위 자동 표시가 core UX
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) return;
        } catch (Exception e) {}
        // 전화 수신/통화 중이면 실행하지 않음
        if (isPhoneCallActive(context)) return;
        // 이미 앱이 포그라운드면 재런치 skip
        if (isAppInForeground(context)) return;
        // 디바운싱: 마지막 런치로부터 2.5초 이내면 무시
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

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        // 부팅/업데이트로 시작된 경우에만 cold-start 가드 무장 (BootReceiver가 extra 부착).
        // START_STICKY/onTaskRemoved 재시작 intent엔 extra가 없어 무장되지 않음(S-3 해소).
        if (intent != null && intent.getBooleanExtra("cold_start_guard", false)) {
            guardUntil = System.currentTimeMillis() + SERVICE_COLD_START_GUARD_MS;
        }
        return START_STICKY;
    }
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
