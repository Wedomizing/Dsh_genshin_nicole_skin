import { mountBackground } from './background.js';
import cssText from './background.css';
import { frames } from './frames.js';
import { createIntervalPreference } from './preferences.js';
import { registerIntervalSettings } from './settings.js';

export const name = 'genshin-nicole-background';
export const inject = ['slots'];

export function apply(ctx) {
  const intervalPreference = createIntervalPreference(window);
  ctx.effect(() => () => intervalPreference.dispose(), 'genshin-nicole-background: preferences cleanup');
  ctx.effect(
    () => mountBackground(document, frames, cssText, { intervalPreference }),
    'genshin-nicole-background: PV playlist',
  );
  registerIntervalSettings(ctx, intervalPreference);
}
