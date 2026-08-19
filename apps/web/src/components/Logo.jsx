import { useEffect, useState } from "react";
import { getSection } from "@/api/content";

const DEFAULT_LOGO_URL =
  "https://wjachymprdiejyzpgjrf.supabase.co/storage/v1/object/public/fotos/Logo-512x200.png";

export default function Logo({ className = "", light = false }) {
  const [logoUrl, setLogoUrl] = useState(DEFAULT_LOGO_URL);

  useEffect(() => {
    getSection("media")
      .then((data) => {
        if (data?.logoUrl) setLogoUrl(data.logoUrl);
      })
      .catch(() => {});
  }, []);

  const img = <img src={logoUrl} alt="Mazoseguros" className={`${className} object-contain`} />;

  // Sobre el fondo oscuro del footer, se envuelve en una placa clara
  // por si el logo tiene texto oscuro y se pierde de vista.
  if (light) {
    return <span className="inline-block bg-background rounded px-3 py-2">{img}</span>;
  }

  return img;
}
