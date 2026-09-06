import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { createIntervalPreference, readPlaybackPreference, savePlaybackPreference, SETTINGS_KEY, PLAYBACK_KEY } from '../src/preferences.js';

const frames = [
  { timestamp: '00:17', legacyIndex: 0 },
  { timestamp: '01:18', legacyIndex: 7 },
  { timestamp: '01:30', legacyIndex: 9 },
  { timestamp: '01:51', legacyIndex: 14 },
];
const fixture = () => new JSDOM('', { url: 'http://localhost' });

// Catches losing saved settings or accepting a duration outside the five choices.
test('interval defaults to one minute, persists all five choices and rejects invalid values', () => {
  const dom = fixture(); const win = dom.window;
  const preference = createIntervalPreference(win);
  assert.equal(preference.getSnapshot(), 1);
  for (const value of [5, 10, 30, 60, 1]) {
    preference.setMinutes(value);
    const restored = createIntervalPreference(win);
    assert.equal(restored.getSnapshot(), value);
    restored.dispose();
  }
  preference.setMinutes(10);
  for (const value of [0, -1, 2, 60000, '5', null, NaN, Infinity]) preference.setMinutes(value);
  assert.equal(preference.getSnapshot(), 10);
  assert.deepEqual(JSON.parse(win.localStorage.getItem(SETTINGS_KEY)), { intervalMinutes: 10 });
  preference.dispose(); dom.window.close();
});

test('corrupted saved intervals fall back to one minute without crashing', () => {
  const dom = fixture(); const win = dom.window;
  for (const raw of ['{broken', 'null', '{}', '{"intervalMinutes":2}', '{"intervalMinutes":"60"}']) {
    win.localStorage.setItem(SETTINGS_KEY, raw);
    const preference = createIntervalPreference(win);
    assert.equal(preference.getSnapshot(), 1);
    preference.dispose();
  }
  dom.window.close();
});

// Catches applying the new array index directly to the old fifteen-frame selection.
test('legacy positions keep frame identity and the removed ninth frame advances to 01:30', () => {
  const dom = fixture(); const win = dom.window;
  for (const [oldIndex, wantTimestamp] of [[0, '00:17'], [7, '01:18'], [8, '01:30'], [9, '01:30'], [14, '01:51']]) {
    win.localStorage.setItem(PLAYBACK_KEY, JSON.stringify({ index: oldIndex, paused: true }));
    const restored = readPlaybackPreference(win, frames);
    assert.equal(frames[restored.index].timestamp, wantTimestamp);
    assert.equal(restored.paused, true);
  }
  dom.window.close();
});

test('new saved positions restore by timestamp even if their array index is stale', () => {
  const dom = fixture(); const win = dom.window;
  savePlaybackPreference(win, { index: 99, timestamp: '01:30', paused: false });
  assert.deepEqual(readPlaybackPreference(win, frames), { index: 2, paused: false });
  savePlaybackPreference(win, { index: 8, timestamp: '01:26', paused: true });
  assert.deepEqual(readPlaybackPreference(win, frames), { index: 2, paused: true });
  dom.window.close();
});

test('blocked browser storage does not prevent in-memory interval changes', () => {
  const win = { get localStorage() { throw new Error('SecurityError'); } };
  const preference = createIntervalPreference(win);
  preference.setMinutes(60);
  assert.equal(preference.getSnapshot(), 60);
  assert.deepEqual(readPlaybackPreference(win, frames), { index: 0, paused: false });
  assert.doesNotThrow(() => savePlaybackPreference(win, { index: 0, timestamp: '00:17', paused: true }));
  preference.dispose();
});
