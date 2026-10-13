import { supabaseAdmin, requireAdmin, json } from "@/lib/serverAuth";
import { sendText, sendTemplate, windowOpen } from "@/lib/gupshup";
import { sendMail, mailConfigured } from "@/lib/mailer";

// Recordatorio AL CLIENTE de vencimiento de SOAT y tecnomecánica, por WhatsApp y correo.
//  · Automático: Supabase (pg_cron → crm_vehicle_notify_run) lo llama cada día con x-push-secret.
//  · Manual: el admin lo llama con su sesión y { kind, id } para enviar uno ya ("Enviar ahora").
// WhatsApp fuera de la ventana de 24 h solo con plantilla: GUPSHUP_TPL_VENCIMIENTO_ID con 4 parámetros
//   {{1}} nombre · {{2}} documento ("SOAT" / "revisión técnico-mecánica") · {{3}} placa · {{4}} fecha.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const LABEL = { soat: "SOAT", rtm: "revisión técnico-mecánica" };
const SITE_WA = "573011367055";
const SITE_CALL = "301 278 8799";

function fmt(ymd) {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
}
function when(days) {
  if (days < 0) return `venció hace ${-days} ${-days === 1 ? "día" : "días"}`;
  if (days === 0) return "vence HOY";
  if (days === 1) return "vence mañana";
  return `vence en ${days} días`;
}
const firstName = (n) => (String(n || "").trim().split(/\s+/)[0] || "").replace(/^./, (c) => c.toUpperCase());
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// Parámetros de la plantilla de Meta en el orden de {{1}}, {{2}}…; se configura con
// GUPSHUP_TPL_VENCIMIENTO_PARAMS (por defecto "nombre,documento,placa,fecha"). Valores posibles:
// nombre (nombre de pila), nombre_completo, documento (SOAT / revisión técnico-mecánica), placa,
// fecha (30 de marzo de 2027), fecha_corta (30/03/2027), dias, aseguradora
function templateParams(it) {
  const order = (process.env["GUPSHUP_TPL_VENCIMIENTO_PARAMS"] || "nombre,documento,placa,fecha")
    .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  const [y, m, d] = String(it.expiry).split("-");
  const values = {
    nombre: firstName(it.name) || "cliente",
    nombre_completo: String(it.name || "cliente").trim(),
    documento: LABEL[it.kind],
    placa: it.plate,
    fecha: fmt(it.expiry),
    fecha_corta: `${d}/${m}/${y}`,
    dias: String(it.days_left),
    aseguradora: it.extra || "",
  };
  return order.map((k) => (values[k] ?? "").toString().replace(/\s+/g, " ").trim() || "-");
}

