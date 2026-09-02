# apps/web-next — Migración a Next.js

Este es el mismo sitio de Mazoseguros (`apps/web`, React + Vite + Supabase), reconstruido en Next.js con renderizado en servidor. Se agregó como paquete **nuevo y separado** dentro del mismo monorepo pnpm — `apps/web` sigue intacto y en producción, nada se rompió. La idea es poder revisar, probar y comparar antes de cortar el tráfico real hacia acá.

## Qué resuelve esta migración

1. **Contenido visible para rastreadores y agentes de IA sin ejecutar JavaScript.** El problema raíz encontrado en la auditoría SEO: `apps/web` es una SPA en React puro — el HTML que entrega el servidor es un `<div id="root"></div>` vacío, y todo el contenido se genera después en el navegador. Aquí cada página pública (home, `/blog`, `/blog/[slug]`) es un Server Component: el HTML que sale del servidor ya trae el contenido real.
2. **Metadata única por página.** En `apps/web`, el `<title>` y la meta description eran fijos en `index.html` — literalmente los mismos en la home, en `/blog` y en cada artículo. Aquí cada ruta define los suyos (`app/blog/page.jsx`, `generateMetadata` en `app/blog/[slug]/page.jsx`).
3. **Sitemap que no puede desincronizarse.** Se genera dinámicamente (`app/sitemap.js`) a partir de las rutas reales del código + los slugs de blog que de verdad están publicados en Supabase. No puede volver a pasar lo que encontró la auditoría (sitemap apuntando a `/blog` y `/agentes` mientras devolvían 404).
4. **404 reales.** Una ruta o un post que no existe ahora devuelve un HTTP 404 de verdad (`notFound()` / `app/not-found.jsx`), no un 200 disfrazado como en la SPA.
5. **Menos JavaScript en el navegador.** `Logo`, `FloatingWhatsApp`, `Hero`, `About`, `InsuranceCategories` y `BlogPreview` ya no hacen su propio fetch al montar — reciben los datos resueltos por el servidor. Solo siguen siendo interactivos en el cliente: el formulario de cotización (`Contact.jsx`), el header por el efecto de scroll (`Header.jsx`), y todo el panel `/admin`.

## Qué NO cambió

- El modelo de datos: mismas tablas de Supabase (`site_content`, `blog_posts`, `quote_requests`), mismas políticas RLS, mismo bucket `fotos`. No hay que tocar la base de datos.
- El panel `/admin`: mismas pestañas, mismos campos, mismo flujo de login. Se portó casi línea por línea.
- El diseño: mismos tokens de color (`app/globals.css` = `index.css` original), mismo Tailwind, mismos componentes visuales.
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` deben ser **los mismos valores** que ya tienen en `.env` para `apps/web` (solo cambia el prefijo de `VITE_` a `NEXT_PUBLIC_`, ver `.env.local.example`).

## Dos bugs reales que se corrigieron de paso

Aparecieron al portar el código, no los introdujo la migración — ya estaban en `apps/web` y valen la pena arreglarlos ahí también si van a seguir esa rama viva en paralelo:

1. **`Contact.jsx`**: el botón de enviar tenía `{status === "sending"} Enviando…" : "Enviar solicitud"}` — le faltaba el `?` del ternario. En la práctica el texto del botón nunca cambiaba a "Enviando…" mientras se procesaba el formulario.
2. **`btn-secondary`**: la clase que usa el botón "Ver en Google Maps" en `Contact.jsx` nunca estuvo definida en `index.css` — el botón se veía sin estilo. Ya está definida en `app/globals.css`.

También quedó documentado (no corregido, porque no tengo los archivos): `index.html` referencia `/favicon.ico`, `/apple-touch-icon.png` y `https://mazoseguros.com/logo.png` (este último dentro del JSON-LD), pero ninguno de esos tres archivos existe en `apps/web/public/`. Van a dar 404 tanto en el sitio actual como en este proyecto nuevo hasta que se agreguen los archivos reales — ver "Pendientes" abajo.

