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

const input = "w-full bg-background border border-border rounded px-3 py-2 text-sm focus-ring";
const label = "text-xs font-mono uppercase tracking-wider text-muted";

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

  return (
    <div className="grid gap-6 md:grid-cols-[360px_1fr]">
      <aside className={`space-y-3 ${showRight ? "hidden md:block" : ""}`}>
        <div className="flex gap-2">
          <button
            onClick={() => setMode("new")}
            className={`flex-1 text-xs font-mono px-3 py-2 rounded border ${mode === "new" ? "border-accent text-accent" : "border-border hover:border-accent"}`}
          >
            + Nuevo cliente
          </button>
          <button
            onClick={() => setMode("import")}
            className={`flex-1 text-xs font-mono px-3 py-2 rounded border ${mode === "import" ? "border-accent text-accent" : "border-border hover:border-accent"}`}
          >
            📂 Importar
          </button>
        </div>
        {/* Segmentos */}
        <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-surface-2 border border-border">
          {Object.entries(SEGMENTS).map(([k, v]) => (
            <button
              key={k || "all"}
              onClick={() => setSegment(k)}
              className={`rounded-md px-1 py-1.5 text-[11px] font-mono leading-tight transition ${
                segment === k ? "bg-background shadow-sm text-accent font-semibold" : "text-muted hover:text-foreground"
              }`}
            >
              {v}
              {counts?.[k] != null && <span className="block text-[10px] opacity-70">{counts[k]}</span>}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input
            className={input}
            placeholder="Buscar nombre, celular, cédula o placa"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`shrink-0 text-xs font-mono px-3 rounded border ${showFilters || activeFilters ? "border-accent text-accent" : "border-border text-muted"}`}
            title="Filtros y orden"
          >
            ⚙︎{activeFilters ? ` ${activeFilters}` : ""}
          </button>
        </div>

        <select
          className={`${input} ${advisor ? "border-accent text-accent" : ""}`}
          value={advisor}
          onChange={(e) => setAdvisor(e.target.value)}
        >
          <option value="">👤 Todos los asesores</option>
          <option value="__none">Sin asesor asignado</option>
          {advisorNames.map((n) => (
            <option key={n} value={n}>
              👤 {n}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap gap-1.5">
          {[
            ["", "Todo"],
            ["vencido", "⛔ Vencidos"],
            ["d30", "⏳ ≤ 30 días"],
            ["d60", "📅 ≤ 60 días"],
          ].map(([k, v]) => (
            <button
              key={k || "all"}
              onClick={() => setDue(k)}
              className={`text-[11px] font-mono px-2.5 py-1 rounded-full border transition ${
                due === k
                  ? k === "vencido"
                    ? "border-danger bg-danger/10 text-danger"
                    : "border-accent bg-accent/10 text-accent"
                  : "border-border text-muted hover:text-foreground"
              }`}
            >
              {v}
            </button>
          ))}
          <select
            value={insurer}
            onChange={(e) => setInsurer(e.target.value)}
            className={`text-[11px] font-mono px-2 py-1 rounded-full border bg-background ${insurer ? "border-accent text-accent" : "border-border text-muted"}`}
          >
            <option value="">🏢 Aseguradora</option>
            {INSURERS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {showFilters && (
          <div className="space-y-2 doc-card p-3">
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
                className="text-xs font-mono text-muted hover:text-accent"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        )}
        <datalist id="crm-advisor-names">
          {advisorNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>

        <div className="flex items-center justify-between text-[11px] font-mono text-muted px-1">
          <span>
            {total} {total === 1 ? "contacto" : "contactos"}
            {segment ? ` · ${SEGMENTS[segment]}` : ""}
            {advisor ? ` · ${advisor === "__none" ? "sin asesor" : advisor}` : ""}
            {insurer ? ` · ${insurer}` : ""}
            {due === "vencido" ? " · vencidos" : due ? ` · vence ≤ ${due.slice(1)} d` : ""}
          </span>
          {total > contacts.length && <span>mostrando {contacts.length}</span>}
        </div>
        {error && <p className="text-xs text-danger font-mono">{error}</p>}
        <ul className="space-y-2 max-h-[65vh] overflow-y-auto pr-1">
          {contacts.length === 0 && !error && (
            <li className="text-sm text-muted font-mono p-4 text-center">
              {search || activeFilters || segment ? "Nada coincide con la búsqueda." : "Sin contactos todavía."}
            </li>
          )}
          {contacts.map((c) => (
            <li key={c.id}>
              <ContactRow
                c={c}
                active={c.id === selectedId}
                onClick={() => {
                  setMode(null);
                  setSelectedId(c.id);
                }}
              />
            </li>
          ))}
        </ul>
      </aside>

      <section className={showRight ? "" : "hidden md:block"}>
        {showRight && (
          <button
            onClick={() => {
              setMode(null);
              setSelectedId(null);
            }}
            className="md:hidden mb-3 text-xs font-mono text-muted hover:text-accent"
          >
            ← Contactos
          </button>
        )}
        {mode === "new" ? (
          <NewContactForm onCreated={open} onOpen={open} onCancel={() => setMode(null)} />
        ) : mode === "import" ? (
          <ContactImport onDone={refresh} onOpen={open} onCancel={() => setMode(null)} />
        ) : selected ? (
          <ContactDetail
            key={selected.id}
            contact={selected}
            onSaved={refresh}
            onSchedule={onSchedule}
            onDeleted={() => {
              setSelectedId(null);
              setExtra(null);
              refresh();
            }}
          />
        ) : (
          <div className="doc-card p-10 text-center text-muted text-sm">
            Elige un contacto para ver su ficha y la conversación.
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

function dueChip(c) {
  if (c.next_date == null || c.next_days == null) return null;
  const d = c.next_days;
  const when = d < 0 ? `venció hace ${-d} d` : d === 0 ? "vence hoy" : `vence en ${d} d`;
  const cls = d < 0 ? "text-danger border-danger/40" : d <= 30 ? "text-accent border-accent/40" : "text-muted border-border";
  return <span className={`text-[10px] font-mono border rounded px-1.5 py-0.5 ${cls}`}>{KIND[c.next_kind] || ""} {when}</span>;
}

export function ContactRow({ c, active, onClick, compact = false }) {
  const name = c.name || c.wa_name || (c.phone ? `+${c.phone}` : "Sin nombre");
  const seg = SEGMENT_CHIP[c.segment];
  return (
    <button
      onClick={onClick}
      className={`w-full text-left doc-card p-3 focus-ring flex gap-3 items-start transition ${active ? "border-accent ring-1 ring-accent/40" : "hover:border-accent/50"}`}
    >
      <span
        className={`shrink-0 w-9 h-9 rounded-full grid place-items-center text-xs font-semibold ${
          c.segment === "solo_soat" ? "bg-primary/15 text-primary" : c.segment === "cliente" ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"
        }`}
      >
        {initials(name)}
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-center justify-between gap-2">
          <span className="font-display font-semibold truncate">{name}</span>
          <span className="flex items-center gap-1 shrink-0">
            {birthdayInfo(c.birth_date)?.days === 0 && <span title="Cumple hoy">🎂</span>}
            {c.bot_state === "asesor" && <span title="Atendido por asesor">🙋</span>}
            {c.unread_count > 0 && (
              <span className="text-[10px] font-mono bg-accent text-accent-foreground rounded-full px-2 py-0.5">{c.unread_count}</span>
            )}
          </span>
        </span>
        <span className="block text-xs font-mono text-muted truncate">
          {c.phone ? `+${c.phone}` : c.doc_number || "sin teléfono"}
          {c.advisor && <> · 👤 {c.advisor}</>}
        </span>
        <span className="flex flex-wrap items-center gap-1">
          {seg && <span className={`text-[10px] font-mono border rounded px-1.5 py-0.5 ${seg.cls}`}>{seg.label}</span>}
          {c.segment === "solo_soat" && c.soat_plates && (
            <span className="text-[10px] font-mono border border-border rounded px-1.5 py-0.5 tracking-wider">🚗 {c.soat_plates}</span>
          )}
          {c.policies_count > 0 && (
            <span className="text-[10px] font-mono border border-border rounded px-1.5 py-0.5">
              {c.policies_count} {c.policies_count === 1 ? "póliza" : "pólizas"}
              {c.soat_count > 0 ? ` · ${c.soat_count} SOAT` : ""}
            </span>
          )}
          {dueChip(c)}
          {!seg && <span className="text-[10px] font-mono text-muted">{CONTACT_STATUS[c.status] || c.status}</span>}
        </span>
        {c.last_message_at && (
          <span className="block text-[10px] text-muted">
            💬 {fmtDateTime(c.last_message_at)}
            {LEAD_SOURCE[c.lead_source] ? ` · ${LEAD_SOURCE[c.lead_source]}` : ""}
          </span>
        )}
      </span>
    </button>
  );
}

export function ClientSheet({ contact, onSaved, onSchedule, onDeleted, compact = false }) {
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
    <div className="space-y-6">
      <div className={`doc-card ${compact ? "p-4" : "p-6"} space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold text-lg">{contact.name || contact.wa_name || "Sin nombre"}</h2>
            <p className="text-xs font-mono text-muted">
              {contact.phone ? `+${contact.phone}` : "sin teléfono"}
              {contact.doc_number && ` · ${contact.doc_type || "Doc"} ${contact.doc_number}`} · origen: {contact.source}
              {contact.wa_name && contact.wa_name !== contact.name ? ` · WhatsApp: ${contact.wa_name}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            {contact.phone && (
            <a
              href={waLink(contact.phone)}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono border border-border rounded px-3 py-2 hover:border-accent"
            >
              Abrir WhatsApp
            </a>
            )}
            <button onClick={() => onSchedule(contact)} className="btn-cta text-xs py-2 px-4">
              Agendar asesoría
            </button>
          </div>
        </div>

        <LeadHistory contactId={contact.id} />

        <div className={`grid gap-4 ${compact ? "" : "sm:grid-cols-2"}`}>
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!form.notify_opt_out}
              onChange={(e) => setForm({ ...form, notify_opt_out: !e.target.checked })}
            />
            Enviarle recordatorios automáticos de vencimiento (SOAT y tecnomecánica) por WhatsApp y correo
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={save} disabled={busy} className="btn-cta text-xs py-2 px-4">
            {busy ? "Guardando…" : "Guardar cambios"}
          </button>
          {saved && <span className="text-xs text-accent font-mono">Guardado ✓</span>}
          {saveError && <span className="text-xs text-danger font-mono">{saveError}</span>}
          <button
            onClick={remove}
            disabled={busy}
            className="ml-auto text-xs font-mono px-3 py-2 rounded border border-border text-muted hover:border-danger hover:text-danger"
          >
            🗑 Eliminar cliente
          </button>
        </div>
      </div>

      <ContactPolicies contactId={contact.id} />
      <ContactSoat contactId={contact.id} />

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

// Hoja del cliente + conversación, una debajo de la otra (vista Clientes)
function ContactDetail(props) {
  return (
    <div className="space-y-6">
      <ClientSheet {...props} />
      <ChatThread contact={props.contact} onSaved={props.onSaved} />
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

function LeadHistory({ contactId }) {
  const [leads, setLeads] = useState([]);
  useEffect(() => {
    getLeads(contactId).then(setLeads).catch(() => {});
  }, [contactId]);
  if (!leads.length) return null;
  return (
    <div className="text-xs font-mono text-muted space-y-1 border-l-2 border-accent pl-3">
      {leads.map((l) => (
        <div key={l.id}>
          <span className="text-foreground">{LEAD_SOURCE[l.source] || l.source}</span>
          {l.detail && ` · ${l.detail}`}
          {l.interest && ` · ${TOPICS[l.interest] || l.interest}`} · {fmtDateTime(l.created_at)}
          {l.first_message && <div className="italic truncate">“{l.first_message}”</div>}
        </div>
      ))}
    </div>
  );
}
