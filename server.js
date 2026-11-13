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
 *
 * Almacenamiento: JSON en disco (carpeta data/). Sin dependencias
 * nativas, para que funcione en cualquier host gratuito.
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
  try { fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(data, null, 2)); }
  catch (e) { console.error('[store] no se pudo guardar ' + name + ':', e.message); }
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
let notifications = loadJson('notifications.json', []); // [{id, type, from, to, text, refId, createdAt, read}]
let blocked = loadJson('blocked.json', {});              // bloqueos (v1.2, ola 7): bloqueador -> [bloqueados]
let reports = loadJson('reports.json', []);              // reportes de cuentas (v1.2, ola 7)
let auth = loadJson('auth.json', {});               // phone -> {codeHash, codeAt, codeAttempts, token, tokenAt, verified}
let media = loadJson('media.json', {});             // id -> {id, owner, name, type, ext, size, createdAt} (v1.4)
const codeHits = {};                                // phone -> [timestamps]
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
}

function normPhone(p) { return String(p || '').replace(/\D/g, ''); }
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
function notify(type, from, to, text, refId) {
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

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'WordRed', version: '1.4', sms: SMS_ENABLED }));

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

app.post('/api/auth/verify', (req, res) => {
  const phone = normPhone(req.body && req.body.phone);
  const code = String((req.body && req.body.code) || '').trim();
  const a = auth[phone];
  if (!a || !a.codeHash) return res.status(400).json({ ok: false, error: 'No hay un código activo. Pide uno nuevo.' });
  if (Date.now() - a.codeAt > CODE_TTL_MS) return res.status(400).json({ ok: false, error: 'El código caducó. Pide uno nuevo.' });
  a.codeAttempts = (a.codeAttempts || 0) + 1;
  if (a.codeAttempts > CODE_MAX_ATTEMPTS) return res.status(400).json({ ok: false, error: 'Demasiados intentos. Pide un código nuevo.' });
  if (sha(code) !== a.codeHash) { saveJson('auth.json', auth); return res.status(400).json({ ok: false, error: 'El código no coincide.' }); }
  a.verified = true;
  a.codeHash = '';
  a.token = genToken();
  a.tokenAt = Date.now();
  saveJson('auth.json', auth);
  return res.json({ ok: true, phone, token: a.token, hasProfile: !!profiles[phone] });
});

