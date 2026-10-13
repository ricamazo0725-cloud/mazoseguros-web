"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SOAT_STATUS,
  listSoat,
  soatForContact,
  saveSoat,
  deleteSoat,
  uploadAndReadSoat,
  listAdvisors,
  saveAdvisor,
  setAdvisorActive,
} from "@/lib/soat";
import { fmtDate, fmtMoney, daysLabel } from "@/lib/policies";
import { mediaUrl } from "@/lib/crm";

const input = "w-full bg-background border border-border rounded px-3 py-2 text-sm focus-ring";
const label = "text-xs font-mono uppercase tracking-wider text-muted";
const btn = "text-xs font-mono px-3 py-2 rounded border border-border hover:border-accent";

const STATUS_STYLE = {
  vigente: "border-border text-muted",
  por_vencer: "border-accent text-accent",
  vencido: "border-danger text-danger",
  renovado: "border-border text-muted",
  sin_fecha: "border-danger text-danger",
};

function Badge({ status }) {
  return (
    <span className={`text-[10px] font-mono uppercase tracking-wider border rounded px-1.5 py-0.5 ${STATUS_STYLE[status] || ""}`}>
      {SOAT_STATUS[status] || status}
    </span>
  );
}

function ImageLink({ path }) {
  if (!path) return null;
  return (
    <button
      type="button"
      className="text-xs font-mono text-muted hover:text-accent underline"
      onClick={async () => {
        try {
          window.open(await mediaUrl(path), "_blank", "noopener");
        } catch (e) {
          alert(e.message);
        }
      }}
    >
      📷 ver SOAT
    </button>
  );
}

