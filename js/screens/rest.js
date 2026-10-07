import { h, icon, replaceKeepFocus, announce } from '../ui.js';
import { IC } from '../icons.js';
import {
  MOODS,
  FEELINGS,
  byMood,
  breakVideos,
  formatDuration,
  embedUrl,
  parsePlayerMessage,
  breakLeft,
} from '../rest.js';

const NO_AUTOPLAY = 'Здесь нет автоплея и бесконечной ленты: одно видео — и пауза, чтобы отдых не превратился в ещё один час в телефоне.';
const FACE = { 1: IC.faceSad, 2: IC.faceMeh, 3: IC.faceSmile };
const moodLabel = (key) => MOODS.find((m) => m.key === key)?.label ?? '';

function videoCard(video, favorite, actions) {
  return h('li', { class: 'video-card' },
    h('button', { class: 'video-card__open', type: 'button', dataset: { focus: `video-${video.id}` }, onClick: () => actions.openVideo(video.id) },
      h('span', { class: `video-thumb video-thumb--${video.mood}`, 'aria-hidden': 'true' },
        h('span', { class: 'video-thumb__play' }, icon(IC.play, 22, { strokeWidth: 1.6 })),
        h('span', { class: 'video-thumb__time' }, formatDuration(video.durationSec))),
      h('span', { class: 'stack', style: { gap: '4px', minWidth: '0' } },
        h('span', { class: 'video-card__title' }, video.title),
        h('span', { class: 'text-14 muted' }, [moodLabel(video.mood), video.channel].filter(Boolean).join(' · ')),
        h('span', { class: 'visually-hidden' }, `, ${Math.round(video.durationSec / 60) || 1} мин`))),
    h('button', {
      class: 'icon-btn fav-btn',
      type: 'button',
      'aria-pressed': String(favorite),
      'aria-label': favorite ? `Убрать из избранного: ${video.title}` : `В избранное: ${video.title}`,
      dataset: { focus: `fav-${video.id}` },
      onClick: () => actions.toggleFavorite(video.id),
    }, icon(IC.star, 20, { strokeWidth: 1.8 })));
}

function videosState(s, actions) {
  if (s.videos.status === 'loading' || s.videos.status === 'idle') {
    return h('div', { class: 'skeleton skeleton--big', 'aria-hidden': 'true' }, h('span'), h('span'));
  }
  if (s.videos.status === 'error') {
    return h('div', { class: 'warn-card', role: 'alert' },
      h('span', { class: 'text-16' }, s.online ? 'Не получилось загрузить подборку. Это не ты — попробуем ещё раз.' : 'Без сети видео не загрузятся. Перерыв на 5 минут работает и так.'),
      h('button', { class: 'btn btn--soft', type: 'button', style: { alignSelf: 'flex-start' }, onClick: actions.loadVideos },
        icon(IC.retry, 18, { strokeWidth: 1.9 }), 'Повторить'));
  }
  return null;
}

