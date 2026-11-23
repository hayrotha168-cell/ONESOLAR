// Builds every logo/icon asset from the original artwork in public/logo.png (green on white).
// Run after replacing the logo: `node scripts/make-icons.mjs`
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const pub = (p) => fileURLToPath(new URL(`../public/${p}`, import.meta.url));
const GREEN = [0x2b, 0xbd, 0x7e];

// 1. White background → transparency, keeping anti-aliased edges smooth.
const { data, info } = await sharp(pub('logo.png')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const rgba = Buffer.alloc(width * height * 4);
const minGreen = Math.min(...GREEN);
for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
  const lo = Math.min(data[i], data[i + 1], data[i + 2]);
  const a = Math.max(0, Math.min(1, (255 - lo) / (255 - minGreen)));
  rgba[j] = GREEN[0]; rgba[j + 1] = GREEN[1]; rgba[j + 2] = GREEN[2];
  rgba[j + 3] = Math.round(a * 255);
}
const transparent = sharp(rgba, { raw: { width, height, channels: 4 } });
await transparent.clone().png().toFile(pub('logo-transparent.png'));

// 2. Find the house mark: everything above the gap between the artwork and the "ONE SOLAR" text.
const rowHasInk = (y) => { for (let x = 0; x < width; x++) if (rgba[(y * width + x) * 4 + 3] > 40) return true; return false; };
let top = 0; while (top < height && !rowHasInk(top)) top++;
let bottom = top; while (bottom < height && rowHasInk(bottom)) bottom++; // first empty row after the mark
let left = width, right = 0;
for (let y = top; y < bottom; y++) for (let x = 0; x < width; x++) {
  if (rgba[(y * width + x) * 4 + 3] > 40) { left = Math.min(left, x); right = Math.max(right, x); }
}
const box = { left, top, width: right - left + 1, height: bottom - top };
console.log('mark box', box);
const mark = await transparent.clone().extract(box).png().toBuffer();

// Header mark (transparent, retina-ready).
await sharp(mark).resize({ height: 144 }).png().toFile(pub('logo-mark.png'));

// 3. App icons: mark centred on white.
async function icon(file, size, markScale, radius) {
  const target = Math.round(size * markScale);
  const m = await sharp(mark).resize(target, target, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  const bg = radius
    ? Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`)
    : { create: { width: size, height: size, channels: 4, background: '#ffffff' } };
  const base = radius ? sharp(bg) : sharp(bg);
  await base.composite([{ input: m, gravity: 'center' }]).png().toFile(pub(`icons/${file}`));
  console.log('wrote', file);
}
await icon('icon-192.png', 192, 0.72, 42);
await icon('icon-512.png', 512, 0.72, 112);
await icon('apple-touch-icon.png', 180, 0.7, 0); // iOS rounds the corners itself
await icon('icon-maskable-512.png', 512, 0.58, 0); // inside the 80 % safe zone
await icon('favicon-48.png', 48, 0.86, 10);
