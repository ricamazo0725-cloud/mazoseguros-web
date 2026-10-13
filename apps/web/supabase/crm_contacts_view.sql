-- Vista para la lista del CRM: segmento del cliente y próximo vencimiento.
-- Ejecutar DESPUÉS de crm_policies.sql, crm_soat.sql y crm_vehicle_reminders.sql. Se puede correr varias veces.
--   segment:  cliente   → tiene pólizas (además puede tener SOAT)
--             solo_soat → solo tiene SOAT / tecnomecánica
--             prospecto → todavía no tiene nada (lead, cotización, conversación)
drop view if exists crm_contacts_view;
create view crm_contacts_view with (security_invoker = true) as
select c.*,
  coalesce(p.n, 0) as policies_count,
  coalesce(s.n, 0) as soat_count,
  s.plates as soat_plates,
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
