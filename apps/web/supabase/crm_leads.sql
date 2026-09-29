-- Leads: registra cada vez que alguien INICIA una conversación y de dónde vino.
-- Ejecutar DESPUÉS de crm.sql, crm_bot.sql y crm_push.sql. Se puede correr varias veces.
--
-- No requiere cambios en n8n: crm_log_inbound ya guarda el mensaje completo de
-- WhatsApp en crm_messages.raw, y de ahí se lee el origen:
--   · anuncio      → el mensaje trae "referral" (anuncio de Facebook/Instagram "Click to WhatsApp")
--   · sitio_web    → el texto es uno de los mensajes precargados de los botones de mazoseguros.com
--   · formulario   → alguien llenó el formulario de cotización de la web (quote_requests)
--   · whatsapp     → escribió directo, sin venir de la web ni de un anuncio
-- Un contacto que vuelve a escribir después de 30 días sin conversar cuenta como lead nuevo.

create table if not exists crm_leads (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  source text not null check (source in ('sitio_web', 'anuncio', 'formulario', 'whatsapp', 'manual')),
  detail text,                 -- página/anuncio/botón que lo originó
  interest text,               -- auto | salud | vida | propiedades | obras-civiles | otro
  first_message text,
  referral jsonb,              -- datos del anuncio (source_url, headline, ctwa_clid…)
  status text not null default 'nuevo'
    check (status in ('nuevo', 'contactado', 'cotizado', 'ganado', 'perdido')),
  created_at timestamptz not null default now()
);
create index if not exists crm_leads_created_idx on crm_leads (created_at desc);
create index if not exists crm_leads_contact_idx on crm_leads (contact_id, created_at desc);

alter table crm_leads enable row level security;
drop policy if exists "admin all crm_leads" on crm_leads;
create policy "admin all crm_leads" on crm_leads
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Origen del último lead, para mostrarlo rápido en la lista del CRM
alter table crm_contacts add column if not exists lead_source text;

-- ¿El texto es uno de los mensajes precargados del sitio web?
create or replace function crm_is_web_message(p text) returns boolean language sql immutable as $$
  select crm_norm(p) ~ '^hola quiero cotizar un seguro'      -- botón flotante y tarjetas de seguros
      or crm_norm(p) ~ 'vengo del sitio web de mazoseguros'  -- botones del encabezado, portada y contacto
$$;

create or replace function crm_lead_labels(p_source text) returns text language sql immutable as $$
  select case p_source
    when 'sitio_web' then 'sitio web' when 'anuncio' then 'anuncio' when 'formulario' then 'formulario web'
    when 'whatsapp' then 'WhatsApp directo' else p_source end
$$;

-- Crea un lead si este mensaje abre una conversación nueva
create or replace function crm_trg_lead_from_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  c crm_contacts;
  v_prev timestamptz;
  v_msg jsonb;
  v_ref jsonb;
  v_source text;
  v_detail text;
  v_interest text;
begin
  if new.direction <> 'in' then return new; end if;

  select max(created_at) into v_prev from crm_messages
  where contact_id = new.contact_id and direction = 'in' and id <> new.id;
  if v_prev is not null and v_prev > now() - interval '30 days' then return new; end if;

  select * into c from crm_contacts where id = new.contact_id;
  v_msg := new.raw -> 'entry' -> 0 -> 'changes' -> 0 -> 'value' -> 'messages' -> 0;
  v_ref := v_msg -> 'referral';

  if v_ref is not null then
    v_source := 'anuncio';
    v_detail := coalesce(v_ref ->> 'headline', v_ref ->> 'body', v_ref ->> 'source_url', 'Anuncio');
  elsif crm_is_web_message(new.body) then
    v_source := 'sitio_web';
    v_detail := 'Botón de WhatsApp en mazoseguros.com';
  else
    v_source := 'whatsapp';
  end if;
  v_interest := coalesce(crm_detect_topic(crm_norm(new.body)),
                         crm_detect_topic(crm_norm(concat_ws(' ', v_ref ->> 'headline', v_ref ->> 'body'))),
                         c.interest);

  insert into crm_leads (contact_id, source, detail, interest, first_message, referral)
  values (c.id, v_source, v_detail, v_interest, left(new.body, 500), v_ref);

  update crm_contacts set
    lead_source = v_source,
    interest = coalesce(interest, v_interest)
  where id = c.id;

  perform crm_notify('🆕 Nuevo lead (' || crm_lead_labels(v_source) || '): ' || crm_contact_label(c),
                     coalesce(crm_topic_info(v_interest) ->> 'title' || ' · ', '') || coalesce(left(new.body, 120), ''),
                     '/admin?contact=' || c.id, 'lead-' || c.id);
  return new;
exception when others then
  raise warning 'crm_trg_lead_from_message: %', sqlerrm;
  return new;   -- nunca bloquear el guardado del mensaje
end $$;

drop trigger if exists crm_messages_lead on crm_messages;
create trigger crm_messages_lead after insert on crm_messages
  for each row execute function crm_trg_lead_from_message();

-- Formulario de cotización de la web → lead "formulario"
-- (corre después del trigger que crea/actualiza el contacto: los triggers AFTER van en orden alfabético)
create or replace function crm_trg_lead_from_quote() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(new.phone, ''), '\D', '', 'g');
  v_contact uuid;
begin
  if length(v_phone) = 10 and left(v_phone, 1) = '3' then v_phone := '57' || v_phone; end if;
  select id into v_contact from crm_contacts where phone = v_phone;
  if v_contact is null then return new; end if;
  insert into crm_leads (contact_id, source, detail, interest, first_message)
  values (v_contact, 'formulario', 'Formulario de cotización', new.category, left(new.message, 500));
  update crm_contacts set lead_source = 'formulario' where id = v_contact;
  return new;
exception when others then return new;
end $$;

drop trigger if exists quote_requests_to_lead on quote_requests;
create trigger quote_requests_to_lead after insert on quote_requests
  for each row execute function crm_trg_lead_from_quote();
