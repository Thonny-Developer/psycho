// Работа с localStorage. Все обращения в try/catch: хранилище может быть выключено,
// переполнено или содержать испорченные данные, и приложение от этого падать не должно.

import { isPlanShape } from './plan.js';

const CURRENT_KEY = 'panic-mode:current';
const SCENARIOS_KEY = 'panic-mode:scenarios';
export const MAX_SCENARIOS = 50;

function defaultBackend() {
  try {
    // В некоторых браузерах само обращение к localStorage бросает SecurityError
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isQuotaError(error) {
  return error?.name === 'QuotaExceededError' || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || error?.code === 22;
}

/** backend передаётся явно в тестах; в браузере это localStorage. */
export function createStorage(backend = defaultBackend()) {
  function read(key, fallback) {
    if (!backend) return fallback;
    try {
      const raw = backend.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    if (!backend) return { ok: false, error: 'unavailable' };
    try {
      if (value == null) backend.removeItem(key);
      else backend.setItem(key, JSON.stringify(value));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: isQuotaError(error) ? 'quota' : 'unavailable' };
    }
  }

  function listScenarios() {
    const list = read(SCENARIOS_KEY, []);
    if (!Array.isArray(list)) return [];
    return list.filter(isPlanShape).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  }

  function writeScenarios(list) {
    const result = write(SCENARIOS_KEY, list);
    return result.ok ? { ok: true, scenarios: list } : { ...result, scenarios: listScenarios() };
  }

  return {
    loadCurrent() {
      const plan = read(CURRENT_KEY, null);
      return isPlanShape(plan) ? plan : null;
    },

    saveCurrent(plan) {
      return write(CURRENT_KEY, plan);
    },

    listScenarios,

    /** Добавляет план в сохранённые; если он уже там, обновляет. */
    addScenario(plan, now = Date.now()) {
      const list = listScenarios();
      if (list.some((s) => s.id === plan.id)) return this.updateScenario(plan);
      if (list.length >= MAX_SCENARIOS) return { ok: false, error: 'limit', scenarios: list };
      return writeScenarios([{ ...plan, savedAt: now }, ...list]);
    },

    /** Обновляет только уже сохранённый сценарий: отметки шагов, подшаги. */
    updateScenario(plan) {
      const list = listScenarios();
      const index = list.findIndex((s) => s.id === plan.id);
      if (index === -1) return { ok: true, scenarios: list };
      const next = [...list];
      next[index] = { ...plan, savedAt: list[index].savedAt };
      return writeScenarios(next);
    },

    deleteScenario(id) {
      return writeScenarios(listScenarios().filter((s) => s.id !== id));
    },
  };
}
