-- BotMazo: menú de servicios + agendamiento de asesorías por WhatsApp.
-- Ejecutar DESPUÉS de crm.sql, en el mismo proyecto. Se puede correr varias veces.
--
-- n8n llama crm_bot_step(...) con cada mensaje entrante y recibe la lista de
-- mensajes (formato Gupshup) que debe enviar. Toda la lógica y el estado de la
-- conversación viven aquí, así el flujo de n8n no cambia cuando se ajusta el bot.

alter table crm_contacts add column if not exists bot_state text;
alter table crm_contacts add column if not exists bot_data jsonb not null default '{}'::jsonb;
alter table crm_contacts add column if not exists bot_updated_at timestamptz;

-- ───────────── Utilidades de texto y fechas ─────────────

create or replace function crm_norm(p text) returns text language sql immutable as $$
  select btrim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áéíóúüñ¿?¡!.,;:', 'aeiouun        '),
    '\s+', ' ', 'g'))
$$;

create or replace function crm_fmt_time(p timestamptz, p_tz text) returns text language sql immutable as $$
  select to_char(p at time zone p_tz, 'FMHH12:MI') ||
         case when extract(hour from p at time zone p_tz) < 12 then ' a. m.' else ' p. m.' end
$$;

create or replace function crm_fmt_day(p date, p_short boolean default false) returns text language sql immutable as $$
  select (array['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'])[extract(isodow from p)::int]
      || ' ' || extract(day from p)::int || ' '
      || case when p_short
           then (array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'])[extract(month from p)::int]
           else 'de ' || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre',
                                'octubre','noviembre','diciembre'])[extract(month from p)::int]
         end
$$;

-- Nombre y descripción de cada tipo de seguro (usa lo que edites en /admin → Seguros cuando exista)
create or replace function crm_topic_info(p_topic text) returns jsonb language sql stable
security definer set search_path = public as $$
  with defaults(topic, title, description) as (values
    ('auto',          'Autos',               'Cobertura para tu vehículo particular o de trabajo, con asistencia en carretera.'),
    ('salud',         'Salud',               'Planes de salud y medicina prepagada pensados para ti y tu familia.'),
    ('vida',          'Vida',                'Protección económica para tu familia ante fallecimiento, incapacidad o enfermedades graves.'),
    ('propiedades',   'Hogar y propiedades', 'Protege tu casa, apartamento o local ante incendio, robo o desastres naturales.'),
    ('obras-civiles', 'Obras civiles',       'Pólizas para constructoras y contratistas: cumplimiento, responsabilidad y todo riesgo.'),
    ('otro',          'Otro seguro',         'Cuéntale al asesor qué necesitas proteger y te ayudamos a encontrar la póliza.')
  )
  select jsonb_build_object(
    'title', coalesce(nullif(sc.data -> d.topic ->> 'title', ''), d.title),
    'description', coalesce(nullif(sc.data -> d.topic ->> 'description', ''), d.description),
    'coverage', coalesce(sc.data -> d.topic -> 'coverage', '[]'::jsonb)
  )
  from defaults d
  left join site_content sc on sc.section = 'categories'
  where d.topic = p_topic
$$;

-- Detecta el tipo de seguro en un texto libre ("quiero cotizar un seguro de autos")
create or replace function crm_detect_topic(p text) returns text language sql immutable as $$
  select case
    when p ~ '\m(auto|autos|carro|carros|vehiculo|vehiculos|moto|motos|soat|todo riesgo)\M' then 'auto'
    when p ~ '\m(salud|prepagada|medicina|eps|medico)\M' then 'salud'
    when p ~ '\m(vida|exequial|exequiales|funerario)\M' then 'vida'
    when p ~ '\m(hogar|casa|apartamento|propiedad|propiedades|local|vivienda)\M' then 'propiedades'
    when p ~ '\m(obra|obras|construccion|cumplimiento|contratista|contratistas|civiles)\M' then 'obras-civiles'
    else null end
$$;

-- ───────────── Constructores de mensajes Gupshup ─────────────

create or replace function crm_msg_text(p_text text) returns jsonb language sql immutable as $$
  select jsonb_build_object('type', 'text', 'text', p_text)
