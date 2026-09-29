import { requireAdmin, json } from "@/lib/serverAuth";

// Respuesta de un asesor desde /admin → WhatsApp (Gupshup) + historial del CRM.
// Mientras el asesor atiende, el bot queda en silencio (bot_state = 'asesor').
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return json({ error: auth.error }, auth.status);
  const { sb, user } = auth;

  const { contactId, text, audioPath } = await request.json().catch(() => ({}));
  const body = String(text || "").trim();
  if (!contactId || (!body && !audioPath)) return json({ error: "Falta el contacto o el mensaje" }, 400);
  if (audioPath && !/^out\/[\w-]+\/[\w.-]+\.ogg$/.test(audioPath)) return json({ error: "Ruta de audio inválida" }, 400);
  if (body.length > 4000) return json({ error: "El mensaje es demasiado largo" }, 400);

  const { GUPSHUP_API_KEY: apiKey, GUPSHUP_SOURCE: source, GUPSHUP_APP_NAME: appName } = process.env;
  if (!apiKey || !source || !appName) return json({ error: "Faltan las variables GUPSHUP_* en el servidor" }, 500);

  const { data: contact, error } = await sb.from("crm_contacts").select("id, phone").eq("id", contactId).single();
  if (error || !contact) return json({ error: "Contacto no encontrado" }, 404);

  // Regla de WhatsApp: texto libre solo dentro de 24 h desde el último mensaje del cliente
  const { data: lastIn } = await sb
    .from("crm_messages")
    .select("created_at")
    .eq("contact_id", contactId)
    .eq("direction", "in")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastIn || Date.now() - new Date(lastIn.created_at).getTime() > WINDOW_MS) {
    return json(
      { error: "Pasaron más de 24 h desde el último mensaje del cliente. WhatsApp solo permite escribirle con una plantilla aprobada." },
      409
    );
  }

  // Nota de voz: se envía un enlace temporal (7 días) al archivo en el bucket privado
  let waMessage = { type: "text", text: body };
  if (audioPath) {
    const { data: signed, error: signErr } = await sb.storage.from("crm-media").createSignedUrl(audioPath, 60 * 60 * 24 * 7);
    if (signErr) return json({ error: "No se encontró el audio: " + signErr.message }, 400);
    waMessage = { type: "audio", url: signed.signedUrl };
  }

  const form = new URLSearchParams({
    channel: "whatsapp",
    source,
    destination: contact.phone,
    "src.name": appName,
    message: JSON.stringify(waMessage),
  });
  const res = await fetch("https://api.gupshup.io/wa/api/v1/msg", {
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
    return json({ error: "Gupshup rechazó el mensaje: " + (gs.message || raw).toString().slice(0, 200) }, 502);
  }

  const sentBy = (user.email || "asesor").split("@")[0];
  if (audioPath) {
    await sb.from("crm_messages").insert({
      contact_id: contactId,
      direction: "out",
      type: "audio",
      body: null,
      media_path: audioPath,
      media_mime: "audio/ogg",
      wa_message_id: gs.messageId || null,
      status: gs.status || "submitted",
      sent_by: sentBy,
      raw: gs,
    });
    await sb.from("crm_contacts").update({ last_message_at: new Date().toISOString() }).eq("id", contactId);
  } else {
    await sb.rpc("crm_log_outbound", {
      p_phone: contact.phone,
      p_body: body,
      p_wa_message_id: gs.messageId || null,
      p_sent_by: sentBy,
      p_status: gs.status || "submitted",
      p_raw: gs,
    });
  }
  // El asesor tomó la conversación: el bot se calla (12 h desde el último mensaje del asesor)
  await sb
    .from("crm_contacts")
    .update({ bot_state: "asesor", bot_data: { taken_by: sentBy }, bot_updated_at: new Date().toISOString(), unread_count: 0 })
    .eq("id", contactId);

  return json({ ok: true, messageId: gs.messageId || null });
}
