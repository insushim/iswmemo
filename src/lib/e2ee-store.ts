/**
 * E2EE 키 관리(앱) — passphrase 로 도출한 AES-256 키를 expo-secure-store(OS 키체인)에 보관.
 * SchoolDesk·웹과 동일 스펙으로 도출되므로, 같은 이메일·암호를 넣으면 같은 키가 나온다.
 */
import * as SecureStore from 'expo-secure-store'
import { deriveKey } from './e2ee'

const KEY_STORE = 'e2ee_key_b64'

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

/** 동기 캐시 조회(이미 로드된 경우만). 미로드면 null — 호출 전 ensureE2EEKey 권장. */
export function getE2EEKeySync(): Uint8Array | null {
  return _cached
}

export async function setE2EEPassphrase(passphrase: string, email: string): Promise<void> {
  const key = deriveKey(passphrase, email)
  await SecureStore.setItemAsync(KEY_STORE, bytesToBase64(key))
  _cached = key
  _resolved = true
}

export async function hasE2EEKey(): Promise<boolean> {
  return (await getE2EEKey()) !== null
}

export async function clearE2EEKey(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_STORE)
  _cached = null
  _resolved = true
}
