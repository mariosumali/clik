#!/usr/bin/env node
// Generates resources/trayTemplate.png (22x22) and trayTemplate@2x.png (44x44).
// Template icons on macOS use black + alpha; the OS colours them to match the menubar.
//
// Glyph mirrors the sidebar logo: an outer square frame with a small top-left corner
// bracket centred inside.
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

// Glyph on a 22-pt grid:
//   - outer frame: 1pt stroke inset 1pt from edges (so from (1,1) to (20,20))
//   - inner bracket: 10x10 square centred, with only the top + left edges drawn at 2pt
// Scaled up for @2x.
function buildPng(size) {
  const s = size / 22;

  const frameInset = 1 * s;           // empty padding outside the frame
  const frameStroke = Math.max(1, Math.round(1 * s));
  const innerSize = 10 * s;           // side length of the inner bracket's bounding box
  const innerStroke = Math.max(1, Math.round(2 * s));

  const frameMin = frameInset;
  const frameMax = size - 1 - frameInset;

  const innerMin = (size - innerSize) / 2;
  const innerMax = innerMin + innerSize - 1;

  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(0); // filter: None
    for (let x = 0; x < size; x++) {
      let alpha = 0;

      // Outer frame (1pt stroke).
      const onLeftEdge = x >= frameMin && x < frameMin + frameStroke;
      const onRightEdge = x <= frameMax && x > frameMax - frameStroke;
      const onTopEdge = y >= frameMin && y < frameMin + frameStroke;
      const onBottomEdge = y <= frameMax && y > frameMax - frameStroke;
      const insideFrameH = x >= frameMin && x <= frameMax;
      const insideFrameV = y >= frameMin && y <= frameMax;
      if (((onLeftEdge || onRightEdge) && insideFrameV) || ((onTopEdge || onBottomEdge) && insideFrameH)) {
        alpha = 255;
      }

      // Inner corner bracket (top + left edges, 2pt stroke).
      const insideInnerH = x >= innerMin && x <= innerMax;
      const insideInnerV = y >= innerMin && y <= innerMax;
      const onInnerTop = y >= innerMin && y < innerMin + innerStroke;
      const onInnerLeft = x >= innerMin && x < innerMin + innerStroke;
      if ((onInnerTop && insideInnerH) || (onInnerLeft && insideInnerV)) {
        alpha = 255;
      }

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
