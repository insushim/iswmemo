// SecureStore가 Android 일부 기기/ROM에서 cold start 시 null을 반환하는 문제가 있어,
// 앱 내부 저장소(expo-file-system)에 이중 저장한다.
// - 쓰기: SecureStore + 파일 동시 (둘 중 하나라도 성공하면 OK)
// - 읽기: SecureStore 우선, 없거나 실패 시 파일, 파일에 있으면 SecureStore에도 복구
// - 삭제: 둘 다 삭제
// JWT 토큰 등 민감한 값을 위한 용도. 파일은 앱 전용 internal 저장소라 다른 앱에서 접근 불가.
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system";

const FILE_DIR = (FileSystem.documentDirectory || "") + "persist/";

async function ensureDir() {
  try {
    const info = await FileSystem.getInfoAsync(FILE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(FILE_DIR, { intermediates: true });
    }
  } catch {}
}

function fileFor(key: string) {
  // 키에 슬래시/스페이스 방지
  const safe = key.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return FILE_DIR + safe + ".txt";
}

export async function persistentSet(key: string, value: string): Promise<void> {
  let secureStoreError: unknown = null;
  let fileError: unknown = null;
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (e) {
    secureStoreError = e;
  }
  try {
    await ensureDir();
    await FileSystem.writeAsStringAsync(fileFor(key), value);
  } catch (e) {
    fileError = e;
  }
  if (secureStoreError && fileError) {
    throw secureStoreError;
  }
}

export async function persistentGet(key: string): Promise<string | null> {
  // 1. SecureStore 시도
  let fromSecure: string | null = null;
  try {
    fromSecure = await SecureStore.getItemAsync(key);
    if (fromSecure) return fromSecure;
  } catch {}

  // 2. 파일 시도
  try {
    const path = fileFor(key);
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      const fromFile = await FileSystem.readAsStringAsync(path);
      if (fromFile) {
        // SecureStore에 복구 (실패해도 무시)
        SecureStore.setItemAsync(key, fromFile).catch(() => {});
        return fromFile;
      }
    }
  } catch {}

  return null;
}

export async function persistentDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {}
  try {
    await FileSystem.deleteAsync(fileFor(key), { idempotent: true });
  } catch {}
}
