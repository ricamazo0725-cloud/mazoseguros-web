import Link from "next/link";
import { notFound } from "next/navigation";
import { getPostBySlug, getPublishedPostsSafe } from "@/lib/blog";
import seoConfig from "@/config/seo.json";

export const revalidate = 3600;

// Genera cada /blog/[slug] como página estática en build time. Si Supabase
// no responde (por ejemplo, en un entorno sin red o sin credenciales
// todavía) devuelve una lista vacía en vez de tumbar el build completo —
// las páginas se generarán de todas formas bajo demanda la primera vez que
// alguien las visite, gracias a ISR.
//
// OJO con "output: export" (Hostinger, ver next.config.mjs): ese modo exige
// que generateStaticParams() devuelva AL MENOS una ruta, o el build entero
// falla con "Page /blog/[slug] is missing generateStaticParams()" — incluso
// si la causa real es simplemente que todavía no hay artículos publicados.
// Por eso, si la lista viene vacía, se genera una ruta de relleno que nunca
// se linkea desde ningún lado (no aparece en el sitemap ni en /blog) y que
// simplemente responde 404 real vía notFound() más abajo. En cuanto haya al
// menos un post publicado en Supabase, esta rama deja de usarse sola.
export async function generateStaticParams() {
  try {
    const posts = await getPublishedPostsSafe();
    if (posts.length === 0) {
      return [{ slug: "__sin-articulos-publicados-aun" }];
    }
    return posts.map((post) => ({ slug: post.slug }));
  } catch {
    return [{ slug: "__sin-articulos-publicados-aun" }];
  }
}

// Antes CADA artículo del blog mostraba el mismo title/description que la
// home (venían fijos en index.html, sin importar la ruta) — así que ningún
// post podía posicionar por separado en buscadores. Esto es lo que lo
// arregla: cada post genera su propio <title>, meta description y Open
// Graph a partir de su propio contenido.
export async function generateMetadata({ params }) {
  const post = await getPostBySlug(params.slug);
  if (!post) return { title: "Artículo no encontrado" };

  const description = post.excerpt || seoConfig.description;

  return {
    title: post.title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      url: `/blog/${post.slug}`,
      images: post.cover_image ? [{ url: post.cover_image }] : undefined,
      publishedTime: post.published_at,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description,
      images: post.cover_image ? [post.cover_image] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }) {
  const post = await getPostBySlug(params.slug);

  if (!post) {
    notFound();
  }

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    image: post.cover_image,
    datePublished: post.published_at,
    dateModified: post.published_at,
    author: { "@type": "Organization", name: "Mazoseguros" },
    publisher: { "@type": "Organization", name: "Mazoseguros" },
  };

  return (
    <article className="max-w-3xl mx-auto px-6 py-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />

      <Link href="/blog" className="text-sm text-muted hover:text-accent focus-ring rounded">
        ← Blog
      </Link>

      {post.category && <div className="eyebrow mt-6 mb-3">{post.category}</div>}
      <h1 className="font-display font-semibold text-4xl sm:text-5xl tracking-tight leading-tight mb-6">
        {post.title}
      </h1>

      {post.cover_image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.cover_image} alt={post.title} className="w-full h-72 object-cover rounded mb-10" />
      )}

      <div className="prose-post text-lg text-foreground/90">
        {(post.content || "")
          .split("\n")
          .filter(Boolean)
          .map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
      </div>
    </article>
  );
}
