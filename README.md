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
- **Archivos en el servidor, PARA SIEMPRE (v1.4):** la app sube fotos,
  videos y audios por partes (`POST /api/media/start`,
  `/api/media/chunk`, `/api/media/finish`). Al cerrar la subida, el
  servidor guarda el archivo **en Cloudinary (plan gratis, 25 GB)** y
  la URL que se guarda es la de Cloudinary: fotos de perfil y portada,
  publicaciones, historias, anuncios, mensajes y audios quedan
  guardados para siempre y se ven en vivo desde esa URL.
  `DELETE /api/media/:id` solo lo puede hacer el dueño del archivo.
  Los cambios de perfil (`POST /api/profile`) se difunden en vivo por
  WebSocket (`kind: 'profile'`) a todos los teléfonos conectados.
  **Sin Cloudinary configurado, el archivo queda en el disco del
  servidor (`uploads/`, servido por `GET /media/<id>.<ext>`) solo como
  respaldo temporal: en Render gratis el disco es efímero y los
  archivos se pierden si el servicio se reinicia o se vuelve a
  desplegar.** Ver «Cloudinary (archivos para siempre)» abajo.
- **Novedades v1.5:** confirmación de lectura (`POST /api/messages/read`,
  difunde `kind: 'read'` con `readBy`/`readAt`) y «Escribiendo…» por
  WebSocket (`kind: 'typing'`); los comentarios se difunden en vivo con
  su contador (`kind: 'comment'`, incluye respuestas, y `commentCount`
  en la respuesta); los mensajes pueden llevar el anuncio sobre el que
  preguntan (`listing: {id, title}`); **transmisiones en vivo**
  (`GET /api/lives`, `POST /api/lives`, `/end`, `/join`, `/leave`,
  `/chat`, `/like`, señalización WebRTC por `POST /api/live-signal`):
  el video va en malla WebRTC directo entre transmisor y espectadores
  (pocos espectadores a la vez; sin TURN puede fallar con NAT
  estricto; el video no se guarda); **portada y personalización de
  grupos** (`PUT /api/groups/:id`, `PUT /api/sales-groups/:id`): solo
  el creador y los administradores (en ventas, solo el creador) pueden
  poner la portada (foto o video, por URL) y el color/degradado, y el
  cambio se difunde en vivo (`kind: 'group'` / `kind: 'sales-group'`).
- **Novedades v1.6:** latido WebSocket (ping/pong cada 30 s, configurable
  con `WORDRED_HEARTBEAT_MS`): el servidor detecta y cierra las
  conexiones muertas, así un teléfono que perdió la red ya no queda
  como «en línea» y la señal de llamada (`POST /api/call-signal`) le
  responde 404 al que llama en vez de perderse en el vacío.
- **Novedades v1.8:** tienda de juegos con estadísticas reales
  (`GET /api/games/stats`, `POST /api/games/:id/play`,
  `POST /api/games/:id/rate`, `GET /api/games/:id/ratings`): cuántas
  personas jugaron cada juego y el promedio de estrellas que dio la
  gente de WordRed, contados por teléfono; y partidas online en tiempo
  real (`POST /api/games/quickmatch`, `POST /api/games/rooms` y sus
  rutas `/:id/join|score|finish|leave`, más el relevo por WebSocket con
  `kind: 'game'`): salas en memoria, emparejamiento rápido o por
  invitación, marcador en vivo y resultado con ganador. Sin internet,
  los juegos siguen en local en el teléfono.
- **Novedades v2.0:** sin cambios funcionales frente a la v1.8 — solo
  la versión, para que el servidor vaya parejo con la app v2.0.
- **Novedades v2.1:** las publicaciones de lives grabados conservan su
  marca en el servidor (`isLiveRecording`, `liveRecordingId` y
  `liveRecDurationMs` en `POST /api/posts`), para que en todos los
  teléfonos se vean como "Live grabado" en el inicio.
- **Novedades v2.9:** entrar con cuenta de Google y código de
  verificación por correo. `POST /api/auth/google` verifica el token
  de Google (firma RS256 con las claves públicas de Google, aud =
  `GOOGLE_CLIENT_ID`, emisor y caducidad) y abre la sesión con el
  correo como identidad; sin `GOOGLE_CLIENT_ID` responde 503 y nunca
  acepta el token. `POST /api/auth/email/request-code` manda un código
  de 6 dígitos al correo (SMTP por variables `SMTP_HOST`,
  `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`; sin SMTP, modo
  de prueba con `devCode`, igual que los códigos de teléfono sin
  Twilio) y `POST /api/auth/email/verify` lo comprueba con las mismas
  reglas que el código por teléfono (hash, 10 minutos, 5 intentos, 3
  por hora). Las cuentas de correo usan el correo en minúsculas como
  identidad; todo lo demás (feed, amigos, mensajes, WebSocket)
  funciona igual con cuentas de teléfono y de correo.

