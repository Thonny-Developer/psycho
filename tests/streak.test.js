import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayKey,
  addDays,
  weekStart,
  recordActivity,
  withCompletion,
  evaluateDay,
  syncToday,
  computeStreak,
  weekView,
  monthGrid,
  weeklyCounts,
  badges,
  daysWord,
} from '../js/streak.js';
import { createPlan, setStepDone } from '../js/plan.js';

const plan = (title = 'План', n = 2) =>
  createPlan({ type: 'all', title, steps: Array.from({ length: n }, (_, i) => ({ title: `Шаг ${i + 1}`, minutes: 5 })) });
const closeAll = (p, at) => withCompletion(p.steps.reduce((x, s) => setStepDone(x, s.id, true), p), at);
const plansMap = (...list) => new Map(list.map((p) => [p.id, p]));

// ---------- Даты и часовые пояса ----------

test('день считается по часовому поясу человека, а не по UTC', () => {
  // 2026-10-07 20:30 UTC — в Алматы (UTC+5) уже 8 октября, в Нью-Йорке ещё 7-е
  const t = Date.UTC(2026, 9, 7, 20, 30);
  assert.equal(dayKey(t, 'UTC'), '2026-10-07');
  assert.equal(dayKey(t, 'Asia/Almaty'), '2026-10-08');
  assert.equal(dayKey(t, 'America/New_York'), '2026-10-07');
  assert.equal(dayKey(t, 'Not/AZone'), '2026-10-07', 'неизвестный пояс → UTC, без падения');
});

test('граница полуночи: 23:59:59 и 00:00:00 — разные дни', () => {
  // Алматы UTC+5: местная полночь 8 октября = 2026-10-07T19:00:00Z
  const midnight = Date.UTC(2026, 9, 7, 19, 0, 0);
  assert.equal(dayKey(midnight - 1000, 'Asia/Almaty'), '2026-10-07');
  assert.equal(dayKey(midnight, 'Asia/Almaty'), '2026-10-08');
});

test('переход на летнее время не ломает календарные дни', () => {
  // В Берлине 29 марта 2026 сутки длятся 23 часа
  assert.equal(dayKey(Date.UTC(2026, 2, 28, 22, 30), 'Europe/Berlin'), '2026-03-28');
  assert.equal(dayKey(Date.UTC(2026, 2, 29, 22, 30), 'Europe/Berlin'), '2026-03-30');
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
});

test('переход через конец месяца, февраль и конец года', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29', 'високосный год');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(weekStart('2027-01-01'), '2026-12-28', 'неделя через Новый год начинается в декабре');
});

// ---------- Засчитан ли день ----------

test('день засчитан, когда все активные планы закрыты и один закрыт сегодня', () => {
  const tz = 'Asia/Almaty';
  const now = Date.UTC(2026, 9, 7, 10);
  const today = dayKey(now, tz);
  const a = closeAll(plan('A'), now);
  const activity = recordActivity({}, a.id, today);
  assert.equal(evaluateDay({ day: today, activity, plans: plansMap(a), timeZone: tz }).status, 'done');
});

test('несколько планов за день: пока один открыт, день не засчитан', () => {
  const tz = 'UTC';
  const now = Date.UTC(2026, 9, 7, 10);
  const today = dayKey(now, tz);
  const a = closeAll(plan('A'), now);
  let b = plan('B', 3);
  b = setStepDone(b, b.steps[0].id, true);
  let activity = recordActivity({}, a.id, today);
  activity = recordActivity(activity, b.id, today);

  const pending = evaluateDay({ day: today, activity, plans: plansMap(a, b), timeZone: tz });
  assert.deepEqual(pending, { status: 'pending', remainingSteps: 2, activePlans: 2 });

  const bDone = closeAll(b, now + 1000);
  assert.equal(evaluateDay({ day: today, activity, plans: plansMap(a, bDone), timeZone: tz }).status, 'done');
});

