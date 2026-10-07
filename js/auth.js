// Обёртка над Supabase Auth. Библиотека грузится лениво: гость её не скачивает,
// а дыхание и «Живая помощь» работают, даже если аккаунты недоступны.

import { authErrorMessage } from './account.js';

const CONFIG_KEY = 'panic-mode:config';
export const AUTH_STORAGE_KEY = 'panic-mode:auth';
const CONFIG_TIMEOUT_MS = 5_000;

let configPromise = null;
let clientPromise = null;

function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null');
  } catch {
    return null;
  }
}

export function currentTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Пользователь из сохранённой сессии — без сети, чтобы сразу показать его данные. */
export function peekSessionUser() {
  const user = readLocal(AUTH_STORAGE_KEY)?.user;
  return typeof user?.id === 'string' ? { id: user.id, email: user.email ?? '' } : null;
}

/** Вернулись по ссылке из письма или после входа через Google. */
export function hasAuthRedirect() {
  const url = new URL(window.location.href);
  return url.searchParams.has('code') || url.searchParams.has('error_description') || url.hash.includes('access_token');
}

/**
 * Ошибка из ссылки письма: Supabase возвращает её в адресе (#error_code=otp_expired…).
 * Возвращает понятный текст и убирает параметры из адреса.
 */
export function takeAuthRedirectError() {
  const url = new URL(window.location.href);
  const params = new URLSearchParams(url.hash.replace(/^#/, ''));
  for (const [k, v] of url.searchParams) if (!params.has(k)) params.set(k, v);
  if (!params.has('error') && !params.has('error_code')) return null;

  history.replaceState(null, '', url.pathname);
  const code = params.get('error_code');
  if (code === 'otp_expired') return 'Ссылка из письма устарела или уже использована. Запроси новую — это займёт минуту.';
  if (params.get('error') === 'access_denied') return 'Вход отменён. Можно попробовать ещё раз.';
  return 'Ссылка не сработала. Это не ты — попробуй войти или запроси новое письмо.';
}

/** Настройки с сервера; без сети — последние известные. */
export function loadConfig() {
  configPromise ??= (async () => {
    try {
      const res = await fetch('/api/config', { signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS) });
      if (res.ok) {
        const config = await res.json();
        try {
          localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
        } catch {
          // без кеша просто запросим снова в следующий раз
        }
        return config;
      }
    } catch {
      // нет сети или функции: ниже берём сохранённое
    }
    return readLocal(CONFIG_KEY) ?? { accounts: false };
  })();
  return configPromise;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

/** Клиент Supabase или null, если аккаунты не настроены или библиотека не загрузилась. */
export function getClient() {
  clientPromise ??= (async () => {
    const config = await loadConfig();
    if (!config?.accounts) return null;
    if (!window.supabase) await loadScript('js/vendor/supabase.js');
    return window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        // implicit, а не pkce: ссылку из письма часто открывают в другом браузере
        // (встроенном в почтовое приложение или на телефоне). При pkce ключ обмена остался бы
        // в браузере, где регистрировались, и подтверждение не завершилось бы.
        flowType: 'implicit',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: AUTH_STORAGE_KEY,
      },
    });
  })().catch(() => {
    clientPromise = null; // например, первая загрузка без сети: попробуем позже
    return null;
  });
  return clientPromise;
}

async function run(fn) {
  const client = await getClient();
  if (!client) return { ok: false, error: 'Вход сейчас недоступен. Это не ты — попробуй чуть позже.' };
  try {
    const { data, error } = await fn(client);
    if (error) return { ok: false, error: authErrorMessage(error), code: error.code };
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: authErrorMessage(error) };
  }
}

/**
 * Куда ведут ссылки из писем и возврат после Google: домен из APP_URL на сервере,
 * а если он не задан — текущий адрес. Supabase примет его, только если адрес есть в Redirect URLs.
 */
async function home() {
  const { siteUrl } = await loadConfig();
  return `${siteUrl || window.location.origin}/`;
}

export const signUp = ({ email, password, name }) => run(async (c) => c.auth.signUp({
  email,
  password,
  options: { data: { name, timezone: currentTimezone() }, emailRedirectTo: await home() },
}));

export const signIn = ({ email, password }) => run((c) => c.auth.signInWithPassword({ email, password }));

/** Уводит на страницу Google и обратно; сессию подхватит detectSessionInUrl. */
export const signInWithGoogle = () => run(async (c) => c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: await home() } }));

/** Supabase отвечает одинаково для существующей и несуществующей почты — так и должно быть. */
export const resetPassword = (email) => run(async (c) => c.auth.resetPasswordForEmail(email, { redirectTo: await home() }));

export const updatePassword = (password) => run((c) => c.auth.updateUser({ password }));

/** Выход только на этом устройстве. */
export const signOut = () => run((c) => c.auth.signOut({ scope: 'local' }));

export async function getAccessToken() {
  const client = await getClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function onAuthChange(callback) {
  const client = await getClient();
  if (!client) return false;
  client.auth.onAuthStateChange((event, session) => {
    // Колбэк Supabase нельзя делать async: уводим работу из него
    setTimeout(() => callback(event, session), 0);
  });
  return true;
}

export async function fetchProfile(userId) {
  return run((c) => c.from('profiles').select('id, display_name, timezone, guest_imported_at, created_at').eq('id', userId).single());
}

export async function updateProfile(userId, patch) {
  return run((c) => c.from('profiles').update(patch).eq('id', userId).select().single());
}
