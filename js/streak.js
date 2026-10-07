// Серия дней. Чистая логика без DOM, общая для гостя (считается на устройстве) и аккаунта
// (прошлые дни приходят с сервера, сегодняшний считается здесь же и подтверждается сервером).
//
// Правило: в день D активны планы, которые в этот день составлены или в которых отмечался пункт.
// День засчитывается, если все активные планы закрыты и хотя бы один из них закрыт именно в D.
// Раз в календарную неделю (пн–вс) один пропущенный день считается днём отдыха и серию не ломает.
// Все даты — строки 'YYYY-MM-DD' в часовом поясе человека.

import { getProgress } from './plan.js';

export const STREAK_RULE = 'День засчитывается, когда все планы, с которыми ты работаешь в этот день, закрыты.';
export const REST_RULE = 'Раз в неделю можно пропустить день — это день отдыха, серия не прервётся.';
const KEEP_DAYS = 400;

// ---------- Даты ----------

const formatters = new Map();

/** Календарная дата момента времени в часовом поясе: dayKey(Date.now(), 'Asia/Almaty') → '2026-10-07' */
export function dayKey(time, timeZone = 'UTC') {
  let fmt = formatters.get(timeZone);
  if (!fmt) {
    try {
      fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    } catch {
      fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' });
    }
    formatters.set(timeZone, fmt);
  }
  const parts = Object.fromEntries(fmt.formatToParts(new Date(time)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function toUtc(day) {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(day, n) {
  return new Date(toUtc(day) + n * 864e5).toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((toUtc(to) - toUtc(from)) / 864e5);
}

/** Понедельник недели, в которую входит день */
export function weekStart(day) {
  const dow = (new Date(toUtc(day)).getUTCDay() + 6) % 7;
  return addDays(day, -dow);
}

// ---------- Журнал активности ----------

/** Отмечает, что с планом работали в этот день. Старые записи постепенно отбрасываются. */
export function recordActivity(log, planId, day) {
  const ids = log[day] ?? [];
  if (ids.includes(planId)) return log;
  const next = { ...log, [day]: [...ids, planId] };
  const oldest = addDays(day, -KEEP_DAYS);
  for (const d of Object.keys(next)) if (d < oldest) delete next[d];
  return next;
}

/** Момент завершения плана: ставится, когда закрыт последний шаг, и снимается, если шаг вернули. */
export function withCompletion(plan, now = Date.now()) {
  const complete = getProgress(plan).complete;
  if (complete && plan.completedAt) return plan;
  if (!complete && !plan.completedAt) return plan;
  const next = { ...plan };
  if (complete) next.completedAt = now;
  else delete next.completedAt;
  return next;
}

/**
 * Состояние дня: done — засчитан, pending — есть незакрытые активные планы, empty — планов не было.
 * plans — Map id → план (с completedAt у закрытых).
 */
export function evaluateDay({ day, activity, plans, timeZone }) {
  const active = (activity[day] ?? []).map((id) => plans.get(id)).filter(Boolean);
  if (!active.length) return { status: 'empty', remainingSteps: 0, activePlans: 0 };

  const remainingSteps = active.reduce((n, p) => n + (p.steps.length - getProgress(p).done), 0);
  const allClosed = active.every((p) => getProgress(p).complete && p.completedAt);
  const closedThatDay = active.some((p) => p.completedAt && dayKey(p.completedAt, timeZone) === day);
  return { status: allClosed && closedThatDay ? 'done' : 'pending', remainingSteps, activePlans: active.length };
}

/**
 * Обновляет только сегодняшний день: прошлые дни уже прожиты и не пересчитываются,
 * даже если план потом открыли снова.
 */
export function syncToday(doneDays, today, status) {
  const set = new Set(doneDays);
  if (status === 'done') set.add(today);
  else set.delete(today);
  const oldest = addDays(today, -KEEP_DAYS);
  return [...set].filter((d) => d >= oldest).sort();
}

// ---------- Серия ----------

/**
 * Идём назад от сегодня. Незаконченный сегодняшний день серию не прерывает: день ещё идёт.
 * Пропуск в один день закрывается днём отдыха, если в этой неделе он ещё не использован.
 */
function chainBack(done, from) {
  let day = from;
  let count = 0;
  const restDays = [];
  const usedWeeks = new Set();
  for (;;) {
    if (done.has(day)) {
      count += 1;
      day = addDays(day, -1);
      continue;
    }
    const week = weekStart(day);
    const before = addDays(day, -1);
    if (!usedWeeks.has(week) && done.has(before)) {
      usedWeeks.add(week);
      restDays.push(day);
      day = before;
      continue;
    }
    return { count, restDays };
  }
}

/** Лучшая серия за всё время по тем же правилам. */
function bestChain(sortedDays) {
  let best = 0;
  let count = 0;
  let last = null;
  let usedWeeks = new Set();
  for (const day of sortedDays) {
    const gap = last ? daysBetween(last, day) : null;
    if (gap === 1) {
      count += 1;
    } else if (gap === 2 && !usedWeeks.has(weekStart(addDays(last, 1)))) {
      usedWeeks.add(weekStart(addDays(last, 1)));
      count += 1;
    } else {
      count = 1;
      usedWeeks = new Set();
    }
    last = day;
    best = Math.max(best, count);
  }
  return best;
}

/**
 * { current, best, todayDone, restDays, status }
 * status: none — серии ещё не было; started — первый день; continues — продолжается;
 * at-risk — сегодня ещё не засчитан, но серия жива; broken — серия закончилась.
 */
export function computeStreak(doneDays, today) {
  const done = new Set(doneDays.filter((d) => d <= today));
  const todayDone = done.has(today);
  const { count: current, restDays } = chainBack(done, todayDone ? today : addDays(today, -1));
  const best = Math.max(bestChain([...done].sort()), current);

  let status;
  if (current === 0) status = done.size ? 'broken' : 'none';
  else if (todayDone) status = current === 1 ? 'started' : 'continues';
  else status = 'at-risk';

  return { current, best, todayDone, restDays, status };
}

// ---------- Для интерфейса ----------

/** Неделя пн–вс с состоянием каждого дня для мини-календаря */
export function weekView(doneDays, today, restDays = []) {
  const done = new Set(doneDays);
  const rest = new Set(restDays);
  const start = weekStart(today);
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(start, i);
    let state = 'missed';
    if (done.has(day)) state = 'done';
    else if (rest.has(day)) state = 'rest';
    else if (day === today) state = 'today';
    else if (day > today) state = 'future';
    return { day, state };
  });
}

/** Сетка месяца: недели с понедельника, пустые клетки — null */
export function monthGrid(year, month) {
  const first = `${year}-${String(month).padStart(2, '0')}-01`;
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = daysBetween(weekStart(first), first);
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Засчитанные дни по неделям: последние count недель, текущая — последняя */
export function weeklyCounts(doneDays, today, count = 4) {
  const done = new Set(doneDays);
  const current = weekStart(today);
  return Array.from({ length: count }, (_, i) => {
    const start = addDays(current, (i - count + 1) * 7);
    let n = 0;
    for (let d = 0; d < 7; d++) if (done.has(addDays(start, d))) n += 1;
    return { start, count: n };
  });
}

export const BADGES = [
  { key: 'three', days: 3, label: '3 дня подряд' },
  { key: 'week', days: 7, label: 'Неделя' },
  { key: 'month', days: 30, label: 'Месяц' },
];

export function badges(best) {
  return BADGES.map((b) => ({ ...b, earned: best >= b.days }));
}

/** Склонение «день»: 1 день, 2 дня, 5 дней */
export function daysWord(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'день';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня';
  return 'дней';
}
