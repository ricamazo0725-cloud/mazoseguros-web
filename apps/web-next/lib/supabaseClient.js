import { createClient } from "@supabase/supabase-js";

// Misma anon key pública que ya usa apps/web (VITE_SUPABASE_ANON_KEY) — es
// segura de exponer al navegador por diseño; las políticas RLS en Supabase
// (ver apps/web/supabase/schema.sql) son las que controlan qué se puede leer
// y escribir. Este cliente funciona igual desde un Server Component (build /
// ISR) que desde un Client Component (formulario de cotización, panel admin).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!supabaseConfigured && typeof window !== "undefined") {
  // En el navegador sí avisamos fuerte — en el servidor dejamos que cada
  // función de lib/content.js, lib/blog.js, etc. maneje el fallback sin
  // tumbar el build cuando todavía no hay variables de entorno configuradas.
  // eslint-disable-next-line no-console
  console.warn(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY. Revisa .env.local (ver .env.local.example)."
  );
}

export const supabase = supabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
