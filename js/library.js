// Библиотека: проверка данных книг, поиск, фильтр по темам, подбор под ситуацию.
// Чистые функции без DOM.

export const TOPICS = [
  { key: 'stress', label: 'Тревога и стресс' },
  { key: 'procrastination', label: 'Прокрастинация' },
  { key: 'study', label: 'Учёба и экзамены' },
  { key: 'self', label: 'Самооценка' },
  { key: 'energy', label: 'Без выгорания' },
];

export const STATUSES = [
  { key: 'want', label: 'Хочу прочитать' },
  { key: 'reading', label: 'Читаю' },
  { key: 'done', label: 'Прочитано' },
];

const TOPIC_KEYS = new Set(TOPICS.map((t) => t.key));
const STATUS_KEYS = new Set(STATUSES.map((s) => s.key));

export function isStatus(value) {
  return STATUS_KEYS.has(value);
}

/** Что подобрать под тип проблемы недавнего плана */
const TOPICS_FOR_TYPE = {
  deadline: ['procrastination', 'energy'],
  exam: ['study', 'stress'],
  debt: ['procrastination', 'study'],
  topic: ['study', 'self'],
  bug: ['energy', 'stress'],
  all: ['stress', 'energy'],
  other: ['stress', 'self'],
};

const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

/** Книга из data/books.json → нормальный объект или null. Битая запись не должна ломать раздел. */
export function validateBook(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!/^[a-z0-9-]{3,60}$/.test(raw.id ?? '')) return null;
  if (!str(raw.title, 120) || !str(raw.author, 120) || !str(raw.pitch, 400) || !str(raw.try_today, 300)) return null;
  const topics = Array.isArray(raw.topics) ? raw.topics.filter((t) => TOPIC_KEYS.has(t)) : [];
  const ideas = Array.isArray(raw.key_ideas) ? raw.key_ideas.filter((i) => str(i, 300)) : [];
  if (!topics.length || ideas.length < 3 || ideas.length > 5) return null;
  const url = typeof raw.source_url === 'string' && /^https:\/\//.test(raw.source_url) ? raw.source_url : null;
  return {
    id: raw.id,
    title: raw.title.trim(),
    author: raw.author.trim(),
    topics,
    pitch: raw.pitch.trim(),
    keyIdeas: ideas,
    tryToday: raw.try_today.trim(),
    readingTime: Number.isFinite(raw.reading_time) && raw.reading_time > 0 ? Math.round(raw.reading_time) : null,
    sourceUrl: url,
    needsReview: raw.needs_review === true,
  };
}

export function parseLibrary(data) {
  const list = Array.isArray(data?.books) ? data.books : [];
  const seen = new Set();
  return list.map(validateBook).filter((b) => b && !seen.has(b.id) && seen.add(b.id));
}

const normalize = (s) => s.toLowerCase().replace(/ё/g, 'е');

/** Поиск по названию, автору, описанию и идеям + фильтр по теме */
export function searchBooks(books, { query = '', topic = null } = {}) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  return books.filter((b) => {
    if (topic && !b.topics.includes(topic)) return false;
    if (!words.length) return true;
    const text = normalize([b.title, b.author, b.pitch, ...b.keyIdeas].join(' '));
    return words.every((w) => text.includes(w));
  });
}

/** Подборка под тип проблемы: сначала книги по первой теме, уже прочитанные — в конец */
export function recommend(books, planType, statuses = {}, limit = 3) {
  const topics = TOPICS_FOR_TYPE[planType];
  if (!topics) return [];
  const score = (b) => {
    const rank = topics.findIndex((t) => b.topics.includes(t));
    return rank === -1 ? null : rank + (statuses[b.id] === 'done' ? 10 : 0);
  };
  return books
    .map((b) => ({ b, s: score(b) }))
    .filter((x) => x.s !== null)
    .sort((x, y) => x.s - y.s)
    .slice(0, limit)
    .map((x) => x.b);
}

export function topicLabel(key) {
  return TOPICS.find((t) => t.key === key)?.label ?? '';
}

/** 540 → «≈ 9 ч чтения», 45 → «≈ 45 мин чтения» */
export function readingLabel(minutes) {
  if (!minutes) return '';
  if (minutes < 60) return `≈ ${minutes} мин чтения`;
  return `≈ ${Math.round(minutes / 60)} ч чтения`;
}
