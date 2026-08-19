const DEFAULT_WHATSAPP = "573103897969";

export default function WhatsAppButton({ whatsapp, message }) {
  const wa = (whatsapp || DEFAULT_WHATSAPP).replace(/\D/g, "");
  const href = `https://wa.me/${wa}?text=${encodeURIComponent(
    message || "Hola, quiero cotizar un seguro."
  )}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Escríbenos por WhatsApp"
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 rounded-full shadow-lg focus-ring"
      style={{ backgroundColor: "#25D366" }}
    >
      <span className="absolute inline-flex h-full w-full rounded-full bg-[#25D366] opacity-60 animate-ping" />
      <svg viewBox="0 0 32 32" className="relative w-7 h-7" fill="#ffffff">
        <path d="M16.004 3C9.377 3 4 8.373 4 15c0 2.34.653 4.527 1.786 6.393L4 29l7.81-1.746A11.93 11.93 0 0 0 16.004 27C22.63 27 28 21.627 28 15S22.63 3 16.004 3zm0 21.818a9.77 9.77 0 0 1-4.98-1.363l-.357-.212-4.63 1.036 1.06-4.51-.233-.368A9.77 9.77 0 0 1 6.18 15c0-5.42 4.41-9.818 9.824-9.818 5.414 0 9.822 4.398 9.822 9.818 0 5.42-4.408 9.818-9.822 9.818zm5.4-7.36c-.296-.148-1.75-.864-2.022-.963-.272-.099-.47-.148-.667.148-.198.297-.766.963-.94 1.16-.173.198-.346.223-.642.075-.296-.148-1.25-.46-2.38-1.467-.88-.784-1.474-1.752-1.647-2.048-.173-.297-.018-.457.13-.605.134-.133.297-.347.445-.52.148-.174.198-.298.297-.496.099-.198.05-.372-.025-.52-.074-.148-.667-1.606-.914-2.2-.24-.578-.485-.5-.667-.51l-.568-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.477 0 1.462 1.065 2.874 1.213 3.072.148.198 2.096 3.2 5.078 4.487.71.306 1.263.489 1.694.626.712.227 1.36.195 1.872.118.571-.085 1.75-.716 1.997-1.408.247-.693.247-1.286.173-1.408-.074-.123-.272-.198-.568-.347z" />
      </svg>
    </a>
  );
}
