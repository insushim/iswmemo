import { NativeModule } from 'react-native';

declare module 'react-native' {
  interface NativeModulesStatic {
    LockScreenModule: {
      startService(title: string, content: string): Promise<boolean>;
      stopService(): Promise<boolean>;
      updateNotification(title: string, content: string): Promise<boolean>;
      isServiceRunning(): Promise<boolean>;
    };
    AlarmModule: {
      // native scheduleAlarm은 (taskId,title,triggerTimeMs,Promise) 시그니처라 Promise를 반환한다.
      // type 인자는 현재 native에서 사용하지 않으나 호출부 호환을 위해 optional로 둔다.
      scheduleAlarm(taskId: string, title: string, timestamp: number, type?: string): Promise<boolean>;
      cancelAlarm(taskId: string): Promise<boolean>;
      dismissAlarm(): void;
      saveAuthToken(token: string): Promise<boolean>;
      savePref(key: string, value: string): Promise<boolean>;
      getPref(key: string): Promise<string | null>;
      deletePref(key: string): Promise<boolean>;
      downloadAndInstallApk(url: string): Promise<boolean>;
      getPendingDelete(): Promise<{id: string; type: string} | null>;
      clearPendingDelete(): Promise<boolean>;
    };
    AutoLaunchModule: {
      checkOverlayPermission(): Promise<boolean>;
      requestOverlayPermission(): void;
      checkExactAlarmPermission(): Promise<boolean>;
      requestExactAlarmPermission(): void;
      checkFullScreenIntentPermission(): Promise<boolean>;
      requestFullScreenIntentPermission(): void;
      startService(): void;
      stopService(): void;
      openBatteryOptimization(): void;
    };
  }
}
