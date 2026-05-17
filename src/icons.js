'use strict';
const zlib = require('zlib');

// ─── Minimal PNG encoder (no deps) ──────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = (c >>> 8) ^ CRC_TABLE[(c ^ b) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const tb  = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4);
  const crc = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([tb, data])), 0);
  return Buffer.concat([len, tb, data, crc]);
}

function buildPNG(rgba, w, h) {
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.allocUnsafe(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // None filter
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * (1 + w * 4) + 1 + x * 4;
      raw[di] = rgba[si]; raw[di+1] = rgba[si+1];
      raw[di+2] = rgba[si+2]; raw[di+3] = rgba[si+3];
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Shape helpers ───────────────────────────────────────────────────────────

function px(buf, w, x, y) {
  const i = (y * w + x) * 4;
  buf[i] = 0; buf[i+1] = 0; buf[i+2] = 0; buf[i+3] = 255;
}

function ptInTri(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}

function makePlayPixels(size) {
  const buf = new Uint8Array(size * size * 4);
  const pad = Math.round(size * 0.21);
  // triangle: (pad, pad) → (pad, size-pad) → (size-pad, size/2)
  const ax = pad, ay = pad;
  const bx = pad, by = size - pad;
  const cx = size - pad, cy = size / 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (ptInTri(x + 0.5, y + 0.5, ax, ay, bx, by, cx, cy))
        px(buf, size, x, y);
  return buf;
}

function makePausePixels(size) {
  const buf  = new Uint8Array(size * size * 4);
  const barW = Math.round(size * 0.22);
  const top  = Math.round(size * 0.18);
  const bot  = Math.round(size * 0.82);
  const mid  = size / 2;
  const gap  = Math.round(size * 0.09);
  const l1 = Math.round(mid - gap - barW), r1 = Math.round(mid - gap);
  const l2 = Math.round(mid + gap),        r2 = Math.round(mid + gap + barW);
  for (let y = top; y < bot; y++) {
    for (let x = l1; x < r1; x++) px(buf, size, x, y);
    for (let x = l2; x < r2; x++) px(buf, size, x, y);
  }
  return buf;
}

// ─── Public API ──────────────────────────────────────────────────────────────

function makeIcon(pixelsFn, ptSize = 22) {
  const { nativeImage } = require('electron');
  const scale = 2;
  const side  = ptSize * scale;
  const pixels = pixelsFn(side);
  const png  = buildPNG(pixels, side, side);
  const img  = nativeImage.createFromDataURL('data:image/png;base64,' + png.toString('base64'));
  img.setTemplateImage(true);
  return img;
}

module.exports = {
  createPlayIcon:  () => makeIcon(makePlayPixels),
  createPauseIcon: () => makeIcon(makePausePixels),
};
