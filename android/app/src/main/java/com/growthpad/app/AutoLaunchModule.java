package com.growthpad.app;

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
