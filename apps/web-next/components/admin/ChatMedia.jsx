"use client";

import { useEffect, useRef, useState } from "react";
import { mediaUrl, sendVoiceNote } from "@/lib/crm";

const MEDIA_TYPES = ["audio", "voice", "image", "document", "video", "sticker"];
export const isMediaMessage = (m) => MEDIA_TYPES.includes(m.type);

// ───────────── Mostrar audio / imagen / documento de un mensaje ─────────────
export function MessageMedia({ m }) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!m.media_path) return;
    mediaUrl(m.media_path).then(setUrl).catch((e) => setErr(e.message));
  }, [m.media_path]);

  const kind = m.type === "voice" ? "audio" : m.type;
  const icon = { audio: "🎤 Nota de voz", image: "🖼️ Imagen", document: "📄 Documento", video: "🎬 Video", sticker: "Sticker" }[kind];

  if (!m.media_path) {
    return (
      <div className="text-xs opacity-80">
        {icon} {m.media_error ? <span className="block">⚠️ {m.media_error}</span> : "· descargando…"}
      </div>
    );
  }
  if (err) return <div className="text-xs opacity-80">{icon} · ⚠️ {err}</div>;
  if (!url) return <div className="text-xs opacity-80">{icon} · cargando…</div>;

  if (kind === "audio") return <AudioPlayer url={url} />;
  if (kind === "image" || kind === "sticker")
    return (
      <a href={url} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Imagen del chat" className="max-w-[240px] max-h-64 rounded" />
      </a>
    );
  if (kind === "video") return <video controls src={url} className="max-w-[260px] rounded" />;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="underline">
      {icon} · abrir
    </a>
  );
}

// Reproductor de notas de voz con Web Audio: descarga el archivo, lo decodifica y
// lo reproduce. No usa <audio> porque algunos navegadores/webviews muestran 0:00
// y no reproducen el OGG/Opus de WhatsApp desde el bucket.
function AudioPlayer({ url }) {
  const [decoded, setDecoded] = useState(null);
  const [err, setErr] = useState("");
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const ctxRef = useRef(null);
  const srcRef = useRef(null);
  const startRef = useRef(0); // ctx.currentTime - offset al iniciar
  const offsetRef = useRef(0); // segundos ya reproducidos (para pausar/reanudar)
  const rafRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`No se pudo descargar el audio (${r.status})`);
        const buf = await r.arrayBuffer();
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        ctxRef.current = ctx;
        const audio = await ctx.decodeAudioData(buf);
        if (!cancelled) setDecoded(audio);
      } catch (e) {
        if (!cancelled) setErr(e?.message?.includes("descargar") ? e.message : "Este navegador no puede reproducir la nota de voz.");
      }
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      try { srcRef.current?.stop(); } catch {}
      ctxRef.current?.close?.();
    };
  }, [url]);

  function tick() {
    const ctx = ctxRef.current;
    if (!ctx || !decoded) return;
    setPos(Math.min(ctx.currentTime - startRef.current, decoded.duration));
    rafRef.current = requestAnimationFrame(tick);
  }

  async function play(from = offsetRef.current) {
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") await ctx.resume();
    const src = ctx.createBufferSource();
    src.buffer = decoded;
    src.connect(ctx.destination);
    src.onended = () => {
      if (srcRef.current !== src) return; // se detuvo para pausar/buscar
      cancelAnimationFrame(rafRef.current);
      offsetRef.current = 0;
      setPos(0);
      setPlaying(false);
    };
    if (from >= decoded.duration) from = 0;
    startRef.current = ctx.currentTime - from;
    src.start(0, from);
    srcRef.current = src;
    setPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  }

  function pause() {
    const ctx = ctxRef.current;
    offsetRef.current = ctx.currentTime - startRef.current;
    const src = srcRef.current;
    srcRef.current = null;
    try { src?.stop(); } catch {}
    cancelAnimationFrame(rafRef.current);
    setPlaying(false);
  }

  function seek(e) {
    if (!decoded) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * decoded.duration;
    offsetRef.current = t;
    setPos(t);
    if (playing) {
      const src = srcRef.current;
      srcRef.current = null;
      try { src?.stop(); } catch {}
      play(t);
    }
  }

  const fmt = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

  if (err) {
    return (
      <div className="text-xs opacity-80 space-y-1">
        <div>⚠️ {err}</div>
        <a href={url} target="_blank" rel="noreferrer" className="underline">Descargar audio</a>
      </div>
    );
  }
  if (!decoded) return <div className="text-xs opacity-80">🎤 Nota de voz · cargando…</div>;

  const pct = (pos / decoded.duration) * 100;
  return (
    <div className="flex items-center gap-3 w-[240px] max-w-full">
      <button
        type="button"
        onClick={() => (playing ? pause() : play())}
        aria-label={playing ? "Pausar" : "Reproducir"}
        className="w-9 h-9 shrink-0 rounded-full border border-current flex items-center justify-center text-sm"
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <div className="flex-1 space-y-1">
        <div onClick={seek} className="h-2 rounded-full bg-current/20 cursor-pointer relative overflow-hidden" style={{ backgroundColor: "rgba(127,127,127,.3)" }}>
          <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[10px] font-mono opacity-70 flex justify-between">
          <span>{fmt(pos)}</span>
          <span>{fmt(decoded.duration)}</span>
        </div>
      </div>
    </div>
  );
}

