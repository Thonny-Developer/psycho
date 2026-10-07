import { validatePlan, validateSteps, SUBSTEP_LIMITS } from './plan.js';
import { toApiMessages, validateReply } from './chat.js';

const ENDPOINT = '/api/plan';

// Токен аккаунта, если человек вошёл: сервер считает лимит запросов по аккаунту, а не по IP
let tokenProvider = async () => null;
export function setTokenProvider(fn) {
  tokenProvider = fn;
}
// Чуть больше серверного таймаута к Mistral (15 с), чтобы сервер успел вернуть свою ошибку
const TIMEOUT_MS = 20_000;

/**
 * kind: offline | timeout | network | rate_limit | bad_request | server | invalid
 */
export class PlanApiError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'PlanApiError';
    this.kind = kind;
  }
}

async function post(payload) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new PlanApiError('offline', 'Нет интернета');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const headers = { 'Content-Type': 'application/json' };
  const token = await tokenProvider().catch(() => null);
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new PlanApiError('timeout', 'Сервис долго не отвечал');
    throw new PlanApiError('network', 'Не удалось связаться с сервисом');
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // тело не JSON: например, 404 при запуске без serverless-функции
  }

  if (!response.ok) {
    const message = typeof data?.error === 'string' ? data.error : 'Сервис сейчас недоступен';
    if (response.status === 429) throw new PlanApiError('rate_limit', message);
    if (response.status === 400) throw new PlanApiError('bad_request', message);
    if (response.status === 504) throw new PlanApiError('timeout', message);
    throw new PlanApiError('server', message);
  }
  return data;
}

function invalid() {
  return new PlanApiError('invalid', 'Сервис вернул непонятный ответ');
}

/**
 * Следующий ход помощника в чате: { reply, plan }.
 * Если информации хватает, модель сама собирает план через инструмент — тогда plan не пустой.
 */
export async function requestReply({ type, messages }) {
  const data = await post({ action: 'chat', type, messages: toApiMessages(messages) });
  const reply = typeof data?.reply === 'string' ? validateReply(data) : null;
  const plan = data?.plan ? validatePlan(data.plan) : null;
  if (!reply && !plan) throw invalid();
  return { reply, plan };
}

/** План по разговору: { title, steps }. */
export async function requestPlan({ type, messages }) {
  const plan = validatePlan(await post({ action: 'plan', type, messages: toApiMessages(messages) }));
  if (!plan) throw invalid();
  return plan;
}

/** Подшаги для одного шага плана. */
export async function requestSplit({ type, planTitle, step }) {
  const data = await post({ action: 'split', type, planTitle, step: step.title, stepMinutes: step.minutes });
  const steps = validateSteps(data, SUBSTEP_LIMITS);
  if (!steps) throw invalid();
  return steps;
}

/** Короткое объяснение причины для пользователя. */
export function describeError(error) {
  switch (error?.kind) {
    case 'offline':
      return 'Сейчас нет сети.';
    case 'timeout':
      return 'AI долго не отвечал.';
    case 'rate_limit':
      return 'Слишком много запросов за минуту, подожди немного.';
    default:
      return 'Связаться с AI не получилось.';
  }
}
