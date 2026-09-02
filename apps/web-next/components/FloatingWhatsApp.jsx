const DEFAULT_WHATSAPP = "573103897969";

// Server Component — recibe el número ya resuelto por app/layout.jsx en vez
// de pedirlo al navegador después del primer render (como hacía el
// componente original).
export default function FloatingWhatsApp({ whatsapp }) {
  const wa = (whatsapp || DEFAULT_WHATSAPP).replace(/\D/g, "");
  const href = `https://wa.me/${wa}?text=${encodeURIComponent("Hola, quiero cotizar un seguro.")}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-[#25D366] shadow-lg flex items-center justify-center hover:scale-105 transition-transform focus-ring"
    >
      <svg viewBox="0 0 32 32" className="w-7 h-7" fill="white" aria-hidden="true">
        <path d="M16.02 3C9.4 3 4 8.38 4 15c0 2.29.63 4.44 1.72 6.27L3 29l7.94-2.6A12.9 12.9 0 0 0 16.02 27C22.64 27 28 21.62 28 15S22.64 3 16.02 3zm0 22.1c-2 0-3.87-.55-5.47-1.5l-.39-.23-4.71 1.55 1.54-4.58-.25-.4A9.98 9.98 0 0 1 5.9 15c0-5.58 4.55-10.1 10.12-10.1S26.14 9.42 26.14 15 22 25.1 16.02 25.1zm5.6-7.5c-.31-.15-1.82-.9-2.1-1-.28-.1-.49-.15-.69.15-.2.31-.79 1-.97 1.2-.18.21-.36.23-.67.08-.31-.15-1.3-.48-2.48-1.53-.92-.82-1.53-1.83-1.71-2.14-.18-.31-.02-.47.13-.62.14-.14.31-.36.46-.54.15-.18.2-.31.31-.51.1-.21.05-.39-.02-.54-.08-.15-.69-1.67-.95-2.28-.25-.6-.5-.52-.69-.53h-.59c-.2 0-.54.08-.82.39-.28.31-1.08 1.05-1.08 2.57s1.1 2.98 1.26 3.19c.15.21 2.17 3.32 5.27 4.65.74.32 1.31.51 1.76.65.74.24 1.41.2 1.94.13.59-.09 1.82-.74 2.08-1.46.26-.72.26-1.33.18-1.46-.08-.13-.28-.2-.59-.36z" />
      </svg>
    </a>
  );
}
