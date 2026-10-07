-- Проверка политик доступа. Запуск: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- Всё выполняется в транзакции и откатывается: в базе ничего не остаётся.
-- При ошибке скрипт падает с текстом, какая проверка не прошла.

begin;

create temporary table t_users (name text primary key, id uuid);
grant all on t_users to authenticated, anon;
insert into t_users values
  ('anna', gen_random_uuid()),
  ('boris', gen_random_uuid());

insert into auth.users (id, email, raw_user_meta_data)
select id, name || '@example.com',
  case when name = 'anna' then '{"name": "Анна", "timezone": "Asia/Almaty"}'::jsonb
       else '{"timezone": "Not/AZone"}'::jsonb end
from t_users;

-- Профили созданы триггером, часовой пояс проверен
do $$
begin
  assert (select count(*) from public.profiles where id in (select id from t_users)) = 2, 'профили не создались';
  assert (select timezone from public.profiles where id = (select id from t_users where name = 'anna')) = 'Asia/Almaty', 'часовой пояс Анны';
  assert (select timezone from public.profiles where id = (select id from t_users where name = 'boris')) = 'UTC', 'несуществующий пояс → UTC';
  assert (select display_name from public.profiles where id = (select id from t_users where name = 'anna')) = 'Анна', 'имя из метаданных';
end $$;

create function pg_temp.login(who text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from t_users where name = who), 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- ---------- Анна создаёт план ----------
select pg_temp.login('anna');

insert into public.plans (id, type, title, steps, created_at, completed_at)
values ('plan-anna-1', 'exam', 'Матан', '[{"id":"s1","title":"Открой билеты","minutes":5,"done":false,"substeps":[]}]', '2000-01-01', '2000-01-01');

do $$
declare p record;
begin
  select * into p from public.plans where id = 'plan-anna-1';
  assert p.user_id = (select id from t_users where name = 'anna'), 'user_id подставлен из токена';
  assert p.created_at > now() - interval '1 minute', 'created_at ставит сервер';
  assert p.completed_at is null, 'completed_at с клиента игнорируется';
end $$;

update public.plans set steps = '[{"id":"s1","title":"Открой билеты","minutes":5,"done":true,"substeps":[]}]' where id = 'plan-anna-1';
do $$ begin
  assert (select completed_at from public.plans where id = 'plan-anna-1') is not null, 'план завершён, когда отмечены все шаги';
end $$;

-- Чужой user_id подставить нельзя
do $$ begin
  begin
    insert into public.plans (user_id, id, type, title, steps)
    values ((select id from t_users where name = 'boris'), 'plan-fake-1', 'exam', 'Чужой', '[{"id":"s","title":"x","minutes":5,"done":false,"substeps":[]}]');
    raise exception 'FAIL: удалось вставить план от имени другого пользователя';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Мусор отсекается проверками
do $$ begin
  begin
    insert into public.plans (id, type, title, steps) values ('plan-bad-01', 'hack', 'x', '[]');
    raise exception 'FAIL: прошёл неизвестный тип';
  exception when check_violation then null;
  end;
end $$;

-- ---------- Борис не видит и не трогает планы Анны ----------
reset role;
select pg_temp.login('boris');

do $$
declare n int;
begin
  assert (select count(*) from public.plans) = 0, 'Борис видит чужие планы';
  assert (select count(*) from public.profiles) = 1, 'Борис видит чужие профили';
  update public.plans set title = 'взлом' where id = 'plan-anna-1';
  get diagnostics n = row_count;
  assert n = 0, 'Борис изменил чужой план';
  delete from public.plans where id = 'plan-anna-1';
  get diagnostics n = row_count;
  assert n = 0, 'Борис удалил чужой план';
  update public.profiles set display_name = 'взлом' where id = (select id from t_users where name = 'anna');
  get diagnostics n = row_count;
  assert n = 0, 'Борис изменил чужой профиль';
end $$;

-- Тот же id плана у другого пользователя — отдельная строка, без конфликта
insert into public.plans (id, type, title, steps)
values ('plan-anna-1', 'bug', 'Свой план Бориса', '[{"id":"s1","title":"Прочитай ошибку","minutes":5,"done":false,"substeps":[]}]');

-- Свой профиль: неверный часовой пояс не принимается
do $$ begin
  begin
    update public.profiles set timezone = 'Mars/Base' where id = (select id from t_users where name = 'boris');
    raise exception 'FAIL: принят несуществующий часовой пояс';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ---------- Аноним не видит ничего ----------
reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$ begin
  assert (select count(*) from public.plans) = 0, 'аноним видит планы';
  assert (select count(*) from public.profiles) = 0, 'аноним видит профили';
end $$;

reset role;
select 'RLS: все проверки пройдены' as result;
rollback;
