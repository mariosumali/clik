#!/usr/bin/env node
// Builds resources/Clik.icns from the same glyph as the sidebar logo + tray template:
// outer square frame with a small top-left corner bracket inside (brutalist CLIK mark).
// Background: --color-ink, strokes: --color-cream (see src/renderer/src/styles.css).
import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const iconsetDir = resolve(root, 'resources', 'Clik.iconset');
const icnsOut = resolve(root, 'resources', 'Clik.icns');

const INK = { r: 0x0b, g: 0x0b, b: 0x0b, a: 255 };
const CREAM = { r: 0xef, g: 0xea, b: 0xdd, a: 255 };

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
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

/** Same 22×22 grid geometry as native/build-tray-icon.mjs, rendered in color. */
function buildPng(size) {
  const s = size / 22;

  const frameInset = 1 * s;
  const frameStroke = Math.max(1, Math.round(1 * s));
  const innerSize = 10 * s;
  const innerStroke = Math.max(1, Math.round(2 * s));

  const frameMin = frameInset;
  const frameMax = size - 1 - frameInset;

  const innerMin = (size - innerSize) / 2;
  const innerMax = innerMin + innerSize - 1;

  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(0);
    for (let x = 0; x < size; x++) {
      let onStroke = false;

      const onLeftEdge = x >= frameMin && x < frameMin + frameStroke;
      const onRightEdge = x <= frameMax && x > frameMax - frameStroke;
      const onTopEdge = y >= frameMin && y < frameMin + frameStroke;
      const onBottomEdge = y <= frameMax && y > frameMax - frameStroke;
      const insideFrameH = x >= frameMin && x <= frameMax;
      const insideFrameV = y >= frameMin && y <= frameMax;
      if (((onLeftEdge || onRightEdge) && insideFrameV) || ((onTopEdge || onBottomEdge) && insideFrameH)) {
        onStroke = true;
      }

      const insideInnerH = x >= innerMin && x <= innerMax;
      const insideInnerV = y >= innerMin && y <= innerMax;
      const onInnerTop = y >= innerMin && y < innerMin + innerStroke;
      const onInnerLeft = x >= innerMin && x < innerMin + innerStroke;
      if ((onInnerTop && insideInnerH) || (onInnerLeft && insideInnerV)) {
        onStroke = true;
      }

      const c = onStroke ? CREAM : INK;
      rows.push(c.r, c.g, c.b, c.a);
    }
  }
  const raw = Buffer.from(rows);
  const idat = deflateSync(raw, { level: 9 });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

const ICONSET = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

if (existsSync(iconsetDir)) rmSync(iconsetDir, { recursive: true });
mkdirSync(iconsetDir, { recursive: true });

for (const [name, dim] of ICONSET) {
  const png = buildPng(dim);
  writeFileSync(resolve(iconsetDir, name), png);
}

if (process.platform !== 'darwin') {
  console.warn('[app-icon] skipping Clik.icns (iconutil requires macOS); packager will use default icon.');
  process.exit(0);
}

execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsOut], { stdio: 'inherit' });
console.log(`[app-icon] wrote ${icnsOut}`);
