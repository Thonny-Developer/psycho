import { h, icon, typingDots } from '../ui.js';
import { IC } from '../icons.js';
import { CHIPS, typeLabel } from '../content.js';
import { MESSAGE_MAX } from '../chat.js';

function messageNode(m, actions) {
  if (m.role === 'plan') {
    return h('div', { class: 'plan-card' },
      h('span', { class: 'plan-card__title' },
        h('span', { class: 'round-icon', 'aria-hidden': 'true' }, icon(IC.list, 18, { strokeWidth: 1.9 })),
        h('span', {}, h('span', { class: 'text-14 muted', style: { display: 'block', fontWeight: '400' } }, 'План готов'), m.text)),
      h('button', { class: 'btn btn--sm', type: 'button', onClick: () => actions.openChatPlan(m.planId) }, 'Открыть план'));
  }
  if (m.role === 'crisis') {
    return h('div', { class: 'crisis-card' },
      h('span', { class: 'crisis-card__title' },
        h('span', { class: 'round-icon', 'aria-hidden': 'true' }, icon(IC.heart, 18, { strokeWidth: 1.9 })),
        'С живым человеком бывает легче'),
      h('span', { class: 'text-15 muted' }, 'Позвонить прямо сейчас — нормально. Там выслушают.'),
      h('button', { class: 'btn btn--sm', type: 'button', onClick: () => actions.openHelp('crisis') }, 'Открыть живую помощь'));
  }
  return h('div', { class: `msg msg--${m.role}` },
    h('span', { class: 'visually-hidden' }, m.role === 'ai' ? 'Помощник: ' : 'Ты: '),
    m.text);
}

export function createChat({ state, actions }) {
  const list = h('div', { class: 'stack', style: { gap: '12px' }, role: 'log', 'aria-live': 'polite', 'aria-label': 'Разговор' });
  const status = h('div', { class: 'stack', style: { gap: '12px' } });
  const log = h('div', { class: 'chat-log' },
    h('div', { class: 'chat-intro' },
      h('span', { class: 'pill' }, typeLabel(state.type)),
      h('span', { class: 'chat-intro__note' }, 'Это не терапия. Я помогаю успокоиться и разобраться с задачами.')),
    list,
    status);

  const textarea = h('textarea', {
    id: 'chat-input',
    rows: 2,
    maxLength: MESSAGE_MAX,
    placeholder: 'Напиши, что происходит…',
    'aria-describedby': 'chat-hint',
  });
  const counter = h('span', { class: 'counter', 'aria-live': 'polite' }, `0 / ${MESSAGE_MAX}`);
  const sendBtn = h('button', { class: 'send-btn', type: 'button', 'aria-label': 'Отправить', disabled: true }, icon(IC.send, 22, { strokeWidth: 2 }));
  const chips = h('div', { class: 'chips' });
  const planBtn = h('button', { class: 'btn btn--md', type: 'button', onClick: actions.makePlan },
    icon(IC.list, 20, { strokeWidth: 1.9 }), 'Составить план');

  let busy = false;
  let rendered = [];

  function syncInput() {
    const length = textarea.value.length;
    // Счётчик озвучиваем только у самой границы, иначе он мешает печатать
    counter.textContent = `${length} / ${MESSAGE_MAX}`;
    counter.classList.toggle('is-limit', length > MESSAGE_MAX - 50);
    counter.setAttribute('aria-live', length > MESSAGE_MAX - 50 ? 'polite' : 'off');
    sendBtn.disabled = busy || !textarea.value.trim();
    // Поле растёт вместе с текстом до max-height из CSS
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }

  function send(text) {
    if (busy) return;
    if (actions.sendMessage(text ?? textarea.value)) {
      if (text == null) textarea.value = '';
      syncInput();
    }
  }

  textarea.addEventListener('input', syncInput);
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      send();
    }
  });
  sendBtn.addEventListener('click', () => {
    send();
    textarea.focus();
  });

  const el = h('section', { class: 'screen', 'aria-label': 'Разговор' },
    log,
    h('div', { class: 'composer' },
      chips,
      planBtn,
      h('div', { class: 'composer__box' },
        h('label', { class: 'visually-hidden', for: 'chat-input' }, 'Сообщение'),
        textarea,
        sendBtn),
      h('div', { class: 'composer__meta' },
        h('span', { id: 'chat-hint' }, 'Enter — отправить'),
        counter)));

  function scrollToEnd() {
    requestAnimationFrame(() => {
      log.scrollTop = log.scrollHeight;
    });
  }

  return {
    el,
    focusTarget: textarea,
    update(s) {
      busy = s.ai === 'typing';

      // Реплики только добавляем: перерисовка всего лога заставила бы скринридер читать его заново
      const ids = s.messages.map((m) => m.id);
      const sameStart = rendered.every((id, i) => ids[i] === id);
      if (!sameStart || ids.length < rendered.length) {
        list.replaceChildren();
        rendered = [];
      }
      for (const m of s.messages.slice(rendered.length)) {
        list.append(messageNode(m, actions));
        rendered.push(m.id);
      }

      status.replaceChildren();
      if (busy) {
        status.append(h('div', { class: 'msg msg--ai msg--typing', role: 'status' }, typingDots(), 'печатает…'));
      } else if (s.ai === 'error') {
        status.append(h('div', { class: 'warn-card', role: 'alert' },
          h('span', { class: 'text-16' }, s.aiErrorText),
          h('div', { class: 'btn-row' },
            h('button', { class: 'btn btn--soft', type: 'button', onClick: actions.retryReply },
              icon(IC.retry, 18, { strokeWidth: 1.9 }), 'Повторить'),
            h('button', { class: 'link link--under', type: 'button', onClick: actions.showOfflinePlan }, 'Показать офлайн-план'))));
      }

      const talked = s.messages.some((m) => m.role === 'user');
      chips.hidden = talked;
      chips.replaceChildren(...CHIPS.map((label) => h('button', { class: 'chip', type: 'button', disabled: busy, onClick: () => { send(label); textarea.focus(); } }, label)));
      planBtn.hidden = !talked;
      planBtn.disabled = busy;
      syncInput();
      scrollToEnd();
    },
  };
}
