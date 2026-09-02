import { supabase } from "@/lib/supabaseClient";

export async function getSection(section) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("site_content")
    .select("data")
    .eq("section", section)
    .maybeSingle();
  if (error) throw error;
  return data?.data ?? null;
}

export async function getAllSections() {
  if (!supabase) return {};
  const { data, error } = await supabase.from("site_content").select("section, data");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.section, row.data]));
}

export async function upsertSection(section, data) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { error } = await supabase
    .from("site_content")
    .upsert({ section, data, updated_at: new Date().toISOString() }, { onConflict: "section" });
  if (error) throw error;
}

// Igual que getAllSections, pero nunca lanza — para usar desde Server
// Components donde preferimos degradar a los valores por defecto de cada
// componente (ver Hero.jsx, About.jsx, InsuranceCategories.jsx) en vez de
// tumbar el render si Supabase no responde (por ejemplo, en este entorno de
// verificación, que no tiene salida de red hacia Supabase).
export async function getAllSectionsSafe() {
  try {
    return await getAllSections();
  } catch (err) {
    console.warn("No se pudo cargar site_content:", err.message);
    return {};
  }
}
