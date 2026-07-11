package com.growthpad.app;

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
                if (lastUpdate > 0 && System.currentTimeMillis() - lastUpdate < 10 * 60_000L) {
                    prefs.edit().remove("last_update_at").apply(); // 1회성 마커 소거
                    Intent launch = new Intent(context, MainActivity.class);
                    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(launch);
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
}
