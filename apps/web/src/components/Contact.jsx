import { useState } from "react";
import { submitQuoteRequest } from "@/api/quotes";

export default function Contact({ data }) {
  const [form, setForm] = useState({ name: "", phone: "", category: "auto", message: "" });
  const [status, setStatus] = useState("idle");

  const wa = (data?.whatsapp || "573103897969").replace(/\D/g, "");

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("sending");
    try {
      await submitQuoteRequest(form);
      setStatus("sent");
      setForm({ name: "", phone: "", category: "auto", message: "" });
    } catch {
      setStatus("error");
    }
  }

  return (
    <section id="contacto" className="max-w-6xl mx-auto px-6 py-24">
      <div className="grid lg:grid-cols-2 gap-12">
        <div>
          <div className="eyebrow mb-3">Contacto</div>
          <h2 className="font-display font-semibold text-4xl tracking-tight mb-6">Cotiza tu seguro</h2>
          <p className="text-muted leading-relaxed max-w-md mb-8">
            Cuéntanos qué quieres proteger y te contactamos con la mejor opción entre nuestros aliados.
          </p>

          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noreferrer"
            className="btn-cta inline-block"
          >
            Escribir por WhatsApp
          </a>

          <div className="mt-8 space-y-1 text-sm text-muted font-mono">
            {data?.email && <div>{data.email}</div>}
            {data?.whatsapp && <div>{data.whatsapp}</div>}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="doc-card p-8 space-y-4">
          <Field label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          <Field label="Teléfono" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} required />

          <div className="space-y-1">
            <label className="text-xs font-mono uppercase tracking-wider text-muted">Tipo de seguro</label>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus-ring"
            >
              <option value="auto">Autos</option>
              <option value="propiedades">Propiedades</option>
              <option value="salud">Salud</option>
              <option value="obras-civiles">Obras civiles</option>
              <option value="otro">Otro</option>
            </select>
          </div>

          <Field label="Mensaje" value={form.message} onChange={(v) => setForm({ ...form, message: v })} textarea />

          <button type="submit" disabled={status === "sending"} className="btn-cta w-full disabled:opacity-50">
            {status === "sending" ? "Enviando…" : "Enviar solicitud"}
          </button>

          {status === "sent" && <p className="text-xs text-accent font-mono">Solicitud enviada. Te contactaremos pronto.</p>}
          {status === "error" && <p className="text-xs text-danger font-mono">No se pudo enviar. Escríbenos por WhatsApp.</p>}
        </form>
      </div>
    </section>
  );
}

function Field({ label, value, onChange, textarea, required }) {
  const Comp = textarea ? "textarea" : "input";
  return (
    <div className="space-y-1">
      <label className="text-xs font-mono uppercase tracking-wider text-muted">{label}</label>
      <Comp
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        rows={textarea ? 3 : undefined}
        className="w-full bg-background border border-border rounded px-3 py-2 text-sm focus-ring"
      />
    </div>
  );
}
