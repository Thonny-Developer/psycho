import { h, icon, replaceKeepFocus } from '../ui.js';
import { IC } from '../icons.js';
import { avatar } from '../avatars.js';
import { plural } from '../plan.js';
import { daysWord } from '../streak.js';
import { badgeList } from './streak.js';

const THEMES = [['light', 'Светлая'], ['dark', 'Тёмная'], ['system', 'Как в системе']];
const SIZES = [['m', 'Обычный', '16px'], ['l', 'Крупный', '19px'], ['xl', 'Самый крупный', '22px']];
const sinceFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

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

function hero(state, actions) {
  const { account } = state;
  const profile = account.profile;
  // Без имени показываем часть почты до @: целиком адрес на узком экране рвётся по буквам
  const name = account.user ? profile?.display_name || account.user.email.split('@')[0] : 'Без аккаунта';
  const since = account.user ? profile?.created_at : state.firstSeenAt;
  return h('div', { class: 'profile-hero' },
    avatar(account.user ? profile?.avatar : 'stone', 72),
    h('div', { class: 'stack', style: { gap: '4px', minWidth: '0', flex: '1' } },
      h('span', { class: 'profile-hero__name' }, name),
      since ? h('span', { class: 'text-14 muted' }, `${account.user ? 'С нами' : 'На этом устройстве'} с ${sinceFormat.format(new Date(since))}`) : null),
    account.user && !account.expired
      ? h('button', { class: 'link', type: 'button', dataset: { focus: 'edit-profile' }, onClick: actions.openProfileEdit }, 'Изменить')
      : null);
}

function stat(value, label) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat__value' }, String(value)), h('span', { class: 'stat__label' }, label));
}

function statsGrid(stats, streak, actions) {
  return h('div', { class: 'stack', style: { gap: '10px' } },
    h('div', { class: 'stats-grid', role: 'list', 'aria-label': 'Статистика' },
      h('div', { role: 'listitem' }, stat(stats.completedPlans, `${plural(stats.completedPlans, ['план завершён', 'плана завершено', 'планов завершено'])}`)),
      h('div', { role: 'listitem' }, stat(stats.doneSteps, `${plural(stats.doneSteps, ['шаг сделан', 'шага сделано', 'шагов сделано'])}`)),
      h('div', { role: 'listitem' }, stat(streak.current, `${daysWord(streak.current)} подряд сейчас`)),
      h('div', { role: 'listitem' }, stat(streak.best, `${daysWord(streak.best)} — лучшая серия`))),
    badgeList(streak.best),
    stats.mood.total
      ? h('p', { class: 'text-14 muted' }, `После видео в «Отдыхе» стало легче в ${stats.mood.better} из ${stats.mood.total} ${plural(stats.mood.total, ['случая', 'случаев', 'случаев'])}.`)
      : null,
    h('button', { class: 'link', type: 'button', style: { alignSelf: 'flex-start' }, dataset: { focus: 'open-streak' }, onClick: actions.openStreak }, 'Календарь и график серии'));
}

function accountCard(state, actions) {
  const { account } = state;
  if (!account.user) return null;

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
    h('span', { class: 'text-14 muted', style: { overflowWrap: 'anywhere' } }, account.user.email),
    h('p', { class: 'sync-note text-14 muted', role: 'status' }, icon(syncIcon, 16, { strokeWidth: 1.9 }), syncText),
    account.expired
      ? h('button', { class: 'btn btn--md', type: 'button', dataset: { focus: 'acc-login' }, onClick: () => actions.openAuth('login') }, 'Войти снова')
      : null);
}

function reminderSetting(state, actions) {
  const time = state.reminderTime;
  return h('div', { class: 'setting' },
    h('div', { class: 'switch-row' },
      h('span', { class: 'stack', style: { flex: '1', gap: '4px' } },
        h('span', { class: 'setting__label', id: 'set-reminder' }, 'Напоминание каждый день'),
        h('span', { class: 'text-14 muted' }, 'Пока это только настройка: сами напоминания появятся в следующих версиях.')),
      h('button', {
        class: 'switch',
        type: 'button',
        role: 'switch',
        'aria-checked': String(Boolean(time)),
        'aria-labelledby': 'set-reminder',
        dataset: { focus: 'set-reminder' },
        onClick: () => actions.setReminder(time ? null : '19:00'),
      })),
    time
      ? h('label', { class: 'reminder-time' },
        h('span', { class: 'text-15' }, 'Во сколько'),
        h('input', {
          class: 'input input--time',
          type: 'time',
          value: time,
          dataset: { focus: 'reminder-time' },
          onChange: (e) => e.target.value && actions.setReminder(e.target.value),
        }))
      : null);
}

