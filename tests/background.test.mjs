import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { mountBackground } from '../src/background.js';
import { createIntervalPreference } from '../src/preferences.js';

const frames = [{ src: 'data:image/png;base64,first', timestamp: '00:17' }, { src: 'data:image/png;base64,second', timestamp: '00:28' }];
const css = '[data-nicole-background] { pointer-events: none; position: fixed; }';
const storageKey = 'dsh-skin-genshin-nicole.playlist.v1';
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };

function fixture() {
  return new JSDOM('<!doctype html><html><head><title>DSH</title></head><body data-ds-dark-theme=""><main id="root"><textarea aria-label="Message">draft</textarea></main></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
}

function options(doc) {
  // JSDOM cannot decode images: substitute only that browser boundary.
  return { preload: async entry => { const img = doc.createElement('img'); img.src = entry.src; return img; } };
}

// Catches missing artwork, inaccessible decoration, or replacing the host UI.
test('mount adds the first frame without replacing the original UI', async () => {
  const dom = fixture();
  const doc = dom.window.document;
  const input = doc.querySelector('textarea');
  const cleanup = mountBackground(doc, frames, css, options(doc));
  await flush();
  const background = doc.querySelector('[data-nicole-background]');
  assert.ok(background, 'the background must be mounted');
  assert.equal(background.getAttribute('aria-hidden'), 'true');
  assert.equal(background.querySelector('img').getAttribute('src'), frames[0].src);
  assert.equal(background.querySelector('img').getAttribute('alt'), '');
  assert.equal(doc.querySelector('textarea'), input);
  assert.equal(input.value, 'draft');
  assert.equal(doc.querySelector('[data-nicole-styles]').textContent, css);
  cleanup();
  dom.window.close();
});

// Catches leaked styles, lost body attributes, or accidental host cleanup.
test('dispose restores the original document and is safe to call twice', async () => {
  const dom = fixture();
  const doc = dom.window.document;
  const before = doc.documentElement.outerHTML;
  const cleanup = mountBackground(doc, frames, css, options(doc));
  await flush();
  assert.ok(doc.body.hasAttribute('data-dsh-genshin-nicole'));
  cleanup();
  cleanup();
  assert.equal(doc.documentElement.outerHTML, before);
  dom.window.close();
});

// Catches stacked images on reload and a stale disposer removing the new skin.
test('replacement stays single and stale cleanup does not remove the replacement', async () => {
  const dom = fixture();
  const doc = dom.window.document;
  const before = doc.documentElement.outerHTML;
  const first = mountBackground(doc, frames, css, options(doc));
  await flush();
  const second = mountBackground(doc, frames, css, options(doc));
  await flush();
  first();
  assert.equal(doc.querySelectorAll('[data-nicole-background]').length, 1);
  assert.equal(doc.querySelectorAll('[data-nicole-controls]').length, 1);
  assert.equal(doc.querySelectorAll('[data-nicole-styles]').length, 1);
  assert.ok(doc.body.hasAttribute('data-dsh-genshin-nicole'));
  second();
  assert.equal(doc.documentElement.outerHTML, before);
  dom.window.close();
});

test('dispose preserves any pre-existing scope value', async () => {
  const dom = fixture();
  const doc = dom.window.document;
  doc.body.setAttribute('data-dsh-genshin-nicole', 'previous');
  const cleanup = mountBackground(doc, frames, css, options(doc));
  await flush();
  assert.equal(doc.body.getAttribute('data-dsh-genshin-nicole'), '');
  cleanup();
  assert.equal(doc.body.getAttribute('data-dsh-genshin-nicole'), 'previous');
  dom.window.close();
});

test('pause and next controls persist the current frame and playback preference', async () => {
  const dom = fixture(); const doc = dom.window.document;
  const cleanup = mountBackground(doc, frames, css, options(doc));
  await flush();
  assert.ok(doc.querySelector('[aria-label="暂停背景轮播"]'), 'pause must be accessible');
  doc.querySelector('[aria-label="暂停背景轮播"]').click();
  doc.querySelector('[aria-label="下一张背景"]').click();
  await flush();
  assert.equal(doc.querySelector('[data-nicole-background] img').getAttribute('src'), frames[1].src);
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(storageKey)), { index: 1, timestamp: '00:28', paused: true });
  cleanup();
  const again = mountBackground(doc, frames, css, options(doc));
  await flush();
  assert.equal(doc.querySelector('[data-nicole-background] img').getAttribute('src'), frames[1].src);
  assert.ok(doc.querySelector('[aria-label="继续背景轮播"]'));
  again(); dom.window.close();
});

