import assert from 'node:assert/strict';
import { test } from 'node:test';

// Importing conditionally lets the first red run report the missing behavior.
let createPlaylist;
try { ({ createPlaylist } = await import('../src/playlist.js')); } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

const entries = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function fixture(options = {}) {
  assert.equal(typeof createPlaylist, 'function', 'a sequential playlist controller must exist');
  let clock = 0;
  let sequence = 0;
  const timers = new Map();
  const shown = [];
  const states = [];
  const controller = createPlaylist(entries, {
    preload: async entry => entry.id,
    show: async (entry, { payload }) => { assert.equal(payload, entry.id); shown.push(entry.id); },
    onChange: state => states.push(state),
    setTimeout: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, at: clock + delay }); return id; },
    clearTimeout: id => timers.delete(id),
    ...options,
  });
  async function advance(ms) {
    const end = clock + ms;
    for (;;) {
      const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      const [id, timer] = next;
      clock = timer.at;
      timers.delete(id);
      timer.fn();
      await flush();
    }
    clock = end;
    await flush();
  }
  return { controller, shown, states, advance, timers };
}

test('default dwell is sixty seconds and the last frame loops back to the first', async () => {
  const f = fixture();
  await f.controller.ready;
  assert.deepEqual(f.shown, ['a']);
  await f.advance(59999);
  assert.deepEqual(f.shown, ['a']);
  await f.advance(1);
  await f.advance(60000);
  await f.advance(60000);
  assert.deepEqual(f.shown, ['a', 'b', 'c', 'a']);
  f.controller.dispose();
});

test('pause stops automatic rotation but next remains usable; resume restarts the dwell', async () => {
  const f = fixture();
  await f.controller.ready;
  f.controller.setPaused(true);
  await f.advance(180000);
  assert.deepEqual(f.shown, ['a']);
  await f.controller.next();
  assert.deepEqual(f.shown, ['a', 'b']);
  assert.equal(f.controller.getState().paused, true);
  f.controller.setPaused(false);
  await f.advance(59999);
  assert.deepEqual(f.shown, ['a', 'b']);
  await f.advance(1);
  assert.deepEqual(f.shown, ['a', 'b', 'c']);
  f.controller.dispose();
});

test('hidden tabs do not rotate or catch up when made visible', async () => {
  const f = fixture();
  await f.controller.ready;
  f.controller.setHidden(true);
  await f.advance(600000);
  assert.deepEqual(f.shown, ['a']);
  f.controller.setHidden(false);
  await f.advance(59999);
  assert.deepEqual(f.shown, ['a']);
  await f.advance(1);
  assert.deepEqual(f.shown, ['a', 'b']);
  f.controller.dispose();
});

test('unready next image retains the current frame and never overlaps transitions', async () => {
  let finishLoad;
  let finishFade;
  const shown = [];
  const f = fixture({
    preload: entry => entry.id === 'b' ? new Promise(resolve => { finishLoad = () => resolve('b'); }) : Promise.resolve(entry.id),
    show: async entry => { shown.push(entry.id); if (entry.id === 'b') await new Promise(resolve => { finishFade = resolve; }); },
  });
  await f.controller.ready;
  await f.advance(60000);
  assert.deepEqual(shown, ['a']);
  await f.controller.next();
  assert.deepEqual(shown, ['a']);
  finishLoad();
  await flush();
  assert.deepEqual(shown, ['a', 'b']);
  await f.advance(180000);
  assert.deepEqual(shown, ['a', 'b']);
  finishFade();
  await flush();
  await f.advance(59999);
  assert.deepEqual(shown, ['a', 'b']);
  await f.advance(1);
  assert.deepEqual(shown, ['a', 'b', 'c']);
  f.controller.dispose();
});

test('failed images are skipped without hiding the last successfully loaded image', async () => {
  const f = fixture({ preload: async entry => { if (entry.id === 'b') throw new Error('decode failure'); return entry.id; } });
  await f.controller.ready;
  await f.advance(60000);
  assert.deepEqual(f.shown, ['a', 'c']);
  f.controller.dispose();
});

test('all failing images stop safely and remain manually retryable', async () => {
  const f = fixture({ preload: async () => { throw new Error('decode failure'); } });
  await f.controller.ready;
  assert.deepEqual(f.shown, []);
  assert.equal(f.controller.getState().phase, 'error');
  assert.equal(f.timers.size, 0);
  await f.controller.next();
  assert.deepEqual(f.shown, []);
  f.controller.dispose();
});

test('disposing during a pending load prevents late DOM updates and clears timers', async () => {
  let release;
  const f = fixture({ preload: () => new Promise(resolve => { release = resolve; }) });
  await flush();
  f.controller.dispose();
  release('a');
  await f.controller.ready;
  await f.advance(600000);
  assert.deepEqual(f.shown, []);
  assert.equal(f.timers.size, 0);
});