## Cloudinary (archivos para siempre)

Sin esto, los archivos solo viven en el disco del servidor y se
pierden al reiniciar Render. Con esto, quedan guardados para siempre
en Cloudinary (plan gratis: 25 GB de almacenamiento, sin tarjeta).

### 1. Crear la cuenta gratis

1. Entra a https://cloudinary.com/users/register/free y crea la
   cuenta con tu correo (plan Free, no pide tarjeta).
2. Al entrar al panel (Dashboard), anota el **Cloud name**: aparece
   arriba, junto a tu nombre de cuenta. Es algo como
   `mi-cuenta-123` (no es un secreto, pero no lo publiques).

### 2. Crear el preset de subida sin firmar

1. En el panel de Cloudinary, ve a **Settings** (el engrane, abajo a
   la izquierda) → **Upload**.
2. Baja hasta **Upload presets** y pulsa **Add upload preset**.
3. Ponle un nombre, por ejemplo `wordred`.
4. En **Signing Mode** elige **Unsigned** (sin firmar). Esto deja que
   el servidor suba archivos solo con el nombre del preset, sin
   secretos.
5. En **Folder** escribe `wordred` (así todos los archivos quedan
   ordenados en esa carpeta).
6. En **Resource type** (si aparece) elige **Auto**, para que acepte
   fotos, videos y audios.
7. Pulsa **Save**. Anota el nombre del preset (`wordred`).

### 3. Poner los datos en Render

1. En Render, abre el servicio `wordred-server` → **Environment**.
2. Agrega estas dos variables (con tus datos, sin comillas):
   - `CLOUDINARY_CLOUD_NAME` = tu Cloud name (ejemplo:
     `mi-cuenta-123`)
   - `CLOUDINARY_UPLOAD_PRESET` = tu preset (ejemplo: `wordred`)
3. Guarda y **redepliega** el servicio (Manual Deploy → Deploy
   latest commit). Desde ese momento, todo lo que se suba queda
   guardado para siempre en Cloudinary.
4. Para comprobarlo: sube una foto de perfil en la app y abre la
   URL de la foto (empieza por `https://res.cloudinary.com/...`).

### 4. Borrar en Cloudinary también (opcional)

Sin esto, al borrar un archivo se borra el registro y la copia
local, pero la copia en Cloudinary queda huérfana. Para borrarla
también, agrega en Render (Environment) estas dos variables, que
están en el Dashboard de Cloudinary → **API Keys** (son secretos:
nunca van en la APK ni en el repositorio):
- `CLOUDINARY_API_KEY` = tu API Key
- `CLOUDINARY_API_SECRET` = tu API Secret

### Límites honestos

- El plan gratis de Cloudinary son 25 GB de almacenamiento y 25 GB
  de ancho de banda al mes: suficiente para fotos y videos de una
  comunidad normal. Si se llena, Cloudinary avisa y se puede pasar
  a un plan de pago o borrar archivos viejos desde su panel (Media
  Library).
- Los archivos subidos ANTES de configurar Cloudinary siguen en el
  disco local y se pierden al reiniciar Render: para que queden para
  siempre, vuelve a subirlos (foto de perfil, portada) después de
  configurar Cloudinary.
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
| `MONGODB_URI` | Cadena de conexión de MongoDB Atlas (base de datos `wordred`): con ella, los datos quedan PARA SIEMPRE y sobreviven a reinicios y despliegues | No (sin ella, JSON en disco, solo para pruebas) |
| `DATA_DIR` | Carpeta de los archivos JSON (respaldo sin MongoDB) | No (`server/data`) |
| `TWILIO_SID`, `TWILIO_TOKEN`, `TWILIO_FROM` | SMS reales con Twilio | No (sin ellas, modo de prueba) |
| `GOOGLE_CLIENT_ID` | ID de cliente de OAuth (aplicación web) para verificar el inicio con Google | No (sin él, Google deshabilitado) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Correo para mandar los códigos de verificación (ej. Gmail con contraseña de aplicación) | No (sin ellas, modo de prueba con `devCode`) |

