import { h, icon, replaceKeepFocus } from '../ui.js';
import { IC } from '../icons.js';

const THEMES = [['light', 'Светлая'], ['dark', 'Тёмная'], ['system', 'Как в системе']];
const SIZES = [['m', 'Обычный', '16px'], ['l', 'Крупный', '19px'], ['xl', 'Самый крупный', '22px']];

/** Группа радиокнопок: стрелки двигают выбор, Tab попадает только на выбранную */
function radioGroup({ id, options, value, onPick, aa = false }) {
  const pick = (key, focus) => {
    onPick(key);
    if (focus) requestAnimationFrame(() => document.querySelector(`[data-focus="${id}-${key}"]`)?.focus());
  };
  return h('div', {
    class: `radio-seg${aa ? ' radio-seg--aa' : ''}`,
    role: 'radiogroup',
    'aria-labelledby': id,
    onKeydown: (e) => {
      const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!dir) return;
      e.preventDefault();
      const i = options.findIndex(([k]) => k === value);
      pick(options[(i + dir + options.length) % options.length][0], true);
    },
  }, options.map(([key, label, size]) => h('button', {
    type: 'button',
    role: 'radio',
    'aria-checked': String(value === key),
    'aria-label': aa ? label : null,
    tabindex: value === key ? '0' : '-1',
    dataset: { focus: `${id}-${key}` },
    style: aa ? { fontSize: size } : null,
    onClick: () => pick(key, false),
  }, aa ? 'Аа' : label)));
}

function accountCard(state, actions) {
  const { account } = state;
  if (account.enabled !== true && !account.user) return null;

  if (!account.user) {
    return h('div', { class: 'account-card' },
      h('div', { class: 'account-card__head' },
        h('span', { class: 'round-icon', 'aria-hidden': 'true' }, icon(IC.user, 20)),
        h('span', { class: 'account-card__name' }, 'Сейчас без аккаунта')),
      h('p', { class: 'text-15 muted' }, 'Планы хранятся только на этом устройстве. С аккаунтом они не потеряются, даже если сменишь телефон.'),
      h('button', { class: 'btn btn--md', type: 'button', dataset: { focus: 'acc-signup' }, onClick: () => actions.openAuth('signup') }, 'Создать аккаунт'),
      h('button', { class: 'link', type: 'button', style: { alignSelf: 'center' }, dataset: { focus: 'acc-login' }, onClick: () => actions.openAuth('login') }, 'Уже есть аккаунт? Войти'));
  }

  const name = account.profile?.display_name || account.user.email;
  let syncText;
  let syncIcon = IC.cloud;
  if (account.expired) {
    syncText = 'Сессия закончилась. Войди снова, чтобы изменения сохранились в аккаунте.';
  } else if (account.pending && !state.online) {
    syncText = 'Изменения сохранятся в аккаунте, когда появится интернет.';
    syncIcon = IC.wifiOff;
  } else if (account.pending) {
    syncText = 'Сохраняю изменения в аккаунте…';
  } else {
    syncText = 'Всё сохранено в аккаунте';
    syncIcon = IC.check;
  }

  return h('div', { class: 'account-card' },
    h('div', { class: 'account-card__head' },
      h('span', { class: 'round-icon', 'aria-hidden': 'true' }, icon(IC.user, 20)),
      h('span', { class: 'stack', style: { minWidth: '0' } },
        h('span', { class: 'account-card__name' }, name),
        name !== account.user.email ? h('span', { class: 'text-14 muted', style: { overflowWrap: 'anywhere' } }, account.user.email) : null)),
    h('p', { class: 'sync-note text-14 muted', role: 'status' }, icon(syncIcon, 16, { strokeWidth: 1.9 }), syncText),
    account.expired
      ? h('button', { class: 'btn btn--md', type: 'button', dataset: { focus: 'acc-login' }, onClick: () => actions.openAuth('login') }, 'Войти снова')
      : h('button', {
        class: 'btn btn--soft btn--wide',
        type: 'button',
        disabled: account.signingOut,
        'aria-busy': String(account.signingOut),
        dataset: { focus: 'acc-logout' },
        onClick: actions.signOut,
      }, h('span', { class: 'btn__spinner', 'aria-hidden': 'true' }), icon(IC.logout, 18), account.signingOut ? 'Выхожу…' : 'Выйти'));
}

