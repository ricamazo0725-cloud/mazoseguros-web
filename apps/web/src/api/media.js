import { supabase } from "@/lib/supabaseClient";

/**
 * Sube un archivo de imagen al bucket "fotos" y devuelve su URL pública.
 * folder agrupa las imágenes dentro del bucket (ej. "hero", "blog", "seguros").
 */
export async function uploadImage(file, folder = "general") {
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

/**
 * Borra una imagen del bucket a partir de su URL pública (si vive en este proyecto de Supabase).
 */
export async function deleteImageByUrl(url) {
  const marker = "/object/public/fotos/";
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.slice(idx + marker.length);
  const { error } = await supabase.storage.from("fotos").remove([path]);
  if (error) throw error;
}
