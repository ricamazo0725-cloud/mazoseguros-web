import CategoryIcon from "@/components/CategoryIcon";

const ORDER = ["auto", "propiedades", "salud", "obras-civiles"];

const DEFAULTS = {
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

export default function InsuranceCategories({ categories, whatsapp }) {
  const wa = (whatsapp || "573103897969").replace(/\D/g, "");

  return (
    <section id="seguros" className="max-w-6xl mx-auto px-6 py-24">
      <div className="eyebrow mb-3">Nuestros seguros</div>
      <h2 className="font-display font-semibold text-4xl sm:text-5xl tracking-tight max-w-lg mb-14">
        Un plan para cada parte de tu vida
      </h2>

      <div className="grid sm:grid-cols-2 gap-6">
        {ORDER.map((id) => {
          const cat = { ...DEFAULTS[id], ...(categories?.[id] || {}) };
          return (
            <div key={id} className="doc-card p-8 flex flex-col">
              <CategoryIcon id={id} className="w-10 h-10 text-accent mb-5" />
              <h3 className="font-display font-semibold text-2xl mb-2">{cat.title}</h3>
              <p className="text-sm text-muted leading-relaxed mb-5">{cat.description}</p>

              {cat.coverage?.length > 0 && (
                <ul className="text-sm space-y-1.5 mb-6">
                  {cat.coverage.map((item, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-accent mt-1">＋</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="perforated pt-5 mt-auto">
                <a
                  href={`https://wa.me/${wa}?text=${encodeURIComponent(
                    `Hola, quiero cotizar un seguro de ${cat.title.toLowerCase()}.`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-accent hover:opacity-80 focus-ring rounded"
                >
                  Cotizar {cat.title.toLowerCase()} →
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
