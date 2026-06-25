#!/usr/bin/env bash
#
# 또박또박(iwmemo) 릴리스 자동화 (macOS)
# ─────────────────────────────────────────────────────────────
# - 현재 코드 버전(config.ts)으로 release APK 빌드
# - 버전명 애셋 + 고정명 애셋(DdobakDdobak-latest.apk) 둘 다 첨부해 GitHub 릴리스 생성
# - 그래야 고정 최신 URL이 유지됨:
#     https://github.com/insushim/iswmemo/releases/latest/download/DdobakDdobak-latest.apk
#   (최신 릴리스에 그 고정명 애셋이 없으면 이 URL이 404가 됨 → 이 스크립트가 누락을 방지)
#
# 사용법:
#   scripts/release.sh                        # config.ts 버전으로 빌드 + 릴리스
#   scripts/release.sh --push                 # 릴리스 전에 git push origin master
#   scripts/release.sh --no-build             # 이미 빌드된 APK로 릴리스만
#   scripts/release.sh --notes notes.md       # 릴리스 노트 파일 지정
#   scripts/release.sh --title "제목" --push
#
# 사전조건: gh 인증(gh auth login), JDK17, android/local.properties의 sdk.dir, 버전 4곳 동일 bump.
#
set -euo pipefail

REPO="insushim/iswmemo"
LATEST_ASSET="DdobakDdobak-latest.apk"   # ← 고정 URL을 만드는 불변 파일명. 절대 바꾸지 말 것.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
cd "$ROOT"

DO_BUILD=1
DO_PUSH=0
NOTES_FILE=""
TITLE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-build) DO_BUILD=0; shift ;;
    --push)     DO_PUSH=1; shift ;;
    --notes)    NOTES_FILE="${2:?--notes 뒤에 파일 경로 필요}"; shift 2 ;;
    --title)    TITLE="${2:?--title 뒤에 제목 필요}"; shift 2 ;;
    -h|--help)  grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "✗ 알 수 없는 옵션: $1"; exit 1 ;;
  esac
done

semver() { grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1; }

# ── 버전 추출 & 4곳 정합성 검사 ──────────────────────────────
ver_config=$(grep -oE 'APP_VERSION *= *"[0-9.]+"' src/lib/config.ts | semver || true)
ver_app=$(grep -oE '"version": *"[0-9.]+"' app.json | semver || true)
ver_runtime=$(grep -oE '"runtimeVersion": *"[0-9.]+"' app.json | semver || true)
ver_gradle=$(grep -oE 'versionName *"[0-9.]+"' android/app/build.gradle | semver || true)

[[ -n "$ver_config" ]] || { echo "✗ config.ts에서 APP_VERSION을 못 찾음"; exit 1; }
VER="$ver_config"
if [[ "$ver_app" != "$VER" || "$ver_runtime" != "$VER" || "$ver_gradle" != "$VER" ]]; then
  echo "✗ 버전 불일치 — 릴리스 중단"
  echo "    config.ts          = $ver_config"
  echo "    app.json version   = $ver_app"
  echo "    app.json runtime   = $ver_runtime"
  echo "    build.gradle name  = $ver_gradle"
  echo "  4곳을 동일하게 맞추고 versionCode도 +1 했는지 확인하세요."
  exit 1
fi
TAG="v$VER"
VERSIONED_ASSET="DdobakDdobak-${TAG}-release.apk"
echo "▶ 버전 $VER  (태그 $TAG)"

# ── 사전 점검 ───────────────────────────────────────────────
command -v gh >/dev/null || { echo "✗ gh CLI 없음"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "✗ gh 인증 필요: gh auth login"; exit 1; }
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  echo "✗ 릴리스 $TAG 가 이미 존재합니다. 버전을 올리거나 기존 릴리스를 먼저 삭제하세요."
  exit 1
fi

if [[ $DO_PUSH -eq 1 ]]; then
  echo "▶ git push origin master"
  git push origin master
fi
# 릴리스 태그는 origin/master를 가리키므로, 로컬이 앞서 있으면 잘못된 커밋이 태깅됨 → 중단
git fetch -q origin master 2>/dev/null || true
if [[ "$(git rev-list --count origin/master..HEAD 2>/dev/null || echo 0)" != "0" ]]; then
  echo "✗ 로컬 master가 origin보다 앞섭니다. --push 로 먼저 올리거나 직접 push 후 다시 실행하세요."
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "⚠ 커밋되지 않은 변경이 있습니다 — 빌드 APK엔 반영되지만 릴리스 태그(origin/master)엔 없습니다."
fi

# ── JDK17 ───────────────────────────────────────────────────
if [[ -z "${JAVA_HOME:-}" || ! -x "${JAVA_HOME:-/nonexistent}/bin/java" ]]; then
  if [[ -x /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/java ]]; then
    export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
  elif /usr/libexec/java_home -v 17 >/dev/null 2>&1; then
    JAVA_HOME="$(/usr/libexec/java_home -v 17)"; export JAVA_HOME
  else
    echo "✗ JDK17을 못 찾음.  brew install openjdk@17"; exit 1
  fi
fi
export PATH="$JAVA_HOME/bin:$PATH"
echo "▶ JDK: $(java -version 2>&1 | head -1)"

# ── 빌드 ────────────────────────────────────────────────────
APK_OUT="android/app/build/outputs/apk/release/app-release.apk"
if [[ $DO_BUILD -eq 1 ]]; then
  echo "▶ ./gradlew assembleRelease"
  ( cd android && ./gradlew assembleRelease --console=plain )
fi
[[ -f "$APK_OUT" ]] || { echo "✗ APK 산출물 없음: $APK_OUT (먼저 빌드 필요)"; exit 1; }

# ── 애셋 준비: 버전명 + 고정명 둘 다 ────────────────────────
cp -f "$APK_OUT" "$VERSIONED_ASSET"
cp -f "$APK_OUT" "$LATEST_ASSET"
echo "▶ 애셋: $VERSIONED_ASSET + $LATEST_ASSET (← 고정 URL용)"

# ── 릴리스 노트 ─────────────────────────────────────────────
[[ -n "$TITLE" ]] || TITLE="$TAG"
if [[ -n "$NOTES_FILE" ]]; then
  NOTES_ARGS=(--notes-file "$NOTES_FILE")
else
  NOTES_ARGS=(--notes "또박또박 ${TAG}

최신 버전 고정 다운로드(항상 최신): https://github.com/${REPO}/releases/latest/download/${LATEST_ASSET}")
fi

# ── 릴리스 생성 ─────────────────────────────────────────────
echo "▶ gh release create $TAG"
gh release create "$TAG" "$VERSIONED_ASSET" "$LATEST_ASSET" \
  -R "$REPO" --target master --title "$TITLE" "${NOTES_ARGS[@]}"

echo ""
echo "✅ 릴리스 완료: https://github.com/${REPO}/releases/tag/${TAG}"
echo "🔗 고정 최신 URL: https://github.com/${REPO}/releases/latest/download/${LATEST_ASSET}"