$$;

-- p_options: [{id, title}] (máx 3, título máx 20 caracteres)
create or replace function crm_msg_buttons(p_body text, p_options jsonb, p_header text default null)
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'type', 'quick_reply',
    'msgid', 'qr',
    'content', jsonb_strip_nulls(jsonb_build_object('type', 'text', 'header', p_header, 'text', p_body)),
    'options', (select jsonb_agg(jsonb_build_object('type', 'text', 'title', o ->> 'title', 'postbackText', o ->> 'id'))
                from jsonb_array_elements(p_options) o)
  )
$$;

-- p_sections: [{title, options:[{id, title, description}]}] (máx 10 filas, título de fila máx 24)
create or replace function crm_msg_list(p_body text, p_button text, p_sections jsonb, p_header text default null)
returns jsonb language sql immutable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'type', 'list',
    'title', p_header,
    'body', p_body,
    'msgid', 'list',
    'globalButtons', jsonb_build_array(jsonb_build_object('type', 'text', 'title', p_button)),
    'items', (select jsonb_agg(jsonb_build_object(
                'title', s ->> 'title',
                'subtitle', s ->> 'title',
                'options', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                              'type', 'text', 'title', o ->> 'title',
                              'description', o ->> 'description', 'postbackText', o ->> 'id')))
                            from jsonb_array_elements(s -> 'options') o)))
              from jsonb_array_elements(p_sections) s)
  ))
$$;

-- Todas las opciones [{id,title}] que contiene un mensaje (para reconocer la respuesta)
create or replace function crm_msg_options(p_msg jsonb) returns jsonb language sql immutable as $$
  select coalesce(
    case p_msg ->> 'type'
      when 'quick_reply' then (select jsonb_agg(jsonb_build_object('id', o ->> 'postbackText', 'title', o ->> 'title'))
                               from jsonb_array_elements(p_msg -> 'options') o)
      when 'list' then (select jsonb_agg(jsonb_build_object('id', o ->> 'postbackText', 'title', o ->> 'title'))
                        from jsonb_array_elements(p_msg -> 'items') s, jsonb_array_elements(s -> 'options') o)
    end, '[]'::jsonb)
$$;

-- Texto plano de un mensaje (para guardarlo en la conversación del CRM)
create or replace function crm_msg_plain(p_msg jsonb) returns text language sql immutable as $$
  select case p_msg ->> 'type'
    when 'text' then p_msg ->> 'text'
    when 'quick_reply' then concat_ws(E'\n', p_msg -> 'content' ->> 'header', p_msg -> 'content' ->> 'text')
      || E'\n' || (select string_agg('[' || (o ->> 'title') || ']', ' ') from jsonb_array_elements(p_msg -> 'options') o)
    when 'list' then concat_ws(E'\n', p_msg ->> 'title', p_msg ->> 'body')
      || E'\n' || (select string_agg('• ' || (o ->> 'title'), E'\n')
                   from jsonb_array_elements(p_msg -> 'items') s, jsonb_array_elements(s -> 'options') o)
    else p_msg::text end
$$;

-- ───────────── Pantallas del bot ─────────────

create or replace function crm_bot_menu(p_name text) returns jsonb language sql stable as $$
  select crm_msg_list(
    '¡Hola' || coalesce(' ' || nullif(p_name, ''), '') || '! 👋 Soy *BotMazo*, el asistente virtual de Mazoseguros.' ||
      E'\n\n¿En qué te puedo ayudar hoy?',
    'Ver opciones',
    jsonb_build_array(
      jsonb_build_object('title', 'Asesoría', 'options', jsonb_build_array(
        jsonb_build_object('id', 'm_agendar', 'title', '📅 Agendar asesoría', 'description', 'Elige día y hora con un asesor'),
        jsonb_build_object('id', 'm_asesor', 'title', '💬 Hablar con un asesor', 'description', 'Te escribe una persona del equipo'))),
      jsonb_build_object('title', 'Seguros', 'options', jsonb_build_array(
        jsonb_build_object('id', 's_auto', 'title', '🚗 Autos', 'description', 'Todo riesgo, SOAT y más'),
        jsonb_build_object('id', 's_salud', 'title', '🩺 Salud', 'description', 'Planes de salud y prepagada'),
        jsonb_build_object('id', 's_vida', 'title', '❤️ Vida', 'description', 'Protección para tu familia'),
        jsonb_build_object('id', 's_propiedades', 'title', '🏠 Hogar y propiedades', 'description', 'Casa, apartamento o local'),
        jsonb_build_object('id', 's_obras-civiles', 'title', '🏗️ Obras civiles', 'description', 'Cumplimiento y todo riesgo')))
    ),
    'Mazoseguros'
  )
