"use client";

import { useMemo, useRef, useState } from "react";
import { CONTACT_STATUS, TOPICS, importContacts } from "@/lib/crm";

const input = "w-full bg-background border border-border rounded px-3 py-2 text-sm focus-ring";
const label = "text-xs font-mono uppercase tracking-wider text-muted";


// Encabezados que se aceptan en el CSV/JSON (sin tildes, minúsculas) → campo
const ALIASES = {
  nombre: ["nombre", "cliente", "nombre completo", "nombres", "name", "razon social", "tomador", "asegurado"],
  tipo_documento: ["tipo documento", "tipo de documento", "tipo doc", "tipo_documento", "doc_type", "tipo id", "tipo identificacion"],
  documento: ["documento", "cedula", "cc", "nit", "numero documento", "numero de documento", "identificacion", "doc_number"],
  telefono: ["telefono", "celular", "movil", "whatsapp", "phone", "tel", "numero celular"],
  email: ["email", "correo", "correo electronico", "e-mail", "mail"],
  ciudad: ["ciudad", "municipio", "city"],
  interes: ["interes", "seguro", "interest"],
  estado: ["estado", "status", "etapa", "estado poliza"],
  estado_cliente: ["estado cliente", "estado del cliente"],
  notas: ["notas", "nota", "observaciones", "comentarios", "notes"],
  notas_cliente: ["notas cliente", "notas del cliente"],
  carpeta_cliente: ["carpeta", "carpeta cliente", "carpeta_cliente", "onedrive", "ruta onedrive", "onedrive_folder"],
  // Póliza (opcional): si la fila trae aseguradora, se crea/actualiza la póliza del cliente
  aseguradora: ["aseguradora", "compania", "compania aseguradora", "insurer"],
  numero_poliza: ["numero poliza", "numero de poliza", "no poliza", "poliza", "policy number"],
  ramo: ["ramo", "linea", "tipo de poliza", "tipo poliza", "line"],
  producto: ["producto", "plan", "product"],
  bien_asegurado: ["bien asegurado", "vehiculo", "riesgo", "insured item"],
  fecha_expedicion: ["fecha expedicion", "expedicion", "issue date"],
  inicio_vigencia: ["inicio vigencia", "inicio de vigencia", "vigencia desde", "desde", "start date"],
  fin_vigencia: ["fin vigencia", "fin de vigencia", "vencimiento", "vigencia hasta", "hasta", "end date"],
  prima: ["prima", "valor prima", "premium"],
  ruta_archivo: ["ruta archivo", "ruta", "file path"],
  enlace_archivo: ["enlace archivo", "enlace", "link", "file url"],
};

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const HEADER_MAP = Object.fromEntries(
  Object.entries(ALIASES).flatMap(([field, names]) => names.map((n) => [norm(n), field]))
);

// CSV con comillas, separado por coma, punto y coma o tabulador (se detecta solo)
function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let q = false;
  for (const ch of firstLine) {
    if (ch === '"') q = !q;
    else if (!q && ch in counts) counts[ch]++;
  }
  const sep = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

  const rows = [];
  let row = [];
  let cell = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function mapObject(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const f = HEADER_MAP[norm(k)];
    if (f && v != null && String(v).trim() !== "" && out[f] == null) out[f] = String(v).trim();
  }
  return out;
}

