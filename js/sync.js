// Синхронизация планов аккаунта с Supabase. Источник правды для интерфейса — локальный кеш
// аккаунта (так всё работает без сети), а изменения копятся в очереди и уходят на сервер.

import { getClient } from './auth.js';
import { mergeOutbox, planToRow, rowToPlan } from './account.js';

const FLUSH_DELAY_MS = 800;
const PULL_LIMIT = 300;

function isNetworkError(error) {
  return !error?.code && /fetch|network|load failed/i.test(error?.message ?? '');
}

function isAuthError(error) {
  return error?.code === 'PGRST301' || error?.code === 'PGRST303' || error?.status === 401;
}

/**
 * storage — хранилище аккаунта (createStorage с userPrefix).
 * onExpired — сессия больше не действует, нужно войти заново.
 */
export function createSync({ storage, userId, onExpired = () => {}, onChange = () => {} }) {
  let timer = null;
  let flushing = false;
  let stopped = false;

  function queue(row) {
    if (stopped) return;
    storage.saveOutbox(mergeOutbox(storage.loadOutbox(), { ...row, user_id: userId }));
    clearTimeout(timer);
    timer = setTimeout(flush, FLUSH_DELAY_MS);
    onChange();
  }

  /** Отправляет очередь. Возвращает true, если всё ушло. */
  async function flush() {
    if (flushing || stopped) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
    const client = await getClient();
    if (!client) return false;

    flushing = true;
    try {
      for (const [id, row] of Object.entries(storage.loadOutbox())) {
        const { error } = await send(client, row);
        if (error) {
          if (isAuthError(error)) {
            onExpired();
            return false;
          }
          if (isNetworkError(error)) return false;
          // Строку отклонили проверки базы: повторять бессмысленно, убираем из очереди
        }
        const outbox = storage.loadOutbox();
        // Пока шёл запрос, план могли изменить снова — тогда запись остаётся в очереди
        if (JSON.stringify(outbox[id]) === JSON.stringify(row)) {
          delete outbox[id];
          storage.saveOutbox(outbox);
        }
      }
      return Object.keys(storage.loadOutbox()).length === 0;
    } catch {
      return false;
    } finally {
      flushing = false;
      onChange();
    }
  }

  /** Одна запись очереди → запрос. Статусы книг лежат в очереди с ключом book:<id>. */
  function send(client, row) {
    if (row._table === 'book_status') {
      if (!row.status) return client.from('book_status').delete().eq('book_id', row.book_id);
      return client.from('book_status').upsert({ user_id: userId, book_id: row.book_id, status: row.status }, { onConflict: 'user_id,book_id' });
    }
    return client.from('plans').upsert(row, { onConflict: 'user_id,id' });
  }

  return {
    get pending() {
      return Object.keys(storage.loadOutbox()).length;
    },

    /** Изменился план (шаги, подшаги): saved_at не трогаем. */
    savePlan(plan) {
      queue(planToRow(plan));
    },

    /** Сохранён в «Мои сценарии» или убран оттуда. */
    setSaved(plan, saved) {
      queue(planToRow(plan, { saved, savedAt: plan.savedAt }));
    },

    flush,

    /** Планы аккаунта с сервера: { scenarios, all } или null без связи. */
    async pull() {
      const client = await getClient();
      if (!client) return null;
      const { data, error } = await client
        .from('plans')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(PULL_LIMIT);
      if (error) {
        if (isAuthError(error)) onExpired();
        return null;
      }
      // Неотправленные локальные правки важнее серверной версии
      const outbox = storage.loadOutbox();
      const all = data.map((row) => rowToPlan(outbox[row.id] ? { ...row, ...outbox[row.id] } : row)).filter(Boolean);
      // Новые планы, которые ещё в очереди и на сервер не дошли
      for (const row of Object.values(outbox)) {
        if (row._table || data.some((r) => r.id === row.id)) continue;
        const plan = rowToPlan({ created_at: new Date().toISOString(), ...row });
        if (plan) all.push(plan);
      }
      const scenarios = all.filter((p) => p.savedAt).sort((a, b) => b.savedAt - a.savedAt);
      return { scenarios, all };
    },

    /** Засчитанные дни серии с сервера (их пишет только триггер) или null без связи. */
    async pullStreak() {
      const client = await getClient();
      if (!client) return null;
      const { data, error } = await client.from('streak_days').select('day').order('day', { ascending: false }).limit(400);
      if (error) {
        if (isAuthError(error)) onExpired();
        return null;
      }
      return data.map((r) => r.day);
    },

    /** Статус книги; null — снять отметку. */
    setBookStatus(bookId, status) {
      queue({ id: `book:${bookId}`, _table: 'book_status', book_id: bookId, status: status ?? null });
    },

    /** Статусы книг с сервера с учётом неотправленных изменений, или null без связи. */
    async pullBookStatuses() {
      const client = await getClient();
      if (!client) return null;
      const { data, error } = await client.from('book_status').select('book_id, status');
      if (error) {
        if (isAuthError(error)) onExpired();
        return null;
      }
      const result = Object.fromEntries(data.map((r) => [r.book_id, r.status]));
      for (const row of Object.values(storage.loadOutbox())) {
        if (row._table !== 'book_status') continue;
        if (row.status) result[row.book_id] = row.status;
        else delete result[row.book_id];
      }
      return result;
    },

    /** Перенос гостевых планов: существующие строки не трогаем, дублей нет. */
    async importPlans(items) {
      const client = await getClient();
      if (!client) return { ok: false };
      const rows = items.map(({ plan, saved }) => ({
        ...planToRow(plan, { saved, savedAt: plan.savedAt, imported: true }),
        user_id: userId,
      }));
      if (!rows.length) return { ok: true };
      const { error } = await client.from('plans').upsert(rows, { onConflict: 'user_id,id', ignoreDuplicates: true });
      if (error && isAuthError(error)) onExpired();
      return { ok: !error };
    },

    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
