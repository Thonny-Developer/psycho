import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseVideos,
  validateVideo,
  pendingCount,
  byMood,
  breakVideos,
  nextVideo,
  formatDuration,
  embedUrl,
  parsePlayerMessage,
  moodStats,
  breakLeft,
  firstOpenStep,
} from '../js/rest.js';
import { createPlan, setStepDone } from '../js/plan.js';

const data = JSON.parse(await readFile(new URL('../data/videos.json', import.meta.url), 'utf8'));

test('в data/videos.json нет выдуманных youtube_id: все ждут ручной проверки', () => {
  assert.ok(data.videos.length >= 3 && data.videos.length <= 5);
  for (const v of data.videos) {
    assert.equal(v.youtube_id, null, v.id);
    assert.ok(v.todo, `${v.id}: есть пометка TODO`);
  }
  assert.deepEqual(parseVideos(data), [], 'непроверенные записи не показываются');
  assert.equal(pendingCount(data), data.videos.length);
});

const sample = (over = {}) => ({ id: 'calm-one', title: 'Лес', youtube_id: 'abcDEF12345', duration_sec: 200, mood: 'calm', source_channel: 'Канал', ...over });

test('проверка записи видео', () => {
  assert.equal(validateVideo(sample()).youtubeId, 'abcDEF12345');
  assert.equal(validateVideo(sample({ youtube_id: 'short' })), null);
  assert.equal(validateVideo(sample({ youtube_id: 'abc"><script' })), null);
  assert.equal(validateVideo(sample({ mood: 'scary' })), null);
  assert.equal(validateVideo(sample({ duration_sec: null })), null);
  assert.equal(parseVideos({ videos: [sample(), sample()] }).length, 1, 'без дублей');
});

const videos = parseVideos({ videos: [
  sample({ id: 'calm-a', duration_sec: 120 }),
  sample({ id: 'laugh-b', mood: 'laugh', duration_sec: 420, youtube_id: 'zzzzzzzzzz1' }),
  sample({ id: 'calm-c', duration_sec: 300, youtube_id: 'yyyyyyyyyy2' }),
] });

test('подборки по настроению и для перерыва', () => {
  assert.deepEqual(byMood(videos, 'calm').map((v) => v.id), ['calm-a', 'calm-c']);
  assert.equal(byMood(videos, null).length, 3);
  assert.deepEqual(breakVideos(videos).map((v) => v.id), ['calm-a', 'calm-c'], 'только до 5 минут включительно');
});

test('следующее видео — по кругу и только вручную', () => {
  assert.equal(nextVideo(videos, 'calm-a').id, 'laugh-b');
  assert.equal(nextVideo(videos, 'calm-c').id, 'calm-a');
  assert.equal(nextVideo([videos[0]], 'calm-a'), null, 'одно видео — следующего нет');
  assert.equal(nextVideo([], 'x'), null);
});

test('длительность и адрес плеера без cookies', () => {
  assert.equal(formatDuration(125), '2:05');
  const url = embedUrl('abcDEF12345', 'https://app.example');
  assert.ok(url.startsWith('https://www.youtube-nocookie.com/embed/abcDEF12345?'));
  assert.ok(url.includes('rel=0') && !url.includes('autoplay=1'));
});

test('сообщения плеера', () => {
  assert.equal(parsePlayerMessage('{"event":"onReady"}'), 'ready');
  assert.equal(parsePlayerMessage({ event: 'onError', info: 150 }), 'error');
  assert.equal(parsePlayerMessage({ event: 'onStateChange', info: 0 }), 'ended');
  assert.equal(parsePlayerMessage({ event: 'infoDelivery', info: { playerState: 0 } }), 'ended');
  assert.equal(parsePlayerMessage('мусор'), null);
  assert.equal(parsePlayerMessage({ event: 'onStateChange', info: 1 }), null);
});

test('«стало легче в X из Y случаев»', () => {
  assert.deepEqual(moodStats([
    { before: 1, after: 3 },
    { before: 2, after: 2 },
    { before: 3, after: 2 },
    { before: 1, after: null },
  ]), { better: 1, total: 3 });
  assert.deepEqual(moodStats([]), { better: 0, total: 0 });
});

test('таймер перерыва считает от времени окончания', () => {
  const ends = 1_000_000 + 300_000;
  assert.deepEqual(breakLeft(ends, 1_000_000), { left: 300, done: false });
  assert.deepEqual(breakLeft(ends, ends - 400), { left: 1, done: false });
  assert.deepEqual(breakLeft(ends, ends + 60_000), { left: 0, done: true }, 'вкладка спала — перерыв просто закончен');
});

test('мягкое возвращение к первому незакрытому шагу', () => {
  let plan = createPlan({ type: 'all', title: 'П', steps: [{ title: 'Один', minutes: 5 }, { title: 'Два', minutes: 5 }, { title: 'Три', minutes: 5 }] });
  plan = setStepDone(plan, plan.steps[0].id, true);
  plan = setStepDone(plan, plan.steps[1].id, true);
  assert.equal(firstOpenStep(plan), 3);
  assert.equal(firstOpenStep(setStepDone(plan, plan.steps[2].id, true)), null);
  assert.equal(firstOpenStep(null), null);
});
