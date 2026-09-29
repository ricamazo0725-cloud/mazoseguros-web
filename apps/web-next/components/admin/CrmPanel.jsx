"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONTACT_STATUS,
  TOPICS,
  listContacts,
  updateContact,
  getMessages,
  markRead,
  fmtDateTime,
  waLink,
} from "@/lib/crm";

const input = "w-full bg-background border border-border rounded px-3 py-2 text-sm focus-ring";
const label = "text-xs font-mono uppercase tracking-wider text-muted";

export default function CrmPanel({ onSchedule }) {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    listContacts({ search, status })
      .then((rows) => {
        setContacts(rows);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [search, status]);

  useEffect(() => {
    const t = setTimeout(refresh, 250); // espera a que termine de escribir
    return () => clearTimeout(t);
  }, [refresh]);

  // Refresca la lista cada 20 s para ver mensajes nuevos de WhatsApp
  useEffect(() => {
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [refresh]);

  const selected = contacts.find((c) => c.id === selectedId) || null;

  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr]">
      <aside className="space-y-3">
        <input
          className={input}
          placeholder="Buscar por nombre o teléfono"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos los estados</option>
          {Object.entries(CONTACT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-danger font-mono">{error}</p>}
        <ul className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
          {contacts.length === 0 && !error && (
            <li className="text-sm text-muted font-mono">Sin contactos todavía.</li>
          )}
          {contacts.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left doc-card p-3 focus-ring ${
                  c.id === selectedId ? "border-accent" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-semibold truncate">{c.name || c.wa_name || c.phone}</span>
                  {c.unread_count > 0 && (
                    <span className="text-[10px] font-mono bg-accent text-accent-foreground rounded-full px-2 py-0.5">
                      {c.unread_count}
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-muted flex justify-between gap-2">
                  <span>+{c.phone}</span>
                  <span>{CONTACT_STATUS[c.status] || c.status}</span>
                </div>
                {c.last_message_at && (
                  <div className="text-[11px] text-muted mt-1">{fmtDateTime(c.last_message_at)}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section>
        {selected ? (
          <ContactDetail key={selected.id} contact={selected} onSaved={refresh} onSchedule={onSchedule} />
        ) : (
          <div className="doc-card p-10 text-center text-muted text-sm">
            Elige un contacto para ver su ficha y la conversación.
          </div>
        )}
      </section>
    </div>
  );
}

function ContactDetail({ contact, onSaved, onSchedule }) {
  const [form, setForm] = useState({
    name: contact.name || "",
    email: contact.email || "",
    status: contact.status,
    interest: contact.interest || "",
    notes: contact.notes || "",
  });
  const [saved, setSaved] = useState(false);
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

  async function save() {
    await updateContact(contact.id, {
      name: form.name || null,
      email: form.email || null,
      status: form.status,
      interest: form.interest || null,
      notes: form.notes || null,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved();
  }

  return (
    <div className="space-y-6">
      <div className="doc-card p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold text-lg">{contact.name || contact.wa_name || "Sin nombre"}</h2>
            <p className="text-xs font-mono text-muted">
              +{contact.phone} · origen: {contact.source}
              {contact.wa_name && contact.wa_name !== contact.name ? ` · WhatsApp: ${contact.wa_name}` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href={waLink(contact.phone)}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-mono border border-border rounded px-3 py-2 hover:border-accent"
            >
              Abrir WhatsApp
            </a>
            <button onClick={() => onSchedule(contact)} className="btn-cta text-xs py-2 px-4">
              Agendar asesoría
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className={label}>Nombre</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className={label}>Correo</label>
            <input className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
          <label className={label}>Notas</label>
          <textarea
            rows={3}
            className={input}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={save} className="btn-cta text-xs py-2 px-4">
            Guardar ficha
          </button>
          {saved && <span className="text-xs text-accent font-mono">Guardado ✓</span>}
        </div>
      </div>

      <div className="doc-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-semibold">Conversación</h3>
          <button onClick={loadMessages} className="text-xs font-mono text-muted hover:text-accent">
            Actualizar
          </button>
        </div>
        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
          {messages.length === 0 && <p className="text-sm text-muted font-mono">Sin mensajes registrados.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.direction === "out" ? "bg-primary text-primary-foreground" : "bg-surface-2"
                }`}
              >
                {m.body || <em className="opacity-70">[{m.type}]</em>}
                <div className="text-[10px] opacity-70 mt-1 font-mono text-right">
                  {fmtDateTime(m.created_at)}
                  {m.direction === "out" && ` · ${m.sent_by || "bot"} · ${m.status || ""}`}
                </div>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
