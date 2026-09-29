// Entrega la llave PÚBLICA de web push en tiempo de ejecución.
// Así el botón "Activar avisos" no depende de que la variable NEXT_PUBLIC_*
// haya estado presente cuando Hostinger compiló el sitio.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || process.env.VAPID_PUBLIC_KEY || "";
  return new Response(JSON.stringify({ key }), {
    status: key ? 200 : 503,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
