import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlan,
  getProgress,
  setStepDone,
  setSubstepDone,
  insertSubsteps,
  isPlanShape,
  migratePlan,
  formatMinutes,
  plural,
} from '../js/plan.js';

const makePlan = () =>
  createPlan({
    type: 'exam',
    title: 'Матан',
    steps: [
      { title: 'Найди билеты', minutes: 5 },
      { title: 'Разбери первый билет', minutes: 25 },
      { title: 'Перескажи вслух', minutes: 10 },
    ],
  });

test('createPlan подставляет заголовок, если модель его не дала', () => {
  assert.equal(makePlan().title, 'Матан');
  assert.equal(createPlan({ type: 'bug', title: '  ', steps: [] }).title, 'Сломался код');
  const offline = createPlan({ type: 'all', steps: [], source: 'fallback', fallbackReason: 'Сейчас нет сети.' });
  assert.equal(offline.fallbackReason, 'Сейчас нет сети.');
});

test('getProgress считает выполненные шаги', () => {
  let plan = makePlan();
  assert.deepEqual(getProgress(plan), { done: 0, total: 3, percent: 0, complete: false });
  plan = setStepDone(plan, plan.steps[0].id, true);
  assert.deepEqual(getProgress(plan), { done: 1, total: 3, percent: 33, complete: false });
  for (const s of plan.steps) plan = setStepDone(plan, s.id, true);
  assert.deepEqual(getProgress(plan), { done: 3, total: 3, percent: 100, complete: true });
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
  plan = insertSubsteps(plan, stepId, [{ title: 'Открой учебник', minutes: 3 }, { title: 'Выпиши формулы', minutes: 5 }]);
  const [a, b] = plan.steps[1].substeps;
  assert.equal(getProgress(plan).total, 3);
  plan = setSubstepDone(plan, stepId, a.id, true);
  assert.equal(plan.steps[1].done, false);
  plan = setSubstepDone(plan, stepId, b.id, true);
  assert.equal(plan.steps[1].done, true);
  plan = setSubstepDone(plan, stepId, a.id, false);
  assert.equal(plan.steps[1].done, false);
  plan = setStepDone(plan, stepId, true);
  assert.ok(plan.steps[1].substeps.every((s) => s.done));
});

test('migratePlan даёт заголовок планам первой версии', () => {
  const old = { ...makePlan(), description: 'Курсовая по базам данных' };
  delete old.title;
  assert.equal(migratePlan(old).title, 'Курсовая по базам данных');
  delete old.description;
  assert.equal(migratePlan(old).title, 'Экзамен завтра');
  const long = migratePlan({ ...old, description: 'а'.repeat(80) }).title;
  assert.equal(long.length, 60);
  assert.ok(long.endsWith('…'));
  assert.equal(migratePlan(makePlan()).title, 'Матан');
});

test('isPlanShape отсекает битые данные', () => {
  assert.equal(isPlanShape(makePlan()), true);
  assert.equal(isPlanShape(JSON.parse(JSON.stringify(makePlan()))), true);
  assert.equal(isPlanShape(null), false);
  assert.equal(isPlanShape({ ...makePlan(), type: 'hack' }), false);
  assert.equal(isPlanShape({ ...makePlan(), type: 'other' }), true, 'своя ситуация');
  assert.equal(isPlanShape({ ...makePlan(), title: undefined }), false);
  assert.equal(isPlanShape({ ...makePlan(), steps: [] }), false);
  assert.equal(isPlanShape({ ...makePlan(), steps: [{ id: 'x', title: 'y' }] }), false);
});

test('formatMinutes и plural', () => {
  assert.deepEqual([5, 60, 80, 125].map(formatMinutes), ['5 мин', '1 ч', '1 ч 20 мин', '2 ч 5 мин']);
  const forms = ['шаг', 'шага', 'шагов'];
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => plural(n, forms)),
    ['шаг', 'шага', 'шагов', 'шагов', 'шагов', 'шаг', 'шага', 'шагов', 'шагов']);
});
