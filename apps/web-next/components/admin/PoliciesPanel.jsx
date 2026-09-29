"use client";

import { useCallback, useEffect, useState } from "react";
import {
  LINES,
  POLICY_STATUS,
  INSURERS,
  listPolicies,
  policiesForContact,
  savePolicy,
  deletePolicy,
  fmtDate,
  fmtMoney,
  daysLabel,
} from "@/lib/policies";

const input = "w-full bg-background border border-border rounded px-3 py-2 text-sm focus-ring";
const label = "text-xs font-mono uppercase tracking-wider text-muted";

const STATUS_STYLE = {
  vigente: "border-border text-muted",
  por_vencer: "border-accent text-accent",
  vencida: "border-danger text-danger",
  renovada: "border-border text-muted",
  cancelada: "border-border text-muted line-through",
  cotizacion: "border-border text-muted",
};

function StatusBadge({ status }) {
  return (
    <span className={`text-[10px] font-mono uppercase tracking-wider border rounded px-1.5 py-0.5 ${STATUS_STYLE[status] || ""}`}>
      {POLICY_STATUS[status] || status}
    </span>
  );
}

function FileLink({ policy }) {
  const [copied, setCopied] = useState(false);
  if (!policy.file_url && !policy.file_path) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-xs font-mono">
      {policy.file_url && (
        <a href={policy.file_url} target="_blank" rel="noreferrer" className="underline hover:text-accent">
          📄 Abrir PDF
        </a>
      )}
      {policy.file_path && (
        <button
          type="button"
          title={policy.file_path}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(policy.file_path);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              prompt("Ruta del archivo:", policy.file_path);
            }
          }}
          className="text-muted hover:text-accent"
        >
          {copied ? "Ruta copiada ✓" : "📁 Copiar ruta OneDrive"}
        </button>
      )}
    </span>
  );
}

function PolicySummary({ p, showClient, onOpenContact, actions }) {
  return (
    <div className="doc-card p-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={p.computed_status} />
          <span className="text-xs font-mono text-muted">{daysLabel(p.days_left)}</span>
        </div>
        {showClient && (
          <button onClick={() => onOpenContact?.(p.contact_id)} className="font-display font-semibold hover:text-accent text-left">
            {p.contact_name || "Sin nombre"}
          </button>
        )}
        <div className={showClient ? "text-sm" : "font-display font-semibold"}>
          {LINES[p.line] || p.line} · {p.insurer}
          {p.policy_number && <span className="font-mono text-muted"> · N° {p.policy_number}</span>}
        </div>
        <div className="text-xs text-muted">
          {[p.product, p.insured_item].filter(Boolean).join(" · ")}
          {(p.product || p.insured_item) && " · "}
          Expedición {fmtDate(p.issue_date)} · Vigencia {fmtDate(p.start_date)} → <strong>{fmtDate(p.end_date)}</strong>
          {p.premium ? ` · Prima ${fmtMoney(p.premium)}` : ""}
        </div>
        {p.notes && <div className="text-xs text-muted italic">{p.notes}</div>}
        <FileLink policy={p} />
      </div>
      {actions}
    </div>
  );
}

