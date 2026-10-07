import { h, replaceKeepFocus } from '../ui.js';
import { AVATARS, avatar } from '../avatars.js';
import { NAME_MAX } from '../account.js';

/** Имя и аватар. Одно главное действие — «Сохранить». */
export function createProfileEdit({ state, actions }) {
  const profile = state.account.profile ?? {};
  let chosen = profile.avatar ?? 'sprout';

  const title = h('h1', { id: 'edit-title', class: 'h-title', tabindex: '-1' }, 'Изменить профиль');
  const name = h('input', {
    id: 'edit-name',
    class: 'input',
    type: 'text',
    autocomplete: 'nickname',
    maxLength: NAME_MAX,
    value: profile.display_name ?? '',
    'aria-describedby': 'edit-name-error',
  });
  const nameError = h('span', { class: 'field__error', id: 'edit-name-error', 'aria-live': 'polite' });
  const grid = h('div', { class: 'avatar-grid', role: 'radiogroup', 'aria-labelledby': 'edit-avatar-label' });
  const formError = h('div', { class: 'warn-card text-15', role: 'alert', hidden: true });
  const save = h('button', { class: 'btn', type: 'submit' }, h('span', { class: 'btn__spinner', 'aria-hidden': 'true' }), h('span', {}, 'Сохранить'));

  function renderGrid(focusKey) {
    replaceKeepFocus(grid, AVATARS.map(({ key, label }) => h('button', {
      type: 'button',
      class: 'avatar-option',
      role: 'radio',
      'aria-checked': String(chosen === key),
      'aria-label': label,
      tabindex: chosen === key ? '0' : '-1',
      dataset: { focus: `av-${key}` },
      onClick: () => {
        chosen = key;
        renderGrid(`av-${key}`);
      },
    }, avatar(key, 56))), focusKey);
  }

  grid.addEventListener('keydown', (e) => {
    const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    const i = AVATARS.findIndex((a) => a.key === chosen);
    chosen = AVATARS[(i + dir + AVATARS.length) % AVATARS.length].key;
    renderGrid(`av-${chosen}`);
  });
  name.addEventListener('input', () => {
    nameError.textContent = '';
    name.setAttribute('aria-invalid', 'false');
  });
  renderGrid();

  const el = h('section', { class: 'screen', 'aria-labelledby': 'edit-title' },
    h('div', { class: 'scroll' },
      h('form', {
        class: 'auth-body',
        novalidate: true,
        onSubmit: (e) => {
          e.preventDefault();
          actions.saveProfile({ display_name: name.value, avatar: chosen });
        },
      },
      title,
      h('div', { class: 'field' },
        h('label', { class: 'field__label', for: 'edit-name' }, 'Как к тебе обращаться'),
        name,
        nameError),
      h('div', { class: 'field' },
        h('span', { class: 'field__label', id: 'edit-avatar-label' }, 'Аватар'),
        grid),
      formError,
      save)));

  return {
    el,
    focusTarget: title,
    update(s) {
      const { busy, errors = {} } = s.profileEdit;
      save.disabled = busy;
      save.setAttribute('aria-busy', String(busy));
      nameError.textContent = errors.name ?? '';
      name.setAttribute('aria-invalid', String(Boolean(errors.name)));
      formError.hidden = !errors.form;
      formError.textContent = errors.form ?? '';
    },
  };
}
