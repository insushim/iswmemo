// 3단계 fallback 저장소:
// 1. Android SharedPreferences (AlarmModule native) — 가장 신뢰성 높음
// 2. SecureStore (expo-secure-store) — 일부 기기에서 cold start 시 null 반환 버그 우회
// 3. 파일 (expo-file-system/legacy) — 최후 fallback
//
// 쓰기: 모든 레이어에 동시 저장 (실패해도 다른 레이어에 저장되면 OK)
// 읽기: SharedPreferences → SecureStore → 파일 순서로 시도. 먼저 찾은 값 사용.
//       다른 레이어에도 값 복구 (self-heal)
// 삭제: 모든 레이어에서 삭제
//
// JWT 토큰, 고정 목표 등 민감한 데이터용.
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
import { NativeModules, Platform } from "react-native";

const { AlarmModule } = NativeModules;

const BASE_DIR = (FileSystem.documentDirectory || "") + "persist/";
let dirReady = false;

async function ensureDir(): Promise<boolean> {
  if (dirReady) return true;
  try {
    const info = await FileSystem.getInfoAsync(BASE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(BASE_DIR, { intermediates: true });
    }
    dirReady = true;
    return true;
  } catch {
    return false;
  }
}

function pathFor(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return BASE_DIR + safe + ".txt";
}

function hasPrefs(): boolean {
  return (
    Platform.OS === "android" &&
    !!AlarmModule &&
    typeof AlarmModule.savePref === "function"
  );
}

async function prefsSet(key: string, value: string): Promise<void> {
  if (!hasPrefs()) throw new Error("prefs unavailable");
  await AlarmModule.savePref(key, value);
}

async function prefsGet(key: string): Promise<string | null> {
  if (!hasPrefs()) return null;
  try {
    const v = await AlarmModule.getPref(key);
    return v || null;
  } catch {
    return null;
  }
}

async function prefsDelete(key: string): Promise<void> {
  if (!hasPrefs()) return;
  try {
    await AlarmModule.deletePref(key);
  } catch {}
}

export async function persistentSet(key: string, value: string): Promise<void> {
  const errors: unknown[] = [];
  // 1. SharedPreferences
  try {
    await prefsSet(key, value);
  } catch (e) {
    errors.push(e);
  }
  // 2. SecureStore
  try {
    await SecureStore.setItemAsync(key, value);
  } catch (e) {
    errors.push(e);
  }
  // 3. 파일
  try {
    const ok = await ensureDir();
    if (ok) {
      await FileSystem.writeAsStringAsync(pathFor(key), value);
    } else {
      errors.push(new Error("persist dir unavailable"));
    }
  } catch (e) {
    errors.push(e);
  }
  // 전부 실패한 경우에만 throw
  if (errors.length >= 3) {
    throw errors[0];
  }
}

export async function persistentGet(key: string): Promise<string | null> {
  // 1. SharedPreferences — 가장 신뢰성 높음
  try {
    const v = await prefsGet(key);
    if (v) {
      // 다른 레이어에 복구
      SecureStore.setItemAsync(key, v).catch(() => {});
      return v;
    }
  } catch {}

  // 2. SecureStore
  try {
    const v = await SecureStore.getItemAsync(key);
    if (v) {
      // SharedPreferences에 복구
      prefsSet(key, v).catch(() => {});
      return v;
    }
  } catch {}

  // 3. 파일
  try {
    const path = pathFor(key);
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(path);
      if (content) {
        // 다른 레이어에 복구
        prefsSet(key, content).catch(() => {});
        SecureStore.setItemAsync(key, content).catch(() => {});
        return content;
      }
    }
  } catch {}

  return null;
}

export async function persistentDelete(key: string): Promise<void> {
  try {
    await prefsDelete(key);
  } catch {}
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {}
  try {
    await FileSystem.deleteAsync(pathFor(key), { idempotent: true });
  } catch {}
}
