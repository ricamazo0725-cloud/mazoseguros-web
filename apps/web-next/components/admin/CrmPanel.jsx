"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ContactPolicies } from "@/components/admin/PoliciesPanel";
import { ContactSoat } from "@/components/admin/SoatPanel";
import { MessageMedia, VoiceRecorder, isMediaMessage } from "@/components/admin/ChatMedia";
import { NewContactForm, ContactImport } from "@/components/admin/ContactCreate";
import {
  CONTACT_STATUS,
  LEAD_SOURCE,
  getLeads,
  TOPICS,
  listContacts,
  segmentCounts,
  SEGMENTS,
  SORTS,
  listAdvisorNames,
  updateContact,
  deleteContact,
  getContact,
  getMessages,
  markRead,
  sendReply,
  setBotActive,
  REPLY_WINDOW_MS,
  fmtDateTime,
  birthdayInfo,
  birthdayLabel,
  sendBirthdayGreeting,
  waLink,
} from "@/lib/crm";

const input = "w-full bg-white border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm text-slate-800 shadow-sm transition-all";
const label = "block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5";

export const INSURERS = [
  "SURA", "AXA Colpatria", "Seguros Mundial", "HDI (Liberty)", "La Previsora", "Seguros del Estado", "Seguros Bolívar",
  "Allianz", "La Equidad", "Solidaria", "Mapfre", "Qualitas", "SBS", "Zurich", "Chubb",
];

