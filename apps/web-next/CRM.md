# CRM y agenda de asesorías

El panel `/admin` tiene dos pestañas nuevas:

- **CRM**: contactos que escriben por WhatsApp (los guarda n8n) o que piden cotización en la web (los crea un trigger). Tiene búsqueda, estado del contacto (nuevo, en conversación, cotizando, cliente, perdido), interés, notas y la conversación completa. La lista se refresca sola cada 20 segundos.
- **Agenda**: sirve para crear asesorías usando los horarios libres, ver la semana, cambiar el estado de cada cita y configurar el horario de atención (días, horas, almuerzo, duración y anticipación mínima). La base de datos no deja crear dos citas activas que se crucen.

## Puesta en marcha

1. En Supabase, abre el SQL Editor del **mismo proyecto que usa el sitio** y ejecuta `apps/web/supabase/crm.sql`. Se puede correr más de una vez sin problema.
2. En n8n, crea una credencial **Supabase API** con la URL del proyecto y la **service_role key**. Esa key nunca va en el código del sitio. Asígnala a los nodos `Guardar entrante`, `Guardar saliente` y `Actualizar estado` del flujo de WhatsApp. Luego pon la misma URL en el nodo `Config Supabase`.
3. Publica este código. No hace falta agregar variables de entorno nuevas.

## Funciones de la base de datos

La anon key del sitio no puede ejecutar ninguna de estas funciones. Solo las usan n8n y el admin.

| Función | Uso |
|---|---|
| `crm_log_inbound(phone, wa_name, body, type, wa_message_id, raw)` | Registra un mensaje entrante. Crea o actualiza el contacto y no duplica si Gupshup reintenta. |
| `crm_log_outbound(phone, body, wa_message_id, sent_by, status, raw)` | Registra un mensaje enviado por el bot o por un asesor. |
| `crm_update_status(wa_message_id, status, alt_id)` | Actualiza el estado de entrega (sent, delivered, read o failed). Nunca retrocede de estado. |
| `crm_import_contacts(rows, mode)` | Crea clientes desde el admin (`manual`) o los importa en bloque desde CSV/JSON (`import`). Empareja por documento y luego por teléfono; en `import` solo completa datos vacíos. Archivo: `crm_contacts_import.sql`. |
| `crm_available_slots(day)` | Devuelve los horarios libres de un día en hora de Colombia. Lo usa el admin y lo usará BotMazo para ofrecer citas. |

## App en el celular: avisos push y respuestas por WhatsApp

`/admin` se puede instalar como app (PWA) y avisa con notificaciones push cuando:

- alguien pide hablar con un asesor,
- te escribe un cliente que está en modo asesor,
- el bot agenda una cita,
- llega una cotización desde la web.

Desde la conversación puedes responder por WhatsApp. Al enviar, BotMazo se pausa en ese chat, y con el botón "devolver al bot" lo reactivas. Solo se puede escribir dentro de las 24 h desde el último mensaje del cliente, que es una regla de WhatsApp.

### Puesta en marcha

1. Ejecuta `apps/web/supabase/crm_push.sql` en Supabase. Luego llena `crm_private_config` con la URL `https://mazoseguros.com/api/push/send` y el `PUSH_SECRET`; el comando está comentado dentro del archivo.
2. En Hostinger, agrega las variables de `.env.local.example` de la sección "App del admin" y vuelve a desplegar.
3. En el celular, abre `https://mazoseguros.com/admin`:
   - **Android (Chrome):** menú ⋮ → "Instalar app", y después toca "🔕 Activar avisos".
   - **iPhone (Safari, iOS 16.4 o superior):** Compartir → "Agregar a inicio", abre la app desde el ícono y toca "🔕 Activar avisos".

## SOAT y modo asesor de BotMazo

1. En Supabase activa la extensión **pg_cron** (Database → Extensions) y ejecuta en este orden: `crm_soat.sql`, `crm_bot.sql`, `crm_leads.sql`.
2. En Hostinger agrega `GEMINI_API_KEY` (y si quieres `GUPSHUP_TPL_SOAT_ID`) y haz redeploy.
3. Los números de `crm_advisors` (se administran en la pestaña **SOAT**) que le escriben a la línea del bot entran al modo asesor:
   - foto o PDF de un SOAT → se lee con IA, se guarda en `crm_soat`, se vincula al cliente (por documento o celular; si no existe se crea) y el bot responde con los datos;
   - `ABC123` (placa), una cédula, `vencen`, `vencen 60`, `vencidos`, `fecha ABC123 31/12/2026`, `tel ABC123 3001234567`, `ayuda`;
   - `modo cliente` prueba el bot como cliente por 2 h; `modo asesor` vuelve.
4. Todos los días a las 8 a. m. (Colombia) `crm_soat_daily()` avisa los SOAT que vencen en 30, 15, 5, 1 y 0 días: aviso push al admin y WhatsApp a los asesores (texto libre si escribieron en las últimas 24 h; si no, con la plantilla).
5. El SOAT se guarda aparte de `crm_policies`: un cliente de autos puede tener su póliza de autos y además su SOAT.

## Cumpleaños

Ejecuta `crm_birthdays.sql` (y vuelve a correr `crm_contacts_import.sql` y `crm_soat.sql`). Agrega `crm_contacts.birth_date`, que se edita en la ficha del cliente, en "Nuevo cliente" o se importa con la columna `fecha_nacimiento`. Cada día a las 8 a. m. llega un aviso push con quienes cumplen años; en la lista del CRM aparece 🎂 y en el modo asesor del bot `cumpleaños` (o `cumpleaños 30`) lista los próximos.

## Recordatorios al cliente: SOAT y tecnomecánica

1. Ejecuta `crm_vehicle_reminders.sql` y luego vuelve a correr `crm_soat.sql`.
2. En Hostinger agrega `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (correo) y `GUPSHUP_TPL_VENCIMIENTO_ID` (WhatsApp) y haz redeploy.
3. La tecnomecánica se registra en la pestaña **SOAT → 🔧 Tecnomecánica**, en la ficha del cliente o por el bot con `rtm ABC123 01/04/2027`.
4. Cada día a las 9 a. m. se avisa al cliente 30, 15 y 3 días antes del vencimiento por WhatsApp (plantilla; texto libre si escribió en las últimas 24 h) y por correo. Todo queda en `crm_notifications` (“📨 Recordatorios enviados” en la pestaña SOAT). Si no salió por ningún canal se reintenta al día siguiente.
5. En la ficha del cliente se pueden desactivar sus recordatorios; en cada tarjeta hay **📨 Enviar recordatorio** para mandarlo ya.
