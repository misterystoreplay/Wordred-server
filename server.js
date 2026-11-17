/**
 * Servidor propio de WordRed — Node.js + Express + WebSocket
 * ------------------------------------------------------------------
 * Funciones: registro por número de teléfono con código de 6 dígitos,
 * perfiles, publicaciones, reacciones, comentarios, compartir,
 * historias (24 h), amistades, grupos, mensajes en tiempo real por
 * WebSocket, notificaciones, búsqueda, anuncios del Marketplace,
 * eventos, páginas y encuestas en las publicaciones (v1.1).
 * v1.2: grupos de ventas, perfil de ventas con valoraciones, avisos de
 * publicaciones de seguidos, archivos y mensajes de voz en el chat,
 * y señalización WebRTC para llamadas dentro de la app.
 * v1.2 ola 12: al publicar se avisa en el servidor a los amigos
 * (amigos = seguidos), seguidores de la página y miembros del grupo;
 * la app se vincula con el servidor con un token (código de 6 dígitos)
 * y todo lo que se publica se sincroniza en tiempo real por WebSocket.
 * v1.4: el servidor guarda los archivos (fotos de perfil y portada,
 * fotos/videos de publicaciones, historias, anuncios, mensajes y
 * audios) y los sirve por URL pública; los cambios de perfil se
 * difunden en vivo por WebSocket. Almacenamiento PERMANENTE con
 * Cloudinary (plan gratis): si CLOUDINARY_CLOUD_NAME y
 * CLOUDINARY_UPLOAD_PRESET están configurados, el archivo queda
 * guardado para siempre en Cloudinary y la URL que se guarda es la
 * de Cloudinary. Sin configurar, el archivo queda en el disco del
 * servidor como respaldo TEMPORAL: en Render gratis el disco es
 * efímero y se pierde si el servicio se reinicia o se vuelve a
 * desplegar. Los secretos (API_KEY/SECRET, solo para borrar en
 * Cloudinary) nunca van en la APK: solo como variables de entorno
 * del servidor.
 * v1.8: tienda de juegos con estadísticas reales (cuántas personas
 * jugaron cada juego y el promedio de estrellas que dio la gente de
 * WordRed, contados por teléfono) y partidas online en tiempo real
 * (salas en memoria, emparejamiento rápido o por invitación, marcador
 * y movimientos por WebSocket; si un jugador se desconecta, el rival
 * gana por abandono).
 * v1.5: recibos de lectura con hora (POST /api/messages/read marca
 * readAt y difunde {kind:'read'} al remitente), indicador de
 * escritura por WebSocket (el cliente manda {kind:'typing'} y el
 * servidor lo retransmite al destinatario), y difusión en vivo de
 * comentarios ({kind:'comment'} con el contador total, que incluye
 * las respuestas) al comentar, responder o borrar.
 * v2.9: entrar con cuenta de Google y código de verificación por
 * correo. POST /api/auth/google verifica el token de Google (firma
 * RS256 con las claves públicas de Google, aud = GOOGLE_CLIENT_ID,
 * iss y caducidad) y abre la sesión con el correo como identidad; sin
 * GOOGLE_CLIENT_ID configurado, Google queda deshabilitado y el
 * servidor NUNCA acepta un token sin verificar. POST
 * /api/auth/email/request-code manda un código de 6 dígitos al correo
 * (SMTP por variables SMTP_HOST/SMTP_USER/SMTP_PASS; sin SMTP, modo
 * de prueba con devCode, igual que los códigos de teléfono) y POST
 * /api/auth/email/verify lo comprueba con las mismas reglas que el
 * código por teléfono (hash SHA-256, 10 minutos, 5 intentos, 3 por
 * hora). Las cuentas de correo usan el correo (en minúsculas) como
 * identidad, igual que las de teléfono usan el número: normPhone
 * deja pasar los correos sin tocarlos para que todo lo demás (feed,
 * amigos, mensajes, WebSocket) funcione igual con ambas.
 *
 * v3.1: los datos quedan PARA SIEMPRE en MongoDB (variable
 * MONGODB_URI, base de datos "wordred", una colección por conjunto de
 * datos). Sin MONGODB_URI, el servidor sigue con los JSON en disco
 * (carpeta data/) como antes, solo para pruebas locales.
 *
 * v3.2: DELETE /api/posts/:id borra una publicación de verdad en el
 * servidor (antes no existía y la app solo la quitaba en local, así
 * que reaparecía al reabrir). Solo el autor o un administrador del
 * grupo; escritura crítica en MongoDB y aviso 'postDeleted' por
 * WebSocket para que los demás teléfonos la quiten en vivo.
 *
 * v3.3: el DELETE ya no miente. Antes, si la escritura en MongoDB
 * fallaba, saveJson se tragaba el error (.catch que resolvía) y el
 * DELETE respondía {ok:true} con la publicación todavía en MongoDB:
 * la app la borraba en local y decía "Publicación borrada.", pero al
 * reiniciar el servidor la publicación volvía (initStore la leía de
 * MongoDB) y reaparecía al reabrir la cuenta. Ahora el DELETE espera
 * la escritura DE VERDAD (saveJsonStrict) y si falla devuelve 500 y
 * deja la publicación en su sitio, para que la app la restaure y avise
 * el error real. También se corrige que saveMongoDataset resolviera
 * en silencio cuando mongoDb era null.
 *
 * v3.3 (también): mensajes grupales. Nueva colección groupChats y
 * endpoints POST /api/group-chats (crear), GET /api/group-chats
 * (los míos), POST /api/group-chats/:id/messages (escribir a todos),
 * POST /api/group-chats/:id/members (agregar/quitar por lista
 * completa), POST /api/group-chats/:id/leave (salir; si queda vacío
 * se borra) y POST /api/group-chats/:id/read (marcar leído). Avisos
 * 'groupMessage' y 'groupChatUpdated' por WebSocket a los
 * integrantes. Escrituras estrictas (saveJsonStrict), como el DELETE.
 *
 * v3.4: borrar un mensaje de un chat grupal. Nuevo endpoint DELETE
 * /api/group-chats/:id/messages/:messageId (solo quien lo escribió;
 * escritura estricta y aviso 'groupMessageDeleted' por WebSocket).
 * Antes no existía: la app solo borraba el mensaje de grupo en su
 * propio teléfono y para los demás seguía ahí. Nada más cambia.
 *
 * v3.5: actualización de la aplicación. Nuevo endpoint GET
 * /api/app/latest (devuelve la última versión: versionName,
 * versionCode, url de descarga y notas) y GET /app/WordRed.apk (sirve
 * el APK real). La versión vive en app-version.json junto al APK en el
 * repo: al sacar una versión nueva se reemplaza el archivo WordRed.apk
 * y se actualiza app-version.json (ver README). Sin esos archivos, el
 * endpoint responde que no hay información: la app no inventa
 * actualizaciones. Nada más cambia en la 3.5.
 *
 * v3.6: la URL de descarga de GET /api/app/latest ya es https. La 3.5
 * la construía con req.protocol, que detrás del proxy de Render es
 * http; Render redirige a https con 301 y el descargador de la app
 * (HttpURLConnection) no sigue redirecciones con cambio de protocolo,
 * así que al presionar Instalar la descarga fallaba con "No se pudo
 * descargar la actualización.". Ahora se usa el protocolo real detrás
 * del proxy (X-Forwarded-Proto) y para el host de Render siempre https.
 * La app 1.5.19 también normaliza la URL a https y sigue las
 * redirecciones a mano. Nada más cambia en la 3.6.
 *
 * v3.7: visitas al perfil — POST /api/profile-views registra quién vio
 * el perfil de otra persona (un registro por visitante y perfil visto:
 * si vuelve, solo se actualiza la fecha; verse el propio perfil no se
 * registra y los invitados tampoco) y GET /api/profile-views/me
 * devuelve las visitas del propio perfil (cantidad, último visitante y
 * lista). Nueva colección `profileViews` (respaldo en
 * profile-views.json). Nada más cambia en la 3.7.
 *
 * v3.8: visitas a historias, duetos y vistas de publicaciones —
 * POST /api/story-views registra quién vio una historia (un registro
 * por visitante y historia; ver la propia no se registra) y
 * GET /api/story-views/:storyId devuelve las visitas solo al autor;
 * POST /api/posts acepta y conserva `duetOf` (id del post original +
 * autor, solo si ese post existe); POST /api/posts/:id/view registra
 * una vista real por visitante (ver la propia no cuenta, invitados
 * tampoco) y GET /api/posts/:id/stats devuelve vistas, me gusta,
 * comentarios y compartidas solo al autor. Nuevas colecciones
 * `storyViews` (respaldo story-views.json) y `postViews` (respaldo
 * post-views.json).
 * Además en 3.8: encuestas en historias (`storyPollVotes`,
 * POST /api/stories/:id/poll-vote; la encuesta viaja con la historia
 * según quién pide); retos de Shorts (`challenge` en posts +
 * GET /api/challenges); reacciones rápidas a historias
 * (`storyReactions`, POST /api/stories/:id/react +
 * GET /api/stories/:id/reactions, solo el autor); verificación de
 * cuenta automática por criterios (GET/POST /api/verification/status
 * y /request; `verified` en el perfil); comentarios con foto/video y
 * menciones con @ (media/mediaUrl/mentions en el comentario, plural
 * /api/posts/:id/comments como alias); amigos cercanos (`closeFriends`,
 * audience 'close' en historias); regalos virtuales en lives
 * (`liveGifts`, POST/GET /api/lives/:id/gift(s), sin dinero);
 * salas de audio en vivo (`audioRooms`); torneos semanales
 * (`tournaments`, GET /api/tournaments/current +
 * POST /api/tournaments/:id/score, mejor puntaje por jugador);
 * lista de deseos (`wishlists`); estado de ánimo (`mood` en posts);
 * invitado en vivo (coHost + /invite + /invite/respond, mensajes
 * liveInvite/liveInviteAccepted/liveInviteDeclined); lugar en la
 * publicación (`place`); encuesta con foto (`photoPoll` en posts +
 * POST /api/posts/:id/vote + GET /api/posts/:id/votes, colección
 * `postVotes`); enlace en la historia (`link`); nota en el perfil y
 * canción del día y portada de destacadas (`note`, `songOfTheDay`,
 * `pinnedCover` en POST /api/profile); silenciados (`muted`, y
 * notify() no crea el aviso si el destinatario silenció al
 * remitente); mensajes temporales (`conversationSettings`,
 * POST /api/conversations/:id/disappearing + poda al leer);
 * cupones (`coupons`, POST /api/coupons + GET /api/coupons?seller= +
 * POST /api/coupons/:code/apply). Colecciones nuevas en total: 13
 * (storyPollVotes, storyReactions, closeFriends, liveGifts,
 * audioRooms, tournaments, wishlists, postVotes, muted,
 * conversationSettings, coupons, más storyViews y postViews).
 * Nada más cambia en la 3.8.
 *
 * v3.9: cartelera de estrenos de cine. Nuevo endpoint público
 * GET /api/billboard (sin autenticación, como /api/app/latest) que
 * devuelve la lista actual de películas (título, fecha de estreno,
 * portada y tráiler). La lista vive en movies.json en la raíz del
 * repo: al salir películas nuevas se actualiza ese archivo y la
 * cartelera de la app cambia sin una versión nueva de la app. Sin
 * el archivo o con la lista vacía responde ok:false: la app no
 * inventa películas y usa su lista fija. Nada más cambia en la 3.9.
 *
 * v4.0: cartelera de estrenos de juegos. Igual que la de cine (v3.9):
 * GET /api/games-billboard es público y la lista vive en games.json
 * en la raíz del repo (título, fecha de estreno, portada y tráiler).
 * Nada más cambia en la 4.0.
 *
 * v4.1: promociones — POST /api/posts acepta y conserva `promoted`
 * (booleano: true = publicación promocionada, insignia «Promocionado»
 * + primer lugar en el inicio de TODOS los teléfonos; la app 1.5.47
 * ya lo lee en post.promoted) y PUT /api/posts/:id acepta cambiarlo
 * en una publicación ya publicada. Un valor que no sea booleano se
 * rechaza con 400 y nunca se guarda; las publicaciones normales
 * quedan con promoted:false. Activar o quitar la promoción NO gasta
 * una de las 5 ediciones (una promoción pagada nunca se bloquea por
 * haber editado el texto 5 veces). Nada más cambia en la 4.1.
 *
 * v4.2: dramas cortos — GET /api/kdramas es público y la lista vive en
 * kdramas.json en la raíz del repo (serie y capítulos con su video de
 * YouTube). Cada 3 meses se cambia ese archivo y los dramas rotan sin
 * una versión nueva de la app. Nada más cambia en la 4.2.
 *
 * v4.5: GET /api/kdramas deja pasar el campo `video` opcional de cada
 * capítulo (URL https de Cloudinary). Antes el endpoint lo quitaba al
 * limpiar la lista, así que los videos nunca llegaban al teléfono.
 * Nada más cambia en la 4.5.
 *
 * v4.6: GET /api/kdramas acepta dos formas de catálogo: series de
 * DramaBox (portada, totalEps y eps con videoId de YouTube) y dramas
 * originales de WordRed (sinopsis y capítulos con texto e imagen).
 * Nada más cambia en la 4.6.
 *
 * v4.4: la aprobación de promociones ya NO usa la clave de creador
 * (WordRed Creador no existe). Las rutas de dueño (GET
 * /api/promotions/pending + POST /api/promotions/:id/approve y
 * /reject + POST /api/creator-config) ahora exigen la cuenta
 * principal: quien llama debe estar autenticado con su token y su
 * correo verificado debe ser el de la variable OWNER_EMAIL (Render).
 * Sin OWNER_EMAIL, 503; con otra cuenta, 403; sin sesión, 401. El
 * correo se conoce porque el token de Google verificado trae el
 * correo y el servidor lo usa como clave de la cuenta (igual que el
 * teléfono para las cuentas por SMS). CREATOR_KEY queda sin uso y
 * ya no se lee en el código (solo queda mencionada en el historial
 * de la 4.3 de abajo). (3) /api/kdramas valida el nuevo
 * esquema de dramas originales (capítulos con texto e imagen, sin
 * videoId de YouTube). (4) Juego destacado Fantore Resurrección: GET
 * /api/featured-game (la ficha vive en featured-game.json en la raíz
 * del repo: datos del juego + sus 8 capturas reales; devuelve además
 * las estadísticas reales del juego — calificación media y conteo del
 * sistema de calificaciones de juegos que ya existe, 0 y 0 si nadie ha
 * calificado) y GET /app/Fantore-Resurreccion.apk (sirve el APK del
 * juego para instalarlo desde WordRed cuando no está instalado).
 * Nada más cambia en la 4.4.
 *
 * v4.3: WordRed Creador — (1) solicitudes de promoción: la app 1.5.53
 * ya NO activa la promoción sola con «Ya pagué»; manda POST
 * /api/promotions/request y el creador la aprueba o rechaza desde su
 * app (GET /api/promotions/pending + POST /api/promotions/:id/approve
 * y /reject, solo con la clave de creador en el encabezado
 * x-creator-key). Aprobar pone post.promoted=true por el camino de
 * siempre, sin gastar una de las 5 ediciones; rechazar deja la
 * publicación sin promocionar. Quien promociona ve el estado de SU
 * solicitud en GET /api/promotions/mine. Las solicitudes viven en la
 * colección `promotion_requests`. (2) Configuración del creador: GET
 * /api/creator-config (público) devuelve el orden y tamaño global de
 * las secciones del Inicio; POST /api/creator-config (solo creador)
 * lo guarda en la colección `creator_config` (un solo documento). La
 * clave del creador se lee de la variable CREATOR_KEY (Render); sin
 * ella o con clave incorrecta/faltante, las rutas de creador fallan
 * cerradas (503/401) y NUNCA dejan pasar. Nada más cambia en la 4.3.
 *
 * Almacenamiento: MongoDB con MONGODB_URI; sin ella, JSON en disco
 * (carpeta data/).
 *
 * SMS: si existen TWILIO_SID, TWILIO_TOKEN y TWILIO_FROM, el código se
 * manda por SMS real con Twilio. Si no, el servidor devuelve el código
 * por el canal de respaldo (campo devCode, solo para pruebas) y lo
 * escribe en el log con marca [DEV]. En producción con Twilio, los
 * códigos NUNCA se escriben en los logs.
 *
 * Seguridad básica:
 *  - Los códigos se guardan como hash SHA-256 (nunca en claro),
 *    expiran a los 10 minutos y admiten 5 intentos como máximo.
 *  - Límite de 3 códigos por hora y número (anti-abuso).
 *  - Sesiones con token aleatorio (32 bytes) que expira a los 30 días.
 *  - Los logs nunca incluyen códigos, tokens ni contenido de mensajes.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const express = require('express');
const WebSocket = require('ws');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const REGISTER_PER_HOUR = 3;
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const STORY_TTL_MS = 24 * 60 * 60 * 1000;

const TWILIO = {
  sid: process.env.TWILIO_SID || '',
  token: process.env.TWILIO_TOKEN || '',
  from: process.env.TWILIO_FROM || ''
};
const SMS_ENABLED = !!(TWILIO.sid && TWILIO.token && TWILIO.from);

/* ---- correo (v2.9): códigos de verificación por correo ----
   SMTP por variables de entorno (SMTP_HOST, SMTP_PORT, SMTP_USER,
   SMTP_PASS, SMTP_FROM). Sin SMTP configurado, el código se devuelve
   por el canal de respaldo (campo devCode, solo para pruebas), igual
   que los códigos de teléfono sin Twilio. La contraseña de correo
   NUNCA va en la APK ni en el código: solo como variable de entorno
   del servidor. */
const SMTP = {
  host: (process.env.SMTP_HOST || '').trim(),
  port: parseInt(process.env.SMTP_PORT || '587', 10) || 587,
  secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
  user: (process.env.SMTP_USER || '').trim(),
  pass: process.env.SMTP_PASS || '',
  from: (process.env.SMTP_FROM || '').trim()
};
const EMAIL_ENABLED = !!(SMTP.host && SMTP.user && SMTP.pass);
let mailer = null;
function getMailer() {
  if (mailer) return mailer;
  if (!EMAIL_ENABLED) return null;
  try {
    const nodemailer = require('nodemailer');
    mailer = nodemailer.createTransport({
      host: SMTP.host, port: SMTP.port, secure: SMTP.secure,
      auth: { user: SMTP.user, pass: SMTP.pass }
    });
  } catch (e) { console.log('[email] no se pudo cargar el envío de correo: ' + e.message); return null; }
  return mailer;
}
async function sendEmail(to, subject, text) {
  const m = getMailer();
  if (!m) return false;
  try {
    await m.sendMail({ from: SMTP.from || SMTP.user, to, subject, text });
    return true;
  } catch (e) { console.log('[email] no se pudo mandar el correo a ' + to + ': ' + e.message); return false; }
}

/* ---- inicio con Google (v2.9): verificación del token ----
   El ID de cliente de OAuth (aplicación web) va en GOOGLE_CLIENT_ID.
   Sin él, el inicio con Google está deshabilitado y ningún token se
   acepta. El token se verifica de verdad: firma RS256 con las claves
   públicas de Google (JWKS), aud = el ID de cliente, iss de Google,
   caducidad y correo verificado. GOOGLE_JWKS_URL solo existe para
   las pruebas (apunta a un servidor falso en local); en producción
   no se pone. */
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_ENABLED = !!GOOGLE_CLIENT_ID;
const GOOGLE_JWKS_URL = (process.env.GOOGLE_JWKS_URL || '').trim() || 'https://www.googleapis.com/oauth2/v3/certs';
let jwksCache = { keys: null, at: 0 };
async function fetchJwks() {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600000) return jwksCache.keys;
  const res = await fetch(GOOGLE_JWKS_URL);
  if (!res.ok) throw new Error('Google JWKS: HTTP ' + res.status);
  const data = await res.json();
  if (!data || !Array.isArray(data.keys)) throw new Error('Google JWKS inválido');
  jwksCache = { keys: data.keys, at: Date.now() };
  return data.keys;
}
function b64urlToBuffer(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}
/* Verifica un token de ID de Google y devuelve su contenido
   {email, name, picture, sub} o lanza un error si no es válido. */
async function verifyGoogleIdToken(idToken) {
  if (!GOOGLE_ENABLED) throw new Error('El inicio con Google no está configurado en el servidor.');
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('Token de Google inválido.');
  let header, payload;
  try {
    header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
    payload = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  } catch (e) { throw new Error('Token de Google inválido.'); }
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Token de Google inválido.');
  const keys = await fetchJwks();
  const jwk = keys.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Token de Google inválido.');
  const pub = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const okSig = crypto.createVerify('RSA-SHA256').update(parts[0] + '.' + parts[1]).verify(pub, b64urlToBuffer(parts[2]));
  if (!okSig) throw new Error('Token de Google inválido.');
  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') throw new Error('Token de Google inválido.');
  if (payload.aud !== GOOGLE_CLIENT_ID) throw new Error('Token de Google inválido.');
  if (!payload.exp || payload.exp * 1000 < Date.now()) throw new Error('El token de Google caducó.');
  if (!payload.email || payload.email_verified !== true) throw new Error('El correo de Google no está verificado.');
  return { email: String(payload.email).toLowerCase(), name: String(payload.name || ''), picture: String(payload.picture || ''), sub: String(payload.sub || '') };
}

fs.mkdirSync(DATA_DIR, { recursive: true });
/* Archivos subidos (v1.4): MEDIA_DIR guarda los archivos ya terminados
   y MEDIA_TMP_DIR los trozos mientras se suben. */
const MEDIA_DIR = process.env.MEDIA_DIR || path.join(__dirname, 'uploads');
const MEDIA_TMP_DIR = path.join(DATA_DIR, 'uploads_tmp');
fs.mkdirSync(MEDIA_DIR, { recursive: true });
fs.mkdirSync(MEDIA_TMP_DIR, { recursive: true });

function loadJson(name, fallback) {
  try {
    const p = path.join(DATA_DIR, name);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) { console.error('[store] no se pudo leer ' + name + ':', e.message); }
  return fallback;
}
function saveJson(name, data) {
  /* v3.1: con MongoDB listo, el conjunto se escribe en su colección
     (un documento {_id:'data', value}); sin MongoDB, en el JSON de
     antes. La escritura a MongoDB es asíncrona: se sigue sin esperar
     (igual que antes) y la promesa queda en pendingWrites para poder
     esperarla en los caminos críticos y al apagar el servidor. */
  if (mongoReady) {
    const p = saveMongoDataset(name, data).catch(e => console.error('[store] no se pudo guardar en MongoDB ' + name + ':', e.message));
    pendingWrites.add(p);
    p.then(() => pendingWrites.delete(p), () => pendingWrites.delete(p));
    return p;
  }
  try { fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2)); }
  catch (e) { console.error('[store] no se pudo guardar ' + name + ':', e.message); }
  return undefined;
}

let profiles = loadJson('profiles.json', {});       // phone -> {phone, name, bio, photo, cover, createdAt, isDemo}
let posts = loadJson('posts.json', []);             // [{id, author, text, media, mediaType, privacy, groupId, sharedFrom, createdAt, likes:{}, comments:[], shares:[], savedBy:[]}]
let stories = loadJson('stories.json', []);         // [{id, author, text, media, mediaType, createdAt, views:[]}]
let friends = loadJson('friends.json', {});         // phone -> [phone...]
let requests = loadJson('requests.json', []);       // [{id, from, to, status, createdAt}]
let groups = loadJson('groups.json', []);           // [{id, name, desc, creator, members:[], createdAt}]
let listings = loadJson('listings.json', []);       // [{id, seller, title, price, category, condition, desc, city, photos:[], whatsapp, brand, negotiable, delivery, salesGroupId, status, createdAt, savedBy:[]}]
let salesGroups = loadJson('sales-groups.json', []); // [{id, name, desc, photo, category, rules, creator, members:[], createdAt}]
let ratings = loadJson('ratings.json', []);         // [{id, seller, rater, stars, comment, createdAt}]
let events = loadJson('events.json', []);           // [{id, creator, name, desc, date, time, place, cover, attendees:{}, status, createdAt}]
let pages = loadJson('pages.json', []);             // [{id, name, category, desc, photo, creator, followers:[], createdAt}]
let messages = loadJson('messages.json', []);       // [{id, from, to, text, media, mediaType, createdAt, readBy:[]}]
let groupChats = loadJson('group-chats.json', []); // v3.3: chats grupales [{id, name, participants:[phone], messages:[], unread:{}, createdAt, createdBy, updatedAt}]
let notifications = loadJson('notifications.json', []); // [{id, type, from, to, text, refId, createdAt, read}]
let blocked = loadJson('blocked.json', {});              // bloqueos (v1.2, ola 7): bloqueador -> [bloqueados]
let reports = loadJson('reports.json', []);              // reportes de cuentas (v1.2, ola 7)
let auth = loadJson('auth.json', {});               // phone -> {codeHash, codeAt, codeAttempts, token, tokenAt, verified}
let media = loadJson('media.json', {});             // id -> {id, owner, name, type, ext, size, createdAt} (v1.4)
let lives = loadJson('lives.json', []);
let gameStats = loadJson('games.json', { plays: {}, players: {} }); // {plays:{gameId:n}, players:{gameId:{phone:true}}} (v1.8)
let gameRatings = loadJson('game-ratings.json', []); // [{gameId, phone, stars, comment, createdAt}] (v1.8)              // [{id, host, title, createdAt, endedAt, viewers:[], chat:[], reactions:{}}] (v1.5)
let profileViews = loadJson('profile-views.json', {}); // v3.7: visto -> [{viewer, at}] (quién vio ese perfil)
let storyViews = loadJson('story-views.json', {}); // v3.8: historia -> [{viewer, at}] (quién vio esa historia)
let postViews = loadJson('post-views.json', {}); // v3.8: publicación -> [{viewer, at}] (vistas reales por visitante)
let storyPollVotes = loadJson('story-poll-votes.json', {}); // v3.8: historia -> [{voter, option, at}] (encuesta de historia)
let storyReactions = loadJson('story-reactions.json', {}); // v3.8: historia -> [{viewer, emoji, at}] (reacciones rápidas)
let closeFriends = loadJson('close-friends.json', {}); // v3.8: dueño -> [teléfonos] (amigos cercanos)
let liveGifts = loadJson('live-gifts.json', {}); // v3.8: live -> [{giftId, from, at}] (regalos virtuales, sin dinero)
let audioRooms = loadJson('audio-rooms.json', []); // v3.8: [{id, title, topic, owner, participants:[{phone, muted, joinedAt}], createdAt, endedAt}]
let tournaments = loadJson('tournaments.json', []); // v3.8: [{id, weekKey, gameId, gameName, startsAt, endsAt, scores:{phone: mejor}, createdAt}]
let wishlists = loadJson('wishlists.json', {}); // v3.8: cuenta -> [ids de anuncios] (lista de deseos)
let postVotes = loadJson('post-votes.json', {}); // v3.8: publicación -> [{voter, option, at}] (encuesta con foto)
let muted = loadJson('muted.json', {}); // v3.8: cuenta -> [teléfonos silenciados] (solo apaga avisos, no oculta)
let conversationSettings = loadJson('conversation-settings.json', {}); // v3.8: "a|b" -> {disappearingHours} (mensajes temporales)
let coupons = loadJson('coupons.json', []); // v3.8: [{code, seller, discountPct, listingId|null, expiresAt, createdAt}]
let promoRequests = loadJson('promotion-requests.json', []); // v4.3: [{id, postId, userPhone, tier, goal, status:'pending'|'approved'|'rejected', createdAt, decidedAt}]
let creatorConfig = loadJson('creator-config.json', null); // v4.3: {order:[ids de apartados], sizes:{id:'s'|'m'|'l'}, updatedAt} o null = predeterminado de la app
/* (v3.1: al arrancar, los lives que quedaron abiertos se marcan como
   terminados dentro de initStore, después de cargar los datos.) */
const codeHits = {};                                // phone -> [timestamps]
const emailCodeHits = {};                           // email -> [timestamps] (v2.9)
/* Subidas por partes en curso (v1.4): uploadId -> {owner, name, type, ext, received, createdAt} */
const pendingUploads = {};

function saveAll() {
  saveJson('profiles.json', profiles);
  saveJson('posts.json', posts);
  saveJson('stories.json', stories);
  saveJson('friends.json', friends);
  saveJson('requests.json', requests);
  saveJson('groups.json', groups);
  saveJson('listings.json', listings);
  saveJson('sales-groups.json', salesGroups);
  saveJson('ratings.json', ratings);
  saveJson('events.json', events);
  saveJson('pages.json', pages);
  saveJson('messages.json', messages);
  saveJson('notifications.json', notifications);
  saveJson('blocked.json', blocked);
  saveJson('reports.json', reports);
  saveJson('auth.json', auth);
  saveJson('media.json', media);
  saveJson('games.json', gameStats);
  saveJson('game-ratings.json', gameRatings);
  saveJson('profile-views.json', profileViews);
  saveJson('story-views.json', storyViews);
  saveJson('post-views.json', postViews);
  saveJson('story-poll-votes.json', storyPollVotes);
  saveJson('story-reactions.json', storyReactions);
  saveJson('close-friends.json', closeFriends);
  saveJson('live-gifts.json', liveGifts);
  saveJson('audio-rooms.json', audioRooms);
  saveJson('tournaments.json', tournaments);
  saveJson('wishlists.json', wishlists);
  saveJson('post-votes.json', postVotes);
  saveJson('muted.json', muted);
  saveJson('conversation-settings.json', conversationSettings);
  saveJson('coupons.json', coupons);
  saveJson('promotion-requests.json', promoRequests);
  saveJson('creator-config.json', creatorConfig);
  if (mongoReady) return flushPendingWrites();
  return undefined;
}

/* ---- almacenamiento PARA SIEMPRE con MongoDB (v3.1) ----
   El disco del plan gratis de Render es efímero: los JSON se borraban
   en cada reinicio o despliegue y las publicaciones solo vivían en el
   teléfono, así que no aparecían en otro dispositivo ni entre usuarios.
   Con MONGODB_URI puesta, los datos viven en MongoDB (base de datos
   "wordred", una colección por conjunto de datos) y sobreviven a
   reinicios y despliegues. Sin MONGODB_URI, el servidor sigue con los
   JSON en disco como antes (respaldo para pruebas locales).
   El estado en memoria NO cambia: el código sigue mutando las mismas
   variables y llamando a saveJson/saveAll; lo único que cambia es
   DÓNDE se escribe (MongoDB o disco). Cada conjunto es un solo
   documento {_id:'data', value:<todo el conjunto>} en su colección:
   simple y 1:1 con el JSON de antes. Límite honesto: un documento de
   MongoDB no pasa de 16 MB por conjunto (a ~1 KB por publicación,
   unas 16.000 publicaciones); si algún día se llega ahí, habrá que
   guardar un documento por elemento.
   Las escrituras a MongoDB son asíncronas (el código las llamaba
   síncronas): saveJson devuelve la promesa y se sigue sin esperar,
   igual que antes, salvo en los caminos críticos (verificar el código,
   crear perfil/publicación/mensaje), donde se espera a que la
   escritura termine antes de responder. Al recibir SIGTERM/SIGINT
   (lo que manda Render al redesplegar), se esperan las escrituras
   pendientes antes de salir, así un despliegue no pierde el último
   cambio. Si MongoDB no responde al arrancar (10 s), se sigue con
   los JSON en disco y /api/health lo dice (storage:"json"). */
