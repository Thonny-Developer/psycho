// Общие помощники для serverless-функций. Файлы в api/_lib Vercel не публикует как эндпоинты.
// Ключи берутся только из переменных окружения и никуда не логируются.

import { createHash } from 'node:crypto';

const USER_CACHE_MS = 60_000;
const VERIFY_TIMEOUT_MS = 5_000;
const userCache = new Map(); // sha256(токен) -> { id, until }

/**
 * Настройки Supabase или null, если аккаунты не настроены.
 * Подходит и старый anon key (eyJ…), и новый publishable key (sb_publishable_…).
 */
export function supabaseConfig() {
  const url = process.env.SUPABASE_URL ?? '';
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(url.replace(/\/$/, '')) || !anonKey) return null;
  return { url: url.replace(/\/$/, ''), anonKey };
}

export function bearerToken(req) {
  const header = req.headers?.authorization ?? '';
  const match = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(header);
  return match ? match[1] : null;
}

/**
 * Проверяет токен через Supabase Auth и возвращает { id } или null.
 * Результат кешируется на минуту, чтобы не ходить в Auth на каждый запрос.
 */
export async function getUser(req, { fetchImpl = fetch, now = Date.now() } = {}) {
  const token = bearerToken(req);
  const config = supabaseConfig();
  if (!token || !config) return null;

  const key = createHash('sha256').update(token).digest('hex');
  const cached = userCache.get(key);
  if (cached && cached.until > now) return { id: cached.id };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${config.url}/auth/v1/user`, {
      headers: { apikey: config.anonKey, Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const user = await res.json();
    if (typeof user?.id !== 'string') return null;

    if (userCache.size > 1000) userCache.clear();
    userCache.set(key, { id: user.id, until: now + USER_CACHE_MS });
    return { id: user.id };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function clientIp(req) {
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp) return realIp;
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * Фиксированное окно на ключ. Счётчик живёт в памяти экземпляра функции,
 * поэтому защита примерная: у каждого «тёплого» экземпляра свой счётчик.
 */
export function createRateLimiter({ limit = 20, windowMs = 60_000, maxKeys = 5_000 } = {}) {
  const hits = new Map();

  return function check(key, now = Date.now(), max = limit) {
    let entry = hits.get(key);
    if (!entry || now >= entry.resetAt) {
      if (hits.size >= maxKeys) {
        for (const [k, e] of hits) if (now >= e.resetAt) hits.delete(k);
        if (hits.size >= maxKeys) hits.clear();
      }
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    const ok = entry.count <= max;
    return { ok, retryAfter: ok ? 0 : Math.ceil((entry.resetAt - now) / 1000) };
  };
}
