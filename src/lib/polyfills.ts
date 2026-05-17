// Hermes에는 DOMException 전역이 없다.
// react-native core의 structuredClone, third-party 라이브러리가
// `new DOMException(...)`을 직접 호출하면 ReferenceError가 발생해
// catch 블록 전체가 깨질 수 있다 (v3.9.16에서 API 전체 실패의 근본 원인).
// 앱 entry에서 최우선으로 polyfill해 안전 그물을 깐다.
if (typeof (globalThis as any).DOMException === "undefined") {
  class DOMExceptionPolyfill extends Error {
    code: number;
    constructor(message?: string, name?: string) {
      super(message || "");
      this.name = name || "Error";
      this.code = 0;
    }
  }
  (globalThis as any).DOMException = DOMExceptionPolyfill;
}
