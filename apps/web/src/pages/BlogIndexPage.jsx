import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { getPublishedPosts } from "@/api/blog";

export default function BlogIndexPage() {
  const [posts, setPosts] = useState(null);

  useEffect(() => {
    getPublishedPosts().then(setPosts);
  }, []);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-20">
        <div className="eyebrow mb-3">Blog</div>
        <h1 className="font-display font-semibold text-4xl sm:text-5xl tracking-tight mb-14">
          Consejos y novedades sobre seguros
        </h1>

        {posts === null && <p className="text-muted font-mono text-sm">Cargando…</p>}
        {posts?.length === 0 && (
          <p className="text-muted font-mono text-sm">Todavía no hay artículos publicados.</p>
        )}

        <div className="space-y-8">
          {posts?.map((post) => (
            <Link
              key={post.id}
              to={`/blog/${post.slug}`}
              className="doc-card p-6 flex gap-6 items-start focus-ring block"
            >
              {post.cover_image && (
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
    </Layout>
  );
}
