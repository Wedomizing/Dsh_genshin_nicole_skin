import { mountBackground } from './background.js';
import cssText from './background.css';
import { frames } from './frames.js';
import { createIntervalPreference } from './preferences.js';
import { registerIntervalSettings } from './settings.js';

export const name = 'genshin-nicole-background';
export const inject = ['slots'];

/**
 * A decorative skin must never take the host page down. Every step that
 * touches the DOM, the host slot ledger, or storage is isolated: if creating
 * the preference store, mounting the wallpaper, contributing the settings row,
 * or cleaning up throws — the host shell booted before <body>, this host
 * version does not provide the slot we register into, a hot re-apply ran
 * twice, storage is blocked — we log it and carry on instead of letting the
 * error escape into the host, where it would surface as a broken page rather
 * than as a missing wallpaper.
 */
function warn(error) {
  try { console.warn('[dsh-skin-genshin-nicole]', error); } catch { /* noop */ }
}

export function apply(ctx) {
  let intervalPreference;
  try {
    intervalPreference = createIntervalPreference(window);
  } catch (error) {
    warn(error);
    return;
  }

  let disposeBackground = () => {};
  let disposed = false;

  const teardown = () => {
    if (disposed) return;
    disposed = true;
    try { disposeBackground(); } catch (error) { warn(error); }
    try { intervalPreference.dispose(); } catch (error) { warn(error); }
  };

  function boot() {
    if (disposed) return teardown;
    try {
      const dispose = mountBackground(document, frames, cssText, { intervalPreference });
      if (typeof dispose === 'function') disposeBackground = dispose;
    } catch (error) {
      warn(error);
    }
    return teardown;
  }

  // ctx.effect is the host's lifecycle hook; a host that does not offer it
  // leaves us without a wallpaper instead of throwing out of the module.
  try {
    ctx.effect(() => {
      if (disposed) return;
      const doc = document;
      if (!doc?.body) {
        // Some host pages run this module before <body> exists; mount after paint.
        const onReady = () => {
          if (disposed) return;
          doc.removeEventListener('DOMContentLoaded', onReady);
          try { boot(); } catch (error) { warn(error); }
        };
        doc?.addEventListener('DOMContentLoaded', onReady);
        return () => { doc?.removeEventListener('DOMContentLoaded', onReady); teardown(); };
      }
      return boot();
    }, 'genshin-nicole-background: PV playlist');
  } catch (error) {
    warn(error);
  }

  try {
    registerIntervalSettings(ctx, intervalPreference);
  } catch (error) {
    warn(error);
  }
}
