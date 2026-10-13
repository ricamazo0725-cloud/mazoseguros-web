-- Crear clientes desde el admin (uno a uno) e importarlos en bloque (CSV o JSON).
-- Ejecutar DESPUÉS de crm.sql, crm_bot.sql, crm_policies.sql y crm_leads.sql. Se puede correr varias veces.
--
-- crm_import_contacts(p_rows, p_mode)
--   p_rows: arreglo JSON de objetos con estas llaves (todas texto, opcionales salvo nombre):
--     nombre, tipo_documento, documento, telefono, email, ciudad, interes, estado, notas, carpeta_cliente
--   p_mode: 'manual'  → un cliente creado desde el formulario; si ya existe NO se toca y se avisa.
--           'import'  → carga masiva; si ya existe se completan los datos vacíos.
-- Empareja como la importación de pólizas: primero por documento, luego por teléfono.
-- Devuelve una fila por registro: (fila, resultado, detalle, contact_id)
--   resultado = creado | actualizado | existe | error

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

create or replace function crm_parse_status(p text) returns text language sql immutable as $$
  select case
    when x = '' then null
    when x ~ '^(cliente|activo|asegurado)' then 'cliente'
    when x ~ '^(nuevo|prospecto|lead)' then 'nuevo'
    when x ~ '^(en conversacion|conversacion|contactado)' then 'en_conversacion'
    when x ~ '^(cotizando|cotizacion|cotizado)' then 'cotizando'
    when x ~ '^(perdido|inactivo|descartado)' then 'perdido'
    else null end
  from (select replace(crm_norm(p), '_', ' ') as x) t
$$;

create or replace function crm_parse_interest(p text) returns text language sql immutable as $$
  select case
    when x = '' then null
    when x in ('auto', 'salud', 'vida', 'propiedades', 'obras-civiles', 'otro') then x
    when x ~ 'obras? civil' then 'obras-civiles'
    else coalesce(crm_detect_topic(x), 'otro') end
  from (select crm_norm(p) as x) t
$$;

