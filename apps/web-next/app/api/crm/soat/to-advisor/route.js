import { requireAdmin, json } from "@/lib/serverAuth";
import { sendMessage, windowInfo } from "@/lib/gupshup";

// Envío MANUAL desde el admin: manda al asesor el recordatorio de un SOAT
// (imagen + texto para el cliente + enlace wa.me) como mensaje normal, sin plantilla.
// Solo funciona si el asesor le escribió al bot en las últimas 24 h.
//   GET  → asesores activos con el estado de su ventana de 24 h
//   POST { soat_id, advisor } → envía
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function botNumber() {
  return String(process.env["GUPSHUP_SOURCE"] || "").replace(/\D/g, "");
}

export async function GET(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return json({ error: auth.error }, auth.status);
  const sb = auth.sb;
  const { data, error } = await sb.from("crm_advisors").select("phone, name").eq("active", true).order("created_at");
  if (error) return json({ error: error.message }, 500);
  const advisors = await Promise.all((data || []).map(async (a) => ({ ...a, ...(await windowInfo(sb, a.phone)) })));
  return json({ bot: botNumber(), advisors });
}

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return json({ error: auth.error }, auth.status);
  const sb = auth.sb;
  const { soat_id, advisor } = await request.json().catch(() => ({}));
  if (!soat_id || !advisor) return json({ error: "Falta el SOAT o el asesor" }, 400);

  const { data: adv } = await sb.from("crm_advisors").select("phone, name").eq("phone", advisor).eq("active", true).maybeSingle();
  if (!adv) return json({ error: "Ese número no es un asesor activo" }, 400);

  const w = await windowInfo(sb, adv.phone);
  if (!w.open) {
    return json(
      { error: "El asesor no le ha escrito al bot en las últimas 24 h. Pídele que escriba *hola* al bot y vuelve a intentar.", window: false, bot: botNumber() },
      409
    );
  }

  const { data: msgs, error } = await sb.rpc("crm_reminder_for_advisor_id", { p_soat: soat_id, p_advisor: adv.phone });
  if (error) return json({ error: error.message }, 500);
  const by = "admin:" + String(auth.user?.email || "admin").split("@")[0];
  try {
    for (const m of Array.isArray(msgs) ? msgs : []) await sendMessage(sb, adv.phone, m, null, by);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
  return json({ ok: true, sent: (msgs || []).length, hoursLeft: w.hoursLeft });
}
