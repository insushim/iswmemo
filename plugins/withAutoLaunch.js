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

      // ── 백업 제외 규칙 (보안) ────────────────────────────────────────
      // expo-secure-store 가 제공하는 동명 리소스는 <include domain="sharedpref" path="."/> 라
      // **모든** SharedPreferences 를 구글 자동백업에 올린다 — 여기엔 storage.ts 가 평문으로
      // 복제 저장하는 JWT(iwmemo_storage)가 포함된다(SecureStore 만 제외됨).
      // 앱 리소스가 라이브러리 리소스를 덮어쓰므로, 여기서 iwmemo_storage 도 제외한다.
      // (동일 파일명 유지 필수 — AndroidManifest 가 @xml/secure_store_* 를 참조)
      const xmlDir = path.join(projectRoot, 'app', 'src', 'main', 'res', 'xml');
      fs.mkdirSync(xmlDir, { recursive: true });

      fs.writeFileSync(
        path.join(xmlDir, 'secure_store_backup_rules.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<!-- Android 11 이하 자동백업. iwmemo_storage = 평문 JWT 복제본 → 백업 제외(보안). -->
<full-backup-content>
  <include domain="sharedpref" path="."/>
  <exclude domain="sharedpref" path="SecureStore"/>
  <exclude domain="sharedpref" path="iwmemo_storage"/>
</full-backup-content>
`
      );

      fs.writeFileSync(
        path.join(xmlDir, 'secure_store_data_extraction_rules.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<!-- Android 12+ 클라우드백업/기기이전. iwmemo_storage = 평문 JWT 복제본 → 제외(보안). -->
<data-extraction-rules>
  <cloud-backup>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
    <exclude domain="sharedpref" path="iwmemo_storage"/>
  </cloud-backup>
  <device-transfer>
    <include domain="sharedpref" path="."/>
    <exclude domain="sharedpref" path="SecureStore"/>
    <exclude domain="sharedpref" path="iwmemo_storage"/>
  </device-transfer>
</data-extraction-rules>
`
      );

      // BootReceiver.java
      fs.writeFileSync(
        path.join(javaDir, 'BootReceiver.java'),
        `package ${pkg};

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        // 일부 제조사(삼성/HTC 등)는 표준 BOOT_COMPLETED 대신 QUICKBOOT_POWERON을 보낸다.
        boolean isBoot = Intent.ACTION_BOOT_COMPLETED.equals(action)
            || "android.intent.action.QUICKBOOT_POWERON".equals(action)
            || "com.htc.intent.action.QUICKBOOT_POWERON".equals(action);
        // 앱 업데이트(패키지 교체)는 프로세스·서비스를 죽이고 AlarmManager 알람도 소거한다.
        // 리시버 없이는 다음 앱 실행 전까지 잠금화면 자동표시가 죽어 있었음(2026-07-11 버그).
        // MY_PACKAGE_REPLACED는 FGS 백그라운드 시작 예외 목록에 명시된 액션(BOOT_COMPLETED와 동급).
        boolean isUpdate = Intent.ACTION_MY_PACKAGE_REPLACED.equals(action);
        if (!isBoot && !isUpdate) return;

        SharedPreferences prefs =
            context.getSharedPreferences("iwmemo_storage", Context.MODE_PRIVATE);
        try {
            // 사용자가 자동실행을 꺼 뒀으면 서비스는 시작하지 않는다(설정 존중).
            String enabled = prefs.getString("auto_launch_enabled", "true");
            if (!"false".equals(enabled)) {
                Intent serviceIntent = new Intent(context, ScreenUnlockService.class);
                // 부팅/업데이트 직후엔 JS 번들 cold init 중 launch 깜빡임을 막기 위해 가드 무장 요청
                serviceIntent.putExtra("cold_start_guard", true);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

        if (isUpdate) {
            try {
                // 자체 업데이트(AlarmModule이 설치 인텐트 직전 last_update_at 기록)일 때만
                // 앱을 자동 재실행 — 설치가 앱을 죽여 "혼자 꺼지고 다시 켜야 하던" 단계를 없앤다.
                // adb/스토어 등 외부 경로 업데이트에는 발동하지 않게 마커로 게이트.
                // BAL은 오버레이 권한(이 앱 필수 권한) 보유 시 허용 — 차단돼도 무해(기존 동작 유지).
                long lastUpdate = prefs.getLong("last_update_at", 0);
                long age = lastUpdate > 0 ? System.currentTimeMillis() - lastUpdate : -1;
                android.util.Log.d("GpBootReceiver",
                    "MY_PACKAGE_REPLACED: marker=" + lastUpdate + " ageMs=" + age);
                if (lastUpdate > 0 && age < 10 * 60_000L) {
                    prefs.edit().remove("last_update_at").apply(); // 1회성 마커 소거
                    Intent launch = new Intent(context, MainActivity.class);
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(launch);
                    android.util.Log.d("GpBootReceiver", "relaunch attempted");
                } else {
                    android.util.Log.d("GpBootReceiver", "relaunch skipped (no fresh marker)");
                }
            } catch (Exception e) {
                android.util.Log.e("GpBootReceiver", "relaunch failed", e);
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
            // 사용자 의도 기록 — MainActivity/BootReceiver/onTaskRemoved/launchApp이 이 플래그를 존중.
            context.getSharedPreferences("iwmemo_storage", Context.MODE_PRIVATE)
                .edit().putString("auto_launch_enabled", "true").apply();
            Intent intent = new Intent(context, ScreenUnlockService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) context.startForegroundService(intent);
            else context.startService(intent);
        } catch (Exception e) { e.printStackTrace(); }
    }

    // 설정 토글 OFF 경로. 이전에는 JS(SettingsScreen)가 호출하는데 네이티브에 없어서
    // TypeError로 토글 자체가 죽고 서비스도 계속 살아 있었다(7way 확정 버그).
    @ReactMethod
    public void stopService() {
        try {
            Context context = getReactApplicationContext();
            context.getSharedPreferences("iwmemo_storage", Context.MODE_PRIVATE)
                .edit().putString("auto_launch_enabled", "false").apply();
            context.stopService(new Intent(context, ScreenUnlockService.class));
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

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;

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

    // ── PBKDF2-HMAC-SHA256 (E2EE 키 도출) ─────────────────────────────
    // JS(@noble) 순수 구현은 Hermes에서 60만회에 수 분 걸려 UI가 얼어붙는다(ANR).
    // 스펙(RFC 2898)을 raw bytes로 그대로 구현해 @noble과 바이트 단위 동일 출력 보장(실측 확인).
    private static byte[] pbkdf2HmacSha256(byte[] pass, byte[] salt, int iterations, int dkLen) throws Exception {
        javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
        mac.init(new javax.crypto.spec.SecretKeySpec(pass, "HmacSHA256"));
        final int hLen = 32;
        int blocks = (dkLen + hLen - 1) / hLen;
        byte[] dk = new byte[blocks * hLen];
        byte[] saltBlock = new byte[salt.length + 4];
        System.arraycopy(salt, 0, saltBlock, 0, salt.length);
        for (int i = 1; i <= blocks; i++) {
            saltBlock[salt.length] = (byte) (i >>> 24);
            saltBlock[salt.length + 1] = (byte) (i >>> 16);
            saltBlock[salt.length + 2] = (byte) (i >>> 8);
            saltBlock[salt.length + 3] = (byte) i;
            byte[] u = mac.doFinal(saltBlock);
            byte[] t = u.clone();
            for (int c = 1; c < iterations; c++) {
                u = mac.doFinal(u);
                for (int k = 0; k < hLen; k++) t[k] ^= u[k];
            }
            System.arraycopy(t, 0, dk, (i - 1) * hLen, hLen);
        }
        return java.util.Arrays.copyOf(dk, dkLen);
    }

    /** passB64/saltB64 → base64(파생키). 백그라운드 스레드에서 실행(네이티브 ~1초). */
    @ReactMethod
    public void deriveKeyPbkdf2(String passB64, String saltB64, int iterations, int dkLen, Promise promise) {
        new Thread(() -> {
            try {
                byte[] pass = android.util.Base64.decode(passB64, android.util.Base64.NO_WRAP);
                byte[] salt = android.util.Base64.decode(saltB64, android.util.Base64.NO_WRAP);
                if (pass.length == 0 || salt.length == 0 || iterations < 1 || dkLen < 1) {
                    promise.reject("E2EE_ARGS", "invalid pbkdf2 args");
                    return;
                }
                byte[] key = pbkdf2HmacSha256(pass, salt, iterations, dkLen);
                promise.resolve(android.util.Base64.encodeToString(key, android.util.Base64.NO_WRAP));
            } catch (Exception e) {
                promise.reject("E2EE_DERIVE", e.getMessage());
            }
        }, "e2ee-pbkdf2").start();
    }

    // SharedPreferences 기반 key-value 저장소 — expo-secure-store가 기기 버그로
    // null 반환하는 경우를 우회하기 위한 reliable fallback
    @ReactMethod
    public void savePref(String key, String value, Promise promise) {
        try {
            getPrefs().edit().putString(key, value).apply();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void getPref(String key, Promise promise) {
        try {
            promise.resolve(getPrefs().getString(key, null));
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void deletePref(String key, Promise promise) {
        try {
            getPrefs().edit().remove(key).apply();
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    // 기존 saveAuthToken (JS가 호출하고 있어 호환 유지)
    @ReactMethod
    public void saveAuthToken(String token, Promise promise) {
        try {
            getPrefs().edit().putString("auth_token", token == null ? "" : token).apply();
            if (promise != null) promise.resolve(true);
        } catch (Exception e) {
            if (promise != null) promise.reject("ERROR", e.getMessage());
        }
    }

    // type: "task" | "schedule" | "timer" — JS(taskAlarm.ts)가 4번째 인자로 넘기던 값.
    // 이전 시그니처는 3인자 + Promise라 type이 브릿지에서 유실됐다(7way 확정 — JS/네이티브
    // 인자 불일치). AlarmActivity가 완료 처리 시 삭제 대상(task vs routine)을 구분하는 데 쓴다.
    @ReactMethod
    public void scheduleAlarm(String taskId, String title, double triggerTimeMs, String type, Promise promise) {
        try {
            Context context = getReactApplicationContext();
            AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
            Intent intent = new Intent(context, AlarmActivity.class);
            intent.putExtra("taskId", taskId);
            intent.putExtra("title", title);
            intent.putExtra("type", type == null ? "task" : type);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            int requestCode = taskId.hashCode();
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            PendingIntent pendingIntent;
            if (Build.VERSION.SDK_INT >= 34) {
                // Android 14+/16: AlarmManager 백그라운드 액티비티 실행이 BAL로 막힌다. PendingIntent
                // 생성자(=앱)가 BAL을 명시 허용하면 앱 SAW 권한으로 통과된다(실측 Android16).
                android.app.ActivityOptions opts = android.app.ActivityOptions.makeBasic()
                    .setPendingIntentCreatorBackgroundActivityStartMode(
                        android.app.ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED);
                pendingIntent = PendingIntent.getActivity(context, requestCode, intent, piFlags, opts.toBundle());
            } else {
                pendingIntent = PendingIntent.getActivity(context, requestCode, intent, piFlags);
            }
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
            Intent intent = new Intent("com.growthpad.app.DISMISS_ALARM");
            // 자기 패키지로 한정한 explicit broadcast — 다른 앱으로 새거나(정보 노출)
            // implicit broadcast 제약에 걸리는 것을 방지.
            intent.setPackage(context.getPackageName());
            context.sendBroadcast(intent);
        } catch (Exception e) { e.printStackTrace(); }
    }

    // 알람 화면(AlarmActivity)에서 "완료 처리"했지만 네이티브 HTTP DELETE가 실패/skip된 항목을
    // JS가 앱 복귀 시 이어서 지우는 폴백 큐. JS(processPendingDelete)는 처음부터 이 API를
    // 호출하고 있었지만 네이티브 구현이 없어 유령 기능이었다(7way 확정 버그).
    @ReactMethod
    public void getPendingDelete(Promise promise) {
        try {
            String id = getPrefs().getString("pending_delete_id", null);
            if (id == null || id.isEmpty()) { promise.resolve(null); return; }
            WritableMap map = Arguments.createMap();
            map.putString("id", id);
            map.putString("type", getPrefs().getString("pending_delete_type", "task"));
            promise.resolve(map);
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    @ReactMethod
    public void clearPendingDelete(Promise promise) {
        try {
            getPrefs().edit().remove("pending_delete_id").remove("pending_delete_type").apply();
            promise.resolve(true);
        } catch (Exception e) { promise.reject("ERROR", e.getMessage()); }
    }

    // APK를 앱 내부 캐시 디렉토리에 다운로드한 후 시스템 인스톨러 실행.
    // Linking.openURL(browser)의 이중 다운로드/수동 열기 문제 해결.
    @ReactMethod
    public void downloadAndInstallApk(String url, Promise promise) {
        new Thread(() -> {
            try {
                Context context = getReactApplicationContext();
                File apkFile = new File(context.getCacheDir(), "update.apk");
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                // 신뢰 호스트(GitHub 릴리스)만 허용 — 임의 URL로 APK 설치 유도되는 것 방지.
                URL currentUrl = new URL(url);
                String host = currentUrl.getHost();
                boolean allowedHost = "https".equals(currentUrl.getProtocol()) && host != null && (
                    host.equals("github.com") || host.endsWith(".github.com")
                    || host.equals("githubusercontent.com") || host.endsWith(".githubusercontent.com"));
                if (!allowedHost) {
                    promise.reject("DOWNLOAD_ERROR", "untrusted APK host: " + host);
                    return;
                }
                // Redirect 따라가며 다운로드
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

                // FileSystemFileProvider (expo-file-system 제공)를 통해 content:// URI 생성
                Uri apkUri = FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".FileSystemFileProvider",
                    apkFile
                );

                // "자체 업데이트" 마커 — 설치 완료 후 MY_PACKAGE_REPLACED 리시버(BootReceiver)가
                // 이 값을 보고 앱을 자동 재실행한다(설치가 앱을 죽여 "혼자 꺼지던" 단계 제거).
                // adb/스토어 등 외부 경로 업데이트와 구분하는 게이트. cold-start 가드 무장은
                // 이제 OS packageInfo.lastUpdateTime 기준(ScreenUnlockService.onCreate)이라
                // 이 시각의 15초 창 의존이 없다.
                getPrefs().edit().putLong("last_update_at", System.currentTimeMillis()).apply();

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
    private android.os.PowerManager.WakeLock screenWakeLock;

    // ACQUIRE_CAUSES_WAKEUP 웨이크락으로 꺼진 화면을 강제로 켠다(알람 앱 표준).
    private void acquireWakeScreen() {
        try {
            android.os.PowerManager pm =
                (android.os.PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                screenWakeLock = pm.newWakeLock(
                    android.os.PowerManager.SCREEN_BRIGHT_WAKE_LOCK
                    | android.os.PowerManager.ACQUIRE_CAUSES_WAKEUP
                    | android.os.PowerManager.ON_AFTER_RELEASE,
                    "growthpad:alarmscreen");
                screenWakeLock.acquire(60000L);
            }
        } catch (Exception e) { e.printStackTrace(); }
    }

    private void releaseWakeScreen() {
        try {
            if (screenWakeLock != null && screenWakeLock.isHeld()) screenWakeLock.release();
        } catch (Exception e) {}
        screenWakeLock = null;
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // 잠금화면 위 표시 + 화면 켜기. setShowWhenLocked/turnScreenOn만으로는 AlarmManager
        // 백그라운드 실행 시 삼성/Android16에서 화면이 안 켜지는 경우가 있어 윈도우 플래그 +
        // ACQUIRE_CAUSES_WAKEUP 웨이크락을 함께 건다.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        // ⚠️ FLAG_DISMISS_KEYGUARD / requestDismissKeyguard 는 넣지 않는다 — 넣으면 보안
        // 잠금 화면이 먼저 떠서 풀어야 알람이 보인다. setShowWhenLocked 만으로 잠금 위에 표시.
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        acquireWakeScreen();

        // Android 15(API 35)+ edge-to-edge 강제로 레거시 Fullscreen 테마가 무력화되어
        // 시스템 바가 콘텐츠 위에 겹친다("회색 띠"). 알람은 몰입형 전체화면이 맞으므로
        // 시스템 바를 숨기고, 아래 setContentView 뒤 인셋 패딩 폴백으로 잘림을 방지한다.
        androidx.core.view.WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        try {
            androidx.core.view.WindowInsetsControllerCompat insetsCtrl =
                androidx.core.view.WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            insetsCtrl.hide(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            insetsCtrl.setSystemBarsBehavior(
                androidx.core.view.WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        } catch (Exception e) { e.printStackTrace(); }

        String taskId = getIntent().getStringExtra("taskId");
        String title = getIntent().getStringExtra("title");
        String alarmType = getIntent().getStringExtra("type");
        if (title == null) title = "알람";
        if (alarmType == null) alarmType = "task";
        final String fType = alarmType;

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

        // ⚠️ 플레인 View는 wrap_content여도 measure 시 getDefaultSize()로 가용 공간을
        // 전부 채운다. 명시적 높이를 주지 않으면 이 spacer가 화면 전체를 먹어 제목이 위로
        // 붙고 뒤의 버튼이 화면 밖으로 밀린다.
        View spacer = new View(this);
        spacer.setLayoutParams(new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, 48));
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
            spacer2.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 24));
            layout.addView(spacer2);
            Button deleteBtn = new Button(this);
            deleteBtn.setText("완료 처리");
            deleteBtn.setTextSize(16);
            deleteBtn.setBackgroundColor(0xFF22c55e);
            deleteBtn.setTextColor(0xFFFFFFFF);
            deleteBtn.setPadding(48, 24, 48, 24);
            final String fTaskId = taskId;
            deleteBtn.setOnClickListener(v -> {
                new Thread(() -> deleteTaskSync(fTaskId, fType)).start();
                stopAlarm();
                finish();
            });
            layout.addView(deleteBtn);
        }

        setContentView(layout);
        // 인셋 패딩 폴백: 시스템 바 숨김이 무시되는 기기에서도 콘텐츠가 바 뒤로 잘리지 않게.
        final int basePad = 48;
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(layout, (v, insets) -> {
            androidx.core.graphics.Insets bars =
                insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars());
            v.setPadding(basePad + bars.left, basePad + bars.top, basePad + bars.right, basePad + bars.bottom);
            return insets;
        });
        androidx.core.view.ViewCompat.requestApplyInsets(layout);
        startAlarm();
        handler.postDelayed(() -> { stopAlarm(); finish(); }, 60000);

        dismissReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) { stopAlarm(); finish(); }
        };
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(dismissReceiver, new IntentFilter("com.growthpad.app.DISMISS_ALARM"), Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(dismissReceiver, new IntentFilter("com.growthpad.app.DISMISS_ALARM"));
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

    // 네이티브 DELETE가 실패/skip되면 pending_delete_*에 기록 — JS(processPendingDelete)가
    // 앱 복귀 시 인증된 api 클라이언트로 이어서 지운다(폴백 큐). 성공 시엔 큐를 비운다.
    private void setPendingDelete(SharedPreferences prefs, String taskId, String type) {
        prefs.edit()
            .putString("pending_delete_id", taskId)
            .putString("pending_delete_type", type == null ? "task" : type)
            .apply();
    }

    private void deleteTaskSync(String taskId, String type) {
        SharedPreferences prefs = getApplicationContext()
            .getSharedPreferences("iwmemo_storage", Context.MODE_PRIVATE);
        try {
            // JS가 SharedPreferences("iwmemo_storage")/"auth_token"에 동기화해 둔 JWT 사용.
            // 토큰이 없으면 서버가 401만 반환하므로 시도 자체를 skip (조용한 무동작 방지).
            String token = prefs.getString("auth_token", null);
            if (token == null || token.isEmpty()) {
                android.util.Log.w("AlarmActivity", "deleteTaskSync: auth_token 없음 — pending 기록 후 skip");
                setPendingDelete(prefs, taskId, type);
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
                if (code >= 200 && code < 300) {
                    // 서버 삭제 성공 — 혹시 남아 있던 pending도 정리.
                    prefs.edit().remove("pending_delete_id").remove("pending_delete_type").apply();
                } else {
                    android.util.Log.w("AlarmActivity", "deleteTaskSync 실패 HTTP " + code + " — pending 기록");
                    setPendingDelete(prefs, taskId, type);
                }
                conn.disconnect();
                break;
            }
        } catch (Exception e) {
            e.printStackTrace();
            setPendingDelete(prefs, taskId, type);
        }
    }

    @Override
    protected void onDestroy() {
        stopAlarm();
        releaseWakeScreen();
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
import android.content.SharedPreferences;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

public class AlarmDeleteReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String taskId = intent.getStringExtra("taskId");
        if (taskId == null) return;
        final Context appContext = context.getApplicationContext();
        new Thread(() -> {
            try {
                // JS가 SharedPreferences("iwmemo_storage")/"auth_token"에 동기화해 둔 JWT 사용.
                // 없으면 서버가 401만 반환하므로 시도 자체를 skip (조용한 무동작 방지).
                SharedPreferences prefs = appContext
                    .getSharedPreferences("iwmemo_storage", Context.MODE_PRIVATE);
                String token = prefs.getString("auth_token", null);
                if (token == null || token.isEmpty()) {
                    android.util.Log.w("AlarmDeleteReceiver", "auth_token 없음 — DELETE skip");
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
                        android.util.Log.w("AlarmDeleteReceiver", "DELETE 실패 HTTP " + code);
                    }
                    conn.disconnect();
                    break;
                }
            } catch (Exception e) { e.printStackTrace(); }
        }).start();
        Intent dismissIntent = new Intent("com.growthpad.app.DISMISS_ALARM");
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

    // 화면 해제 시 자동 실행 서비스 — 사용자가 설정에서 끈 경우(auto_launch_enabled=false)는
    // 시작하지 않는다(설정 존중). 기본값은 켜짐(core UX).
    try {
      val prefs = getSharedPreferences("iwmemo_storage", android.content.Context.MODE_PRIVATE)
      if (prefs.getString("auto_launch_enabled", "true") != "false") {
        val serviceIntent = android.content.Intent(this, ScreenUnlockService::class.java)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
          startForegroundService(serviceIntent)
        } else {
          startService(serviceIntent)
        }
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }`
            );
            fs.writeFileSync(ktFile, content);
          }
        }
        // 터치 먹통 진단·복구용 window focus 추적 — resumed인데 focus가 없는 상태가 지속되면
        // ScreenUnlockService가 표적 복구 relaunch를 결정한다. onCreate 패치와 별도 키로 삽입.
        if (!content.includes('onWindowFocusChanged')) {
          content = content.replace(
            'override fun getMainComponentName(): String = "main"',
            `// 터치 먹통 진단·복구의 핵심 신호: resumed인데 window focus가 없는 상태가 지속되면
  // 잠금화면 위 표시가 입력을 못 받는 먹통 — ScreenUnlockService가 이 값을 보고
  // 표적 복구 relaunch를 결정한다. lifecycle(resumed/paused)과 focus는 별개 신호.
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    ScreenUnlockService.mainActivityHasFocus = hasFocus
    android.util.Log.d("ScreenUnlockSvc", "MainActivity windowFocus=" + hasFocus)
  }

  override fun getMainComponentName(): String = "main"`
          );
          fs.writeFileSync(ktFile, content);
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
          // focus 유예(FOCUS_SETTLE_MS) 기준점 — resume 후 focus가 계속 없으면 먹통 판정.
          ScreenUnlockService.mainActivityResumedAt = android.os.SystemClock.elapsedRealtime()
          // 첫 resume = JS 번들 cold init 완료 → cold-init 가드 무효화(정상 자동표시 회복).
          ScreenUnlockService.mainActivityCreatedAt = 0
        }
      }
      override fun onActivityPaused(activity: android.app.Activity) {
        if (activity is MainActivity) {
          ScreenUnlockService.mainActivityResumed = false
        }
      }
      override fun onActivityStarted(activity: android.app.Activity) {
        if (activity is MainActivity) {
          // onStart~onStop = 화면에 보이거나 전환 중. 이 동안의 재launch는 focus를 흔든다.
          ScreenUnlockService.mainActivityStarted = true
        }
        if (activity is AlarmActivity) {
          // 알람이 떠 있는 동안 자동표시 launch 금지(알람 파괴/z-order 경합 방지).
          ScreenUnlockService.alarmActivityVisible = true
        }
      }
      override fun onActivityStopped(activity: android.app.Activity) {
        if (activity is MainActivity) {
          ScreenUnlockService.mainActivityStarted = false
        }
        if (activity is AlarmActivity) {
          ScreenUnlockService.alarmActivityVisible = false
        }
      }
      override fun onActivitySaveInstanceState(activity: android.app.Activity, outState: android.os.Bundle) {}
      override fun onActivityDestroyed(activity: android.app.Activity) {
        // 안전망: 비정상 종료 경로에서도 상태가 고착되지 않게 리셋.
        if (activity is MainActivity) {
          ScreenUnlockService.mainActivityStarted = false
          ScreenUnlockService.mainActivityResumed = false
        }
        if (activity is AlarmActivity) {
          ScreenUnlockService.alarmActivityVisible = false
        }
      }
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
