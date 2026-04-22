#!/usr/bin/env node
/**
 * Regenerates every brand asset from the canonical "P" glyph in one pass:
 *
 *   - public/logo.svg        — transparent + purple P (standalone mark)
 *   - public/favicon.svg     — transparent + purple P (browser tab)
 *   - public/favicon.png     — 256x256 raster of favicon.svg
 *   - public/icons/icon-*.svg (72..512)  — white rounded-square bg + purple P
 *   - public/icons/icon-*.png (72..512)  — PNG raster of each SVG
 *
 * Run with `node scripts/generate-icons.mjs` after editing BRAND_COLOR or
 * the path data. Needs the `sharp` dep, which is already in devDependencies.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PUBLIC = resolve(ROOT, 'public');
const ICONS_DIR = resolve(PUBLIC, 'icons');
mkdirSync(ICONS_DIR, { recursive: true });

const BRAND_COLOR = '#5C3FFC';
// White app-icon tile, with slight rounded corners — matches the raster
// reference shipped by the user.
const TILE_BG = '#FFFFFF';

// The "P" glyph as two vector paths, rendered inside a 500x500 viewBox with
// a matrix flip (scale -0.1 on Y) so the potrace-style path coordinates
// display right-side up.
const GLYPH_PATHS = `
    <path d="M2037 3800 c-104 -40 -191 -134 -231 -250 -23 -67 -20 -82 22 -109 31 -20 287 -177 1009 -618 40 -24 82 -56 93 -70 27 -34 27 -102 0 -136 -11 -13 -106 -78 -212 -143 -106 -64 -201 -124 -210 -132 -16 -14 -18 -41 -18 -302 0 -291 2 -310 38 -310 16 0 267 148 610 359 180 111 270 173 310 213 216 217 215 574 -3 793 -37 38 -107 89 -185 136 -69 42 -253 154 -410 249 -434 264 -509 307 -563 326 -57 20 -191 17 -250 -6z"/>
    <path d="M1803 2994 c-10 -5 -13 -156 -13 -709 0 -671 1 -706 20 -767 27 -89 93 -184 167 -240 89 -67 157 -90 281 -96 92 -4 105 -2 117 14 12 16 14 134 15 735 0 669 -1 718 -17 737 -20 23 -514 322 -541 327 -9 2 -23 2 -29 -1z"/>
`.trim();

/** Glyph-only SVG — transparent background, purple fill. */
function standaloneSvg(size = 500) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="${size}" height="${size}">
  <g transform="translate(0 500) scale(0.1 -0.1)" fill="${BRAND_COLOR}">
    ${GLYPH_PATHS}
  </g>
</svg>
`;
}

/**
 * App-icon tile — white rounded square bg + centered purple P at ~52% scale.
 * The tile rounding and 24% padding around the glyph are tuned to feel
 * right on both light and dark home-screen backgrounds.
 */
function tileSvg(size) {
  // Target viewBox is size×size so raster output maps 1:1. Glyph is 500×500
  // with its own viewBox; we translate + scale it into a centered 56%-wide
  // square.
  const padding = Math.round(size * 0.22);
  const inner = size - 2 * padding;
  const rx = Math.round(size * 0.22); // squircle-ish rounding
  // Glyph is 500 units; scale to `inner` pixels.
  const scale = (inner / 500).toFixed(4);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="${TILE_BG}"/>
  <g transform="translate(${padding} ${padding}) scale(${scale})">
    <g transform="translate(0 500) scale(0.1 -0.1)" fill="${BRAND_COLOR}">
      ${GLYPH_PATHS}
    </g>
  </g>
</svg>
`;
}

async function writeSvgAndPng(svgPath, pngPath, svgContent, pngSize) {
  writeFileSync(svgPath, svgContent, 'utf8');
  await sharp(Buffer.from(svgContent))
    .resize(pngSize, pngSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(pngPath);
  console.log(`wrote ${svgPath}`);
  console.log(`wrote ${pngPath}`);
}

async function main() {
  // 1. Standalone mark
  writeFileSync(resolve(PUBLIC, 'logo.svg'), standaloneSvg(500), 'utf8');
  console.log('wrote public/logo.svg');

  // Raster logo.png (matches the user-provided reference at 500×500)
  await sharp(Buffer.from(standaloneSvg(500)))
    .resize(500, 500)
    .png()
    .toFile(resolve(PUBLIC, 'logo.png'));
  console.log('wrote public/logo.png');

  // 2. favicon.svg (transparent, tab-friendly) + favicon.png
  writeFileSync(resolve(PUBLIC, 'favicon.svg'), standaloneSvg(32), 'utf8');
  console.log('wrote public/favicon.svg');
  await sharp(Buffer.from(standaloneSvg(256)))
    .resize(256, 256)
    .png()
    .toFile(resolve(PUBLIC, 'favicon.png'));
  console.log('wrote public/favicon.png');

  // 3. PWA icons — rounded-tile variant at every PWA-manifest size.
  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
  for (const size of sizes) {
    const svgPath = resolve(ICONS_DIR, `icon-${size}x${size}.svg`);
    const pngPath = resolve(ICONS_DIR, `icon-${size}x${size}.png`);
    await writeSvgAndPng(svgPath, pngPath, tileSvg(size), size);
  }

  // 4. Template mirror so future bg/rounding tweaks start from one file.
  writeFileSync(resolve(ICONS_DIR, 'icon-template.svg'), tileSvg(512), 'utf8');
  console.log('wrote public/icons/icon-template.svg');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