const { MongoClient } = require('mongodb');
const MONGODB_URI = (process.env.MONGODB_URI || '').trim();
const MONGODB_DB = 'wordred';
let mongoClient = null;
let mongoDb = null;
let mongoReady = false;
const pendingWrites = new Set();
const FILE_TO_COLL = {
  'profiles.json': 'profiles', 'posts.json': 'posts', 'stories.json': 'stories',
  'friends.json': 'friends', 'requests.json': 'requests', 'groups.json': 'groups',
  'listings.json': 'listings', 'sales-groups.json': 'salesGroups', 'ratings.json': 'ratings',
  'events.json': 'events', 'pages.json': 'pages', 'messages.json': 'messages',
  'group-chats.json': 'groupChats', 'notifications.json': 'notifications', 'blocked.json': 'blocked', 'reports.json': 'reports',
  'auth.json': 'auth', 'media.json': 'media', 'lives.json': 'lives',
  'games.json': 'gameStats', 'game-ratings.json': 'gameRatings',
  'profile-views.json': 'profileViews',
  'story-views.json': 'storyViews', 'post-views.json': 'postViews',
  'story-poll-votes.json': 'storyPollVotes', 'story-reactions.json': 'storyReactions',
  'close-friends.json': 'closeFriends', 'live-gifts.json': 'liveGifts',
  'audio-rooms.json': 'audioRooms', 'tournaments.json': 'tournaments',
  'wishlists.json': 'wishlists', 'post-votes.json': 'postVotes',
  'muted.json': 'muted', 'conversation-settings.json': 'conversationSettings',
  'coupons.json': 'coupons', 'promotion-requests.json': 'promotion_requests',
  'creator-config.json': 'creator_config'
};
const DATASETS = [
  { file: 'profiles.json', get: () => profiles, set: v => { profiles = v; }, fallback: {} },
  { file: 'posts.json', get: () => posts, set: v => { posts = v; }, fallback: [] },
  { file: 'stories.json', get: () => stories, set: v => { stories = v; }, fallback: [] },
  { file: 'friends.json', get: () => friends, set: v => { friends = v; }, fallback: {} },
  { file: 'requests.json', get: () => requests, set: v => { requests = v; }, fallback: [] },
  { file: 'groups.json', get: () => groups, set: v => { groups = v; }, fallback: [] },
  { file: 'listings.json', get: () => listings, set: v => { listings = v; }, fallback: [] },
  { file: 'sales-groups.json', get: () => salesGroups, set: v => { salesGroups = v; }, fallback: [] },
  { file: 'ratings.json', get: () => ratings, set: v => { ratings = v; }, fallback: [] },
  { file: 'events.json', get: () => events, set: v => { events = v; }, fallback: [] },
  { file: 'pages.json', get: () => pages, set: v => { pages = v; }, fallback: [] },
  { file: 'messages.json', get: () => messages, set: v => { messages = v; }, fallback: [] },
  { file: 'group-chats.json', get: () => groupChats, set: v => { groupChats = v; }, fallback: [] },
  { file: 'notifications.json', get: () => notifications, set: v => { notifications = v; }, fallback: [] },
  { file: 'blocked.json', get: () => blocked, set: v => { blocked = v; }, fallback: {} },
  { file: 'reports.json', get: () => reports, set: v => { reports = v; }, fallback: [] },
  { file: 'auth.json', get: () => auth, set: v => { auth = v; }, fallback: {} },
  { file: 'media.json', get: () => media, set: v => { media = v; }, fallback: {} },
  { file: 'lives.json', get: () => lives, set: v => { lives = v; }, fallback: [] },
  { file: 'games.json', get: () => gameStats, set: v => { gameStats = v; }, fallback: { plays: {}, players: {} } },
  { file: 'game-ratings.json', get: () => gameRatings, set: v => { gameRatings = v; }, fallback: [] },
  { file: 'profile-views.json', get: () => profileViews, set: v => { profileViews = v; }, fallback: {} },
  { file: 'story-views.json', get: () => storyViews, set: v => { storyViews = v; }, fallback: {} },
  { file: 'post-views.json', get: () => postViews, set: v => { postViews = v; }, fallback: {} },
  { file: 'story-poll-votes.json', get: () => storyPollVotes, set: v => { storyPollVotes = v; }, fallback: {} },
  { file: 'story-reactions.json', get: () => storyReactions, set: v => { storyReactions = v; }, fallback: {} },
  { file: 'close-friends.json', get: () => closeFriends, set: v => { closeFriends = v; }, fallback: {} },
  { file: 'live-gifts.json', get: () => liveGifts, set: v => { liveGifts = v; }, fallback: {} },
  { file: 'audio-rooms.json', get: () => audioRooms, set: v => { audioRooms = v; }, fallback: [] },
  { file: 'tournaments.json', get: () => tournaments, set: v => { tournaments = v; }, fallback: [] },
  { file: 'wishlists.json', get: () => wishlists, set: v => { wishlists = v; }, fallback: {} },
  { file: 'post-votes.json', get: () => postVotes, set: v => { postVotes = v; }, fallback: {} },
  { file: 'muted.json', get: () => muted, set: v => { muted = v; }, fallback: {} },
  { file: 'conversation-settings.json', get: () => conversationSettings, set: v => { conversationSettings = v; }, fallback: {} },
  { file: 'coupons.json', get: () => coupons, set: v => { coupons = v; }, fallback: [] },
  { file: 'promotion-requests.json', get: () => promoRequests, set: v => { promoRequests = v; }, fallback: [] },
  { file: 'creator-config.json', get: () => creatorConfig, set: v => { creatorConfig = v; }, fallback: null }
];
/* Espera a que terminen las escrituras pendientes a MongoDB (con tope,
   para no dejar una petición colgada si MongoDB va lento). Nunca
   rechaza: si una escritura falló, ya quedó en el registro. */
function flushPendingWrites(timeoutMs) {
  const cap = typeof timeoutMs === 'number' ? timeoutMs : 5000;
  if (!pendingWrites.size) return Promise.resolve();
  const all = Promise.all(Array.from(pendingWrites)).catch(() => {});
  const timer = new Promise(resolve => setTimeout(resolve, cap));
  return Promise.race([all, timer]);
}
async function saveMongoDataset(name, data) {
  const coll = FILE_TO_COLL[name];
  if (!coll) return;
  /* v3.3: si no hay conexión a MongoDB, FALLAR (antes se resolvía en
     silencio y el que llamaba creía que se había guardado). Los que
     llaman por saveJson lo tragan y lo registran; los críticos usan
     saveJsonStrict y devuelven 500. */
  if (!mongoDb) throw new Error('MongoDB no conectado');
  /* Solo para pruebas (tests/test-server.js): simula que la escritura
     en MongoDB falla. Nunca se activa en Render (la variable no está). */
  if (process.env.WORDRED_TEST_FAIL_WRITES === '1') throw new Error('fallo simulado de escritura en MongoDB (prueba)');
  await mongoDb.collection(coll).updateOne({ _id: 'data' }, { $set: { value: data } }, { upsert: true });
}
/* v3.3: escritura estricta para los caminos críticos (borrar): devuelve
   la promesa REAL de MongoDB (rechaza si falla) para que el endpoint
   pueda devolver 500 en vez de un éxito falso. saveJson sigue
   devolviendo la promesa con .catch para los que no esperan. */
function saveJsonStrict(name, data) {
  if (mongoReady) {
    const p = saveMongoDataset(name, data);
    pendingWrites.add(p);
    p.then(() => pendingWrites.delete(p), () => pendingWrites.delete(p));
    return p;
  }
  try { fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2)); }
  catch (e) { return Promise.reject(e); }
  return Promise.resolve();
}
function loadJsonIfExists(name) {
  try {
    const p = path.join(DATA_DIR, name);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {}
  return undefined;
}
function isEmptyDataset(v, fallback) {
  if (Array.isArray(fallback)) return !Array.isArray(v) || v.length === 0;
  return !v || typeof v !== 'object' || Object.keys(v).length === 0;
}
async function initStore() {
  if (MONGODB_URI) {
    try {
      mongoClient = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
      await mongoClient.connect();
      mongoDb = mongoClient.db(MONGODB_DB);
      for (const ds of DATASETS) {
        const coll = FILE_TO_COLL[ds.file];
        let doc = null;
        try { doc = await mongoDb.collection(coll).findOne({ _id: 'data' }); } catch (e) {}
        if (doc && doc.value !== undefined) {
          ds.set(doc.value);
        } else {
          /* Primera vez con MongoDB: si el JSON en disco tiene datos,
             se importan una vez para no perder lo que ya había. */
          const fromJson = loadJsonIfExists(ds.file);
          if (fromJson !== undefined && !isEmptyDataset(fromJson, ds.fallback)) {
            ds.set(fromJson);
            try { await mongoDb.collection(coll).updateOne({ _id: 'data' }, { $set: { value: fromJson } }, { upsert: true }); } catch (e) { console.error('[store] no se pudo importar ' + ds.file + ' a MongoDB:', e.message); }
          }
        }
      }
      mongoReady = true;
      console.log('[store] MongoDB conectado (base wordred): los datos quedan para siempre.');
    } catch (e) {
      console.error('[store] no se pudo conectar a MongoDB, se sigue con los JSON en disco: ' + e.message);
      try { if (mongoClient) await mongoClient.close(); } catch (e2) {}
      mongoClient = null; mongoDb = null; mongoReady = false;
    }
  }
  /* Un live no sobrevive a un reinicio del servidor: al arrancar, los
     que quedaron abiertos se marcan como terminados. */
  lives.forEach(l => { if (!l.endedAt) l.endedAt = Date.now(); });
  saveJson('lives.json', lives);
}
/* Se arranca al cargar el módulo; las peticiones esperan a que termine
   (middleware más abajo) y el proceso principal espera antes de oír. */
const storeReady = initStore();

/* v2.9: la identidad de una cuenta es su número de teléfono o su
   correo (cuentas de Google/correo). Un correo se deja en minúsculas
   y se devuelve tal cual; un teléfono se deja solo en dígitos, como
   siempre. Así todo lo que usa normPhone (feed, amigos, mensajes,
   WebSocket) funciona igual con ambas clases de cuenta. */
function normPhone(p) {
  var s = String(p || '').trim();
  if (s.indexOf('@') >= 0) return s.toLowerCase();
  return s.replace(/\D/g, '');
}
/* v2.9: un correo válido es texto@texto.texto, sin espacios. */
function validEmail(e) {
  var s = String(e || '').trim();
  if (s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}
// Normaliza un enlace como en el cliente: agrega https:// si falta y exige
// un host con punto. Devuelve {url, host} o null si no es válido.
function normalizeLinkUrl(raw) {
  let url = String(raw || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return null; }
  if (!host || host.indexOf('.') < 0 || url.length > 2000) return null;
  return { url, host };
}
function uid(prefix) { return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex'); }
/* Archivos en el servidor (v1.4): la app sube en trozos de base64 y el
   servidor arma el archivo en uploads/ y lo sirve por /media/<id>.<ext>.
   Solo el dueño puede borrar su archivo. */
const MEDIA_MIME_TO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov', 'video/3gpp': '3gp', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'audio/webm': 'webm', 'application/pdf': 'pdf' };
const MEDIA_EXT_TO_CT = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', '3gp': 'video/3gpp', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', pdf: 'application/pdf', bin: 'application/octet-stream' };
function mediaExtFor(mime) { return MEDIA_MIME_TO_EXT[String(mime || '').toLowerCase().split(';')[0].trim()] || 'bin'; }
function sweepStaleUploads() {
  try {
    const now = Date.now();
    fs.readdirSync(MEDIA_TMP_DIR).forEach(function (f) {
      const p = path.join(MEDIA_TMP_DIR, f);
      try {
        const st = fs.statSync(p);
        if (now - st.mtimeMs > 24 * 60 * 60 * 1000) { fs.unlinkSync(p); delete pendingUploads[f.replace(/\.part$/, '')]; }
      } catch (e) {}
    });
  } catch (e) {}
}
/* ---- almacenamiento permanente con Cloudinary (v1.4) ----
   El usuario crea una cuenta GRATIS en Cloudinary (25 GB, sin
   tarjeta) y un preset de subida SIN FIRMAR; el servidor solo lee
   dos variables de entorno: CLOUDINARY_CLOUD_NAME y
   CLOUDINARY_UPLOAD_PRESET. La subida a Cloudinary es SIN FIRMAR
   (solo cloud name + preset, sin secretos), así que ni el servidor
   ni la app necesitan credenciales para subir. CLOUDINARY_API_KEY y
   CLOUDINARY_API_SECRET son OPCIONALES y solo sirven para BORRAR el
   archivo en Cloudinary (borrado firmado); nunca van en la APK.
   Si Cloudinary no está configurado, el archivo queda en el disco
   del servidor como respaldo TEMPORAL (en Render gratis se pierde al
   reiniciar o redesplegar). Si la subida a Cloudinary falla, también
   se usa el disco local para no perder el archivo.
   CLOUDINARY_UPLOAD_URL y CLOUDINARY_DESTROY_URL solo existen para
   las pruebas (apuntan a un servidor falso en local); en producción
   no se ponen. */
function cloudinaryConfig() {
  const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
  const preset = (process.env.CLOUDINARY_UPLOAD_PRESET || '').trim();
  return {
    cloudName,
    preset,
    apiKey: (process.env.CLOUDINARY_API_KEY || '').trim(),
    apiSecret: (process.env.CLOUDINARY_API_SECRET || '').trim(),
    enabled: !!(cloudName && preset),
    uploadUrl: (process.env.CLOUDINARY_UPLOAD_URL || '').trim() || (cloudName ? 'https://api.cloudinary.com/v1_1/' + cloudName + '/auto/upload' : ''),
    destroyUrl: (process.env.CLOUDINARY_DESTROY_URL || '').trim() || (cloudName ? 'https://api.cloudinary.com/v1_1/' + cloudName + '/image/destroy' : '')
  };
}
/* Sube un archivo ya armado a Cloudinary con el preset sin firmar.
   Devuelve la respuesta de Cloudinary (con secure_url y public_id)
   o lanza un error si Cloudinary rechaza la subida. */
async function uploadToCloudinary(cfg, buf, mime, fileName, id) {
  const form = new FormData();
  form.append('upload_preset', cfg.preset);
  form.append('public_id', 'wordred/' + id);
  form.append('file', new Blob([buf], { type: mime || 'application/octet-stream' }), fileName);
  const res = await fetch(cfg.uploadUrl, { method: 'POST', body: form });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok || !data || !data.secure_url) throw new Error((data && data.error && data.error.message) || ('Cloudinary: HTTP ' + res.status));
  return data;
}
/* Borra un archivo de Cloudinary (borrado FIRMADO, solo si están
   CLOUDINARY_API_KEY y CLOUDINARY_API_SECRET). Devuelve true si
   Cloudinary confirmó el borrado. Sin secretos devuelve false y el
   archivo queda huérfano en Cloudinary (se borra el registro y la
   copia local, pero la copia en la nube sigue existiendo). */
async function destroyFromCloudinary(cfg, rec) {
  if (!cfg.apiKey || !cfg.apiSecret || !rec || !rec.publicId) return false;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = crypto.createHash('sha1').update('public_id=' + rec.publicId + '&timestamp=' + timestamp + cfg.apiSecret).digest('hex');
    const body = new URLSearchParams({ public_id: rec.publicId, api_key: cfg.apiKey, timestamp: String(timestamp), signature });
    let url = cfg.destroyUrl;
    const mime = String(rec.type || '');
    if (mime.indexOf('video/') === 0) url = url.replace('/image/destroy', '/video/destroy');
    else if (mime.indexOf('image/') !== 0) url = url.replace('/image/destroy', '/raw/destroy');
    const res = await fetch(url, { method: 'POST', body });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    return !!(res.ok && data && data.result === 'ok');
  } catch (e) { return false; }
}
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function genCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
function genToken() { return crypto.randomBytes(32).toString('hex'); }
/* Valida la personalización de una historia (espejo del cliente): filtro,
   fondo, textos, stickers y dibujo, todo con límites. */
const STORY_FILTERS_SRV = ['none', 'blanco y negro', 'sepia', 'vivo', 'frío', 'cálido', 'contraste'];
const STORY_BGS_SRV = ['none', 'rojo', 'atardecer', 'mar', 'bosque', 'violeta', 'dorado', 'noche'];
function validateStoryEdits(edits) {
  const out = { filter: 'none', bg: 'none', texts: [], stickers: [], drawing: [] };
  if (!edits) return out;
  if (STORY_FILTERS_SRV.includes(edits.filter)) out.filter = edits.filter;
  if (STORY_BGS_SRV.includes(edits.bg)) out.bg = edits.bg;
  const clamp = (v) => { const n = parseFloat(v); return isNaN(n) ? 50 : Math.max(0, Math.min(100, n)); };
  if (Array.isArray(edits.texts)) edits.texts.slice(0, 10).forEach(t => {
    if (!t || !String(t.text || '').trim()) return;
    out.texts.push({ text: String(t.text).slice(0, 80), color: String(t.color || '#ffffff').slice(0, 20), size: Math.max(14, Math.min(72, parseInt(t.size, 10) || 28)), x: clamp(t.x), y: clamp(t.y) });
  });
  if (Array.isArray(edits.stickers)) edits.stickers.slice(0, 20).forEach(k => {
    if (!k || !String(k.emoji || '').trim()) return;
    out.stickers.push({ emoji: String(k.emoji).slice(0, 8), size: Math.max(20, Math.min(120, parseInt(k.size, 10) || 48)), x: clamp(k.x), y: clamp(k.y) });
  });
  if (Array.isArray(edits.drawing)) edits.drawing.slice(0, 50).forEach(stroke => {
    if (!stroke || !Array.isArray(stroke.points)) return;
    out.drawing.push({ color: String(stroke.color || '#ffffff').slice(0, 20), width: Math.max(2, Math.min(24, parseInt(stroke.width, 10) || 6)), points: stroke.points.slice(0, 200).map(pt => ({ x: clamp(pt.x), y: clamp(pt.y) })) });
  });
  return out;
}
function liveStories() {
  const t = Date.now();
  return stories.filter(s => t - s.createdAt <= STORY_TTL_MS);
}
/* v3.8: una historia viva (existe y no caducó). Las de 24 h ya no
   aceptan visitas, votos ni reacciones, aunque sigan en el arreglo. */
function findLiveStory(id) {
  const s = stories.find(x => x.id === id);
  if (!s) return null;
  if (Date.now() - s.createdAt > STORY_TTL_MS) return null;
  return s;
}
/* v3.8: ¿puede este teléfono ver esta historia? Las de audiencia
   'close' solo las ven su autor y su lista de cercanos. */
function canSeeStory(story, phone) {
  if (!story) return false;
  if (story.audience !== 'close') return true;
  if (!phone) return false;
  if (story.author === phone) return true;
  return (closeFriends[story.author] || []).includes(phone);
}
function profilePublic(phone) {
  const p = profiles[phone];
  return { phone, name: (p && p.name) || phone, avatar: (p && p.photo) || '' };
}
/* v3.8: valida la encuesta de una historia: pregunta + 2 opciones. */
function validateStoryPoll(poll) {
  if (!poll || typeof poll !== 'object') return null;
  const question = String(poll.question || '').trim().slice(0, 120);
  if (!question) return null;
  if (!Array.isArray(poll.options) || poll.options.length !== 2) return null;
  const options = poll.options.map(function (o) {
    const text = String((o && o.text) || o || '').trim().slice(0, 40);
    return { text };
  });
  if (!options[0].text || !options[1].text) return null;
  return { question, options: [{ text: options[0].text, votes: 0 }, { text: options[1].text, votes: 0 }] };
}
function storyPollCounts(storyId) {
  const votes = storyPollVotes[storyId] || [];
  return [votes.filter(function (v) { return v.option === 0; }).length, votes.filter(function (v) { return v.option === 1; }).length];
}
/* v3.8: la historia servida lleva su encuesta según quién pide:
   el autor ve votos + quién votó qué; quien ya votó ve los conteos
   y su voto; quien no ha votado solo ve la pregunta y las opciones.
   También lleva myReaction (su emoji o null). Nunca se inventan votos. */
function shapeStory(story, viewerPhone) {
  const out = Object.assign({}, story);
  if (story.poll) {
    const counts = storyPollCounts(story.id);
    const myVoteRec = viewerPhone ? (storyPollVotes[story.id] || []).find(function (v) { return v.voter === viewerPhone; }) : null;
    if (viewerPhone && story.author === viewerPhone) {
      out.poll = {
        question: story.poll.question,
        options: story.poll.options.map(function (o, i) { return { text: o.text, votes: counts[i] }; }),
        voters: (storyPollVotes[story.id] || []).slice().sort(function (a, b) { return b.at - a.at; }).map(function (v) {
          const pub = profilePublic(v.voter);
          return { phone: v.voter, name: pub.name, avatar: pub.avatar, option: v.option, at: v.at };
        })
      };
    } else if (myVoteRec) {
      out.poll = { question: story.poll.question, options: story.poll.options.map(function (o, i) { return { text: o.text, votes: counts[i] }; }), myVote: myVoteRec.option };
    } else {
      out.poll = { question: story.poll.question, options: story.poll.options.map(function (o) { return { text: o.text }; }) };
    }
  }
  if (viewerPhone) {
    const myReact = (storyReactions[story.id] || []).find(function (r) { return r.viewer === viewerPhone; });
    out.myReaction = myReact ? myReact.emoji : null;
  } else out.myReaction = null;
  return out;
}
/* v3.8: conteos de la encuesta con foto de una publicación. */
function photoPollCounts(postId) {
  const votes = postVotes[postId] || [];
  return [votes.filter(function (v) { return v.option === 0; }).length, votes.filter(function (v) { return v.option === 1; }).length];
}
/* v3.8: la publicación servida lleva su encuesta con foto con los
   conteos reales y el voto de quien pide (myVote o null). */
function enrichPostForViewer(post, viewerPhone) {
  if (!post || !post.photoPoll) return post;
  const out = Object.assign({}, post);
  const counts = photoPollCounts(post.id);
  const myVoteRec = viewerPhone ? (postVotes[post.id] || []).find(function (v) { return v.voter === viewerPhone; }) : null;
  out.photoPoll = {
    options: post.photoPoll.options.map(function (o, i) { return { mediaUrl: o.mediaUrl, label: o.label, votes: counts[i] }; }),
    votes: counts,
    myVote: myVoteRec ? myVoteRec.option : null
  };
  return out;
}
/* v3.8: ¿es una URL http(s) válida? (enlaces de historias, medios de
   comentarios, portadas). Sin http(s) no se acepta. */
function isHttpUrl(u) {
  if (typeof u !== 'string') return false;
  const s = u.trim();
  if (s.indexOf('http://') !== 0 && s.indexOf('https://') !== 0) return false;
  try { const parsed = new URL(s); return parsed.protocol === 'http:' || parsed.protocol === 'https:'; } catch (e) { return false; }
}
/* v3.8: normaliza una etiqueta de reto: sin espacios, con # delante,
   solo letras, números, guion y guion bajo, máx. 40 caracteres. */
function normalizeChallenge(tag) {
  if (typeof tag !== 'string') return null;
  let t = tag.trim().replace(/\s+/g, '');
  if (!t) return null;
  if (t.charAt(0) !== '#') t = '#' + t;
  if (!/^#[A-Za-z0-9_\-áéíóúÁÉÍÓÚñÑ]{1,39}$/.test(t)) return null;
  return t;
}
/* v3.8: valida el lugar de una publicación: nombre real + coordenadas. */
function validatePlace(place) {
  if (!place || typeof place !== 'object') return null;
  const lat = Number(place.lat), lng = Number(place.lng);
  if (!isFinite(lat) || lat < -90 || lat > 90) return null;
  if (!isFinite(lng) || lng < -180 || lng > 180) return null;
  const name = String(place.name || '').trim().slice(0, 120);
  return { name, lat, lng };
}
/* v3.8: valida el estado de ánimo: texto corto + emoji. */
function validateMood(mood) {
  if (!mood || typeof mood !== 'object') return null;
  const text = String(mood.text || '').trim().slice(0, 30);
  const emoji = String(mood.emoji || '').trim().slice(0, 8);
  if (!text) return null;
  return { text, emoji };
}
/* v3.8: valida la encuesta con foto: exactamente 2 fotos con URL válida. */
function validatePhotoPoll(pp) {
  if (!pp || typeof pp !== 'object') return null;
  if (!Array.isArray(pp.options) || pp.options.length !== 2) return null;
  const options = pp.options.map(function (o) {
    return { mediaUrl: String((o && o.mediaUrl) || '').trim(), label: String((o && o.label) || '').trim().slice(0, 40) };
  });
  if (!options.every(function (o) { return isHttpUrl(o.mediaUrl); })) return null;
  return { options };
}
/* v3.8: verificación de cuenta — criterios reales, nada manual:
   teléfono verificado + perfil completo (foto, nombre, biografía) +
   cuenta con al menos 7 días + al menos 5 publicaciones. Devuelve
   {verified, missing:[{key, label}]} con lo que falta, en español. */
function verificationStatus(phone) {
  const missing = [];
  const a = auth[phone];
  if (!a || !a.verified) missing.push({ key: 'telefono', label: 'Verifica tu teléfono' });
  const p = profiles[phone];
  if (!p || !String(p.photo || '').trim() || !String(p.name || '').trim() || !String(p.bio || '').trim()) {
    missing.push({ key: 'perfil', label: 'Completa tu perfil (foto, nombre y biografía)' });
  }
  const createdAt = p && p.createdAt ? p.createdAt : 0;
  if (!createdAt || Date.now() - createdAt < 7 * 24 * 60 * 60 * 1000) {
    missing.push({ key: 'antiguedad', label: 'Tu cuenta debe tener al menos 7 días' });
  }
  const nPosts = posts.filter(function (x) { return x.author === phone; }).length;
  if (nPosts < 5) missing.push({ key: 'publicaciones', label: 'Publica al menos 5 publicaciones (llevas ' + nPosts + ')' });
  return { verified: missing.length === 0, missing };
}
/* v3.8: regalos virtuales de los lives (sin dinero, sin precios). */
const GIFT_IDS = ['rosa', 'corazon', 'estrella', 'corona', 'cohete', 'diamante'];
/* v3.8: los 36 minijuegos, en el mismo orden que la app (assets/games.js).
   El torneo de la semana rota entre ellos, uno por semana. */
const TOURNAMENT_GAMES = [
  { id: 'serpiente', name: 'Serpiente clásica' }, { id: 'serpiente-veloz', name: 'Serpiente veloz' },
  { id: 'serpiente-muro', name: 'Serpiente en el laberinto' }, { id: 'serpiente-portales', name: 'Serpiente con portales' },
  { id: 'memoria', name: 'Memoria de parejas' }, { id: 'memoria-experta', name: 'Memoria experta' },
  { id: 'rompebloques', name: 'Rompebloques' }, { id: 'rompebloques-multibola', name: 'Rompebloques multibola' },
  { id: 'rompebloques-laser', name: 'Rompebloques con láser' }, { id: 'pong', name: 'Pong contra la máquina' },
  { id: 'pong-pared', name: 'Pong contra la pared' }, { id: 'vuelo', name: 'Vuelo' },
  { id: 'vuelo-rapido', name: 'Vuelo rápido' }, { id: 'bloques', name: 'Bloques' },
  { id: 'bloques-caida', name: 'Bloques en caída libre' }, { id: 'fusion-2048', name: 'Fusión 2048' },
  { id: 'fusion-mini', name: 'Fusión mini 3x3' }, { id: 'invasores', name: 'Invasores del espacio' },
  { id: 'asteroides', name: 'Asteroides' }, { id: 'tiro-blanco', name: 'Tiro al blanco' },
  { id: 'corredor', name: 'Corredor saltarín' }, { id: 'esquiva', name: 'Esquiva bloques' },
  { id: 'salto-nubes', name: 'Salto entre nubes' }, { id: 'desliza-15', name: 'Desliza 15' },
  { id: 'buscaminas', name: 'Buscaminas' }, { id: 'conecta-3', name: 'Conecta 3' },
  { id: 'simon', name: 'Simón' }, { id: 'laberinto', name: 'Laberinto' },
  { id: 'tres-raya', name: 'Tres en raya' }, { id: 'ahorcado', name: 'Ahorcado' },
  { id: 'topo', name: 'Atrapa al topo' }, { id: 'reaccion', name: 'Prueba de reflejos' },
  { id: 'atrapa-frutas', name: 'Atrapa frutas' }, { id: 'carrera', name: 'Carrera de autos' },
  { id: 'burbujas', name: 'Burbujas' }, { id: 'torres', name: 'Torres' }
];
/* v3.8: clave de semana (lunes a domingo, UTC) y sus límites. */
function weekKeyFor(d) {
  const date = new Date(d);
  const day = (date.getUTCDay() + 6) % 7; // lunes = 0
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day, 0, 0, 0, 0));
  const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000 + 23 * 60 * 60 * 1000 + 59 * 60 * 1000 + 59 * 1000);
  const key = monday.getUTCFullYear() + '-W' + String(Math.ceil((((monday - Date.UTC(monday.getUTCFullYear(), 0, 1)) / 86400000) + 1) / 7)).padStart(2, '0');
  return { key, startsAt: monday.getTime(), endsAt: sunday.getTime() };
}
function tournamentPublic(t) {
  const board = Object.keys(t.scores || {}).map(function (phone) {
    const pub = profilePublic(phone);
    return { phone, name: pub.name, avatar: pub.avatar, score: t.scores[phone] };
  }).sort(function (a, b) { return b.score - a.score; });
  board.forEach(function (row, i) { row.rank = i + 1; });
  return { id: t.id, weekKey: t.weekKey, gameId: t.gameId, gameName: t.gameName, startsAt: t.startsAt, endsAt: t.endsAt, leaderboard: board };
}
function getOrCreateCurrentTournament() {
  const w = weekKeyFor(Date.now());
  let t = tournaments.find(function (x) { return x.weekKey === w.key; });
  if (!t) {
    // El juego rota por semana: el índice sale de la semana del año.
    const weekNum = parseInt(w.key.split('-W')[1], 10) || 1;
    const game = TOURNAMENT_GAMES[(weekNum - 1) % TOURNAMENT_GAMES.length];
    t = { id: uid('tour'), weekKey: w.key, gameId: game.id, gameName: game.name, startsAt: w.startsAt, endsAt: w.endsAt, scores: {}, createdAt: Date.now() };
    tournaments.push(t);
    saveJson('tournaments.json', tournaments);
  }
  return t;
}
/* v3.8: clave de una conversación 1 a 1 (los dos teléfonos ordenados). */
function conversationKey(a, b) {
  return [a, b].sort().join('|');
}
/* v3.8: poda los mensajes vencidos de una conversación con mensajes
   temporales. Devuelve true si borró algo (para guardar). El archivo
   del medio en Cloudinary puede quedar guardado: solo se borra el
   mensaje y su enlace, y la app avisa de la captura en la notita. */
