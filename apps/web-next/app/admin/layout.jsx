import { AuthProvider } from "@/hooks/useAuth";

export const metadata = {
  // El robots.txt (app/robots.txt/route.js) ya bloquea /admin, esto es un
  // segundo cinturón de seguridad a nivel de página.
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}
