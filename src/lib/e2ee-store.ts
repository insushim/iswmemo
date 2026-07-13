/**
 * E2EE 키 관리(앱) — passphrase 로 도출한 AES-256 키를 expo-secure-store(OS 키체인)에 보관.
 * SchoolDesk·웹과 동일 스펙으로 도출되므로, 같은 이메일·암호를 넣으면 같은 키가 나온다.
 */
import * as SecureStore from 'expo-secure-store'
import { deriveKeyAsync } from './e2ee'

const KEY_STORE = 'e2ee_key_b64'
// 예전 암호로 만든 키들(복호화 전용). 암호를 바꾸면 옛 키로 암호화된 메모는 새 키로는
// 영영 못 연다 → 옛 키를 보관해 두고 복호화 때 함께 시도한다(암호화는 항상 현재 키로만).
const KEYRING_STORE = 'e2ee_keyring_b64'

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += B64[b0 >> 2] + B64[((b0 & 3) << 4) | (b1 >> 4)]
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += i + 2 < bytes.length ? B64[b2 & 63] : '='
  }
  return out
}
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let p = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n0 = B64.indexOf(clean[i])
    const n1 = B64.indexOf(clean[i + 1])
    const n2 = clean[i + 2] ? B64.indexOf(clean[i + 2]) : -1
    const n3 = clean[i + 3] ? B64.indexOf(clean[i + 3]) : -1
    out[p++] = (n0 << 2) | (n1 >> 4)
    if (n2 >= 0) out[p++] = ((n1 & 15) << 4) | (n2 >> 2)
    if (n3 >= 0) out[p++] = ((n2 & 3) << 6) | n3
  }
  return out.subarray(0, p)
}

let _cached: Uint8Array | null = null
let _resolved = false
let _legacy: Uint8Array[] | null = null

/** 현재 E2EE 키(없으면 null = 평문 모드). */
export async function getE2EEKey(): Promise<Uint8Array | null> {
  if (_cached) return _cached
  if (_resolved) return null
  const b64 = await SecureStore.getItemAsync(KEY_STORE)
  _resolved = true
  if (!b64) return null
  try {
    _cached = base64ToBytes(b64)
  } catch {
    return null
  }
  return _cached
}

/** 예전 암호 키들(복호화 시도용). */
async function getLegacyKeys(): Promise<Uint8Array[]> {
  if (_legacy) return _legacy
  const raw = await SecureStore.getItemAsync(KEYRING_STORE)
  _legacy = (raw ? raw.split(',') : [])
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => {
      try {
        return base64ToBytes(b)
      } catch {
        return null
      }
    })
    .filter((k): k is Uint8Array => k !== null)
  return _legacy
}

/**
 * 복호화에 시도할 키 전부(현재 키 우선 → 예전 키들).
 * 암호를 바꾼 뒤에도 옛 암호로 암호화된 항목이 그대로 열린다(사용자가 아무것도 안 해도 됨).
 */
export async function getE2EEKeysForDecrypt(): Promise<Uint8Array[]> {
  const cur = await getE2EEKey()
  const legacy = await getLegacyKeys()
  return cur ? [cur, ...legacy] : legacy
}

/** 동기 캐시 조회(이미 로드된 경우만). 미로드면 null — 호출 전 ensureE2EEKey 권장. */
export function getE2EEKeySync(): Uint8Array | null {
  return _cached
}

export async function setE2EEPassphrase(passphrase: string, email: string): Promise<void> {
  // 네이티브 백그라운드 스레드에서 도출(~1초). 과거 동기 deriveKey 는 JS 스레드를 수 분간
  // 통째로 막아 앱이 먹통/강제종료됐다(사용자 실측 2026-07-13).
  const key = await deriveKeyAsync(passphrase, email)
  const nextB64 = bytesToBase64(key)

  // 기존 키가 다른 값이면 키링에 보관 — 옛 암호로 암호화된 항목을 계속 열 수 있게.
  const prevB64 = await SecureStore.getItemAsync(KEY_STORE)
  if (prevB64 && prevB64 !== nextB64) {
    const raw = (await SecureStore.getItemAsync(KEYRING_STORE)) || ''
    const ring = raw.split(',').map((x) => x.trim()).filter(Boolean)
    if (!ring.includes(prevB64)) ring.push(prevB64)
    // 너무 길어지지 않게 최근 5개까지만 보관
    await SecureStore.setItemAsync(KEYRING_STORE, ring.slice(-5).join(','))
    _legacy = null // 다음 조회 때 다시 읽음
  }

  await SecureStore.setItemAsync(KEY_STORE, nextB64)
  _cached = key
  _resolved = true
}

/**
 * 읽기 전용으로 "예전/다른 암호"를 키링에 추가한다(현재 암호는 그대로).
 * 안 열리는 메모가 남았을 때, 그걸 암호화한 암호를 넣으면 그때부터 그냥 보인다.
 * 반환값: 추가 후 그 키로 실제로 열 수 있는지는 호출부(verify)가 판정한다.
 */
export async function addLegacyPassphrase(passphrase: string, email: string): Promise<void> {
  const key = await deriveKeyAsync(passphrase, email)
  const b64 = bytesToBase64(key)
  const cur = await SecureStore.getItemAsync(KEY_STORE)
  if (cur === b64) return // 현재 키와 같음 — 추가할 것 없음
  const raw = (await SecureStore.getItemAsync(KEYRING_STORE)) || ''
  const ring = raw.split(',').map((x) => x.trim()).filter(Boolean)
  if (!ring.includes(b64)) ring.push(b64)
  await SecureStore.setItemAsync(KEYRING_STORE, ring.slice(-5).join(','))
  _legacy = null
}

export async function hasE2EEKey(): Promise<boolean> {
  return (await getE2EEKey()) !== null
}

export async function clearE2EEKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_STORE)
  await SecureStore.deleteItemAsync(KEYRING_STORE)
  _cached = null
  _legacy = null
  _resolved = true
}
