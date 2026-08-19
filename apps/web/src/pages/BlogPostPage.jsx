import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import { getPostBySlug } from "@/api/blog";

export default function BlogPostPage() {
  const { slug } = useParams();
  const [post, setPost] = useState(undefined); // undefined = cargando, null = no existe

  useEffect(() => {
    getPostBySlug(slug).then(setPost);
  }, [slug]);

  if (post === undefined) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-6 py-24 font-mono text-sm text-muted">Cargando…</div>
      </Layout>
    );
  }

  if (!post) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-6 py-24">
          <p className="text-muted">No encontramos este artículo.</p>
          <Link to="/blog" className="text-accent font-semibold text-sm mt-4 inline-block">
            ← Volver al blog
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <article className="max-w-3xl mx-auto px-6 py-20">
        <Link to="/blog" className="text-sm text-muted hover:text-accent focus-ring rounded">
          ← Blog
        </Link>

        {post.category && <div className="eyebrow mt-6 mb-3">{post.category}</div>}
        <h1 className="font-display font-semibold text-4xl sm:text-5xl tracking-tight leading-tight mb-6">
          {post.title}
        </h1>

        {post.cover_image && (
          <img src={post.cover_image} alt={post.title} className="w-full h-72 object-cover rounded mb-10" />
        )}

        <div className="prose-post text-lg text-foreground/90">
          {(post.content || "").split("\n").filter(Boolean).map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </article>
    </Layout>
  );
}
