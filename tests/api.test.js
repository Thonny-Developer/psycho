import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler, { createRateLimiter, buildMessages } from '../api/plan.js';

const KEY = 'secret-test-key';
const realFetch = globalThis.fetch;
const realError = console.error;
let ipCounter = 0;

function call({ method = 'POST', body, ip = `10.0.0.${++ipCounter}` } = {}) {
  const req = { method, body, headers: { 'x-real-ip': ip } };
  const res = {
    statusCode: 200,
    headers: {},
    payload: undefined,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(code) { this.statusCode = code; return this; },
    json(data) { this.payload = data; return this; },
  };
  return Promise.resolve(handler(req, res)).then(() => res);
}

/** message — то, что Mistral кладёт в choices[0].message */
function mockMistral(message, status = 200) {
  globalThis.fetch = async (url, options) => {
    mockMistral.lastCall = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ choices: [{ message }] }), { status });
  };
}

const text = (content) => ({ content });
const json = (value) => ({ content: JSON.stringify(value) });
const toolPlan = (args, content = '') => ({
  content,
  tool_calls: [{ id: 'call_1', function: { name: 'create_plan', arguments: JSON.stringify(args) } }],
});

beforeEach(() => {
  process.env.MISTRAL_API_KEY = KEY;
  delete process.env.MISTRAL_MODEL;
  console.error = () => {};
});

afterEach(() => {
  globalThis.fetch = realFetch;
  console.error = realError;
});

const messages = [{ role: 'ai', text: 'Что случилось?' }, { role: 'user', text: 'Курсовая к пятнице' }];
const steps = [
  { title: 'Открой задание', minutes: 5 },
  { title: 'Набросай содержание', minutes: 20 },
  { title: 'Напиши введение', minutes: 30 },
];