## Desplegarlo en Render

Hay una guía paso a paso en
`Despliegue-servidor-WordRed.md` (carpeta de documentos de la meta
WordRed). Resumen: subir `wordred/` a GitHub y en Render crear el
servicio desde `render.yaml` (Blueprint) o a mano como Web Service
(Root Directory `server`, Build `npm install`, Start `npm start`).

**Borrar publicaciones de verdad (v3.2):** `DELETE /api/posts/:id`
borra la publicación en el servidor (antes no existía ese endpoint y
la app solo la quitaba en su copia local, así que reaparecía al
reabrir la cuenta). Solo el autor o un administrador del grupo; la
escritura espera a MongoDB y se avisa por WebSocket (`postDeleted`)
para que los demás teléfonos la quiten en vivo.

**Borrado sin éxito falso (v3.3):** el DELETE espera la escritura en
MongoDB DE VERDAD (`saveJsonStrict`): si falla, la publicación vuelve
a su sitio en memoria y se devuelve 500, para que la app la restaure y
avise el error real. Antes el error de escritura se tragaba y el
DELETE respondía `{ok:true}` con la publicación todavía en MongoDB,
así que resucitaba al reiniciar el servidor.

**Mensajes grupales (v3.3):** nueva colección `groupChats` y endpoints
`POST /api/group-chats` (crear, con nombre opcional y al menos 2
personas), `GET /api/group-chats?phone=` (los grupos míos),
`POST /api/group-chats/:id/messages` (escribir a todos),
`POST /api/group-chats/:id/members` (agregar/quitar por lista
completa de integrantes), `POST /api/group-chats/:id/leave` (salir;
si queda vacío se borra) y `POST /api/group-chats/:id/read` (marcar
leído). Avisos `groupMessage` y `groupChatUpdated` por WebSocket a
los integrantes. Escrituras estrictas (`saveJsonStrict`), como el
DELETE: si MongoDB falla, se responde 500 y no se miente el éxito.

**Borrar un mensaje de grupo (v3.4):** `DELETE
/api/group-chats/:id/messages/:messageId` borra un mensaje de un chat
grupal en el servidor (solo quien lo escribió). Antes no existía ese
endpoint: la app solo borraba el mensaje en su propio teléfono y para
los demás seguía ahí. Escritura estricta (`saveJsonStrict`) y aviso
`groupMessageDeleted` por WebSocket para que los demás teléfonos lo
quiten en vivo. Nada más cambia en la 3.4.

**Datos para siempre (v3.1):** con `MONGODB_URI` puesta, las
publicaciones, mensajes, perfiles y todo lo demás se guardan en
MongoDB Atlas (plan gratis M0, 512 MB, sin tarjeta) y ya NO se borran
al reiniciar o volver a desplegar: aparecen en otro dispositivo y
entre usuarios. Sin `MONGODB_URI`, el servidor sigue con los JSON en
disco, que en el plan gratis de Render se pierden al reiniciar o
volver a desplegar (solo para pruebas locales). Además el plan gratis
se duerme tras 15 minutos sin uso y tarda ~30–60 s en despertar.

## Datos

Con `MONGODB_URI`, todo se guarda en MongoDB, base de datos
`wordred`, una colección por conjunto de datos (un documento
`{_id:'data', value}` por colección): `profiles`, `posts`, `stories`,
`friends`, `requests`, `groups`, `listings`, `salesGroups`, `ratings`,
`events`, `pages`, `messages`, `notifications`, `blocked`, `reports`,
`auth`, `media`, `lives`, `gameStats`, `gameRatings`. La primera vez
que se arranca con MongoDB, si el JSON en disco tiene datos, se
importan solos a MongoDB. `/api/health` dice qué almacenamiento está
usando (`storage: "mongodb"` o `"json"`, y `mongo: true/false`).
Límite honesto: un documento de MongoDB no pasa de 16 MB por conjunto
(a ~1 KB por publicación, unas 16.000 publicaciones).

Sin `MONGODB_URI`, todo se guarda en archivos JSON en `data/` (o en
`$DATA_DIR`): `auth.json`, `profiles.json`, `posts.json`, `stories.json`,
`listings.json`, `sales-groups.json`, `ratings.json`, `groups.json`,
`pages.json`, `events.json`, `messages.json`, `notifications.json`,
`blocked.json`, `reports.json`, `friends.json`.
