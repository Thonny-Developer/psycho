// Дыхание 4-2-6: вдох 4 секунды, пауза 2, выдох 6. Цикл 12 секунд.

export const BREATH = { inhale: 4000, hold: 2000, exhale: 6000 };
export const CYCLE_MS = BREATH.inhale + BREATH.hold + BREATH.exhale;
export const CYCLES_GOAL = 5;

const MIN_SCALE = 0.6;
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

export const PHASE_WORD = { in: 'Вдох', hold: 'Пауза', out: 'Выдох' };
export const PHASE_GUIDE = {
  in: 'Медленно вдыхай носом',
  hold: 'Чуть задержи дыхание',
  out: 'Долго выдыхай ртом, как через трубочку',
};

/** Фаза дыхания для прошедшего времени: { phase, sec, scale, cycle } */
export function breathPhase(elapsedMs) {
  const elapsed = Math.max(0, elapsedMs);
  const t = elapsed % CYCLE_MS;
  const cycle = Math.floor(elapsed / CYCLE_MS) + 1;
  const holdEnd = BREATH.inhale + BREATH.hold;

  if (t < BREATH.inhale) {
    return { phase: 'in', sec: Math.ceil((BREATH.inhale - t) / 1000), scale: MIN_SCALE + (1 - MIN_SCALE) * ease(t / BREATH.inhale), cycle };
  }
  if (t < holdEnd) {
    return { phase: 'hold', sec: Math.ceil((holdEnd - t) / 1000), scale: 1, cycle };
  }
  return { phase: 'out', sec: Math.ceil((CYCLE_MS - t) / 1000), scale: 1 - (1 - MIN_SCALE) * ease((t - holdEnd) / BREATH.exhale), cycle };
}

export function cycleLabel(cycle) {
  return cycle <= CYCLES_GOAL ? `Цикл ${cycle} из ${CYCLES_GOAL}` : `Цикл ${cycle} · можно продолжать`;
}

/**
 * Анимация круга через requestAnimationFrame. Круг двигается напрямую через style,
 * а текст обновляется только при смене фазы или секунды, без перерисовки экрана.
 */
export function createBreathController({ core, halo, onTick, isReduced }) {
  let raf = null;
  let elapsed = 0;
  let startedAt = 0;
  let last = '';

  function frame(now) {
    raf = requestAnimationFrame(frame);
    elapsed = now - startedAt;
    const state = breathPhase(elapsed);

    if (isReduced()) {
      core.style.transform = 'scale(.82)';
      halo.style.transform = 'scale(1)';
      halo.style.opacity = '.5';
    } else {
      const k = (state.scale - MIN_SCALE) / (1 - MIN_SCALE);
      core.style.transform = `scale(${state.scale})`;
      halo.style.transform = `scale(${0.72 + k * 0.28})`;
      halo.style.opacity = String(0.25 + k * 0.5);
    }

    const key = `${state.phase}:${state.sec}:${state.cycle}`;
    if (key !== last) {
      last = key;
      onTick(state);
    }
  }

  return {
    get running() {
      return raf !== null;
    },
    start() {
      if (raf !== null) return;
      startedAt = performance.now() - elapsed;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
    },
    reset() {
      this.stop();
      elapsed = 0;
      last = '';
    },
  };
}
