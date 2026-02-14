// Generate app icon for 또박또박
// Uses pure Node.js to create a PNG with the app logo
const fs = require('fs');
const path = require('path');

// PNG file generator - creates a simple but clean icon
function createPNG(width, height, drawFunc) {
  const pixels = new Uint8Array(width * height * 4);
  drawFunc(pixels, width, height);

  // Create PNG file manually
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT chunk - raw pixel data with zlib
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter none
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * (1 + width * 4) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];
      rawData[dstIdx + 1] = pixels[srcIdx + 1];
      rawData[dstIdx + 2] = pixels[srcIdx + 2];
      rawData[dstIdx + 3] = pixels[srcIdx + 3];
    }
  }

  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);

  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xEDB88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function setPixel(pixels, w, x, y, r, g, b, a) {
  if (x < 0 || x >= w || y < 0) return;
  const idx = (y * w + x) * 4;
  if (idx < 0 || idx >= pixels.length - 3) return;
  if (a < 255 && pixels[idx + 3] > 0) {
    const srcA = a / 255;
    const dstA = pixels[idx + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    pixels[idx] = Math.round((r * srcA + pixels[idx] * dstA * (1 - srcA)) / outA);
    pixels[idx + 1] = Math.round((g * srcA + pixels[idx + 1] * dstA * (1 - srcA)) / outA);
    pixels[idx + 2] = Math.round((b * srcA + pixels[idx + 2] * dstA * (1 - srcA)) / outA);
    pixels[idx + 3] = Math.round(outA * 255);
  } else {
    pixels[idx] = r;
    pixels[idx + 1] = g;
    pixels[idx + 2] = b;
    pixels[idx + 3] = a;
  }
}

function fillRect(pixels, w, h, x1, y1, x2, y2, r, g, b, a) {
  for (let y = Math.max(0, Math.floor(y1)); y < Math.min(h, Math.ceil(y2)); y++) {
    for (let x = Math.max(0, Math.floor(x1)); x < Math.min(w, Math.ceil(x2)); x++) {
      setPixel(pixels, w, x, y, r, g, b, a);
    }
  }
}

function fillCircle(pixels, w, h, cx, cy, radius, r, g, b, a) {
  for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(h, Math.ceil(cy + radius)); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(w, Math.ceil(cx + radius)); x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= radius) {
        const edge = Math.max(0, Math.min(1, radius - dist));
        setPixel(pixels, w, x, y, r, g, b, Math.round(a * edge));
      }
    }
  }
}

function fillRoundedRect(pixels, w, h, x1, y1, x2, y2, radius, r, g, b, a) {
  for (let y = Math.max(0, Math.floor(y1)); y < Math.min(h, Math.ceil(y2)); y++) {
    for (let x = Math.max(0, Math.floor(x1)); x < Math.min(w, Math.ceil(x2)); x++) {
      let inside = true;
      // Check corners
      if (x < x1 + radius && y < y1 + radius) {
        inside = Math.sqrt((x - (x1 + radius)) ** 2 + (y - (y1 + radius)) ** 2) <= radius;
      } else if (x > x2 - radius && y < y1 + radius) {
        inside = Math.sqrt((x - (x2 - radius)) ** 2 + (y - (y1 + radius)) ** 2) <= radius;
      } else if (x < x1 + radius && y > y2 - radius) {
        inside = Math.sqrt((x - (x1 + radius)) ** 2 + (y - (y2 - radius)) ** 2) <= radius;
      } else if (x > x2 - radius && y > y2 - radius) {
        inside = Math.sqrt((x - (x2 - radius)) ** 2 + (y - (y2 - radius)) ** 2) <= radius;
      }
      if (inside) setPixel(pixels, w, x, y, r, g, b, a);
    }
  }
}

