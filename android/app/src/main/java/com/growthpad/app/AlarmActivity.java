package com.growthpad.app;

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
        titleView.setText("\u23F0 " + title);
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
                new Thread(() -> deleteTaskSync(fTaskId, fType)).start();
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
        handler.removeCallbacksAndMessages(null);
        if (dismissReceiver != null) { try { unregisterReceiver(dismissReceiver); } catch (Exception e) {} }
        super.onDestroy();
    }
}
