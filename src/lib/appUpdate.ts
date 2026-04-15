import { Alert, Linking, Platform, NativeModules } from 'react-native';
import { APP_VERSION } from './config';

const { AlarmModule } = NativeModules;

const GITHUB_OWNER = 'insushim';
const GITHUB_REPO = 'iswmemo';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

// 이중 다운로드 방지: 업데이트 플로우가 진행 중이면 추가 탭 무시
let updateInProgress = false;

function compareVersions(current: string, latest: string): number {
  const c = current.replace(/^v/, '').split('.').map(Number);
  const l = latest.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const cv = c[i] || 0;
    const lv = l[i] || 0;
    if (lv > cv) return 1;
    if (lv < cv) return -1;
  }
  return 0;
}

async function startUpdate(apkUrl: string): Promise<void> {
  if (updateInProgress) return;
  updateInProgress = true;
  try {
    // 네이티브 다운로드 + 설치 (중복 브라우저 다운로드 방지 + 자동 인스톨러 열림)
    if (AlarmModule?.downloadAndInstallApk) {
      Alert.alert(
        '다운로드 중',
        '업데이트 파일을 받는 중입니다. 완료되면 설치 화면이 자동으로 열립니다.',
      );
      try {
        await AlarmModule.downloadAndInstallApk(apkUrl);
        return;
      } catch (e) {
        // 네이티브 실패 시 브라우저 fallback
        if (__DEV__) console.error('Native APK install failed:', e);
      }
    }
    // Fallback: 구 방식 (브라우저 열기)
    await Linking.openURL(apkUrl);
  } finally {
    // 잠깐 지연 후 플래그 해제 (동일 알림 내 연타 방지)
    setTimeout(() => {
      updateInProgress = false;
    }, 5000);
  }
}

export async function checkForUpdate(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(GITHUB_API_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return;

    const release = await response.json();
    const latestVersion = (release.tag_name || '').replace(/^v/, '');

    if (!latestVersion || compareVersions(APP_VERSION, latestVersion) <= 0) return;

    const apkAsset = release.assets?.find(
      (a: any) => a.name?.endsWith('.apk') && a.browser_download_url,
    );
    if (!apkAsset) return;

    Alert.alert(
      '업데이트 알림',
      `새 버전 v${latestVersion}이 있습니다.\n(현재: v${APP_VERSION})\n\n${release.name || ''}`,
      [
        { text: '나중에', style: 'cancel' },
        {
          text: '업데이트',
          onPress: () => {
            startUpdate(apkAsset.browser_download_url);
          },
        },
      ],
    );
  } catch {
    // 업데이트 체크 실패는 조용히 무시
  }
}
