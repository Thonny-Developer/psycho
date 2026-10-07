-- Проверка серверной серии. Запуск: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/streak_test.sql
-- Всё в транзакции и откатывается.

begin;

create temporary table t_users (name text primary key, id uuid);
grant all on t_users to authenticated;
insert into t_users values ('vera', gen_random_uuid()), ('gleb', gen_random_uuid());
insert into auth.users (id, email, raw_user_meta_data)
select id, name || '@example.com', '{"timezone": "Asia/Almaty"}'::jsonb from t_users;

create function pg_temp.login(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from t_users where name = who))::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.steps(done boolean) returns jsonb language sql as $$
  select jsonb_build_array(
    jsonb_build_object('id', 's1', 'title', 'Первый шаг', 'minutes', 5, 'done', done, 'substeps', '[]'::jsonb),
    jsonb_build_object('id', 's2', 'title', 'Второй шаг', 'minutes', 5, 'done', done, 'substeps', '[]'::jsonb))
$$;

create function pg_temp.today_counted() returns boolean language sql as $$
  select exists (select 1 from public.streak_days where day = (now() at time zone 'Asia/Almaty')::date)
$$;

select pg_temp.login('vera');

-- Новый план: активность есть, день ещё не засчитан
insert into public.plans (id, type, title, steps) values ('plan-vera-01', 'exam', 'Матан', pg_temp.steps(false));
do $$ begin
  assert (select count(*) from public.plan_activity) = 1, 'активность записана';
  assert not pg_temp.today_counted(), 'день не засчитан, пока план открыт';
end $$;

-- Все шаги отмечены: день засчитан
update public.plans set steps = pg_temp.steps(true) where id = 'plan-vera-01';
do $$ begin assert pg_temp.today_counted(), 'день засчитан, когда план закрыт'; end $$;

-- Второй план в тот же день: пока открыт, день снова не засчитан
insert into public.plans (id, type, title, steps) values ('plan-vera-02', 'bug', 'Код', pg_temp.steps(false));
do $$ begin assert not pg_temp.today_counted(), 'новый открытый план снимает отметку дня'; end $$;

update public.plans set steps = pg_temp.steps(true) where id = 'plan-vera-02';
do $$ begin assert pg_temp.today_counted(), 'оба плана закрыты — день засчитан'; end $$;

-- Сохранение в сценарии не считается работой с планом
update public.plans set saved_at = now() where id = 'plan-vera-02';
do $$ begin assert (select count(*) from public.plan_activity) = 2, 'saved_at не добавляет активность'; end $$;

-- Накрутить с клиента нельзя
do $$ begin
  begin
    insert into public.streak_days (user_id, day) values ((select id from t_users where name = 'vera'), date '2026-01-01');
    raise exception 'FAIL: клиент записал день серии';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.plan_activity (user_id, plan_id, day) values ((select id from t_users where name = 'vera'), 'plan-vera-01', date '2026-01-01');
    raise exception 'FAIL: клиент записал активность';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.streak_days;
    raise exception 'FAIL: клиент удалил дни серии';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Перенесённый из гостевого режима закрытый план день не засчитывает и активностью не считается
insert into public.plans (id, type, title, steps, imported, created_at)
values ('plan-vera-old', 'all', 'Старый гостевой', pg_temp.steps(true), true, now() - interval '30 days');
do $$ begin
  assert (select count(*) from public.plan_activity where plan_id = 'plan-vera-old') = 0, 'перенос не активность';
  assert (select created_at from public.plans where id = 'plan-vera-old') < now() - interval '29 days', 'дата перенесённого плана сохранена';
end $$;

-- Глеб не видит серию Веры
reset role;
select pg_temp.login('gleb');
do $$ begin
  assert (select count(*) from public.streak_days) = 0, 'чужая серия видна';
  assert (select count(*) from public.plan_activity) = 0, 'чужая активность видна';
end $$;

reset role;
select 'Серия: все проверки пройдены' as result;
rollback;
