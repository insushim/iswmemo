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
      scheduleAlarm(taskId: string, title: string, timestamp: number): void;
      cancelAlarm(taskId: string): void;
      dismissAlarm(): void;
    };
    AutoLaunchModule: {
      checkOverlayPermission(): Promise<boolean>;
      requestOverlayPermission(): void;
      checkFullScreenIntentPermission(): Promise<boolean>;
      requestFullScreenIntentPermission(): void;
      startService(): void;
      stopService(): void;
      openBatteryOptimization(): void;
    };
  }
}
