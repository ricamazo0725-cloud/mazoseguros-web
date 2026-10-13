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
  listRtm,
  rtmForContact,
  saveRtm,
  deleteRtm,
  sendReminderNow,
  listNotifications,
  listVehicleDocs,
  bucketCounts,
  setFollowUp,
  exportVehicleCsv,
  BUCKETS,
  FOLLOW_UP,
} from "@/lib/soat";
import { listAdvisorNames, waLink } from "@/lib/crm";
import { fmtDate, fmtMoney, daysLabel } from "@/lib/policies";
import { mediaUrl, fmtDateTime } from "@/lib/crm";

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

// Envía ya el recordatorio de vencimiento al cliente (WhatsApp + correo)
function SendNow({ kind, id }) {
  const [state, setState] = useState(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={state === "sending"}
        className="text-xs font-mono text-muted hover:text-accent"
        onClick={async () => {
          if (!confirm("¿Enviar ya el recordatorio de vencimiento al cliente por WhatsApp y correo?")) return;
          setState("sending");
          try {
            const r = await sendReminderNow(kind, id);
            setState(r?.log?.map((l) => `${l.channel === "email" ? "✉️" : "💬"} ${l.status}${l.detail ? ` (${l.detail})` : ""}`).join(" · ") || "listo");
          } catch (e) {
            setState("⚠️ " + e.message);
          }
        }}
      >
        {state === "sending" ? "Enviando…" : "📨 Enviar recordatorio"}
      </button>
      {state && state !== "sending" && <span className="text-[11px] font-mono text-muted">{state}</span>}
    </span>
  );
}

