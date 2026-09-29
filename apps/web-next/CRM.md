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
