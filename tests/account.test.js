import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateEmail,
  validatePassword,
  validateName,
  authErrorMessage,
  planToRow,
  rowToPlan,
  mergeOutbox,
  guestPlansForImport,
} from '../js/account.js';
import { createPlan, setStepDone, insertSubsteps } from '../js/plan.js';

test('проверка почты, пароля и имени', () => {
  assert.equal(validateEmail('anna@example.com'), null);
  assert.equal(validateEmail('  anna@example.kz '), null);
  assert.match(validateEmail(''), /Впиши почту/);
  assert.match(validateEmail('anna@example'), /опечатка/);
  assert.match(validateEmail('anna example.com'), /опечатка/);

  assert.equal(validatePassword('12345678'), null);
  assert.match(validatePassword(''), /Придумай/);
  assert.match(validatePassword('1234567'), /8 символов/);
  assert.match(validatePassword('x'.repeat(73)), /длинный/);

  assert.equal(validateName(''), null);
  assert.match(validateName('я'.repeat(41)), /покороче/);
});

test('ошибки входа звучат спокойно и без деталей сервера', () => {
  assert.match(authErrorMessage({ code: 'invalid_credentials', status: 400 }), /не подошли/);
  assert.match(authErrorMessage({ code: 'user_already_exists', status: 422 }), /уже есть аккаунт/);
  assert.match(authErrorMessage({ name: 'AuthRetryableFetchError', status: 0 }), /Нет связи/);
  assert.match(authErrorMessage({ code: 'over_email_send_rate_limit', status: 429 }), /Спам/);
  assert.match(authErrorMessage({ status: 400, message: 'Invalid login credentials' }), /не подошли/, 'старый формат без кода');
  const unknown = authErrorMessage({ code: 'something_internal', status: 500, message: 'secret details' });
  assert.ok(!unknown.includes('secret'));
  assert.match(unknown, /Это не ты/);
});

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

test('план ⇄ строка таблицы без потерь', () => {
  let plan = makePlan();
  plan = insertSubsteps(plan, plan.steps[1].id, [{ title: 'Открой учебник', minutes: 3 }, { title: 'Выпиши формулы', minutes: 5 }]);
  plan = setStepDone(plan, plan.steps[0].id, true);

  const row = planToRow(plan, { saved: true, savedAt: Date.UTC(2026, 9, 7) });
  assert.equal(row.saved_at, '2026-10-07T00:00:00.000Z');
  assert.equal(row.created_at, undefined, 'дату создания ставит сервер');

  const back = rowToPlan({ ...row, created_at: new Date(plan.createdAt).toISOString(), completed_at: null });
  assert.deepEqual(back.steps, plan.steps);
  assert.equal(back.savedAt, Date.UTC(2026, 9, 7));
  assert.equal(back.title, 'Матан');
});

test('saved_at меняется только явно', () => {
  const plan = makePlan();
  assert.equal('saved_at' in planToRow(plan), false);
  assert.equal(planToRow(plan, { saved: false }).saved_at, null);
  const imported = planToRow(plan, { imported: true });
  assert.equal(imported.imported, true);
  assert.ok(imported.created_at);
});

test('битая строка из базы не ломает приложение', () => {
  assert.equal(rowToPlan(null), null);
  assert.equal(rowToPlan({ id: 'x', type: 'hack', title: 't', steps: [] }), null);
  assert.equal(rowToPlan({ id: 'x', type: 'exam', title: 't', steps: 'нет' }), null);
});

test('очередь склеивает изменения одного плана', () => {
  let outbox = {};
  outbox = mergeOutbox(outbox, { id: 'p1', title: 'Матан', saved_at: '2026-10-07T00:00:00.000Z' });
  outbox = mergeOutbox(outbox, { id: 'p1', title: 'Матан', steps: [1] });
  assert.equal(outbox.p1.saved_at, '2026-10-07T00:00:00.000Z', 'правка шага не сбрасывает сохранение');
  assert.deepEqual(outbox.p1.steps, [1]);
  outbox = mergeOutbox(outbox, { id: 'p1', saved_at: null });
  assert.equal(outbox.p1.saved_at, null);
});

test('перенос гостевых данных без дублей', () => {
  const a = makePlan();
  const b = makePlan();
  assert.deepEqual(guestPlansForImport({ scenarios: [a, b], current: a }).map((x) => [x.plan.id, x.saved]), [[a.id, true], [b.id, true]]);
  const c = makePlan();
  assert.deepEqual(guestPlansForImport({ scenarios: [a], current: c }).map((x) => x.saved), [true, false]);
  assert.deepEqual(guestPlansForImport({}), []);
});
