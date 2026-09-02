import Link from "next/link";
import { getPublishedPostsSafe } from "@/lib/blog";

export const revalidate = 3600;

// Antes /blog compartía el title/description de la home (venían fijos en
// index.html). Ahora tiene los suyos propios.
export const metadata = {
  title: "Blog",
  description: "Consejos y novedades sobre seguros de auto, hogar, salud y obras civiles en Medellín — Mazoseguros.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog de Mazoseguros",
    description: "Consejos y novedades sobre seguros de auto, hogar, salud y obras civiles en Medellín.",
    url: "/blog",
  },
};

export default async function BlogIndexPage() {
  const posts = await getPublishedPostsSafe();

  return (
    <div className="max-w-4xl mx-auto px-6 py-20">
      <div className="eyebrow mb-3">Blog</div>
      <h1 className="font-display font-semibold text-4xl sm:text-5xl tracking-tight mb-14">
        Consejos y novedades sobre seguros
      </h1>

      {posts.length === 0 && <p className="text-muted font-mono text-sm">Todavía no hay artículos publicados.</p>}

      <div className="space-y-8">
        {posts.map((post) => (
          <Link key={post.id} href={`/blog/${post.slug}`} className="doc-card p-6 flex gap-6 items-start focus-ring block">
            {post.cover_image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={post.cover_image}
                alt={post.title}
                className="w-32 h-32 object-cover rounded shrink-0 hidden sm:block"
              />
            )}
            <div>
              {post.category && <div className="eyebrow mb-2 text-xs">{post.category}</div>}
              <h2 className="font-display font-semibold text-2xl mb-2">{post.title}</h2>
              {post.excerpt && <p className="text-sm text-muted leading-relaxed">{post.excerpt}</p>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
