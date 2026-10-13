// Solo para rutas de servidor (app/api/*). Envía mensajes de WhatsApp por Gupshup
// y los registra en el historial del CRM.

const API = "https://api.gupshup.io/wa/api/v1";

function cfg() {
  const env = process.env;
  const apiKey = env["GUPSHUP_API_KEY"];
  const source = env["GUPSHUP_SOURCE"];
  const appName = env["GUPSHUP_APP_NAME"];
  if (!apiKey || !source || !appName) throw new Error("Faltan las variables GUPSHUP_* en el servidor");
  return { apiKey, source, appName };
}

async function post(path, fields) {
  const { apiKey, source, appName } = cfg();
  const form = new URLSearchParams({ channel: "whatsapp", source, "src.name": appName, ...fields });
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { apikey: apiKey, "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });
  const raw = await res.text();
  let gs;
  try {
    gs = JSON.parse(raw);
  } catch {
    gs = { status: "error", raw };
  }
  if (!res.ok || gs.status === "error") {
    throw new Error("Gupshup rechazó el mensaje: " + String(gs.message || raw).slice(0, 200));
  }
  return gs;
}

// Texto libre (solo dentro de la ventana de 24 h desde el último mensaje de esa persona)
export async function sendText(sb, phone, text, sentBy = "botmazo") {
  const gs = await post("msg", { destination: phone, message: JSON.stringify({ type: "text", text }) });
  await sb.rpc("crm_log_outbound", {
    p_phone: phone,
    p_body: text,
    p_wa_message_id: gs.messageId || null,
    p_sent_by: sentBy,
    p_status: gs.status || "submitted",
    p_raw: gs,
  });
  return gs;
}

// Cualquier mensaje de sesión ya armado (texto, imagen, botones…), p. ej. los que
// devuelve crm_advisor_reminders. Solo dentro de la ventana de 24 h.
export async function sendMessage(sb, phone, message, logText, sentBy = "botmazo") {
  const gs = await post("msg", { destination: phone, message: JSON.stringify(message) });
  await sb.rpc("crm_log_outbound", {
    p_phone: phone,
    p_body: logText || message.text || message.caption || `[${message.type}]`,
    p_wa_message_id: gs.messageId || null,
    p_sent_by: sentBy,
    p_status: gs.status || "submitted",
    p_raw: gs,
  });
  return gs;
}

// Plantilla aprobada por Meta (sirve fuera de la ventana de 24 h).
// imageUrl: si la plantilla tiene encabezado de imagen, el enlace público de la imagen.
export async function sendTemplate(sb, phone, templateId, params, logText, sentBy = "botmazo", imageUrl = null) {
  const fields = { destination: phone, template: JSON.stringify({ id: templateId, params }) };
  if (imageUrl) fields.message = JSON.stringify({ type: "image", image: { link: imageUrl } });
  const gs = await post("template/msg", fields);
  await sb.rpc("crm_log_outbound", {
    p_phone: phone,
    p_body: logText,
    p_wa_message_id: gs.messageId || null,
    p_sent_by: sentBy,
    p_status: gs.status || "submitted",
    p_raw: gs,
  });
  return gs;
}

// Último mensaje entrante y horas que le quedan a la ventana de 24 h (0 = cerrada)
export async function windowInfo(sb, phone) {
  const { data: c } = await sb.from("crm_contacts").select("id").eq("phone", phone).maybeSingle();
  if (!c) return { open: false, hoursLeft: 0, lastIn: null };
  const { data: last } = await sb
    .from("crm_messages")
    .select("created_at")
    .eq("contact_id", c.id)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!last) return { open: false, hoursLeft: 0, lastIn: null };
  const left = 23.5 - (Date.now() - new Date(last.created_at).getTime()) / 3600000;
  return { open: left > 0, hoursLeft: Math.max(0, Math.floor(left * 10) / 10), lastIn: last.created_at };
}

// ¿Esta persona escribió en las últimas 24 h? (WhatsApp solo deja texto libre en esa ventana)
export async function windowOpen(sb, phone) {
  const { data: c } = await sb.from("crm_contacts").select("id").eq("phone", phone).maybeSingle();
  if (!c) return false;
  const { data: last } = await sb
    .from("crm_messages")
    .select("created_at")
    .eq("contact_id", c.id)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return !!last && Date.now() - new Date(last.created_at).getTime() < 23.5 * 60 * 60 * 1000;
}
