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

// Reproductor de notas de voz. Descarga el archivo y lo reproduce desde memoria
// (algunos navegadores/webviews rechazan el enlace directo del bucket). Si el
// <audio> nativo tampoco puede, lo decodifica y reproduce con Web Audio.
function AudioPlayer({ url }) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [bytes, setBytes] = useState(null);
  const [mode, setMode] = useState("native"); // native | webaudio
  const [err, setErr] = useState("");
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(null);
  const ctxRef = useRef(null);
  const srcRef = useRef(null);

  useEffect(() => {
    let revoke = null;
    let cancelled = false;
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`No se pudo descargar el audio (${r.status})`);
        return r.arrayBuffer();
      })
      .then((buf) => {
        if (cancelled) return;
        setBytes(buf);
        revoke = URL.createObjectURL(new Blob([buf], { type: "audio/ogg" }));
        setBlobUrl(revoke);
      })
      .catch((e) => setErr(e.message));
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
      srcRef.current?.stop?.();
      ctxRef.current?.close?.();
    };
  }, [url]);

  async function toggleWebAudio() {
    try {
      if (playing) {
        srcRef.current?.stop();
        setPlaying(false);
        return;
      }
      const ctx = ctxRef.current || new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      const decoded = await ctx.decodeAudioData(bytes.slice(0));
      setDuration(decoded.duration);
      const src = ctx.createBufferSource();
      src.buffer = decoded;
      src.connect(ctx.destination);
      src.onended = () => setPlaying(false);
      src.start();
      srcRef.current = src;
      setPlaying(true);
    } catch (e) {
      setErr("Este navegador no puede reproducir la nota de voz. Prueba en Chrome o descárgala.");
    }
  }

  if (err) {
    return (
      <div className="text-xs opacity-80 space-y-1">
        <div>⚠️ {err}</div>
        <a href={url} target="_blank" rel="noreferrer" className="underline">Descargar audio</a>
      </div>
    );
  }
  if (!blobUrl) return <div className="text-xs opacity-80">🎤 Nota de voz · cargando…</div>;

  if (mode === "webaudio") {
    return (
      <button type="button" onClick={toggleWebAudio} className="text-xs font-mono border rounded px-3 py-2 border-current">
        {playing ? "■ Detener" : "▶ Reproducir nota de voz"}
        {duration ? ` · ${Math.round(duration)} s` : ""}
      </button>
    );
  }
  return <audio controls preload="metadata" src={blobUrl} onError={() => setMode("webaudio")} className="max-w-[260px] h-10" />;
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
