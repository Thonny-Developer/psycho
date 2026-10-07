import { h, icon } from '../ui.js';
import { IC } from '../icons.js';

function dots(step) {
  return h('div', { class: 'dots', role: 'img', 'aria-label': `Шаг ${step + 1} из 3` },
    [0, 1, 2].map((i) => h('span', { class: i === step ? 'is-on' : '' })));
}

function intro() {
  return [
    h('div', { class: 'onb-art', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'), h('span')),
    h('div', { class: 'stack', style: { gap: '14px' } },
      h('h1', { class: 'h-display', tabindex: '-1' }, 'Здесь можно выдохнуть'),
      h('p', { class: 'lead' }, 'Когда навалилось всё сразу — дедлайны, экзамен, хвосты, — я помогу сбавить накал и разложить завал на маленькие шаги.')),
  ];
}

function howItWorks() {
  const item = (n, title, text) =>
    h('li', {}, h('span', { class: 'onb-num', 'aria-hidden': 'true' }, n),
      h('span', { style: { paddingTop: '2px' } }, h('strong', {}, title), h('span', { class: 'text-16 muted' }, text)));
  return [
    h('h1', { class: 'h-display', tabindex: '-1' }, 'Как это работает'),
    h('ol', { class: 'onb-steps' },
      item('1', 'Сначала выдохнем', 'Дыхание или заземление — пара минут, чтобы тело перестало паниковать.'),
      item('2', 'Потом выговоришься', 'Пиши как есть. Я выслушаю и задам пару простых вопросов.'),
      item('3', 'И соберём план', '3–7 маленьких шагов с оценкой времени. Отмечай сделанное — и смотри, как становится меньше.')),
  ];
}

function disclaimer() {
  return [
    h('h1', { class: 'h-display', tabindex: '-1' }, 'Честно о главном'),
    h('div', { class: 'card' },
      h('p', { class: 'serif', style: { fontSize: 'calc(21px * var(--fs))', lineHeight: '1.35' } }, 'Я не психолог и не заменяю помощь специалиста.'),
      h('p', { class: 'text-16 muted' }, 'Я помогаю успокоиться и разложить задачи по полочкам. Это поддержка, а не лечение.')),
    h('div', { class: 'row' },
      h('span', { class: 'round-icon', 'aria-hidden': 'true' }, icon(IC.heart, 20, { strokeWidth: 1.9 })),
      h('p', { class: 'text-16' }, 'Если совсем тяжело или появляются мысли навредить себе — лучше поговорить с живым человеком. Кнопка «Живая помощь» всегда наверху.')),
    h('div', { class: 'row' },
      h('span', { class: 'round-icon round-icon--sand', 'aria-hidden': 'true' }, icon(IC.lock, 20)),
      h('p', { class: 'text-16 muted' }, 'Планы и настройки хранятся только на этом устройстве.')),
  ];
}

const PAGES = [intro, howItWorks, disclaimer];

export function createOnboarding({ actions }, step) {
  const last = step === PAGES.length - 1;
  const el = h('section', { class: 'screen', 'aria-label': 'Знакомство' },
    h('div', { class: 'scroll scroll--center pad-wide', style: { gap: step === 2 ? '24px' : '28px' } }, PAGES[step]()),
    h('div', { class: 'dock' },
      dots(step),
      last
        ? h('button', { class: 'btn', type: 'button', onClick: actions.finishOnboarding }, 'Начать')
        : [
          h('button', { class: 'btn', type: 'button', onClick: actions.nextOnboarding }, 'Дальше'),
          h('button', { class: 'btn btn--text', type: 'button', onClick: actions.skipOnboarding }, 'Пропустить'),
        ]));
  return { el };
}
