import { supabaseAdmin, requireAdmin, json } from "@/lib/serverAuth";
import { sendText, sendTemplate, windowOpen } from "@/lib/gupshup";
import { sendMail, mailConfigured } from "@/lib/mailer";

// Felicitación de cumpleaños AL CLIENTE por WhatsApp y correo, con mensaje de posventa.
//  · Automático: Supabase (pg_cron → crm_birthdays_daily) lo llama el día del cumpleaños con x-push-secret.
//  · Manual: el admin lo llama con su sesión y { contactId } ("🎂 Enviar felicitación").
// WhatsApp fuera de la ventana de 24 h solo con plantilla: GUPSHUP_TPL_CUMPLEANOS_ID, 1 parámetro {{1}} = nombre.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const SITE_WA = "573011367055";
const SITE_CALL = "301 278 8799";
const LINE = {
  auto: "Autos", soat: "SOAT", salud: "Salud", vida: "Vida", propiedades: "Hogar", "obras-civiles": "Obras civiles",
  cumplimiento: "Cumplimiento", "responsabilidad-civil": "Responsabilidad civil", otro: "tu seguro",
};
const firstName = (n) => {
  const w = String(n || "").trim().split(/\s+/)[0] || "";
  return w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : "";
};
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (ymd) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-CO", { timeZone: "UTC", day: "numeric", month: "long" });
const joinEs = (arr) => (arr.length <= 1 ? arr.join("") : `${arr.slice(0, -1).join(", ")} y ${arr.at(-1)}`);

// Mensaje según la relación con el cliente: con pólizas → posventa + referidos; sin pólizas → asesoría de regalo
function buildMessage(c) {
  const name = firstName(c.name);
  const lines = (c.lines || []).map((l) => LINE[l] || l).filter((l) => l !== "tu seguro");
  const isClient = (c.lines || []).length > 0;
  const p = [];
  p.push(`¡Feliz cumpleaños${name ? ", " + name : ""}! 🎉🎂`);
  p.push(isClient ? "En Mazoseguros celebramos contigo y te agradecemos por confiarnos lo que más quieres." : "En Mazoseguros celebramos contigo este día tan especial.");
  if (isClient) {
    p.push(
      `Recuerda que con ${lines.length ? `${lines.length > 1 ? "tus seguros" : "tu seguro"} de ${joinEs(lines)}` : "tus seguros"} no estás solo: si tienes un siniestro, ` +
        "una duda con una reclamación o necesitas hacer un cambio (vehículo, beneficiarios, dirección), escríbenos y te acompañamos de principio a fin."
    );
    if (c.renewal?.end_date) {
      p.push(
        `Además, tu póliza de ${LINE[c.renewal.line] || "seguro"}${c.renewal.insurer ? ` con ${c.renewal.insurer}` : ""} ` +
          `vence el ${fmt(c.renewal.end_date)}; ya la tenemos en el radar para que la renueves sin preocupaciones y con el mejor precio.`
      );
    }
    p.push("🎁 Como regalo, te ofrecemos una *revisión gratuita de tus pólizas* para confirmar que sigues bien protegido.");
    p.push("Y si alguien cercano necesita asesoría en seguros, con gusto lo atendemos como a ti. 🤝");
  } else {
    p.push(
      "🎁 Como regalo de cumpleaños te ofrecemos una *asesoría gratuita* para revisar qué seguro te conviene " +
        "(autos, salud, vida u hogar) y cotizarte con varias aseguradoras, sin compromiso."
    );
    p.push("Si te interesa, solo responde este mensaje.");
  }
  p.push("Que tengas un día increíble. 💙\n— Equipo Mazoseguros");
  const wa = p.join("\n\n");
  const subject = `¡Feliz cumpleaños${name ? ", " + name : ""}! 🎉 Un saludo de Mazoseguros`;
  const text = wa.replace(/\*/g, "") + `\n\nWhatsApp: https://wa.me/${SITE_WA} · Llámanos: ${SITE_CALL}\nmazoseguros.com`;
  const html = `<!doctype html><html><body style="margin:0;background:#f5f2ec;font-family:Arial,Helvetica,sans-serif;color:#1c2a44">
<div style="max-width:560px;margin:0 auto;padding:24px">
  <div style="background:#1c2a44;color:#fff;padding:28px 24px;border-radius:8px 8px 0 0;text-align:center">
    <div style="font-size:40px">🎂</div>
    <div style="font-size:22px;font-weight:bold;margin-top:8px">¡Feliz cumpleaños${name ? ", " + esc(name) : ""}!</div>
  </div>
  <div style="background:#fff;padding:24px;border-radius:0 0 8px 8px;line-height:1.6">
    ${p.slice(1, -1).map((x) => `<p>${esc(x).replace(/\*(.+?)\*/g, "<b>$1</b>")}</p>`).join("\n    ")}
    <p style="margin:28px 0;text-align:center">
      <a href="https://wa.me/${SITE_WA}?text=${encodeURIComponent(isClient ? "Hola, quiero mi revisión gratuita de pólizas 🎁" : "Hola, quiero mi asesoría gratuita de cumpleaños 🎁")}"
         style="background:#b5401f;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">
         ${isClient ? "Pedir mi revisión gratuita" : "Pedir mi asesoría gratuita"}</a>
    </p>
    <p>Que tengas un día increíble. 💙<br>— Equipo Mazoseguros</p>
    <p style="font-size:13px;color:#666">Llámanos al ${SITE_CALL} · <a href="https://mazoseguros.com" style="color:#666">mazoseguros.com</a></p>
  </div>
</div></body></html>`;
  return { wa, subject, text, html, name };
}