export function createRest({ state, actions }) {
  let mood = state.restMood ?? null;
  const title = h('h1', { id: 'rest-title', class: 'h-title', tabindex: '-1' }, 'Отдых');
  const chips = h('div', { class: 'chips chips--scroll', role: 'group', 'aria-label': 'Настроение' });
  const body = h('div', { class: 'stack', style: { gap: '18px' } });
  let current = state;

  function renderChips(focusKey) {
    replaceKeepFocus(chips, [{ key: null, label: 'Всё' }, ...MOODS].map((m) => h('button', {
      class: 'chip',
      type: 'button',
      'aria-pressed': String(mood === m.key),
      dataset: { focus: `mood-${m.key ?? 'all'}` },
      onClick: () => {
        mood = m.key;
        actions.setRestMood(mood);
        renderChips(`mood-${m.key ?? 'all'}`);
        renderBody();
      },
    }, m.label)), focusKey);
  }

  function renderBody() {
    const s = current;
    const status = videosState(s, actions);
    const favorites = new Set(s.favorites);
    const list = s.videos.list ?? [];
    const shown = byMood(list, mood);
    const favList = list.filter((v) => favorites.has(v.id));

    replaceKeepFocus(body, [
      h('button', { class: 'break-card', type: 'button', dataset: { focus: 'start-break' }, onClick: actions.startBreak },
        h('span', { class: 'streak-sun', 'aria-hidden': 'true' }, icon(IC.timer, 22, { strokeWidth: 1.8 })),
        h('span', { class: 'stack', style: { gap: '2px', minWidth: '0' } },
          h('span', { class: 'break-card__title' }, 'Перерыв на 5 минут'),
          h('span', { class: 'text-14 muted' }, 'Таймер и короткие видео. Потом мягко вернёмся к делам.'))),
      status,
      !status && favList.length
        ? h('section', { class: 'stack', style: { gap: '10px' }, 'aria-labelledby': 'fav-title' },
          h('h2', { id: 'fav-title', class: 'h-section' }, 'Избранное'),
          h('ul', { class: 'video-list' }, favList.map((v) => videoCard(v, true, actions))))
        : null,
      !status
        ? h('section', { class: 'stack', style: { gap: '10px' }, 'aria-labelledby': 'videos-title' },
          h('h2', { id: 'videos-title', class: 'h-section' }, mood ? moodLabel(mood) : 'Подборка'),
          shown.length
            ? h('ul', { class: 'video-list' }, shown.map((v) => videoCard(v, favorites.has(v.id), actions)))
            : h('div', { class: 'empty-dashed' }, list.length
              ? 'Под это настроение пока ничего нет. Загляни в другую подборку.'
              : 'Подборку видео собирают вручную: каждое смотрим целиком и проверяем, уместно ли оно здесь. Скоро появятся первые. А перерыв на 5 минут уже работает.'))
        : null,
      h('p', { class: 'text-14 muted' }, NO_AUTOPLAY),
    ]);
  }

  renderChips();

  const el = h('section', { class: 'screen', 'aria-labelledby': 'rest-title' },
    h('div', { class: 'scroll' },
      h('div', { class: 'saved-body' },
        title,
        h('p', { class: 'text-16 muted' }, 'Короткие добрые видео, когда нужно перевести дух.'),
        chips,
        body)));

  return {
    el,
    focusTarget: title,
    update(s) {
      current = s;
      renderBody();
    },
  };
}

function feelingScale(label, onPick, id) {
  return h('div', { class: 'feeling', role: 'group', 'aria-labelledby': id },
    h('p', { id, class: 'h-section' }, label),
    h('div', { class: 'feeling__options' },
      FEELINGS.map((f) => h('button', { class: 'feeling__btn', type: 'button', dataset: { focus: `${id}-${f.value}` }, onClick: () => onPick(f.value) },
        icon(FACE[f.value], 34, { strokeWidth: 1.6 }), h('span', {}, f.label)))));
}

