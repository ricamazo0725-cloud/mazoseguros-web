// Servidor Node.js mínimo para correr esta app en el modo "Node.js Apps" de
// Hostinger. Ese hosting necesita un archivo de entrada real (ej. server.js)
// que arranque con `node server.js` — no le sirve el comando `next start`
// directamente, porque ese es un binario de CLI (node_modules/.bin/next),
// no un script que se pueda apuntar como "Archivo de entrada" en hPanel.
//
// Es el patrón de servidor personalizado que recomienda la propia
// documentación de Next.js para este tipo de despliegue. No cambia nada del
// comportamiento de la app (rutas, ISR, metadata, etc.) — solo la forma en
// que el proceso arranca y escucha el puerto que Hostinger le asigne.
import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
// Hostinger inyecta el puerto real vía la variable de entorno PORT — 3000
// es solo el valor por defecto para correr localmente sin esa variable.
const port = Number(process.env.PORT) || 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  })
    .once("error", (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, hostname, () => {
      console.log(`> Mazoseguros (Next.js) listo en http://${hostname}:${port}`);
    });
});
