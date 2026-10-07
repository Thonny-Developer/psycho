import { h, icon, replaceKeepFocus } from '../ui.js';
import { IC } from '../icons.js';
import { TOPICS, STATUSES, searchBooks, recommend, topicLabel, readingLabel } from '../library.js';
import { typeLabel } from '../content.js';

const statusLabel = (key) => STATUSES.find((s) => s.key === key)?.label ?? '';

/** Обложка-плейсхолдер: мягкие круги в цвете темы и первая буква названия */
export function cover(book, size = 'sm') {
  return h('span', { class: `cover cover--${size} cover--${book.topics[0]}`, 'aria-hidden': 'true' },
    h('span', { class: 'cover__circle cover__circle--a' }),
    h('span', { class: 'cover__circle cover__circle--b' }),
    h('span', { class: 'cover__letter' }, book.title.replace(/[«"]/g, '').charAt(0)));
}

function bookCard(book, status, actions) {
  return h('li', {},
    h('button', { class: 'book-card', type: 'button', dataset: { focus: `book-${book.id}` }, onClick: () => actions.openBook(book.id) },
      cover(book),
      h('span', { class: 'book-card__body' },
        h('span', { class: 'book-card__title' }, book.title),
        h('span', { class: 'book-card__author' }, book.author),
        h('span', { class: 'book-card__pitch' }, book.pitch),
        h('span', { class: 'book-card__meta' },
          book.readingTime ? h('span', {}, readingLabel(book.readingTime)) : null,
          status ? h('span', { class: 'pill' }, statusLabel(status)) : null))));
}

function list(books, statuses, actions) {
  return h('ul', { class: 'book-list' }, books.map((b) => bookCard(b, statuses[b.id], actions)));
}

export function createLibrary({ state, actions }) {
  let query = state.libraryQuery ?? '';
  let topic = state.libraryTopic ?? null;

  const title = h('h1', { id: 'library-title', class: 'h-title', tabindex: '-1' }, 'Библиотека');
  const search = h('input', {
    id: 'library-search',
    class: 'input input--search',
    type: 'search',
    value: query,
    placeholder: 'Название, автор или тема',
    autocomplete: 'off',
    enterkeyhint: 'search',
  });
  const chips = h('div', { class: 'chips chips--scroll', role: 'group', 'aria-label': 'Темы' });
  const results = h('div', { class: 'stack', style: { gap: '18px' } });
  const count = h('p', { class: 'visually-hidden', role: 'status', 'aria-live': 'polite' });
  let current = state;

  function renderChips(focusKey) {
    replaceKeepFocus(chips, [{ key: null, label: 'Все' }, ...TOPICS].map((t) => h('button', {
      class: 'chip',
      type: 'button',
      'aria-pressed': String(topic === t.key),
      dataset: { focus: `topic-${t.key ?? 'all'}` },
      onClick: () => {
        topic = t.key;
        actions.setLibraryFilter({ query, topic });
        renderChips(`topic-${t.key ?? 'all'}`);
        renderResults();
      },
    }, t.label)), focusKey);
  }

  function renderResults() {
    const s = current;
    if (s.library.status === 'loading' || s.library.status === 'idle') {
      results.replaceChildren(h('div', { class: 'skeleton skeleton--big', 'aria-hidden': 'true' }, h('span'), h('span'), h('span')));
      return;
    }
    if (s.library.status === 'error') {
      results.replaceChildren(h('div', { class: 'warn-card', role: 'alert' },
        h('span', { class: 'text-16' }, s.online ? 'Не получилось загрузить библиотеку. Это не ты — попробуем ещё раз.' : 'Без сети библиотека не загрузится. Как появится интернет — попробуй снова.'),
        h('button', { class: 'btn btn--soft', type: 'button', style: { alignSelf: 'flex-start' }, onClick: actions.loadLibrary },
          icon(IC.retry, 18, { strokeWidth: 1.9 }), 'Повторить')));
      return;
    }

    const books = s.library.books;
    const found = searchBooks(books, { query, topic });
    const filtering = Boolean(query.trim() || topic);
    const blocks = [];

    // Подборка — только когда человек ничего не ищет, чтобы не путать с результатами
    const planType = s.plan?.type ?? s.scenarios[0]?.type ?? null;
    const picks = !filtering && planType ? recommend(books, planType, s.bookStatuses) : [];
    if (picks.length) {
      blocks.push(h('section', { class: 'stack', style: { gap: '10px' }, 'aria-labelledby': 'picks-title' },
        h('h2', { id: 'picks-title', class: 'h-section' }, 'Подобрано под твою ситуацию'),
        h('p', { class: 'text-14 muted' }, `По теме недавнего плана: «${typeLabel(planType)}»`),
        list(picks, s.bookStatuses, actions)));
    }

    blocks.push(h('section', { class: 'stack', style: { gap: '10px' }, 'aria-labelledby': 'all-title' },
      h('h2', { id: 'all-title', class: 'h-section' }, filtering ? `Нашлось: ${found.length}` : 'Все книги'),
      found.length
        ? list(found, s.bookStatuses, actions)
        : h('div', { class: 'empty-dashed' }, 'Ничего не нашлось. Попробуй другое слово или тему.',
          h('button', { class: 'link', type: 'button', style: { display: 'block', marginTop: '6px' }, onClick: () => {
            query = '';
            topic = null;
            search.value = '';
            actions.setLibraryFilter({ query, topic });
            renderChips();
            renderResults();
          } }, 'Показать все книги'))));

    replaceKeepFocus(results, blocks);
    count.textContent = filtering ? `Нашлось книг: ${found.length}` : '';
  }

  let timer = null;
  search.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      query = search.value.slice(0, 80);
      actions.setLibraryFilter({ query, topic });
      renderResults();
    }, 200);
  });

  renderChips();

  const el = h('section', { class: 'screen', 'aria-labelledby': 'library-title' },
    h('div', { class: 'scroll' },
      h('div', { class: 'saved-body' },
        title,
        h('p', { class: 'text-16 muted' }, 'Книги о тревоге, учёбе и делах. Коротко о главном и одно маленькое действие на сегодня.'),
        h('label', { class: 'visually-hidden', for: 'library-search' }, 'Поиск по книгам'),
        search,
        chips,
        count,
        results)));

  return {
    el,
    focusTarget: title,
    update(s) {
      current = s;
      renderResults();
    },
  };
}

