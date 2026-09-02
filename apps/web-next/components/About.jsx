export default function About({ data }) {
  return (
    <section id="nosotros" className="bg-surface-2 border-y border-border">
      <div className="max-w-6xl mx-auto px-6 py-24 grid md:grid-cols-[0.9fr_1.1fr] gap-12 items-center">
        <div>
          <div className="eyebrow mb-3">Quiénes somos</div>
          <h2 className="font-display font-semibold text-4xl tracking-tight leading-tight">
            {data?.heading || "Confianza y respaldo, en cada póliza"}
          </h2>
        </div>
        <div className="space-y-4 text-lg leading-relaxed text-foreground/90">
          {(
            data?.paragraphs || [
              "Construimos relaciones basadas en la confianza y el respaldo. Somos un equipo de expertos dedicados a encontrar la protección perfecta para tu familia, tu patrimonio y tu empresa.",
            ]
          ).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
    </section>
  );
}
