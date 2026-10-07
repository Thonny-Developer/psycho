import {
  createPlan,
  getProgress,
  setStepDone,
  setSubstepDone,
  insertSubsteps,
  findStep,
  isValidType,
  plural,
} from './plan.js';
import { getFallbackSteps } from './fallback.js';
import { requestSteps } from './api.js';
import { createStorage, MAX_SCENARIOS } from './storage.js';
import {
  getElements,
  renderForm,
  renderPlan,
  renderSaved,
  renderView,
  renderCounter,
  announce,
} from './render.js';

const els = getElements();
const storage = createStorage();

const state = {
  view: 'form',
  plan: null,
  loading: false,
  typeError: null,
  formError: null,
  fallbackReason: null,
  saveError: null,
  breakdown: {}, // stepId -> { loading: true } | { error: 'текст' }
  newIds: new Set(), // элементы, которые нужно один раз анимировать при появлении
  scenarios: [],
  savedError: null,
  pendingDelete: null, // id сценария, для которого ждём подтверждения удаления
};

let pendingDeleteTimer = null;

function render(options) {
  renderView(els, state);
  renderForm(els, state);
  renderPlan(els, state, options);
  renderSaved(els, state, options);
  state.newIds.clear();
}

const STORAGE_ERRORS = {
  quota: 'В браузере закончилось место для сохранений. Удали старые сценарии.',
  unavailable: 'Браузер не даёт сохранять данные, например в приватном режиме.',
  limit: `Можно сохранить до ${MAX_SCENARIOS} сценариев. Удали ненужные, чтобы добавить новый.`,
};

/**
 * Сохраняет текущий план, чтобы он пережил перезагрузку,
 * и синхронизирует его с сохранённым сценарием, если он там есть.
 */
function persistPlan() {
  const current = storage.saveCurrent(state.plan);
  let synced = { ok: true };
  if (state.plan) {
    synced = storage.updateScenario(state.plan);
    state.scenarios = synced.scenarios;
  }
  const error = !current.ok ? current.error : !synced.ok ? synced.error : null;
  state.saveError = error
    ? { message: `Прогресс не сохранится после перезагрузки. ${STORAGE_ERRORS[error]}` }
    : null;
}

function selectedType() {
  return els.form.elements.type.value;
}

/** Короткое объяснение для плашки офлайн-плана. */
function fallbackReason(error) {
  switch (error.kind) {
    case 'offline':
      return 'Нет интернета.';
    case 'timeout':
      return 'Сервис долго не отвечал.';
    case 'rate_limit':
      return 'Слишком много запросов, попробуй через минуту.';
    default:
      return 'Сервис сейчас недоступен.';
  }
}

function showPlan(plan, { reason = null } = {}) {
  state.plan = plan;
  state.view = 'plan';
  state.fallbackReason = reason;
  state.breakdown = {};
  state.newIds = new Set(plan.steps.map((s) => s.id));
  persistPlan();
  render();
  els.planTitle.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  const n = plan.steps.length;
  announce(els, `План готов: ${n} ${plural(n, ['шаг', 'шага', 'шагов'])}${plan.source === 'fallback' ? ', офлайн-версия' : ''}`);
}

/**
 * Основной сценарий: просим план у API, при любой проблеме с сервисом показываем шаблон.
 * Ошибку без плана показываем только на некорректный запрос: шаблон тут ничего не исправит.
 */
async function buildPlan({ type, description }) {
  if (state.loading) return;
  state.loading = true;
  state.formError = null;
  render();

  try {
    const steps = await requestSteps({ type, description });
    showPlan(createPlan({ type, description, steps, source: 'api' }));
  } catch (error) {
    if (error.kind === 'bad_request') {
      state.formError = { message: error.message, retryAction: 'retry-submit' };
    } else {
      showPlan(createPlan({ type, description, steps: getFallbackSteps(type), source: 'fallback' }), {
        reason: fallbackReason(error),
      });
    }
  } finally {
    state.loading = false;
    render();
    // кнопка была disabled и потеряла фокус: возвращаем его к ошибке
    if (state.formError) els.formError.querySelector('button')?.focus();
  }
}

/** Повтор из плашки офлайн-плана: при неудаче текущий план с отметками остаётся на месте. */
async function retryPlan() {
  const { plan } = state;
  if (state.loading || !plan) return;
  state.loading = true;
  render({ focusKey: 'retry-plan' });

  try {
    const steps = await requestSteps({ type: plan.type, description: plan.description });
    state.loading = false;
    showPlan(createPlan({ type: plan.type, description: plan.description, steps, source: 'api' }));
  } catch (error) {
    state.loading = false;
    if (state.plan === plan) state.fallbackReason = `${fallbackReason(error)} Попробуй позже.`;
    render({ focusKey: 'retry-plan' });
    announce(els, 'Сервис всё ещё недоступен, остаётся офлайн-план');
  }
}

function onSubmit(event) {
  event.preventDefault();
  if (state.loading) return;

  const type = selectedType();
  if (!isValidType(type)) {
    state.typeError = 'Выбери, что случилось, и план подстроится под ситуацию';
    render();
    els.form.querySelector('input[name="type"]').focus();
    return;
  }
  state.typeError = null;
  buildPlan({ type, description: els.description.value.trim() });
}

