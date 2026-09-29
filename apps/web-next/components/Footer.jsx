import Logo from "@/components/Logo";
import seoConfig from "@/config/seo.json";

export default function Footer({ logoUrl }) {
  return (
    <footer className="bg-primary text-primary-foreground">
      <div className="max-w-6xl mx-auto px-6 py-14 grid sm:grid-cols-3 gap-10">
        <div>
          <Logo className="h-8 w-auto mb-4" light logoUrl={logoUrl} />
          <p className="text-sm text-primary-foreground/70 max-w-xs">
            Protegemos lo que más te importa: tu familia, tu patrimonio y tu empresa.
          </p>
        </div>
        <div>
          <div className="eyebrow mb-3">Seguros</div>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            <li>
              <a href="/#seguros" className="hover:text-primary-foreground">
                Autos
              </a>
            </li>
            <li>
              <a href="/#seguros" className="hover:text-primary-foreground">
                Propiedades
              </a>
            </li>
            <li>
              <a href="/#seguros" className="hover:text-primary-foreground">
                Salud
              </a>
            </li>
            <li>
              <a href="/#seguros" className="hover:text-primary-foreground">
                Obras civiles
              </a>
            </li>
          </ul>
        </div>
        <div>
          <div className="eyebrow mb-3">Contacto</div>
          <ul className="space-y-2 text-sm text-primary-foreground/80">
            <li>{seoConfig.contact.email}</li>
            <li>
              <a href={`https://wa.me/${seoConfig.contact.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent("Hola, vengo del sitio web de Mazoseguros.")}`} target="_blank" rel="noreferrer" className="hover:text-primary-foreground">
                WhatsApp: {seoConfig.contact.whatsapp.replace(/\D/g, "").replace(/^57/, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3")}
              </a>
            </li>
            <li>
              <a href={`tel:${seoConfig.contact.phone}`} className="hover:text-primary-foreground">
                Llamadas: {seoConfig.contact.phone.replace(/\D/g, "").replace(/^57/, "").replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3")}
              </a>
            </li>
            <li>Medellín, Colombia</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-primary-foreground/15">
        <div className="max-w-6xl mx-auto px-6 py-5 text-xs text-primary-foreground/60 font-mono">
          © {new Date().getFullYear()} Mazoseguros — Agencia de seguros en Medellín
        </div>
      </div>
    </footer>
  );
}
