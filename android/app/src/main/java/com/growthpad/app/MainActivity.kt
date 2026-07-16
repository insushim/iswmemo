package com.growthpad.app
import expo.modules.splashscreen.SplashScreenManager

import android.os.Build
import android.os.Bundle

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    // This is required for expo-splash-screen.
    // setTheme(R.style.AppTheme);
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)

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
    // ScreenUnlockService가 보내는 intent에도 NO_ANIMATION 플래그가 있지만
    // cold start(프로세스 없는 상태) 경로에서도 일관되게 적용
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
    }
  }

  // 터치 먹통 진단·복구의 핵심 신호: resumed인데 window focus가 없는 상태가 지속되면
  // 잠금화면 위 표시가 입력을 못 받는 먹통 — ScreenUnlockService가 이 값을 보고
  // 표적 복구 relaunch를 결정한다. lifecycle(resumed/paused)과 focus는 별개 신호.
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    ScreenUnlockService.mainActivityHasFocus = hasFocus
    android.util.Log.d("ScreenUnlockSvc", "MainActivity windowFocus=" + hasFocus)
  }

  // 잠금화면(우리 앱)이 떠 있는 동안 전화가 오면 우리 창이 전화 화면을 덮어 못 받는 문제 방지.
  // 통화가 감지되면 우리 task를 뒤로 물려(moveTaskToBack) 전화 UI(셀룰러/카톡·SNS VoIP)가 보이게 한다.
  // 판정은 AudioManager mode(권한 불필요): RINGTONE(수신 벨)·IN_CALL(셀룰러)·IN_COMMUNICATION(VoIP).
  // 우리 창이 앞에 있을 때만(onResume~onPause) 짧게 폴링하므로 배터리 영향은 무시할 수준.
  private var callAudioManager: android.media.AudioManager? = null
  private val callHandler = android.os.Handler(android.os.Looper.getMainLooper())
  private val callWatch = object : Runnable {
    override fun run() {
      val mode = callAudioManager?.mode
      if (mode == android.media.AudioManager.MODE_RINGTONE ||
          mode == android.media.AudioManager.MODE_IN_CALL ||
          mode == android.media.AudioManager.MODE_IN_COMMUNICATION) {
        try { moveTaskToBack(true) } catch (e: Exception) {}
        return
      }
      callHandler.postDelayed(this, 700)
    }
  }

  override fun onResume() {
    super.onResume()
    try {
      callAudioManager = getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
      callHandler.removeCallbacks(callWatch)
      callHandler.post(callWatch) // 즉시 1회 + 반복(이미 벨이 울리는 중이면 바로 물러난다)
    } catch (e: Exception) {}
  }

  override fun onPause() {
    super.onPause()
    callHandler.removeCallbacks(callWatch)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
