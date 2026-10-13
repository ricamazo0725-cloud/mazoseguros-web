// Solo para rutas de servidor. Envía correos por SMTP (por ejemplo el correo de Hostinger:
// SMTP_HOST=smtp.hostinger.com, SMTP_PORT=465, SMTP_USER=notificaciones@mazoseguros.com).
import nodemailer from "nodemailer";

let transport;

export function mailConfigured() {
  const env = process.env;
  return !!(env["SMTP_HOST"] && env["SMTP_USER"] && env["SMTP_PASS"]);
}

export async function sendMail({ to, subject, text, html }) {
  const env = process.env;
  if (!mailConfigured()) throw new Error("Faltan SMTP_HOST, SMTP_USER o SMTP_PASS en el servidor");
  if (!transport) {
    const port = Number(env["SMTP_PORT"] || 465);
    transport = nodemailer.createTransport({
      host: env["SMTP_HOST"],
      port,
      secure: port === 465,
      auth: { user: env["SMTP_USER"], pass: env["SMTP_PASS"] },
    });
  }
  const from = env["MAIL_FROM"] || `Mazoseguros <${env["SMTP_USER"]}>`;
  return transport.sendMail({ from, to, subject, text, html, replyTo: env["MAIL_REPLY_TO"] || undefined });
}