test('chat: возвращает реплику и не светит ключ', async () => {
  mockMistral(text('Слышу тебя. Что горит сильнее всего?'));
  const res = await call({ body: { action: 'chat', type: 'deadline', messages } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { reply: 'Слышу тебя. Что горит сильнее всего?' });
  assert.ok(!JSON.stringify(res.payload).includes(KEY));

  const sent = mockMistral.lastCall.body;
  assert.equal(sent.model, 'ministral-14b-latest');
  assert.equal(sent.tools[0].function.name, 'create_plan');
  assert.equal(sent.tool_choice, 'auto');
  assert.equal(sent.response_format, undefined);
  assert.equal(mockMistral.lastCall.options.headers.Authorization, `Bearer ${KEY}`);
  assert.match(sent.messages[1].content, /Студент: Курсовая к пятнице/);
});

test('chat: реплика в JSON-обёртке приходит чистым текстом', async () => {
  mockMistral(text('{"reply":"Кажется, просто тяжело. Что сейчас на уме?"}'));
  const res = await call({ body: { action: 'chat', type: null, messages } });
  assert.deepEqual(res.payload, { reply: 'Кажется, просто тяжело. Что сейчас на уме?' });
});

test('chat: модель сама собирает план через инструмент', async () => {
  mockMistral(toolPlan({ title: 'Справка и переезд', steps }));
  let res = await call({ body: { action: 'chat', type: 'other', messages } });
  assert.deepEqual(res.payload, { plan: { title: 'Справка и переезд', steps } });

  mockMistral(toolPlan({ title: 'Справка', steps }, 'Вот план.'));
  res = await call({ body: { action: 'chat', type: 'other', messages } });
  assert.equal(res.payload.reply, 'Вот план.');
  assert.equal(res.payload.plan.steps.length, 3);

  // Битый план от инструмента, но есть текст — показываем текст
  mockMistral(toolPlan({ steps: [1] }, 'Расскажи чуть подробнее?'));
  res = await call({ body: { action: 'chat', type: 'other', messages } });
  assert.deepEqual(res.payload, { reply: 'Расскажи чуть подробнее?' });
});

test('plan: вызов инструмента обязателен, без заголовка подставляется тип', async () => {
  mockMistral(toolPlan({ title: 'Курсовая', steps }));
  let res = await call({ body: { action: 'plan', type: 'deadline', messages } });
  assert.deepEqual(res.payload, { title: 'Курсовая', steps });
  assert.equal(mockMistral.lastCall.body.tool_choice, 'any');

  mockMistral(toolPlan({ steps }));
  res = await call({ body: { action: 'plan', type: 'exam', messages: [] } });
  assert.equal(res.payload.title, 'Экзамен завтра');

  // Модель проигнорировала инструмент, но вернула план текстом
  mockMistral(json({ title: 'Текстом', steps }));
  res = await call({ body: { action: 'plan', type: 'exam', messages } });
  assert.equal(res.payload.title, 'Текстом');
});

test('split: подшаги', async () => {
  mockMistral(json({ steps: steps.slice(0, 2) }));
  const res = await call({ body: { action: 'split', type: 'deadline', planTitle: 'Курсовая', step: 'Напиши введение', stepMinutes: 30 } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.steps.length, 2);
  assert.match(mockMistral.lastCall.body.messages[1].content, /«Напиши введение» \(≈30 мин\)/);
  assert.deepEqual(mockMistral.lastCall.body.response_format, { type: 'json_object' });
  assert.equal(mockMistral.lastCall.body.tools, undefined);
});

test('модель задаётся переменной MISTRAL_MODEL', async () => {
  process.env.MISTRAL_MODEL = 'ministral-8b-latest';
  mockMistral(text('ок'));
  await call({ body: { action: 'chat', messages: [messages[1]] } });
  assert.equal(mockMistral.lastCall.body.model, 'ministral-8b-latest');
});

test('отклоняет не POST и некорректные запросы', async () => {
  const get = await call({ method: 'GET' });
  assert.equal(get.statusCode, 405);
  assert.equal(get.headers.allow, 'POST');
  assert.equal((await call({ body: { action: 'chat', type: 'hack', messages } })).statusCode, 400);
  assert.equal((await call({ body: { action: 'delete' } })).statusCode, 400);
});

test('мусор от модели превращается в короткую ошибку', async () => {
  mockMistral(toolPlan({ steps: [{ foo: 'bar' }] }));
  const res = await call({ body: { action: 'plan', type: 'bug', messages: [] } });
  assert.equal(res.statusCode, 502);
  assert.equal(typeof res.payload.error, 'string');

  mockMistral(text(''));
  assert.equal((await call({ body: { action: 'chat', messages } })).statusCode, 502);
  mockMistral(text('не json'));
  assert.equal((await call({ body: { action: 'split', type: 'bug', step: 'Шаг' } })).statusCode, 502);
});

test('ошибка Mistral не протекает наружу', async () => {
  globalThis.fetch = async () => new Response(`invalid key ${KEY}`, { status: 401 });
  const res = await call({ body: { action: 'plan', type: 'bug', messages: [] } });
  assert.equal(res.statusCode, 502);
  assert.ok(!JSON.stringify(res.payload).includes(KEY));
});

test('без ключа отвечает 503', async () => {
  delete process.env.MISTRAL_API_KEY;
  assert.equal((await call({ body: { action: 'plan', type: 'exam', messages: [] } })).statusCode, 503);
});

test('rate limit: 20 запросов в минуту на IP', async () => {
  const ip = '192.168.1.1';
  const codes = [];
  for (let i = 0; i < 21; i++) codes.push((await call({ body: { action: 'nope' }, ip })).statusCode);
  assert.deepEqual(codes, [...Array(20).fill(400), 429]);
});

test('createRateLimiter сбрасывает окно', () => {
  const check = createRateLimiter({ limit: 2, windowMs: 1000 });
  assert.equal(check('a', 0).ok, true);
  assert.equal(check('a', 10).ok, true);
  const blocked = check('a', 20);
  assert.deepEqual([blocked.ok, blocked.retryAfter], [false, 1]);
  assert.equal(check('b', 20).ok, true);
  assert.equal(check('a', 1000).ok, true);
});

test('buildMessages: «Мне плохо» без типа, своя ситуация и план без разговора', () => {
  const chat = buildMessages({ action: 'chat', type: null, messages: [messages[1]] });
  assert.match(chat[1].content, /не выбрана, человеку просто плохо/);
  const own = buildMessages({ action: 'chat', type: 'other', messages: [messages[1]] });
  assert.match(own[1].content, /своя ситуация/);
  assert.match(own[0].content, /Тема из меню только подсказка/);
  const plan = buildMessages({ action: 'plan', type: 'debt', messages: [] });
  assert.match(plan[1].content, /Разговора не было/);
  assert.match(plan[0].content, /create_plan/);
});
