# Guía del proyecto — Mazoseguros (basado en la base amoli)

Misma arquitectura de los proyectos anteriores (React + Vite + Tailwind +
Supabase, monorepo pnpm, Hostinger con Git nativo). Esta vez para una agencia
de seguros, con blog y desglose por tipo de póliza.

> Regla general: `src/api/`, `src/hooks/`, `src/lib/` y `supabase/` son
> "motor" — no los toques. `src/pages/`, `src/components/`, `src/index.css` y
> `tailwind.config.js` son "carrocería".

## 1. Qué mejoré frente al sitio actual (mazoseguros.com)

Revisé el sitio actual antes de construir este. Esto es lo que cambié y por qué:

- **No tenía blog** → ahora hay uno completo (`/blog` y `/blog/:slug`),
  administrable desde el panel. Un blog de seguros es una de las formas más
  efectivas de aparecer en Google para búsquedas como "seguro todo riesgo
  Medellín" o "qué cubre un seguro de obra civil" — tráfico que hoy
  mazoseguros.com no está capturando.
- **Los seguros estaban solo en 3 tarjetas genéricas** (Hogar, Auto,
  Vida/Salud), sin detalle de coberturas → ahora hay 4 categorías (agregué
  **Obras civiles**, que no existía) con su propia lista de coberturas y un
  botón de cotización que ya le dice al asesor qué tipo de seguro es, en vez
  de un formulario genérico.
- **Las fotos eran bancos de imágenes genéricos** (una persona con casco de
  seguridad sin relación clara con seguros) → dejé todo el sistema de fondos
  editable desde el panel admin, para que subas fotos reales de tu equipo,
  oficina o clientes en vez de stock.
- **El formulario de contacto no distinguía el tipo de seguro** → el nuevo
  formulario pide la categoría desde el inicio, así el primer mensaje que
  recibes ya viene calificado.
- **La política de privacidad enlazaba a una página vacía** (`href=""`) y el
  boletín decía "no disponible por el momento" → si vas a ofrecer esas dos
  cosas, hazlo real; si no, mejor no mostrarlas (por ahora no las incluí,
  para no repetir una promesa rota).
- **No había ninguna señal de confianza concreta** (años de experiencia,
  número de clientes, certificaciones) más allá del texto genérico → dejé un
  espacio de "sellos" para los aliados (Sura, Allianz, AXA) que puedes
  editar, y es fácil agregarle un dato como "+10 años protegiendo familias"
  en el hero.

## 2. Concepto de diseño

Un sitio de seguros vive de la confianza, así que en vez de un estilo
"tech/genérico", usé una metáfora de **documento de póliza**: papel crema,
tinta azul marino, acento terracota (protección con calidez, no un azul
corporativo genérico). Tipografía serif (Fraunces) para títulos — da
seriedad editorial, útil también para que el blog se sienta como una
publicación real y no un blog de relleno.

- **Elemento firma**: las tarjetas de seguros (`.doc-card`) tienen una
  "línea perforada" (`.perforated`) antes del botón de cotizar, como el
  borde de un cupón o una póliza para recortar.
- **Sellos de confianza** (`.seal`): insignias circulares levemente
  rotadas, usadas para los aliados en el hero — evita usar los logos reales
  de Sura/Allianz/AXA (son marcas de terceros) y en su lugar los presenta
  como un sello de "aliado".

## 3. Puesta en marcha

1. `pnpm install`
2. Crea un proyecto en [supabase.com](https://supabase.com) y corre
   `apps/web/supabase/schema.sql` completo en el SQL Editor. Crea las
   tablas, el bucket de imágenes, las políticas de seguridad, y contenido de
   ejemplo (incluye 2 artículos de blog para que veas el diseño andando).
3. Copia `.env.example` a `.env` en `apps/web/` con tus credenciales de
   Supabase.
4. Crea tu usuario admin en **Authentication → Users → Add user**.
5. `pnpm dev`, entra a `/admin`, y reemplaza el contenido de ejemplo.

## 4. Modelo de datos

- `site_content`: hero, about, contact, media (fondo del hero), categories
  (las 4 categorías de seguros con su descripción y coberturas).
- `blog_posts`: `title`, `slug`, `excerpt`, `content` (un párrafo por
  línea), `cover_image`, `category`, `published`.
- `quote_requests`: solicitudes del formulario, con el tipo de seguro
  incluido — revísalas en la pestaña "Cotizaciones" del panel.

## 5. Despliegue en Hostinger

Igual que los proyectos anteriores: directorio de salida `dist/apps/web`,
variables de Supabase cargadas antes de compilar, y el `chmod +x` ya
incluido en el `package.json` raíz.
