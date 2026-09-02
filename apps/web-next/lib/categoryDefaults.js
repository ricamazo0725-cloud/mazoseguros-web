// Mismos valores por defecto que src/components/InsuranceCategories.jsx en
// apps/web — se muestran mientras no haya contenido editado en Supabase
// (tabla site_content, sección "categories") o si la carga falla.
export const CATEGORY_ORDER = ["auto", "propiedades", "salud", "obras-civiles"];

export const CATEGORY_DEFAULTS = {
  auto: {
    title: "Autos",
    description: "Cobertura para tu vehículo particular o de trabajo, con asistencia en carretera.",
    coverage: ["Todo riesgo o daños a terceros", "Asistencia en vía 24/7", "Amparo por robo"],
  },
  propiedades: {
    title: "Propiedades",
    description: "Protege tu casa, apartamento o local comercial ante incendio, robo o desastres naturales.",
    coverage: ["Incendio y terremoto", "Robo y hurto", "Responsabilidad civil"],
  },
  salud: {
    title: "Salud",
    description: "Planes de salud y vida complementarios, pensados para tu familia.",
    coverage: ["Medicina prepagada", "Seguro de vida", "Renta por incapacidad"],
  },
  "obras-civiles": {
    title: "Obras civiles",
    description: "Pólizas para constructoras y contratistas: cumplimiento, responsabilidad y todo riesgo.",
    coverage: ["Todo riesgo construcción", "Cumplimiento ante entidades", "Responsabilidad civil extracontractual"],
  },
};

export const CATEGORY_LABEL = Object.fromEntries(
  CATEGORY_ORDER.map((id) => [id, CATEGORY_DEFAULTS[id].title])
);
