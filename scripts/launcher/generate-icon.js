/**
 * OneClick ERP — Gerador de ícone do app.
 *
 * Design (2026):
 *  - Gradiente diagonal sky (azure #0ea5e9 → #0284c7 → #0369a1) — identidade
 *    visual do sistema (bloco Administrativo + auto-update friendly).
 *  - Cantos arredondados (radius ~22%) — soft 3D.
 *  - Glyph: anel "O" + nó central → representa o "click central" que orquestra
 *    todos os serviços. Para tamanhos pequenos (≤24), só o anel; para ≥32
 *    aparece o nó central; para ≥128 aparece um highlight interno sutil.
 *  - Antialiasing via supersampling 4× — renderiza em escala maior e
 *    aplica média no downsample. Sem dependências externas.
 *
 * Executa com: node generate-icon.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─── CRC32 (PNG) ─────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function createPNG(width, height, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    raw[y * rowBytes] = 0;
    pixels.copy(raw, y * rowBytes + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── ICO (multi-PNG embed) ───────────────────────────────────
function createICO(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let dataOffset = 6 + images.length * 16;
  const entries = [], datas = [];
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0; entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    entries.push(entry); datas.push(png);
    dataOffset += png.length;
  }
  return Buffer.concat([header, ...entries, ...datas]);
}

// ─── Color utils ─────────────────────────────────────────────
function hex(c) {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) {
  return [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))];
}

// Paleta sky/azure
const SKY_LIGHT = hex('#38bdf8');
const SKY_MAIN  = hex('#0ea5e9');
const SKY_DEEP  = hex('#0369a1');
const WHITE     = [255, 255, 255];

// ─── Renderiza em escala maior e faz downsample (supersampling) ──
function renderIcon(size) {
  const SS = size <= 32 ? 4 : size <= 64 ? 3 : 2; // supersampling
  const big = size * SS;
  const bigPixels = renderRaw(big);
  return downsample(bigPixels, big, size, SS);
}

function renderRaw(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.22; // canto arredondado
  const center = (size - 1) / 2;

  // Ring (O) — proporções
  const ringOuter = size * 0.34;
  const ringInner = size * 0.22;
  const dotRadius = size * 0.08;

  // Highlight interno (só pra tamanhos grandes — efeito "vidro")
  const showHighlight = size >= 96;
  const showDot = size >= 32;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;

      // ── Máscara: canto arredondado ──
      const dxLeft = x, dxRight = size - 1 - x;
      const dyTop = y, dyBot = size - 1 - y;
      const dx = Math.min(dxLeft, dxRight);
      const dy = Math.min(dyTop, dyBot);
      let alpha = 255;
      if (dx < radius && dy < radius) {
        const d = Math.sqrt((radius - dx) ** 2 + (radius - dy) ** 2);
        if (d > radius) alpha = 0;
        else if (d > radius - 1) alpha = Math.round(255 * (radius - d));
      }
      if (alpha === 0) {
        pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; pixels[i + 3] = 0;
        continue;
      }

      // ── Gradiente diagonal: top-left light → bottom-right deep ──
      const t = ((x + y) / (2 * size));
      let bg;
      if (t < 0.5) bg = mix(SKY_LIGHT, SKY_MAIN, t * 2);
      else bg = mix(SKY_MAIN, SKY_DEEP, (t - 0.5) * 2);

      let [r, g, b] = bg;

      // ── Highlight interno (gloss top-left) ──
      if (showHighlight) {
        const hx = x - size * 0.30, hy = y - size * 0.30;
        const hd = Math.sqrt(hx * hx + hy * hy);
        const hRad = size * 0.42;
        if (hd < hRad) {
          const hAlpha = (1 - hd / hRad) * 0.18;
          r = Math.round(lerp(r, 255, hAlpha));
          g = Math.round(lerp(g, 255, hAlpha));
          b = Math.round(lerp(b, 255, hAlpha));
        }
      }

      // ── Glyph: anel O + nó central ──
      const cx = x - center, cy = y - center;
      const dist = Math.sqrt(cx * cx + cy * cy);

      // Anel
      if (dist >= ringInner && dist <= ringOuter) {
        r = WHITE[0]; g = WHITE[1]; b = WHITE[2];
      } else if (dist > ringOuter && dist < ringOuter + 1) {
        const ringT = ringOuter + 1 - dist;
        r = Math.round(lerp(r, 255, ringT));
        g = Math.round(lerp(g, 255, ringT));
        b = Math.round(lerp(b, 255, ringT));
      } else if (dist > ringInner - 1 && dist < ringInner) {
        const ringT = dist - (ringInner - 1);
        r = Math.round(lerp(r, 255, ringT));
        g = Math.round(lerp(g, 255, ringT));
        b = Math.round(lerp(b, 255, ringT));
      }

      // Nó central — só pra tamanhos médios+
      if (showDot && dist <= dotRadius) {
        r = WHITE[0]; g = WHITE[1]; b = WHITE[2];
      } else if (showDot && dist > dotRadius && dist < dotRadius + 1) {
        const dotT = dotRadius + 1 - dist;
        r = Math.round(lerp(r, 255, dotT));
        g = Math.round(lerp(g, 255, dotT));
        b = Math.round(lerp(b, 255, dotT));
      }

      pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = alpha;
    }
  }
  return pixels;
}

function downsample(srcPixels, srcSize, dstSize, factor) {
  const dst = Buffer.alloc(dstSize * dstSize * 4);
  const samplesPerPixel = factor * factor;
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const sIdx = ((y * factor + sy) * srcSize + (x * factor + sx)) * 4;
          const sa = srcPixels[sIdx + 3];
          // Premultiply para não vazar fundo nos cantos AA
          r += srcPixels[sIdx]     * sa / 255;
          g += srcPixels[sIdx + 1] * sa / 255;
          b += srcPixels[sIdx + 2] * sa / 255;
          a += sa;
        }
      }
      a = a / samplesPerPixel;
      const dIdx = (y * dstSize + x) * 4;
      if (a > 0) {
        dst[dIdx]     = Math.round((r / samplesPerPixel) * 255 / a);
        dst[dIdx + 1] = Math.round((g / samplesPerPixel) * 255 / a);
        dst[dIdx + 2] = Math.round((b / samplesPerPixel) * 255 / a);
        dst[dIdx + 3] = Math.round(a);
      }
    }
  }
  return dst;
}

// ─── Gerar arquivos ──────────────────────────────────────────
const assetsDir = path.join(__dirname, 'assets');
fs.mkdirSync(assetsDir, { recursive: true });

const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = [];

for (const size of sizes) {
  const pixels = renderIcon(size);
  const png = createPNG(size, size, pixels);
  images.push({ size, png });

  if (size === 256) {
    fs.writeFileSync(path.join(assetsDir, 'icon.png'), png);
    console.log(`  icon.png (${size}x${size}) — ${png.length} bytes`);
  }
  if (size === 32) fs.writeFileSync(path.join(assetsDir, 'icon-32.png'), png);
  if (size === 16) fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), png);
}

const ico = createICO(images);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico);
console.log(`  icon.ico — ${ico.length} bytes (${sizes.join(', ')}px)`);
console.log('\nIcones gerados em assets/');
