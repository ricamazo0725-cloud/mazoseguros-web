import { supabase } from "@/lib/supabaseClient";

// SOAT (tabla crm_soat, ver apps/web/supabase/crm_soat.sql). Solo desde /admin.

export const SOAT_STATUS = {
  vigente: "Vigente",
  por_vencer: "Por vencer",
  vencido: "Vencido",
  renovado: "Renovado",
  sin_fecha: "Sin fecha",
};

function sb() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}
function check({ data, error }) {
  if (error) throw error;
  return data;
}

export async function listSoat({ search = "", filter = "por_vencer" } = {}) {
  let q = sb().from("crm_soat_view").select("*").limit(500);
  if (filter === "por_vencer") q = q.eq("computed_status", "por_vencer").order("end_date", { ascending: true });
  else if (filter === "vencido") q = q.eq("computed_status", "vencido").order("end_date", { ascending: false });
  else if (filter === "vigente") q = q.in("computed_status", ["vigente", "por_vencer"]).order("end_date", { ascending: true });
  else q = q.order("created_at", { ascending: false });
  const term = search.trim().replace(/[%,()]/g, "");
  if (term) {
    const plate = term.toUpperCase().replace(/[^0-9A-Z]/g, "");
    q = q.or(
      `plate.ilike.%${plate || term}%,owner_name.ilike.%${term}%,owner_doc.ilike.%${term}%,owner_phone.ilike.%${term}%,policy_number.ilike.%${term}%`
    );
  }
  return check(await q) ?? [];
}

export async function soatForContact(contactId) {
  return (
    check(await sb().from("crm_soat_view").select("*").eq("contact_id", contactId).order("end_date", { ascending: false })) ?? []
  );
}

const EDITABLE = [
  "plate", "vehicle_class", "brand", "model_line", "model_year", "service", "owner_name", "owner_doc_type", "owner_doc",
  "owner_phone", "owner_city", "insurer", "policy_number", "start_date", "end_date", "premium", "notes",
];

function clean(s) {
  const out = {};
  for (const k of EDITABLE) {
    let v = s[k];
    if (typeof v === "string") v = v.trim();
    if (v === "" || v === undefined) v = null;
    if ((k === "premium" || k === "model_year") && v !== null) v = Number(String(v).replace(/[^\d]/g, "")) || null;
    if (k === "plate" && v) v = v.toUpperCase().replace(/[^0-9A-Z]/g, "");
    if ((k === "owner_doc") && v) v = v.toUpperCase().replace(/[^0-9A-Z]/g, "");
    if (k === "owner_phone" && v) {
      v = v.replace(/\D/g, "");
      if (v.length === 10 && v.startsWith("3")) v = "57" + v;
    }
    out[k] = v;
  }
  return out;
}

export async function saveSoat(soat) {
  const data = clean(soat);
  if (!data.plate) throw new Error("Escribe la placa.");
  const prev = soat.id ? soat._original : null;
  // Si cambió la fecha de vencimiento, los recordatorios vuelven a empezar
  if (prev && prev.end_date !== data.end_date) data.reminders_sent = [];
  data.updated_at = new Date().toISOString();
  const q = soat.id
    ? sb().from("crm_soat").update(data).eq("id", soat.id)
    : sb().from("crm_soat").insert({ ...data, contact_id: soat.contact_id || null, created_by: "admin" });
  const { data: row, error } = await q.select().single();
  if (error?.code === "23505") throw new Error("Ya hay un SOAT de esa placa con ese mismo vencimiento.");
  if (error) throw error;
  return row;
}

export async function deleteSoat(id) {
  check(await sb().from("crm_soat").delete().eq("id", id));
}

// Sube la foto/PDF y la manda a leer con IA (crea o actualiza el SOAT)
export async function uploadAndReadSoat(file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `soat/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await sb().storage.from("crm-media").upload(path, file, { contentType: file.type || undefined });
  if (error) throw new Error("No se pudo subir el archivo: " + error.message);
  const { data } = await sb().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  const res = await fetch("/api/crm/soat/read", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ path }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && !body?.text) throw new Error(body.error || `Error ${res.status}`);
  return body; // { ok, id, text }
}

// Asesores que usan el modo asesor del bot
export async function listAdvisors() {
  return check(await sb().from("crm_advisors").select("*").order("created_at")) ?? [];
}
export async function saveAdvisor(phone, name) {
  let p = String(phone || "").replace(/\D/g, "");
  if (p.length === 10 && p.startsWith("3")) p = "57" + p;
  if (p.length < 11) throw new Error("Escribe el celular completo.");
  return check(await sb().from("crm_advisors").upsert({ phone: p, name: name || null, active: true }).select().single());
}
export async function setAdvisorActive(phone, active) {
  check(await sb().from("crm_advisors").update({ active }).eq("phone", phone));
}

// ───────────── Tecnomecánica (crm_rtm, ver crm_vehicle_reminders.sql) ─────────────
export async function listRtm({ search = "", filter = "por_vencer" } = {}) {
  let q = sb().from("crm_rtm_view").select("*").limit(500);
  if (filter === "por_vencer") q = q.eq("computed_status", "por_vencer").order("expiry_date", { ascending: true });
  else if (filter === "vencido") q = q.eq("computed_status", "vencido").order("expiry_date", { ascending: false });
  else if (filter === "vigente") q = q.in("computed_status", ["vigente", "por_vencer"]).order("expiry_date", { ascending: true });
  else q = q.order("created_at", { ascending: false });
  const term = search.trim().replace(/[%,()]/g, "");
  if (term) {
    const plate = term.toUpperCase().replace(/[^0-9A-Z]/g, "");
    q = q.or(`plate.ilike.%${plate || term}%,contact_name.ilike.%${term}%,certificate_number.ilike.%${term}%,center_name.ilike.%${term}%`);
  }
  return check(await q) ?? [];
}

export async function rtmForContact(contactId) {
  return check(await sb().from("crm_rtm_view").select("*").eq("contact_id", contactId).order("expiry_date", { ascending: false })) ?? [];
}

export async function saveRtm(r) {
  const data = {
    plate: String(r.plate || "").toUpperCase().replace(/[^0-9A-Z]/g, "") || null,
    certificate_number: r.certificate_number?.trim() || null,
    center_name: r.center_name?.trim() || null,
    issue_date: r.issue_date || null,
    expiry_date: r.expiry_date || null,
    notes: r.notes?.trim() || null,
  };
  if (!data.plate) throw new Error("Escribe la placa.");
  if (!data.expiry_date) throw new Error("Escribe la fecha de vencimiento.");
  const q = r.id
    ? sb().from("crm_rtm").update(data).eq("id", r.id)
    : sb().from("crm_rtm").insert({ ...data, contact_id: r.contact_id || null, created_by: "admin" });
  const { data: row, error } = await q.select().single();
  if (error?.code === "23505") throw new Error("Ya hay una tecnomecánica de esa placa con ese vencimiento.");
  if (error) throw error;
  return row;
}

export async function deleteRtm(id) {
  check(await sb().from("crm_rtm").delete().eq("id", id));
}

// ───────────── Recordatorios al cliente ─────────────
export async function sendReminderNow(kind, id) {
  const { data } = await sb().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  const res = await fetch("/api/crm/vehicles/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind, id }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body.results?.[0];
}

export async function listNotifications(limit = 50) {
  return check(await sb().from("crm_notifications").select("*").order("created_at", { ascending: false }).limit(limit)) ?? [];
}
