// Server Component. En apps/web (React puro) el logo se pedía a Supabase
// DESPUÉS de que la página cargara en el navegador (useEffect), así que el
// primer HTML que veía cualquier rastreador nunca incluía el logo real —
// solo el valor por defecto, y solo tras ejecutar JavaScript. Aquí el valor
// ya viene resuelto desde el servidor (ver app/layout.jsx) y sale en el HTML
// inicial.
const DEFAULT_LOGO_URL =
  "https://wjachymprdiejyzpgjrf.supabase.co/storage/v1/object/public/fotos/Logo-512x200.png";

export default function Logo({ className = "", light = false, logoUrl }) {
  // eslint-disable-next-line @next/next/no-img-element
  const img = <img src={logoUrl || DEFAULT_LOGO_URL} alt="Mazoseguros" className={`${className} object-contain`} />;

  if (light) {
    return <span className="inline-block bg-background rounded px-3 py-2">{img}</span>;
  }

  return img;
}
