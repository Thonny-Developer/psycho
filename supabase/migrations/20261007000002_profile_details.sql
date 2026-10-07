-- Этап 2: детали профиля — аватар и время ежедневного напоминания.

alter table public.profiles
  add column avatar text not null default 'sprout'
    check (avatar in ('sprout', 'moon', 'wave', 'stone', 'sun', 'leaf', 'cloud', 'hill')),
  add column reminder_time time;

comment on column public.profiles.reminder_time is
  'Время ежедневного напоминания в часовом поясе профиля. Пока только настройка: отправка напоминаний — будущая функция.';