function pruneDisappearingMessages(a, b) {
  const key = conversationKey(a, b);
  const hours = (conversationSettings[key] && conversationSettings[key].disappearingHours) || 0;
  if (!hours) return false;
  const limit = Date.now() - hours * 60 * 60 * 1000;
  const before = messages.length;
  messages = messages.filter(function (m) {
    if (!((m.from === a && m.to === b) || (m.from === b && m.to === a))) return true;
    return m.createdAt > limit;
  });
  return messages.length !== before;
}
function notify(type, from, to, text, refId) {
  /* v3.8: si el destinatario silenció al remitente, no se crea el
     aviso (la campana ni la notificación del teléfono). Silenciar
     SOLO apaga avisos: las publicaciones y los mensajes se siguen
     viendo normales. */
  if (to && from && (muted[to] || []).includes(from)) return null;
  const n = { id: uid('notif'), type, from, to, text, refId: refId || '', createdAt: Date.now(), read: false };
  notifications.unshift(n);
  if (notifications.length > 500) notifications.length = 500;
  saveJson('notifications.json', notifications);
  return n;
}
/* Bloqueos (v1.2, ola 7): si uno bloqueó al otro, no se ven. */
function isBlockedSrv(a, b) {
  return ((blocked[a] || []).includes(b) || (blocked[b] || []).includes(a));
}
function isGroupManagerSrv(g, phone) {
  if (!g) return false;
  return g.creator === phone || (g.admins || []).includes(phone);
}
/* Colores y degradados de los grupos (v1.5): los mismos de los perfiles. */
const GROUP_ACCENTS = ['rojo', 'azul', 'verde', 'morado', 'naranja', 'turquesa', 'amarillo', 'dorado', 'coral', 'celeste', 'lima', 'vino'];
const GROUP_GRADIENTS = ['none', 'rojo', 'atardecer', 'mar', 'bosque', 'violeta', 'dorado', 'noche'];
function authPhone(req) {
  const token = String((req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token || '');
  if (!token) return null;
  for (const phone of Object.keys(auth)) {
    const a = auth[phone];
    if (a.token === token && a.tokenAt && Date.now() - a.tokenAt < TOKEN_TTL_MS) return phone;
  }
  return null;
}
function sendSms(to, code, appHash) {
  if (!SMS_ENABLED) return Promise.resolve(false);
  let body = 'Tu código de WordRed es: ' + code;
  if (appHash) body += '\n' + appHash;
  const payload = 'To=' + encodeURIComponent('+' + to) + '&From=' + encodeURIComponent(TWILIO.from) + '&Body=' + encodeURIComponent(body);
  const opts = {
    hostname: 'api.twilio.com',
    path: '/2010-04-01/Accounts/' + TWILIO.sid + '/Messages.json',
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(TWILIO.sid + ':' + TWILIO.token).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(payload)
    }
  };
  return new Promise((resolve) => {
    const req = https.request(opts, (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 300); });
    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

const app = express();
/* Cuerpo JSON grande: las subidas no tienen tope impuesto por la app — las
   fotos viajan ya reducidas y los videos como URI de archivo, así que en la
   práctica el cuerpo es pequeño. El 1 GB es solo el techo de seguridad del
   parser (Express guarda el cuerpo entero en memoria); el límite real es
   el disco del servidor. */
app.use(express.json({ limit: '1gb' }));
app.use((req, res, next) => { res.header('Access-Control-Allow-Origin', '*'); res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization'); if (req.method === 'OPTIONS') return res.sendStatus(204); next(); });
/* v3.1: ninguna petición se atiende antes de que el almacenamiento esté
   listo (con MongoDB, la carga inicial es asíncrona). */
app.use(async (req, res, next) => { try { await storeReady; } catch (e) {} next(); });

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'WordRed', version: '4.6', storage: mongoReady ? 'mongodb' : 'json', mongo: mongoReady, sms: SMS_ENABLED, google: GOOGLE_ENABLED, email: EMAIL_ENABLED }));

/* v3.5: actualización de la aplicación. La última versión vive en
   app-version.json junto al APK (WordRed.apk) en el repo: al publicar
   una versión nueva se reemplazan los dos archivos (ver README).
   GET /api/app/latest dice cuál es la última versión y de dónde se
   descarga; GET /app/WordRed.apk sirve el APK real. Sin esos archivos
   no se inventa nada: el endpoint responde ok:false y la descarga 404.
   v3.6: la URL de descarga ya es https (antes salía con http y Render
   la redirigía a https con 301, que el descargador de la app no sigue:
   la descarga fallaba). Se usa el protocolo real detrás del proxy
   (X-Forwarded-Proto) y para el host de Render siempre https. */
function readAppVersion() {
  try {
    var raw = fs.readFileSync(path.join(__dirname, 'app-version.json'), 'utf8');
    var v = JSON.parse(raw);
    if (!v || !v.versionName || !v.versionCode) return null;
    return { versionName: String(v.versionName), versionCode: parseInt(v.versionCode, 10) || 0, notes: String(v.notes || '') };
  } catch (e) { return null; }
}
app.get('/api/app/latest', (req, res) => {
  var v = readAppVersion();
  if (!v || !v.versionCode) return res.status(404).json({ ok: false, error: 'Sin información de actualización.' });
  var apkPath = path.join(__dirname, 'WordRed.apk');
  if (!fs.existsSync(apkPath)) return res.status(404).json({ ok: false, error: 'Sin información de actualización.' });
  /* v3.6: la URL de descarga es https. Detrás del proxy de Render,
     req.protocol es http aunque el cliente use https; si se devuelve
     http, Render redirige a https con 301 y el descargador de la app no
     sigue redirecciones con cambio de protocolo (la descarga fallaba).
     Se toma el protocolo real del encabezado X-Forwarded-Proto y para
     el host de Render siempre https; en local (sin proxy) se queda el
     protocolo de la petición. */
  var proto = (req.get('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  var host = req.get('host') || '';
  if (proto !== 'http' && proto !== 'https') proto = req.protocol;
  if (host.indexOf('onrender.com') >= 0) proto = 'https';
  var base = proto + '://' + host;
  return res.json({ ok: true, versionName: v.versionName, versionCode: v.versionCode, url: base + '/app/WordRed.apk', notes: v.notes });
});
app.get('/app/WordRed.apk', (req, res) => {
  var apkPath = path.join(__dirname, 'WordRed.apk');
  if (!fs.existsSync(apkPath)) return res.status(404).json({ ok: false, error: 'La actualización no está disponible.' });
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="WordRed.apk"');
  return res.sendFile(apkPath);
});

/* v4.4: el APK de Fantore Resurrección, para instalar el juego desde
   WordRed cuando no está instalado en el teléfono (el puente descarga
   este enlace y abre el instalador del sistema). */
app.get('/app/Fantore-Resurreccion.apk', (req, res) => {
  var apkPath = path.join(__dirname, 'Fantore-Resurreccion.apk');
  if (!fs.existsSync(apkPath)) return res.status(404).json({ ok: false, error: 'El juego no está disponible.' });
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="Fantore-Resurreccion.apk"');
  return res.sendFile(apkPath);
});

/* v3.9: cartelera de estrenos de cine. La lista vive en movies.json
   en la raíz del repo (título, fecha de estreno, portada y tráiler):
   al salir películas nuevas se actualiza ese archivo y la cartelera
   cambia sin una versión nueva de la app. GET /api/billboard es
   público (sin autenticación, como /api/app/latest). Se lee el
   archivo en cada petición para que un cambio se note sin reiniciar
   el servidor. Sin el archivo, con JSON roto o con la lista vacía
   responde ok:false: la app no inventa películas y usa su lista fija. */
function readBillboard() {
  try {
    var raw = fs.readFileSync(path.join(__dirname, 'movies.json'), 'utf8');
    var d = JSON.parse(raw);
    var list = d && Array.isArray(d.movies) ? d.movies : null;
    if (!list || !list.length) return null;
    var clean = list.filter(function (m) { return m && m.title && m.date && m.poster && m.trailer; }).map(function (m) {
      return { title: String(m.title), date: String(m.date), poster: String(m.poster), trailer: String(m.trailer), now: !!m.now };
    });
    return clean.length ? clean : null;
  } catch (e) { return null; }
}
app.get('/api/billboard', (req, res) => {
  var movies = readBillboard();
  if (!movies) return res.status(404).json({ ok: false, error: 'Sin cartelera por ahora.' });
  return res.json({ ok: true, movies: movies });
});

/* v4.0: cartelera de estrenos de juegos. Igual que la de cine (v3.9):
   la lista vive en games.json en la raíz del repo (título, fecha de
   estreno, portada y tráiler); al salir juegos nuevos se actualiza ese
   archivo y la cartelera cambia sin una versión nueva de la app.
   GET /api/games-billboard es público (sin autenticación). Se lee el
   archivo en cada petición para que un cambio se note sin reiniciar
   el servidor. Sin el archivo, con JSON roto o con la lista vacía
   responde ok:false: la app no inventa juegos y usa su lista fija. */
function readGamesBillboard() {
  try {
    var raw = fs.readFileSync(path.join(__dirname, 'games.json'), 'utf8');
    var d = JSON.parse(raw);
    var list = d && Array.isArray(d.games) ? d.games : null;
    if (!list || !list.length) return null;
    var clean = list.filter(function (g) { return g && g.title && g.date && g.poster && g.trailer; }).map(function (g) {
      return { title: String(g.title), date: String(g.date), poster: String(g.poster), trailer: String(g.trailer), now: !!g.now };
    });
    return clean.length ? clean : null;
  } catch (e) { return null; }
}
app.get('/api/games-billboard', (req, res) => {
  var games = readGamesBillboard();
  if (!games) return res.status(404).json({ ok: false, error: 'Sin cartelera de juegos por ahora.' });
  return res.json({ ok: true, games: games });
});

/* v4.4: juego destacado (Fantore Resurrección). Igual que las carteleras
   de cine (v3.9) y juegos (v4.0): la ficha vive en featured-game.json en
   la raíz del repo (datos del juego + capturas); al agregar capturas
   reales se actualiza ese archivo y la página cambia sin una versión
   nueva de la app. GET /api/featured-game es público (sin
   autenticación). Se lee el archivo en cada petición para que un cambio
   se note sin reiniciar el servidor. Sin el archivo, con JSON roto o
   sin capturas responde 404: la app no inventa capturas y usa su ficha.
   Las estadísticas vienen del sistema de calificaciones de juegos que
   ya existe (gameStatsFor): sin calificaciones, media 0 y conteo 0. */
function readFeaturedGame() {
  try {
    var raw = fs.readFileSync(path.join(__dirname, 'featured-game.json'), 'utf8');
    var d = JSON.parse(raw);
    if (!d || !d.game || !d.game.id || !d.game.name || !d.game.package || !Array.isArray(d.screenshots) || !d.screenshots.length) return null;
    var shots = d.screenshots.filter(function (s) { return typeof s === 'string' && s; });
    if (!shots.length) return null;
    return {
      game: { id: String(d.game.id), name: String(d.game.name), package: String(d.game.package), version: String(d.game.version || ''), logo: String(d.game.logo || ''), icon: String(d.game.icon || '') },
      screenshots: shots
    };
  } catch (e) { return null; }
}
app.get('/api/featured-game', (req, res) => {
  var fg = readFeaturedGame();
  if (!fg) return res.status(404).json({ ok: false, error: 'Sin juego destacado por ahora.' });
  return res.json({ ok: true, game: fg.game, screenshots: fg.screenshots, stats: gameStatsFor('fantore-resurreccion') });
});

/* v4.2: catálogo de dramas cortos. Igual que las carteleras
   de cine (v3.9) y juegos (v4.0): la lista vive en kdramas.json en la
   raíz del repo; cada 3 meses se cambia ese archivo y los dramas
   rotan sin una versión nueva de la app. GET /api/kdramas es público
   (sin autenticación). Se lee el archivo en cada petición para que un
   cambio se note sin reiniciar el servidor. Sin el archivo, con JSON
   roto o con la lista vacía responde ok:false: la app no inventa
   dramas y usa su lista fija.
   v4.4: los dramas ya no son videos de YouTube (DramaBox): son
   originales de WordRed, novela visual — cada serie trae sinopsis y
   portada, y cada capítulo trae número, título, texto e imagen.
   v4.5: cada capítulo puede traer además un `video` opcional (URL
   https de Cloudinary con el video generado del capítulo); el
   endpoint lo deja pasar tal cual y la app lo reproduce. Sin video,
   la app muestra la imagen con «Próximamente en video». Nada más
   cambia en la 4.5.
   v4.6: los dramas vuelven a ser series cortas de DramaBox (videos de
   YouTube): cada serie trae portada, total de capítulos y la lista de
   capítulos gratis con su videoId; los capítulos de miembros no traen
   videoId y la app los muestra como texto «Disponible en DramaBox».
   readKdramas() acepta AMBAS formas (la de DramaBox y la de los
   dramas originales con texto e imagen), así el catálogo se puede
   cambiar en kdramas.json sin tocar el servidor. Nada más cambia
   en la 4.6. */
function readKdramas() {
  try {
    var raw = fs.readFileSync(path.join(__dirname, 'kdramas.json'), 'utf8');
    var d = JSON.parse(raw);
    var list = d && Array.isArray(d.kdramas) ? d.kdramas : null;
    if (!list || !list.length) return null;
    /* v4.6: dos formas válidas. (1) DramaBox: serie con portada, total
       de capítulos y capítulos gratis con su videoId de YouTube
       (los capítulos de miembros no traen videoId). (2) Originales de
       WordRed: serie con sinopsis y capítulos con texto e imagen
       (video opcional). Se limpian los campos y se pasa cada serie tal
       cual es; una serie que no cumpla ninguna forma se descarta. */
    var clean = list.filter(function (s) {
      if (!s || !s.id || !s.name || !s.poster) return false;
      var isDramaBox = Array.isArray(s.eps) && s.eps.length && typeof s.totalEps === 'number' && s.totalEps >= s.eps.length &&
        s.eps.every(function (e) { return e && typeof e.ep === 'number' && e.videoId && e.title && e.thumb; });
      var isOriginal = s.synopsis && Array.isArray(s.chapters) && s.chapters.length &&
        s.chapters.every(function (c) { return c && typeof c.n === 'number' && c.title && typeof c.text === 'string' && c.text.length > 100 && c.image; });
      return isDramaBox || isOriginal;
    }).map(function (s) {
      var out = { id: String(s.id), name: String(s.name), poster: String(s.poster) };
      if (s.synopsis) out.synopsis = String(s.synopsis);
      if (s.year) out.year = Number(s.year);
      if (s.channel) out.channel = String(s.channel);
      if (s.source) out.source = String(s.source);
      if (s.dramaBoxId) out.dramaBoxId = String(s.dramaBoxId);
      if (Array.isArray(s.eps) && s.eps.length) {
        out.totalEps = Number(s.totalEps);
        out.eps = s.eps.map(function (e) { return { ep: Number(e.ep), videoId: String(e.videoId), title: String(e.title), ytTitle: String(e.ytTitle || e.title), thumb: String(e.thumb) }; });
      }
      if (Array.isArray(s.chapters) && s.chapters.length) {
        out.chapters = s.chapters.map(function (c) { var ch = { n: c.n, title: String(c.title), text: String(c.text), image: String(c.image) }; if (c.video) ch.video = String(c.video); return ch; });
      }
      return out;
    });
    return clean.length ? clean : null;
  } catch (e) { return null; }
}
app.get('/api/kdramas', (req, res) => {
  var kdramas = readKdramas();
  if (!kdramas) return res.status(404).json({ ok: false, error: 'Sin dramas por ahora.' });
  return res.json({ ok: true, kdramas: kdramas });
});

/* v1.5.8 (servidor 3.0): página de inicio con Google en el navegador
   (como en YouTube). La app abre esta página; Google muestra su propia
   pantalla para poner el correo y la contraseña, y devuelve el token de
   ID (GIS) a la página, que vuelve a la app con wordred://oauth/google.
   El token se verifica en POST /api/auth/google como antes (aud =
   GOOGLE_CLIENT_ID); aquí no hay secreto ni intercambio de código.
   En Google Cloud, el origen de esta página debe estar en "Orígenes de
   JavaScript autorizados" del cliente web de WordRed. */
app.get('/oauth/google', (req, res) => {
  let html = '';
  try { html = fs.readFileSync(path.join(__dirname, 'oauth-google.html'), 'utf8'); } catch (e) {}
  if (!html) return res.status(500).send('La página de inicio con Google no está disponible.');
  const cid = GOOGLE_CLIENT_ID.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  res.type('html').send(html.split('__GOOGLE_CLIENT_ID__').join(cid));
});

/* ---- comprobación de un código (v2.9: la misma regla para el código
   por teléfono y por correo) ----
   Devuelve {ok:true} o {ok:false, status, error}. El registro con el
   código se guarda en `auth` (por teléfono o por correo) y se persiste
   en auth.json. */
function checkAuthCode(a, code) {
  if (!a || !a.codeHash) return { ok: false, status: 400, error: 'No hay un código activo. Pide uno nuevo.' };
  if (Date.now() - a.codeAt > CODE_TTL_MS) return { ok: false, status: 400, error: 'El código caducó. Pide uno nuevo.' };
  a.codeAttempts = (a.codeAttempts || 0) + 1;
  if (a.codeAttempts > CODE_MAX_ATTEMPTS) return { ok: false, status: 400, error: 'Demasiados intentos. Pide un código nuevo.' };
  if (sha(String(code || '').trim()) !== a.codeHash) return { ok: false, status: 400, error: 'El código no coincide.' };
  return { ok: true };
}
function issueTokenFor(id) {
  const a = auth[id] || {};
  a.verified = true;
  a.codeHash = '';
  a.token = genToken();
  a.tokenAt = Date.now();
  auth[id] = a;
  saveJson('auth.json', auth);
  return a.token;
}

/* ---- autenticación por teléfono ---- */
app.post('/api/auth/request-code', async (req, res) => {
  const phone = normPhone(req.body && req.body.phone);
  if (phone.length < 8 || phone.length > 15) return res.status(400).json({ ok: false, error: 'Número de teléfono inválido.' });
  const t = Date.now();
  const hits = (codeHits[phone] || []).filter(x => t - x < 3600000);
  if (hits.length >= REGISTER_PER_HOUR) return res.status(429).json({ ok: false, error: 'Ya pediste varios códigos. Inténtalo en una hora.' });
  hits.push(t);
  codeHits[phone] = hits;
  const code = genCode();
  auth[phone] = Object.assign(auth[phone] || {}, { codeHash: sha(code), codeAt: t, codeAttempts: 0 });
  saveJson('auth.json', auth);
  // v1.3: si la app manda su hash de SMS Retriever, se agrega al SMS para
  // que Android se lo entregue solo a esta app y se vincule sola.
  const appHash = String((req.body && req.body.appHash) || '').trim().slice(0, 11);
  const sent = await sendSms(phone, code, appHash);
  if (sent) return res.json({ ok: true, phone });
  console.log('[DEV] código para +' + phone + ': ' + code);
  return res.json({ ok: true, phone, devCode: code });
});

app.post('/api/auth/verify', async (req, res) => {
  const phone = normPhone(req.body && req.body.phone);
  const code = String((req.body && req.body.code) || '').trim();
  const a = auth[phone];
  const chk = checkAuthCode(a, code);
  if (!chk.ok) { saveJson('auth.json', auth); return res.status(chk.status).json({ ok: false, error: chk.error }); }
  const token = issueTokenFor(phone);
  await flushPendingWrites();
  return res.json({ ok: true, phone, token, hasProfile: !!profiles[phone] });
});

/* ---- autenticación por correo (v2.9) ----
   El código de 6 dígitos se manda al correo con SMTP si está
   configurado; si no, modo de prueba (devCode), igual que el código
   por teléfono sin Twilio. Las mismas reglas: hash SHA-256, 10
   minutos, 5 intentos, 3 códigos por hora y correo. */
app.post('/api/auth/email/request-code', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  if (!validEmail(email)) return res.status(400).json({ ok: false, error: 'Escribe un correo válido.' });
  const t = Date.now();
  const hits = (emailCodeHits[email] || []).filter(x => t - x < 3600000);
  if (hits.length >= REGISTER_PER_HOUR) return res.status(429).json({ ok: false, error: 'Ya pediste varios códigos. Inténtalo en una hora.' });
  hits.push(t);
  emailCodeHits[email] = hits;
  const code = genCode();
  auth[email] = Object.assign(auth[email] || {}, { codeHash: sha(code), codeAt: t, codeAttempts: 0 });
  saveJson('auth.json', auth);
  const sent = await sendEmail(email, 'Tu código de WordRed', 'Tu código de verificación de WordRed es: ' + code + '\n\nTiene 10 minutos de vigencia. Si no pediste este código, ignora este correo.');
  if (sent) return res.json({ ok: true, email, sentByEmail: true });
  console.log('[DEV] código por correo para ' + email + ': ' + code);
  return res.json({ ok: true, email, sentByEmail: false, devCode: code });
});

app.post('/api/auth/email/verify', async (req, res) => {
  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const code = String((req.body && req.body.code) || '').trim();
  const a = auth[email];
  const chk = checkAuthCode(a, code);
  if (!chk.ok) { saveJson('auth.json', auth); return res.status(chk.status).json({ ok: false, error: chk.error }); }
  const token = issueTokenFor(email);
  await flushPendingWrites();
  return res.json({ ok: true, email, token, hasProfile: !!profiles[email] });
});

/* ---- inicio con Google (v2.9) ----
   La app manda el token de ID que le dio Google y el servidor lo
   verifica de verdad (firma, cliente, emisor, caducidad y correo
   verificado). Sin GOOGLE_CLIENT_ID configurado, responde 503 y
   NUNCA acepta el token. La identidad de la cuenta es el correo. */
app.post('/api/auth/google', async (req, res) => {
  if (!GOOGLE_ENABLED) return res.status(503).json({ ok: false, error: 'El inicio con Google no está configurado en el servidor.' });
  const idToken = String((req.body && req.body.idToken) || '').trim();
  if (!idToken) return res.status(400).json({ ok: false, error: 'Falta el token de Google.' });
  let g;
  try { g = await verifyGoogleIdToken(idToken); }
  catch (e) { return res.status(401).json({ ok: false, error: (e && e.message) || 'Token de Google inválido.' }); }
  const email = g.email;
  const token = issueTokenFor(email);
  await flushPendingWrites();
  return res.json({ ok: true, email, token, hasProfile: !!profiles[email], name: g.name, photo: g.picture });
});

/* ---- perfiles ---- */
app.post('/api/profile', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const name = String((req.body && req.body.name) || '').trim();
  if (name.length < 2) return res.status(400).json({ ok: false, error: 'Escribe tu nombre.' });
  const p = profiles[phone] || { phone, createdAt: Date.now(), isDemo: false };
  /* v3.8: la insignia de verificación nace en false; solo el endpoint
     de verificación la pone en true (criterios reales, nada manual). */
  if (p.verified === undefined) p.verified = false;
  p.name = name;
  /* v3.8: la biografía solo se toca si el cliente la manda. Antes se
     ponía a '' en cada actualización parcial (por ejemplo al cambiar
     solo la nota o el video de perfil), y eso borraba el perfil
     completo sin avisar — y rompía la verificación, que exige
     biografía. Igual que photo/cover, que ya eran condicionales. */
  if (req.body && req.body.bio !== undefined) p.bio = String(req.body.bio || '').slice(0, 200);
  if (req.body && req.body.photo !== undefined) p.photo = req.body.photo || '';
  if (req.body && req.body.cover !== undefined) p.cover = req.body.cover || '';
  // Personalización v1.1: marco, tema, campos de biografía y privacidad por sección.
  const FRAMES = ['none', 'rojo', 'dorado', 'azul', 'verde', 'morado', 'arcoiris'];
  const ACCENTS = ['rojo', 'azul', 'verde', 'morado', 'naranja', 'turquesa'];
  if (req.body && req.body.frame !== undefined && FRAMES.includes(req.body.frame)) p.frame = req.body.frame;
  if (req.body && req.body.accent !== undefined && ACCENTS.includes(req.body.accent)) p.accent = req.body.accent;
  if (req.body && req.body.job !== undefined) p.job = String(req.body.job || '').slice(0, 100);
  if (req.body && req.body.education !== undefined) p.education = String(req.body.education || '').slice(0, 100);
  if (req.body && req.body.city !== undefined) p.city = String(req.body.city || '').slice(0, 80);
  if (req.body && req.body.relationship !== undefined) p.relationship = String(req.body.relationship || '');
  if (req.body && req.body.birthday !== undefined) p.birthday = String(req.body.birthday || '');
  if (req.body && req.body.website !== undefined) p.website = String(req.body.website || '');
  if (req.body && req.body.pinnedPosts !== undefined && Array.isArray(req.body.pinnedPosts)) p.pinnedPosts = req.body.pinnedPosts.slice(0, 3);
  /* v3.8: nota en el perfil (máx. 60 caracteres, vacía por defecto);
     canción del día {song, date} (la app solo la muestra si date es
     hoy); portada de las Destacadas (URL http(s) o '' para quitarla);
     video de la foto de perfil {url, durationMs} (máx. 6 s); marco
     de la foto (avatarFrame) y filtro de la foto (avatarFilter),
     valores fijos — los demás se ignoran, como el frame que ya existe. */
  if (req.body && req.body.note !== undefined) p.note = String(req.body.note || '').slice(0, 60);
  if (req.body && req.body.avatarFrame !== undefined) {
    const AVATAR_FRAMES = ['none', 'rojo', 'dorado', 'azul', 'verde', 'morado', 'arcoiris'];
    if (AVATAR_FRAMES.includes(req.body.avatarFrame)) p.avatarFrame = req.body.avatarFrame;
  }
  if (req.body && req.body.avatarFilter !== undefined) {
    const AVATAR_FILTERS = ['Original', 'Blanco y negro', 'Sepia', 'Vivo', 'Suave'];
    if (AVATAR_FILTERS.includes(req.body.avatarFilter)) p.avatarFilter = req.body.avatarFilter;
  }
  if (req.body && req.body.songOfTheDay !== undefined) {
    const sod = req.body.songOfTheDay;
    if (sod === null) p.songOfTheDay = null;
    else if (sod && typeof sod === 'object' && sod.song && /^\d{4}-\d{2}-\d{2}$/.test(String(sod.date || ''))) {
      p.songOfTheDay = { song: sod.song, date: String(sod.date) };
    }
  }
  if (req.body && req.body.pinnedCover !== undefined) {
    const pc = String(req.body.pinnedCover || '').trim();
    if (pc && !isHttpUrl(pc)) return res.status(400).json({ ok: false, error: 'Portada de destacadas inválida.' });
    p.pinnedCover = pc;
  }
  if (req.body && req.body.avatarVideo !== undefined) {
    const av = req.body.avatarVideo;
    if (av === null || av === '') p.avatarVideo = null;
    else if (typeof av === 'string') {
      if (!isHttpUrl(av)) return res.status(400).json({ ok: false, error: 'Video de perfil inválido.' });
      p.avatarVideo = { url: av.trim(), durationMs: null };
    } else if (av && typeof av === 'object' && typeof av.url === 'string') {
      if (!isHttpUrl(av.url)) return res.status(400).json({ ok: false, error: 'Video de perfil inválido.' });
      const dur = Number(av.durationMs);
      if (av.durationMs !== undefined && av.durationMs !== null && (!isFinite(dur) || dur > 6000)) {
        return res.status(400).json({ ok: false, error: 'El video de perfil debe durar 6 segundos como máximo.' });
      }
      p.avatarVideo = { url: av.url.trim(), durationMs: (av.durationMs === undefined || av.durationMs === null) ? null : dur };
    }
  }
  if (req.body && req.body.sectionPrivacy !== undefined) {
    const okVals = ['Público', 'Amigos', 'Solo yo'];
    const sp = req.body.sectionPrivacy;
    p.sectionPrivacy = {
      bio: okVals.includes(sp.bio) ? sp.bio : 'Público',
      friends: okVals.includes(sp.friends) ? sp.friends : 'Público',
      posts: okVals.includes(sp.posts) ? sp.posts : 'Público'
    };
  }
  profiles[phone] = p;
  if (!friends[phone]) friends[phone] = [];
  saveAll();
  /* v1.4: el cambio de perfil (foto, portada, nombre) se difunde en vivo
     a todos los teléfonos conectados para que se vea sin reabrir nada. */
  broadcast({ kind: 'profile', profile: p });
  await flushPendingWrites();
  return res.json({ ok: true, profile: p });
});
app.get('/api/profile/:phone', (req, res) => {
  const p = profiles[normPhone(req.params.phone)];
  if (!p) return res.status(404).json({ ok: false, error: 'Perfil no encontrado.' });
  return res.json({ ok: true, profile: p });
});

/* ---- archivos en el servidor (v1.4) ----
   La app sube por partes, igual que el puente nativo: abre la subida
   (start), manda trozos de base64 (chunk, máx. 4 MB por trozo) y la
   cierra (finish). Al cerrar, el servidor arma el archivo y lo sube
   a Cloudinary (almacenamiento PERMANENTE, plan gratis) si está
   configurado; la URL que se guarda y se devuelve es la de
   Cloudinary. Sin Cloudinary configurado, o si su subida falla, el
   archivo queda en el disco del servidor (uploads/) y se sirve por
   URL pública /media/<id>.<ext>, con el tipo de contenido correcto:
   ese es solo un RESPALDO TEMPORAL (en Render gratis el disco es
   efímero y se pierde al reiniciar o redesplegar). Sin tope impuesto
   por la app: el límite real es Cloudinary (25 GB gratis) o el disco
   del servidor. Solo el dueño puede borrar su archivo y nunca se
   aceptan rutas fuera de la carpeta de subidas. */
app.post('/api/media/start', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const name = String((req.body && req.body.name) || 'archivo').slice(0, 200);
  const type = String((req.body && req.body.type) || 'application/octet-stream').slice(0, 100);
  sweepStaleUploads();
  const uploadId = 'up_' + crypto.randomBytes(8).toString('hex');
  pendingUploads[uploadId] = { owner: phone, name, type, ext: mediaExtFor(type), received: 0, createdAt: Date.now() };
  try { fs.writeFileSync(path.join(MEDIA_TMP_DIR, uploadId + '.part'), Buffer.alloc(0)); } catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo preparar la subida.' }); }
  return res.json({ ok: true, uploadId });
});
app.post('/api/media/chunk', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const uploadId = String((req.body && req.body.uploadId) || '');
  const up = pendingUploads[uploadId];
  if (!up) return res.status(404).json({ ok: false, error: 'Subida no encontrada.' });
  if (up.owner !== phone) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  const data = String((req.body && req.body.data) || '').replace(/\s/g, '');
  if (!data || data.length > 4 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(data)) return res.status(400).json({ ok: false, error: 'Trozo inválido.' });
  let buf;
  try { buf = Buffer.from(data, 'base64'); } catch (e) { return res.status(400).json({ ok: false, error: 'Trozo inválido.' }); }
  if (!buf.length) return res.status(400).json({ ok: false, error: 'Trozo vacío.' });
  try { fs.appendFileSync(path.join(MEDIA_TMP_DIR, uploadId + '.part'), buf); } catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar el trozo.' }); }
  up.received += buf.length;
  return res.json({ ok: true, received: up.received });
});
app.post('/api/media/finish', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const uploadId = String((req.body && req.body.uploadId) || '');
  const up = pendingUploads[uploadId];
  if (!up) return res.status(404).json({ ok: false, error: 'Subida no encontrada.' });
  if (up.owner !== phone) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  const id = 'm_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex');
  const fileName = id + '.' + up.ext;
  const tmpPath = path.join(MEDIA_TMP_DIR, uploadId + '.part');
  let buf;
  try { buf = fs.readFileSync(tmpPath); } catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar el archivo.' }); }
  delete pendingUploads[uploadId];
  /* v1.4: primero se intenta Cloudinary (para siempre). Si no está
     configurado o su subida falla, se guarda en el disco local como
     respaldo temporal (en Render gratis se pierde al reiniciar). */
  const cfg = cloudinaryConfig();
  if (cfg.enabled) {
    try {
      const cloud = await uploadToCloudinary(cfg, buf, up.type, fileName, id);
      try { fs.unlinkSync(tmpPath); } catch (e) {}
      media[id] = { id, owner: phone, name: up.name, type: up.type, ext: up.ext, size: up.received, createdAt: Date.now(), url: cloud.secure_url, cloudinaryUrl: cloud.secure_url, publicId: cloud.public_id };
      saveJson('media.json', media);
      return res.json({ ok: true, id, url: cloud.secure_url, type: up.type, size: up.received, cloudinary: true });
    } catch (e) {
      console.log('[media] Cloudinary falló, se guarda en disco local: ' + (e && e.message ? e.message : e));
    }
  }
  try {
    fs.renameSync(tmpPath, path.join(MEDIA_DIR, fileName));
  } catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar el archivo.' }); }
  media[id] = { id, owner: phone, name: up.name, type: up.type, ext: up.ext, size: up.received, createdAt: Date.now(), url: '/media/' + fileName };
  saveJson('media.json', media);
  return res.json({ ok: true, id, url: '/media/' + fileName, type: up.type, size: up.received, cloudinary: false });
});
app.get('/media/:file', (req, res) => {
  const file = String(req.params.file || '');
  const m = file.match(/^([A-Za-z0-9_-]+)\.([a-z0-9]{2,4})$/);
  if (!m || !MEDIA_EXT_TO_CT[m[2]]) return res.status(404).json({ ok: false, error: 'Archivo no encontrado.' });
  /* v1.4: si el archivo vive en Cloudinary (para siempre), se redirige
     a su URL; si es del respaldo local, se sirve desde el disco. */
  const rec = media[m[1]];
  if (rec && rec.cloudinaryUrl) return res.redirect(302, rec.cloudinaryUrl);
  const filePath = path.join(MEDIA_DIR, path.basename(file));
  if (!fs.existsSync(filePath)) return res.status(404).json({ ok: false, error: 'Archivo no encontrado.' });
  res.setHeader('Content-Type', MEDIA_EXT_TO_CT[m[2]]);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.sendFile(filePath);
});
app.delete('/api/media/:id', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const rec = media[req.params.id];
  if (!rec) return res.status(404).json({ ok: false, error: 'Archivo no encontrado.' });
  if (rec.owner !== phone) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  /* v1.4: si vive en Cloudinary y hay secretos para borrar, se borra
     también en la nube; sin secretos, la copia en la nube queda
     huérfana (se borra el registro y la copia local). */
  if (rec.cloudinaryUrl) {
    const cfg = cloudinaryConfig();
    const gone = await destroyFromCloudinary(cfg, rec);
    if (!gone && cfg.apiKey && cfg.apiSecret) console.log('[media] no se pudo borrar en Cloudinary: ' + rec.publicId);
  }
  try { fs.unlinkSync(path.join(MEDIA_DIR, rec.id + '.' + rec.ext)); } catch (e) {}
  delete media[req.params.id];
  saveJson('media.json', media);
  return res.json({ ok: true });
});

