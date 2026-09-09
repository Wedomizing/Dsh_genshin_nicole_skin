import { createPlaylist } from './playlist.js';
import { positionFloatingControls } from './floating-controls.js';
import { createIntervalPreference, readPlaybackPreference, savePlaybackPreference } from './preferences.js';

const instanceKey = Symbol.for('dsh-skin-genshin-nicole.background');
const scope = 'data-dsh-genshin-nicole';

/** Own only the decorative layers, player controls and listeners we install. */
export function mountBackground(doc, frames, cssText, options = {}) {
  if (!Array.isArray(frames) || !frames.length) throw new Error('No Nicole background frames');
  doc[instanceKey]?.();
  const win = doc.defaultView;
  const body = doc.body;
  const previousScope = body.getAttribute(scope);
  const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  const saved = readPlaybackPreference(win, frames);
  const intervalPreference = options.intervalPreference ?? createIntervalPreference(win);
  let userPaused = saved?.paused === true;
  let disposed = false;
  let currentImage;
  let animation;
  const pendingLoads = new Set();

  const style = doc.createElement('style');
  style.setAttribute('data-nicole-styles', '');
  style.textContent = cssText;
  const background = doc.createElement('div');
  background.setAttribute('data-nicole-background', '');
  background.setAttribute('aria-hidden', 'true');
  const layers = doc.createElement('div');
  layers.setAttribute('data-nicole-layers', '');
  background.append(layers);

  const controls = doc.createElement('div');
  controls.setAttribute('data-nicole-controls', '');
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', '尼可背景播放控制');
  const status = doc.createElement('span');
  status.setAttribute('data-nicole-status', '');
  // Background changes are decorative; deliberately not an aria-live region.
  const pause = doc.createElement('button');
  pause.type = 'button';
  const previous = doc.createElement('button');
  previous.type = 'button';
  previous.textContent = '上一张';
  previous.setAttribute('aria-label', '上一张背景');
  const next = doc.createElement('button');
  next.type = 'button';
  next.textContent = '下一张';
  next.setAttribute('aria-label', '下一张背景');
  controls.append(status, pause, previous, next);
  doc.head.append(style);
  body.prepend(background);
  body.append(controls);
  body.setAttribute(scope, '');
  const disposePosition = positionFloatingControls(doc, controls);

  function preload(entry) {
    return new Promise((accept, reject) => {
      const img = new win.Image();
      let settled = false;
      const abort = () => { finish(new Error('Image load cancelled')); img.src = ''; };
      const timer = win.setTimeout(abort, 10000);
      function finish(error) {
        if (settled) return;
        settled = true;
        win.clearTimeout(timer);
        pendingLoads.delete(abort);
        if (error) reject(error); else accept(img);
      }
      pendingLoads.add(abort);
      img.src = entry.src;
      img.decode().then(() => finish(), finish);
    });
  }

  async function show(entry, { payload: img, initial }) {
    if (disposed) return;
    img.alt = '';
    img.draggable = false;
    img.setAttribute('data-nicole-frame', entry.timestamp);
    img.style.opacity = '1';
    layers.append(img);
    const outgoing = currentImage;
    if (!initial && !reducedMotion?.matches && img.animate) {
      // Source-over cross-dissolve: A*(1-t) + B*t. Keeping A opaque below B
      // avoids the brightness dip caused by fading two translucent layers.
      animation = img.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 2000, easing: 'ease-in-out', fill: 'both',
      });
      await animation.finished.catch(() => {});
      if (disposed) return;
      animation.cancel();
      animation = undefined;
    }
    outgoing?.remove();
    currentImage = img;
  }

  const player = createPlaylist(frames, {
    preload: options.preload ?? preload, show,
    holdMs: intervalPreference.getSnapshot() * 60000,
    initialIndex: saved?.index, paused: userPaused || reducedMotion?.matches, hidden: doc.hidden,
    setTimeout: win.setTimeout.bind(win), clearTimeout: win.clearTimeout.bind(win),
    onChange(state) {
      background.dataset.index = String(state.index);
      background.dataset.phase = state.phase;
      controls.dataset.paused = String(state.paused);
      status.textContent = `尼可 · ${String(state.index + 1).padStart(2, '0')}/${state.total}`;
      status.title = `PV ${frames[state.index].timestamp} · 停留 ${intervalPreference.getSnapshot()} 分钟 · 渐变 2 秒`;
      pause.textContent = state.paused ? '继续' : '暂停';
      pause.setAttribute('aria-label', state.paused ? '继续背景轮播' : '暂停背景轮播');
      pause.disabled = Boolean(reducedMotion?.matches);
      pause.title = reducedMotion?.matches ? '系统已启用减少动态效果，可手动切换图片' : pause.getAttribute('aria-label');
      next.disabled = state.phase === 'loading' || state.phase === 'fading' || state.total < 2;
      previous.disabled = next.disabled;
      next.title = state.phase === 'error' ? '图片加载失败，点击重试；当前背景保持不变' : '下一张背景';
      previous.title = state.phase === 'error' ? '图片加载失败，点击重试；当前背景保持不变' : '上一张背景';
      if (state.phase === 'idle') {
        savePlaybackPreference(win, { index: state.index, timestamp: frames[state.index].timestamp, paused: userPaused });
      }
    },
  });
  const unsubscribeInterval = intervalPreference.subscribe(() => player.setHoldMs(intervalPreference.getSnapshot() * 60000));
  pause.addEventListener('click', () => { userPaused = !player.getState().paused; player.setPaused(userPaused); });
  previous.addEventListener('click', () => { void player.previous(); });
  next.addEventListener('click', () => { void player.next(); });
  const onVisibility = () => player.setHidden(doc.hidden);
  // Desktop windows that return from the tray or from minimized can lose the
  // visibilitychange event. Focus is a reliable "the user is back" signal:
  // re-check the hidden state and re-arm a dwell timer that was dropped while
  // the page was hidden, without restarting one that is still running.
  const onFocus = () => {
    player.setHidden(doc.hidden);
    player.ensureArmed();
  };
  const onMotion = () => {
    player.setPaused(userPaused || reducedMotion.matches);
    if (reducedMotion.matches) animation?.finish();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('focus', onFocus);
  reducedMotion?.addEventListener('change', onMotion);

  function dispose() {
    if (disposed) return;
    disposed = true;
    disposePosition();
    unsubscribeInterval();
    if (!options.intervalPreference) intervalPreference.dispose();
    player.dispose();
    animation?.cancel();
    for (const abort of pendingLoads) abort();
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('focus', onFocus);
    reducedMotion?.removeEventListener('change', onMotion);
    background.remove();
    controls.remove();
    style.remove();
    if (previousScope === null) body.removeAttribute(scope);
    else body.setAttribute(scope, previousScope);
    if (doc[instanceKey] === dispose) delete doc[instanceKey];
  }
  doc[instanceKey] = dispose;
  return dispose;
}
