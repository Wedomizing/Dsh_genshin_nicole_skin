import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const root = resolve(import.meta.dirname, '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function untar(archive) {
  const tar = gunzipSync(archive), files = new Map();
  for (let at = 0; at + 512 <= tar.length && tar[at] !== 0;) {
    const name = tar.subarray(at, at + 100).toString().split('\0')[0];
    const size = parseInt(tar.subarray(at + 124, at + 136).toString().replace(/\0/g, '').trim(), 8) || 0;
    if (tar[at + 156] === 48 || tar[at + 156] === 0) files.set(name, tar.subarray(at + 512, at + 512 + size));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

const current = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
const packages = [[root, current.name, current.version, 14, 'webp']];
if (existsSync(resolve(root, 'lite/package.json'))) {
  const lite = JSON.parse(await readFile(resolve(root, 'lite/package.json'), 'utf8'));
  packages.push([resolve(root, 'lite'), lite.name, lite.version, 1, 'png']);
}
for (const [directory, name, version, imageCount, imageType] of packages) {
  const path = resolve(directory, `release/${name}-${version}.tgz`);
  const archive = await readFile(path), files = untar(archive);
  const expected = ['LICENSE', 'ASSETS.md', 'README.md', 'cordis.patch.yml', 'package.json', 'lib/index.js', 'lib/client.js'];
  assert.deepEqual([...files.keys()].sort(), expected.map(file => `package/${file}`).sort());
  for (const file of expected) assert.ok(files.get(`package/${file}`).equals(await readFile(resolve(directory, file))), `${name}: stale ${file}`);
  const client = files.get('package/lib/client.js').toString();
  assert.equal((client.match(new RegExp(`data:image/${imageType};base64,`, 'g')) ?? []).length, imageCount);
  if (imageType === 'webp') {
    const removed = await readFile(resolve(root, 'assets/nicole-pv-clean/nicole-pv-09-01m26s.webp'));
    assert.equal(client.includes(removed.toString('base64')), false, 'removed frame must not be distributed');
  }
  console.log(`${name}@${version}: ${archive.length} bytes, ${imageCount} embedded images, SHA256 ${hash(archive)}`);
}

// Historical versions must not have been overwritten by either new build.
for (const [name, want] of [
  ['dsh-skin-genshin-nicole-0.1.0.tgz', 'd306b4a0a3084e69564b9c51916ecfa6ec809ea2fe231bde0680d3bc32fb3188'],
  ['dsh-skin-genshin-nicole-0.1.0-source.zip', '3ed89f7bc501a31cfce3fe36a95f07053c488edc582a313f2bd15905e5313c6e'],
  ['dsh-skin-genshin-nicole-0.2.0.tgz', 'efc1f35528e61cde86162a75ae5b5f9b3220ed02444ce84ca1a37bd250ec1fa9'],
  ['dsh-skin-genshin-nicole-0.2.0-source.zip', 'd90e3e1b60d87d6d2bd0a46035c9900694f0304d0e01a765ea93c655763cff57'],
  ['dsh-skin-genshin-nicole-0.3.0.tgz', 'ad48786c5ca5fc2e7a587a4e20330da2e8418a6a846bd54945247cf71a7ebef3'],
  ['dsh-skin-genshin-nicole-0.3.0-source.zip', 'e5626606ad34aaa7327733d8844054b0fb1330b239194c0ea1628d7f846b244e'],
]) {
  const file = resolve(root, 'release', name);
  // Historical archives are local backups, not part of a clean repository clone.
  if (!existsSync(file)) continue;
  assert.equal(hash(await readFile(file)), want, `historical artifact changed: ${name}`);
  console.log(`Historical artifact unchanged: ${name} (${(await stat(file)).size} bytes)`);
}