/* ---- feed y publicaciones ---- */
function canSee(viewer, post) {
  if (isBlockedSrv(viewer, post.author)) return false; // ola 7
  if (post.isAd) return true; // los anuncios de empresas son públicos (ola 8)
  if (post.pageId) {
    const pg = pages.find(x => x.id === post.pageId);
    if (!pg) return false;
    return pg.followers.includes(viewer) || pg.creator === viewer || post.author === viewer;
  }
  if (post.groupId) {
    const g = groups.find(x => x.id === post.groupId);
    if (!g) return false;
    return g.members.includes(viewer) || post.author === viewer;
  }
  if (post.privacy === 'Solo yo') return post.author === viewer;
  if (post.privacy === 'Amigos') {
    if (post.author === viewer) return true;
    return (friends[viewer] || []).includes(post.author);
  }
  return true;
}
app.get('/api/feed', (req, res) => {
  const phone = normPhone(req.query.phone);
  const visible = posts.filter(p => canSee(phone, p)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100);
  /* v3.8: las publicaciones con encuesta con foto llevan los conteos
     reales y el voto de quien pide. */
  return res.json({ ok: true, posts: visible.map(function (p) { return enrichPostForViewer(p, phone); }), profiles: Object.values(profiles) });
});
/* Edición de video (v1.2, ola 11): stickers, subtítulos, canción y recorte. */
function validateVideoEditsSrv(edits) {
  const out = { stickers: [], subtitles: [], song: null, trimStart: 0, trimEnd: null, durationMs: 0 };
  if (!edits || typeof edits !== 'object') return out;
  if (Array.isArray(edits.stickers)) {
    edits.stickers.forEach(k => {
      if (!k || !String(k.emoji || '').trim()) return;
      out.stickers.push({ emoji: String(k.emoji).slice(0, 8), size: Math.max(20, Math.min(120, parseInt(k.size, 10) || 48)), x: Math.max(0, Math.min(100, parseInt(k.x, 10) || 0)), y: Math.max(0, Math.min(100, parseInt(k.y, 10) || 0)) });
    });
  }
  if (Array.isArray(edits.subtitles)) {
    edits.subtitles.forEach(t => {
      if (!t || !String(t.text || '').trim()) return;
      const a = Math.max(0, parseInt(t.start, 10) || 0);
      const b = Math.max(a, parseInt(t.end, 10) || 0);
      out.subtitles.push({ text: String(t.text).slice(0, 120), start: a, end: b, color: String(t.color || '#ffffff').slice(0, 20), size: Math.max(14, Math.min(48, parseInt(t.size, 10) || 20)), x: Math.max(0, Math.min(100, parseInt(t.x, 10) || 50)), y: Math.max(0, Math.min(100, parseInt(t.y, 10) || 85)) });
    });
  }
  out.song = validateSongSrv(edits.song);
  const dur = Math.max(0, parseInt(edits.durationMs, 10) || 0);
  out.durationMs = dur;
  let ts = Math.max(0, parseInt(edits.trimStart, 10) || 0);
  let te = edits.trimEnd === null || edits.trimEnd === undefined ? null : Math.max(0, parseInt(edits.trimEnd, 10) || 0);
  if (dur > 0) { ts = Math.min(ts, dur); if (te !== null) te = Math.min(te, dur); }
  if (te !== null && te <= ts) te = null;
  out.trimStart = ts; out.trimEnd = te;
  return out;
}
/* Canción de una publicación (v1.2, olas 8-9): {id, title, artist, src, mood, auto} */
function validateSongSrv(song) {
  if (!song || typeof song !== 'object') return null;
  const title = String(song.title || '').trim().slice(0, 100);
  if (!title) return null;
  return {
    id: String(song.id || '').slice(0, 40),
    title, artist: String(song.artist || '').slice(0, 100),
    src: String(song.src || '').slice(0, 2000),
    mood: String(song.mood || '').slice(0, 30),
    auto: !!song.auto
  };
}
/* v4.1: promoción de una publicación — solo un booleano. Devuelve
   undefined si no viene en la petición (no cambia nada), el booleano
   si es válido, y null si el valor no es booleano (se rechaza con 400
   en vez de guardarse como si fuera válido). */
function validatePromotedSrv(v) {
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') return null;
  return v;
}
app.post('/api/posts', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const body = req.body && req.body.post ? req.body.post : req.body;
  const text = String(body.text || '').trim();
  if (!text && !body.media && !body.link && !body.poll && !(Array.isArray(body.mediaList) && body.mediaList.length)) return res.status(400).json({ ok: false, error: 'Publicación vacía.' });
  let link = null;
  if (body.link) {
    const lb = typeof body.link === 'object' ? body.link : {};
    const ln = normalizeLinkUrl(typeof body.link === 'string' ? body.link : (lb.url || ''));
    if (!ln) return res.status(400).json({ ok: false, error: 'Enlace inválido.' });
    link = { url: ln.url, host: ln.host, title: String(lb.title || ln.host).slice(0, 200), desc: String(lb.desc || '').slice(0, 500), image: String(lb.image || '') };
  }
  if (body.groupId) {
    const g = groups.find(x => x.id === body.groupId);
    if (!g) return res.status(404).json({ ok: false, error: 'Grupo no encontrado.' });
    if (!g.members.includes(phone)) return res.status(403).json({ ok: false, error: 'No eres miembro del grupo.' });
  }
  if (body.pageId) {
    const pg = pages.find(x => x.id === body.pageId);
    if (!pg) return res.status(404).json({ ok: false, error: 'Página no encontrada.' });
    if (pg.creator !== phone) return res.status(403).json({ ok: false, error: 'Solo quien creó la página puede publicar en ella.' });
  }
  /* v3.8: dueto — el vínculo al post original solo se conserva si ese
     post existe de verdad; si no, se guarda sin vínculo (nunca se
     inventa un original). */
  let duetOf = null;
  if (body.duetOf && typeof body.duetOf === 'object' && typeof body.duetOf.postId === 'string' && body.duetOf.postId) {
    const orig = posts.find(function (p) { return p.id === body.duetOf.postId; });
    if (orig) duetOf = { postId: orig.id, author: orig.author };
  }
  /* v3.8: reto, estado de ánimo, lugar y encuesta con foto — solo se
     conservan si son válidos; si no, se guardan como null (nunca se
     inventan). La encuesta con foto necesita exactamente 2 fotos con
     URL válida; si no, la publicación se rechaza con 400. */
  const challenge = normalizeChallenge(body.challenge);
  const mood = validateMood(body.mood);
  const place = validatePlace(body.place);
  let photoPoll = null;
  if (body.photoPoll !== undefined && body.photoPoll !== null) {
    photoPoll = validatePhotoPoll(body.photoPoll);
    if (!photoPoll) return res.status(400).json({ ok: false, error: 'La encuesta con foto necesita dos fotos válidas.' });
  }
  /* v4.1: promoción — solo un booleano. Sin el campo la publicación
     queda con promoted:false; un valor no booleano se rechaza. */
  const promoted = validatePromotedSrv(body.promoted);
  if (promoted === null) return res.status(400).json({ ok: false, error: 'Promoción no válida.' });
  const post = {
    id: body.id || uid('post'), author: phone, text: text.slice(0, 2000),
    media: body.media || '', mediaType: body.mediaType || '',
    mediaList: Array.isArray(body.mediaList) ? body.mediaList.slice() : [], /* ola 11: sin límite */
    bg: String(body.bg || 'none'),
    feeling: body.feeling || null, tags: Array.isArray(body.tags) ? body.tags.slice(0, 10) : [],
    location: String(body.location || '').slice(0, 120),
    link: link, pageId: body.pageId || null, poll: body.poll || null,
    audioTitle: String(body.audioTitle || '').slice(0, 100), audioCover: String(body.audioCover || '').slice(0, 2000),
    song: validateSongSrv(body.song), videoEdits: validateVideoEditsSrv(body.videoEdits), isAd: !!body.isAd, adTitle: String(body.adTitle || '').slice(0, 100), adLink: String(body.adLink || '').slice(0, 500),
    privacy: body.groupId || body.pageId ? 'Público' : (['Público', 'Amigos', 'Solo yo'].includes(body.privacy) ? body.privacy : 'Público'),
    groupId: body.groupId || null, sharedFrom: body.sharedFrom || null, duetOf: duetOf,
    challenge: challenge, mood: mood, place: place, photoPoll: photoPoll,
    liveId: body.liveId || null, // aviso de un live (v1.5): tocarlo entra al live
    isLiveRecording: !!body.isLiveRecording, // v2.1: grabación de un live como publicación en el inicio
    liveRecordingId: body.liveRecordingId || null,
    liveRecDurationMs: parseInt(body.liveRecDurationMs, 10) || 0,
    createdAt: body.createdAt || Date.now(), likes: {}, comments: [], shares: [], savedBy: [], isDemo: false,
    promoted: promoted === true, // v4.1: true = publicación promocionada (insignia + primer lugar en todos los teléfonos)
    editCount: 0, editedAt: null, edited: false
  };
  if (posts.some(p => p.id === post.id)) return res.json({ ok: true, post });
  posts.unshift(post);
  saveJson('posts.json', posts);
  broadcast({ kind: 'post', post });
  // Avisar a quienes siguen al autor (v1.2, ola 12): amigos -> 'post',
  // seguidores de la página -> 'pagepost', miembros del grupo -> 'grouppost'.
  // El autor no se avisa a sí mismo y los bloqueados no reciben el aviso.
  var authorName = (profiles[phone] && profiles[phone].name) || phone;
  if (post.pageId) {
    var pgN = pages.find(function (p) { return p.id === post.pageId; });
    (pgN && pgN.followers || []).forEach(function (f) {
      if (f !== phone && !isBlockedSrv(phone, f)) notify('pagepost', phone, f, authorName + ' publicó en ' + (pgN.name || 'una página') + '.', post.id);
    });
  } else if (post.groupId) {
    var grN = groups.find(function (g) { return g.id === post.groupId; });
    (grN && grN.members || []).forEach(function (m) {
      if (m !== phone && !isBlockedSrv(phone, m)) notify('grouppost', phone, m, authorName + ' publicó en ' + (grN.name || 'un grupo') + '.', post.id);
    });
  } else {
    (friends[phone] || []).forEach(function (f) {
      if (f !== phone && !isBlockedSrv(phone, f)) notify('post', phone, f, authorName + ' publicó algo nuevo.', post.id);
    });
  }
  await flushPendingWrites();
  return res.json({ ok: true, post });
});
/* ---- modificar publicaciones (v1.2, ola 10): máx. 5 ediciones ---- */
app.put('/api/posts/:id', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  if (post.author !== phone) return res.status(403).json({ ok: false, error: 'Solo quien publicó puede modificarla.' });
  const body = (req.body && req.body.post) || req.body;
  /* v4.1: promoción — activar o quitar la promoción NO es editar el
     contenido: una petición que solo cambia `promoted` no gasta una de
     las 5 ediciones (una promoción pagada nunca se bloquea por haber
     editado el texto 5 veces) ni marca la publicación como editada. */
  const promoOnly = body.promoted !== undefined && Object.keys(body).every(function (k) { return k === 'promoted'; });
  if (!promoOnly && (post.editCount || 0) >= 5) return res.status(400).json({ ok: false, error: 'Esta publicación ya se editó 5 veces (el máximo). Ya no se puede modificar.' });
  if (body.text !== undefined) {
    const text = String(body.text || '').trim();
    if (text.length > 2000) return res.status(400).json({ ok: false, error: 'La publicación es demasiado larga.' });
    post.text = text;
  }
  if (body.media !== undefined) post.media = body.media || '';
  if (body.mediaType !== undefined) post.mediaType = body.mediaType || '';
  if (Array.isArray(body.mediaList)) post.mediaList = body.mediaList.slice(); /* ola 11: sin límite */
  if (body.bg !== undefined) post.bg = String(body.bg || 'none');
  if (body.feeling !== undefined) post.feeling = body.feeling || null;
  if (Array.isArray(body.tags)) post.tags = body.tags.slice(0, 10);
  if (body.location !== undefined) post.location = String(body.location || '').slice(0, 120);
  if (body.link !== undefined) post.link = body.link || null;
  if (body.poll !== undefined) {
    if (body.poll) {
      const votes = (post.poll ? post.poll.options.reduce((n, o) => n + (o.votes || []).length, 0) : 0);
      if (votes > 0) return res.status(400).json({ ok: false, error: 'La encuesta ya tiene votos y no se puede cambiar.' });
      post.poll = body.poll;
    } else post.poll = null;
  }
  if (body.audioTitle !== undefined) post.audioTitle = String(body.audioTitle || '').slice(0, 100);
  if (body.audioCover !== undefined) post.audioCover = String(body.audioCover || '').slice(0, 2000);
  if (body.song !== undefined) post.song = validateSongSrv(body.song);
  if (body.videoEdits !== undefined) post.videoEdits = validateVideoEditsSrv(body.videoEdits);
  /* v4.1: promoción — solo un booleano; un valor no booleano se rechaza. */
  if (body.promoted !== undefined) {
    const pv = validatePromotedSrv(body.promoted);
    if (pv === null) return res.status(400).json({ ok: false, error: 'Promoción no válida.' });
    post.promoted = pv;
  }
  if (!post.text && !post.media && !post.link && !post.sharedFrom && !post.poll) return res.status(400).json({ ok: false, error: 'La publicación no puede quedar vacía.' });
  if (!promoOnly) {
    post.editCount = (post.editCount || 0) + 1;
    post.editedAt = Date.now();
    post.edited = true;
  }
  saveJson('posts.json', posts);
  return res.json({ ok: true, post, editsLeft: 5 - post.editCount });
});

/* ---- v4.3: solicitudes de promoción (WordRed Creador) ----
   La app 1.5.53 ya NO activa la promoción sola con «Ya pagué»: manda
   una solicitud y el creador la aprueba o rechaza desde su app. Las
   solicitudes viven en la colección `promotion_requests` (o en
   promotion-requests.json sin MongoDB). Aprobar pone post.promoted=true
   por el camino de siempre, SIN gastar una de las 5 ediciones y sin
   marcar la publicación como editada; rechazar la deja sin
   promocionar. Si la escritura falla (MongoDB caído), el endpoint
   devuelve 500 con un error claro: nunca se finge un éxito. */
const PROMO_TIERS_43 = [50, 100, 200, 500];
function promoRequestPublic(r) {
  const post = posts.find(function (p) { return p.id === r.postId; });
  const author = (profiles[r.userPhone] && profiles[r.userPhone].name) || r.userPhone;
  return {
    id: r.id, postId: r.postId, userPhone: r.userPhone, authorName: author,
    postText: post ? String(post.text || '').slice(0, 80) : '',
    tier: r.tier, goal: r.goal || 'views', status: r.status,
    createdAt: r.createdAt, decidedAt: r.decidedAt || null
  };
}
/* Cuenta principal (v4.4): la única que aprueba promociones y
   guarda la configuración global. Se identifica por el correo
   verificado de su cuenta de Google, leído de la variable
   OWNER_EMAIL (Render). Se lee en cada petición para que las pruebas
   puedan simular que no está configurada. Sin la variable, las rutas
   de dueño responden 503; sin sesión, 401; con otra cuenta, 403.
   NUNCA dejan pasar. El correo se conoce porque authPhone resuelve
   el token a la clave de la cuenta: para Google esa clave ES el
   correo verificado (POST /api/auth/google emite el token para el
   correo); para teléfono es el número, que nunca es el correo del
   dueño y por eso responde 403. */
function requireOwner(req, res) {
  const owner = String(process.env.OWNER_EMAIL || '').trim().toLowerCase();
  if (!owner) { res.status(503).json({ ok: false, error: 'La aprobación de la cuenta principal no está configurada en el servidor.' }); return false; }
  const id = authPhone(req);
  if (!id) { res.status(401).json({ ok: false, error: 'Sesión inválida.' }); return false; }
  if (String(id).toLowerCase() !== owner) { res.status(403).json({ ok: false, error: 'Solo la cuenta principal puede hacer esto.' }); return false; }
  return true;
}
app.post('/api/promotions/request', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const body = req.body || {};
  const postId = String(body.postId || '');
  const tier = parseInt(body.tier, 10);
  const goal = body.goal === 'followers' ? 'followers' : 'views';
  if (!postId) return res.status(400).json({ ok: false, error: 'Falta la publicación.' });
  if (PROMO_TIERS_43.indexOf(tier) < 0) return res.status(400).json({ ok: false, error: 'Nivel de promoción no válido.' });
  const post = posts.find(function (p) { return p.id === postId; });
  if (!post) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  if (post.author !== phone) return res.status(403).json({ ok: false, error: 'Solo quien publicó puede promocionarla.' });
  if (post.promoted) return res.status(400).json({ ok: false, error: 'La publicación ya está promocionada.' });
  /* Sin duplicados: si ya hay una solicitud pendiente para esta
     publicación, se devuelve esa (la app no vuelve a pedir). */
  const existing = promoRequests.find(function (r) { return r.postId === postId && r.status === 'pending'; });
  if (existing) return res.json({ ok: true, request: promoRequestPublic(existing), deduped: true });
  const r = { id: uid('promoReq'), postId: postId, userPhone: phone, tier: tier, goal: goal, status: 'pending', createdAt: Date.now(), decidedAt: null };
  promoRequests.push(r);
  try { await saveJsonStrict('promotion-requests.json', promoRequests); await flushPendingWrites(); }
  catch (e) { promoRequests = promoRequests.filter(function (x) { return x.id !== r.id; }); return res.status(500).json({ ok: false, error: 'No se pudo guardar la solicitud. Inténtalo de nuevo.' }); }
  return res.json({ ok: true, request: promoRequestPublic(r) });
});
app.get('/api/promotions/mine', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const mine = promoRequests.filter(function (r) { return r.userPhone === phone; }).slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
  return res.json({ ok: true, requests: mine.map(promoRequestPublic) });
});
app.get('/api/promotions/pending', (req, res) => {
  if (!requireOwner(req, res)) return;
  const list = promoRequests.filter(function (r) { return r.status === 'pending'; }).slice().sort(function (a, b) { return a.createdAt - b.createdAt; });
  return res.json({ ok: true, requests: list.map(promoRequestPublic) });
});
app.post('/api/promotions/:id/approve', async (req, res) => {
  if (!requireOwner(req, res)) return;
  const r = promoRequests.find(function (x) { return x.id === req.params.id; });
  if (!r) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada.' });
  if (r.status !== 'pending') return res.status(400).json({ ok: false, error: 'Esta solicitud ya se decidió.' });
  const post = posts.find(function (p) { return p.id === r.postId; });
  if (!post) return res.status(404).json({ ok: false, error: 'La publicación ya no existe.' });
  r.status = 'approved';
  r.decidedAt = Date.now();
  /* La promoción NO gasta una edición ni marca la publicación como
     editada: se pone promoted=true directamente (mismo efecto que el
     bypass promoOnly del PUT, sin pasar por él). */
  post.promoted = true;
  try {
    await saveJsonStrict('promotion-requests.json', promoRequests);
    await saveJsonStrict('posts.json', posts);
    await flushPendingWrites();
  } catch (e) {
    r.status = 'pending'; r.decidedAt = null; post.promoted = false;
    return res.status(500).json({ ok: false, error: 'No se pudo guardar la aprobación. Inténtalo de nuevo.' });
  }
  return res.json({ ok: true, request: promoRequestPublic(r), post: post });
});
app.post('/api/promotions/:id/reject', async (req, res) => {
  if (!requireOwner(req, res)) return;
  const r = promoRequests.find(function (x) { return x.id === req.params.id; });
  if (!r) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada.' });
  if (r.status !== 'pending') return res.status(400).json({ ok: false, error: 'Esta solicitud ya se decidió.' });
  r.status = 'rejected';
  r.decidedAt = Date.now();
  try { await saveJsonStrict('promotion-requests.json', promoRequests); await flushPendingWrites(); }
  catch (e) { r.status = 'pending'; r.decidedAt = null; return res.status(500).json({ ok: false, error: 'No se pudo guardar el rechazo. Inténtalo de nuevo.' }); }
  return res.json({ ok: true, request: promoRequestPublic(r) });
});

/* ---- v4.3: configuración del creador (orden y tamaño del Inicio) ----
   GET es público: la app de cada teléfono lo descarga y lo aplica como
   orden POR DEFECTO solo si ese teléfono nunca personalizó su Inicio
   (una personalización explícita se conserva). POST es solo creador y
   guarda un solo documento en la colección `creator_config`. Con
   {reset:true} se borra y todos vuelven al predeterminado de la app. */
const CREATOR_HOME_IDS_43 = ['historias', 'publicar', 'reloj', 'clima', 'accesos', 'calendario', 'mensajeria', 'fotos', 'calculadora', 'notas', 'bateria', 'tiempo'];
function creatorConfigValid43(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  if (!Array.isArray(cfg.order) || !cfg.order.length) return false;
  if (!cfg.order.every(function (id) { return CREATOR_HOME_IDS_43.indexOf(id) >= 0; })) return false;
  if (new Set(cfg.order).size !== cfg.order.length) return false;
  if (!cfg.sizes || typeof cfg.sizes !== 'object') return false;
  return cfg.order.every(function (id) { return ['s', 'm', 'l'].indexOf(cfg.sizes[id]) >= 0; });
}
app.get('/api/creator-config', (req, res) => {
  if (!creatorConfig || !creatorConfigValid43(creatorConfig)) return res.status(404).json({ ok: false, error: 'Sin configuración del creador por ahora.' });
  return res.json({ ok: true, config: { order: creatorConfig.order.slice(), sizes: Object.assign({}, creatorConfig.sizes), updatedAt: creatorConfig.updatedAt || null } });
});
app.post('/api/creator-config', async (req, res) => {
  if (!requireOwner(req, res)) return;
  const body = req.body || {};
  if (body.reset === true) {
    creatorConfig = null;
    try { await saveJsonStrict('creator-config.json', creatorConfig); await flushPendingWrites(); }
    catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo borrar la configuración. Inténtalo de nuevo.' }); }
    return res.json({ ok: true, reset: true });
  }
  const cfg = { order: Array.isArray(body.order) ? body.order.slice() : [], sizes: (body.sizes && typeof body.sizes === 'object') ? body.sizes : {}, updatedAt: Date.now() };
  if (!creatorConfigValid43(cfg)) return res.status(400).json({ ok: false, error: 'Configuración no válida: orden con apartados conocidos y tamaño s, m o l para cada uno.' });
  creatorConfig = cfg;
  try { await saveJsonStrict('creator-config.json', creatorConfig); await flushPendingWrites(); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar la configuración. Inténtalo de nuevo.' }); }
  return res.json({ ok: true, config: { order: creatorConfig.order.slice(), sizes: Object.assign({}, creatorConfig.sizes), updatedAt: creatorConfig.updatedAt } });
});

app.post('/api/posts/:id/like', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  const reaction = String((req.body && req.body.reaction) || 'Me gusta');
  if (post.likes[phone] === reaction) delete post.likes[phone];
  else {
    post.likes[phone] = reaction;
    if (post.author !== phone) notify('like', phone, post.author, 'reaccionó a tu publicación: ' + reaction, post.id);
  }
  saveJson('posts.json', posts);
  return res.json({ ok: true, likes: post.likes });
});
/* Cantidad total de comentarios de una publicación, incluyendo las
   respuestas (v1.5): es el número que se ve junto al botón de
   comentarios y el que se difunde en vivo. */
function countComments(post) {
  if (!post || !Array.isArray(post.comments)) return 0;
  let n = post.comments.length;
  post.comments.forEach(c => { n += (c.replies || []).length; });
  return n;
}
/* v3.8: comentar con foto/video y menciones con @. El medio debe ser
   una URL http(s) válida (Cloudinary); si la subida falló, el
   comentario no se publica (400). El texto puede estar vacío si hay
   medio. Las menciones solo se guardan y se notifican a amigos reales
   con perfil; las de no-amigos se descartan en silencio. */
function addPostComment(req, res) {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  const text = String((req.body && req.body.text) || '').trim();
  const mediaUrl = String((req.body && (req.body.mediaUrl || req.body.media)) || '').trim();
  if (mediaUrl && !isHttpUrl(mediaUrl)) return res.status(400).json({ ok: false, error: 'Medio no válido.' });
  if (!text && !mediaUrl) return res.status(400).json({ ok: false, error: 'Comentario vacío.' });
  let mediaType = String((req.body && req.body.mediaType) || '').trim();
  if (mediaUrl && mediaType !== 'image' && mediaType !== 'video') {
    mediaType = /\.(mp4|webm|mov|3gp)(\?|$)/i.test(mediaUrl) ? 'video' : 'image';
  }
  const mentions = [];
  if (Array.isArray(req.body && req.body.mentions)) {
    req.body.mentions.slice(0, 10).forEach(function (m) {
      const mp = normPhone(String(m || ''));
      if (!mp || mp === phone) return;
      if (!profiles[mp]) return;
      if (!(friends[phone] || []).includes(mp)) return;
      if (mentions.some(function (x) { return x.phone === mp; })) return;
      const pub = profilePublic(mp);
      mentions.push({ phone: mp, name: pub.name, avatar: pub.avatar });
    });
  }
  const comment = { id: uid('cmt'), author: phone, text: text.slice(0, 1000), media: mediaUrl, mediaType: mediaUrl ? mediaType : '', mentions, createdAt: Date.now(), replies: [] };
  const parentId = req.body && req.body.parentId;
  if (parentId) {
    const parent = post.comments.find(c => c.id === parentId);
    if (!parent) return res.status(404).json({ ok: false, error: 'Comentario no encontrado.' });
    parent.replies.push(comment);
  } else post.comments.push(comment);
  if (post.author !== phone) notify('comment', phone, post.author, 'comentó tu publicación', post.id);
  mentions.forEach(function (m) {
    if (m.phone !== post.author) notify('mention', phone, m.phone, 'te mencionó en un comentario', post.id);
  });
  saveJson('posts.json', posts);
  // v1.5: el contador de comentarios se actualiza en vivo para todos.
  broadcast({ kind: 'comment', postId: post.id, commentCount: countComments(post), comment, parentId: parentId || null });
  return res.json({ ok: true, comment, commentCount: countComments(post) });
}
app.post('/api/posts/:id/comment', addPostComment);
app.post('/api/posts/:id/comments', addPostComment);
app.post('/api/posts/:id/share', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const orig = posts.find(p => p.id === req.params.id);
  if (!orig) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  if (orig.shares.includes(phone)) return res.status(400).json({ ok: false, error: 'Ya la compartiste.' });
  orig.shares.push(phone);
  const repost = {
    id: uid('post'), author: phone, text: '', media: orig.media, mediaType: orig.mediaType,
    mediaList: orig.mediaList || [],
    link: orig.link || null,
    privacy: 'Público', groupId: null,
    sharedFrom: { id: orig.id, author: orig.author, text: orig.text, media: orig.media, mediaType: orig.mediaType, link: orig.link || null },
    createdAt: Date.now(), likes: {}, comments: [], shares: [], savedBy: [], isDemo: false
  };
  posts.unshift(repost);
  if (orig.author !== phone) notify('share', phone, orig.author, 'compartió tu publicación', orig.id);
  saveJson('posts.json', posts);
  return res.json({ ok: true, post: repost });
});

// Encuesta: votar en una publicación con encuesta (v1.1) o con
// encuesta con foto (v3.8, idea 26: {optionIndex: 0|1}).
app.post('/api/posts/:id/vote', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  /* v3.8: encuesta con foto — un voto por visitante, se puede cambiar;
     los conteos son reales (colección postVotes). */
  if (post.photoPoll) {
    const option = Number(req.body && req.body.optionIndex);
    if (option !== 0 && option !== 1) return res.status(400).json({ ok: false, error: 'Opción inválida.' });
    if (!postVotes[post.id]) postVotes[post.id] = [];
    const list = postVotes[post.id];
    const old = list.find(function (v) { return v.voter === phone; });
    if (old) { old.option = option; old.at = Date.now(); }
    else list.push({ voter: phone, option, at: Date.now() });
    try { await saveJsonStrict('post-votes.json', postVotes); }
    catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar el voto.' }); }
    return res.json({ ok: true, votes: photoPollCounts(post.id), myVote: option });
  }
  if (!post.poll) return res.status(400).json({ ok: false, error: 'Sin encuesta.' });
  const opt = post.poll.options.find(o => o.id === (req.body && req.body.optionId));
  if (!opt) return res.status(404).json({ ok: false, error: 'Opción no encontrada.' });
  const wasVoted = opt.votes.includes(phone);
  post.poll.options.forEach(o => { o.votes = o.votes.filter(v => v !== phone); });
  if (!wasVoted) opt.votes.push(phone);
  saveJson('posts.json', posts);
  return res.json({ ok: true, poll: post.poll });
});

// Borrar un comentario o una respuesta (v1.1).
app.delete('/api/posts/:id/comment/:commentId', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  const cid = req.params.commentId;
  for (let j = 0; j < post.comments.length; j++) {
    const c = post.comments[j];
    if (c.id === cid) {
      if (c.author !== phone && post.author !== phone) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
      post.comments.splice(j, 1);
      saveJson('posts.json', posts);
      broadcast({ kind: 'comment', postId: post.id, commentCount: countComments(post), deletedId: cid });
      return res.json({ ok: true });
    }
    for (let k = 0; k < (c.replies || []).length; k++) {
      if (c.replies[k].id === cid) {
        if (c.replies[k].author !== phone && post.author !== phone) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
        c.replies.splice(k, 1);
        saveJson('posts.json', posts);
        broadcast({ kind: 'comment', postId: post.id, commentCount: countComments(post), deletedId: cid });
        return res.json({ ok: true });
      }
    }
  }
  return res.status(404).json({ ok: false, error: 'Comentario no encontrado.' });
});

// Borrar una publicación entera (v3.2): antes la app solo la quitaba de
// su copia local y el servidor no tenía cómo borrarla, así que al
// reabrir la cuenta la publicación reaparecía (el inicio se carga
// desde el servidor). Solo el autor puede borrarla, o un administrador
// del grupo si es de un grupo (misma regla que la app). La escritura es
// crítica: se espera a MongoDB antes de responder, y se avisa por
// WebSocket para que los demás teléfonos la quiten en vivo.
// v3.3: la espera es DE VERDAD (saveJsonStrict): si la escritura en
// MongoDB falla, la publicación vuelve a su sitio en memoria y se
// devuelve 500, para que la app la restaure y avise el error real en
// vez de un "Publicación borrada." falso que resucitaba al reiniciar.
app.delete('/api/posts/:id', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const idx = posts.findIndex(p => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  const post = posts[idx];
  let allowed = post.author === phone;
  if (!allowed && post.groupId) {
    const g = groups.find(x => x.id === post.groupId);
    allowed = isGroupManagerSrv(g, phone);
  }
  if (!allowed) return res.status(403).json({ ok: false, error: 'Solo la persona que publicó puede borrarla.' });
  posts.splice(idx, 1);
  try {
    await saveJsonStrict('posts.json', posts);
  } catch (e) {
    posts.splice(idx, 0, post);
    console.error('[store] no se pudo guardar el borrado en MongoDB:', e.message);
    return res.status(500).json({ ok: false, error: 'No se pudo guardar el borrado en el servidor. Inténtalo de nuevo.' });
  }
  broadcast({ kind: 'postDeleted', postId: post.id });
  /* v3.8: al borrar la publicación se borran también sus vistas y
     sus votos de encuesta con foto. */
  delete postViews[post.id];
  saveJson('post-views.json', postViews);
  delete postVotes[post.id];
  saveJson('post-votes.json', postVotes);
  return res.json({ ok: true });
});

