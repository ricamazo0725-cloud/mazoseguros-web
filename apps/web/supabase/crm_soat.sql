-- SOAT + modo asesor de BotMazo.
-- Ejecutar DESPUÉS de crm.sql, crm_bot.sql, crm_push.sql, crm_policies.sql y crm_leads.sql.
-- Se puede correr varias veces. Luego vuelve a correr crm_bot.sql y crm_leads.sql (traen el
-- enganche al modo asesor).
--
-- Cómo funciona:
--   · Los números de crm_advisors le escriben a la línea de WhatsApp del bot y BotMazo los
--     atiende en "modo asesor" (no les muestra el menú de clientes).
--   · El asesor manda la FOTO (o PDF) de un SOAT → mazoseguros.com/api/crm/media/ingest la
--     guarda, la lee con IA (Gemini) y llama crm_soat_save() → el bot responde con los datos.
--   · El asesor consulta: una placa (ABC123), una cédula, "vencen", "vencidos", "ayuda".
--   · Todos los días a las 8 a. m. (Colombia) crm_soat_daily() avisa los SOAT que vencen en
--     30, 15, 5, 1 y 0 días: aviso push al admin + WhatsApp a los asesores.
-- El SOAT va en su propia tabla (crm_soat), separado de crm_policies, aunque el cliente
-- también tenga póliza de autos.

-- ───────────── Asesores ─────────────
create table if not exists crm_advisors (
  phone text primary key,              -- 57 + 10 dígitos
  name text,
  active boolean not null default true,
  client_mode_until timestamptz,       -- "modo cliente": prueba el bot como cliente por 2 h
  created_at timestamptz not null default now()
);
alter table crm_advisors enable row level security;
drop policy if exists "admin all crm_advisors" on crm_advisors;
create policy "admin all crm_advisors" on crm_advisors
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

insert into crm_advisors (phone) values ('573107008875'), ('573012748799'), ('573103897969')
on conflict (phone) do nothing;

