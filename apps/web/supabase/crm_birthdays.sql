-- Fecha de cumpleaños de los clientes + aviso diario.
-- Ejecutar DESPUÉS de crm.sql y crm_push.sql. Se puede correr varias veces.
--   · crm_contacts.birth_date: fecha de nacimiento (se edita en la ficha del CRM o se importa).
--   · Todos los días a las 8 a. m. (Colombia) crm_birthdays_daily() manda un aviso push con
--     los clientes que cumplen años hoy.
--   · En el modo asesor del bot, "cumpleaños" lista los de los próximos 7 días.

alter table crm_contacts add column if not exists birth_date date;
create index if not exists crm_contacts_birth_md_idx
  on crm_contacts ((extract(month from birth_date)), (extract(day from birth_date))) where birth_date is not null;

-- Próximo cumpleaños a partir de p_from (el 29 de febrero se celebra el 28 en años no bisiestos)
create or replace function crm_next_birthday(p_birth date, p_from date) returns date
language plpgsql immutable as $$
declare y int := extract(year from p_from); d date;
begin
  if p_birth is null then return null; end if;
  for i in 0..1 loop
    begin
      d := make_date(y + i, extract(month from p_birth)::int, extract(day from p_birth)::int);
    exception when others then
      d := make_date(y + i, 2, 28);
    end;
    if d >= p_from then return d; end if;
  end loop;
  return d;
end $$;

-- Edad que cumple en su próximo cumpleaños
create or replace function crm_age_on(p_birth date, p_on date) returns int language sql immutable as $$
  select extract(year from age(p_on, p_birth))::int
$$;

create or replace view crm_birthdays_view with (security_invoker = true) as
select c.id, coalesce(nullif(c.name, ''), c.wa_name) as name, c.phone, c.birth_date,
  crm_next_birthday(c.birth_date, (now() at time zone 'America/Bogota')::date) as next_birthday,
  crm_next_birthday(c.birth_date, (now() at time zone 'America/Bogota')::date) - (now() at time zone 'America/Bogota')::date as days_left,
  crm_age_on(c.birth_date, crm_next_birthday(c.birth_date, (now() at time zone 'America/Bogota')::date)) as turns
from crm_contacts c
where c.birth_date is not null;

-- Texto con los cumpleaños de los próximos p_days días (para WhatsApp)
create or replace function crm_birthdays_text(p_days int default 7) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    '🎂 Cumpleaños de los próximos ' || p_days || E' días:\n' || string_agg(
      '• ' || case b.days_left when 0 then '*HOY*' when 1 then 'mañana' else to_char(b.next_birthday, 'DD/MM') end
        || ' · ' || coalesce(b.name, '?') || ' (' || b.turns || ')' || coalesce(' · +' || b.phone, ''),
      E'\n' order by b.days_left, b.name),
    '🎂 Nadie cumple años en los próximos ' || p_days || ' días.')
  from crm_birthdays_view b
  where b.days_left between 0 and p_days
$$;
revoke all on function crm_birthdays_text(int) from public, anon;
grant execute on function crm_birthdays_text(int) to authenticated, service_role;

-- Aviso push con los cumpleaños de hoy
create or replace function crm_birthdays_daily() returns int
language plpgsql security definer set search_path = public as $$
declare v_n int; v_names text;
begin
  select count(*), string_agg(coalesce(name, '+' || phone) || ' (' || turns || ')', ', ' order by name)
    into v_n, v_names
  from crm_birthdays_view where days_left = 0;
  if v_n > 0 then
    perform crm_notify('🎂 Hoy cumple' || case when v_n > 1 then 'n' else '' end || ' años', v_names,
                       '/admin', 'birthdays');
  end if;
  return v_n;
end $$;
revoke all on function crm_birthdays_daily() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'crm-birthdays-daily';
  perform cron.schedule('crm-birthdays-daily', '2 13 * * *', 'select crm_birthdays_daily()');
exception when others then
  raise notice 'No se pudo programar pg_cron (%). Actívalo en Database → Extensions y vuelve a correr este archivo.', sqlerrm;
end $$;
