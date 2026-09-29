import { supabase } from "@/lib/supabaseClient";

// Pólizas por cliente (tablas en apps/web/supabase/crm_policies.sql). Solo /admin.

export const LINES = {
  auto: "Autos",
  soat: "SOAT",
  salud: "Salud",
  vida: "Vida",
  propiedades: "Hogar y propiedades",
  "obras-civiles": "Obras civiles",
  cumplimiento: "Cumplimiento",
  "responsabilidad-civil": "Responsabilidad civil",
  otro: "Otro",
};

export const POLICY_STATUS = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencida: "Vencida",
  renovada: "Renovada",
  cancelada: "Cancelada",
  cotizacion: "Cotización",
};

// Sugerencias para el campo aseguradora (se puede escribir cualquier otra)
export const INSURERS = ["Sura", "Previsora", "Equidad", "Solidaria", "Estado", "HDI", "Qualitas", "Mundial", "SBS", "Allianz", "AXA", "Bolívar", "Liberty"];

function sb() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}
function check({ data, error }) {
  if (error) throw error;
  return data;
}

export async function listPolicies({ search = "", filter = "por_vencer", line = "" } = {}) {
  let q = sb().from("crm_policies_view").select("*").limit(500);
  if (filter === "por_vencer") q = q.eq("computed_status", "por_vencer").order("end_date", { ascending: true });
  else if (filter === "vencida") q = q.eq("computed_status", "vencida").order("end_date", { ascending: false });
  else if (filter === "vigente") q = q.in("computed_status", ["vigente", "por_vencer"]).order("end_date", { ascending: true });
  else q = q.order("end_date", { ascending: true, nullsFirst: false });
  if (line) q = q.eq("line", line);
  const term = search.trim().replace(/[%,()]/g, "");
  if (term) {
    q = q.or(
      `contact_name.ilike.%${term}%,policy_number.ilike.%${term}%,insured_item.ilike.%${term}%,insurer.ilike.%${term}%,contact_doc.ilike.%${term}%`
    );
  }
  return check(await q) ?? [];
}

export async function policiesForContact(contactId) {
  return (
    check(
      await sb().from("crm_policies_view").select("*").eq("contact_id", contactId).order("end_date", { ascending: false, nullsFirst: false })
    ) ?? []
  );
}

const EDITABLE = [
  "insurer", "policy_number", "line", "product", "insured_item", "issue_date", "start_date", "end_date",
  "premium", "status", "file_path", "file_url", "notes",
];

function clean(p) {
  const out = {};
  for (const k of EDITABLE) {
    let v = p[k];
    if (typeof v === "string") v = v.trim();
    if (v === "" || v === undefined) v = null;
    if (k === "premium" && v !== null) v = Number(String(v).replace(/[^\d]/g, "")) || null;
    out[k] = v;
  }
  return out;
}

export async function savePolicy(contactId, policy) {
  const data = clean(policy);
  if (!data.insurer) throw new Error("Escribe la aseguradora.");
  if (policy.id) {
    return check(await sb().from("crm_policies").update(data).eq("id", policy.id).select().single());
  }
  const { data: row, error } = await sb()
    .from("crm_policies")
    .insert({ ...data, contact_id: contactId, status: data.status || "vigente", line: data.line || "otro" })
    .select()
    .single();
  if (error?.code === "23505") throw new Error("Ya existe una póliza con ese número en esa aseguradora.");
  if (error) throw error;
  return row;
}

export async function deletePolicy(id) {
  check(await sb().from("crm_policies").delete().eq("id", id));
}

export function fmtDate(d) {
  if (!d) return "—";
  return new Date(`${d}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });
}

export function fmtMoney(n) {
  if (n === null || n === undefined) return "—";
  return Number(n).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

export function daysLabel(days) {
  if (days === null || days === undefined) return "";
  if (days < 0) return `venció hace ${-days} d`;
  if (days === 0) return "vence hoy";
  return `vence en ${days} d`;
}
