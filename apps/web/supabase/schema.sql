-- Ejecutar en el SQL Editor del proyecto de Supabase.

create extension if not exists "pgcrypto";

create table if not exists site_content (
  section text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists blog_posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  content text,
  cover_image text,
  category text,
  published boolean not null default true,
  published_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create table if not exists quote_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  category text,
  message text,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

alter table site_content enable row level security;
alter table blog_posts enable row level security;
alter table quote_requests enable row level security;

-- Lectura pública del contenido y de los artículos publicados
create policy "public read site_content" on site_content for select using (true);
create policy "public read published posts" on blog_posts for select using (published = true);
create policy "admin read all posts" on blog_posts for select using (auth.role() = 'authenticated');

-- Escritura solo para el admin autenticado
create policy "admin write site_content" on site_content
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin write blog_posts" on blog_posts
  for insert with check (auth.role() = 'authenticated');
create policy "admin update blog_posts" on blog_posts
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin delete blog_posts" on blog_posts
  for delete using (auth.role() = 'authenticated');

-- Cotizaciones: cualquier visitante puede crear una solicitud; solo el admin las lee/actualiza
create policy "public insert quote_requests" on quote_requests for insert with check (true);
create policy "admin read quote_requests" on quote_requests
  for select using (auth.role() = 'authenticated');
create policy "admin update quote_requests" on quote_requests
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Storage: bucket público "fotos" para las imágenes que se suben desde el panel admin.
-- Sin política de SELECT: el bucket ya es público, las imágenes se sirven directo por
-- su URL sin pasar por RLS (agregar una política de SELECT solo habilitaría además
-- listar todos los archivos, que no hace falta).
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

create policy "admin upload fotos" on storage.objects
  for insert with check (bucket_id = 'fotos' and auth.role() = 'authenticated');
create policy "admin update fotos" on storage.objects
  for update using (bucket_id = 'fotos' and auth.role() = 'authenticated');
create policy "admin delete fotos" on storage.objects
  for delete using (bucket_id = 'fotos' and auth.role() = 'authenticated');

-- Contenido inicial de ejemplo (bórralo o edítalo desde el panel admin)
insert into site_content (section, data) values
  ('hero', '{
    "eyebrow": "Agencia de seguros en Medellín",
    "title": "Protege lo que más te importa",
    "subtitle": "Pólizas de auto, hogar, salud y obras civiles, con el respaldo de aliados como Sura, Allianz y AXA.",
    "whatsapp": "573103897969",
    "allies": ["Sura", "Allianz", "AXA", "Previsora", "Solidaria", "Seguros del Estado"]
  }'::jsonb),
  ('about', '{
    "heading": "Confianza y respaldo, en cada póliza",
    "paragraphs": ["Construimos relaciones basadas en la confianza y el respaldo. Somos un equipo de expertos dedicados a encontrar la protección perfecta para tu familia, tu patrimonio y tu empresa."]
  }'::jsonb),
  ('contact', '{
    "whatsapp": "573103897969",
    "email": "mazseguros@hotmail.com"
  }'::jsonb),
  ('categories', '{
    "auto": {
      "title": "Autos",
      "description": "Cobertura para tu vehículo particular o de trabajo, con asistencia en carretera.",
      "coverage": ["Todo riesgo o daños a terceros", "Asistencia en vía 24/7", "Amparo por robo"]
    },
    "propiedades": {
      "title": "Propiedades",
      "description": "Protege tu casa, apartamento o local comercial ante incendio, robo o desastres naturales.",
      "coverage": ["Incendio y terremoto", "Robo y hurto", "Responsabilidad civil"]
    },
    "salud": {
      "title": "Salud",
      "description": "Planes de salud y vida complementarios, pensados para tu familia.",
      "coverage": ["Medicina prepagada", "Seguro de vida", "Renta por incapacidad"]
    },
    "obras-civiles": {
      "title": "Obras civiles",
      "description": "Pólizas para constructoras y contratistas: cumplimiento, responsabilidad y todo riesgo.",
      "coverage": ["Todo riesgo construcción", "Cumplimiento ante entidades", "Responsabilidad civil extracontractual"]
    }
  }'::jsonb)
on conflict (section) do nothing;

insert into blog_posts (title, slug, excerpt, content, category, published) values
  (
    '¿Qué cubre un seguro todo riesgo para tu carro?',
    'que-cubre-seguro-todo-riesgo-carro',
    'Te explicamos las coberturas que trae un seguro todo riesgo y en qué se diferencia de uno básico.',
    'Un seguro todo riesgo cubre tanto daños a terceros como daños a tu propio vehículo.
Incluye típicamente: choque, robo, incendio, hurto de accesorios y asistencia en vía.
La diferencia principal frente a un seguro básico es que también responde por tu propio carro, no solo por lo que le causes a otros.',
    'Autos',
    true
  ),
  (
    '5 razones para asegurar tu obra de construcción',
    '5-razones-asegurar-obra-construccion',
    'Las pólizas de obras civiles protegen tu proyecto de imprevistos que pueden salir muy costosos.',
    'Una obra de construcción enfrenta riesgos que van desde accidentes laborales hasta daños por clima.
Un seguro todo riesgo construcción cubre materiales, maquinaria y responsabilidad civil frente a terceros.
Además, muchas entidades exigen pólizas de cumplimiento para adjudicar contratos.',
    'Obras civiles',
    true
  )
on conflict (slug) do nothing;