## Cómo correrlo

```bash
cd apps/web-next
cp .env.local.example .env.local   # y completa con tus valores reales de Supabase
npm install
npm run dev                         # http://localhost:3000
```

Para producción:

```bash
npm run build
npm start
```

## Hosting: Hostinger, plan con Node.js Apps (Git integration)

Hostinger tiene dos integraciones de Git distintas y son fáciles de confundir:

1. **Git normal** (hPanel → Advanced/Avanzado → Git): conecta el repo y hace deploy automático en cada push, pero **no corre ningún build** — sube tal cual los archivos del repo. Sirve para HTML estático, PHP o WordPress, no para esto.
2. **Node.js Apps** (hPanel → Websites → Add Website → Node.js Apps → Import Git Repository): esta sí conecta el repo por GitHub, auto-detecta el framework (Next.js incluido), y en cada push corre `npm install` + el build command + reinicia el servidor automáticamente. Requiere plan **Business Web Hosting** o **Cloud Startup/Professional/Enterprise**.

Este proyecto usa la opción 2, así que se queda con **ISR** activo (`export const revalidate = 3600` en `app/page.jsx`, `app/blog/page.jsx` y `app/blog/[slug]/page.jsx`, ya en el código) — los artículos nuevos publicados desde `/admin` aparecen solos, sin rebuild manual. `next.config.mjs` NO tiene `output: "export"` activado (queda comentado, ver ese archivo) — es justo lo que habilita el ISR.

