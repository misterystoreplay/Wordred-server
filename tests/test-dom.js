/* test-dom — Flujo completo de WordRed v1.5.13 en jsdom (sin Chrome).
   Carga index.html + core.js + app.js en un DOM real y recorre por DOM:
   registro por teléfono, perfil, feed de ejemplo, publicar (texto, foto,
   video, enlace, encuesta), reacción, comentario, amigos, grupos,
   mensajes, búsqueda, ajustes, Marketplace, eventos, páginas,
   personalización de perfil, modo claro y diálogos de confirmación,
   más todo lo nuevo de la v1.2 (olas 1–12), la v1.4 (archivos en el
   servidor, en vivo para todos) y la v1.5 (llamadas reales, visto y
   escribiendo, comentarios con contador, avisos fuera de la app y
   bloqueo con huella/PIN). */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' — ' + extra : '')); }
}

const html = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8')
  .replace(/<script src="[^"]+"><\/script>/g, '');
const dom = new JSDOM(html, { url: 'http://127.0.0.1/', runScripts: 'dangerously', pretendToBeVisual: true });
const { window } = dom;
const errors = [];
window.addEventListener('error', (e) => errors.push('window.onerror: ' + (e.message || e.error)));
// La app ya no usa el diálogo del sistema: todo se confirma con el diálogo
// propio de WordRed (#confirmOverlay, #confirmYes / #confirmNo).
const calls = { sendVerificationCode: [], toast: [], openExternalUrl: [], openInAppWeb: [], uploads: {}, postNotifications: [], openedFiles: [], shared: [], dialed: [], defaultRole: [], bgService: [], pendingCallJson: '', openedApps: [], uninstalledApps: [], appInfoOpened: [], sharedApps: [], homeRoleReq: [], revealedStatusBar: [], isDefaultHome: false, media: [], profilePosts: [], mediaReads: {}, notifications: [], ringback: [], incomingRing: [], speakerphone: [], reengage: [], unreadActivity: [], reengageLast: 0, lockFailNext: false, phonePermReq: 0, callSignalFail: false, location: '', locationPermReq: 0, weatherFail: false, mlFail: false, pinShortcut: [], pinRemoved: [], launchGame: '', googleSignIn: [], localNotifs: [], localNotifCancels: [], calendarAdds: [], chatBackups: [], chatNotifications: [], api1526: [], uploadNotifs: [], mediaFailStart: 0, mediaFailChunk: 0, mediaStartCount: 0 };
let lastMediaMime = 'image/jpeg';
let uploadSeq = 0;
window.AndroidBridge = {
  startSmsRetriever: () => 'OK',
  getSmsAppHash: () => 'TESTHASH123',
  /* v2.9: inicio con Google por el puente nativo (en el simulador solo se registra la llamada). */
  signInWithGoogle: (clientId) => { calls.googleSignIn.push(clientId); return 'OK'; },
  sendVerificationCode: (c) => { calls.sendVerificationCode.push(c); },
  saveMediaFile: (name) => 'content://com.wordred.app.fileprovider/media/' + name,
  startMediaUpload: (name) => { const id = 'up_test_' + (++uploadSeq); calls.uploads[id] = { name, chunks: [] }; return id; },
  appendMediaChunk: (id, b64) => { if (calls.uploads[id]) calls.uploads[id].chunks.push(b64); return 'OK'; },
  /* v1.5.14 audio: el puente real devuelve la URI con el nombre del
     archivo subido (cancion.mp3, video.mp4...); el simulador hace lo
     mismo para que el tipo se detecte igual que en el teléfono. */
  finishMediaUpload: (id) => 'content://com.wordred.app.fileprovider/media/' + (calls.uploads[id] ? calls.uploads[id].name : 'test-video.mp4'),
  cancelMediaUpload: () => {},
  // puente v1.4: lectura por partes de un content:// para subirlo al servidor
  startMediaRead: (uri) => { const id = 'read_dom_1'; calls.mediaReads[id] = { uri, chunks: ['REFUTVMtREUtVklERU8tREUtUFJVRUJB'] }; return id + '|24'; },
  readMediaChunk: (id) => { const r = calls.mediaReads[id]; if (!r || !r.chunks.length) return ''; return r.chunks.shift(); },
  closeMediaRead: (id) => { delete calls.mediaReads[id]; },
  /* 1.5.29: aviso de progreso de subida en el celular (se registra la llamada). */
  showUploadNotification: (p, l) => { calls.uploadNotifs.push({ op: 'progress', p, label: l }); },
  finishUploadNotification: (ok, t) => { calls.uploadNotifs.push({ op: ok ? 'done' : 'error', text: t }); },
  hideUploadNotification: () => { calls.uploadNotifs.push({ op: 'hide' }); },
  saveFile: () => 'OK:/x',
  shareText: (t) => { calls.shared.push({ text: t }); }, shareFile: () => {},
  shareAppApk: () => { calls.appShared = (calls.appShared || 0) + 1; return 'OK'; },
  shareMediaUri: (uri, mime, text) => { calls.shared.push({ uri, mime, text }); return 'OK'; },
  toast: (m) => { calls.toast.push(m); },
  requestCameraPermission: () => {}, requestFilesPermission: () => { calls.filesPermReq = (calls.filesPermReq || 0) + 1; }, requestNotificationPermission: () => {},
  /* v1.5.14 audio: el permiso de audio está concedido salvo que la prueba lo niegue. */
  hasAudioPermission: () => calls.audioPermGranted !== false,
  openExternalUrl: (url) => { calls.openExternalUrl.push(url); },
  /* v2.1: vista web interna de WordRed (demos de juegos y páginas de Play Store) */
  openInAppWeb: (url, title) => { calls.openInAppWeb.push({ url, title }); },
  // puente v1.2 (olas 1–5, 12): notificaciones, archivos, voz, llamadas, bloqueo, SMS y teléfono
  showPostNotification: (t, x, id) => { calls.postNotifications.push({ t, x, id }); },
  openFile: (uri, mime) => { calls.openedFiles.push({ uri, mime }); return 'OK'; },
  requestMicPermission: () => {},
  requestPhonePermissions: () => { calls.phonePermReq = (calls.phonePermReq || 0) + 1; },
  /* v1.6 clima: ubicación del puente nativo ("lat,lon" o "" sin ubicación) */
  getLocation: () => calls.location,
  requestLocationPermission: () => { calls.locationPermReq = (calls.locationPermReq || 0) + 1; },
  /* v1.8: accesos directos anclados de juegos en el escritorio */
  isPinShortcutSupported: () => calls.pinSupported !== false,
  pinGameShortcut: (id, name, icon) => { calls.pinShortcut.push({ id, name, icon }); return 'OK'; },
  removeGameShortcut: (id) => { calls.pinRemoved.push(id); return 'OK'; },
  isGameShortcutPinned: (id) => calls.pinShortcut.some(function (x) { return x.id === id; }),
  getLaunchGame: () => calls.launchGame || '',
  startVoiceRecording: () => 'OK',
  stopVoiceRecording: () => { setTimeout(() => { if (window.__onVoiceRecorded) window.__onVoiceRecorded('content://com.wordred.app.fileprovider/media/voz_1.m4a', 3500); }, 0); return 'OK'; },
  setSpeakerphone: (on) => { calls.speakerphone.push(!!on); },
  requestAppLockEnable: () => { setTimeout(() => { if (window.__onAppLockResult) window.__onAppLockResult(!calls.lockFailNext); calls.lockFailNext = false; }, 0); return 'OK'; },
  requestAppLockDisable: () => { setTimeout(() => { if (window.__onAppLockResult) window.__onAppLockResult(calls.lockFailNext); calls.lockFailNext = false; }, 0); return 'OK'; },
  /* v1.5.12: sin SMS. Servicio en segundo plano (avisos con la app cerrada). */
  startBackgroundService: (phone, base, token) => { calls.bgService.push({ action: 'start', phone, base, token }); },
  stopBackgroundService: () => { calls.bgService.push({ action: 'stop' }); },
  takePendingCall: () => calls.pendingCallJson || '',
  /* v1.5.12 (punto 9): lanzador de inicio. */
  listInstalledApps: () => JSON.stringify([
    { pkg: 'com.demo.camara', name: 'Cámara', icon: '' },
    { pkg: 'com.demo.galeria', name: 'Galería', icon: '' },
    { pkg: 'com.demo.mensajes', name: 'Mensajes', icon: '' },
    { pkg: 'com.demo.musica', name: 'Música', icon: '' },
    { pkg: 'com.demo.mapas', name: 'Mapas', icon: '' },
    { pkg: 'com.demo.calculadora', name: 'Calculadora', icon: '' }
  ]),
  openApp: (pkg) => { calls.openedApps.push(pkg); return 'OK'; },
  uninstallApp: (pkg) => { calls.uninstalledApps.push(pkg); return 'OK'; },
  openAppInfo: (pkg) => { calls.appInfoOpened.push(pkg); return 'OK'; },
  shareApp: (pkg) => { calls.sharedApps.push(pkg); return 'OK'; },
  /* v1.5.15: numerito rojo de notificaciones por app (el conteo lo pone
     la prueba en calls.notifCounts; sin acceso concedido devuelve {}). */
  getAppNotificationCounts: () => JSON.stringify(calls.notifCounts || {}),
  /* v1.5.17 punto 3: notificaciones de otras apps para la campana. */
  getOtherAppNotifications: () => JSON.stringify(calls.otherNotifs || []),
  isNotificationAccessGranted: () => calls.notifAccessGranted !== false,
  /* v1.5.17 punto 2: instalar la actualización descargada. */
  downloadAndInstallApk: (url) => { calls.installApk = calls.installApk || []; calls.installApk.push(url); },
  /* v1.5.26 (66): avisos locales (recordatorios/eventos/programadas),
     calendario del teléfono, respaldo de chats y sonido por chat. */
  scheduleLocalNotification: (id, atMs, title, text, target) => { calls.localNotifs.push({ id, atMs, title, text, target }); return 'OK'; },
  cancelLocalNotification: (id) => { calls.localNotifCancels.push(id); return 'OK'; },
  addToCalendar: (title, startMs, endMs, place, desc) => { calls.calendarAdds.push({ title, startMs, endMs, place, desc }); return 'OK'; },
  saveChatBackup: (json) => { calls.chatBackups.push(json); return 'OK:wordred-chats-test.json'; },
  showChatNotification: (title, text, target, soundId) => { calls.chatNotifications.push({ title, text, target, soundId }); },
  /* v1.5.17 punto 4: batería real del teléfono. */
  getBatteryStatus: () => JSON.stringify(calls.batteryStatus || { level: -1, charging: false }),
  takePendingBatteryNotices: () => JSON.stringify(calls.pendingBattery || []),
  /* v1.5.15 punto 11: altura de la barra de navegación del sistema en px
     CSS (0 = modo gestos, sin hueco; la prueba lo cambia a 144 = botones). */
  getNavBarHeight: () => 0,
  isNotificationAccessGranted: () => calls.notifAccessGranted !== false,
  openNotificationAccessSettings: () => { calls.notifAccessOpened = (calls.notifAccessOpened || 0) + 1; },
  isDefaultHome: () => calls.isDefaultHome,
  requestHomeRole: () => { calls.homeRoleReq.push(true); },
  revealStatusBar: () => { calls.revealedStatusBar.push(true); return 'OK'; },
  getCallLog: () => JSON.stringify([{ number: '5522222222', name: '', type: 2, date: Date.now() - 3600000, duration: 42 }]),
  getDeviceContacts: () => JSON.stringify([{ name: 'Bruno Prueba', phone: '5522222222' }]),
  // v1.6: fiel a MainActivity.dialNumber — "OK" solo cuando WordRed es
  // el marcador predeterminado (llamada por Telecom); si no lo es, la
  // llamada la hace la app de teléfono del sistema ("OK:SYSTEM").
  dialNumber: (n) => { calls.dialed.push(n); return window.AndroidBridge.isDefaultDialer() === 'true' ? 'OK' : 'OK:SYSTEM'; },
  isDefaultDialer: () => false,
  requestDefaultDialer: () => { calls.defaultRole.push('dialer'); return 'OK'; },
  endTelecomCall: () => {}, answerTelecomCall: () => {}, setTelecomMuted: () => {},
  // puente v1.5: tonos de llamada, altavoz real, avisos fuera de la app y reenganche
  startRingbackTone: () => { calls.ringback.push('start'); },
  stopRingbackTone: () => { calls.ringback.push('stop'); },
  startIncomingRingtone: () => { calls.incomingRing.push('start'); },
  stopIncomingRingtone: () => { calls.incomingRing.push('stop'); },
  setTelecomSpeakerphone: (on) => { calls.speakerphone.push(!!on); },
  showNotification: (t, x, target, actions) => { calls.notifications.push({ t, x, target, actions }); },
  scheduleReengagement: (ms) => { calls.reengage.push({ ms }); },
  cancelReengagement: () => { calls.reengage.push({ cancel: true }); },
  setUnreadActivity: (n) => { calls.unreadActivity.push(n); },
  getReengageLast: () => calls.reengageLast,
  requestUnlock: () => { calls.ringback.push('unlock'); },
  // puente v1.7: grabación por trozos con nombre exacto + pantalla
  startNamedMediaUpload: (name) => { const id = 'up_named_' + (++uploadSeq); calls.uploads[id] = { name, chunks: [] }; return id + '|' + name; },
  getMediaFileUri: (name) => 'content://com.wordred.app.fileprovider/media/' + name,
  deleteMediaFile: (name) => { (calls.deletedMedia = calls.deletedMedia || []).push(name); return 'OK'; },
  startScreenShare: () => { (calls.screenShare = calls.screenShare || []).push('start'); setTimeout(() => { if (window.__onScreenShareStarted) window.__onScreenShareStarted(); }, 0); return 'OK'; },
  stopScreenShare: () => { (calls.screenShare = calls.screenShare || []).push('stop'); }
};
window.eval(fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8'));
window.eval(fs.readFileSync(path.join(__dirname, '..', 'assets', 'qrcode.js'), 'utf8'));
window.eval(fs.readFileSync(path.join(__dirname, '..', 'assets', 'jsqr.js'), 'utf8'));
window.eval(fs.readFileSync(path.join(__dirname, '..', 'assets', 'games.js'), 'utf8'));
// v1.6 minijuegos: jsdom no tiene requestAnimationFrame; el bucle del
// juego lo necesita para correr (sus errores de dibujo ya los atrapa el
// propio módulo).
window.requestAnimationFrame = function (cb) { return setTimeout(function () { cb(Date.now()); }, 16); };
window.cancelAnimationFrame = function (id) { clearTimeout(id); };
window.eval(fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8'));
// Mocks para llamadas WebRTC y para el servidor (v1.2, olas 3 y 12)
window.RTCPeerConnection = function () { this.createOffer = async () => ({ type: 'offer', sdp: 'falso' }); this.setLocalDescription = async () => {}; this.setRemoteDescription = async () => {}; this.createAnswer = async () => ({ type: 'answer', sdp: 'falso' }); this.addIceCandidate = async () => {}; this.addTrack = () => {}; this.close = () => {}; this.onicecandidate = null; this.ontrack = null; };
window.RTCSessionDescription = function (d) { return d; };
if (!window.navigator.mediaDevices) window.navigator.mediaDevices = {};
window.navigator.mediaDevices.getUserMedia = async () => ({ getTracks: () => [] });
// v1.5: lives con estado en el simulador, como el servidor real (crear,
// entrar y terminar cambian la lista que devuelve GET /api/lives).
const mockLives = [];
// v1.5.14: perfil del servidor al entrar (el simulador devuelve el
// perfil guardado en mockServerProfile, o 404 si la cuenta es nueva;
// con mockProfileStatus se simula que el servidor falla).
let mockServerProfile = null;
let mockProfileStatus = 0;
let pendingPromoMock54 = null;
// v2.1: calificaciones de juegos en el simulador (base = lo que ya
// calificaron otras personas; el promedio es el de todos).
const mockGameBase = { 'ps:com.roblox.client': { sum: 21, count: 5 } };
const mockGameStats = {};
const mockGameMine = {};
window.fetch = async (url, opts) => {
  const u = String(url);
  const ok = (o) => ({ ok: true, status: 200, json: async () => o });
  // v1.5.14: GET /api/profile/:phone — el perfil guardado en el servidor.
  if (u.indexOf('/api/profile/') >= 0) {
    if (mockProfileStatus) return { ok: false, status: mockProfileStatus, json: async () => ({ ok: false, error: 'Error del servidor.' }) };
    if (mockServerProfile) return ok({ ok: true, profile: mockServerProfile });
    return { ok: false, status: 404, json: async () => ({ ok: false, error: 'Perfil no encontrado.' }) };
  }
  // v1.6 publicidad: API pública de Mercado Libre (sin clave). Con mlFail
  // se simula que Mercado Libre no responde: no hay tarjetas de producto.
  if (u.indexOf('https://api.mercadolibre.com') === 0) {
    if (calls.mlFail) throw new Error('fetch fallido (sin Mercado Libre)');
    return ok({ results: [
      { id: 'MLM111', title: 'Audífonos inalámbricos', price: 299, currency_id: 'MXN', thumbnail: 'https://http2.mlstatic.com/D_111.jpg', permalink: 'https://articulo.mercadolibre.com.mx/MLM-111' },
      { id: 'MLM222', title: 'Teclado mecánico', price: 899, currency_id: 'MXN', thumbnail: 'https://http2.mlstatic.com/D_222.jpg', permalink: 'https://articulo.mercadolibre.com.mx/MLM-222' }
    ] });
  }
  // v1.6 clima: Open-Meteo (gratis, sin clave). Con weatherFail se simula
  // que no hay internet para el clima.
  if (u.indexOf('https://api.open-meteo.com') === 0) {
    if (calls.weatherFail) throw new Error('fetch fallido (sin internet)');
    // v1.8: Open-Meteo trae también pronóstico por horas (48 h) y por días (7).
    const hours = [], htemps = [], hcodes = [], hrains = [];
    for (let hi = 0; hi < 48; hi++) { hours.push('2026-11-13T' + String(hi % 24).padStart(2, '0') + ':00'); htemps.push(20 + (hi % 8)); hcodes.push(hi % 3 === 0 ? 61 : 0); hrains.push(hi % 3 === 0 ? 60 : 10); }
    const days = [], dcodes = [], dmax = [], dmin = [], drains = [];
    for (let di = 0; di < 7; di++) { days.push('2026-11-' + String(13 + di).padStart(2, '0')); dcodes.push(di % 2 === 0 ? 0 : 61); dmax.push(28 - di); dmin.push(16 - di); drains.push(di % 2 === 0 ? 5 : 70); }
    return ok({ current: { time: '2026-11-13T10:00', temperature_2m: 24, weather_code: 0, relative_humidity_2m: 55, wind_speed_10m: 12 },
      hourly: { time: hours, temperature_2m: htemps, weather_code: hcodes, precipitation_probability: hrains },
      daily: { time: days, weather_code: dcodes, temperature_2m_max: dmax, temperature_2m_min: dmin, precipitation_probability_max: drains } });
  }
  // v1.5.26 (18/52): MyMemory (traducción gratuita, sin clave).
  if (u.indexOf('https://api.mymemory.translated.net/get') === 0) {
    return ok({ responseData: { translatedText: 'Hola mundo traducido' }, responseStatus: 200 });
  }
  // v1.5.26 (53): geocodificación gratuita de Open-Meteo (sin clave).
  if (u.indexOf('https://geocoding-api.open-meteo.com/v1/search') === 0) {
    return ok({ results: [{ name: 'Ciudad de México', latitude: 19.4326, longitude: -99.1332, country: 'México', admin1: 'Ciudad de México' }] });
  }
  // v1.5.14: página de prueba para el título de la tarjeta de enlace.
  if (u === 'https://titulo-prueba.com/pagina') return { ok: true, status: 200, json: async () => ({}), text: async () => '<html><head><title>La página de prueba</title></head><body>Hola</body></html>' };
  /* 1.5.47: noticias en vivo (rss2json): artículos distintos por
     categoría y distintos de la lista fija, para comprobar que la app
     pinta lo que devuelve el servicio y no la lista que lleva dentro. */
  if (u.indexOf('https://api.rss2json.com/v1/api.json') === 0) {
    var rssCat47 = 'noticias';
    try { var rssUrl47 = decodeURIComponent((u.split('rss_url=')[1] || '').split('&')[0] || ''); if (rssUrl47.indexOf('marca') >= 0) rssCat47 = 'deportes'; else if (rssUrl47.indexOf('xataka') >= 0) rssCat47 = 'tecnologia'; else if (rssUrl47.indexOf('entretenimiento') >= 0) rssCat47 = 'entretenimiento'; else if (rssUrl47.indexOf('econom') >= 0) rssCat47 = 'economia'; } catch (e) {}
    return ok({ status: 'ok', items: [
      { title: 'Noticia en vivo de prueba 1 (' + rssCat47 + ')', link: 'https://www.bbc.com/mundo/articles/vivo1', thumbnail: 'https://ichef.bbci.co.uk/ace/ws/240/vivo1.jpg', description: '' },
      { title: 'Noticia en vivo de prueba 2 (' + rssCat47 + ')', link: 'https://e00-marca.uecdn.es/vivo2', thumbnail: 'https://e00-marca.uecdn.es/vivo2.jpg', description: '' }
    ] });
  }
  // v1.3: la app ya trae la dirección dentro; el simulador la atiende
  // igual que la de pruebas local.
  if (u.indexOf('http://127.0.0.1:3000') !== 0 && u.indexOf('https://wordred-server.onrender.com') !== 0) throw new Error('fetch fallido (sin servidor)');
  if (u.includes('/api/health')) return ok({ ok: true, version: '1.4' });
  /* v1.5.19 punto 2: la última versión es la instalada (1.5.63): las
     revisiones en segundo plano no encuentran nada nuevo. */
  if (u.includes('/api/app/latest')) return ok({ ok: true, versionName: '1.5.63', versionCode: 78, url: 'https://wordred-server.onrender.com/app/WordRed.apk', notes: '' });
  /* 1.5.40: la cartelera del servidor (GET /api/billboard): 2 películas
     distintas de la lista fija, para comprobar que la app pinta lo que
     devuelve el servidor y no la lista que lleva dentro. */
  if (u.includes('/api/billboard')) return ok({ ok: true, movies: [
    { title: 'Película de prueba 1', date: '1 ene 2027', poster: 'https://image.tmdb.org/t/p/w500/servidor1.jpg', trailer: 'https://www.youtube.com/watch?v=AAAAAAAAAAA', now: false },
    { title: 'Película de prueba 2', date: '2 ene 2027', poster: 'https://image.tmdb.org/t/p/w500/servidor2.jpg', trailer: 'https://www.youtube.com/watch?v=BBBBBBBBBBB', now: true }
  ] });
  /* 1.5.43 (6): la cartelera de juegos del servidor (GET /api/games-billboard): 2 juegos
     distintos de la lista fija, para comprobar que la app pinta lo que
     devuelve el servidor y no la lista que lleva dentro. */
  if (u.includes('/api/games-billboard')) return ok({ ok: true, games: [
    { title: 'Juego de prueba 1', date: '3 ene 2027', poster: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/111/library_600x900.jpg', trailer: 'https://www.youtube.com/watch?v=DDDDDDDDDDD', now: false },
    { title: 'Juego de prueba 2', date: '4 ene 2027', poster: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/222/library_600x900.jpg', trailer: 'https://www.youtube.com/watch?v=EEEEEEEEEEE', now: true }
  ] });
  /* 1.5.58: el catálogo de dramas de DramaBox del servidor (GET /api/kdramas): 2 dramas
     distintos de la lista fija, para comprobar que la app pinta lo que
     devuelve el servidor y no la lista que lleva dentro. */
  if (u.includes('/api/kdramas')) return ok({ ok: true, kdramas: [
    { id: 'drama-prueba-1', name: 'Drama de prueba 1', synopsis: 'Sinopsis de prueba 1.', poster: 'https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg', totalEps: 5, source: 'dramabox', channel: 'DramaBox - Stream Drama Shorts', eps: [
      { ep: 1, videoId: 'AAAAAAAAAAA', title: 'Episodio 1 de prueba', ytTitle: 'Episodio 1 de prueba', thumb: 'https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg' },
      { ep: 2, videoId: 'BBBBBBBBBBB', title: 'Episodio 2 de prueba', ytTitle: 'Episodio 2 de prueba', thumb: 'https://i.ytimg.com/vi/BBBBBBBBBBB/hqdefault.jpg' }
    ] },
    { id: 'drama-prueba-2', name: 'Drama de prueba 2', synopsis: 'Sinopsis de prueba 2.', poster: 'https://i.ytimg.com/vi/CCCCCCCCCCCCC/hqdefault.jpg', totalEps: 3, source: 'dramabox', channel: 'DramaBox - Stream Drama Shorts', eps: [
      { ep: 1, videoId: 'CCCCCCCCCCC', title: 'Episodio único de prueba', ytTitle: 'Episodio único de prueba', thumb: 'https://i.ytimg.com/vi/CCCCCCCCCCCCC/hqdefault.jpg' }
    ] }
  ] });
  /* 1.5.54: el juego destacado del servidor (GET /api/featured-game): el
     juego real con sus 8 capturas, para comprobar que la app pinta lo
     que devuelve el servidor y no la lista que lleva dentro. */
  if (u.includes('/api/featured-game')) return ok({ ok: true, game: { id: 'fantore-resurreccion', name: 'Fantore Resurrección', package: 'com.misterystore.fantoreresurreccion', version: '2.0', logo: 'fantore/logo.png', icon: 'fantore/icon.png' }, screenshots: ['fantore/cap1.jpg', 'fantore/cap2.jpg', 'fantore/cap3.jpg', 'fantore/cap4.jpg', 'fantore/cap5.jpg', 'fantore/cap6.jpg', 'fantore/cap7.jpg', 'fantore/cap8.jpg'], stats: { ratingAvg: 0, ratingCount: 0, plays: 0, players: 0 } });
  /* 1.5.53: solicitudes de promoción (servidor 4.3): la solicitud se
     guarda y se puede consultar; por defecto no hay decisiones. */
  if (u.includes('/api/promotions/request')) { var prBody53 = (() => { try { return JSON.parse((opts && opts.body) || '{}'); } catch (e) { return {}; } })(); return ok({ ok: true, request: { id: 'req-dom-1', postId: prBody53.postId || '', tier: prBody53.tier || 0, status: 'pending', createdAt: Date.now() } }); }
  if (u.includes('/api/promotions/mine')) return ok({ ok: true, requests: [] });
  /* 1.5.54: solicitudes de promoción (servidor 4.4, dueño): por defecto
     el servidor niega (403, no es la cuenta principal); las pruebas de
     aprobación cambian `pendingPromoMock54` a 200 con solicitudes. */
  if (u.includes('/api/promotions/pending')) {
    if (pendingPromoMock54 && pendingPromoMock54.mode === 'allow') return ok({ ok: true, requests: pendingPromoMock54.requests || [] });
    return { ok: false, status: 403, json: async () => ({ ok: false, error: 'Solo la cuenta principal puede revisar solicitudes.' }) };
  }
  // v2.9: código por correo e inicio con Google (como el servidor real).
  if (u.includes('/api/auth/email/request-code')) return ok({ ok: true, email: 'ana@correo.com', sentByEmail: true });
  if (u.includes('/api/auth/email/verify')) return ok({ ok: true, email: 'ana@correo.com', token: 'tok-dom-mail' });
  if (u.includes('/api/auth/google')) return ok({ ok: true, email: 'ana@gmail.com', token: 'tok-dom-google', hasProfile: false, name: 'Ana Google', photo: '' });
  if (u.includes('/api/auth/request-code')) return ok({ ok: true, phone: '5511111111', devCode: '123456' });
  if (u.includes('/api/auth/verify')) return ok({ ok: true, phone: '5511111111', token: 'tok-dom-test' });
  // v1.4: subida de archivos por partes y perfil al servidor. La
  // extensión de la URL sigue el tipo enviado al abrir la subida,
  // como el servidor real (video/mp4 -> .mp4, audio -> .mp3).
  // 1.5.46: cada apertura da un uploadId DISTINTO (para comprobar que
  // un reintento no reenvía al viejo) y con mediaFailStart/mediaFailChunk
  // se simula que el servidor dormido no responde N veces.
  if (u.includes('/api/media/start')) { try { lastMediaMime = (JSON.parse((opts && opts.body) || '{}').type) || 'image/jpeg'; } catch (e) {} if (calls.mediaFailStart > 0) { calls.mediaFailStart--; throw new Error('fetch fallido (servidor dormido)'); } var upId46 = 'up_dom_' + (++calls.mediaStartCount); calls.media.push({ op: 'start', uploadId: upId46 }); (calls.mediaUploads = calls.mediaUploads || {})[upId46] = { received: 0, finished: false, url: null }; return ok({ ok: true, uploadId: upId46 }); }
  /* 1.5.62: el simulador lleva los bytes recibidos por uploadId (como el
     servidor real): el trozo devuelve el total real (no 100 fijo, que la
     verificación nueva rechazaría) y /api/media/status lo reporta. */
  if (u.includes('/api/media/status')) { var stId62 = decodeURIComponent((u.split('uploadId=')[1] || '').split('&')[0] || ''); var stUp62 = (calls.mediaUploads || {})[stId62]; if (!stUp62) return { ok: false, status: 404, json: async () => ({ ok: false, error: 'Subida no encontrada.' }) }; calls.media.push({ op: 'status', uploadId: stId62 }); return ok({ ok: true, uploadId: stId62, received: stUp62.received, finished: stUp62.finished, id: stUp62.finished ? 'm_dom_1' : null, url: stUp62.url }); }
  if (u.includes('/api/media/chunk')) { if (calls.mediaFailChunk > 0) { calls.mediaFailChunk--; throw new Error('fetch fallido (servidor dormido)'); } var chBody62 = (() => { try { return JSON.parse((opts && opts.body) || '{}'); } catch (e) { return {}; } })(); var chUp62 = (calls.mediaUploads || {})[chBody62.uploadId]; if (!chUp62) return { ok: false, status: 404, json: async () => ({ ok: false, error: 'Subida no encontrada.' }) }; var chBytes62 = 0; try { chBytes62 = Buffer.from(String(chBody62.data || '').replace(/\s/g, ''), 'base64').length; } catch (e) {} chUp62.received += chBytes62; calls.media.push({ op: 'chunk', uploadId: chBody62.uploadId }); return ok({ ok: true, received: chUp62.received }); }
  if (u.includes('/api/media/finish')) { var finBody62 = (() => { try { return JSON.parse((opts && opts.body) || '{}'); } catch (e) { return {}; } })(); var finUp62 = (calls.mediaUploads || {})[finBody62.uploadId]; if (!finUp62) return { ok: false, status: 404, json: async () => ({ ok: false, error: 'Subida no encontrada.' }) }; calls.media.push({ op: 'finish', uploadId: finBody62.uploadId }); const ext = lastMediaMime.indexOf('video/') === 0 ? 'mp4' : lastMediaMime.indexOf('audio/') === 0 ? 'mp3' : 'jpg'; /* 1.5.62: finish idempotente: un segundo finish devuelve la misma URL. */ if (finUp62.finished) return ok({ ok: true, id: 'm_dom_1', url: finUp62.url, type: lastMediaMime, size: finUp62.received }); finUp62.finished = true; finUp62.url = '/media/m_dom_1.' + ext; return ok({ ok: true, id: 'm_dom_1', url: finUp62.url, type: lastMediaMime, size: finUp62.received }); }
  if (u.includes('/api/profile')) { calls.profilePosts.push(u); return ok({ ok: true, profile: { phone: '5511111111', name: 'Ana DOM' } }); }
  // v1.5.26 (66): endpoints nuevos del servidor 3.8, fieles al contrato.
  if (u.includes('/api/story-views')) {
    calls.api1526.push({ u, method: (opts && opts.method) || 'GET' });
    if ((opts && opts.method) === 'POST') return ok({ ok: true, recorded: true, count: 1 });
    return ok({ ok: true, count: 1, viewers: [{ phone: '1000000002', name: 'Bruno Prueba', avatar: '', at: Date.now() }] });
  }
  if (u.includes('/api/posts/') && u.includes('/view')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, recorded: true, views: 5 }); }
  if (u.includes('/api/posts/') && u.includes('/stats')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, views: 5, likes: 2, comments: 1, shares: 1 }); }
  if (u.includes('/api/posts/') && u.includes('/shares')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, count: 1, shares: [{ phone: '1000000002', name: 'Bruno Prueba', avatar: '', at: Date.now(), repostId: 'p26share' }] }); }
  if (u.includes('/api/posts/') && u.includes('/votes')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, options: [{ mediaUrl: 'https://x.com/a.jpg', label: 'A' }, { mediaUrl: 'https://x.com/b.jpg', label: 'B' }], votes: [2, 1], voters: [{ phone: '1000000002', name: 'Bruno Prueba', avatar: '', option: 0, at: Date.now() }] }); }
  if (u.includes('/api/posts/') && u.includes('/vote')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, votes: [2, 1], myVote: 0 }); }
  if (u.includes('/api/stories/') && u.includes('/poll-vote')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, poll: { question: '¿Te gusta?', options: [{ text: 'Sí', votes: 1 }, { text: 'No', votes: 0 }] } }); }
  if (u.includes('/api/stories/') && u.includes('/react')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, reaction: { emoji: '❤️' } }); }
  if (u.includes('/api/stories/') && u.includes('/reactions')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, count: 1, byEmoji: { '❤️': 1 }, reactions: [{ phone: '1000000002', name: 'Bruno Prueba', avatar: '', emoji: '❤️', at: Date.now() }] }); }
  if (u.includes('/api/challenges')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, challenges: [{ tag: '#RetoBaile', count: 3, latest: Date.now(), recent: [{ postId: 'p26reto', author: '1000000002', createdAt: Date.now() }] }] }); }
  if (u.includes('/api/verification/status')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, verified: false, missing: [{ key: 'telefono', label: 'Teléfono verificado' }, { key: 'publicaciones', label: 'Al menos 5 publicaciones' }] }); }
  if (u.includes('/api/verification/request')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: false, verified: false, missing: [{ key: 'telefono', label: 'Teléfono verificado' }] }); }
  if (u.includes('/api/close-friends')) {
    calls.api1526.push({ u, method: (opts && opts.method) || 'GET' });
    if ((opts && opts.method) === 'DELETE') return ok({ ok: true, closeFriends: [] });
    return ok({ ok: true, closeFriends: [{ phone: '1000000002', name: 'Bruno Prueba', avatar: '' }] });
  }
  if (u.includes('/api/muted')) {
    calls.api1526.push({ u, method: (opts && opts.method) || 'GET' });
    if ((opts && opts.method) === 'DELETE') return ok({ ok: true, muted: [] });
    return ok({ ok: true, muted: [{ phone: '1000000002', name: 'Bruno Prueba', avatar: '' }] });
  }
  if (u.includes('/api/wishlist')) {
    calls.api1526.push({ u, method: (opts && opts.method) || 'GET' });
    if ((opts && opts.method) === 'DELETE') return ok({ ok: true, wishlist: [] });
    return ok({ ok: true, wishlist: [{ id: 'lst26', title: 'Bici', price: 3000, seller: '1000000002', city: 'CDMX', status: 'Disponible' }] });
  }
  if (u.includes('/api/coupons/') && u.includes('/apply')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, code: 'VERANO10', discountPct: 10, originalPrice: 6000, finalPrice: 5400 }); }
  if (u.includes('/api/coupons')) {
    calls.api1526.push({ u, method: (opts && opts.method) || 'GET' });
    if ((opts && opts.method) === 'POST') return ok({ ok: true, coupon: { code: 'VERANO10', discountPct: 10, listingId: null, expiresAt: Date.now() + 86400000 } });
    return ok({ ok: true, coupons: [{ code: 'VERANO10', discountPct: 10, listingId: null, expiresAt: Date.now() + 86400000 }] });
  }
  if (u.includes('/api/audio-rooms')) {
    calls.api1526.push({ u, method: (opts && opts.method) || 'GET' });
    if ((opts && opts.method) === 'POST' && u.endsWith('/api/audio-rooms')) return ok({ ok: true, room: { id: 'room26', title: 'Charla', topic: 'Música', owner: '5511111111', participants: [{ phone: '5511111111', name: 'Ana', avatar: '', muted: false }], createdAt: Date.now() } });
    if (u.includes('/join') || u.includes('/mute')) return ok({ ok: true, room: { id: 'room26', title: 'Charla', topic: 'Música', owner: '1000000002', participants: [{ phone: '1000000002', name: 'Bruno Prueba', avatar: '', muted: false }, { phone: '5511111111', name: 'Ana', avatar: '', muted: false }], createdAt: Date.now() } });
    if (u.includes('/leave')) return ok({ ok: true });
    return ok({ ok: true, rooms: [{ id: 'room26', title: 'Charla', topic: 'Música', owner: '1000000002', ownerName: 'Bruno Prueba', participants: [{ phone: '1000000002', name: 'Bruno Prueba', avatar: '', muted: false }], count: 1, createdAt: Date.now() }] });
  }
  if (u.includes('/api/tournaments/current')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, tournament: { id: 't26', weekKey: '2026-W46', gameId: 'snake', gameName: 'Snake', startsAt: Date.now(), endsAt: Date.now() + 604800000, leaderboard: [{ phone: '5511111111', name: 'Ana', avatar: '', score: 120, rank: 1 }, { phone: '1000000002', name: 'Bruno Prueba', avatar: '', score: 90, rank: 2 }] } }); }
  if (u.includes('/api/tournaments/') && u.includes('/score')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, best: 120, improved: true }); }
  if (u.includes('/api/groups/') && u.includes('/public')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, group: { id: 'g26', name: 'Grupo de prueba', desc: 'Grupo para probar el enlace', cover: '', memberCount: 5, secret: false, creator: '5511111111' } }); }
  if (u.includes('/api/groups/') && u.includes('/invite/decline')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true }); }
  if (u.includes('/api/groups/') && u.includes('/invite')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true }); }
  if (u.includes('/api/groups/') && u.includes('/join')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true }); }
  if (u.includes('/api/lives/') && u.includes('/gifts')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, counts: { rosa: 1 }, total: 1, top: [{ phone: '1000000002', name: 'Bruno Prueba', avatar: '', gifts: 1 }] }); }
  if (u.includes('/api/lives/') && u.includes('/gift')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, counts: { rosa: 1 }, total: 1 }); }
  if (u.includes('/api/lives/') && u.includes('/invite/respond')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, coHost: '1000000002' }); }
  if (u.includes('/api/lives/') && u.includes('/invite')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, invite: { phone: '1000000002', status: 'pending' } }); }
  if (u.includes('/api/conversations/') && u.includes('/disappearing')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, disappearingHours: 24 }); }
  if (u.includes('/api/messages/') && u.includes('/react')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, reactions: [{ phone: '5511111111', name: 'Ana', emoji: '❤️' }] }); }
  if (u.includes('/api/messages/') && u.includes('/location')) { calls.api1526.push({ u, method: (opts && opts.method) || 'GET' }); return ok({ ok: true, message: { id: 'm26loc', liveLocation: { lat: 19.4326, lng: -99.1332, expiresAt: Date.now() + 3600000 } } }); }
  if (u.includes('/api/live-signal')) return ok({ ok: true });
  // v1.6: señalización de llamadas WebRTC (la oferta llega al otro
  // teléfono por el servidor; con callSignalFail se simula que el otro
  // no está en línea).
  if (u.includes('/api/call-signal')) {
    if (calls.callSignalFail) return { ok: false, status: 404, json: async () => ({ ok: false, error: 'La otra persona no está en línea' }) };
    return ok({ ok: true });
  }
  // v1.5: lives (crear, entrar, chat, likes, terminar)
  if (u.includes('/api/lives')) {
    const body = (() => { try { return JSON.parse((opts && opts.body) || '{}'); } catch (e) { return {}; } })();
    if (u.endsWith('/api/lives') && (opts && opts.method) === 'POST') {
      const live = { id: 'live_dom_1', host: '5511111111', title: body.title || '', createdAt: Date.now(), viewers: [], viewerCount: 0, chat: [], reactions: {}, likes: 0 };
      const i = mockLives.findIndex(function (l) { return l.id === live.id; });
      if (i >= 0) mockLives[i] = live; else mockLives.push(live);
      return ok({ ok: true, live: live });
    }
    if (u.includes('/join')) {
      let live = mockLives.filter(function (l) { return l.id === 'live_dom_2'; })[0];
      if (!live) { live = { id: 'live_dom_2', host: '5522222222', title: 'Live de Bruno', createdAt: Date.now(), viewers: ['5511111111'], viewerCount: 1, chat: [], reactions: {}, likes: 0 }; mockLives.push(live); }
      return ok({ ok: true, live: live });
    }
    if (u.includes('/chat')) return ok({ ok: true, message: { id: 'lmsg_dom_1', author: '5511111111', text: body.text || '', createdAt: Date.now() } });
    if (u.includes('/like')) return ok({ ok: true, likes: 1 });
    if (u.includes('/end')) { const i = mockLives.findIndex(function (l) { return u.includes(l.id); }); if (i >= 0) mockLives.splice(i, 1); return ok({ ok: true }); }
    if (u.includes('/leave')) return ok({ ok: true });
    return ok({ ok: true, lives: mockLives });
  }
  // v2.1: estadísticas y calificaciones de juegos (como el servidor real:
  // el promedio es de todas las personas; la misma persona actualiza su voto).
  if (u.includes('/api/games/stats')) return ok({ ok: true, stats: mockGameStats });
  if (u.includes('/api/games/') && u.includes('/rate')) {
    const body = (() => { try { return JSON.parse((opts && opts.body) || '{}'); } catch (e) { return {}; } })();
    const id = decodeURIComponent(u.split('/api/games/')[1].split('/rate')[0]);
    (calls.gameRatePosts = calls.gameRatePosts || []).push({ url: u, body: body });
    /* La base son solo las otras personas (mi voto anterior no está en
       ella): mi voto se suma y, si vuelvo a calificar, reemplaza al
       anterior sin duplicar el conteo, como el servidor real. */
    const base = mockGameBase[id] || { sum: 0, count: 0 };
    const sum = base.sum + body.stars, count = base.count + 1;
    mockGameMine[id] = body.stars;
    const stats = { plays: 12, players: 9, ratingAvg: Math.round((sum / count) * 10) / 10, ratingCount: count };
    mockGameStats[id] = stats;
    return ok({ ok: true, stats: stats });
  }
  if (u.includes('/api/games/') && u.includes('/play')) {
    const id = decodeURIComponent(u.split('/api/games/')[1].split('/play')[0]);
    const stats = mockGameStats[id] || { plays: 0, players: 0, ratingAvg: 0, ratingCount: 0 };
    stats.plays = (stats.plays || 0) + 1; stats.players = 1;
    mockGameStats[id] = stats;
    return ok({ ok: true, stats: stats });
  }
  if (u.includes('/api/posts') && opts && opts.method === 'DELETE') {
    (calls.postDeletes = calls.postDeletes || []).push(u);
    /* v1.5.11: simular que el servidor despierta (falla por conexión
       unas veces) o que rechaza el borrado (403, sin reintento). */
    if (calls.deleteFailTimes > 0) { calls.deleteFailTimes--; throw new Error('sin conexión'); }
    if (calls.deleteStatus) return { ok: false, status: calls.deleteStatus, json: async () => ({ ok: false, error: 'Sin permiso.' }) };
    return ok({ ok: true });
  }
  if (u.includes('/api/posts') && opts && opts.method === 'PUT') {
    /* v1.5.25: el PUT real del servidor 3.7 cuenta cada guardado como una
       edición (suma editCount y rechaza con 400 si ya se usaron las 5). */
    if (calls.putPostsReject) return { ok: false, status: 400, json: async () => ({ ok: false, error: 'Esta publicación ya se editó 5 veces (el máximo). Ya no se puede modificar.' }) };
    var putBody = (() => { try { return JSON.parse(opts.body || '{}'); } catch (e) { return {}; } })();
    var putCount = ((putBody.post && putBody.post.editCount) || 0) + 1;
    return ok({ ok: true, post: { id: (putBody.post && putBody.post.id) || '', editCount: putCount }, editsLeft: 5 - putCount });
  }
  if (u.includes('/api/posts')) return ok({ ok: true, post: {} });
  if (u.includes('/api/stories')) return ok({ ok: true, story: {} });
  if (u.includes('/api/listings')) return ok({ ok: true, listing: {} });
  if (u.includes('/api/messages')) return ok({ ok: true, message: {} });
  return { ok: false, status: 404, json: async () => ({ ok: false, error: 'No encontrado' }) };
};

const $ = (id) => window.document.getElementById(id);
const q = (sel) => window.document.querySelector(sel);
const qa = (sel) => Array.from(window.document.querySelectorAll(sel));
function click(el) { if (el) el.click(); }
/* v1.5.10: el borrado es asíncrono (pide DELETE al servidor y espera
   la confirmación): tras confirmar hay que dejar que la promesa
   termine antes de comprobar el estado. */
const tick = () => new Promise(function (r) { setTimeout(r, 10); });
function setVal(el, v) {
  el.value = v;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}
function waitFor(fn, ms) {
  const deadline = Date.now() + (ms || 10000);
  return new Promise((resolve) => {
    (function poll() {
      let ok = false;
      try { ok = !!fn(); } catch (e) {}
      if (ok || Date.now() > deadline) resolve(ok);
      else setTimeout(poll, 100);
    })();
  });
}
function confirmShown() { return $('confirmOverlay').classList.contains('on'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  try {
    check('carga sin errores de ventana', errors.length === 0, errors.slice(0, 3).join(' | '));
    check('v2.1 invitado: al abrir por primera vez se muestra la pantalla de cuentas/registro (no se entra como invitado solo)', !$('authView').classList.contains('hidden') && $('appView').classList.contains('hidden'));
    click($('authGuest'));
    check('v2.1 invitado: al entrar como invitado se ve el inicio y el aviso de invitado arriba', !$('appView').classList.contains('hidden') && $('authView').classList.contains('hidden') && !$('guestBanner').classList.contains('hidden'));
    click($('guestVerifyBtn'));
    check('v2.1 invitado: el botón de verificar abre la pantalla de registro', !$('authView').classList.contains('hidden'));
    // v2.9: entrar con Google y con correo, junto al registro por teléfono.
    check('v2.9 registro: junto al teléfono están la opción de Google y la de correo', /número/i.test($('authStepPhone').textContent) && $('authGoogle') && /Continuar con Google/.test($('authGoogle').textContent) && $('authEmail') && $('authSendEmailCode'));
    const toastBeforeGoogle = $('toast').textContent;
    const extBeforeGoogle = calls.openExternalUrl.length;
    click($('authGoogle'));
    check('v1.5.8 Google web: el botón abre la página de Google en el navegador (sin pedir ningún ID)', calls.openExternalUrl.length === extBeforeGoogle + 1 && calls.openExternalUrl[calls.openExternalUrl.length - 1] === 'https://wordred-server.onrender.com/oauth/google', JSON.stringify(calls.openExternalUrl));
    check('v1.5.8 Google web: no hay ningún campo de ID de cliente en el registro ni en Ajustes', !$('authGoogleSetup') && !$('authGoogleClientId') && !$('settingsGoogleClientId'));
    // Entrar con Google (la vuelta del navegador devuelve el token y el servidor lo verifica).
    await window.__onGoogleSignIn({ idToken: 'tok-google-test', email: 'ana@gmail.com', name: 'Ana Google', photo: '' });
    check('v2.9 registro: Google verificado abre crear el perfil con el nombre ya puesto', !$('authStepProfile').classList.contains('hidden') && $('authName').value === 'Ana Google');
    window.__wordredTest.getState().settings.serverToken = '';
    // Código por correo (el servidor lo manda; aquí el simulador dice que sí).
    window.__wrOpenVerify();
    check('v2.9 registro: volver a verificar muestra el paso del teléfono con Google y correo', !$('authStepPhone').classList.contains('hidden'));
    const toastBeforeMail = $('toast').textContent;
    setVal($('authEmail'), 'no-es-correo');
    click($('authSendEmailCode'));
    check('v2.9 registro: el correo inválido se rechaza sin llamar al servidor', /correo válido/.test($('toast').textContent) && $('toast').textContent !== toastBeforeMail);
    setVal($('authEmail'), 'ana@correo.com');
    click($('authSendEmailCode'));
    await waitFor(function () { return !$('authStepCode').classList.contains('hidden'); });
    check('v2.9 registro: el código por correo abre el paso del código con el aviso del correo', !$('authStepCode').classList.contains('hidden') && /ana@correo\.com/.test($('authCodeHint').textContent));
    setVal($('authCode'), '123456');
    click($('authVerify'));
    await waitFor(function () { return !$('authStepProfile').classList.contains('hidden'); });
    check('v2.9 registro: el código por correo verifica y abre crear el perfil', !$('authStepProfile').classList.contains('hidden'));
    window.__wordredTest.getState().settings.serverToken = '';
    // registro por teléfono (flujo real por DOM)
    setVal($('authPhone'), '5511111111');
    click($('authSendCode'));
    const code = calls.sendVerificationCode[0];
    check('el código se manda por notificación en modo local', typeof code === 'string' && /^\d{6}$/.test(code), String(code));
    setVal($('authCode'), code);
    click($('authVerify'));
    /* v1.5.14: la entrada es asíncrona (consulta el perfil del servidor
       cuando no está en este teléfono): se espera la decisión. */
    await waitFor(function () { return !$('authStepProfile').classList.contains('hidden'); });
    check('el código verifica y abre el perfil', !$('authStepProfile').classList.contains('hidden'));
    setVal($('authName'), 'Ana DOM');
    setVal($('authBio'), 'Probando WordRed en jsdom.');
    click($('authFinish'));
    check('entra a la app y se ve el inicio', !$('appView').classList.contains('hidden') && $('view-feed').classList.contains('on'));
    /* 1.5.34: el estado compartido de jsdom acumula 10+ publicaciones
       reales durante la corrida y la regla automática ocultaría los
       ejemplos a mitad de la suite. Las pruebas que siguen asumen la
       línea base de la 1.5.32 (ejemplos visibles); la regla de
       auto-ocultado se prueba en sus secciones propias (v1.8 y 1.5.33),
       que fuerzan y restauran el interruptor. */
    window.__wordredTest.getState().settings.examplesOverride = 'show';
    window.__wordredTest.renderFeed();
    await sleep(300);
    check('v1.3 auto: al entrar, la app se vincula sola sin pulsar nada', window.__wordredTest.getServerToken() === 'tok-dom-test');
    check('el feed trae las publicaciones de ejemplo', qa('#feed .post').length >= 4, 'posts: ' + qa('#feed .post').length);
    check('las publicaciones de ejemplo llevan la etiqueta "Ejemplo"', qa('#feed .demobadge').length >= 4);
    check('v2.0 ejemplos: entre los ejemplos hay una publicación con foto', qa('#feed .post').some(function (el) { return !!el.querySelector('img[alt="Foto"]') && !!el.querySelector('.demobadge'); }));
    check('v2.0 ejemplos: en la 1.5.34 los ejemplos traen exactamente 1 video (el clip neutro de la ciudad)', qa('#feed .post').filter(function (el) { return !!el.querySelector('video') && !!el.querySelector('.demobadge'); }).length === 1);
    check('v2.0 ejemplos: entre los ejemplos hay una publicación con música compartida', qa('#feed .post').some(function (el) { return !!el.querySelector('.songRow') && !!el.querySelector('.demobadge'); }));
    check('v2.0 ejemplos: cada cuenta de ejemplo tiene su imagen de logo', qa('#feed .post').filter(function (el) { return !!el.querySelector('.demobadge'); }).every(function (el) { var av = el.querySelector('img.avatar'); if (!av) return false; var src = av.getAttribute('src') || ''; if (src.indexOf('data:image/svg+xml') !== 0) return false; var svg = decodeURIComponent(src.split(',')[1] || ''); return svg.indexOf('rx=') >= 0; }));
    // 1.5.54: la fila de arriba del Inicio ya no son historias, son los reels.
    check('1.5.54 reels: la fila de reels del Inicio está visible', qa('#storiesRow .homeReel1549').length >= 1);
    const storyCards = qa('#storiesRow .homeReel1549');
    check('1.5.60 reels: cada reel es un RECTÁNGULO con esquinas redondeadas (140×190, radio 18 px; los círculos de la 1.5.59 se van)', storyCards.length >= 1 && storyCards.every(function (el) { var c = el.querySelector('.homeReelRect1560'); return !!c && window.getComputedStyle(c).borderRadius === '18px' && window.getComputedStyle(c).width === '140px' && window.getComputedStyle(c).height === '190px'; }), storyCards.map(function (el) { var c = el.querySelector('.homeReelRect1560'); return c && window.getComputedStyle(c).borderRadius; }).join(','));
    const storyCardsWithAuthor = storyCards.filter(function (el) { return (el.getAttribute('onclick') || '').indexOf('__wrOpenReel(') >= 0; });
    // 1.5.55: al entrar, el único reel con video es el de ejemplo y es
    // horizontal, así que arriba no hay reels con autor todavía; el caso
    // positivo (un reel vertical sí muestra la imagen de su cuenta) se
    // prueba en la sección 1.5.55. Aquí solo se exige que cada reel con
    // autor que haya muestre su imagen (o su inicial).
    check('1.5.54 reels: cada reel muestra la imagen de la cuenta que lo publicó', storyCardsWithAuthor.every(function (el) { return !!el.querySelector('.homeReelRect1560 img, .homeReelRect1560 .homeReelPh1549'); }), 'reels=' + storyCards.length + ' con autor=' + storyCardsWithAuthor.length);
    check('1.5.60 reels: el primer rectángulo permite crear un reel propio', storyCards.length >= 1 && storyCards[0].classList.contains('homeReelMe1549') && (storyCards[0].getAttribute('onclick') || '').indexOf('__wrOpenReelCreate') >= 0 && !!storyCards[0].querySelector('.homeReelAdd1549') && storyCards[0].textContent.indexOf('Agregar reel') >= 0);
    if (storyCardsWithAuthor[0]) {
      storyCardsWithAuthor[0].click();
      check('v1.6 historias: tocar una historia la abre para verla', $('shortsOverlay').classList.contains('on') && !!$('shortsBody').innerHTML);
      click($('shortsClose'));
    }
    check('la barra inferior tiene 5 secciones sin Música, sin Avisos, Amigos, Mensajes ni Mercado (v1.5.16)', qa('#bottomNav button').length === 5 && !qa('#bottomNav button').map(b => b.textContent).join(' ').includes('Música') && !qa('#bottomNav button').map(b => b.textContent).join(' ').includes('Avisos') && !qa('#bottomNav button').map(b => b.textContent).join(' ').includes('Amigos') && !qa('#bottomNav button').map(b => b.textContent).join(' ').includes('Mensajes') && !qa('#bottomNav button').map(b => b.textContent).join(' ').includes('Mercado') && $('navLauncherBtn').getAttribute('aria-label') === 'Aplicaciones' && $('navLauncherBtn').textContent.trim() === '');
    // v1.6 barra inferior: botones más grandes (iconos y zona táctil)
    const navBtns16 = qa('#bottomNav button');
    const navBtnCs16 = window.getComputedStyle(navBtns16[0]);
    const navSvgCs16 = window.getComputedStyle(navBtns16[0].querySelector('.ic svg'));
    check('v1.6 barra inferior: los botones tienen zona táctil más grande', navBtns16.length === 5 && parseInt(navBtnCs16.paddingTop) >= 8 && parseInt(navBtnCs16.paddingBottom) >= 8, 'padding=' + navBtnCs16.paddingTop + '/' + navBtnCs16.paddingBottom);
    check('v1.6 barra inferior: los iconos son más grandes', parseInt(navSvgCs16.width) >= 28 && parseInt(navSvgCs16.height) >= 28, navSvgCs16.width + 'x' + navSvgCs16.height);
    check('v1.6 barra inferior: las etiquetas se siguen leyendo bien', parseInt(navBtnCs16.fontSize) >= 10 && navBtns16.every(function (b) { return b.id === 'navLauncherBtn' ? (b.getAttribute('aria-label') || '').length > 0 : b.textContent.trim().length > 0; }), 'font=' + navBtnCs16.fontSize);
    check('v1.6 barra inferior: los 5 botones comparten el ancho en una fila (no se salen) — 1.5.48: de vuelta al flex de antes de 1.5.47 (dos grupos laterales + botón central), sin la grid de 5 columnas', /nav#bottomNav\{[^}]*display:flex/.test(html) && !/nav#bottomNav\{[^}]*grid-template-columns:repeat\(5,1fr\)/.test(html) && /nav#bottomNav \.bn-side\{flex:1/.test(html) && /nav#bottomNav button\.bn-launcher\{flex:0 0 auto/.test(html) && !/\.bn-side\{display:contents/.test(html));
    // ---- v1.6 clima y hora real en el inicio ----
    // Tarjeta antes de la primera publicación (después de historias y de la caja
    // de publicar): hora real en vivo + clima de Open-Meteo con la ubicación
    // real del teléfono. Sin ubicación o sin internet NUNCA inventa un clima.
    {
      const now = new Date();
      const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const card = $('weatherCard');
      check('v1.6 clima: la tarjeta existe en el inicio', !!card);
      const doc = window.document;
      const pos = card.compareDocumentPosition($('feed'));
      check('v1.6 clima: la tarjeta está antes de la primera publicación', (pos & doc.DOCUMENT_POSITION_FOLLOWING) !== 0);
      check('v1.6 clima: la tarjeta está en el inicio, en su propio apartado que se puede mover (1.5.36)', !!card.closest('.homeWidget') && card.closest('.homeWidget').getAttribute('data-widget') === 'clima' && (pos & doc.DOCUMENT_POSITION_FOLLOWING) !== 0);
      check('v1.6 clima: el reloj muestra la hora real en vivo', $('weatherTime').textContent.trim() === hhmm, 'reloj=' + $('weatherTime').textContent);
      check('v1.6 clima: la fecha real se muestra junto al reloj', $('weatherDate').textContent.indexOf(String(now.getFullYear())) >= 0, 'fecha=' + $('weatherDate').textContent);
      // El reloj en vivo se actualiza al llamar a su función (cada minuto).
      await window.__wordredTest.updateWeatherClock();
      check('v1.6 clima: el reloj se actualiza al refrescarlo', $('weatherTime').textContent.trim() === hhmm);
      // v2.0: la hora y el clima van separados, cada uno en su propio
      // recuadro independiente y más grande, en el mismo lugar.
      const timeCard = $('weatherTimeCard');
      check('v2.0 clima: la hora tiene su propio recuadro independiente', !!timeCard && timeCard !== card && timeCard.classList.contains('glass'));
      check('v2.0 clima: el recuadro de la hora trae el reloj y la fecha', !!timeCard.querySelector('#weatherTime') && !!timeCard.querySelector('#weatherDate'));
      check('v2.0 clima: el recuadro del clima trae la información del clima', !!card.querySelector('#weatherInfo'));
      check('v2.0 clima: los dos recuadros están en el mismo lugar (antes del inicio)', (timeCard.compareDocumentPosition($('feed')) & doc.DOCUMENT_POSITION_FOLLOWING) !== 0 && (card.compareDocumentPosition($('feed')) & doc.DOCUMENT_POSITION_FOLLOWING) !== 0);
      check('v2.0 clima: la hora se ve más grande', parseFloat(window.getComputedStyle($('weatherTime')).fontSize) >= 32, 'tamaño=' + window.getComputedStyle($('weatherTime')).fontSize);
      // 1.5.47: el clima YA NO pide ubicación al cargar: con una ciudad
      // guardada muestra su clima sin tocar el GPS; sin ciudad guardada
      // muestra el buscador, nunca un clima inventado.
      window.__wordredTest.getState().weather = null;
      window.__wordredTest.setWeatherCity({ name: 'Ciudad de México', lat: 19.43, lng: -99.13 });
      calls.location = '';
      calls.weatherFail = false;
      const waitWx47 = async function () { for (let wi = 0; wi < 120 && window.__wordredTest.isWeatherLoading(); wi++) await new Promise(function (r) { setTimeout(r, 25); }); };
      let geoCalls47 = 0;
      try { Object.defineProperty(window.navigator, 'geolocation', { value: { getCurrentPosition: function () { geoCalls47++; }, watchPosition: function () { return 1; }, clearWatch: function () {} }, configurable: true }); } catch (e) {}
      await window.__wordredTest.loadWeather();
      check('1.5.47 clima: con ciudad guardada muestra su clima sin GPS', $('weatherInfo').textContent.indexOf('24°') >= 0, 'info=' + $('weatherInfo').textContent);
      check('1.5.47 clima: con ciudad guardada muestra la condición real', $('weatherInfo').textContent.indexOf('Despejado') >= 0, 'info=' + $('weatherInfo').textContent);
      check('1.5.47 clima: con ciudad guardada muestra la humedad', $('weatherInfo').textContent.indexOf('55%') >= 0, 'info=' + $('weatherInfo').textContent);
      check('1.5.47 clima: al cargar con ciudad guardada NO se llamó a la geolocalización', geoCalls47 === 0, 'llamadas=' + geoCalls47);
      check('1.5.47 clima: el último clima queda guardado para sin internet', !!window.__wordredTest.getState().weather && window.__wordredTest.getState().weather.temp === 24);
      // Sin ciudad guardada y sin ubicación: NO inventa un clima; dice que
      // hay que escribir una ciudad, y el botón abre el buscador.
      window.__wordredTest.getState().weather = null;
      window.__wordredTest.setWeatherCity(null);
      calls.location = '';
      await window.__wordredTest.loadWeather();
      check('1.5.47 clima: sin ciudad no inventa temperatura', $('weatherInfo').textContent.indexOf('°') < 0, 'info=' + $('weatherInfo').textContent);
      check('1.5.47 clima: sin ciudad pide escribir una ciudad (no pide ubicación)', $('weatherInfo').textContent.toLowerCase().indexOf('escribe una ciudad') >= 0, 'info=' + $('weatherInfo').textContent);
      check('1.5.47 clima: sin ciudad hay botón para buscarla', !!$('weatherEnableBtn'), 'botón ausente');
      check('1.5.47 clima: sin ciudad tampoco se llamó a la geolocalización', geoCalls47 === 0, 'llamadas=' + geoCalls47);
      // El botón abre el detalle; el icono de mi ubicación (a la derecha de
      // la barra) pide el GPS; al concederlo el clima se carga solo.
      $('weatherEnableBtn').click();
      check('1.5.47 clima: el botón abre el detalle del clima', $('weatherOverlay').classList.contains('on'));
      check('1.5.47 clima: el detalle trae el icono de mi ubicación a la derecha de la barra', !!$('weatherMyLocBtn1547') && $('weatherMyLocBtn1547').parentElement.lastElementChild === $('weatherMyLocBtn1547'), 'botón=' + !!$('weatherMyLocBtn1547'));
      calls.locationPermReq = 0;
      calls.location = '19.43,-99.13';
      $('weatherMyLocBtn1547').click();
      check('1.5.47 clima: el icono pide el permiso de ubicación', calls.locationPermReq >= 1, 'req=' + calls.locationPermReq);
      window.__onPermissionResult('location', true);
      for (let wi = 0; wi < 40 && $('weatherInfo').textContent.indexOf('24°') < 0; wi++) await new Promise(function (r) { setTimeout(r, 25); });
      check('1.5.47 clima: al conceder la ubicación carga el clima', $('weatherInfo').textContent.indexOf('24°') >= 0, 'info=' + $('weatherInfo').textContent);
      await waitWx47();
      // Si se niega la ubicación, se avisa y se sigue mostrando la ciudad guardada.
      window.__wordredTest.setWeatherCity({ name: 'Ciudad de México', lat: 19.43, lng: -99.13 });
      await window.__wordredTest.loadWeather();
      await waitWx47();
      for (let wi = 0; wi < 40 && $('weatherInfo').textContent.indexOf('24°') < 0; wi++) await new Promise(function (r) { setTimeout(r, 25); });
      calls.location = '';
      try { Object.defineProperty(window.navigator, 'geolocation', { value: { getCurrentPosition: function (ok, err) { if (err) err({ code: 1, message: 'denied' }); }, watchPosition: function () { return 1; }, clearWatch: function () {} }, configurable: true }); } catch (e) {}
      $('toast').textContent = '';
      $('weatherMyLocBtn1547').click();
      for (let wi = 0; wi < 40 && $('weatherInfo').textContent.indexOf('24°') < 0; wi++) await new Promise(function (r) { setTimeout(r, 25); });
      await waitWx47();
      check('1.5.47 clima: si se niega la ubicación se avisa con honestidad', $('toast').textContent.indexOf('No se pudo obtener tu ubicación') >= 0, 'toast=' + $('toast').textContent);
      check('1.5.47 clima: si se niega la ubicación se sigue mostrando la ciudad guardada', $('weatherInfo').textContent.indexOf('24°') >= 0, 'info=' + $('weatherInfo').textContent);
      click(q('[data-close="weatherOverlay"]'));
      check('1.5.47 clima: el detalle se cierra', !$('weatherOverlay').classList.contains('on'));
      // Sin internet y con clima guardado: muestra el último clima guardado.
      await waitWx47();
      calls.weatherFail = true;
      await window.__wordredTest.loadWeather();
      await waitWx47();
      check('v1.6 clima: sin internet muestra el último clima guardado', $('weatherInfo').textContent.indexOf('24°') >= 0 && $('weatherInfo').textContent.toLowerCase().indexOf('último') >= 0, 'info=' + $('weatherInfo').textContent);
      // Sin internet y sin clima guardado: "clima no disponible", sin romper
      // el inicio (la hora real sigue ahí).
      window.__wordredTest.getState().weather = null;
      window.__wordredTest.setWeatherCity(null);
      await window.__wordredTest.loadWeather();
      check('v1.6 clima: sin internet y sin guardado dice clima no disponible', $('weatherInfo').textContent.toLowerCase().indexOf('no disponible') >= 0, 'info=' + $('weatherInfo').textContent);
      check('v1.6 clima: sin internet la hora real sigue mostrándose', $('weatherTime').textContent.trim() === hhmm);
      calls.weatherFail = false;
    }
    // ---- v1.8 clima por horas y días con animaciones ----
    {
      const stW = window.__wordredTest.getState();
      window.__wordredTest.setWeatherCity({ name: 'Ciudad de México', lat: 19.43, lng: -99.13 });
      await window.__wordredTest.loadWeather();
      check('v1.8 clima: el pronóstico trae las próximas 24 horas y 7 días', !!stW.weather && stW.weather.hourly && stW.weather.hourly.length === 24 && stW.weather.daily && stW.weather.daily.length === 7, 'horas=' + (stW.weather && stW.weather.hourly && stW.weather.hourly.length) + ' días=' + (stW.weather && stW.weather.daily && stW.weather.daily.length));
      check('v1.8 clima: el símbolo animado es sol con despejado y lluvia con lluvia', window.__wordredTest.weatherAnimKind(0) === 'sol' && window.__wordredTest.weatherAnimKind(61) === 'lluvia' && window.__wordredTest.weatherAnimKind(3) === 'nublado' && window.__wordredTest.weatherAnimKind(71) === 'nieve' && window.__wordredTest.weatherAnimKind(95) === 'tormenta');
      check('v1.8 clima: la tarjeta muestra el símbolo animado del clima', !!$('weatherInfo').querySelector('.wSym'), 'info=' + $('weatherInfo').innerHTML.slice(0, 200));
      check('v1.8 clima: el reloj tiene los dos puntos parpadeando', !!$('weatherTime').querySelector('.clockColon'));
      click($('weatherCard'));
      check('v1.8 clima: al tocar la tarjeta se abre el detalle', $('weatherOverlay').classList.contains('on'));
      check('v1.8 clima: el detalle trae Por horas y Por días', $('weatherDetailBody').textContent.indexOf('Por horas') >= 0 && $('weatherDetailBody').textContent.indexOf('Por días') >= 0);
      check('v1.8 clima: el detalle muestra 24 horas', qa('#weatherDetailBody .wHour').length === 24, 'horas=' + qa('#weatherDetailBody .wHour').length);
      check('v1.8 clima: el detalle muestra 7 días', qa('#weatherDetailBody .wDay').length === 7, 'días=' + qa('#weatherDetailBody .wDay').length);
      check('v1.8 clima: cada hora trae símbolo, temperatura y lluvia', qa('#weatherDetailBody .wHour').every(function (h) { return !!h.querySelector('.wSym') && h.textContent.indexOf('°') >= 0 && h.textContent.indexOf('%') >= 0; }));
      click(q('[data-close="weatherOverlay"]'));
      check('v1.8 clima: el detalle se cierra', !$('weatherOverlay').classList.contains('on'));
    }
    // ---- v1.9 clima en BLANCO Y NEGRO ----
    // El símbolo animado es un SVG monocromo con currentColor (sin emoji
    // de color), en la tarjeta de inicio y en el detalle por horas y días.
    {
      const syms19 = [0, 1, 3, 45, 53, 61, 71, 95].map(function (c) { return window.__wordredTest.weatherAnimHtml(c); });
      check('v1.9 clima: el símbolo animado es un SVG monocromo', syms19.every(function (s) { return s.indexOf('<svg') >= 0 && s.indexOf('currentColor') >= 0; }), 'ej=' + syms19[0].slice(0, 140));
      check('v1.9 clima: el símbolo no tiene ningún emoji de color', syms19.every(function (s) { return ['☀️', '🌤️', '☁️', '🌫️', '🌦️', '🌧️', '❄️', '⛈️'].every(function (e) { return s.indexOf(e) < 0; }); }));
      check('v1.9 clima: el SVG no lleva colores (sin hex ni rgb)', syms19.every(function (s) { return !/#[0-9a-fA-F]{3,6}/.test(s) && s.indexOf('rgb(') < 0; }));
      check('v1.9 clima: la tarjeta muestra el símbolo SVG en blanco y negro', !!$('weatherInfo').querySelector('.wSym svg'), 'info=' + $('weatherInfo').innerHTML.slice(0, 200));
      const wSymCs19 = window.getComputedStyle($('weatherInfo').querySelector('.wSym'));
      check('v1.9 clima: el símbolo tiene filtro de escala de grises', (wSymCs19.filter || '').indexOf('grayscale') >= 0, 'filter=' + wSymCs19.filter);
      click($('weatherCard'));
      check('v1.9 clima: el detalle muestra el símbolo SVG en cada hora y cada día', qa('#weatherDetailBody .wHour .wSym svg').length === 24 && qa('#weatherDetailBody .wDay .wSym svg').length === 7, 'horas=' + qa('#weatherDetailBody .wHour .wSym svg').length + ' días=' + qa('#weatherDetailBody .wDay .wSym svg').length);
      check('v1.9 clima: el símbolo grande del detalle también es SVG monocromo', !!q('#weatherDetailBody .wNow .wSym.wBig svg'), 'ahora=' + (q('#weatherDetailBody .wNow') && q('#weatherDetailBody .wNow').innerHTML.slice(0, 120)));
      // v2.0: el símbolo del clima en su recuadro es más grande.
      const wSymCard = $('weatherInfo').querySelector('.wSym');
      check('v2.0 clima: el símbolo del clima en su recuadro es más grande', !!wSymCard && parseFloat(window.getComputedStyle(wSymCard).fontSize) >= 40, 'tamaño=' + (wSymCard && window.getComputedStyle(wSymCard).fontSize));
      // Al tocar el recuadro de la hora NO se abre el detalle del clima.
      click(q('[data-close="weatherOverlay"]'));
      click($('weatherTimeCard'));
      check('v2.0 clima: tocar el recuadro de la hora no abre el detalle', !$('weatherOverlay').classList.contains('on'));
      click(q('[data-close="weatherOverlay"]'));
    }
    // ---- v1.8 publicidad por tienda, con imagen y presionable ----
    // Cada bloque pertenece a una sola tienda, con su logo real; cada
    // tarjeta muestra la foto real del producto (o el logo de la tienda
    // como visual de marca) y se puede tocar para abrir la página real.
    {
      const stAds = window.__wordredTest.getState();
      stAds.hiddenAds = [];
      stAds.adsCache = null;
      for (let pi = 0; pi < 9; pi++) {
        stAds.posts.push({ id: 'adtest' + pi, author: stAds.me, text: 'Publicación de prueba ' + pi, createdAt: Date.now() - pi * 60000, privacy: 'public', likes: {}, comments: [], savedBy: [], shares: 0 });
      }
      calls.mlFail = false;
      await window.__wordredTest.fetchAds();
      check('v1.8 publicidad: los productos de Mercado Libre se guardan', !!stAds.adsCache && stAds.adsCache.items.length === 2, 'cache=' + JSON.stringify(stAds.adsCache));
      // fetchAds ya renderiza una vez (y rota el cursor); se reinicia para
      // que el render de la prueba muestre los anuncios en orden.
      window.__wordredTest.resetAdCursor();
      window.__wordredTest.renderFeed();
      const adBlocks = qa('.adBlock');
      check('v1.8 publicidad: hay bloques de anuncios entre publicaciones', adBlocks.length >= 2, 'bloques=' + adBlocks.length);
      check('v1.8 publicidad: cada bloque pertenece a una sola tienda', adBlocks.every(function (b) { return !!b.getAttribute('data-store') && b.querySelectorAll('.adBlockHead').length === 1; }), 'tiendas=' + adBlocks.map(function (b) { return b.getAttribute('data-store'); }).join(','));
      check('v1.8 publicidad: los bloques seguidos son de tiendas distintas', adBlocks.every(function (b, i) { return i === 0 || b.getAttribute('data-store') !== adBlocks[i - 1].getAttribute('data-store'); }));
      check('v1.8 publicidad: cada bloque muestra el logo real de su tienda', adBlocks.every(function (b) { var img = b.querySelector('.adBlockHead img.adLogo'); return !!img && img.getAttribute('src').indexOf('store-logos/') === 0; }), 'logos=' + adBlocks.map(function (b) { var i = b.querySelector('.adBlockHead img.adLogo'); return i && i.getAttribute('src'); }).join(','));
      const firstBlock = adBlocks[0];
      check('v1.8 publicidad: el bloque está entre dos publicaciones', firstBlock.previousElementSibling && firstBlock.previousElementSibling.classList.contains('post') && firstBlock.nextElementSibling && firstBlock.nextElementSibling.classList.contains('post'), 'prev=' + (firstBlock.previousElementSibling && firstBlock.previousElementSibling.className) + ' next=' + (firstBlock.nextElementSibling && firstBlock.nextElementSibling.className));
      const adCards = qa('.adCard');
      check('v1.8 publicidad: cada tarjeta lleva la marca Publicidad', adCards.every(function (a) { return a.textContent.indexOf('Publicidad') >= 0; }));
      const adCs = window.getComputedStyle(adCards[0]);
      check('v1.8 publicidad: la tarjeta tiene esquinas redondeadas', parseInt(adCs.borderRadius) >= 12, 'radius=' + adCs.borderRadius);
      check('v1.8 publicidad: cada tarjeta tiene imagen', adCards.every(function (a) { return !!a.querySelector('img'); }), 'sin imagen=' + adCards.filter(function (a) { return !a.querySelector('img'); }).length);
      const mlCard = adCards.filter(function (a) { return a.textContent.indexOf('Audífonos inalámbricos') >= 0; })[0];
      check('v1.8 publicidad: el producto real de Mercado Libre se muestra con su precio real', !!mlCard && mlCard.textContent.indexOf('299') >= 0, 'ml=' + (mlCard && mlCard.textContent));
      check('v1.8 publicidad: el producto muestra su foto real', !!mlCard && !!mlCard.querySelector('img') && mlCard.querySelector('img').src.indexOf('mlstatic.com') >= 0);
      // La tarjeta COMPLETA es presionable y abre la página real.
      calls.openExternalUrl = [];
      mlCard.click();
      check('v1.8 publicidad: al tocar la tarjeta abre la página real del producto', calls.openExternalUrl.some(function (u) { return u.indexOf('articulo.mercadolibre.com.mx/MLM-111') >= 0; }), 'urls=' + calls.openExternalUrl.join(','));
      const storeCard = adCards.filter(function (a) { return a.textContent.indexOf('Amazon') >= 0; })[0];
      check('v1.8 publicidad: la tarjeta de tienda enlaza a sus ofertas reales', !!storeCard && storeCard.textContent.indexOf('Ver ofertas') >= 0 && storeCard.textContent.indexOf('$') < 0, 'tienda=' + (storeCard && storeCard.textContent));
      check('v1.8 publicidad: la tarjeta de tienda muestra el logo de la tienda como imagen', !!storeCard && !!storeCard.querySelector('img.adBrandImg') && storeCard.querySelector('img.adBrandImg').getAttribute('src').indexOf('store-logos/amazon.png') >= 0);
      calls.openExternalUrl = [];
      storeCard.click();
      check('v1.8 publicidad: al tocar la tarjeta de tienda abre sus ofertas reales', calls.openExternalUrl.some(function (u) { return u.indexOf('amazon.com.mx/deals') >= 0; }), 'urls=' + calls.openExternalUrl.join(','));
      const adIds = adCards.map(function (a) { return a.getAttribute('data-ad'); });
      check('v1.8 publicidad: no se repite la misma tarjeta en un mismo inicio', new Set(adIds).size === adIds.length, 'ids=' + adIds.join(','));
      // Cerrar una publicidad: desaparece y no vuelve al re-renderizar.
      const hiddenId = mlCard.getAttribute('data-ad');
      mlCard.querySelector('.adClose').click();
      window.__wordredTest.renderFeed();
      check('v1.8 publicidad: al cerrar una publicidad no vuelve a aparecer', qa('.adCard').every(function (a) { return a.getAttribute('data-ad') !== hiddenId; }) && stAds.hiddenAds.indexOf(hiddenId) >= 0, 'ocultas=' + stAds.hiddenAds.join(','));
      // Sin Mercado Libre no hay tarjetas de producto inventadas, pero las
      // tarjetas de tienda (enlaces reales) siguen y el inicio no se rompe.
      stAds.adsCache = null;
      stAds.hiddenAds = [];
      calls.mlFail = true;
      await window.__wordredTest.fetchAds();
      window.__wordredTest.renderFeed();
      check('v1.8 publicidad: sin Mercado Libre no se inventa ningún producto', qa('.adCard').every(function (a) { return a.textContent.indexOf('Mercado Libre') < 0; }));
      check('v1.8 publicidad: sin Mercado Libre las tarjetas de tienda siguen', qa('.adCard').length >= 1);
      check('v1.8 publicidad: sin Mercado Libre no queda ningún bloque de Mercado Libre', qa('.adBlock').every(function (b) { return b.getAttribute('data-store') !== 'mercadolibre'; }));
      calls.mlFail = false;
    }
    // ---- v1.9 publicidad con imagen de producto en rectángulo más grande ----
    // La tarjeta de producto (Mercado Libre) es más grande: imagen de
    // 128 px y más relleno; sigue redondeada, con Publicidad, con el logo
    // de la tienda y presionable para abrir la página real.
    {
      const stA9 = window.__wordredTest.getState();
      stA9.hiddenAds = [];
      stA9.adsCache = null;
      for (let pi = 0; pi < 9; pi++) {
        stA9.posts.push({ id: 'adtest9' + pi, author: stA9.me, text: 'Publicación de prueba ' + pi, createdAt: Date.now() - pi * 60000, privacy: 'public', likes: {}, comments: [], savedBy: [], shares: 0 });
      }
      calls.mlFail = false;
      await window.__wordredTest.fetchAds();
      window.__wordredTest.resetAdCursor();
      window.__wordredTest.renderFeed();
      const mlCard9 = qa('.adCard').filter(function (a) { return a.textContent.indexOf('Audífonos inalámbricos') >= 0; })[0];
      const thumbCs9 = window.getComputedStyle(mlCard9.querySelector('img.adThumb'));
      check('v1.9 publicidad: la imagen del producto es más grande (128 px)', thumbCs9.width === '128px' && thumbCs9.height === '128px', 'thumb=' + thumbCs9.width + 'x' + thumbCs9.height);
      const cardCs9 = window.getComputedStyle(mlCard9);
      check('v1.9 publicidad: la tarjeta es un rectángulo más grande', parseInt(cardCs9.paddingTop) >= 20 && parseInt(cardCs9.paddingLeft) >= 20, 'padding=' + cardCs9.paddingTop + ' ' + cardCs9.paddingLeft);
      check('v1.9 publicidad: la tarjeta grande sigue con esquinas redondeadas', parseInt(cardCs9.borderRadius) >= 16, 'radius=' + cardCs9.borderRadius);
      check('v1.9 publicidad: la tarjeta grande sigue con la marca Publicidad y el logo de la tienda', mlCard9.textContent.indexOf('Publicidad') >= 0 && !!mlCard9.closest('.adBlock').querySelector('.adBlockHead img.adLogo'));
      const brandCard9 = qa('.adCard').filter(function (a) { return a.textContent.indexOf('Amazon') >= 0; })[0];
      const brandCs9 = window.getComputedStyle(brandCard9.querySelector('img.adBrandImg'));
      check('v1.9 publicidad: la imagen de marca de la tienda queda en su tamaño (72 px)', brandCs9.width === '72px' && brandCs9.height === '72px', 'marca=' + brandCs9.width + 'x' + brandCs9.height);
      calls.openExternalUrl = [];
      mlCard9.click();
      check('v1.9 publicidad: la tarjeta grande sigue abriendo la página real del producto', calls.openExternalUrl.some(function (u) { return u.indexOf('articulo.mercadolibre.com.mx/MLM-111') >= 0; }), 'urls=' + calls.openExternalUrl.join(','));
    }
    // ---- v1.8 ejemplos que desaparecen solos (1.5.33: 10 publicaciones reales) ----
    {
      const stE = window.__wordredTest.getState();
      stE.settings.examplesOverride = 'show';
      window.__wordredTest.renderFeed();
      check('v1.8 ejemplos: al principio los ejemplos están en el inicio', qa('#feed .demobadge').length >= 4, 'ejemplos=' + qa('#feed .demobadge').length);
      // 1.5.55: el video de ejemplo es horizontal, así que ya no sale en
      // la fila de arriba; las fotos de las cuentas de ejemplo se ven en
      // sus publicaciones del inicio (avatar propio de cada cuenta).
      check('v1.8 ejemplos: los perfiles de ejemplo tienen foto y portada propias', qa('#feed .post').filter(function (el) { return !!el.querySelector('.demobadge') && !!el.querySelector('img.avatar'); }).length >= 1, 'avatares=' + qa('#feed .post').filter(function (el) { return !!el.querySelector('.demobadge') && !!el.querySelector('img.avatar'); }).length);
      // Sin el interruptor forzado, con 10 publicaciones reales los
      // ejemplos se ocultan solos (regla 1.5.34; antes: más de 20 posts
      // reales de más de 20 personas distintas).
      stE.settings.examplesOverride = '';
      for (let ei = 0; ei < 10; ei++) {
        const au = '40000000' + String(10 + ei);
        if (!stE.profiles[au]) stE.profiles[au] = { phone: au, name: 'Persona ' + ei, bio: 'Bio', createdAt: Date.now() };
        window.__wordredTest.core.createPost(stE, au, { text: 'Post real de ejemplo ' + ei });
      }
      window.__wordredTest.renderFeed();
      check('v1.8 ejemplos: con 10 posts reales los ejemplos desaparecen', qa('#feed .demobadge').length === 0, 'ejemplos=' + qa('#feed .demobadge').length);
      // El interruptor los vuelve a mostrar y queda forzado para el
      // resto de la corrida (línea base 1.5.32).
      stE.settings.examplesOverride = 'show';
      window.__wordredTest.renderFeed();
      check('v1.8 ejemplos: el interruptor los vuelve a mostrar', qa('#feed .demobadge').length >= 4, 'ejemplos=' + qa('#feed .demobadge').length);
    }
    // 1.5.34: las pruebas usan a Ana (1000000001), Carlos (1000000002) y
    // Celia (1000000003) como personas de prueba; ya no son cuentas de
    // ejemplo, son perfiles de prueba creados aquí (sin isDemo), como los
    // 40000000xx de la sección v1.8. Sin ellos, crear anuncios o páginas
    // con esos teléfonos falla ("Primero crea tu perfil").
    (function () {
      var stT = window.__wordredTest.getState();
      [['1000000001', 'Ana Prueba'], ['1000000002', 'Carlos Prueba'], ['1000000003', 'Celia Prueba']].forEach(function (pp) {
        if (!stT.profiles[pp[0]]) stT.profiles[pp[0]] = { phone: pp[0], name: pp[1], bio: 'Perfil de prueba', photo: '', createdAt: Date.now() };
      });
    })();
    // ---- v1.6 número de contacto en ventas ----
    // El vendedor puede poner su número en el anuncio; quien lo ve tiene
    // "Llamar" (marca por la red) y "Mensaje" (WhatsApp o SMS). El botón
    // de WhatsApp de la v1.2 sigue ahí. Sin número, no hay botones.
    {
      const stM = window.__wordredTest.getState();
      const sellerM = '1000000002';
      const rM = window.__wordredTest.core.createListing(stM, sellerM, { title: 'Bici con contacto', price: 3500, category: 'Deportes', condition: 'Usado', contactPhone: '55 1234 5678', whatsapp: '5512345678' });
      check('v1.6 contacto: el anuncio guarda el número de contacto', rM.ok && rM.listing.contactPhone === '5512345678');
      window.__wrOpenListing(rM.listing.id);
      const det = $('listingDetail');
      check('v1.6 contacto: aparecen los botones Llamar y Mensaje', det.textContent.indexOf('Llamar') >= 0 && det.textContent.indexOf('Mensaje') >= 0, 'detalle=' + det.textContent.slice(0, 200));
      check('v1.6 contacto: el botón de WhatsApp sigue ahí', det.textContent.indexOf('WhatsApp') >= 0);
      calls.dialed = [];
      [...det.querySelectorAll('button')].filter(function (b) { return b.textContent.trim() === 'Llamar'; })[0].click();
      check('v1.6 contacto: Llamar marca el número del anuncio', calls.dialed.indexOf('5512345678') >= 0, 'marcados=' + calls.dialed.join(','));
      [...det.querySelectorAll('button')].filter(function (b) { return b.textContent.trim() === 'Mensaje'; })[0].click();
      check('v1.6 contacto: Mensaje abre el selector WhatsApp/SMS', $('msgChoiceOverlay').classList.contains('on'));
      calls.openExternalUrl = [];
      click($('msgChoiceWhatsapp'));
      check('v1.6 contacto: WhatsApp abre el chat con ese número', calls.openExternalUrl.some(function (u) { return u.indexOf('wa.me/5512345678') >= 0; }), 'urls=' + calls.openExternalUrl.join(','));
      [...det.querySelectorAll('button')].filter(function (b) { return b.textContent.trim() === 'Mensaje'; })[0].click();
      calls.openExternalUrl = [];
      click($('msgChoiceSms'));
      check('v1.6 contacto: SMS abre el mensaje con ese número', calls.openExternalUrl.some(function (u) { return u.indexOf('sms:5512345678') >= 0; }), 'urls=' + calls.openExternalUrl.join(','));
      const rM2 = window.__wordredTest.core.createListing(stM, sellerM, { title: 'Bici sin contacto', price: 100, category: 'Deportes', condition: 'Usado' });
      window.__wrOpenListing(rM2.listing.id);
      check('v1.6 contacto: sin número no aparecen Llamar ni Mensaje', $('listingDetail').textContent.indexOf('Llamar') < 0 && $('listingDetail').textContent.indexOf('Mensaje') < 0);
    }
    // ---- v1.6 compartir la app junto a buscar ----
    // Icono al lado de buscar: comparte el archivo de la app (APK) para
    // que otros la instalen, con un mensaje de invitación.
    {
      const shareBtn = $('hdrShareApp');
      // v1.5.14: el orden del encabezado es lupa → Mensajes → compartir → campana.
      check('v1.6 compartir app: el icono existe junto al de buscar (tras Mensajes)', !!shareBtn && shareBtn.previousElementSibling && shareBtn.previousElementSibling.id === 'hdrMessages' && shareBtn.previousElementSibling.previousElementSibling && shareBtn.previousElementSibling.previousElementSibling.id === 'hdrSearch', 'previo=' + (shareBtn && shareBtn.previousElementSibling && shareBtn.previousElementSibling.id));
      check('v1.6 compartir app: el icono es monocromo como los demás', !!shareBtn.querySelector('svg') && shareBtn.querySelector('svg').getAttribute('stroke') === 'currentColor');
      calls.appShared = 0;
      click(shareBtn);
      check('v1.6 compartir app: al tocarlo se comparte el archivo de la app', (calls.appShared || 0) >= 1, 'compartidos=' + (calls.appShared || 0));
      // Sin puente para el archivo: avisa que el archivo no estuvo
      // disponible y comparte al menos el mensaje de invitación.
      const realShare = window.AndroidBridge.shareAppApk;
      window.AndroidBridge.shareAppApk = undefined;
      const sharedBefore = calls.shared.length;
      const toastBefore = $('toast').textContent;
      click(shareBtn);
      check('v1.6 compartir app: sin archivo avisa que no estuvo disponible', $('toast').textContent !== toastBefore && $('toast').textContent.toLowerCase().indexOf('archivo') >= 0, 'toast=' + $('toast').textContent);
      check('v1.6 compartir app: sin archivo comparte al menos el mensaje', calls.shared.length > sharedBefore && calls.shared[calls.shared.length - 1].text.indexOf('WordRed') >= 0);
      window.AndroidBridge.shareAppApk = realShare;
    }
    // ---- v1.6 código QR en Ajustes ----
    // Mi QR (generado dentro de la app) con mi foto/nombre, y escaneo del
    // QR de otra persona para abrir su perfil y agregarla/seguirla.
    {
      window.__wrOpenSettings();
      check('v1.6 QR: Ajustes tiene el apartado Mi código QR', $('settingsOverlay').classList.contains('on') && $('myQrCode') && $('myQrCode').innerHTML.indexOf('svg') >= 0, 'qr=' + ($('myQrCode') && $('myQrCode').innerHTML.slice(0, 80)));
      check('v1.6 QR: debajo del código van mi foto y mi nombre', $('myQrName') && $('myQrName').textContent.indexOf('Ana') >= 0, 'nombre=' + ($('myQrName') && $('myQrName').textContent));
      const payload = window.__wordredTest.myQrPayload();
      check('v1.6 QR: el código codifica mi cuenta para que la app lo reconozca', payload.indexOf('wordred://perfil/5511111111') === 0, 'payload=' + payload);
      // Escanear un QR válido abre el perfil correspondiente.
      window.__wrHandleQr('wordred://perfil/1000000002?nombre=Carlos');
      check('v1.6 QR: escanear un QR válido abre el perfil de esa persona', $('profileOverlay').classList.contains('on') && $('profileDetail').textContent.indexOf('Carlos') >= 0, 'perfil=' + $('profileDetail').textContent.slice(0, 80));
      click(q('[data-close="profileOverlay"]'));
      // Un QR con datos incluidos funciona también sin internet: se crea
      // el perfil con los datos del QR.
      window.__wrHandleQr('wordred://perfil/5599990000?nombre=Luc%C3%ADa');
      check('v1.6 QR: un QR con nombre crea el perfil con los datos del QR', !!window.__wordredTest.getState().profiles['5599990000'] && window.__wordredTest.getState().profiles['5599990000'].name === 'Lucía' && $('profileDetail').textContent.indexOf('Lucía') >= 0, 'perfil=' + $('profileDetail').textContent.slice(0, 80));
      click(q('[data-close="profileOverlay"]'));
      // Un código que no es de WordRed no abre ningún perfil.
      const toastQr = $('toast').textContent;
      window.__wrHandleQr('https://example.com/hola');
      check('v1.6 QR: un código que no es de WordRed avisa y no abre perfil', $('toast').textContent !== toastQr && $('toast').textContent.toLowerCase().indexOf('no es de wordred') >= 0, 'toast=' + $('toast').textContent);
      // El botón de escanear abre la cámara (overlay con video).
      window.__wrOpenSettings();
      click($('scanQrBtn'));
      check('v1.6 QR: el botón de escanear abre la cámara', $('qrScanOverlay').classList.contains('on') && !!$('qrVideo'));
      click(q('[data-close="qrScanOverlay"]'));
      click(q('[data-close="settingsOverlay"]'));
    }
    // ---- v1.6 minijuegos en el perfil ----
    // 30–40 juegos originales; pantalla previa con favorito y récord;
    // partida a pantalla completa en horizontal con botón de regreso;
    // el récord se puede compartir en el perfil.
    {
      const G = window.WordRedGames;
      check('v1.6 minijuegos: hay entre 30 y 40 juegos', !!G && G.GAMES.length >= 30 && G.GAMES.length <= 40, 'n=' + (G && G.GAMES.length));
      click(q('#bottomNav button[data-nav="profile"]'));
      check('v1.6 minijuegos: el perfil tiene el apartado con todos los juegos', !!$('gamesSection') && qa('#gamesGrid .store-card').length === G.GAMES.length, 'tarjetas=' + qa('#gamesGrid .store-card').length);
      // Favorito y récord: se guardan y las recomendaciones los muestran.
      G.toggleFavorite('pong');
      G.saveBest('serpiente', 250);
      window.__wordredTest.renderGames();
      check('v1.6 minijuegos: los favoritos tienen su propia lista', qa('#gamesFavs .store-card').length >= 1 && $('gamesFavs').textContent.indexOf('Pong') >= 0, 'favs=' + $('gamesFavs').textContent);
      check('v1.6 minijuegos: las recomendaciones muestran el favorito y los más jugados', $('gamesRecs').textContent.indexOf('Pong') >= 0, 'recs=' + $('gamesRecs').textContent);
      // Pantalla previa: favorito, récord y botón de jugar.
      qa('#gamesGrid .store-card')[0].click();
      const preview = [...window.document.body.children].filter(function (el) { return el.style && el.style.zIndex === '9998'; })[0];
      check('v1.6 minijuegos: cada juego tiene pantalla previa con favorito y récord', !!preview && preview.textContent.indexOf('Mejor puntuación') >= 0 && preview.textContent.toLowerCase().indexOf('favorito') >= 0 && preview.textContent.indexOf('Jugar') >= 0, 'previa=' + (preview && preview.textContent.slice(0, 120)));
      // Partida a pantalla completa en horizontal con botón de regreso.
      [...preview.querySelectorAll('button')].filter(function (b) { return b.textContent.indexOf('Jugar') >= 0; })[0].click();
      const gameOv = [...window.document.body.children].filter(function (el) { return el.style && el.style.zIndex === '9999'; })[0];
      check('v1.6 minijuegos: la partida se abre a pantalla completa', !!gameOv && window.getComputedStyle(gameOv).position === 'fixed', 'pos=' + (gameOv && window.getComputedStyle(gameOv).position));
      check('v1.6 minijuegos: la partida tiene botón visible para regresar al perfil', !!gameOv && gameOv.textContent.indexOf('Volver al perfil') >= 0);
      [...gameOv.querySelectorAll('button')].filter(function (b) { return b.textContent.indexOf('Volver al perfil') >= 0; })[0].click();
      check('v1.6 minijuegos: el botón de regreso cierra la partida y vuelve al perfil', ![...window.document.body.children].some(function (el) { return el.style && el.style.zIndex === '9999'; }) && $('view-profile').classList.contains('on'));
      // El récord se puede compartir en el perfil.
      const postsBefore = window.__wordredTest.getState().posts.length;
      window.__wordredTest.publishGameRecord({ id: 'serpiente', name: 'Serpiente clásica' }, 250);
      const recPost = window.__wordredTest.getState().posts.filter(function (p) { return p.author === window.__wordredTest.getState().me && p.text.indexOf('Serpiente clásica') >= 0 && p.text.indexOf('250') >= 0; })[0];
      check('v1.6 minijuegos: el récord se publica en el perfil', window.__wordredTest.getState().posts.length === postsBefore + 1 && !!recPost, 'post=' + (recPost && recPost.text));
    }
    // ---- v1.8 tienda de juegos: lanzador, buscador, categorías, orden,
    // instalar en el escritorio, calificar y juegos de Play Store ----
    {
      const G = window.WordRedGames;
      const T8 = window.__wordredTest;
      click(q('#bottomNav button[data-nav="profile"]'));
      T8.renderGames();
      // Recuadros estilo lanzador: redondeados, logo grande, sin texto
      // dentro y nombre abajo.
      const tiles = qa('#gamesGrid .game-tile');
      check('v1.8 tienda: cada juego tiene su recuadro estilo lanzador', tiles.length === G.GAMES.length, 'recs=' + tiles.length);
      check('v1.8 tienda: el recuadro tiene las esquinas bien redondeadas', tiles.every(function (t) { return parseInt(window.getComputedStyle(t).borderRadius) >= 20; }), 'radius=' + (tiles[0] && window.getComputedStyle(tiles[0]).borderRadius));
      check('v1.8 tienda: el logo dentro del recuadro es grande', tiles.every(function (t) { var lg = t.querySelector('.game-tile-logo'); return !!lg && parseInt(window.getComputedStyle(lg).fontSize) >= 40; }));
      check('v1.8 tienda: dentro del recuadro no hay texto (solo el logo)', tiles.every(function (t) { return t.children.length === 1 && t.children[0].classList.contains('game-tile-logo'); }), 'hijos=' + tiles.slice(0, 3).map(function (t) { return t.children.length; }).join(','));
      check('v1.8 tienda: el nombre del juego va abajo del recuadro', qa('#gamesGrid .store-card').every(function (c) { var tile = c.querySelector('.game-tile'); var name = c.querySelector('.store-card-name'); return !!tile && !!name && name.textContent.trim().length > 0 && (tile.compareDocumentPosition(name) & window.document.DOCUMENT_POSITION_FOLLOWING) !== 0; }));
      check('v1.8 tienda: los recuadros tienen animación al aparecer', /@keyframes gameTileIn/.test(fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8')) && tiles.some(function (t) { return t.style.animationDelay !== ''; }));
      // Tienda: icono, nombre, estrellas, jugadores e Instalar.
      const cards = qa('#gamesGrid .store-card');
      check('v1.8 tienda: cada juego muestra estrellas, jugadores e Instalar', cards.every(function (c) { return !!c.querySelector('.game-stars-none, .game-stars') && !!c.querySelector('.store-card-players') && !!c.querySelector('[data-install-game]'); }));
      // Buscador: filtra en vivo y avisa si no hay resultados.
      setVal($('gameSearch'), 'pong');
      check('v1.8 tienda: el buscador filtra por nombre en vivo', qa('#gamesGrid .store-card').length >= 1 && qa('#gamesGrid .store-card').every(function (c) { return c.textContent.toLowerCase().indexOf('pong') >= 0; }), 'n=' + qa('#gamesGrid .store-card').length);
      setVal($('gameSearch'), 'zzzznada');
      check('v1.8 tienda: sin resultados lo dice claro', !$('gamesEmpty').classList.contains('hidden') && $('gamesEmpty').textContent.indexOf('No hay juegos') >= 0, 'vacio=' + $('gamesEmpty').textContent);
      setVal($('gameSearch'), '');
      // Categorías y orden.
      const puzzleChip = [...qa('#gameCats .chip')].filter(function (c) { return c.textContent.trim() === 'Puzzle'; })[0];
      puzzleChip.click();
      check('v1.8 tienda: la categoría filtra los juegos', qa('#gamesGrid .store-card').length >= 1 && qa('#gamesGrid .store-card').length < G.GAMES.length, 'n=' + qa('#gamesGrid .store-card').length);
      const todosChip = [...qa('#gameCats .chip')].filter(function (c) { return c.textContent.trim() === 'Todos'; })[0];
      todosChip.click();
      $('gameSort').value = 'name';
      $('gameSort').dispatchEvent(new window.Event('change', { bubbles: true }));
      const names = qa('#gamesGrid .store-card-name').map(function (n) { return n.textContent.trim(); });
      const sorted = names.slice().sort(function (a, b) { return a.localeCompare(b, 'es'); });
      check('v1.8 tienda: ordenar por nombre A–Z ordena la parrilla', names.join('|') === sorted.join('|'), 'nombres=' + names.slice(0, 4).join(','));
      check('v1.8 tienda: hay juegos destacados', qa('#gamesFeatured .store-card').length === 4, 'dest=' + qa('#gamesFeatured .store-card').length);
      // Instalar en el escritorio: acceso directo anclado con el icono.
      // jsdom no tiene canvas 2d: se simula para el icono del acceso directo.
      var origGetCtx = window.HTMLCanvasElement.prototype.getContext;
      var origToDataURL = window.HTMLCanvasElement.prototype.toDataURL;
      window.HTMLCanvasElement.prototype.getContext = function () { return { fillStyle: '', fillRect: function () {}, fillText: function () {}, font: '', textAlign: '', textBaseline: '' }; };
      window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=='; };
      calls.pinShortcut = []; calls.pinRemoved = []; calls.launchGame = '';
      const serpCard = qa('#gamesGrid .store-card').filter(function (c) { return c.getAttribute('data-game') === 'serpiente'; })[0];
      serpCard.querySelector('[data-install-game]').click();
      check('v1.8 tienda: Instalar pide el acceso directo con el icono del juego', calls.pinShortcut.length === 1 && calls.pinShortcut[0].id === 'serpiente' && calls.pinShortcut[0].name.indexOf('Serpiente') >= 0 && calls.pinShortcut[0].icon.indexOf('iVBORw0KGgo') === 0, JSON.stringify(calls.pinShortcut));
      window.__onGameShortcutPinned('serpiente');
      check('v1.8 tienda: al confirmar, el juego queda Instalado con Abrir y Quitar', T8.getState().installedGames.indexOf('serpiente') >= 0 && !!qa('#gamesGrid .store-card').filter(function (c) { return c.getAttribute('data-game') === 'serpiente'; })[0].querySelector('[data-open-installed]') && !!qa('#gamesGrid .store-card').filter(function (c) { return c.getAttribute('data-game') === 'serpiente'; })[0].querySelector('[data-remove-installed]'));
      qa('#gamesGrid .store-card').filter(function (c) { return c.getAttribute('data-game') === 'serpiente'; })[0].querySelector('[data-remove-installed]').click();
      check('v1.8 tienda: Quitar del escritorio quita el acceso directo', calls.pinRemoved.indexOf('serpiente') >= 0 && T8.getState().installedGames.indexOf('serpiente') < 0, 'quitados=' + calls.pinRemoved.join(','));
      window.HTMLCanvasElement.prototype.getContext = origGetCtx;
      if (origToDataURL) window.HTMLCanvasElement.prototype.toDataURL = origToDataURL; else delete window.HTMLCanvasElement.prototype.toDataURL;
      // Calificar: las estrellas actualizan el promedio visible.
      const rateCard = qa('#gamesGrid .store-card').filter(function (c) { return c.getAttribute('data-game') === 'serpiente'; })[0];
      rateCard.querySelector('[data-rate-game]').click();
      check('v1.8 tienda: Calificar abre la ventana de estrellas', $('rateGameOverlay').classList.contains('on') && $('rateGameTitle').textContent.indexOf('Serpiente') >= 0);
      [...$('rateGameStars').querySelectorAll('.rate-star')][2].click();
      click($('rateGameSave'));
      check('v1.8 tienda: calificar con 3 estrellas muestra el promedio 3.0', (qa('#gamesGrid .store-card').filter(function (c) { return c.getAttribute('data-game') === 'serpiente'; })[0] || { textContent: '' }).textContent.indexOf('3.0') >= 0, 'tarjeta=' + (qa('#gamesGrid .store-card').filter(function (c) { return c.getAttribute('data-game') === 'serpiente'; })[0] || {}).textContent);
      // Juegos de Play Store: datos reales, capturas y botón real.
      const psCards = qa('#psGamesList .ps-card');
      check('v1.8 tienda: hay 12 juegos reales de Play Store', psCards.length === 12, 'n=' + psCards.length);
      check('v1.8 tienda: cada juego de Play Store tiene icono, nombre, calificación y descargas reales', psCards.every(function (c) { return !!c.querySelector('img.ps-icon') && !!c.querySelector('.ps-name') && c.textContent.indexOf('★') >= 0 && c.textContent.indexOf('descargas') >= 0 && c.textContent.indexOf('opiniones') >= 0; }));
      check('v1.8 tienda: cada juego de Play Store tiene descripción y 4 capturas reales', psCards.every(function (c) { return !!c.querySelector('.ps-desc') && c.querySelector('.ps-desc').textContent.trim().length > 50 && c.querySelectorAll('.ps-shot').length === 4; }));
      check('v2.1 tienda: cada juego de Play Store dice claro dónde se juega (aquí o en Play Store)', psCards.every(function (c) { return c.textContent.indexOf('Se juega aquí') >= 0 || c.textContent.indexOf('Se juega en Play Store') >= 0; }));
      const roblox = psCards.filter(function (c) { return c.getAttribute('data-ps') === 'com.roblox.client'; })[0];
      check('v1.8 tienda: Roblox tiene sus datos reales (4.2, 1,000 M+ descargas)', !!roblox && roblox.textContent.indexOf('4.2') >= 0 && roblox.textContent.indexOf('1,000 M+ descargas') >= 0, 'roblox=' + (roblox && roblox.textContent.slice(0, 200)));
      calls.openInAppWeb = [];
      calls.openExternalUrl = [];
      roblox.querySelector('[data-ps-open]').click();
      check('v2.1 tienda: Probar un juego sin demo abre su página de Play Store DENTRO de la app (sin salir)', calls.openInAppWeb.some(function (o) { return o.url.indexOf('play.google.com/store/apps/details?id=com.roblox.client') >= 0; }) && calls.openExternalUrl.length === 0, 'inApp=' + JSON.stringify(calls.openInAppWeb) + ' ext=' + calls.openExternalUrl.join(','));
      // Calificar un juego de Play Store en WordRed.
      roblox.querySelector('[data-rate-ps]').click();
      [...$('rateGameStars').querySelectorAll('.rate-star')][4].click();
      click($('rateGameSave'));
      check('v1.8 tienda: calificar un juego de Play Store muestra su promedio en WordRed', (psCards.filter(function (c) { return c.getAttribute('data-ps') === 'com.roblox.client'; })[0] || { textContent: '' }).textContent.indexOf('5.0') >= 0 || (qa('#psGamesList .ps-card').filter(function (c) { return c.getAttribute('data-ps') === 'com.roblox.client'; })[0] || { textContent: '' }).textContent.indexOf('5.0') >= 0, 'roblox=' + (qa('#psGamesList .ps-card').filter(function (c) { return c.getAttribute('data-ps') === 'com.roblox.client'; })[0] || {}).textContent);
    }
    // ---- v1.6 lugares recomendados ----
    // Recomendaciones de lugares mezcladas entre las publicaciones: nombre,
    // tipo, dirección, foto, quién recomienda, comentario y calificación,
    // con enlace real al mapa. Se crean desde el perfil o compartiendo
    // desde otra app (por ejemplo, desde Mapas).
    {
      const stL = window.__wordredTest.getState();
      const rL = window.__wordredTest.core.createPlacePost(stL, stL.me, { name: 'Taquería El Faro', type: 'Comida', address: 'Av. Siempre Viva 123, CDMX', url: 'https://maps.app.goo.gl/abc123', rating: 5, comment: 'Los mejores tacos al pastor.' });
      check('v1.6 lugares: la recomendación se guarda', rL.ok && !!rL.post.place);
      window.__wordredTest.renderFeed();
      const placeCards = qa('.placeCard');
      check('v1.6 lugares: la recomendación se mezcla entre las publicaciones', placeCards.length >= 1 && placeCards[0].closest('article.post'), 'tarjetas=' + placeCards.length);
      check('v1.6 lugares: la tarjeta muestra nombre, tipo, dirección y calificación', placeCards[0].textContent.indexOf('Taquería El Faro') >= 0 && placeCards[0].textContent.indexOf('Comida') >= 0 && placeCards[0].textContent.indexOf('Av. Siempre Viva 123') >= 0 && placeCards[0].textContent.indexOf('5') >= 0, 'tarjeta=' + placeCards[0].textContent.slice(0, 160));
      calls.openExternalUrl = [];
      placeCards[0].querySelector('.placeMapLink').click();
      check('v1.6 lugares: la tarjeta enlaza a su ubicación real en el mapa', calls.openExternalUrl.some(function (u) { return u.indexOf('maps.app.goo.gl/abc123') >= 0; }), 'urls=' + calls.openExternalUrl.join(','));
      // Crear desde el perfil con el formulario.
      click(q('#bottomNav button[data-nav="profile"]'));
      const recBtn = [...window.document.querySelectorAll('#ownProfile button, #gamesSection button')].filter(function (b) { return (b.getAttribute('aria-label') || '').indexOf('Recomendar un lugar') >= 0 || b.textContent.indexOf('Recomendar un lugar') >= 0; })[0];
      check('v1.6 lugares: el perfil tiene la opción Recomendar un lugar (1.5.30: solo con símbolo, en la fila superior)', !!recBtn);
      recBtn.click();
      check('v1.6 lugares: el formulario de lugar se abre desde el perfil', $('placeFormOverlay').classList.contains('on'));
      setVal($('placeName'), 'Café La Esquina');
      $('placeType').value = 'Comida';
      setVal($('placeAddress'), 'Calle 5 #10');
      setVal($('placeComment'), 'Buen café y pan dulce.');
      $('placeRating').value = '4';
      click($('placePublish'));
      const myPlace = stL.posts.filter(function (p) { return p.place && p.place.name === 'Café La Esquina'; })[0];
      check('v1.6 lugares: el formulario publica la recomendación', !!myPlace && myPlace.place.rating === 4 && myPlace.place.address === 'Calle 5 #10');
      // Compartir desde otra app (por ejemplo, desde Mapas) abre el
      // compositor de lugar con los datos que venían.
      window.__onSharedContent({ type: 'text', text: 'Taquería El Faro https://maps.app.goo.gl/xyz789' });
      check('v1.6 lugares: compartir desde otra app abre el compositor de lugar', $('placeFormOverlay').classList.contains('on'), 'overlay=' + $('placeFormOverlay').className);
      check('v1.6 lugares: el enlace real del lugar viene rellenado', $('placeUrl').value.indexOf('maps.app.goo.gl/xyz789') >= 0, 'url=' + $('placeUrl').value);
      click(q('[data-close="placeFormOverlay"]'));
    }
    // publicar
    click($('composerOpen'));
    setVal($('postText'), 'Mi primera publicación desde jsdom #WordRed');
    click($('postPublish'));
    check('la publicación nueva aparece arriba del feed', (() => {
      const first = q('#feed .post .text');
      return first && first.textContent.indexOf('Mi primera publicación') === 0;
    })());
    // reacción
    const postId = q('#feed .post').getAttribute('data-post');
    window.__wrLike(postId);
    check('la reacción se registra en la pantalla', q('#feed .post .actions .like-btn .cnt').textContent === '1');
    window.__wrToggleReactions(postId);
    check('el selector de reacciones se abre', $('rx-' + postId).style.display !== 'none');
    window.__wrReact(postId, 'Me encanta');
    check('cambiar a "Me encanta" se refleja', q('#feed .post .actions .like-btn .cnt').textContent === '1' && q('#feed .post .actions').textContent.indexOf('Me encanta') >= 0);
    // comentario + respuesta
    window.__wrOpenPost(postId);
    setVal($('commentInput'), '¡Felicidades por la primera publicación!');
    await window.__wrAddComment(); await tick();
    check('el comentario aparece en el detalle', $('postDetail').textContent.indexOf('¡Felicidades') >= 0);
    const cmtId = window.__wordredTest.getState().posts[0].comments[0].id;
    window.__wrReplyTo(cmtId);
    const replyInput = q('#reply-' + cmtId + ' input');
    setVal(replyInput, '¡Gracias por comentar!');
    window.__wrAddReply(cmtId);
    check('la respuesta queda anidada', $('postDetail').textContent.indexOf('¡Gracias por comentar!') >= 0);
    click(q('[data-close="postOverlay"]'));
    // amigos (v1.5.14: se entra desde el Perfil, antes de Ajustes)
    window.__wordredTest.go('profile');
    click(q('#ownProfile button[aria-label="Seguidores"]'));
    click(q('#friendsTabs button[data-tab="suggest"]'));
    const addBtn = q('#friendsContent .btn.small');
    check('hay sugerencias con botón de agregar', !!addBtn);
    if (addBtn) addBtn.click();
    check('la solicitud queda registrada', window.__wordredTest.getState().requests.length === 1);
    click(q('#friendsTabs button[data-tab="requests"]'));
    check('la solicitud enviada se ve en Solicitudes', $('friendsContent').textContent.indexOf('Pendiente') >= 0 || $('friendsContent').textContent.indexOf('solicitud enviada') >= 0);
    // grupos
    click(q('#bottomNav button[data-nav="groups"]'));
    click(q('#groupsTabs button[data-tab="discover"]'));
    check('la lista de grupos trae el grupo de ejemplo', $('groupsContent').textContent.indexOf('Cocina casera') >= 0);
    window.__wrOpenGroup(window.__wordredTest.getState().groups[0].id);
    check('el detalle del grupo muestra miembros y publicaciones', $('groupDetail').textContent.indexOf('Miembros') >= 0 && $('groupDetail').textContent.indexOf('salsa verde') >= 0);
    click(q('[data-close="groupOverlay"]'));
    // mensajes
    window.__wrOpenChat('1000000001');
    setVal($('chatText'), 'Hola Ana, soy yo desde jsdom.');
    click($('chatSend'));
    check('el mensaje se envía y se ve en el chat', $('chatMsgs').textContent.indexOf('Hola Ana, soy yo') >= 0);
    click(q('[data-close="chatOverlay"]'));
    click($('hdrMessages'));
    check('la conversación aparece en Mensajes', $('convoList').textContent.indexOf('Ana Prueba') >= 0);
    // notificaciones (v1.5.14: se entra por la campana del encabezado, ya no hay botón en la barra)
    click($('hdrBell'));
    check('hay notificaciones (la solicitud y el mensaje avisaron)', $('notifList').textContent.length > 20);
    // perfil propio
    click(q('#bottomNav button[data-nav="profile"]'));
    check('el perfil propio muestra nombre y publicaciones', $('ownProfile').textContent.indexOf('Ana DOM') >= 0);
    // búsqueda
    click($('hdrSearch'));
    setVal($('searchInput'), 'tacos');
    check('la búsqueda encuentra la publicación de ejemplo', $('searchResults').textContent.indexOf('tacos al pastor') >= 0);
    setVal($('searchInput'), '#motivacion');
    check('la búsqueda por #etiqueta funciona', $('searchResults').textContent.indexOf('frase del día') >= 0);
    // ajustes (v1.3: sin ninguna UI del servidor)
    window.__wrOpenSettings();
    check('v1.3 ajustes: no hay ninguna UI del servidor', !$('settingsServer') && !$('serverStatus') && !$('serverLinkOverlay') && !/servidor/i.test($('settingsOverlay').textContent));
    click(q('[data-close="settingsOverlay"]'));
    // historias: crear y ver
    window.__wrOpenStoryCreate();
    setVal($('storyText'), 'Mi historia de prueba');
    click($('storyPublish'));
    check('la historia se publica', window.__wordredTest.getState().stories.length >= 1);
    // ---- v1.1: barra inferior monocroma (v1.5.14: 6 secciones, lanzador al centro, sin Teléfono, sin Avisos, Amigos ni Mensajes) ----
    const navBtns = qa('#bottomNav button');
    check('v1.1 barra: 5 secciones con iconos SVG', navBtns.length === 5 && navBtns.every(b => b.querySelector('svg')));
    check('v1.5.14 barra: el lanzador está al centro y sin Teléfono, sin Avisos, Amigos, Mensajes ni Mercado', navBtns[2].id === 'navLauncherBtn' && navBtns.some(b => b.textContent.indexOf('Shorts') >= 0) && !navBtns.some(b => b.textContent.indexOf('Teléfono') >= 0) && !navBtns.some(b => b.textContent.indexOf('Avisos') >= 0) && !navBtns.some(b => b.textContent.indexOf('Amigos') >= 0) && !navBtns.some(b => b.textContent.indexOf('Mensajes') >= 0) && !navBtns.some(b => b.textContent.indexOf('Mercado') >= 0));
    check('v1.1 barra: sin emoji en los botones', navBtns.every(b => !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(b.textContent)));
    check('v1.1 barra: iconos monocromos (currentColor, sin rellenos de color)', navBtns.every(b => { const s = b.querySelector('svg'); return s && s.getAttribute('stroke') === 'currentColor' && s.getAttribute('fill') === 'none'; }));
    // ---- v1.1: publicar de todo — enlace ----
    click($('composerOpen'));
    check('v1.1 compositor: ofrece foto, video, enlace y encuesta', !!($('postAddPhoto') && $('postAddCamera') && $('postAddLink') && $('postAddPoll') && $('postMediaInput')));
    click($('postAddLink'));
    check('v1.1 compositor: el enlace muestra su campo', !$('postLinkRow').classList.contains('hidden'));
    setVal($('postLinkUrl'), 'ejemplo.com');
    click($('postLinkAdd'));
    await waitFor(() => $('postLinkPrev').textContent.indexOf('ejemplo.com') >= 0);
    check('v1.1 enlace: la vista previa muestra el host', $('postLinkPrev').textContent.indexOf('ejemplo.com') >= 0);
    setVal($('postText'), 'Miren esta página');
    click($('postPublish'));
    check('v1.1 enlace: la publicación con enlace aparece en el feed', !!(q('#feed .linkcard') && q('#feed .linkcard').textContent.indexOf('ejemplo.com') >= 0));
    click(q('#feed .linkcard'));
    check('v1.1 enlace: tocar la tarjeta abre el enlace', calls.openExternalUrl.some(u => u.indexOf('ejemplo.com') >= 0), JSON.stringify(calls.openExternalUrl));
    // ---- v1.1: publicar de todo — encuesta ----
    click($('composerOpen'));
    click($('postAddPoll'));
    check('v1.1 compositor: la encuesta muestra su formulario', !$('postPollBox').classList.contains('hidden'));
    setVal($('pollQuestion'), '¿Qué prefieren?');
    const pollInputs = qa('#pollOptions input');
    setVal(pollInputs[0], 'Tacos');
    setVal(pollInputs[1], 'Pizza');
    click($('postPublish'));
    const pollPostId = q('#feed .post').getAttribute('data-post');
    check('v1.1 encuesta: la publicación con encuesta aparece', q('#feed .post').textContent.indexOf('¿Qué prefieren?') >= 0);
    const pollOptId = window.__wordredTest.getState().posts[0].poll.options[0].id;
    window.__wrVotePoll(pollPostId, pollOptId);
    check('v1.1 encuesta: votar muestra el resultado', q('#feed .post').textContent.indexOf('1 voto') >= 0);
    // ---- v1.1: publicar de todo — foto (por lógica + render) ----
    window.__wordredTest.core.createPost(window.__wordredTest.getState(), '5511111111', { text: 'Foto de prueba', media: 'data:image/jpeg;base64,/9j/4AAQ', mediaType: 'image' });
    window.__wordredTest.go('feed');
    check('v1.1 foto: la publicación con foto muestra la imagen', !!q('#feed .post img'));
    // ---- v1.1: publicar de todo — video GRANDE sin límite (55 MB) ----
    const bigBuf = new Uint8Array(55 * 1024 * 1024); // más que el viejo tope de 50 MB
    const bigFile = new window.File([bigBuf], 'video-grande.mp4', { type: 'video/mp4' });
    click($('composerOpen'));
    const mediaInput = $('postMediaInput');
    Object.defineProperty(mediaInput, 'files', { value: [bigFile], configurable: true });
    mediaInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    const uploaded = await waitFor(() => $('postMediaPrev').querySelector('video'), 15000);
    check('v1.1 sin límite: un video de 55 MB se guarda sin rechazo', uploaded, 'preview: ' + $('postMediaPrev').innerHTML.slice(0, 120));
    const chunkCount = Object.values(calls.uploads).reduce((n, u) => n + u.chunks.length, 0);
    check('v1.1 sin límite: el video viajó por partes (55 trozos de 1 MB)', chunkCount === 55, 'trozos: ' + chunkCount);
    check('v1.1 sin límite: ningún aviso de tamaño apareció', !calls.toast.some(t => /50 MB|demasiado grande|muy grande/i.test(t)));
    setVal($('postText'), 'Mi video grande');
    click($('postPublish'));
    // v1.4: la publicación sube el video al servidor antes de aparecer
    const videoPosted = await waitFor(() => q('#feed .post video'), 15000);
    check('v1.1 video: la publicación con video aparece en el feed', videoPosted);
    // ---- v1.1: Marketplace (v1.5.16: ya no hay botón en la barra; se entra desde arriba) ----
    click($('feedMarketBtn'));
    check('v1.1 mercado: la vista se abre desde arriba', !$('view-marketplace').classList.contains('hidden'));
    click($('listingCreateBtn'));
    setVal($('listingTitle'), 'Bicicleta de montaña');
    setVal($('listingPrice'), '3500');
    setVal($('listingCity'), 'CDMX');
    setVal($('listingDesc'), 'Poco uso, como nueva.');
    click($('listingPublish'));
    check('v1.1 mercado: el anuncio aparece con precio en MXN', $('marketGrid').textContent.indexOf('Bicicleta de montaña') >= 0 && $('marketGrid').textContent.indexOf('$3,500') >= 0);
    setVal($('marketSearch'), 'bicicleta');
    check('v1.1 mercado: el buscador encuentra el anuncio', $('marketGrid').textContent.indexOf('Bicicleta de montaña') >= 0);
    setVal($('marketSearch'), 'silla');
    check('v1.1 mercado: el buscador filtra lo que no coincide', $('marketGrid').textContent.indexOf('Bicicleta de montaña') < 0);
    setVal($('marketSearch'), '');
    const demoListing = window.__wordredTest.core.createListing(window.__wordredTest.getState(), '1000000001', { title: 'Silla gamer', price: 1200, category: 'Hogar', condition: 'Nuevo', city: 'Guadalajara' }).listing;
    window.__wordredTest.go('marketplace');
    window.__wrOpenListing(demoListing.id);
    check('v1.1 mercado: el detalle muestra precio, vendedor y Contactar', $('listingDetail').textContent.indexOf('$1,200') >= 0 && $('listingDetail').textContent.indexOf('Contactar al vendedor') >= 0);
    Array.from(qa('#listingDetail button')).find(b => b.textContent.indexOf('Contactar') >= 0).click();
    await sleep(250);
    check('v1.1 mercado: Contactar abre el chat con el vendedor', !$('chatOverlay').classList.contains('hidden') && $('chatText').value.indexOf('Silla gamer') >= 0);
    click(q('[data-close="chatOverlay"]'));
    const myListing = window.__wordredTest.getState().listings.filter(l => l.seller === '5511111111')[0];
    window.__wrOpenListing(myListing.id);
    window.__wrToggleSold(myListing.id);
    check('v1.1 mercado: marcar vendido funciona', $('listingDetail').textContent.indexOf('Vendido') >= 0);
    click(q('[data-close="listingOverlay"]'));
    // ---- v1.1: personalización de perfil ----
    click(q('#bottomNav button[data-nav="profile"]'));
    window.__wrEditProfile();
    setVal($('editJob'), 'Diseñadora');
    setVal($('editCity'), 'CDMX');
    click(q('#editFrameRow [data-frame="dorado"]'));
    click(q('#editAccentRow [data-accent="azul"]'));
    click($('editProfileSave'));
    check('v1.1 perfil: trabajo, ciudad, marco y tema se guardan y se ven', $('ownProfile').textContent.indexOf('Diseñadora') >= 0 && $('ownProfile').textContent.indexOf('CDMX') >= 0 && !!q('#ownProfile .avatar.frame-dorado') && ($('ownProfile').querySelector('.cover').getAttribute('style') || '').indexOf('#3ea6ff') >= 0);
    const myPostId = window.__wordredTest.getState().posts.filter(p => p.author === '5511111111')[0].id;
    window.__wrTogglePin(myPostId);
    check('v1.1 perfil: fijar una publicación la pone en Destacadas', $('ownProfile').textContent.indexOf('Destacadas') >= 0);
    // ---- v1.1: eventos ----
    window.__wordredTest.go('events');
    check('v1.1 eventos: la vista se abre', !$('view-events').classList.contains('hidden'));
    click($('eventCreateBtn'));
    setVal($('eventName'), 'Fiesta de prueba');
    setVal($('eventDate'), '2026-12-20');
    setVal($('eventTime'), '20:00');
    setVal($('eventPlace'), 'Mi casa');
    click($('eventCreateSave'));
    check('v1.1 eventos: el evento se crea y se lista', $('eventsList').textContent.indexOf('Fiesta de prueba') >= 0);
    const evId = window.__wordredTest.getState().events[0].id;
    window.__wrRsvp(evId, 'asiste');
    check('v1.1 eventos: asistir se registra', $('eventsList').textContent.indexOf('Asistiré') >= 0);
    // ---- v1.1: páginas ----
    window.__wordredTest.go('pages');
    click($('pageCreateBtn'));
    setVal($('pageName'), 'Cocina de Ana');
    setVal($('pageDesc'), 'Recetas caseras');
    click($('pageCreateSave'));
    const pageId = window.__wordredTest.getState().pages[0].id;
    check('v1.1 páginas: la página se crea', $('pagesList').textContent.indexOf('Cocina de Ana') >= 0);
    window.__wrPostAsPage(pageId);
    setVal($('postText'), 'Receta del día: tacos al pastor');
    click($('postPublish'));
    window.__wordredTest.go('feed');
    check('v1.1 páginas: la publicación de la página sale en el feed', q('#feed .post').textContent.indexOf('Receta del día') >= 0);
    const demoPage = window.__wordredTest.core.createPage(window.__wordredTest.getState(), '1000000001', { name: 'Música Total', category: 'Música' }).page;
    window.__wrFollowPage(demoPage.id);
    check('v1.1 páginas: seguir una página funciona', window.__wordredTest.getState().pages.filter(p => p.id === demoPage.id)[0].followers.indexOf('5511111111') >= 0);
    // ---- v2.0: colores de la app (el modo blanco desaparece) ----
    window.__wrOpenSettings();
    check('v2.0 colores: ya no existe el interruptor de modo claro', !$('themeToggle') && !window.document.body.classList.contains('light'));
    check('v2.0 colores: el selector existe con toda la gama', !!$('colorHue') && !!$('colorSat') && !!$('colorLight') && !!$('colorNative') && !!$('colorPresets') && !!$('colorApplyBtn') && !!$('colorSaveBtn') && !!$('colorResetBtn'));
    check('v2.0 colores: hay 8 colores listos', qa('#colorPresets .colorSwatch').length === 8);
    // Mover el tono a azul y aplicar: la vista previa cambia y el color
    // se pone en toda la app y se guarda.
    setVal($('colorHue'), '210');
    const draftBlue = window.__wordredTest.getColorDraftHex();
    check('v2.0 colores: mover el tono cambia la vista previa', draftBlue !== '#e01430' && /^#[0-9a-f]{6}$/.test(draftBlue), 'borrador=' + draftBlue);
    click($('colorApplyBtn'));
    check('v2.0 colores: aplicar pone el color en toda la app', window.document.documentElement.style.getPropertyValue('--red') !== '' && window.__wordredTest.getAppColor() === draftBlue, '--red=' + window.document.documentElement.style.getPropertyValue('--red'));
    check('v2.0 colores: el color elegido se guarda', window.__wordredTest.getState().settings.appColor === draftBlue);
    // Un color listo (rosa) solo se aplica si se elige.
    const pinkBtn = q('#colorPresets [data-preset="rosa"]');
    pinkBtn.click();
    check('v2.0 colores: elegir un color listo cambia el borrador a rosa', window.__wordredTest.getColorDraftHex() === '#e14b8a');
    click($('colorApplyBtn'));
    check('v2.0 colores: el rosa se aplica solo si se elige', window.__wordredTest.getAppColor() === '#e14b8a');
    // Guardar en Mis colores.
    click($('colorSaveBtn'));
    check('v2.0 colores: guardar en Mis colores lo añade', window.__wordredTest.getState().settings.customColors.indexOf('#e14b8a') >= 0 && !!q('#colorCustomRow [data-custom]'));
    // Un color sin contraste avisa y se ajusta solo al aplicarlo.
    setVal($('colorNative'), '#ffffff');
    check('v2.0 colores: un color sin contraste avisa que se ajustará', $('colorContrastNote').textContent.indexOf('se ajustará') >= 0);
    click($('colorApplyBtn'));
    check('v2.0 colores: el blanco se aplica ajustado (no queda blanco puro)', window.__wordredTest.getAppColor() === '#ffffff' && window.document.documentElement.style.getPropertyValue('--red').trim() !== '#ffffff', '--red=' + window.document.documentElement.style.getPropertyValue('--red'));
    // Volver al rojo de WordRed.
    click($('colorResetBtn'));
    check('v2.0 colores: volver al rojo de WordRed', window.__wordredTest.getAppColor() === '#e01430');
    click(q('[data-close="settingsOverlay"]'));
    // ---- v2.0: contraste con cualquier color elegido ----
    // El modo claro ya no existe: en su lugar el color se elige con toda
    // la gama y la app lo ajusta sola si no da contraste (4.5:1).
    {
      const C2 = window.__wordredTest.core;
      check('v2.0 colores: todas las variantes de los colores listos cumplen 4.5:1', C2.APP_COLOR_PRESETS.every(function (pr) { var v = C2.appColorVariants(pr.color); return C2.contrastRatio(v.red, '#ffffff') >= 4.5 && C2.contrastRatio(v.red2, '#120608') >= 4.5; }));
      check('v2.0 colores: el rojo por defecto cumple 4.5:1 con blanco', C2.contrastRatio(C2.appColorVariants('#e01430').red, '#ffffff') >= 4.5, 'c=' + C2.contrastRatio(C2.appColorVariants('#e01430').red, '#ffffff').toFixed(2));
      check('v2.0 colores: el blanco se ajusta solo para que se lea', (function () { var v = C2.appColorVariants('#ffffff'); return v.adjusted && C2.contrastRatio(v.red, '#ffffff') >= 4.5; })());
    }
    // ---- v2.2: likes con el color del usuario, brillo rojo al presionar, clima y reloj ----
    // Con el color por defecto (se acaba de volver al rojo de WordRed),
    // el like, los grados y el reloj son el rojo determinado #E60026.
    check('v2.2 like DOM: con el color por defecto el like es el rojo determinado', window.document.documentElement.style.getPropertyValue('--like').trim() === '#e60026', '--like=' + window.document.documentElement.style.getPropertyValue('--like'));
    check('v2.2 clima/reloj DOM: con el color por defecto los grados y el reloj son el rojo determinado', window.document.documentElement.style.getPropertyValue('--chosen').trim() === '#e60026', '--chosen=' + window.document.documentElement.style.getPropertyValue('--chosen'));
    // Dar like a una publicación sin like: el botón queda activado.
    window.__wordredTest.go('feed');
    const st22 = window.__wordredTest.getState();
    const unliked22 = st22.posts.filter(function (p) { return !(p.likes && p.likes[st22.me]); })[0];
    check('v2.2 like DOM: hay una publicación sin like para probar', !!unliked22);
    if (unliked22) {
      window.__wrLike(unliked22.id);
      const likeBtn22 = q('#feed .post[data-post="' + unliked22.id + '"] .actions .like-btn');
      check('v2.2 like DOM: al dar like el botón queda activado con su clase', !!likeBtn22 && likeBtn22.classList.contains('on') && likeBtn22.classList.contains('like-btn'));
      // Quitar el like para dejar todo como estaba.
      window.__wrLike(unliked22.id);
      const likeBtn22b = q('#feed .post[data-post="' + unliked22.id + '"] .actions .like-btn');
      check('v2.2 like DOM: al quitar el like el icono vuelve a apagado', !!likeBtn22b && !likeBtn22b.classList.contains('on'));
    }
    // Cambiar el color a azul: el like, los grados y el reloj se actualizan.
    window.__wrOpenSettings();
    setVal($('colorHue'), '210');
    const draftBlue22 = window.__wordredTest.getColorDraftHex();
    click($('colorApplyBtn'));
    check('v2.2 like DOM: al cambiar el color, el like se actualiza al color nuevo', window.document.documentElement.style.getPropertyValue('--like').trim() === draftBlue22, '--like=' + window.document.documentElement.style.getPropertyValue('--like'));
    check('v2.2 clima/reloj DOM: al cambiar el color, grados y reloj se actualizan al color nuevo', window.document.documentElement.style.getPropertyValue('--chosen').trim() === draftBlue22, '--chosen=' + window.document.documentElement.style.getPropertyValue('--chosen'));
    check('v2.2 clima/reloj DOM: el reloj grande y la tarjeta del clima existen', !!$('weatherTime') && !!$('weatherCard'));
    // Volver al rojo de WordRed.
    click($('colorResetBtn'));
    check('v2.2 like DOM: al volver al rojo, el like vuelve al rojo determinado', window.document.documentElement.style.getPropertyValue('--like').trim() === '#e60026');
    click(q('[data-close="settingsOverlay"]'));
    // Brillo rojo al presionar: compartir, logo y avatar de una cuenta.
    function pressGlow22(el) { if (!el) return false; el.dispatchEvent(new window.Event('pointerdown', { bubbles: true })); return el.classList.contains('wr-glow'); }
    check('v2.2 brillo DOM: al presionar compartir la app prende en rojo', pressGlow22($('hdrShareApp')));
    check('v2.2 brillo DOM: al presionar el logo de WordRed prende en rojo', pressGlow22(q('header .logo')));
    check('v2.2 brillo DOM: al presionar el logo de una cuenta prende en rojo', pressGlow22(q('#feed .post .avatar')));
    // Guardadas: con más de 3 solo se ven 3 detrás del botón "…".
    window.__wordredTest.go('profile');
    const st22g = window.__wordredTest.getState();
    const toSave22 = st22g.posts.filter(function (p) { return p.savedBy.indexOf(st22g.me) < 0; }).slice(0, 4);
    check('v2.2 guardados DOM: hay al menos 4 publicaciones sin guardar para probar', toSave22.length === 4, 'sin guardar=' + toSave22.length);
    toSave22.forEach(function (p) { window.__wrSave(p.id); });
    window.__wordredTest.go('profile');
    function savedShownCount22() {
      const h3 = Array.from(qa('#ownProfile h3.sectitle')).filter(function (h) { return h.textContent.indexOf('Guardadas') >= 0; })[0];
      if (!h3) return -1;
      let n = 0; let el = h3.nextElementSibling;
      while (el) { if (el.classList && el.classList.contains('post')) n++; el = el.nextElementSibling; }
      return n;
    }
    const totalSaved22 = window.__wordredTest.getState().posts.filter(function (p) { return p.savedBy.indexOf(window.__wordredTest.getState().me) >= 0; }).length;
    check('v2.2 guardados DOM: con más de 3 guardadas solo se ven 3', totalSaved22 > 3 && savedShownCount22() === 3, 'total=' + totalSaved22 + ' visibles=' + savedShownCount22());
    check('v2.2 guardados DOM: aparece el botón de puntos para ver más', !!$('savedMoreBtn'));
    click($('savedMoreBtn'));
    check('v2.2 guardados DOM: al presionar los puntos se ven todas las guardadas', savedShownCount22() === totalSaved22, 'visibles=' + savedShownCount22() + ' total=' + totalSaved22);
    // Dejar todo como estaba: quitar lo guardado en esta prueba.
    toSave22.forEach(function (p) { window.__wrSave(p.id); });
    window.__wordredTest.go('profile');
    // ---- v2.5: se quitan los botones estilo Shorts y se quedan SOLO los anteriores (v2.2) ----
    window.__wordredTest.go('feed');
    const st23 = window.__wordredTest.getState();
    const post23 = st23.posts.filter(function (p) { return !(p.likes && p.likes[st23.me]); })[0] || st23.posts[0];
    const card23 = q('#feed .post[data-post="' + post23.id + '"]');
    const liked23 = !!(post23.likes && post23.likes[st23.me]);
    check('v2.5 acciones DOM: la tarjeta lleva UNA sola fila de acciones anteriores (sin rail vertical)', !!card23 && card23.querySelectorAll('.actions').length === 1 && !!card23.querySelector('.actions') && !card23.querySelector('.actions.shortsRail'));
    const railBtns23 = card23 ? Array.from(card23.querySelectorAll('.actions button')) : [];
    check('v2.7 acciones DOM: la fila tiene SOLO Me gusta, Comentar y Compartir (Guardar subió al encabezado)', railBtns23.length === 3 && !!card23.querySelector('.actions .like-btn') && !!card23.querySelector('.actions button[aria-label="Comentar"]') && !!card23.querySelector('.actions button[aria-label="Compartir"]') && !card23.querySelector('.actions button[aria-label="Guardar"], .actions button[aria-label="Guardada"]'));
    check('v2.8 acciones DOM: los botones llevan icono + texto Y su conteo a la izquierda del símbolo', railBtns23.every(function (b) { return !!b.querySelector('.cnt'); }) && (!liked23 ? card23.querySelector('.actions .like-btn').textContent.indexOf('Me gusta') >= 0 : card23.querySelector('.actions .like-btn').textContent.trim().length > 0) && card23.querySelector('.actions button[aria-label="Comentar"]').textContent.indexOf('Comentar') >= 0 && card23.querySelector('.actions button[aria-label="Compartir"]').textContent.indexOf('Compartir') >= 0);
    check('v2.5 acciones DOM: la fila es horizontal (flex-direction: row)', !!card23 && window.getComputedStyle(card23.querySelector('.actions')).flexDirection === 'row');
    check('v2.5 símbolos DOM: los iconos de la fila son de 19 px como antes', !!card23 && window.getComputedStyle(card23.querySelector('.actions .like-btn .ic svg')).width === '19px');
    click(card23.querySelector('.actions .like-btn'));
    const likeBtn23 = q('#feed .post[data-post="' + post23.id + '"] .actions .like-btn');
    check('v2.5 acciones DOM: al dar like desde la fila el corazón queda activado', !!likeBtn23 && likeBtn23.classList.contains('on') === !liked23);
    window.__wrOpenPost(post23.id);
    setVal($('commentInput'), 'Comentario para el rail 23');
    await window.__wrAddComment(); await tick();
    const cm23 = window.__wordredTest.getState().posts.filter(function (p) { return p.id === post23.id; })[0].comments.slice(-1)[0];
    function lastRail23() { const rs = qa('#postDetail .comment .commentRail'); return rs[rs.length - 1]; }
    check('v2.3 comentarios DOM: cada comentario lleva su rail estilo Shorts', !!lastRail23() && !!lastRail23().querySelector('button[aria-label="Me gusta"]') && !!lastRail23().querySelector('button[aria-label="Responder"]') && !!lastRail23().querySelector('button[aria-label="Compartir"]'));
    click(lastRail23().querySelector('button[aria-label="Me gusta"]'));
    check('v2.3 comentarios DOM: dar me gusta a un comentario funciona', window.__wordredTest.getState().posts.filter(function (p) { return p.id === post23.id; })[0].comments.filter(function (c) { return c.id === cm23.id; })[0].likes[st23.me] === 'Me gusta');
    click(lastRail23().querySelector('button[aria-label="Responder"]'));
    check('v2.3 comentarios DOM: la burbuja abre el formulario de respuesta', !$('reply-' + cm23.id).classList.contains('hidden'));
    click(lastRail23().querySelector('button[aria-label="Compartir"]'));
    check('v2.3 comentarios DOM: compartir desde el rail ofrece compartir fuera', confirmShown());
    click($('confirmNo'));
    const demoStory23 = window.__wordredTest.getState().stories.filter(function (s) { return s.isDemo; })[0];
    window.__wordredTest.openShorts(demoStory23.id);
    check('v2.3 vistas DOM: la historia en Shorts muestra sus vistas como número real', $('shortsInfo').textContent.indexOf('undefined') < 0 && /\d+ vistas?/.test($('shortsInfo').textContent), $('shortsInfo').textContent);
    check('v2.3 vistas DOM: los contadores del rail de Shorts son números reales', $('shortsLikeCount').textContent !== 'undefined' && $('shortsCommentCount').textContent !== 'undefined' && $('shortsShareCount').textContent !== 'undefined');
    click($('shortsClose'));
    // Limpieza: quitar el like, borrar el repost y el comentario de
    // prueba para dejar todo como estaba para las pruebas que siguen.
    window.__wrLike(post23.id);
    const repost23 = window.__wordredTest.getState().posts.filter(function (p) { return p.text && p.text.indexOf('Comentario para el rail 23') >= 0 && p.author === st23.me; })[0];
    if (repost23) { window.__wrDeletePost(repost23.id); click($('confirmYes')); await tick(); }
    window.__wordredTest.core.deleteComment(window.__wordredTest.getState(), st23.me, post23.id, cm23.id);
    // ---- v2.7: Guardar sube arriba a la derecha del encabezado, solo el símbolo (sin letras) ----
    window.__wordredTest.go('feed');
    const st27 = window.__wordredTest.getState();
    const post27 = st27.posts[0];
    function saveBtn27() { const c = q('#feed .post[data-post="' + post27.id + '"]'); return c && c.querySelector('.head .save-btn[aria-label="Guardar"], .head .save-btn[aria-label="Guardada"]'); }
    function actions27() { const c = q('#feed .post[data-post="' + post27.id + '"]'); return c && c.querySelector('.actions'); }
    const label27a = saveBtn27() && saveBtn27().getAttribute('aria-label');
    check('v2.7 guardar DOM: el botón de Guardar está en el encabezado (.head), arriba a la derecha', !!saveBtn27() && !!saveBtn27().closest('.head'));
    check('v2.7 guardar DOM: el botón de Guardar no lleva letras, solo el símbolo', !!saveBtn27() && saveBtn27().textContent.trim() === '' && !!saveBtn27().querySelector('svg'));
    check('v2.7 guardar DOM: el botón conserva su aria-label Guardar/Guardada', !!saveBtn27() && (label27a === 'Guardar' || label27a === 'Guardada'));
    check('v2.7 guardar DOM: la fila de abajo tiene solo 3 botones (Me gusta, Comentar, Compartir)', !!actions27() && actions27().querySelectorAll('button').length === 3);
    check('v2.7 guardar DOM: la fila de abajo es una sola fila, sin rejilla 2×2', /@media \(max-width:480px\)\{\.actions button\{flex:1 1 40%\}\}/.test(html) === false);
    check('v2.7 guardar DOM: el estado guardado se distingue por la clase "on"', !!saveBtn27() && (saveBtn27().classList.contains('on') === (label27a === 'Guardada')));
    click(saveBtn27());
    const label27b = saveBtn27() && saveBtn27().getAttribute('aria-label');
    check('v2.7 guardar DOM: al guardar cambia de estado (aria-label y clase on)', label27a === 'Guardar' ? (label27b === 'Guardada' && saveBtn27().classList.contains('on')) : (label27b === 'Guardar' && !saveBtn27().classList.contains('on')), 'antes=' + label27a + ' después=' + label27b);
    check('v2.7 guardar DOM: tras guardar, el botón sigue sin letras, solo el símbolo', !!saveBtn27() && saveBtn27().textContent.trim() === '' && !!saveBtn27().querySelector('svg'));
    click(saveBtn27()); // dejar como estaba
    // ---- v2.8: los conteos van en los símbolos y desaparece la fila de arriba ----
    window.__wordredTest.go('feed');
    const st28 = window.__wordredTest.getState();
    const post28 = st28.posts.filter(function (p) { return p.text && p.text.indexOf('Mi primera publicación') === 0; })[0];
    function card28() { return q('#feed .post[data-post="' + post28.id + '"]'); }
    function likeBtn28() { const c = card28(); return c && c.querySelector('.actions .like-btn'); }
    function cmtBtn28() { const c = card28(); return c && c.querySelector('.actions button[aria-label="Comentar"]'); }
    function shrBtn28() { const c = card28(); return c && c.querySelector('.actions button[aria-label="Compartir"]'); }
    function cntOf28(btn) { return btn && btn.querySelector('.cnt') ? btn.querySelector('.cnt').textContent : null; }
    const expLike28 = Object.keys(post28.likes || {}).length;
    const expCmt28 = window.__wordredTest.core.commentCount(post28);
    const expShr28 = (post28.shares || []).length;
    check('v2.8 conteos DOM: la tarjeta ya no tiene la fila de contadores de arriba', !!card28() && !card28().querySelector('.counts'));
    check('v2.8 conteos DOM: cada botón lleva su conteo a la izquierda de su símbolo (primer hijo)', [likeBtn28(), cmtBtn28(), shrBtn28()].every(function (b) { return b && b.firstChild && b.firstChild.classList && b.firstChild.classList.contains('cnt'); }));
    check('v2.8 conteos DOM: el botón de Me gusta muestra su número de reacciones', cntOf28(likeBtn28()) === String(expLike28), 'cnt=' + cntOf28(likeBtn28()) + ' esperado=' + expLike28);
    check('v2.8 conteos DOM: el botón de Comentar muestra su número de comentarios', cntOf28(cmtBtn28()) === String(expCmt28), 'cnt=' + cntOf28(cmtBtn28()) + ' esperado=' + expCmt28);
    check('v2.8 conteos DOM: el botón de Compartir muestra su número de veces compartida', cntOf28(shrBtn28()) === String(expShr28), 'cnt=' + cntOf28(shrBtn28()) + ' esperado=' + expShr28);
    // en vivo: la reacción de la publicación es "Me encanta", así que el
    // primer like CAMBIA la reacción a "Me gusta" (el conteo sigue igual),
    // el segundo la quita (baja) y el tercero la vuelve a dar (sube)
    click(likeBtn28());
    check('v2.8 conteos DOM: al cambiar de reacción el conteo sigue igual y el botón dice Me gusta', cntOf28(likeBtn28()) === String(expLike28) && likeBtn28().textContent.indexOf('Me gusta') >= 0, 'cnt=' + cntOf28(likeBtn28()));
    click(likeBtn28());
    check('v2.8 conteos DOM: el conteo de reacciones se actualiza en vivo al quitar el like', cntOf28(likeBtn28()) === String(expLike28 - 1), 'cnt=' + cntOf28(likeBtn28()));
    click(likeBtn28());
    check('v2.8 conteos DOM: el conteo de reacciones se actualiza en vivo al volver a dar like', cntOf28(likeBtn28()) === String(expLike28), 'cnt=' + cntOf28(likeBtn28()));
    window.__wrReact(post28.id, 'Me encanta'); // dejar la reacción como estaba
    // en vivo: compartir actualiza el conteo (se elige compartir dentro de WordRed)
    window.__wrShare(post28.id);
    check('v2.8 conteos DOM: al compartir se ofrece dentro de WordRed o en otras apps', $('shareChoiceOverlay').classList.contains('on'));
    click($('shareChoiceInside'));
    check('v2.8 conteos DOM: el conteo de veces compartida se actualiza en vivo al compartir', cntOf28(shrBtn28()) === String(expShr28 + 1), 'cnt=' + cntOf28(shrBtn28()));
    // limpieza: borrar el repost que se creó al compartir
    const repost28 = window.__wordredTest.getState().posts.filter(function (p) { return p.sharedFrom && p.sharedFrom.id === post28.id && p.author === st28.me; })[0];
    if (repost28) { window.__wrDeletePost(repost28.id); click($('confirmYes')); await tick(); }
    // en vivo: comentar actualiza el conteo
    window.__wrOpenPost(post28.id);
    setVal($('commentInput'), 'Comentario de prueba v2.8');
    await window.__wrAddComment(); await tick();
    check('v2.8 conteos DOM: el conteo de comentarios se actualiza en vivo al comentar', (function () { const b = q('#postDetail .post .actions button[aria-label="Comentar"]'); return b && b.querySelector('.cnt') && b.querySelector('.cnt').textContent === String(expCmt28 + 1); })(), 'esperado=' + (expCmt28 + 1));
    // limpieza: borrar el comentario de prueba y cerrar el detalle
    const cmt28 = window.__wordredTest.getState().posts.filter(function (p) { return p.id === post28.id; })[0].comments.filter(function (c) { return c.text === 'Comentario de prueba v2.8'; })[0];
    if (cmt28) window.__wordredTest.core.deleteComment(window.__wordredTest.getState(), st28.me, post28.id, cmt28.id);
    click(q('[data-close="postOverlay"]'));
    // ---- v1.1: diálogos de confirmación ----
    const st = window.__wordredTest.getState();
    // borrar publicación
    const delPostId = q('#feed .post').getAttribute('data-post');
    window.__wrDeletePost(delPostId);
    check('diálogo: borrar publicación pide confirmación', confirmShown() && $('confirmTitle').textContent.indexOf('Borrar publicación') >= 0);
    click($('confirmNo'));
    check('diálogo: cancelar no borra la publicación', window.__wordredTest.getState().posts.some(p => p.id === delPostId));
    window.__wrDeletePost(delPostId);
    click($('confirmYes'));
    await tick();
    check('diálogo: confirmar borra la publicación', !window.__wordredTest.getState().posts.some(p => p.id === delPostId));
    check('v1.5.10 borrado: confirmar manda DELETE al servidor con esa publicación', (calls.postDeletes || []).some(function (u) { return u.indexOf('/api/posts/' + encodeURIComponent(delPostId)) >= 0; }), JSON.stringify(calls.postDeletes || []));
    /* ---- v1.5.11: el borrado reintenta solo si falla por conexión ---- */
    /* El servidor gratuito se duerme y tarda en despertar: con el mock
       fallando 2 veces por conexión, el borrado llega al tercer intento;
       fallando siempre, se avisa y la publicación se queda; un 403 no
       se reintenta. Las esperas se acortan solo en la prueba (el helper
       real espera 5 s y 15 s entre intentos). */
    const T11 = window.__wordredTest;
    const origRetry11 = T11.core.serverFetchWithRetry;
    T11.core.serverFetchWithRetry = function (state, path, method, body, opts) {
      return origRetry11(state, path, method, body, Object.assign({}, opts, { delays: [0, 10, 10] }));
    };
    const me11 = T11.getState().me;
    function delCalls11(id) { return (calls.postDeletes || []).filter(function (u) { return u.indexOf('/api/posts/' + encodeURIComponent(id)) >= 0; }); }
    /* v1.5.15: el borrado es OPTIMISTA — la publicación desaparece al
       confirmar, antes de que responda el servidor; si el servidor no
       responde, YA NO VUELVE (se queda oculta y el borrado queda
       encolado); solo un rechazo real (403) la devuelve. Por eso aquí
       se espera al aviso FINAL (borrada, oculta o error). */
    async function deleteViaUi11(id) {
      window.__wrDeletePost(id);
      click($('confirmYes'));
      await waitFor(function () { return $('toast').textContent.indexOf('Publicación borrada.') >= 0 || $('toast').textContent.indexOf('No se pudo borrar') >= 0 || $('toast').textContent.indexOf('Publicación oculta') >= 0; }, 5000);
    }
    // (a) falla 2 veces por conexión y a la tercera llega: se borra
    calls.postDeletes = [];
    calls.deleteFailTimes = 2;
    const postA11 = T11.core.createPost(T11.getState(), me11, { text: 'Borrado con reintento A' }).post;
    T11.go('feed');
    $('toast').textContent = '';
    await deleteViaUi11(postA11.id);
    check('v1.5.11 reintento DOM: tras 2 fallos por conexión el borrado llega y la publicación se va', !T11.getState().posts.some(function (p) { return p.id === postA11.id; }) && delCalls11(postA11.id).length === 3, 'DELETEs=' + delCalls11(postA11.id).length);
    check('v1.5.11 reintento DOM: al borrar tras reintentar se muestra "Publicación borrada."', $('toast').textContent.indexOf('Publicación borrada.') >= 0, 'toast=' + $('toast').textContent);
    // (b) falla siempre: NO vuelve, se queda oculta y el borrado queda encolado
    calls.postDeletes = [];
    calls.deleteFailTimes = 99;
    const postB11 = T11.core.createPost(T11.getState(), me11, { text: 'Borrado con reintento B' }).post;
    T11.go('feed');
    $('toast').textContent = '';
    await deleteViaUi11(postB11.id);
    check('v1.5.15 borrado DOM: si falla siempre por conexión, la publicación NO vuelve (se queda oculta, con lápida, y el borrado queda encolado)', !T11.getState().posts.some(function (p) { return p.id === postB11.id; }) && T11.core.isPostDeleted(T11.getState(), postB11.id) && T11.getState().pendingQueue.some(function (it) { return it.kind === 'http' && it.method === 'DELETE' && it.path.indexOf(postB11.id) >= 0; }), 'cola=' + JSON.stringify(T11.getState().pendingQueue.map(function (it) { return it.path; })));
    check('v1.5.15 borrado DOM: si falla siempre, se hicieron 3 intentos y se avisa que se borrará al volver la conexión', delCalls11(postB11.id).length === 3 && $('toast').textContent.indexOf('Publicación oculta') >= 0, 'DELETEs=' + delCalls11(postB11.id).length + ' toast=' + $('toast').textContent);
    // (c) un 403 no se reintenta
    calls.postDeletes = [];
    calls.deleteFailTimes = 0;
    calls.deleteStatus = 403;
    const postC11 = T11.core.createPost(T11.getState(), me11, { text: 'Borrado con reintento C' }).post;
    T11.go('feed');
    $('toast').textContent = '';
    await deleteViaUi11(postC11.id);
    check('v1.5.11 reintento DOM: un 403 no se reintenta (un solo intento) y la publicación se queda', delCalls11(postC11.id).length === 1 && T11.getState().posts.some(function (p) { return p.id === postC11.id; }), 'DELETEs=' + delCalls11(postC11.id).length);
    // limpieza: banderas y helper como estaban, y fuera las publicaciones de prueba
    calls.deleteFailTimes = 0;
    calls.deleteStatus = 0;
    T11.core.serverFetchWithRetry = origRetry11;
    [postB11.id, postC11.id].forEach(function (id) { T11.core.deletePost(T11.getState(), me11, id); });
    /* v1.5.15: la publicación B quedó oculta con lápida y su DELETE
       encolado; se limpia para no contaminar las pruebas que siguen. */
    T11.getState().pendingQueue = T11.getState().pendingQueue.filter(function (it) { return !(it.path && it.path.indexOf(postB11.id) >= 0); });
    T11.core.unmarkPostDeleted(T11.getState(), postB11.id);
    T11.go('feed');
    // borrar comentario
    const cPost = window.__wordredTest.getState().posts[0];
    window.__wrOpenPost(cPost.id);
    setVal($('commentInput'), 'Comentario para borrar');
    await window.__wrAddComment(); await tick();
    const cId = window.__wordredTest.getState().posts[0].comments[0].id;
    window.__wrDeleteComment(cPost.id, cId);
    check('diálogo: borrar comentario pide confirmación', confirmShown());
    click($('confirmNo'));
    check('diálogo: cancelar no borra el comentario', window.__wordredTest.getState().posts[0].comments.length === 1);
    window.__wrDeleteComment(cPost.id, cId);
    click($('confirmYes'));
    check('diálogo: confirmar borra el comentario', window.__wordredTest.getState().posts[0].comments.length === 0);
    click(q('[data-close="postOverlay"]'));
    // eliminar amigo
    window.__wordredTest.core.sendFriendRequest(st, '5511111111', '1000000002');
    const reqId2 = st.requests[st.requests.length - 1].id;
    window.__wordredTest.core.respondFriendRequest(st, '1000000002', reqId2, true);
    check('diálogo: hay un amigo para probar eliminar', window.__wordredTest.core.areFriends(st, '5511111111', '1000000002'));
    window.__wrUnfriend('1000000002');
    check('diálogo: eliminar amigo pide confirmación', confirmShown());
    click($('confirmNo'));
    check('diálogo: cancelar no elimina al amigo', window.__wordredTest.core.areFriends(st, '5511111111', '1000000002'));
    window.__wrUnfriend('1000000002');
    click($('confirmYes'));
    check('diálogo: confirmar elimina al amigo', !window.__wordredTest.core.areFriends(st, '5511111111', '1000000002'));
    // borrar historia (v1.2: el reproductor es Shorts; el botón es "Borrar mi historia")
    const myStory = window.__wordredTest.getState().stories.filter(s => s.author === '5511111111')[0];
    window.__wrOpenStory(myStory.id);
    const delStoryBtn = Array.from(qa('#shortsOverlay button')).find(b => b.textContent.indexOf('Borrar mi historia') >= 0);
    check('diálogo: borrar historia tiene su botón en Shorts', !!delStoryBtn);
    if (delStoryBtn) delStoryBtn.click();
    check('diálogo: borrar historia pide confirmación', confirmShown());
    click($('confirmNo'));
    check('diálogo: cancelar no borra la historia', window.__wordredTest.getState().stories.some(s => s.id === myStory.id));
    const delStoryBtn2 = Array.from(qa('#shortsOverlay button')).find(b => b.textContent.indexOf('Borrar mi historia') >= 0);
    if (delStoryBtn2) delStoryBtn2.click();
    click($('confirmYes'));
    check('diálogo: confirmar borra la historia', !window.__wordredTest.getState().stories.some(s => s.id === myStory.id));
    // borrar mensaje y conversación
    window.__wrOpenChat('1000000001');
    const convKey = window.__wordredTest.core.convoKey('5511111111', '1000000001');
    const myMsg = window.__wordredTest.getState().conversations[convKey].messages.filter(m => m.from === '5511111111').slice(-1)[0];
    window.__wrDeleteMessage(myMsg.id);
    check('diálogo: borrar mensaje pide confirmación', confirmShown());
    click($('confirmNo'));
    check('diálogo: cancelar no borra el mensaje', window.__wordredTest.getState().conversations[convKey].messages.some(m => m.id === myMsg.id));
    window.__wrDeleteMessage(myMsg.id);
    click($('confirmYes'));
    check('diálogo: confirmar borra el mensaje', !window.__wordredTest.getState().conversations[convKey].messages.some(m => m.id === myMsg.id));
    click(q('[data-close="chatOverlay"]'));
    window.__wordredTest.go('messages');
    window.__wrDeleteConvo('1000000001');
    check('diálogo: borrar conversación pide confirmación', confirmShown());
    click($('confirmNo'));
    check('diálogo: cancelar no borra la conversación', !!window.__wordredTest.getState().conversations[convKey]);
    window.__wrDeleteConvo('1000000001');
    click($('confirmYes'));
    check('diálogo: confirmar borra la conversación', !window.__wordredTest.getState().conversations[convKey]);
    // salir del grupo
    const demoGroupId = window.__wordredTest.getState().groups[0].id;
    window.__wrJoinGroup(demoGroupId);
    window.__wrLeaveGroup(demoGroupId);
    check('diálogo: salir del grupo pide confirmación', confirmShown());
    click($('confirmNo'));
    check('diálogo: cancelar no saca del grupo', window.__wordredTest.getState().groups[0].members.indexOf('5511111111') >= 0);
    window.__wrLeaveGroup(demoGroupId);
    click($('confirmYes'));
    check('diálogo: confirmar saca del grupo', window.__wordredTest.getState().groups[0].members.indexOf('5511111111') < 0);
    // cancelar evento
    window.__wrCancelEvent(evId);
    check('diálogo: cancelar evento pide confirmación', confirmShown());
    click($('confirmNo'));
    check('diálogo: cancelar no cancela el evento', window.__wordredTest.getState().events.filter(e => e.id === evId)[0].status === 'Activo');
    window.__wrCancelEvent(evId);
    click($('confirmYes'));
    check('diálogo: confirmar cancela el evento', window.__wordredTest.getState().events.filter(e => e.id === evId)[0].status === 'Cancelado');
    // dejar de seguir una página
    window.__wrFollowPage(demoPage.id);
    check('diálogo: dejar de seguir pide confirmación', confirmShown() && $('confirmTitle').textContent.indexOf('Dejar de seguir') >= 0);
    click($('confirmNo'));
    check('diálogo: cancelar no deja de seguir', window.__wordredTest.getState().pages.filter(p => p.id === demoPage.id)[0].followers.indexOf('5511111111') >= 0);
    window.__wrFollowPage(demoPage.id);
    click($('confirmYes'));
    check('diálogo: confirmar deja de seguir', window.__wordredTest.getState().pages.filter(p => p.id === demoPage.id)[0].followers.indexOf('5511111111') < 0);
    // borrar anuncio
    const myListing2 = window.__wordredTest.getState().listings.filter(l => l.seller === '5511111111')[0];
    window.__wrDeleteListing(myListing2.id);
    check('diálogo: borrar anuncio pide confirmación', confirmShown());
    click($('confirmNo'));
    check('diálogo: cancelar no borra el anuncio', window.__wordredTest.getState().listings.some(l => l.id === myListing2.id));
    window.__wrDeleteListing(myListing2.id);
    click($('confirmYes'));
    check('diálogo: confirmar borra el anuncio', !window.__wordredTest.getState().listings.some(l => l.id === myListing2.id));
    // descartar borrador
    click($('composerOpen'));
    setVal($('postText'), 'Borrador sin guardar');
    click(q('[data-close="composerOverlay"]'));
    check('diálogo: descartar publicación pide confirmación', confirmShown());
    click($('confirmNo'));
    check('diálogo: cancelar mantiene el borrador', $('composerOverlay').classList.contains('on') && $('postText').value.indexOf('Borrador') >= 0);
    click(q('[data-close="composerOverlay"]'));
    click($('confirmYes'));
    check('diálogo: confirmar descarta el borrador', !$('composerOverlay').classList.contains('on') && $('postText').value === '');
    // ---- v1.2 (olas 1–12) ----
    // permisos de primer inicio (la pantalla propia de WordRed está abierta desde el arranque)
    check('v1.2 permisos: al entrar por primera vez se explica cada permiso en el diseño de WordRed', $('permissionsOverlay').classList.contains('on') && $('permStep').textContent.indexOf('Notificaciones') >= 0);
    click($('permSkip')); click($('permSkip')); click($('permSkip')); click($('permSkip')); click($('permSkip'));
    check('v1.2 permisos: tras los 5 permisos se muestra "¡Listo!"', $('permStep').textContent.indexOf('¡Listo!') >= 0);
    click($('permDone'));
    check('v1.2 permisos: al terminar, los permisos quedan marcados como pedidos', window.__wordredTest.getState().settings.permsAsked === true);
    check('v1.5.12 sin SMS: tras los permisos ya no se ofrece ser app de mensajes', !$('defaultsOverlay') && !$('defaultStep'));
    // amigo para las pruebas de seguidos (Carlos, perfil de ejemplo)
    const st12 = window.__wordredTest.getState();
    window.__wordredTest.core.sendFriendRequest(st12, '5511111111', '1000000002');
    const rq12 = st12.requests[st12.requests.length - 1];
    window.__wordredTest.core.respondFriendRequest(st12, '1000000002', rq12.id, true);
    check('v1.2: Carlos es amigo para las pruebas de seguidos', window.__wordredTest.core.areFriends(st12, '5511111111', '1000000002'));
    // avisos de seguidos (ola 1)
    const notifBefore = calls.postNotifications.length;
    window.__wordredTest.core.createPost(st12, '1000000002', { text: 'Post de un seguido para avisar' });
    window.__wordredTest.checkPostNotifications();
    check('v1.2 avisos: publicar un seguido genera una notificación en la barra', calls.postNotifications.length > notifBefore, 'antes: ' + notifBefore + ' después: ' + calls.postNotifications.length);
    const notifAfterFriend = calls.postNotifications.length;
    st12.settings.notifFollowPosts = false;
    window.__wordredTest.core.createPost(st12, '1000000002', { text: 'Otro post con el aviso apagado' });
    window.__wordredTest.checkPostNotifications();
    check('v1.2 avisos: con el ajuste apagado no se notifica', calls.postNotifications.length === notifAfterFriend);
    st12.settings.notifFollowPosts = true;
    // iconos monocromos en todo el chrome (ola 1)
    check('v1.2 iconos: buscar, archivo de chat y voz usan SVG monocromo', ['hdrSearch', 'chatFileBtn', 'chatVoiceBtn'].every(id => { const el = $(id); const s = el && el.querySelector('svg'); return s && s.getAttribute('stroke') === 'currentColor'; }));
    // compositor con fondo, sentimientos, etiquetas, ubicación y formato (ola 1)
    click($('composerOpen'));
    check('v1.2 compositor: 1.5.43 ya no hay música automática (sin toggle en el compositor)', !$('postAutoMusicToggle') && !window.__wordredTest.getAutoMusic);
    check('v1.2 compositor: ofrece fondo, etiquetas, ubicación y formato', !!($('postBgRow') && $('postTagInput') && $('postLocation') && $('postBold') && $('postItalic') && $('postMediaInput').multiple));
    const bgChip = q('#postBgRow [data-bg="atardecer"]');
    if (bgChip) bgChip.click();
    setVal($('postTagInput'), 'carlos');
    const tagBtn = q('#postTagSuggest [data-tagph="1000000002"]');
    check('v1.2 compositor: al escribir, sugiere amigos para etiquetar', !!tagBtn);
    if (tagBtn) tagBtn.click();
    setVal($('postLocation'), 'Ciudad de México');
    setVal($('postText'), 'Hola mundo rico');
    const ti = $('postText'); ti.setSelectionRange(5, 10);
    click($('postBold'));
    check('v1.2 compositor: la negrita envuelve la selección con **', $('postText').value.indexOf('**mundo**') >= 0, $('postText').value);
    click($('postPublish'));
    check('v1.2 animaciones: la publicación recién creada entra deslizándose', q('#feed .post').classList.contains('new-post'));
    const richPostId = q('#feed .post').getAttribute('data-post');
    const richHtml = q('#feed .post').innerHTML;
    check('v1.2 compositor: la publicación muestra fondo, ubicación y negrita', richHtml.indexOf('postbg-atardecer') >= 0 && q('#feed .post').textContent.indexOf('Ciudad de México') >= 0 && richHtml.indexOf('<b>mundo</b>') >= 0);
    check('v1.2 compositor: la etiqueta al amigo se ve en la publicación', q('#feed .post').textContent.indexOf('Carlos') >= 0);
    check('v1.2 publicaciones: la fecha y hora completas se ven en la publicación', /\d{1,2} nov 2026 · \d{2}:\d{2}/.test(q('#feed .post').textContent) && $('feed').textContent.indexOf('hace') >= 0);
    // Shorts (ola 1)
    click(q('#bottomNav button[data-nav="shorts"]'));
    check('v1.2 Shorts: la pestaña central abre el reproductor a pantalla completa', $('shortsOverlay').classList.contains('on') && !!$('shortsBody').innerHTML);
    const likeBefore = $('shortsLikeCount').textContent;
    click($('shortsLike'));
    check('v1.2 Shorts: el me gusta en pantalla cambia el contador', $('shortsLikeCount').textContent !== likeBefore, likeBefore + ' -> ' + $('shortsLikeCount').textContent);
    const demoStoryId = st12.stories.filter(s => s.isDemo)[0].id;
    window.__wordredTest.openShorts(demoStoryId);
    click($('shortsComment'));
    check('v1.2 Shorts: el botón de comentar abre los comentarios', $('shortsCommentsOverlay').classList.contains('on'));
    setVal($('shortsCommentInput'), '¡Qué buen Short!');
    click($('shortsCommentSend'));
    check('v1.2 Shorts: comentar desde el reproductor actualiza el contador', $('shortsCommentCount').textContent !== '0');
    const countBefore = $('shortsCount').textContent;
    click($('shortsNext'));
    check('v1.2 Shorts: pasar al siguiente cambia de historia', $('shortsCount').textContent !== countBefore, countBefore + ' -> ' + $('shortsCount').textContent);
    click($('shortsExpand'));
    check('v1.2 Shorts: expandir pone el reproductor a pantalla completa', $('shortsOverlay').classList.contains('expanded'));
    click($('shortsCollapse'));
    check('v1.2 Shorts: salir de pantalla completa quita la expansión', !$('shortsOverlay').classList.contains('expanded'));
    click($('shortsShare'));
    check('v1.2 Shorts: compartir muestra la hoja de elección (dentro o fuera)', $('shareChoiceOverlay').classList.contains('on'));
    click(q('#shareChoiceOverlay [data-close="shareChoiceOverlay"]'));
    click($('shortsClose'));
    // animaciones (ola 3)
    check('v1.2 animaciones: hay animaciones para like, publicar, mensajes y éxito', /@keyframes wrPop/.test(html) && /@keyframes wrSlideIn/.test(html) && /@keyframes wrCheckPop/.test(html) && /@keyframes wrMsgIn/.test(html));
    window.__wrLike(richPostId);
    check('v1.2 animaciones: el me gusta hace pop en la publicación', (q('#feed .post[data-post="' + richPostId + '"]') || {}).classList && q('#feed .post[data-post="' + richPostId + '"]').classList.contains('just-liked'));
    window.__wordredTest.showSuccess('Prueba de éxito');
    check('v1.2 animaciones: el éxito muestra el check animado', $('successOverlay').classList.contains('on'));
    // Marketplace v1.2 (olas 1–2): WhatsApp, marca, negociable, entrega, fecha/hora, perfil de ventas, grupos de ventas (v1.5.16: se entra desde arriba)
    click($('feedMarketBtn'));
    click($('listingCreateBtn'));
    setVal($('listingTitle'), 'Celular Samsung S23');
    setVal($('listingPrice'), '8500');
    setVal($('listingBrand'), 'Samsung');
    setVal($('listingWhatsapp'), '5512345678');
    setVal($('listingCity'), 'CDMX');
    $('listingNegotiable').checked = true;
    $('listingNegotiable').dispatchEvent(new window.Event('change', { bubbles: true }));
    $('listingDelivery').value = 'Ambos';
    setVal($('listingDesc'), 'Como nuevo, con caja.');
    click($('listingPublish'));
    check('v1.2 mercado: el anuncio muestra marca, precio, negociable y entrega', $('marketGrid').textContent.indexOf('Samsung') >= 0 && $('marketGrid').textContent.indexOf('$8,500') >= 0 && $('marketGrid').textContent.indexOf('Negociable') >= 0 && $('marketGrid').textContent.indexOf('Ambos') >= 0);
    const newListingId = st12.listings.filter(l => l.seller === '5511111111' && l.title === 'Celular Samsung S23')[0].id;
    const photoListing = window.__wordredTest.core.createListing(st12, '5511111111', { title: 'Celular con foto', price: 8500, brand: 'Samsung', whatsapp: '5512345678', negotiable: true, delivery: 'Ambos', category: 'Celulares', condition: 'Usado', city: 'CDMX', desc: 'Con foto grande.', photos: ['data:image/jpeg;base64,/9j/4AAQ'] }).listing;
    window.__wrOpenListing(photoListing.id);
    check('v1.2 mercado: el detalle tiene galería grande, marca y fecha/hora', !!q('#listingDetail .listingGallery') && $('listingDetail').textContent.indexOf('Samsung') >= 0 && /\d{1,2} nov 2026 · \d{2}:\d{2}/.test($('listingDetail').textContent));
    // El botón de WhatsApp sale en los anuncios de otras personas (no en los propios)
    const waListing = window.__wordredTest.core.createListing(st12, '1000000001', { title: 'Celular de Ana', price: 7000, brand: 'Samsung', whatsapp: '5512345678', negotiable: false, delivery: 'Envío', category: 'Celulares', condition: 'Usado', city: 'CDMX', desc: 'De Ana.', photos: ['data:image/jpeg;base64,/9j/4AAQ'] }).listing;
    window.__wrOpenListing(waListing.id);
    check('v1.2 mercado: el anuncio de otra persona tiene botón de WhatsApp', $('listingDetail').textContent.indexOf('WhatsApp') >= 0);
    window.__wrOpenListing(newListingId);
    const sellerBtn = Array.from(qa('#listingDetail button')).find(b => b.textContent.indexOf('Ver perfil de ventas') >= 0);
    check('v1.2 mercado: el anuncio ofrece ver el perfil de ventas', !!sellerBtn);
    if (sellerBtn) sellerBtn.click();
    check('v1.2 ventas: el perfil de ventas muestra anuncios y valoración', $('sellerProfileOverlay').classList.contains('on') && $('sellerProfileDetail').textContent.indexOf('Celular Samsung S23') >= 0);
    click(q('[data-close="sellerProfileOverlay"]'));
    click(q('[data-close="listingOverlay"]'));
    click($('salesGroupCreateBtn'));
    check('v1.2 ventas: crear grupo de ventas abre su formulario', $('salesGroupCreateOverlay').classList.contains('on'));
    setVal($('salesGroupName'), 'Ventas CDMX');
    click($('salesGroupCreateSave'));
    check('v1.2 ventas: el grupo de ventas se crea', window.__wordredTest.getState().salesGroups.some(g => g.name === 'Ventas CDMX'));
    click(q('#marketSectionTabs button[data-section="salesgroups"]'));
    check('v1.2 ventas: los grupos de ventas tienen su menú aparte', $('view-marketplace').textContent.indexOf('Ventas CDMX') >= 0);
    click(q('#marketSectionTabs button[data-section="mine"]'));
    check('v1.2 ventas: "Mis ventas" muestra lo que vendes tú', $('marketMineList').textContent.indexOf('Celular Samsung S23') >= 0);
    window.__wordredTest.core.createListing(st12, '1000000002', { title: 'Silla de Carlos', price: 900, category: 'Hogar', condition: 'Usado', city: 'CDMX' });
    click(q('#marketSectionTabs button[data-section="followed"]'));
    check('v1.2 ventas: "Ventas de seguidos" muestra lo que venden tus seguidos', $('marketFollowedList').textContent.indexOf('Silla de Carlos') >= 0);
    // archivos, voz y llamadas en mensajes (olas 2–3)
    window.__wrOpenChat('1000000001');
    check('v1.2 mensajes: hay botón para adjuntar archivos', !!$('chatFileBtn'));
    window.__wordredTest.core.sendMessage(st12, '5511111111', '1000000001', '', null, null, { name: 'informe.pdf', size: 12345, mime: 'application/pdf', uri: 'content://com.wordred.app.fileprovider/media/informe.pdf' });
    window.__wrOpenChat('1000000001');
    check('v1.2 mensajes: el archivo aparece con nombre y tamaño', !!q('#chatMsgs .filecard') && $('chatMsgs').textContent.indexOf('informe.pdf') >= 0 && $('chatMsgs').textContent.indexOf('12 KB') >= 0);
    const openFileBtn = Array.from(qa('#chatMsgs button')).find(b => b.textContent === 'Abrir');
    if (openFileBtn) openFileBtn.click();
    check('v1.2 mensajes: abrir el archivo llama al puente nativo', calls.openedFiles.length === 1 && calls.openedFiles[0].uri.indexOf('informe.pdf') >= 0);
    click($('chatVoiceBtn'));
    check('v1.2 voz: al tocar el micrófono aparece la barra de grabación', !$('voiceRecBar').classList.contains('hidden'));
    click($('chatVoiceBtn'));
    await waitFor(() => q('#chatMsgs .voicecard audio'), 5000);
    // v1.4: el audio se sube al servidor y queda como URL pública
    check('v1.2 voz: el mensaje de voz se envía con onda y duración', !!q('#chatMsgs .voicecard') && !!q('#chatMsgs .voicecard audio') && q('#chatMsgs .voicecard audio').getAttribute('src').indexOf('/media/') >= 0);
    click($('chatCallBtn'));
    check('v1.5 llamadas: sin conexión, el botón ofrece primero la llamada telefónica real', $('callChoiceOverlay').classList.contains('on') && $('callChoiceTitle').textContent.indexOf('Llamar a') >= 0);
    /* El WebSocket de jsdom puede llegar a conectarse de verdad con el
       servidor desplegado; para probar el caso sin conexión se apaga
       aquí de forma explícita y se bloquea el WebSocket durante la
       prueba (v1.6: startCall espera hasta 5 s a que conecte antes de
       rendirse, así que el diálogo se espera, no se revisa al instante). */
    window.__wordredTest.setServerConnected(false);
    const RealWS = window.WebSocket;
    window.WebSocket = function () { throw new Error('sin red'); };
    click($('callChoiceApp'));
    await waitFor(() => confirmShown(), 7000);
    window.WebSocket = RealWS;
    check('v1.3 llamadas: sin conexión, la llamada de WordRed lo explica sin mencionar el servidor', confirmShown() && $('confirmText').textContent.indexOf('no hay conexión') >= 0 && !/servidor/i.test($('confirmText').textContent));
    click($('confirmNo'));
    check('v1.2 llamadas: sin servidor no se finge la llamada', window.__wordredTest.getCallState() === 'idle');
    window.__wordredTest.handleCallSignal({ kind: 'call', from: '1000000001', type: 'offer', payload: { offer: { type: 'offer', sdp: 'falso' }, withVideo: false } });
    await sleep(100);
    check('v1.2 llamadas: la llamada entrante muestra quién llama', $('callOverlay').classList.contains('on') && $('callBody').textContent.indexOf('Ana Prueba') >= 0);
    const acceptBtn = Array.from(qa('#callBody button')).find(b => b.textContent === 'Aceptar');
    if (acceptBtn) acceptBtn.click();
    await sleep(200);
    check('v1.2 llamadas: aceptar abre la pantalla en llamada', $('callBody').textContent.indexOf('Colgar') >= 0);
    const hangBtn = Array.from(qa('#callBody button')).find(b => b.textContent === 'Colgar');
    if (hangBtn) hangBtn.click();
    await sleep(100);
    check('v1.2 llamadas: colgar termina la llamada', window.__wordredTest.getCallState() === 'idle');
    click(q('[data-close="chatOverlay"]'));
    // compartir (ola 4)
    window.__onSharedContent({ type: 'text', text: 'Miren esto desde otra app' });
    await sleep(100);
    check('v1.2 compartir: lo compartido desde otra app abre el publicador con el contenido', $('composerOverlay').classList.contains('on') && $('postText').value.indexOf('Miren esto desde otra app') >= 0);
    click($('postPublish'));
    const sharedPostId = q('#feed .post').getAttribute('data-post');
    window.__wrShare(sharedPostId);
    check('v1.2 compartir: compartir ofrece dentro de WordRed o en otras apps', $('shareChoiceOverlay').classList.contains('on'));
    click($('shareChoiceOutside'));
    check('v1.2 compartir: elegir otras apps llama a la hoja de compartir del sistema', calls.shared.length >= 1);
    // apoyo al creador y bloqueo de la app (ola 4)
    window.__wrOpenSettings();
    check('v1.2 apoyo: en Ajustes hay un apartado para apoyar al creador', !!$('supportSection') && !!$('supportCopyBtn') && !!$('supportAccount'));
    click($('supportCopyBtn'));
    await sleep(50);
    check('v1.2 apoyo: copiar el número no rompe nada', errors.length === 0);
    check('v1.2 bloqueo: en Ajustes hay interruptor de bloqueo de la app', !!$('appLockToggle'));
    $('appLockToggle').checked = true;
    $('appLockToggle').dispatchEvent(new window.Event('change', { bubbles: true }));
    await sleep(100);
    check('v1.2 bloqueo: activar con huella/PIN guarda el bloqueo', window.__wordredTest.getAppLock() === true);
    $('appLockToggle').checked = false;
    $('appLockToggle').dispatchEvent(new window.Event('change', { bubbles: true }));
    await sleep(100);
    check('v1.2 bloqueo: desactivar con huella/PIN quita el bloqueo', window.__wordredTest.getAppLock() === false);
    click(q('[data-close="settingsOverlay"]'));
    // v1.5.12: sin SMS. Mensajes solo tiene los chats de WordRed.
    // (v1.5.14: se entra por el botón de Mensajes del encabezado.)
    click($('hdrMessages'));
    check('v1.5.12 sin SMS: en Mensajes no hay pestaña ni bandeja de SMS', !$('smsListWrap') && !$('smsBadge') && !$('smsList') && !$('smsOverlay') && !$('msgSectionTabs'));
    check('v1.5.12 sin SMS: en Mensajes solo están los chats de WordRed', !!$('convoList') && $('convoList').textContent.length > 0);
    // v2.0: el apartado de Teléfono ya no existe; queda solo Mensajes.
    check('v2.0 teléfono: no hay botón de Teléfono en la barra', !q('#bottomNav button[data-nav="phone"]'));
    check('v2.0 teléfono: no existe la vista de Teléfono', !$('view-phone'));
    check('v2.0 teléfono: no existe el marcador ni el historial de llamadas', !$('dialPad') && !$('phoneCallLogList') && !$('phoneContactList'));
    check('v2.0 teléfono: no se ofrece ser app de teléfono', !$('dialerDefaultBtn') && !$('dialerDefaultBtn2') && calls.defaultRole.indexOf('dialer') < 0);
    check('v1.5.12 sin SMS: Mensajes sigue solo con chats de WordRed', !!$('view-messages') && !$('smsListWrap') && !!$('convoList'));
    // La pantalla de llamada real sigue existiendo para las llamadas
    // que se hacen desde los chats y los perfiles.
    window.__wordredTest.onTelecomCall('ringing', '5522222222');
    check('v2.0 teléfono: una llamada entrante muestra su pantalla', $('phoneCallOverlay').classList.contains('on') && $('phoneCallNumber').textContent.indexOf('5522222222') >= 0);
    click($('phoneCallAnswerBtn'));
    check('v2.0 teléfono: contestar pone la llamada activa', window.__wordredTest.getTelecomCall().state === 'active');
    click($('phoneCallHangBtn'));
    check('v2.0 teléfono: colgar cierra la pantalla de llamada', !$('phoneCallOverlay').classList.contains('on') || window.__wordredTest.getTelecomCall().state === 'ended');
    // editor de historias (ola 6)
    window.__wordredTest.openStoryEditor({ src: 'data:image/jpeg;base64,/9j/4AAQ', type: 'image' }, 'Mi historia editada');
    check('v1.2 historias: el editor de historia se abre', $('storyEditorOverlay').classList.contains('on'));
    const storyTextChip = q('#storyEditTools .chip[data-tool="text"]');
    if (storyTextChip) storyTextChip.click();
    setVal($('storyEditTextInput'), 'Hola historia');
    window.__wordredTest.addStoryEditText();
    window.__wordredTest.addStoryEditSticker('😀');
    window.__wordredTest.setStoryEditFilter('sepia');
    window.__wordredTest.setStoryEditBg('mar');
    await window.__wordredTest.publishStoryEdited();
    const editedStory = window.__wordredTest.getState().stories.find(s => s.author === '5511111111' && s.edits && s.edits.texts.length === 1);
    check('v1.2 historias: la historia guarda texto, sticker, filtro y fondo', !!editedStory && editedStory.edits.stickers.length === 1 && editedStory.edits.filter === 'sepia' && editedStory.edits.bg === 'mar');
    window.__wrOpenStory(editedStory.id);
    await tick();
    check('v1.2 historias: la historia personalizada se abre en Shorts (las historias salen de la fila de arriba en la 1.5.54)', !!editedStory && $('shortsOverlay') && $('shortsOverlay').classList.contains('on'));
    if ($('shortsOverlay') && $('shortsOverlay').classList.contains('on') && $('shortsClose')) click($('shortsClose'));
    window.__wordredTest.openStoryEditor({ src: 'video.mp4', type: 'video' }, 'Historia con video');
    check('v1.2 historias: con video también se abre el editor', $('videoEditorOverlay').classList.contains('on') || $('storyEditorOverlay').classList.contains('on'));
    window.__wordredTest.applyVideoEdits();
    await window.__wordredTest.publishStoryEdited();
    check('v1.2 historias: la historia con video se publica', window.__wordredTest.getState().stories.some(s => s.author === '5511111111' && s.mediaType === 'video'));
    // perfil con color, administradores, reporte, bloqueo y FAQ (ola 7)
    window.__wrEditProfile();
    const gradChip = q('#editGradientRow [data-gradient="atardecer"]');
    if (gradChip) gradChip.click();
    click($('editProfileSave'));
    check('v1.2 perfil: el color del perfil (degradado) se guarda', window.__wordredTest.getState().profiles['5511111111'].headerGradient === 'atardecer');
    // portada con video y avatar separado (ola 3)
    window.__wordredTest.core.completeProfile(st12, '5511111111', { name: 'Ana DOM', cover: 'content://com.wordred.app.fileprovider/media/portada.mp4', coverType: 'video' });
    window.__wordredTest.go('profile');
    check('v1.2 portada: la portada con video se reproduce en silencio en bucle', !!q('#ownProfile .cover video'));
    check('v1.2 portada: el avatar queda separado de la portada (no se monta sobre ella)', !q('#ownProfile .cover .avatar') && !!q('#ownProfile .profileHead .avatar'));
    const grp12 = window.__wordredTest.core.createGroup(st12, '5511111111', { name: 'Grupo Personal', desc: 'Prueba de personal' }).group;
    window.__wordredTest.core.joinGroup(st12, '1000000002', grp12.id);
    window.__wordredTest.core.joinGroup(st12, '1000000003', grp12.id);
    window.__wordredTest.core.addGroupAdmin(st12, '5511111111', grp12.id, '1000000002');
    window.__wrOpenGroup(grp12.id);
    check('v1.2 grupos: el administrador se ve con su insignia en el grupo', $('groupDetail').textContent.indexOf('Administrador') >= 0);
    check('v1.2 grupos: el creador puede hacer administrador a otro miembro', $('groupDetail').textContent.indexOf('Hacer administrador') >= 0);
    window.__wordredTest.openReport('1000000002');
    check('v1.2 reporte: reportar abre su pantalla con motivos', $('reportOverlay').classList.contains('on') && !!q('#reportReasons [data-reason="acoso"]'));
    const reasonBtn = q('#reportReasons [data-reason="acoso"]');
    if (reasonBtn) reasonBtn.click();
    click($('reportSubmit'));
    check('v1.2 reporte: el reporte queda registrado', window.__wordredTest.getState().reports.length === 1 && window.__wordredTest.getState().reports[0].reason === 'acoso');
    check('v1.2 reporte: tras reportar se ofrece bloquear', confirmShown());
    click($('confirmNo'));
    window.__wrOpenProfile('1000000002');
    const blockBtn = Array.from(qa('#profileDetail button')).find(b => b.textContent === 'Bloquear');
    check('v1.2 bloqueo: el perfil ofrece bloquear', !!blockBtn);
    if (blockBtn) blockBtn.click();
    check('v1.2 bloqueo: bloquear pide confirmación', confirmShown());
    click($('confirmYes'));
    check('v1.2 bloqueo: el bloqueado ya no se ve', window.__wordredTest.core.isBlockedBetween(st12, '5511111111', '1000000002'));
    window.__wrOpenProfile('1000000002');
    check('v1.2 bloqueo: el perfil bloqueado muestra "Perfil no disponible"', $('profileDetail').textContent.indexOf('Perfil no disponible') >= 0);
    window.__wrOpenSettings();
    check('v1.2 bloqueo: la lista de bloqueados está en Ajustes', $('blockedList').textContent.indexOf('Carlos') >= 0);
    check('v1.2 FAQ: hay preguntas con respuestas automáticas en su panel (la lista vive dentro del panel, no en Ajustes)', qa('#faqList .faqItem').length >= 10 && $('faqOverlay1543').contains($('faqList')) && !$('settingsOverlay').contains($('faqList')));
    const faqQ = q('#faqList .faqQ');
    if (faqQ) faqQ.click();
    check('v1.2 FAQ: tocar una pregunta muestra su respuesta', !!q('#faqList .faqItem.open'));
    click(q('[data-close="settingsOverlay"]'));
    window.__wrUnblockUser('1000000002');
    if (confirmShown()) click($('confirmYes'));
    check('v1.2 bloqueo: desbloquear devuelve todo', !window.__wordredTest.core.isBlockedBetween(st12, '5511111111', '1000000002'));
    // publicación de audio (ola 7)
    window.__wordredTest.core.createPost(st12, '5511111111', { text: 'Mi canción de prueba', media: 'data:audio/mpeg;base64,xxx', mediaType: 'audio', audioTitle: 'Mi canción', audioCover: '' });
    window.__wordredTest.go('feed');
    check('v1.2 audio: la publicación de audio tiene reproductor con volumen', !!q('#feed .audioPlayer') && q('#feed .audioPlayer').textContent.indexOf('Mi canción') >= 0 && !!q('#feed .audioPlayer input[type="range"]'));
    // anuncios de empresas e imágenes con canción (olas 8–9)
    window.__wordredTest.openAdCreate(pageId);
    setVal($('adTitle'), 'Oferta de tacos');
    setVal($('adText'), 'Ven por tus tacos');
    click($('adCreateSave'));
    window.__wordredTest.go('feed');
    check('v1.2 empresas: el anuncio sale en el feed marcado como "Anuncio"', !!q('#feed .adBadge') && q('#feed .adBadge').textContent.indexOf('Anuncio') >= 0);
    click($('composerOpen'));
    window.__wordredTest.setComposerSong({ id: 'cancion-1', title: 'Amanecer alegre', artist: 'Sol Naciente', mood: 'alegre' });
    check('v1.2 canciones: la canción elegida se ve en el publicador', $('postSongRow').textContent.indexOf('Amanecer alegre') >= 0);
    click(q('[data-close="composerOverlay"]'));
    if (confirmShown()) click($('confirmYes'));
    window.__wordredTest.core.createPost(st12, '5511111111', { text: 'Foto con canción', media: 'data:image/jpeg;base64,/9j/4AAQ', mediaType: 'image', song: { id: 'cancion-1', title: 'Amanecer alegre', artist: 'Sol Naciente', mood: 'alegre' } });
    window.__wordredTest.go('feed');
    const songAudio = q('#feed .post audio');
    check('v1.2 canciones: la imagen con canción solo tiene botón de sonido (sin autoplay ni reproducir)', !!q('#feed .post .songMuteBtn') && !!songAudio && !songAudio.hasAttribute('autoplay') && !songAudio.hasAttribute('controls'));
    // sugerencia inteligente (ola 8)
    click($('composerOpen'));
    setVal($('postText'), 'fiesta en la playa con amigos');
    // En jsdom no hay canvas para leer la foto desde el archivo; se siembra
    // el medio por el hook de pruebas (la lectura con canvas es del teléfono).
    window.__wordredTest.setComposerMediaList([{ src: 'data:image/jpeg;base64,/9j/4AAQ', type: 'image' }]);
    check('v1.2 canciones: la foto se agrega al publicador', !!$('postMediaPrev').querySelector('img'));
    // En la 1.5.43 ya no hay música automática: al agregar la foto no se
    // sugiere nada (la canción se elige a mano con «Cambiar»).
    check('v1.2 canciones: 1.5.43 ya no hay sugerencia automática (al agregar la foto no aparece ninguna canción)', $('postSongRow').classList.contains('hidden'));
    // La sugerencia en sí es la misma función que usa la app: con el texto
    // 'fiesta' sugiere una canción de fiesta (en jsdom la imagen no carga,
    // así que el análisis usa solo las palabras del texto, como en el teléfono
    // cuando la foto no se puede analizar).
    const sug = window.__wordredTest.core.suggestSongForImage([], 'fiesta en la playa con amigos');
    check('v1.2 canciones: el análisis sugiere una canción de fiesta para ese texto', !!sug && !!sug.song && sug.song.mood === 'fiesta', sug && sug.song ? sug.song.title : 'sin sugerencia');
    click(q('[data-close="composerOverlay"]'));
    if (confirmShown()) click($('confirmYes'));
    // edición de publicaciones (ola 10)
    window.__wrEditPost(richPostId);
    check('v1.2 edición: editar muestra cuántas ediciones quedan (5)', $('postEditLeft').textContent.indexOf('Te quedan 5 de 5 ediciones') >= 0, $('postEditLeft').textContent);
    setVal($('postText'), 'Texto editado fuerte');
    click($('postPublish'));
    check('v1.2 edición: la publicación editada muestra "Editado" y quedan 4', q('#feed .post[data-post="' + richPostId + '"]').textContent.indexOf('Editado') >= 0 && window.__wordredTest.getEditsLeft(richPostId) === 4);
    window.__wrEditListing(newListingId);
    check('v1.2 ventas: editar anuncio abre el formulario con sus datos', $('listingTitle').value.indexOf('Celular Samsung S23') >= 0);
    setVal($('listingPrice'), '8000');
    click($('listingPublish'));
    check('v1.2 ventas: cambiar el precio se actualiza para todos', window.__wordredTest.getState().listings.filter(l => l.id === newListingId)[0].price === 8000);
    window.__wrToggleSold(newListingId);
    check('v1.2 ventas: marcar vendido funciona', window.__wordredTest.getState().listings.filter(l => l.id === newListingId)[0].status === 'Vendido');
    // sin límite y editor de video (ola 11)
    window.__wordredTest.core.createPost(st12, '5511111111', { text: 'Veinte fotos sin límite', mediaList: Array.from({ length: 20 }, () => ({ src: 'data:image/jpeg;base64,/9j/4AAQ', type: 'image' })) });
    window.__wordredTest.go('feed');
    check('v1.2 sin límite: una publicación con 20 fotos muestra las 20', qa('#feed .post')[0].querySelectorAll('.medialist img').length === 20);
    window.__wordredTest.openVideoEditor('story', 0, 'video.mp4', { durationMs: 20000 });
    check('v1.2 editor: el editor de video se abre', $('videoEditorOverlay').classList.contains('on'));
    window.__wordredTest.setVideoEditTool('subtitle');
    setVal($('videoEditSubText'), 'Hola video');
    click($('videoEditSubAdd'));
    check('v1.2 editor: se agrega un subtítulo', window.__wordredTest.getVideoEdit().edits.subtitles.length === 1);
    window.__wordredTest.setVideoEditTool('music');
    check('v1.2 editor: en el editor de video no existe el botón de música automática (solo elegir y quitar)', !$('videoEditSongAuto') && !!$('videoEditSongPick') && !!$('videoEditSongRemove'));
    click($('videoEditSongPick'));
    click(q('#songPickerList [data-song-id]'));
    check('v1.2 editor: al elegir una canción a mano el video queda con música', !!window.__wordredTest.getVideoEdit().edits.song);
    click($('videoEditSongRemove'));
    check('v1.2 editor: quitar música deja el video sin música', !window.__wordredTest.getVideoEdit().edits.song);
    click($('videoEditSongPick'));
    click(q('#songPickerList [data-song-id]'));
    check('v1.2 editor: se puede volver a elegir una canción a mano', !!window.__wordredTest.getVideoEdit().edits.song);
    window.__wordredTest.setVideoEditTool('trim');
    setVal($('videoEditTrimStart'), '2');
    $('videoEditTrimStart').dispatchEvent(new window.Event('change', { bubbles: true }));
    setVal($('videoEditTrimEnd'), '8');
    $('videoEditTrimEnd').dispatchEvent(new window.Event('change', { bubbles: true }));
    window.__wordredTest.applyVideoEdits();
    const ved = window.__wordredTest.getVideoEdit().edits;
    check('v1.2 editor: al aplicar, el video queda con subtítulo, música y recorte', ved.subtitles.length === 1 && !!ved.song && ved.trimStart === 2000 && ved.trimEnd === 8000);
    click($('videoEditCancel'));
    // v1.3: conexión automática sin UI del servidor
    check('v1.3 auto: la dirección viene dentro de la app', window.__wordredTest.getServerBase() === 'https://wordred-server.onrender.com');
    check('v1.3 auto: la cola de pendientes y el envío siguen disponibles', typeof window.__wordredTest.flushPendingQueue === 'function' && typeof window.__wordredTest.pushStoryToServer === 'function' && typeof window.__wordredTest.getPendingQueue === 'function');
    // modo local silencioso: sin conexión no se muestra ningún error
    window.__wordredTest.setServerToken('');
    window.__wordredTest.resetAutoLink();
    const toastBefore = calls.toast.length;
    const realFetch = window.fetch;
    window.fetch = async () => { throw new Error('sin conexión'); };
    await window.__wordredTest.autoLinkServer();
    check('v1.3 auto: sin conexión no se vincula ni se muestra ningún error', window.__wordredTest.getServerToken() === '' && calls.toast.length === toastBefore);
    // al volver la conexión se vincula sola
    window.fetch = realFetch;
    window.__wordredTest.resetAutoLink();
    await window.__wordredTest.autoLinkServer();
    check('v1.3 auto: al volver la conexión se vincula sola', window.__wordredTest.getServerToken() === 'tok-dom-test');
    // el código por SMS también se verifica solo al llegar (con Twilio)
    window.__wordredTest.setServerToken('');
    window.__wordredTest.resetAutoLink();
    window.fetch = async (url) => {
      const u = String(url);
      const ok2 = (o) => ({ ok: true, status: 200, json: async () => o });
      if (u.includes('/api/auth/request-code')) return ok2({ ok: true, phone: '5511111111' });
      if (u.includes('/api/auth/verify')) return ok2({ ok: true, phone: '5511111111', token: 'tok-dom-test' });
      throw new Error('fetch fallido (sin servidor)');
    };
    await window.__wordredTest.autoLinkServer();
    check('v1.3 auto: sin código directo, la app espera el SMS', window.__wordredTest.getServerToken() === '');
    window.__onSmsCode('123456');
    await sleep(150);
    check('v1.3 auto: el código que llega por SMS se verifica solo', window.__wordredTest.getServerToken() === 'tok-dom-test');
    window.fetch = realFetch;
    // ningún texto visible habla del servidor
    window.__wrOpenSettings();
    check('v1.3 auto: ningún texto visible de la app menciona el servidor', !/servidor/i.test(window.document.body.textContent));
    click(q('[data-close="settingsOverlay"]'));
    // v1.4: archivos en el servidor, en vivo para todos
    check('v1.4: la barra de progreso existe y empieza oculta', !!$('mediaUploadBar') && $('mediaUploadBar').classList.contains('hidden'));
    // subir una foto de perfil (dataURL) al servidor por partes
    const photoUrl = await window.__wordredTest.uploadMediaItemToServer({ src: 'data:image/jpeg;base64,' + Buffer.from('FOTO-DOM').toString('base64'), type: 'image' });
    check('v1.4: la foto de perfil se sube y queda como URL del servidor', typeof photoUrl === 'string' && photoUrl === 'https://wordred-server.onrender.com/media/m_dom_1.jpg', String(photoUrl));
    check('v1.4: la subida por partes pasó por start, chunk y finish', calls.media.some(c => c.op === 'start') && calls.media.some(c => c.op === 'chunk') && calls.media.some(c => c.op === 'finish'));
    // un video content:// se lee por el puente y se sube igual
    const videoUrl = await window.__wordredTest.uploadMediaItemToServer({ src: 'content://com.wordred.app.fileprovider/media/test-video.mp4', type: 'video' });
    check('v1.4: el video local se lee por el puente y se sube al servidor', typeof videoUrl === 'string' && videoUrl.indexOf('https://wordred-server.onrender.com/media/') === 0, String(videoUrl));
    // publicar con foto: la foto se sube antes de publicar y queda la URL
    window.__wordredTest.setComposerMediaList([{ src: 'data:image/jpeg;base64,' + Buffer.from('FOTO-POST').toString('base64'), type: 'image' }]);
    setVal($('postText'), 'Publicación con foto en el servidor');
    click($('postPublish'));
    await waitFor(() => window.__wordredTest.getState().posts.some(p => p.text === 'Publicación con foto en el servidor'));
    const domPost = window.__wordredTest.getState().posts.filter(p => p.text === 'Publicación con foto en el servidor')[0];
    check('v1.4: al publicar, la foto queda con la URL del servidor', domPost && String(domPost.media).indexOf('https://wordred-server.onrender.com/media/') === 0, String(domPost && domPost.media));
    // el perfil se sube al servidor con su foto como URL
    window.__wordredTest.getState().profiles['5511111111'].photo = 'data:image/jpeg;base64,' + Buffer.from('FOTO-PERFIL-DOM').toString('base64');
    const profBefore = calls.profilePosts.length;
    await window.__wordredTest.pushProfileToServer();
    check('v1.4: al subir el perfil, la foto queda como URL del servidor', String(window.__wordredTest.getState().profiles['5511111111'].photo).indexOf('https://wordred-server.onrender.com/media/') === 0, String(window.__wordredTest.getState().profiles['5511111111'].photo));
    check('v1.4: el perfil se envió al servidor', calls.profilePosts.length > profBefore);
    // el cambio de perfil de otro teléfono llega en vivo por WebSocket
    window.__wordredTest.handleServerMessage({ kind: 'profile', profile: { phone: '5522222222', name: 'Bruno Prueba', photo: 'https://wordred-server.onrender.com/media/bruno.jpg', cover: '', createdAt: Date.now() } });
    check('v1.4: el perfil nuevo de otro teléfono se aplica en vivo sin reabrir nada', window.__wordredTest.getState().profiles['5522222222'] && window.__wordredTest.getState().profiles['5522222222'].photo === 'https://wordred-server.onrender.com/media/bruno.jpg');
    // cola offline: sin conexión, la foto queda en la cola y se sube al reconectar
    window.fetch = async () => { throw new Error('sin conexión'); };
    window.__wordredTest.getState().profiles['5511111111'].photo = 'data:image/jpeg;base64,' + Buffer.from('FOTO-SIN-CONEXION').toString('base64');
    await window.__wordredTest.pushProfileToServer();
    check('v1.4: sin conexión, la foto de perfil queda en la cola de pendientes', window.__wordredTest.getPendingQueue().some(i => i.kind === 'media-upload' && i.apply && i.apply.type === 'profile'));
    window.fetch = realFetch;
    await window.__wordredTest.flushPendingQueue();
    check('v1.4: al reconectar, la foto de la cola se sube y queda como URL', String(window.__wordredTest.getState().profiles['5511111111'].photo).indexOf('https://wordred-server.onrender.com/media/') === 0 && window.__wordredTest.getPendingQueue().length === 0, String(window.__wordredTest.getState().profiles['5511111111'].photo) + ' cola=' + window.__wordredTest.getPendingQueue().length);
    // respaldo local: sin sesión en el servidor no se sube nada y lo local sigue
    window.__wordredTest.setServerToken('');
    const noUp = await window.__wordredTest.uploadMediaItemToServer({ src: 'data:image/jpeg;base64,AAA', type: 'image' });
    check('v1.4: sin sesión en el servidor no se sube nada y lo local sigue', noUp === null, String(noUp));
    window.__wordredTest.setServerToken('tok-dom-test');
    // ---- v1.5: llamadas reales, visto, escribiendo, comentarios, avisos y bloqueo ----
    const T = window.__wordredTest;
    const cs = (el) => window.getComputedStyle(el);
    // llamada real: marca el número correcto y suena el tono
    // v1.6: este bloque prueba la llamada por Telecom, que solo ocurre
    // cuando WordRed es el marcador predeterminado; si no lo es, la
    // llamada la hace la app de teléfono del sistema y WordRed no
    // muestra la pantalla "Llamando" (nunca recibiría su estado).
    window.AndroidBridge.isDefaultDialer = () => 'true';
    calls.dialed.length = 0; calls.ringback.length = 0;
    T.placePhoneCall('5522222222');
    check('v1.5: la llamada real marca el número correcto', calls.dialed[0] === '5522222222', JSON.stringify(calls.dialed));
    check('v1.5: al marcar suena el tono de llamada', T.getCallSounds().ringback === true && calls.ringback.indexOf('start') >= 0, JSON.stringify(calls.ringback));
    check('v1.5: la pantalla dice que es una llamada telefónica real', ($('phoneCallType') && $('phoneCallType').textContent.indexOf('red de tu teléfono') >= 0) || $('phoneCallState').textContent.indexOf('teléfono') >= 0, $('phoneCallState').textContent);
    // altavoz en la llamada real: estado visible y ruta de audio real
    T.onTelecomCall('active', '5522222222');
    check('v1.5: el altavoz empieza apagado y dice "Altavoz"', !$('phoneCallSpeakerBtn').classList.contains('on') && $('phoneCallSpeakerBtn').textContent.indexOf('Altavoz activado') < 0);
    click($('phoneCallSpeakerBtn'));
    check('v1.5: al activar el altavoz se ve activado y cambia la ruta de audio', $('phoneCallSpeakerBtn').classList.contains('on') && $('phoneCallSpeakerBtn').textContent.indexOf('Altavoz activado') >= 0 && calls.speakerphone.indexOf(true) >= 0, $('phoneCallSpeakerBtn').textContent);
    click($('phoneCallSpeakerBtn'));
    check('v1.5: al apagar el altavoz vuelve a su estado normal', !$('phoneCallSpeakerBtn').classList.contains('on') && $('phoneCallSpeakerBtn').textContent.indexOf('Altavoz activado') < 0);
    // botones de llamada más grandes (estilos calculados)
    check('v1.5: los botones de la llamada real miden al menos 76 px', parseInt(cs($('phoneCallSpeakerBtn')).width) >= 76, cs($('phoneCallSpeakerBtn')).width);
    check('v1.5: el botón de colgar de la llamada real mide al menos 84 px', parseInt(cs($('phoneCallHangBtn')).width) >= 84, cs($('phoneCallHangBtn')).width);
    click($('phoneCallHangBtn'));
    check('v1.5: al colgar se para el tono', T.getCallSounds().ringback === false && calls.ringback.indexOf('stop') >= 0, JSON.stringify(calls.ringback));
    window.AndroidBridge.isDefaultDialer = () => false;
    // altavoz dentro de la app y tamaño de sus botones
    T.getCall().state = 'in-call'; T.getCall().peer = '5522222222'; T.renderCallInCall();
    check('v1.5: el botón de altavoz dentro de la app mide al menos 84x76 px', parseInt(cs($('callSpeakerBtn')).minWidth) >= 84 && parseInt(cs($('callSpeakerBtn')).minHeight) >= 76, cs($('callSpeakerBtn')).minWidth + 'x' + cs($('callSpeakerBtn')).minHeight);
    click($('callSpeakerBtn'));
    check('v1.5: el altavoz dentro de la app se ve activado', $('callSpeakerBtn').classList.contains('on') && $('callSpeakerBtn').textContent.indexOf('Altavoz activado') >= 0);
    click($('callSpeakerBtn'));
    check('v1.5: el altavoz dentro de la app se apaga', !$('callSpeakerBtn').classList.contains('on'));
    T.endCall(true);
    // ---- v1.6: llamadas que sí se realizan (regresión del bug
    // "solo sale Llamando pero no llama") y live sin falso "sin red" ----
    // (a) llamada real por Telecom: si el servicio de llamadas no
    // confirma ningún estado, no se queda en "Llamando" para siempre.
    window.AndroidBridge.isDefaultDialer = () => 'true';
    if (typeof T.setTelecomWatchdogMs === 'function') T.setTelecomWatchdogMs(60);
    $('toast').textContent = '';
    calls.ringback.length = 0;
    T.placePhoneCall('5522222222');
    check('v1.6: al marcar por teléfono se ve "Llamando por teléfono"', $('phoneCallOverlay').classList.contains('on') && $('phoneCallState').textContent.indexOf('Llamando por teléfono') >= 0, $('phoneCallState').textContent);
    await sleep(200);
    check('v1.6: sin confirmación del teléfono, la llamada no se queda en "Llamando": avisa y se cierra', !$('phoneCallOverlay').classList.contains('on') && $('toast').textContent.indexOf('No se pudo realizar la llamada') >= 0, 'overlay=' + $('phoneCallOverlay').classList.contains('on') + ' toast=' + $('toast').textContent);
    check('v1.6: al fallar la llamada se para el tono', T.getCallSounds().ringback === false && calls.ringback.indexOf('stop') >= 0, JSON.stringify(calls.ringback));
    // (b) si el estado real llega a tiempo, no hay error falso.
    $('toast').textContent = '';
    calls.ringback.length = 0;
    T.placePhoneCall('5522222222');
    T.onTelecomCall('dialing', '5522222222');
    await sleep(200);
    check('v1.6: con el estado real del teléfono no hay error falso', $('phoneCallOverlay').classList.contains('on') && $('toast').textContent.indexOf('No se pudo realizar la llamada') < 0, 'overlay=' + $('phoneCallOverlay').classList.contains('on') + ' toast=' + $('toast').textContent);
    T.onTelecomCall('active', '5522222222');
    check('v1.6: al contestar se para el tono y la llamada sigue en curso', T.getCallSounds().ringback === false && $('phoneCallState').textContent.indexOf('en curso') >= 0, $('phoneCallState').textContent);
    click($('phoneCallHangBtn'));
    check('v1.6: al colgar la llamada real se cierra la pantalla', !$('phoneCallOverlay').classList.contains('on'));
    if (typeof T.setTelecomWatchdogMs === 'function') T.setTelecomWatchdogMs(6000);
    // (c) sin ser el marcador predeterminado, la llamada la hace la app
    // de teléfono del sistema: WordRed NO muestra su "Llamando".
    window.AndroidBridge.isDefaultDialer = () => false;
    $('toast').textContent = '';
    T.placePhoneCall('5522222222');
    check('v1.6: sin ser el marcador, no se muestra la pantalla "Llamando" de WordRed', !$('phoneCallOverlay').classList.contains('on') && $('toast').textContent.indexOf('app de teléfono') >= 0, 'overlay=' + $('phoneCallOverlay').classList.contains('on') + ' toast=' + $('toast').textContent);
    // (d) sin permiso de llamada, se pide el permiso y se avisa claro.
    calls.phonePermReq = 0;
    window.AndroidBridge.dialNumber = (n) => { calls.dialed.push(n); return 'ERROR:PERMISO:sin permiso para llamar'; };
    $('toast').textContent = '';
    T.placePhoneCall('5522222222');
    check('v1.6: sin permiso se avisa y se pide el permiso (sin "Llamando" falso)', !$('phoneCallOverlay').classList.contains('on') && $('toast').textContent.indexOf('permiso') >= 0 && calls.phonePermReq >= 1, 'toast=' + $('toast').textContent + ' req=' + calls.phonePermReq);
    window.AndroidBridge.dialNumber = (n) => { calls.dialed.push(n); return window.AndroidBridge.isDefaultDialer() === 'true' ? 'OK' : 'OK:SYSTEM'; };
    // (e) el número se normaliza antes de marcar.
    window.AndroidBridge.isDefaultDialer = () => 'true';
    calls.dialed.length = 0;
    T.placePhoneCall('55 1234-5678');
    check('v1.6: el número se marca sin espacios ni guiones', calls.dialed[0] === '5512345678', JSON.stringify(calls.dialed));
    T.onTelecomCall('ended', '5512345678');
    window.AndroidBridge.isDefaultDialer = () => false;
    // (f) llamada de WordRed: si el otro no contesta, no se queda en
    // "Llamando" para siempre.
    if (typeof T.setCallRingMs === 'function') T.setCallRingMs(60);
    T.setServerConnected(true);
    $('toast').textContent = '';
    await T.startCall('5522222222');
    check('v1.6: la llamada de WordRed muestra "Llamando por WordRed" mientras suena', T.getCallState() === 'calling' && $('callOverlay').classList.contains('on') && $('callBody').textContent.indexOf('Llamando por WordRed') >= 0, T.getCallState());
    await sleep(200);
    check('v1.6: si el otro no contesta, la llamada termina con "No contesta"', T.getCallState() === 'idle' && !$('callOverlay').classList.contains('on') && $('toast').textContent.indexOf('No contesta') >= 0, 'estado=' + T.getCallState() + ' toast=' + $('toast').textContent);
    if (typeof T.setCallRingMs === 'function') T.setCallRingMs(30000);
    // (g) llamada de WordRed: si el otro no está en línea, avisa
    // "No disponible" y termina (no "Llamando" infinito).
    calls.callSignalFail = true;
    $('toast').textContent = '';
    await T.startCall('5522222222');
    await sleep(150);
    check('v1.6: con el otro fuera de línea, la llamada avisa "No disponible" y termina', T.getCallState() === 'idle' && $('toast').textContent.indexOf('No disponible') >= 0, 'estado=' + T.getCallState() + ' toast=' + $('toast').textContent);
    calls.callSignalFail = false;
    T.setServerConnected(false);
    T.endCall(true); // limpieza: la llamada de la prueba no contamina el resto
    // (h) live: con la sesión vencida, la app se vincula sola y el live
    // arranca (sin el falso "necesitas conexión").
    const tokBeforeLive = T.getServerToken();
    T.setServerToken('');
    T.resetAutoLink();
    const realFetchLive = window.fetch;
    let liveAttempts = 0;
    window.fetch = async (url, opts) => {
      const u = String(url);
      if (u.includes('/api/lives') && opts && opts.method === 'POST') {
        liveAttempts++;
        if (liveAttempts === 1) return { ok: false, status: 401, json: async () => ({ ok: false, error: 'Sesión vencida' }) };
      }
      return realFetchLive(url, opts);
    };
    window.__wrOpenLiveStart();
    setVal($('liveTitleInput'), 'Live con sesión renovada');
    $('toast').textContent = '';
    await T.startLive();
    window.fetch = realFetchLive;
    check('v1.6 lives: con la sesión vencida, el live se vincula solo y arranca', T.getCurrentLive() !== null && liveAttempts === 2 && $('toast').textContent.indexOf('necesitas conexión') < 0, 'intentos=' + liveAttempts + ' toast=' + $('toast').textContent);
    T.setServerToken(tokBeforeLive || 'tok-dom-test');
    if (T.getCurrentLive() !== null) { click($('liveEndBtn')); await waitFor(() => T.getCurrentLive() === null); }
    // (i) live: sin internet de verdad, el mensaje dice que falta
    // internet (y no el genérico "necesitas conexión").
    const realFetchNet = window.fetch;
    window.fetch = async () => { throw new Error('sin conexión'); };
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    window.__wrOpenLiveStart();
    $('toast').textContent = '';
    await T.startLive();
    window.fetch = realFetchNet;
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    check('v1.6 lives: sin internet, el live dice que falta internet', T.getCurrentLive() === null && $('toast').textContent.indexOf('internet') >= 0, $('toast').textContent);
    // visto con hora: se envía, el otro lo lee y aparece "Visto" con la hora
    window.__wrOpenChat('5522222222');
    setVal($('chatText'), 'Hola Bruno, ¿qué tal?');
    click($('chatSend'));
    await waitFor(() => T.getState().conversations[T.core.convoKey('5511111111', '5522222222')] && T.getState().conversations[T.core.convoKey('5511111111', '5522222222')].messages.some(m => m.text === 'Hola Bruno, ¿qué tal?'));
    const sentMsg = T.getState().conversations[T.core.convoKey('5511111111', '5522222222')].messages.filter(m => m.text === 'Hola Bruno, ¿qué tal?')[0];
    check('v1.5: el mensaje enviado muestra "Enviado" antes de que lo lean', $('chatMsgs').textContent.indexOf('Enviado') >= 0);
    const readAt = Date.now();
    T.handleServerMessage({ kind: 'read', from: '5522222222', to: '5511111111', at: readAt, messageIds: [sentMsg.id] });
    check('v1.5: al leerlo el otro, aparece "Visto" con la hora', $('chatMsgs').textContent.indexOf('Visto') >= 0 && $('chatMsgs').textContent.indexOf(T.core.formatTime(readAt)) >= 0, $('chatMsgs').textContent.slice(-120));
    // escribiendo: aparece en el chat y en la lista, y se apaga solo
    T.setTypingClearMs(60);
    T.handleTyping('5522222222', true);
    check('v1.5: "Escribiendo…" se ve en el chat', !$('chatTyping').classList.contains('hidden'));
    T.go('messages');
    check('v1.5: "Escribiendo…" se ve en la lista de conversaciones', window.document.body.textContent.indexOf('Escribiendo…') >= 0);
    await new Promise((r) => setTimeout(r, 200));
    check('v1.5: "Escribiendo…" se apaga solo a los pocos segundos sin escribir', $('chatTyping').classList.contains('hidden'));
    T.handleTyping('5522222222', true);
    T.handleTyping('5522222222', false);
    check('v1.5: al dejar de escribir se apaga al momento', $('chatTyping').classList.contains('hidden'));
    T.sendTyping(true);
    check('v1.5: avisar que escribo no rompe nada sin conexión', true);
    T.setTypingClearMs(4000);
    // comentarios: contador con respuestas, vista con responder y compartir, en vivo
    const cpost = T.core.createPost(T.getState(), '5511111111', { text: 'Publicación v1.5 para comentarios' });
    check('v1.5: la publicación de prueba se crea', cpost.ok);
    const pid = cpost.post.id;
    const cm1 = T.core.addComment(T.getState(), '5522222222', pid, 'Qué buena publicación');
    const cm2 = T.core.addComment(T.getState(), '5511111111', pid, 'Gracias, Bruno', cm1.comment.id);
    check('v1.5: el contador incluye las respuestas', T.core.commentCount(cpost.post) === 2, String(T.core.commentCount(cpost.post)));
    T.go('feed');
    check('v1.5: en el feed se ve el número de comentarios con el icono', (function () { const b = q('#feed .post[data-post="' + pid + '"] .actions button[aria-label="Comentar"]'); return b && b.querySelector('.cnt') && b.querySelector('.cnt').textContent === '2'; })());
    window.__wrOpenPost(pid);
    check('v1.5: la vista de comentarios muestra Responder y Compartir en cada comentario', !!q('#postDetail .comment .commentRail button[aria-label="Responder"]') && !!q('#postDetail .comment .commentRail button[aria-label="Compartir"]'));
    window.__wrReplyTo(cm1.comment.id);
    check('v1.5: Responder abre el formulario de respuesta en hilo', !$('reply-' + cm1.comment.id).classList.contains('hidden'));
    const postsBefore = T.getState().posts.length;
    T.shareComment(pid, cm1.comment.id, 'in');
    check('v1.5: compartir dentro de WordRed publica el comentario citado', T.getState().posts.length === postsBefore + 1 && T.getState().posts.some(p => p.text.indexOf('Qué buena publicación') >= 0 && p.text.indexOf('Bruno') >= 0));
    calls.shared.length = 0;
    T.shareComment(pid, cm1.comment.id, 'out');
    check('v1.5: compartir fuera usa la hoja de compartir del sistema', calls.shared.length > 0 && String(calls.shared[calls.shared.length - 1].text).indexOf('Qué buena publicación') >= 0, JSON.stringify(calls.shared));
    T.handleServerMessage({ kind: 'comment', postId: pid, commentCount: 3, comment: { id: 'cmt_live', author: '5522222222', text: 'Otro comentario en vivo', createdAt: Date.now(), replies: [] } });
    check('v1.5: el contador se actualiza en vivo sin recargar', T.core.commentCount(cpost.post) === 3 && (function () { const b = q('#postDetail .post .actions button[aria-label="Comentar"]'); return b && b.querySelector('.cnt') && b.querySelector('.cnt').textContent === '3'; })(), String(T.core.commentCount(cpost.post)));
    // avisos fuera de la app: por tipo, con destino correcto
    T.getState().profiles['5533333333'] = { phone: '5533333333', name: 'Carla Prueba', createdAt: Date.now() };
    window.__wrOpenChat('5533333333');
    T.setAppHidden(true);
    calls.notifications.length = 0;
    T.handleServerMessage({ kind: 'message', message: { id: 'msg_n1', from: '5522222222', to: '5511111111', text: 'Hola, ¿estás?', createdAt: Date.now(), readBy: ['5522222222'], readAt: null } });
    check('v1.5: mensaje con la app cerrada avisa y lleva a ese chat', calls.notifications.length === 1 && String(calls.notifications[0].target).indexOf('"kind":"chat"') >= 0 && String(calls.notifications[0].target).indexOf('5522222222') >= 0, JSON.stringify(calls.notifications));
    T.setAppHidden(false);
    calls.notifications.length = 0;
    T.handleServerMessage({ kind: 'message', message: { id: 'msg_n2', from: '5522222222', to: '5511111111', text: 'Otro mensaje', createdAt: Date.now(), readBy: ['5522222222'], readAt: null } });
    check('v1.5: con la app abierta no se avisa fuera de la app', calls.notifications.length === 0, JSON.stringify(calls.notifications));
    T.getState().settings.notifMessages = false;
    T.setAppHidden(true);
    calls.notifications.length = 0;
    T.handleServerMessage({ kind: 'message', message: { id: 'msg_n3', from: '5522222222', to: '5511111111', text: 'Mensaje con aviso apagado', createdAt: Date.now(), readBy: ['5522222222'], readAt: null } });
    check('v1.5: con el aviso de mensajes apagado no se avisa', calls.notifications.length === 0, JSON.stringify(calls.notifications));
    T.getState().settings.notifMessages = true;
    // llamada entrante: aviso con Contestar y Rechazar
    T.endCall(true);
    calls.notifications.length = 0;
    T.handleServerMessage({ kind: 'call', from: '5522222222', type: 'offer', payload: { withVideo: false } });
    check('v1.5: la llamada entrante avisa con Contestar y Rechazar', calls.notifications.length >= 1 && String(calls.notifications[0].target).indexOf('"kind":"call"') >= 0 && String(calls.notifications[0].actions).indexOf('Contestar') >= 0 && String(calls.notifications[0].actions).indexOf('Rechazar') >= 0, JSON.stringify(calls.notifications));
    check('v1.5: la llamada entrante suena', T.getCallSounds().incoming === true && calls.incomingRing.indexOf('start') >= 0);
    T.onCallAction('reject', '5522222222');
    check('v1.5: Rechazar desde el aviso cuelga la llamada', T.getCallState() === 'idle' && T.getCallSounds().incoming === false);
    T.onCallAction('answer', '5533333333');
    check('v1.5: Contestar sin llamada entrante abre ese chat', !$('chatOverlay').classList.contains('hidden') && $('chatHead').textContent.indexOf('Carla') >= 0);
    // comentario en mi publicación y pregunta por mi anuncio
    calls.notifications.length = 0;
    T.handleServerMessage({ kind: 'comment', postId: pid, commentCount: 4, comment: { id: 'cmt_n2', author: '5522222222', text: 'Te comento tu publicación', createdAt: Date.now(), replies: [] } });
    check('v1.5: el comentario en mi publicación avisa y abre los comentarios', calls.notifications.some(n => String(n.target).indexOf('"kind":"post"') >= 0 && String(n.target).indexOf(pid) >= 0), JSON.stringify(calls.notifications));
    calls.notifications.length = 0;
    T.handleServerMessage({ kind: 'message', message: { id: 'msg_n4', from: '5522222222', to: '5511111111', text: 'Hola, ¿sigue disponible?', createdAt: Date.now(), readBy: ['5522222222'], readAt: null, listing: { id: 'lst_1', title: 'Bicicleta en venta' } } });
    check('v1.5: la pregunta por mi anuncio avisa con su título', calls.notifications.some(n => String(n.t).indexOf('Pregunta por tu anuncio') >= 0 && String(n.x).indexOf('Bicicleta en venta') >= 0), JSON.stringify(calls.notifications));
    // destino al tocar un aviso
    T.onNotifTarget({ kind: 'chat', phone: '5522222222' });
    check('v1.5: tocar el aviso de mensaje abre ese chat', !$('chatOverlay').classList.contains('hidden') && $('chatHead').textContent.indexOf('Bruno') >= 0);
    T.onNotifTarget({ kind: 'post', id: pid });
    check('v1.5: tocar el aviso de comentario abre esa publicación', !$('postOverlay').classList.contains('hidden') && $('postDetail').textContent.indexOf('Publicación v1.5') >= 0);
    T.onNotifTarget({ kind: 'home' });
    check('v1.5: tocar la invitación abre el inicio', true);
    T.setAppHidden(false);
    // invitación ocasional: solo con actividad sin leer, máx. 1 al día, nunca activa
    T.renderNotifPrefs();
    check('v1.5: los ajustes tienen los nuevos tipos de aviso', $('notifPrefs').textContent.indexOf('Llamadas dentro de WordRed') >= 0 && $('notifPrefs').textContent.indexOf('Preguntas por mis anuncios') >= 0 && $('notifPrefs').textContent.indexOf('Invitaciones para volver') >= 0);
    check('v1.5: la regla de invitación exige actividad sin leer', T.core.reengageDue({ notifReengage: true, reengageLast: 0 }, 0, Date.now()).due === false && T.core.reengageDue({ notifReengage: true, reengageLast: 0 }, 3, Date.now()).due === true);
    check('v1.5: la regla de invitación se apaga en ajustes', T.core.reengageDue({ notifReengage: false, reengageLast: 0 }, 3, Date.now()).due === false);
    check('v1.5: la regla de invitación permite como mucho una al día', T.core.reengageDue({ notifReengage: true, reengageLast: Date.now() - 1000 }, 3, Date.now()).due === false && T.core.reengageDue({ notifReengage: true, reengageLast: Date.now() - 25 * 60 * 60 * 1000 }, 3, Date.now()).due === true);
    T.setAppHidden(true);
    calls.reengage.length = 0; calls.reengageLast = 0;
    T.maybeScheduleReengage();
    check('v1.5: con actividad sin leer se programa la invitación', calls.reengage.some(r => r.ms === 4 * 60 * 60 * 1000), JSON.stringify(calls.reengage));
    calls.reengage.length = 0; calls.reengageLast = Date.now();
    T.maybeScheduleReengage();
    check('v1.5: si ya se invitó hoy no se programa otra', calls.reengage.length === 0, JSON.stringify(calls.reengage));
    calls.reengage.length = 0; calls.reengageLast = 0;
    T.setAppHidden(false);
    T.maybeScheduleReengage();
    check('v1.5: con la app activa no se programa la invitación', calls.reengage.length === 0, JSON.stringify(calls.reengage));
    T.setAppHidden(true);
    // bloqueo de la app: se activa, desactivarlo exige autenticarse
    window.__wrOpenSettings();
    check('v1.5: el interruptor de bloqueo existe en ajustes', !!$('appLockToggle'));
    click($('appLockToggle'));
    await waitFor(() => T.getAppLock() === true);
    check('v1.5: el bloqueo se activa con la huella', T.getAppLock() === true && $('appLockToggle').checked === true);
    calls.lockFailNext = true;
    click($('appLockToggle'));
    await new Promise((r) => setTimeout(r, 50));
    check('v1.5: si la autenticación falla al desactivar, el bloqueo sigue', T.getAppLock() === true && $('appLockToggle').checked === true);
    click($('appLockToggle'));
    await waitFor(() => T.getAppLock() === false);
    check('v1.5: con la autenticación correcta el bloqueo se desactiva', T.getAppLock() === false && $('appLockToggle').checked === false);
    click(q('[data-close="settingsOverlay"]'));
    // ---- v1.5 lives ----
    T.renderNotifPrefs();
    check('v1.5 lives: los ajustes tienen el aviso de lives', $('notifPrefs').textContent.indexOf('Transmisiones en vivo') >= 0);
    click(q('#bottomNav button[data-nav="profile"]'));
    check('v1.5 lives: el perfil propio tiene el botón de transmitir en vivo (1.5.30: solo con símbolo, en la fila superior)', !!window.document.querySelector('#ownProfile button[aria-label="Transmitir en vivo"]'));
    window.__wrOpenLiveStart();
    check('v1.5 lives: se abre el diálogo para empezar el live', $('liveStartOverlay').classList.contains('on'));
    setVal($('liveTitleInput'), 'Mi primer live');
    click($('liveStartBtn'));
    await waitFor(() => T.getCurrentLive() !== null);
    check('v1.5 lives: el live se crea y se abre como transmisor', T.getCurrentLive() && T.getCurrentLive().host === '5511111111' && T.getLiveRole() === 'host' && $('liveOverlay').classList.contains('on'));
    check('v1.5 lives: el transmisor ve su cámara y el botón de terminar', !!$('liveVideo') && !$('liveEndBtn').classList.contains('hidden'));
    check('v1.5 lives: mi live aparece arriba con EN VIVO', !$('liveRow').classList.contains('hidden') && $('liveRow').textContent.indexOf('EN VIVO') >= 0 && $('liveRow').textContent.indexOf('Tu live') >= 0);
    T.handleLiveSignal({ kind: 'live-signal', from: '5522222222', type: 'offer', payload: { type: 'offer', sdp: 'falso' }, liveId: 'live_dom_1' });
    await sleep(100);
    check('v1.5 lives: el transmisor responde a la oferta del espectador (malla WebRTC)', !!T.getLivePcs()['5522222222']);
    click($('liveEndBtn'));
    await waitFor(() => T.getCurrentLive() === null);
    check('v1.5 lives: terminar el live lo cierra y lo quita de la fila', !$('liveOverlay').classList.contains('on') && $('liveRow').textContent.indexOf('Tu live') < 0 && $('liveRow').classList.contains('hidden'));
    T.setAppHidden(true);
    calls.notifications.length = 0;
    T.handleLiveEvent({ kind: 'live', event: 'started', live: { id: 'live_dom_2', host: '5522222222', title: 'Live de Bruno', createdAt: Date.now(), viewers: [], viewerCount: 0, chat: [], reactions: {} } });
    check('v1.5 lives: el live de otro aparece arriba con EN VIVO', !$('liveRow').classList.contains('hidden') && $('liveRow').textContent.indexOf('EN VIVO') >= 0 && $('liveRow').textContent.indexOf('Bruno') >= 0);
    check('v1.5 lives: a los seguidores les llega el aviso del live', calls.notifications.some(n => String(n.t).indexOf('está en vivo') >= 0 && String(n.target).indexOf('"kind":"live"') >= 0), JSON.stringify(calls.notifications));
    T.setAppHidden(false);
    await T.joinLive('live_dom_2');
    check('v1.5 lives: entrar al live abre el video y el chat', T.getCurrentLive() && T.getCurrentLive().id === 'live_dom_2' && T.getLiveRole() === 'viewer' && $('liveOverlay').classList.contains('on'));
    check('v1.5 lives: se ve el contador de espectadores', $('liveViewerCount').textContent.indexOf('1 espectador') >= 0, $('liveViewerCount').textContent);
    setVal($('liveChatInput'), 'Hola desde el chat del live');
    click($('liveChatSend'));
    T.handleLiveEvent({ kind: 'live', event: 'chat', liveId: 'live_dom_2', message: { id: 'lmsg_dom_2', author: '5522222222', text: '¡Bienvenidos a mi live!', createdAt: Date.now() } });
    check('v1.5 lives: los mensajes del chat del live se ven en tiempo real con autor y hora', $('liveChatList').textContent.indexOf('¡Bienvenidos a mi live!') >= 0 && $('liveChatList').textContent.indexOf('Bruno') >= 0 && /\d{1,2}:\d{2}/.test($('liveChatList').textContent), $('liveChatList').textContent);
    T.handleLiveEvent({ kind: 'live', event: 'viewers', liveId: 'live_dom_2', viewerCount: 3, viewers: ['5511111111', '5533333333', '5544444444'] });
    check('v1.5 lives: el contador de espectadores se actualiza en vivo', $('liveViewerCount').textContent.indexOf('3 espectadores') >= 0, $('liveViewerCount').textContent);
    // likes en vivo: botón, corazones flotantes y contador en tiempo real
    check('v1.5 lives: el botón de like con su contador está en el live', !!$('liveLikeBtn') && $('liveLikeBtn').textContent.indexOf('Me gusta') >= 0 && !!$('liveLikeCount'));
    click($('liveLikeBtn'));
    await waitFor(() => T.getLiveLikes() === 1);
    check('v1.5 lives: dar like suma al contador', T.getLiveLikes() === 1 && $('liveLikeCount').textContent.indexOf('1 like') >= 0, $('liveLikeCount').textContent);
    check('v1.5 lives: al dar like salen corazones flotantes', !!q('#liveHearts .liveHeart'), $('liveHearts').innerHTML);
    T.handleLiveEvent({ kind: 'live', event: 'like', liveId: 'live_dom_2', likes: 7, from: '5522222222' });
    check('v1.5 lives: el contador de likes se actualiza en vivo para todos', T.getLiveLikes() === 7 && $('liveLikeCount').textContent.indexOf('7 likes') >= 0, $('liveLikeCount').textContent);
    check('v1.5 lives: el like de otro también muestra corazones flotantes', !!q('#liveHearts .liveHeart'));
    // compartir el live: dentro (aviso con botón para entrar) y fuera
    calls.shared.length = 0;
    click($('liveShareBtn'));
    await waitFor(() => $('feed').textContent.indexOf('Ver live en vivo') >= 0);
    check('v1.5 lives: compartir el live publica un aviso con botón para entrar', $('feed').textContent.indexOf('Ver live en vivo') >= 0 && $('feed').textContent.indexOf('Live de Bruno') >= 0, $('feed').textContent);
    check('v1.5 lives: al compartir se ofrece compartirlo fuera', confirmShown() && $('confirmTitle').textContent.indexOf('Compartir live') >= 0);
    click($('confirmYes'));
    await waitFor(() => calls.shared.length > 0);
    check('v1.5 lives: compartir fuera lleva título, quién transmite y la invitación', calls.shared.some(function (s) { return String(s.text || '').indexOf('Live de Bruno') >= 0 && String(s.text || '').indexOf('Bruno') >= 0 && String(s.text || '').indexOf('WordRed') >= 0; }), JSON.stringify(calls.shared));
    click($('liveLeaveBtn'));
    await waitFor(() => T.getCurrentLive() === null);
    check('v1.5 lives: salir del live lo cierra', !$('liveOverlay').classList.contains('on'));
    const liveJoinBtn = q('#feed [onclick*="__wrJoinLive"]');
    check('v1.5 lives: el aviso del live en el muro tiene botón para entrar', !!liveJoinBtn);
    click(liveJoinBtn);
    await waitFor(() => T.getCurrentLive() !== null);
    check('v1.5 lives: tocar el aviso del muro entra al live', T.getCurrentLive() && T.getCurrentLive().id === 'live_dom_2');
    await T.leaveLive();
    T.handleLiveEvent({ kind: 'live', event: 'ended', liveId: 'live_dom_2' });
    check('v1.5 lives: al terminar, el live desaparece de la fila', $('liveRow').textContent.indexOf('Bruno') < 0 && $('liveRow').classList.contains('hidden'));
    T.handleLiveEvent({ kind: 'live', event: 'started', live: { id: 'live_dom_2', host: '5522222222', title: 'Live de Bruno', createdAt: Date.now(), viewers: [], viewerCount: 0, chat: [], reactions: {} } });
    T.onNotifTarget({ kind: 'live', id: 'live_dom_2' });
    await waitFor(() => T.getCurrentLive() !== null);
    check('v1.5 lives: tocar el aviso entra al live', T.getCurrentLive() && T.getCurrentLive().id === 'live_dom_2');
    await T.leaveLive();
    // ---- v1.7 lives: cámara, zoom, filtros, pantalla y grabación ----
    // Stubs de cámara/canvas/grabación para el live (jsdom no tiene
    // MediaStream, MediaRecorder ni canvas 2d: se simulan aquí).
    function fakeTrack17(kind, facing) {
      return { kind: kind, label: kind === 'video' ? (facing === 'environment' ? 'Cámara trasera' : 'Cámara frontal') : 'Micrófono', enabled: true, readyState: 'live',
        stop: function () { this.readyState = 'ended'; },
        getCapabilities: function () { return kind === 'video' ? { zoom: { min: 1, max: 4, step: 0.5 }, facingMode: ['user', 'environment'] } : {}; },
        getSettings: function () { return kind === 'video' ? { width: 640, height: 360, facingMode: facing || 'user' } : {}; },
        applyConstraints: async function () { return; } };
    }
    function fakeStream17(facing) {
      var tracks = [fakeTrack17('video', facing), fakeTrack17('audio')];
      return { getTracks: function () { return tracks.slice(); },
        getVideoTracks: function () { return tracks.filter(function (t) { return t.kind === 'video'; }); },
        getAudioTracks: function () { return tracks.filter(function (t) { return t.kind === 'audio'; }); },
        addTrack: function (t) { tracks.push(t); },
        removeTrack: function (t) { tracks = tracks.filter(function (x) { return x !== t; }); } };
    }
    // v1.8: la cámara simulada respeta lo que se pide (deviceId, facingMode
    // exact o sin exact) y dice su cara real en getSettings, como un teléfono.
    window.navigator.mediaDevices.enumerateDevices = async function () {
      return [
        { kind: 'videoinput', deviceId: 'cam-front', label: 'Cámara frontal', groupId: '' },
        { kind: 'videoinput', deviceId: 'cam-back', label: 'Cámara trasera', groupId: '' },
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Micrófono', groupId: '' }
      ];
    };
    window.navigator.mediaDevices.getUserMedia = async function (constraints) {
      var v = constraints && constraints.video;
      var facing = 'user';
      if (v && typeof v === 'object') {
        if (v.deviceId && v.deviceId.exact === 'cam-back') facing = 'environment';
        else if (v.deviceId && v.deviceId.exact === 'cam-front') facing = 'user';
        else if (v.facingMode && v.facingMode.exact) facing = v.facingMode.exact;
        else if (typeof v.facingMode === 'string') facing = v.facingMode;
      }
      return fakeStream17(facing);
    };
    window.MediaStream = function (tracks) {
      var list = (tracks || []).slice();
      this.getTracks = function () { return list.slice(); };
      this.getVideoTracks = function () { return list.filter(function (t) { return t.kind === 'video'; }); };
      this.getAudioTracks = function () { return list.filter(function (t) { return t.kind === 'audio'; }); };
      this.addTrack = function (t) { list.push(t); };
      this.removeTrack = function (t) { list = list.filter(function (x) { return x !== t; }); };
    };
    window.MediaRecorder = function (stream, opts) {
      this.stream = stream;
      this.mimeType = (opts && opts.mimeType) || 'video/webm';
      this.state = 'inactive';
      this.ondataavailable = null; this.onstop = null; this.onerror = null;
      var self = this; var n = 0;
      this.start = function (timeslice) {
        self.state = 'recording';
        // El primer trozo llega en el acto (simula el timeslice) y luego
        // uno cada intervalo, como en el teléfono.
        if (self.ondataavailable) self.ondataavailable({ data: new window.Blob(['trozo-de-video-' + (++n)], { type: 'video/webm' }) });
        self._timer = setInterval(function () {
          if (self.ondataavailable) self.ondataavailable({ data: new window.Blob(['trozo-de-video-' + (++n)], { type: 'video/webm' }) });
        }, timeslice || 1000);
      };
      this.stop = function () { self.state = 'inactive'; if (self._timer) clearInterval(self._timer); if (self.onstop) self.onstop(); };
    };
    window.MediaRecorder.isTypeSupported = function (m) { return String(m).indexOf('video/webm') === 0; };
    var origGetContext17 = window.HTMLCanvasElement.prototype.getContext;
    var origCaptureStream17 = window.HTMLCanvasElement.prototype.captureStream;
    window.HTMLCanvasElement.prototype.getContext = function (kind) {
      if (kind !== '2d') return null;
      if (!this._fakeCtx) this._fakeCtx = { filter: '', drawImage: function () {}, clearRect: function () {}, fillRect: function () {}, save: function () {}, restore: function () {} };
      return this._fakeCtx;
    };
    window.HTMLCanvasElement.prototype.captureStream = function () { return fakeStream17(); };
    // Empezar un live nuevo como transmisor.
    window.__wrOpenLiveStart();
    setVal($('liveTitleInput'), 'Live v1.7');
    click($('liveStartBtn'));
    await waitFor(() => T.getCurrentLive() !== null);
    check('v1.7 lives: el transmisor ve los controles de cámara, zoom, filtros, pantalla y grabar', !$('liveHostControls').classList.contains('hidden') && !!$('liveCamBtn') && !!$('liveZoomInBtn') && !!$('liveZoomOutBtn') && !!$('liveFilterRow') && !!$('liveScreenBtn') && !!$('liveRecBtn'));
    check('v1.7 lives: el botón de cámara dice Cámara trasera al empezar (frontal)', $('liveCamBtn').textContent.indexOf('Cámara trasera') >= 0);
    // Cambio de cámara.
    var camOk = await T.switchLiveCamera();
    check('v1.7 lives: cambiar de cámara pasa a trasera sin cortar el live', camOk === true && T.getLiveCamFacing() === 'environment' && T.getCurrentLive() !== null && $('liveCamBtn').textContent.indexOf('Cámara frontal') >= 0);
    var camOk2 = await T.switchLiveCamera();
    check('v1.7 lives: volver a cambiar pasa a frontal', camOk2 === true && T.getLiveCamFacing() === 'user');
    // Zoom: botones y tope.
    check('v1.7 lives: el zoom empieza en 1.0×', T.getLiveZoom() === 1 && $('liveZoomLabel').textContent === '1.0×');
    T.liveZoomIn(); T.liveZoomIn();
    check('v1.7 lives: zoom + dos veces llega a 2.0×', T.getLiveZoom() === 2 && $('liveZoomLabel').textContent === '2.0×');
    T.liveZoomOut();
    check('v1.7 lives: zoom - baja a 1.5×', T.getLiveZoom() === 1.5 && $('liveZoomLabel').textContent === '1.5×');
    T.setLiveZoom(9);
    check('v1.7 lives: el zoom no pasa de 4.0×', T.getLiveZoom() === 4 && $('liveZoomLabel').textContent === '4.0×');
    // Pellizco: duplicar la distancia duplica el zoom.
    T.setLiveZoom(1);
    T.livePinchStart({ touches: [{ clientX: 0, clientY: 0 }, { clientX: 100, clientY: 0 }] });
    T.livePinchMove({ touches: [{ clientX: 0, clientY: 0 }, { clientX: 200, clientY: 0 }], preventDefault: function () {} });
    T.livePinchEnd();
    check('v1.7 lives: el pellizco duplica la distancia y el zoom sube a 2.0×', T.getLiveZoom() === 2, String(T.getLiveZoom()));
    T.setLiveZoom(1);
    // Filtros tipo TikTok.
    check('v1.7 lives: la fila de filtros tiene los 6 filtros', !!q('#liveFilterRow [data-livefilter="calido"]') && !!q('#liveFilterRow [data-livefilter="byn"]') && !!q('#liveFilterRow [data-livefilter="vivo"]'));
    T.setLiveFilter('calido');
    check('v1.7 lives: el filtro Cálido queda activo y marcado', T.getLiveFilter() === 'calido' && q('#liveFilterRow [data-livefilter="calido"]').classList.contains('on'));
    check('v1.7 lives: con filtro, el canvas procesa el video (no solo la vista previa)', T.getLiveFilterRunning() === true && T.getLiveFilterPreviewOnly() === false);
    T.setLiveFilter('none');
    check('v1.7 lives: Sin filtro apaga el procesado', T.getLiveFilter() === 'none' && T.getLiveFilterRunning() === false);
    // Compartir pantalla por el puente nativo (sin getDisplayMedia).
    check('v1.7 lives: sin getDisplayMedia se usa el puente nativo', T.liveScreenSupported() === 'native');
    var scrOk = await T.toggleLiveScreenShare();
    await waitFor(() => T.getLiveSource() === 'screen');
    check('v1.7 lives: compartir pantalla cambia la fuente sin cortar el live', scrOk === true && T.getLiveSource() === 'screen' && T.getCurrentLive() !== null && $('liveScreenBtn').textContent.indexOf('Volver a cámara') >= 0);
    T.onScreenFrame('data:image/jpeg;base64,/9j/AAAA');
    check('v1.7 lives: llega un cuadro de la pantalla sin error', T.getLiveSource() === 'screen');
    var scrOk2 = await T.toggleLiveScreenShare();
    check('v1.7 lives: volver a la cámara deja el live en marcha', scrOk2 === true && T.getLiveSource() === 'camera' && T.getCurrentLive() !== null && (calls.screenShare || []).indexOf('stop') >= 0);
    // Grabación por trozos, sin límite de tiempo.
    var recOk = await T.startLiveRecording();
    await sleep(150);
    var sess17 = T.getLiveRecSession();
    check('v1.7 lives: la grabación empieza y guarda la sesión por trozos', recOk === true && T.getLiveRecording() === true && !!sess17 && sess17.status === 'recording' && $('liveRecLabel').textContent.indexOf('GRABANDO') >= 0);
    check('v1.7 lives: los trozos se guardan en el teléfono (puente) y en el servidor', sess17 && sess17.chunks >= 1 && sess17.serverChunks >= 1, JSON.stringify(sess17));
    check('v1.7 lives: la sesión queda en localStorage tras cada trozo', !!window.localStorage.getItem(T.core.liveRecSessionKey(sess17)));
    // Sin límite de tiempo: 720 trozos de 5 s = 1 hora simulada.
    var blob17 = new window.Blob(['trozo'], { type: 'video/webm' });
    for (var ci17 = 0; ci17 < 720; ci17++) { await T.liveRecAppendChunk(blob17); }
    sess17 = T.getLiveRecSession();
    check('v1.7 lives: 720 trozos (1 hora) siguen grabando sin límite', T.getLiveRecording() === true && sess17 && sess17.chunks >= 721, JSON.stringify(sess17 && sess17.chunks));
    // Parar: queda en Mis grabaciones.
    var stopped17 = await T.stopLiveRecording(true);
    check('v1.7 lives: al parar, la grabación queda guardada y en Mis grabaciones', !!stopped17 && stopped17.status === 'done' && T.getLiveRecordings().some(function (r) { return r.id === stopped17.id; }));
    // Interrupción simulada: sesión grabando en localStorage.
    var cut17 = T.core.createLiveRecSession('live_cortado', 'Live cortado', Date.now() - 600000);
    cut17.chunks = 24; cut17.bytes = 12000000; cut17.serverChunks = 10; cut17.endedAt = cut17.startedAt + 600000;
    window.localStorage.setItem(T.core.liveRecSessionKey(cut17), JSON.stringify(cut17));
    var nRec17 = await T.checkInterruptedLiveRecordings();
    check('v1.7 lives: tras un corte, la grabación aparece como recuperada', nRec17 === 1 && $('liveRecoveryOverlay').classList.contains('on') && $('liveRecoveryList').textContent.indexOf('Live cortado') >= 0);
    check('v1.7 lives: el aviso dice hasta dónde se guardó (10:00, 24 trozos)', $('liveRecoveryList').textContent.indexOf('10:00') >= 0 && $('liveRecoveryList').textContent.indexOf('24 trozos') >= 0, $('liveRecoveryList').textContent);
    await window.__wrKeepLiveRecording(cut17.id);
    check('v1.7 lives: Conservar guarda la grabación y quita el aviso', T.getLiveRecordings().some(function (r) { return r.id === cut17.id; }) && !$('liveRecoveryOverlay').classList.contains('on'));
    // Otra interrupción, ahora Eliminar.
    var cut17b = T.core.createLiveRecSession('live_cortado2', 'Live a borrar', Date.now() - 300000);
    cut17b.chunks = 5; cut17b.bytes = 1000;
    window.localStorage.setItem(T.core.liveRecSessionKey(cut17b), JSON.stringify(cut17b));
    await T.checkInterruptedLiveRecordings();
    window.__wrDiscardLiveRecording(cut17b.id);
    check('v1.7 lives: Eliminar quita la grabación cortada', !window.localStorage.getItem(T.core.liveRecSessionKey(cut17b)) && !T.getLiveRecordings().some(function (r) { return r.id === cut17b.id; }));
    // Terminar el live mientras se graba guarda la grabación.
    var recOk17b = await T.startLiveRecording();
    await sleep(150);
    click($('liveEndBtn'));
    await waitFor(() => T.getCurrentLive() === null);
    check('v1.7 lives: terminar el live grabando guarda la grabación', recOk17b === true && T.getLiveRecordings().length >= 2, String(T.getLiveRecordings().length));
    // ---- v1.8 cámara del live: fallos reales y pantalla completa ----
    // REGRESIÓN del bug de la v1.7: en la v1.7, si el teléfono devolvía
    // la frontal otra vez o la petición se colgaba, no pasaba nada y la
    // app decía "Cámara trasera" sin haber cambiado. Ahora cada intento
    // tiene límite, se suelta la cámara vieja, se verifica la cara real
    // y si no se puede, se dice claro y el live sigue en la frontal.
    // (Se usa el mismo live de la sección v1.7: se empieza uno nuevo.)
    window.navigator.mediaDevices.enumerateDevices = async function () {
      return [
        { kind: 'videoinput', deviceId: 'cam-front', label: 'Cámara frontal', groupId: '' },
        { kind: 'videoinput', deviceId: 'cam-back', label: 'Cámara trasera', groupId: '' },
        { kind: 'audioinput', deviceId: 'mic-1', label: 'Micrófono', groupId: '' }
      ];
    };
    window.navigator.mediaDevices.getUserMedia = async function (constraints) {
      var v = constraints && constraints.video;
      var facing = 'user';
      if (v && typeof v === 'object') {
        if (v.deviceId && v.deviceId.exact === 'cam-back') facing = 'environment';
        else if (v.deviceId && v.deviceId.exact === 'cam-front') facing = 'user';
        else if (v.facingMode && v.facingMode.exact) facing = v.facingMode.exact;
        else if (typeof v.facingMode === 'string') facing = v.facingMode;
      }
      return fakeStream17(facing);
    };
    window.__wrOpenLiveStart();
    setVal($('liveTitleInput'), 'Live v1.8 cámara');
    click($('liveStartBtn'));
    await waitFor(() => T.getCurrentLive() !== null);
    check('v1.8 cámara: el live es a pantalla completa', $('liveOverlay').classList.contains('live-full') && window.getComputedStyle($('liveVideoWrap')).position === 'absolute' && $('liveVideo').style.width === '100%' && $('liveVideo').style.height === '100%' && !$('liveVideo').style.maxHeight && window.getComputedStyle($('liveVideo')).objectFit === 'cover', 'clase=' + $('liveOverlay').className);
    check('v1.8 cámara: los controles están dentro de la vista como botones flotantes', $('liveVideoWrap').contains($('liveHostControls')) && !!$('liveCamBtn').classList.contains('live-fbtn') && !!q('.live-fcol') && !!q('.live-topbar') && !!q('.live-bottom'));
    // El botón flotante de cámara cambia de verdad a la trasera.
    $('liveCamBtn').click();
    await waitFor(() => T.getLiveCamFacing() === 'environment', 15000);
    check('v1.8 cámara: tocar el botón flotante cambia a la cámara trasera', T.getLiveCamFacing() === 'environment' && T.getLiveVideoFacing() === 'environment' && $('liveCamBtn').textContent.indexOf('Cámara frontal') >= 0, 'cara=' + T.getLiveCamFacing() + ' video=' + T.getLiveVideoFacing());
    // Volver a la frontal con el botón.
    $('liveCamBtn').click();
    await waitFor(() => T.getLiveCamFacing() === 'user', 15000);
    check('v1.8 cámara: tocar el botón de nuevo vuelve a la frontal', T.getLiveCamFacing() === 'user');
    // Fallback: facingMode exact falla, pero el modo sin exact funciona.
    var gumOrig18 = window.navigator.mediaDevices.getUserMedia;
    var enumOrig18 = window.navigator.mediaDevices.enumerateDevices;
    window.navigator.mediaDevices.enumerateDevices = async function () { return []; };
    window.navigator.mediaDevices.getUserMedia = async function (constraints) {
      var v = constraints && constraints.video;
      if (v && v.facingMode && v.facingMode.exact) throw new Error('OverconstrainedError');
      var facing = 'user';
      if (v && typeof v === 'object') {
        if (typeof v.facingMode === 'string') facing = v.facingMode;
        else if (v.facingMode && v.facingMode.exact) facing = v.facingMode.exact;
      }
      return fakeStream17(facing);
    };
    var fbOk = await T.switchLiveCamera();
    check('v1.8 cámara: si facingMode exact falla, el cambio va por facingMode sin exact', fbOk === true && T.getLiveVideoFacing() === 'environment', 'ok=' + fbOk + ' video=' + T.getLiveVideoFacing());
    // Volver a la frontal con el mock bueno para probar el caso mentiroso.
    window.navigator.mediaDevices.getUserMedia = gumOrig18;
    await T.switchLiveCamera();
    check('v1.8 cámara: de vuelta en la frontal antes de la prueba de la cara', T.getLiveCamFacing() === 'user');
    // El teléfono devuelve la frontal otra vez: NO se miente.
    window.navigator.mediaDevices.getUserMedia = async function () { return fakeStream17('user'); };
    var lieOk = await T.switchLiveCamera();
    check('v1.8 cámara: si el teléfono devuelve la frontal otra vez, el cambio falla y lo dice claro', lieOk === false && T.getLiveCamFacing() === 'user' && T.getCurrentLive() !== null && $('toast').textContent.indexOf('No se pudo cambiar') >= 0, 'ok=' + lieOk + ' toast=' + $('toast').textContent);
    // La petición se cuelga: el cambio no se queda esperando para siempre.
    window.navigator.mediaDevices.enumerateDevices = enumOrig18;
    window.navigator.mediaDevices.getUserMedia = async function (constraints) {
      var v = constraints && constraints.video;
      if (v && v.deviceId && v.deviceId.exact === 'cam-back') return new Promise(function () {});
      var facing = 'user';
      if (v && typeof v === 'object') {
        if (typeof v.facingMode === 'string') facing = v.facingMode;
        else if (v.facingMode && v.facingMode.exact) facing = v.facingMode.exact;
      }
      return fakeStream17(facing);
    };
    var hangStart = Date.now();
    var hangOk = await T.switchLiveCamera();
    var hangMs = Date.now() - hangStart;
    check('v1.8 cámara: si una petición se cuelga, el cambio resuelve en segundos (no para siempre)', hangOk === true && hangMs < 15000, 'ok=' + hangOk + ' ms=' + hangMs);
    window.navigator.mediaDevices.getUserMedia = gumOrig18;
    window.navigator.mediaDevices.enumerateDevices = enumOrig18;
    await T.leaveLive();
    // Restaurar los stubs de canvas (solo eran para esta sección).
    window.HTMLCanvasElement.prototype.getContext = origGetContext17;
    if (origCaptureStream17) window.HTMLCanvasElement.prototype.captureStream = origCaptureStream17;
    else delete window.HTMLCanvasElement.prototype.captureStream;
    // ---- v2.1 lives grabados como publicación en el inicio ----
    // Al guardar una grabación (al parar de grabar, al terminar el live
    // o al conservar una grabación recuperada), la grabación aparece
    // como publicación en el inicio: video, autor, fecha y hora, y se
    // puede ver, dar me gusta, comentar y compartir como cualquier
    // publicación; y sigue en "Mis grabaciones" del Perfil. Un live
    // que no se grabó no crea ninguna publicación.
    var recPostsBefore21 = T.getState().posts.filter(function (p) { return p.isLiveRecording; }).length;
    window.__wrOpenLiveStart();
    setVal($('liveTitleInput'), 'Live v2.1 grabado');
    click($('liveStartBtn'));
    await waitFor(() => { const l = T.getCurrentLive(); return l && l.title === 'Live v2.1 grabado'; });
    var recOk21 = await T.startLiveRecording();
    await sleep(150);
    check('v2.1 live grabado: la grabación empieza en el live nuevo', recOk21 === true && T.getLiveRecording() === true);
    var stopped21 = await T.stopLiveRecording(true);
    check('v2.1 live grabado: al parar, la grabación queda en Mis grabaciones', !!stopped21 && stopped21.status === 'done' && T.getLiveRecordings().some(function (r) { return r.id === stopped21.id; }));
    var recPost21 = T.getState().posts.filter(function (p) { return p.liveRecordingId === stopped21.id; })[0];
    check('v2.1 live grabado: al guardar la grabación aparece una publicación en el inicio', !!recPost21 && recPost21.isLiveRecording === true && recPost21.author === '5511111111' && recPost21.mediaType === 'video' && String(recPost21.media).indexOf('m_dom_1') >= 0, recPost21 && JSON.stringify({ media: recPost21.media, type: recPost21.mediaType }));
    check('v2.1 live grabado: la publicación es la más reciente del inicio', T.getState().posts[0] === recPost21);
    T.renderFeed();
    var card21 = q('#feed .post[data-post="' + recPost21.id + '"]');
    check('v2.1 live grabado: la tarjeta lleva la etiqueta "Live grabado" y el video', !!card21 && !!card21.querySelector('.liveRecBadge') && card21.querySelector('.liveRecBadge').textContent.indexOf('Live grabado') >= 0 && !!card21.querySelector('video') && card21.querySelector('video').getAttribute('src') === recPost21.media);
    check('v2.1 live grabado: la tarjeta tiene me gusta, comentar y compartir', !!card21 && !!card21.querySelector('.actions .like-btn') && !!card21.querySelector('.actions button[aria-label="Comentar"]') && !!card21.querySelector('.actions button[aria-label="Compartir"]'));
    window.__wrLike(recPost21.id);
    check('v2.1 live grabado: se le puede dar me gusta', T.getState().posts.filter(function (p) { return p.id === recPost21.id; })[0].likes['5511111111'] === 'Me gusta');
    window.__wrOpenPost(recPost21.id);
    setVal($('commentInput'), '¡Qué buen live!');
    await window.__wrAddComment(); await tick();
    check('v2.1 live grabado: se puede comentar como cualquier publicación', $('postDetail').textContent.indexOf('¡Qué buen live!') >= 0 && T.getState().posts.filter(function (p) { return p.id === recPost21.id; })[0].comments.length === 1);
    click(q('[data-close="postOverlay"]'));
    window.__wrShare(recPost21.id);
    check('v2.1 live grabado: compartir ofrece dentro de WordRed o en otras apps', $('shareChoiceOverlay').classList.contains('on'));
    click($('shareChoiceInside'));
    check('v2.1 live grabado: se puede compartir como cualquier publicación', T.getState().posts.some(function (p) { return p.sharedFrom && p.sharedFrom.id === recPost21.id; }) && T.getState().posts.filter(function (p) { return p.id === recPost21.id; })[0].shares.indexOf('5511111111') >= 0);
    // No se publica dos veces la misma grabación.
    var dup21 = T.publishLiveRecordingAsPost({ id: stopped21.id, title: 'Live v2.1 grabado', serverUrl: stopped21.serverUrl, localUri: stopped21.localUri, startedAt: stopped21.startedAt, endedAt: stopped21.endedAt });
    check('v2.1 live grabado: la misma grabación no se publica dos veces', dup21 === null && T.getState().posts.filter(function (p) { return p.liveRecordingId === stopped21.id; }).length === 1);
    // Grabación recuperada tras un corte: al conservarla también aparece.
    var cut21 = T.core.createLiveRecSession('live_cortado21', 'Live cortado v2.1', Date.now() - 300000);
    cut21.chunks = 8; cut21.bytes = 5000000; cut21.serverChunks = 4; cut21.endedAt = cut21.startedAt + 300000;
    window.localStorage.setItem(T.core.liveRecSessionKey(cut21), JSON.stringify(cut21));
    await T.checkInterruptedLiveRecordings();
    await window.__wrKeepLiveRecording(cut21.id);
    var recPostCut21 = T.getState().posts.filter(function (p) { return p.liveRecordingId === cut21.id; })[0];
    check('v2.1 live grabado: la grabación recuperada y conservada también aparece como publicación', !!recPostCut21 && recPostCut21.isLiveRecording === true && !!recPostCut21.media);
    T.renderFeed();
    var cardCut21 = q('#feed .post[data-post="' + recPostCut21.id + '"]');
    check('v2.1 live grabado: la tarjeta muestra la duración de la grabación', !!cardCut21 && cardCut21.textContent.indexOf('Live grabado · 5:00') >= 0, cardCut21 && cardCut21.textContent.slice(0, 200));
    // Un live que no se grabó no crea ninguna publicación.
    var recCountBeforeNoRec21 = T.getState().posts.filter(function (p) { return p.isLiveRecording; }).length;
    window.__wrOpenLiveStart();
    setVal($('liveTitleInput'), 'Live sin grabar');
    click($('liveStartBtn'));
    await waitFor(() => { const l = T.getCurrentLive(); return l && l.title === 'Live sin grabar'; });
    click($('liveEndBtn'));
    await waitFor(() => T.getCurrentLive() === null);
    check('v2.1 live grabado: un live sin grabar no crea publicación', T.getState().posts.filter(function (p) { return p.isLiveRecording; }).length === recCountBeforeNoRec21);
    check('v2.1 live grabado: las grabaciones siguen en Mis grabaciones', T.getLiveRecordings().some(function (r) { return r.id === stopped21.id; }) && T.getLiveRecordings().some(function (r) { return r.id === cut21.id; }));
    // ---- v1.5.6 en vivos: grabación en el perfil, reloj al centro y aro rojo ----
    // Reloj al centro mientras se graba el live.
    window.__wrOpenLiveStart();
    setVal($('liveTitleInput'), 'Live v1.5.6 reloj');
    click($('liveStartBtn'));
    await waitFor(() => { const l = T.getCurrentLive(); return l && l.title === 'Live v1.5.6 reloj'; });
    var recOk156 = await T.startLiveRecording();
    await sleep(2200);
    check('v1.5.6 reloj: mientras se graba se ve el reloj al centro con el tiempo', recOk156 === true && !$('liveRecClock').classList.contains('hidden') && /0:0[12]/.test($('liveRecClockTime').textContent), 'reloj=' + $('liveRecClockTime').textContent);
    var stopped156 = await T.stopLiveRecording(true);
    check('v1.5.6 reloj: al parar de grabar el reloj se apaga', !!stopped156 && $('liveRecClock').classList.contains('hidden'));
    var recPost156 = T.getState().posts.filter(function (p) { return p.liveRecordingId === stopped156.id; })[0];
    click($('liveEndBtn'));
    await waitFor(() => T.getCurrentLive() === null);
    check('v1.5.6 perfil: la grabación crea su publicación', !!recPost156 && recPost156.isLiveRecording === true);
    // La grabación aparece en el perfil, en su propia sección.
    click(q('#bottomNav button[data-nav="profile"]'));
    await sleep(150);
    var ownH156 = Array.from(qa('#ownProfile h3.sectitle')).map(function (h) { return h.textContent; });
    check('v1.5.6 perfil: el perfil propio tiene la sección "En vivos grabados"', ownH156.some(function (t) { return t.indexOf('En vivos grabados') >= 0; }), ownH156.join(' | '));
    var card156 = q('#ownProfile .post[data-post="' + recPost156.id + '"]');
    function sectionOf156(el) { var n = el; while (n) { n = n.previousElementSibling; if (n && n.tagName === 'H3') return n.textContent; } return ''; }
    check('v1.5.6 perfil: la grabación está en "En vivos grabados" (no en Mis publicaciones)', !!card156 && sectionOf156(card156).indexOf('En vivos grabados') >= 0, card156 && sectionOf156(card156));
    check('v1.5.6 perfil: la tarjeta de la grabación lleva la etiqueta y el video', !!card156 && !!card156.querySelector('.liveRecBadge') && !!card156.querySelector('video'));
    // Aro rojo: otra persona en vivo (Ana, de ejemplo) — en el inicio y en su perfil.
    click(q('#bottomNav button[data-nav="feed"]'));
    await sleep(100);
    // 1.5.34: Ana (persona de prueba) necesita una historia propia: la
    // única historia de ejemplo es de la cuenta oficial.
    T.core.createStory(T.getState(), '1000000001', { text: 'Historia de Ana para el aro' });
    T.renderFeed();
    T.setLiveList([{ id: 'live_ring_ana', host: '1000000001', title: 'Live de Ana', createdAt: Date.now(), viewers: [], viewerCount: 0, chat: [], likes: 0 }]);
    T.refreshLiveRings();
    await sleep(100);
    var anaCard156 = (function () {
      // Publicación real de Ana (el interruptor de ejemplos está
      // forzado a visible para la corrida; la publicación real
      // garantiza el aro en la tarjeta del inicio).
      T.core.createPost(T.getState(), '1000000001', { text: 'Publicación de Ana para el aro 1.5.6' });
      T.renderFeed();
      return qa('#feed .post').filter(function (el) { return el.textContent.indexOf('Publicación de Ana para el aro 1.5.6') >= 0; })[0];
    })();
    check('v1.5.6 aro: en el inicio el avatar de quien está en vivo lleva el aro rojo', !!anaCard156 && !!anaCard156.querySelector('.avatar.live-ring'), anaCard156 && anaCard156.innerHTML.slice(0, 200));
    // 1.5.54: la fila de arriba son reels, no historias: ningún reel lleva el aro de en vivo (el aro vive en la publicación y en el perfil).
    check('v1.5.6 aro: en la fila de reels ningún rectángulo lleva el aro de en vivo', !q('#storiesRow .avatar.live-ring') && !q('#storiesRow .homeReelRect1560.live-ring'));
    check('v1.5.6 aro: tocar un reel de quien está en vivo abre el reel, no el live', qa('#storiesRow .homeReel1549').every(function (el) { return (el.getAttribute('onclick') || '').indexOf('__wrJoinLive') < 0; }));
    // Tocar el avatar con aro en una publicación entra al live.
    var anaTap156 = anaCard156 && anaCard156.querySelector('.liveAvatarTap');
    check('v1.5.6 aro: el avatar con aro se puede tocar para entrar al live', !!anaTap156 && (anaTap156.getAttribute('onclick') || '').indexOf("__wrJoinLive('live_ring_ana')") >= 0, anaTap156 && anaTap156.getAttribute('onclick'));
    if (anaTap156) anaTap156.click();
    await waitFor(() => T.getCurrentLive() !== null && $('liveOverlay').classList.contains('on'));
    check('v1.5.6 aro: tocar el avatar con aro abre el live', T.getCurrentLive() !== null && $('liveOverlay').classList.contains('on'));
    await T.leaveLive();
    await sleep(100);
    window.__wrOpenProfile('1000000001');
    await sleep(100);
    check('v1.5.6 aro: en el perfil de quien está en vivo su avatar lleva el aro rojo', !!q('#profileDetail .profileHead .avatar.live-ring'));
    var anaProfTap156 = q('#profileDetail .profileHead .liveAvatarTap');
    check('v1.5.6 aro: en el perfil, tocar el avatar con aro entra al live', !!anaProfTap156 && (anaProfTap156.getAttribute('onclick') || '').indexOf("__wrJoinLive('live_ring_ana')") >= 0, anaProfTap156 && anaProfTap156.getAttribute('onclick'));
    click(q('[data-close="profileOverlay"]'));
    // Al terminar el live, el aro desaparece de todos lados.
    T.setLiveList([]);
    T.refreshLiveRings();
    await sleep(100);
    check('v1.5.6 aro: sin lives, ningún avatar lleva el aro rojo', !q('#feed .avatar.live-ring') && !q('#storiesRow .avatar.live-ring'));
    // Aro en el propio avatar: mi live en mi perfil.
    T.setLiveList([{ id: 'live_ring_yo', host: '5511111111', title: 'Mi live', createdAt: Date.now(), viewers: [], viewerCount: 0, chat: [], likes: 0 }]);
    T.refreshLiveRings();
    await sleep(100);
    click(q('#bottomNav button[data-nav="profile"]'));
    await sleep(150);
    check('v1.5.6 aro: mi propio avatar lleva el aro rojo cuando estoy en vivo', !!q('#ownProfile .profileHead .avatar.live-ring') && !!q('#ownProfile .profileHead .liveAvatarTap'));
    T.setLiveList([]);
    T.refreshLiveRings();
    click(q('#bottomNav button[data-nav="feed"]'));
    await sleep(100);
    // ---- v1.5.7 Google fácil y carátula en los videos ----
    // Google: sin escribir ningún ID, el botón abre la cuenta con el ID
    // de WordRed que ya trae la app.
    var g157before = calls.openExternalUrl.length;
    click($('authGoogle'));
    check('v1.5.8 Google web: el botón abre la página de Google en el navegador', calls.openExternalUrl.length === g157before + 1 && calls.openExternalUrl[calls.openExternalUrl.length - 1] === 'https://wordred-server.onrender.com/oauth/google', JSON.stringify(calls.openExternalUrl));
    // Carátula guardada: un video publicado con carátula se ve con su
    // poster en el inicio y en el perfil.
    var r157dom = T.core.createPost(T.getState(), T.getState().me, { text: 'Video con carátula 1.5.7', media: 'demo-video.mp4', mediaType: 'video', mediaList: [{ src: 'demo-video.mp4', type: 'video', thumb: 'data:image/jpeg;base64,CARATULA157' }] });
    check('v1.5.7 carátula: la publicación guarda su carátula', !!r157dom.ok && r157dom.post.videoThumb === 'data:image/jpeg;base64,CARATULA157');
    click(q('#bottomNav button[data-nav="feed"]'));
    await sleep(150);
    var card157 = q('#feed .post[data-post="' + r157dom.post.id + '"]');
    var vid157 = card157 && card157.querySelector('video');
    check('v1.5.7 carátula: en el inicio el video lleva su carátula como poster', !!vid157 && vid157.getAttribute('poster') === 'data:image/jpeg;base64,CARATULA157', vid157 && vid157.outerHTML.slice(0, 200));
    click(q('#bottomNav button[data-nav="profile"]'));
    await sleep(150);
    var card157p = q('#ownProfile .post[data-post="' + r157dom.post.id + '"]');
    var vid157p = card157p && card157p.querySelector('video');
    check('v1.5.7 carátula: en el perfil el video lleva su carátula como poster', !!vid157p && vid157p.getAttribute('poster') === 'data:image/jpeg;base64,CARATULA157', vid157p && vid157p.outerHTML.slice(0, 200));
    click(q('#bottomNav button[data-nav="feed"]'));
    await sleep(100);
    // Video viejo sin carátula: se marca para generarla al cargar y al
    // generarse se pone como poster (aquí se simula la captura).
    var r157old = T.core.createPost(T.getState(), T.getState().me, { text: 'Video viejo sin carátula 1.5.7', media: 'demo-video.mp4', mediaType: 'video', mediaList: [{ src: 'demo-video.mp4', type: 'video' }] });
    click(q('#bottomNav button[data-nav="feed"]'));
    await sleep(150);
    var card157o = q('#feed .post[data-post="' + r157old.post.id + '"]');
    var vid157o = card157o && card157o.querySelector('video');
    check('v1.5.7 carátula: el video sin carátula se marca para generarla al cargar', !!vid157o && vid157o.getAttribute('data-needs-thumb') === '1' && (vid157o.getAttribute('onloadedmetadata') || '').indexOf('__wrVideoThumb') >= 0, vid157o && vid157o.outerHTML.slice(0, 250));
    var realCap157 = window.__wrCaptureVideoFrame;
    window.__wrCaptureVideoFrame = function (src, cb) { cb('data:image/jpeg;base64,PEREZOSO157'); };
    vid157o.dispatchEvent(new window.Event('loadedmetadata'));
    check('v1.5.7 carátula: al generarse, la carátula se pone como poster del video', vid157o.getAttribute('poster') === 'data:image/jpeg;base64,PEREZOSO157' && !vid157o.getAttribute('data-needs-thumb'));
    window.__wrCaptureVideoFrame = realCap157;
    // ---- v1.5.8: Shorts que se paran, video de ejemplo con imagen real,
    // carátula elegible (fotograma o imagen propia) y anclar en el perfil ----
    // (1) Shorts: al salir de Shorts el video se pausa (video y sonido).
    // 1.5.34: hay 1 video de ejemplo (el clip neutro de la ciudad); se
    // usa un video real creado aquí (la pausa no depende de que el video
    // sea de ejemplo).
    check('v1.5.8 video ejemplo: en la 1.5.34 hay exactamente 1 publicación de ejemplo con video', T.getState().posts.filter(function (p) { return p.isDemo && p.mediaType === 'video'; }).length === 1);
    var vidPost158 = T.core.createPost(T.getState(), T.getState().me, { text: 'Video para Shorts 1.5.8', media: 'https://srv/video158.mp4', mediaType: 'video', mediaList: [{ src: 'https://srv/video158.mp4', type: 'video', thumb: 'data:image/jpeg;base64,POSTER158' }] });
    T.openShorts(vidPost158.post.id);
    await sleep(100);
    var vidShort158 = q('#shortsBody video');
    check('v1.5.8 Shorts: el video se muestra con video', !!vidShort158, q('#shortsBody') && q('#shortsBody').innerHTML.slice(0, 150));
    var paused158 = 0;
    if (vidShort158) vidShort158.pause = function () { paused158++; };
    T.go('feed');
    check('v1.5.8 Shorts: al ir a Inicio el Short se pausa', paused158 === 1, 'pausas: ' + paused158);
    T.openShorts(vidPost158.post.id);
    await sleep(100);
    var vidShort158b = q('#shortsBody video');
    var paused158b = 0;
    if (vidShort158b) vidShort158b.pause = function () { paused158b++; };
    click($('shortsClose'));
    check('v1.5.8 Shorts: al cerrar el visor el Short se pausa y el visor se cierra', paused158b === 1 && !$('shortsOverlay').classList.contains('on'), 'pausas: ' + paused158b);
    // (2) El video se ve con su carátula en el detalle.
    window.__wrOpenPost(vidPost158.post.id);
    await sleep(100);
    var vid158demo = q('#postDetail video');
    check('v1.5.8 video ejemplo: el video lleva su carátula como poster (imagen real)', !!vid158demo && vid158demo.getAttribute('poster') === 'data:image/jpeg;base64,POSTER158', vid158demo && vid158demo.outerHTML.slice(0, 200));
    $('postOverlay').classList.remove('on');
    // (3) Selector de carátula: elegir un fotograma del video.
    var smallVid158 = new window.File([new Uint8Array(100 * 1024)], 'video-158.mp4', { type: 'video/mp4' });
    click($('composerOpen'));
    var mediaInput158 = $('postMediaInput');
    Object.defineProperty(mediaInput158, 'files', { value: [smallVid158], configurable: true });
    mediaInput158.dispatchEvent(new window.Event('change', { bubbles: true }));
    await waitFor(function () { return $('postMediaPrev').querySelector('video'); }, 15000);
    check('v1.5.8 carátula: al subir un video aparece el botón Carátula en el editor', !!q('#postMediaPrev .cover-pick-btn'));
    click(q('#postMediaPrev .cover-pick-btn'));
    check('v1.5.8 carátula: el selector se abre con el video y la barra de momento', $('coverPickerOverlay').classList.contains('on') && !!$('coverPickerVideo').getAttribute('src') && !!$('coverPickerRange'), 'src=' + ($('coverPickerVideo').getAttribute('src') || ''));
    var realCapAt158 = window.__wrCaptureVideoFrameAt;
    window.__wrCaptureVideoFrameAt = function (src, t, cb) { cb('data:image/jpeg;base64,MARCO158'); };
    click($('coverPickerUseFrame'));
    check('v1.5.8 carátula: elegir un fotograma pone la vista previa y la carátula del video', $('coverPickerPreview').getAttribute('src') === 'data:image/jpeg;base64,MARCO158' && $('postMediaPrev').querySelector('video').getAttribute('poster') === 'data:image/jpeg;base64,MARCO158', 'preview=' + ($('coverPickerPreview').getAttribute('src') || ''));
    window.__wrCaptureVideoFrameAt = realCapAt158;
    setVal($('postText'), 'Video con carátula elegida 1.5.8');
    click($('postPublish'));
    await waitFor(function () { var p = T.getState().posts.filter(function (x) { return x.text === 'Video con carátula elegida 1.5.8'; })[0]; return p && p.videoThumb === 'data:image/jpeg;base64,MARCO158'; }, 15000);
    var postMarco158 = T.getState().posts.filter(function (x) { return x.text === 'Video con carátula elegida 1.5.8'; })[0];
    check('v1.5.8 carátula: el fotograma elegido se guarda con la publicación', !!postMarco158 && postMarco158.videoThumb === 'data:image/jpeg;base64,MARCO158', postMarco158 && postMarco158.videoThumb);
    click(q('#bottomNav button[data-nav="feed"]'));
    await sleep(150);
    var cardMarco158 = q('#feed .post[data-post="' + postMarco158.id + '"]');
    var vidMarco158 = cardMarco158 && cardMarco158.querySelector('video');
    check('v1.5.8 carátula: el fotograma elegido se ve como poster en el inicio', !!vidMarco158 && vidMarco158.getAttribute('poster') === 'data:image/jpeg;base64,MARCO158', vidMarco158 && vidMarco158.outerHTML.slice(0, 200));
    // (4) Selector de carátula: subir una imagen propia como portada.
    click($('composerOpen'));
    var mediaInput158b = $('postMediaInput');
    Object.defineProperty(mediaInput158b, 'files', { value: [smallVid158], configurable: true });
    mediaInput158b.dispatchEvent(new window.Event('change', { bubbles: true }));
    await waitFor(function () { return $('postMediaPrev').querySelector('video'); }, 15000);
    click(q('#postMediaPrev .cover-pick-btn'));
    var realPick158 = window.__wrPickMedia;
    window.__wrPickMedia = function (file, maxDim, cb) { cb({ src: 'data:image/jpeg;base64,PORTADA158', type: 'image' }); };
    var imgFile158 = new window.File([new Uint8Array(1024)], 'portada-158.jpg', { type: 'image/jpeg' });
    var coverInput158 = $('coverPickerImageInput');
    Object.defineProperty(coverInput158, 'files', { value: [imgFile158], configurable: true });
    coverInput158.dispatchEvent(new window.Event('change', { bubbles: true }));
    check('v1.5.8 carátula: subir una imagen propia la pone como portada (vista previa)', $('coverPickerPreview').getAttribute('src') === 'data:image/jpeg;base64,PORTADA158' && $('coverPickerPreviewKind').textContent.indexOf('Imagen propia') >= 0, 'preview=' + ($('coverPickerPreview').getAttribute('src') || ''));
    window.__wrPickMedia = realPick158;
    setVal($('postText'), 'Video con portada propia 1.5.8');
    click($('postPublish'));
    await waitFor(function () { var p = T.getState().posts.filter(function (x) { return x.text === 'Video con portada propia 1.5.8'; })[0]; return p && p.videoThumb === 'data:image/jpeg;base64,PORTADA158'; }, 15000);
    var postPortada158 = T.getState().posts.filter(function (x) { return x.text === 'Video con portada propia 1.5.8'; })[0];
    check('v1.5.8 carátula: la portada propia se guarda con la publicación y tiene prioridad sobre la automática', !!postPortada158 && postPortada158.videoThumb === 'data:image/jpeg;base64,PORTADA158', postPortada158 && postPortada158.videoThumb);
    // (5) Al editar se puede cambiar la carátula: de imagen propia a
    // fotograma y de fotograma a imagen propia.
    window.__wrEditPost(postPortada158.id);
    await sleep(150);
    click(q('#postMediaPrev .cover-pick-btn'));
    check('v1.5.8 carátula: al editar, el selector muestra la portada actual', $('coverPickerOverlay').classList.contains('on') && $('coverPickerPreview').getAttribute('src') === 'data:image/jpeg;base64,PORTADA158', 'preview=' + ($('coverPickerPreview').getAttribute('src') || ''));
    window.__wrCaptureVideoFrameAt = function (src, t, cb) { cb('data:image/jpeg;base64,MARCO158B'); };
    click($('coverPickerUseFrame'));
    window.__wrCaptureVideoFrameAt = realCapAt158;
    check('v1.5.8 carátula: al editar, cambiar a un fotograma actualiza la carátula', $('coverPickerPreview').getAttribute('src') === 'data:image/jpeg;base64,MARCO158B');
    click($('postPublish'));
    await waitFor(function () { var p = T.getState().posts.filter(function (x) { return x.id === postPortada158.id; })[0]; return p && p.videoThumb === 'data:image/jpeg;base64,MARCO158B'; }, 15000);
    check('v1.5.8 carátula: el cambio a fotograma se guarda al editar', (T.getState().posts.filter(function (x) { return x.id === postPortada158.id; })[0] || {}).videoThumb === 'data:image/jpeg;base64,MARCO158B');
    window.__wrEditPost(postPortada158.id);
    await sleep(150);
    click(q('#postMediaPrev .cover-pick-btn'));
    window.__wrPickMedia = function (file, maxDim, cb) { cb({ src: 'data:image/jpeg;base64,PORTADA158B', type: 'image' }); };
    var imgFile158b = new window.File([new Uint8Array(1024)], 'portada-158b.jpg', { type: 'image/jpeg' });
    var coverInput158b = $('coverPickerImageInput');
    Object.defineProperty(coverInput158b, 'files', { value: [imgFile158b], configurable: true });
    coverInput158b.dispatchEvent(new window.Event('change', { bubbles: true }));
    window.__wrPickMedia = realPick158;
    check('v1.5.8 carátula: al editar, cambiar a imagen propia actualiza la carátula', $('coverPickerPreview').getAttribute('src') === 'data:image/jpeg;base64,PORTADA158B');
    click($('postPublish'));
    await waitFor(function () { var p = T.getState().posts.filter(function (x) { return x.id === postPortada158.id; })[0]; return p && p.videoThumb === 'data:image/jpeg;base64,PORTADA158B'; }, 15000);
    check('v1.5.8 carátula: el cambio a imagen propia se guarda al editar', (T.getState().posts.filter(function (x) { return x.id === postPortada158.id; })[0] || {}).videoThumb === 'data:image/jpeg;base64,PORTADA158B');
    // (6) Anclar en el perfil: solo las publicaciones propias.
    var pinOwn158 = T.core.createPost(T.getState(), T.getState().me, { text: 'Publicación para anclar 1.5.8' });
    var pinOther158 = T.core.createPost(T.getState(), '1000000001', { text: 'Publicación de otro 1.5.8' });
    T.go('feed');
    await sleep(150);
    var cardOwn158 = q('#feed .post[data-post="' + pinOwn158.post.id + '"]');
    var cardOther158 = q('#feed .post[data-post="' + pinOther158.post.id + '"]');
    check('v1.5.8 anclar: la publicación propia muestra el botón Anclar', !!cardOwn158 && !!cardOwn158.querySelector('.pin-btn') && cardOwn158.querySelector('.pin-btn').textContent.indexOf('Anclar') >= 0, cardOwn158 && cardOwn158.innerHTML.slice(0, 300));
    check('v1.5.8 anclar: la publicación de otro NO muestra el botón Anclar', !!cardOther158 && !cardOther158.querySelector('.pin-btn'), cardOther158 && cardOther158.innerHTML.slice(0, 300));
    click(cardOwn158.querySelector('.pin-btn'));
    await sleep(100);
    check('v1.5.8 anclar: al anclar, el botón pasa a Anclada', (q('#feed .post[data-post="' + pinOwn158.post.id + '"] .pin-btn') || {}).textContent.indexOf('Anclada') >= 0);
    click(q('#bottomNav button[data-nav="profile"]'));
    await sleep(150);
    var ownHtml158 = $('ownProfile').innerHTML;
    check('v1.5.8 anclar: la publicación anclada queda fija arriba en Destacadas', ownHtml158.indexOf('Destacadas') >= 0 && ownHtml158.slice(ownHtml158.indexOf('Destacadas'), ownHtml158.indexOf('Mis publicaciones')).indexOf('Publicación para anclar 1.5.8') >= 0, ownHtml158.slice(0, 400));
    check('v1.5.8 anclar: la publicación anclada no se repite en la lista normal', ownHtml158.indexOf('Mis publicaciones') >= 0 && ownHtml158.slice(ownHtml158.indexOf('Mis publicaciones')).indexOf('Publicación para anclar 1.5.8') < 0);
    window.__wrTogglePin(pinOwn158.post.id);
    await sleep(100);
    click(q('#bottomNav button[data-nav="profile"]'));
    await sleep(150);
    var ownHtml158b = $('ownProfile').innerHTML;
    check('v1.5.8 anclar: al desanclar vuelve a la lista normal (después de Publicaciones)', ownHtml158b.indexOf('Mis publicaciones') >= 0 && ownHtml158b.slice(ownHtml158b.indexOf('Mis publicaciones')).indexOf('Publicación para anclar 1.5.8') >= 0 && (T.getState().profiles[T.getState().me].pinnedPosts || []).indexOf(pinOwn158.post.id) < 0, ownHtml158b.slice(0, 400));
    window.__wrTogglePin(pinOther158.post.id);
    check('v1.5.8 anclar: anclar la publicación de otro se rechaza', (T.getState().profiles[T.getState().me].pinnedPosts || []).indexOf(pinOther158.post.id) < 0);
    // ---- v2.1 botones del live sin encimarse y filtros con objetos ----
    window.__wrOpenLiveStart();
    setVal($('liveTitleInput'), 'Live botones v2.1');
    click($('liveStartBtn'));
    await waitFor(() => { const l = T.getCurrentLive(); return l && l.title === 'Live botones v2.1'; });
    const fcol21 = q('.live-fcol');
    check('v2.1 botones: la columna tiene solo cámara y zoom', !!fcol21 && !!fcol21.querySelector('#liveCamBtn') && !!fcol21.querySelector('#liveZoomOutBtn') && !!fcol21.querySelector('#liveZoomInBtn') && !fcol21.querySelector('#liveScreenBtn') && !fcol21.querySelector('#liveRecBtn'));
    check('v2.1 botones: pantalla y grabación están en su propia fila de la parte baja', !!q('#liveHostActions #liveScreenBtn') && !!q('#liveHostActions #liveRecBtn'));
    check('v2.1 botones: la fila de filtros está dentro de la parte baja', !!q('.live-bottom #liveFilterRow'));
    const fcolStyle21 = window.getComputedStyle(fcol21);
    check('v2.1 botones: la columna está anclada arriba con altura máxima y desplazamiento (no se encima de los filtros)', fcolStyle21.position === 'absolute' && fcolStyle21.top.indexOf('50%') < 0 && fcolStyle21.maxHeight.indexOf('480px') >= 0 && fcolStyle21.overflowY === 'auto' && fcolStyle21.flexDirection === 'column', 'top=' + fcolStyle21.top + ' maxHeight=' + fcolStyle21.maxHeight + ' overflowY=' + fcolStyle21.overflowY);
    check('v2.1 botones: la fila de filtros va en flujo normal (no absoluta)', window.getComputedStyle(q('#liveFilterRow')).position === 'static');
    // Filtros con objetos: se pueden elegir y se ven en la vista previa.
    check('v2.1 objetos: los 6 filtros de objetos aparecen en la fila (con separador Objetos)', ['sombrero', 'gafas', 'corona', 'orejas', 'bigote', 'marco'].every(function (id) { return !!q('#liveFilterRow [data-livefilter="' + id + '"]'); }) && q('#liveFilterRow').textContent.indexOf('Objetos') >= 0);
    q('#liveFilterRow [data-livefilter="sombrero"]').click();
    check('v2.1 objetos: al elegir el sombrero queda marcado y se ve en la vista previa', q('#liveFilterRow [data-livefilter="sombrero"]').classList.contains('on') && !$('liveFilterObjectPreview').classList.contains('hidden') && $('liveFilterObjectPreview').innerHTML.indexOf('<svg') >= 0, 'preview=' + $('liveFilterObjectPreview').innerHTML.slice(0, 120));
    T.setLiveFilter('belleza');
    check('v2.1 objetos: con un filtro de color la vista previa del objeto se quita', $('liveFilterObjectPreview').classList.contains('hidden'));
    check('v2.1 objetos: el dibujo del objeto se aplica sobre la imagen (lienzo simulado)', (function () {
      window.Path2D = function (d) { this.d = d; };
      var drawn = 0;
      var ctx = { save: function () {}, restore: function () {}, translate: function () {}, scale: function () {}, fill: function (p) { if (p && p.d) drawn++; } };
      var ok = ['sombrero', 'gafas', 'corona', 'orejas', 'bigote', 'marco'].every(function (id) { drawn = 0; return T.liveDrawFilterObject(ctx, id, 400, 800) === true && drawn >= 1; });
      return ok && T.liveDrawFilterObject(ctx, 'noexiste', 400, 800) === false;
    })());
    // Parar de grabar justo al empezar no rompe nada (carrera del trozo en vuelo).
    var recRace21 = await T.startLiveRecording();
    var stoppedRace21 = await T.stopLiveRecording(true);
    check('v2.1 carrera: parar de grabar justo al empezar no rompe la app y la grabación se guarda', errors.length === 0 && recRace21 === true && !!stoppedRace21 && stoppedRace21.status === 'done', errors.slice(0, 3).join(' | '));
    click($('liveEndBtn'));
    await waitFor(() => T.getCurrentLive() === null);
    // ---- v2.1 juegos de Play Store: imágenes reales, demos dentro de la app y calificaciones ----
    click(q('#bottomNav button[data-nav="profile"]'));
    const psCards21 = qa('#psGamesList .ps-card');
    const psSrcs21 = qa('#psGamesList img').map(function (img) { return img.getAttribute('src'); });
    check('v2.1 PS: cada icono y captura apunta a un archivo real en los assets (no a una ruta rota)', psSrcs21.length === 60 && psSrcs21.every(function (s) { return s && s.indexOf('ps-games/ps-games/') < 0 && fs.existsSync(path.join(__dirname, '..', 'assets', s)); }), 'n=' + psSrcs21.length);
    check('v2.1 PS: el texto no duplica palabras', psCards21.every(function (c) { return c.textContent.indexOf('opiniones opiniones') < 0 && c.textContent.indexOf('descargas descargas') < 0; }));
    check('v2.1 PS: los juegos de Play Store están antes que los minijuegos propios', (function () { var ps = $('psGamesList'); var grid = $('gamesGrid'); return !!ps && !!grid && (ps.compareDocumentPosition(grid) & 4) === 4; })());
    const mc21 = psCards21.filter(function (c) { return c.getAttribute('data-ps') === 'com.mojang.minecraftpe'; })[0];
    check('v2.1 demos: Minecraft dice que se juega aquí', !!mc21 && mc21.textContent.indexOf('Se juega aquí') >= 0 && mc21.textContent.indexOf('Probar aquí') >= 0, mc21 && mc21.textContent.slice(0, 200));
    calls.openInAppWeb = []; calls.openExternalUrl = [];
    mc21.querySelector('[data-ps-open]').click();
    check('v2.1 demos: la demo de Minecraft se abre dentro de la app (WebView interna, sin salir)', calls.openInAppWeb.some(function (o) { return o.url === 'https://classic.minecraft.net/'; }) && calls.openExternalUrl.length === 0, 'inApp=' + JSON.stringify(calls.openInAppWeb) + ' ext=' + calls.openExternalUrl.join(','));
    const pool21 = psCards21.filter(function (c) { return c.getAttribute('data-ps') === 'com.miniclip.eightballpool'; })[0];
    check('v2.1 demos: 8 Ball Pool dice que se juega aquí', !!pool21 && pool21.textContent.indexOf('Se juega aquí') >= 0);
    calls.openInAppWeb = [];
    pool21.querySelector('[data-ps-open]').click();
    check('v2.1 demos: la demo de 8 Ball Pool se abre dentro de la app', calls.openInAppWeb.some(function (o) { return o.url === 'https://www.miniclip.com/pool'; }));
    const oiaw21 = window.AndroidBridge.openInAppWeb;
    delete window.AndroidBridge.openInAppWeb;
    mc21.querySelector('[data-ps-open]').click();
    check('v2.1 demos: sin puente nativo, la demo se abre en la vista interna de la app (iframe)', $('webViewOverlay').classList.contains('on') && $('webViewFrame').getAttribute('src') === 'https://classic.minecraft.net/', 'src=' + $('webViewFrame').getAttribute('src'));
    window.AndroidBridge.openInAppWeb = oiaw21;
    click(q('[data-close="webViewOverlay"]'));
    // Calificaciones: la calificación llega al servidor y el promedio es el de verdad.
    T.setServerConnected(true);
    await T.resendUnsyncedGameRatings();
    await sleep(300);
    const robloxCard21 = qa('#psGamesList .ps-card').filter(function (c) { return c.getAttribute('data-ps') === 'com.roblox.client'; })[0];
    check('v2.1 calificar: la calificación pendiente se envía al servidor al reconectar', (calls.gameRatePosts || []).length >= 1 && calls.gameRatePosts.some(function (p) { return p.url === 'https://wordred-server.onrender.com/api/games/ps%3Acom.roblox.client/rate' && p.body.stars === 5; }), JSON.stringify(calls.gameRatePosts || []));
    check('v2.1 calificar: la petición va a la URL correcta (nunca a /undefined)', (calls.gameRatePosts || []).every(function (p) { return p.url.indexOf('/undefined') < 0 && p.url.indexOf('[object Object]') < 0; }));
    check('v2.1 calificar: el promedio visible es el del servidor con mi voto (4.3, no un número fijo)', !!robloxCard21 && robloxCard21.textContent.indexOf('4.3') >= 0, robloxCard21 && robloxCard21.textContent.slice(0, 200));
    robloxCard21.querySelector('[data-rate-ps]').click();
    [...$('rateGameStars').querySelectorAll('.rate-star')][2].click();
    click($('rateGameSave'));
    await sleep(300);
    const robloxCard21b = qa('#psGamesList .ps-card').filter(function (c) { return c.getAttribute('data-ps') === 'com.roblox.client'; })[0];
    check('v2.1 calificar: cambiar mi voto a 3 actualiza el promedio a 4.0', !!robloxCard21b && robloxCard21b.textContent.indexOf('4.0') >= 0, robloxCard21b && robloxCard21b.textContent.slice(0, 200));
    // ---- v1.5 logo ----
    check('v1.5 logo: el logo se ve en la cabecera y en el registro', !!q('.logo') && q('.logo').getAttribute('src') === 'logo.png' && !!q('.logoBig') && q('.logoBig').getAttribute('src') === 'logo.png');
    // ---- v1.5 grupos: portada y personalización ----
    const grp15 = T.core.createGroup(T.getState(), '5511111111', { name: 'Grupo Portada v1.5', desc: 'Para probar la portada' }).group;
    window.__wrOpenGroup(grp15.id);
    check('v1.5 grupos: el creador ve el botón de personalizar el grupo', $('groupDetail').textContent.indexOf('Personalizar grupo') >= 0);
    T.openGroupEdit(grp15.id);
    check('v1.5 grupos: el editor tiene portada, color y degradado', $('groupEditOverlay').classList.contains('on') && !!q('#groupEditAccents [data-accent="azul"]') && !!q('#groupEditGradients [data-gradient="mar"]'));
    const gAccentChip = q('#groupEditAccents [data-accent="azul"]');
    if (gAccentChip) gAccentChip.click();
    const gGradChip = q('#groupEditGradients [data-gradient="mar"]');
    if (gGradChip) gGradChip.click();
    check('v1.5 grupos: el color y el degradado elegidos quedan marcados', T.getGroupEditState().accent === 'azul' && T.getGroupEditState().gradient === 'mar');
    T.setGroupEditCover('data:image/jpeg;base64,AAAA', 'image');
    T.saveGroupEdit();
    await waitFor(() => { const g = T.getState().groups.filter(function (x) { return x.id === grp15.id; })[0]; return g && g.cover === 'https://wordred-server.onrender.com/media/m_dom_1.jpg'; });
    check('v1.5 grupos: la portada se sube al servidor y queda por URL', T.getState().groups.filter(function (x) { return x.id === grp15.id; })[0].cover === 'https://wordred-server.onrender.com/media/m_dom_1.jpg');
    check('v1.5 grupos: el detalle muestra la portada con el color y el degradado', !!q('#groupDetail .groupcover img') && q('#groupDetail .groupcover img').getAttribute('src') === 'https://wordred-server.onrender.com/media/m_dom_1.jpg' && $('groupDetail').innerHTML.indexOf('#2e86c1') >= 0);
    // portada con video
    T.openGroupEdit(grp15.id);
    T.setGroupEditCover('data:video/mp4;base64,AAAA', 'video');
    T.saveGroupEdit();
    await waitFor(() => { const g = T.getState().groups.filter(function (x) { return x.id === grp15.id; })[0]; return g && g.cover === 'https://wordred-server.onrender.com/media/m_dom_1.mp4'; });
    check('v1.5 grupos: la portada también puede ser video', !!q('#groupDetail .groupcover video') && q('#groupDetail .groupcover video').getAttribute('src') === 'https://wordred-server.onrender.com/media/m_dom_1.mp4');
    // cambio en vivo desde otro cliente
    T.handleServerMessage({ kind: 'group', groupId: grp15.id, group: Object.assign({}, T.getState().groups.filter(function (x) { return x.id === grp15.id; })[0], { cover: 'https://ejemplo.com/nueva.jpg', coverType: 'image', accent: 'verde', headerGradient: 'bosque' }) });
    check('v1.5 grupos: la portada y la personalización se ven en vivo para todos', !!q('#groupDetail .groupcover img') && q('#groupDetail .groupcover img').getAttribute('src') === 'https://ejemplo.com/nueva.jpg' && $('groupDetail').innerHTML.indexOf('#27ae60') >= 0);
    // solo creador/admin: un miembro normal no puede
    const grpBruno = T.core.createGroup(T.getState(), '5522222222', { name: 'Grupo de Bruno', desc: 'No es mío' }).group;
    T.core.joinGroup(T.getState(), '5511111111', grpBruno.id);
    window.__wrOpenGroup(grpBruno.id);
    check('v1.5 grupos: un miembro normal no ve el botón de personalizar', $('groupDetail').textContent.indexOf('Personalizar grupo') === -1);
    check('v1.5 grupos: un miembro normal no puede personalizar el grupo', T.core.editGroup(T.getState(), '5511111111', grpBruno.id, { cover: 'x' }).ok === false);
    // grupo de ventas
    const sg15 = T.core.createSalesGroup(T.getState(), '5511111111', { name: 'Ventas Portada v1.5', desc: 'Grupo de ventas', category: 'Otros', rules: '', photo: 'foto.jpg' }).group;
    window.__wrOpenSalesGroup(sg15.id);
    check('v1.5 grupos: el creador ve personalizar en el grupo de ventas y su foto se mantiene', $('salesGroupDetail').textContent.indexOf('Personalizar grupo') >= 0 && !!q('#salesGroupDetail img[src="foto.jpg"]'));
    T.openSalesGroupEdit(sg15.id);
    const sgAccentChip = q('#groupEditAccents [data-accent="dorado"]');
    if (sgAccentChip) sgAccentChip.click();
    T.saveGroupEdit();
    await waitFor(() => { const g = T.getState().salesGroups.filter(function (x) { return x.id === sg15.id; })[0]; return g && g.accent === 'dorado'; });
    check('v1.5 grupos: el grupo de ventas se personaliza y mantiene su foto', T.getState().salesGroups.filter(function (x) { return x.id === sg15.id; })[0].accent === 'dorado' && !!q('#salesGroupDetail img[src="foto.jpg"]') && $('salesGroupDetail').innerHTML.indexOf('#d4a017') >= 0);
    // cerrar sesión y eliminar cuenta (al final, porque cierran la sesión)
    window.__wrOpenSettings();
    click($('logoutBtn'));
    check('diálogo: cerrar sesión pide confirmación', confirmShown());
    click($('confirmNo'));
    check('diálogo: cancelar mantiene la sesión', window.__wordredTest.getState().me === '5511111111');
    click($('logoutBtn'));
    click($('confirmYes'));
    check('diálogo: confirmar cierra la sesión y se entra como invitado', window.__wordredTest.getState().me === null && $('authView').classList.contains('hidden') && !$('appView').classList.contains('hidden') && !$('guestBanner').classList.contains('hidden'));
    // ---- v2.1 modo invitado (tras cerrar sesión) ----
    check('v2.1 invitado: el inicio se ve sin registrarse', qa('#feed .post').length >= 4, 'posts: ' + qa('#feed .post').length);
    click(q('#bottomNav button[data-nav="profile"]'));
    check('v2.1 invitado: el perfil explica el modo invitado y ofrece verificar', $('ownProfile').textContent.indexOf('Estás explorando como invitado') >= 0 && $('ownProfile').textContent.indexOf('Verificar mi número') >= 0);
    click(q('#bottomNav button[data-nav="feed"]'));
    const guestPost21 = T.getState().posts[0];
    const likesBefore21 = Object.keys(guestPost21.likes || {}).length;
    window.__wrLike(guestPost21.id);
    check('v2.1 invitado: al dar me gusta se explica que hay que verificar el número', confirmShown() && $('confirmOverlay').textContent.indexOf('Verifica tu número') >= 0 && Object.keys(T.getState().posts.filter(function (p) { return p.id === guestPost21.id; })[0].likes || {}).length === likesBefore21);
    click($('confirmYes'));
    check('v2.1 invitado: confirmar abre la pantalla de registro', !$('authView').classList.contains('hidden'));
    setVal($('authPhone'), '5511111111');
    click($('authSendCode'));
    const code2 = calls.sendVerificationCode[calls.sendVerificationCode.length - 1];
    setVal($('authCode'), code2);
    click($('authVerify'));
    /* v1.5.14: la entrada es asíncrona (el perfil se carga del servidor
       si no está en este teléfono): se espera a entrar de verdad. */
    await waitFor(function () { return !$('appView').classList.contains('hidden') && window.__wordredTest.getState().me === '5511111111'; });
    check('vuelve a entrar tras cerrar sesión (con perfil existente entra directo)', !$('appView').classList.contains('hidden') && window.__wordredTest.getState().me === '5511111111');
    check('v2.1 invitado: tras verificar ya no se ve el aviso de invitado', $('guestBanner').classList.contains('hidden'));
    window.__wrLike(guestPost21.id);
    check('v2.1 invitado: tras verificar ya se puede reaccionar', T.getState().posts.filter(function (p) { return p.id === guestPost21.id; })[0].likes['5511111111'] === 'Me gusta');
    window.__wrOpenPost(guestPost21.id);
    setVal($('commentInput'), 'Ya verificado, ¡hola!');
    await window.__wrAddComment(); await tick();
    check('v2.1 invitado: tras verificar ya se puede comentar', T.getState().posts.filter(function (p) { return p.id === guestPost21.id; })[0].comments.some(function (c) { return c.text === 'Ya verificado, ¡hola!'; }));
    click(q('[data-close="postOverlay"]'));
    window.__wrOpenSettings();
    click($('deleteAccountBtn'));
    check('diálogo: eliminar cuenta pide confirmación', confirmShown());
    click($('confirmNo'));
    check('diálogo: cancelar mantiene la cuenta', !!window.__wordredTest.getState().profiles['5511111111']);
    click($('deleteAccountBtn'));
    click($('confirmYes'));
    check('diálogo: confirmar elimina la cuenta y se entra como invitado', !window.__wordredTest.getState().profiles['5511111111'] && $('authView').classList.contains('hidden') && !$('appView').classList.contains('hidden') && !$('guestBanner').classList.contains('hidden'));
    /* ---- v1.5.10: jalar para recargar el inicio (gesto real) ---- */
    // La cuenta se eliminó en una prueba anterior: se vuelve a crear el perfil
    // y se entra con él, como hacen las pruebas de invitado al verificar.
    var st1512 = T.getState();
    if (!st1512.profiles['5511111111']) T.core.completeProfile(st1512, '5511111111', { name: 'Ana DOM' });
    st1512.me = '5511111111';
    // ---- v1.5.12: música real sin pitido, play antes de elegir, llamadas
    // con audio, visor del chat, avisos con la app cerrada y Shorts ----
    /* Los medios no suenan de verdad en jsdom: play/pause se simulan. */
    window.HTMLMediaElement.prototype.play = function () { this._wrPlayed = true; this._wrPaused = false; return Promise.resolve(); };
    window.HTMLMediaElement.prototype.pause = function () { this._wrPaused = true; this._wrPlayed = false; };
    function wrPauseGetter(el) { try { Object.defineProperty(el, 'paused', { get: function () { return this._wrPaused !== false; }, configurable: true }); } catch (e) {} }

    // (1) Música automática: solo suena el audio real, nunca el pitido.
    var catPost = T.core.createPost(T.getState(), '5511111111', { text: 'Canción del catálogo', privacy: 'Público', song: T.core.songFromCatalog('cancion-1') }).post;
    var realSong = { id: 'custom-dom-1', title: 'Mi audio', artist: 'Mi audio', src: 'https://ejemplo/audio.mp3' };
    var realPost = T.core.createPost(T.getState(), '5511111111', { text: 'Con audio real', privacy: 'Público', song: realSong }).post;
    T.go('feed'); T.renderFeed();
    var muteBtn = window.document.querySelector('.songMuteBtn[data-song-for="' + catPost.id + '"]');
    check('v1.5.12 música: la canción del catálogo SÍ tiene audio real (1.5.34: la música ya suena)', !!muteBtn && muteBtn.disabled === false && muteBtn.textContent.indexOf('Sonido') >= 0);
    var songPostId = catPost.id;
    var catAudio = $('song_' + catPost.id);
    wrPauseGetter(catAudio);
    check('v1.5.12 música: al tocar Sonido suena el audio real del catálogo', T.toggleSong(songPostId) === true && catAudio._wrPlayed === true && muteBtn.textContent.indexOf('Sonando') >= 0);
    var realAudio = $('song_' + realPost.id);
    wrPauseGetter(realAudio);
    var realBtn = window.document.querySelector('.songMuteBtn[data-song-for="' + realPost.id + '"]');
    check('v1.5.12 música: la canción con archivo real sí ofrece Sonido', !!realBtn && realBtn.disabled === false && !!realAudio);
    T.toggleSong(realPost.id);
    check('v1.5.12 música: al tocar Sonido suena el audio real de la canción', realAudio._wrPlayed === true && realBtn.textContent.indexOf('Sonando') >= 0);

    // (2) Botón de play para escuchar antes de elegir.
    T.openSongPicker('composer', '');
    check('v1.5.12 play: el selector se abre con su botón Escuchar por canción', $('songPickerOverlay').classList.contains('on') && window.document.querySelectorAll('.songPreviewBtn').length > 0);
    var catPreview = window.document.querySelector('.songPreviewBtn[data-preview-id]');
    check('v1.5.12 play: el botón Escuchar del catálogo está habilitado (1.5.34: con archivo)', !!catPreview && catPreview.disabled === false);
    wrPauseGetter(T.getSongPreviewAudio());
    click(catPreview);
    check('v1.5.12 play: al tocar Escuchar suena la vista previa de la canción del catálogo', T.getSongPreviewAudio().getAttribute('src') === 'musica/cancion-1.mp3' && T.getSongPreviewAudio()._wrPlayed === true && catPreview.textContent.indexOf('Pausa') >= 0);
    click(catPreview);
    check('v1.5.12 play: al tocar Pausa se para la vista previa del catálogo', T.getSongPreviewAudio()._wrPaused === true && catPreview.textContent.indexOf('Escuchar') >= 0);
    T.setSongPickerCustom(realSong);
    var customPreview = window.document.querySelector('.songPreviewBtn[data-preview-custom]');
    check('v1.5.12 play: el audio subido queda como fila con su botón Escuchar', !!customPreview && customPreview.disabled === false);
    wrPauseGetter(T.getSongPreviewAudio());
    click(customPreview);
    check('v1.5.12 play: al tocar Escuchar suena la vista previa del audio subido', T.getSongPreviewAudio().getAttribute('src') === realSong.src && T.getSongPreviewAudio()._wrPlayed === true && customPreview.textContent.indexOf('Pausa') >= 0);
    click(customPreview);
    check('v1.5.12 play: al tocar Pausa se para la vista previa', T.getSongPreviewAudio()._wrPaused === true && customPreview.textContent.indexOf('Escuchar') >= 0);
    T.setComposerSong(realSong);
    check('v1.5.12 play: la fila de la canción del publicador tiene su botón Escuchar activo', !!$('postSongPlay') && $('postSongPlay').disabled === false);
    click($('postSongPlay'));
    check('v1.5.12 play: Escuchar en el publicador suena la canción elegida', T.getSongPreviewAudio().getAttribute('src') === realSong.src && T.getSongPreviewAudio()._wrPlayed === true);
    T.stopSongPreview();
    T.hideOverlay('songPickerOverlay');
    check('v1.5.12 play: al cerrar el selector se para la vista previa', T.getSongPreviewAudio()._wrPaused === true);

    // (4) Llamadas: el audio remoto siempre se escucha.
    var spBefore = calls.speakerphone.length;
    T.getCall().state = 'in-call'; T.getCall().peer = '5522222222'; T.getCall().withVideo = false; T.getCall().speaker = false;
    T.renderCallInCall();
    check('v1.5.12 llamadas: la llamada solo de voz tiene su elemento de audio', !!$('callRemoteAudio'));
    var fakeStream = { id: 'stream-dom', getTracks: function () { return []; } };
    wrPauseGetter($('callRemoteAudio'));
    T.attachCallRemoteStream(fakeStream);
    check('v1.5.12 llamadas: el audio remoto queda adjunto sin mutear y sonando', $('callRemoteAudio').srcObject === fakeStream && $('callRemoteAudio').muted === false && $('callRemoteAudio')._wrPlayed === true);
    check('v1.5.12 llamadas: el altavoz se aplica al entrar en la llamada', calls.speakerphone.length > spBefore && calls.speakerphone[calls.speakerphone.length - 1] === false);
    var pc2 = T.makePeerConnection();
    pc2.ontrack({ streams: [fakeStream] });
    check('v1.5.12 llamadas: ontrack del otro lado adjunta su audio', $('callRemoteAudio').srcObject === fakeStream);
    T.endCall(true);

    // (5) Fotos, videos y archivos del chat se abren.
    T.core.sendMessage(T.getState(), '5511111111', '1000000001', '', 'https://ejemplo/foto.jpg', 'image');
    T.core.sendMessage(T.getState(), '5511111111', '1000000001', '', 'https://ejemplo/video.mp4', 'video');
    window.__wrOpenChat('1000000001');
    var chatImg = window.document.querySelector('#chatMsgs img[onclick*="__wrOpenChatMedia"]');
    check('v1.5.12 archivos: la foto del chat se ve en el mensaje', !!chatImg);
    click(chatImg);
    check('v1.5.12 archivos: al tocar la foto se abre grande en el visor', $('chatMediaOverlay').classList.contains('on') && $('chatMediaBody').querySelector('img') !== null);
    T.hideOverlay('chatMediaOverlay');
    var chatVid = window.document.querySelector('#chatMsgs [onclick*="video"]');
    check('v1.5.12 archivos: el video del chat tiene su miniatura para tocar', !!chatVid);
    click(chatVid);
    check('v1.5.12 archivos: al tocar el video se reproduce grande en el visor', $('chatMediaOverlay').classList.contains('on') && $('chatMediaBody').querySelector('video') !== null);
    T.hideOverlay('chatMediaOverlay');
    var fileWrap = window.document.createElement('div'); fileWrap.innerHTML = T.fileCardHtml({ uri: 'https://ejemplo/informe.pdf', name: 'informe.pdf', mime: 'application/pdf', size: 1234 }); window.document.body.appendChild(fileWrap);
    var openBtn = fileWrap.querySelector('[onclick*="__wrOpenFile"]');
    check('v1.5.12 archivos: el archivo del chat tiene su botón Abrir', !!openBtn);
    var openedBefore = calls.openedFiles.length;
    openBtn.click();
    check('v1.5.12 archivos: Abrir manda el archivo al puente del teléfono', calls.openedFiles.length === openedBefore + 1 && String(calls.openedFiles[calls.openedFiles.length - 1].uri).indexOf('informe.pdf') >= 0);
    window.document.body.removeChild(fileWrap);

    // (6) Avisos con la app cerrada (servicio en segundo plano).
    check('v1.5.12 fondo: al entrar, la app arranca el servicio en segundo plano', calls.bgService.some(function (c) { return c.action === 'start' && c.phone === '5511111111'; }));
    calls.pendingCallJson = JSON.stringify({ from: '5522222222', offer: { type: 'offer', sdp: 'falso' }, withVideo: false });
    window.__onBackgroundCall('open');
    check('v1.5.12 fondo: la llamada que llega con la app cerrada abre la llamada entrante', T.getCall().state === 'incoming' && T.getCall().peer === '5522222222' && $('callOverlay').classList.contains('on'));
    T.endCall(true);
    // (7) Recordatorio de Shorts cada 3 horas.
    window.__onNotifTarget({ kind: 'shorts' });
    check('v1.5.12 shorts: al tocar el aviso de Shorts se abre la sección de Shorts', !!$('shortsOverlay') && $('shortsOverlay').classList.contains('on'));

    // (9) Lanzador de inicio 1.5.13: cajón sin carpetas, botón central.
    T.go('feed'); T.renderFeed();
    check('v1.5.13 lanzador: ya no hay sección de apps en el inicio', !$('launcherSection') && !$('launcherGrid'));
    var navBtns1513 = Array.prototype.slice.call(window.document.querySelectorAll('#bottomNav button'));
    var navLauncherIdx = navBtns1513.indexOf($('navLauncherBtn'));
    check('v1.5.13 lanzador: el botón rojo de 4 recuadros está en el centro de la barra', !!$('navLauncherBtn') && $('navLauncherBtn').classList.contains('bn-launcher') && navBtns1513.length === 5 && navLauncherIdx === 2);
    var feedWasOn = window.document.querySelector('#view-feed').classList.contains('on');
    click($('navLauncherBtn'));
    check('v1.5.13 lanzador: el botón central abre el cajón sin cambiar de vista', feedWasOn && $('appsDrawerOverlay').classList.contains('on'));
    var tiles = window.document.querySelectorAll('#appsDrawerGrid .launcherTile');
    var phoneTiles1513 = window.document.querySelectorAll('#appsDrawerGrid .launcherTile[data-launcher-kind="app"]');
    var fantoreTile1513 = window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-kind="featured-game"]');
    check('v1.5.13 lanzador: se ven las aplicaciones del teléfono en el cajón', phoneTiles1513.length === 6 && $('appsDrawerGrid').textContent.indexOf('Cámara') >= 0);
    check('1.5.54 cajón: la entrada fija de Fantore Resurrección va primera, con su icono real y borde dorado', tiles.length === 7 && !!fantoreTile1513 && tiles[0] === fantoreTile1513 && !!fantoreTile1513.querySelector('.launcherIconGold1549 img[src="fantore/icon.png"]') && fantoreTile1513.textContent.indexOf('Fantore Resurrección') >= 0);
    var firstIcon = window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-kind="app"] img, #appsDrawerGrid .launcherTile[data-launcher-kind="app"] span');
    var firstTileBg = window.getComputedStyle(window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-kind="app"]')).backgroundColor;
    check('v1.5.13 lanzador: los iconos van grandes y sin marco', !!firstIcon && firstIcon.style.width === '60px' && (firstTileBg === 'rgba(0, 0, 0, 0)' || firstTileBg === 'transparent' || firstTileBg === ''));
    // Animación al presionar (una app del teléfono; la entrada fija de
    // Fantore no se anima: su toque juega directamente).
    var tile0 = window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-kind="app"]');
    tile0.dispatchEvent(new window.Event('pointerdown', { bubbles: true, cancelable: true }));
    check('v1.5.13 lanzador: al presionar una app se anima (escala)', tile0.classList.contains('pressed'));
    tile0.dispatchEvent(new window.Event('pointerup', { bubbles: true, cancelable: true }));
    check('v1.5.13 lanzador: al soltar se quita la animación de presionar', !tile0.classList.contains('pressed'));
    // Tocar la entrada fija de Fantore abre el juego con el puente.
    click(fantoreTile1513);
    check('1.5.54 cajón: tocar la entrada de Fantore abre el juego (o lo descarga si no está)', calls.openedApps.indexOf('com.misterystore.fantoreresurreccion') >= 0, JSON.stringify(calls.openedApps));
    // Abrir una app: animación + puente.
    var camTile = window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.camara"]');
    click(camTile);
    check('v1.5.13 lanzador: al tocar una app se abre con animación', calls.openedApps.indexOf('com.demo.camara') >= 0 && camTile.classList.contains('opening'));
    // Menú al instante con las 3 opciones (sin esperar al puente).
    var msgsTile = window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.mensajes"]');
    var callsBefore = calls.openedApps.length + calls.uninstalledApps.length + calls.appInfoOpened.length + calls.sharedApps.length;
    T.openLauncherMenu(msgsTile);
    check('v1.5.13 lanzador: mantener presionada abre el menú al instante', $('launcherMenuOverlay').classList.contains('on') && $('launcherMenuBtns').textContent.indexOf('Desinstalar') >= 0 && $('launcherMenuBtns').textContent.indexOf('Información de la aplicación') >= 0 && $('launcherMenuBtns').textContent.indexOf('Compartir') >= 0 && $('launcherMenuBtns').textContent.indexOf('carpeta') < 0);
    check('v1.5.13 lanzador: el menú no espera al puente (sin llamadas nuevas)', calls.openedApps.length + calls.uninstalledApps.length + calls.appInfoOpened.length + calls.sharedApps.length === callsBefore);
    // Información de la aplicación.
    var infoBtn = Array.prototype.slice.call(window.document.querySelectorAll('#launcherMenuBtns button')).filter(function (b) { return b.textContent.indexOf('Información de la aplicación') >= 0; })[0];
    click(infoBtn);
    check('v1.5.13 lanzador: Información abre los ajustes de esa app', calls.appInfoOpened.indexOf('com.demo.mensajes') >= 0);
    // Compartir.
    T.openLauncherMenu(msgsTile);
    var shareBtn = Array.prototype.slice.call(window.document.querySelectorAll('#launcherMenuBtns button')).filter(function (b) { return b.textContent.indexOf('Compartir') >= 0; })[0];
    click(shareBtn);
    check('v1.5.13 lanzador: Compartir comparte el enlace de Play Store de la app', calls.sharedApps.indexOf('com.demo.mensajes') >= 0);
    // Desinstalar con confirmación.
    T.openLauncherMenu(msgsTile);
    var unBtn = Array.prototype.slice.call(window.document.querySelectorAll('#launcherMenuBtns button')).filter(function (b) { return b.textContent.indexOf('Desinstalar') >= 0; })[0];
    click(unBtn);
    click($('confirmYes')); await tick();
    check('v1.5.13 lanzador: desinstalar pide confirmación y quita la app del cajón', calls.uninstalledApps.indexOf('com.demo.mensajes') >= 0 && !window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.mensajes"]'));
    // Orden por nombre.
    click($('appsSortName'));
    var namesAlpha = Array.prototype.slice.call(window.document.querySelectorAll('#appsDrawerGrid .launcherName')).map(function (n) { return n.textContent; });
    check('v1.5.13 lanzador: "Por nombre" ordena las apps alfabéticamente (Fantore, fija, sigue primera)', namesAlpha.join(',') === 'Fantore Resurrección,Calculadora,Cámara,Galería,Mapas,Música', namesAlpha.join(','));
    // Reordenar en "Mi orden".
    click($('appsSortCustom'));
    var orderBefore = T.getState().launcher.layout.map(function (e) { return e.pkg; }).join('|');
    T.launcherReorderEntry(0, 2);
    var orderAfter = T.getState().launcher.layout.map(function (e) { return e.pkg; }).join('|');
    check('v1.5.13 lanzador: reordenar cambia el orden de las apps', orderBefore !== orderAfter);
    var namesCustom = Array.prototype.slice.call(window.document.querySelectorAll('#appsDrawerGrid .launcherTile[data-launcher-kind="app"] .launcherName')).map(function (n) { return n.textContent; });
    check('v1.5.13 lanzador: en "Mi orden" se ve el orden personalizado', namesCustom[2] === 'Cámara');
    // Persistencia.
    var savedState = JSON.parse(window.localStorage.getItem('wordred_state_v1'));
    check('v1.5.13 lanzador: el orden y el modo se guardan al cerrar la app', !!savedState && !!savedState.launcher && Array.isArray(savedState.launcher.layout) && savedState.launcher.layout.every(function (e) { return e.kind === 'app'; }) && savedState.launcher.sort === 'custom');
    // La X regresa al inicio.
    click($('appsDrawerClose'));
    check('v1.5.13 lanzador: la X del cajón lo cierra y se sigue en el inicio', !$('appsDrawerOverlay').classList.contains('on') && window.document.querySelector('#view-feed').classList.contains('on'));
    // Lanzador predeterminado en Ajustes.
    window.__wrOpenSettings();
    check('v1.5.13 lanzador: en Ajustes se ve si WordRed ya es el lanzador', $('homeRoleStatus').textContent.indexOf('puede ser') >= 0);
    click($('homeRoleBtn'));
    check('v1.5.13 lanzador: el botón pide ser el lanzador predeterminado', calls.homeRoleReq.length === 1);
    calls.isDefaultHome = true;
    window.__onHomeRoleResult(true);
    check('v1.5.13 lanzador: al aceptar, Ajustes dice que WordRed ya es el lanzador', $('homeRoleStatus').textContent.indexOf('ya es tu lanzador') >= 0);
    T.hideOverlay('settingsOverlay');
    // Flecha de arriba.
    click($('statusBarArrow'));
    check('v1.5.13 flecha: la flecha revela la barra de estado para bajarla deslizando', calls.revealedStatusBar.length === 1);

    // (10) v1.5.14: el cajón SÍ se desplaza + barra sin Avisos, Amigos ni Mensajes (v1.5.16: tampoco Mercado; 5 botones).
    // Barra: 5 botones, Aplicaciones 3.º (centro), sin Avisos, Amigos, Mensajes ni Mercado.
    var navBtns1514 = Array.prototype.slice.call(window.document.querySelectorAll('#bottomNav button'));
    var navLabels1514 = navBtns1514.map(function (b) { return b.textContent; }).join('|');
    check('v1.5.14 barra: 5 botones sin Avisos, Amigos, Mensajes ni Mercado, con Aplicaciones en el centro', navBtns1514.length === 5 && navBtns1514.indexOf($('navLauncherBtn')) === 2 && navLabels1514.indexOf('Avisos') < 0 && navLabels1514.indexOf('Amigos') < 0 && navLabels1514.indexOf('Mensajes') < 0 && navLabels1514.indexOf('Mercado') < 0 && $('navLauncherBtn').getAttribute('aria-label') === 'Aplicaciones' && $('navLauncherBtn').textContent.trim() === '' && window.getComputedStyle($('navLauncherBtn').querySelector('.ic svg')).width === '44px' && !$('navNotifBadge') && !$('navReqBadge') && !$('navMsgBadge'));
    // Seguidores está en el Perfil ANTES de Ajustes (1.5.32: Amigos salió de la fila; su insignia vive en Seguidores) y abre la vista.
    T.go('profile');
    var profBtns = Array.prototype.slice.call(window.document.querySelectorAll('#ownProfile button'));
    var profIdxFollowers = profBtns.findIndex(function (b) { return b.getAttribute('aria-label') === 'Seguidores'; });
    var profIdxSettings = -1;
    profBtns.forEach(function (b, i) { if (b.getAttribute('aria-label') === 'Ajustes') profIdxSettings = i; });
    check('v1.5.14 perfil: Seguidores está en el Perfil ANTES del botón de Ajustes y no hay botón Amigos', profIdxFollowers >= 0 && profIdxSettings >= 0 && profIdxFollowers < profIdxSettings && !$('profileFriendsBtn'));
    click(q('#ownProfile button[aria-label="Seguidores"]'));
    check('v1.5.14 perfil: el botón Seguidores abre la vista de amigos', window.document.querySelector('#view-friends').classList.contains('on'));
    // Avisos sigue por la campana del encabezado.
    click($('hdrBell'));
    check('v1.5.14 barra: Avisos sigue entrando por la campana del encabezado', window.document.querySelector('#view-notifs').classList.contains('on'));
    // Mensajes está arriba, después de la lupa, y abre la vista.
    var hdrBtns = Array.prototype.slice.call(window.document.querySelectorAll('header button'));
    check('v1.5.14 barra: Mensajes está arriba justo después de la lupa', !!$('hdrMessages') && hdrBtns.indexOf($('hdrSearch')) >= 0 && hdrBtns.indexOf($('hdrMessages')) === hdrBtns.indexOf($('hdrSearch')) + 1 && !!$('hdrMsgBadge'));
    click($('hdrMessages'));
    check('v1.5.14 barra: el botón Mensajes de arriba abre la vista de mensajes', window.document.querySelector('#view-messages').classList.contains('on'));
    // Cajón con desplazamiento real: 45 apps, todas se dibujan.
    var manyApps = [];
    for (var ai = 0; ai < 45; ai++) manyApps.push({ pkg: 'com.demo.app' + ai, name: 'App ' + (ai < 10 ? '0' + ai : ai), icon: '' });
    /* v1.5.21: el cajón se abre desde la caché y la lista se actualiza
       por detrás leyendo el puente; el puente (el "teléfono" simulado)
       tiene que devolver las mismas 45 apps, si no la actualización
       las corregiría a las 6 de demostración. */
    var origList1514 = window.AndroidBridge.listInstalledApps;
    window.AndroidBridge.listInstalledApps = function () { return JSON.stringify(manyApps); };
    click($('navLauncherBtn'));
    T.setInstalledApps(manyApps);
    var tiles45 = window.document.querySelectorAll('#appsDrawerGrid .launcherTile');
    check('v1.5.14 cajón: con 45 apps se dibujan todas en el cajón (más la entrada fija de Fantore)', tiles45.length === 46 && tiles45[45].textContent.indexOf('App 44') >= 0);
    // El contenedor tiene desplazamiento y la barra roja se ve.
    var scEl = $('appsDrawerScroll');
    check('v1.5.14 cajón: el contenedor de la cuadrícula tiene overflow-y auto', window.getComputedStyle(scEl).overflowY === 'auto' && !!$('appsDrawerScrollbar') && !!$('appsDrawerThumb'));
    // Métricas simuladas (jsdom no calcula el diseño): 1600 px de
    // contenido en 400 px visibles.
    var metrics = { total: 1600, visible: 400, top: 0 };
    Object.defineProperty(scEl, 'scrollHeight', { get: function () { return metrics.total; }, configurable: true });
    Object.defineProperty(scEl, 'clientHeight', { get: function () { return metrics.visible; }, configurable: true });
    Object.defineProperty(scEl, 'scrollTop', { get: function () { return metrics.top; }, set: function (v) { metrics.top = v; }, configurable: true });
    T.updateAppsDrawerScrollbar();
    var thumb = $('appsDrawerThumb');
    check('v1.5.14 cajón: con 45 apps la barra roja se ve y el pulgar mide lo que se ve', $('appsDrawerScrollbar').classList.contains('on') && thumb.style.height === '25%' && thumb.style.top === '0%');
    metrics.top = 600;
    T.updateAppsDrawerScrollbar();
    check('v1.5.14 cajón: al desplazar a la mitad, el pulgar baja en proporción', thumb.style.top === '37.5%');
    metrics.top = 1200;
    T.updateAppsDrawerScrollbar();
    check('v1.5.14 cajón: desplazando hasta abajo se llega a la última app', thumb.style.top === '75%' && tiles45[45].textContent.indexOf('App 44') >= 0);
    // Arrastrar la propia barra desplaza el cajón.
    var track = $('appsDrawerScrollbar');
    track.getBoundingClientRect = function () { return { top: 0, left: 0, right: 10, bottom: 400, width: 10, height: 400, x: 0, y: 0 }; };
    thumb.getBoundingClientRect = function () { return { top: 150, left: 2, right: 8, bottom: 250, width: 6, height: 100, x: 2, y: 150 }; };
    metrics.top = 0;
    thumb.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 200 }));
    window.document.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: 5, clientY: 300 }));
    window.document.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 5, clientY: 300 }));
    check('v1.5.14 cajón: arrastrar la barra desplaza el cajón', metrics.top === 400);
    // Deslizar vertical rápido NO reordena (antes sí lo hacía: cualquier
    // movimiento >12 px empezaba el arrastre).
    var orderBeforeSwipe = T.getState().launcher.layout.map(function (e) { return e.pkg; }).join('|');
    var tileA = window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-kind="app"]');
    tileA.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 40, clientY: 100 }));
    window.document.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: 40, clientY: 180 }));
    check('v1.5.14 cajón: deslizar vertical rápido no inicia el arrastre', !tileA.classList.contains('dragging') && !window.document.querySelector('.launcherTile.dragging'));
    window.document.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 40, clientY: 180 }));
    check('v1.5.14 cajón: el deslizamiento no cambia el orden de las apps', T.getState().launcher.layout.map(function (e) { return e.pkg; }).join('|') === orderBeforeSwipe);
    // Mantener presionado 350 ms y luego arrastrar SÍ reordena.
    var tileB = window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-kind="app"]');
    tileB.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 40, clientY: 100 }));
    await new Promise(function (r) { setTimeout(r, 400); });
    window.document.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, cancelable: true, clientX: 40, clientY: 180 }));
    check('v1.5.14 cajón: mantener presionado y arrastrar sí inicia el arrastre para reordenar', tileB.classList.contains('dragging'));
    window.document.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, cancelable: true, clientX: 40, clientY: 180 }));
    // Al desinstalar una app el cajón sigue desplazándose bien.
    T.core.launcherRemoveApp(T.getState(), 'com.demo.app0');
    T.renderAppsDrawer();
    check('v1.5.14 cajón: al desinstalar una app quedan 44 y la barra sigue visible', window.document.querySelectorAll('#appsDrawerGrid .launcherTile').length === 45 && $('appsDrawerScrollbar').classList.contains('on'));
    window.AndroidBridge.listInstalledApps = origList1514;
    // Encabezado de las publicaciones del perfil bien acomodado
    // (Destacadas y lista normal): avatar, columna flexible y acciones
    // en su propio grupo que baja de fila en vez de aplastar el texto.
    T.go('profile');
    var profHead = window.document.querySelector('#ownProfile .post .head');
    check('v1.5.14 perfil: el encabezado tiene avatar, columna de nombre y acciones agrupadas', !!profHead && !!profHead.querySelector('.avatar') && !!profHead.querySelector('.who') && !!profHead.querySelector('.headActions'));
    check('v1.5.14 perfil: el encabezado puede bajar las acciones a su propia fila', !!profHead && window.getComputedStyle(profHead).flexWrap === 'wrap');
    var profWho = profHead ? profHead.querySelector('.who') : null;
    check('v1.5.14 perfil: la columna de nombre y datos tiene ancho mínimo y no se aplasta', !!profWho && parseInt(window.getComputedStyle(profWho).minWidth) >= 140);
    check('v1.5.14 perfil: el nombre se ve completo y los datos van en líneas limpias', !!profWho && profWho.querySelector('b').textContent.trim().length > 3 && profWho.querySelector('span').textContent.indexOf('·') >= 0 && profWho.querySelector('span').textContent.length > 10);
    var profActions = profHead ? profHead.querySelector('.headActions').querySelectorAll('button') : [];
    check('v1.5.14 perfil: las acciones (editar, promocionar, borrar, anclar, guardar) están en su grupo — 1.5.47 añade Promocionar', profActions.length === 5 && !!profHead.querySelector('.headActions .wOptRound1542[aria-label="Promocionar publicación"]') && profHead.querySelector('.headActions').textContent.indexOf('Ancla') >= 0);
    // El mismo encabezado en el inicio (se comparte postCardHtml).
    T.go('feed'); T.renderFeed();
    var feedHead = window.document.querySelector('#feed .post .head');
    check('v1.5.14 inicio: el encabezado del inicio también lleva las acciones agrupadas', !!feedHead && !!feedHead.querySelector('.headActions') && window.getComputedStyle(feedHead).flexWrap === 'wrap');

    // ---- v1.5.14 (resto): borrado real optimista, enlaces con tarjeta,
    // botón sin texto, Shorts por encima y compartir fuera de verdad ----
    // Borrado optimista: desaparece al instante, aunque el servidor
    // tarde; si el servidor no confirma, vuelve a su sitio.
    var origRetry14 = T.core.serverFetchWithRetry;
    var delResolve14 = null;
    T.core.serverFetchWithRetry = function () { return new Promise(function (res) { delResolve14 = res; }); };
    var delPost14 = T.core.createPost(T.getState(), T.getState().me, { text: 'Borrado instantáneo 1.5.14' }).post;
    T.go('feed');
    window.__wrDeletePost(delPost14.id);
    click($('confirmYes'));
    await tick();
    check('v1.5.14 borrado: al confirmar, la publicación desaparece AL INSTANTE (antes de que responda el servidor)', !T.getState().posts.some(function (p) { return p.id === delPost14.id; }) && !q('#feed .post[data-post="' + delPost14.id + '"]'));
    check('v1.5.14 borrado: la lápida impide que resucite al sincronizar', T.core.isPostDeleted(T.getState(), delPost14.id));
    delResolve14({ ok: true, data: { ok: true } });
    await tick();
    check('v1.5.14 borrado: cuando el servidor confirma, la publicación se queda borrada', !T.getState().posts.some(function (p) { return p.id === delPost14.id; }) && $('toast').textContent.indexOf('Publicación borrada.') >= 0);
    var delPost14b = T.core.createPost(T.getState(), T.getState().me, { text: 'Borrado que falla 1.5.14' }).post;
    T.go('feed');
    window.__wrDeletePost(delPost14b.id);
    click($('confirmYes'));
    await tick();
    check('v1.5.14 borrado: también desaparece al instante aunque el servidor vaya a fallar', !T.getState().posts.some(function (p) { return p.id === delPost14b.id; }));
    delResolve14({ ok: false, error: 'No se pudo conectar: sin red' });
    await tick();
    check('v1.5.15 borrado: si el servidor no responde, la publicación NO vuelve (se queda oculta, con lápida, y el borrado queda encolado para borrarlo en silencio al despertar)', !T.getState().posts.some(function (p) { return p.id === delPost14b.id; }) && !q('#feed .post[data-post="' + delPost14b.id + '"]') && T.core.isPostDeleted(T.getState(), delPost14b.id) && T.getState().pendingQueue.some(function (it) { return it.kind === 'http' && it.method === 'DELETE' && it.path.indexOf(delPost14b.id) >= 0; }) && $('toast').textContent.indexOf('Publicación oculta') >= 0);
    T.core.serverFetchWithRetry = origRetry14;
    T.core.deletePost(T.getState(), T.getState().me, delPost14b.id);
    T.getState().pendingQueue = T.getState().pendingQueue.filter(function (it) { return !(it.path && it.path.indexOf(delPost14b.id) >= 0); });
    T.core.unmarkPostDeleted(T.getState(), delPost14b.id);
    /* 404: la publicación ya no existe en el servidor → se queda borrada, sin encolar. */
    var delPost14c = T.core.createPost(T.getState(), T.getState().me, { text: 'Borrado con 404 1.5.15' }).post;
    T.core.serverFetchWithRetry = function () { return Promise.resolve({ ok: false, status: 404, error: 'No encontrado.' }); };
    T.go('feed');
    window.__wrDeletePost(delPost14c.id);
    click($('confirmYes'));
    await tick();
    check('v1.5.15 borrado: si el servidor dice 404, la publicación se queda borrada (ya no existe ahí) y no se encola nada', !T.getState().posts.some(function (p) { return p.id === delPost14c.id; }) && T.core.isPostDeleted(T.getState(), delPost14c.id) && !T.getState().pendingQueue.some(function (it) { return it.path && it.path.indexOf(delPost14c.id) >= 0; }) && $('toast').textContent.indexOf('Publicación borrada.') >= 0);
    T.core.serverFetchWithRetry = origRetry14;
    T.core.deletePost(T.getState(), T.getState().me, delPost14c.id);
    T.core.unmarkPostDeleted(T.getState(), delPost14c.id);
    // Borrar desde el perfil y desde Destacadas.
    var profPost14 = T.core.createPost(T.getState(), T.getState().me, { text: 'Para borrar desde el perfil 1.5.14' }).post;
    T.go('profile');
    check('v1.5.14 borrado: la publicación se ve en el perfil', !!q('#ownProfile [data-post="' + profPost14.id + '"]'));
    window.__wrDeletePost(profPost14.id);
    click($('confirmYes'));
    await tick();
    check('v1.5.14 borrado: borrar desde el perfil la quita al instante', !T.getState().posts.some(function (p) { return p.id === profPost14.id; }) && !q('#ownProfile [data-post="' + profPost14.id + '"]'));
    var pinPost14 = T.core.createPost(T.getState(), T.getState().me, { text: 'Para borrar desde Destacadas 1.5.14' }).post;
    window.__wrTogglePin(pinPost14.id);
    T.go('profile');
    check('v1.5.14 borrado: la publicación anclada se ve en Destacadas', !!q('#ownProfile [data-post="' + pinPost14.id + '"]'));
    window.__wrDeletePost(pinPost14.id);
    click($('confirmYes'));
    await tick();
    check('v1.5.14 borrado: borrar desde Destacadas la quita del perfil al instante', !T.getState().posts.some(function (p) { return p.id === pinPost14.id; }) && !q('#ownProfile [data-post="' + pinPost14.id + '"]'));
    // Enlaces con tarjeta (recuadro) y enlace crudo escondido.
    var linkPost14 = T.core.createPost(T.getState(), T.getState().me, { text: 'Miren esta página https://ejemplo.com/pagina ¡qué buena!' }).post;
    T.go('feed');
    var linkCard14 = q('#feed .post[data-post="' + linkPost14.id + '"]');
    check('v1.5.14 enlaces: la publicación con enlace muestra el recuadro y NO el enlace crudo', !!linkCard14 && !!linkCard14.querySelector('.linkcard') && linkCard14.textContent.indexOf('https://ejemplo.com/pagina') < 0 && linkCard14.querySelector('.linkcard').textContent.indexOf('ejemplo.com') >= 0);
    check('v1.5.14 enlaces: las palabras del texto se siguen viendo', !!linkCard14 && linkCard14.textContent.indexOf('Miren esta página') >= 0 && linkCard14.textContent.indexOf('¡qué buena!') >= 0);
    var titlePost14 = T.core.createPost(T.getState(), T.getState().me, { text: 'Esta es la página https://titulo-prueba.com/pagina' }).post;
    T.go('feed');
    await waitFor(function () { var c = q('#feed .post[data-post="' + titlePost14.id + '"] .linkcard .lktitle'); return !!c && c.textContent.indexOf('La página de prueba') >= 0; }, 5000);
    check('v1.5.14 enlaces: cuando se puede leer la página, la tarjeta muestra su título', (function () { var c = q('#feed .post[data-post="' + titlePost14.id + '"] .linkcard .lktitle'); return !!c && c.textContent.indexOf('La página de prueba') >= 0; })());
    var plainPost14 = T.core.createPost(T.getState(), T.getState().me, { text: 'Publicación sin enlaces 1.5.14' }).post;
    T.go('feed');
    var plainCard14 = q('#feed .post[data-post="' + plainPost14.id + '"]');
    check('v1.5.14 enlaces: una publicación sin enlace no cambia (sin recuadro, texto intacto)', !!plainCard14 && !plainCard14.querySelector('.linkcard') && plainCard14.textContent.indexOf('Publicación sin enlaces 1.5.14') >= 0);
    T.core.deletePost(T.getState(), T.getState().me, linkPost14.id);
    T.core.deletePost(T.getState(), T.getState().me, titlePost14.id);
    T.core.deletePost(T.getState(), T.getState().me, plainPost14.id);
    // Botón rojo sin texto, más grande, cuadros más bonitos.
    check('v1.5.14 botón: el botón rojo no lleva texto, solo el icono', $('navLauncherBtn').textContent.trim() === '' && !!$('navLauncherBtn').querySelector('svg') && $('navLauncherBtn').getAttribute('aria-label') === 'Aplicaciones');
    check('v1.5.14 botón: el icono mide 44 px (más grande que los 28 px de los otros)', window.getComputedStyle($('navLauncherBtn').querySelector('.ic svg')).width === '44px');
    check('v1.5.14 botón: el título Aplicaciones sigue dentro del cajón', !!q('#appsDrawerOverlay h2') && q('#appsDrawerOverlay h2').textContent === 'Aplicaciones');
    // Shorts: like y comentario de verdad, por encima del visor.
    // 1.5.34: hay 1 video de ejemplo (el clip neutro de la ciudad); se usa un video real creado aquí.
    var vidPost14 = T.core.createPost(T.getState(), T.getState().me, { text: 'Video para Shorts 1.5.14', media: 'https://srv/video14.mp4', mediaType: 'video' }).post;
    T.openShorts(vidPost14.id);
    var likeCountBefore14 = $('shortsLikeCount').textContent;
    click($('shortsLike'));
    check('v1.5.14 shorts: el like del short (video) sube el contador, se pinta y se guarda', $('shortsLikeCount').textContent !== likeCountBefore14 && $('shortsLike').classList.contains('on') && T.getState().posts.filter(function (p) { return p.id === vidPost14.id; })[0].likes[T.getState().me] === 'Me gusta');
    click($('shortsLike'));
    check('v1.5.14 shorts: tocar de nuevo quita el like del short', !$('shortsLike').classList.contains('on') && !T.getState().posts.filter(function (p) { return p.id === vidPost14.id; })[0].likes[T.getState().me]);
    click($('shortsComment'));
    check('v1.5.14 shorts: comentar un short de video abre su detalle POR ENCIMA del visor', $('postOverlay').classList.contains('on') && Number(window.getComputedStyle($('postOverlay')).zIndex) > Number(window.getComputedStyle($('shortsOverlay')).zIndex));
    setVal($('commentInput'), 'Comentario desde Shorts 1.5.14');
    await window.__wrAddComment(); await tick();
    check('v1.5.14 shorts: desde el detalle del short se puede comentar', T.getState().posts.filter(function (p) { return p.id === vidPost14.id; })[0].comments.some(function (c) { return c.text === 'Comentario desde Shorts 1.5.14'; }));
    click(q('[data-close="postOverlay"]'));
    var demoStory14 = T.getState().stories.filter(function (s) { return s.isDemo; })[0];
    T.openShorts(demoStory14.id);
    click($('shortsComment'));
    check('v1.5.14 shorts: comentar una historia abre sus comentarios POR ENCIMA del visor', $('shortsCommentsOverlay').classList.contains('on') && Number(window.getComputedStyle($('shortsCommentsOverlay')).zIndex) > Number(window.getComputedStyle($('shortsOverlay')).zIndex));
    click(q('[data-close="shortsCommentsOverlay"]'));
    T.openShorts();
    var shortCountBefore14 = $('shortsCount').textContent;
    var swEv14 = function (type, y) { var ev = new window.Event(type, { bubbles: true, cancelable: true }); ev.touches = [{ clientY: y }]; ev.changedTouches = [{ clientY: y }]; $('shortsBody').dispatchEvent(ev); };
    swEv14('touchstart', 300);
    swEv14('touchend', 200);
    check('v1.5.14 shorts: deslizar hacia arriba pasa al siguiente short (el gesto sigue vivo)', $('shortsCount').textContent !== shortCountBefore14);
    click($('shortsClose'));
    // Compartir fuera de verdad (hoja de elección + puente).
    var sharePost14 = T.core.createPost(T.getState(), T.getState().me, { text: 'Compartan esto 1.5.14' }).post;
    T.go('feed');
    window.__wrShare(sharePost14.id);
    check('v1.5.14 compartir: Compartir abre la hoja de elección por encima de todo', $('shareChoiceOverlay').classList.contains('on') && Number(window.getComputedStyle($('shareChoiceOverlay')).zIndex) > Number(window.getComputedStyle($('shortsOverlay')).zIndex));
    var sharedBefore14 = calls.shared.length;
    click($('shareChoiceOutside'));
    check('v1.5.14 compartir: elegir otras apps llama a la hoja con el texto de la publicación', calls.shared.length === sharedBefore14 + 1 && String(calls.shared[calls.shared.length - 1].text || '').indexOf('Compartan esto 1.5.14') >= 0);
    window.__wrShare(sharePost14.id);
    click($('shareChoiceInside'));
    check('v1.5.14 compartir: compartir dentro republica en el muro', T.getState().posts.some(function (p) { return p.sharedFrom && p.sharedFrom.id === sharePost14.id; }));
    T.openShorts(vidPost14.id);
    click($('shortsShare'));
    check('v1.5.14 compartir: compartir desde Shorts abre la misma hoja por encima del visor', $('shareChoiceOverlay').classList.contains('on'));
    var sharedBefore14b = calls.shared.length;
    click($('shareChoiceOutside'));
    check('v1.5.14 compartir: desde Shorts, otras apps comparte el short fuera', calls.shared.length === sharedBefore14b + 1);
    click($('shortsClose'));
    T.core.deletePost(T.getState(), T.getState().me, sharePost14.id);
    window.document.querySelectorAll('.overlay.on').forEach(function (o) { o.classList.remove('on'); });
    T.go('feed');

    // ---- v1.5.14 (más): Ajustes sin texto, Tu actividad, grupos y
    // cuentas ya creadas que cargan su perfil solas ----
    // Ajustes: solo el engranaje, sin texto visible, y sigue funcionando.
    T.go('profile');
    var settingsBtn14 = window.document.querySelector('#ownProfile button[aria-label="Ajustes"]');
    check('v1.5.14 Ajustes: el botón no muestra texto, solo el engranaje', !!settingsBtn14 && settingsBtn14.textContent.trim() === '' && !!settingsBtn14.querySelector('svg') && settingsBtn14.getAttribute('aria-label') === 'Ajustes');
    click(settingsBtn14);
    check('v1.5.14 Ajustes: el botón del engranaje sigue abriendo Ajustes', $('settingsOverlay').classList.contains('on'));
    click(q('[data-close="settingsOverlay"]'));
    // Tu actividad: botón en el perfil después de Seguidores.
    var profBtns14 = Array.prototype.slice.call(window.document.querySelectorAll('#ownProfile button'));
    var profIdxActivity14 = profBtns14.findIndex(function (b) { return b.getAttribute('aria-label') === 'Tu actividad'; });
    var profIdxFollowers14 = profBtns14.findIndex(function (b) { return b.getAttribute('aria-label') === 'Seguidores'; });
    check('v1.5.14 actividad: el botón Tu actividad está en el perfil después de Seguidores', profIdxActivity14 >= 0 && profIdxFollowers14 >= 0 && profIdxActivity14 > profIdxFollowers14);
    window.__wrOpenActivity();
    check('v1.5.14 actividad: al tocarlo se abre la vista de Tu actividad', window.document.querySelector('#view-activity').classList.contains('on'));
    var actItems14 = window.document.querySelectorAll('#activityList .card');
    check('v1.5.14 actividad: la vista muestra la actividad (publicaciones, likes, comentarios, compartidos)', actItems14.length >= 1);
    click(actItems14[0]);
    check('v1.5.14 actividad: tocar un elemento abre su publicación', $('postOverlay').classList.contains('on'));
    click(q('[data-close="postOverlay"]'));
    T.go('profile');
    // Mensajes grupales: crear, escribir, integrantes, salir.
    var friendPhones14 = Object.keys(T.getState().profiles).filter(function (p) { return p !== T.getState().me; }).slice(0, 3);
    T.getState().friends[T.getState().me] = friendPhones14;
    T.go('messages');
    check('v1.5.14 grupos: hay botón de Nuevo grupo en Mensajes', !!$('newGroupChatBtn'));
    click($('newGroupChatBtn'));
    check('v1.5.14 grupos: Nuevo grupo abre el creador con mis amigos', $('groupChatCreateOverlay').classList.contains('on') && window.document.querySelectorAll('#groupChatFriends input[type="checkbox"]').length === 3);
    var friendBoxes14 = window.document.querySelectorAll('#groupChatFriends input[type="checkbox"]');
    friendBoxes14[0].checked = true;
    friendBoxes14[1].checked = true;
    setVal($('groupChatName'), 'Grupo de prueba 1.5.14');
    window.__wrCreateGroupChat();
    var g14 = T.getState().groupChats[T.getState().groupChats.length - 1];
    check('v1.5.14 grupos: crear el grupo lo abre con su nombre e integrantes', !!g14 && g14.name === 'Grupo de prueba 1.5.14' && g14.participants.length === 3 && $('chatOverlay').classList.contains('on') && $('chatHead').textContent.indexOf('Grupo de prueba 1.5.14') >= 0 && $('chatHead').textContent.indexOf('3 integrantes') >= 0);
    check('v1.5.14 grupos: en el grupo no se muestran los botones de llamada', $('chatCallBtn').style.display === 'none' && $('chatVideoBtn').style.display === 'none');
    setVal($('chatText'), 'Hola grupo 1.5.14');
    click($('chatSend'));
    await tick();
    check('v1.5.14 grupos: enviar un mensaje lo muestra en el hilo del grupo', !!q('#chatMsgs .msg') && q('#chatMsgs').textContent.indexOf('Hola grupo 1.5.14') >= 0);
    click(q('[data-close="chatOverlay"]'));
    T.go('messages');
    T.renderConvos();
    check('v1.5.14 grupos: el grupo aparece en la lista de Mensajes con su nombre', q('#convoList').textContent.indexOf('Grupo de prueba 1.5.14') >= 0);
    window.__wrOpenGroupChat(g14.id);
    click(q('#chatHead button'));
    check('v1.5.14 grupos: Integrantes muestra quiénes son', $('groupChatMembersOverlay').classList.contains('on') && q('#groupChatMembersList').children.length === 3);
    var addBoxes14 = window.document.querySelectorAll('#groupChatAddFriends input[type="checkbox"]');
    check('v1.5.14 grupos: para agregar solo salen los amigos que no están', addBoxes14.length === 1);
    addBoxes14[0].checked = true;
    window.__wrAddGroupMembers();
    check('v1.5.14 grupos: agregar mete a la persona al grupo', T.getState().groupChats.filter(function (x) { return x.id === g14.id; })[0].participants.length === 4);
    var removeBtns14 = Array.prototype.slice.call(window.document.querySelectorAll('#groupChatMembersList button'));
    click(removeBtns14[0]);
    check('v1.5.14 grupos: quitar saca a la persona del grupo', T.getState().groupChats.filter(function (x) { return x.id === g14.id; })[0].participants.length === 3);
    window.__wrLeaveGroupChat();
    click($('confirmYes'));
    check('v1.5.14 grupos: salir del grupo me saca y cierra el hilo', T.getState().groupChats.filter(function (x) { return x.id === g14.id; })[0].participants.indexOf(T.getState().me) < 0 && !$('chatOverlay').classList.contains('on'));
    click(q('[data-close="groupChatMembersOverlay"]'));
    // Cuentas ya creadas: el perfil se carga solo del servidor.
    var me14 = T.getState().me;
    var savedProfile14 = JSON.parse(JSON.stringify(T.getState().profiles[me14]));
    delete T.getState().profiles[me14];
    mockServerProfile = savedProfile14;
    await T.finishServerLogin(me14, null, null, true);
    await tick();
    check('v1.5.14 entrar: con cuenta ya creada, el perfil se carga solo del servidor y se entra directo', !!T.getState().profiles[me14] && T.getState().profiles[me14].name === savedProfile14.name && !$('appView').classList.contains('hidden') && $('authStepProfile').classList.contains('hidden'));
    mockServerProfile = null;
    await T.finishServerLogin('5599999999', null, null, false);
    await tick();
    check('v1.5.14 entrar: con cuenta nueva sí se pide crear el perfil', !$('authStepProfile').classList.contains('hidden'));
    $('authStepProfile').classList.add('hidden');
    delete T.getState().profiles[me14];
    mockProfileStatus = 500;
    await T.finishServerLogin(me14, null, null, true);
    await tick();
    check('v1.5.14 entrar: si el perfil existe en el servidor pero no se pudo traer, no se pide crearlo', $('authStepProfile').classList.contains('hidden') && $('toast').textContent.indexOf('No se pudo cargar tu perfil') >= 0);
    mockProfileStatus = 0;
    mockServerProfile = savedProfile14;
    await T.finishServerLogin(me14, null, null, true);
    await tick();
    check('v1.5.14 entrar: tras el error, al reintentar el perfil se carga y se entra', !!T.getState().profiles[me14] && !$('appView').classList.contains('hidden'));
    mockServerProfile = null;
    T.go('feed');

    // ---- v1.5.14: el texto de la historia se ve sobre la foto o el video ----
    var meStory = T.getState().me;
    // Vía rápida: texto + foto, sin textos del editor.
    var rStory1 = T.core.createStory(T.getState(), meStory, { text: 'Mi texto sobre la foto 1.5.14', media: 'https://ejemplo.com/foto.jpg', mediaType: 'image' });
    check('v1.5.14 historias: texto + foto se guarda con el texto', rStory1.ok && rStory1.story.text === 'Mi texto sobre la foto 1.5.14');
    T.openShorts(rStory1.story.id);
    var stPlain1 = q('#shortsBody .stTextPlain');
    check('v1.5.14 historias: el texto se ve SOBRE la foto en el visor', !!stPlain1 && stPlain1.textContent.indexOf('Mi texto sobre la foto 1.5.14') >= 0, $('shortsBody').innerHTML.slice(0, 200));
    check('v1.5.14 historias: el texto sobre la foto no se repite abajo en el pie', $('shortsInfo').textContent.indexOf('Mi texto sobre la foto 1.5.14') < 0);
    check('v1.5.14 historias: el texto sobre la foto es legible (blanco, centrado, con sombra)', !!stPlain1 && stPlain1.style.color === 'rgb(255, 255, 255)' && stPlain1.style.left === '50%' && stPlain1.style.top === '50%');
    click($('shortsClose'));
    // Video: el texto también se ve sobre el video.
    var rStoryVid = T.core.createStory(T.getState(), meStory, { text: 'Mi texto sobre el video 1.5.14', media: 'https://ejemplo.com/video.mp4', mediaType: 'video' });
    T.openShorts(rStoryVid.story.id);
    check('v1.5.14 historias: el texto se ve SOBRE el video en el visor', !!q('#shortsBody video') && !!q('#shortsBody .stTextPlain') && q('#shortsBody .stTextPlain').textContent.indexOf('Mi texto sobre el video 1.5.14') >= 0);
    click($('shortsClose'));
    // Historia ya publicada (guardada antes, con texto y sin ediciones):
    // al abrirla, el texto se ve sin tocar nada.
    var rStoryOld = T.core.createStory(T.getState(), meStory, { text: 'Historia vieja con texto 1.5.14', media: 'https://ejemplo.com/vieja.jpg', mediaType: 'image' });
    T.openShorts(rStoryOld.story.id);
    check('v1.5.14 historias: una historia ya publicada muestra su texto guardado sobre la foto', !!q('#shortsBody .stTextPlain') && q('#shortsBody .stTextPlain').textContent.indexOf('Historia vieja con texto 1.5.14') >= 0);
    click($('shortsClose'));
    // Solo texto, sin foto: no cambia (el texto grande sigue en el cuerpo).
    var rStoryTxt = T.core.createStory(T.getState(), meStory, { text: 'Solo texto sin foto 1.5.14', media: '', mediaType: '' });
    T.openShorts(rStoryTxt.story.id);
    check('v1.5.14 historias: sin foto, el texto se sigue viendo grande en el cuerpo', !!q('#shortsBody .shortsText') && q('#shortsBody .shortsText').textContent.indexOf('Solo texto sin foto 1.5.14') >= 0 && !q('#shortsBody .stTextPlain'));
    click($('shortsClose'));
    // Editor: la vista previa muestra el texto del compositor sobre la foto
    // antes de publicar; al agregar un texto del editor, ese es el que se
    // ve sobre la foto y el del compositor queda como pie.
    T.openStoryEditor({ src: 'https://ejemplo.com/foto-editor.jpg', type: 'image' }, 'Texto del compositor 1.5.14');
    check('v1.5.14 historias: la vista previa del editor muestra el texto sobre la foto', !!q('#storyEditPreview .stTextPlain') && q('#storyEditPreview .stTextPlain').textContent.indexOf('Texto del compositor 1.5.14') >= 0, $('storyEditPreview').innerHTML.slice(0, 250));
    setVal($('storyEditTextInput'), 'Texto del editor 1.5.14');
    T.addStoryEditText();
    check('v1.5.14 historias: al agregar texto del editor, ese texto se ve sobre la foto en la vista previa', !!q('#storyEditPreview .stText') && q('#storyEditPreview .stText').textContent.indexOf('Texto del editor 1.5.14') >= 0 && !q('#storyEditPreview .stTextPlain'));
    await T.publishStoryEdited();
    var stEditSaved = T.getState().stories[0];
    check('v1.5.14 historias: al publicar desde el editor se guardan el texto y el texto del editor', !!stEditSaved && stEditSaved.text === 'Texto del compositor 1.5.14' && stEditSaved.edits.texts.length === 1 && stEditSaved.edits.texts[0].text === 'Texto del editor 1.5.14');
    T.openShorts(stEditSaved.id);
    check('v1.5.14 historias: en el visor se ve el texto del editor sobre la foto', !!q('#shortsBody .stText') && q('#shortsBody .stText').textContent.indexOf('Texto del editor 1.5.14') >= 0);
    check('v1.5.14 historias: con texto del editor, el del compositor queda como pie (sin tapar la foto)', $('shortsInfo').textContent.indexOf('Texto del compositor 1.5.14') >= 0 && !q('#shortsBody .stTextPlain'));
    click($('shortsClose'));

    // ---- v1.5.14: el clima se actualiza de inmediato con la ubicación activada ----
    // 1.5.47: la ubicación ya NO se pide al cargar: sin ciudad guardada la
    // tarjeta pide escribir una ciudad; el GPS solo se usa al tocar el
    // icono de mi ubicación del detalle.
    T.getState().weather = null;
    T.setWeatherCity(null);
    calls.location = '';
    calls.weatherFail = false;
    await T.loadWeather();
    check('1.5.47 clima: sin ciudad la tarjeta pide escribir una ciudad (no activarla)', $('weatherInfo').textContent.toLowerCase().indexOf('escribe una ciudad') >= 0 && !!$('weatherEnableBtn'));
    calls.location = '19.43,-99.13';
    var locReqBefore = calls.locationPermReq;
    click($('weatherEnableBtn'));
    check('1.5.47 clima: el botón abre el detalle del clima', $('weatherOverlay').classList.contains('on'));
    click($('weatherMyLocBtn1547'));
    check('1.5.47 clima: el icono pide el permiso al puente', calls.locationPermReq > locReqBefore);
    var gotWeatherNow = await waitFor(function () { return $('weatherInfo').textContent.indexOf('24°') >= 0; }, 5000);
    check('1.5.47 clima: con la ubicación ya activada, el clima se actualiza de inmediato al tocar el icono', gotWeatherNow, 'info=' + $('weatherInfo').textContent);
    // Sin ciudad guardada: ya no hay reintento automático con GPS; el clima
    // no aparece solo aunque haya ubicación: hay que tocar el icono.
    T.getState().weather = null;
    T.setWeatherCity(null);
    calls.location = '';
    await T.loadWeather();
    check('1.5.47 clima: sin ciudad al cargar, la tarjeta pide escribir una ciudad', $('weatherInfo').textContent.toLowerCase().indexOf('escribe una ciudad') >= 0);
    calls.location = '19.43,-99.13';
    await new Promise(function (r) { setTimeout(r, 2000); });
    check('1.5.47 clima: sin ciudad no hay reintento automático con GPS (no aparece solo)', $('weatherInfo').textContent.indexOf('24°') < 0, 'info=' + $('weatherInfo').textContent);
    click($('weatherMyLocBtn1547'));
    var gotWeatherIcon = await waitFor(function () { return $('weatherInfo').textContent.indexOf('24°') >= 0; }, 5000);
    check('1.5.47 clima: tras fallar sin ciudad, el clima aparece al tocar el icono', gotWeatherIcon, 'info=' + $('weatherInfo').textContent);
    click(q('[data-close="weatherOverlay"]'));
    // El marco del clima y el reloj no se rompen con el arreglo.
    check('v1.5.14 clima: el reloj sigue mostrando la hora real tras actualizar el clima', $('weatherTime').textContent.trim().length >= 4 && !!$('weatherCard') && !!$('weatherTimeCard'));

    // ---- v1.5.14: publicar audio — el selector muestra los audios del teléfono ----
    check('v1.5.14 audio: el compositor tiene un selector dedicado de solo audios', !!$('postAudioInput') && $('postAudioInput').getAttribute('accept') === 'audio/*');
    var audioPickerOpened = 0, mediaPickerOpened = 0;
    $('postAudioInput').click = function () { audioPickerOpened++; };
    $('postMediaInput').click = function () { mediaPickerOpened++; };
    calls.audioPermGranted = true;
    click($('postAddAudio'));
    check('v1.5.14 audio: el botón Audio abre el selector de audios (no el general de fotos)', audioPickerOpened === 1 && mediaPickerOpened === 0, 'audio=' + audioPickerOpened + ' media=' + mediaPickerOpened);
    // Sin permiso: primero se pide el permiso y el selector se abre al concederlo.
    calls.audioPermGranted = false;
    var filesReqBefore = calls.filesPermReq || 0;
    click($('postAddAudio'));
    check('v1.5.14 audio: sin permiso de audio, primero se pide el permiso', (calls.filesPermReq || 0) > filesReqBefore);
    check('v1.5.14 audio: sin permiso, el selector no se abre hasta concederlo', audioPickerOpened === 1);
    window.__onPermissionResult('files', true);
    check('v1.5.14 audio: al conceder el permiso se abre el selector de audios', audioPickerOpened === 2);
    calls.audioPermGranted = true;
    delete $('postAudioInput').click;
    delete $('postMediaInput').click;
    // Elegir un audio de verdad lo publica: se ve en el compositor (fila
    // de audio + reproductor) y luego en el inicio.
    click($('composerOpen'));
    var audioFile = new window.File([new Uint8Array(2048)], 'cancion-prueba.mp3', { type: 'audio/mpeg' });
    Object.defineProperty($('postAudioInput'), 'files', { value: [audioFile], configurable: true });
    $('postAudioInput').dispatchEvent(new window.Event('change', { bubbles: true }));
    var audioShown = await waitFor(function () { return !$('postAudioRow').classList.contains('hidden') && !!$('postMediaPrev').querySelector('audio'); }, 15000);
    check('v1.5.14 audio: al elegir un audio se muestra en el compositor con su reproductor', audioShown, 'prev=' + $('postMediaPrev').innerHTML.slice(0, 160));
    setVal($('postText'), 'Mi audio de prueba 1.5.14');
    click($('postPublish'));
    var audioPosted = await waitFor(function () { return !!q('#feed .post audio') && q('#feed').textContent.indexOf('Mi audio de prueba 1.5.14') >= 0; }, 15000);
    check('v1.5.14 audio: la publicación con audio aparece en el inicio con su reproductor', audioPosted);

    // ---- v1.5.14: preguntas frecuentes actualizadas (se ven en Ajustes) ----
    window.__wrOpenSettings();
    var faqText = $('faqList').textContent;
    check('1.5.62 FAQ: en el panel se ven las preguntas nuevas de la 1.5.14 (la del clima salió en la rotación de la 1.5.62)', ['¿Cómo uso el cajón de aplicaciones?', '¿Dónde quedaron Avisos, Mensajes y Amigos?', '¿Las publicaciones borradas se borran de verdad?', '¿Qué pasa cuando publico un enlace?', '¿Cómo comparto una publicación en otras aplicaciones?', '¿Cómo funcionan las historias y los Shorts?', '¿Cómo envío mensajes, archivos y notas de voz?'].every(function (t) { return faqText.indexOf(t) >= 0; }) && ['¿Cómo veo todas mis aplicaciones?', '¿Dónde veo mi actividad?', '¿Cómo doy like o comento en un Short?', '¿Cómo creo un mensaje grupal?', '¿Por qué el clima no se actualiza?'].every(function (t) { return faqText.indexOf(t) < 0; }));
    check('v1.5.14 FAQ: en el panel no queda ninguna pregunta de SMS', faqText.indexOf('SMS') < 0);
    check('v1.5.14 FAQ: el registro explica que la cuenta ya creada carga su perfil sola', faqText.indexOf('se carga solo') >= 0);
    click(q('[data-close="settingsOverlay"]'));

    // ---- v1.5.14: videos del inicio — solo el visible suena, uno por uno ----
    var meV = T.getState().me;
    var rVidA = T.core.createPost(T.getState(), meV, { text: 'Video A visible 1.5.14', media: 'demo-video.mp4', mediaType: 'video', mediaList: [{ src: 'demo-video.mp4', type: 'video' }] });
    var rVidB = T.core.createPost(T.getState(), meV, { text: 'Video B visible 1.5.14', media: 'demo-video.mp4', mediaType: 'video', mediaList: [{ src: 'demo-video.mp4', type: 'video' }] });
    T.go('feed');
    await sleep(150);
    var vidA = q('#feed .post[data-post="' + rVidA.post.id + '"] video');
    var vidB = q('#feed .post[data-post="' + rVidB.post.id + '"] video');
    check('v1.5.14 videos: los dos videos están en el inicio', !!vidA && !!vidB);
    // jsdom no tiene layout ni IntersectionObserver: se simulan la posición
    // en pantalla y el reproducir/pausar.
    var vh = window.innerHeight || 768;
    function stubVideo(v, top, height) {
      v._playing = false;
      v._playCalls = 0;
      v.play = function () { v._playCalls++; v._playing = true; return Promise.resolve(); };
      v.pause = function () { v._playing = false; };
      Object.defineProperty(v, 'paused', { get: function () { return !this._playing; }, configurable: true });
      v.getBoundingClientRect = function () { return { top: top, bottom: top + height, height: height, left: 0, right: 360, width: 360 }; };
    }
    stubVideo(vidA, 100, 400);
    stubVideo(vidB, 900, 400);
    T.updateFeedVideos();
    check('v1.5.14 videos: solo el video visible se reproduce', vidA._playing && !vidB._playing, 'A=' + vidA._playing + ' B=' + vidB._playing);
    // Al bajar, el que sale de vista se pausa y se reproduce el que sigue.
    stubVideo(vidA, -500, 400);
    stubVideo(vidB, 100, 400);
    T.updateFeedVideos();
    check('v1.5.14 videos: al salir de vista se pausa y se reproduce el que sigue', !vidA._playing && vidB._playing, 'A=' + vidA._playing + ' B=' + vidB._playing);
    // Dos visibles a la vez: suena solo el más visible (nunca dos a la vez).
    stubVideo(vidA, 100, 400);
    vidA.getBoundingClientRect = function () { return { top: 100, bottom: 420, height: 400, left: 0, right: 360, width: 360 }; };
    stubVideo(vidB, 500, 400);
    vidB.getBoundingClientRect = function () { return { top: 500, bottom: 740, height: 400, left: 0, right: 360, width: 360 }; };
    T.updateFeedVideos();
    var playingCount = qa('#feed .post video').filter(function (v) { return v._playing; }).length;
    check('v1.5.14 videos: con dos visibles suena solo el más visible', vidA._playing && !vidB._playing && playingCount === 1, 'A=' + vidA._playing + ' B=' + vidB._playing + ' n=' + playingCount);
    // Justo la mitad visible sí suena; menos de la mitad, no.
    vidA.getBoundingClientRect = function () { return { top: vh - 200, bottom: vh + 200, height: 400, left: 0, right: 360, width: 360 }; };
    vidB.getBoundingClientRect = function () { return { top: 900, bottom: 1300, height: 400, left: 0, right: 360, width: 360 }; };
    vidA._playing = false;
    T.updateFeedVideos();
    check('v1.5.14 videos: con justo la mitad visible se reproduce', vidA._playing);
    vidA.getBoundingClientRect = function () { return { top: vh - 160, bottom: vh + 240, height: 400, left: 0, right: 360, width: 360 }; };
    vidA._playing = false;
    T.updateFeedVideos();
    check('v1.5.14 videos: con menos de la mitad visible no se reproduce', !vidA._playing);
    // Reproducir a mano: el que suena pasa a ser el único.
    stubVideo(vidA, 100, 400);
    stubVideo(vidB, 100, 400);
    T.updateFeedVideos();
    vidB.play();
    vidB.dispatchEvent(new window.Event('play'));
    check('v1.5.14 videos: al reproducir uno a mano, el otro se pausa', vidB._playing && !vidA._playing, 'A=' + vidA._playing + ' B=' + vidB._playing);
    // Pausar a mano: no se vuelve a reproducir solo mientras siga visible.
    vidB.pause();
    vidB.dispatchEvent(new window.Event('pause'));
    T.updateFeedVideos();
    check('v1.5.14 videos: al pausarlo a mano no se reproduce solo', !vidB._playing);
    // Al salir de vista y volver, se intenta de nuevo.
    stubVideo(vidB, 900, 400);
    stubVideo(vidA, 900, 400);
    T.updateFeedVideos();
    stubVideo(vidB, 100, 400);
    T.updateFeedVideos();
    check('v1.5.14 videos: al volver a verse tras salir, se reproduce de nuevo', vidB._playing);
    // Autoplay bloqueado por el navegador: queda pausado y no se reintenta
    // sin parar (sin spam de intentos).
    vidB._playing = false;
    var blockedCalls = 0;
    vidB.play = function () { blockedCalls++; return Promise.reject(new Error('autoplay bloqueado')); };
    vidA.getBoundingClientRect = function () { return { top: 900, bottom: 1300, height: 400, left: 0, right: 360, width: 360 }; };
    T.updateFeedVideos();
    await sleep(50);
    T.updateFeedVideos();
    check('v1.5.14 videos: si el navegador bloquea el autoplay, queda pausado y no se reintenta sin parar', !vidB._playing && blockedCalls === 1, 'intentos=' + blockedCalls);
    // Sin IntersectionObserver no se rompe nada (jsdom no lo tiene).
    check('v1.5.14 videos: observar los videos no falla sin IntersectionObserver', (function () { try { T.observeFeedVideos(); return true; } catch (e) { return false; } })());

    // ---- v1.5.14: sección de Reels mezclada entre las publicaciones del inicio ----
    T.go('feed');
    await sleep(150);
    var reelsRow = q('#feed .reelsRow');
    check('v1.5.14 reels: la fila de reels aparece en el inicio', !!reelsRow);
    var feedKids = Array.prototype.slice.call($('feed').children);
    var reelsIdx = feedKids.indexOf(reelsRow);
    var hasPostBefore = feedKids.slice(0, reelsIdx).some(function (el) { return el.classList.contains('post'); });
    var hasPostAfter = feedKids.slice(reelsIdx + 1).some(function (el) { return el.classList.contains('post'); });
    check('v1.5.14 reels: la fila va mezclada ENTRE publicaciones (hay publicaciones antes y después)', hasPostBefore && hasPostAfter, 'idx=' + reelsIdx + ' de ' + feedKids.length);
    var reelTiles = qa('#feed .reelTile');
    var reelCount = T.core.shortsFeed(T.getState(), T.getState().me).filter(function (it) { return it.kind === 'post'; }).length;
    check('v1.5.14 reels: los recuadros son los videos cortos de Shorts', reelTiles.length >= 1 && reelTiles.length === Math.min(10, reelCount), 'tiles=' + reelTiles.length + ' videos=' + reelCount);
    var reelCs = reelTiles.length ? window.getComputedStyle(reelTiles[0]) : null;
    var storyCs = q('#storiesRow .homeReel1549') ? window.getComputedStyle(q('#storiesRow .homeReel1549')) : null;
    check('v1.5.14 reels: los recuadros son rectangulares y más grandes que los rectángulos de reels del Inicio (1.5.60)', !!reelCs && !!storyCs && parseFloat(reelCs.flexBasis) > parseFloat(storyCs.width) && parseFloat(reelCs.height) > parseFloat(storyCs.width), 'reel=' + (reelCs && reelCs.flexBasis + 'x' + reelCs.height) + ' rectangulo=' + (storyCs && storyCs.width));
    var reelsIcon = q('#feed .reelsHead .reelsIcon svg');
    check('v1.5.14 reels: arriba del primer reel va su iconito de video chiquito', !!reelsIcon && reelsIcon.getAttribute('width') === '18' && reelsIcon.getAttribute('height') === '18', reelsIcon && reelsIcon.outerHTML.slice(0, 120));
    check('v1.5.14 reels: el encabezado con el iconito va arriba de la fila de recuadros', !!reelsRow && reelsRow.children[0].classList.contains('reelsHead') && reelsRow.children[1].classList.contains('reels'));
    click(reelTiles[0]);
    await sleep(150);
    check('v1.5.14 reels: al tocar un reel se abre y se reproduce como un short', $('shortsOverlay').classList.contains('on') && !!q('#shortsBody video'), ($('shortsBody').innerHTML || '').slice(0, 160));
    click($('shortsClose'));

    /* Cerrar lo que haya quedado abierto (las pruebas anteriores dejan
       varios overlays con 'on'): el gesto solo vale en el inicio,
       arriba del todo y sin overlays abiertos. */
    window.document.querySelectorAll('.overlay.on').forEach(function (o) { o.classList.remove('on'); });
    check('v1.5.10 PTR: antes del gesto no hay overlays abiertos', !window.document.querySelector('.overlay.on'));
    T.go('feed');
    T.renderFeed();
    check('v1.5.10 PTR: la barra de recarga existe al inicio del inicio', !!$('ptrBar') && $('ptrBar').classList.contains('hidden'));
    var ptrTouchEv = function (type, y, x) {
      var ev = new window.Event(type, { bubbles: true, cancelable: true });
      ev.touches = [{ clientY: y, clientX: x }];
      $('feed').dispatchEvent(ev);
      return ev;
    };
    ptrTouchEv('touchstart', 100, 50);
    ptrTouchEv('touchmove', 150, 52);
    check('v1.5.10 PTR: jalando un poco se ve la barra pidiendo seguir jalando', !$('ptrBar').classList.contains('hidden') && $('ptrBar').textContent.indexOf('Jala para recargar') >= 0);
    ptrTouchEv('touchmove', 200, 52);
    check('v1.5.10 PTR: jalando más allá del umbral ya se puede soltar para recargar', $('ptrBar').textContent.indexOf('Suelta para recargar') >= 0);
    ptrTouchEv('touchend', 200, 52);
    check('v1.5.10 PTR: soltar tras jalar muestra que está recargando', $('ptrBar').textContent.indexOf('Recargando') >= 0);
    /* ---- v1.5.15: reels con portada, links sin duplicar y con imagen,
       buscador del cajón, numerito rojo por app, borrado para todo,
       vaciado silencioso, menú flotante junto a la ficha y rebote del
       botón del centro ---- */
    // (1) Reels con portada automática extraída del video.
    var reelPost15 = T.core.createPost(T.getState(), T.getState().me, { text: 'Reel sin portada 1.5.15' }).post;
    reelPost15.mediaType = 'video'; reelPost15.media = 'https://x.com/reel15.mp4';
    var reelHtml15 = T.reelsRowHtml();
    check('v1.5.15 reels DOM: la ficha sin carátula lleva data-reel-video y el icono sobre fondo rojo oscuro (nunca vacía ni negra)', reelHtml15.indexOf('data-reel-video="https://x.com/reel15.mp4"') >= 0 && reelHtml15.indexOf('reelTilePh') >= 0);
    var reelPost15b = T.core.createPost(T.getState(), T.getState().me, { text: 'Reel con portada 1.5.15' }).post;
    reelPost15b.mediaType = 'video'; reelPost15b.media = 'https://x.com/reel15b.mp4'; reelPost15b.videoThumb = 'https://x.com/portada15.jpg';
    var reelHtml15b = T.reelsRowHtml();
    check('v1.5.15 reels DOM: con carátula guardada la ficha muestra su imagen', reelHtml15b.indexOf('src="https://x.com/portada15.jpg"') >= 0);
    check('v1.5.15 reels DOM: pedir las portadas no falla', (function () { try { T.requestReelCovers(); return true; } catch (e) { return false; } })());
    T.core.deletePost(T.getState(), T.getState().me, reelPost15.id);
    T.core.deletePost(T.getState(), T.getState().me, reelPost15b.id);
    // (2) Links: una sola tarjeta por URL única, con la imagen del link.
    var dupPost15 = T.core.createPost(T.getState(), T.getState().me, { text: 'Miren esto https://vt.tiktok.com/abc123/?utm_source=tt y otra vez https://www.vt.tiktok.com/abc123 ¡qué bueno!' }).post;
    dupPost15.link = { url: 'https://vt.tiktok.com/abc123', title: 'Video de TikTok', image: 'https://x.com/og15.jpg' };
    T.go('feed');
    var dupCard15 = q('#feed .post[data-post="' + dupPost15.id + '"]');
    var dupCards15 = dupCard15 ? dupCard15.querySelectorAll('.linkcard') : [];
    check('v1.5.15 links DOM: un enlace que viene dos veces (y también en el campo link) dibuja UNA sola tarjeta', dupCards15.length === 1, 'tarjetas=' + dupCards15.length);
    check('v1.5.15 links DOM: esa tarjeta lleva la imagen del link', dupCards15.length === 1 && !!dupCards15[0].querySelector('img') && dupCards15[0].querySelector('img').getAttribute('src') === 'https://x.com/og15.jpg');
    var imgPost15 = T.core.createPost(T.getState(), T.getState().me, { text: 'Página con imagen https://ejemplo.com/pagina' }).post;
    T.getState().linkImages['https://ejemplo.com/pagina'] = 'https://ejemplo.com/og.jpg';
    T.go('feed');
    var imgCard15 = q('#feed .post[data-post="' + imgPost15.id + '"] .linkcard');
    check('v1.5.15 links DOM: la tarjeta del texto también lleva la imagen del link cuando se conoce', !!imgCard15 && !!imgCard15.querySelector('img') && imgCard15.querySelector('img').getAttribute('src') === 'https://ejemplo.com/og.jpg');
    T.core.deletePost(T.getState(), T.getState().me, dupPost15.id);
    T.core.deletePost(T.getState(), T.getState().me, imgPost15.id);
    delete T.getState().linkImages['https://ejemplo.com/pagina'];
    // (3) Buscador del cajón (se vuelve a la lista de 6 apps de prueba).
    T.setInstalledApps(JSON.parse(window.AndroidBridge.listInstalledApps()));
    click($('navLauncherBtn'));
    check('v1.5.15 buscador DOM: el cajón tiene su buscador arriba', !!$('appsDrawerSearch'));
    var totalTiles15 = qa('#appsDrawerGrid .launcherTile').length;
    T.setAppsDrawerQuery('cám');
    check('v1.5.15 buscador DOM: al escribir se filtran las apps por nombre (sin tildes)', (function () { var names = qa('#appsDrawerGrid .launcherName').map(function (n) { return n.textContent; }); return names.length === 1 && names[0] === 'Cámara'; })(), qa('#appsDrawerGrid .launcherName').map(function (n) { return n.textContent; }).join(','));
    T.setAppsDrawerQuery('zzz');
    check('v1.5.15 buscador DOM: sin coincidencias se avisa que no hay resultados', qa('#appsDrawerGrid .launcherTile').length === 0 && $('appsDrawerGrid').textContent.indexOf('Sin resultados') >= 0);
    var searchInp15 = $('appsDrawerSearch');
    searchInp15.value = 'map';
    searchInp15.dispatchEvent(new window.Event('input', { bubbles: true }));
    check('v1.5.15 buscador DOM: escribir en el buscador filtra mientras se escribe', (function () { var names = qa('#appsDrawerGrid .launcherName').map(function (n) { return n.textContent; }); return names.length === 1 && names[0] === 'Mapas'; })());
    T.setAppsDrawerQuery('');
    check('v1.5.15 buscador DOM: al limpiar la búsqueda vuelven todas las apps', qa('#appsDrawerGrid .launcherTile').length === totalTiles15 && totalTiles15 > 0, 'tiles=' + totalTiles15);
    // (4) Numerito rojo encima de cada aplicación (NO en la campana).
    calls.notifCounts = { 'com.demo.camara': 3, 'com.demo.mapas': 12, 'com.demo.galeria': 0 };
    calls.notifAccessGranted = true;
    T.refreshAppNotifCounts();
    var camTile15 = q('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.camara"]');
    var mapTile15 = q('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.mapas"]');
    var galTile15 = q('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.galeria"]');
    check('v1.5.15 avisos por app DOM: cada app lleva encima su numerito rojo con sus pendientes', !!camTile15 && !!camTile15.querySelector('.appNotifBadge') && camTile15.querySelector('.appNotifBadge').textContent === '3' && !!mapTile15 && mapTile15.querySelector('.appNotifBadge').textContent === '12');
    check('v1.5.15 avisos por app DOM: la app sin pendientes no lleva nada encima', !!galTile15 && !galTile15.querySelector('.appNotifBadge'));
    check('v1.5.15 avisos por app DOM: el numerito NO va en la campana del encabezado', !$('hdrBell').querySelector('.appNotifBadge') && window.getComputedStyle(camTile15.querySelector('.appNotifBadge')).backgroundColor.indexOf('224, 20, 48') >= 0);
    calls.notifAccessGranted = false;
    T.refreshAppNotifCounts();
    check('v1.5.15 avisos por app DOM: sin el acceso concedido el cajón muestra cómo activarlo', !$('appsDrawerNotifHint').classList.contains('hidden') && $('appsDrawerNotifHint').textContent.indexOf('Activar') >= 0);
    calls.notifCounts = {}; calls.notifAccessGranted = true;
    T.refreshAppNotifCounts();
    // (5)+(7) Borrado para todo: comentario, mensaje e historia.
    var cPost15 = T.core.createPost(T.getState(), T.getState().me, { text: 'Publicación para borrar su comentario 1.5.15' }).post;
    var cmt15 = T.core.addComment(T.getState(), T.getState().me, cPost15.id, 'Comentario que se borra').comment;
    calls.postDeletes = [];
    window.__wrDeleteComment(cPost15.id, cmt15.id);
    click($('confirmYes'));
    await tick();
    check('v1.5.15 borrado DOM: borrar un comentario lo quita al instante, pone su lápida y manda DELETE al servidor', !cPost15.comments.some(function (c) { return c.id === cmt15.id; }) && T.core.isItemDeleted(T.getState(), 'comment', cPost15.id + ':' + cmt15.id) && (calls.postDeletes || []).some(function (u) { return u.indexOf('/comment/' + encodeURIComponent(cmt15.id)) >= 0; }), JSON.stringify(calls.postDeletes || []));
    T.core.deletePost(T.getState(), T.getState().me, cPost15.id);
    T.core.sendMessage(T.getState(), T.getState().me, '1000000001', 'Mensaje que se borra 1.5.15');
    var conv15 = T.getState().conversations[T.core.convoKey(T.getState().me, '1000000001')];
    var msg15 = conv15.messages.filter(function (m) { return m.text === 'Mensaje que se borra 1.5.15'; })[0];
    window.__wrOpenChat('1000000001');
    await tick();
    var msgDelBtn15 = (function () {
      var msgs = qa('#chatOverlay .msg');
      for (var mi = 0; mi < msgs.length; mi++) {
        if (msgs[mi].textContent.indexOf('Mensaje que se borra 1.5.15') >= 0) return msgs[mi].querySelector('.msgdel');
      }
      return null;
    })();
    click(msgDelBtn15);
    click($('confirmYes'));
    await tick();
    check('v1.5.15 borrado DOM: borrar un mensaje lo quita al instante y pone su lápida (no resucita al sincronizar)', !!msg15 && !!msgDelBtn15 && !conv15.messages.some(function (m) { return m.id === msg15.id; }) && T.core.isItemDeleted(T.getState(), 'message', msg15.id));
    click(q('#chatOverlay [data-close="chatOverlay"]'));
    var story15 = T.core.createStory(T.getState(), T.getState().me, { text: 'Historia para borrar 1.5.15' }).story;
    window.__wrOpenStory(story15.id);
    await tick();
    var delStoryBtn15 = Array.prototype.slice.call(qa('#shortsOverlay button')).filter(function (b) { return b.textContent.indexOf('Borrar mi historia') >= 0; })[0];
    click(delStoryBtn15);
    click($('confirmYes'));
    await tick();
    check('v1.5.15 borrado DOM: borrar una historia la quita al instante y pone su lápida', !!delStoryBtn15 && !T.getState().stories.some(function (s) { return s.id === story15.id; }) && T.core.isItemDeleted(T.getState(), 'story', story15.id));
    click($('shortsClose'));
    // (6) Vaciado silencioso de la cola de borrados pendientes.
    var toastBefore15 = $('toast').textContent;
    var toastCallsBefore15 = (calls.toast || []).length;
    T.getState().pendingQueue.push({ kind: 'http', path: '/api/posts/x-flush-15', method: 'DELETE', body: {} });
    await T.flushPendingQueue();
    check('v1.5.15 vaciado silencioso DOM: al recuperar el servidor, el borrado pendiente se envía solo y la cola queda vacía', !T.getState().pendingQueue.some(function (it) { return it.path === '/api/posts/x-flush-15'; }) && (calls.postDeletes || []).some(function (u) { return u.indexOf('/api/posts/x-flush-15') >= 0; }));
    check('v1.5.15 vaciado silencioso DOM: el vaciado no muestra ningún aviso', $('toast').textContent === toastBefore15 && (calls.toast || []).length === toastCallsBefore15);
    calls.deleteStatus = 404;
    T.getState().pendingQueue.push({ kind: 'http', path: '/api/posts/x-flush-404', method: 'DELETE', body: {} });
    await T.flushPendingQueue();
    check('v1.5.15 vaciado silencioso DOM: un DELETE con 404 se da por enviado y no se reencola para siempre', !T.getState().pendingQueue.some(function (it) { return it.path === '/api/posts/x-flush-404'; }));
    calls.deleteStatus = 0;
    // (8)+(9) Menú flotante traslúcido junto a la ficha, funcional.
    click($('navLauncherBtn'));
    var menuTile15 = q('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.camara"]');
    menuTile15.getBoundingClientRect = function () { return { top: 100, left: 20, right: 100, bottom: 180, width: 80, height: 80, x: 20, y: 100 }; };
    T.openLauncherMenu(menuTile15);
    var menuBox15 = $('launcherMenuBox');
    check('v1.5.15 menú flotante DOM: al presionar una app aparece el recuadro con las 4 opciones', $('launcherMenuOverlay').classList.contains('on') && $('launcherMenuBtns').textContent.indexOf('Abrir') >= 0 && $('launcherMenuBtns').textContent.indexOf('Desinstalar') >= 0 && $('launcherMenuBtns').textContent.indexOf('Información de la aplicación') >= 0 && $('launcherMenuBtns').textContent.indexOf('Compartir') >= 0);
    check('v1.5.15 menú flotante DOM: el recuadro es traslúcido (fondo rojo oscuro semitransparente)', !!menuBox15 && window.getComputedStyle(menuBox15).backgroundColor.indexOf('rgba(26, 12, 15') >= 0);
    check('v1.5.15 menú flotante DOM: el recuadro aparece JUNTO a la ficha (a su derecha, alineado arriba)', !!menuBox15 && menuBox15.style.left === '108px' && menuBox15.style.top === '100px', 'left=' + (menuBox15 && menuBox15.style.left) + ' top=' + (menuBox15 && menuBox15.style.top));
    var openBtn15 = Array.prototype.slice.call(qa('#launcherMenuBtns button')).filter(function (b) { return b.textContent.indexOf('Abrir') >= 0; })[0];
    click(openBtn15);
    check('v1.5.15 menú flotante DOM: Abrir abre de verdad esa aplicación', calls.openedApps.indexOf('com.demo.camara') >= 0 && !$('launcherMenuOverlay').classList.contains('on'));
    menuTile15.getBoundingClientRect = function () { return { top: 100, left: 900, right: 980, bottom: 180, width: 80, height: 80, x: 900, y: 100 }; };
    T.openLauncherMenu(menuTile15);
    check('v1.5.15 menú flotante DOM: sin espacio a la derecha, el recuadro va a la izquierda de la ficha', !!menuBox15 && menuBox15.style.left === '682px' && menuBox15.style.top === '100px', 'left=' + (menuBox15 && menuBox15.style.left));
    /* Sin espacio a ningún lado (ficha ancha en el centro), el recuadro
       va debajo de la ficha, centrado en ella. */
    menuTile15.getBoundingClientRect = function () { return { top: 100, left: 100, right: 900, bottom: 180, width: 800, height: 80, x: 100, y: 100 }; };
    T.openLauncherMenu(menuTile15);
    check('v1.5.15 menú flotante DOM: sin espacio a ningún lado, el recuadro va debajo de la ficha', !!menuBox15 && menuBox15.style.top === '188px' && menuBox15.style.left === '395px', 'left=' + (menuBox15 && menuBox15.style.left) + ' top=' + (menuBox15 && menuBox15.style.top));
    $('launcherMenuOverlay').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    check('v1.5.15 menú flotante DOM: tocar fuera del recuadro lo cierra', !$('launcherMenuOverlay').classList.contains('on'));
    // (10) Botón del centro (v1.5.18): el cajón se abre MUCHO MÁS FLUIDO
    // (transición suave y rápida, sin rebote): la clase .on entra de
    // inmediato al presionar y el cajón queda usable al terminar la
    // transición (220 ms), sin esperar nada más.
    click($('appsDrawerClose'));
    click($('navLauncherBtn'));
    check('v1.5.18 cajón fluido DOM: al presionar el botón del centro el cajón se abre DE INMEDIATO y sin rebote del botón', $('appsDrawerOverlay').classList.contains('on') && !$('navLauncherBtn').classList.contains('bouncing'));
    check('v1.5.18 cajón fluido DOM: la hoja del cajón tiene la transición fluida (220 ms, ease-out sin sobrepaso)', html.indexOf('@keyframes wrDrawerFluid{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}') >= 0 && html.indexOf('#appsDrawerOverlay.on .sheet{animation:wrDrawerFluid .22s cubic-bezier(.22,.61,.36,1) both}') >= 0);
    check('v1.5.18 cajón fluido DOM: la respuesta del botón al presionar es suave (escala .95 con transición .12 s)', html.indexOf('button:active,.chip:active{transform:scale(.95)}') >= 0 && html.indexOf('button{transition:transform .12s ease}') >= 0);
    await sleep(350);
    check('v1.5.18 cajón fluido DOM: tras 350 ms (transición de 220 ms ya terminada) el cajón sigue abierto y se puede usar (la X lo cierra)', $('appsDrawerOverlay').classList.contains('on') && !!$('appsDrawerClose'));
    click($('appsDrawerClose'));
    // (11) Barra de abajo y botones de navegación del sistema.
    check('v1.5.15 barra inferior DOM: el CSS sube #bottomNav con la variable del margen del sistema', html.indexOf('bottom:var(--sys-nav-bottom,0px)') >= 0 && html.indexOf('--sys-nav-bottom:0px') >= 0, 'bottom:var(--sys-nav-bottom,0px)');
    check('v1.5.15 barra inferior DOM: el despeje del contenido y el cajón también usan la variable', html.indexOf('calc(104px + var(--sys-nav-bottom,0px))') >= 0 && html.indexOf('calc(100dvh - 230px - var(--sys-nav-bottom,0px))') >= 0);
    window.__wrNavInset(144);
    check('v1.5.15 barra inferior DOM: con botones (144 px) la variable sube la barra', window.document.documentElement.style.getPropertyValue('--sys-nav-bottom') === '144px', window.document.documentElement.style.getPropertyValue('--sys-nav-bottom'));
    window.__wrNavInset(0);
    check('v1.5.15 barra inferior DOM: en modo gestos (0 px) la barra queda pegada abajo, sin hueco', window.document.documentElement.style.getPropertyValue('--sys-nav-bottom') === '0px', window.document.documentElement.style.getPropertyValue('--sys-nav-bottom'));
    window.__wrNavInset(-5);
    check('v1.5.15 barra inferior DOM: un valor negativo no deja hueco raro (se limita a 0)', window.document.documentElement.style.getPropertyValue('--sys-nav-bottom') === '0px', window.document.documentElement.style.getPropertyValue('--sys-nav-bottom'));
    window.AndroidBridge.getNavBarHeight = function () { return 144; };
    T.initNavInset();
    check('v1.5.15 barra inferior DOM: al arrancar se lee la altura del puente (botones)', window.document.documentElement.style.getPropertyValue('--sys-nav-bottom') === '144px', window.document.documentElement.style.getPropertyValue('--sys-nav-bottom'));
    window.AndroidBridge.getNavBarHeight = function () { return 0; };
    T.initNavInset();
    check('v1.5.15 barra inferior DOM: al arrancar en modo gestos el puente dice 0 y no hay hueco', window.document.documentElement.style.getPropertyValue('--sys-nav-bottom') === '0px', window.document.documentElement.style.getPropertyValue('--sys-nav-bottom'));
    // (12) v1.5.16: sin botón de Mercado en la barra de abajo (5 botones, Aplicaciones 3.ª en el centro exacto).
    var navBtns1516 = Array.prototype.slice.call(window.document.querySelectorAll('#bottomNav button'));
    var navLabels1516 = navBtns1516.map(function (b) { return b.textContent; }).join('|');
    check('v1.5.16 barra: 5 botones sin Mercado, con Aplicaciones 3.ª en el centro exacto', navBtns1516.length === 5 && navBtns1516.indexOf($('navLauncherBtn')) === 2 && navLabels1516.indexOf('Mercado') < 0 && navLabels1516.indexOf('Inicio') >= 0 && navLabels1516.indexOf('Shorts') >= 0 && navLabels1516.indexOf('Grupos') >= 0 && navLabels1516.indexOf('Perfil') >= 0 && $('navLauncherBtn').getAttribute('aria-label') === 'Aplicaciones' && $('navLauncherBtn').textContent.trim() === '');
    var navSides1516 = window.document.querySelectorAll('#bottomNav .bn-side');
    check('v1.5.16 barra: los dos lados tienen 2 botones cada uno, el centro queda exacto', navSides1516.length === 2 && navSides1516[0].querySelectorAll('button').length === 2 && navSides1516[1].querySelectorAll('button').length === 2);
    var sideIcons1516 = navBtns1516.filter(function (b) { return b.id !== 'navLauncherBtn'; }).map(function (b) { return window.getComputedStyle(b.querySelector('.ic svg')).width; });
    check('v1.5.16 barra: los 4 iconos laterales miden 28 px, ninguno más grande que su espejo', sideIcons1516.length === 4 && sideIcons1516.every(function (w) { return w === '28px'; }), sideIcons1516.join(','));
    check('v1.5.16 barra: no queda ningún botón de Mercado ni referencia rota en la barra', !window.document.querySelector('#bottomNav button[data-nav="marketplace"]'));
    // Mercado sigue entrando desde arriba.
    T.go('feed');
    click($('feedMarketBtn'));
    check('v1.5.16 mercado: la vista se abre desde el acceso de arriba', !$('view-marketplace').classList.contains('hidden'));
    T.go('feed');
    // (13) v1.5.17 punto 1: sin video chiquito debajo de las publicaciones.
    const T17 = window.__wordredTest;
    const C17 = T17.core;
    const st17 = T17.getState();
    const me17 = st17.me;
    function cardStats17(postId) {
      T17.go('feed'); T17.renderFeed();
      const el = window.document.querySelector('#feed .post[data-post="' + postId + '"]');
      if (!el) return null;
      return { videos: el.querySelectorAll('video').length, medialist: !!el.querySelector('.medialist'), shared: !!el.querySelector('.shared'), imgs: el.querySelectorAll('img').length };
    }
    const v17 = C17.createPost(st17, me17, { text: 'Video 17', media: 'https://srv/video17.mp4', mediaType: 'video', videoThumb: 'data:image/jpeg;base64,AAA', privacy: 'Público' });
    const c17a = v17.ok ? cardStats17(v17.post.id) : null;
    check('v1.5.17 video chiquito: una publicación con video muestra el video una sola vez', !!c17a && c17a.videos === 1 && !c17a.medialist, JSON.stringify(c17a));
    const sh17 = v17.ok ? C17.sharePost(st17, me17, v17.post.id) : null;
    check('v1.5.17 video chiquito: al compartir un video la copia no copia el medio', !!sh17 && sh17.ok && !sh17.post.media && !sh17.post.mediaList);
    const c17b = sh17 && sh17.ok ? cardStats17(sh17.post.id) : null;
    check('v1.5.17 video chiquito: el repost de un video muestra el video una sola vez', !!c17b && c17b.videos === 1 && !c17b.medialist && c17b.shared, JSON.stringify(c17b));
    const vOld17 = C17.createPost(st17, me17, { text: 'Video viejo 17', mediaList: [{ src: 'https://srv/videoV17.mp4', type: 'video', thumb: 'data:image/jpeg;base64,VVV' }], privacy: 'Público' });
    const shOld17 = vOld17.ok ? C17.sharePost(st17, me17, vOld17.post.id) : null;
    if (shOld17 && shOld17.ok) { shOld17.post.mediaList = [{ src: 'https://srv/videoV17.mp4', type: 'video', thumb: 'data:image/jpeg;base64,VVV' }]; shOld17.post.media = 'https://srv/videoV17.mp4'; shOld17.post.mediaType = 'video'; }
    const c17c = shOld17 && shOld17.ok ? cardStats17(shOld17.post.id) : null;
    check('v1.5.17 video chiquito: un repost viejo con el duplicado guardado también se limpia al dibujarse', !!c17c && c17c.videos === 1 && !c17c.medialist, JSON.stringify(c17c));
    const vF17 = C17.createPost(st17, me17, { text: 'Video+foto 17', mediaList: [{ src: 'https://srv/videoF17.mp4', type: 'video', thumb: 'data:image/jpeg;base64,FFF' }, { src: 'https://srv/fotoF17.jpg', type: 'image' }], privacy: 'Público' });
    const shF17 = vF17.ok ? C17.sharePost(st17, me17, vF17.post.id) : null;
    if (shF17 && shF17.ok) { shF17.post.mediaList = [{ src: 'https://srv/videoF17.mp4', type: 'video', thumb: 'data:image/jpeg;base64,FFF' }, { src: 'https://srv/fotoF17.jpg', type: 'image' }]; shF17.post.media = 'https://srv/videoF17.mp4'; }
    const c17d = shF17 && shF17.ok ? cardStats17(shF17.post.id) : null;
    const elF17 = shF17 && shF17.ok ? window.document.querySelector('#feed .post[data-post="' + shF17.post.id + '"]') : null;
    check('v1.5.17 video chiquito: en un repost video+foto la foto distinta sí sigue viéndose', !!c17d && c17d.videos === 1 && !!elF17 && !!elF17.querySelector('.medialist img[src="https://srv/fotoF17.jpg"]'), JSON.stringify(c17d));
    // (14) v1.5.17 punto 2: buscar actualización en Ajustes.
    check('v1.5.17 actualización: en Ajustes, hasta arriba, está el apartado de buscar actualización', (function () { window.__wrOpenSettings(); const h = window.document.querySelector('#settingsOverlay h3.sectitle'); return h && h.textContent === 'Actualización' && $('checkUpdateBtn') && /Buscar/.test($('checkUpdateBtn').textContent) && /1\.5\.63/.test($('updateCurrentVersion').textContent); })());
    const origRetry17 = C17.serverFetchWithRetry;
    C17.serverFetchWithRetry = async function (state, path) {
      if (path === '/api/app/latest') return { ok: true, data: { ok: true, versionName: '1.5.64', versionCode: 79, url: 'https://wordred-server.onrender.com/app/WordRed.apk', notes: 'Prueba de actualización' } };
      return origRetry17.apply(this, arguments);
    };
    st17.notifications = st17.notifications.filter(function (n) { return n.type !== 'update'; });
    calls.notifications = [];
    calls.installApk = [];
    await T17.checkAppUpdate({ silent: true });
    check('v1.5.17 actualización: con versión nueva aparece el aviso en la campana', st17.notifications.some(function (n) { return n.type === 'update' && n.refId === '79'; }));
    check('v1.5.17 actualización: con versión nueva llega la notificación del celular', calls.notifications.filter(function (n) { return /actualización/.test(n.x || ''); }).length === 1, JSON.stringify(calls.notifications));
    await T17.checkAppUpdate({ silent: true });
    check('v1.5.17 actualización: la segunda revisión no repite ni la campana ni la notificación del celular', st17.notifications.filter(function (n) { return n.type === 'update'; }).length === 1 && calls.notifications.filter(function (n) { return /actualización/.test(n.x || ''); }).length === 1);
    T17.openUpdateDialog(T17.getAppUpdateInfo());
    check('v1.5.17 actualización: el diálogo muestra la versión nueva y el botón Instalar', $('updateOverlay').classList.contains('on') && /1\.5\.64/.test($('updateBody').textContent) && !$('updateInstallBtn').classList.contains('hidden'));
    check('v1.5.17 actualización: el diálogo lleva transparencia atrás', /rgba\(26,\s*12,\s*15/.test($('updateOverlay').querySelector('.glass').style.background));
    window.__wrInstallUpdate();
    check('v1.5.17 actualización: Instalar descarga el APK real del servidor', calls.installApk.length === 1 && calls.installApk[0] === 'https://wordred-server.onrender.com/app/WordRed.apk', JSON.stringify(calls.installApk));
    // (14b) v1.5.19: si el servidor devuelve la URL con http, Instalar descarga por https.
    C17.serverFetchWithRetry = async function (state, path) {
      if (path === '/api/app/latest') return { ok: true, data: { ok: true, versionName: '1.5.64', versionCode: 79, url: 'http://wordred-server.onrender.com/app/WordRed.apk', notes: 'Prueba http' } };
      return origRetry17.apply(this, arguments);
    };
    calls.installApk = [];
    await T17.checkAppUpdate({ silent: true });
    T17.openUpdateDialog(T17.getAppUpdateInfo());
    window.__wrInstallUpdate();
    check('v1.5.19 actualización: si el servidor devuelve la URL con http, Instalar descarga por https', calls.installApk.length === 1 && calls.installApk[0] === 'https://wordred-server.onrender.com/app/WordRed.apk', JSON.stringify(calls.installApk));
    C17.serverFetchWithRetry = async function (state, path) {
      if (path === '/api/app/latest') return { ok: true, data: { ok: true, versionName: '1.5.63', versionCode: 78, url: 'https://wordred-server.onrender.com/app/WordRed.apk', notes: '' } };
      return origRetry17.apply(this, arguments);
    };
    await T17.checkAppUpdate({ silent: false });
    check('v1.5.17 actualización: sin versión nueva el diálogo dice que se tiene la última', /última versión/.test($('updateBody').textContent) && $('updateInstallBtn').classList.contains('hidden'));
    C17.serverFetchWithRetry = async function (state, path) {
      if (path === '/api/app/latest') return { ok: false, error: 'sin conexión' };
      return origRetry17.apply(this, arguments);
    };
    await T17.checkAppUpdate({ silent: false });
    check('v1.5.17 actualización: si no se puede revisar, el diálogo lo dice sin inventar versión', /No se pudo revisar/.test($('updateBody').textContent) && $('updateInstallBtn').classList.contains('hidden'));
    C17.serverFetchWithRetry = origRetry17;
    // (14c) v1.5.25: al instalar una actualización, su aviso DESAPARECE DE LA CAMPANA.
    st17.updateNotifiedVersion = 53;
    st17.notifications = [
      { id: 'u-old', type: 'update', from: me17, to: me17, text: 'Hay una actualización disponible: WordRed 1.5.30.', refId: '45', createdAt: Date.now() - 86400000, read: false },
      { id: 'u-cur', type: 'update', from: me17, to: me17, text: 'Hay una actualización disponible: WordRed 1.5.45.', refId: '60', createdAt: Date.now() - 3600000, read: false },
      { id: 'u-new', type: 'update', from: me17, to: me17, text: 'Hay una actualización disponible: WordRed 1.5.64.', refId: '79', createdAt: Date.now(), read: false },
      { id: 'n-like', type: 'like', from: '5522222222', to: me17, text: 'A Bruno le gusta tu publicación.', refId: 'post1', createdAt: Date.now(), read: false },
    ];
    T17.updateBadges();
    const bellBefore25 = $('hdrBellBadge').textContent;
    T17.pruneInstalledUpdateNotifs();
    check('v1.5.25 campana: al arrancar, los avisos de actualización ya instalados desaparecen de la campana', !st17.notifications.some(function (n) { return n.id === 'u-old' || n.id === 'u-cur'; }));
    check('v1.5.25 campana: el aviso de una versión todavía más nueva se queda', st17.notifications.some(function (n) { return n.id === 'u-new'; }));
    check('v1.5.25 campana: los demás avisos no se tocan', st17.notifications.some(function (n) { return n.id === 'n-like'; }));
    check('v1.5.25 campana: al limpiar, la insignia de la campana se actualiza', bellBefore25 === '4' && $('hdrBellBadge').textContent === '2', 'antes=' + bellBefore25 + ' ahora=' + $('hdrBellBadge').textContent);
    check('v1.5.25 campana: updateNotifiedVersion de una versión ya instalada también se limpia', st17.updateNotifiedVersion === 0);
    st17.notifications.push({ id: 'u-old2', type: 'update', from: me17, to: me17, text: 'Hay una actualización disponible: WordRed 1.5.27.', refId: '42', createdAt: Date.now() - 86400000, read: false });
    await T17.checkAppUpdate({ silent: true });
    check('v1.5.25 campana: al comprobar que no hay versión nueva, los avisos ya instalados también desaparecen', !st17.notifications.some(function (n) { return n.id === 'u-old2'; }) && st17.notifications.some(function (n) { return n.id === 'u-new'; }));
    // (15) v1.5.17 punto 3: notificaciones de otras apps en la campana.
    calls.notifAccessGranted = true;
    calls.otherNotifs = [1, 2, 3, 4, 5, 6, 7, 8].map(function (i) { return { pkg: 'com.ejemplo.app' + i, app: 'App ejemplo ' + i, title: 'Título ' + i, text: 'Texto ' + i, time: Date.now() - i * 60000 }; });
    T17.go('notifs');
    const notifHtml17 = $('notifList').innerHTML;
    check('v1.5.17 otras apps: la campana tiene el apartado de WordRed y el de otras apps/sistema, separados', /WordRed/.test(notifHtml17) && /Otras aplicaciones y sistema/.test(notifHtml17) && notifHtml17.indexOf('WordRed') < notifHtml17.indexOf('Otras aplicaciones y sistema'));
    check('v1.5.17 otras apps: con muchas solo se ven las primeras 5 y abajo los 3 puntos', window.document.querySelectorAll('#otherNotifsMore .notif').length === 3 && !!window.document.querySelector('.otherNotifsToggle') && /···/.test(window.document.querySelector('.otherNotifsToggle').textContent));
    click(window.document.querySelector('.otherNotifsToggle'));
    check('v1.5.17 otras apps: al tocar los 3 puntos se despliegan las demás', window.document.querySelector('#otherNotifsMore').classList.contains('open'));
    click(window.document.querySelector('.otherNotifsToggle'));
    check('v1.5.17 otras apps: al tocar de nuevo se vuelven a comprimir', !window.document.querySelector('#otherNotifsMore').classList.contains('open'));
    calls.notifAccessGranted = false;
    calls.otherNotifs = [];
    T17.go('notifs');
    check('v1.5.17 otras apps: sin acceso no se inventan notificaciones de otras apps', /concede el acceso/.test($('notifList').textContent) && !/App ejemplo/.test($('notifList').textContent));
    calls.notifAccessGranted = true;
    // (16) v1.5.17 punto 4: batería en el encabezado y avisos de batería.
    check('v1.5.23 batería: el indicador va en el Inicio, en la fila de botones, justo después de Marketplace (ya no en el header)', !!$('batteryInd') && !$('batteryInd').closest('header') && !!$('batteryInd').closest('#view-feed') && $('batteryInd').parentElement.classList.contains('chiprow') && $('batteryInd').previousElementSibling && $('batteryInd').previousElementSibling.id === 'feedMarketBtn');
    T17.setBatteryStatus(87, false);
    check('v1.5.17 batería: el indicador muestra el porcentaje real sin rayo si no carga', $('batteryInd').textContent.indexOf('87%') >= 0 && $('batteryInd').innerHTML.indexOf('M13.8') < 0 && !$('batteryInd').classList.contains('low'));
    T17.setBatteryStatus(60, true);
    check('v1.5.17 batería: cargando aparece el rayo dentro del símbolo (1.5.37)', $('batteryInd').textContent.indexOf('60%') >= 0 && $('batteryInd').innerHTML.indexOf('M13.8') >= 0);
    T17.setBatteryStatus(12, false);
    check('v1.5.17 batería: con 12% el indicador se marca en rojo (baja)', $('batteryInd').classList.contains('low') && $('batteryInd').textContent.indexOf('12%') >= 0);
    window.__onBatteryStatus({ level: 45, charging: false });
    check('v1.5.17 batería: el estado real del teléfono actualiza el indicador en vivo', $('batteryInd').textContent.indexOf('45%') >= 0 && !$('batteryInd').classList.contains('low'));
    T17.setBatteryStatus(-1, false);
    check('v1.5.17 batería: sin nivel real no se inventa ningún porcentaje', $('batteryInd').textContent.trim() === '' && $('batteryInd').classList.contains('hidden'));
    const sysBefore17 = st17.notifications.filter(function (n) { return n.type === 'system'; }).length;
    check('v1.5.17 batería: aviso de batería baja con el nivel real (15% sin cargar)', T17.batteryNotice('low', 15, false) === true && st17.notifications.some(function (n) { return n.type === 'system' && /Batería baja/.test(n.text) && /15%/.test(n.text); }));
    check('v1.5.17 batería: el aviso de batería baja no se repite el mismo día', T17.batteryNotice('low', 14, false) === false && st17.notifications.filter(function (n) { return n.type === 'system'; }).length === sysBefore17 + 1);
    check('v1.5.17 batería: no se inventa un aviso de batería baja con 50%', T17.batteryNotice('low', 50, false) === false);
    check('v1.5.17 batería: aviso de batería llena al 100% cargando', T17.batteryNotice('full', 100, true) === true && st17.notifications.some(function (n) { return n.type === 'system' && /Batería llena/.test(n.text); }));
    check('v1.5.17 batería: no se inventa un aviso de batería llena al 80%', T17.batteryNotice('full', 80, true) === false);
    check('v1.5.17 batería: no hay aviso de llena al 100% si no está cargando', T17.batteryNotice('full', 100, false) === false);
    T17.go('notifs');
    const notifHtmlB17 = $('notifList').innerHTML;
    check('v1.5.17 batería: los avisos de batería salen en el apartado de otras apps/sistema, no mezclados con los de WordRed', notifHtmlB17.indexOf('Batería baja') > notifHtmlB17.indexOf('Otras aplicaciones y sistema') && notifHtmlB17.indexOf('Batería baja') > notifHtmlB17.indexOf('WordRed'));
    st17.notifications = st17.notifications.filter(function (n) { return n.type !== 'system'; });
    calls.batteryStatus = { level: 14, charging: false };
    calls.pendingBattery = [{ kind: 'full', level: 100, date: '2026-11-14' }];
    T17.checkBatteryNoticesOnStart();
    check('v1.5.17 batería: al abrir la app, el nivel real bajo añade su aviso y se recogen los pendientes', st17.notifications.some(function (n) { return n.type === 'system' && /Batería baja/.test(n.text); }) && st17.notifications.some(function (n) { return n.type === 'system' && /Batería llena/.test(n.text); }) && $('batteryInd').textContent.indexOf('14%') >= 0);
    calls.batteryStatus = { level: -1, charging: false };
    calls.pendingBattery = [];
    // v1.5.21: el cajón de aplicaciones se abre en milisegundos.
    var bridgeCalls21 = { list: 0, counts: 0 };
    var origList21 = window.AndroidBridge.listInstalledApps;
    var origCounts21 = window.AndroidBridge.getAppNotificationCounts;
    window.AndroidBridge.listInstalledApps = function () { bridgeCalls21.list++; return origList21.apply(this, arguments); };
    window.AndroidBridge.getAppNotificationCounts = function () { bridgeCalls21.counts++; return origCounts21.apply(this, arguments); };
    T17.setInstalledApps(JSON.parse(origList21()));
    T17.openAppsDrawer();
    check('v1.5.21 apertura DOM: al presionar el botón del centro el cajón se abre al instante desde la caché, sin llamar todavía al puente', $('appsDrawerOverlay').classList.contains('on') && qa('#appsDrawerGrid .launcherTile').length === 7 && bridgeCalls21.list === 0 && bridgeCalls21.counts === 0, 'list=' + bridgeCalls21.list + ' counts=' + bridgeCalls21.counts);
    var tileAtOpen21 = q('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.camara"]');
    await tick();
    check('v1.5.21 apertura DOM: la lista y los numeritos se actualizan por detrás, cuando el cajón ya se ve', bridgeCalls21.list === 1 && bridgeCalls21.counts === 1, 'list=' + bridgeCalls21.list + ' counts=' + bridgeCalls21.counts);
    check('v1.5.21 apertura DOM: sin cambios en la lista, la actualización de fondo NO vuelve a dibujar el grid (las fichas son las mismas)', q('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.camara"]') === tileAtOpen21);
    calls.notifCounts = { 'com.demo.camara': 5 };
    T17.refreshAppNotifCounts();
    var camTile21 = q('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.camara"]');
    check('v1.5.21 numeritos DOM: el numerito se pone en su sitio sin reconstruir el grid (la ficha es la misma)', !!camTile21 && !!camTile21.querySelector('.appNotifBadge') && camTile21.querySelector('.appNotifBadge').textContent === '5' && camTile21 === tileAtOpen21);
    calls.notifCounts = {};
    T17.refreshAppNotifCounts();
    check('v1.5.21 numeritos DOM: al quitarse los pendientes, el numerito desaparece sin reconstruir el grid', !camTile21.querySelector('.appNotifBadge') && q('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.camara"]') === tileAtOpen21);
    var listWithIcons21 = JSON.parse(origList21());
    listWithIcons21[0].icon = 'data:image/png;base64,ICONO21';
    T17.setInstalledApps(listWithIcons21);
    window.AndroidBridge.listInstalledApps = function () { var l = JSON.parse(origList21()); l[0].name = 'Cámara Pro'; return JSON.stringify(l); };
    T17.refreshLauncherApps();
    var camTile21b = q('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.camara"]');
    check('v1.5.21 iconos DOM: al cambiar el nombre, el cajón se vuelve a dibujar pero el icono que ya estaba en caché se conserva', !!camTile21b && camTile21b.textContent.indexOf('Cámara Pro') >= 0 && !!camTile21b.querySelector('img[src="data:image/png;base64,ICONO21"]'));
    window.AndroidBridge.listInstalledApps = origList21;
    T17.setInstalledApps([]);
    T17.openAppsDrawer();
    check('v1.5.21 primera apertura DOM: sin lista en memoria, el cajón se muestra igual de inmediato con "Cargando aplicaciones…"', $('appsDrawerOverlay').classList.contains('on') && $('appsDrawerGrid').textContent.indexOf('Cargando aplicaciones') >= 0);
    await tick();
    check('v1.5.21 primera apertura DOM: las apps se rellenan al llegar, sin bloquear la apertura', qa('#appsDrawerGrid .launcherTile').length === 7, 'tiles=' + qa('#appsDrawerGrid .launcherTile').length);
    window.AndroidBridge.getAppNotificationCounts = origCounts21;
    check('v1.5.21 campanita: en JS no hay sonido de notificación (la campanita es nativa, no WebAudio)', !/startAmbient|OscillatorNode|AMBIENT_CHORDS/.test(fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8')));

    // v1.5.23: el perfil PROPIO se rediseña (la cuadrícula de la 1.5.22
    // queda solo en el perfil de otra persona) y las visitas son reales.
    const T23 = window.__wordredTest;
    const idxCss23 = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
    // Visitas simuladas del servidor 3.7: Beto y Celia vieron mi perfil.
    let viewsMock23 = { ok: true, count: 2, lastViewer: { phone: '1000000002', name: 'Beto', avatar: '' }, viewers: [{ phone: '1000000002', name: 'Beto', avatar: '', at: Date.now() - 3600000 }, { phone: '1000000003', name: 'Celia', avatar: '', at: Date.now() - 7200000 }] };
    const viewPosts23 = [];
    const origFetch23 = T23.core.serverFetch;
    T23.core.serverFetch = function (state, path, method, body) {
      if (path === '/api/profile-views/me') return Promise.resolve({ ok: true, data: viewsMock23 });
      if (path === '/api/profile-views') { viewPosts23.push(body); return Promise.resolve({ ok: true, data: { ok: true, recorded: true, count: 1 } }); }
      return origFetch23.apply(this, arguments);
    };
    delete T23.getState().profileViews; /* 1.5.31: sin caché viejo de visitas: la sección controla el endpoint con su mock (el mock general devuelve 0 para esta ruta). */
    T23.go('profile');
    await tick();
    // Fila superior: 6 botones solo-símbolo, del mismo tamaño, simétricos (1.5.30: los de abajo subieron aquí; 1.5.32: Amigos salió de la fila y su insignia vive en Seguidores).
    const topBtns23 = qa('#ownProfile .ownTopRow > button');
    check('v1.5.23 perfil propio: la fila superior tiene 6 botones solo con símbolo, del mismo tamaño', topBtns23.length === 6 && /^[0-9]*$/.test(topBtns23[1].textContent.trim()) && topBtns23[5].textContent.trim() === '' && topBtns23[0].textContent.trim() === (q('#profileViewsAvatar').textContent.trim() + (q('#profileViewsCount').textContent || '')), 'botones=' + topBtns23.length);
    check('v1.5.23 perfil propio: el círculo de visitas muestra la foto del último visitante y el número real', !!q('#profileViewsBtn') && !!q('#profileViewsAvatar') && q('#profileViewsCount').textContent === '2' && q('#profileViewsAvatar').textContent.trim() === 'B', 'count=' + (q('#profileViewsCount') && q('#profileViewsCount').textContent));
    check('v1.5.23 perfil propio: el botón de seguir abre la lista de amigos y el engranaje es rojo, va el último y abre Ajustes', topBtns23.length === 6 && (topBtns23[1].getAttribute('aria-label') || '') === 'Seguidores' && (topBtns23[1].getAttribute('onclick') || '').indexOf('__wrOpenFriends') >= 0 && topBtns23[5].classList.contains('red') && (topBtns23[5].getAttribute('aria-label') || '') === 'Ajustes' && (topBtns23[5].getAttribute('onclick') || '').indexOf('__wrOpenSettings') >= 0);
    // Foto a la derecha con el + rojo; nombre grande a la izquierda con el lápiz.
    const nameCs23 = q('#ownProfile .ownName') ? window.getComputedStyle(q('#ownProfile .ownName')) : null;
    check('v1.5.23 perfil propio: foto a la derecha con el + rojo y nombre grande a la izquierda con el lápiz', !!q('#ownProfile .ownHeadRow') && !!q('#ownProfile .ownAvatarWrap .avatar') && !!q('#ownProfile .ownStoryPlus') && q('#ownProfile .ownStoryPlus').textContent.trim() === '+' && !!q('#ownProfile .ownName') && !!nameCs23 && nameCs23.fontSize === '26px' && !!q('#ownProfile .ownEditBtn') && (q('#ownProfile .ownEditBtn').getAttribute('onclick') || '').indexOf('__wrEditProfile') >= 0, 'fontSize=' + (nameCs23 && nameCs23.fontSize));
    // Cantidades medianas a la izquierda bajo el logo.
    const stats23 = q('#ownProfile .ownStats');
    check('v1.5.23 perfil propio: las cantidades son medianas y están a la izquierda bajo el logo', !!stats23 && stats23.textContent.indexOf('amigos') >= 0 && stats23.textContent.indexOf('publicaciones') >= 0 && stats23.textContent.indexOf('guardadas') >= 0 && /\.ownStats b\{display:block;font-size:16px\}/.test(idxCss23) && !/\.ownStats\{[^}]*justify-content:center/.test(idxCss23));
    // v1.5.25: la biografía (con sus datos) va DENTRO de la columna
    // izquierda de la cabecera, justo abajo del nombre y al lado de la
    // foto: antes quedaba debajo de toda la fila y se veía un hueco.
    const headRow25 = q('#ownProfile .ownHeadRow');
    const headCol25 = q('#ownProfile .ownHeadRow .ownHeadCol');
    const colKids25 = headCol25 ? Array.from(headCol25.children) : [];
    const iName25 = colKids25.findIndex(function (e) { return e.classList.contains('ownName'); });
    const iBio25 = colKids25.findIndex(function (e) { return e.tagName === 'P'; });
    const iData25 = colKids25.findIndex(function (e) { return e.classList.contains('mt'); });
    const headKids25 = Array.from(q('#ownProfile .ownProfileHead').children);
    const iHead25 = headKids25.findIndex(function (e) { return e.classList.contains('ownHeadRow'); });
    const iStats25 = headKids25.findIndex(function (e) { return e.classList.contains('ownStats'); });
    const iQuick25 = headKids25.findIndex(function (e) { return e.classList.contains('ownQuickRow'); });
    check('v1.5.25 perfil propio: la biografía y los datos están dentro de la columna izquierda, justo después del nombre', !!headRow25 && !!headCol25 && iName25 >= 0 && iBio25 > iName25 && (iData25 < 0 || iData25 > iBio25), colKids25.map(function (e) { return e.className || e.tagName; }).join(','));
    check('v1.5.25 perfil propio: sin hueco entre el nombre y la biografía (la columna es el primer hijo de la cabecera y la foto sigue a la derecha; 1.5.30: ya no hay fila rápida)', !!headRow25 && headRow25.children.length === 2 && headRow25.children[0].classList.contains('ownHeadCol') && !!q('#ownProfile .ownAvatarWrap') && iStats25 > iHead25 && iQuick25 < 0, headKids25.map(function (e) { return e.className || e.tagName; }).join(','));
    check('v1.5.25 perfil propio: la biografía no tiene margen extra sobre el nombre', (function () { var bio = q('#ownProfile .ownHeadCol p.muted'); return !!bio && window.getComputedStyle(bio).marginTop === '4px'; })());
    // 1.5.30: los botones ya no van en una fila rápida — están en la fila superior, solo con símbolo, en orden. 1.5.32: el botón Amigos sale de la fila (6 botones en total).
    const topBtns30 = qa('#ownProfile .ownTopRow > button');
    check('v1.5.32 perfil propio: los botones están en la fila superior (6 botones en total), solo con símbolo y en orden, con el engranaje el último', topBtns30.length === 6 && !q('#ownProfile .ownQuickRow') && topBtns30.map(function (b) { return b.getAttribute('aria-label') || ''; }).join('|') === 'Quienes vieron tu perfil|Seguidores|Tu actividad|Transmitir en vivo|Recomendar un lugar|Ajustes' && topBtns30.slice(1).every(function (b) { return /^[0-9]*$/.test(b.textContent.trim()); }), topBtns30.map(function (b) { return b.getAttribute('aria-label') || b.className; }).join(' | '));
    check('v1.5.32 perfil propio: los de arriba conservan sus funciones y el engranaje abre Ajustes', topBtns30.length === 6 && (topBtns30[1].getAttribute('onclick') || '').indexOf('__wrOpenFriends') >= 0 && (topBtns30[2].getAttribute('onclick') || '').indexOf('__wrOpenActivity') >= 0 && (topBtns30[3].getAttribute('onclick') || '').indexOf('__wrOpenLiveStart') >= 0 && (topBtns30[4].getAttribute('onclick') || '').indexOf('__wrOpenPlaceForm') >= 0 && (topBtns30[5].getAttribute('onclick') || '').indexOf('__wrOpenSettings') >= 0);
    // Insignia de solicitudes en Seguidores (1.5.32: Amigos salió de la fila).
    const stP23 = T23.getState();
    const pendP23 = stP23.requests.filter(function (r) { return r.to === stP23.me && r.status === 'pending'; }).length;
    stP23.requests.push({ id: 'req-1523', from: '1000000002', to: stP23.me, status: 'pending' });
    T23.go('profile');
    const badge23 = q('#profileFriendsBadge');
    check('v1.5.23 perfil propio: con una solicitud pendiente, Seguidores muestra la insignia con el número', !!badge23 && !badge23.classList.contains('hidden') && badge23.textContent === String(pendP23 + 1) && badge23.parentElement && (badge23.parentElement.getAttribute('aria-label') || '') === 'Seguidores', badge23 ? badge23.textContent : 'sin insignia');
    stP23.requests = stP23.requests.filter(function (r) { return r.id !== 'req-1523'; });
    T23.go('profile');
    await tick();
    // Cada botón abre su función real (clic de verdad).
    click(q('#ownProfile .ownStoryPlus'));
    check('v1.5.23 perfil propio: el + rojo abre el compositor de historias', $('storyCreateOverlay').classList.contains('on'));
    click(window.document.querySelector('[data-close="storyCreateOverlay"]'));
    click(q('#ownProfile .ownEditBtn'));
    check('v1.5.23 perfil propio: el lápiz abre Editar perfil', $('editProfileOverlay').classList.contains('on'));
    click(window.document.querySelector('[data-close="editProfileOverlay"]'));
    const topBtns23b = qa('#ownProfile .ownTopRow > button');
    click(topBtns23b[2]);
    check('v1.5.23 perfil propio: el engranaje rojo abre Ajustes', $('settingsOverlay').classList.contains('on'));
    click(window.document.querySelector('[data-close="settingsOverlay"]'));
    click(topBtns23b[1]);
    check('v1.5.23 perfil propio: el botón de seguir abre la lista de amigos', q('#view-friends').classList.contains('on'));
    T23.go('profile');
    await tick();
    click(q('#profileViewsBtn'));
    await tick();
    check('v1.5.23 visitas: el círculo abre la lista real de quienes vieron mi perfil', $('profileViewsOverlay').classList.contains('on') && $('profileViewsList').textContent.indexOf('Beto') >= 0 && $('profileViewsList').textContent.indexOf('Celia') >= 0, $('profileViewsList').textContent.slice(0, 80));
    click(window.document.querySelector('[data-close="profileViewsOverlay"]'));
    // Estado vacío: 0 visitas, sin inventar cuentas.
    viewsMock23 = { ok: true, count: 0, lastViewer: null, viewers: [] };
    delete stP23.profileViews;
    T23.go('profile');
    await tick();
    check('v1.5.23 visitas: sin visitas, el círculo muestra 0 y no inventa ninguna cuenta', !!q('#profileViewsCount') && q('#profileViewsCount').textContent === '0' && q('#profileViewsAvatar').textContent.trim() === '', 'count=' + (q('#profileViewsCount') && q('#profileViewsCount').textContent));
    click(q('#profileViewsBtn'));
    await tick();
    check('v1.5.23 visitas: sin visitas, la lista dice que nadie ha visto el perfil todavía', $('profileViewsOverlay').classList.contains('on') && $('profileViewsList').textContent.indexOf('Nadie ha visto tu perfil todavía') >= 0);
    click(window.document.querySelector('[data-close="profileViewsOverlay"]'));
    // Al abrir el perfil de otra persona, la visita se registra en el servidor.
    window.__wrOpenProfile('1000000001');
    check('v1.5.23 visitas: al abrir el perfil de otra persona se registra la visita (POST /api/profile-views)', viewPosts23.some(function (b) { return b && b.viewedPhone === '1000000001'; }), JSON.stringify(viewPosts23));
    // Perfil de otra persona: sigue como en la 1.5.22 (centrado + cuadrícula).
    const dTop23 = q('#profileDetail .profileTop');
    const dBtns23 = qa('#profileDetail .profileBtns > button');
    check('v1.5.23 perfil de otra persona: foto, nombre, biografía y números centrados, botones en cuadrícula de 2 columnas', !!dTop23 && window.getComputedStyle(dTop23).textAlign === 'center' && dBtns23.length === 6 && window.getComputedStyle(q('#profileDetail .profileBtns')).display === 'grid' && dBtns23.some(function (b) { return b.textContent.indexOf('Silenciar avisos') >= 0; }), 'botones=' + dBtns23.length);
    check('v1.5.23 perfil de otra persona: los botones conservan todas sus funciones y el último ocupa todo el ancho', dBtns23.length === 6 && dBtns23.some(function (b) { return b.textContent.indexOf('Mensaje') >= 0; }) && dBtns23.some(function (b) { return b.textContent.indexOf('Perfil de ventas') >= 0; }) && dBtns23.some(function (b) { return b.textContent.indexOf('Silenciar avisos') >= 0; }) && dBtns23.some(function (b) { return b.textContent.indexOf('Reportar') >= 0; }) && dBtns23[dBtns23.length - 1].classList.contains('wide') && dBtns23[dBtns23.length - 1].textContent.indexOf('Reportar') >= 0, dBtns23.map(function (b) { return b.textContent.trim(); }).join(' | '));
    check('v1.5.30 perfil: las secciones de abajo quedan después de las cantidades (sin fila rápida en medio)', !!q('#ownProfile h3.sectitle') && $('ownProfile').innerHTML.indexOf('ownQuickRow') < 0 && $('ownProfile').innerHTML.indexOf('Mis publicaciones') > $('ownProfile').innerHTML.indexOf('ownStats'));
    // v1.5.23 (alcance añadido): Mis grabaciones de lives ANTES de Tienda de juegos.
    const profSections23 = qa('#view-profile > section').map(function (s) { return s.id; });
    check('v1.5.23 perfil: Mis grabaciones de lives va antes que Tienda de juegos', profSections23.length === 2 && profSections23[0] === 'liveRecordingsSection' && profSections23[1] === 'gamesSection', profSections23.join(','));
    T23.core.serverFetch = origFetch23;
    // (17) v1.5.25: reproductor propio de video en todos lados.
    const T25 = window.__wordredTest;
    const C25 = T25.core;
    const st25 = T25.getState();
    const me25 = st25.me;
    const vSub25 = C25.createPost(st25, me25, { text: 'Video con subs 25', media: 'https://srv/video-subs25.mp4', mediaType: 'video', videoThumb: 'data:image/jpeg;base64,AAA', privacy: 'Público', videoEdits: { subtitles: [{ text: 'Hola mundo', start: 0, end: 3000, color: '#ffffff', size: 20, x: 50, y: 85 }] } });
    const vPlain25 = C25.createPost(st25, me25, { text: 'Video mío sin subs 25', media: 'https://srv/video-mio25.mp4', mediaType: 'video', videoThumb: 'data:image/jpeg;base64,BBB', privacy: 'Público' });
    const vOther25 = C25.createPost(st25, '1000000002', { text: 'Video ajeno 25', media: 'https://srv/video-ajeno25.mp4', mediaType: 'video', videoThumb: 'data:image/jpeg;base64,CCC', privacy: 'Público' });
    check('v1.5.25 videos: se crean las publicaciones de prueba (con subs, mía sin subs, ajena)', vSub25.ok && vPlain25.ok && vOther25.ok, JSON.stringify([vSub25.ok, vPlain25.ok, vOther25.ok]));
    T25.go('feed'); T25.renderFeed();
    await tick();
    const vidSub25 = q('#feed .post[data-post="' + vSub25.post.id + '"] video');
    const vidPlain25 = q('#feed .post[data-post="' + vPlain25.post.id + '"] video');
    const vidOther25 = q('#feed .post[data-post="' + vOther25.post.id + '"] video');
    check('v1.5.25 videos: los tres videos están en el inicio', !!vidSub25 && !!vidPlain25 && !!vidOther25);
    check('v1.5.25 videos: ningún video lleva los controles nativos (sin atributo controls)', [vidSub25, vidPlain25, vidOther25].every(function (v) { return v && !v.hasAttribute('controls'); }));
    const barSub25 = vidSub25 ? vidSub25.closest('.wrPlayer').querySelector('.wrBar') : null;
    check('v1.5.25 videos: la barra propia aparece en la publicación con todos sus botones e iconos', !!barSub25 && !!barSub25.querySelector('.wrPlay svg') && !!barSub25.querySelector('.wrProg') && !!barSub25.querySelector('.wrTime') && !!barSub25.querySelector('.wrMute svg') && !!barSub25.querySelector('.wrCc svg') && !!barSub25.querySelector('.wrFull svg') && !!barSub25.querySelector('.wrMore svg') && !!barSub25.querySelector('.wrSpeedMenu'));
    // Reproducir/pausa de verdad (el botón llama a play/pause y el icono refleja el estado real).
    function stubVid25(v, duration) {
      v._playing = false;
      v._playCalls = 0;
      v._pauseCalls = 0;
      v.play = function () { v._playCalls++; v._playing = true; return Promise.resolve(); };
      v.pause = function () { v._pauseCalls++; v._playing = false; };
      Object.defineProperty(v, 'paused', { get: function () { return !this._playing; }, configurable: true });
      Object.defineProperty(v, 'duration', { value: duration || 120, configurable: true });
      var ct = 0;
      Object.defineProperty(v, 'currentTime', { get: function () { return ct; }, set: function (x) { ct = x; }, configurable: true });
    }
    stubVid25(vidSub25, 120);
    click(barSub25.querySelector('.wrPlay'));
    check('v1.5.25 videos: el botón de reproducir llama a play de verdad', vidSub25._playCalls === 1 && vidSub25._playing);
    vidSub25.dispatchEvent(new window.Event('play'));
    check('v1.5.25 videos: al reproducir, el botón muestra pausa (refleja el estado real)', barSub25.querySelector('.wrPlay').innerHTML.indexOf('rect x="6"') >= 0);
    click(barSub25.querySelector('.wrPlay'));
    check('v1.5.25 videos: el botón de pausa llama a pause de verdad', vidSub25._pauseCalls === 1 && !vidSub25._playing);
    vidSub25.dispatchEvent(new window.Event('pause'));
    check('v1.5.25 videos: al pausar, el botón vuelve a mostrar reproducir', barSub25.querySelector('.wrPlay').innerHTML.indexOf('polygon') >= 0);
    // Buscar: tocar y arrastrar.
    const prog25 = barSub25.querySelector('.wrProg');
    prog25.getBoundingClientRect = function () { return { left: 100, width: 200, top: 0, height: 22, right: 300, bottom: 22 }; };
    check('v1.5.25 videos: buscar calcula bien la posición (mitad = 50%)', T25.wrPlayerSeekRatio(prog25, 200) === 0.5 && T25.wrPlayerSeekRatio(prog25, 100) === 0 && T25.wrPlayerSeekRatio(prog25, 300) === 1);
    window.__wrPlayerSeekStart(prog25, { clientX: 200, preventDefault: function () {} });
    check('v1.5.25 videos: tocar la barra busca en ese momento del video', vidSub25.currentTime === 60, 'currentTime=' + vidSub25.currentTime);
    prog25.setPointerCapture = function () {};
    window.__wrPlayerSeekStart(prog25, { clientX: 150, preventDefault: function () {}, pointerId: 1 });
    var pm25 = new window.Event('pointermove', { bubbles: true }); pm25.clientX = 250;
    prog25.dispatchEvent(pm25);
    check('v1.5.25 videos: arrastrar la barra busca mientras se mueve', vidSub25.currentTime === 90, 'currentTime=' + vidSub25.currentTime);
    // Tiempo en vivo y progreso.
    vidSub25.currentTime = 30;
    vidSub25.dispatchEvent(new window.Event('timeupdate'));
    check('v1.5.25 videos: el tiempo se actualiza en vivo (actual / total) y el progreso avanza', barSub25.querySelector('.wrTime').textContent === '0:30 / 2:00' && barSub25.querySelector('.wrProgFill').style.width === '25%', barSub25.querySelector('.wrTime').textContent + ' fill=' + barSub25.querySelector('.wrProgFill').style.width);
    // Silencio/sonido.
    click(barSub25.querySelector('.wrMute'));
    check('v1.5.25 videos: el botón de silencio silencia el video de verdad', vidSub25.muted === true);
    vidSub25.dispatchEvent(new window.Event('volumechange'));
    check('v1.5.25 videos: silenciado, el icono cambia a sin sonido', barSub25.querySelector('.wrMute').innerHTML.indexOf('x1="23"') >= 0);
    click(barSub25.querySelector('.wrMute'));
    check('v1.5.25 videos: tocar de nuevo devuelve el sonido', vidSub25.muted === false);
    // Pantalla completa sobre el contenedor.
    const playerSub25 = vidSub25.closest('.wrPlayer');
    let fsCalled25 = 0;
    playerSub25.requestFullscreen = function () { fsCalled25++; };
    click(barSub25.querySelector('.wrFull'));
    check('v1.5.25 videos: pantalla completa se pide sobre el contenedor (video + barra)', fsCalled25 === 1);
    // Menú ⋮ con velocidades reales.
    click(barSub25.querySelector('.wrMore'));
    const menu25 = barSub25.querySelector('.wrSpeedMenu');
    check('v1.5.25 videos: el menú ⋮ se abre con las 6 velocidades y marca la actual (1×)', !menu25.classList.contains('hidden') && menu25.querySelectorAll('[data-rate]').length === 6 && menu25.querySelector('[data-rate="1"]').classList.contains('on'));
    const opt1525 = menu25.querySelector('[data-rate="1.5"]');
    click(opt1525);
    check('v1.5.25 videos: elegir 1.5× cambia la velocidad de verdad y cierra el menú', vidSub25.playbackRate === 1.5 && menu25.classList.contains('hidden') && opt1525.classList.contains('on'));
    click(barSub25.querySelector('.wrMore'));
    window.document.body.click();
    check('v1.5.25 videos: tocar fuera del menú de velocidades lo cierra', menu25.classList.contains('hidden'));
    // CC con subtítulos: muestra/oculta las capas .vsub.
    const ccSub25 = barSub25.querySelector('.wrCc');
    const subSpan25 = vidSub25.closest('.wrPlayer').querySelector('.vsub');
    check('v1.5.25 videos: el video con subtítulos muestra el CC activo y la capa .vsub', !!subSpan25 && ccSub25.classList.contains('on'));
    vidSub25.currentTime = 1;
    vidSub25.dispatchEvent(new window.Event('timeupdate'));
    check('v1.5.25 videos: el subtítulo aparece solo en su momento', subSpan25.style.display === '');
    click(ccSub25);
    check('v1.5.25 videos: el CC oculta los subtítulos y el botón se apaga', vidSub25.closest('.wrPlayer').classList.contains('wrSubsOff') && !ccSub25.classList.contains('on') && subSpan25.style.display === 'none');
    vidSub25.dispatchEvent(new window.Event('timeupdate'));
    check('v1.5.25 videos: con el CC apagado, el subtítulo no vuelve a aparecer solo', subSpan25.style.display === 'none');
    click(ccSub25);
    check('v1.5.25 videos: el CC vuelve a mostrar los subtítulos', !vidSub25.closest('.wrPlayer').classList.contains('wrSubsOff') && ccSub25.classList.contains('on'));
    vidSub25.dispatchEvent(new window.Event('timeupdate'));
    check('v1.5.25 videos: al reactivar el CC, el subtítulo en su momento se ve', subSpan25.style.display === '');
    // CC en video propio sin subtítulos: abre el editor y se guardan de verdad.
    const barPlain25 = vidPlain25.closest('.wrPlayer').querySelector('.wrBar');
    const ccPlain25 = barPlain25.querySelector('.wrCc');
    check('v1.5.25 videos: el video propio sin subtítulos muestra el CC apagado', !ccPlain25.classList.contains('on'));
    const editsBefore25 = vPlain25.post.editCount || 0;
    // El servidor rechaza el guardado si la publicación ya usó sus 5 ediciones: nada de éxito falso.
    calls.putPostsReject = true;
    click(ccPlain25);
    check('v1.5.25 videos: el CC en un video propio sin subtítulos abre el editor de video con la herramienta de subtítulos', $('videoEditorOverlay').classList.contains('on') && !!q('#videoEditTools .chip[data-tool="subtitle"].on'));
    $('videoEditSubText').value = 'Sub de prueba 25';
    $('videoEditSubStart').value = '0';
    $('videoEditSubEnd').value = '3';
    click($('videoEditSubAdd'));
    check('v1.5.25 videos: en el editor se puede agregar el subtítulo', $('videoEditPanel').textContent.indexOf('Sub de prueba 25') >= 0);
    click($('videoEditApply'));
    await tick(); await tick();
    const postPlain25a = st25.posts.filter(function (p) { return p.id === vPlain25.post.id; })[0];
    check('v1.5.25 videos: si el servidor rechaza el guardado, los subtítulos se revierten en este teléfono', !postPlain25a.videoEdits || !(postPlain25a.videoEdits.subtitles || []).some(function (t) { return t.text === 'Sub de prueba 25'; }));
    check('v1.5.25 videos: si el servidor rechaza el guardado, se avisa con el error real y no se finge éxito', $('toast').textContent.indexOf('ya se editó 5 veces') >= 0 && $('toast').textContent.indexOf('Subtítulos guardados') < 0, $('toast').textContent);
    calls.putPostsReject = false;
    // Ahora el guardado sí pasa: los subtítulos quedan en la publicación y el contador se sincroniza con el servidor (el PUT cuenta como una edición).
    click(ccPlain25);
    $('videoEditSubText').value = 'Sub de prueba 25';
    $('videoEditSubStart').value = '0';
    $('videoEditSubEnd').value = '3';
    click($('videoEditSubAdd'));
    click($('videoEditApply'));
    await tick(); await tick();
    const postPlain25 = st25.posts.filter(function (p) { return p.id === vPlain25.post.id; })[0];
    check('v1.5.25 videos: al aplicar, los subtítulos quedan guardados en la publicación', !!postPlain25.videoEdits && postPlain25.videoEdits.subtitles.some(function (t) { return t.text === 'Sub de prueba 25'; }));
    check('v1.5.25 videos: guardar subtítulos en un video publicado cuenta como una edición y el contador local se sincroniza con el servidor', (postPlain25.editCount || 0) === editsBefore25 + 1, 'antes=' + editsBefore25 + ' ahora=' + (postPlain25.editCount || 0));
    check('v1.5.25 videos: el editor avisa que los subtítulos se guardaron', $('toast').textContent.indexOf('Subtítulos guardados') >= 0, $('toast').textContent);
    const playerPlain25b = q('#feed .post[data-post="' + vPlain25.post.id + '"] .wrPlayer');
    check('v1.5.25 videos: tras guardar, el video muestra su capa de subtítulos y el CC se enciende', !!playerPlain25b && !!playerPlain25b.querySelector('.vsub') && playerPlain25b.querySelector('.wrCc').classList.contains('on'));
    // CC en video ajeno sin subtítulos: avisa sin inventar ni abrir el editor.
    const barOther25 = vidOther25.closest('.wrPlayer').querySelector('.wrBar');
    click(barOther25.querySelector('.wrCc'));
    check('v1.5.25 videos: el CC en un video ajeno sin subtítulos avisa sin inventar subtítulos ni abrir el editor', $('toast').textContent.indexOf('Este video no tiene subtítulos') >= 0 && !$('videoEditorOverlay').classList.contains('on'), $('toast').textContent);
    // Shorts: barra propia sin tapar el riel y el deslizamiento sigue vivo.
    T25.openShorts(vPlain25.post.id);
    await tick();
    const shortPlayer25 = q('#shortsBody .wrPlayer');
    const shortBar25 = shortPlayer25 ? shortPlayer25.querySelector('.wrBar') : null;
    const shortVid25 = q('#shortsBody video');
    check('v1.5.25 videos: en Shorts se abre mi video con la barra propia', !!shortPlayer25 && !!shortBar25 && !!shortVid25 && (shortVid25.getAttribute('src') || '').indexOf('video-mio25.mp4') >= 0 && !!shortBar25.querySelector('.wrPlay') && !!shortBar25.querySelector('.wrCc'));
    check('v1.5.25 videos: en Shorts el riel (Me gusta/Comentar) sigue ahí y la barra no lo tapa', !!$('shortsLike') && !!$('shortsComment') && window.getComputedStyle(shortBar25).right === '64px', 'right=' + window.getComputedStyle(shortBar25).right);
    const shortCountBefore25 = $('shortsCount').textContent;
    const swEv25 = function (type, y) { var ev = new window.Event(type, { bubbles: true, cancelable: true }); ev.touches = [{ clientY: y }]; ev.changedTouches = [{ clientY: y }]; $('shortsBody').dispatchEvent(ev); };
    swEv25('touchstart', 300);
    swEv25('touchend', 200);
    check('v1.5.25 videos: deslizar en Shorts sigue cambiando de short con la barra puesta', $('shortsCount').textContent !== shortCountBefore25);
    click($('shortsClose'));
    // Visor grande del chat.
    window.__wrOpenChatMedia(encodeURIComponent('https://srv/video-grande25.mp4'), 'video');
    const bigPlayer25 = q('#chatMediaBody .wrPlayer');
    check('v1.5.25 videos: el visor grande del chat usa el reproductor propio (sin controles nativos)', !!bigPlayer25 && !!bigPlayer25.querySelector('video') && !bigPlayer25.querySelector('video').hasAttribute('controls') && !!bigPlayer25.querySelector('.wrBar'));
    click(q('[data-close="chatMediaOverlay"]'));
    // Autoplay del inicio y sincronización de la canción siguen intactos.
    T25.go('feed'); T25.renderFeed();
    await tick();
    check('v1.5.25 videos: el observador de autoplay sigue viendo los videos del inicio', T25.feedVideos().length >= 3, 'videos=' + T25.feedVideos().length);
    const fv25 = q('#feed .post[data-post="' + vSub25.post.id + '"] video');
    check('v1.5.25 videos: la sincronización de la canción sigue en el video (onplay/ontimeupdate)', !!fv25 && (fv25.getAttribute('onplay') || '').indexOf('__wrVideoSongSync') >= 0 && (fv25.getAttribute('ontimeupdate') || '').indexOf('__wrVideoSongSync') >= 0);
    // La pausa manual con la barra no se reanuda sola (el observador la respeta).
    const fvBar25 = fv25.closest('.wrPlayer').querySelector('.wrBar');
    stubVid25(fv25, 120);
    fv25.getBoundingClientRect = function () { return { top: 100, bottom: 500, height: 400, left: 0, right: 360, width: 360 }; };
    T25.observeFeedVideos();
    T25.updateFeedVideos();
    fv25.dispatchEvent(new window.Event('play'));
    check('v1.5.25 videos: el observador reproduce el video visible y la barra lo refleja', fv25._playing && fvBar25.querySelector('.wrPlay').innerHTML.indexOf('rect x="6"') >= 0);
    click(fvBar25.querySelector('.wrPlay'));
    fv25.dispatchEvent(new window.Event('pause'));
    T25.updateFeedVideos();
    check('v1.5.25 videos: pausar a mano con la barra no se reanuda solo', !fv25._playing);
    // Limpieza: borrar las publicaciones de prueba.
    C25.deletePost(st25, me25, vSub25.post.id);
    C25.deletePost(st25, me25, vPlain25.post.id);
    C25.deletePost(st25, '1000000002', vOther25.post.id);
    check('sin errores de ventana al final', errors.length === 0, errors.slice(0, 3).join(' | '));
    // v1.5.26: las 66 ideas (bloque 1.5.26).
    const T26 = window.__wordredTest;
    const C26 = T26.core;
    const st26 = T26.getState();
    const me26 = st26.me;
    const W26 = window.__wr1526;
    const BRUNO26 = '1000000002';
    const CARLA26 = '1000000003';
    const today26 = C26.todayStr();
    const fmtDate26 = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    const yest26 = fmtDate26(new Date(Date.now() - 86400000));
    const tmr26 = fmtDate26(new Date(Date.now() + 86400000));
    const oldBruno26 = st26.profiles[BRUNO26];
    const oldCarla26 = st26.profiles[CARLA26];
    st26.profiles[BRUNO26] = { phone: BRUNO26, name: 'Bruno Prueba', photo: '', bio: 'Amigo de pruebas' };
    st26.profiles[CARLA26] = { phone: CARLA26, name: 'Carla Prueba', photo: '', bio: '' };
    st26.profiles['1000000004'] = st26.profiles['1000000004'] || { phone: '1000000004', name: 'Desconocido Prueba', photo: '', bio: '' };
    st26.friends[me26] = st26.friends[me26] || [];
    if (st26.friends[me26].indexOf(BRUNO26) < 0) st26.friends[me26].push(BRUNO26);
    if (st26.friends[me26].indexOf(CARLA26) < 0) st26.friends[me26].push(CARLA26);
    const myProfile26 = function () { return st26.profiles[me26]; };
    const feedHtml26 = function () { return $('view-feed') ? $('view-feed').innerHTML : ''; };
    const api1526Has = function (frag, method) { return calls.api1526.some(function (c) { return c.u.indexOf(frag) >= 0 && (!method || c.method === method); }); };
    const convoWith26 = function (other) { const c = C26.conversationList(st26, me26).filter(function (x) { return x.other === other; })[0]; return c ? c.conversation.messages : []; };

    check('v1.5.26 estado: los campos nuevos existen y los ajustes traen texto, fondo y ahorro de datos',
      st26.muted && st26.closeFriends && st26.cart && st26.drafts && st26.scheduledPosts && st26.wishlist && st26.pinnedChats && st26.savedLinks && st26.screenTime && st26.wordFilter && st26.quietHours && st26.accounts && st26.postViewed && st26.postStatsCache && st26.settings && st26.settings.textSize === 'normal' && st26.settings.chatBg === '' && st26.settings.dataSaver === false);

    // (22/25/26) Compositor: estado de ánimo, lugar, encuesta con foto, reto, programar.
    W26.renderComposer1526Rows();
    check('v1.5.26 compositor: las filas de estado de ánimo, lugar, reto y programar existen',
      $('composerMoodRow') && $('composerMoodRow').innerHTML.indexOf('¿Cómo te sientes?') >= 0 && $('composerPlaceBox') && $('composerPlaceBox').innerHTML.indexOf('Estoy aquí') >= 0 && $('composerChallengeInput') && $('composerScheduleBox'));
    W26.setComposerMood(C26.validateMood('feliz'));
    check('v1.5.26 compositor: elegir estado de ánimo queda guardado y marcado',
      W26.getComposerMood() && W26.getComposerMood().id === 'feliz' && W26.composer1526Data().mood && W26.composer1526Data().mood.id === 'feliz' && $('composerMoodRow').innerHTML.indexOf('chip on') >= 0);
    W26.setComposerPlace({ name: 'Parque Central', lat: 19.4326, lng: -99.1332 });
    check('v1.5.26 compositor: el lugar elegido se muestra en el compositor',
      W26.getComposerPlace() && W26.getComposerPlace().name === 'Parque Central' && $('composerPlaceBox').innerHTML.indexOf('Parque Central') >= 0);
    W26.setComposerPhotoPoll({ options: [{ mediaUrl: 'https://x.com/a.jpg', label: 'A' }, { mediaUrl: 'https://x.com/b.jpg', label: 'B' }] });
    check('v1.5.26 compositor: la encuesta con foto con 2 fotos queda lista',
      W26.getComposerPhotoPoll() && W26.getComposerPhotoPoll().options.length === 2 && W26.composer1526Data().photoPoll.options.length === 2);
    W26.setComposerChallenge('#RetoBaile');
    check('v1.5.26 compositor: el reto se guarda con #', W26.getComposerChallenge() === '#RetoBaile');
    W26.setComposerScheduleAt(Date.now() + 3600000);
    check('v1.5.26 compositor: programar guarda la fecha y hora', W26.getComposerScheduleAt() > Date.now());
    W26.resetComposer1526();
    check('v1.5.26 compositor: al limpiar, el estado de ánimo, el lugar, la encuesta, el reto y la hora se borran',
      !W26.getComposerMood() && !W26.getComposerPlace() && !W26.getComposerPhotoPoll() && !W26.getComposerChallenge() && !W26.getComposerScheduleAt());

    // (22/8/25/26/18/4) Publicaciones en el inicio.
    const pMood26 = C26.createPost(st26, me26, { text: 'Hoy estoy contento', mood: C26.validateMood('feliz') });
    const pReto26 = C26.createPost(st26, me26, { text: 'Bailando en el parque', challenge: '#RetoBaile' });
    const pPlace26 = C26.createPost(st26, me26, { text: 'Aquí ando', place: { name: 'Parque Central', lat: 19.4326, lng: -99.1332 } });
    const pPoll26 = C26.createPost(st26, me26, { text: '¿Cuál te gusta más?', photoPoll: { options: [{ mediaUrl: 'https://x.com/a.jpg', label: 'A' }, { mediaUrl: 'https://x.com/b.jpg', label: 'B' }] } });
    const pEng26 = C26.createPost(st26, me26, { text: 'Hello world, this is a beautiful day for a walk' });
    const pShort26 = C26.createPost(st26, BRUNO26, { text: 'Short de prueba', media: 'https://x.com/video.mp4', mediaType: 'video' });
    check('v1.5.26 publicaciones: se crean con estado de ánimo, reto, lugar, encuesta, texto en inglés y video',
      pMood26.ok && pReto26.ok && pPlace26.ok && pPoll26.ok && pEng26.ok && pShort26.ok, JSON.stringify([pMood26.ok, pReto26.ok, pPlace26.ok, pPoll26.ok, pEng26.ok, pShort26.ok]));
    T26.go('feed'); T26.renderFeed(); await tick();
    check('v1.5.26 estado de ánimo: la publicación muestra "me siento feliz" bajo el nombre', feedHtml26().indexOf('me siento feliz') >= 0);
    check('v1.5.26 retos: la etiqueta del reto se ve en la publicación', feedHtml26().indexOf('#RetoBaile') >= 0);
    check('v1.5.26 estoy aquí: el lugar se ve con su miniatura de mapa real', feedHtml26().indexOf('Parque Central') >= 0 && feedHtml26().indexOf('staticmap.openstreetmap.de') >= 0);
    check('v1.5.26 encuesta con foto: las dos fotos se ven con su botón de voto', feedHtml26().indexOf('https://x.com/a.jpg') >= 0 && feedHtml26().indexOf('https://x.com/b.jpg') >= 0 && feedHtml26().indexOf('Votar') >= 0);
    check('v1.5.26 traducción: la publicación en inglés muestra el botón Traducir', feedHtml26().indexOf('Traducir') >= 0);
    check('v1.5.26 estadísticas: en tus publicaciones se ven las vistas con su botón Actualizar', feedHtml26().indexOf('0 vistas') >= 0 && feedHtml26().indexOf('Actualizar') >= 0);
    await window.__wrTranslatePost(pEng26.post.id); await tick();
    check('v1.5.26 traducción: al traducir se ve el texto en español con su etiqueta', feedHtml26().indexOf('Hola mundo traducido') >= 0 && feedHtml26().indexOf('Traducido automáticamente') >= 0);
    window.__wrShowOriginal(pEng26.post.id); await tick();
    check('v1.5.26 traducción: Ver original devuelve el texto en inglés', feedHtml26().indexOf('Hello world') >= 0);
    await window.__wrRefreshPostStats(pMood26.post.id); await tick();
    check('v1.5.26 estadísticas: Actualizar trae las vistas reales del servidor (5)', st26.postStatsCache[pMood26.post.id] && st26.postStatsCache[pMood26.post.id].views === 5 && feedHtml26().indexOf('5 vistas') >= 0);
    await W26.recordPostView1526(pShort26.post); await tick();
    check('v1.5.26 estadísticas: ver una publicación registra la vista una sola vez', st26.postViewed[pShort26.post.id] === true && api1526Has('/api/posts/' + pShort26.post.id + '/view', 'POST'));
    const viewsCalls26 = calls.api1526.filter(function (c) { return c.u.indexOf('/view') >= 0; }).length;
    await W26.recordPostView1526(pShort26.post); await tick();
    check('v1.5.26 estadísticas: la segunda vista de la misma publicación no vuelve a registrarse', calls.api1526.filter(function (c) { return c.u.indexOf('/view') >= 0; }).length === viewsCalls26);
    await window.__wrVotePhotoPoll(pPoll26.post.id, 0); await tick();
    check('v1.5.26 encuesta con foto: votar muestra los porcentajes reales (67% / 33%)', (function () { const p = st26.posts.filter(function (x) { return x.id === pPoll26.post.id; })[0]; return p && p.photoPoll && p.photoPoll.votes && p.photoPoll.votes[0] === 2 && p.photoPoll.myVote === 0 && feedHtml26().indexOf('67%') >= 0; })());
    pMood26.post.shares = [{ phone: BRUNO26, name: 'Bruno Prueba', at: Date.now(), repostId: 'p26share' }];
    check('v1.5.26 ver quién compartió: la fila "Compartido por 1 persona" aparece en tu publicación', W26.sharesRowHtml1526(pMood26.post).indexOf('Compartido por 1 persona') >= 0);
    await window.__wrOpenShares(pMood26.post.id); await tick();
    check('v1.5.26 ver quién compartió: al tocar se ve quién la compartió con su repost', $('storyViewsBody').innerHTML.indexOf('Bruno Prueba') >= 0 && $('storyViewsBody').innerHTML.indexOf('Ver repost') >= 0);

    // (61/45/15) Filtros del inicio y modo sin conexión.
    const pFriend26 = C26.createPost(st26, BRUNO26, { text: 'Publicación de mi amigo Bruno' });
    const pStranger26 = C26.createPost(st26, '1000000004', { text: 'Publicación de un desconocido' });
    T26.renderFeed(); await tick();
    check('v1.5.26 inicio solo de amigos: antes del filtro se ven las de amigos y las de desconocidos', feedHtml26().indexOf('Publicación de mi amigo Bruno') >= 0 && feedHtml26().indexOf('Publicación de un desconocido') >= 0);
    W26.toggleFriendsOnlyFeed1526();
    T26.renderFeed(); await tick();
    check('v1.5.26 inicio solo de amigos: con el filtro solo se ven las publicaciones de amigos', feedHtml26().indexOf('Publicación de mi amigo Bruno') >= 0 && feedHtml26().indexOf('Publicación de un desconocido') < 0);
    W26.toggleFriendsOnlyFeed1526();
    st26.wordFilter = ['sol'];
    const pSol26 = C26.createPost(st26, me26, { text: 'Me gusta el sol de la mañana' });
    T26.renderFeed(); await tick();
    check('v1.5.26 filtro de palabras: la publicación con la palabra se oculta del inicio', feedHtml26().indexOf('Me gusta el sol') < 0 && feedHtml26().indexOf('Hoy estoy contento') >= 0);
    st26.offline = true;
    T26.renderFeed(); await tick();
    check('v1.5.26 sin conexión: el inicio avisa que se ve lo último guardado', feedHtml26().indexOf('Sin conexión: estás viendo lo último guardado') >= 0);
    st26.offline = false;
    st26.wordFilter = [];
    T26.renderFeed(); await tick();

    // (2/4/60/33/30/36) Perfil propio: recuerdos, estadísticas, semana, canción, nota, portada.
    const lastYear26 = new Date(); lastYear26.setFullYear(lastYear26.getFullYear() - 1);
    const pMem26 = C26.createPost(st26, me26, { text: 'Recuerdo de hace un año' });
    pMem26.post.createdAt = lastYear26.getTime();
    check('v1.5.26 recuerdos: la publicación de hace un año hoy aparece como recuerdo', W26.memoriesProfileHtml1526().indexOf('Hace 1 año') >= 0 && W26.memoriesProfileHtml1526().indexOf('Recuerdo de hace un año') >= 0);
    check('v1.5.26 recuerdos: la tarjeta de recuerdos aparece en el inicio', W26.memoriesFeedCardHtml1526().indexOf('Recuerdos') >= 0);
    st26.postStatsCache[pMood26.post.id] = { views: 5, likes: 2, comments: 1, shares: 0, at: Date.now() };
    check('v1.5.26 estadísticas: la tarjeta del perfil muestra las vistas totales', W26.creatorStatsHtml1526().indexOf('Estadísticas') >= 0 && W26.creatorStatsHtml1526().indexOf('5') >= 0);
    check('v1.5.26 semana: la tarjeta semanal muestra tus números de los últimos 7 días', W26.weekCardHtml1526().indexOf('Tu semana') >= 0);
    check('v1.5.27 semana: sin "Con más Me gusta" ni "Con más vistas", con sus 4 conteos', W26.weekCardHtml1526().indexOf('Con más Me gusta') < 0 && W26.weekCardHtml1526().indexOf('Con más vistas') < 0 && W26.weekCardHtml1526().indexOf('publicaciones') >= 0 && W26.weekCardHtml1526().indexOf('Me gusta recibidos') >= 0 && W26.weekCardHtml1526().indexOf('comentarios recibidos') >= 0 && W26.weekCardHtml1526().indexOf('amigos nuevos') >= 0);
    myProfile26().songOfTheDay = { song: { title: 'Cumbia de prueba', artist: 'Los Prueba', url: 'https://x.com/cancion.mp3' }, date: today26 };
    check('v1.5.27 canción del día: la tarjeta ya no existe en el perfil propio aunque haya canción de hoy', typeof W26.songOfDayHtml1526 === 'undefined' && !window.__wrPickSongOfDay && !window.__wrClearSongOfDay && !window.__wrPlaySongOfDay);
    myProfile26().note = 'Mi nota de prueba';
    check('v1.5.30 nota: la nota se pone al escribir la biografía (el editor incluye el campo con la nota actual, máx. 60)', (function () { window.__wrEditProfile(); var ok = !!$('profileNoteInput') && $('profileNoteInput').value === 'Mi nota de prueba' && $('profileNoteInput').getAttribute('maxlength') === '60'; click(window.document.querySelector('[data-close="editProfileOverlay"]')); return ok; })());
    myProfile26().pinnedPosts = [pMood26.post.id];
    myProfile26().pinnedCover = 'https://x.com/portada.jpg';
    check('v1.5.26 portada de Destacadas: la portada elegida se muestra sobre las destacadas', W26.pinnedCoverHtml1526().indexOf('https://x.com/portada.jpg') >= 0);
    T26.go('profile'); await tick();
    const ownHtml26 = $('ownProfile') ? $('ownProfile').innerHTML : '';
    check('v1.5.26 perfil propio: recuerdos y atajos se ven en el perfil (1.5.39: "Tu tiempo hoy" ya no va arriba, va justo antes de la tienda de juegos)',
      ownHtml26.indexOf('Recuerdos') >= 0 && ownHtml26.indexOf('Tu tiempo hoy') < 0 && $('ownScreenTime1539').innerHTML.indexOf('Tu tiempo hoy') >= 0 && ownHtml26.indexOf('Shorts guardados') >= 0 && ownHtml26.indexOf('Programadas') >= 0 && ownHtml26.indexOf('Borradores') >= 0 && ownHtml26.indexOf('Enlaces guardados') >= 0 && ownHtml26.indexOf('Tu nota') < 0);
    check('v1.5.28 perfil propio: sin la tarjeta de Estadísticas ni la de Tu semana (los datos siguen por dentro)',
      ownHtml26.indexOf('Estadísticas') < 0 && ownHtml26.indexOf('Tu semana') < 0);
    check('v1.5.27 perfil propio: sin tarjeta de Canción del día y sin "Con más..." en la semana, aunque la canción siga guardada', ownHtml26.indexOf('Canción del día') < 0 && ownHtml26.indexOf('Cumbia de prueba') < 0 && ownHtml26.indexOf('Con más Me gusta') < 0 && ownHtml26.indexOf('Con más vistas') < 0);
    // 1.5.54: la tira de arriba del Inicio ya no son historias, son los reels (rectángulos desde la 1.5.60).
    C26.createPost(st26, me26, { text: 'Reel de prueba 1.5.27', media: 'demo-video-27.mp4', mediaType: 'video' });
    T26.renderFeed(); await tick();
    var storyCards27 = qa('#storiesRow .homeReel1549');
    var storyBr27 = storyCards27.map(function (el) { var c = el.querySelector('.homeReelRect1560'); return c ? window.getComputedStyle(c).borderRadius : ''; });
    check('1.5.60 reels: todos los reels de la tira son rectángulos con esquinas redondeadas (18 px)', storyCards27.length >= 1 && storyBr27.every(function (r) { return r === '18px'; }), 'reels=' + storyCards27.length + ' radios=' + storyBr27.join(','));
    check('1.5.54 reels: "Agregar reel" (+) se queda primero en la tira', storyCards27.length >= 1 && storyCards27[0].classList.contains('homeReelMe1549') && storyCards27[0].textContent.indexOf('Agregar reel') >= 0 && !!storyCards27[0].querySelector('.homeReelAdd1549'));
    check('1.5.60 reels: mismo tamaño 150 px que la fila de reels del Inicio (1.5.60: rectángulos, más grandes que los círculos de 112 px de la 1.5.59)', storyCards27.length >= 1 && (function () { var cs = window.getComputedStyle(storyCards27[0]); return cs.width === '150px'; })());
    check('1.5.60 reels: el rectángulo del reel es 140×190 con esquinas redondeadas', storyCards27.filter(function (el) { return el.querySelector('.homeReelRect1560'); }).every(function (el) { var c = window.getComputedStyle(el.querySelector('.homeReelRect1560')); return c.borderRadius === '18px' && c.width === '140px' && c.height === '190px'; }));
    check('v1.5.27 historias: los Reels no se tocan (su propio marco 264×400)', qa('#feed .reelTile').length >= 1 && (function () { var cs = window.getComputedStyle(qa('#feed .reelTile')[0]); return cs.flexBasis === '264px' && cs.height === '400px'; })());
    var storyWithAuthor27 = storyCards27.filter(function (el) { return (el.getAttribute('onclick') || '').indexOf('__wrOpenReel(') >= 0; });
    if (storyWithAuthor27.length) { storyWithAuthor27[0].click(); await tick(); }
    check('1.5.54 reels: al tocar un reel se abre en el visor de Shorts', storyWithAuthor27.length >= 1 && $('shortsOverlay') && $('shortsOverlay').classList.contains('on'));
    if ($('shortsOverlay') && $('shortsOverlay').classList.contains('on') && $('shortsClose')) click($('shortsClose'));

    // ---- 1.5.28: panel de vista previa al subir foto o video. ----
    // (1) Al escoger un video se abre el panel (no solo el compositor).
    click($('composerOpen'));
    var vidFile1528 = new window.File([new Uint8Array(100 * 1024)], 'video-1528.mp4', { type: 'video/mp4' });
    var mediaInput1528 = $('postMediaInput');
    Object.defineProperty(mediaInput1528, 'files', { value: [vidFile1528], configurable: true });
    mediaInput1528.dispatchEvent(new window.Event('change', { bubbles: true }));
    var panelOpened1528 = await waitFor(function () { return $('uploadPanel1528').classList.contains('on'); }, 15000);
    check('v1.5.28 panel: al escoger un video se abre el panel de vista previa', panelOpened1528);
    check('v1.5.28 panel: al abrirse el panel el compositor queda detrás (la hoja se muda, no se duplica)', panelOpened1528 && !$('composerOverlay').classList.contains('on') && !!$('uploadPanel1528').querySelector('#postText') && !$('composerOverlay').querySelector('#postText'));
    // (2) Recuadro rectangular grande + fondo traslúcido.
    check('v1.5.28 panel: el recuadro es rectangular (esquinas cuadradas)', (function () { var cs = window.getComputedStyle(q('#uploadPanel1528 .uploadPanel1528')); return cs.borderRadius === '0px' || cs.borderRadius === '0'; })());
    check('v1.5.28 panel: el fondo es traslúcido (se ve la app detrás)', (function () { var bg = window.getComputedStyle($('uploadPanel1528')).backgroundColor || ''; var m = bg.match(/rgba\(([^)]+)\)/); if (m) { var a = parseFloat(m[1].split(',')[3]); return a > 0 && a < 1; } return /#uploadPanel1528\{background:rgba\(5,1,2,\.55\)/.test(document.querySelector('style').textContent); })());
    // (3) La previa del video usa el reproductor propio de la app.
    check('v1.5.28 panel: la previa del video usa el reproductor propio (barra con sus botones)', !!q('#uploadPanel1528 .wrPlayer') && !!q('#uploadPanel1528 .wrPlayer .wrBar') && !!q('#uploadPanel1528 .wrPlayer .wrPlay') && !!q('#uploadPanel1528 .wrPlayer .wrMute') && !!q('#uploadPanel1528 .wrPlayer .wrCc') && !!q('#uploadPanel1528 .wrPlayer .wrFull'));
    check('v1.5.28 panel: la previa del video es rectangular', (function () { var cs = window.getComputedStyle(q('#uploadPanel1528 .wrPlayer')); return cs.borderRadius === '0px' || cs.borderRadius === '0'; })());
    // (4) Todas las configuraciones están dentro del mismo panel.
    check('v1.5.28 panel: todas las configuraciones están en el mismo panel', ['postText', 'postSongRow', 'postPrivacy', 'postLocation', 'postTagInput', 'postBgRow', 'composerMoodRow', 'composerPlaceBox', 'composerPhotoPollBox', 'composerChallengeInput', 'composerScheduleBox', 'postPollBox', 'postLinkRow', 'postAudioRow', 'composerSaveDraftBtn'].every(function (id) { return !!$('uploadPanel1528').querySelector('#' + id); }));
    check('v1.5.28 panel: los botones son del diseño de la app (Publicar rojo, X redonda)', $('uploadPanelPublish1528') && $('uploadPanelPublish1528').classList.contains('btn') && $('uploadPanelPublish1528').textContent === 'Publicar' && $('uploadPanelClose1528').classList.contains('xbtn'));
    // (5) La X vuelve al compositor sin perder nada.
    click($('uploadPanelClose1528'));
    check('v1.5.28 panel: la X vuelve al compositor con la hoja de vuelta y el video intacto', $('composerOverlay').classList.contains('on') && !$('uploadPanel1528').classList.contains('on') && !!$('composerOverlay').querySelector('#postText') && !!$('postMediaPrev').querySelector('video'));
    // (6) Publicar desde el panel funciona y cierra el panel con la hoja de vuelta.
    W26.openUploadPanel1528();
    check('v1.5.28 panel: el panel se puede volver a abrir con el video', $('uploadPanel1528').classList.contains('on'));
    setVal($('postText'), 'Video desde el panel 1.5.28');
    click($('uploadPanelPublish1528'));
    /* 1.5.34: 30 s (antes 15 s): en jsdom cada carátula de video cuesta
       los 8 s del timeout (el video nunca carga) y la cola es de 3; el
       video de ejemplo, sin carátula guardada, vuelve a encolar la suya
       en cada dibujado del inicio, así que la carátula de este video
       puede esperar su turno y el post tarda más de 15 s en crearse.
       En el teléfono real los videos cargan al instante y no pasa. */
    var postPanel1528 = await waitFor(function () { return T26.getState().posts.filter(function (x) { return x.text === 'Video desde el panel 1.5.28'; })[0]; }, 30000);
    check('v1.5.28 panel: publicar desde el panel crea la publicación', !!postPanel1528);
    check('v1.5.28 panel: al publicar el panel se cierra y la hoja vuelve al compositor', !$('uploadPanel1528').classList.contains('on') && !$('composerOverlay').classList.contains('on') && !!$('composerOverlay').querySelector('#postText'));
    // (7) Previa de imagen grande y rectangular (en jsdom la foto no se
    // lee con Image, así que se pone por la vía que usan las pruebas).
    click($('composerOpen'));
    T26.setComposerMediaList([{ src: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', type: 'image' }]);
    W26.openUploadPanel1528();
    check('v1.5.28 panel: la previa de imagen es grande y rectangular', !!q('#uploadPanel1528 .medialist img') && (function () { var cs = window.getComputedStyle(q('#uploadPanel1528 .medialist img')); return cs.borderRadius === '0px' || cs.borderRadius === '0'; })());
    // (8) Quitar el último archivo cierra el panel y vuelve al compositor.
    window.__wrRemoveComposerMedia(0);
    check('v1.5.28 panel: al quitar el último archivo el panel vuelve al compositor', !$('uploadPanel1528').classList.contains('on') && $('composerOverlay').classList.contains('on'));
    click(q('[data-close="composerOverlay"]'));
    // (9) El FAQ describe la vista previa grande y sigue con 23 entradas.
    check('v1.5.28 panel: el FAQ describe la vista previa grande al subir', T26.getFaq().filter(function (f) { return f.q === '¿Cómo publico algo?'; })[0].a.indexOf('vista previa grande') >= 0);
    check('v1.5.28 panel: el FAQ tiene 29 entradas (23 + 1 en la 1.5.33 por el tutorial, +1 en la 1.5.36 por el menú, +3 en la 1.5.42 por la cartelera, los Reels y «Tu tiempo hoy», +1 en la 1.5.54 por los dramas originales y Fantore; en la 1.5.55 la entrada de la 1.5.53 se cambió por la de la 1.5.55; en la 1.5.56 la entrada de la 1.5.54 se cambió por la de la 1.5.56; en la 1.5.59 la entrada de la 1.5.57 se cambió por la de la 1.5.59 y la de la 1.5.58 se acortó; en la 1.5.61 la entrada de la 1.5.59 se quitó, se añadió la de la 1.5.61 y la de la 1.5.60 se acortó)', T26.getFaq().length === 29);
    // v1.5.28: del inicio se va "Sala de audio"; las salas siguen (desde Transmitir en vivo).
    T26.setLiveList([]);
    check('v1.5.28 inicio: sin lives no hay entrada de Salas de audio en el inicio', $('liveRow').innerHTML.indexOf('Salas de audio') < 0 && $('liveRow').classList.contains('hidden'));
    T26.setLiveList([{ id: 'live1', host: BRUNO26 }]);
    check('v1.5.28 inicio: con un live en curso tampoco aparece Salas de audio', $('liveRow').innerHTML.indexOf('Salas de audio') < 0 && $('liveRow').innerHTML.indexOf('EN VIVO') >= 0);
    T26.setLiveList([]);
    check('v1.5.28 salas: la entrada nueva está en Transmitir en vivo', !!q('#liveAudioRoomsBtn'));
    window.__wrOpenAudioRooms(); await tick();
    check('v1.5.28 salas: las salas de audio se siguen abriendo (desde Transmitir en vivo)', $('audioRoomsOverlay').classList.contains('on'));
    click(q('#audioRoomsOverlay [data-close]')); await tick();
    // v1.5.28: el inicio no se mueve si estás en otro apartado.
    T26.go('feed'); T26.renderFeed(); await tick();
    T26.go('profile'); await tick();
    var savedPost28 = st26.lastFeedPostId;
    var seen28 = [];
    var origSiv28 = window.Element.prototype.scrollIntoView;
    window.Element.prototype.scrollIntoView = function () { seen28.push(this.getAttribute('data-post')); };
    // (a) Fuera del inicio: redibujar no desplaza nada y el sitio guardado se mantiene.
    T26.renderFeed(); await tick();
    check('v1.5.28 inicio quieto: en otro apartado, redibujar no desplaza la vista', seen28.length === 0 && st26.lastFeedPostId === savedPost28);
    // (b) Una publicación nueva mientras estás fuera tampoco mueve nada; al volver, quedas donde estabas.
    var newPost28 = C26.createPost(st26, BRUNO26, { text: 'Publicación nueva mientras estabas fuera' });
    T26.renderFeed(); await tick();
    check('v1.5.28 inicio quieto: una publicación nueva fuera no desplaza la vista', seen28.length === 0 && !!(newPost28 && newPost28.ok));
    T26.go('feed'); await new Promise(function (r) { setTimeout(r, 450); });
    check('v1.5.28 inicio quieto: al volver, el inicio vuelve al mismo sitio aunque haya publicaciones nuevas arriba', seen28.length === 1 && seen28[0] === savedPost28, 'vistos=' + seen28.join(',') + ' guardado=' + savedPost28);
    // (c) Y la segunda vez también: salir y volver de nuevo restaura otra vez.
    T26.go('profile'); await tick();
    var savedPost28b = st26.lastFeedPostId;
    T26.go('feed'); await new Promise(function (r) { setTimeout(r, 450); });
    window.Element.prototype.scrollIntoView = origSiv28;
    check('v1.5.28 inicio quieto: salir y volver por segunda vez también restaura la posición', seen28.length === 2 && seen28[1] === savedPost28b, 'vistos=' + seen28.join(',') + ' guardado2=' + savedPost28b);
    // v1.5.28: "Solo amigos" pasa del inicio a los Ajustes (un solo control).
    T26.go('feed'); T26.renderFeed(); await tick();
    check('v1.5.28 solo amigos: el interruptor ya no está en el inicio', feedHtml26().indexOf('Solo amigos:') < 0);
    window.__wrOpenSettings(); await tick();
    var soloBox28 = $('settings1526') ? $('settings1526').innerHTML : '';
    check('v1.5.28 solo amigos: la opción está en Ajustes, con su sí/no', soloBox28.indexOf('Solo amigos') >= 0 && !!q('#friendsOnlyToggle'));
    var fo28 = q('#friendsOnlyToggle');
    fo28.checked = true; fo28.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
    T26.renderFeed(); await tick();
    check('v1.5.28 solo amigos: en Ajustes en Sí, el inicio solo muestra amigos', st26.friendsOnlyFeed === true && feedHtml26().indexOf('Publicación de mi amigo Bruno') >= 0 && feedHtml26().indexOf('Publicación de un desconocido') < 0);
    fo28.checked = false; fo28.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
    T26.renderFeed(); await tick();
    check('v1.5.28 solo amigos: en Ajustes en No, el inicio vuelve a mostrar todas', st26.friendsOnlyFeed === false && feedHtml26().indexOf('Publicación de un desconocido') >= 0);
    click(q('#settingsOverlay [data-close]')); await tick();
    // v1.5.28: reacomodo a distintas proporciones (el jsdom está a 1024 px de ancho).
    check('v1.5.28 responsive: a 1024 px el inicio y el panel se ensanchan a 880 px', window.getComputedStyle(q('main')).maxWidth === '880px' && window.getComputedStyle(q('.uploadPanel1528')).maxWidth === '880px', 'main=' + window.getComputedStyle(q('main')).maxWidth + ' panel=' + window.getComputedStyle(q('.uploadPanel1528')).maxWidth);
    // v1.5.28: ampliar con pellizco (PointerEvents sintéticos; el jsdom los soporta).
    var pev28 = function (type, el, id, x, y) { el.dispatchEvent(new window.PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true })); };
    var pic28 = C26.createPost(st26, me26, { text: 'Foto para ampliar', mediaList: [{ src: 'https://x.com/foto-zoom.jpg', type: 'image' }] });
    T26.renderFeed(); await tick();
    var img28 = q('#feed article[data-post="' + pic28.post.id + '"] img.wrZoomable');
    check('v1.5.28 zoom: las fotos del inicio se pueden ampliar', !!img28);
    pev28('pointerdown', img28, 1, 150, 150); pev28('pointerup', img28, 1, 150, 150);
    check('v1.5.28 zoom: un solo toque no amplía', img28.style.transform === '');
    pev28('pointerdown', img28, 1, 100, 100); pev28('pointerdown', img28, 2, 200, 100);
    pev28('pointermove', img28, 1, 50, 100); pev28('pointermove', img28, 2, 250, 100);
    check('v1.5.28 zoom: el pellizco amplía la foto a 2x', img28.style.transform.indexOf('scale(2)') >= 0, img28.style.transform);
    pev28('pointerup', img28, 1, 50, 100); pev28('pointerup', img28, 2, 250, 100);
    pev28('pointerdown', img28, 1, 150, 150); pev28('pointermove', img28, 1, 170, 160); pev28('pointerup', img28, 1, 170, 160);
    check('v1.5.28 zoom: con la foto ampliada, un dedo la desplaza', img28.style.transform.indexOf('translate(20px, 10px)') >= 0, img28.style.transform);
    pev28('pointerdown', img28, 1, 150, 150); pev28('pointerup', img28, 1, 150, 150);
    pev28('pointerdown', img28, 1, 150, 150); pev28('pointerup', img28, 1, 150, 150);
    check('v1.5.28 zoom: el doble toque vuelve la foto a 1x', img28.style.transform.indexOf('scale(1)') >= 0, img28.style.transform);
    var vid28 = C26.createPost(st26, me26, { text: 'Video para ampliar', mediaList: [{ src: 'https://x.com/video-zoom.mp4', type: 'video' }] });
    T26.renderFeed(); await tick();
    var player28 = q('#feed article[data-post="' + vid28.post.id + '"] .wrPlayer');
    check('v1.5.28 zoom: el video del inicio usa el reproductor con zoom', !!player28);
    var play28 = player28.querySelector('.wrPlay');
    pev28('pointerdown', play28, 1, 100, 100); pev28('pointerdown', play28, 2, 200, 100);
    pev28('pointermove', play28, 1, 50, 100); pev28('pointermove', play28, 2, 250, 100);
    pev28('pointerup', play28, 1, 50, 100); pev28('pointerup', play28, 2, 250, 100);
    check('v1.5.28 zoom: tocar los botones del reproductor no empieza un pellizco', !player28._wrZoom && player28.style.transform === '');
    pev28('pointerdown', player28, 1, 100, 100); pev28('pointerdown', player28, 2, 200, 100);
    pev28('pointermove', player28, 1, 50, 100); pev28('pointermove', player28, 2, 250, 100);
    check('v1.5.28 zoom: el pellizco amplía el cuadro del video (no solo los controles)', player28.style.transform.indexOf('scale(2)') >= 0, player28.style.transform);
    pev28('pointerup', player28, 1, 50, 100); pev28('pointerup', player28, 2, 250, 100);
    var sZoom28 = C26.createStory(st26, BRUNO26, { media: 'https://x.com/historia-zoom.jpg', mediaType: 'image' });
    window.__wrOpenStory(sZoom28.story.id); await tick();
    var sImg28 = q('#shortsBody img.wrZoomable');
    check('v1.5.28 zoom: la historia se puede ampliar', !!sImg28);
    pev28('pointerdown', sImg28, 1, 100, 100); pev28('pointerdown', sImg28, 2, 200, 100);
    pev28('pointermove', sImg28, 1, 50, 100); pev28('pointermove', sImg28, 2, 250, 100);
    pev28('pointerup', sImg28, 1, 50, 100); pev28('pointerup', sImg28, 2, 250, 100);
    check('v1.5.28 zoom: el pellizco amplía la historia', sImg28.style.transform.indexOf('scale(2)') >= 0, sImg28.style.transform);
    var countBefore28 = $('shortsCount') ? $('shortsCount').textContent : '';
    var ts28 = new window.Event('touchstart', { bubbles: true }); ts28.touches = [{ clientY: 300 }];
    var te28 = new window.Event('touchend', { bubbles: true }); te28.changedTouches = [{ clientY: 100 }];
    $('shortsBody').dispatchEvent(ts28); $('shortsBody').dispatchEvent(te28); await tick();
    check('v1.5.28 zoom: justo después de un pellizco, el deslizamiento no cambia de historia', ($('shortsCount') ? $('shortsCount').textContent : '') === countBefore28, 'antes=' + countBefore28 + ' ahora=' + ($('shortsCount') ? $('shortsCount').textContent : ''));
    await new Promise(function (r) { setTimeout(r, 600); });
    var ts28b = new window.Event('touchstart', { bubbles: true }); ts28b.touches = [{ clientY: 300 }];
    var te28b = new window.Event('touchend', { bubbles: true }); te28b.changedTouches = [{ clientY: 100 }];
    $('shortsBody').dispatchEvent(ts28b); $('shortsBody').dispatchEvent(te28b); await tick();
    check('v1.5.28 zoom: sin pellizco de por medio, el deslizamiento sí cambia de historia', ($('shortsCount') ? $('shortsCount').textContent : '') !== countBefore28, 'antes=' + countBefore28 + ' ahora=' + ($('shortsCount') ? $('shortsCount').textContent : ''));
    click($('shortsClose')); await tick();
    window.__wrOpenChatMedia(encodeURIComponent('https://x.com/foto-chat.jpg'), 'image'); await tick();
    var chatImg28 = q('#chatMediaBody img.wrZoomable');
    check('v1.5.28 zoom: la foto del chat se puede ampliar', !!chatImg28);
    pev28('pointerdown', chatImg28, 1, 100, 100); pev28('pointerdown', chatImg28, 2, 200, 100);
    pev28('pointermove', chatImg28, 1, 50, 100); pev28('pointermove', chatImg28, 2, 250, 100);
    check('v1.5.28 zoom: el pellizco amplía la foto del chat', chatImg28.style.transform.indexOf('scale(2)') >= 0, chatImg28.style.transform);
    pev28('pointerup', chatImg28, 1, 50, 100); pev28('pointerup', chatImg28, 2, 250, 100);
    click(q('#chatMediaOverlay [data-close]')); await tick();
    // ---- 1.5.29: subida en segundo plano al publicar. ----
    var tokenOrig29 = st26.settings.serverToken;
    var fetchOrig29 = window.fetch;
    var bigImg29 = 'data:image/jpeg;base64,' + 'A'.repeat(2500 * 1024); /* 1.5.30: con los trozos de 1 MB hacen falta ~2,5 MB para ver el progreso a mitad de la subida. */
    var delayFetch29 = function (ms) {
      var real = window.fetch;
      window.fetch = async function (url, opts) {
        if (String(url).indexOf('/api/media/chunk') >= 0) await new Promise(function (r) { setTimeout(r, ms); });
        return real(url, opts);
      };
    };
    // (a) Con servidor: al publicar, la app vuelve a donde estaba y la subida sigue sola.
    st26.settings.serverToken = 'tok-dom-1529';
    calls.uploadNotifs = [];
    T26.go('feed'); T26.renderFeed(); await tick();
    $('composerOpen').click(); await tick();
    $('postText').value = 'Foto en segundo plano 1.5.29';
    T26.setComposerMediaList([{ src: bigImg29, type: 'image' }]);
    W26.openUploadPanel1528(); await tick();
    delayFetch29(200);
    click($('postPublish')); await tick();
    check('v1.5.29 fondo: al publicar, el compositor y el panel se cierran enseguida', !$('composerOverlay').classList.contains('on') && !$('uploadPanel1528').classList.contains('on'));
    check('v1.5.29 fondo: al publicar, te quedas en la vista donde estabas (inicio)', $('view-feed').classList.contains('on'));
    check('v1.5.29 fondo: la publicación todavía NO existe mientras sube', !st26.posts.filter(function (x) { return x.text === 'Foto en segundo plano 1.5.29'; })[0]);
    check('v1.5.29 fondo: la barra de arriba se ve con el progreso', !$('mediaUploadBar').classList.contains('hidden'));
    await new Promise(function (r) { setTimeout(r, 250); });
    check('v1.5.29 fondo: a media subida el progreso ya avanzó (progreso real, no inventado)', $('mediaUploadPct').textContent !== '0%' && $('mediaUploadPct').textContent !== '100%', $('mediaUploadPct').textContent);
    // navegar mientras sube: cambiar de apartado no rompe nada.
    T26.go('profile'); await tick();
    T26.go('feed'); await tick();
    var bgDone29 = await waitFor(function () { return st26.posts.filter(function (x) { return x.text === 'Foto en segundo plano 1.5.29'; })[0]; }, 15000);
    var postBg29 = st26.posts.filter(function (x) { return x.text === 'Foto en segundo plano 1.5.29'; })[0];
    check('v1.5.29 fondo: la publicación aparece cuando la subida termina (también navegando)', !!bgDone29 && !!postBg29);
    check('v1.5.29 fondo: la foto quedó con su URL del servidor (no local)', !!postBg29 && /^https:\/\/wordred-server\.onrender\.com\/media\//.test(postBg29.media || ''));
    check('v1.5.29 fondo: al terminar, la barra se esconde', $('mediaUploadBar').classList.contains('hidden'));
    check('v1.5.29 fondo: el celular recibió el aviso de progreso y el de terminada', calls.uploadNotifs.some(function (n) { return n.op === 'progress'; }) && calls.uploadNotifs.some(function (n) { return n.op === 'done'; }), JSON.stringify(calls.uploadNotifs));
    window.fetch = fetchOrig29;
    // (b) Si la subida falla: no se publica nada falso, se puede reintentar.
    calls.uploadNotifs = [];
    window.fetch = async function (url, opts) {
      if (String(url).indexOf('/api/media/chunk') >= 0) return { ok: false, status: 500, json: async function () { return { ok: false, error: 'Error del servidor.' }; } };
      return fetchOrig29(url, opts);
    };
    T26.go('feed'); await tick();
    $('composerOpen').click(); await tick();
    $('postText').value = 'Foto que falla 1.5.29';
    T26.setComposerMediaList([{ src: 'data:image/jpeg;base64,' + 'B'.repeat(300 * 1024), type: 'image' }]);
    W26.openUploadPanel1528(); await tick();
    click($('postPublish')); await tick();
    var failed29 = await waitFor(function () { var a = W26.getBgUploadActive1529(); return a && a.status === 'failed'; }, 15000);
    check('v1.5.29 fallo: si la subida falla, el trabajo queda en fallido', !!failed29);
    check('v1.5.29 fallo: la publicación NO se crea', !st26.posts.filter(function (x) { return x.text === 'Foto que falla 1.5.29'; })[0]);
    check('v1.5.29 fallo: la barra muestra el error con Reintentar', !$('mediaUploadBar').classList.contains('hidden') && !$('mediaUploadRetry1529').classList.contains('hidden') && $('mediaUploadLabel').textContent.indexOf('No se pudo subir') >= 0);
    check('v1.5.29 fallo: el celular recibió el aviso de error', calls.uploadNotifs.some(function (n) { return n.op === 'error'; }));
    window.fetch = fetchOrig29;
    click($('mediaUploadRetry1529')); await tick();
    var retryDone29 = await waitFor(function () { return st26.posts.filter(function (x) { return x.text === 'Foto que falla 1.5.29'; })[0]; }, 15000);
    var postRetry29 = st26.posts.filter(function (x) { return x.text === 'Foto que falla 1.5.29'; })[0];
    check('v1.5.29 fallo: al reintentar, la publicación se crea', !!retryDone29 && !!postRetry29);
    check('v1.5.29 fallo: al reintentar, la barra se esconde', $('mediaUploadBar').classList.contains('hidden'));
    // (c) Dos publicaciones a la vez: la segunda espera su turno, sin duplicados.
    calls.uploadNotifs = [];
    delayFetch29(150);
    T26.go('feed'); await tick();
    $('composerOpen').click(); await tick();
    $('postText').value = 'Primera en cola 1.5.29';
    T26.setComposerMediaList([{ src: 'data:image/jpeg;base64,' + 'C'.repeat(300 * 1024), type: 'image' }]);
    W26.openUploadPanel1528(); await tick();
    click($('postPublish')); await tick();
    $('composerOpen').click(); await tick();
    $('postText').value = 'Segunda en cola 1.5.29';
    T26.setComposerMediaList([{ src: 'data:image/jpeg;base64,' + 'D'.repeat(300 * 1024), type: 'image' }]);
    W26.openUploadPanel1528(); await tick();
    click($('postPublish')); await tick();
    check('v1.5.29 cola: la segunda publicación espera su turno (una en curso, una en cola)', !!W26.getBgUploadActive1529() && W26.getBgUploadJobs1529().length === 1);
    var both29 = await waitFor(function () { return st26.posts.filter(function (x) { return x.text === 'Primera en cola 1.5.29'; })[0] && st26.posts.filter(function (x) { return x.text === 'Segunda en cola 1.5.29'; })[0]; }, 20000);
    check('v1.5.29 cola: las dos publicaciones se crean, sin duplicados', !!both29 && st26.posts.filter(function (x) { return x.text === 'Primera en cola 1.5.29'; }).length === 1 && st26.posts.filter(function (x) { return x.text === 'Segunda en cola 1.5.29'; }).length === 1);
    window.fetch = fetchOrig29;
    // (d) Sin token del servidor: la publicación se crea en el teléfono como siempre.
    st26.settings.serverToken = '';
    calls.uploadNotifs = [];
    T26.go('feed'); await tick();
    $('composerOpen').click(); await tick();
    $('postText').value = 'Publicación local 1.5.29';
    T26.setComposerMediaList([{ src: 'data:image/jpeg;base64,' + 'E'.repeat(100 * 1024), type: 'image' }]);
    W26.openUploadPanel1528(); await tick();
    click($('postPublish')); await tick();
    var local29 = st26.posts.filter(function (x) { return x.text === 'Publicación local 1.5.29'; })[0];
    check('v1.5.29 sin servidor: sin token, la publicación se crea en el teléfono como siempre', !!local29);
    check('v1.5.29 sin servidor: sin token, no hay trabajo en segundo plano ni barra', !W26.getBgUploadActive1529() && $('mediaUploadBar').classList.contains('hidden'));
    check('v1.5.29 sin servidor: sin token, no hay aviso en el celular', calls.uploadNotifs.length === 0);
    // (e) FAQ.
    check('v1.5.29 FAQ: ¿Cómo publico algo? describe la subida en segundo plano', T26.getFaq().filter(function (f) { return f.q === '¿Cómo publico algo?'; })[0].a.indexOf('segundo plano') >= 0);
    check('v1.5.29 FAQ: tiene 29 entradas (23 + 1 en la 1.5.33 por el tutorial, +1 en la 1.5.36 por el menú, +3 en la 1.5.42 por la cartelera, los Reels y «Tu tiempo hoy», +1 en la 1.5.54 por los dramas originales y Fantore; en la 1.5.55 la entrada de la 1.5.53 se cambió por la de la 1.5.55; en la 1.5.56 la entrada de la 1.5.54 se cambió por la de la 1.5.56; en la 1.5.59 la entrada de la 1.5.57 se cambió por la de la 1.5.59 y la de la 1.5.58 se acortó; en la 1.5.60 la entrada de la 1.5.58 se quitó, se añadió la de la 1.5.60 y la de la 1.5.59 se acortó)', T26.getFaq().length === 29);
    st26.settings.serverToken = tokenOrig29;
    window.fetch = fetchOrig29;
    // ---- 1.5.30: previa instantánea, subida con compresión, botones del perfil arriba, barra sin encimarse y Windows. ----
    // (a) Previa instantánea: al elegir el video, la previa sale al instante desde el archivo local.
    var OrigCreateObjectURL30 = window.URL.createObjectURL;
    var OrigRevokeObjectURL30 = window.URL.revokeObjectURL;
    window.URL.createObjectURL = function (f) { return 'blob:wordred-test/' + (f && f.name ? f.name : 'archivo'); };
    window.URL.revokeObjectURL = function () {};
    var videoFile30 = new window.File([new Uint8Array(100 * 1024)], 'video-1530.mp4', { type: 'video/mp4' });
    T26.go('feed'); await tick();
    $('composerOpen').click(); await tick();
    $('postText').value = 'Video con previa instantánea 1.5.30';
    W26.handleComposerMediaFiles([videoFile30]);
    check('v1.5.30 previa: al elegir el video, la previa aparece AL INSTANTE (blob local, sin esperar)', W26.composerMediaPending1530() === 1 && $('uploadPanel1528').classList.contains('on') && $('uploadPanel1528').innerHTML.indexOf('blob:wordred-test/video-1530.mp4') >= 0, $('uploadPanel1528').innerHTML.slice(0, 200));
    check('v1.5.30 previa: la previa instantánea es un video de verdad (no una imagen rota)', !!$('uploadPanel1528').querySelector('video[src^="blob:"]'));
    var previewDone30 = await waitFor(function () { return W26.composerMediaPending1530() === 0; }, 10000);
    check('v1.5.30 previa: al terminar el proceso, la previa provisional se cambia por el archivo subido al teléfono', !!previewDone30 && $('uploadPanel1528').innerHTML.indexOf('content://com.wordred.app.fileprovider/media/video-1530.mp4') >= 0 && $('uploadPanel1528').innerHTML.indexOf('blob:wordred-test') < 0);
    // (b) Publicar mientras la previa se prepara: espera y publica solo, sin duplicar.
    st26.settings.serverToken = 'tok-dom-1530';
    W26.closeUploadPanel1528(); await tick();
    var cClose30 = window.document.querySelector('#composerOverlay [data-close]');
    if (cClose30) { click(cClose30); await tick(); }
    $('composerOpen').click(); await tick();
    T26.setComposerMediaList([]);
    $('postText').value = 'Publicar esperando la previa 1.5.30';
    var videoFile30b = new window.File([new Uint8Array(50 * 1024)], 'video-1530b.mp4', { type: 'video/mp4' });
    W26.handleComposerMediaFiles([videoFile30b]);
    $('toast').textContent = ''; $('toast').classList.remove('on');
    click($('postPublish'));
    check('v1.5.30 previa: 1.5.47 ya NO espera a la previa — al publicar con la previa preparándose no avisa que está preparando (publica con el archivo local)', $('toast').textContent.indexOf('Preparando tu archivo') < 0, $('toast').textContent);
    /* 30 s: en jsdom el video nunca carga metadatos y la carátula
       automática espera sus 8 s antes de subir (en el teléfono el video
       real carga en milisegundos). */
    var guardDone30 = await waitFor(function () { return st26.posts.filter(function (x) { return x.text === 'Publicar esperando la previa 1.5.30'; })[0]; }, 30000);
    var guardPost30 = st26.posts.filter(function (x) { return x.text === 'Publicar esperando la previa 1.5.30'; })[0];
    check('v1.5.30 previa: en cuanto la previa termina, la publicación se crea sola (sin tocar nada más)', !!guardPost30 && st26.posts.filter(function (x) { return x.text === 'Publicar esperando la previa 1.5.30'; }).length === 1);
    check('v1.5.30 previa: la publicación esperada lleva el video ya subido al servidor', !!guardPost30 && /^https:\/\/wordred-server\.onrender\.com\/media\//.test(guardPost30.media || ''), guardPost30 && guardPost30.media);
    st26.settings.serverToken = tokenOrig29;
    // (c) Compresión de fotos: con canvas, la foto se comprime; sin canvas, se sube tal cual.
    var OrigImage30 = window.Image;
    var OrigGetContext30 = window.HTMLCanvasElement.prototype.getContext;
    var OrigToDataURL30 = window.HTMLCanvasElement.prototype.toDataURL;
    window.HTMLCanvasElement.prototype.getContext = function () { return { drawImage: function () {}, fillRect: function () {}, canvas: this }; };
    window.HTMLCanvasElement.prototype.toDataURL = function () { return 'data:image/jpeg;base64,' + 'S'.repeat(1000); };
    window.Image = function () { var img = this; img.width = 0; img.height = 0; setTimeout(function () { img.width = 2000; img.height = 1500; if (img.onload) img.onload(); }, 0); };
    var bigJpeg30 = 'data:image/jpeg;base64,' + 'J'.repeat(2 * 1024 * 1024);
    var compressed30 = await new Promise(function (res) { W26.compressImageDataUrl1530(bigJpeg30, res); });
    check('v1.5.30 compresión: una foto grande se comprime a JPEG (mucho más pequeña, con buena calidad)', !!compressed30 && compressed30.indexOf('data:image/jpeg;base64,') === 0 && compressed30.length < bigJpeg30.length / 10, 'comprimida=' + (compressed30 && compressed30.length) + ' original=' + bigJpeg30.length);
    var smallJpeg30 = 'data:image/jpeg;base64,' + 'J'.repeat(100 * 1024);
    var smallOut30 = await new Promise(function (res) { W26.compressImageDataUrl1530(smallJpeg30, res); });
    check('v1.5.30 compresión: una foto pequeña no se comprime (se sube tal cual, devuelve la original)', smallOut30 === smallJpeg30);
    window.HTMLCanvasElement.prototype.getContext = function () { return null; };
    var noCanvas30 = await new Promise(function (res) { W26.compressImageDataUrl1530(bigJpeg30, res); });
    check('v1.5.30 compresión: sin canvas no se comprime y no se queda esperando (devuelve la original)', noCanvas30 === bigJpeg30);
    // (d) La subida usa la foto comprimida (los trozos que salen son mucho más pequeños que la foto original).
    window.HTMLCanvasElement.prototype.getContext = function () { return { drawImage: function () {}, fillRect: function () {}, canvas: this }; };
    var chunkBytes30 = 0;
    var fetchOrig30 = window.fetch;
    window.fetch = async function (url, opts) {
      if (String(url).indexOf('/api/media/chunk') >= 0) { try { chunkBytes30 += (JSON.parse((opts && opts.body) || '{}').data || '').length; } catch (e) {} }
      return fetchOrig30(url, opts);
    };
    st26.settings.serverToken = 'tok-dom-1530';
    T26.go('feed'); await tick();
    $('composerOpen').click(); await tick();
    $('postText').value = 'Foto comprimida 1.5.30';
    T26.setComposerMediaList([{ src: bigJpeg30, type: 'image' }]);
    W26.openUploadPanel1528(); await tick();
    click($('postPublish')); await tick();
    var compPost30 = await waitFor(function () { return st26.posts.filter(function (x) { return x.text === 'Foto comprimida 1.5.30'; })[0]; }, 15000);
    check('v1.5.30 compresión: la publicación con foto grande se crea', !!compPost30);
    check('v1.5.30 compresión: lo que se subió es la foto comprimida (mucho menos que los 2 MB originales)', chunkBytes30 > 0 && chunkBytes30 < 100 * 1024, 'trozos=' + chunkBytes30);
    window.fetch = fetchOrig30;
    window.HTMLCanvasElement.prototype.getContext = OrigGetContext30;
    window.HTMLCanvasElement.prototype.toDataURL = OrigToDataURL30;
    window.Image = OrigImage30;
    st26.settings.serverToken = tokenOrig29;
    // (e) La barra no se encima: va abajo, encima de la barra inferior, y el contenido se despeja (1.5.46: ya no arriba).
    W26.setUploadBarVisible1530(true);
    check('v1.5.30 barra: al mostrar la barra, el contenido se despeja 40 px abajo (nada queda detrás de ella)', window.document.body.classList.contains('wrUploading1530') && window.getComputedStyle(window.document.querySelector('main')).paddingBottom.indexOf('144px') >= 0, window.getComputedStyle(window.document.querySelector('main')).paddingBottom);
    W26.setUploadBarVisible1530(false);
    check('v1.5.30 barra: al acabar, el contenido vuelve a su sitio', !window.document.body.classList.contains('wrUploading1530') && window.getComputedStyle(window.document.querySelector('main')).paddingBottom.indexOf('144px') < 0);
    // (f) WordRed para Windows: aviso en la campana y entrada permanente en Ajustes.
    st26.notifications = st26.notifications.filter(function (n) { return n.type !== 'windows'; });
    delete st26.settings.windowsDlDismissed1530;
    W26.maybeNotifyWindows1530();
    check('v1.5.30 windows: al abrir la app, el aviso de Windows aparece en la campana (una vez)', st26.notifications.filter(function (n) { return n.type === 'windows'; }).length === 1 && st26.notifications.filter(function (n) { return n.type === 'windows'; })[0].refId === '1.0.3-windows', JSON.stringify(st26.notifications.filter(function (n) { return n.type === 'windows'; })));
    W26.maybeNotifyWindows1530();
    check('v1.5.30 windows: el aviso no se duplica si ya está en la campana', st26.notifications.filter(function (n) { return n.type === 'windows'; }).length === 1);
    T26.go('notifs'); await tick();
    check('v1.5.30 windows: la campana muestra el aviso con Descargar y Compartir', $('notifList').innerHTML.indexOf('Windows') >= 0 && $('notifList').innerHTML.indexOf('__wrDownloadWindows1530') >= 0 && $('notifList').innerHTML.indexOf('__wrShareWindows1530') >= 0);
    calls.openExternalUrl = [];
    window.__wrDownloadWindows1530(); await tick();
    check('v1.5.30 windows: al presionar Descargar, el aviso se quita de la campana y no vuelve', st26.notifications.filter(function (n) { return n.type === 'windows'; }).length === 0 && st26.settings.windowsDlDismissed1530 === '1.0.3-windows');
    check('v1.5.30 windows: Descargar abre la URL de la Release de GitHub', calls.openExternalUrl.some(function (u) { return u === 'https://github.com/misterystoreplay/Wordred-server/releases/download/v1.0.3-windows/WordRed-1.0.3-Windows.exe'; }), JSON.stringify(calls.openExternalUrl));
    W26.maybeNotifyWindows1530();
    check('v1.5.30 windows: tras descargarlo, el aviso no vuelve a aparecer para esta versión', st26.notifications.filter(function (n) { return n.type === 'windows'; }).length === 0);
    delete st26.settings.windowsDlDismissed1530;
    W26.maybeNotifyWindows1530();
    calls.shared = [];
    window.__wrShareWindows1530();
    check('v1.5.30 windows: Compartir comparte el enlace de descarga con el compartir del teléfono', calls.shared.some(function (s) { return (s.text || '').indexOf('https://github.com/misterystoreplay/Wordred-server/releases/download/v1.0.3-windows/WordRed-1.0.3-Windows.exe') >= 0; }), JSON.stringify(calls.shared));
    T26.go('profile'); await tick();
    click(qa('#ownProfile .ownTopRow > button')[5]); await tick();
    check('v1.5.30 windows: Ajustes tiene la entrada permanente de Windows con su botón', $('settingsOverlay').classList.contains('on') && !!$('windowsDownloadBtn'));
    calls.openExternalUrl = [];
    click($('windowsDownloadBtn'));
    check('v1.5.30 windows: el botón de Ajustes abre la misma URL de descarga', calls.openExternalUrl.some(function (u) { return u === 'https://github.com/misterystoreplay/Wordred-server/releases/download/v1.0.3-windows/WordRed-1.0.3-Windows.exe'; }), JSON.stringify(calls.openExternalUrl));
    click(window.document.querySelector('[data-close="settingsOverlay"]'));
    st26.notifications = st26.notifications.filter(function (n) { return n.type !== 'windows'; });
    delete st26.settings.windowsDlDismissed1530;
    if (OrigCreateObjectURL30) window.URL.createObjectURL = OrigCreateObjectURL30; else delete window.URL.createObjectURL;
    if (OrigRevokeObjectURL30) window.URL.revokeObjectURL = OrigRevokeObjectURL30; else delete window.URL.revokeObjectURL;
    // (g) Perfil propio: botones de 40 px en la fila superior.
    T26.go('profile'); await tick();
    var topBtns30b = qa('#ownProfile .ownTopRow > button');
    check('v1.5.30 perfil: los botones de la fila superior son de 40 px (caben los 6 en el teléfono)', topBtns30b.length === 6 && window.getComputedStyle(topBtns30b[0]).width === '40px', topBtns30b.length + ' botones, ancho=' + (topBtns30b[0] && window.getComputedStyle(topBtns30b[0]).width));
    // (h) FAQ.
    var faqHow30 = T26.getFaq().filter(function (f) { return f.q === '¿Cómo publico algo?'; })[0];
    check('v1.5.30 FAQ: ¿Cómo publico algo? describe la previa al instante y la compresión', !!faqHow30 && faqHow30.a.indexOf('al instante') >= 0 && faqHow30.a.indexOf('se comprime') >= 0);
    check('v1.5.30 FAQ: la respuesta sigue en 400 caracteres como mucho', !!faqHow30 && faqHow30.a.length <= 400, 'len=' + (faqHow30 && faqHow30.a.length));
    check('v1.5.30 FAQ: tiene 29 entradas (23 + 1 en la 1.5.33 por el tutorial, +1 en la 1.5.36 por el menú, +3 en la 1.5.42 por la cartelera, los Reels y «Tu tiempo hoy», +1 en la 1.5.54 por los dramas originales y Fantore; en la 1.5.55 la entrada de la 1.5.53 se cambió por la de la 1.5.55; en la 1.5.56 la entrada de la 1.5.54 se cambió por la de la 1.5.56; en la 1.5.59 la entrada de la 1.5.57 se cambió por la de la 1.5.59 y la de la 1.5.58 se acortó; en la 1.5.60 la entrada de la 1.5.58 se quitó, se añadió la de la 1.5.60 y la de la 1.5.59 se acortó)', T26.getFaq().length === 29);
    // (i) 1.5.31: "Tu tiempo hoy" en el perfil propio, en el lugar de la nota (no el clima).
    C26.recordScreenTime(st26, 63 * 60000, Date.now());
    calls.location = '19.43,-99.13';
    calls.weatherFail = false;
    await T26.loadWeather(); await tick();
    T26.go('profile'); await tick();
    var stTime31 = C26.formatScreenTime(C26.screenTimeTodayMs(st26, Date.now()));
    check('v1.5.31 tiempo: en el perfil propio va "Tu tiempo hoy" en el lugar de la tarjeta de la nota (1.5.39: justo antes de la tienda de juegos)', $('ownScreenTime1539').innerHTML.indexOf('Tu tiempo hoy') >= 0 && $('ownProfile').innerHTML.indexOf('Tu tiempo hoy') < 0 && !$('ownProfile').querySelector('#profileWeatherInfo') && $('ownProfile').innerHTML.indexOf('Clima de hoy') < 0 && !$('ownProfile').querySelector('#profileNoteInput'));
    check('v1.5.31 tiempo: la tarjeta muestra el tiempo de hoy con las barras de la semana', $('ownScreenTime1539').innerHTML.indexOf(stTime31) >= 0 && $('ownScreenTime1539').innerHTML.indexOf('lun') >= 0 && $('ownScreenTime1539').innerHTML.indexOf('dom') >= 0, 'esperado=' + stTime31);
    check('v1.5.31 tiempo: "Tu tiempo hoy" ya no está en Ajustes como tarjeta (un solo lugar, el perfil; las preguntas solo lo mencionan en su panel)', (function () { window.__wrOpenSettings(); var st = $('settingsOverlay').textContent; var ft = $('faqList') ? $('faqList').textContent : ''; var ok = st.indexOf('Tu tiempo hoy') < 0 && ft.indexOf('Tu tiempo hoy') >= 0; click(window.document.querySelector('[data-close="settingsOverlay"]')); return ok; })());
    check('v1.5.31 clima: el clima queda solo en la tarjeta de inicio', $('weatherInfo').textContent.indexOf('24°') >= 0 && !$('ownProfile').querySelector('#profileWeatherInfo'), 'inicio=' + $('weatherInfo').textContent);
    var topBtns31 = qa('#ownProfile .ownTopRow > button');
    check('v1.5.32 perfil: el engrane de ajustes es el último botón de la fila superior (6º)', topBtns31.length === 6 && (topBtns31[5].getAttribute('aria-label') || '') === 'Ajustes' && topBtns31[5].classList.contains('red') && (topBtns31[5].getAttribute('onclick') || '').indexOf('__wrOpenSettings') >= 0 && topBtns31.map(function (b) { return b.getAttribute('aria-label') || ''; }).join('|') === 'Quienes vieron tu perfil|Seguidores|Tu actividad|Transmitir en vivo|Recomendar un lugar|Ajustes');
    // (i2) 1.5.32: el botón Amigos sale de la fila superior; su insignia vive en Seguidores.
    check('v1.5.32 perfil: el botón Amigos ya no está en la fila superior', !q('#profileFriendsBtn') && !topBtns31.some(function (b) { return (b.getAttribute('aria-label') || '') === 'Amigos'; }));
    check('v1.5.32 perfil: la insignia de solicitudes vive dentro del botón Seguidores', (function () { var badge = q('#profileFriendsBadge'); return !!badge && badge.parentElement && (badge.parentElement.getAttribute('aria-label') || '') === 'Seguidores'; })());
    check('v1.5.32 perfil: Seguidores abre la lista de amigos', (function () { T26.go('profile'); click(q('#ownProfile button[aria-label="Seguidores"]')); return window.document.querySelector('#view-friends').classList.contains('on'); })());
    click(q('#ownProfile .ownEditBtn')); await tick();
    check('v1.5.30 nota: el editor de la biografía incluye el campo de la nota', $('editProfileOverlay').classList.contains('on') && !!$('profileNoteInput'));
    $('profileNoteInput').value = 'Nota guardada desde el perfil';
    click($('editProfileSave')); await tick();
    check('v1.5.26 nota en el perfil: guardar la nota la deja en el perfil', myProfile26().note === 'Nota guardada desde el perfil');

    // (10) Cuenta verificada.
    await W26.openVerification1526(); await tick();
    check('v1.5.26 verificación: el estado real muestra lo que falta sin fingir nada', $('verificationBody').innerHTML.indexOf('Número de teléfono verificado') >= 0 && $('verificationBody').innerHTML.indexOf('Solicitar verificación') >= 0);
    await window.__wrRequestVerification(); await tick();
    check('v1.5.26 verificación: si falta algo, la app lo dice y no concede la insignia', !myProfile26().verified && $('verificationBody').innerHTML.indexOf('Número de teléfono verificado') >= 0);
    check('v1.5.26 verificación: sin verificar no hay insignia en el perfil ni en las publicaciones', W26.verifiedBadgeHtml(me26) === '');
    myProfile26().verified = true;
    check('v1.5.26 verificación: con la cuenta verificada aparece la insignia', W26.verifiedBadgeHtml(me26).indexOf('verifiedBadge') >= 0);
    myProfile26().verified = false;

    // (31/13) Silenciar y amigos cercanos.
    await W26.toggleMute1526(BRUNO26); await tick();
    check('v1.5.26 silenciar: silenciar a alguien guarda su teléfono en la lista', (st26.muted[me26] || []).indexOf(BRUNO26) >= 0);
    await W26.toggleMute1526(BRUNO26); await tick();
    check('v1.5.26 silenciar: desilenciar quita de la lista', (st26.muted[me26] || []).indexOf(BRUNO26) < 0);
    await W26.toggleCloseFriend1526(BRUNO26); await tick();
    check('v1.5.26 cercanos: añadir a cercanos guarda en la lista', (st26.closeFriends[me26] || []).indexOf(BRUNO26) >= 0);
    const sClose26 = C26.createStory(st26, me26, { media: 'https://x.com/cercanos.jpg', mediaType: 'image', audience: 'close' });
    check('v1.5.26 cercanos: un cercano sí ve tu historia de cercanos y un desconocido no', C26.canSeeCloseStory(st26, BRUNO26, sClose26.story) === true && C26.canSeeCloseStory(st26, CARLA26, sClose26.story) === false);
    const sCarlaClose26 = C26.createStory(st26, CARLA26, { media: 'https://x.com/carla.jpg', mediaType: 'image', audience: 'close' });
    T26.go('feed'); T26.renderFeed(); await tick();
    check('v1.5.26 cercanos: la historia de cercanos de otra persona no se muestra a quien no es cercano', ($('storiesRow') ? $('storiesRow').innerHTML : '').indexOf(sCarlaClose26.story.id) < 0);

    // (7/9/1/39/17/50) Historias: encuesta, reacciones, vistas, solo texto, voz, Short compartido.
    const sPoll26 = C26.createStory(st26, BRUNO26, { media: 'https://x.com/foto.jpg', mediaType: 'image', poll: { question: '¿Te gusta?', options: ['Sí', 'No'] }, link: 'https://ejemplo.com', audience: 'all' });
    check('v1.5.26 encuesta en historia: la encuesta se guarda con pregunta y 2 opciones', sPoll26.ok && sPoll26.story && sPoll26.story.poll && sPoll26.story.poll.options.length === 2);
    check('v1.5.26 encuesta en historia: el visor muestra la pregunta y las opciones para votar', W26.storyPollHtml1526(sPoll26.story).indexOf('¿Te gusta?') >= 0 && W26.storyPollHtml1526(sPoll26.story).indexOf('Sí') >= 0);
    check('v1.5.26 enlace en historia: la pastilla Ver enlace aparece', W26.storyLinkPillHtml1526(sPoll26.story).indexOf('Ver enlace') >= 0);
    check('v1.5.26 historia: los extras muestran encuesta, reacciones y enlace juntos', W26.storyExtrasHtml1526(sPoll26.story).indexOf('¿Te gusta?') >= 0 && W26.storyExtrasHtml1526(sPoll26.story).indexOf('Ver enlace') >= 0);
    await window.__wrVoteStoryPoll(sPoll26.story.id, 0); await tick();
    check('v1.5.26 encuesta en historia: votar registra el voto y muestra los conteos', (function () { const s = st26.stories.filter(function (x) { return x.id === sPoll26.story.id; })[0]; return s && s.poll && s.poll.options[0].votes === 1; })());
    await window.__wrReactStory(sPoll26.story.id, '❤️'); await tick();
    check('v1.5.26 reacciones a historia: tu reacción queda marcada', (function () { const s = st26.stories.filter(function (x) { return x.id === sPoll26.story.id; })[0]; return s && s.myReaction === '❤️'; })());
    await W26.recordStoryView1526(sPoll26.story); await tick();
    check('v1.5.26 vistas de historia: ver la historia de otro registra la visita en el servidor', api1526Has('/api/story-views', 'POST'));
    const sMine26 = C26.createStory(st26, me26, { media: 'https://x.com/mifoto.jpg', mediaType: 'image' });
    await W26.openStoryViewers1526(sMine26.story.id); await tick();
    check('v1.5.26 vistas de historia: en tu historia se ve quién la vio', $('storyViewsBody').innerHTML.indexOf('Bruno') >= 0);
    const sText26 = C26.createStory(st26, me26, { text: 'Solo texto de prueba', backgroundColor: '#123456' });
    check('v1.5.26 historia de solo texto: se publica con color de fondo y sin foto', sText26.ok && sText26.story && sText26.story.backgroundColor === '#123456' && sText26.story.text === 'Solo texto de prueba');
    check('v1.5.26 notas de voz en historias: el audio se reproduce con su portada', W26.storyAudioHtml1526({ mediaType: 'audio', media: 'https://x.com/voz.mp3', cover: 'https://x.com/portada.jpg' }).indexOf('<audio') >= 0 && W26.storyAudioHtml1526({ mediaType: 'audio', media: 'https://x.com/voz.mp3', cover: 'https://x.com/portada.jpg' }).indexOf('https://x.com/portada.jpg') >= 0);
    const sShared26 = C26.createStory(st26, me26, { media: 'https://x.com/cover.jpg', mediaType: 'image', sharedShortId: pShort26.post.id });
    check('v1.5.26 compartir Short en historia: la historia guarda la referencia al Short', sShared26.ok && sShared26.story && sShared26.story.sharedShortId === pShort26.post.id);
    window.__wrOpenStory(sShared26.story.id);
    await tick();
    const sharedHtml26 = $('shortsBody').innerHTML;
    check('v1.5.26 compartir Short en historia: se ve la portada con el botón Ver Short', sharedHtml26.indexOf('Ver Short') >= 0);

    // (3) Dueto en Shorts.
    W26.openDuet1526(pShort26.post.id);
    check('v1.5.26 dueto: la pantalla dividida muestra el original y la cámara lista para grabar', $('duetOverlay').classList.contains('on') && $('duetOrigTitle').textContent.indexOf('Bruno') >= 0 && $('duetOrigVideo').innerHTML.indexOf('<video') >= 0 && $('duetCamVideo').innerHTML.indexOf('Empezar a grabar') >= 0);
    const pDuet26 = C26.createPost(st26, me26, { text: 'Mi dueto', media: 'https://x.com/midueto.mp4', mediaType: 'video', duetOf: { postId: pShort26.post.id, author: BRUNO26 } });
    check('v1.5.26 dueto: el dueto publicado guarda la referencia al original', pDuet26.ok && pDuet26.post.duetOf && pDuet26.post.duetOf.postId === pShort26.post.id);
    window.__wrOpenShort(pDuet26.post.id);
    await tick();
    const duetHtml26 = $('shortsBody').innerHTML + $('shortsInfo').innerHTML;
    check('v1.5.26 dueto: el reproductor muestra el dueto en pantalla dividida', duetHtml26.indexOf('Dueto') >= 0 && $('shortsBody').innerHTML.indexOf('Original · toca para ver') >= 0);

    // (12/34/21) Carrito, cupones, deseos y envío del pedido.
    const lst26 = C26.createListing(st26, BRUNO26, { title: 'Bici de prueba', price: 3000, category: 'Muebles', condition: 'Usado', delivery: 'Recoger', city: 'CDMX' });
    check('v1.5.26 carrito: el anuncio se crea para vender', lst26.ok && lst26.listing && lst26.listing.id);
    C26.cartAdd(st26, lst26.listing.id, 2);
    W26.openCart1526();
    check('v1.5.26 carrito: el total es real (2 × $3,000 = $6,000)', $('cartBody').innerHTML.indexOf('Bici de prueba') >= 0 && $('cartBody').innerHTML.indexOf('6,000') >= 0);
    $('cartCouponInput').value = 'VERANO10';
    await window.__wrApplyCartCoupon(); await tick();
    check('v1.5.26 cupones: aplicar un cupón descuenta el total de verdad ($5,400)', $('cartBody').innerHTML.indexOf('5,400') >= 0);
    await window.__wrSendOrder('chat'); await tick();
    check('v1.5.26 carrito: al enviar el pedido por WordRed el carrito se vacía y el vendedor recibe el pedido', st26.cart.length === 0 && convoWith26(BRUNO26).some(function (m) { return (m.text || '').indexOf('Bici de prueba') >= 0 && (m.text || '').indexOf('Total') >= 0; }));
    C26.wishlistToggle(st26, lst26.listing.id);
    W26.openWishlist1526();
    check('v1.5.26 deseos: el anuncio con corazón aparece en Mis deseos', $('wishlistBody').innerHTML.indexOf('Bici de prueba') >= 0);
    C26.wishlistToggle(st26, lst26.listing.id);
    W26.openWishlist1526();
    check('v1.5.26 deseos: al quitar el corazón desaparece de la lista', $('wishlistBody').innerHTML.indexOf('Bici de prueba') < 0);
    await W26.openCoupons1526(); await tick(); await tick();
    check('v1.5.26 cupones: en Mis productos se ven los cupones de la tienda', $('couponsList').innerHTML.indexOf('VERANO10') >= 0);
    $('couponCode').value = 'VERANO10'; $('couponPct').value = '10'; $('couponExpires').value = '2026-12-31';
    await window.__wrCreateCoupon(); await tick(); await tick();
    check('v1.5.26 cupones: crear un cupón lo guarda en la tienda', $('couponsList').innerHTML.indexOf('VERANO10') >= 0);

    // (19/20) Salas de audio y torneos.
    await W26.openAudioRooms1526(); await tick(); await tick();
    check('v1.5.26 salas de audio: se ven las salas en vivo con su tema', $('audioRoomsList').innerHTML.indexOf('Charla') >= 0 && $('audioRoomsList').innerHTML.indexOf('Música') >= 0);
    $('audioRoomTitle').value = 'Sala de prueba'; $('audioRoomTopic').value = 'Charla de prueba';
    let roomCreatedOk26 = true;
    try { await window.__wrCreateAudioRoom(); } catch (e) { roomCreatedOk26 = false; }
    await tick();
    check('v1.5.26 salas de audio: crear una sala la registra en el servidor sin romper la app', roomCreatedOk26 && api1526Has('/api/audio-rooms', 'POST'));
    // (19) La oferta: al entrar con micrófono, se ofrece a los que ya
    // están en la sala (si nadie ofrece, el audio entre teléfonos no se
    // conecta). El servidor simulado devuelve la sala con Bruno + yo.
    window.RTCPeerConnection = function () {
      this.addTrack = function () {};
      this.createOffer = async function () { return { type: 'offer', sdp: 'oferta-de-prueba' }; };
      this.setLocalDescription = async function () {};
      this.setRemoteDescription = async function () {};
      this.addIceCandidate = async function () {};
    };
    try { Object.defineProperty(window.navigator, 'mediaDevices', { value: { getUserMedia: async function () { return { getTracks: function () { return [{ kind: 'audio', enabled: true, stop: function () {} }]; } }; } }, configurable: true }); } catch (e) {}
    await window.__wrJoinAudioRoom('room26'); await tick(); await tick(); await tick(); await tick(); await tick();
    check('v1.5.26 salas de audio: al entrar con micrófono se envía la oferta a quien ya está en la sala', api1526Has('/api/audio-rooms/room26/signal', 'POST'));
    W26.leaveAudioRoomLocal1526();
    delete window.RTCPeerConnection;
    try { delete window.navigator.mediaDevices; } catch (e) {}
    await W26.loadTournament1526(true); await tick();
    await W26.renderTournament1526(); await tick();
    check('v1.5.26 torneos: el torneo actual muestra el juego de la semana y la tabla real', $('tournamentBox').innerHTML.indexOf('Snake') >= 0 && $('tournamentBox').innerHTML.indexOf('Ana') >= 0 && $('tournamentBox').innerHTML.indexOf('120') >= 0);
    await W26.submitTournamentScore1526('snake', 100); await tick();
    check('v1.5.26 torneos: el puntaje se envía al torneo actual', api1526Has('/score', 'POST'));

    // (5) Cumpleaños en la campana.
    st26.profiles[BRUNO26].birthday = today26;
    W26.checkBirthdays1526();
    check('v1.5.26 cumpleaños: el cumpleaños de hoy llega a la campana', st26.notifications.some(function (n) { return n.type === 'birthday' && n.from === BRUNO26; }));
    check('v1.5.26 cumpleaños: también llega la notificación del celular', calls.notifications.some(function (n) { return /cumpleaños/.test(n.x || ''); }));
    st26.profiles[CARLA26].birthday = tmr26;
    check('v1.5.26 cumpleaños: la lista de próximos cumpleaños muestra al de mañana', W26.upcomingBirthdaysHtml1526().indexOf('Carla') >= 0);
    setVal($('friendsSearch'), '');
    T26.go('friends'); await tick();
    click(q('#friendsTabs button[data-tab="list"]')); await tick();
    check('v1.5.26 cumpleaños: en Amigos se ve la lista de próximos cumpleaños', ($('view-friends') ? $('view-friends').innerHTML : '').indexOf('Próximos cumpleaños') >= 0);

    // (6/14) Programadas y borradores.
    const sch26 = C26.schedulePost(st26, { text: 'Programada de prueba' }, Date.now() + 3600000);
    check('v1.5.26 programadas: programar una publicación la guarda pendiente', sch26.ok && sch26.item && sch26.item.id);
    sch26.item.atMs = Date.now() - 1000;
    await W26.publishDueScheduled1526();
    check('v1.5.26 programadas: la publicación vencida se publica al abrir la app', st26.posts.some(function (p) { return p.text === 'Programada de prueba'; }));
    check('v1.5.26 programadas: se avisa que se publicó', st26.notifications.some(function (n) { return /programada se publicó/.test(n.text || ''); }));
    const schMiss26 = C26.schedulePost(st26, { text: 'Programada atrasada' }, Date.now() + 3600000);
    schMiss26.item.atMs = Date.now() - 10 * 60000;
    await W26.publishDueScheduled1526();
    check('v1.5.26 programadas: si el teléfono estaba apagado a la hora, se avisa así', st26.notifications.some(function (n) { return /teléfono estaba apagado/.test(n.text || ''); }));
    const schFut26 = C26.schedulePost(st26, { text: 'Programada futura' }, Date.now() + 3600000);
    W26.openScheduled1526();
    check('v1.5.26 programadas: la lista muestra las pendientes', $('scheduledList').innerHTML.indexOf('Programada futura') >= 0);
    $('postText').value = 'Borrador de prueba';
    W26.saveDraft1526();
    check('v1.5.26 borradores: guardar un borrador lo deja en la lista sin publicar', st26.drafts.some(function (d) { return d.text === 'Borrador de prueba'; }) && !st26.posts.some(function (p) { return p.text === 'Borrador de prueba'; }));
    W26.openDrafts1526();
    check('v1.5.26 borradores: la lista de borradores muestra el guardado', $('draftsList').innerHTML.indexOf('Borrador de prueba') >= 0);

    // (47/57/55/56/58/32/54) Chat: stickers, jugar, ubicación, reacciones, voz rápida, temporales, fijar.
    window.__wrOpenChat(BRUNO26); await tick();
    const mStick26 = C26.sendMessage(st26, me26, BRUNO26, '', '', '', null, null, { stickerId: 'gato' });
    T26.renderChatMsgs();
    check('v1.5.26 stickers: el mensaje con sticker dibuja la imagen del paquete', mStick26.ok && $('chatMsgs').innerHTML.indexOf('stickers/gato.svg') >= 0);
    window.__wrSendGameInvite('snake'); await tick();
    check('v1.5.26 jugar en el chat: la invitación al juego llega con su tarjeta', convoWith26(BRUNO26).some(function (m) { return m.gameInvite && m.gameInvite.gameId === 'snake'; }) && $('chatMsgs').innerHTML.indexOf('Invitación a jugar') >= 0);
    const mVoice26 = C26.sendMessage(st26, me26, BRUNO26, '', '', '', null, { src: 'https://x.com/voz.mp3', duration: 3500 });
    T26.renderChatMsgs();
    const vaEl26 = q('#chatMsgs audio[id^="va_"]');
    check('v1.5.26 notas de voz más rápido: el reproductor de voz trae 1x, 1.5x y 2x', mVoice26.ok && !!vaEl26 && $('chatMsgs').innerHTML.indexOf('1.5x') >= 0 && $('chatMsgs').innerHTML.indexOf('2x') >= 0);
    const spdBtn26 = Array.from(qa('#chatMsgs button')).filter(function (b) { return (b.textContent || '').trim() === '1.5x'; })[0];
    if (spdBtn26) { click(spdBtn26); }
    check('v1.5.26 notas de voz más rápido: tocar 1.5x pone el audio a 1.5 de velocidad', !!vaEl26 && vaEl26.playbackRate === 1.5);
    try { Object.defineProperty(window.navigator, 'geolocation', { value: { getCurrentPosition: function (ok) { ok({ coords: { latitude: 19.4326, longitude: -99.1332 } }); }, watchPosition: function () { return 1; }, clearWatch: function () {} }, configurable: true }); } catch (e) {}
    window.__wrShareLiveLocation(); await tick();
    check('v1.5.26 ubicación en vivo: compartir crea el mensaje con el mapa y el aviso de minutos', convoWith26(BRUNO26).some(function (m) { return m.liveLocation && m.liveLocation.lat === 19.4326; }) && $('chatMsgs').innerHTML.indexOf('staticmap.openstreetmap.de') >= 0 && $('chatHeaderExtra').innerHTML.indexOf('min restantes') >= 0);
    window.__wrStopLiveLocation();
    check('v1.5.26 ubicación en vivo: dejar de compartir quita el aviso de la cabecera', $('chatHeaderExtra').innerHTML.indexOf('min restantes') < 0);
    W26.applyMsgReactionLocal1526(mStick26.message, me26, 'Ana', '❤️');
    check('v1.5.26 reacciones a mensajes: la reacción queda en el mensaje y se ve con su conteo', W26.msgReactionsHtml1526(mStick26.message).indexOf('❤️') >= 0 && W26.msgReactionsHtml1526(mStick26.message).indexOf('1') >= 0);
    await window.__wrReactToMessage(mStick26.message.id, '😂'); await tick();
    check('v1.5.26 reacciones a mensajes: cambiar la reacción la actualiza en el servidor y en local', api1526Has('/api/messages/' + mStick26.message.id + '/react', 'POST') && W26.msgReactionsHtml1526(mStick26.message).indexOf('😂') >= 0);
    await window.__wrToggleDisappearing(BRUNO26); await tick();
    check('v1.5.26 mensajes temporales: activar guarda 24 h en el chat', W26.disappearingHours1526(BRUNO26) === 24 && api1526Has('/disappearing', 'POST'));
    check('v1.5.26 mensajes temporales: la cabecera del chat avisa que los mensajes se borran en 24 h', $('chatHeaderExtra').innerHTML.indexOf('24 h') >= 0);
    const mOld26 = C26.sendMessage(st26, me26, BRUNO26, 'Mensaje viejo de prueba');
    mOld26.message.createdAt = Date.now() - 25 * 3600000;
    W26.pruneDisappearingLocal1526(BRUNO26);
    check('v1.5.26 mensajes temporales: al abrir el chat, los mensajes con más de 24 h se podan en local', !convoWith26(BRUNO26).some(function (m) { return m.id === mOld26.message.id; }));
    await window.__wrToggleDisappearing(BRUNO26); await tick();
    check('v1.5.26 mensajes temporales: desactivar deja el chat normal', W26.disappearingHours1526(BRUNO26) === 0);
    window.__wrTogglePinChat('c:' + BRUNO26);
    check('v1.5.26 fijar chat: el chat fijado queda guardado', W26.isChatPinned1526('c:' + BRUNO26));
    T26.go('messages'); await tick();
    check('v1.5.26 fijar chat: el chat fijado se ve con su pin en la lista', ($('view-messages') ? $('view-messages').querySelectorAll('[title="Quitar fijado"]').length : 0) === 1);
    window.__wrTogglePinChat('c:' + BRUNO26);

    // (57/55) Jugar y ubicación también en el chat de grupo.
    const gc26 = C26.createGroupChat(st26, me26, { name: 'Grupo de chat de prueba', participants: [BRUNO26, CARLA26] }); /* el grupo exige al menos 2 personas además de mí */
    check('v1.5.26 jugar en el chat: el chat de grupo se crea para probar', gc26.ok && gc26.group && gc26.group.id);
    window.__wrOpenGroupChat(gc26.group.id); await tick();
    window.__wrSendGameInvite('snake'); await tick();
    check('v1.5.26 jugar en el chat: en el grupo la invitación también llega con su tarjeta', (st26.groupChats.filter(function (g) { return g.id === gc26.group.id; })[0].messages || []).some(function (m) { return m.gameInvite && m.gameInvite.gameId === 'snake'; }));
    window.__wrShareLiveLocation(); await tick();
    check('v1.5.26 ubicación en vivo: en el grupo también se comparte con su mapa', (st26.groupChats.filter(function (g) { return g.id === gc26.group.id; })[0].messages || []).some(function (m) { return m.liveLocation && m.liveLocation.lat === 19.4326; }));
    window.__wrStopLiveLocation();

    // (59/35/37/44/49/38) Enlaces, texto, fondo, tiempo, horas tranquilas, datos.
    C26.saveLink(st26, 'https://ejemplo.com/articulo', 'Artículo de ejemplo');
    W26.openSavedLinks1526();
    check('v1.5.26 enlaces guardados: el enlace se guarda con su dominio', $('savedLinksBody').innerHTML.indexOf('ejemplo.com') >= 0);
    T26.go('search'); await tick();
    check('v1.5.26 enlaces guardados: la tarjeta aparece también en la búsqueda', ($('view-search') ? $('view-search').innerHTML : '').indexOf('Enlaces guardados') >= 0);
    W26.setTextSize1526('grande');
    check('v1.5.26 letra más grande: la clase se aplica en la raíz y se guarda', window.document.documentElement.classList.contains('textsize-grande') && st26.settings.textSize === 'grande');
    W26.setTextSize1526('muygrande');
    check('v1.5.26 letra más grande: muy grande también escala el texto', window.document.documentElement.classList.contains('textsize-muygrande'));
    W26.setTextSize1526('normal');
    st26.settings.chatBg = '#1a0c0f';
    W26.applyChatBg1526();
    check('v1.5.26 fondo de chats: el fondo se dibuja detrás de los mensajes', ($('chatMsgs').style.backgroundColor || '').indexOf('rgb(26, 12, 15)') >= 0 && ($('chatMsgs').style.backgroundImage || '').indexOf('linear-gradient') >= 0);
    st26.settings.chatBg = '';
    W26.applyChatBg1526();
    C26.recordScreenTime(st26, 60000, Date.now());
    check('v1.5.26 tu tiempo: el tiempo de hoy se acumula y se muestra', W26.screenTimeTodayHtml().indexOf('Tu tiempo hoy') >= 0 && C26.screenTimeTodayMs(st26, Date.now()) >= 60000);
    const nowH26 = new Date().getHours();
    const hh26 = function (h) { return String((h + 24) % 24).padStart(2, '0') + ':00'; };
    st26.settings.quietHours = { on: true, start: hh26(nowH26 - 1), end: hh26(nowH26 + 1) };
    check('v1.5.26 horas tranquilas: dentro del horario, los avisos se guardan en la campana', W26.inQuietHours1526() === true);
    st26.settings.quietHours.on = false;
    check('v1.5.26 horas tranquilas: apagadas, no silencian nada', W26.inQuietHours1526() === false);
    st26.settings.quietHours = { on: false, start: '22:00', end: '07:00' };
    let connOk26 = false;
    try { Object.defineProperty(window.navigator, 'connection', { value: { type: 'cellular' }, configurable: true }); connOk26 = window.navigator.connection && window.navigator.connection.type === 'cellular'; } catch (e) {}
    if (connOk26) {
      st26.settings.dataSaver = true;
      check('v1.5.26 ahorro de datos: con datos móviles, los videos se retienen con su portada', W26.dataSaverHolds1526() === true && W26.videoGateHtml1526('https://x.com/v.mp4', '', 'Video').indexOf('Tocar para cargar') >= 0);
      st26.settings.dataSaver = false;
    } else {
      check('v1.5.26 ahorro de datos: el simulador no permite fijar navigator.connection (se prueba en el teléfono)', true);
    }

    // (53/66/27/46/64/41/62) Clima de otra ciudad, calendario, recordatorio, respaldo, sonido, cuentas, enlace.
    T26.renderWeatherDetail(); await tick();
    await W26.searchWeatherCity1526('Ciudad de México'); await tick();
    check('v1.5.26 clima de otra ciudad: el buscador encuentra la ciudad', $('weatherCityResults').innerHTML.indexOf('Ciudad de México') >= 0);
    const cityRow26 = q('#weatherCityResults .glass');
    if (cityRow26) { click(cityRow26); }
    await tick(); await tick();
    check('v1.5.26 clima de otra ciudad: cargar la ciudad guarda su nombre y su clima', st26.weather && st26.weather.cityName === 'Ciudad de México');
    st26.events = st26.events || [];
    st26.events.push({ id: 'ev26', name: 'Concierto de prueba', date: today26, time: '20:00', place: 'Foro Sol', desc: 'Prueba de calendario', attendees: {} });
    window.__wrAddEventToCalendar('ev26');
    check('v1.5.26 calendario: añadir el evento abre el calendario con el evento llenado', calls.calendarAdds.length === 1 && calls.calendarAdds[0].title === 'Concierto de prueba');
    const evRemDate26 = new Date(Date.now() + 2 * 3600000);
    const evRem26 = { id: 'ev27', name: 'Fiesta de prueba', date: fmtDate26(evRemDate26), time: String(evRemDate26.getHours()).padStart(2, '0') + ':' + String(evRemDate26.getMinutes()).padStart(2, '0'), place: '', desc: '', attendees: {} };
    evRem26.attendees[me26] = true;
    st26.events.push(evRem26);
    const localBefore26 = calls.localNotifs.length;
    W26.scheduleEventReminders1526();
    check('v1.5.26 recordatorio de eventos: el evento al que vas programa un aviso local', calls.localNotifs.length > localBefore26 && calls.localNotifs.some(function (n) { return n.id === 'evt_ev27'; }));
    window.__wrExportChats();
    check('v1.5.26 respaldo: exportar los chats guarda un JSON con los mensajes', calls.chatBackups.length === 1 && (function () { try { const b = JSON.parse(calls.chatBackups[0]); return b.app === 'WordRed' && b.conversations && b.conversations.length > 0; } catch (e) { return false; } })());
    window.__wrSetChatSound(BRUNO26, 'chime');
    check('v1.5.26 sonido por chat: el sonido elegido queda guardado para ese chat', W26.chatSound1526(BRUNO26) === 'chime' && (st26.chatSounds || {})[BRUNO26] === 'chime');
    window.__wrOpenChat(BRUNO26); await tick();
    W26.openChatSound1526();
    check('v1.5.26 sonido por chat: el selector muestra los sonidos de la app', $('chatSoundBody').innerHTML.indexOf('Campanita') >= 0);
    C26.addAccount(st26, { phone: '5522222222', name: 'Bruno', avatar: '', token: 'tok-dom-2' });
    W26.openSwitchAccount1526();
    check('v1.5.26 cambiar de cuenta: la lista muestra la cuenta añadida', $('switchAccountBody').innerHTML.indexOf('Bruno') >= 0);
    C26.removeAccount(st26, '5522222222');
    await W26.openGroupByLink1526('g26'); await tick();
    check('v1.5.26 invitar con enlace: abrir el enlace muestra el grupo con su botón para unirse', window.document.body.innerHTML.indexOf('Grupo de prueba') >= 0 && window.document.body.innerHTML.indexOf('Unirme al grupo') >= 0);

    // FAQ comprimida.
    T26.renderFaq();
    const faqItems26 = q('#faqList') ? q('#faqList').querySelectorAll('.faqItem') : [];
    check('v1.5.26 FAQ: comprimida a 23 entradas en la 1.5.26, 24 en la 1.5.33 (+1 por el tutorial), 25 en la 1.5.36 (+1 por el menú), 28 en la 1.5.42 (+3 por la cartelera, los Reels y «Tu tiempo hoy») y 29 en la 1.5.54 (+1 por los dramas originales y Fantore); en la 1.5.55 la entrada de la 1.5.53 se cambió por la de la 1.5.55; en la 1.5.56 la entrada de la 1.5.54 se cambió por la de la 1.5.56; en la 1.5.59 la entrada de la 1.5.57 se cambió por la de la 1.5.59 y la de la 1.5.58 se acortó; en la 1.5.60 la entrada de la 1.5.58 se quitó, se añadió la de la 1.5.60 y la de la 1.5.59 se acortó, en su panel, sin el rebote falso del cajón', faqItems26.length === 29 && q('#faqList').innerHTML.indexOf('rebote') < 0);

    // (16/23/8) Regalos, invitados y retos.
    check('v1.5.26 regalos en vivo: el catálogo tiene los 6 regalos sin precios', W26.liveGiftsHtml1526().indexOf('Rosa') >= 0 && W26.liveGiftsHtml1526().indexOf('Corona') >= 0 && W26.liveGiftsHtml1526().indexOf('Cohete') >= 0 && W26.liveGiftsHtml1526().indexOf('$') < 0);
    const giftHandled26 = W26.handleServerMessage1526({ kind: 'liveGift', liveId: 'live26', giftId: 'rosa', from: BRUNO26, counts: { rosa: 1 }, total: 1 });
    check('v1.5.26 regalos en vivo: el regalo que llega por WebSocket se atiende sin errores', giftHandled26 === true);
    const invHandled26 = W26.handleServerMessage1526({ kind: 'liveInvite', liveId: 'live26', from: BRUNO26, to: me26 });
    check('v1.5.26 invitados en vivo: el aviso de invitación se atiende y queda pendiente', invHandled26 === true && W26.getLiveInvitePending() != null);
    await W26.respondLiveInvite1526(false); await tick();
    check('v1.5.26 invitados en vivo: rechazar la invitación avisa al servidor y limpia el pendiente', W26.getLiveInvitePending() === null && api1526Has('/invite/respond', 'POST'));
    await W26.openChallenges1526(); await tick();
    check('v1.5.26 retos: la sección Retos muestra los retos reales', $('challengesList').innerHTML.indexOf('#RetoBaile') >= 0);

    // (51) Grupos secretos.
    const gSec26 = C26.createGroup(st26, me26, { name: 'Grupo secreto de prueba', secret: true });
    check('v1.5.26 grupos secretos: el grupo se crea marcado como secreto', gSec26.ok && gSec26.group && gSec26.group.secret === true);
    window.__wrInviteToGroup(gSec26.group.id);
    check('v1.5.26 grupos secretos: los administradores invitan desde sus amigos', $('dialogBody').innerHTML.indexOf('Bruno') >= 0);
    await window.__wrSendGroupInvite(gSec26.group.id, BRUNO26); await tick();
    check('v1.5.26 grupos secretos: la invitación se envía al servidor', api1526Has('/api/groups/' + gSec26.group.id + '/invite', 'POST'));

    // (63/65/48) Marco, filtro y video de perfil.
    await window.__wrSetAvatarFrame('dorado'); await tick();
    check('v1.5.26 marco para tu foto: el marco dorado queda guardado y se dibuja alrededor del avatar', myProfile26().avatarFrame === 'dorado' && W26.avatarFrameStyle(me26).indexOf('box-shadow') >= 0);
    await window.__wrSetAvatarFilter('Sepia'); await tick();
    check('v1.5.26 filtro para tu foto: el filtro Sepia queda guardado y se aplica al dibujar el avatar', myProfile26().avatarFilter === 'Sepia' && W26.avatarFilterStyle(me26).indexOf('sepia') >= 0);
    myProfile26().avatarVideo = { url: 'https://x.com/avatar.mp4', durationMs: 5000 };
    check('v1.5.26 video en tu foto: el perfil reproduce el video en bucle, silenciado y sin controles', W26.avatarVideoHtml(me26, 'lg').indexOf('<video') >= 0 && W26.avatarVideoHtml(me26, 'lg').indexOf('loop') >= 0 && W26.avatarVideoHtml(me26, 'lg').indexOf('muted') >= 0);
    myProfile26().avatarVideo = null; myProfile26().avatarFrame = 'none'; myProfile26().avatarFilter = 'Original';

    // (35/49/38/45) Ajustes 1.5.26.
    st26.wordFilter = ['sol'];
    T26.renderFeed(); await tick();
    window.__wrOpenSettings(); await tick();
    const set1526 = $('settings1526') ? $('settings1526').innerHTML : '';
    check('v1.5.26 ajustes: tamaño de texto, fondo, ahorro de datos, horas tranquilas, silenciados, verificación, cuentas, filtro y respaldo están en Ajustes',
      set1526.indexOf('Tamaño del texto') >= 0 && set1526.indexOf('Fondo de chats') >= 0 && set1526.indexOf('Ahorro de datos') >= 0 && set1526.indexOf('Horas tranquilas') >= 0 && set1526.indexOf('Silenciados') >= 0 && set1526.indexOf('Cuenta verificada') >= 0 && set1526.indexOf('Cambiar de cuenta') >= 0 && set1526.indexOf('Palabras que no quiero ver') >= 0 && set1526.indexOf('Respaldar mis chats') >= 0);
    check('v1.5.26 filtro de palabras: en Ajustes se ve cuántas publicaciones oculta el filtro', set1526.indexOf('oculta') >= 0);
    st26.wordFilter = [];

    // (43) Shorts guardados.
    C26.toggleSave(st26, me26, pShort26.post.id);
    W26.openSavedShorts1526(); await tick();
    check('v1.5.26 Shorts guardados: el Short guardado se abre con el visor de Shorts', $('shortsOverlay') && $('shortsOverlay').classList.contains('on'));
    C26.toggleSave(st26, me26, pShort26.post.id);

    // Limpieza: borrar las publicaciones, historias, eventos y datos de prueba.
    [pMood26, pReto26, pPlace26, pPoll26, pEng26, pShort26, pFriend26, pStranger26, pSol26, pMem26, pDuet26].forEach(function (r) { if (r && r.ok && r.post) C26.deletePost(st26, r.post.author, r.post.id); });
    st26.stories = (st26.stories || []).filter(function (s) { return [sPoll26, sMine26, sText26, sShared26, sClose26, sCarlaClose26].every(function (x) { return !x || !x.story || x.story.id !== s.id; }); });
    st26.events = (st26.events || []).filter(function (e) { return e.id !== 'ev26' && e.id !== 'ev27'; });
    if (schFut26 && schFut26.item) C26.removeScheduledPost(st26, schFut26.item.id);
    if (st26.drafts) { const d26 = st26.drafts.filter(function (d) { return d.text === 'Borrador de prueba'; })[0]; if (d26) C26.deleteDraft(st26, d26.id); }
    st26.cart = []; st26.wishlist = [];
    C26.removeSavedLink(st26, 'https://ejemplo.com/articulo');
    if (gSec26 && gSec26.group) st26.groups = (st26.groups || []).filter(function (g) { return g.id !== gSec26.group.id; });
    // (33) 1.5.33: tiempo real, tutorial sin animales ni animaciones, 20 perfiles de ejemplo (1.5.34: 1 sola cuenta).
    var savedPosts33 = st26.posts;
    var savedProfiles33 = st26.profiles;
    var savedOverride33 = st26.settings.examplesOverride;
    var savedSeen33 = st26.settings.tutorialSeen1533;
    var savedScreenTime33 = st26.screenTime;
    var fresh33 = C26.emptyState();
    C26.seedDemo(fresh33);
    st26.profiles = Object.assign({}, st26.profiles, fresh33.profiles);
    st26.posts = fresh33.posts.slice();
    st26.settings.examplesOverride = '';
    st26.settings.tutorialSeen1533 = false;
    // Tutorial: sale la primera vez.
    T26.hideOverlay('permissionsOverlay');
    T26.maybeShowTutorial1533();
    check('v1.5.33 tutorial: al abrir por primera vez aparece el tutorial a pantalla completa', $('tutorialOverlay').classList.contains('on') && $('tutorialCard').innerHTML.indexOf('Saltar') >= 0, $('tutorialCard').innerHTML.slice(0, 120));
    check('v1.5.33 tutorial: el primer paso es una ilustración de la app (SVG, sin foto de animal)', (function () { var art = $('tutorialArt'); return !!art && art.innerHTML.indexOf('<svg') >= 0 && art.innerHTML.indexOf('animales/') < 0; })());
    check('v1.5.33 tutorial: son 6 pasos (los puntos marcan el paso actual)', T26.getTutorialSteps1533().length === 6 && qa('#tutorialCard span').length === 6 && $('tutorialCard').innerHTML.indexOf('Bienvenido a WordRed') >= 0);
    click($('tutorialNext')); await tick();
    check('v1.5.33 tutorial: Siguiente pasa al paso 2', T26.getTutorialIndex1533() === 1 && $('tutorialCard').innerHTML.indexOf('Tu inicio') >= 0);
    click($('tutorialSkip')); await tick();
    check('v1.5.33 tutorial: Saltar lo cierra y marca que ya se vio', !$('tutorialOverlay').classList.contains('on') && st26.settings.tutorialSeen1533 === true);
    T26.maybeShowTutorial1533();
    check('v1.5.33 tutorial: después de Saltar ya no sale solo', !$('tutorialOverlay').classList.contains('on'));
    window.__wrShowTutorial();
    check('v1.5.33 tutorial: desde Ajustes se vuelve a mostrar con Saltar', $('tutorialOverlay').classList.contains('on') && $('tutorialCard').innerHTML.indexOf('Saltar') >= 0);
    click($('tutorialSkip')); await tick();
    window.__wrOpenSettings(); await tick();
    check('v1.5.33 tutorial: en Ajustes está la entrada para verlo otra vez', $('settingsOverlay').innerHTML.indexOf('Ver el tutorial otra vez') >= 0);
    check('v1.5.33 ejemplos: en Ajustes está el interruptor de perfiles de ejemplo', !!$('examplesToggle'));
    click(window.document.querySelector('[data-close="settingsOverlay"]')); await tick();
    // Ejemplos en el inicio, con su insignia.
    T26.go('feed'); await tick();
    check('v1.5.33 ejemplos: en el inicio se ven las publicaciones de ejemplo con su insignia', qa('#feed .demobadge').length >= 4);
    check('v1.5.33 ejemplos: las fotos de ejemplo son neutras (paisajes y objetos), nada de animales (el video es el clip de la ciudad)', (function () { var h = feedHtml26(); return h.indexOf('ejemplo/') >= 0 && h.indexOf('animales/') < 0 && h.indexOf('demo-video') < 0; })());
    // 9 reales -> siguen; 10 reales -> desaparecen.
    for (var r33 = 0; r33 < 9; r33++) C26.createPost(st26, me26, { text: 'Publicación real ' + r33 });
    T26.go('feed'); await tick();
    check('v1.5.33 ejemplos: con 9 publicaciones reales los ejemplos siguen', qa('#feed .demobadge').length >= 4);
    C26.createPost(st26, me26, { text: 'Publicación real 9' });
    T26.go('feed'); await tick();
    check('v1.5.33 ejemplos: con 10 publicaciones reales los ejemplos desaparecen del inicio', qa('#feed .demobadge').length === 0);
    window.__wrOpenSettings(); await tick();
    check('v1.5.33 ejemplos: con 10 reales el interruptor aparece apagado', !!$('examplesToggle') && !$('examplesToggle').checked);
    var tg33 = $('examplesToggle');
    tg33.checked = true;
    tg33.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
    T26.go('feed'); await tick();
    check('v1.5.33 ejemplos: el interruptor los vuelve a mostrar aunque haya 10 reales', st26.settings.examplesOverride === 'show' && qa('#feed .demobadge').length >= 4);
    window.__wrOpenSettings(); await tick();
    var tg33b = $('examplesToggle');
    tg33b.checked = false;
    tg33b.dispatchEvent(new window.Event('change', { bubbles: true })); await tick();
    T26.go('feed'); await tick();
    check('v1.5.33 ejemplos: el interruptor también los oculta a mano', st26.settings.examplesOverride === 'hide' && qa('#feed .demobadge').length === 0);
    click(window.document.querySelector('[data-close="settingsOverlay"]')); await tick();
    // Tiempo: se guarda y sobrevive a cerrar y reabrir.
    st26.screenTime = {};
    C26.recordScreenTime(st26, 45 * 60000, Date.now());
    C26.recordScreenTime(st26, 30 * 60000, Date.now() - 86400000);
    T26.setState(st26);
    T26.reload();
    var st26r = T26.getState();
    check('v1.5.33 tiempo: el tiempo se guarda al cerrar y no se pierde al reabrir', C26.screenTimeTodayMs(st26r) === 45 * 60000, 'hoy=' + C26.screenTimeTodayMs(st26r));
    T26.go('profile'); await tick();
    var t45 = C26.formatScreenTime(45 * 60000);
    var t30 = C26.formatScreenTime(30 * 60000);
    check('v1.5.33 tiempo: las barras de la semana usan los totales reales de cada día', $('ownScreenTime1539').innerHTML.indexOf('Tu tiempo hoy') >= 0 && $('ownScreenTime1539').innerHTML.indexOf(t45) >= 0 && $('ownScreenTime1539').innerHTML.indexOf(t30) >= 0, 'esperado=' + t45 + ' y ' + t30);
    // (34) 1.5.34: 1 sola cuenta de ejemplo (un ejemplo de cada opción) y música automática que sí suena.
    var fresh34 = C26.emptyState();
    C26.seedDemo(fresh34);
    var demos34 = Object.keys(fresh34.profiles).filter(function (k) { return fresh34.profiles[k].isDemo; });
    var dps34 = fresh34.posts.filter(function (p) { return p.isDemo; });
    check('v1.5.34 ejemplos: solo queda 1 cuenta de ejemplo (la oficial)', demos34.length === 1 && demos34[0] === '0000000000', 'cuentas=' + demos34.length);
    check('v1.5.34 ejemplos: 0 cuentas viejas (ni 1000000001 ni 1000000019)', !fresh34.profiles['1000000001'] && !fresh34.profiles['1000000019']);
    check('v1.5.34 ejemplos: un ejemplo de cada opción (foto, video, texto, canción, historia y grupo)', dps34.filter(function (p) { return p.mediaType === 'image' && !p.groupId; }).length >= 1 && dps34.filter(function (p) { return p.mediaType === 'video'; }).length === 1 && dps34.filter(function (p) { return !p.mediaType && !p.song && !p.groupId; }).length >= 1 && dps34.filter(function (p) { return p.song && C26.songHasAudio(p.song); }).length === 1 && fresh34.stories.filter(function (x) { return x.isDemo; }).length === 1 && fresh34.groups.filter(function (g) { return String(g.name || '').indexOf('(ejemplo)') >= 0; }).length === 1 && dps34.some(function (p) { return !!p.groupId; }));
    // En el inicio, con la cuenta única: el video se ve y la canción suena.
    // OJO: st26 quedó obsoleto tras el reload() de la sección 1.5.33
    // (reload crea un objeto nuevo); se usa el estado vivo.
    var stLive34 = T26.getState();
    stLive34.posts = fresh34.posts.slice();
    stLive34.profiles = Object.assign({}, stLive34.profiles, fresh34.profiles);
    stLive34.settings.examplesOverride = '';
    T26.go('feed'); await tick();
    var demoVideoEl = qa('#feed .post').filter(function (el) { return !!el.querySelector('.demobadge') && !!el.querySelector('video'); })[0];
    check('v1.5.34 ejemplos: el video de ejemplo se ve en el inicio (el clip neutro de la ciudad)', !!demoVideoEl && demoVideoEl.innerHTML.indexOf('video-ciudad.mp4') >= 0);
    var demoSongEl = qa('#feed .post').filter(function (el) { return !!el.querySelector('.demobadge') && !!el.querySelector('.songRow'); })[0];
    var demoSongAudio = demoSongEl ? demoSongEl.querySelector('audio') : null;
    var demoSongBtn = demoSongEl ? demoSongEl.querySelector('.songMuteBtn') : null;
    check('v1.5.34 música: la publicación con canción de ejemplo tiene audio real y botón Sonido activo', !!demoSongAudio && demoSongAudio.getAttribute('src') === 'musica/cancion-2.mp3' && !!demoSongBtn && demoSongBtn.disabled === false && demoSongBtn.textContent.indexOf('Sonido') >= 0);
    function wrPauseGetter34(el) { try { Object.defineProperty(el, 'paused', { get: function () { return this._wrPaused !== false; }, configurable: true }); } catch (e) {} }
    if (demoSongAudio) wrPauseGetter34(demoSongAudio);
    var demoSongId = demoSongEl ? demoSongEl.getAttribute('data-post') : null;
    check('v1.5.34 música: al tocar Sonido en la publicación de ejemplo suena su canción', !!demoSongId && T26.toggleSong(demoSongId) === true && !!demoSongAudio && demoSongAudio._wrPlayed === true && !!demoSongBtn && demoSongBtn.textContent.indexOf('Sonando') >= 0);
    // Selector: la vista previa del catálogo ya suena.
    T26.openSongPicker('composer', '');
    var catPreview34 = window.document.querySelector('.songPreviewBtn[data-preview-id="cancion-2"]');
    check('v1.5.34 música: el botón Escuchar de la canción de ejemplo está habilitado', !!catPreview34 && catPreview34.disabled === false);
    wrPauseGetter34(T26.getSongPreviewAudio());
    if (catPreview34) click(catPreview34);
    check('v1.5.34 música: al tocar Escuchar suena la vista previa de la canción de ejemplo', T26.getSongPreviewAudio().getAttribute('src') === 'musica/cancion-2.mp3' && T26.getSongPreviewAudio()._wrPlayed === true && !!catPreview34 && catPreview34.textContent.indexOf('Pausa') >= 0);
    T26.stopSongPreview();
    T26.hideOverlay('songPickerOverlay');
    // Ajustes: el texto dice 1 cuenta (no 20).
    window.__wrOpenSettings(); await tick();
    check('v1.5.34 ejemplos: en Ajustes el texto dice 1 cuenta de ejemplo (no 20)', $('settingsOverlay').innerHTML.indexOf('Cuenta de ejemplo') >= 0 && $('settingsOverlay').innerHTML.indexOf('Perfiles de ejemplo') < 0);
    click(window.document.querySelector('[data-close="settingsOverlay"]')); await tick();
    // Migración: una app con las 20 viejas queda con 1 sola.
    check('v1.5.34 ejemplos: la migración de 20 cuentas a 1 funciona en la app', (function () { var old = C26.emptyState(); old.demoSeeded = true; ['0000000000', '1000000001', '1000000002'].forEach(function (ph) { old.profiles[ph] = { phone: ph, name: 'Viejo', bio: 'Bio', photo: C26.demoAvatarSvg('V', '#111111', '#222222'), cover: C26.demoCoverSvg('#111111', '#222222'), createdAt: Date.now(), isDemo: true, frame: 'none', accent: 'rojo', headerGradient: 'none', job: 'J', education: '', city: 'C', relationship: '', birthday: '', website: '', pinnedPosts: [], sectionPrivacy: { bio: 'Público', friends: 'Público', posts: 'Público' } }; }); var r = C26.ensureDemo1534(old); return r.ok && r.migrated === 1 && Object.keys(old.profiles).filter(function (k) { return old.profiles[k].isDemo; }).length === 1; })());
    // (35) 1.5.35: la música sí suena (ruta musica/) y si falla se avisa, nunca en silencio.
    check('v1.5.35 música: el src de la canción de ejemplo es musica/cancion-2.mp3 (sin prefijo assets/)', !!demoSongAudio && demoSongAudio.getAttribute('src') === 'musica/cancion-2.mp3');
    // Escuchar con play() que falla: el botón vuelve a "Escuchar" y se avisa.
    T26.openSongPicker('composer', '');
    var catPreview35 = window.document.querySelector('.songPreviewBtn[data-preview-id="cancion-2"]');
    var prevAudio35 = T26.getSongPreviewAudio();
    wrPauseGetter34(prevAudio35);
    prevAudio35.play = function () { return Promise.reject(new Error('falla de prueba')); };
    if (catPreview35) click(catPreview35);
    await tick(); await Promise.resolve();
    check('v1.5.35 música: si Escuchar falla, el botón vuelve a "Escuchar" y se avisa', !!catPreview35 && catPreview35.textContent.indexOf('Escuchar') >= 0 && !catPreview35.classList.contains('on') && $('toast').textContent.indexOf('No se pudo reproducir') >= 0);
    // Con la ruta corregida, Escuchar sí suena; y si el audio falla al cargar, también revierte y avisa.
    delete prevAudio35.play;
    if (catPreview35) click(catPreview35);
    await tick();
    check('v1.5.35 música: al tocar Escuchar con la ruta corregida sí suena la vista previa', prevAudio35.getAttribute('src') === 'musica/cancion-2.mp3' && prevAudio35._wrPlayed === true && !!catPreview35 && catPreview35.textContent.indexOf('Pausa') >= 0);
    prevAudio35.dispatchEvent(new window.Event('error'));
    check('v1.5.35 música: si el audio de vista previa falla al cargar, el botón vuelve a "Escuchar" y se avisa', !!catPreview35 && catPreview35.textContent.indexOf('Escuchar') >= 0 && $('toast').textContent.indexOf('No se pudo reproducir') >= 0);
    T26.stopSongPreview();
    T26.hideOverlay('songPickerOverlay');
    // Sonido de la publicación con play() que falla: vuelve a "Sonido" y se avisa.
    T26.toggleSong(demoSongId); // pausar la que quedó sonando en la sección 1.5.34
    demoSongAudio.play = function () { return Promise.reject(new Error('falla de prueba')); };
    T26.toggleSong(demoSongId);
    await tick(); await Promise.resolve();
    check('v1.5.35 música: si Sonido falla, el botón vuelve a "Sonido" y se avisa', !!demoSongBtn && demoSongBtn.textContent.indexOf('Sonido') >= 0 && !demoSongBtn.classList.contains('on') && $('toast').textContent.indexOf('No se pudo reproducir') >= 0);
    delete demoSongAudio.play;
    T26.toggleSong(demoSongId);
    check('v1.5.35 música: con la ruta corregida, Sonido sí suena la canción de ejemplo', !!demoSongAudio && demoSongAudio._wrPlayed === true && !!demoSongBtn && demoSongBtn.textContent.indexOf('Sonando') >= 0);
    demoSongAudio.dispatchEvent(new window.Event('error'));
    check('v1.5.35 música: si el audio de la publicación falla al cargar, el botón vuelve a "Sonido" y se avisa', !!demoSongBtn && demoSongBtn.textContent.indexOf('Sonido') >= 0 && $('toast').textContent.indexOf('No se pudo reproducir') >= 0);
    stLive34.posts = savedPosts33;
    stLive34.profiles = savedProfiles33;
    stLive34.settings.examplesOverride = savedOverride33;
    T26.setState(stLive34);

    // (36) 1.5.36: menú principal con apartados tipo widgets (mantener
    // presionado para editar; lo demás translúcido; agregar apartados).
    const st36 = T26.getState();
    const me36 = st36.me;
    const savedHw36 = JSON.parse(JSON.stringify(T26.homeWidgetsCfg1536()));
    const widget36 = function (id) { return window.document.querySelector('.homeWidget[data-widget="' + id + '"]'); };
    const longPress36 = function (el) { el.dispatchEvent(new window.PointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 10, bubbles: true, cancelable: true })); };
    const cs36 = function (el) { return window.getComputedStyle(el); };
    T26.go('feed'); T26.renderFeed();
    await tick();
    check('v1.5.36 widgets: el inicio trae los 5 apartados y el botón + Agregar', !!widget36('reloj') && !!widget36('clima') && !!widget36('historias') && !!widget36('publicar') && !!widget36('accesos') && !!$('homeAddBtn1536') && !!$('homeEditBar1536'));
    // (36a) Mantener presionado entra al modo de edición.
    longPress36(widget36('reloj'));
    await sleep(650);
    check('v1.5.36 widgets: mantener presionado el reloj entra al modo de edición (barra visible, apartado activo)', window.document.body.classList.contains('hwEditing1536') && widget36('reloj').classList.contains('hwActive') && !$('homeEditBar1536').classList.contains('hidden') && T26.getHwEditingId1536() === 'reloj');
    check('v1.5.36 widgets: al editar, los demás apartados y el resto del inicio quedan translúcidos y solo el editado queda opaco', cs36(widget36('clima')).opacity === '0.35' && cs36(widget36('historias')).opacity === '0.35' && cs36($('feed')).opacity === '0.35' && cs36(widget36('reloj')).opacity === '1');
    // (36b) Salir con Listo lo devuelve todo a la normalidad.
    click($('hwDoneBtn'));
    await tick();
    check('v1.5.36 widgets: con Listo se sale del modo de edición (barra escondida, nada translúcido)', !window.document.body.classList.contains('hwEditing1536') && $('homeEditBar1536').classList.contains('hidden') && T26.getHwEditingId1536() === null && cs36(widget36('clima')).opacity !== '0.35');
    await sleep(1000); // que se acabe el tiempo de seguridad del toque tras el mantener presionado
    // (36c) Un toque normal NO entra al modo de edición y sigue funcionando.
    click($('weatherCard'));
    await tick();
    check('v1.5.36 widgets: un toque normal en el clima NO entra al modo de edición y abre su detalle', !window.document.body.classList.contains('hwEditing1536') && $('weatherOverlay').classList.contains('on'));
    T26.hideOverlay('weatherOverlay');
    // (36d) Reordenar, tamaño y color con la barra de edición.
    // 1.5.41: las historias están fijadas arriba, así que el reorden se
    // prueba con el reloj (de la 3ª a la 2ª posición); el tamaño y el
    // color se siguen probando en las historias.
    longPress36(widget36('reloj'));
    await sleep(650);
    click($('hwMoveUp'));
    await tick();
    check('v1.5.36 widgets: Subir mueve el apartado un lugar arriba (y se guarda)', T26.homeWidgetsCfg1536().order[1] === 'reloj' && T26.homeWidgetsCfg1536().order[2] === 'publicar' && T26.getState().homeWidgets1536.order[1] === 'reloj');
    click($('hwDoneBtn'));
    await tick();
    longPress36(widget36('historias'));
    await sleep(650);
    click($('hwSizeBtn'));
    await tick();
    check('v1.5.36 widgets: Tamaño cambia el tamaño (m→l) y se guarda', T26.homeWidgetsCfg1536().sizes.historias === 'l' && widget36('historias').getAttribute('data-size') === 'l');
    click($('hwColorBtn'));
    await tick();
    check('v1.5.36 widgets: Color cambia el color (rojo→azul) y se guarda', T26.homeWidgetsCfg1536().colors.historias === 'azul' && widget36('historias').getAttribute('data-color') === 'azul');
    click($('hwDoneBtn'));
    await tick();
    // (36e) Agregar apartados: la hoja muestra los 7 disponibles.
    click($('homeAddBtn1536'));
    await tick();
    check('v1.5.36 widgets: el botón + abre la hoja con los 7 apartados agregables', $('homeAddOverlay1536').classList.contains('on') && qa('#homeAddList1536 [data-hw-add]').length === 7);
    // Calendario: muestra el mes actual y marca hoy.
    click(window.document.querySelector('#homeAddList1536 [data-hw-add="calendario"]'));
    await tick();
    const months36 = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    check('v1.5.36 widgets: agregar calendario lo pone en el inicio con el mes actual y hoy marcado', !!widget36('calendario') && T26.homeWidgetsCfg1536().added.indexOf('calendario') >= 0 && widget36('calendario').textContent.indexOf(months36[new Date().getMonth()]) >= 0 && !!widget36('calendario').querySelector('.hwToday'));
    T26.hideOverlay('homeAddOverlay1536');
    // Calculadora: calcula de verdad (2+3=5 y 2+3×4=14).
    click($('homeAddBtn1536')); await tick();
    click(window.document.querySelector('#homeAddList1536 [data-hw-add="calculadora"]'));
    await tick();
    const calcKey36 = function (k) { var b = window.document.querySelector('[data-calc-key="' + k + '"]'); if (b) click(b); };
    const calcDisp36 = function () { var d = window.document.querySelector('[data-calc-display]'); return d ? d.textContent : ''; };
    calcKey36('2'); calcKey36('+'); calcKey36('3'); calcKey36('=');
    await tick();
    check('v1.5.36 widgets: la calculadora calcula (2+3=5)', calcDisp36() === '5');
    calcKey36('C'); calcKey36('2'); calcKey36('+'); calcKey36('3'); calcKey36('×'); calcKey36('4'); calcKey36('=');
    await tick();
    check('v1.5.36 widgets: la calculadora respeta la precedencia (2+3×4=14)', calcDisp36() === '14');
    T26.hideOverlay('homeAddOverlay1536');
    // Mensajería: cuenta los sin leer y abre los mensajes.
    st36.profiles['1000000002'] = { phone: '1000000002', name: 'Bruno Prueba', photo: '', bio: 'Amigo de pruebas' };
    C26.sendMessage(st36, '1000000002', me36, 'Hola 36');
    click($('homeAddBtn1536')); await tick();
    click(window.document.querySelector('#homeAddList1536 [data-hw-add="mensajeria"]'));
    await tick();
    check('v1.5.36 widgets: mensajería muestra 1 mensaje sin leer', !!widget36('mensajeria') && widget36('mensajeria').textContent.indexOf('1 mensaje sin leer') >= 0);
    click(widget36('mensajeria').querySelector('[data-hw-open-messages]'));
    await tick();
    check('v1.5.36 widgets: el botón de mensajería abre los mensajes', $('view-messages').classList.contains('on'));
    T26.go('feed'); T26.renderFeed(); await tick();
    T26.hideOverlay('homeAddOverlay1536');
    // Fotos: muestra mis fotos y abre la publicación al tocarla.
    const foto36 = C26.createPost(st36, me36, { text: 'Foto 36', media: 'https://srv/foto36.jpg', mediaType: 'image', privacy: 'Público' });
    click($('homeAddBtn1536')); await tick();
    click(window.document.querySelector('#homeAddList1536 [data-hw-add="fotos"]'));
    await tick();
    const fotoImg36 = foto36 && foto36.ok ? widget36('fotos').querySelector('img[src="https://srv/foto36.jpg"]') : null;
    check('v1.5.36 widgets: fotos muestra mis fotos publicadas', !!fotoImg36);
    if (fotoImg36) click(fotoImg36);
    await tick();
    check('v1.5.36 widgets: tocar una foto abre su publicación', $('postOverlay').classList.contains('on'));
    T26.hideOverlay('postOverlay');
    T26.hideOverlay('homeAddOverlay1536');
    // Batería: muestra el nivel real cuando llega.
    click($('homeAddBtn1536')); await tick();
    click(window.document.querySelector('#homeAddList1536 [data-hw-add="bateria"]'));
    await tick();
    calls.batteryStatus = { level: 72, charging: false };
    window.__onBatteryStatus({ level: 72, charging: false });
    await tick();
    check('v1.5.36 widgets: batería muestra el nivel real (72%)', !!widget36('bateria') && widget36('bateria').textContent.indexOf('72') >= 0);
    T26.hideOverlay('homeAddOverlay1536');
    // Tiempo en pantalla: muestra el tiempo de hoy.
    click($('homeAddBtn1536')); await tick();
    click(window.document.querySelector('#homeAddList1536 [data-hw-add="tiempo"]'));
    await tick();
    check('v1.5.36 widgets: tiempo muestra el tiempo de hoy en pantalla', !!widget36('tiempo') && widget36('tiempo').textContent.indexOf(C26.formatScreenTime(C26.screenTimeTodayMs(T26.getState()))) >= 0);
    T26.hideOverlay('homeAddOverlay1536');
    // Notas: se guarda y se borra.
    click($('homeAddBtn1536')); await tick();
    click(window.document.querySelector('#homeAddList1536 [data-hw-add="notas"]'));
    await tick();
    const noteInput36 = $('hwNoteInput1536');
    if (noteInput36) noteInput36.value = 'Comprar pan';
    click(window.document.querySelector('[data-hw-note-add]'));
    await tick();
    check('v1.5.36 widgets: una nota se guarda y se ve en el apartado', !!widget36('notas') && widget36('notas').textContent.indexOf('Comprar pan') >= 0 && T26.homeWidgetsCfg1536().notes.some(function (n) { return n.text === 'Comprar pan'; }));
    click(window.document.querySelector('[data-hw-note-del]'));
    await tick();
    check('v1.5.36 widgets: la nota se borra del apartado y de la configuración', widget36('notas').textContent.indexOf('Comprar pan') < 0 && T26.homeWidgetsCfg1536().notes.length === 0);
    T26.hideOverlay('homeAddOverlay1536');
    // (36f) Persistencia: al recargar, orden, tamaño, color y agregados sobreviven.
    T26.reload(); T26.applyHomeWidgets1536(); await tick();
    const cfg36 = T26.homeWidgetsCfg1536();
    check('v1.5.36 widgets: al reabrir, el orden, el tamaño y el color se mantienen', cfg36.order[0] === 'historias' && cfg36.order[1] === 'reloj' && cfg36.sizes.historias === 'l' && cfg36.colors.historias === 'azul' && ['calendario', 'calculadora', 'mensajeria', 'fotos', 'bateria', 'tiempo', 'notas'].every(function (id) { return cfg36.added.indexOf(id) >= 0; }));
    check('v1.5.36 widgets: al reabrir, los apartados agregados siguen en el inicio', ['calendario', 'calculadora', 'mensajeria', 'fotos', 'bateria', 'tiempo', 'notas'].every(function (id) { return !!widget36(id); }));
    // Limpieza: devolver el menú a como estaba y quitar los datos de prueba.
    const st36b = T26.getState();
    st36b.homeWidgets1536 = savedHw36;
    if (foto36 && foto36.ok) st36b.posts = st36b.posts.filter(function (p) { return p.id !== foto36.post.id; });
    Object.keys(st36b.conversations || {}).forEach(function (k) { if (st36b.conversations[k].participants.indexOf('1000000002') >= 0) delete st36b.conversations[k]; });
    delete st36b.profiles['1000000002'];
    T26.setState(st36b);
    T26.exitHomeWidgetEdit1536();
    T26.applyHomeWidgets1536();
    T26.go('feed'); T26.renderFeed();

    // (37) 1.5.37: el reloj y la fecha caben dentro de su recuadro en los
    // tres tamaños; el rayo de carga va dentro del símbolo de batería.
    const cs37 = function (el) { return window.getComputedStyle(el); };
    const clock37 = function () { return window.document.querySelector('.weatherClock'); };
    T26.go('feed'); T26.renderFeed(); await tick();
    // (37a) En s (el tamaño por defecto del reloj): la tarjeta y el reloj
    // pueden encogerse y la hora no se parte.
    check('v1.5.37 reloj: en s la tarjeta del reloj tiene min-width 0 (antes 170 px)', cs37($('weatherTimeCard')).minWidth === '0px');
    check('v1.5.37 reloj: en s el reloj puede encogerse (flex-shrink 1, min-width 0)', cs37(clock37()).flexShrink === '1' && cs37(clock37()).minWidth === '0px');
    check('v1.5.37 reloj: en s la hora es 39 px y no se parte en dos líneas', cs37($('weatherTime')).fontSize === '39px' && cs37($('weatherTime')).whiteSpace === 'nowrap');
    check('v1.5.37 reloj: el apartado del reloj no se deforma (overflow hidden)', cs37(widget36('reloj')).overflow === 'hidden');
    // La fecha más larga posible cabe (envuelve dentro del recuadro).
    // Sin await entre poner el texto y comprobarlo: el reloj se actualiza
    // cada segundo y reescribiría la fecha con la de hoy.
    $('weatherTime').textContent = '23:59';
    $('weatherDate').textContent = 'miércoles, 30 de septiembre de 2026';
    check('v1.5.37 reloj: con la fecha más larga, la fecha envuelve dentro del recuadro', cs37($('weatherDate')).overflowWrap === 'break-word' && $('weatherDate').textContent.indexOf('septiembre') >= 0);
    // (37b) En m y l la hora crece pero la tarjeta y el reloj siguen pudiendo encogerse.
    T26.homeWidgetsCfg1536().sizes.reloj = 'm'; T26.applyHomeWidgets1536(); await tick();
    check('v1.5.37 reloj: en m la hora es 64 px y la tarjeta sigue con min-width 0', cs37($('weatherTime')).fontSize === '64px' && cs37($('weatherTimeCard')).minWidth === '0px' && cs37(clock37()).flexShrink === '1');
    T26.homeWidgetsCfg1536().sizes.reloj = 'l'; T26.applyHomeWidgets1536(); await tick();
    check('v1.5.37 reloj: en l la hora es 89 px y la tarjeta sigue con min-width 0', cs37($('weatherTime')).fontSize === '89px' && cs37($('weatherTimeCard')).minWidth === '0px' && cs37(clock37()).flexShrink === '1');
    T26.homeWidgetsCfg1536().sizes.reloj = 's'; T26.applyHomeWidgets1536(); await tick();
    check('v1.5.37 reloj: al volver a s la hora vuelve a 39 px', cs37($('weatherTime')).fontSize === '39px');
    // (37c) El clima no tiene el mismo problema: su tarjeta ya era min-width 0.
    check('v1.5.37 clima: la tarjeta del clima tiene min-width 0 (sin cambio)', cs37($('weatherCard')).minWidth === '0px');
    // (37d) Batería: el rayo va dentro del símbolo; el indicador mide lo
    // mismo cargando que sin cargar (mismo svg 25×12 y un solo texto %).
    const ind37 = function () { return $('batteryInd'); };
    T26.setBatteryStatus(72, false); await tick();
    const off37 = ind37().innerHTML;
    check('v1.5.37 batería: sin cargar no hay rayo y el icono es 25×12 con el %', off37.indexOf('M13.8') < 0 && off37.indexOf('width="25"') >= 0 && ind37().querySelectorAll('span').length === 1 && ind37().textContent.indexOf('72%') >= 0);
    T26.setBatteryStatus(72, true); await tick();
    const on37 = ind37().innerHTML;
    check('v1.5.37 batería: cargando el rayo está dentro del símbolo (mismo svg, sin icono aparte)', on37.indexOf('M13.8') >= 0 && on37.indexOf('width="25"') >= 0 && ind37().querySelectorAll('span').length === 1 && ind37().textContent.indexOf('72%') >= 0);
    check('v1.5.37 batería: cargando y sin cargar el indicador tiene la misma estructura (svg 25 + %, mismo tamaño)', (function () { T26.setBatteryStatus(72, false); var a = ind37().children.length; var sa = ind37().querySelector('svg').getAttribute('width'); T26.setBatteryStatus(72, true); var b = ind37().children.length; var sb = ind37().querySelector('svg').getAttribute('width'); return a === b && a === 2 && sa === '25' && sb === '25'; })());
    // El apartado de batería dice Cargando y el nivel real no cambia.
    click($('homeAddBtn1536')); await tick();
    click(window.document.querySelector('#homeAddList1536 [data-hw-add="bateria"]')); await tick();
    T26.setBatteryStatus(72, true); await tick();
    check('v1.5.37 batería: el apartado dice Cargando y muestra el nivel real (72%)', !!widget36('bateria') && widget36('bateria').textContent.indexOf('Cargando') >= 0 && widget36('bateria').textContent.indexOf('72') >= 0);
    T26.hideOverlay('homeAddOverlay1536');
    // Limpieza de la (37): quitar el apartado de batería y dejar el nivel sin cargar.
    const st37 = T26.getState();
    st37.homeWidgets1536.added = st37.homeWidgets1536.added.filter(function (id) { return id !== 'bateria'; });
    T26.setState(st37); T26.applyHomeWidgets1536();
    T26.setBatteryStatus(72, false);
    T26.go('feed'); T26.renderFeed(); await tick();

    // (38) 1.5.38: los botones de editar y las opciones al hacer algo
    // usan el estilo de los iconos del perfil propio (40 px, redondos,
    // fondo translúcido y borde fino). Con texto donde haga falta
    // (Listo) y puro icono donde no.
    const cs38 = function (el) { return window.getComputedStyle(el); };
    // (38a) El botón del perfil como referencia: 40 px, redondo, mismo
    // fondo y borde.
    T26.go('profile'); await tick();
    const ownBtn38 = window.document.querySelector('.ownIconBtn');
    const ownStyle38 = ownBtn38 ? { w: cs38(ownBtn38).width, h: cs38(ownBtn38).height, r: cs38(ownBtn38).borderRadius, bg: cs38(ownBtn38).backgroundColor, bc: cs38(ownBtn38).borderTopColor } : null;
    check('v1.5.38 perfil: el botón del perfil es de 40 px, redondo, fondo translúcido y borde fino', !!ownBtn38 && ownStyle38.w === '40px' && ownStyle38.h === '40px' && ownStyle38.r === '50%' && ownStyle38.bg === 'rgba(255, 255, 255, 0.08)' && ownStyle38.bc === 'rgba(255, 255, 255, 0.14)');
    T26.go('feed'); T26.renderFeed(); await tick();
    // (38b) La barra de edición: los botones copian ese estilo.
    longPress36(widget36('reloj'));
    await sleep(650);
    check('v1.5.38 barra: Subir, Bajar, Tamaño y Color son círculos de 40 px como los del perfil', ['hwMoveUp', 'hwMoveDown', 'hwSizeBtn', 'hwColorBtn'].every(function (id) { var b = $(id); return cs38(b).width === '40px' && cs38(b).height === '40px' && cs38(b).borderRadius === '50%' && cs38(b).backgroundColor === ownStyle38.bg && cs38(b).borderTopColor === ownStyle38.bc; }));
    check('v1.5.38 barra: Subir y Bajar son solo icono (sin texto)', $('hwMoveUp').textContent.trim() === '' && $('hwMoveDown').textContent.trim() === '' && !!$('hwMoveUp').querySelector('svg') && !!$('hwMoveDown').querySelector('svg'));
    check('v1.5.38 barra: Quitar es solo icono (sin texto)', $('hwRemoveBtn').textContent.trim() === '' && !!$('hwRemoveBtn').querySelector('svg'));
    check('v1.5.38 barra: Listo es el único con texto y mide 40 px de alto', $('hwDoneBtn').textContent.trim() === 'Listo' && cs38($('hwDoneBtn')).height === '40px' && cs38($('hwDoneBtn')).backgroundColor === ownStyle38.bg && cs38($('hwDoneBtn')).borderTopColor === ownStyle38.bc);
    // Tamaño muestra la letra del tamaño actual y cambia al tocarlo.
    check('v1.5.38 barra: Tamaño muestra la letra S del tamaño actual (reloj en s)', $('hwSizeBtn').querySelector('.hwSizeLetter').textContent === 'S' && $('hwSizeBtn').getAttribute('title') === 'Tamaño: Pequeño');
    click($('hwSizeBtn'));
    await tick();
    check('v1.5.38 barra: al tocar Tamaño la letra cambia a M y el tamaño se guarda (s→m)', $('hwSizeBtn').querySelector('.hwSizeLetter').textContent === 'M' && T26.homeWidgetsCfg1536().sizes.reloj === 'm' && widget36('reloj').getAttribute('data-size') === 'm');
    click($('hwSizeBtn'));
    await tick();
    check('v1.5.38 barra: al tocar otra vez la letra cambia a L (m→l)', $('hwSizeBtn').querySelector('.hwSizeLetter').textContent === 'L' && T26.homeWidgetsCfg1536().sizes.reloj === 'l');
    // Color muestra el punto con el color actual y cambia al tocarlo.
    check('v1.5.38 barra: Color muestra el punto rojo del color actual', !!$('hwColorBtn').querySelector('.hwColorDot') && $('hwColorBtn').style.getPropertyValue('--hwColorDot') === '#e01430' && $('hwColorBtn').getAttribute('title') === 'Color: Rojo');
    click($('hwColorBtn'));
    await tick();
    check('v1.5.38 barra: al tocar Color el punto cambia a azul y el color se guarda (rojo→azul)', $('hwColorBtn').style.getPropertyValue('--hwColorDot') === '#2563eb' && T26.homeWidgetsCfg1536().colors.reloj === 'azul' && widget36('reloj').getAttribute('data-color') === 'azul');
    // Quitar: escondido en los de serie, visible en los agregados.
    check('v1.5.38 barra: Quitar está escondido en los apartados de serie (reloj)', $('hwRemoveBtn').classList.contains('hidden'));
    // La regla translúcida sigue igual mientras se edita.
    check('v1.5.38 translúcido: al editar, lo demás queda .35 y solo el editado opaco', cs38(widget36('clima')).opacity === '0.35' && cs38(widget36('reloj')).opacity === '1');
    click($('hwDoneBtn'));
    await tick();
    // (38c) La hoja de agregar: el + es un botón redondo estilo perfil.
    click($('homeAddBtn1536'));
    await tick();
    check('v1.5.38 hoja: la hoja muestra los 7 apartados, cada fila con un + redondo de 40 px estilo perfil', qa('#homeAddList1536 [data-hw-add]').length === 7 && Array.prototype.slice.call(window.document.querySelectorAll('#homeAddList1536 .hwAddPlus1538')).length === 7 && Array.prototype.slice.call(window.document.querySelectorAll('#homeAddList1536 .hwAddPlus1538')).every(function (p) { return cs38(p).width === '40px' && cs38(p).height === '40px' && cs38(p).borderRadius === '50%' && cs38(p).backgroundColor === ownStyle38.bg && !!p.querySelector('svg'); }));
    check('v1.5.38 hoja: ya no hay texto «+ Agregar» en las filas', $('homeAddList1536').textContent.indexOf('+ Agregar') < 0);
    // Tocar una fila sigue agregando el apartado.
    click(window.document.querySelector('#homeAddList1536 [data-hw-add="calendario"]'));
    await tick();
    check('v1.5.38 hoja: tocar una fila agrega el apartado igual que antes', !!widget36('calendario') && T26.homeWidgetsCfg1536().added.indexOf('calendario') >= 0);
    T26.hideOverlay('homeAddOverlay1536');
    // Quitar visible en un agregado: mantener presionado el calendario.
    longPress36(widget36('calendario'));
    await sleep(650);
    check('v1.5.38 barra: Quitar se ve en los apartados agregados (calendario) y es un círculo de 40 px', !$('hwRemoveBtn').classList.contains('hidden') && cs38($('hwRemoveBtn')).width === '40px' && cs38($('hwRemoveBtn')).height === '40px' && cs38($('hwRemoveBtn')).borderRadius === '50%');
    click($('hwDoneBtn'));
    await tick();
    await sleep(1000);
    // Limpieza de la (38): devolver el menú a como estaba.
    const st38 = T26.getState();
    st38.homeWidgets1536 = savedHw36;
    T26.setState(st38);
    T26.exitHomeWidgetEdit1536();
    T26.applyHomeWidgets1536();
    T26.go('feed'); T26.renderFeed(); await tick();

    // (39) 1.5.39: los 4 atajos del perfil propio en una sola fila
    // (Shorts guardados, Programadas, Borradores, Enlaces guardados).
    T26.go('profile'); await tick();
    const row39 = window.document.querySelector('.profileShortcuts1539');
    const btns39 = row39 ? Array.prototype.slice.call(row39.querySelectorAll('.profileShortcutBtn1539')) : [];
    check('v1.5.39 fila: la fila de atajos existe con los 4 botones en orden', !!row39 && btns39.length === 4 && btns39.map(function (b) { return b.textContent.trim(); }).join('|') === 'Shorts guardados|Programadas|Borradores|Enlaces guardados');
    check('v1.5.39 fila: la fila no envuelve (nowrap) y los botones no parten el texto (10.5 px)', !!row39 && cs38(row39).flexWrap === 'nowrap' && btns39.every(function (b) { var c = cs38(b); return c.whiteSpace === 'nowrap' && c.fontSize === '10.5px'; }));
    check('v1.5.39 fila: cada botón abre su vista (onclick intactos)', btns39.length === 4 && btns39[0].getAttribute('onclick').indexOf('__wrOpenSavedShorts') >= 0 && btns39[1].getAttribute('onclick').indexOf('__wrOpenScheduled') >= 0 && btns39[2].getAttribute('onclick').indexOf('__wrOpenDrafts') >= 0 && btns39[3].getAttribute('onclick').indexOf('__wrOpenSavedLinks') >= 0);
    click(btns39[1]); await tick();
    check('v1.5.39 fila: Programadas abre su vista', $('scheduledOverlay').classList.contains('on'));
    T26.hideOverlay('scheduledOverlay');
    click(btns39[2]); await tick();
    check('v1.5.39 fila: Borradores abre su vista', $('draftsOverlay').classList.contains('on'));
    T26.hideOverlay('draftsOverlay');
    click(btns39[3]); await tick();
    check('v1.5.39 fila: Enlaces guardados abre su vista', $('savedLinksOverlay').classList.contains('on'));
    T26.hideOverlay('savedLinksOverlay');
    const pShort39 = C26.createPost(st26, me26, { text: 'Short de prueba 1539', media: 'https://x.com/video.mp4', mediaType: 'video' });
    C26.toggleSave(st26, me26, pShort39.post.id);
    click(btns39[0]); await tick();
    check('v1.5.39 fila: Shorts guardados abre el visor de Shorts', $('shortsOverlay') && $('shortsOverlay').classList.contains('on'));
    T26.hideOverlay('shortsOverlay');
    C26.toggleSave(st26, me26, pShort39.post.id);
    C26.deletePost(st26, me26, pShort39.post.id);
    // (39b) 1.5.39: "Tu tiempo hoy" justo antes de "Tienda de juegos".
    check('v1.5.39 tiempo: "Tu tiempo hoy" ya no está arriba en el perfil propio (ni en #ownProfile)', $('ownProfile').innerHTML.indexOf('Tu tiempo hoy') < 0);
    check('v1.5.39 tiempo: "Tu tiempo hoy" va en su hueco ownScreenTime1539, con el tiempo de hoy y las barras de la semana', !!$('ownScreenTime1539') && $('view-profile').contains($('ownScreenTime1539')) && $('ownScreenTime1539').innerHTML.indexOf('Tu tiempo hoy') >= 0 && $('ownScreenTime1539').innerHTML.indexOf('Se reinicia a medianoche') >= 0 && $('ownScreenTime1539').innerHTML.indexOf('lun') >= 0 && $('ownScreenTime1539').innerHTML.indexOf('dom') >= 0);
    check('v1.5.39 tiempo: el hueco está justo antes de "Tienda de juegos" (después de las grabaciones de lives)', (function () { var el = $('ownScreenTime1539'); return !!el && el.previousElementSibling && el.previousElementSibling.id === 'liveRecordingsSection' && el.nextElementSibling && el.nextElementSibling.id === 'gamesSection'; })());
    check('v1.5.39 tiempo: el tiempo de hoy sigue igual en la tarjeta (mismo conteo, por teléfono)', $('ownScreenTime1539').innerHTML.indexOf(C26.formatScreenTime(C26.screenTimeTodayMs(st26, Date.now()))) >= 0);
    T26.go('feed'); T26.renderFeed(); await tick();

    // (40) 1.5.40: Reels mucho más grandes y cartelera «Próximos estrenos».
    T26.go('feed'); T26.renderFeed(); await tick(); await tick();
    var reelTile40 = qa('#feed .reelTile')[0];
    var reelCs40 = reelTile40 ? window.getComputedStyle(reelTile40) : null;
    check('v1.5.40 Reels: la tarjeta es mucho más grande (264x400, el doble que 132x200)', !!reelCs40 && reelCs40.flexBasis === '264px' && reelCs40.height === '400px', reelCs40 && (reelCs40.flexBasis + 'x' + reelCs40.height));
    check('v1.5.40 Reels: la fila sigue siendo horizontal con desplazamiento lateral', !!q('#feed .reels') && window.getComputedStyle(q('#feed .reels')).overflowX === 'auto');
    check('v1.5.40 Reels: al tocar un reel sigue abriéndose como Short', (function () { var tiles = qa('#feed .reelTile'); if (!tiles.length) return false; click(tiles[0]); return $('shortsOverlay') && $('shortsOverlay').classList.contains('on'); })());
    if ($('shortsOverlay') && $('shortsOverlay').classList.contains('on') && $('shortsClose')) click($('shortsClose'));
    var story40 = q('#storiesRow .homeReel1549');
    var storyCs40 = story40 ? window.getComputedStyle(story40) : null;
    var storyRect40 = q('#storiesRow .homeReelRect1560');
    check('1.5.60 reels: la fila de arriba ya son reels (1.5.54): rectángulos de 150 px, esquinas 18 px', !!storyCs40 && storyCs40.width === '150px' && !!storyRect40 && window.getComputedStyle(storyRect40).borderRadius === '18px', storyCs40 && storyCs40.width);
    var billboard40 = q('#feed #billboard1540');
    check('v1.5.40 cartelera: la sección «Próximos estrenos» existe en el inicio', !!billboard40 && billboard40.textContent.indexOf('Próximos estrenos') >= 0);
    check('v1.5.40 cartelera: el logo de cine (claqueta) va arriba de la primera película', !!billboard40 && !!billboard40.querySelector('.billboardHead1540 .billboardIcon1540 svg'));
    check('v1.5.40 cartelera: la app pinta la lista del servidor (no la fija)', !!billboard40 && billboard40.textContent.indexOf('Película de prueba 1') >= 0 && billboard40.textContent.indexOf('Película de prueba 2') >= 0 && billboard40.textContent.indexOf('Los juegos del hambre') < 0);
    var movieCards40 = qa('#feed .movieCard1540');
    check('v1.5.40 cartelera: cada película es un rectángulo grande con portada, título y fecha', movieCards40.length === 2 && movieCards40.every(function (c) { var cs = window.getComputedStyle(c); return cs.flexBasis === '220px' && !!c.querySelector('.moviePoster1540 img') && !!c.querySelector('.movieTitle1540') && c.textContent.indexOf('Estreno:') >= 0; }), 'tarjetas=' + movieCards40.length);
    check('v1.5.40 cartelera: la que ya está en cines lleva la marca «Ya en cines»', movieCards40.length === 2 && movieCards40[1].textContent.indexOf('Ya en cines') >= 0 && movieCards40[0].textContent.indexOf('Ya en cines') < 0);
    check('v1.5.40 cartelera: la fila es horizontal con desplazamiento lateral', !!billboard40 && !!q('#feed .movies1540') && window.getComputedStyle(q('#feed .movies1540')).overflowX === 'auto');
    var feedKids40 = Array.prototype.slice.call($('feed').children);
    var bbIdx40 = feedKids40.indexOf(billboard40);
    var postCount40 = qa('#feed .post').length;
    var postsBefore40 = feedKids40.slice(0, bbIdx40).filter(function (el) { return el.classList.contains('post'); }).length;
    var postsAfter40 = feedKids40.slice(bbIdx40 + 1).filter(function (el) { return el.classList.contains('post'); }).length;
    check('v1.5.40 cartelera: va después de la 5ª publicación (o al final si hay menos de 5)', postsBefore40 === Math.min(5, postCount40) && (postCount40 <= 5 || postsAfter40 >= 1), 'antes=' + postsBefore40 + ' después=' + postsAfter40 + ' publicaciones=' + postCount40);
    click(movieCards40[0]);
    check('v1.5.40 cartelera: al tocar una película se abre su tráiler real en YouTube', calls.openExternalUrl.some(function (u) { return u.indexOf('https://www.youtube.com/watch?v=AAAAAAAAAAA') >= 0; }), 'urls=' + calls.openExternalUrl.join(','));
    // Sin conexión: la lista fija con el aviso de sin actualizar.
    window.localStorage.removeItem('wordred_billboard1540');
    var realFetch40 = window.fetch;
    window.fetch = async () => { throw new Error('sin conexión'); };
    T26.go('feed'); T26.renderFeed(); await tick(); await tick();
    var bbFallback40 = q('#feed #billboard1540');
    check('v1.5.40 cartelera: sin conexión pinta la lista fija (6 películas reales) y avisa que está sin actualizar', !!bbFallback40 && bbFallback40.textContent.indexOf('Los juegos del hambre: Amanecer en la cosecha') >= 0 && bbFallback40.textContent.indexOf('Ebenezer: Los fantasmas de Navidad') >= 0 && qa('#feed .movieCard1540').length === 6 && bbFallback40.textContent.indexOf('sin actualizar') >= 0);
    window.fetch = realFetch40;
    // Caché de 1 día: con una caché fresca no se pide nada y se pinta lo guardado.
    window.localStorage.setItem('wordred_billboard1540', JSON.stringify({ at: Date.now(), movies: [{ title: 'Película en caché', date: '9 sep 2027', poster: 'https://image.tmdb.org/t/p/w500/cache.jpg', trailer: 'https://www.youtube.com/watch?v=CCCCCCCCCCC', now: false }] }));
    T26.go('feed'); T26.renderFeed(); await tick();
    var bbCache40 = q('#feed #billboard1540');
    check('v1.5.40 cartelera: con caché fresca se pinta lo guardado sin pedir al servidor', !!bbCache40 && bbCache40.textContent.indexOf('Película en caché') >= 0 && bbCache40.textContent.indexOf('Película de prueba 1') < 0);
    window.localStorage.removeItem('wordred_billboard1540');
    T26.go('feed'); T26.renderFeed(); await tick();

    // (41) 1.5.41: las historias siempre arriba (fijadas), publicar en
    // medio, reloj y clima lado a lado debajo.
    T26.go('feed'); T26.renderFeed(); await tick();
    const hwOrder41 = function () { return Array.prototype.slice.call(window.document.querySelectorAll('#homeWidgets1536 .homeWidget[data-widget]')).map(function (w) { return w.getAttribute('data-widget'); }); };
    check('v1.5.41 orden: el inicio trae los apartados en el orden historias, publicar, reloj, clima, accesos', JSON.stringify(hwOrder41()) === JSON.stringify(['historias', 'publicar', 'reloj', 'clima', 'accesos']) && JSON.stringify(T26.homeWidgetsCfg1536().order) === JSON.stringify(['historias', 'publicar', 'reloj', 'clima', 'accesos']), hwOrder41().join(','));
    check('v1.5.41 orden: publicar está entre las historias y el reloj/clima (el cuadro «¿Qué estás pensando?»)', hwOrder41()[1] === 'publicar' && !!widget36('publicar') && widget36('publicar').textContent.indexOf('¿Qué estás pensando?') >= 0);
    check('v1.5.41 orden: reloj y clima son tamaño s y van lado a lado (el clima justo después del reloj)', widget36('reloj').getAttribute('data-size') === 's' && widget36('clima').getAttribute('data-size') === 's' && widget36('reloj').nextElementSibling === widget36('clima') && window.getComputedStyle(widget36('reloj')).flexBasis === 'calc(50% - 6px)' && window.getComputedStyle(widget36('clima')).flexBasis === 'calc(50% - 6px)', 'reloj=' + window.getComputedStyle(widget36('reloj')).flexBasis + ' clima=' + window.getComputedStyle(widget36('clima')).flexBasis);
    check('v1.5.41 orden: las historias ocupan toda la fila (tamaño m) y publicar también', widget36('historias').getAttribute('data-size') === 'm' && widget36('publicar').getAttribute('data-size') === 'm' && window.getComputedStyle(widget36('historias')).flexBasis === '100%' && window.getComputedStyle(widget36('publicar')).flexBasis === '100%');
    // (41a) La normalización sube las historias a primer lugar aunque la
    // configuración guardada las traiga en otro lugar.
    const savedHw41 = JSON.parse(JSON.stringify(T26.homeWidgetsCfg1536()));
    const st41 = T26.getState();
    st41.homeWidgets1536 = { order: ['reloj', 'clima', 'historias', 'publicar', 'accesos'], sizes: { reloj: 's', clima: 's', historias: 'm', publicar: 'm', accesos: 'm' }, colors: {}, added: [], notes: [] };
    T26.setState(st41);
    T26.applyHomeWidgets1536(); T26.go('feed'); T26.renderFeed(); await tick();
    check('v1.5.41 fijadas: una configuración guardada con las historias en otro lugar se normaliza (suben a primer lugar)', T26.homeWidgetsCfg1536().order[0] === 'historias' && hwOrder41()[0] === 'historias' && JSON.stringify(T26.homeWidgetsCfg1536().order) === JSON.stringify(['historias', 'reloj', 'clima', 'publicar', 'accesos']), hwOrder41().join(','));
    // (41b) En edición, Bajar está deshabilitado para las historias y
    // Subir para el apartado justo debajo de ellas.
    longPress36(widget36('reloj'));
    await sleep(650);
    check('v1.5.41 fijadas: al editar el apartado justo debajo de las historias, Subir está deshabilitado (no puede pasar por encima)', $('hwMoveUp').disabled === true && $('hwMoveDown').disabled === false);
    click($('hwMoveUp'));
    await tick();
    check('v1.5.41 fijadas: tocar Subir en el reloj no lo mueve por encima de las historias', hwOrder41()[0] === 'historias' && hwOrder41()[1] === 'reloj' && T26.homeWidgetsCfg1536().order[1] === 'reloj');
    click($('hwMoveDown'));
    await tick();
    check('v1.5.41 fijadas: Bajar en el reloj sí funciona (baja un lugar, las historias siguen primeras)', hwOrder41()[0] === 'historias' && hwOrder41()[1] === 'clima' && hwOrder41()[2] === 'reloj' && T26.homeWidgetsCfg1536().order[2] === 'reloj');
    click($('hwDoneBtn'));
    await tick();
    longPress36(widget36('historias'));
    await sleep(650);
    check('v1.5.41 fijadas: al editar las historias, Bajar está deshabilitado y Subir también (ya están arriba)', $('hwMoveDown').disabled === true && $('hwMoveUp').disabled === true);
    click($('hwMoveDown'));
    await tick();
    check('v1.5.41 fijadas: tocar Bajar en las historias no las mueve (siguen primeras)', hwOrder41()[0] === 'historias' && T26.homeWidgetsCfg1536().order[0] === 'historias');
    click($('hwDoneBtn'));
    await tick();
    // (41c) Mover un apartado normal sigue funcionando.
    longPress36(widget36('reloj'));
    await sleep(650);
    click($('hwMoveUp'));
    await tick();
    check('v1.5.41 fijadas: mover el reloj hacia arriba sí funciona (las historias siguen primeras)', hwOrder41()[0] === 'historias' && hwOrder41()[1] === 'reloj' && T26.homeWidgetsCfg1536().order[1] === 'reloj');
    click($('hwDoneBtn'));
    await tick();
    // Limpieza de la (41): devolver el menú a como estaba.
    const st41b = T26.getState();
    st41b.homeWidgets1536 = savedHw41;
    T26.setState(st41b);
    T26.exitHomeWidgetEdit1536();
    T26.applyHomeWidgets1536();
    T26.go('feed'); T26.renderFeed(); await tick();

    // ---- (42) 1.5.42: opciones con el diseño de los widgets, botón «?» en Ajustes, tutorial y preguntas actualizados. ----
    // (1) Las opciones del compositor usan el mismo diseño de 40 px de las configuraciones de los widgets.
    click($('composerOpen')); await tick();
    check('v1.5.42 diseño: el compositor trae las opciones de subir (Foto o video, Audio, Cámara, Enlace, Encuesta) con sus textos', $('composerOverlay').classList.contains('on') && ['Foto o video', 'Audio', 'Cámara', 'Enlace', 'Encuesta'].every(function (t) { return $('composerOverlay').textContent.indexOf(t) >= 0; }));
    check('v1.5.42 diseño: las opciones del compositor miden 40 px de alto (el mismo diseño de las configuraciones de los widgets)', (function () { var chips = qa('#composerOverlay .chip'); return chips.length >= 5 && chips.every(function (c) { return window.getComputedStyle(c).height === '40px'; }); })(), 'chips=' + qa('#composerOverlay .chip').length);
    check('v1.5.42 diseño: los botones de la canción y de la portada del audio usan la píldora de los widgets', ['postSongAccept', 'postSongPlay', 'postSongChange', 'postSongRemove', 'postAudioCoverBtn'].every(function (id) { return $(id) && $(id).classList.contains('wOpt1542'); }));
    // El panel de subida: las opciones se ven con el mismo diseño cuando la hoja se muda al panel.
    var vidFile1542 = new window.File([new Uint8Array(100 * 1024)], 'video-1542.mp4', { type: 'video/mp4' });
    var mediaInput1542 = $('postMediaInput');
    Object.defineProperty(mediaInput1542, 'files', { value: [vidFile1542], configurable: true });
    mediaInput1542.dispatchEvent(new window.Event('change', { bubbles: true }));
    var panelOpened1542 = await waitFor(function () { return $('uploadPanel1528').classList.contains('on'); }, 15000);
    check('v1.5.42 diseño: al subir video el panel se abre con las opciones dentro', panelOpened1542 && !!$('uploadPanel1528').querySelector('#postText'));
    check('v1.5.42 diseño: dentro del panel las opciones siguen midiendo 40 px (el diseño viaja con la hoja)', panelOpened1542 && (function () { var chips = qa('#uploadPanel1528 .chip'); return chips.length >= 5 && chips.every(function (c) { return window.getComputedStyle(c).height === '40px'; }); })(), 'chips=' + qa('#uploadPanel1528 .chip').length);
    check('v1.5.42 diseño: dentro del panel los textos de las opciones no cambiaron', panelOpened1542 && ['Foto o video', 'Audio', 'Cámara', 'Enlace', 'Encuesta'].every(function (t) { return $('uploadPanel1528').textContent.indexOf(t) >= 0; }));
    // Cerrar el panel y el compositor para no ensuciar lo que sigue.
    if ($('uploadPanel1528').classList.contains('on') && $('uploadPanelClose1528')) click($('uploadPanelClose1528')); await tick();
    if ($('composerOverlay').classList.contains('on')) click(q('[data-close="composerOverlay"]')); await tick();
    // (2) El botón «?» en Ajustes.
    window.__wrOpenSettings(); await tick();
    check('v1.5.42 preguntas: Ajustes trae el botón redondo «?» arriba a la derecha', !!$('settingsFaqBtn1542') && (function () { var cs = window.getComputedStyle($('settingsFaqBtn1542')); return cs.width === '40px' && cs.height === '40px' && cs.borderRadius === '50%'; })() && $('settingsFaqBtn1542').textContent.indexOf('?') >= 0);
    // (2) El botón «?» en Ajustes: en la 1.5.43 ya no baja con scroll hasta
    // las preguntas sueltas en Ajustes — las abre en su panel. Los checks
    // nuevos (panel con cruz, fondo translúcido, 28 entradas) viven en la
    // sección (43) de abajo.

    check('v1.5.42 diseño: las opciones de Ajustes usan la píldora de los widgets (Buscar, Descargar, guardar color, ver tutorial)', ['checkUpdateBtn', 'windowsDownloadBtn', 'colorSaveBtn', 'colorResetBtn'].every(function (id) { return $(id) && $(id).classList.contains('wOpt1542'); }) && $('checkUpdateBtn').textContent.indexOf('Buscar') >= 0 && $('windowsDownloadBtn').textContent.indexOf('Descargar') >= 0);
    click(q('[data-close="settingsOverlay"]')); await tick();
    // (3) El tutorial trae las novedades.
    var steps1542 = T26.getTutorialSteps1533();
    check('v1.5.42 tutorial: sigue en 6 pasos y el paso de inicio trae las novedades (reels arriba, Reels grandes, cartelera, orden)', steps1542.length === 6 && steps1542[1].text.indexOf('Arriba siempre están los reels') >= 0 && steps1542[1].text.indexOf('Reels grandes') >= 0 && steps1542[1].text.indexOf('cartelera de estrenos') >= 0 && steps1542[1].text.indexOf('el reloj con el clima a su derecha') >= 0);
    check('v1.5.42 tutorial: el paso de Shorts menciona que arriba están los reels y que las historias se ven en Shorts', steps1542[3].text.indexOf('Arriba en el inicio están los reels') >= 0 && steps1542[3].text.indexOf('se ven en Shorts') >= 0);
    check('v1.5.42 tutorial: el paso del perfil menciona los 4 botones en una fila y «Tu tiempo hoy» antes de la tienda de juegos', steps1542[5].text.indexOf('4 botones en una sola fila') >= 0 && steps1542[5].text.indexOf('antes de la tienda de juegos') >= 0);
    window.__wrShowTutorial(); await tick();
    check('v1.5.42 tutorial: se muestra desde Ajustes con los 6 pasos y el primer paso de bienvenida', $('tutorialOverlay').classList.contains('on') && $('tutorialCard').innerHTML.indexOf('Bienvenido a WordRed') >= 0);
    click($('tutorialNext')); await tick();
    check('v1.5.42 tutorial: al pasar al paso 2 se ven las novedades del inicio', T26.getTutorialIndex1533() === 1 && $('tutorialCard').innerHTML.indexOf('Arriba siempre están los reels') >= 0);
    click($('tutorialSkip')); await tick();

    // (43) 1.5.43: las preguntas en su panel, la tarjeta de apoyo más
    // grande, fondos translúcidos, sin avisos de ejemplo en la campana y
    // el reloj más grande.
    // (43-1) El panel de preguntas: Ajustes ya no trae la lista suelta.
    window.__wrOpenSettings(); await tick();
    check('v1.5.43 preguntas: Ajustes ya no trae la lista de preguntas suelta dentro', !$('settingsOverlay').querySelector('#faqList') && !$('settingsOverlay').querySelector('#faqTitle1542'));
    click($('settingsFaqBtn1542')); await tick();
    check('v1.5.43 preguntas: el botón «?» abre el panel de preguntas', $('faqOverlay1543').classList.contains('on'));
    check('1.5.63 preguntas: el panel trae las 29 preguntas (1.5.63: portadas verticales de dramas; 1.5.62: subida que reanuda, buscador y dramas entre Shorts e historias), con las nuevas de la cartelera y «Tu tiempo hoy» (la de los Reels salió en la rotación)', qa('#faqOverlay1543 #faqList .faqItem').length === 29 && $('faqList').textContent.indexOf('¿Qué es la cartelera «Próximos estrenos»?') >= 0 && $('faqList').textContent.indexOf('¿Cómo quedaron los Reels?') < 0 && $('faqList').textContent.indexOf('¿Dónde quedó «Tu tiempo hoy»?') >= 0 && $('faqList').textContent.indexOf('¿Qué hay de nuevo en la 1.5.63?') >= 0 && $('faqList').textContent.indexOf('¿Qué hay de nuevo en la 1.5.62?') >= 0 && $('faqList').textContent.indexOf('¿Qué hay de nuevo en la 1.5.61?') < 0, 'items=' + qa('#faqList .faqItem').length);
    var faqQ43 = q('#faqList .faqQ');
    if (faqQ43) faqQ43.click();
    check('v1.5.43 preguntas: tocar una pregunta muestra su respuesta dentro del panel', !!q('#faqList .faqItem.open'));
    check('v1.5.43 preguntas: el panel tiene fondo translúcido', window.getComputedStyle($('faqOverlay1543')).backgroundColor === 'rgba(5, 1, 2, 0.55)');
    click(q('[data-close="faqOverlay1543"]')); await tick();
    check('v1.5.43 preguntas: la cruz ✕ cierra el panel y Ajustes sigue abierto', !$('faqOverlay1543').classList.contains('on') && $('settingsOverlay').classList.contains('on'));
    // (43-2) La tarjeta de Apoyar a WordRed: más grande, botón solo icono.
    check('v1.5.43 apoyo: la tarjeta es más grande (más padding y texto más grande)', window.getComputedStyle($('supportSection')).paddingTop === '22px' && qa('#supportSection p').length === 2 && qa('#supportSection p').every(function (p) { return window.getComputedStyle(p).fontSize === '16px'; }));
    check('v1.5.43 apoyo: el botón de copiar es solo icono, redondo de 40 px, sin texto', $('supportCopyBtn').textContent.trim() === '' && !!$('supportCopyBtn').querySelector('svg') && (function () { var cs = window.getComputedStyle($('supportCopyBtn')); return cs.width === '40px' && cs.height === '40px' && cs.borderRadius === '50%'; })());
    var copied43 = null;
    Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: function (t) { copied43 = t; return Promise.resolve(); } }, configurable: true });
    click($('supportCopyBtn')); await sleep(50);
    check('v1.5.43 apoyo: el botón sigue copiando el número de cuenta', copied43 !== null && copied43 === $('supportAccount').textContent.trim());
    // (43-3) Fondos translúcidos: Ajustes y el cajón.
    check('v1.5.43 fondos: el fondo de Ajustes es translúcido', window.getComputedStyle($('settingsOverlay')).backgroundColor === 'rgba(5, 1, 2, 0.55)');
    click(q('[data-close="settingsOverlay"]')); await tick();
    click($('navLauncherBtn')); await tick();
    check('v1.5.43 fondos: el cajón se abre y su fondo es translúcido y LEVE — 1.5.47: el fondo leve va en la tarjeta flotante y el velo es el estándar', $('appsDrawerOverlay').classList.contains('on') && window.getComputedStyle($('appsDrawerOverlay')).backgroundColor === 'rgba(5, 1, 2, 0.55)' && window.getComputedStyle($('appsDrawerOverlay').querySelector('.sheet')).backgroundColor === 'rgba(5, 1, 2, 0.3)');
    check('v1.5.43 fondos: el cajón sigue con sus 6 aplicaciones, incluida Cámara, y los iconos grandes sin marco', qa('#appsDrawerGrid .launcherTile').length === 7 && $('appsDrawerGrid').textContent.indexOf('Cámara') >= 0 && (function () { var t0 = window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-kind="app"]'); if (!t0) return false; var ic0 = t0.querySelector('img, span'); var bg0 = window.getComputedStyle(t0).backgroundColor; return !!ic0 && ic0.style.width === '60px' && (bg0 === 'rgba(0, 0, 0, 0)' || bg0 === 'transparent' || bg0 === ''); })());
    click($('appsDrawerClose')); await tick();
    check('v1.5.43 fondos: el cajón se cierra con su botón', !$('appsDrawerOverlay').classList.contains('on'));
    // (43-4) En la campana no aparece nada de la cuenta de ejemplo.
    // OJO: st26 quedó viejo en la (36f) (T26.reload() cambia el estado por
    // uno recién cargado), así que se usa el estado vivo de ahora.
    var live43 = T26.getState();
    var savedNotifs43 = live43.notifications;
    live43.notifications = [
      { id: 'n-demo1543', type: 'like', from: '0000000000', to: live43.me, text: 'reaccionó a tu publicación: Me gusta', refId: 'post-demo1543', read: false, createdAt: Date.now() },
      { id: 'n-real1543', type: 'comment', from: BRUNO26, to: live43.me, text: 'comentó tu publicación: ¡Qué buena foto!', refId: 'post-real1543', read: false, createdAt: Date.now() },
      { id: 'n-upd1543', type: 'update', from: live43.me, to: live43.me, text: 'Hay una actualización disponible: WordRed 1.5.48.', refId: '63', read: false, createdAt: Date.now() }
    ];
    check('v1.5.43 avisos: el aviso de ejemplo no cuenta como no leído (solo el real y la actualización: 2)', C26.unreadNotifications(live43, live43.me) === 2);
    click($('hdrBell')); await tick();
    check('v1.5.43 avisos: la campana muestra el comentario real y la actualización, pero no el aviso de ejemplo', $('notifList').textContent.indexOf('comentó tu publicación: ¡Qué buena foto!') >= 0 && $('notifList').textContent.indexOf('Hay una actualización disponible: WordRed 1.5.48.') >= 0 && $('notifList').textContent.indexOf('reaccionó a tu publicación') < 0);
    live43.notifications = savedNotifs43;
    T26.go('feed');
    // (43-5) El reloj más grande, dentro de su recuadro (el ajuste en px
    // lo verifica la suite de Node con la medida de la fuente; aquí se
    // comprueba con estilos computados que el tamaño se aplica y que el
    // recuadro no se deforma en s/m/l).
    T26.go('feed'); T26.renderFeed(); await tick();
    T26.homeWidgetsCfg1536().sizes.reloj = 'm'; T26.applyHomeWidgets1536(); await tick();
    check('v1.5.43 reloj: en m la hora es 64 px y cabe en su recuadro', cs37($('weatherTime')).fontSize === '64px' && cs37($('weatherTime')).whiteSpace === 'nowrap' && cs37(widget36('reloj')).overflow === 'hidden');
    T26.homeWidgetsCfg1536().sizes.reloj = 'l'; T26.applyHomeWidgets1536(); await tick();
    check('v1.5.43 reloj: en l la hora es 89 px y cabe en su recuadro', cs37($('weatherTime')).fontSize === '89px' && cs37($('weatherTime')).whiteSpace === 'nowrap' && cs37(widget36('reloj')).overflow === 'hidden');
    T26.homeWidgetsCfg1536().sizes.reloj = 's'; T26.applyHomeWidgets1536(); await tick();
    check('v1.5.43 reloj: en s la hora es 39 px y cabe en su recuadro, con la fecha debajo y envolviendo', cs37($('weatherTime')).fontSize === '39px' && cs37($('weatherTime')).whiteSpace === 'nowrap' && cs37(widget36('reloj')).overflow === 'hidden' && !!$('weatherDate') && cs37($('weatherDate')).overflowWrap === 'break-word');

    // (43-6) 1.5.43: cartelera «Próximos estrenos de juegos».
    window.localStorage.removeItem('wordred_gamesbillboard1543');
    T26.go('feed'); T26.renderFeed(); await tick(); await tick();
    var gamesBb43 = q('#feed #gamesBillboard1543');
    check('v1.5.43 juegos: la sección «Próximos estrenos de juegos» existe en el inicio', !!gamesBb43 && gamesBb43.textContent.indexOf('Próximos estrenos de juegos') >= 0);
    check('v1.5.43 juegos: el mando va arriba del primer juego', !!gamesBb43 && !!gamesBb43.querySelector('.gamesBillboardHead1543 .gamesBillboardIcon1543 svg'));
    check('v1.5.43 juegos: la app pinta la lista del servidor (no la fija)', !!gamesBb43 && gamesBb43.textContent.indexOf('Juego de prueba 1') >= 0 && gamesBb43.textContent.indexOf('Juego de prueba 2') >= 0 && gamesBb43.textContent.indexOf('Grand Theft Auto VI') < 0);
    var gameCards43 = qa('#feed .gameCard1543');
    check('v1.5.43 juegos: cada juego es una tarjeta grande con portada, título y fecha', gameCards43.length === 2 && gameCards43.every(function (c) { var cs = window.getComputedStyle(c); return cs.flexBasis === '220px' && !!c.querySelector('.gamePoster1543 img') && !!c.querySelector('.gameTitle1543') && c.textContent.indexOf('Estreno:') >= 0; }), 'tarjetas=' + gameCards43.length);
    check('v1.5.43 juegos: el ya disponible lleva la marca «Ya disponible»', gameCards43.length === 2 && gameCards43[1].textContent.indexOf('Ya disponible') >= 0 && gameCards43[0].textContent.indexOf('Ya disponible') < 0);
    check('v1.5.43 juegos: la fila es horizontal con desplazamiento lateral', !!gamesBb43 && !!q('#feed .games1543') && window.getComputedStyle(q('#feed .games1543')).overflowX === 'auto');
    var feedKids43g = Array.prototype.slice.call($('feed').children);
    var gbIdx43 = feedKids43g.indexOf(gamesBb43);
    var bbIdx43 = feedKids43g.indexOf(q('#feed #billboard1540'));
    var postCount43g = qa('#feed .post').length;
    var postsBeforeGb43 = feedKids43g.slice(0, gbIdx43).filter(function (el) { return el.classList.contains('post'); }).length;
    check('v1.5.44 juegos: va tras la 10ª publicación (o al final si hay menos de 10), separada de la de cine', bbIdx43 >= 0 && postsBeforeGb43 === Math.min(10, postCount43g), 'cine=' + bbIdx43 + ' juegos=' + gbIdx43 + ' antesJuegos=' + postsBeforeGb43 + ' publicaciones=' + postCount43g);
    click(gameCards43[0]);
    check('v1.5.43 juegos: al tocar un juego se abre su tráiler real en YouTube', calls.openExternalUrl.some(function (u) { return u.indexOf('https://www.youtube.com/watch?v=DDDDDDDDDDD') >= 0; }), 'urls=' + calls.openExternalUrl.join(','));
    // Sin conexión: la lista fija con el aviso de sin actualizar.
    window.localStorage.removeItem('wordred_gamesbillboard1543');
    var realFetch43g = window.fetch;
    window.fetch = async () => { throw new Error('sin conexión'); };
    T26.go('feed'); T26.renderFeed(); await tick(); await tick();
    var gbFallback43 = q('#feed #gamesBillboard1543');
    check('v1.5.43 juegos: sin conexión pinta la lista fija (6 juegos reales) y avisa que está sin actualizar', !!gbFallback43 && gbFallback43.textContent.indexOf('Grand Theft Auto VI') >= 0 && gbFallback43.textContent.indexOf('Path of Exile 2') >= 0 && qa('#feed .gameCard1543').length === 6 && gbFallback43.textContent.indexOf('sin actualizar') >= 0);
    window.fetch = realFetch43g;
    // Caché de 1 día: con una caché fresca no se pide nada y se pinta lo guardado.
    window.localStorage.setItem('wordred_gamesbillboard1543', JSON.stringify({ at: Date.now(), games: [{ title: 'Juego en caché', date: '9 sep 2027', poster: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/333/library_600x900.jpg', trailer: 'https://www.youtube.com/watch?v=FFFFFFFFFFF', now: false }] }));
    T26.go('feed'); T26.renderFeed(); await tick();
    var gbCache43 = q('#feed #gamesBillboard1543');
    check('v1.5.43 juegos: con caché fresca se pinta lo guardado sin pedir al servidor', !!gbCache43 && gbCache43.textContent.indexOf('Juego en caché') >= 0 && gbCache43.textContent.indexOf('Juego de prueba 1') < 0);
    window.localStorage.removeItem('wordred_gamesbillboard1543');
    T26.go('feed'); T26.renderFeed(); await tick();
    // El mando en la tienda de juegos.
    click(q('#bottomNav button[data-nav="profile"]')); await tick();
    var storeH343 = qa('#gamesSection h3').filter(function (h) { return h.textContent.indexOf('Juegos de Play Store') >= 0; })[0];
    check('v1.5.43 juegos: el título «juegos de Play Store» lleva el mando delante', !!storeH343 && !!storeH343.querySelector('svg') && storeH343.innerHTML.indexOf('M17.32 5H6.68') >= 0);
    T26.go('feed'); await tick();

    // (43-7) 1.5.43: arreglos al subir un video.
    click($('composerOpen')); await tick();
    check('v1.5.43 video: en el compositor ya no hay música automática ni sentimientos', !$('postAutoMusicToggle') && !$('postFeelingRow') && !$('postFeelingCustom'));
    var videoFile43 = new window.File([new Uint8Array(100 * 1024)], 'video-1543.mp4', { type: 'video/mp4' });
    W26.handleComposerMediaFiles([videoFile43]);
    await waitFor(function () { return $('postMediaPrev').querySelector('video'); }, 15000);
    var coverBtn43 = q('#postMediaPrev .cover-pick-btn');
    var editBtn43 = q('#postMediaPrev button[aria-label="Editar video"]');
    check('v1.5.43 video: al subir un video aparecen los botones de carátula y editar video', !!coverBtn43 && !!editBtn43);
    check('v1.5.43 video: los dos botones van ARRIBA del video, dentro de su recuadro', !!coverBtn43 && !!editBtn43 && window.getComputedStyle(coverBtn43).top === '4px' && window.getComputedStyle(editBtn43).top === '4px' && coverBtn43.parentElement === editBtn43.parentElement);
    check('v1.5.43 video: los dos botones son redondos de 40 px y solo con símbolo (sin texto)', !!coverBtn43 && !!editBtn43 && window.getComputedStyle(coverBtn43).width === '40px' && window.getComputedStyle(coverBtn43).height === '40px' && window.getComputedStyle(coverBtn43).borderRadius === '50%' && window.getComputedStyle(editBtn43).width === '40px' && window.getComputedStyle(editBtn43).borderRadius === '50%' && coverBtn43.textContent.trim() === '' && editBtn43.textContent.trim() === '' && !!coverBtn43.querySelector('svg') && !!editBtn43.querySelector('svg'));
    check('v1.5.43 video: los botones no se enciman (la carátula termina antes de que empiece editar)', !!coverBtn43 && !!editBtn43 && (parseFloat(window.getComputedStyle(coverBtn43).left) + parseFloat(window.getComputedStyle(coverBtn43).width)) <= parseFloat(window.getComputedStyle(editBtn43).left), 'caratula=' + window.getComputedStyle(coverBtn43).left + '+' + window.getComputedStyle(coverBtn43).width + ' editar=' + window.getComputedStyle(editBtn43).left);
    click(coverBtn43);
    check('v1.5.43 video: el botón de carátula sigue abriendo su selector', $('coverPickerOverlay').classList.contains('on'));
    click(q('[data-close="coverPickerOverlay"]')); await tick();
    click(editBtn43);
    check('v1.5.43 video: el botón de editar video sigue abriendo su editor', $('videoEditorOverlay').classList.contains('on'));
    click(q('[data-close="videoEditorOverlay"]')); await tick();
    // La canción se sigue eligiendo a mano: el botón Cambiar abre el selector.
    check('v1.5.43 video: la canción se sigue eligiendo a mano (el botón Cambiar abre el selector)', !!$('postSongChange'));
    click($('postSongChange')); await tick();
    check('v1.5.43 video: al tocar Cambiar se abre el selector de canciones', $('songPickerOverlay').classList.contains('on'));
    click(q('[data-close="songPickerOverlay"]')); await tick();
    W26.closeUploadPanel1528(); await tick();
    T26.setComposerMediaList([]);
    var cClose43 = window.document.querySelector('#composerOverlay [data-close]');
    if (cClose43) { click(cClose43); await tick(); }
    // El editor de historias ya no tiene el toggle; el audio se sugiere a mano.
    window.__wordredTest.openStoryEditor({ src: 'data:image/jpeg;base64,/9j/4AAQ', type: 'image' }, 'Historia 1.5.43');
    await tick();
    var audioChip43 = q('#storyEditTools .chip[data-tool="audio"]');
    if (audioChip43) audioChip43.click();
    await tick();
    check('v1.5.43 video: el editor de historias ya no tiene el toggle de música automática', !$('storyEditAutoMusic'));
    check('v1.5.43 video: el audio de la historia se elige a mano (sugerir o elegir canción)', !!$('storyEditSongAuto') && !!$('storyEditSongChange') && !!$('storyEditSongRemove'));
    click($('storyEditSongAuto')); await tick();
    check('v1.5.43 video: el botón de audio sugiere sin necesitar el toggle', !!q('#storyEditorOverlay .songRow') || $('storyEditorOverlay').textContent.indexOf('Sugerencia automática') >= 0);
    var storyEditClose43 = q('[data-close="storyEditorOverlay"]');
    if (storyEditClose43) { click(storyEditClose43); await tick(); }
    // Una publicación ya hecha con sentimiento se sigue viendo igual, y al
    // modificarla conserva su sentimiento.
    var st43f = T26.getState();
    var feelPost43 = C26.createPost(st43f, '5511111111', { text: 'Publicación con sentimiento viejo', privacy: 'Público', feeling: { kind: 'feeling', text: 'Feliz' } }).post;
    if (feelPost43 && !feelPost43.feeling) feelPost43.feeling = { kind: 'feeling', text: 'Feliz' };
    T26.go('feed'); T26.renderFeed(); await tick();
    check('v1.5.43 video: una publicación ya hecha con sentimiento se sigue viendo igual', !!q('#feed .post') && q('#feed .post').textContent.indexOf('se siente Feliz') >= 0);
    window.__wrEditPost(feelPost43.id); await tick();
    check('v1.5.43 video: al modificar no aparece la opción de sentimiento en el compositor', !$('postFeelingRow') && !$('postFeelingCustom'));
    setVal($('postText'), 'Publicación con sentimiento viejo (editada)');
    click($('postPublish')); await tick(); await tick();
    T26.go('feed'); T26.renderFeed(); await tick();
    check('v1.5.43 video: al modificar, la publicación conserva su sentimiento', !!q('#feed .post') && q('#feed .post').textContent.indexOf('se siente Feliz') >= 0 && q('#feed .post').textContent.indexOf('(editada)') >= 0);

    // (44) 1.5.44: carteleras separadas, portada del reel de ejemplo y
    // cuentas de ejemplo sin aparecer activas.
    // (44-1) Las carteleras van separadas: cine tras la 5ª, juegos tras la 10ª.
    var live44 = T26.getState();
    var savedPosts44 = live44.posts.slice();
    while (live44.posts.filter(function (p) { return !p.isDemo; }).length < 12) C26.createPost(live44, live44.me, { text: 'Publicación de prueba 1.5.44 ' + live44.posts.length });
    live44.settings.examplesOverride = 'show';
    T26.go('feed'); T26.renderFeed(); await tick(); await tick();
    var kids44 = Array.prototype.slice.call($('feed').children);
    var bb44 = q('#feed #billboard1540');
    var gb44 = q('#feed #gamesBillboard1543');
    var postCount44 = qa('#feed .post').length;
    var beforeBb44 = kids44.slice(0, kids44.indexOf(bb44)).filter(function (el) { return el.classList.contains('post'); }).length;
    var beforeGb44 = kids44.slice(0, kids44.indexOf(gb44)).filter(function (el) { return el.classList.contains('post'); }).length;
    check('v1.5.44 carteleras: la de cine va después de la 5ª publicación', !!bb44 && beforeBb44 === 5, 'antes=' + beforeBb44 + ' publicaciones=' + postCount44);
    check('v1.5.44 carteleras: la de juegos va después de la 10ª publicación', !!gb44 && beforeGb44 === 10, 'antes=' + beforeGb44 + ' publicaciones=' + postCount44);
    check('v1.5.44 carteleras: hay 5 publicaciones entre las dos carteleras (van separadas)', !!bb44 && !!gb44 && kids44.indexOf(gb44) > kids44.indexOf(bb44) && beforeGb44 - beforeBb44 === 5);
    // Con pocos posts (3), la de cine va tras la 3ª y la de juegos al final.
    live44.posts = live44.posts.filter(function (p) { return !p.isDemo && !p.groupId; }).slice(0, 3);
    T26.go('feed'); T26.renderFeed(); await tick(); await tick();
    var kids44f = Array.prototype.slice.call($('feed').children);
    var bb44f = q('#feed #billboard1540');
    var gb44f = q('#feed #gamesBillboard1543');
    check('v1.5.44 carteleras: con 3 publicaciones la de cine va después de la 3ª (al final)', !!bb44f && kids44f.slice(0, kids44f.indexOf(bb44f)).filter(function (el) { return el.classList.contains('post'); }).length === 3);
    check('v1.5.44 carteleras: con 3 publicaciones la de juegos va al final, después de la de cine', !!gb44f && kids44f.indexOf(gb44f) === kids44f.length - 1 && kids44f.indexOf(gb44f) > kids44f.indexOf(bb44f));
    live44.posts = savedPosts44;
    T26.go('feed'); T26.renderFeed(); await tick(); await tick();
    // (44-2) El reel del video de ejemplo trae su portada real al abrir el inicio.
    var demoVideo44 = live44.posts.filter(function (p) { return p.demoKey === 'ejemplo-video'; })[0];
    check('v1.5.44 reel: la publicación de ejemplo con video trae su portada fija', !!demoVideo44 && demoVideo44.videoThumb === 'ejemplo/video-ciudad.jpg', demoVideo44 && ('thumb=' + demoVideo44.videoThumb));
    // El inicio trae más de 10 videos más nuevos que el de ejemplo, así que
    // para comprobar la portada en la fila se deja solo el contenido de
    // ejemplo (la portada fija no depende de la posición en la fila).
    var savedPosts44c = live44.posts.slice();
    live44.posts = live44.posts.filter(function (p) { return p.isDemo; });
    T26.renderFeed(); await tick();
    var tiles44 = qa('#feed .reelTile');
    var demoTile44 = Array.prototype.slice.call(tiles44).filter(function (t) { var im = t.querySelector('img'); return im && (im.getAttribute('src') || '').indexOf('video-ciudad.jpg') >= 0; })[0];
    check('v1.5.44 reel: el reel del ejemplo muestra su portada real al abrir el inicio, sin tocar nada', !!demoTile44 && !demoTile44.querySelector('.reelTilePh'), 'reels=' + tiles44.length + ' thumb=' + (demoVideo44 && demoVideo44.videoThumb));
    live44.posts = savedPosts44c;
    T26.renderFeed(); await tick();
    // (44-3) La cuenta de ejemplo no aparece como activa.
    var demoStoryObj44 = live44.stories.filter(function (s) { return s.author === '0000000000' && s.isDemo; })[0];
    if (demoStoryObj44) demoStoryObj44.views = [];
    // La fila solo pinta una tarjeta por autor: la historia real usa un
    // teléfono sin otras historias, para que su tarjeta sí se pinte.
    var realStory44 = { id: 'story-real44', author: '5599999999', text: 'Historia real de prueba', media: '', mediaType: '', createdAt: Date.now(), views: [], likes: {}, comments: [], shares: [], isDemo: false };
    live44.stories.push(realStory44);
    T26.go('feed'); await tick();
    var demoStoryEl44 = demoStoryObj44 ? q('.story[onclick*="' + demoStoryObj44.id + '"]') : null;
    var realStoryEl44 = q('.story[onclick*="story-real44"]');
    // 1.5.54: la fila de arriba son reels, no historias: ninguna historia
    // (ni la de ejemplo ni la real) se pinta ahí, y ningún círculo de
    // reel lleva aro de activa ni de en vivo (las historias se ven en Shorts).
    check('v1.5.44 activa: la historia de la cuenta de ejemplo no se ve como activa (ya no está en la fila de arriba: la fila son reels)', !q('#storiesRow .story') && !q('#storiesRow .avatar.live-ring') && (!demoStoryObj44 || ($('storiesRow') && $('storiesRow').innerHTML.indexOf(demoStoryObj44.id) < 0)));
    check('v1.5.44 activa: la historia real sin ver tampoco se pinta en la fila (las historias se ven en Shorts)', !q('#storiesRow .story') && ($('storiesRow') ? $('storiesRow').innerHTML.indexOf('story-real44') < 0 : true));
    live44.stories = live44.stories.filter(function (s) { return s.id !== 'story-real44'; });
    var savedLives44 = T26.getLiveList().slice();
    T26.setLiveList([
      { id: 'live-demo44', host: '0000000000', title: 'Live de ejemplo', viewers: [], viewerCount: 0 },
      { id: 'live-real44', host: BRUNO26, title: 'Live real', viewers: [], viewerCount: 0 }
    ]);
    check('v1.5.44 activa: la cuenta de ejemplo nunca está en vivo aunque haya un live suyo, y la real sí', T26.isLiveNow('0000000000') === false && T26.isLiveNow(BRUNO26) === true);
    check('v1.5.44 activa: la fila de lives muestra solo el live real, no el de ejemplo', !!q('#liveRow') && qa('#liveRow .liveItem').length === 1 && q('#liveRow').textContent.indexOf('Contenido de ejemplo') < 0);
    T26.setLiveList(savedLives44);

    // (44-4) 1.5.44 punto 4: sin parpadeo de cuentas al abrir.
    check('v1.5.44 cuentas: la vista de cuentas nace oculta en el HTML (no se pinta antes de decidir)', html.indexOf('<div id="authView" class="hidden">') >= 0);
    // Con sesión guardada, el arranque va directo al inicio sin mostrar cuentas.
    var savedMe44 = live44.me;
    $('switchAccountOverlay').classList.remove('on'); // la 1.5.26 la dejó abierta; el arranque no la abre
    T26.boot1544();
    check('v1.5.44 cuentas: con sesión guardada, al arrancar no se muestra la pantalla de cuentas', !!live44.me && $('authView').classList.contains('hidden') && !$('appView').classList.contains('hidden') && !$('switchAccountOverlay').classList.contains('on'), 'me=' + live44.me + ' authHidden=' + $('authView').classList.contains('hidden') + ' appHidden=' + $('appView').classList.contains('hidden') + ' switchOn=' + $('switchAccountOverlay').classList.contains('on'));
    // Tras cerrar sesión, sí se muestra la lista de cuentas para elegir otra.
    click($('logoutBtn')); await tick();
    click($('confirmYes')); await tick(); await tick();
    check('v1.5.44 cuentas: tras cerrar sesión se muestra la lista de cuentas para elegir otra', !live44.me && $('switchAccountOverlay').classList.contains('on') && $('switchAccountBody').textContent.indexOf(savedMe44) >= 0, 'me=' + live44.me + ' cuentas=' + (live44.accounts || []).length);
    // Sin sesión en el arranque, también se muestra la pantalla de cuentas.
    T26.boot1544();
    check('v1.5.44 cuentas: sin sesión, al arrancar se muestra la pantalla de cuentas', !live44.me && $('switchAccountOverlay').classList.contains('on'));
    // Volver a la sesión para no ensuciar la limpieza final.
    window.__wrSwitchAccount(savedMe44); await tick();
    check('v1.5.44 cuentas: al elegir una cuenta de la lista se vuelve al inicio con esa sesión', live44.me === savedMe44 && !$('switchAccountOverlay').classList.contains('on') && !$('appView').classList.contains('hidden') && $('authView').classList.contains('hidden'));

    // (45) 1.5.45: al presionar algo, su pantalla va AL FRENTE, nunca detrás.
    var z45 = function (id) { var v = Number(window.getComputedStyle($(id)).zIndex); return isNaN(v) ? 0 : v; };
    // Limpieza: pruebas anteriores dejan overlays abiertos (chat, retos,
    // cupones, etc.); se cierran para partir de un estado limpio, como
    // cuando el usuario abre el panel de subida sin otra pantalla encima.
    Array.prototype.slice.call(window.document.querySelectorAll('.overlay.on')).forEach(function (o) { T26.hideOverlay(o.id); });
    // El panel de subida está a z-85; el editor de video y la carátula (z-80) se abrían detrás.
    T26.showOverlay('uploadPanel1528');
    check('v1.5.45 apilado: el panel de subida abierto está a z-85', $('uploadPanel1528').classList.contains('on') && z45('uploadPanel1528') === 85, 'z=' + z45('uploadPanel1528'));
    T26.openVideoEditor('composer', -1, 'ejemplo/video-ciudad.mp4');
    check('v1.5.45 apilado: el editor de video se abre POR ENCIMA del panel de subida', $('videoEditorOverlay').classList.contains('on') && z45('videoEditorOverlay') > z45('uploadPanel1528'), 'editor=' + z45('videoEditorOverlay') + ' panel=' + z45('uploadPanel1528'));
    T26.openSongPicker('videoedit', '');
    check('v1.5.45 apilado: el selector de canciones se abre POR ENCIMA del editor de video', $('songPickerOverlay').classList.contains('on') && z45('songPickerOverlay') > z45('videoEditorOverlay'), 'canciones=' + z45('songPickerOverlay') + ' editor=' + z45('videoEditorOverlay'));
    T26.hideOverlay('songPickerOverlay');
    check('v1.5.45 apilado: al cerrar, el selector de canciones suelta su z-index (vuelve el tier del CSS)', $('songPickerOverlay').style.zIndex === '', 'z=' + JSON.stringify($('songPickerOverlay').style.zIndex));
    T26.hideOverlay('videoEditorOverlay');
    T26.setComposerMediaList([{ src: 'ejemplo/video-ciudad.mp4', type: 'video', thumb: '', thumbKind: '' }]);
    window.__wrOpenCoverPicker(0);
    check('v1.5.45 apilado: el selector de carátula se abre POR ENCIMA del panel de subida', $('coverPickerOverlay').classList.contains('on') && z45('coverPickerOverlay') > z45('uploadPanel1528'), 'caratula=' + z45('coverPickerOverlay') + ' panel=' + z45('uploadPanel1528'));
    T26.hideOverlay('coverPickerOverlay');
    T26.hideOverlay('uploadPanel1528');
    T26.setComposerMediaList([]);
    // El selector de canciones desde el editor de historias (z-80, antes que el selector en el DOM).
    T26.showOverlay('storyEditorOverlay');
    T26.openSongPicker('story', '');
    check('v1.5.45 apilado: el selector de canciones se abre POR ENCIMA del editor de historias', $('songPickerOverlay').classList.contains('on') && z45('songPickerOverlay') > z45('storyEditorOverlay'), 'canciones=' + z45('songPickerOverlay') + ' historias=' + z45('storyEditorOverlay'));
    T26.hideOverlay('songPickerOverlay');
    T26.hideOverlay('storyEditorOverlay');
    // Regla general: abrir una pantalla desde otra la pone al frente (diálogo desde el chat).
    T26.showOverlay('chatOverlay');
    T26.showOverlay('dialogOverlay');
    check('v1.5.45 apilado: abrir una pantalla desde otra la pone al frente (diálogo sobre el chat)', $('dialogOverlay').classList.contains('on') && z45('dialogOverlay') > z45('chatOverlay'), 'dialogo=' + z45('dialogOverlay') + ' chat=' + z45('chatOverlay'));
    T26.hideOverlay('dialogOverlay');
    T26.hideOverlay('chatOverlay');
    // El dueto desde Shorts: el visor está a z-90 y el dueto (z-80) se abría detrás.
    T26.showOverlay('shortsOverlay');
    var duetPost45 = live44.posts.filter(function (p) { return p.mediaType === 'video' || (p.mediaList && p.mediaList.some(function (m) { return m.type === 'video'; })); })[0] || live44.posts[0];
    window.__wrOpenDuet(duetPost45.id);
    check('v1.5.45 apilado: el dueto se abre POR ENCIMA del visor de Shorts', $('duetOverlay').classList.contains('on') && z45('duetOverlay') > z45('shortsOverlay'), 'dueto=' + z45('duetOverlay') + ' shorts=' + z45('shortsOverlay'));
    T26.hideOverlay('duetOverlay');
    T26.hideOverlay('shortsOverlay');

    // (46) 1.5.46: la subida reintenta sola mientras el servidor despierta,
    // y la barra va ABAJO, encima de la barra inferior, sin tapar nada.
    // Sin motor de diseño en jsdom, elementFromPoint no existe: lo que se
    // comprueba son los hechos de geometría y z que hacen que un botón se
    // pueda tocar (posición, z y despeje del contenido).
    var bar46 = $('mediaUploadBar');
    var csBar46 = window.getComputedStyle(bar46);
    check('1.5.46 barra: va fijada abajo, justo encima de la barra inferior (no arriba)', csBar46.position === 'fixed' && csBar46.bottom.indexOf('68px') >= 0 && csBar46.top === 'auto', 'pos=' + csBar46.position + ' bottom=' + csBar46.bottom + ' top=' + csBar46.top);
    check('1.5.46 barra: su z (70) queda por debajo de las pantallas (z-80) y por encima de la barra inferior (z-60)', Number(csBar46.zIndex) === 70 && Number(window.getComputedStyle($('bottomNav')).zIndex) === 60, 'barra=' + csBar46.zIndex + ' nav=' + window.getComputedStyle($('bottomNav')).zIndex);
    W26.setUploadBarVisible1530(true);
    bar46.classList.remove('hidden');
    check('1.5.46 barra: al mostrarse, el contenido se despeja 40 px abajo (nada queda detrás de ella)', window.document.body.classList.contains('wrUploading1530') && window.getComputedStyle(window.document.querySelector('main')).paddingBottom.indexOf('144px') >= 0, window.getComputedStyle(window.document.querySelector('main')).paddingBottom);
    T26.showOverlay('settingsOverlay');
    var zSet46 = Number(window.getComputedStyle($('settingsOverlay')).zIndex);
    check('1.5.46 barra: una pantalla abierta va POR ENCIMA de la barra (su fila de arriba se puede tocar)', $('settingsOverlay').classList.contains('on') && zSet46 > Number(csBar46.zIndex), 'ajustes=' + zSet46 + ' barra=' + csBar46.zIndex);
    check('1.5.46 barra: el encabezado sigue arriba y la barra inferior abajo, sin que la barra los tape', window.getComputedStyle(window.document.querySelector('#appView header')).position === 'sticky' && Number(window.getComputedStyle($('bottomNav')).zIndex) < Number(csBar46.zIndex) && $('bottomNav').querySelector('button') !== null, 'header=' + window.getComputedStyle(window.document.querySelector('#appView header')).position);
    T26.hideOverlay('settingsOverlay');
    var navRect46 = { top: 692, height: 76, bottom: 768, left: 0, right: 360, width: 360 };
    var origRect46 = $('bottomNav').getBoundingClientRect;
    $('bottomNav').getBoundingClientRect = function () { return navRect46; };
    var origInnerH46 = window.innerHeight;
    try { Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true }); } catch (e) {}
    W26.setUploadBarVisible1530(true);
    check('1.5.46 barra: al mostrarse mide la barra inferior y se pega justo encima de ella', bar46.style.bottom === '76px', 'bottom=' + JSON.stringify(bar46.style.bottom));
    W26.setUploadBarVisible1530(false);
    check('1.5.46 barra: al ocultarse suelta la medida (vuelve la regla del CSS)', bar46.style.bottom === '', 'bottom=' + JSON.stringify(bar46.style.bottom));
    try { Object.defineProperty(window, 'innerHeight', { value: origInnerH46, configurable: true }); } catch (e) {}
    $('bottomNav').getBoundingClientRect = origRect46;
    bar46.classList.add('hidden');
    // La subida reintenta sola mientras el servidor despierta (1.5.46).
    T26.core.setMediaUploadSleep1546(function () { return Promise.resolve(); });
    calls.media = []; calls.mediaFailChunk = 1; calls.mediaStartCount = 0;
    var url46 = await T26.uploadMediaItemToServer({ src: 'data:image/jpeg;base64,' + Buffer.from('FOTO-DOM-46').toString('base64'), type: 'image' });
    check('1.5.62 subida: si un trozo falla, la subida REANUDA con el MISMO uploadId (ya no se reinicia completa) y termina bien', typeof url46 === 'string' && url46.indexOf('/media/') > 0, String(url46));
    var starts46 = calls.media.filter(function (m) { return m.op === 'start'; });
    check('1.5.62 subida: la reanudación abrió UNA sola subida (mismo uploadId, no se empezó de cero)', starts46.length === 1, JSON.stringify(starts46));
    check('1.5.62 subida: para reanudar, el cliente preguntó al servidor cuántos bytes lleva (GET /api/media/status)', calls.media.some(function (m) { return m.op === 'status'; }), JSON.stringify(calls.media));
    var wakeGate46; var wakePromise46 = new Promise(function (res) { wakeGate46 = res; });
    var sleepCalls46 = 0;
    T26.core.setMediaUploadSleep1546(function () { sleepCalls46++; if (sleepCalls46 === 1) return wakePromise46; return Promise.resolve(); });
    calls.media = []; calls.mediaFailChunk = 1; calls.mediaStartCount = 0;
    W26.setUploadBarVisible1530(true); bar46.classList.remove('hidden');
    var upPromise46 = T26.uploadMediaItemToServer({ src: 'data:image/jpeg;base64,' + Buffer.from('FOTO-DOM-46B').toString('base64'), type: 'image' });
    await tick(); await tick(); await tick();
    check('1.5.46 subida: mientras reintenta, la barra dice que el servidor está despertando', $('mediaUploadLabel').textContent.indexOf('despertando') >= 0, JSON.stringify(T26.getUploadProgress()));
    wakeGate46();
    var url46b = await upPromise46;
    check('1.5.46 subida: tras el reintento la subida termina bien', typeof url46b === 'string' && url46b.indexOf('/media/') > 0, String(url46b));
    bar46.classList.add('hidden'); W26.setUploadBarVisible1530(false);
    T26.core.setMediaUploadSleep1546(function () { return Promise.resolve(); });
    calls.mediaFailChunk = 99;
    var url46c = await T26.uploadMediaItemToServer({ src: 'data:image/jpeg;base64,' + Buffer.from('FOTO-DOM-46C').toString('base64'), type: 'image' });
    check('1.5.46 mensajes: si el servidor no responde, la subida falla y el motivo queda guardado', url46c === null && T26.core.lastMediaUploadError1546() === 'server', 'url=' + url46c + ' err=' + T26.core.lastMediaUploadError1546());
    check('1.5.46 mensajes: el mensaje final dice que el servidor no respondió (no que no hay internet)', T26.mediaUploadFailMessage1546('No se pudo subir la foto.').indexOf('El servidor no respondió') >= 0, T26.mediaUploadFailMessage1546('No se pudo subir la foto.'));
    calls.mediaFailChunk = 0;
    var navOnLine46 = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
    try { Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true }); } catch (e) {}
    check('1.5.46 mensajes: sin internet de verdad, el mensaje final lo dice así', T26.mediaUploadFailMessage1546('No se pudo subir la foto.').indexOf('No tienes internet') >= 0, T26.mediaUploadFailMessage1546('No se pudo subir la foto.'));
    try { if (navOnLine46) Object.defineProperty(window.navigator, 'onLine', navOnLine46); else delete window.navigator.onLine; } catch (e) {}
    T26.core.setMediaUploadSleep1546(null);
    calls.mediaFailStart = 0; calls.mediaFailChunk = 0;

    // (47) 1.5.47: portada automática de historias, vista previa inmediata,
    // barra continua, ajustes del cajón, noticias, promociones, ventanas
    // flotantes y barra inferior repartida.
    var st47 = T26.getState(); // el estado vivo (st26 quedó obsoleto por los setState de 1.5.34-1.5.41)
    var savedPosts47 = st47.posts.slice();
    var savedStories47 = (st47.stories || []).slice();
    var savedPromo47 = st47.promotions1547;
    var origList47 = window.AndroidBridge.listInstalledApps;
    var origApps47 = T26.getInstalledApps ? T26.getInstalledApps() : null;
    // --- historias: portada automática ---
    T26.core.createStory(st47, st47.me, { text: 'Historia foto 1.5.47', media: 'https://ejemplo.com/foto47.jpg', mediaType: 'image' });
    T26.core.createStory(st47, st47.me, { text: 'Historia video 1.5.47', media: 'https://ejemplo.com/video47.mp4', mediaType: 'video' });
    var storyImg47 = st47.stories.filter(function (x) { return x.text === 'Historia foto 1.5.47'; })[0];
    var storyVid47 = st47.stories.filter(function (x) { return x.text === 'Historia video 1.5.47'; })[0];
    check('1.5.47 historias: la historia de foto sin portada se ve con su propia imagen', !!storyImg47 && T26.storyCardMediaHtml(storyImg47).indexOf('src="https://ejemplo.com/foto47.jpg"') >= 0);
    check('1.5.47 historias: la historia de video sin portada se ve como video (y su fotograma se intenta por detrás)', !!storyVid47 && T26.storyCardMediaHtml(storyVid47).indexOf('<video') >= 0 && !!storyVid47._coverTrying1547);
    check('1.5.47 historias: con portada guardada, la tarjeta usa la portada (no el video)', T26.storyCardMediaHtml({ id: 'st47x', mediaType: 'video', media: 'https://ejemplo.com/v2.mp4', cover: 'https://ejemplo.com/portada47.jpg' }).indexOf('src="https://ejemplo.com/portada47.jpg"') >= 0);
    check('1.5.47 historias: la historia de audio sigue con su portada de siempre', T26.storyCardMediaHtml({ id: 'st47a', mediaType: 'audio', media: 'https://ejemplo.com/audio47.mp3', cover: 'https://ejemplo.com/portada-audio47.jpg' }).indexOf('src="https://ejemplo.com/portada-audio47.jpg"') >= 0);
    T26.migrateStoryCovers1547();
    await new Promise(function (r) { setTimeout(r, 900); });
    check('1.5.47 historias: la migración pone la portada a las ya publicadas sin ella (foto = su imagen)', !!storyImg47 && storyImg47.cover === 'https://ejemplo.com/foto47.jpg', String(storyImg47 && storyImg47.cover));
    // --- vista previa inmediata ---
    var OrigCreateObjectURL47 = window.URL.createObjectURL;
    window.URL.createObjectURL = function (f) { return 'blob:wordred-test/' + (f && f.name ? f.name : 'archivo'); };
    var fileVid47 = new window.File(['video'], 'video-1547.mp4', { type: 'video/mp4' });
    var fileImg47 = new window.File(['foto'], 'foto-1547.jpg', { type: 'image/jpeg' });
    T26.commentMediaChange1526({ files: [fileVid47], value: '' });
    check('1.5.47 previa: al elegir un video para el comentario, la previa sale AL INSTANTE (blob) y es un video de verdad', !!T26.getCommentMedia() && T26.getCommentMedia().src.indexOf('blob:wordred-test/video-1547.mp4') === 0 && !!$('commentMediaPrev').querySelector('video[src^="blob:"]'), $('commentMediaPrev').innerHTML.slice(0, 160));
    await tick(); await tick();
    T26.commentMediaChange1526({ files: [fileImg47], value: '' });
    check('1.5.47 previa: al elegir una foto para el comentario, la previa es una imagen (no un video)', !!$('commentMediaPrev').querySelector('img[src^="blob:"]') && !$('commentMediaPrev').querySelector('video'), $('commentMediaPrev').innerHTML.slice(0, 160));
    await tick(); await tick();
    var photoInput47 = $('editPhotoInput');
    Object.defineProperty(photoInput47, 'files', { value: [fileImg47], configurable: true });
    photoInput47.dispatchEvent(new window.Event('change', { bubbles: true }));
    check('1.5.47 previa: al elegir la foto de perfil, la previa sale al instante (blob)', $('editAvatarPrev').innerHTML.indexOf('blob:wordred-test/foto-1547.jpg') >= 0, $('editAvatarPrev').innerHTML.slice(0, 160));
    await tick();
    var coverInput47 = $('editCoverInput');
    Object.defineProperty(coverInput47, 'files', { value: [fileImg47], configurable: true });
    coverInput47.dispatchEvent(new window.Event('change', { bubbles: true }));
    check('1.5.47 previa: al elegir la portada del perfil, la previa sale al instante (blob)', $('editCoverPrev').innerHTML.indexOf('blob:wordred-test/foto-1547.jpg') >= 0, $('editCoverPrev').innerHTML.slice(0, 160));
    await tick();
    var storyInput47 = $('storyMediaInput');
    Object.defineProperty(storyInput47, 'files', { value: [fileVid47], configurable: true });
    storyInput47.dispatchEvent(new window.Event('change', { bubbles: true }));
    check('1.5.47 previa: al elegir el video de la historia, el editor se abre AL INSTANTE con la previa (blob)', $('storyEditorOverlay').classList.contains('on') && !!T26.getStoryMedia() && T26.getStoryMedia().src.indexOf('blob:wordred-test/video-1547.mp4') === 0, String(T26.getStoryMedia() && T26.getStoryMedia().src));
    T26.hideOverlay('storyEditorOverlay');
    if (OrigCreateObjectURL47) window.URL.createObjectURL = OrigCreateObjectURL47; else delete window.URL.createObjectURL;
    await tick(); await tick();
    // --- barra continua: subida con varios elementos ---
    calls.media = []; calls.mediaFailStart = 0; calls.mediaFailChunk = 0; calls.mediaStartCount = 0;
    var img47a = 'data:image/jpeg;base64,' + Buffer.from('FOTO-DOM-47A').toString('base64');
    var img47b = 'data:image/jpeg;base64,' + Buffer.from('FOTO-DOM-47B').toString('base64');
    var song47 = 'data:audio/mpeg;base64,' + Buffer.from('CANCION-DOM-47').toString('base64');
    var job47 = { data: { text: 'Publicación 1.5.47 barra', mediaList: [{ src: img47a, type: 'image' }, { src: img47b, type: 'image' }], audioCover: img47a, song: { src: song47, title: 'Canción 47' } }, label: 'Publicando…', status: 'queued', progress: 0 };
    var seen47 = [];
    var res47 = null;
    var run47 = T26.bgUploadRunJob1529(job47).then(function (r) { res47 = r; });
    for (var pi47 = 0; pi47 < 500 && !res47; pi47++) {
      var p47 = T26.getUploadProgress();
      if (p47) seen47.push(parseInt(p47.pct, 10) || 0);
      await tick();
    }
    await run47;
    var pEnd47 = T26.getUploadProgress();
    if (pEnd47) seen47.push(parseInt(pEnd47.pct, 10) || 0);
    check('1.5.47 barra: la subida con 2 fotos + portada de audio + canción termina bien y crea la publicación', !!res47 && res47.ok === true && st47.posts.some(function (x) { return x.text === 'Publicación 1.5.47 barra'; }), String(res47 && res47.ok) + ' posts=' + st47.posts.length);
    check('1.5.47 barra: el porcentaje mostrado NUNCA vuelve atrás en una subida con varios elementos', seen47.length >= 2 && seen47.every(function (v, i) { return i === 0 || v >= seen47[i - 1]; }) && seen47[seen47.length - 1] === 100, seen47.join(','));
    // --- barra continua: reinicio completo (1.5.46) sin retroceso ---
    calls.media = []; calls.mediaFailStart = 0; calls.mediaFailChunk = 1; calls.mediaStartCount = 0;
    T26.core.setMediaUploadSleep1546(function () { return Promise.resolve(); });
    var job47b = { data: { text: 'Publicación 1.5.47 barra reinicio', mediaList: [{ src: img47a, type: 'image' }, { src: img47b, type: 'image' }], audioCover: '', song: null }, label: 'Publicando…', status: 'queued', progress: 0 };
    var seen47b = [];
    var res47b = null;
    var run47b = T26.bgUploadRunJob1529(job47b).then(function (r) { res47b = r; });
    for (var pi47b = 0; pi47b < 600 && !res47b; pi47b++) {
      var p47b = T26.getUploadProgress();
      if (p47b) seen47b.push(parseInt(p47b.pct, 10) || 0);
      await tick();
    }
    await run47b;
    var pEnd47b = T26.getUploadProgress();
    if (pEnd47b) seen47b.push(parseInt(pEnd47b.pct, 10) || 0);
    T26.core.setMediaUploadSleep1546(null);
    calls.mediaFailChunk = 0;
    check('1.5.47 barra: tras fallar un trozo y reiniciar la subida entera, la publicación se crea', !!res47b && res47b.ok === true && st47.posts.some(function (x) { return x.text === 'Publicación 1.5.47 barra reinicio'; }), String(res47b && res47b.ok));
    check('1.5.47 barra: el porcentaje tampoco vuelve atrás cuando la subida reinicia desde cero', seen47b.length >= 2 && seen47b.every(function (v, i) { return i === 0 || v >= seen47b[i - 1]; }), seen47b.join(','));
    // --- cajón: ajustes ---
    click($('navLauncherBtn'));
    await tick(); await tick();
    var gear47 = $('appsDrawerSettingsBtn1547');
    var newsBtn47 = $('appsDrawerNewsBtn1547');
    check('1.5.47 cajón: la rueda es el MISMO icono de Ajustes de la app (ic settings) en un botón redondo translúcido', !!gear47 && gear47.classList.contains('wOptRound1542') && gear47.innerHTML.indexOf('<svg') >= 0 && (gear47.innerHTML.indexOf('M19.4 15a1.65') >= 0 || gear47.innerHTML.indexOf('circle cx="12" cy="12" r="3"') >= 0), gear47 ? gear47.innerHTML.slice(0, 120) : 'sin botón');
    check('1.5.47 cajón: el botón de noticias va antes de la rueda en la barra superior', !!newsBtn47 && !!gear47 && (newsBtn47.compareDocumentPosition(gear47) & 4) === 4 && newsBtn47.classList.contains('wOptRound1542') && newsBtn47.innerHTML.indexOf('<svg') >= 0);
    click(gear47);
    await tick();
    check('1.5.47 cajón: la rueda abre los ajustes del cajón (mismo estilo translúcido de Ajustes)', $('drawerSettingsOverlay1547').classList.contains('on') && $('drawerSettingsOverlay1547').classList.contains('floatWin1547') && $('drawerSettingsBody1547').textContent.indexOf('Fondo') >= 0 && $('drawerSettingsBody1547').textContent.indexOf('Tema de iconos') >= 0, $('drawerSettingsBody1547').textContent.slice(0, 120));
    check('1.5.47 cajón: las animaciones vienen APAGADAS por defecto (regla de la app)', T26.drawerSettings1547().animations === false && $('appsDrawerOverlay').classList.contains('noAnim1547'));
    var sheet47 = $('appsDrawerOverlay').querySelector('.sheet');
    window.__wrDrawerBg('solid:#123a6d');
    check('1.5.47 cajón: el fondo sólido se aplica al instante en la hoja del cajón', !!sheet47 && sheet47.style.background.indexOf('18, 58, 109') >= 0, sheet47 ? sheet47.style.background : 'sin hoja');
    var alphaIn47 = $('drawerAlpha1547');
    alphaIn47.value = '80';
    alphaIn47.dispatchEvent(new window.Event('input', { bubbles: true }));
    check('1.5.47 cajón: el deslizador de transparencia cambia la opacidad del fondo', !!sheet47 && sheet47.style.background.indexOf('0.8') >= 0, sheet47 ? sheet47.style.background : 'sin hoja');
    window.__wrDrawerBg('wallpaper');
    window.__wrDrawerHide('com.demo.mensajes');
    check('1.5.47 cajón: ocultar una app la saca del cajón (sigue instalada)', !window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.mensajes"]') && $('drawerSettingsBody1547').textContent.indexOf('Mensajes') >= 0);
    window.__wrDrawerShow('com.demo.mensajes');
    check('1.5.47 cajón: la app oculta se restaura desde los ajustes', !!window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.mensajes"]'));
    window.__wrDrawerIconSize(72);
    check('1.5.47 cajón: el tamaño de icono grande se aplica a las fichas', !!window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-kind="app"] span') && window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-kind="app"] span').style.width === '72px');
    window.__wrDrawerTextSize(15);
    check('1.5.47 cajón: el tamaño de texto grande se aplica al nombre de las apps', !!window.document.querySelector('#appsDrawerGrid .launcherName') && window.document.querySelector('#appsDrawerGrid .launcherName').style.fontSize === '15px');
    window.__wrDrawerIconSize(60);
    window.__wrDrawerTextSize(11);
    calls.notifCounts = { 'com.demo.camara': 3, 'com.demo.mapas': 12, 'com.demo.galeria': 0 };
    calls.notifAccessGranted = true;
    T26.refreshAppNotifCounts();
    check('1.5.47 cajón: con los contadores activados, cada app lleva su numerito', !!window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.camara"] .appNotifBadge') && window.document.querySelector('#appsDrawerGrid .launcherTile[data-launcher-pkg="com.demo.camara"] .appNotifBadge').textContent === '3');
    var badgesTgl47 = $('drawerBadgesToggle1547');
    badgesTgl47.checked = false;
    badgesTgl47.dispatchEvent(new window.Event('change', { bubbles: true }));
    T26.refreshAppNotifCounts();
    check('1.5.47 cajón: con los contadores apagados, NO hay numeritos aunque haya acceso concedido (ni el refresco los vuelve a poner)', !window.document.querySelector('#appsDrawerGrid .appNotifBadge'));
    calls.notifCounts = {};
    calls.notifAccessGranted = false;
    badgesTgl47 = $('drawerBadgesToggle1547');
    badgesTgl47.checked = true;
    badgesTgl47.dispatchEvent(new window.Event('change', { bubbles: true }));
    window.__wrDrawerPack('byn');
    check('1.5.47 cajón: un paquete de iconos cambia visiblemente los iconos (clase del paquete)', $('appsDrawerOverlay').classList.contains('drawerPack-byn1547'));
    window.__wrDrawerPack('orig');
    var manyApps47 = [];
    for (var ai47 = 0; ai47 < 20; ai47++) manyApps47.push({ pkg: 'com.demo.app' + ai47, name: 'App ' + (ai47 < 10 ? '0' + ai47 : ai47), icon: '' });
    window.AndroidBridge.listInstalledApps = function () { return JSON.stringify(manyApps47); };
    T26.setInstalledApps(manyApps47);
    window.__wrDrawerPages('multi');
    check('1.5.47 cajón: el modo de varias páginas divide el cajón en páginas con puntitos', window.document.querySelectorAll('#appsDrawerGrid .launcherTile').length === 21 && !!window.document.querySelector('.appsDrawerDots1547') && window.document.querySelectorAll('.appsDrawerDots1547 button').length === 2, 'tiles=' + window.document.querySelectorAll('#appsDrawerGrid .launcherTile').length + ' dots=' + window.document.querySelectorAll('.appsDrawerDots1547 button').length);
    window.__wrDrawerPages('single');
    check('1.5.47 cajón: el modo de una sola página quita los puntitos', !window.document.querySelector('.appsDrawerDots1547'));
    // --- 1.5.48 cajón: se desliza con el dedo y nada se encima ---
    var css48 = Array.prototype.map.call(window.document.querySelectorAll('style'), function (st) { return st.textContent; }).join('\n');
    function touch48(el, y0, y1) {
      var s = new window.Event('touchstart', { bubbles: true }); s.changedTouches = [{ clientX: 100, clientY: y0 }]; el.dispatchEvent(s);
      var e = new window.Event('touchend', { bubbles: true }); e.changedTouches = [{ clientX: 100, clientY: y1 }]; el.dispatchEvent(e);
    }
    check('1.5.48 cajón: la lista se desliza con el dedo (desplazamiento vertical táctil)', window.getComputedStyle($('appsDrawerScroll')).overflowY === 'auto' && /\.appsDrawerScroll\{[^}]*-webkit-overflow-scrolling:touch/.test(css48));
    check('1.5.52 cajón: la barra superior no se encima (el título se acorta con puntos suspensivos antes que tapar los botones redondos, y Actualizar ya es un botón redondo fijo)', /#appsDrawerOverlay \.sheet \.top\{gap:6px\}/.test(css48) && /#appsDrawerOverlay \.sheet \.top h2\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/.test(css48) && /#appsDrawerOverlay \.sheet \.top \.xbtn\{flex:0 0 auto\}/.test(css48) && /\.wOptRound1542\{width:40px;height:40px;flex:0 0 40px/.test(css48) && !!$('appsDrawerRefresh') && $('appsDrawerRefresh').classList.contains('wOptRound1542'));
    check('1.5.52 cajón: la barra superior con 6 elementos cabe a 360 px (y a 415 px, el Motorola) sin tapar nada — fijos 36 + 4×40 px + 5 huecos de 6 px = 226 px < 296 px de ancho interior a 360 px y < 351 px a 415 px; el título se acorta con puntos suspensivos (min-width:0)', (function () { var inner360 = 360 - 32 - 32, inner415 = 415 - 32 - 32, fixed = 36 + 4 * 40 + 5 * 6; return fixed === 226 && fixed < inner360 && fixed < inner415; })());
    check('1.5.48 cajón: las pestañas «Mi orden»/«Por nombre» no se enciman (cada una la mitad del ancho y su texto cabe: 145 px por pestaña a 360 px, «Por nombre» mide 86 px)', (function () { var tabs = window.document.querySelectorAll('#appsSortTabs button'); return tabs.length === 2 && tabs[0].textContent.trim() === 'Mi orden' && tabs[1].textContent.trim() === 'Por nombre' && (360 - 32 - 32 - 6) / 2 > 86; })());
    check('1.5.48 cajón: el pulgar rojo nunca tapa los iconos (la cuadrícula deja 14 px a la derecha y el pulgar ocupa 2–8 px)', parseInt(window.getComputedStyle($('appsDrawerGrid')).paddingRight) === 14 && parseInt(window.getComputedStyle($('appsDrawerThumb')).width) === 6 && parseInt(window.getComputedStyle($('appsDrawerThumb')).left) === 2, 'padding=' + window.getComputedStyle($('appsDrawerGrid')).paddingRight + ' pulgar=' + window.getComputedStyle($('appsDrawerThumb')).width + '/' + window.getComputedStyle($('appsDrawerThumb')).left);
    check('1.5.48 cajón: en los ajustes del cajón, un nombre largo de app se acorta con puntos suspensivos sin empujar el botón Ocultar/Mostrar', !!window.document.querySelector('#drawerSettingsBody1547 span[style*="text-overflow:ellipsis"]') && !!window.document.querySelector('#drawerAlpha1547[style*="min-width:0"]'));
    var top48 = window.document.querySelector('#appsDrawerOverlay .sheet .top');
    touch48(top48, 100, 200);
    check('1.5.48 cajón: deslizar hacia abajo en la barra superior cierra el cajón', !$('appsDrawerOverlay').classList.contains('on'));
    click($('navLauncherBtn')); await tick(); await tick();
    var sc48 = $('appsDrawerScroll');
    sc48.scrollTop = 0;
    touch48(sc48, 300, 400);
    check('1.5.48 cajón: deslizar hacia abajo en la lista (arriba del todo) también cierra el cajón', !$('appsDrawerOverlay').classList.contains('on'));
    click($('navLauncherBtn')); await tick(); await tick();
    sc48.scrollTop = 120;
    touch48(sc48, 300, 400);
    check('1.5.48 cajón: deslizar hacia abajo con la lista bajada NO cierra el cajón (sigue desplazando)', $('appsDrawerOverlay').classList.contains('on'));
    sc48.scrollTop = 0;
    touch48(sc48, 300, 330);
    check('1.5.48 cajón: un arrastre corto hacia abajo no cierra el cajón', $('appsDrawerOverlay').classList.contains('on'));
    window.__wrDrawerPages('multi');
    check('1.5.48 cajón: en modo varias páginas el cambio de página con el dedo está cableado (contenedor con desplazamiento horizontal + ajuste por página y fichas que dejan pasar el gesto de lado)', /#appsDrawerOverlay \.appsDrawerPages1547\{display:flex;overflow-x:auto;scroll-snap-type:x mandatory/.test(css48) && /#appsDrawerOverlay \.appsDrawerPages1547 \.launcherTile\{touch-action:pan-x pan-y\}/.test(css48) && window.getComputedStyle($('appsDrawerPages1547')).overflowX === 'auto' && window.document.querySelectorAll('.appsDrawerDots1547 button').length === 2);
    check('1.5.48 cajón: en modo varias páginas la cuadrícula exterior es de 1 columna (las páginas y los puntitos van a todo lo ancho, no apretados en un hueco)', $('appsDrawerGrid').style.gridTemplateColumns === '1fr', $('appsDrawerGrid').style.gridTemplateColumns);
    // --- 1.5.52 cajón: varias páginas por defecto, más alto, Actualizar y Ocultar como símbolos, ajustes en grupos ---
    if (!$('appsDrawerOverlay').classList.contains('on')) { click($('navLauncherBtn')); await tick(); await tick(); }
    var drawerSaved52 = st47.settings.drawer1547;
    delete st47.settings.drawer1547;
    check('1.5.52 cajón: sin ajuste guardado, las páginas son varias por defecto', T26.drawerSettings1547().pages === 'multi');
    if (drawerSaved52) st47.settings.drawer1547 = drawerSaved52;
    var rf52 = $('appsDrawerRefresh'), hd52 = $('appsDrawerHideBtn1552'), nw52 = $('appsDrawerNewsBtn1547'), gr52 = $('appsDrawerSettingsBtn1547');
    check('1.5.52 cajón: Actualizar es un botón redondo sin texto con el icono de actualizar', !!rf52 && rf52.classList.contains('wOptRound1542') && rf52.textContent.trim() === '' && rf52.innerHTML.indexOf('M3.51 9a9 9 0 0 1 14.85-3.36') >= 0 && rf52.getAttribute('aria-label') === 'Actualizar');
    check('1.5.52 cajón: el botón de ocultar existe justo después de Noticias, sin texto, con el ojo tachado', !!hd52 && !!nw52 && nw52.nextElementSibling === hd52 && hd52.classList.contains('wOptRound1542') && hd52.textContent.trim() === '' && hd52.innerHTML.indexOf('M17.94 17.94A10.07') >= 0 && hd52.getAttribute('aria-label') === 'Ocultar aplicaciones');
    check('1.5.52 cajón: tras Ocultar van los Ajustes (orden: Actualizar, Noticias, Ocultar, Ajustes)', !!hd52 && !!gr52 && hd52.nextElementSibling === gr52);
    var origScroll52 = window.Element.prototype.scrollIntoView;
    var hideSeen52 = false;
    window.Element.prototype.scrollIntoView = function () { hideSeen52 = true; };
    click(hd52);
    await tick(); await tick();
    window.Element.prototype.scrollIntoView = origScroll52;
    check('1.5.52 cajón: tocar Ocultar abre los ajustes del cajón desplazados hasta la sección de ocultar', $('drawerSettingsOverlay1547').classList.contains('on') && !!$('drawerHideSection1552') && hideSeen52);
    var h3s52 = Array.prototype.map.call(window.document.querySelectorAll('#drawerSettingsOverlay1547 h3.sectitle'), function (h) { return h.textContent.trim(); });
    check('1.5.52 cajón: los ajustes quedan en grupos (apariencia, tamaño y páginas, comportamiento)', JSON.stringify(h3s52) === JSON.stringify(['Fondo', 'Transparencia', 'Tema de iconos', 'Tamaño', 'Acomodar', 'Páginas', 'Ocultar aplicaciones', 'Contadores de notificaciones', 'Animaciones']), 'h3=' + h3s52.join(' | '));
    check('1.5.52 cajón: la hoja del cajón es más alta que antes (94dvh)', /#appsDrawerOverlay\.floatWin1547 \.sheet\{[^}]*max-height:94dvh/.test(css48));
    click(window.document.querySelector('#drawerSettingsOverlay1547 [data-close="drawerSettingsOverlay1547"]'));
    await tick();
    window.__wrDrawerPages('single');
    window.__wrDrawerIconSize(60);
    check('1.5.48 cajón: sin columnas guardadas, el número se calcula del ancho real (4 columnas con iconos de 60 px)', /repeat\(4, ?1fr\)/.test($('appsDrawerGrid').style.gridTemplateColumns || ''), $('appsDrawerGrid').style.gridTemplateColumns);
    window.__wrDrawerIconSize(72);
    check('1.5.48 cajón: con iconos grandes las columnas bajan solas (3) para que el icono no se monte sobre el vecino', /repeat\(3, ?1fr\)/.test($('appsDrawerGrid').style.gridTemplateColumns || ''), $('appsDrawerGrid').style.gridTemplateColumns);
    window.__wrDrawerIconSize(60);
    window.AndroidBridge.listInstalledApps = origList47;
    if (origApps47) T26.setInstalledApps(origApps47);
    T26.hideOverlay('drawerSettingsOverlay1547');
    await tick();
    // --- noticias ---
    click(newsBtn47);
    await tick(); await tick();
    check('1.5.47 noticias: el botón del cajón abre el centro de noticias con sus pestañas', $('newsHubOverlay1547').classList.contains('on') && $('newsHubOverlay1547').textContent.indexOf('Deportes') >= 0 && $('newsHubOverlay1547').textContent.indexOf('Tecnología') >= 0 && $('newsHubOverlay1547').textContent.indexOf('Economía') >= 0, $('newsHubOverlay1547').textContent.slice(0, 120));
    await waitFor(function () { return $('newsHubOverlay1547').textContent.indexOf('Noticia en vivo de prueba 1 (noticias)') >= 0; }, 5000);
    check('1.5.47 noticias: el centro muestra noticias en vivo (del servicio, no de la lista fija)', $('newsHubOverlay1547').textContent.indexOf('Noticia en vivo de prueba 1 (noticias)') >= 0, $('newsHubOverlay1547').textContent.slice(0, 200));
    window.__wrNewsTab('deportes');
    await waitFor(function () { return $('newsHubOverlay1547').textContent.indexOf('Noticia en vivo de prueba 1 (deportes)') >= 0; }, 5000);
    check('1.5.47 noticias: la pestaña Deportes cambia la lista a noticias de deportes', $('newsHubOverlay1547').textContent.indexOf('Noticia en vivo de prueba 1 (deportes)') >= 0 && $('newsHubOverlay1547').textContent.indexOf('Noticia en vivo de prueba 1 (noticias)') < 0, $('newsHubOverlay1547').textContent.slice(0, 200));
    T26.hideOverlay('newsHubOverlay1547');
    for (var np47 = 0; np47 < 10; np47++) T26.core.createPost(st47, st47.me, { text: 'Post 1.5.47 ' + np47 });
    T26.go('feed'); T26.renderFeed();
    await tick(); await tick(); await tick();
    check('1.5.47 noticias: la fila aparece en el inicio con su cabecera (icono + "Noticias") y sus tarjetas', !!window.document.querySelector('#newsRow1547') && window.document.querySelector('#newsRow1547').textContent.indexOf('Noticias') >= 0 && window.document.querySelectorAll('#newsRow1547 .newsCard1547').length >= 2, 'tarjetas=' + window.document.querySelectorAll('#newsRow1547 .newsCard1547').length);
    var feedKids47 = Array.prototype.slice.call(window.document.querySelector('#feed').children);
    var idxReels47 = feedKids47.findIndex(function (el) { return el.classList.contains('reelsRow'); });
    var idxMovies47 = feedKids47.findIndex(function (el) { return el.id === 'billboard1540'; });
    var idxNews47 = feedKids47.findIndex(function (el) { return el.id === 'newsRow1547'; });
    var idxGames47 = feedKids47.findIndex(function (el) { return el.id === 'gamesBillboard1543'; });
    check('1.5.47 noticias: las secciones van separadas por publicaciones (reels 2.º, películas 5.º, noticias 7.º, juegos 10.º)', idxReels47 >= 0 && idxMovies47 > idxReels47 && idxNews47 > idxMovies47 && idxGames47 > idxNews47, 'reels=' + idxReels47 + ' películas=' + idxMovies47 + ' noticias=' + idxNews47 + ' juegos=' + idxGames47);
    check('1.5.47 noticias: la fila de noticias tiene publicaciones a los dos lados (nunca pegada a otra sección)', idxNews47 > 0 && feedKids47[idxNews47 - 1].classList.contains('post') && idxNews47 < feedKids47.length - 1 && feedKids47[idxNews47 + 1].classList.contains('post'));
    var beforeOpen47 = calls.openExternalUrl.length;
    click(window.document.querySelector('#newsRow1547 .newsCard1547'));
    check('1.5.47 noticias: tocar una tarjeta abre el artículo en el navegador del teléfono (fuera de WordRed)', calls.openExternalUrl.length === beforeOpen47 + 1 && calls.openExternalUrl[calls.openExternalUrl.length - 1].indexOf('https://') === 0, String(calls.openExternalUrl[calls.openExternalUrl.length - 1]));
    // --- promociones ---
    var promoPostA47 = T26.core.createPost(st47, st47.me, { text: 'Post promo 1.5.47 A' }).post;
    var promoPostB47 = T26.core.createPost(st47, st47.me, { text: 'Post promo 1.5.47 B' }).post;
    T26.renderFeed();
    await tick(); await tick();
    var cardA47 = window.document.querySelector('article.post[data-post="' + promoPostA47.id + '"]');
    var promoteBtn47 = cardA47 && cardA47.querySelector('.headActions .wOptRound1542[aria-label="Promocionar publicación"]');
    var editBtn47 = cardA47 && cardA47.querySelector('.headActions button[title="Modificar publicación"]');
    check('1.5.47 promociones: tu publicación tiene el botón de promocionar (solo megáfono, sin texto) JUSTO DESPUÉS de Editar', !!promoteBtn47 && !!editBtn47 && promoteBtn47.textContent.trim() === '' && promoteBtn47.innerHTML.indexOf('<svg') >= 0 && Array.prototype.indexOf.call(cardA47.querySelector('.headActions').children, promoteBtn47) === Array.prototype.indexOf.call(cardA47.querySelector('.headActions').children, editBtn47) + 1);
    check('1.5.47 promociones: la estimación crece con el presupuesto (más dinero, más alcance)', T26.promoEstimate1547('views', 50) === 1000 && T26.promoEstimate1547('views', 500) === 15000 && T26.promoEstimate1547('followers', 50) === 50 && T26.promoEstimate1547('followers', 500) === 800);
    window.__wrPromotePost(promoPostA47.id);
    await tick();
    check('1.5.47 promociones: la hoja de promocionar trae objetivo, presupuestos en MXN y pago a la cuenta de apoyo', $('promoteSheetOverlay1547').classList.contains('on') && $('promoteSheetBody1547').textContent.indexOf('Objetivo') >= 0 && $('promoteSheetBody1547').textContent.indexOf('$50') >= 0 && $('promoteSheetBody1547').textContent.indexOf('Ya pagué') >= 0 && $('promoAccount1547').textContent.trim() === $('supportAccount').textContent.trim(), $('promoteSheetBody1547').textContent.slice(0, 160));
    window.__wrPromoTier(200);
    await tick();
    check('1.5.47 promociones: al elegir un presupuesto la promoción queda pendiente', T26.promotions1547().length === 1 && T26.promotions1547()[0].status === 'pending' && T26.promotions1547()[0].budget === 200 && T26.promotions1547()[0].postId === promoPostA47.id);
    window.__wrPromoPaid();
    await tick(); await tick();
    T26.renderFeed();
    await tick(); await tick();
    var firstPost47 = window.document.querySelector('#feed article.post');
    check('1.5.53 promociones: al pagar, la publicación queda «En verificación» (sin «Promocionado» y sin subir al primer lugar)', !!window.document.querySelector('article.post[data-post="' + promoPostA47.id + '"] .promoVerifying1553') && !window.document.querySelector('article.post[data-post="' + promoPostA47.id + '"] .promoBadge1547') && !!firstPost47 && firstPost47.getAttribute('data-post') === promoPostB47.id, firstPost47 ? firstPost47.getAttribute('data-post') : 'sin publicaciones');
    // 1.5.54: la moneda ya no está en el encabezado; vive en el perfil propio, antes del lápiz.
    T26.go('profile');
    await tick();
    check('1.5.47 promociones: la moneda con la W está en el perfil propio, antes del botón de editar', !!window.document.querySelector('#ownProfile .ownPromoCoin1547') && !!window.document.querySelector('#ownProfile .ownPromoCoin1547 .coinW1547') && !window.document.querySelector('header .coinW1547'));
    click(window.document.querySelector('#ownProfile .ownPromoCoin1547'));
    await tick();
    check('1.5.47 promociones: la moneda abre el centro de promociones (activas, pendientes, historial y crear)', $('promotionsHubOverlay1547').classList.contains('on') && $('promotionsHubBody1547').textContent.indexOf('Activas') >= 0 && $('promotionsHubBody1547').textContent.indexOf('Historial') >= 0 && $('promotionsHubBody1547').textContent.indexOf('Promocionar un video') >= 0, $('promotionsHubBody1547').textContent.slice(0, 140));
    T26.hideOverlay('promotionsHubOverlay1547');
    T26.go('feed');
    // --- 1.5.53 promociones: «Ya pagué» pide verificación, no auto-activa ---
    var promoCalls53 = [];
    var origServerFetch53 = C26.serverFetch;
    C26.serverFetch = async function (state, path, method, body) {
      promoCalls53.push({ path: path, method: method, body: body });
      if (path === '/api/promotions/request') return { ok: true, data: { ok: true, request: { id: 'req-b53', postId: body.postId, status: 'pending' } } };
      return { ok: true, data: { ok: true } };
    };
    window.__wrPromotePost(promoPostB47.id);
    await tick();
    window.__wrPromoTier(100);
    await tick();
    window.__wrPromoPaid();
    await tick(); await tick(); await tick();
    T26.renderFeed();
    await tick(); await tick();
    check('1.5.53 promociones: al pagar, la solicitud se manda al servidor con POST /api/promotions/request (postId, nivel y objetivo; nada de PUT {promoted:true})', promoCalls53.some(function (c) { return c.method === 'POST' && c.path === '/api/promotions/request' && c.body && c.body.postId === promoPostB47.id && c.body.tier === 100 && c.body.goal === 'views'; }) && !promoCalls53.some(function (c) { return c.method === 'PUT' && c.path === '/api/posts/' + promoPostB47.id; }), JSON.stringify(promoCalls53));
    check('1.5.53 promociones: al pagar, la publicación NO queda promocionada: queda «En verificación» (sin insignia y sin subir)', (function () { var p = null; st47.posts.forEach(function (x) { if (x.id === promoPostB47.id) p = x; }); var pr = T26.promotions1547().filter(function (x) { return x.postId === promoPostB47.id; })[0]; return !!p && p.promoted !== true && !!pr && pr.status === 'verifying' && !!window.document.querySelector('article.post[data-post="' + promoPostB47.id + '"] .promoVerifying1553') && !window.document.querySelector('article.post[data-post="' + promoPostB47.id + '"] .promoBadge1547'); })());
    var promoPostC47 = T26.core.createPost(st47, st47.me, { text: 'Post promo 1.5.53 C' }).post;
    window.__wrPromotePost(promoPostC47.id);
    await tick();
    window.__wrPromoTier(50);
    await tick();
    C26.serverFetch = async function (state, path, method, body) { promoCalls53.push({ path: path, method: method, body: body }); return { ok: false, error: 'No se pudo conectar al servidor' }; };
    window.__wrPromoPaid();
    await tick(); await tick(); await tick();
    T26.renderFeed();
    await tick(); await tick();
    check('1.5.53 promociones: si el servidor no responde, la publicación NO se promociona sola: queda «En verificación»', (function () { var p = null; st47.posts.forEach(function (x) { if (x.id === promoPostC47.id) p = x; }); var pr = T26.promotions1547().filter(function (x) { return x.postId === promoPostC47.id; })[0]; return !!p && p.promoted !== true && !!pr && pr.status === 'verifying' && !!window.document.querySelector('article.post[data-post="' + promoPostC47.id + '"] .promoVerifying1553'); })());
    check('1.5.53 promociones: si el servidor no responde, la solicitud queda en la cola de pendientes (POST /api/promotions/request)', st47.pendingQueue.some(function (it) { return it.kind === 'http' && it.method === 'POST' && it.path === '/api/promotions/request' && it.body && it.body.postId === promoPostC47.id && it.body.tier === 50; }), JSON.stringify(st47.pendingQueue));
    // El vaciado de la cola llama al serverFetch interno del núcleo (no
    // al de las exportaciones), así que se captura a nivel de fetch.
    var promoFetch53 = [];
    var fetchOrig53 = window.fetch;
    window.fetch = async function (url, opts) {
      promoFetch53.push({ url: String(url), method: (opts && opts.method) || 'GET', body: (opts && opts.body) || null });
      return fetchOrig53(url, opts);
    };
    await C26.flushPendingQueue(st47);
    window.fetch = fetchOrig53;
    check('1.5.53 promociones: al reconectar, la cola reenvía el POST /api/promotions/request tal cual y lo saca de la cola', promoFetch53.some(function (c) { return c.method === 'POST' && c.url.indexOf('/api/promotions/request') >= 0 && c.body && c.body.indexOf(promoPostC47.id) >= 0; }) && !st47.pendingQueue.some(function (it) { return it.kind === 'http' && it.path === '/api/promotions/request' && it.body && it.body.postId === promoPostC47.id; }), JSON.stringify(promoFetch53));
    var promoPostD47 = T26.core.createPost(st47, st47.me, { text: 'Post promo 1.5.53 D' }).post;
    promoPostD47.promoted = true;
    promoCalls53 = [];
    C26.serverFetch = async function (state, path, method, body) {
      promoCalls53.push({ path: path, method: method, body: body });
      return { ok: true, data: { ok: true, post: { id: promoPostD47.id, promoted: true } } };
    };
    await T26.pushPostToServer(promoPostD47);
    check('1.5.53 promociones: al publicar una publicación ya promocionada, el POST lleva promoted:true', promoCalls53.some(function (c) { return c.method === 'POST' && c.path === '/api/posts' && c.body && c.body.post && c.body.post.id === promoPostD47.id && c.body.post.promoted === true; }), JSON.stringify(promoCalls53));
    C26.serverFetch = origServerFetch53;
    // --- ventanas flotantes ---
    T26.showOverlay('settingsOverlay');
    await tick();
    var setSheet47 = $('settingsOverlay').querySelector('.sheet');
    check('1.5.60 ajustes: Ajustes se abre como ventana flotante translúcida (hoja oscura en degradado, esquinas de 28 px)', $('settingsOverlay').classList.contains('floatWin1547') && window.getComputedStyle($('settingsOverlay')).display === 'flex' && !!setSheet47 && window.getComputedStyle(setSheet47).backgroundImage.indexOf('linear-gradient') >= 0 && window.getComputedStyle(setSheet47).borderRadius === '28px', setSheet47 ? window.getComputedStyle(setSheet47).backgroundImage.slice(0, 80) + ' / ' + window.getComputedStyle(setSheet47).borderRadius : 'sin hoja');
    check('1.5.47 flotantes: Ajustes sigue con todo su contenido (el botón "?" abre la ayuda)', !!$('settingsFaqBtn1542'));
    click($('settingsFaqBtn1542'));
    await tick();
    check('1.5.47 flotantes: el panel de ayuda también es una ventana flotante translúcida', $('faqOverlay1543').classList.contains('on') && $('faqOverlay1543').classList.contains('floatWin1547'));
    T26.hideOverlay('faqOverlay1543');
    T26.hideOverlay('settingsOverlay');
    T26.showOverlay('confirmOverlay');
    await tick();
    check('1.5.47 flotantes: los diálogos de confirmación son ventanas flotantes translúcidas', $('confirmOverlay').classList.contains('floatWin1547') && window.getComputedStyle($('confirmOverlay')).display === 'flex');
    T26.hideOverlay('confirmOverlay');
    T26.showOverlay('shareChoiceOverlay');
    await tick();
    check('1.5.47 flotantes: la elección de compartir también es una ventana flotante', $('shareChoiceOverlay').classList.contains('floatWin1547') && window.getComputedStyle($('shareChoiceOverlay')).display === 'flex');
    T26.hideOverlay('shareChoiceOverlay');
    click($('navLauncherBtn'));
    await tick(); await tick();
    check('1.5.47 flotantes: el cajón de aplicaciones también es una ventana flotante (con su cuadrícula dentro)', $('appsDrawerOverlay').classList.contains('floatWin1547') && window.getComputedStyle($('appsDrawerOverlay')).display === 'flex' && window.document.querySelectorAll('#appsDrawerGrid .launcherTile').length >= 6, 'tiles=' + window.document.querySelectorAll('#appsDrawerGrid .launcherTile').length);
    // --- barra inferior (1.5.48: como antes de 1.5.47, solo quedan las animaciones de presión) ---
    var navCS47 = window.getComputedStyle($('bottomNav'));
    var css47 = Array.prototype.map.call(window.document.querySelectorAll('style'), function (st) { return st.textContent; }).join('\n');
    check('1.5.48 barra inferior: la barra vuelve al flex de antes de 1.5.47 (dos grupos laterales flex:1 + botón central flex:0 0 auto), sin la grid de 5 columnas', navCS47.display === 'flex' && !/nav#bottomNav\{[^}]*grid-template-columns:repeat\(5,1fr\)/.test(css47) && /nav#bottomNav \.bn-side\{flex:1/.test(css47) && /nav#bottomNav button\.bn-launcher\{flex:0 0 auto/.test(css47) && !/\.bn-side\{display:contents/.test(css47) && !/justify-self:center/.test(css47), navCS47.display);
    var feedBtn47 = window.document.querySelector('#bottomNav button[data-nav="feed"]');
    feedBtn47.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    check('1.5.48 barra inferior: al presionar un icono lateral se achica (animación de presión, se queda)', feedBtn47.classList.contains('bnPress1547'));
    feedBtn47.dispatchEvent(new window.Event('pointerup', { bubbles: true }));
    check('1.5.48 barra inferior: al soltar el icono vuelve a su tamaño', !feedBtn47.classList.contains('bnPress1547'));
    var launcherBtn47 = $('navLauncherBtn');
    launcherBtn47.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    check('1.5.48 barra inferior: el botón rojo del centro NO tiene animación de presión', !launcherBtn47.classList.contains('bnPress1547'));
    // --- noticias: lista fija cuando el servicio falla ---
    var fetchOrig47 = window.fetch;
    window.fetch = async function (url, opts) { if (String(url).indexOf('api.rss2json.com') >= 0) throw new Error('fetch fallido (sin noticias)'); return fetchOrig47(url, opts); };
    window.localStorage.removeItem('wordred_news1547_noticias');
    T26.go('feed'); T26.renderFeed();
    await tick(); await tick(); await tick();
    check('1.5.47 noticias: si el servicio en vivo falla, se ve la lista fija real (BBC Mundo)', !!window.document.querySelector('#newsRow1547') && window.document.querySelector('#newsRow1547').textContent.indexOf('BBC Mundo') >= 0, window.document.querySelector('#newsRow1547') ? window.document.querySelector('#newsRow1547').textContent.slice(0, 160) : 'sin fila');
    window.fetch = fetchOrig47;
    // --- noticias: inicio corto ---
    var shortPosts47 = savedPosts47.slice(0, 2);
    var vidPost47 = savedPosts47.filter(function (x) { return x.mediaType === 'video' || (x.media && /\.mp4/i.test(x.media)); })[0];
    if (vidPost47) shortPosts47.push(vidPost47);
    st47.posts = shortPosts47;
    T26.setState(st47);
    T26.go('feed'); T26.renderFeed();
    await tick(); await tick();
    var shortKids47 = Array.prototype.slice.call(window.document.querySelector('#feed').children);
    var sReels47 = shortKids47.findIndex(function (el) { return el.classList.contains('reelsRow'); });
    var sMovies47 = shortKids47.findIndex(function (el) { return el.id === 'billboard1540'; });
    var sNews47 = shortKids47.findIndex(function (el) { return el.id === 'newsRow1547'; });
    var sGames47 = shortKids47.findIndex(function (el) { return el.id === 'gamesBillboard1543'; });
    check('1.5.47 noticias: con un inicio corto, las secciones van al final en el mismo orden (reels, películas, noticias, juegos)', sReels47 >= 0 && sMovies47 > sReels47 && sNews47 > sMovies47 && sGames47 > sNews47, 'reels=' + sReels47 + ' películas=' + sMovies47 + ' noticias=' + sNews47 + ' juegos=' + sGames47);
    // --- restaurar lo que tocó el bloque ---
    st26.posts = savedPosts47;
    st26.stories = savedStories47;
    if (savedPromo47 === undefined) delete st26.promotions1547; else st26.promotions1547 = savedPromo47;
    if (st26.settings) delete st26.settings.drawer1547;
    T26.applyDrawerSettings1547();
    window.localStorage.removeItem('wordred_news1547_noticias');
    window.localStorage.removeItem('wordred_news1547_deportes');
    window.localStorage.removeItem('wordred_news1547_tecnologia');
    window.localStorage.removeItem('wordred_news1547_entretenimiento');
    window.localStorage.removeItem('wordred_news1547_economia');
    calls.notifCounts = {};
    T26.setState(st26);
    T26.go('feed'); T26.renderFeed();
    await tick();
    // Volver al estado original para no ensuciar la limpieza final.
    st26.screenTime = savedScreenTime33;
    st26.posts = savedPosts33;
    st26.profiles = savedProfiles33;
    st26.settings.examplesOverride = savedOverride33;
    st26.settings.tutorialSeen1533 = savedSeen33;
    T26.setState(st26);

    if (gc26 && gc26.group) st26.groupChats = (st26.groupChats || []).filter(function (g) { return g.id !== gc26.group.id; });
    st26.profiles[BRUNO26].birthday = '';
    st26.profiles[CARLA26].birthday = '';
    if (oldBruno26) st26.profiles[BRUNO26] = oldBruno26; else delete st26.profiles[BRUNO26];
    if (oldCarla26) st26.profiles[CARLA26] = oldCarla26; else delete st26.profiles[CARLA26];
    myProfile26().note = ''; myProfile26().songOfTheDay = null; myProfile26().pinnedCover = ''; myProfile26().pinnedPosts = [];
    // --- 1.5.49 K-Dramas: sección fija en el Inicio, visor vertical dentro de la app ---
    // 1.5.52: el fetch de arranque ya pintó los dramas de prueba del simulador; volver a la lista fija para estas pruebas.
    window.localStorage.removeItem('wordred_kdramas1561');
    T26.resetKdramas1554();
    T26.renderKdramaHome1549();
    var kdSec49 = $('homeKdrama1549');
    check('1.5.49 K-Dramas: la sección está en el Inicio, fija justo debajo de «+ Agregar apartado»', !!kdSec49 && kdSec49.parentElement === $('homeWidgets1536') && kdSec49.previousElementSibling === $('homeAddBtn1536'));
    check('1.5.49 K-Dramas: la sección NO lleva data-widget (no es un apartado editable)', !!kdSec49 && !kdSec49.hasAttribute('data-widget'));
    var kdTiles49 = qa('#kdramaReels1549 .reelTile');
    check('1.5.63 Dramas: hay 48 portadas verticales, una por serie, con su fotograma del video y la insignia de su aplicación', kdTiles49.length === 48 && kdTiles49.every(function (t) { var im = t.querySelector('img'); return !!im && /^https:\/\/res\.cloudinary\.com\/bekxop7h\/image\/upload\/v[0-9]+\/wordred\/dramas\/[A-Za-z0-9_-]{11}-cover(-720)?\.jpg$/.test(im.getAttribute('src')) && !!t.querySelector('.kdBadge1549') && (t.querySelector('.kdBadge1549').textContent === 'ReelShort' || t.querySelector('.kdBadge1549').textContent === 'ShortMax') && im.getAttribute('data-kd-kind') === 'dramaTile' && /^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/hqdefault\.jpg$/.test(im.getAttribute('data-kd-fallback') || '') && t.textContent.indexOf('1 capítulo gratis de ') >= 0; }), 'tiles=' + kdTiles49.length);
    check('1.5.62 Dramas: el catálogo trae 46 series de ReelShort y 2 de ShortMax, cada una con 1 entrada gratis', (function () { var c = T26.getKdramaCatalog1549(); return c.length === 48 && c.filter(function (s) { return s.source === 'ReelShort'; }).length === 46 && c.filter(function (s) { return s.source === 'ShortMax'; }).length === 2 && c[0].name === 'La doble vida de mi esposo multimillonario' && c[47].name === 'Enamorada del diablo' && c.every(function (s) { return Array.isArray(s.eps) && s.eps.length === 1 && s.eps[0].videoId.length === 11; }); })());
    check('1.5.61 Dramas: cada entrada gratis lleva su videoId, título y miniatura de YouTube', T26.getKdramaCatalog1549().every(function (s) { return s.eps.every(function (e) { return e.ep >= 1 && e.ep <= s.totalEps && !!e.title && /^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/hqdefault\.jpg$/.test(e.thumb || ''); }); }));
    check('1.5.61 Dramas: ningún drama original ni de DramaBox queda en el catálogo (sin chapters ni «DramaBox»)', T26.getKdramaCatalog1549().every(function (s) { return !s.chapters && JSON.stringify(s).indexOf('DramaBox') < 0; }) && JSON.stringify(T26.getKdramaCatalog1549()).indexOf('El contrato de la heredera') < 0);
    check('1.5.63 FAQ: la novedad es la 1.5.63 (portadas verticales de dramas, mismo tamaño que los reels) y la 1.5.61 ya no está', (function () { var f = T26.getFaq().filter(function (x) { return x.q === '¿Qué hay de nuevo en la 1.5.63?'; })[0]; return !!f && f.a.length <= 400 && f.a.indexOf('verticales') >= 0 && f.a.indexOf('mismo tamaño') >= 0 && T26.getFaq().filter(function (x) { return x.q === '¿Qué hay de nuevo en la 1.5.61?'; }).length === 0; })());
    // --- 1.5.63 portadas verticales: el drama se ve del mismo tamaño que los reels y llena su recuadro ---
    check('1.5.63 respaldo: si la portada vertical no carga, la tarjeta intenta la miniatura de YouTube (una sola vez)', (function () { var im = kdTiles49[0].querySelector('img'); if (!im) return false; var clone = im.cloneNode(false); var fb = clone.getAttribute('data-kd-fallback'); if (!fb || !/^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/hqdefault\.jpg$/.test(fb)) return false; window.__wrKdPosterFallback1563(clone); if (clone.getAttribute('src') !== fb) return false; window.__wrKdPosterFallback1563(clone); return clone.getAttribute('src') === fb; })());
    check('1.5.63 historias: la tarjeta de drama en la fila tiene la misma caja que un reel (mismas clases, portada vertical)', (function () { T26.renderStories(); var tiles = window.document.querySelectorAll('#storiesRow .homeReel1549'); var drama = null; var other = null; for (var k = 0; k < tiles.length; k++) { if (tiles[k].getAttribute('data-kd-story1562')) drama = tiles[k]; else if (!other) other = tiles[k]; } if (!drama || !other) return false; var dRect = drama.querySelector('.homeReelRect1560'); var oRect = other.querySelector('.homeReelRect1560'); if (!dRect || !oRect) return false; var dImg = dRect.querySelector('img'); return dRect.className === oRect.className && !!dImg && /^https:\/\/res\.cloudinary\.com\/bekxop7h\/image\/upload\/v[0-9]+\/wordred\/dramas\/[A-Za-z0-9_-]{11}-cover(-720)?\.jpg$/.test(dImg.getAttribute('src')) && dImg.getAttribute('data-kd-fallback') && dImg.getAttribute('data-kd-fallback').indexOf('hqdefault.jpg') >= 0; })());
    check('1.5.63 shorts: la tarjeta de drama llena el mismo escenario que un Short (100%×100%, cover, portada vertical)', (function () { var feed = T26.core.shortsFeed(st26, st26.me); var withDrama = T26.kdInterleaveDramas1562(feed); var d = null; withDrama.forEach(function (it) { if (!d && it.kind === 'drama') d = it; }); if (!d) return false; window.__wrOpenShort(d.id); var im = window.document.querySelector('#shortsBody img[data-kd-kind="short"]'); if (!im) return false; return im.style.width === '100%' && im.style.height === '100%' && im.style.objectFit === 'cover' && /^https:\/\/res\.cloudinary\.com\/bekxop7h\/image\/upload\/v[0-9]+\/wordred\/dramas\/[A-Za-z0-9_-]{11}-cover(-720)?\.jpg$/.test(im.getAttribute('src')); })());
    check('1.5.63 shorts: los botones de acción siguen ocultos solo en la tarjeta de drama', (function () { var like = $('shortsLike'); return !!like && like.style.display === 'none'; })());    // --- 1.5.53 promociones: la sincronización activa o rechaza; config del creador ---
    var savedPosts53 = st26.posts.slice();
    var savedPromo53 = st26.promotions1547;
    var savedHw53 = st26.homeWidgets1536 ? JSON.parse(JSON.stringify(st26.homeWidgets1536)) : null;
    var savedApplied53 = st26.creatorConfigApplied1553 ? JSON.parse(JSON.stringify(st26.creatorConfigApplied1553)) : null;
    var promoPostD53 = T26.core.createPost(st26, st26.me, { text: 'Post promo 1.5.53 D' }).post;
    var promoPostE53 = T26.core.createPost(st26, st26.me, { text: 'Post promo 1.5.53 E' }).post;
    T26.renderFeed();
    await tick(); await tick();
    window.__wrPromotePost(promoPostD53.id);
    await tick();
    window.__wrPromoTier(50);
    await tick();
    window.__wrPromoPaid();
    await tick(); await tick(); await tick();
    window.__wrPromotePost(promoPostE53.id);
    await tick();
    window.__wrPromoTier(100);
    await tick();
    window.__wrPromoPaid();
    await tick(); await tick(); await tick();
    var origFetch53b = C26.serverFetch;
    C26.serverFetch = async function (state, path, method, body) {
      if (path === '/api/promotions/mine') return { ok: true, data: { ok: true, requests: [{ id: 'req-d53', postId: promoPostD53.id, status: 'approved' }, { id: 'req-e53', postId: promoPostE53.id, status: 'rejected' }] } };
      return origFetch53b.apply(this, arguments);
    };
    await T26.syncPromoStatus1553();
    await tick(); await tick();
    T26.renderFeed();
    await tick(); await tick();
    check('1.5.53 promociones: al aprobar el creador, la publicación se activa (insignia «Promocionado» y sube arriba)', (function () { var p = null; st26.posts.forEach(function (x) { if (x.id === promoPostD53.id) p = x; }); var pr = T26.promotions1547().filter(function (x) { return x.postId === promoPostD53.id; })[0]; var first = window.document.querySelector('#feed article.post'); return !!p && p.promoted === true && !!pr && pr.status === 'active' && !!window.document.querySelector('article.post[data-post="' + promoPostD53.id + '"] .promoBadge1547') && !!first && first.getAttribute('data-post') === promoPostD53.id; })());
    check('1.5.53 promociones: al rechazar el creador, la publicación sigue sin promocionar (sin insignia ni «En verificación»)', (function () { var p = null; st26.posts.forEach(function (x) { if (x.id === promoPostE53.id) p = x; }); var pr = T26.promotions1547().filter(function (x) { return x.postId === promoPostE53.id; })[0]; return !!p && p.promoted !== true && !!pr && pr.status === 'rejected' && !window.document.querySelector('article.post[data-post="' + promoPostE53.id + '"] .promoBadge1547') && !window.document.querySelector('article.post[data-post="' + promoPostE53.id + '"] .promoVerifying1553'); })());
    T26.openPromotionsHub1547();
    await tick(); await tick(); await tick();
    check('1.5.53 promociones: el centro muestra la rechazada con «Rechazada» y «Pagar de nuevo»', $('promotionsHubOverlay1547').classList.contains('on') && $('promotionsHubBody1547').textContent.indexOf('Rechazada') >= 0 && $('promotionsHubBody1547').textContent.indexOf('Pagar de nuevo') >= 0, $('promotionsHubBody1547').textContent.slice(0, 200));
    T26.hideOverlay('promotionsHubOverlay1547');
    C26.serverFetch = origFetch53b;
    // --- 1.5.53 config del creador: orden por defecto, personalización intacta ---
    var origRetry53b = C26.serverFetchWithRetry;
    var creatorCfg53 = { order: ['historias', 'publicar', 'clima', 'reloj', 'accesos'], sizes: { historias: 'm', publicar: 'm', clima: 's', reloj: 'l', accesos: 'm' } };
    C26.serverFetchWithRetry = async function (state, path, method, body, opts) {
      if (path === '/api/creator-config') return { ok: true, data: { ok: true, config: creatorCfg53 } };
      return origRetry53b.apply(this, arguments);
    };
    st26.homeWidgets1536 = null;
    st26.creatorConfigApplied1553 = null;
    window.localStorage.removeItem('wordred_creator_config1553');
    T26.resetCreatorConfigFetch1553();
    T26.fetchCreatorConfig1553();
    await tick(); await tick(); await tick();
    check('1.5.53 config creador: con el Inicio en su orden por defecto, la config del creador se aplica (orden y tamaño)', (function () { var c = T26.homeWidgetsCfg1536(); return c.order.join(',') === 'historias,publicar,clima,reloj,accesos' && c.sizes.reloj === 'l' && c.sizes.clima === 's'; })(), JSON.stringify(T26.homeWidgetsCfg1536()));
    creatorCfg53 = { order: ['historias', 'reloj', 'publicar', 'clima', 'accesos'], sizes: { historias: 'm', reloj: 's', publicar: 'm', clima: 's', accesos: 'm' } };
    window.localStorage.removeItem('wordred_creator_config1553');
    T26.resetCreatorConfigFetch1553();
    T26.fetchCreatorConfig1553();
    await tick(); await tick(); await tick();
    check('1.5.53 config creador: una segunda config se vuelve a aplicar cuando el Inicio sigue sin tocar (la anterior del creador)', (function () { var c = T26.homeWidgetsCfg1536(); return c.order.join(',') === 'historias,reloj,publicar,clima,accesos' && c.sizes.reloj === 's'; })(), JSON.stringify(T26.homeWidgetsCfg1536()));
    T26.moveHomeWidget1536('clima', 1);
    await tick();
    creatorCfg53 = { order: ['historias', 'publicar', 'reloj', 'clima', 'accesos'], sizes: { historias: 'l', publicar: 'l', reloj: 'l', clima: 'l', accesos: 'l' } };
    window.localStorage.removeItem('wordred_creator_config1553');
    T26.resetCreatorConfigFetch1553();
    T26.fetchCreatorConfig1553();
    await tick(); await tick(); await tick();
    check('1.5.53 config creador: con el Inicio ya personalizado, la config nueva del creador NO lo toca', (function () { var c = T26.homeWidgetsCfg1536(); return c.order.join(',') === 'historias,reloj,publicar,accesos,clima' && c.sizes.reloj === 's'; })(), JSON.stringify(T26.homeWidgetsCfg1536()));
    C26.serverFetchWithRetry = origRetry53b;
    // --- 1.5.53: la app de usuario NO trae la interfaz de creador ---
    check('1.5.54 creador: la app de usuario no trae el modo creador (ni pantallas, ni entrada en Ajustes)', window.__WR_CREATOR_MODE__ === undefined && !$('creatorRequestsOverlay1553') && !$('creatorEditOverlay1553') && !$('creatorSettingsEntry1553') && window.document.body.textContent.indexOf('Modo creador') < 0);
    window.__wrOpenSettings();
    await tick();
    check('1.5.53 creador: en Ajustes no aparece la entrada de «Modo creador»', !$('creatorSettingsEntry1553') && $('settingsOverlay').textContent.indexOf('Modo creador') < 0);
    T26.hideOverlay('settingsOverlay');
    // --- restaurar lo que tocó el bloque 1.5.53 ---
    st26.posts = savedPosts53;
    if (savedPromo53 === undefined) delete st26.promotions1547; else st26.promotions1547 = savedPromo53;
    st26.homeWidgets1536 = savedHw53;
    st26.creatorConfigApplied1553 = savedApplied53;
    window.localStorage.removeItem('wordred_creator_config1553');
    T26.resetCreatorConfigFetch1553();
    T26.applyHomeWidgets1536();
    T26.setState(st26);
    T26.go('feed'); T26.renderFeed();
    await tick(); await tick(); await tick();
    // 1.5.54: mis renderFeed re-dispararon el fetch de dramas del
    // simulador (2 dramas de prueba); volver a la lista fija para las
    // pruebas del visor que siguen, igual que al principio del bloque.
    window.localStorage.removeItem('wordred_kdramas1561');
    T26.resetKdramas1554();
    T26.renderKdramaHome1549();
    // Edición: la sección no se puede editar ni se mueve al reordenar.
    T26.enterHomeWidgetEdit1536('kdrama');
    check('1.5.49 K-Dramas: el mantener presionado no la ofrece como editable (no entra a editar)', !T26.getHwEditingId1536());
    T26.enterHomeWidgetEdit1536('reloj');
    check('1.5.49 K-Dramas: al editar otro apartado, la sección sigue fija debajo del botón', !!T26.getHwEditingId1536() && $('homeKdrama1549').previousElementSibling === $('homeAddBtn1536'));
    var css49 = Array.prototype.map.call(window.document.querySelectorAll('style'), function (st) { return st.textContent; }).join('\n');
    check('1.5.49 K-Dramas: en modo edición no se atenúa (regla de opacidad propia)', /body\.hwEditing1536 #view-feed #homeKdrama1549\{opacity:1\}/.test(css49));
    T26.moveHomeWidget1536('reloj', 1);
    check('1.5.49 K-Dramas: al reordenar otros apartados, la sección sigue fija debajo del botón', $('homeKdrama1549').previousElementSibling === $('homeAddBtn1536'));
    T26.applyHomeWidgets1536();
    check('1.5.49 K-Dramas: al reaplicar el orden, la sección sigue fija debajo del botón', $('homeKdrama1549').previousElementSibling === $('homeAddBtn1536'));
    T26.exitHomeWidgetEdit1536();
    // 1.5.60: el catálogo horneado ya no es DramaBox (son los 5 dramas
    // originales). Esta sección carga el catálogo DramaBox real de la
    // 1.5.58 como caché (clave 1560) para probar el visor de YouTube,
    // los gestos, la hoja de capítulos y los capítulos de miembros.
    (function () {
      function kdEp58(n, vid) { return { ep: n, videoId: vid, title: 'Capítulo ' + n, ytTitle: 'Capítulo ' + n, thumb: 'https://i.ytimg.com/vi/' + vid + '/hqdefault.jpg' }; }
      function kdSerie58(name, total, free, pfx, first, second) {
        var eps = [];
        for (var i = 1; i <= free; i++) {
          var vid = i === 1 ? first : (i === 2 ? second : pfx + (i < 10 ? '0' + i : i) + 'AAAAAAAA');
          eps.push(kdEp58(i, vid));
        }
        return { id: 'drama58-' + pfx.toLowerCase(), name: name, synopsis: 'Drama corto de DramaBox.', poster: 'https://i.ytimg.com/vi/' + first + '/hqdefault.jpg', totalEps: total, source: 'dramabox', channel: 'DramaBox - Stream Drama Shorts', eps: eps };
      }
      window.__wrDramaBox58 = [
        kdSerie58('After I Died He Went Mad', 52, 11, 'A', 'EkcpMLry5ZM', 'BA7AZXnX5XE'),
        kdSerie58('From Dumped Wife to Christmas Billionaire', 58, 9, 'B', 'BBBBBBBBB01', 'BBBBBBBBB02'),
        kdSerie58('Serve Me! Ball Girl Heiress', 66, 8, 'C', 'CCCCCCCCC01', 'CCCCCCCCC02'),
        kdSerie58('My World Ends with You', 60, 7, 'D', 'DDDDDDDDD01', 'DDDDDDDDD02'),
        kdSerie58('Love You To Death', 49, 10, 'E', 'EEEEEEEEE01', 'EEEEEEEEE02')
      ];
      window.localStorage.setItem('wordred_kdramas1561', JSON.stringify({ at: Date.now(), kdramas: window.__wrDramaBox58 }));
      T26.resetKdramas1554();
      T26.fetchKdramas1554();
      T26.renderKdramaHome1549();
    })();
    // Visor de dramas (1.5.58): video de YouTube dentro de la app (sin puente nativo en las pruebas, el visor de la página con su iframe).
    var openCalls49 = [];
    window.open = function (u) { openCalls49.push(u); return null; };
    var extBefore49 = calls.openExternalUrl.length;
    click(qa('#kdramaReels1549 .reelTile')[0]);
    await tick();
    check('1.5.58 visor: tocar una portada abre el visor con el iframe de YouTube (sin texto largo)', $('kdramaOverlay1549').classList.contains('on') && !!$('kdYtFrame1558') && !$('kdVideo1556') && !$('kdText1549'));
    check('1.5.58 visor: el primer capítulo carga su video de DramaBox en el iframe', $('kdYtFrame1558').getAttribute('src').indexOf('https://www.youtube.com/embed/EkcpMLry5ZM?autoplay=1') === 0 && !$('kdFrame1549') && !$('kdWatch1549'));
    check('1.5.58 visor: se ve la serie y el capítulo', $('kdSeriesTitle1549').textContent === 'After I Died He Went Mad' && $('kdEpTitle1549').textContent.indexOf('Capítulo 1 de 52') === 0);
    check('1.5.58 visor: nada sale de la app al abrir un capítulo (ni window.open ni puente externo)', openCalls49.length === 0 && calls.openExternalUrl.length === extBefore49 && !$('kdramaOverlay1549').querySelector('a'));
    // Gestos: arriba/abajo capítulos, derecha/izquierda series, sin vuelta en los extremos; tocar = siguiente capítulo. Los gestos van sobre el escenario (kdStage1549), que es donde está el video.
    function kdSwipe49(x0, y0, x1, y1) {
      var s = new window.Event('touchstart', { bubbles: true }); s.touches = [{ clientX: x0, clientY: y0 }]; $('kdStage1549').dispatchEvent(s);
      var e = new window.Event('touchend', { bubbles: true }); e.changedTouches = [{ clientX: x1, clientY: y1 }]; $('kdStage1549').dispatchEvent(e);
    }
    T26.openKdrama1549(0, 0);
    kdSwipe49(100, 300, 100, 180);
    check('1.5.58 gestos: deslizar hacia arriba pasa al capítulo siguiente', T26.getKdState1549().ep === 1 && $('kdYtFrame1558').getAttribute('src').indexOf('https://www.youtube.com/embed/BA7AZXnX5XE?autoplay=1') === 0);
    kdSwipe49(100, 180, 100, 300);
    check('1.5.58 gestos: deslizar hacia abajo vuelve al capítulo anterior', T26.getKdState1549().ep === 0 && $('kdYtFrame1558').getAttribute('src').indexOf('https://www.youtube.com/embed/EkcpMLry5ZM?autoplay=1') === 0);
    kdSwipe49(100, 300, 100, 420);
    check('1.5.54 gestos: deslizar hacia abajo en el primer capítulo no hace nada (se detiene)', T26.getKdState1549().ep === 0);
    kdSwipe49(150, 250, 150, 250);
    check('1.5.54 gestos: tocar la imagen pasa al capítulo siguiente', T26.getKdState1549().ep === 1);
    kdSwipe49(100, 200, 220, 200);
    check('1.5.54 gestos: deslizar a la derecha pasa a la serie siguiente, desde su primer capítulo', T26.getKdState1549().series === 1 && T26.getKdState1549().ep === 0 && $('kdSeriesTitle1549').textContent === 'From Dumped Wife to Christmas Billionaire');
    kdSwipe49(220, 200, 100, 200);
    check('1.5.54 gestos: deslizar a la izquierda vuelve a la serie anterior', T26.getKdState1549().series === 0 && $('kdSeriesTitle1549').textContent === 'After I Died He Went Mad');
    kdSwipe49(220, 200, 100, 200);
    check('1.5.54 gestos: deslizar a la izquierda en la primera serie no hace nada (se detiene)', T26.getKdState1549().series === 0);
    T26.openKdrama1549(0, 51);
    kdSwipe49(100, 300, 100, 180);
    check('1.5.54 gestos: deslizar hacia arriba en el último capítulo no hace nada (se detiene)', T26.getKdState1549().ep === 51);
    kdSwipe49(150, 250, 150, 250);
    check('1.5.54 gestos: tocar en el último capítulo no avanza más', T26.getKdState1549().ep === 51);
    T26.openKdrama1549(4, 0);
    kdSwipe49(100, 200, 220, 200);
    check('1.5.54 gestos: deslizar a la derecha en la última serie no hace nada (se detiene)', T26.getKdState1549().series === 4);
    T26.openKdrama1549(0, 0);
    click($('kdChaptersBtn1549'));
    kdSwipe49(100, 300, 100, 180);
    check('1.5.54 gestos: con la hoja de capítulos abierta, el deslizamiento no cambia de capítulo', T26.getKdState1549().ep === 0);
    click(window.document.querySelector('#kdramaSheet1549 [data-close="kdramaSheet1549"]'));
    // Hoja de capítulos: los 52 capítulos (11 gratis con botón, 41 de miembros con su texto).
    T26.openKdrama1549(0, 0);
    click($('kdChaptersBtn1549'));
    await tick();
    check('1.5.58 capítulos: «Ver otros capítulos» abre la hoja con los 52 capítulos de la serie', $('kdramaSheet1549').classList.contains('on') && qa('#kdSheetList1549 .kdSheetRow1549').length === 52, 'filas=' + qa('#kdSheetList1549 .kdSheetRow1549').length);
    check('1.5.58 capítulos: 11 gratis tienen botón de ver y 41 de miembros solo dicen «Disponible en DramaBox»', qa('#kdSheetList1549 [data-kd-play]').length === 11 && qa('#kdSheetList1549 .kdSheetMember1558').length === 41 && qa('#kdSheetList1549 .kdSheetMember1558').every(function (el) { return el.textContent === 'Disponible en DramaBox'; }));
    check('1.5.58 capítulos: cada fila trae el título del capítulo y ningún enlace que salga de la app', (function () { var rows = qa('#kdSheetList1549 .kdSheetRow1549'); return rows.every(function (r) { return r.textContent.indexOf('Capítulo') === 0; }) && !$('kdSheetList1549').querySelector('a'); })());
    click(window.document.querySelector('#kdSheetList1549 [data-kd-play="2"]'));
    check('1.5.58 capítulos: tocar un capítulo lo abre en el visor y cierra la hoja', !$('kdramaSheet1549').classList.contains('on') && T26.getKdState1549().ep === 2 && $('kdEpTitle1549').textContent.indexOf('Capítulo 3 de 52') === 0);
    // Capítulo de miembros: portada + «Disponible en DramaBox», sin video ni botón.
    T26.openKdrama1549(0, 11);
    check('1.5.58 miembros: el capítulo 12 (de miembros) muestra su portada con «Disponible en DramaBox» y sin video de YouTube', $('kdYtWrap1558').classList.contains('hidden') && $('kdYtFrame1558').getAttribute('src') === 'about:blank' && ($('kdImage1549').getAttribute('src') || '').indexOf('https://i.ytimg.com/vi/EkcpMLry5ZM/hqdefault.jpg') === 0 && !$('kdMember1558').classList.contains('hidden') && $('kdMember1558').textContent.indexOf('Disponible en DramaBox') >= 0 && $('kdEpTitle1549').textContent.indexOf('Capítulo 12 de 52') === 0, 'ep=' + T26.getKdState1549().ep);
    // Pantalla completa: el botón entra y sale (API simulada).
    var fsCalls49 = [];
    var stage49 = $('kdStage1549');
    stage49.requestFullscreen = function () { fsCalls49.push('enter'); };
    window.document.exitFullscreen = function () { fsCalls49.push('exit'); };
    click($('kdFull1549'));
    check('1.5.54 pantalla completa: el botón pone el visor en pantalla completa real', fsCalls49.indexOf('enter') >= 0);
    Object.defineProperty(window.document, 'fullscreenElement', { value: stage49, configurable: true });
    click($('kdFull1549'));
    check('1.5.54 pantalla completa: el mismo botón sale de la pantalla completa', fsCalls49.indexOf('exit') >= 0);
    Object.defineProperty(window.document, 'fullscreenElement', { value: null, configurable: true });
    click($('kdClose1549'));
    check('1.5.54 visor: al cerrar, el visor se cierra y se quita la imagen del capítulo', !$('kdramaOverlay1549').classList.contains('on') && !$('kdImage1549').getAttribute('src'));
    check('1.5.54 visor: al final nada salió de la app', openCalls49.length === 0 && calls.openExternalUrl.length === extBefore49);
    // --- 1.5.54 guía de gestos: solo en el primer capítulo, siempre que se entra en él, y se quita sola en unos segundos ---
    T26.openKdrama1549(0, 0);
    check('1.5.54 guía: aparece al abrir el primer capítulo', !$('kdGuide1549').classList.contains('hidden'));
    check('1.5.56 guía: explica los gestos para ver los videos en español', (function () { var t = $('kdGuide1549').textContent; return t.indexOf('Capítulo siguiente') >= 0 && t.indexOf('Capítulo anterior') >= 0 && t.indexOf('Siguiente drama') >= 0 && t.indexOf('Drama anterior') >= 0 && t.indexOf('Toca el video para ver el siguiente capítulo') >= 0; })());
    click($('kdGuide1549'));
    check('1.5.54 guía: tocarla la cierra antes', $('kdGuide1549').classList.contains('hidden'));
    T26.openKdrama1549(0, 0);
    check('1.5.54 guía: vuelve a aparecer siempre que se entra en el primer capítulo', !$('kdGuide1549').classList.contains('hidden'));
    T26.openKdrama1549(2, 0);
    check('1.5.54 guía: también aparece en el primer capítulo de otra serie', !$('kdGuide1549').classList.contains('hidden'));
    T26.openKdrama1549(0, 3);
    check('1.5.54 guía: nunca aparece en otro capítulo', $('kdGuide1549').classList.contains('hidden'));
    // La X también la cierra antes.
    T26.openKdrama1549(0, 0);
    click($('kdGuideX1549'));
    check('1.5.54 guía: la X también la cierra', $('kdGuide1549').classList.contains('hidden'));
    // Al bajar al primer capítulo con el gesto, aparece otra vez.
    T26.openKdrama1549(0, 1);
    kdSwipe49(100, 180, 100, 300);
    check('1.5.54 guía: al bajar al primer capítulo aparece otra vez', !$('kdGuide1549').classList.contains('hidden') && T26.getKdState1549().ep === 0);
    // Se quita sola en unos segundos.
    await sleep(4500);
    check('1.5.54 guía: se quita sola en unos segundos', $('kdGuide1549').classList.contains('hidden'));
    // Cerrar el visor con la guía visible no la deja colgada.
    T26.openKdrama1549(0, 0);
    click($('kdClose1549'));
    check('1.5.54 guía: cerrar el visor la quita', $('kdGuide1549').classList.contains('hidden'));
    T26.openKdrama1549(0, 0);
    check('1.5.54 guía: al volver al primer capítulo aparece de nuevo', !$('kdGuide1549').classList.contains('hidden'));
    click($('kdClose1549'));
    // --- 1.5.54 dramas: el catálogo viene del servidor (caché de 1 día, respaldo fijo) ---
    check('1.5.61 dramas: la validación acepta las DOS formas (DramaBox y originales), una rota no, y los huecos entre capítulos gratis', T26.kdramasValid1554([{ id: 'x', name: 'X', synopsis: 'S', poster: 'https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg', totalEps: 3, source: 'dramabox', eps: [{ ep: 1, videoId: 'AAAAAAAAAAA', title: 'T', ytTitle: 'T', thumb: 'https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg' }] }]) === true && T26.kdramasValid1554(null) === false && T26.kdramasValid1554([{ id: 'x' }]) === false && T26.kdramasValid1554([{ id: 'x', name: 'X', synopsis: 'S', poster: 'p', eps: [{ ep: 2, videoId: 'AAAAAAAAAAA', title: 'T', ytTitle: 'T', thumb: 't' }] }]) === false && T26.kdramasValid1554([{ id: 'x', name: 'X', synopsis: 'S', poster: 'dramas/x-portada.jpg', chapters: [{ n: 1, title: 'T', text: 'Texto de más de cien caracteres para que la validación del catálogo de dramas originales lo acepte sin problema alguno.', image: 'dramas/x-cap1.jpg' }] }]) === true && T26.kdramasValid1554([{ id: 'hueco61', name: 'Hueco', synopsis: 'S', poster: 'https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg', totalEps: 6, source: 'ReelShort', eps: [{ ep: 1, videoId: 'AAAAAAAAAAA', title: 'T1', ytTitle: 'T1', thumb: 't' }, { ep: 2, videoId: 'BBBBBBBBBBB', title: 'T2', ytTitle: 'T2', thumb: 't' }, { ep: 4, videoId: 'CCCCCCCCCCC', title: 'T4', ytTitle: 'T4', thumb: 't' }] }]) === true);
    window.localStorage.removeItem('wordred_kdramas1561');
    T26.resetKdramas1554();
    T26.fetchKdramas1554();
    await tick(); await tick();
    T26.renderKdramaHome1549();
    check('1.5.54 dramas: la app pinta la lista del servidor (no la fija)', qa('#kdramaReels1549 .reelTile').length === 2 && $('kdramaReels1549').textContent.indexOf('Drama de prueba 1') >= 0 && $('kdramaReels1549').textContent.indexOf('El contrato de la heredera') < 0);
    // Sin conexión: la lista fija.
    window.localStorage.removeItem('wordred_kdramas1561');
    T26.resetKdramas1554();
    var realFetch54 = window.fetch;
    window.fetch = async () => { throw new Error('sin conexión'); };
    T26.fetchKdramas1554();
    await tick(); await tick();
    T26.renderKdramaHome1549();
    check('1.5.62 dramas: sin conexión pinta la lista fija (48 series mezcladas)', qa('#kdramaReels1549 .reelTile').length === 48 && $('kdramaReels1549').textContent.indexOf('La doble vida de mi esposo multimillonario') >= 0 && $('kdramaReels1549').textContent.indexOf('El Renacer de la Esposa Gorda') >= 0 && $('kdramaReels1549').textContent.indexOf('After I Died He Went Mad') < 0 && $('kdramaReels1549').textContent.indexOf('El contrato de la heredera') < 0);
    window.fetch = realFetch54;
    // Caché de 1 día: con una caché fresca no se pide nada y se pinta lo guardado.
    window.localStorage.setItem('wordred_kdramas1561', JSON.stringify({ at: Date.now(), kdramas: [{ id: 'drama-cache', name: 'Drama en caché', synopsis: 'Sinopsis en caché.', poster: 'https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg', totalEps: 2, source: 'dramabox', eps: [{ ep: 1, videoId: 'AAAAAAAAAAA', title: 'Capítulo en caché', ytTitle: 'Capítulo en caché', thumb: 'https://i.ytimg.com/vi/AAAAAAAAAAA/hqdefault.jpg' }] }] }));
    T26.resetKdramas1554();
    T26.fetchKdramas1554();
    T26.renderKdramaHome1549();
    check('1.5.54 dramas: con caché fresca se pinta lo guardado sin pedir al servidor', $('kdramaReels1549').textContent.indexOf('Drama en caché') >= 0 && $('kdramaReels1549').textContent.indexOf('Drama de prueba 1') < 0);
    // --- 1.5.54: el botón de regresar del teléfono ---
    // Pruebas anteriores dejan ventanas abiertas (p. ej. el diálogo de
    // actualización, que nadie cierra): se cierran primero para probar
    // el regreso en Inicio con nada abierto, como lo ve el usuario.
    qa('.overlay.on').forEach(function (el) { try { T26.hideOverlay(el.id); } catch (e) {} });
    T26.go('feed');
    T26.resetBackStack1549();
    check('1.5.54 regreso: en Inicio sin nada que cerrar ni a dónde volver, el botón no hace nada', T26.handleAndroidBack() === false);
    T26.openPromotionsHub1547();
    await tick(); await tick();
    check('1.5.54 regreso: con una ventana abierta, el botón cierra la de más arriba', $('promotionsHubOverlay1547').classList.contains('on') && T26.handleAndroidBack() === true && !$('promotionsHubOverlay1547').classList.contains('on'));
    T26.enterHomeWidgetEdit1536('reloj');
    check('1.5.54 regreso: en edición del menú del Inicio, el botón sale de la edición', !!T26.getHwEditingId1536() && T26.handleAndroidBack() === true && !T26.getHwEditingId1536());
    T26.go('profile');
    await tick();
    check('1.5.54 regreso: ir al Perfil deja el Inicio en la pila', T26.getBackViewStack1549().indexOf('feed') >= 0);
    check('1.5.54 regreso: en el Perfil, el botón vuelve al Inicio', T26.handleAndroidBack() === true && window.document.querySelector('#view-feed').classList.contains('on'));
    T26.resetBackStack1549();
    // --- 1.5.54: la moneda de Promociones vive en el perfil propio ---
    T26.go('profile');
    await tick();
    var coinProfile54 = window.document.querySelector('#ownProfile .ownPromoCoin1547');
    check('1.5.59 moneda: en el perfil propio la moneda va antes del botón de compartir, y este antes del lápiz de editar', !!coinProfile54 && !!coinProfile54.querySelector('.coinW1547') && !!coinProfile54.nextElementSibling && coinProfile54.nextElementSibling.classList.contains('ownShareBtn1559') && !!coinProfile54.nextElementSibling.nextElementSibling && coinProfile54.nextElementSibling.nextElementSibling.classList.contains('ownEditBtn'));
    check('1.5.54 moneda: en el encabezado del Inicio ya no hay moneda', !$('hdrPromotions') && !window.document.querySelector('header .coinW1547'));
    click(coinProfile54);
    await tick(); await tick();
    check('1.5.54 moneda: tocarla abre el centro de Promociones', $('promotionsHubOverlay1547').classList.contains('on'));
    T26.hideOverlay('promotionsHubOverlay1547');
    window.__wrOpenProfile('1000000001');
    await tick();
    check('1.5.54 moneda: en un perfil ajeno no aparece la moneda', !window.document.querySelector('#profileDetail .ownPromoCoin1547') && !window.document.querySelector('#profileOverlay .ownPromoCoin1547'));
    click(q('[data-close="profileOverlay"]'));
    T26.go('feed');
    // --- 1.5.54: Fantore Resurrección, juego principal ---
    T26.renderFeed();
    await tick(); await tick();
    var fgCard54 = window.document.querySelector('#featuredGame1549');
    var gamesRow54 = window.document.querySelector('#gamesBillboard1543');
    check('1.5.54 Fantore: el juego va primero en la sección de juegos, antes de la cartelera', !!fgCard54 && !!gamesRow54 && (fgCard54.compareDocumentPosition(gamesRow54) & 4) !== 0);
    check('1.5.54 Fantore: el encabezado lleva el control rojo y «Gamer Premium»', !!fgCard54 && fgCard54.textContent.indexOf('Gamer Premium') >= 0 && !!fgCard54.querySelector('.featuredGameIcon1549 svg'));
    check('1.5.54 Fantore: la tarjeta trae el logo real, el nombre y la versión 2.0', !!fgCard54 && !!fgCard54.querySelector('.featuredGameLogo1549') && fgCard54.querySelector('.featuredGameLogo1549').getAttribute('src') === 'fantore/logo.png' && fgCard54.textContent.indexOf('Fantore Resurrección') >= 0 && fgCard54.textContent.indexOf('Versión 2.0') >= 0);
    check('1.5.54 Fantore: la tarjeta tiene el botón de jugar', !!fgCard54 && !!fgCard54.querySelector('.featuredGamePlay1549'));
    click(fgCard54.querySelector('.featuredGameCard1549'));
    await tick();
    check('1.5.54 Fantore: tocar la tarjeta abre su página', $('featuredGameOverlay1549').classList.contains('on'));
    check('1.5.54 Fantore: la página trae las 8 capturas reales', qa('#fgShots1549 .fgShot1549').length === 8, 'capturas=' + qa('#fgShots1549 .fgShot1549').length);
    check('1.5.54 Fantore: la primera captura es la pantalla de carga con el logo', $('fgPreviewImg1549').getAttribute('src') === 'fantore/cap1.jpg');
    check('1.5.54 Fantore: la página trae las 5 estrellas para calificar', qa('#fgStars1549 .fgStar1549').length === 5);
    var origOpenApp54 = window.AndroidBridge.openApp;
    calls.openedApps = [];
    click(fgCard54.querySelector('.featuredGamePlay1549'));
    check('1.5.54 Fantore: con el juego instalado, el botón de jugar lo abre', calls.openedApps.indexOf('com.misterystore.fantoreresurreccion') >= 0, JSON.stringify(calls.openedApps));
    window.AndroidBridge.openApp = function () { return 'ERROR:no se puede abrir'; };
    calls.installApk = [];
    window.__wrPlayFeaturedGame();
    check('1.5.54 Fantore: sin el juego instalado, jugar descarga su APK del servidor', calls.installApk.length === 1 && calls.installApk[0] === 'https://wordred-server.onrender.com/app/Fantore-Resurreccion.apk', JSON.stringify(calls.installApk));
    window.AndroidBridge.openApp = origOpenApp54;
    T26.rateFeaturedGame1549(5);
    await tick(); await tick(); await tick();
    check('1.5.54 Fantore: calificar guarda mi calificación en el teléfono', window.localStorage.getItem('wordred_fantore_my_rating') === '5');
    check('1.5.54 Fantore: la calificación se manda al servidor (POST /api/games/fantore-resurreccion/rate)', (calls.gameRatePosts || []).some(function (p) { return p.url.indexOf('/api/games/fantore-resurreccion/rate') >= 0 && p.body.stars === 5; }), JSON.stringify(calls.gameRatePosts || []));
    check('1.5.54 Fantore: tras calificar, las 5 estrellas se ven encendidas', qa('#fgStars1549 .fgStar1549.on').length === 5);
    click(q('[data-close="featuredGameOverlay1549"]'));
    // --- 1.5.54: las solicitudes de promoción se aprueban dentro de la app (servidor 4.4, solo la cuenta principal) ---
    var promoPost54 = T26.core.createPost(st26, st26.me, { text: 'Post promo 1.5.54 aprobación' }).post;
    var origFetch54b = C26.serverFetch;
    var decideCalls54 = [];
    C26.serverFetch = async function (state, path, method, body) {
      if (path === '/api/promotions/request') return { ok: true, data: { ok: true, request: { id: 'req-54', postId: promoPost54.id, status: 'pending' } } };
      if (path === '/api/promotions/pending') return { ok: true, data: { ok: true, requests: [{ id: 'req-54', postId: promoPost54.id, authorName: 'Dj Musicaliza', postText: 'Post promo 1.5.54 aprobación', tier: 100, goal: 'views', status: 'pending' }] } };
      if (path === '/api/promotions/req-54/approve' || path === '/api/promotions/req-54/reject') { decideCalls54.push(path); return { ok: true, data: { ok: true } }; }
      return origFetch54b.apply(this, arguments);
    };
    window.__wrPromotePost(promoPost54.id);
    await tick();
    window.__wrPromoTier(100);
    await tick();
    window.__wrPromoPaid();
    await tick(); await tick(); await tick();
    T26.openPromotionsHub1547();
    await tick(); await tick(); await tick();
    check('1.5.54 aprobación: el centro muestra la sección «Solicitudes de promoción» cuando el servidor lo permite', $('promotionsHubOverlay1547').classList.contains('on') && $('promotionsHubBody1547').textContent.indexOf('Solicitudes de promoción') >= 0);
    check('1.5.54 aprobación: la solicitud trae autor, publicación, nivel y los botones Aprobar/Rechazar', $('promotionsHubBody1547').textContent.indexOf('Post promo 1.5.54 aprobación') >= 0 && $('promotionsHubBody1547').textContent.indexOf('$100 MXN') >= 0 && !!window.document.querySelector('#promotionsHubBody1547 button[onclick*="__wrPromoApprove"]') && !!window.document.querySelector('#promotionsHubBody1547 button[onclick*="__wrPromoReject"]'));
    click(window.document.querySelector('#promotionsHubBody1547 button[onclick*="__wrPromoApprove"]'));
    await tick(); await tick(); await tick();
    check('1.5.54 aprobación: Aprobar llama al servidor (POST /api/promotions/:id/approve)', decideCalls54.indexOf('/api/promotions/req-54/approve') >= 0, JSON.stringify(decideCalls54));
    click(window.document.querySelector('#promotionsHubBody1547 button[onclick*="__wrPromoReject"]'));
    await tick(); await tick(); await tick();
    check('1.5.54 aprobación: Rechazar llama al servidor (POST /api/promotions/:id/reject)', decideCalls54.indexOf('/api/promotions/req-54/reject') >= 0, JSON.stringify(decideCalls54));
    C26.serverFetch = async function (state, path, method, body) {
      if (path === '/api/promotions/pending') return { ok: false, status: 403, data: { ok: false, error: 'Solo la cuenta principal puede revisar solicitudes.' } };
      return origFetch54b.apply(this, arguments);
    };
    T26.openPromotionsHub1547();
    await tick(); await tick(); await tick();
    check('1.5.54 aprobación: si el servidor responde 403, la sección no aparece', $('promotionsHubBody1547').textContent.indexOf('Solicitudes de promoción') < 0);
    T26.hideOverlay('promotionsHubOverlay1547');
    C26.serverFetch = origFetch54b;
    window.localStorage.setItem('wordred_kdramas1561', JSON.stringify({ at: Date.now(), kdramas: window.__wrDramaBox58 }));
    T26.resetKdramas1554();
    T26.fetchKdramas1554();
    T26.renderKdramaHome1549();
    // --- 1.5.55: portadas sin el 'assets/' de más, muro vacío con juego, reels de arriba solo verticales ---
    // (a) Las tarjetas de dramas usan la ruta sin prefijo y el respaldo si la imagen falla.
    var kdTiles55 = qa('#kdramaReels1549 .reelTile');
    check('1.5.58 dramas: las 5 portadas son las miniaturas de YouTube de cada serie', kdTiles55.length === 5 && kdTiles55.every(function (t) { var im = t.querySelector('img'); return !!im && /^https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/hqdefault\.jpg$/.test(im.getAttribute('src')); }), 'tiles=' + kdTiles55.length);
    var kdTile55 = kdTiles55[0];
    kdTile55.querySelector('img').dispatchEvent(new window.Event('error')); // 1.5.63: 1er error -> intenta la miniatura
    kdTile55.querySelector('img').dispatchEvent(new window.Event('error')); // 1.5.63: 2do error (la miniatura tampoco carga) -> respaldo rojo
    check('1.5.58 dramas: si la portada no carga, la tarjeta muestra el nombre bien visible (sin hueco vacío)', kdTile55.classList.contains('kdNoImg1555') && kdTile55.textContent.indexOf('After I Died He Went Mad') >= 0 && !kdTile55.querySelector('img'));
    // (b) El visor abre con el video de YouTube y sin texto; si la imagen falla, se ve el nombre de la serie.
    T26.openKdrama1549(0, 0);
    check('1.5.58 visor: el capítulo abre con su video de YouTube en el iframe', !!$('kdYtFrame1558') && $('kdYtFrame1558').getAttribute('src').indexOf('https://www.youtube.com/embed/EkcpMLry5ZM?autoplay=1') === 0 && !$('kdText1549'));
    $('kdImage1549').dispatchEvent(new window.Event('error'));
    check('1.5.58 visor: si la imagen del capítulo no carga, se ve el nombre de la serie (sin texto largo)', !$('kdImageFail1555').classList.contains('hidden') && $('kdImageFail1555').textContent === 'After I Died He Went Mad' && !$('kdText1549'));
    click($('kdClose1549'));
    // (c) El juego: logo en la tarjeta de inicio con la ruta sin prefijo, y su respaldo.
    T26.renderFeed();
    await tick(); await tick();
    var fgCard55 = window.document.querySelector('#featuredGame1549');
    check('1.5.55 Fantore: la tarjeta de inicio trae el logo real con la ruta sin prefijo', !!fgCard55 && !!fgCard55.querySelector('.featuredGameLogo1549') && fgCard55.querySelector('.featuredGameLogo1549').getAttribute('src') === 'fantore/logo.png');
    fgCard55.querySelector('.featuredGameLogo1549').dispatchEvent(new window.Event('error'));
    check('1.5.55 Fantore: si el logo no carga, la tarjeta muestra la «F» (sin hueco vacío)', !!fgCard55.querySelector('.featuredGameLogoFail1555') && fgCard55.textContent.indexOf('Fantore Resurrección') >= 0);
    // (d) Muro vacío: el juego destacado también aparece.
    var savedPosts55 = st26.posts.slice();
    st26.posts = [];
    T26.renderFeed();
    await tick();
    check('1.5.55 muro vacío: con 0 publicaciones el juego destacado también aparece en el inicio', !!window.document.querySelector('#featuredGame1549') && window.document.querySelector('#feed').textContent.indexOf('Tu muro está vacío') >= 0);
    st26.posts = savedPosts55;
    T26.renderFeed();
    await tick();
    // (e) Reels de arriba solo verticales.
    function reelPost55(text, orient) {
      var r = C26.createPost(st26, st26.me, { text: text, mediaList: [{ src: 'https://srv/reel55-' + (orient || 'sin') + '.mp4', type: 'video', orientation: orient || '' }], privacy: 'Público' });
      return r.ok ? r.post : null;
    }
    var reelV55 = reelPost55('Reel vertical 1.5.55', 'vertical');
    var reelH55 = reelPost55('Reel horizontal 1.5.55', 'horizontal');
    var reelU55 = reelPost55('Reel sin orientación 1.5.55', '');
    check('1.5.55 reels: la orientación viaja con la publicación (createPost la guarda en el medio y en la publicación)', !!reelV55 && reelV55.videoOrientation === 'vertical' && reelV55.mediaList[0].orientation === 'vertical' && !!reelH55 && reelH55.videoOrientation === 'horizontal');
    T26.go('feed');
    await tick();
    function topReelIds55() { return qa('#storiesRow .homeReel1549').map(function (el) { var m = (el.getAttribute('onclick') || '').match(/__wrOpenReel\('([^']+)'\)/); return m ? m[1] : ''; }); }
    var topIds55 = topReelIds55();
    check('1.5.55 reels: arriba solo salen los verticales (el horizontal no, el sin dato sí hasta medirlo)', topIds55.indexOf(reelV55.id) >= 0 && topIds55.indexOf(reelH55.id) < 0 && topIds55.indexOf(reelU55.id) >= 0, 'arriba=' + topIds55.length);
    check('1.5.55 reels: la fila de reels del feed se queda sin filtrar (el horizontal sigue ahí)', T26.reelsRowHtml().indexOf(reelH55.id) >= 0);
    T26.recordReelOrientation1555(reelU55, 900, 544);
    await tick();
    var topIds55b = topReelIds55();
    check('1.5.55 reels: al medir un reel como horizontal, desaparece de arriba', topIds55b.indexOf(reelU55.id) < 0 && topIds55b.indexOf(reelV55.id) >= 0, 'arriba=' + topIds55b.length);
    var demoVideo55 = st26.posts.filter(function (p) { return p.demoKey === 'ejemplo-video'; })[0];
    check('1.5.55 reels: el video de ejemplo es horizontal y queda guardado', !!demoVideo55 && demoVideo55.videoOrientation === 'horizontal');
    check('1.5.55 reels: el video de ejemplo no sale en la fila de arriba', !!demoVideo55 && topIds55b.indexOf(demoVideo55.id) < 0);
    // El reel vertical de prueba sí muestra la imagen (o la inicial) de su cuenta en su rectángulo.
    var topV55 = qa('#storiesRow .homeReel1549').filter(function (el) { return (el.getAttribute('onclick') || '').indexOf(reelV55.id) >= 0; })[0];
    check('1.5.55 reels: el reel vertical muestra la imagen de la cuenta que lo publicó', !!topV55 && !!topV55.querySelector('.homeReelRect1560 img, .homeReelRect1560 .homeReelPh1549'));
    st26.posts = st26.posts.filter(function (p) { return p !== reelV55 && p !== reelH55 && p !== reelU55; });
    T26.go('feed');
    await tick();
    // --- 1.5.61: dramas mezclados (ReelShort 14 + ShortMax 2; DramaBox no aporta en español; la forma originales sigue valiendo para el CC/VTT) ---
    window.localStorage.removeItem('wordred_kdramas1561');
    T26.resetKdramas1554();
    T26.renderKdramaHome1549();
    check('1.5.62 dramas: el catálogo horneado es el mezclado (48 series: 46 ReelShort + 2 ShortMax, 1 entrada gratis por serie)', (function () { var c = T26.getKdramaCatalog1549(); return c.length === 48 && c.filter(function (s) { return s.source === 'ReelShort'; }).length === 46 && c.filter(function (s) { return s.source === 'ShortMax'; }).length === 2 && c.every(function (s) { return !s.chapters && Array.isArray(s.eps) && s.eps.length === 1 && s.eps[0].videoId.length === 11 && /^https:\/\/i\.ytimg\.com\/vi\//.test(s.eps[0].thumb); }); })());
    check('1.5.62 dramas: cada tarjeta lleva la etiqueta de su aplicación y el conteo de capítulos gratis', (function () { var tiles = qa('#kdramaReels1549 .reelTile'); return tiles.length === 48 && tiles.filter(function (t) { return (t.querySelector('.kdBadge1549') || {}).textContent === 'ReelShort'; }).length === 46 && tiles.filter(function (t) { return (t.querySelector('.kdBadge1549') || {}).textContent === 'ShortMax'; }).length === 2 && tiles.every(function (t) { return t.textContent.indexOf('1 capítulo gratis de ') >= 0; }); })(), 'tiles=' + qa('#kdramaReels1549 .reelTile').length);
    check('1.5.61 dramas: ningún original queda en la sección y DramaBox no aporta nada', $('kdramaReels1549').textContent.indexOf('Original de WordRed') < 0 && $('kdramaReels1549').textContent.indexOf('DramaBox') < 0 && $('kdramaReels1549').textContent.indexOf('El contrato de la heredera') < 0);
    check('1.5.61 dramas: kdAppTag1561 y kdMemberText1561 salen de `source` (también en minúsculas)', T26.kdAppTag1561({ source: 'ReelShort' }) === 'ReelShort' && T26.kdAppTag1561({ source: 'ShortMax' }) === 'ShortMax' && T26.kdAppTag1561({ source: 'dramabox' }) === 'DramaBox' && T26.kdAppTag1561({ chapters: [] }) === 'Original de WordRed' && T26.kdMemberText1561({ source: 'ReelShort' }).title === 'Disponible en ReelShort' && T26.kdMemberText1561({ source: 'ShortMax' }).title === 'Disponible en ShortMax' && T26.kdMemberText1561({ source: 'ReelShort' }).sub.indexOf('ReelShort') >= 0);
    // Visor: el primer capítulo gratis es el video de ReelShort (mJVKa6XzAHU) y el título lleva el lote.
    T26.openKdrama1549(0, 0);
    check('1.5.61 visor: el primer capítulo carga su video de ReelShort en el iframe', !!$('kdYtFrame1558') && $('kdYtFrame1558').getAttribute('src').indexOf('https://www.youtube.com/embed/mJVKa6XzAHU?autoplay=1') === 0 && !$('kdVideo1556'));
    check('1.5.61 visor: se ven la serie, su aplicación y el título del lote con el total', $('kdSeriesTitle1549').textContent === 'La doble vida de mi esposo multimillonario' && $('kdEpTitle1549').textContent.indexOf('Capítulo 1 de 70') === 0 && $('kdEpTitle1549').textContent.indexOf('Capítulos 1 al 6') >= 0 && $('kdramaOverlay1549').textContent.indexOf('ReelShort') >= 0);
    // Capítulo de miembros: dice «Disponible en ReelShort», sin video.
    T26.openKdrama1549(0, 1);
    check('1.5.61 miembros: el capítulo 2 (de miembros) dice «Disponible en ReelShort» y no carga video', $('kdYtWrap1558').classList.contains('hidden') && !$('kdMember1558').classList.contains('hidden') && $('kdMember1558').textContent.indexOf('Disponible en ReelShort') >= 0 && $('kdEpTitle1549').textContent.indexOf('Capítulo 2 de 70') === 0, 'ep=' + T26.getKdState1549().ep);
    // Hoja de capítulos: 70 filas, 1 gratis con botón y 69 de miembros con el texto de su app.
    T26.openKdrama1549(0, 0);
    click($('kdChaptersBtn1549'));
    await tick();
    check('1.5.61 capítulos: la hoja trae los 70 capítulos (1 gratis con botón, 69 de miembros)', $('kdramaSheet1549').classList.contains('on') && qa('#kdSheetList1549 .kdSheetRow1549').length === 70 && qa('#kdSheetList1549 [data-kd-play]').length === 1 && qa('#kdSheetList1549 .kdSheetMember1558').length === 69 && qa('#kdSheetList1549 .kdSheetMember1558').every(function (el) { return el.textContent === 'Disponible en ReelShort'; }), 'filas=' + qa('#kdSheetList1549 .kdSheetRow1549').length);
    click(window.document.querySelector('#kdramaSheet1549 [data-close="kdramaSheet1549"]'));
    // Validador y capítulo tolerantes a huecos: gratis 1, 2 y 4 de 6 (falta el 3).
    check('1.5.61 dramas: kdChapterAt1558 busca el capítulo por su número (el 3 que falta es de miembros, el 4 trae su video)', (function () { var s = { id: 'hueco61', name: 'Hueco', totalEps: 6, source: 'ReelShort', eps: [{ ep: 1, videoId: 'AAAAAAAAAAA', title: 'T1' }, { ep: 2, videoId: 'BBBBBBBBBBB', title: 'T2' }, { ep: 4, videoId: 'CCCCCCCCCCC', title: 'T4' }] }; var m = T26.kdChapterAt1558(s, 2); var v = T26.kdChapterAt1558(s, 3); return !!m && m.member === true && m.n === 3 && !!v && v.videoId === 'CCCCCCCCCCC' && v.n === 4; })());
    click($('kdClose1549'));
    // CC y subtítulos VTT siguen funcionando con una serie de originales instalada por caché (doble forma).
    window.localStorage.setItem('wordred_kdramas1561', JSON.stringify({ at: Date.now(), kdramas: [{ id: 'drama-original-prueba61', name: 'Drama original de prueba 1.5.61', synopsis: 'Serie original de prueba para el CC y los subtítulos.', poster: 'dramas/prueba61-portada.jpg', chapters: [{ n: 1, title: 'La cláusula de prueba', text: 'Texto de más de cien caracteres para que la validación del catálogo de dramas originales lo acepte sin problema alguno.', image: 'dramas/prueba61-cap1.jpg', video: 'https://res.cloudinary.com/bekxop7h/video/upload/v1794894453/prygi28pbkflh8v2aiof.mp4', subtitles: { es: 'https://res.cloudinary.com/bekxop7h/raw/upload/dramas/prueba61-cap1-es.vtt', en: 'https://res.cloudinary.com/bekxop7h/raw/upload/dramas/prueba61-cap1-en.vtt', pt: 'https://res.cloudinary.com/bekxop7h/raw/upload/dramas/prueba61-cap1-pt.vtt' } }, { n: 2, title: 'Capítulo sin video', text: 'Texto de más de cien caracteres para que la validación del catálogo de dramas originales lo acepte sin problema alguno.', image: 'dramas/prueba61-cap2.jpg' }] }] }));
    T26.resetKdramas1554();
    T26.fetchKdramas1554();
    T26.renderKdramaHome1549();
    T26.openKdrama1549(0, 0);
    check('1.5.61 visor originales: el capítulo con video carga su video de Cloudinary con autoplay', !!$('kdVideo1556') && $('kdVideo1556').getAttribute('src').indexOf('https://res.cloudinary.com/') === 0 && !!$('kdVideo1556').getAttribute('poster'));
    check('1.5.61 visor originales: se ven el título del drama y «Capítulo N de TOTAL · título»', $('kdSeriesTitle1549').textContent === 'Drama original de prueba 1.5.61' && $('kdEpTitle1549').textContent.indexOf('Capítulo 1 de 2') === 0 && $('kdEpTitle1549').textContent.indexOf('La cláusula de prueba') >= 0);
    check('1.5.61 visor originales: con subtítulos, el botón CC está visible y dice el idioma actual', !$('kdCcBtn1560').classList.contains('hidden') && $('kdCcBtn1560').textContent.indexOf('CC:') === 0);
    check('1.5.61 visor originales: el menú CC trae español, inglés, portugués y sin subtítulos', (function () { window.__wrKdSubMenu1560(); var m = $('kdSubMenu1560'); var t = m ? m.textContent : ''; window.__wrKdSubMenu1560(); return t.indexOf('Español') >= 0 && t.indexOf('English') >= 0 && t.indexOf('Português') >= 0 && t.indexOf('Sin subtítulos') >= 0; })());
    var vtt61 = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nValeria: Buenos días, señor Andrés.\n\n00:00:04.000 --> 00:00:06.000\nAndrés: Buenos días, Valeria.\n';
    check('1.5.61 subtítulos: el parser WebVTT saca los cues con inicio, fin y texto', (function () { var cues = T26.kdParseVtt1560(vtt61); return cues.length === 2 && cues[0].start === 1000 && cues[0].end === 3500 && cues[0].text.indexOf('Buenos días') >= 0 && cues[1].start === 4000; })());
    var origFetch61 = window.fetch;
    window.fetch = function (u) { return Promise.resolve({ ok: true, text: function () { return Promise.resolve(vtt61); } }); };
    var ch61 = T26.kdChapterAt1558(T26.getKdramaActive1549()[0], 0);
    T26.kdLoadSubs1560(ch61);
    await tick(); await tick();
    check('1.5.61 subtítulos: al cargar el VTT se pintan los cues (.vsub) dentro del reproductor', qa('#kdVideoWrap1556 .vsub').length === 2 && qa('#kdVideoWrap1556 .vsub')[0].getAttribute('data-sub-start') === '1000' && qa('#kdVideoWrap1556 .vsub')[0].getAttribute('data-sub-end') === '3500');
    window.fetch = origFetch61;
    window.__wrKdSubLang1560('en');
    check('1.5.61 subtítulos: elegir inglés se guarda y el botón CC lo muestra', T26.kdSubLang1560() === 'en' && window.localStorage.getItem('wordred_kdsublang1560') === 'en' && $('kdCcBtn1560').textContent.indexOf('English') >= 0);
    window.__wrKdSubLang1560('es');
    check('1.5.61 subtítulos: volver a español se guarda', T26.kdSubLang1560() === 'es' && window.localStorage.getItem('wordred_kdsublang1560') === 'es');
    T26.openKdrama1549(0, 0);
    click($('kdClose1549'));
    check('1.5.61 visor originales: al cerrar, el video se quita y se limpia la imagen del capítulo', !$('kdramaOverlay1549').classList.contains('on') && !$('kdVideo1556') && !$('kdImage1549').getAttribute('src'));
    // Capítulo original sin video: imagen con «Próximamente en video» y sin botón CC.
    T26.openKdrama1549(0, 1);
    check('1.5.61 visor originales: el capítulo sin video muestra su imagen de escena con «Próximamente en video»', !$('kdSoon1556').classList.contains('hidden') && $('kdSoon1556').textContent.indexOf('Próximamente en video') >= 0 && !$('kdVideo1556') && !!$('kdImage1549').getAttribute('src'));
    check('1.5.61 visor originales: sin video no hay botón CC', $('kdCcBtn1560').classList.contains('hidden'));
    click($('kdClose1549'));
    window.localStorage.removeItem('wordred_kdramas1561');
    T26.resetKdramas1554();
    T26.renderKdramaHome1549();
    // La forma ShortMax por caché: se pinta con su etiqueta y su video de YouTube.
    window.localStorage.setItem('wordred_kdramas1561', JSON.stringify({ at: Date.now(), kdramas: [{ id: 'drama-cache61', name: 'Drama en caché 1.5.61', synopsis: 'Sinopsis en caché.', poster: 'https://i.ytimg.com/vi/BBBBBBBBBBB/hqdefault.jpg', totalEps: 2, source: 'shortmax', eps: [{ ep: 1, videoId: 'BBBBBBBBBBB', title: 'Capítulo en caché', ytTitle: 'Capítulo en caché', thumb: 'https://i.ytimg.com/vi/BBBBBBBBBBB/hqdefault.jpg' }] }] }));
    T26.resetKdramas1554();
    T26.fetchKdramas1554();
    T26.renderKdramaHome1549();
    check('1.5.61 caché: con la clave 1561 fresca se pinta lo guardado sin pedir al servidor', $('kdramaReels1549').textContent.indexOf('Drama en caché 1.5.61') >= 0 && $('kdramaReels1549').textContent.indexOf('ShortMax') >= 0);
    T26.openKdrama1549(0, 0);
    check('1.5.61 visor ShortMax: el capítulo gratis carga su video de YouTube con autoplay', !!$('kdYtFrame1558') && $('kdYtFrame1558').getAttribute('src').indexOf('https://www.youtube.com/embed/BBBBBBBBBBB?autoplay=1&rel=0&playsinline=1&enablejsapi=1') === 0);
    check('1.5.61 miembros: el capítulo 2 de la serie en caché es de miembros (sin videoId)', (function () { var ch = T26.kdChapterAt1558(T26.getKdramaActive1549()[0], 1); return !!ch && ch.member === true && ch.videoId === null && ch.n === 2; })());
    click($('kdClose1549'));
    // Una caché con la forma vieja de originales AHORA SÍ vale (doble forma): se pinta, no se ignora.
    window.localStorage.setItem('wordred_kdramas1561', JSON.stringify({ at: Date.now(), kdramas: [{ id: 'drama-cache-viejo', name: 'Drama viejo en caché', synopsis: 'Sinopsis vieja.', poster: 'dramas/cache-portada.jpg', chapters: [{ n: 1, title: 'Capítulo viejo', text: 'Texto de más de cien caracteres para que la validación del catálogo de dramas originales lo acepte sin problema alguno.', image: 'dramas/cache-cap1.jpg' }] }] }));
    T26.resetKdramas1554();
    T26.fetchKdramas1554();
    await tick(); await tick();
    T26.renderKdramaHome1549();
    check('1.5.61 caché: una caché con la forma de originales AHORA se acepta (doble forma)', $('kdramaReels1549').textContent.indexOf('Drama viejo en caché') >= 0);
    window.localStorage.removeItem('wordred_kdramas1561');
    T26.resetKdramas1554();
    T26.renderKdramaHome1549();
    window.localStorage.removeItem('wordred_kdramas1561');
    T26.resetKdramas1554();
    T26.renderKdramaHome1549();
    // --- 1.5.62: etiqueta Dramas, dramas entre Shorts e historias, buscador del inicio ---
    check('1.5.62 etiqueta: la etiqueta junto a «Dramas» nombra ReelShort, DramaBox y ShortMax', !!$('kdSectionBadge1562') && $('kdSectionBadge1562').textContent === 'ReelShort · DramaBox · ShortMax');
    check('1.5.62 etiqueta: una aplicación nueva del catálogo (fixture FlexTV) aparece en la etiqueta sin tocar código', (function () {
      window.localStorage.setItem('wordred_kdramas1561', JSON.stringify({ at: Date.now(), kdramas: [{ id: 'drama-flextv62', name: 'Drama FlexTV de prueba', synopsis: 'S.', poster: 'https://i.ytimg.com/vi/BBBBBBBBBBB/hqdefault.jpg', totalEps: 1, source: 'FlexTV', eps: [{ ep: 1, videoId: 'BBBBBBBBBBB', title: 'Cap 1', ytTitle: 'Cap 1', thumb: 'https://i.ytimg.com/vi/BBBBBBBBBBB/hqdefault.jpg' }] }] }));
      T26.resetKdramas1554(); T26.fetchKdramas1554(); T26.renderKdramaHome1549();
      var txt = $('kdSectionBadge1562').textContent;
      var ok = txt.indexOf('FlexTV') >= 0 && txt.indexOf('ReelShort') >= 0 && txt.indexOf('DramaBox') >= 0 && txt.indexOf('ShortMax') >= 0;
      window.localStorage.removeItem('wordred_kdramas1561'); T26.resetKdramas1554(); T26.renderKdramaHome1549();
      return ok;
    })());
    check('1.5.62 shorts: entre 7 Shorts se cuela 1 tarjeta de drama (después del 6.º)', (function () {
      var items = []; for (var i = 0; i < 7; i++) items.push({ kind: 'story', id: 's' + i });
      var out = T26.kdInterleaveDramas1562(items);
      return out.length === 8 && out[6].kind === 'drama' && !!out[6].series && out[6].series.id === 'la-doble-vida-de-mi-esposo-multimillonario';
    })());
    check('1.5.62 shorts: con 20 Shorts las tarjetas caen cada 6–9 y las series rotan', (function () {
      var items = []; for (var i = 0; i < 20; i++) items.push({ kind: 'story', id: 's' + i });
      var out = T26.kdInterleaveDramas1562(items);
      var pos = []; out.forEach(function (it, i) { if (it.kind === 'drama') pos.push(i); });
      var gapsOk = pos.length >= 2 && pos.every(function (p, i) { return i === 0 || (p - pos[i - 1] >= 6 && p - pos[i - 1] <= 10); });
      var ids = out.filter(function (it) { return it.kind === 'drama'; }).map(function (it) { return it.seriesId; });
      return gapsOk && ids.some(function (id) { return id !== ids[0]; });
    })());
    var shorts62 = [];
    for (var s62 = 0; s62 < 7; s62++) shorts62.push(T.core.createPost(T26.getState(), T26.getState().me, { text: 'Video Shorts 62-' + s62, media: 'https://srv/v62-' + s62 + '.mp4', mediaType: 'video' }).post);
    T.openShorts();
    check('1.5.62 shorts: el feed real trae la tarjeta de drama tras 6 videos', T26.loadShortsItems().some(function (it) { return it.kind === 'drama'; }));
    var sw62 = function () { var e1 = new window.Event('touchstart', { bubbles: true, cancelable: true }); e1.touches = [{ clientY: 300 }]; e1.changedTouches = [{ clientY: 300 }]; $('shortsBody').dispatchEvent(e1); var e2 = new window.Event('touchend', { bubbles: true, cancelable: true }); e2.touches = [{ clientY: 200 }]; e2.changedTouches = [{ clientY: 200 }]; $('shortsBody').dispatchEvent(e2); };
    for (var w62 = 0; w62 < 6; w62++) sw62();
    check('1.5.62 shorts: la tarjeta de drama se ve como un Short (portada, título y «Ver drama», sin botones de like/comentar)', $('shortsInfo').textContent.indexOf('Ver drama') >= 0 && $('shortsBody').textContent.indexOf('La doble vida de mi esposo multimillonario') >= 0 && $('shortsBody').textContent.indexOf('ReelShort') >= 0);
    click(q('#shortsBody [onclick*="__wrOpenDrama1562"]'));
    check('1.5.62 shorts: tocar la tarjeta abre el drama en su PRIMER capítulo con la guía de gestos visible', T26.getKdState1549().ep === 0 && $('kdramaOverlay1549').classList.contains('on') && !$('kdGuide1549').classList.contains('hidden') && $('kdSeriesTitle1549').textContent === 'La doble vida de mi esposo multimillonario');
    T26.openKdrama1549(0, 1);
    check('1.5.62 shorts: en los demás capítulos la guía NO aparece', $('kdGuide1549').classList.contains('hidden'));
    click($('kdClose1549')); click($('shortsClose'));
    shorts62.forEach(function (p) { T.core.deletePost(T26.getState(), T26.getState().me, p.id); });
    // Historias: círculo de drama entre las historias.
    check('1.5.62 historias: con 3 historias, el círculo de drama va al final de la fila', (function () {
      var pos = T26.kdStoryDramaPositions1562(3);
      return pos.length === 1 && pos[0] === 3;
    })());
    T26.renderStories();
    check('1.5.62 historias: entre las historias aparece un círculo de drama (portada + etiqueta de su aplicación)', !!q('#storiesRow [data-kd-story1562]') && q('#storiesRow [data-kd-story1562]').textContent.indexOf('ReelShort') >= 0);
    click(q('#storiesRow [data-kd-story1562]'));
    check('1.5.62 historias: tocar el círculo abre el drama en su PRIMER capítulo con la guía visible', T26.getKdState1549().ep === 0 && $('kdramaOverlay1549').classList.contains('on') && !$('kdGuide1549').classList.contains('hidden'));
    click($('kdClose1549'));
    // Buscador del inicio.
    check('1.5.62 buscador: la barra está SOLO en el inicio (dentro de #view-feed, antes de #homeWidgets1536) y es translúcida', (function () { var feed = $('view-feed'); var bar = $('homeSearchWrap1562'); return !!feed && !!bar && feed.contains(bar) && bar.previousElementSibling !== null && $('homeSearchBar1562').classList.contains('glass') && !!$('homeSearchInput1562'); })());
    check('1.5.62 buscador: al escribir aparecen sugerencias en vivo (sin tildes: «atrape» encuentra «Atrapé el corazón…»)', (function () {
      setVal($('homeSearchInput1562'), 'atrape');
      var box = $('homeSearchSug1562');
      return !box.classList.contains('hidden') && box.textContent.indexOf('Atrapé el corazón de un multimillonario') >= 0 && box.textContent.indexOf('Dramas') >= 0;
    })());
    check('1.5.62 buscador: tocar la sugerencia de drama abre el drama en su primer capítulo', (function () {
      var item = q('#homeSearchSug1562 [data-hs-type="drama"]');
      if (!item) return false;
      click(item);
      return T26.getKdState1549().ep === 0 && $('kdramaOverlay1549').classList.contains('on') && $('homeSearchSug1562').classList.contains('hidden');
    })());
    click($('kdClose1549'));
    check('1.5.62 buscador: la X limpia y cierra las sugerencias; tocar fuera también las cierra', (function () {
      setVal($('homeSearchInput1562'), 'doble');
      var open = !$('homeSearchSug1562').classList.contains('hidden');
      click($('homeSearchClear1562'));
      var cleared = $('homeSearchInput1562').value === '' && $('homeSearchSug1562').classList.contains('hidden');
      setVal($('homeSearchInput1562'), 'doble');
      var open2 = !$('homeSearchSug1562').classList.contains('hidden');
      window.document.body.dispatchEvent(new window.Event('click', { bubbles: true }));
      var closed = $('homeSearchSug1562').classList.contains('hidden');
      return open && cleared && open2 && closed;
    })());
    check('1.5.62 buscador: la búsqueda vieja sigue igual (busca personas, publicaciones, grupos y etiquetas; NO trae dramas)', (function () {
      var p62 = T.core.createPost(T26.getState(), T26.getState().me, { text: 'Zebra buscador viejo 62' }).post;
      T26.go('search');
      setVal($('searchInput'), 'Zebra buscador');
      var found = $('searchResults').textContent.indexOf('Zebra buscador viejo 62') >= 0;
      setVal($('searchInput'), 'Atrapé');
      var noDramaSection = $('searchResults').textContent.indexOf('Dramas') < 0;
      T.core.deletePost(T26.getState(), T26.getState().me, p62.id);
      return found && noDramaSection;
    })());
    // Tutorial y FAQ.
    check('1.5.62 tutorial: sigue en 6 pasos y menciona la subida que continúa, los dramas entre Shorts e historias, la etiqueta y el buscador', (function () {
      var steps = T26.getTutorialSteps1533();
      var txt = steps.map(function (s) { return s.text; }).join(' ');
      return steps.length === 6 && txt.indexOf('continúa donde se quedó') >= 0 && txt.indexOf('tarjetas de dramas') >= 0 && txt.indexOf('etiqueta de Dramas nombra sus aplicaciones') >= 0 && txt.indexOf('llegan más dramas cada 2 semanas') >= 0 && txt.indexOf('hay un buscador') >= 0;
    })());
    check('1.5.62 FAQ: las preguntas nuevas existen con respuestas ≤400, el total sigue en 29 y la de publicar ya no habla de borradores', (function () {
      var faq = T26.getFaq();
      var qs = ['¿Por qué ya no falla publicar al final?', '¿Por qué aparecen dramas entre los Shorts y las historias?', '¿Cada cuánto llegan dramas y aplicaciones nuevas?', '¿Cómo busco algo desde el inicio?'];
      var pub = faq.filter(function (f) { return f.q === '¿Cómo publico algo?'; })[0];
      return faq.length === 29 && qs.every(function (q) { var f = faq.filter(function (x) { return x.q === q; })[0]; return !!f && f.a.length <= 400; }) && faq.every(function (f) { return f.a.length <= 400; }) && !!pub && pub.a.indexOf('continúa donde se quedó') >= 0 && pub.a.indexOf('borradores') < 0;
    })());
    // Programada con medio local: queda pendiente, no se confirma rota.
    check('1.5.62 medio local: el núcleo reconoce un post pendiente con medio local (blob:/content:/data:)', T.core.isPostPendingBody1562({ kind: 'http', path: '/api/posts', method: 'POST', body: { post: { text: 'x', media: 'blob:null/abc' } } }) === true && T.core.isPostPendingBody1562({ kind: 'http', path: '/api/posts', method: 'POST', body: { post: { text: 'x', media: 'https://srv/foto.jpg' } } }) === false && T.core.isLocalMediaValue1562('content://com.wordred.app.fileprovider/apk-files/media/v.mp4') === true);
    T26.core.setMediaUploadSleep1546(function () { return Promise.resolve(); });
    calls.mediaFailStart = 99;
    var tokOrig62 = T26.getState().settings.serverToken;
    T26.getState().settings.serverToken = 'tok-dom-62';
    var sch62 = T.core.schedulePost(T26.getState(), { text: 'Programada rota 62', media: 'blob:null/281f7dec-0000-0000-0000-000000000000', mediaType: 'video' }, Date.now() + 3600000);
    sch62.item.atMs = Date.now() - 1000;
    await T26.publishDueScheduled1526();
    check('1.5.62 medio local: una programada con medio local que no se pudo subir queda PENDIENTE (no se confirma rota)', (function () {
      var p = T26.getState().posts.filter(function (x) { return x.text === 'Programada rota 62'; })[0];
      return !!p && p.pendingSync === true && p.media === 'blob:null/281f7dec-0000-0000-0000-000000000000';
    })());
    check('1.5.62 medio local: se avisa que no se pudo subir su foto o video y que queda pendiente', T26.getState().notifications.some(function (n) { return (n.text || '').indexOf('no se pudo subir su foto o video. Queda pendiente y se reintentará.') >= 0; }));
    calls.mediaFailStart = 0; T26.core.setMediaUploadSleep1546(null);
    T26.getState().settings.serverToken = tokOrig62;
    // --- 1.5.61: video del muro a pantalla completa con rotación y resplandor del cargador ---
    check('1.5.61 video muro: el reproductor propio trae play/pausa, progreso, tiempo, silencio, CC, pantalla completa y 6 velocidades', (function () { var h = T26.wrPlayerHtml('<video src="https://srv/v61.mp4" playsinline></video>', {}); return h.indexOf('wrPlay') >= 0 && h.indexOf('wrProg') >= 0 && h.indexOf('wrTime') >= 0 && h.indexOf('wrMute') >= 0 && h.indexOf('wrCc') >= 0 && h.indexOf('wrFull') >= 0 && h.indexOf('wrSpeedMenu') >= 0 && h.indexOf('0.5') >= 0 && h.indexOf('2') >= 0; })());
    var wallPost61 = C26.createPost(st26, st26.me, { text: 'Video viejo 1.5.61', mediaList: [{ src: 'https://srv/viejo61.mp4', type: 'video' }], privacy: 'Público' });
    T26.renderFeed();
    await tick(); await tick();
    check('1.5.61 video muro: un video ya publicado usa el mismo reproductor completo (sin versión recortada)', (function () { if (!wallPost61.ok) return false; var art = window.document.querySelector('article.post[data-post="' + wallPost61.post.id + '"] .wrPlayer'); return !!art && !!art.querySelector('.wrFull') && !!art.querySelector('.wrPlay') && !!art.querySelector('.wrProg') && !!art.querySelector('.wrMute') && !!art.querySelector('.wrCc') && !!art.querySelector('.wrSpeedMenu'); })());
    check('1.5.61 video muro: al cambiar la pantalla completa, el botón cambia de icono (expandir/comprimir)', (function () { var btn = window.document.querySelector('.wrPlayer .wrFull'); if (!btn) return false; btn.innerHTML = 'X'; window.document.dispatchEvent(new window.Event('fullscreenchange')); return btn.innerHTML.indexOf('M8 3H5') >= 0; })());
    st26.posts = st26.posts.filter(function (p) { return !wallPost61.ok || p.id !== wallPost61.post.id; });
    T26.renderFeed();
    await tick();
    check('1.5.61 cargador: el resplandor existe en la página y es rojo, solo orillas y transitorio', !!$('chargerGlow1561') && (function () { var css = Array.prototype.map.call(window.document.querySelectorAll('style'), function (st) { return st.textContent; }).join('\n'); return /#chargerGlow1561\{[^}]*box-shadow:inset[^}]*rgba\(230,0,38/.test(css) && /@keyframes chargerGlowRise1561/.test(css) && /clip-path:inset\(100% 0 0 0\)/.test(css); })());
    check('1.5.61 cargador: al conectar el cargador se enciende el resplandor y se apaga solo', (function () { var ok = window.__wrChargerGlow1561(); var on = $('chargerGlow1561').classList.contains('on'); return ok === true && on; })());
    await sleep(1800);
    check('1.5.61 cargador: pasados ~1.7 s el resplandor ya se apagó solo', !$('chargerGlow1561').classList.contains('on'));
    // --- 1.5.59: posición del muro (sustituye la regla de la 1.5.57) ---
    // Lanzamiento limpio -> arriba; regreso (aunque pasen más de 60 s
    // fuera, o tras morir por poca RAM) -> donde quedó. La marca de
    // sesión viva (wordred_alive1559) distingue uno del otro.
    var scrollCalls57 = [];
    var origScrollTo57 = window.scrollTo;
    window.scrollTo = function (x, y) { scrollCalls57.push([x, y]); };
    var sivCalls57 = [];
    var origSiv57 = window.Element.prototype.scrollIntoView;
    window.Element.prototype.scrollIntoView = function () { sivCalls57.push(this.getAttribute('data-post')); };
    T26.bindAppReturnHome1557();
    T26.go('feed');
    await tick();
    var art57 = window.document.querySelector('#feed article[data-post]');
    var savedPost57 = art57 && art57.getAttribute('data-post');
    st26.lastFeedPostId = savedPost57;
    // Lanzamiento limpio (sin marca de sesión viva): al entrar NO se
    // restaura la posición guardada: se sube arriba y no se salta al post guardado.
    window.localStorage.removeItem('wordred_alive1559');
    scrollCalls57.length = 0; sivCalls57.length = 0;
    T26.enterApp();
    check('1.5.59 inicio: lanzamiento limpio (desde cerrada) no restaura la posición guardada (sube arriba, sin saltar al post guardado)', !!savedPost57 && !$('appView').classList.contains('hidden') && $('authView').classList.contains('hidden') && scrollCalls57.some(function (c) { return c[0] === 0 && c[1] === 0; }) && sivCalls57.length === 0, 'post=' + savedPost57 + ' scrollTo=' + JSON.stringify(scrollCalls57) + ' siv=' + JSON.stringify(sivCalls57));
    // resetHomeToTop1557: lo mismo, a mano.
    scrollCalls57.length = 0; sivCalls57.length = 0;
    T26.resetHomeToTop1557();
    check('1.5.59 inicio: resetHomeToTop1557 sube arriba sin restaurar la posición guardada', scrollCalls57.some(function (c) { return c[0] === 0 && c[1] === 0; }) && sivCalls57.length === 0, 'scrollTo=' + JSON.stringify(scrollCalls57) + ' siv=' + JSON.stringify(sivCalls57));
    // Dentro de la misma sesión la restauración SIGUE: salir del inicio y volver sí salta al post guardado.
    T26.go('friends');
    await tick();
    st26.lastFeedPostId = savedPost57;
    T26.go('feed');
    await new Promise(function (r) { setTimeout(r, 450); });
    check('1.5.59 inicio: dentro de la sesión, volver al inicio SÍ restaura la posición guardada', sivCalls57.indexOf(savedPost57) >= 0, 'siv=' + JSON.stringify(sivCalls57));
    // Regreso tras más de un minuto fuera (1.5.59: ya NO se vuelve
    // arriba): con la sesión viva, al entrar se restaura donde quedó.
    qa('.overlay.on').forEach(function (el) { el.classList.remove('on'); });
    T26.markAlive1559();
    scrollCalls57.length = 0; sivCalls57.length = 0;
    var expected59 = null; /* lo que se guardó al salir del inicio es donde hay que volver */
    T26.go('friends');
    await tick();
    expected59 = st26.lastFeedPostId;
    T26.enterApp();
    await new Promise(function (r) { setTimeout(r, 450); });
    check('1.5.59 inicio: al volver con la sesión viva NO se vuelve arriba (se restaura donde quedó)', !!expected59 && sivCalls57.indexOf(expected59) >= 0, 'guardado=' + savedPost57 + ' esperado=' + expected59 + ' scrollTo=' + JSON.stringify(scrollCalls57) + ' siv=' + JSON.stringify(sivCalls57));
    // Muerte por poca RAM: la marca queda (el cierre no avisó) y al
    // entrar NO es lanzamiento limpio; al cerrarse bien, la marca se
    // borra y el próximo entrar sí es lanzamiento limpio.
    check('1.5.59 inicio: tras morir por poca RAM la sesión NO es lanzamiento limpio', !T26.isCleanLaunch1559(), 'marca=' + window.localStorage.getItem('wordred_alive1559'));
    T26.clearAlive1559();
    check('1.5.59 inicio: al cerrarse bien la marca se borra y el próximo entrar es lanzamiento limpio', T26.isCleanLaunch1559());
    window.scrollTo = origScrollTo57;
    window.Element.prototype.scrollIntoView = origSiv57;
    // --- 1.5.59: perfil propio (¿Qué estás pensando?, compartir, Gamer Premium) ---
    T26.go('profile');
    await tick();
    var think59 = q('#ownProfile .thinkBox1559');
    check('1.5.59 perfil: hay una sección «¿Qué estás pensando?» en el perfil propio', !!think59 && think59.textContent.indexOf('¿Qué estás pensando?') >= 0);
    check('1.5.59 perfil: la sección tiene recuadro rojo (borde rojo de 2 px, esquinas redondeadas)', !!think59 && (function () { var cs = window.getComputedStyle(think59); return cs.borderTopWidth === '2px' && cs.borderTopStyle === 'solid' && parseFloat(cs.borderRadius) >= 10; })() && window.document.querySelector('style').textContent.indexOf('.thinkBox1559') >= 0 && window.document.querySelector('style').textContent.indexOf('border:2px solid var(--red)') >= 0, think59 && window.getComputedStyle(think59).borderTopWidth + ' ' + window.getComputedStyle(think59).borderTopStyle + ' ' + window.getComputedStyle(think59).borderRadius);
    check('1.5.59 perfil: al tocar «¿Qué estás pensando?» se abre el publicador', (function () { click(think59); return $('composerOverlay') && $('composerOverlay').classList.contains('on'); })());
    click(q('[data-close="composerOverlay"]'));
    var ownH2_59 = q('#ownProfile .ownName');
    check('1.5.59 perfil: el botón de compartir está ANTES del botón Editar', !!ownH2_59 && ownH2_59.innerHTML.indexOf('ownShareBtn1559') >= 0 && ownH2_59.innerHTML.indexOf('ownShareBtn1559') < ownH2_59.innerHTML.indexOf('ownEditBtn'));
    calls.shared = [];
    click(q('#ownProfile .ownShareBtn1559'));
    check('1.5.59 perfil: compartir el perfil abre la hoja de compartir con el enlace del perfil', calls.shared.some(function (s) { return (s.text || '').indexOf('wordred://perfil/') >= 0; }), JSON.stringify(calls.shared));
    var fgProf59 = q('#ownProfile #featuredGameProfile1559');
    check('1.5.59 perfil: el apartado Gamer Premium está en el perfil propio', !!fgProf59 && fgProf59.textContent.indexOf('Gamer Premium') >= 0 && fgProf59.textContent.indexOf('Fantore Resurrección') >= 0);
    check('1.5.59 perfil: el juego destacado no se duplica (una copia en el muro y otra en el perfil, con id distinto)', qa('#featuredGame1549').length === 1 && qa('#featuredGameProfile1559').length === 1);
    // --- 1.5.60: perfil propio (¿Qué estás pensando? ARRIBA de las destacadas; Navegador antes de la moneda) ---
    var ownHtml60 = $('ownProfile').innerHTML;
    check('1.5.60 perfil: «¿Qué estás pensando?» va ARRIBA de las secciones destacadas y de Gamer Premium', ownHtml60.indexOf('thinkBox1559') >= 0 && ownHtml60.indexOf('thinkBox1559') < ownHtml60.indexOf('featuredGameProfile1559') && ownHtml60.indexOf('thinkBox1559') < ownHtml60.indexOf('Mis publicaciones') && (ownHtml60.indexOf('Destacadas') < 0 || ownHtml60.indexOf('thinkBox1559') < ownHtml60.indexOf('Destacadas')));
    var ownH2_60 = q('#ownProfile .ownName');
    check('1.5.60 perfil: el botón del Navegador va ANTES de la moneda, y esta antes de compartir y de Editar', !!ownH2_60 && ownH2_60.innerHTML.indexOf('ownBrowserBtn1560') >= 0 && ownH2_60.innerHTML.indexOf('ownBrowserBtn1560') < ownH2_60.innerHTML.indexOf('ownPromoCoin1547') && ownH2_60.innerHTML.indexOf('ownPromoCoin1547') < ownH2_60.innerHTML.indexOf('ownShareBtn1559') && ownH2_60.innerHTML.indexOf('ownShareBtn1559') < ownH2_60.innerHTML.indexOf('ownEditBtn'));
    check('1.5.60 perfil: el botón del Navegador trae símbolo Y texto («Navegador»)', !!ownH2_60 && !!ownH2_60.querySelector('.ownBrowserBtn1560') && ownH2_60.querySelector('.ownBrowserBtn1560').textContent.indexOf('Navegador') >= 0 && !!ownH2_60.querySelector('.ownBrowserBtn1560 svg'));
    // Sin puente (web/pruebas) el navegador interno devuelve false y no abre nada afuera.
    check('1.5.60 navegador: sin puente nativo, abrir el navegador devuelve false (no sale de la app)', window.__wrOpenBrowser('https://www.google.com') === false && window.__wrOpenBrowser('nota-url') === false);
    // Con puente, todo enlace web va al navegador interno (nada al navegador del teléfono).
    var realBridge60 = window.AndroidBridge;
    var browserCalls60 = [];
    window.AndroidBridge = { openInAppBrowser: function (u) { browserCalls60.push(u); }, openTrailer: function (id, t) { browserCalls60.push('trailer:' + id); } };
    window.__wrOpenUrl(encodeURIComponent('https://example.com/pagina'));
    check('1.5.60 navegador: un enlace web se abre en el navegador interno, no afuera', browserCalls60.length === 1 && browserCalls60[0] === 'https://example.com/pagina');
    window.__wrOpenTrailer(encodeURIComponent('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
    check('1.5.60 tráiler: un tráiler de YouTube se abre en el reproductor interno con su id', browserCalls60.length === 2 && browserCalls60[1] === 'trailer:dQw4w9WgXcQ');
    window.__wrOpenTrailer(encodeURIComponent('https://vimeo.com/123456'));
    check('1.5.60 tráiler: un tráiler que no es de YouTube va al navegador interno', browserCalls60.length === 3 && browserCalls60[2] === 'https://vimeo.com/123456');
    window.AndroidBridge = realBridge60;
    // --- 1.5.59: chat — lo mío a la derecha, lo de la otra persona a la izquierda ---
    var key59 = T26.core.convoKey('5511111111', '5522222222');
    var convOrig59 = st26.conversations[key59];
    st26.conversations[key59] = { id: 'conv59', participants: ['5511111111', '5522222222'], messages: [
      { id: 'm59a', from: '5511111111', text: 'Mensaje mío 59', createdAt: Date.now() - 20000, readBy: ['5511111111'] },
      { id: 'm59b', from: '5522222222', text: 'Mensaje de Bruno 59', createdAt: Date.now() - 10000, readBy: ['5522222222'] }
    ], unread: {} };
    window.__wrOpenChat('5522222222');
    await tick();
    var msgs59 = qa('#chatMsgs .msg');
    check('1.5.59 chat: mi mensaje sale a la derecha (me) y el de la otra persona a la izquierda (them)', msgs59.length >= 2 && msgs59[0].classList.contains('me') && msgs59[1].classList.contains('them'), msgs59.map(function (m) { return m.className; }).join(','));
    check('1.5.59 chat: a la derecha va pegado al borde derecho y a la izquierda al izquierdo', msgs59.length >= 2 && window.getComputedStyle(msgs59[0]).alignSelf === 'flex-end' && window.getComputedStyle(msgs59[1]).alignSelf === 'flex-start');
    // La causa: mi identidad sin normalizar (correo de Google con
    // mayúsculas) dejaba mis mensajes a la izquierda, como si fueran
    // de la otra persona. Con la comparación normalizada siguen a la derecha.
    var meOrig59 = st26.me;
    st26.me = 'Misterystoreplay@Gmail.com';
    st26.profiles['Misterystoreplay@Gmail.com'] = { name: 'Yo', phone: 'Misterystoreplay@Gmail.com', photo: '', verified: true };
    var key59b = T26.core.convoKey('misterystoreplay@gmail.com', '5522222222');
    var convOrig59b = st26.conversations[key59b];
    st26.conversations[key59b] = { id: 'conv59b', participants: ['misterystoreplay@gmail.com', '5522222222'], messages: [
      { id: 'm59c', from: 'misterystoreplay@gmail.com', text: 'Mensaje mío con correo en minúsculas', createdAt: Date.now() - 5000, readBy: ['misterystoreplay@gmail.com'] },
      { id: 'm59d', from: '5522222222', text: 'Respuesta de Bruno', createdAt: Date.now() - 1000, readBy: ['5522222222'] }
    ], unread: {} };
    window.__wrOpenChat('5522222222');
    await tick();
    var msgs59b = qa('#chatMsgs .msg');
    check('1.5.59 chat: con mi identidad en otra forma (mayúsculas), mi mensaje SIGUE a la derecha', msgs59b.length >= 2 && msgs59b[0].classList.contains('me') && msgs59b[1].classList.contains('them'), msgs59b.map(function (m) { return m.className; }).join(','));
    st26.conversations[key59b].messages.push({ id: 'm59e', from: 'misterystoreplay@gmail.com', text: 'Mensaje mío último 59', createdAt: Date.now(), readBy: ['misterystoreplay@gmail.com'] });
    check('1.5.59 chat: con mi identidad en otra forma, la vista previa dice «Tú:» en mi mensaje', (function () { T26.go('messages'); return $('convoList').textContent.indexOf('Tú: Mensaje mío último 59') >= 0; })());
    st26.me = meOrig59;
    if (convOrig59) st26.conversations[key59] = convOrig59; else delete st26.conversations[key59];
    if (convOrig59b) st26.conversations[key59b] = convOrig59b; else delete st26.conversations[key59b];
    click(q('[data-close="chatOverlay"]'));
    // --- 1.5.60: Reels del inicio rectángulos (y el filtro vertical sigue) ---
    T26.go('feed');
    await tick();
    var rect60 = q('#storiesRow .homeReelRect1560');
    var item60 = q('#storiesRow .homeReel1549');
    check('1.5.60 reels: los rectángulos del inicio son 140×190 con esquinas de 18 px (antes círculos de 96 px)', !!rect60 && window.getComputedStyle(rect60).width === '140px' && window.getComputedStyle(rect60).height === '190px' && window.getComputedStyle(rect60).borderRadius === '18px', rect60 && window.getComputedStyle(rect60).width + 'x' + window.getComputedStyle(rect60).height);
    check('1.5.60 reels: cada reel ocupa más ancho (150 px, antes 112 px)', !!item60 && window.getComputedStyle(item60).width === '150px', item60 && window.getComputedStyle(item60).width);
    check('1.5.60 reels: el primer rectángulo sigue siendo para crear un reel propio', !!item60 && item60.classList.contains('homeReelMe1549') && (item60.getAttribute('onclick') || '').indexOf('__wrOpenReelCreate') >= 0 && !!item60.querySelector('.homeReelAdd1549'));
    check('1.5.60 reels: la fila corre a los lados con gestos (overflow-x auto)', (function () { var cs = window.getComputedStyle(q('#storiesRow')); return cs.overflowX === 'auto'; })());
    // --- 1.5.60: videos en publicaciones caben en su recuadro; tráilers dentro de la app ---
    check('1.5.60 video: el video de una publicación tiene altura máxima y llena su recuadro sin tapar lo demás', window.document.querySelector('style').textContent.indexOf('.post .media .wrPlayer video{max-height:64vh;object-fit:cover}') >= 0);
    var postVideo60 = q('#feed .post .media .wrPlayer video');
    check('1.5.60 video: en el muro, el video de una publicación no desborda su recuadro (max-height 64vh)', !!postVideo60 && Math.abs(parseFloat(window.getComputedStyle(postVideo60).maxHeight) - window.innerHeight * 0.64) < 1 && window.getComputedStyle(postVideo60).objectFit === 'cover', postVideo60 && window.getComputedStyle(postVideo60).maxHeight);
    var movieCard60 = q('#feed #billboard1540 .movieCard1540');
    check('1.5.60 tráiler: la tarjeta de película abre su tráiler dentro de la app (no un enlace afuera)', !!movieCard60 && (movieCard60.getAttribute('onclick') || '').indexOf('__wrOpenTrailer(') >= 0);
    var gameCard60 = q('#feed #gamesBillboard1543 .gameCard1543');
    check('1.5.60 tráiler: la tarjeta de juego abre su tráiler dentro de la app (no un enlace afuera)', !!gameCard60 && (gameCard60.getAttribute('onclick') || '').indexOf('__wrOpenTrailer(') >= 0);
    var trailerCalls60 = [];
    var realBridge60b = window.AndroidBridge;
    window.AndroidBridge = { openTrailer: function (id, t) { trailerCalls60.push(id); }, openInAppBrowser: function (u) { trailerCalls60.push('browser:' + u); } };
    if (movieCard60) movieCard60.click();
    check('1.5.60 tráiler: al tocar la película se abre su tráiler en el reproductor interno', trailerCalls60.length === 1 && trailerCalls60[0] === 'AAAAAAAAAAA', JSON.stringify(trailerCalls60));
    if (gameCard60) gameCard60.click();
    check('1.5.60 tráiler: al tocar el juego se abre su tráiler en el reproductor interno', trailerCalls60.length === 2 && /^[A-Za-z0-9_-]{11}$/.test(trailerCalls60[1] || ''), JSON.stringify(trailerCalls60));
    window.AndroidBridge = realBridge60b;
    // --- 1.5.60: menús de ajustes como la captura (hoja oscura, filas con control a la derecha, toggles en rojo; SIN pie) ---
    window.__wrOpenSettings();
    await tick();
    var setSheet60 = q('#settingsOverlay .sheet');
    check('1.5.60 ajustes: la hoja de Ajustes usa el estilo nuevo (oscura, muy redondeada, título grande, X circular)', !!setSheet60 && setSheet60.classList.contains('setSheet1560') && window.getComputedStyle(setSheet60).borderRadius === '28px' && window.getComputedStyle(q('#settingsOverlay .sheet .top h2')).fontSize === '28px' && window.getComputedStyle(q('#settingsOverlay .sheet .top .xbtn')).width === '44px', setSheet60 && window.getComputedStyle(setSheet60).borderRadius);
    check('1.5.60 ajustes: SIN texto al pie en la hoja de Ajustes (corrección 11:03 CST)', $('settingsOverlay').textContent.indexOf('Diseñada y Creada por Mistery Store Play') < 0);
    var notifRow60 = q('#notifPrefs .setRow1560');
    check('1.5.60 ajustes: las notificaciones son filas con el interruptor rojo a la derecha', !!notifRow60 && !!notifRow60.querySelector('.setSwitch1560 input[type=checkbox][data-pref]') && !!notifRow60.querySelector('.setRowTxt1560 b') && !!notifRow60.querySelector('.setSwitch1560 .setKnob1560'));
    check('1.5.60 ajustes: el interruptor de notificaciones sigue funcionando (apaga y guarda)', (function () { var inp = q('#notifPrefs .setSwitch1560 input[data-pref="notifLikes"]'); if (!inp) return false; inp.checked = false; inp.dispatchEvent(new window.Event('change', { bubbles: true })); var off = st26.settings.notifLikes === false; inp.checked = true; inp.dispatchEvent(new window.Event('change', { bubbles: true })); return off && st26.settings.notifLikes !== false; })());
    check('1.5.60 ajustes: la privacidad es una fila con desplegable tipo píldora a la derecha', !!q('#settingsOverlay .setRow1560 #settingsPrivacy') && window.getComputedStyle($('settingsPrivacy')).borderRadius === '999px');
    check('1.5.60 ajustes: el bloqueo es una fila con interruptor rojo (el interruptor sigue existiendo)', !!$('appLockToggle') && !!$('appLockToggle').closest('.setSwitch1560') && !!$('appLockToggle').closest('.setRow1560'));
    T26.hideOverlay('settingsOverlay');
    // Ajustes del cajón: misma hoja, interruptores y deslizador en rojo.
    click($('navLauncherBtn'));
    await tick(); await tick();
    click($('appsDrawerSettingsBtn1547'));
    await tick();
    var drawerSheet60 = q('#drawerSettingsOverlay1547 .sheet');
    check('1.5.60 ajustes: la hoja de Ajustes del cajón usa el mismo estilo nuevo', !!drawerSheet60 && drawerSheet60.classList.contains('setSheet1560') && window.getComputedStyle(drawerSheet60).borderRadius === '28px' && window.getComputedStyle(q('#drawerSettingsOverlay1547 .sheet .top h2')).fontSize === '28px');
    check('1.5.60 ajustes: SIN texto al pie en la hoja del cajón', $('drawerSettingsOverlay1547').textContent.indexOf('Diseñada y Creada por Mistery Store Play') < 0);
    check('1.5.60 ajustes: contadores y animaciones del cajón son interruptores rojos', !!$('drawerBadgesToggle1547') && !!$('drawerBadgesToggle1547').closest('.setSwitch1560') && !!$('drawerAnimToggle1547') && !!$('drawerAnimToggle1547').closest('.setSwitch1560'));
    check('1.5.60 ajustes: el deslizador de transparencia lleva acento rojo #E60026', !!$('drawerAlpha1547') && ($('drawerAlpha1547').getAttribute('style') || '').indexOf('accent-color:#E60026') >= 0);
    T26.hideOverlay('drawerSettingsOverlay1547');
    // Menú CC de dramas: el idioma activo va en rojo.
    T26.openKdrama1549(0, 0);
    window.__wrKdSubMenu1560();
    check('1.5.60 ajustes: en el menú CC de dramas el idioma activo (español) va marcado en rojo', !!q('#kdSubMenu1560 button[data-sub-lang="es"].on') && !q('#kdSubMenu1560 button[data-sub-lang="en"].on'));
    window.__wrKdSubLang1560('en');
    check('1.5.60 ajustes: al cambiar a inglés, el rojo pasa al botón de inglés', !!q('#kdSubMenu1560 button[data-sub-lang="en"].on') && !q('#kdSubMenu1560 button[data-sub-lang="es"].on'));
    window.__wrKdSubLang1560('es');
    click($('kdClose1549'));
    function reelPost59(text, orient) {
      var r = C26.createPost(st26, st26.me, { text: text, mediaList: [{ src: 'https://srv/reel59-' + (orient || 'sin') + '.mp4', type: 'video', orientation: orient || '' }], privacy: 'Público' });
      return r.ok ? r.post : null;
    }
    var reelV59 = reelPost59('Reel vertical 1.5.59', 'vertical');
    var reelH59 = reelPost59('Reel horizontal 1.5.59', 'horizontal');
    T26.go('feed');
    await tick();
    function topReelIds59() { return qa('#storiesRow .homeReel1549').map(function (el) { var m = (el.getAttribute('onclick') || '').match(/__wrOpenReel\('([^']+)'\)/); return m ? m[1] : ''; }); }
    var topIds59 = topReelIds59();
    check('1.5.59 reels: arriba solo salen los verticales (el horizontal no)', !!reelV59 && !!reelH59 && topIds59.indexOf(reelV59.id) >= 0 && topIds59.indexOf(reelH59.id) < 0, 'arriba=' + topIds59.length);
    st26.posts = st26.posts.filter(function (p) { return p !== reelV59 && p !== reelH59; });
    T26.go('feed');
    await tick();
    // --- 1.5.59: FAQ (la novedad es la 1.5.59, la 1.5.57 ya no está) ---
    check('1.5.63 FAQ: la novedad es la 1.5.63 (≤400 caracteres, dice portadas verticales y mismo tamaño) y la 1.5.61 ya no está', (function () { var f = T26.getFaq().filter(function (x) { return x.q === '¿Qué hay de nuevo en la 1.5.63?'; })[0]; return !!f && f.a.length <= 400 && f.a.indexOf('verticales') >= 0 && f.a.indexOf('mismo tamaño') >= 0 && T26.getFaq().filter(function (x) { return x.q === '¿Qué hay de nuevo en la 1.5.61?'; }).length === 0; })());
    check('1.5.63 FAQ: la entrada de la 1.5.62 quedó corta (≤400 caracteres, sigue diciendo buscador y continúa donde se quedó) y la de la 1.5.61 ya no está', (function () { var f = T26.getFaq().filter(function (x) { return x.q === '¿Qué hay de nuevo en la 1.5.62?'; })[0]; var f61 = T26.getFaq().filter(function (x) { return x.q === '¿Qué hay de nuevo en la 1.5.61?'; })[0]; return !!f && f.a.length <= 400 && f.a.indexOf('buscador') >= 0 && f.a.indexOf('continúa donde se quedó') >= 0 && !f61; })());
    // --- 1.5.58 publicar atómico: nada se muestra como publicado hasta que el servidor confirma; si falla, error claro + borrador + Reintentar ---
    T26.go('feed');
    await tick();
    var tokenOrig58 = st26.settings.serverToken;
    st26.settings.serverToken = 'tok-dom-1558';
    var origFetch58 = C26.serverFetch;
    // (1) Publicar completa → la publicación aparece en la lectura del muro.
    var rPub58 = C26.createPost(st26, st26.me, { text: 'Publicación atómica 1.5.58', privacy: 'Público', pendingSync: true });
    var postPub58 = rPub58.post;
    await T26.confirmPostPublish1529(postPub58, 'Publicación creada.');
    check('1.5.58 publicar: al confirmarse, la publicación ya no está pendiente y se ve en el muro', !!postPub58 && !postPub58.pendingSync && !postPub58.syncFailed && $('feed').textContent.indexOf('Publicación atómica 1.5.58') >= 0);
    // (2) Un 500 no la pierde ni la da por publicada: queda pendiente y encolada.
    C26.serverFetch = async function () { return { ok: false, status: 500, error: 'Error interno del servidor' }; };
    var r500 = C26.createPost(st26, st26.me, { text: 'Publicación que falla 500 1.5.58', privacy: 'Público', pendingSync: true });
    await T26.confirmPostPublish1529(r500.post, null);
    check('1.5.58 publicar: ante un 500 la publicación queda pendiente («Subiendo…») y encolada, no se pierde', !!r500.post && r500.post.pendingSync === true && !r500.post.syncFailed && st26.pendingQueue.some(function (q) { return q.path === '/api/posts'; }) && $('feed').textContent.indexOf('Subiendo') >= 0);
    // (3) Un 400 (no reintentable solo) muestra el error claro, guarda el borrador y ofrece Reintentar; el reintento completa la publicación.
    C26.serverFetch = async function () { return { ok: false, status: 400, error: 'La publicación no es válida.' }; };
    var r400 = C26.createPost(st26, st26.me, { text: 'Publicación que falla 400 1.5.58', privacy: 'Público', pendingSync: true });
    await T26.confirmPostPublish1529(r400.post, null);
    check('1.5.58 publicar: ante un 400 se ve el error claro y el contenido queda guardado en borradores con Reintentar', !!r400.post && r400.post.syncFailed === true && (r400.post.syncError || '').indexOf('no es válida') >= 0 && st26.drafts.some(function (d) { return (d.text || '').indexOf('Publicación que falla 400') >= 0; }) && $('feed').textContent.indexOf('No se pudo publicar') >= 0 && $('feed').textContent.indexOf('Reintentar') >= 0);
    C26.serverFetch = origFetch58;
    window.__wrRetryPostSync(r400.post.id);
    await sleep(100);
    check('1.5.58 publicar: Reintentar completa la publicación (ya no falla, ya no está pendiente, el borrador se borra)', !r400.post.syncFailed && !r400.post.pendingSync && !st26.drafts.some(function (d) { return (d.text || '').indexOf('Publicación que falla 400') >= 0; }));
    // (4) Refrescar el muro tras publicar incluye la publicación nueva, sin duplicarla.
    C26.serverFetch = async function (st, path, method) {
      if (String(path).indexOf('/api/feed') === 0) return { ok: true, data: { ok: true, posts: st26.posts.map(function (p) { return JSON.parse(JSON.stringify(p)); }), profiles: [] } };
      return origFetch58(st, path, method);
    };
    await T26.pullFromServer();
    check('1.5.58 publicar: refrescar el muro tras publicar incluye la publicación nueva (sin duplicarla)', st26.posts.filter(function (p) { return p.id === postPub58.id; }).length === 1 && !postPub58.pendingSync && $('feed').textContent.indexOf('Publicación atómica 1.5.58') >= 0);
    C26.serverFetch = origFetch58;
    // (5) La poda nunca borra una publicación pendiente de confirmar, aunque sea vieja y no venga en el inicio.
    var oldPend58 = C26.createPost(st26, st26.me, { text: 'Publicación pendiente vieja 1.5.58', privacy: 'Público', pendingSync: true });
    oldPend58.post.createdAt = Date.now() - 200000;
    var drop58 = C26.pruneDeletedPostIds(st26.posts, [], Date.now(), C26.pendingPostIds(st26), st26.deletedPostIds);
    check('1.5.58 publicar: la poda nunca borra una publicación pendiente de confirmar, aunque sea vieja y no venga en el inicio', drop58.indexOf(oldPend58.post.id) < 0 && st26.posts.some(function (p) { return p.id === oldPend58.post.id; }));
    var oldGone58 = C26.createPost(st26, st26.me, { text: 'Publicación vieja sin confirmar 1.5.58', privacy: 'Público' });
    oldGone58.post.createdAt = Date.now() - 200000;
    var drop58b = C26.pruneDeletedPostIds(st26.posts, [], Date.now(), C26.pendingPostIds(st26), st26.deletedPostIds);
    check('1.5.58 publicar: la poda SÍ quita una publicación vieja que no está pendiente ni viene en el inicio', drop58b.indexOf(oldGone58.post.id) >= 0);
    // (6) Una publicación nueva llega en vivo por WebSocket y se ve de inmediato; el eco de la mía pendiente la confirma.
    T26.handleServerMessage({ kind: 'post', post: { id: 'ws-post-1558', author: '1000000002', text: 'Publicación en vivo 1.5.58', createdAt: Date.now(), privacy: 'Público', mediaList: [], likes: [], comments: [], shares: 0, savedBy: [], views: 0 } });
    check('1.5.58 publicar: una publicación nueva llega en vivo por WebSocket y se ve de inmediato en el muro', st26.posts.some(function (p) { return p.id === 'ws-post-1558'; }) && $('feed').textContent.indexOf('Publicación en vivo 1.5.58') >= 0);
    T26.handleServerMessage({ kind: 'post', post: JSON.parse(JSON.stringify(r500.post)) });
    check('1.5.58 publicar: el eco por WebSocket de mi publicación pendiente la confirma', !r500.post.pendingSync && !r500.post.syncFailed);
    // Limpieza: las publicaciones de prueba no quedan en el estado.
    C26.serverFetch = origFetch58;
    st26.settings.serverToken = tokenOrig58;
    var pubIds58 = [postPub58.id, r500.post.id, r400.post.id, oldPend58.post.id, oldGone58.post.id, 'ws-post-1558'];
    st26.posts = st26.posts.filter(function (p) { return pubIds58.indexOf(p.id) < 0; });
    st26.pendingQueue = st26.pendingQueue.filter(function (q) { return !(q.path === '/api/posts' && q.body && q.body.post && pubIds58.indexOf(q.body.post.id) >= 0); });
    T26.renderFeed();
    // La clave vieja 1557 ya no se pinta: el teléfono ignora el catálogo viejo.
    window.localStorage.setItem('wordred_kdramas1557', JSON.stringify({ at: Date.now(), kdramas: [{ id: 'drama-viejo56', name: 'Drama viejo 1.5.56', synopsis: 'Sinopsis vieja.', poster: 'dramas/viejo-portada.jpg', chapters: [{ n: 1, title: 'Capítulo viejo', text: 'Texto de más de cien caracteres para que la validación del catálogo de dramas originales lo acepte sin problema alguno.', image: 'dramas/viejo-cap1.jpg' }] }] }));
    T26.resetKdramas1554();
    T26.fetchKdramas1554();
    T26.renderKdramaHome1549();
    check('1.5.58 caché: la clave vieja 1557 ya no se pinta (el teléfono ignora el catálogo viejo)', $('kdramaReels1549').textContent.indexOf('Drama viejo 1.5.56') < 0);
    window.localStorage.removeItem('wordred_kdramas1557');
    T26.resetKdramas1554();
    T26.renderKdramaHome1549();
    check('sin errores de ventana al final (1.5.28)', errors.length === 0, errors.slice(0, 3).join(' | '));

  } catch (e) {
    fail++;
    console.log('FAIL: excepción — ' + (e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e));
  }
  console.log('\n==============================');
  console.log('WordRed DOM v1.5.63 (jsdom) — ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
