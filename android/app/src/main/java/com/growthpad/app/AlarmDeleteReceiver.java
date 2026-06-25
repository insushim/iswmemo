package com.growthpad.app;

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
