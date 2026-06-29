/**
 * E2EE(종단간 암호화) 코어 — 순수 JS(@noble) 구현.
 *
 * SchoolDesk(데스크톱, node:crypto) / 또박또박 웹(WebCrypto 또는 @noble)과 **바이트 호환**된다.
 * Hermes에는 crypto.subtle 이 없어 WebCrypto 대신 @noble 을 쓴다(헤드리스 인터롭 실증 완료).
 *
 * ⚠️ 아래 스펙을 한 글자도 바꾸지 말 것 — 어긋나면 다른 플랫폼이 복호화 실패한다.
 *   - 키 도출: PBKDF2-SHA256, iterations=600000, keylen=32B
 *   - salt: SHA-256( trim·NFC 아님! email.toLowerCase().NFC + "\x00E2EE_SALT_V1" )
 *   - passphrase: trim().normalize('NFC') 후 PBKDF2 입력
 *   - 대칭암호: AES-256-GCM, iv=12B(랜덤), tag=16B(ct 뒤에 붙음)
 *   - 출력: "e2ee:v1:" + base64( iv ∥ ciphertext ∥ tag )
 */
import { pbkdf2 } from '@noble/hashes/pbkdf2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { gcm } from '@noble/ciphers/aes.js'
import * as ExpoCrypto from 'expo-crypto'

export const E2EE_PREFIX = 'e2ee:v1:'
const PBKDF2_ITERATIONS = 600_000
const KEY_LEN = 32
const IV_LEN = 12
const TAG_LEN = 16
const SALT_SUFFIX = '\x00E2EE_SALT_V1'

const te = new TextEncoder()
const td = new TextDecoder()

// Hermes 안전 NFC(미지원 환경 대비). ASCII passphrase 면 결과 동일.
function nfc(s: string): string {
  try {
    return s.normalize('NFC')
  } catch {
    return s
  }
}

// ── base64 (Uint8Array ↔ string) — 의존성 없이 결정론적 ──────────────
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | (b1 >> 4)]
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '='
    out += i + 2 < bytes.length ? B64[b2 & 63] : '='
  }
  return out
}
function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '')
  const len = Math.floor((clean.length * 3) / 4)
  const out = new Uint8Array(len)
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

function deriveSalt(email: string): Uint8Array {
  return sha256(te.encode(email.toLowerCase().normalize('NFC') + SALT_SUFFIX))
}

/** passphrase + email → AES-256 키(32바이트). 양 기기 동일 입력이면 동일 키. */
export function deriveKey(passphrase: string, email: string): Uint8Array {
  return pbkdf2(sha256, te.encode(nfc(passphrase.trim())), deriveSalt(email), {
    c: PBKDF2_ITERATIONS,
    dkLen: KEY_LEN,
  })
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(E2EE_PREFIX)
}

/** 평문 → "e2ee:v1:base64(iv∥ct∥tag)". */
export function encrypt(plaintext: string, key: Uint8Array): string {
  const iv = ExpoCrypto.getRandomBytes(IV_LEN) // CSPRNG (Uint8Array)
  const out = gcm(key, iv).encrypt(te.encode(plaintext)) // ct∥tag
  const comb = new Uint8Array(IV_LEN + out.length)
  comb.set(iv, 0)
  comb.set(out, IV_LEN)
  return E2EE_PREFIX + bytesToBase64(comb)
}

/** "e2ee:v1:..." → 평문. prefix 없으면 입력 그대로. 키 불일치/변조 → throw. */
export function decrypt(value: string, key: Uint8Array): string {
  if (!value.startsWith(E2EE_PREFIX)) return value
  const buf = base64ToBytes(value.slice(E2EE_PREFIX.length))
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('E2EE_DECRYPT_FAILED')
  const iv = buf.subarray(0, IV_LEN)
  const rest = buf.subarray(IV_LEN) // ct∥tag
  try {
    return td.decode(gcm(key, iv).decrypt(rest))
  } catch {
    throw new Error('E2EE_DECRYPT_FAILED')
  }
}
