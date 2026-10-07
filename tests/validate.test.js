import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSteps, PLAN_LIMITS, SUBSTEP_LIMITS } from '../js/plan.js';
import { parseRequest } from '../api/plan.js';

const step = (title, minutes = 10) => ({ title, minutes });

test('validateSteps принимает нормальный ответ модели', () => {
  const steps = validateSteps({ steps: [step('Открой конспект'), step('Выпиши термины', 5), step('Перескажи вслух')] });
  assert.deepEqual(steps, [step('Открой конспект'), step('Выпиши термины', 5), step('Перескажи вслух')]);
});

test('validateSteps отклоняет мусор', () => {
  for (const bad of [null, 'text', [], {}, { steps: 'нет' }, { steps: [{ foo: 1 }, {}, {}] }]) {
    assert.equal(validateSteps(bad), null, JSON.stringify(bad));
  }
});

test('validateSteps требует минимум шагов', () => {
  assert.equal(validateSteps({ steps: [step('Открой'), step('Выпиши')] }, PLAN_LIMITS), null);
  assert.ok(validateSteps({ steps: [step('Открой'), step('Выпиши')] }, SUBSTEP_LIMITS));
});

test('validateSteps отрезает шаги сверх максимума', () => {
  const many = Array.from({ length: 10 }, (_, i) => step(`Сделай шаг ${i + 1}`));
  assert.equal(validateSteps({ steps: many }, PLAN_LIMITS).length, PLAN_LIMITS.max);
});

test('validateSteps чистит пробелы и приводит минуты к числу', () => {
  const [first] = validateSteps({ steps: [step('  Открой \n конспект  ', '12.4'), step('Выпиши'), step('Перескажи')] });
  assert.deepEqual(first, step('Открой конспект', 12));
});

test('validateSteps отклоняет слишком длинные заголовки и странные минуты', () => {
  const ok = [step('Выпиши'), step('Перескажи')];
  assert.equal(validateSteps({ steps: [step('а'.repeat(161)), ...ok] }), null);
  assert.equal(validateSteps({ steps: [step('ок'), ...ok] }), null);
  assert.equal(validateSteps({ steps: [step('Открой', 'много'), ...ok] }), null);
  assert.equal(validateSteps({ steps: [step('Открой', 0), ...ok] }), null);
  assert.equal(validateSteps({ steps: [step('Открой', 500), ...ok] }), null);
  assert.equal(validateSteps({ steps: [{ title: 42, minutes: 5 }, ...ok] }), null);
});

test('parseRequest проверяет тип, описание и шаг', () => {
  assert.equal(parseRequest({ type: 'exam' }).ok, true);
  assert.equal(parseRequest('{"type":"bug","description":"  падает  "}').value.description, 'падает');
  assert.equal(parseRequest({ type: 'hack' }).ok, false);
  assert.equal(parseRequest({ type: 'exam', description: 'а'.repeat(301) }).ok, false);
  assert.equal(parseRequest({ type: 'exam', description: 5 }).ok, false);
  assert.equal(parseRequest({ type: 'exam', step: '' }).ok, false);
  assert.equal(parseRequest({ type: 'exam', step: 'а'.repeat(200) }).ok, false);
  assert.equal(parseRequest('не json').ok, false);
  assert.equal(parseRequest([1, 2]).ok, false);
  assert.equal(parseRequest({ type: 'toString' }).ok, false);
});
