"use client";

import { useEffect, useMemo, useState } from "react";
import { listExpirations, groupByInsurer, BANDS, bandOf, KIND_LABEL, LINE_LABEL } from "@/lib/dashboard";
import { segmentCounts, waLink } from "@/lib/crm";
import { fmtDate, fmtMoney } from "@/lib/policies";

const KINDS = [
  ["", "Todo"],
  ["poliza", "Pólizas"],
  ["soat", "SOAT"],
  ["rtm", "Tecnomecánica"],
];

function Kpi({ label, value, hint, tone = "", onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-left doc-card p-4 sm:p-5 hover:border-accent/60 transition group admin-rise"
      disabled={!onClick}
    >
      <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{label}</span>
      <span className={`block font-display text-4xl leading-none mt-2 ${tone}`}>{value ?? "—"}</span>
      {hint && <span className="block text-xs text-muted mt-2 group-hover:text-accent">{hint}</span>}
    </button>
  );
}

// Barra apilada de urgencia (vencidos → vigentes)
function BandBar({ bands, total }) {
  if (!total) return <div className="h-2.5 rounded-full bg-surface-2" />;
  return (
    <div className="h-2.5 rounded-full overflow-hidden flex bg-surface-2">
      {BANDS.map((b) =>
        bands[b.key] ? <span key={b.key} className={b.cls} style={{ width: `${(bands[b.key] / total) * 100}%` }} title={`${b.label}: ${bands[b.key]}`} /> : null
      )}
    </div>
  );
}

function dueText(d) {
  if (d < 0) return `venció hace ${-d} d`;
  if (d === 0) return "vence hoy";
  return `en ${d} d`;
}

