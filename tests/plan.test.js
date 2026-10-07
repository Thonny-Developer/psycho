import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlan,
  getProgress,
  setStepDone,
  setSubstepDone,
  insertSubsteps,
  isPlanShape,
  plural,
} from '../js/plan.js';

const makePlan = () =>
  createPlan({
    type: 'exam',
    description: 'Матан',
    steps: [
      { title: 'Найди билеты', minutes: 5 },
      { title: 'Разбери первый билет', minutes: 25 },
      { title: 'Перескажи вслух', minutes: 10 },
    ],
  });

test('getProgress считает выполненные шаги', () => {
  let plan = makePlan();
  assert.deepEqual(getProgress(plan), { done: 0, total: 3, percent: 0, complete: false });

  plan = setStepDone(plan, plan.steps[0].id, true);
  assert.deepEqual(getProgress(plan), { done: 1, total: 3, percent: 33, complete: false });

  for (const s of plan.steps) plan = setStepDone(plan, s.id, true);
  assert.deepEqual(getProgress(plan), { done: 3, total: 3, percent: 100, complete: true });
});

test('getProgress для пустого плана', () => {
  assert.deepEqual(getProgress(null), { done: 0, total: 0, percent: 0, complete: false });
});

test('изменения плана не мутируют исходный объект', () => {
  const plan = makePlan();
  const next = setStepDone(plan, plan.steps[0].id, true);
  assert.equal(plan.steps[0].done, false);
  assert.equal(next.steps[0].done, true);
});

test('подшаги закрывают родительский шаг и не считаются в прогрессе', () => {
  let plan = makePlan();
  const stepId = plan.steps[1].id;
  plan = insertSubsteps(plan, stepId, [
    { title: 'Открой учебник', minutes: 3 },
    { title: 'Выпиши формулы', minutes: 5 },
  ]);
  const [a, b] = plan.steps[1].substeps;
  assert.equal(getProgress(plan).total, 3);

  plan = setSubstepDone(plan, stepId, a.id, true);
  assert.equal(plan.steps[1].done, false);

  plan = setSubstepDone(plan, stepId, b.id, true);
  assert.equal(plan.steps[1].done, true);
  assert.equal(getProgress(plan).done, 1);

  plan = setSubstepDone(plan, stepId, a.id, false);
  assert.equal(plan.steps[1].done, false);
});

test('отметка шага переносится на подшаги', () => {
  let plan = makePlan();
  const stepId = plan.steps[0].id;
  plan = insertSubsteps(plan, stepId, [
    { title: 'Открой сайт', minutes: 2 },
    { title: 'Скачай список', minutes: 2 },
  ]);
  plan = setStepDone(plan, stepId, true);
  assert.ok(plan.steps[0].substeps.every((s) => s.done));
});

test('isPlanShape отсекает битые данные', () => {
  assert.equal(isPlanShape(makePlan()), true);
  assert.equal(isPlanShape(JSON.parse(JSON.stringify(makePlan()))), true);
  assert.equal(isPlanShape(null), false);
  assert.equal(isPlanShape({ ...makePlan(), type: 'other' }), false);
  assert.equal(isPlanShape({ ...makePlan(), steps: [] }), false);
  assert.equal(isPlanShape({ ...makePlan(), steps: [{ id: 'x', title: 'y' }] }), false);
});

test('plural склоняет слова', () => {
  const forms = ['шаг', 'шага', 'шагов'];
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => plural(n, forms)),
    ['шаг', 'шага', 'шагов', 'шагов', 'шагов', 'шаг', 'шага', 'шагов', 'шагов']);
});
