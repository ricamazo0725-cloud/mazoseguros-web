"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import RequireAuth from "@/components/RequireAuth";
import { getAllSections, upsertSection } from "@/lib/content";
import { uploadImage } from "@/lib/media";
import { getAllPosts, createPost, updatePost, deletePost } from "@/lib/blog";
import { getQuoteRequests, markQuoteRequestHandled } from "@/lib/quotes";

const TABS = ["Contenido", "Imágenes", "Seguros", "Blog", "Cotizaciones"];
const CATEGORY_IDS = ["auto", "propiedades", "salud", "obras-civiles"];
const CATEGORY_LABEL = { auto: "Autos", propiedades: "Propiedades", salud: "Salud", "obras-civiles": "Obras civiles" };

export default function AdminDashboardPage() {
  return (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  );
}

function Dashboard() {
  const { signOut } = useAuth();
  const [tab, setTab] = useState("Contenido");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-display font-semibold">Mazoseguros · Admin</span>
          <button
            onClick={signOut}
            className="text-xs font-mono border border-primary-foreground/30 rounded px-3 py-1.5 hover:border-primary-foreground"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10">
        <nav className="flex gap-2 mb-10 flex-wrap text-xs font-mono uppercase tracking-wider">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded border focus-ring ${
                tab === t ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>

        {tab === "Contenido" && <ContentEditor />}
        {tab === "Imágenes" && <MediaEditor />}
        {tab === "Seguros" && <CategoriesEditor />}
        {tab === "Blog" && <BlogEditor />}
        {tab === "Cotizaciones" && <QuotesViewer />}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, textarea, rows = 3 }) {
  const Comp = textarea ? "textarea" : "input";
  return (
    <div className="space-y-1">
      <label className="text-xs font-mono uppercase tracking-wider text-muted">{label}</label>
      <Comp
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        rows={textarea ? rows : undefined}
        className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus-ring"
      />
    </div>
  );
}

function SaveButton({ onClick, label = "Guardar" }) {
  return (
    <button onClick={onClick} type="button" className="btn-cta text-xs py-2 px-4">
      {label}
    </button>
  );
}

function ImageField({ label, value, onChange, folder }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, folder);
      onChange(url);
    } catch (err) {
      alert("No se pudo subir la imagen: " + err.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-xs font-mono uppercase tracking-wider text-muted">{label}</label>
      {value && (
        <div className="w-full h-32 overflow-hidden border border-border rounded">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt={label} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex items-center gap-3">
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="text-xs text-muted" />
        {uploading && <span className="text-xs text-accent font-mono">Subiendo…</span>}
      </div>
    </div>
  );
}

function ContentEditor() {
  const [hero, setHero] = useState({});
  const [about, setAbout] = useState({});
  const [contact, setContact] = useState({});
  const [savedKey, setSavedKey] = useState(null);

  useEffect(() => {
    getAllSections().then((s) => {
      setHero(s.hero || {});
      setAbout(s.about || { paragraphs: [] });
      setContact(s.contact || {});
    });
  }, []);

  async function save(section, data) {
    await upsertSection(section, data);
    setSavedKey(section);
    setTimeout(() => setSavedKey(null), 2000);
  }

  return (
    <div className="space-y-14">
      <section className="doc-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg">Hero</h2>
          {savedKey === "hero" && <span className="text-xs text-accent font-mono">Guardado ✓</span>}
        </div>
        <Field label="Eyebrow" value={hero.eyebrow} onChange={(v) => setHero({ ...hero, eyebrow: v })} />
        <Field label="Título" value={hero.title} onChange={(v) => setHero({ ...hero, title: v })} textarea />
        <Field label="Subtítulo" value={hero.subtitle} onChange={(v) => setHero({ ...hero, subtitle: v })} textarea />
        <Field
          label="WhatsApp (con código de país, solo números)"
          value={hero.whatsapp}
          onChange={(v) => setHero({ ...hero, whatsapp: v })}
        />
        <Field
          label="Aliados (uno por línea)"
          value={(hero.allies || []).join("\n")}
          onChange={(v) => setHero({ ...hero, allies: v.split("\n").filter(Boolean) })}
          textarea
          rows={4}
        />
        <SaveButton onClick={() => save("hero", hero)} />
      </section>

      <section className="doc-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg">Quiénes somos</h2>
          {savedKey === "about" && <span className="text-xs text-accent font-mono">Guardado ✓</span>}
        </div>
        <Field label="Encabezado" value={about.heading} onChange={(v) => setAbout({ ...about, heading: v })} />
        <Field
          label="Párrafos (uno por línea)"
          value={(about.paragraphs || []).join("\n")}
          onChange={(v) => setAbout({ ...about, paragraphs: v.split("\n").filter(Boolean) })}
          textarea
          rows={5}
        />
        <SaveButton onClick={() => save("about", about)} />
      </section>

      <section className="doc-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg">Contacto</h2>
          {savedKey === "contact" && <span className="text-xs text-accent font-mono">Guardado ✓</span>}
        </div>
        <Field
          label="WhatsApp (con código de país, solo números)"
          value={contact.whatsapp}
          onChange={(v) => setContact({ ...contact, whatsapp: v })}
        />
        <Field label="Correo" value={contact.email} onChange={(v) => setContact({ ...contact, email: v })} />
        <SaveButton onClick={() => save("contact", contact)} />
      </section>
    </div>
  );
}

function MediaEditor() {
  const [media, setMedia] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getAllSections().then((s) => setMedia(s.media || {}));
  }, []);

  async function save(next) {
    setMedia(next);
    await upsertSection("media", next);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <section className="doc-card p-6 space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-lg">Imágenes del sitio</h2>
        {saved && <span className="text-xs text-accent font-mono">Guardado ✓</span>}
      </div>
      <ImageField
        label="Logo (header y footer)"
        value={media.logoUrl}
        folder="logo"
        onChange={(url) => save({ ...media, logoUrl: url })}
      />
      <ImageField
        label="Foto de fondo del hero (opcional — sin foto se ve el fondo crema liso)"
        value={media.heroBg}
        folder="hero"
        onChange={(url) => save({ ...media, heroBg: url })}
      />
    </section>
  );
}

