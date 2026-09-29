-- Audios (y otros archivos) del chat de WhatsApp en el CRM.
-- Ejecutar DESPUÉS de crm.sql y crm_push.sql. Se puede correr varias veces.
--
-- Entrantes: los enlaces de WhatsApp a los archivos vencen, así que apenas llega
-- un audio/imagen/documento, un trigger le pide a mazoseguros.com/api/crm/media/ingest
-- (con pg_net) que lo descargue y lo guarde en el bucket privado "crm-media".
-- Salientes: el admin graba la nota de voz, la sube a "crm-media/out/..." y
-- /api/crm/send la envía por Gupshup con un enlace temporal.

alter table crm_messages add column if not exists media_path text;   -- ruta dentro del bucket crm-media
alter table crm_messages add column if not exists media_mime text;
alter table crm_messages add column if not exists media_error text;  -- si no se pudo descargar, el motivo

-- Bucket privado (solo el admin autenticado y el servidor pueden leer/escribir)
insert into storage.buckets (id, name, public)
values ('crm-media', 'crm-media', false)
on conflict (id) do nothing;

drop policy if exists "admin read crm-media" on storage.objects;
create policy "admin read crm-media" on storage.objects
  for select using (bucket_id = 'crm-media' and auth.role() = 'authenticated');
drop policy if exists "admin upload crm-media" on storage.objects;
create policy "admin upload crm-media" on storage.objects
  for insert with check (bucket_id = 'crm-media' and auth.role() = 'authenticated');

-- Mensaje entrante con archivo → pedir que se descargue y guarde
create or replace function crm_trg_media_ingest() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_base text;
  v_secret text;
begin
  if new.direction <> 'in' or new.type not in ('audio', 'voice', 'image', 'document', 'video', 'sticker') then
    return new;
  end if;
  select regexp_replace(value, '/api/.*$', '') into v_base from crm_private_config where key = 'push_url';
  select value into v_secret from crm_private_config where key = 'push_secret';
  if v_base is null or v_secret is null then return new; end if;

  perform net.http_post(
    url := v_base || '/api/crm/media/ingest',
    body := jsonb_build_object('messageId', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 20000
  );
  return new;
exception when others then
  raise warning 'crm_trg_media_ingest: %', sqlerrm;
  return new;
end $$;

drop trigger if exists crm_messages_media on crm_messages;
create trigger crm_messages_media after insert on crm_messages
  for each row execute function crm_trg_media_ingest();

-- Reintentar a mano los que fallaron (por ejemplo, antes de configurar todo):
--   select net.http_post(
--     url := (select regexp_replace(value, '/api/.*$', '') from crm_private_config where key = 'push_url') || '/api/crm/media/ingest',
--     body := jsonb_build_object('messageId', id),
--     headers := jsonb_build_object('Content-Type', 'application/json',
--                'x-push-secret', (select value from crm_private_config where key = 'push_secret')))
--   from crm_messages where direction = 'in' and type in ('audio','image','document') and media_path is null;
