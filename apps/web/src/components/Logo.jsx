<<<<<<< HEAD
import { useEffect, useState } from "react";
import { getSection } from "@/api/content";

const DEFAULT_LOGO_URL =
  "https://wjachymprdiejyzpgjrf.supabase.co/storage/v1/object/public/fotos/logomazoseguros.png";

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
=======
const LOGO_URL = "https://wjachymprdiejyzpgjrf.supabase.co/storage/v1/object/public/fotos/Logo-512x200.png";

export default function Logo({ className = "", light = false }) {
  const img = <img src={LOGO_URL} alt="Mazoseguros" className={`${className} object-contain`} />;
>>>>>>> 9c3f116cb0b85f0b94feff6e8a65613361b17ca3

  // Sobre el fondo oscuro del footer, se envuelve en una placa clara
  // por si el logo tiene texto oscuro y se pierde de vista.
  if (light) {
<<<<<<< HEAD
    return <span className="inline-block bg-background rounded px-3 py-2">{img}</span>;
=======
    return (
      <span className="inline-block bg-background rounded px-3 py-2">
        {img}
      </span>
    );
>>>>>>> 9c3f116cb0b85f0b94feff6e8a65613361b17ca3
  }

  return img;
}
