import webpush from "web-push";
import { supabaseAdmin, json } from "@/lib/serverAuth";

// La llama Supabase (función crm_notify vía pg_net) cuando pasa algo que merece
// un aviso. Protegida con el header x-push-secret (= PUSH_SECRET).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  if (!process.env.PUSH_SECRET || request.headers.get("x-push-secret") !== process.env.PUSH_SECRET) {
    return json({ error: "forbidden" }, 403);
  }
  // Se leen con process.env[...] para que Next no las "congele" en el build.
  const env = process.env;
  const pub = env["NEXT_PUBLIC_VAPID_PUBLIC_KEY"] || env["VAPID_PUBLIC_KEY"];
  const priv = env["VAPID_PRIVATE_KEY"];
  const subject = env["VAPID_SUBJECT"] || "mailto:mazseguros@hotmail.com";
  const missing = [!pub && "NEXT_PUBLIC_VAPID_PUBLIC_KEY", !priv && "VAPID_PRIVATE_KEY"].filter(Boolean);
  if (missing.length) return json({ error: "Faltan variables en el servidor: " + missing.join(", ") }, 500);
  try {
    webpush.setVapidDetails(subject, pub.trim(), priv.trim());
  } catch (e) {
    return json({ error: "Llaves VAPID inválidas: " + e.message }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const body = JSON.stringify({
    title: String(payload.title || "Mazoseguros").slice(0, 120),
    body: String(payload.body || "").slice(0, 240),
    url: String(payload.url || "/admin").startsWith("/") ? payload.url : "/admin",
    tag: payload.tag || undefined,
  });

  const sb = supabaseAdmin();
  const { data: subs, error } = await sb.from("crm_push_subscriptions").select("id, endpoint, p256dh, auth");
  if (error) return json({ error: error.message }, 500);

  const ok = [];
  const gone = [];
  await Promise.all(
    (subs || []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60 * 12,
          urgency: "high",
        });
        ok.push(s.id);
      } catch (e) {
        // 404/410: el dispositivo ya no existe (desinstaló la app o quitó el permiso)
        if (e?.statusCode === 404 || e?.statusCode === 410) gone.push(s.id);
      }
    })
  );
  if (gone.length) await sb.from("crm_push_subscriptions").delete().in("id", gone);
  if (ok.length) await sb.from("crm_push_subscriptions").update({ last_used_at: new Date().toISOString() }).in("id", ok);
  return json({ sent: ok.length, removed: gone.length });
}
