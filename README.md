# Servidor de WordRed

Servidor propio de WordRed (Node.js + Express + WebSocket). Guarda en
archivos JSON dentro de `data/` y sincroniza la app en tiempo real.

## Qué hace

- **Registro por teléfono:** código de 6 dígitos (`POST /api/auth/request-code`,
  `POST /api/auth/verify`). Con Twilio configurado el código llega por SMS;
  sin Twilio el servidor lo muestra en su registro (`[DEV]`) y la app lo
  muestra en la pantalla de vinculación (modo de prueba). Al verificar,
  el servidor devuelve un **token válido 30 días** que la app guarda y
  envía en cada petición (`Authorization: Bearer <token>`).
- **Perfiles, publicaciones** (texto, foto, video, enlace, encuesta, audio
  con portada, imagen con canción, video con audio automático, anuncios),
  **reacciones, comentarios, compartir, guardar**.
- **Historias 24 h** con personalización, canción y edición de video;
  reacciones, comentarios y compartidos de historias.
- **Amigos, grupos** (hasta 3 administradores, solicitudes, fijar),
  **páginas y empresas** (anuncios marcados «Anuncio»).
- **Mensajes** 1:1 en tiempo real por WebSocket, con archivos de todo tipo
  y mensajes de voz.
- **Marketplace:** anuncios (WhatsApp, marca, negociable, entrega,
  ubicación, 24 categorías), grupos de ventas, perfil de ventas con
  valoraciones por estrellas.
- **Notificaciones:** al publicar se avisa en el servidor a los amigos
  (seguidos), a los seguidores de la página y a los miembros del grupo;
  también hay avisos de reacciones, comentarios, compartidos, solicitudes
  y mensajes. `GET /api/notifications?phone=...`
- **Llamadas dentro de la app:** señalización WebRTC
  (`POST /api/call-signal`, tipos offer/answer/ice/hangup/reject/busy).
  El audio/video va punto a punto entre los teléfonos; el servidor solo
  pasa los mensajes de señalización.
- **Bloqueos y reportes** (`POST /api/block`, `/api/unblock`,
  `/api/reports`).
- **Edición de publicaciones** con tope de 5 (`PUT /api/posts/:id`).
- **Eventos** con asistencia, **búsqueda** (`GET /api/search?q=...`).

## Probarlo en local

```bash
cd server
npm install
npm start
# Servidor en http://localhost:3000 — prueba: curl http://localhost:3000/api/health
```

Para que la app se conecte en local, pon en la app
**Ajustes → Servidor** la dirección `http://TU_IP_LOCAL:3000`
(la IP de tu computadora en la misma Wi-Fi, no `localhost`, porque la
app corre en el teléfono). Después pulsa
**«Vincular este teléfono con el servidor»** y escribe el código que
la app muestra (modo de prueba sin Twilio).

## Variables de entorno

| Variable | Para qué | Obligatoria |
| --- | --- | --- |
| `PORT` | Puerto (Render lo pone solo) | No (3000) |
| `DATA_DIR` | Carpeta de los archivos JSON | No (`server/data`) |
| `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM` | SMS reales con Twilio | No (sin ellas, modo de prueba) |

## Desplegarlo en Render

Hay una guía paso a paso en
`Despliegue-servidor-WordRed.md` (carpeta de documentos de la meta
WordRed). Resumen: subir `wordred/` a GitHub y en Render crear el
servicio desde `render.yaml` (Blueprint) o a mano como Web Service
(Root Directory `server`, Build `npm install`, Start `npm start`).

**Límite honesto:** en el plan gratis de Render el disco es efímero y
los datos se pierden al reiniciar o volver a desplegar. Para guardarlos
de verdad hace falta un disco persistente (plan de pago) o una base de
datos externa. Además el plan gratis se duerme tras 15 minutos sin uso
y tarda ~30–60 s en despertar.

## Datos

Todo se guarda en archivos JSON en `data/` (o en `$DATA_DIR`):
`auth.json`, `profiles.json`, `posts.json`, `stories.json`,
`listings.json`, `sales-groups.json`, `ratings.json`, `groups.json`,
`pages.json`, `events.json`, `messages.json`, `notifications.json`,
`blocked.json`, `reports.json`, `friends.json`.
