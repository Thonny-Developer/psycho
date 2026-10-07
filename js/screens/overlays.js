import { h, icon } from '../ui.js';
import { IC } from '../icons.js';
import { HELP } from '../content.js';

/** «Живая помощь»: телефоны Казахстана и простые слова, с которых можно начать разговор. */
export function createHelpDialog({ crisis, onClose, onBreathe }) {
  const close = h('button', { class: 'close-btn', type: 'button', onClick: onClose },
    icon(IC.close, 22), crisis ? 'Вернуться к разговору' : 'Вернуться');
  const { main, youth, emergency, college, trusted } = HELP;

  return h('div', { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'help-title', ref: (el) => { el.focusTarget = close; } },
    h('div', { class: 'dialog__top' }, close),
    h('div', { class: 'scroll' },
      h('div', { class: 'help-body' },
        crisis ? h('p', { class: 'help-crisis' }, 'Хорошо, что ты об этом говоришь. С таким важно не оставаться наедине.') : null,
        h('div', { class: 'stack', style: { gap: '10px', padding: '0 4px' } },
          h('h1', { id: 'help-title', class: 'h-title' }, 'Поговорить с живым человеком'),
          h('p', { class: 'muted', style: { fontSize: 'calc(17px * var(--fs))', lineHeight: '1.5' } },
            'Иногда нужен не план, а живой голос. Позвонить — нормально, даже если кажется, что «не настолько плохо».')),
        h('div', { class: 'card card--raised', style: { gap: '14px' } },
          h('span', { class: 'text-14 muted', style: { fontWeight: '600' } }, main.label),
          h('span', { class: 'help-number' }, main.number),
          h('span', { class: 'text-15 muted' }, main.note),
          h('span', { class: 'text-15 muted' }, main.starter),
          h('a', { class: 'btn', href: main.tel }, icon(IC.phone, 20, { strokeWidth: 1.9 }), 'Позвонить')),
        h('ul', { class: 'help-list' },
          h('li', {},
            h('span', { class: 'help-list__body' },
              h('strong', {}, emergency.label),
              h('span', { class: 'text-14 muted' }, emergency.note)),
            h('a', { class: 'call-chip', href: emergency.tel, 'aria-label': `Позвонить в экстренные службы, ${emergency.number}` }, emergency.number)),
          h('li', {},
            h('span', { class: 'help-list__body' },
              h('strong', {}, youth.label),
              h('span', { class: 'text-14 muted' }, youth.note),
              h('span', { class: 'help-list__links' },
                h('a', { href: youth.whatsapp, target: '_blank', rel: 'noopener noreferrer' }, youth.whatsappLabel),
                h('a', { href: youth.site, target: '_blank', rel: 'noopener noreferrer' }, youth.siteLabel))),
            h('a', { class: 'call-chip', href: youth.tel, 'aria-label': 'Позвонить на телефон доверия 150' }, '150')),
          h('li', {},
            h('span', { class: 'help-list__body' },
              h('strong', {}, college.label),
              h('span', { class: 'text-14 muted' }, college.note))),
          h('li', {},
            h('span', { class: 'help-list__body' },
              h('strong', {}, trusted.label),
              h('span', { class: 'text-14 muted' }, trusted.note)))),
        h('button', { class: 'btn btn--text btn--auto', type: 'button', onClick: onBreathe },
          icon(IC.wind, 20), 'Пока ждёшь — подышать со мной'))));
}

/** Шторка подтверждения «Удалить все данные?». По умолчанию фокус на безопасной кнопке. */
export function createConfirmSheet({ onCancel, onConfirm }) {
  const keep = h('button', { class: 'btn', type: 'button', onClick: onCancel }, 'Оставить');
  return h('div', {
    class: 'sheet-overlay',
    onClick: (e) => { if (e.target === e.currentTarget) onCancel(); },
    ref: (el) => { el.focusTarget = keep; },
  },
  h('div', { class: 'sheet', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'clear-title', 'aria-describedby': 'clear-text' },
    h('h2', { id: 'clear-title' }, 'Удалить все данные?'),
    h('p', { id: 'clear-text', class: 'text-16 muted' }, 'Сценарии, планы и настройки исчезнут с этого устройства. Вернуть их не получится.'),
    h('div', { class: 'sheet__actions' },
      keep,
      h('button', { class: 'btn btn--outline-warn', type: 'button', onClick: onConfirm }, 'Удалить всё'))));
}

export function createToast(toast, onAction) {
  return h('div', { class: 'toast', role: 'status' },
    icon(toast.icon ?? IC.info, 20, { strokeWidth: 2 }),
    h('span', { class: 'toast__text' }, toast.text),
    toast.actionLabel ? h('button', { class: 'toast__action', type: 'button', onClick: onAction }, toast.actionLabel) : null);
}