function drawIcon(pixels, w, h) {
  // Background: indigo gradient
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const t = y / h;
      const r = Math.round(99 * (1 - t * 0.3));   // #6366f1 → darker
      const g = Math.round(102 * (1 - t * 0.3));
      const b = Math.round(241 * (1 - t * 0.15));
      setPixel(pixels, w, x, y, r, g, b, 255);
    }
  }

  const cx = w / 2;
  const cy = h / 2;
  const scale = w / 1024;

  // Notepad/memo shape - white rounded rectangle
  const padW = 520 * scale;
  const padH = 600 * scale;
  const padX = cx - padW / 2;
  const padY = cy - padH / 2 + 30 * scale;
  fillRoundedRect(pixels, w, h, padX, padY, padX + padW, padY + padH, 40 * scale, 255, 255, 255, 240);

  // Top bar of notepad (darker)
  fillRoundedRect(pixels, w, h, padX, padY, padX + padW, padY + 80 * scale, 40 * scale, 230, 230, 250, 255);
  fillRect(pixels, w, h, padX, padY + 40 * scale, padX + padW, padY + 80 * scale, 230, 230, 250, 255);

  // Checkmark lines (todo items)
  const lineStartX = padX + 120 * scale;
  const lineEndX = padX + padW - 60 * scale;
  const lineH = 28 * scale;

  for (let i = 0; i < 4; i++) {
    const lineY = padY + 130 * scale + i * 110 * scale;

    // Checkbox circle
    const cbCx = padX + 70 * scale;
    const cbCy = lineY + lineH / 2;
    const cbR = 22 * scale;

    if (i < 2) {
      // Completed - filled circle with check
      fillCircle(pixels, w, h, cbCx, cbCy, cbR, 99, 102, 241, 255);
      // Simple checkmark
      for (let t = 0; t < 1; t += 0.01) {
        if (t < 0.4) {
          const px = cbCx - 10 * scale + t * 25 * scale;
          const py = cbCy - 2 * scale + t * 20 * scale;
          fillCircle(pixels, w, h, px, py, 4 * scale, 255, 255, 255, 255);
        } else {
          const px = cbCx - 10 * scale + 0.4 * 25 * scale + (t - 0.4) * 30 * scale;
          const py = cbCy - 2 * scale + 0.4 * 20 * scale - (t - 0.4) * 35 * scale;
          fillCircle(pixels, w, h, px, py, 4 * scale, 255, 255, 255, 255);
        }
      }
      // Strikethrough text line
      fillRoundedRect(pixels, w, h, lineStartX, lineY + 8 * scale, lineEndX - (i === 0 ? 0 : 120 * scale), lineY + lineH - 8 * scale, 6 * scale, 180, 180, 200, 180);
    } else {
      // Uncompleted - empty circle
      for (let a = 0; a < Math.PI * 2; a += 0.02) {
        const px = cbCx + Math.cos(a) * cbR;
        const py = cbCy + Math.sin(a) * cbR;
        fillCircle(pixels, w, h, px, py, 3 * scale, 99, 102, 241, 200);
      }
      // Text line
      fillRoundedRect(pixels, w, h, lineStartX, lineY + 8 * scale, lineEndX - (i === 2 ? 60 * scale : 160 * scale), lineY + lineH - 8 * scale, 6 * scale, 100, 100, 130, 200);
    }
  }

  // Pencil icon at top-right
  const penX = padX + padW - 20 * scale;
  const penY = padY - 30 * scale;
  const penLen = 120 * scale;
  const penAngle = -Math.PI / 4;
  for (let t = 0; t < 1; t += 0.005) {
    const px = penX + Math.cos(penAngle) * penLen * t;
    const py = penY + Math.sin(penAngle) * penLen * t;
    const thickness = t < 0.1 ? t * 80 * scale : 8 * scale;
    fillCircle(pixels, w, h, px, py, thickness, 255, 200, 60, 255);
  }
  // Pencil tip
  const tipX = penX + Math.cos(penAngle) * 0;
  const tipY = penY + Math.sin(penAngle) * 0;
  fillCircle(pixels, w, h, tipX, tipY, 6 * scale, 80, 80, 80, 255);
}

function drawAdaptiveIcon(pixels, w, h) {
  // Just the foreground on transparent - Android adaptive icon
  // Fill with primary color
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      setPixel(pixels, w, x, y, 99, 102, 241, 255);
    }
  }

  const cx = w / 2;
  const cy = h / 2;
  const scale = w / 1024;

  // White notepad
  const padW = 400 * scale;
  const padH = 480 * scale;
  const padX = cx - padW / 2;
  const padY = cy - padH / 2 + 20 * scale;
  fillRoundedRect(pixels, w, h, padX, padY, padX + padW, padY + padH, 36 * scale, 255, 255, 255, 245);

  // Lines
  for (let i = 0; i < 3; i++) {
    const lineY = padY + 100 * scale + i * 100 * scale;
    const lineW = i === 0 ? padW * 0.7 : i === 1 ? padW * 0.5 : padW * 0.6;
    fillRoundedRect(pixels, w, h, padX + 50 * scale, lineY, padX + 50 * scale + lineW, lineY + 24 * scale, 12 * scale, 99, 102, 241, 120);
  }

  // Check circle
  fillCircle(pixels, w, h, padX + 30 * scale, padY + 112 * scale, 14 * scale, 99, 102, 241, 200);
}

// Generate icons
const sizes = [
  { name: 'icon.png', size: 1024, draw: drawIcon },
  { name: 'adaptive-icon.png', size: 1024, draw: drawAdaptiveIcon },
  { name: 'splash-icon.png', size: 512, draw: drawIcon },
  { name: 'favicon.png', size: 48, draw: drawIcon },
];

const assetsDir = path.join(__dirname, '..', 'assets');

for (const { name, size, draw } of sizes) {
  const png = createPNG(size, size, draw);
  const filePath = path.join(assetsDir, name);
  fs.writeFileSync(filePath, png);
  console.log(`Generated ${name} (${size}x${size})`);
}

console.log('All icons generated!');
