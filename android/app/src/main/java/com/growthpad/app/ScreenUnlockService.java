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
    private static final String TAG = "ScreenUnlockSvc";
    private static final String CHANNEL_ID = "auto_launch_channel";
    private static final int NOTIFICATION_ID = 2001;
    private static final long LAUNCH_DEBOUNCE_MS = 2500;
    // MainActivity가 방금 생성돼 JS 번들 cold init 중인 동안 재launch를 억제하는 창(窓).
    // boot 경로 전용 guardUntil이 못 막는 "앱 직접 실행(업데이트 직후) 콜드스타트"를 커버.
    private static final long COLD_INIT_GUARD_MS = 6000;
    // keyguard window 준비 기다림 + passive wake 감지 (너무 짧으면 isInteractive 체크가 false negative)
    private static final long SCREEN_ON_LAUNCH_DELAY_MS = 350;
    private static final long USER_PRESENT_LAUNCH_DELAY_MS = 100;
    private static final long SCREEN_ON_WAKELOCK_MS = 2500;
    // resume 직후 keyguard가 window focus를 아직 안 넘긴 정상 전환과, focus를 영영 못 받는
    // 먹통 상태를 구분하는 유예. 유예 안이면 재확인만 예약하고, 지나면 복구 relaunch.
    private static final long FOCUS_SETTLE_MS = 800;
    private static final long FOCUS_RECHECK_MS = 1000;
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
    // MainActivity lifecycle 상태 — MainApplication.onCreate()에서 프로세스 시작 시점에
    // 전역(ActivityLifecycleCallbacks) 등록되어 갱신된다. static인 이유:
    //  1) 서비스 생성이 지연돼도 최초 MainActivity의 created/resumed 이벤트를 놓치지 않음
    //     (서비스 onCreate에서 등록하면 MainActivity.onCreate보다 늦게 스케줄될 수 있는 race).
    //  2) 서비스가 재생성돼도 상태가 유지됨.
    //  3) process-death로 프로세스가 통째로 죽으면 클래스가 언로드되어 false/0으로 초기화 →
    //     잠금화면 자동표시(core UX)를 방해하지 않음.
    // 이 process-내 정확 판정으로, ActivityManager importance 휴리스틱이 잠금화면 위 표시를
    // FOREGROUND로 못 잡던 false-negative(→ 불필요한 재launch → window focus 흔들림 → 터치 먹통)를 대체.
    public static volatile boolean mainActivityResumed = false;
    public static volatile long mainActivityCreatedAt = 0;
    // onStart~onStop 사이(화면에 보이거나 전환 중). resume 직전 과도기에 불필요한
    // 재launch(→ z-order/focus 흔들림 → 터치 먹통)를 막는 가드로 쓴다.
    public static volatile boolean mainActivityStarted = false;
    // MainActivity.onWindowFocusChanged로 갱신. resumed인데 focus가 없는 상태가
    // 지속되면 터치가 먹지 않는 먹통 상태 → 이때만 표적 복구 relaunch를 허용한다.
    public static volatile boolean mainActivityHasFocus = true;
    // 마지막 onResume 시각(elapsedRealtime). focus 유예(FOCUS_SETTLE_MS) 기준점.
    public static volatile long mainActivityResumedAt = 0;
    // AlarmActivity가 떠 있는 동안 자동표시 launch 금지 — 울리는 알람 위로 MainActivity를
    // 끌어올리면 singleTask clear-top으로 알람이 파괴되거나 z-order 경합이 생긴다.
    public static volatile boolean alarmActivityVisible = false;

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
        // 최근 앱 업데이트(또는 첫 설치) 직후면 cold-start 가드 무장(업데이트 직후 "떴다 꺼짐" 방지).
        // 기준은 OS가 기록하는 패키지 lastUpdateTime — 구 방식(prefs last_update_at, "설치 인텐트
        // 직전" 기록)은 사용자의 설치 확인·설치 시간에 따라 15초 창을 이미 지나 가드가 사실상
        // 무장되지 않는 구멍이 있었다(2026-07-11 재발 원인). MY_PACKAGE_REPLACED 리시버가 설치
        // 수 초 내 서비스를 재시작하므로 90초 창이면 확실히 잡힌다.
        try {
            long osUpdatedAt = getPackageManager()
                .getPackageInfo(getPackageName(), 0).lastUpdateTime;
            if (System.currentTimeMillis() - osUpdatedAt < 90_000L) {
                guardUntil = System.currentTimeMillis() + SERVICE_COLD_START_GUARD_MS;
                android.util.Log.d(TAG, "cold guard armed: recent app update install");
            }
        } catch (Exception e) {}
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
        if (guardUntil > 0 && now < guardUntil) { android.util.Log.d(TAG, "skip: boot cold guard"); return; }
        // passive wake(알림/센서/도즈종료) 대응: delay 동안 화면이 이미 꺼져가는 중이면 abort.
        // 주의: isKeyguardLocked 체크는 하지 않음 — 잠금화면 위 자동 표시가 core UX
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) { android.util.Log.d(TAG, "skip: not interactive (passive wake)"); return; }
        } catch (Exception e) {}
        // 전화 수신/통화 중이면 실행하지 않음
        if (isPhoneCallActive(context)) { android.util.Log.d(TAG, "skip: phone call active"); return; }
        // 사용자가 자동표시를 끈 경우(설정 토글) 전 경로 중단. 기본값은 켜짐(core UX).
        try {
            String enabled = context.getSharedPreferences("iwmemo_storage", Context.MODE_PRIVATE)
                .getString("auto_launch_enabled", "true");
            if ("false".equals(enabled)) { android.util.Log.d(TAG, "skip: auto-launch disabled by user"); return; }
        } catch (Exception e) {}
        // 알람(AlarmActivity)이 떠 있으면 자동표시 금지 — 알람이 화면을 깨우며 SCREEN_ON을
        // 유발하므로, 여기서 막지 않으면 울리는 알람 위로 MainActivity가 올라와
        // singleTask clear-top으로 알람을 파괴하거나 z-order/focus 경합을 일으킨다.
        if (alarmActivityVisible) { android.util.Log.d(TAG, "skip: AlarmActivity visible"); return; }
        // 이미 사용자 눈앞에 resume + window focus 상태로 떠 있으면 재launch 불필요.
        // process-내 정확 판정 → 잠금화면 위 표시를 못 잡던 ActivityManager false-negative로 인한
        // 불필요한 재launch(→ window focus 흔들림 → 터치 먹통)를 근본 차단.
        boolean focusLost = mainActivityResumed && !mainActivityHasFocus;
        if (mainActivityResumed && mainActivityHasFocus) { android.util.Log.d(TAG, "skip: MainActivity resumed+focused"); return; }
        if (focusLost) {
            // resume 직후 keyguard가 focus를 아직 안 넘긴 정상 전환일 수 있다 → 유예 안이면
            // 재확인만 예약. 유예를 넘겨도 focus가 없으면 "화면은 보이는데 터치가 안 먹는"
            // 먹통 상태로 보고 표적 복구 relaunch로 focus 재협상을 강제한다(7way 수렴 발견).
            long sinceResume = android.os.SystemClock.elapsedRealtime() - mainActivityResumedAt;
            if (sinceResume < FOCUS_SETTLE_MS) {
                android.util.Log.d(TAG, "focus settling (" + sinceResume + "ms) — recheck scheduled");
                handler.removeCallbacks(launchRunnable);
                handler.postDelayed(launchRunnable, FOCUS_RECHECK_MS);
                return;
            }
            android.util.Log.d(TAG, "recovery: resumed without focus for " + sinceResume + "ms");
        } else if (mainActivityStarted) {
            // 보이는 상태로 resume 전환 중(화면 off→on 직후 등). 자연 resume이 곧 일어나므로
            // 재launch하면 오히려 task 끌어올리기로 focus를 흔든다 → skip.
            android.util.Log.d(TAG, "skip: MainActivity visible, resume in transit");
            return;
        }
        // MainActivity가 생성됐지만 아직 첫 resume 전(JS 번들 cold init 중)이면 재진입 금지.
        // 첫 resume 완료 시 콜백이 mainActivityCreatedAt=0으로 리셋하므로, 초기화가 끝난 뒤엔
        // 이 가드가 걸리지 않아 "잠깐 보고 바로 화면 껐다 켜기" 같은 정상 패턴의 자동표시(core UX)를
        // 억제하지 않는다. boot guard(guardUntil)가 못 막는 "앱 직접 실행(업데이트 직후)" 콜드스타트만 커버.
        long created = mainActivityCreatedAt;
        if (created > 0 && android.os.SystemClock.elapsedRealtime() - created < COLD_INIT_GUARD_MS) {
            android.util.Log.d(TAG, "skip: MainActivity cold-init in progress");
            return;
        }
        // 이미 앱이 포그라운드면 재런치 skip (보조 판정 — focus 복구 경로에서는 건너뜀:
        // resumed 상태라 importance가 FOREGROUND로 잡혀 복구가 막히기 때문)
        if (!focusLost && isAppInForeground(context)) { android.util.Log.d(TAG, "skip: app already foreground"); return; }
        // 디바운싱: 마지막 런치로부터 2.5초 이내면 무시
        if (now - lastLaunchTime < LAUNCH_DEBOUNCE_MS) { android.util.Log.d(TAG, "skip: debounce"); return; }
        lastLaunchTime = now;
        android.util.Log.d(TAG, focusLost ? "launch: MainActivity (focus recovery)" : "launch: MainActivity (auto-show)");
        try {
            Intent launchIntent = new Intent(context, MainActivity.class);
            // NO_ANIMATION: keyguard 위에 진입할 때 window 슬라이드 애니메이션 제거 → 깜빡임 완화.
            // REORDER_TO_FRONT 제거: 기존 task를 앞으로 끌어내며 z-order/focus를 흔들어
            // 잠금화면 위 RN window의 터치 이벤트 유실을 유발 → NEW_TASK|SINGLE_TOP만 사용
            // (MainActivity는 launchMode=singleTask라 중복 인스턴스 없이 재사용됨).
            launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
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
        // lifecycle 콜백은 MainApplication(프로세스 수명)에 등록되므로 서비스 onDestroy에서 해제하지 않음.
        super.onDestroy();
        // START_STICKY가 시스템 재시작을 처리 - 수동 재시작 제거 (APK 업데이트 충돌 방지)
    }
    @Override public void onTaskRemoved(Intent rootIntent) {
        try {
            // 사용자가 자동실행을 꺼 뒀으면 부활하지 않는다(설정 존중).
            String enabled = getSharedPreferences("iwmemo_storage", Context.MODE_PRIVATE)
                .getString("auto_launch_enabled", "true");
            if (!"false".equals(enabled)) {
                Intent restartIntent = new Intent(this, ScreenUnlockService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(restartIntent);
                else startService(restartIntent);
            }
        } catch (Exception e) {}
        super.onTaskRemoved(rootIntent);
    }
}
