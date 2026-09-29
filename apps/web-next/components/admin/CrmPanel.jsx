"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ContactPolicies } from "@/components/admin/PoliciesPanel";
import {
  CONTACT_STATUS,
  TOPICS,
  listContacts,
  updateContact,
  getContact,
  getMessages,
  markRead,
  sendReply,
  setBotActive,
  REPLY_WINDOW_MS,
  fmtDateTime,
  waLink,
} from "@/lib/crm";

const input = "w-full bg-background border border-border rounded px-3 py-2 text-sm focus-ring";
const label = "text-xs font-mono uppercase tracking-wider text-muted";

export default function CrmPanel({ onSchedule, initialContactId }) {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState(initialContactId || null);
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

  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr]">
      <aside className={`space-y-3 ${selectedId ? "hidden md:block" : ""}`}>
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
                  <span>{c.phone ? `+${c.phone}` : c.doc_number || "sin teléfono"}</span>
                  <span>
                    {c.bot_state === "asesor" && "🙋 "}
                    {CONTACT_STATUS[c.status] || c.status}
                  </span>
                </div>
                {c.last_message_at && (
                  <div className="text-[11px] text-muted mt-1">{fmtDateTime(c.last_message_at)}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={selectedId ? "" : "hidden md:block"}>
        {selectedId && (
          <button
            onClick={() => setSelectedId(null)}
            className="md:hidden mb-3 text-xs font-mono text-muted hover:text-accent"
          >
            ← Contactos
          </button>
        )}
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
    doc_type: contact.doc_type || "",
    doc_number: contact.doc_number || "",
    city: contact.city || "",
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
      doc_type: form.doc_type || null,
      doc_number: form.doc_number.replace(/[^0-9A-Za-z]/g, "").toUpperCase() || null,
      city: form.city || null,
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

      <ContactPolicies contactId={contact.id} />

      <div className="doc-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="font-display font-semibold">Conversación</h3>
          <div className="flex items-center gap-3">
            <BotSwitch contact={contact} onChanged={onSaved} />
            <button onClick={loadMessages} className="text-xs font-mono text-muted hover:text-accent">
              Actualizar
            </button>
          </div>
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
    </form>
  );
}
