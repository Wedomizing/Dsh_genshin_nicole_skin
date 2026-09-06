import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const original = resolve(root, 'assets/nicole-pv-frames');
const output = resolve(root, 'assets/nicole-pv-clean');
const manifest = JSON.parse(await readFile(resolve(original, 'manifest.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const crop = { left: 0, top: 108, width: 1920, height: 864 };
const frames = [];
const tiles = [];
await mkdir(output, { recursive: true });
for (const [index, frame] of manifest.frames.entries()) {
  const source = await readFile(resolve(original, frame.file));
  if (hash(source) !== frame.sha256) throw new Error(`Original frame changed: ${frame.file}`);
  const png = frame.file;
  const webp = png.replace(/\.png$/, '.webp');
  const clean = await sharp(source).extract(crop).png().toBuffer();
  await writeFile(resolve(output, png), clean);
  const compressed = await sharp(clean).webp({ quality: 94, effort: 6 }).toBuffer();
  await writeFile(resolve(output, webp), compressed);
  frames.push({ order: frame.order, timestamp: frame.requestedTimestamp, requestedSeconds: frame.requestedSeconds,
    sourceFile: frame.file, sourceSha256: frame.sha256, png, pngSha256: hash(clean), webp, webpSha256: hash(compressed) });
  const preview = await sharp(clean).resize(480, 216).toBuffer();
  const label = Buffer.from(`<svg width="480" height="36"><rect width="480" height="36" fill="#20232c"/><text x="14" y="25" font-family="Arial" font-size="18" fill="#efe3c2">${String(frame.order).padStart(2, '0')} / ${frame.requestedTimestamp}</text></svg>`);
  const left = 20 + (index % 3) * 500;
  const top = 20 + Math.floor(index / 3) * 272;
  tiles.push({ input: preview, left, top }, { input: label, left, top: top + 216 });
}
await sharp({ create: { width: 1520, height: 1380, channels: 3, background: '#11131a' } })
  .composite(tiles).jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(resolve(output, 'contact-sheet.jpg'));
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ source: manifest.source.url, crop,
  processing: 'Remove 108 px from top and bottom; retain original interior pixels. Lossless PNG masters and quality-94 WebP delivery copies. No repainting.', frames }, null, 2) + '\n');
console.log(`Prepared ${frames.length} cropped PNG masters and WebP delivery images (${crop.width}x${crop.height}).`);
