const { withAndroidManifest, withDangerousMod, withAndroidStyles } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

function withAutoLaunch(config) {
  // 0. styles.xml에 시스템 네비게이션 바 색상 명시 (splash → AppTheme 전환 시 flicker 방지)
  config = withAndroidStyles(config, (config) => {
    const styles = config.modResults;
    const ensureItem = (styleName, name, value, targetApi) => {
      const style = styles.resources.style?.find(
        (s) => s.$?.name === styleName,
      );
      if (!style) return;
      if (!style.item) style.item = [];
      const existing = style.item.find((i) => i.$?.name === name);
      if (existing) {
        existing._ = value;
        if (targetApi && !existing.$['tools:targetApi']) {
          existing.$['tools:targetApi'] = targetApi;
        }
      } else {
        const itemAttr = { name };
        if (targetApi) itemAttr['tools:targetApi'] = targetApi;
        style.item.push({ $: itemAttr, _: value });
      }
    };
    ['AppTheme', 'Theme.App.SplashScreen'].forEach((styleName) => {
      ensureItem(styleName, 'android:navigationBarColor', '#6366f1');
      ensureItem(styleName, 'android:windowLightNavigationBar', 'false', '27');
      ensureItem(styleName, 'android:statusBarColor', '#6366f1');
    });
    return config;
  });

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

    // Activity에 showWhenLocked만 추가 (잠금화면 위에 표시).
    // turnScreenOn은 추가하지 않음 — resume 때마다 화면 강제 ON을 시도해
    // 잠금화면 절전 사이클과 충돌하며 깜빡임 유발.
    if (app.activity) {
      app.activity.forEach((activity) => {
        if (activity.$?.['android:name'] === '.MainActivity') {
          activity.$['android:showWhenLocked'] = 'true';
          // 혹시 이전 prebuild 결과로 남아있다면 제거
          delete activity.$['android:turnScreenOn'];
        }
      });
    }

    if (!app.receiver) app.receiver = [];
    if (!app.receiver.some((r) => r.$?.['android:name'] === '.BootReceiver')) {
      app.receiver.push({
        $: { 'android:name': '.BootReceiver', 'android:enabled': 'true', 'android:exported': 'true' },
        'intent-filter': [{ action: [
          { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
          { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
          { $: { 'android:name': 'com.htc.intent.action.QUICKBOOT_POWERON' } },
        ] }],
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
        String action = intent.getAction();
        // 일부 제조사(삼성/HTC 등)는 표준 BOOT_COMPLETED 대신 QUICKBOOT_POWERON을 보낸다.
        boolean isBoot = Intent.ACTION_BOOT_COMPLETED.equals(action)
            || "android.intent.action.QUICKBOOT_POWERON".equals(action)
            || "com.htc.intent.action.QUICKBOOT_POWERON".equals(action);
        if (isBoot) {
            try {
                Intent serviceIntent = new Intent(context, ScreenUnlockService.class);
                // 부팅 직후엔 JS 번들 cold init 중 launch 깜빡임을 막기 위해 가드 무장 요청
                serviceIntent.putExtra("cold_start_guard", true);
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
        if (guardUntil > 0 && now < guardUntil) { android.util.Log.d(TAG, "skip: boot cold guard"); return; }
        // passive wake(알림/센서/도즈종료) 대응: delay 동안 화면이 이미 꺼져가는 중이면 abort.
        // 주의: isKeyguardLocked 체크는 하지 않음 — 잠금화면 위 자동 표시가 core UX
        try {
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) { android.util.Log.d(TAG, "skip: not interactive (passive wake)"); return; }
        } catch (Exception e) {}
        // 전화 수신/통화 중이면 실행하지 않음
        if (isPhoneCallActive(context)) { android.util.Log.d(TAG, "skip: phone call active"); return; }
        // 이미 사용자 눈앞에 resume 상태로 떠 있으면 재launch 불필요.
        // process-내 정확 판정 → 잠금화면 위 표시를 못 잡던 ActivityManager false-negative로 인한
        // 불필요한 재launch(→ window focus 흔들림 → 터치 먹통)를 근본 차단.
        if (mainActivityResumed) { android.util.Log.d(TAG, "skip: MainActivity already resumed"); return; }
        // MainActivity가 생성됐지만 아직 첫 resume 전(JS 번들 cold init 중)이면 재진입 금지.
        // 첫 resume 완료 시 콜백이 mainActivityCreatedAt=0으로 리셋하므로, 초기화가 끝난 뒤엔
        // 이 가드가 걸리지 않아 "잠깐 보고 바로 화면 껐다 켜기" 같은 정상 패턴의 자동표시(core UX)를
        // 억제하지 않는다. boot guard(guardUntil)가 못 막는 "앱 직접 실행(업데이트 직후)" 콜드스타트만 커버.
        long created = mainActivityCreatedAt;
        if (created > 0 && android.os.SystemClock.elapsedRealtime() - created < COLD_INIT_GUARD_MS) {
            android.util.Log.d(TAG, "skip: MainActivity cold-init in progress");
            return;
        }
        // 이미 앱이 포그라운드면 재런치 skip (보조 판정)
        if (isAppInForeground(context)) { android.util.Log.d(TAG, "skip: app already foreground"); return; }
        // 디바운싱: 마지막 런치로부터 2.5초 이내면 무시
        if (now - lastLaunchTime < LAUNCH_DEBOUNCE_MS) { android.util.Log.d(TAG, "skip: debounce"); return; }
        lastLaunchTime = now;
        android.util.Log.d(TAG, "launch: MainActivity (auto-show)");
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
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import androidx.core.content.FileProvider;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class AlarmModule extends ReactContextBaseJavaModule {
    private static final String PREFS_NAME = "iwmemo_storage";

    public AlarmModule(ReactApplicationContext context) { super(context); }

    @Override public String getName() { return "AlarmModule"; }

    private SharedPreferences getPrefs() {
        return getReactApplicationContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
    }

    @ReactMethod
    public void savePref(String key, String value, Promise promise) {
        try {
            getPrefs().edit().putString(key, value).apply();
            promise.resolve(true);
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void getPref(String key, Promise promise) {
        try {
            promise.resolve(getPrefs().getString(key, null));
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void deletePref(String key, Promise promise) {
        try {
            getPrefs().edit().remove(key).apply();
            promise.resolve(true);
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void saveAuthToken(String token, Promise promise) {
        try {
            getPrefs().edit().putString("auth_token", token == null ? "" : token).apply();
            if (promise != null) promise.resolve(true);
        } catch (Exception e) {
            if (promise != null) promise.reject("ERROR", e.getMessage());
        }
    }

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

    // APK를 앱 내부 캐시에 다운로드한 뒤 시스템 인스톨러 실행
    @ReactMethod
    public void downloadAndInstallApk(String url, Promise promise) {
        new Thread(() -> {
            try {
                Context context = getReactApplicationContext();
                File apkFile = new File(context.getCacheDir(), "update.apk");
                if (apkFile.exists()) apkFile.delete();

                URL currentUrl = new URL(url);
                HttpURLConnection conn = (HttpURLConnection) currentUrl.openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(120000);
                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    conn.disconnect();
                    promise.reject("DOWNLOAD_ERROR", "HTTP " + code);
                    return;
                }

                InputStream input = conn.getInputStream();
                FileOutputStream output = new FileOutputStream(apkFile);
                byte[] buffer = new byte[16384];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
                output.flush();
                output.close();
                input.close();
                conn.disconnect();

                Uri apkUri = FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".FileSystemFileProvider",
                    apkFile
                );

                Intent installIntent = new Intent(Intent.ACTION_VIEW);
                installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                installIntent.addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK |
                    Intent.FLAG_GRANT_READ_URI_PERMISSION
                );
                context.startActivity(installIntent);

                promise.resolve(true);
            } catch (Exception e) {
                promise.reject("ERROR", e.getMessage());
            }
        }).start();
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
import android.content.SharedPreferences;
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
import java.net.URLEncoder;

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
            // JS가 SharedPreferences("iwmemo_storage")/"auth_token"에 동기화해 둔 JWT 사용.
            // 토큰이 없으면 서버가 401만 반환하므로 시도 자체를 skip (조용한 무동작 방지).
            SharedPreferences prefs = getApplicationContext()
                .getSharedPreferences("iwmemo_storage", Context.MODE_PRIVATE);
            String token = prefs.getString("auth_token", null);
            if (token == null || token.isEmpty()) {
                android.util.Log.w("AlarmActivity", "deleteTaskSync: auth_token 없음 — DELETE skip");
                return;
            }
            String urlStr = "https://growthpad.simssijjang.workers.dev/api/tasks?id="
                + URLEncoder.encode(taskId, "UTF-8");
            int maxRedirects = 5;
            for (int i = 0; i < maxRedirects; i++) {
                URL url = new URL(urlStr);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("DELETE");
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(10000);
                conn.setRequestProperty("Content-Type", "application/json");
                // 토큰 유출 방지: 동일 API 호스트로 가는 요청에만 Authorization 부착
                if ("growthpad.simssijjang.workers.dev".equals(url.getHost())) {
                    conn.setRequestProperty("Authorization", "Bearer " + token);
                }
                int code = conn.getResponseCode();
                if (code == 301 || code == 302 || code == 307 || code == 308) {
                    String location = conn.getHeaderField("Location");
                    conn.disconnect();
                    if (location != null) { urlStr = location; continue; }
                }
                if (code < 200 || code >= 300) {
                    android.util.Log.w("AlarmActivity", "deleteTaskSync 실패 HTTP " + code);
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

    // 잠금화면 위에 앱 표시 (setTurnScreenOn 제거 — 화면 자동꺼짐 시 flicker 원인)
    // 화면 wake은 ScreenUnlockService의 wake lock(ACQUIRE_CAUSES_WAKEUP)이 담당
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
      )
    }

    // keyguard 위로 올라올 때 기본 enter 애니메이션 제거 → cold start 시 깜빡임 완화
    @Suppress("DEPRECATION")
    overridePendingTransition(0, 0)

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
        // 잠금화면 서비스(ScreenUnlockService)가 참조할 MainActivity lifecycle을 프로세스 시작
        // 시점에 전역 등록 — 서비스 onCreate 등록의 startup race를 구조적으로 제거.
        if (!content.includes('mainActivityResumed')) {
          content = content.replace(
            'ApplicationLifecycleDispatcher.onApplicationCreate(this)',
            `ApplicationLifecycleDispatcher.onApplicationCreate(this)

    registerActivityLifecycleCallbacks(object : android.app.Application.ActivityLifecycleCallbacks {
      override fun onActivityCreated(activity: android.app.Activity, savedInstanceState: android.os.Bundle?) {
        if (activity is MainActivity) {
          ScreenUnlockService.mainActivityCreatedAt = android.os.SystemClock.elapsedRealtime()
        }
      }
      override fun onActivityResumed(activity: android.app.Activity) {
        if (activity is MainActivity) {
          ScreenUnlockService.mainActivityResumed = true
          ScreenUnlockService.mainActivityCreatedAt = 0
        }
      }
      override fun onActivityPaused(activity: android.app.Activity) {
        if (activity is MainActivity) {
          ScreenUnlockService.mainActivityResumed = false
        }
      }
      override fun onActivityStarted(activity: android.app.Activity) {}
      override fun onActivityStopped(activity: android.app.Activity) {}
      override fun onActivitySaveInstanceState(activity: android.app.Activity, outState: android.os.Bundle) {}
      override fun onActivityDestroyed(activity: android.app.Activity) {}
    })`
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