test('reduced motion starts paused and manual next does not animate', async () => {
  const dom = fixture(); const doc = dom.window.document;
  const preference = Object.assign(new dom.window.EventTarget(), { matches: true });
  dom.window.matchMedia = () => preference;
  const cleanup = mountBackground(doc, frames, css, options(doc));
  await flush();
  assert.equal(doc.querySelector('[data-nicole-controls]').getAttribute('data-paused'), 'true');
  doc.querySelector('[aria-label="下一张背景"]').click();
  await flush();
  assert.equal(doc.querySelectorAll('[data-nicole-background] img').length, 1);
  assert.equal(doc.querySelector('[data-nicole-background] img').getAttribute('src'), frames[1].src);
  cleanup(); dom.window.close();
});

test('late image resolution cannot recreate a disposed skin', async () => {
  const dom = fixture(); const doc = dom.window.document;
  const before = doc.documentElement.outerHTML;
  let release;
  const cleanup = mountBackground(doc, frames, css, { preload: () => new Promise(resolve => { release = resolve; }) });
  await flush(); cleanup();
  release(doc.createElement('img'));
  await flush();
  assert.equal(doc.documentElement.outerHTML, before);
  dom.window.close();
});

// Catches a missing/wrong previous handler, wrap boundary, or accidental resume.
test('previous wraps to the last frame while paused and next returns to the first', async () => {
  const dom = fixture(); const doc = dom.window.document;
  const cleanup = mountBackground(doc, frames, css, options(doc));
  await flush();
  doc.querySelector('[aria-label="暂停背景轮播"]').click();
  doc.querySelector('[aria-label="上一张背景"]').click();
  await flush();
  assert.equal(doc.querySelector('[data-nicole-background] img').dataset.nicoleFrame, '00:28');
  assert.equal(doc.querySelector('[data-nicole-controls]').dataset.paused, 'true');
  doc.querySelector('[aria-label="下一张背景"]').click();
  await flush();
  assert.equal(doc.querySelector('[data-nicole-background] img').dataset.nicoleFrame, '00:17');
  cleanup(); dom.window.close();
});

// Catches a Settings change not reaching the renderer or leaking past unmount.
test('shared interval changes update the status without changing the frame or pause', async () => {
  const dom = fixture(); const doc = dom.window.document;
  const preference = createIntervalPreference(dom.window);
  const cleanup = mountBackground(doc, frames, css, { ...options(doc), intervalPreference: preference });
  await flush();
  doc.querySelector('[aria-label="暂停背景轮播"]').click();
  preference.setMinutes(30);
  assert.equal(doc.querySelector('[data-nicole-status]').title, 'PV 00:17 · 停留 30 分钟 · 渐变 2 秒');
  assert.equal(doc.querySelector('[data-nicole-controls]').dataset.paused, 'true');
  assert.equal(doc.querySelector('[data-nicole-background] img').dataset.nicoleFrame, '00:17');
  cleanup();
  const after = doc.documentElement.outerHTML;
  preference.setMinutes(60);
  await flush();
  assert.equal(doc.documentElement.outerHTML, after);
  preference.dispose(); dom.window.close();
});

