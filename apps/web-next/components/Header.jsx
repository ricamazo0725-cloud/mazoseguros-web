"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

const NAV = [
  { to: "/#seguros", label: "Seguros" },
  { to: "/blog", label: "Blog" },
  { to: "/#nosotros", label: "Nosotros" },
  { to: "/#contacto", label: "Contacto" },
];

// Client Component solo por el efecto de scroll (fondo del header al
// desplazar la página) — el logo y el link de WhatsApp que recibe como
// props ya llegan resueltos desde el servidor.
export default function Header({ logoUrl, whatsapp }) {
  const [scrolled, setScrolled] = useState(false);
  const whatsappNumber = (whatsapp || "").replace(/\D/g, "");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-40 transition-colors ${
        scrolled ? "bg-background/95 backdrop-blur border-b border-border" : "bg-transparent"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
        <Link href="/">
          <Logo className="h-8 w-auto" logoUrl={logoUrl} />
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted">
          {NAV.map((item) => (
            <a key={item.to} href={item.to} className="hover:text-foreground transition-colors focus-ring rounded">
              {item.label}
            </a>
          ))}
        </nav>
        <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" className="btn-cta text-sm py-2.5 px-4">
          Cotiza ya
        </a>
      </div>
    </header>
  );
}
