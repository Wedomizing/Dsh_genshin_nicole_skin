import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const seconds = [17,28,40,49,55,62,77,78,86,90,91,100,104,107,111];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('all 15 clean PNGs are exact interior crops and their WebP copies decode', async () => {
  let manifest;
  try { manifest = JSON.parse(await readFile('assets/nicole-pv-clean/manifest.json', 'utf8')); } catch {}
  assert.ok(manifest, 'cropped frame assets must have a provenance manifest');
  assert.deepEqual(manifest.frames.map(frame => frame.requestedSeconds), seconds);
  for (const frame of manifest.frames) {
    const source = await readFile(`assets/nicole-pv-frames/${frame.sourceFile}`);
    const clean = await readFile(`assets/nicole-pv-clean/${frame.png}`);
    assert.equal(sha(source), frame.sourceSha256, 'original source stays unchanged');
    const expected = await sharp(source).extract({ left: 0, top: 108, width: 1920, height: 864 }).raw().toBuffer();
    const actual = await sharp(clean).raw().toBuffer();
    assert.ok(expected.equals(actual), `crop must not repaint or rescale: ${frame.png}`);
    const webp = await readFile(`assets/nicole-pv-clean/${frame.webp}`);
    const metadata = await sharp(webp).metadata();
    assert.equal(metadata.width, 1920);
    assert.equal(metadata.height, 864);
    assert.equal(sha(webp), frame.webpSha256);
    assert.equal((await sharp(webp).raw().toBuffer()).length, 1920 * 864 * 3);
  }
});
