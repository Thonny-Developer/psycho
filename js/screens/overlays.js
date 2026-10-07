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

/** Перенос планов гостя в аккаунт: спрашиваем один раз. */
export function createImportSheet({ count, busy, onImport, onSkip }) {
  const move = h('button', { class: 'btn', type: 'button', disabled: busy, 'aria-busy': String(busy), onClick: onImport },
    h('span', { class: 'btn__spinner', 'aria-hidden': 'true' }), busy ? 'Переношу…' : 'Перенести');
  return h('div', { class: 'sheet-overlay', ref: (el) => { el.focusTarget = move; } },
    h('div', { class: 'sheet', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'import-title', 'aria-describedby': 'import-text' },
      h('h2', { id: 'import-title' }, 'Перенести планы в аккаунт?'),
      h('p', { id: 'import-text', class: 'text-16 muted' },
        `На этом устройстве есть планы без аккаунта: ${count}. Если перенести, они будут доступны везде, где ты войдёшь. Дубли не появятся.`),
      h('div', { class: 'sheet__actions' },
        move,
        h('button', { class: 'btn btn--text', type: 'button', disabled: busy, onClick: onSkip }, 'Не переносить'))));
}

/** Удаление аккаунта: нужно написать «удалить», чтобы случайно не нажать. */
export function createDeleteAccountSheet({ busy, error, onCancel, onConfirm }) {
  const WORD = 'удалить';
  const keep = h('button', { class: 'btn', type: 'button', disabled: busy, onClick: onCancel }, 'Оставить аккаунт');
  const input = h('input', {
    id: 'delete-confirm',
    class: 'input',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    readOnly: busy,
    'aria-describedby': 'delete-text',
  });
  const remove = h('button', {
    class: 'btn btn--outline-warn',
    type: 'button',
    disabled: true,
    'aria-busy': String(busy),
    onClick: () => onConfirm(),
  }, h('span', { class: 'btn__spinner', 'aria-hidden': 'true' }), busy ? 'Удаляю…' : 'Удалить навсегда');
  input.addEventListener('input', () => {
    remove.disabled = busy || input.value.trim().toLowerCase() !== WORD;
  });

  return h('div', { class: 'sheet-overlay', onClick: (e) => { if (e.target === e.currentTarget && !busy) onCancel(); }, ref: (el) => { el.focusTarget = keep; } },
    h('div', { class: 'sheet', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'delete-title', 'aria-describedby': 'delete-text' },
      h('h2', { id: 'delete-title' }, 'Удалить аккаунт?'),
      h('p', { id: 'delete-text', class: 'text-16 muted' },
        'Удалятся профиль, все планы и серия — с сервера и с этого устройства. Вернуть их не получится. Если хочешь сохранить копию, сначала скачай данные.'),
      h('label', { class: 'field' },
        h('span', { class: 'field__label' }, `Чтобы подтвердить, напиши «${WORD}»`),
        input),
      error ? h('div', { class: 'warn-card text-15', role: 'alert' }, error) : null,
      h('div', { class: 'sheet__actions' }, keep, remove)));
}

export function createToast(toast, onAction) {
  return h('div', { class: 'toast', role: 'status' },
    icon(toast.icon ?? IC.info, 20, { strokeWidth: 2 }),
    h('span', { class: 'toast__text' }, toast.text),
    toast.actionLabel ? h('button', { class: 'toast__action', type: 'button', onClick: onAction }, toast.actionLabel) : null);
}
