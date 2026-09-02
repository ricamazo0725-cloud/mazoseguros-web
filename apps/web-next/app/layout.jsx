import { Fraunces, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import FloatingWhatsApp from "@/components/FloatingWhatsApp";
import seoConfig from "@/config/seo.json";
import { getAllSectionsSafe } from "@/lib/content";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || seoConfig.siteUrl;

// --- Metadata de la página raíz ------------------------------------------
// Antes esto vivía, idéntico y fijo, en apps/web/index.html — así que TODAS
// las rutas (home, blog, cada post) compartían el mismo title/description.
// Aquí queda como el default: cada página pública lo sobreescribe con el
// suyo propio vía `export const metadata` / `generateMetadata` (ver
// app/page.jsx, app/blog/page.jsx, app/blog/[slug]/page.jsx).
export const metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Mazoseguros | Agencia de Seguros en Medellín | Cotiza Ahora",
    template: "%s | Mazoseguros",
  },
  description: seoConfig.description,
  keywords: seoConfig.keywords,
  authors: [{ name: "Mazoseguros" }],
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Mazoseguros",
    title: "Mazoseguros | Agencia de Seguros en Medellín",
    description: "Protegemos lo que más te importa. Seguros de auto, hogar, salud y obras civiles con los mejores aliados del mercado.",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630 }],
    locale: "es_CO",
  },
  twitter: {
    card: "summary_large_image",
    title: "Mazoseguros | Agencia de Seguros en Medellín",
    description: "Protegemos lo que más te importa. Seguros de auto, hogar, salud y obras civiles.",
    images: ["/og-image.jpg"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

// Igual a los tres bloques <script type="application/ld+json"> que ya
// existían en apps/web/index.html — se traen tal cual, así que este
// contenido no se pierde en la migración (ya era visible para cualquier
// rastreador porque vivía en HTML estático, no lo generaba React).
function jsonLd() {
  const localBusiness = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Mazoseguros",
    image: `${siteUrl}/logo.png`,
    description: "Agencia de seguros en Medellín especializada en pólizas de auto, hogar, salud y obras civiles",
    url: siteUrl,
    telephone: seoConfig.contact.phone,
    email: seoConfig.contact.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: seoConfig.address.street,
      addressLocality: seoConfig.address.city,
      addressRegion: seoConfig.address.state,
      postalCode: seoConfig.address.zipCode,
      addressCountry: "CO",
    },
    areaServed: { "@type": "City", name: "Medellín" },
    priceRange: "$$",
    sameAs: [seoConfig.socialMedia.facebook, seoConfig.socialMedia.instagram, seoConfig.socialMedia.whatsapp],
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
        opens: seoConfig.businessHours.weekday.open,
        closes: seoConfig.businessHours.weekday.close,
      },
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: "Saturday",
        opens: seoConfig.businessHours.saturday.open,
        closes: seoConfig.businessHours.saturday.close,
      },
    ],
  };

  const insuranceAgency = {
    "@context": "https://schema.org",
    "@type": "InsuranceAgency",
    name: "Mazoseguros",
    url: siteUrl,
    serviceType: seoConfig.services.map((s) => s.name),
    knowsAbout: seoConfig.services.map((s) => s.name.replace("Seguros de", "Pólizas de")),
  };

  const organization = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Mazoseguros",
    url: siteUrl,
    logo: `${siteUrl}/logo.png`,
    description: "Agencia de seguros líder en Medellín con aliados como Sura, Allianz y AXA",
    sameAs: [seoConfig.socialMedia.facebook, seoConfig.socialMedia.instagram],
    contactPoint: {
      "@type": "ContactPoint",
      telephone: seoConfig.contact.phone,
      contactType: "Customer Service",
    },
  };

  return [localBusiness, insuranceAgency, organization];
}

export default async function RootLayout({ children }) {
  // Se resuelve una sola vez en el servidor y se pasa a Header/Footer/
  // FloatingWhatsApp — antes cada uno de esos componentes hacía su propio
  // fetch en el navegador (Logo.jsx, FloatingWhatsApp.jsx originales).
  const sections = await getAllSectionsSafe();
  const logoUrl = sections?.media?.logoUrl;
  const whatsapp = sections?.contact?.whatsapp || sections?.hero?.whatsapp;

  return (
    <html lang="es" className={`${fraunces.variable} ${inter.variable} ${plexMono.variable}`}>
      <head>
        {jsonLd().map((schema, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
          />
        ))}
      </head>
      <body className="min-h-screen flex flex-col">
        <Header logoUrl={logoUrl} whatsapp={whatsapp} />
        <main className="flex-1">{children}</main>
        <FloatingWhatsApp whatsapp={whatsapp} />
        <Footer logoUrl={logoUrl} />
      </body>
    </html>
  );
}
