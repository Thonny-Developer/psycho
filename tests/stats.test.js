import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStats, uniquePlans, buildExport, exportFileName } from '../js/stats.js';
import { createPlan, setStepDone, insertSubsteps } from '../js/plan.js';
import { makeMessage } from '../js/chat.js';

const makePlan = (title = 'Матан') =>
  createPlan({ type: 'exam', title, steps: [{ title: 'Найди билеты', minutes: 5 }, { title: 'Разбери билет', minutes: 25 }, { title: 'Перескажи', minutes: 10 }] });

const complete = (plan) => plan.steps.reduce((p, s) => setStepDone(p, s.id, true), plan);

test('статистика: завершённые планы и сделанные шаги', () => {
  const a = complete(makePlan());
  const b = setStepDone(makePlan(), makePlan().steps[0].id, true);
  const c = setStepDone(b, b.steps[0].id, true);
  assert.deepEqual(computeStats([a, c]), { completedPlans: 1, doneSteps: 4 });
  assert.deepEqual(computeStats([]), { completedPlans: 0, doneSteps: 0 });
});

test('один и тот же план из разных источников считается один раз', () => {
  const a = complete(makePlan());
  assert.equal(uniquePlans([a], [a], [a, null]).length, 1);
  assert.deepEqual(computeStats(uniquePlans([a], [a])), { completedPlans: 1, doneSteps: 3 });
});

test('экспорт: всё нужное и ничего лишнего', () => {
  let plan = makePlan();
  plan = insertSubsteps(plan, plan.steps[1].id, [{ title: 'Открой учебник', minutes: 3 }, { title: 'Выпиши формулы', minutes: 5 }]);
  const data = buildExport({
    account: { id: 'secret-id', email: 'anna@example.com' },
    profile: { display_name: 'Анна', avatar: 'moon', timezone: 'Asia/Almaty', reminder_time: '19:00:00', created_at: '2026-10-01T00:00:00Z' },
    settings: { theme: 'dark', fs: 'm', reduce: null },
    plans: [plan],
    conversation: [makeMessage('ai', 'Привет'), makeMessage('user', 'Курсовая'), makeMessage('crisis', '', { private: true })],
    now: new Date('2026-10-07T10:00:00Z'),
  });
  assert.equal(data.exported_at, '2026-10-07T10:00:00.000Z');
  assert.equal(data.account.email, 'anna@example.com');
  assert.ok(!JSON.stringify(data).includes('secret-id'), 'внутренний id аккаунта не нужен человеку');
  assert.equal(data.plans[0].steps[1].substeps.length, 2);
  assert.deepEqual(data.conversation, [{ role: 'помощник', text: 'Привет' }, { role: 'я', text: 'Курсовая' }]);
  assert.equal(buildExport({ settings: {}, plans: [] }).account, null);
  assert.equal(exportFileName(new Date('2026-10-07T10:00:00Z')), 'kero-psycho-helper-2026-10-07.json');
});
