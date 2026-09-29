import { AuthProvider } from "@/hooks/useAuth";

export const metadata = {
  // El robots.txt (app/robots.txt/route.js) ya bloquea /admin, esto es un
  // segundo cinturón de seguridad a nivel de página.
  robots: { index: false, follow: false },
  title: "Mazoseguros Admin",
  // App instalable en el celular (PWA): manifest + ícono de iPhone
  manifest: "/admin.webmanifest",
  appleWebApp: { capable: true, title: "Mazoseguros", statusBarStyle: "black-translucent" },
  icons: { apple: "/admin-icons/apple-touch-icon.png" },
};

export const viewport = {
  themeColor: "#1a2744",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function AdminLayout({ children }) {
  // El admin es una "app" aparte: ocupa toda la pantalla por encima del header,
  // footer y botón flotante de WhatsApp del sitio público (que vienen del layout raíz).
  return (
    <AuthProvider>
      <div className="fixed inset-0 z-[100] overflow-y-auto overscroll-contain bg-background">{children}</div>
    </AuthProvider>
  );
}
