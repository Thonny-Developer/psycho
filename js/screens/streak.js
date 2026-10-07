import { h, icon, replaceKeepFocus } from '../ui.js';
import { IC } from '../icons.js';
import { plural } from '../plan.js';
import { STREAK_RULE, REST_RULE, daysWord, monthGrid, weeklyCounts, badges, addDays } from '../streak.js';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const STATE_LABEL = { done: 'засчитан', rest: 'день отдыха', today: 'сегодня', missed: 'без отметки', future: '' };
const dayFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' });

const asDate = (day) => new Date(`${day}T00:00:00Z`);

/** Заголовок и спокойная подпись под ним для каждого состояния серии */
export function streakCopy(view) {
  const n = view.current;
  const title = {
    none: 'Серия ещё впереди',
    started: 'Первый день серии',
    continues: `${n} ${daysWord(n)} подряд`,
    'at-risk': `${n} ${daysWord(n)} подряд`,
    broken: 'Серия закончилась',
  }[view.status];
  let text;
  if (view.status === 'none') text = 'Закрой все сегодняшние планы — и день засчитается.';
  else if (view.status === 'broken') text = 'И это нормально. Начнём новую?';
  else if (view.status === 'at-risk') {
    text = view.remainingSteps > 0
      ? `Осталось ${view.remainingSteps} ${plural(view.remainingSteps, ['шаг', 'шага', 'шагов'])}, чтобы сохранить серию.`
      : 'Закрой сегодня хотя бы один план — и серия продолжится.';
  } else text = 'Сегодня всё закрыто. Можно выдохнуть.';
  return { title, text };
}

function weekDots(view) {
  return h('ol', { class: 'week-dots', 'aria-label': 'Эта неделя' },
    view.week.map(({ day, state }, i) => h('li', {
      class: `week-dot week-dot--${state}`,
      'aria-label': `${WEEKDAYS[i]}, ${dayFormat.format(asDate(day))}${STATE_LABEL[state] ? `: ${STATE_LABEL[state]}` : ''}`,
    },
    h('span', { class: 'week-dot__mark', 'aria-hidden': 'true' }, state === 'done' ? icon(IC.check, 12, { strokeWidth: 3 }) : null),
    h('span', { class: 'week-dot__label', 'aria-hidden': 'true' }, WEEKDAYS[i]))));
}

/** Виджет на главной: число дней, тёплая иконка, неделя. Ведёт на экран серии. */
export function streakWidget(view, actions) {
  const { title, text } = streakCopy(view);
  return h('button', { class: 'streak-widget', type: 'button', dataset: { focus: 'streak-widget' }, onClick: actions.openStreak },
    h('span', { class: 'streak-widget__top' },
      h('span', { class: 'streak-sun', 'aria-hidden': 'true' }, icon(IC.sun, 22, { strokeWidth: 1.8 })),
      h('span', { class: 'stack', style: { minWidth: '0', gap: '2px' } },
        h('span', { class: 'streak-widget__title' }, title),
        h('span', { class: 'text-14 muted' }, text))),
    weekDots(view),
    view.guest ? h('span', { class: 'streak-local' }, 'Серия на этом устройстве, не сохранена в аккаунте') : null);
}

