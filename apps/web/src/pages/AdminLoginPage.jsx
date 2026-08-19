import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

export default function AdminLoginPage() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  if (session) return <Navigate to="/admin" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      navigate("/admin");
    } catch {
      setError("Correo o contraseña incorrectos.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <form onSubmit={handleSubmit} className="doc-card p-8 w-full max-w-sm space-y-5">
        <div>
          <div className="eyebrow mb-4">Panel admin</div>
          <h1 className="font-display font-semibold text-3xl">Iniciar sesión</h1>
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-xs font-mono uppercase tracking-wider text-muted">
            Correo
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-2 focus-ring"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-xs font-mono uppercase tracking-wider text-muted">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-background border border-border rounded px-3 py-2 focus-ring"
          />
        </div>

        {error && <p className="text-sm text-danger font-mono">{error}</p>}

        <button type="submit" disabled={loading} className="btn-cta w-full disabled:opacity-50">
          {loading ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
