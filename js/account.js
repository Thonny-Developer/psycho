// Чистая логика аккаунта: проверка полей, понятные тексты ошибок, план ⇄ строка таблицы plans.
// Без DOM и сети, общая для браузера и тестов.

import { isPlanShape, isValidType } from './plan.js';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // ограничение bcrypt в Supabase Auth
export const NAME_MAX = 40;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value) {
  const email = String(value ?? '').trim();
  if (!email) return 'Впиши почту — на неё придёт подтверждение';
  if (email.length > 254 || !EMAIL_RE.test(email)) return 'Похоже, в адресе опечатка. Проверь, есть ли @ и точка';
  return null;
}

export function validatePassword(value) {
  const password = String(value ?? '');
  if (!password) return 'Придумай пароль';
  if (password.length < PASSWORD_MIN) return `Пароль нужен хотя бы из ${PASSWORD_MIN} символов`;
  if (password.length > PASSWORD_MAX) return `Пароль слишком длинный, до ${PASSWORD_MAX} символов`;
  return null;
}

export function validateName(value) {
  const name = String(value ?? '').trim();
  if (name.length > NAME_MAX) return `Имя покороче, до ${NAME_MAX} символов`;
  return null;
}

/** Ошибка Supabase Auth → спокойный текст. Детали сервера наружу не выводим. */
export function authErrorMessage(error) {
  const code = error?.code ?? '';
  const status = error?.status ?? 0;
  const name = error?.name ?? '';

  if (name === 'AuthRetryableFetchError' || status === 0 || /fetch|network/i.test(error?.message ?? '')) {
    return 'Нет связи с сервером. Проверь интернет и попробуй ещё раз.';
  }
  switch (code) {
    case 'invalid_credentials':
      return 'Почта или пароль не подошли. Проверь раскладку и попробуй ещё раз.';
    case 'email_not_confirmed':
      return 'Почта ещё не подтверждена. Открой письмо от нас и нажми ссылку.';
    case 'user_already_exists':
    case 'email_exists':
      return 'С этой почтой уже есть аккаунт. Можно просто войти.';
    case 'weak_password':
      return 'Пароль слишком простой. Добавь цифры или ещё пару слов.';
    case 'same_password':
      return 'Это текущий пароль. Придумай новый.';
    case 'email_address_invalid':
      return 'Похоже, в адресе опечатка.';
    case 'over_email_send_rate_limit':
      return 'Письмо уже недавно отправлялось. Подожди пару минут и проверь «Спам».';
    case 'over_request_rate_limit':
      return 'Слишком много попыток. Подожди минуту и попробуй снова.';
    case 'session_not_found':
    case 'refresh_token_not_found':
      return 'Сессия закончилась. Войди ещё раз — данные на месте.';
    case 'signup_disabled':
      return 'Регистрация сейчас закрыта.';
    default:
      return 'Не получилось. Это не ты — попробуй ещё раз чуть позже.';
  }
}

/**
 * План → строка таблицы plans. saved: true — сохранён в «Мои сценарии», false — убран оттуда,
 * undefined — не трогать (чтобы правка шага не сбросила сохранение).
 */
export function planToRow(plan, { saved, savedAt, imported = false } = {}) {
  const row = {
    id: plan.id,
    type: plan.type,
    title: plan.title,
    source: plan.source === 'fallback' ? 'fallback' : 'api',
    fallback_reason: plan.fallbackReason ?? null,
    steps: plan.steps.map((s) => ({
      id: s.id,
      title: s.title,
      minutes: s.minutes,
      done: s.done,
      substeps: (s.substeps ?? []).map((u) => ({ id: u.id, title: u.title, minutes: u.minutes, done: u.done })),
    })),
  };
  if (saved === true) row.saved_at = new Date(savedAt ?? plan.savedAt ?? Date.now()).toISOString();
  if (saved === false) row.saved_at = null;
  if (imported) {
    row.imported = true;
    row.created_at = new Date(plan.createdAt ?? Date.now()).toISOString();
  }
  return row;
}

/** Строка таблицы plans → план приложения. Битая строка → null. */
export function rowToPlan(row) {
  if (!row || typeof row !== 'object' || !isValidType(row.type)) return null;
  const time = (value) => (value ? Date.parse(value) : null);
  const plan = {
    id: row.id,
    type: row.type,
    title: row.title,
    source: row.source === 'fallback' ? 'fallback' : 'api',
    createdAt: time(row.created_at) ?? Date.now(),
    steps: Array.isArray(row.steps) ? row.steps : [],
  };
  if (row.fallback_reason) plan.fallbackReason = row.fallback_reason;
  if (row.saved_at) plan.savedAt = time(row.saved_at);
  if (row.completed_at) plan.completedAt = time(row.completed_at);
  return isPlanShape(plan) ? plan : null;
}

/** Склеивает изменения одного плана в очереди: новое поверх старого, saved_at не теряется. */
export function mergeOutbox(outbox, row) {
  return { ...outbox, [row.id]: { ...(outbox[row.id] ?? {}), ...row } };
}

/** Гостевые планы для переноса в аккаунт: сохранённые и текущий, без дублей по id. */
export function guestPlansForImport({ scenarios = [], current = null }) {
  const byId = new Map(scenarios.map((p) => [p.id, { plan: p, saved: true }]));
  if (current && !byId.has(current.id)) byId.set(current.id, { plan: current, saved: false });
  return [...byId.values()];
}
