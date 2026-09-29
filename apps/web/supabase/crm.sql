-- CRM + agenda de asesorías de Mazoseguros.
-- Ejecutar en el SQL Editor del MISMO proyecto de Supabase que usa el sitio
-- (el panel /admin lee de aquí con la sesión del admin). Se puede correr más
-- de una vez: todo usa "if not exists" / "or replace".
--
-- Quién escribe qué:
--   - n8n (WhatsApp vía Gupshup) usa la service_role key → se salta RLS y llama
--     las funciones crm_log_inbound / crm_log_outbound / crm_update_status.
--   - El admin autenticado (/admin) lee y edita todo.
--   - Los visitantes del sitio solo pueden crear quote_requests (ya existía);
--     un trigger convierte cada cotización en contacto del CRM.

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- ───────────────────────── Contactos ─────────────────────────
create table if not exists crm_contacts (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,               -- solo dígitos, con indicativo: 573001234567
  name text,                                -- nombre editable por el asesor
  wa_name text,                             -- nombre del perfil de WhatsApp (lo pone n8n)
  email text,
  source text not null default 'whatsapp',  -- whatsapp | web | manual
  status text not null default 'nuevo'
    check (status in ('nuevo', 'en_conversacion', 'cotizando', 'cliente', 'perdido')),
  interest text,                            -- auto | propiedades | salud | obras-civiles | otro
  notes text,
  last_message_at timestamptz,
  unread_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists crm_contacts_last_msg_idx on crm_contacts (last_message_at desc nulls last);

-- ───────────────────────── Mensajes ─────────────────────────
create table if not exists crm_messages (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  direction text not null check (direction in ('in', 'out')),
  channel text not null default 'whatsapp',
  wa_message_id text unique,                -- id de WhatsApp, evita duplicados si Gupshup reintenta
  type text not null default 'text',        -- text | image | audio | document | interactive | ...
  body text,
  status text,                              -- received | submitted | sent | delivered | read | failed
  sent_by text,                             -- bot | nombre del asesor
  raw jsonb,
  created_at timestamptz not null default now()
);
create index if not exists crm_messages_contact_idx on crm_messages (contact_id, created_at);

-- ───────────────────────── Agenda ─────────────────────────
-- Una sola fila con el horario de atención para asesorías.
create table if not exists crm_agenda_config (
  id int primary key default 1 check (id = 1),
  timezone text not null default 'America/Bogota',
  work_days int[] not null default '{1,2,3,4,5}',   -- ISO: 1 = lunes … 7 = domingo
  start_time time not null default '08:00',
  end_time time not null default '17:00',
  break_start time default '12:00',                 -- almuerzo (null = sin pausa)
  break_end time default '13:00',
  slot_minutes int not null default 30 check (slot_minutes between 10 and 240),
  min_notice_minutes int not null default 120,      -- no ofrecer citas con menos de 2 h de anticipación
  updated_at timestamptz not null default now()
);
insert into crm_agenda_config (id) values (1) on conflict (id) do nothing;

create table if not exists crm_appointments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references crm_contacts(id) on delete set null,
  contact_name text,                         -- copia por si el contacto no existe aún
  contact_phone text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  topic text,                                -- auto | propiedades | salud | obras-civiles | otro
  modality text not null default 'llamada' check (modality in ('llamada', 'videollamada', 'presencial')),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'confirmada', 'realizada', 'cancelada', 'no_asistio')),
  notes text,
  created_by text not null default 'admin',  -- admin | bot | web
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- Nunca dos citas activas que se crucen (las canceladas no cuentan)
  constraint crm_appointments_no_overlap exclude using gist (
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pendiente', 'confirmada'))
);
create index if not exists crm_appointments_starts_idx on crm_appointments (starts_at);

-- updated_at automático
create or replace function crm_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists crm_contacts_touch on crm_contacts;
create trigger crm_contacts_touch before update on crm_contacts
  for each row execute function crm_touch_updated_at();
drop trigger if exists crm_appointments_touch on crm_appointments;
create trigger crm_appointments_touch before update on crm_appointments
  for each row execute function crm_touch_updated_at();

-- ───────────────────────── RLS ─────────────────────────
alter table crm_contacts enable row level security;
alter table crm_messages enable row level security;
alter table crm_agenda_config enable row level security;
alter table crm_appointments enable row level security;

drop policy if exists "admin all crm_contacts" on crm_contacts;
create policy "admin all crm_contacts" on crm_contacts
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "admin all crm_messages" on crm_messages;
create policy "admin all crm_messages" on crm_messages
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "admin all crm_agenda_config" on crm_agenda_config;
create policy "admin all crm_agenda_config" on crm_agenda_config
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "admin all crm_appointments" on crm_appointments;
create policy "admin all crm_appointments" on crm_appointments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ───────────────────────── Funciones para n8n ─────────────────────────
-- Solo las puede ejecutar la service_role (n8n) y el admin autenticado; el
-- público (anon) no.

