// Работа с localStorage. Все обращения в try/catch: хранилище может быть выключено,
// переполнено или содержать испорченные данные, и приложение от этого падать не должно.

import { isPlanShape, isValidType, migratePlan } from './plan.js';

const PREFIX = 'panic-mode:';
const PREFS_KEY = `${PREFIX}prefs`; // настройки устройства общие для гостя и аккаунтов

/** Пространство ключей: у гостя прежние ключи, у каждого аккаунта свои, чтобы данные не смешивались. */
export function userPrefix(userId) {
  return `${PREFIX}u:${userId}:`;
}

function keysFor(prefix) {
  return {
    session: `${prefix}session`,
    scenarios: `${prefix}scenarios`,
    outbox: `${prefix}outbox`, // изменения, которые ещё не дошли до сервера
    streak: `${prefix}streak`, // журнал активности и засчитанные дни
    legacyCurrent: prefix === PREFIX ? `${PREFIX}current` : null, // текущий план из первой версии
  };
}

export const MAX_SCENARIOS = 50;
export const SCREENS = ['onb', 'home', 'calm', 'chat', 'plan', 'done', 'saved', 'profile', 'streak'];
const RENAMED_SCREENS = { settings: 'profile' }; // экраны, переименованные в новых версиях

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
      ['ai', 'user', 'crisis', 'plan'].includes(m.role) && typeof m.text === 'string',
  );
}

function cleanPlan(raw) {
  const plan = migratePlan(raw);
  return isPlanShape(plan) ? plan : null;
}

/**
 * backend передаётся явно в тестах; в браузере это localStorage.
 * prefix — пространство ключей: гость по умолчанию или userPrefix(id) для аккаунта.
 */
export function createStorage(backend = defaultBackend(), { prefix = PREFIX } = {}) {
  const KEYS = keysFor(prefix);

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
      const raw = read(PREFS_KEY, null);
      return {
        onboarded: raw?.onboarded === true,
        settings: cleanSettings(raw?.settings),
        accountPromptSeen: raw?.accountPromptSeen === true,
        accountHintSeen: raw?.accountHintSeen === true,
        reminderTime: /^\d{2}:\d{2}$/.test(raw?.reminderTime ?? '') ? raw.reminderTime : null,
        firstSeenAt: Number.isFinite(raw?.firstSeenAt) ? raw.firstSeenAt : null,
      };
    },

    savePrefs({ onboarded, settings, accountPromptSeen = false, accountHintSeen = false, reminderTime = null, firstSeenAt = null }) {
      return write(PREFS_KEY, { onboarded, settings, accountPromptSeen, accountHintSeen, reminderTime, firstSeenAt });
    },

    /** Где человек остановился: экран, тема, разговор и текущий план. */
    loadSession() {
      const raw = read(KEYS.session, null);
      if (raw && typeof raw === 'object') {
        return {
          screen: SCREENS.includes(RENAMED_SCREENS[raw.screen] ?? raw.screen) ? RENAMED_SCREENS[raw.screen] ?? raw.screen : 'home',
          type: isValidType(raw.type) ? raw.type : null,
          messages: cleanMessages(raw.messages),
          plan: cleanPlan(raw.plan),
          planFrom: raw.planFrom === 'saved' ? 'saved' : 'chat',
          calmMode: raw.calmMode === 'ground' ? 'ground' : 'breath',
        };
      }

      // Первая версия хранила только текущий план: открываем его на экране плана
      const legacy = KEYS.legacyCurrent ? cleanPlan(read(KEYS.legacyCurrent, null)) : null;
      if (legacy) {
        write(KEYS.legacyCurrent, null);
        return { screen: 'plan', type: legacy.type, messages: [], plan: legacy, planFrom: 'saved', calmMode: 'breath' };
      }
      return null;
    },

    saveSession(session) {
      return write(KEYS.session, session);
    },

    /** Очередь несинхронизированных изменений: { [planId]: частичная строка таблицы plans } */
    loadOutbox() {
      const raw = read(KEYS.outbox, {});
      return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    },

    saveOutbox(outbox) {
      return write(KEYS.outbox, Object.keys(outbox).length ? outbox : null);
    },

    /** Серия: { activity: { day: [planId] }, doneDays: [day] } */
    loadStreak() {
      const raw = read(KEYS.streak, null);
      const day = /^\d{4}-\d{2}-\d{2}$/;
      const activity = {};
      if (raw?.activity && typeof raw.activity === 'object') {
        for (const [d, ids] of Object.entries(raw.activity)) {
          if (day.test(d) && Array.isArray(ids)) activity[d] = ids.filter((id) => typeof id === 'string');
        }
      }
      const doneDays = Array.isArray(raw?.doneDays) ? raw.doneDays.filter((d) => typeof d === 'string' && day.test(d)) : [];
      return { activity, doneDays };
    },

    saveStreak(streak) {
      return write(KEYS.streak, streak);
    },

    /** Полная замена списка сценариев данными с сервера. */
    replaceScenarios(list) {
      return writeScenarios(list);
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

    /** Удаляет данные этого пространства. withPrefs — ещё и общие настройки устройства. */
    clearAll({ withPrefs = true } = {}) {
      const keys = Object.values(KEYS).filter(Boolean);
      if (withPrefs) keys.push(PREFS_KEY);
      const results = keys.map((key) => write(key, null));
      return results.find((r) => !r.ok) ?? { ok: true };
    },
  };
}