export function createBook({ state, actions }) {
  const book = state.library.books?.find((b) => b.id === state.bookId);
  const title = h('h1', { id: 'book-title', class: 'plan-title', tabindex: '-1' }, book?.title ?? 'Книга не найдена');
  const statusBox = h('div', { class: 'setting' });

  if (!book) {
    return {
      el: h('section', { class: 'screen' }, h('div', { class: 'scroll' }, h('div', { class: 'saved-body' }, title,
        h('button', { class: 'btn', type: 'button', onClick: actions.openLibrary }, 'К библиотеке')))),
      focusTarget: title,
    };
  }

  const el = h('section', { class: 'screen', 'aria-labelledby': 'book-title' },
    h('div', { class: 'scroll' },
      h('div', { class: 'saved-body' },
        h('div', { class: 'book-head' },
          cover(book, 'lg'),
          h('div', { class: 'stack', style: { gap: '6px', minWidth: '0' } },
            title,
            h('span', { class: 'text-16 muted' }, book.author),
            book.readingTime ? h('span', { class: 'text-14 muted' }, readingLabel(book.readingTime)) : null)),
        h('div', { class: 'chips' }, book.topics.map((t) => h('span', { class: 'pill' }, topicLabel(t)))),
        h('p', { class: 'lead' }, book.pitch),
        statusBox,
        h('section', { class: 'card', 'aria-labelledby': 'ideas-title' },
          h('h2', { id: 'ideas-title', class: 'h-section' }, 'Главные идеи'),
          h('ol', { class: 'ideas' }, book.keyIdeas.map((idea) => h('li', {}, idea)))),
        h('section', { class: 'try-today', 'aria-labelledby': 'try-title' },
          h('span', { class: 'try-today__head' }, icon(IC.sun, 20, { strokeWidth: 1.8 }), h('h2', { id: 'try-title' }, 'Попробуй сегодня')),
          h('p', { class: 'text-16' }, book.tryToday)),
        book.sourceUrl ? h('a', { class: 'link', href: book.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Подробнее о книге') : null,
        h('p', { class: 'text-14 muted' }, 'Описание — короткий пересказ своими словами, не замена самой книге.'))));

  return {
    el,
    focusTarget: title,
    update(s) {
      const status = s.bookStatuses[book.id] ?? null;
      replaceKeepFocus(statusBox, [
        h('span', { class: 'setting__label', id: 'book-status' }, 'Моя отметка'),
        h('div', { class: 'radio-seg radio-seg--status', role: 'group', 'aria-labelledby': 'book-status' },
          STATUSES.map((st) => h('button', {
            type: 'button',
            'aria-pressed': String(status === st.key),
            dataset: { focus: `status-${st.key}` },
            onClick: () => actions.setBookStatus(book.id, status === st.key ? null : st.key),
          }, st.label))),
        status ? h('span', { class: 'text-14 muted' }, 'Нажми на отметку ещё раз, чтобы снять её.') : null,
      ]);
    },
  };
}
