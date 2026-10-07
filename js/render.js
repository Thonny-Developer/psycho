// Отрисовка. Пользовательский текст попадает в DOM только через textContent.

import { PROBLEM_TYPES, DESCRIPTION_MAX, getProgress, formatMinutes, totalMinutes } from './plan.js';

export function getElements() {
  const $ = (id) => document.getElementById(id);
  return {
    status: $('status'),
    viewForm: $('view-form'),
    viewPlan: $('view-plan'),
    form: $('plan-form'),
    typeError: $('type-error'),
    description: $('description'),
    counter: $('description-counter'),
    submitBtn: $('submit-btn'),
    formError: $('form-error'),
    skeleton: $('plan-skeleton'),
    banner: $('plan-banner'),
    planType: $('plan-type'),
    planTitle: $('plan-title'),
    planDescription: $('plan-description'),
    progressLabel: $('progress-label'),
    progressBar: $('progress-bar'),
    progressFill: $('progress-fill'),
    steps: $('steps'),
    congrats: $('congrats'),
    saveBtn: $('save-btn'),
    saveError: $('save-error'),
  };
}

/** Небольшой помощник для создания элементов: h('li', { class: 'x' }, 'текст', child) */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
  return el;
}

function setLoading(button, loading, label) {
  button.disabled = loading;
  button.setAttribute('aria-busy', String(loading));
  const labelEl = button.querySelector('.btn__label');
  if (labelEl && label) labelEl.textContent = label;
}

/** Сообщение об ошибке рядом с действием, по желанию с кнопкой «Повторить». */
function fillError(container, error) {
  container.replaceChildren();
  container.hidden = !error;
  if (!error) return;
  container.setAttribute('role', 'alert');
  container.append(h('span', {}, error.message));
  if (error.retryAction) {
    container.append(
      h('button', { type: 'button', class: 'link-btn', dataset: { action: error.retryAction, ...error.data } }, 'Повторить'),
    );
  }
}

export function announce(els, text) {
  // Очистка и запись в следующем кадре, чтобы скринридер прочитал даже повторяющийся текст
  els.status.textContent = '';
  requestAnimationFrame(() => {
    els.status.textContent = text;
  });
}

export function renderCounter(els) {
  const length = els.description.value.length;
  els.counter.textContent = `${length} / ${DESCRIPTION_MAX}`;
  els.counter.classList.toggle('is-limit', length >= DESCRIPTION_MAX);
}

export function renderView(els, state) {
  const showPlan = state.view === 'plan' && state.plan;
  els.viewForm.hidden = Boolean(showPlan);
  els.viewPlan.hidden = !showPlan;
}

export function renderForm(els, state) {
  setLoading(els.submitBtn, state.loading, state.loading ? 'Собираю план…' : 'Спасайте');
  els.skeleton.hidden = !state.loading;
  els.form.setAttribute('aria-busy', String(state.loading));

  els.typeError.hidden = !state.typeError;
  els.typeError.textContent = state.typeError ?? '';
  fillError(els.formError, state.formError);
}

function renderBanner(els, state) {
  const { plan } = state;
  els.banner.replaceChildren();
  els.banner.hidden = plan.source !== 'fallback';
  if (els.banner.hidden) return;

  const text = state.fallbackReason
    ? `Показан офлайн-план. ${state.fallbackReason}`
    : 'Показан офлайн-план: это общий шаблон, без учёта твоего описания.';
  const retry = h(
    'button',
    { type: 'button', class: 'link-btn', dataset: { action: 'retry-plan', focus: 'retry-plan' }, disabled: state.loading },
    state.loading ? 'Пробую…' : 'Попробовать снова',
  );
  els.banner.append(h('span', { class: 'banner__text' }, text), retry);
}

