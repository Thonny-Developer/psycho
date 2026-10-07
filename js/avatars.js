// Аватары: тихие геометрические картинки в палитре приложения, без загрузки фото.
// Цвета задаются классами .av-*, поэтому аватары сами подстраиваются под тему.

const NS = 'http://www.w3.org/2000/svg';

// [элемент, класс, атрибуты] в viewBox 0 0 48 48
const SHAPES = {
  sprout: [
    ['circle', 'av-soft2', { cx: 24, cy: 24, r: 24 }],
    ['path', 'av-stroke', { d: 'M24 36V22' }],
    ['path', 'av-accent', { d: 'M24 24c-7 0-10-5-10-9 5 0 10 3 10 9z' }],
    ['path', 'av-mute', { d: 'M24 21c0-6 4-9 10-9 0 5-4 9-10 9z' }],
    ['ellipse', 'av-sand', { cx: 24, cy: 37, rx: 9, ry: 2.5 }],
  ],
  moon: [
    ['circle', 'av-s2', { cx: 24, cy: 24, r: 24 }],
    ['circle', 'av-sand', { cx: 24, cy: 24, r: 12 }],
    ['circle', 'av-s2', { cx: 30, cy: 19, r: 10 }],
    ['circle', 'av-mute', { cx: 34, cy: 33, r: 1.6 }],
    ['circle', 'av-mute', { cx: 14, cy: 14, r: 1.2 }],
  ],
  wave: [
    ['circle', 'av-soft', { cx: 24, cy: 24, r: 24 }],
    ['path', 'av-stroke', { d: 'M10 20c3 0 3-3 7-3s4 3 7 3 4-3 7-3 4 3 7 3' }],
    ['path', 'av-stroke', { d: 'M10 28c3 0 3-3 7-3s4 3 7 3 4-3 7-3 4 3 7 3' }],
    ['path', 'av-stroke-soft', { d: 'M14 36c3 0 3-2 5-2s3 2 5 2 3-2 5-2 3 2 5 2' }],
  ],
  stone: [
    ['circle', 'av-soft2', { cx: 24, cy: 24, r: 24 }],
    ['ellipse', 'av-sand', { cx: 24, cy: 34, rx: 13, ry: 5 }],
    ['ellipse', 'av-soft', { cx: 23, cy: 26, rx: 9, ry: 4.5 }],
    ['ellipse', 'av-mute', { cx: 25, cy: 19, rx: 6, ry: 3.2 }],
  ],
  sun: [
    ['circle', 'av-warn', { cx: 24, cy: 24, r: 24 }],
    ['circle', 'av-sand', { cx: 24, cy: 24, r: 13 }],
    ['circle', 'av-soft2', { cx: 24, cy: 24, r: 8 }],
  ],
  leaf: [
    ['circle', 'av-soft2', { cx: 24, cy: 24, r: 24 }],
    ['path', 'av-mute', { d: 'M14 34C14 20 22 13 35 13c0 13-7 21-21 21z' }],
    ['path', 'av-stroke', { d: 'M15 33l14-14' }],
  ],
  cloud: [
    ['circle', 'av-s2', { cx: 24, cy: 24, r: 24 }],
    ['path', 'av-soft', { d: 'M15 31h18a6 6 0 0 0 .6-12A8.5 8.5 0 0 0 17 21a5 5 0 0 0-2 10z' }],
    ['circle', 'av-mute', { cx: 19, cy: 36, r: 1.4 }],
    ['circle', 'av-mute', { cx: 27, cy: 37, r: 1.4 }],
  ],
  hill: [
    ['circle', 'av-soft2', { cx: 24, cy: 24, r: 24 }],
    ['circle', 'av-sand', { cx: 31, cy: 16, r: 4 }],
    ['path', 'av-mute', { d: 'M0 36c8-9 15-11 24-6s14 3 24-2v20H0z' }],
    ['path', 'av-accent', { d: 'M0 41c10-5 18-5 26-1s14 2 22-2v10H0z' }],
  ],
};

export const AVATARS = [
  { key: 'sprout', label: 'Росток' },
  { key: 'moon', label: 'Луна' },
  { key: 'wave', label: 'Волны' },
  { key: 'stone', label: 'Камни' },
  { key: 'sun', label: 'Солнце' },
  { key: 'leaf', label: 'Лист' },
  { key: 'cloud', label: 'Облако' },
  { key: 'hill', label: 'Холмы' },
];

export const DEFAULT_AVATAR = 'sprout';

export function isAvatar(key) {
  return Object.hasOwn(SHAPES, key);
}

export function avatar(key, size = 48) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'avatar');
  const clip = document.createElementNS(NS, 'clipPath');
  const clipId = `av-clip-${Math.random().toString(36).slice(2, 8)}`;
  clip.setAttribute('id', clipId);
  const c = document.createElementNS(NS, 'circle');
  c.setAttribute('cx', 24);
  c.setAttribute('cy', 24);
  c.setAttribute('r', 24);
  clip.append(c);
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('clip-path', `url(#${clipId})`);
  for (const [tag, cls, attrs] of SHAPES[isAvatar(key) ? key : DEFAULT_AVATAR]) {
    const el = document.createElementNS(NS, tag);
    el.setAttribute('class', cls);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    g.append(el);
  }
  svg.append(clip, g);
  return svg;
}
