import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/account.js';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.account-test-token-long.signature';
const SERVICE = 'service-role-secret';

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://demo.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'public-anon-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE;
});

afterEach(() => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[k];
});

function call({ method = 'DELETE', token = TOKEN, fetchImpl }) {
  const req = { method, headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.code = c; return this; },
    json(d) { this.data = d; return this; },
  };
  return Promise.resolve(handler(req, res, { fetchImpl })).then(() => res);
}

function fakeSupabase({ userId = 'user-1', deleteStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/auth/v1/user')) {
      return options.headers.Authorization === `Bearer ${TOKEN}`
        ? new Response(JSON.stringify({ id: userId }), { status: 200 })
        : new Response('{}', { status: 401 });
    }
    return new Response('{}', { status: deleteStatus });
  };
  return { calls, fetchImpl };
}

test('удаляет ровно того, чей токен, с service role только на сервере', async () => {
  const fake = fakeSupabase({ userId: 'user-42' });
  const res = await call({ fetchImpl: fake.fetchImpl, token: `${TOKEN}` });
  assert.equal(res.code, 200);
  const del = fake.calls.find((c) => c.options.method === 'DELETE');
  assert.equal(del.url, 'https://demo.supabase.co/auth/v1/admin/users/user-42');
  assert.equal(del.options.headers.Authorization, `Bearer ${SERVICE}`);
  assert.ok(!JSON.stringify(res.data).includes(SERVICE));
});

test('без токена или с чужим токеном — 401, удаления нет', async () => {
  const fake = fakeSupabase();
  assert.equal((await call({ fetchImpl: fake.fetchImpl, token: null })).code, 401);
  assert.equal((await call({ fetchImpl: fake.fetchImpl, token: 'eyJhbGciOiJIUzI1NiJ9.forged-token-value.sig' })).code, 401);
  assert.equal(fake.calls.filter((c) => c.options.method === 'DELETE').length, 0);
});

test('другие методы и ненастроенный сервер', async () => {
  const fake = fakeSupabase();
  assert.equal((await call({ method: 'POST', fetchImpl: fake.fetchImpl })).code, 405);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const orig = console.error;
  console.error = () => {};
  assert.equal((await call({ fetchImpl: fake.fetchImpl })).code, 503);
  console.error = orig;
});

test('сбой Supabase — короткая ошибка без деталей', async () => {
  const fake = fakeSupabase({ deleteStatus: 500 });
  const orig = console.error;
  console.error = () => {};
  const res = await call({ fetchImpl: fake.fetchImpl });
  console.error = orig;
  assert.equal(res.code, 502);
  assert.match(res.data.error, /Это не ты/);
});