/** Просмотр: самочувствие до → плеер → самочувствие после. Без автоплея следующего. */
export function createVideo({ state, actions }) {
  const video = state.videos.list?.find((v) => v.id === state.videoId);
  const title = h('h1', { id: 'video-title', class: 'plan-title', tabindex: '-1' }, video?.title ?? 'Видео не найдено');
  const stage = h('div', { class: 'stack', style: { gap: '16px' } });
  let playerState = 'loading';
  let frame = null;
  let readyTimer = null;
  let renderedKey = '';

  function onMessage(event) {
    if (event.origin !== 'https://www.youtube-nocookie.com' || event.source !== frame?.contentWindow) return;
    const type = parsePlayerMessage(event.data);
    if (type === 'ready' && playerState === 'loading') {
      playerState = 'ready';
      clearTimeout(readyTimer);
    }
    if (type === 'error') {
      playerState = 'error';
      renderStage(true);
    }
    if (type === 'ended') announce('Видео закончилось. Можно отметить, как ты теперь');
  }
  window.addEventListener('message', onMessage);

  function player() {
    if (!navigator.onLine) {
      playerState = 'error';
      return null;
    }
    frame = h('iframe', {
      class: 'player__frame',
      src: embedUrl(video.youtubeId, window.location.origin),
      title: `Видео: ${video.title}`,
      allow: 'encrypted-media; picture-in-picture; fullscreen',
      referrerpolicy: 'strict-origin-when-cross-origin',
      sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups',
      loading: 'eager',
    });
    frame.addEventListener('load', () => {
      // Просим плеер присылать события: так узнаём об ошибке без скрипта YouTube
      const post = (msg) => frame.contentWindow?.postMessage(JSON.stringify(msg), 'https://www.youtube-nocookie.com');
      post({ event: 'listening', id: video.id, channel: 'widget' });
      for (const name of ['onReady', 'onError', 'onStateChange']) post({ event: 'command', func: 'addEventListener', args: [name], id: video.id, channel: 'widget' });
    });
    return h('div', { class: 'player' }, frame);
  }

  function renderStage(force = false) {
    const s = state;
    const key = `${s.videoStage}|${playerState === 'error'}`;
    if (!force && key === renderedKey) return;
    renderedKey = key;

    if (s.videoStage === 'before') {
      replaceKeepFocus(stage, [
        feelingScale('Как ты сейчас?', (v) => actions.setFeeling('before', v), 'feel-before'),
        h('button', { class: 'btn btn--text btn--auto', type: 'button', onClick: () => actions.setFeeling('before', null) }, 'Пропустить и смотреть'),
      ]);
      return;
    }

    if (s.videoStage === 'watch') {
      const embed = playerState === 'error' ? null : player();
      const failed = playerState === 'error';
      replaceKeepFocus(stage, [
        failed
          ? h('div', { class: 'warn-card', role: 'alert' },
            h('span', { class: 'text-16' }, navigator.onLine
              ? 'Видео не загрузилось. Так бывает: его могли убрать или закрыть для встраивания. Это не ты.'
              : 'Без сети видео не загрузится. Можно просто посидеть пару минут с закрытыми глазами.'),
            h('div', { class: 'btn-row' },
              s.nextVideoId ? h('button', { class: 'btn btn--soft', type: 'button', onClick: () => actions.openVideo(s.nextVideoId) }, 'Следующее') : null,
              h('button', { class: 'link link--under', type: 'button', onClick: () => { playerState = 'loading'; renderStage(true); } }, 'Повторить')))
          : embed,
        h('div', { class: 'btn-row' },
          h('button', {
            class: 'btn btn--soft',
            type: 'button',
            'aria-pressed': String(s.favorites.includes(video.id)),
            dataset: { focus: 'video-fav' },
            onClick: () => actions.toggleFavorite(video.id),
          }, icon(IC.star, 18, { strokeWidth: 1.8 }), s.favorites.includes(video.id) ? 'В избранном' : 'В избранное')),
        h('button', { class: 'btn', type: 'button', dataset: { focus: 'video-done' }, onClick: actions.finishVideo },
          s.moodBefore ? 'Готово — как теперь?' : 'Готово'),
        h('p', { class: 'text-14 muted' }, NO_AUTOPLAY),
      ]);
      if (!failed && navigator.onLine) {
        clearTimeout(readyTimer);
        // Плеер не всегда присылает события; молчание не считаем ошибкой, но и не ждём вечно
        readyTimer = setTimeout(() => { if (playerState === 'loading') playerState = 'ready'; }, 12_000);
      }
      return;
    }

    if (s.videoStage === 'after') {
      replaceKeepFocus(stage, [feelingScale('Как теперь?', (v) => actions.setFeeling('after', v), 'feel-after')]);
      return;
    }

    replaceKeepFocus(stage, [
      h('div', { class: 'soft-note', role: 'status' },
        h('span', { class: 'soft-note__title' }, icon(IC.check, 20), 'Спасибо, что прислушиваешься к себе'),
        h('span', { class: 'text-15 muted' }, 'Так со временем станет видно, что помогает именно тебе.')),
      h('button', { class: 'btn', type: 'button', onClick: actions.closeVideo }, s.breakEndsAt ? 'Вернуться к перерыву' : 'К подборке'),
    ]);
  }

  if (!video) {
    return {
      el: h('section', { class: 'screen' }, h('div', { class: 'scroll' }, h('div', { class: 'saved-body' }, title,
        h('button', { class: 'btn', type: 'button', onClick: actions.openRest }, 'К подборке')))),
      focusTarget: title,
      destroy: () => window.removeEventListener('message', onMessage),
    };
  }

  const el = h('section', { class: 'screen', 'aria-labelledby': 'video-title' },
    h('div', { class: 'scroll' },
      h('div', { class: 'saved-body' },
        h('div', { class: 'stack', style: { gap: '6px' } },
          title,
          h('span', { class: 'text-14 muted' }, [moodLabel(video.mood), formatDuration(video.durationSec), video.channel].filter(Boolean).join(' · '))),
        stage)));

  return {
    el,
    focusTarget: title,
    update(s) {
      state = s;
      renderStage();
    },
    destroy() {
      clearTimeout(readyTimer);
      window.removeEventListener('message', onMessage);
    },
  };
}