/* ---- marketplace (v1.1) ---- */
app.get('/api/listings', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  let list = listings.slice();
  if (req.query.category) list = list.filter(l => l.category === req.query.category);
  if (req.query.min) list = list.filter(l => l.price >= Number(req.query.min));
  if (req.query.max) list = list.filter(l => l.price <= Number(req.query.max));
  if (req.query.mine) list = list.filter(l => l.seller === normPhone(req.query.mine));
  if (req.query.seller) list = list.filter(l => l.seller === normPhone(req.query.seller));
  if (req.query.followedBy) {
    const followed = (friends[normPhone(req.query.followedBy)] || []);
    list = list.filter(l => followed.includes(l.seller));
  }
  if (req.query.savedBy) list = list.filter(l => l.savedBy.includes(normPhone(req.query.savedBy)));
  if (req.query.status) list = list.filter(l => l.status === req.query.status);
  else if (!req.query.mine && !req.query.seller) list = list.filter(l => l.status === 'Activo');
  if (q) list = list.filter(l => (l.title + ' ' + l.desc + ' ' + l.city + ' ' + (l.brand || '')).toLowerCase().includes(q));
  if (req.query.delivery) list = list.filter(l => (l.delivery || 'Recoger') === req.query.delivery);
  if (req.query.negotiable === 'true') list = list.filter(l => !!l.negotiable);
  if (req.query.salesGroupId) list = list.filter(l => l.salesGroupId === req.query.salesGroupId);
  const sort = req.query.sort || 'recientes';
  if (sort === 'precio-asc') list.sort((a, b) => a.price - b.price);
  else if (sort === 'precio-desc') list.sort((a, b) => b.price - a.price);
  else list.sort((a, b) => b.createdAt - a.createdAt);
  return res.json({ ok: true, listings: list });
});
app.post('/api/listings', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const body = (req.body && req.body.listing) || req.body;
  const title = String((body && body.title) || '').trim();
  const price = Number(body && body.price);
  const CATS = ['Vehículos', 'Motos', 'Electrónica', 'Celulares', 'Computadoras', 'Hogar', 'Muebles', 'Electrodomésticos', 'Ropa', 'Calzado', 'Deportes', 'Juguetes', 'Bebés', 'Mascotas', 'Belleza', 'Libros', 'Música', 'Instrumentos', 'Herramientas', 'Servicios', 'Empleos', 'Inmuebles', 'Arte', 'Otros'];
  if (title.length < 3) return res.status(400).json({ ok: false, error: 'Título muy corto.' });
  if (isNaN(price) || price < 0) return res.status(400).json({ ok: false, error: 'Precio inválido.' });
  if (!CATS.includes(body.category)) return res.status(400).json({ ok: false, error: 'Categoría inválida.' });
  if (body.condition !== 'Nuevo' && body.condition !== 'Usado') return res.status(400).json({ ok: false, error: 'Condición inválida.' });
  const whatsapp = String((body && body.whatsapp) || '').replace(/\D/g, '');
  if (whatsapp && (whatsapp.length < 8 || whatsapp.length > 15)) return res.status(400).json({ ok: false, error: 'WhatsApp inválido.' });
  const delivery = ['Recoger', 'Envío', 'Ambos'].includes(body && body.delivery) ? body.delivery : 'Recoger';
  let salesGroupId = (body && body.salesGroupId) || null;
  if (salesGroupId) {
    const sg = salesGroups.find(x => x.id === salesGroupId);
    if (!sg) return res.status(404).json({ ok: false, error: 'Grupo de ventas no encontrado.' });
    if (!sg.members.includes(phone)) return res.status(403).json({ ok: false, error: 'No eres miembro de ese grupo de ventas.' });
  }
  const l = {
    id: (body && body.id) || uid('lst'), seller: phone, title: title.slice(0, 120), price,
    category: body.category, condition: body.condition,
    desc: String((body && body.desc) || '').slice(0, 1000),
    city: String((body && body.city) || '').slice(0, 80),
    photos: Array.isArray(body.photos) ? body.photos.slice() : [], /* ola 11: sin límite */
    whatsapp, brand: String((body && body.brand) || '').slice(0, 80),
    negotiable: !!(body && body.negotiable), delivery, salesGroupId,
    status: (body && body.status) || 'Activo',
    createdAt: (body && body.createdAt) || Date.now(), savedBy: (body && body.savedBy) || [], isDemo: false
  };
  const existing = listings.find(x => x.id === l.id);
  if (existing) { Object.assign(existing, l); saveJson('listings.json', listings); return res.json({ ok: true, listing: existing }); }
  listings.push(l);
  saveJson('listings.json', listings);
  return res.json({ ok: true, listing: l });
});
/* ---- modificar un anuncio (v1.2, ola 10): el cambio se ve para todos ---- */
app.put('/api/listings/:id', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const l = listings.find(x => x.id === req.params.id);
  if (!l) return res.status(404).json({ ok: false, error: 'Anuncio no encontrado.' });
  if (l.seller !== phone) return res.status(403).json({ ok: false, error: 'Solo quien publicó el anuncio puede modificarlo.' });
  const body = (req.body && req.body.listing) || req.body;
  const CATS = ['Vehículos', 'Motos', 'Electrónica', 'Celulares', 'Computadoras', 'Hogar', 'Muebles', 'Electrodomésticos', 'Ropa', 'Calzado', 'Deportes', 'Juguetes', 'Bebés', 'Mascotas', 'Belleza', 'Libros', 'Música', 'Instrumentos', 'Herramientas', 'Servicios', 'Empleos', 'Inmuebles', 'Arte', 'Otros'];
  if (body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (title.length < 3) return res.status(400).json({ ok: false, error: 'Título muy corto.' });
    l.title = title.slice(0, 120);
  }
  if (body.price !== undefined) {
    const price = Number(body.price);
    if (isNaN(price) || price < 0) return res.status(400).json({ ok: false, error: 'Precio inválido.' });
    l.price = price;
  }
  if (body.desc !== undefined) l.desc = String(body.desc || '').slice(0, 1000);
  if (body.category !== undefined) {
    if (!CATS.includes(body.category)) return res.status(400).json({ ok: false, error: 'Categoría inválida.' });
    l.category = body.category;
  }
  if (body.condition !== undefined) {
    if (body.condition !== 'Nuevo' && body.condition !== 'Usado') return res.status(400).json({ ok: false, error: 'Condición inválida.' });
    l.condition = body.condition;
  }
  if (body.city !== undefined) l.city = String(body.city || '').slice(0, 80);
  if (body.brand !== undefined) l.brand = String(body.brand || '').slice(0, 80);
  if (body.whatsapp !== undefined) {
    const wa = String(body.whatsapp || '').replace(/\D/g, '');
    if (wa && (wa.length < 8 || wa.length > 15)) return res.status(400).json({ ok: false, error: 'WhatsApp inválido.' });
    l.whatsapp = wa;
  }
  if (body.negotiable !== undefined) l.negotiable = !!body.negotiable;
  if (body.delivery !== undefined) l.delivery = ['Recoger', 'Envío', 'Ambos'].includes(body.delivery) ? body.delivery : 'Recoger';
  if (Array.isArray(body.photos)) l.photos = body.photos.slice(); /* ola 11: sin límite */
  l.updatedAt = Date.now();
  saveJson('listings.json', listings);
  return res.json({ ok: true, listing: l });
});
app.post('/api/listings/:id/sold', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const l = listings.find(x => x.id === req.params.id);
  if (!l) return res.status(404).json({ ok: false, error: 'Anuncio no encontrado.' });
  if (l.seller !== phone) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  l.status = l.status === 'Vendido' ? 'Activo' : 'Vendido';
  l.updatedAt = Date.now();
  saveJson('listings.json', listings);
  return res.json({ ok: true, listing: l });
});
app.post('/api/listings/:id/save', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const l = listings.find(x => x.id === req.params.id);
  if (!l) return res.status(404).json({ ok: false, error: 'Anuncio no encontrado.' });
  const idx = l.savedBy.indexOf(phone);
  if (idx >= 0) l.savedBy.splice(idx, 1); else l.savedBy.push(phone);
  saveJson('listings.json', listings);
  return res.json({ ok: true, saved: idx < 0 });
});
app.delete('/api/listings/:id', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const i = listings.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'Anuncio no encontrado.' });
  if (listings[i].seller !== phone) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  listings.splice(i, 1);
  saveJson('listings.json', listings);
  /* v3.8: el anuncio borrado desaparece también de todas las listas
     de deseos (nunca se muestra un producto falso). */
  let pruned = false;
  Object.keys(wishlists).forEach(function (owner) {
    const before = wishlists[owner].length;
    wishlists[owner] = wishlists[owner].filter(function (id) { return id !== req.params.id; });
    if (wishlists[owner].length !== before) pruned = true;
  });
  if (pruned) saveJson('wishlists.json', wishlists);
  return res.json({ ok: true });
});

/* ---- eventos (v1.1) ---- */
app.get('/api/events', (req, res) => res.json({ ok: true, events }));
app.post('/api/events', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const body = (req.body && req.body.event) || req.body;
  const name = String((body && body.name) || '').trim();
  if (name.length < 3) return res.status(400).json({ ok: false, error: 'Nombre muy corto.' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String((body && body.date) || ''))) return res.status(400).json({ ok: false, error: 'Fecha inválida.' });
  const ev = {
    id: (body && body.id) || uid('evt'), creator: phone, name: name.slice(0, 100),
    desc: String((body && body.desc) || '').slice(0, 500),
    date: body.date, time: String((body && body.time) || ''),
    place: String((body && body.place) || '').slice(0, 120),
    cover: (body && body.cover) || '', attendees: (body && body.attendees) || {},
    status: (body && body.status) || 'Activo', createdAt: (body && body.createdAt) || Date.now()
  };
  const existing = events.find(x => x.id === ev.id);
  if (existing) { Object.assign(existing, ev); saveJson('events.json', events); return res.json({ ok: true, event: existing }); }
  events.push(ev);
  saveJson('events.json', events);
  return res.json({ ok: true, event: ev });
});
app.post('/api/events/:id/rsvp', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const ev = events.find(x => x.id === req.params.id);
  if (!ev) return res.status(404).json({ ok: false, error: 'Evento no encontrado.' });
  if (ev.status !== 'Activo') return res.status(400).json({ ok: false, error: 'Evento cancelado.' });
  const status = req.body && req.body.status;
  if (status !== 'asiste' && status !== 'interes') delete ev.attendees[phone];
  else ev.attendees[phone] = status;
  saveJson('events.json', events);
  return res.json({ ok: true, event: ev });
});
app.post('/api/events/:id/cancel', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const ev = events.find(x => x.id === req.params.id);
  if (!ev) return res.status(404).json({ ok: false, error: 'Evento no encontrado.' });
  if (ev.creator !== phone) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  ev.status = 'Cancelado';
  saveJson('events.json', events);
  return res.json({ ok: true, event: ev });
});

/* ---- páginas (v1.1) ---- */
app.get('/api/pages', (req, res) => res.json({ ok: true, pages }));
app.post('/api/pages', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const body = (req.body && req.body.page) || req.body;
  const name = String((body && body.name) || '').trim();
  if (name.length < 2) return res.status(400).json({ ok: false, error: 'Nombre muy corto.' });
  const p = {
    id: (body && body.id) || uid('page'), name: name.slice(0, 80),
    category: String((body && body.category) || 'Otro'),
    desc: String((body && body.desc) || '').slice(0, 300),
    photo: (body && body.photo) || '', creator: phone,
    followers: Array.isArray(body.followers) ? body.followers : [phone],
    createdAt: (body && body.createdAt) || Date.now()
  };
  const existing = pages.find(x => x.id === p.id);
  if (existing) { Object.assign(existing, p); saveJson('pages.json', pages); return res.json({ ok: true, page: existing }); }
  pages.push(p);
  saveJson('pages.json', pages);
  return res.json({ ok: true, page: p });
});
app.post('/api/pages/:id/follow', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const p = pages.find(x => x.id === req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Página no encontrada.' });
  const follow = !(req.body && req.body.follow === false);
  const idx = p.followers.indexOf(phone);
  if (follow && idx < 0) p.followers.push(phone);
  if (!follow && idx >= 0) p.followers.splice(idx, 1);
  saveJson('pages.json', pages);
  return res.json({ ok: true, following: p.followers.includes(phone), page: p });
});

/* ---- borrados (v1.1) ---- */
app.delete('/api/stories/:id', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const i = stories.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'Historia no encontrada.' });
  if (stories[i].author !== phone) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  stories.splice(i, 1);
  saveJson('stories.json', stories);
  /* v3.8: al borrar la historia se borran también sus visitas, sus
     votos de encuesta y sus reacciones (los votos y las reacciones
     mueren con la historia). */
  delete storyViews[req.params.id];
  saveJson('story-views.json', storyViews);
  delete storyPollVotes[req.params.id];
  saveJson('story-poll-votes.json', storyPollVotes);
  delete storyReactions[req.params.id];
  saveJson('story-reactions.json', storyReactions);
  return res.json({ ok: true });
});
app.delete('/api/messages/:id', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const i = messages.findIndex(m => m.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'Mensaje no encontrado.' });
  if (messages[i].from !== phone) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  messages.splice(i, 1);
  saveJson('messages.json', messages);
  return res.json({ ok: true });
});
app.delete('/api/conversations/:other', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const other = normPhone(req.params.other);
  const before = messages.length;
  messages = messages.filter(m => !((m.from === phone && m.to === other) || (m.from === other && m.to === phone)));
  saveJson('messages.json', messages);
  return res.json({ ok: true, removed: before - messages.length });
});
app.delete('/api/groups/:id', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const i = groups.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'Grupo no encontrado.' });
  if (groups[i].creator !== phone) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  const gid = groups[i].id;
  groups.splice(i, 1);
  posts = posts.filter(p => p.groupId !== gid);
  saveAll();
  return res.json({ ok: true });
});
app.delete('/api/account', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  /* v3.8: las ids de sus historias y publicaciones se guardan ANTES de
     filtrarlas, para poder borrar también sus visitas y vistas. */
  const myStoryIds = stories.filter(function (s) { return s.author === phone; }).map(function (s) { return s.id; });
  const myPostIds = posts.filter(function (p) { return p.author === phone; }).map(function (p) { return p.id; });
  delete profiles[phone];
  posts = posts.filter(p => p.author !== phone);
  stories = stories.filter(s => s.author !== phone);
  listings = listings.filter(l => l.seller !== phone);
  events = events.filter(e => e.creator !== phone);
  pages = pages.filter(p => p.creator !== phone);
  groups = groups.filter(g => g.creator !== phone);
  Object.keys(friends).forEach(f => { friends[f] = friends[f].filter(x => x !== phone); });
  delete friends[phone];
  requests = requests.filter(r => r.from !== phone && r.to !== phone);
  /* v3.7: también se borran las visitas a su perfil y las que él hizo. */
  delete profileViews[phone];
  Object.keys(profileViews).forEach(function (k) { profileViews[k] = profileViews[k].filter(function (v) { return v.viewer !== phone; }); });
  /* v3.8: también se borran las visitas a sus historias y a sus
     publicaciones, y las visitas que él hizo a historias y publicaciones. */
  myStoryIds.forEach(function (id) { delete storyViews[id]; });
  Object.keys(storyViews).forEach(function (k) { storyViews[k] = storyViews[k].filter(function (v) { return v.viewer !== phone; }); });
  myPostIds.forEach(function (id) { delete postViews[id]; });
  Object.keys(postViews).forEach(function (k) { postViews[k] = postViews[k].filter(function (v) { return v.viewer !== phone; }); });
  /* v3.8: y todo lo demás de 3.8 — votos y reacciones de sus historias
     y los que él hizo, sus regalos en lives, sus salas de audio (las
     que creó se cierran), sus puntajes de torneo, su lista de deseos,
     sus votos de encuesta con foto, sus silencios, sus ajustes de
     mensajes temporales y sus cupones. */
  myStoryIds.forEach(function (id) { delete storyPollVotes[id]; delete storyReactions[id]; });
  Object.keys(storyPollVotes).forEach(function (k) { storyPollVotes[k] = storyPollVotes[k].filter(function (v) { return v.voter !== phone; }); });
  Object.keys(storyReactions).forEach(function (k) { storyReactions[k] = storyReactions[k].filter(function (v) { return v.viewer !== phone; }); });
  myPostIds.forEach(function (id) { delete postVotes[id]; });
  Object.keys(postVotes).forEach(function (k) { postVotes[k] = postVotes[k].filter(function (v) { return v.voter !== phone; }); });
  Object.keys(liveGifts).forEach(function (k) { liveGifts[k] = liveGifts[k].filter(function (g) { return g.from !== phone; }); });
  audioRooms.forEach(function (room) {
    room.participants = room.participants.filter(function (pt) { return pt.phone !== phone; });
    if (room.owner === phone && room.participants.length) room.owner = room.participants[0].phone;
    if (!room.participants.length && !room.endedAt) room.endedAt = Date.now();
  });
  tournaments.forEach(function (t) { delete t.scores[phone]; });
  delete wishlists[phone];
  Object.keys(wishlists).forEach(function (owner) { wishlists[owner] = wishlists[owner].filter(function (id) { return listings.some(function (l) { return l.id === id; }); }); });
  delete muted[phone];
  Object.keys(muted).forEach(function (owner) { muted[owner] = muted[owner].filter(function (p) { return p !== phone; }); });
  delete closeFriends[phone];
  Object.keys(closeFriends).forEach(function (owner) { closeFriends[owner] = closeFriends[owner].filter(function (p) { return p !== phone; }); });
  Object.keys(conversationSettings).forEach(function (k) { if (k.split('|').includes(phone)) delete conversationSettings[k]; });
  coupons = coupons.filter(function (c) { return c.seller !== phone; });
  promoRequests = promoRequests.filter(function (r) { return r.userPhone !== phone; });
  saveJson('story-poll-votes.json', storyPollVotes);
  saveJson('story-reactions.json', storyReactions);
  saveJson('close-friends.json', closeFriends);
  saveJson('live-gifts.json', liveGifts);
  saveJson('audio-rooms.json', audioRooms);
  saveJson('tournaments.json', tournaments);
  saveJson('wishlists.json', wishlists);
  saveJson('post-votes.json', postVotes);
  saveJson('muted.json', muted);
  saveJson('conversation-settings.json', conversationSettings);
  saveJson('coupons.json', coupons);
  saveJson('promotion-requests.json', promoRequests);
  messages = messages.filter(m => m.from !== phone && m.to !== phone);
  notifications = notifications.filter(n => n.to !== phone && n.from !== phone);
  posts.forEach(p => {
    delete p.likes[phone];
    p.comments = p.comments.filter(c => c.author !== phone);
    p.comments.forEach(c => { c.replies = (c.replies || []).filter(r => r.author !== phone); });
    p.shares = p.shares.filter(s => s !== phone);
    p.savedBy = p.savedBy.filter(s => s !== phone);
    if (p.poll) p.poll.options.forEach(o => { o.votes = o.votes.filter(v => v !== phone); });
    if (p.sharedFrom && p.sharedFrom.author === phone) p.sharedFrom = null;
  });
  events.forEach(e => delete e.attendees[phone]);
  pages.forEach(p => { p.followers = p.followers.filter(f => f !== phone); });
  groups.forEach(g => { g.members = g.members.filter(m => m !== phone); });
  listings.forEach(l => { l.savedBy = l.savedBy.filter(s => s !== phone); });
  /* v1.4: también se borran los archivos que el usuario subió al servidor
     (en Cloudinary también, si hay secretos para borrar). */
  const cfgDel = cloudinaryConfig();
  for (const id of Object.keys(media)) {
    if (media[id].owner === phone) {
      if (media[id].cloudinaryUrl) await destroyFromCloudinary(cfgDel, media[id]);
      try { fs.unlinkSync(path.join(MEDIA_DIR, media[id].id + '.' + media[id].ext)); } catch (e) {}
      delete media[id];
    }
  }
  delete auth[phone];
  saveAll();
  return res.json({ ok: true });
});

/* ---- historias ---- */
/* v3.8: al servir historias, una de audiencia 'close' solo la ven su
   autor y su lista de cercanos (los demás ni siquiera la ven en la
   lista). Cada historia lleva su encuesta según quién pide y su
   reacción (myReaction). */
app.get('/api/stories', (req, res) => {
  const viewer = authPhone(req);
  const list = liveStories().filter(function (s) { return canSeeStory(s, viewer); });
  return res.json({ ok: true, stories: list.map(function (s) { return shapeStory(s, viewer); }) });
});
app.post('/api/stories', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  /* v3.3: la app manda { story: {...} } (igual que { post: {...} } en
     /api/posts); antes se leía req.body.text directo y TODAS las historias
     se rechazaban con 400 "Historia vacía." — nunca llegaban al servidor. */
  const body = req.body && req.body.story ? req.body.story : req.body;
  const text = String((body && body.text) || '').trim();
  /* v3.8 (idea 50): compartir un Short en tu historia — la historia
     es una referencia (portada + enlace al Short), no una copia del
     video; si el Short no existe, 400. */
  let sharedShortId = null;
  if (body && body.sharedShortId !== undefined && body.sharedShortId !== null && String(body.sharedShortId).trim()) {
    const short = posts.find(function (p) { return p.id === String(body.sharedShortId).trim(); });
    if (!short) return res.status(400).json({ ok: false, error: 'Ese Short no existe.' });
    sharedShortId = short.id;
  }
  if (!text && !(body && body.media) && !sharedShortId) return res.status(400).json({ ok: false, error: 'Historia vacía.' });
  /* v3.8: encuesta (pregunta + 2 opciones), audiencia (all/close),
     enlace (solo http(s), 400 si no es una URL válida) y color de
     fondo para historias de solo texto (hex #RRGGBB). El audio se
     guarda como cualquier medio (mediaType 'audio'): la subida
     /api/media ya acepta audio/* (mp3, m4a, wav, ogg, webm). */
  const poll = validateStoryPoll(body && body.poll);
  const audience = (body && body.audience === 'close') ? 'close' : 'all';
  let link = '';
  if (body && body.link !== undefined && body.link !== null && String(body.link).trim()) {
    if (!isHttpUrl(String(body.link))) return res.status(400).json({ ok: false, error: 'Enlace inválido: debe ser una URL http(s).' });
    link = String(body.link).trim().slice(0, 500);
  }
  let backgroundColor = '';
  if (body && body.backgroundColor !== undefined && body.backgroundColor !== null && String(body.backgroundColor).trim()) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(body.backgroundColor).trim())) return res.status(400).json({ ok: false, error: 'Color de fondo inválido.' });
    backgroundColor = String(body.backgroundColor).trim();
  }
  const s = { id: uid('story'), author: phone, text: text.slice(0, 300), media: (body && body.media) || '', mediaType: (body && body.mediaType) || '', edits: validateStoryEdits(body && body.edits), song: validateSongSrv(body && body.song), videoEdits: validateVideoEditsSrv(body && body.videoEdits), poll, audience, link, backgroundColor, sharedShortId, createdAt: Date.now(), views: [], likes: {}, comments: [], shares: [] };
  stories.unshift(s);
  saveJson('stories.json', stories);
  return res.json({ ok: true, story: s });
});
app.post('/api/stories/:id/like', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const s = stories.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Historia no encontrada.' });
  if (!s.likes) s.likes = {};
  if (s.likes[phone]) delete s.likes[phone];
  else {
    s.likes[phone] = true;
    if (s.author !== phone) notify('like', phone, s.author, 'le gustó tu historia', s.id);
  }
  saveJson('stories.json', stories);
  return res.json({ ok: true, likes: Object.keys(s.likes).length });
});
app.post('/api/stories/:id/comment', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const s = stories.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Historia no encontrada.' });
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Comentario vacío.' });
  if (!s.comments) s.comments = [];
  const c = { id: uid('cmt'), author: phone, text: text.slice(0, 1000), createdAt: Date.now() };
  s.comments.push(c);
  if (s.author !== phone) notify('comment', phone, s.author, 'comentó tu historia', s.id);
  saveJson('stories.json', stories);
  return res.json({ ok: true, comment: c });
});
app.post('/api/stories/:id/share', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const s = stories.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Historia no encontrada.' });
  if (!s.shares) s.shares = [];
  if (!s.shares.includes(phone)) s.shares.push(phone);
  saveJson('stories.json', stories);
  return res.json({ ok: true, shares: s.shares.length });
});
app.post('/api/stories/:id/view', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const s = stories.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Historia no encontrada.' });
  if (Date.now() - s.createdAt > STORY_TTL_MS) return res.status(410).json({ ok: false, error: 'Historia caducada.' });
  if (!s.views.includes(phone)) s.views.push(phone);
  saveJson('stories.json', stories);
  return res.json({ ok: true, views: s.views.length });
});

/* ---- amistades ---- */
app.post('/api/friends/request', (req, res) => {
  const from = authPhone(req);
  if (!from) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const to = normPhone(req.body && req.body.to);
  if (!profiles[to]) return res.status(404).json({ ok: false, error: 'Esa persona no existe.' });
  if (from === to) return res.status(400).json({ ok: false, error: 'No puedes agregarte a ti.' });
  if ((friends[from] || []).includes(to)) return res.status(400).json({ ok: false, error: 'Ya son amigos.' });
  if (requests.some(r => r.status === 'pending' && ((r.from === from && r.to === to) || (r.from === to && r.to === from)))) {
    return res.status(400).json({ ok: false, error: 'Ya hay una solicitud pendiente entre ustedes.' });
  }
  const r = { id: uid('req'), from, to, status: 'pending', createdAt: Date.now() };
  requests.push(r);
  notify('request', from, to, 'te envió una solicitud de amistad', r.id);
  saveAll();
  return res.json({ ok: true, request: r });
});
app.post('/api/friends/respond', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const r = requests.find(x => x.id === (req.body && req.body.requestId));
  if (!r || r.to !== phone) return res.status(404).json({ ok: false, error: 'Solicitud no encontrada.' });
  if (r.status !== 'pending') return res.status(400).json({ ok: false, error: 'Ya se respondió.' });
  if (req.body && req.body.accept) {
    r.status = 'accepted';
    if (!friends[r.from]) friends[r.from] = [];
    if (!friends[r.to]) friends[r.to] = [];
    if (!friends[r.from].includes(r.to)) friends[r.from].push(r.to);
    if (!friends[r.to].includes(r.from)) friends[r.to].push(r.from);
    notify('friend', phone, r.from, 'aceptó tu solicitud de amistad', r.id);
  } else r.status = 'declined';
  saveAll();
  return res.json({ ok: true, request: r });
});
app.get('/api/friends', (req, res) => {
  const phone = normPhone(req.query.phone);
  const list = (friends[phone] || []).map(p => profiles[p]).filter(Boolean);
  const incoming = requests.filter(r => r.to === phone && r.status === 'pending');
  const outgoing = requests.filter(r => r.from === phone && r.status === 'pending');
  return res.json({ ok: true, friends: list, incoming, outgoing });
});

/* ---- visitas al perfil (v3.7) ----
   Quién vio MI perfil: la app 1.5.23 registra una visita cuando se abre
   el perfil de otra persona (en segundo plano, sin bloquear la apertura)
   y en el perfil propio muestra un círculo con la foto de la última
   persona que lo vio y el número de cuentas que lo vieron. Un registro
   por visitante y perfil visto: si la misma persona vuelve a verlo,
   solo se actualiza la fecha, no se duplica. Verse el propio perfil no
   se registra y los invitados (sin sesión) tampoco. La lista solo se
   puede consultar para el propio perfil, nunca para el de otro. */
app.post('/api/profile-views', async (req, res) => {
  const from = authPhone(req);
  if (!from) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const viewed = normPhone(req.body && req.body.viewedPhone);
  if (!profiles[viewed]) return res.status(404).json({ ok: false, error: 'Ese perfil no existe.' });
  if (from === viewed) return res.json({ ok: true, recorded: false, count: (profileViews[viewed] || []).length });
  if (!profileViews[viewed]) profileViews[viewed] = [];
  const list = profileViews[viewed];
  const old = list.find(function (v) { return v.viewer === from; });
  if (old) old.at = Date.now();
  else list.push({ viewer: from, at: Date.now() });
  try { await saveJsonStrict('profile-views.json', profileViews); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar la visita.' }); }
  return res.json({ ok: true, recorded: true, count: list.length });
});
app.get('/api/profile-views/me', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const list = (profileViews[phone] || []).slice().sort(function (a, b) { return b.at - a.at; });
  const viewers = list.map(function (v) {
    const p = profiles[v.viewer];
    return { phone: v.viewer, name: p ? p.name : v.viewer, avatar: (p && p.photo) || '', at: v.at };
  });
  return res.json({ ok: true, count: viewers.length, lastViewer: viewers[0] || null, viewers: viewers });
});

/* ---- visitas a historias (v3.8) ----
   Igual que las visitas al perfil (3.7), pero por historia: un registro
   por visitante y historia (si vuelve, solo se actualiza la fecha); ver
   la propia historia no se registra y los invitados tampoco. La lista
   solo la puede leer el autor de la historia, nunca otra persona. */
app.post('/api/story-views', async (req, res) => {
  const from = authPhone(req);
  if (!from) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const storyId = String((req.body && req.body.storyId) || '');
  const story = stories.find(function (s) { return s.id === storyId; });
  if (!story) return res.status(404).json({ ok: false, error: 'Esa historia no existe.' });
  if (Date.now() - story.createdAt > STORY_TTL_MS) return res.status(410).json({ ok: false, error: 'Historia caducada.' });
  if (!canSeeStory(story, from)) return res.status(404).json({ ok: false, error: 'Esa historia no existe.' });
  if (from === story.author) return res.json({ ok: true, recorded: false, count: (storyViews[storyId] || []).length });
  if (!storyViews[storyId]) storyViews[storyId] = [];
  const list = storyViews[storyId];
  const old = list.find(function (v) { return v.viewer === from; });
  if (old) old.at = Date.now();
  else list.push({ viewer: from, at: Date.now() });
  try { await saveJsonStrict('story-views.json', storyViews); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar la visita.' }); }
  return res.json({ ok: true, recorded: true, count: list.length });
});
app.get('/api/story-views/:storyId', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const story = stories.find(function (s) { return s.id === req.params.storyId; });
  if (!story) return res.status(404).json({ ok: false, error: 'Esa historia no existe.' });
  if (Date.now() - story.createdAt > STORY_TTL_MS) return res.status(410).json({ ok: false, error: 'Historia caducada.' });
  if (story.author !== phone) return res.status(403).json({ ok: false, error: 'Solo quien publicó la historia puede ver quién la vio.' });
  const list = (storyViews[req.params.storyId] || []).slice().sort(function (a, b) { return b.at - a.at; });
  const viewers = list.map(function (v) {
    const p = profiles[v.viewer];
    return { phone: v.viewer, name: p ? p.name : v.viewer, avatar: (p && p.photo) || '', at: v.at };
  });
  return res.json({ ok: true, count: viewers.length, viewers: viewers });
});

/* ---- vistas reales de publicaciones (v3.8) ----
   Una vista por visitante y publicación: si la misma persona vuelve a
   verla, solo se actualiza la fecha, nunca se infla el conteo. Ver la
   propia publicación no cuenta y los invitados (sin sesión) tampoco.
   Las estadísticas solo las lee el autor de la publicación. */
