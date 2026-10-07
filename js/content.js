// Тексты интерфейса и справочные данные. Номера помощи проверены по открытым источникам:
// tengrinews.kz/kazakhstan_news/zvonit-kazahstantsam-nujna-psihologicheskaya-pomosch-525732/
// informburo.kz/interview/kak-kontakt-centr-111-okazyvaet-pomoshh-kazaxstancam

import { IC } from './icons.js';
import { PROBLEM_TYPES } from './plan.js';

const TYPE_DETAILS = {
  deadline: {
    hint: 'Сдать скоро, а сделано мало',
    icon: IC.clock,
    greet: 'Я рядом. Давай сначала поймём масштаб: что нужно сдать и когда? Можно в двух словах.',
  },
  exam: {
    hint: 'Времени мало, тем много',
    icon: IC.calendar,
    greet: 'Экзамен завтра — это много, но не бесконечно. Что за предмет и что уже знаешь хотя бы немного?',
  },
  debt: {
    hint: 'Хвост, который давит',
    icon: IC.layers,
    greet: 'Хвосты давят, понимаю. Какой предмет и что нужно, чтобы его закрыть?',
  },
  topic: {
    hint: 'Читаю — и ничего не ясно',
    icon: IC.question,
    greet: 'Бывает, что тема не заходит с первого раза, — это нормально. Что за тема и где именно теряешься?',
  },
  bug: {
    hint: 'Ошибка, и непонятно где',
    icon: IC.code,
    greet: 'Сломанный код выматывает. Что должно было работать и что происходит вместо этого?',
  },
  all: {
    hint: 'Не знаю, за что хвататься',
    icon: IC.waves,
    greet: 'Когда всё сразу, кажется, что не вывезти. Давай просто перечислим, что висит, — без порядка, как вспоминается.',
  },
  other: {
    hint: 'Опишу своими словами',
    icon: IC.chat,
    greet: 'Расскажи своими словами, что случилось. Можно коротко — я задам пару вопросов и соберу план.',
  },
};

const ALL_TYPES = Object.entries(PROBLEM_TYPES).map(([key, label]) => ({ key, label, ...TYPE_DETAILS[key] }));

/** Карточки тем на главной; «Своя ситуация» идёт отдельной кнопкой под ними */
export const TYPES = ALL_TYPES.filter((t) => t.key !== 'other');
export const OWN_TOPIC = ALL_TYPES.find((t) => t.key === 'other');

export const PANIC_GREET = 'Я рядом. Что сейчас происходит? Можно коротко, как получится, — хоть одним словом.';

export function greetingFor(type) {
  return TYPE_DETAILS[type]?.greet ?? PANIC_GREET;
}

export function typeLabel(type) {
  return PROBLEM_TYPES[type] ?? 'Просто поговорить';
}

export const CHIPS = ['Не знаю, с чего начать', 'Боюсь не успеть', 'Просто выговориться'];

export const GROUND = [
  { n: '5', title: 'вещей, которые ты видишь', hint: 'Не спеши. Можно вслух или про себя: лампа, кружка, край стола…' },
  { n: '4', title: 'вещи, которые можно потрогать', hint: 'Ткань рукава, прохладный стол, телефон в руке. Почувствуй фактуру.' },
  { n: '3', title: 'звука, которые слышишь', hint: 'Гул холодильника, шаги за стеной, собственное дыхание.' },
  { n: '2', title: 'запаха вокруг', hint: 'Чай, бумага, воздух из окна. Если не чувствуешь — вспомни любимый.' },
  { n: '1', title: 'вкус, который замечаешь', hint: 'Глоток воды, мятная жвачка или просто вкус во рту.' },
];

export function greetingByHour(hour) {
  if (hour < 5) return 'Доброй ночи. Не спится?';
  if (hour < 11) return 'Доброе утро';
  if (hour < 17) return 'Добрый день';
  if (hour < 22) return 'Добрый вечер';
  return 'Доброй ночи';
}

/** Живая помощь, Казахстан */
export const HELP = {
  main: {
    label: 'Контакт-центр 111',
    number: '111',
    tel: 'tel:111',
    note: 'Круглосуточно и бесплатно. Психолог поможет, если тяжело, тревожно или одиноко.',
    starter: 'Можно начать с простого: «Мне сейчас тяжело, можно я просто поговорю?»',
  },
  youth: {
    label: 'Телефон доверия 150',
    note: 'Для детей и молодёжи, анонимно. Пн–Пт с 9:00 до 18:00.',
    tel: 'tel:150',
    whatsapp: 'https://wa.me/77081060810',
    whatsappLabel: 'WhatsApp +7 708 106 08 10',
    site: 'https://telefon150.kz',
    siteLabel: 'Чат на telefon150.kz',
  },
  emergency: {
    label: 'Экстренные службы',
    note: 'Если есть угроза жизни — твоей или чьей-то ещё',
    number: '112',
    tel: 'tel:112',
  },
  college: {
    label: 'Психолог колледжа',
    note: 'Обычно бесплатно для студентов. Контакт есть у куратора или в учебной части.',
  },
  trusted: {
    label: 'Человек, которому доверяешь',
    note: 'Можно написать: «Мне сейчас плохо. Побудешь со мной на связи?»',
  },
};
