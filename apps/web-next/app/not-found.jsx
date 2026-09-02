import Link from "next/link";

// Antes, en la SPA de React puro, una ruta inexistente (o un post de blog
// que no existe) igual devolvía HTTP 200 con el index.html de siempre — un
// "soft 404" que confunde a los rastreadores. Next.js sí devuelve un 404 real
// aquí, que es lo correcto.
export default function NotFound() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-24 text-center">
      <div className="eyebrow mb-3">Error 404</div>
      <h1 className="font-display font-semibold text-4xl mb-6">No encontramos esta página</h1>
      <p className="text-muted mb-8">
        Puede que el enlace esté roto o que la página se haya movido.
      </p>
      <Link href="/" className="btn-cta">
        Volver al inicio
      </Link>
    </div>
  );
}
