import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Logo from "@/components/Logo";
<<<<<<< HEAD
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
=======
>>>>>>> 9c3f116cb0b85f0b94feff6e8a65613361b17ca3

const NAV = [
  { to: "/#seguros", label: "Seguros" },
  { to: "/blog", label: "Blog" },
  { to: "/#nosotros", label: "Nosotros" },
  { to: "/#contacto", label: "Contacto" },
];

export default function Layout({ children }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className={`sticky top-0 z-40 transition-colors ${
          scrolled ? "bg-background/95 backdrop-blur border-b border-border" : "bg-transparent"
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <Link to="/">
            <Logo className="h-8 w-auto" />
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted">
            {NAV.map((item) => (
              <a key={item.to} href={item.to} className="hover:text-foreground transition-colors focus-ring rounded">
                {item.label}
              </a>
            ))}
          </nav>
          <a
            href="https://wa.me/573103897969"
            target="_blank"
            rel="noreferrer"
            className="btn-cta text-sm py-2.5 px-4"
          >
            Cotiza ya
          </a>
        </div>
      </header>

      <main className="flex-1">{children}</main>

<<<<<<< HEAD
      <FloatingWhatsApp />

=======
>>>>>>> 9c3f116cb0b85f0b94feff6e8a65613361b17ca3
      <footer className="bg-primary text-primary-foreground">
        <div className="max-w-6xl mx-auto px-6 py-14 grid sm:grid-cols-3 gap-10">
          <div>
            <Logo className="h-8 w-auto mb-4" light />
            <p className="text-sm text-primary-foreground/70 max-w-xs">
              Protegemos lo que más te importa: tu familia, tu patrimonio y tu empresa.
            </p>
          </div>
          <div>
            <div className="eyebrow mb-3">Seguros</div>
            <ul className="space-y-2 text-sm text-primary-foreground/80">
              <li><a href="/#seguros" className="hover:text-primary-foreground">Autos</a></li>
              <li><a href="/#seguros" className="hover:text-primary-foreground">Propiedades</a></li>
              <li><a href="/#seguros" className="hover:text-primary-foreground">Salud</a></li>
              <li><a href="/#seguros" className="hover:text-primary-foreground">Obras civiles</a></li>
            </ul>
          </div>
          <div>
            <div className="eyebrow mb-3">Contacto</div>
            <ul className="space-y-2 text-sm text-primary-foreground/80">
              <li>mazseguros@hotmail.com</li>
              <li>310 389 7969</li>
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
    </div>
  );
}
