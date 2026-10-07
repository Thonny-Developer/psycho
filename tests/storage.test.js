import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, userPrefix, MAX_SCENARIOS, DEFAULT_SETTINGS } from '../js/storage.js';
import { createPlan, setStepDone } from '../js/plan.js';
import { makeMessage } from '../js/chat.js';

function memoryBackend() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
  };
}

const makePlan = (title = 'Курсовая') =>
  createPlan({
    type: 'deadline',
    title,
    steps: [
      { title: 'Выпиши требования', minutes: 5 },
      { title: 'Сделай черновик', minutes: 25 },
      { title: 'Отправь на проверку', minutes: 5 },
    ],
  });

test('настройки и онбординг переживают перезагрузку, мусор заменяется значениями по умолчанию', () => {
  const backend = memoryBackend();
  const empty = { onboarded: false, settings: DEFAULT_SETTINGS, accountPromptSeen: false, accountHintSeen: false, reminderTime: null, firstSeenAt: null };
  assert.deepEqual(createStorage(backend).loadPrefs(), empty);

  const prefs = { onboarded: true, settings: { theme: 'dark', fs: 'xl', reduce: true }, accountPromptSeen: true, accountHintSeen: false, reminderTime: '19:30', firstSeenAt: 1700000000000 };
  createStorage(backend).savePrefs(prefs);
  assert.deepEqual(createStorage(backend).loadPrefs(), prefs);

  backend.setItem('panic-mode:prefs', JSON.stringify({ onboarded: 'да', settings: { theme: 'neon', fs: 9, reduce: 'нет' }, reminderTime: '25 часов', firstSeenAt: 'вчера' }));
  assert.deepEqual(createStorage(backend).loadPrefs(), empty);
});

test('сессия: экран, разговор и план', () => {
  const backend = memoryBackend();
  const plan = setStepDone(makePlan(), makePlan().steps[0].id, true);
  const messages = [makeMessage('ai', 'Привет'), makeMessage('user', 'Курсовая')];
  createStorage(backend).saveSession({ screen: 'plan', type: 'deadline', messages, plan, planFrom: 'chat', calmMode: 'ground' });

  const session = createStorage(backend).loadSession();
  assert.equal(session.screen, 'plan');
  assert.deepEqual(session.plan, plan);
  assert.deepEqual(session.messages, messages);
  assert.equal(session.calmMode, 'ground');
});

test('битая сессия не роняет чтение', () => {
  const backend = memoryBackend();
  backend.setItem('panic-mode:session', JSON.stringify({ screen: 'nowhere', type: 'hack', messages: [{ role: 'system' }, 5], plan: { id: 1 } }));
  const session = createStorage(backend).loadSession();
  assert.deepEqual(session, { screen: 'home', type: null, messages: [], plan: null, planFrom: 'chat', calmMode: 'breath' });

  backend.setItem('panic-mode:session', '{oops');
  assert.equal(createStorage(backend).loadSession(), null);
});

test('текущий план первой версии открывается на экране плана', () => {
  const backend = memoryBackend();
  const old = { ...makePlan(), description: 'Падает сборка' };
  delete old.title;
  backend.setItem('panic-mode:current', JSON.stringify(old));

  const session = createStorage(backend).loadSession();
  assert.equal(session.screen, 'plan');
  assert.equal(session.plan.title, 'Падает сборка');
  assert.equal(backend.getItem('panic-mode:current'), null, 'старый ключ удаляется после переноса');
});

test('сохранение, обновление, удаление и возврат сценария', () => {
  const storage = createStorage(memoryBackend());
  const plan = makePlan();

  assert.equal(storage.addScenario(plan, 1000).scenarios.length, 1);
  assert.equal(storage.addScenario(plan, 2000).scenarios.length, 1, 'без дубликатов');

  storage.updateScenario(setStepDone(plan, plan.steps[1].id, true));
  const [saved] = storage.listScenarios();
  assert.equal(saved.steps[1].done, true);
  assert.equal(saved.savedAt, 1000);

  assert.equal(storage.deleteScenario(plan.id).scenarios.length, 0);
  assert.equal(storage.restoreScenario(saved).scenarios.length, 1);
  assert.equal(storage.restoreScenario(saved).scenarios.length, 1, 'повторный возврат ничего не дублирует');
});

test('новые сценарии идут первыми, возврат ставит на прежнее место', () => {
  const storage = createStorage(memoryBackend());
  storage.addScenario(makePlan('старый'), 1);
  storage.addScenario(makePlan('средний'), 2);
  storage.addScenario(makePlan('новый'), 3);
  const middle = storage.listScenarios()[1];
  storage.deleteScenario(middle.id);
  storage.restoreScenario(middle);
  assert.deepEqual(storage.listScenarios().map((s) => s.title), ['новый', 'средний', 'старый']);
});

