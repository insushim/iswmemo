import { Alert } from "react-native";
import { APP_VERSION } from "./config";

// release 빌드에서도 사용자가 실제 에러 메시지를 화면에서 보고
// 캡처할 수 있게 한다. silent fail 추적 도구.

let lastShownAt = 0;
const MIN_INTERVAL_MS = 800; // 동시 다발 에러 폭격 방지

function shouldSkip(err: unknown): boolean {
  // AbortError(타임아웃/취소)만 noise로 보고 건너뛴다. 그 외는 모두 리포트.
  return String((err as any)?.name || "") === "AbortError";
}

export function reportError(err: unknown, context?: string): void {
  if (shouldSkip(err)) return;

  const e = err as any;
  const name = e?.name || "Error";
  const message = e?.message || String(err);

  // 운영 빌드에서는 사용자에게 절대 Alert 띄우지 않는다 (디버그 noise 차단).
  // 진짜 원인 추적은 v3.9.19에서 끝났고, 이후로는 화면 caller가
  // 자체 catch로 사용자 친화 메시지 처리.
  if (!__DEV__) {
    console.warn(`[${context || "API"}] ${name}: ${message}`);
    return;
  }

  // dev 빌드에서만 Alert (개발 중 silent fail 추적 유지)
  const now = Date.now();
  if (now - lastShownAt < MIN_INTERVAL_MS) return;
  lastShownAt = now;

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
