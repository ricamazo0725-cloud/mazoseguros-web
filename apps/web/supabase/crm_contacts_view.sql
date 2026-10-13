-- Vista para la lista del CRM: segmento del cliente y próximo vencimiento.
-- Ejecutar DESPUÉS de crm_policies.sql, crm_soat.sql y crm_vehicle_reminders.sql. Se puede correr varias veces.
-- También crea crm_expirations_view (todos los vencimientos: pólizas, SOAT y tecnomecánica) para el Tablero.
--   segment:  cliente   → tiene pólizas (además puede tener SOAT)
--             solo_soat → solo tiene SOAT / tecnomecánica
--             prospecto → todavía no tiene nada (lead, cotización, conversación)
-- Nombre de aseguradora unificado ("AXA COLPATRIA", "Axa", "axa colpatria s.a." → "AXA Colpatria")
create or replace function crm_insurer_label(p text) returns text language sql immutable as $$
  select case
    when x = '' then null
    when x ~ 'sura' then 'SURA'
    when x ~ 'axa|colpatria' then 'AXA Colpatria'
    when x ~ 'mundial' then 'Seguros Mundial'
    when x ~ 'hdi|liberty' then 'HDI (Liberty)'
    when x ~ 'previsora' then 'La Previsora'
    when x ~ 'estado' then 'Seguros del Estado'
    when x ~ 'bolivar' then 'Seguros Bolívar'
    when x ~ 'allianz' then 'Allianz'
    when x ~ 'equidad' then 'La Equidad'
    when x ~ 'solidaria' then 'Solidaria'
    when x ~ 'mapfre' then 'Mapfre'
    when x ~ 'qualitas' then 'Qualitas'
    when x ~ 'sbs' then 'SBS'
    when x ~ 'zurich' then 'Zurich'
    when x ~ 'chubb' then 'Chubb'
    when x ~ 'positiva' then 'Positiva'
    when x ~ 'alfa' then 'Seguros Alfa'
    else initcap(btrim(p)) end
  from (select crm_norm(coalesce(p, '')) as x) t
$$;

drop view if exists crm_expirations_view;
drop view if exists crm_contacts_view;
create view crm_contacts_view with (security_invoker = true) as
select c.*,
  coalesce(p.n, 0) as policies_count,
  coalesce(s.n, 0) as soat_count,
  s.plates as soat_plates,
  ins.labels as insurers,
  case when coalesce(p.n, 0) > 0 then 'cliente'
       when coalesce(s.n, 0) > 0 or coalesce(r.n, 0) > 0 then 'solo_soat'
       else 'prospecto' end as segment,
  nx.next_kind, nx.next_date, nx.next_date - crm_today() as next_days
from crm_contacts c
left join lateral (select count(*) n from crm_policies x where x.contact_id = c.id) p on true
left join lateral (
  select count(*) n, string_agg(distinct x.plate, ', ') plates from crm_soat x where x.contact_id = c.id
) s on true
left join lateral (select count(*) n from crm_rtm x where x.contact_id = c.id) r on true
left join lateral (
  select string_agg(distinct l, ', ') labels from (
    select crm_insurer_label(x.insurer) l from crm_policies x where x.contact_id = c.id
    union select crm_insurer_label(x.insurer) from crm_soat x where x.contact_id = c.id
  ) z where l is not null
) ins on true
-- próximo vencimiento (o el último vencido si no hay ninguno por venir): SOAT, RTM o póliza
left join lateral (
  select kind as next_kind, d as next_date from (
    select 'soat' kind, x.end_date d from crm_soat x
      where x.contact_id = c.id and x.end_date is not null
        and not exists (select 1 from crm_soat n where n.plate = x.plate and n.end_date > x.end_date)
    union all
    select 'rtm', x.expiry_date from crm_rtm x
      where x.contact_id = c.id and x.expiry_date is not null
        and not exists (select 1 from crm_rtm n where n.plate = x.plate and n.expiry_date > x.expiry_date)
    union all
    select 'poliza', x.end_date from crm_policies x
      where x.contact_id = c.id and x.end_date is not null and x.status = 'vigente'
  ) v
  order by (d < crm_today()), case when d >= crm_today() then d end asc, d desc
  limit 1
) nx on true;

-- Todos los vencimientos en una sola lista (última vigencia de cada placa / cada póliza vigente o vencida)
create view crm_expirations_view with (security_invoker = true) as
select v.*, v.end_date - crm_today() as days_left,
  coalesce(nullif(c.name, ''), c.wa_name, v.holder) as contact_name,
  coalesce(c.phone, v.holder_phone) as phone,
  c.advisor
from (
  select 'poliza'::text as kind, p.id, p.contact_id, crm_insurer_label(p.insurer) as insurer, p.line,
         coalesce(p.insured_item, p.product) as item, p.policy_number as ref, p.end_date, p.premium,
         null::text as follow_up, null::text as holder, null::text as holder_phone
  from crm_policies p
  where p.end_date is not null and p.status in ('vigente', 'vencida')
  union all
  select 'soat', s.id, s.contact_id, crm_insurer_label(s.insurer), 'soat', s.plate, s.policy_number, s.end_date, s.premium,
         s.follow_up, s.owner_name, s.owner_phone
  from crm_soat s
  where s.end_date is not null
    and not exists (select 1 from crm_soat n where n.plate = s.plate and n.end_date > s.end_date)
  union all
  select 'rtm', r.id, r.contact_id, coalesce(r.center_name, 'CDA'), 'rtm', r.plate, r.certificate_number, r.expiry_date, null,
         r.follow_up, null, null
  from crm_rtm r
  where r.expiry_date is not null
    and not exists (select 1 from crm_rtm n where n.plate = r.plate and n.expiry_date > r.expiry_date)
) v
left join crm_contacts c on c.id = v.contact_id;
