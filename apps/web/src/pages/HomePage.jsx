import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import Hero from "@/components/Hero";
import InsuranceCategories from "@/components/InsuranceCategories";
import About from "@/components/About";
import BlogPreview from "@/components/BlogPreview";
import Contact from "@/components/Contact";
import { getAllSections } from "@/api/content";
import { getPublishedPosts } from "@/api/blog";

export default function HomePage() {
  const [sections, setSections] = useState(null);
  const [posts, setPosts] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getAllSections(), getPublishedPosts()])
      .then(([sectionsData, postsData]) => {
        setSections(sectionsData);
        setPosts(postsData);
      })
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <Layout>
        <div className="max-w-6xl mx-auto px-6 py-24 font-mono text-sm text-muted">
          No se pudo cargar el contenido: {error}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Hero data={sections?.hero} bgImage={sections?.media?.heroBg} />
      <InsuranceCategories categories={sections?.categories} whatsapp={sections?.hero?.whatsapp} />
      <About data={sections?.about} />
      <BlogPreview posts={posts} />
      <Contact data={sections?.contact} />
    </Layout>
  );
}
