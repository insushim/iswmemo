package com.growthpad.app;

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
            Intent intent = new Intent("com.growthpad.app.DISMISS_ALARM");
            context.sendBroadcast(intent);
        } catch (Exception e) { e.printStackTrace(); }
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

                // Redirect 따라가며 다운로드
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

                // FileSystemFileProvider (expo-file-system 제공)를 통해 content:// URI 생성
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
