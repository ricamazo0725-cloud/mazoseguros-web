-- Pólizas por cliente + carga masiva desde Excel/CSV.
-- Ejecutar DESPUÉS de crm.sql. Se puede correr varias veces.
--
-- Carga masiva (sin tocar SQL cada vez):
--   1. Llena la plantilla plantilla-polizas.csv (una fila por póliza).
--   2. Supabase → Table Editor → crm_policies_import → Insert → "Import data from CSV".
--   3. SQL Editor:  select * from crm_import_policies();
--      Crea/actualiza los clientes (por documento o teléfono) y sus pólizas
--      (por aseguradora + número de póliza), y vacía la tabla de importación.

-- ───────────── Clientes: documento de identidad y ciudad ─────────────
alter table crm_contacts add column if not exists doc_type text;      -- CC | NIT | CE | PAS
alter table crm_contacts add column if not exists doc_number text;    -- solo dígitos/letras, sin puntos
alter table crm_contacts add column if not exists city text;
alter table crm_contacts add column if not exists onedrive_folder text; -- carpeta del cliente en OneDrive
-- Un cliente de pólizas puede no tener WhatsApp todavía
alter table crm_contacts alter column phone drop not null;
create unique index if not exists crm_contacts_doc_uidx on crm_contacts (doc_number) where doc_number is not null;