function renderCheckRow({ id, title, minutes, done, number, action, data }) {
  const inputId = `check-${id}`;
  return h(
    'div',
    { class: 'check-row' },
    h('input', {
      type: 'checkbox',
      class: 'check',
      id: inputId,
      checked: done,
      dataset: { action, focus: inputId, ...data },
    }),
    h(
      'label',
      { for: inputId },
      h('span', { class: 'step__title' }, number ? h('span', { class: 'step__num' }, `${number}.`) : null, title),
      Number.isFinite(minutes) ? h('span', { class: 'step__meta' }, formatMinutes(minutes)) : null,
    ),
  );
}

function renderStep(step, index, state) {
  const breakdown = state.breakdown[step.id];
  const isNew = state.newIds.has(step.id);
  const li = h('li', { class: `step${step.done ? ' is-done' : ''}${isNew ? ' is-new' : ''}`, dataset: { stepId: step.id } });

  li.append(
    renderCheckRow({
      ...step,
      number: index + 1,
      action: 'toggle-step',
      data: { stepId: step.id },
    }),
  );

  if (!step.done && step.substeps.length === 0) {
    const loading = breakdown?.loading === true;
    const button = h(
      'button',
      {
        type: 'button',
        class: 'link-btn',
        dataset: { action: 'breakdown', stepId: step.id, focus: `breakdown-${step.id}` },
        'aria-busy': String(loading),
        disabled: loading,
      },
      h('span', { class: 'spinner', 'aria-hidden': 'true' }),
      h('span', { class: 'btn__label' }, loading ? 'Разбиваю…' : 'Разбей этот шаг ещё мельче'),
    );
    li.append(h('div', { class: 'step__actions' }, button));
  }

  if (breakdown?.error) {
    const error = h('div', { class: 'inline-error' });
    fillError(error, { message: breakdown.error, retryAction: 'breakdown', data: { stepId: step.id } });
    li.append(error);
  }

  if (step.substeps.length) {
    li.append(
      h(
        'ul',
        { class: 'substeps', 'aria-label': `Подшаги для шага ${index + 1}` },
        step.substeps.map((sub) =>
          h(
            'li',
            { class: `substep${sub.done ? ' is-done' : ''}${state.newIds.has(sub.id) ? ' is-new' : ''}` },
            renderCheckRow({
              ...sub,
              action: 'toggle-substep',
              data: { stepId: step.id, substepId: sub.id },
            }),
          ),
        ),
      ),
    );
  }

  return li;
}

/**
 * Перерисовывает план целиком и возвращает фокус на тот же элемент,
 * чтобы клавиатурная навигация не сбрасывалась после каждого клика.
 */
export function renderPlan(els, state, { focusKey } = {}) {
  const { plan } = state;
  if (!plan) return;

  const activeKey = focusKey ?? document.activeElement?.dataset?.focus;

  renderBanner(els, state);

  const total = totalMinutes(plan);
  els.planType.textContent = `${PROBLEM_TYPES[plan.type]} · ${formatMinutes(total).replace('~', 'около ')}`;
  els.planDescription.textContent = plan.description;
  els.planDescription.hidden = !plan.description;

  const progress = getProgress(plan);
  els.progressLabel.textContent = `${progress.done} из ${progress.total}`;
  els.progressBar.setAttribute('aria-valuemax', String(progress.total));
  els.progressBar.setAttribute('aria-valuenow', String(progress.done));
  els.progressBar.setAttribute('aria-valuetext', `${progress.done} из ${progress.total}`);
  els.progressFill.style.width = `${progress.percent}%`;

  els.steps.replaceChildren(...plan.steps.map((step, i) => renderStep(step, i, state)));
  els.congrats.hidden = !progress.complete;

  const saved = state.scenarios.some((s) => s.id === plan.id);
  // aria-disabled вместо disabled: кнопка не теряет фокус сразу после нажатия
  els.saveBtn.setAttribute('aria-disabled', String(saved));
  els.saveBtn.textContent = saved ? 'Сценарий сохранён' : 'Сохранить сценарий';
  fillError(els.saveError, state.saveError);

  if (activeKey) {
    const target = els.viewPlan.querySelector(`[data-focus="${CSS.escape(activeKey)}"]`);
    target?.focus({ preventScroll: true });
  }
}
