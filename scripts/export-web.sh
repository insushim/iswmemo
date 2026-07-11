#!/usr/bin/env bash
# 또박또박 웹(PWA) 익스포트 파이프라인 — 안드로이드 앱과 "같은 코드"를 웹으로 빌드해
# growthpad-web/public/app/ 에 넣는다 (배포는 growthpad-web에서 opennext build + wrangler deploy).
#
# 사용: ./scripts/export-web.sh
# 산출: growthpad 워커의 https://growthpad.simssijjang.workers.dev/app/
#
# 주의:
# - app.json experiments.baseUrl="/app" 이 asset 경로 프리픽스의 진실원(제거 금지)
# - index.html PWA 메타(홈 화면 추가·아이폰)와 manifest.json은 이 스크립트가 주입/유지
# - 웹 전용 동작(SecureStore→localStorage 등)은 metro.config.js 의 웹 alias 참조
set -euo pipefail
cd "$(dirname "$0")/.."

WEB_ROOT="${DDOBAK_WEB_ROOT:-/Users/sim-insu/Documents/dev/growthpad-web/public/app}"
TMP_BASE="$(mktemp -d)"
trap 'rm -rf "$TMP_BASE"' EXIT
TMP_OUT="$TMP_BASE/web-dist"

echo "▶ expo export (web)"
npx expo export --platform web --output-dir "$TMP_OUT"

echo "▶ PWA 메타 주입"
python3 - "$TMP_OUT/index.html" <<'EOF'
import sys
path = sys.argv[1]
src = open(path).read()
src = src.replace('<html lang="en">', '<html lang="ko">', 1)
meta = '''    <!-- PWA/아이폰 홈 화면 추가 지원 (scope=/app — 데스크톱용 루트 웹과 별개 앱) -->
    <link rel="manifest" href="/app/manifest.json" />
    <link rel="apple-touch-icon" href="/app/apple-touch-icon.png" />
    <meta name="theme-color" content="#6366f1" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="또박또박" />
'''
anchor = '<title>또박또박</title>\n'
if anchor not in src:
    raise SystemExit("index.html title anchor 없음 — expo 템플릿 변경 여부 확인")
src = src.replace(anchor, anchor + meta, 1)
open(path, 'w').write(src)
print("  index.html patched")
EOF

echo "▶ 아이콘/매니페스트"
sips -Z 512 assets/icon.png --out "$TMP_OUT/icon-512.png" >/dev/null
sips -Z 180 assets/icon.png --out "$TMP_OUT/apple-touch-icon.png" >/dev/null
cat > "$TMP_OUT/manifest.json" <<'EOF'
{
  "name": "또박또박",
  "short_name": "또박또박",
  "description": "또박또박 적는 나의 기록 - 할일, 습관, 목표 관리",
  "start_url": "/app/",
  "scope": "/app/",
  "display": "standalone",
  "background_color": "#f8fafc",
  "theme_color": "#6366f1",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/app/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" },
    { "src": "/app/apple-touch-icon.png", "sizes": "180x180", "type": "image/png" }
  ]
}
EOF

echo "▶ growthpad-web/public/app 교체"
rm -rf "$WEB_ROOT"
mkdir -p "$WEB_ROOT"
cp -R "$TMP_OUT"/. "$WEB_ROOT/"

echo "✅ 완료. 다음 단계(growthpad-web에서):"
echo "   NEXTAUTH_SECRET=\"__BUILD_PLACEHOLDER_NOT_A_SECRET__\" npx opennextjs-cloudflare build && npx wrangler deploy"