-- Mensaje entrante: crea/actualiza el contacto y guarda el mensaje en una sola llamada.
create or replace function crm_log_inbound(
  p_phone text,
  p_wa_name text default null,
  p_body text default null,
  p_type text default 'text',
  p_wa_message_id text default null,
  p_raw jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_contact uuid;
begin
  if v_phone = '' then raise exception 'phone vacío'; end if;

  insert into crm_contacts (phone, wa_name, name, source, status, last_message_at, unread_count)
  values (v_phone, p_wa_name, p_wa_name, 'whatsapp', 'nuevo', now(), 1)
  on conflict (phone) do update set
    wa_name = coalesce(excluded.wa_name, crm_contacts.wa_name),
    name = coalesce(crm_contacts.name, excluded.wa_name),
    status = case when crm_contacts.status = 'nuevo' then 'en_conversacion' else crm_contacts.status end,
    last_message_at = now(),
    unread_count = crm_contacts.unread_count + 1
  returning id into v_contact;

  insert into crm_messages (contact_id, direction, wa_message_id, type, body, status, raw)
  values (v_contact, 'in', nullif(p_wa_message_id, ''), coalesce(p_type, 'text'), p_body, 'received', p_raw)
  on conflict (wa_message_id) do nothing;

  return v_contact;
end $$;

-- Mensaje saliente (bot o asesor): lo registra en la conversación.
create or replace function crm_log_outbound(
  p_phone text,
  p_body text,
  p_wa_message_id text default null,
  p_sent_by text default 'bot',
  p_status text default 'submitted',
  p_raw jsonb default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_contact uuid;
begin
  insert into crm_contacts (phone, source, last_message_at)
  values (v_phone, 'whatsapp', now())
  on conflict (phone) do update set last_message_at = now()
  returning id into v_contact;

  insert into crm_messages (contact_id, direction, wa_message_id, type, body, status, sent_by, raw)
  values (v_contact, 'out', nullif(p_wa_message_id, ''), 'text', p_body, p_status, p_sent_by, p_raw)
  on conflict (wa_message_id) do nothing;

  return v_contact;
end $$;

-- Estados de entrega (sent / delivered / read / failed) que manda Gupshup.
-- p_alt_id: Gupshup a veces identifica el mensaje con su propio id (gs_id)
-- en vez del id de WhatsApp; se busca por cualquiera de los dos.
drop function if exists crm_update_status(text, text);
create or replace function crm_update_status(p_wa_message_id text, p_status text, p_alt_id text default null)
returns void language sql security definer set search_path = public as $$
  update crm_messages set status = p_status
  where wa_message_id in (p_wa_message_id, p_alt_id)
    -- no retroceder: read no vuelve a delivered si los eventos llegan en desorden
    and coalesce(array_position(array['submitted','sent','delivered','read'], status), 0)
        < coalesce(array_position(array['submitted','sent','delivered','read'], p_status), 99);
$$;

-- Horarios libres de un día (para el admin y, más adelante, para que BotMazo ofrezca citas).
create or replace function crm_available_slots(p_day date)
returns table (starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare c crm_agenda_config;
begin
  select * into c from crm_agenda_config where id = 1;
  if not (extract(isodow from p_day)::int = any (c.work_days)) then return; end if;

  return query
  with slots as (
    select
      t::timestamp at time zone c.timezone as s,
      (t + make_interval(mins => c.slot_minutes))::timestamp at time zone c.timezone as e,
      t::time as ts,
      (t + make_interval(mins => c.slot_minutes))::time as te
    from generate_series(
      p_day + c.start_time,
      p_day + c.end_time - make_interval(mins => c.slot_minutes),
      make_interval(mins => c.slot_minutes)
    ) as t
  )
  select slots.s, slots.e from slots
  where (c.break_start is null or not (slots.ts < c.break_end and slots.te > c.break_start))
    and slots.s >= now() + make_interval(mins => c.min_notice_minutes)
    and not exists (
      select 1 from crm_appointments a
      where a.status in ('pendiente', 'confirmada')
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(slots.s, slots.e)
    )
  order by slots.s;
end $$;

revoke all on function crm_log_inbound(text, text, text, text, text, jsonb) from public, anon;
revoke all on function crm_log_outbound(text, text, text, text, text, jsonb) from public, anon;
revoke all on function crm_update_status(text, text, text) from public, anon;
revoke all on function crm_available_slots(date) from public, anon;
grant execute on function crm_log_inbound(text, text, text, text, text, jsonb) to authenticated, service_role;
grant execute on function crm_log_outbound(text, text, text, text, text, jsonb) to authenticated, service_role;
grant execute on function crm_update_status(text, text, text) to authenticated, service_role;
grant execute on function crm_available_slots(date) to authenticated, service_role;

-- ───────────── Cotizaciones de la web → contactos del CRM ─────────────
create or replace function crm_contact_from_quote() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_phone text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
begin
  if v_phone = '' then return new; end if;
  -- números de 10 dígitos de Colombia sin indicativo → se agrega 57
  if length(v_phone) = 10 and left(v_phone, 1) = '3' then v_phone := '57' || v_phone; end if;

  insert into crm_contacts (phone, name, source, status, interest, notes)
  values (v_phone, new.name, 'web', 'cotizando', new.category, new.message)
  on conflict (phone) do update set
    name = coalesce(crm_contacts.name, excluded.name),
    interest = coalesce(excluded.interest, crm_contacts.interest),
    status = case when crm_contacts.status in ('nuevo', 'en_conversacion') then 'cotizando' else crm_contacts.status end;
  return new;
end $$;

drop trigger if exists quote_requests_to_crm on quote_requests;
create trigger quote_requests_to_crm after insert on quote_requests
  for each row execute function crm_contact_from_quote();
