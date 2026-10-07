import { h, icon } from '../ui.js';
import { IC } from '../icons.js';
import { formatMinutes, totalMinutes, plural } from '../plan.js';

export function createDone({ state, actions }) {
  const { plan } = state;
  const n = plan.steps.length;
  let hint = null;
  const title = h('h1', { class: 'h-display', style: { marginTop: '8px' }, tabindex: '-1' }, 'Все шаги сделаны');

  const el = h('section', { class: 'screen', 'aria-labelledby': 'done-title' },
    h('div', { class: 'scroll scroll--center done-body' },
      h('div', { class: 'done-mark', 'aria-hidden': 'true' },
        h('span'), h('span'), h('span', {}, icon(IC.check, 34, { strokeWidth: 2.4 }))),
      Object.assign(title, { id: 'done-title' }),
      h('p', { class: 'lead', style: { maxWidth: '32ch' } }, 'Это было непросто — а план выполнен. Можно выдохнуть и немного отдохнуть.'),
      h('span', { class: 'stat-pill' }, `${n} ${plural(n, ['шаг', 'шага', 'шагов'])} · ≈ ${formatMinutes(totalMinutes(plan))}`),
      h('span', { class: 'text-14 muted' }, 'План сохранён в «Мои сценарии»'),
      state.showAccountHint
        ? h('div', { class: 'card account-hint', role: 'note', ref: (el) => { hint = el; } },
          h('p', { class: 'text-15' }, 'Чтобы планы и серия не потерялись, можно создать аккаунт. Это займёт минуту.'),
          h('div', { class: 'btn-row', style: { justifyContent: 'center' } },
            h('button', { class: 'btn btn--soft', type: 'button', onClick: () => actions.openAuth('signup') }, 'Создать аккаунт'),
            h('button', { class: 'link', type: 'button', onClick: actions.dismissAccountHint }, 'Не сейчас')))
        : null),
    h('div', { class: 'dock' },
      h('button', { class: 'btn', type: 'button', onClick: actions.goHome }, 'На главную'),
      h('button', { class: 'btn btn--text', type: 'button', onClick: actions.viewPlan }, 'Посмотреть план')));

  return {
    el,
    focusTarget: title,
    update(s) {
      if (hint) hint.hidden = !s.showAccountHint;
    },
  };
}