export default function CrmPanel({ onSchedule, initialContactId, initialFilters }) {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [advisor, setAdvisor] = useState("");
  const [advisorNames, setAdvisorNames] = useState([]);
  const [segment, setSegment] = useState(initialFilters?.segment || "");
  const [due, setDue] = useState(initialFilters?.due || "");
  const [insurer, setInsurer] = useState(initialFilters?.insurer || "");
  useEffect(() => {
    if (!initialFilters) return;
    setSegment(initialFilters.segment || "");
    setDue(initialFilters.due || "");
    setInsurer(initialFilters.insurer || "");
  }, [initialFilters]);
  const [sort, setSort] = useState("recientes");
  const [counts, setCounts] = useState(null);
  const [total, setTotal] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const activeFilters = [status, source].filter(Boolean).length + (sort !== "recientes" ? 1 : 0);
  useEffect(() => {
    listAdvisorNames().then(setAdvisorNames).catch(() => {});
  }, []);
  const [selectedId, setSelectedId] = useState(initialContactId || null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(null); // null | "new" | "import"

  const refresh = useCallback(() => {
    listContacts({ search, status, source, advisor, segment, sort, due, insurer })
      .then((rows) => {
        setContacts(rows);
        setTotal(rows.total ?? rows.length);
        setError("");
      })
      .catch((e) => setError(e.message));
    segmentCounts().then(setCounts).catch(() => {});
  }, [search, status, source, advisor, segment, sort, due, insurer]);

  useEffect(() => {
    const t = setTimeout(refresh, 250); // espera a que termine de escribir
    return () => clearTimeout(t);
  }, [refresh]);

  // Refresca la lista cada 20 s para ver mensajes nuevos de WhatsApp
  useEffect(() => {
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (initialContactId) setSelectedId(initialContactId);
  }, [initialContactId]);

  // Un contacto abierto desde Pólizas o un aviso puede no estar en la lista (solo trae 200)
  const [extra, setExtra] = useState(null);
  useEffect(() => {
    if (!selectedId || contacts.some((c) => c.id === selectedId) || extra?.id === selectedId) return;
    getContact(selectedId).then(setExtra).catch(() => {});
  }, [selectedId, contacts, extra]);

  const selected = contacts.find((c) => c.id === selectedId) || (extra?.id === selectedId ? extra : null);
  const open = (id) => {
    setMode(null);
    setSelectedId(id);
    refresh();
  };
  const showRight = selectedId || mode;

  const chip = (on, tone) =>
    `shrink-0 px-2.5 py-1 rounded-full border text-xs font-medium whitespace-nowrap transition-colors ${
      on
        ? tone === "red"
          ? "bg-red-600 border-red-600 text-white"
          : tone === "amber"
          ? "bg-amber-500 border-amber-500 text-white"
          : "bg-slate-800 border-slate-800 text-white"
        : tone === "red"
        ? "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
        : tone === "amber"
        ? "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
        : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
    }`;

  return (
    <div className="h-full flex min-h-0">
      {/* ── Columna de clientes ── */}
      <aside
        className={`w-full md:w-[380px] lg:w-[420px] shrink-0 bg-surface border-r border-border flex-col min-h-0 shadow-sm ${
          showRight ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="p-4 border-b border-slate-100 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={() => setMode("new")}
              className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-[#C2410C] text-white px-3 py-2 rounded-lg font-medium text-sm shadow-sm transition-colors"
            >
              <span className="text-base leading-none">+</span> Nuevo cliente
            </button>
            <button
              onClick={() => setMode("import")}
              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-medium text-sm border transition-colors ${
                mode === "import" ? "border-accent text-accent bg-accent/5" : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
              }`}
            >
              📂 Importar
            </button>
          </div>
          {/* Segmentos */}
          <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-medium text-slate-600">
            {Object.entries(SEGMENTS).map(([k, v]) => (
              <button
                key={k || "all"}
                onClick={() => setSegment(k)}
                className={`flex-1 py-1.5 px-1 rounded-lg text-center transition-all ${
                  segment === k ? "bg-white text-accent shadow-sm font-semibold" : "hover:text-slate-900"
                }`}
              >
                {v}{" "}
                {counts?.[k] != null && (
                  <span
                    className={`text-[10px] ${segment === k ? "bg-accent/10 text-accent px-1.5 py-0.5 rounded-full" : "text-slate-400"}`}
                  >
                    {counts[k]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
          <div className="relative">
            <svg viewBox="0 0 24 24" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              className="w-full pl-9 pr-10 py-2 bg-white border border-slate-200 text-sm text-slate-700 placeholder-slate-400 transition-all"
              placeholder="Buscar nombre, celular, cédula o placa…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              onClick={() => setShowFilters((v) => !v)}
              title="Filtros y orden"
              className={`absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-1 rounded-md text-xs ${
                showFilters || activeFilters ? "text-accent bg-accent/10" : "text-slate-400 hover:text-slate-600"
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 inline" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
                <circle cx="16" cy="6" r="2" />
                <circle cx="10" cy="12" r="2" />
                <circle cx="18" cy="18" r="2" />
              </svg>
              {activeFilters ? ` ${activeFilters}` : ""}
            </button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            <button onClick={() => setDue("")} className={chip(due === "")}>
              Todo
            </button>
            <button onClick={() => setDue("vencido")} className={`${chip(due === "vencido", "red")} flex items-center gap-1`}>
              <span className={`w-1.5 h-1.5 rounded-full ${due === "vencido" ? "bg-white" : "bg-red-500"}`} /> Vencidos
            </button>
            <button onClick={() => setDue("d30")} className={chip(due === "d30", "amber")}>
              ≤ 30 días
            </button>
            <button onClick={() => setDue("d60")} className={chip(due === "d60")}>
              ≤ 60 días
            </button>
            <select
              value={insurer}
              onChange={(e) => setInsurer(e.target.value)}
              className={`shrink-0 text-xs font-medium px-2.5 py-1 !rounded-full border ${
                insurer ? "bg-slate-800 border-slate-800 text-white" : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              <option value="">Aseguradora ▾</option>
              {INSURERS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <select
              value={advisor}
              onChange={(e) => setAdvisor(e.target.value)}
              className={`shrink-0 text-xs font-medium px-2.5 py-1 !rounded-full border ${
                advisor ? "bg-slate-800 border-slate-800 text-white" : "bg-slate-100 text-slate-600 border-slate-200"
              }`}
            >
              <option value="">Asesor ▾</option>
              <option value="__none">Sin asesor</option>
              {advisorNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {showFilters && (
            <div className="grid gap-2 bg-white border border-slate-200 rounded-lg p-3">
              <select className={input} value={sort} onChange={(e) => setSort(e.target.value)}>
                {Object.entries(SORTS).map(([k, v]) => (
                  <option key={k} value={k}>
                    Orden: {v}
                  </option>
                ))}
              </select>
              <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todos los estados</option>
                {Object.entries(CONTACT_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <select className={input} value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Todos los orígenes</option>
                {Object.entries(LEAD_SOURCE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {activeFilters > 0 && (
                <button
                  onClick={() => {
                    setStatus("");
                    setSource("");
                    setSort("recientes");
                  }}
                  className="text-xs text-slate-500 hover:text-accent text-left"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
          )}
        </div>
        <datalist id="crm-advisor-names">
          {advisorNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-xs font-medium text-slate-500 flex justify-between items-center gap-2">
          <span className="truncate">
            {total} {total === 1 ? "contacto" : "contactos"}
            {segment ? ` · ${SEGMENTS[segment]}` : ""}
            {advisor ? ` · ${advisor === "__none" ? "sin asesor" : advisor}` : ""}
            {insurer ? ` · ${insurer}` : ""}
            {due === "vencido" ? " · vencidos" : due ? ` · vence ≤ ${due.slice(1)} d` : ""}
          </span>
          <span className="shrink-0 text-slate-400">
            {total > contacts.length ? `mostrando ${contacts.length}` : SORTS[sort]}
          </span>
        </div>
        {error && <p className="text-xs text-danger px-4 pt-2">{error}</p>}
        <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
          {contacts.length === 0 && !error && (
            <li className="text-sm text-slate-400 p-8 text-center">
              {search || activeFilters || segment || due || insurer || advisor ? "Nada coincide con la búsqueda." : "Sin contactos todavía."}
            </li>
          )}
          {contacts.map((c) => (
            <li key={c.id}>
              <ContactRow
                c={c}
                active={c.id === selectedId && !mode}
                onClick={() => {
                  setMode(null);
                  setSelectedId(c.id);
                }}
              />
            </li>
          ))}
        </ul>
      </aside>

      {/* ── Ficha del cliente ── */}
      <section className={`flex-1 min-w-0 min-h-0 flex-col ${showRight ? "flex" : "hidden md:flex"}`}>
        {mode === "new" || mode === "import" ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            <button onClick={() => setMode(null)} className="md:hidden mb-3 text-sm text-slate-500 hover:text-accent">
              ← Clientes
            </button>
            <div className="max-w-5xl">
              {mode === "new" ? (
                <NewContactForm onCreated={open} onOpen={open} onCancel={() => setMode(null)} />
              ) : (
                <ContactImport onDone={refresh} onOpen={open} onCancel={() => setMode(null)} />
              )}
            </div>
          </div>
        ) : selected ? (
          <ClientDetail
            key={selected.id}
            contact={selected}
            onBack={() => setSelectedId(null)}
            onSaved={refresh}
            onSchedule={onSchedule}
            onDeleted={() => {
              setSelectedId(null);
              setExtra(null);
              refresh();
            }}
          />
        ) : (
          <div className="flex-1 grid place-items-center p-8">
            <div className="text-center space-y-2">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-slate-100 grid place-items-center text-2xl">👤</div>
              <p className="font-semibold text-slate-700">Elige un cliente</p>
              <p className="text-sm text-slate-400">Verás su información, vehículos y SOAT, pólizas y conversación.</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const SEGMENT_CHIP = {
  cliente: { label: "Cliente", cls: "bg-accent/10 text-accent border-accent/30" },
  solo_soat: { label: "Solo SOAT", cls: "bg-primary/10 text-primary border-primary/30" },
  prospecto: { label: "Prospecto", cls: "bg-surface-2 text-muted border-border" },
};
const KIND = { soat: "SOAT", rtm: "RTM", poliza: "Póliza" };

function initials(n) {
  const w = String(n || "?").replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/);
  return ((w[0]?.[0] || "?") + (w[1]?.[0] || "")).toUpperCase();
}

function relTime(iso) {
  if (!iso) return "";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 7) return `${days} días`;
  if (days < 30) return `${Math.floor(days / 7)} sem`;
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

function dueChip(c) {
  if (c.next_date == null || c.next_days == null) {
    return null;
  }
  const d = c.next_days;
  const when = d < 0 ? `venció hace ${-d} d` : d === 0 ? "vence hoy" : `vence en ${d} d`;
  const cls =
    d < 0
      ? "bg-red-50 text-red-700 border-red-200"
      : d <= 30
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : d <= 60
      ? "bg-slate-100 text-slate-600 border-slate-200"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${cls}`}>
      {d < 0 ? "⚠ " : "⏱ "}
      {KIND[c.next_kind] || ""} {when}
    </span>
  );
}

const SEG_TAG = {
  cliente: "bg-orange-50 text-accent border-orange-200",
  solo_soat: "bg-slate-100 text-slate-600 border-slate-200",
  prospecto: "bg-sky-50 text-sky-700 border-sky-200",
};

export function ContactRow({ c, active, onClick }) {
  const name = c.name || c.wa_name || (c.phone ? `+${c.phone}` : "Sin nombre");
  const seg = SEGMENT_CHIP[c.segment];
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-4 flex items-start gap-3 border-l-4 transition-all focus-ring ${
        active ? "border-accent bg-orange-50/40" : "border-transparent hover:bg-slate-50"
      }`}
    >
      <span className="shrink-0 w-10 h-10 rounded-full grid place-items-center bg-slate-200 text-slate-700 text-xs font-bold">
        {initials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className={`text-sm font-semibold truncate ${active ? "text-slate-900" : "text-slate-800"}`}>{name}</span>
          <span className="flex items-center gap-1.5 shrink-0 text-[11px] text-slate-400">
            {birthdayInfo(c.birth_date)?.days === 0 && <span title="Cumple hoy">🎂</span>}
            {c.bot_state === "asesor" && <span title="Atendido por asesor">🙋</span>}
            {c.unread_count > 0 ? (
              <span className="text-[10px] font-semibold bg-accent text-white rounded-full px-2 py-0.5">{c.unread_count}</span>
            ) : (
              relTime(c.last_message_at || c.created_at)
            )}
          </span>
        </span>
        <span className="block text-xs text-slate-500 mt-0.5 truncate">
          {c.phone ? `📞 +${c.phone}` : c.doc_number || "sin teléfono"}
          {c.advisor && <span className="text-slate-400"> · 👤 {c.advisor}</span>}
        </span>
        <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {seg ? (
            <span className={`px-2 py-0.5 rounded text-[11px] font-medium border ${SEG_TAG[c.segment]}`}>{seg.label}</span>
          ) : (
            <span className="px-2 py-0.5 rounded text-[11px] font-medium border bg-slate-100 text-slate-600 border-slate-200">
              {CONTACT_STATUS[c.status] || c.status}
            </span>
          )}
          {c.soat_plates && (
            <span className="px-2 py-0.5 rounded text-[11px] font-mono font-medium border bg-slate-100 text-slate-700 border-slate-200 tracking-wide">
              🚗 {c.soat_plates}
            </span>
          )}
          {c.policies_count > 0 && (
            <span className="px-2 py-0.5 rounded text-[11px] font-medium border bg-white text-slate-600 border-slate-200">
              {c.policies_count} {c.policies_count === 1 ? "póliza" : "pólizas"}
            </span>
          )}
          {dueChip(c)}
        </span>
      </span>
    </button>
  );
}

function ClientForm({ contact, onSaved, onDeleted, compact = false }) {
  const [form, setForm] = useState({
    name: contact.name || "",
    email: contact.email || "",
    status: contact.status,
    interest: contact.interest || "",
    notes: contact.notes || "",
    doc_type: contact.doc_type || "",
    doc_number: contact.doc_number || "",
    city: contact.city || "",
    birth_date: contact.birth_date || "",
    advisor: contact.advisor || "",
    notify_opt_out: !!contact.notify_opt_out,
    phone: contact.phone || "",
    onedrive_folder: contact.onedrive_folder || "",
  });
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setSaveError("");
    let phone = form.phone.replace(/\D/g, "");
    if (phone.length === 10 && phone.startsWith("3")) phone = "57" + phone;
    if (phone && phone.length < 10) return setSaveError("El teléfono está incompleto.");
    if (!form.name.trim() && !contact.wa_name) return setSaveError("Escribe el nombre.");
    setBusy(true);
    try {
      await updateContact(contact.id, {
        phone: phone || null,
        onedrive_folder: form.onedrive_folder.trim() || null,
        name: form.name || null,
        email: form.email || null,
        status: form.status,
        interest: form.interest || null,
        notes: form.notes || null,
        doc_type: form.doc_type || null,
        doc_number: form.doc_number.replace(/[^0-9A-Za-z]/g, "").toUpperCase() || null,
        city: form.city || null,
        birth_date: form.birth_date || null,
        ...(contact.advisor !== undefined ? { advisor: form.advisor.trim() || null } : {}),
        ...(contact.notify_opt_out !== undefined ? { notify_opt_out: form.notify_opt_out } : {}),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (e) {
      setSaveError(
        e.code === "23505"
          ? "Ese teléfono o documento ya pertenece a otro contacto."
          : e.message || "No se pudo guardar."
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    const who = contact.name || contact.wa_name || (contact.phone ? `+${contact.phone}` : "este contacto");
    if (
      !window.confirm(
        `¿Eliminar a ${who}?\n\nSe borran su conversación, leads y pólizas. Las citas y los SOAT quedan sin cliente asignado.\nEsto no se puede deshacer.`
      )
    )
      return;
    setBusy(true);
    try {
      await deleteContact(contact.id);
      onDeleted?.();
    } catch (e) {
      setSaveError(e.message || "No se pudo eliminar.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
        <div className={`grid gap-5 ${compact ? "" : "md:grid-cols-2"}`}>
          <div className="space-y-1">
            <label className={label}>Nombre</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className={label}>Correo</label>
            <input className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className={label}>Documento</label>
            <div className="flex gap-2">
              <select
                className={`${input} w-24`}
                value={form.doc_type}
                onChange={(e) => setForm({ ...form, doc_type: e.target.value })}
              >
                <option value="">—</option>
                {["CC", "NIT", "CE", "PAS"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input
                className={input}
                value={form.doc_number}
                onChange={(e) => setForm({ ...form, doc_number: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className={label}>Teléfono / WhatsApp</label>
            <input
              className={input}
              value={form.phone}
              inputMode="tel"
              placeholder="300 123 4567"
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          {contact.advisor !== undefined && (
            <div className="space-y-1">
              <label className={label}>Asesor</label>
              <input
                className={input}
                list="crm-advisor-names"
                value={form.advisor}
                placeholder="Asesor responsable"
                onChange={(e) => setForm({ ...form, advisor: e.target.value })}
              />
            </div>
          )}
          <div className="space-y-1">
            <label className={label}>Fecha de nacimiento</label>
            <input
              type="date"
              className={input}
              value={form.birth_date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setForm({ ...form, birth_date: e.target.value })}
            />
            {form.birth_date && <p className="text-xs font-mono text-accent">{birthdayLabel(form.birth_date)}</p>}
            {contact.birth_date && <BirthdayGreetButton contactId={contact.id} />}
          </div>
          <div className="space-y-1">
            <label className={label}>Ciudad</label>
            <input className={input} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className={label}>Estado</label>
            <select className={input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {Object.entries(CONTACT_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className={label}>Interés</label>
            <select
              className={input}
              value={form.interest}
              onChange={(e) => setForm({ ...form, interest: e.target.value })}
            >
              <option value="">—</option>
              {Object.entries(TOPICS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className={label}>Carpeta en OneDrive</label>
          <input
            className={input}
            value={form.onedrive_folder}
            placeholder="Clientes/Nombre del cliente"
            onChange={(e) => setForm({ ...form, onedrive_folder: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <label className={label}>Notas</label>
          <textarea
            rows={3}
            className={input}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        {contact.notify_opt_out !== undefined && (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="accent-[#EA580C] w-4 h-4"
              checked={!form.notify_opt_out}
              onChange={(e) => setForm({ ...form, notify_opt_out: !e.target.checked })}
            />
            Enviarle recordatorios automáticos de vencimiento (SOAT y tecnomecánica) por WhatsApp y correo
          </label>
        )}
        <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
          <button
            onClick={remove}
            disabled={busy}
            className="text-sm px-3 py-2 rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
          >
            🗑 Eliminar cliente
          </button>
          <span className="ml-auto flex flex-wrap items-center gap-3">
            {saved && <span className="text-sm text-emerald-600 font-medium">Guardado ✓</span>}
            {saveError && <span className="text-sm text-danger">{saveError}</span>}
            <button
              onClick={save}
              disabled={busy}
              className="px-5 py-2 bg-accent hover:bg-[#C2410C] text-white text-sm font-medium rounded-lg shadow-sm transition-colors"
            >
              {busy ? "Guardando…" : "💾 Guardar cambios"}
            </button>
          </span>
        </div>
    </div>
  );
}

// Hoja del cliente compacta (panel derecho de Conversaciones)
export function ClientSheet({ contact, onSaved, onSchedule, onDeleted, compact = false }) {
  return (
    <div className="space-y-6">
      <div className={`doc-card ${compact ? "p-4" : "p-6"} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-lg text-slate-900">{contact.name || contact.wa_name || "Sin nombre"}</h2>
            <p className="text-xs text-slate-500">
              {contact.phone ? `+${contact.phone}` : "sin teléfono"}
              {contact.doc_number && ` · ${contact.doc_type || "Doc"} ${contact.doc_number}`} · origen: {contact.source}
            </p>
          </div>
          <div className="flex gap-2">
            {contact.phone && (
              <a
                href={waLink(contact.phone)}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium rounded-lg px-3 py-2 bg-whatsapp hover:bg-whatsapp-hover text-white"
              >
                WhatsApp
              </a>
            )}
            <button onClick={() => onSchedule(contact)} className="btn-cta text-xs py-2 px-3">
              Agendar
            </button>
          </div>
        </div>
        <LeadHistory contactId={contact.id} />
        <ClientForm contact={contact} onSaved={onSaved} onDeleted={onDeleted} compact={compact} />
      </div>
      <ContactPolicies contactId={contact.id} />
      <ContactSoat contactId={contact.id} />
    </div>
  );
}

const STATUS_BADGE = {
  cliente: "bg-emerald-100 text-emerald-800 border-emerald-200",
  perdido: "bg-slate-100 text-slate-500 border-slate-200",
};

function TabIcon({ d }) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// Ficha del cliente con pestañas (vista Clientes)
function ClientDetail({ contact, onBack, onSaved, onSchedule, onDeleted }) {
  const [tab, setTab] = useState("info");
  const name = contact.name || contact.wa_name || "Sin nombre";
  const tabs = [
    ["info", "Información general", "M4 6h16v12H4zM8 10h4M8 14h8M16 10h0"],
    ["vehiculos", "Vehículos & SOAT", "M5 16l1.5-5h11L19 16M5 16h14v3H5zM8 11l1.5-4h5L16 11", contact.soat_count],
    ["polizas", "Pólizas", "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6", contact.policies_count],
    ["chat", "Conversación", "M4 5h16v10H8l-4 4V5z", contact.unread_count],
    ["historial", "Historial & notas", "M12 8v4l3 2M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"],
    ["docs", "Documentos", "M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 8a4 4 0 0 1 0 8H7z"],
  ];
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="bg-surface border-b border-border px-4 sm:px-6 pt-5 shrink-0 shadow-sm">
        <button onClick={onBack} className="md:hidden mb-2 text-sm text-slate-500 hover:text-accent">
          ← Clientes
        </button>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight truncate">{name}</h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                  contact.segment === "solo_soat"
                    ? "bg-slate-100 text-slate-700 border-slate-200"
                    : STATUS_BADGE[contact.status] || "bg-amber-50 text-amber-700 border-amber-200"
                }`}
              >
                {contact.segment === "solo_soat" ? "Solo SOAT" : CONTACT_STATUS[contact.status] || contact.status}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
              <span className="font-mono text-slate-600">📞 {contact.phone ? `+${contact.phone}` : "sin teléfono"}</span>
              {contact.doc_number && (
                <>
                  <span>•</span>
                  <span>
                    {contact.doc_type || "Doc"} <strong className="text-slate-700 font-medium">{contact.doc_number}</strong>
                  </span>
                </>
              )}
              <span>•</span>
              <span>
                Origen: <strong className="text-slate-700 font-medium">{LEAD_SOURCE[contact.lead_source] || contact.source}</strong>
              </span>
              {contact.advisor && (
                <>
                  <span>•</span>
                  <span>
                    Asesor: <strong className="text-slate-700 font-medium">{contact.advisor}</strong>
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {contact.phone && (
              <a
                href={waLink(contact.phone)}
                target="_blank"
                rel="noreferrer"
                className="bg-whatsapp hover:bg-whatsapp-hover text-white px-4 py-2.5 rounded-lg font-medium text-sm shadow-sm flex items-center gap-2 transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                  <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.4.4c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.1.1.6-.1 1.2z" />
                </svg>
                Abrir WhatsApp
              </a>
            )}
            <button
              onClick={() => onSchedule(contact)}
              className="bg-accent hover:bg-[#C2410C] text-white px-4 py-2.5 rounded-lg font-medium text-sm shadow-sm transition-colors"
            >
              📅 Agendar asesoría
            </button>
          </div>
        </div>

        <nav className="flex gap-6 mt-5 text-sm font-medium overflow-x-auto no-scrollbar">
          {tabs.map(([k, v, d, n]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`shrink-0 pb-3 flex items-center gap-2 border-b-2 transition-colors ${
                tab === k ? "text-accent border-accent" : "text-slate-500 border-transparent hover:text-slate-800"
              }`}
            >
              <TabIcon d={d} />
              {v}
              {n > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs ${k === "chat" ? "bg-accent text-white" : "bg-slate-100 text-slate-600"}`}>
                  {n}
                </span>
              )}
            </button>
          ))}
        </nav>
      </header>

      <div className={`flex-1 min-h-0 ${tab === "chat" ? "flex flex-col" : "overflow-y-auto p-4 sm:p-6"}`}>
        {tab === "info" && (
          <div className="max-w-5xl bg-surface p-6 rounded-xl border border-border shadow-sm space-y-6 admin-rise">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-900">Datos personales y de contacto</h3>
              {contact.updated_at && <span className="text-xs text-slate-400">Actualizado: {fmtDateTime(contact.updated_at)}</span>}
            </div>
            <ClientForm contact={contact} onSaved={onSaved} onDeleted={onDeleted} />
          </div>
        )}
        {tab === "vehiculos" && (
          <div className="max-w-5xl admin-rise">
            <ContactSoat contactId={contact.id} />
          </div>
        )}
        {tab === "polizas" && (
          <div className="max-w-5xl admin-rise">
            <ContactPolicies contactId={contact.id} />
          </div>
        )}
        {tab === "chat" && <ChatThread contact={contact} onSaved={onSaved} fill />}
        {tab === "historial" && (
          <div className="max-w-5xl bg-surface p-6 rounded-xl border border-border shadow-sm space-y-4 admin-rise">
            <h3 className="font-semibold text-slate-900">Bitácora de interacciones</h3>
            <LeadHistory contactId={contact.id} empty="Sin interacciones registradas todavía." />
            <div className="border-l-2 border-slate-200 pl-4 text-xs text-slate-600">
              <span className="font-semibold text-slate-800">Cliente creado</span> · origen {contact.source}
              <p className="text-[11px] text-slate-400">{contact.created_at ? fmtDateTime(contact.created_at) : ""}</p>
            </div>
            {contact.notes && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 mb-1">Notas</p>
                {contact.notes}
              </div>
            )}
          </div>
        )}
        {tab === "docs" && (
          <div className="max-w-5xl bg-surface rounded-xl border border-border shadow-sm text-center py-12 px-6 admin-rise">
            <div className="text-4xl mb-3">☁️</div>
            <h4 className="text-sm font-semibold text-slate-700">Carpeta del cliente en OneDrive</h4>
            {contact.onedrive_folder ? (
              <>
                <p className="text-xs text-slate-500 mt-1 mb-4 font-mono">{contact.onedrive_folder}</p>
                <button
                  onClick={() => navigator.clipboard?.writeText(contact.onedrive_folder)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-medium"
                >
                  📋 Copiar ruta
                </button>
              </>
            ) : (
              <p className="text-xs text-slate-400 mt-1">
                Sin carpeta asignada. Agrégala en <button onClick={() => setTab("info")} className="text-accent underline">Información general</button>.
              </p>
            )}
            <p className="text-xs text-slate-400 mt-6">Los PDF de cada póliza se abren desde la pestaña Pólizas.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Conversación de WhatsApp con el cliente (mensajes + respuesta). fill = ocupa todo el alto del panel.
export function ChatThread({ contact, onSaved, fill = false, header = null }) {
  const [messages, setMessages] = useState([]);
  const bottomRef = useRef(null);

  const loadMessages = useCallback(() => {
    getMessages(contact.id).then(setMessages).catch(() => {});
  }, [contact.id]);

  useEffect(() => {
    loadMessages();
    if (contact.unread_count > 0) markRead(contact.id).then(onSaved).catch(() => {});
    const t = setInterval(loadMessages, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  return (
      <div className={fill ? "h-full flex flex-col min-h-0" : "doc-card p-4 sm:p-6"}>
        <div className={`flex flex-wrap items-center justify-between gap-2 ${fill ? "px-4 py-3 border-b border-border" : "mb-4"}`}>
          {header || <h3 className="font-display font-semibold">Conversación</h3>}
          <div className="flex items-center gap-3">
            <BotSwitch contact={contact} onChanged={onSaved} />
            <button onClick={loadMessages} className="text-xs font-mono text-muted hover:text-accent">
              Actualizar
            </button>
          </div>
        </div>
        <div className={fill ? "flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-2 chat-bg" : "space-y-2 max-h-[55vh] overflow-y-auto pr-1"}>
          {messages.length === 0 && <p className="text-sm text-muted font-mono">Sin mensajes registrados.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap shadow-sm ${
                  m.direction === "out"
                    ? "bg-primary text-primary-foreground rounded-br-md"
                    : "bg-surface border border-border rounded-bl-md"
                }`}
              >
                {isMediaMessage(m) && <MessageMedia m={m} />}
                {m.body ? <div>{m.body}</div> : !isMediaMessage(m) && <em className="opacity-70">[{m.type}]</em>}
                <div className="text-[10px] opacity-70 mt-1 font-mono text-right">
                  {fmtDateTime(m.created_at)}
                  {m.direction === "out" && ` · ${m.sent_by || "bot"} · ${m.status || ""}`}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        <div className={fill ? "border-t border-border px-4 py-3 bg-surface" : ""}>
        <ReplyBox
          contactId={contact.id}
          messages={messages}
          onSent={() => {
            loadMessages();
            onSaved();
          }}
        />
        </div>
      </div>
  );
}

// Enviar ya la felicitación de cumpleaños (muestra el texto antes de enviarlo)
function BirthdayGreetButton({ contactId }) {
  const [state, setState] = useState("");
  return (
    <div className="text-xs font-mono space-y-1">
      <button
        type="button"
        className="text-muted hover:text-accent"
        disabled={state === "…"}
        onClick={async () => {
          try {
            setState("…");
            const text = await sendBirthdayGreeting(contactId, true);
            if (!window.confirm(`Se enviará por WhatsApp y correo:\n\n${text.replace(/\*/g, "")}`)) return setState("");
            const r = await sendBirthdayGreeting(contactId);
            setState(r?.log?.map((l) => `${l.channel === "email" ? "✉️" : "💬"} ${l.status}${l.detail ? ` (${l.detail})` : ""}`).join(" · ") || "listo");
          } catch (e) {
            setState("⚠️ " + e.message);
          }
        }}
      >
        🎂 Enviar felicitación
      </button>
      {state && state !== "…" && <p className="text-muted">{state}</p>}
    </div>
  );
}

function BotSwitch({ contact, onChanged }) {
  const human = contact.bot_state === "asesor";
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      await setBotActive(contact.id, human);
      onChanged();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={human ? "Devolver la conversación a BotMazo" : "Tomar la conversación (el bot deja de responder)"}
      className={`text-[11px] font-mono px-2 py-1 rounded border ${
        human ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"
      }`}
    >
      {human ? "🙋 Atiende un asesor · devolver al bot" : "🤖 Atiende BotMazo · tomar chat"}
    </button>
  );
}

function ReplyBox({ contactId, messages, onSent }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const lastIn = [...messages].reverse().find((m) => m.direction === "in");
  const left = lastIn ? REPLY_WINDOW_MS - (now - new Date(lastIn.created_at).getTime()) : -1;
  const open = left > 0;
  const hours = Math.floor(left / 3600000);
  const mins = Math.floor((left % 3600000) / 60000);

  async function send(e) {
    e?.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setError("");
    try {
      await sendReply(contactId, body);
      setText("");
      onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={send} className="mt-4 pt-4 border-t border-border space-y-2">
      <div className={`text-[11px] font-mono ${open ? (left < 3600000 ? "text-danger" : "text-muted") : "text-danger"}`}>
        {open
          ? `Puedes responder libremente: quedan ${hours} h ${mins} min de la ventana de 24 h. Al enviar, BotMazo se pausa en este chat.`
          : "La ventana de 24 h está cerrada: WhatsApp solo permite escribirle con una plantilla aprobada."}
      </div>
      <div className="flex gap-2 items-end">
        <textarea
          rows={2}
          value={text}
          disabled={!open || sending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 768px)").matches) send(e);
          }}
          placeholder={open ? "Escribe tu respuesta…" : "Ventana cerrada"}
          className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm focus-ring resize-y disabled:opacity-60"
        />
        <button type="submit" disabled={!open || sending || !text.trim()} className="btn-cta text-xs py-3 px-4 disabled:opacity-50">
          {sending ? "…" : "Enviar"}
        </button>
      </div>
      {error && <p className="text-xs text-danger font-mono">{error}</p>}
      <VoiceRecorder contactId={contactId} disabled={!open} onSent={onSent} />
    </form>
  );
}

function LeadHistory({ contactId, empty = null }) {
  const [leads, setLeads] = useState([]);
  useEffect(() => {
    getLeads(contactId).then(setLeads).catch(() => {});
  }, [contactId]);
  if (!leads.length) return empty ? <p className="text-xs text-slate-400">{empty}</p> : null;
  return (
    <div className="text-xs text-slate-600 space-y-3 border-l-2 border-slate-200 pl-4">
      {leads.map((l) => (
        <div key={l.id}>
          <span className="font-semibold text-slate-800">{LEAD_SOURCE[l.source] || l.source}</span>
          {l.detail && ` · ${l.detail}`}
          {l.interest && ` · ${TOPICS[l.interest] || l.interest}`} · {fmtDateTime(l.created_at)}
          {l.first_message && <div className="italic truncate">“{l.first_message}”</div>}
        </div>
      ))}
    </div>
  );
}