/** Перерыв на 5 минут: таймер по времени окончания, короткие видео, мягкое возвращение. */
export function createBreak({ state, actions }) {
  const title = h('h1', { id: 'break-title', class: 'h-title', tabindex: '-1' }, 'Перерыв');
  const clock = h('span', { class: 'break-clock', role: 'timer', 'aria-live': 'off' });
  const body = h('div', { class: 'stack', style: { gap: '18px' } });
  let timer = null;
  let current = state;
  let finished = false;

  function tick() {
    const { left, done } = breakLeft(current.breakEndsAt);
    clock.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (done && !finished) {
      finished = true;
      clearInterval(timer);
      announce('Перерыв закончился');
      render();
    }
  }

  function render() {
    const s = current;
    const { done } = breakLeft(s.breakEndsAt);
    const short = breakVideos(s.videos.list ?? []);

    if (done) {
      replaceKeepFocus(body, [
        h('div', { class: 'streak-hero' },
          h('span', { class: 'check-circle', 'aria-hidden': 'true' }, icon(IC.check, 36)),
          h('h2', { class: 'streak-hero__title', tabindex: '-1', ref: (el) => requestAnimationFrame(() => el.focus({ preventScroll: true })) }, 'Перерыв закончился'),
          h('p', { class: 'text-16 muted' }, s.returnStep ? `Вернёмся к шагу ${s.returnStep}? Он уже ждёт, и начать можно с малого.` : 'Вернёмся к делам? Можно начать с самого маленького.')),
        h('button', { class: 'btn', type: 'button', onClick: actions.endBreak }, s.returnStep ? `Вернуться к шагу ${s.returnStep}` : 'На главную'),
        h('button', { class: 'btn btn--text', type: 'button', onClick: actions.startBreak }, 'Ещё 5 минут отдыха'),
      ]);
      return;
    }

    replaceKeepFocus(body, [
      h('div', { class: 'break-timer' }, clock, h('span', { class: 'text-15 muted' }, 'Встань, попей воды, посмотри в окно. Или включи что-нибудь короткое.')),
      short.length
        ? h('section', { class: 'stack', style: { gap: '10px' }, 'aria-labelledby': 'break-videos' },
          h('h2', { id: 'break-videos', class: 'h-section' }, 'Видео до 5 минут'),
          h('ul', { class: 'video-list' }, short.map((v) => videoCard(v, s.favorites.includes(v.id), actions))))
        : null,
      h('button', { class: 'btn btn--text btn--auto', type: 'button', onClick: actions.endBreak }, 'Закончить перерыв раньше'),
    ]);
  }

  const el = h('section', { class: 'screen', 'aria-labelledby': 'break-title' },
    h('div', { class: 'scroll' }, h('div', { class: 'saved-body' }, title, body)));

  return {
    el,
    focusTarget: title,
    update(s) {
      const restarted = s.breakEndsAt !== current.breakEndsAt;
      current = s;
      if (restarted) finished = false;
      if (!timer || restarted) {
        clearInterval(timer);
        timer = setInterval(tick, 1000);
      }
      render();
      tick();
    },
    destroy() {
      clearInterval(timer);
    },
  };
}