async function breakdownStep(stepId) {
  const plan = state.plan;
  const step = findStep(plan, stepId);
  if (!step || state.breakdown[stepId]?.loading) return;

  state.breakdown[stepId] = { loading: true };
  render();

  try {
    const substeps = await requestSteps({ type: plan.type, description: plan.description, step: step.title });
    // Пока ждали ответ, пользователь мог открыть другой план
    if (state.plan?.id !== plan.id || !findStep(state.plan, stepId)) return;

    delete state.breakdown[stepId];
    state.plan = insertSubsteps(state.plan, stepId, substeps);
    persistPlan();
    const inserted = findStep(state.plan, stepId).substeps;
    inserted.forEach((sub) => state.newIds.add(sub.id));
    render({ focusKey: `check-${inserted[0].id}` });
    announce(els, `Добавлено подшагов: ${inserted.length}`);
  } catch (error) {
    if (state.plan?.id !== plan.id) return;
    const reason = error.kind === 'offline' ? 'Нет интернета.' : fallbackReason(error);
    state.breakdown[stepId] = { error: `Не получилось разбить шаг. ${reason}` };
    render();
  }
}

function updatePlan(plan) {
  const before = getProgress(state.plan);
  state.plan = plan;
  persistPlan();
  render();

  const after = getProgress(plan);
  if (after.complete && !before.complete) announce(els, 'Все шаги выполнены. Можно выдохнуть');
  else if (after.done !== before.done) announce(els, `Выполнено ${after.done} из ${after.total}`);
}

function onPlanChange(event) {
  const input = event.target;
  const { action, stepId, substepId } = input.dataset;
  if (action === 'toggle-step') updatePlan(setStepDone(state.plan, stepId, input.checked));
  if (action === 'toggle-substep') updatePlan(setSubstepDone(state.plan, stepId, substepId, input.checked));
}

function onPlanClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, stepId } = button.dataset;

  if (action === 'breakdown') breakdownStep(stepId);
  if (action === 'retry-plan') retryPlan();
  if (action === 'save') saveScenario();
  if (action === 'new-plan') {
    state.view = 'form';
    state.plan = null;
    state.breakdown = {};
    persistPlan();
    render();
    els.form.querySelector('input[name="type"]:checked, input[name="type"]').focus();
  }
}

function saveScenario() {
  if (!state.plan || state.scenarios.some((s) => s.id === state.plan.id)) return;
  const result = storage.addScenario(state.plan);
  state.scenarios = result.scenarios;
  state.saveError = result.ok
    ? null
    : { message: STORAGE_ERRORS[result.error], retryAction: result.error === 'limit' ? null : 'save' };
  render({ focusKey: 'save' });
  if (result.ok) announce(els, 'Сценарий сохранён');
}

function openScenario(id) {
  const scenario = state.scenarios.find((s) => s.id === id);
  if (!scenario) return;
  state.plan = scenario;
  state.view = 'plan';
  state.fallbackReason = null;
  state.breakdown = {};
  state.saveError = null;
  persistPlan();
  render();
  els.planTitle.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  announce(els, 'Сценарий открыт');
}

function resetPendingDelete() {
  clearTimeout(pendingDeleteTimer);
  if (state.pendingDelete) {
    state.pendingDelete = null;
    renderSaved(els, state);
  }
}

/** Удаление в два нажатия: первое спрашивает «Точно удалить?», второе удаляет. */
function deleteScenario(id) {
  if (state.pendingDelete !== id) {
    clearTimeout(pendingDeleteTimer);
    state.pendingDelete = id;
    renderSaved(els, state);
    pendingDeleteTimer = setTimeout(resetPendingDelete, 4000);
    return;
  }

  clearTimeout(pendingDeleteTimer);
  state.pendingDelete = null;
  const index = state.scenarios.findIndex((s) => s.id === id);
  const result = storage.deleteScenario(id);
  state.scenarios = result.scenarios;
  state.savedError = result.ok ? null : { message: STORAGE_ERRORS[result.error] };

  // Фокус на соседний сценарий, а если список опустел, то на заголовок раздела
  const next = state.scenarios[Math.min(index, state.scenarios.length - 1)];
  render({ focusKey: next ? `open-${next.id}` : undefined });
  if (!next) els.savedTitle.focus();
  if (result.ok) announce(els, 'Сценарий удалён');
}

function onSavedClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'open-scenario') openScenario(id);
  if (action === 'delete-scenario') deleteScenario(id);
}

function init() {
  els.form.addEventListener('submit', onSubmit);
  els.form.addEventListener('change', (event) => {
    if (event.target.name === 'type' && state.typeError) {
      state.typeError = null;
      render();
    }
  });
  els.formError.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="retry-submit"]')) els.form.requestSubmit();
  });
  els.description.addEventListener('input', () => renderCounter(els));
  els.viewPlan.addEventListener('change', onPlanChange);
  els.viewPlan.addEventListener('click', onPlanClick);
  els.savedList.addEventListener('click', onSavedClick);

  state.scenarios = storage.listScenarios();
  const current = storage.loadCurrent();
  if (current) {
    state.plan = current;
    state.view = 'plan';
  }

  renderCounter(els);
  render();
}

init();