// Devuelve { rows, unknown: [encabezados ignorados], format }
export function parseClients(text) {
  const t = text.trim();
  if (!t) return { rows: [], unknown: [], format: "" };
  if (t.startsWith("[") || t.startsWith("{")) {
    let data = JSON.parse(t);
    if (!Array.isArray(data)) data = data.clientes || data.contacts || data.data || [data];
    if (!Array.isArray(data)) throw new Error("El JSON debe ser una lista de clientes.");
    const keys = new Set(data.flatMap((o) => Object.keys(o || {})));
    return {
      rows: data.map(mapObject),
      unknown: [...keys].filter((k) => !HEADER_MAP[norm(k)]),
      format: "JSON",
    };
  }
  const [header, ...body] = parseCsv(t);
  if (!header) return { rows: [], unknown: [], format: "CSV" };
  const fields = header.map((h) => HEADER_MAP[norm(h)] || null);
  if (!fields.includes("nombre")) {
    throw new Error("No encontré la columna del nombre. La primera fila debe tener los encabezados (nombre, documento, telefono…).");
  }
  const rows = body.map((cells) => {
    const o = {};
    fields.forEach((f, i) => {
      const v = (cells[i] ?? "").trim();
      if (f && v && o[f] == null) o[f] = v;
    });
    return o;
  });
  return { rows, unknown: header.filter((h, i) => !fields[i] && h.trim()), format: "CSV" };
}

function localCheck(r) {
  if (!r.nombre) return "falta el nombre";
  if (!r.documento && !r.telefono) return "falta documento o teléfono";
  return "";
}

