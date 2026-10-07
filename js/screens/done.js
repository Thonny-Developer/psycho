import { h, icon } from '../ui.js';
import { IC } from '../icons.js';
import { formatMinutes, totalMinutes, plural } from '../plan.js';

export function createDone({ state, actions }) {
  const { plan } = state;
  const n = plan.steps.length;
  const title = h('h1', { class: 'h-display', style: { marginTop: '8px' }, tabindex: '-1' }, 'Все шаги сделаны');

  const el = h('section', { class: 'screen', 'aria-labelledby': 'done-title' },
    h('div', { class: 'scroll scroll--center done-body' },
      h('div', { class: 'done-mark', 'aria-hidden': 'true' },
        h('span'), h('span'), h('span', {}, icon(IC.check, 34, { strokeWidth: 2.4 }))),
      Object.assign(title, { id: 'done-title' }),
      h('p', { class: 'lead', style: { maxWidth: '32ch' } }, 'Это было непросто — а план выполнен. Можно выдохнуть и немного отдохнуть.'),
      h('span', { class: 'stat-pill' }, `${n} ${plural(n, ['шаг', 'шага', 'шагов'])} · ≈ ${formatMinutes(totalMinutes(plan))}`),
      h('span', { class: 'text-14 muted' }, 'План сохранён в «Мои сценарии»')),
    h('div', { class: 'dock' },
      h('button', { class: 'btn', type: 'button', onClick: actions.goHome }, 'На главную'),
      h('button', { class: 'btn btn--text', type: 'button', onClick: actions.viewPlan }, 'Посмотреть план')));

  return { el, focusTarget: title };
}
