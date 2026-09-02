import { supabase } from "@/lib/supabaseClient";

/**
 * Sube un archivo de imagen al bucket "fotos" y devuelve su URL pública.
 * Solo se usa desde el panel /admin (Client Component) — nunca durante el
 * build ni en Server Components.
 */
export async function uploadImage(file, folder = "general") {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const ext = file.name.split(".").pop();
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from("fotos").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;

  const { data } = supabase.storage.from("fotos").getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteImageByUrl(url) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const marker = "/object/public/fotos/";
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length);
  const { error } = await supabase.storage.from("fotos").remove([path]);
  if (error) throw error;
}
