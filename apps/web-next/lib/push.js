import { supabase } from "@/lib/supabaseClient";

// Registro del service worker del admin + suscripción a notificaciones push.
const SW_URL = "/admin-sw.js";
const SCOPE = "/admin";

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

// iPhone/iPad solo permiten push cuando el admin está instalado en la pantalla de inicio
export function isIos() {
  return typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
}
export function isStandalone() {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true)
  );
}

export async function registerAdminSW() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: SCOPE });
  } catch (e) {
    console.warn("No se pudo registrar el service worker del admin", e);
    return null;
  }
}

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration(SCOPE);
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function enablePush(userEmail) {
  if (!pushSupported()) throw new Error("Este navegador no soporta notificaciones.");
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) throw new Error("Falta NEXT_PUBLIC_VAPID_PUBLIC_KEY en la configuración del sitio.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("No diste permiso de notificaciones.");

  const reg = (await registerAdminSW()) || (await navigator.serviceWorker.ready);
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) });
  }
  const j = sub.toJSON();
  const { error } = await supabase.from("crm_push_subscriptions").upsert(
    {
      endpoint: j.endpoint,
      p256dh: j.keys.p256dh,
      auth: j.keys.auth,
      user_email: userEmail || null,
      user_agent: navigator.userAgent.slice(0, 200),
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;
  return sub;
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from("crm_push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