test('план, закрытый вчера и не тронутый сегодня, сегодняшний день не засчитывает', () => {
  const tz = 'UTC';
  const yesterday = Date.UTC(2026, 9, 6, 12);
  const a = closeAll(plan('A'), yesterday);
  // сегодня с планом работали (открыли и отметили уже отмеченный шаг), но закрыт он не сегодня
  const activity = recordActivity({}, a.id, '2026-10-07');
  assert.equal(evaluateDay({ day: '2026-10-07', activity, plans: plansMap(a), timeZone: tz }).status, 'pending');
  assert.equal(evaluateDay({ day: '2026-10-08', activity, plans: plansMap(a), timeZone: tz }).status, 'empty');
});

test('старые нетронутые планы серию не блокируют', () => {
  const tz = 'UTC';
  const now = Date.UTC(2026, 9, 7, 10);
  const old = plan('Старый, брошенный');
  const fresh = closeAll(plan('Сегодняшний'), now);
  let activity = recordActivity({}, old.id, '2026-09-01');
  activity = recordActivity(activity, fresh.id, '2026-10-07');
  assert.equal(evaluateDay({ day: '2026-10-07', activity, plans: plansMap(old, fresh), timeZone: tz }).status, 'done');
});

test('withCompletion ставит и снимает время завершения', () => {
  const now = 1_800_000_000_000;
  let p = closeAll(plan(), now);
  assert.equal(p.completedAt, now);
  assert.equal(withCompletion(p, now + 5).completedAt, now, 'повторно не переставляется');
  p = withCompletion(setStepDone(p, p.steps[0].id, false), now + 10);
  assert.equal(p.completedAt, undefined);
});

test('syncToday меняет только сегодня, прошлые дни остаются', () => {
  let days = ['2026-10-05', '2026-10-06'];
  days = syncToday(days, '2026-10-07', 'done');
  assert.deepEqual(days, ['2026-10-05', '2026-10-06', '2026-10-07']);
  // человек открыл план снова и не закрыл — сегодняшний день снимается, вчерашний нет
  days = syncToday(days, '2026-10-07', 'pending');
  assert.deepEqual(days, ['2026-10-05', '2026-10-06']);
});

// ---------- Серия ----------

test('серия началась и продолжается', () => {
  assert.deepEqual(pick(computeStreak(['2026-10-07'], '2026-10-07')), { current: 1, best: 1, status: 'started' });
  assert.deepEqual(pick(computeStreak(['2026-10-05', '2026-10-06', '2026-10-07'], '2026-10-07')), { current: 3, best: 3, status: 'continues' });
});

test('смена дня: незаконченное сегодня не обнуляет серию, а ставит её под угрозу', () => {
  const days = ['2026-10-05', '2026-10-06'];
  assert.deepEqual(pick(computeStreak(days, '2026-10-07')), { current: 2, best: 2, status: 'at-risk' });
});

test('пропуск дня закрывает день отдыха, раз в неделю', () => {
  // ср 7 окт пропущен; пн–вт и чт–пт закрыты (неделя 5–11 октября)
  const days = ['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09'];
  const s = computeStreak(days, '2026-10-09');
  assert.equal(s.current, 4, 'день отдыха не прибавляется, но и не прерывает');
  assert.deepEqual(s.restDays, ['2026-10-07']);
});

test('второй пропуск в ту же неделю прерывает серию', () => {
  // пропущены вт 6 и чт 8 октября — одна неделя
  const days = ['2026-10-05', '2026-10-07', '2026-10-09'];
  const s = computeStreak(days, '2026-10-09');
  assert.equal(s.current, 2);
  assert.deepEqual(s.restDays, ['2026-10-08']);
});

test('пропуски в разные недели закрываются оба', () => {
  // вс 4 окт (неделя 28.09–04.10) и ср 7 окт (неделя 05–11.10)
  const days = ['2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06', '2026-10-08'];
  const s = computeStreak(days, '2026-10-08');
  assert.equal(s.current, 5);
  assert.deepEqual(s.restDays.sort(), ['2026-10-04', '2026-10-07']);
});

