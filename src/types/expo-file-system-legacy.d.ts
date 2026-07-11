// expo-file-system/legacy 는 SDK 54에 실존(역대 릴리스 검증)하지만 서브패스 타입 해석이
// 안 돼 TS2307이 나던 것 — 런타임 영향 없는 최소 선언으로 게이트만 통과시킨다.
declare module "expo-file-system/legacy" {
  export const documentDirectory: string | null;
  export function getInfoAsync(uri: string): Promise<{ exists: boolean }>;
  export function makeDirectoryAsync(
    uri: string,
    options?: { intermediates?: boolean },
  ): Promise<void>;
  export function writeAsStringAsync(uri: string, contents: string): Promise<void>;
  export function readAsStringAsync(uri: string): Promise<string>;
  export function deleteAsync(
    uri: string,
    options?: { idempotent?: boolean },
  ): Promise<void>;
}
