// Удаление аккаунта. Удалить пользователя в Supabase Auth может только service role,
// поэтому это делает сервер: проверяет токен и удаляет ровно того, чей это токен.
// Строки в profiles, plans и остальных таблицах удаляются каскадом (on delete cascade).

import { getUser, supabaseConfig, createRateLimiter } from './_lib/auth.js';

const rateLimit = createRateLimiter({ limit: 5 });

/** Новый secret key — не JWT: его передают только в apikey, а старый service_role ещё и как Bearer. */
export function serviceHeaders(key) {
  return key.startsWith('sb_') ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
}

export default async function handler(req, res, { fetchImpl = fetch } = {}) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Метод не поддерживается' });
  }

  const config = supabaseConfig();
  // Старый service_role (eyJ…) или новый secret key (sb_secret_…)
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!config || !serviceKey) {
    console.error('[account] Supabase is not configured');
    return res.status(503).json({ error: 'Сервис временно недоступен' });
  }

  const user = await getUser(req, { fetchImpl });
  if (!user) return res.status(401).json({ error: 'Войди снова, чтобы удалить аккаунт' });

  const limit = rateLimit(`user:${user.id}`);
  if (!limit.ok) {
    res.setHeader('Retry-After', String(limit.retryAfter));
    return res.status(429).json({ error: 'Слишком много попыток. Подожди минуту' });
  }

  try {
    const response = await fetchImpl(`${config.url}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, {
      method: 'DELETE',
      headers: serviceHeaders(serviceKey),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok && response.status !== 404) {
      console.error(`[account] delete responded with status ${response.status}`);
      return res.status(502).json({ error: 'Не получилось удалить аккаунт. Это не ты — попробуй чуть позже' });
    }
    return res.status(200).json({ ok: true });
  } catch {
    return res.status(502).json({ error: 'Не получилось удалить аккаунт. Это не ты — попробуй чуть позже' });
  }
}
