#!/usr/bin/env node
/*
 * plugin(withAutoLaunch.js) 템플릿 ↔ android/ 실물 동기화 게이트.
 *
 * 왜: withAutoLaunch.js는 네이티브 Java 파일 전문을 문자열 템플릿으로 안고 있어,
 * android/ 실물만 고치면 다음 `expo prebuild`가 구버전 템플릿으로 덮어써 버그가
 * 부활한다(실측: AlarmDeleteReceiver 토큰 로직이 템플릿에서 누락된 채 방치됐었음).
 * "둘 다 고치기"를 기억에 맡기지 않고 기계로 강제하는 스크립트.
 *
 * 사용:
 *   node scripts/verify-plugin-sync.js          # 검증(기본). drift 발견 시 exit 1
 *   node scripts/verify-plugin-sync.js --write  # android/ 실물을 진실원으로 템플릿 재생성
 *
 * 릴리스/prebuild 전에 검증 모드를 반드시 통과시킬 것.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PLUGIN = path.join(ROOT, 'plugins', 'withAutoLaunch.js');
const JAVA_DIR = path.join(
  ROOT, 'android', 'app', 'src', 'main', 'java', 'com', 'growthpad', 'app');
const PKG = 'com.growthpad.app';

// writeFileSync(path.join(javaDir, 'X'), `...`) 형태의 전문 템플릿 추출
const TEMPLATE_RE =
  /(fs\.writeFileSync\(\s*path\.join\(javaDir,\s*'([^']+)'\),\s*`)([\s\S]*?)(`\s*\);)/g;

// 패치 방식(전문 템플릿이 아닌 문자열 치환)인 파일: 핵심 마커가
// plugin 소스와 android 실물 양쪽에 모두 존재하는지 검사한다.
const PATCH_MARKERS = {
  'MainActivity.kt': [
    'setShowWhenLocked(true)',
    'overridePendingTransition(0, 0)',
    'auto_launch_enabled',
    'onWindowFocusChanged',
    'mainActivityHasFocus',
  ],
  'MainApplication.kt': [
    'mainActivityResumed',
    'mainActivityCreatedAt',
    'mainActivityResumedAt',
    'mainActivityStarted',
    'alarmActivityVisible',
  ],
};

// 템플릿 리터럴 원문 → prebuild가 실제로 쓰게 될 파일 내용 (JS escape/보간 동일 의미)
function renderTemplate(tplSource) {
  // eslint-disable-next-line no-unused-vars
  const pkg = PKG;
  // 자사 plugin 파일에서 온 소스만 평가한다(외부 입력 아님).
  // eslint-disable-next-line no-eval
  return eval('`' + tplSource + '`');
}

// android 실물 내용 → 템플릿 리터럴 원문 (escape + package 보간 복원)
function toTemplateSource(content) {
  let s = content
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
  s = s.replace(
    new RegExp('^package ' + PKG.replace(/\./g, '\\.') + ';', 'm'),
    'package ${pkg};');
  return s;
}

function main() {
  const write = process.argv.includes('--write');
  let pluginSrc = fs.readFileSync(PLUGIN, 'utf8');
  const problems = [];
  let updated = 0;

  // 1) 전문 템플릿 파일들
  pluginSrc = pluginSrc.replace(
    TEMPLATE_RE,
    (whole, head, fname, tplSource, tail) => {
      const realPath = path.join(JAVA_DIR, fname);
      if (!fs.existsSync(realPath)) {
        problems.push(`${fname}: android 실물 없음 (${realPath})`);
        return whole;
      }
      const real = fs.readFileSync(realPath, 'utf8');
      const rendered = renderTemplate(tplSource);
      if (rendered === real) return whole;

      if (!write) {
        const a = rendered.split('\n');
        const b = real.split('\n');
        let firstDiff = -1;
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
          if (a[i] !== b[i]) { firstDiff = i + 1; break; }
        }
        problems.push(
          `${fname}: DRIFT (템플릿 ${a.length}줄 vs 실물 ${b.length}줄, 첫 차이 ${firstDiff}행)`);
        return whole;
      }

      const newSource = toTemplateSource(real);
      if (renderTemplate(newSource) !== real) {
        problems.push(`${fname}: --write 라운드트립 불일치(escape 버그) — 수동 확인 필요`);
        return whole;
      }
      updated++;
      console.log(`  ✍ ${fname}: 템플릿 재생성(실물 기준)`);
      return head + newSource + tail;
    });

  if (write && updated > 0) {
    fs.writeFileSync(PLUGIN, pluginSrc);
  }

  // 2) 패치 방식 파일들 — 마커 존재 검사.
  // ⚠️ plugin 전체가 아니라 해당 파일의 패치블록 구간 안에서만 찾는다
  // (다른 파일 템플릿에 같은 문자열이 있으면 미수정이 가려지는 false PASS 방지).
  const curPlugin = fs.readFileSync(PLUGIN, 'utf8');
  const sections = {
    'MainActivity.kt': curPlugin.slice(
      curPlugin.indexOf('// Modify MainActivity.kt'),
      curPlugin.indexOf('// Modify MainApplication.kt')),
    'MainApplication.kt': curPlugin.slice(
      curPlugin.indexOf('// Modify MainApplication.kt')),
  };
  for (const [fname, markers] of Object.entries(PATCH_MARKERS)) {
    const realPath = path.join(JAVA_DIR, fname);
    if (!fs.existsSync(realPath)) {
      problems.push(`${fname}: android 실물 없음`);
      continue;
    }
    const section = sections[fname] || '';
    if (!section) {
      problems.push(`${fname}: plugin에서 패치블록 구간을 못 찾음 (주석 앵커 확인)`);
      continue;
    }
    const real = fs.readFileSync(realPath, 'utf8');
    for (const m of markers) {
      if (!real.includes(m)) problems.push(`${fname}: 실물에 마커 없음 → "${m}"`);
      if (!section.includes(m)) problems.push(`${fname}: plugin 패치블록에 마커 없음 → "${m}"`);
    }
  }

  if (problems.length) {
    console.error('✗ plugin ↔ android 동기화 실패:');
    for (const p of problems) console.error('  - ' + p);
    if (!write) console.error('\n  실물이 진실원이면: node scripts/verify-plugin-sync.js --write');
    process.exit(1);
  }
  console.log(write && updated
    ? `✓ 템플릿 ${updated}개 재생성 완료 + 마커 검증 통과`
    : '✓ plugin 템플릿 == android 실물 (전문 8종 + 패치마커 2종)');
}

main();