function SoatCard({ s, onEdit, onDelete, onOpenContact, showClient = true }) {
  return (
    <div className="doc-card p-4 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-lg tracking-wider">{s.plate}</span>
          <Badge status={s.computed_status} />
        </div>
        <span className={`text-xs font-mono ${s.days_left !== null && s.days_left <= 30 ? "text-accent" : "text-muted"}`}>
          {fmtDate(s.end_date)} · {daysLabel(s.days_left)}
        </span>
      </div>
      <div className="text-sm text-muted">
        {[s.vehicle_class, s.brand, s.model_line, s.model_year].filter(Boolean).join(" ") || "—"}
        {s.insurer && <> · {s.insurer}</>}
        {s.policy_number && <> · Póliza {s.policy_number}</>}
        {s.premium != null && <> · {fmtMoney(s.premium)}</>}
      </div>
      {showClient && (
        <div className="text-sm">
          👤 {s.owner_name || "—"}
          {s.owner_doc && <span className="font-mono text-xs text-muted"> · {[s.owner_doc_type, s.owner_doc].filter(Boolean).join(" ")}</span>}
          {s.owner_phone && <span className="font-mono text-xs text-muted"> · +{s.owner_phone}</span>}
          {s.contact_id && onOpenContact && (
            <button onClick={() => onOpenContact(s.contact_id)} className="ml-2 text-xs font-mono text-accent hover:underline">
              ver cliente →
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3 pt-1">
        <ImageLink path={s.image_path} />
        {onEdit && <button onClick={() => onEdit(s)} className="text-xs font-mono text-muted hover:text-accent">Editar</button>}
        {onDelete && (
          <button
            onClick={() => confirm(`¿Borrar el SOAT de ${s.plate}?`) && onDelete(s)}
            className="text-xs font-mono text-muted hover:text-danger"
          >
            Borrar
          </button>
        )}
      </div>
    </div>
  );
}

// Subir foto/PDF → leer con IA
function UploadSoat({ onSaved }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function onFile(e) {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setMsg(null);
    const out = [];
    for (const f of files) {
      try {
        const r = await uploadAndReadSoat(f);
        out.push({ ok: r.ok, text: `${f.name}: ${r.text}` });
      } catch (err) {
        out.push({ ok: false, text: `${f.name}: ${err.message}` });
      }
    }
    setMsg(out);
    setBusy(false);
    onSaved?.();
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="btn-cta text-sm py-2 px-4">
        {busy ? "Leyendo con IA…" : "📷 Subir foto o PDF de SOAT"}
      </button>
      <input ref={ref} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={onFile} />
      {msg?.map((m, i) => (
        <pre key={i} className={`text-xs whitespace-pre-wrap font-mono doc-card p-3 ${m.ok ? "" : "text-danger"}`}>
          {m.text.replace(/\*/g, "")}
        </pre>
      ))}
    </div>
  );
}

const EMPTY = {
  plate: "", vehicle_class: "", brand: "", model_line: "", model_year: "", service: "", owner_name: "", owner_doc_type: "CC",
  owner_doc: "", owner_phone: "", owner_city: "", insurer: "", policy_number: "", start_date: "", end_date: "", premium: "", notes: "",
};

function SoatForm({ initial, onSaved, onCancel }) {
  const [f, setF] = useState(() => {
    const base = { ...EMPTY };
    for (const k of Object.keys(EMPTY)) if (initial?.[k] != null) base[k] = String(initial[k]);
    return { ...base, id: initial?.id, contact_id: initial?.contact_id, _original: initial };
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await saveSoat(f);
      onSaved?.();
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  const field = (k, l, props = {}) => (
    <div className="space-y-1">
      <label className={label}>{l}</label>
      <input className={input} value={f[k]} onChange={set(k)} {...props} />
    </div>
  );

  return (
    <form onSubmit={submit} className="doc-card p-5 space-y-4">
      <h3 className="font-display font-semibold">{f.id ? `Editar SOAT ${initial.plate}` : "Nuevo SOAT"}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        {field("plate", "Placa *", { placeholder: "ABC123" })}
        {field("start_date", "Inicio vigencia", { type: "date" })}
        {field("end_date", "Vence", { type: "date" })}
        {field("vehicle_class", "Clase")}
        {field("brand", "Marca")}
        {field("model_line", "Línea")}
        {field("model_year", "Modelo", { inputMode: "numeric" })}
        {field("insurer", "Aseguradora")}
        {field("policy_number", "Póliza")}
        {field("owner_name", "Tomador")}
        <div className="space-y-1">
          <label className={label}>Documento</label>
          <div className="flex gap-2">
            <select className={`${input} w-20`} value={f.owner_doc_type} onChange={set("owner_doc_type")}>
              {["CC", "NIT", "CE", "PAS", "TI"].map((t) => <option key={t}>{t}</option>)}
            </select>
            <input className={input} value={f.owner_doc} onChange={set("owner_doc")} />
          </div>
        </div>
        {field("owner_phone", "Celular")}
        {field("owner_city", "Ciudad")}
        {field("premium", "Valor", { inputMode: "numeric" })}
        {field("service", "Servicio")}
      </div>
      <div className="space-y-1">
        <label className={label}>Notas</label>
        <textarea className={input} rows={2} value={f.notes} onChange={set("notes")} />
      </div>
      {err && <p className="text-xs text-danger font-mono">{err}</p>}
      <div className="flex gap-3">
        <button className="btn-cta text-sm py-2 px-5" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
        <button type="button" onClick={onCancel} className="text-sm font-mono text-muted hover:text-accent">Cancelar</button>
      </div>
    </form>
  );
}

function Advisors() {
  const [rows, setRows] = useState([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const load = () => listAdvisors().then(setRows).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);

  return (
    <details className="doc-card p-4">
      <summary className="cursor-pointer font-display font-semibold">🙋 Asesores del modo asesor ({rows.filter((r) => r.active).length})</summary>
      <p className="text-xs text-muted mt-2">
        Estos números, al escribirle a la línea de WhatsApp del bot, entran al modo asesor: mandan fotos de SOAT,
        consultan placas y reciben los recordatorios.
      </p>
      <ul className="mt-3 space-y-1 text-sm">
        {rows.map((r) => (
          <li key={r.phone} className="flex items-center justify-between gap-2">
            <span className={r.active ? "" : "line-through text-muted"}>
              +{r.phone} {r.name && <span className="text-muted">· {r.name}</span>}
            </span>
            <button
              onClick={() => setAdvisorActive(r.phone, !r.active).then(load)}
              className="text-xs font-mono text-muted hover:text-accent"
            >
              {r.active ? "Desactivar" : "Activar"}
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 mt-3">
        <input className={`${input} max-w-[180px]`} placeholder="Celular" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input className={`${input} max-w-[180px]`} placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <button
          className={btn}
          onClick={() =>
            saveAdvisor(phone, name)
              .then(() => {
                setPhone("");
                setName("");
                setErr("");
                load();
              })
              .catch((e) => setErr(e.message))
          }
        >
          + Agregar
        </button>
      </div>
      {err && <p className="text-xs text-danger font-mono mt-2">{err}</p>}
    </details>
  );
}

export default function SoatPanel({ onOpenContact }) {
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState("por_vencer");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // null | {} (nuevo) | soat
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    listSoat({ search, filter })
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3 justify-between">
        <UploadSoat onSaved={refresh} />
        <button onClick={() => setEditing({})} className={btn}>+ SOAT a mano</button>
      </div>

      {editing && (
        <SoatForm
          key={editing.id || "new"}
          initial={editing.id ? editing : null}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {[
          ["por_vencer", "Por vencer (30 d)"],
          ["vencido", "Vencidos"],
          ["vigente", "Vigentes"],
          ["todos", "Todos"],
        ].map(([k, v]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`text-xs font-mono px-3 py-1.5 rounded border ${filter === k ? "border-accent text-accent" : "border-border text-muted"}`}
          >
            {v}
          </button>
        ))}
        <input
          className={`${input} max-w-xs`}
          placeholder="Placa, nombre, documento o celular"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <p className="text-xs text-danger font-mono">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.length === 0 && !error && <p className="text-sm text-muted font-mono">No hay SOAT en esta vista.</p>}
        {rows.map((s) => (
          <SoatCard
            key={s.id}
            s={s}
            onOpenContact={onOpenContact}
            onEdit={(x) => setEditing(x)}
            onDelete={(x) => deleteSoat(x.id).then(refresh).catch((e) => setError(e.message))}
          />
        ))}
      </div>

      <Advisors />
    </div>
  );
}

// SOAT en la ficha del cliente (CRM)
export function ContactSoat({ contactId }) {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => soatForContact(contactId).then(setRows).catch(() => {}), [contactId]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">🚗 SOAT</h3>
        <button onClick={() => setEditing({ contact_id: contactId })} className="text-xs font-mono text-accent hover:underline">
          + Agregar
        </button>
      </div>
      {editing && (
        <SoatForm
          initial={editing.id ? editing : { contact_id: contactId }}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
      {rows.length === 0 && !editing && <p className="text-xs text-muted font-mono">Sin SOAT registrados.</p>}
      {rows.map((s) => (
        <SoatCard key={s.id} s={s} showClient={false} onEdit={(x) => setEditing(x)} onDelete={(x) => deleteSoat(x.id).then(load)} />
      ))}
    </div>
  );
}
