import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLibrary, validateBook, searchBooks, recommend, readingLabel, isStatus } from '../js/library.js';

const data = JSON.parse(await readFile(new URL('../data/books.json', import.meta.url), 'utf8'));
const books = parseLibrary(data);

test('data/books.json целиком проходит проверку', () => {
  assert.equal(books.length, data.books.length);
  assert.ok(books.length >= 8 && books.length <= 12);
  for (const b of data.books) {
    assert.equal(b.source_url, null, `${b.id}: ссылка не выдумана`);
    assert.ok(b.key_ideas.length >= 3 && b.key_ideas.length <= 5, `${b.id}: 3–5 идей`);
    assert.ok(!/[«"]{2}/.test(b.pitch), `${b.id}`);
  }
});

test('битые записи отсеиваются, дубли тоже', () => {
  const good = data.books[0];
  assert.equal(validateBook({ ...good, id: 'Bad Id' }), null);
  assert.equal(validateBook({ ...good, topics: ['astrology'] }), null);
  assert.equal(validateBook({ ...good, key_ideas: ['одна', 'две'] }), null);
  assert.equal(validateBook({ ...good, source_url: 'javascript:alert(1)' }).sourceUrl, null);
  assert.equal(parseLibrary({ books: [good, good, null, 5] }).length, 1);
  assert.deepEqual(parseLibrary(null), []);
});

test('поиск без учёта регистра и буквы ё, по нескольким словам', () => {
  assert.deepEqual(searchBooks(books, { query: 'КАРНЕГИ' }).map((b) => b.id), ['carnegie-worry']);
  assert.ok(searchBooks(books, { query: 'привычки' }).some((b) => b.id === 'clear-atomic-habits'));
  assert.deepEqual(searchBooks(books, { query: 'лёгкий способ' }).map((b) => b.id), ['fiore-now-habit']);
  assert.deepEqual(searchBooks(books, { query: 'несуществующее слово' }), []);
});

test('фильтр по теме и вместе с поиском', () => {
  const study = searchBooks(books, { topic: 'study' });
  assert.ok(study.length >= 2 && study.every((b) => b.topics.includes('study')));
  assert.deepEqual(searchBooks(books, { topic: 'study', query: 'математик' }).map((b) => b.id), ['oakley-mind-numbers']);
});

test('подборка под ситуацию: по теме плана, прочитанное в конце', () => {
  const exam = recommend(books, 'exam');
  assert.equal(exam.length, 3);
  assert.ok(exam[0].topics.includes('study'));
  const first = exam[0].id;
  assert.notEqual(recommend(books, 'exam', { [first]: 'done' })[0].id, first);
  assert.deepEqual(recommend(books, 'unknown'), []);
});

test('подписи и статусы', () => {
  assert.equal(readingLabel(540), '≈ 9 ч чтения');
  assert.equal(readingLabel(45), '≈ 45 мин чтения');
  assert.equal(readingLabel(null), '');
  assert.ok(isStatus('reading'));
  assert.ok(!isStatus('burned'));
});
