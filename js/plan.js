// Чистая логика плана: без DOM и сети, общая для браузера, serverless-функции и тестов.

export const PROBLEM_TYPES = {
  deadline: 'Дедлайн горит',
  exam: 'Экзамен завтра',
  debt: 'Долг по предмету',
  topic: 'Не понимаю тему',
  bug: 'Сломался код',
  all: 'Всё сразу',
  other: 'Своя ситуация',
};

export const STEP_TITLE_MAX = 160;
export const PLAN_TITLE_MAX = 60;

export const PLAN_LIMITS = { min: 3, max: 7 };
export const SUBSTEP_LIMITS = { min: 2, max: 4 };

export function isValidType(type) {
  return typeof type === 'string' && Object.hasOwn(PROBLEM_TYPES, type);
}

function cleanText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

/**
 * Проверяет шаги из ответа модели: { steps: [{ title, minutes }] }.
 * Возвращает очищенный массив или null, если ответ нельзя показывать.
 * Лишние шаги сверх max отрезаются, слишком короткий список считается ошибкой.
 */
export function validateSteps(data, { min, max } = PLAN_LIMITS) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.steps)) return null;
  if (data.steps.length < min) return null;

  const steps = [];
  for (const raw of data.steps.slice(0, max)) {
    if (!raw || typeof raw !== 'object' || typeof raw.title !== 'string') return null;

    // Модели любят ставить точку в конце пункта, в чек-листе она лишняя
    const title = cleanText(raw.title).replace(/(?<!\.)\.$/, '');
    if (title.length < 3 || title.length > STEP_TITLE_MAX) return null;

    const minutes = Math.round(Number(raw.minutes));
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 120) return null;

    steps.push({ title, minutes });
  }
  return steps;
}

/** Ответ на запрос плана: { title, steps }. Без заголовка план всё равно годится. */
export function validatePlan(data) {
  const steps = validateSteps(data, PLAN_LIMITS);
  if (!steps) return null;
  const title = cleanText(data.title).slice(0, PLAN_TITLE_MAX);
  return { title, steps };
}

export function makeId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function makeStep({ title, minutes }) {
  return { id: makeId(), title, minutes, done: false, substeps: [] };
}

export function createPlan({ type, title = '', steps, source = 'api', fallbackReason = null }) {
  const plan = {
    id: makeId(),
    type,
    title: cleanText(title) || PROBLEM_TYPES[type] || 'План на сейчас',
    source,
    createdAt: Date.now(),
    steps: steps.map(makeStep),
  };
  if (fallbackReason) plan.fallbackReason = fallbackReason;
  return plan;
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

/**
 * Планы из первой версии приложения хранились без заголовка:
 * берём его из описания ситуации или из названия типа.
 */
export function migratePlan(plan) {
  if (!plan || typeof plan !== 'object' || typeof plan.title === 'string') return plan;
  const description = typeof plan.description === 'string' ? cleanText(plan.description) : '';
  const title = description
    ? description.length > PLAN_TITLE_MAX ? `${description.slice(0, PLAN_TITLE_MAX - 1).trim()}…` : description
    : PROBLEM_TYPES[plan.type] ?? 'План на сейчас';
  return { ...plan, title };
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
    typeof plan.title === 'string' &&
    Array.isArray(plan.steps) && plan.steps.length > 0 &&
    plan.steps.every((s) => isItem(s) && Array.isArray(s.substeps) && s.substeps.every(isItem)),
  );
}

/** 45 -> «45 мин», 80 -> «1 ч 20 мин», 120 -> «2 ч» */
export function formatMinutes(minutes) {
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
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