test('два дня подряд пропущено — серия закончилась', () => {
  const days = ['2026-10-01', '2026-10-02', '2026-10-03'];
  assert.deepEqual(pick(computeStreak(days, '2026-10-07')), { current: 0, best: 3, status: 'broken' });
});

test('вчера пропущено, но отдых доступен: серия жива, сегодня под угрозой', () => {
  const days = ['2026-10-04', '2026-10-05'];
  const s = computeStreak(days, '2026-10-07');
  assert.equal(s.status, 'at-risk');
  assert.equal(s.current, 2);
  assert.deepEqual(s.restDays, ['2026-10-06']);
});

test('серия через конец месяца и года', () => {
  const days = ['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'];
  assert.deepEqual(pick(computeStreak(days, '2027-01-02')), { current: 5, best: 5, status: 'continues' });
  const feb = ['2026-02-27', '2026-02-28', '2026-03-01'];
  assert.equal(computeStreak(feb, '2026-03-01').current, 3);
});

test('лучшая серия помнит прошлое', () => {
  const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-10-06', '2026-10-07'];
  assert.deepEqual(pick(computeStreak(days, '2026-10-07')), { current: 2, best: 4, status: 'continues' });
  assert.deepEqual(pick(computeStreak([], '2026-10-07')), { current: 0, best: 0, status: 'none' });
});

test('смена часового пояса: тот же момент даёт другой «сегодня», серия считается от него', () => {
  const days = ['2026-10-06', '2026-10-07'];
  const t = Date.UTC(2026, 9, 7, 20, 30);
  // В Алматы уже 8-е: сегодня ещё не закрыто, серия под угрозой
  assert.equal(computeStreak(days, dayKey(t, 'Asia/Almaty')).status, 'at-risk');
  // В UTC ещё 7-е: день закрыт
  assert.equal(computeStreak(days, dayKey(t, 'UTC')).status, 'continues');
});

test('будущие дни (после перевода часов назад) не считаются', () => {
  assert.equal(computeStreak(['2026-10-07', '2026-10-08'], '2026-10-07').current, 1);
});

// ---------- Для интерфейса ----------

test('мини-календарь недели', () => {
  const view = weekView(['2026-10-05', '2026-10-06'], '2026-10-08', ['2026-10-07']);
  assert.deepEqual(view.map((d) => d.state), ['done', 'done', 'rest', 'today', 'future', 'future', 'future']);
  assert.equal(view[0].day, '2026-10-05');
});

test('сетка месяца начинается с понедельника', () => {
  const october = monthGrid(2026, 10); // 1 октября 2026 — четверг
  assert.deepEqual(october[0].slice(0, 4), [null, null, null, '2026-10-01']);
  assert.equal(october.flat().filter(Boolean).length, 31);
  assert.ok(october.every((w) => w.length === 7));
  assert.equal(monthGrid(2026, 2).flat().filter(Boolean).length, 28);
});

test('график последних четырёх недель', () => {
  const days = ['2026-09-14', '2026-09-21', '2026-09-22', '2026-10-05', '2026-10-06', '2026-10-07'];
  assert.deepEqual(weeklyCounts(days, '2026-10-07'), [
    { start: '2026-09-14', count: 1 },
    { start: '2026-09-21', count: 2 },
    { start: '2026-09-28', count: 0 },
    { start: '2026-10-05', count: 3 },
  ]);
});

test('бейджи и склонение', () => {
  assert.deepEqual(badges(7).map((b) => b.earned), [true, true, false]);
  assert.deepEqual([1, 2, 5, 11, 21, 22].map(daysWord), ['день', 'дня', 'дней', 'дней', 'день', 'дня']);
});

function pick({ current, best, status }) {
  return { current, best, status };
}
