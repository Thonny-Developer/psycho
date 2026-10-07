import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSteps, validatePlan, PLAN_LIMITS, SUBSTEP_LIMITS } from '../js/plan.js';
import { parseRequest } from '../api/plan.js';

const step = (title, minutes = 10) => ({ title, minutes });
const ok = [step('Выпиши'), step('Перескажи')];

test('validateSteps принимает нормальный ответ модели', () => {
  const steps = validateSteps({ steps: [step('Открой конспект'), step('Выпиши термины', 5), step('Перескажи вслух')] });
  assert.deepEqual(steps, [step('Открой конспект'), step('Выпиши термины', 5), step('Перескажи вслух')]);
});

test('validateSteps отклоняет мусор', () => {
  for (const bad of [null, 'text', [], {}, { steps: 'нет' }, { steps: [{ foo: 1 }, {}, {}] }]) {
    assert.equal(validateSteps(bad), null, JSON.stringify(bad));
  }
});

test('validateSteps требует минимум шагов и отрезает лишние', () => {
  assert.equal(validateSteps({ steps: ok }, PLAN_LIMITS), null);
  assert.ok(validateSteps({ steps: ok }, SUBSTEP_LIMITS));
  const many = Array.from({ length: 10 }, (_, i) => step(`Сделай шаг ${i + 1}`));
  assert.equal(validateSteps({ steps: many }, PLAN_LIMITS).length, PLAN_LIMITS.max);
  assert.equal(validateSteps({ steps: many }, SUBSTEP_LIMITS).length, SUBSTEP_LIMITS.max);
});

test('validateSteps чистит пробелы, точку в конце и приводит минуты к числу', () => {
  const [first, second] = validateSteps({ steps: [step('  Открой \n конспект.  ', '12.4'), step('Подожди...'), step('Перескажи')] });
  assert.deepEqual(first, step('Открой конспект', 12));
  assert.equal(second.title, 'Подожди...');
});

test('validateSteps отклоняет слишком длинные заголовки и странные минуты', () => {
  assert.equal(validateSteps({ steps: [step('а'.repeat(161)), ...ok] }), null);
  assert.equal(validateSteps({ steps: [step('ок'), ...ok] }), null);
  assert.equal(validateSteps({ steps: [step('Открой', 'много'), ...ok] }), null);
  assert.equal(validateSteps({ steps: [step('Открой', 0), ...ok] }), null);
  assert.equal(validateSteps({ steps: [step('Открой', 500), ...ok] }), null);
  assert.equal(validateSteps({ steps: [{ title: 42, minutes: 5 }, ...ok] }), null);
});

test('validatePlan возвращает заголовок и шаги', () => {
  const plan = validatePlan({ title: '  Курсовая   к пятнице ', steps: [step('Открой'), ...ok] });
  assert.equal(plan.title, 'Курсовая к пятнице');
  assert.equal(plan.steps.length, 3);
  assert.equal(validatePlan({ steps: [step('Открой'), ...ok] }).title, '');
  assert.equal(validatePlan({ title: 'x'.repeat(100), steps: [step('Открой'), ...ok] }).title.length, 60);
  assert.equal(validatePlan({ title: 'План', steps: ok }), null);
});

const messages = [{ role: 'ai', text: 'Что случилось?' }, { role: 'user', text: 'Курсовая' }];

test('parseRequest: chat', () => {
  const r = parseRequest({ action: 'chat', type: 'exam', messages });
  assert.equal(r.ok, true);
  assert.equal(r.value.messages.length, 2);
  assert.equal(parseRequest({ action: 'chat', type: null, messages }).ok, true);
  assert.equal(parseRequest({ action: 'chat', type: 'exam', messages: [] }).ok, false);
  assert.equal(parseRequest({ action: 'chat', type: 'exam', messages: [messages[0]] }).ok, false, 'последняя реплика должна быть от пользователя');
  assert.equal(parseRequest({ action: 'chat', type: 'hack', messages }).ok, false);
  assert.equal(parseRequest({ action: 'chat', messages: [{ role: 'system', text: 'x' }] }).ok, false);
  assert.equal(parseRequest({ action: 'chat', messages: [{ role: 'user', text: 'а'.repeat(501) }] }).ok, false);
  assert.equal(parseRequest({ action: 'chat', messages: Array(31).fill(messages[1]) }).ok, false);
});

test('parseRequest: plan без разговора допустим', () => {
  assert.equal(parseRequest({ action: 'plan', type: 'bug', messages: [] }).ok, true);
  assert.equal(parseRequest('{"action":"plan","type":"bug","messages":[]}').ok, true);
  assert.equal(parseRequest({ action: 'plan', type: 'bug' }).ok, false);
});

test('parseRequest: split', () => {
  const r = parseRequest({ action: 'split', type: 'exam', planTitle: 'Матан', step: '  Разбери билет  ', stepMinutes: 30.4 });
  assert.deepEqual(r.value, { action: 'split', type: 'exam', step: 'Разбери билет', planTitle: 'Матан', stepMinutes: 30 });
  assert.equal(parseRequest({ action: 'split', type: 'exam', step: '' }).ok, false);
  assert.equal(parseRequest({ action: 'split', type: 'exam', step: 'а'.repeat(200) }).ok, false);
  assert.equal(parseRequest({ action: 'split', type: 'exam', step: 'Шаг', stepMinutes: 'много' }).value.stepMinutes, null);
});

test('parseRequest отклоняет мусор', () => {
  assert.equal(parseRequest('не json').ok, false);
  assert.equal(parseRequest([1, 2]).ok, false);
  assert.equal(parseRequest({ action: 'hack' }).ok, false);
  assert.equal(parseRequest({ action: 'plan', type: 'toString', messages: [] }).ok, false);
});