/* ---- perfiles ---- */
app.post('/api/profile', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const name = String((req.body && req.body.name) || '').trim();
  if (name.length < 2) return res.status(400).json({ ok: false, error: 'Escribe tu nombre.' });
  const p = profiles[phone] || { phone, createdAt: Date.now(), isDemo: false };
  p.name = name;
  p.bio = String((req.body && req.body.bio) || '').slice(0, 200);
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
  return res.json({ ok: true, posts: visible, profiles: Object.values(profiles) });
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
app.post('/api/posts', (req, res) => {
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
    groupId: body.groupId || null, sharedFrom: body.sharedFrom || null,
    createdAt: body.createdAt || Date.now(), likes: {}, comments: [], shares: [], savedBy: [], isDemo: false,
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
  return res.json({ ok: true, post });
});
/* ---- modificar publicaciones (v1.2, ola 10): máx. 5 ediciones ---- */
app.put('/api/posts/:id', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  if (post.author !== phone) return res.status(403).json({ ok: false, error: 'Solo quien publicó puede modificarla.' });
  if ((post.editCount || 0) >= 5) return res.status(400).json({ ok: false, error: 'Esta publicación ya se editó 5 veces (el máximo). Ya no se puede modificar.' });
  const body = (req.body && req.body.post) || req.body;
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
  if (!post.text && !post.media && !post.link && !post.sharedFrom && !post.poll) return res.status(400).json({ ok: false, error: 'La publicación no puede quedar vacía.' });
  post.editCount = (post.editCount || 0) + 1;
  post.editedAt = Date.now();
  post.edited = true;
  saveJson('posts.json', posts);
  return res.json({ ok: true, post, editsLeft: 5 - post.editCount });
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
app.post('/api/posts/:id/comment', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Comentario vacío.' });
  const comment = { id: uid('cmt'), author: phone, text: text.slice(0, 1000), createdAt: Date.now(), replies: [] };
  const parentId = req.body && req.body.parentId;
  if (parentId) {
    const parent = post.comments.find(c => c.id === parentId);
    if (!parent) return res.status(404).json({ ok: false, error: 'Comentario no encontrado.' });
    parent.replies.push(comment);
  } else post.comments.push(comment);
  if (post.author !== phone) notify('comment', phone, post.author, 'comentó tu publicación', post.id);
  saveJson('posts.json', posts);
  return res.json({ ok: true, comment });
});
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

// Encuesta: votar en una publicación con encuesta (v1.1).
app.post('/api/posts/:id/vote', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const post = posts.find(p => p.id === req.params.id);
  if (!post) return res.status(404).json({ ok: false, error: 'Publicación no encontrada.' });
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
      return res.json({ ok: true });
    }
    for (let k = 0; k < (c.replies || []).length; k++) {
      if (c.replies[k].id === cid) {
        if (c.replies[k].author !== phone && post.author !== phone) return res.status(403).json({ ok: false, error: 'Sin permiso.' });
        c.replies.splice(k, 1);
        saveJson('posts.json', posts);
        return res.json({ ok: true });
      }
    }
  }
  return res.status(404).json({ ok: false, error: 'Comentario no encontrado.' });
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
app.get('/api/stories', (req, res) => res.json({ ok: true, stories: liveStories() }));
app.post('/api/stories', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const text = String((req.body && req.body.text) || '').trim();
  if (!text && !(req.body && req.body.media)) return res.status(400).json({ ok: false, error: 'Historia vacía.' });
  const s = { id: uid('story'), author: phone, text: text.slice(0, 300), media: (req.body && req.body.media) || '', mediaType: (req.body && req.body.mediaType) || '', edits: validateStoryEdits(req.body && req.body.edits), song: validateSongSrv(req.body && req.body.song), videoEdits: validateVideoEditsSrv(req.body && req.body.videoEdits), createdAt: Date.now(), views: [], likes: {}, comments: [], shares: [] };
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

/* ---- grupos ---- */
app.post('/api/groups', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const name = String((req.body && req.body.name) || '').trim();
  if (name.length < 3) return res.status(400).json({ ok: false, error: 'El grupo necesita un nombre.' });
  const g = { id: uid('grp'), name: name.slice(0, 80), desc: String((req.body && req.body.desc) || '').slice(0, 300), creator: phone, members: [phone], admins: [], cover: String((req.body && req.body.cover) || ''), rules: String((req.body && req.body.rules) || '').slice(0, 500), approval: !!(req.body && req.body.approval), joinRequests: [], pinnedPosts: [], createdAt: Date.now() };
  groups.push(g);
  saveJson('groups.json', groups);
  return res.json({ ok: true, group: g });
});
app.get('/api/groups', (req, res) => res.json({ ok: true, groups }));
app.post('/api/groups/:id/join', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const g = groups.find(x => x.id === req.params.id);
  if (!g) return res.status(404).json({ ok: false, error: 'Grupo no encontrado.' });
  if (g.members.includes(phone)) return res.json({ ok: true, group: g });
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
  if (body.rules !== undefined) g.rules = String(body.rules || '').slice(0, 500);
  if (body.approval !== undefined) g.approval = !!body.approval;
  saveJson('groups.json', groups);
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
    creator: phone, members: (body && body.members) || [phone],
    createdAt: (body && body.createdAt) || Date.now()
  };
  const existing = salesGroups.find(x => x.id === g.id);
  if (existing) { Object.assign(existing, g); saveJson('sales-groups.json', salesGroups); return res.json({ ok: true, group: existing }); }
  salesGroups.push(g);
  saveJson('sales-groups.json', salesGroups);
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