**Configuración a completar en hPanel** (pantalla "Despliegues" de la app de Node.js, sección de directorio/compilación):
- **Nombre del sitio web**: `mazoseguros.com` (o el que corresponda).
- **Directorio raíz**: `apps/web-next` — como este es un monorepo, hay que apuntar aquí en vez de `./` (la raíz del repo, que es lo que usa hoy la app existente para construir `apps/web`).
- **Gestor de paquetes**: `npm` (este subproyecto trae `package-lock.json`, no `pnpm-lock.yaml` — si el selector solo tiene `pnpm`/`npm`/`yarn`, elegir `npm`).
- **Comando de compilación**: `npm run build`.
- **Directorio de salida**: `.next` (es lo que genera `next build`; a diferencia de `apps/web`, esta carpeta no se sirve directo como archivos estáticos — la usa el servidor de Node al arrancar).
- **Archivo de entrada**: `server.js` — Hostinger necesita un script de Node real para poder mantener el proceso corriendo (no le sirve apuntar a `next start`, que es un binario de CLI). Por eso se agregó `apps/web-next/server.js`: un servidor mínimo con el patrón oficial de Next.js para despliegues custom, que solo envuelve `next()` y escucha en el puerto que Hostinger inyecte por `process.env.PORT`. `package.json` ya tiene `"start": "node server.js"` actualizado para que coincida.
- **Variables de entorno**: `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (mismos valores que ya usan en `apps/web/.env`, ver `.env.local.example`).
- **Versión de Node**: 20 o superior (`engines.node` en `package.json` ya lo exige).

⚠️ **Ojo con esto:** la app de Node.js que ya existe en hPanel (la que hoy sirve `mazoseguros.com`) está configurada con directorio raíz `./` y directorio de salida `dist/apps/web` — es decir, construye y sirve `apps/web` (el sitio React/Vite actual). Cambiar esos campos a los de arriba en esa MISMA app **reemplaza el sitio en producción de inmediato** en el siguiente deploy, sin período de prueba aparte. Si prefieren probar primero, la alternativa es crear una app de Node.js nueva y separada apuntando a `apps/web-next`, confirmarla funcionando (Hostinger asigna una URL propia antes de conectar el dominio), y solo después mover el dominio `mazoseguros.com` de una app a la otra.

**Detalle técnico de `/blog/[slug]`:** `generateStaticParams()` devuelve una ruta de relleno (`__sin-articulos-publicados-aun`) cuando todavía no hay artículos publicados en Supabase, para que el build nunca falle por falta de contenido — no se linkea desde ningún lado y responde 404 real. En cuanto haya al menos un artículo publicado deja de usarse.

### Alternativa: exportación estática (si el plan no tuviera Node.js)

Si en algún momento el hosting cambia a uno sin soporte de Node.js Apps, descomenten `output: "export"` en `next.config.mjs`: `npm run build` genera entonces una carpeta `out/` con HTML/CSS/JS puro (mismo tipo de artefacto que hoy sube `apps/web` vía `dist/apps/web`), que se sube por File Manager/FTP igual que hoy. El costo: los artículos nuevos **no** aparecen hasta el próximo build + subida manual — se pierde el ISR. `app/sitemap.js` y `app/robots.txt/route.js` ya están preparados para funcionar en cualquiera de los dos modos.

## Pendientes antes de cortar tráfico real

- [ ] Completar `.env.local` con las credenciales reales de Supabase y confirmar que la home, `/blog` y un post individual cargan contenido real (no solo los valores por defecto).
- [ ] Agregar los archivos que faltan en `apps/web/public/` y traerlos también aquí: `favicon.ico`, `apple-touch-icon.png`, `og-image.jpg`, `logo.png` (usado en el JSON-LD).
- [x] Hosting decidido: Hostinger, plan con Node.js Apps + integración de Git (build y restart automáticos en cada push, ISR activo). Falta: configurar la app en hPanel (ver sección "Hosting" arriba — repo, root directory `apps/web-next`, build command, entry, variables de entorno) y confirmar el primer deploy.
- [ ] Probar el login de `/admin` con una cuenta real de Supabase Auth y confirmar que las cinco pestañas (Contenido, Imágenes, Seguros, Blog, Cotizaciones) funcionan igual que en `apps/web`.
- [ ] Decidir qué hacer con `/servicios` y `/agentes`: la auditoría SEO encontró que Google todavía tiene indexada `/servicios/` y que el sitemap viejo listaba `/agentes`, pero **ninguna de las dos existe como ruta en el código fuente actual** (`apps/web/src/App.jsx` no las define). No las recreé aquí porque no hay contenido real del que partir — si el negocio quiere esas páginas de vuelta, hay que decidir qué van a decir y yo puedo construirlas.
- [ ] Verificar en Google Search Console (Inspección de URL → "Ver página rastreada") que el contenido efectivamente se ve una vez desplegado.
- [ ] `npm run build` en este entorno de verificación no pudo descargar las fuentes de Google Fonts (sin salida de red a `fonts.googleapis.com`) — es una restricción de este entorno sandbox, no del código; en cualquier hosting real con acceso normal a internet (Vercel incluido) el build de `next/font/google` funciona sin problema. Si por algún motivo el hosting de destino tampoco tiene salida a Google Fonts, avísame y lo cambio a fuentes autoalojadas.

## Estructura

```
apps/web-next/
├── app/
│   ├── layout.jsx          # <html>/<head>, fuentes, JSON-LD, Header/Footer/WhatsApp
│   ├── page.jsx             # Home (Server Component, ISR 1h)
│   ├── globals.css          # = apps/web/src/index.css
│   ├── not-found.jsx        # 404 real
│   ├── sitemap.js           # sitemap.xml dinámico
│   ├── robots.txt/route.js  # = apps/web/public/robots.txt
│   ├── blog/
│   │   ├── page.jsx         # índice del blog
│   │   └── [slug]/page.jsx  # post individual (generateStaticParams + generateMetadata)
│   └── admin/
│       ├── layout.jsx       # envuelve con AuthProvider
│       ├── login/page.jsx
│       └── page.jsx         # dashboard (Contenido/Imágenes/Seguros/Blog/Cotizaciones)
├── components/               # mismos componentes visuales que apps/web/src/components
├── lib/                       # = apps/web/src/api (mismas funciones, mismo nombre de tablas)
├── hooks/useAuth.jsx          # = apps/web/src/hooks/useAuth.jsx
└── config/seo.json            # = apps/web/src/config/seo.json
```
