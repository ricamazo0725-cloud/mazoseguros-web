"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

// Equivalente a ProtectedRoute.jsx en apps/web, adaptado a next/navigation.
// El panel /admin sigue sin ser server-rendered a propósito: no aporta nada
// a SEO (robots.txt lo bloquea) y así el código de autenticación/edición no
// engorda el bundle público.
export default function RequireAuth({ children }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/admin/login");
    }
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted font-mono text-sm">
        Verificando sesión…
      </div>
    );
  }

  return children;
}