/* ---- mensajes ---- */
app.post('/api/messages', (req, res) => {
  const from = authPhone(req);
  if (!from) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const to = normPhone(req.body && req.body.to);
  const body = (req.body && req.body.message) || req.body;
  const text = String((body && body.text) || '').trim();
  if (!profiles[to]) return res.status(404).json({ ok: false, error: 'Esa persona no existe.' });
  if (isBlockedSrv(from, to)) return res.status(403).json({ ok: false, error: 'No puedes escribirle a esa persona.' });
  if (!text && !(body && body.media) && !(body && body.file) && !(body && body.voice)) return res.status(400).json({ ok: false, error: 'Mensaje vacío.' });
  const msg = {
    id: (body && body.id) || uid('msg'), from, to, text: text.slice(0, 2000),
    media: (body && body.media) || '', mediaType: (body && body.mediaType) || '',
    file: (body && body.file) || null, voice: (body && body.voice) || null,
    createdAt: (body && body.createdAt) || Date.now(), readBy: [from]
  };
  if (messages.some(m => m.id === msg.id)) return res.json({ ok: true, message: msg });
  messages.push(msg);
  notify('message', from, to, msg.voice ? 'te envió un mensaje de voz' : (text ? 'te envió un mensaje' : (msg.file ? 'te envió un archivo' : 'te envió una foto')), msg.id);
  saveAll();
  sendTo(to, { kind: 'message', message: msg });
  return res.json({ ok: true, message: msg });
});
app.get('/api/messages', (req, res) => {
  const phone = normPhone(req.query.phone);
  const mine = messages.filter(m => m.from === phone || m.to === phone).sort((a, b) => a.createdAt - b.createdAt);
  const byKey = {};
  mine.forEach(m => {
    const key = [m.from, m.to].sort().join('|');
    if (!byKey[key]) byKey[key] = { id: 'conv_' + key, participants: [m.from, m.to], messages: [], unread: {} };
    byKey[key].messages.push(m);
    if (m.to === phone && !m.readBy.includes(phone)) byKey[key].unread[phone] = (byKey[key].unread[phone] || 0) + 1;
  });
  return res.json({ ok: true, conversations: Object.values(byKey) });
});
app.post('/api/messages/read', (req, res) => {
  const phone = authPhone(req);
  if (!phone) return res.status(401).json({ ok: false, error: 'Sesión inválida.' });
  const other = normPhone(req.body && req.body.other);
  messages.forEach(m => {
    if (m.to === phone && m.from === other && !m.readBy.includes(phone)) m.readBy.push(phone);
  });
  saveJson('messages.json', messages);
  return res.json({ ok: true });
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
    if (canSee(phone, p) && ((p.text || '').toLowerCase().includes(q) || (p.link && (p.link.title || '').toLowerCase().includes(q)))) out.posts.push(p);
  });
  groups.forEach(g => {
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
wss.on('connection', (ws, req) => {
  let phone = '';
  try { phone = normPhone(new URL(req.url, 'http://x').searchParams.get('phone')); } catch (e) {}
  if (!phone) { ws.close(); return; }
  if (!sockets.has(phone)) sockets.set(phone, new Set());
  sockets.get(phone).add(ws);
  ws.on('close', () => {
    const set = sockets.get(phone);
    if (set) { set.delete(ws); if (!set.size) sockets.delete(phone); }
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

if (require.main === module) {
  server.listen(PORT, () => console.log('WordRed server en el puerto ' + PORT + (SMS_ENABLED ? ' (SMS por Twilio)' : ' (sin Twilio: códigos por [DEV])')));
}
module.exports = { app, server, _internals: { get profiles() { return profiles; }, get posts() { return posts; }, get auth() { return auth; }, get listings() { return listings; }, get events() { return events; }, get pages() { return pages; }, get salesGroups() { return salesGroups; }, get ratings() { return ratings; }, get stories() { return stories; }, get blocked() { return blocked; }, get reports() { return reports; }, get messages() { return messages; }, get media() { return media; }, cloudinaryConfig, saveAll } };
