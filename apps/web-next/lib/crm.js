import { supabase } from "@/lib/supabaseClient";

// Todo lo de este archivo se usa solo desde /admin (sesión autenticada).
// Las tablas y funciones están en apps/web/supabase/crm.sql.

export const TZ = "America/Bogota";

export const CONTACT_STATUS = {
  nuevo: "Nuevo",
  en_conversacion: "En conversación",
  cotizando: "Cotizando",
  cliente: "Cliente",
  perdido: "Perdido",
};

export const APPOINTMENT_STATUS = {
  pendiente: "Pendiente",
  confirmada: "Confirmada",
  realizada: "Realizada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

export const MODALITY = { llamada: "Llamada", videollamada: "Videollamada", presencial: "Presencial" };

export const TOPICS = {
  auto: "Autos",
  propiedades: "Propiedades",
  salud: "Salud",
  vida: "Vida",
  "obras-civiles": "Obras civiles",
  otro: "Otro",
};

function need() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}

function check({ data, error }) {
  if (error) throw error;
  return data;
}

// ───────────── Contactos y mensajes ─────────────

export async function listContacts({ search = "", status = "" } = {}) {
  let q = need()
    .from("crm_contacts")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  const term = search.trim().replace(/[%,()]/g, "");
  if (term) q = q.or(`name.ilike.%${term}%,wa_name.ilike.%${term}%,phone.ilike.%${term.replace(/\D/g, "") || term}%`);
  return check(await q) ?? [];
}

export async function updateContact(id, patch) {
  return check(await need().from("crm_contacts").update(patch).eq("id", id).select().single());
}

export async function getMessages(contactId) {
  return (
    check(
      await need()
        .from("crm_messages")
        .select("id, direction, type, body, status, sent_by, created_at")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: true })
        .limit(500)
    ) ?? []
  );
}

export async function markRead(contactId) {
  check(await need().from("crm_contacts").update({ unread_count: 0 }).eq("id", contactId));
}

// ───────────── Agenda ─────────────

export async function getAgendaConfig() {
  return check(await need().from("crm_agenda_config").select("*").eq("id", 1).single());
}

export async function saveAgendaConfig(patch) {
  const { id, updated_at, ...rest } = patch;
  return check(await need().from("crm_agenda_config").update(rest).eq("id", 1).select().single());
}

export async function getAvailableSlots(day /* "YYYY-MM-DD" */) {
  return check(await need().rpc("crm_available_slots", { p_day: day })) ?? [];
}

export async function listAppointments(fromIso, toIso) {
  return (
    check(
      await need()
        .from("crm_appointments")
        .select("*")
        .gte("starts_at", fromIso)
        .lt("starts_at", toIso)
        .order("starts_at", { ascending: true })
    ) ?? []
  );
}

export async function createAppointment(appt) {
  const { data, error } = await need().from("crm_appointments").insert(appt).select().single();
  if (error?.code === "23P01") throw new Error("Ese horario ya está ocupado por otra cita.");
  if (error) throw error;
  return data;
}

export async function updateAppointment(id, patch) {
  const { data, error } = await need().from("crm_appointments").update(patch).eq("id", id).select().single();
  if (error?.code === "23P01") throw new Error("Ese horario se cruza con otra cita activa.");
  if (error) throw error;
  return data;
}

// ───────────── Formato de fechas (siempre en hora de Colombia) ─────────────

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("es-CO", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: true });
}

export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString("es-CO", {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function fmtDay(ymd) {
  // ymd = "YYYY-MM-DD"; mediodía UTC para que ninguna zona horaria lo corra de día
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-CO", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// "Hoy" en Colombia como "YYYY-MM-DD"
export function todayYmd() {
  return new Date().toLocaleDateString("en-CA", { timeZone: TZ });
}

export function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Inicio de un día de Colombia (UTC-5, sin horario de verano) en ISO
export function dayStartIso(ymd) {
  return new Date(`${ymd}T00:00:00-05:00`).toISOString();
}

export function waLink(phone) {
  return `https://wa.me/${String(phone || "").replace(/\D/g, "")}`;
}

// ───────────── Responder desde el admin ─────────────

export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function sendReply(contactId, text) {
  const { data } = await need().auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
  const res = await fetch("/api/crm/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ contactId, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Error ${res.status}`);
  return body;
}

// true = el bot vuelve a atender; false = el asesor toma la conversación (bot en silencio)
export async function setBotActive(contactId, active) {
  return updateContact(contactId, {
    bot_state: active ? null : "asesor",
    bot_data: active ? {} : { taken_by: "admin" },
    bot_updated_at: new Date().toISOString(),
  });
}
