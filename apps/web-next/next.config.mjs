/** @type {import('next').NextConfig} */
const nextConfig = {
  // Este proyecto usa renderizado en servidor + ISR (ver `revalidate` en
  // app/page.jsx, app/blog/page.jsx y app/blog/[slug]/page.jsx): los
  // artículos nuevos publicados desde /admin aparecen solos (dentro de la
  // ventana de revalidación) sin necesitar un rebuild. Se despliega en el
  // plan de Hostinger con soporte de Node.js Apps (integración de GitHub
  // específica para Node.js — build y restart automáticos en cada push),
  // así que NO se activa "output: export" — eso desactivaría el ISR.
  //
  // Si en algún momento el hosting cambia a algo sin Node.js, descomenten
  // la siguiente línea (y ver apps/web-next/MIGRACION.md, sección
  // "Alternativa: exportación estática" para lo que implica).
  //
  // output: "export",

  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
};

export default nextConfig;
