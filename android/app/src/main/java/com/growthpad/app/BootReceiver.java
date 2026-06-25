package com.growthpad.app;

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
