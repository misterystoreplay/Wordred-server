'use strict';
/* Pruebas del servidor WordRed 3.7 — los datos quedan PARA SIEMPRE en
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
  check('3.7 MongoDB: /api/health dice version 3.7', !!(health && health.version === '3.7'), health);
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
  check('3.7 MongoDB: con las escrituras rotas, el servidor arranca y /api/health sigue diciendo 3.7', !!(health && health.version === '3.7' && health.storage === 'mongodb'), health);
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
  check('3.3 MongoDB: con las escrituras sanas de nuevo, el servidor arranca', !!(health && health.version === '3.7'), health);
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
  proc = startServer(PORT, { MONGODB_URI: uri, DATA_DIR: dataDir });
  health = await waitHealth(PORT);
  check('3.3 MongoDB: tras reiniciar, /api/health sigue diciendo version 3.7 y storage mongodb', !!(health && health.version === '3.7' && health.storage === 'mongodb'), health);

  const feedB2 = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  check('3.3 MongoDB: tras reiniciar, la publicación de A sigue ahí y B la sigue viendo', !!(feedB2.json && feedB2.json.ok && feedB2.json.posts.some(p => p.id === postId)), feedB2.json && feedB2.json.posts.length);
  check('3.3 MongoDB: tras reiniciar, la publicación borrada SIGUE borrada (no resucita)', !!(feedB2.json && feedB2.json.ok && !feedB2.json.posts.some(p => p.id === delPostId)), feedB2.json && feedB2.json.posts.length);
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

  /* Las colecciones que usa MongoDB existen. */
  const mc = new MongoClient(uri);
  await mc.connect();
  const collNames = (await mc.db('wordred').listCollections().toArray()).map(c => c.name).sort();
  await mc.close();
  const expected = ['auth', 'blocked', 'events', 'friends', 'gameRatings', 'gameStats', 'groupChats', 'groups', 'listings', 'lives', 'media', 'messages', 'notifications', 'pages', 'posts', 'profileViews', 'profiles', 'ratings', 'reports', 'requests', 'salesGroups', 'stories'];
  check('3.3 MongoDB: existen las 22 colecciones (una por conjunto de datos)', expected.every(c => collNames.includes(c)), collNames);
  await stopServer(proc);

  /* ---- modo respaldo JSON (sin MONGODB_URI) ---- */
  const jsonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordred-test31-json-'));
  const PORT2 = 34532;
  const proc2 = startServer(PORT2, { DATA_DIR: jsonDir });
  const health2 = await waitHealth(PORT2);
  check('3.7 JSON: sin MONGODB_URI, /api/health dice version 3.7, storage json y mongo false', !!(health2 && health2.version === '3.7' && health2.storage === 'json' && health2.mongo === false), health2);
  const regJ = await register(PORT2, '524444444444');
  check('3.3 JSON: el registro sigue funcionando sin MongoDB', regJ.ok, regJ);
  const postJ = await api(PORT2, 'POST', '/api/posts', { text: 'Publicación en modo JSON' }, regJ.token);
  check('3.3 JSON: la publicación se crea sin MongoDB', !!(postJ.json && postJ.json.ok), postJ);
  const feedJ = await api(PORT2, 'GET', '/api/feed?phone=524444444444');
  check('3.3 JSON: la publicación se ve en el inicio sin MongoDB', !!(feedJ.json && feedJ.json.ok && feedJ.json.posts.some(p => p.id === (postJ.json && postJ.json.post && postJ.json.post.id))), feedJ.json && feedJ.json.posts.length);
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
  console.log('Servidor WordRed 3.7 — ' + pass + ' PASS, ' + fail + ' FAIL');
  if (fail) { console.log('Fallos: ' + failures.join(' | ')); process.exit(1); }
})().catch((e) => {
  console.error('ERROR en las pruebas: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
