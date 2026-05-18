import { Alert } from "react-native";
import { APP_VERSION } from "./config";

// release 빌드에서도 사용자가 실제 에러 메시지를 화면에서 보고
// 캡처할 수 있게 한다. silent fail 추적 도구.

let lastShownAt = 0;
const MIN_INTERVAL_MS = 800; // 동시 다발 에러 폭격 방지

function shouldSkip(err: unknown): boolean {
  const message = String((err as any)?.message || err || "");
  const name = String((err as any)?.name || "");
  if (name === "AbortError") return true;
  if (/aborted|timed out|Network request failed/i.test(message)) {
    // 네트워크 끊긴 일반 케이스는 빈도 높고 사용자도 인지함 → 굳이 안 띄움
    return false; // ← 디버깅을 위해 띄우기로 변경
  }
  return false;
}

export function reportError(err: unknown, context?: string): void {
  if (shouldSkip(err)) return;
  const now = Date.now();
  if (now - lastShownAt < MIN_INTERVAL_MS) return;
  lastShownAt = now;

  const e = err as any;
  const name = e?.name || "Error";
  const message = e?.message || String(err);
  const stackFirstLine = String(e?.stack || "")
    .split("\n")
    .slice(0, 2)
    .join("\n");

  const body = [
    context ? `[${context}]` : null,
    `${name}: ${message}`,
    stackFirstLine,
    `(v${APP_VERSION})`,
  ]
    .filter(Boolean)
    .join("\n");

  Alert.alert("디버그", body);
}

export function installGlobalErrorHandler(): void {
  const g: any = globalThis;
  const ErrorUtils = g?.ErrorUtils;
  if (!ErrorUtils?.setGlobalHandler) return;
  const prev = ErrorUtils.getGlobalHandler?.();
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    reportError(error, isFatal ? "FATAL" : "GLOBAL");
    prev?.(error, isFatal);
  });
}
