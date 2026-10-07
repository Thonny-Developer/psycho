// Небольшие помощники для DOM. Пользовательский текст попадает в DOM только через textContent.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** h('li', { class: 'x', onClick: fn }, 'текст', child) */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'ref') value(el);
    else if (key in el && typeof value !== 'string') el[key] = value;
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

/** Иконка из IC: icon(IC.check, 20, { strokeWidth: 2 }) */
export function icon(path, size = 20, { strokeWidth = 1.8, className } = {}) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', strokeWidth);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (className) svg.setAttribute('class', className);
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', path);
  svg.append(p);
  return svg;
}

/**
 * Заменяет содержимое контейнера и возвращает фокус на элемент с тем же data-focus,
 * чтобы клавиатурная навигация не сбрасывалась после перерисовки.
 */
export function replaceKeepFocus(container, children, focusKey) {
  const active = document.activeElement;
  const key = focusKey ?? (container.contains(active) ? active?.dataset?.focus : undefined);
  container.replaceChildren(...[children].flat(Infinity).filter(Boolean));
  if (key) {
    const target = container.querySelector(`[data-focus="${CSS.escape(key)}"]`);
    target?.focus({ preventScroll: true });
  }
}

export function typingDots() {
  return h('span', { class: 'typing-dots', 'aria-hidden': 'true' }, h('span'), h('span'), h('span'));
}

export function skeleton(count, size = 'big') {
  return h('div', { class: `skeleton skeleton--${size}`, 'aria-hidden': 'true' },
    Array.from({ length: count }, (_, i) => h('span', { style: size === 'small' ? { width: `${90 - i * 15}%` } : null })));
}

/** Скачивание JSON-файла без сервера: Blob и временная ссылка. */
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Объявление для скринридера через общий aria-live регион. */
export function announce(text) {
  const region = document.getElementById('status');
  if (!region) return;
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = text;
  });
}

/** Чекбокс в стиле дизайна: настоящий input, поверх него квадрат с галочкой. */
export function checkbox({ checked, label, onChange, small = false, focus }) {
  return h('label', { class: `check${small ? ' check--sm' : ''}` },
    h('input', { type: 'checkbox', checked, 'aria-label': label, onChange, dataset: focus ? { focus } : null }),
    h('span', { class: 'check__box', 'aria-hidden': 'true' },
      icon('M20 6L9 17l-5-5', small ? 13 : 16, { strokeWidth: small ? 3.2 : 3 })));
}
