-- Notificaciones push del admin (app instalable) de Mazoseguros.
-- Ejecutar DESPUÉS de crm.sql y crm_bot.sql. Se puede correr varias veces.
--
-- Cómo funciona:
--   1. Cada celular/PC donde actives "🔔 Notificaciones" en /admin guarda su suscripción aquí.
--   2. Cuando pasa algo importante (piden asesor, te escriben en modo asesor, agendan
--      una cita o llega una cotización de la web), un trigger llama a
--      https://mazoseguros.com/api/push/send con pg_net, y esa ruta envía el push.
--   3. Los triggers NUNCA bloquean el guardado de mensajes: si falla el aviso, se ignora.

create extension if not exists pg_net;

-- ───────────── Suscripciones de los dispositivos ─────────────
create table if not exists crm_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_email text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table crm_push_subscriptions enable row level security;
drop policy if exists "admin all crm_push_subscriptions" on crm_push_subscriptions;
create policy "admin all crm_push_subscriptions" on crm_push_subscriptions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ───────────── Configuración privada (sin políticas: solo funciones internas la leen) ─────────────
create table if not exists crm_private_config (
  key text primary key,
  value text not null
);
alter table crm_private_config enable row level security;
-- Llenar una vez (reemplaza los valores; el secreto es el mismo PUSH_SECRET de Hostinger):
--   insert into crm_private_config (key, value) values
--     ('push_url', 'https://mazoseguros.com/api/push/send'),
--     ('push_secret', 'EL_MISMO_PUSH_SECRET')
--   on conflict (key) do update set value = excluded.value;

-- ───────────── Enviar un aviso ─────────────
create or replace function crm_notify(p_title text, p_body text, p_url text default '/admin', p_tag text default null)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from crm_private_config where key = 'push_url';
  select value into v_secret from crm_private_config where key = 'push_secret';
  if v_url is null or v_secret is null then return; end if;
  if not exists (select 1 from crm_push_subscriptions) then return; end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('title', p_title, 'body', left(coalesce(p_body, ''), 180), 'url', p_url, 'tag', p_tag),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 5000
  );
exception when others then
  -- pg_net no disponible o error de red: nunca romper el flujo principal
  raise warning 'crm_notify falló: %', sqlerrm;
end $$;

revoke all on function crm_notify(text, text, text, text) from public, anon, authenticated;

create or replace function crm_contact_label(c crm_contacts) returns text language sql immutable as $$
  select coalesce(nullif(c.name, ''), nullif(c.wa_name, ''), '+' || c.phone)
$$;

-- 1) Piden hablar con un asesor (el bot pone bot_state = 'asesor')
create or replace function crm_trg_contact_asesor() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- bot_data.taken_by = el asesor tomó la conversación desde /admin (no avisarse a sí mismo)
  if new.bot_state = 'asesor' and old.bot_state is distinct from 'asesor' and not (new.bot_data ? 'taken_by') then
    perform crm_notify('🙋 ' || crm_contact_label(new) || ' quiere hablar con un asesor',
                       coalesce('Interés: ' || new.interest, 'Toca para abrir la conversación'),
                       '/admin?contact=' || new.id, 'contact-' || new.id);
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists crm_contacts_notify_asesor on crm_contacts;
create trigger crm_contacts_notify_asesor after update of bot_state on crm_contacts
  for each row execute function crm_trg_contact_asesor();

-- 2) Mensaje entrante de alguien que está en modo asesor (el bot no le responde)
create or replace function crm_trg_message_in() returns trigger
language plpgsql security definer set search_path = public as $$
declare c crm_contacts;
begin
  if new.direction <> 'in' then return new; end if;
  select * into c from crm_contacts where id = new.contact_id;
  if c.bot_state = 'asesor' and c.bot_updated_at > now() - interval '12 hours' then
    perform crm_notify('💬 ' || crm_contact_label(c),
                       coalesce(new.body, '[' || new.type || ']'),
                       '/admin?contact=' || c.id, 'contact-' || c.id);
  end if;
  return new;
exception when others then return new;
end $$;
drop trigger if exists crm_messages_notify_in on crm_messages;
create trigger crm_messages_notify_in after insert on crm_messages
  for each row execute function crm_trg_message_in();

-- 3) Cita nueva (del bot o de la web)
create or replace function crm_trg_appointment_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare tz text := coalesce((select timezone from crm_agenda_config where id = 1), 'America/Bogota');
begin
  if new.created_by = 'admin' then return new; end if;  -- las que creas tú no necesitan aviso
  perform crm_notify('📅 Nueva asesoría: ' || coalesce(new.contact_name, 'Cliente'),
                     crm_fmt_day((new.starts_at at time zone tz)::date) || ' · ' || crm_fmt_time(new.starts_at, tz) ||
                       coalesce(' · ' || (crm_topic_info(new.topic) ->> 'title'), '') || ' · ' || new.modality,
                     '/admin?tab=agenda', 'appt-' || new.id);
  return new;
exception when others then return new;
end $$;
drop trigger if exists crm_appointments_notify_new on crm_appointments;
create trigger crm_appointments_notify_new after insert on crm_appointments
  for each row execute function crm_trg_appointment_new();

-- 4) Cotización desde el formulario de la web
create or replace function crm_trg_quote_new() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform crm_notify('📝 Cotización web: ' || coalesce(new.name, 'Sin nombre'),
                     coalesce(new.category, '') || coalesce(' · ' || new.message, ''),
                     '/admin?tab=cotizaciones', 'quote-' || new.id);
  return new;
exception when others then return new;
end $$;
drop trigger if exists quote_requests_notify on quote_requests;
create trigger quote_requests_notify after insert on quote_requests
  for each row execute function crm_trg_quote_new();