-- ───────────── Pólizas ─────────────
create table if not exists crm_policies (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  insurer text not null,                    -- Sura, Previsora, Equidad, Solidaria, Estado, HDI, Qualitas, Mundial, SBS…
  policy_number text,                       -- número de póliza (puede faltar en cotizaciones)
  line text not null default 'otro'         -- ramo
    check (line in ('auto', 'soat', 'salud', 'vida', 'propiedades', 'obras-civiles', 'cumplimiento',
                    'responsabilidad-civil', 'otro')),
  product text,                             -- plan / producto (ej. "Todo riesgo plus")
  insured_item text,                        -- placa, dirección del inmueble, obra, beneficiario…
  issue_date date,                          -- expedición
  start_date date,                          -- inicio de vigencia
  end_date date,                            -- vencimiento
  premium numeric(14, 2),                   -- prima total (COP)
  status text not null default 'vigente'
    check (status in ('vigente', 'renovada', 'cancelada', 'vencida', 'cotizacion')),
  file_path text,                           -- ruta en OneDrive (ej. Documentos/A-CLIENTES/A-B-C-D-E/Perez Juan/poliza.pdf)
  file_url text,                            -- enlace para abrir el PDF (opcional)
  notes text,
  source text not null default 'manual',    -- manual | import | n8n
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists crm_policies_number_uidx
  on crm_policies (lower(insurer), policy_number) where policy_number is not null;
create index if not exists crm_policies_contact_idx on crm_policies (contact_id);
create index if not exists crm_policies_end_idx on crm_policies (end_date);

drop trigger if exists crm_policies_touch on crm_policies;
create trigger crm_policies_touch before update on crm_policies
  for each row execute function crm_touch_updated_at();

alter table crm_policies enable row level security;
drop policy if exists "admin all crm_policies" on crm_policies;
create policy "admin all crm_policies" on crm_policies
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Vista con días para el vencimiento y estado calculado (para listas y alertas)
create or replace view crm_policies_view with (security_invoker = true) as
select
  p.*,
  c.name as contact_name,
  c.phone as contact_phone,
  c.doc_number as contact_doc,
  (p.end_date - (now() at time zone 'America/Bogota')::date) as days_left,
  case
    when p.status in ('cancelada', 'renovada', 'cotizacion') then p.status
    when p.end_date is null then p.status
    when p.end_date < (now() at time zone 'America/Bogota')::date then 'vencida'
    when p.end_date <= (now() at time zone 'America/Bogota')::date + 30 then 'por_vencer'
    else 'vigente'
  end as computed_status
from crm_policies p
join crm_contacts c on c.id = p.contact_id;

-- ───────────── Importación desde CSV ─────────────
-- Todo como texto: se limpia y valida en crm_import_policies().
create table if not exists crm_policies_import (
  row_id bigserial primary key,
  cliente text,           -- nombre completo
  tipo_documento text,    -- CC, NIT, CE…
  documento text,         -- cédula / NIT
  telefono text,          -- celular (con o sin 57)
  email text,
  ciudad text,
  aseguradora text,
  numero_poliza text,
  ramo text,              -- autos, soat, salud, vida, hogar, obras civiles, cumplimiento, rc, otro
  producto text,
  bien_asegurado text,    -- placa, dirección…
  fecha_expedicion text,  -- 2026-03-15 o 15/03/2026
  inicio_vigencia text,
  fin_vigencia text,
  prima text,             -- 1.250.000 o 1250000
  estado text,            -- vigente, cancelada, renovada, cotizacion (vacío = vigente)
  ruta_archivo text,      -- ruta del PDF en OneDrive
  enlace_archivo text,    -- link compartido de OneDrive (opcional)
  carpeta_cliente text,   -- carpeta del cliente en OneDrive (opcional)
  notas text
);
alter table crm_policies_import enable row level security;
drop policy if exists "admin all crm_policies_import" on crm_policies_import;
create policy "admin all crm_policies_import" on crm_policies_import
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Fechas: acepta 2026-03-15, 15/03/2026, 15-03-2026 y 15/03/26
create or replace function crm_parse_date(p text) returns date language plpgsql immutable as $$
declare s text := btrim(coalesce(p, ''));
begin
  if s = '' then return null; end if;
  if s ~ '^\d{4}-\d{1,2}-\d{1,2}' then return to_date(left(s, 10), 'YYYY-MM-DD'); end if;
  if s ~ '^\d{1,2}[/-]\d{1,2}[/-]\d{4}$' then return to_date(replace(s, '-', '/'), 'DD/MM/YYYY'); end if;
  if s ~ '^\d{1,2}[/-]\d{1,2}[/-]\d{2}$' then return to_date(replace(s, '-', '/'), 'DD/MM/YY'); end if;
  raise exception 'fecha no reconocida: %', s;
end $$;

create or replace function crm_parse_line(p text) returns text language sql immutable as $$
  select case
    when x ~ 'soat' then 'soat'
    when x ~ '(auto|vehic|carro|moto|todo riesgo)' then 'auto'
    when x ~ '(salud|prepagada|medic)' then 'salud'
    when x ~ '(vida|exequi|funera)' then 'vida'
    when x ~ '(hogar|propied|inmueble|casa|apartamento|local|incendio|terremoto)' then 'propiedades'
    when x ~ '(cumplimiento|seriedad|anticipo)' then 'cumplimiento'
    when x ~ '(obra|construc|civil)' then 'obras-civiles'
    when x ~ '(responsabilidad|^rc$|rce)' then 'responsabilidad-civil'
    else 'otro' end
  from (select crm_norm(p) as x) t
$$;

create or replace function crm_import_policies()
returns table (fila bigint, resultado text, detalle text)
language plpgsql security definer set search_path = public as $$
declare
  r crm_policies_import;
  v_doc text; v_phone text; v_contact uuid; v_policy uuid; v_existing uuid;
  v_other_doc text; v_other_name text; v_note text;
  v_ok int := 0; v_err int := 0;
begin
  for r in select * from crm_policies_import order by row_id loop
    begin
      v_doc := nullif(upper(regexp_replace(coalesce(r.documento, ''), '[^0-9A-Za-z]', '', 'g')), '');
      v_phone := nullif(regexp_replace(coalesce(r.telefono, ''), '\D', '', 'g'), '');
      if v_phone is not null and length(v_phone) = 10 and left(v_phone, 1) = '3' then v_phone := '57' || v_phone; end if;
      if coalesce(btrim(r.cliente), '') = '' then raise exception 'falta el nombre del cliente'; end if;
      if coalesce(btrim(r.aseguradora), '') = '' then raise exception 'falta la aseguradora'; end if;
      if v_doc is null and v_phone is null then raise exception 'falta documento o teléfono para identificar al cliente'; end if;

      -- Cliente: primero por documento, luego por teléfono
      v_contact := null; v_note := '';
      if v_doc is not null then select id into v_contact from crm_contacts where doc_number = v_doc; end if;
      if v_contact is null and v_phone is not null then
        select id, doc_number, coalesce(name, wa_name) into v_contact, v_other_doc, v_other_name
        from crm_contacts where phone = v_phone;
        if v_contact is not null and v_other_doc is not null and v_doc is not null and v_other_doc <> v_doc then
          raise exception 'el teléfono % ya es de % (documento %)', v_phone, v_other_name, v_other_doc;
        end if;
        if v_contact is not null and crm_norm(v_other_name) is distinct from crm_norm(btrim(r.cliente)) then
          v_note := ' ⚠ unido por teléfono al contacto "' || coalesce(v_other_name, '?') || '"';
        end if;
      end if;

      if v_contact is null then
        insert into crm_contacts (name, phone, email, doc_type, doc_number, city, onedrive_folder, source, status)
        values (btrim(r.cliente), v_phone, nullif(btrim(r.email), ''), nullif(upper(btrim(r.tipo_documento)), ''),
                v_doc, nullif(btrim(r.ciudad), ''), nullif(btrim(r.carpeta_cliente), ''), 'import', 'cliente')
        returning id into v_contact;
      else
        update crm_contacts set
          name = coalesce(nullif(name, ''), btrim(r.cliente)),
          phone = coalesce(phone, v_phone),
          email = coalesce(email, nullif(btrim(r.email), '')),
          doc_type = coalesce(doc_type, nullif(upper(btrim(r.tipo_documento)), '')),
          doc_number = coalesce(doc_number, v_doc),
          city = coalesce(city, nullif(btrim(r.ciudad), '')),
          onedrive_folder = coalesce(nullif(btrim(r.carpeta_cliente), ''), onedrive_folder),
          status = case when status in ('nuevo', 'en_conversacion', 'cotizando') then 'cliente' else status end
        where id = v_contact;
      end if;

      -- Póliza: misma aseguradora + número = se actualiza; si no, se crea
      v_existing := null;
      if nullif(btrim(r.numero_poliza), '') is not null then
        select id into v_existing from crm_policies
        where lower(insurer) = lower(btrim(r.aseguradora)) and policy_number = btrim(r.numero_poliza);
      end if;

      if v_existing is null then
        insert into crm_policies (contact_id, insurer, policy_number, line, product, insured_item, issue_date,
                                  start_date, end_date, premium, status, file_path, file_url, notes, source)
        values (v_contact, btrim(r.aseguradora), nullif(btrim(r.numero_poliza), ''), crm_parse_line(r.ramo),
                nullif(btrim(r.producto), ''), nullif(btrim(r.bien_asegurado), ''),
                crm_parse_date(r.fecha_expedicion), crm_parse_date(r.inicio_vigencia), crm_parse_date(r.fin_vigencia),
                nullif(regexp_replace(coalesce(r.prima, ''), '[^0-9]', '', 'g'), '')::numeric,
                coalesce(nullif(lower(btrim(r.estado)), ''), 'vigente'),
                nullif(btrim(r.ruta_archivo), ''), nullif(btrim(r.enlace_archivo), ''), nullif(btrim(r.notas), ''), 'import')
        returning id into v_policy;
        fila := r.row_id; resultado := 'creada'; detalle := btrim(r.cliente) || ' · ' || btrim(r.aseguradora) || coalesce(' ' || btrim(r.numero_poliza), '') || v_note;
      else
        update crm_policies set
          contact_id = v_contact,
          line = crm_parse_line(r.ramo),
          product = coalesce(nullif(btrim(r.producto), ''), product),
          insured_item = coalesce(nullif(btrim(r.bien_asegurado), ''), insured_item),
          issue_date = coalesce(crm_parse_date(r.fecha_expedicion), issue_date),
          start_date = coalesce(crm_parse_date(r.inicio_vigencia), start_date),
          end_date = coalesce(crm_parse_date(r.fin_vigencia), end_date),
          premium = coalesce(nullif(regexp_replace(coalesce(r.prima, ''), '[^0-9]', '', 'g'), '')::numeric, premium),
          status = coalesce(nullif(lower(btrim(r.estado)), ''), status),
          file_path = coalesce(nullif(btrim(r.ruta_archivo), ''), file_path),
          file_url = coalesce(nullif(btrim(r.enlace_archivo), ''), file_url),
          notes = coalesce(nullif(btrim(r.notas), ''), notes)
        where id = v_existing;
        fila := r.row_id; resultado := 'actualizada'; detalle := btrim(r.cliente) || ' · ' || btrim(r.aseguradora) || ' ' || btrim(r.numero_poliza) || v_note;
      end if;
      delete from crm_policies_import where row_id = r.row_id;   -- solo se borran las filas que entraron bien
      v_ok := v_ok + 1;
      return next;
    exception when others then
      v_err := v_err + 1;
      fila := r.row_id; resultado := 'ERROR'; detalle := coalesce(r.cliente, '?') || ': ' || sqlerrm;
      return next;   -- la fila con error se queda en crm_policies_import para corregirla
    end;
  end loop;
  fila := null; resultado := 'RESUMEN'; detalle := v_ok || ' cargadas, ' || v_err || ' con error';
  return next;
end $$;

revoke all on function crm_import_policies() from public, anon;
grant execute on function crm_import_policies() to authenticated, service_role;
