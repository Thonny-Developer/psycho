import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isCrisis, makeMessage, toApiMessages, validateMessages, validateReply, HISTORY_LIMIT } from '../js/chat.js';

test('isCrisis узнаёт тревожные фразы', () => {
  for (const text of [
    'Я не хочу больше жить',
    'всё бессмысленно, выхода нет',
    'думаю навредить себе',
    'Лучше бы меня не было',
    'не хочу просыпаться завтра',
    'Безнадёжно всё',
    'СУИЦИД',
  ]) {
    assert.equal(isCrisis(text), true, text);
  }
});

test('isCrisis не срабатывает на обычный стресс', () => {
  for (const text of [
    'Я не успеваю курсовую',
    'хочу просто выспаться',
    'нет сил разбираться в этом коде',
    'выход из цикла не работает',
    'Боюсь не успеть к пятнице',
  ]) {
    assert.equal(isCrisis(text), false, text);
  }
});

test('toApiMessages убирает кризисные и служебные реплики и режет историю', () => {
  const messages = [
    makeMessage('ai', 'Привет'),
    makeMessage('user', 'выхода нет', { private: true }),
    makeMessage('ai', 'Поговори с живым человеком', { private: true }),
    makeMessage('crisis', '', { private: true }),
    makeMessage('user', 'Курсовая к пятнице'),
  ];
  assert.deepEqual(toApiMessages(messages), [
    { role: 'ai', text: 'Привет' },
    { role: 'user', text: 'Курсовая к пятнице' },
  ]);

  const long = Array.from({ length: 40 }, (_, i) => makeMessage(i % 2 ? 'ai' : 'user', `реплика ${i}`));
  const trimmed = toApiMessages(long);
  assert.equal(trimmed.length, HISTORY_LIMIT);
  assert.equal(trimmed.at(-1).text, 'реплика 39');
});

test('validateMessages проверяет историю на сервере', () => {
  assert.deepEqual(validateMessages([{ role: 'user', text: '  привет ' }]), [{ role: 'user', text: 'привет' }]);
  assert.equal(validateMessages('нет'), null);
  assert.equal(validateMessages([{ role: 'crisis', text: 'x' }]), null);
  assert.equal(validateMessages([{ role: 'user', text: '   ' }]), null);
  assert.equal(validateMessages([], { min: 1 }), null);
  assert.equal(validateMessages(Array(25).fill({ role: 'user', text: 'а'.repeat(400) })), null, 'общий лимит символов');
});

test('validateReply снимает JSON-обёртку и блок кода', () => {
  assert.equal(validateReply({ reply: '{"reply":"Кажется, просто тяжело."}' }), 'Кажется, просто тяжело.');
  assert.equal(validateReply({ reply: '```json\n{"reply": "Привет"}\n```' }), 'Привет');
  assert.equal(validateReply({ reply: '{"reply":"{\\"reply\\":\\"двойная\\"}"}' }), 'двойная');
  assert.equal(validateReply({ reply: '{не json' }), '{не json');
});

test('validateReply чистит ответ модели', () => {
  assert.equal(validateReply({ reply: 'Помощник: Слышу тебя.  Что горит?' }), 'Слышу тебя. Что горит?');
  assert.equal(validateReply({ reply: '' }), null);
  assert.equal(validateReply({ reply: 42 }), null);
  assert.equal(validateReply({ text: 'x' }), null);
  assert.equal(validateReply({ reply: 'а'.repeat(601) }), null);
});