test('сценарии первой версии получают заголовок, мусор отбрасывается', () => {
  const backend = memoryBackend();
  const old = { ...makePlan(), description: 'Экзамен по матану', savedAt: 5 };
  delete old.title;
  backend.setItem('panic-mode:scenarios', JSON.stringify([{ id: 1 }, old, 'x']));
  const list = createStorage(backend).listScenarios();
  assert.equal(list.length, 1);
  assert.equal(list[0].title, 'Экзамен по матану');
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

test('clearAll удаляет всё', () => {
  const backend = memoryBackend();
  const storage = createStorage(backend);
  storage.savePrefs({ onboarded: true, settings: DEFAULT_SETTINGS });
  storage.addScenario(makePlan());
  storage.saveSession({ screen: 'home' });
  assert.equal(storage.clearAll().ok, true);
  assert.equal(backend.data.size, 0);
});

test('без localStorage всё работает, но ничего не сохраняется', () => {
  const storage = createStorage(null);
  assert.equal(storage.loadSession(), null);
  assert.deepEqual(storage.listScenarios(), []);
  assert.deepEqual(storage.saveSession({}), { ok: false, error: 'unavailable' });
});

test('у гостя и у каждого аккаунта свои данные, настройки устройства общие', () => {
  const backend = memoryBackend();
  const guest = createStorage(backend);
  const anna = createStorage(backend, { prefix: userPrefix('anna') });
  const boris = createStorage(backend, { prefix: userPrefix('boris') });

  guest.addScenario(makePlan('гостевой'));
  anna.addScenario(makePlan('Анны'));
  assert.deepEqual(guest.listScenarios().map((s) => s.title), ['гостевой']);
  assert.deepEqual(anna.listScenarios().map((s) => s.title), ['Анны']);
  assert.deepEqual(boris.listScenarios(), []);

  guest.savePrefs({ onboarded: true, settings: { theme: 'dark', fs: 'm', reduce: null } });
  assert.equal(anna.loadPrefs().settings.theme, 'dark');

  // Выход из аккаунта стирает только его данные
  anna.clearAll({ withPrefs: false });
  assert.deepEqual(anna.listScenarios(), []);
  assert.equal(guest.listScenarios().length, 1);
  assert.equal(guest.loadPrefs().onboarded, true);
});

test('очередь изменений для сервера', () => {
  const storage = createStorage(memoryBackend(), { prefix: userPrefix('anna') });
  assert.deepEqual(storage.loadOutbox(), {});
  storage.saveOutbox({ p1: { id: 'p1', title: 'x' } });
  assert.deepEqual(storage.loadOutbox(), { p1: { id: 'p1', title: 'x' } });
  storage.saveOutbox({});
  assert.deepEqual(storage.loadOutbox(), {});
});

test('у аккаунта нет переноса старого текущего плана гостя', () => {
  const backend = memoryBackend();
  const old = { ...makePlan(), description: 'Падает сборка' };
  delete old.title;
  backend.setItem('panic-mode:current', JSON.stringify(old));
  assert.equal(createStorage(backend, { prefix: userPrefix('anna') }).loadSession(), null);
});

test('старое имя экрана настроек переходит в профиль', () => {
  const backend = memoryBackend();
  backend.setItem('panic-mode:session', JSON.stringify({ screen: 'settings' }));
  assert.equal(createStorage(backend).loadSession().screen, 'profile');
});

test('серия хранится отдельно у гостя и аккаунта, мусор отбрасывается', () => {
  const backend = memoryBackend();
  const guest = createStorage(backend);
  const anna = createStorage(backend, { prefix: userPrefix('anna') });
  guest.saveStreak({ activity: { '2026-10-07': ['p1'] }, doneDays: ['2026-10-07'] });
  assert.deepEqual(guest.loadStreak(), { activity: { '2026-10-07': ['p1'] }, doneDays: ['2026-10-07'] });
  assert.deepEqual(anna.loadStreak(), { activity: {}, doneDays: [] });

  backend.setItem('panic-mode:streak', JSON.stringify({ activity: { 'вчера': ['x'], '2026-10-06': ['ok', 5] }, doneDays: ['2026-10-06', 'завтра', 7] }));
  assert.deepEqual(guest.loadStreak(), { activity: { '2026-10-06': ['ok'] }, doneDays: ['2026-10-06'] });
});
