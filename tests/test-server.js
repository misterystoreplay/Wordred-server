'use strict';
/* Pruebas del servidor WordRed 4.5 — los datos quedan PARA SIEMPRE en
   MongoDB (y el respaldo JSON sigue funcionando sin MONGODB_URI).
   Se arranca el servidor de verdad como proceso hijo (node server.js)
   contra un MongoDB en memoria (mongodb-memory-server) y se comprueba
   que una publicación, un mensaje, un código de verificación y las
   estadísticas de juegos sobreviven a reiniciar el proceso.
   Uso: npm test   (o: node tests/test-server.js)
   Salida: "N PASS, 0 FAIL" y código 0 si todo va bien. */
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { MongoClient } = require('mongodb');
const WebSocket = require('ws');

const SERVER_DIR = path.join(__dirname, '..');
let pass = 0, fail = 0;
const failures = [];
function check(name, ok, extra) {
  if (ok) { pass++; console.log('PASS: ' + name); }
  else { fail++; failures.push(name); console.log('FAIL: ' + name + (extra !== undefined ? ' — ' + JSON.stringify(extra).slice(0, 300) : '')); }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function api(port, method, p, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: '127.0.0.1', port, path: p, method,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...(token ? { Authorization: 'Bearer ' + token } : {}) }
    }, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(raw); } catch (e) {} resolve({ status: res.statusCode, json, raw }); });
    });
    req.on('error', (e) => resolve({ status: 0, json: null, raw: String(e && e.message) }));
    req.end(data);
  });
}
/* v3.6: petición con encabezados propios (para simular el proxy de
   Render: Host de wordred-server.onrender.com y X-Forwarded-Proto). */
function apiHeaders(port, method, p, headers) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port, path: p, method, headers: headers || {} }, (res) => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(raw); } catch (e) {} resolve({ status: res.statusCode, json, raw }); });
    });
    req.on('error', (e) => resolve({ status: 0, json: null, raw: String(e && e.message) }));
    req.end();
  });
}
/* v3.5: descargar el APK (binario) contando los bytes recibidos. */
function downloadApk(port, p) {
  return new Promise((resolve) => {
    http.get({ hostname: '127.0.0.1', port, path: p }, (res) => {
      let bytes = 0;
      res.on('data', c => { bytes += c.length; });
      res.on('end', () => resolve({ status: res.statusCode, contentType: res.headers['content-type'] || '', bytes }));
      res.on('error', () => resolve({ status: 0, contentType: '', bytes: 0 }));
    }).on('error', () => resolve({ status: 0, contentType: '', bytes: 0 }));
  });
}
async function waitHealth(port, timeoutMs) {
  const end = Date.now() + (timeoutMs || 60000);
  while (Date.now() < end) {
    const r = await api(port, 'GET', '/api/health');
    if (r.status === 200 && r.json && r.json.ok) return r.json;
    await sleep(250);
  }
  return null;
}
function startServer(port, envExtra) {
  const env = { ...process.env, PORT: String(port), ...envExtra };
  delete env.GOOGLE_CLIENT_ID;
  delete env.TWILIO_SID; delete env.TWILIO_TOKEN; delete env.TWILIO_FROM;
  delete env.SMTP_HOST; delete env.SMTP_USER; delete env.SMTP_PASS;
  const proc = spawn('node', ['server.js'], { cwd: SERVER_DIR, env });
  let out = '';
  proc.stdout.on('data', d => { out += d; });
  proc.stderr.on('data', d => { out += d; });
  proc._log = () => out;
  return proc;
}
async function stopServer(proc) {
  if (!proc || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
  const exited = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 10000);
    proc.once('exit', () => { clearTimeout(t); resolve(true); });
  });
  if (!exited) { try { proc.kill('SIGKILL'); } catch (e) {} await sleep(500); }
}
async function register(port, phone) {
  const rc = await api(port, 'POST', '/api/auth/request-code', { phone });
  if (!rc.json || !rc.json.ok || !rc.json.devCode) return { ok: false, step: 'request-code', res: rc };
  const v = await api(port, 'POST', '/api/auth/verify', { phone, code: rc.json.devCode });
  if (!v.json || !v.json.ok || !v.json.token) return { ok: false, step: 'verify', res: v };
  return { ok: true, token: v.json.token };
}
async function waitMongoValue(uri, coll, pred, timeoutMs) {
  const end = Date.now() + (timeoutMs || 10000);
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('wordred');
    while (Date.now() < end) {
      const doc = await db.collection(coll).findOne({ _id: 'data' });
      if (doc && pred(doc.value)) return doc.value;
      await sleep(200);
    }
    return null;
  } finally { try { await client.close(); } catch (e) {} }
}

