"use client";

import { useEffect, useState } from "react";
import { currentSubscription, disablePush, enablePush, isIos, isStandalone, pushSupported } from "@/lib/push";

// Botón del header del admin: activa/desactiva los avisos en ESTE dispositivo.
export default function PushToggle({ email }) {
  const [state, setState] = useState("loading"); // loading | off | on | unsupported | ios-install
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (isIos() && !isStandalone()) return setState("ios-install");
    if (!pushSupported()) return setState("unsupported");
    currentSubscription()
      .then((s) => setState(s && Notification.permission === "granted" ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  async function toggle() {
    setBusy(true);
    setMsg("");
    try {
      if (state === "on") {
        await disablePush();
        setState("off");
      } else {
        await enablePush(email);
        setState("on");
        setMsg("Listo: te avisaremos en este dispositivo.");
      }
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
      setTimeout(() => setMsg(""), 5000);
    }
  }

  const base = "text-xs font-mono border rounded px-3 py-1.5";
  if (state === "loading") return null;
  if (state === "unsupported") return null;
  if (state === "ios-install") {
    return (
      <span className="text-[11px] font-mono text-primary-foreground/80 max-w-[220px] leading-tight">
        Para avisos en iPhone: Compartir → “Agregar a inicio” y abre desde el ícono
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2">
      {msg && <span className="hidden sm:inline text-[11px] font-mono text-primary-foreground/80">{msg}</span>}
      <button
        onClick={toggle}
        disabled={busy}
        className={`${base} ${
          state === "on" ? "border-accent bg-accent text-accent-foreground" : "border-primary-foreground/30 hover:border-primary-foreground"
        }`}
        title={state === "on" ? "Desactivar avisos en este dispositivo" : "Recibir avisos en este dispositivo"}
      >
        {busy ? "…" : state === "on" ? "🔔 Avisos activos" : "🔕 Activar avisos"}
      </button>
    </span>
  );
}
