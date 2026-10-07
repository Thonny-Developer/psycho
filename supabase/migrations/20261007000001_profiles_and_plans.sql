-- Этап 1: профили и планы аккаунта.
-- Все таблицы под Row Level Security: пользователь видит и меняет только свои строки.

-- ---------- Профили ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 40),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  guest_imported_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: read own" on public.profiles
  for select using (id = (select auth.uid()));

create policy "profiles: update own" on public.profiles
  for update using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Профиль создаётся триггером при регистрации: имя и часовой пояс из метаданных signUp,
-- для входа через Google — из имени в аккаунте Google.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tz text := coalesce(new.raw_user_meta_data ->> 'timezone', 'UTC');
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = tz) then
    tz := 'UTC';
  end if;

  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), nullif(new.raw_user_meta_data ->> 'full_name', ''), ''), 40),
    tz
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Часовой пояс должен быть настоящим: по нему считается день серии
create function public.check_profile_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown timezone' using errcode = '22023';
  end if;
  -- дата регистрации не меняется
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger profiles_check_timezone
  before update on public.profiles
  for each row execute function public.check_profile_timezone();

-- ---------- Планы ----------

create table public.plans (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 8 and 64),
  type text not null check (type in ('deadline', 'exam', 'debt', 'topic', 'bug', 'all', 'other')),
  title text not null check (char_length(title) between 1 and 120),
  source text not null default 'api' check (source in ('api', 'fallback')),
  fallback_reason text check (char_length(fallback_reason) <= 200),
  steps jsonb not null check (
    jsonb_typeof(steps) = 'array'
    and jsonb_array_length(steps) between 1 and 7
    and pg_column_size(steps) <= 16000
  ),
  saved_at timestamptz,
  imported boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, id)
);

create index plans_saved_idx on public.plans (user_id, saved_at desc) where saved_at is not null;

alter table public.plans enable row level security;

create policy "plans: read own" on public.plans
  for select using (user_id = (select auth.uid()));

create policy "plans: insert own" on public.plans
  for insert with check (user_id = (select auth.uid()));

create policy "plans: update own" on public.plans
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "plans: delete own" on public.plans
  for delete using (user_id = (select auth.uid()));

-- Служебные поля ставит сервер, а не клиент: время создания и изменения,
-- момент завершения (все шаги отмечены). Так их нельзя подделать задним числом.
create function public.plans_server_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  all_done boolean;
begin
  select coalesce(bool_and((step ->> 'done')::boolean), false)
    into all_done
    from jsonb_array_elements(new.steps) as step;

  if tg_op = 'INSERT' then
    -- перенос из гостевого режима сохраняет дату плана, но не позже «сейчас»
    new.created_at := case when new.imported then least(coalesce(new.created_at, now()), now()) else now() end;
    new.completed_at := case when all_done then now() end;
  else
    new.created_at := old.created_at;
    new.imported := old.imported;
    new.completed_at := case when all_done then coalesce(old.completed_at, now()) end;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create trigger plans_server_fields
  before insert or update on public.plans
  for each row execute function public.plans_server_fields();
