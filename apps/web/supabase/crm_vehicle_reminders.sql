-- Tecnomecánica (RTM) + recordatorios automáticos AL CLIENTE de SOAT y RTM por correo y WhatsApp.
-- Ejecutar DESPUÉS de crm_soat.sql. Se puede correr varias veces. Luego vuelve a correr crm_soat.sql
-- (el modo asesor muestra la RTM al consultar una placa y acepta "rtm ABC123 01/04/2027").
--
-- Todos los días a las 9 a. m. (Colombia) pg_cron llama mazoseguros.com/api/crm/vehicles/notify, que:
--   1) pide crm_vehicle_due(): SOAT y RTM vigentes que vencen en 30, 15 o 3 días y aún no se avisaron,
--   2) le escribe al cliente por WhatsApp (plantilla GUPSHUP_TPL_VENCIMIENTO_ID) y por correo (SMTP),
--   3) deja registro en crm_notifications y marca el aviso con crm_vehicle_mark().
-- Un cliente con crm_contacts.notify_opt_out = true no recibe recordatorios.

-- ───────────── Revisión técnico-mecánica ─────────────
create table if not exists crm_rtm (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references crm_contacts(id) on delete set null,
  plate text not null,
  certificate_number text,
  center_name text,                    -- CDA
  issue_date date,
  expiry_date date,
  notes text,
  reminders_sent int[] not null default '{}',         -- avisos a asesores
  client_reminders_sent int[] not null default '{}',  -- avisos al cliente
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists crm_rtm_plate_expiry_uidx on crm_rtm (plate, expiry_date);
create index if not exists crm_rtm_expiry_idx on crm_rtm (expiry_date);
create index if not exists crm_rtm_contact_idx on crm_rtm (contact_id);

alter table crm_rtm enable row level security;
drop policy if exists "admin all crm_rtm" on crm_rtm;
create policy "admin all crm_rtm" on crm_rtm
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Normaliza la placa y, si no trae cliente, lo toma del SOAT de esa placa
create or replace function crm_trg_rtm_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.plate := crm_plate_norm(new.plate);
  if new.plate is null then raise exception 'falta la placa'; end if;
  if new.contact_id is null then
    select contact_id into new.contact_id from crm_soat
    where plate = new.plate and contact_id is not null order by end_date desc nulls last limit 1;
  end if;
  if tg_op = 'UPDATE' and new.expiry_date is distinct from old.expiry_date then
    new.reminders_sent := '{}'; new.client_reminders_sent := '{}';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists crm_rtm_defaults on crm_rtm;
create trigger crm_rtm_defaults before insert or update on crm_rtm
  for each row execute function crm_trg_rtm_defaults();

drop view if exists crm_rtm_view;  -- se recrea (s.* cambia si se agregan columnas)
create or replace view crm_rtm_view with (security_invoker = true) as
select r.*,
  coalesce(nullif(c.name, ''), c.wa_name) as contact_name,
  c.phone as contact_phone,
  r.expiry_date - crm_today() as days_left,
  case
    when exists (select 1 from crm_rtm n where n.plate = r.plate and n.expiry_date > r.expiry_date) then 'renovado'
    when r.expiry_date is null then 'sin_fecha'
    when r.expiry_date < crm_today() then 'vencido'
    when r.expiry_date - crm_today() <= 30 then 'por_vencer'
    else 'vigente' end as computed_status
from crm_rtm r
left join crm_contacts c on c.id = r.contact_id;

-- ───────────── Avisos al cliente ─────────────
alter table crm_soat add column if not exists client_reminders_sent int[] not null default '{}';
alter table crm_contacts add column if not exists notify_opt_out boolean not null default false;

-- Si cambia el vencimiento de un SOAT, los avisos al cliente vuelven a empezar
create or replace function crm_trg_soat_reset_client() returns trigger language plpgsql as $$
begin
  if new.end_date is distinct from old.end_date then new.client_reminders_sent := '{}'; end if;
  return new;
end $$;
drop trigger if exists crm_soat_reset_client on crm_soat;
create trigger crm_soat_reset_client before update on crm_soat
  for each row execute function crm_trg_soat_reset_client();

create table if not exists crm_notifications (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references crm_contacts(id) on delete set null,
  kind text not null,                  -- soat | rtm
  ref_id uuid,                         -- crm_soat.id / crm_rtm.id
  plate text,
  channel text not null,               -- whatsapp | email
  destination text,
  status text not null,                -- enviado | error | omitido
  detail text,
  days_left int,
  created_at timestamptz not null default now()
);
create index if not exists crm_notifications_created_idx on crm_notifications (created_at desc);
create index if not exists crm_notifications_ref_idx on crm_notifications (ref_id);
alter table crm_notifications enable row level security;
drop policy if exists "admin read crm_notifications" on crm_notifications;
create policy "admin read crm_notifications" on crm_notifications
  for select using (auth.role() = 'authenticated');

-- Pendientes de aviso al cliente hoy. p_only: limitar a un registro (para "Enviar ahora" desde el admin)
create or replace function crm_vehicle_due(p_kind text default null, p_id uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with items as (
    select 'soat'::text as kind, s.id, s.plate, s.end_date as expiry, s.contact_id, s.owner_name, s.owner_phone,
           s.insurer as extra, s.client_reminders_sent as sent
    from crm_soat s
    where not exists (select 1 from crm_soat n where n.plate = s.plate and n.end_date > s.end_date)
    union all
    select 'rtm', r.id, r.plate, r.expiry_date, r.contact_id, null, null, r.center_name, r.client_reminders_sent
    from crm_rtm r
    where not exists (select 1 from crm_rtm n where n.plate = r.plate and n.expiry_date > r.expiry_date)
  ), due as (
    select i.*, i.expiry - crm_today() as days_left,
      (select min(d) from unnest(array[30, 15, 3]) d where i.expiry - crm_today() <= d and not (d = any (i.sent))) as threshold
    from items i
    where i.expiry is not null
      and (p_id is not null or i.expiry between crm_today() and crm_today() + 30)
      and (p_kind is null or i.kind = p_kind)
      and (p_id is null or i.id = p_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'kind', d.kind, 'id', d.id, 'plate', d.plate, 'expiry', d.expiry, 'days_left', d.days_left,
      'threshold', coalesce(d.threshold, 0), 'extra', d.extra, 'contact_id', c.id,
      -- el tomador del SOAT primero: un mismo celular puede ser de varias personas/empresas
      'name', coalesce(nullif(d.owner_name, ''), nullif(c.name, ''), c.wa_name),
      'phone', coalesce(c.phone, crm_norm_phone(d.owner_phone)),
      'email', nullif(btrim(c.email), ''),
      'opt_out', coalesce(c.notify_opt_out, false)) order by d.expiry), '[]'::jsonb)
  from due d
  left join crm_contacts c on c.id = d.contact_id
  where p_id is not null or (d.threshold is not null and not coalesce(c.notify_opt_out, false))
$$;

create or replace function crm_vehicle_mark(p_kind text, p_id uuid, p_threshold int)
returns void language plpgsql security definer set search_path = public as $$
declare v int[] := array(select d from unnest(array[30, 15, 3]) d where d >= p_threshold);
begin
  if p_kind = 'soat' then
    update crm_soat set client_reminders_sent = array(select distinct unnest(client_reminders_sent || v)) where id = p_id;
  elsif p_kind = 'rtm' then
    update crm_rtm set client_reminders_sent = array(select distinct unnest(client_reminders_sent || v)) where id = p_id;
  end if;
end $$;

revoke all on function crm_vehicle_due(text, uuid) from public, anon, authenticated;
revoke all on function crm_vehicle_mark(text, uuid, int) from public, anon, authenticated;
grant execute on function crm_vehicle_due(text, uuid) to service_role;
grant execute on function crm_vehicle_mark(text, uuid, int) to service_role;
grant execute on function crm_notify(text, text, text, text) to service_role;  -- resumen push del envío

-- Llamada diaria al servidor del sitio (que envía correo y WhatsApp)
create or replace function crm_vehicle_notify_run() returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_base text; v_secret text;
begin
  select regexp_replace(value, '/api/.*$', '') into v_base from crm_private_config where key = 'push_url';
  select value into v_secret from crm_private_config where key = 'push_secret';
  if v_base is null or v_secret is null then raise warning 'crm_vehicle_notify_run: falta push_url/push_secret'; return; end if;
  perform net.http_post(
    url := v_base || '/api/crm/vehicles/notify',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 60000);
end $$;
revoke all on function crm_vehicle_notify_run() from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'crm-vehicle-notify';
  perform cron.schedule('crm-vehicle-notify', '0 14 * * *', 'select crm_vehicle_notify_run()');
exception when others then
  raise notice 'No se pudo programar pg_cron (%). Actívalo en Database → Extensions y vuelve a correr este archivo.', sqlerrm;
end $$;
