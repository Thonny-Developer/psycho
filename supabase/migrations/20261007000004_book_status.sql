-- Этап 4: статусы книг аккаунта («Хочу прочитать», «Читаю», «Прочитано»).
-- Сами книги — справочник в data/books.json, в базе только отметки человека.

create table public.book_status (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  book_id text not null check (book_id ~ '^[a-z0-9-]{3,60}$'),
  status text not null check (status in ('want', 'reading', 'done')),
  updated_at timestamptz not null default now(),
  primary key (user_id, book_id)
);

alter table public.book_status enable row level security;

create policy "book_status: read own" on public.book_status
  for select using (user_id = (select auth.uid()));
create policy "book_status: insert own" on public.book_status
  for insert with check (user_id = (select auth.uid()));
create policy "book_status: update own" on public.book_status
  for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "book_status: delete own" on public.book_status
  for delete using (user_id = (select auth.uid()));

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger book_status_touch
  before insert or update on public.book_status
  for each row execute function public.touch_updated_at();