function downloadTemplate() {
  const csv =
    "﻿nombre;tipo_documento;documento;telefono;email;ciudad;interes;estado;notas;carpeta_cliente\n" +
    "Ana Pérez Gómez;CC;1020304050;3001234567;ana@correo.com;Medellín;auto;cliente;Renueva en marzo;Clientes/Ana Perez\n" +
    "Constructora Ejemplo SAS;NIT;900123456;3109876543;;Bogotá;obras-civiles;cotizando;;\n";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "plantilla-clientes.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ───────────── Nuevo cliente (formulario) ─────────────
export function NewContactForm({ onCreated, onOpen, onCancel }) {
  const empty = { nombre: "", tipo_documento: "CC", documento: "", telefono: "", email: "", ciudad: "", interes: "", estado: "nuevo", notas: "", carpeta_cliente: "" };
  const [f, setF] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { type, text, contactId }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    const err = localCheck(f);
    if (err) return setMsg({ type: "error", text: err[0].toUpperCase() + err.slice(1) + "." });
    setBusy(true);
    try {
      const row = Object.fromEntries(Object.entries(f).filter(([, v]) => String(v).trim() !== ""));
      if (!row.documento) delete row.tipo_documento;
      const [r] = await importContacts([row], "manual");
      if (r.resultado === "creado") {
        onCreated?.(r.contact_id);
      } else if (r.resultado === "existe") {
        setMsg({ type: "warn", text: r.detalle, contactId: r.contact_id });
      } else {
        setMsg({ type: "error", text: r.detalle });
      }
    } catch (e2) {
      setMsg({ type: "error", text: e2.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="doc-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-lg">Nuevo cliente</h3>
        <button type="button" onClick={onCancel} className="text-xs font-mono text-muted hover:text-accent">Cerrar ✕</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <label className={label}>Nombre *</label>
          <input className={input} value={f.nombre} onChange={set("nombre")} autoFocus />
        </div>
        <div className="space-y-1">
          <label className={label}>Documento</label>
          <div className="flex gap-2">
            <select className={`${input} w-24`} value={f.tipo_documento} onChange={set("tipo_documento")}>
              {["CC", "NIT", "CE", "PAS"].map((t) => <option key={t}>{t}</option>)}
            </select>
            <input className={input} value={f.documento} onChange={set("documento")} inputMode="numeric" />
          </div>
        </div>
        <div className="space-y-1">
          <label className={label}>Teléfono / WhatsApp</label>
          <input className={input} value={f.telefono} onChange={set("telefono")} placeholder="300 123 4567" inputMode="tel" />
        </div>
        <div className="space-y-1">
          <label className={label}>Correo</label>
          <input className={input} type="email" value={f.email} onChange={set("email")} />
        </div>
        <div className="space-y-1">
          <label className={label}>Ciudad</label>
          <input className={input} value={f.ciudad} onChange={set("ciudad")} />
        </div>
        <div className="space-y-1">
          <label className={label}>Interés</label>
          <select className={input} value={f.interes} onChange={set("interes")}>
            <option value="">—</option>
            {Object.entries(TOPICS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label className={label}>Estado</label>
          <select className={input} value={f.estado} onChange={set("estado")}>
            {Object.entries(CONTACT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className={label}>Carpeta en OneDrive</label>
          <input className={input} value={f.carpeta_cliente} onChange={set("carpeta_cliente")} placeholder="Clientes/Nombre del cliente" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className={label}>Notas</label>
          <textarea className={input} rows={3} value={f.notas} onChange={set("notas")} />
        </div>
      </div>
      <p className="text-xs text-muted">Necesitas el nombre y al menos el documento o el teléfono. Si el número tiene 10 dígitos se le agrega el 57.</p>
      {msg && (
        <div className={`text-sm font-mono ${msg.type === "error" ? "text-danger" : "text-accent"}`}>
          {msg.text}
          {msg.contactId && (
            <button type="button" onClick={() => onOpen?.(msg.contactId)} className="ml-2 underline">Abrir ficha</button>
          )}
        </div>
      )}
      <div className="flex gap-3">
        <button className="btn-cta text-sm py-2 px-5" disabled={busy}>{busy ? "Guardando…" : "Crear cliente"}</button>
        <button type="button" onClick={onCancel} className="text-sm font-mono text-muted hover:text-accent">Cancelar</button>
      </div>
    </form>
  );
}

// ───────────── Importar clientes (archivo CSV o CSV/JSON pegado) ─────────────
export function ContactImport({ onDone, onOpen, onCancel }) {
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [results, setResults] = useState(null);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const parsed = useMemo(() => {
    try {
      return { ...parseClients(text), error: "" };
    } catch (e) {
      return { rows: [], unknown: [], format: "", error: e instanceof SyntaxError ? "El JSON no es válido: " + e.message : e.message };
    }
  }, [text]);

  const checks = parsed.rows.map(localCheck);
  const valid = checks.filter((c) => !c).length;

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResults(null);
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    let t = new TextDecoder("utf-8").decode(buf);
    // Excel en Windows guarda CSV en Latin-1: si salen caracteres raros, se re-lee así
    if (t.includes("�")) t = new TextDecoder("windows-1252").decode(buf);
    setText(t);
    e.target.value = "";
  }

  async function run() {
    setBusy(true);
    setError("");
    setResults(null);
    try {
      const rows = parsed.rows.map((r) => ({ ...r }));
      const res = await importContacts(rows, "import", (done, total) => setProgress({ done, total }));
      setResults(res);
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  const summary = results && results.reduce((acc, r) => ({ ...acc, [r.resultado]: (acc[r.resultado] || 0) + 1 }), {});
  const problems = results?.filter((r) => r.resultado === "error" || r.detalle?.includes("⚠")) || [];

  return (
    <div className="doc-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-lg">Importar clientes</h3>
        <button type="button" onClick={onCancel} className="text-xs font-mono text-muted hover:text-accent">Cerrar ✕</button>
      </div>

      <p className="text-sm text-muted">
        Sube un archivo <b>CSV</b> (de Excel: “Guardar como → CSV”) o pega abajo el contenido en CSV o JSON. La primera fila
        debe tener los encabezados. Columnas: <span className="font-mono text-xs">nombre, tipo_documento, documento, telefono,
        email, ciudad, interes, estado, notas, carpeta_cliente</span>. Si la fila trae <b>aseguradora</b> también se guarda la
        póliza (numero_poliza, ramo, producto, bien_asegurado, inicio_vigencia, fin_vigencia, prima, estado de la póliza).
        Si el cliente ya existe (mismo documento o teléfono) solo se completan los datos que le falten.
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => fileRef.current?.click()} className="text-xs font-mono px-3 py-2 rounded border border-border hover:border-accent">
          📂 Subir CSV / JSON
        </button>
        <input ref={fileRef} type="file" accept=".csv,.txt,.json,text/csv,application/json" className="hidden" onChange={onFile} />
        <button type="button" onClick={downloadTemplate} className="text-xs font-mono px-3 py-2 rounded border border-border hover:border-accent">
          ⬇️ Descargar plantilla
        </button>
        {fileName && <span className="text-xs font-mono text-muted self-center">{fileName}</span>}
      </div>

      <textarea
        className={`${input} font-mono text-xs`}
        rows={8}
        value={text}
        onChange={(e) => { setText(e.target.value); setFileName(""); setResults(null); }}
        placeholder={'nombre;documento;telefono;email\nAna Pérez;1020304050;3001234567;ana@correo.com\n\n— o —\n\n[{"nombre":"Ana Pérez","documento":"1020304050","telefono":"3001234567"}]'}
      />

      {parsed.error && <p className="text-xs text-danger font-mono">{parsed.error}</p>}

      {parsed.rows.length > 0 && !results && (
        <div className="space-y-2">
          <p className="text-xs font-mono text-muted">
            {parsed.format} · {parsed.rows.length} filas · {valid} listas
            {valid < parsed.rows.length && <span className="text-danger"> · {parsed.rows.length - valid} con problemas</span>}
            {parsed.unknown.length > 0 && <> · columnas ignoradas: {parsed.unknown.join(", ")}</>}
          </p>
          <div className="overflow-x-auto max-h-72 border border-border rounded">
            <table className="w-full text-xs">
              <thead className="bg-background sticky top-0">
                <tr className="text-left font-mono text-muted">
                  <th className="p-2">#</th>
                  <th className="p-2">Nombre</th>
                  <th className="p-2">Documento</th>
                  <th className="p-2">Teléfono</th>
                  <th className="p-2">Correo</th>
                  <th className="p-2">Ciudad</th>
                  <th className="p-2">Póliza</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="p-2 font-mono text-muted">{i + 1}</td>
                    <td className="p-2">{r.nombre}</td>
                    <td className="p-2 font-mono">{[r.tipo_documento, r.documento].filter(Boolean).join(" ")}</td>
                    <td className="p-2 font-mono">{r.telefono}</td>
                    <td className="p-2">{r.email}</td>
                    <td className="p-2">{r.ciudad}</td>
                    <td className="p-2">
                      {r.aseguradora ? [r.aseguradora, r.numero_poliza, r.fin_vigencia && `vence ${r.fin_vigencia}`].filter(Boolean).join(" · ") : ""}
                    </td>
                    <td className="p-2 text-danger">{checks[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsed.rows.length > 100 && <p className="text-xs text-muted font-mono">Mostrando las primeras 100.</p>}
          <button onClick={run} disabled={busy || valid === 0} className="btn-cta text-sm py-2 px-5">
            {busy
              ? progress ? `Importando ${progress.done}/${progress.total}…` : "Importando…"
              : `Importar ${parsed.rows.length} clientes`}
          </button>
          <p className="text-xs text-muted">Las filas con problemas se reportan al final; las demás se guardan igual.</p>
        </div>
      )}

      {error && <p className="text-xs text-danger font-mono">{error}</p>}

      {results && (
        <div className="space-y-2">
          <p className="text-sm font-mono">
            ✅ {summary.creado || 0} creados · 🔄 {summary.actualizado || 0} actualizados
            {summary.error ? <span className="text-danger"> · ❌ {summary.error} con error</span> : null}
          </p>
          {problems.length > 0 && (
            <ul className="text-xs font-mono space-y-1 max-h-60 overflow-y-auto">
              {problems.map((r) => (
                <li key={r.fila} className={r.resultado === "error" ? "text-danger" : "text-muted"}>
                  Fila {r.fila}: {r.detalle}
                  {r.contact_id && (
                    <button type="button" onClick={() => onOpen?.(r.contact_id)} className="ml-2 underline">abrir</button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => { setText(""); setResults(null); setFileName(""); }} className="text-xs font-mono text-muted hover:text-accent">
            Importar otro archivo
          </button>
        </div>
      )}
    </div>
  );
}

