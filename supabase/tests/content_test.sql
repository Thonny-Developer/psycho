-- Проверка политик для книг и отдыха. Запуск: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/content_test.sql
begin;

create temporary table t_users (name text primary key, id uuid);
grant all on t_users to authenticated;
insert into t_users values ('dina', gen_random_uuid()), ('egor', gen_random_uuid());
insert into auth.users (id, email) select id, name || '@example.com' from t_users;

create function pg_temp.login(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from t_users where name = who))::text, true);
  execute 'set local role authenticated';
end $$;

select pg_temp.login('dina');
insert into public.book_status (book_id, status) values ('clear-atomic-habits', 'reading');
insert into public.video_favorites (video_id) values ('calm-nature');
insert into public.mood_checks (video_id, before, after, created_at) values ('calm-nature', 1, 3, '2000-01-01');

do $$ begin
  assert (select count(*) from public.book_status) = 1, 'свой статус виден';
  assert (select created_at from public.mood_checks limit 1) > now() - interval '1 minute', 'время отметки ставит сервер';
  begin
    insert into public.book_status (book_id, status) values ('bad id!', 'reading');
    raise exception 'FAIL: прошёл некорректный id книги';
  exception when check_violation then null;
  end;
  begin
    insert into public.mood_checks (video_id, before, after) values ('calm-nature', 0, 9);
    raise exception 'FAIL: прошла оценка вне шкалы';
  exception when check_violation then null;
  end;
  begin
    insert into public.video_favorites (user_id, video_id) values ((select id from t_users where name = 'egor'), 'calm-nature');
    raise exception 'FAIL: избранное записано чужому';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
select pg_temp.login('egor');
do $$
declare n int;
begin
  assert (select count(*) from public.book_status) = 0, 'чужие статусы книг видны';
  assert (select count(*) from public.video_favorites) = 0, 'чужое избранное видно';
  assert (select count(*) from public.mood_checks) = 0, 'чужие отметки самочувствия видны';
  delete from public.mood_checks;
  get diagnostics n = row_count;
  assert n = 0, 'удалены чужие отметки';
  update public.book_status set status = 'done';
  get diagnostics n = row_count;
  assert n = 0, 'изменён чужой статус';
end $$;

reset role;
select 'Книги и отдых: все проверки пройдены' as result;
rollback;