async function greet(sb, c, { mark }) {
  const { wa, subject, text, html, name } = buildMessage(c);
  const base = { contact_id: c.contact_id, kind: "cumpleanos", ref_id: c.contact_id };
  const log = [];

  if (!c.phone) log.push({ ...base, channel: "whatsapp", status: "omitido", detail: "sin celular" });
  else {
    try {
      const tpl = process.env["GUPSHUP_TPL_CUMPLEANOS_ID"];
      if (await windowOpen(sb, c.phone)) {
        await sendText(sb, c.phone, wa, "cumpleaños");
        log.push({ ...base, channel: "whatsapp", destination: c.phone, status: "enviado", detail: "texto (ventana 24 h abierta)" });
      } else if (tpl) {
        await sendTemplate(sb, c.phone, tpl, [name || "cliente"], wa, "cumpleaños");
        log.push({ ...base, channel: "whatsapp", destination: c.phone, status: "enviado", detail: "plantilla" });
      } else {
        log.push({ ...base, channel: "whatsapp", destination: c.phone, status: "omitido",
                   detail: "sin plantilla GUPSHUP_TPL_CUMPLEANOS_ID (fuera de la ventana de 24 h)" });
      }
    } catch (e) {
      log.push({ ...base, channel: "whatsapp", destination: c.phone, status: "error", detail: e.message.slice(0, 300) });
    }
  }

  if (!c.email) log.push({ ...base, channel: "email", status: "omitido", detail: "sin correo" });
  else if (!mailConfigured()) log.push({ ...base, channel: "email", destination: c.email, status: "omitido", detail: "SMTP sin configurar" });
  else {
    try {
      await sendMail({ to: c.email, subject, text, html });
      log.push({ ...base, channel: "email", destination: c.email, status: "enviado" });
    } catch (e) {
      log.push({ ...base, channel: "email", destination: c.email, status: "error", detail: e.message.slice(0, 300) });
    }
  }

  await sb.from("crm_notifications").insert(log);
  const sent = log.some((l) => l.status === "enviado");
  if (sent) await sb.rpc("crm_birthday_mark", { p_id: c.contact_id });
  return { name: c.name, sent, log: log.map(({ channel, status, detail }) => ({ channel, status, detail })), preview: wa };
}

export async function POST(request) {
  const env = process.env;
  const body = await request.json().catch(() => ({}));
  let manual = false;
  if (!(env["PUSH_SECRET"] && request.headers.get("x-push-secret") === env["PUSH_SECRET"])) {
    const auth = await requireAdmin(request);
    if (auth.error) return json({ error: auth.error }, auth.status);
    if (!body.contactId) return json({ error: "Falta contactId" }, 400);
    manual = true;
  }
  const sb = supabaseAdmin();
  const { data: list, error } = await sb.rpc("crm_birthday_due", { p_id: manual ? body.contactId : null });
  if (error) return json({ error: error.message }, 500);
  if (manual && !list?.length) return json({ error: "El cliente no tiene fecha de cumpleaños" }, 404);

  // Vista previa sin enviar
  if (manual && body.preview) return json({ ok: true, preview: buildMessage(list[0]).wa });

  const results = [];
  for (const c of list || []) results.push(await greet(sb, c, { mark: !manual }));

  if (!manual && results.length) {
    await sb.rpc("crm_notify", {
      p_title: `🎂 Felicitaciones enviadas: ${results.filter((r) => r.sent).length}/${results.length}`,
      p_body: results.map((r) => `${r.name}${r.sent ? "" : " ✗"}`).join(" · "),
      p_url: "/admin",
      p_tag: "birthday-notify",
    });
  }
  return json({ ok: true, results });
}
