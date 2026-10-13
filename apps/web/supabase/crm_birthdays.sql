-- Fecha de cumpleaños de los clientes + aviso diario.
-- Ejecutar DESPUÉS de crm.sql, crm_push.sql, crm_policies.sql y crm_vehicle_reminders.sql (registro de envíos). Se puede correr varias veces.
--   · crm_contacts.birth_date: fecha de nacimiento (se edita en la ficha del CRM o se importa).
--   · Todos los días a las 9:10 a. m. (Colombia) crm_birthdays_daily() manda un aviso push con
--     los clientes que cumplen años hoy y le escribe al cliente una felicitación (WhatsApp + correo).
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

-- ───────────── Felicitación al cliente ─────────────
-- El día del cumpleaños, mazoseguros.com/api/crm/birthdays/notify le escribe al cliente por WhatsApp
-- (plantilla GUPSHUP_TPL_CUMPLEANOS_ID) y por correo, con un mensaje de posventa según sus pólizas.
alter table crm_contacts add column if not exists birthday_greeted_year int;   -- año en que ya se felicitó
alter table crm_contacts add column if not exists notify_opt_out boolean not null default false;

-- Cumpleañeros de hoy por felicitar (o uno puntual con p_id, para "Enviar felicitación" desde el admin)
create or replace function crm_birthday_due(p_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'America/Bogota')::date;
  v jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'contact_id', c.id,
      'name', coalesce(nullif(c.name, ''), c.wa_name),
      'phone', c.phone,
      'email', nullif(btrim(c.email), ''),
      'turns', b.turns,
      'interest', c.interest,
      'status', c.status,
      -- ramos con pólizas vigentes (para personalizar el mensaje de posventa)
      'lines', (select coalesce(jsonb_agg(distinct p.line), '[]'::jsonb) from crm_policies p
                where p.contact_id = c.id and p.status = 'vigente' and (p.end_date is null or p.end_date >= v_today)),
      -- póliza que vence en los próximos 60 días (oportunidad de renovación)
      'renewal', (select jsonb_build_object('line', p.line, 'insurer', p.insurer, 'end_date', p.end_date)
                  from crm_policies p
                  where p.contact_id = c.id and p.status = 'vigente' and p.end_date between v_today and v_today + 60
                  order by p.end_date limit 1)
    ) order by c.name), '[]'::jsonb)
  into v
  from crm_birthdays_view b
  join crm_contacts c on c.id = b.id
  where (p_id is not null and c.id = p_id)
     or (p_id is null and b.days_left = 0 and not c.notify_opt_out
         and coalesce(c.birthday_greeted_year, 0) < extract(year from v_today)
         and (c.phone is not null or nullif(btrim(c.email), '') is not null));
  return v;
end $$;

create or replace function crm_birthday_mark(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update crm_contacts set birthday_greeted_year = extract(year from (now() at time zone 'America/Bogota'))::int where id = p_id
$$;

revoke all on function crm_birthday_due(uuid) from public, anon, authenticated;
revoke all on function crm_birthday_mark(uuid) from public, anon, authenticated;
grant execute on function crm_birthday_due(uuid) to service_role;
grant execute on function crm_birthday_mark(uuid) to service_role;

-- Aviso push con los cumpleaños de hoy + felicitación automática a los clientes
create or replace function crm_birthdays_daily() returns int
language plpgsql security definer set search_path = public, extensions as $$
declare v_n int; v_names text; v_base text; v_secret text;
begin
  select count(*), string_agg(coalesce(name, '+' || phone) || ' (' || turns || ')', ', ' order by name)
    into v_n, v_names
  from crm_birthdays_view where days_left = 0;
  if v_n > 0 then
    perform crm_notify('🎂 Hoy cumple' || case when v_n > 1 then 'n' else '' end || ' años', v_names,
                       '/admin', 'birthdays');
    select regexp_replace(value, '/api/.*$', '') into v_base from crm_private_config where key = 'push_url';
    select value into v_secret from crm_private_config where key = 'push_secret';
    if v_base is not null and v_secret is not null then
      perform net.http_post(
        url := v_base || '/api/crm/birthdays/notify',
        body := '{}'::jsonb,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
        timeout_milliseconds := 60000);
    end if;
  end if;
  return v_n;
end $$;
revoke all on function crm_birthdays_daily() from public, anon, authenticated;

-- 9:10 a. m. Colombia (no tan temprano para un saludo)
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'crm-birthdays-daily';
  perform cron.schedule('crm-birthdays-daily', '10 14 * * *', 'select crm_birthdays_daily()');
exception when others then
  raise notice 'No se pudo programar pg_cron (%). Actívalo en Database → Extensions y vuelve a correr este archivo.', sqlerrm;
end $$;
