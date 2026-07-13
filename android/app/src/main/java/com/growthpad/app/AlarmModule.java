package com.growthpad.app;

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
