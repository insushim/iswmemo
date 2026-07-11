// 웹 익스포트(expo export -p web) 지원용 Metro 설정.
// 네이티브(android) 번들 동작은 기본값 그대로 — 웹 플랫폼에서만 모듈을 치환한다.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

const origResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // 웹에는 OS 키체인이 없어 expo-secure-store 호출이 전부 reject됨 —
  // 설정/캐시/E2EE키 영속화가 통째로 죽으므로 localStorage 심으로 치환.
  if (platform === "web" && moduleName === "expo-secure-store") {
    return {
      filePath: path.resolve(__dirname, "src/lib/secure-store.web.ts"),
      type: "sourceFile",
    };
  }
  return origResolveRequest
    ? origResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
