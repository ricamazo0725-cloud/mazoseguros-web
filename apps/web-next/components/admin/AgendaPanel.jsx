"use client";

import { useCallback, useEffect, useState } from "react";
import {
  APPOINTMENT_STATUS,
  MODALITY,
  TOPICS,
  getAgendaConfig,
  saveAgendaConfig,
  getAvailableSlots,
  listAppointments,
  createAppointment,
  updateAppointment,
  fmtTime,
  fmtDay,
  todayYmd,
  addDays,
  dayStartIso,
  waLink,
} from "@/lib/crm";

const input = "w-full bg-background border border-border rounded px-3 py-2 text-sm focus-ring";
const label = "text-xs font-mono uppercase tracking-wider text-muted";
const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// Lunes de la semana de un día "YYYY-MM-DD"
function mondayOf(ymd) {
  const dow = new Date(`${ymd}T12:00:00Z`).getUTCDay() || 7; // 1..7
  return addDays(ymd, 1 - dow);
}

export default function AgendaPanel({ preset, onPresetUsed }) {
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayYmd()));
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    listAppointments(dayStartIso(weekStart), dayStartIso(addDays(weekStart, 7)))
      .then((rows) => {
        setAppointments(rows);
        setError("");
      })
      .catch((e) => setError(e.message));
  }, [weekStart]);

  useEffect(refresh, [refresh]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDay = (ymd) =>
    appointments.filter(
      (a) => new Date(a.starts_at).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) === ymd
    );

  async function setStatus(appt, status) {
    try {
      await updateAppointment(appt.id, { status });
      refresh();
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="space-y-10">
      <NewAppointment preset={preset} onPresetUsed={onPresetUsed} onCreated={refresh} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display font-semibold text-lg">
            Semana del {fmtDay(weekStart)}
          </h2>
          <div className="flex gap-2 text-xs font-mono">
            <button className="border border-border rounded px-3 py-1.5" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              ← Anterior
            </button>
            <button className="border border-border rounded px-3 py-1.5" onClick={() => setWeekStart(mondayOf(todayYmd()))}>
              Hoy
            </button>
            <button className="border border-border rounded px-3 py-1.5" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              Siguiente →
            </button>
          </div>
        </div>
        {error && <p className="text-xs text-danger font-mono">{error}</p>}

        <div className="space-y-4">
          {days.map((d) => {
            const items = byDay(d);
            return (
              <div key={d} className="doc-card p-4">
                <div className={`text-xs font-mono uppercase tracking-wider mb-2 ${d === todayYmd() ? "text-accent" : "text-muted"}`}>
                  {fmtDay(d)}
                </div>
                {items.length === 0 ? (
                  <p className="text-sm text-muted">Sin citas.</p>
                ) : (
                  <ul className="space-y-2">
                    {items.map((a) => (
                      <li
                        key={a.id}
                        className={`flex flex-wrap items-start justify-between gap-3 border-l-2 pl-3 ${
                          a.status === "cancelada" ? "border-border opacity-60" : "border-accent"
                        }`}
                      >
                        <div>
                          <div className="font-mono text-sm">
                            {fmtTime(a.starts_at)} – {fmtTime(a.ends_at)}
                          </div>
                          <div className="font-display font-semibold">{a.contact_name || "Sin nombre"}</div>
                          <div className="text-xs text-muted">
                            {TOPICS[a.topic] || a.topic || "—"} · {MODALITY[a.modality]} · creada por {a.created_by}
                            {a.contact_phone && (
                              <>
                                {" · "}
                                <a className="underline" href={waLink(a.contact_phone)} target="_blank" rel="noreferrer">
                                  +{a.contact_phone}
                                </a>
                              </>
                            )}
                          </div>
                          {a.notes && <p className="text-sm text-muted mt-1">{a.notes}</p>}
                        </div>
                        <select
                          value={a.status}
                          onChange={(e) => setStatus(a, e.target.value)}
                          className="bg-background border border-border rounded px-2 py-1 text-xs font-mono"
                        >
                          {Object.entries(APPOINTMENT_STATUS).map(([k, v]) => (
                            <option key={k} value={k}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <AgendaSettings />
    </div>
  );
}

const EMPTY = { contact_id: null, contact_name: "", contact_phone: "", topic: "", modality: "llamada", notes: "" };

function NewAppointment({ preset, onPresetUsed, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [day, setDay] = useState(todayYmd());
  const [slots, setSlots] = useState([]);
  const [slot, setSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [msg, setMsg] = useState("");

  // Cuando se llega desde "Agendar asesoría" en el CRM
  useEffect(() => {
    if (!preset) return;
    setForm({
      ...EMPTY,
      contact_id: preset.id,
      contact_name: preset.name || preset.wa_name || "",
      contact_phone: preset.phone || "",
      topic: preset.interest || "",
    });
    onPresetUsed?.();
  }, [preset, onPresetUsed]);

  const loadSlots = useCallback(() => {
    setLoadingSlots(true);
    setSlot(null);
    getAvailableSlots(day)
      .then(setSlots)
      .catch((e) => setMsg(e.message))
      .finally(() => setLoadingSlots(false));
  }, [day]);

  useEffect(loadSlots, [loadSlots]);

  async function save() {
    if (!slot) return setMsg("Elige un horario.");
    if (!form.contact_name.trim()) return setMsg("Escribe el nombre del cliente.");
    try {
      await createAppointment({
        contact_id: form.contact_id,
        contact_name: form.contact_name.trim(),
        contact_phone: form.contact_phone.replace(/\D/g, "") || null,
        topic: form.topic || null,
        modality: form.modality,
        notes: form.notes || null,
        starts_at: slot.starts_at,
        ends_at: slot.ends_at,
        status: "confirmada",
        created_by: "admin",
      });
      setForm(EMPTY);
      setMsg("Cita agendada ✓");
      setTimeout(() => setMsg(""), 2500);
      loadSlots();
      onCreated();
    } catch (e) {
      setMsg(e.message);
      loadSlots();
    }
  }

  return (
    <section className="doc-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-lg">Nueva asesoría</h2>
        {msg && <span className="text-xs text-accent font-mono">{msg}</span>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label className={label}>Cliente</label>
          <input className={input} value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className={label}>WhatsApp (con 57)</label>
          <input className={input} value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className={label}>Tema</label>
          <select className={input} value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })}>
            <option value="">—</option>
            {Object.entries(TOPICS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={label}>Modalidad</label>
          <select className={input} value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value })}>
            {Object.entries(MODALITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <label className={label}>Notas</label>
        <textarea rows={2} className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>

      <div className="space-y-2">
        <label className={label}>Día</label>
        <input type="date" className={`${input} max-w-xs`} value={day} min={todayYmd()} onChange={(e) => setDay(e.target.value)} />
        <div className="flex flex-wrap gap-2 pt-1">
          {loadingSlots && <span className="text-xs text-muted font-mono">Buscando horarios…</span>}
          {!loadingSlots && slots.length === 0 && (
            <span className="text-xs text-muted font-mono">No hay horarios libres ese día.</span>
          )}
          {slots.map((s) => (
            <button
              key={s.starts_at}
              type="button"
              onClick={() => setSlot(s)}
              className={`text-xs font-mono px-3 py-1.5 rounded border ${
                slot?.starts_at === s.starts_at ? "border-accent bg-accent text-accent-foreground" : "border-border hover:border-accent"
              }`}
            >
              {fmtTime(s.starts_at)}
            </button>
          ))}
        </div>
      </div>

      <button onClick={save} className="btn-cta text-xs py-2 px-4">
        Agendar
      </button>
    </section>
  );
}

function AgendaSettings() {
  const [cfg, setCfg] = useState(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getAgendaConfig().then(setCfg).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-xs text-danger font-mono">{error}</p>;
  if (!cfg) return null;

  const t = (v) => (v ? String(v).slice(0, 5) : "");
  const toggleDay = (n) =>
    setCfg({
      ...cfg,
      work_days: cfg.work_days.includes(n) ? cfg.work_days.filter((d) => d !== n) : [...cfg.work_days, n].sort(),
    });

  async function save() {
    try {
      const next = await saveAgendaConfig({
        ...cfg,
        break_start: cfg.break_start || null,
        break_end: cfg.break_end || null,
        slot_minutes: Number(cfg.slot_minutes),
        min_notice_minutes: Number(cfg.min_notice_minutes),
      });
      setCfg(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <section className="doc-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold text-lg">Horario de asesorías</h2>
        {saved && <span className="text-xs text-accent font-mono">Guardado ✓</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {DAY_NAMES.map((name, i) => (
          <button
            key={name}
            type="button"
            onClick={() => toggleDay(i + 1)}
            className={`text-xs font-mono px-3 py-1.5 rounded border ${
              cfg.work_days.includes(i + 1) ? "border-accent text-accent" : "border-border text-muted"
            }`}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3">
        {[
          ["Desde", "start_time"],
          ["Hasta", "end_time"],
          ["Almuerzo desde", "break_start"],
          ["Almuerzo hasta", "break_end"],
        ].map(([l, k]) => (
          <div key={k} className="space-y-1">
            <label className={label}>{l}</label>
            <input type="time" className={input} value={t(cfg[k])} onChange={(e) => setCfg({ ...cfg, [k]: e.target.value })} />
          </div>
        ))}
        <div className="space-y-1">
          <label className={label}>Duración (min)</label>
          <input type="number" min={10} step={5} className={input} value={cfg.slot_minutes} onChange={(e) => setCfg({ ...cfg, slot_minutes: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className={label}>Anticipación mínima (min)</label>
          <input type="number" min={0} step={15} className={input} value={cfg.min_notice_minutes} onChange={(e) => setCfg({ ...cfg, min_notice_minutes: e.target.value })} />
        </div>
      </div>
      <button onClick={save} className="btn-cta text-xs py-2 px-4">
        Guardar horario
      </button>
    </section>
  );
}
