#!/usr/bin/env node
// Generates resources/trayTemplate.png (22x22) and trayTemplate@2x.png (44x44).
// Template icons on macOS use black + alpha; the OS colours them to match the menubar.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, '..', 'resources');
mkdirSync(outDir, { recursive: true });

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ crcTable[(c ^ buf[i]) & 0xff];
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

function buildPng(size) {
  const scale = size / 22; // base glyph designed on a 22pt grid
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const ringR = 8 * scale;
  const ringW = Math.max(1, 1 * scale);
  const armStart = 3.2 * scale;
  const armEnd = 7.2 * scale;
  const armW = Math.max(1, 1 * scale);
  const centerR = 1.1 * scale;

  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(0); // filter: None
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const r = Math.hypot(dx, dy);
      let alpha = 0;
      // ring
      if (Math.abs(r - ringR) <= ringW / 2) alpha = 255;
      // center dot
      if (r <= centerR) alpha = 255;
      // crosshair arms (top/bottom/left/right), not extending into the ring
      const ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax <= armW / 2 && ay >= armStart && ay <= armEnd) alpha = 255;
      if (ay <= armW / 2 && ax >= armStart && ax <= armEnd) alpha = 255;
      rows.push(0, 0, 0, alpha);
    }
  }
  const raw = Buffer.from(rows);
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const png1x = buildPng(22);
const png2x = buildPng(44);
writeFileSync(resolve(outDir, 'trayTemplate.png'), png1x);
writeFileSync(resolve(outDir, 'trayTemplate@2x.png'), png2x);
console.log(`[tray-icon] wrote ${png1x.length}B (22px) + ${png2x.length}B (44px)`);
