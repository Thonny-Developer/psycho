import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, MAX_SCENARIOS } from '../js/storage.js';
import { createPlan, setStepDone } from '../js/plan.js';

function memoryBackend() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const makePlan = (description = 'Курсовая') =>
  createPlan({
    type: 'deadline',
    description,
    steps: [
      { title: 'Выпиши требования', minutes: 5 },
      { title: 'Сделай черновик', minutes: 25 },
      { title: 'Отправь на проверку', minutes: 5 },
    ],
  });

test('текущий план переживает «перезагрузку»', () => {
  const backend = memoryBackend();
  const plan = setStepDone(makePlan(), makePlan().steps[0].id, true);
  createStorage(backend).saveCurrent(plan);
  assert.deepEqual(createStorage(backend).loadCurrent(), plan);

  createStorage(backend).saveCurrent(null);
  assert.equal(createStorage(backend).loadCurrent(), null);
});

test('битые данные не роняют чтение', () => {
  const backend = memoryBackend();
  backend.setItem('panic-mode:current', '{oops');
  backend.setItem('panic-mode:scenarios', JSON.stringify([{ id: 1 }, makePlan()]));
  const storage = createStorage(backend);
  assert.equal(storage.loadCurrent(), null);
  assert.equal(storage.listScenarios().length, 1);
});

test('сохранение, обновление и удаление сценария', () => {
  const storage = createStorage(memoryBackend());
  const plan = makePlan();

  let result = storage.addScenario(plan, 1000);
  assert.equal(result.ok, true);
  assert.equal(result.scenarios.length, 1);

  // повторное сохранение не создаёт дубликат
  result = storage.addScenario(plan, 2000);
  assert.equal(result.scenarios.length, 1);

  const updated = setStepDone(plan, plan.steps[1].id, true);
  storage.updateScenario(updated);
  const [saved] = storage.listScenarios();
  assert.equal(saved.steps[1].done, true);
  assert.equal(saved.savedAt, 1000);

  result = storage.deleteScenario(plan.id);
  assert.equal(result.scenarios.length, 0);
});

test('updateScenario не добавляет несохранённый план', () => {
  const storage = createStorage(memoryBackend());
  storage.updateScenario(makePlan());
  assert.equal(storage.listScenarios().length, 0);
});

test('новые сценарии идут первыми', () => {
  const storage = createStorage(memoryBackend());
  storage.addScenario(makePlan('старый'), 1);
  storage.addScenario(makePlan('новый'), 2);
  assert.deepEqual(storage.listScenarios().map((s) => s.description), ['новый', 'старый']);
});

test('лимит количества сценариев', () => {
  const storage = createStorage(memoryBackend());
  for (let i = 0; i < MAX_SCENARIOS; i++) assert.equal(storage.addScenario(makePlan(), i).ok, true);
  const result = storage.addScenario(makePlan());
  assert.deepEqual([result.ok, result.error, result.scenarios.length], [false, 'limit', MAX_SCENARIOS]);
});

test('переполненное хранилище возвращает ошибку quota', () => {
  const backend = memoryBackend();
  backend.setItem = () => {
    throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
  };
  const result = createStorage(backend).addScenario(makePlan());
  assert.deepEqual([result.ok, result.error], [false, 'quota']);
});

test('без localStorage всё работает, но ничего не сохраняется', () => {
  const storage = createStorage(null);
  assert.equal(storage.loadCurrent(), null);
  assert.deepEqual(storage.listScenarios(), []);
  assert.deepEqual(storage.saveCurrent(makePlan()), { ok: false, error: 'unavailable' });
});