function calendar(view, month, actions) {
  const [year, m] = month.split('-').map(Number);
  const done = new Set(view.doneDays);
  const rest = new Set(view.restDays);
  const weeks = monthGrid(year, m);
  const prev = new Date(Date.UTC(year, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 7);
  const canNext = next <= view.today.slice(0, 7);

  return h('div', { class: 'card month' },
    h('div', { class: 'month__head' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Предыдущий месяц', dataset: { focus: 'month-prev' }, onClick: () => actions.setStreakMonth(prev) }, icon(IC.chevronLeft, 20)),
      h('h2', { class: 'month__title', 'aria-live': 'polite' }, monthFormat.format(asDate(`${month}-01`))),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Следующий месяц', disabled: !canNext, dataset: { focus: 'month-next' }, onClick: () => actions.setStreakMonth(next) }, icon(IC.chevronRight, 20))),
    h('table', { class: 'month__grid' },
      h('thead', {}, h('tr', {}, WEEKDAYS.map((d) => h('th', { scope: 'col' }, d)))),
      h('tbody', {}, weeks.map((week) => h('tr', {}, week.map((day) => {
        if (!day) return h('td', {});
        let state = 'none';
        if (done.has(day)) state = 'done';
        else if (rest.has(day)) state = 'rest';
        if (day === view.today) state += ' today';
        if (day > view.today) state = 'future';
        const label = `${dayFormat.format(asDate(day))}${done.has(day) ? ': засчитан' : rest.has(day) ? ': день отдыха' : ''}`;
        return h('td', {}, h('span', { class: `month__day month__day--${state.replace(' ', ' month__day--')}`, 'aria-label': label }, String(Number(day.slice(8)))));
      }))))),
    h('div', { class: 'month__legend text-14 muted', 'aria-hidden': 'true' },
      h('span', {}, h('i', { class: 'legend legend--done' }), 'засчитан'),
      h('span', {}, h('i', { class: 'legend legend--rest' }), 'день отдыха')));
}

function chart(view) {
  const weeks = weeklyCounts(view.doneDays, view.today, 4);
  return h('div', { class: 'card chart' },
    h('h2', { class: 'h-section' }, 'Последние 4 недели'),
    h('ol', { class: 'chart__bars' },
      weeks.map((w) => {
        const range = `${shortFormat.format(asDate(w.start))} – ${shortFormat.format(asDate(addDays(w.start, 6)))}`;
        return h('li', { class: 'chart__col', 'aria-label': `${range}: ${w.count} ${daysWord(w.count)} из 7` },
          h('span', { class: 'chart__value', 'aria-hidden': 'true' }, String(w.count)),
          h('span', { class: 'chart__track', 'aria-hidden': 'true' },
            h('span', { class: 'chart__bar', style: { height: `${Math.max(4, (w.count / 7) * 100)}%` } })),
          h('span', { class: 'chart__label', 'aria-hidden': 'true' }, shortFormat.format(asDate(w.start))));
      })),
    h('p', { class: 'text-14 muted' }, 'Сколько дней в неделе засчитано.'));
}

export function badgeList(best) {
  return h('ul', { class: 'badges', 'aria-label': 'Отметки за серию' },
    badges(best).map((b) => h('li', { class: `badge${b.earned ? ' badge--earned' : ''}` },
      h('span', { class: 'badge__icon', 'aria-hidden': 'true' }, icon(b.earned ? IC.sun : IC.clock, 18, { strokeWidth: 1.8 })),
      h('span', {}, b.label, h('span', { class: 'visually-hidden' }, b.earned ? ' — есть' : ' — ещё впереди')))));
}

export function createStreakScreen({ actions }) {
  const title = h('h1', { id: 'streak-title', class: 'h-title', tabindex: '-1' }, 'Серия');
  const body = h('div', { class: 'stack', style: { gap: '18px' } });

  const el = h('section', { class: 'screen', 'aria-labelledby': 'streak-title' },
    h('div', { class: 'scroll' }, h('div', { class: 'saved-body' }, title, body)));

  return {
    el,
    focusTarget: title,
    update(state) {
      const view = state.streak;
      const { title: head, text } = streakCopy(view);
      replaceKeepFocus(body, [
        h('div', { class: 'streak-hero' },
          h('span', { class: 'streak-sun streak-sun--big', 'aria-hidden': 'true' }, icon(IC.sun, 30, { strokeWidth: 1.7 })),
          // Большое число и подпись к нему, без повтора числа в заголовке
          view.current > 0
            ? [
              h('span', { class: 'streak-hero__number', 'aria-hidden': 'true' }, String(view.current)),
              h('span', { class: 'streak-hero__title' }, h('span', { class: 'visually-hidden' }, `${view.current} `), `${daysWord(view.current)} подряд`),
            ]
            : h('span', { class: 'streak-hero__title' }, head),
          h('span', { class: 'text-15 muted' }, text)),
        h('div', { class: 'stats-grid' },
          h('div', { class: 'stat' }, h('span', { class: 'stat__value' }, String(view.current)), h('span', { class: 'stat__label' }, 'Сейчас подряд')),
          h('div', { class: 'stat' }, h('span', { class: 'stat__value' }, String(view.best)), h('span', { class: 'stat__label' }, 'Лучшая серия'))),
        h('div', { class: 'soft-note' },
          h('p', { class: 'text-15' }, STREAK_RULE),
          h('p', { class: 'text-14 muted' }, REST_RULE)),
        badgeList(view.best),
        calendar(view, state.streakMonth ?? view.today.slice(0, 7), actions),
        chart(view),
        view.guest ? h('p', { class: 'streak-local' }, 'Серия считается на этом устройстве и не сохранена в аккаунте. С аккаунтом она переживёт смену телефона.') : null,
      ]);
    },
  };
}
