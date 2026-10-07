// Работа с localStorage. Все обращения в try/catch: хранилище может быть выключено,
// переполнено или содержать испорченные данные, и приложение от этого падать не должно.

import { isPlanShape, isValidType, migratePlan } from './plan.js';

const KEYS = {
  prefs: 'panic-mode:prefs',
  session: 'panic-mode:session',
  scenarios: 'panic-mode:scenarios',
  legacyCurrent: 'panic-mode:current', // текущий план из первой версии
};

export const MAX_SCENARIOS = 50;
export const SCREENS = ['onb', 'home', 'calm', 'chat', 'plan', 'done', 'saved', 'settings'];

export const DEFAULT_SETTINGS = { theme: 'system', fs: 'm', reduce: null };
const THEMES = ['system', 'light', 'dark'];
const FONT_SIZES = ['m', 'l', 'xl'];

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

function cleanSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    theme: THEMES.includes(s.theme) ? s.theme : DEFAULT_SETTINGS.theme,
    fs: FONT_SIZES.includes(s.fs) ? s.fs : DEFAULT_SETTINGS.fs,
    reduce: typeof s.reduce === 'boolean' ? s.reduce : null,
  };
}

function cleanMessages(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m) => m && typeof m === 'object' && typeof m.id === 'string' &&
      ['ai', 'user', 'crisis'].includes(m.role) && typeof m.text === 'string',
  );
}

function cleanPlan(raw) {
  const plan = migratePlan(raw);
  return isPlanShape(plan) ? plan : null;
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
    const list = read(KEYS.scenarios, []);
    if (!Array.isArray(list)) return [];
    return list
      .map(cleanPlan)
      .filter(Boolean)
      .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  }

  function writeScenarios(list) {
    const result = write(KEYS.scenarios, list);
    return result.ok ? { ok: true, scenarios: list } : { ...result, scenarios: listScenarios() };
  }

  return {
    loadPrefs() {
      const raw = read(KEYS.prefs, null);
      return {
        onboarded: raw?.onboarded === true,
        settings: cleanSettings(raw?.settings),
      };
    },

    savePrefs({ onboarded, settings }) {
      return write(KEYS.prefs, { onboarded, settings });
    },

    /** Где человек остановился: экран, тема, разговор и текущий план. */
    loadSession() {
      const raw = read(KEYS.session, null);
      if (raw && typeof raw === 'object') {
        return {
          screen: SCREENS.includes(raw.screen) ? raw.screen : 'home',
          type: isValidType(raw.type) ? raw.type : null,
          messages: cleanMessages(raw.messages),
          plan: cleanPlan(raw.plan),
          planFrom: raw.planFrom === 'saved' ? 'saved' : 'chat',
          calmMode: raw.calmMode === 'ground' ? 'ground' : 'breath',
        };
      }

      // Первая версия хранила только текущий план: открываем его на экране плана
      const legacy = cleanPlan(read(KEYS.legacyCurrent, null));
      if (legacy) {
        write(KEYS.legacyCurrent, null);
        return { screen: 'plan', type: legacy.type, messages: [], plan: legacy, planFrom: 'saved', calmMode: 'breath' };
      }
      return null;
    },

    saveSession(session) {
      return write(KEYS.session, session);
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

    /** Возврат удалённого сценария из тоста «Вернуть» на его прежнее место. */
    restoreScenario(scenario) {
      const list = listScenarios();
      if (list.some((s) => s.id === scenario.id)) return { ok: true, scenarios: list };
      const next = [...list, scenario].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
      return writeScenarios(next);
    },

    clearAll() {
      const results = Object.values(KEYS).map((key) => write(key, null));
      return results.find((r) => !r.ok) ?? { ok: true };
    },
  };
}
