import { h, icon, replaceKeepFocus } from '../ui.js';
import { IC } from '../icons.js';
import { typeLabel } from '../content.js';
import { getProgress } from '../plan.js';

const DAY = 864e5;
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });

export function savedDate(timestamp, now = Date.now()) {
  const startOf = (t) => new Date(t).setHours(0, 0, 0, 0);
  const days = Math.round((startOf(now) - startOf(timestamp)) / DAY);
  if (days <= 0) return 'Сегодня';
  if (days === 1) return 'Вчера';
  return dateFormat.format(timestamp);
}

function item(scenario, actions) {
  const p = getProgress(scenario);
  return h('li', { class: 'saved-item' },
    h('button', { class: 'saved-item__open', type: 'button', dataset: { focus: `open-${scenario.id}` }, onClick: () => actions.openScenario(scenario.id) },
      h('span', { class: 'saved-item__meta' },
        h('span', { class: 'pill' }, typeLabel(scenario.type)),
        h('span', {}, savedDate(scenario.savedAt ?? scenario.createdAt))),
      h('span', { class: 'saved-item__title' }, scenario.title),
      h('span', { class: 'saved-item__progress' },
        h('span', { class: 'bar', 'aria-hidden': 'true' }, h('span', { class: 'bar__fill', style: { width: `${p.percent}%` } })),
        h('span', {}, p.complete ? 'Готово' : `${p.done} из ${p.total}`))),
    h('button', {
      class: 'saved-item__del',
      type: 'button',
      'aria-label': `Удалить «${scenario.title}»`,
      dataset: { focus: `del-${scenario.id}` },
      onClick: () => actions.deleteScenario(scenario.id),
    }, icon(IC.trash, 20)));
}

export function createSaved({ actions }) {
  const title = h('h1', { class: 'h-title', tabindex: '-1' }, 'Мои сценарии');
  const body = h('div', { class: 'stack', style: { gap: '10px', flex: '1' } });
  const dock = h('div', { class: 'dock' },
    h('button', { class: 'btn', type: 'button', onClick: actions.goHome }, 'Разобрать задачу'));

  const el = h('section', { class: 'screen', 'aria-labelledby': 'saved-title' },
    h('div', { class: 'scroll' },
      h('div', { class: 'saved-body', style: { flex: '1' } },
        h('div', { class: 'stack', style: { gap: '8px', padding: '0 4px' } },
          Object.assign(title, { id: 'saved-title' }),
          h('span', { class: 'lock-note' }, icon(IC.lock, 16, { strokeWidth: 1.9 }), 'Хранятся только на этом устройстве')),
        body)),
    dock);

  return {
    el,
    focusTarget: title,
    update(state, { focusKey } = {}) {
      dock.hidden = state.scenarios.length > 0;
      replaceKeepFocus(body, state.scenarios.length
        ? h('ul', { class: 'saved-list' }, state.scenarios.map((s) => item(s, actions)))
        : h('div', { class: 'empty-state' },
          h('div', { class: 'stones', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'), h('span')),
          h('h2', { class: 'serif', style: { fontWeight: '500', fontSize: 'calc(26px * var(--fs))' } }, 'Пока пусто'),
          h('p', { class: 'text-16 muted', style: { maxWidth: '30ch' } }, 'Когда разложишь задачу на шаги, сохрани план — он будет ждать здесь.')),
      focusKey);
    },
  };
}
