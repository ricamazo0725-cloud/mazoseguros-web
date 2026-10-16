"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import RequireAuth from "@/components/RequireAuth";
import { getAllSections, upsertSection } from "@/lib/content";
import { uploadImage } from "@/lib/media";
import { getAllPosts, createPost, updatePost, deletePost } from "@/lib/blog";
import { getQuoteRequests, markQuoteRequestHandled } from "@/lib/quotes";
import CrmPanel from "@/components/admin/CrmPanel";
import AgendaPanel from "@/components/admin/AgendaPanel";
import PushToggle from "@/components/admin/PushToggle";
import PoliciesPanel from "@/components/admin/PoliciesPanel";
import SoatPanel from "@/components/admin/SoatPanel";
import InboxPanel from "@/components/admin/InboxPanel";
import DashboardPanel from "@/components/admin/DashboardPanel";
import { unreadConversations } from "@/lib/crm";
import { registerAdminSW } from "@/lib/push";

// Menú lateral (estilo bandeja: Conversaciones · Clientes · Tablero …)
const NAV = [
  { key: "Conversaciones", icon: "M4 5h16v10H8l-4 4V5z", group: "crm" },
  { key: "Clientes", icon: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21c0-4 4-6 8-6s8 2 8 6", group: "crm" },
  { key: "Tablero", icon: "M4 20V10m6 10V4m6 16v-7m4 7H2", group: "crm" },
  { key: "SOAT", icon: "M5 16l1.5-5h11L19 16M5 16h14v3H5zM7.5 19v1.5M16.5 19v1.5M8 11l1.5-4h5L16 11", group: "crm" },
  { key: "Pólizas", icon: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6", group: "crm" },
  { key: "Agenda", icon: "M5 5h14v15H5zM5 9h14M9 3v4M15 3v4", group: "crm" },
  { key: "Cotizaciones", icon: "M5 4h14v16l-3-2-2 2-2-2-2 2-2-2-3 2zM9 9h6M9 13h6", group: "crm" },
  { key: "Contenido", icon: "M4 6h16M4 12h10M4 18h16", group: "site" },
  { key: "Imágenes", icon: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9h.01", group: "site" },
  { key: "Seguros", icon: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z", group: "site" },
  { key: "Blog", icon: "M5 4h10l4 4v12H5zM9 12h6M9 16h4", group: "site" },
];
const TABS = NAV.map((n) => n.key);
// Enlaces viejos (?tab=crm) siguen funcionando
const TAB_ALIAS = { crm: "Conversaciones" };

function NavIcon({ d }) {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
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
  const { signOut, session } = useAuth();
  const [tab, setTab] = useState("Conversaciones");
  const [clientFilters, setClientFilters] = useState(null);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const load = () => unreadConversations().then(setUnread).catch(() => {});
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);
  const openClient = useCallback((id) => {
    setOpenContactId(id);
    setTab("Clientes");
  }, []);
  // Contacto que se manda desde el CRM a la pestaña Agenda con "Agendar asesoría"
  const [schedulePreset, setSchedulePreset] = useState(null);
  const clearPreset = useCallback(() => setSchedulePreset(null), []);
  // Contacto a abrir cuando se entra desde una notificación (/admin?contact=<id>)
  const [openContactId, setOpenContactId] = useState(null);

  useEffect(() => {
    registerAdminSW();

    function applyUrl(href) {
      const url = new URL(href, window.location.origin);
      const contact = url.searchParams.get("contact");
      const t = url.searchParams.get("tab");
      if (contact) {
        setTab("Conversaciones");
        setOpenContactId(contact);
      } else if (t) {
        const plain = (x) => x.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const match = TAB_ALIAS[plain(t)] || TABS.find((x) => plain(x) === plain(t));
        if (match) setTab(match);
      }
    }
    applyUrl(window.location.href);

    // Notificación tocada con la app ya abierta: el service worker avisa por mensaje
    function onMessage(e) {
      if (e.data?.type === "open-url") applyUrl(e.data.url);
    }
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => navigator.serviceWorker?.removeEventListener("message", onMessage);
  }, []);

  const fullBleed = tab === "Conversaciones" || tab === "Clientes";
  // Menú lateral plegable (se recuerda en este navegador)
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("admin-nav-collapsed") === "1");
    } catch {}
  }, []);
  const toggleNav = () =>
    setCollapsed((v) => {
      try {
        localStorage.setItem("admin-nav-collapsed", v ? "0" : "1");
      } catch {}
      return !v;
    });
  const wide = !collapsed; // en md+ muestra textos solo si no está plegado
  const NavButton = ({ n }) => {
    const active = tab === n.key;
    return (
      <button
        onClick={() => setTab(n.key)}
        title={n.key}
        className={`group relative shrink-0 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-ring border-l-4 ${
          active ? "bg-slate-800 text-white font-medium border-accent" : "border-transparent text-slate-300 hover:bg-slate-800 hover:text-white"
        }`}
      >
        <span className={`transition-transform group-hover:scale-110 ${active ? "text-accent" : ""}`}>
          <NavIcon d={n.icon} />
        </span>
        <span className={`whitespace-nowrap ${wide ? "md:inline" : "md:hidden"}`}>{n.key}</span>
        {n.key === "Conversaciones" && unread > 0 && (
          <span
            className={`text-[10px] font-semibold bg-accent text-white rounded-full px-1.5 min-w-[18px] text-center ${
              wide ? "ml-auto" : "md:absolute md:top-1 md:right-1"
            }`}
          >
            {unread}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="admin-theme h-[100dvh] flex flex-col md:flex-row">
      {/* ── Menú lateral ── */}
      <nav
        className={`shrink-0 bg-[#0F172A] text-slate-300 flex md:flex-col pt-[env(safe-area-inset-top)] md:pt-0 transition-[width] duration-300 ${
          wide ? "md:w-64" : "md:w-[76px]"
        }`}
      >
        <div className="hidden md:flex items-center justify-between gap-2 h-16 px-4 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 shrink-0 rounded-lg bg-accent grid place-items-center text-white font-bold text-lg shadow-md">M</span>
            {wide && (
              <span className="leading-tight whitespace-nowrap">
                <span className="block font-bold text-white text-sm tracking-wide">MazoSeguros</span>
                <span className="block text-[10px] font-semibold uppercase tracking-widest text-slate-400">Admin panel</span>
              </span>
            )}
          </div>
          <button
            onClick={toggleNav}
            title={wide ? "Plegar menú" : "Desplegar menú"}
            className="text-slate-400 hover:text-white p-1.5 rounded-md hover:bg-slate-800 transition-colors"
          >
            <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${wide ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" />
            </svg>
          </button>
        </div>
        <div className="flex md:flex-col gap-1 p-2 md:p-3 overflow-x-auto no-scrollbar md:overflow-y-auto md:flex-1">
          {wide && <p className="hidden md:block px-3 mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Operación</p>}
          {NAV.filter((n) => n.group === "crm").map((n) => (
            <NavButton key={n.key} n={n} />
          ))}
          {wide ? (
            <p className="hidden md:block mt-5 mb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">Sitio web</p>
          ) : (
            <span className="hidden md:block my-3 border-t border-slate-800" />
          )}
          {NAV.filter((n) => n.group === "site").map((n) => (
            <NavButton key={n.key} n={n} />
          ))}
        </div>
        <div className="hidden md:flex md:flex-col gap-2 p-3 border-t border-slate-800 bg-slate-900/50">
          {wide && <PushToggle email={session?.user?.email} />}
          <button
            onClick={signOut}
            title="Cerrar sesión"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors text-sm font-medium"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" />
            </svg>
            {wide && <span>Cerrar sesión</span>}
          </button>
        </div>
      </nav>

      {/* ── Contenido ── */}
      <main className={`flex-1 min-h-0 min-w-0 bg-background ${fullBleed ? "overflow-hidden" : "overflow-y-auto thin-scroll"}`}>
        {tab === "Conversaciones" && (
          <InboxPanel
            initialContactId={openContactId}
            onSchedule={(contact) => {
              setSchedulePreset(contact);
              setTab("Agenda");
            }}
          />
        )}
        {tab === "Tablero" && (
          <DashboardPanel
            onOpenContact={openClient}
            onOpenClients={(f) => {
              setClientFilters({ ...f, at: Date.now() });
              setOpenContactId(null);
              setTab("Clientes");
            }}
          />
        )}
        {tab === "Clientes" && (
          <CrmPanel
            initialContactId={openContactId}
            initialFilters={clientFilters}
            onSchedule={(contact) => {
              setSchedulePreset(contact);
              setTab("Agenda");
            }}
          />
        )}
        {!fullBleed && tab !== "Tablero" && (
          <div className="max-w-7xl mx-auto px-4 sm:px-8 py-6 sm:py-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
            <div className="md:hidden flex justify-end gap-2 mb-4">
              <PushToggle email={session?.user?.email} />
              <button onClick={signOut} className="text-xs font-mono border border-border rounded px-3 py-1.5">
                Salir
              </button>
            </div>
            {tab === "Pólizas" && <PoliciesPanel onOpenContact={openClient} />}
            {tab === "SOAT" && <SoatPanel onOpenContact={openClient} />}
            {tab === "Agenda" && <AgendaPanel preset={schedulePreset} onPresetUsed={clearPreset} />}
            {tab === "Contenido" && <ContentEditor />}
            {tab === "Imágenes" && <MediaEditor />}
            {tab === "Seguros" && <CategoriesEditor />}
            {tab === "Blog" && <BlogEditor />}
            {tab === "Cotizaciones" && <QuotesViewer />}
          </div>
        )}
      </main>
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
        <Field
          label="Teléfono para llamadas (con +57)"
          value={contact.phone}
          onChange={(v) => setContact({ ...contact, phone: v })}
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