$$;

create or replace function crm_bot_service(p_topic text) returns jsonb language sql stable as $$
  select crm_msg_buttons(
    (i ->> 'description') ||
      coalesce(E'\n\n' || (select string_agg('✔️ ' || c, E'\n') from jsonb_array_elements_text(i -> 'coverage') c), '') ||
      E'\n\n¿Quieres una asesoría gratuita con uno de nuestros asesores?',
    jsonb_build_array(
      jsonb_build_object('id', 'm_agendar', 'title', '📅 Agendar asesoría'),
      jsonb_build_object('id', 'm_asesor', 'title', '💬 Hablar con asesor'),
      jsonb_build_object('id', 'menu', 'title', 'Ver menú')),
    'Seguro de ' || lower(i ->> 'title')
  )
  from crm_topic_info(p_topic) i
$$;

create or replace function crm_bot_topics() returns jsonb language sql stable as $$
  select crm_msg_list(
    '¿Sobre qué seguro quieres la asesoría?',
    'Elegir seguro',
    jsonb_build_array(jsonb_build_object('title', 'Seguros', 'options', jsonb_build_array(
      jsonb_build_object('id', 't_auto', 'title', '🚗 Autos'),
      jsonb_build_object('id', 't_salud', 'title', '🩺 Salud'),
      jsonb_build_object('id', 't_vida', 'title', '❤️ Vida'),
      jsonb_build_object('id', 't_propiedades', 'title', '🏠 Hogar y propiedades'),
      jsonb_build_object('id', 't_obras-civiles', 'title', '🏗️ Obras civiles'),
      jsonb_build_object('id', 't_otro', 'title', '➕ Otro')))))
$$;

-- Próximos días con cupo (hasta 7, buscando 21 días hacia adelante); null si no hay
create or replace function crm_bot_days() returns jsonb language plpgsql stable
security definer set search_path = public as $$
declare
  c crm_agenda_config;
  v_today date;
  v_opts jsonb := '[]'::jsonb;
  d date;
  n int;
begin
  select * into c from crm_agenda_config where id = 1;
  v_today := (now() at time zone c.timezone)::date;
  for i in 0..21 loop
    d := v_today + i;
    select count(*) into n from crm_available_slots(d);
    if n > 0 then
      v_opts := v_opts || jsonb_build_object(
        'id', 'd_' || d::text,
        'title', crm_fmt_day(d, true),
        'description', case i when 0 then 'Hoy · ' when 1 then 'Mañana · ' else '' end || n || ' horarios libres');
      exit when jsonb_array_length(v_opts) >= 7;
    end if;
  end loop;
  if jsonb_array_length(v_opts) = 0 then return null; end if;
  return crm_msg_list('📅 ¿Qué día te queda mejor? Estos son los próximos días con horarios libres:', 'Ver días',
    jsonb_build_array(jsonb_build_object('title', 'Días disponibles', 'options', v_opts)));
end $$;

-- Horarios libres de un día (hasta 10); null si ya no hay
create or replace function crm_bot_slots(p_day date) returns jsonb language plpgsql stable
security definer set search_path = public as $$
declare
  c crm_agenda_config;
  v_opts jsonb;
begin
  select * into c from crm_agenda_config where id = 1;
  select jsonb_agg(jsonb_build_object(
           'id', 'h_' || extract(epoch from s.starts_at)::bigint,
           'title', crm_fmt_time(s.starts_at, c.timezone)) order by s.starts_at)
    into v_opts
  from (select * from crm_available_slots(p_day) limit 10) s;
  if v_opts is null then return null; end if;
  return crm_msg_list('🕐 ' || crm_fmt_day(p_day) || E'\n¿A qué hora?', 'Ver horarios',
    jsonb_build_array(jsonb_build_object('title', 'Horarios', 'options', v_opts)));
