import { build } from 'esbuild';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const { name, version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
await mkdir(join(root, 'lib'), { recursive: true });
await mkdir(join(root, 'release'), { recursive: true });
await copyFile(join(root, 'src/index.js'), join(root, 'lib/index.js'));

await build({
  absWorkingDir: root,
  entryPoints: ['src/client.js'],
  outfile: 'lib/client.js',
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  // Use DSH's shared React instance for the Settings slot, never bundle a second copy.
  external: ['react'],
  target: ['chrome111', 'firefox121', 'safari16.4'],
  loader: { '.css': 'text', '.png': 'dataurl', '.webp': 'dataurl' },
  banner: { js: `/* ${name} v${version} | MIT code; artwork attribution: ASSETS.md */\nwindow.__ModuleLoader__.load({ id: ${JSON.stringify(name)}, factory: (require) => {\nconst module = { exports: {} }; const exports = module.exports;` },
  footer: { js: '\nreturn module.exports;\n} });' },
  logLevel: 'info',
});
console.log(`Built ${name}@${version}; artwork is embedded and needs no remote server.`);
