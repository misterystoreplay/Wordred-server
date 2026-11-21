/* WordRed — lógica central (core.js)
   ------------------------------------------------------------------
   Toda la lógica de la red social vive aquí, sin tocar el DOM: cuentas
   por número de teléfono, publicaciones, reacciones, comentarios,
   compartir, historias, amistades, grupos, mensajes, notificaciones y
   búsqueda. El mismo archivo corre en el WebView (window.WordRedCore)
   y en los tests de Node (module.exports), así lo que se prueba es lo
   que se entrega.

   Modo local: todo se guarda en el teléfono (localStorage). Con el
   servidor, los cambios se envían por HTTP y los mensajes
   llegan en tiempo real por WebSocket. */
(function (root) {
'use strict';

/* v1.3: la dirección del servidor viene dentro de la app y la conexión
   es automática, como en cualquier app normal: no se muestra en ningún
   lado ni se pide. Si en Ajustes quedó guardada otra dirección (de una
   versión anterior), esa sigue valiendo. */
var DEFAULT_SERVER_URL = 'https://wordred-server.onrender.com';

var CODE_TTL_MS = 10 * 60 * 1000;      // el código vive 10 minutos
var CODE_MAX_ATTEMPTS = 5;
var STORY_TTL_MS = 24 * 60 * 60 * 1000; // las historias duran 24 horas
/* Personalización de historias (v1.2, ola 6): filtros y fondos de color
   para el editor de historias. Sin rosa: la paleta es la de WordRed. */
var STORY_FILTERS = ['none', 'blanco y negro', 'sepia', 'vivo', 'frío', 'cálido', 'contraste'];
var STORY_BG_COLORS = ['none', 'rojo', 'atardecer', 'mar', 'bosque', 'violeta', 'dorado', 'noche'];
var REACTIONS = ['Me gusta', 'Me encanta', 'Me divierte', 'Me sorprende', 'Me entristece', 'Me enoja'];
var REACTION_EMOJI = {
  'Me gusta': '👍', 'Me encanta': '❤️', 'Me divierte': '😂',
  'Me sorprende': '😮', 'Me entristece': '😢', 'Me enoja': '😡'
};

/* ---------------- utilidades ---------------- */
function uid(prefix) {
  return (prefix || 'id') + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}
function now() { return Date.now(); }
/* v2.9: la identidad de una cuenta es su número de teléfono o su
   correo (cuentas de Google/correo). Un correo se deja en minúsculas
   y se devuelve tal cual; un teléfono se deja solo en dígitos, como
   siempre. Así todo lo que usa normPhone (perfiles, amigos, mensajes)
   funciona igual con ambas clases de cuenta. */
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
/* v2.9: ¿esta identidad es un correo (cuenta de Google/correo)? */
function isEmailIdentity(id) { return String(id || '').indexOf('@') >= 0; }

/* v2.1 MODO INVITADO: quien entra sin verificar su número puede VER
   (inicio, publicaciones, perfiles, ventas, juegos), pero para ESCRIBIR
   (publicar, reaccionar, comentar, compartir, guardar, votar, historias,
   mensajes, solicitudes, grupos, ventas, eventos, lives) tiene que
   verificar su número. Estas funciones lo exigen: un invitado (sin
   perfil) recibe el mismo aviso claro y no se guarda nada con autor
   vacío. El servidor también exige token verificado (401) en esos
   endpoints, así que no se puede saltar desde fuera de la app. */
var GUEST_VERIFY_ERROR = 'Para hacer eso verifica tu número de teléfono. Es gratis y solo toma un momento.';
function requireVerified(state, phone) {
  phone = normPhone(phone);
  if (!phone || !state.profiles[phone]) return { ok: false, error: GUEST_VERIFY_ERROR };
  return null;
}
function genCode() { return String(Math.floor(100000 + Math.random() * 900000)); }
function hashCode(code) {
  // Hash simple y determinista (sin dependencias): el código nunca se guarda en claro.
  var h1 = 0xdeadbeef, h2 = 0x41c6ce57, s = String(code);
  for (var i = 0; i < s.length; i++) {
    var ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16) + (h1 >>> 0).toString(16);
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function formatDateTime(ts) {
  var d = new Date(ts);
  var months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  var hh = String(d.getHours()).padStart(2, '0');
  var mm = String(d.getMinutes()).padStart(2, '0');
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + ' · ' + hh + ':' + mm;
}
function formatDuration(ms) {
  var total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  var m = Math.floor(total / 60);
  var s = total % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}
/* Hora corta (HH:MM) para el "Visto" de los mensajes (v1.5). */
function formatTime(ts) {
  var d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
/* Códigos de clima WMO (Open-Meteo) a texto en español (v1.6, tarjeta de
   clima). Un código desconocido nunca inventa una condición: devuelve un
   texto genérico. */
function weatherCodeText(code) {
  var c = Number(code);
  if (c === 0) return 'Despejado';
  if (c === 1) return 'Mayormente despejado';
  if (c === 2) return 'Parcialmente nublado';
  if (c === 3) return 'Nublado';
  if (c === 45 || c === 48) return 'Niebla';
  if (c === 51 || c === 53 || c === 55) return 'Llovizna';
  if (c === 56 || c === 57) return 'Llovizna helada';
  if (c === 61 || c === 63 || c === 65) return 'Lluvia';
  if (c === 66 || c === 67) return 'Lluvia helada';
  if (c === 71 || c === 73 || c === 75) return 'Nieve';
  if (c === 77) return 'Granizo fino';
  if (c === 80 || c === 81 || c === 82) return 'Chubascos';
  if (c === 85 || c === 86) return 'Chubascos de nieve';
  if (c === 95) return 'Tormenta';
  if (c === 96 || c === 99) return 'Tormenta con granizo';
  return 'Clima variable';
}
/* ---- lives v1.7: filtros, zoom, cámara y grabación sin límite ----
   Todo esto es lógica pura (sin DOM ni red) para poder probarlo en
   Node. Los filtros son cadenas de filtro de canvas/CSS: se aplican
   sobre el video del live en tiempo real y los ven los espectadores
   porque el video que se envía sale del canvas procesado. */
var LIVE_FILTERS = [
  { id: 'none', label: 'Sin filtro', kind: 'color', css: '' },
  { id: 'belleza', label: 'Belleza', kind: 'color', css: 'brightness(1.07) contrast(0.93) saturate(1.12) blur(0.4px)' },
  { id: 'calido', label: 'Cálido', kind: 'color', css: 'sepia(0.35) saturate(1.35) hue-rotate(-12deg)' },
  { id: 'frio', label: 'Frío', kind: 'color', css: 'brightness(1.04) saturate(0.9) hue-rotate(18deg)' },
  { id: 'byn', label: 'Blanco y negro', kind: 'color', css: 'grayscale(1)' },
  { id: 'vivo', label: 'Vivo', kind: 'color', css: 'saturate(1.8) contrast(1.15)' },
  { id: 'sombrero', label: 'Sombrero', kind: 'object', css: '' },
  { id: 'gafas', label: 'Gafas', kind: 'object', css: '' },
  { id: 'corona', label: 'Corona', kind: 'object', css: '' },
  { id: 'orejas', label: 'Orejas', kind: 'object', css: '' },
  { id: 'bigote', label: 'Bigote', kind: 'object', css: '' },
  { id: 'marco', label: 'Marco', kind: 'object', css: '' }
];
/* v2.1: filtros con OBJETOS que se ponen sobre la imagen (sombrero,
   gafas, corona, orejas, bigote, marco). Cada objeto es un conjunto de
   trazados SVG en un espacio de 100×100, con su caja de colocación en
   fracciones del lienzo (x, y, w, h). Los mismos trazados se dibujan en
   el canvas del live (Path2D, así los ven los espectadores) y se usan
   para el SVG de la vista previa cuando el WebView no procesa el
   video. Dibujo propio, sin imágenes ni fotos de nadie; colores solo
   rojo, blanco, dorado y negro. */
var LIVE_FILTER_OBJECT_DEFS = {
  sombrero: { box: { x: 0.28, y: 0.02, w: 0.44, h: 0.22 }, paths: [
    { d: 'M28,58 L32,18 C32,10 68,10 68,18 L72,58 C60,54 40,54 28,58 Z', fill: '#1c1c1e' },
    { d: 'M28,44 L72,44 L72,56 C60,52 40,52 28,56 Z', fill: '#E60026' },
    { d: 'M5,62 C20,52 80,52 95,62 C95,70 80,74 50,74 C20,74 5,70 5,62 Z', fill: '#1c1c1e' }
  ] },
  gafas: { box: { x: 0.22, y: 0.34, w: 0.56, h: 0.16 }, paths: [
    { d: 'M10,8 h24 a8,8 0 0 1 8,8 v8 a8,8 0 0 1 -8,8 h-24 a8,8 0 0 1 -8,-8 v-8 a8,8 0 0 1 8,-8 Z', fill: '#1c1c1e' },
    { d: 'M58,8 h24 a8,8 0 0 1 8,8 v8 a8,8 0 0 1 -8,8 h-24 a8,8 0 0 1 -8,-8 v-8 a8,8 0 0 1 8,-8 Z', fill: '#1c1c1e' },
    { d: 'M42,16 h16 v6 h-16 Z', fill: '#1c1c1e' },
    { d: 'M2,14 h8 v4 h-8 Z', fill: '#1c1c1e' },
    { d: 'M90,14 h8 v4 h-8 Z', fill: '#1c1c1e' },
    { d: 'M14,12 h16 a4,4 0 0 1 4,4 v8 a4,4 0 0 1 -4,4 h-16 a4,4 0 0 1 -4,-4 v-8 a4,4 0 0 1 4,-4 Z', fill: 'rgba(255,255,255,0.18)' },
    { d: 'M62,12 h16 a4,4 0 0 1 4,4 v8 a4,4 0 0 1 -4,4 h-16 a4,4 0 0 1 -4,-4 v-8 a4,4 0 0 1 4,-4 Z', fill: 'rgba(255,255,255,0.18)' }
  ] },
  corona: { box: { x: 0.30, y: 0.02, w: 0.40, h: 0.20 }, paths: [
    { d: 'M8,78 L4,22 L24,44 L50,8 L76,44 L96,22 L92,78 Z', fill: '#FFC93C' },
    { d: 'M8,64 h84 v14 h-84 Z', fill: '#E60026' },
    { d: 'M50,56 a7,7 0 1,0 0.1,0 Z', fill: '#E60026' },
    { d: 'M24,58 a5,5 0 1,0 0.1,0 Z', fill: '#ffffff' },
    { d: 'M76,58 a5,5 0 1,0 0.1,0 Z', fill: '#ffffff' }
  ] },
  orejas: { box: { x: 0.20, y: 0.02, w: 0.60, h: 0.22 }, paths: [
    { d: 'M8,78 L16,10 L48,58 Z', fill: '#E60026' },
    { d: 'M18,64 L22,26 L38,52 Z', fill: '#ffffff' },
    { d: 'M92,78 L84,10 L52,58 Z', fill: '#E60026' },
    { d: 'M82,64 L78,26 L62,52 Z', fill: '#ffffff' }
  ] },
  bigote: { box: { x: 0.32, y: 0.56, w: 0.36, h: 0.12 }, paths: [
    { d: 'M50,20 C40,4 18,2 8,14 C4,20 8,28 18,28 C28,28 40,26 50,20 C60,26 72,28 82,28 C92,28 96,20 92,14 C82,2 60,4 50,20 Z', fill: '#1c1c1e' }
  ] },
  marco: { box: { x: 0, y: 0, w: 1, h: 1 }, paths: [
    { d: 'M0,0 h100 v6 h-100 Z', fill: '#E60026' },
    { d: 'M0,94 h100 v6 h-100 Z', fill: '#E60026' },
    { d: 'M0,0 h6 v100 h-6 Z', fill: '#E60026' },
    { d: 'M94,0 h6 v100 h-6 Z', fill: '#E60026' },
    { d: 'M0,9 h100 v2 h-100 Z', fill: '#ffffff' },
    { d: 'M0,89 h100 v2 h-100 Z', fill: '#ffffff' },
    { d: 'M9,0 h2 v100 h-2 Z', fill: '#ffffff' },
    { d: 'M89,0 h2 v100 h-2 Z', fill: '#ffffff' },
    { d: 'M8,8 a4,4 0 1,0 0.1,0 Z', fill: '#FFC93C' },
    { d: 'M92,8 a4,4 0 1,0 0.1,0 Z', fill: '#FFC93C' },
    { d: 'M8,92 a4,4 0 1,0 0.1,0 Z', fill: '#FFC93C' },
    { d: 'M92,92 a4,4 0 1,0 0.1,0 Z', fill: '#FFC93C' }
  ] }
};
function liveFilterKind(id) {
  var f = null;
  LIVE_FILTERS.forEach(function (x) { if (x.id === id) f = x; });
  return f ? (f.kind || 'color') : 'color';
}
function liveFilterObjectDef(id) {
  return LIVE_FILTER_OBJECT_DEFS[id] || null;
}
function liveFilterObjectSvg(id) {
  var def = liveFilterObjectDef(id);
  if (!def) return '';
  var inner = def.paths.map(function (p) { return '<path d="' + p.d + '" fill="' + p.fill + '"/>'; }).join('');
  return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
}
/* Dibuja el objeto del filtro sobre el lienzo del live (vista previa
   del transmisor y video que ven los espectadores, porque el video
   sale de este lienzo). Devuelve true si se dibujó algo. */
function liveDrawFilterObject(ctx, id, cw, ch) {
  var def = liveFilterObjectDef(id);
  if (!def || !ctx || typeof Path2D === 'undefined') return false;
  try {
    var b = def.box;
    ctx.save();
    ctx.translate(b.x * cw, b.y * ch);
    ctx.scale(b.w * cw / 100, b.h * ch / 100);
    def.paths.forEach(function (p) {
      ctx.fillStyle = p.fill;
      ctx.fill(new Path2D(p.d));
    });
    ctx.restore();
    return true;
  } catch (e) { try { ctx.restore(); } catch (e2) {} return false; }
}
var LIVE_ZOOM_MAX = 4;      // zoom digital máximo del live (recorte, x4)
var LIVE_ZOOM_STEP = 0.5;   // cada toque de + / - acerca o aleja medio paso
var LIVE_REC_CHUNK_MS = 5000; // cada 5 s se guarda un trozo de la grabación
function liveFilterCss(id) {
  var f = null;
  LIVE_FILTERS.forEach(function (x) { if (x.id === id) f = x; });
  return f ? f.css : '';
}
function liveFilterLabel(id) {
  var f = null;
  LIVE_FILTERS.forEach(function (x) { if (x.id === id) f = x; });
  return f ? f.label : 'Sin filtro';
}
function liveFilterValid(id) {
  return LIVE_FILTERS.some(function (x) { return x.id === id; });
}
function nextLiveFacing(facing) {
  return facing === 'environment' ? 'user' : 'environment';
}
function liveFacingLabel(facing) {
  return facing === 'environment' ? 'Cámara frontal' : 'Cámara trasera';
}
function clampLiveZoom(level, cap) {
  var c = Number(cap) || LIVE_ZOOM_MAX;
  if (c < 1) c = 1;
  var l = Number(level) || 1;
  if (l < 1) return 1;
  if (l > c) return c;
  return Math.round(l * 10) / 10;
}
function liveZoomStep(level, dir, cap) {
  return clampLiveZoom((Number(level) || 1) + (dir >= 0 ? LIVE_ZOOM_STEP : -LIVE_ZOOM_STEP), cap);
}
function liveZoomLabel(level) {
  return (Math.round((Number(level) || 1) * 10) / 10).toFixed(1) + '×';
}
/* Nombre del archivo de una grabación de live: live-<fecha>-<hora>.webm.
   Sin límite de duración: el nombre no lleva tope ni parte, la
   grabación crece por trozos hasta que la persona la detiene. */
function liveRecFileName(ts) {
  var d = new Date(Number(ts) || Date.now());
  function p(n) { return String(n).padStart(2, '0'); }
  return 'live-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.webm';
}
function liveRecMime() { return 'video/webm'; }
/* Sesión de grabación de un live (v1.7, a prueba de cortes): se guarda
   por trozos mientras se graba, en el teléfono y en el servidor, y la
   sesión queda registrada en localStorage tras CADA trozo. Si el live
   se corta por lo que sea (red, app cerrada, pila), la sesión queda
   con status 'recording' y al volver a abrir la app se recupera: lo
   grabado hasta ahí no se pierde, como mucho los últimos segundos. */
function createLiveRecSession(liveId, title, startedAt) {
  var ts = Number(startedAt) || Date.now();
  return {
    id: 'rec_' + ts + '_' + Math.floor(Math.random() * 100000),
    liveId: liveId || '',
    title: title || 'Live',
    fileName: liveRecFileName(ts),
    startedAt: ts,
    chunks: 0,          // trozos guardados en el teléfono
    bytes: 0,           // bytes guardados en el teléfono
    serverChunks: 0,    // trozos confirmados por el servidor
    serverUploadId: '',
    serverDone: false,  // true cuando la copia del servidor está completa
    localUri: '',        // content:// de la grabación ya cerrada
    serverUrl: '',       // URL pública (Cloudinary) cuando existe
    status: 'recording' // 'recording' | 'done' | 'discarded'
  };
}
function liveRecSessionKey(session) {
  return 'wr_live_rec_' + (session && session.id ? session.id : 'x');
}
function liveRecDurationMs(session, at) {
  if (!session) return 0;
  var end = session.endedAt ? Number(session.endedAt) : Number(at) || Date.now();
  return Math.max(0, end - Number(session.startedAt || end));
}
function liveRecIsInterrupted(session) {
  return !!session && session.status === 'recording';
}
function liveRecSummary(session, at) {
  if (!session) return '';
  return 'Grabación del live "' + (session.title || 'Live') + '" — guardada hasta ' +
    formatDuration(liveRecDurationMs(session, at)) + ' (' + (session.chunks || 0) + ' trozos en tu teléfono' +
    (session.serverDone ? ' y copia completa en el servidor' : session.serverChunks > 0 ? ' y ' + session.serverChunks + ' trozos en el servidor' : '') + ').';
}
/* --- cambio de cámara del live (v1.8) ---
   La v1.7 pedía la cámara nueva sin soltar la vieja y sin tiempo límite:
   en este teléfono el segundo getUserMedia se quedaba esperando para
   siempre (cámara ocupada) y no pasaba nada; y si devolvía la frontal
   de nuevo, el código lo aceptaba y decía "Cámara trasera" aunque nada
   había cambiado. Estas funciones puras eligen el dispositivo por su
   etiqueta y verifican la cámara REAL de la pista devuelta. */
var LIVE_CAM_TIMEOUT_MS = 6000; // cada intento de cámara tiene 6 s como máximo
function liveTrackFacing(track) {
  try {
    if (!track || !track.getSettings) return '';
    var s = track.getSettings() || {};
    return s.facingMode || '';
  } catch (e) { return ''; }
}
function livePickCameraDevice(devices, facing) {
  if (!devices || !devices.length) return null;
  var wantBack = facing === 'environment';
  var re = wantBack ? /back|trasera|rear|trasero|principal/i : /front|frontal|selfie/i;
  var found = null;
  devices.forEach(function (d) {
    if (!d || d.kind !== 'videoinput') return;
    if (re.test(d.label || '')) found = d;
  });
  if (found) return found;
  /* Sin etiquetas (antes del primer permiso) no se puede elegir por
     nombre: se devuelve el segundo dispositivo como trasera probable. */
  var videos = devices.filter(function (d) { return d && d.kind === 'videoinput'; });
  if (!videos.length) return null;
  if (wantBack && videos.length > 1) return videos[1];
  return videos[0];
}
function timeAgo(ts, t) {
  var d = Math.max(0, (t || now()) - ts);
  var m = Math.floor(d / 60000);
  if (m < 1) return 'ahora mismo';
  if (m < 60) return 'hace ' + m + ' min';
  var h = Math.floor(m / 60);
  if (h < 24) return 'hace ' + h + ' h';
  var days = Math.floor(h / 24);
  if (days < 7) return 'hace ' + days + ' d';
  return new Date(ts).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

/* ---------------- enlaces (publicar de todo: texto, foto, video y enlace) ---------------- */
function normalizeLink(raw) {
  var url = String(raw || '').trim();
  if (!url) return { ok: false, error: 'Escribe un enlace.' };
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  var host = '';
  try {
    // En Node y en el WebView moderno existe URL; si no, se extrae a mano.
    if (typeof URL !== 'undefined') host = new URL(url).hostname.replace(/^www\./, '');
    else host = url.replace(/^https?:\/\//i, '').split(/[/:?#]/)[0].replace(/^www\./, '');
  } catch (e) { return { ok: false, error: 'Ese enlace no es válido. Revisa que empiece con http:// o https://.' }; }
  if (!host || host.indexOf('.') < 0) return { ok: false, error: 'Ese enlace no es válido. Revisa que empiece con http:// o https://.' };
  if (url.length > 2000) return { ok: false, error: 'Ese enlace es demasiado largo.' };
  return { ok: true, url: url, host: host };
}
function extractUrl(text) {
  var m = String(text || '').match(/https?:\/\/[^\s<>"']+/i);
  return m ? m[0].replace(/[.,;:!?)]+$/, '') : '';
}
function linkPreviewFallback(raw) {
  var n = normalizeLink(raw);
  if (!n.ok) return n;
  return { ok: true, link: { url: n.url, host: n.host, title: n.host, desc: '', image: '' } };
}

/* ---------------- estado ---------------- */
function emptyState() {
  return {
    version: 1,
    me: null,                       // teléfono de la cuenta activa
    profiles: {},                   // teléfono -> {phone, name, bio, photo, cover, createdAt, isDemo}
    posts: [],                      // [{id, author, text, media, mediaType, privacy, groupId, sharedFrom, createdAt, likes:{phone:reaction}, comments:[], shares:[phone], savedBy:[phone], isDemo}]
    stories: [],                    // [{id, author, text, media, mediaType, createdAt, views:[phone], isDemo}]
    friends: {},                    // teléfono -> [teléfono...]
    requests: [],                   // [{id, from, to, status, createdAt}]
    groups: [],                     // [{id, name, desc, creator, members:[phone], createdAt}]
    listings: [],                   // [{id, seller, title, price, category, condition, desc, city, photos:[], status, createdAt, savedBy:[phone]}]
    events: [],                     // [{id, creator, name, desc, date, time, place, cover, attendees:{phone:'asiste'|'interes'}, status, createdAt}]
    pages: [],                      // [{id, name, category, desc, photo, creator, followers:[phone], createdAt}]
    salesGroups: [],                // [{id, name, desc, photo, category, rules, creator, members:[phone], createdAt}]
    ratings: [],                    // [{id, seller, rater, stars, comment, createdAt}]
    conversations: {},              // clave "a|b" -> {id, participants:[a,b], messages:[{id, from, text, media, mediaType, file, createdAt, readBy:[phone]}], unread:{phone:count}}
    groupChats: [],                 // v1.5.14: chats grupales [{id, name, participants:[phone], messages:[{id, from, text, media, mediaType, createdAt, readBy:[phone]}], unread:{phone:count}, createdAt, createdBy, updatedAt}]
    notifications: [],              // [{id, type, from, text, refId, createdAt, read}]
    recentViews: [],                // [{phone, at}] perfiles vistos recientemente (v1.2)
    notifiedPostIds: [],            // publicaciones ya avisadas (v1.2, no avisar dos veces)
    blocked: {},                    // bloqueos (v1.2, ola 7): teléfono que bloquea -> [teléfonos bloqueados]
    reports: [],                    // reportes de cuentas (v1.2, ola 7): [{id, reporter, reported, reason, desc, createdAt, status}]
    settings: { serverUrl: '', serverToken: '', googleClientId: '', appColor: '#e01430', customColors: [], notifLikes: true, notifComments: true, notifRequests: true, notifMessages: true, notifGroups: true, notifFollowPosts: true, notifPagePosts: true, notifGroupPosts: true, notifTags: true, defaultsAsked: false, textSize: 'normal', chatBg: '', dataSaver: false },
    pendingQueue: [],               // mensajes por enviar cuando haya servidor
    deletedPostIds: [],             // lápidas v1.5.14: ids de publicaciones borradas por mí (que no resuciten al sincronizar)
    deletedItemIds: [],             // v1.5.15: lápidas genéricas "tipo:id" para TODO lo borrable (historia, comentario, mensaje, conversación, grupo, anuncio, grupo de ventas): lo borrado no resucita al sincronizar
    linkTitles: {},                 // títulos de enlaces v1.5.14: url -> título de la página (caché para las tarjetas de enlace)
    linkImages: {},                 // v1.5.15: imágenes de enlaces: url -> og:image de la página (caché para las tarjetas de enlace)
    liveRecordings: [],             // grabaciones de lives terminadas (v1.7): [{id, liveId, title, fileName, localUri, serverUrl, durationMs, chunks, bytes, createdAt}]
    /* v1.5.26 (42 ideas): */
    muted: {},                    // yo -> [teléfonos silenciados] (31: solo apaga avisos, no oculta nada)
    closeFriends: {},             // yo -> [teléfonos de cercanos] (13)
    cart: [],                     // [{listingId, qty}] (12)
    drafts: [],                   // borradores de publicación (14): [{id, text, mediaList, song, bg, feeling, tags, location, poll, createdAt}]
    scheduledPosts: [],           // publicaciones programadas (6): [{id, data, atMs, createdAt, missed}]
    wishlist: [],                 // [listingId] (21)
    coupons: [],                  // cupones de mi tienda (34): [{code, discountPct, listingId, expiresAt}]
    eventReminders: {},           // eventoId -> minutos antes (27)
    postViewed: {},               // postId -> true (4: vista registrada una vez por visitante)
    postStatsCache: {},           // postId -> {views, likes, comments, shares, at} (4)
    storyViewersCache: {},        // storyId -> {count, viewers, at} (1)
    accounts: [],                 // cuentas en este teléfono (41): [{phone, name, photo, token}]
    lastFeedPostId: '',           // última publicación visible del inicio (40)
    lastFeedAt: 0,                // cuándo se guardó la posición del inicio (40)
    offlineAt: 0,                 // última carga buena del inicio (15)
    screenTime: {},               // YYYY-MM-DD -> ms con la app abierta (44)
    wordFilter: [],               // palabras que no quiero ver (45)
    pinnedChats: [],              // claves de conversación fijadas (54)
    savedLinks: [],               // enlaces guardados (59): [{url, host, title, savedAt}]
    chatSounds: {},               // teléfono -> sonido de ese chat (64)
    friendsOnlyFeed: false,       // inicio solo de amigos (61)
    quietHours: { on: false, start: '22:00', end: '07:00' }, // 49
    disappearing: {},             // clave de conversación -> horas (32): 0 = apagado, 24 = temporal
    homeWidgets1536: null,        // menú principal tipo widgets (1.5.36): {order, sizes, colors, added, notes}; null = usar el predeterminado (defaultHomeWidgets1536)
    creatorConfigApplied1553: null, // 1.5.53: última configuración del creador aplicada a este teléfono (o null)
    demoSeeded: false
  };
}

/* ---------------- menú principal tipo widgets (1.5.36) ----------------
   El inicio se acomoda como widgets: cada apartado (reloj, clima,
   historias, publicar, accesos) se puede mover, cambiar de tamaño y de
   color, y se pueden agregar más apartados (calendario, mensajería,
   fotos, calculadora, notas, batería, tiempo en pantalla). Todo se
   guarda por teléfono, en el estado (localStorage), nunca en el servidor.
   El modo de edición se entra SOLO dejando presionado un apartado. */
/* 1.5.41: las historias siempre van arriba (fijadas en primer lugar);
   debajo va publicar («¿Qué estás pensando?»), y luego el reloj con el
   clima a su derecha (los dos en tamaño s, media fila cada uno). */
var HOME_WIDGETS_BUILTIN_1536 = ['historias', 'publicar', 'reloj', 'clima', 'accesos'];
var HOME_WIDGETS_ADDABLE_1536 = [
  { id: 'calendario', title: 'Calendario', desc: 'El mes actual con el día de hoy marcado.' },
  { id: 'mensajeria', title: 'Mensajería', desc: 'Tus mensajes sin leer y un botón para abrirlos.' },
  { id: 'fotos', title: 'Fotos', desc: 'Tus fotos publicadas en WordRed.' },
  { id: 'calculadora', title: 'Calculadora', desc: 'Calcula de verdad, con + − × ÷.' },
  { id: 'notas', title: 'Notas', desc: 'Notas rápidas guardadas en este teléfono.' },
  /* Web 1.0: sin «Batería» (en la web no hay batería del teléfono que leer). */
  { id: 'tiempo', title: 'Tiempo en pantalla', desc: 'Cuánto llevas hoy con la página abierta.' }
];
var HOME_WIDGET_SIZES_1536 = ['s', 'm', 'l'];
var HOME_WIDGET_SIZE_NAMES_1536 = { s: 'Pequeño', m: 'Mediano', l: 'Grande' };
var HOME_WIDGET_COLORS_1536 = ['rojo', 'azul', 'verde', 'morado', 'naranja', 'gris'];
var HOME_WIDGET_COLOR_NAMES_1536 = { rojo: 'Rojo', azul: 'Azul', verde: 'Verde', morado: 'Morado', naranja: 'Naranja', gris: 'Gris' };
/* 1.5.38: el color en hexadecimal (igual que --hwAccent en index.html)
   para el punto de color del botón Color de la barra de edición. */
var HOME_WIDGET_COLOR_HEX_1536 = { rojo: '#e01430', azul: '#2563eb', verde: '#16a34a', morado: '#7c3aed', naranja: '#ea580c', gris: '#6b7280' };
var HOME_WIDGET_TITLES_1536 = { reloj: 'Reloj', clima: 'Clima', historias: 'Reels', publicar: 'Publicar', accesos: 'Accesos', calendario: 'Calendario', mensajeria: 'Mensajería', fotos: 'Fotos', calculadora: 'Calculadora', notas: 'Notas', bateria: 'Batería', tiempo: 'Tiempo en pantalla' };
function defaultHomeWidgets1536() {
  return {
    order: HOME_WIDGETS_BUILTIN_1536.slice(),
    sizes: { reloj: 's', clima: 's', historias: 'm', publicar: 'm', accesos: 'm' },
    colors: { reloj: 'rojo', clima: 'rojo', historias: 'rojo', publicar: 'rojo', accesos: 'rojo' },
    added: [],
    notes: []
  };
}
function normalizeHomeWidgets1536(state) {
  var cfg = state.homeWidgets1536;
  if (!cfg || typeof cfg !== 'object') cfg = defaultHomeWidgets1536();
  var known = {};
  HOME_WIDGETS_BUILTIN_1536.forEach(function (id) { known[id] = true; });
  HOME_WIDGETS_ADDABLE_1536.forEach(function (w) { known[w.id] = true; });
  var order = Array.isArray(cfg.order) ? cfg.order.filter(function (id) { return known[id]; }) : [];
  HOME_WIDGETS_BUILTIN_1536.forEach(function (id) { if (order.indexOf(id) < 0) order.push(id); });
  var added = Array.isArray(cfg.added) ? cfg.added.filter(function (id) { return HOME_WIDGETS_ADDABLE_1536.some(function (w) { return w.id === id; }); }) : [];
  added.forEach(function (id) { if (order.indexOf(id) < 0) order.push(id); });
  /* 1.5.41: las historias siempre van arriba (fijadas en primer lugar):
     si una configuración guardada las trae en otro lugar, suben al primero. */
  order = ['historias'].concat(order.filter(function (id) { return id !== 'historias'; }));
  var sizes = {}, colors = {};
  order.forEach(function (id) {
    sizes[id] = HOME_WIDGET_SIZES_1536.indexOf(cfg.sizes && cfg.sizes[id]) >= 0 ? cfg.sizes[id] : ((id === 'reloj' || id === 'clima') ? 's' : 'm');
    colors[id] = HOME_WIDGET_COLORS_1536.indexOf(cfg.colors && cfg.colors[id]) >= 0 ? cfg.colors[id] : 'rojo';
  });
  cfg = { order: order, sizes: sizes, colors: colors, added: added, notes: Array.isArray(cfg.notes) ? cfg.notes.filter(function (n) { return n && typeof n.text === 'string' && n.text.trim().length > 0; }) : [] };
  state.homeWidgets1536 = cfg;
  return cfg;
}
/* 1.5.53: configuración del creador (orden y tamaño del Inicio desde
   el servidor, GET /api/creator-config). Se aplica SOLO como
   predeterminado: si este teléfono ya personalizó su Inicio
   (state.homeWidgets1536 no es null), se conserva lo del teléfono y
   la configuración del creador no lo toca (misma regla que el
   'single'/'multi' del cajón en la 1.5.52). Si la configuración no es
   válida, se queda el predeterminado de la app. */
function creatorHomeConfigValid1536(cfg) {
  if (!cfg || typeof cfg !== 'object') return false;
  if (!Array.isArray(cfg.order) || !cfg.order.length) return false;
  var known = {};
  HOME_WIDGETS_BUILTIN_1536.forEach(function (id) { known[id] = true; });
  HOME_WIDGETS_ADDABLE_1536.forEach(function (w) { known[w.id] = true; });
  var seen = {};
  for (var i = 0; i < cfg.order.length; i++) {
    var id = cfg.order[i];
    if (!known[id] || seen[id]) return false;
    seen[id] = true;
  }
  if (!cfg.sizes || typeof cfg.sizes !== 'object') return false;
  for (var j = 0; j < cfg.order.length; j++) {
    if (HOME_WIDGET_SIZES_1536.indexOf(cfg.sizes[cfg.order[j]]) < 0) return false;
  }
  return true;
}
function applyCreatorHomeDefault1536(state, cfg) {
  if (!state) return null;
  if (state.homeWidgets1536) return normalizeHomeWidgets1536(state);
  if (!creatorHomeConfigValid1536(cfg)) return normalizeHomeWidgets1536(state);
  var added = cfg.order.filter(function (id) { return HOME_WIDGETS_ADDABLE_1536.some(function (w) { return w.id === id; }); });
  var colors = {};
  cfg.order.forEach(function (id) { colors[id] = 'rojo'; });
  state.homeWidgets1536 = { order: cfg.order.slice(), sizes: Object.assign({}, cfg.sizes), colors: colors, added: added, notes: [] };
  return normalizeHomeWidgets1536(state);
}

/* El código pendiente vive solo en memoria (nunca en localStorage). */
var pendingCodes = {};   // teléfono -> {hash, expiresAt, attempts}
var codeHits = {};       // teléfono -> [timestamps] (límite anti-abuso)

function resetRuntime() { pendingCodes = {}; codeHits = {}; }

/* ---------------- cuentas por teléfono ---------------- */
function requestCode(state, phone) {
  phone = normPhone(phone);
  if (phone.length < 8 || phone.length > 15) return { ok: false, error: 'Escribe un número de teléfono válido.' };
  var t = now();
  var hits = (codeHits[phone] || []).filter(function (x) { return t - x < 3600000; });
  if (hits.length >= 3) return { ok: false, error: 'Ya pediste varios códigos. Inténtalo de nuevo en una hora.' };
  hits.push(t);
  codeHits[phone] = hits;
  var code = genCode();
  pendingCodes[phone] = { hash: hashCode(code), expiresAt: t + CODE_TTL_MS, attempts: 0 };
  return { ok: true, phone: phone, code: code, expiresInSec: CODE_TTL_MS / 1000 };
}

function verifyCode(state, phone, code) {
  phone = normPhone(phone);
  var pend = pendingCodes[phone];
  if (!pend) return { ok: false, error: 'No hay un código activo para ese número. Pide uno nuevo.' };
  if (now() > pend.expiresAt) { delete pendingCodes[phone]; return { ok: false, error: 'El código caducó. Pide uno nuevo.' }; }
  pend.attempts++;
  if (pend.attempts > CODE_MAX_ATTEMPTS) { delete pendingCodes[phone]; return { ok: false, error: 'Demasiados intentos. Pide un código nuevo.' }; }
  if (hashCode(String(code || '').trim()) !== pend.hash) return { ok: false, error: 'El código no coincide. Revisa y vuelve a intentar.' };
  delete pendingCodes[phone];
  return { ok: true, phone: phone };
}

function completeProfile(state, phone, data) {
  phone = normPhone(phone);
  var name = String((data && data.name) || '').trim();
  if (!phone) return { ok: false, error: 'Falta tu cuenta.' };
  if (name.length < 2) return { ok: false, error: 'Escribe tu nombre (mínimo 2 letras).' };
  if (name.length > 60) return { ok: false, error: 'El nombre es demasiado largo.' };
  var prof = state.profiles[phone] || { phone: phone, createdAt: now(), isDemo: false, frame: 'none', accent: 'rojo', headerGradient: 'none', job: '', education: '', city: '', relationship: '', birthday: '', website: '', pinnedPosts: [], sectionPrivacy: { bio: 'Público', friends: 'Público', posts: 'Público' } };
  prof.name = name;
  prof.bio = String((data && data.bio) || '').slice(0, 200);
  if (data && data.photo !== undefined) prof.photo = data.photo || '';
  if (data && data.cover !== undefined) prof.cover = data.cover || '';
  /* v1.2: la portada puede ser imagen o video. */
  if (data && data.coverType !== undefined) prof.coverType = data.coverType === 'video' ? 'video' : 'image';
  if (!prof.cover) prof.coverType = 'image';
  if (!prof.coverType) prof.coverType = 'image';
  // Personalización v1.1: marco, tema, campos de biografía y privacidad por sección.
  if (!prof.pinnedPosts) prof.pinnedPosts = [];
  if (!prof.sectionPrivacy) prof.sectionPrivacy = { bio: 'Público', friends: 'Público', posts: 'Público' };
  if (!prof.frame) prof.frame = 'none';
  if (!prof.accent) prof.accent = 'rojo';
  if (data && data.frame !== undefined) {
    if (FRAMES.map(function (f) { return f.id; }).indexOf(data.frame) < 0) return { ok: false, error: 'Ese marco no existe.' };
    prof.frame = data.frame;
  }
  if (data && data.accent !== undefined) {
    if (ACCENTS.map(function (a) { return a.id; }).indexOf(data.accent) < 0) return { ok: false, error: 'Ese tema no existe.' };
    prof.accent = data.accent;
  }
  if (data && data.headerGradient !== undefined) {
    if (HEADER_GRADIENTS.indexOf(data.headerGradient) < 0) return { ok: false, error: 'Ese degradado no existe.' };
    prof.headerGradient = data.headerGradient;
  }
  if (!prof.headerGradient) prof.headerGradient = 'none';
  if (data && data.job !== undefined) prof.job = String(data.job || '').slice(0, 100);
  if (data && data.education !== undefined) prof.education = String(data.education || '').slice(0, 100);
  if (data && data.city !== undefined) prof.city = String(data.city || '').slice(0, 80);
  if (data && data.relationship !== undefined) {
    if (data.relationship && RELATIONSHIPS.indexOf(data.relationship) < 0) return { ok: false, error: 'Ese estado civil no existe.' };
    prof.relationship = data.relationship || '';
  }
  if (data && data.birthday !== undefined) {
    var bd = String(data.birthday || '');
    if (bd && !/^\d{4}-\d{2}-\d{2}$/.test(bd)) return { ok: false, error: 'El cumpleaños debe ser una fecha válida.' };
    prof.birthday = bd;
  }
  if (data && data.website !== undefined) {
    var ws = String(data.website || '').trim();
    if (ws) {
      var wn = normalizeLink(ws);
      if (!wn.ok) return { ok: false, error: 'El sitio web no es válido.' };
      prof.website = wn.url;
    } else prof.website = '';
  }
  /* v1.5.26: nota de perfil (30, máx. 60), canción del día (33) y
     portada de Destacadas (36). La verificación (10) la pone el servidor;
     aquí solo se guarda lo que el servidor sirve. */
  if (data && data.note !== undefined) prof.note = validateProfileNote(data.note);
  if (data && data.songOfTheDay !== undefined) {
    var sotd = data.songOfTheDay;
    prof.songOfTheDay = (sotd && sotd.song && sotd.date) ? { song: validateSong(sotd.song), date: String(sotd.date) } : null;
  }
  if (data && data.pinnedCover !== undefined) {
    var pc = validatePinnedCover(data.pinnedCover);
    if (pc === null) return { ok: false, error: 'La portada de Destacadas debe ser una URL válida.' };
    prof.pinnedCover = pc;
  }
  /* v1.5.26: video en la foto de perfil (48), marco (63) y filtro (65). */
  if (data && data.avatarVideo !== undefined) prof.avatarVideo = validateAvatarVideo(data.avatarVideo);
  if (data && data.avatarFrame !== undefined) prof.avatarFrame = validateAvatarFrame(data.avatarFrame);
  if (data && data.avatarFilter !== undefined) prof.avatarFilter = validateAvatarFilter(data.avatarFilter);
  if (data && data.verified !== undefined) prof.verified = !!data.verified;
  if (prof.verified === undefined) prof.verified = false;
  if (data && data.sectionPrivacy !== undefined) {
    var sp = data.sectionPrivacy;
    var okVals = ['Público', 'Amigos', 'Solo yo'];
    prof.sectionPrivacy = {
      bio: okVals.indexOf(sp.bio) >= 0 ? sp.bio : 'Público',
      friends: okVals.indexOf(sp.friends) >= 0 ? sp.friends : 'Público',
      posts: okVals.indexOf(sp.posts) >= 0 ? sp.posts : 'Público'
    };
  }
  state.profiles[phone] = prof;
  state.me = phone;
  if (!state.friends[phone]) state.friends[phone] = [];
  return { ok: true, profile: prof };
}

function logout(state) { state.me = null; return { ok: true }; }

/* ---------------- publicaciones ---------------- */
function canSeePost(state, viewer, post) {
  if (!post) return false;
  if (isBlockedBetween(state, viewer, post.author)) return false; // ola 7: bloqueado no ve tus publicaciones
  if (post.isAd) return true; // ola 8: los anuncios de empresas son públicos
  if (post.pageId) {
    var pg = state.pages.filter(function (x) { return x.id === post.pageId; })[0];
    if (!pg) return false;
    return pg.followers.indexOf(viewer) >= 0 || pg.creator === viewer || post.author === viewer;
  }
  if (post.groupId) {
    var g = state.groups.filter(function (x) { return x.id === post.groupId; })[0];
    if (!g) return false;
    return g.members.indexOf(viewer) >= 0 || post.author === viewer;
  }
  if (post.privacy === 'Solo yo') return post.author === viewer;
  if (post.privacy === 'Amigos') {
    if (post.author === viewer) return true;
    return (state.friends[viewer] || []).indexOf(post.author) >= 0;
  }
  return true; // Público
}

/* ---- canciones y análisis inteligente (v1.2, olas 8-9) ----
   El catálogo es una lista de canciones con su ambiente, palabras clave
   y colores asociados. El audio de cada canción es el archivo de audio
   que tú o la empresa sube (su canción de marca), o una melodía
   ambiental generada en el dispositivo cuando no hay archivo.
   El análisis de imagen/video es una heurística en el dispositivo:
   colores dominantes, brillo y calidez, más las palabras del texto. */
var SONG_MOODS = ['alegre', 'romántico', 'tranquilo', 'fiesta', 'melancólico', 'enérgico', 'elegante', 'tropical'];
var SONG_CATALOG = [
  { id: 'cancion-1', src: 'musica/cancion-1.mp3', title: 'Atardecer en la playa', artist: 'Sonidos del Mar', mood: 'tranquilo', tags: ['playa', 'mar', 'atardecer', 'calma', 'relax', 'vacaciones', 'puesta de sol'], colors: ['#f4a259', '#2a9d8f', '#e9c46a'] },
  { id: 'cancion-2', src: 'musica/cancion-2.mp3', title: 'Fiesta en la ciudad', artist: 'Los Nocturnos', mood: 'fiesta', tags: ['fiesta', 'noche', 'baile', 'celebración', 'amigos', 'discoteca', 'cumpleaños'], colors: ['#ff006e', '#8338ec', '#3a86ff'] },
  { id: 'cancion-3', src: 'musica/cancion-3.mp3', title: 'Corazón en la mano', artist: 'Valeria Luz', mood: 'romántico', tags: ['amor', 'boda', 'novio', 'novia', 'romántico', 'corazón', 'beso', 'aniversario'], colors: ['#ff5d8f', '#ffc2d1', '#ffb3c6'] },
  { id: 'cancion-4', src: 'musica/cancion-4.mp3', title: 'Amanecer alegre', artist: 'Sol Naciente', mood: 'alegre', tags: ['feliz', 'alegría', 'mañana', 'desayuno', 'risa', 'cumpleaños', 'sol'], colors: ['#ffd60a', '#ff9e00', '#ffee99'] },
  { id: 'cancion-5', src: 'musica/cancion-5.mp3', title: 'Lluvia en la ventana', artist: 'Nube Gris', mood: 'melancólico', tags: ['lluvia', 'triste', 'nostalgia', 'recuerdo', 'despedida', 'gris'], colors: ['#6c757d', '#adb5bd', '#495057'] },
  { id: 'cancion-6', src: 'musica/cancion-6.mp3', title: 'Corre conmigo', artist: 'Pulso Vivo', mood: 'enérgico', tags: ['deporte', 'gym', 'correr', 'entrenar', 'energía', 'motivación', 'ejercicio'], colors: ['#e63946', '#f77f00', '#fcbf49'] },
  { id: 'cancion-7', src: 'musica/cancion-7.mp3', title: 'Noche de gala', artist: 'Orquesta Serena', mood: 'elegante', tags: ['elegante', 'gala', 'boda', 'cena', 'lujo', 'clásico', 'vestido'], colors: ['#1d3557', '#457b9d', '#a8dadc'] },
  { id: 'cancion-8', src: 'musica/cancion-8.mp3', title: 'Ritmo del Caribe', artist: 'Brisa Tropical', mood: 'tropical', tags: ['tropical', 'caribe', 'playa', 'palmeras', 'verano', 'salsa', 'merengue'], colors: ['#06d6a0', '#118ab2', '#ffd166'] },
  { id: 'cancion-9', src: 'musica/cancion-9.mp3', title: 'Café de la mañana', artist: 'Dúo Aurora', mood: 'tranquilo', tags: ['café', 'mañana', 'lectura', 'libro', 'paz', 'hogar'], colors: ['#9c6644', '#ddb892', '#e6ccb2'] },
  { id: 'cancion-10', src: 'musica/cancion-10.mp3', title: 'Luces de neón', artist: 'Ciudad Eléctrica', mood: 'enérgico', tags: ['ciudad', 'noche', 'neón', 'auto', 'moto', 'urbano'], colors: ['#7209b7', '#f72585', '#4cc9f0'] },
  { id: 'cancion-11', src: 'musica/cancion-11.mp3', title: 'Jardín en primavera', artist: 'Flora Sonora', mood: 'alegre', tags: ['flores', 'jardín', 'primavera', 'naturaleza', 'campo', 'parque'], colors: ['#70e000', '#38b000', '#ccff33'] },
  { id: 'cancion-12', src: 'musica/cancion-12.mp3', title: 'Vals de medianoche', artist: 'Luna de Plata', mood: 'romántico', tags: ['noche', 'luna', 'vals', 'baile', 'cena romántica', 'estrellas'], colors: ['#3d405b', '#81b29a', '#e07a5f'] }
];
var MOOD_WORDS = {};
SONG_CATALOG.forEach(function (song) {
  if (!MOOD_WORDS[song.mood]) MOOD_WORDS[song.mood] = [];
  song.tags.forEach(function (t) { if (MOOD_WORDS[song.mood].indexOf(t) < 0) MOOD_WORDS[song.mood].push(t); });
});
function hexToHsl(hex) {
  var h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (h.length !== 6) return { h: 0, s: 0, l: 0.5 };
  var r = parseInt(h.slice(0, 2), 16) / 255, g = parseInt(h.slice(2, 4), 16) / 255, b = parseInt(h.slice(4, 6), 16) / 255;
  var max = Math.max(r, g, b), min = Math.min(r, g, b);
  var l = (max + min) / 2, s = 0, hue = 0;
  if (max !== min) {
    var d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) hue = ((b - r) / d + 2) * 60;
    else hue = ((r - g) / d + 4) * 60;
  }
  return { h: hue, s: s, l: l };
}
/* ---- colores de la app (v2.0) ----
   El modo blanco (modo claro) desaparece: en su lugar el color de la
   app se elige con toda la gama (tono, saturación y brillo) desde
   Ajustes. La base sigue oscura; el color elegido se aplica a toda la
   app con las variables --red/--red2/--red-dark/--acc-rgb (las pone
   app.js) y se guarda en state.settings.appColor. Son funciones puras
   (sin DOM) para poder probarlas en Node. */
var APP_COLOR_DEFAULT = '#e01430';
var APP_COLOR_PRESETS = [
  { id: 'rojo', name: 'Rojo WordRed', color: '#e01430' },
  { id: 'naranja', name: 'Naranja', color: '#f26a1b' },
  { id: 'ambar', name: 'Ámbar', color: '#e8a100' },
  { id: 'verde', name: 'Verde', color: '#2fbf71' },
  { id: 'turquesa', name: 'Turquesa', color: '#17a398' },
  { id: 'azul', name: 'Azul', color: '#2f7de1' },
  { id: 'morado', name: 'Morado', color: '#7a4fd0' },
  { id: 'rosa', name: 'Rosa', color: '#e14b8a' }
];
function normalizeHex(hex) {
  var h = String(hex || '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return '#' + h.toLowerCase();
}
function hexToRgb(hex) {
  var n = normalizeHex(hex);
  if (!n) return null;
  var v = parseInt(n.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
function rgbToHex(r, g, b) {
  function c(x) { x = Math.round(Number(x) || 0); return Math.max(0, Math.min(255, x)); }
  return '#' + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1);
}
function hslToHex(h, s, l) {
  h = (((Number(h) || 0) % 360) + 360) % 360 / 360;
  s = Math.max(0, Math.min(1, Number(s) || 0));
  l = Math.max(0, Math.min(1, Number(l) || 0));
  var c = (1 - Math.abs(2 * l - 1)) * s;
  var x = c * (1 - Math.abs(((h * 6) % 2) - 1));
  var m = l - c / 2, r = 0, g = 0, b = 0;
  var seg = Math.floor(h * 6);
  if (seg === 0) { r = c; g = x; } else if (seg === 1) { r = x; g = c; }
  else if (seg === 2) { g = c; b = x; } else if (seg === 3) { g = x; b = c; }
  else if (seg === 4) { r = x; b = c; } else { r = c; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
function relLuminance(hex) {
  var rgb = hexToRgb(hex);
  if (!rgb) return 0;
  function lin(v) { v = v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}
function contrastRatio(a, b) {
  var l1 = relLuminance(a), l2 = relLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
/* Del color elegido saca las variantes que usa la app, con contraste
   suficiente para que el texto se lea bien (WCAG, 4.5:1):
   - red: fondo de botones con texto blanco (se oscurece si hace falta).
   - red2: acento/texto sobre el fondo oscuro (se aclara si hace falta).
   - redDark: variante más oscura. rgb/rgb2 son "r,g,b" para los
     degradados rgba(). adjusted=true si hubo que corregir el color. */
/* Color del icono de like activado (v2.2): el color elegido en Ajustes; si no escogió otro color (sigue el rojo por
   defecto de la app), el rojo determinado de WordRed (#E60026). El
   color se toma del tema actual cada vez que se aplica, no se guarda
   fijo por like, así que al cambiar el color los likes ya dados
   también se ven con el color nuevo. Función pura para probarla. */
var LIKE_COLOR_DEFAULT = '#e60026';
function likeColorFor(hex) {
  var base = normalizeHex(hex) || APP_COLOR_DEFAULT;
  if (base === APP_COLOR_DEFAULT) return LIKE_COLOR_DEFAULT;
  return base;
}
function appColorVariants(hex) {
  var base = normalizeHex(hex) || APP_COLOR_DEFAULT;
  var hsl = hexToHsl(base);
  var red = base, l = hsl.l, guard = 0;
  while (contrastRatio(red, '#ffffff') < 4.5 && guard++ < 40) { l = Math.max(0, l - 0.03); red = hslToHex(hsl.h, hsl.s, l); }
  var red2 = base, l2 = hsl.l, guard2 = 0;
  while (contrastRatio(red2, '#120608') < 4.5 && guard2++ < 40) { l2 = Math.min(1, l2 + 0.03); red2 = hslToHex(hsl.h, hsl.s, l2); }
  var redDark = hslToHex(hsl.h, hsl.s, Math.max(0, hsl.l * 0.5));
  var rgb = hexToRgb(base), rgb2 = hexToRgb(red2);
  return {
    base: base, red: red, red2: red2, redDark: redDark,
    rgb: rgb.r + ',' + rgb.g + ',' + rgb.b,
    rgb2: rgb2.r + ',' + rgb2.g + ',' + rgb2.b,
    adjusted: red !== base || red2 !== base
  };
}
/* Analiza colores dominantes (hex) y el texto de la publicación.
   Devuelve { mood, warmth, brightness, saturation, matchedWords, reason }.
   Heurística en el dispositivo, no un servicio externo. */
function analyzeImagePalette(colors, caption) {
  var list = Array.isArray(colors) ? colors.filter(function (c) { return typeof c === 'string' && c.length > 0; }) : [];
  var captionLower = String(caption || '').toLowerCase();
  var warmth = 0.5, brightness = 0.5, saturation = 0.5, warmCount = 0, greenCount = 0, pinkCount = 0;
  if (list.length) {
    var wSum = 0, lSum = 0, sSum = 0;
    list.forEach(function (c) {
      var hsl = hexToHsl(c);
      var warm = (hsl.h <= 60 || hsl.h >= 330) ? 1 : (hsl.h >= 200 && hsl.h <= 300 ? 0 : 0.5);
      wSum += warm; lSum += hsl.l; sSum += hsl.s;
      if (warm) warmCount++;
      if (hsl.h >= 60 && hsl.h < 200) greenCount++;
      if ((hsl.h >= 330 || hsl.h <= 15) && hsl.s > 0.4) pinkCount++;
    });
    warmth = wSum / list.length; brightness = lSum / list.length; saturation = sSum / list.length;
  }
  var scores = {};
  SONG_MOODS.forEach(function (m) { scores[m] = 0; });
  scores['alegre'] = warmth * 0.6 + brightness * 0.4;
  scores['romántico'] = warmth * 0.5 + (1 - brightness) * 0.3 + (pinkCount > 0 ? 0.4 : 0);
  scores['tranquilo'] = (1 - saturation) * 0.4 + brightness * 0.3 + (1 - warmth) * 0.2;
  scores['fiesta'] = saturation * 0.5 + (1 - brightness) * 0.3;
  scores['melancólico'] = (1 - brightness) * 0.6 + (1 - saturation) * 0.2 + (1 - warmth) * 0.2;
  scores['enérgico'] = saturation * 0.4 + brightness * 0.3 + warmth * 0.3;
  scores['elegante'] = (1 - brightness) * 0.5 + (1 - saturation) * 0.3;
  scores['tropical'] = (greenCount > 0 ? 0.5 : 0) + brightness * 0.3 + saturation * 0.2;
  var matchedWords = [];
  SONG_MOODS.forEach(function (m) {
    (MOOD_WORDS[m] || []).forEach(function (w) {
      if (captionLower.indexOf(w) >= 0 && matchedWords.indexOf(w) < 0) {
        matchedWords.push(w);
        scores[m] += 1.5;
      }
    });
  });
  var best = 'tranquilo', bestScore = -1;
  SONG_MOODS.forEach(function (m) { if (scores[m] > bestScore) { bestScore = scores[m]; best = m; } });
  var reason = 'Colores ' + (warmth >= 0.6 ? 'cálidos' : warmth <= 0.4 ? 'fríos' : 'mixtos') +
    ' y ' + (brightness >= 0.6 ? 'brillantes' : brightness <= 0.4 ? 'oscuros' : 'de brillo medio') +
    (matchedWords.length ? ' + las palabras: ' + matchedWords.join(', ') : '');
  return { mood: best, warmth: warmth, brightness: brightness, saturation: saturation, matchedWords: matchedWords, scores: scores, reason: reason };
}
function findSongById(id) {
  for (var i = 0; i < SONG_CATALOG.length; i++) if (SONG_CATALOG[i].id === id) return SONG_CATALOG[i];
  return null;
}
function songFromCatalog(id) {
  var s = findSongById(id);
  if (!s) return null;
  return { id: s.id, title: s.title, artist: s.artist, src: s.src || '', mood: s.mood, auto: false };
}
/* v1.5.12: una canción solo tiene audio real si trae su archivo (src).
   1.5.34: el catálogo YA trae audio real: cada canción tiene su archivo
   en musica/ (Kevin MacLeod, incompetech.com, licencia CC-BY), por
   eso la música automática por fin se escucha. 1.5.35: en la 1.5.34 la
   ruta llevaba un prefijo 'assets/' de más y el archivo NO existía ahí
   (la página carga desde file:///android_asset/index.html, así que esa
   ruta resolvía a un 'assets/' dentro de otro 'assets/'), por eso el
   botón se podía presionar pero no se escuchaba nada. Solo suena audio
   real (del catálogo, subido o elegido): nada de tonos generados. */
function songHasAudio(song) {
  if (!song || typeof song !== 'object') return false;
  var src = String(song.src || '').trim();
  return src.length > 0;
}
/* v1.5.12: recordatorio de Shorts cada 3 horas, solo si la app no se ha
   abierto en ese tiempo. Es la regla que aplica el receptor nativo
   (WordRedNotifyReceiver) al disparar la alarma; aquí vive para poder
   probarla: 4 horas sin abrir -> avisa; 1 hora -> no avisa; sin sesión
   -> no avisa. */
var SHORTS_REMINDER_MS = 3 * 60 * 60 * 1000;
function shortsReminderDue(lastOpenMs, nowMs, hasSession) {
  if (!hasSession) return false;
  if (!lastOpenMs || !nowMs) return false;
  return (nowMs - lastOpenMs) >= SHORTS_REMINDER_MS;
}
function validateSong(song) {
  if (!song || typeof song !== 'object') return null;
  var title = String(song.title || '').trim().slice(0, 100);
  if (!title) return null;
  return {
    id: String(song.id || '').slice(0, 40),
    title: title, artist: String(song.artist || '').slice(0, 100),
    src: String(song.src || '').slice(0, 2000),
    mood: String(song.mood || '').slice(0, 30),
    auto: !!song.auto
  };
}
function suggestSongForImage(colors, caption) {
  var analysis = analyzeImagePalette(colors, caption);
  var song = null;
  for (var i = 0; i < SONG_CATALOG.length; i++) if (SONG_CATALOG[i].mood === analysis.mood) { song = SONG_CATALOG[i]; break; }
  if (!song) song = SONG_CATALOG[0];
  return { song: songFromCatalog(song.id), analysis: analysis };
}
/* Audio automático para videos (ola 9): el ambiente sale del análisis y
   la duración: videos cortos prefieren ambientes alegres/enérgicos. */
function suggestSongForVideo(durationMs, colors, caption) {
  var analysis = analyzeImagePalette(colors, caption);
  var dur = parseInt(durationMs, 10) || 0;
  if (dur > 0 && dur < 15000 && (analysis.mood === 'tranquilo' || analysis.mood === 'melancólico' || analysis.mood === 'elegante')) {
    analysis.mood = 'alegre';
    analysis.reason += ' + video corto (menos de 15 s), ambiente alegre';
  }
  var song = null;
  for (var i = 0; i < SONG_CATALOG.length; i++) if (SONG_CATALOG[i].mood === analysis.mood) { song = SONG_CATALOG[i]; break; }
  if (!song) song = SONG_CATALOG[0];
  var out = songFromCatalog(song.id);
  out.auto = true;
  return { song: out, analysis: analysis };
}
/* Anuncio de empresa (ola 8): una publicación de página marcada como
   anuncio, con título, enlace y canción de marca. */
function createAd(state, author, pageId, ad) {
  author = normPhone(author);
  var pg = state.pages.filter(function (x) { return x.id === pageId; })[0];
  if (!pg) return { ok: false, error: 'Esa página no existe.' };
  if (pg.creator !== author) return { ok: false, error: 'Solo quien creó la página publica anuncios de su empresa.' };
  var title = String((ad && ad.title) || '').trim();
  if (title.length < 3) return { ok: false, error: 'El anuncio necesita un título.' };
  var r = createPost(state, author, {
    text: (ad && ad.text) || '', media: (ad && ad.media) || '', mediaType: (ad && ad.mediaType) || '',
    mediaList: (ad && ad.mediaList) || null, pageId: pageId, privacy: 'Público',
    isAd: true, adTitle: title, adLink: String((ad && ad.link) || ''), song: validateSong(ad && ad.song)
  });
  return r;
}
function attachSongToPost(state, phone, postId, song) {
  phone = normPhone(phone);
  var post = null;
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === postId) { post = state.posts[i]; break; }
  if (!post) return { ok: false, error: 'Esa publicación ya no existe.' };
  if (post.author !== phone) return { ok: false, error: 'Solo quien publicó puede cambiarle la canción.' };
  var s = validateSong(song);
  if (!s) return { ok: false, error: 'Esa canción no es válida.' };
  post.song = s;
  return { ok: true, post: post };
}
function removeSongFromPost(state, phone, postId) {
  phone = normPhone(phone);
  var post = null;
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === postId) { post = state.posts[i]; break; }
  if (!post) return { ok: false, error: 'Esa publicación ya no existe.' };
  if (post.author !== phone) return { ok: false, error: 'Solo quien publicó puede quitarle la canción.' };
  post.song = null;
  return { ok: true, post: post };
}

function createPost(state, author, data) {
  author = normPhone(author);
  if (!state.profiles[author]) return { ok: false, error: 'Primero crea tu perfil.' };
  var text = String((data && data.text) || '').trim();
  var media = (data && data.media) || '';
  var link = (data && data.link) || null;
  /* v1.2: varias fotos/videos en una sola publicación. */
  var mediaList = null;
  if (data && Array.isArray(data.mediaList) && data.mediaList.length) {
    mediaList = [];
    for (var mi = 0; mi < data.mediaList.length; mi++) { /* ola 11: sin límite de fotos/videos por publicación */
      var m = data.mediaList[mi];
      var src = m && (m.src || m);
      var mtype = m && m.type ? m.type : (m && m.mediaType ? m.mediaType : '');
      /* v1.5.7: la carátula del video (un fotograma) viaja con el medio. */
      var mthumb = m && m.thumb ? String(m.thumb).slice(0, 200000) : '';
      /* 1.5.55: la orientación del video viaja con el medio (el servidor
         guarda mediaList tal cual, así otros teléfonos ya saben si el
         reel es vertical sin medirlo). */
      var morient = (m && (m.orientation === 'vertical' || m.orientation === 'horizontal')) ? m.orientation : '';
      if (typeof src === 'string' && src.length > 0) mediaList.push({ src: src, type: mtype, thumb: mthumb, videoEdits: m && m.videoEdits ? validateVideoEdits(m.videoEdits) : null, orientation: morient });
    }
    if (mediaList.length && !media) { media = mediaList[0].src; data = Object.assign({}, data, { mediaType: mediaList[0].type }); }
  }
  /* v1.2: fondo de color (solo para publicaciones de solo texto). */
  var bg = String((data && data.bg) || 'none');
  if (POST_BACKGROUNDS.map(function (b) { return b.id; }).indexOf(bg) < 0) bg = 'none';
  if (media || link || (data && data.poll)) bg = 'none';
  /* v1.2: sentimiento o actividad. */
  var feeling = null;
  if (data && data.feeling) {
    var fkind = data.feeling.kind === 'activity' ? 'activity' : 'feeling';
    var ftext = String(data.feeling.text || '').trim().slice(0, 60);
    if (ftext) feeling = { kind: fkind, text: ftext };
  }
  /* v1.2: etiquetar amigos. */
  var tags = [];
  if (data && Array.isArray(data.tags)) {
    data.tags.forEach(function (t) {
      var tp = normPhone(t);
      if (tp && tp !== author && state.profiles[tp] && tags.indexOf(tp) < 0 && tags.length < 10) tags.push(tp);
    });
  }
  /* v1.2: ubicación. */
  var location = String((data && data.location) || '').trim().slice(0, 120);
  if (link) {
    var ln = normalizeLink(link.url || link);
    if (!ln.ok) return { ok: false, error: ln.error };
    link = {
      url: ln.url, host: ln.host,
      title: String((link && link.title) || ln.host).slice(0, 200),
      desc: String((link && link.desc) || '').slice(0, 300),
      image: String((link && link.image) || '')
    };
  }
  if (!text && !media && !link && !(data && data.sharedFrom) && !(data && data.poll) && !(data && data.photoPoll)) return { ok: false, error: 'Escribe algo, agrega una foto o video, o pega un enlace.' };
  if (mediaList && !mediaList.length) return { ok: false, error: 'Las fotos o videos no se pudieron leer.' };
  if (text.length > 2000) return { ok: false, error: 'La publicación es demasiado larga (máx. 2000 caracteres).' };
  var privacy = (data && data.privacy) || 'Público';
  if (['Público', 'Amigos', 'Solo yo'].indexOf(privacy) < 0) privacy = 'Público';
  var groupId = (data && data.groupId) || null;
  if (groupId) {
    var g = state.groups.filter(function (x) { return x.id === groupId; })[0];
    if (!g) return { ok: false, error: 'Ese grupo no existe.' };
    if (g.members.indexOf(author) < 0) return { ok: false, error: 'Tienes que ser miembro del grupo para publicar en él.' };
    privacy = 'Público';
  }
  var pageId = (data && data.pageId) || null;
  if (pageId) {
    var pg = state.pages.filter(function (x) { return x.id === pageId; })[0];
    if (!pg) return { ok: false, error: 'Esa página no existe.' };
    if (pg.creator !== author) return { ok: false, error: 'Solo quien creó la página puede publicar en ella.' };
    privacy = 'Público';
  }
  /* v1.5.26: estado de ánimo (22), encuesta con foto (26), reto (8) y dueto (3). */
  var mood = validateMood(data && data.mood);
  var photoPoll = validatePhotoPoll(data && data.photoPoll);
  if (data && data.photoPoll && !photoPoll) return { ok: false, error: 'La encuesta con foto necesita 2 fotos válidas.' };
  var challenge = normalizeChallengeTag(data && data.challenge);
  var duetOf = null;
  if (data && data.duetOf) {
    var orig = null;
    for (var di = 0; di < state.posts.length; di++) if (state.posts[di].id === data.duetOf.postId) { orig = state.posts[di]; break; }
    if (!orig) return { ok: false, error: 'La publicación original del dueto ya no existe.' };
    duetOf = { postId: orig.id, author: orig.author };
  }
  var poll = null;
  if (data && data.poll) {
    var pq = String(data.poll.question || '').trim();
    var popts = (data.poll.options || []).map(function (o) { return String(o || '').trim(); }).filter(function (t) { return t.length > 0; });
    if (!pq) return { ok: false, error: 'La encuesta necesita una pregunta.' };
    if (popts.length < 2) return { ok: false, error: 'La encuesta necesita al menos 2 opciones.' };
    if (popts.length > 6) return { ok: false, error: 'La encuesta admite hasta 6 opciones.' };
    poll = { question: pq.slice(0, 200), options: popts.slice(0, 6).map(function (t) { return { id: uid('opt'), text: t.slice(0, 80), votes: [] }; }) };
  }
  /* 1.5.55: orientación del video principal (la fila de reels del Inicio
     solo muestra verticales). */
  var videoOrientation1555 = '';
  if (mediaList) for (var oi = 0; oi < mediaList.length; oi++) { if (mediaList[oi] && mediaList[oi].type === 'video' && mediaList[oi].orientation) { videoOrientation1555 = mediaList[oi].orientation; break; } }
  var post = {
    id: uid('post'), author: author, text: text,
    media: media, mediaType: (data && data.mediaType) || '',
    mediaList: mediaList,
    /* v1.5.7: carátula del video principal (un fotograma), para que el
       video no se vea en negro sin imagen en el inicio y en el perfil. */
    videoThumb: (mediaList && mediaList[0] && mediaList[0].thumb) || String((data && data.videoThumb) || ''),
    videoOrientation: videoOrientation1555,
    bg: bg, feeling: feeling, tags: tags, location: location,
    link: link, pageId: pageId, poll: poll,
    audioTitle: String((data && data.audioTitle) || '').slice(0, 100),
    audioCover: String((data && data.audioCover) || '').slice(0, 2000),
    song: validateSong(data && data.song),
    videoEdits: validateVideoEdits(data && data.videoEdits),
    isAd: !!(data && data.isAd && pageId),
    adTitle: String((data && data.adTitle) || '').slice(0, 100),
    adLink: String((data && data.adLink) || '').slice(0, 500),
    privacy: privacy, groupId: groupId,
    mood: mood, photoPoll: photoPoll, challenge: challenge || '',
    duetOf: duetOf,
    sharedFrom: (data && data.sharedFrom) || null,
    liveId: (data && data.liveId) || null, // aviso de un live (v1.5): tocarlo entra al live
    /* v2.1: la grabación de un live como publicación en el inicio: el
       video del live grabado, con me gusta, comentarios y compartir
       como cualquier publicación. */
    isLiveRecording: !!(data && data.isLiveRecording),
    liveRecordingId: (data && data.liveRecordingId) || null,
    liveRecDurationMs: Math.max(0, parseInt((data && data.liveRecDurationMs) || 0, 10) || 0),
    place: validatePlace(data && data.place), // recomendación de lugar (v1.6)
    createdAt: now(), likes: {}, comments: [], shares: [], savedBy: [],
    editCount: 0, editedAt: null, edited: false,
    isDemo: !!(data && data.isDemo),
    /* 1.5.58: publicación atómica — nace como «Subiendo…» (pendingSync)
       y solo se da por publicada cuando el servidor la confirma. Mientras
       no esté confirmada no se poda jamás (ver pruneDeletedPostIds) y el
       muro la muestra con su estado, no como publicada. */
    pendingSync: !!(data && data.pendingSync),
    syncFailed: false, syncError: ''
  };
  state.posts.unshift(post);
  /* v1.2: avisar a las personas etiquetadas. */
  tags.forEach(function (tp) {
    notify(state, { type: 'tag', from: author, to: tp, text: 'te etiquetó en una publicación', refId: post.id });
  });
  return { ok: true, post: post };
}
/* v2.1: la publicación que se creó a partir de una grabación de live
   (para no publicar la misma grabación dos veces). */
function findLiveRecordingPost(state, recId) {
  if (!recId) return null;
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].liveRecordingId === recId) return state.posts[i];
  return null;
}

/* ---- editor de video (v1.2, ola 11) ----
   Antes de subir un video se puede editar: stickers/emoji, subtítulos
   (textos sobre el video con inicio y fin), música (elegir canción o la
   automática si se escoge) y recortar (inicio y fin). Lo publicado es el
   video ya editado: los adornos y el recorte viajan con él. */
function clampPct(n) { return Math.max(0, Math.min(100, parseInt(n, 10) || 0)); }
function validateVideoEdits(edits) {
  var out = { stickers: [], subtitles: [], song: null, trimStart: 0, trimEnd: null, durationMs: 0 };
  if (!edits) return out;
  if (Array.isArray(edits.stickers)) {
    edits.stickers.forEach(function (k) {
      if (!k || !String(k.emoji || '').trim()) return;
      out.stickers.push({
        emoji: String(k.emoji).slice(0, 8),
        size: Math.max(20, Math.min(120, parseInt(k.size, 10) || 48)),
        x: clampPct(k.x), y: clampPct(k.y)
      });
    });
  }
  if (Array.isArray(edits.subtitles)) {
    edits.subtitles.forEach(function (t) {
      if (!t || !String(t.text || '').trim()) return;
      var start = Math.max(0, parseInt(t.start, 10) || 0);
      var end = Math.max(start, parseInt(t.end, 10) || 0);
      out.subtitles.push({
        text: String(t.text).slice(0, 120),
        start: start, end: end,
        color: String(t.color || '#ffffff').slice(0, 20),
        size: Math.max(14, Math.min(48, parseInt(t.size, 10) || 20)),
        x: clampPct(t.x === undefined ? 50 : t.x), y: clampPct(t.y === undefined ? 85 : t.y)
      });
    });
  }
  out.song = validateSong(edits.song);
  var dur = Math.max(0, parseInt(edits.durationMs, 10) || 0);
  out.durationMs = dur;
  var ts = Math.max(0, parseInt(edits.trimStart, 10) || 0);
  var te = edits.trimEnd === null || edits.trimEnd === undefined ? null : Math.max(0, parseInt(edits.trimEnd, 10) || 0);
  if (dur > 0) {
    ts = Math.min(ts, dur);
    if (te !== null) te = Math.min(te, dur);
  }
  if (te !== null && te <= ts) te = null;
  out.trimStart = ts;
  out.trimEnd = te;
  return out;
}
function hasVideoEdits(edits) {
  if (!edits) return false;
  return (edits.stickers && edits.stickers.length > 0) || (edits.subtitles && edits.subtitles.length > 0) || !!edits.song || (edits.trimStart > 0) || (edits.trimEnd !== null && edits.trimEnd !== undefined);
}

/* ---- modificar publicaciones (v1.2, ola 10) ----
   Cualquier publicación se puede modificar después de publicada, en
   todas sus formas (texto, foto, video, audio, enlace, encuesta, imagen
   con canción...). Máximo 5 veces por publicación: se muestra cuántas
   quedan y al llegar a 5 la edición se bloquea. Las editadas muestran
   la etiqueta "Editado" y la fecha/hora actualizada. */
var MAX_POST_EDITS = 5;
function editsLeft(post) {
  if (!post) return 0;
  return Math.max(0, MAX_POST_EDITS - (post.editCount || 0));
}
/* ---- lugares recomendados (v1.6) ----
   Una recomendación es una publicación con lugar: nombre, tipo,
   dirección, foto, enlace real al mapa, calificación (1–5) y comentario.
   Nunca se inventan lugares: solo se publican los que comparte alguien
   (desde su perfil o desde otra app con su enlace real). */
var PLACE_TYPES = ['Comida', 'Tienda', 'Punto de venta', 'Servicios', 'Entretenimiento', 'Otro'];
function validatePlace(place) {
  if (!place) return null;
  /* v1.5.26 idea 25: "Estoy aquí" es un lugar con coordenadas, sin tipo
     ni calificación: se guarda tal cual (name, lat, lng). */
  if (place.lat !== undefined || place.lng !== undefined) return validateGeoPlace(place);
  var name = String(place.name || '').trim();
  var type = String(place.type || '').trim();
  if (name.length < 2 || name.length > 100) return null;
  if (PLACE_TYPES.indexOf(type) < 0) return null;
  var url = String(place.url || '').trim();
  if (url) {
    var ln = normalizeLink(url);
    if (!ln.ok) return null;
    url = ln.url;
  }
  var rating = place.rating === null || place.rating === undefined || place.rating === '' ? null : Number(place.rating);
  if (rating !== null && (!isFinite(rating) || Math.floor(rating) !== rating || rating < 1 || rating > 5)) return null;
  return {
    name: name, type: type,
    address: String(place.address || '').trim().slice(0, 200),
    photo: String(place.photo || '').slice(0, 2000),
    url: url, rating: rating,
    comment: String(place.comment || '').trim().slice(0, 500)
  };
}
function createPlacePost(state, author, data) {
  author = normPhone(author);
  if (!state.profiles[author]) return { ok: false, error: 'Primero crea tu perfil.' };
  var place = validatePlace(data);
  if (!place) return { ok: false, error: 'Escribe el nombre del lugar y elige un tipo válido.' };
  return createPost(state, author, {
    text: place.comment || ('Recomiendo este lugar: ' + place.name),
    privacy: 'Público', place: place
  });
}
function editPost(state, phone, postId, data) {
  phone = normPhone(phone);
  var post = null;
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === postId) { post = state.posts[i]; break; }
  if (!post) return { ok: false, error: 'Esa publicación ya no existe.' };
  if (post.author !== phone) return { ok: false, error: 'Solo quien publicó puede modificarla.' };
  if ((post.editCount || 0) >= MAX_POST_EDITS) return { ok: false, error: 'Esta publicación ya se editó 5 veces (el máximo). Ya no se puede modificar.' };
  if (data && data.text !== undefined) {
    var text = String(data.text || '').trim();
    if (text.length > 2000) return { ok: false, error: 'La publicación es demasiado larga (máx. 2000 caracteres).' };
    post.text = text;
  }
  if (data && data.media !== undefined) post.media = data.media || '';
  if (data && data.mediaType !== undefined) post.mediaType = data.mediaType || '';
  if (data && Array.isArray(data.mediaList)) {
    var ml = [];
    data.mediaList.forEach(function (m) { /* ola 11: sin límite al modificar */
      var src = m && (m.src || m);
      var mtype = m && m.type ? m.type : (m && m.mediaType ? m.mediaType : '');
      /* v1.5.7: la carátula del video se conserva al modificar. */
      if (typeof src === 'string' && src.length > 0) ml.push({ src: src, type: mtype, thumb: m && m.thumb ? String(m.thumb).slice(0, 200000) : '' });
    });
    post.mediaList = ml.length ? ml : null;
    post.videoThumb = (ml[0] && ml[0].thumb) || '';
    if (ml.length && !post.media) { post.media = ml[0].src; post.mediaType = ml[0].type; }
    if (!ml.length && !post.media) post.media = '';
  }
  if (data && data.bg !== undefined) {
    var bg = String(data.bg || 'none');
    if (POST_BACKGROUNDS.map(function (b) { return b.id; }).indexOf(bg) < 0) bg = 'none';
    if (post.media || post.link || post.poll) bg = 'none';
    post.bg = bg;
  }
  if (data && data.feeling !== undefined) {
    if (!data.feeling) post.feeling = null;
    else {
      var fkind = data.feeling.kind === 'activity' ? 'activity' : 'feeling';
      var ftext = String(data.feeling.text || '').trim().slice(0, 60);
      post.feeling = ftext ? { kind: fkind, text: ftext } : null;
    }
  }
  if (data && Array.isArray(data.tags)) {
    var tags = [];
    data.tags.forEach(function (t) {
      var tp = normPhone(t);
      if (tp && tp !== phone && state.profiles[tp] && tags.indexOf(tp) < 0 && tags.length < 10) tags.push(tp);
    });
    post.tags = tags;
  }
  if (data && data.location !== undefined) post.location = String(data.location || '').trim().slice(0, 120);
  if (data && data.link !== undefined) {
    if (!data.link) post.link = null;
    else {
      var ln = normalizeLink(data.link.url || data.link);
      if (!ln.ok) return { ok: false, error: ln.error };
      post.link = { url: ln.url, host: ln.host, title: String((data.link && data.link.title) || ln.host).slice(0, 200), desc: String((data.link && data.link.desc) || '').slice(0, 300), image: String((data.link && data.link.image) || '') };
    }
  }
  if (data && data.poll !== undefined) {
    if (data.poll) {
      var totalVotes = (post.poll ? post.poll.options.reduce(function (n, o) { return n + (o.votes || []).length; }, 0) : 0);
      if (totalVotes > 0) return { ok: false, error: 'La encuesta ya tiene votos y no se puede cambiar.' };
      var pq = String(data.poll.question || '').trim();
      var popts = (data.poll.options || []).map(function (o) { return String(o || '').trim(); }).filter(function (t) { return t.length > 0; });
      if (!pq) return { ok: false, error: 'La encuesta necesita una pregunta.' };
      if (popts.length < 2) return { ok: false, error: 'La encuesta necesita al menos 2 opciones.' };
      post.poll = { question: pq.slice(0, 200), options: popts.slice(0, 6).map(function (t) { return { id: uid('opt'), text: t.slice(0, 80), votes: [] }; }) };
    } else post.poll = null;
  }
  if (data && data.audioTitle !== undefined) post.audioTitle = String(data.audioTitle || '').slice(0, 100);
  if (data && data.audioCover !== undefined) post.audioCover = String(data.audioCover || '').slice(0, 2000);
  if (data && data.song !== undefined) post.song = validateSong(data.song);
  if (data && data.videoEdits !== undefined) post.videoEdits = validateVideoEdits(data.videoEdits);
  if (!post.text && !post.media && !post.link && !post.sharedFrom && !post.poll) return { ok: false, error: 'La publicación no puede quedar vacía.' };
  post.editCount = (post.editCount || 0) + 1;
  post.editedAt = now();
  post.edited = true;
  return { ok: true, post: post, editsLeft: editsLeft(post) };
}

function deletePost(state, phone, postId) {
  phone = normPhone(phone);
  var i = -1;
  for (var k = 0; k < state.posts.length; k++) if (state.posts[k].id === postId) { i = k; break; }
  if (i < 0) return { ok: false, error: 'Esa publicación ya no existe.' };
  if (state.posts[i].author !== phone) {
    var gDel = state.posts[i].groupId ? findGroup(state, state.posts[i].groupId) : null;
    if (!gDel || !canManageGroup(state, phone, gDel.id)) return { ok: false, error: 'Solo la persona que publicó puede borrarla.' };
  }
  state.posts.splice(i, 1);
  return { ok: true };
}

/* v1.5.14: lápidas de borrado. Cuando yo borro una publicación, su id
   queda anotado aquí (persiste con el estado): al sincronizar, el inicio
   del servidor nunca la vuelve a meter aunque el servidor todavía la
   tenga (por ejemplo, si su escritura falló), y la poda la quita aunque
   sea más vieja que el corte de 100 del inicio. Al restaurar un borrado
   que el servidor no confirmó, la lápida se quita. Como mucho 500. */
var MAX_DELETED_TOMBSTONES = 500;
function ensureDeletedTombstones(state) {
  if (!state) return [];
  if (!Array.isArray(state.deletedPostIds)) state.deletedPostIds = [];
  return state.deletedPostIds;
}
function markPostDeleted(state, postId) {
  if (!state || !postId) return;
  var list = ensureDeletedTombstones(state);
  if (list.indexOf(postId) < 0) list.push(postId);
  if (list.length > MAX_DELETED_TOMBSTONES) state.deletedPostIds = list.slice(-MAX_DELETED_TOMBSTONES);
}
function unmarkPostDeleted(state, postId) {
  if (!state || !postId) return;
  var list = ensureDeletedTombstones(state);
  var i = list.indexOf(postId);
  if (i >= 0) list.splice(i, 1);
}
function isPostDeleted(state, postId) {
  if (!state || !postId) return false;
  return ensureDeletedTombstones(state).indexOf(postId) >= 0;
}
/* v1.5.15: lápidas genéricas "tipo:id" para TODO lo borrable (historia,
   comentario, mensaje, conversación, grupo, anuncio, grupo de ventas).
   El borrado es el mismo patrón que las publicaciones: al presionar
   borrar se oculta al instante, la lápida queda guardada (save()) y la
   sincronización nunca vuelve a meter ese elemento. Como mucho 500. */
function ensureDeletedItems(state) {
  if (!state) return [];
  if (!Array.isArray(state.deletedItemIds)) state.deletedItemIds = [];
  return state.deletedItemIds;
}
function itemTombstoneKey(kind, id) { return String(kind || '') + ':' + String(id || ''); }
function markItemDeleted(state, kind, id) {
  if (!state || !kind || !id) return;
  var list = ensureDeletedItems(state);
  var key = itemTombstoneKey(kind, id);
  if (list.indexOf(key) < 0) list.push(key);
  if (list.length > MAX_DELETED_TOMBSTONES) state.deletedItemIds = list.slice(-MAX_DELETED_TOMBSTONES);
}
function unmarkItemDeleted(state, kind, id) {
  if (!state || !kind || !id) return;
  var list = ensureDeletedItems(state);
  var i = list.indexOf(itemTombstoneKey(kind, id));
  if (i >= 0) list.splice(i, 1);
}
function isItemDeleted(state, kind, id) {
  if (!state || !kind || !id) return false;
  return ensureDeletedItems(state).indexOf(itemTombstoneKey(kind, id)) >= 0;
}
/* v1.5.14: ¿puedo borrar esta publicación? (sin tocar nada: solo el
   autor, o un administrador del grupo si es de un grupo). El servidor
   vuelve a comprobarlo y devuelve 403 si no se puede. */
function canDeletePost(state, phone, postId) {
  phone = normPhone(phone);
  var post = null;
  for (var k = 0; k < state.posts.length; k++) if (state.posts[k].id === postId) { post = state.posts[k]; break; }
  if (!post) return { ok: true, missing: true };
  if (post.author === phone) return { ok: true };
  var g = post.groupId ? findGroup(state, post.groupId) : null;
  if (g && canManageGroup(state, phone, g.id)) return { ok: true };
  return { ok: false, error: 'Solo la persona que publicó puede borrarla.' };
}

/* v1.5.14: enlaces dentro del texto de una publicación. El enlace crudo
   NO se muestra: se sustituye por una tarjeta (recuadro) con el título
   de la página y el dominio. Solo http(s); sin inventar nada. */
var URL_IN_TEXT_RE = /https?:\/\/[^\s<>"']+/gi;
/* v1.5.15: clave de un enlace para comparar si dos URLs son "el mismo
   enlace": minúsculas en esquema y dominio, sin www., sin barra final,
   sin fragmento y sin parámetros de seguimiento (utm_*, fbclid, gclid...).
   Dos enlaces que solo difieren en eso son el mismo y dibujan UNA sola
   tarjeta (en la captura, un link de TikTok salía dos veces
   porque el texto traía el mismo enlace con distinto seguimiento). */
function normalizeUrlKey(url) {
  try {
    var u = String(url || '').trim();
    if (!/^https?:\/\//i.test(u)) return u.toLowerCase();
    var parsed = null;
    try { parsed = new URL(u); } catch (e) { parsed = null; }
    if (!parsed) return u.toLowerCase().replace(/\/+$/, '');
    var host = String(parsed.hostname || '').toLowerCase().replace(/^www\./, '');
    var path = String(parsed.pathname || '').replace(/\/+$/, '') || '/';
    var params = [];
    try {
      parsed.searchParams.forEach(function (v, k) {
        var key = String(k || '').toLowerCase();
        if (key.indexOf('utm_') === 0 || key === 'fbclid' || key === 'gclid' || key === 'gclsrc' || key === 'igshid' || key === 'mc_cid' || key === 'mc_eid' || key === '_r' || key === '_t') return;
        params.push(key + '=' + v);
      });
    } catch (e) {}
    params.sort();
    return parsed.protocol.toLowerCase() + '//' + host + path + (params.length ? '?' + params.join('&') : '');
  } catch (e) { return String(url || '').toLowerCase(); }
}
function extractUrls(text) {
  var out = [];
  var seen = {};
  String(text || '').replace(URL_IN_TEXT_RE, function (u) {
    var clean = u.replace(/[),.;:!?]+$/, '');
    if (!clean) return u;
    var key = normalizeUrlKey(clean);
    if (seen[key]) return u;
    seen[key] = true;
    out.push(clean);
    return u;
  });
  return out;
}
function linkHost(url) {
  var m = String(url || '').match(/^https?:\/\/([^\/:?#]+)/i);
  var host = m ? m[1] : '';
  return host.replace(/^www\./i, '');
}
function stripUrls(text) {
  var out = String(text || '').replace(URL_IN_TEXT_RE, ' ');
  out = out.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n');
  return out.replace(/^[ \t\n]+/, '').replace(/[ \t\n]+$/, '');
}
/* Título de una página a partir de su HTML (lo que trae <title>): se
   limpia y se acorta; sin <title> válido, null (la tarjeta muestra el
   dominio). Nunca lanza. */
function extractPageTitle(html) {
  try {
    var m = String(html || '').match(/<title[^>]*>([\s\S]{1,200}?)<\/title\s*>/i);
    if (!m) return null;
    var t = m[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    return t.length > 90 ? t.slice(0, 87) + '…' : t;
  } catch (e) { return null; }
}
/* v1.5.15: imagen de una página a partir de su HTML (og:image, si no
   twitter:image, si no link rel="image_src"). Las URLs relativas se
   resuelven contra la URL de la página. Sin imagen válida, '' (la
   tarjeta se queda con dominio + título). Nunca lanza. */
function extractPageImage(html, pageUrl) {
  try {
    var src = String(html || '');
    var decode = function (s) {
      return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
    };
    var pick = function (re) {
      var m = src.match(re);
      return m ? decode(m[1]) : '';
    };
    var img = pick(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]*content=["']([^"']+)["']/i)
      || pick(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image(?::secure_url)?["']/i)
      || pick(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]*content=["']([^"']+)["']/i)
      || pick(/<meta[^>]+content=["']([^"']+)["'][^>]*name=["']twitter:image(?::src)?["']/i)
      || pick(/<link[^>]+rel=["']image_src["'][^>]*href=["']([^"']+)["']/i);
    if (!img) return '';
    if (/^https?:\/\//i.test(img)) return img;
    if (pageUrl && typeof URL !== 'undefined') {
      try { var abs = new URL(img, pageUrl).href; return /^https?:\/\//i.test(abs) ? abs : ''; } catch (e) { return ''; }
    }
    return '';
  } catch (e) { return ''; }
}

function toggleLike(state, phone, postId, reaction) {
  phone = normPhone(phone);
  var gv = requireVerified(state, phone); if (gv) return gv;
  var post = null;
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === postId) { post = state.posts[i]; break; }
  if (!post) return { ok: false, error: 'Esa publicación ya no existe.' };
  if (!canSeePost(state, phone, post)) return { ok: false, error: 'No puedes ver esa publicación.' };
  reaction = reaction || 'Me gusta';
  if (REACTIONS.indexOf(reaction) < 0) reaction = 'Me gusta';
  var had = post.likes[phone];
  if (had === reaction) { delete post.likes[phone]; return { ok: true, liked: false, counts: likeCounts(post) }; }
  post.likes[phone] = reaction;
  if (post.author !== phone) {
    notify(state, { type: 'like', from: phone, to: post.author, text: 'reaccionó a tu publicación: ' + reaction, refId: post.id });
  }
  return { ok: true, liked: true, reaction: reaction, counts: likeCounts(post) };
}

function likeCounts(post) {
  var counts = {};
  var total = 0;
  for (var p in post.likes) { counts[post.likes[p]] = (counts[post.likes[p]] || 0) + 1; total++; }
  return { total: total, byReaction: counts };
}

function addComment(state, phone, postId, text, parentId, extra) {
  phone = normPhone(phone);
  var gv = requireVerified(state, phone); if (gv) return gv;
  var post = null;
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === postId) { post = state.posts[i]; break; }
  if (!post) return { ok: false, error: 'Esa publicación ya no existe.' };
  if (!canSeePost(state, phone, post)) return { ok: false, error: 'No puedes ver esa publicación.' };
  text = String(text || '').trim();
  if (text.length > 1000) return { ok: false, error: 'El comentario es demasiado largo.' };
  /* v1.5.26 (11): el comentario puede llevar foto/video; el texto puede
     estar vacío SI hay medio. Sin texto ni medio, se rechaza. */
  var cMedia = extra && extra.media ? String(extra.media) : '';
  var cMediaType = extra && extra.mediaType ? String(extra.mediaType) : '';
  if (cMedia && !isValidHttpUrl(cMedia) && cMedia.indexOf('data:') !== 0 && cMedia.indexOf('content://') !== 0) return { ok: false, error: 'El medio del comentario no es válido.' };
  if (!text && !cMedia) return { ok: false, error: 'Escribe el comentario.' };
  /* v1.5.26 (24): menciones solo a amigos reales. */
  var mentions = [];
  if (extra && Array.isArray(extra.mentions)) {
    extra.mentions.forEach(function (m) {
      var mp = normPhone(m);
      if (mp && mp !== phone && (state.friends[phone] || []).indexOf(mp) >= 0 && mentions.indexOf(mp) < 0) mentions.push(mp);
    });
  }
  var comment = { id: uid('cmt'), author: phone, text: text, media: cMedia, mediaType: cMediaType, mentions: mentions, createdAt: now(), replies: [], likes: {} };
  if (parentId) {
    var parent = null;
    for (var j = 0; j < post.comments.length; j++) if (post.comments[j].id === parentId) { parent = post.comments[j]; break; }
    if (!parent) return { ok: false, error: 'Ese comentario ya no existe.' };
    parent.replies.push(comment);
  } else {
    post.comments.push(comment);
  }
  if (post.author !== phone) {
    notify(state, { type: 'comment', from: phone, to: post.author, text: 'comentó tu publicación', refId: post.id });
  }
  /* v1.5.26 (24): aviso de mención a cada amigo mencionado (que no sea
     el autor, que ya recibió el aviso de comentario). */
  mentions.forEach(function (mp) {
    if (mp !== post.author) notify(state, { type: 'mention', from: phone, to: mp, text: 'te mencionó en un comentario', refId: post.id, commentId: comment.id });
  });
  return { ok: true, comment: comment };
}
/* v2.3: buscar un comentario o una respuesta dentro de una publicación. */
function findCommentInPost(post, commentId) {
  var found = null;
  (post.comments || []).forEach(function (c) {
    if (c.id === commentId) found = c;
    (c.replies || []).forEach(function (r) { if (r.id === commentId) found = r; });
  });
  return found;
}
/* v2.3: me gusta en comentarios (estilo Shorts: el corazón se rellena
   del color del like). Se guarda en el comentario, en el teléfono; para
   verlo en otros teléfonos haría falta un endpoint del servidor, que
   esta versión no cambia. */
function toggleCommentLike(state, phone, postId, commentId) {
  phone = normPhone(phone);
  var gv = requireVerified(state, phone); if (gv) return gv;
  var post = null;
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === postId) { post = state.posts[i]; break; }
  if (!post) return { ok: false, error: 'Esa publicación ya no existe.' };
  if (!canSeePost(state, phone, post)) return { ok: false, error: 'No puedes ver esa publicación.' };
  var c = findCommentInPost(post, commentId);
  if (!c) return { ok: false, error: 'Ese comentario ya no existe.' };
  if (!c.likes) c.likes = {};
  if (c.likes[phone]) { delete c.likes[phone]; return { ok: true, liked: false, count: commentLikeCount(c) }; }
  c.likes[phone] = 'Me gusta';
  if (c.author !== phone) notify(state, { type: 'like', from: phone, to: c.author, text: 'reaccionó a tu comentario', refId: post.id });
  return { ok: true, liked: true, count: commentLikeCount(c) };
}
function commentLikeCount(c) {
  var total = 0;
  for (var p in ((c && c.likes) || {})) total++;
  return total;
}

function sharePost(state, phone, postId) {
  phone = normPhone(phone);
  var gv = requireVerified(state, phone); if (gv) return gv;
  var orig = null;
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === postId) { orig = state.posts[i]; break; }
  if (!orig) return { ok: false, error: 'Esa publicación ya no existe.' };
  if (!canSeePost(state, phone, orig)) return { ok: false, error: 'No puedes ver esa publicación.' };
  if (orig.shares.indexOf(phone) >= 0) return { ok: false, error: 'Ya la compartiste en tu muro.' };
  orig.shares.push(phone);
  /* v1.5.17 punto 1: la republicación YA NO copia el medio original
     (media/mediaList). Antes lo copiaba y, como la tarjeta dibuja el
     medio compartido en el bloque "Compartió" Y además el medio propio
     debajo, el mismo video salía dos veces: el video grande y el video
     chiquito cuadrado debajo (la captura). La canción sí se
     hereda (el bloque compartido no la muestra) y el texto/enlace
     también. Las republicaciones viejas que ya guardaron el medio
     duplicado se limpian al dibujarse (postCardHtml). */
  var repost = createPost(state, phone, {
    text: '', media: '', mediaType: '', mediaList: null, bg: orig.bg || 'none',
    link: orig.link || null, privacy: 'Público', song: orig.song || null,
    sharedFrom: { id: orig.id, author: orig.author, text: orig.text, media: orig.media, mediaType: orig.mediaType, link: orig.link || null }
  });
  if (!repost.ok) { orig.shares.splice(orig.shares.indexOf(phone), 1); return repost; }
  if (orig.author !== phone) {
    notify(state, { type: 'share', from: phone, to: orig.author, text: 'compartió tu publicación', refId: orig.id });
  }
  return { ok: true, post: repost.post, original: orig };
}

function toggleSave(state, phone, postId) {
  phone = normPhone(phone);
  var gv = requireVerified(state, phone); if (gv) return gv;
  var post = null;
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === postId) { post = state.posts[i]; break; }
  if (!post) return { ok: false, error: 'Esa publicación ya no existe.' };
  var idx = post.savedBy.indexOf(phone);
  if (idx >= 0) { post.savedBy.splice(idx, 1); return { ok: true, saved: false }; }
  post.savedBy.push(phone);
  return { ok: true, saved: true };
}

/* ---------------- historias ---------------- */
function createStory(state, author, data) {
  author = normPhone(author);
  if (!state.profiles[author]) return { ok: false, error: 'Primero crea tu perfil.' };
  var text = String((data && data.text) || '').trim();
  var media = (data && data.media) || '';
  if (!text && !media) return { ok: false, error: 'Escribe algo o agrega una foto o video para la historia.' };
  var edits = validateStoryEdits((data && data.edits) || null);
  /* v1.5.26: encuesta (7), enlace (29), audiencia (13), fondo de solo
     texto (39) y portada de nota de voz (17). */
  var storyPoll = validateStoryPoll(data && data.poll);
  if (data && data.poll && !storyPoll) return { ok: false, error: 'La encuesta de la historia necesita una pregunta y exactamente 2 opciones.' };
  var storyLink = validateStoryLink(data && data.link);
  if (data && data.link && !storyLink) return { ok: false, error: 'El enlace de la historia no es válido.' };
  var audience = (data && data.audience === 'close') ? 'close' : 'all';
  var backgroundColor = validateStoryBg(data && data.backgroundColor);
  /* v1.5.26 (50): el Short compartido se guarda solo si existe (como
     duetOf): la historia es una referencia, no una copia del video. */
  var sharedShortId = '';
  if (data && data.sharedShortId) {
    var origShort = (state.posts || []).filter(function (x) { return x.id === data.sharedShortId; })[0];
    if (origShort) sharedShortId = data.sharedShortId;
  }
  var story = {
    id: uid('story'), author: author, text: text.slice(0, 300),
    media: media, mediaType: (data && data.mediaType) || '',
    edits: edits, song: validateSong(data && data.song), videoEdits: validateVideoEdits(data && data.videoEdits),
    poll: storyPoll, link: storyLink, audience: audience,
    backgroundColor: backgroundColor, sharedShortId: sharedShortId,
    cover: String((data && data.cover) || ''),
    createdAt: now(), views: [], likes: {}, comments: [], shares: [], isDemo: !!(data && data.isDemo)
  };
  state.stories.unshift(story);
  return { ok: true, story: story };
}
/* Valida la personalización de una historia: texto (color, tamaño y
   posición), stickers, dibujo a mano alzada, filtro y fondo de color.
   Todo con límites para que no se pueda romper la historia. */
function validateStoryEdits(edits) {
  var out = { filter: 'none', bg: 'none', texts: [], stickers: [], drawing: [] };
  if (!edits) return out;
  if (STORY_FILTERS.indexOf(edits.filter) >= 0) out.filter = edits.filter;
  if (STORY_BG_COLORS.indexOf(edits.bg) >= 0) out.bg = edits.bg;
  if (Array.isArray(edits.texts)) {
    edits.texts.slice(0, 10).forEach(function (t) {
      if (!t || !String(t.text || '').trim()) return;
      out.texts.push({
        text: String(t.text).slice(0, 80),
        color: String(t.color || '#ffffff').slice(0, 20),
        size: Math.max(14, Math.min(72, parseInt(t.size, 10) || 28)),
        x: clampPct(t.x), y: clampPct(t.y)
      });
    });
  }
  if (Array.isArray(edits.stickers)) {
    edits.stickers.slice(0, 20).forEach(function (k) {
      if (!k || !String(k.emoji || '').trim()) return;
      out.stickers.push({
        emoji: String(k.emoji).slice(0, 8),
        size: Math.max(20, Math.min(120, parseInt(k.size, 10) || 48)),
        x: clampPct(k.x), y: clampPct(k.y)
      });
    });
  }
  if (Array.isArray(edits.drawing)) {
    edits.drawing.slice(0, 50).forEach(function (stroke) {
      if (!stroke || !Array.isArray(stroke.points)) return;
      out.drawing.push({
        color: String(stroke.color || '#ffffff').slice(0, 20),
        width: Math.max(2, Math.min(24, parseInt(stroke.width, 10) || 6)),
        points: stroke.points.slice(0, 200).map(function (pt) { return { x: clampPct(pt.x), y: clampPct(pt.y) }; })
      });
    });
  }
  return out;
}
function clampPct(v) {
  var n = parseFloat(v);
  if (isNaN(n)) return 50;
  return Math.max(0, Math.min(100, n));
}


function findStory(state, storyId) {
  for (var i = 0; i < state.stories.length; i++) if (state.stories[i].id === storyId) return state.stories[i];
  return null;
}
function ensureStoryFields(s) {
  if (!s.likes) s.likes = {};
  if (!s.comments) s.comments = [];
  if (!s.shares) s.shares = [];
  if (!s.views) s.views = [];
  return s;
}
function storyLikeCounts(story) {
  var total = 0;
  for (var p in (story.likes || {})) total++;
  return total;
}
/* v2.3: contadores de una historia como objeto (likes, comentarios,
   compartidos y vistas), siempre números reales (0 si no hay ninguno).
   Antes renderShortItem usaba storyLikeCounts (que devuelve solo un
   número) como si fuera un objeto, y por eso se veía "undefined vistas".
   storyLikeCounts sigue devolviendo solo el total de likes, porque
   toggleStoryLike y las pruebas lo usan así. */
function storyCounts(story) {
  var s = story || {};
  var likes = 0;
  for (var p in (s.likes || {})) likes++;
  return {
    likes: likes,
    comments: (s.comments || []).length,
    shares: (s.shares || []).length,
    views: (s.views || []).length
  };
}
/* v1.2: me gusta en historias (para la sección Shorts). */
function toggleStoryLike(state, phone, storyId) {
  phone = normPhone(phone);
  var gv = requireVerified(state, phone); if (gv) return gv;
  var s = findStory(state, storyId);
  if (!s) return { ok: false, error: 'Esa historia ya no existe.' };
  if (now() - s.createdAt > STORY_TTL_MS) return { ok: false, error: 'Esa historia ya caducó (duran 24 horas).' };
  ensureStoryFields(s);
  if (s.likes[phone]) { delete s.likes[phone]; return { ok: true, liked: false, count: storyLikeCounts(s) }; }
  s.likes[phone] = 'Me gusta';
  if (s.author !== phone) notify(state, { type: 'like', from: phone, to: s.author, text: 'reaccionó a tu historia', refId: s.id });
  return { ok: true, liked: true, count: storyLikeCounts(s) };
}
/* v1.2: comentarios en historias (para la sección Shorts). */
function addStoryComment(state, phone, storyId, text) {
  phone = normPhone(phone);
  var gv = requireVerified(state, phone); if (gv) return gv;
  var s = findStory(state, storyId);
  if (!s) return { ok: false, error: 'Esa historia ya no existe.' };
  if (now() - s.createdAt > STORY_TTL_MS) return { ok: false, error: 'Esa historia ya caducó (duran 24 horas).' };
  text = String(text || '').trim();
  if (!text) return { ok: false, error: 'Escribe el comentario.' };
  if (text.length > 1000) return { ok: false, error: 'El comentario es demasiado largo.' };
  ensureStoryFields(s);
  var comment = { id: uid('cmt'), author: phone, text: text, createdAt: now() };
  s.comments.push(comment);
  if (s.author !== phone) notify(state, { type: 'comment', from: phone, to: s.author, text: 'comentó tu historia', refId: s.id });
  return { ok: true, comment: comment };
}
/* v1.2: compartir una historia (cuenta las veces compartidas; el texto
   para compartir fuera de la app lo arma la pantalla). */
function shareStory(state, phone, storyId) {
  phone = normPhone(phone);
  var gv = requireVerified(state, phone); if (gv) return gv;
  var s = findStory(state, storyId);
  if (!s) return { ok: false, error: 'Esa historia ya no existe.' };
  if (now() - s.createdAt > STORY_TTL_MS) return { ok: false, error: 'Esa historia ya caducó (duran 24 horas).' };
  ensureStoryFields(s);
  if (s.shares.indexOf(phone) < 0) s.shares.push(phone);
  if (s.author !== phone) notify(state, { type: 'share', from: phone, to: s.author, text: 'compartió tu historia', refId: s.id });
  return { ok: true, shares: s.shares.length };
}
/* v1.2: el feed de Shorts — historias vivas + publicaciones de video corto,
   lo más nuevo primero. Solo lo que esa persona puede ver. */
function shortsFeed(state, phone) {
  phone = normPhone(phone);
  var items = [];
  var hideExamples = shouldHideExamples(state);
  liveStories(state).forEach(function (s) {
    ensureStoryFields(s);
    items.push({ kind: 'story', id: s.id, author: s.author, createdAt: s.createdAt, story: s });
  });
  state.posts.forEach(function (p) {
    if (hideExamples && p.isDemo) return; /* 1.5.33: ejemplos ocultos no salen en Shorts. */
    if (!canSeePost(state, phone, p)) return;
    var hasVideo = p.mediaType === 'video' || (p.mediaList || []).some(function (m) { return m.type === 'video'; });
    if (!hasVideo) return;
    items.push({ kind: 'post', id: p.id, author: p.author, createdAt: p.createdAt, post: p });
  });
  items.sort(function (a, b) { return b.createdAt - a.createdAt; });
  return items;
}

function viewStory(state, phone, storyId) {
  phone = normPhone(phone);
  var guestView = !phone || !state.profiles[phone];
  var s = null;
  for (var i = 0; i < state.stories.length; i++) if (state.stories[i].id === storyId) { s = state.stories[i]; break; }
  if (!s) return { ok: false, error: 'Esa historia ya no existe.' };
  if (guestView) return { ok: true, viewed: false }; // invitado: ve sin dejar registro
  if (now() - s.createdAt > STORY_TTL_MS) return { ok: false, error: 'Esa historia ya caducó (duran 24 horas).' };
  ensureStoryFields(s);
  if (s.views.indexOf(phone) < 0) s.views.push(phone);
  return { ok: true, story: s, views: s.views.length };
}

function liveStories(state, t) {
  t = t || now();
  var hideExamples = shouldHideExamples(state);
  return state.stories.filter(function (s) { return t - s.createdAt <= STORY_TTL_MS && (!hideExamples || !s.isDemo); });
}

function cleanupStories(state) {
  var before = state.stories.length;
  state.stories = liveStories(state);
  return before - state.stories.length;
}

/* ---------------- amistades ---------------- */
function areFriends(state, a, b) {
  a = normPhone(a); b = normPhone(b);
  return (state.friends[a] || []).indexOf(b) >= 0;
}
function pendingRequestBetween(state, a, b) {
  a = normPhone(a); b = normPhone(b);
  for (var i = 0; i < state.requests.length; i++) {
    var r = state.requests[i];
    if (r.status === 'pending' && ((r.from === a && r.to === b) || (r.from === b && r.to === a))) return r;
  }
  return null;
}
function sendFriendRequest(state, from, to) {
  from = normPhone(from); to = normPhone(to);
  var gv = requireVerified(state, from); if (gv) return gv;
  if (!state.profiles[to]) return { ok: false, error: 'Esa persona no existe en WordRed.' };
  if (from === to) return { ok: false, error: 'No puedes agregarte a ti.' };
  if (areFriends(state, from, to)) return { ok: false, error: 'Ya son amigos.' };
  var existing = pendingRequestBetween(state, from, to);
  if (existing) {
    if (existing.from === to) return { ok: false, error: 'Esa persona ya te envió una solicitud. Acéptala en Amigos.' };
    return { ok: false, error: 'Ya le enviaste una solicitud. Espera su respuesta.' };
  }
  var req = { id: uid('req'), from: from, to: to, status: 'pending', createdAt: now() };
  state.requests.push(req);
  notify(state, { type: 'request', from: from, to: to, text: 'te envió una solicitud de amistad', refId: req.id });
  return { ok: true, request: req };
}
function respondFriendRequest(state, phone, requestId, accept) {
  phone = normPhone(phone);
  var gv = requireVerified(state, phone); if (gv) return gv;
  var req = null;
  for (var i = 0; i < state.requests.length; i++) if (state.requests[i].id === requestId) { req = state.requests[i]; break; }
  if (!req) return { ok: false, error: 'Esa solicitud ya no existe.' };
  if (req.to !== phone) return { ok: false, error: 'Esa solicitud no es para ti.' };
  if (req.status !== 'pending') return { ok: false, error: 'Esa solicitud ya se respondió.' };
  if (accept) {
    req.status = 'accepted';
    if (!state.friends[req.from]) state.friends[req.from] = [];
    if (!state.friends[req.to]) state.friends[req.to] = [];
    if (state.friends[req.from].indexOf(req.to) < 0) state.friends[req.from].push(req.to);
    if (state.friends[req.to].indexOf(req.from) < 0) state.friends[req.to].push(req.from);
    notify(state, { type: 'friend', from: phone, to: req.from, text: 'aceptó tu solicitud de amistad', refId: req.id });
  } else {
    req.status = 'declined';
  }
  return { ok: true, request: req };
}
function unfriend(state, a, b) {
  a = normPhone(a); b = normPhone(b);
  state.friends[a] = (state.friends[a] || []).filter(function (x) { return x !== b; });
  state.friends[b] = (state.friends[b] || []).filter(function (x) { return x !== a; });
  return { ok: true };
}
function friendSuggestions(state, phone) {
  phone = normPhone(phone);
  var mine = state.friends[phone] || [];
  var counts = {};
  mine.forEach(function (f) {
    (state.friends[f] || []).forEach(function (fof) {
      if (fof !== phone && mine.indexOf(fof) < 0 && !pendingRequestBetween(state, phone, fof) && !isBlockedBetween(state, phone, fof)) {
        counts[fof] = (counts[fof] || 0) + 1;
      }
    });
  });
  var ranked = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
  var out = ranked.slice(0, 10).map(function (p) { return { profile: state.profiles[p], mutual: counts[p] }; });
  // Si hay pocas sugerencias, completa con perfiles de ejemplo (salvo que
  // ya estén ocultos: 10 publicaciones reales, o el interruptor).
  if (out.length < 5 && !shouldHideExamples(state)) {
    Object.keys(state.profiles).forEach(function (p) {
      if (out.length >= 5) return;
      if (p !== phone && mine.indexOf(p) < 0 && !pendingRequestBetween(state, phone, p)
          && !out.some(function (o) { return o.profile && o.profile.phone === p; })) {
        out.push({ profile: state.profiles[p], mutual: 0 });
      }
    });
  }
  return out;
}

/* ---------------- grupos ---------------- */
function createGroup(state, creator, data) {
  creator = normPhone(creator);
  var gv = requireVerified(state, creator); if (gv) return gv;
  var name = String((data && data.name) || '').trim();
  if (name.length < 3) return { ok: false, error: 'El grupo necesita un nombre (mínimo 3 letras).' };
  if (name.length > 80) return { ok: false, error: 'El nombre del grupo es demasiado largo.' };
  var g = {
    id: uid('grp'), name: name, desc: String((data && data.desc) || '').slice(0, 300),
    creator: creator, members: [creator],
    admins: [], cover: String((data && data.cover) || ''), coverType: (data && data.coverType) === 'video' ? 'video' : 'image',
    accent: ACCENTS.map(function (a) { return a.id; }).indexOf(data && data.accent) >= 0 ? data.accent : 'rojo',
    headerGradient: HEADER_GRADIENTS.indexOf(data && data.headerGradient) >= 0 ? data.headerGradient : 'none',
    rules: String((data && data.rules) || '').slice(0, 500),
    approval: !!(data && data.approval), joinRequests: [], pinnedPosts: [],
    secret: !!(data && data.secret), /* 1.5.26 (51): grupo secreto, solo por invitación. */
    createdAt: now()
  };
  state.groups.push(g);
  return { ok: true, group: g };
}
function joinGroup(state, phone, groupId) {
  phone = normPhone(phone);
  var gv = requireVerified(state, phone); if (gv) return gv;
  var g = null;
  for (var i = 0; i < state.groups.length; i++) if (state.groups[i].id === groupId) { g = state.groups[i]; break; }
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (g.members.indexOf(phone) >= 0) return { ok: false, error: 'Ya eres miembro de ese grupo.' };
  if (g.approval) {
    if ((g.joinRequests || []).indexOf(phone) >= 0) return { ok: false, error: 'Tu solicitud ya está esperando aprobación.' };
    g.joinRequests.push(phone);
    return { ok: true, group: g, requested: true };
  }
  g.members.push(phone);
  return { ok: true, group: g };
}
function leaveGroup(state, phone, groupId) {
  phone = normPhone(phone);
  var gv = requireVerified(state, phone); if (gv) return gv;
  var g = null;
  for (var i = 0; i < state.groups.length; i++) if (state.groups[i].id === groupId) { g = state.groups[i]; break; }
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (g.members.indexOf(phone) < 0) return { ok: false, error: 'No eres miembro de ese grupo.' };
  if (g.creator === phone) return { ok: false, error: 'El creador del grupo no puede salir. Pásale el grupo a otro miembro o borra el grupo.' };
  g.members = g.members.filter(function (x) { return x !== phone; });
  g.admins = (g.admins || []).filter(function (x) { return x !== phone; });
  return { ok: true, group: g };
}

/* ---------------- administradores de grupos (v1.2, ola 7) ----------------
   El creador puede nombrar hasta 3 administradores ("personal") entre los
   miembros. El personal puede personalizar el grupo (nombre, descripción,
   portada, reglas) y administrarlo (aprobar/quitar miembros, quitar
   publicaciones, fijar publicaciones). El tope de 3 se cumple siempre. */
function findGroup(state, groupId) {
  for (var i = 0; i < state.groups.length; i++) if (state.groups[i].id === groupId) return state.groups[i];
  return null;
}
function isGroupAdmin(state, phone, group) {
  phone = normPhone(phone);
  if (!group) return false;
  if (group.creator === phone) return true;
  return (group.admins || []).indexOf(phone) >= 0;
}
function canManageGroup(state, phone, groupId) {
  var g = findGroup(state, groupId);
  return isGroupAdmin(state, phone, g);
}
function addGroupAdmin(state, creator, groupId, phone) {
  creator = normPhone(creator); phone = normPhone(phone);
  var g = findGroup(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (g.creator !== creator) return { ok: false, error: 'Solo quien creó el grupo puede nombrar administradores.' };
  if (phone === g.creator) return { ok: false, error: 'El creador ya administra el grupo.' };
  if (g.members.indexOf(phone) < 0) return { ok: false, error: 'Esa persona no es miembro del grupo.' };
  if ((g.admins || []).indexOf(phone) >= 0) return { ok: false, error: 'Esa persona ya es administradora.' };
  if ((g.admins || []).length >= 3) return { ok: false, error: 'El grupo ya tiene 3 administradores (el máximo).' };
  g.admins.push(phone);
  return { ok: true, group: g };
}
function removeGroupAdmin(state, creator, groupId, phone) {
  creator = normPhone(creator); phone = normPhone(phone);
  var g = findGroup(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (g.creator !== creator) return { ok: false, error: 'Solo quien creó el grupo puede quitar administradores.' };
  g.admins = (g.admins || []).filter(function (x) { return x !== phone; });
  return { ok: true, group: g };
}
function editGroup(state, actor, groupId, data) {
  actor = normPhone(actor);
  var g = findGroup(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (!isGroupAdmin(state, actor, g)) return { ok: false, error: 'Solo el creador y los administradores pueden personalizar el grupo.' };
  if (data.name !== undefined) {
    var name = String(data.name || '').trim();
    if (name.length < 3) return { ok: false, error: 'El grupo necesita un nombre (mínimo 3 letras).' };
    if (name.length > 80) return { ok: false, error: 'El nombre del grupo es demasiado largo.' };
    g.name = name;
  }
  if (data.desc !== undefined) g.desc = String(data.desc || '').slice(0, 300);
  if (data.cover !== undefined) g.cover = String(data.cover || '');
  if (data.coverType !== undefined) g.coverType = data.coverType === 'video' ? 'video' : 'image';
  if (!g.cover) g.coverType = 'image';
  if (data.accent !== undefined) {
    if (ACCENTS.map(function (a) { return a.id; }).indexOf(data.accent) < 0) return { ok: false, error: 'Ese color no existe.' };
    g.accent = data.accent;
  }
  if (data.headerGradient !== undefined) {
    if (HEADER_GRADIENTS.indexOf(data.headerGradient) < 0) return { ok: false, error: 'Ese degradado no existe.' };
    g.headerGradient = data.headerGradient;
  }
  if (data.rules !== undefined) g.rules = String(data.rules || '').slice(0, 500);
  if (data.approval !== undefined) g.approval = !!data.approval;
  return { ok: true, group: g };
}
function removeGroupMember(state, actor, groupId, phone) {
  actor = normPhone(actor); phone = normPhone(phone);
  var g = findGroup(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (!isGroupAdmin(state, actor, g)) return { ok: false, error: 'Solo el creador y los administradores pueden quitar miembros.' };
  if (phone === g.creator) return { ok: false, error: 'No se puede quitar al creador del grupo.' };
  if (g.admins.indexOf(phone) >= 0 && actor !== g.creator) return { ok: false, error: 'Solo el creador puede quitar a otro administrador.' };
  if (g.members.indexOf(phone) < 0) return { ok: false, error: 'Esa persona no es miembro del grupo.' };
  g.members = g.members.filter(function (x) { return x !== phone; });
  g.admins = (g.admins || []).filter(function (x) { return x !== phone; });
  return { ok: true, group: g };
}
function approveJoinRequest(state, actor, groupId, phone) {
  actor = normPhone(actor); phone = normPhone(phone);
  var g = findGroup(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (!isGroupAdmin(state, actor, g)) return { ok: false, error: 'Solo el creador y los administradores aprueban miembros.' };
  if ((g.joinRequests || []).indexOf(phone) < 0) return { ok: false, error: 'No hay solicitud de esa persona.' };
  g.joinRequests = g.joinRequests.filter(function (x) { return x !== phone; });
  if (g.members.indexOf(phone) < 0) g.members.push(phone);
  return { ok: true, group: g };
}
function rejectJoinRequest(state, actor, groupId, phone) {
  actor = normPhone(actor); phone = normPhone(phone);
  var g = findGroup(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (!isGroupAdmin(state, actor, g)) return { ok: false, error: 'Solo el creador y los administradores revisan solicitudes.' };
  g.joinRequests = (g.joinRequests || []).filter(function (x) { return x !== phone; });
  return { ok: true, group: g };
}
function pinGroupPost(state, actor, groupId, postId) {
  actor = normPhone(actor);
  var g = findGroup(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (!isGroupAdmin(state, actor, g)) return { ok: false, error: 'Solo el creador y los administradores fijan publicaciones.' };
  var post = null;
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === postId) { post = state.posts[i]; break; }
  if (!post || post.groupId !== groupId) return { ok: false, error: 'Esa publicación no es de este grupo.' };
  if (!g.pinnedPosts) g.pinnedPosts = [];
  if (g.pinnedPosts.indexOf(postId) < 0) g.pinnedPosts.push(postId);
  post.pinnedInGroup = true;
  return { ok: true, group: g };
}
function unpinGroupPost(state, actor, groupId, postId) {
  actor = normPhone(actor);
  var g = findGroup(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (!isGroupAdmin(state, actor, g)) return { ok: false, error: 'Solo el creador y los administradores quitan fijaciones.' };
  g.pinnedPosts = (g.pinnedPosts || []).filter(function (x) { return x !== postId; });
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === postId) state.posts[i].pinnedInGroup = false;
  return { ok: true, group: g };
}

/* ---------------- mensajes ---------------- */
function convoKey(a, b) {
  a = normPhone(a); b = normPhone(b);
  return a < b ? a + '|' + b : b + '|' + a;
}
function sendMessage(state, from, to, text, media, mediaType, file, voice, extra) {
  from = normPhone(from); to = normPhone(to);
  var gv = requireVerified(state, from); if (gv) return gv;
  if (!state.profiles[to]) return { ok: false, error: 'Esa persona no existe en WordRed.' };
  if (from === to) return { ok: false, error: 'No puedes escribirte a ti.' };
  if (isBlockedBetween(state, from, to)) return { ok: false, error: 'No puedes escribirle a esa persona.' }; // ola 7
  text = String(text || '').trim();
  media = media || '';
  /* v1.2: archivos de cualquier tipo (documentos, audio, etc.). */
  var fileObj = null;
  if (file) {
    var fname = String(file.name || '').trim();
    if (!fname) return { ok: false, error: 'Ese archivo no tiene nombre.' };
    fileObj = {
      name: fname.slice(0, 200),
      size: Number(file.size) || 0,
      mime: String(file.mime || file.type || 'application/octet-stream'),
      uri: String(file.uri || file.src || '')
    };
    if (!fileObj.uri) return { ok: false, error: 'No se pudo guardar ese archivo.' };
  }
  /* v1.2: mensajes de voz (audio grabado, con duración). */
  var voiceObj = null;
  if (voice) {
    var vuri = String(voice.uri || voice.src || '');
    var vdur = Number(voice.duration) || 0;
    if (!vuri) return { ok: false, error: 'No se pudo guardar ese mensaje de voz.' };
    if (vdur < 500) return { ok: false, error: 'El mensaje de voz es demasiado corto.' };
    voiceObj = { uri: vuri, duration: vdur, size: Number(voice.size) || 0, mime: String(voice.mime || voice.type || 'audio/mpeg') };
  }
  /* v1.5.26: sticker solo (47), ubicación en vivo (55) e invitación
     de juego (57) también son mensaje válido sin texto. */
  var stickerId = validateStickerId(extra && extra.stickerId);
  var liveLocation = null;
  if (extra && extra.liveLocation) {
    var ll = validateGeoPlace(extra.liveLocation);
    if (!ll) return { ok: false, error: 'La ubicación no es válida.' };
    var exp = Number(extra.liveLocation.expiresAt) || (Date.now() + 3600000);
    if (exp > Date.now() + 3600000) exp = Date.now() + 3600000;
    liveLocation = { lat: ll.lat, lng: ll.lng, expiresAt: exp };
  }
  var gameInvite = null;
  if (extra && extra.gameInvite) {
    var gi = extra.gameInvite;
    gameInvite = { gameId: String(gi.gameId || ''), roomId: String(gi.roomId || '').slice(0, 100) };
  }
  if (!text && !media && !fileObj && !voiceObj && !stickerId && !liveLocation && !gameInvite) return { ok: false, error: 'Escribe un mensaje o agrega una foto.' };
  if (text.length > 2000) return { ok: false, error: 'El mensaje es demasiado largo.' };
  var key = convoKey(from, to);
  var conv = state.conversations[key];
  if (!conv) {
    conv = { id: uid('conv'), participants: [from, to], messages: [], unread: {} };
    state.conversations[key] = conv;
  }
  var msg = { id: uid('msg'), from: from, text: text, media: media, mediaType: mediaType || '', file: fileObj, voice: voiceObj, stickerId: stickerId, liveLocation: liveLocation, gameInvite: gameInvite, reactions: [], createdAt: now(), readBy: [from] };
  conv.messages.push(msg);
  conv.unread[to] = (conv.unread[to] || 0) + 1;
  notify(state, { type: 'message', from: from, to: to, text: voiceObj ? 'te envió un mensaje de voz' : (text ? 'te envió un mensaje' : (fileObj ? 'te envió un archivo' : 'te envió una foto')), refId: conv.id });
  // v1.3: la dirección del servidor ya viene dentro de la app, así que
  // el mensaje se envía de inmediato por la app y, si no hay conexión,
  // queda en la cola de pendientes por el envío (pushToServer). Aquí ya
  // no se encola dos veces.
  if (!serverBase(state)) {
    state.pendingQueue.push({ kind: 'message', convo: key, to: to, message: msg });
  }
  return { ok: true, message: msg, conversation: conv };
}
function markConversationRead(state, phone, other) {
  phone = normPhone(phone);
  var conv = state.conversations[convoKey(phone, other)];
  if (!conv) return { ok: false, error: 'No hay conversación.' };
  /* v1.5: al leer se guarda la hora (readAt) en los mensajes nuevos,
     para que al otro le aparezca "Visto" con la hora. */
  var at = now();
  var anyNew = false;
  conv.messages.forEach(function (m) {
    if (m.readBy.indexOf(phone) < 0) { m.readBy.push(phone); m.readAt = at; anyNew = true; }
  });
  conv.unread[phone] = 0;
  return { ok: true, readAt: anyNew ? at : null };
}
/* Cantidad total de comentarios de una publicación, incluyendo las
   respuestas (v1.5): es el número que se ve junto al botón de
   comentarios. */
function commentCount(post) {
  if (!post || !Array.isArray(post.comments)) return 0;
  var n = post.comments.length;
  post.comments.forEach(function (c) { n += ((c.replies || []).length); });
  return n;
}
/* Invitación para volver a la app (v1.5): solo si está activada, hay
   actividad sin leer y pasó más de un día desde la última invitación. */
function reengageDue(settings, unreadCount, now) {
  if (!settings || settings.notifReengage === false) return { due: false, reason: 'apagada' };
  if (!(unreadCount > 0)) return { due: false, reason: 'sin actividad' };
  var last = Number((settings && settings.reengageLast) || 0);
  if ((now || Date.now()) - last < 24 * 60 * 60 * 1000) return { due: false, reason: 'ya se invitó hoy' };
  return { due: true, reason: '' };
}
function conversationList(state, phone) {
  phone = normPhone(phone);
  var list = [];
  for (var key in state.conversations) {
    var c = state.conversations[key];
    if (c.participants.indexOf(phone) < 0) continue;
    var other = c.participants[0] === phone ? c.participants[1] : c.participants[0];
    var last = c.messages[c.messages.length - 1];
    list.push({ conversation: c, other: other, last: last || null, unread: c.unread[phone] || 0 });
  }
  list.sort(function (a, b) {
    var ta = a.last ? a.last.createdAt : 0;
    var tb = b.last ? b.last.createdAt : 0;
    return tb - ta;
  });
  return list;
}

/* ---------------- chats grupales (v1.5.14) ----------------
   Distintos de los grupos-comunidad (publicaciones de un tema) y de
   los mensajes 1 a 1: un chat con varias personas, con id propio que
   NO cambia al agregar o quitar integrantes. */
function findGroupChat(state, groupId) {
  var list = state.groupChats || [];
  for (var i = 0; i < list.length; i++) if (list[i].id === groupId) return list[i];
  return null;
}
function createGroupChat(state, me, opts) {
  me = normPhone(me);
  var gv = requireVerified(state, me); if (gv) return gv;
  var name = String((opts && opts.name) || '').trim().slice(0, 60);
  var others = [];
  ((opts && opts.participants) || []).forEach(function (p) {
    p = normPhone(p);
    if (p && p !== me && others.indexOf(p) < 0) others.push(p);
  });
  /* Un grupo necesita al menos 2 personas además de mí: con una sola
     ya existe el chat 1 a 1. */
  if (others.length < 2) return { ok: false, error: 'Elige al menos 2 personas para crear el grupo.' };
  for (var i = 0; i < others.length; i++) {
    if (!state.profiles[others[i]]) return { ok: false, error: 'Esa persona no existe en WordRed.' };
    if (isBlockedBetween(state, me, others[i])) return { ok: false, error: 'No puedes agregar a esa persona al grupo.' };
  }
  if (!name) {
    name = 'Grupo de ' + others.slice(0, 2).map(function (p) { return (state.profiles[p] && state.profiles[p].name) || p; }).join(', ');
  }
  var g = { id: uid('gchat'), name: name, participants: [me].concat(others), messages: [], unread: {}, createdAt: now(), createdBy: me, updatedAt: now() };
  if (!state.groupChats) state.groupChats = [];
  state.groupChats.push(g);
  return { ok: true, group: g };
}
function sendGroupMessage(state, me, groupId, text, media, mediaType, extra) {
  me = normPhone(me);
  var gv = requireVerified(state, me); if (gv) return gv;
  var g = findGroupChat(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (g.participants.indexOf(me) < 0) return { ok: false, error: 'Ya no eres parte de ese grupo.' };
  text = String(text || '').trim();
  media = media || '';
  var gStickerId = validateStickerId(extra && extra.stickerId);
  var gLiveLocation = null;
  if (extra && extra.liveLocation) {
    var gll = validateGeoPlace(extra.liveLocation);
    if (!gll) return { ok: false, error: 'La ubicación no es válida.' };
    var gexp = Number(extra.liveLocation.expiresAt) || (Date.now() + 3600000);
    if (gexp > Date.now() + 3600000) gexp = Date.now() + 3600000;
    gLiveLocation = { lat: gll.lat, lng: gll.lng, expiresAt: gexp };
  }
  var gGameInvite = null;
  if (extra && extra.gameInvite) gGameInvite = { gameId: String(extra.gameInvite.gameId || ''), roomId: String(extra.gameInvite.roomId || '').slice(0, 100) };
  if (!text && !media && !gStickerId && !gLiveLocation && !gGameInvite) return { ok: false, error: 'Escribe un mensaje o agrega una foto.' };
  if (text.length > 2000) return { ok: false, error: 'El mensaje es demasiado largo.' };
  var msg = { id: uid('msg'), from: me, text: text, media: media, mediaType: mediaType || '', file: null, voice: null, stickerId: gStickerId, liveLocation: gLiveLocation, gameInvite: gGameInvite, reactions: [], createdAt: now(), readBy: [me] };
  g.messages.push(msg);
  g.updatedAt = now();
  g.participants.forEach(function (p) {
    if (p !== me) {
      g.unread[p] = (g.unread[p] || 0) + 1;
      notify(state, { type: 'message', from: me, to: p, text: 'te escribió en el grupo ' + g.name, refId: g.id });
    }
  });
  if (!serverBase(state)) {
    state.pendingQueue.push({ kind: 'groupMessage', groupId: g.id, message: msg });
  }
  return { ok: true, message: msg, group: g };
}
function addGroupChatMember(state, me, groupId, phone) {
  me = normPhone(me); phone = normPhone(phone);
  var gv = requireVerified(state, me); if (gv) return gv;
  var g = findGroupChat(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (g.participants.indexOf(me) < 0) return { ok: false, error: 'Ya no eres parte de ese grupo.' };
  if (!state.profiles[phone]) return { ok: false, error: 'Esa persona no existe en WordRed.' };
  if (g.participants.indexOf(phone) >= 0) return { ok: false, error: 'Esa persona ya está en el grupo.' };
  if (isBlockedBetween(state, me, phone)) return { ok: false, error: 'No puedes agregar a esa persona al grupo.' };
  g.participants.push(phone);
  g.updatedAt = now();
  return { ok: true, group: g };
}
function removeGroupChatMember(state, me, groupId, phone) {
  me = normPhone(me); phone = normPhone(phone);
  var gv = requireVerified(state, me); if (gv) return gv;
  var g = findGroupChat(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (g.participants.indexOf(me) < 0) return { ok: false, error: 'Ya no eres parte de ese grupo.' };
  if (phone === me) return { ok: false, error: 'Para salir del grupo usa "Salir del grupo".' };
  var i = g.participants.indexOf(phone);
  if (i < 0) return { ok: false, error: 'Esa persona no está en el grupo.' };
  g.participants.splice(i, 1);
  if (g.unread) delete g.unread[phone];
  g.updatedAt = now();
  return { ok: true, group: g };
}
function leaveGroupChat(state, me, groupId) {
  me = normPhone(me);
  var g = findGroupChat(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  var i = g.participants.indexOf(me);
  if (i < 0) return { ok: false, error: 'Ya no eres parte de ese grupo.' };
  g.participants.splice(i, 1);
  if (g.unread) delete g.unread[me];
  if (!g.participants.length) {
    state.groupChats = (state.groupChats || []).filter(function (x) { return x.id !== groupId; });
    return { ok: true, left: true, deleted: true };
  }
  g.updatedAt = now();
  return { ok: true, left: true, deleted: false, group: g };
}
function groupChatList(state, phone) {
  phone = normPhone(phone);
  var list = [];
  (state.groupChats || []).forEach(function (g) {
    if (g.participants.indexOf(phone) < 0) return;
    var last = g.messages[g.messages.length - 1];
    list.push({ group: g, last: last || null, unread: (g.unread && g.unread[phone]) || 0 });
  });
  list.sort(function (a, b) {
    var ta = a.last ? a.last.createdAt : (a.group.updatedAt || 0);
    var tb = b.last ? b.last.createdAt : (b.group.updatedAt || 0);
    return tb - ta;
  });
  return list;
}
function markGroupChatRead(state, phone, groupId) {
  phone = normPhone(phone);
  var g = findGroupChat(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo no existe.' };
  if (g.unread) g.unread[phone] = 0;
  (g.messages || []).forEach(function (m) {
    if (m.from !== phone && m.readBy.indexOf(phone) < 0) m.readBy.push(phone);
  });
  return { ok: true };
}
/* Fusión con lo que trae el servidor (pullFromServer): los grupos del
   servidor mandan en nombre e integrantes; los mensajes se unen por id. */
function mergeGroupChats(state, serverGroups) {
  if (!Array.isArray(serverGroups)) return;
  if (!state.groupChats) state.groupChats = [];
  serverGroups.forEach(function (sg) {
    if (!sg || !sg.id) return;
    /* Si el servidor trae el grupo sin mí, me sacaron: el grupo local
       se borra (ya no lo veo ni me llegan sus mensajes). */
    if (Array.isArray(sg.participants) && sg.participants.indexOf(normPhone(state.me)) < 0) {
      state.groupChats = state.groupChats.filter(function (x) { return x.id !== sg.id; });
      return;
    }
    var local = findGroupChat(state, sg.id);
    if (!local) {
      /* v1.5.15: un mensaje borrado por mí no vuelve aunque el servidor
         todavía lo traiga en el grupo. */
      if (sg.messages) sg.messages = sg.messages.filter(function (m) { return !isItemDeleted(state, 'message', m.id); });
      state.groupChats.push(sg); return;
    }
    local.name = sg.name || local.name;
    local.participants = Array.isArray(sg.participants) ? sg.participants : local.participants;
    local.updatedAt = sg.updatedAt || local.updatedAt;
    (sg.messages || []).forEach(function (m) {
      /* v1.5.15: un mensaje borrado por mí no vuelve aunque el servidor
         todavía lo traiga. */
      if (isItemDeleted(state, 'message', m.id)) return;
      var ex = null;
      local.messages.forEach(function (x) { if (x.id === m.id) ex = x; });
      if (!ex) local.messages.push(m);
      else if (m.readBy) ex.readBy = m.readBy;
    });
    local.messages.sort(function (a, b) { return a.createdAt - b.createdAt; });
    if (sg.unread && sg.unread[state.me] != null) local.unread[state.me] = sg.unread[state.me];
  });
}

/* ---------------- actividad propia (v1.5.14) ----------------
   Sus publicaciones, los likes que dio, sus comentarios y lo que
   compartió, de lo más reciente a lo más antiguo. Los likes no
   guardan hora propia en la app: se ordenan por la fecha de la
   publicación a la que se dio el like. */
function userActivity(state, me) {
  me = normPhone(me);
  var items = [];
  (state.posts || []).forEach(function (p) {
    if (!p || !p.id) return;
    if (p.author === me) {
      items.push({ kind: p.sharedFrom ? 'share' : 'post', at: p.createdAt || 0, postId: p.id, post: p });
    }
    if (p.likes && p.likes[me] && p.author !== me) {
      items.push({ kind: 'like', at: p.createdAt || 0, postId: p.id, post: p, reaction: p.likes[me] });
    }
    (p.comments || []).forEach(function (c) {
      if (c && c.author === me) items.push({ kind: 'comment', at: c.createdAt || 0, postId: p.id, post: p, comment: c });
    });
  });
  items.sort(function (a, b) { return b.at - a.at; });
  return items.slice(0, 200);
}

/* ---------------- notificaciones ---------------- */
/* ---------------- bloquear / desbloquear y reportar (v1.2, ola 7) ----------------
   Bloquear: esa persona no ve tus publicaciones ni tu perfil, no puede
   escribirte y no aparece en tu feed ni en tus búsquedas. Al desbloquear
   todo vuelve. Reportar: queda registrado con motivo y descripción. */
function isBlockedBy(state, blocker, blocked) {
  blocker = normPhone(blocker); blocked = normPhone(blocked);
  return ((state.blocked || {})[blocker] || []).indexOf(blocked) >= 0;
}
function isBlockedBetween(state, a, b) {
  return isBlockedBy(state, a, b) || isBlockedBy(state, b, a);
}
function canSeeProfile(state, viewer, phone) {
  if (!state.profiles[phone]) return false;
  if (isBlockedBetween(state, viewer, phone)) return false;
  return true;
}
function blockUser(state, me, phone) {
  me = normPhone(me); phone = normPhone(phone);
  var gv = requireVerified(state, me); if (gv) return gv;
  if (!state.profiles[phone]) return { ok: false, error: 'Esa persona no existe en WordRed.' };
  if (me === phone) return { ok: false, error: 'No puedes bloquearte a ti.' };
  if (isBlockedBy(state, me, phone)) return { ok: false, error: 'Esa persona ya está bloqueada.' };
  if (!state.blocked) state.blocked = {};
  if (!state.blocked[me]) state.blocked[me] = [];
  state.blocked[me].push(phone);
  /* Al bloquear se deja de ser amigos y se quitan las solicitudes entre ambos. */
  if (state.friends[me]) state.friends[me] = state.friends[me].filter(function (x) { return x !== phone; });
  if (state.friends[phone]) state.friends[phone] = state.friends[phone].filter(function (x) { return x !== me; });
  state.requests = (state.requests || []).filter(function (r) {
    return !((r.from === me && r.to === phone) || (r.from === phone && r.to === me));
  });
  return { ok: true };
}
function unblockUser(state, me, phone) {
  me = normPhone(me); phone = normPhone(phone);
  var gv = requireVerified(state, me); if (gv) return gv;
  if (!isBlockedBy(state, me, phone)) return { ok: false, error: 'Esa persona no está bloqueada.' };
  state.blocked[me] = (state.blocked[me] || []).filter(function (x) { return x !== phone; });
  return { ok: true };
}
function blockedList(state, me) {
  me = normPhone(me);
  return ((state.blocked || {})[me] || []).slice();
}
function reportUser(state, reporter, reported, reason, desc) {
  reporter = normPhone(reporter); reported = normPhone(reported);
  if (!state.profiles[reported]) return { ok: false, error: 'Esa persona no existe en WordRed.' };
  if (reporter === reported) return { ok: false, error: 'No puedes reportarte a ti.' };
  if (REPORT_REASONS.indexOf(reason) < 0) return { ok: false, error: 'Elige un motivo para el reporte.' };
  var report = {
    id: uid('rep'), reporter: reporter, reported: reported, reason: reason,
    desc: String(desc || '').trim().slice(0, 500), createdAt: now(), status: 'pendiente'
  };
  if (!state.reports) state.reports = [];
  state.reports.unshift(report);
  return { ok: true, report: report };
}

function notify(state, n) {
  var pref = {
    like: state.settings.notifLikes, comment: state.settings.notifComments,
    request: state.settings.notifRequests, message: state.settings.notifMessages,
    share: state.settings.notifComments, friend: state.settings.notifRequests, group: state.settings.notifGroups,
    post: state.settings.notifFollowPosts, pagepost: state.settings.notifPagePosts,
    grouppost: state.settings.notifGroupPosts, tag: state.settings.notifTags
  };
  if (pref[n.type] === false) return null;
  var item = {
    id: uid('notif'), type: n.type, from: n.from, to: n.to, text: n.text,
    refId: n.refId || '', createdAt: now(), read: false
  };
  state.notifications.unshift(item);
  if (state.notifications.length > 200) state.notifications.length = 200;
  return item;
}
/* 1.5.43: en la campana no aparece nada de la cuenta de ejemplo: sus
   avisos (por ejemplo sus Me gusta automáticos) no se renderizan ni
   cuentan como no leídos. Los Me gusta de ejemplo en las publicaciones
   no se tocan, solo sus avisos. */
function isDemoNotif(state, n) {
  if (!n || !n.from) return false;
  if (n.from === DEMO_PROFILE_1534.phone) return true;
  var p = state && state.profiles && state.profiles[n.from];
  return !!(p && p.isDemo);
}
function unreadNotifications(state, phone) {
  phone = normPhone(phone);
  return state.notifications.filter(function (n) { return n.to === phone && !n.read && !isDemoNotif(state, n); }).length;
}
function markNotificationsRead(state, phone) {
  phone = normPhone(phone);
  state.notifications.forEach(function (n) { if (n.to === phone) n.read = true; });
  return { ok: true };
}

/* ---------------- vistos recientemente y avisos de publicaciones nuevas (v1.2) ---------------- */
var RECENT_VIEW_DAYS = 7;
function recordView(state, viewer, phone) {
  viewer = normPhone(viewer); phone = normPhone(phone);
  if (!viewer || !phone || viewer === phone) return { ok: false };
  if (!state.recentViews) state.recentViews = [];
  state.recentViews = state.recentViews.filter(function (v) { return v.phone !== phone; });
  state.recentViews.unshift({ phone: phone, at: now() });
  if (state.recentViews.length > 20) state.recentViews.length = 20;
  return { ok: true };
}
function isRecentlyViewed(state, viewer, phone) {
  viewer = normPhone(viewer); phone = normPhone(phone);
  var list = state.recentViews || [];
  for (var i = 0; i < list.length; i++) {
    if (list[i].phone === phone && now() - list[i].at <= RECENT_VIEW_DAYS * 24 * 60 * 60 * 1000) return true;
  }
  return false;
}
/* Avisa cuando alguien que sigues (amigo), que viste recientemente, una
   página que sigues o un grupo tuyo publica algo nuevo. Solo avisa una
   vez por publicación. Se llama después de sincronizar con el servidor
   y cada cierto tiempo mientras la app está abierta. */
function checkNewPostNotifications(state, me) {
  me = normPhone(me);
  if (!me) return { ok: false, error: 'Sin sesión.', notified: 0 };
  if (!state.notifiedPostIds) state.notifiedPostIds = [];
  var fresh = [];
  state.posts.forEach(function (p) {
    if (state.notifiedPostIds.indexOf(p.id) >= 0) return;
    if (p.author === me) return;
    if (!canSeePost(state, me, p)) return;
    var reason = null;
    if (p.pageId) {
      var pg = state.pages.filter(function (x) { return x.id === p.pageId; })[0];
      if (pg && pg.followers.indexOf(me) >= 0) reason = 'pagepost';
    } else if (p.groupId) {
      var g = state.groups.filter(function (x) { return x.id === p.groupId; })[0];
      if (g && g.members.indexOf(me) >= 0) reason = 'grouppost';
    } else if (areFriends(state, me, p.author) || isRecentlyViewed(state, me, p.author)) {
      reason = 'post';
    }
    if (reason) fresh.push({ post: p, reason: reason });
  });
  var notified = 0;
  fresh.forEach(function (f) {
    var text = f.reason === 'pagepost' ? 'publicó algo nuevo en una página que sigues'
      : f.reason === 'grouppost' ? 'publicó algo nuevo en tu grupo'
      : 'publicó algo nuevo';
    var n = notify(state, { type: f.reason, from: f.post.author, to: me, text: text, refId: f.post.id });
    state.notifiedPostIds.push(f.post.id);
    if (n) notified++;
  });
  if (state.notifiedPostIds.length > 500) state.notifiedPostIds = state.notifiedPostIds.slice(-500);
  return { ok: true, notified: notified, checked: fresh.length };
}

/* ---------------- feed y búsqueda ---------------- */
/* ---- ejemplos del inicio (v1.8; 1.5.33: la regla cambia) ----
   Las publicaciones de ejemplo (isDemo) se crean al registrarse para
   que el inicio no se vea vacío. Cuando la app ya tiene 10 publicaciones
   REALES de cuentas reales (las que no son de ejemplo, incluida la de tu
   propia cuenta), los ejemplos se ocultan solos del inicio, de la lista
   de amigos y de las sugerencias, sin borrarlos. Con 9 o menos, siguen.
   El interruptor en Ajustes (settings.examplesOverride) permite volver
   a mostrarlos ('show') o esconderlos a mano ('hide'); sin tocarlo,
   manda la regla automática de las 10 publicaciones reales. */
var EXAMPLE_HIDE_REAL_POSTS = 10;
function realPostStats(state) {
  var posts = 0, authors = {};
  (state.posts || []).forEach(function (p) {
    if (!p || p.isDemo) return;
    posts++;
    authors[p.author] = true;
  });
  return { posts: posts, authors: Object.keys(authors).length };
}
function examplesAutoHidden(state) {
  return realPostStats(state || { posts: [] }).posts >= EXAMPLE_HIDE_REAL_POSTS;
}
function shouldHideExamples(state) {
  var ov = state && state.settings && state.settings.examplesOverride;
  if (ov === 'show') return false;
  if (ov === 'hide') return true;
  return examplesAutoHidden(state);
}
function feedFor(state, phone) {
  phone = normPhone(phone);
  var hideExamples = shouldHideExamples(state);
  return state.posts.filter(function (p) {
    if (hideExamples && p.isDemo) return false;
    return canSeePost(state, phone, p);
  }).sort(function (a, b) { return b.createdAt - a.createdAt; });
}
function extractHashtags(text) {
  var tags = [];
  String(text || '').replace(/#([A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9_]+)/g, function (_, t) {
    var tag = t.toLowerCase();
    if (tags.indexOf(tag) < 0) tags.push(tag);
    return _;
  });
  return tags;
}
function searchAll(state, phone, query) {
  phone = normPhone(phone);
  var q = String(query || '').trim().toLowerCase();
  var hideExamples = shouldHideExamples(state);
  var out = { people: [], posts: [], groups: [], hashtags: [] };
  if (!q) return out;
  var isTag = q.charAt(0) === '#';
  var tag = isTag ? q.slice(1) : q;
  Object.keys(state.profiles).forEach(function (p) {
    var prof = state.profiles[p];
    if (hideExamples && prof.isDemo) return; /* 1.5.33: ejemplos ocultos no aparecen en la búsqueda. */
    if (isBlockedBetween(state, phone, p)) return; // ola 7: los bloqueados no aparecen
    if ((prof.name || '').toLowerCase().indexOf(q) >= 0 || p.indexOf(q.replace(/\D/g, '')) >= 0) {
      out.people.push(prof);
    }
  });
  state.posts.forEach(function (post) {
    if (hideExamples && post.isDemo) return; /* 1.5.33: ejemplos ocultos no aparecen en la búsqueda. */
    if (!canSeePost(state, phone, post)) return;
    var hay = ((post.text || '') + ' ' + (post.link ? (post.link.title || '') + ' ' + (post.link.desc || '') + ' ' + (post.link.host || '') + ' ' + (post.link.url || '') : '')).toLowerCase();
    if (isTag) {
      if (extractHashtags(post.text).indexOf(tag) >= 0) out.posts.push(post);
    } else if (hay.indexOf(q) >= 0) {
      out.posts.push(post);
    }
  });
  state.groups.forEach(function (g) {
    if ((g.name || '').toLowerCase().indexOf(q) >= 0 || (g.desc || '').toLowerCase().indexOf(q) >= 0) out.groups.push(g);
  });
  if (isTag) out.hashtags = [tag];
  return out;
}
/* Web 1.2: el buscador del Inicio se quitó, así que foldSearchText1562
   y searchAllFolded1562 (1.5.62) ya no se usan; la vista «Buscar» sigue
   con searchAll sin cambios. */
/* ---------------- personalización de perfil (v1.1) ---------------- */
var FRAMES = [
  { id: 'none', name: 'Sin marco' },
  { id: 'rojo', name: 'Rojo WordRed' },
  { id: 'dorado', name: 'Dorado' },
  { id: 'azul', name: 'Azul' },
  { id: 'verde', name: 'Verde' },
  { id: 'morado', name: 'Morado' },
  { id: 'arcoiris', name: 'Arcoíris' }
];
var ACCENTS = [
  { id: 'rojo', name: 'Rojo WordRed', color: '#e01430' },
  { id: 'azul', name: 'Azul', color: '#3ea6ff' },
  { id: 'verde', name: 'Verde', color: '#2fbf71' },
  { id: 'morado', name: 'Morado', color: '#9b6bff' },
  { id: 'naranja', name: 'Naranja', color: '#ff7a1a' },
  { id: 'turquesa', name: 'Turquesa', color: '#19c2b8' },
  { id: 'amarillo', name: 'Amarillo', color: '#ffc107' },
  { id: 'dorado', name: 'Dorado', color: '#d4a017' },
  { id: 'coral', name: 'Coral', color: '#ff6b4a' },
  { id: 'celeste', name: 'Celeste', color: '#56b6f7' },
  { id: 'lima', name: 'Lima', color: '#9be515' },
  { id: 'vino', name: 'Vino', color: '#a03060' }
];
/* Degradados del encabezado del perfil (v1.2, ola 7): el color de la
   portada/encabezado, aparte del acento. */
var HEADER_GRADIENTS = ['none', 'rojo', 'atardecer', 'mar', 'bosque', 'violeta', 'dorado', 'noche'];
/* Motivos para reportar una cuenta (v1.2, ola 7). */
var REPORT_REASONS = ['spam', 'acoso', 'cuenta falsa', 'contenido inapropiado', 'otro'];
var RELATIONSHIPS = ['Soltero/a', 'En una relación', 'Comprometido/a', 'Casado/a', 'Es complicado', 'Prefiero no decirlo'];
function accentColor(id) {
  for (var i = 0; i < ACCENTS.length; i++) if (ACCENTS[i].id === id) return ACCENTS[i].color;
  return ACCENTS[0].color;
}
function pinPost(state, phone, postId) {
  phone = normPhone(phone);
  var prof = state.profiles[phone];
  if (!prof) return { ok: false, error: 'Primero crea tu perfil.' };
  var post = null;
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === postId) { post = state.posts[i]; break; }
  if (!post) return { ok: false, error: 'Esa publicación ya no existe.' };
  if (post.author !== phone) return { ok: false, error: 'Solo puedes destacar tus propias publicaciones.' };
  if (!prof.pinnedPosts) prof.pinnedPosts = [];
  var idx = prof.pinnedPosts.indexOf(postId);
  if (idx >= 0) { prof.pinnedPosts.splice(idx, 1); return { ok: true, pinned: false, pinnedPosts: prof.pinnedPosts }; }
  if (prof.pinnedPosts.length >= 3) return { ok: false, error: 'Ya tienes 3 publicaciones destacadas. Quita una para destacar otra.' };
  prof.pinnedPosts.push(postId);
  return { ok: true, pinned: true, pinnedPosts: prof.pinnedPosts };
}
function sectionVisible(state, viewer, owner, section) {
  viewer = normPhone(viewer); owner = normPhone(owner);
  if (viewer === owner) return true;
  var prof = state.profiles[owner];
  var val = prof && prof.sectionPrivacy ? prof.sectionPrivacy[section] : 'Público';
  if (val === 'Público') return true;
  if (val === 'Solo yo') return false;
  return areFriends(state, viewer, owner);
}

/* ---------------- Marketplace (v1.1) ---------------- */
var LISTING_CATEGORIES = ['Vehículos', 'Motos', 'Electrónica', 'Celulares', 'Computadoras', 'Hogar', 'Muebles', 'Electrodomésticos', 'Ropa', 'Calzado', 'Deportes', 'Juguetes', 'Bebés', 'Mascotas', 'Belleza', 'Libros', 'Música', 'Instrumentos', 'Herramientas', 'Servicios', 'Empleos', 'Inmuebles', 'Arte', 'Otros'];
var DELIVERY_OPTIONS = ['Recoger', 'Envío', 'Ambos'];
/* Fondos de color para publicaciones de solo texto (v1.2). Sin rosa. */
var POST_BACKGROUNDS = [
  { id: 'none', name: 'Sin fondo' },
  { id: 'rojo', name: 'Rojo WordRed' },
  { id: 'atardecer', name: 'Atardecer' },
  { id: 'mar', name: 'Mar' },
  { id: 'bosque', name: 'Bosque' },
  { id: 'violeta', name: 'Violeta' },
  { id: 'dorado', name: 'Dorado' },
  { id: 'noche', name: 'Noche' }
];
var FEELINGS = ['Feliz', 'Agradecido/a', 'Emocionado/a', 'Relajado/a', 'Orgulloso/a', 'Triste', 'Cansado/a', 'Enamorado/a', 'Bendecido/a', 'Motivado/a'];
var ACTIVITIES = ['En el trabajo', 'En casa', 'De vacaciones', 'Cocinando', 'Viendo una película', 'Escuchando música', 'Haciendo ejercicio', 'Viajando', 'Estudiando', 'Celebrando'];
function createListing(state, seller, data) {
  seller = normPhone(seller);
  if (!state.profiles[seller]) return { ok: false, error: 'Primero crea tu perfil.' };
  var title = String((data && data.title) || '').trim();
  var price = Number(data && data.price);
  var category = String((data && data.category) || '');
  var condition = String((data && data.condition) || '');
  var desc = String((data && data.desc) || '').trim();
  var city = String((data && data.city) || '').trim();
  var photos = (data && data.photos) || [];
  /* v1.2: WhatsApp del vendedor, marca, precio negociable y entrega. */
  var whatsapp = normPhone(data && data.whatsapp);
  /* v1.6: número de contacto para llamar o mandar mensaje (opcional). */
  var contactPhone = normPhone(data && data.contactPhone);
  var brand = String((data && data.brand) || '').trim().slice(0, 80);
  var negotiable = !!(data && data.negotiable);
  var delivery = String((data && data.delivery) || 'Recoger');
  if (title.length < 3) return { ok: false, error: 'El anuncio necesita un título (mínimo 3 letras).' };
  if (title.length > 120) return { ok: false, error: 'El título es demasiado largo.' };
  if (isNaN(price) || price < 0) return { ok: false, error: 'Escribe un precio válido en pesos.' };
  if (LISTING_CATEGORIES.indexOf(category) < 0) return { ok: false, error: 'Elige una categoría.' };
  if (condition !== 'Nuevo' && condition !== 'Usado') return { ok: false, error: 'Elige si es nuevo o usado.' };
  if (desc.length > 1000) return { ok: false, error: 'La descripción es demasiado larga.' };
  if (!Array.isArray(photos)) photos = [];
  /* ola 11: sin límite de fotos por anuncio — solo el almacenamiento del teléfono manda. */
  if (whatsapp && (whatsapp.length < 8 || whatsapp.length > 15)) return { ok: false, error: 'El número de WhatsApp no es válido.' };
  if (contactPhone && (contactPhone.length < 8 || contactPhone.length > 15)) return { ok: false, error: 'El número de contacto no es válido.' };
  if (DELIVERY_OPTIONS.indexOf(delivery) < 0) return { ok: false, error: 'Elige cómo entregas: recoger, envío o ambos.' };
  /* v1.2: anuncio dentro de un grupo de ventas (hay que ser miembro). */
  var salesGroupId = (data && data.salesGroupId) || null;
  if (salesGroupId) {
    var sg = state.salesGroups.filter(function (x) { return x.id === salesGroupId; })[0];
    if (!sg) return { ok: false, error: 'Ese grupo de ventas no existe.' };
    if (sg.members.indexOf(seller) < 0) return { ok: false, error: 'Tienes que ser miembro de ese grupo de ventas para publicar ahí.' };
  }
  var l = { id: uid('lst'), seller: seller, title: title, price: price, category: category, condition: condition, desc: desc, city: city.slice(0, 80), photos: photos.slice(), whatsapp: whatsapp, contactPhone: contactPhone, brand: brand, negotiable: negotiable, delivery: delivery, salesGroupId: salesGroupId, status: 'Activo', createdAt: now(), updatedAt: now(), savedBy: [], isDemo: false };
  state.listings.push(l);
  return { ok: true, listing: l };
}
function searchListings(state, viewer, opts) {
  opts = opts || {};
  var q = String(opts.q || '').trim().toLowerCase();
  var list = state.listings.slice();
  if (opts.mine) list = list.filter(function (l) { return l.seller === normPhone(opts.mine); });
  if (opts.sellers) list = list.filter(function (l) { return opts.sellers.indexOf(l.seller) >= 0; });
  if (opts.savedBy) list = list.filter(function (l) { return l.savedBy.indexOf(normPhone(opts.savedBy)) >= 0; });
  if (!opts.includeSold) list = list.filter(function (l) { return l.status === 'Activo'; });
  if (opts.category) list = list.filter(function (l) { return l.category === opts.category; });
  if (opts.delivery) list = list.filter(function (l) { return l.delivery === opts.delivery || l.delivery === 'Ambos'; });
  if (opts.negotiable) list = list.filter(function (l) { return l.negotiable; });
  if (opts.brand) list = list.filter(function (l) { return (l.brand || '').toLowerCase().indexOf(String(opts.brand).toLowerCase()) >= 0; });
  if (opts.salesGroupId) list = list.filter(function (l) { return l.salesGroupId === opts.salesGroupId; });
  if (opts.minPrice != null && opts.minPrice !== '') list = list.filter(function (l) { return l.price >= Number(opts.minPrice); });
  if (opts.maxPrice != null && opts.maxPrice !== '') list = list.filter(function (l) { return l.price <= Number(opts.maxPrice); });
  if (q) list = list.filter(function (l) { return (l.title + ' ' + l.desc + ' ' + l.city + ' ' + (l.brand || '')).toLowerCase().indexOf(q) >= 0; });
  var sort = opts.sort || 'recientes';
  if (sort === 'precio-asc') list.sort(function (a, b) { return a.price - b.price; });
  else if (sort === 'precio-desc') list.sort(function (a, b) { return b.price - a.price; });
  else list.sort(function (a, b) { return b.createdAt - a.createdAt; });
  return list;
}
/* ---- ventas: lo que vendes tú y lo que venden tus seguidos (ola 10) ---- */
function myListings(state, phone) {
  phone = normPhone(phone);
  return searchListings(state, phone, { mine: phone });
}
function followedListings(state, phone) {
  phone = normPhone(phone);
  var followed = (state.friends && state.friends[phone]) || [];
  return searchListings(state, phone, { sellers: followed });
}
/* Cambiar un anuncio (precio o cualquier dato): se actualiza para todos
   porque todos leen el mismo anuncio — en lista, detalle y búsqueda —
   y con servidor se sincroniza al guardar. */
function editListing(state, phone, listingId, data) {
  phone = normPhone(phone);
  var l = null;
  for (var i = 0; i < state.listings.length; i++) if (state.listings[i].id === listingId) { l = state.listings[i]; break; }
  if (!l) return { ok: false, error: 'Ese anuncio ya no existe.' };
  if (l.seller !== phone) return { ok: false, error: 'Solo quien publicó el anuncio puede modificarlo.' };
  if (data && data.title !== undefined) {
    var title = String(data.title || '').trim();
    if (title.length < 3) return { ok: false, error: 'El anuncio necesita un título (mínimo 3 letras).' };
    if (title.length > 120) return { ok: false, error: 'El título es demasiado largo.' };
    l.title = title;
  }
  if (data && data.price !== undefined) {
    var price = Number(data.price);
    if (isNaN(price) || price < 0) return { ok: false, error: 'Escribe un precio válido en pesos.' };
    l.price = price;
  }
  if (data && data.desc !== undefined) {
    var desc = String(data.desc || '').trim();
    if (desc.length > 1000) return { ok: false, error: 'La descripción es demasiado larga.' };
    l.desc = desc;
  }
  if (data && data.category !== undefined) {
    if (LISTING_CATEGORIES.indexOf(data.category) < 0) return { ok: false, error: 'Elige una categoría.' };
    l.category = data.category;
  }
  if (data && data.condition !== undefined) {
    if (data.condition !== 'Nuevo' && data.condition !== 'Usado') return { ok: false, error: 'Elige si es nuevo o usado.' };
    l.condition = data.condition;
  }
  if (data && data.city !== undefined) l.city = String(data.city || '').trim().slice(0, 80);
  if (data && data.brand !== undefined) l.brand = String(data.brand || '').trim().slice(0, 80);
  if (data && data.whatsapp !== undefined) {
    var wa = normPhone(data.whatsapp);
    if (wa && (wa.length < 8 || wa.length > 15)) return { ok: false, error: 'El número de WhatsApp no es válido.' };
    l.whatsapp = wa;
  }
  if (data && data.contactPhone !== undefined) {
    var cp = normPhone(data.contactPhone);
    if (cp && (cp.length < 8 || cp.length > 15)) return { ok: false, error: 'El número de contacto no es válido.' };
    l.contactPhone = cp;
  }
  if (data && data.negotiable !== undefined) l.negotiable = !!data.negotiable;
  if (data && data.delivery !== undefined) {
    if (DELIVERY_OPTIONS.indexOf(data.delivery) < 0) return { ok: false, error: 'Elige cómo entregas: recoger, envío o ambos.' };
    l.delivery = data.delivery;
  }
  if (data && Array.isArray(data.photos)) l.photos = data.photos.slice();
  l.updatedAt = now();
  return { ok: true, listing: l };
}

function markListingSold(state, phone, listingId) {
  phone = normPhone(phone);
  var l = null;
  for (var i = 0; i < state.listings.length; i++) if (state.listings[i].id === listingId) { l = state.listings[i]; break; }
  if (!l) return { ok: false, error: 'Ese anuncio ya no existe.' };
  if (l.seller !== phone) return { ok: false, error: 'Solo quien publicó el anuncio puede marcarlo como vendido.' };
  l.status = l.status === 'Vendido' ? 'Activo' : 'Vendido';
  l.updatedAt = now();
  return { ok: true, listing: l };
}
function deleteListing(state, phone, listingId) {
  phone = normPhone(phone);
  var i = -1;
  for (var k = 0; k < state.listings.length; k++) if (state.listings[k].id === listingId) { i = k; break; }
  if (i < 0) return { ok: false, error: 'Ese anuncio ya no existe.' };
  if (state.listings[i].seller !== phone) return { ok: false, error: 'Solo quien publicó el anuncio puede borrarlo.' };
  state.listings.splice(i, 1);
  return { ok: true };
}
function toggleSaveListing(state, phone, listingId) {
  phone = normPhone(phone);
  var l = null;
  for (var i = 0; i < state.listings.length; i++) if (state.listings[i].id === listingId) { l = state.listings[i]; break; }
  if (!l) return { ok: false, error: 'Ese anuncio ya no existe.' };
  var idx = l.savedBy.indexOf(phone);
  if (idx >= 0) { l.savedBy.splice(idx, 1); return { ok: true, saved: false }; }
  l.savedBy.push(phone);
  return { ok: true, saved: true };
}

/* ---------------- grupos de ventas (v1.2, dentro de Ventas) ---------------- */
function createSalesGroup(state, creator, data) {
  creator = normPhone(creator);
  if (!state.profiles[creator]) return { ok: false, error: 'Primero crea tu perfil.' };
  var name = String((data && data.name) || '').trim();
  var desc = String((data && data.desc) || '').trim();
  var category = String((data && data.category) || 'Otros');
  var rules = String((data && data.rules) || '').trim();
  var photo = (data && data.photo) || '';
  if (name.length < 3) return { ok: false, error: 'El grupo necesita un nombre (mínimo 3 letras).' };
  if (name.length > 80) return { ok: false, error: 'El nombre del grupo es demasiado largo.' };
  if (desc.length > 300) return { ok: false, error: 'La descripción es demasiado larga.' };
  if (rules.length > 500) return { ok: false, error: 'Las reglas son demasiado largas.' };
  if (LISTING_CATEGORIES.indexOf(category) < 0) category = 'Otros';
  var g = { id: uid('sg'), name: name, desc: desc, photo: photo, category: category, rules: rules, creator: creator, members: [creator],
    cover: String((data && data.cover) || ''), coverType: (data && data.coverType) === 'video' ? 'video' : 'image',
    accent: ACCENTS.map(function (a) { return a.id; }).indexOf(data && data.accent) >= 0 ? data.accent : 'rojo',
    headerGradient: HEADER_GRADIENTS.indexOf(data && data.headerGradient) >= 0 ? data.headerGradient : 'none',
    createdAt: now() };
  state.salesGroups.push(g);
  return { ok: true, group: g };
}
/* Personalizar un grupo de ventas (v1.5): solo quien lo creó; la foto del
   grupo se mantiene, la portada y los colores son aparte. */
function editSalesGroup(state, actor, groupId, data) {
  actor = normPhone(actor);
  var g = findSalesGroup(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo de ventas no existe.' };
  if (g.creator !== actor) return { ok: false, error: 'Solo quien creó el grupo puede personalizarlo.' };
  if (data.name !== undefined) {
    var name = String(data.name || '').trim();
    if (name.length < 3) return { ok: false, error: 'El grupo necesita un nombre (mínimo 3 letras).' };
    g.name = name.slice(0, 80);
  }
  if (data.desc !== undefined) g.desc = String(data.desc || '').slice(0, 300);
  if (data.cover !== undefined) g.cover = String(data.cover || '');
  if (data.coverType !== undefined) g.coverType = data.coverType === 'video' ? 'video' : 'image';
  if (!g.cover) g.coverType = 'image';
  if (data.accent !== undefined) {
    if (ACCENTS.map(function (a) { return a.id; }).indexOf(data.accent) < 0) return { ok: false, error: 'Ese color no existe.' };
    g.accent = data.accent;
  }
  if (data.headerGradient !== undefined) {
    if (HEADER_GRADIENTS.indexOf(data.headerGradient) < 0) return { ok: false, error: 'Ese degradado no existe.' };
    g.headerGradient = data.headerGradient;
  }
  if (data.rules !== undefined) g.rules = String(data.rules || '').slice(0, 500);
  return { ok: true, group: g };
}
function findSalesGroup(state, id) {
  for (var i = 0; i < state.salesGroups.length; i++) if (state.salesGroups[i].id === id) return state.salesGroups[i];
  return null;
}
function joinSalesGroup(state, phone, groupId) {
  phone = normPhone(phone);
  var g = findSalesGroup(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo de ventas no existe.' };
  if (g.members.indexOf(phone) >= 0) return { ok: false, error: 'Ya eres miembro de ese grupo.' };
  g.members.push(phone);
  return { ok: true, group: g };
}
function leaveSalesGroup(state, phone, groupId) {
  phone = normPhone(phone);
  var g = findSalesGroup(state, groupId);
  if (!g) return { ok: false, error: 'Ese grupo de ventas no existe.' };
  if (g.members.indexOf(phone) < 0) return { ok: false, error: 'No eres miembro de ese grupo.' };
  if (g.creator === phone) return { ok: false, error: 'Quien creó el grupo no puede salir. Pásale el grupo a otro miembro o elimínalo.' };
  g.members = g.members.filter(function (x) { return x !== phone; });
  return { ok: true, group: g };
}
function deleteSalesGroup(state, phone, groupId) {
  phone = normPhone(phone);
  var i = -1;
  for (var k = 0; k < state.salesGroups.length; k++) if (state.salesGroups[k].id === groupId) { i = k; break; }
  if (i < 0) return { ok: false, error: 'Ese grupo de ventas no existe.' };
  if (state.salesGroups[i].creator !== phone) return { ok: false, error: 'Solo quien creó el grupo puede eliminarlo.' };
  var gid = state.salesGroups[i].id;
  state.salesGroups.splice(i, 1);
  /* Los anuncios quedan, solo dejan de pertenecer al grupo. */
  state.listings.forEach(function (l) { if (l.salesGroupId === gid) l.salesGroupId = null; });
  return { ok: true };
}
function searchSalesGroups(state, q) {
  q = String(q || '').trim().toLowerCase();
  var list = state.salesGroups.slice();
  if (q) list = list.filter(function (g) { return (g.name + ' ' + g.desc + ' ' + g.category).toLowerCase().indexOf(q) >= 0; });
  list.sort(function (a, b) { return b.createdAt - a.createdAt; });
  return list;
}
function salesGroupListings(state, groupId) {
  return state.listings.filter(function (l) { return l.salesGroupId === groupId; })
    .sort(function (a, b) { return b.createdAt - a.createdAt; });
}

/* ---------------- perfil de ventas y valoraciones (v1.2) ---------------- */
function rateSeller(state, rater, seller, stars, comment) {
  rater = normPhone(rater); seller = normPhone(seller);
  if (!state.profiles[seller]) return { ok: false, error: 'Ese vendedor no existe.' };
  if (rater === seller) return { ok: false, error: 'No puedes valorarte a ti.' };
  stars = Number(stars);
  if (!stars || stars < 1 || stars > 5 || Math.floor(stars) !== stars) return { ok: false, error: 'Elige de 1 a 5 estrellas.' };
  comment = String(comment || '').trim().slice(0, 300);
  var existing = null;
  for (var i = 0; i < state.ratings.length; i++) {
    if (state.ratings[i].seller === seller && state.ratings[i].rater === rater) { existing = state.ratings[i]; break; }
  }
  if (existing) {
    existing.stars = stars; existing.comment = comment; existing.createdAt = now();
    return { ok: true, rating: existing, updated: true };
  }
  var r = { id: uid('rate'), seller: seller, rater: rater, stars: stars, comment: comment, createdAt: now() };
  state.ratings.push(r);
  return { ok: true, rating: r, updated: false };
}
function sellerStats(state, seller) {
  seller = normPhone(seller);
  var prof = state.profiles[seller];
  if (!prof) return null;
  var mine = state.listings.filter(function (l) { return l.seller === seller; });
  var active = mine.filter(function (l) { return l.status === 'Activo'; });
  var sold = mine.filter(function (l) { return l.status === 'Vendido'; });
  var since = prof.createdAt;
  mine.forEach(function (l) { if (l.createdAt < since) since = l.createdAt; });
  var rs = state.ratings.filter(function (r) { return r.seller === seller; });
  var total = 0;
  rs.forEach(function (r) { total += r.stars; });
  return {
    seller: seller, since: since,
    active: active, sold: sold,
    ratings: rs.slice().sort(function (a, b) { return b.createdAt - a.createdAt; }),
    avg: rs.length ? Math.round(total / rs.length * 10) / 10 : 0,
    count: rs.length
  };
}

/* ---------------- eventos (v1.1) ---------------- */
function createEvent(state, creator, data) {
  creator = normPhone(creator);
  if (!state.profiles[creator]) return { ok: false, error: 'Primero crea tu perfil.' };
  var name = String((data && data.name) || '').trim();
  var date = String((data && data.date) || '');
  var time = String((data && data.time) || '');
  var place = String((data && data.place) || '').trim();
  var desc = String((data && data.desc) || '').trim();
  if (name.length < 3) return { ok: false, error: 'El evento necesita un nombre (mínimo 3 letras).' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Elige una fecha para el evento.' };
  var ev = { id: uid('evt'), creator: creator, name: name.slice(0, 100), desc: desc.slice(0, 500), date: date, time: time, place: place.slice(0, 120), cover: (data && data.cover) || '', attendees: {}, status: 'Activo', createdAt: now() };
  state.events.push(ev);
  return { ok: true, event: ev };
}
function rsvpEvent(state, phone, eventId, status) {
  phone = normPhone(phone);
  var gv = requireVerified(state, phone); if (gv) return gv;
  var ev = null;
  for (var i = 0; i < state.events.length; i++) if (state.events[i].id === eventId) { ev = state.events[i]; break; }
  if (!ev) return { ok: false, error: 'Ese evento ya no existe.' };
  if (ev.status !== 'Activo') return { ok: false, error: 'Ese evento fue cancelado.' };
  if (status !== 'asiste' && status !== 'interes') { delete ev.attendees[phone]; return { ok: true, event: ev, status: null }; }
  ev.attendees[phone] = status;
  return { ok: true, event: ev, status: status };
}
function listEvents(state) {
  var t = new Date();
  var todayStr = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  return state.events.filter(function (e) { return e.date >= todayStr; }).sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return (a.time || '') < (b.time || '') ? -1 : 1;
  });
}
function cancelEvent(state, phone, eventId) {
  phone = normPhone(phone);
  var ev = null;
  for (var i = 0; i < state.events.length; i++) if (state.events[i].id === eventId) { ev = state.events[i]; break; }
  if (!ev) return { ok: false, error: 'Ese evento ya no existe.' };
  if (ev.creator !== phone) return { ok: false, error: 'Solo quien creó el evento puede cancelarlo.' };
  if (ev.status === 'Cancelado') return { ok: false, error: 'Ese evento ya fue cancelado.' };
  ev.status = 'Cancelado';
  return { ok: true, event: ev };
}

/* ---------------- páginas (v1.1) ---------------- */
var PAGE_CATEGORIES = ['Compras y ventas', 'Música', 'Comida', 'Deportes', 'Educación', 'Entretenimiento', 'Comunidad', 'Negocio local', 'Otro'];
function createPage(state, creator, data) {
  creator = normPhone(creator);
  if (!state.profiles[creator]) return { ok: false, error: 'Primero crea tu perfil.' };
  var name = String((data && data.name) || '').trim();
  var category = String((data && data.category) || 'Otro');
  if (name.length < 2) return { ok: false, error: 'La página necesita un nombre.' };
  if (name.length > 80) return { ok: false, error: 'El nombre de la página es demasiado largo.' };
  if (PAGE_CATEGORIES.indexOf(category) < 0) category = 'Otro';
  var p = { id: uid('page'), name: name, category: category, desc: String((data && data.desc) || '').slice(0, 300), photo: (data && data.photo) || '', creator: creator, followers: [creator], createdAt: now() };
  state.pages.push(p);
  return { ok: true, page: p };
}
function toggleFollowPage(state, phone, pageId) {
  phone = normPhone(phone);
  var p = null;
  for (var i = 0; i < state.pages.length; i++) if (state.pages[i].id === pageId) { p = state.pages[i]; break; }
  if (!p) return { ok: false, error: 'Esa página ya no existe.' };
  var idx = p.followers.indexOf(phone);
  if (idx >= 0) { p.followers.splice(idx, 1); return { ok: true, following: false, page: p }; }
  p.followers.push(phone);
  return { ok: true, following: true, page: p };
}

/* ---------------- encuestas en publicaciones (v1.1) ---------------- */
function votePoll(state, phone, postId, optionId) {
  phone = normPhone(phone);
  var gv = requireVerified(state, phone); if (gv) return gv;
  var post = null;
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === postId) { post = state.posts[i]; break; }
  if (!post) return { ok: false, error: 'Esa publicación ya no existe.' };
  if (!post.poll) return { ok: false, error: 'Esa publicación no tiene encuesta.' };
  if (!canSeePost(state, phone, post)) return { ok: false, error: 'No puedes ver esa publicación.' };
  var target = null;
  post.poll.options.forEach(function (o) { if (o.id === optionId) target = o; });
  if (!target) return { ok: false, error: 'Esa opción no existe.' };
  var voted = target.votes.indexOf(phone) >= 0;
  post.poll.options.forEach(function (o) { o.votes = o.votes.filter(function (v) { return v !== phone; }); });
  if (!voted) target.votes.push(phone);
  return { ok: true, voted: !voted, results: pollResults(post) };
}
function pollResults(post) {
  var total = 0;
  var options = (post.poll ? post.poll.options : []).map(function (o) {
    total += o.votes.length;
    return { id: o.id, text: o.text, votes: o.votes.slice(), count: o.votes.length };
  });
  return { total: total, options: options };
}

/* ---------------- borrados (v1.1: todo se borra de verdad) ---------------- */
function deleteComment(state, phone, postId, commentId) {
  phone = normPhone(phone);
  var post = null;
  for (var i = 0; i < state.posts.length; i++) if (state.posts[i].id === postId) { post = state.posts[i]; break; }
  if (!post) return { ok: false, error: 'Esa publicación ya no existe.' };
  for (var j = 0; j < post.comments.length; j++) {
    var c = post.comments[j];
    if (c.id === commentId) {
      if (c.author !== phone && post.author !== phone) return { ok: false, error: 'Solo quien comentó o quien publicó puede borrar ese comentario.' };
      post.comments.splice(j, 1);
      return { ok: true };
    }
    for (var k = 0; k < (c.replies || []).length; k++) {
      if (c.replies[k].id === commentId) {
        if (c.replies[k].author !== phone && post.author !== phone) return { ok: false, error: 'Solo quien comentó o quien publicó puede borrar esa respuesta.' };
        c.replies.splice(k, 1);
        return { ok: true };
      }
    }
  }
  return { ok: false, error: 'Ese comentario ya no existe.' };
}
function deleteStory(state, phone, storyId) {
  phone = normPhone(phone);
  var i = -1;
  for (var k = 0; k < state.stories.length; k++) if (state.stories[k].id === storyId) { i = k; break; }
  if (i < 0) return { ok: false, error: 'Esa historia ya no existe.' };
  if (state.stories[i].author !== phone) return { ok: false, error: 'Solo quien publicó la historia puede borrarla.' };
  state.stories.splice(i, 1);
  return { ok: true };
}
function deleteMessage(state, phone, messageId) {
  phone = normPhone(phone);
  for (var key in state.conversations) {
    var conv = state.conversations[key];
    for (var i = 0; i < conv.messages.length; i++) {
      if (conv.messages[i].id === messageId) {
        if (conv.messages[i].from !== phone) return { ok: false, error: 'Solo puedes borrar tus propios mensajes.' };
        conv.messages.splice(i, 1);
        return { ok: true, conversation: conv };
      }
    }
  }
  /* v1.5.15: los mensajes de los chats grupales también se borran (antes
     deleteMessage solo buscaba en conversaciones 1 a 1 y borrar un
     mensaje de grupo siempre decía "Ese mensaje ya no existe."). */
  var groups = state.groupChats || [];
  for (var g = 0; g < groups.length; g++) {
    var gc = groups[g];
    for (var j = 0; j < (gc.messages || []).length; j++) {
      if (gc.messages[j].id === messageId) {
        if (gc.messages[j].from !== phone) return { ok: false, error: 'Solo puedes borrar tus propios mensajes.' };
        gc.messages.splice(j, 1);
        return { ok: true, groupChat: gc };
      }
    }
  }
  return { ok: false, error: 'Ese mensaje ya no existe.' };
}
function deleteConversation(state, phone, other) {
  phone = normPhone(phone); other = normPhone(other);
  var key = convoKey(phone, other);
  if (!state.conversations[key]) return { ok: false, error: 'No hay conversación con esa persona.' };
  delete state.conversations[key];
  return { ok: true };
}
function deleteGroup(state, phone, groupId) {
  phone = normPhone(phone);
  var i = -1;
  for (var k = 0; k < state.groups.length; k++) if (state.groups[k].id === groupId) { i = k; break; }
  if (i < 0) return { ok: false, error: 'Ese grupo no existe.' };
  if (state.groups[i].creator !== phone) return { ok: false, error: 'Solo quien creó el grupo puede eliminarlo.' };
  var gid = state.groups[i].id;
  state.groups.splice(i, 1);
  state.posts = state.posts.filter(function (p) { return p.groupId !== gid; });
  return { ok: true };
}
function deleteAccount(state, phone) {
  phone = normPhone(phone);
  if (!state.profiles[phone]) return { ok: false, error: 'No hay cuenta con ese número.' };
  delete state.profiles[phone];
  state.posts = state.posts.filter(function (p) { return p.author !== phone; });
  state.stories = state.stories.filter(function (s) { return s.author !== phone; });
  state.listings = state.listings.filter(function (l) { return l.seller !== phone; });
  state.events = state.events.filter(function (e) { return e.creator !== phone; });
  state.pages = state.pages.filter(function (p) { return p.creator !== phone; });
  state.groups = state.groups.filter(function (g) { return g.creator !== phone; });
  Object.keys(state.friends).forEach(function (f) { state.friends[f] = state.friends[f].filter(function (x) { return x !== phone; }); });
  delete state.friends[phone];
  state.requests = state.requests.filter(function (r) { return r.from !== phone && r.to !== phone; });
  Object.keys(state.conversations).forEach(function (k) { if (state.conversations[k].participants.indexOf(phone) >= 0) delete state.conversations[k]; });
  state.notifications = state.notifications.filter(function (n) { return n.to !== phone && n.from !== phone; });
  state.posts.forEach(function (p) {
    delete p.likes[phone];
    p.comments = p.comments.filter(function (c) { return c.author !== phone; });
    p.comments.forEach(function (c) { c.replies = (c.replies || []).filter(function (r) { return r.author !== phone; }); });
    p.shares = p.shares.filter(function (s) { return s !== phone; });
    p.savedBy = p.savedBy.filter(function (s) { return s !== phone; });
    if (p.poll) p.poll.options.forEach(function (o) { o.votes = o.votes.filter(function (v) { return v !== phone; }); });
    if (p.sharedFrom && p.sharedFrom.author === phone) p.sharedFrom = null;
  });
  state.events.forEach(function (e) { delete e.attendees[phone]; });
  state.pages.forEach(function (p) { p.followers = p.followers.filter(function (f) { return f !== phone; }); });
  state.groups.forEach(function (g) { g.members = g.members.filter(function (m) { return m !== phone; }); });
  state.listings.forEach(function (l) { l.savedBy = l.savedBy.filter(function (s) { return s !== phone; }); });
  if (state.me === phone) state.me = null;
  return { ok: true };
}

/* ---------------- contenido de ejemplo ----------------
   v1.8: los perfiles de ejemplo se ven COMPLETOS, como perfiles de
   verdad: foto de perfil, portada, biografía y datos. Las imágenes son
   ilustraciones SVG generadas DENTRO de la app (nunca fotos de personas
   reales ni tomadas de internet): un avatar con la inicial y un
   degradado, y una portada con degradado y formas. */
function demoAvatarSvg(initial, bg1, bg2) {
  /* v2.0: la foto de perfil de ejemplo es una IMAGEN DE LOGO: un mosaico
     con esquinas redondeadas (como el icono de una app), degradado propio
     de la cuenta, la inicial en grande y un anillo blanco interior. */
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + bg1 + '"/><stop offset="1" stop-color="' + bg2 + '"/></linearGradient></defs>' +
    '<rect x="4" y="4" width="192" height="192" rx="44" fill="url(#g)"/>' +
    '<rect x="10" y="10" width="180" height="180" rx="38" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="3"/>' +
    '<circle cx="160" cy="44" r="30" fill="rgba(255,255,255,0.18)"/>' +
    '<circle cx="34" cy="166" r="22" fill="rgba(255,255,255,0.14)"/>' +
    '<text x="100" y="130" font-family="Arial,sans-serif" font-size="96" font-weight="bold" fill="#ffffff" text-anchor="middle">' + initial + '</text></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
/* v2.0: fotos de ejemplo generadas dentro de la app (ilustraciones SVG
   propias, nunca fotos de personas reales ni de internet). Cada tema es
   una escena sencilla y reconocible. */
function demoPhotoSvg(kind) {
  var svg = '';
  if (kind === 'tacos') {
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
      '<rect width="800" height="600" fill="#f7e8d0"/>' +
      '<rect y="380" width="800" height="220" fill="#c98d4b"/>' +
      '<ellipse cx="400" cy="330" rx="300" ry="130" fill="#ffffff"/>' +
      '<ellipse cx="400" cy="330" rx="270" ry="108" fill="none" stroke="#e0c9a8" stroke-width="6"/>' +
      '<path d="M210 330 A130 130 0 0 1 470 330 Z" fill="#f2c14e"/>' +
      '<path d="M250 330 A90 90 0 0 1 430 330 Z" fill="#8a5a2b"/>' +
      '<circle cx="300" cy="300" r="16" fill="#2fbf71"/><circle cx="350" cy="285" r="14" fill="#e01430"/><circle cx="400" cy="300" r="16" fill="#2fbf71"/><circle cx="330" cy="315" r="10" fill="#ffffff"/>' +
      '<path d="M480 330 A130 130 0 0 1 740 330 Z" fill="#f2c14e"/>' +
      '<path d="M520 330 A90 90 0 0 1 700 330 Z" fill="#8a5a2b"/>' +
      '<circle cx="570" cy="300" r="16" fill="#2fbf71"/><circle cx="620" cy="285" r="14" fill="#e01430"/><circle cx="660" cy="305" r="12" fill="#ffffff"/>' +
      '<circle cx="120" cy="470" r="46" fill="#9be515"/><circle cx="120" cy="470" r="38" fill="#c6f16d"/>' +
      '<text x="400" y="80" font-family="Arial,sans-serif" font-size="44" font-weight="bold" fill="#7a4a12" text-anchor="middle">Tacos al pastor</text></svg>';
  } else if (kind === 'atardecer') {
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
      '<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a1a"/><stop offset="0.55" stop-color="#e01430"/><stop offset="1" stop-color="#4a148c"/></linearGradient></defs>' +
      '<rect width="800" height="600" fill="url(#s)"/>' +
      '<circle cx="400" cy="300" r="90" fill="#ffd21a"/>' +
      '<circle cx="400" cy="300" r="120" fill="rgba(255,210,26,0.25)"/>' +
      '<polygon points="0,420 220,220 420,420" fill="#3a1c4d"/>' +
      '<polygon points="300,420 540,180 800,420" fill="#2a1238"/>' +
      '<rect y="420" width="800" height="180" fill="#1d3557"/>' +
      '<rect y="420" width="800" height="10" fill="rgba(255,255,255,0.35)"/>' +
      '<path d="M150 140 q20 -18 40 0 M210 110 q20 -18 40 0" stroke="#ffffff" stroke-width="6" fill="none" stroke-linecap="round"/>' +
      '<text x="400" y="560" font-family="Arial,sans-serif" font-size="40" font-weight="bold" fill="#ffffff" text-anchor="middle">Atardecer</text></svg>';
  } else {
    svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">' +
      '<rect width="800" height="600" fill="#2fbf71"/>' +
      '<rect x="30" y="30" width="740" height="540" fill="none" stroke="#ffffff" stroke-width="8"/>' +
      '<line x1="400" y1="30" x2="400" y2="570" stroke="#ffffff" stroke-width="6"/>' +
      '<circle cx="400" cy="300" r="90" fill="none" stroke="#ffffff" stroke-width="6"/>' +
      '<rect x="30" y="190" width="150" height="220" fill="none" stroke="#ffffff" stroke-width="6"/>' +
      '<rect x="620" y="190" width="150" height="220" fill="none" stroke="#ffffff" stroke-width="6"/>' +
      '<circle cx="400" cy="300" r="52" fill="#ffffff"/>' +
      '<polygon points="400,262 428,288 418,322 382,322 372,288" fill="#111111"/>' +
      '<text x="400" y="80" font-family="Arial,sans-serif" font-size="40" font-weight="bold" fill="#ffffff" text-anchor="middle">Fútbol</text></svg>';
  }
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
function demoCoverSvg(c1, c2) {
  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300" viewBox="0 0 800 300">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + c1 + '"/><stop offset="1" stop-color="' + c2 + '"/></linearGradient></defs>' +
    '<rect width="800" height="300" fill="url(#g)"/>' +
    '<circle cx="700" cy="60" r="120" fill="rgba(255,255,255,0.12)"/>' +
    '<circle cx="120" cy="250" r="90" fill="rgba(255,255,255,0.10)"/>' +
    '<circle cx="420" cy="150" r="60" fill="rgba(255,255,255,0.08)"/>' +
    '<rect x="60" y="200" width="180" height="10" rx="5" fill="rgba(255,255,255,0.25)"/>' +
    '<rect x="60" y="224" width="120" height="10" rx="5" fill="rgba(255,255,255,0.18)"/></svg>';
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
/* 1.5.33: los 20 perfiles de ejemplo. Ni animales ni animaciones: sus
   fotos de perfil son avatares neutros (inicial del nombre con degradado
   de color) y sus publicaciones usan FOTOS NEUTRAS de ejemplo incluidas
   en la app (assets/ejemplo/: paisajes y objetos, fotos gratuitas de
   Pexels) o ilustraciones simples (SVG de tacos y atardecer, ya usadas
   desde la v2.0). Nunca fotos de personas, nunca animales, nada animado.
   Todo es local: nunca va al servidor ni crea cuentas reales. */
/* ---- cuenta única de ejemplo (1.5.34) ----
   Antes había 20 cuentas de ejemplo; desde la 1.5.34 solo queda UNA:
   la cuenta oficial de ejemplo 'WordRed · Contenido de ejemplo', con un
   ejemplo de cada opción: foto, video, texto, canción, historia y grupo.
   Todo es LOCAL (nunca va al servidor, nunca crea cuentas reales) y
   siempre marcado «Ejemplo». Sin animales ni animaciones: fotos neutras
   (paisajes y objetos) e ilustraciones simples. */
var DEMO_PROFILE_1534 = { phone: '0000000000', name: 'WordRed · Contenido de ejemplo', bio: 'Cuenta oficial de ejemplo. Todo lo que publica esta cuenta es contenido de ejemplo para que veas cómo se ve WordRed.', initial: 'W', bg1: '#E60026', bg2: '#8F0A1E', job: 'Equipo de WordRed', city: 'Ciudad de México', education: '', accent: 'rojo', frame: 'rojo', headerGradient: 'rojo' };
/* Publicaciones iniciales de ejemplo (demoKey: identidad estable para no
   duplicarlas). Una de cada opción: foto, video, texto, canción,
   historia (en seedDemo) y grupo (en seedDemo). El video es un clip
   corto neutro (la ciudad, 6 s, sin movimiento); la canción es del
   catálogo, que desde la 1.5.34 trae audio real y sí se escucha. */
/* 1.5.44: portada fija del video de ejemplo (un fotograma real del clip,
   generado con ffmpeg). La captura en vivo no se generaba para el asset
   local y el reel quedaba en negro; con la portada guardada el reel la
   muestra al abrir el inicio, sin tocar nada. */
var DEMO_VIDEO_COVER_1544 = 'ejemplo/video-ciudad.jpg';
var DEMO_SEED_POSTS_1534 = [
  { key: 'ejemplo-bienvenida', author: '0000000000', text: '¡Bienvenido a WordRed! Esta es la cuenta oficial de ejemplo. Publica tu primera foto, agrega amigos y crea tu primer grupo. #WordRed', minutesAgo: 5, media: '', mediaType: '' },
  { key: 'ejemplo-foto', author: '0000000000', text: 'Así se ve una publicación con foto en WordRed. Esta es una foto de ejemplo: el amanecer de hoy. #foto #ejemplo', minutesAgo: 40, media: 'ejemplo/amanecer.jpg', mediaType: 'image' },
  { key: 'ejemplo-video', author: '0000000000', text: 'Así se ve una publicación con video en WordRed. Este es un video de ejemplo: la ciudad de noche. #video #ejemplo', minutesAgo: 90, media: 'ejemplo/video-ciudad.mp4', mediaType: 'video', thumb: DEMO_VIDEO_COVER_1544, videoOrientation: 'horizontal' },
  { key: 'ejemplo-cancion', author: '0000000000', text: 'Así suena una publicación con canción en WordRed. Esta canción es de ejemplo y sí se escucha: toca Sonido. #musica #ejemplo', minutesAgo: 120, media: '', mediaType: '', song: 'cancion-2' },
  { key: 'ejemplo-texto', author: '0000000000', text: 'Y así se ve una publicación solo con texto. frase del día: cada día es una nueva oportunidad. #motivacion #ejemplo', minutesAgo: 180, media: '', mediaType: '' },
  { key: 'ejemplo-cafe', author: '0000000000', text: 'Otra foto de ejemplo: el café de la mañana. Las publicaciones de ejemplo desaparecen solas cuando ya hay 10 publicaciones reales. #cafe #ejemplo', minutesAgo: 240, media: 'ejemplo/cafe.jpg', mediaType: 'image' }
];
function addDemoProfile1534(state, d, t) {
  state.profiles[d.phone] = {
    phone: d.phone, name: d.name, bio: d.bio,
    photo: demoAvatarSvg(d.initial, d.bg1, d.bg2), cover: demoCoverSvg(d.bg1, d.bg2), createdAt: t, isDemo: true,
    frame: d.frame || 'none', accent: d.accent || 'rojo', headerGradient: d.headerGradient || 'none',
    job: d.job || '', education: d.education || '', city: d.city || '',
    relationship: '', birthday: '', website: '',
    pinnedPosts: [], sectionPrivacy: { bio: 'Público', friends: 'Público', posts: 'Público' }
  };
  if (!state.friends[d.phone]) state.friends[d.phone] = [];
}
function addDemoSeedPost1534(state, d, t) {
  if ((state.posts || []).some(function (p) { return p.demoKey === d.key; })) return false;
  var media = d.media || '';
  var mediaType = d.mediaType || '';
  state.posts.push({
    id: uid('post'), author: d.author, text: d.text, demoKey: d.key,
    media: media, mediaType: mediaType,
    videoThumb: d.thumb || '',
    videoOrientation: d.videoOrientation || '',
    privacy: 'Público', groupId: null, sharedFrom: null,
    createdAt: t - d.minutesAgo * 60000,
    likes: {}, comments: [], shares: [], savedBy: [], isDemo: true,
    song: d.song ? validateSong(songFromCatalog(d.song)) : null
  });
  return true;
}
function seedDemo(state) {
  if (state.demoSeeded) return { ok: false, error: 'El contenido de ejemplo ya está.' };
  state.demoSeeded = true;
  var t = now();
  addDemoProfile1534(state, DEMO_PROFILE_1534, t);
  DEMO_SEED_POSTS_1534.forEach(function (d) { addDemoSeedPost1534(state, d, t); });
  /* Una historia de ejemplo de la cuenta única. */
  state.stories.push({ id: uid('story'), author: '0000000000', text: '¡Hola! Esta es la historia de ejemplo de WordRed. ¿Qué les parece?', media: 'ejemplo/amanecer.jpg', mediaType: 'image', createdAt: t - 20 * 60000, views: [], likes: {}, comments: [], shares: [], isDemo: true });
  var g = { id: uid('grp'), name: 'Cocina casera (ejemplo)', desc: 'Grupo de ejemplo para compartir recetas y fotos de comida.', creator: '0000000000', members: ['0000000000'], createdAt: t };
  state.groups.push(g);
  state.posts.push({
    id: uid('post'), author: '0000000000', text: 'Bienvenidos al grupo de ejemplo. Aquí va la primera receta: salsa verde casera. ¿Alguien tiene su versión?', media: '', mediaType: '',
    privacy: 'Público', groupId: g.id, sharedFrom: null, demoKey: 'ejemplo-grupo',
    createdAt: t - 30 * 60000, likes: {}, comments: [], shares: [], savedBy: [], isDemo: true
  });
  return { ok: true };
}
/* 1.5.34: de 20 cuentas de ejemplo a solo 1. En una app que ya tenía
   las 20, la migración se hace UNA sola vez (bandera demoMigrated1534):
   se borran las 19 cuentas viejas, sus publicaciones e historias y sus
   grupos de ejemplo, y se siembra la cuenta única con sus 6 publicaciones,
   su historia y su grupo. Después solo se completa lo que falte
   (idempotente: nunca duplica). */
function ensureDemo1534(state) {
  if (!state || !state.demoSeeded) return { ok: false, addedProfiles: 0, addedPosts: 0, migrated: 0, removed: 0 };
  var t = now();
  var addedProfiles = 0, addedPosts = 0, migrated = 0, removed = 0;
  if (!state.demoMigrated1534) {
    state.demoMigrated1534 = true;
    migrated = 1;
    /* Borra las 19 cuentas viejas (todas menos la oficial '0000000000'). */
    Object.keys(state.profiles || {}).forEach(function (phone) {
      var p = state.profiles[phone];
      if (p && p.isDemo && phone !== '0000000000') { delete state.profiles[phone]; removed++; }
    });
    /* Borra todas las publicaciones e historias de ejemplo (se siembran de nuevo). */
    var before = (state.posts || []).length;
    state.posts = (state.posts || []).filter(function (p) { return !(p && p.isDemo); });
    removed += before - state.posts.length;
    var sb = (state.stories || []).length;
    state.stories = (state.stories || []).filter(function (s) { return !(s && s.isDemo); });
    removed += sb - state.stories.length;
    /* Borra los grupos de ejemplo viejos (creados por cuentas viejas). */
    var gb = (state.groups || []).length;
    state.groups = (state.groups || []).filter(function (g) { return !(g && g.creator && g.creator !== '0000000000' && String(g.name || '').indexOf('(ejemplo)') >= 0); });
    removed += gb - state.groups.length;
  }
  if (!state.profiles['0000000000']) { addDemoProfile1534(state, DEMO_PROFILE_1534, t); addedProfiles++; }
  DEMO_SEED_POSTS_1534.forEach(function (d) {
    if (addDemoSeedPost1534(state, d, t)) addedPosts++;
  });
  /* 1.5.44: la publicación de ejemplo con video que ya existe (sembrada
     antes, sin portada) recibe la portada fija, para que su reel deje
     de verse en negro. */
  (state.posts || []).forEach(function (p) {
    if (p && p.demoKey === 'ejemplo-video' && !p.videoThumb) p.videoThumb = DEMO_VIDEO_COVER_1544;
    /* 1.5.55: el video de ejemplo es horizontal (900×544): su orientación
       queda guardada para que la fila de arriba (solo verticales) no lo
       muestre desde la primera vez. */
    if (p && p.demoKey === 'ejemplo-video' && !p.videoOrientation) p.videoOrientation = 'horizontal';
  });
  /* Una historia de ejemplo (si no hay ninguna de la cuenta única). */
  if (!(state.stories || []).some(function (s) { return s && s.isDemo && s.author === '0000000000'; })) {
    state.stories.push({ id: uid('story'), author: '0000000000', text: '¡Hola! Esta es la historia de ejemplo de WordRed. ¿Qué les parece?', media: 'ejemplo/amanecer.jpg', mediaType: 'image', createdAt: t - 20 * 60000, views: [], likes: {}, comments: [], shares: [], isDemo: true });
    addedPosts++;
  }
  /* Un grupo de ejemplo con su publicación. El grupo puede sobrevivir a
     la migración aunque su publicación se borró: se repone la que falte. */
  var gEx = (state.groups || []).filter(function (g) { return g && String(g.name || '').indexOf('(ejemplo)') >= 0; })[0];
  if (!gEx) {
    gEx = { id: uid('grp'), name: 'Cocina casera (ejemplo)', desc: 'Grupo de ejemplo para compartir recetas y fotos de comida.', creator: '0000000000', members: ['0000000000'], createdAt: t };
    state.groups.push(gEx);
  }
  if (!(state.posts || []).some(function (p) { return p && p.demoKey === 'ejemplo-grupo'; })) {
    state.posts.push({
      id: uid('post'), author: '0000000000', text: 'Bienvenidos al grupo de ejemplo. Aquí va la primera receta: salsa verde casera. ¿Alguien tiene su versión?', media: '', mediaType: '',
      privacy: 'Público', groupId: gEx.id, sharedFrom: null, demoKey: 'ejemplo-grupo',
      createdAt: t - 30 * 60000, likes: {}, comments: [], shares: [], savedBy: [], isDemo: true
    });
    addedPosts++;
  }
  return { ok: true, addedProfiles: addedProfiles, addedPosts: addedPosts, migrated: migrated, removed: removed };
}
/* ---- actividad de ejemplo (1.5.34) ----
   Mientras la app está abierta, de vez en cuando la cuenta única de
   ejemplo publica algo nuevo o da Me gusta a una de sus publicaciones.
   Todo es LOCAL (nunca va al servidor, nunca crea avisos) y siempre
   marcado «Ejemplo». Si los ejemplos ya están ocultos (10 publicaciones
   reales o el interruptor), no pasa nada. Solo fotos neutras y texto. */
var DEMO_ACTIVITY_1534 = [
  { text: 'Publicación de ejemplo: así se ve una foto en WordRed. #ejemplo', media: 'ejemplo/cafe.jpg', mediaType: 'image' },
  { text: 'Publicación de ejemplo: las flores, en foto. #ejemplo', media: 'ejemplo/flores.jpg', mediaType: 'image' },
  { text: 'Publicación de ejemplo: la montaña al amanecer. #ejemplo', media: 'ejemplo/montana.jpg', mediaType: 'image' },
  { text: 'Publicación de ejemplo: el mar en calma. #ejemplo', media: 'ejemplo/playa.jpg', mediaType: 'image' },
  { text: 'Publicación de ejemplo: la ciudad de noche. #ejemplo', media: 'ejemplo/ciudad.jpg', mediaType: 'image' },
  { text: 'Publicación de ejemplo: mi libro de esta semana. #ejemplo', media: 'ejemplo/libros.jpg', mediaType: 'image' },
  { text: 'Publicación de ejemplo: amanecer en el lago. #ejemplo', media: 'ejemplo/lago.jpg', mediaType: 'image' },
  { text: 'Publicación de ejemplo: el amanecer de hoy, sin filtros. #ejemplo', media: 'ejemplo/amanecer.jpg', mediaType: 'image' },
  { text: 'Publicación de ejemplo: hoy el día está perfecto para caminar. #ejemplo', media: '', mediaType: '' },
  { text: 'Publicación de ejemplo: ¿cuál es su lugar favorito para leer? #ejemplo', media: '', mediaType: '' }
];
var DEMO_ACTIVITY_MAX_POSTS = 60; /* la siembra inicial ya trae 6 publicaciones de ejemplo */
function demoActivityPost(state) {
  if (!state || shouldHideExamples(state)) return null;
  var demos = Object.keys(state.profiles).filter(function (k) { return state.profiles[k].isDemo; });
  if (!demos.length) return null;
  var demoPosts = (state.posts || []).filter(function (p) { return p.isDemo; });
  if (demoPosts.length >= DEMO_ACTIVITY_MAX_POSTS) return null;
  var author = '0000000000';
  if (!state.profiles[author]) return null;
  var t = DEMO_ACTIVITY_1534[Math.floor(Math.random() * DEMO_ACTIVITY_1534.length)];
  var post = {
    id: uid('post'), author: author, text: t.text,
    media: t.media || '', mediaType: t.mediaType || '', videoThumb: '',
    privacy: 'Público', groupId: null, sharedFrom: null,
    createdAt: now(), likes: {}, comments: [], shares: [], savedBy: [], isDemo: true, song: null
  };
  state.posts.push(post);
  return post;
}
function demoActivityLike(state) {
  if (!state || shouldHideExamples(state)) return null;
  var demos = Object.keys(state.profiles).filter(function (k) { return state.profiles[k].isDemo; });
  if (!demos.length) return null;
  var targets = (state.posts || []).filter(function (p) { return p.isDemo; });
  if (!targets.length) return null;
  var post = targets[Math.floor(Math.random() * targets.length)];
  var candidates = demos.filter(function (d) { return !post.likes[d]; });
  if (!candidates.length) return null;
  var by = candidates[Math.floor(Math.random() * candidates.length)];
  post.likes[by] = 'Me gusta';
  return { postId: post.id, by: by };
}

/* ---------------- sincronización con el servidor ---------------- */
function serverBase(state) {
  var u = String((state.settings && state.settings.serverUrl) || '').trim().replace(/\/+$/, '');
  return u || DEFAULT_SERVER_URL;
}
async function serverFetch(state, path, method, body, timeoutMs, extra) {
  var base = serverBase(state);
  if (!base) return { ok: false, error: 'Sin conexión. Todo se guarda en este teléfono.' };
  // v1.2 ola 12: la app se vincula con el servidor con un token (código de
  // 6 dígitos verificado en segundo plano). Sin token, el servidor
  // rechaza todo lo que necesita saber quién escribe (401).
  var headers = { 'Content-Type': 'application/json' };
  if (state.settings && state.settings.serverToken) headers['Authorization'] = 'Bearer ' + state.settings.serverToken;
  /* 1.5.53: encabezados extra (p. ej. la clave de creador
     'x-creator-key' de la app Creador, que va fuera de este archivo). */
  if (extra && extra.headers) Object.keys(extra.headers).forEach(function (k) { headers[k] = extra.headers[k]; });
  // v1.6: timeout opcional. Sin él, una petición al servidor dormido
  // (Render gratuito) se quedaba colgada y la pantalla se quedaba en
  // "Llamando" o "Transmitir" sin ninguna respuesta.
  var controller = null, timer = null;
  var fetchOpts = {
    method: method || 'GET',
    headers: headers,
    body: body ? JSON.stringify(body) : undefined
  };
  if (timeoutMs && typeof AbortController !== 'undefined') {
    try {
      controller = new AbortController();
      fetchOpts.signal = controller.signal;
      timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, timeoutMs);
    } catch (e) { controller = null; timer = null; }
  }
  try {
    var res = await fetch(base + path, fetchOpts);
    if (timer) clearTimeout(timer);
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.status === 401) {
      if (state.settings) state.settings.serverToken = '';
      return { ok: false, authExpired: true, status: 401, error: 'La conexión venció. Se intentará de nuevo sola.' };
    }
    if (!res.ok) return { ok: false, status: res.status, error: (data && data.error) || ('La conexión respondió ' + res.status) };
    return { ok: true, status: res.status, data: data };
  } catch (e) {
    if (timer) clearTimeout(timer);
    var aborted = e && (e.name === 'AbortError' || String(e.message || '').toLowerCase().indexOf('abort') >= 0);
    if (aborted) return { ok: false, error: 'El servidor tardó demasiado en responder' };
    return { ok: false, error: 'No se pudo conectar: ' + (e && e.message ? e.message : 'sin conexión') };
  }
}
/* v1.5.11: ¿es un error de conexión? Solo estos dos se reintentan: el
   servidor gratuito de Render se duerme tras 15 min sin uso y tarda
   ~30-60 s en despertar; una petición que cae mientras despierta falla
   con 'No se pudo conectar' o se corta por timeout. Un 401/403/404/500
   es respuesta del servidor, no falta de conexión, y no se reintenta. */
function isConnectionError(r) {
  if (!r || r.ok || !r.error) return false;
  return r.error.indexOf('No se pudo conectar') === 0 || r.error === 'El servidor tardó demasiado en responder';
}
/* 1.5.58: ¿se puede reintentar el ENVÍO DE UNA PUBLICACIÓN al servidor?
   Además de los errores de conexión, un 5xx (el servidor responde pero
   falló: Render reiniciando o despertando) y un 401 (la vinculación
   venció y se renueva sola) se reintentan: el servidor ignora los
   duplicados por id, así que reenviar una publicación es seguro. Un
   400/403/404 es un rechazo del contenido y NO se reintenta: ahí la
   publicación queda marcada con el error y su contenido se guarda en
   borradores. Solo se usa para publicaciones e historias, no para
   reacciones o comentarios (que podrían duplicarse). */
function isRetryableServerError(r) {
  if (!r || r.ok) return false;
  if (isConnectionError(r)) return true;
  if (r.authExpired) return true;
  if (typeof r.status === 'number' && r.status >= 500 && r.status < 600) return true;
  return false;
}
/* v1.5.11: reintenta una petición que falla por conexión (p. ej. el
   DELETE al borrar, mientras el servidor despierta): 3 intentos en
   total, el primero inmediato, luego esperar ~5 s y ~15 s, cada uno
   con su propio timeout de 30 s para que una petición colgada no se
   quede esperando para siempre. opts: {attempts, delays, timeoutMs,
   sleep, onRetry} (onRetry se llama antes de cada reintento). */
async function serverFetchWithRetry(state, path, method, body, opts) {
  opts = opts || {};
  var attempts = opts.attempts || 3;
  var delays = opts.delays || [0, 5000, 15000];
  var timeoutMs = (opts.timeoutMs == null ? 30000 : opts.timeoutMs);
  var sleep = opts.sleep || function (ms) { return new Promise(function (res) { setTimeout(res, ms); }); };
  var onRetry = opts.onRetry || null;
  var r = null;
  for (var i = 0; i < attempts; i++) {
    if (i > 0) {
      if (onRetry) { try { onRetry(i); } catch (e) {} }
      await sleep(delays[i] == null ? 0 : delays[i]);
    }
    r = await serverFetch(state, path, method, body, timeoutMs, opts.extra || null);
    if (r.ok) return r;
    if (!isConnectionError(r)) return r;
  }
  return r;
}
/* Cola de pendientes sin conexión (v1.2, ola 12): todo lo que no se pudo
   enviar al servidor queda guardado y se reintenta al reconectar.
   Un elemento es {kind:'http', path, method, body} (reintento genérico)
   o el formato viejo {kind:'message', convo, to, message}. */
function queuePending(state, item) {
  if (!state.pendingQueue) state.pendingQueue = [];
  if (!item || !item.kind) return false;
  state.pendingQueue.push(item);
  if (state.pendingQueue.length > 200) state.pendingQueue = state.pendingQueue.slice(-200);
  return true;
}
/* Refresca el cuerpo de un envío pendiente con lo que hay guardado en
   el teléfono (v1.4): si una foto se subió al servidor después de
   encolar el envío, el cuerpo lleva la URL nueva en vez del archivo
   local. */
function profileBody(state) {
  var p = (state.profiles && state.profiles[state.me]) || {};
  return {
    name: p.name || '', bio: p.bio || '', photo: p.photo || '', cover: p.cover || '',
    coverType: p.coverType || 'image', frame: p.frame || 'none', accent: p.accent || 'rojo',
    headerGradient: p.headerGradient || 'none', job: p.job || '', education: p.education || '',
    city: p.city || '', relationship: p.relationship || '', birthday: p.birthday || '',
    website: p.website || '', pinnedPosts: p.pinnedPosts || [],
    sectionPrivacy: p.sectionPrivacy || { bio: 'Público', friends: 'Público', posts: 'Público' }
  };
}
function refreshPendingBody(state, item) {
  if (!item || item.kind !== 'http' || !item.body) return item.body;
  var path = item.path || '';
  var body = item.body;
  var method = item.method || 'POST';
  function findIn(list, id) { return (list || []).filter(function (x) { return x.id === id; })[0]; }
  if (path === '/api/profile') return profileBody(state);
  if (path === '/api/posts' && body.post && body.post.id) {
    var lp = findIn(state.posts, body.post.id);
    if (lp) { body.post.media = lp.media; body.post.mediaType = lp.mediaType; body.post.mediaList = lp.mediaList; body.post.audioCover = lp.audioCover; if (lp.song) body.post.song = lp.song; }
    return body;
  }
  if (method === 'PUT' && path.indexOf('/api/posts/') === 0 && body.post && body.post.id) {
    var ep = findIn(state.posts, body.post.id);
    if (ep) { body.post.media = ep.media; body.post.mediaType = ep.mediaType; body.post.mediaList = ep.mediaList; body.post.audioCover = ep.audioCover; if (ep.song) body.post.song = ep.song; }
    return body;
  }
  if (path === '/api/stories' && body.story && body.story.id) {
    var st = findIn(state.stories, body.story.id);
    if (st) { body.story.media = st.media; body.story.mediaType = st.mediaType; }
    return body;
  }
  if (path === '/api/listings' && body.listing && body.listing.id) {
    var li = findIn(state.listings, body.listing.id);
    if (li) body.listing.photos = li.photos;
    return body;
  }
  if (method === 'PUT' && path.indexOf('/api/listings/') === 0 && body.listing && body.listing.id) {
    var el = findIn(state.listings, body.listing.id);
    if (el) body.listing.photos = el.photos;
    return body;
  }
  if (path === '/api/messages' && body.message && body.message.id) {
    var conv = (state.conversations || {})[body.message.to] || (state.conversations || {})[body.message.from];
    var mm = null;
    if (conv) mm = (conv.messages || []).filter(function (x) { return x.id === body.message.id; })[0];
    if (mm) { body.message.media = mm.media; body.message.mediaType = mm.mediaType; body.message.file = mm.file; body.message.voice = mm.voice; }
    return body;
  }
  if (path === '/api/events' && body.event && body.event.id) {
    var ev = findIn(state.events, body.event.id);
    if (ev) body.event.cover = ev.cover;
    return body;
  }
  if (path === '/api/pages' && body.page && body.page.id) {
    var pg = findIn(state.pages, body.page.id);
    if (pg) body.page.photo = pg.photo;
    return body;
  }
  if (path === '/api/groups' && body.group && body.group.id) {
    var gr = findIn(state.groups, body.group.id);
    if (gr) body.group.cover = gr.cover;
    return body;
  }
  if (path === '/api/sales-groups' && body.group && body.group.id) {
    var sg = findIn(state.salesGroups, body.group.id);
    if (sg) body.group.photo = sg.photo;
    return body;
  }
  return body;
}
/* 1.5.62: ¿un valor de medio sigue siendo local? (data:/content:/
   blob: son archivos de este teléfono, no URLs del servidor). */
function isLocalMediaValue1562(v) {
  var s = String(v || '');
  return s.indexOf('data:') === 0 || s.indexOf('content://') === 0 || s.indexOf('blob:') === 0;
}
function postPendingHasLocalMedia1562(body) {
  var p = body && body.post;
  if (!p) return false;
  if (isLocalMediaValue1562(p.media)) return true;
  if (Array.isArray(p.mediaList)) {
    for (var i = 0; i < p.mediaList.length; i++) {
      var m = p.mediaList[i];
      if (m && isLocalMediaValue1562(m.src || m.url)) return true;
    }
  }
  if (isLocalMediaValue1562(p.audioCover)) return true;
  if (p.song && isLocalMediaValue1562(p.song.src)) return true;
  return false;
}
/* 1.5.62: ¿este envío pendiente es una publicación (o su edición) con
   medio todavía local? Esos envíos no se mandan hasta que el medio sea
   una URL (ver flushPendingQueue). */
function isPostPendingBody1562(item, body) {
  if (!item || item.kind !== 'http') return false;
  body = body || item.body;
  if (!body) return false;
  var path = String(item.path || '');
  if (path === '/api/posts') return postPendingHasLocalMedia1562(body);
  if ((item.method || 'POST') === 'PUT' && path.indexOf('/api/posts/') === 0) return postPendingHasLocalMedia1562(body);
  return false;
}
/* Aplica la URL de un archivo ya subido al campo local al que
   pertenece (v1.4): foto de perfil, foto de una publicación, etc. */
function applyMediaUrl(state, a, url) {
  if (!a || !a.type || !url) return;
  function findIn(list, id) { return (list || []).filter(function (x) { return x.id === id; })[0]; }
  if (a.type === 'profile' && state.profiles[state.me]) {
    if (a.field === 'cover') state.profiles[state.me].cover = url;
    else state.profiles[state.me].photo = url;
  } else if (a.type === 'post') {
    var p = findIn(state.posts, a.id);
    if (p) {
      if (a.field === 'media') { p.media = url; if (p.mediaList && p.mediaList[0]) p.mediaList[0].src = url; }
      else if (a.field === 'mediaList' && typeof a.index === 'number' && p.mediaList && p.mediaList[a.index]) { p.mediaList[a.index].src = url; if (a.index === 0) p.media = url; }
      else if (a.field === 'audioCover') p.audioCover = url;
      else if (a.field === 'song' && p.song) p.song.src = url;
    }
  } else if (a.type === 'story') {
    var s = findIn(state.stories, a.id);
    if (s && a.field === 'media') s.media = url;
  } else if (a.type === 'listing') {
    var l = findIn(state.listings, a.id);
    if (l && a.field === 'photos' && typeof a.index === 'number' && l.photos) l.photos[a.index] = url;
  } else if (a.type === 'message') {
    Object.keys(state.conversations || {}).forEach(function (k) {
      (state.conversations[k].messages || []).forEach(function (m) {
        if (m.id !== a.id) return;
        if (a.field === 'media') m.media = url;
        else if (a.field === 'file' && m.file) m.file.uri = url;
        else if (a.field === 'voice' && m.voice) m.voice.uri = url;
      });
    });
  } else if (a.type === 'event') {
    var e = findIn(state.events, a.id);
    if (e && a.field === 'cover') e.cover = url;
  } else if (a.type === 'page') {
    var pg = findIn(state.pages, a.id);
    if (pg && a.field === 'photo') pg.photo = url;
  } else if (a.type === 'group') {
    var g = findIn(state.groups, a.id);
    if (g && a.field === 'cover') g.cover = url;
  } else if (a.type === 'salesgroup') {
    var sg = findIn(state.salesGroups, a.id);
    if (sg && a.field === 'photo') sg.photo = url;
    else if (sg && a.field === 'cover') sg.cover = url;
  }
}
/* Subida de archivos al servidor por partes (v1.4): igual que el puente
   nativo, en trozos de 256 KB de base64. Sin tope de tamaño impuesto:
   el límite real es el disco del servidor. */
var MEDIA_CHUNK_B64 = 1024 * 1024; /* 1.5.30: trozos de 1 MB (antes 256 KB): menos viajes al servidor y la subida va más rápido. */
/* 1.5.46: el último error de subida, para que el mensaje final distinga
   si de verdad no hay internet ('offline') de si el servidor no
   respondió ('server', p. ej. Render dormido despertando) o el archivo
   no se pudo leer ('read'). 'error' es cualquier otra respuesta del
   servidor (401/403/404/500: eso no es falta de conexión). */
var _lastMediaUploadError1546 = null;
function mediaUploadFailKind1546(r) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (r && isConnectionError(r)) return 'server';
  return 'error';
}
function lastMediaUploadError1546() { return _lastMediaUploadError1546; }
/* 1.5.46: una espera inyectable para las pruebas (en la app es el
   setTimeout normal). */
var _mediaUploadSleep1546 = null;
function setMediaUploadSleep1546(fn) { _mediaUploadSleep1546 = (typeof fn === 'function') ? fn : null; }
function mediaUploadSleep1546Fn(sleep) {
  if (sleep) return sleep;
  if (_mediaUploadSleep1546) return _mediaUploadSleep1546;
  return function (ms) { return new Promise(function (res) { setTimeout(res, ms); }); };
}
/* 1.5.46: abrir la subida va con reintento (el servidor gratuito se
   duerme tras 15 min sin uso y tarda ~30-60 s en despertar): 3
   intentos, 30 s cada uno, esperas 0/5 s/15 s. onRetry avisa para que
   la barra diga que el servidor está despertando. */
async function startServerMediaUpload(state, name, mime, opts) {
  opts = opts || {};
  var r = await serverFetchWithRetry(state, '/api/media/start', 'POST', { name: name || 'archivo', type: mime || 'application/octet-stream' }, { attempts: 3, delays: [0, 5000, 15000], timeoutMs: (opts.timeoutMs == null ? 30000 : opts.timeoutMs), sleep: mediaUploadSleep1546Fn(opts.sleep), onRetry: opts.onRetry || null });
  if (!r.ok || !r.data || !r.data.uploadId) { _lastMediaUploadError1546 = mediaUploadFailKind1546(r); return null; }
  return r.data.uploadId;
}
async function sendServerMediaChunkRaw1546(state, uploadId, b64, opts) {
  opts = opts || {};
  /* 1.5.62: timeout por trozo 60 s (antes 30 s: un POST de 1,4 MB se
     atora con facilidad en datos móviles lentos y la subida se cortaba). */
  return await serverFetch(state, '/api/media/chunk', 'POST', { uploadId: uploadId, data: b64 }, (opts.timeoutMs == null ? 60000 : opts.timeoutMs));
}
/* 1.5.46: el trozo se manda UNA sola vez (nunca se reintenta en su
   lugar: el servidor lo añade al archivo, así que si el envío llegó
   pero se perdió la respuesta, reenviarlo duplicaría esos bytes y
   corrompería el archivo). 1.5.62: si la respuesta se pierde, la
   REANUDACIÓN pregunta al servidor cuántos bytes lleva recibidos y
   salta esos trozos con el mismo uploadId (ver uploadMediaChunks). */
async function sendServerMediaChunk(state, uploadId, b64, opts) {
  var r = await sendServerMediaChunkRaw1546(state, uploadId, b64, opts);
  return !!(r.ok && r.data && r.data.ok);
}
/* 1.5.62: bytes exactos que representa una cadena base64 (el relleno
   '=' del final no son bytes: sin restarlo, un trozo del puente de 1 MB
   se contaba con 2 bytes de más y la reanudación no cuadraba). */
function b64DecodedBytes1562(b64) {
  var s = String(b64 || '').replace(/\s/g, '');
  if (!s) return 0;
  var pad = 0;
  if (s.charAt(s.length - 1) === '=') pad++;
  if (s.charAt(s.length - 2) === '=') pad++;
  return Math.max(0, Math.floor(s.length * 3 / 4) - pad);
}
/* 1.5.62: cuánto lleva recibido el servidor de una subida (para
   reanudarla donde se quedó). Devuelve {received, finished, id, url}
   o null si el servidor ya no la conoce. */
async function getUploadStatus1562(state, uploadId, opts) {
  opts = opts || {};
  var r = await serverFetchWithRetry(state, '/api/media/status?uploadId=' + encodeURIComponent(uploadId), 'GET', null, { attempts: 3, delays: [0, 5000, 15000], timeoutMs: (opts.timeoutMs == null ? 30000 : opts.timeoutMs), sleep: mediaUploadSleep1546Fn(opts.sleep), onRetry: opts.onRetry || null });
  if (!r.ok || !r.data || typeof r.data.received !== 'number') return null;
  return { received: r.data.received, finished: !!r.data.finished, id: r.data.id || null, url: r.data.url || null };
}
/* 1.5.46: cerrar la subida va con reintento como abrirla (3 intentos,
   30 s cada uno, esperas 0/5 s/15 s). */
async function finishServerMediaUpload(state, uploadId, opts) {
  opts = opts || {};
  var r = await serverFetchWithRetry(state, '/api/media/finish', 'POST', { uploadId: uploadId }, { attempts: 3, delays: [0, 5000, 15000], timeoutMs: (opts.timeoutMs == null ? 30000 : opts.timeoutMs), sleep: mediaUploadSleep1546Fn(opts.sleep), onRetry: opts.onRetry || null });
  if (!r.ok || !r.data || !r.data.url) { _lastMediaUploadError1546 = mediaUploadFailKind1546(r); return null; }
  /* v1.4: con Cloudinary configurado el servidor devuelve la URL
     absoluta de Cloudinary (para siempre); sin él devuelve la ruta
     relativa /media/... del respaldo local del servidor. */
  if (/^https?:\/\//.test(r.data.url)) return r.data.url;
  return serverBase(state) + r.data.url;
}
/* Sube con un lector de trozos: makeGetChunk() devuelve un getChunk()
   NUEVO en cada intento (el lector se agota al leer).
   Devuelve la URL pública o null.
   1.5.62: si un trozo falla por conexión, la subida REANUDA donde se
   quedó con el MISMO uploadId (antes se reiniciaba COMPLETA desde cero
   con un uploadId nuevo, hasta 2 veces, y en datos móviles débiles se
   veía el error AL FINAL tras subir el archivo 3 veces). El
   servidor dice cuántos bytes lleva recibidos (GET /api/media/status)
   y el cliente salta esos trozos; el porcentaje continúa desde donde
   iba, nunca vuelve atrás. El timeout por trozo es 60 s (antes 30 s);
   abrir y cerrar siguen en 30 s con 3 intentos. opts: {sleep, onStatus,
   maxRestarts, restartDelays, timeoutMs, chunkTimeoutMs}. onStatus('waking')
   avisa mientras se reanuda para que la barra lo diga. */
async function uploadMediaChunks(state, name, mime, total, makeGetChunk, onProgress, opts) {
  var base = serverBase(state);
  if (!base || !state.settings || !state.settings.serverToken) return null;
  opts = opts || {};
  _lastMediaUploadError1546 = null;
  var sleep = mediaUploadSleep1546Fn(opts.sleep);
  var onStatus = opts.onStatus || null;
  var maxRestarts = (opts.maxRestarts == null ? 2 : opts.maxRestarts);
  var restartDelays = opts.restartDelays || [0, 5000, 15000];
  var timeoutMs = (opts.timeoutMs == null ? 30000 : opts.timeoutMs);
  var chunkTimeoutMs = (opts.chunkTimeoutMs != null ? opts.chunkTimeoutMs : (opts.timeoutMs != null ? opts.timeoutMs : 60000));
  var waking = false;
  var lastPct = 0;
  function status(s) { if (onStatus) { try { onStatus(s); } catch (e) {} } }
  function setWaking() { if (!waking) { waking = true; status('waking'); } }
  function clearWaking() { if (waking) { waking = false; status('uploading'); } }
  function prog(p) {
    if (p < lastPct) p = lastPct; /* en una reanudación el % no vuelve atrás */
    lastPct = p;
    if (onProgress) { try { onProgress(p); } catch (e) {} }
  }
  var retryOpts = { attempts: 3, delays: [0, 5000, 15000], timeoutMs: timeoutMs, sleep: sleep, onRetry: function () { setWaking(); } };
  var uploadId = null;
  var chunkSizes = []; /* bytes decodificados de cada trozo enviado (para saber dónde reanudar) */
  for (var attempt = 0; attempt <= maxRestarts; attempt++) {
    if (attempt > 0) {
      setWaking();
      prog(lastPct);
      await sleep(restartDelays[attempt] == null ? 0 : restartDelays[attempt]);
    }
    var getChunk = null;
    try { getChunk = makeGetChunk(); } catch (e) { getChunk = null; }
    if (!getChunk) { _lastMediaUploadError1546 = 'read'; return null; }
    var sent = 0;
    if (attempt > 0 && uploadId) {
      /* 1.5.62: reanudar con el MISMO uploadId: se pregunta al servidor
         cuántos bytes lleva y se saltan esos trozos (el lector nuevo
         empieza desde el principio; saltar es barato: leer en local). */
      var st = await getUploadStatus1562(state, uploadId, retryOpts);
      if (!st) { uploadId = null; continue; } /* el servidor ya no la conoce: empezar de cero */
      if (st.finished && st.url) {
        _lastMediaUploadError1546 = null;
        clearWaking();
        prog(100);
        return /^https?:\/\//.test(st.url) ? st.url : base + st.url;
      }
      var acc = 0, nSkip = 0;
      while (nSkip < chunkSizes.length && acc + chunkSizes[nSkip] <= st.received) { acc += chunkSizes[nSkip]; nSkip++; }
      if (acc !== st.received) { uploadId = null; continue; } /* no cuadra en un límite de trozo: empezar de cero */
      sent = st.received;
      var skippedOk = true;
      for (var si = 0; si < nSkip; si++) { var sk = await getChunk(); if (!sk) { skippedOk = false; break; } }
      if (!skippedOk) { uploadId = null; continue; }
      prog(total > 0 ? Math.min(99, Math.round(sent / total * 100)) : 50);
    } else {
      uploadId = await startServerMediaUpload(state, name, mime, retryOpts);
      if (!uploadId) {
        if ((_lastMediaUploadError1546 === 'server' || _lastMediaUploadError1546 === 'offline') && attempt < maxRestarts) continue;
        return null;
      }
      chunkSizes = [];
    }
    var chunkFailed = null;
    for (;;) {
      var chunk = await getChunk();
      if (!chunk) break;
      /* El tamaño se anota ANTES de mandar (si la respuesta se pierde,
         el trozo puede haber llegado igual: la reanudación lo sabrá por
         lo que dice el servidor, no por lo que se anotó). */
      var cb = b64DecodedBytes1562(chunk);
      chunkSizes.push(cb);
      var cr = await sendServerMediaChunkRaw1546(state, uploadId, chunk, { timeoutMs: chunkTimeoutMs });
      if (!cr.ok) { chunkFailed = cr; break; }
      /* El servidor devuelve cuántos bytes lleva: si no cuadra con lo
         enviado, algo se desalineó y se reanuda (nunca se da por bueno). */
      if (cr.data && typeof cr.data.received === 'number' && cr.data.received !== sent + cb) { chunkFailed = cr; break; }
      sent += cb;
      clearWaking();
      prog(total > 0 ? Math.min(99, Math.round(sent / total * 100)) : 50);
    }
    if (chunkFailed) {
      _lastMediaUploadError1546 = mediaUploadFailKind1546(chunkFailed);
      if (isConnectionError(chunkFailed) && attempt < maxRestarts) continue;
      return null;
    }
    var url = await finishServerMediaUpload(state, uploadId, retryOpts);
    if (!url) {
      if ((_lastMediaUploadError1546 === 'server' || _lastMediaUploadError1546 === 'offline') && attempt < maxRestarts) continue;
      return null;
    }
    _lastMediaUploadError1546 = null; /* salió bien: no queda un error viejo para el próximo mensaje */
    clearWaking();
    prog(100);
    return url;
  }
  return null;
}
async function uploadMediaBase64(state, b64, mime, name, onProgress, opts) {
  var clean = String(b64 || '').replace(/\s/g, '');
  if (!clean) return null;
  var total = Math.floor(clean.length * 3 / 4);
  return await uploadMediaChunks(state, name, mime, total, function () {
    var i = 0;
    return async function () {
      if (i >= clean.length) return null;
      var part = clean.slice(i, i + MEDIA_CHUNK_B64);
      i += MEDIA_CHUNK_B64;
      return part;
    };
  }, onProgress, opts);
}
/* Lee un content:// del teléfono por partes con el puente nativo y lo
   sube al servidor por partes (v1.4): en memoria solo vive el trozo
   que se está mandando. Solo existe en la app; en Node no hay puente.
   1.5.46: el lector se abre de nuevo en cada reintento de la subida
   completa (la primera lectura se agota: reiniciar necesita leer el
   archivo desde el principio). */
async function uploadContentUri(state, uri, mime, name, onProgress, opts) {
  if (typeof window === 'undefined' || !window.AndroidBridge || !window.AndroidBridge.startMediaRead) return null;
  var readIds = [];
  function openRead() {
    try {
      var started = window.AndroidBridge.startMediaRead(uri);
      if (!started || (started + '').indexOf('ERROR') === 0) return null;
      var bits = (started + '').split('|');
      readIds.push(bits[0]);
      return { readId: bits[0], total: parseInt(bits[1], 10) || 0 };
    } catch (e) { return null; }
  }
  function makeGetter(readId) {
    return async function () {
      var chunk = '';
      try { chunk = window.AndroidBridge.readMediaChunk(readId) || ''; } catch (e) { chunk = ''; }
      if (!chunk || (chunk + '').indexOf('ERROR') === 0) return null;
      return chunk;
    };
  }
  var first = openRead();
  if (!first) return null;
  var usedFirst = false;
  try {
    return await uploadMediaChunks(state, name, mime, first.total, function () {
      if (!usedFirst) { usedFirst = true; return makeGetter(first.readId); }
      var r = openRead();
      if (!r) return null;
      return makeGetter(r.readId);
    }, onProgress, opts);
  } finally {
    readIds.forEach(function (id) { try { window.AndroidBridge.closeMediaRead(id); } catch (e) {} });
  }
}
/* Sube un archivo pendiente (v1.4): {kind:'media-upload', dataUrl|uri,
   mime, name, apply:{type, id, field, index}}. Devuelve {ok, url}. */
async function applyMediaUpload(state, item) {
  var src = item.dataUrl || item.uri || '';
  var url = null;
  if (src.indexOf('data:') === 0) {
    var parts = src.split(',');
    var mime = (parts[0].match(/data:([^;]+)/) || [])[1] || item.mime || 'image/jpeg';
    url = await uploadMediaBase64(state, parts[1] || '', mime, item.name || 'archivo');
  } else if (src.indexOf('content://') === 0) {
    url = await uploadContentUri(state, src, item.mime || 'application/octet-stream', item.name || 'archivo');
    if (!url) return { ok: false, error: 'El archivo local no se puede leer sin el puente.' };
  } else if (/^https?:\/\//.test(src)) {
    url = src;
  }
  if (!url) return { ok: false, error: 'No se pudo subir el archivo.' };
  applyMediaUrl(state, item.apply || {}, url);
  return { ok: true, url: url };
}
async function flushPendingQueue(state) {
  var base = serverBase(state);
  if (!base) return { ok: false, error: 'Sin conexión.' };
  var sent = 0, failed = 0;
  var queue = state.pendingQueue.slice();
  state.pendingQueue = [];
  for (var i = 0; i < queue.length; i++) {
    var item = queue[i];
    var r;
    if (item.kind === 'http') {
      /* v1.4: el cuerpo se refresca con lo que hay guardado ahora, para
         que una foto subida después de encolar llegue como URL. */
      var body1562 = refreshPendingBody(state, item);
      /* 1.5.62: una publicación (o su edición) cuyo medio sigue siendo
         local (blob:/content:/data:) NO se manda: se queda en la cola
         hasta que su medio se suba (la subida de medios va encolada
         aparte y reemplaza el archivo por su URL). Mandarla tal cual
         la guardaba rota en el servidor. */
      if (isPostPendingBody1562(item, body1562)) { failed++; state.pendingQueue.push(item); continue; }
      r = await serverFetch(state, item.path, item.method || 'POST', body1562);
    } else if (item.kind === 'media-upload') {
      /* v1.4: el archivo pendiente se sube al servidor y el campo local
         queda con la URL; el envío que lo usa se refresca al llegarle. */
      r = await applyMediaUpload(state, item);
    } else {
      r = await serverFetch(state, '/api/messages', 'POST', { from: item.message.from, to: item.to, message: item.message });
    }
    /* v1.5.15: un borrado (DELETE) que el servidor responde 404 ya está
       hecho: esa cosa ya no existe en el servidor, así que el pendiente
       se da por enviado y se quita de la cola (antes se reencolaba para
       siempre y el borrado se reintentaba sin fin). Sin esto, el vaciado
       silencioso de borrados nunca terminaría. */
    var isDelete404 = item.kind === 'http' && String(item.method || '').toUpperCase() === 'DELETE' && r && r.status === 404;
    if (r.ok || isDelete404) sent++; else { failed++; state.pendingQueue.push(item); }
  }
  return { ok: true, sent: sent, failed: failed };
}

/* v1.5.10: al borrar una publicación, también se sacan de la cola de
   pendientes los envíos que la volverían a subir al servidor (por
   ejemplo, una publicación creada sin conexión que quedó encolada y se
   borra antes de reconectar: sin esto, al reconectar el envío la
   recrearía en el servidor y reaparecería en el inicio). */
function postIdOfPending(item) {
  if (!item || !item.kind) return null;
  if (item.kind === 'http') {
    var p = String(item.path || '');
    if (p === '/api/posts' && item.body && item.body.post && item.body.post.id) return item.body.post.id;
    var m = p.match(/^\/api\/posts\/([^\/]+)/);
    if (m) { try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; } }
    return null;
  }
  if (item.kind === 'media-upload' && item.apply && item.apply.type === 'post') return item.apply.id || null;
  return null;
}
function pendingPostIds(state) {
  var ids = {};
  (state.pendingQueue || []).forEach(function (it) { var id = postIdOfPending(it); if (id) ids[id] = true; });
  return ids;
}
function dropPendingPost(state, postId) {
  if (!state || !state.pendingQueue || !postId) return 0;
  var before = state.pendingQueue.length;
  state.pendingQueue = state.pendingQueue.filter(function (it) { return postIdOfPending(it) !== postId; });
  return before - state.pendingQueue.length;
}

/* v1.5.10: el servidor es la fuente de verdad para los borrados. Tras
   bajar el inicio, las publicaciones locales que ya no están en el
   inicio del servidor se quitan (alguien las borró mientras este
   teléfono no estaba conectado). No se tocan: los ejemplos (isDemo),
   lo que aún está en la cola de pendientes (no llegó al servidor) ni
   lo recién creado (su envío puede ir en camino). El inicio del
   servidor trae como mucho 100 publicaciones, así que solo se podan
   las más nuevas que la más vieja del inicio: las más viejas podrían
   estar fuera del corte de 100 sin estar borradas. */
var PRUNE_RECENT_MS = 120000;
function pruneDeletedPostIds(localPosts, feedPosts, nowMs, pendingIds, tombstoneIds) {
  var feedIds = {};
  var oldest = 0;
  (feedPosts || []).forEach(function (p) {
    if (p && p.id) feedIds[p.id] = true;
    if (p && p.createdAt && (!oldest || p.createdAt < oldest)) oldest = p.createdAt;
  });
  var pending = pendingIds || {};
  var tombs = {};
  (tombstoneIds || []).forEach(function (id) { if (id) tombs[id] = true; });
  var out = [];
  (localPosts || []).forEach(function (p) {
    if (!p || !p.id || p.isDemo) return;
    /* 1.5.58: una publicación sin confirmar (subiendo o con error) NUNCA
       se poda: es la que el servidor aún no tiene y borrarla sería
       perderla en silencio. Solo se poda lo que el servidor ya tuvo y
       quitó (o lo que yo borré, con lápida). */
    if (p.pendingSync || p.syncFailed) return;
    if (feedIds[p.id]) return;
    if (pending[p.id]) return;
    /* v1.5.14: una lápida es un borrado explícito mío: se poda siempre,
       aunque sea recién creada o más vieja que el corte de 100 del
       inicio. Sin lápida, los resguardos de antes siguen valiendo. */
    if (tombs[p.id]) { out.push(p.id); return; }
    if (nowMs - (p.createdAt || 0) < PRUNE_RECENT_MS) return;
    if (oldest && p.createdAt <= oldest) return;
    out.push(p.id);
  });
  return out;
}

/* v1.5.10: recargar el inicio jalando hacia abajo (pull-to-refresh).
   Máquina de estados pura (sin DOM) para poder probarla: el gesto solo
   vale estando arriba del todo del inicio, con la pestaña del inicio
   activa y sin overlays abiertos; los jalones horizontales (historias)
   y los desplazamientos normales no lo disparan. */
var PTR_THRESHOLD_PX = 80;
function createPullRefresh(thresholdPx) {
  var threshold = thresholdPx || PTR_THRESHOLD_PX;
  var st = { active: false, startY: 0, startX: 0, pull: 0, ready: false, refreshing: false };
  return {
    state: st,
    start: function (y, x, canStart) {
      if (st.refreshing || !canStart) return false;
      st.active = true; st.startY = y; st.startX = x; st.pull = 0; st.ready = false;
      return true;
    },
    move: function (y, x) {
      if (!st.active || st.refreshing) return { pull: st.pull, ready: st.ready };
      var dy = y - st.startY, dx = x - st.startX;
      if (dy < 0 || Math.abs(dx) > Math.abs(dy)) { st.active = false; st.pull = 0; st.ready = false; return { pull: 0, ready: false, cancelled: true }; }
      st.pull = dy;
      st.ready = dy >= threshold;
      return { pull: st.pull, ready: st.ready };
    },
    end: function () {
      if (!st.active) return { trigger: false };
      var trigger = st.ready;
      st.active = false; st.pull = 0; st.ready = false;
      if (trigger) st.refreshing = true;
      return { trigger: trigger };
    },
    done: function () { st.refreshing = false; },
    cancel: function () { st.active = false; st.pull = 0; st.ready = false; }
  };
}

/* ---------------- API pública ---------------- */
var api = {
  REACTIONS: REACTIONS, REACTION_EMOJI: REACTION_EMOJI,
  LISTING_CATEGORIES: LISTING_CATEGORIES, DELIVERY_OPTIONS: DELIVERY_OPTIONS,
  POST_BACKGROUNDS: POST_BACKGROUNDS, FEELINGS: FEELINGS, ACTIVITIES: ACTIVITIES,
  toggleStoryLike: toggleStoryLike, addStoryComment: addStoryComment, shareStory: shareStory,
  formatDateTime: formatDateTime,
  formatDuration: formatDuration,
  createSalesGroup: createSalesGroup, joinSalesGroup: joinSalesGroup, leaveSalesGroup: leaveSalesGroup, editSalesGroup: editSalesGroup,
  deleteSalesGroup: deleteSalesGroup, searchSalesGroups: searchSalesGroups, salesGroupListings: salesGroupListings,
  rateSeller: rateSeller, sellerStats: sellerStats,
  shortsFeed: shortsFeed, storyLikeCounts: storyLikeCounts, storyCounts: storyCounts,
  recordView: recordView, isRecentlyViewed: isRecentlyViewed, checkNewPostNotifications: checkNewPostNotifications,
  emptyState: emptyState, resetRuntime: resetRuntime,
  HOME_WIDGETS_BUILTIN_1536: HOME_WIDGETS_BUILTIN_1536, HOME_WIDGETS_ADDABLE_1536: HOME_WIDGETS_ADDABLE_1536,
  HOME_WIDGET_SIZES_1536: HOME_WIDGET_SIZES_1536, HOME_WIDGET_SIZE_NAMES_1536: HOME_WIDGET_SIZE_NAMES_1536,
  HOME_WIDGET_COLORS_1536: HOME_WIDGET_COLORS_1536, HOME_WIDGET_COLOR_NAMES_1536: HOME_WIDGET_COLOR_NAMES_1536, HOME_WIDGET_COLOR_HEX_1536: HOME_WIDGET_COLOR_HEX_1536,
  HOME_WIDGET_TITLES_1536: HOME_WIDGET_TITLES_1536,
  defaultHomeWidgets1536: defaultHomeWidgets1536, normalizeHomeWidgets1536: normalizeHomeWidgets1536,
  creatorHomeConfigValid1536: creatorHomeConfigValid1536, applyCreatorHomeDefault1536: applyCreatorHomeDefault1536,
  normPhone: normPhone, genCode: genCode, hashCode: hashCode,
  validEmail: validEmail, isEmailIdentity: isEmailIdentity,
  escapeHtml: escapeHtml, timeAgo: timeAgo, formatTime: formatTime, extractHashtags: extractHashtags, weatherCodeText: weatherCodeText,
  LIVE_FILTERS: LIVE_FILTERS, LIVE_ZOOM_MAX: LIVE_ZOOM_MAX, LIVE_ZOOM_STEP: LIVE_ZOOM_STEP, LIVE_REC_CHUNK_MS: LIVE_REC_CHUNK_MS,
  LIVE_CAM_TIMEOUT_MS: LIVE_CAM_TIMEOUT_MS, liveTrackFacing: liveTrackFacing, livePickCameraDevice: livePickCameraDevice,
  liveFilterCss: liveFilterCss, liveFilterLabel: liveFilterLabel, liveFilterValid: liveFilterValid,
  requireVerified: requireVerified, GUEST_VERIFY_ERROR: GUEST_VERIFY_ERROR,
  liveFilterKind: liveFilterKind, liveFilterObjectDef: liveFilterObjectDef, liveFilterObjectSvg: liveFilterObjectSvg, liveDrawFilterObject: liveDrawFilterObject,
  nextLiveFacing: nextLiveFacing, liveFacingLabel: liveFacingLabel,
  clampLiveZoom: clampLiveZoom, liveZoomStep: liveZoomStep, liveZoomLabel: liveZoomLabel,
  liveRecFileName: liveRecFileName, liveRecMime: liveRecMime,
  createLiveRecSession: createLiveRecSession, liveRecSessionKey: liveRecSessionKey,
  liveRecDurationMs: liveRecDurationMs, liveRecIsInterrupted: liveRecIsInterrupted, liveRecSummary: liveRecSummary,
  normalizeLink: normalizeLink, extractUrl: extractUrl, linkPreviewFallback: linkPreviewFallback,
  requestCode: requestCode, verifyCode: verifyCode,
  completeProfile: completeProfile, logout: logout,
  createPost: createPost, createPlacePost: createPlacePost, PLACE_TYPES: PLACE_TYPES, editPost: editPost, editsLeft: editsLeft, MAX_POST_EDITS: MAX_POST_EDITS, deletePost: deletePost, toggleLike: toggleLike, findLiveRecordingPost: findLiveRecordingPost,
  likeCounts: likeCounts, addComment: addComment, toggleCommentLike: toggleCommentLike, commentLikeCount: commentLikeCount, commentCount: commentCount, reengageDue: reengageDue, sharePost: sharePost, toggleSave: toggleSave,
  deleteComment: deleteComment, deleteStory: deleteStory, deleteMessage: deleteMessage,
  deleteConversation: deleteConversation, deleteGroup: deleteGroup, deleteAccount: deleteAccount,
  FRAMES: FRAMES, ACCENTS: ACCENTS, RELATIONSHIPS: RELATIONSHIPS, accentColor: accentColor,
  pinPost: pinPost, sectionVisible: sectionVisible,
  createListing: createListing, searchListings: searchListings, myListings: myListings, followedListings: followedListings, editListing: editListing,
  markListingSold: markListingSold, deleteListing: deleteListing, toggleSaveListing: toggleSaveListing,
  createEvent: createEvent, rsvpEvent: rsvpEvent, listEvents: listEvents, cancelEvent: cancelEvent,
  PAGE_CATEGORIES: PAGE_CATEGORIES, createPage: createPage, toggleFollowPage: toggleFollowPage,
  votePoll: votePoll, pollResults: pollResults,
  createStory: createStory, viewStory: viewStory, liveStories: liveStories, cleanupStories: cleanupStories,
  /* ---- v1.5.26 ---- */
  TEXT_SIZES: TEXT_SIZES, TEXT_SIZE_LABELS: TEXT_SIZE_LABELS, textSizeValid: textSizeValid, textSizeClass: textSizeClass,
  CHAT_BG_COLORS: CHAT_BG_COLORS, chatBgValid: chatBgValid,
  isCellularConnection: isCellularConnection, dataSaverHoldsVideo: dataSaverHoldsVideo,
  isSpanishText: isSpanishText, translateUrl: translateUrl, translateResponseOk: translateResponseOk,
  isValidHttpUrl: isValidHttpUrl, validateGeoPlace: validateGeoPlace, staticMapUrl: staticMapUrl, osmUrl: osmUrl,
  MOODS: MOODS, moodById: moodById, validateMood: validateMood, moodLine: moodLine,
  normalizeChallengeTag: normalizeChallengeTag, challengeFromPost: challengeFromPost,
  validatePhotoPoll: validatePhotoPoll, photoPollPercent: photoPollPercent,
  validateStoryPoll: validateStoryPoll, validateStoryLink: validateStoryLink, validateStoryBg: validateStoryBg,
  STORY_REACTION_EMOJIS: STORY_REACTION_EMOJIS, validateStoryReaction: validateStoryReaction,
  LIVE_GIFTS: LIVE_GIFTS, liveGiftById: liveGiftById, liveGiftTotal: liveGiftTotal,
  mutedList: mutedList, isMuted: isMuted, setMuted: setMuted,
  closeFriendsList: closeFriendsList, isCloseFriend: isCloseFriend, setCloseFriend: setCloseFriend, canSeeCloseStory: canSeeCloseStory,
  cartList: cartList, cartAdd: cartAdd, cartSetQty: cartSetQty, cartRemove: cartRemove, cartLines: cartLines, cartTotal: cartTotal, orderMessageText: orderMessageText,
  normalizeCouponCode: normalizeCouponCode, validateCoupon: validateCoupon, couponDiscounted: couponDiscounted, couponApplies: couponApplies,
  wishlistList: wishlistList, wishlistToggle: wishlistToggle, wishlistAvailable: wishlistAvailable,
  saveDraft: saveDraft, deleteDraft: deleteDraft,
  schedulePost: schedulePost, dueScheduledPosts: dueScheduledPosts, removeScheduledPost: removeScheduledPost,
  memoriesOf: memoriesOf, yearsAgoLabel: yearsAgoLabel, sameMonthDay: sameMonthDay,
  todayStr: todayStr, dateStrOf: dateStrOf, isToday: isToday, birthdayThisYear: birthdayThisYear, upcomingBirthdays: upcomingBirthdays, todaysBirthdays: todaysBirthdays,
  songOfDayValid: songOfDayValid,
  pruneDisappearingMessages: pruneDisappearingMessages,
  EVENT_REMINDER_LEADS: EVENT_REMINDER_LEADS, EVENT_REMINDER_LABELS: EVENT_REMINDER_LABELS, eventReminderLead: eventReminderLead, eventStartMs: eventStartMs, eventReminderAt: eventReminderAt,
  VERIFICATION_KEYS: VERIFICATION_KEYS, VERIFICATION_LABELS: VERIFICATION_LABELS, verificationMissing: verificationMissing,
  sharesOf: sharesOf,
  addAccount: addAccount, removeAccount: removeAccount,
  validatePinnedCover: validatePinnedCover, validateProfileNote: validateProfileNote,
  STORY_TEXT_BG_COLORS: STORY_TEXT_BG_COLORS,
  isShortVideoPost: isShortVideoPost, savedShorts: savedShorts,
  screenTimeTodayMs: screenTimeTodayMs, recordScreenTime: recordScreenTime, screenTimeWeek: screenTimeWeek, formatScreenTime: formatScreenTime,
  normalizeWordFilter: normalizeWordFilter, containsBlockedWord: containsBlockedWord, filterFeedWords: filterFeedWords,
  exportChatsBackup: exportChatsBackup, importChatsBackup: importChatsBackup,
  STICKER_IDS: STICKER_IDS, STICKER_NAMES: STICKER_NAMES, validateStickerId: validateStickerId, stickerPath: stickerPath,
  validateAvatarVideo: validateAvatarVideo,
  quietHoursOn: quietHoursOn, quietHoursValid: quietHoursValid,
  MSG_REACTION_EMOJIS: MSG_REACTION_EMOJIS, validateMsgReaction: validateMsgReaction,
  msgReactionCounts: msgReactionCounts, myMsgReaction: myMsgReaction, applyMsgReaction: applyMsgReaction,
  liveLocationActive: liveLocationActive, liveLocationRemainingMs: liveLocationRemainingMs,
  saveLink: saveLink, removeSavedLink: removeSavedLink,
  weekStats: weekStats,
  friendsOnlyPosts: friendsOnlyPosts,
  groupInviteLink: groupInviteLink, groupInviteHttpsLink: groupInviteHttpsLink, parseGroupInviteLink: parseGroupInviteLink,
  AVATAR_FRAMES: AVATAR_FRAMES, validateAvatarFrame: validateAvatarFrame, avatarFrameCss: avatarFrameCss,
  CHAT_SOUNDS: CHAT_SOUNDS, validateChatSound: validateChatSound, chatSoundName: chatSoundName,
  AVATAR_FILTERS: AVATAR_FILTERS, validateAvatarFilter: validateAvatarFilter, avatarFilterCss: avatarFilterCss,
  validateVideoEdits: validateVideoEdits, hasVideoEdits: hasVideoEdits,
  SONG_CATALOG: SONG_CATALOG, SONG_MOODS: SONG_MOODS, MOOD_WORDS: MOOD_WORDS,
  hexToHsl: hexToHsl, analyzeImagePalette: analyzeImagePalette,
  suggestSongForImage: suggestSongForImage, suggestSongForVideo: suggestSongForVideo,
  validateSong: validateSong, songFromCatalog: songFromCatalog, songHasAudio: songHasAudio, findSongById: findSongById,
  shortsReminderDue: shortsReminderDue, SHORTS_REMINDER_MS: SHORTS_REMINDER_MS,
  createAd: createAd, attachSongToPost: attachSongToPost, removeSongFromPost: removeSongFromPost,
  STORY_FILTERS: STORY_FILTERS, STORY_BG_COLORS: STORY_BG_COLORS, validateStoryEdits: validateStoryEdits,
  HEADER_GRADIENTS: HEADER_GRADIENTS, REPORT_REASONS: REPORT_REASONS,
  findGroup: findGroup, isGroupAdmin: isGroupAdmin, canManageGroup: canManageGroup,
  addGroupAdmin: addGroupAdmin, removeGroupAdmin: removeGroupAdmin, editGroup: editGroup,
  removeGroupMember: removeGroupMember, approveJoinRequest: approveJoinRequest, rejectJoinRequest: rejectJoinRequest,
  pinGroupPost: pinGroupPost, unpinGroupPost: unpinGroupPost,
  isBlockedBy: isBlockedBy, isBlockedBetween: isBlockedBetween, canSeeProfile: canSeeProfile,
  blockUser: blockUser, unblockUser: unblockUser, blockedList: blockedList, reportUser: reportUser,
  areFriends: areFriends, pendingRequestBetween: pendingRequestBetween,
  sendFriendRequest: sendFriendRequest, respondFriendRequest: respondFriendRequest,
  unfriend: unfriend, friendSuggestions: friendSuggestions,
  createGroup: createGroup, joinGroup: joinGroup, leaveGroup: leaveGroup,
  sendMessage: sendMessage, markConversationRead: markConversationRead, conversationList: conversationList,
  convoKey: convoKey,
  createGroupChat: createGroupChat, sendGroupMessage: sendGroupMessage, addGroupChatMember: addGroupChatMember,
  removeGroupChatMember: removeGroupChatMember, leaveGroupChat: leaveGroupChat, groupChatList: groupChatList,
  markGroupChatRead: markGroupChatRead, mergeGroupChats: mergeGroupChats, findGroupChat: findGroupChat,
  userActivity: userActivity,
  notify: notify, unreadNotifications: unreadNotifications, markNotificationsRead: markNotificationsRead, isDemoNotif: isDemoNotif,
  feedFor: feedFor, searchAll: searchAll, seedDemo: seedDemo,
  demoAvatarSvg: demoAvatarSvg, demoCoverSvg: demoCoverSvg, demoPhotoSvg: demoPhotoSvg,
  APP_COLOR_DEFAULT: APP_COLOR_DEFAULT, APP_COLOR_PRESETS: APP_COLOR_PRESETS,
  LIKE_COLOR_DEFAULT: LIKE_COLOR_DEFAULT, likeColorFor: likeColorFor,
  normalizeHex: normalizeHex, hexToRgb: hexToRgb, rgbToHex: rgbToHex, hslToHex: hslToHex,
  relLuminance: relLuminance, contrastRatio: contrastRatio, appColorVariants: appColorVariants,
  realPostStats: realPostStats, shouldHideExamples: shouldHideExamples, examplesAutoHidden: examplesAutoHidden, ensureDemo1534: ensureDemo1534, demoActivityPost: demoActivityPost, demoActivityLike: demoActivityLike, DEMO_VIDEO_COVER_1544: DEMO_VIDEO_COVER_1544,
  EXAMPLE_HIDE_REAL_POSTS: EXAMPLE_HIDE_REAL_POSTS,
  serverBase: serverBase, serverFetch: serverFetch, serverFetchWithRetry: serverFetchWithRetry, isConnectionError: isConnectionError, isRetryableServerError: isRetryableServerError, flushPendingQueue: flushPendingQueue, queuePending: queuePending, DEFAULT_SERVER_URL: DEFAULT_SERVER_URL,
  dropPendingPost: dropPendingPost, pendingPostIds: pendingPostIds, pruneDeletedPostIds: pruneDeletedPostIds, PRUNE_RECENT_MS: PRUNE_RECENT_MS,
  markPostDeleted: markPostDeleted, unmarkPostDeleted: unmarkPostDeleted, isPostDeleted: isPostDeleted, canDeletePost: canDeletePost, MAX_DELETED_TOMBSTONES: MAX_DELETED_TOMBSTONES,
  markItemDeleted: markItemDeleted, unmarkItemDeleted: unmarkItemDeleted, isItemDeleted: isItemDeleted,
  extractUrls: extractUrls, linkHost: linkHost, stripUrls: stripUrls, extractPageTitle: extractPageTitle, extractPageImage: extractPageImage, normalizeUrlKey: normalizeUrlKey,
  createPullRefresh: createPullRefresh, PTR_THRESHOLD_PX: PTR_THRESHOLD_PX,
  uploadMediaBase64: uploadMediaBase64, uploadMediaChunks: uploadMediaChunks, startServerMediaUpload: startServerMediaUpload, sendServerMediaChunk: sendServerMediaChunk, finishServerMediaUpload: finishServerMediaUpload, b64DecodedBytes1562: b64DecodedBytes1562, getUploadStatus1562: getUploadStatus1562, isLocalMediaValue1562: isLocalMediaValue1562, isPostPendingBody1562: isPostPendingBody1562, applyMediaUpload: applyMediaUpload, applyMediaUrl: applyMediaUrl, profileBody: profileBody, refreshPendingBody: refreshPendingBody, MEDIA_CHUNK_B64: MEDIA_CHUNK_B64, uploadContentUri: uploadContentUri, lastMediaUploadError1546: lastMediaUploadError1546, setMediaUploadSleep1546: setMediaUploadSleep1546,
  /* ---- lanzador de inicio (v1.5.13) ----
     Sin carpetas: el orden vive en state.launcher.layout y se guarda
     con el resto del estado (persiste al cerrar la app). Cada entrada
     es {kind:'app', pkg}. El orden puede ser 'custom' (Mi orden) o
     'name' (alfabético por nombre) en state.launcher.sort. Los iconos
     y nombres NO se guardan aquí: se leen del teléfono en cada
     arranque (puente listInstalledApps) y se cachean en la web.
     Migración de la 1.5.12: si el estado guardado trae carpetas, se
     deshacen y sus apps vuelven sueltas al inicio (no se pierde
     ninguna app). */
  ensureLauncher: ensureLauncher, launcherLayout: launcherLayout,
  launcherSyncApps: launcherSyncApps, launcherMoveEntry: launcherMoveEntry,
  launcherRemoveApp: launcherRemoveApp,
  launcherPruneApps: launcherPruneApps,
  launcherSortMode: launcherSortMode, launcherSetSort: launcherSetSort,
  launcherOrderedApps: launcherOrderedApps,
  canSeePost: canSeePost
};

/* Lanzador de inicio (v1.5.13, sin carpetas). */
function ensureLauncher(state) {
  if (!state.launcher || !Array.isArray(state.launcher.layout)) state.launcher = { layout: [], sort: 'custom' };
  if (state.launcher.sort !== 'name' && state.launcher.sort !== 'custom') state.launcher.sort = 'custom';
  /* Migración de la 1.5.12: deshacer las carpetas guardadas; sus apps
     vuelven sueltas al inicio en el mismo orden, sin perder ninguna. */
  var flat = [];
  var changed = false;
  state.launcher.layout.forEach(function (e) {
    if (!e) return;
    if (e.kind === 'app' && e.pkg) flat.push({ kind: 'app', pkg: e.pkg });
    else if (e.kind === 'folder' && Array.isArray(e.items)) {
      changed = true;
      e.items.forEach(function (p) { if (p) flat.push({ kind: 'app', pkg: p }); });
    } else changed = true;
  });
  if (changed) state.launcher.layout = flat;
  return state.launcher;
}
function launcherLayout(state) {
  ensureLauncher(state);
  return state.launcher.layout.filter(function (e) { return e && e.kind === 'app' && !!e.pkg; });
}
function launcherSyncApps(state, pkgs) {
  ensureLauncher(state);
  var seen = {};
  launcherLayout(state).forEach(function (e) { seen[e.pkg] = true; });
  (pkgs || []).forEach(function (p) {
    if (p && !seen[p]) { state.launcher.layout.push({ kind: 'app', pkg: p }); seen[p] = true; }
  });
  return state.launcher.layout;
}
function launcherMoveEntry(state, from, to) {
  var lay = launcherLayout(state);
  if (from < 0 || from >= lay.length) return { ok: false, error: 'Esa posición no existe.' };
  if (to < 0) to = 0;
  if (to >= lay.length) to = lay.length - 1;
  var it = lay.splice(from, 1)[0];
  lay.splice(to, 0, it);
  state.launcher.layout = lay;
  return { ok: true };
}
function launcherSortMode(state) {
  ensureLauncher(state);
  return state.launcher.sort === 'name' ? 'name' : 'custom';
}
function launcherSetSort(state, mode) {
  ensureLauncher(state);
  state.launcher.sort = mode === 'name' ? 'name' : 'custom';
  return { ok: true, sort: state.launcher.sort };
}
function launcherOrderedApps(state, apps) {
  /* Orden que se ve en el cajón: 'custom' es el orden guardado en
     layout; 'name' es alfabético por nombre (sin distinguir
     mayúsculas; el orden guardado no se toca). */
  var list = (apps || []).slice();
  if (launcherSortMode(state) === 'name') {
    list.sort(function (a, b) {
      return String(a.name || a.pkg || '').localeCompare(String(b.name || b.pkg || ''), 'es', { sensitivity: 'base' });
    });
    return list;
  }
  var lay = launcherLayout(state);
  var pos = {};
  lay.forEach(function (e, i) { pos[e.pkg] = i; });
  list.sort(function (a, b) {
    var pa = pos[a.pkg], pb = pos[b.pkg];
    if (pa === undefined && pb === undefined) return String(a.name || '').localeCompare(String(b.name || ''), 'es', { sensitivity: 'base' });
    if (pa === undefined) return 1;
    if (pb === undefined) return -1;
    return pa - pb;
  });
  return list;
}
function launcherPruneApps(state, pkgs) {
  var keep = {};
  (pkgs || []).forEach(function (p) { if (p) keep[p] = true; });
  var out = [];
  launcherLayout(state).forEach(function (e) { if (keep[e.pkg]) out.push(e); });
  state.launcher.layout = out;
  return out;
}
function launcherRemoveApp(state, pkg) {
  ensureLauncher(state);
  state.launcher.layout = launcherLayout(state).filter(function (e) { return e.pkg !== pkg; });
  return { ok: true };
}


/* ================= v1.5.26 (42 ideas) — lógica pura =================
   Todo aquí es determinista y sin DOM, para probarlo en Node. El
   servidor 3.8 es la fuente de verdad de los datos que viven en la red
   (vistas, votos, regalos, verificación...): aquí solo se valida y se
   da forma a lo local, y nunca se inventa un dato del servidor. */

/* ---- 35. Tamaño del texto ---- */
var TEXT_SIZES = ['normal', 'grande', 'muygrande'];
var TEXT_SIZE_LABELS = { normal: 'Normal', grande: 'Grande', muygrande: 'Muy grande' };
var TEXT_SIZE_CLASS = { normal: '', grande: 'textsize-grande', muygrande: 'textsize-muygrande' };
function textSizeValid(v) { return TEXT_SIZES.indexOf(v) >= 0 ? v : 'normal'; }
function textSizeClass(v) { return TEXT_SIZE_CLASS[textSizeValid(v)] || ''; }

/* ---- 37. Fondo de chats ---- */
var CHAT_BG_COLORS = ['#1a0c0f', '#0c1a12', '#0c1420', '#1c1408', '#241a2e', '#101010', '#3d0c0c', '#0c2e2e'];
function chatBgValid(v) {
  v = String(v || '').trim();
  if (!v) return '';
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^https?:\/\//i.test(v) || v.indexOf('data:image/') === 0 || v.indexOf('content://') === 0) return v;
  return '';
}

/* ---- 38. Ahorro de datos: ¿estamos en datos móviles? ----
   navigator.connection lo reporta el teléfono; sin él, no se sabe y
   NO se retiene nada (mejor mostrar el video que retenerlo sin saber). */
function isCellularConnection(conn) {
  if (!conn) return false;
  var t = String(conn.type || '').toLowerCase();
  if (t && t !== 'unknown' && t !== 'none') return t.indexOf('cellular') >= 0 || ['2g', '3g', '4g', '5g', 'slow-2g'].indexOf(t) >= 0;
  var eff = String(conn.effectiveType || '').toLowerCase();
  if (eff) return ['slow-2g', '2g', '3g'].indexOf(eff) >= 0;
  return false;
}
function dataSaverHoldsVideo(state, conn) {
  return !!(state && state.settings && state.settings.dataSaver && isCellularConnection(conn));
}

/* ---- 18. Traducción: ¿el texto parece español? ---- */
var SPANISH_WORDS = ['el', 'la', 'de', 'que', 'en', 'y', 'los', 'un', 'es', 'con', 'por', 'para', 'su', 'al', 'lo', 'las', 'del', 'se', 'una', 'está', 'están', 'como', 'más', 'pero', 'sus', 'este', 'esta', 'son', 'hay', 'yo', 'tú', 'nosotros', 'gracias', 'hola', 'buenos', 'días', 'tardes', 'noches'];
function isSpanishText(text) {
  var words = String(text || '').toLowerCase().replace(/[^a-záéíóúñü\s]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 1; });
  if (!words.length) return true; /* sin palabras no se puede decir que no sea español: no se muestra el botón */
  var hits = 0;
  words.forEach(function (w) { if (SPANISH_WORDS.indexOf(w) >= 0) hits++; });
  return hits / words.length >= 0.2;
}
function translateUrl(text) {
  return 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(String(text || '').slice(0, 500)) + '&langpair=auto|es';
}
function translateResponseOk(data) {
  if (!data || !data.responseData) return { ok: false };
  var t = String(data.responseData.translatedText || '').trim();
  if (!t || /QUERY LENGTH LIMIT/i.test(t) || /INVALID/i.test(t)) return { ok: false };
  /* Web 1.11: cuando se agota la cuota gratuita diaria, MyMemory
     devuelve su aviso EN VEZ de la traducción («MYMEMORY WARNING: YOU
     USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY…»). Antes ese aviso
     en inglés se guardaba como si fuera la traducción y se mostraba en
     la publicación. Ahora se rechaza y la app avisa honestamente que
     no se pudo traducir. */
  if (/^MYMEMORY WARNING/i.test(t) || /USED ALL AVAILABLE FREE TRANSLATIONS/i.test(t)) return { ok: false };
  return { ok: true, text: t };
}

/* ---- 25. Estoy aquí: lugar con coordenadas ---- */
function isValidHttpUrl(u) {
  if (!u) return false;
  try {
    var x = new URL(String(u));
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch (e) { return /^https?:\/\//i.test(String(u)); }
}
function validateGeoPlace(place) {
  if (!place) return null;
  var name = String(place.name || '').trim().slice(0, 120);
  var lat = Number(place.lat), lng = Number(place.lng);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (!name) name = 'Ubicación';
  return { name: name, lat: lat, lng: lng };
}
function staticMapUrl(lat, lng) {
  return 'https://staticmap.openstreetmap.de/staticmap.php?center=' + lat + ',' + lng + '&zoom=15&size=400x200&markers=' + lat + ',' + lng + ',red-pushpin';
}
function osmUrl(lat, lng) {
  return 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=15/' + lat + '/' + lng;
}

/* ---- 22. Estados de ánimo ---- */
var MOODS = [
  { id: 'feliz', label: 'feliz', emoji: '😊' },
  { id: 'triste', label: 'triste', emoji: '😢' },
  { id: 'emocionado', label: 'emocionado', emoji: '🤩' },
  { id: 'cansado', label: 'cansado', emoji: '😴' },
  { id: 'enamorado', label: 'enamorado', emoji: '😍' },
  { id: 'enojado', label: 'enojado', emoji: '😠' },
  { id: 'agradecido', label: 'agradecido', emoji: '🙏' },
  { id: 'enfermo', label: 'enfermo', emoji: '🤒' }
];
function moodById(id) {
  var f = null;
  MOODS.forEach(function (m) { if (m.id === id) f = m; });
  return f;
}
function validateMood(m) {
  if (!m) return null;
  if (typeof m === 'string') { var byId = moodById(m); return byId ? { id: byId.id, label: byId.label, emoji: byId.emoji, text: byId.label } : null; }
  var base = moodById(m.id || m.label);
  if (!base) return null;
  var text = String(m.text || base.label).slice(0, 30);
  return { id: base.id, label: base.label, emoji: base.emoji, text: text };
}
function moodLine(mood) {
  var m = validateMood(mood);
  if (!m) return '';
  return '— me siento ' + m.label + ' ' + m.emoji;
}

/* ---- 8. Retos ---- */
function normalizeChallengeTag(raw) {
  var t = String(raw || '').trim().replace(/^#+/, '').replace(/\s+/g, '');
  if (!t) return '';
  return '#' + t.slice(0, 60);
}
function challengeFromPost(post) {
  if (post && post.challenge) return normalizeChallengeTag(post.challenge);
  var tags = extractHashtags(post && post.text ? post.text : '');
  return tags.length ? '#' + tags[0] : '';
}

/* ---- 26. Encuesta con foto ---- */
function validatePhotoPoll(pp) {
  if (!pp || !Array.isArray(pp.options) || pp.options.length !== 2) return null;
  var opts = [];
  for (var i = 0; i < 2; i++) {
    var o = pp.options[i] || {};
    var url = String(o.mediaUrl || o.src || '').trim();
    if (!isValidHttpUrl(url)) return null;
    opts.push({ mediaUrl: url, label: String(o.label || '').slice(0, 80), votes: [] });
  }
  return { options: opts };
}
function photoPollPercent(votes) {
  var a = Number((votes && votes[0]) || 0), b = Number((votes && votes[1]) || 0);
  var tot = a + b;
  if (tot <= 0) return [0, 0];
  return [Math.round(a * 100 / tot), Math.round(b * 100 / tot)];
}

/* ---- 7. Encuesta en historias ---- */
function validateStoryPoll(poll) {
  if (!poll) return null;
  var q = String(poll.question || '').trim().slice(0, 200);
  var opts = (poll.options || []).map(function (o) { return String((o && o.text) || o || '').trim(); }).filter(function (t) { return t.length > 0; });
  if (!q || opts.length !== 2) return null;
  return { question: q, options: opts.slice(0, 2).map(function (t) { return { text: t.slice(0, 80), votes: 0 }; }) };
}
function validateStoryLink(link) {
  var u = String(link || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return isValidHttpUrl(u) ? u : '';
}
function validateStoryBg(color) {
  return /^#[0-9a-fA-F]{6}$/.test(String(color || '')) ? String(color) : '';
}
var STORY_REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '🔥', '👏'];
function validateStoryReaction(emoji) {
  return STORY_REACTION_EMOJIS.indexOf(emoji) >= 0 ? emoji : '';
}

/* ---- 16. Regalos en lives (virtuales, sin dinero) ---- */
var LIVE_GIFTS = [
  { id: 'rosa', name: 'Rosa', emoji: '🌹' },
  { id: 'corazon', name: 'Corazón', emoji: '❤️' },
  { id: 'estrella', name: 'Estrella', emoji: '⭐' },
  { id: 'corona', name: 'Corona', emoji: '👑' },
  { id: 'cohete', name: 'Cohete', emoji: '🚀' },
  { id: 'diamante', name: 'Diamante', emoji: '💎' }
];
function liveGiftById(id) {
  var f = null;
  LIVE_GIFTS.forEach(function (g) { if (g.id === id) f = g; });
  return f;
}
function liveGiftTotal(counts) {
  var t = 0;
  for (var k in (counts || {})) t += Number(counts[k]) || 0;
  return t;
}

/* ---- 31. Silenciar ---- */
function mutedList(state, me) {
  if (!state.muted) state.muted = {};
  return state.muted[me] || [];
}
function isMuted(state, me, phone) {
  return mutedList(state, me).indexOf(normPhone(phone)) >= 0;
}
function setMuted(state, me, phone, mute) {
  if (!state.muted) state.muted = {};
  me = normPhone(me); phone = normPhone(phone);
  var list = state.muted[me] || [];
  var i = list.indexOf(phone);
  if (mute && i < 0) list.push(phone);
  if (!mute && i >= 0) list.splice(i, 1);
  state.muted[me] = list;
  return { ok: true, muted: list.slice() };
}

/* ---- 13. Amigos cercanos ---- */
function closeFriendsList(state, me) {
  if (!state.closeFriends) state.closeFriends = {};
  return state.closeFriends[me] || [];
}
function isCloseFriend(state, me, phone) {
  return closeFriendsList(state, me).indexOf(normPhone(phone)) >= 0;
}
function setCloseFriend(state, me, phone, close) {
  if (!state.closeFriends) state.closeFriends = {};
  me = normPhone(me); phone = normPhone(phone);
  var friends = state.friends[me] || [];
  if (close && friends.indexOf(phone) < 0) return { ok: false, error: 'Solo puedes marcar como cercano a un amigo.' };
  var list = state.closeFriends[me] || [];
  var i = list.indexOf(phone);
  if (close && i < 0) list.push(phone);
  if (!close && i >= 0) list.splice(i, 1);
  state.closeFriends[me] = list;
  return { ok: true, closeFriends: list.slice() };
}
function canSeeCloseStory(state, viewer, story) {
  if (!story || story.audience !== 'close') return true;
  if (!viewer) return false;
  if (story.author === viewer) return true;
  return isCloseFriend(state, story.author, viewer);
}

/* ---- 12. Carrito ---- */
function cartList(state) { if (!state.cart) state.cart = []; return state.cart; }
function cartAdd(state, listingId, qty) {
  if (!state.cart) state.cart = [];
  qty = Math.max(1, Math.min(99, parseInt(qty, 10) || 1));
  var found = null;
  state.cart.forEach(function (it) { if (it.listingId === listingId) found = it; });
  if (found) found.qty = Math.min(99, found.qty + qty);
  else state.cart.push({ listingId: listingId, qty: qty });
  return { ok: true, cart: state.cart.slice() };
}
function cartSetQty(state, listingId, qty) {
  if (!state.cart) state.cart = [];
  qty = parseInt(qty, 10) || 0;
  state.cart = state.cart.filter(function (it) { return it.listingId !== listingId; });
  if (qty > 0) state.cart.push({ listingId: listingId, qty: Math.min(99, qty) });
  return { ok: true, cart: state.cart.slice() };
}
function cartRemove(state, listingId) {
  if (!state.cart) state.cart = [];
  state.cart = state.cart.filter(function (it) { return it.listingId !== listingId; });
  return { ok: true, cart: state.cart.slice() };
}
function cartLines(state) {
  var lines = [];
  cartList(state).forEach(function (it) {
    var l = null;
    (state.listings || []).forEach(function (x) { if (x.id === it.listingId) l = x; });
    if (!l || l.status === 'Vendido') return;
    lines.push({ listingId: it.listingId, title: l.title, price: Number(l.price) || 0, qty: it.qty, seller: l.seller, subtotal: (Number(l.price) || 0) * it.qty });
  });
  return lines;
}
function cartTotal(state) {
  var total = 0, count = 0;
  cartLines(state).forEach(function (ln) { total += ln.subtotal; count += ln.qty; });
  return { total: total, count: count, lines: cartLines(state) };
}
function orderMessageText(lines, total, buyerName) {
  var out = '¡Hola! Te hago un pedido por WordRed (' + (buyerName || 'un comprador') + '):\n';
  lines.forEach(function (ln) { out += '• ' + ln.title + ' × ' + ln.qty + ' — $' + ln.subtotal.toLocaleString('es-MX') + ' MXN\n'; });
  out += 'Total: $' + total.toLocaleString('es-MX') + ' MXN\nEl pago es manual por transferencia.';
  return out;
}

/* ---- 34. Cupones ---- */
function normalizeCouponCode(code) {
  return String(code || '').toUpperCase().replace(/\s+/g, '').slice(0, 20);
}
function validateCoupon(code, pct, expiresAt) {
  code = normalizeCouponCode(code);
  if (!code) return { ok: false, error: 'Escribe un código para el cupón.' };
  if (!/^[A-Z0-9\-_]{2,20}$/.test(code)) return { ok: false, error: 'El código solo puede tener letras, números y guiones.' };
  pct = parseInt(pct, 10);
  if (!isFinite(pct) || Math.floor(pct) !== pct || pct < 1 || pct > 90) return { ok: false, error: 'El descuento debe ser un número entero entre 1 y 90%.' };
  if (expiresAt) {
    var t = new Date(expiresAt).getTime();
    if (!isFinite(t)) return { ok: false, error: 'La vigencia no es una fecha válida.' };
    if (t <= Date.now()) return { ok: false, error: 'La vigencia ya pasó.' };
  }
  return { ok: true, code: code, discountPct: pct };
}
function couponDiscounted(price, pct) {
  price = Number(price) || 0;
  pct = Math.max(0, Math.min(90, parseInt(pct, 10) || 0));
  return Math.max(0, Math.round(price * (100 - pct) / 100));
}
function couponApplies(coupon, listingId) {
  if (!coupon) return false;
  if (coupon.expiresAt && new Date(coupon.expiresAt).getTime() <= Date.now()) return false;
  if (!coupon.listingId) return true; /* toda la tienda */
  return coupon.listingId === listingId;
}

/* ---- 21. Lista de deseos ---- */
function wishlistList(state) { if (!state.wishlist) state.wishlist = []; return state.wishlist; }
function wishlistToggle(state, listingId) {
  if (!state.wishlist) state.wishlist = [];
  var i = state.wishlist.indexOf(listingId);
  if (i >= 0) state.wishlist.splice(i, 1);
  else state.wishlist.push(listingId);
  return { ok: true, wished: i < 0, wishlist: state.wishlist.slice() };
}
function wishlistAvailable(state) {
  return wishlistList(state).map(function (id) {
    var l = null;
    (state.listings || []).forEach(function (x) { if (x.id === id) l = x; });
    return l ? { listing: l, available: true } : { listingId: id, available: false };
  });
}

/* ---- 14. Borradores ---- */
function saveDraft(state, data) {
  if (!state.drafts) state.drafts = [];
  var text = String((data && data.text) || '').trim();
  var hasMedia = data && data.mediaList && data.mediaList.length > 0;
  if (!text && !hasMedia && !(data && data.poll)) return { ok: false, error: 'El borrador está vacío.' };
  var d = { id: uid('draft'), text: text, mediaList: (data.mediaList || []).slice(), song: data.song || null, bg: data.bg || 'none', feeling: data.feeling || null, tags: (data.tags || []).slice(), location: data.location || '', poll: data.poll || null, link: data.link || null, privacy: data.privacy || 'Público', createdAt: now() };
  state.drafts.unshift(d);
  return { ok: true, draft: d };
}
function deleteDraft(state, draftId) {
  if (!state.drafts) state.drafts = [];
  state.drafts = state.drafts.filter(function (d) { return d.id !== draftId; });
  return { ok: true };
}

/* ---- 6. Publicaciones programadas ---- */
function schedulePost(state, data, atMs) {
  if (!state.scheduledPosts) state.scheduledPosts = [];
  atMs = Number(atMs) || 0;
  if (!atMs || atMs <= Date.now()) return { ok: false, error: 'Elige una fecha y hora en el futuro.' };
  var text = String((data && data.text) || '').trim();
  var hasMedia = data && data.mediaList && data.mediaList.length > 0;
  if (!text && !hasMedia && !(data && data.poll)) return { ok: false, error: 'La publicación programada está vacía.' };
  var item = { id: uid('sched'), data: data, atMs: atMs, createdAt: now(), missed: false };
  state.scheduledPosts.push(item);
  state.scheduledPosts.sort(function (a, b) { return a.atMs - b.atMs; });
  return { ok: true, item: item };
}
function dueScheduledPosts(state, t) {
  t = t || now();
  return (state.scheduledPosts || []).filter(function (it) { return it.atMs <= t; });
}
function removeScheduledPost(state, id) {
  if (!state.scheduledPosts) state.scheduledPosts = [];
  state.scheduledPosts = state.scheduledPosts.filter(function (it) { return it.id !== id; });
  return { ok: true };
}

/* ---- 2. Recuerdos ---- */
function sameMonthDay(ts, month, day) {
  var d = new Date(ts);
  return d.getMonth() === month && d.getDate() === day;
}
function memoriesOf(state, phone, t) {
  t = t || now();
  var d = new Date(t);
  var month = d.getMonth(), day = d.getDate(), year = d.getFullYear();
  var out = [];
  (state.posts || []).forEach(function (p) {
    if (p.author !== phone || p.pageId || p.groupId) return;
    var pd = new Date(p.createdAt);
    if (pd.getFullYear() >= year) return;
    if (pd.getMonth() === month && pd.getDate() === day) {
      out.push({ post: p, yearsAgo: year - pd.getFullYear() });
    }
  });
  out.sort(function (a, b) { return b.post.createdAt - a.post.createdAt; });
  return out;
}
function yearsAgoLabel(n) {
  return n === 1 ? 'Hace 1 año' : 'Hace ' + n + ' años';
}

/* ---- 5. Cumpleaños ---- */
function todayStr(d) {
  d = d || new Date();
  function p(n) { return String(n).padStart(2, '0'); }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function dateStrOf(ts) { return todayStr(new Date(ts)); }
function isToday(dateStr) { return dateStr === todayStr(); }
function birthdayThisYear(birthday, t) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday || '')) return null;
  var parts = birthday.split('-');
  var nowD = new Date(t || Date.now());
  var y = nowD.getFullYear();
  var dt = new Date(y, Number(parts[1]) - 1, Number(parts[2]));
  if (dt.getTime() < new Date(y, nowD.getMonth(), nowD.getDate()).getTime()) dt = new Date(y + 1, Number(parts[1]) - 1, Number(parts[2]));
  return dt;
}
function upcomingBirthdays(state, daysAhead) {
  daysAhead = daysAhead == null ? 30 : daysAhead;
  var me = state.me;
  var friends = (state.friends[me] || []).slice();
  var nowT = Date.now();
  var out = [];
  friends.forEach(function (phone) {
    var p = state.profiles[phone];
    if (!p || !p.birthday) return;
    var dt = birthdayThisYear(p.birthday, nowT);
    if (!dt) return;
    var inDays = Math.round((new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime() - new Date(new Date(nowT).getFullYear(), new Date(nowT).getMonth(), new Date(nowT).getDate()).getTime()) / 86400000);
    if (inDays >= 0 && inDays <= daysAhead) out.push({ phone: phone, name: p.name, birthday: p.birthday, inDays: inDays, date: dt });
  });
  out.sort(function (a, b) { return a.inDays - b.inDays; });
  return out;
}
function todaysBirthdays(state) {
  return upcomingBirthdays(state, 0);
}

/* ---- 33. Canción del día ---- */
function songOfDayValid(sotd, today) {
  if (!sotd || !sotd.song || !sotd.date) return null;
  if (sotd.date !== (today || todayStr())) return null; /* a medianoche caduca */
  return sotd;
}

/* ---- 32. Mensajes temporales ---- */
function pruneDisappearingMessages(messages, hours, t) {
  hours = Number(hours) || 0;
  if (!hours) return (messages || []).slice();
  t = t || Date.now();
  var ttl = hours * 3600000;
  return (messages || []).filter(function (m) { return (t - (m.createdAt || 0)) < ttl; });
}

/* ---- 27. Recordatorio de eventos ---- */
var EVENT_REMINDER_LEADS = [10, 30, 60, 1440];
var EVENT_REMINDER_LABELS = { 10: '10 minutos antes', 30: '30 minutos antes', 60: '1 hora antes', 1440: '1 día antes' };
function eventReminderLead(state, eventId) {
  var v = state.eventReminders ? state.eventReminders[eventId] : undefined;
  return v == null ? 30 : v; /* por defecto 30 minutos antes */
}
function eventStartMs(ev) {
  if (!ev || !ev.date) return null;
  var t = ev.time ? ev.date + 'T' + ev.time + ':00' : ev.date + 'T00:00:00';
  var ms = new Date(t).getTime();
  return isFinite(ms) ? ms : null;
}
function eventReminderAt(ev, leadMin) {
  var start = eventStartMs(ev);
  if (start == null) return null;
  return start - (leadMin || 30) * 60000;
}

/* ---- 10. Verificación (espejo local de los criterios del servidor 3.8) ----
   El servidor decide; aquí solo se muestra qué falta con los datos que
   la app ya tiene, sin fingir que la verificación está concedida. */
var VERIFICATION_KEYS = ['telefono', 'perfil', 'antiguedad', 'publicaciones'];
var VERIFICATION_LABELS = {
  telefono: 'Número de teléfono verificado',
  perfil: 'Perfil completo (foto, nombre y biografía)',
  antiguedad: 'Cuenta con al menos 7 días',
  publicaciones: 'Al menos 5 publicaciones'
};
function verificationMissing(profile, postCount, phoneVerified, t) {
  var missing = [];
  if (!phoneVerified) missing.push('telefono');
  if (!profile || !profile.photo || !String(profile.name || '').trim() || !String(profile.bio || '').trim()) missing.push('perfil');
  var created = profile && profile.createdAt ? profile.createdAt : (t || Date.now());
  if ((t || Date.now()) - created < 7 * 86400000) missing.push('antiguedad');
  if ((postCount || 0) < 5) missing.push('publicaciones');
  return missing;
}

/* ---- 42. Quién compartió (solo reposts dentro de WordRed) ---- */
function sharesOf(state, postId) {
  var out = [];
  (state.posts || []).forEach(function (p) {
    if (p.sharedFrom && p.sharedFrom.id === postId) out.push({ phone: p.author, name: (state.profiles[p.author] || {}).name || p.author, at: p.createdAt, repostId: p.id });
  });
  out.sort(function (a, b) { return a.at - b.at; });
  return out;
}

/* ---- 41. Cambiar de cuenta ---- */
function addAccount(state, account) {
  if (!state.accounts) state.accounts = [];
  var phone = normPhone(account && account.phone);
  if (!phone) return { ok: false, error: 'Falta la cuenta.' };
  state.accounts = state.accounts.filter(function (a) { return normPhone(a.phone) !== phone; });
  state.accounts.unshift({ phone: phone, name: String((account && account.name) || ''), photo: String((account && account.photo) || ''), token: String((account && account.token) || '') });
  return { ok: true, accounts: state.accounts.slice() };
}
function removeAccount(state, phone) {
  if (!state.accounts) state.accounts = [];
  phone = normPhone(phone);
  state.accounts = state.accounts.filter(function (a) { return normPhone(a.phone) !== phone; });
  return { ok: true, accounts: state.accounts.slice() };
}

/* ---- 36. Portada de Destacadas ---- */
function validatePinnedCover(url) {
  url = String(url || '').trim();
  if (!url) return '';
  return isValidHttpUrl(url) ? url : null;
}
/* ---- 30. Nota de perfil ---- */
function validateProfileNote(note) {
  return String(note || '').trim().slice(0, 60);
}
/* ---- 39. Historia de solo texto ---- */
var STORY_TEXT_BG_COLORS = ['#e01430', '#111827', '#14532d', '#1e3a8a', '#7c2d12', '#4c1d95', '#0f766e', '#831843'];


/* ---- 43. Shorts guardados (vista filtrada de Guardadas) ---- */
function isShortVideoPost(post) {
  if (!post) return false;
  var media = (post.mediaList && post.mediaList.length ? post.mediaList : [{ src: post.media, type: post.mediaType }]);
  return media.some(function (m) {
    if (!m || !m.src) return false;
    return m.type === 'video' || /\.mp4(\?|$)|\.webm(\?|$)|video/i.test(m.src);
  });
}
function savedShorts(state, phone) {
  return (state.posts || []).filter(function (p) {
    return (p.savedBy || []).indexOf(phone) >= 0 && isShortVideoPost(p) && !C_isPostDeleted(state, p.id);
  });
  function C_isPostDeleted(st, id) { return (st.deletedPostIds || []).indexOf(id) >= 0; }
}

/* ---- 44. Tu tiempo en WordRed ---- */
function screenTimeTodayMs(state, t) {
  var key = todayStr(new Date(t || Date.now()));
  return (state.screenTime && state.screenTime[key]) || 0;
}
function recordScreenTime(state, ms, t) {
  if (!state.screenTime) state.screenTime = {};
  if (!ms || ms <= 0) return;
  var key = todayStr(new Date(t || Date.now()));
  state.screenTime[key] = (state.screenTime[key] || 0) + Math.round(ms);
  /* solo se guardan 30 días */
  var keys = Object.keys(state.screenTime).sort();
  while (keys.length > 30) { delete state.screenTime[keys.shift()]; }
}
function screenTimeWeek(state, t) {
  var out = [];
  var base = new Date(t || Date.now());
  for (var i = 6; i >= 0; i--) {
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
    var key = todayStr(d);
    out.push({ date: key, ms: (state.screenTime && state.screenTime[key]) || 0, label: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][d.getDay()] });
  }
  return out;
}
function formatScreenTime(ms) {
  var min = Math.floor((ms || 0) / 60000);
  if (min < 1) return 'menos de 1 min';
  if (min < 60) return min + ' min';
  var h = Math.floor(min / 60), m = min % 60;
  return h + ' h' + (m ? ' ' + m + ' min' : '');
}

/* ---- 45. Filtro de palabras ---- */
function normalizeWordFilter(words) {
  var out = [];
  (words || []).forEach(function (w) {
    w = String(w || '').trim().toLowerCase();
    if (w && w.length <= 40 && out.indexOf(w) < 0) out.push(w);
  });
  return out;
}
function containsBlockedWord(text, words) {
  var t = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9áéíóúñü]+/g, ' ') + ' ';
  var found = null;
  (words || []).forEach(function (w) {
    if (found) return;
    w = String(w || '').trim().toLowerCase();
    if (w && t.indexOf(' ' + w + ' ') >= 0) found = w;
  });
  return found;
}
function filterFeedWords(posts, words) {
  if (!words || !words.length) return { visible: (posts || []).slice(), hidden: [] };
  var visible = [], hidden = [];
  (posts || []).forEach(function (p) {
    if (containsBlockedWord(p.text || '', words)) hidden.push(p);
    else visible.push(p);
  });
  return { visible: visible, hidden: hidden };
}

/* ---- 46. Respaldo de chats ---- */
function exportChatsBackup(state) {
  var convos = [];
  Object.keys(state.conversations || {}).forEach(function (key) {
    var c = state.conversations[key];
    if (!c) return;
    convos.push({
      id: c.id || key, participants: (c.participants || []).slice(),
      messages: (c.messages || []).map(function (m) {
        return { id: m.id, from: m.from, text: m.text || '', media: m.media || '', mediaType: m.mediaType || '', stickerId: m.stickerId || '', createdAt: m.createdAt };
      })
    });
  });
  var groups = (state.groupChats || []).map(function (g) {
    return {
      id: g.id, name: g.name, participants: (g.participants || []).slice(),
      messages: (g.messages || []).map(function (m) {
        return { id: m.id, from: m.from, text: m.text || '', media: m.media || '', mediaType: m.mediaType || '', stickerId: m.stickerId || '', createdAt: m.createdAt };
      })
    };
  });
  return { app: 'WordRed', version: 1, exportedAt: now(), me: state.me, conversations: convos, groupChats: groups };
}
function importChatsBackup(state, backup) {
  if (!backup || backup.app !== 'WordRed' || !Array.isArray(backup.conversations)) return { ok: false, error: 'Ese archivo no es un respaldo de WordRed.' };
  var added = 0, dup = 0;
  (backup.conversations || []).forEach(function (bc) {
    if (!bc || !Array.isArray(bc.participants) || bc.participants.length < 2) return;
    var key = convoKey(bc.participants[0], bc.participants[1]);
    var local = state.conversations[key];
    if (!local) {
      local = { id: bc.id || key, participants: bc.participants.slice(), messages: [], unread: {} };
      state.conversations[key] = local;
    }
    var seen = {};
    local.messages.forEach(function (m) { seen[m.id] = true; });
    (bc.messages || []).forEach(function (m) {
      if (!m || !m.id || seen[m.id]) { if (m && m.id) dup++; return; }
      local.messages.push({ id: m.id, from: m.from, text: m.text || '', media: m.media || '', mediaType: m.mediaType || '', stickerId: validateStickerId(m.stickerId), createdAt: m.createdAt || now(), readBy: [] });
      seen[m.id] = true; added++;
    });
    local.messages.sort(function (a, b) { return a.createdAt - b.createdAt; });
  });
  (backup.groupChats || []).forEach(function (bg) {
    if (!bg || !bg.id) return;
    var g = null;
    (state.groupChats || []).forEach(function (x) { if (x.id === bg.id) g = x; });
    if (!g) {
      g = { id: bg.id, name: bg.name || 'Grupo', participants: (bg.participants || []).slice(), messages: [], unread: {}, createdAt: now() };
      state.groupChats.push(g);
    }
    var seen2 = {};
    g.messages.forEach(function (m) { seen2[m.id] = true; });
    (bg.messages || []).forEach(function (m) {
      if (!m || !m.id || seen2[m.id]) { if (m && m.id) dup++; return; }
      g.messages.push({ id: m.id, from: m.from, text: m.text || '', media: m.media || '', mediaType: m.mediaType || '', stickerId: validateStickerId(m.stickerId), createdAt: m.createdAt || now(), readBy: [] });
      seen2[m.id] = true; added++;
    });
    g.messages.sort(function (a, b) { return a.createdAt - b.createdAt; });
  });
  return { ok: true, added: added, duplicates: dup };
}

/* ---- 47. Stickers en el chat (12 ids exactos del contrato 3.8) ---- */
var STICKER_IDS = ['corazon', 'risa', 'fuego', 'estrella', 'abrazo', 'ok', 'triste', 'enojado', 'sorpresa', 'fiesta', 'gato', 'perro'];
var STICKER_NAMES = { corazon: 'Corazón', risa: 'Risa', fuego: 'Fuego', estrella: 'Estrella', abrazo: 'Abrazo', ok: 'OK', triste: 'Triste', enojado: 'Enojado', sorpresa: 'Sorpresa', fiesta: 'Fiesta', gato: 'Gato', perro: 'Perro' };
function validateStickerId(id) {
  id = String(id || '').trim().toLowerCase();
  return STICKER_IDS.indexOf(id) >= 0 ? id : '';
}
function stickerPath(id) {
  id = validateStickerId(id);
  return id ? 'stickers/' + id + '.svg' : '';
}

/* ---- 48. Video en la foto de perfil ---- */
function validateAvatarVideo(av) {
  if (!av) return null;
  var url = typeof av === 'string' ? av : String(av.url || '');
  if (!isValidHttpUrl(url)) return null;
  var dur = av && av.durationMs != null ? Number(av.durationMs) : null;
  if (dur != null && (!isFinite(dur) || dur < 0 || dur > 6000)) return null;
  return { url: url, durationMs: dur };
}


/* ---- 49. Horas tranquilas ---- */
function quietHoursOn(settings, t) {
  if (!settings || !settings.quietHours || !settings.quietHours.on) return false;
  var start = String(settings.quietHours.start || '22:00'), end = String(settings.quietHours.end || '07:00');
  function mins(hm) { var p = String(hm).split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); }
  var d = new Date(t || Date.now());
  var nowM = d.getHours() * 60 + d.getMinutes();
  var s = mins(start), e = mins(end);
  if (s === e) return false;
  if (s < e) return nowM >= s && nowM < e;
  return nowM >= s || nowM < e; /* cruza la medianoche */
}
function quietHoursValid(start, end) {
  return /^\d{2}:\d{2}$/.test(start || '') && /^\d{2}:\d{2}$/.test(end || '');
}

/* ---- 56. Reacciones a mensajes ---- */
var MSG_REACTION_EMOJIS = ['❤️', '😂', '😮', '😢', '😡', '👍'];
function validateMsgReaction(emoji) {
  return MSG_REACTION_EMOJIS.indexOf(emoji) >= 0 ? emoji : '';
}
/* Las tres aceptan el mensaje (m.reactions) o directamente el arreglo de reacciones. */
function _msgReactionsOf(m) {
  if (Array.isArray(m)) return m;
  return (m && m.reactions) || [];
}
function msgReactionCounts(m) {
  var out = {};
  _msgReactionsOf(m).forEach(function (r) { if (r && r.emoji) out[r.emoji] = (out[r.emoji] || 0) + 1; });
  return Object.keys(out).map(function (e) { return { emoji: e, count: out[e] }; });
}
function myMsgReaction(m, phone) {
  var f = null;
  _msgReactionsOf(m).forEach(function (r) { if (r && r.phone === phone) f = r.emoji; });
  return f;
}
function applyMsgReaction(m, phone, name, emoji) {
  var reactions = _msgReactionsOf(m).slice();
  reactions = reactions.filter(function (r) { return r.phone !== phone; });
  if (emoji) reactions.push({ phone: phone, name: name || phone, emoji: emoji });
  if (m && !Array.isArray(m)) m.reactions = reactions; /* se guarda en el mensaje */
  return reactions;
}

/* ---- 55. Ubicación en vivo ---- */
function liveLocationActive(ll, t) {
  if (!ll) return false;
  return (t || Date.now()) < Number(ll.expiresAt || 0);
}
function liveLocationRemainingMs(ll, t) {
  if (!ll) return 0;
  return Math.max(0, Number(ll.expiresAt || 0) - (t || Date.now()));
}

/* ---- 59. Enlaces guardados ---- */
function saveLink(state, url, title) {
  if (!state.savedLinks) state.savedLinks = [];
  var u = String(url || '').trim();
  if (!isValidHttpUrl(u)) return { ok: false, error: 'Ese enlace no es válido.' };
  var host = '';
  try { host = new URL(u).hostname.replace(/^www\./, ''); } catch (e) { host = u; }
  if (state.savedLinks.some(function (x) { return x.url === u; })) return { ok: false, error: 'Ese enlace ya está guardado.' };
  state.savedLinks.unshift({ url: u, host: host, title: String(title || host).slice(0, 200), savedAt: now() });
  return { ok: true };
}
function removeSavedLink(state, url) {
  if (!state.savedLinks) state.savedLinks = [];
  state.savedLinks = state.savedLinks.filter(function (x) { return x.url !== url; });
  return { ok: true };
}

/* ---- 60. Tu semana en WordRed ---- */
function weekStats(state, phone, t) {
  t = t || Date.now();
  var since = t - 7 * 86400000;
  var myPosts = (state.posts || []).filter(function (p) { return p.author === phone && !p.pageId && p.createdAt >= since; });
  var likesReceived = 0, commentsReceived = 0;
  myPosts.forEach(function (p) {
    likesReceived += Object.keys(p.likes || {}).length;
    commentsReceived += commentCount(p);
  });
  var newFriends = 0;
  (state.requests || []).forEach(function (r) {
    if (r.status === 'accepted' && (r.from === phone || r.to === phone) && r.createdAt >= since) newFriends++;
  });
  var topLiked = null, topViewed = null;
  myPosts.forEach(function (p) {
    var lc = Object.keys(p.likes || {}).length;
    if (!topLiked || lc > Object.keys(topLiked.likes || {}).length) topLiked = p;
    var v = (state.postStatsCache && state.postStatsCache[p.id] && state.postStatsCache[p.id].views) || 0;
    if (!topViewed || v > ((state.postStatsCache && state.postStatsCache[topViewed.id] && state.postStatsCache[topViewed.id].views) || 0)) topViewed = p;
  });
  return {
    posts: myPosts.length, likesReceived: likesReceived, commentsReceived: commentsReceived,
    newFriends: newFriends, topLiked: topLiked, topViewed: topViewed,
    topViewedCount: topViewed ? ((state.postStatsCache && state.postStatsCache[topViewed.id] && state.postStatsCache[topViewed.id].views) || 0) : 0
  };
}


/* ---- 61. Inicio solo de amigos ---- */
function friendsOnlyPosts(posts, me, friends) {
  var set = {};
  (friends || []).forEach(function (f) { set[f] = true; });
  return (posts || []).filter(function (p) { return p.author === me || set[p.author]; });
}

/* ---- 62. Invitar a un grupo con un enlace ---- */
function groupInviteLink(groupId) {
  return 'wordred://group/' + groupId;
}
function groupInviteHttpsLink(groupId) {
  return 'https://wordred.app/group/' + groupId;
}
function parseGroupInviteLink(url) {
  var u = String(url || '').trim();
  var m = u.match(/^wordred:\/\/group\/([A-Za-z0-9_\-]+)/) || u.match(/^https?:\/\/wordred\.app\/group\/([A-Za-z0-9_\-]+)/);
  return m ? m[1] : '';
}

/* ---- 63. Marco para tu foto ---- */
var AVATAR_FRAMES = ['none', 'rojo', 'dorado', 'azul', 'verde', 'morado', 'arcoiris'];
function validateAvatarFrame(f) {
  f = String(f || 'none').trim().toLowerCase();
  return AVATAR_FRAMES.indexOf(f) >= 0 ? f : 'none';
}
function avatarFrameCss(frame) {
  var map = {
    rojo: '0 0 0 3px #e01430',
    dorado: '0 0 0 3px #d4a017',
    azul: '0 0 0 3px #2563eb',
    verde: '0 0 0 3px #16a34a',
    morado: '0 0 0 3px #9333ea',
    arcoiris: '0 0 0 3px #e01430, 0 0 0 6px #f59e0b, 0 0 0 9px #16a34a'
  };
  return map[validateAvatarFrame(frame)] || '';
}

/* ---- 64. Sonido distinto para cada chat ---- */
var CHAT_SOUNDS = [
  { id: 'bell', name: 'Campana', file: 'bell.wav' },
  { id: 'chime', name: 'Campanita', file: 'chime.wav' },
  { id: 'pop', name: 'Pop', file: 'pop.wav' },
  { id: 'soft', name: 'Suave', file: 'soft.wav' }
];
function validateChatSound(id) {
  id = String(id || 'bell').trim().toLowerCase();
  var ok = false;
  CHAT_SOUNDS.forEach(function (s) { if (s.id === id) ok = true; });
  return ok ? id : 'bell';
}
function chatSoundName(id) {
  var f = null;
  CHAT_SOUNDS.forEach(function (s) { if (s.id === validateChatSound(id)) f = s; });
  return f ? f.name : 'Campana';
}

/* ---- 65. Filtro para tu foto de perfil ---- */
var AVATAR_FILTERS = ['Original', 'Blanco y negro', 'Sepia', 'Vivo', 'Suave'];
function validateAvatarFilter(f) {
  f = String(f || 'Original').trim();
  return AVATAR_FILTERS.indexOf(f) >= 0 ? f : 'Original';
}
function avatarFilterCss(filter) {
  var map = {
    'Blanco y negro': 'grayscale(1)',
    'Sepia': 'sepia(0.8)',
    'Vivo': 'saturate(1.6) contrast(1.1)',
    'Suave': 'brightness(1.08) saturate(0.85)'
  };
  return map[validateAvatarFilter(filter)] || '';
}

/* 1.5.26: las constantes de arriba se definieron DESPUÉS del literal
   `api` (línea 3645), así que el literal las capturó como undefined
   (var se eleva sin valor; solo las funciones se elevan con valor).
   Se asignan aquí, ya con su valor, para que core.js las exporte de
   verdad: sin esto la app se rompía al abrir el compositor (C.MOODS),
   los ajustes (C.TEXT_SIZES), los regalos del live (C.LIVE_GIFTS), el
   selector de stickers (C.STICKER_IDS) y el resto de la 1.5.26. */
api.TEXT_SIZES = TEXT_SIZES;
api.TEXT_SIZE_LABELS = TEXT_SIZE_LABELS;
api.CHAT_BG_COLORS = CHAT_BG_COLORS;
api.MOODS = MOODS;
api.STORY_REACTION_EMOJIS = STORY_REACTION_EMOJIS;
api.LIVE_GIFTS = LIVE_GIFTS;
api.EVENT_REMINDER_LEADS = EVENT_REMINDER_LEADS;
api.EVENT_REMINDER_LABELS = EVENT_REMINDER_LABELS;
api.VERIFICATION_KEYS = VERIFICATION_KEYS;
api.VERIFICATION_LABELS = VERIFICATION_LABELS;
api.STORY_TEXT_BG_COLORS = STORY_TEXT_BG_COLORS;
api.STICKER_IDS = STICKER_IDS;
api.STICKER_NAMES = STICKER_NAMES;
api.MSG_REACTION_EMOJIS = MSG_REACTION_EMOJIS;
api.AVATAR_FRAMES = AVATAR_FRAMES;
api.CHAT_SOUNDS = CHAT_SOUNDS;
api.AVATAR_FILTERS = AVATAR_FILTERS;

if (typeof module !== 'undefined' && module.exports) module.exports = api;
root.WordRedCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
