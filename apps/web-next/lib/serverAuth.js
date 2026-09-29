// Solo para rutas de servidor (app/api/*): nunca importar desde componentes del navegador.
import { createClient } from "@supabase/supabase-js";

// Cliente con la service_role key: SOLO para rutas de servidor (app/api/*).
// La key vive en las variables de entorno de Hostinger, nunca en el navegador.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Valida el token de sesión del admin que llama la ruta (header Authorization: Bearer ...).
// Si ADMIN_EMAILS está definido, además exige que el correo esté en esa lista.
export async function requireAdmin(request) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: "No autenticado", status: 401 };
  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) return { error: "Sesión inválida", status: 401 };
  const allowed = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length && !allowed.includes((data.user.email || "").toLowerCase())) {
    return { error: "No autorizado", status: 403 };
  }
  return { user: data.user, sb };
}

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
