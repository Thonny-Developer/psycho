import { h, icon } from '../ui.js';
import { IC } from '../icons.js';
import { GROUND } from '../content.js';
import { createBreathController, PHASE_WORD, PHASE_GUIDE, CYCLES_GOAL, cycleLabel } from '../breath.js';

function segmented(state, actions) {
  const breath = state.calmMode === 'breath';
  return h('div', { class: 'seg', role: 'group', 'aria-label': 'Техника' },
    h('button', { type: 'button', 'aria-pressed': String(breath), onClick: () => actions.setCalmMode('breath') }, 'Дыхание'),
    h('button', { type: 'button', 'aria-pressed': String(!breath), onClick: () => actions.setCalmMode('ground') }, 'Заземление 5-4-3-2-1'));
}

function breathView(ctx) {
  const { actions } = ctx;
  let core;
  let halo;
  let paused = false;

  const word = h('span', { class: 'breath__word' }, PHASE_WORD.in);
  const sec = h('span', { class: 'breath__sec' }, '4 сек');
  const guide = h('span', { class: 'breath-guide' }, PHASE_GUIDE.in);
  const dots = Array.from({ length: CYCLES_GOAL }, () => h('span'));
  const label = h('span', {}, cycleLabel(1));

  const circle = h('button', { class: 'breath', type: 'button', 'aria-label': 'Поставить дыхание на паузу' },
    h('span', { class: 'breath__halo', ref: (el) => { halo = el; } }),
    h('span', { class: 'breath__core', ref: (el) => { core = el; } }),
    h('span', { class: 'breath__text', 'aria-hidden': 'true' }, word, sec));

  const controller = createBreathController({
    core,
    halo,
    isReduced: () => document.documentElement.dataset.reduced === 'true',
    onTick({ phase, sec: s, cycle }) {
      word.textContent = PHASE_WORD[phase];
      sec.textContent = `${s} сек`;
      if (guide.textContent !== PHASE_GUIDE[phase]) guide.textContent = PHASE_GUIDE[phase];
      dots.forEach((d, i) => d.classList.toggle('is-on', i < cycle));
      label.textContent = cycleLabel(cycle);
    },
  });

  function showPaused() {
    word.textContent = 'Пауза';
    sec.textContent = 'нажми, чтобы продолжить';
    guide.textContent = 'Дыхание на паузе';
    circle.setAttribute('aria-label', 'Продолжить дыхание');
  }

  circle.addEventListener('click', () => {
    paused = !paused;
    if (paused) {
      controller.stop();
      showPaused();
    } else {
      circle.setAttribute('aria-label', 'Поставить дыхание на паузу');
      controller.start();
    }
  });

  const el = [
    h('div', { class: 'breath-area' },
      circle,
      h('div', { class: 'breath-info' },
        h('div', { 'aria-live': 'polite' }, guide),
        h('span', { class: 'cycle' }, h('span', { class: 'cycle__dots', 'aria-hidden': 'true' }, dots), label))),
    h('div', { class: 'dock' },
      h('button', { class: 'btn', type: 'button', onClick: actions.calmDone }, 'Стало чуть легче')),
  ];

  return {
    el,
    update(state) {
      // Пока открыта «Живая помощь», круг стоит
      if (state.helpOpen || paused) controller.stop();
      else controller.start();
    },
    destroy() {
      controller.stop();
    },
  };
}

function groundView({ actions }) {
  const area = h('div', { class: 'ground-area' });
  const dock = h('div', { class: 'dock', style: { alignItems: 'center', paddingTop: '4px' } },
    h('button', { class: 'btn btn--text btn--auto', type: 'button', onClick: actions.calmDone }, 'Пропустить — к разговору'));

  return {
    el: [area, dock],
    update(state) {
      const step = state.ground;
      dock.hidden = step >= GROUND.length;
      if (area.dataset.step === String(step)) return;
      area.dataset.step = String(step);

      if (step >= GROUND.length) {
        area.replaceChildren(h('div', { class: 'ground-done' },
          h('span', { class: 'check-circle', 'aria-hidden': 'true' }, icon(IC.check, 36)),
          h('h2', { class: 'ground-title', style: { fontSize: 'calc(28px * var(--fs))' }, tabindex: '-1' }, 'Ты здесь, в этой комнате'),
          h('p', { class: 'muted', style: { maxWidth: '34ch', fontSize: 'calc(17px * var(--fs))', lineHeight: '1.5' } },
            'Мир вокруг никуда не делся. Уже чуть легче?'),
          h('div', { class: 'stack', style: { gap: '6px', width: '100%', marginTop: '8px' } },
            h('button', { class: 'btn', type: 'button', onClick: actions.calmDone }, 'Да, дальше'),
            h('button', { class: 'btn btn--text', type: 'button', onClick: () => actions.setCalmMode('breath') }, 'Ещё подышать'))));
        area.querySelector('h2').focus({ preventScroll: true });
        return;
      }

      const g = GROUND[step];
      area.replaceChildren(h('div', { class: 'ground-card' },
        h('div', { class: 'ground-card__top' },
          h('span', {}, `Шаг ${step + 1} из ${GROUND.length}`),
          h('span', { class: 'ground-dots', 'aria-hidden': 'true' },
            GROUND.map((_, i) => h('span', { class: i <= step ? 'is-on' : '' })))),
        h('span', { class: 'ground-n', 'aria-hidden': 'true' }, g.n),
        h('h2', { class: 'ground-title', tabindex: '-1' }, h('span', { class: 'visually-hidden' }, `${g.n} `), g.title),
        h('p', { class: 'text-16 muted' }, g.hint),
        h('button', { class: 'btn', type: 'button', style: { marginTop: '6px' }, onClick: actions.nextGround }, 'Готово, дальше')));
      if (step > 0) area.querySelector('h2').focus({ preventScroll: true });
    },
  };
}

export function createCalm(ctx) {
  const { state } = ctx;
  const view = state.calmMode === 'ground' ? groundView(ctx) : breathView(ctx);

  const el = h('section', { class: 'screen', 'aria-labelledby': 'calm-title' },
    h('div', { class: 'calm-head' },
      h('h1', { id: 'calm-title', class: 'text-16 muted', style: { fontWeight: '400' }, tabindex: '-1' },
        state.type ? 'Сначала выдохнем — потом к делу' : 'Ты здесь. Давай просто подышим.'),
      segmented(state, ctx.actions)),
    view.el);

  return { el, update: view.update, destroy: view.destroy };
}
