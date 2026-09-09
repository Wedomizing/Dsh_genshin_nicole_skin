/** Sequential playback independent of the DOM; the renderer owns the crossfade. */
export function createPlaylist(entries, options) {
  const { preload, show, onChange = () => {},
    setTimeout: schedule = globalThis.setTimeout, clearTimeout: cancel = globalThis.clearTimeout } = options;
  if (!entries.length) throw new Error('The playlist needs at least one image');
  const initial = Number.isInteger(options.initialIndex) ? options.initialIndex : 0;
  const state = { index: Math.max(0, Math.min(entries.length - 1, initial)), total: entries.length,
    paused: Boolean(options.paused), hidden: Boolean(options.hidden), phase: 'loading' };
  let timer;
  let disposed = false;
  let busy = false;
  let hasFrame = false;
  let warmed;
  let holdMs = validHold(options.holdMs) ? options.holdMs : 60000;
  const wrap = index => ((index % entries.length) + entries.length) % entries.length;
  const getState = () => ({ ...state });
  // Rendering feedback is decorative and must never take the player down.
  const emit = () => {
    if (disposed) return;
    try { onChange(getState()); } catch { /* keep playing regardless */ }
  };
  const stopTimer = () => { if (timer !== undefined) cancel(timer); timer = undefined; };
  const load = index => Promise.resolve().then(() => {
    if (disposed) throw new Error('Playlist disposed before preload');
    return preload(entries[index]);
  })
    .then(payload => ({ ok: true, payload }), () => ({ ok: false }));

  function arm() {
    stopTimer();
    if (disposed || busy || !hasFrame || state.phase === 'error' || state.paused || state.hidden || entries.length < 2) return;
    timer = schedule(() => { timer = undefined; void next(); }, holdMs);
  }

  async function select(start, direction = 1) {
    if (disposed || busy) return;
    stopTimer();
    busy = true;
    state.phase = 'loading';
    emit();
    let succeeded = false;
    try {
      for (let attempt = 0; attempt < entries.length; attempt++) {
        const index = wrap(start + attempt * direction);
        if (hasFrame && index === state.index) break;
        const pending = warmed?.index === index ? warmed.promise : load(index);
        warmed = undefined;
        const result = await pending;
        if (disposed) return;
        if (!result.ok) continue;
        state.phase = 'fading';
        emit();
        try {
          await show(entries[index], { payload: result.payload, initial: !hasFrame });
        } catch {
          // A transition that throws is treated like a broken frame: skip it
          // instead of wedging the player inside its busy window forever.
          continue;
        }
        if (disposed) return;
        state.index = index;
        hasFrame = true;
        succeeded = true;
        break;
      }
    } finally {
      // Whatever happened above, never leave the player busy forever.
      if (!disposed) {
        busy = false;
        state.phase = succeeded ? 'idle' : 'error';
      }
    }
    if (disposed) return;
    emit();
    if (succeeded && entries.length > 1) {
      const index = (state.index + 1) % entries.length;
      warmed = { index, promise: load(index) };
    }
    arm();
  }

  function next() { return select(hasFrame ? (state.index + 1) % entries.length : state.index); }
  function previous() { return select(hasFrame ? wrap(state.index - 1) : state.index, -1); }
  function validHold(value) { return Number.isFinite(value) && value > 0 && value <= 2147483647; }
  const ready = select(state.index);
  return {
    ready, next, previous, getState,
    // Reset the dwell, never the current image/fade or the user's pause state.
    setHoldMs(value) {
      if (disposed || !validHold(value) || value === holdMs) return;
      holdMs = value;
      arm();
      emit();
    },
    setPaused(value) { if (disposed) return; state.paused = Boolean(value); arm(); emit(); },
    setHidden(value) { if (disposed) return; state.hidden = Boolean(value); arm(); emit(); },
    // Re-arm only when the dwell timer is genuinely missing (a window that came
    // back from the tray/minimized can drop it); never restart a running dwell.
    ensureArmed() { if (disposed || timer !== undefined) return; arm(); },
    dispose() { disposed = true; stopTimer(); warmed = undefined; },
  };
}
