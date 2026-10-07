// Раздел «Отдых»: проверка данных видео, подборки, отметки самочувствия, перерыв.
// Чистые функции без DOM.

import { getProgress } from './plan.js';

export const MOODS = [
  { key: 'calm', label: 'Успокоиться' },
  { key: 'smile', label: 'Улыбнуться' },
  { key: 'switch', label: 'Переключиться' },
  { key: 'laugh', label: 'Посмеяться' },
];

/** Шкала самочувствия: 1 — тяжело, 2 — так себе, 3 — нормально */
export const FEELINGS = [
  { value: 1, label: 'Тяжело' },
  { value: 2, label: 'Так себе' },
  { value: 3, label: 'Нормально' },
];

export const BREAK_SECONDS = 5 * 60;
const MOOD_KEYS = new Set(MOODS.map((m) => m.key));
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Видео показывается, только если у него проверенный youtube_id и длительность. */
export function validateVideo(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!/^[a-z0-9-]{3,60}$/.test(raw.id ?? '')) return null;
  if (typeof raw.title !== 'string' || !raw.title.trim() || raw.title.length > 120) return null;
  if (!YOUTUBE_ID.test(raw.youtube_id ?? '')) return null;
  if (!Number.isInteger(raw.duration_sec) || raw.duration_sec < 10 || raw.duration_sec > 3600) return null;
  if (!MOOD_KEYS.has(raw.mood)) return null;
  return {
    id: raw.id,
    title: raw.title.trim(),
    youtubeId: raw.youtube_id,
    durationSec: raw.duration_sec,
    mood: raw.mood,
    channel: typeof raw.source_channel === 'string' ? raw.source_channel.trim().slice(0, 80) : null,
  };
}

export function parseVideos(data) {
  const list = Array.isArray(data?.videos) ? data.videos : [];
  const seen = new Set();
  return list.map(validateVideo).filter((v) => v && !seen.has(v.id) && seen.add(v.id));
}

/** Сколько записей ждут ручной проверки (youtube_id ещё не вставлен) */
export function pendingCount(data) {
  return (Array.isArray(data?.videos) ? data.videos : []).filter((v) => v && v.youtube_id == null).length;
}

export function byMood(videos, mood) {
  return mood ? videos.filter((v) => v.mood === mood) : videos;
}

/** Для перерыва — только ролики короче пяти минут */
export function breakVideos(videos) {
  return videos.filter((v) => v.durationSec <= BREAK_SECONDS);
}

/** Следующее видео той же подборки по кругу — только по нажатию, без автоплея */
export function nextVideo(videos, currentId) {
  if (!videos.length) return null;
  const i = videos.findIndex((v) => v.id === currentId);
  const next = videos[(i + 1) % videos.length];
  return next.id === currentId ? null : next;
}

export function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function embedUrl(youtubeId, origin) {
  const params = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1', enablejsapi: '1', origin });
  return `https://www.youtube-nocookie.com/embed/${youtubeId}?${params}`;
}

/**
 * Сообщения встроенного плеера (postMessage с enablejsapi=1) → ready | error | ended | null.
 * Скрипт YouTube не подключаем: CSP разрешает только свои скрипты.
 */
export function parsePlayerMessage(data) {
  let msg = data;
  if (typeof msg === 'string') {
    try {
      msg = JSON.parse(msg);
    } catch {
      return null;
    }
  }
  if (!msg || typeof msg !== 'object') return null;
  if (msg.event === 'onReady' || msg.event === 'initialDelivery') return 'ready';
  if (msg.event === 'onError') return 'error';
  if (msg.event === 'onStateChange' && msg.info === 0) return 'ended';
  if (msg.event === 'infoDelivery' && msg.info?.playerState === 0) return 'ended';
  return null;
}

export function isFeeling(value) {
  return value === 1 || value === 2 || value === 3;
}

/** «Стало легче в X из Y случаев»: считаются только полные отметки до и после */
export function moodStats(checks) {
  const full = checks.filter((c) => isFeeling(c.before) && isFeeling(c.after));
  return { better: full.filter((c) => c.after > c.before).length, total: full.length };
}

/** Остаток перерыва по времени окончания — таймер не сбивается, если вкладка спала */
export function breakLeft(endsAt, now = Date.now()) {
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  return { left, done: left === 0 };
}

/** Номер первого незакрытого шага плана для мягкого возвращения: «Вернёмся к шагу 3?» */
export function firstOpenStep(plan) {
  if (!plan || getProgress(plan).complete) return null;
  const i = plan.steps.findIndex((s) => !s.done);
  return i === -1 ? null : i + 1;
}
