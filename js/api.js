import { validateSteps, PLAN_LIMITS, SUBSTEP_LIMITS } from './plan.js';

const ENDPOINT = '/api/plan';
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

/** Запрашивает шаги плана или подшаги одного шага (если передан step). */
export async function requestSteps({ type, description = '', step = null }) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new PlanApiError('offline', 'Нет интернета');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(step ? { type, description, step } : { type, description }),
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
    throw new PlanApiError('server', message);
  }

  const steps = validateSteps(data, step ? SUBSTEP_LIMITS : PLAN_LIMITS);
  if (!steps) throw new PlanApiError('invalid', 'Сервис вернул непонятный ответ');
  return steps;
}
