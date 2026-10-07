import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { bearerToken, getUser, supabaseConfig, createRateLimiter, appUrl } from '../api/_lib/auth.js';
import configHandler from '../api/config.js';

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.payload-part-long-enough.signature';

beforeEach(() => {
  process.env.SUPABASE_URL = 'https://demo.supabase.co/';
  process.env.SUPABASE_ANON_KEY = 'public-anon-key';
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
});

const req = (authorization) => ({ headers: authorization ? { authorization } : {} });

test('bearerToken принимает только Bearer с разумным токеном', () => {
  assert.equal(bearerToken(req(`Bearer ${TOKEN}`)), TOKEN);
  assert.equal(bearerToken(req('Basic abc')), null);
  assert.equal(bearerToken(req('Bearer short')), null);
  assert.equal(bearerToken(req('Bearer <script>alert(1)</script>xxxxxxxxxxxx')), null);
  assert.equal(bearerToken(req()), null);
});

test('supabaseConfig требует https и ключ', () => {
  assert.deepEqual(supabaseConfig(), { url: 'https://demo.supabase.co', anonKey: 'public-anon-key' });
  process.env.SUPABASE_URL = 'http://demo.supabase.co';
  assert.equal(supabaseConfig(), null);
  process.env.SUPABASE_URL = 'https://demo.supabase.co';
  delete process.env.SUPABASE_ANON_KEY;
  assert.equal(supabaseConfig(), null);
});

test('getUser проверяет токен через Supabase и кеширует ответ', async () => {
  const token = `${TOKEN}-cache`;
  let calls = 0;
  const fetchImpl = async (url, { headers }) => {
    calls += 1;
    assert.equal(url, 'https://demo.supabase.co/auth/v1/user');
    assert.equal(headers.Authorization, `Bearer ${token}`);
    assert.equal(headers.apikey, 'public-anon-key');
    return new Response(JSON.stringify({ id: 'user-1' }), { status: 200 });
  };
  assert.deepEqual(await getUser(req(`Bearer ${token}`), { fetchImpl }), { id: 'user-1' });
  assert.deepEqual(await getUser(req(`Bearer ${token}`), { fetchImpl }), { id: 'user-1' }, 'второй раз из кеша');
  assert.equal(calls, 1);
});

test('getUser: просроченный токен, сбой сети и ненастроенные аккаунты дают null', async () => {
  const expired = async () => new Response('{}', { status: 401 });
  assert.equal(await getUser(req(`Bearer ${TOKEN}-expired`), { fetchImpl: expired }), null);
  const down = async () => { throw new Error('network'); };
  assert.equal(await getUser(req(`Bearer ${TOKEN}-down`), { fetchImpl: down }), null);
  delete process.env.SUPABASE_URL;
  assert.equal(await getUser(req(`Bearer ${TOKEN}`), { fetchImpl: expired }), null);
});

test('лимит для аккаунта и гостя считается отдельно', () => {
  const check = createRateLimiter({ limit: 2 });
  assert.equal(check('ip:1', 0).ok, true);
  assert.equal(check('ip:1', 0).ok, true);
  assert.equal(check('ip:1', 0).ok, false);
  assert.equal(check('user:a', 0, 3).ok, true, 'у аккаунта свой счётчик и свой предел');
});

test('/api/config отдаёт только публичные настройки', () => {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(d) { this.data = d; return this; } };
  configHandler({ method: 'GET' }, res);
  assert.deepEqual(res.data, { accounts: true, supabaseUrl: 'https://demo.supabase.co', supabaseAnonKey: 'public-anon-key', siteUrl: null });
  process.env.APP_URL = 'https://panika.example.kz/';
  configHandler({ method: 'GET' }, res);
  assert.equal(res.data.siteUrl, 'https://panika.example.kz');
  delete process.env.APP_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'super-secret';
  configHandler({ method: 'GET' }, res);
  assert.ok(!JSON.stringify(res.data).includes('super-secret'));
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_URL;
  configHandler({ method: 'GET' }, res);
  assert.deepEqual(res.data, { accounts: false });
  configHandler({ method: 'POST' }, res);
  assert.equal(res.code, 405);
});

test('appUrl: домен для ссылок из писем', () => {
  const keep = { app: process.env.APP_URL, vercel: process.env.VERCEL_PROJECT_PRODUCTION_URL };
  delete process.env.APP_URL;
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  assert.equal(appUrl(), null, 'не задан — клиент возьмёт текущий адрес');

  process.env.VERCEL_PROJECT_PRODUCTION_URL = 'panika.vercel.app';
  assert.equal(appUrl(), 'https://panika.vercel.app', 'на Vercel по умолчанию домен продакшена');

  process.env.APP_URL = ' https://panika.kz/some/path ';
  assert.equal(appUrl(), 'https://panika.kz', 'APP_URL важнее, берётся только origin');

  process.env.APP_URL = 'http://localhost:3000';
  assert.equal(appUrl(), 'http://localhost:3000', 'http можно только локально');
  process.env.APP_URL = 'http://panika.kz';
  assert.equal(appUrl(), null, 'http на настоящем домене не принимается');
  process.env.APP_URL = 'javascript:alert(1)';
  assert.equal(appUrl(), null);

  for (const [k, v] of [['APP_URL', keep.app], ['VERCEL_PROJECT_PRODUCTION_URL', keep.vercel]]) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});
