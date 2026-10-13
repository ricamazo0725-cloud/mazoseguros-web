import { supabase } from "@/lib/supabaseClient";

// Tablero de vencimientos por aseguradora (vista crm_expirations_view, ver crm_contacts_view.sql)

export const KIND_LABEL = { poliza: "Pólizas", soat: "SOAT", rtm: "Tecnomecánica" };

export const LINE_LABEL = {
  auto: "Autos", soat: "SOAT", rtm: "RTM", salud: "Salud", vida: "Vida", propiedades: "Hogar", arriendo: "Arrendamiento",
  "obras-civiles": "Obras civiles", cumplimiento: "Cumplimiento", "responsabilidad-civil": "RC", otro: "Otro",
};

// Tramos de urgencia: el orden importa (de más urgente a menos)
export const BANDS = [
  { key: "vencido", label: "Vencidos", test: (d) => d < 0, cls: "bg-danger", text: "text-danger" },
  { key: "d7", label: "≤ 7 días", test: (d) => d >= 0 && d <= 7, cls: "bg-accent", text: "text-accent" },
  { key: "d30", label: "8–30 días", test: (d) => d > 7 && d <= 30, cls: "bg-amber-400", text: "text-amber-600" },
  { key: "d60", label: "31–60 días", test: (d) => d > 30 && d <= 60, cls: "bg-primary/50", text: "text-primary" },
  { key: "ok", label: "Vigentes", test: (d) => d > 60, cls: "bg-primary/15", text: "text-muted" },
];

export function bandOf(days) {
  return BANDS.find((b) => b.test(days))?.key || "ok";
}

export async function listExpirations() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase
    .from("crm_expirations_view")
    .select("*")
    .order("end_date", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return data ?? [];
}

// Agrupa por aseguradora: { insurer, total, clients, bands:{vencido,d7,...}, byKind:{poliza,soat,rtm}, items }
export function groupByInsurer(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = r.insurer || "Sin aseguradora";
    if (!map.has(key)) {
      map.set(key, { insurer: key, total: 0, clients: new Set(), bands: {}, byKind: {}, premium: 0, items: [] });
    }
    const g = map.get(key);
    const b = bandOf(r.days_left);
    g.total += 1;
    if (r.contact_id) g.clients.add(r.contact_id);
    g.bands[b] = (g.bands[b] || 0) + 1;
    g.byKind[r.kind] = (g.byKind[r.kind] || 0) + 1;
    if (r.premium) g.premium += Number(r.premium) || 0;
    g.items.push(r);
  }
  return [...map.values()]
    .map((g) => ({ ...g, clients: g.clients.size, urgent: (g.bands.vencido || 0) + (g.bands.d7 || 0) + (g.bands.d30 || 0) }))
    .sort((a, b) => b.urgent - a.urgent || b.total - a.total);
}