app.post('/api/posts/:id/view', async (req, res) => {
  const from = authPhone(req);
  if (!from) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const post = posts.find(function (p) { return p.id === req.params.id; });
  if (!post) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  if (from === post.author) return res.json({ ok: true, recorded: false, count: (postViews[post.id] || []).length });
  if (!postViews[post.id]) postViews[post.id] = [];
  const list = postViews[post.id];
  const old = list.find(function (v) { return v.viewer === from; });
  if (old) old.at = Date.now();
  else list.push({ viewer: from, at: Date.now() });
  try { await saveJsonStrict('post-views.json', postViews); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar la vista.' }); }
  return res.json({ ok: true, recorded: true, count: list.length });
});
app.get('/api/posts/:id/stats', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const post = posts.find(function (p) { return p.id === req.params.id; });
  if (!post) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  if (post.author !== phone) return res.status(403).json({ ok: false, error: 'Solo quien publicó puede ver sus estadísticas.' });
  return res.json({ ok: true, views: (postViews[post.id] || []).length, likes: Object.keys(post.likes || {}).length, comments: (post.comments || []).length, shares: (post.shares || []).length });
});

/* ---- quién compartió tu publicación (v3.8, idea 42) ----
   Los reposts ya existen como publicaciones con `sharedFrom`, así que
   no hace falta colección nueva: se buscan las publicaciones cuyo
   sharedFrom es este post. Solo el autor ve la lista. Los compartidos
   a otras apps no dejan registro y no aparecen. */
app.get('/api/posts/:id/shares', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const post = posts.find(function (p) { return p.id === req.params.id; });
  if (!post) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  if (post.author !== phone) return res.status(403).json({ ok: false, error: 'Solo quien publicó puede ver quién la compartió.' });
  const shares = posts.filter(function (p) {
    const sf = p.sharedFrom;
    return sf && (sf === post.id || sf.postId === post.id || sf.id === post.id);
  }).sort(function (a, b) { return b.createdAt - a.createdAt; }).map(function (p) {
    const pub = profilePublic(p.author);
    return { phone: p.author, name: pub.name, avatar: pub.avatar, at: p.createdAt, repostId: p.id };
  });
  return res.json({ ok: true, count: shares.length, shares });
});

/* ---- encuesta con foto (v3.8, idea 26) ----
   El voto vive en POST /api/posts/:id/vote (unificado con la encuesta
   de texto v1.1). Solo el autor ve quién votó qué. */
app.get('/api/posts/:id/votes', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const post = posts.find(function (p) { return p.id === req.params.id; });
  if (!post) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  if (post.author !== phone) return res.status(403).json({ ok: false, error: 'Solo quien publicó puede ver quién votó.' });
  if (!post.photoPoll) return res.status(400).json({ ok: false, error: 'Esta publicación no tiene encuesta con foto.' });
  const voters = (postVotes[post.id] || []).slice().sort(function (a, b) { return b.at - a.at; }).map(function (v) {
    const pub = profilePublic(v.voter);
    return { phone: v.voter, name: pub.name, avatar: pub.avatar, option: v.option, at: v.at };
  });
  return res.json({ ok: true, options: post.photoPoll.options, votes: photoPollCounts(post.id), voters });
});

/* ---- retos de Shorts (v3.8, idea 8) ----
   Solo retos que existen de verdad, con su conteo real de Shorts y
   los más recientes. */
app.get('/api/challenges', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const byTag = {};
  posts.forEach(function (p) {
    if (!p.challenge) return;
    if (!byTag[p.challenge]) byTag[p.challenge] = [];
    byTag[p.challenge].push(p);
  });
  const challenges = Object.keys(byTag).map(function (tag) {
    const list = byTag[tag].slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    return {
      tag, count: list.length, latest: list[0].createdAt,
      recent: list.slice(0, 5).map(function (p) { return { postId: p.id, author: p.author, createdAt: p.createdAt }; })
    };
  }).sort(function (a, b) { return b.count - a.count || b.latest - a.latest; });
  return res.json({ ok: true, challenges });
});

/* ---- encuesta en historias (v3.8, idea 7) ----
   Un voto por visitante por historia; se puede cambiar el voto; ver
   tu propia historia no vota; los invitados no votan. Los votos
   mueren con la historia (se borran al borrarla o al borrar la
   cuenta). */
app.post('/api/stories/:id/poll-vote', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const story = stories.find(function (s) { return s.id === req.params.id; });
  if (!story) return res.status(404).json({ ok: false, error: 'Historia no encontrada.' });
  if (Date.now() - story.createdAt > STORY_TTL_MS) return res.status(410).json({ ok: false, error: 'Historia caducada.' });
  if (!canSeeStory(story, phone)) return res.status(404).json({ ok: false, error: 'Historia no encontrada.' });
  if (!story.poll) return res.status(400).json({ ok: false, error: 'Esta historia no tiene encuesta.' });
  if (phone === story.author) return res.status(400).json({ ok: false, error: 'No puedes votar en tu propia historia.' });
  const option = Number(req.body && req.body.option);
  if (option !== 0 && option !== 1) return res.status(400).json({ ok: false, error: 'Opción inválida.' });
  if (!storyPollVotes[story.id]) storyPollVotes[story.id] = [];
  const list = storyPollVotes[story.id];
  const old = list.find(function (v) { return v.voter === phone; });
  if (old) { old.option = option; old.at = Date.now(); }
  else list.push({ voter: phone, option, at: Date.now() });
  try { await saveJsonStrict('story-poll-votes.json', storyPollVotes); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar el voto.' }); }
  const counts = storyPollCounts(story.id);
  return res.json({ ok: true, poll: { question: story.poll.question, options: story.poll.options.map(function (o, i) { return { text: o.text, votes: counts[i] }; }) } });
});

/* ---- reacciones rápidas a historias (v3.8, idea 9) ----
   Una reacción por visitante por historia, se puede cambiar; ver tu
   propia historia no reacciona; los invitados no reaccionan. Solo el
   autor ve quién reaccionó con qué emoji. */
app.post('/api/stories/:id/react', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const story = stories.find(function (s) { return s.id === req.params.id; });
  if (!story) return res.status(404).json({ ok: false, error: 'Historia no encontrada.' });
  if (Date.now() - story.createdAt > STORY_TTL_MS) return res.status(410).json({ ok: false, error: 'Historia caducada.' });
  if (!canSeeStory(story, phone)) return res.status(404).json({ ok: false, error: 'Historia no encontrada.' });
  if (phone === story.author) return res.status(400).json({ ok: false, error: 'No puedes reaccionar a tu propia historia.' });
  const emoji = String((req.body && req.body.emoji) || '').trim();
  if (!emoji || Array.from(emoji).length > 4) return res.status(400).json({ ok: false, error: 'Emoji inválido.' });
  if (!storyReactions[story.id]) storyReactions[story.id] = [];
  const list = storyReactions[story.id];
  const old = list.find(function (r) { return r.viewer === phone; });
  if (old) { old.emoji = emoji; old.at = Date.now(); }
  else list.push({ viewer: phone, emoji, at: Date.now() });
  try { await saveJsonStrict('story-reactions.json', storyReactions); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar la reacción.' }); }
  return res.json({ ok: true, reaction: { emoji } });
});
app.get('/api/stories/:id/reactions', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const story = stories.find(function (s) { return s.id === req.params.id; });
  if (!story) return res.status(404).json({ ok: false, error: 'Historia no encontrada.' });
  if (Date.now() - story.createdAt > STORY_TTL_MS) return res.status(410).json({ ok: false, error: 'Historia caducada.' });
  if (story.author !== phone) return res.status(403).json({ ok: false, error: 'Solo quien publicó la historia puede ver las reacciones.' });
  const list = (storyReactions[story.id] || []).slice().sort(function (a, b) { return b.at - a.at; });
  const byEmoji = {};
  list.forEach(function (r) { byEmoji[r.emoji] = (byEmoji[r.emoji] || 0) + 1; });
  const reactions = list.map(function (r) {
    const pub = profilePublic(r.viewer);
    return { phone: r.viewer, name: pub.name, avatar: pub.avatar, emoji: r.emoji, at: r.at };
  });
  return res.json({ ok: true, count: reactions.length, byEmoji, reactions });
});

/* ---- amigos cercanos (v3.8, idea 13) ----
   Solo amigos reales se pueden añadir a la lista de cercanos. */
app.get('/api/close-friends', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const list = (closeFriends[phone] || []).map(function (p) { return profilePublic(p); });
  return res.json({ ok: true, closeFriends: list });
});
app.post('/api/close-friends', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const friendPhone = normPhone(req.body && req.body.friendPhone);
  if (!profiles[friendPhone]) return res.status(404).json({ ok: false, error: 'Esa cuenta no existe.' });
  if (!(friends[phone] || []).includes(friendPhone)) return res.status(404).json({ ok: false, error: 'No es tu amigo.' });
  if (!closeFriends[phone]) closeFriends[phone] = [];
  if (!closeFriends[phone].includes(friendPhone)) closeFriends[phone].push(friendPhone);
  try { await saveJsonStrict('close-friends.json', closeFriends); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar.' }); }
  return res.json({ ok: true, closeFriends: closeFriends[phone].map(function (p) { return profilePublic(p); }) });
});
app.delete('/api/close-friends/:friendPhone', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const friendPhone = normPhone(req.params.friendPhone);
  if (closeFriends[phone]) closeFriends[phone] = closeFriends[phone].filter(function (p) { return p !== friendPhone; });
  try { await saveJsonStrict('close-friends.json', closeFriends); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar.' }); }
  return res.json({ ok: true, closeFriends: (closeFriends[phone] || []).map(function (p) { return profilePublic(p); }) });
});

/* ---- cuenta verificada (v3.8, idea 10) ----
   Regla honesta y automática, sin panel del dueño ni documentos: la
   insignia la concede el servidor cuando la cuenta cumple TODO de
   verdad (ver verificationStatus): teléfono verificado + perfil
   completo + cuenta con al menos 7 días + al menos 5 publicaciones.
   Una solicitud por cuenta: si ya está verificado, no se duplica. */
app.get('/api/verification/status', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  if (profiles[phone] && profiles[phone].verified) return res.json({ ok: true, verified: true, missing: [] });
  const st = verificationStatus(phone);
  return res.json({ ok: true, verified: false, missing: st.missing });
});
app.post('/api/verification/request', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  if (!profiles[phone]) return res.status(404).json({ ok: false, error: 'Perfil no encontrado.' });
  if (profiles[phone].verified) return res.json({ ok: true, verified: true, already: true });
  const st = verificationStatus(phone);
  if (!st.verified) return res.json({ ok: false, verified: false, missing: st.missing });
  profiles[phone].verified = true;
  try { await saveJsonStrict('profiles.json', profiles); }
  catch (e) {
    profiles[phone].verified = false;
    return res.status(500).json({ ok: false, error: 'No se pudo guardar la verificación.' });
  }
  broadcast({ kind: 'profile', profile: profiles[phone] });
  return res.json({ ok: true, verified: true });
});

/* ---- silenciados (v3.8, idea 31) ----
   El silencio SOLO apaga los avisos (notify() no crea el aviso si el
   destinatario silenció al remitente). Las publicaciones y los
   mensajes se siguen viendo normales. Nunca se silencia a nadie por
   defecto. */
app.get('/api/muted', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  return res.json({ ok: true, muted: (muted[phone] || []).map(function (p) { return profilePublic(p); }) });
});
app.post('/api/muted', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const target = normPhone(req.body && req.body.phone);
  if (!profiles[target]) return res.status(404).json({ ok: false, error: 'Esa cuenta no existe.' });
  if (target === phone) return res.status(400).json({ ok: false, error: 'No puedes silenciarte a ti mismo.' });
  if (!muted[phone]) muted[phone] = [];
  if (!muted[phone].includes(target)) muted[phone].push(target);
  try { await saveJsonStrict('muted.json', muted); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar.' }); }
  return res.json({ ok: true, muted: muted[phone].map(function (p) { return profilePublic(p); }) });
});
app.delete('/api/muted/:phone', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const target = normPhone(req.params.phone);
  if (muted[phone]) muted[phone] = muted[phone].filter(function (p) { return p !== target; });
  try { await saveJsonStrict('muted.json', muted); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar.' }); }
  return res.json({ ok: true, muted: (muted[phone] || []).map(function (p) { return profilePublic(p); }) });
});

/* ---- lista de deseos (v3.8, idea 21) ----
   Un documento por cuenta con sus ids. Solo anuncios reales; si el
   vendedor borró el anuncio, el deseo desaparece (se poda al leer). */
function wishlistPublic(phone) {
  let ids = wishlists[phone] || [];
  const live = ids.filter(function (id) { return listings.some(function (l) { return l.id === id; }); });
  if (live.length !== ids.length) { wishlists[phone] = live; saveJson('wishlists.json', wishlists); }
  return live.map(function (id) { return listings.find(function (l) { return l.id === id; }); });
}
app.get('/api/wishlist', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  return res.json({ ok: true, wishlist: wishlistPublic(phone) });
});
app.post('/api/wishlist', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const listingId = String((req.body && req.body.listingId) || '');
  if (!listings.some(function (l) { return l.id === listingId; })) return res.status(404).json({ ok: false, error: 'Anuncio no encontrado.' });
  if (!wishlists[phone]) wishlists[phone] = [];
  if (!wishlists[phone].includes(listingId)) wishlists[phone].push(listingId);
  try { await saveJsonStrict('wishlists.json', wishlists); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar.' }); }
  return res.json({ ok: true, wishlist: wishlistPublic(phone) });
});
app.delete('/api/wishlist/:listingId', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  if (wishlists[phone]) wishlists[phone] = wishlists[phone].filter(function (id) { return id !== req.params.listingId; });
  try { await saveJsonStrict('wishlists.json', wishlists); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar.' }); }
  return res.json({ ok: true, wishlist: wishlistPublic(phone) });
});

/* ---- cupones (v3.8, idea 34) ----
   Descuento real para tus productos. El pago sigue siendo manual: el
   comprador paga el total con descuento por transferencia. Nunca se
   inventa un descuento: solo cupones creados por el vendedor. */
function normalizeCouponCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}
app.post('/api/coupons', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const code = normalizeCouponCode(req.body && req.body.code);
  if (!/^[A-Z0-9\-]{3,20}$/.test(code)) return res.status(400).json({ ok: false, error: 'El código debe tener entre 3 y 20 letras o números.' });
  const discountPct = Number(req.body && req.body.discountPct);
  if (!Number.isInteger(discountPct) || discountPct < 1 || discountPct > 90) return res.status(400).json({ ok: false, error: 'El descuento debe ser un porcentaje entre 1 y 90.' });
  const listingId = (req.body && req.body.listingId) ? String(req.body.listingId) : null;
  if (listingId) {
    const l = listings.find(function (x) { return x.id === listingId; });
    if (!l) return res.status(404).json({ ok: false, error: 'Anuncio no encontrado.' });
    if (l.seller !== phone) return res.status(403).json({ ok: false, error: 'Solo puedes crear cupones sobre tus propias publicaciones.' });
  }
  const expiresAt = Number(req.body && req.body.expiresAt);
  if (!isFinite(expiresAt) || expiresAt <= Date.now()) return res.status(400).json({ ok: false, error: 'La vigencia debe ser una fecha futura.' });
  if (coupons.some(function (c) { return c.seller === phone && c.code === code; })) return res.status(400).json({ ok: false, error: 'Ya tienes un cupón con ese código.' });
  const coupon = { code, seller: phone, discountPct, listingId, expiresAt, createdAt: Date.now() };
  coupons.push(coupon);
  try { await saveJsonStrict('coupons.json', coupons); }
  catch (e) { coupons.pop(); return res.status(500).json({ ok: false, error: 'No se pudo guardar el cupón.' }); }
  return res.json({ ok: true, coupon });
});
app.get('/api/coupons', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const seller = normPhone(req.query.seller) || phone;
  return res.json({ ok: true, coupons: coupons.filter(function (c) { return c.seller === seller; }) });
});
app.post('/api/coupons/:code/apply', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const code = normalizeCouponCode(req.params.code);
  const listingId = String((req.body && req.body.listingId) || '');
  const listing = listings.find(function (l) { return l.id === listingId; });
  if (!listing) return res.status(404).json({ ok: false, error: 'Anuncio no encontrado.' });
  const coupon = coupons.find(function (c) { return c.code === code && c.seller === listing.seller; });
  if (!coupon) return res.status(404).json({ ok: false, error: 'Cupón no válido para esta publicación.' });
  if (coupon.expiresAt <= Date.now()) return res.status(400).json({ ok: false, error: 'El cupón venció.' });
  if (coupon.listingId && coupon.listingId !== listingId) return res.status(404).json({ ok: false, error: 'Cupón no válido para esta publicación.' });
  const originalPrice = Number(listing.price);
  if (!isFinite(originalPrice) || originalPrice < 0) return res.status(400).json({ ok: false, error: 'La publicación no tiene precio.' });
  const finalPrice = Math.round(originalPrice * (100 - coupon.discountPct) / 100 * 100) / 100;
  return res.json({ ok: true, code: coupon.code, discountPct: coupon.discountPct, originalPrice, finalPrice });
});

/* ---- salas de audio en vivo (v3.8, idea 19) ----
   Solo voz, sin video. La sala vive mientras tenga participantes: si
   se queda vacía, se cierra. Si el dueño sale y quedan participantes,
   la propiedad pasa al participante más antiguo. */
function roomPublic(room) {
  return {
    id: room.id, title: room.title, topic: room.topic, owner: room.owner,
    ownerName: (profiles[room.owner] && profiles[room.owner].name) || room.owner,
    participants: room.participants.map(function (pt) {
      const pub = profilePublic(pt.phone);
      return { phone: pt.phone, name: pub.name, avatar: pub.avatar, muted: !!pt.muted };
    }),
    count: room.participants.length, createdAt: room.createdAt
  };
}
app.post('/api/audio-rooms', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const title = String((req.body && req.body.title) || '').trim().slice(0, 80);
  if (!title) return res.status(400).json({ ok: false, error: 'La sala necesita un título.' });
  const topic = String((req.body && req.body.topic) || '').trim().slice(0, 120);
  const room = { id: uid('room'), title, topic, owner: phone, participants: [{ phone, muted: false, joinedAt: Date.now() }], createdAt: Date.now(), endedAt: null };
  audioRooms.push(room);
  try { await saveJsonStrict('audio-rooms.json', audioRooms); }
  catch (e) { audioRooms.pop(); return res.status(500).json({ ok: false, error: 'No se pudo crear la sala.' }); }
  broadcast({ kind: 'audioRoomUpdated', roomId: room.id, count: 1 });
  return res.json({ ok: true, room: roomPublic(room) });
});
app.get('/api/audio-rooms', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const live = audioRooms.filter(function (r) { return !r.endedAt && r.participants.length > 0; });
  return res.json({ ok: true, rooms: live.map(roomPublic) });
});
app.post('/api/audio-rooms/:id/join', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const room = audioRooms.find(function (r) { return r.id === req.params.id; });
  if (!room || room.endedAt) return res.status(404).json({ ok: false, error: 'Sala no encontrada.' });
  const existing = room.participants.find(function (pt) { return pt.phone === phone; });
  if (existing) existing.muted = !!(req.body && req.body.muted);
  else room.participants.push({ phone, muted: !!(req.body && req.body.muted), joinedAt: Date.now() });
  try { await saveJsonStrict('audio-rooms.json', audioRooms); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo entrar a la sala.' }); }
  broadcast({ kind: 'audioRoomUpdated', roomId: room.id, count: room.participants.length });
  return res.json({ ok: true, room: roomPublic(room) });
});
app.post('/api/audio-rooms/:id/leave', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const room = audioRooms.find(function (r) { return r.id === req.params.id; });
  if (!room || room.endedAt) return res.status(404).json({ ok: false, error: 'Sala no encontrada.' });
  room.participants = room.participants.filter(function (pt) { return pt.phone !== phone; });
  if (room.owner === phone && room.participants.length) room.owner = room.participants[0].phone;
  if (!room.participants.length) room.endedAt = Date.now();
  try { await saveJsonStrict('audio-rooms.json', audioRooms); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo salir de la sala.' }); }
  broadcast({ kind: room.endedAt ? 'audioRoomClosed' : 'audioRoomUpdated', roomId: room.id, count: room.participants.length });
  return res.json({ ok: true });
});
app.post('/api/audio-rooms/:id/mute', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const room = audioRooms.find(function (r) { return r.id === req.params.id; });
  if (!room || room.endedAt) return res.status(404).json({ ok: false, error: 'Sala no encontrada.' });
  const pt = room.participants.find(function (x) { return x.phone === phone; });
  if (!pt) return res.status(403).json({ ok: false, error: 'No estás en esa sala.' });
  pt.muted = !!(req.body && req.body.muted);
  try { await saveJsonStrict('audio-rooms.json', audioRooms); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo cambiar el micrófono.' }); }
  broadcast({ kind: 'audioRoomUpdated', roomId: room.id, count: room.participants.length });
  return res.json({ ok: true, room: roomPublic(room) });
});
app.delete('/api/audio-rooms/:id', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const room = audioRooms.find(function (r) { return r.id === req.params.id; });
  if (!room || room.endedAt) return res.status(404).json({ ok: false, error: 'Sala no encontrada.' });
  const isOwner = room.owner === phone;
  const isParticipant = room.participants.some(function (pt) { return pt.phone === phone; });
  if (!isOwner && !(isParticipant && !room.participants.some(function (pt) { return pt.phone === room.owner; }))) {
    return res.status(403).json({ ok: false, error: 'Solo el creador puede cerrar la sala.' });
  }
  room.endedAt = Date.now();
  try { await saveJsonStrict('audio-rooms.json', audioRooms); }
  catch (e) { room.endedAt = null; return res.status(500).json({ ok: false, error: 'No se pudo cerrar la sala.' }); }
  broadcast({ kind: 'audioRoomClosed', roomId: room.id, count: 0 });
  return res.json({ ok: true });
});

/* Señalización WebRTC de las salas de audio (v3.8, idea 19): igual que
   /api/live-signal, pero para la malla de voz de la sala. La app la
   llama para offer/answer/ice y escucha 'audioRoomSignal' por
   WebSocket. Sin este endpoint el audio entre teléfonos no se conecta:
   la sala solo mostraría quién está, sin voz. */
app.post('/api/audio-rooms/:id/signal', (req, res) => {
  const from = authPhone(req);
  if (!from) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const room = audioRooms.find(function (r) { return r.id === req.params.id; });
  if (!room || room.endedAt) return res.status(404).json({ ok: false, error: 'Sala no encontrada.' });
  if (!room.participants.some(function (p) { return p.phone === from; })) return res.status(403).json({ ok: false, error: 'No estás en esta sala.' });
  const to = normPhone(req.body && req.body.to);
  const type = String((req.body && req.body.type) || '');
  if (!profiles[to]) return res.status(404).json({ ok: false, error: 'Esa persona no existe.' });
  if (!room.participants.some(function (p) { return p.phone === to; })) return res.status(403).json({ ok: false, error: 'Esa persona no está en esta sala.' });
  if (!['offer', 'answer', 'ice'].includes(type)) return res.status(400).json({ ok: false, error: 'Señal inválida.' });
  const set = sockets.get(to);
  if (!set || !set.size) return res.status(404).json({ ok: false, error: 'La otra persona no está en línea.' });
  sendTo(to, { kind: 'audioRoomSignal', from, roomId: room.id, type, offer: (req.body && req.body.offer) || null, answer: (req.body && req.body.answer) || null, candidate: (req.body && req.body.candidate) || null, payload: (req.body && req.body.payload) || null });
  return res.json({ ok: true });
});

/* ---- torneos de juegos (v3.8, idea 20) ----
   Un torneo por semana (lunes a domingo), con el juego de la semana
   rotando entre los 36 minijuegos. Solo se guarda el mejor puntaje
   por jugador y torneo: repetir solo mejora si el puntaje es mayor.
   Nunca se inventan puntajes; el conteo empieza con 3.8. */
app.get('/api/tournaments/current', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const t = getOrCreateCurrentTournament();
  return res.json({ ok: true, tournament: tournamentPublic(t) });
});
app.post('/api/tournaments/:id/score', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const t = tournaments.find(function (x) { return x.id === req.params.id; });
  if (!t) return res.status(404).json({ ok: false, error: 'Torneo no encontrado.' });
  const current = getOrCreateCurrentTournament();
  if (t.weekKey !== current.weekKey) return res.status(400).json({ ok: false, error: 'Ese torneo ya terminó.' });
  const score = Math.floor(Number(req.body && req.body.score));
  if (!isFinite(score) || score < 0 || score > 10000000) return res.status(400).json({ ok: false, error: 'Puntaje inválido.' });
  if (!t.scores) t.scores = {};
  const best = t.scores[phone] || 0;
  const improved = score > best;
  if (improved) t.scores[phone] = score;
  try { await saveJsonStrict('tournaments.json', tournaments); }
  catch (e) {
    if (improved) t.scores[phone] = best;
    return res.status(500).json({ ok: false, error: 'No se pudo guardar el puntaje.' });
  }
  return res.json({ ok: true, best: t.scores[phone] || 0, improved });
});

/* ---- mensajes temporales (v3.8, idea 32) ----
   La conversación 1 a 1 gana disappearingHours (24 o 0). Al leerla,
   el servidor poda los mensajes vencidos de verdad (ver GET
   /api/messages). El archivo del medio en Cloudinary puede quedar
   guardado aunque el mensaje y su enlace ya no existan. */
app.post('/api/conversations/:id/disappearing', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const other = normPhone(req.params.id);
  if (!profiles[other]) return res.status(404).json({ ok: false, error: 'Esa cuenta no existe.' });
  const hours = Number(req.body && req.body.hours);
  if (hours !== 24 && hours !== 0) return res.status(400).json({ ok: false, error: 'Solo 24 horas o apagado (0).' });
  const key = conversationKey(phone, other);
  if (hours === 0) delete conversationSettings[key];
  else conversationSettings[key] = { disappearingHours: 24 };
  const pruned = pruneDisappearingMessages(phone, other);
  try { await saveJsonStrict('conversation-settings.json', conversationSettings); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar.' }); }
  if (pruned) saveJson('messages.json', messages);
  return res.json({ ok: true, disappearingHours: hours });
});

/* ---- regalos en los en vivos (v3.8, idea 16) ----
   Regalos virtuales, SIN dinero y SIN precios: cada envío suma uno al
   conteo del regalo. El creador ve quién regaló qué. */
function liveGiftCounts(liveId) {
  const counts = {};
  GIFT_IDS.forEach(function (g) { counts[g] = 0; });
  (liveGifts[liveId] || []).forEach(function (g) { if (counts[g.giftId] !== undefined) counts[g.giftId]++; });
  return counts;
}
app.post('/api/lives/:id/gift', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const live = lives.find(function (l) { return l.id === req.params.id; });
  if (!live || live.endedAt) return res.status(404).json({ ok: false, error: 'Live no encontrado o terminado.' });
  const giftId = String((req.body && req.body.giftId) || '');
  if (!GIFT_IDS.includes(giftId)) return res.status(400).json({ ok: false, error: 'Regalo inválido.' });
  if (!liveGifts[live.id]) liveGifts[live.id] = [];
  liveGifts[live.id].push({ giftId, from: phone, at: Date.now() });
  try { await saveJsonStrict('live-gifts.json', liveGifts); }
  catch (e) { liveGifts[live.id].pop(); return res.status(500).json({ ok: false, error: 'No se pudo enviar el regalo.' }); }
  const counts = liveGiftCounts(live.id);
  const total = liveGifts[live.id].length;
  broadcast({ kind: 'liveGift', liveId: live.id, giftId, from: phone, counts, total });
  return res.json({ ok: true, counts, total });
});
app.get('/api/lives/:id/gifts', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const live = lives.find(function (l) { return l.id === req.params.id; });
  if (!live) return res.status(404).json({ ok: false, error: 'Live no encontrado.' });
  const counts = liveGiftCounts(live.id);
  const byGiver = {};
  (liveGifts[live.id] || []).forEach(function (g) { byGiver[g.from] = (byGiver[g.from] || 0) + 1; });
  const top = Object.keys(byGiver).map(function (p) {
    const pub = profilePublic(p);
    return { phone: p, name: pub.name, avatar: pub.avatar, gifts: byGiver[p] };
  }).sort(function (a, b) { return b.gifts - a.gifts; }).slice(0, 10);
  return res.json({ ok: true, counts, total: (liveGifts[live.id] || []).length, top });
});

/* ---- grupos ---- */
app.post('/api/groups', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const name = String((req.body && req.body.name) || '').trim();
  if (name.length < 3) return res.status(400).json({ ok: false, error: 'El grupo necesita un nombre.' });
  const g = { id: uid('grp'), name: name.slice(0, 80), desc: String((req.body && req.body.desc) || '').slice(0, 300), creator: phone, members: [phone], admins: [], cover: String((req.body && req.body.cover) || ''), coverType: (req.body && req.body.coverType) === 'video' ? 'video' : 'image', accent: GROUP_ACCENTS.includes(req.body && req.body.accent) ? req.body.accent : 'rojo', headerGradient: GROUP_GRADIENTS.includes(req.body && req.body.headerGradient) ? req.body.headerGradient : 'none', rules: String((req.body && req.body.rules) || '').slice(0, 500), approval: !!(req.body && req.body.approval), joinRequests: [], pinnedPosts: [], createdAt: Date.now(),
    /* v3.8: grupo secreto — no aparece en búsquedas ni en descubrimiento
       para quien no es miembro; solo se entra por invitación. */
    secret: !!(req.body && req.body.secret), invites: [] };
  groups.push(g);
  saveJson('groups.json', groups);
  return res.json({ ok: true, group: g });
});
/* v3.8: los grupos secretos no aparecen en el descubrimiento para
   quien no es miembro (los miembros sí los ven). */
app.get('/api/groups', (req, res) => {
  const phone = authPhone(req);
  const visible = groups.filter(function (g) {
    if (!g.secret) return true;
    return !!phone && g.members.includes(phone);
  });
  return res.json({ ok: true, groups: visible });
});
/* v3.8: información pública de un grupo para el enlace de invitación
   (nombre, portada, conteo de miembros, si es secreto) — sin revelar
   nada de dentro. */
app.get('/api/groups/:id/public', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groups.find(function (x) { return x.id === req.params.id; });
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo no encontrado.' });
  return res.json({ ok: true, group: { id: g.id, name: g.name, desc: g.desc || '', cover: g.cover || '', memberCount: (g.members || []).length, secret: !!g.secret, creator: g.creator, isMember: g.members.includes(phone) } });
});
/* v3.8: invitar a un grupo secreto (o a cualquier grupo) — solo
   administradores. El invitado recibe el aviso en la campana para
   aceptar (join) o rechazar. */
app.post('/api/groups/:id/invite', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groups.find(function (x) { return x.id === req.params.id; });
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo no encontrado.' });
  if (g.creator !== phone && !(g.admins || []).includes(phone)) return res.status(403).json({ ok: false, error: 'Solo los administradores pueden invitar.' });
  const invited = normPhone(req.body && req.body.phone);
  if (!profiles[invited]) return res.status(404).json({ ok: false, error: 'Esa cuenta no existe.' });
  if (g.members.includes(invited)) return res.status(400).json({ ok: false, error: 'Esa persona ya es miembro.' });
  if (!g.invites) g.invites = [];
  if (!g.invites.includes(invited)) g.invites.push(invited);
  try { await saveJsonStrict('groups.json', groups); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo enviar la invitación.' }); }
  notify('groupInvite', phone, invited, 'te invitó al grupo ' + g.name, g.id);
  return res.json({ ok: true });
});
app.post('/api/groups/:id/invite/decline', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groups.find(function (x) { return x.id === req.params.id; });
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo no encontrado.' });
  if (g.invites) g.invites = g.invites.filter(function (p) { return p !== phone; });
  try { await saveJsonStrict('groups.json', groups); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo rechazar la invitación.' }); }
  return res.json({ ok: true });
});
app.post('/api/groups/:id/join', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo no encontrado.' });
  if (g.members.includes(phone)) return res.json({ ok: true, group: g });
  /* v3.8: a un grupo secreto solo se entra por invitación; el enlace
     solo NO salta las reglas. Al aceptar, la invitación se consume. */
  if (g.secret) {
    if (!(g.invites || []).includes(phone)) return res.status(403).json({ ok: false, error: 'Este grupo es secreto y solo se entra por invitación.' });
    g.invites = g.invites.filter(function (p) { return p !== phone; });
    g.members.push(phone);
    saveJson('groups.json', groups);
    return res.json({ ok: true, group: g });
  }
  if (g.approval) {
    if (!g.joinRequests.includes(phone)) g.joinRequests.push(phone);
    saveJson('groups.json', groups);
    return res.json({ ok: true, group: g, requested: true });
  }
  g.members.push(phone);
  saveJson('groups.json', groups);
  return res.json({ ok: true, group: g });
});
app.post('/api/groups/:id/leave', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo no encontrado.' });
  if (g.creator === phone) return res.status(400).json({ ok: false, error: 'El creador no puede salir del grupo.' });
  g.members = g.members.filter(m => m !== phone);
  g.admins = (g.admins || []).filter(m => m !== phone);
  saveJson('groups.json', groups);
  return res.json({ ok: true, group: g });
});