create or replace function crm_import_contacts(p_rows jsonb, p_mode text default 'import')
returns table (fila int, resultado text, detalle text, contact_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  i int := 0;
  v_name text; v_doc text; v_phone text; v_email text; v_status text; v_interest text;
  v_contact uuid; v_other_doc text; v_other_name text; v_note text;
  v_by_doc uuid;
begin
  if auth.role() <> 'authenticated' then raise exception 'no autorizado'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'se esperaba una lista de clientes'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'máximo 5000 clientes por carga'; end if;
  if p_mode not in ('manual', 'import') then raise exception 'modo inválido'; end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    i := i + 1;
    fila := i; contact_id := null;
    begin
      v_name := nullif(btrim(r ->> 'nombre'), '');
      v_doc := crm_norm_doc(r ->> 'documento');
      v_phone := crm_norm_phone(r ->> 'telefono');
      v_email := nullif(lower(btrim(r ->> 'email')), '');
      v_status := crm_parse_status(r ->> 'estado');
      v_interest := crm_parse_interest(r ->> 'interes');
      v_note := '';

      if v_name is null then raise exception 'falta el nombre'; end if;
      if v_doc is null and v_phone is null then raise exception 'falta documento o teléfono'; end if;
      if v_phone is not null and length(v_phone) < 7 then raise exception 'teléfono inválido (%)', r ->> 'telefono'; end if;
      if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'correo inválido (%)', v_email; end if;
      if nullif(btrim(r ->> 'estado'), '') is not null and v_status is null then
        raise exception 'estado desconocido "%" (usa nuevo, en conversación, cotizando, cliente o perdido)', r ->> 'estado';
      end if;

      -- Buscar: documento → teléfono
      v_contact := null; v_by_doc := null;
      if v_doc is not null then select c.id into v_by_doc from crm_contacts c where c.doc_number = v_doc; end if;
      v_contact := v_by_doc;
      if v_phone is not null then
        select c.id, c.doc_number, coalesce(c.name, c.wa_name)
          into v_contact, v_other_doc, v_other_name
        from crm_contacts c where c.phone = v_phone and (v_by_doc is null or c.id <> v_by_doc);
        if v_contact is not null and v_by_doc is not null then
          raise exception 'el documento % y el teléfono % pertenecen a dos contactos distintos (teléfono de %)', v_doc, v_phone, coalesce(v_other_name, '?');
        end if;
        if v_contact is not null and v_other_doc is not null and v_doc is not null and v_other_doc <> v_doc then
          raise exception 'el teléfono % ya es de % (documento %)', v_phone, coalesce(v_other_name, '?'), v_other_doc;
        end if;
        if v_contact is not null and crm_norm(v_other_name) is distinct from crm_norm(v_name) then
          v_note := ' ⚠ unido por teléfono a "' || coalesce(v_other_name, '?') || '"';
        end if;
        v_contact := coalesce(v_by_doc, v_contact);
      end if;

      if v_contact is not null and p_mode = 'manual' then
        select coalesce(c.name, c.wa_name, '+' || c.phone) into v_other_name from crm_contacts c where c.id = v_contact;
        resultado := 'existe'; contact_id := v_contact;
        detalle := 'Ya existe: ' || v_other_name || case when v_by_doc is not null then ' (mismo documento)' else ' (mismo teléfono)' end;
        return next;
        continue;
      end if;

      if v_contact is null then
        insert into crm_contacts (name, phone, email, doc_type, doc_number, city, interest, notes, onedrive_folder,
                                  source, status, lead_source)
        values (v_name, v_phone, v_email, nullif(upper(btrim(r ->> 'tipo_documento')), ''), v_doc,
                nullif(btrim(r ->> 'ciudad'), ''), v_interest, nullif(btrim(r ->> 'notas'), ''),
                nullif(btrim(r ->> 'carpeta_cliente'), ''), p_mode,
                coalesce(v_status, case when p_mode = 'import' then 'cliente' else 'nuevo' end),
                p_mode)
        returning id into v_contact;
        if p_mode = 'manual' then
          insert into crm_leads (contact_id, source, detail, interest, first_message)
          values (v_contact, 'manual', 'Creado desde el admin', v_interest, nullif(btrim(r ->> 'notas'), ''));
        end if;
        resultado := 'creado';
      else
        update crm_contacts c set
          name = coalesce(nullif(c.name, ''), v_name),
          phone = coalesce(c.phone, v_phone),
          email = coalesce(c.email, v_email),
          doc_type = coalesce(c.doc_type, nullif(upper(btrim(r ->> 'tipo_documento')), '')),
          doc_number = coalesce(c.doc_number, v_doc),
          city = coalesce(c.city, nullif(btrim(r ->> 'ciudad'), '')),
          interest = coalesce(c.interest, v_interest),
          onedrive_folder = coalesce(nullif(btrim(r ->> 'carpeta_cliente'), ''), c.onedrive_folder),
          notes = case
            when nullif(btrim(r ->> 'notas'), '') is null then c.notes
            when c.notes is null or c.notes = '' then btrim(r ->> 'notas')
            when position(btrim(r ->> 'notas') in c.notes) > 0 then c.notes
            else c.notes || E'\n' || btrim(r ->> 'notas') end,
          status = coalesce(v_status, c.status)
        where c.id = v_contact;
        resultado := 'actualizado';
      end if;

      contact_id := v_contact;
      detalle := v_name || coalesce(' · ' || v_doc, '') || coalesce(' · +' || v_phone, '') || v_note;
      return next;
    exception when others then
      resultado := 'error'; contact_id := null;
      detalle := coalesce(nullif(btrim(r ->> 'nombre'), ''), '(sin nombre)') || ': ' ||
                 case when sqlstate = '23505' then 'documento o teléfono repetido' else sqlerrm end;
      return next;
    end;
  end loop;
end $$;

revoke all on function crm_import_contacts(jsonb, text) from public, anon;
grant execute on function crm_import_contacts(jsonb, text) to authenticated;