// ───────────── Pestaña "Pólizas": vencimientos de toda la cartera ─────────────
export default function PoliciesPanel({ onOpenContact }) {
  const [filter, setFilter] = useState("por_vencer");
  const [line, setLine] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    listPolicies({ filter, line, search })
      .then((r) => {
        setRows(r);
        setError("");
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filter, line, search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const FILTERS = [
    ["por_vencer", "Vencen en 30 días"],
    ["vencida", "Vencidas"],
    ["vigente", "Vigentes"],
    ["todas", "Todas"],
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 text-xs font-mono">
        {FILTERS.map(([k, v]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded border ${filter === k ? "border-accent text-accent" : "border-border text-muted"}`}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
        <input
          className={input}
          placeholder="Buscar por cliente, documento, N° de póliza, placa o aseguradora"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={input} value={line} onChange={(e) => setLine(e.target.value)}>
          <option value="">Todos los ramos</option>
          {Object.entries(LINES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-danger font-mono">{error}</p>}
      {!loading && rows.length === 0 && !error && (
        <p className="text-sm text-muted font-mono">No hay pólizas con este filtro.</p>
      )}
      <p className="text-xs text-muted font-mono">{rows.length > 0 && `${rows.length} pólizas`}</p>
      <div className="space-y-3">
        {rows.map((p) => (
          <PolicySummary key={p.id} p={p} showClient onOpenContact={onOpenContact} />
        ))}
      </div>
    </div>
  );
}

// ───────────── Pólizas dentro de la ficha de un cliente ─────────────
const EMPTY = {
  insurer: "",
  policy_number: "",
  line: "auto",
  product: "",
  insured_item: "",
  issue_date: "",
  start_date: "",
  end_date: "",
  premium: "",
  status: "vigente",
  file_path: "",
  file_url: "",
  notes: "",
};

export function ContactPolicies({ contactId }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null); // null = cerrado, {} = nueva, {...} = editar
  const [error, setError] = useState("");

  const load = useCallback(() => {
    policiesForContact(contactId).then(setRows).catch((e) => setError(e.message));
  }, [contactId]);
  useEffect(load, [load]);

  async function remove(p) {
    if (!confirm(`¿Eliminar la póliza ${p.insurer} ${p.policy_number || ""}?`)) return;
    await deletePolicy(p.id);
    load();
  }

  return (
    <div className="doc-card p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">Pólizas ({rows.length})</h3>
        {!editing && (
          <button onClick={() => setEditing({ ...EMPTY })} className="text-xs font-mono text-accent hover:underline">
            + Agregar póliza
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger font-mono">{error}</p>}
      {editing && (
        <PolicyForm
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={async (data) => {
            await savePolicy(contactId, data);
            setEditing(null);
            load();
          }}
        />
      )}
      {rows.length === 0 && !editing && <p className="text-sm text-muted">Este cliente todavía no tiene pólizas registradas.</p>}
      <div className="space-y-3">
        {rows.map((p) => (
          <PolicySummary
            key={p.id}
            p={p}
            actions={
              <div className="flex flex-col items-end gap-2 text-xs font-mono">
                <button onClick={() => setEditing({ ...EMPTY, ...nullsToEmpty(p) })} className="text-muted hover:text-accent">
                  Editar
                </button>
                <button onClick={() => remove(p)} className="text-muted hover:text-danger">
                  Eliminar
                </button>
              </div>
            }
          />
        ))}
      </div>
    </div>
  );
}

function nullsToEmpty(p) {
  const o = {};
  for (const k of Object.keys(EMPTY)) o[k] = p[k] ?? "";
  o.id = p.id;
  return o;
}

function PolicyForm({ initial, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await onSave(f);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-border rounded p-4 space-y-3 bg-surface">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className={label}>Aseguradora *</label>
          <input className={input} list="insurers" value={f.insurer} onChange={set("insurer")} required />
          <datalist id="insurers">
            {INSURERS.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1">
          <label className={label}>N° de póliza</label>
          <input className={input} value={f.policy_number} onChange={set("policy_number")} />
        </div>
        <div className="space-y-1">
          <label className={label}>Ramo</label>
          <select className={input} value={f.line} onChange={set("line")}>
            {Object.entries(LINES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={label}>Producto / plan</label>
          <input className={input} value={f.product} onChange={set("product")} />
        </div>
        <div className="space-y-1">
          <label className={label}>Bien asegurado (placa, dirección…)</label>
          <input className={input} value={f.insured_item} onChange={set("insured_item")} />
        </div>
        <div className="space-y-1">
          <label className={label}>Estado</label>
          <select className={input} value={f.status} onChange={set("status")}>
            {["vigente", "renovada", "cancelada", "vencida", "cotizacion"].map((k) => (
              <option key={k} value={k}>
                {POLICY_STATUS[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={label}>Expedición</label>
          <input type="date" className={input} value={f.issue_date} onChange={set("issue_date")} />
        </div>
        <div className="space-y-1">
          <label className={label}>Inicio vigencia</label>
          <input type="date" className={input} value={f.start_date} onChange={set("start_date")} />
        </div>
        <div className="space-y-1">
          <label className={label}>Vencimiento</label>
          <input type="date" className={input} value={f.end_date} onChange={set("end_date")} />
        </div>
        <div className="space-y-1">
          <label className={label}>Prima (COP)</label>
          <input className={input} inputMode="numeric" value={f.premium} onChange={set("premium")} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className={label}>Ruta del PDF en OneDrive</label>
          <input
            className={input}
            placeholder="Documentos/A-CLIENTES/A-B-C-D-E/Apellido Nombre/poliza.pdf"
            value={f.file_path}
            onChange={set("file_path")}
          />
        </div>
        <div className="space-y-1 sm:col-span-3">
          <label className={label}>Enlace para abrir (opcional: “Compartir → Copiar vínculo” en OneDrive)</label>
          <input className={input} value={f.file_url} onChange={set("file_url")} />
        </div>
        <div className="space-y-1 sm:col-span-3">
          <label className={label}>Notas</label>
          <textarea rows={2} className={input} value={f.notes} onChange={set("notes")} />
        </div>
      </div>
      {error && <p className="text-xs text-danger font-mono">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={busy} className="btn-cta text-xs py-2 px-4">
          {busy ? "Guardando…" : f.id ? "Guardar cambios" : "Agregar póliza"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs font-mono text-muted hover:text-foreground">
          Cancelar
        </button>
      </div>
    </form>
  );
}
