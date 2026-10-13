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

// Rangos de vencimiento para filtrar (sobre days_left = días que faltan; negativo = vencido)
export const BUCKETS = {
  vencido: { label: "⛔ Vencidos", hint: "sin renovar" },
  d7: { label: "🔥 Vencen ≤ 7 días", hint: "llamar ya" },
  d30: { label: "⏳ 8 a 30 días", hint: "enviar recordatorio" },
  d60: { label: "📅 31 a 60 días", hint: "preparar renovación" },
  vigente: { label: "✅ Vigentes", hint: "más de 60 días" },
  todos: { label: "Todos", hint: "" },
};

export const FOLLOW_UP = {
  "": "Sin gestionar",
  contactado: "Contactado",
  cotizado: "Cotizado",
  renovado: "Renovado con nosotros",
  perdido: "Perdido / renovó en otro lado",
};

function applyBucket(q, bucket) {
  if (bucket === "todos") return q;
  q = q.neq("computed_status", "renovado");
  if (bucket === "vencido") return q.lt("days_left", 0);
  if (bucket === "d7") return q.gte("days_left", 0).lte("days_left", 7);
  if (bucket === "d30") return q.gte("days_left", 8).lte("days_left", 30);
  if (bucket === "d60") return q.gte("days_left", 31).lte("days_left", 60);
  if (bucket === "vigente") return q.gt("days_left", 60);
  return q;
}

function applyCommon(q, { followUp = "all", advisor = "" }) {
  if (followUp === "none") q = q.is("follow_up", null);
  else if (followUp === "open") q = q.or("follow_up.is.null,follow_up.in.(contactado,cotizado)");
  else if (followUp && followUp !== "all") q = q.eq("follow_up", followUp);
  if (advisor === "__none") q = q.is("advisor", null);
  else if (advisor) q = q.eq("advisor", advisor);
  return q;
}

// kind: "soat" | "rtm"
export async function listVehicleDocs(kind, { search = "", bucket = "d30", followUp = "all", advisor = "" } = {}) {
  const view = kind === "rtm" ? "crm_rtm_view" : "crm_soat_view";
  const dateCol = kind === "rtm" ? "expiry_date" : "end_date";
  let q = sb().from(view).select("*").limit(1000);
  q = applyCommon(applyBucket(q, bucket), { followUp, advisor });
  q = q.order(dateCol, { ascending: bucket !== "vencido", nullsFirst: false });
  const term = search.trim().replace(/[%,()]/g, "");
  if (term) {
    const plate = term.toUpperCase().replace(/[^0-9A-Z]/g, "");
    q = q.or(
      kind === "rtm"
        ? `plate.ilike.%${plate || term}%,contact_name.ilike.%${term}%,certificate_number.ilike.%${term}%,center_name.ilike.%${term}%`
        : `plate.ilike.%${plate || term}%,owner_name.ilike.%${term}%,owner_doc.ilike.%${term}%,owner_phone.ilike.%${term}%,policy_number.ilike.%${term}%`
    );
  }
  return check(await q) ?? [];
}

export async function bucketCounts(kind, { followUp = "all", advisor = "" } = {}) {
  const view = kind === "rtm" ? "crm_rtm_view" : "crm_soat_view";
  const out = {};
  await Promise.all(
    Object.keys(BUCKETS).map(async (b) => {
      const q = applyCommon(applyBucket(sb().from(view).select("id", { count: "exact", head: true }), b), { followUp, advisor });
      const { count, error } = await q;
      out[b] = error ? null : count;
    })
  );
  return out;
}

export async function setFollowUp(kind, id, followUp, note) {
  const table = kind === "rtm" ? "crm_rtm" : "crm_soat";
  const patch = { follow_up: followUp || null, follow_up_at: new Date().toISOString() };
  if (note !== undefined) patch.follow_up_note = note || null;
  check(await sb().from(table).update(patch).eq("id", id));
}

// CSV (abre en Excel) con la lista que se está viendo, para llamar o hacer seguimiento
export function exportVehicleCsv(kind, rows) {
  const head = ["placa", "cliente", "celular", "aseguradora/CDA", "poliza/certificado", "vence", "dias", "gestion", "nota", "asesor"];
  const lines = rows.map((r) => [
    r.plate,
    r.owner_name || r.contact_name || "",
    r.owner_phone || r.contact_phone || "",
    kind === "rtm" ? r.center_name : r.insurer,
    kind === "rtm" ? r.certificate_number : r.policy_number,
    kind === "rtm" ? r.expiry_date : r.end_date,
    r.days_left,
    FOLLOW_UP[r.follow_up || ""],
    r.follow_up_note,
    r.advisor,
  ]);
  const esc = (v) => {
    const t = v == null ? "" : String(v);
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const csv = "\uFEFF" + [head, ...lines].map((l) => l.map(esc).join(";")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `${kind === "rtm" ? "tecnomecanica" : "soat"}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Compatibilidad con llamadas anteriores
export async function listSoat({ search = "", filter = "d30" } = {}) {
  return listVehicleDocs("soat", { search, bucket: filter });
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
export async function listRtm({ search = "", filter = "d30" } = {}) {
  return listVehicleDocs("rtm", { search, bucket: filter });
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
