import CategoryIcon from "@/components/CategoryIcon";
import { CATEGORY_ORDER, CATEGORY_DEFAULTS } from "@/lib/categoryDefaults";
import seoConfig from "@/config/seo.json";

export default function InsuranceCategories({ categories, whatsapp }) {
  const wa = (whatsapp || seoConfig.contact.whatsapp).replace(/\D/g, "");

  return (
    <section id="seguros" className="max-w-6xl mx-auto px-6 py-24">
      <div className="eyebrow mb-3">Nuestros seguros</div>
      <h2 className="font-display font-semibold text-4xl sm:text-5xl tracking-tight max-w-lg mb-14">
        Un plan para cada parte de tu vida
      </h2>

      <div className="grid sm:grid-cols-2 gap-6">
        {CATEGORY_ORDER.map((id) => {
          const cat = { ...CATEGORY_DEFAULTS[id], ...(categories?.[id] || {}) };
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
