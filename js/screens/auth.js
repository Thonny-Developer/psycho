import { h, icon } from '../ui.js';
import { IC } from '../icons.js';
import { PASSWORD_MIN } from '../account.js';

/** Логотип Google по их гайдлайнам: четыре цвета, без изменений */
function googleLogo() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  for (const [fill, d] of [
    ['#FFC107', 'M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z'],
    ['#FF3D00', 'M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z'],
    ['#4CAF50', 'M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z'],
    ['#1976D2', 'M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z'],
  ]) {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('fill', fill);
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

function field({ name, label, type = 'text', autocomplete, hint, optional = false, value = '' }) {
  const id = `auth-${name}`;
  const input = h('input', {
    id,
    name,
    type,
    class: 'input',
    autocomplete,
    value,
    spellcheck: type === 'email' ? 'false' : null,
    autocapitalize: type === 'text' ? 'sentences' : 'off',
    'aria-describedby': `${id}-hint ${id}-error`,
  });
  const error = h('span', { class: 'field__error', id: `${id}-error`, 'aria-live': 'polite' });
  // Как только человек начал исправлять поле, ошибка уходит
  input.addEventListener('input', () => {
    error.textContent = '';
    input.setAttribute('aria-invalid', 'false');
  });
  return {
    input,
    error,
    el: h('div', { class: 'field' },
      h('label', { class: 'field__label', for: id }, label, optional ? h('span', { class: 'field__optional' }, ' необязательно') : null),
      input,
      h('span', { class: 'field__hint', id: `${id}-hint` }, hint ?? ''),
      error),
  };
}

const COPY = {
  welcome: {
    title: 'Войди, чтобы начать',
    lead: 'В аккаунте хранятся планы, серия и прогресс — они не потеряются, даже если сменишь телефон. Это займёт минуту.',
  },
  login: { title: 'Вход', lead: 'Планы и серия подтянутся сами.' },
  signup: { title: 'Новый аккаунт', lead: 'Займёт минуту. Планы и серия будут храниться в аккаунте.' },
  forgot: { title: 'Восстановить пароль', lead: 'Пришлём ссылку, по которой можно задать новый пароль.' },
  reset: { title: 'Новый пароль', lead: 'Придумай пароль, которого нет на других сайтах.' },
  change: { title: 'Сменить пароль', lead: 'Новый пароль заменит старый на всех устройствах. Придумай такой, которого нет на других сайтах.' },
};

export function createAuth({ state, actions }) {
  const { mode, email = '', sentKind } = state.auth;
  const title = h('h1', { class: 'h-title', tabindex: '-1' });
  const formError = h('div', { class: 'warn-card text-15', role: 'alert', hidden: true });
  const fields = {};
  let submit = null;

  const always = h('p', { class: 'text-14 muted auth-note' },
    icon(IC.heart, 16, { strokeWidth: 1.9 }), 'Дыхание и «Живая помощь» работают и без входа.');
  const unavailable = state.account.enabled === false
    ? h('div', { class: 'warn-card text-15', role: 'status' },
      state.online ? 'Вход сейчас недоступен. Это не ты — попробуй чуть позже.' : 'Чтобы войти, нужен интернет. Пока можно просто подышать.')
    : null;

  function form(kind, children, submitLabel) {
    submit = h('button', { class: 'btn', type: 'submit' }, h('span', { class: 'btn__spinner', 'aria-hidden': 'true' }), h('span', {}, submitLabel));
    return h('form', {
      class: 'auth-form',
      novalidate: true,
      onSubmit: (e) => {
        e.preventDefault();
        const values = Object.fromEntries(Object.entries(fields).map(([k, f]) => [k, f.input.value]));
        actions.submitAuth(kind, values);
      },
    }, children, formError, submit);
  }

  const googleButton = (label) => h('button', { class: 'btn btn--soft btn--wide', type: 'button', onClick: actions.signInWithGoogle }, googleLogo(), label);
  const divider = () => h('div', { class: 'auth-divider', 'aria-hidden': 'true' }, h('span', {}, 'или'));
  const link = (label, onClick) => h('button', { class: 'link', type: 'button', onClick }, label);

  let body;
  if (mode === 'welcome') {
    title.textContent = COPY.welcome.title;
    body = [
      h('p', { class: 'lead' }, COPY.welcome.lead),
      unavailable,
      h('div', { class: 'stack', style: { gap: '8px' } },
        h('button', { class: 'btn', type: 'button', onClick: () => actions.setAuthMode('signup') }, 'Создать аккаунт'),
        h('button', { class: 'btn btn--soft btn--wide', type: 'button', onClick: () => actions.setAuthMode('login') }, 'Войти')),
      h('button', { class: 'panic-link', type: 'button', onClick: () => actions.startCalm(null) },
        icon(IC.wind, 20, { strokeWidth: 1.8 }), 'Мне плохо прямо сейчас — подышать без входа'),
      always,
    ];
  } else if (mode === 'sent') {
    const confirm = sentKind === 'confirm';
    title.textContent = confirm ? 'Проверь почту' : 'Письмо отправлено';
    body = [
      h('span', { class: 'check-circle', 'aria-hidden': 'true' }, icon(IC.check, 36)),
      h('p', { class: 'lead' }, confirm
        ? `Отправили письмо на ${email}. Открой его и нажми ссылку — после этого аккаунт заработает.`
        : `Если у ${email} есть аккаунт, ссылка придёт за пару минут.`),
      h('p', { class: 'text-15 muted' }, 'Письма нет? Загляни в «Спам» или «Промоакции».'),
      h('button', { class: 'btn', type: 'button', onClick: () => actions.setAuthMode('login') }, 'Ко входу'),
    ];
  } else {
    title.textContent = COPY[mode].title;
    const lead = h('p', { class: 'lead' }, COPY[mode].lead);

    if (mode === 'login') {
      fields.email = field({ name: 'email', label: 'Почта', type: 'email', autocomplete: 'email', value: email });
      fields.password = field({ name: 'password', label: 'Пароль', type: 'password', autocomplete: 'current-password' });
      body = [
        lead,
        form('login', [fields.email.el, fields.password.el], 'Войти'),
        h('div', { class: 'auth-links' }, link('Не помню пароль', () => actions.setAuthMode('forgot', fields.email.input.value))),
        divider(),
        googleButton('Войти через Google'),
        h('p', { class: 'auth-switch text-15' }, 'Нет аккаунта? ', link('Создать', () => actions.setAuthMode('signup', fields.email.input.value))),
        always,
      ];
    } else if (mode === 'signup') {
      fields.name = field({ name: 'name', label: 'Как к тебе обращаться', autocomplete: 'nickname', optional: true });
      fields.email = field({ name: 'email', label: 'Почта', type: 'email', autocomplete: 'email', value: email });
      fields.password = field({ name: 'password', label: 'Пароль', type: 'password', autocomplete: 'new-password', hint: `Минимум ${PASSWORD_MIN} символов` });
      body = [
        lead,
        form('signup', [fields.name.el, fields.email.el, fields.password.el], 'Создать аккаунт'),
        divider(),
        googleButton('Продолжить с Google'),
        h('p', { class: 'auth-switch text-15' }, 'Уже есть аккаунт? ', link('Войти', () => actions.setAuthMode('login', fields.email.input.value))),
        always,
      ];
    } else if (mode === 'forgot') {
      fields.email = field({ name: 'email', label: 'Почта', type: 'email', autocomplete: 'email', value: email });
      body = [
        lead,
        form('forgot', [fields.email.el], 'Отправить ссылку'),
        h('div', { class: 'auth-links' }, link('Пароль нашёлся? Ко входу', () => actions.setAuthMode('login', fields.email.input.value))),
      ];
    } else {
      fields.password = field({ name: 'password', label: 'Новый пароль', type: 'password', autocomplete: 'new-password', hint: `Минимум ${PASSWORD_MIN} символов` });
      body = [lead, form(mode === 'change' ? 'change' : 'reset', [fields.password.el], 'Сохранить пароль')];
    }
  }

  const el = h('section', { class: 'screen', 'aria-labelledby': 'auth-title' },
    h('div', { class: 'scroll' },
      h('div', { class: `auth-body${mode === 'sent' ? ' auth-body--center' : ''}` },
        Object.assign(title, { id: 'auth-title' }),
        body)));

  let lastErrors = null;

  return {
    el,
    focusTarget: title,
    update(s) {
      const { busy, errors = {} } = s.auth;
      if (submit) {
        submit.disabled = busy;
        submit.setAttribute('aria-busy', String(busy));
      }
      for (const [name, f] of Object.entries(fields)) {
        f.error.textContent = errors[name] ?? '';
        f.input.setAttribute('aria-invalid', String(Boolean(errors[name])));
        f.input.readOnly = busy;
      }
      formError.hidden = !errors.form;
      formError.textContent = errors.form ?? '';

      // После неудачной отправки фокус на первое поле с ошибкой
      if (errors !== lastErrors) {
        lastErrors = errors;
        const first = Object.entries(fields).find(([name]) => errors[name]);
        first?.[1].input.focus();
      }
    },
  };
}
