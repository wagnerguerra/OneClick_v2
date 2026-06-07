/**
 * Gera os ícones do app mobile OneClick ERP em alta resolução (1024) a partir
 * de desenho vetorial (sem dependências) — mesma identidade do launcher:
 * gradiente sky (azure) + anel "O" branco com nó central.
 *
 * Saídas em apps/mobile/assets/images/:
 *   - icon.png (1024)                 → ícone iOS/legacy (sky + glyph, cantos arredondados)
 *   - android-icon-foreground.png     → glyph branco em transparente (safe zone do adaptive)
 *   - android-icon-background.png     → fundo sky sólido (gradiente)
 *   - android-icon-monochrome.png     → glyph branco em transparente (themed icon)
 *   - splash-icon.png (1024)          → glyph branco em transparente (splash azul)
 *   - favicon.png (256)               → ícone web
 *
 * Rodar: node scripts/gen-mobile-icon.js
 */
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// ─── PNG (RGBA) ───────────────────────────────────────────────
const CRC = new Uint32Array(256)
for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c }
function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 }
function chunk(type, data) { const t = Buffer.from(type, 'ascii'); const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, cr]) }
function pngFromPixels(w, h, px) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  const rb = 1 + w * 4; const raw = Buffer.alloc(h * rb)
  for (let y = 0; y < h; y++) { raw[y * rb] = 0; px.copy(raw, y * rb + 1, y * w * 4, (y + 1) * w * 4) }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))])
}

// ─── Cores (sky/azure) ────────────────────────────────────────
const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]
const lerp = (a, b, t) => a + (b - a) * t
const mix = (c1, c2, t) => [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))]
const SKY_LIGHT = hex('#38bdf8'), SKY_MAIN = hex('#0ea5e9'), SKY_DEEP = hex('#0369a1'), WHITE = [255, 255, 255]

// ssFactor = supersampling pra antialias suave
function render(size, { bg = true, rounded = true, ringScale = 0.34, dot = true, ss = 4 } = {}) {
  const S = size * ss
  const px = Buffer.alloc(S * S * 4)
  const radius = S * 0.225        // canto arredondado
  const center = (S - 1) / 2
  const ringOuter = S * ringScale
  const ringInner = ringOuter * 0.62
  const dotR = ringOuter * 0.22
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4
    // máscara de canto arredondado (só quando há fundo)
    let alpha = 255
    if (bg && rounded) {
      const dx = Math.min(x, S - 1 - x), dy = Math.min(y, S - 1 - y)
      if (dx < radius && dy < radius) { const d = Math.hypot(radius - dx, radius - dy); if (d > radius) alpha = 0; else if (d > radius - 1) alpha = Math.round(255 * (radius - d)) }
    }
    let r, g, b, a = bg ? alpha : 0
    if (bg) { const t = (x + y) / (2 * S); const c = t < 0.5 ? mix(SKY_LIGHT, SKY_MAIN, t * 2) : mix(SKY_MAIN, SKY_DEEP, (t - 0.5) * 2); r = c[0]; g = c[1]; b = c[2] }
    else { r = 255; g = 255; b = 255 }
    // glyph: anel O + nó
    const dist = Math.hypot(x - center, y - center)
    let glyph = 0
    if (dist >= ringInner && dist <= ringOuter) glyph = 1
    else if (dist > ringOuter && dist < ringOuter + 1.5) glyph = (ringOuter + 1.5 - dist) / 1.5
    else if (dist > ringInner - 1.5 && dist < ringInner) glyph = (dist - (ringInner - 1.5)) / 1.5
    if (dot) { if (dist <= dotR) glyph = 1; else if (dist > dotR && dist < dotR + 1.5) glyph = Math.max(glyph, (dotR + 1.5 - dist) / 1.5) }
    if (glyph > 0) {
      if (bg) { r = Math.round(lerp(r, WHITE[0], glyph)); g = Math.round(lerp(g, WHITE[1], glyph)); b = Math.round(lerp(b, WHITE[2], glyph)) }
      else { r = 255; g = 255; b = 255; a = Math.max(a, Math.round(255 * glyph)) }
    }
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a
  }
  // downsample (premultiplicado)
  const dst = Buffer.alloc(size * size * 4); const spp = ss * ss
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) { const si = ((y * ss + sy) * S + (x * ss + sx)) * 4; const sa = px[si + 3]; r += px[si] * sa / 255; g += px[si + 1] * sa / 255; b += px[si + 2] * sa / 255; a += sa }
    const di = (y * size + x) * 4; a /= spp
    if (a > 0) { dst[di] = Math.round((r / spp) * 255 / a); dst[di + 1] = Math.round((g / spp) * 255 / a); dst[di + 2] = Math.round((b / spp) * 255 / a); dst[di + 3] = Math.round(a) }
  }
  return dst
}

const dir = path.join(__dirname, '..', 'apps', 'mobile', 'assets', 'images')
fs.mkdirSync(dir, { recursive: true })
const save = (name, w, h, px) => { fs.writeFileSync(path.join(dir, name), pngFromPixels(w, h, px)); console.log('  ', name, `${w}x${h}`) }

// Ícone cheio (sky + glyph) — iOS/legacy
save('icon.png', 1024, 1024, render(1024, { bg: true, rounded: true, ringScale: 0.34 }))
// Adaptive: foreground (glyph branco transparente, menor p/ safe zone) + background sky
save('android-icon-foreground.png', 1024, 1024, render(1024, { bg: false, ringScale: 0.22 }))
save('android-icon-background.png', 1024, 1024, render(1024, { bg: true, rounded: false, ringScale: 0, dot: false }))
save('android-icon-monochrome.png', 1024, 1024, render(1024, { bg: false, ringScale: 0.22 }))
// Splash (glyph branco transparente — fundo azul vem do app.json)
save('splash-icon.png', 1024, 1024, render(1024, { bg: false, ringScale: 0.30 }))
// Favicon
save('favicon.png', 256, 256, render(256, { bg: true, rounded: true, ringScale: 0.34 }))
console.log('Ícones OneClick gerados em apps/mobile/assets/images/')