(async () => {
  const mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordred-test31-'));
  const PORT = 34531;
  const PHONE_A = '521111111111';
  const PHONE_B = '522222222222';
  const PHONE_C = '523333333333';

  /* ---- modo MongoDB ---- */
  let proc = startServer(PORT, { MONGODB_URI: uri, DATA_DIR: dataDir });
  let health = await waitHealth(PORT);
  check('4.4 MongoDB: /api/health dice version 4.5', !!(health && health.version === '4.5'), health);
  check('3.6 MongoDB: /api/health dice storage mongodb y mongo true', !!(health && health.storage === 'mongodb' && health.mongo === true), health);

  /* ---- actualización de la app (v3.5): GET /api/app/latest y
     GET /app/WordRed.apk sirven la versión real y el APK real. La versión
     esperada se lee de app-version.json (no se fija en el test, para que
     no se quede vieja al publicar una versión nueva). */
  const appVersion = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'app-version.json'), 'utf8'));
  const latest = await api(PORT, 'GET', '/api/app/latest');
  check('3.6 MongoDB: GET /api/app/latest dice la última versión con su URL de descarga', !!(latest.json && latest.json.ok && latest.json.versionName === appVersion.versionName && latest.json.versionCode === appVersion.versionCode && /\/app\/WordRed\.apk$/.test(latest.json.url || '')), latest.json);
  const apkDl = await downloadApk(PORT, '/app/WordRed.apk');
  const apkSize = fs.existsSync(path.join(SERVER_DIR, 'WordRed.apk')) ? fs.statSync(path.join(SERVER_DIR, 'WordRed.apk')).size : 0;
  check('3.6 MongoDB: GET /app/WordRed.apk descarga el APK real (más de 1 MB, tipo APK)', apkDl.status === 200 && /application\/vnd\.android\.package-archive/.test(apkDl.contentType || '') && apkDl.bytes === apkSize && apkSize > 1000000, { status: apkDl.status, contentType: apkDl.contentType, bytes: apkDl.bytes, size: apkSize });

  /* ---- v3.6: la URL de descarga ya es https. La 3.5 la construía con
     req.protocol (http detrás del proxy de Render) y Render redirige a
     https con 301, que el descargador de la app no sigue: al presionar
     Instalar la descarga fallaba con "No se pudo descargar la
     actualización.". Se simula el proxy con los encabezados Host y
     X-Forwarded-Proto. */
  const latestProxy = await apiHeaders(PORT, 'GET', '/api/app/latest', { Host: 'wordred-server.onrender.com', 'X-Forwarded-Proto': 'https' });
  check('3.6 MongoDB: detrás del proxy (X-Forwarded-Proto https) /api/app/latest devuelve la URL con https', !!(latestProxy.json && latestProxy.json.ok && latestProxy.json.url === 'https://wordred-server.onrender.com/app/WordRed.apk'), latestProxy.json);
  const latestNoProto = await apiHeaders(PORT, 'GET', '/api/app/latest', { Host: 'wordred-server.onrender.com' });
  check('3.6 MongoDB: sin X-Forwarded-Proto, para el host de Render /api/app/latest también devuelve https', !!(latestNoProto.json && latestNoProto.json.ok && latestNoProto.json.url === 'https://wordred-server.onrender.com/app/WordRed.apk'), latestNoProto.json);

  /* ---- cartelera de estrenos (v3.9): GET /api/billboard es público
     (sin autenticación) y devuelve la lista de movies.json tal cual,
     para que la app se actualice sola sin una versión nueva. La lista
     esperada se lee de movies.json (no se fija en el test, para que no
     se quede vieja al agregar películas). */
  const moviesFile = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'movies.json'), 'utf8'));
  check('3.9 cartelera: movies.json trae 6 películas con título, fecha, portada y tráiler', !!(moviesFile && Array.isArray(moviesFile.movies) && moviesFile.movies.length === 6 && moviesFile.movies.every(function (m) { return m.title && m.date && m.poster && m.trailer; })), moviesFile);
  const billboard = await api(PORT, 'GET', '/api/billboard');
  check('3.9 cartelera: GET /api/billboard devuelve la lista de movies.json (mismo orden y mismos datos)', !!(billboard.json && billboard.json.ok && Array.isArray(billboard.json.movies) && billboard.json.movies.length === moviesFile.movies.length && billboard.json.movies.every(function (m, i) { return m.title === moviesFile.movies[i].title && m.date === moviesFile.movies[i].date && m.poster === moviesFile.movies[i].poster && m.trailer === moviesFile.movies[i].trailer && m.now === !!moviesFile.movies[i].now; })), billboard.json);
  check('3.9 cartelera: cada película trae portada https y tráiler de YouTube', !!(billboard.json && billboard.json.movies && billboard.json.movies.every(function (m) { return /^https:\/\//.test(m.poster) && /^https:\/\/www\.youtube\.com\/watch\?v=/.test(m.trailer); })), billboard.json);
  const billboardNoAuth = await api(PORT, 'GET', '/api/billboard');
  check('3.9 cartelera: el endpoint es público (sin token responde 200, no 401)', billboardNoAuth.status === 200 && !!(billboardNoAuth.json && billboardNoAuth.json.ok), { status: billboardNoAuth.status });

  /* ---- cartelera de juegos (v4.0): GET /api/games-billboard es público
     (sin autenticación) y devuelve la lista de games.json tal cual,
     para que la app se actualice sola sin una versión nueva. La lista
     esperada se lee de games.json (no se fija en el test, para que no
     se quede vieja al agregar juegos). */
  const gamesFile = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'games.json'), 'utf8'));
  check('4.0 cartelera juegos: games.json trae 6 juegos con título, fecha, portada y tráiler', !!(gamesFile && Array.isArray(gamesFile.games) && gamesFile.games.length === 6 && gamesFile.games.every(function (g) { return g.title && g.date && g.poster && g.trailer; })), gamesFile);
  const gamesBillboard = await api(PORT, 'GET', '/api/games-billboard');
  check('4.0 cartelera juegos: GET /api/games-billboard devuelve la lista de games.json (mismo orden y mismos datos)', !!(gamesBillboard.json && gamesBillboard.json.ok && Array.isArray(gamesBillboard.json.games) && gamesBillboard.json.games.length === gamesFile.games.length && gamesBillboard.json.games.every(function (g, i) { return g.title === gamesFile.games[i].title && g.date === gamesFile.games[i].date && g.poster === gamesFile.games[i].poster && g.trailer === gamesFile.games[i].trailer && g.now === !!gamesFile.games[i].now; })), gamesBillboard.json);
  check('4.0 cartelera juegos: cada juego trae portada https y tráiler de YouTube', !!(gamesBillboard.json && gamesBillboard.json.games && gamesBillboard.json.games.every(function (g) { return /^https:\/\//.test(g.poster) && /^https:\/\/www\.youtube\.com\/watch\?v=/.test(g.trailer); })), gamesBillboard.json);
  const gamesBillboardNoAuth = await api(PORT, 'GET', '/api/games-billboard');
  check('4.0 cartelera juegos: el endpoint es público (sin token responde 200, no 401)', gamesBillboardNoAuth.status === 200 && !!(gamesBillboardNoAuth.json && gamesBillboardNoAuth.json.ok), { status: gamesBillboardNoAuth.status });

  /* ---- dramas cortos (v4.2): GET /api/kdramas es público
     (sin autenticación) y devuelve la lista de kdramas.json tal cual,
     para que los dramas roten cada 3 meses sin una versión nueva de la
     app. La lista esperada se lee de kdramas.json (no se fija en el
     test, para que no se quede vieja al rotar los dramas). */
  const kdramasFile = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'kdramas.json'), 'utf8'));
  check('4.4 dramas: kdramas.json trae 5 dramas originales con 4 capítulos cada uno', !!(kdramasFile && Array.isArray(kdramasFile.kdramas) && kdramasFile.kdramas.length === 5 && kdramasFile.kdramas.every(function (s) { return s.id && s.name && s.synopsis && s.poster && Array.isArray(s.chapters) && s.chapters.length === 4; })), kdramasFile && kdramasFile.kdramas && kdramasFile.kdramas.map(function (s) { return s.name + ':' + (s.chapters || []).length; }));
  check('4.4 dramas: cada capítulo trae número, título, texto largo e imagen vertical del APK', !!(kdramasFile && kdramasFile.kdramas && kdramasFile.kdramas.every(function (s) { return s.chapters.every(function (c, i) { return c.n === i + 1 && c.title && typeof c.text === 'string' && c.text.split(/\s+/).filter(Boolean).length >= 100 && /^dramas\/.+\.jpg$/.test(c.image || ''); }); })), null);
  /* 1.5.55: las rutas de las imágenes van sin el 'assets/' de más (la
     página carga desde file:///android_asset/index.html, así que
     'assets/...' resolvía a 'assets/assets/...' y el archivo no
     existía: las portadas de dramas y del juego no se veían). */
  check('1.5.55 rutas: las portadas y las imágenes de los dramas van sin el prefijo assets/ (dramas/...)', !!(kdramasFile && kdramasFile.kdramas && kdramasFile.kdramas.every(function (s) { return /^dramas\/.+\.jpg$/.test(s.poster || '') && s.chapters.every(function (c) { return /^dramas\/.+\.jpg$/.test(c.image || ''); }); }) && JSON.stringify(kdramasFile).indexOf('assets/') < 0), null);
  /* 1.5.56: 6 capítulos ya tienen video (los 4 de El contrato de la
     heredera + los 2 primeros de La venganza de Camila), subidos a
     Cloudinary; los otros 14 todavía no (el cap. 2 de Camila se
     recuperó de su URL remota tras fallar la generación). El video es
     opcional: un capítulo sin video muestra su imagen con
     «Próximamente en video». */
  check('1.5.56 videos: kdramas.json trae 6 capítulos con video de Cloudinary (4 del primer drama + 2 del segundo) y 14 sin video', (function () { var v = []; kdramasFile.kdramas.forEach(function (s) { s.chapters.forEach(function (c) { if (c.video) v.push([s.id, c.n, c.video]); }); }); return v.length === 6 && v.every(function (x) { return /^https:\/\/res\.cloudinary\.com\/bekxop7h\/video\/upload\/.+\.mp4$/.test(x[2]); }) && v.filter(function (x) { return x[0] === 'el-contrato-de-la-heredera'; }).length === 4 && v.filter(function (x) { return x[0] === 'la-venganza-de-camila'; }).length === 2; })());
  const kdramasRes = await api(PORT, 'GET', '/api/kdramas');
  check('4.4 dramas: GET /api/kdramas devuelve la lista de kdramas.json (mismo orden y mismos datos)', !!(kdramasRes.json && kdramasRes.json.ok && Array.isArray(kdramasRes.json.kdramas) && kdramasRes.json.kdramas.length === kdramasFile.kdramas.length && kdramasRes.json.kdramas.every(function (s, i) { return s.id === kdramasFile.kdramas[i].id && s.name === kdramasFile.kdramas[i].name && s.poster === kdramasFile.kdramas[i].poster && s.chapters.length === kdramasFile.kdramas[i].chapters.length && s.chapters.every(function (c, j) { return c.n === kdramasFile.kdramas[i].chapters[j].n && c.title === kdramasFile.kdramas[i].chapters[j].title && c.image === kdramasFile.kdramas[i].chapters[j].image && (c.video || '') === (kdramasFile.kdramas[i].chapters[j].video || ''); }); })), kdramasRes.json);
  const kdramasNoAuth = await api(PORT, 'GET', '/api/kdramas');
  check('4.4 dramas: el endpoint es público (sin token responde 200, no 401)', kdramasNoAuth.status === 200 && !!(kdramasNoAuth.json && kdramasNoAuth.json.ok), { status: kdramasNoAuth.status });

  /* ---- juego destacado (v4.4): GET /api/featured-game es público y
     devuelve la ficha de featured-game.json (datos del juego + sus 8
     capturas reales) con las estadísticas reales del juego; GET
     /app/Fantore-Resurreccion.apk sirve el APK del juego. Las
     calificaciones usan el sistema de juegos que ya existe (POST
     /api/games/:id/rate, una por cuenta). */
  const featuredFile = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, 'featured-game.json'), 'utf8'));
  check('4.4 fantore: featured-game.json trae el juego (paquete, versión 2.0, logo e icono reales) y las 8 capturas en orden', !!(featuredFile && featuredFile.game && featuredFile.game.id === 'fantore-resurreccion' && featuredFile.game.package === 'com.misterystore.fantoreresurreccion' && featuredFile.game.version === '2.0' && featuredFile.game.logo === 'fantore/logo.png' && Array.isArray(featuredFile.screenshots) && featuredFile.screenshots.length === 8 && featuredFile.screenshots[0] === 'fantore/cap1.jpg' && featuredFile.screenshots[7] === 'fantore/cap8.jpg'), featuredFile);
  check('1.5.55 rutas: el logo, el icono y las 8 capturas del juego van sin el prefijo assets/ (fantore/...)', !!(featuredFile && featuredFile.game && /^fantore\/.+\.png$/.test(featuredFile.game.logo || '') && /^fantore\/.+\.png$/.test(featuredFile.game.icon || '') && Array.isArray(featuredFile.screenshots) && featuredFile.screenshots.every(function (s) { return /^fantore\/.+\.jpg$/.test(s || ''); }) && JSON.stringify(featuredFile).indexOf('assets/') < 0), featuredFile);
  const featuredRes = await api(PORT, 'GET', '/api/featured-game');
  check('4.4 fantore: GET /api/featured-game devuelve la ficha y las 8 capturas', !!(featuredRes.json && featuredRes.json.ok && featuredRes.json.game && featuredRes.json.game.id === 'fantore-resurreccion' && Array.isArray(featuredRes.json.screenshots) && featuredRes.json.screenshots.length === 8), featuredRes.json);
  check('4.4 fantore: sin calificaciones, la media es 0 y el conteo es 0 (nunca se inventan)', !!(featuredRes.json && featuredRes.json.stats && featuredRes.json.stats.ratingAvg === 0 && featuredRes.json.stats.ratingCount === 0), featuredRes.json && featuredRes.json.stats);
  check('4.4 fantore: el endpoint es público (sin token responde 200, no 401)', featuredRes.status === 200, { status: featuredRes.status });
  const fantoreApk = await downloadApk(PORT, '/app/Fantore-Resurreccion.apk');
  const fantoreApkSize = fs.existsSync(path.join(SERVER_DIR, 'Fantore-Resurreccion.apk')) ? fs.statSync(path.join(SERVER_DIR, 'Fantore-Resurreccion.apk')).size : 0;
  check('4.4 fantore: GET /app/Fantore-Resurreccion.apk sirve el APK real del juego (tipo APK, bytes exactos)', fantoreApk.status === 200 && /application\/vnd\.android\.package-archive/.test(fantoreApk.contentType || '') && fantoreApk.bytes === fantoreApkSize && fantoreApkSize > 100000, { status: fantoreApk.status, contentType: fantoreApk.contentType, bytes: fantoreApk.bytes, size: fantoreApkSize });
  const regF1 = await register(PORT, '525555555555');
  const regF2 = await register(PORT, '526666666666');
  const rateF1 = await api(PORT, 'POST', '/api/games/fantore-resurreccion/rate', { stars: 5 }, regF1.token);
  check('4.4 fantore: un usuario califica con 5 estrellas (media 5, conteo 1)', !!(rateF1.json && rateF1.json.ok && rateF1.json.stats && rateF1.json.stats.ratingAvg === 5 && rateF1.json.stats.ratingCount === 1), rateF1.json);
  const rateF2 = await api(PORT, 'POST', '/api/games/fantore-resurreccion/rate', { stars: 3 }, regF2.token);
  check('4.4 fantore: otro usuario califica con 3 (media 4, conteo 2)', !!(rateF2.json && rateF2.json.ok && rateF2.json.stats && rateF2.json.stats.ratingAvg === 4 && rateF2.json.stats.ratingCount === 2), rateF2.json);
  const rateAgain = await api(PORT, 'POST', '/api/games/fantore-resurreccion/rate', { stars: 4 }, regF1.token);
  check('4.4 fantore: volver a calificar actualiza la propia (no duplica: media 3.5, conteo 2)', !!(rateAgain.json && rateAgain.json.ok && rateAgain.json.stats && rateAgain.json.stats.ratingAvg === 3.5 && rateAgain.json.stats.ratingCount === 2), rateAgain.json);
  const featuredAfter = await api(PORT, 'GET', '/api/featured-game');
  check('4.4 fantore: GET /api/featured-game ya refleja las calificaciones reales', !!(featuredAfter.json && featuredAfter.json.stats && featuredAfter.json.stats.ratingAvg === 3.5 && featuredAfter.json.stats.ratingCount === 2), featuredAfter.json && featuredAfter.json.stats);
  const rateNoAuth = await api(PORT, 'POST', '/api/games/fantore-resurreccion/rate', { stars: 5 });
  check('4.4 fantore: calificar sin sesión da 401', rateNoAuth.status === 401, rateNoAuth);
  const rateBad = await api(PORT, 'POST', '/api/games/fantore-resurreccion/rate', { stars: 9 }, regF1.token);
  check('4.4 fantore: calificar con 9 estrellas da 400', rateBad.status === 400, rateBad);

  const regA = await register(PORT, PHONE_A);
  check('3.3 MongoDB: el usuario A se registra (código + verificación)', regA.ok, regA);
  const regB = await register(PORT, PHONE_B);
  check('3.3 MongoDB: el usuario B se registra (código + verificación)', regB.ok, regB);
  const profA = await api(PORT, 'POST', '/api/profile', { name: 'Ana (prueba)' }, regA.token);
  check('3.3 MongoDB: el perfil de A se crea', !!(profA.json && profA.json.ok), profA);
  const profB = await api(PORT, 'POST', '/api/profile', { name: 'Beto (prueba)' }, regB.token);
  check('3.3 MongoDB: el perfil de B se crea', !!(profB.json && profB.json.ok), profB);

  /* ---- visitas al perfil (v3.7): POST /api/profile-views registra
     quién vio el perfil de otra persona y GET /api/profile-views/me
     devuelve las visitas del propio perfil. Un registro por visitante:
     si la misma persona vuelve, solo se actualiza la fecha. Verse el
     propio perfil no se registra y sin sesión da 401. */
  const viewNoAuth = await api(PORT, 'POST', '/api/profile-views', { viewedPhone: PHONE_A }, null);
  check('3.7 MongoDB: registrar una visita sin sesión da 401', viewNoAuth.status === 401, viewNoAuth);
  const viewGhost = await api(PORT, 'POST', '/api/profile-views', { viewedPhone: '529999999999' }, regB.token);
  check('3.7 MongoDB: registrar una visita a un perfil que no existe da 404', viewGhost.status === 404, viewGhost);
  const myViewsEmpty = await api(PORT, 'GET', '/api/profile-views/me', null, regA.token);
  check('3.7 MongoDB: antes de ninguna visita, mis visitas son 0 y sin último visitante', !!(myViewsEmpty.json && myViewsEmpty.json.ok && myViewsEmpty.json.count === 0 && myViewsEmpty.json.lastViewer === null && Array.isArray(myViewsEmpty.json.viewers) && myViewsEmpty.json.viewers.length === 0), myViewsEmpty.json);
  const viewB = await api(PORT, 'POST', '/api/profile-views', { viewedPhone: PHONE_A }, regB.token);
  check('3.7 MongoDB: B ve el perfil de A (visita registrada)', !!(viewB.json && viewB.json.ok && viewB.json.recorded === true && viewB.json.count === 1), viewB.json);
  const myViewsA = await api(PORT, 'GET', '/api/profile-views/me', null, regA.token);
  check('3.7 MongoDB: A lee sus visitas (cantidad 1, último visitante B con su nombre)', !!(myViewsA.json && myViewsA.json.ok && myViewsA.json.count === 1 && myViewsA.json.lastViewer && myViewsA.json.lastViewer.phone === PHONE_B && myViewsA.json.lastViewer.name === 'Beto (prueba)' && myViewsA.json.viewers.length === 1 && myViewsA.json.viewers[0].phone === PHONE_B), myViewsA.json);
  const myViewsB = await api(PORT, 'GET', '/api/profile-views/me', null, regB.token);
  check('3.7 MongoDB: B solo ve SUS visitas (0: nadie vio su perfil todavía)', !!(myViewsB.json && myViewsB.json.ok && myViewsB.json.count === 0 && myViewsB.json.lastViewer === null), myViewsB.json);
  const viewBAgain = await api(PORT, 'POST', '/api/profile-views', { viewedPhone: PHONE_A }, regB.token);
  check('3.7 MongoDB: B vuelve a ver el perfil de A y la cantidad sigue en 1 (no se duplica)', !!(viewBAgain.json && viewBAgain.json.ok && viewBAgain.json.recorded === true && viewBAgain.json.count === 1), viewBAgain.json);
  const viewSelf = await api(PORT, 'POST', '/api/profile-views', { viewedPhone: PHONE_A }, regA.token);
  check('3.7 MongoDB: verse el propio perfil NO se registra (recorded false, cantidad sigue en 1)', !!(viewSelf.json && viewSelf.json.ok && viewSelf.json.recorded === false && viewSelf.json.count === 1), viewSelf.json);
  const myViewsNoAuth = await api(PORT, 'GET', '/api/profile-views/me', null, null);
  check('3.7 MongoDB: leer mis visitas sin sesión da 401', myViewsNoAuth.status === 401, myViewsNoAuth);
  const viewsInMongo = await waitMongoValue(uri, 'profileViews', v => v && v[PHONE_A] && v[PHONE_A].length === 1 && v[PHONE_A][0].viewer === PHONE_B);
  check('3.7 MongoDB: la visita está guardada en la colección profileViews de MongoDB', !!viewsInMongo);

  const postRes = await api(PORT, 'POST', '/api/posts', { text: 'Publicación que tiene que sobrevivir al reinicio' }, regA.token);
  const postId = postRes.json && postRes.json.post && postRes.json.post.id;
  check('3.3 MongoDB: A crea una publicación', !!(postRes.json && postRes.json.ok && postId), postRes);
  const feedB = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  check('3.3 MongoDB: la publicación de A la ve otro usuario (B) en su inicio', !!(feedB.json && feedB.json.ok && feedB.json.posts.some(p => p.id === postId)), feedB.json && feedB.json.posts.length);

  /* ---- promociones (v4.1): el servidor conserva `promoted` en las
     publicaciones para que la insignia «Promocionado» y el primer lugar
     valgan en TODOS los teléfonos (en la 4.0 el campo se perdía al crear
     la publicación y solo el teléfono que promocionaba lo veía). */
  const promoCreate = await api(PORT, 'POST', '/api/posts', { text: 'Publicación promocionada (prueba 4.1)', promoted: true }, regA.token);
  const promoPostId = promoCreate.json && promoCreate.json.post && promoCreate.json.post.id;
  check('4.1 MongoDB: crear una publicación con promoted:true la devuelve con promoted true', !!(promoCreate.json && promoCreate.json.ok && promoPostId && promoCreate.json.post.promoted === true), promoCreate.json && promoCreate.json.post);
  const feedPromoB = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  const promoInFeedB = feedPromoB.json && feedPromoB.json.posts && feedPromoB.json.posts.find(p => p.id === promoPostId);
  check('4.1 MongoDB: otro usuario (B) ve la publicación promocionada con promoted true en su inicio', !!(feedPromoB.json && feedPromoB.json.ok && promoInFeedB && promoInFeedB.promoted === true), promoInFeedB);
  const normalCreate = await api(PORT, 'POST', '/api/posts', { text: 'Publicación normal (prueba 4.1)' }, regA.token);
  const normalPostId = normalCreate.json && normalCreate.json.post && normalCreate.json.post.id;
  check('4.1 MongoDB: una publicación normal sin promoted se crea con promoted false (sin cambio de comportamiento)', !!(normalCreate.json && normalCreate.json.ok && normalPostId && normalCreate.json.post.promoted === false), normalCreate.json && normalCreate.json.post);
  const promoBadStr = await api(PORT, 'POST', '/api/posts', { text: 'Promoción inválida (prueba 4.1)', promoted: 'si' }, regA.token);
  check('4.1 MongoDB: crear con promoted no booleano ("si") se rechaza con 400', promoBadStr.status === 400 && !!(promoBadStr.json && promoBadStr.json.ok === false), promoBadStr);
  const promoBadObj = await api(PORT, 'POST', '/api/posts', { text: 'Promoción inválida (prueba 4.1)', promoted: { tier: 100 } }, regA.token);
  check('4.1 MongoDB: crear con promoted objeto se rechaza con 400', promoBadObj.status === 400 && !!(promoBadObj.json && promoBadObj.json.ok === false), promoBadObj);
  /* Promocionar una publicación ya publicada: PUT con solo promoted. */
  const promoPut = await api(PORT, 'PUT', '/api/posts/' + normalPostId, { promoted: true }, regA.token);
  check('4.1 MongoDB: PUT con solo promoted:true activa la promoción en una publicación ya publicada', !!(promoPut.json && promoPut.json.ok && promoPut.json.post && promoPut.json.post.promoted === true), promoPut.json);
  check('4.1 MongoDB: el PUT de solo-promoción NO gasta una edición (editsLeft sigue en 5)', !!(promoPut.json && promoPut.json.editsLeft === 5), promoPut.json);
  const feedPromoPutB = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  const promoPutInFeedB = feedPromoPutB.json && feedPromoPutB.json.posts && feedPromoPutB.json.posts.find(p => p.id === normalPostId);
  check('4.1 MongoDB: tras el PUT, B ve la publicación con promoted true en su inicio', !!(promoPutInFeedB && promoPutInFeedB.promoted === true), promoPutInFeedB);
  const promoPutOff = await api(PORT, 'PUT', '/api/posts/' + normalPostId, { promoted: false }, regA.token);
  check('4.1 MongoDB: PUT con promoted:false quita la promoción', !!(promoPutOff.json && promoPutOff.json.ok && promoPutOff.json.post && promoPutOff.json.post.promoted === false), promoPutOff.json);
  const promoPutBad = await api(PORT, 'PUT', '/api/posts/' + normalPostId, { promoted: 1 }, regA.token);
  check('4.1 MongoDB: PUT con promoted no booleano (1) se rechaza con 400 y el valor no cambia', promoPutBad.status === 400 && !!(promoPutBad.json && promoPutBad.json.ok === false), promoPutBad);
  const feedPromoBadB = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  const promoBadInFeedB = feedPromoBadB.json && feedPromoBadB.json.posts && feedPromoBadB.json.posts.find(p => p.id === normalPostId);
  check('4.1 MongoDB: tras el PUT inválido, la publicación sigue con promoted false', !!(promoBadInFeedB && promoBadInFeedB.promoted === false), promoBadInFeedB);
  const promoPutOther = await api(PORT, 'PUT', '/api/posts/' + normalPostId, { promoted: true }, regB.token);
  check('4.1 MongoDB: promocionar la publicación de otro da 403', promoPutOther.status === 403, promoPutOther);
  const promoInMongo = await waitMongoValue(uri, 'posts', v => Array.isArray(v) && v.some(p => p.id === promoPostId && p.promoted === true));
  check('4.1 MongoDB: la publicación promocionada está guardada con promoted true en la colección posts de MongoDB', !!promoInMongo);
  /* Una promoción pagada nunca se bloquea por haber editado 5 veces:
     se edita el texto 5 veces y el PUT de solo-promoción sigue valiendo. */
  const promoLimitPost = await api(PORT, 'POST', '/api/posts', { text: 'Publicación con 5 ediciones (prueba 4.1)' }, regA.token);
  const promoLimitId = promoLimitPost.json && promoLimitPost.json.post && promoLimitPost.json.post.id;
  let promoLimitOk = !!(promoLimitPost.json && promoLimitPost.json.ok && promoLimitId);
  for (let ei = 1; ei <= 5 && promoLimitOk; ei++) {
    const e = await api(PORT, 'PUT', '/api/posts/' + promoLimitId, { text: 'Edición ' + ei + ' (prueba 4.1)' }, regA.token);
    promoLimitOk = !!(e.json && e.json.ok && e.json.editsLeft === 5 - ei);
  }
  check('4.1 MongoDB: una publicación se puede editar 5 veces (editsLeft llega a 0)', promoLimitOk);
  const promoLimit6th = await api(PORT, 'PUT', '/api/posts/' + promoLimitId, { text: 'Sexta edición (prueba 4.1)' }, regA.token);
  check('4.1 MongoDB: la sexta edición de contenido se rechaza con 400', promoLimit6th.status === 400, promoLimit6th);
  const promoLimitPut = await api(PORT, 'PUT', '/api/posts/' + promoLimitId, { promoted: true }, regA.token);
  check('4.1 MongoDB: con 5 ediciones gastadas, el PUT de solo-promoción SÍ funciona (la promoción no se bloquea)', !!(promoLimitPut.json && promoLimitPut.json.ok && promoLimitPut.json.post && promoLimitPut.json.post.promoted === true && promoLimitPut.json.editsLeft === 0), promoLimitPut.json);

  /* ---- DELETE /api/posts/:id (v3.3): el borrado llega al servidor ----
     Antes no existía este endpoint: la app solo quitaba la publicación
     de su copia local y al reabrir la cuenta reaparecía, porque el
     inicio se carga desde el servidor. */
  const delPostRes = await api(PORT, 'POST', '/api/posts', { text: 'Publicación para borrar (prueba 3.3)' }, regA.token);
  const delPostId = delPostRes.json && delPostRes.json.post && delPostRes.json.post.id;
  check('3.3 MongoDB: A crea la publicación que se va a borrar', !!(delPostRes.json && delPostRes.json.ok && delPostId), delPostRes);
  const delNoAuth = await api(PORT, 'DELETE', '/api/posts/' + delPostId, null, null);
  check('3.3 MongoDB: borrar sin sesión da 401', delNoAuth.status === 401, delNoAuth);
  const delOther = await api(PORT, 'DELETE', '/api/posts/' + delPostId, null, regB.token);
  check('3.3 MongoDB: borrar la publicación de otro da 403', delOther.status === 403, delOther);
  const delMissing = await api(PORT, 'DELETE', '/api/posts/no-existe-123', null, regA.token);
  check('3.3 MongoDB: borrar una publicación que no existe da 404', delMissing.status === 404, delMissing);
  const feedBBefore = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  check('3.3 MongoDB: antes de borrar, B ve la publicación en su inicio', !!(feedBBefore.json && feedBBefore.json.ok && feedBBefore.json.posts.some(p => p.id === delPostId)), feedBBefore.json && feedBBefore.json.posts.length);
  /* B escucha por WebSocket: al borrar, le tiene que llegar 'postDeleted'. */
  const wsB = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?phone=' + PHONE_B);
  const wsDeleted = new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 5000);
    wsB.on('message', (raw) => {
      try {
        const m = JSON.parse(String(raw));
        if (m.kind === 'postDeleted' && m.postId === delPostId) { clearTimeout(t); resolve(true); }
      } catch (e) {}
    });
    wsB.on('error', () => {});
  });
  await new Promise((resolve) => { if (wsB.readyState === WebSocket.OPEN) resolve(); else { wsB.on('open', resolve); setTimeout(resolve, 5000); } });
  const delOk = await api(PORT, 'DELETE', '/api/posts/' + delPostId, null, regA.token);
  check('3.3 MongoDB: el autor borra su publicación (DELETE ok)', !!(delOk.json && delOk.json.ok), delOk);
  check('3.3 MongoDB: al borrar llega postDeleted por WebSocket al otro usuario', await wsDeleted);
  try { wsB.close(); } catch (e) {}
  const feedBAfter = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  check('3.3 MongoDB: tras borrar, la publicación ya NO sale en el inicio de B', !!(feedBAfter.json && feedBAfter.json.ok && !feedBAfter.json.posts.some(p => p.id === delPostId)), feedBAfter.json && feedBAfter.json.posts.length);
  const postsAfterDel = await waitMongoValue(uri, 'posts', v => Array.isArray(v) && !v.some(p => p.id === delPostId));
  check('3.3 MongoDB: tras borrar, la publicación ya NO está en la colección posts de MongoDB', !!postsAfterDel);
  const delAgain = await api(PORT, 'DELETE', '/api/posts/' + delPostId, null, regA.token);
  check('3.3 MongoDB: borrar dos veces la misma publicación da 404', delAgain.status === 404, delAgain);

  const msgRes = await api(PORT, 'POST', '/api/messages', { to: PHONE_B, text: 'Hola Beto, mensaje que tiene que sobrevivir' }, regA.token);
  const msgId = msgRes.json && msgRes.json.message && msgRes.json.message.id;
  check('3.3 MongoDB: A manda un mensaje a B', !!(msgRes.json && msgRes.json.ok && msgId), msgRes);

  const playRes = await api(PORT, 'POST', '/api/games/prueba31/play', {}, regA.token);
  check('3.3 MongoDB: A juega (estadística de juego)', !!(playRes.json && playRes.json.ok && playRes.json.stats && playRes.json.stats.plays === 1), playRes);

  /* ---- historias con { story: {...} } (v3.3): la app manda la historia
     envuelta, igual que { post: {...} } en /api/posts. Antes el servidor
     leía req.body.text directo y TODAS las historias se rechazaban con
     400 "Historia vacía." — nunca llegaban al servidor. */
  const storyRes = await api(PORT, 'POST', '/api/stories', { story: { text: 'Historia de prueba con texto', media: 'https://ejemplo.com/foto.jpg', mediaType: 'image', edits: { texts: [{ text: 'Hola', color: '#ffffff', size: 28, x: 50, y: 50 }] } } }, regA.token);
  const storyId = storyRes.json && storyRes.json.story && storyRes.json.story.id;
  check('3.3 MongoDB: A publica una historia con { story: {...} } (texto + foto + edición)', !!(storyRes.json && storyRes.json.ok && storyId && storyRes.json.story.text === 'Historia de prueba con texto'), storyRes);
  check('3.3 MongoDB: la historia guarda sus ediciones (texto sobre la foto)', !!(storyRes.json && storyRes.json.story && storyRes.json.story.edits && storyRes.json.story.edits.texts && storyRes.json.story.edits.texts.some(t => t.text === 'Hola')), storyRes.json && storyRes.json.story && storyRes.json.story.edits);
  const storiesList = await api(PORT, 'GET', '/api/stories');
  check('3.3 MongoDB: la historia con texto aparece en GET /api/stories', !!(storiesList.json && storiesList.json.ok && storiesList.json.stories.some(s => s.id === storyId && s.text === 'Historia de prueba con texto')), storiesList.json && storiesList.json.stories && storiesList.json.stories.length);
  const storyFlat = await api(PORT, 'POST', '/api/stories', { text: 'Historia en formato plano (sin envolver)', media: '' }, regA.token);
  check('3.3 MongoDB: la historia en formato plano (sin envolver) también sigue funcionando', !!(storyFlat.json && storyFlat.json.ok && storyFlat.json.story && storyFlat.json.story.text === 'Historia en formato plano (sin envolver)'), storyFlat);

  /* ---- mensajes grupales (v3.3): POST /api/group-chats y compañía.
     Antes el servidor solo tenía mensajes 1 a 1; un chat con varias
     personas no existía. */
  const PHONE_D = '524444444444';
  const regC = await register(PORT, PHONE_C);
  check('3.3 MongoDB: el usuario C se registra', regC.ok, regC);
  const profC = await api(PORT, 'POST', '/api/profile', { name: 'Celia (prueba)' }, regC.token);
  check('3.3 MongoDB: el perfil de C se crea', !!(profC.json && profC.json.ok), profC);
  const regD = await register(PORT, PHONE_D);
  check('3.3 MongoDB: el usuario D se registra', regD.ok, regD);
  const profD = await api(PORT, 'POST', '/api/profile', { name: 'Dora (prueba)' }, regD.token);
  check('3.3 MongoDB: el perfil de D se crea', !!(profD.json && profD.json.ok), profD);
  const gNoAuth = await api(PORT, 'POST', '/api/group-chats', { name: 'Sin sesión', participants: [PHONE_B, PHONE_C] }, null);
  check('3.3 MongoDB: crear un grupo sin sesión da 401', gNoAuth.status === 401, gNoAuth);
  const gOne = await api(PORT, 'POST', '/api/group-chats', { name: 'Solo uno', participants: [PHONE_B] }, regA.token);
  check('3.3 MongoDB: crear un grupo con menos de 2 personas da 400', gOne.status === 400, gOne);
  const gGhost = await api(PORT, 'POST', '/api/group-chats', { name: 'Fantasma', participants: [PHONE_B, '529999999999'] }, regA.token);
  check('3.3 MongoDB: crear un grupo con alguien que no existe da 404', gGhost.status === 404, gGhost);
  const gRes = await api(PORT, 'POST', '/api/group-chats', { id: 'gchat-prueba33', name: 'Grupo de prueba', participants: [PHONE_B, PHONE_C] }, regA.token);
  const gId = gRes.json && gRes.json.group && gRes.json.group.id;
  check('3.3 MongoDB: A crea un grupo con B y C', !!(gRes.json && gRes.json.ok && gId === 'gchat-prueba33' && gRes.json.group.participants.length === 3), gRes);
  const gAgain = await api(PORT, 'POST', '/api/group-chats', { id: 'gchat-prueba33', name: 'Grupo de prueba', participants: [PHONE_B, PHONE_C] }, regA.token);
  check('3.3 MongoDB: crear el mismo grupo dos veces devuelve el mismo (idempotente)', !!(gAgain.json && gAgain.json.ok && gAgain.json.group && gAgain.json.group.id === 'gchat-prueba33'), gAgain);
  const gListB = await api(PORT, 'GET', '/api/group-chats?phone=' + PHONE_B);
  check('3.3 MongoDB: B ve el grupo en su lista (una sola vez)', !!(gListB.json && gListB.json.ok && gListB.json.groupChats.filter(g => g.id === 'gchat-prueba33').length === 1), gListB.json && gListB.json.groupChats && gListB.json.groupChats.length);
  const gListD = await api(PORT, 'GET', '/api/group-chats?phone=' + PHONE_D);
  check('3.3 MongoDB: D, que no es integrante, NO ve el grupo', !!(gListD.json && gListD.json.ok && !gListD.json.groupChats.some(g => g.id === 'gchat-prueba33')), gListD.json && gListD.json.groupChats && gListD.json.groupChats.length);
  const gm1 = await api(PORT, 'POST', '/api/group-chats/' + gId + '/messages', { message: { text: 'Hola a todos, este es el grupo' } }, regA.token);
  const gm1Id = gm1.json && gm1.json.message && gm1.json.message.id;
  check('3.3 MongoDB: A escribe en el grupo', !!(gm1.json && gm1.json.ok && gm1Id), gm1);
  const gListB2 = await api(PORT, 'GET', '/api/group-chats?phone=' + PHONE_B);
  const gB2 = gListB2.json && gListB2.json.groupChats.find(g => g.id === gId);
  check('3.3 MongoDB: B ve el mensaje del grupo en su lista', !!(gB2 && gB2.messages && gB2.messages.some(m => m.id === gm1Id && m.text === 'Hola a todos, este es el grupo')), gB2 && gB2.messages && gB2.messages.length);
  /* B escucha por WebSocket: al escribir en el grupo, le llega 'groupMessage'. */
  const wsG = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?phone=' + PHONE_B);
  const wsGroupMsg = new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 5000);
    wsG.on('message', (raw) => {
      try {
        const m = JSON.parse(String(raw));
        if (m.kind === 'groupMessage' && m.groupId === gId && m.message && m.message.text === 'Segundo mensaje del grupo') { clearTimeout(t); resolve(true); }
      } catch (e) {}
    });
    wsG.on('error', () => {});
  });
  await new Promise((resolve) => { if (wsG.readyState === WebSocket.OPEN) resolve(); else { wsG.on('open', resolve); setTimeout(resolve, 5000); } });
  const gm2 = await api(PORT, 'POST', '/api/group-chats/' + gId + '/messages', { message: { text: 'Segundo mensaje del grupo' } }, regA.token);
  check('3.3 MongoDB: A escribe el segundo mensaje del grupo', !!(gm2.json && gm2.json.ok), gm2);
  check('3.3 MongoDB: al escribir en el grupo llega groupMessage por WebSocket a B', await wsGroupMsg);
  try { wsG.close(); } catch (e) {}
  const gInMongo = await waitMongoValue(uri, 'groupChats', v => Array.isArray(v) && v.some(g => g.id === gId && g.messages && g.messages.length >= 2));
  check('3.3 MongoDB: el grupo con sus mensajes está guardado en la colección groupChats de MongoDB', !!gInMongo);
  const gAddD = await api(PORT, 'POST', '/api/group-chats/' + gId + '/members', { participants: [PHONE_A, PHONE_B, PHONE_C, PHONE_D] }, regA.token);
  check('3.3 MongoDB: A agrega a D al grupo', !!(gAddD.json && gAddD.json.ok && gAddD.json.group.participants.includes(PHONE_D) && gAddD.json.group.participants.length === 4), gAddD.json && gAddD.json.group && gAddD.json.group.participants);
  const gDropCD = await api(PORT, 'POST', '/api/group-chats/' + gId + '/members', { participants: [PHONE_A, PHONE_B] }, regA.token);
  check('3.3 MongoDB: A quita a C y a D del grupo', !!(gDropCD.json && gDropCD.json.ok && gDropCD.json.group.participants.length === 2 && !gDropCD.json.group.participants.includes(PHONE_C)), gDropCD.json && gDropCD.json.group && gDropCD.json.group.participants);
  const gNoMe = await api(PORT, 'POST', '/api/group-chats/' + gId + '/members', { participants: [PHONE_B] }, regA.token);
  check('3.3 MongoDB: quitarse a uno mismo por la lista de integrantes da 400 (hay que salir del grupo)', gNoMe.status === 400, gNoMe);
  const gmOut = await api(PORT, 'POST', '/api/group-chats/' + gId + '/messages', { message: { text: 'Ya no estoy en el grupo' } }, regC.token);
  check('3.3 MongoDB: C, que ya no es integrante, NO puede escribir en el grupo (403)', gmOut.status === 403, gmOut);
  const gLeaveB = await api(PORT, 'POST', '/api/group-chats/' + gId + '/leave', {}, regB.token);
  check('3.3 MongoDB: B sale del grupo (queda A solo)', !!(gLeaveB.json && gLeaveB.json.ok && gLeaveB.json.deleted === false && gLeaveB.json.group.participants.length === 1), gLeaveB);
  const gLeaveA = await api(PORT, 'POST', '/api/group-chats/' + gId + '/leave', {}, regA.token);
  check('3.3 MongoDB: A sale siendo el último y el grupo se borra', !!(gLeaveA.json && gLeaveA.json.ok && gLeaveA.json.deleted === true && gLeaveA.json.group === null), gLeaveA);
  const gListA2 = await api(PORT, 'GET', '/api/group-chats?phone=' + PHONE_A);
  check('3.3 MongoDB: tras salir todos, el grupo ya no aparece en la lista', !!(gListA2.json && gListA2.json.ok && !gListA2.json.groupChats.some(g => g.id === gId)), gListA2.json && gListA2.json.groupChats && gListA2.json.groupChats.length);
  /* Un segundo grupo que queda vivo: tiene que sobrevivir al reinicio. */
  const g2Res = await api(PORT, 'POST', '/api/group-chats', { id: 'gchat-vivo33', name: 'Grupo que sobrevive', participants: [PHONE_B, PHONE_C] }, regA.token);
  check('3.3 MongoDB: A crea un segundo grupo que queda vivo', !!(g2Res.json && g2Res.json.ok && g2Res.json.group && g2Res.json.group.id === 'gchat-vivo33'), g2Res);

  /* ---- borrar un mensaje de un chat grupal (v3.4): DELETE
     /api/group-chats/:id/messages/:messageId. Antes no existía: la app
     solo borraba el mensaje de grupo en su teléfono y para los demás
     seguía ahí. */
  const gmV1 = await api(PORT, 'POST', '/api/group-chats/gchat-vivo33/messages', { message: { text: 'Mensaje de A que se borrará' } }, regA.token);
  const gmV1Id = gmV1.json && gmV1.json.message && gmV1.json.message.id;
  check('3.4 MongoDB: A escribe un mensaje en el grupo vivo', !!(gmV1.json && gmV1.json.ok && gmV1Id), gmV1);
  const gmV2 = await api(PORT, 'POST', '/api/group-chats/gchat-vivo33/messages', { message: { text: 'Mensaje de B que se queda' } }, regB.token);
  const gmV2Id = gmV2.json && gmV2.json.message && gmV2.json.message.id;
  check('3.4 MongoDB: B escribe un mensaje en el grupo vivo', !!(gmV2.json && gmV2.json.ok && gmV2Id), gmV2);
  const gmDelNoAuth = await api(PORT, 'DELETE', '/api/group-chats/gchat-vivo33/messages/' + gmV1Id, null, null);
  check('3.4 MongoDB: borrar un mensaje de grupo sin sesión es 401', gmDelNoAuth.status === 401, gmDelNoAuth);
  const gmDelGhost = await api(PORT, 'DELETE', '/api/group-chats/gchat-vivo33/messages/msg-que-no-existe', null, regA.token);
  check('3.4 MongoDB: borrar un mensaje de grupo que no existe es 404', gmDelGhost.status === 404, gmDelGhost);
  const gmDelOther = await api(PORT, 'DELETE', '/api/group-chats/gchat-vivo33/messages/' + gmV1Id, null, regB.token);
  check('3.4 MongoDB: B no puede borrar el mensaje de A en el grupo (403)', gmDelOther.status === 403, gmDelOther);
  const gmDel = await api(PORT, 'DELETE', '/api/group-chats/gchat-vivo33/messages/' + gmV1Id, null, regA.token);
  check('3.4 MongoDB: A borra su mensaje del grupo (DELETE ok)', !!(gmDel.json && gmDel.json.ok), gmDel);
  const gListB4 = await api(PORT, 'GET', '/api/group-chats?phone=' + PHONE_B);
  const gVivo = gListB4.json && gListB4.json.groupChats.find(g => g.id === 'gchat-vivo33');
  check('3.4 MongoDB: tras borrarlo, el mensaje ya NO sale en el grupo y el de B sigue', !!(gVivo && !gVivo.messages.some(m => m.id === gmV1Id) && gVivo.messages.some(m => m.id === gmV2Id)), gVivo && gVivo.messages.length);
  const gmGoneMongo = await waitMongoValue(uri, 'groupChats', v => Array.isArray(v) && v.some(g => g.id === 'gchat-vivo33' && g.messages && !g.messages.some(m => m.id === gmV1Id)));
  check('3.4 MongoDB: tras borrarlo, el mensaje ya NO está en la colección groupChats de MongoDB', !!gmGoneMongo);
  const gmDelAgain = await api(PORT, 'DELETE', '/api/group-chats/gchat-vivo33/messages/' + gmV1Id, null, regA.token);
  check('3.4 MongoDB: borrar el mismo mensaje otra vez es 404 (ya está borrado)', gmDelAgain.status === 404, gmDelAgain);

  /* ================= 3.8 =================
     Visitas a historias, duetos, vistas reales, encuestas, retos,
     reacciones, verificación, comentarios con medio y menciones,
     cercanos, silenciados, deseos, cupones, salas de audio, torneos,
     mensajes temporales, regalos e invitados en lives, lugar, encuesta
     con foto, enlace y fondo en historias, nota/canción/portada/video/
     marco/filtro en el perfil, grupos secretos, stickers, ubicación en
     vivo, invitación de juego, reacciones a mensajes y compartidos. */

  /* A y B se hacen amigos (hace falta para cercanos y menciones). */
  const frReqAB = await api(PORT, 'POST', '/api/friends/request', { to: PHONE_B }, regA.token);
  const frReqId = frReqAB.json && frReqAB.json.request && frReqAB.json.request.id;
  check('3.8 MongoDB: A envía solicitud de amistad a B', !!(frReqAB.json && frReqAB.json.ok && frReqId), frReqAB);
  const frAccAB = await api(PORT, 'POST', '/api/friends/respond', { requestId: frReqId, accept: true }, regB.token);
  check('3.8 MongoDB: B acepta y ya son amigos', !!(frAccAB.json && frAccAB.json.ok), frAccAB);
  const frReqBC = await api(PORT, 'POST', '/api/friends/request', { to: PHONE_C }, regB.token);
  const frReqBCId = frReqBC.json && frReqBC.json.request && frReqBC.json.request.id;
  const frAccBC = await api(PORT, 'POST', '/api/friends/respond', { requestId: frReqBCId, accept: true }, regC.token);
  check('3.8 MongoDB: B y C también se hacen amigos', !!(frAccBC.json && frAccBC.json.ok), frAccBC);

  /* ---- verificación (v3.8, idea 10): estado antes de cumplir ----
     B tiene el teléfono verificado (código), pero le faltan perfil
     completo, antigüedad y publicaciones. */
  const verStatusB = await api(PORT, 'GET', '/api/verification/status', null, regB.token);
  const verMissingB = (verStatusB.json && verStatusB.json.missing || []).map(m => m.key);
  check('3.8 MongoDB: el estado de verificación de B dice que NO está verificado y qué le falta (perfil, antigüedad, publicaciones; no teléfono)', !!(verStatusB.json && verStatusB.json.ok && verStatusB.json.verified === false && verMissingB.includes('perfil') && verMissingB.includes('antiguedad') && verMissingB.includes('publicaciones') && !verMissingB.includes('telefono')), verStatusB.json);
  const verReqB = await api(PORT, 'POST', '/api/verification/request', {}, regB.token);
  check('3.8 MongoDB: pedir la verificación sin cumplir devuelve ok:false con lo que falta (no finge la concesión)', !!(verReqB.json && verReqB.json.ok === false && verReqB.json.verified === false && Array.isArray(verReqB.json.missing) && verReqB.json.missing.length === 3), verReqB.json);
  const verNoAuth = await api(PORT, 'GET', '/api/verification/status', null, null);
  check('3.8 MongoDB: el estado de verificación sin sesión da 401', verNoAuth.status === 401, verNoAuth);

  /* ---- visitas a historias (v3.8, idea 1) ---- */
  const svNoAuth = await api(PORT, 'POST', '/api/story-views', { storyId }, null);
  check('3.8 MongoDB: registrar una visita a una historia sin sesión da 401', svNoAuth.status === 401, svNoAuth);
  const svGhost = await api(PORT, 'POST', '/api/story-views', { storyId: 'story-que-no-existe' }, regB.token);
  check('3.8 MongoDB: registrar una visita a una historia que no existe da 404', svGhost.status === 404, svGhost);
  const svB = await api(PORT, 'POST', '/api/story-views', { storyId }, regB.token);
  check('3.8 MongoDB: B ve la historia de A (visita registrada)', !!(svB.json && svB.json.ok && svB.json.recorded === true && svB.json.count === 1), svB.json);
  const svBAgain = await api(PORT, 'POST', '/api/story-views', { storyId }, regB.token);
  check('3.8 MongoDB: B vuelve a ver la historia y la cantidad sigue en 1 (no se duplica)', !!(svBAgain.json && svBAgain.json.ok && svBAgain.json.recorded === true && svBAgain.json.count === 1), svBAgain.json);
  const svSelf = await api(PORT, 'POST', '/api/story-views', { storyId }, regA.token);
  check('3.8 MongoDB: ver tu propia historia NO se registra (recorded false)', !!(svSelf.json && svSelf.json.ok && svSelf.json.recorded === false && svSelf.json.count === 1), svSelf.json);
  const svListA = await api(PORT, 'GET', '/api/story-views/' + storyId, null, regA.token);
  check('3.8 MongoDB: A lee quién vio su historia (cantidad 1, visitante B con su nombre)', !!(svListA.json && svListA.json.ok && svListA.json.count === 1 && svListA.json.viewers.length === 1 && svListA.json.viewers[0].phone === PHONE_B && svListA.json.viewers[0].name === 'Beto (prueba)'), svListA.json);
  const svListB = await api(PORT, 'GET', '/api/story-views/' + storyId, null, regB.token);
  check('3.8 MongoDB: B no puede ver quién vio la historia de A (403, solo el autor)', svListB.status === 403, svListB);
  const svInMongo = await waitMongoValue(uri, 'storyViews', v => v && v[storyId] && v[storyId].length === 1 && v[storyId][0].viewer === PHONE_B);
  check('3.8 MongoDB: la visita está guardada en la colección storyViews de MongoDB', !!svInMongo);

  /* ---- vistas reales y estadísticas (v3.8, idea 4) ---- */
  const pvNoAuth = await api(PORT, 'POST', '/api/posts/' + postId + '/view', {}, null);
  check('3.8 MongoDB: registrar una vista sin sesión da 401', pvNoAuth.status === 401, pvNoAuth);
  const pvB = await api(PORT, 'POST', '/api/posts/' + postId + '/view', {}, regB.token);
  check('3.8 MongoDB: B ve la publicación de A (vista registrada)', !!(pvB.json && pvB.json.ok && pvB.json.recorded === true && pvB.json.count === 1), pvB.json);
  const pvBAgain = await api(PORT, 'POST', '/api/posts/' + postId + '/view', {}, regB.token);
  check('3.8 MongoDB: B vuelve a verla y la cantidad sigue en 1 (no se infla)', !!(pvBAgain.json && pvBAgain.json.ok && pvBAgain.json.recorded === true && pvBAgain.json.count === 1), pvBAgain.json);
  const pvSelf = await api(PORT, 'POST', '/api/posts/' + postId + '/view', {}, regA.token);
  check('3.8 MongoDB: ver tu propia publicación NO cuenta (recorded false)', !!(pvSelf.json && pvSelf.json.ok && pvSelf.json.recorded === false && pvSelf.json.count === 1), pvSelf.json);
  const statsA = await api(PORT, 'GET', '/api/posts/' + postId + '/stats', null, regA.token);
  check('3.8 MongoDB: A lee sus estadísticas (1 vista, 0 me gusta, 0 comentarios, 0 compartidas)', !!(statsA.json && statsA.json.ok && statsA.json.views === 1 && statsA.json.likes === 0 && statsA.json.comments === 0 && statsA.json.shares === 0), statsA.json);
  const statsB = await api(PORT, 'GET', '/api/posts/' + postId + '/stats', null, regB.token);
  check('3.8 MongoDB: B no puede ver las estadísticas de A (403, solo el autor)', statsB.status === 403, statsB);
  const pvInMongo = await waitMongoValue(uri, 'postViews', v => v && v[postId] && v[postId].length === 1 && v[postId][0].viewer === PHONE_B);
  check('3.8 MongoDB: la vista está guardada en la colección postViews de MongoDB', !!pvInMongo);

  /* ---- dueto (v3.8, idea 3): duetOf solo se conserva si existe ---- */
  const duetRes = await api(PORT, 'POST', '/api/posts', { text: 'Mi dueto', media: 'https://ejemplo.com/dueto.mp4', mediaType: 'video', duetOf: { postId, author: PHONE_A } }, regB.token);
  const duetPostId = duetRes.json && duetRes.json.post && duetRes.json.post.id;
  check('3.8 MongoDB: B publica un dueto del post de A (duetOf conservado con id y autor)', !!(duetRes.json && duetRes.json.ok && duetRes.json.post.duetOf && duetRes.json.post.duetOf.postId === postId && duetRes.json.post.duetOf.author === PHONE_A), duetRes.json && duetRes.json.post);
  const duetGhost = await api(PORT, 'POST', '/api/posts', { text: 'Dueto fantasma', duetOf: { postId: 'post-que-no-existe', author: PHONE_A } }, regB.token);
  check('3.8 MongoDB: un dueto de un post que no existe se guarda SIN vínculo (nunca se inventa el original)', !!(duetGhost.json && duetGhost.json.ok && duetGhost.json.post.duetOf === null), duetGhost.json && duetGhost.json.post);

  /* ---- encuesta en historias (v3.8, idea 7) ---- */
  const pollStoryRes = await api(PORT, 'POST', '/api/stories', { story: { text: 'Encuesta de prueba', poll: { question: '¿Rojo o azul?', options: ['Rojo', 'Azul'] } } }, regA.token);
  const pollStoryId = pollStoryRes.json && pollStoryRes.json.story && pollStoryRes.json.story.id;
  check('3.8 MongoDB: A publica una historia con encuesta (pregunta + 2 opciones)', !!(pollStoryRes.json && pollStoryRes.json.ok && pollStoryRes.json.story.poll && pollStoryRes.json.story.poll.question === '¿Rojo o azul?' && pollStoryRes.json.story.poll.options.length === 2), pollStoryRes.json && pollStoryRes.json.story);
  const pollBad = await api(PORT, 'POST', '/api/stories', { story: { text: 'Encuesta mala', poll: { question: '¿Solo una?', options: ['Solo una'] } } }, regA.token);
  check('3.8 MongoDB: una encuesta con una sola opción NO se guarda (poll null)', !!(pollBad.json && pollBad.json.ok && pollBad.json.story.poll === null), pollBad.json && pollBad.json.story);
  const pvNoAuth2 = await api(PORT, 'POST', '/api/stories/' + pollStoryId + '/poll-vote', { option: 0 }, null);
  check('3.8 MongoDB: votar en una encuesta sin sesión da 401', pvNoAuth2.status === 401, pvNoAuth2);
  const pvGhost = await api(PORT, 'POST', '/api/stories/story-que-no-existe/poll-vote', { option: 0 }, regB.token);
  check('3.8 MongoDB: votar en una historia que no existe da 404', pvGhost.status === 404, pvGhost);
  const pvSelfPoll = await api(PORT, 'POST', '/api/stories/' + pollStoryId + '/poll-vote', { option: 0 }, regA.token);
  check('3.8 MongoDB: votar en tu propia historia da 400', pvSelfPoll.status === 400, pvSelfPoll);
  const pvBadOpt = await api(PORT, 'POST', '/api/stories/' + pollStoryId + '/poll-vote', { option: 5 }, regB.token);
  check('3.8 MongoDB: votar con una opción inválida da 400', pvBadOpt.status === 400, pvBadOpt);
  const pvB0 = await api(PORT, 'POST', '/api/stories/' + pollStoryId + '/poll-vote', { option: 0 }, regB.token);
  check('3.8 MongoDB: B vota la opción 0 (conteos [1,0])', !!(pvB0.json && pvB0.json.ok && pvB0.json.poll.options[0].votes === 1 && pvB0.json.poll.options[1].votes === 0), pvB0.json && pvB0.json.poll);
  const pvB1 = await api(PORT, 'POST', '/api/stories/' + pollStoryId + '/poll-vote', { option: 1 }, regB.token);
  check('3.8 MongoDB: B cambia su voto a la opción 1 (conteos [0,1], no se duplica)', !!(pvB1.json && pvB1.json.ok && pvB1.json.poll.options[0].votes === 0 && pvB1.json.poll.options[1].votes === 1), pvB1.json && pvB1.json.poll);
  const storiesAsB = await api(PORT, 'GET', '/api/stories', null, regB.token);
  const pollAsB = storiesAsB.json && storiesAsB.json.stories.find(s => s.id === pollStoryId);
  check('3.8 MongoDB: quien ya votó ve los conteos y su voto (myVote 1)', !!(pollAsB && pollAsB.poll && pollAsB.poll.options[1].votes === 1 && pollAsB.poll.myVote === 1), pollAsB && pollAsB.poll);
  const storiesAsC = await api(PORT, 'GET', '/api/stories', null, regC.token);
  const pollAsC = storiesAsC.json && storiesAsC.json.stories.find(s => s.id === pollStoryId);
  check('3.8 MongoDB: quien NO ha votado solo ve la pregunta y las opciones (sin votos)', !!(pollAsC && pollAsC.poll && pollAsC.poll.question === '¿Rojo o azul?' && pollAsC.poll.options[0].votes === undefined && pollAsC.poll.myVote === undefined), pollAsC && pollAsC.poll);
  const storiesAsA = await api(PORT, 'GET', '/api/stories', null, regA.token);
  const pollAsA = storiesAsA.json && storiesAsA.json.stories.find(s => s.id === pollStoryId);
  check('3.8 MongoDB: el autor ve los votos Y quién votó qué (B, opción 1)', !!(pollAsA && pollAsA.poll && pollAsA.poll.voters && pollAsA.poll.voters.length === 1 && pollAsA.poll.voters[0].phone === PHONE_B && pollAsA.poll.voters[0].option === 1 && pollAsA.poll.voters[0].name === 'Beto (prueba)'), pollAsA && pollAsA.poll);
  const pollInMongo = await waitMongoValue(uri, 'storyPollVotes', v => v && v[pollStoryId] && v[pollStoryId].length === 1 && v[pollStoryId][0].voter === PHONE_B && v[pollStoryId][0].option === 1);
  check('3.8 MongoDB: el voto está guardado en la colección storyPollVotes de MongoDB', !!pollInMongo);

  /* ---- reacciones rápidas a historias (v3.8, idea 9) ---- */
  const reactSelf = await api(PORT, 'POST', '/api/stories/' + storyId + '/react', { emoji: '❤️' }, regA.token);
  check('3.8 MongoDB: reaccionar a tu propia historia da 400', reactSelf.status === 400, reactSelf);
  const reactBad = await api(PORT, 'POST', '/api/stories/' + storyId + '/react', { emoji: '' }, regB.token);
  check('3.8 MongoDB: reaccionar sin emoji da 400', reactBad.status === 400, reactBad);
  const reactB = await api(PORT, 'POST', '/api/stories/' + storyId + '/react', { emoji: '❤️' }, regB.token);
  check('3.8 MongoDB: B reacciona ❤️ a la historia de A', !!(reactB.json && reactB.json.ok && reactB.json.reaction && reactB.json.reaction.emoji === '❤️'), reactB.json);
  const reactB2 = await api(PORT, 'POST', '/api/stories/' + storyId + '/react', { emoji: '😂' }, regB.token);
  check('3.8 MongoDB: B cambia su reacción a 😂 (se puede cambiar)', !!(reactB2.json && reactB2.json.ok && reactB2.json.reaction.emoji === '😂'), reactB2.json);
  const reactListA = await api(PORT, 'GET', '/api/stories/' + storyId + '/reactions', null, regA.token);
  check('3.8 MongoDB: A lee las reacciones (cantidad 1, 😂:1, B con 😂)', !!(reactListA.json && reactListA.json.ok && reactListA.json.count === 1 && reactListA.json.byEmoji['😂'] === 1 && reactListA.json.reactions[0].phone === PHONE_B && reactListA.json.reactions[0].emoji === '😂'), reactListA.json);
  const reactListB = await api(PORT, 'GET', '/api/stories/' + storyId + '/reactions', null, regB.token);
  check('3.8 MongoDB: B no puede ver las reacciones de la historia de A (403, solo el autor)', reactListB.status === 403, reactListB);
  const storiesAsB2 = await api(PORT, 'GET', '/api/stories', null, regB.token);
  const storyAsB = storiesAsB2.json && storiesAsB2.json.stories.find(s => s.id === storyId);
  check('3.8 MongoDB: quien ve la historia ve su propia reacción marcada (myReaction 😂)', !!(storyAsB && storyAsB.myReaction === '😂'), storyAsB);
  const reactInMongo = await waitMongoValue(uri, 'storyReactions', v => v && v[storyId] && v[storyId].length === 1 && v[storyId][0].viewer === PHONE_B && v[storyId][0].emoji === '😂');
  check('3.8 MongoDB: la reacción está guardada en la colección storyReactions de MongoDB', !!reactInMongo);

  /* ---- amigos cercanos (v3.8, idea 13) ---- */
  const cfGhost = await api(PORT, 'POST', '/api/close-friends', { friendPhone: '529999999999' }, regA.token);
  check('3.8 MongoDB: añadir a cercanos a alguien que no existe da 404', cfGhost.status === 404, cfGhost);
  const cfNotFriend = await api(PORT, 'POST', '/api/close-friends', { friendPhone: PHONE_D }, regA.token);
  check('3.8 MongoDB: añadir a cercanos a alguien que NO es tu amigo da 404', cfNotFriend.status === 404, cfNotFriend);
  const cfAdd = await api(PORT, 'POST', '/api/close-friends', { friendPhone: PHONE_B }, regA.token);
  check('3.8 MongoDB: A añade a B a sus cercanos', !!(cfAdd.json && cfAdd.json.ok && cfAdd.json.closeFriends.some(f => f.phone === PHONE_B)), cfAdd.json);
  const cfAddAgain = await api(PORT, 'POST', '/api/close-friends', { friendPhone: PHONE_B }, regA.token);
  check('3.8 MongoDB: añadir dos veces al mismo cercano no duplica', !!(cfAddAgain.json && cfAddAgain.json.ok && cfAddAgain.json.closeFriends.filter(f => f.phone === PHONE_B).length === 1), cfAddAgain.json);
  const closeStoryRes = await api(PORT, 'POST', '/api/stories', { story: { text: 'Historia solo para cercanos', audience: 'close' } }, regA.token);
  const closeStoryId = closeStoryRes.json && closeStoryRes.json.story && closeStoryRes.json.story.id;
  check('3.8 MongoDB: A publica una historia solo para cercanos (audience close)', !!(closeStoryRes.json && closeStoryRes.json.ok && closeStoryRes.json.story.audience === 'close'), closeStoryRes.json && closeStoryRes.json.story);
  const storiesCloseB = await api(PORT, 'GET', '/api/stories', null, regB.token);
  check('3.8 MongoDB: B (cercano) SÍ ve la historia de cercanos de A', !!(storiesCloseB.json && storiesCloseB.json.stories.some(s => s.id === closeStoryId)), storiesCloseB.json && storiesCloseB.json.stories.length);
  const storiesCloseC = await api(PORT, 'GET', '/api/stories', null, regC.token);
  check('3.8 MongoDB: C (no cercano) NO ve la historia de cercanos de A (ni en la lista)', !!(storiesCloseC.json && storiesCloseC.json.ok && !storiesCloseC.json.stories.some(s => s.id === closeStoryId)), storiesCloseC.json && storiesCloseC.json.stories.length);
  const storiesCloseGuest = await api(PORT, 'GET', '/api/stories');
  check('3.8 MongoDB: un invitado NO ve la historia de cercanos', !!(storiesCloseGuest.json && storiesCloseGuest.json.ok && !storiesCloseGuest.json.stories.some(s => s.id === closeStoryId)), storiesCloseGuest.json && storiesCloseGuest.json.stories.length);
  const svCloseC = await api(PORT, 'POST', '/api/story-views', { storyId: closeStoryId }, regC.token);
  check('3.8 MongoDB: C tampoco puede registrar visita en la historia de cercanos (404, como si no existiera)', svCloseC.status === 404, svCloseC);
  const cfDel = await api(PORT, 'DELETE', '/api/close-friends/' + PHONE_B, null, regA.token);
  check('3.8 MongoDB: A quita a B de sus cercanos', !!(cfDel.json && cfDel.json.ok && !cfDel.json.closeFriends.some(f => f.phone === PHONE_B)), cfDel.json);
  const storiesCloseB2 = await api(PORT, 'GET', '/api/stories', null, regB.token);
  check('3.8 MongoDB: al salir de cercanos, B ya NO ve la historia', !!(storiesCloseB2.json && storiesCloseB2.json.ok && !storiesCloseB2.json.stories.some(s => s.id === closeStoryId)), storiesCloseB2.json && storiesCloseB2.json.stories.length);
  const cfReAdd = await api(PORT, 'POST', '/api/close-friends', { friendPhone: PHONE_B }, regA.token);
  check('3.8 MongoDB: A vuelve a añadir a B a sus cercanos (para que sobreviva al reinicio)', !!(cfReAdd.json && cfReAdd.json.ok && cfReAdd.json.closeFriends.some(f => f.phone === PHONE_B)), cfReAdd.json);
  const cfInMongo = await waitMongoValue(uri, 'closeFriends', v => v && v[PHONE_A] && v[PHONE_A].includes(PHONE_B));
  check('3.8 MongoDB: la lista de cercanos está guardada en la colección closeFriends de MongoDB', !!cfInMongo);

  /* ---- retos de Shorts (v3.8, idea 8) ---- */
  const chPost1 = await api(PORT, 'POST', '/api/posts', { text: 'Mi baile', media: 'https://ejemplo.com/baile.mp4', mediaType: 'video', challenge: 'BaileChallenge' }, regB.token);
  check('3.8 MongoDB: B publica un Short con reto (se guarda como #BaileChallenge)', !!(chPost1.json && chPost1.json.ok && chPost1.json.post.challenge === '#BaileChallenge'), chPost1.json && chPost1.json.post);
  const chPost2 = await api(PORT, 'POST', '/api/posts', { text: 'Otro baile', media: 'https://ejemplo.com/baile2.mp4', mediaType: 'video', challenge: '#BaileChallenge' }, regA.token);
  check('3.8 MongoDB: A publica otro Short en el mismo reto', !!(chPost2.json && chPost2.json.ok && chPost2.json.post.challenge === '#BaileChallenge'), chPost2.json && chPost2.json.post);
  const chList = await api(PORT, 'GET', '/api/challenges', null, regA.token);
  const chBaile = chList.json && chList.json.challenges.find(c => c.tag === '#BaileChallenge');
  check('3.8 MongoDB: GET /api/challenges trae el reto con su conteo real (2 Shorts) y los recientes', !!(chList.json && chList.json.ok && chBaile && chBaile.count === 2 && chBaile.recent.length === 2), chList.json);
  const chNoAuth = await api(PORT, 'GET', '/api/challenges', null, null);
  check('3.8 MongoDB: listar retos sin sesión da 401', chNoAuth.status === 401, chNoAuth);

  /* ---- comentarios con foto/video y menciones (v3.8, ideas 11 y 24) ---- */
  const cmtBadMedia = await api(PORT, 'POST', '/api/posts/' + postId + '/comment', { text: 'Con medio malo', media: 'nota-url' }, regB.token);
  check('3.8 MongoDB: comentar con un medio que no es URL válida da 400', cmtBadMedia.status === 400, cmtBadMedia);
  const cmtMedia = await api(PORT, 'POST', '/api/posts/' + postId + '/comment', { text: 'Mira esta foto', media: 'https://ejemplo.com/foto.jpg', mentions: [PHONE_C] }, regB.token);
  check('3.8 MongoDB: B comenta con foto y menciona a C (amigo de B): el comentario guarda medio + mención con nombre', !!(cmtMedia.json && cmtMedia.json.ok && cmtMedia.json.comment.media === 'https://ejemplo.com/foto.jpg' && cmtMedia.json.comment.mediaType === 'image' && cmtMedia.json.comment.mentions.length === 1 && cmtMedia.json.comment.mentions[0].phone === PHONE_C && cmtMedia.json.comment.mentions[0].name === 'Celia (prueba)'), cmtMedia.json && cmtMedia.json.comment);
  const notifC = await api(PORT, 'GET', '/api/notifications?phone=' + PHONE_C);
  check('3.8 MongoDB: C recibe el aviso "te mencionó en un comentario" en la campana', !!(notifC.json && notifC.json.ok && notifC.json.notifications.some(n => n.type === 'mention' && n.from === PHONE_B)), notifC.json && notifC.json.notifications.length);
  const cmtNonFriend = await api(PORT, 'POST', '/api/posts/' + postId + '/comment', { text: 'Mención a no-amigo', mentions: [PHONE_D] }, regB.token);
  check('3.8 MongoDB: mencionar a alguien que NO es amigo se descarta en silencio (mentions vacío)', !!(cmtNonFriend.json && cmtNonFriend.json.ok && cmtNonFriend.json.comment.mentions.length === 0), cmtNonFriend.json && cmtNonFriend.json.comment);
  const cmtOnlyMedia = await api(PORT, 'POST', '/api/posts/' + postId + '/comment', { media: 'https://ejemplo.com/video.mp4', mediaType: 'video' }, regB.token);
  check('3.8 MongoDB: comentar solo con video (sin texto) funciona', !!(cmtOnlyMedia.json && cmtOnlyMedia.json.ok && cmtOnlyMedia.json.comment.mediaType === 'video' && cmtOnlyMedia.json.comment.text === ''), cmtOnlyMedia.json && cmtOnlyMedia.json.comment);
  const cmtPlural = await api(PORT, 'POST', '/api/posts/' + postId + '/comments', { text: 'Por la ruta en plural' }, regB.token);
  check('3.8 MongoDB: la ruta en plural /api/posts/:id/comments también funciona', !!(cmtPlural.json && cmtPlural.json.ok), cmtPlural.json);
  const cmtEmpty = await api(PORT, 'POST', '/api/posts/' + postId + '/comment', { text: '   ' }, regB.token);
  check('3.8 MongoDB: comentar sin texto ni medio sigue dando 400', cmtEmpty.status === 400, cmtEmpty);

  /* ---- silenciados (v3.8, idea 31) ---- */
  const mutSelf = await api(PORT, 'POST', '/api/muted', { phone: PHONE_A }, regA.token);
  check('3.8 MongoDB: silenciarte a ti mismo da 400', mutSelf.status === 400, mutSelf);
  const mutGhost = await api(PORT, 'POST', '/api/muted', { phone: '529999999999' }, regA.token);
  check('3.8 MongoDB: silenciar a una cuenta que no existe da 404', mutGhost.status === 404, mutGhost);
  const notifA0 = await api(PORT, 'GET', '/api/notifications?phone=' + PHONE_A);
  const notifA0Count = (notifA0.json && notifA0.json.notifications || []).length;
  const mutAdd = await api(PORT, 'POST', '/api/muted', { phone: PHONE_B }, regA.token);
  check('3.8 MongoDB: A silencia a B (solo apaga sus avisos)', !!(mutAdd.json && mutAdd.json.ok && mutAdd.json.muted.some(m => m.phone === PHONE_B)), mutAdd.json);
  const cmtMuted = await api(PORT, 'POST', '/api/posts/' + postId + '/comment', { text: 'Comentario con A silenciando a B' }, regB.token);
  check('3.8 MongoDB: B comenta mientras está silenciado (el comentario sí se publica)', !!(cmtMuted.json && cmtMuted.json.ok), cmtMuted.json);
  const notifA1 = await api(PORT, 'GET', '/api/notifications?phone=' + PHONE_A);
  check('3.8 MongoDB: con B silenciado, a A NO le llega el aviso del comentario (misma cantidad)', !!((notifA1.json && notifA1.json.notifications || []).length === notifA0Count), (notifA1.json && notifA1.json.notifications || []).length);
  const feedMuted = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_A);
  check('3.8 MongoDB: silenciar NO oculta las publicaciones de B en el inicio (siguen viéndose)', !!(feedMuted.json && feedMuted.json.ok && feedMuted.json.posts.some(p => p.author === PHONE_B)), feedMuted.json && feedMuted.json.posts.length);
  const mutDel = await api(PORT, 'DELETE', '/api/muted/' + PHONE_B, null, regA.token);
  check('3.8 MongoDB: A quita el silencio a B', !!(mutDel.json && mutDel.json.ok && !mutDel.json.muted.some(m => m.phone === PHONE_B)), mutDel.json);
  const cmtUnmuted = await api(PORT, 'POST', '/api/posts/' + postId + '/comment', { text: 'Comentario con B ya sin silencio' }, regB.token);
  check('3.8 MongoDB: B vuelve a comentar tras quitar el silencio', !!(cmtUnmuted.json && cmtUnmuted.json.ok), cmtUnmuted.json);
  const notifA2 = await api(PORT, 'GET', '/api/notifications?phone=' + PHONE_A);
  check('3.8 MongoDB: sin silencio, el aviso del comentario SÍ llega a A', !!((notifA2.json && notifA2.json.notifications || []).length === notifA0Count + 1), (notifA2.json && notifA2.json.notifications || []).length);
  const mutInMongo = await waitMongoValue(uri, 'muted', v => v && v[PHONE_A] && v[PHONE_A].length === 0);
  check('3.8 MongoDB: la lista de silenciados está guardada en la colección muted de MongoDB', !!mutInMongo);

  /* ---- lista de deseos y cupones (v3.8, ideas 21 y 34) ---- */
  const listingRes = await api(PORT, 'POST', '/api/listings', { title: 'Bicicleta de prueba', price: 1000, category: 'Deportes', condition: 'Usado' }, regA.token);
  const listingId = listingRes.json && listingRes.json.listing && listingRes.json.listing.id;
  check('3.8 MongoDB: A publica un anuncio (precio 1000)', !!(listingRes.json && listingRes.json.ok && listingId), listingRes);
  const wishGhost = await api(PORT, 'POST', '/api/wishlist', { listingId: 'lst-que-no-existe' }, regB.token);
  check('3.8 MongoDB: desear un anuncio que no existe da 404', wishGhost.status === 404, wishGhost);
  const wishAdd = await api(PORT, 'POST', '/api/wishlist', { listingId }, regB.token);
  check('3.8 MongoDB: B guarda el anuncio en su lista de deseos', !!(wishAdd.json && wishAdd.json.ok && wishAdd.json.wishlist.some(l => l.id === listingId)), wishAdd.json);
  const wishGet = await api(PORT, 'GET', '/api/wishlist', null, regB.token);
  check('3.8 MongoDB: B lee su lista de deseos (el anuncio con su precio real)', !!(wishGet.json && wishGet.json.ok && wishGet.json.wishlist.length === 1 && wishGet.json.wishlist[0].price === 1000), wishGet.json);
  const couponBadPct = await api(PORT, 'POST', '/api/coupons', { code: 'MALO', discountPct: 0, expiresAt: Date.now() + 86400000 }, regA.token);
  check('3.8 MongoDB: crear un cupón con 0% da 400', couponBadPct.status === 400, couponBadPct);
  const couponOther = await api(PORT, 'POST', '/api/coupons', { code: 'OTRO10', discountPct: 10, listingId: 'lst-que-no-existe', expiresAt: Date.now() + 86400000 }, regA.token);
  check('3.8 MongoDB: crear un cupón sobre un anuncio que no existe da 404', couponOther.status === 404, couponOther);
  const couponRes = await api(PORT, 'POST', '/api/coupons', { code: 'prueba10', discountPct: 10, listingId, expiresAt: Date.now() + 86400000 }, regA.token);
  check('3.8 MongoDB: A crea un cupón PRUEBA10 de 10% para su anuncio (código normalizado a mayúsculas)', !!(couponRes.json && couponRes.json.ok && couponRes.json.coupon.code === 'PRUEBA10' && couponRes.json.coupon.discountPct === 10), couponRes.json);
  const couponDup = await api(PORT, 'POST', '/api/coupons', { code: 'PRUEBA10', discountPct: 20, expiresAt: Date.now() + 86400000 }, regA.token);
  check('3.8 MongoDB: crear dos veces el mismo código en tu tienda da 400', couponDup.status === 400, couponDup);
  const couponList = await api(PORT, 'GET', '/api/coupons?seller=' + PHONE_A, null, regB.token);
  check('3.8 MongoDB: B ve los cupones de la tienda de A', !!(couponList.json && couponList.json.ok && couponList.json.coupons.some(c => c.code === 'PRUEBA10')), couponList.json);
  const couponApply = await api(PORT, 'POST', '/api/coupons/PRUEBA10/apply', { listingId }, regB.token);
  check('3.8 MongoDB: aplicar PRUEBA10 al anuncio de 1000 devuelve el precio real con descuento (900)', !!(couponApply.json && couponApply.json.ok && couponApply.json.originalPrice === 1000 && couponApply.json.finalPrice === 900 && couponApply.json.discountPct === 10), couponApply.json);
  const couponApplyBad = await api(PORT, 'POST', '/api/coupons/NOEXISTE/apply', { listingId }, regB.token);
  check('3.8 MongoDB: aplicar un cupón que no existe da 404', couponApplyBad.status === 404, couponApplyBad);
  const couponShort = await api(PORT, 'POST', '/api/coupons', { code: 'CORTO1', discountPct: 20, expiresAt: Date.now() + 1200 }, regA.token);
  check('3.8 MongoDB: A crea un cupón que vence en ~1 segundo', !!(couponShort.json && couponShort.json.ok), couponShort.json);
  await sleep(1600);
  const couponExpired = await api(PORT, 'POST', '/api/coupons/CORTO1/apply', { listingId }, regB.token);
  check('3.8 MongoDB: aplicar un cupón vencido da 400', couponExpired.status === 400, couponExpired);
  const wishDelListing = await api(PORT, 'DELETE', '/api/listings/' + listingId, null, regA.token);
  check('3.8 MongoDB: A borra su anuncio', !!(wishDelListing.json && wishDelListing.json.ok), wishDelListing);
  const wishGetAfter = await api(PORT, 'GET', '/api/wishlist', null, regB.token);
  check('3.8 MongoDB: al borrarse el anuncio, el deseo desaparece de la lista (nunca un producto falso)', !!(wishGetAfter.json && wishGetAfter.json.ok && wishGetAfter.json.wishlist.length === 0), wishGetAfter.json);
  const couponInMongo = await waitMongoValue(uri, 'coupons', v => Array.isArray(v) && v.some(c => c.code === 'PRUEBA10' && c.seller === PHONE_A));
  check('3.8 MongoDB: el cupón está guardado en la colección coupons de MongoDB', !!couponInMongo);

  /* ---- salas de audio en vivo (v3.8, idea 19) ---- */
  const roomBad = await api(PORT, 'POST', '/api/audio-rooms', { title: '   ' }, regA.token);
  check('3.8 MongoDB: crear una sala sin título da 400', roomBad.status === 400, roomBad);
  const roomRes = await api(PORT, 'POST', '/api/audio-rooms', { title: 'Charla de prueba', topic: 'Música' }, regA.token);
  const roomId = roomRes.json && roomRes.json.room && roomRes.json.room.id;
  check('3.8 MongoDB: A crea una sala de audio (él es el primer participante)', !!(roomRes.json && roomRes.json.ok && roomRes.json.room.participants.length === 1 && roomRes.json.room.participants[0].phone === PHONE_A), roomRes.json && roomRes.json.room);
  const roomJoinGhost = await api(PORT, 'POST', '/api/audio-rooms/sala-que-no-existe/join', {}, regB.token);
  check('3.8 MongoDB: entrar a una sala que no existe da 404', roomJoinGhost.status === 404, roomJoinGhost);
  const roomJoinB = await api(PORT, 'POST', '/api/audio-rooms/' + roomId + '/join', { muted: false }, regB.token);
  check('3.8 MongoDB: B entra a la sala (2 participantes)', !!(roomJoinB.json && roomJoinB.json.ok && roomJoinB.json.room.participants.length === 2), roomJoinB.json && roomJoinB.json.room);
  /* ---- señalización WebRTC de la sala (v3.8, idea 19): sin este
     endpoint el audio entre teléfonos no se conecta ---- */
  const sigNoAuth = await api(PORT, 'POST', '/api/audio-rooms/' + roomId + '/signal', { to: PHONE_B, type: 'offer', offer: {} }, null);
  check('3.8 MongoDB: la señal de la sala sin sesión da 401', sigNoAuth.status === 401, sigNoAuth);
  const sigGhostRoom = await api(PORT, 'POST', '/api/audio-rooms/sala-que-no-existe/signal', { to: PHONE_B, type: 'offer', offer: {} }, regA.token);
  check('3.8 MongoDB: la señal a una sala que no existe da 404', sigGhostRoom.status === 404, sigGhostRoom);
  const sigGhostTo = await api(PORT, 'POST', '/api/audio-rooms/' + roomId + '/signal', { to: '529999999999', type: 'offer', offer: {} }, regA.token);
  check('3.8 MongoDB: la señal a una persona que no existe da 404', sigGhostTo.status === 404, sigGhostTo);
  const sigOutsider = await api(PORT, 'POST', '/api/audio-rooms/' + roomId + '/signal', { to: PHONE_B, type: 'offer', offer: {} }, regC.token);
  check('3.8 MongoDB: la señal de alguien que NO está en la sala da 403', sigOutsider.status === 403, sigOutsider);
  const sigNotInRoom = await api(PORT, 'POST', '/api/audio-rooms/' + roomId + '/signal', { to: PHONE_C, type: 'offer', offer: {} }, regA.token);
  check('3.8 MongoDB: la señal a alguien que NO está en la sala da 403', sigNotInRoom.status === 403, sigNotInRoom);
  const sigBadType = await api(PORT, 'POST', '/api/audio-rooms/' + roomId + '/signal', { to: PHONE_B, type: 'saludo', offer: {} }, regA.token);
  check('3.8 MongoDB: una señal con tipo inválido da 400', sigBadType.status === 400, sigBadType);
  const sigOffline = await api(PORT, 'POST', '/api/audio-rooms/' + roomId + '/signal', { to: PHONE_B, type: 'offer', offer: { sdp: 'oferta-de-prueba' } }, regA.token);
  check('3.8 MongoDB: la señal a alguien sin conexión da 404 (no está en línea)', sigOffline.status === 404, sigOffline);
  const wsRoomB = new WebSocket('ws://127.0.0.1:' + PORT + '/ws?phone=' + PHONE_B);
  await new Promise((resolve) => { if (wsRoomB.readyState === WebSocket.OPEN) resolve(); else { wsRoomB.on('open', resolve); setTimeout(resolve, 5000); } });
  const wsRoomSignal = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 5000);
    wsRoomB.on('message', (data) => { try { const m = JSON.parse(String(data)); if (m.kind === 'audioRoomSignal') { clearTimeout(timer); resolve(m); } } catch (e) {} });
  });
  const sigOffer = await api(PORT, 'POST', '/api/audio-rooms/' + roomId + '/signal', { to: PHONE_B, type: 'offer', offer: { sdp: 'oferta-de-prueba' } }, regA.token);
  const gotSignal = await wsRoomSignal;
  check('3.8 MongoDB: la oferta de A llega a B por WebSocket (audioRoomSignal, con la sala y el tipo)', !!(sigOffer.json && sigOffer.json.ok && gotSignal && gotSignal.from === PHONE_A && gotSignal.roomId === roomId && gotSignal.type === 'offer' && gotSignal.offer && gotSignal.offer.sdp === 'oferta-de-prueba'), gotSignal);
  wsRoomB.close();
  const roomMuteB = await api(PORT, 'POST', '/api/audio-rooms/' + roomId + '/mute', { muted: true }, regB.token);
  check('3.8 MongoDB: B se silencia en la sala (micrófono cerrado)', !!(roomMuteB.json && roomMuteB.json.ok && roomMuteB.json.room.participants.find(p => p.phone === PHONE_B).muted === true), roomMuteB.json && roomMuteB.json.room);
  const roomsList = await api(PORT, 'GET', '/api/audio-rooms', null, regA.token);
  check('3.8 MongoDB: la sala en vivo aparece con su conteo real (2) y los nombres', !!(roomsList.json && roomsList.json.ok && roomsList.json.rooms.some(r => r.id === roomId && r.count === 2 && r.participants.some(p => p.phone === PHONE_B && p.name === 'Beto (prueba)'))), roomsList.json);
  const roomDelB = await api(PORT, 'DELETE', '/api/audio-rooms/' + roomId, null, regB.token);
  check('3.8 MongoDB: B (no creador) no puede cerrar la sala (403)', roomDelB.status === 403, roomDelB);
  const roomLeaveB = await api(PORT, 'POST', '/api/audio-rooms/' + roomId + '/leave', {}, regB.token);
  check('3.8 MongoDB: B sale de la sala (queda A solo)', !!(roomLeaveB.json && roomLeaveB.json.ok), roomLeaveB.json);
  const roomDelA = await api(PORT, 'DELETE', '/api/audio-rooms/' + roomId, null, regA.token);
  check('3.8 MongoDB: A cierra su sala', !!(roomDelA.json && roomDelA.json.ok), roomDelA.json);
  const roomsAfter = await api(PORT, 'GET', '/api/audio-rooms', null, regA.token);
  check('3.8 MongoDB: tras cerrarla, la sala ya no aparece en vivo', !!(roomsAfter.json && roomsAfter.json.ok && !roomsAfter.json.rooms.some(r => r.id === roomId)), roomsAfter.json);

  /* ---- torneos de juegos (v3.8, idea 20) ---- */
  const tourNoAuth = await api(PORT, 'GET', '/api/tournaments/current', null, null);
  check('3.8 MongoDB: ver el torneo sin sesión da 401', tourNoAuth.status === 401, tourNoAuth);
  const tourCur = await api(PORT, 'GET', '/api/tournaments/current', null, regA.token);
  const tourId = tourCur.json && tourCur.json.tournament && tourCur.json.tournament.id;
  check('3.8 MongoDB: el torneo actual de la semana existe (juego, lunes-domingo, tabla vacía)', !!(tourCur.json && tourCur.json.ok && tourCur.json.tournament && tourCur.json.tournament.gameId && tourCur.json.tournament.gameName && tourCur.json.tournament.weekKey && tourCur.json.tournament.startsAt < tourCur.json.tournament.endsAt && Array.isArray(tourCur.json.tournament.leaderboard)), tourCur.json && tourCur.json.tournament);
  const tourBadScore = await api(PORT, 'POST', '/api/tournaments/' + tourId + '/score', { score: -5 }, regA.token);
  check('3.8 MongoDB: enviar un puntaje negativo da 400', tourBadScore.status === 400, tourBadScore);
  const tourScore1 = await api(PORT, 'POST', '/api/tournaments/' + tourId + '/score', { score: 100 }, regA.token);
  check('3.8 MongoDB: A envía 100 (mejor 100, mejoró)', !!(tourScore1.json && tourScore1.json.ok && tourScore1.json.best === 100 && tourScore1.json.improved === true), tourScore1.json);
  const tourScore2 = await api(PORT, 'POST', '/api/tournaments/' + tourId + '/score', { score: 50 }, regA.token);
  check('3.8 MongoDB: A envía 50 y su mejor sigue en 100 (no bajó)', !!(tourScore2.json && tourScore2.json.ok && tourScore2.json.best === 100 && tourScore2.json.improved === false), tourScore2.json);
  const tourScore3 = await api(PORT, 'POST', '/api/tournaments/' + tourId + '/score', { score: 150 }, regA.token);
  check('3.8 MongoDB: A envía 150 y su mejor sube a 150', !!(tourScore3.json && tourScore3.json.ok && tourScore3.json.best === 150 && tourScore3.json.improved === true), tourScore3.json);
  const tourScoreB = await api(PORT, 'POST', '/api/tournaments/' + tourId + '/score', { score: 80 }, regB.token);
  check('3.8 MongoDB: B envía 80 (mejor 80)', !!(tourScoreB.json && tourScoreB.json.ok && tourScoreB.json.best === 80), tourScoreB.json);
  const tourBoard = await api(PORT, 'GET', '/api/tournaments/current', null, regB.token);
  const board = tourBoard.json && tourBoard.json.tournament && tourBoard.json.tournament.leaderboard;
  check('3.8 MongoDB: la tabla de posiciones es real (A 150 primero, B 80 segundo, con rangos)', !!(board && board.length === 2 && board[0].phone === PHONE_A && board[0].score === 150 && board[0].rank === 1 && board[1].phone === PHONE_B && board[1].score === 80 && board[1].rank === 2), board);
  const tourInMongo = await waitMongoValue(uri, 'tournaments', v => Array.isArray(v) && v.some(t => t.id === tourId && t.scores && t.scores[PHONE_A] === 150 && t.scores[PHONE_B] === 80));
  check('3.8 MongoDB: el torneo con sus puntajes está guardado en la colección tournaments de MongoDB', !!tourInMongo);

  /* ---- mensajes temporales (v3.8, idea 32) ---- */
  const dispBad = await api(PORT, 'POST', '/api/conversations/' + PHONE_B + '/disappearing', { hours: 5 }, regA.token);
  check('3.8 MongoDB: poner mensajes temporales con 5 horas da 400 (solo 24 o 0)', dispBad.status === 400, dispBad);
  const dispGhost = await api(PORT, 'POST', '/api/conversations/529999999999/disappearing', { hours: 24 }, regA.token);
  check('3.8 MongoDB: poner mensajes temporales con alguien que no existe da 404', dispGhost.status === 404, dispGhost);
  const dispOn = await api(PORT, 'POST', '/api/conversations/' + PHONE_B + '/disappearing', { hours: 24 }, regA.token);
  check('3.8 MongoDB: A activa los mensajes temporales (24 h) con B', !!(dispOn.json && dispOn.json.ok && dispOn.json.disappearingHours === 24), dispOn.json);
  const oldMsg = await api(PORT, 'POST', '/api/messages', { to: PHONE_B, text: 'Mensaje viejo que debe borrarse', createdAt: Date.now() - 25 * 60 * 60 * 1000 }, regA.token);
  const oldMsgId = oldMsg.json && oldMsg.json.message && oldMsg.json.message.id;
  check('3.8 MongoDB: A manda un mensaje con fecha de hace 25 horas', !!(oldMsg.json && oldMsg.json.ok && oldMsgId), oldMsg);
  const newMsg = await api(PORT, 'POST', '/api/messages', { to: PHONE_B, text: 'Mensaje nuevo que se queda' }, regA.token);
  const newMsgId = newMsg.json && newMsg.json.message && newMsg.json.message.id;
  check('3.8 MongoDB: A manda un mensaje nuevo en el mismo chat', !!(newMsg.json && newMsg.json.ok && newMsgId), newMsg);
  const convsA = await api(PORT, 'GET', '/api/messages?phone=' + PHONE_A);
  const convAB = (convsA.json && convsA.json.conversations || []).find(c => c.participants.includes(PHONE_B));
  check('3.8 MongoDB: al leer el chat, el mensaje viejo YA NO está y el nuevo sí (poda real)', !!(convAB && convAB.disappearingHours === 24 && convAB.messages.some(m => m.id === newMsgId) && !convAB.messages.some(m => m.id === oldMsgId)), convAB && convAB.messages.length);
  const oldGoneMongo = await waitMongoValue(uri, 'messages', v => Array.isArray(v) && !v.some(m => m.id === oldMsgId) && v.some(m => m.id === newMsgId));
  check('3.8 MongoDB: el mensaje vencido ya NO está en la colección messages de MongoDB', !!oldGoneMongo);
  const dispOff = await api(PORT, 'POST', '/api/conversations/' + PHONE_B + '/disappearing', { hours: 0 }, regA.token);
  check('3.8 MongoDB: A apaga los mensajes temporales con B', !!(dispOff.json && dispOff.json.ok && dispOff.json.disappearingHours === 0), dispOff.json);
  const convsA2 = await api(PORT, 'GET', '/api/messages?phone=' + PHONE_A);
  const convAB2 = (convsA2.json && convsA2.json.conversations || []).find(c => c.participants.includes(PHONE_B));
  check('3.8 MongoDB: tras apagarlos, el chat ya no marca mensajes temporales', !!(convAB2 && convAB2.disappearingHours === 0), convAB2);

  /* ---- regalos e invitados en lives (v3.8, ideas 16 y 23) ---- */
  const liveRes = await api(PORT, 'POST', '/api/lives', { title: 'Live de prueba 3.8' }, regA.token);
  const liveId = liveRes.json && liveRes.json.live && liveRes.json.live.id;
  check('3.8 MongoDB: A inicia un live', !!(liveRes.json && liveRes.json.ok && liveId), liveRes);
  const giftBad = await api(PORT, 'POST', '/api/lives/' + liveId + '/gift', { giftId: 'dinero' }, regB.token);
  check('3.8 MongoDB: enviar un regalo que no existe da 400', giftBad.status === 400, giftBad);
  const gift1 = await api(PORT, 'POST', '/api/lives/' + liveId + '/gift', { giftId: 'rosa' }, regB.token);
  check('3.8 MongoDB: B envía una rosa (conteo rosa 1, total 1)', !!(gift1.json && gift1.json.ok && gift1.json.counts.rosa === 1 && gift1.json.total === 1), gift1.json);
  const gift2 = await api(PORT, 'POST', '/api/lives/' + liveId + '/gift', { giftId: 'corazon' }, regB.token);
  check('3.8 MongoDB: B envía un corazón (total 2, rosa sigue en 1)', !!(gift2.json && gift2.json.ok && gift2.json.counts.rosa === 1 && gift2.json.counts.corazon === 1 && gift2.json.total === 2), gift2.json);
  const giftsList = await api(PORT, 'GET', '/api/lives/' + liveId + '/gifts', null, regA.token);
  check('3.8 MongoDB: el creador ve los regalos (top: B con 2)', !!(giftsList.json && giftsList.json.ok && giftsList.json.total === 2 && giftsList.json.top.length === 1 && giftsList.json.top[0].phone === PHONE_B && giftsList.json.top[0].gifts === 2), giftsList.json);
  const giftInMongo = await waitMongoValue(uri, 'liveGifts', v => v && v[liveId] && v[liveId].length === 2);
  check('3.8 MongoDB: los regalos están guardados en la colección liveGifts de MongoDB', !!giftInMongo);
  const invByB = await api(PORT, 'POST', '/api/lives/' + liveId + '/invite', { phone: PHONE_C }, regB.token);
  check('3.8 MongoDB: B (no dueño) no puede invitar al live (403)', invByB.status === 403, invByB);
  const invGhost = await api(PORT, 'POST', '/api/lives/' + liveId + '/invite', { phone: '529999999999' }, regA.token);
  check('3.8 MongoDB: invitar a alguien que no existe da 404', invGhost.status === 404, invGhost);
  const invB = await api(PORT, 'POST', '/api/lives/' + liveId + '/invite', { phone: PHONE_B }, regA.token);
  check('3.8 MongoDB: A invita a B a transmitir con él', !!(invB.json && invB.json.ok && invB.json.invite.status === 'pending'), invB.json);
  const invRespC = await api(PORT, 'POST', '/api/lives/' + liveId + '/invite/respond', { accept: true }, regC.token);
  check('3.8 MongoDB: C (sin invitación) no puede aceptar (404)', invRespC.status === 404, invRespC);
  const invRespB = await api(PORT, 'POST', '/api/lives/' + liveId + '/invite/respond', { accept: true }, regB.token);
  check('3.8 MongoDB: B acepta y queda como coanfitrión', !!(invRespB.json && invRespB.json.ok && invRespB.json.coHost === PHONE_B), invRespB.json);
  const livesNow = await api(PORT, 'GET', '/api/lives');
  check('3.8 MongoDB: el live en vivo muestra su coanfitrión (B)', !!(livesNow.json && livesNow.json.ok && livesNow.json.lives.some(l => l.id === liveId && l.coHost === PHONE_B)), livesNow.json && livesNow.json.lives.length);
  const liveLeaveB = await api(PORT, 'POST', '/api/lives/' + liveId + '/leave', {}, regB.token);
  check('3.8 MongoDB: B sale del live', !!(liveLeaveB.json && liveLeaveB.json.ok), liveLeaveB.json);
  const livesAfterLeave = await api(PORT, 'GET', '/api/lives');
  check('3.8 MongoDB: al salir el invitado, el live sigue solo con el dueño (coHost null)', !!(livesAfterLeave.json && livesAfterLeave.json.ok && livesAfterLeave.json.lives.some(l => l.id === liveId && l.coHost === null)), livesAfterLeave.json && livesAfterLeave.json.lives.length);
  const liveEnd = await api(PORT, 'POST', '/api/lives/' + liveId + '/end', {}, regA.token);
  check('3.8 MongoDB: A termina el live', !!(liveEnd.json && liveEnd.json.ok), liveEnd.json);
  const giftEnded = await api(PORT, 'POST', '/api/lives/' + liveId + '/gift', { giftId: 'rosa' }, regB.token);
  check('3.8 MongoDB: enviar un regalo a un live terminado da 404', giftEnded.status === 404, giftEnded);

  /* ---- historias: enlace, fondo, Short compartido y audio (v3.8, ideas 17, 29, 39, 50) ---- */
  const storyBadLink = await api(PORT, 'POST', '/api/stories', { story: { text: 'Con enlace malo', link: 'nota-url' } }, regA.token);
  check('3.8 MongoDB: una historia con enlace inválido da 400', storyBadLink.status === 400, storyBadLink);
  const storyLink = await api(PORT, 'POST', '/api/stories', { story: { text: 'Con enlace', link: 'https://ejemplo.com' } }, regA.token);
  check('3.8 MongoDB: una historia con enlace http(s) guarda el enlace', !!(storyLink.json && storyLink.json.ok && storyLink.json.story.link === 'https://ejemplo.com'), storyLink.json && storyLink.json.story);
  const storyBadColor = await api(PORT, 'POST', '/api/stories', { story: { text: 'Color malo', backgroundColor: 'rojo' } }, regA.token);
  check('3.8 MongoDB: una historia con color de fondo inválido da 400', storyBadColor.status === 400, storyBadColor);
  const storyColor = await api(PORT, 'POST', '/api/stories', { story: { text: 'Solo texto con fondo', backgroundColor: '#ff0000' } }, regA.token);
  check('3.8 MongoDB: una historia de solo texto guarda su color de fondo', !!(storyColor.json && storyColor.json.ok && storyColor.json.story.backgroundColor === '#ff0000'), storyColor.json && storyColor.json.story);
  const storyShortBad = await api(PORT, 'POST', '/api/stories', { story: { sharedShortId: 'post-que-no-existe' } }, regA.token);
  check('3.8 MongoDB: compartir en historia un Short que no existe da 400', storyShortBad.status === 400, storyShortBad);
  const storyShort = await api(PORT, 'POST', '/api/stories', { story: { sharedShortId: duetPostId } }, regA.token);
  check('3.8 MongoDB: compartir un Short en tu historia guarda la referencia (no una copia)', !!(storyShort.json && storyShort.json.ok && storyShort.json.story.sharedShortId === duetPostId), storyShort.json && storyShort.json.story);
  const storyAudio = await api(PORT, 'POST', '/api/stories', { story: { media: 'https://ejemplo.com/nota.mp3', mediaType: 'audio' } }, regA.token);
  check('3.8 MongoDB: una historia de solo audio (mediaType audio) se guarda', !!(storyAudio.json && storyAudio.json.ok && storyAudio.json.story.mediaType === 'audio' && storyAudio.json.story.media === 'https://ejemplo.com/nota.mp3'), storyAudio.json && storyAudio.json.story);

  /* ---- publicaciones: ánimo, lugar y encuesta con foto (v3.8, ideas 22, 25, 26) ---- */
  const moodPost = await api(PORT, 'POST', '/api/posts', { text: 'Hoy me siento bien', mood: { text: 'feliz', emoji: '😊' } }, regA.token);
  check('3.8 MongoDB: una publicación con estado de ánimo lo conserva', !!(moodPost.json && moodPost.json.ok && moodPost.json.post.mood && moodPost.json.post.mood.text === 'feliz' && moodPost.json.post.mood.emoji === '😊'), moodPost.json && moodPost.json.post);
  const placePost = await api(PORT, 'POST', '/api/posts', { text: 'Estoy aquí', place: { name: 'Parque Central', lat: 19.4, lng: -99.1 } }, regA.token);
  check('3.8 MongoDB: una publicación con lugar lo conserva (nombre + coordenadas)', !!(placePost.json && placePost.json.ok && placePost.json.post.place && placePost.json.post.place.name === 'Parque Central' && placePost.json.post.place.lat === 19.4), placePost.json && placePost.json.post);
  const placeBad = await api(PORT, 'POST', '/api/posts', { text: 'Lugar imposible', place: { name: 'Ningún lado', lat: 200, lng: 0 } }, regA.token);
  check('3.8 MongoDB: un lugar con coordenadas imposibles se guarda como null (no se inventa)', !!(placeBad.json && placeBad.json.ok && placeBad.json.post.place === null), placeBad.json && placeBad.json.post);
  const ppBad = await api(PORT, 'POST', '/api/posts', { text: 'Encuesta con una foto', photoPoll: { options: [{ mediaUrl: 'https://ejemplo.com/f1.jpg', label: 'Una' }] } }, regA.token);
  check('3.8 MongoDB: una encuesta con foto con una sola foto da 400', ppBad.status === 400, ppBad);
  const ppRes = await api(PORT, 'POST', '/api/posts', { text: '¿Cuál te gusta más?', photoPoll: { options: [{ mediaUrl: 'https://ejemplo.com/f1.jpg', label: 'Foto 1' }, { mediaUrl: 'https://ejemplo.com/f2.jpg', label: 'Foto 2' }] } }, regA.token);
  const ppPostId = ppRes.json && ppRes.json.post && ppRes.json.post.id;
  check('3.8 MongoDB: A publica una encuesta con foto (2 fotos)', !!(ppRes.json && ppRes.json.ok && ppRes.json.post.photoPoll && ppRes.json.post.photoPoll.options.length === 2), ppRes.json && ppRes.json.post);
  const ppVoteBad = await api(PORT, 'POST', '/api/posts/' + postId + '/vote', { optionIndex: 0 }, regB.token);
  check('3.8 MongoDB: votar en una publicación sin encuesta con foto da 400', ppVoteBad.status === 400, ppVoteBad);
  const ppVote0 = await api(PORT, 'POST', '/api/posts/' + ppPostId + '/vote', { optionIndex: 0 }, regB.token);
  check('3.8 MongoDB: B vota la foto 0 (conteos [1,0], myVote 0)', !!(ppVote0.json && ppVote0.json.ok && ppVote0.json.votes[0] === 1 && ppVote0.json.votes[1] === 0 && ppVote0.json.myVote === 0), ppVote0.json);
  const ppVote1 = await api(PORT, 'POST', '/api/posts/' + ppPostId + '/vote', { optionIndex: 1 }, regB.token);
  check('3.8 MongoDB: B cambia su voto a la foto 1 (conteos [0,1], no se duplica)', !!(ppVote1.json && ppVote1.json.ok && ppVote1.json.votes[0] === 0 && ppVote1.json.votes[1] === 1 && ppVote1.json.myVote === 1), ppVote1.json);
  const ppFeedB = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  const ppInFeed = ppFeedB.json && ppFeedB.json.posts.find(p => p.id === ppPostId);
  check('3.8 MongoDB: la publicación servida lleva los conteos y el voto de quien pide', !!(ppInFeed && ppInFeed.photoPoll && ppInFeed.photoPoll.votes[1] === 1 && ppInFeed.photoPoll.myVote === 1), ppInFeed && ppInFeed.photoPoll);
  const ppVotesA = await api(PORT, 'GET', '/api/posts/' + ppPostId + '/votes', null, regA.token);
  check('3.8 MongoDB: A ve quién votó cada foto (B, opción 1)', !!(ppVotesA.json && ppVotesA.json.ok && ppVotesA.json.voters.length === 1 && ppVotesA.json.voters[0].phone === PHONE_B && ppVotesA.json.voters[0].option === 1), ppVotesA.json);
  const ppVotesB = await api(PORT, 'GET', '/api/posts/' + ppPostId + '/votes', null, regB.token);
  check('3.8 MongoDB: B no puede ver quién votó (403, solo el autor)', ppVotesB.status === 403, ppVotesB);
  const ppInMongo = await waitMongoValue(uri, 'postVotes', v => v && v[ppPostId] && v[ppPostId].length === 1 && v[ppPostId][0].voter === PHONE_B && v[ppPostId][0].option === 1);
  check('3.8 MongoDB: el voto de la encuesta con foto está guardado en la colección postVotes de MongoDB', !!ppInMongo);

  /* ---- quién compartió tu publicación (v3.8, idea 42) ---- */
  const shareRes = await api(PORT, 'POST', '/api/posts/' + postId + '/share', {}, regB.token);
  check('3.8 MongoDB: B comparte la publicación de A (repost)', !!(shareRes.json && shareRes.json.ok), shareRes);
  const sharesA = await api(PORT, 'GET', '/api/posts/' + postId + '/shares', null, regA.token);
  check('3.8 MongoDB: A ve quién compartió su publicación (B, con su repost)', !!(sharesA.json && sharesA.json.ok && sharesA.json.count === 1 && sharesA.json.shares[0].phone === PHONE_B && sharesA.json.shares[0].name === 'Beto (prueba)' && sharesA.json.shares[0].repostId), sharesA.json);
  const sharesB = await api(PORT, 'GET', '/api/posts/' + postId + '/shares', null, regB.token);
  check('3.8 MongoDB: B no puede ver quién compartió la publicación de A (403, solo el autor)', sharesB.status === 403, sharesB);

  /* ---- perfil: nota, canción del día, portada, video, marco y filtro (v3.8, ideas 30, 33, 36, 48, 63, 65) ---- */
  const profFields = await api(PORT, 'POST', '/api/profile', { name: 'Ana (prueba)', photo: 'https://ejemplo.com/ana.jpg', bio: 'Biografía de prueba', note: 'Hola, soy Ana', songOfTheDay: { song: { title: 'Mi canción', src: 'https://ejemplo.com/c.mp3' }, date: '2026-11-15' }, pinnedCover: 'https://ejemplo.com/portada.jpg', avatarVideo: { url: 'https://ejemplo.com/video.mp4', durationMs: 5000 }, avatarFrame: 'dorado', avatarFilter: 'Sepia' }, regA.token);
  check('3.8 MongoDB: el perfil de A guarda nota, canción del día, portada de destacadas, video, marco y filtro', !!(profFields.json && profFields.json.ok && profFields.json.profile.note === 'Hola, soy Ana' && profFields.json.profile.songOfTheDay && profFields.json.profile.songOfTheDay.song.title === 'Mi canción' && profFields.json.profile.pinnedCover === 'https://ejemplo.com/portada.jpg' && profFields.json.profile.avatarVideo && profFields.json.profile.avatarVideo.url === 'https://ejemplo.com/video.mp4' && profFields.json.profile.avatarFrame === 'dorado' && profFields.json.profile.avatarFilter === 'Sepia'), profFields.json && profFields.json.profile);
  const profBadVideo = await api(PORT, 'POST', '/api/profile', { name: 'Ana (prueba)', avatarVideo: { url: 'https://ejemplo.com/largo.mp4', durationMs: 7000 } }, regA.token);
  check('3.8 MongoDB: un video de perfil de 7 segundos da 400 (máximo 6)', profBadVideo.status === 400, profBadVideo);
  const profBadCover = await api(PORT, 'POST', '/api/profile', { name: 'Ana (prueba)', pinnedCover: 'nota-url' }, regA.token);
  check('3.8 MongoDB: una portada de destacadas que no es URL válida da 400', profBadCover.status === 400, profBadCover);
  const profBadFrame = await api(PORT, 'POST', '/api/profile', { name: 'Ana (prueba)', avatarFrame: 'inexistente' }, regA.token);
  check('3.8 MongoDB: un marco inválido se ignora (el marco dorado sigue)', !!(profBadFrame.json && profBadFrame.json.ok && profBadFrame.json.profile.avatarFrame === 'dorado'), profBadFrame.json && profBadFrame.json.profile);
  /* A necesita 5 publicaciones para la verificación (lleva: postId,
     moodPost, placePost, placeBad, ppRes = 5). */
  const profA5 = await api(PORT, 'GET', '/api/profile/' + PHONE_A);
  check('3.8 MongoDB: el perfil de A se sirve con sus campos nuevos (nota y video)', !!(profA5.json && profA5.json.ok && profA5.json.profile.note === 'Hola, soy Ana' && profA5.json.profile.avatarVideo && profA5.json.profile.avatarVideo.durationMs === 5000), profA5.json && profA5.json.profile);

  /* ---- grupos secretos (v3.8, idea 51) ---- */
  const secretRes = await api(PORT, 'POST', '/api/groups', { name: 'Grupo secreto de prueba', secret: true }, regA.token);
  const secretGroupId = secretRes.json && secretRes.json.group && secretRes.json.group.id;
  check('3.8 MongoDB: A crea un grupo secreto', !!(secretRes.json && secretRes.json.ok && secretRes.json.group.secret === true), secretRes.json && secretRes.json.group);
  const groupsB = await api(PORT, 'GET', '/api/groups', null, regB.token);
  check('3.8 MongoDB: B (no miembro) NO ve el grupo secreto en el descubrimiento', !!(groupsB.json && groupsB.json.ok && !groupsB.json.groups.some(g => g.id === secretGroupId)), groupsB.json && groupsB.json.groups.length);
  const groupsGuest = await api(PORT, 'GET', '/api/groups');
  check('3.8 MongoDB: un invitado tampoco ve el grupo secreto', !!(groupsGuest.json && groupsGuest.json.ok && !groupsGuest.json.groups.some(g => g.id === secretGroupId)), groupsGuest.json && groupsGuest.json.groups.length);
  const searchSecretB = await api(PORT, 'GET', '/api/search?q=secreto&phone=' + PHONE_B);
  check('3.8 MongoDB: B no encuentra el grupo secreto en la búsqueda', !!(searchSecretB.json && searchSecretB.json.ok && !searchSecretB.json.groups.some(g => g.id === secretGroupId)), searchSecretB.json && searchSecretB.json.groups.length);
  const searchSecretA = await api(PORT, 'GET', '/api/search?q=secreto&phone=' + PHONE_A);
  check('3.8 MongoDB: A (miembro) SÍ encuentra su grupo secreto en la búsqueda', !!(searchSecretA.json && searchSecretA.json.ok && searchSecretA.json.groups.some(g => g.id === secretGroupId)), searchSecretA.json && searchSecretA.json.groups.length);
  const secretPublic = await api(PORT, 'GET', '/api/groups/' + secretGroupId + '/public', null, regB.token);
  check('3.8 MongoDB: el enlace público del grupo secreto muestra nombre, miembros (1) y que es secreto, sin nada de dentro', !!(secretPublic.json && secretPublic.json.ok && secretPublic.json.group.name === 'Grupo secreto de prueba' && secretPublic.json.group.memberCount === 1 && secretPublic.json.group.secret === true && secretPublic.json.group.isMember === false), secretPublic.json && secretPublic.json.group);
  const secretJoinB = await api(PORT, 'POST', '/api/groups/' + secretGroupId + '/join', {}, regB.token);
  check('3.8 MongoDB: B no puede entrar al grupo secreto sin invitación (403)', secretJoinB.status === 403, secretJoinB);
  const secretInvByB = await api(PORT, 'POST', '/api/groups/' + secretGroupId + '/invite', { phone: PHONE_C }, regB.token);
  check('3.8 MongoDB: B (no admin) no puede invitar al grupo secreto (403)', secretInvByB.status === 403, secretInvByB);
  const secretInvGhost = await api(PORT, 'POST', '/api/groups/' + secretGroupId + '/invite', { phone: '529999999999' }, regA.token);
  check('3.8 MongoDB: invitar a alguien que no existe da 404', secretInvGhost.status === 404, secretInvGhost);
  const secretInvC = await api(PORT, 'POST', '/api/groups/' + secretGroupId + '/invite', { phone: PHONE_C }, regA.token);
  check('3.8 MongoDB: A invita a C al grupo secreto', !!(secretInvC.json && secretInvC.json.ok), secretInvC.json);
  const secretJoinC = await api(PORT, 'POST', '/api/groups/' + secretGroupId + '/join', {}, regC.token);
  check('3.8 MongoDB: C acepta la invitación y entra al grupo secreto', !!(secretJoinC.json && secretJoinC.json.ok && secretJoinC.json.group.members.includes(PHONE_C)), secretJoinC.json && secretJoinC.json.group);
  const secretInvD = await api(PORT, 'POST', '/api/groups/' + secretGroupId + '/invite', { phone: PHONE_D }, regA.token);
  check('3.8 MongoDB: A invita a D al grupo secreto', !!(secretInvD.json && secretInvD.json.ok), secretInvD.json);
  const secretDeclineD = await api(PORT, 'POST', '/api/groups/' + secretGroupId + '/invite/decline', {}, regD.token);
  check('3.8 MongoDB: D rechaza la invitación', !!(secretDeclineD.json && secretDeclineD.json.ok), secretDeclineD.json);
  const secretJoinD = await api(PORT, 'POST', '/api/groups/' + secretGroupId + '/join', {}, regD.token);
  check('3.8 MongoDB: tras rechazar, D ya no puede entrar (403)', secretJoinD.status === 403, secretJoinD);

  /* ---- mensajes: stickers, ubicación en vivo, juego y reacciones (v3.8, ideas 47, 55, 56, 57) ---- */
  const stkBad = await api(PORT, 'POST', '/api/messages', { to: PHONE_B, stickerId: 'inexistente' }, regA.token);
  check('3.8 MongoDB: mandar un sticker que no existe da 400', stkBad.status === 400, stkBad);
  const stkMsg = await api(PORT, 'POST', '/api/messages', { to: PHONE_B, stickerId: 'corazon' }, regA.token);
  const stkMsgId = stkMsg.json && stkMsg.json.message && stkMsg.json.message.id;
  check('3.8 MongoDB: A manda un mensaje solo con el sticker corazón (sin texto)', !!(stkMsg.json && stkMsg.json.ok && stkMsg.json.message.stickerId === 'corazon' && stkMsg.json.message.text === ''), stkMsg.json && stkMsg.json.message);
  const locBad = await api(PORT, 'POST', '/api/messages', { to: PHONE_B, liveLocation: { lat: 200, lng: 0 } }, regA.token);
  check('3.8 MongoDB: compartir una ubicación inválida da 400', locBad.status === 400, locBad);
  const locMsg = await api(PORT, 'POST', '/api/messages', { to: PHONE_B, text: 'Te comparto dónde estoy', liveLocation: { lat: 19.4, lng: -99.1 } }, regA.token);
  const locMsgId = locMsg.json && locMsg.json.message && locMsg.json.message.id;
  check('3.8 MongoDB: A comparte su ubicación en vivo por 1 hora (expiresAt en el futuro)', !!(locMsg.json && locMsg.json.ok && locMsg.json.message.liveLocation && locMsg.json.message.liveLocation.lat === 19.4 && locMsg.json.message.liveLocation.expiresAt > Date.now() && locMsg.json.message.liveLocation.expiresAt <= Date.now() + 60 * 60 * 1000), locMsg.json && locMsg.json.message);
  const locByB = await api(PORT, 'POST', '/api/messages/' + locMsgId + '/location', { lat: 19.5, lng: -99.2 }, regB.token);
  check('3.8 MongoDB: B (no remitente) no puede actualizar la ubicación de A (403)', locByB.status === 403, locByB);
  const locByA = await api(PORT, 'POST', '/api/messages/' + locMsgId + '/location', { lat: 19.5, lng: -99.2 }, regA.token);
  check('3.8 MongoDB: A actualiza su posición (lat 19.5)', !!(locByA.json && locByA.json.ok && locByA.json.message.liveLocation.lat === 19.5 && locByA.json.message.liveLocation.lng === -99.2), locByA.json && locByA.json.message);
  const gameBad = await api(PORT, 'POST', '/api/messages', { to: PHONE_B, gameInvite: { gameId: 'juego-que-no-existe', roomId: 'sala1' } }, regA.token);
  check('3.8 MongoDB: invitar a un juego que no existe da 400', gameBad.status === 400, gameBad);
  const gameMsg = await api(PORT, 'POST', '/api/messages', { to: PHONE_B, text: 'Te reto a la serpiente', gameInvite: { gameId: 'serpiente', roomId: 'sala1' } }, regA.token);
  check('3.8 MongoDB: A reta a B a la serpiente (invitación de juego guardada)', !!(gameMsg.json && gameMsg.json.ok && gameMsg.json.message.gameInvite && gameMsg.json.message.gameInvite.gameId === 'serpiente'), gameMsg.json && gameMsg.json.message);
  const reactMsg = await api(PORT, 'POST', '/api/messages', { to: PHONE_B, text: 'Mensaje para reaccionar' }, regA.token);
  const reactMsgId = reactMsg.json && reactMsg.json.message && reactMsg.json.message.id;
  check('3.8 MongoDB: A manda un mensaje para reaccionar', !!(reactMsg.json && reactMsg.json.ok && reactMsgId), reactMsg);
  const reactMsgBad = await api(PORT, 'POST', '/api/messages/' + reactMsgId + '/react', { emoji: '🔥' }, regB.token);
  check('3.8 MongoDB: reaccionar con un emoji fuera del conjunto da 400', reactMsgBad.status === 400, reactMsgBad);
  const reactMsgB = await api(PORT, 'POST', '/api/messages/' + reactMsgId + '/react', { emoji: '❤️' }, regB.token);
  check('3.8 MongoDB: B reacciona ❤️ al mensaje (con su nombre)', !!(reactMsgB.json && reactMsgB.json.ok && reactMsgB.json.reactions.length === 1 && reactMsgB.json.reactions[0].phone === PHONE_B && reactMsgB.json.reactions[0].name === 'Beto (prueba)' && reactMsgB.json.reactions[0].emoji === '❤️'), reactMsgB.json);
  const reactMsgB2 = await api(PORT, 'POST', '/api/messages/' + reactMsgId + '/react', { emoji: '👍' }, regB.token);
  check('3.8 MongoDB: B cambia su reacción a 👍 (una sola reacción por persona)', !!(reactMsgB2.json && reactMsgB2.json.ok && reactMsgB2.json.reactions.length === 1 && reactMsgB2.json.reactions[0].emoji === '👍'), reactMsgB2.json);
  const reactGhost = await api(PORT, 'POST', '/api/messages/msg-que-no-existe/react', { emoji: '❤️' }, regB.token);
  check('3.8 MongoDB: reaccionar a un mensaje que no existe da 404', reactGhost.status === 404, reactGhost);
  const convsB = await api(PORT, 'GET', '/api/messages?phone=' + PHONE_B);
  const convBA = (convsB.json && convsB.json.conversations || []).find(c => c.participants.includes(PHONE_A));
  const reactServed = convBA && convBA.messages.find(m => m.id === reactMsgId);
  check('3.8 MongoDB: el mensaje servido lleva su reacción con nombre', !!(reactServed && reactServed.reactions && reactServed.reactions.length === 1 && reactServed.reactions[0].name === 'Beto (prueba)' && reactServed.reactions[0].emoji === '👍'), reactServed);
  const stkGroup = await api(PORT, 'POST', '/api/group-chats/gchat-vivo33/messages', { message: { stickerId: 'risa' } }, regA.token);
  check('3.8 MongoDB: A manda un sticker en el grupo', !!(stkGroup.json && stkGroup.json.ok && stkGroup.json.message.stickerId === 'risa'), stkGroup.json && stkGroup.json.message);

  /* La publicación, el mensaje y el juego tienen que estar YA en
     MongoDB (no solo en la memoria del proceso) antes de reiniciar. */
  const postsInMongo = await waitMongoValue(uri, 'posts', v => Array.isArray(v) && v.some(p => p.id === postId));
  check('3.3 MongoDB: la publicación está guardada en la colección posts de MongoDB', !!postsInMongo);
  const msgsInMongo = await waitMongoValue(uri, 'messages', v => Array.isArray(v) && v.some(m => m.id === msgId));
  check('3.3 MongoDB: el mensaje está guardado en la colección messages de MongoDB', !!msgsInMongo);
  const gamesInMongo = await waitMongoValue(uri, 'gameStats', v => v && v.plays && v.plays.prueba31 === 1);
  check('3.3 MongoDB: la estadística está guardada en la colección gameStats de MongoDB', !!gamesInMongo);

  /* ---- DELETE con la escritura en MongoDB rota (v3.3): el borrado NO
     puede mentir el éxito. Con WORDRED_TEST_FAIL_WRITES=1, cada escritura
     en MongoDB falla: DELETE tiene que devolver 500 y la publicación
     tiene que seguir en la memoria del servidor y en MongoDB (en la
     3.2 respondía {ok:true} y la publicación resucitaba al reiniciar). */
  const failPostRes = await api(PORT, 'POST', '/api/posts', { text: 'Publicación que NO se debe borrar si MongoDB falla' }, regA.token);
  const failPostId = failPostRes.json && failPostRes.json.post && failPostRes.json.post.id;
  check('3.3 MongoDB: A crea la publicación para la prueba de fallo', !!(failPostRes.json && failPostRes.json.ok && failPostId), failPostRes);
  const failPostInMongo = await waitMongoValue(uri, 'posts', v => Array.isArray(v) && v.some(p => p.id === failPostId));
  check('3.3 MongoDB: la publicación para la prueba de fallo está en MongoDB', !!failPostInMongo);
  await stopServer(proc);
  proc = startServer(PORT, { MONGODB_URI: uri, DATA_DIR: dataDir, WORDRED_TEST_FAIL_WRITES: '1' });
  health = await waitHealth(PORT);
  check('3.8 MongoDB: con las escrituras rotas, el servidor arranca y /api/health sigue diciendo 4.4', !!(health && health.version === '4.5' && health.storage === 'mongodb'), health);
  const delFail = await api(PORT, 'DELETE', '/api/posts/' + failPostId, null, regA.token);
  check('3.3 MongoDB: con MongoDB roto, DELETE devuelve 500 (no un éxito falso)', delFail.status === 500 && !!(delFail.json && delFail.json.ok === false), delFail);
  check('3.3 MongoDB: con MongoDB roto, DELETE explica el error real', !!(delFail.json && delFail.json.error && delFail.json.error.indexOf('No se pudo guardar el borrado') >= 0), delFail.json && delFail.json.error);
  const feedFail = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  check('3.3 MongoDB: con MongoDB roto, la publicación SIGUE en el inicio (no se perdió)', !!(feedFail.json && feedFail.json.ok && feedFail.json.posts.some(p => p.id === failPostId)), feedFail.json && feedFail.json.posts.length);
  const failPostStillMongo = await waitMongoValue(uri, 'posts', v => Array.isArray(v) && v.some(p => p.id === failPostId));
  check('3.3 MongoDB: con MongoDB roto, la publicación SIGUE en la colección posts de MongoDB', !!failPostStillMongo);
  await stopServer(proc);
  proc = startServer(PORT, { MONGODB_URI: uri, DATA_DIR: dataDir });
  health = await waitHealth(PORT);
  check('3.3 MongoDB: con las escrituras sanas de nuevo, el servidor arranca', !!(health && health.version === '4.5'), health);
  const delFailOk = await api(PORT, 'DELETE', '/api/posts/' + failPostId, null, regA.token);
  check('3.3 MongoDB: con las escrituras sanas, el borrado sí funciona (DELETE ok)', !!(delFailOk.json && delFailOk.json.ok), delFailOk);
  const feedFailOk = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  check('3.3 MongoDB: tras el borrado real, la publicación ya NO sale en el inicio', !!(feedFailOk.json && feedFailOk.json.ok && !feedFailOk.json.posts.some(p => p.id === failPostId)), feedFailOk.json && feedFailOk.json.posts.length);
  const failPostGone = await waitMongoValue(uri, 'posts', v => Array.isArray(v) && !v.some(p => p.id === failPostId));
  check('3.3 MongoDB: tras el borrado real, la publicación ya NO está en MongoDB', !!failPostGone);

  /* Código de verificación que tiene que sobrevivir al reinicio. */
  const rcC = await api(PORT, 'POST', '/api/auth/request-code', { phone: PHONE_C });
  const codeC = rcC.json && rcC.json.devCode;
  check('3.3 MongoDB: se pide un código para C', !!codeC, rcC);
  const authInMongo = await waitMongoValue(uri, 'auth', v => v && v[PHONE_C] && !!v[PHONE_C].codeHash);
  check('3.3 MongoDB: el código de C está guardado en la colección auth de MongoDB', !!authInMongo);

  /* ---- REINICIO del servidor (mismo MongoDB, mismo DATA_DIR) ---- */
  await stopServer(proc);
  /* v3.8: para probar la concesión de la verificación, la cuenta de A
     tiene que tener al menos 7 días: se atrasa su createdAt en MongoDB
     con el servidor parado (si no, la memoria lo pisaría). A ya tiene
     foto, biografía y 5 publicaciones. */
  const mcBack = new MongoClient(uri);
  await mcBack.connect();
  const backRes = await mcBack.db('wordred').collection('profiles').updateOne({ _id: 'data' }, { $set: { ['value.' + PHONE_A + '.createdAt']: Date.now() - 8 * 24 * 60 * 60 * 1000 } });
  await mcBack.close();
  check('3.8 MongoDB: la antigüedad de A se atrasó 8 días en MongoDB (para probar la verificación)', backRes.matchedCount === 1 && backRes.modifiedCount === 1, { matchedCount: backRes.matchedCount, modifiedCount: backRes.modifiedCount });
  proc = startServer(PORT, { MONGODB_URI: uri, DATA_DIR: dataDir });
  health = await waitHealth(PORT);
  check('3.3 MongoDB: tras reiniciar, /api/health sigue diciendo version 4.5 y storage mongodb', !!(health && health.version === '4.5' && health.storage === 'mongodb'), health);

  const feedB2 = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  check('3.3 MongoDB: tras reiniciar, la publicación de A sigue ahí y B la sigue viendo', !!(feedB2.json && feedB2.json.ok && feedB2.json.posts.some(p => p.id === postId)), feedB2.json && feedB2.json.posts.length);
  check('3.3 MongoDB: tras reiniciar, la publicación borrada SIGUE borrada (no resucita)', !!(feedB2.json && feedB2.json.ok && !feedB2.json.posts.some(p => p.id === delPostId)), feedB2.json && feedB2.json.posts.length);
  check('4.1 MongoDB: tras reiniciar, la publicación promocionada sigue con promoted true en el inicio de B', !!(feedB2.json && feedB2.json.ok && feedB2.json.posts.some(p => p.id === promoPostId && p.promoted === true)), feedB2.json && feedB2.json.posts.length);
  const msgsB2 = await api(PORT, 'GET', '/api/messages?phone=' + PHONE_B);
  const allMsgs = (msgsB2.json && msgsB2.json.conversations || []).flatMap(c => c.messages || []);
  check('3.3 MongoDB: tras reiniciar, el mensaje de A a B sigue ahí', allMsgs.some(m => m.id === msgId), allMsgs.length);
  const myViewsAfterRestart = await api(PORT, 'GET', '/api/profile-views/me', null, regA.token);
  check('3.7 MongoDB: tras reiniciar, la visita de B al perfil de A sigue ahí (cantidad 1, último visitante B)', !!(myViewsAfterRestart.json && myViewsAfterRestart.json.ok && myViewsAfterRestart.json.count === 1 && myViewsAfterRestart.json.lastViewer && myViewsAfterRestart.json.lastViewer.phone === PHONE_B), myViewsAfterRestart.json);
  const gListB3 = await api(PORT, 'GET', '/api/group-chats?phone=' + PHONE_B);
  check('3.3 MongoDB: tras reiniciar, el grupo que quedó vivo sigue en la lista de B', !!(gListB3.json && gListB3.json.ok && gListB3.json.groupChats.some(g => g.id === 'gchat-vivo33')), gListB3.json && gListB3.json.groupChats && gListB3.json.groupChats.length);
  const gVivo3 = gListB3.json && gListB3.json.groupChats.find(g => g.id === 'gchat-vivo33');
  check('3.4 MongoDB: tras reiniciar, el mensaje de grupo borrado SIGUE borrado y el de B sigue', !!(gVivo3 && !gVivo3.messages.some(m => m.id === gmV1Id) && gVivo3.messages.some(m => m.id === gmV2Id)), gVivo3 && gVivo3.messages.length);
  const stats2 = await api(PORT, 'GET', '/api/games/stats');
  check('3.3 MongoDB: tras reiniciar, la estadística del juego sigue (1 jugada)', !!(stats2.json && stats2.json.ok && stats2.json.stats && stats2.json.stats.prueba31 && stats2.json.stats.prueba31.plays === 1), stats2.json && stats2.json.stats);
  const verifyC = await api(PORT, 'POST', '/api/auth/verify', { phone: PHONE_C, code: codeC });
  check('3.3 MongoDB: tras reiniciar, el código de C sigue valiendo (se verifica)', !!(verifyC.json && verifyC.json.ok && verifyC.json.token), verifyC);
  const commentB = await api(PORT, 'POST', '/api/posts/' + postId + '/comment', { text: 'Sigo viendo la publicación tras el reinicio' }, regB.token);
  check('3.3 MongoDB: tras reiniciar, la sesión de B sigue valiendo (comenta con su token viejo)', !!(commentB.json && commentB.json.ok), commentB);

  /* ---- persistencia de 3.8 tras el reinicio ---- */
  const svAfterRestart = await api(PORT, 'GET', '/api/story-views/' + storyId, null, regA.token);
  check('3.8 MongoDB: tras reiniciar, la visita a la historia sigue ahí (cantidad 1, visitante B)', !!(svAfterRestart.json && svAfterRestart.json.ok && svAfterRestart.json.count === 1 && svAfterRestart.json.viewers[0].phone === PHONE_B), svAfterRestart.json);
  const statsAfterRestart = await api(PORT, 'GET', '/api/posts/' + postId + '/stats', null, regA.token);
  check('3.8 MongoDB: tras reiniciar, la vista de la publicación sigue ahí (1 vista)', !!(statsAfterRestart.json && statsAfterRestart.json.ok && statsAfterRestart.json.views === 1), statsAfterRestart.json);
  const tourAfterRestart = await api(PORT, 'GET', '/api/tournaments/current', null, regA.token);
  check('3.8 MongoDB: tras reiniciar, el torneo es el mismo (mismo id) y la tabla sigue (A 150, B 80)', !!(tourAfterRestart.json && tourAfterRestart.json.ok && tourAfterRestart.json.tournament.id === tourId && tourAfterRestart.json.tournament.leaderboard.length === 2 && tourAfterRestart.json.tournament.leaderboard[0].score === 150), tourAfterRestart.json && tourAfterRestart.json.tournament);
  const cfAfterRestart = await api(PORT, 'GET', '/api/close-friends', null, regA.token);
  check('3.8 MongoDB: tras reiniciar, la lista de cercanos sigue (B)', !!(cfAfterRestart.json && cfAfterRestart.json.ok && cfAfterRestart.json.closeFriends.some(f => f.phone === PHONE_B)), cfAfterRestart.json);
  const convsAfterRestart = await api(PORT, 'GET', '/api/messages?phone=' + PHONE_A);
  const convABAfter = (convsAfterRestart.json && convsAfterRestart.json.conversations || []).find(c => c.participants.includes(PHONE_B));
  check('3.8 MongoDB: tras reiniciar, el mensaje temporal borrado SIGUE borrado', !!(convABAfter && !convABAfter.messages.some(m => m.id === oldMsgId) && convABAfter.messages.some(m => m.id === newMsgId)), convABAfter && convABAfter.messages.length);
  const pollAfterRestart = await api(PORT, 'GET', '/api/stories', null, regA.token);
  const pollStoryAfter = pollAfterRestart.json && pollAfterRestart.json.stories.find(s => s.id === pollStoryId);
  check('3.8 MongoDB: tras reiniciar, el voto de la encuesta sigue (B, opción 1)', !!(pollStoryAfter && pollStoryAfter.poll && pollStoryAfter.poll.voters && pollStoryAfter.poll.voters.some(v => v.phone === PHONE_B && v.option === 1)), pollStoryAfter && pollStoryAfter.poll);
  /* ---- verificación: concesión real (v3.8, idea 10) ---- */
  const verStatusA = await api(PORT, 'GET', '/api/verification/status', null, regA.token);
  check('3.8 MongoDB: A (foto, biografía, 8 días, 5 publicaciones) cumple TODOS los criterios', !!(verStatusA.json && verStatusA.json.ok && verStatusA.json.verified === false && verStatusA.json.missing.length === 0), verStatusA.json);
  const verReqA = await api(PORT, 'POST', '/api/verification/request', {}, regA.token);
  check('3.8 MongoDB: A pide la verificación y el servidor la CONCEDE (criterios reales)', !!(verReqA.json && verReqA.json.ok === true && verReqA.json.verified === true), verReqA.json);
  const profAVer = await api(PORT, 'GET', '/api/profile/' + PHONE_A);
  check('3.8 MongoDB: el perfil de A ya lleva verified true', !!(profAVer.json && profAVer.json.ok && profAVer.json.profile.verified === true), profAVer.json && profAVer.json.profile);
  const verReqA2 = await api(PORT, 'POST', '/api/verification/request', {}, regA.token);
  check('3.8 MongoDB: pedirla otra vez no la duplica (already true)', !!(verReqA2.json && verReqA2.json.ok === true && verReqA2.json.verified === true && verReqA2.json.already === true), verReqA2.json);
  const feedVer = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  const profAInFeed = feedVer.json && feedVer.json.profiles.find(p => p.phone === PHONE_A);
  check('3.8 MongoDB: la insignia viaja con el perfil en el inicio (verified true)', !!(profAInFeed && profAInFeed.verified === true), profAInFeed);


  /* ---- 4.4: aprobación de promociones por cuenta principal (sin app
     Creador y sin CREATOR_KEY): solo el correo de OWNER_EMAIL decide.
     El token del dueño se siembra en la colección `auth` antes de
     arrancar el servidor con OWNER_EMAIL (como si hubiera entrado con
     Google: su clave de cuenta ES el correo verificado). */
  const OWNER_EMAIL_44 = 'dueno-prueba@wordred.test';
  const OWNER_TOKEN_44 = 'tok-dueno-44-prueba';
  /* El servidor principal NO tiene OWNER_EMAIL: las rutas de dueño
     fallan cerradas con 503, nunca dejan pasar. */
  const pendNoOwner = await api(PORT, 'GET', '/api/promotions/pending');
  check('4.4 dueño: sin OWNER_EMAIL en el servidor, las pendientes responden 503', pendNoOwner.status === 503, pendNoOwner);
  const pendNoOwnerTok = await api(PORT, 'GET', '/api/promotions/pending', null, 'tok-cualquiera');
  check('4.4 dueño: sin OWNER_EMAIL, ni siquiera un token válido abre las pendientes (503)', pendNoOwnerTok.status === 503, pendNoOwnerTok);
  const cfgNoOwner = await api(PORT, 'POST', '/api/creator-config', { order: ['historias'], sizes: { historias: 'm' } });
  check('4.4 dueño: sin OWNER_EMAIL, guardar la config responde 503', cfgNoOwner.status === 503, cfgNoOwner);
  /* Siembra del token del dueño en MongoDB (mismo URI, antes de
     arrancar el servidor con OWNER_EMAIL). */
  {
    const seedClient = new MongoClient(uri);
    await seedClient.connect();
    const authDoc = await seedClient.db('wordred').collection('auth').findOne({ _id: 'data' });
    const authMap = (authDoc && authDoc.value && typeof authDoc.value === 'object') ? authDoc.value : {};
    authMap[OWNER_EMAIL_44] = { token: OWNER_TOKEN_44, tokenAt: Date.now(), verified: true, codeHash: '' };
    await seedClient.db('wordred').collection('auth').updateOne({ _id: 'data' }, { $set: { value: authMap } }, { upsert: true });
    await seedClient.close();
  }
  const dataDir44 = fs.mkdtempSync(path.join(os.tmpdir(), 'wordred-test44-'));
  const PORT3 = 34533;
  const proc3 = startServer(PORT3, { MONGODB_URI: uri, DATA_DIR: dataDir44, OWNER_EMAIL: OWNER_EMAIL_44 });
  const health3 = await waitHealth(PORT3);
  check('4.4 dueño: el servidor con OWNER_EMAIL arranca (health 4.5)', !!(health3 && health3.version === '4.5'), health3);
  const reg44D = await register(PORT3, '526666666666');
  const reg44E = await register(PORT3, '527777777777');
  check('4.4 promociones: dos teléfonos se registran en el servidor del dueño', reg44D.ok && reg44E.ok, { reg44D, reg44E });
  const postD = await api(PORT3, 'POST', '/api/posts', { text: 'Publicación para promocionar (prueba 4.4)' }, reg44D.token);
  const postDId = postD.json && postD.json.post && postD.json.post.id;
  check('4.4 promociones: D crea su publicación', !!(postD.json && postD.json.ok && postDId), postD.json);
  const reqNoTok = await api(PORT3, 'POST', '/api/promotions/request', { postId: postDId, tier: 100 });
  check('4.4 promociones: pedir sin token responde 401', reqNoTok.status === 401, reqNoTok);
  const reqBadPost = await api(PORT3, 'POST', '/api/promotions/request', { postId: 'no-existe', tier: 100 }, reg44D.token);
  check('4.4 promociones: pedir con una publicación que no existe responde 404', reqBadPost.status === 404, reqBadPost);
  const reqBadTier = await api(PORT3, 'POST', '/api/promotions/request', { postId: postDId, tier: 999 }, reg44D.token);
  check('4.4 promociones: pedir con un nivel que no es $50/$100/$200/$500 responde 400', reqBadTier.status === 400, reqBadTier);
  const reqOther = await api(PORT3, 'POST', '/api/promotions/request', { postId: postDId, tier: 100 }, reg44E.token);
  check('4.4 promociones: pedir por una publicación de otra persona responde 403', reqOther.status === 403, reqOther);
  const reqOk = await api(PORT3, 'POST', '/api/promotions/request', { postId: postDId, tier: 100 }, reg44D.token);
  const reqId = reqOk.json && reqOk.json.request && reqOk.json.request.id;
  check('4.4 promociones: el autor pide la verificación y queda pendiente', !!(reqOk.json && reqOk.json.ok && reqId && reqOk.json.request.status === 'pending'), reqOk.json);
  const reqDup = await api(PORT3, 'POST', '/api/promotions/request', { postId: postDId, tier: 100 }, reg44D.token);
  check('4.4 promociones: pedir dos veces por la misma publicación devuelve la misma solicitud (sin duplicar)', !!(reqDup.json && reqDup.json.ok && reqDup.json.request && reqDup.json.request.id === reqId && reqDup.json.deduped === true), reqDup.json);
  const mineD = await api(PORT3, 'GET', '/api/promotions/mine', null, reg44D.token);
  check('4.4 promociones: el autor ve su solicitud en «mías» (pendiente)', !!(mineD.json && mineD.json.ok && mineD.json.requests.some(r => r.id === reqId && r.status === 'pending')), mineD.json);
  /* Autorización por cuenta: sin sesión 401, otra cuenta 403, dueño 200.
     La clave vieja en el encabezado ya no abre nada. */
  const pendNoTok3 = await api(PORT3, 'GET', '/api/promotions/pending');
  check('4.4 dueño: las pendientes sin sesión responden 401', pendNoTok3.status === 401, pendNoTok3);
  const pendOther3 = await api(PORT3, 'GET', '/api/promotions/pending', null, reg44D.token);
  check('4.4 dueño: las pendientes con otra cuenta (teléfono) responden 403', pendOther3.status === 403, pendOther3);
  const pendOldKey3 = await apiHeaders(PORT3, 'GET', '/api/promotions/pending', { 'x-creator-key': 'clave-vieja' });
  check('4.4 dueño: la clave vieja en el encabezado ya no abre las pendientes (401, sin sesión)', pendOldKey3.status === 401, pendOldKey3);
  const pendOk3 = await api(PORT3, 'GET', '/api/promotions/pending', null, OWNER_TOKEN_44);
  check('4.4 dueño: las pendientes con el token de la cuenta principal listan la solicitud', !!(pendOk3.json && pendOk3.json.ok && pendOk3.json.requests.some(r => r.id === reqId)), pendOk3.json);
  const apprNoTok = await api(PORT3, 'POST', '/api/promotions/' + reqId + '/approve');
  check('4.4 dueño: aprobar sin sesión responde 401', apprNoTok.status === 401, apprNoTok);
  const apprOther = await api(PORT3, 'POST', '/api/promotions/' + reqId + '/approve', null, reg44D.token);
  check('4.4 dueño: aprobar con otra cuenta responde 403', apprOther.status === 403, apprOther);
  const apprOk = await api(PORT3, 'POST', '/api/promotions/' + reqId + '/approve', null, OWNER_TOKEN_44);
  check('4.4 dueño: aprobar con la cuenta principal marca la solicitud aprobada', !!(apprOk.json && apprOk.json.ok && apprOk.json.request && apprOk.json.request.status === 'approved'), apprOk.json);
  const feedD = await api(PORT3, 'GET', '/api/feed?phone=526666666666');
  check('4.4 promociones: tras aprobar, la publicación lleva promoted:true en el inicio', !!(feedD.json && feedD.json.ok && feedD.json.posts.some(p => p.id === postDId && p.promoted === true)), feedD.json && feedD.json.posts.length);
  const mineD2 = await api(PORT3, 'GET', '/api/promotions/mine', null, reg44D.token);
  check('4.4 promociones: tras aprobar, el autor ve su solicitud aprobada', !!(mineD2.json && mineD2.json.ok && mineD2.json.requests.some(r => r.id === reqId && r.status === 'approved')), mineD2.json);
  const apprAgain = await api(PORT3, 'POST', '/api/promotions/' + reqId + '/approve', null, OWNER_TOKEN_44);
  check('4.4 dueño: aprobar una solicitud ya decidida responde 400', apprAgain.status === 400, apprAgain);
  /* Rechazo con una segunda publicación. */
  const postE = await api(PORT3, 'POST', '/api/posts', { text: 'Publicación para rechazar (prueba 4.4)' }, reg44E.token);
  const postEId = postE.json && postE.json.post && postE.json.post.id;
  const reqE = await api(PORT3, 'POST', '/api/promotions/request', { postId: postEId, tier: 50 }, reg44E.token);
  const reqEId = reqE.json && reqE.json.request && reqE.json.request.id;
  check('4.4 promociones: E pide la verificación de su publicación', !!(reqE.json && reqE.json.ok && reqEId), reqE.json);
  const rejOther = await api(PORT3, 'POST', '/api/promotions/' + reqEId + '/reject', null, reg44E.token);
  check('4.4 dueño: rechazar con otra cuenta responde 403', rejOther.status === 403, rejOther);
  const rejOk = await api(PORT3, 'POST', '/api/promotions/' + reqEId + '/reject', null, OWNER_TOKEN_44);
  check('4.4 dueño: rechazar con la cuenta principal marca la solicitud rechazada', !!(rejOk.json && rejOk.json.ok && rejOk.json.request && rejOk.json.request.status === 'rejected'), rejOk.json);
  const feedE = await api(PORT3, 'GET', '/api/feed?phone=527777777777');
  check('4.4 promociones: tras rechazar, la publicación sigue sin promocionar', !!(feedE.json && feedE.json.ok && feedE.json.posts.some(p => p.id === postEId && p.promoted !== true)), feedE.json && feedE.json.posts.length);
  /* Config global: solo la cuenta principal. */
  const cfgGetNone = await api(PORT3, 'GET', '/api/creator-config');
  check('4.4 config: sin config guardada, leer responde 404', cfgGetNone.status === 404, cfgGetNone);
  const cfgPostNoTok = await api(PORT3, 'POST', '/api/creator-config', { order: ['historias', 'publicar'], sizes: { historias: 'm', publicar: 'm' } });
  check('4.4 config: guardar sin sesión responde 401', cfgPostNoTok.status === 401, cfgPostNoTok);
  const cfgPostOther = await api(PORT3, 'POST', '/api/creator-config', { order: ['historias', 'publicar'], sizes: { historias: 'm', publicar: 'm' } }, reg44D.token);
  check('4.4 config: guardar con otra cuenta responde 403', cfgPostOther.status === 403, cfgPostOther);
  const cfgPostBad = await api(PORT3, 'POST', '/api/creator-config', { order: ['historias', 'noexiste'], sizes: { historias: 'm', noexiste: 'm' } }, OWNER_TOKEN_44);
  check('4.4 config: guardar un orden con apartados desconocidos responde 400', cfgPostBad.status === 400, cfgPostBad);
  const cfgValid = { order: ['historias', 'publicar', 'clima', 'reloj', 'accesos'], sizes: { historias: 'm', publicar: 'm', clima: 's', reloj: 'l', accesos: 'm' } };
  const cfgPostOk = await api(PORT3, 'POST', '/api/creator-config', cfgValid, OWNER_TOKEN_44);
  check('4.4 config: guardar una config válida con la cuenta principal responde ok', !!(cfgPostOk.json && cfgPostOk.json.ok), cfgPostOk.json);
  const cfgGet = await api(PORT3, 'GET', '/api/creator-config');
  check('4.4 config: leer devuelve el orden y los tamaños guardados', !!(cfgGet.json && cfgGet.json.ok && cfgGet.json.config && cfgGet.json.config.order.join(',') === cfgValid.order.join(',') && cfgGet.json.config.sizes.reloj === 'l'), cfgGet.json);
  const cfgReset = await api(PORT3, 'POST', '/api/creator-config', { reset: true }, OWNER_TOKEN_44);
  check('4.4 config: restablecer con la cuenta principal responde ok', !!(cfgReset.json && cfgReset.json.ok), cfgReset.json);
  const cfgGetAfter = await api(PORT3, 'GET', '/api/creator-config');
  check('4.4 config: tras restablecer, leer vuelve a responder 404', cfgGetAfter.status === 404, cfgGetAfter);
  await stopServer(proc3);

  /* Las colecciones que usa MongoDB existen. */
  const mc = new MongoClient(uri);
  await mc.connect();
  const collNames = (await mc.db('wordred').listCollections().toArray()).map(c => c.name).sort();
  await mc.close();
  const expected = ['audioRooms', 'auth', 'blocked', 'closeFriends', 'conversationSettings', 'coupons', 'events', 'friends', 'gameRatings', 'gameStats', 'groupChats', 'groups', 'listings', 'liveGifts', 'lives', 'media', 'messages', 'muted', 'notifications', 'pages', 'posts', 'postViews', 'postVotes', 'profileViews', 'profiles', 'ratings', 'reports', 'requests', 'salesGroups', 'stories', 'storyPollVotes', 'storyReactions', 'storyViews', 'tournaments', 'wishlists', 'promotion_requests', 'creator_config'];
  check('4.4 MongoDB: existen las 37 colecciones (una por conjunto de datos, con las 2 de la 4.3)', expected.every(c => collNames.includes(c)), collNames);
  await stopServer(proc);

  /* ---- modo respaldo JSON (sin MONGODB_URI) ---- */
  const jsonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordred-test31-json-'));
  const PORT2 = 34532;
  const proc2 = startServer(PORT2, { DATA_DIR: jsonDir });
  const health2 = await waitHealth(PORT2);
  check('3.7 JSON: sin MONGODB_URI, /api/health dice version 4.5, storage json y mongo false', !!(health2 && health2.version === '4.5' && health2.storage === 'json' && health2.mongo === false), health2);
  const regJ = await register(PORT2, '524444444444');
  check('3.3 JSON: el registro sigue funcionando sin MongoDB', regJ.ok, regJ);
  const postJ = await api(PORT2, 'POST', '/api/posts', { text: 'Publicación en modo JSON' }, regJ.token);
  check('3.3 JSON: la publicación se crea sin MongoDB', !!(postJ.json && postJ.json.ok), postJ);
  const feedJ = await api(PORT2, 'GET', '/api/feed?phone=524444444444');
  check('3.3 JSON: la publicación se ve en el inicio sin MongoDB', !!(feedJ.json && feedJ.json.ok && feedJ.json.posts.some(p => p.id === (postJ.json && postJ.json.post && postJ.json.post.id))), feedJ.json && feedJ.json.posts.length);
  const postJPromo = await api(PORT2, 'POST', '/api/posts', { text: 'Publicación promocionada en modo JSON', promoted: true }, regJ.token);
  const postJPromoId = postJPromo.json && postJPromo.json.post && postJPromo.json.post.id;
  check('4.1 JSON: crear con promoted:true en modo JSON la devuelve con promoted true', !!(postJPromo.json && postJPromo.json.ok && postJPromoId && postJPromo.json.post.promoted === true), postJPromo.json && postJPromo.json.post);
  const feedJPromo = await api(PORT2, 'GET', '/api/feed?phone=524444444444');
  check('4.1 JSON: la publicación promocionada se ve con promoted true en el inicio sin MongoDB', !!(feedJPromo.json && feedJPromo.json.ok && feedJPromo.json.posts.some(p => p.id === postJPromoId && p.promoted === true)), feedJPromo.json && feedJPromo.json.posts.length);
  check('3.3 JSON: sin MongoDB, los datos quedan en archivos JSON en disco', fs.existsSync(path.join(jsonDir, 'posts.json')) && fs.existsSync(path.join(jsonDir, 'auth.json')));
  /* Visitas al perfil en modo JSON (v3.7): mismo comportamiento con el
     respaldo en profile-views.json. */
  const regJ2 = await register(PORT2, '525555555555');
  check('3.7 JSON: el segundo usuario se registra sin MongoDB', regJ2.ok, regJ2);
  const profJ = await api(PORT2, 'POST', '/api/profile', { name: 'Julia (prueba JSON)' }, regJ.token);
  check('3.7 JSON: el perfil de J se crea sin MongoDB', !!(profJ.json && profJ.json.ok), profJ);
  const profJ2 = await api(PORT2, 'POST', '/api/profile', { name: 'Karen (prueba JSON)' }, regJ2.token);
  check('3.7 JSON: el perfil de K se crea sin MongoDB', !!(profJ2.json && profJ2.json.ok), profJ2);
  const viewJ = await api(PORT2, 'POST', '/api/profile-views', { viewedPhone: '524444444444' }, regJ2.token);
  check('3.7 JSON: K ve el perfil de J sin MongoDB (visita registrada)', !!(viewJ.json && viewJ.json.ok && viewJ.json.recorded === true && viewJ.json.count === 1), viewJ.json);
  const myViewsJ = await api(PORT2, 'GET', '/api/profile-views/me', null, regJ.token);
  check('3.7 JSON: J lee su visita sin MongoDB (cantidad 1, última visitante K)', !!(myViewsJ.json && myViewsJ.json.ok && myViewsJ.json.count === 1 && myViewsJ.json.lastViewer && myViewsJ.json.lastViewer.phone === '525555555555'), myViewsJ.json);
  check('3.7 JSON: sin MongoDB, la visita queda en profile-views.json en disco', fs.existsSync(path.join(jsonDir, 'profile-views.json')));
  await stopServer(proc2);

  await mongod.stop();
  console.log('\n==============================');
  console.log('Servidor WordRed 4.5 — ' + pass + ' PASS, ' + fail + ' FAIL');
  if (fail) { console.log('Fallos: ' + failures.join(' | ')); process.exit(1); }
})().catch((e) => {
  console.error('ERROR en las pruebas: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
