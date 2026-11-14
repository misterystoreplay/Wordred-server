'use strict';
/* Pruebas del servidor WordRed 3.2 — los datos quedan PARA SIEMPRE en
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
  check('3.2 MongoDB: /api/health dice version 3.2', !!(health && health.version === '3.2'), health);
  check('3.2 MongoDB: /api/health dice storage mongodb y mongo true', !!(health && health.storage === 'mongodb' && health.mongo === true), health);

  const regA = await register(PORT, PHONE_A);
  check('3.2 MongoDB: el usuario A se registra (código + verificación)', regA.ok, regA);
  const regB = await register(PORT, PHONE_B);
  check('3.2 MongoDB: el usuario B se registra (código + verificación)', regB.ok, regB);
  const profA = await api(PORT, 'POST', '/api/profile', { name: 'Ana (prueba)' }, regA.token);
  check('3.2 MongoDB: el perfil de A se crea', !!(profA.json && profA.json.ok), profA);
  const profB = await api(PORT, 'POST', '/api/profile', { name: 'Beto (prueba)' }, regB.token);
  check('3.2 MongoDB: el perfil de B se crea', !!(profB.json && profB.json.ok), profB);

  const postRes = await api(PORT, 'POST', '/api/posts', { text: 'Publicación que tiene que sobrevivir al reinicio' }, regA.token);
  const postId = postRes.json && postRes.json.post && postRes.json.post.id;
  check('3.2 MongoDB: A crea una publicación', !!(postRes.json && postRes.json.ok && postId), postRes);
  const feedB = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  check('3.2 MongoDB: la publicación de A la ve otro usuario (B) en su inicio', !!(feedB.json && feedB.json.ok && feedB.json.posts.some(p => p.id === postId)), feedB.json && feedB.json.posts.length);

  /* ---- DELETE /api/posts/:id (v3.2): el borrado llega al servidor ----
     Antes no existía este endpoint: la app solo quitaba la publicación
     de su copia local y al reabrir la cuenta reaparecía, porque el
     inicio se carga desde el servidor. */
  const delPostRes = await api(PORT, 'POST', '/api/posts', { text: 'Publicación para borrar (prueba 3.2)' }, regA.token);
  const delPostId = delPostRes.json && delPostRes.json.post && delPostRes.json.post.id;
  check('3.2 MongoDB: A crea la publicación que se va a borrar', !!(delPostRes.json && delPostRes.json.ok && delPostId), delPostRes);
  const delNoAuth = await api(PORT, 'DELETE', '/api/posts/' + delPostId, null, null);
  check('3.2 MongoDB: borrar sin sesión da 401', delNoAuth.status === 401, delNoAuth);
  const delOther = await api(PORT, 'DELETE', '/api/posts/' + delPostId, null, regB.token);
  check('3.2 MongoDB: borrar la publicación de otro da 403', delOther.status === 403, delOther);
  const delMissing = await api(PORT, 'DELETE', '/api/posts/no-existe-123', null, regA.token);
  check('3.2 MongoDB: borrar una publicación que no existe da 404', delMissing.status === 404, delMissing);
  const feedBBefore = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  check('3.2 MongoDB: antes de borrar, B ve la publicación en su inicio', !!(feedBBefore.json && feedBBefore.json.ok && feedBBefore.json.posts.some(p => p.id === delPostId)), feedBBefore.json && feedBBefore.json.posts.length);
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
  check('3.2 MongoDB: el autor borra su publicación (DELETE ok)', !!(delOk.json && delOk.json.ok), delOk);
  check('3.2 MongoDB: al borrar llega postDeleted por WebSocket al otro usuario', await wsDeleted);
  try { wsB.close(); } catch (e) {}
  const feedBAfter = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  check('3.2 MongoDB: tras borrar, la publicación ya NO sale en el inicio de B', !!(feedBAfter.json && feedBAfter.json.ok && !feedBAfter.json.posts.some(p => p.id === delPostId)), feedBAfter.json && feedBAfter.json.posts.length);
  const postsAfterDel = await waitMongoValue(uri, 'posts', v => Array.isArray(v) && !v.some(p => p.id === delPostId));
  check('3.2 MongoDB: tras borrar, la publicación ya NO está en la colección posts de MongoDB', !!postsAfterDel);
  const delAgain = await api(PORT, 'DELETE', '/api/posts/' + delPostId, null, regA.token);
  check('3.2 MongoDB: borrar dos veces la misma publicación da 404', delAgain.status === 404, delAgain);

  const msgRes = await api(PORT, 'POST', '/api/messages', { to: PHONE_B, text: 'Hola Beto, mensaje que tiene que sobrevivir' }, regA.token);
  const msgId = msgRes.json && msgRes.json.message && msgRes.json.message.id;
  check('3.2 MongoDB: A manda un mensaje a B', !!(msgRes.json && msgRes.json.ok && msgId), msgRes);

  const playRes = await api(PORT, 'POST', '/api/games/prueba31/play', {}, regA.token);
  check('3.2 MongoDB: A juega (estadística de juego)', !!(playRes.json && playRes.json.ok && playRes.json.stats && playRes.json.stats.plays === 1), playRes);

  /* La publicación, el mensaje y el juego tienen que estar YA en
     MongoDB (no solo en la memoria del proceso) antes de reiniciar. */
  const postsInMongo = await waitMongoValue(uri, 'posts', v => Array.isArray(v) && v.some(p => p.id === postId));
  check('3.2 MongoDB: la publicación está guardada en la colección posts de MongoDB', !!postsInMongo);
  const msgsInMongo = await waitMongoValue(uri, 'messages', v => Array.isArray(v) && v.some(m => m.id === msgId));
  check('3.2 MongoDB: el mensaje está guardado en la colección messages de MongoDB', !!msgsInMongo);
  const gamesInMongo = await waitMongoValue(uri, 'gameStats', v => v && v.plays && v.plays.prueba31 === 1);
  check('3.2 MongoDB: la estadística está guardada en la colección gameStats de MongoDB', !!gamesInMongo);

  /* Código de verificación que tiene que sobrevivir al reinicio. */
  const rcC = await api(PORT, 'POST', '/api/auth/request-code', { phone: PHONE_C });
  const codeC = rcC.json && rcC.json.devCode;
  check('3.2 MongoDB: se pide un código para C', !!codeC, rcC);
  const authInMongo = await waitMongoValue(uri, 'auth', v => v && v[PHONE_C] && !!v[PHONE_C].codeHash);
  check('3.2 MongoDB: el código de C está guardado en la colección auth de MongoDB', !!authInMongo);

  /* ---- REINICIO del servidor (mismo MongoDB, mismo DATA_DIR) ---- */
  await stopServer(proc);
  proc = startServer(PORT, { MONGODB_URI: uri, DATA_DIR: dataDir });
  health = await waitHealth(PORT);
  check('3.2 MongoDB: tras reiniciar, /api/health sigue diciendo version 3.2 y storage mongodb', !!(health && health.version === '3.2' && health.storage === 'mongodb'), health);

  const feedB2 = await api(PORT, 'GET', '/api/feed?phone=' + PHONE_B);
  check('3.2 MongoDB: tras reiniciar, la publicación de A sigue ahí y B la sigue viendo', !!(feedB2.json && feedB2.json.ok && feedB2.json.posts.some(p => p.id === postId)), feedB2.json && feedB2.json.posts.length);
  check('3.2 MongoDB: tras reiniciar, la publicación borrada SIGUE borrada (no resucita)', !!(feedB2.json && feedB2.json.ok && !feedB2.json.posts.some(p => p.id === delPostId)), feedB2.json && feedB2.json.posts.length);
  const msgsB2 = await api(PORT, 'GET', '/api/messages?phone=' + PHONE_B);
  const allMsgs = (msgsB2.json && msgsB2.json.conversations || []).flatMap(c => c.messages || []);
  check('3.2 MongoDB: tras reiniciar, el mensaje de A a B sigue ahí', allMsgs.some(m => m.id === msgId), allMsgs.length);
  const stats2 = await api(PORT, 'GET', '/api/games/stats');
  check('3.2 MongoDB: tras reiniciar, la estadística del juego sigue (1 jugada)', !!(stats2.json && stats2.json.ok && stats2.json.stats && stats2.json.stats.prueba31 && stats2.json.stats.prueba31.plays === 1), stats2.json && stats2.json.stats);
  const verifyC = await api(PORT, 'POST', '/api/auth/verify', { phone: PHONE_C, code: codeC });
  check('3.2 MongoDB: tras reiniciar, el código de C sigue valiendo (se verifica)', !!(verifyC.json && verifyC.json.ok && verifyC.json.token), verifyC);
  const commentB = await api(PORT, 'POST', '/api/posts/' + postId + '/comment', { text: 'Sigo viendo la publicación tras el reinicio' }, regB.token);
  check('3.2 MongoDB: tras reiniciar, la sesión de B sigue valiendo (comenta con su token viejo)', !!(commentB.json && commentB.json.ok), commentB);

  /* Las colecciones que usa MongoDB existen. */
  const mc = new MongoClient(uri);
  await mc.connect();
  const collNames = (await mc.db('wordred').listCollections().toArray()).map(c => c.name).sort();
  await mc.close();
  const expected = ['auth', 'blocked', 'events', 'friends', 'gameRatings', 'gameStats', 'groups', 'listings', 'lives', 'media', 'messages', 'notifications', 'pages', 'posts', 'profiles', 'ratings', 'reports', 'requests', 'salesGroups', 'stories'];
  check('3.2 MongoDB: existen las 20 colecciones (una por conjunto de datos)', expected.every(c => collNames.includes(c)), collNames);
  await stopServer(proc);

  /* ---- modo respaldo JSON (sin MONGODB_URI) ---- */
  const jsonDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wordred-test31-json-'));
  const PORT2 = 34532;
  const proc2 = startServer(PORT2, { DATA_DIR: jsonDir });
  const health2 = await waitHealth(PORT2);
  check('3.2 JSON: sin MONGODB_URI, /api/health dice version 3.2, storage json y mongo false', !!(health2 && health2.version === '3.2' && health2.storage === 'json' && health2.mongo === false), health2);
  const regJ = await register(PORT2, '524444444444');
  check('3.2 JSON: el registro sigue funcionando sin MongoDB', regJ.ok, regJ);
  const postJ = await api(PORT2, 'POST', '/api/posts', { text: 'Publicación en modo JSON' }, regJ.token);
  check('3.2 JSON: la publicación se crea sin MongoDB', !!(postJ.json && postJ.json.ok), postJ);
  const feedJ = await api(PORT2, 'GET', '/api/feed?phone=524444444444');
  check('3.2 JSON: la publicación se ve en el inicio sin MongoDB', !!(feedJ.json && feedJ.json.ok && feedJ.json.posts.some(p => p.id === (postJ.json && postJ.json.post && postJ.json.post.id))), feedJ.json && feedJ.json.posts.length);
  check('3.2 JSON: sin MongoDB, los datos quedan en archivos JSON en disco', fs.existsSync(path.join(jsonDir, 'posts.json')) && fs.existsSync(path.join(jsonDir, 'auth.json')));
  await stopServer(proc2);

  await mongod.stop();
  console.log('\n==============================');
  console.log('Servidor WordRed 3.2 — ' + pass + ' PASS, ' + fail + ' FAIL');
  if (fail) { console.log('Fallos: ' + failures.join(' | ')); process.exit(1); }
})().catch((e) => {
  console.error('ERROR en las pruebas: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
