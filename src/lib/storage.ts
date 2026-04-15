// SecureStore가 일부 Android 기기/ROM에서 cold start 시 null을 반환하는 이슈를 우회.
// expo-file-system v19 (class-based API)을 이용해 앱 내부 저장소 파일에 이중 저장.
// - 쓰기: SecureStore + 파일 동시 (둘 중 하나라도 성공)
// - 읽기: SecureStore 우선, 없으면 파일, 파일에 있으면 SecureStore에도 복구
// - 삭제: 둘 다 삭제
// JWT 토큰 등 민감한 값을 위한 용도. 파일은 앱 전용 internal 저장소라 다른 앱 접근 불가.
import * as SecureStore from "expo-secure-store";
import { File, Directory, Paths } from "expo-file-system";

let persistDir: Directory | null = null;

function getDir(): Directory | null {
  if (persistDir) return persistDir;
  try {
    const dir = new Directory(Paths.document, "persist");
    if (!dir.exists) {
      dir.create({ intermediates: true, idempotent: true });
    }
    persistDir = dir;
    return dir;
  } catch {
    return null;
  }
}

function fileFor(key: string): File | null {
  const dir = getDir();
  if (!dir) return null;
  const safe = key.replace(/[^a-zA-Z0-9_.-]/g, "_");
  try {
    return new File(dir, `${safe}.txt`);
  } catch {
    return null;
  }
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
    const f = fileFor(key);
    if (f) {
      if (!f.exists) {
        f.create({ intermediates: true, overwrite: true });
      }
      f.write(value);
    } else {
      fileError = new Error("file ref unavailable");
    }
  } catch (e) {
    fileError = e;
  }
  if (secureStoreError && fileError) {
    throw secureStoreError;
  }
}

export async function persistentGet(key: string): Promise<string | null> {
  // 1. SecureStore
  try {
    const v = await SecureStore.getItemAsync(key);
    if (v) return v;
  } catch {}

  // 2. File
  try {
    const f = fileFor(key);
    if (f && f.exists) {
      const content = await f.text();
      if (content) {
        // SecureStore 복구 시도 (실패해도 무시)
        SecureStore.setItemAsync(key, content).catch(() => {});
        return content;
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
    const f = fileFor(key);
    if (f && f.exists) {
      f.delete();
    }
  } catch {}
}
