/**
 * Gera os ícones PNG e ICO para o launcher do OneClick ERP.
 * Executa com: node generate-icon.js
 * Sem dependências externas — usa apenas zlib nativo do Node.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─── CRC32 ───────────────────────────────────────────────────
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

// ─── PNG builder ─────────────────────────────────────────────
function makeChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crcBuf]);
}

function createPNG(width, height, pixels) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    raw[y * rowBytes] = 0; // filter: none
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

// ─── ICO builder (embeds PNGs) ───────────────────────────────
function createICO(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let dataOffset = 6 + images.length * 16;
  const entries = [];
  const datas = [];

  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry[2] = 0;
    entry[3] = 0;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(dataOffset, 12);
    entries.push(entry);
    datas.push(png);
    dataOffset += png.length;
  }

  return Buffer.concat([header, ...entries, ...datas]);
}

// ─── Desenho do ícone ────────────────────────────────────────
function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const r = Math.round(size * 0.16); // raio dos cantos

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      let alpha = 255;

      // Cantos arredondados com anti-alias
      if (dx < r && dy < r) {
        const dist = Math.sqrt((r - dx) ** 2 + (r - dy) ** 2);
        if (dist > r) alpha = 0;
        else if (dist > r - 1.5) alpha = Math.round(255 * Math.max(0, r - dist) / 1.5);
      }

      // Gradiente sutil: #0d9668 (topo) → #10b981 (centro) → #059669 (base)
      const t = y / size;
      const rr = Math.round(0x0d + (0x10 - 0x0d) * Math.sin(t * Math.PI));
      const gg = Math.round(0x96 + (0xb9 - 0x96) * Math.sin(t * Math.PI));
      const bb = Math.round(0x68 + (0x81 - 0x68) * Math.sin(t * Math.PI));

      pixels[i] = rr;
      pixels[i + 1] = gg;
      pixels[i + 2] = bb;
      pixels[i + 3] = alpha;
    }
  }

  // Desenhar letras "OC" simplificadas (blocos brancos)
  if (size >= 32) {
    drawLetters(pixels, size);
  }

  return pixels;
}

function drawLetters(pixels, size) {
  const s = size / 32; // escala base (32px = 1x)
  const white = [255, 255, 255, 240];

  function setPixel(px, py) {
    const x = Math.round(px);
    const y = Math.round(py);
    if (x < 0 || x >= size || y < 0 || y >= size) return;
    const i = (y * size + x) * 4;
    if (pixels[i + 3] === 0) return; // fora do arredondamento
    pixels[i] = white[0];
    pixels[i + 1] = white[1];
    pixels[i + 2] = white[2];
    pixels[i + 3] = white[3];
  }

  function fillRect(x1, y1, w, h) {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        setPixel(x1 + dx, y1 + dy);
  }

  // Letra "O" (outline)
  const ox = Math.round(4 * s), oy = Math.round(9 * s);
  const ow = Math.round(11 * s), oh = Math.round(14 * s);
  const thick = Math.max(2, Math.round(2.5 * s));
  fillRect(ox, oy, ow, thick);                 // topo
  fillRect(ox, oy + oh - thick, ow, thick);     // base
  fillRect(ox, oy, thick, oh);                   // esquerda
  fillRect(ox + ow - thick, oy, thick, oh);      // direita

  // Letra "C" (outline sem lado direito)
  const cx = Math.round(18 * s), cy = oy;
  const cw = Math.round(10 * s), ch = oh;
  fillRect(cx, cy, cw, thick);                   // topo
  fillRect(cx, cy + ch - thick, cw, thick);       // base
  fillRect(cx, cy, thick, ch);                     // esquerda
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

  // Salvar PNG individual (útil para o Electron)
  if (size === 256) {
    fs.writeFileSync(path.join(assetsDir, 'icon.png'), png);
    console.log(`  icon.png (${size}x${size}) — ${png.length} bytes`);
  }
  if (size === 32) {
    fs.writeFileSync(path.join(assetsDir, 'icon-32.png'), png);
  }
  if (size === 16) {
    fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), png);
  }
}

// ICO com todas as resoluções
const ico = createICO(images);
fs.writeFileSync(path.join(assetsDir, 'icon.ico'), ico);
console.log(`  icon.ico — ${ico.length} bytes (${sizes.join(', ')}px)`);

console.log('\nIcones gerados com sucesso em assets/');