function CategoriesEditor() {
  const [categories, setCategories] = useState({});
  const [saved, setSaved] = useState(null);

  useEffect(() => {
    getAllSections().then((s) => setCategories(s.categories || {}));
  }, []);

  async function save(id, next) {
    const updated = { ...categories, [id]: next };
    setCategories(updated);
    await upsertSection("categories", updated);
    setSaved(id);
    setTimeout(() => setSaved(null), 2000);
  }

  return (
    <div className="space-y-10">
      {CATEGORY_IDS.map((id) => {
        const cat = categories[id] || { title: CATEGORY_LABEL[id], description: "", coverage: [] };
        return (
          <section key={id} className="doc-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-semibold text-lg">{CATEGORY_LABEL[id]}</h2>
              {saved === id && <span className="text-xs text-accent font-mono">Guardado ✓</span>}
            </div>
            <Field label="Título" value={cat.title} onChange={(v) => setCategories({ ...categories, [id]: { ...cat, title: v } })} />
            <Field
              label="Descripción"
              value={cat.description}
              onChange={(v) => setCategories({ ...categories, [id]: { ...cat, description: v } })}
              textarea
            />
            <Field
              label="Coberturas (una por línea)"
              value={(cat.coverage || []).join("\n")}
              onChange={(v) =>
                setCategories({ ...categories, [id]: { ...cat, coverage: v.split("\n").filter(Boolean) } })
              }
              textarea
              rows={4}
            />
            <SaveButton onClick={() => save(id, categories[id] || cat)} />
          </section>
        );
      })}
    </div>
  );
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const EMPTY_POST_DRAFT = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  cover_image: "",
  category: "",
  published: true,
};

