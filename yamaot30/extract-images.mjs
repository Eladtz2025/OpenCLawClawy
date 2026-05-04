#!/usr/bin/env node
// Extracts each numbered sign image from sign.pdf into its own PNG buffer.
// Outputs image-crops.json (mapping image-num → base64 PNG).
//
// Approach:
//   1. Use pdfjs-dist to scan every page for numeric labels (1..100) and
//      record (page, x, y) in PDF user-space coordinates.
//   2. Use mupdf to render each page to a high-res PNG buffer.
//   3. For each image number, take the FIRST occurrence on pages 3-9 (the
//      image grid pages — pages 10-16 are textual indexes).
//   4. Crop a fixed-size box around the label position. PDF y-axis is
//      bottom-up; pixel y is top-down. The image sits *above* the label.
//   5. Use mupdf's pixmap → asPNG to crop and save.

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as mupdfjs from 'mupdf';
import fs from 'fs';
import path from 'path';

const PDF_PATH = 'C:/Users/Itzhak/AppData/Local/Temp/yamaot30/sign.pdf';
const OUT_PATH = path.resolve('image-crops.json');

const SCALE = 2.5;          // render PDF at 2.5x for clarity
// Grid: labels at x = 86, 214, 343, 472 → 128pt apart.
// Use 115pt cell width / 115pt height to keep a tight margin without
// visible bleed from adjacent cells.
const CELL_W_PT = 115;
const CELL_H_PT = 115;
const LABEL_PAD_PT = 14;    // include the תמונה N label below the image

const buf = fs.readFileSync(PDF_PATH);

// 1. Scan for label positions
console.log('scanning labels via pdfjs...');
const data = new Uint8Array(buf);
const pdfdoc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
const labelsByImage = {};
for (let p = 1; p <= pdfdoc.numPages; p++) {
  const page = await pdfdoc.getPage(p);
  const vp = page.getViewport({ scale: 1 });
  const txt = await page.getTextContent();
  for (const item of txt.items) {
    const s = item.str.trim();
    if (/^\d{1,3}$/.test(s)) {
      const n = Number(s);
      if (n < 1 || n > 100) continue;
      if (!labelsByImage[n]) labelsByImage[n] = [];
      labelsByImage[n].push({
        page: p, x: item.transform[4], y: item.transform[5],
        pageW: vp.width, pageH: vp.height
      });
    }
  }
}
console.log('  found', Object.keys(labelsByImage).length, 'distinct numbers');

// 2. Pick the FIRST occurrence on pages 3-9 (image grid pages)
const imageGridPages = new Set([3, 4, 5, 6, 7, 8, 9]);
const chosenLocations = {};
for (const [n, locs] of Object.entries(labelsByImage)) {
  const grid = locs.filter(l => imageGridPages.has(l.page));
  if (!grid.length) continue;
  // For pages with the same image (rare), take the smallest page #
  grid.sort((a, b) => a.page - b.page);
  chosenLocations[n] = grid[0];
}
console.log('  grid-page locations:', Object.keys(chosenLocations).length);

// 3. Render each page once via mupdf
const mupdfDoc = mupdfjs.PDFDocument.openDocument(buf, 'application/pdf');
const pageCache = {};
function getPagePixmap(pageNum) {
  if (pageCache[pageNum]) return pageCache[pageNum];
  console.log('  rendering page', pageNum);
  const p = mupdfDoc.loadPage(pageNum - 1);
  const matrix = mupdfjs.Matrix.scale(SCALE, SCALE);
  const pix = p.toPixmap(matrix, mupdfjs.ColorSpace.DeviceRGB, false, true);
  return (pageCache[pageNum] = { pix, page: p });
}

// 4. For each image, crop a box around the label
const out = {};
let count = 0;
for (const [n, loc] of Object.entries(chosenLocations).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const { pix, page } = getPagePixmap(loc.page);
  const pageH = loc.pageH;
  // Center of label in pixels
  const labelPx = loc.x * SCALE;
  const labelPy = (pageH - loc.y) * SCALE;
  // Crop box:
  //   horizontally centered on label
  //   vertically: from above label down to (label + small padding to capture the number)
  const halfW = (CELL_W_PT * SCALE) / 2;
  const cropX = Math.max(0, Math.round(labelPx - halfW));
  const cropY = Math.max(0, Math.round(labelPy - CELL_H_PT * SCALE));
  const cropW = Math.min(pix.getWidth() - cropX, Math.round(CELL_W_PT * SCALE));
  const cropH = Math.min(pix.getHeight() - cropY, Math.round((CELL_H_PT + LABEL_PAD_PT) * SCALE));
  // mupdf expects bbox in pixels relative to the pixmap origin (top-left)
  const subPix = pix.warp(
    [
      [cropX, cropY],
      [cropX + cropW, cropY],
      [cropX + cropW, cropY + cropH],
      [cropX, cropY + cropH]
    ],
    cropW,
    cropH
  );
  const png = subPix.asPNG();
  out[n] = 'data:image/png;base64,' + Buffer.from(png).toString('base64');
  subPix.destroy?.();
  count++;
  if (count % 20 === 0) console.log('  cropped', count);
}

console.log('cropped', Object.keys(out).length, 'images');
fs.writeFileSync(OUT_PATH, JSON.stringify(out));
const stat = fs.statSync(OUT_PATH);
console.log('wrote', OUT_PATH, '(', (stat.size / 1024).toFixed(1), 'KB)');
console.log('average per image:', (stat.size / Object.keys(out).length / 1024).toFixed(1), 'KB');