/* ---- administradores y personalización de grupos (v1.2, ola 7) ---- */
app.put('/api/groups/:id', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo no encontrado.' });
  if (!isGroupManagerSrv(g, phone)) return res.status(403).json({ ok: false, error: 'Solo el creador y los administradores personalizan el grupo.' });
  const body = (req.body && req.body.group) || req.body;
  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (name.length < 3) return res.status(400).json({ ok: false, error: 'El grupo necesita un nombre.' });
    g.name = name.slice(0, 80);
  }
  if (body.desc !== undefined) g.desc = String(body.desc || '').slice(0, 300);
  if (body.cover !== undefined) g.cover = String(body.cover || '');
  if (body.coverType !== undefined) g.coverType = body.coverType === 'video' ? 'video' : 'image';
  if (!g.cover) g.coverType = 'image';
  if (body.accent !== undefined) {
    if (!GROUP_ACCENTS.includes(body.accent)) return res.status(400).json({ ok: false, error: 'Ese color no existe.' });
    g.accent = body.accent;
  }
  if (body.headerGradient !== undefined) {
    if (!GROUP_GRADIENTS.includes(body.headerGradient)) return res.status(400).json({ ok: false, error: 'Ese degradado no existe.' });
    g.headerGradient = body.headerGradient;
  }
  if (body.rules !== undefined) g.rules = String(body.rules || '').slice(0, 500);
  if (body.approval !== undefined) g.approval = !!body.approval;
  saveJson('groups.json', groups);
  /* v1.5: la portada y la personalización se ven en vivo para todos. */
  broadcast({ kind: 'group', groupId: g.id, group: g });
  return res.json({ ok: true, group: g });
});
app.post('/api/groups/:id/admins', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo no encontrado.' });
  if (g.creator !== phone) return res.status(403).json({ ok: false, error: 'Solo quien creó el grupo nombra administradores.' });
  const target = normPhone(req.body && req.body.phone);
  if (!g.members.includes(target)) return res.status(400).json({ ok: false, error: 'Esa persona no es miembro del grupo.' });
  if ((g.admins || []).includes(target)) return res.status(400).json({ ok: false, error: 'Esa persona ya es administradora.' });
  if ((g.admins || []).length >= 3) return res.status(400).json({ ok: false, error: 'El grupo ya tiene 3 administradores (el máximo).' });
  g.admins.push(target);
  saveJson('groups.json', groups);
  return res.json({ ok: true, group: g });
});
app.delete('/api/groups/:id/admins/:phone', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo no encontrado.' });
  if (g.creator !== phone) return res.status(403).json({ ok: false, error: 'Solo quien creó el grupo quita administradores.' });
  g.admins = (g.admins || []).filter(m => m !== normPhone(req.params.phone));
  saveJson('groups.json', groups);
  return res.json({ ok: true, group: g });
});
app.post('/api/groups/:id/members/:phone/:action', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo no encontrado.' });
  if (!isGroupManagerSrv(g, phone)) return res.status(403).json({ ok: false, error: 'Solo el creador y los administradores administran miembros.' });
  const target = normPhone(req.params.phone);
  const action = req.params.action;
  if (action === 'approve') {
    if (!(g.joinRequests || []).includes(target)) return res.status(400).json({ ok: false, error: 'No hay solicitud de esa persona.' });
    g.joinRequests = g.joinRequests.filter(m => m !== target);
    if (!g.members.includes(target)) g.members.push(target);
  } else if (action === 'reject') {
    g.joinRequests = (g.joinRequests || []).filter(m => m !== target);
  } else if (action === 'remove') {
    if (target === g.creator) return res.status(400).json({ ok: false, error: 'No se puede quitar al creador del grupo.' });
    if ((g.admins || []).includes(target) && phone !== g.creator) return res.status(403).json({ ok: false, error: 'Solo el creador puede quitar a otro administrador.' });
    g.members = g.members.filter(m => m !== target);
    g.admins = (g.admins || []).filter(m => m !== target);
  } else return res.status(400).json({ ok: false, error: 'Acción inválida.' });
  saveJson('groups.json', groups);
  return res.json({ ok: true, group: g });
});
app.post('/api/groups/:id/pin', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo no encontrado.' });
  if (!isGroupManagerSrv(g, phone)) return res.status(403).json({ ok: false, error: 'Solo el creador y los administradores fijan publicaciones.' });
  const postId = req.body && req.body.postId;
  const post = posts.find(p => p.id === postId);
  if (!post || post.groupId !== g.id) return res.status(404).json({ ok: false, error: 'Esa publicación no es de este grupo.' });
  if (!g.pinnedPosts) g.pinnedPosts = [];
  if (req.body && req.body.pin) {
    if (!g.pinnedPosts.includes(postId)) g.pinnedPosts.push(postId);
    post.pinnedInGroup = true;
  } else {
    g.pinnedPosts = g.pinnedPosts.filter(x => x !== postId);
    post.pinnedInGroup = false;
  }
  saveJson('groups.json', groups);
  saveJson('posts.json', posts);
  return res.json({ ok: true, group: g });
});

/* ---- bloquear / desbloquear / reportar cuentas (v1.2, ola 7) ---- */
app.post('/api/block', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const target = normPhone(req.body && req.body.phone);
  if (!profiles[target]) return res.status(404).json({ ok: false, error: 'Esa persona no existe.' });
  if (target === phone) return res.status(400).json({ ok: false, error: 'No puedes bloquearte a ti.' });
  if (!blocked[phone]) blocked[phone] = [];
  if (!blocked[phone].includes(target)) blocked[phone].push(target);
  if (friends[phone]) friends[phone] = friends[phone].filter(f => f !== target);
  if (friends[target]) friends[target] = friends[target].filter(f => f !== phone);
  saveAll();
  return res.json({ ok: true, blocked: blocked[phone] });
});
app.post('/api/unblock', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const target = normPhone(req.body && req.body.phone);
  blocked[phone] = (blocked[phone] || []).filter(f => f !== target);
  saveAll();
  return res.json({ ok: true, blocked: blocked[phone] || [] });
});
app.get('/api/blocked', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  return res.json({ ok: true, blocked: blocked[phone] || [] });
});
const REPORT_REASONS_SRV = ['spam', 'acoso', 'cuenta falsa', 'contenido inapropiado', 'otro'];
app.post('/api/reports', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const reported = normPhone(req.body && req.body.reported);
  const reason = req.body && req.body.reason;
  if (!profiles[reported]) return res.status(404).json({ ok: false, error: 'Esa persona no existe.' });
  if (reported === phone) return res.status(400).json({ ok: false, error: 'No puedes reportarte a ti.' });
  if (!REPORT_REASONS_SRV.includes(reason)) return res.status(400).json({ ok: false, error: 'Elige un motivo para el reporte.' });
  const report = { id: uid('rep'), reporter: phone, reported, reason, desc: String((req.body && req.body.desc) || '').slice(0, 500), createdAt: Date.now(), status: 'pendiente' };
  reports.unshift(report);
  saveJson('reports.json', reports);
  return res.json({ ok: true, report });
});
app.get('/api/reports', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  return res.json({ ok: true, reports: reports.filter(r => r.reporter === phone) });
});

/* ---- anuncios de empresas (v1.2, ola 8) ---- */
app.post('/api/ads', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const body = req.body || {};
  const page = pages.find(x => x.id === body.pageId);
  if (!page) return res.status(404).json({ ok: false, error: 'Esa página no existe.' });
  if (page.creator !== phone) return res.status(403).json({ ok: false, error: 'Solo quien creó la página publica anuncios de su empresa.' });
  const title = String(body.title || '').trim();
  const text = String(body.text || '').trim();
  if (title.length < 3) return res.status(400).json({ ok: false, error: 'El anuncio necesita un título.' });
  if (!text && !body.media) return res.status(400).json({ ok: false, error: 'El anuncio necesita texto o imagen/video.' });
  const ad = {
    id: uid('post'), author: phone, pageId: page.id, isAd: true,
    adTitle: title.slice(0, 100), adLink: String(body.link || '').slice(0, 500),
    text: text.slice(0, 2000), media: body.media || '', mediaType: body.mediaType || '',
    mediaList: Array.isArray(body.mediaList) ? body.mediaList.slice() : [], /* ola 11: sin límite */
    song: validateSongSrv(body.song),
    privacy: 'Público', createdAt: Date.now(), likes: {}, comments: [], shares: [], savedBy: [],
    editCount: 0, editedAt: null, edited: false
  };
  posts.unshift(ad);
  saveJson('posts.json', posts);
  return res.json({ ok: true, ad });
});
app.get('/api/ads', (req, res) => {
  const phone = normPhone(req.query.phone);
  const ads = posts.filter(p => p.isAd && !isBlockedSrv(phone, p.author)).sort((a, b) => b.createdAt - a.createdAt);
  return res.json({ ok: true, ads });
});

/* ---- grupos de ventas (v1.2, dentro de Ventas) ---- */
app.get('/api/sales-groups', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  let list = salesGroups.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (q) list = list.filter(g => (g.name + ' ' + g.desc + ' ' + g.category).toLowerCase().includes(q));
  return res.json({ ok: true, salesGroups: list });
});
app.post('/api/sales-groups', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const body = (req.body && req.body.group) || req.body;
  const name = String((body && body.name) || '').trim();
  if (name.length < 3) return res.status(400).json({ ok: false, error: 'El grupo necesita un nombre.' });
  const g = {
    id: (body && body.id) || uid('sg'), name: name.slice(0, 80),
    desc: String((body && body.desc) || '').slice(0, 300),
    photo: (body && body.photo) || '',
    category: String((body && body.category) || 'Otros'),
    rules: String((body && body.rules) || '').slice(0, 500),
    cover: String((body && body.cover) || ''),
    coverType: (body && body.coverType) === 'video' ? 'video' : 'image',
    accent: GROUP_ACCENTS.includes(body && body.accent) ? body.accent : 'rojo',
    headerGradient: GROUP_GRADIENTS.includes(body && body.headerGradient) ? body.headerGradient : 'none',
    creator: phone, members: (body && body.members) || [phone],
    createdAt: (body && body.createdAt) || Date.now()
  };
  const existing = salesGroups.find(x => x.id === g.id);
  if (existing) { Object.assign(existing, g); saveJson('sales-groups.json', salesGroups); return res.json({ ok: true, group: existing }); }
  salesGroups.push(g);
  saveJson('sales-groups.json', salesGroups);
  return res.json({ ok: true, group: g });
});
/* Personalizar un grupo de ventas (v1.5): solo quien lo creó (no tienen
   administradores). La foto del grupo se mantiene; la portada y los
   colores son aparte y se ven en vivo para todos. */
app.put('/api/sales-groups/:id', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = salesGroups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo de ventas no encontrado.' });
  if (!isGroupManagerSrv(g, phone)) return res.status(403).json({ ok: false, error: 'Solo quien creó el grupo puede personalizarlo.' });
  const body = (req.body && req.body.group) || req.body;
  if (body.name !== undefined) {
    const name = String(body.name || '').trim();
    if (name.length < 3) return res.status(400).json({ ok: false, error: 'El grupo necesita un nombre.' });
    g.name = name.slice(0, 80);
  }
  if (body.desc !== undefined) g.desc = String(body.desc || '').slice(0, 300);
  if (body.cover !== undefined) g.cover = String(body.cover || '');
  if (body.coverType !== undefined) g.coverType = body.coverType === 'video' ? 'video' : 'image';
  if (!g.cover) g.coverType = 'image';
  if (body.accent !== undefined) {
    if (!GROUP_ACCENTS.includes(body.accent)) return res.status(400).json({ ok: false, error: 'Ese color no existe.' });
    g.accent = body.accent;
  }
  if (body.headerGradient !== undefined) {
    if (!GROUP_GRADIENTS.includes(body.headerGradient)) return res.status(400).json({ ok: false, error: 'Ese degradado no existe.' });
    g.headerGradient = body.headerGradient;
  }
  if (body.rules !== undefined) g.rules = String(body.rules || '').slice(0, 500);
  saveJson('sales-groups.json', salesGroups);
  broadcast({ kind: 'sales-group', groupId: g.id, group: g });
  return res.json({ ok: true, group: g });
});
app.post('/api/sales-groups/:id/join', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = salesGroups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo de ventas no encontrado.' });
  if (!g.members.includes(phone)) g.members.push(phone);
  saveJson('sales-groups.json', salesGroups);
  return res.json({ ok: true, group: g });
});
app.post('/api/sales-groups/:id/leave', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = salesGroups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo de ventas no encontrado.' });
  if (g.creator === phone) return res.status(400).json({ ok: false, error: 'Quien creó el grupo no puede salir.' });
  g.members = g.members.filter(m => m !== phone);
  saveJson('sales-groups.json', salesGroups);
  return res.json({ ok: true, group: g });
});
app.delete('/api/sales-groups/:id', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const i = salesGroups.findIndex(x => x.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, error: 'Grupo de ventas no encontrado.' });
  if (salesGroups[i].creator !== phone) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  const gid = salesGroups[i].id;
  salesGroups.splice(i, 1);
  listings.forEach(l => { if (l.salesGroupId === gid) l.salesGroupId = null; });
  saveJson('sales-groups.json', salesGroups);
  saveJson('listings.json', listings);
  return res.json({ ok: true });
});

/* ---- perfil de ventas y valoraciones (v1.2) ---- */
app.get('/api/sellers/:phone', (req, res) => {
  const seller = normPhone(req.params.phone);
  const prof = profiles[seller];
  if (!prof) return res.status(404).json({ ok: false, error: 'Vendedor no encontrado.' });
  const mine = listings.filter(l => l.seller === seller);
  const rs = ratings.filter(r => r.seller === seller);
  const total = rs.reduce((a, r) => a + r.stars, 0);
  let since = prof.createdAt;
  mine.forEach(l => { if (l.createdAt < since) since = l.createdAt; });
  return res.json({ ok: true, seller: {
    phone: seller, name: prof.name, photo: prof.photo || '', since,
    active: mine.filter(l => l.status === 'Activo'),
    sold: mine.filter(l => l.status === 'Vendido'),
    avg: rs.length ? Math.round(total / rs.length * 10) / 10 : 0,
    count: rs.length, ratings: rs.slice().sort((a, b) => b.createdAt - a.createdAt)
  } });
});
app.get('/api/sellers/:phone/ratings', (req, res) => {
  const seller = normPhone(req.params.phone);
  return res.json({ ok: true, ratings: ratings.filter(r => r.seller === seller).sort((a, b) => b.createdAt - a.createdAt) });
});
app.post('/api/sellers/:phone/ratings', (req, res) => {
  const rater = authPhone(req);
  if (!rater) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const seller = normPhone(req.params.phone);
  if (!profiles[seller]) return res.status(404).json({ ok: false, error: 'Vendedor no encontrado.' });
  if (rater === seller) return res.status(400).json({ ok: false, error: 'No puedes valorarte a ti.' });
  const stars = Number(req.body && req.body.stars);
  if (!stars || stars < 1 || stars > 5 || Math.floor(stars) !== stars) return res.status(400).json({ ok: false, error: 'Elige de 1 a 5 estrellas.' });
  const comment = String((req.body && req.body.comment) || '').trim().slice(0, 300);
  const existing = ratings.find(r => r.seller === seller && r.rater === rater);
  if (existing) {
    existing.stars = stars; existing.comment = comment; existing.createdAt = Date.now();
    saveJson('ratings.json', ratings);
    return res.json({ ok: true, rating: existing, updated: true });
  }
  const r = { id: uid('rate'), seller, rater, stars, comment, createdAt: Date.now() };
  ratings.push(r);
  saveJson('ratings.json', ratings);
  return res.json({ ok: true, rating: r, updated: false });
});

/* ---- señalización de llamadas WebRTC (v1.2) ----
   Solo reenvía la señal (oferta/respuesta/ICE/colgar) al otro teléfono
   por su WebSocket. Si no está en línea, avisa al que llama. */
app.post('/api/call-signal', (req, res) => {
  const from = authPhone(req);
  if (!from) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const to = normPhone(req.body && req.body.to);
  const type = String((req.body && req.body.type) || '');
  const payload = (req.body && req.body.payload) || null;
  if (!profiles[to]) return res.status(404).json({ ok: false, error: 'Esa persona no existe.' });
  if (from === to) return res.status(400).json({ ok: false, error: 'No puedes llamarte a ti.' });
  if (!['offer', 'answer', 'ice', 'hangup', 'reject', 'busy'].includes(type)) return res.status(400).json({ ok: false, error: 'Señal inválida.' });
  const set = sockets.get(to);
  if (!set || !set.size) return res.status(404).json({ ok: false, error: 'La otra persona no está en línea.' });
  sendTo(to, { kind: 'call', from, type, payload });
  return res.json({ ok: true });
});

/* ---- transmisiones en vivo (v1.5) ----
   Malla WebRTC: el transmisor se conecta directo con cada espectador.
   El servidor solo guarda el live, difunde sus eventos (inicio, fin,
   espectadores, chat, reacciones) y pasa la señalización
   (oferta/respuesta/ICE). El video del live no queda guardado. */
function activeLives() { return lives.filter(l => !l.endedAt); }
function livePublic(l) {
  return { id: l.id, host: l.host, title: l.title || '', createdAt: l.createdAt, viewers: (l.viewers || []).slice(), viewerCount: (l.viewers || []).length, chat: (l.chat || []).slice(-50), reactions: l.reactions || {}, likes: l.likes || 0, coHost: l.coHost || null };
}
app.get('/api/lives', (req, res) => {
  return res.json({ ok: true, lives: activeLives().map(livePublic) });
});
app.post('/api/lives', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  if (!profiles[phone]) return res.status(404).json({ ok: false, error: 'Perfil no encontrado.' });
  if (activeLives().some(l => l.host === phone)) return res.status(400).json({ ok: false, error: 'Ya tienes un live en curso.' });
  const title = String((req.body && req.body.title) || '').trim().slice(0, 100);
  const live = { id: uid('live'), host: phone, title, createdAt: Date.now(), endedAt: null, viewers: [], chat: [], reactions: {}, likes: 0, coHost: null, invite: null };
  lives.push(live);
  saveJson('lives.json', lives);
  broadcast({ kind: 'live', event: 'started', live: livePublic(live) });
  /* A los seguidores les llega el aviso de que estás en vivo. */
  const hostName = profiles[phone].name || phone;
  (friends[phone] || []).forEach(f => {
    if (f !== phone) notify('live', phone, f, hostName + ' está en vivo' + (title ? ': ' + title : ''), live.id);
  });
  return res.json({ ok: true, live: livePublic(live) });
});
app.post('/api/lives/:id/end', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const live = lives.find(l => l.id === req.params.id);
  if (!live) return res.status(404).json({ ok: false, error: 'Live no encontrado.' });
  if (live.host !== phone) return res.status(403).json({ ok: false, error: 'Solo el transmisor puede terminar el live.' });
  if (live.endedAt) return res.json({ ok: true, live: livePublic(live) });
  live.endedAt = Date.now();
  saveJson('lives.json', lives);
  broadcast({ kind: 'live', event: 'ended', liveId: live.id });
  return res.json({ ok: true, live: livePublic(live) });
});
app.post('/api/lives/:id/join', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const live = lives.find(l => l.id === req.params.id);
  if (!live || live.endedAt) return res.status(404).json({ ok: false, error: 'Ese live ya terminó.' });
  if (live.host !== phone && !live.viewers.includes(phone)) live.viewers.push(phone);
  saveJson('lives.json', lives);
  broadcast({ kind: 'live', event: 'viewers', liveId: live.id, viewerCount: live.viewers.length, viewers: live.viewers.slice() });
  return res.json({ ok: true, live: livePublic(live) });
});
app.post('/api/lives/:id/leave', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const live = lives.find(l => l.id === req.params.id);
  if (!live) return res.status(404).json({ ok: false, error: 'Live no encontrado.' });
  live.viewers = (live.viewers || []).filter(v => v !== phone);
  /* v3.8: si sale el coanfitrión, el live sigue solo con el dueño y
     se avisa a todos (liveCoHostLeft). */
  if (live.coHost === phone) {
    live.coHost = null;
    saveJson('lives.json', lives);
    broadcast({ kind: 'liveCoHostLeft', liveId: live.id });
  }
  saveJson('lives.json', lives);
  broadcast({ kind: 'live', event: 'viewers', liveId: live.id, viewerCount: live.viewers.length, viewers: live.viewers.slice() });
  return res.json({ ok: true });
});
/* ---- invitados en tu en vivo (v3.8, idea 23) ----
   Solo el dueño del live invita; el invitado acepta o rechaza y su
   cámara se une en vista dividida. Si su conexión se cae, el live
   sigue solo con el dueño (ver leave). */
app.post('/api/lives/:id/invite', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const live = lives.find(function (l) { return l.id === req.params.id; });
  if (!live || live.endedAt) return res.status(404).json({ ok: false, error: 'Live no encontrado o terminado.' });
  if (live.host !== phone) return res.status(403).json({ ok: false, error: 'Solo el dueño del live puede invitar.' });
  const invited = normPhone(req.body && req.body.phone);
  if (!profiles[invited]) return res.status(404).json({ ok: false, error: 'Esa cuenta no existe.' });
  if (invited === phone) return res.status(400).json({ ok: false, error: 'No puedes invitarte a ti mismo.' });
  if (live.invite && live.invite.phone === invited && live.invite.status === 'pending') return res.status(400).json({ ok: false, error: 'Ya tienes una invitación pendiente para esa persona.' });
  live.invite = { phone: invited, status: 'pending', at: Date.now() };
  try { await saveJsonStrict('lives.json', lives); }
  catch (e) { live.invite = null; return res.status(500).json({ ok: false, error: 'No se pudo enviar la invitación.' }); }
  broadcast({ kind: 'liveInvite', liveId: live.id, from: phone, to: invited });
  return res.json({ ok: true, invite: live.invite });
});
app.post('/api/lives/:id/invite/respond', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const live = lives.find(function (l) { return l.id === req.params.id; });
  if (!live || live.endedAt) return res.status(404).json({ ok: false, error: 'Live no encontrado o terminado.' });
  if (!live.invite || live.invite.phone !== phone || live.invite.status !== 'pending') return res.status(404).json({ ok: false, error: 'No tienes una invitación pendiente para este live.' });
  const accept = !!(req.body && req.body.accept);
  if (accept) {
    live.coHost = phone;
    live.invite.status = 'accepted';
    try { await saveJsonStrict('lives.json', lives); }
    catch (e) { live.coHost = null; live.invite.status = 'pending'; return res.status(500).json({ ok: false, error: 'No se pudo aceptar la invitación.' }); }
    broadcast({ kind: 'liveInviteAccepted', liveId: live.id, from: phone, coHost: phone });
    return res.json({ ok: true, coHost: phone });
  }
  live.invite = null;
  try { await saveJsonStrict('lives.json', lives); }
  catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo rechazar la invitación.' }); }
  broadcast({ kind: 'liveInviteDeclined', liveId: live.id, from: phone });
  return res.json({ ok: true, coHost: null });
});
app.post('/api/lives/:id/chat', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const live = lives.find(l => l.id === req.params.id);
  if (!live || live.endedAt) return res.status(404).json({ ok: false, error: 'Ese live ya terminó.' });
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Escribe el mensaje.' });
  if (live.host !== phone && !(live.viewers || []).includes(phone)) return res.status(403).json({ ok: false, error: 'Primero entra al live.' });
  const msg = { id: uid('lmsg'), author: phone, text: text.slice(0, 500), createdAt: Date.now() };
  live.chat.push(msg);
  if (live.chat.length > 200) live.chat = live.chat.slice(-200);
  saveJson('lives.json', lives);
  broadcast({ kind: 'live', event: 'chat', liveId: live.id, message: msg });
  return res.json({ ok: true, message: msg });
});
/* Like en vivo (v1.5): cada toque manda un corazón y suma al contador,
   que se difunde en vivo a todos. */
app.post('/api/lives/:id/like', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const live = lives.find(l => l.id === req.params.id);
  if (!live || live.endedAt) return res.status(404).json({ ok: false, error: 'Ese live ya terminó.' });
  live.likes = (live.likes || 0) + 1;
  saveJson('lives.json', lives);
  broadcast({ kind: 'live', event: 'like', liveId: live.id, likes: live.likes, from: phone });
  return res.json({ ok: true, likes: live.likes });
});
/* ============ JUEGOS ONLINE Y ESTADÍSTICAS (v1.8) ============
   La tienda de juegos muestra cuántas personas jugaron cada juego y el
   promedio de estrellas que dio la gente de WordRed (nada inventado:
   todo se cuenta aquí, por teléfono). Las partidas online son salas en
   memoria con emparejamiento rápido (quickmatch) o por invitación; el
   marcador y los movimientos viajan por WebSocket en tiempo real. Los
   datos de juegos se guardan en MongoDB (colecciones gameStats y
   gameRatings) con MONGODB_URI, o en games.json y game-ratings.json
   sin ella (en Render gratis el disco es efímero: se pierden si el
   servicio se reinicia). Las salas son solo en memoria: una partida
   no sobrevive a un reinicio del servidor. */
const gameRooms = new Map(); // roomId -> {id, gameId, mode, players:[{phone,name}], status, scores:{}, winner, createdAt}
const gameRoomByPhone = new Map(); // phone -> roomId
const TURN_GAMES = ['tres-raya']; // juegos por turnos (Gato); los demás son duelos por puntos
function gameStatsFor(id) {
  const plays = (gameStats.plays && gameStats.plays[id]) || 0;
  const playersObj = (gameStats.players && gameStats.players[id]) || {};
  const players = Object.keys(playersObj).length;
  const rs = gameRatings.filter(r => r.gameId === id);
  const ratingCount = rs.length;
  const ratingAvg = ratingCount ? rs.reduce((a, r) => a + r.stars, 0) / ratingCount : 0;
  return { plays, players, ratingAvg: Math.round(ratingAvg * 10) / 10, ratingCount };
}
function gameAllStats() {
  const ids = {};
  Object.keys(gameStats.plays || {}).forEach(id => { ids[id] = true; });
  Object.keys(gameStats.players || {}).forEach(id => { ids[id] = true; });
  gameRatings.forEach(r => { ids[r.gameId] = true; });
  const out = {};
  Object.keys(ids).forEach(id => { out[id] = gameStatsFor(id); });
  return out;
}
function gameRoomPublic(room) {
  return { id: room.id, gameId: room.gameId, mode: room.mode, status: room.status, players: room.players.map(p => ({ phone: p.phone, name: p.name })), scores: room.scores, winner: room.winner || null, createdAt: room.createdAt };
}
function gameRoomOther(room, phone) {
  return room.players.find(p => p.phone !== phone) || null;
}
function gameNotifyRoom(room, data, exceptPhone) {
  room.players.forEach(p => { if (p.phone !== exceptPhone) sendTo(p.phone, data); });
}
function gameFinishRoom(room, winnerPhone) {
  room.status = 'finished';
  room.winner = winnerPhone || null;
  room.players.forEach(p => gameRoomByPhone.delete(p.phone));
  gameNotifyRoom(room, { kind: 'game', type: 'result', roomId: room.id, winner: room.winner });
}
function gameLeaveRoom(room, phone) {
  const i = room.players.findIndex(p => p.phone === phone);
  if (i < 0) return;
  room.players.splice(i, 1);
  gameRoomByPhone.delete(phone);
  if (room.status === 'playing' && room.players.length === 1) {
    const winner = room.players[0].phone;
    gameNotifyRoom(room, { kind: 'game', type: 'opponent-left', roomId: room.id, winner });
    gameFinishRoom(room, winner);
  } else if (!room.players.length) {
    gameRooms.delete(room.id);
  } else {
    gameNotifyRoom(room, { kind: 'game', type: 'player-left', roomId: room.id, phone });
  }
}
function gameMatchPair(room) {
  const first = room.players[0];
  const second = room.players[1];
  sendTo(first.phone, { kind: 'game', type: 'matched', roomId: room.id, gameId: room.gameId, mode: room.mode, opponent: { phone: second.phone, name: second.name }, myMark: room.mode === 'turn' ? 'X' : undefined, duration: 60 });
  sendTo(second.phone, { kind: 'game', type: 'matched', roomId: room.id, gameId: room.gameId, mode: room.mode, opponent: { phone: first.phone, name: first.name }, myMark: room.mode === 'turn' ? 'O' : undefined, duration: 60 });
}
app.get('/api/games/stats', (req, res) => {
  return res.json({ ok: true, stats: gameAllStats() });
});
app.post('/api/games/:id/play', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const id = String(req.params.id || '').slice(0, 120);
  if (!id) return res.status(400).json({ ok: false, error: 'Juego inválido.' });
  if (!gameStats.plays) gameStats.plays = {};
  if (!gameStats.players) gameStats.players = {};
  gameStats.plays[id] = (gameStats.plays[id] || 0) + 1;
  if (!gameStats.players[id]) gameStats.players[id] = {};
  gameStats.players[id][phone] = true;
  saveJson('games.json', gameStats);
  return res.json({ ok: true, stats: gameStatsFor(id) });
});
app.post('/api/games/:id/rate', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const id = String(req.params.id || '').slice(0, 120);
  const stars = Number(req.body && req.body.stars);
  const comment = String((req.body && req.body.comment) || '').slice(0, 140);
  if (!id || !(stars >= 1 && stars <= 5)) return res.status(400).json({ ok: false, error: 'Calificación inválida (1 a 5 estrellas).' });
  const ex = gameRatings.find(r => r.gameId === id && r.phone === phone);
  if (ex) { ex.stars = stars; ex.comment = comment; ex.createdAt = Date.now(); }
  else gameRatings.push({ gameId: id, phone, stars, comment, createdAt: Date.now() });
  saveJson('game-ratings.json', gameRatings);
  return res.json({ ok: true, stats: gameStatsFor(id) });
});
app.get('/api/games/:id/ratings', (req, res) => {
  const id = String(req.params.id || '').slice(0, 120);
  const rs = gameRatings.filter(r => r.gameId === id).slice(-20).reverse().map(r => ({ phone: r.phone, name: (profiles[r.phone] && profiles[r.phone].name) || r.phone, stars: r.stars, comment: r.comment, createdAt: r.createdAt }));
  return res.json({ ok: true, stats: gameStatsFor(id), ratings: rs });
});
app.post('/api/games/quickmatch', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const gameId = String((req.body && req.body.gameId) || '').slice(0, 120);
  if (!gameId) return res.status(400).json({ ok: false, error: 'Juego inválido.' });
  let room = null;
  for (const r of gameRooms.values()) {
    if (r.gameId === gameId && r.status === 'waiting' && r.players.length === 1 && r.players[0].phone !== phone) { room = r; break; }
  }
  const name = (profiles[phone] && profiles[phone].name) || phone;
  if (!room) {
    const id = 'room_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    room = { id, gameId, mode: TURN_GAMES.includes(gameId) ? 'turn' : 'duel', players: [{ phone, name }], status: 'waiting', scores: {}, winner: null, createdAt: Date.now() };
    gameRooms.set(id, room);
    gameRoomByPhone.set(phone, id);
    return res.json({ ok: true, status: 'waiting', roomId: id, mode: room.mode });
  }
  room.players.push({ phone, name });
  room.status = 'playing';
  gameRoomByPhone.set(phone, room.id);
  gameMatchPair(room);
  return res.json({ ok: true, status: 'matched', roomId: room.id, mode: room.mode, opponent: { phone: room.players[0].phone, name: room.players[0].name }, myMark: room.mode === 'turn' ? 'O' : undefined, duration: 60 });
});
app.post('/api/games/rooms', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const gameId = String((req.body && req.body.gameId) || '').slice(0, 120);
  if (!gameId) return res.status(400).json({ ok: false, error: 'Juego inválido.' });
  const id = 'room_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const name = (profiles[phone] && profiles[phone].name) || phone;
  const room = { id, gameId, mode: TURN_GAMES.includes(gameId) ? 'turn' : 'duel', players: [{ phone, name }], status: 'waiting', scores: {}, winner: null, createdAt: Date.now() };
  gameRooms.set(id, room);
  gameRoomByPhone.set(phone, id);
  return res.json({ ok: true, room: gameRoomPublic(room) });
});
app.post('/api/games/rooms/:id/join', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const room = gameRooms.get(req.params.id);
  if (!room) return res.status(404).json({ ok: false, error: 'Esa partida no existe.' });
  if (room.status !== 'waiting' || room.players.length >= 2) return res.status(409).json({ ok: false, error: 'Esa partida ya está llena.' });
  if (room.players.some(p => p.phone === phone)) return res.json({ ok: true, room: gameRoomPublic(room) });
  const name = (profiles[phone] && profiles[phone].name) || phone;
  room.players.push({ phone, name });
  room.status = 'playing';
  gameRoomByPhone.set(phone, room.id);
  gameMatchPair(room);
  return res.json({ ok: true, status: 'matched', roomId: room.id, mode: room.mode, opponent: { phone: room.players[0].phone, name: room.players[0].name }, myMark: room.mode === 'turn' ? 'O' : undefined, duration: 60 });
});
app.get('/api/games/rooms/:id', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const room = gameRooms.get(req.params.id);
  if (!room) return res.status(404).json({ ok: false, error: 'Esa partida no existe.' });
  if (!room.players.some(p => p.phone === phone)) return res.status(403).json({ ok: false, error: 'No estás en esa partida.' });
  return res.json({ ok: true, room: gameRoomPublic(room) });
});
app.post('/api/games/rooms/:id/score', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const room = gameRooms.get(req.params.id);
  if (!room) return res.status(404).json({ ok: false, error: 'Esa partida no existe.' });
  if (!room.players.some(p => p.phone === phone)) return res.status(403).json({ ok: false, error: 'No estás en esa partida.' });
  const score = Number(req.body && req.body.score) || 0;
  room.scores[phone] = score;
  gameNotifyRoom(room, { kind: 'game', type: 'score', roomId: room.id, score, from: phone }, phone);
  return res.json({ ok: true, scores: room.scores });
});
app.post('/api/games/rooms/:id/finish', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const room = gameRooms.get(req.params.id);
  if (!room) return res.status(404).json({ ok: false, error: 'Esa partida no existe.' });
  if (!room.players.some(p => p.phone === phone)) return res.status(403).json({ ok: false, error: 'No estás en esa partida.' });
  if (room.status === 'finished') return res.json({ ok: true, room: gameRoomPublic(room) });
  const score = Number(req.body && req.body.score) || 0;
  room.scores[phone] = score;
  const winnerField = String((req.body && req.body.winner) || '');
  let winner = null;
  if (winnerField === 'me') winner = phone;
  else if (winnerField === 'opponent') { const o = gameRoomOther(room, phone); winner = o ? o.phone : null; }
  else if (winnerField === 'draw') winner = null;
  else {
    const ps = room.players.map(p => ({ phone: p.phone, score: room.scores[p.phone] || 0 }));
    if (ps.length === 2) winner = ps[0].score === ps[1].score ? null : (ps[0].score > ps[1].score ? ps[0].phone : ps[1].phone);
  }
  gameFinishRoom(room, winner);
  return res.json({ ok: true, room: gameRoomPublic(room) });
});
app.post('/api/games/rooms/:id/leave', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const room = gameRooms.get(req.params.id);
  if (!room) return res.json({ ok: true });
  gameLeaveRoom(room, phone);
  return res.json({ ok: true });
});

