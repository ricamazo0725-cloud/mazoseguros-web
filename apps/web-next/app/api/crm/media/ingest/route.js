import { supabaseAdmin, json } from "@/lib/serverAuth";

// Descarga el audio/imagen/documento de un mensaje entrante de WhatsApp y lo guarda
// en el bucket privado "crm-media" (los enlaces de WhatsApp vencen).
// La llama Supabase (trigger crm_trg_media_ingest vía pg_net) con x-push-secret.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXT = {
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/amr": "amr",
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "application/pdf": "pdf",
};
const MAX_BYTES = 16 * 1024 * 1024;

export async function POST(request) {
  const env = process.env;
  if (!env["PUSH_SECRET"] || request.headers.get("x-push-secret") !== env["PUSH_SECRET"]) {
    return json({ error: "forbidden" }, 403);
  }
  const { messageId } = await request.json().catch(() => ({}));
  if (!messageId) return json({ error: "Falta messageId" }, 400);

  const sb = supabaseAdmin();
  const { data: msg, error } = await sb
    .from("crm_messages")
    .select("id, contact_id, type, body, raw, media_path")
    .eq("id", messageId)
    .single();
  if (error || !msg) return json({ error: "Mensaje no encontrado" }, 404);
  if (msg.media_path) return json({ ok: true, already: true });

  const fail = async (reason) => {
    await sb.from("crm_messages").update({ media_error: String(reason).slice(0, 500) }).eq("id", msg.id);
    return json({ error: reason }, 502);
  };

  // Mensaje de WhatsApp (formato Meta v3 que reenvía Gupshup)
  const wa = msg.raw?.entry?.[0]?.changes?.[0]?.value?.messages?.[0] || {};
  const media = wa[wa.type] || wa[msg.type] || {};
  const url = media.url || media.link;
  if (!url) {
    return fail(`El mensaje no trae enlace del archivo (campos: ${Object.keys(media).join(", ") || "ninguno"})`);
  }

  // Los enlaces de Gupshup (filemanager) pueden pedir la API key
  let res = await fetch(url);
  if ((res.status === 401 || res.status === 403) && env["GUPSHUP_API_KEY"]) {
    res = await fetch(url, { headers: { apikey: env["GUPSHUP_API_KEY"] } });
  }
  if (!res.ok) return fail(`No se pudo descargar (${res.status})`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_BYTES) return fail("Archivo demasiado grande");
  if (buf.length < 100) return fail(`Archivo vacío o incompleto (${buf.length} bytes)`);

  // Verificar por el contenido que sí es el archivo y no una página/JSON de error
  const sniffed = sniff(buf);
  const served = (res.headers.get("content-type") || "").split(";")[0].trim();
  if (!sniffed && (/html|json|xml|text\//.test(served) || buf[0] === 0x3c || buf[0] === 0x7b)) {
    return fail(`La descarga no es un archivo (${served || "sin tipo"}): ${buf.subarray(0, 120).toString("utf8").replace(/\s+/g, " ")}`);
  }
  const mime = sniffed || (media.mime_type || served || "application/octet-stream").split(";")[0].trim();
  const ext = EXT[mime] || (media.filename?.split(".").pop() ?? "bin");
  const path = `in/${msg.contact_id}/${msg.id}.${ext}`;

  const up = await sb.storage.from("crm-media").upload(path, buf, { contentType: mime, upsert: true });
  if (up.error) return fail(`No se pudo guardar: ${up.error.message}`);

  await sb
    .from("crm_messages")
    .update({ media_path: path, media_mime: mime, media_error: null, body: msg.body ?? media.caption ?? null })
    .eq("id", msg.id);
  return json({ ok: true, path, mime, bytes: buf.length });
}

// Tipo real del archivo según sus primeros bytes
function sniff(b) {
  const ascii = (start, len) => b.subarray(start, start + len).toString("latin1");
  if (ascii(0, 4) === "OggS") return "audio/ogg";
  if (ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (ascii(0, 5) === "#!AMR") return "audio/amr";
  if (ascii(4, 4) === "ftyp") return ascii(8, 4).startsWith("M4A") ? "audio/mp4" : "video/mp4";
  if (ascii(0, 4) === "%PDF") return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (ascii(1, 3) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") return "image/webp";
  return null;
}
