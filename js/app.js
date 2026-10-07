import { createPlan, getProgress, setStepDone, setSubstepDone, isValidType } from './plan.js';
import { getFallbackSteps } from './fallback.js';
import { getElements, renderForm, renderPlan, renderView, renderCounter, announce } from './render.js';

const els = getElements();

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
};

function render(options) {
  renderView(els, state);
  renderForm(els, state);
  renderPlan(els, state, options);
  state.newIds.clear();
}

function selectedType() {
  return els.form.elements.type.value;
}

function showPlan(plan, { reason = null } = {}) {
  state.plan = plan;
  state.view = 'plan';
  state.fallbackReason = reason;
  state.breakdown = {};
  state.saveError = null;
  state.newIds = new Set(plan.steps.map((s) => s.id));
  render();
  els.planTitle.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  announce(els, `План готов: ${plan.steps.length} шагов`);
}

function buildPlan() {
  const type = selectedType();
  const description = els.description.value.trim();
  const plan = createPlan({ type, description, steps: getFallbackSteps(type), source: 'fallback' });
  showPlan(plan);
}

function onSubmit(event) {
  event.preventDefault();
  if (state.loading) return;

  if (!isValidType(selectedType())) {
    state.typeError = 'Выбери, что случилось, и план подстроится под ситуацию';
    render();
    els.form.querySelector('input[name="type"]').focus();
    return;
  }
  state.typeError = null;
  buildPlan();
}

function updatePlan(plan) {
  const before = getProgress(state.plan);
  state.plan = plan;
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

  if (button.dataset.action === 'new-plan') {
    state.view = 'form';
    state.plan = null;
    render();
    els.form.querySelector('input[name="type"]:checked, input[name="type"]').focus();
  }
}

function init() {
  els.form.addEventListener('submit', onSubmit);
  els.form.addEventListener('change', (event) => {
    if (event.target.name === 'type' && state.typeError) {
      state.typeError = null;
      render();
    }
  });
  els.description.addEventListener('input', () => renderCounter(els));
  els.viewPlan.addEventListener('change', onPlanChange);
  els.viewPlan.addEventListener('click', onPlanClick);

  renderCounter(els);
  render();
}

init();
