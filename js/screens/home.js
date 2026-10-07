import { h, icon, replaceKeepFocus } from '../ui.js';
import { IC } from '../icons.js';
import { TYPES, OWN_TOPIC, greetingByHour } from '../content.js';
import { getProgress } from '../plan.js';

export function miniPlan(scenario, onOpen) {
  const p = getProgress(scenario);
  return h('button', { class: 'mini-plan', type: 'button', onClick: onOpen, dataset: { focus: `mini-${scenario.id}` } },
    h('span', { class: 'mini-plan__top' },
      h('span', { class: 'mini-plan__title' }, scenario.title),
      h('span', { class: 'mini-plan__progress' }, p.complete ? 'Готово' : `${p.done} из ${p.total}`)),
    h('span', { class: 'bar', 'aria-hidden': 'true' }, h('span', { class: 'bar__fill', style: { width: `${p.percent}%` } })));
}

export function createHome({ actions }) {
  const saved = h('div', { class: 'stack', style: { gap: '10px' } });

  const el = h('section', { class: 'screen' },
    h('div', { class: 'scroll' },
      h('div', { class: 'home' },
        h('div', { class: 'stack', style: { gap: '6px', padding: '0 4px' } },
          h('span', { class: 'text-15 muted' }, greetingByHour(new Date().getHours())),
          h('h1', { class: 'h-title', tabindex: '-1' }, 'Я рядом. С чего начнём?')),
        h('button', { class: 'panic-btn', type: 'button', onClick: () => actions.startCalm(null) },
          h('span', { class: 'panic-btn__ring', 'aria-hidden': 'true' }),
          h('span', { class: 'panic-btn__icon', 'aria-hidden': 'true' }, icon(IC.wind, 28, { strokeWidth: 1.7 })),
          h('span', {},
            h('span', { class: 'panic-btn__title' }, 'Мне плохо прямо сейчас'),
            h('span', { class: 'panic-btn__sub' }, 'Сразу к дыханию — без вопросов'))),
        h('div', { class: 'stack', style: { gap: '14px' } },
          h('h2', { class: 'h-section', style: { padding: '0 4px' } }, 'Или расскажи, что случилось'),
          h('div', { class: 'type-grid' },
            TYPES.map((t) => h('button', { class: 'type-card', type: 'button', onClick: () => actions.startCalm(t.key) },
              h('span', { class: 'round-icon', 'aria-hidden': 'true' }, icon(t.icon, 21)),
              h('span', {},
                h('span', { class: 'type-card__label' }, t.label),
                h('span', { class: 'type-card__hint' }, t.hint)))),
            h('button', { class: 'type-card type-card--wide', type: 'button', onClick: () => actions.startChat(OWN_TOPIC.key) },
              h('span', { class: 'round-icon', 'aria-hidden': 'true' }, icon(OWN_TOPIC.icon, 21)),
              h('span', {},
                h('span', { class: 'type-card__label' }, OWN_TOPIC.label),
                h('span', { class: 'type-card__hint' }, `${OWN_TOPIC.hint} — сразу в разговор`))))),
        h('div', { class: 'stack', style: { gap: '10px' } },
          h('div', { class: 'section-head' },
            h('h2', { class: 'h-section' }, 'Мои сценарии'),
            h('button', { class: 'link', type: 'button', onClick: actions.openSaved }, 'Все')),
          saved))));

  return {
    el,
    update(state) {
      replaceKeepFocus(saved, state.scenarios.length
        ? state.scenarios.slice(0, 2).map((s) => miniPlan(s, () => actions.openScenario(s.id)))
        : h('p', { class: 'empty-dashed' }, 'Пока пусто. Сохрани план — он появится здесь.'));
    },
  };
}
