import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler, { createRateLimiter } from '../api/plan.js';

const KEY = 'secret-test-key';
const realFetch = globalThis.fetch;
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
    mockMistral.lastCall = { url, options };
    const body = JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] });
    return new Response(body, { status });
  };
}

beforeEach(() => {
  process.env.MISTRAL_API_KEY = KEY;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

const goodSteps = {
  steps: [
    { title: 'Открой список билетов', minutes: 5 },
    { title: 'Разбери первый билет', minutes: 25 },
    { title: 'Перескажи его вслух', minutes: 10 },
  ],
};

test('возвращает проверенные шаги и не светит ключ', async () => {
  mockMistral(goodSteps);
  const res = await call({ body: { type: 'exam', description: 'матан' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, goodSteps);
  assert.ok(!JSON.stringify(res.payload).includes(KEY));

  const sent = JSON.parse(mockMistral.lastCall.options.body);
  assert.equal(sent.model, 'ministral-14b-latest');
  assert.deepEqual(sent.response_format, { type: 'json_object' });
  assert.equal(mockMistral.lastCall.options.headers.Authorization, `Bearer ${KEY}`);
});

test('отклоняет не POST', async () => {
  const res = await call({ method: 'GET' });
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'POST');
});

test('отклоняет неизвестный тип и длинное описание', async () => {
  assert.equal((await call({ body: { type: 'hack' } })).statusCode, 400);
  assert.equal((await call({ body: { type: 'exam', description: 'а'.repeat(301) } })).statusCode, 400);
});

test('мусор от модели превращается в короткую ошибку', async () => {
  mockMistral({ steps: [{ foo: 'bar' }] });
  const res = await call({ body: { type: 'bug' } });
  assert.equal(res.statusCode, 502);
  assert.equal(typeof res.payload.error, 'string');
});

test('ошибка Mistral не протекает наружу', async () => {
  globalThis.fetch = async () => new Response(`invalid key ${KEY}`, { status: 401 });
  const originalError = console.error;
  console.error = () => {};
  const res = await call({ body: { type: 'bug' } });
  console.error = originalError;
  assert.equal(res.statusCode, 502);
  assert.ok(!JSON.stringify(res.payload).includes(KEY));
});

test('без ключа отвечает 503', async () => {
  delete process.env.MISTRAL_API_KEY;
  const originalError = console.error;
  console.error = () => {};
  const res = await call({ body: { type: 'exam' } });
  console.error = originalError;
  assert.equal(res.statusCode, 503);
});

test('rate limit: 10 запросов в минуту на IP', async () => {
  const ip = '192.168.1.1';
  const codes = [];
  for (let i = 0; i < 11; i++) codes.push((await call({ body: { type: 'nope' }, ip })).statusCode);
  assert.deepEqual(codes, [...Array(10).fill(400), 429]);
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