// ───────────── Grabar y enviar nota de voz ─────────────
// Graba directo en OGG/Opus (el formato de las notas de voz de WhatsApp) con opus-recorder,
// porque Chrome por defecto graba WebM y WhatsApp no lo acepta.
export function VoiceRecorder({ contactId, disabled, onSent }) {
  const [state, setState] = useState("idle"); // idle | recording | preview | sending
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState("");
  const recRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function start() {
    setError("");
    try {
      const Recorder = (await import("opus-recorder")).default;
      if (!Recorder.isRecordingSupported()) throw new Error("Este navegador no permite grabar audio.");
      const rec = new Recorder({
        encoderPath: "/opus/encoderWorker.min.js",
        encoderApplication: 2048, // voz
        encoderSampleRate: 48000,
        numberOfChannels: 1,
        streamPages: false,
      });
      rec.ondataavailable = (typedArray) => {
        const b = new Blob([typedArray], { type: "audio/ogg" });
        setBlob(b);
        setPreviewUrl(URL.createObjectURL(b));
        setState("preview");
      };
      await rec.start();
      recRef.current = rec;
      setSeconds(0);
      setState("recording");
      timerRef.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= 300) stop(); // máximo 5 minutos
          return s + 1;
        });
      }, 1000);
    } catch (e) {
      setError(e.name === "NotAllowedError" ? "Permite el uso del micrófono para grabar." : e.message);
      setState("idle");
    }
  }

  function stop() {
    clearInterval(timerRef.current);
    recRef.current?.stop();
    recRef.current = null;
  }

  function discard() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setBlob(null);
    setPreviewUrl(null);
    setState("idle");
  }

  async function send() {
    if (!blob) return;
    setState("sending");
    setError("");
    try {
      await sendVoiceNote(contactId, blob);
      discard();
      onSent?.();
    } catch (e) {
      setError(e.message);
      setState("preview");
    }
  }

  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const btn = "text-xs font-mono px-3 py-2 rounded border";

  return (
    <div className="space-y-2">
      {state === "idle" && (
        <button type="button" onClick={start} disabled={disabled} className={`${btn} border-border hover:border-accent disabled:opacity-50`} title="Grabar nota de voz">
          🎤 Grabar audio
        </button>
      )}
      {state === "recording" && (
        <div className="flex items-center gap-3">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-danger animate-pulse" />
          <span className="font-mono text-sm">{mmss}</span>
          <button type="button" onClick={stop} className={`${btn} border-accent text-accent`}>
            ■ Detener
          </button>
        </div>
      )}
      {(state === "preview" || state === "sending") && previewUrl && (
        <div className="flex flex-wrap items-center gap-2">
          <audio controls src={previewUrl} className="h-10 max-w-[240px]" />
          <button type="button" onClick={send} disabled={state === "sending"} className="btn-cta text-xs py-2 px-4">
            {state === "sending" ? "Enviando…" : "Enviar audio"}
          </button>
          <button type="button" onClick={discard} disabled={state === "sending"} className="text-xs font-mono text-muted hover:text-danger">
            Descartar
          </button>
        </div>
      )}
      {error && <p className="text-xs text-danger font-mono">{error}</p>}
    </div>
  );
}
