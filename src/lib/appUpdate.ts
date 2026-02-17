import { Alert, Linking, Platform } from 'react-native';
import { APP_VERSION } from './config';

const GITHUB_OWNER = 'insushim';
const GITHUB_REPO = 'iswmemo';
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;

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

export async function checkForUpdate(): Promise<void> {
  if (Platform.OS !== 'android') return;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(GITHUB_API_URL, {
      headers: { 'Accept': 'application/vnd.github.v3+json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) return;

    const release = await response.json();
    const latestVersion = (release.tag_name || '').replace(/^v/, '');

    if (!latestVersion || compareVersions(APP_VERSION, latestVersion) <= 0) return;

    // APK 에셋 찾기
    const apkAsset = release.assets?.find(
      (a: any) => a.name?.endsWith('.apk') && a.browser_download_url
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
            Linking.openURL(apkAsset.browser_download_url);
          },
        },
      ],
    );
  } catch {
    // 업데이트 체크 실패는 조용히 무시
  }
}