function messages(it) {
  const doc = LABEL[it.kind];
  const name = firstName(it.name);
  const date = fmt(it.expiry);
  const wa =
    `Hola${name ? " " + name : ""} 👋, te saluda Mazoseguros.\n\n` +
    `Te recordamos que ${it.kind === "soat" ? "el" : "la"} *${doc}* de tu vehículo de placa *${it.plate}* ${when(it.days_left)} (${date}).\n\n` +
    (it.kind === "soat"
      ? "Circular sin SOAT genera multa e inmovilización del vehículo. Responde este mensaje y te lo renovamos hoy mismo. 🚗"
      : "Circular con la revisión vencida genera multa e inmovilización. Si quieres, te ayudamos a agendarla. 🔧");
  const subject = `${it.kind === "soat" ? "Tu SOAT" : "Tu revisión técnico-mecánica"} de ${it.plate} ${when(it.days_left)}`;
  const text = wa.replace(/\*/g, "") + `\n\nWhatsApp: https://wa.me/${SITE_WA} · Llámanos: ${SITE_CALL}\nMazoseguros LTDA · mazoseguros.com`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f2ec;font-family:Arial,Helvetica,sans-serif;color:#1c2a44">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#1c2a44;color:#fff;padding:18px 24px;border-radius:8px 8px 0 0;font-size:18px;font-weight:bold">Mazoseguros</div>
  <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;line-height:1.5">
    <p>Hola${name ? " " + esc(name) : ""},</p>
    <p>Te recordamos que ${it.kind === "soat" ? "el" : "la"} <b>${esc(doc)}</b> de tu vehículo de placa
      <b style="font-family:monospace;font-size:16px">${esc(it.plate)}</b> <b>${esc(when(it.days_left))}</b> (${esc(date)}).</p>
    <p>${it.kind === "soat"
      ? "Circular sin SOAT genera multa e inmovilización del vehículo. Escríbenos y te lo renovamos hoy mismo."
      : "Circular con la revisión vencida genera multa e inmovilización. Si quieres, te ayudamos a agendarla."}</p>
    <p style="margin:28px 0">
      <a href="https://wa.me/${SITE_WA}?text=${encodeURIComponent(`Hola, quiero renovar ${it.kind === "soat" ? "el SOAT" : "la tecnomecánica"} de ${it.plate}`)}"
         style="background:#b5401f;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Escríbenos por WhatsApp</a>
    </p>
    <p style="font-size:13px;color:#666">O llámanos al ${SITE_CALL}. Mazoseguros LTDA · <a href="https://mazoseguros.com" style="color:#666">mazoseguros.com</a></p>
  </div>
</div></body></html>`;
  return { wa, subject, text, html };
}

async function notifyOne(sb, it, { mark }) {
  const { wa, subject, text, html } = messages(it);
  const log = [];
  const base = { contact_id: it.contact_id || null, kind: it.kind, ref_id: it.id, plate: it.plate, days_left: it.days_left };

  // WhatsApp
  if (!it.phone) {
    log.push({ ...base, channel: "whatsapp", status: "omitido", detail: "sin celular" });
  } else {
    try {
      const tpl = process.env["GUPSHUP_TPL_VENCIMIENTO_ID"];
      if (await windowOpen(sb, it.phone)) {
        await sendText(sb, it.phone, wa, "recordatorio");
        log.push({ ...base, channel: "whatsapp", destination: it.phone, status: "enviado", detail: "texto (ventana 24 h abierta)" });
      } else if (tpl) {
        await sendTemplate(sb, it.phone, tpl, templateParams(it), wa, "recordatorio");
        log.push({ ...base, channel: "whatsapp", destination: it.phone, status: "enviado", detail: "plantilla" });
      } else {
        log.push({ ...base, channel: "whatsapp", destination: it.phone, status: "omitido",
                   detail: "sin plantilla GUPSHUP_TPL_VENCIMIENTO_ID (fuera de la ventana de 24 h)" });
      }
    } catch (e) {
      log.push({ ...base, channel: "whatsapp", destination: it.phone, status: "error", detail: e.message.slice(0, 300) });
    }
  }

  // Correo
  if (!it.email) {
    log.push({ ...base, channel: "email", status: "omitido", detail: "sin correo" });
  } else if (!mailConfigured()) {
    log.push({ ...base, channel: "email", destination: it.email, status: "omitido", detail: "SMTP sin configurar" });
  } else {
    try {
      await sendMail({ to: it.email, subject, text, html });
      log.push({ ...base, channel: "email", destination: it.email, status: "enviado" });
    } catch (e) {
      log.push({ ...base, channel: "email", destination: it.email, status: "error", detail: e.message.slice(0, 300) });
    }
  }

  await sb.from("crm_notifications").insert(log);
  const sent = log.some((l) => l.status === "enviado");
  // Solo se marca si llegó por algún canal: si no, se reintenta mañana
  if (mark && sent) await sb.rpc("crm_vehicle_mark", { p_kind: it.kind, p_id: it.id, p_threshold: it.threshold });
  return { plate: it.plate, kind: it.kind, sent, log: log.map(({ channel, status, detail }) => ({ channel, status, detail })) };
}

export async function POST(request) {
  const env = process.env;
  const body = await request.json().catch(() => ({}));
  let sb;
  let manual = false;
  if (env["PUSH_SECRET"] && request.headers.get("x-push-secret") === env["PUSH_SECRET"]) {
    sb = supabaseAdmin();
  } else {
    const auth = await requireAdmin(request);
    if (auth.error) return json({ error: auth.error }, auth.status);
    if (!body.kind || !body.id) return json({ error: "Falta kind o id" }, 400);
    sb = supabaseAdmin(); // las funciones de aviso solo las ejecuta la service_role
    manual = true;
  }

  const { data: items, error } = await sb.rpc("crm_vehicle_due", {
    p_kind: manual ? body.kind : null,
    p_id: manual ? body.id : null,
  });
  if (error) return json({ error: error.message }, 500);

  const results = [];
  for (const it of items || []) results.push(await notifyOne(sb, it, { mark: !manual }));

  if (!manual && results.length) {
    const ok = results.filter((r) => r.sent).length;
    await sb.rpc("crm_notify", {
      p_title: `📨 Recordatorios de vencimiento: ${ok}/${results.length} enviados`,
      p_body: results.map((r) => `${r.plate} (${r.kind === "soat" ? "SOAT" : "RTM"})${r.sent ? "" : " ✗"}`).join(" · "),
      p_url: "/admin?tab=soat",
      p_tag: "vehicle-notify",
    });
  }
  if (manual && !results.length) return json({ error: "No se encontró el registro o no tiene fecha de vencimiento" }, 404);
  return json({ ok: true, results });
}
