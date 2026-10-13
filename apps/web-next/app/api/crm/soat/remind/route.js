import { supabaseAdmin, json } from "@/lib/serverAuth";
import { sendMessage, sendTemplate, windowOpen } from "@/lib/gupshup";

// Recordatorio diario de SOAT a cada asesor activo (crm_advisors).
// La llama Supabase (crm_soat_daily vía pg_cron + pg_net, 8 a. m.) con x-push-secret.
//
// Ventana de 24 h de WhatsApp:
//  · Si el asesor escribió al bot en las últimas 24 h → se le mandan ya los recordatorios
//    listos para reenviar (imagen + texto de la plantilla del cliente + enlace wa.me).
//  · Si no → plantilla GUPSHUP_TPL_ASESOR_ID ({{1}} nombre, {{2}} cantidad) con el botón
//    de respuesta rápida "Ver recordatorios". Al tocarlo, el asesor abre la ventana y el bot
//    le responde con los recordatorios (crm_advisor_step → crm_advisor_reminders).
//  · Respaldo: GUPSHUP_TPL_SOAT_ID ({{1}} cantidad, {{2}} placas).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const env = process.env;
  if (!env["PUSH_SECRET"] || request.headers.get("x-push-secret") !== env["PUSH_SECRET"]) {
    return json({ error: "forbidden" }, 403);
  }
  const body = await request.json().catch(() => ({}));
  const sb = supabaseAdmin();

  const { data: pending, error: e1 } = await sb.rpc("crm_advisor_pending_count");
  if (e1) return json({ error: e1.message }, 500);
  const count = Number(pending || 0);
  if (!count) return json({ ok: true, count: 0, results: [] });

  const { data: advisors, error } = await sb.from("crm_advisors").select("phone, name").eq("active", true);
  if (error) return json({ error: error.message }, 500);

  const tplAsesor = env["GUPSHUP_TPL_ASESOR_ID"];
  const tplSoat = env["GUPSHUP_TPL_SOAT_ID"];
  const results = [];
  for (const { phone, name } of advisors || []) {
    try {
      if (await windowOpen(sb, phone)) {
        const { data: msgs, error: e2 } = await sb.rpc("crm_advisor_reminders", { p_advisor: phone, p_limit: 5 });
        if (e2) throw new Error(e2.message);
        for (const m of Array.isArray(msgs) ? msgs : []) await sendMessage(sb, phone, m);
        results.push({ phone, sent: "reminders", n: (msgs || []).length });
      } else if (tplAsesor) {
        const first = String(name || "asesor").trim().split(/\s+/)[0];
        await sendTemplate(
          sb, phone, tplAsesor, [first, String(count)],
          `Hola ${first}, hoy tienes ${count} SOAT por recordar a clientes. [Ver recordatorios]`
        );
        results.push({ phone, sent: "template_asesor" });
      } else if (tplSoat) {
        const plates = String(body.plates || "").replace(/\s+/g, " ").slice(0, 900);
        await sendTemplate(sb, phone, tplSoat, [String(count), plates], body.text || `${count} SOAT por vencer`);
        results.push({ phone, sent: "template_soat" });
      } else {
        results.push({ phone, sent: false, reason: "fuera de la ventana de 24 h y sin plantilla GUPSHUP_TPL_ASESOR_ID" });
      }
    } catch (e) {
      results.push({ phone, sent: false, reason: e.message });
    }
  }
  return json({ ok: true, count, results });
}