/* Señalización WebRTC de los lives (oferta/respuesta/ICE por WebSocket). */
app.post('/api/live-signal', (req, res) => {
  const from = authPhone(req);
  if (!from) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const to = normPhone(req.body && req.body.to);
  const type = String((req.body && req.body.type) || '');
  const payload = (req.body && req.body.payload) || null;
  const liveId = String((req.body && req.body.liveId) || '');
  if (!profiles[to]) return res.status(404).json({ ok: false, error: 'Esa persona no existe.' });
  if (!['offer', 'answer', 'ice'].includes(type)) return res.status(400).json({ ok: false, error: 'Señal inválida.' });
  const set = sockets.get(to);
  if (!set || !set.size) return res.status(404).json({ ok: false, error: 'La otra persona no está en línea.' });
  sendTo(to, { kind: 'live-signal', from, type, payload, liveId });
  return res.json({ ok: true });
});

/* ---- mensajes ---- */
/* v3.8: paquete de stickers originales incluido en el APK (12). Solo
   estos ids se aceptan; un mensaje puede llevar solo el sticker. */
const STICKER_IDS = ['corazon', 'risa', 'fuego', 'estrella', 'abrazo', 'ok', 'triste', 'enojado', 'sorpresa', 'fiesta', 'gato', 'perro'];
function validateStickerId(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return STICKER_IDS.includes(s) ? s : null;
}
app.post('/api/messages', async (req, res) => {
  const from = authPhone(req);
  if (!from) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const to = normPhone(req.body && req.body.to);
  const body = (req.body && req.body.message) || req.body;
  const text = String((body && body.text) || '').trim();
  if (!profiles[to]) return res.status(404).json({ ok: false, error: 'Esa persona no existe.' });
  if (isBlockedSrv(from, to)) return res.status(403).json({ ok: false, error: 'No puedes escribirle a esa persona.' });
  const stickerId = validateStickerId(body && body.stickerId);
  if (stickerId === null) return res.status(400).json({ ok: false, error: 'Sticker inválido.' });
  /* v3.8: ubicación en vivo (máx. 1 hora) e invitación de juego. */
  let liveLocation = null;
  if (body && body.liveLocation !== undefined && body.liveLocation !== null) {
    const ll = body.liveLocation;
    const lat = Number(ll && ll.lat), lng = Number(ll && ll.lng);
    if (!isFinite(lat) || lat < -90 || lat > 90 || !isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ ok: false, error: 'Ubicación inválida.' });
    let expiresAt = Number(ll && ll.expiresAt);
    if (!isFinite(expiresAt) || expiresAt <= Date.now()) expiresAt = Date.now() + 60 * 60 * 1000;
    if (expiresAt > Date.now() + 60 * 60 * 1000) expiresAt = Date.now() + 60 * 60 * 1000;
    liveLocation = { lat, lng, expiresAt, updatedAt: Date.now() };
  }
  let gameInvite = null;
  if (body && body.gameInvite !== undefined && body.gameInvite !== null) {
    const gi = body.gameInvite;
    if (!gi || !TOURNAMENT_GAMES.some(function (g) { return g.id === gi.gameId; })) return res.status(400).json({ ok: false, error: 'Juego inválido.' });
    gameInvite = { gameId: gi.gameId, roomId: String(gi.roomId || '').slice(0, 100) };
  }
  if (!text && !(body && body.media) && !(body && body.file) && !(body && body.voice) && !stickerId && !liveLocation && !gameInvite) return res.status(400).json({ ok: false, error: 'Mensaje vacío.' });
  const msg = {
    id: (body && body.id) || uid('msg'), from, to, text: text.slice(0, 2000),
    media: (body && body.media) || '', mediaType: (body && body.mediaType) || '',
    file: (body && body.file) || null, voice: (body && body.voice) || null,
    stickerId: stickerId, liveLocation: liveLocation, gameInvite: gameInvite, reactions: [],
    /* v1.5: pregunta por un anuncio de Marketplace (id y título). */
    listing: (body && body.listing) || null,
    createdAt: (body && body.createdAt) || Date.now(), readBy: [from], readAt: null
  };
  if (messages.some(m => m.id === msg.id)) return res.json({ ok: true, message: msg });
  messages.push(msg);
  notify('message', from, to, msg.listing && msg.listing.title ? ('te preguntó por tu anuncio: ' + msg.listing.title) : (msg.voice ? 'te envió un mensaje de voz' : (text ? 'te envió un mensaje' : (msg.file ? 'te envió un archivo' : 'te envió una foto'))), msg.id);
  saveAll();
  sendTo(to, { kind: 'message', message: msg });
  await flushPendingWrites();
  return res.json({ ok: true, message: msg });
});
/* v3.8: el mensaje servido lleva sus reacciones con nombre
   [{phone, name, emoji}] (en el registro solo van phone + emoji). */
function messagePublic(m) {
  const out = Object.assign({}, m);
  out.reactions = (m.reactions || []).map(function (r) {
    const pub = profilePublic(r.phone);
    return { phone: r.phone, name: pub.name, emoji: r.emoji };
  });
  return out;
}
app.get('/api/messages', (req, res) => {
  const phone = normPhone(req.query.phone);
  /* v3.8: al leer, se podan de verdad los mensajes temporales vencidos
     de todas mis conversaciones. */
  let prunedAny = false;
  Object.keys(conversationSettings).forEach(function (key) {
    const parts = key.split('|');
    if (!parts.includes(phone)) return;
    if (pruneDisappearingMessages(parts[0], parts[1])) prunedAny = true;
  });
  if (prunedAny) saveJson('messages.json', messages);
  const mine = messages.filter(m => m.from === phone || m.to === phone).sort((a, b) => a.createdAt - b.createdAt);
  const byKey = {};
  mine.forEach(m => {
    const key = [m.from, m.to].sort().join('|');
    if (!byKey[key]) byKey[key] = { id: 'conv_' + key, participants: [m.from, m.to], messages: [], unread: {}, disappearingHours: (conversationSettings[key] && conversationSettings[key].disappearingHours) || 0 };
    byKey[key].messages.push(messagePublic(m));
    if (m.to === phone && !m.readBy.includes(phone)) byKey[key].unread[phone] = (byKey[key].unread[phone] || 0) + 1;
  });
  return res.json({ ok: true, conversations: Object.values(byKey) });
});
app.post('/api/messages/read', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const other = normPhone((req.body && req.body.other) || (req.body && req.body.to));
  /* v3.8: al abrir la conversación se podan los mensajes temporales
     vencidos antes de marcar como leído. */
  if (pruneDisappearingMessages(phone, other)) saveJson('messages.json', messages);
  /* v1.5: al abrir la conversación se marca como leída con la hora, y
     se avisa en vivo al que escribió para que vea "Visto" con la hora. */
  const at = Date.now();
  const readIds = [];
  messages.forEach(m => {
    if (m.to === phone && m.from === other && !m.readBy.includes(phone)) {
      m.readBy.push(phone);
      m.readAt = at;
      readIds.push(m.id);
    }
  });
  saveJson('messages.json', messages);
  if (readIds.length) sendTo(other, { kind: 'read', from: phone, to: other, at, messageIds: readIds });
  return res.json({ ok: true, readAt: at, read: readIds.length });
});

/* ---- reacciones y ubicación en vivo en mensajes (v3.8, ideas 55-56) ----
   Vale para chats 1 a 1 y de grupo. Una reacción por persona por
   mensaje, se puede cambiar; solo los 6 emojis del selector. La
   ubicación solo la actualiza quien la comparte, hasta que caduca. */
function findMessageAnywhere(id) {
  const m = messages.find(function (x) { return x.id === id; });
  if (m) return { msg: m, group: null };
  for (const g of groupChats) {
    const gm = (g.messages || []).find(function (x) { return x.id === id; });
    if (gm) return { msg: gm, group: g };
  }
  return null;
}
const MESSAGE_REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍'];
app.post('/api/messages/:id/react', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const found = findMessageAnywhere(req.params.id);
  if (!found) return res.status(404).json({ ok: false, error: 'Mensaje no encontrado.' });
  const msg = found.msg, group = found.group;
  const isParticipant = group ? group.participants.includes(phone) : (msg.from === phone || msg.to === phone);
  if (!isParticipant) return res.status(403).json({ ok: false, error: 'No eres parte de ese chat.' });
  const emoji = String((req.body && req.body.emoji) || '').trim();
  if (!MESSAGE_REACTION_EMOJIS.includes(emoji)) return res.status(400).json({ ok: false, error: 'Emoji inválido.' });
  if (!msg.reactions) msg.reactions = [];
  const old = msg.reactions.find(function (r) { return r.phone === phone; });
  if (old) { old.emoji = emoji; old.at = Date.now(); }
  else msg.reactions.push({ phone, emoji, at: Date.now() });
  try {
    if (group) await saveJsonStrict('group-chats.json', groupChats);
    else await saveJsonStrict('messages.json', messages);
  } catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo guardar la reacción.' }); }
  const pub = messagePublic(msg);
  if (group) broadcast({ kind: 'messageReaction', messageId: msg.id, groupId: group.id, reactions: pub.reactions });
  else sendTo(msg.from === phone ? msg.to : msg.from, { kind: 'messageReaction', messageId: msg.id, reactions: pub.reactions });
  return res.json({ ok: true, reactions: pub.reactions });
});
app.post('/api/messages/:id/location', async (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const found = findMessageAnywhere(req.params.id);
  if (!found) return res.status(404).json({ ok: false, error: 'Mensaje no encontrado.' });
  const msg = found.msg, group = found.group;
  if (msg.from !== phone) return res.status(403).json({ ok: false, error: 'Solo quien comparte su ubicación puede actualizarla.' });
  if (!msg.liveLocation) return res.status(400).json({ ok: false, error: 'Este mensaje no comparte ubicación.' });
  if (msg.liveLocation.expiresAt <= Date.now()) return res.status(400).json({ ok: false, error: 'La ubicación en vivo ya caducó.' });
  const lat = Number(req.body && req.body.lat), lng = Number(req.body && req.body.lng);
  if (!isFinite(lat) || lat < -90 || lat > 90 || !isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ ok: false, error: 'Ubicación inválida.' });
  msg.liveLocation.lat = lat; msg.liveLocation.lng = lng; msg.liveLocation.updatedAt = Date.now();
  try {
    if (group) await saveJsonStrict('group-chats.json', groupChats);
    else await saveJsonStrict('messages.json', messages);
  } catch (e) { return res.status(500).json({ ok: false, error: 'No se pudo actualizar la ubicación.' }); }
  const pub = messagePublic(msg);
  if (group) broadcast({ kind: 'messageLocation', messageId: msg.id, groupId: group.id, liveLocation: msg.liveLocation });
  else sendTo(msg.to, { kind: 'messageLocation', messageId: msg.id, liveLocation: msg.liveLocation });
  return res.json({ ok: true, message: pub });
});

/* ---- mensajes grupales (v1.5.14, servidor 3.3) ----
   Distintos de los grupos-comunidad y de los mensajes 1 a 1: un chat
   con varias personas, con id propio que no cambia al agregar o
   quitar integrantes. Las escrituras son estrictas (saveJsonStrict):
   si MongoDB falla, se responde 500 y no se miente el éxito. */
function groupChatVisible(g, phone) { return g && Array.isArray(g.participants) && g.participants.includes(phone); }
app.post('/api/group-chats', async (req, res) => {
  const me = authPhone(req);
  if (!me) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const name = String((req.body && req.body.name) || '').trim().slice(0, 60);
  const others = [];
  ((req.body && req.body.participants) || []).forEach(p => {
    p = normPhone(p);
    if (p && p !== me && !others.includes(p)) others.push(p);
  });
  if (others.length < 2) return res.status(400).json({ ok: false, error: 'Elige al menos 2 personas para crear el grupo.' });
  for (const p of others) {
    if (!profiles[p]) return res.status(404).json({ ok: false, error: 'Esa persona no existe.' });
    if (isBlockedSrv(me, p)) return res.status(403).json({ ok: false, error: 'No puedes agregar a esa persona al grupo.' });
  }
  const g = {
    id: (req.body && req.body.id) || uid('gchat'),
    name: name || ('Grupo de ' + others.slice(0, 2).map(p => (profiles[p] && profiles[p].name) || p).join(', ')),
    participants: [me].concat(others),
    messages: [], unread: {},
    createdAt: (req.body && req.body.createdAt) || Date.now(),
    createdBy: me, updatedAt: Date.now()
  };
  if (groupChats.some(x => x.id === g.id)) return res.json({ ok: true, group: groupChats.find(x => x.id === g.id) });
  groupChats.push(g);
  try { await saveJsonStrict('group-chats.json', groupChats); }
  catch (e) { groupChats = groupChats.filter(x => x.id !== g.id); return res.status(500).json({ ok: false, error: 'No se pudo guardar el grupo en el servidor. Inténtalo de nuevo.' }); }
  others.forEach(p => { notify('message', me, p, 'te agregó al grupo ' + g.name, g.id); sendTo(p, { kind: 'groupChatUpdated', group: g }); });
  return res.json({ ok: true, group: g });
});
app.get('/api/group-chats', (req, res) => {
  const phone = normPhone(req.query.phone);
  /* v3.8: cada mensaje lleva sus reacciones con nombre. */
  const list = groupChats.filter(g => groupChatVisible(g, phone)).map(function (g) {
    const out = Object.assign({}, g);
    out.messages = (g.messages || []).map(messagePublic);
    return out;
  });
  return res.json({ ok: true, groupChats: list });
});
app.post('/api/group-chats/:id/messages', async (req, res) => {
  const me = authPhone(req);
  if (!me) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groupChats.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Ese grupo no existe.' });
  if (!g.participants.includes(me)) return res.status(403).json({ ok: false, error: 'Ya no eres parte de ese grupo.' });
  const body = (req.body && req.body.message) || req.body;
  const text = String((body && body.text) || '').trim();
  const stickerId = validateStickerId(body && body.stickerId);
  if (stickerId === null) return res.status(400).json({ ok: false, error: 'Sticker inválido.' });
  /* v3.8: ubicación en vivo (máx. 1 hora) e invitación de juego. */
  let liveLocation = null;
  if (body && body.liveLocation !== undefined && body.liveLocation !== null) {
    const ll = body.liveLocation;
    const lat = Number(ll && ll.lat), lng = Number(ll && ll.lng);
    if (!isFinite(lat) || lat < -90 || lat > 90 || !isFinite(lng) || lng < -180 || lng > 180) return res.status(400).json({ ok: false, error: 'Ubicación inválida.' });
    let expiresAt = Number(ll && ll.expiresAt);
    if (!isFinite(expiresAt) || expiresAt <= Date.now()) expiresAt = Date.now() + 60 * 60 * 1000;
    if (expiresAt > Date.now() + 60 * 60 * 1000) expiresAt = Date.now() + 60 * 60 * 1000;
    liveLocation = { lat, lng, expiresAt, updatedAt: Date.now() };
  }
  let gameInvite = null;
  if (body && body.gameInvite !== undefined && body.gameInvite !== null) {
    const gi = body.gameInvite;
    if (!gi || !TOURNAMENT_GAMES.some(function (g) { return g.id === gi.gameId; })) return res.status(400).json({ ok: false, error: 'Juego inválido.' });
    gameInvite = { gameId: gi.gameId, roomId: String(gi.roomId || '').slice(0, 100) };
  }
  if (!text && !(body && body.media) && !stickerId && !liveLocation && !gameInvite) return res.status(400).json({ ok: false, error: 'Mensaje vacío.' });
  const msg = {
    id: (body && body.id) || uid('msg'), from: me, text: text.slice(0, 2000),
    media: (body && body.media) || '', mediaType: (body && body.mediaType) || '',
    file: (body && body.file) || null, voice: (body && body.voice) || null,
    stickerId: stickerId, liveLocation: liveLocation, gameInvite: gameInvite, reactions: [],
    createdAt: (body && body.createdAt) || Date.now(), readBy: [me], readAt: null
  };
  if (g.messages.some(m => m.id === msg.id)) return res.json({ ok: true, message: msg });
  g.messages.push(msg);
  g.updatedAt = Date.now();
  g.participants.forEach(p => { if (p !== me) g.unread[p] = (g.unread[p] || 0) + 1; });
  try { await saveJsonStrict('group-chats.json', groupChats); }
  catch (e) {
    g.messages = g.messages.filter(m => m.id !== msg.id);
    return res.status(500).json({ ok: false, error: 'No se pudo guardar el mensaje en el servidor. Inténtalo de nuevo.' });
  }
  g.participants.forEach(p => {
    if (p === me) return;
    notify('message', me, p, 'te escribió en el grupo ' + g.name, g.id);
    sendTo(p, { kind: 'groupMessage', groupId: g.id, message: msg });
  });
  return res.json({ ok: true, message: msg });
});
/* v3.4: borrar UN mensaje de un chat grupal. Antes no existía este
   endpoint: la app solo podía borrar el mensaje en su propio teléfono y
   para los demás seguía ahí (y volvía al sincronizar). Solo quien
   escribió el mensaje puede borrarlo; escritura estricta (saveJsonStrict)
   como el resto de borrados, y aviso 'groupMessageDeleted' por WebSocket
   para que los demás teléfonos lo quiten en vivo. Un 404 (grupo o
   mensaje ya no existen) es un borrado ya hecho, no un error. */
app.delete('/api/group-chats/:id/messages/:messageId', async (req, res) => {
  const me = authPhone(req);
  if (!me) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groupChats.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Ese grupo no existe.' });
  const i = g.messages.findIndex(m => m.id === req.params.messageId);
  if (i < 0) return res.status(404).json({ ok: false, error: 'Mensaje no encontrado.' });
  if (g.messages[i].from !== me) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
  const removed = g.messages.splice(i, 1)[0];
  g.updatedAt = Date.now();
  try { await saveJsonStrict('group-chats.json', groupChats); }
  catch (e) {
    g.messages.splice(i, 0, removed);
    return res.status(500).json({ ok: false, error: 'No se pudo borrar el mensaje en el servidor. Inténtalo de nuevo.' });
  }
  g.participants.forEach(p => { if (p !== me) sendTo(p, { kind: 'groupMessageDeleted', groupId: g.id, messageId: removed.id }); });
  return res.json({ ok: true });
});
app.post('/api/group-chats/:id/members', async (req, res) => {
  const me = authPhone(req);
  if (!me) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groupChats.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Ese grupo no existe.' });
  if (!g.participants.includes(me)) return res.status(403).json({ ok: false, error: 'Ya no eres parte de ese grupo.' });
  const wanted = [];
  ((req.body && req.body.participants) || []).forEach(p => {
    p = normPhone(p);
    if (p && !wanted.includes(p)) wanted.push(p);
  });
  if (!wanted.includes(me)) return res.status(400).json({ ok: false, error: 'No puedes sacarte del grupo así: usa "Salir del grupo".' });
  for (const p of wanted) {
    if (!profiles[p]) return res.status(404).json({ ok: false, error: 'Esa persona no existe.' });
  }
  const before = g.participants.slice();
  const added = wanted.filter(p => !before.includes(p));
  const removed = before.filter(p => !wanted.includes(p));
  g.participants = wanted;
  g.updatedAt = Date.now();
  try { await saveJsonStrict('group-chats.json', groupChats); }
  catch (e) { g.participants = before; return res.status(500).json({ ok: false, error: 'No se pudo guardar el grupo en el servidor. Inténtalo de nuevo.' }); }
  added.forEach(p => { notify('message', me, p, 'te agregó al grupo ' + g.name, g.id); });
  g.participants.concat(removed).forEach(p => sendTo(p, { kind: 'groupChatUpdated', group: g }));
  return res.json({ ok: true, group: g });
});
app.post('/api/group-chats/:id/leave', async (req, res) => {
  const me = authPhone(req);
  if (!me) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const gi = groupChats.findIndex(x => x.id === req.params.id);
  if (gi < 0) return res.status(404).json({ ok: false, error: 'Ese grupo no existe.' });
  const g = groupChats[gi];
  if (!g.participants.includes(me)) return res.status(403).json({ ok: false, error: 'Ya no eres parte de ese grupo.' });
  const before = g.participants.slice();
  g.participants = g.participants.filter(p => p !== me);
  if (!g.participants.length) {
    groupChats.splice(gi, 1);
    try { await saveJsonStrict('group-chats.json', groupChats); }
    catch (e) { groupChats.splice(gi, 0, g); return res.status(500).json({ ok: false, error: 'No se pudo guardar el cambio en el servidor. Inténtalo de nuevo.' }); }
    return res.json({ ok: true, group: null, deleted: true });
  }
  g.updatedAt = Date.now();
  try { await saveJsonStrict('group-chats.json', groupChats); }
  catch (e) { g.participants = before; return res.status(500).json({ ok: false, error: 'No se pudo guardar el cambio en el servidor. Inténtalo de nuevo.' }); }
  before.forEach(p => sendTo(p, { kind: 'groupChatUpdated', group: g }));
  return res.json({ ok: true, group: g, deleted: false });
});
app.post('/api/group-chats/:id/read', async (req, res) => {
  const me = authPhone(req);
  if (!me) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groupChats.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Ese grupo no existe.' });
  if (!g.participants.includes(me)) return res.status(403).json({ ok: false, error: 'Ya no eres parte de ese grupo.' });
  const at = Date.now();
  const readIds = [];
  g.messages.forEach(m => {
    if (m.from !== me && !m.readBy.includes(me)) { m.readBy.push(me); m.readAt = at; readIds.push(m.id); }
  });
  if (g.unread) g.unread[me] = 0;
  try { await saveJsonStrict('group-chats.json', groupChats); } catch (e) { /* leer no bloquea: se reintenta al abrir de nuevo */ }
  return res.json({ ok: true, read: readIds.length });
});

/* ---- notificaciones y búsqueda ---- */
app.get('/api/notifications', (req, res) => {
  const phone = normPhone(req.query.phone);
  return res.json({ ok: true, notifications: notifications.filter(n => n.to === phone).slice(0, 100) });
});
app.post('/api/notifications/read', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  notifications.forEach(n => { if (n.to === phone) n.read = true; });
  saveJson('notifications.json', notifications);
  return res.json({ ok: true });
});
app.get('/api/search', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const phone = normPhone(req.query.phone);
  const out = { people: [], posts: [], groups: [], pages: [], listings: [] };
  if (!q) return res.json({ ok: true, ...out });
  Object.values(profiles).forEach(p => {
    if ((p.name || '').toLowerCase().includes(q)) out.people.push(p);
  });
  posts.forEach(p => {
    if (canSee(phone, p) && ((p.text || '').toLowerCase().includes(q) || (p.link && (p.link.title || '').toLowerCase().includes(q)))) out.posts.push(enrichPostForViewer(p, phone));
  });
  groups.forEach(g => {
    /* v3.8: los grupos secretos no aparecen en la búsqueda para quien
       no es miembro. */
    if (g.secret && !(g.members || []).includes(phone)) return;
    if ((g.name || '').toLowerCase().includes(q) || (g.desc || '').toLowerCase().includes(q)) out.groups.push(g);
  });
  pages.forEach(pg => { if ((pg.name || '').toLowerCase().includes(q)) out.pages.push(pg); });
  listings.forEach(l => { if (l.status === 'Activo' && ((l.title || '').toLowerCase().includes(q) || (l.desc || '').toLowerCase().includes(q))) out.listings.push(l); });
  return res.json({ ok: true, ...out });
});

/* ---- WebSocket en tiempo real ---- */
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const sockets = new Map(); // phone -> Set<ws>
/* v1.6: latido (ping/pong) para detectar conexiones muertas. Sin él, un
   teléfono que perdía la red sin cerrar el socket quedaba como "en
   línea" y la oferta de llamada se enviaba al vacío: el que llamaba se
   quedaba en "Llamando" para siempre. */
const HEARTBEAT_MS = parseInt(process.env.WORDRED_HEARTBEAT_MS || '30000', 10) || 30000;
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) { try { ws.terminate(); } catch (e) {} return; }
    ws.isAlive = false;
    try { ws.ping(); } catch (e) {}
  });
}, HEARTBEAT_MS);
if (typeof heartbeat.unref === 'function') heartbeat.unref();
wss.on('connection', (ws, req) => {
  let phone = '';
  try { phone = normPhone(new URL(req.url, 'http://x').searchParams.get('phone')); } catch (e) {}
  if (!phone) { ws.close(); return; }
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  if (!sockets.has(phone)) sockets.set(phone, new Set());
  sockets.get(phone).add(ws);
  /* v1.5: el cliente avisa cuando está escribiendo; el servidor solo
     retransmite el aviso al destinatario, sin guardarlo. El aviso se
     apaga solo en el cliente a los pocos segundos sin escribir. */
  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(String(raw || ''));
      if (data && data.kind === 'typing' && data.to && profiles[normPhone(data.to)]) {
        sendTo(normPhone(data.to), { kind: 'typing', from: phone, typing: !!data.typing });
      }
      if (data && data.kind === 'game' && data.roomId) {
        const room = gameRooms.get(data.roomId);
        if (room && room.players.some(p => p.phone === phone)) {
          if (data.type === 'score' && typeof data.score === 'number') {
            room.scores[phone] = data.score;
            gameNotifyRoom(room, { kind: 'game', type: 'score', roomId: room.id, score: data.score, from: phone }, phone);
          } else if (data.type === 'move' && typeof data.index === 'number') {
            gameNotifyRoom(room, { kind: 'game', type: 'move', roomId: room.id, index: data.index, from: phone }, phone);
          }
        }
      }
    } catch (e) {}
  });
  ws.on('close', () => {
    const set = sockets.get(phone);
    if (set) { set.delete(ws); if (!set.size) sockets.delete(phone); }
    /* v1.8: si el teléfono se desconecta en plena partida online, el
       rival gana por abandono (solo si no queda ningún socket de ese
       teléfono). */
    if (!sockets.get(phone)) {
      const roomId = gameRoomByPhone.get(phone);
      if (roomId) {
        const room = gameRooms.get(roomId);
        if (room) gameLeaveRoom(room, phone);
      }
    }
  });
});
function sendTo(phone, data) {
  const set = sockets.get(normPhone(phone));
  if (!set) return;
  const text = JSON.stringify(data);
  set.forEach(ws => { try { if (ws.readyState === WebSocket.OPEN) ws.send(text); } catch (e) {} });
}
function broadcast(data) {
  const text = JSON.stringify(data);
  wss.clients.forEach(ws => { try { if (ws.readyState === WebSocket.OPEN) ws.send(text); } catch (e) {} });
}

/* v3.1: al parar (Render manda SIGTERM al redesplegar), esperar a que
   las escrituras pendientes a MongoDB terminen antes de salir, así un
   despliegue no pierde el último cambio. */
async function gracefulShutdown() {
  try { await flushPendingWrites(5000); } catch (e) {}
  try { if (mongoClient) await mongoClient.close(); } catch (e) {}
  process.exit(0);
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

if (require.main === module) {
  storeReady.then(() => {
    server.listen(PORT, () => console.log('WordRed server en el puerto ' + PORT + (mongoReady ? ' (MongoDB: datos para siempre)' : ' (JSON en disco)') + (SMS_ENABLED ? ' (SMS por Twilio)' : ' (sin Twilio: códigos por [DEV])')));
  });
}
module.exports = { app, server, _internals: { get profiles() { return profiles; }, get posts() { return posts; }, get auth() { return auth; }, get listings() { return listings; }, get events() { return events; }, get pages() { return pages; }, get salesGroups() { return salesGroups; }, get ratings() { return ratings; }, get stories() { return stories; }, get blocked() { return blocked; }, get reports() { return reports; }, get messages() { return messages; }, get media() { return media; }, get gameStats() { return gameStats; }, get gameRatings() { return gameRatings; }, get gameRooms() { return gameRooms; }, get promoRequests() { return promoRequests; }, get creatorConfig() { return creatorConfig; }, cloudinaryConfig, saveAll, storeReady, flushPendingWrites, get storage() { return mongoReady ? 'mongodb' : 'json'; }, get mongoReady() { return mongoReady; } } };
