import { supabaseAdmin, json } from "@/lib/serverAuth";
import { sendText, sendTemplate, windowOpen } from "@/lib/gupshup";

// Recordatorio diario de SOAT por vencer → WhatsApp a cada asesor activo.
// La llama Supabase (crm_soat_daily vía pg_cron + pg_net) con x-push-secret.
// WhatsApp solo deja texto libre si el asesor le escribió al bot en las últimas 24 h;
// si no, usa la plantilla GUPSHUP_TPL_SOAT_ID (si está configurada) con 2 parámetros:
//   {{1}} = cuántos SOAT vencen, {{2}} = placas.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  const env = process.env;
  if (!env["PUSH_SECRET"] || request.headers.get("x-push-secret") !== env["PUSH_SECRET"]) {
    return json({ error: "forbidden" }, 403);
  }
  const { text, count, plates } = await request.json().catch(() => ({}));
  if (!text) return json({ error: "Falta el texto" }, 400);

  const sb = supabaseAdmin();
  const { data: advisors, error } = await sb.from("crm_advisors").select("phone").eq("active", true);
  if (error) return json({ error: error.message }, 500);

  const tpl = env["GUPSHUP_TPL_SOAT_ID"];
  const results = [];
  for (const { phone } of advisors || []) {
    try {
      if (await windowOpen(sb, phone)) {
        await sendText(sb, phone, text + "\n\nEscribe una placa para ver el detalle.");
        results.push({ phone, sent: "text" });
      } else if (tpl) {
        const p2 = String(plates || "").replace(/\s+/g, " ").slice(0, 900);
        await sendTemplate(sb, phone, tpl, [String(count || ""), p2], text);
        results.push({ phone, sent: "template" });
      } else {
        results.push({ phone, sent: false, reason: "fuera de la ventana de 24 h y sin plantilla" });
      }
    } catch (e) {
      results.push({ phone, sent: false, reason: e.message });
    }
  }
  return json({ ok: true, results });
}