create or replace function crm_is_advisor(p_phone text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from crm_advisors where phone = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') and active)
$$;

-- ───────────── SOAT ─────────────
create table if not exists crm_soat (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references crm_contacts(id) on delete set null,
  plate text not null,                 -- placa normalizada: ABC123 / ABC12D
  vehicle_class text,                  -- automóvil, motocicleta, camioneta…
  brand text,
  model_line text,
  model_year int,
  service text,                        -- particular / público
  owner_name text,                     -- tomador
  owner_doc_type text,
  owner_doc text,
  owner_phone text,
  owner_city text,
  insurer text,
  policy_number text,
  start_date date,
  end_date date,
  premium numeric,
  image_path text,                     -- archivo en el bucket crm-media
  message_id uuid references crm_messages(id) on delete set null,
  extracted jsonb,                     -- lo que leyó la IA, tal cual
  notes text,
  reminders_sent int[] not null default '{}',  -- días antes del vencimiento ya avisados
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists crm_soat_plate_end_uidx on crm_soat (plate, end_date);
create index if not exists crm_soat_end_idx on crm_soat (end_date);
create index if not exists crm_soat_doc_idx on crm_soat (owner_doc);
create index if not exists crm_soat_contact_idx on crm_soat (contact_id);

alter table crm_soat enable row level security;
drop policy if exists "admin all crm_soat" on crm_soat;
create policy "admin all crm_soat" on crm_soat
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create or replace function crm_plate_norm(p text) returns text language sql immutable as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g')), '')
$$;

create or replace function crm_norm_phone(p text) returns text language sql immutable as $$
  select case
    when d is null then null
    when length(d) = 10 and left(d, 1) = '3' then '57' || d
    else d end
  from (select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '') as d) t
$$;

create or replace function crm_norm_doc(p text) returns text language sql immutable as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g')), '')
$$;

create or replace function crm_today() returns date language sql stable as $$
  select (now() at time zone 'America/Bogota')::date
$$;

-- Estado calculado: renovado si hay un SOAT posterior de la misma placa
drop view if exists crm_soat_view;  -- se recrea (s.* cambia si se agregan columnas)
create or replace view crm_soat_view with (security_invoker = true) as
select s.*,
  coalesce(nullif(c.name, ''), c.wa_name) as contact_name,
  c.phone as contact_phone,
  s.end_date - crm_today() as days_left,
  case
    when exists (select 1 from crm_soat n where n.plate = s.plate and n.end_date > s.end_date) then 'renovado'
    when s.end_date is null then 'sin_fecha'
    when s.end_date < crm_today() then 'vencido'
    when s.end_date - crm_today() <= 30 then 'por_vencer'
    else 'vigente' end as computed_status
from crm_soat s
left join crm_contacts c on c.id = s.contact_id;

create or replace function crm_fmt_date(d date) returns text language sql immutable as $$
  select to_char(d, 'DD/MM/YYYY')
$$;

create or replace function crm_soat_days_text(d date) returns text language sql stable as $$
  select case
    when d is null then 'sin fecha de vencimiento'
    when d - crm_today() < -1 then 'venció hace ' || (crm_today() - d) || ' días'
    when d - crm_today() = -1 then 'venció ayer'
    when d - crm_today() = 0 then 'vence HOY'
    when d - crm_today() = 1 then 'vence mañana'
    else 'vence en ' || (d - crm_today()) || ' días' end
$$;

-- Ficha de un SOAT en texto para WhatsApp
create or replace function crm_soat_text(s crm_soat) returns text language sql stable as $$
  select concat_ws(E'\n',
    '🚗 *' || s.plate || '*' || coalesce(' · ' || nullif(concat_ws(' ', s.vehicle_class, s.brand, s.model_line, s.model_year::text), ''), ''),
    '👤 ' || coalesce(s.owner_name, '(sin tomador)') || coalesce(' · ' || nullif(concat_ws(' ', s.owner_doc_type, s.owner_doc), ''), '')
      || coalesce(' · +' || s.owner_phone, ''),
    '🏢 ' || coalesce(s.insurer, '(sin aseguradora)') || coalesce(' · Póliza ' || s.policy_number, ''),
    '📅 ' || coalesce(crm_fmt_date(s.start_date), '?') || ' → ' || coalesce(crm_fmt_date(s.end_date), '?')
      || ' (' || crm_soat_days_text(s.end_date) || ')',
    case when s.premium is not null then '💰 $ ' || replace(to_char(s.premium, 'FM999,999,999'), ',', '.') end
  )
$$;

-- Lo vinculado al cliente: por documento, luego teléfono; si no existe se crea
create or replace function crm_soat_link_contact(s crm_soat) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid; v_phone text := crm_norm_phone(s.owner_phone);
begin
  if s.owner_doc is not null then select id into v from crm_contacts where doc_number = s.owner_doc; end if;
  if v is null and v_phone is not null then select id into v from crm_contacts where phone = v_phone; end if;
  if v is null and s.owner_name is not null and (s.owner_doc is not null or v_phone is not null) then
    insert into crm_contacts (name, phone, doc_type, doc_number, city, interest, source, status, lead_source)
    values (s.owner_name, v_phone, s.owner_doc_type, s.owner_doc, s.owner_city, 'auto', 'soat', 'cliente', 'manual')
    returning id into v;
  elsif v is not null then
    update crm_contacts set
      doc_number = coalesce(doc_number, s.owner_doc),
      doc_type = coalesce(doc_type, s.owner_doc_type),
      phone = coalesce(phone, v_phone),
      city = coalesce(city, s.owner_city),
      interest = coalesce(interest, 'auto'),
      status = case when status in ('nuevo', 'en_conversacion', 'cotizando') then 'cliente' else status end
    where id = v;
  end if;
  return v;
exception when unique_violation then
  return null;  -- el teléfono/documento ya es de otro contacto: no se vincula
end $$;

-- Guarda (o actualiza) un SOAT a partir de lo que leyó la IA de la foto.
-- p_data: { es_soat, placa, clase, marca, linea, modelo, servicio, tomador, tipo_documento, documento,
--           telefono, ciudad, aseguradora, numero_poliza, inicio_vigencia, fin_vigencia, valor }
-- Devuelve { ok, id, text } — text es la respuesta para el asesor.
create or replace function crm_soat_save(p_data jsonb, p_advisor text default null, p_image_path text default null,
                                         p_message_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s crm_soat;
  v_plate text := crm_plate_norm(p_data ->> 'placa');
  v_end date; v_start date; v_id uuid; v_new boolean;
  v_year int;
  v_warn text := '';
begin
  if coalesce(p_data ->> 'es_soat', 'true') = 'false' then
    return jsonb_build_object('ok', false, 'text',
      'Esa imagen no parece un SOAT 🤔 Mándame una foto clara del SOAT (o el PDF) y lo guardo.');
  end if;
  if v_plate is null then
    return jsonb_build_object('ok', false, 'text',
      'No pude leer la placa en la imagen 😕 Intenta con una foto más clara, sin reflejos y con todo el documento.');
  end if;

  begin v_start := crm_parse_date(p_data ->> 'inicio_vigencia'); exception when others then v_start := null; end;
  begin v_end := crm_parse_date(p_data ->> 'fin_vigencia'); exception when others then v_end := null; end;
  if v_end is null and v_start is not null then
    v_end := (v_start + interval '1 year' - interval '1 day')::date;
    v_warn := v_warn || E'\n⚠ No se leía la fecha final; la calculé a un año del inicio.';
  end if;
  begin v_year := nullif(regexp_replace(coalesce(p_data ->> 'modelo', ''), '\D', '', 'g'), '')::int;
  exception when others then v_year := null; end;
  if v_year is not null and (v_year < 1950 or v_year > 2100) then v_year := null; end if;

  select id into v_id from crm_soat where plate = v_plate and end_date is not distinct from v_end;
  v_new := v_id is null;

  if v_new then
    insert into crm_soat (plate, vehicle_class, brand, model_line, model_year, service, owner_name, owner_doc_type,
                          owner_doc, owner_phone, owner_city, insurer, policy_number, start_date, end_date, premium,
                          image_path, message_id, extracted, created_by)
    values (v_plate, nullif(btrim(p_data ->> 'clase'), ''), nullif(btrim(p_data ->> 'marca'), ''),
            nullif(btrim(p_data ->> 'linea'), ''), v_year, nullif(btrim(p_data ->> 'servicio'), ''),
            nullif(btrim(p_data ->> 'tomador'), ''), nullif(upper(btrim(p_data ->> 'tipo_documento')), ''),
            crm_norm_doc(p_data ->> 'documento'), crm_norm_phone(p_data ->> 'telefono'), nullif(btrim(p_data ->> 'ciudad'), ''),
            nullif(btrim(p_data ->> 'aseguradora'), ''), nullif(btrim(p_data ->> 'numero_poliza'), ''), v_start, v_end,
            nullif(regexp_replace(coalesce(p_data ->> 'valor', ''), '[^0-9]', '', 'g'), '')::numeric,
            p_image_path, p_message_id, p_data, p_advisor)
    returning * into s;
  else
    update crm_soat set
      vehicle_class = coalesce(nullif(btrim(p_data ->> 'clase'), ''), vehicle_class),
      brand = coalesce(nullif(btrim(p_data ->> 'marca'), ''), brand),
      model_line = coalesce(nullif(btrim(p_data ->> 'linea'), ''), model_line),
      model_year = coalesce(v_year, model_year),
      service = coalesce(nullif(btrim(p_data ->> 'servicio'), ''), service),
      owner_name = coalesce(nullif(btrim(p_data ->> 'tomador'), ''), owner_name),
      owner_doc_type = coalesce(nullif(upper(btrim(p_data ->> 'tipo_documento')), ''), owner_doc_type),
      owner_doc = coalesce(crm_norm_doc(p_data ->> 'documento'), owner_doc),
      owner_phone = coalesce(crm_norm_phone(p_data ->> 'telefono'), owner_phone),
      owner_city = coalesce(nullif(btrim(p_data ->> 'ciudad'), ''), owner_city),
      insurer = coalesce(nullif(btrim(p_data ->> 'aseguradora'), ''), insurer),
      policy_number = coalesce(nullif(btrim(p_data ->> 'numero_poliza'), ''), policy_number),
      start_date = coalesce(v_start, start_date),
      premium = coalesce(nullif(regexp_replace(coalesce(p_data ->> 'valor', ''), '[^0-9]', '', 'g'), '')::numeric, premium),
      image_path = coalesce(p_image_path, image_path),
      message_id = coalesce(p_message_id, message_id),
      extracted = p_data,
      updated_at = now()
    where id = v_id
    returning * into s;
  end if;

  update crm_soat set contact_id = coalesce(contact_id, crm_soat_link_contact(s)) where id = s.id returning * into s;

  if v_end is null then v_warn := v_warn || E'\n⚠ No pude leer la fecha de vencimiento. Escríbela así: *fecha ' || v_plate || ' 31/12/2026*'; end if;
  if s.owner_phone is null then v_warn := v_warn || E'\n📱 Sin celular del cliente. Agrégalo: *tel ' || v_plate || ' 3001234567*'; end if;

  return jsonb_build_object('ok', true, 'id', s.id, 'new', v_new, 'text',
    case when v_new then '✅ SOAT guardado' else '🔄 Ese SOAT ya estaba; lo actualicé' end || E'\n\n' ||
    crm_soat_text(s) || v_warn ||
    case when v_end is not null and v_end >= crm_today() then E'\n\n🔔 Te aviso 30, 15, 5 y 1 día antes de que venza.' else '' end ||
    E'\n\nSi algo quedó mal: *fecha ' || v_plate || ' DD/MM/AAAA* · *tel ' || v_plate || ' 300…*');
end $$;

-- Lista corta de SOAT para WhatsApp
create or replace function crm_soat_list_text(p_title text, p_rows crm_soat[]) returns text language sql stable as $$
  select case when coalesce(array_length(p_rows, 1), 0) = 0 then p_title || E'\n\n(ninguno)'
    else p_title || E'\n' || string_agg(
      '• *' || r.plate || '* · ' || coalesce(r.owner_name, '?') || ' · ' || coalesce(crm_fmt_date(r.end_date), '?')
        || ' (' || crm_soat_days_text(r.end_date) || ')' || coalesce(' · +' || r.owner_phone, ''),
      E'\n' order by r.end_date) end
  from unnest(p_rows) r
$$;

-- ───────────── Modo asesor del bot ─────────────
create or replace function crm_advisor_step(p_phone text, p_text text default null, p_reply_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  ct crm_contacts;
  v_raw text := btrim(coalesce(p_text, ''));
  v_in text := crm_norm(coalesce(nullif(p_reply_id, ''), p_text));
  v_last_type text;
  v_out jsonb := '[]'::jsonb;
  v_plate text; v_doc text; v_date date; v_days int; v_tel text; v_rtm text;
  v_rows crm_soat[];
  s crm_soat;
  m text[];
begin
  select * into ct from crm_contacts where phone = v_phone;
  select type into v_last_type from crm_messages
  where contact_id = ct.id and direction = 'in' order by created_at desc limit 1;

  -- Foto o PDF: la lee /api/crm/media/ingest y responde aparte con los datos
  if v_last_type in ('image', 'document') then
    v_out := jsonb_build_array(crm_msg_text('📷 Recibido. Estoy leyendo el SOAT, en unos segundos te mando los datos…'));

  elsif v_in in ('', 'hola', 'menu', 'ayuda', 'inicio', 'help', 'a_ayuda', 'opciones', 'modo asesor', 'asesor') or v_in ~ '^(buenos|buenas|hola)\M' then
    v_out := jsonb_build_array(crm_msg_buttons(
      '👋 Hola' || coalesce(' ' || nullif(initcap(split_part(coalesce(ct.name, ct.wa_name, ''), ' ', 1)), ''), '') ||
      E', estás en *modo asesor* de BotMazo.\n\n' ||
      E'📷 *Mándame la foto o el PDF de un SOAT* y lo guardo con su vencimiento.\n' ||
      E'🔎 Escribe una *placa* (ABC123) o una *cédula* para consultar.\n' ||
      E'📅 *vencen* — SOAT que vencen en los próximos 30 días (*vencen 60* para 60).\n' ||
      E'⛔ *vencidos* — vencidos sin renovar.\n' ||
      E'✏️ *fecha ABC123 31/12/2026* — corregir vencimiento.\n' ||
      E'📱 *tel ABC123 3001234567* — celular del cliente.\n' ||
      E'🔧 *rtm ABC123 01/04/2027* — vencimiento de la tecnomecánica.\n' ||
      E'🎂 *cumpleaños* — clientes que cumplen en los próximos 7 días.\n' ||
      E'🧪 *modo cliente* — probar el bot como cliente (2 h).',
      jsonb_build_array(
        jsonb_build_object('id', 'a_vencen', 'title', 'Vencen pronto'),
        jsonb_build_object('id', 'a_vencidos', 'title', 'Vencidos'),
        jsonb_build_object('id', 'a_cliente', 'title', 'Modo cliente')),
      'BotMazo · Asesor'));

  elsif v_in in ('modo cliente', 'cliente', 'a_cliente') then
    update crm_advisors set client_mode_until = now() + interval '2 hours' where phone = v_phone;
    update crm_contacts set bot_state = null, bot_data = '{}'::jsonb, bot_updated_at = now() where id = ct.id;
    v_out := jsonb_build_array(crm_msg_text(
      '🧪 Listo: por 2 horas te atiendo como a un cliente. Escribe *modo asesor* para volver.'));

  elsif v_in ~ '^(vencen|por vencer|a_vencen)( \d{1,3})?( dias)?$' then
    v_days := coalesce(nullif(regexp_replace(v_in, '\D', '', 'g'), '')::int, 30);
    select array_agg(x.s order by (x.s).end_date) into v_rows from (
      select s2 as s from crm_soat s2
      where s2.end_date between crm_today() and crm_today() + v_days
        and not exists (select 1 from crm_soat n where n.plate = s2.plate and n.end_date > s2.end_date)
      order by s2.end_date limit 40) x;
    v_out := jsonb_build_array(crm_msg_text(crm_soat_list_text('📅 SOAT que vencen en los próximos ' || v_days || ' días:', v_rows)));

  elsif v_in ~ '^(cumpleanos|cumple|a_cumple)( \d{1,2})?$' then
    v_days := coalesce(nullif(regexp_replace(v_in, '\D', '', 'g'), '')::int, 7);
    v_out := jsonb_build_array(crm_msg_text(crm_birthdays_text(v_days)));

  elsif v_in in ('vencidos', 'a_vencidos') then
    select array_agg(x.s order by (x.s).end_date) into v_rows from (
      select s2 as s from crm_soat s2
      where s2.end_date < crm_today() and s2.end_date >= crm_today() - 90
        and not exists (select 1 from crm_soat n where n.plate = s2.plate and n.end_date > s2.end_date)
      order by s2.end_date desc limit 40) x;
    v_out := jsonb_build_array(crm_msg_text(crm_soat_list_text('⛔ SOAT vencidos (últimos 90 días) sin renovar:', v_rows)));

  elsif v_raw ~* '^fecha\s' then
    m := regexp_match(v_raw, '^\S+\s+([A-Za-z0-9-]{5,7})\s+(\S+)$');
    v_plate := crm_plate_norm(m[1]);
    begin v_date := crm_parse_date(m[2]); exception when others then v_date := null; end;
    if v_plate is null or v_date is null then
      v_out := jsonb_build_array(crm_msg_text('Escríbelo así: *fecha ABC123 31/12/2026*'));
    else
      update crm_soat set end_date = v_date, reminders_sent = '{}', updated_at = now()
      where id = (select id from crm_soat where plate = v_plate order by end_date desc nulls first, created_at desc limit 1)
      returning * into s;
      v_out := jsonb_build_array(crm_msg_text(case when s.id is null then 'No tengo un SOAT de la placa ' || v_plate
        else E'✏️ Vencimiento actualizado\n\n' || crm_soat_text(s) end));
    end if;

  elsif v_raw ~* '^(rtm|tecno|tecnomecanica|tecnomecánica)\s' then
    m := regexp_match(v_raw, '^\S+\s+([A-Za-z0-9-]{5,7})\s+(\S+)$');
    v_plate := crm_plate_norm(m[1]);
    begin v_date := crm_parse_date(m[2]); exception when others then v_date := null; end;
    if v_plate is null or v_date is null then
      v_out := jsonb_build_array(crm_msg_text('Escríbelo así: *rtm ABC123 01/04/2027* (fecha de vencimiento de la tecnomecánica)'));
    elsif to_regclass('public.crm_rtm') is null then
      v_out := jsonb_build_array(crm_msg_text('Falta activar la tecnomecánica (crm_vehicle_reminders.sql).'));
    else
      insert into crm_rtm (plate, expiry_date, created_by) values (v_plate, v_date, v_phone)
      on conflict (plate, expiry_date) do nothing;
      v_out := jsonb_build_array(crm_msg_text('🔧 Tecnomecánica de *' || v_plate || '* guardada: vence ' || crm_fmt_date(v_date)
        || ' (' || crm_soat_days_text(v_date) || '). Le aviso al cliente 30, 15 y 3 días antes.'));
    end if;

  elsif v_raw ~* '^(tel|cel|celular|telefono|teléfono)\s' then
    m := regexp_match(v_raw, '^\S+\s+([A-Za-z0-9-]{5,7})\s+(.+)$');
    v_plate := crm_plate_norm(m[1]);
    v_tel := crm_norm_phone(m[2]);
    if v_plate is null or v_tel is null or length(v_tel) < 10 then
      v_out := jsonb_build_array(crm_msg_text('Escríbelo así: *tel ABC123 3001234567*'));
    else
      update crm_soat set owner_phone = v_tel, updated_at = now()
      where id = (select id from crm_soat where plate = v_plate order by end_date desc nulls first, created_at desc limit 1)
      returning * into s;
      if s.id is not null then
        if s.contact_id is not null then
          begin update crm_contacts set phone = coalesce(phone, v_tel) where id = s.contact_id;
          exception when unique_violation then null; end;
        else
          update crm_soat set contact_id = crm_soat_link_contact(s) where id = s.id returning * into s;
        end if;
      end if;
      v_out := jsonb_build_array(crm_msg_text(case when s.id is null then 'No tengo un SOAT de la placa ' || v_plate
        else E'📱 Celular guardado\n\n' || crm_soat_text(s) end));
    end if;

  elsif crm_plate_norm(v_raw) ~ '^[A-Z]{3}[0-9]{2}[A-Z0-9]$' and length(regexp_replace(v_raw, '[\s-]', '', 'g')) = 6 then
    v_plate := crm_plate_norm(v_raw);
    select array_agg(x.s order by (x.s).end_date desc nulls last) into v_rows
    from (select s2 as s from crm_soat s2 where s2.plate = v_plate order by s2.end_date desc nulls last limit 3) x;
    -- Tecnomecánica (crm_vehicle_reminders.sql)
    if to_regclass('public.crm_rtm') is not null then
      select '🔧 Tecnomecánica: ' || coalesce(crm_fmt_date(r.expiry_date), '?') || ' (' || crm_soat_days_text(r.expiry_date) || ')'
             || coalesce(' · ' || r.center_name, '')
        into v_rtm
      from crm_rtm r where r.plate = v_plate order by r.expiry_date desc nulls last limit 1;
    end if;
    if v_rows is null then
      v_out := jsonb_build_array(crm_msg_text('No tengo SOAT de la placa *' || v_plate || '*. Mándame la foto y lo guardo 📷'
        || coalesce(E'\n\n' || v_rtm, '')));
    else
      v_out := jsonb_build_array(crm_msg_text(
        (select string_agg(crm_soat_text(r), E'\n\n— anterior —\n' order by r.end_date desc nulls last) from unnest(v_rows) r)
        || coalesce(E'\n' || v_rtm, E'\n🔧 Tecnomecánica: sin registrar (*rtm ' || v_plate || ' DD/MM/AAAA*)')));
    end if;

  elsif v_raw ~ '^[0-9.\s]{5,15}$' then
    v_doc := crm_norm_doc(v_raw);
    select array_agg(x.s order by (x.s).end_date) into v_rows from (
      select s2 as s from crm_soat s2 where s2.owner_doc = v_doc
        and not exists (select 1 from crm_soat n where n.plate = s2.plate and n.end_date > s2.end_date)
      limit 20) x;
    v_out := jsonb_build_array(crm_msg_text(crm_soat_list_text('🔎 SOAT del documento ' || v_doc || ':', v_rows)));

  else
    v_out := jsonb_build_array(crm_msg_text(
      'No entendí 🙏 Mándame la *foto del SOAT*, una *placa* (ABC123), una *cédula*, *vencen*, *vencidos*, *cumpleaños* o *ayuda*.'));
  end if;

  update crm_contacts set bot_state = null, bot_data = '{}'::jsonb, bot_updated_at = now(), unread_count = 0
  where id = ct.id;

  return jsonb_build_object('messages',
    coalesce((select jsonb_agg(jsonb_build_object('message', x, 'text', crm_msg_plain(x)))
              from jsonb_array_elements(v_out) x), '[]'::jsonb));
end $$;

revoke all on function crm_is_advisor(text) from public, anon;
grant execute on function crm_is_advisor(text) to authenticated, service_role;
revoke all on function crm_advisor_step(text, text, text) from public, anon;
grant execute on function crm_advisor_step(text, text, text) to authenticated, service_role;
revoke all on function crm_soat_save(jsonb, text, text, uuid) from public, anon;
grant execute on function crm_soat_save(jsonb, text, text, uuid) to authenticated, service_role;

-- ───────────── Recordatorios diarios ─────────────
-- Marca y avisa los SOAT que vencen en 30, 15, 5, 1 y 0 días (y los que se saltaron
-- porque se cargaron tarde: se avisa una vez el umbral más cercano).
create or replace function crm_soat_daily() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_rows crm_soat[];
  v_text text;
  v_n int;
  v_base text; v_secret text;
begin
  with due as (
    select s.id, t.days
    from crm_soat s
    cross join lateral (
      select min(d) as days from unnest(array[30, 15, 5, 1, 0]) d
      where s.end_date - crm_today() <= d and not (d = any (s.reminders_sent))
    ) t
    where s.end_date between crm_today() and crm_today() + 30
      and t.days is not null
      and not exists (select 1 from crm_soat n where n.plate = s.plate and n.end_date > s.end_date)
  ), upd as (
    update crm_soat s set reminders_sent = (
        select array_agg(distinct d) from unnest(s.reminders_sent || array(select d from unnest(array[30, 15, 5, 1, 0]) d where d >= due.days)) d)
    from due where s.id = due.id
    returning s.id
  )
  select array_agg(s order by s.end_date) into v_rows from crm_soat s where s.id in (select id from upd);

  v_n := coalesce(array_length(v_rows, 1), 0);
  if v_n = 0 then return jsonb_build_object('due', 0); end if;

  v_text := crm_soat_list_text('🔔 SOAT por vencer (' || v_n || '):', v_rows);

  perform crm_notify('🔔 ' || v_n || ' SOAT por vencer',
                     (select string_agg(r.plate || ' ' || crm_soat_days_text(r.end_date), ' · ' order by r.end_date) from unnest(v_rows) r),
                     '/admin?tab=soat', 'soat-daily');

  -- WhatsApp a los asesores (lo envía el servidor del sitio con Gupshup)
  select regexp_replace(value, '/api/.*$', '') into v_base from crm_private_config where key = 'push_url';
  select value into v_secret from crm_private_config where key = 'push_secret';
  if v_base is not null and v_secret is not null then
    perform net.http_post(
      url := v_base || '/api/crm/soat/remind',
      body := jsonb_build_object('text', v_text, 'count', v_n,
                                 'plates', (select string_agg(r.plate, ', ' order by r.end_date) from unnest(v_rows) r)),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
      timeout_milliseconds := 20000);
  end if;
  return jsonb_build_object('due', v_n, 'text', v_text);
end $$;
revoke all on function crm_soat_daily() from public, anon, authenticated;

-- Programar todos los días a las 8:00 a. m. de Colombia (13:00 UTC).
-- Requiere la extensión pg_cron (Supabase → Database → Extensions → pg_cron).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'crm-soat-daily';
  perform cron.schedule('crm-soat-daily', '0 13 * * *', 'select crm_soat_daily()');
exception when others then
  raise notice 'No se pudo programar pg_cron (%). Actívalo en Database → Extensions y vuelve a correr este archivo.', sqlerrm;
end $$;