function BlogEditor() {
  const [posts, setPosts] = useState([]);
  const [draft, setDraft] = useState(EMPTY_POST_DRAFT);
  // id del post que se está editando — null significa que el formulario de
  // arriba está armando uno NUEVO. Antes no existía forma de editar un
  // artículo ya creado (solo publicar, ocultar o eliminar); con esto el
  // mismo formulario sirve para crear y para editar.
  const [editingId, setEditingId] = useState(null);
  const [savedNotice, setSavedNotice] = useState(false);

  function refresh() {
    getAllPosts().then(setPosts);
  }
  useEffect(refresh, []);

  async function save() {
    if (!draft.title) return;
    // Siempre se pasa por slugify, incluso si el slug fue escrito a mano —
    // así es imposible que quede guardado con mayúsculas o espacios (eso fue
    // justo lo que rompió /blog/Segurodecenal: al escribirlo a mano quedó
    // con S mayúscula, y la comparación contra la URL es exacta).
    const slug = slugify(draft.slug || draft.title);
    if (editingId) {
      await updatePost(editingId, { ...draft, slug });
    } else {
      await createPost({ ...draft, slug, published_at: new Date().toISOString() });
    }
    setDraft(EMPTY_POST_DRAFT);
    setEditingId(null);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
    refresh();
  }

  function edit(post) {
    setEditingId(post.id);
    setDraft({
      title: post.title || "",
      slug: post.slug || "",
      excerpt: post.excerpt || "",
      content: post.content || "",
      cover_image: post.cover_image || "",
      category: post.category || "",
      published: post.published,
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(EMPTY_POST_DRAFT);
  }

  async function togglePublished(post) {
    await updatePost(post.id, { published: !post.published });
    refresh();
  }

  async function remove(id) {
    await deletePost(id);
    if (editingId === id) cancelEdit();
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="doc-card p-6 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display font-semibold text-lg">{editingId ? "Editar artículo" : "Nuevo artículo"}</h2>
          {savedNotice && <span className="text-xs text-accent font-mono">Guardado ✓</span>}
        </div>
        <p className="text-xs text-muted font-mono">
          Al publicar o editar, la página pública y el mapa del sitio (sitemap.xml) pueden tardar hasta 1h en
          actualizarse (ISR) — ver revalidate en app/blog/page.jsx, app/blog/[slug]/page.jsx y app/sitemap.js.
        </p>
        <Field label="Título" value={draft.title} onChange={(v) => setDraft({ ...draft, title: v })} />
        <Field
          label="Slug (URL) — se genera solo si lo dejas vacío; siempre se guarda en minúsculas y sin espacios"
          value={draft.slug}
          onChange={(v) => setDraft({ ...draft, slug: v })}
        />
        <Field label="Categoría (ej. Autos, Salud…)" value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })} />
        <Field label="Extracto (se ve en la lista)" value={draft.excerpt} onChange={(v) => setDraft({ ...draft, excerpt: v })} textarea />
        <Field
          label="Contenido (un párrafo por línea)"
          value={draft.content}
          onChange={(v) => setDraft({ ...draft, content: v })}
          textarea
          rows={8}
        />
        <ImageField
          label="Foto de portada"
          value={draft.cover_image}
          folder="blog"
          onChange={(url) => setDraft({ ...draft, cover_image: url })}
        />
        <div className="flex items-center gap-3">
          <SaveButton onClick={save} label={editingId ? "Guardar cambios" : "Publicar artículo"} />
          {editingId && (
            <button
              onClick={cancelEdit}
              type="button"
              className="text-xs font-mono text-muted hover:text-foreground"
            >
              Cancelar edición
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {posts.map((post) => (
          <div key={post.id} className="doc-card p-4 flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-mono text-accent">
                {post.category} · /blog/{post.slug} · {post.published ? "Publicado" : "Borrador"}
              </div>
              <h3 className="font-display font-semibold">{post.title}</h3>
              <p className="text-sm text-muted">{post.excerpt}</p>
            </div>
            <div className="flex flex-col items-end gap-2 shrink-0">
              <button onClick={() => edit(post)} className="text-xs font-mono text-muted hover:text-accent">
                Editar
              </button>
              <button onClick={() => togglePublished(post)} className="text-xs font-mono text-muted hover:text-accent">
                {post.published ? "Ocultar" : "Publicar"}
              </button>
              <button onClick={() => remove(post.id)} className="text-xs font-mono text-muted hover:text-danger">
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuotesViewer() {
  const [items, setItems] = useState([]);

  function refresh() {
    getQuoteRequests().then(setItems);
  }
  useEffect(refresh, []);

  async function toggleHandled(item) {
    await markQuoteRequestHandled(item.id, !item.handled);
    refresh();
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-muted font-mono text-sm">Todavía no hay solicitudes de cotización.</p>}
      {items.map((item) => (
        <div key={item.id} className="doc-card p-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-mono text-accent">
              {CATEGORY_LABEL[item.category] || item.category} · {new Date(item.created_at).toLocaleDateString("es-CO")}
            </div>
            <h3 className="font-display font-semibold">{item.name}</h3>
            <p className="text-sm text-muted">{item.phone}</p>
            {item.message && <p className="text-sm text-muted mt-1">{item.message}</p>}
          </div>
          <button
            onClick={() => toggleHandled(item)}
            className={`text-xs font-mono px-2 py-1 border rounded ${
              item.handled ? "border-accent text-accent" : "border-border text-muted"
            }`}
          >
            {item.handled ? "Atendida" : "Marcar atendida"}
          </button>
        </div>
      ))}
    </div>
  );
}
