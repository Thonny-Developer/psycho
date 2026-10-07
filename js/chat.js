// Логика чата без DOM: кризисные фразы, история для API, проверка ответа модели.

import { makeId } from './plan.js';

export const MESSAGE_MAX = 500;
export const REPLY_MAX = 600;
export const HISTORY_LIMIT = 20;
export const HISTORY_CHARS_MAX = 8000;

const CRISIS = /(не\s*хочу\s*(больше\s*)?жить|покончить\s*с\s*собой|суицид|убить\s*себя|убью\s*себя|навредить\s*себе|причинить\s*себе|порезать\s*себя|режу\s*себя|самоповрежд|нет\s*смысла\s*жить|незачем\s*жить|лучше\s*бы\s*меня\s*не\s*было|исчезнуть\s*навсегда|безнадежн|нет\s*выхода|выхода\s*нет|не\s*хочу\s*просыпаться)/i;

export const CRISIS_REPLY =
  'Спасибо, что делишься этим. То, что ты описываешь, — очень тяжело, и с таким важно не оставаться наедине. Я рядом, но я не человек. Пожалуйста, поговори с тем, кто может помочь по-настоящему.';

/** Признаки того, что человеку нужна живая помощь, а не план. */
export function isCrisis(text) {
  return CRISIS.test(String(text).toLowerCase().replace(/ё/g, 'е'));
}

/**
 * role: ai | user | crisis (карточка «С живым человеком бывает легче») | plan (карточка готового плана, text — id плана).
 * private: сообщение не уходит в AI — кризисные реплики остаются только на устройстве.
 */
export function makeMessage(role, text = '', { private: isPrivate = false, planId = null } = {}) {
  const message = { id: makeId(), role, text };
  if (isPrivate) message.private = true;
  if (planId) message.planId = planId;
  return message;
}

/** Последние реплики разговора в формате API, без кризисных и служебных. */
export function toApiMessages(messages) {
  return messages
    .filter((m) => (m.role === 'ai' || m.role === 'user') && !m.private && m.text)
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role, text: m.text.slice(0, MESSAGE_MAX) }));
}

/** Сервер: проверка истории из запроса. Возвращает массив или null. */
export function validateMessages(value, { min = 0 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > HISTORY_LIMIT + 10) return null;
  let total = 0;
  const messages = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    if (raw.role !== 'user' && raw.role !== 'ai') return null;
    if (typeof raw.text !== 'string') return null;
    const text = raw.text.trim();
    if (!text || text.length > MESSAGE_MAX) return null;
    total += text.length;
    messages.push({ role: raw.role, text });
  }
  if (total > HISTORY_CHARS_MAX) return null;
  return messages;
}

/**
 * Модель иногда заворачивает реплику в JSON или в блок кода: {"reply":"..."}.
 * Снимаем такие обёртки, чтобы в чате был только текст.
 */
function unwrapReply(text) {
  let result = text.trim();
  for (let i = 0; i < 3; i++) {
    const fenced = result.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) result = fenced[1].trim();
    if (!result.startsWith('{')) break;
    try {
      const parsed = JSON.parse(result);
      const inner = parsed?.reply ?? parsed?.text ?? parsed?.message;
      if (typeof inner !== 'string') break;
      result = inner.trim();
    } catch {
      break;
    }
  }
  return result;
}

/**
 * Модель любит задавать по два-три вопроса за раз, и это похоже на допрос.
 * Если вопросов больше одного, оставляем текст до первого вопроса включительно.
 */
export function keepOneQuestion(text) {
  if ((text.match(/\?/g) || []).length < 2) return text;
  return text.slice(0, text.indexOf('?') + 1).trim();
}

/** Ответ модели в чате: { reply: '...' }. */
export function validateReply(data) {
  if (!data || typeof data !== 'object' || typeof data.reply !== 'string') return null;
  const reply = unwrapReply(data.reply)
    .replace(/^\s*(Помощник|Ассистент)\s*:\s*/i, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!reply || reply.length > REPLY_MAX) return null;
  return reply;
}
