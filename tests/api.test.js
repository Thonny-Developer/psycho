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

function mockMistral(content, status = 200) {
  globalThis.fetch = async (url, options) => {
    mockMistral.lastCall = { url, options, body: JSON.parse(options.body) };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status });
  };
}

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
  mockMistral({ reply: 'Слышу тебя. Что горит сильнее всего?' });
  const res = await call({ body: { action: 'chat', type: 'deadline', messages } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { reply: 'Слышу тебя. Что горит сильнее всего?' });
  assert.ok(!JSON.stringify(res.payload).includes(KEY));

  const sent = mockMistral.lastCall.body;
  assert.equal(sent.model, 'ministral-14b-latest');
  assert.deepEqual(sent.response_format, { type: 'json_object' });
  assert.equal(mockMistral.lastCall.options.headers.Authorization, `Bearer ${KEY}`);
  assert.match(sent.messages[1].content, /Студент: Курсовая к пятнице/);
});

test('plan: заголовок и шаги; без заголовка подставляется тип', async () => {
  mockMistral({ title: 'Курсовая', steps });
  let res = await call({ body: { action: 'plan', type: 'deadline', messages } });
  assert.deepEqual(res.payload, { title: 'Курсовая', steps });

  mockMistral({ steps });
  res = await call({ body: { action: 'plan', type: 'exam', messages: [] } });
  assert.equal(res.payload.title, 'Экзамен завтра');
});

test('split: подшаги', async () => {
  mockMistral({ steps: steps.slice(0, 2) });
  const res = await call({ body: { action: 'split', type: 'deadline', planTitle: 'Курсовая', step: 'Напиши введение', stepMinutes: 30 } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.steps.length, 2);
  assert.match(mockMistral.lastCall.body.messages[1].content, /«Напиши введение» \(≈30 мин\)/);
});

test('модель задаётся переменной MISTRAL_MODEL', async () => {
  process.env.MISTRAL_MODEL = 'ministral-8b-latest';
  mockMistral({ reply: 'ок' });
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
  mockMistral({ steps: [{ foo: 'bar' }] });
  const res = await call({ body: { action: 'plan', type: 'bug', messages: [] } });
  assert.equal(res.statusCode, 502);
  assert.equal(typeof res.payload.error, 'string');

  mockMistral({ reply: 42 });
  assert.equal((await call({ body: { action: 'chat', messages } })).statusCode, 502);
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

test('buildMessages: «Мне плохо» без типа и план без разговора', () => {
  const chat = buildMessages({ action: 'chat', type: null, messages: [messages[1]] });
  assert.match(chat[1].content, /не выбрана, человеку просто плохо/);
  const plan = buildMessages({ action: 'plan', type: 'debt', messages: [] });
  assert.match(plan[1].content, /Разговора не было/);
  assert.match(plan[0].content, /"title"/);
});
