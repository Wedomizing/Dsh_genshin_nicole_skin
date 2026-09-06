import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Recreates the disposable runtime manifest excluded from source archives.
const path = resolve(import.meta.dirname, '../.lab/runtime');
await mkdir(path, { recursive: true });
await writeFile(resolve(path, 'package.json'), `${JSON.stringify({
  name: 'nicole-skin-dsh-verification-runtime',
  private: true,
  dependencies: { '@deepseek-ai/dsh': '0.1.2-rc.1' },
}, null, 2)}\n`);
console.log('Created .lab/runtime/package.json. Run npm install --prefix .lab/runtime.');
