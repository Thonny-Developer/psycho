// Статистика профиля и экспорт данных. Чистые функции без DOM.

import { getProgress } from './plan.js';

/** Планы без дублей по id: сохранённые, текущий, загруженные с сервера. */
export function uniquePlans(...lists) {
  const byId = new Map();
  for (const plan of lists.flat()) if (plan && !byId.has(plan.id)) byId.set(plan.id, plan);
  return [...byId.values()];
}

/** Сколько планов завершено и сколько шагов сделано. */
export function computeStats(plans) {
  let completedPlans = 0;
  let doneSteps = 0;
  for (const plan of plans) {
    const progress = getProgress(plan);
    if (progress.complete) completedPlans += 1;
    doneSteps += progress.done;
  }
  return { completedPlans, doneSteps };
}

/** Всё, что приложение знает о человеке, в одном JSON. */
export function buildExport({ account = null, profile = null, settings, plans, conversation = [], now = new Date() }) {
  return {
    app: 'Паника-режим',
    format: 1,
    exported_at: now.toISOString(),
    account: account
      ? {
        email: account.email,
        display_name: profile?.display_name ?? '',
        avatar: profile?.avatar ?? null,
        timezone: profile?.timezone ?? null,
        reminder_time: profile?.reminder_time ?? null,
        created_at: profile?.created_at ?? null,
      }
      : null,
    settings,
    plans: plans.map((p) => ({
      id: p.id,
      type: p.type,
      title: p.title,
      source: p.source,
      created_at: p.createdAt ? new Date(p.createdAt).toISOString() : null,
      saved_at: p.savedAt ? new Date(p.savedAt).toISOString() : null,
      steps: p.steps.map((s) => ({
        title: s.title,
        minutes: s.minutes,
        done: s.done,
        substeps: s.substeps.map((u) => ({ title: u.title, minutes: u.minutes, done: u.done })),
      })),
    })),
    // Текущий разговор хранится только на этом устройстве
    conversation: conversation
      .filter((m) => m.role === 'user' || m.role === 'ai')
      .map((m) => ({ role: m.role === 'ai' ? 'помощник' : 'я', text: m.text })),
  };
}

export function exportFileName(now = new Date()) {
  return `panika-rezhim-${now.toISOString().slice(0, 10)}.json`;
}
