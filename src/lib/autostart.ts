import { Alert, Linking, Platform } from 'react-native';
import * as Device from 'expo-device';
import { persistentGet, persistentSet } from './storage';

const AUTOSTART_KEY = 'autostart_prompted_v1';

export async function promptAutoStart() {
  if (Platform.OS !== 'android') return;

  // SecureStore 직접 사용 시 일부 기기의 cold-start null 반환 버그로 플래그가 유실돼
  // 매 실행/업데이트마다 안내가 반복됐다 → SharedPreferences 우선 3중 저장소로 전환.
  const prompted = await persistentGet(AUTOSTART_KEY);
  if (prompted) return;

  const brand = (Device.brand || '').toLowerCase();

  let message = '화면을 켤 때마다 또박또박이 자동으로 실행되려면 자동 시작 권한을 허용해주세요.';

  if (brand.includes('samsung')) {
    message += '\n\n설정 > 배터리 > 백그라운드 사용 제한에서 또박또박을 허용해주세요.';
  } else if (brand.includes('xiaomi') || brand.includes('redmi') || brand.includes('poco')) {
    message += '\n\n설정 > 앱 > 앱 관리 > 또박또박 > 자동 시작을 허용해주세요.';
  } else if (brand.includes('huawei') || brand.includes('honor')) {
    message += '\n\n설정 > 배터리 > 앱 시작 관리에서 또박또박을 수동 관리로 변경해주세요.';
  } else if (brand.includes('oppo') || brand.includes('realme')) {
    message += '\n\n설정 > 앱 관리 > 자동 시작에서 또박또박을 허용해주세요.';
  } else {
    message += '\n\n설정 > 앱 > 또박또박에서 자동 시작 또는 백그라운드 실행을 허용해주세요.';
  }

  Alert.alert(
    '자동 실행 권한 필요',
    message,
    [
      { text: '나중에', style: 'cancel' },
      { text: '설정으로 이동', onPress: () => Linking.openSettings() },
    ]
  );

  await persistentSet(AUTOSTART_KEY, 'true');
}
