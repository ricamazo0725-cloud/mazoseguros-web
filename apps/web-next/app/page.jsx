import Hero from "@/components/Hero";
import InsuranceCategories from "@/components/InsuranceCategories";
import About from "@/components/About";
import BlogPreview from "@/components/BlogPreview";
import Contact from "@/components/Contact";
import { getAllSectionsSafe } from "@/lib/content";
import { getPublishedPostsSafe } from "@/lib/blog";

// ISR: la página se regenera como máximo cada hora. Un artículo nuevo
// publicado desde /admin, o un cambio de texto guardado en Supabase, tarda
// hasta 1h en reflejarse sin necesitar un redeploy. Bajar este número (p.ej.
// 60) para verlo casi al instante, a costa de más lecturas a Supabase.
export const revalidate = 3600;

export default async function HomePage() {
  const [sections, posts] = await Promise.all([getAllSectionsSafe(), getPublishedPostsSafe()]);

  return (
    <>
      <Hero data={sections?.hero} bgImage={sections?.media?.heroBg} />
      <InsuranceCategories categories={sections?.categories} whatsapp={sections?.hero?.whatsapp} />
      <About data={sections?.about} />
      <BlogPreview posts={posts} />
      <Contact data={sections?.contact} />
    </>
  );
}
