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
    private android.os.PowerManager.WakeLock screenWakeLock;

    // ACQUIRE_CAUSES_WAKEUP 웨이크락으로 꺼진 화면을 강제로 켠다(알람 앱 표준).
    // 60초 타임아웃 = 알람 자동 종료 시간과 동일, 누수 방지.
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
        // 잠금화면 위 표시 + 화면 켜기. setShowWhenLocked/turnScreenOn(API27+)만으로는
        // AlarmManager 백그라운드 실행 시 삼성/Android16에서 화면이 안 켜지는 경우가 있어
        // (실측 Galaxy S25U, Android16: 액티비티는 떠도 화면이 꺼진 채라 사용자가 수동으로
        // 켜야 보임), 윈도우 플래그 + ACQUIRE_CAUSES_WAKEUP 웨이크락을 함께 건다.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        // ⚠️ FLAG_DISMISS_KEYGUARD / requestDismissKeyguard 는 넣지 않는다 — 넣으면 보안
        // 잠금(PIN/패턴/지문) 화면이 먼저 떠서 풀어야 알람이 보인다(사용자 불편 실측).
        // setShowWhenLocked 만으로 잠금 위에 알람을 띄우면 잠금 해제 없이 확인/완료 버튼을
        // 누를 수 있다.
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        acquireWakeScreen();

        // Android 15(API 35)+에서 edge-to-edge가 강제되며(targetSdk 36은 opt-out 불가)
        // 레거시 @android:Theme.NoTitleBar.Fullscreen 이 무력화된다. 그 결과 시스템 바가
        // 콘텐츠 위에 겹쳐 "회색 띠"가 생긴다. 알람은 본질적으로 몰입형 전체화면이 맞으므로
        // 시스템 바를 숨기고(인셋 0), 혹시 바가 잠깐 보여도 잘리지 않도록 아래 setContentView
        // 뒤 인셋 패딩 폴백을 건다.
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
        titleView.setText("\u23F0 " + title);
        titleView.setTextSize(24);
        titleView.setTextColor(0xFFFFFFFF);
        titleView.setGravity(Gravity.CENTER);
        layout.addView(titleView);

        // ⚠️ 플레인 View는 wrap_content여도 measure 시 getDefaultSize()로 가용 공간을
        // 전부 채운다(AT_MOST/EXACTLY → specSize 반환). 명시적 높이를 주지 않으면 이
        // spacer가 화면 전체를 먹어 제목이 위로 붙고 뒤의 버튼이 화면 밖으로 밀린다.
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
        // 인셋 패딩 폴백: 시스템 바 숨김이 무시되는 기기/상황에서도 콘텐츠(제목·버튼)가
        // 상단바/하단 제스처바 뒤로 잘리지 않게 한다. 기존 48px 패딩 위에 인셋만큼 더한다.
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
