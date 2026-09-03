import seoConfig from "@/config/seo.json";
import { getPublishedPostsSafe } from "@/lib/blog";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || seoConfig.siteUrl;

// Este proyecto corre en modo servidor + ISR (ver next.config.mjs — NO usa
// "output: export"), así que este sitemap se regenera solo, sin necesidad
// de un build nuevo: cada post que se publique o edite desde /admin (pestaña
// Blog) aparece acá automáticamente. El "revalidate" es solo la ventana de
// caché — hasta 1h para que la próxima visita a /sitemap.xml recoja los
// cambios más recientes de Supabase.
export const revalidate = 3600;

// Se genera a partir de las rutas reales que existen en el código (app/) más
// los slugs de blog que de verdad están publicados en Supabase — nunca a
// mano. Es matemáticamente imposible que vuelva a pasar lo que encontró la
// auditoría (sitemap.xml listando /blog y /agentes mientras devolvían 404):
// si la página no existe como archivo/ruta, no puede aparecer aquí.
//
// Nota: /agentes NO se incluye porque no existe como ruta en este proyecto
// (tampoco existía ya en apps/web/src/App.jsx) — si el negocio decide
// recrearla, agregar su entrada aquí junto con el archivo de la página.
export default async function sitemap() {
  const posts = await getPublishedPostsSafe();

  const staticRoutes = [
    { url: siteUrl, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
    { url: `${siteUrl}/blog`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
  ];

  const postRoutes = posts.map((post) => ({
    url: `${siteUrl}/blog/${post.slug}`,
    lastModified: post.published_at ? new Date(post.published_at) : new Date(),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  return [...staticRoutes, ...postRoutes];
}
