import { h, icon, replaceKeepFocus, typingDots, skeleton, checkbox } from '../ui.js';
import { IC } from '../icons.js';
import { typeLabel } from '../content.js';
import { getProgress, totalMinutes, formatMinutes } from '../plan.js';

function stepNode(step, index, state, actions) {
  const split = state.split[step.id];
  const loading = split === 'loading';
  const canSplit = !step.done && step.substeps.length === 0 && !loading;

  return h('li', { class: `step${step.done ? ' is-done' : ''}` },
    checkbox({
      checked: step.done,
      label: `Шаг ${index + 1}: ${step.title}`,
      focus: `step-${step.id}`,
      onChange: (e) => actions.toggleStep(step.id, e.target.checked),
    }),
    h('div', { class: 'step__body' },
      h('span', { class: 'step__text' }, step.title),
      h('div', { class: 'step__meta' },
        Number.isFinite(step.minutes)
          ? h('span', { class: 'step__time' }, icon(IC.clock, 15, { strokeWidth: 1.9 }), `~${formatMinutes(step.minutes)}`)
          : null,
        canSplit
          ? h('button', {
            class: 'split-btn',
            type: 'button',
            'aria-label': `Разбей этот шаг ещё мельче: ${step.title}`,
            dataset: { focus: `split-${step.id}` },
            onClick: () => actions.splitStep(step.id),
          }, icon(IC.split, 16, { strokeWidth: 1.9 }), 'Разбей ещё мельче')
          : null),
      loading
        ? h('div', { class: 'split-status', role: 'status' },
          h('span', { class: 'status-line' }, typingDots(), 'Делю на шаги поменьше…'),
          skeleton(3, 'small'))
        : null,
      split?.error
        ? h('div', { class: 'split-error', role: 'alert' },
          h('span', {}, split.error),
          h('button', { class: 'link', type: 'button', dataset: { focus: `split-${step.id}` }, onClick: () => actions.splitStep(step.id) }, 'Повторить'))
        : null,
      step.substeps.length
        ? h('ul', { class: 'subs', 'aria-label': `Подшаги для шага ${index + 1}` },
          step.substeps.map((sub) => h('li', { class: `sub${sub.done ? ' is-done' : ''}${state.newIds.has(sub.id) ? ' is-new' : ''}` },
            checkbox({
              small: true,
              checked: sub.done,
              label: sub.title,
              focus: `sub-${sub.id}`,
              onChange: (e) => actions.toggleSubstep(step.id, sub.id, e.target.checked),
            }),
            h('span', { class: 'sub__text' }, sub.title, ' ',
              Number.isFinite(sub.minutes) ? h('span', { class: 'sub__time' }, `· ${formatMinutes(sub.minutes)}`) : null))))
        : null));
}

function offlineNote(state, actions) {
  const { plan } = state;
  return h('div', { class: 'soft-note', role: 'status' },
    h('span', { class: 'soft-note__title' }, icon(IC.wifiOff, 20), 'Показан офлайн-план'),
    h('span', { class: 'text-15 muted' },
      `${plan.fallbackReason ?? 'Связаться с AI не получилось.'} Это не ты. План собран по шаблону и уже работает.`),
    h('button', {
      class: 'btn btn--soft',
      type: 'button',
      style: { alignSelf: 'flex-start' },
      disabled: state.planRetrying,
      dataset: { focus: 'retry-plan' },
      onClick: actions.retryPlan,
    }, icon(IC.retry, 18, { strokeWidth: 1.9 }), state.planRetrying ? 'Пробую…' : 'Повторить'));
}

export function createPlanScreen({ actions }) {
  const title = h('h1', { class: 'plan-title', tabindex: '-1' });
  const pill = h('span', { class: 'pill' });
  const content = h('div', { class: 'stack', style: { gap: '20px' } });
  const dock = h('div', { class: 'dock dock--line' });

  const el = h('section', { class: 'screen', 'aria-labelledby': 'plan-heading' },
    h('div', { class: 'scroll' },
      h('div', { class: 'plan-body' },
        h('div', { class: 'plan-head', id: 'plan-heading' }, pill, title),
        content)),
    dock);

  return {
    el,
    focusTarget: title,
    update(state, { focusKey } = {}) {
      const { plan } = state;
      const loading = state.planStatus === 'loading' || !plan;
      pill.textContent = typeLabel(plan?.type ?? state.type ?? 'all');
      title.textContent = loading ? 'Собираю план' : plan.title;

      if (loading) {
        if (!content.querySelector('.skeleton--big')) {
          content.replaceChildren(h('div', { class: 'stack', style: { gap: '14px' }, role: 'status' },
            h('span', { class: 'status-line text-16' }, typingDots(), 'Думаю, как разложить по шагам…'),
            skeleton(4, 'big')));
        }
        dock.hidden = true;
        return;
      }

      const p = getProgress(plan);
      replaceKeepFocus(content, [
        plan.source === 'fallback' ? offlineNote(state, actions) : null,
        h('div', { class: 'progress-card' },
          h('div', { class: 'progress-card__top' },
            h('span', { class: 'progress-card__label' }, p.complete ? 'Всё сделано' : `Сделано ${p.done} из ${p.total}`),
            h('span', { class: 'text-14 muted' }, `≈ ${formatMinutes(totalMinutes(plan))}`)),
          h('div', {
            class: 'bar bar--thick',
            role: 'progressbar',
            'aria-label': 'Прогресс плана',
            'aria-valuemin': '0',
            'aria-valuemax': String(p.total),
            'aria-valuenow': String(p.done),
            'aria-valuetext': `${p.done} из ${p.total}`,
          }, h('div', { class: 'bar__fill', style: { width: `${p.percent}%` } }))),
        h('ol', { class: 'steps' }, plan.steps.map((s, i) => stepNode(s, i, state, actions))),
        h('p', { class: 'plan-hint' }, 'Не обязательно по порядку. Один шаг — уже движение.'),
        p.complete ? null : h('button', { class: 'btn btn--text btn--auto', type: 'button', dataset: { focus: 'plan-break' }, onClick: actions.startBreak },
          icon(IC.timer, 20, { strokeWidth: 1.8 }), 'Перерыв на 5 минут'),
      ], focusKey);

      const saved = state.scenarios.some((s) => s.id === plan.id);
      dock.hidden = false;
      replaceKeepFocus(dock, saved
        ? h('div', { class: 'saved-bar' },
          h('span', { class: 'saved-bar__label' }, icon(IC.check, 18, { strokeWidth: 2.2 }), 'Сохранено'),
          h('button', { class: 'link', type: 'button', dataset: { focus: 'save' }, onClick: actions.openSaved }, 'Мои сценарии'))
        : h('button', { class: 'btn', type: 'button', dataset: { focus: 'save' }, onClick: actions.savePlan },
          icon(IC.bookmark, 20, { strokeWidth: 1.9 }), 'Сохранить план'), focusKey);
    },
  };
}
