// Solo para rutas de servidor. Lee la foto/PDF de un SOAT con Gemini y la guarda con crm_soat_save.
import { sendText } from "@/lib/gupshup";

const FIELDS = {
  es_soat: { type: "BOOLEAN", description: "true si el documento es un SOAT colombiano (seguro obligatorio de accidentes de tránsito)" },
  placa: { type: "STRING", description: "Placa del vehículo, ej. ABC123 o ABC12D" },
  clase: { type: "STRING", description: "Clase de vehículo: automóvil, motocicleta, campero, camioneta, etc." },
  marca: { type: "STRING" },
  linea: { type: "STRING", description: "Línea o referencia del vehículo" },
  modelo: { type: "STRING", description: "Año del modelo, 4 dígitos" },
  servicio: { type: "STRING", description: "Particular, público, oficial…" },
  tomador: { type: "STRING", description: "Nombre completo del tomador" },
  tipo_documento: { type: "STRING", description: "CC, NIT, CE, PAS, TI" },
  documento: { type: "STRING", description: "Número de documento del tomador, solo dígitos" },
  telefono: { type: "STRING", description: "Teléfono del tomador si aparece" },
  ciudad: { type: "STRING", description: "Ciudad del tomador o de expedición" },
  aseguradora: { type: "STRING", description: "Compañía aseguradora (SURA, Seguros del Estado, Previsora, Mundial, AXA Colpatria, Bolívar, Allianz…)" },
  numero_poliza: { type: "STRING" },
  inicio_vigencia: { type: "STRING", description: "Fecha de inicio de vigencia en formato AAAA-MM-DD" },
  fin_vigencia: { type: "STRING", description: "Fecha de fin de vigencia (vencimiento) en formato AAAA-MM-DD" },
  valor: { type: "STRING", description: "Valor total pagado, solo dígitos" },
};

const PROMPT =
  "Eres un asistente de una agencia de seguros en Colombia. Extrae los datos de este SOAT " +
  "(foto, captura o PDF). Si un dato no aparece o no se lee, déjalo vacío; no inventes. " +
  "Las fechas en Colombia vienen como día/mes/año: devuélvelas como AAAA-MM-DD. " +
  "Si el documento NO es un SOAT, responde es_soat=false.";

export async function readSoat(buf, mime) {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new Error("Falta la variable GEMINI_API_KEY en el servidor");
  const model = process.env["GEMINI_MODEL"] || "gemini-flash-latest";
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data: buf.toString("base64") } }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: { type: "OBJECT", properties: FIELDS, required: ["es_soat"] },
      },
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${body?.error?.message || "error"}`.slice(0, 300));
  const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("La IA no devolvió datos legibles");
  }
}

// Lee, guarda y (si viene de un asesor por WhatsApp) le responde con el resultado.
export async function processSoat(sb, { buf, mime, path, messageId = null, advisorPhone = null, createdBy = null }) {
  let reply;
  let result = null;
  try {
    const data = await readSoat(buf, mime);
    const { data: saved, error } = await sb.rpc("crm_soat_save", {
      p_data: data,
      p_advisor: advisorPhone || createdBy,
      p_image_path: path,
      p_message_id: messageId,
    });
    if (error) throw new Error(error.message);
    result = saved;
    reply = saved?.text || "Listo.";
  } catch (e) {
    reply = `😕 No pude leer el SOAT: ${e.message}. Intenta con otra foto o escribe *ayuda*.`;
    result = { ok: false, text: reply };
  }
  if (advisorPhone) {
    try {
      await sendText(sb, advisorPhone, reply);
    } catch (e) {
      console.error("processSoat: no se pudo responder al asesor", e.message);
    }
  }
  return result;
}
