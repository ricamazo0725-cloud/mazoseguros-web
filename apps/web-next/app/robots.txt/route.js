import seoConfig from "@/config/seo.json";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || seoConfig.siteUrl;

// Idéntico al apps/web/public/robots.txt original. Se sirve como ruta en vez
// de archivo estático porque necesitamos las líneas Crawl-delay, que la API
// tipada app/robots.js de Next.js no soporta.
// force-static: el contenido no depende de nada por-request (solo una env
// var de build), así que se puede generar una vez y exportar como archivo
// estático — obligatorio para que "output: export" (Hostinger) funcione.
export const dynamic = "force-static";

export async function GET() {
  const body = `User-agent: *
Allow: /
Disallow: /admin

Sitemap: ${siteUrl}/sitemap.xml

# Desacelera bots agresivos
User-agent: MJ12bot
Crawl-delay: 10

User-agent: AhrefsBot
Crawl-delay: 10
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain" },
  });
}
