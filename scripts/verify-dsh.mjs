import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

// This script only installs/removes the skin in the project's disposable DSH_HOME.
const root = resolve(import.meta.dirname, '..');
const lite = process.argv.includes('--lite');
const project = lite ? resolve(root, 'lite') : root;
const port = lite ? 3092 : 3091;
const cli = resolve(root, '.lab/runtime/node_modules/@deepseek-ai/dsh/lib/bin.js');
const playwright = resolve(root, 'node_modules/@playwright/test/cli.js');
const pkg = JSON.parse(await readFile(resolve(project, 'package.json'), 'utf8'));
const artifact = resolve(project, `release/${pkg.name}-${pkg.version}.tgz`);
const artifactHash = createHash('sha256').update(await readFile(artifact)).digest('hex');
const installArtifact = resolve(root, `.lab/verified-packages/${pkg.name}-${artifactHash.slice(0, 16)}.tgz`);
await mkdir(resolve(root, '.lab/verified-packages'), { recursive: true });
await copyFile(artifact, installArtifact);
const env = {
  ...process.env,
  DSH_HOME: resolve(root, `.lab/${lite ? 'lite' : 'full'}-${pkg.version}-home`),
  npm_config_cache: resolve(root, '.lab/npm-cache'),
};

async function run(args, extraEnv = {}) {
  const child = spawn(process.execPath, args, { cwd: project, env: { ...env, ...extraEnv }, stdio: 'inherit', windowsHide: true });
  const [code] = await once(child, 'exit');
  if (code !== 0) throw new Error(`Verification command exited ${code}: ${args.filter((arg) => !arg.includes('token=')).join(' ')}`);
}

async function boot() {
  const child = spawn(process.execPath, [cli, 'web', '--host', '127.0.0.1', '--port', String(port), '--no-open'], {
    cwd: project, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const exited = once(child, 'exit');
  let output = '';
  const url = await new Promise((accept, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('DSH did not start within 30 seconds')); }, 30000);
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`DSH exited during startup (${code})`)); });
    child.stderr.on('data', (data) => process.stderr.write(data));
    child.stdout.on('data', (data) => {
      output += data.toString();
      const match = output.match(new RegExp(`dsh web: (http://127\\.0\\.0\\.1:${port}/\\?token=[^\\s]+)`));
      if (match) { clearTimeout(timer); accept(match[1]); }
    });
  });
  console.log('Isolated DSH Web is ready.');
  return { url, async stop() { child.kill(); await exited; } };
}

let server;
try {
  // pnpm caches a tarball resolution by path; a hash name tests the current bytes.
  await run([cli, 'plugin', '--profile', 'web', 'add', installArtifact]);
  const expectedClient = await readFile(resolve(project, 'lib/client.js'));
  const installedClient = await readFile(resolve(env.DSH_HOME, `profiles/web/node_modules/${pkg.name}/lib/client.js`));
  if (!expectedClient.equals(installedClient)) throw new Error('Installed client differs from the release build');
  console.log(`Installed release SHA-256: ${artifactHash}`);
  server = await boot();
  await run([playwright, 'test', 'tests/dsh.browser.spec.mjs'], { DSH_TEST_URL: server.url });
  await server.stop();
  server = undefined;

  await run([cli, 'plugin', '--profile', 'web', 'remove', pkg.name]);
  const profile = JSON.parse(await readFile(resolve(env.DSH_HOME, 'profiles/web/package.json'), 'utf8'));
  if (profile.dependencies?.[pkg.name] || profile.dsh.profile.bundles.includes(pkg.name)) {
    throw new Error('Official uninstall left the skin registered');
  }
  server = await boot();
  await run([playwright, 'test', 'tests/uninstalled.browser.spec.mjs'], { DSH_TEST_URL: server.url });
  console.log('PASS: official installation, real-browser checks and official uninstall.');
} finally {
  if (server) await server.stop();
}
