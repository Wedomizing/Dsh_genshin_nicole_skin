export const INTERVAL_MINUTES = Object.freeze([1, 5, 10, 30, 60]);
export const SETTINGS_KEY = 'dsh-skin-genshin-nicole.settings.v1';
export const PLAYBACK_KEY = 'dsh-skin-genshin-nicole.playlist.v1';

function read(win, key) {
  try { return JSON.parse(win.localStorage.getItem(key)); } catch { return undefined; }
}

function write(win, key, value) {
  // Browsers may disable storage. Playback and settings still work in memory.
  try { win.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/** One local preference shared by the native Settings row and the renderer. */
export function createIntervalPreference(win) {
  const saved = read(win, SETTINGS_KEY)?.intervalMinutes;
  let minutes = INTERVAL_MINUTES.includes(saved) ? saved : 1;
  let disposed = false;
  const listeners = new Set();
  return {
    getSnapshot: () => minutes,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setMinutes(value) {
      if (disposed || !INTERVAL_MINUTES.includes(value) || minutes === value) return;
      minutes = value;
      write(win, SETTINGS_KEY, { intervalMinutes: minutes });
      for (const listener of listeners) listener();
    },
    dispose() { disposed = true; listeners.clear(); },
  };
}

/** Restore by timestamp, so removing a frame does not shift everyone's selection. */
export function readPlaybackPreference(win, frames) {
  const saved = read(win, PLAYBACK_KEY);
  let index = 0;
  if (typeof saved?.timestamp === 'string') {
    const exact = frames.findIndex(frame => frame.timestamp === saved.timestamp);
    const following = frames.findIndex(frame => frame.timestamp > saved.timestamp);
    index = exact >= 0 ? exact : Math.max(0, following);
  } else if (Number.isInteger(saved?.index) && saved.index >= 0) {
    if (frames.some(frame => Number.isInteger(frame.legacyIndex))) {
      // The removed old index 8 advances to 01:30; all other old frames keep their identity.
      const following = frames.findIndex(frame => frame.legacyIndex >= saved.index);
      index = following < 0 ? 0 : following;
    } else {
      index = Math.min(saved.index, frames.length - 1);
    }
  }
  return { index, paused: saved?.paused === true };
}

export function savePlaybackPreference(win, { index, timestamp, paused }) {
  write(win, PLAYBACK_KEY, { index, timestamp, paused });
}