// Tablero: vencimientos de pólizas, SOAT y tecnomecánica por aseguradora
export default function DashboardPanel({ onOpenContact, onOpenClients }) {
  const [rows, setRows] = useState(null);
  const [counts, setCounts] = useState(null);
  const [kind, setKind] = useState("");
  const [advisor, setAdvisor] = useState("");
  const [open, setOpen] = useState(null); // aseguradora abierta
  const [band, setBand] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    listExpirations().then(setRows).catch((e) => setError(e.message));
    segmentCounts().then(setCounts).catch(() => {});
  }, []);

  const advisors = useMemo(() => [...new Set((rows || []).map((r) => r.advisor).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(
    () => (rows || []).filter((r) => (!kind || r.kind === kind) && (!advisor || r.advisor === advisor)),
    [rows, kind, advisor]
  );
  const groups = useMemo(() => groupByInsurer(filtered), [filtered]);
  const totals = useMemo(() => {
    const t = {};
    for (const r of filtered) t[bandOf(r.days_left)] = (t[bandOf(r.days_left)] || 0) + 1;
    return t;
  }, [filtered]);
  const upcoming = useMemo(
    () => filtered.filter((r) => r.days_left >= -30 && r.days_left <= 30).sort((a, b) => a.days_left - b.days_left).slice(0, 40),
    [filtered]
  );
  const openGroup = groups.find((g) => g.insurer === open);
  const openItems = openGroup
    ? openGroup.items.filter((r) => !band || bandOf(r.days_left) === band).sort((a, b) => a.days_left - b.days_left)
    : [];

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm text-danger font-mono">{error}</p>
        <p className="text-sm text-muted mt-2">Ejecuta crm_contacts_view.sql en Supabase para activar el tablero.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 space-y-8 max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">Tablero</p>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">Vencimientos por aseguradora</h1>
          <p className="text-sm text-muted mt-1">Pólizas, SOAT y tecnomecánica: qué vence, con quién y a quién llamar primero.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex p-1 rounded-full bg-surface-2 border border-border">
            {KINDS.map(([k, v]) => (
              <button
                key={k || "all"}
                onClick={() => setKind(k)}
                className={`text-[11px] font-mono px-3 py-1 rounded-full transition ${kind === k ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground"}`}
              >
                {v}
              </button>
            ))}
          </div>
          {advisors.length > 0 && (
            <select
              value={advisor}
              onChange={(e) => setAdvisor(e.target.value)}
              className="text-[11px] font-mono px-3 py-1 rounded-full border border-border bg-background"
            >
              <option value="">👤 Todos los asesores</option>
              {advisors.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          )}
        </div>
      </header>

      {/* KPIs */}
      <section className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Kpi label="Clientes" value={counts?.[""]} hint={`${counts?.cliente ?? "—"} con pólizas · ${counts?.solo_soat ?? "—"} solo SOAT`} onClick={() => onOpenClients?.({})} />
        <Kpi label="Vencidos sin renovar" value={rows ? totals.vencido || 0 : null} tone="text-danger" hint="Recuperar → ver clientes" onClick={() => onOpenClients?.({ due: "vencido" })} />
        <Kpi label="Vencen en 7 días" value={rows ? totals.d7 || 0 : null} tone="text-accent" hint="Llamar hoy" onClick={() => onOpenClients?.({ due: "d30" })} />
        <Kpi label="Vencen en 8–60 días" value={rows ? (totals.d30 || 0) + (totals.d60 || 0) : null} hint="Preparar renovación" onClick={() => onOpenClients?.({ due: "d60" })} />
      </section>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-4 text-[11px] font-mono text-muted">
        {BANDS.map((b) => (
          <span key={b.key} className="inline-flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded-sm ${b.cls}`} /> {b.label}
          </span>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        {/* Aseguradoras */}
        <section className="grid gap-3 sm:grid-cols-2 content-start">
          {rows === null && <p className="text-sm text-muted font-mono">Cargando…</p>}
          {rows && groups.length === 0 && <p className="text-sm text-muted font-mono">Aún no hay vencimientos registrados.</p>}
          {groups.map((g, i) => (
            <button
              key={g.insurer}
              onClick={() => {
                setOpen(g.insurer === open ? null : g.insurer);
                setBand("");
              }}
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              className={`admin-rise text-left doc-card p-5 space-y-3 transition hover:-translate-y-0.5 hover:shadow-md ${
                open === g.insurer ? "border-accent ring-1 ring-accent/40" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-xl font-semibold truncate">{g.insurer}</p>
                  <p className="text-xs text-muted font-mono">
                    {g.clients} {g.clients === 1 ? "cliente" : "clientes"} ·{" "}
                    {Object.entries(g.byKind)
                      .map(([k, n]) => `${n} ${KIND_LABEL[k].toLowerCase()}`)
                      .join(" · ")}
                  </p>
                </div>
                {g.urgent > 0 && (
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-2xl leading-none text-accent">{g.urgent}</span>
                    <span className="block text-[10px] font-mono text-muted">por atender</span>
                  </span>
                )}
              </div>
              <BandBar bands={g.bands} total={g.total} />
              <div className="grid grid-cols-5 gap-1 text-center">
                {BANDS.map((b) => (
                  <span key={b.key} className="space-y-0.5">
                    <span className={`block font-mono text-sm ${g.bands[b.key] ? b.text : "text-muted/50"}`}>{g.bands[b.key] || 0}</span>
                    <span className="block text-[9px] font-mono text-muted leading-tight">{b.label}</span>
                  </span>
                ))}
              </div>
              {g.premium > 0 && <p className="text-[11px] font-mono text-muted">Primas registradas: {fmtMoney(g.premium)}</p>}
            </button>
          ))}
        </section>

        {/* Detalle de la aseguradora o agenda de vencimientos */}
        <aside className="doc-card p-0 overflow-hidden self-start xl:sticky xl:top-4">
          <div className="px-5 py-4 border-b border-border bg-primary text-primary-foreground">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-70">{openGroup ? "Aseguradora" : "Próximos 30 días y vencidos recientes"}</p>
            <p className="font-display text-xl font-semibold">{openGroup ? openGroup.insurer : "Agenda de vencimientos"}</p>
            {openGroup && (
              <div className="flex flex-wrap gap-1 mt-3">
                {[["", "Todos"], ...BANDS.map((b) => [b.key, b.label])].map(([k, v]) => (
                  <button
                    key={k || "all"}
                    onClick={() => setBand(k)}
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${band === k ? "bg-primary-foreground text-primary border-primary-foreground" : "border-primary-foreground/30"}`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ul className="max-h-[65vh] overflow-y-auto thin-scroll divide-y divide-border">
            {(openGroup ? openItems : upcoming).map((r) => {
              const b = BANDS.find((x) => x.key === bandOf(r.days_left));
              return (
                <li key={`${r.kind}-${r.id}`} className="px-5 py-3 hover:bg-surface-2/60">
                  <div className="flex items-start justify-between gap-3">
                    <button onClick={() => r.contact_id && onOpenContact?.(r.contact_id)} className="text-left min-w-0">
                      <span className="block font-semibold text-sm truncate hover:text-accent">{r.contact_name || "Sin cliente"}</span>
                      <span className="block text-[11px] font-mono text-muted truncate">
                        {KIND_LABEL[r.kind]} · {LINE_LABEL[r.line] || r.line}
                        {r.item ? ` · ${r.item}` : ""}
                        {!openGroup ? ` · ${r.insurer}` : ""}
                      </span>
                    </button>
                    <span className="shrink-0 text-right">
                      <span className={`block text-xs font-mono ${b?.text}`}>{dueText(r.days_left)}</span>
                      <span className="block text-[10px] font-mono text-muted">{fmtDate(r.end_date)}</span>
                    </span>
                  </div>
                  {(r.phone || r.follow_up) && (
                    <div className="flex items-center gap-3 mt-1.5">
                      {r.phone && (
                        <a href={waLink(r.phone)} target="_blank" rel="noreferrer" className="text-[11px] font-mono text-accent hover:underline">
                          💬 +{r.phone}
                        </a>
                      )}
                      {r.follow_up && <span className="text-[10px] font-mono border border-border rounded px-1.5">{r.follow_up}</span>}
                    </div>
                  )}
                </li>
              );
            })}
            {(openGroup ? openItems : upcoming).length === 0 && <li className="px-5 py-8 text-sm text-muted font-mono text-center">Nada en este tramo.</li>}
          </ul>
          {openGroup && (
            <button
              onClick={() => onOpenClients?.({ insurer: openGroup.insurer })}
              className="w-full text-xs font-mono py-3 border-t border-border hover:bg-surface-2 hover:text-accent"
            >
              Ver clientes de {openGroup.insurer} →
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}