function floatingFixture() {
  const dom = fixture(), win = dom.window, doc = win.document;
  Object.defineProperty(win, 'innerHeight', { value: 800, configurable: true });
  const callbacks = new Map(); let id = 0;
  win.requestAnimationFrame = callback => { callbacks.set(++id, callback); return id; };
  win.cancelAnimationFrame = key => callbacks.delete(key);
  const nativeRect = win.HTMLElement.prototype.getBoundingClientRect;
  win.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.hasAttribute('data-nicole-controls')) {
      // CSS turns status off and stacks buttons per mode; mirror that sizing.
      const mode = this.dataset.nicoleMode || 'full';
      const sizes = {
        full: { left: 740, right: 980, width: 240, height: 38 },
        compact: { left: 817, right: 980, width: 163, height: 38 },
        vertical: { left: 913, right: 980, width: 67, height: 104 },
      };
      const size = sizes[mode];
      const bottom = 800 - (parseFloat(this.style.bottom) || 10);
      return { left: size.left, right: size.right, width: size.width, height: size.height, top: bottom - size.height, bottom };
    }
    return nativeRect.call(this);
  };
  const card = doc.createElement('div'); card.setAttribute('data-composer-card', '');
  let rectangle = { left: 500, right: 980, top: 640, bottom: 780, width: 480, height: 140 };
  card.getBoundingClientRect = () => rectangle;
  const tick = async () => {
    await flush();
    const pending = [...callbacks.values()]; callbacks.clear();
    pending.forEach(callback => callback(0));
    await flush();
  };
  return { dom, win, doc, card, tick, move: value => { rectangle = value; } };
}

test('floating controls follow late and replaced composers without changing host layout', async t => {
  const f = floatingFixture();
  t.after(() => f.dom.window.close());
  const cleanup = mountBackground(f.doc, frames, css, options(f.doc));
  await f.tick();
  const controls = f.doc.querySelector('[data-nicole-controls]');
  assert.equal(controls.dataset.nicoleMode, 'full', 'no composer card keeps the full bar at the corner');
  assert.equal(controls.style.bottom, '10px');
  f.doc.querySelector('#root').append(f.card);
  await f.tick();
  assert.equal(controls.dataset.nicoleMode, 'vertical', 'a card that owns the corner switches to the slim column');
  assert.equal(controls.style.bottom, '168px', 'float eight pixels above an overlapping input card');
  assert.equal(f.card.getAttribute('style'), null, 'never reposition the host card');
  f.move({ left: 500, right: 980, top: 500, bottom: 780, width: 480, height: 280 });
  f.win.dispatchEvent(new f.win.Event('resize'));
  await f.tick();
  assert.equal(controls.style.bottom, '308px');
  f.card.remove(); await f.tick();
  assert.equal(controls.style.bottom, '10px', 'return to the corner after a conversation disappears');
  assert.equal(controls.dataset.nicoleMode, 'full');
  f.doc.querySelector('#root').append(f.card); await f.tick();
  assert.equal(controls.style.bottom, '308px', 'rebind a composer on conversation change');
  cleanup(); f.dom.window.close();
});

test('floating controls leave a non-overlapping card alone and cancel queued work on disposal', async t => {
  const f = floatingFixture();
  t.after(() => f.dom.window.close());
  f.move({ left: 100, right: 600, top: 640, bottom: 780, width: 500, height: 140 });
  f.doc.querySelector('#root').append(f.card);
  const cleanup = mountBackground(f.doc, frames, css, options(f.doc));
  await f.tick();
  const controls = f.doc.querySelector('[data-nicole-controls]');
  assert.equal(controls.style.bottom, '10px');
  f.win.dispatchEvent(new f.win.Event('resize'));
  cleanup();
  const before = f.doc.documentElement.outerHTML;
  await f.tick();
  f.win.dispatchEvent(new f.win.Event('resize')); await f.tick();
  assert.equal(f.doc.documentElement.outerHTML, before);
  assert.equal(controls.style.bottom, '10px');
  f.dom.window.close();
});
