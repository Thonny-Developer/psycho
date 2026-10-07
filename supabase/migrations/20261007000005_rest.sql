-- Этап 5: раздел «Отдых» — избранные видео и отметки самочувствия до и после просмотра.
-- Сами видео — справочник в data/videos.json.

create table public.video_favorites (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  video_id text not null check (video_id ~ '^[a-z0-9-]{3,60}$'),
  created_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

create table public.mood_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  video_id text not null check (video_id ~ '^[a-z0-9-]{3,60}$'),
  before smallint not null check (before between 1 and 3),
  after smallint not null check (after between 1 and 3),
  created_at timestamptz not null default now()
);

create index mood_checks_user_idx on public.mood_checks (user_id, created_at desc);

alter table public.video_favorites enable row level security;
alter table public.mood_checks enable row level security;

create policy "video_favorites: read own" on public.video_favorites
  for select using (user_id = (select auth.uid()));
create policy "video_favorites: insert own" on public.video_favorites
  for insert with check (user_id = (select auth.uid()));
create policy "video_favorites: delete own" on public.video_favorites
  for delete using (user_id = (select auth.uid()));

-- Отметку можно добавить и прочитать; менять прошлые не нужно
create policy "mood_checks: read own" on public.mood_checks
  for select using (user_id = (select auth.uid()));
create policy "mood_checks: insert own" on public.mood_checks
  for insert with check (user_id = (select auth.uid()));
create policy "mood_checks: delete own" on public.mood_checks
  for delete using (user_id = (select auth.uid()));

-- Время отметки ставит сервер
create function public.mood_checks_server_time()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  return new;
end;
$$;

create trigger mood_checks_server_time
  before insert on public.mood_checks
  for each row execute function public.mood_checks_server_time();
