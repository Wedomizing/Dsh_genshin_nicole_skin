import { createElement as h, useId, useSyncExternalStore } from 'react';
import { INTERVAL_MINUTES } from './preferences.js';

/** Contribute one row to DSH's existing General page; do not edit its DOM. */
export function registerIntervalSettings(ctx, preference) {
  function IntervalRow() {
    const minutes = useSyncExternalStore(preference.subscribe, preference.getSnapshot, preference.getSnapshot);
    const id = useId();
    const descriptionId = `${id}-description`;
    return h('div', { 'data-nicole-setting': 'interval' },
      h('div', { 'data-nicole-setting-text': '' },
        h('label', { htmlFor: id }, '尼可背景切换间隔'),
        h('div', { id: descriptionId, 'data-nicole-setting-description': '' },
          '每张停留时长；淡入淡出固定 2 秒。修改后重新计时，不改变暂停状态。'),
      ),
      h('select', {
        id,
        'aria-describedby': descriptionId,
        value: String(minutes),
        onChange: event => preference.setMinutes(Number(event.currentTarget.value)),
      }, INTERVAL_MINUTES.map(value => h('option', { key: value, value: String(value) }, `${value} min`))),
    );
  }

  return ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'genshin-nicole-interval',
    order: 10.5, // Between DSH Appearance (10) and Font Size (11).
  }, IntervalRow));
}
