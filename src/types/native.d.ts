import { NativeModule } from 'react-native';

declare module 'react-native' {
  interface NativeModulesStatic {
    LockScreenModule: {
      startService(title: string, content: string): Promise<boolean>;
      stopService(): Promise<boolean>;
      updateNotification(title: string, content: string): Promise<boolean>;
      isServiceRunning(): Promise<boolean>;
    };
  }
}