// Gestión comercial del vencimiento + acceso directo a WhatsApp
function FollowUp({ kind, doc, phone, onChanged }) {
  const [val, setVal] = useState(doc.follow_up || "");
  const [note, setNote] = useState(doc.follow_up_note || "");
  const [edit, setEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const save = async (v, n) => {
    setSaving(true);
    try {
      await setFollowUp(kind, doc.id, v, n);
      onChanged?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  };
  // Mismo texto de la plantilla de Meta "recordatorio_vencimiento" (para enviarlo desde tu WhatsApp)
  const due = doc.end_date || doc.expiry_date;
  const [yy, mm, dd] = String(due || "").split("-");
  const text =
    `Cordial saludo Sr/Sra ${doc.owner_name || doc.contact_name || "cliente"}, le recordamos que el ${kind === "soat" ? "SOAT" : "revisión técnico-mecánica"} ` +
    `del vehículo de placa ${doc.plate} ${doc.days_left < 0 ? "venció" : "vence"} el ${dd}/${mm}/${yy}. Estamos atentos a su renovación.\n\n` +
    `Cordialmente, Jesús Mazo – Mazoseguros\nCel. 3103897969`;
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-dashed border-border">
      <select
        value={val}
        disabled={saving}
        onChange={(e) => {
          setVal(e.target.value);
          save(e.target.value, note);
        }}
        className={`text-[11px] font-mono rounded-full border px-2 py-1 bg-background ${
          val === "renovado" ? "border-primary text-primary" : val === "perdido" ? "border-border text-muted line-through" : val ? "border-accent text-accent" : "border-border"
        }`}
      >
        {Object.entries(FOLLOW_UP).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      {phone && (
        <a
          href={`${waLink(phone)}?text=${encodeURIComponent(text)}`}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] font-mono px-2 py-1 rounded-full border border-border hover:border-accent hover:text-accent"
        >
          💬 WhatsApp
        </a>
      )}
      <button onClick={() => setEdit((v) => !v)} className="text-[11px] font-mono text-muted hover:text-accent">
        📝 {doc.follow_up_note ? "Nota" : "Agregar nota"}
      </button>
      {doc.follow_up_note && !edit && <span className="basis-full text-xs text-muted italic">“{doc.follow_up_note}”</span>}
      {edit && (
        <span className="basis-full flex gap-2">
          <input className={input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: llamar el viernes, ya renovó con otro…" />
          <button
            onClick={async () => {
              await save(val, note);
              setEdit(false);
            }}
            className="btn-cta text-xs px-3"
          >
            Guardar
          </button>
        </span>
      )}
    </div>
  );
}

function SoatCard({ s, onEdit, onDelete, onOpenContact, showClient = true, onChanged }) {
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
        <SendNow kind="soat" id={s.id} />
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
      {onChanged && <FollowUp kind="soat" doc={s} phone={s.owner_phone || s.contact_phone} onChanged={onChanged} />}
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

// ───────────── Tecnomecánica ─────────────
function RtmCard({ r, onEdit, onDelete, onOpenContact, showClient = true, onChanged }) {
  return (
    <div className="doc-card p-4 space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-lg tracking-wider">{r.plate}</span>
          <span className="text-[10px] font-mono text-muted">🔧 RTM</span>
          <Badge status={r.computed_status} />
        </div>
        <span className={`text-xs font-mono ${r.days_left !== null && r.days_left <= 30 ? "text-accent" : "text-muted"}`}>
          {fmtDate(r.expiry_date)} · {daysLabel(r.days_left)}
        </span>
      </div>
      <div className="text-sm text-muted">
        {r.center_name || "CDA —"}
        {r.certificate_number && <> · Cert. {r.certificate_number}</>}
      </div>
      {showClient && (
        <div className="text-sm">
          👤 {r.contact_name || "sin cliente"}
          {r.contact_phone && <span className="font-mono text-xs text-muted"> · +{r.contact_phone}</span>}
          {r.contact_id && onOpenContact && (
            <button onClick={() => onOpenContact(r.contact_id)} className="ml-2 text-xs font-mono text-accent hover:underline">
              ver cliente →
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3 pt-1">
        <SendNow kind="rtm" id={r.id} />
        {onEdit && <button onClick={() => onEdit(r)} className="text-xs font-mono text-muted hover:text-accent">Editar</button>}
        {onDelete && (
          <button
            onClick={() => confirm(`¿Borrar la tecnomecánica de ${r.plate}?`) && onDelete(r)}
            className="text-xs font-mono text-muted hover:text-danger"
          >
            Borrar
          </button>
        )}
      </div>
      {onChanged && <FollowUp kind="rtm" doc={r} phone={r.contact_phone} onChanged={onChanged} />}
    </div>
  );
}

function RtmForm({ initial, onSaved, onCancel }) {
  const [f, setF] = useState({
    id: initial?.id,
    contact_id: initial?.contact_id,
    plate: initial?.plate || "",
    expiry_date: initial?.expiry_date || "",
    issue_date: initial?.issue_date || "",
    certificate_number: initial?.certificate_number || "",
    center_name: initial?.center_name || "",
    notes: initial?.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <form
      className="doc-card p-5 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setErr("");
        try {
          await saveRtm(f);
          onSaved?.();
        } catch (e2) {
          setErr(e2.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h3 className="font-display font-semibold">{f.id ? `Editar tecnomecánica ${initial.plate}` : "Nueva tecnomecánica"}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1"><label className={label}>Placa *</label><input className={input} value={f.plate} onChange={set("plate")} placeholder="ABC123" /></div>
        <div className="space-y-1"><label className={label}>Vence *</label><input type="date" className={input} value={f.expiry_date} onChange={set("expiry_date")} /></div>
        <div className="space-y-1"><label className={label}>Expedición</label><input type="date" className={input} value={f.issue_date} onChange={set("issue_date")} /></div>
        <div className="space-y-1"><label className={label}>Certificado</label><input className={input} value={f.certificate_number} onChange={set("certificate_number")} /></div>
        <div className="space-y-1 sm:col-span-2"><label className={label}>CDA</label><input className={input} value={f.center_name} onChange={set("center_name")} /></div>
      </div>
      <div className="space-y-1"><label className={label}>Notas</label><textarea className={input} rows={2} value={f.notes} onChange={set("notes")} /></div>
      <p className="text-xs text-muted">El cliente se toma del SOAT de la misma placa si no viene de su ficha.</p>
      {err && <p className="text-xs text-danger font-mono">{err}</p>}
      <div className="flex gap-3">
        <button className="btn-cta text-sm py-2 px-5" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
        <button type="button" onClick={onCancel} className="text-sm font-mono text-muted hover:text-accent">Cancelar</button>
      </div>
    </form>
  );
}

// Registro de recordatorios enviados a clientes
function NotificationsLog() {
  const [rows, setRows] = useState(null);
  return (
    <details className="doc-card p-4" onToggle={(e) => e.currentTarget.open && !rows && listNotifications().then(setRows).catch(() => setRows([]))}>
      <summary className="cursor-pointer font-display font-semibold">📨 Mensajes automáticos enviados a clientes</summary>
      <p className="text-xs text-muted mt-2">
        Cada día a las 9 a. m. se avisa al cliente 30, 15 y 3 días antes del vencimiento del SOAT y de la tecnomecánica,
        por WhatsApp y correo.
      </p>
      <ul className="mt-3 space-y-1 text-xs font-mono max-h-72 overflow-y-auto">
        {rows === null && <li className="text-muted">Cargando…</li>}
        {rows?.length === 0 && <li className="text-muted">Todavía no se ha enviado ninguno.</li>}
        {rows?.map((n) => (
          <li key={n.id} className={n.status === "error" ? "text-danger" : n.status === "omitido" ? "text-muted" : ""}>
            {fmtDateTime(n.created_at)} · {n.kind === "cumpleanos" ? "🎂 Cumpleaños" : `${n.plate} ${n.kind === "soat" ? "SOAT" : "RTM"}`} · {n.channel === "email" ? "✉️" : "💬"}{" "}
            {n.destination || ""} · {n.status}
            {n.detail ? ` (${n.detail})` : ""}
          </li>
        ))}
      </ul>
    </details>
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
  const [filter, setFilter] = useState("d30");
  const [followUp, setFollowUpFilter] = useState("all");
  const [advisor, setAdvisor] = useState("");
  const [advisorNames, setAdvisorNames] = useState([]);
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    listAdvisorNames().then(setAdvisorNames).catch(() => {});
  }, []);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // null | {} (nuevo) | soat
  const [error, setError] = useState("");
  const [view, setView] = useState("soat"); // soat | rtm

  const refresh = useCallback(() => {
    listVehicleDocs(view, { search, bucket: filter, followUp, advisor })
      .then((r) => {
        setRows(r);
        setError("");
      })
      .catch((e) => setError(e.message));
    bucketCounts(view, { followUp, advisor }).then(setCounts).catch(() => {});
  }, [search, filter, view, followUp, advisor]);

  useEffect(() => {
    const t = setTimeout(refresh, 250);
    return () => clearTimeout(t);
  }, [refresh]);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {[
          ["soat", "🚗 SOAT"],
          ["rtm", "🔧 Tecnomecánica"],
        ].map(([k, v]) => (
          <button
            key={k}
            onClick={() => {
              setView(k);
              setEditing(null);
              setRows([]);
            }}
            className={`text-sm font-mono px-4 py-2 rounded border ${view === k ? "border-accent text-accent" : "border-border text-muted"}`}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-start gap-3 justify-between">
        {view === "soat" ? <UploadSoat onSaved={refresh} /> : <span />}
        <button onClick={() => setEditing({})} className={btn}>{view === "soat" ? "+ SOAT a mano" : "+ Tecnomecánica"}</button>
      </div>

      {editing && view === "rtm" && (
        <RtmForm
          key={editing.id || "new-rtm"}
          initial={editing.id ? editing : null}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}

      {editing && view === "soat" && (
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

      {/* Tramos de vencimiento */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {Object.entries(BUCKETS).map(([k, b]) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`text-left rounded-lg border p-3 transition ${
              filter === k
                ? k === "vencido"
                  ? "border-danger bg-danger/10"
                  : "border-accent bg-accent/10"
                : "border-border bg-surface hover:border-accent/50"
            }`}
          >
            <span className={`block font-display text-2xl leading-none ${k === "vencido" ? "text-danger" : k === "d7" ? "text-accent" : ""}`}>
              {counts?.[k] ?? "—"}
            </span>
            <span className="block text-[11px] font-mono mt-1">{b.label}</span>
            {b.hint && <span className="block text-[10px] text-muted">{b.hint}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${input} max-w-xs`}
          placeholder="Placa, nombre, documento o celular"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={`${input} max-w-[220px]`} value={followUp} onChange={(e) => setFollowUpFilter(e.target.value)}>
          <option value="all">Gestión: todas</option>
          <option value="open">Pendientes (sin cerrar)</option>
          <option value="none">Sin gestionar</option>
          {Object.entries(FOLLOW_UP)
            .filter(([k]) => k)
            .map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
        </select>
        <select className={`${input} max-w-[200px]`} value={advisor} onChange={(e) => setAdvisor(e.target.value)}>
          <option value="">👤 Todos los asesores</option>
          <option value="__none">Sin asesor</option>
          {advisorNames.map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
        <button onClick={() => exportVehicleCsv(view, rows)} disabled={!rows.length} className={`${btn} ml-auto`}>
          ⬇️ Exportar {rows.length} a Excel
        </button>
      </div>

      {error && <p className="text-xs text-danger font-mono">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {rows.length === 0 && !error && <p className="text-sm text-muted font-mono">No hay registros en esta vista.</p>}
        {view === "rtm" && rows.map((r) => (
          <RtmCard
            key={r.id}
            r={r}
            onOpenContact={onOpenContact}
            onEdit={(x) => setEditing(x)}
            onDelete={(x) => deleteRtm(x.id).then(refresh).catch((e) => setError(e.message))}
            onChanged={refresh}
          />
        ))}
        {view === "soat" && rows.map((s) => (
          <SoatCard
            key={s.id}
            s={s}
            onOpenContact={onOpenContact}
            onEdit={(x) => setEditing(x)}
            onDelete={(x) => deleteSoat(x.id).then(refresh).catch((e) => setError(e.message))}
            onChanged={refresh}
          />
        ))}
      </div>

      <NotificationsLog />
      <Advisors />
    </div>
  );
}

// SOAT en la ficha del cliente (CRM)
export function ContactSoat({ contactId }) {
  const [rows, setRows] = useState([]);
  const [rtm, setRtm] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editingRtm, setEditingRtm] = useState(null);
  const load = useCallback(() => {
    soatForContact(contactId).then(setRows).catch(() => {});
    rtmForContact(contactId).then(setRtm).catch(() => {});
  }, [contactId]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold">🚗 SOAT y tecnomecánica</h3>
        <div className="flex gap-3">
          <button onClick={() => setEditing({ contact_id: contactId })} className="text-xs font-mono text-accent hover:underline">
            + SOAT
          </button>
          <button onClick={() => setEditingRtm({ contact_id: contactId })} className="text-xs font-mono text-accent hover:underline">
            + Tecnomecánica
          </button>
        </div>
      </div>
      {editingRtm && (
        <RtmForm
          initial={editingRtm.id ? editingRtm : { contact_id: contactId }}
          onCancel={() => setEditingRtm(null)}
          onSaved={() => {
            setEditingRtm(null);
            load();
          }}
        />
      )}
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
      {rows.length === 0 && rtm.length === 0 && !editing && !editingRtm && (
        <p className="text-xs text-muted font-mono">Sin SOAT ni tecnomecánica registrados.</p>
      )}
      {rtm.map((r) => (
        <RtmCard key={r.id} r={r} showClient={false} onEdit={(x) => setEditingRtm(x)} onDelete={(x) => deleteRtm(x.id).then(load)} />
      ))}
      {rows.map((s) => (
        <SoatCard key={s.id} s={s} showClient={false} onEdit={(x) => setEditing(x)} onDelete={(x) => deleteSoat(x.id).then(load)} />
      ))}
    </div>
  );
}
