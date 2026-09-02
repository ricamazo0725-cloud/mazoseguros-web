import { useState } from "react";
import { submitQuoteRequest } from "@/api/quotes";
import seoConfig from "@/config/seo.json";

export default function Contact({ data }) {
  const [form, setForm] = useState({ name: "", phone: "", category: "auto", message: "" });
  const [status, setStatus] = useState("idle");

  const wa = (data?.whatsapp || seoConfig.contact.whatsapp).replace(/\D/g, "");
  const mapsUrl = seoConfig.address.googleMapsUrl;
  const phone = seoConfig.contact.phone;
  const email = seoConfig.contact.email;

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

          <div className="space-y-4 mb-8">
            <a
              href={`https://wa.me/${wa}`}
              target="_blank"
              rel="noreferrer"
              className="btn-cta inline-block"
            >
              Escribir por WhatsApp
            </a>
            
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary inline-block ml-2"
            >
              📍 Ver en Google Maps
            </a>
          </div>

          <div className="space-y-4">
            <div className="text-sm text-muted font-mono">
              <div className="font-semibold text-foreground mb-2">Información de contacto:</div>
              <div>📧 {email}</div>
              <div>📱 {phone}</div>
            </div>

            {/* Google Maps Embed - Iframe */}
            <div className="mt-6 rounded-lg overflow-hidden border border-border">
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3966.6966329976044!2d-75.5922674!3d6.1713587!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x8e4683280f075ecd%3A0x6c1030c7665f1b48!2sMazoseguros%20Agencia%20Seguros!5e0!3m2!1ses-419!2sco!4v1788312176658!5m2!1ses-419!2sco"
                width="100%"
                height="400"
                style={{ border: 0, borderRadius: "8px" }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                title="Ubicación de Mazoseguros en Google Maps"
              />
            </div>
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
            {status === "sending"} Enviando…" : "Enviar solicitud"}
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