function dataPanel(state) {
  const signedIn = Boolean(state.account.user);
  return h('div', { class: 'list-card__panel', id: 'data-panel' },
    signedIn
      ? h('p', {}, 'Планы, профиль и настройки хранятся в аккаунте на сервере Supabase и копией в этом браузере. Доступ к ним есть только у тебя: так настроена база.')
      : h('p', {}, 'Планы и настройки лежат только здесь — в памяти этого браузера. Аккаунта нет, на сервер они не уходят.'),
    h('p', {}, 'Чтобы ответить, AI получает текст текущего разговора. Имя и почта для этого не нужны, а сами разговоры остаются на устройстве. Сообщения, после которых открывается живая помощь, в AI не отправляются.'),
    h('p', {}, signedIn
      ? 'Можно в любой момент скачать все данные или удалить аккаунт — тогда всё сотрётся и с сервера.'
      : 'Если очистить данные браузера или нажать «Удалить все данные», всё исчезнет.'));
}

export function createProfile({ actions }) {
  const title = h('h1', { class: 'h-title', style: { padding: '0 4px' }, tabindex: '-1' }, 'Профиль');
  const body = h('div', { class: 'stack', style: { gap: '22px' } });

  const el = h('section', { class: 'screen', 'aria-labelledby': 'profile-title' },
    h('div', { class: 'scroll' },
      h('div', { class: 'settings-body' }, Object.assign(title, { id: 'profile-title' }), body)));

  return {
    el,
    focusTarget: title,
    update(state) {
      const { settings, account } = state;
      const size = SIZES.find(([k]) => k === settings.fs) ?? SIZES[0];
      const signedIn = Boolean(account.user);

      replaceKeepFocus(body, [
        hero(state, actions),
        statsGrid(state.stats, state.streak, actions),
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
            })),
          reminderSetting(state, actions)),
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
          state.dataOpen ? dataPanel(state) : null,
          h('div', { class: 'list-card__sep' }),
          signedIn && !account.expired
            ? [
              h('button', { class: 'list-card__btn', type: 'button', dataset: { focus: 'password' }, onClick: () => actions.openAuth('change') },
                h('span', { class: 'round-icon', 'aria-hidden': 'true' }, icon(IC.key, 18, { strokeWidth: 1.9 })),
                h('span', {}, 'Сменить пароль')),
              h('div', { class: 'list-card__sep' }),
            ]
            : null,
          h('button', {
            class: 'list-card__btn',
            type: 'button',
            disabled: state.exporting,
            'aria-busy': String(state.exporting),
            dataset: { focus: 'export' },
            onClick: actions.exportData,
          },
          h('span', { class: 'round-icon', 'aria-hidden': 'true' }, icon(IC.download, 18, { strokeWidth: 1.9 })),
          h('span', {}, state.exporting ? 'Собираю файл…' : 'Скачать мои данные')),
          h('div', { class: 'list-card__sep' }),
          h('button', {
            class: 'list-card__btn',
            type: 'button',
            disabled: state.account.signingOut,
            'aria-busy': String(state.account.signingOut),
            dataset: { focus: 'logout' },
            onClick: actions.signOut,
          },
          h('span', { class: 'round-icon', 'aria-hidden': 'true' }, icon(IC.logout, 18, { strokeWidth: 1.9 })),
          h('span', {}, state.account.signingOut ? 'Выхожу…' : 'Выйти из аккаунта')),
          h('div', { class: 'list-card__sep' }),
          h('button', { class: 'list-card__btn list-card__btn--warn', type: 'button', dataset: { focus: 'delete-account' }, onClick: actions.askDeleteAccount },
            h('span', { class: 'round-icon', 'aria-hidden': 'true' }, icon(IC.trash, 18, { strokeWidth: 1.9 })),
            h('span', {}, 'Удалить аккаунт'))),
        h('div', { class: 'card card--sand' },
          h('p', { class: 'serif', style: { fontSize: 'calc(18px * var(--fs))', lineHeight: '1.4' } }, 'Я не психолог и не заменяю помощь специалиста.'),
          h('p', { class: 'text-14 muted' }, 'Kero Psycho Helper помогает успокоиться и структурировать задачи. Если тяжело по-настоящему — кнопка «Живая помощь» наверху.'),
          h('button', { class: 'link', type: 'button', style: { alignSelf: 'flex-start', padding: '0 4px' }, dataset: { focus: 'replay' }, onClick: actions.replayOnboarding },
            'Показать знакомство заново')),
      ]);
    },
  };
}
