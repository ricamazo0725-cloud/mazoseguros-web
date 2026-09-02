// src/lib/seoHelpers.js
/**
 * Funciones auxiliares para gestionar SEO dinámico
 */

/**
 * Actualiza el título de la página
 * @param {string} title - Nuevo título
 */
export function setPageTitle(title) {
  document.title = title;
  document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
  document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', title);
}

/**
 * Actualiza la descripción de la página
 * @param {string} description - Nueva descripción
 */
export function setPageDescription(description) {
  document.querySelector('meta[name="description"]')?.setAttribute('content', description);
  document.querySelector('meta[property="og:description"]')?.setAttribute('content', description);
  document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', description);
}

/**
 * Actualiza la imagen de la página (Open Graph y Twitter)
 * @param {string} imageUrl - URL de la imagen
 */
export function setPageImage(imageUrl) {
  document.querySelector('meta[property="og:image"]')?.setAttribute('content', imageUrl);
  document.querySelector('meta[name="twitter:image"]')?.setAttribute('content', imageUrl);
}

/**
 * Actualiza la URL canónica
 * @param {string} url - URL canónica
 */
export function setCanonicalUrl(url) {
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    canonical.setAttribute('href', url);
  } else {
    const link = document.createElement('link');
    link.rel = 'canonical';
    link.href = url;
    document.head.appendChild(link);
  }
  
  // Actualiza también en Open Graph
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
  document.querySelector('meta[name="twitter:url"]')?.setAttribute('content', url);
}

/**
 * Añade Schema.json personalizado
 * @param {object} schema - Objeto del schema
 */
export function addStructuredData(schema) {
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(schema);
  document.head.appendChild(script);
}

/**
 * Actualiza múltiples meta tags de una sola vez
 * @param {object} metadata - Objeto con los meta tags
 */
export function updatePageMetadata(metadata) {
  if (metadata.title) setPageTitle(metadata.title);
  if (metadata.description) setPageDescription(metadata.description);
  if (metadata.image) setPageImage(metadata.image);
  if (metadata.url) setCanonicalUrl(metadata.url);
  if (metadata.schema) addStructuredData(metadata.schema);
}

/**
 * Genera un Schema para un producto/servicio
 * @param {object} service - Datos del servicio
 */
export function createServiceSchema(service) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: service.name,
    description: service.description,
    provider: {
      '@type': 'LocalBusiness',
      name: 'Mazoseguros',
      url: 'https://mazoseguros.com'
    }
  };
}

/**
 * Genera un Schema para un artículo/blog post
 * @param {object} post - Datos del post
 */
export function createArticleSchema(post) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.description,
    image: post.image,
    datePublished: post.publishedDate,
    dateModified: post.modifiedDate,
    author: {
      '@type': 'Organization',
      name: 'Mazoseguros'
    }
  };
}
