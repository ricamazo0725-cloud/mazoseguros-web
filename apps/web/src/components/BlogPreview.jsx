import { Link } from "react-router-dom";

export default function BlogPreview({ posts }) {
  if (!posts?.length) return null;

  return (
    <section className="max-w-6xl mx-auto px-6 py-24">
      <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
        <div>
          <div className="eyebrow mb-3">Blog</div>
          <h2 className="font-display font-semibold text-4xl tracking-tight">Consejos y novedades</h2>
        </div>
        <Link to="/blog" className="text-sm font-semibold text-accent hover:opacity-80 focus-ring rounded">
          Ver todo el blog →
        </Link>
      </div>

      <div className="grid sm:grid-cols-3 gap-6">
        {posts.slice(0, 3).map((post) => (
          <Link key={post.id} to={`/blog/${post.slug}`} className="doc-card overflow-hidden group focus-ring block">
            {post.cover_image && (
              <div className="h-40 overflow-hidden">
                <img
                  src={post.cover_image}
                  alt={post.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            )}
            <div className="p-5">
              {post.category && <div className="eyebrow mb-2 text-xs">{post.category}</div>}
              <h3 className="font-display font-semibold text-lg leading-snug mb-2">{post.title}</h3>
              {post.excerpt && <p className="text-sm text-muted line-clamp-2">{post.excerpt}</p>}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
