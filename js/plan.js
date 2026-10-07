// Чистая логика плана: без DOM и сети, общая для браузера, serverless-функции и тестов.

export const PROBLEM_TYPES = {
  deadline: 'Дедлайн по проекту',
  exam: 'Экзамен завтра',
  debt: 'Долг по предмету',
  bug: 'Сломался код',
  topic: 'Не понимаю тему',
  all: 'Всё сразу',
};

export const DESCRIPTION_MAX = 300;
export const STEP_TITLE_MAX = 160;

export const PLAN_LIMITS = { min: 3, max: 7 };
export const SUBSTEP_LIMITS = { min: 2, max: 5 };

export function isValidType(type) {
  return typeof type === 'string' && Object.hasOwn(PROBLEM_TYPES, type);
}

/**
 * Проверяет ответ модели вида { steps: [{ title, minutes }] }.
 * Возвращает очищенный массив шагов или null, если ответ нельзя показывать.
 * Лишние шаги сверх max отрезаются, слишком короткий список считается ошибкой.
 */
export function validateSteps(data, { min, max } = PLAN_LIMITS) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.steps)) return null;
  if (data.steps.length < min) return null;

  const steps = [];
  for (const raw of data.steps.slice(0, max)) {
    if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string') return null;

    const title = raw.title.replace(/\s+/g, ' ').trim();
    if (title.length < 3 || title.length > STEP_TITLE_MAX) return null;

    const minutes = Math.round(Number(raw.minutes));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) return null;

    steps.push({ title, minutes });
  }
  return steps;
}

export function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function makeStep({ title, minutes }) {
  return { id: makeId(), title, minutes, done: false, substeps: [] };
}

export function createPlan({ type, description = '', steps, source = 'api' }) {
  return {
    id: makeId(),
    type,
    description: description.trim(),
    source,
    createdAt: Date.now(),
    steps: steps.map(makeStep),
  };
}

/** Прогресс считается по основным шагам, подшаги только помогают закрыть шаг. */
export function getProgress(plan) {
  const total = plan?.steps?.length ?? 0;
  const done = total ? plan.steps.filter((s) => s.done).length : 0;
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    complete: total > 0 && done === total,
  };
}

function mapStep(plan, stepId, fn) {
  return { ...plan, steps: plan.steps.map((s) => (s.id === stepId ? fn(s) : s)) };
}

/** Отметка шага переносится на все его подшаги. */
export function setStepDone(plan, stepId, done) {
  return mapStep(plan, stepId, (step) => ({
    ...step,
    done,
    substeps: step.substeps.map((sub) => ({ ...sub, done })),
  }));
}

/** Шаг считается выполненным, когда отмечены все его подшаги. */
export function setSubstepDone(plan, stepId, substepId, done) {
  return mapStep(plan, stepId, (step) => {
    const substeps = step.substeps.map((sub) => (sub.id === substepId ? { ...sub, done } : sub));
    return { ...step, substeps, done: substeps.every((sub) => sub.done) };
  });
}

export function insertSubsteps(plan, stepId, steps) {
  return mapStep(plan, stepId, (step) => ({
    ...step,
    substeps: steps.map(({ title, minutes }) => ({ id: makeId(), title, minutes, done: step.done })),
  }));
}

export function findStep(plan, stepId) {
  return plan?.steps.find((s) => s.id === stepId) ?? null;
}

/** Проверка формы плана при чтении из localStorage: битые данные не должны ломать интерфейс. */
export function isPlanShape(plan) {
  const isItem = (s) =>
    s && typeof s === 'object' && typeof s.id === 'string' && typeof s.title === 'string' &&
    typeof s.done === 'boolean';
  return Boolean(
    plan && typeof plan === 'object' &&
    typeof plan.id === 'string' &&
    isValidType(plan.type) &&
    typeof plan.description === 'string' &&
    Array.isArray(plan.steps) && plan.steps.length > 0 &&
    plan.steps.every((s) => isItem(s) && Array.isArray(s.substeps) && s.substeps.every(isItem)),
  );
}

export function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 60) return `~${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `~${h} ч ${m} мин` : `~${h} ч`;
}

export function totalMinutes(plan) {
  return plan.steps.reduce((sum, s) => sum + (Number.isFinite(s.minutes) ? s.minutes : 0), 0);
}

/** plural(5, ['шаг', 'шага', 'шагов']) -> 'шагов' */
export function plural(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