end $$;

create or replace function crm_bot_modality() returns jsonb language sql immutable as $$
  select crm_msg_buttons('¿Cómo prefieres la asesoría?', jsonb_build_array(
    jsonb_build_object('id', 'mod_llamada', 'title', '📞 Llamada'),
    jsonb_build_object('id', 'mod_videollamada', 'title', '💻 Videollamada'),
    jsonb_build_object('id', 'mod_presencial', 'title', '🏢 Presencial')))
$$;

-- ───────────── Cerebro: un paso de la conversación ─────────────
-- Devuelve {"messages": [ {message: <objeto Gupshup>, text: <texto para el CRM>}, ... ]}.
-- Un arreglo vacío significa "no responder" (p. ej. el cliente pidió hablar con un asesor).

create or replace function crm_bot_step(
  p_phone text,
  p_name text default null,
  p_text text default null,
  p_reply_id text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  ct crm_contacts;
  cfg crm_agenda_config;
  v_first text;
  v_state text;
  v_data jsonb;
  v_in text := crm_norm(p_text);
  v_choice text;             -- id de la opción elegida (o null si escribió texto libre)
  v_out jsonb := '[]'::jsonb;
  v_prompt jsonb;            -- último mensaje con opciones (para repetirlo si no entiende)
  v_topic text;
  v_day date;
  v_start timestamptz;
  v_mod text;
  o jsonb;
begin
  select * into cfg from crm_agenda_config where id = 1;

  insert into crm_contacts (phone, wa_name, name, source, last_message_at)
  values (v_phone, p_name, p_name, 'whatsapp', now())
  on conflict (phone) do nothing;
  select * into ct from crm_contacts where phone = v_phone for update;

  v_first := initcap(split_part(regexp_replace(coalesce(ct.name, ct.wa_name, p_name, ''), '[^[:alpha:] ]', '', 'g'), ' ', 1));
  v_state := ct.bot_state;
  v_data := coalesce(ct.bot_data, '{}'::jsonb);

  -- Una conversación a medias se olvida tras 2 horas sin respuesta
  if v_state is not null and v_state <> 'asesor' and ct.bot_updated_at < now() - interval '2 hours' then
    v_state := null; v_data := '{}'::jsonb;
  end if;
  -- "Hablar con asesor": el bot calla 12 horas (o hasta que escriban "menú")
  if v_state = 'asesor' and ct.bot_updated_at < now() - interval '12 hours' then
    v_state := null; v_data := '{}'::jsonb;
  end if;

  -- ¿Qué opción eligió? 1) id del botón/lista, 2) título exacto, 3) número de la opción
  if p_reply_id is not null and p_reply_id <> '' then
    v_choice := p_reply_id;
  end if;
  if v_choice is null or not (v_choice ~ '^(m_|s_|t_|d_|h_|mod_|menu$)') then
    v_choice := null;
    for o in select * from jsonb_array_elements(coalesce(v_data -> 'options', '[]'::jsonb)) loop
      if crm_norm(regexp_replace(o ->> 'title', '[^[:alnum:][:space:]áéíóúñÁÉÍÓÚÑ]', '', 'g')) = v_in
         or crm_norm(o ->> 'title') = v_in then
        v_choice := o ->> 'id'; exit;
      end if;
    end loop;
    if v_choice is null and v_in ~ '^\d{1,2}$' then
      v_choice := v_data -> 'options' -> (v_in::int - 1) ->> 'id';
    end if;
  end if;

  -- Palabras clave que funcionan siempre
  if v_choice is null then
    if v_in ~ '^(menu|inicio|volver|opciones|empezar)$' then v_choice := 'menu';
    elsif v_in ~ '\m(agendar|agenda|cita|asesoria|reunion)\M' then v_choice := 'm_agendar';
    elsif v_in ~ '\m(asesor|humano|persona|agente)\M' then v_choice := 'm_asesor';
    end if;
  end if;

  -- En modo asesor el bot no responde, salvo que pidan el menú
  if v_state = 'asesor' and coalesce(v_choice, '') <> 'menu' then
    update crm_contacts set bot_updated_at = bot_updated_at where id = ct.id;
    return jsonb_build_object('messages', '[]'::jsonb);
  end if;

  -- Texto libre sin opción reconocida
  if v_choice is null then
    v_topic := crm_detect_topic(v_in);
    if v_topic is not null and (v_state is null or v_state = 'menu') then
      v_choice := 's_' || v_topic;          -- viene de la web: "quiero cotizar un seguro de autos"
    elsif v_state is not null and v_state <> 'menu' and v_data ? 'prompt' then
      v_out := v_out || jsonb_build_array(crm_msg_text('No entendí tu respuesta 🙏 Elige una de las opciones, o escribe *menú* para empezar de nuevo.'));
      v_prompt := v_data -> 'prompt';
      v_out := v_out || jsonb_build_array(v_prompt);
    else
      v_choice := 'menu';
    end if;
  end if;

  -- ── Acciones ──
  if v_choice = 'menu' then
    v_state := 'menu'; v_data := '{}'::jsonb;
    v_prompt := crm_bot_menu(v_first);
    v_out := v_out || jsonb_build_array(v_prompt);

  elsif v_choice like 's\_%' then
    v_topic := substr(v_choice, 3);
    update crm_contacts set interest = v_topic,
      status = case when status in ('nuevo', 'en_conversacion') then 'cotizando' else status end
    where id = ct.id;
    v_state := 'servicio'; v_data := jsonb_build_object('topic', v_topic);
    v_prompt := crm_bot_service(v_topic);
    v_out := v_out || jsonb_build_array(v_prompt);

  elsif v_choice = 'm_asesor' then
    v_state := 'asesor'; v_data := '{}'::jsonb; v_prompt := null;
    update crm_contacts set status = case when status = 'nuevo' then 'en_conversacion' else status end where id = ct.id;
    v_out := v_out || jsonb_build_array(crm_msg_text(
      'Listo' || coalesce(' ' || nullif(v_first, ''), '') || ' 🙌 Un asesor de Mazoseguros te escribirá por aquí en horario hábil.' ||
      E'\nSi quieres volver a las opciones, escribe *menú*.'));

  elsif v_choice = 'm_agendar' or v_choice like 't\_%' then
    v_topic := coalesce(case when v_choice like 't\_%' then substr(v_choice, 3) end, v_data ->> 'topic', ct.interest);
    if v_choice like 't\_%' then
      update crm_contacts set interest = v_topic where id = ct.id;
    end if;
    if v_topic is null then
      v_state := 'agendar_tema'; v_data := '{}'::jsonb;
      v_prompt := crm_bot_topics();
      v_out := v_out || jsonb_build_array(v_prompt);
    else
      v_data := jsonb_build_object('topic', v_topic);
      v_prompt := crm_bot_days();
      if v_prompt is null then
        v_state := 'asesor';
        v_out := v_out || jsonb_build_array(crm_msg_text(
          'En este momento no tengo horarios libres en la agenda 😕 Un asesor te escribirá para acordar la cita.'));
      else
        v_state := 'agendar_dia';
        v_out := v_out || jsonb_build_array(v_prompt);
      end if;
    end if;

  elsif v_choice like 'd\_%' then
    v_day := substr(v_choice, 3)::date;
    v_prompt := crm_bot_slots(v_day);
    if v_prompt is null then
      v_prompt := crm_bot_days();
      v_out := v_out || jsonb_build_array(crm_msg_text('Ese día ya no tiene horarios libres. Elige otro, por favor.'));
      if v_prompt is not null then v_out := v_out || jsonb_build_array(v_prompt); end if;
      v_state := 'agendar_dia';
    else
      v_state := 'agendar_hora'; v_data := v_data || jsonb_build_object('day', v_day);
      v_out := v_out || jsonb_build_array(v_prompt);
    end if;

  elsif v_choice like 'h\_%' then
    v_start := to_timestamp(substr(v_choice, 3)::bigint);
    v_day := (v_start at time zone cfg.timezone)::date;
    if exists (select 1 from crm_available_slots(v_day) s where s.starts_at = v_start) then
      v_state := 'agendar_modalidad'; v_data := v_data || jsonb_build_object('start', v_start);
      v_prompt := crm_bot_modality();
    else
      v_out := v_out || jsonb_build_array(crm_msg_text('Ese horario ya no está disponible. Elige otro, por favor.'));
      v_prompt := crm_bot_slots(v_day);
      if v_prompt is null then v_prompt := crm_bot_days(); v_state := 'agendar_dia';
      else v_state := 'agendar_hora'; v_data := v_data || jsonb_build_object('day', v_day); end if;
    end if;
    if v_prompt is not null then v_out := v_out || jsonb_build_array(v_prompt); end if;

  elsif v_choice like 'mod\_%' and v_data ? 'start' then
    v_mod := substr(v_choice, 5);
    v_start := (v_data ->> 'start')::timestamptz;
    v_topic := coalesce(v_data ->> 'topic', ct.interest);
    begin
      insert into crm_appointments (contact_id, contact_name, contact_phone, starts_at, ends_at,
                                    topic, modality, status, created_by)
      values (ct.id, coalesce(ct.name, ct.wa_name, p_name), v_phone, v_start,
              v_start + make_interval(mins => cfg.slot_minutes), v_topic, v_mod, 'confirmada', 'bot');
      v_state := null; v_data := '{}'::jsonb; v_prompt := null;
      update crm_contacts set status = case when status in ('nuevo', 'en_conversacion') then 'cotizando' else status end
      where id = ct.id;
      v_out := v_out || jsonb_build_array(crm_msg_text(
        '✅ ¡Listo' || coalesce(' ' || nullif(v_first, ''), '') || '! Tu asesoría quedó agendada:' || E'\n\n' ||
        '📅 ' || crm_fmt_day((v_start at time zone cfg.timezone)::date) || E'\n' ||
        '🕐 ' || crm_fmt_time(v_start, cfg.timezone) || E'\n' ||
        '🛡️ ' || coalesce(crm_topic_info(v_topic) ->> 'title', 'Asesoría general') || E'\n' ||
        case v_mod when 'llamada' then '📞 Te llamaremos a este número'
                   when 'videollamada' then '💻 Te enviaremos el enlace de la videollamada por aquí'
                   else '🏢 Presencial en nuestra oficina' end ||
        E'\n\nSi necesitas cambiarla, escribe *menú* o responde a este chat.'));
    exception when exclusion_violation then
      v_day := (v_start at time zone cfg.timezone)::date;
      v_prompt := crm_bot_slots(v_day);
      v_out := v_out || jsonb_build_array(crm_msg_text('Uy, ese horario se acaba de ocupar 😅 Elige otro, por favor.'));
      if v_prompt is null then v_prompt := crm_bot_days(); v_state := 'agendar_dia';
      else v_state := 'agendar_hora'; end if;
      if v_prompt is not null then v_out := v_out || jsonb_build_array(v_prompt); end if;
    end;

  elsif v_choice is not null then
    -- opción de un mensaje viejo que ya no aplica
    v_state := 'menu'; v_data := '{}'::jsonb;
    v_prompt := crm_bot_menu(v_first);
    v_out := v_out || jsonb_build_array(v_prompt);
  end if;

  -- Guardar estado + opciones del último mensaje para reconocer la próxima respuesta
  if v_prompt is not null then
    v_data := v_data || jsonb_build_object('prompt', v_prompt, 'options', crm_msg_options(v_prompt));
  else
    v_data := v_data - 'prompt' - 'options';
  end if;
  update crm_contacts set bot_state = v_state, bot_data = v_data, bot_updated_at = now() where id = ct.id;

  return jsonb_build_object('messages',
    coalesce((select jsonb_agg(jsonb_build_object('message', m, 'text', crm_msg_plain(m)))
              from jsonb_array_elements(v_out) m), '[]'::jsonb));
end $$;

revoke all on function crm_bot_step(text, text, text, text) from public, anon;
grant execute on function crm_bot_step(text, text, text, text) to authenticated, service_role;
