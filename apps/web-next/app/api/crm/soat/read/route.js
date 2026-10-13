import { requireAdmin, json } from "@/lib/serverAuth";
import { processSoat } from "@/lib/soatReader";

// Desde el admin: lee con IA una foto/PDF de SOAT ya subida a crm-media/soat/... y la guarda.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request) {
  const auth = await requireAdmin(request);
  if (auth.error) return json({ error: auth.error }, auth.status);
  const { sb, user } = auth;

  const { path } = await request.json().catch(() => ({}));
  if (!path || !/^soat\/[\w.-]+$/.test(path)) return json({ error: "Ruta inválida" }, 400);

  const { data: file, error } = await sb.storage.from("crm-media").download(path);
  if (error || !file) return json({ error: "No se encontró el archivo" }, 404);
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || (path.endsWith(".pdf") ? "application/pdf" : "image/jpeg");

  const result = await processSoat(sb, { buf, mime, path, createdBy: (user.email || "admin").split("@")[0] });
  return json(result, result?.ok ? 200 : 422);
}