export function createSettings({ actions }) {
  const title = h('h1', { class: 'h-title', style: { padding: '0 4px' }, tabindex: '-1' }, 'Профиль');
  const body = h('div', { class: 'stack', style: { gap: '22px' } });

  const el = h('section', { class: 'screen', 'aria-labelledby': 'settings-title' },
    h('div', { class: 'scroll' },
      h('div', { class: 'settings-body' }, Object.assign(title, { id: 'settings-title' }), body)));

  return {
    el,
    focusTarget: title,
    update(state) {
      const { settings } = state;
      const size = SIZES.find(([k]) => k === settings.fs) ?? SIZES[0];

      replaceKeepFocus(body, [
        accountCard(state, actions),
        h('div', { class: 'card', style: { gap: '20px', padding: '20px' } },
          h('div', { class: 'setting' },
            h('span', { class: 'setting__label', id: 'set-theme' }, 'Тема'),
            radioGroup({ id: 'set-theme', options: THEMES, value: settings.theme, onPick: (v) => actions.setSetting('theme', v) })),
          h('div', { class: 'setting' },
            h('span', { class: 'setting__label', id: 'set-fs' }, 'Размер текста'),
            radioGroup({ id: 'set-fs', options: SIZES, value: settings.fs, aa: true, onPick: (v) => actions.setSetting('fs', v) }),
            h('span', { class: 'text-14 muted' }, size[1])),
          h('div', { class: 'switch-row' },
            h('span', { class: 'stack', style: { flex: '1', gap: '4px' } },
              h('span', { class: 'setting__label', id: 'set-motion' }, 'Уменьшить анимации'),
              h('span', { class: 'text-14 muted' }, 'Круг дыхания замрёт, переходы станут мгновенными. По умолчанию — как в системе.')),
            h('button', {
              class: 'switch',
              type: 'button',
              role: 'switch',
              'aria-checked': String(state.reduced),
              'aria-labelledby': 'set-motion',
              dataset: { focus: 'set-motion' },
              onClick: () => actions.setSetting('reduce', !state.reduced),
            }))),
        h('div', { class: 'list-card' },
          h('button', {
            class: 'list-card__btn',
            type: 'button',
            'aria-expanded': String(state.dataOpen),
            'aria-controls': 'data-panel',
            dataset: { focus: 'data' },
            onClick: actions.toggleDataInfo,
          },
          h('span', { class: 'round-icon', 'aria-hidden': 'true' }, icon(IC.lock, 18, { strokeWidth: 1.9 })),
          h('span', {}, 'Как хранятся мои данные'),
          icon(IC.chevron, 20, { strokeWidth: 1.9, className: 'list-card__chevron' })),
          state.dataOpen
            ? h('div', { class: 'list-card__panel', id: 'data-panel' },
              h('p', {}, 'Сценарии, планы и настройки лежат только здесь — в памяти этого браузера. Аккаунта нет, на сервер они не уходят.'),
              h('p', {}, 'Чтобы ответить, AI получает текст текущего разговора. Имя и контакты для этого не нужны. Сообщения, после которых открывается живая помощь, в AI не отправляются.'),
              h('p', {}, 'Если очистить данные браузера или нажать «Удалить все данные», всё исчезнет.'))
            : null,
          // Для аккаунта удаление появится вместе с профилем: тут стёрлись бы только данные устройства
          state.account.user ? null : h('div', { class: 'list-card__sep' }),
          state.account.user ? null : h('button', { class: 'list-card__btn list-card__btn--warn', type: 'button', dataset: { focus: 'clear' }, onClick: actions.askClear },
            h('span', { class: 'round-icon', 'aria-hidden': 'true' }, icon(IC.trash, 18, { strokeWidth: 1.9 })),
            h('span', {}, 'Удалить все данные'))),
        h('div', { class: 'card card--sand' },
          h('p', { class: 'serif', style: { fontSize: 'calc(18px * var(--fs))', lineHeight: '1.4' } }, 'Я не психолог и не заменяю помощь специалиста.'),
          h('p', { class: 'text-14 muted' }, 'Паника-режим помогает успокоиться и структурировать задачи. Если тяжело по-настоящему — кнопка «Живая помощь» наверху.'),
          h('button', { class: 'link', type: 'button', style: { alignSelf: 'flex-start', padding: '0 4px' }, dataset: { focus: 'replay' }, onClick: actions.replayOnboarding },
            'Показать знакомство заново')),
      ]);
    },
  };
}
