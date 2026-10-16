"use client";

import { useCallback, useEffect, useState } from "react";
import { ContactRow, ClientSheet, ChatThread } from "@/components/admin/CrmPanel";
import { listContacts, getContact, waLink, CONTACT_STATUS } from "@/lib/crm";

const FILTERS = [
  ["todas", "Todas"],
  ["unread", "No leídas"],
  ["asesor", "🙋 Asesor"],
  ["bot", "🤖 Bot"],
];

function initials(n) {
  const w = String(n || "?").replace(/[^\p{L}\s]/gu, "").trim().split(/\s+/);
  return ((w[0]?.[0] || "?") + (w[1]?.[0] || "")).toUpperCase();
}

// Bandeja de conversaciones: lista · chat · hoja del cliente (estilo WhatsApp Web / Chatwoot)
export default function InboxPanel({ initialContactId, onSchedule }) {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("todas");
  const [selectedId, setSelectedId] = useState(initialContactId || null);
  const [selected, setSelected] = useState(null);
  const [showSheet, setShowSheet] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    listContacts({
      search,
      chats: true,
      unread: filter === "unread",
      attention: filter === "asesor" ? "asesor" : filter === "bot" ? "bot" : "",
      sort: "recientes",
    })
      .then((r) => {
        setRows(r);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [search, filter]);

  useEffect(() => {
    const t = setTimeout(refresh, 250);
    return () => clearTimeout(t);
  }, [refresh]);
  useEffect(() => {
    const t = setInterval(refresh, 20000);
    return () => clearInterval(t);
  }, [refresh]);
  useEffect(() => {
    if (initialContactId) setSelectedId(initialContactId);
  }, [initialContactId]);

  // El contacto abierto se toma de la lista o se carga aparte (si viene de un aviso)
  useEffect(() => {
    if (!selectedId) return setSelected(null);
    const inList = rows.find((r) => r.id === selectedId);
    if (inList) setSelected(inList);
    else getContact(selectedId).then(setSelected).catch(() => {});
  }, [selectedId, rows]);

  const unreadTotal = rows.reduce((n, r) => n + (r.unread_count || 0), 0);
  const name = selected ? selected.name || selected.wa_name || `+${selected.phone}` : "";

  return (
    <div className="h-full grid md:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_auto] min-h-0 bg-surface">
      {/* ── Lista de conversaciones ── */}
      <aside className={`min-h-0 flex flex-col border-r border-border bg-surface shadow-sm ${selectedId ? "hidden md:flex" : "flex"}`}>
        <div className="px-4 pt-4 pb-3 space-y-3 border-b border-border">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Conversaciones</h2>
            {unreadTotal > 0 && (
              <span className="text-[11px] font-mono bg-accent text-accent-foreground rounded-full px-2 py-0.5">{unreadTotal} sin leer</span>
            )}
          </div>
          <input
            className="w-full bg-white border border-slate-200 rounded-lg px-4 py-2 text-sm"
            placeholder="Buscar nombre, celular o placa"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-1 overflow-x-auto no-scrollbar">
            {FILTERS.map(([k, v]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`shrink-0 text-xs font-medium px-3 py-1 rounded-full border transition ${
                  filter === k ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-xs text-danger font-mono px-4 pt-2">{error}</p>}
        <ul className="flex-1 min-h-0 overflow-y-auto divide-y divide-slate-100">
          {rows.length === 0 && !error && <li className="text-sm text-muted font-mono p-6 text-center">No hay conversaciones.</li>}
          {rows.map((c) => (
            <li key={c.id}>
              <ContactRow c={c} active={c.id === selectedId} onClick={() => setSelectedId(c.id)} />
            </li>
          ))}
        </ul>
      </aside>

      {/* ── Chat ── */}
      <section className={`min-h-0 flex flex-col ${selectedId ? "flex" : "hidden md:flex"}`}>
        {selected ? (
          <ChatThread
            key={selected.id}
            contact={selected}
            onSaved={refresh}
            fill
            header={
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={() => setSelectedId(null)} className="md:hidden text-muted hover:text-accent text-lg" aria-label="Volver">
                  ←
                </button>
                <span className="shrink-0 w-10 h-10 rounded-full grid place-items-center bg-primary text-primary-foreground text-sm font-semibold">
                  {initials(name)}
                </span>
                <span className="min-w-0">
                  <span className="block font-display font-semibold truncate">{name}</span>
                  <span className="block text-[11px] font-mono text-muted truncate">
                    {selected.phone ? `+${selected.phone}` : ""} · {CONTACT_STATUS[selected.status] || selected.status}
                    {selected.advisor ? ` · 👤 ${selected.advisor}` : ""}
                  </span>
                </span>
                {selected.phone && (
                  <a href={waLink(selected.phone)} target="_blank" rel="noreferrer" className="hidden sm:inline text-[11px] font-mono text-muted hover:text-accent">
                    WhatsApp ↗
                  </a>
                )}
                <button
                  onClick={() => setShowSheet((v) => !v)}
                  className={`text-[11px] font-mono px-3 py-1.5 rounded-full border ${showSheet ? "border-accent text-accent" : "border-border text-muted"}`}
                >
                  📋 Hoja del cliente
                </button>
              </div>
            }
          />
        ) : (
          <div className="flex-1 grid place-items-center chat-bg">
            <div className="text-center space-y-2 p-8">
              <p className="font-display text-2xl">Elige una conversación</p>
              <p className="text-sm text-muted">A la derecha verás la hoja del cliente con sus pólizas y SOAT.</p>
            </div>
          </div>
        )}
      </section>

      {/* ── Hoja del cliente ── */}
      {selected && showSheet && (
        <>
          {/* en pantallas medianas se muestra como panel flotante */}
          <div className="xl:hidden fixed inset-0 z-40 bg-primary/30" onClick={() => setShowSheet(false)} />
          <aside className="fixed right-0 top-0 bottom-0 z-50 w-[min(420px,100vw)] xl:static xl:z-auto xl:w-[400px] min-h-0 overflow-y-auto thin-scroll border-l border-border bg-background p-4 admin-rise">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">Hoja del cliente</h3>
              <button onClick={() => setShowSheet(false)} className="text-xs font-mono text-muted hover:text-accent">
                Cerrar ✕
              </button>
            </div>
            <ClientSheet
              key={selected.id}
              contact={selected}
              compact
              onSaved={refresh}
              onSchedule={onSchedule}
              onDeleted={() => {
                setSelectedId(null);
                refresh();
              }}
            />
          </aside>
        </>
      )}
    </div>
  );
}