test('restored index and paused state are respected on startup', async () => {
  const f = fixture({ initialIndex: 2, paused: true });
  await f.controller.ready;
  await f.advance(180000);
  assert.deepEqual(f.shown, ['c']);
  assert.equal(f.controller.getState().index, 2);
  f.controller.dispose();
});

test('same-tick disposal does not start an image request after teardown', async () => {
  let imageRequests = 0;
  const f = fixture({ preload: async () => { imageRequests++; return 'a'; } });
  f.controller.dispose();
  await f.controller.ready;
  assert.equal(imageRequests, 0, 'disposed playback must not start new image work');
});

// Catches reverse using forward order or JavaScript's negative remainder as an index.
test('previous cycles backward through the first/last boundary without resuming pause', async () => {
  const f = fixture({ paused: true });
  await f.controller.ready;
  await f.controller.previous();
  await f.controller.previous();
  await f.controller.previous();
  assert.deepEqual(f.shown, ['a', 'c', 'b', 'a']);
  await f.advance(600000);
  assert.equal(f.shown.length, 4);
  assert.equal(f.controller.getState().paused, true);
  f.controller.dispose();
});

test('previous skips a broken frame backward and retains the last good image', async () => {
  const f = fixture({ preload: async entry => { if (entry.id === 'c') throw new Error('decode failure'); return entry.id; } });
  await f.controller.ready;
  await f.controller.previous();
  assert.deepEqual(f.shown, ['a', 'b']);
  f.controller.dispose();
});

// Catches failure to cancel the old timer, incorrect minutes conversion, or immediate jumps.
for (const minutes of [1, 5, 10, 30, 60]) {
  test(`changing to ${minutes} minutes starts a full new dwell`, async () => {
    const f = fixture({ holdMs: 120000 });
    await f.controller.ready;
    await f.advance(30000);
    f.controller.setHoldMs(minutes * 60000);
    await f.advance(minutes * 60000 - 1);
    assert.deepEqual(f.shown, ['a']);
    await f.advance(1);
    assert.deepEqual(f.shown, ['a', 'b']);
    f.controller.dispose();
  });
}

test('a changed interval waits for an active fade, ignores extra previous clicks and then starts a full dwell', async () => {
  let finishFade;
  const f = fixture({ show: async entry => { if (entry.id === 'b') await new Promise(resolve => { finishFade = resolve; }); } });
  await f.controller.ready;
  const transition = f.controller.next();
  await flush();
  f.controller.setHoldMs(300000);
  await f.controller.previous();
  await f.advance(600000);
  assert.equal(f.controller.getState().phase, 'fading');
  assert.equal(f.controller.getState().index, 0);
  finishFade();
  await transition;
  await f.advance(299999);
  assert.equal(f.controller.getState().index, 1);
  await f.advance(1);
  assert.equal(f.controller.getState().index, 2);
  f.controller.dispose();
});

test('interval changes do not resume paused or hidden playback', async () => {
  const f = fixture({ paused: true });
  await f.controller.ready;
  f.controller.setHoldMs(300000);
  await f.advance(3600000);
  assert.deepEqual(f.shown, ['a']);
  f.controller.setHidden(true);
  f.controller.setPaused(false);
  await f.advance(3600000);
  assert.deepEqual(f.shown, ['a']);
  f.controller.setHidden(false);
  await f.advance(299999);
  assert.deepEqual(f.shown, ['a']);
  await f.advance(1);
  assert.deepEqual(f.shown, ['a', 'b']);
  f.controller.dispose();
});

test('a show() that throws skips that frame instead of wedging the player busy', async () => {
  const shown = [];
  const f = fixture({
    preload: async entry => entry.id,
    show: async entry => {
      if (entry.id === 'b') throw new Error('simulated transition failure');
      shown.push(entry.id);
    },
  });
  await f.controller.ready;
  await f.controller.next();
  assert.deepEqual(shown, ['a', 'c'], 'the throwing transition must be skipped');
  assert.equal(f.controller.getState().phase, 'idle');
  assert.equal(f.controller.getState().paused, false);
  // Automatic rotation must continue after the skipped transition.
  await f.advance(60000);
  assert.deepEqual(shown, ['a', 'c', 'a']);
  f.controller.dispose();
});

test('ensureArmed never restarts a running dwell and never starts paused or hidden playback', async () => {
  const f = fixture();
  await f.controller.ready;
  f.controller.ensureArmed();
  await f.advance(59999);
  assert.deepEqual(f.shown, ['a'], 'a running dwell must not be shortened');
  await f.advance(1);
  assert.deepEqual(f.shown, ['a', 'b']);
  f.controller.setPaused(true);
  f.controller.ensureArmed();
  await f.advance(180000);
  assert.deepEqual(f.shown, ['a', 'b'], 'ensureArmed must respect the pause');
  f.controller.setPaused(false);
  f.controller.ensureArmed();
  await f.advance(59999);
  assert.deepEqual(f.shown, ['a', 'b']);
  await f.advance(1);
  assert.deepEqual(f.shown, ['a', 'b', 'c']);
  f.controller.dispose();
});
