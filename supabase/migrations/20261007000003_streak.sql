-- Этап 3: серия дней. Клиент не может записать день сам: таблицы заполняет только триггер
-- на plans по серверному времени и часовому поясу из профиля. Так серию не накрутить,
-- в том числе задним числом. Правило то же, что в js/streak.js:
-- в день D активны планы, созданные в D или с отметкой пункта в D;
-- день засчитан, если все активные планы закрыты и хотя бы один закрыт в D.

create table public.plan_activity (
  user_id uuid not null,
  plan_id text not null,
  day date not null,
  primary key (user_id, plan_id, day),
  foreign key (user_id, plan_id) references public.plans (user_id, id) on delete cascade
);

create table public.streak_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  primary key (user_id, day)
);

alter table public.plan_activity enable row level security;
alter table public.streak_days enable row level security;

create policy "plan_activity: read own" on public.plan_activity
  for select using (user_id = (select auth.uid()));

create policy "streak_days: read own" on public.streak_days
  for select using (user_id = (select auth.uid()));

-- Политик на запись нет, а права на запись отозваны: писать может только триггер
revoke insert, update, delete on public.plan_activity from anon, authenticated;
revoke insert, update, delete on public.streak_days from anon, authenticated;

create function public.track_plan_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text;
  today date;
  active_count int;
  all_closed boolean;
  closed_today boolean;
begin
  -- Перенос гостевых планов — не работа в этот день
  if tg_op = 'INSERT' and new.imported then
    return new;
  end if;
  -- Сохранение в «Мои сценарии» и прочие правки без изменения шагов активностью не считаются
  if tg_op = 'UPDATE' and new.steps is not distinct from old.steps then
    return new;
  end if;

  select timezone into tz from public.profiles where id = new.user_id;
  today := (now() at time zone coalesce(tz, 'UTC'))::date;

  insert into public.plan_activity (user_id, plan_id, day)
  values (new.user_id, new.id, today)
  on conflict do nothing;

  select count(*),
         coalesce(bool_and(p.completed_at is not null), false),
         coalesce(bool_or((p.completed_at at time zone coalesce(tz, 'UTC'))::date = today), false)
    into active_count, all_closed, closed_today
    from public.plan_activity a
    join public.plans p on p.user_id = a.user_id and p.id = a.plan_id
   where a.user_id = new.user_id and a.day = today;

  -- Пересчитывается только сегодняшний день: прошлые уже прожиты
  if active_count > 0 and all_closed and closed_today then
    insert into public.streak_days (user_id, day) values (new.user_id, today) on conflict do nothing;
  else
    delete from public.streak_days where user_id = new.user_id and day = today;
  end if;

  return new;
end;
$$;

create trigger plans_track_activity
  after insert or update on public.plans
  for each row execute function public.track_plan_activity();
