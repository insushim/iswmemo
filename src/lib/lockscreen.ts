import { NativeModules, Platform, PermissionsAndroid } from 'react-native';

const { LockScreenModule } = NativeModules;

export interface LockScreenAPI {
  startService: (title: string, content: string) => Promise<boolean>;
  stopService: () => Promise<boolean>;
  updateNotification: (title: string, content: string) => Promise<boolean>;
  isServiceRunning: () => Promise<boolean>;
}

async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;

  try {
    if (Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
        {
          title: '알림 권한 필요',
          message: '잠금화면에 할 일을 표시하려면 알림 권한이 필요합니다.',
          buttonNeutral: '나중에',
          buttonNegative: '취소',
          buttonPositive: '확인',
        }
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  } catch (err) {
    console.error('알림 권한 요청 실패:', err);
    return false;
  }
}

export const lockScreenService: LockScreenAPI = {
  async startService(title: string, content: string): Promise<boolean> {
    if (Platform.OS !== 'android' || !LockScreenModule) {
      return false;
    }

    const hasPermission = await requestNotificationPermission();
    if (!hasPermission) {
      console.warn('알림 권한이 거부되었습니다');
      return false;
    }

    try {
      return await LockScreenModule.startService(title, content);
    } catch (error) {
      console.error('잠금화면 서비스 시작 실패:', error);
      return false;
    }
  },

  async stopService(): Promise<boolean> {
    if (Platform.OS !== 'android' || !LockScreenModule) {
      return false;
    }

    try {
      return await LockScreenModule.stopService();
    } catch (error) {
      console.error('잠금화면 서비스 중지 실패:', error);
      return false;
    }
  },

  async updateNotification(title: string, content: string): Promise<boolean> {
    if (Platform.OS !== 'android' || !LockScreenModule) {
      return false;
    }

    try {
      return await LockScreenModule.updateNotification(title, content);
    } catch (error) {
      console.error('알림 업데이트 실패:', error);
      return false;
    }
  },

  async isServiceRunning(): Promise<boolean> {
    if (Platform.OS !== 'android' || !LockScreenModule) {
      return false;
    }

    try {
      return await LockScreenModule.isServiceRunning();
    } catch (error) {
      console.error('서비스 상태 확인 실패:', error);
      return false;
    }
  },
};

export function formatTasksForNotification(tasks: Array<{ title: string; isCompleted?: boolean }>): string {
  const incompleteTasks = tasks.filter(t => !t.isCompleted);

  if (incompleteTasks.length === 0) {
    return '모든 할 일을 완료했어요! 🎉';
  }

  const displayTasks = incompleteTasks.slice(0, 3);
  const remaining = incompleteTasks.length - displayTasks.length;

  let content = displayTasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n');

  if (remaining > 0) {
    content += `\n외 ${remaining}개...`;
  }

  return content;
}
