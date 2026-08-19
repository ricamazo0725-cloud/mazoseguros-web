import { supabase } from "@/lib/supabaseClient";

export async function getSection(section) {
  const { data, error } = await supabase
    .from("site_content")
    .select("data")
    .eq("section", section)
    .maybeSingle();
  if (error) throw error;
  return data?.data ?? null;
}

export async function getAllSections() {
  const { data, error } = await supabase.from("site_content").select("section, data");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.section, row.data]));
}

export async function upsertSection(section, data) {
  const { error } = await supabase
    .from("site_content")
    .upsert({ section, data, updated_at: new Date().toISOString() }, { onConflict: "section" });
  if (error) throw error;
}
