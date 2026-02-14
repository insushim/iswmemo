const sharp = require('sharp');
const path = require('path');

// GrowthPad 앱 아이콘 - 세련된 미니멀 디자인
// 성장(Growth) + 체계(Pad) = 씨앗에서 자라나는 잎 + 체크 모티프
// 인디고-퍼플 그라데이션 배경에 심플한 화이트 라인 아이콘
const iconSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4f46e5"/>
      <stop offset="50%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
    <linearGradient id="leaf" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#ffffff"/>
      <stop offset="100%" style="stop-color:#e0e7ff"/>
    </linearGradient>
  </defs>

  <!-- 배경: 부드러운 라운드 사각형 -->
  <rect width="1024" height="1024" rx="224" fill="url(#bg)"/>

  <!-- 미묘한 빛 효과 -->
  <ellipse cx="380" cy="350" rx="280" ry="220" fill="white" opacity="0.06"/>

  <!-- 메인 아이콘: 성장하는 새싹 -->
  <g transform="translate(512, 490)">
    <!-- 줄기 (아래에서 위로) -->
    <path d="M0,180 C0,180 0,40 0,-60"
          stroke="url(#leaf)" stroke-width="36" stroke-linecap="round" fill="none"/>

    <!-- 왼쪽 잎 -->
    <path d="M-4,20 C-4,20 -120,-40 -140,-160 C-140,-160 -40,-140 -4,-20"
          fill="url(#leaf)" opacity="0.9"/>

    <!-- 오른쪽 잎 (더 큼) -->
    <path d="M4,-60 C4,-60 160,-140 200,-280 C200,-280 60,-240 4,-80"
          fill="url(#leaf)"/>
  </g>

  <!-- 작은 완료 도트 (오른쪽 하단) -->
  <g transform="translate(680, 700)">
    <circle cx="0" cy="0" r="56" fill="#22c55e"/>
    <polyline points="-22,2 -6,20 26,-16"
            stroke="white" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>
</svg>
`;

// Adaptive 아이콘 전경 (투명 배경, 더 큰 safe zone)
const adaptiveIconSvg = `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="leaf" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#ffffff"/>
      <stop offset="100%" style="stop-color:#e0e7ff"/>
    </linearGradient>
  </defs>

  <!-- 메인 아이콘: 성장하는 새싹 (중앙 정렬, safe zone 고려) -->
  <g transform="translate(512, 480)">
    <!-- 줄기 -->
    <path d="M0,160 C0,160 0,30 0,-50"
          stroke="url(#leaf)" stroke-width="32" stroke-linecap="round" fill="none"/>

    <!-- 왼쪽 잎 -->
    <path d="M-4,10 C-4,10 -100,-30 -120,-140 C-120,-140 -30,-120 -4,-10"
          fill="url(#leaf)" opacity="0.9"/>

    <!-- 오른쪽 잎 -->
    <path d="M4,-50 C4,-50 140,-120 170,-240 C170,-240 50,-200 4,-70"
          fill="url(#leaf)"/>
  </g>

  <!-- 완료 도트 -->
  <g transform="translate(660, 670)">
    <circle cx="0" cy="0" r="48" fill="#22c55e"/>
    <polyline points="-18,2 -5,16 22,-14"
            stroke="white" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>
</svg>
`;

// 스플래시 아이콘
const splashIconSvg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="leaf" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#ffffff"/>
      <stop offset="100%" style="stop-color:#e0e7ff"/>
    </linearGradient>
  </defs>

  <g transform="translate(256, 245)">
    <path d="M0,90 C0,90 0,15 0,-30"
          stroke="url(#leaf)" stroke-width="18" stroke-linecap="round" fill="none"/>
    <path d="M-2,5 C-2,5 -55,-18 -65,-80 C-65,-80 -18,-65 -2,-5"
          fill="url(#leaf)" opacity="0.9"/>
    <path d="M2,-30 C2,-30 75,-65 90,-130 C90,-130 30,-110 2,-40"
          fill="url(#leaf)"/>
  </g>

  <g transform="translate(335, 340)">
    <circle cx="0" cy="0" r="26" fill="#22c55e"/>
    <polyline points="-10,1 -3,9 12,-8"
            stroke="white" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>
</svg>
`;

// Favicon
const faviconSvg = `
<svg width="64" height="64" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4f46e5"/>
      <stop offset="100%" style="stop-color:#7c3aed"/>
    </linearGradient>
  </defs>

  <rect width="64" height="64" rx="14" fill="url(#bg)"/>

  <g transform="translate(30, 30)">
    <path d="M0,14 C0,14 0,2 0,-4" stroke="white" stroke-width="3" stroke-linecap="round" fill="none"/>
    <path d="M0,1 C0,1 -10,-4 -12,-14 C-12,-14 -3,-12 0,0" fill="white" opacity="0.9"/>
    <path d="M0,-4 C0,-4 13,-10 16,-22 C16,-22 5,-18 0,-6" fill="white"/>
  </g>

  <g transform="translate(43, 43)">
    <circle cx="0" cy="0" r="5" fill="#22c55e"/>
    <polyline points="-2,0 -1,2 3,-2" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>
</svg>
`;

const assetsDir = path.join(__dirname, '..', 'assets');

async function generateIcons() {
  console.log('Generating GrowthPad v2 icons...');

  // icon.png (1024x1024)
  await sharp(Buffer.from(iconSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(assetsDir, 'icon.png'));
  console.log('  icon.png (1024x1024)');

  // adaptive-icon.png (1024x1024)
  await sharp(Buffer.from(adaptiveIconSvg))
    .resize(1024, 1024)
    .png()
    .toFile(path.join(assetsDir, 'adaptive-icon.png'));
  console.log('  adaptive-icon.png (1024x1024)');

  // splash-icon.png (512x512)
  await sharp(Buffer.from(splashIconSvg))
    .resize(512, 512)
    .png()
    .toFile(path.join(assetsDir, 'splash-icon.png'));
  console.log('  splash-icon.png (512x512)');

  // favicon.png (64x64)
  await sharp(Buffer.from(faviconSvg))
    .resize(64, 64)
    .png()
    .toFile(path.join(assetsDir, 'favicon.png'));
  console.log('  favicon.png (64x64)');

  console.log('\nAll icons generated!');
}

generateIcons().catch(console.error);
