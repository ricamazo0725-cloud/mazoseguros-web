import { supabase } from "@/lib/supabaseClient";

export async function getPublishedPosts() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("published", true)
    .order("published_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// Versión que nunca lanza — usada en Server Components públicos (home, /blog)
// para que un problema de red o de credenciales degrade a "sin artículos" en
// vez de romper la página completa.
export async function getPublishedPostsSafe() {
  try {
    return await getPublishedPosts();
  } catch (err) {
    console.warn("No se pudieron cargar los artículos del blog:", err.message);
    return [];
  }
}

export async function getPostBySlug(slug) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("published", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAllPosts() {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("blog_posts")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createPost(post) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase.from("blog_posts").insert(post).select().single();
  if (error) throw error;
  return data;
}

export async function updatePost(id, post) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { error } = await supabase.from("blog_posts").update(post).eq("id", id);
  if (error) throw error;
}

export async function deletePost(id) {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { error } = await supabase.from("blog_posts").delete().eq("id", id);
  if (error) throw error;
}
