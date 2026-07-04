package com.growthpad.app

import android.app.Application
import android.content.res.Configuration

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              add(AutoLaunchPackage())
              add(AlarmPackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"

          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)

    // 잠금화면 자동표시 서비스(ScreenUnlockService)가 참조할 MainActivity lifecycle을
    // 프로세스 시작 시점부터 추적한다. Application.onCreate는 어떤 Activity/Service보다 먼저
    // 실행되므로, 서비스 생성 지연으로 최초 MainActivity의 created/resumed 이벤트를 놓치는
    // race를 구조적으로 제거한다(서비스 onCreate에서 등록하면 그 race가 남음).
    registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
      override fun onActivityCreated(activity: android.app.Activity, savedInstanceState: android.os.Bundle?) {
        if (activity is MainActivity) {
          ScreenUnlockService.mainActivityCreatedAt = android.os.SystemClock.elapsedRealtime()
        }
      }
      override fun onActivityResumed(activity: android.app.Activity) {
        if (activity is MainActivity) {
          ScreenUnlockService.mainActivityResumed = true
          // 첫 resume = JS 번들 cold init 완료 → cold-init 가드 무효화(정상 자동표시 회복).
          ScreenUnlockService.mainActivityCreatedAt = 0
        }
      }
      override fun onActivityPaused(activity: android.app.Activity) {
        if (activity is MainActivity) {
          ScreenUnlockService.mainActivityResumed = false
        }
      }
      override fun onActivityStarted(activity: android.app.Activity) {}
      override fun onActivityStopped(activity: android.app.Activity) {}
      override fun onActivitySaveInstanceState(activity: android.app.Activity, outState: android.os.Bundle) {}
      override fun onActivityDestroyed(activity: android.app.Activity) {}
    })
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
