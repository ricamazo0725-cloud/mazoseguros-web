export default function Hero({ data, bgImage }) {
  return (
    <section id="top" className="relative overflow-hidden border-b border-border">
      {bgImage && (
        <>
          <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${bgImage}')` }} />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, hsl(var(--background) / 0.55) 0%, hsl(var(--background) / 0.4) 50%, hsl(var(--background) / 0.85) 100%)",
            }}
          />
        </>
      )}

      <div className="relative max-w-6xl mx-auto px-6 pt-24 pb-20">
        <div className="eyebrow mb-5">{data?.eyebrow || "Agencia de seguros en Medellín"}</div>
        <h1 className="font-display font-semibold text-5xl sm:text-6xl leading-[1.05] tracking-tight max-w-2xl">
          {data?.title || "Protege lo que más te importa"}
        </h1>
        <p className="mt-6 text-lg text-muted max-w-xl leading-relaxed">
          {data?.subtitle ||
            "Pólizas de auto, hogar, salud y obras civiles, con el respaldo de aliados como Sura, Allianz y AXA."}
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <a href={`https://wa.me/${(data?.whatsapp || "573103897969").replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="btn-cta">
            Cotiza por WhatsApp
          </a>
          <a href="#seguros" className="btn-outline">
            Ver seguros
          </a>
        </div>

        <div className="mt-14 flex flex-wrap items-center gap-6">
          <span className="text-xs text-muted font-mono uppercase tracking-widest">Aliados</span>
          {(data?.allies || ["Sura", "Allianz", "AXA"]).map((name) => (
            <span key={name} className="seal w-20 h-20 text-[10px] px-2 text-center leading-tight">
              {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
