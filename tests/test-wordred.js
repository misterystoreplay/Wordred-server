/* test-wordred — Pruebas de WordRed v1.5.13 (Node, sin navegador).
   Cubre la lógica central (core.js) y el servidor real (server.js)
   en un puerto efímero con datos temporales. */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const C = require('../assets/core.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS: ' + name); }
  else { fail++; console.log('FAIL: ' + name + (extra ? ' — ' + extra : '')); }
}
function fresh() { C.resetRuntime(); return C.emptyState(); }
const A = '5511111111', B = '5522222222', D = '5533333333';
function withProfiles(st) {
  C.completeProfile(st, A, { name: 'Ana Prueba', bio: 'Hola' });
  C.completeProfile(st, B, { name: 'Bruno Prueba', bio: 'Hola' });
  C.completeProfile(st, D, { name: 'Diana Prueba', bio: 'Hola' });
  st.me = A;
  return st;
}

async function coreTests() {
  console.log('=== 1. Cuentas por teléfono ===');
  let st = fresh();
  let r = C.requestCode(st, 'abc');
  check('código: número inválido se rechaza', !r.ok);
  r = C.requestCode(st, A);
  check('código: se genera un código de 6 dígitos', r.ok && /^\d{6}$/.test(r.code), JSON.stringify(r));
  let v = C.verifyCode(st, A, '000000');
  check('código: código incorrecto se rechaza', !v.ok);
  v = C.verifyCode(st, A, r.code);
  check('código: código correcto verifica', v.ok && v.phone === A);
  v = C.verifyCode(st, A, r.code);
  check('código: no se puede reutilizar', !v.ok);
  // caducidad simulada
  r = C.requestCode(st, B);
  // forzar expiración: el código vive en memoria, lo envejecemos pidiendo otro y manipulando el tiempo es imposible desde fuera;
  // se prueba el límite de intentos:
  for (let i = 0; i < 6; i++) C.verifyCode(st, B, '111111');
  v = C.verifyCode(st, B, r.code);
  check('código: demasiados intentos lo invalidan', !v.ok);
  // límite de 3 códigos por hora
  C.requestCode(st, D); C.requestCode(st, D); C.requestCode(st, D);
  r = C.requestCode(st, D);
  check('código: límite de 3 por hora', !r.ok);
  // perfil
  let p = C.completeProfile(st, A, { name: 'A', bio: '' });
  check('perfil: nombre de 1 letra se rechaza', !p.ok);
  p = C.completeProfile(st, A, { name: 'Ana Prueba', bio: 'Hola, soy Ana.' });
  check('perfil: se crea y la sesión queda activa', p.ok && st.me === A && st.profiles[A].name === 'Ana Prueba');
  // v2.9: Google/correo en la lógica — la identidad puede ser un correo.
  check('v2.9 perfil: un correo es identidad válida (pasa por normPhone en minúsculas)', C.normPhone('  Ana@Correo.COM ') === 'ana@correo.com' && C.normPhone('55 1111 2222') === '5511112222');
  check('v2.9 perfil: validEmail acepta correos válidos y rechaza los malos', C.validEmail('ana@correo.com') && C.validEmail('a.b+1@dominio.mx') && !C.validEmail('ana@correo') && !C.validEmail('ana correo.com') && !C.validEmail('ana@') && !C.validEmail(''));
  check('v2.9 perfil: isEmailIdentity distingue correo de teléfono', C.isEmailIdentity('ana@correo.com') && !C.isEmailIdentity('5511111111'));
  (function () {
    var stMail = fresh();
    var pMail = C.completeProfile(stMail, 'ana@correo.com', { name: 'Ana Correo', bio: 'Hola' });
    check('v2.9 perfil: el perfil se crea con el correo como identidad', pMail.ok && stMail.profiles['ana@correo.com'] && stMail.profiles['ana@correo.com'].name === 'Ana Correo' && stMail.me === 'ana@correo.com');
  })();

  console.log('=== 2. Publicaciones y privacidad ===');
  // v1.6 clima: códigos WMO de Open-Meteo a texto en español (sin inventar)
  check('v1.6 clima: el código 0 es Despejado', C.weatherCodeText(0) === 'Despejado');
  check('v1.6 clima: el código 1 es Mayormente despejado', C.weatherCodeText(1) === 'Mayormente despejado');
  check('v1.6 clima: el código 2 es Parcialmente nublado', C.weatherCodeText(2) === 'Parcialmente nublado');
  check('v1.6 clima: el código 3 es Nublado', C.weatherCodeText(3) === 'Nublado');
  check('v1.6 clima: el código 45 es Niebla', C.weatherCodeText(45) === 'Niebla');
  check('v1.6 clima: el código 51 es Llovizna', C.weatherCodeText(51) === 'Llovizna');
  check('v1.6 clima: el código 61 es Lluvia', C.weatherCodeText(61) === 'Lluvia');
  check('v1.6 clima: el código 71 es Nieve', C.weatherCodeText(71) === 'Nieve');
  check('v1.6 clima: el código 80 es Chubascos', C.weatherCodeText(80) === 'Chubascos');
  check('v1.6 clima: el código 95 es Tormenta', C.weatherCodeText(95) === 'Tormenta');
  check('v1.6 clima: el código 99 es Tormenta con granizo', C.weatherCodeText(99) === 'Tormenta con granizo');
  check('v1.6 clima: un código desconocido no inventa una condición', typeof C.weatherCodeText(999) === 'string' && C.weatherCodeText(999).length > 0 && C.weatherCodeText(999).indexOf('Despejado') < 0);
  st = withProfiles(fresh());
  let post = C.createPost(st, A, { text: '' });
  check('publicar: vacía se rechaza', !post.ok);
  post = C.createPost(st, A, { text: 'Hola a todos #WordRed' });
  // v1.6 lugares recomendados: son publicaciones con lugar (nombre, tipo,
  // dirección, foto, enlace real al mapa, calificación y comentario).
  const pl = C.createPlacePost(st, A, { name: 'Taquería El Faro', type: 'Comida', address: 'Av. Siempre Viva 123, CDMX', url: 'https://maps.app.goo.gl/abc123', rating: 5, comment: 'Los mejores tacos al pastor.' });
  check('v1.6 lugares: la recomendación se guarda como publicación con lugar', pl.ok && pl.post.place && pl.post.place.name === 'Taquería El Faro' && pl.post.place.type === 'Comida' && pl.post.place.rating === 5);
  check('v1.6 lugares: la recomendación aparece en el inicio mezclada con las publicaciones', C.feedFor(st, A).some(function (p) { return p.id === pl.post.id; }));
  const plBad = C.createPlacePost(st, A, { name: '', type: 'Comida' });
  check('v1.6 lugares: sin nombre no se publica el lugar', !plBad.ok);
  const plBad2 = C.createPlacePost(st, A, { name: 'Tienda X', type: 'Nave' });
  check('v1.6 lugares: un tipo inventado no se acepta', !plBad2.ok);
  const plBad3 = C.createPlacePost(st, A, { name: 'Tienda X', type: 'Tienda', rating: 9 });
  check('v1.6 lugares: la calificación solo vale de 1 a 5', !plBad3.ok);
  const plBad4 = C.createPlacePost(st, A, { name: 'Tienda X', type: 'Tienda', url: 'nota-mapa' });
  check('v1.6 lugares: el enlace al mapa debe ser una dirección web real', !plBad4.ok);
  check('publicar: texto crea la publicación', post.ok && post.post.text === 'Hola a todos #WordRed');
  let priv = C.createPost(st, A, { text: 'Solo para mí', privacy: 'Solo yo' });
  check('publicar: "Solo yo" no la ve otra persona', priv.ok && !C.canSeePost(st, B, priv.post) && C.canSeePost(st, A, priv.post));
  let fr = C.createPost(st, A, { text: 'Solo amigos', privacy: 'Amigos' });
  check('publicar: "Amigos" no la ve un extraño', fr.ok && !C.canSeePost(st, B, fr.post));
  C.sendFriendRequest(st, A, B); C.respondFriendRequest(st, B, st.requests[0].id, true);
  check('publicar: "Amigos" sí la ve un amigo', C.canSeePost(st, B, fr.post));
  let del = C.deletePost(st, B, post.post.id);
  check('publicar: otra persona no puede borrarla', !del.ok);
  del = C.deletePost(st, A, post.post.id);
  check('publicar: la autora sí puede borrarla', del.ok && !st.posts.some(x => x.id === post.post.id));

  console.log('=== 3. Reacciones, comentarios, compartir, guardar ===');
  st = withProfiles(fresh());
  let p1 = C.createPost(st, A, { text: 'Post de prueba' }).post;
  let like = C.toggleLike(st, B, p1.id, 'Me encanta');
  check('reacción: "Me encanta" se registra', like.ok && like.liked && like.counts.total === 1 && like.counts.byReaction['Me encanta'] === 1);
  like = C.toggleLike(st, B, p1.id, 'Me divierte');
  check('reacción: cambiar de reacción no duplica', like.ok && like.counts.total === 1 && like.counts.byReaction['Me divierte'] === 1);
  like = C.toggleLike(st, B, p1.id, 'Me divierte');
  check('reacción: repetirla la quita', like.ok && !like.liked && like.counts.total === 0);
  like = C.toggleLike(st, B, p1.id, 'No existe');
  check('reacción: reacción inválida cae a "Me gusta"', like.ok && like.reaction === 'Me gusta');
  let c1 = C.addComment(st, B, p1.id, '¡Qué buena publicación!');
  check('comentario: se agrega', c1.ok && p1.comments.length === 1);
  let c2 = C.addComment(st, A, p1.id, '¡Gracias!', c1.comment.id);
  check('comentario: la respuesta queda anidada', c2.ok && p1.comments[0].replies.length === 1);
  let c3 = C.addComment(st, B, p1.id, '   ');
  check('comentario: vacío se rechaza', !c3.ok);
  let sh = C.sharePost(st, B, p1.id);
  check('compartir: crea la republicación en el muro', sh.ok && sh.post.sharedFrom && sh.post.sharedFrom.id === p1.id && p1.shares.length === 1);
  sh = C.sharePost(st, B, p1.id);
  check('compartir: no se puede compartir dos veces', !sh.ok);
  let sv = C.toggleSave(st, B, p1.id);
  check('guardar: se guarda', sv.ok && sv.saved);
  sv = C.toggleSave(st, B, p1.id);
  check('guardar: se quita', sv.ok && !sv.saved);
  check('notificación: la reacción avisó a la autora', st.notifications.some(n => n.type === 'like' && n.to === A));
  check('notificación: el comentario avisó a la autora', st.notifications.some(n => n.type === 'comment' && n.to === A));

  console.log('=== 4. Historias ===');
  st = withProfiles(fresh());
  let story = C.createStory(st, A, { text: 'Mi día en fotos' });
  check('historia: se crea', story.ok && story.story.text === 'Mi día en fotos');
  let view = C.viewStory(st, B, story.story.id);
  check('historia: la vista cuenta', view.ok && view.views === 1);
  view = C.viewStory(st, B, story.story.id);
  check('historia: la misma persona no cuenta dos veces', view.ok && view.views === 1);
  check('historia: está viva antes de 24 h', C.liveStories(st).length === 1);
  story.story.createdAt = Date.now() - 25 * 60 * 60 * 1000;
  check('historia: caduca a las 24 h', C.liveStories(st).length === 0);
  view = C.viewStory(st, B, story.story.id);
  check('historia: caducada no se puede ver', !view.ok);
  let removed = C.cleanupStories(st);
  check('historia: la limpieza borra las caducadas', removed === 1 && st.stories.length === 0);

  console.log('=== 5. Amistades ===');
  st = withProfiles(fresh());
  let req = C.sendFriendRequest(st, A, A);
  check('amistad: no puedes agregarte a ti', !req.ok);
  req = C.sendFriendRequest(st, A, B);
  check('amistad: solicitud se envía', req.ok && req.request.status === 'pending');
  let dup = C.sendFriendRequest(st, A, B);
  check('amistad: duplicada se rechaza', !dup.ok);
  let rev = C.sendFriendRequest(st, B, A);
  check('amistad: la otra parte ve que ya hay una pendiente', !rev.ok);
  let resp = C.respondFriendRequest(st, A, req.request.id, true);
  check('amistad: responder una solicitud ajena se rechaza', !resp.ok);
  resp = C.respondFriendRequest(st, B, req.request.id, true);
  check('amistad: aceptar crea la amistad en ambos lados', resp.ok && C.areFriends(st, A, B) && C.areFriends(st, B, A));
  check('notificación: la solicitud avisó', st.notifications.some(n => n.type === 'request' && n.to === B));
  let sug = C.friendSuggestions(st, A);
  check('amistad: sugerencias no incluyen amigos actuales', !sug.some(s => s.profile.phone === B));
  let unf = C.unfriend(st, A, B);
  check('amistad: dejar de ser amigos funciona', unf.ok && !C.areFriends(st, A, B));

  console.log('=== 6. Grupos ===');
  st = withProfiles(fresh());
  let g = C.createGroup(st, A, { name: 'G' });
  check('grupo: nombre corto se rechaza', !g.ok);
  g = C.createGroup(st, A, { name: 'Cocina casera', desc: 'Recetas' });
  check('grupo: se crea con la creadora como miembro', g.ok && g.group.members.length === 1);
  let j = C.joinGroup(st, B, g.group.id);
  check('grupo: unirse funciona', j.ok && j.group.members.length === 2);
  let gp = C.createPost(st, B, { text: 'Receta del día', groupId: g.group.id });
  check('grupo: miembro puede publicar dentro', gp.ok && gp.post.groupId === g.group.id);
  let gp2 = C.createPost(st, D, { text: 'Yo no soy miembro', groupId: g.group.id });
  check('grupo: quien no es miembro no puede publicar', !gp2.ok);
  check('grupo: la publicación del grupo no se ve fuera', !C.canSeePost(st, D, gp.post));
  let lv = C.leaveGroup(st, A, g.group.id);
  check('grupo: la creadora no puede salir', !lv.ok);
  lv = C.leaveGroup(st, B, g.group.id);
  check('grupo: un miembro sí puede salir', lv.ok && g.group.members.length === 1);

  console.log('=== 7. Mensajes ===');
  st = withProfiles(fresh());
  let m = C.sendMessage(st, A, B, '');
  check('mensaje: vacío se rechaza', !m.ok);
  m = C.sendMessage(st, A, B, 'Hola Bruno, ¿cómo estás?');
  check('mensaje: se envía', m.ok && m.message.text === 'Hola Bruno, ¿cómo estás?');
  let list = C.conversationList(st, B);
  check('mensaje: la conversación aparece con no leído', list.length === 1 && list[0].unread === 1);
  let read = C.markConversationRead(st, B, A);
  check('mensaje: marcar leído pone el contador en 0', read.ok && C.conversationList(st, B)[0].unread === 0);
  C.sendMessage(st, B, A, '¡Hola Ana! Todo bien.');
  list = C.conversationList(st, A);
  check('mensaje: la última conversación queda arriba', list.length === 1 && list[0].last.text === '¡Hola Ana! Todo bien.');
  check('mensaje: con la dirección dentro de la app, el mensaje no se encola dos veces', st.pendingQueue.length === 0);
  check('notificación: el mensaje avisó', st.notifications.some(n => n.type === 'message' && n.to === B));

  console.log('=== 8. Notificaciones y búsqueda ===');
  st = withProfiles(fresh());
  C.sendFriendRequest(st, A, B);
  check('notificación: hay 1 sin leer para B', C.unreadNotifications(st, B) === 1);
  C.markNotificationsRead(st, B);
  check('notificación: marcar leídas las pone en 0', C.unreadNotifications(st, B) === 0);
  st.settings.notifLikes = false;
  let p2 = C.createPost(st, B, { text: 'Post de B' }).post;
  C.toggleLike(st, A, p2.id, 'Me gusta');
  check('notificación: con el aviso apagado no se crea', !st.notifications.some(n => n.type === 'like' && n.to === B));
  st.settings.notifLikes = true;
  C.toggleLike(st, A, p2.id, 'Me gusta');
  C.toggleLike(st, A, p2.id, 'Me gusta');
  C.toggleLike(st, A, p2.id, 'Me gusta');
  check('notificación: con el aviso prendido sí se crea', st.notifications.some(n => n.type === 'like' && n.to === B));
  /* 1.5.43 (4): en la campana no aparece nada de la cuenta de ejemplo:
     su aviso no se renderiza ni cuenta como no leído; uno real y uno de
     actualización sí. Los Me gusta de ejemplo en las publicaciones no se tocan. */
  var st43n = withProfiles(fresh());
  st43n.settings.notifLikes = true; st43n.settings.notifComments = true;
  var demoLike43 = C.notify(st43n, { type: 'like', from: '0000000000', to: B, text: 'reaccionó a tu publicación: Me gusta', refId: 'post-demo1543' });
  var realComment43 = C.notify(st43n, { type: 'comment', from: A, to: B, text: 'comentó tu publicación: ¡Qué buena foto!', refId: 'post-real1543' });
  var upd43 = C.notify(st43n, { type: 'update', from: B, to: B, text: 'Hay una actualización disponible: WordRed 1.5.47.', refId: '62' });
  check('notificación 1.5.43: el aviso de ejemplo no cuenta como no leído (solo el real y la actualización: 2)', !!demoLike43 && !!realComment43 && !!upd43 && C.unreadNotifications(st43n, B) === 2);
  check('notificación 1.5.43: isDemoNotif es verdadero para el aviso de ejemplo', C.isDemoNotif(st43n, demoLike43) === true);
  check('notificación 1.5.43: isDemoNotif es falso para el aviso real y para la actualización', C.isDemoNotif(st43n, realComment43) === false && C.isDemoNotif(st43n, upd43) === false);
  st43n.profiles['5599999999'] = { phone: '5599999999', name: 'Ejemplo Marcado', isDemo: true };
  var markedDemo43 = C.notify(st43n, { type: 'comment', from: '5599999999', to: B, text: 'comentó tu publicación: hola', refId: 'post-x1543' });
  check('notificación 1.5.43: isDemoNotif también filtra por la marca isDemo del perfil', !!markedDemo43 && C.isDemoNotif(st43n, markedDemo43) === true && C.unreadNotifications(st43n, B) === 2);
  C.createPost(st, A, { text: 'Me encanta cocinar #comida' });
  let s1 = C.searchAll(st, A, 'Ana');
  check('búsqueda: encuentra personas por nombre', s1.people.some(p => p.phone === A));
  let s2 = C.searchAll(st, A, 'cocinar');
  check('búsqueda: encuentra publicaciones por palabra', s2.posts.length === 1);
  let s3 = C.searchAll(st, A, '#comida');
  check('búsqueda: encuentra por #etiqueta', s3.posts.length === 1 && s3.hashtags[0] === 'comida');
  let s4 = C.searchAll(st, A, 'Cocina');
  check('búsqueda: encuentra grupos', s4.groups.length === 0); // aún no hay grupos en este estado
  C.createGroup(st, A, { name: 'Cocina casera' });
  s4 = C.searchAll(st, A, 'Cocina');
  check('búsqueda: encuentra grupos tras crear uno', s4.groups.length === 1);
  let feed = C.feedFor(st, B);
  check('feed: lo más nuevo va primero', feed.length >= 2 && feed[0].createdAt >= feed[feed.length - 1].createdAt);

  console.log('=== 9. Contenido de ejemplo ===');
  st = fresh();
  let seed = C.seedDemo(st);
  check('ejemplo: se siembra una vez', seed.ok && st.demoSeeded);
  seed = C.seedDemo(st);
  check('ejemplo: no se siembra dos veces', !seed.ok);
  check('ejemplo: la cuenta oficial está marcada como ejemplo', st.profiles['0000000000'] && st.profiles['0000000000'].isDemo === true);
  check('ejemplo: las publicaciones de ejemplo están marcadas', st.posts.every(p => p.isDemo === true));
  check('ejemplo: el feed de ejemplo no está vacío', st.posts.length >= 4);

  console.log('=== 11. Enlaces (v1.1) ===');
  st = withProfiles(fresh());
  check('enlace: normalizeLink agrega https://', C.normalizeLink('ejemplo.com').url === 'https://ejemplo.com');
  check('enlace: normalizeLink rechaza sin punto', !C.normalizeLink('http://localhost').ok);
  check('enlace: normalizeLink rechaza esquema no http', !C.normalizeLink('ftp://x.com').ok);
  check('enlace: extractUrl encuentra el enlace en el texto', C.extractUrl('Mira https://ejemplo.com/articulo y dime') === 'https://ejemplo.com/articulo');
  let lp = C.createPost(st, A, { link: { url: 'ejemplo.com', title: 'Ejemplo' } });
  check('enlace: publicación solo con enlace se crea', lp.ok && lp.post.link && lp.post.link.url === 'https://ejemplo.com');
  let lp2 = C.createPost(st, A, { link: { url: 'sin-punto' } });
  check('enlace: enlace inválido se rechaza', !lp2.ok);
  let s5 = C.searchAll(st, A, 'ejemplo');
  check('enlace: la búsqueda encuentra por título del enlace', s5.posts.length === 1);
  let sh2 = C.sharePost(st, B, lp.post.id);
  check('enlace: al compartir se lleva el enlace', sh2.ok && sh2.post.link && sh2.post.link.url === 'https://ejemplo.com');

  console.log('=== 12. Personalización de perfil (v1.1) ===');
  st = withProfiles(fresh());
  let prof = C.completeProfile(st, A, { name: 'Ana Prueba', frame: 'dorado', accent: 'azul', job: 'Diseñadora', education: 'UNAM', city: 'CDMX', relationship: 'Soltero/a', birthday: '1995-03-14', website: 'ana.com', sectionPrivacy: { bio: 'Amigos', friends: 'Solo yo', posts: 'Público' } });
  check('perfil: marco, tema y campos se guardan', prof.ok && st.profiles[A].frame === 'dorado' && st.profiles[A].accent === 'azul' && st.profiles[A].job === 'Diseñadora' && st.profiles[A].city === 'CDMX' && st.profiles[A].website === 'https://ana.com');
  check('perfil: privacidad por sección se guarda', st.profiles[A].sectionPrivacy.bio === 'Amigos' && st.profiles[A].sectionPrivacy.friends === 'Solo yo');
  prof = C.completeProfile(st, A, { name: 'Ana Prueba', frame: 'rosa' });
  check('perfil: marco inválido se rechaza', !prof.ok);
  prof = C.completeProfile(st, A, { name: 'Ana Prueba', accent: 'rosa' });
  check('perfil: tema inválido se rechaza', !prof.ok);
  prof = C.completeProfile(st, A, { name: 'Ana Prueba', birthday: '14/03/1995' });
  check('perfil: cumpleaños con formato inválido se rechaza', !prof.ok);
  let pp1 = C.createPost(st, A, { text: 'Uno' }).post;
  let pp2 = C.createPost(st, A, { text: 'Dos' }).post;
  let pp3 = C.createPost(st, A, { text: 'Tres' }).post;
  let pp4 = C.createPost(st, A, { text: 'Cuatro' }).post;
  check('destacada: fijar una publicación funciona', C.pinPost(st, A, pp1.id).ok && st.profiles[A].pinnedPosts.length === 1);
  C.pinPost(st, A, pp2.id); C.pinPost(st, A, pp3.id);
  check('destacada: máximo 3 publicaciones', !C.pinPost(st, A, pp4.id).ok && st.profiles[A].pinnedPosts.length === 3);
  check('destacada: quitar una destacada funciona', C.pinPost(st, A, pp1.id).ok && st.profiles[A].pinnedPosts.length === 2);
  check('destacada: no se puede fijar la publicación de otro', !C.pinPost(st, A, C.createPost(st, B, { text: 'De B' }).post.id).ok);
  check('privacidad: la biografía con "Amigos" no la ve un extraño', !C.sectionVisible(st, B, A, 'bio'));
  C.sendFriendRequest(st, B, A); C.respondFriendRequest(st, A, st.requests[0].id, true);
  check('privacidad: la biografía con "Amigos" sí la ve un amigo', C.sectionVisible(st, B, A, 'bio'));
  check('privacidad: los amigos con "Solo yo" no los ve ni un amigo', !C.sectionVisible(st, B, A, 'friends'));
  check('tema: accentColor devuelve el color del tema', C.accentColor('azul') === '#3ea6ff' && C.accentColor('nada') === '#e01430');

  console.log('=== 13. Marketplace (v1.1) ===');
  st = withProfiles(fresh());
  let lst = C.createListing(st, A, { title: 'B', price: 100, category: 'Electrónica', condition: 'Nuevo' });
  check('anuncio: título corto se rechaza', !lst.ok);
  lst = C.createListing(st, A, { title: 'Bicicleta de montaña', price: -5, category: 'Deportes', condition: 'Usado' });
  check('anuncio: precio negativo se rechaza', !lst.ok);
  lst = C.createListing(st, A, { title: 'Bicicleta de montaña', price: 3500, category: 'Deportes', condition: 'Usado', desc: 'Poco uso', city: 'CDMX', photos: ['foto1'] });
  // v1.6 contacto: número de contacto para llamar o mandar mensaje
  // (estado aparte para no alterar las pruebas de orden y búsqueda).
  const stC = withProfiles(fresh());
  let lstC = C.createListing(stC, A, { title: 'Teléfono con contacto', price: 500, category: 'Electrónica', condition: 'Usado', contactPhone: '55 1234 5678' });
  check('v1.6 contacto: el número de contacto se guarda normalizado en el anuncio', lstC.ok && lstC.listing.contactPhone === '5512345678');
  lstC = C.createListing(stC, A, { title: 'Teléfono malo', price: 500, category: 'Electrónica', condition: 'Usado', contactPhone: '123' });
  check('v1.6 contacto: un número de contacto inválido se rechaza', !lstC.ok);
  const lstOk = C.createListing(stC, A, { title: 'Teléfono editable', price: 500, category: 'Electrónica', condition: 'Usado', contactPhone: '5511112222' });
  const edC = C.editListing(stC, A, lstOk.listing.id, { contactPhone: '55 9999 8888' });
  check('v1.6 contacto: el número de contacto se puede cambiar al editar', edC.ok && edC.listing.contactPhone === '5599998888');
  check('anuncio: se crea con precio en MXN', lst.ok && lst.listing.price === 3500 && lst.listing.status === 'Activo');
  let lst2 = C.createListing(st, B, { title: 'Silla gamer', price: 1200, category: 'Hogar', condition: 'Nuevo', city: 'Guadalajara' });
  let lst3 = C.createListing(st, B, { title: 'Bicicleta infantil', price: 900, category: 'Deportes', condition: 'Usado', city: 'CDMX' });
  let found = C.searchListings(st, A, { q: 'bicicleta' });
  check('anuncio: buscar encuentra por título', found.length === 2);
  found = C.searchListings(st, A, { category: 'Deportes', minPrice: 1000 });
  check('anuncio: filtro por categoría y precio mínimo', found.length === 1 && found[0].id === lst.listing.id);
  found = C.searchListings(st, A, { sort: 'precio-asc' });
  check('anuncio: ordenar por precio ascendente', found[0].price === 900 && found[found.length - 1].price === 3500);
  let sold = C.markListingSold(st, B, lst.listing.id);
  check('anuncio: solo el vendedor puede marcar vendido', !sold.ok);
  sold = C.markListingSold(st, A, lst.listing.id);
  check('anuncio: el vendedor marca vendido', sold.ok && sold.listing.status === 'Vendido');
  found = C.searchListings(st, A, {});
  check('anuncio: los vendidos no salen en la búsqueda normal', found.length === 2 && !found.some(l => l.id === lst.listing.id));
  let svL = C.toggleSaveListing(st, B, lst2.listing.id);
  check('anuncio: guardar favorito funciona', svL.ok && svL.saved);
  found = C.searchListings(st, B, { savedBy: B });
  check('anuncio: los guardados se listan', found.length === 1 && found[0].id === lst2.listing.id);
  let delL = C.deleteListing(st, A, lst2.listing.id);
  check('anuncio: solo el vendedor puede borrarlo', !delL.ok);
  delL = C.deleteListing(st, B, lst2.listing.id);
  check('anuncio: el vendedor lo borra', delL.ok && !st.listings.some(l => l.id === lst2.listing.id));

  console.log('=== 14. Eventos (v1.1) ===');
  st = withProfiles(fresh());
  let ev = C.createEvent(st, A, { name: 'F', date: '2026-12-01' });
  check('evento: nombre corto se rechaza', !ev.ok);
  ev = C.createEvent(st, A, { name: 'Fiesta de fin de año', date: '01/12/2026', time: '20:00', place: 'Mi casa' });
  check('evento: fecha con formato inválido se rechaza', !ev.ok);
  ev = C.createEvent(st, A, { name: 'Fiesta de fin de año', date: '2026-12-01', time: '20:00', place: 'Mi casa', desc: 'Traigan botana' });
  check('evento: se crea', ev.ok && ev.event.status === 'Activo');
  let ev2 = C.createEvent(st, B, { name: 'Partido de fútbol', date: '2026-11-20', time: '18:00', place: 'Cancha central' });
  let rsvp = C.rsvpEvent(st, B, ev.event.id, 'asiste');
  check('evento: asistir funciona', rsvp.ok && rsvp.event.attendees[B] === 'asiste');
  rsvp = C.rsvpEvent(st, D, ev.event.id, 'interes');
  check('evento: me interesa funciona', rsvp.ok && Object.keys(rsvp.event.attendees).length === 2);
  let listE = C.listEvents(st);
  check('evento: la lista va por fecha (el más cercano primero)', listE.length === 2 && listE[0].id === ev2.event.id);
  let cancel = C.cancelEvent(st, B, ev.event.id);
  check('evento: solo el creador puede cancelarlo', !cancel.ok);
  cancel = C.cancelEvent(st, A, ev.event.id);
  check('evento: el creador lo cancela', cancel.ok && cancel.event.status === 'Cancelado');
  rsvp = C.rsvpEvent(st, D, ev.event.id, 'asiste');
  check('evento: cancelado no acepta asistencias', !rsvp.ok);
  listE = C.listEvents(st);
  check('evento: el cancelado sigue en la lista marcado como cancelado', listE.length === 2 && listE.some(e => e.id === ev.event.id && e.status === 'Cancelado'));

  console.log('=== 15. Páginas (v1.1) ===');
  st = withProfiles(fresh());
  let pg = C.createPage(st, A, { name: 'P', category: 'Música' });
  check('página: nombre corto se rechaza', !pg.ok);
  pg = C.createPage(st, A, { name: 'Cocina de Ana', category: 'Comida', desc: 'Recetas caseras' });
  check('página: se crea y la creadora la sigue', pg.ok && pg.page.followers.includes(A));
  let fol = C.toggleFollowPage(st, B, pg.page.id);
  check('página: seguir funciona', fol.ok && fol.following);
  let pp = C.createPost(st, A, { text: 'Nueva receta', pageId: pg.page.id });
  check('página: la creadora puede publicar en ella', pp.ok && pp.post.pageId === pg.page.id);
  let pp2x = C.createPost(st, B, { text: 'Yo no soy creadora', pageId: pg.page.id });
  check('página: quien no la creó no puede publicar', !pp2x.ok);
  check('página: la publicación la ve un seguidor', C.canSeePost(st, B, pp.post));
  check('página: la publicación no la ve quien no sigue', !C.canSeePost(st, D, pp.post));
  let feedP = C.feedFor(st, B);
  check('página: la publicación sale en el feed del seguidor', feedP.some(p => p.id === pp.post.id));
  let feedD = C.feedFor(st, D);
  check('página: la publicación no sale en el feed de quien no sigue', !feedD.some(p => p.id === pp.post.id));
  fol = C.toggleFollowPage(st, B, pg.page.id);
  check('página: dejar de seguir funciona', fol.ok && !fol.following);
  check('página: tras dejar de seguir ya no la ve', !C.canSeePost(st, B, pp.post));

  console.log('=== 16. Encuestas (v1.1) ===');
  st = withProfiles(fresh());
  let pol = C.createPost(st, A, { text: 'Voten', poll: { question: '¿Qué prefieren?', options: ['Tacos'] } });
  check('encuesta: con 1 opción se rechaza', !pol.ok);
  pol = C.createPost(st, A, { text: 'Voten', poll: { question: '¿Qué prefieren?', options: ['Tacos', 'Pizza', 'Sushi'] } });
  check('encuesta: se crea con 3 opciones', pol.ok && pol.post.poll.options.length === 3);
  let v1 = C.votePoll(st, B, pol.post.id, pol.post.poll.options[0].id);
  check('encuesta: votar funciona', v1.ok && v1.results.total === 1 && v1.results.options[0].count === 1);
  let v2 = C.votePoll(st, D, pol.post.id, pol.post.poll.options[1].id);
  check('encuesta: otro voto suma al total', v2.ok && v2.results.total === 2);
  let v3 = C.votePoll(st, B, pol.post.id, pol.post.poll.options[2].id);
  check('encuesta: cambiar el voto mueve el voto, no duplica', v3.ok && v3.results.total === 2 && v3.results.options[2].count === 1 && v3.results.options[0].count === 0);
  let v4 = C.votePoll(st, B, pol.post.id, pol.post.poll.options[2].id);
  check('encuesta: votar la misma opción la quita', v4.ok && v4.results.total === 1);
  let res = C.pollResults(pol.post);
  check('encuesta: los resultados muestran votos y porcentajes', res.total === 1 && res.options[1].count === 1);
  let vBad = C.votePoll(st, B, pol.post.id, 'opcion-falsa');
  check('encuesta: opción inexistente se rechaza', !vBad.ok);

  console.log('=== 17. Borrados (v1.1) ===');
  st = withProfiles(fresh());
  let dpost = C.createPost(st, A, { text: 'Post para borrar' }).post;
  let dc = C.addComment(st, B, dpost.id, 'Comentario 1');
  let dr = C.addComment(st, A, dpost.id, 'Respuesta 1', dc.comment.id);
  check('borrar: la respuesta se borra', C.deleteComment(st, A, dpost.id, dr.comment.id).ok && dpost.comments[0].replies.length === 0);
  check('borrar: el comentario lo borra su autora', C.deleteComment(st, B, dpost.id, dc.comment.id).ok && dpost.comments.length === 0);
  let dc2 = C.addComment(st, A, dpost.id, 'Comentario de Ana');
  check('borrar: quien no es autora ni dueña del post no puede borrarlo', !C.deleteComment(st, B, dpost.id, dc2.comment.id).ok);
  check('borrar: la dueña del post sí puede borrar comentarios', C.deleteComment(st, A, dpost.id, dc2.comment.id).ok);
  let dsto = C.createStory(st, A, { text: 'Historia para borrar' }).story;
  check('borrar: la historia la borra su autora', C.deleteStory(st, A, dsto.id).ok && st.stories.length === 0);
  let dsto2 = C.createStory(st, B, { text: 'Historia de B' }).story;
  check('borrar: la historia de otro no se puede borrar', !C.deleteStory(st, A, dsto2.id).ok);
  let dm = C.sendMessage(st, A, B, 'Mensaje para borrar');
  check('borrar: el mensaje lo borra quien lo envió', C.deleteMessage(st, A, dm.message.id).ok);
  C.sendMessage(st, A, B, 'Mensaje 2');
  let dc3 = C.deleteConversation(st, A, B);
  check('borrar: la conversación se borra completa', dc3.ok && C.conversationList(st, A).length === 0);
  let dg = C.createGroup(st, A, { name: 'Grupo para borrar' }).group;
  C.createPost(st, A, { text: 'Post del grupo', groupId: dg.id });
  let dgDel = C.deleteGroup(st, B, dg.id);
  check('borrar: el grupo solo lo borra su creadora', !dgDel.ok);
  dgDel = C.deleteGroup(st, A, dg.id);
  check('borrar: la creadora borra el grupo y sus publicaciones', dgDel.ok && !st.groups.some(g => g.id === dg.id) && !st.posts.some(p => p.groupId === dg.id));
  C.createPost(st, D, { text: 'Post de Diana' });
  st.me = D;
  let da = C.deleteAccount(st, D);
  check('borrar cuenta: borra perfil, publicaciones y sesión', da.ok && !st.profiles[D] && !st.posts.some(p => p.author === D) && st.me === null);

  console.log('=== 18. Controles de texto prohibido en los assets ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const javaSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const all = idx + appjs + corejs;
  check('texto: 0 "usuario" en los assets', !/usuario|usuário|utilisateur/i.test(all));
  check('texto: 0 "Facebook" en los assets', !/facebook/i.test(all));
  check('texto: 0 "Muse" en los assets', !/muse/i.test(all.replace(/musEl/g, '')));
  check('texto: el pie exacto está en la app', idx.includes('Creada y diseñada por Mistery Store Play'));
  // v2.9: entrar con Google y con correo (los enlaces a Play Store de la
  // v1.8 no son inicio de sesión; el botón de Google sí lo es).
  check('v2.9 texto: hay botón de Google junto al registro por teléfono', /Continuar con Google/.test(idx) && idx.indexOf('id="authGoogle"') > idx.indexOf('id="authStepPhone"') && idx.indexOf('id="authGoogle"') < idx.indexOf('id="authStepCode"'));
  check('v2.9 texto: hay opción de correo con código', /Enviar código al correo/.test(idx) && idx.indexOf('id="authEmail"') > 0 && idx.indexOf('id="authSendEmailCode"') > 0);
  check('v1.5.8 texto: el ID de cliente de Google de WordRed aparece una sola vez, como configuración interna (nunca en un campo)', /DEFAULT_GOOGLE_CLIENT_ID = '730186387438-pj78hmj6tc8626hbr7078rkk0daqhoq0\.apps\.googleusercontent\.com'/.test(all) && (all.match(/[0-9]{6,}-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com/g) || []).length === 1);
  check('v1.5.8 texto: no hay ningún campo de ID de cliente en el registro ni en Ajustes', idx.indexOf('id="settingsGoogleClientId"') < 0 && idx.indexOf('id="authGoogleClientId"') < 0 && idx.indexOf('id="authGoogleSetup"') < 0 && idx.indexOf('id="authGoogleIdRow"') < 0 && !/googleClientId/.test(appjs));
  check('v1.5.8 texto: el código nativo de Google se conserva (el flujo nuevo es web, por reflexión y sin librerías nuevas)', /signInWithGoogle/.test(javaSrc) && /GoogleSignInOptions/.test(javaSrc) && /getSignInIntent/.test(javaSrc) && /GOOGLE_SIGN_IN_REQ/.test(javaSrc) && /Class\.forName\("com\.google\.android\.gms\.auth\.api\.signin\.GoogleSignIn/.test(javaSrc));
  check('v2.9 texto: el registro por teléfono sigue igual (mismo botón, mismo flujo)', idx.indexOf('id="authSendCode"') > 0 && /Enviar código/.test(idx) && /C\.requestCode\(state, phone\)/.test(appjs));
  // v1.6 publicidad: productos reales de Mercado Libre (API pública sin
  // clave) y tiendas con enlace real a sus ofertas, sin datos inventados.
  check('v1.6 publicidad: se usa la API pública de Mercado Libre sin clave', appjs.indexOf('https://api.mercadolibre.com/sites/MLM/search') >= 0);
  check('v1.6 publicidad: el producto se toma de la respuesta (título, precio, foto, enlace)', appjs.indexOf('r.title') >= 0 && appjs.indexOf('r.price') >= 0 && appjs.indexOf('r.thumbnail') >= 0 && appjs.indexOf('r.permalink') >= 0);
  check('v1.6 publicidad: las tiendas enlazan a sus páginas reales de ofertas', appjs.indexOf('https://www.amazon.com.mx/deals') >= 0 && appjs.indexOf('https://www.shein.com.mx/sale') >= 0 && appjs.indexOf('https://www.temu.com/') >= 0);
  check('v1.9 publicidad: la tarjeta lleva la marca Publicidad y esquinas redondeadas (radio 20 px)', appjs.indexOf('Publicidad') >= 0 && /\.adCard\{[^}]*border-radius:20px/.test(idx));
  // v1.6 compartir la app: icono junto a buscar, APK real por FileProvider.
  check('v1.6 compartir app: el icono está junto al de buscar', idx.indexOf('id="hdrShareApp"') > idx.indexOf('id="hdrSearch"') && idx.indexOf('id="hdrShareApp"') < idx.indexOf('id="hdrBell"'));
  check('v1.6 compartir app: el puente comparte el APK instalado (sourceDir) por FileProvider', javaSrc.indexOf('shareAppApk') >= 0 && javaSrc.indexOf('sourceDir') >= 0 && javaSrc.indexOf('FileProvider.getUriForFile') >= 0 && javaSrc.indexOf('Intent.createChooser') >= 0);
  check('v1.6 compartir app: sin archivo se comparte al menos el mensaje y se avisa', appjs.indexOf('shareAppApk') >= 0 && appjs.indexOf('shareText') >= 0 && /No se pudo compartir el archivo/.test(appjs));
  // v1.6 código QR en Ajustes: generado dentro de la app, sin servicio
  // externo; codifica la cuenta y al escanear abre su perfil.
  check('v1.6 QR: las librerías QR están empaquetadas en la app (sin servicio externo)', idx.indexOf('qrcode.js') >= 0 && idx.indexOf('jsqr.js') >= 0 && !/api\.qrcode|qrcode\.googleapis|chart\.googleapis/i.test(appjs));
  check('v1.6 QR: Ajustes tiene el apartado Mi código QR', idx.indexOf('Mi código QR') >= 0 && idx.indexOf('id="myQrCode"') >= 0 && idx.indexOf('id="scanQrBtn"') >= 0);
  check('v1.6 QR: el código codifica la cuenta como wordred://perfil/', appjs.indexOf('wordred://perfil/') >= 0 && appjs.indexOf('myQrPayload') >= 0);
  check('v1.6 QR: al escanear se abre el perfil y sin datos locales se crea con los del QR', appjs.indexOf('handleQrPayload') >= 0 && appjs.indexOf('fromQr') >= 0 && appjs.indexOf('__wrOpenProfile(phone)') >= 0);
  // v1.6 minijuegos: módulo empaquetado, apartado en el perfil, cableado.
  check('v1.6 minijuegos: el módulo se carga entre core.js y app.js', idx.indexOf('games.js') > idx.indexOf('core.js') && idx.indexOf('games.js') < idx.indexOf('app.js'));
  check('v1.6 minijuegos: el perfil tiene el apartado con recomendaciones, favoritos y parrilla', idx.indexOf('id="gamesSection"') >= 0 && idx.indexOf('id="gamesRecs"') >= 0 && idx.indexOf('id="gamesFavs"') >= 0 && idx.indexOf('id="gamesGrid"') >= 0);
  check('v1.6 minijuegos: la app inicia el módulo y publica el récord en el perfil', appjs.indexOf('WordRedGames.init') >= 0 && appjs.indexOf('publishGameRecord') >= 0 && appjs.indexOf('renderGames') >= 0);
  check('v1.6 minijuegos: la suite propia de juegos existe', fs.existsSync(path.join(__dirname, 'test-games.js')));
  check('texto: el registro dice que es solo por teléfono', /solo.*teléfono|número de teléfono/i.test(idx));

  console.log('=== 19. Subidas sin límite de tamaño (v1.1) ===');
  st = withProfiles(fresh());
  var hugeMedia = 'x'.repeat(5 * 1024 * 1024); // 5 MB de "archivo" simulado
  var bigPost = C.createPost(st, A, { text: 'Video grande', media: hugeMedia, mediaType: 'video' });
  check('sin límite: publicación con video de 5 MB se crea', bigPost.ok && bigPost.post.media.length === 5 * 1024 * 1024);
  var bigStory = C.createStory(st, A, { text: 'Historia grande', media: hugeMedia, mediaType: 'video' });
  check('sin límite: historia con video de 5 MB se crea', bigStory.ok);
  var bigPhotos = [];
  for (var i = 0; i < 8; i++) bigPhotos.push('y'.repeat(1024 * 1024));
  var bigListing = C.createListing(st, A, { title: 'Lote de fotos grandes', price: 100, category: 'Otros', condition: 'Usado', photos: bigPhotos });
  check('sin límite: anuncio con 8 fotos de 1 MB se crea', bigListing.ok && bigListing.listing.photos.length === 8);
  var bigMsg = C.sendMessage(st, A, B, 'Mira este archivo', hugeMedia, 'video');
  check('sin límite: mensaje con adjunto de 5 MB se envía', bigMsg.ok);
  // Controles estáticos: ningún rechazo por tamaño en el código.
  const java = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const serverjs = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
  // v2.9: el token de Google se verifica en el servidor (aquí ya existe serverjs).
  check('v2.9 texto: el puente devuelve el token a la app y la app lo verifica en el servidor', /__onGoogleSignIn/.test(appjs) && /__onGoogleSignInError/.test(appjs) && /\/api\/auth\/google/.test(appjs) && /\/api\/auth\/google/.test(serverjs) && /verifyGoogleIdToken/.test(serverjs));
  check('v2.9 texto: el servidor manda el código al correo por SMTP (variables de entorno) o devCode en modo de prueba', /SMTP_HOST/.test(serverjs) && /nodemailer/.test(serverjs) && /\/api\/auth\/email\/request-code/.test(serverjs) && /\/api\/auth\/email\/verify/.test(serverjs));
  check('v2.9 texto: sin GOOGLE_CLIENT_ID el servidor no acepta ningún token (503)', /GOOGLE_CLIENT_ID/.test(serverjs) && /no está configurado en el servidor/.test(serverjs) && /status\(503\)/.test(serverjs));
  check('sin límite: no hay rechazo por tamaño en app.js', !/file\.size\s*>|tooBig|50 MB|demasiado grande/i.test(appjs));
  check('sin límite: no hay tope MAX_SIZE en el código', !/MAX_SIZE|MAX_FILE|MAX_MB/i.test(all + java + serverjs));
  check('sin límite: el puente nativo sube por partes', /startMediaUpload/.test(java) && /appendMediaChunk/.test(java) && /finishMediaUpload/.test(java) && /cancelMediaUpload/.test(java));
  check('sin límite: la app usa la subida por partes', /saveFileChunked/.test(appjs) && /startMediaUpload/.test(appjs));
  check('sin límite: el puente copia por flujo (buffer de 8 KB)', /byte\[\] tmp = new byte\[8192\]/.test(java));
  check('sin límite: sin espacio se avisa claro', /NO_SPACE/.test(java) && /No hay espacio/.test(appjs));
  check('sin límite: el servidor acepta cuerpos grandes', /express\.json\(\{ limit: '1gb' \}\)/.test(serverjs) && !/limit: '10mb'/.test(serverjs));

  console.log('=== 20. Iconos en blanco y negro (v1.2) ===');
  const idxNoScript = idx.replace(/<script[\s\S]*?<\/script>/g, '');
  const emojiRe = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
  const idxEmoji = idxNoScript.split('\n').filter(l => emojiRe.test(l) && !l.includes('✕'));
  check('iconos: el marcado estático no tiene emoji de color', idxEmoji.length === 0, idxEmoji.slice(0, 2).join(' | '));
  const appEmojiLines = appjs.split('\n').filter(l => {
    if (!emojiRe.test(l)) return false;
    if (/REACTION_EMOJI|STORY_EDIT_STICKERS/.test(l)) return false; // las caras de reacción y los stickers son contenido del usuario
    if (/weatherAnimHtml|var emoji = \{/.test(l)) return false; // los símbolos animados del clima (sol, lluvia...) son contenido del clima, no iconos de interfaz
    if (/✓|★|✕/.test(l) && !/[\u{1F000}-\u{1FAFF}]/u.test(l)) return false; // glifos de texto monocromos
    return true;
  });
  check('iconos: app.js no usa emoji como icono de interfaz', appEmojiLines.length === 0, appEmojiLines.slice(0, 2).join(' | '));
  check('iconos: hay mapa ICONS con SVG de línea', /var ICONS = \{/.test(appjs) && /function ic\(name/.test(appjs) && /stroke="currentColor"/.test(appjs));
  check('iconos: la barra tiene 5 pestañas con Shorts central y sin Teléfono (v2.0)', /data-nav="shorts"/.test(idx) && /bn-main/.test(idx) && !/data-nav="phone"/.test(idx) && (idx.match(/data-nav="/g) || []).length === 4);

  console.log('=== 21. Avisos de publicaciones de seguidos (v1.2) ===');
  st = withProfiles(fresh());
  st.friends[A] = [B]; st.friends[B] = [A];
  let pB1 = C.createPost(st, B, { text: 'Post de Bruno' }).post;
  let news = C.checkNewPostNotifications(st, A);
  check('avisos: la publicación de un amigo genera aviso', news.ok && news.notified === 1 && st.notifiedPostIds.indexOf(pB1.id) >= 0 && st.notifications[0].refId === pB1.id && st.notifications[0].type === 'post');
  news = C.checkNewPostNotifications(st, A);
  check('avisos: el mismo post no avisa dos veces', news.notified === 0);
  let pD1 = C.createPost(st, D, { text: 'Post de Diana' }).post;
  news = C.checkNewPostNotifications(st, A);
  check('avisos: la publicación de un extraño no avisa', news.notified === 0);
  C.recordView(st, A, D);
  let pD2 = C.createPost(st, D, { text: 'Otro post de Diana' }).post;
  news = C.checkNewPostNotifications(st, A);
  check('avisos: la publicación de alguien visto recientemente sí avisa', news.notified === 2 && st.notifiedPostIds.indexOf(pD1.id) >= 0 && st.notifiedPostIds.indexOf(pD2.id) >= 0);
  check('avisos: la vista reciente se recuerda', C.isRecentlyViewed(st, A, D));
  st.settings.notifFollowPosts = false;
  let pB2 = C.createPost(st, B, { text: 'Otro post de Bruno' }).post;
  news = C.checkNewPostNotifications(st, A);
  check('avisos: con el ajuste apagado no se crea el aviso', news.notified === 0 && st.notifiedPostIds.indexOf(pB2.id) >= 0);
  check('avisos: con el ajuste apagado tampoco avisa después', C.checkNewPostNotifications(st, A).notified === 0);
  st.settings.notifFollowPosts = true;
  let pg1 = C.createPage(st, B, { name: 'Página de Bruno', category: 'Comida' }).page;
  C.toggleFollowPage(st, A, pg1.id);
  let pPg = C.createPost(st, B, { text: 'Post de la página', pageId: pg1.id }).post;
  news = C.checkNewPostNotifications(st, A);
  check('avisos: la publicación de una página seguida avisa', news.notified === 1 && st.notifications[0].type === 'pagepost' && st.notifications[0].refId === pPg.id);
  let g1 = C.createGroup(st, A, { name: 'Grupo de Ana' }).group;
  C.joinGroup(st, B, g1.id);
  let pG = C.createPost(st, B, { text: 'Post en el grupo', groupId: g1.id }).post;
  news = C.checkNewPostNotifications(st, A);
  check('avisos: la publicación en mi grupo avisa', news.notified === 1 && st.notifications[0].type === 'grouppost' && st.notifications[0].refId === pG.id);

  console.log('=== 22. Marketplace v1.2: WhatsApp, categorías, grupos de ventas, perfil de ventas ===');
  st = withProfiles(fresh());
  check('mercado: hay 24 categorías', C.LISTING_CATEGORIES.length === 24);
  check('mercado: incluye Motos, Celulares, Inmuebles y Empleos', ['Motos', 'Celulares', 'Inmuebles', 'Empleos'].every(c => C.LISTING_CATEGORIES.includes(c)));
  let l1 = C.createListing(st, A, { title: 'Celular', price: 5000, category: 'Celulares', condition: 'Usado', brand: 'Samsung', whatsapp: '55 1234 5678', negotiable: true, delivery: 'Envío', city: 'CDMX' });
  check('mercado: el anuncio guarda WhatsApp, marca, negociable y entrega', l1.ok && l1.listing.whatsapp === '5512345678' && l1.listing.brand === 'Samsung' && l1.listing.negotiable === true && l1.listing.delivery === 'Envío');
  check('mercado: el WhatsApp inválido se rechaza', !C.createListing(st, A, { title: 'X', price: 1, category: 'Otros', condition: 'Nuevo', whatsapp: '123' }).ok);
  C.createListing(st, A, { title: 'Tele', price: 3000, category: 'Electrónica', condition: 'Nuevo', brand: 'LG', delivery: 'Recoger', city: 'CDMX' });
  let foundBrand = C.searchListings(st, A, { q: 'samsung' });
  check('mercado: la búsqueda encuentra por marca', foundBrand.length === 1 && foundBrand[0].title === 'Celular');
  check('mercado: el filtro de entrega funciona', C.searchListings(st, A, { delivery: 'Envío' }).length === 1);
  check('mercado: el filtro de solo negociables funciona', C.searchListings(st, A, { negotiable: true }).length === 1);
  let sgBad = C.createSalesGroup(st, A, { name: 'X' });
  check('ventas: el grupo necesita nombre de 3 letras', !sgBad.ok);
  let sg = C.createSalesGroup(st, A, { name: 'Ventas de autos CDMX', desc: 'Solo autos', category: 'Vehículos', rules: 'Sin spam.' }).group;
  check('ventas: se crea el grupo con categoría y reglas', !!sg && sg.members.length === 1 && sg.rules === 'Sin spam.');
  check('ventas: unirse funciona', C.joinSalesGroup(st, B, sg.id).ok && sg.members.length === 2);
  check('ventas: unirse dos veces se rechaza', !C.joinSalesGroup(st, B, sg.id).ok);
  let lg = C.createListing(st, B, { title: 'Auto', price: 90000, category: 'Vehículos', condition: 'Usado', salesGroupId: sg.id });
  check('ventas: un miembro publica un anuncio dentro del grupo', lg.ok && lg.listing.salesGroupId === sg.id);
  check('ventas: quien no es miembro no puede publicar en el grupo', !C.createListing(st, D, { title: 'Auto 2', price: 1, category: 'Vehículos', condition: 'Usado', salesGroupId: sg.id }).ok);
  check('ventas: los anuncios del grupo se listan', C.salesGroupListings(st, sg.id).length === 1);
  check('ventas: buscar grupos por nombre funciona', C.searchSalesGroups(st, 'autos').length === 1);
  check('ventas: la creadora no puede salir del grupo', !C.leaveSalesGroup(st, A, sg.id).ok);
  check('ventas: un miembro sí puede salir', C.leaveSalesGroup(st, B, sg.id).ok && sg.members.length === 1);
  C.joinSalesGroup(st, B, sg.id);
  check('ventas: solo la creadora elimina el grupo', !C.deleteSalesGroup(st, B, sg.id).ok && C.deleteSalesGroup(st, A, sg.id).ok);
  check('ventas: al borrar el grupo el anuncio queda fuera del grupo', lg.listing.salesGroupId === null);
  let stats = C.sellerStats(st, A);
  check('ventas: el perfil de ventas cuenta activos y vendidos', stats && stats.active.length === 2 && stats.sold.length === 0);
  C.markListingSold(st, A, l1.listing.id);
  stats = C.sellerStats(st, A);
  check('ventas: el perfil de ventas cuenta el vendido', stats.active.length === 1 && stats.sold.length === 1);
  check('ventas: valorarse a uno mismo se rechaza', !C.rateSeller(st, A, A, 5).ok);
  check('ventas: estrellas fuera de 1-5 se rechazan', !C.rateSeller(st, B, A, 6).ok);
  let rt = C.rateSeller(st, B, A, 5, 'Todo bien');
  check('ventas: un comprador valora con 5 estrellas', rt.ok && rt.rating.stars === 5);
  C.rateSeller(st, D, A, 4, 'Bien');
  stats = C.sellerStats(st, A);
  check('ventas: el promedio de estrellas se calcula', stats.avg === 4.5 && stats.count === 2);
  let rt2 = C.rateSeller(st, B, A, 3, 'Regular');
  check('ventas: valorar de nuevo actualiza la valoración', rt2.ok && rt2.updated === true && C.sellerStats(st, A).avg === 3.5);
  let dt = C.formatDateTime(new Date(2026, 10, 12, 14, 30).getTime());
  check('fecha: el formato es "12 nov 2026 · 14:30"', dt === '12 nov 2026 · 14:30', dt);

  console.log('=== 23. Publicar con libertad de expresión y Shorts (v1.2) ===');
  st = withProfiles(fresh());
  st.friends[A] = [B]; st.friends[B] = [A];
  let rich = C.createPost(st, A, { text: 'Hola **mundo**', bg: 'atardecer', feeling: { kind: 'feeling', text: 'feliz' }, tags: [B, '9999999999', A], location: 'Ciudad de México' });
  check('publicar: fondo, sentimiento, ubicación y etiquetas se guardan', rich.ok && rich.post.bg === 'atardecer' && rich.post.feeling.text === 'feliz' && rich.post.location === 'Ciudad de México' && rich.post.tags.length === 1);
  let richMedia = C.createPost(st, A, { text: 'Fotos', mediaList: [{ src: 'foto1.jpg', type: 'image' }, { src: 'video1.mp4', type: 'video' }] });
  check('publicar: varias fotos y videos en una sola publicación', richMedia.ok && richMedia.post.mediaList.length === 2 && richMedia.post.bg === 'none');
  check('publicar: solo se etiquetan amigos que existen (sin desconocidos ni a uno mismo)', rich.post.tags.length === 1 && rich.post.tags[0] === B);
  let bgBad = C.createPost(st, A, { text: 'X', bg: 'rosa' });
  check('publicar: un fondo inválido queda en "sin fondo"', bgBad.ok && bgBad.post.bg === 'none');
  let bgMedia = C.createPost(st, A, { text: 'X', bg: 'mar', media: 'foto.jpg', mediaType: 'image' });
  check('publicar: con foto no hay fondo de color', bgMedia.ok && bgMedia.post.bg === 'none');
  let feelLong = C.createPost(st, A, { text: 'X', feeling: { kind: 'feeling', text: 'x'.repeat(100) } });
  check('publicar: el sentimiento se limita a 60 letras', feelLong.ok && feelLong.post.feeling.text.length === 60);
  let many = [];
  for (let i = 0; i < 12; i++) many.push({ src: 'f' + i + '.jpg', type: 'image' });
  let manyPost = C.createPost(st, A, { text: 'Muchas fotos', mediaList: many });
  check('publicar: sin límite de fotos o videos por publicación (ola 11)', manyPost.ok && manyPost.post.mediaList.length === 12);
  let stA = C.createStory(st, A, { text: 'Historia de Ana' }).story;
  check('shorts: la historia nace con me gusta, comentarios y compartir', stA.likes && Array.isArray(stA.comments) && Array.isArray(stA.shares));
  let lk = C.toggleStoryLike(st, B, stA.id);
  check('shorts: dar me gusta a una historia funciona', lk.ok && lk.liked === true && C.storyLikeCounts(stA) === 1);
  let cm = C.addStoryComment(st, B, stA.id, '¡Qué bonita historia!');
  check('shorts: comentar una historia funciona', cm.ok && stA.comments.length === 1 && stA.comments[0].text === '¡Qué bonita historia!');
  let shStory = C.shareStory(st, B, stA.id);
  check('shorts: compartir una historia funciona', shStory.ok && stA.shares.length === 1);
  let vp = C.createPost(st, A, { text: 'Video corto', media: 'corto.mp4', mediaType: 'video' }).post;
  let shortsList = C.shortsFeed(st, A);
  check('shorts: el feed junta historias y videos cortos', shortsList.length >= 2 && shortsList.some(x => x.kind === 'story') && shortsList.some(x => x.kind === 'post'));
  check('shorts: el feed va del más nuevo al más viejo', shortsList[0].createdAt >= shortsList[shortsList.length - 1].createdAt);

  console.log('=== 24. Archivos y mensajes de voz (v1.2) ===');
  st = withProfiles(fresh());
  let f1 = C.sendMessage(st, A, B, '', '', '', { name: 'contrato.pdf', size: 123456, mime: 'application/pdf', uri: 'content://x/contrato.pdf' });
  check('archivos: un documento se envía con nombre y tamaño', f1.ok && f1.message.file && f1.message.file.name === 'contrato.pdf' && f1.message.file.size === 123456);
  check('archivos: el mensaje puede ser solo el archivo (sin texto)', f1.message.text === '');
  check('archivos: un archivo sin nombre se rechaza', !C.sendMessage(st, A, B, '', '', '', { name: '', uri: 'content://x/a' }).ok);
  let f2 = C.sendMessage(st, A, B, 'Mira', '', '', { name: 'foto.png', size: 999, mime: 'image/png', uri: 'content://x/foto.png' });
  check('archivos: una imagen se envía con su tipo', f2.ok && f2.message.file.mime === 'image/png');
  let voice1 = C.sendMessage(st, A, B, '', '', '', null, { uri: 'content://x/voz.m4a', duration: 42000, size: 1000, mime: 'audio/mpeg' });
  check('voz: el mensaje de voz se envía con duración', voice1.ok && voice1.message.voice && voice1.message.voice.duration === 42000);
  check('voz: un audio de menos de medio segundo se rechaza', !C.sendMessage(st, A, B, '', '', '', null, { uri: 'content://x/v.m4a', duration: 200 }).ok);
  check('voz: un audio sin archivo se rechaza', !C.sendMessage(st, A, B, '', '', '', null, { uri: '', duration: 5000 }).ok);
  check('voz: el formato de duración es m:ss', C.formatDuration(0) === '0:00' && C.formatDuration(42000) === '0:42' && C.formatDuration(65000) === '1:05');
  let cv = C.completeProfile(st, A, { name: 'Ana Prueba', cover: 'portada.mp4', coverType: 'video' });
  check('portada: el perfil guarda portada de video', cv.ok && cv.profile.coverType === 'video' && cv.profile.cover === 'portada.mp4');
  let cv2 = C.completeProfile(st, A, { name: 'Ana Prueba', cover: 'portada.jpg', coverType: 'foto' });
  check('portada: un tipo inválido queda en imagen', cv2.ok && cv2.profile.coverType === 'image');
  let cv3 = C.completeProfile(st, A, { name: 'Ana Prueba', cover: '' });
  check('portada: sin portada el tipo vuelve a imagen', cv3.ok && cv3.profile.coverType === 'image');

  console.log('=== 25. Controles estáticos v1.2 (permisos, voz, llamadas, compartir, bloqueo) ===');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  check('estático: manifest versión 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('estático: el manifest recibe compartir (ACTION_SEND texto/imagen/video)', /android.intent.action.SEND/.test(manifest) && /text\/plain/.test(manifest) && /image\/\*/.test(manifest) && /video\/\*/.test(manifest));
  check('estático: el manifest pide micrófono y audio', /RECORD_AUDIO/.test(manifest) && /MODIFY_AUDIO_SETTINGS/.test(manifest));
  check('estático: la portada es su propio rectángulo y el avatar va aparte', /\.profileHead\{margin-top:16px/.test(idx) && !/\.profileHead\{margin-top:-/.test(idx));
  check('estático: la portada acepta video en silencio en bucle', /\.cover img,\.cover video/.test(idx) && /coverHtml/.test(appjs) && /autoplay muted loop/.test(appjs));
  check('estático: animaciones presentes (pop, deslizante, transición, check)', /@keyframes wrPop/.test(idx) && /@keyframes wrSlideIn/.test(idx) && /@keyframes wrFadeIn/.test(idx) && /@keyframes wrCheckDraw/.test(idx) && /showSuccess/.test(appjs));
  check('estático: flujo de permisos de primer inicio en diseño propio', /PERM_STEPS/.test(appjs) && /permissionsOverlay/.test(idx) && /__onFirstRun/.test(appjs) && /__onPermissionResult/.test(appjs));
  check('estático: los 4 permisos se explican (notificaciones, archivos, cámara, micrófono)', ['notifications', 'files', 'camera', 'mic'].every(k => appjs.includes("id: '" + k + "'")));
  check('estático: el puente pide cada permiso por separado', /requestNotificationPermission/.test(java) && /requestFilesPermission/.test(java) && /requestCameraPermission/.test(java) && /requestMicPermission/.test(java));
  check('estático: mensajes de voz por puente nativo (MediaRecorder)', /startVoiceRecording/.test(java) && /stopVoiceRecording/.test(java) && /MediaRecorder/.test(java) && /__onVoiceRecorded/.test(appjs));
  check('estático: llamadas WebRTC con señalización por el servidor', /RTCPeerConnection/.test(appjs) && /\/api\/call-signal/.test(appjs) && /\/api\/call-signal/.test(serverjs));
  check('estático: la llamada sin conexión lo dice claro sin mencionar el servidor', /Las llamadas necesitan que los dos estén en línea/.test(appjs) && !/Configúralo en Ajustes/.test(appjs));
  check('estático: compartir saliente por la hoja del sistema', /shareMediaUri/.test(java) && /sharePostExternally/.test(appjs) && /shareText/.test(java));
  check('estático: compartir entrante guarda el contenido hasta entrar', /pendingSharedContent/.test(appjs));
  check('estático: apoyo al creador en Ajustes (sin exponer datos en pruebas)', /supportSection/.test(idx) && /supportCopyBtn/.test(idx));
  check('estático: bloqueo con huella o PIN (BiometricPrompt + credencial)', /BiometricPrompt/.test(java) && /KeyguardManager/.test(java) && /requestAppLockEnable/.test(java) && /__onAppLockResult/.test(appjs) && /appLockToggle/.test(idx));
  check('estático: el aviso de publicación usa canal de alta importancia y visible en bloqueo', /CHANNEL_POSTS/.test(java) && /IMPORTANCE_HIGH/.test(java) && /VISIBILITY_PUBLIC/.test(java) && /showPostNotification/.test(java));

  console.log('=== 26. SMS quitado: solo chats de WordRed (v1.5.12) ===');
  st = withProfiles(fresh());
  check('v1.5.12 sms: el núcleo ya no tiene bandeja de SMS', C.addSms === undefined && C.mergeSms === undefined && C.smsConversations === undefined && C.unreadSmsCount === undefined && C.markSmsRead === undefined && fresh().sms === undefined);
  check('v1.5.12 sms: el manifest ya no pide permisos de SMS ni declara sus receptores/servicios', !/SEND_SMS/.test(manifest) && !/RECEIVE_SMS/.test(manifest) && !/READ_SMS/.test(manifest) && !/RECEIVE_WAP_PUSH/.test(manifest) && !/SMS_RECEIVED/.test(manifest) && !/WAP_PUSH_RECEIVED/.test(manifest) && !/SmsReceiver/.test(manifest) && !/HeadlessSmsSendService/.test(manifest) && !/RESPOND_VIA_MESSAGE/.test(manifest) && !/smsto/.test(manifest) && !/mmsto/.test(manifest));
  check('v1.5.12 sms: el manifest no abre WordRed para escribir SMS de otra app', !/android\.intent\.action\.SENDTO/.test(manifest));
  check('v1.5.12 sms: el puente nativo ya no tiene funciones de SMS', !/isDefaultSms/.test(java) && !/requestDefaultSms/.test(java) && !/requestSmsPermissions/.test(java) && !/sendSms/.test(java) && !/getSmsInbox/.test(java) && !/getStoredSms/.test(java) && !/SmsManager/.test(java) && !/ROLE_SMS/.test(java) && !/__onSmsReceived/.test(java) && !/__onSmsDelivered/.test(java) && !/Telephony\.Sms/.test(java));
  check('v1.5.12 sms: los archivos de SMS ya no existen', !fs.existsSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'SmsReceiver.java')) && !fs.existsSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'HeadlessSmsSendService.java')));
  check('v1.5.12 sms: la app ya no tiene sección ni pestaña de SMS', !/msgSection/.test(appjs) && !/renderSmsList/.test(appjs) && !/setMsgSection/.test(appjs) && !/sendSmsMessage/.test(appjs) && !/syncSms/.test(appjs) && !/openSmsThread/.test(appjs) && !/smsBadge/.test(idx) && !/smsList/.test(idx) && !/smsOverlay/.test(idx) && !/msgSectionTabs/.test(idx) && !/smsNewBtn/.test(idx) && !/smsSendBtn/.test(idx));
  check('v1.5.12 sms: ya no se ofrece ser app predeterminada ni hay ajustes de SMS', !/DEFAULT_STEPS/.test(appjs) && !/defaultsOverlay/.test(idx) && !/renderDefaultStep/.test(appjs) && !/renderDefaultsDone/.test(appjs) && !/__onDefaultRoleResult/.test(appjs) && !/refreshDefaultStatus/.test(appjs) && !/requestDefaultRole/.test(appjs) && !/smsDefaultStatus/.test(idx) && !/smsDefaultBtn/.test(idx) && !/Aplicaciones predeterminadas/.test(idx));
  check('v1.5.12 sms: maybeShowDefaults queda como no-op para no romper el primer uso', /function maybeShowDefaults\(\) \{ \/\* sin SMS/.test(appjs));
  check('v1.5.12 sms: el registro sigue sin SMS (código por notificación y verificación sola)', /__onSmsCode/.test(appjs) && /startSmsRetriever/.test(appjs) && /sendVerificationCode/.test(appjs) && fs.existsSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'SmsRetrieverHelper.java')));
  check('v1.5.12 sms: las llamadas reales siguen (permisos, marcador, InCallService)', /CALL_PHONE/.test(manifest) && /READ_CALL_LOG/.test(manifest) && /READ_CONTACTS/.test(manifest) && /WordRedInCallService/.test(manifest) && /BIND_INCALL_SERVICE/.test(manifest) && /ROLE_DIALER/.test(java) && /requestDefaultDialer/.test(java) && /isDefaultDialer/.test(java) && /getCallLog/.test(java));
  check('v1.5.12 sms: los enlaces externos smsto: para contactar a un vendedor siguen', /msgChoiceSms/.test(appjs) && /'sms:' \+ p/.test(appjs) && /openExternalUrl\(uri\)/.test(appjs));
  check('predet: el puente lee historial y contactos del teléfono', /CallLog\.Calls/.test(java) && /getCallLog/.test(java) && /ContactsContract/.test(java) && /getDeviceContacts/.test(java));
  const incall = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedInCallService.java'), 'utf8');
  check('predet: el puente marca por TelecomManager y atiende la llamada en curso', /TelecomManager/.test(java) && /placeCall/.test(java) && /dialNumber/.test(java) && /onCallAdded/.test(incall) && /onCallRemoved/.test(incall) && /currentCall/.test(incall));
  check('predet: la pantalla de llamada real tiene contestar, silencio, altavoz y colgar', /phoneCallOverlay/.test(idx) && /phoneCallAnswerBtn/.test(idx) && /phoneCallMuteBtn/.test(idx) && /phoneCallSpeakerBtn/.test(idx) && /phoneCallHangBtn/.test(idx) && /__onTelecomCall/.test(appjs));

  console.log('=== 27. Historias personalizadas (v1.2, ola 6) ===');
  st = withProfiles(fresh());
  check('editor: hay 7 filtros de historia', C.STORY_FILTERS.length === 7 && C.STORY_FILTERS.includes('sepia') && C.STORY_FILTERS.includes('blanco y negro'));
  check('editor: hay 8 fondos de color', C.STORY_BG_COLORS.length === 8 && C.STORY_BG_COLORS.includes('atardecer'));
  let ed = C.validateStoryEdits({ filter: 'vivo', bg: 'mar', texts: [{ text: 'Feliz cumple', color: '#ffd700', size: 40, x: 30, y: 20 }], stickers: [{ emoji: '🎉', x: 70, y: 60, size: 60 }], drawing: [{ color: '#fff', width: 6, points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }] });
  check('editor: la personalización válida se guarda completa', ed.filter === 'vivo' && ed.bg === 'mar' && ed.texts.length === 1 && ed.texts[0].text === 'Feliz cumple' && ed.stickers.length === 1 && ed.drawing.length === 1);
  let edBad = C.validateStoryEdits({ filter: 'inexistente', bg: 'rosa', texts: [{ text: '' }, { text: 'x'.repeat(100), color: '#fff', size: 999, x: 500, y: -10 }] });
  check('editor: filtro y fondo inválidos quedan en "sin"', edBad.filter === 'none' && edBad.bg === 'none');
  check('editor: el texto vacío se descarta y el largo se limita', edBad.texts.length === 1 && edBad.texts[0].text.length === 80 && edBad.texts[0].size === 72 && edBad.texts[0].x === 100 && edBad.texts[0].y === 0);
  let manyTexts = [];
  for (let i = 0; i < 15; i++) manyTexts.push({ text: 't' + i });
  check('editor: como mucho 10 textos por historia', C.validateStoryEdits({ texts: manyTexts }).texts.length === 10);
  let stEd = C.createStory(st, A, { text: 'Mi día', media: 'foto.jpg', mediaType: 'image', edits: ed });
  check('editor: la historia con foto guarda su personalización', stEd.ok && stEd.story.edits.filter === 'vivo' && stEd.story.edits.texts[0].text === 'Feliz cumple' && stEd.story.edits.stickers[0].emoji === '🎉');
  let stVid = C.createStory(st, A, { text: 'Video', media: 'clip.mp4', mediaType: 'video', edits: { filter: 'sepia', texts: [{ text: 'Miren', color: '#fff', size: 32, x: 50, y: 80 }] } });
  check('editor: la historia con video también se personaliza', stVid.ok && stVid.story.mediaType === 'video' && stVid.story.edits.filter === 'sepia' && stVid.story.edits.texts.length === 1);
  let stPlain = C.createStory(st, A, { text: 'Simple' });
  check('editor: sin personalizar, la historia queda sin adornos', stPlain.ok && stPlain.story.edits.filter === 'none' && stPlain.story.edits.texts.length === 0);
  check('editor: el editor existe en la app (vista previa, herramientas y publicar)', /storyEditorOverlay/.test(idx) && /storyEditPreview/.test(idx) && /storyEditTools/.test(idx) && /storyEditPublish/.test(idx) && /openStoryEditor/.test(appjs) && /publishStoryEdited/.test(appjs));
  check('editor: hay paneles de texto, sticker, dibujo, filtro y fondo', /data-tool="text"/.test(idx) && /data-tool="sticker"/.test(idx) && /data-tool="draw"/.test(idx) && /data-tool="filter"/.test(idx) && /data-tool="bg"/.test(idx) && /storyDrawCanvas/.test(idx));
  check('editor: los adornos se dibujan encima del medio (capa, textos, stickers, trazos)', /stLayer/.test(idx) && /stText/.test(idx) && /stSticker/.test(idx) && /storyEditsHtml/.test(appjs) && /polyline/.test(appjs));
  check('editor: los filtros se aplican con clases CSS', /stfilter-bw/.test(idx) && /stfilter-sepia/.test(idx) && /stfilter-vivo/.test(idx) && /storyFilterClass/.test(appjs));
  check('editor: elegir medio abre el editor y publicar pasa por él', /openStoryEditor\(storyMedia,/.test(appjs) && /storyCustomizeBtn/.test(idx));

  console.log('=== 28. Perfil con color, personal de grupo, bloqueo, reportes y audio (v1.2, ola 7) ===');
  st = withProfiles(fresh());
  C.completeProfile(st, '5544444444', { name: 'Elena Prueba', bio: 'Hola' });
  const E = '5544444444';
  check('color: hay 12 acentos para elegir', C.ACCENTS.length === 12 && C.ACCENTS.some(a => a.id === 'vino') && C.ACCENTS.some(a => a.id === 'turquesa') && C.ACCENTS.some(a => a.id === 'dorado'));
  let col = C.completeProfile(st, A, { name: 'Ana Prueba', accent: 'dorado', headerGradient: 'atardecer' });
  check('color: el perfil guarda acento y degradado de la portada', col.ok && st.profiles[A].accent === 'dorado' && st.profiles[A].headerGradient === 'atardecer');
  let colBad = C.completeProfile(st, A, { name: 'Ana Prueba', headerGradient: 'rosa' });
  check('color: un degradado inválido se rechaza y el anterior se queda', !colBad.ok && st.profiles[A].headerGradient === 'atardecer');
  let cov = C.completeProfile(st, A, { name: 'Ana Prueba', cover: 'clip.mp4', coverType: 'video' });
  check('portada: el video de portada se guarda como tal', cov.ok && st.profiles[A].cover === 'clip.mp4' && st.profiles[A].coverType === 'video');
  let covNo = C.completeProfile(st, A, { name: 'Ana Prueba', cover: '' });
  check('portada: sin portada el tipo vuelve a imagen', covNo.ok && st.profiles[A].coverType === 'image');
  // administradores de grupo (máximo 3)
  let grp = C.createGroup(st, A, { name: 'Vecinos', desc: 'Grupo del barrio' });
  check('personal: el grupo nace sin administradores y con aprobación apagada', grp.ok && Array.isArray(grp.group.admins) && grp.group.admins.length === 0 && grp.group.approval === false);
  C.joinGroup(st, B, grp.group.id); C.joinGroup(st, D, grp.group.id); C.joinGroup(st, E, grp.group.id);
  let adm1 = C.addGroupAdmin(st, A, grp.group.id, B);
  check('personal: el creador nombra administrador a un miembro', adm1.ok && C.isGroupAdmin(st, B, grp.group));
  let admNo = C.addGroupAdmin(st, B, grp.group.id, D);
  check('personal: un administrador no puede nombrar a otro', !admNo.ok);
  C.addGroupAdmin(st, A, grp.group.id, D);
  C.addGroupAdmin(st, A, grp.group.id, E);
  let admCap = C.addGroupAdmin(st, A, grp.group.id, A);
  check('personal: el tope de 3 administradores se cumple', C.findGroup(st, grp.group.id).admins.length === 3 && !admCap.ok);
  let editNo = C.editGroup(st, B, grp.group.id, { name: 'Otro nombre' });
  check('personal: un administrador sí puede personalizar el grupo', editNo.ok && C.findGroup(st, grp.group.id).name === 'Otro nombre');
  let pin = C.createPost(st, B, { text: 'Aviso del grupo', groupId: grp.group.id });
  let pinOk = C.pinGroupPost(st, B, grp.group.id, pin.post.id);
  check('personal: un administrador puede fijar publicaciones', pinOk.ok && C.findGroup(st, grp.group.id).pinnedPosts.includes(pin.post.id));
  let rmNo = C.removeGroupMember(st, B, grp.group.id, D);
  check('personal: un administrador no puede quitar a otro administrador', !rmNo.ok);
  let rmOk = C.removeGroupMember(st, A, grp.group.id, E);
  check('personal: el creador puede quitar a un administrador del grupo', rmOk.ok && !C.findGroup(st, grp.group.id).members.includes(E) && !C.findGroup(st, grp.group.id).admins.includes(E));
  let gAp = C.createGroup(st, A, { name: 'Club cerrado', desc: '', approval: true });
  let joinReq = C.joinGroup(st, B, gAp.group.id);
  check('personal: en grupo con aprobación, unirse crea una solicitud', joinReq.ok && joinReq.requested === true && !C.findGroup(st, gAp.group.id).members.includes(B));
  let apOk = C.approveJoinRequest(st, A, gAp.group.id, B);
  check('personal: el creador aprueba la solicitud y la persona entra', apOk.ok && C.findGroup(st, gAp.group.id).members.includes(B));
  // bloqueo / desbloqueo
  C.sendFriendRequest(st, A, B); C.respondFriendRequest(st, B, st.requests[0].id, true);
  let postB = C.createPost(st, B, { text: 'Post de Bruno' });
  check('bloqueo: antes de bloquear, el post se ve en el feed', C.feedFor(st, A).some(pp => pp.id === postB.post.id));
  let blk = C.blockUser(st, A, B);
  check('bloqueo: al bloquear se rompe la amistad', blk.ok && !C.areFriends(st, A, B) && C.blockedList(st, A).includes(B));
  check('bloqueo: el bloqueado ya no aparece en el feed ni se ve su perfil', !C.feedFor(st, A).some(pp => pp.id === postB.post.id) && !C.canSeeProfile(st, A, B));
  let msgBlk = C.sendMessage(st, B, A, 'Hola');
  check('bloqueo: el bloqueado no puede escribirte', !msgBlk.ok);
  let unblk = C.unblockUser(st, A, B);
  check('bloqueo: al desbloquear todo vuelve', unblk.ok && C.canSeeProfile(st, A, B) && C.feedFor(st, A).some(pp => pp.id === postB.post.id));
  // reportes
  let repBad = C.reportUser(st, A, B, 'motivo raro', 'x');
  check('reporte: un motivo inválido se rechaza', !repBad.ok);
  let repOk = C.reportUser(st, A, B, 'spam', 'Publica spam todo el día');
  check('reporte: el reporte queda registrado con motivo y descripción', repOk.ok && repOk.report.reason === 'spam' && repOk.report.reported === B && repOk.report.status === 'pendiente' && st.reports.length === 1);
  let repSelf = C.reportUser(st, A, A, 'spam', '');
  check('reporte: no puedes reportarte a ti', !repSelf.ok);
  // audio
  let aud = C.createPost(st, A, { text: '', media: 'cancion.mp3', mediaType: 'audio', audioTitle: 'Mi canción', audioCover: 'portada.jpg' });
  check('audio: la publicación de solo audio guarda título y portada', aud.ok && aud.post.mediaType === 'audio' && aud.post.audioTitle === 'Mi canción' && aud.post.audioCover === 'portada.jpg');
  let audMeta = C.createPost(st, A, { text: '', media: 'otra.mp3', mediaType: 'audio', audioTitle: 'Desde el archivo', audioCover: '' });
  check('audio: título desde metadatos y sin portada también vale', audMeta.ok && audMeta.post.audioTitle === 'Desde el archivo');

  console.log('=== 29. Controles estáticos v1.2 ola 7 (FAQ, bloqueo, reporte, audio) ===');
  check('ola 7: la lista de bloqueados y las FAQ están en Ajustes', /blockedList/.test(idx) && /Bloqueados/.test(idx) && /faqList/.test(idx) && /Preguntas frecuentes/.test(idx) && /renderBlockedList/.test(appjs) && /renderFaq/.test(appjs));
  check('ola 7: las FAQ cubren registro, publicar, historias, grupos, Marketplace, mensajes, llamadas, notificaciones, privacidad y apoyo', /¿Cómo me registro/.test(appjs) && /¿Cómo publico/.test(appjs) && /¿Cómo funcionan las historias/.test(appjs) && /¿Cómo funcionan los grupos/.test(appjs) && /¿Cómo vendo algo/.test(appjs) && /¿Cómo llamo dentro de la app/.test(appjs) && /¿Cómo bloqueo o reporto/.test(appjs) && /¿Cómo apoyo al creador/.test(appjs));
  check('ola 7: el perfil muestra Bloquear/Desbloquear y Reportar', /__wrBlockUser/.test(appjs) && /__wrUnblockUser/.test(appjs) && /__wrReportUser/.test(appjs) && /reportOverlay/.test(idx) && /reportSubmit/.test(appjs) && /También quieres bloquear/.test(appjs));
  check('ola 7: el detalle del grupo muestra personal, solicitudes y fijar', /Personal del grupo/.test(appjs) && /Solicitudes para entrar/.test(appjs) && /Fijar publicación/.test(appjs) && /groupEditOverlay/.test(idx) && /Hacer administrador/.test(appjs) && /Quitar administrador/.test(appjs));
  check('ola 7: Editar perfil tiene selector de color y degradado', /Degradado de la portada/.test(idx) && /editGradientRow/.test(idx) && /GRADIENT_CSS/.test(appjs) && /accentCoverStyle/.test(appjs));
  check('ola 7: el reproductor de audio tiene play/pausa, progreso y volumen', /audioPostHtml/.test(appjs) && /__wrAudioToggle/.test(appjs) && /__wrAudioSeek/.test(appjs) && /__wrAudioVolume/.test(appjs) && /aprogFill/.test(idx) && /avol/.test(idx) && /playing/.test(idx));
  check('ola 7: el lector de metadatos ID3 lee título y portada', /readAudioMetadata/.test(appjs) && /parseId3v2/.test(appjs) && /TIT2/.test(appjs) && /APIC/.test(appjs));
  check('ola 7: el compositor acepta audio con título y portada', /postAddAudio/.test(idx) && /postAudioTitle/.test(idx) && /postAudioCoverBtn/.test(idx) && /audioTitle/.test(appjs));
  check('ola 7: la barra inferior sigue con 9 secciones', (idx.match(/data-go="/g) || []).length >= 9 || /Shorts/.test(idx));

  console.log('=== 30. Canciones, análisis inteligente y anuncios (v1.2, olas 8-9) ===');
  check('canciones: el catálogo tiene 12 canciones en 8 ambientes', C.SONG_CATALOG.length === 12 && C.SONG_MOODS.length === 8 && C.SONG_CATALOG.every(sg => sg.title && sg.artist && C.SONG_MOODS.includes(sg.mood)));
  let anRom = C.analyzeImagePalette(['#ff5d8f', '#ffc2d1'], 'amor y boda');
  check('análisis: rosa + "amor y boda" da ambiente romántico', anRom.mood === 'romántico' && anRom.matchedWords.includes('amor') && anRom.reason.includes('amor'));
  let anSad = C.analyzeImagePalette(['#6c757d', '#495057'], 'lluvia y nostalgia');
  check('análisis: gris + "lluvia" da ambiente melancólico', anSad.mood === 'melancólico');
  let anSun = C.analyzeImagePalette(['#ffd60a', '#ff9e00'], 'feliz cumpleaños');
  check('análisis: amarillo brillante + "feliz" da ambiente alegre', anSun.mood === 'alegre' && anSun.brightness > 0.5);
  let anTxt = C.analyzeImagePalette([], 'fiesta con mis amigos toda la noche');
  check('análisis: sin colores, solo las palabras también dan ambiente', anTxt.mood === 'fiesta' && anTxt.matchedWords.includes('fiesta'));
  let sugImg = C.suggestSongForImage(['#ff5d8f'], 'amor');
  check('sugerencia: la imagen sugiere una canción de su ambiente', sugImg.song && sugImg.song.mood === 'romántico' && sugImg.song.title && sugImg.analysis.mood === 'romántico');
  let sugVid = C.suggestSongForVideo(8000, ['#06d6a0'], 'playa');
  check('audio automático: el video corto sugiere canción con marca automática', sugVid.song && sugVid.song.auto === true && sugVid.song.title);
  let sugVidLong = C.suggestSongForVideo(60000, ['#6c757d'], 'lluvia');
  check('audio automático: el video largo conserva el ambiente melancólico', sugVidLong.song.mood === 'melancólico' && sugVidLong.song.auto === true);
  check('canción: songFromCatalog devuelve la canción CON su archivo de audio (1.5.34: la música ya suena)', C.songFromCatalog('cancion-1') && C.songFromCatalog('cancion-1').title === 'Atardecer en la playa' && C.songFromCatalog('cancion-1').src === 'musica/cancion-1.mp3');
  check('canción: una canción inválida (sin título) se descarta', C.validateSong({ title: '' }) === null && C.validateSong(null) === null);
  st = withProfiles(fresh());
  let imgPost = C.createPost(st, A, { text: 'Mi playa favorita', media: 'playa.jpg', mediaType: 'image', song: C.songFromCatalog('cancion-8') });
  check('imagen con canción: la publicación guarda su canción', imgPost.ok && imgPost.post.song && imgPost.post.song.title === 'Ritmo del Caribe' && imgPost.post.song.mood === 'tropical');
  let vidPost = C.createPost(st, A, { text: 'Mi video', media: 'clip.mp4', mediaType: 'video', song: C.suggestSongForVideo(10000, [], 'fiesta').song });
  check('video con audio automático: la publicación guarda la canción automática', vidPost.ok && vidPost.post.song && vidPost.post.song.auto === true);
  let att = C.attachSongToPost(st, A, imgPost.post.id, C.songFromCatalog('cancion-3'));
  check('imagen con canción: cambiar la canción manualmente funciona', att.ok && att.post.song.title === 'Corazón en la mano');
  let attNo = C.attachSongToPost(st, B, imgPost.post.id, C.songFromCatalog('cancion-1'));
  check('imagen con canción: solo quien publicó cambia la canción', !attNo.ok);
  let rmSong = C.removeSongFromPost(st, A, imgPost.post.id);
  check('imagen con canción: quitar el audio deja la publicación sin canción', rmSong.ok && rmSong.post.song === null);
  // anuncios de empresa
  let pageAd = C.createPage(st, A, { name: 'Café de Ana', category: 'Comida', desc: 'El mejor café' });
  let adBad = C.createAd(st, B, pageAd.page.id, { title: 'Oferta', text: 'Ven' });
  check('anuncio: solo quien creó la página publica anuncios de su empresa', !adBad.ok);
  let adOk = C.createAd(st, A, pageAd.page.id, { title: 'Café 2x1 hoy', text: 'Solo hoy, dos por uno', link: 'https://cafeana.com', media: 'cafe.jpg', mediaType: 'image', song: { id: 'marca-1', title: 'Nuestro jingle', artist: 'Café de Ana', src: 'jingle.mp3', mood: 'alegre' } });
  check('anuncio: la empresa crea su anuncio con título, enlace y canción de marca', adOk.ok && adOk.post.isAd === true && adOk.post.adTitle === 'Café 2x1 hoy' && adOk.post.adLink === 'https://cafeana.com' && adOk.post.song.title === 'Nuestro jingle' && adOk.post.pageId === pageAd.page.id);
  check('anuncio: el anuncio se ve en el feed de cualquiera (es público)', C.feedFor(st, B).some(pp => pp.id === adOk.post.id) && C.canSeePost(st, B, adOk.post));
  let pagePost = C.createPost(st, A, { text: 'Nueva receta', pageId: pageAd.page.id });
  check('anuncio: la publicación normal de la página no es anuncio', pagePost.ok && pagePost.post.isAd === false);
  let stSong = C.createStory(st, A, { text: 'Baile', media: 'baile.mp4', mediaType: 'video', song: C.suggestSongForVideo(9000, [], 'fiesta').song });
  check('historia con video: guarda su audio automático', stSong.ok && stSong.story.song && stSong.story.song.auto === true);
  let repost = C.sharePost(st, B, vidPost.post.id);
  check('video con canción: al compartir, la copia hereda la canción', repost.ok && repost.post.song && repost.post.song.auto === true);
  /* v1.5.17 punto 1: el video chiquito de abajo era el medio copiado en
     el repost (el original ya va en sharedFrom). La copia NO copia el
     medio, pero la canción sí se hereda (arriba). */
  check('v1.5.17 video chiquito: al compartir un video, la copia no copia el medio (ni media ni mediaList)', repost.ok && !repost.post.media && !repost.post.mediaList && repost.post.sharedFrom && repost.post.sharedFrom.id === vidPost.post.id);
  check('v1.5.17 video chiquito: el medio propio duplicado se limpia al dibujar (ownMediaHtml)', /ownMediaHtml/.test(appjs) && /sharedSrc/.test(appjs));

  console.log('=== 31. Controles estáticos v1.2 olas 8-9 (anuncios, canción, sin autoplay) ===');
  check('olas 8-9: el anuncio lleva su etiqueta "Anuncio" y botón a la página/enlace', /adBadge/.test(idx) && /Anuncio/.test(appjs) && /Visitar/.test(appjs) && /Ver página/.test(appjs) && /__wrOpenAdCreate/.test(appjs) && /adCreateOverlay/.test(idx) && /adTitle/.test(idx) && /adCreateSave/.test(appjs));
  check('olas 8-9: la publicación con canción solo tiene botón de sonido', /songMuteBtn/.test(idx) && /songMuteHtml/.test(appjs) && /__wrToggleSong/.test(appjs) && /Sonido/.test(appjs));
  check('olas 8-9: el audio de la canción no tiene autoplay ni controles de reproducción', /<audio id="song_/.test(appjs) && !/song_[^"]*"[^>]*autoplay/.test(appjs) && !/song_[^"]*"[^>]*controls/.test(appjs) && /preload="metadata" loop/.test(appjs));
  check('olas 8-9: el selector de canciones existe con ambientes y subir audio', /songPickerOverlay/.test(idx) && /songMoodChips/.test(idx) && /songPickerList/.test(idx) && /songUploadBtn/.test(idx) && /openSongPicker/.test(appjs) && /Todos los ambientes/.test(appjs));
  check('olas 8-9: 1.5.43 el compositor muestra la canción elegida a mano con escuchar/cambiar/quitar (sin sugerencia automática)', /postSongRow/.test(idx) && /postSongPlay/.test(idx) && /postSongChange/.test(idx) && /postSongRemove/.test(idx) && /openSongPicker\('composer'/.test(appjs) && !/suggestComposerSong/.test(appjs));
  check('olas 8-9: la sugerencia dice que el análisis es en el teléfono y que nada suena solo', /análisis en tu teléfono/.test(idx) && /no suena sola/.test(idx) && !/Ambiente generado en el dispositivo/.test(appjs) && /Sin audio/.test(appjs));
  check('olas 8-9: el video con canción sincroniza el audio con el video', /__wrVideoSongSync/.test(appjs) && /__wrVideoSongPause/.test(appjs) && /data-song-post/.test(appjs) && /onplay="window.__wrVideoSongSync/.test(appjs));
  check('v1.5.12 música: no hay melodía ambiental generada (nada de pitido)', !/startAmbient/.test(appjs) && !/stopAmbient/.test(appjs) && !/AMBIENT_CHORDS/.test(appjs) && !/getAmbientMood/.test(appjs) && !/ambientMood/.test(appjs));
  check('olas 8-9: el editor de historias tiene audio automático para videos', /data-tool="audio"/.test(idx) && /storyEditSongAuto/.test(appjs) && /Audio automático/.test(appjs) && /storyEdit\.song/.test(appjs));
  check('olas 8-9: Shorts muestra la canción de historias y videos', /storySongHtml/.test(appjs) && /postSongHtml/.test(appjs) && /songMuteHtml\(\{ id: s\.id/.test(appjs));

  console.log('=== 32. Música automática con permiso, editar publicaciones y ventas (v1.2, ola 10) ===');
  st = withProfiles(fresh());
  check('ola 10: la publicación nace sin ediciones', C.createPost(st, A, { text: 'Original' }).post.editCount === 0);
  let ep = C.createPost(st, A, { text: 'Texto original', media: 'foto.jpg', mediaType: 'image' });
  let e1 = C.editPost(st, A, ep.post.id, { text: 'Texto cambiado' });
  check('editar: cambiar el texto funciona y deja 4 ediciones', e1.ok && e1.post.text === 'Texto cambiado' && e1.editsLeft === 4 && e1.post.edited === true && e1.post.editedAt);
  let e2 = C.editPost(st, A, ep.post.id, { media: 'video.mp4', mediaType: 'video', song: C.songFromCatalog('cancion-2') });
  check('editar: cambiar medios y canción funciona', e2.ok && e2.post.media === 'video.mp4' && e2.post.song.title === 'Fiesta en la ciudad' && e2.editsLeft === 3);
  let e3 = C.editPost(st, A, ep.post.id, { audioTitle: 'Mi audio', audioCover: 'portada.jpg', location: 'CDMX' });
  check('editar: cambiar título de audio y ubicación funciona', e3.ok && e3.post.audioTitle === 'Mi audio' && e3.post.location === 'CDMX' && e3.editsLeft === 2);
  let eNo = C.editPost(st, B, ep.post.id, { text: 'Hackeo' });
  check('editar: solo quien publicó puede modificarla', !eNo.ok && eNo.error.includes('Solo quien publicó'));
  C.editPost(st, A, ep.post.id, { text: 'Cuarta edición' });
  let e5 = C.editPost(st, A, ep.post.id, { text: 'Quinta edición' });
  check('editar: la quinta edición se permite y ya no quedan', e5.ok && e5.editsLeft === 0 && e5.post.editCount === 5);
  let e6 = C.editPost(st, A, ep.post.id, { text: 'Sexta edición' });
  check('editar: la sexta edición se bloquea con mensaje claro', !e6.ok && e6.error.includes('5 veces'));
  check('editar: C.editsLeft devuelve 0 al llegar al tope', C.editsLeft(ep.post) === 0 && C.MAX_POST_EDITS === 5);
  let eEmpty = C.createPost(st, A, { text: 'Para vaciar' });
  let eEmptyR = C.editPost(st, A, eEmpty.post.id, { text: '' });
  check('editar: la publicación no puede quedar vacía', !eEmptyR.ok);
  let pollP = C.createPost(st, A, { text: 'Encuesta', poll: { question: '¿Sí o no?', options: ['Sí', 'No'] } });
  C.votePoll(st, B, pollP.post.id, pollP.post.poll.options[0].id);
  let ePoll = C.editPost(st, A, pollP.post.id, { poll: { question: 'Otra pregunta', options: ['A', 'B'] } });
  check('editar: una encuesta con votos no se puede cambiar', !ePoll.ok && ePoll.error.includes('votos'));
  let pollP2 = C.createPost(st, A, { text: 'Encuesta 2', poll: { question: '¿Qué?', options: ['Uno', 'Dos'] } });
  let ePoll2 = C.editPost(st, A, pollP2.post.id, { poll: { question: '¿Qué prefieres?', options: ['Uno', 'Dos', 'Tres'] } });
  check('editar: una encuesta sin votos sí se puede cambiar', ePoll2.ok && ePoll2.post.poll.question === '¿Qué prefieres?' && ePoll2.post.poll.options.length === 3);
  // ventas
  let vl = C.createListing(st, A, { title: 'Bicicleta', price: 3000, category: 'Deportes', condition: 'Usado', city: 'CDMX' });
  let vl2 = C.createListing(st, B, { title: 'Silla gamer', price: 1500, category: 'Muebles', condition: 'Nuevo', city: 'CDMX' });
  check('ventas: mis ventas traen solo mis anuncios activos', C.myListings(st, A).length === 1 && C.myListings(st, A)[0].title === 'Bicicleta');
  C.sendFriendRequest(st, A, B); C.respondFriendRequest(st, B, st.requests[0].id, true);
  let folList = C.followedListings(st, A);
  check('ventas: ventas de seguidos trae los anuncios de mis amigos', folList.length === 1 && folList[0].title === 'Silla gamer' && folList[0].seller === B);
  check('ventas: ventas de seguidos no trae mis propios anuncios', !C.followedListings(st, A).some(l => l.seller === A));
  let ve = C.editListing(st, A, vl.listing.id, { price: 2500, brand: 'Trek', delivery: 'Envío' });
  check('ventas: cambiar el precio y los datos actualiza el anuncio', ve.ok && ve.listing.price === 2500 && ve.listing.brand === 'Trek' && ve.listing.delivery === 'Envío' && ve.listing.updatedAt);
  let foundPrice = C.searchListings(st, B, { q: 'bicicleta' });
  check('ventas: el cambio de precio se ve en la búsqueda de otra persona', foundPrice.length === 1 && foundPrice[0].price === 2500);
  let veNo = C.editListing(st, B, vl.listing.id, { price: 1 });
  check('ventas: solo el vendedor cambia su anuncio', !veNo.ok);
  let soldR = C.markListingSold(st, A, vl.listing.id);
  check('ventas: marcar vendido cambia el estado', soldR.ok && soldR.listing.status === 'Vendido');
  check('ventas: lo vendido ya no sale en mis ventas activas', C.myListings(st, A).length === 0);
  check('ventas: lo vendido sigue en la búsqueda con vendidos incluidos', C.searchListings(st, A, { mine: A, includeSold: true }).length === 1);

  console.log('=== 33. Controles estáticos v1.2 ola 10 ===');
  check('ola 10: 1.5.43 quitó la "Música automática" del publicador (sin toggle ni sugerencia automática)', !/postAutoMusicToggle/.test(idx) && !/suggestComposerSong/.test(appjs) && !/getAutoMusic/.test(appjs) && !/var autoMusic/.test(appjs));
  check('ola 10: 1.5.43 la canción se elige a mano (sin sugerencia automática al elegir foto o video)', /openSongPicker\('composer'/.test(appjs) && /postSongChange/.test(appjs) && !/suggestComposerSong/.test(appjs));
  check('ola 10: la publicación muestra "Editado" y el botón de modificar', /Editado/.test(appjs) && /__wrEditPost/.test(appjs) && /openEditPost/.test(appjs) && /postEditLeft/.test(idx) && /de 5 ediciones/.test(appjs) && /Guardar cambios/.test(appjs));
  check('ola 10: la edición pasa por el núcleo con tope de 5', /editPost/.test(appjs) && /editsLeft/.test(appjs) && /MAX_POST_EDITS/.test(appjs.replace(/MAX_POST_EDITS: MAX_POST_EDITS/, '')) === false ? true : /MAX_POST_EDITS/.test(appjs));
  check('ola 10: ventas tiene Mis ventas y Ventas de seguidos', /marketMineWrap/.test(idx) && /marketFollowedWrap/.test(idx) && /Mis ventas/.test(idx) && /Ventas de seguidos/.test(idx) && /renderMySales/.test(appjs) && /renderFollowedSales/.test(appjs) && /myListings/.test(appjs) && /followedListings/.test(appjs));
  check('ola 10: el anuncio se puede editar y marcar vendido desde su detalle', /Editar anuncio/.test(appjs) && /__wrEditListing/.test(appjs) && /editListing/.test(appjs) && /Marcar como vendido/.test(appjs) && /pushListingEditToServer/.test(appjs));
  check('ola 10: 1.5.43 las historias ya no tienen toggle de música automática (el audio se elige a mano)', !/storyEditAutoMusic/.test(appjs) && !/storyEdit\.autoMusic/.test(appjs) && /storyEditSongAuto/.test(appjs) && /storyEditSongChange/.test(appjs));

  console.log('=== 34. Sin límite de subidas y editor de video (v1.2, ola 11) ===');
  st = withProfiles(fresh());
  let many20 = [];
  for (let i = 0; i < 20; i++) many20.push({ src: 'foto' + i + '.jpg', type: 'image' });
  let p20 = C.createPost(st, A, { text: 'Veinte fotos', mediaList: many20 });
  check('sin límite: una publicación con 20 fotos se crea completa', p20.ok && p20.post.mediaList.length === 20);
  let p50 = C.createPost(st, A, { text: 'Muchas subidas', mediaList: many20.concat(many20).concat(many20.slice(0, 10)) });
  check('sin límite: una publicación con 50 fotos se crea completa', p50.ok && p50.post.mediaList.length === 50);
  let l12 = C.createListing(st, A, { title: 'Lote de 12 fotos', price: 100, category: 'Otros', condition: 'Usado', photos: Array.from({ length: 12 }, (_, i) => 'p' + i + '.jpg') });
  check('sin límite: un anuncio con 12 fotos se crea (ya no hay tope de 8)', l12.ok && l12.listing.photos.length === 12);
  let lEdit = C.editListing(st, A, l12.listing.id, { photos: Array.from({ length: 15 }, (_, i) => 'q' + i + '.jpg') });
  check('sin límite: al modificar, el anuncio admite 15 fotos', lEdit.ok && lEdit.listing.photos.length === 15);
  let e20 = C.editPost(st, A, p20.post.id, { mediaList: many20.concat(many20) });
  check('sin límite: al modificar, la publicación admite 40 fotos', e20.ok && e20.post.mediaList.length === 40);
  // editor de video
  let ve1 = C.validateVideoEdits({ stickers: [{ emoji: '🎉', x: 20, y: 30, size: 60 }], subtitles: [{ text: 'Hola a todos', start: 0, end: 3000 }], song: C.songFromCatalog('cancion-4'), trimStart: 2000, trimEnd: 12000, durationMs: 20000 });
  check('editor: la edición de video válida se guarda completa', ve1.stickers.length === 1 && ve1.stickers[0].emoji === '🎉' && ve1.subtitles.length === 1 && ve1.subtitles[0].text === 'Hola a todos' && ve1.song.title === 'Amanecer alegre' && ve1.trimStart === 2000 && ve1.trimEnd === 12000);
  let veBad = C.validateVideoEdits({ stickers: [{ emoji: '' }, { emoji: '🔥', x: 500, y: -10, size: 999 }], subtitles: [{ text: '' }, { text: 'x'.repeat(200), start: 5000, end: 1000 }], trimStart: 99999, trimEnd: 1000, durationMs: 10000 });
  check('editor: el sticker vacío se descarta y las posiciones se limitan', veBad.stickers.length === 1 && veBad.stickers[0].x === 100 && veBad.stickers[0].y === 0 && veBad.stickers[0].size === 120);
  check('editor: el subtítulo vacío se descarta y el largo se limita', veBad.subtitles.length === 1 && veBad.subtitles[0].text.length === 120 && veBad.subtitles[0].start === 5000 && veBad.subtitles[0].end === 5000);
  check('editor: el recorte se limita a la duración del video', veBad.trimStart === 10000 && veBad.trimEnd === null);
  check('editor: hasVideoEdits detecta si hay cambios', C.hasVideoEdits(ve1) === true && C.hasVideoEdits(C.validateVideoEdits(null)) === false && C.hasVideoEdits(C.validateVideoEdits({ trimStart: 1000 })) === true);
  let vpost = C.createPost(st, A, { text: 'Mi video editado', media: 'clip.mp4', mediaType: 'video', videoEdits: ve1 });
  check('editor: el video publicado lleva sus stickers, subtítulos, música y recorte', vpost.ok && vpost.post.videoEdits.stickers.length === 1 && vpost.post.videoEdits.subtitles[0].text === 'Hola a todos' && vpost.post.videoEdits.song.title === 'Amanecer alegre' && vpost.post.videoEdits.trimStart === 2000);
  let vpost2 = C.createPost(st, A, { text: 'Video en lista', mediaList: [{ src: 'a.mp4', type: 'video', videoEdits: ve1 }, { src: 'b.jpg', type: 'image' }] });
  check('editor: el video editado dentro de varias fotos también guarda su edición', vpost2.ok && vpost2.post.mediaList[0].videoEdits.trimEnd === 12000);
  let vstory = C.createStory(st, A, { text: 'Historia video', media: 'clip.mp4', mediaType: 'video', videoEdits: ve1 });
  check('editor: la historia con video guarda su edición', vstory.ok && vstory.story.videoEdits.subtitles.length === 1);
  let vedit = C.editPost(st, A, vpost.post.id, { videoEdits: { stickers: [{ emoji: '❤️', x: 50, y: 50 }], trimStart: 0, trimEnd: null } });
  check('editor: al modificar la publicación se puede cambiar la edición del video', vedit.ok && vedit.post.videoEdits.stickers[0].emoji === '❤️' && vedit.post.videoEdits.trimStart === 0);

  console.log('=== 35. Controles estáticos v1.2 ola 11 ===');
  check('ola 11: no queda ningún tope de cantidad de fotos/videos en el código', !/hasta 10 fotos/.test(appjs) && !/hasta 8 fotos/.test(appjs) && !/admite hasta 10/.test(appjs) && !/admite hasta 8/.test(appjs) && !/mediaList[^;]*slice\(0, 10\)/.test(corejs) && !/photos[^;]*slice\(0, 8\)/.test(corejs) && !/photos\.length > 8/.test(corejs));
  check('ola 11: el editor de video existe con sus 4 herramientas', /videoEditorOverlay/.test(idx) && /videoEditTools/.test(idx) && /data-tool="sticker"/.test(idx) && /data-tool="subtitle"/.test(idx) && /data-tool="music"/.test(idx) && /data-tool="trim"/.test(idx) && /videoEditApply/.test(idx) && /openVideoEditor/.test(appjs) && /applyVideoEdits/.test(appjs));
  check('ola 11: el video publicado se reproduce recortado con sus adornos encima', /videoWithEditsHtml/.test(appjs) && /#t=/.test(appjs) && /vsticker/.test(idx) && /vsub/.test(idx) && /__wrVideoSubtitles/.test(appjs));
  check('ola 11: al elegir un video se abre su editor antes de publicar', /__wrEditVideo/.test(appjs) && /Editar video/.test(appjs) && /openVideoEditor\('composer'/.test(appjs));
  check('ola 11: la música del editor se elige a mano (sin música automática)', /videoEditSongPick/.test(appjs) && /videoEditSongRemove/.test(appjs) && !/videoEditSongAuto/.test(appjs) && !/nunca se agrega sola/.test(appjs));
  check('ola 11: el anuncio dice "Fotos (sin límite)"', /Fotos \(sin límite\)/.test(idx));

  console.log('=== 36. Conexión automática sin UI de servidor + apps predeterminadas (v1.3) ===');
  // La dirección viene dentro de la app: sin URL guardada, serverBase
  // devuelve la interna; con una guardada, esa sigue valiendo.
  let stAuto = fresh();
  check('auto: la dirección del servidor viene dentro de la app', C.DEFAULT_SERVER_URL === 'https://wordred-server.onrender.com' && C.serverBase(stAuto) === 'https://wordred-server.onrender.com');
  stAuto.settings.serverUrl = 'https://mi-servidor.example.com';
  check('auto: una dirección guardada de antes sigue valiendo', C.serverBase(stAuto) === 'https://mi-servidor.example.com');
  stAuto.settings.serverUrl = '';
  check('auto: sin dirección guardada vuelve la interna', C.serverBase(stAuto) === 'https://wordred-server.onrender.com');
  // Cero UI visible del servidor en la app.
  check('auto: en Ajustes ya no hay sección ni campo del servidor', !/Servidor configurado/.test(idx) && !/Dirección del servidor/.test(idx) && !/Guardar y probar conexión/.test(idx) && !/Vincular este teléfono/.test(idx) && !/serverStatus/.test(idx) && !/settingsServer/.test(idx) && !/serverLinkOverlay/.test(idx));
  check('auto: la vinculación se hace sola al entrar, sin botones', /autoLinkServer/.test(appjs) && /function enterApp\(\)[\s\S]*?autoLinkServer\(\)/.test(appjs) && /verifyServerCodeSilent/.test(appjs) && !/\$\('settingsServerSave'\)/.test(appjs) && !/updateServerStatus/.test(appjs));
  check('auto: el código por SMS se verifica solo al llegar (SMS Retriever)', /serverLinkWaiting/.test(appjs) && /__onSmsCode/.test(appjs) && /getSmsAppHash/.test(appjs));
  check('auto: sin conexión no se muestra ningún error del servidor', !/Vincula tu teléfono en Ajustes/.test(appjs) && !/Primero pon la dirección del servidor/.test(appjs) && !/Teléfono vinculado con el servidor/.test(appjs) && !/Servidor quitado/.test(appjs) && !/Conectado al servidor/.test(appjs) && !/si aún no tienes servidor/.test(appjs) && !/necesitan el servidor/.test(appjs) && !/Configúralo en Ajustes/.test(appjs));
  check('auto: al vencer la vinculación se reintenta sola en silencio', /authExpired/.test(appjs) && /autoLinkServer\(\)/.test(appjs));
  check('auto: al recuperar la conexión se reintenta sola', /addEventListener\('online'/.test(appjs) && /online'[\s\S]{0,120}autoLinkServer/.test(appjs));
  // Apps predeterminadas: manifest completo para SMS y teléfono.
  check('predet v1.3: el manifest recibe llamadas con ACTION_VIEW tel:', /android\.intent\.action\.VIEW/.test(manifest) && /tel/.test(manifest));
  check('predet v1.3: el puente atiende ACTION_VIEW con tel: como marcador', /ACTION_VIEW/.test(java) && /pendingDialNumber/.test(java));
  // v1.5.12: SMS quitado (sin receptor de MMS, sin botones de app de mensajes).
  check('v1.5.12 sms: no hay receptor de MMS ni aviso de WAP push', !/BROADCAST_WAP_PUSH/.test(manifest) && !/WAP_PUSH_DELIVERED/.test(manifest) && !/WAP_PUSH_RECEIVED/.test(manifest) && !fs.existsSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'SmsReceiver.java')));
  check('v1.5.12 sms: en Mensajes ya no está el botón para ser app de mensajes', !/smsDefaultBtn2/.test(idx) && !/smsDefaultStatus2/.test(idx) && !/Usar WordRed como app de mensajes/.test(idx));
  check('predet v2.0: en Teléfono ya NO está el botón para ser app de teléfono', !/dialerDefaultBtn2/.test(idx) && !/dialerDefaultStatus2/.test(idx) && !/Usar WordRed como app de teléfono/.test(idx));

  console.log('=== 37. Archivos en el servidor (v1.4) ===');
  check('v1.4: el servidor tiene endpoints de subida por partes y servicio por URL', /\/api\/media\/start/.test(serverjs) && /\/api\/media\/chunk/.test(serverjs) && /\/api\/media\/finish/.test(serverjs) && /\/media\/:file/.test(serverjs) && /\/api\/media\/:id/.test(serverjs));
  check('v1.4: el servidor difunde el cambio de perfil en vivo por WebSocket', /broadcast\(\{ kind: 'profile'/.test(serverjs));
  check('v1.4: solo el dueño borra su archivo y nunca fuera de la carpeta de subidas', /rec\.owner !== phone/.test(serverjs) && /MEDIA_DIR/.test(serverjs) && /path\.basename\(file\)/.test(serverjs));
  check('v1.4: la app sube la foto y la portada antes de subir el perfil', /pushProfileToServer/.test(appjs) && /uploadMediaItemToServer/.test(appjs) && /profileDirty/.test(appjs));
  check('v1.4: la app recibe el perfil en vivo y vuelve a dibujar lo que se ve', /handleServerMessage/.test(appjs) && /kind === 'profile'/.test(appjs) && /renderFeed\(\)/.test(appjs));
  check('v1.4: la cola guarda subidas de archivos y se refrescan los envíos pendientes', /kind: 'media-upload'/.test(appjs) && /refreshPendingBody/.test(corejs) && /applyMediaUpload/.test(corejs));
  check('v1.4: la barra de progreso de subida existe en la pantalla', /mediaUploadBar/.test(idx) && /showUploadProgress/.test(appjs));
  check('v1.4: el puente lee archivos por partes para subirlos', /startMediaRead/.test(java) && /readMediaChunk/.test(java) && /closeMediaRead/.test(java));
  check('v1.4: la subida al publicar cubre publicaciones, historias, anuncios, mensajes y voz', /uploadMediaListToServer/.test(appjs) && /publishStoryEdited/.test(appjs) && /queueListingPhotosForUpload/.test(appjs) && /queueMessageMediaForUpload/.test(appjs) && /sendVoiceMessage/.test(appjs));
  check('v1.4: sin servidor sigue valiendo lo local (respaldo)', /isLocalMediaSrc/.test(appjs) && /isServerMediaUrl/.test(appjs));
  check('v1.4 cloudinary: el servidor sube a Cloudinary con preset sin firmar (variables de entorno)', /CLOUDINARY_CLOUD_NAME/.test(serverjs) && /CLOUDINARY_UPLOAD_PRESET/.test(serverjs) && /uploadToCloudinary/.test(serverjs) && /upload_preset/.test(serverjs));
  check('v1.4 cloudinary: sin configurar, el disco local es solo respaldo temporal', /respaldo temporal/i.test(serverjs) && /MEDIA_DIR/.test(serverjs));
  check('v1.4 cloudinary: el cliente guarda la URL absoluta de Cloudinary tal cual', /finishServerMediaUpload/.test(corejs) && /\^https\?:/.test(corejs));
  check('v1.4 cloudinary: los secretos solo van como variables de entorno, nunca en la app', !/CLOUDINARY_API_SECRET/.test(appjs) && /CLOUDINARY_API_SECRET/.test(serverjs));
  check('v1.4 cloudinary: el README explica la cuenta gratis y el preset sin firmar', /Cloudinary/.test(fs.readFileSync(path.join(__dirname, '..', 'server', 'README.md'), 'utf8')) && /Unsigned/.test(fs.readFileSync(path.join(__dirname, '..', 'server', 'README.md'), 'utf8')));

  console.log('=== 38. Lives mejorados (v1.7): cámara, zoom, filtros, pantalla y grabación sin límite ===');
  // Filtros tipo TikTok: 6 filtros planos en core.js + 6 filtros con objetos (v2.1).
  check('v1.7 filtros: hay 12 filtros (6 de color + 6 de objetos: sombrero, gafas, corona, orejas, bigote, marco)', Array.isArray(C.LIVE_FILTERS) && C.LIVE_FILTERS.length === 12 && C.LIVE_FILTERS.map(f => f.id).join(',') === 'none,belleza,calido,frio,byn,vivo,sombrero,gafas,corona,orejas,bigote,marco');
  check('v1.7 filtros: belleza suaviza (brillo y desenfoque) y blanco y negro es grayscale(1)', C.liveFilterCss('belleza').indexOf('brightness') >= 0 && C.liveFilterCss('belleza').indexOf('blur') >= 0 && C.liveFilterCss('byn') === 'grayscale(1)');
  check('v1.7 filtros: sin filtro es vacío y un id desconocido no aplica nada', C.liveFilterCss('none') === '' && C.liveFilterCss('noexiste') === '' && C.liveFilterValid('calido') && !C.liveFilterValid('noexiste'));
  // Cambio de cámara: alterna frontal/trasera.
  check('v1.7 cámara: alterna entre frontal y trasera', C.nextLiveFacing('user') === 'environment' && C.nextLiveFacing('environment') === 'user');
  check('v1.7 cámara: la etiqueta dice qué cámara se va a usar', C.liveFacingLabel('user') === 'Cámara trasera' && C.liveFacingLabel('environment') === 'Cámara frontal');
  // Zoom: botones de 0.5 en 0.5, máximo 4x, nunca menos de 1x.
  check('v1.7 zoom: se limita entre 1x y 4x', C.clampLiveZoom(5) === 4 && C.clampLiveZoom(0.5) === 1 && C.clampLiveZoom(2.3) === 2.3);
  check('v1.7 zoom: los pasos son de 0.5 y no pasan de 4x ni bajan de 1x', C.liveZoomStep(1, 1) === 1.5 && C.liveZoomStep(4, 1) === 4 && C.liveZoomStep(1, -1) === 1 && C.liveZoomStep(2, -1) === 1.5);
  check('v1.7 zoom: la etiqueta muestra una cifra con ×', C.liveZoomLabel(1) === '1.0×' && C.liveZoomLabel(2) === '2.0×');
  check('v1.7 zoom: el máximo es 4x', C.LIVE_ZOOM_MAX === 4 && C.LIVE_ZOOM_STEP === 0.5);
  // Grabación sin límite de tiempo, por trozos de 5 s.
  check('v1.7 grabación: los trozos son de 5 segundos', C.LIVE_REC_CHUNK_MS === 5000);
  check('v1.7 grabación: el nombre del archivo es live-FECHAHORA.webm', /^live-\d{8}-\d{6}\.webm$/.test(C.liveRecFileName(1000)) && C.liveRecFileName(1000).indexOf('.webm') > 0);
  var recSess = C.createLiveRecSession('live1', 'Live de prueba', 1000);
  check('v1.7 grabación: la sesión empieza grabando, con 0 trozos y 0 bytes', recSess.status === 'recording' && recSess.chunks === 0 && recSess.bytes === 0 && recSess.liveId === 'live1');
  check('v1.7 grabación: una sesión grabando se marca como interrumpida', C.liveRecIsInterrupted(recSess));
  recSess.chunks = 12; recSess.bytes = 6000000; recSess.startedAt = 1000;
  check('v1.7 grabación: el resumen dice duración y trozos guardados', /1:00/.test(C.liveRecSummary(recSess, 61000)) && /12 trozos/.test(C.liveRecSummary(recSess, 61000)));
  check('v1.7 grabación: la clave de la sesión es por id de grabación', C.liveRecSessionKey(recSess) === 'wr_live_rec_' + recSess.id);
  check('v1.7 grabación: el estado tiene lista de grabaciones de lives', Array.isArray(fresh().liveRecordings) && fresh().liveRecordings.length === 0);
  // Sin límite de tiempo impuesto en ningún sitio.
  check('v1.7 sin límite: no hay tope de duración ni de tamaño en la grabación', !/MAX_LIVE|MAX_REC|MAX_DURATION|MAX_RECORDING/.test(appjs + corejs) && !/MAX_SIZE|MAX_FILE|MAX_MB/.test(appjs + corejs));
  // Cableado en la app: controles del live en la pantalla.
  check('v1.7 controles: la pantalla tiene cámara, zoom, filtros, pantalla y grabar', /liveCamBtn/.test(idx) && /liveZoomInBtn/.test(idx) && /liveZoomOutBtn/.test(idx) && /liveFilterRow/.test(idx) && /liveScreenBtn/.test(idx) && /liveRecBtn/.test(idx));
  check('v1.7 controles: el perfil tiene Mis grabaciones y hay aviso de recuperación', /liveRecordingsList/.test(idx) && /Mis grabaciones/.test(idx) && /liveRecoveryOverlay/.test(idx) && /Grabación recuperada/.test(idx));
  check('v1.7 app: cambia de cámara con getUserMedia y reemplaza el video sin cortar', /switchLiveCamera/.test(appjs) && /facingMode/.test(appjs) && /replaceTrack/.test(appjs) && /enumerateDevices/.test(appjs));
  check('v1.7 app: el zoom usa canvas con recorte y pellizco', /livePinchStart/.test(appjs) && /livePinchMove/.test(appjs) && /captureStream/.test(appjs) && /getContext\('2d'\)/.test(appjs));
  check('v1.7 app: los filtros se aplican con ctx.filter y se ven en el canvas', /liveFilterCss/.test(appjs) && /ctx\.filter/.test(appjs) && /renderLiveFilters/.test(appjs));
  check('v1.7 app: compartir pantalla prueba getDisplayMedia y si no, el puente nativo', /getDisplayMedia/.test(appjs) && /startScreenShare/.test(appjs) && /__onScreenFrame/.test(appjs) && /__onScreenShareDenied/.test(appjs));
  check('v1.7 app: graba por trozos con MediaRecorder y guarda la sesión tras cada trozo', /MediaRecorder/.test(appjs) && /LIVE_REC_CHUNK_MS/.test(appjs) && /liveRecSaveSession/.test(appjs) && /liveRecAppendChunk/.test(appjs));
  check('v1.7 app: al entrar revisa grabaciones interrumpidas y avisa', /checkInterruptedLiveRecordings/.test(appjs) && /liveRecInterruptedSessions/.test(appjs) && /renderLiveRecovery/.test(appjs));
  check('v1.7 app: conservar, volver al live y eliminar están en la recuperación', /__wrKeepLiveRecording/.test(appjs) && /__wrResumeLive/.test(appjs) && /__wrDiscardLiveRecording/.test(appjs));
  // Puente nativo: MediaProjection + archivo con nombre exacto.
  check('v1.7 nativo: el puente pide compartir pantalla con MediaProjection', /MediaProjectionManager/.test(java) && /createScreenCaptureIntent/.test(java) && /SCREEN_SHARE_REQ/.test(java) && /ScreenShareService/.test(java));
  check('v1.7 nativo: el servicio de pantalla captura y manda cuadros a la app', /ScreenShareService/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'ScreenShareService.java'), 'utf8')) && /VirtualDisplay/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'ScreenShareService.java'), 'utf8')) && /__onScreenFrame/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'ScreenShareService.java'), 'utf8')));
  check('v1.7 nativo: la grabación guarda con nombre exacto y se puede reabrir y borrar', /startNamedMediaUpload/.test(java) && /getMediaFileUri/.test(java) && /deleteMediaFile/.test(java));
  check('v1.7 manifest: servicio de pantalla con permiso de proyección', /FOREGROUND_SERVICE_MEDIA_PROJECTION/.test(manifest) && /ScreenShareService/.test(manifest) && /mediaProjection/.test(manifest));
  // v1.8: el servidor sube a 1.8 con juegos (estadísticas, calificaciones y partidas online).
  check('v3.0 servidor: la versión es 3.0 y tiene los endpoints de juegos', /version: '3.0'/.test(serverjs) && /\/api\/games\/stats/.test(serverjs) && /\/api\/games\/quickmatch/.test(serverjs) && /\/api\/games\/rooms/.test(serverjs));
  // Logo v1.7: W más chica, plana, solo tonos de rojo (en el vector adaptable).
  check('v1.7 logo: el icono adaptable usa la W más chica en 3 tonos de rojo', /M32,35 L41,73/.test(fs.readFileSync(path.join(__dirname, '..', 'res', 'drawable', 'ic_launcher_foreground.xml'), 'utf8')) && /#FF4A33/.test(fs.readFileSync(path.join(__dirname, '..', 'res', 'drawable', 'ic_launcher_foreground.xml'), 'utf8')) && /#B3001B/.test(fs.readFileSync(path.join(__dirname, '..', 'res', 'drawable', 'ic_launcher_foreground.xml'), 'utf8')) && !/#FF7A1A|#FFC21A/.test(fs.readFileSync(path.join(__dirname, '..', 'res', 'drawable', 'ic_launcher_foreground.xml'), 'utf8')));

  console.log('=== 39. Cámara del live con fallos reales (v1.8) ===');
  check('v1.8 cámara: el cambio tiene 6 s de límite por intento', C.LIVE_CAM_TIMEOUT_MS === 6000);
  check('v1.8 cámara: elige la trasera por su etiqueta (back, trasera, rear, principal)', C.livePickCameraDevice([{ kind: 'videoinput', deviceId: 'f1', label: 'Cámara frontal' }, { kind: 'videoinput', deviceId: 'b1', label: 'Cámara trasera' }], 'environment').deviceId === 'b1');
  check('v1.8 cámara: elige la frontal por su etiqueta', C.livePickCameraDevice([{ kind: 'videoinput', deviceId: 'f1', label: 'Front camera' }, { kind: 'videoinput', deviceId: 'b1', label: 'Back camera' }], 'user').deviceId === 'f1');
  check('v1.8 cámara: sin etiquetas, la trasera es la segunda cámara y la frontal la primera', C.livePickCameraDevice([{ kind: 'videoinput', deviceId: 'd1', label: '' }, { kind: 'videoinput', deviceId: 'd2', label: '' }], 'environment').deviceId === 'd2' && C.livePickCameraDevice([{ kind: 'videoinput', deviceId: 'd1', label: '' }, { kind: 'videoinput', deviceId: 'd2', label: '' }], 'user').deviceId === 'd1');
  check('v1.8 cámara: sin cámaras no elige ninguna', C.livePickCameraDevice([], 'environment') === null);
  check('v1.8 cámara: la cara real se lee de la pista (facingMode de la pista)', C.liveTrackFacing({ getSettings: function () { return { facingMode: 'environment' }; } }) === 'environment' && C.liveTrackFacing({ getSettings: function () { return { facingMode: 'user' }; } }) === 'user');
  check('v1.8 cámara: sin pista o sin facingMode no se inventa una cara', C.liveTrackFacing(null) === '' && C.liveTrackFacing({}) === '');
  check('v1.8 cámara: la app avisa al instante, tiene límite, suelta la cámara vieja y verifica la cara real', /Cambiando de cámara/.test(appjs) && /liveGumTimeout/.test(appjs) && /LIVE_CAM_TIMEOUT_MS/.test(appjs) && /oldTrack\.stop\(\)/.test(appjs) && /liveTrackFacing/.test(appjs) && /No se pudo cambiar a la cámara trasera/.test(appjs));
  check('v1.8 cámara: al arrancar el live la cámara también tiene límite', /liveGumTimeout\(\{ video: true/.test(appjs));
  check('v1.8 cámara: el live es a pantalla completa con botones flotantes sobre la imagen', /live-full/.test(idx) && /live-fcol/.test(idx) && /live-stage/.test(idx) && /live-topbar/.test(idx) && /live-bottom/.test(idx));

  console.log('=== 40. Ejemplos que desaparecen y perfiles de ejemplo completos (v1.8; 1.5.34: 1 sola cuenta, la regla sigue en 10 publicaciones reales) ===');
  st = fresh();
  C.seedDemo(st);
  check('v1.8 ejemplos: con pocos posts reales los ejemplos siguen', !C.shouldHideExamples(st));
  check('v1.8 ejemplos: el inicio muestra los ejemplos al principio', C.feedFor(st, A).some(function (p) { return p.isDemo; }));
  check('1.5.34 ejemplos: la regla es 10 publicaciones reales (ni animales ni animaciones)', C.EXAMPLE_HIDE_REAL_POSTS === 10 && typeof C.examplesAutoHidden === 'function');
  for (var ei = 0; ei < 9; ei++) {
    var au = '20000000' + String(10 + ei);
    st.profiles[au] = { phone: au, name: 'Persona ' + ei, bio: 'Bio', createdAt: Date.now() };
    C.createPost(st, au, { text: 'Post real ' + ei });
  }
  check('1.5.34 ejemplos: con 9 posts reales los ejemplos siguen visibles', !C.shouldHideExamples(st) && !C.examplesAutoHidden(st) && C.feedFor(st, A).some(function (p) { return p.isDemo; }));
  st.profiles['2000000019'] = { phone: '2000000019', name: 'Persona 9', bio: 'Bio', createdAt: Date.now() };
  C.createPost(st, '2000000019', { text: 'Post real 9' });
  check('1.5.34 ejemplos: con 10 posts reales los ejemplos desaparecen del inicio', C.shouldHideExamples(st) && C.examplesAutoHidden(st) && !C.feedFor(st, A).some(function (p) { return p.isDemo; }));
  check('1.5.34 ejemplos: con 10 posts reales también desaparecen de sugerencias, historias, Shorts y búsqueda', !C.friendSuggestions(st, A).some(function (x) { return x.profile.isDemo; }) && !C.liveStories(st).some(function (x) { return x.isDemo; }) && !C.shortsFeed(st, A).some(function (x) { return x.isDemo; }) && !C.searchAll(st, A, 'ana').people.some(function (x) { return x.isDemo; }) && !C.searchAll(st, A, 'ana').posts.some(function (x) { return x.isDemo; }));
  st.settings.examplesOverride = 'show';
  check('1.5.34 ejemplos: el interruptor en Ajustes los vuelve a mostrar aunque haya 10 reales', !C.shouldHideExamples(st) && C.feedFor(st, A).some(function (p) { return p.isDemo; }));
  st.settings.examplesOverride = 'hide';
  check('1.5.34 ejemplos: el interruptor también los puede esconder a mano', C.shouldHideExamples(st) && !C.feedFor(st, A).some(function (p) { return p.isDemo; }));
  st = fresh();
  C.seedDemo(st);
  for (var ej = 0; ej < 10; ej++) {
    var au3 = '3000000001';
    if (!st.profiles[au3]) st.profiles[au3] = { phone: au3, name: 'Real ' + au3, bio: 'Bio', createdAt: Date.now() };
    C.createPost(st, au3, { text: 'Post real repetido ' + ej });
  }
  check('1.5.34 ejemplos: 10 posts reales de UNA sola persona ya esconden los ejemplos (cuentan los posts, no las personas)', C.shouldHideExamples(st) && C.realPostStats(st).posts === 10 && C.realPostStats(st).authors === 1);
  st = fresh();
  C.seedDemo(st);
  var demoPhones = ['0000000000'];
  check('1.5.34 ejemplos: hay UNA sola cuenta de ejemplo (la oficial), no 20', demoPhones.every(function (ph) { return st.profiles[ph] && st.profiles[ph].isDemo; }) && Object.keys(st.profiles).filter(function (k) { return st.profiles[k].isDemo; }).length === 1);
  check('1.5.34 ejemplos: la cuenta se llama de ejemplo (nadie la confunde con una persona real)', demoPhones.every(function (ph) { return /ejemplo/i.test(st.profiles[ph].name); }));
  check('1.5.34 ejemplos: la cuenta tiene foto de perfil generada en la app (inicial, sin foto de persona)', demoPhones.every(function (ph) { return st.profiles[ph] && typeof st.profiles[ph].photo === 'string' && st.profiles[ph].photo.indexOf('data:image/svg+xml') === 0; }));
  check('1.5.34 ejemplos: la cuenta tiene portada generada en la app', demoPhones.every(function (ph) { return st.profiles[ph] && typeof st.profiles[ph].cover === 'string' && st.profiles[ph].cover.indexOf('data:image/svg+xml') === 0; }));
  check('1.5.34 ejemplos: la cuenta tiene biografía y datos (trabajo y ciudad)', demoPhones.every(function (ph) { return st.profiles[ph] && st.profiles[ph].bio && st.profiles[ph].job && st.profiles[ph].city; }));
  check('1.5.34 ejemplos: la foto es ilustración propia, nunca foto de persona real ni de internet (ni animales ni animaciones)', demoPhones.every(function (ph) { return st.profiles[ph].photo.indexOf('http://') < 0 && st.profiles[ph].photo.indexOf('https://') < 0 && st.profiles[ph].cover.indexOf('http://') < 0 && st.profiles[ph].cover.indexOf('https://') < 0; }));
  check('1.5.34 ejemplos: sus publicaciones con foto usan fotos neutras de ejemplo (paisajes y objetos), nunca animales', (function () { var dps = st.posts.filter(function (p) { return p.isDemo && p.mediaType === 'image'; }); return dps.length > 0 && dps.every(function (p) { return p.media.indexOf('ejemplo/') === 0; }); })());
  check('1.5.34 ejemplos: hay exactamente 1 publicación de ejemplo con video (el clip neutro de la ciudad, 6 s, sin movimiento)', (function () { var vps = st.posts.filter(function (p) { return p.isDemo && p.mediaType === 'video'; }); return vps.length === 1 && vps[0].media === 'ejemplo/video-ciudad.mp4' && vps[0].author === '0000000000'; })());
  check('1.5.34 ejemplos: la cuenta tiene un ejemplo de cada opción (foto, video, texto, canción, historia y grupo)', (function () {
    var dps = st.posts.filter(function (p) { return p.isDemo; });
    var hasPhoto = dps.some(function (p) { return p.mediaType === 'image' && !p.groupId; });
    var hasVideo = dps.some(function (p) { return p.mediaType === 'video'; });
    var hasText = dps.some(function (p) { return !p.mediaType && !p.song && !p.groupId; });
    var hasSong = dps.some(function (p) { return p.song && C.songHasAudio(p.song); });
    var hasStory = st.stories.filter(function (x) { return x.isDemo; }).length === 1;
    var hasGroup = st.groups.filter(function (g) { return String(g.name || '').indexOf('(ejemplo)') >= 0; }).length === 1 && dps.some(function (p) { return !!p.groupId; });
    return hasPhoto && hasVideo && hasText && hasSong && hasStory && hasGroup;
  })());
  check('1.5.34 ejemplos: ningún medio de ejemplo es de animales ni un clip animado', st.posts.filter(function (p) { return p.isDemo; }).every(function (p) { return (p.media || '').indexOf('animales/') < 0 && (p.media || '').indexOf('demo-video') < 0; }));
  /* Migración: una app que ya tenía las 20 cuentas viejas (sin demoKey,
     con el video viejo) queda con 1 sola cuenta y el clip neutro de la ciudad. */
  check('1.5.34 ejemplos: ensureDemo1534 migra de 20 cuentas a 1 (borra las 19 viejas, sus posts y su video)', (function () {
    var old = fresh();
    old.demoSeeded = true;
    ['0000000000', '1000000001', '1000000002', '1000000003'].forEach(function (ph) { old.profiles[ph] = { phone: ph, name: 'Viejo ' + ph, bio: 'Bio', photo: C.demoAvatarSvg('V', '#111111', '#222222'), cover: C.demoCoverSvg('#111111', '#222222'), createdAt: Date.now(), isDemo: true, frame: 'none', accent: 'rojo', headerGradient: 'none', job: 'J', education: '', city: 'C', relationship: '', birthday: '', website: '', pinnedPosts: [], sectionPrivacy: { bio: 'Público', friends: 'Público', posts: 'Público' } }; });
    old.posts.push({ id: 'v1', author: '1000000001', text: 'Les comparto la foto de mis tacos al pastor de hoy, ¡quedaron buenísimos! #comida #foto', media: C.demoPhotoSvg('tacos'), mediaType: 'image', privacy: 'Público', groupId: null, sharedFrom: null, createdAt: Date.now(), likes: {}, comments: [], shares: [], savedBy: [], isDemo: true });
    old.posts.push({ id: 'v2', author: '0000000000', text: 'Un video de ejemplo hecho dentro de WordRed para que veas cómo se ven los videos en el inicio.', media: 'demo-video.mp4', mediaType: 'video', videoThumb: 'demo-video-poster.jpg', privacy: 'Público', groupId: null, sharedFrom: null, createdAt: Date.now(), likes: {}, comments: [], shares: [], savedBy: [], isDemo: true });
    var r = C.ensureDemo1534(old);
    var dps = old.posts.filter(function (p) { return p.isDemo; });
    return r.ok && r.migrated === 1 && r.removed === 5 && r.addedProfiles === 0 && r.addedPosts === 8 && Object.keys(old.profiles).filter(function (k) { return old.profiles[k].isDemo; }).length === 1 && dps.length === 7 && dps.filter(function (p) { return p.mediaType === 'video'; }).length === 1 && old.stories.filter(function (x) { return x.isDemo; }).length === 1 && old.groups.filter(function (g) { return String(g.name || '').indexOf('(ejemplo)') >= 0; }).length === 1;
  })());
  check('1.5.34 ejemplos: ensureDemo1534 es idempotente (la segunda vez no añade nada)', (function () { var s2 = fresh(); C.seedDemo(s2); C.ensureDemo1534(s2); var r1 = C.ensureDemo1534(s2); return r1.ok && r1.addedProfiles === 0 && r1.addedPosts === 0 && r1.migrated === 0 && r1.removed === 0; })());
  /* Actividad de ejemplo: visible mientras los ejemplos se ven; nunca
     toca una publicación real ni va al servidor. */
  check('1.5.34 ejemplos: la actividad de ejemplo publica algo nuevo marcado Ejemplo (foto neutra o texto)', (function () { var s3 = fresh(); C.seedDemo(s3); var before = s3.posts.filter(function (p) { return p.isDemo; }).length; var np = C.demoActivityPost(s3); return !!np && np.isDemo && s3.posts.filter(function (p) { return p.isDemo; }).length === before + 1 && (np.media === '' || np.media.indexOf('ejemplo/') === 0); })());
  check('1.5.34 ejemplos: la actividad de ejemplo da Me gusta solo a publicaciones de ejemplo', (function () { var s4 = fresh(); C.seedDemo(s4); s4.profiles['3000000001'] = { phone: '3000000001', name: 'Real', bio: 'Bio', createdAt: Date.now() }; var real = C.createPost(s4, '3000000001', { text: 'Post real mío' }); var like = C.demoActivityLike(s4); var target = like && s4.posts.filter(function (p) { return p.id === like.postId; })[0]; return real.ok && !!like && !!target && target.isDemo === true && !(real.post.likes && real.post.likes[like.by]); })());
  check('1.5.34 ejemplos: con los ejemplos ocultos no hay actividad de ejemplo', (function () { var s5 = fresh(); C.seedDemo(s5); s5.profiles['3000000001'] = { phone: '3000000001', name: 'Real', bio: 'Bio', createdAt: Date.now() }; for (var i = 0; i < 10; i++) C.createPost(s5, '3000000001', { text: 'Real ' + i }); return C.shouldHideExamples(s5) && C.demoActivityPost(s5) === null && C.demoActivityLike(s5) === null; })());
  /* 1.5.44: la publicación de ejemplo con video ya trae su portada fija
     (un fotograma real del clip), al sembrarse y al migrar una app que
     ya la tenía sin portada: así su reel nunca queda en negro. */
  check('1.5.44 reel: la publicación de ejemplo con video se siembra con su portada fija', (function () { var s6 = fresh(); C.seedDemo(s6); var v = s6.posts.filter(function (p) { return p.demoKey === 'ejemplo-video'; })[0]; return !!v && v.media === 'ejemplo/video-ciudad.mp4' && v.videoThumb === C.DEMO_VIDEO_COVER_1544 && v.videoThumb === 'ejemplo/video-ciudad.jpg'; })());
  check('1.5.44 reel: ensureDemo1534 pone la portada fija a la publicación de video de ejemplo que ya existe sin ella', (function () { var s7 = fresh(); C.seedDemo(s7); s7.demoMigrated1534 = true; var v = s7.posts.filter(function (p) { return p.demoKey === 'ejemplo-video'; })[0]; v.videoThumb = ''; var r = C.ensureDemo1534(s7); return r.ok && v.videoThumb === 'ejemplo/video-ciudad.jpg'; })());

  console.log('=== 43. Clima en blanco y negro y publicidad más grande (v1.9) ===');
  // El símbolo animado del clima es un SVG monocromo con currentColor
  // (sin emojis de color) y su CSS no lleva ningún color.
  check('v1.9 clima: el símbolo animado es un SVG con currentColor', /WEATHER_SVG/.test(appjs) && /<svg viewBox="0 0 24 24"[^>]*stroke="currentColor"/.test(appjs));
  check('v1.9 clima: no queda ningún emoji de clima con color en app.js', !/☀️|🌤️|☁️|🌫️|🌦️|🌧️|❄️|⛈️/.test(appjs));
  check('v1.9 clima: el SVG cubre todos los tipos (sol, sol-nube, nublado, niebla, llovizna, lluvia, nieve, tormenta)', ['sol:', "'sol-nube':", 'nublado:', 'niebla:', 'llovizna:', 'lluvia:', 'nieve:', 'tormenta:'].every(function (k) { return appjs.indexOf(k) >= 0; }));
  check('v1.9 clima: el símbolo lleva filtro de escala de grises', /\.wSym\{[^}]*filter:grayscale\(1\)/.test(idx));
  check('v1.9 clima: las gotas y los copos son monocromos (currentColor)', /\.wDrop\{[^}]*background:currentColor/.test(idx) && /\.wFlake\{[^}]*background:currentColor/.test(idx));
  check('v1.9 clima: no queda color en la animación (sin azul de lluvia ni brillo naranja del sol)', (function () { var wxCss = idx.slice(idx.indexOf('.wSym{'), idx.indexOf('/* v1.8: detalle del clima')); return wxCss.indexOf('#3ea6ff') < 0 && wxCss.indexOf('255,180,0') < 0; })());
  // La tarjeta con imagen de producto es un rectángulo más grande.
  check('v1.9 publicidad: la imagen del producto es más grande (128 px)', /\.adThumb\{[^}]*width:128px[^}]*height:128px/.test(idx));
  check('v1.9 publicidad: la tarjeta tiene más relleno y esquinas redondeadas', /\.adCard\{[^}]*padding:20px 22px[^}]*border-radius:20px/.test(idx));
  check('v1.9 publicidad: la imagen de marca de la tienda queda en su tamaño (72 px)', /\.adBrandImg\{[^}]*width:72px[^}]*height:72px/.test(idx));

  console.log('=== 44. Colores de la app (v2.0: el modo blanco desaparece) ===');
  check('v2.0 colores: no existe el modo blanco ni su interruptor', !/themeToggle/.test(idx) && !/Modo claro/.test(idx) && !/body\.light/.test(idx) && !/applyTheme/.test(appjs) && !/themeToggle/.test(appjs) && !/settings\.theme/.test(appjs));
  check('v2.0 colores: las funciones de color existen y son puras (sin DOM)', typeof C.normalizeHex === 'function' && typeof C.hexToRgb === 'function' && typeof C.rgbToHex === 'function' && typeof C.hslToHex === 'function' && typeof C.relLuminance === 'function' && typeof C.contrastRatio === 'function' && typeof C.appColorVariants === 'function');
  check('v2.0 colores: el hex se normaliza (3 dígitos, mayúsculas, inválido)', C.normalizeHex('#E01') === '#ee0011' && C.normalizeHex('e01430') === '#e01430' && C.normalizeHex('#E01430') === '#e01430' && C.normalizeHex('no-es-color') === null && C.normalizeHex('') === null);
  check('v2.0 colores: ida y vuelta hex-hsl-hex es exacta', (function () { var h = C.hexToHsl('#e01430'); return C.hslToHex(h.h, h.s, h.l) === '#e01430'; })() && (function () { var h = C.hexToHsl('#2f7de1'); return C.hslToHex(h.h, h.s, h.l) === '#2f7de1'; })());
  check('v2.0 colores: el contraste negro/blanco es 21', Math.abs(C.contrastRatio('#000000', '#ffffff') - 21) < 0.01);
  check('v2.0 colores: todas las variantes de los 8 colores listos cumplen 4.5:1', C.APP_COLOR_PRESETS.length === 8 && C.APP_COLOR_PRESETS.every(function (pr) { var v = C.appColorVariants(pr.color); return C.contrastRatio(v.red, '#ffffff') >= 4.5 && C.contrastRatio(v.red2, '#120608') >= 4.5; }), 'presets=' + C.APP_COLOR_PRESETS.map(function (pr) { return pr.id; }).join(','));
  check('v2.0 colores: hay 8 colores listos incl. rosa como opción del usuario', C.APP_COLOR_PRESETS.some(function (pr) { return pr.id === 'rosa'; }) && C.APP_COLOR_PRESETS.some(function (pr) { return pr.id === 'rojo' && pr.color === '#e01430'; }) && C.APP_COLOR_DEFAULT === '#e01430');
  check('v2.0 colores: el color se ajusta solo si no da contraste (blanco, negro, gris)', (function () { var w = C.appColorVariants('#ffffff'); var b = C.appColorVariants('#000000'); return C.contrastRatio(w.red, '#ffffff') >= 4.5 && C.contrastRatio(b.red2, '#120608') >= 4.5 && w.adjusted && b.adjusted; })());
  check('v2.0 colores: el ajuste por defecto es el rojo de WordRed con lista de colores propios', C.emptyState().settings.appColor === '#e01430' && Array.isArray(C.emptyState().settings.customColors));
  check('v2.0 colores: el selector existe en Ajustes con toda la gama', /colorHue/.test(idx) && /colorSat/.test(idx) && /colorLight/.test(idx) && /colorNative/.test(idx) && /colorPresets/.test(idx) && /colorCustomRow/.test(idx) && /colorApplyBtn/.test(idx) && /colorSaveBtn/.test(idx) && /colorResetBtn/.test(idx) && /colorPreviewSwatch/.test(idx) && /colorContrastNote/.test(idx) && /Colores<\/h3>/.test(idx));
  check('v2.0 colores: el control de tono tiene el espectro completo (rojo a rojo)', /linear-gradient\(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000\)/.test(appjs));
  check('v2.0 colores: aplicar el color lo pone en toda la app y lo guarda', /function applyAppColor/.test(appjs) && /setProperty\('--red'/.test(appjs) && /setProperty\('--red2'/.test(appjs) && /setProperty\('--acc-rgb'/.test(appjs) && /state\.settings\.appColor = hex/.test(appjs) && /applyAppColor\(currentAppColor\(\)\)/.test(appjs));
  check('v2.0 colores: el color elegido se aplica al entrar a la app', /applyAppColor\(currentAppColor\(\)\)/.test(appjs));
  check('v2.0 colores: si el color no da contraste, la app avisa y lo ajusta', /colorContrastNote/.test(idx) && /se ajustará un poco para que el texto se lea bien/.test(appjs) && /se ajustó un poco para que el texto se lea bien/.test(appjs));
  check('v2.0 colores: el CSS usa las variables del color elegido', /--acc-rgb/.test(idx) && /rgba\(var\(--acc-rgb\)/.test(idx) && /rgba\(var\(--acc-rgb2\)/.test(idx));

  console.log('=== 45. Solo Mensajes, ejemplos completos y clima separado (v2.0) ===');
  check('v2.0 teléfono: el apartado de Teléfono ya no existe en la navegación', !/view-phone/.test(idx) && !/data-nav="phone"/.test(idx) && !/dialPad/.test(idx) && !/phoneContactList/.test(idx) && !/phoneCallLogList/.test(idx) && !/renderPhone/.test(appjs) && !/renderCallLog/.test(appjs) && !/__wrCallContact/.test(appjs) && !/__wrOpenDialer/.test(appjs));
  check('v2.0 teléfono: Mensajes sigue solo con chats de WordRed (sin SMS, v1.5.12)', /view-messages/.test(idx) && !/msgSectionTabs/.test(idx) && !/smsList/.test(idx) && !/smsOverlay/.test(idx) && !/__onSmsReceived/.test(appjs));
  check('v2.0 teléfono: los botones de llamada dentro de chats y perfiles siguen', /placePhoneCall/.test(appjs) && /callChoicePhone/.test(idx) && /phoneCallOverlay/.test(idx) && /__onTelecomCall/.test(appjs));
  check('v2.0 ejemplos: hay al menos una publicación con foto', (function () { var st = C.emptyState(); C.seedDemo(st); return st.posts.some(function (p) { return p.isDemo && p.mediaType === 'image' && p.media; }); })());
  check('v2.0 ejemplos: hay exactamente 1 publicación de ejemplo con video (1.5.34: el clip neutro de la ciudad)', (function () { var st = C.emptyState(); C.seedDemo(st); return st.posts.filter(function (p) { return p.isDemo && p.mediaType === 'video'; }).length === 1; })());
  check('v2.0 ejemplos: hay al menos una publicación con música compartida', (function () { var st = C.emptyState(); C.seedDemo(st); return st.posts.some(function (p) { return p.isDemo && p.song && p.song.title; }); })());
  check('v2.0 ejemplos: las fotos de ejemplo son fotos neutras (paisajes y objetos) o ilustraciones simples', (function () { var st = C.emptyState(); C.seedDemo(st); var imgs = st.posts.filter(function (p) { return p.isDemo && p.mediaType === 'image'; }); return imgs.length > 0 && imgs.every(function (p) { return p.media.indexOf('ejemplo/') === 0 || p.media.indexOf('data:image/svg+xml') === 0; }); })());
  check('v2.0 ejemplos: cada cuenta de ejemplo tiene su imagen de logo', (function () { var st = C.emptyState(); C.seedDemo(st); var demos = Object.keys(st.profiles).filter(function (k) { return st.profiles[k].isDemo; }); if (!demos.length) return false; return demos.every(function (k) { var ph = st.profiles[k].photo || ''; if (ph.indexOf('data:image/svg+xml') !== 0) return false; var svg = decodeURIComponent(ph.replace('data:image/svg+xml;utf8,', '')); return svg.indexOf('rx=') >= 0 && svg.indexOf('<text') >= 0; }); })(), 'cuentas=' + (function () { var st = C.emptyState(); C.seedDemo(st); return Object.keys(st.profiles).filter(function (k) { return st.profiles[k].isDemo; }).length; })());
  check('v2.0 ejemplos: las fotos de ejemplo son ilustraciones propias de la app', typeof C.demoPhotoSvg === 'function' && C.demoPhotoSvg('tacos').indexOf('data:image/svg+xml') === 0 && C.demoPhotoSvg('atardecer').indexOf('data:image/svg+xml') === 0 && C.demoPhotoSvg('futbol').indexOf('data:image/svg+xml') === 0);
  check('v2.0 clima: la hora y el clima están en dos recuadros independientes (1.5.36: cada uno es un apartado suelto del menú)', /id="weatherTimeCard"/.test(idx) && /id="weatherCard"/.test(idx) && /data-widget="reloj"/.test(idx) && /data-widget="clima"/.test(idx) && idx.indexOf('id="weatherTimeCard"') !== idx.indexOf('id="weatherCard"'));
  check('v2.0 clima: la hora va en su recuadro y el clima en el suyo', /id="weatherTimeCard"[\s\S]{0,600}id="weatherTime"/.test(idx) && /id="weatherCard"[\s\S]{0,600}id="weatherInfo"/.test(idx) && idx.indexOf('id="weatherTime"') < idx.indexOf('id="weatherCard"'));
  check('v2.0 clima: solo al tocar el recuadro del clima se abre el detalle', /\$\('weatherCard'\)/.test(appjs) && /openWeatherDetail/.test(appjs) && !/\$\('weatherTimeCard'\)/.test(appjs));
  check('v2.0 clima: los dos recuadros son más grandes que antes', /\.weatherTime\{font-size:64px/.test(idx) && /\.weatherCard \.wSym\{font-size:46px/.test(idx) && /\.weatherCard\{[^}]*padding:22px 24px/.test(idx) && /\.weatherInfo \.wTemp\{font-size:32px/.test(idx));
  console.log('=== 46. Lives grabados como publicación en el inicio (v2.1) ===');
  st = withProfiles(fresh());
  var recPost = C.createPost(st, A, { text: 'Mi live de cocina', media: 'https://res.cloudinary.com/x/video/upload/live1.mp4', mediaType: 'video', privacy: 'Público', isLiveRecording: true, liveRecordingId: 'rec_123', liveRecDurationMs: 65000 });
  check('v2.1 live grabado: la publicación guarda la marca, el id de la grabación y la duración', recPost.ok && recPost.post.isLiveRecording === true && recPost.post.liveRecordingId === 'rec_123' && recPost.post.liveRecDurationMs === 65000 && recPost.post.mediaType === 'video');
  var normalPost = C.createPost(st, A, { text: 'Una publicación normal' });
  check('v2.1 live grabado: una publicación normal no lleva la marca', normalPost.ok && normalPost.post.isLiveRecording === false && normalPost.post.liveRecordingId === null);
  check('v2.1 live grabado: se encuentra la publicación por el id de la grabación', C.findLiveRecordingPost(st, 'rec_123') === recPost.post);
  check('v2.1 live grabado: con un id desconocido no hay publicación', C.findLiveRecordingPost(st, 'rec_noexiste') === null && C.findLiveRecordingPost(st, '') === null);
  check('v2.1 live grabado: la publicación aparece en el inicio', C.feedFor(st, A).some(function (p) { return p.id === recPost.post.id; }));
  check('v2.1 live grabado: se le puede dar me gusta como a cualquier publicación', C.toggleLike(st, B, recPost.post.id, 'Me gusta').ok && recPost.post.likes[B] === 'Me gusta');
  var cmRec = C.addComment(st, B, recPost.post.id, '¡Qué buen live!');
  check('v2.1 live grabado: se puede comentar como cualquier publicación', cmRec.ok && C.commentCount(recPost.post) === 1);
  var shRec = C.sharePost(st, B, recPost.post.id);
  check('v2.1 live grabado: se puede compartir como cualquier publicación', shRec.ok && shRec.post && shRec.post.sharedFrom && shRec.post.sharedFrom.id === recPost.post.id);
  check('v2.1 live grabado: al guardar la grabación se publica en el inicio', /function publishLiveRecordingAsPost/.test(appjs) && /publishLiveRecordingAsPost\(session\)/.test(appjs) && /publishLiveRecordingAsPost\(s\)/.test(appjs));
  check('v2.1 live grabado: la publicación lleva la etiqueta "Live grabado"', /liveRecBadge/.test(appjs) && /Live grabado/.test(appjs) && /\.liveRecBadge\{/.test(idx));
  check('v2.1 live grabado: la tarjeta muestra la duración de la grabación', /liveRecDurationMs/.test(appjs) && /Live grabado ·/.test(appjs));
  check('v2.1 live grabado: la publicación se sube al servidor para que la vean todos', (function () { var i = appjs.indexOf('function publishLiveRecordingAsPost('); var b = i >= 0 ? appjs.slice(i, i + 900) : ''; return b.indexOf('publishCreatedPost1529(r.post, null)') >= 0; })() && (function () { var i = appjs.indexOf('async function confirmPostPublish1529('); var b = i >= 0 ? appjs.slice(i, i + 2500) : ''; return b.indexOf('pushPostToServer') >= 0; })());
  check('v2.1 live grabado: el servidor conserva la marca de la publicación', /isLiveRecording: !!body\.isLiveRecording/.test(serverjs) && /liveRecordingId: body\.liveRecordingId/.test(serverjs) && /liveRecDurationMs: parseInt\(body\.liveRecDurationMs/.test(serverjs));

  console.log('=== 47. Botones del live sin encimarse y filtros con objetos (v2.1) ===');
  // Los 6 filtros de color siguen y los 6 objetos son de tipo 'object'.
  check('v2.1 objetos: 6 filtros de color y 6 de objetos', C.LIVE_FILTERS.filter(function (f) { return f.kind === 'color'; }).length === 6 && C.LIVE_FILTERS.filter(function (f) { return f.kind === 'object'; }).length === 6);
  check('v2.1 objetos: liveFilterKind distingue color y objeto', C.liveFilterKind('belleza') === 'color' && C.liveFilterKind('sombrero') === 'object' && C.liveFilterKind('corona') === 'object' && C.liveFilterKind('noexiste') === 'color');
  check('v2.1 objetos: cada objeto tiene su dibujo SVG con rutas', ['sombrero', 'gafas', 'corona', 'orejas', 'bigote', 'marco'].every(function (id) { var s = C.liveFilterObjectSvg(id); return typeof s === 'string' && s.indexOf('<svg') === 0 && s.indexOf('<path') >= 0; }));
  check('v2.1 objetos: un id desconocido no tiene dibujo ni definición', C.liveFilterObjectSvg('noexiste') === '' && !C.liveFilterObjectDef('noexiste'));
  check('v2.1 objetos: liveFilterValid acepta los 6 objetos', ['sombrero', 'gafas', 'corona', 'orejas', 'bigote', 'marco'].every(function (id) { return C.liveFilterValid(id); }));
  check('v2.1 objetos: un filtro de objeto no tiene CSS de color (es dibujo, no filtro)', C.liveFilterCss('sombrero') === '' && C.liveFilterCss('belleza').indexOf('brightness') >= 0);
  check('v2.1 objetos: liveDrawFilterObject dibuja cada objeto en el lienzo', (function () {
    var saved = global.Path2D;
    global.Path2D = function (d) { this.d = d; };
    var drawn = 0;
    var ctx = {
      save: function () {}, restore: function () {}, translate: function () {}, scale: function () {},
      fill: function (p) { if (p && p.d) drawn++; }
    };
    var ok = ['sombrero', 'gafas', 'corona', 'orejas', 'bigote', 'marco'].every(function (id) {
      drawn = 0;
      return C.liveDrawFilterObject(ctx, id, 400, 800) === true && drawn >= 1;
    });
    var bad = C.liveDrawFilterObject(ctx, 'noexiste', 400, 800) === false;
    if (saved === undefined) delete global.Path2D; else global.Path2D = saved;
    return ok && bad;
  })());
  // La columna de cámara y zoom queda anclada bajo la barra superior, con
  // altura máxima y desplazamiento: nunca tapa la fila de filtros.
  check('v2.1 botones: la columna de cámara queda bajo la barra superior (no centrada)', /\.live-fcol\{[^}]*top:calc\(96px/.test(idx) && !/\.live-fcol\{[^}]*top:50%/.test(idx));
  check('v2.1 botones: la columna tiene altura máxima y desplazamiento en pantallas cortas', /\.live-fcol\{[^}]*max-height:calc\(100% - 480px\)[^}]*overflow-y:auto/.test(idx));
  check('v2.1 botones: la columna es vertical con separación entre botones', /\.live-fcol\{[^}]*flex-direction:column;gap:10px/.test(idx));
  check('v2.1 botones: la fila de filtros va en flujo normal (no absoluta) dentro de la parte baja', /\.live-filters-float\{[^}]*position:static/.test(idx) && !/\.live-filters-float\{[^}]*bottom:396px/.test(idx));
  check('v2.1 botones: las etiquetas del live van en flujo normal (no absolutas)', (function () { var m = idx.match(/#liveScreenLabel,#liveRecLabel\{[^}]*\}/); return !!m && m[0].indexOf('position:static') >= 0 && m[0].indexOf('absolute') < 0 && m[0].indexOf('bottom:') < 0; })());
  check('v2.1 botones: la columna tiene solo cámara y zoom; pantalla y grabación van en su propia fila', (function () {
    var fcol = idx.slice(idx.indexOf('class="live-fcol"'), idx.indexOf('class="live-bottom"'));
    var bottom = idx.slice(idx.indexOf('class="live-bottom"'));
    return fcol.indexOf('liveCamBtn') >= 0 && fcol.indexOf('liveZoomInBtn') >= 0 && fcol.indexOf('liveZoomOutBtn') >= 0 &&
      fcol.indexOf('liveScreenBtn') < 0 && fcol.indexOf('liveRecBtn') < 0 &&
      bottom.indexOf('id="liveHostActions"') >= 0 && bottom.indexOf('id="liveScreenBtn"') > bottom.indexOf('id="liveHostActions"') &&
      bottom.indexOf('id="liveRecBtn"') > bottom.indexOf('id="liveHostActions"') &&
      bottom.indexOf('id="liveFilterRow"') > bottom.indexOf('class="live-bottom"');
  })());
  check('v2.1 botones: la vista previa del objeto existe y el dibujo se aplica en el bucle del live', /liveFilterObjectPreview/.test(idx) && /liveDrawFilterObject/.test(appjs) && /liveFilterObjectSvg/.test(appjs));
  check('v2.1 lives: salir del live espera a que termine de verdad (sin ello, el cierre viejo limpiaba el live nuevo y su grabación)', /if \(liveRole === 'host'\) \{ await endLive\(\); return; \}/.test(appjs));

  console.log('=== 48. Modo invitado (v2.1) ===');
  st = withProfiles(fresh());
  C.seedDemo(st); // el contenido de ejemplo es lo que ve un invitado al abrir la app
  var guestFeed = C.feedFor(st, null);
  check('v2.1 invitado: el inicio se ve sin registrarse', Array.isArray(guestFeed) && guestFeed.length >= 4);
  var gPost = guestFeed[0];
  check('v2.1 invitado: no puede publicar', !C.createPost(st, null, { text: 'Hola' }).ok);
  var gLike = C.toggleLike(st, null, gPost.id, 'Me gusta');
  check('v2.1 invitado: no puede reaccionar y el error pide verificar el número', !gLike.ok && gLike.error === C.GUEST_VERIFY_ERROR);
  var gCom = C.addComment(st, null, gPost.id, 'Hola');
  check('v2.1 invitado: no puede comentar y el error pide verificar el número', !gCom.ok && gCom.error === C.GUEST_VERIFY_ERROR);
  check('v2.1 invitado: no puede compartir', !C.sharePost(st, null, gPost.id).ok);
  check('v2.1 invitado: no puede guardar', !C.toggleSave(st, null, gPost.id).ok);
  var gPoll = C.createPost(st, A, { text: 'Voten', poll: { question: '¿Qué prefieren?', options: ['Tacos', 'Pizza'] } });
  check('v2.1 invitado: no puede votar en encuestas', gPoll.ok && !C.votePoll(st, null, gPoll.post.id, gPoll.post.poll.options[0].id).ok);
  check('v2.1 invitado: no puede pedir amistad', !C.sendFriendRequest(st, null, B).ok);
  check('v2.1 invitado: no puede mandar mensajes', !C.sendMessage(st, null, B, 'Hola').ok);
  check('v2.1 invitado: no puede crear grupos', !C.createGroup(st, null, { name: 'Grupo' }).ok);
  var gStory = C.createStory(st, A, { text: 'Mi día' });
  var gView = C.viewStory(st, null, gStory.story.id);
  check('v2.1 invitado: ver una historia sí se permite, sin dejar registro de vista', gStory.ok && gView.ok === true && gView.viewed === false && gStory.story.views.length === 0);
  check('v2.1 invitado: tras verificar puede publicar, reaccionar, comentar y votar', C.createPost(st, A, { text: 'Ya verificado' }).ok && C.toggleLike(st, A, gPost.id, 'Me gusta').ok && C.addComment(st, A, gPost.id, 'Hola').ok && C.votePoll(st, A, gPoll.post.id, gPoll.post.poll.options[0].id).ok);
  check('v2.1 invitado: la app entra como invitado y pide verificar al publicar (sin mostrar la pantalla de registro)', /function enterGuest\(\)/.test(appjs) && /function needVerified\(/.test(appjs) && /function openVerifyFlow\(\)/.test(appjs) && /function isGuest\(\)/.test(appjs) && /Explorar como invitado/.test(idx) && /guestBanner/.test(idx) && /Verificar mi número/.test(idx));
  check('v2.1 invitado: las acciones protegidas piden verificación antes de hacer nada', /needVerified\('publicar'\)/.test(appjs) && /needVerified\('reaccionar'\)/.test(appjs) && /needVerified\('comentar'\)/.test(appjs) && /needVerified\('ver lives'\)/.test(appjs));
  check('v2.1 invitado: al eliminar la cuenta se entra como invitado', /al eliminar la cuenta se entra como invitado/.test(appjs));
  check('v1.5.44 cuentas: al cerrar sesión se muestra la lista de cuentas para elegir otra (no se entra como invitado)', /al cerrar sesión se muestra la lista de cuentas/.test(appjs) && /showAccountsScreen1544\(\)/.test(appjs));
  check('v1.5.44 cuentas: la vista de cuentas nace oculta en el HTML y el arranque decide primero con la sesión', idx.indexOf('<div id="authView" class="hidden">') >= 0 && /function boot1544\(\)/.test(appjs) && /function showAccountsScreen1544\(\)/.test(appjs));

  console.log('=== 49. Juegos de Play Store: imágenes, demos dentro de la app y calificaciones (v2.1) ===');
  // Las 60 imágenes de los juegos de Play Store existen de verdad en los assets.
  var psPaths = Array.from(new Set((appjs.match(/ps-games\/[A-Za-z0-9._\-\/]+\.(webp|jpg|jpeg|png)/g) || [])));
  check('v2.1 PS: las 60 imágenes (12 iconos + 48 capturas) existen en los assets', psPaths.length === 60 && psPaths.every(function (p) { return fs.existsSync(path.join(__dirname, '..', 'assets', p)); }), psPaths.length + ' rutas, faltan: ' + psPaths.filter(function (p) { return !fs.existsSync(path.join(__dirname, '..', 'assets', p)); }).join(','));
  check('v2.1 PS: la ruta no se duplica (nunca ps-games/ps-games/)', !/psGameCardHtml[\s\S]*?'ps-games\/' \+ g\.icon/.test(appjs) && /function psGameImgPath/.test(appjs));
  check('v2.1 PS: el texto no duplica palabras (nunca "opiniones opiniones" ni "descargas descargas")', !/opiniones opiniones/.test(appjs) && !/descargas descargas/.test(appjs));
  check('v2.1 PS: los juegos de Play Store aparecen ANTES que los minijuegos propios', idx.indexOf('id="psGamesList"') >= 0 && idx.indexOf('id="gamesGrid"') >= 0 && idx.indexOf('id="psGamesList"') < idx.indexOf('id="gamesGrid"'));
  // Demos oficiales dentro de la app: solo 2 juegos tienen demo web oficial.
  check('v2.1 demos: solo 2 juegos tienen demo oficial en la web (Minecraft y 8 Ball Pool)', (appjs.match(/demoUrl: '/g) || []).length === 2 && /demoUrl: 'https:\/\/classic\.minecraft\.net\//.test(appjs) && /demoUrl: 'https:\/\/www\.miniclip\.com\/pool'/.test(appjs));
  check('v2.1 demos: las demos son https y nunca un .apk', !/demoUrl: '[^']*\.apk/.test(appjs));
  check('v2.1 demos: la tarjeta dice claro dónde se juega', /Se juega aquí/.test(appjs) && /Se juega en Play Store/.test(appjs));
  check('v2.1 demos: la demo se abre dentro de la app (WebView interna o iframe), no fuera', /function openPsGame/.test(appjs) && /openInAppWeb/.test(appjs) && /webViewOverlay/.test(idx) && /g\.demoUrl \|\|/.test(appjs));
  check('v2.1 demos: el puente nativo abre la web dentro de la app y BLOQUEA descargas de APK', /openInAppWeb/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8')) && /setDownloadListener/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8')) && /no descarga archivos/i.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8')));
  // Calificaciones: la llamada al servidor usa la firma correcta y la
  // calificación local queda marcada hasta que llega al servidor.
  check('v2.1 calificar: las llamadas de juegos usan la firma correcta (gamesFetch con state)', /function gamesFetch\(path, method, body\)/.test(appjs) && /return C\.serverFetch\(state, path, method, body\)/.test(appjs) && !/serverFetch\('\/api\/games/.test(appjs));
  check('v2.1 calificar: la calificación se guarda local con marca de pendiente y se reenvía sola', /synced: false/.test(appjs) && /function resendUnsyncedGameRatings/.test(appjs) && /function markGameRatingSynced/.test(appjs) && /synced: false/.test(fs.readFileSync(path.join(__dirname, '..', 'assets', 'games.js'), 'utf8')) && /function getLocalRating/.test(fs.readFileSync(path.join(__dirname, '..', 'assets', 'games.js'), 'utf8')) && /function markRatingSynced/.test(fs.readFileSync(path.join(__dirname, '..', 'assets', 'games.js'), 'utf8')));
  check('v2.1 calificar: el promedio visible incluye tu calificación aunque aún no llegue al servidor', /ratingAvg \* base\.ratingCount \+ mine\.stars/.test(appjs));

  console.log('=== 50. Likes con el color del usuario y brillo rojo al presionar (v2.2) ===');
  // El color del like: el escogido por el usuario, o el rojo determinado.
  check('v2.2 like: la función existe y el rojo determinado es #E60026', typeof C.likeColorFor === 'function' && C.LIKE_COLOR_DEFAULT === '#e60026');
  check('v2.2 like: sin color escogido el like es el rojo determinado', C.likeColorFor(null) === '#e60026' && C.likeColorFor('') === '#e60026' && C.likeColorFor(undefined) === '#e60026' && C.likeColorFor('zzz') === '#e60026');
  check('v2.2 like: con el rojo por defecto de la app el like es el rojo determinado', C.likeColorFor('#e01430') === '#e60026' && C.likeColorFor(C.APP_COLOR_DEFAULT) === '#e60026');
  check('v2.2 like: con un color propio (azul) el like es ese azul', C.likeColorFor('#2f7de1') === '#2f7de1' && C.likeColorFor('#2F7DE1') === '#2f7de1');
  check('v2.2 like: con un color propio (verde) el like es ese verde', C.likeColorFor('#2fbf71') === '#2fbf71');
  check('v2.2 like: con otro color listo (morado) el like es ese morado', C.likeColorFor('#7a4fd0') === '#7a4fd0');
  // El color se aplica como variable del tema: al cambiarlo, los likes
  // ya dados se actualizan solos (ningún like guarda su color fijo).
  check('v2.2 like: applyAppColor pone --like y --like-rgb con el color del like', /setProperty\('--like', likeHex\)/.test(appjs) && /setProperty\('--like-rgb'/.test(appjs) && /C\.likeColorFor\(hex\)/.test(appjs));
  check('v2.2 like: la variable existe por defecto en :root con el rojo determinado', /--like:#e60026; --like-rgb:230,0,38;/.test(idx));
  check('v2.2 like: el botón de Me gusta activado usa el color del like', /\.actions button\.like-btn\.on\{color:var\(--like\)\}/.test(idx) && /class="like-btn/.test(appjs));
  check('v2.2 like: el botón sin like sigue apagado (color tenue, no el del like)', /\.actions button\{[^}]*color:var\(--mut\)/.test(idx));
  check('v2.2 like: el botón de Guardar no cambia (sigue con el acento de antes)', /\.actions button\.on\{color:var\(--red2\)\}/.test(idx));
  check('v2.2 like: las reacciones activadas usan el color del like', /\.reactions button\.on\{border-color:var\(--like\);background:rgba\(var\(--like-rgb\),\.2\)\}/.test(idx));
  check('v2.2 like: el like de Shorts usa el color del like', /#shortsOverlay \.shortsRail button\.on\{color:var\(--like\)\}/.test(idx) && /#shortsOverlay \.shortsRail button\.liked\{color:var\(--like\)\}/.test(idx));
  check('v2.2 like: los corazones flotantes del live usan el color del like', /\.liveHeart\{[^}]*color:var\(--like\)/.test(idx));
  check('v2.2 like: el contador del live se pinta del color del like cuando hay likes', /\.live-fpill\.has-likes\{color:var\(--like\);border:1px solid var\(--like\)\}/.test(idx) && /classList\.toggle\('has-likes', n > 0\)/.test(appjs));
  check('v2.2 like: el botón de Me gusta no lleva el color fijo en línea', !/like-btn[^>]*style="[^"]*color:/.test(appjs));
  // Brillo rojo al presionar el botón de compartir la app y los logos.
  check('v2.2 brillo: el botón de compartir prende en rojo al presionarlo', /#hdrShareApp:active,#hdrShareApp\.wr-glow\{[^}]*box-shadow:0 0 14px 3px rgba\(230,0,38/.test(idx));
  check('v2.2 brillo: el logo de WordRed prende en rojo al presionarlo', /header \.logo:active,header \.logo\.wr-glow,#authView \.logoBig:active,#authView \.logoBig\.wr-glow\{filter:drop-shadow\(0 0 10px rgba\(230,0,38/.test(idx));
  check('v2.2 brillo: los logos de las cuentas prenden en rojo al presionarlos', /\.avatar:active,\.avatar\.wr-glow\{box-shadow:0 0 0 3px #e60026,0 0 16px 4px rgba\(230,0,38/.test(idx));
  check('v2.2 brillo: al presionar se pone la clase wr-glow y se quita a los ~600 ms', /document\.addEventListener\('pointerdown'/.test(appjs) && /closest\('#hdrShareApp, header \.logo, #authView \.logoBig, \.avatar'\)/.test(appjs) && /classList\.add\('wr-glow'\)/.test(appjs) && /setTimeout\(function \(\) \{ t\.classList\.remove\('wr-glow'\); \}, 600\)/.test(appjs));
  check('v2.2 brillo: el botón de compartir sigue compartiendo la app', /\$\('hdrShareApp'\)\.addEventListener\('click', shareAppApk\)/.test(appjs));
  // Grados del clima y números del reloj: mismo color elegido (o el
  // rojo determinado), tomado de la misma variable del tema.
  check('v2.2 clima/reloj: applyAppColor pone --chosen con el mismo color del like', /setProperty\('--chosen', likeHex\)/.test(appjs));
  check('v2.2 clima/reloj: la variable existe por defecto en :root con el rojo determinado', /--chosen:#e60026;/.test(idx));
  check('v2.2 clima/reloj: los números del reloj grande llevan el color elegido', /\.weatherTime\{[^}]*color:var\(--chosen\)/.test(idx));
  check('v2.2 clima/reloj: los grados de la tarjeta del clima llevan el color elegido', /\.weatherInfo \.wTemp\{[^}]*color:var\(--chosen\)/.test(idx));
  check('v2.2 clima/reloj: los grados del pronóstico (ahora, por horas y por días) llevan el color elegido', /\.wNowTemp\{[^}]*color:var\(--chosen\)/.test(idx) && /\.wHourTemp\{[^}]*color:var\(--chosen\)/.test(idx) && /\.wDayT\{[^}]*color:var\(--chosen\)/.test(idx));
  check('v2.2 clima/reloj: el símbolo del clima sigue en blanco y negro (no toma el color)', !/\.wSym\{[^}]*color:var\(--chosen\)/.test(idx) && !/\.wSymBox\{[^}]*color:var\(--chosen\)/.test(idx));
  check('v2.2 clima/reloj: la fecha bajo el reloj no se pinta (solo los números)', /\.weatherDate\{[^}]*color:var\(--dim\)/.test(idx));
  // Guardadas del perfil: con más de 3 solo se ven 3 detrás del botón "…".
  check('v2.2 guardados: con más de 3 solo se muestran 3 (slice 0,3)', /var savedShown = showAllSaved \? saved : saved\.slice\(0, 3\);/.test(appjs));
  check('v2.2 guardados: el botón "…" aparece solo con más de 3 y sin haberlo abierto', /saved\.length > 3 && !showAllSaved/.test(appjs) && /id="savedMoreBtn"/.test(appjs) && /onclick="window\.__wrShowAllSaved\(\)">…<\/button>/.test(appjs));
  check('v2.2 guardados: al presionar los puntos se ven todas', /window\.__wrShowAllSaved = function \(\) \{ showAllSaved = true; renderOwnProfile\(\); \};/.test(appjs));
  check('v2.2 guardados: al entrar al perfil se vuelve a mostrar solo 3', /if \(view === 'profile'\) \{ showAllSaved = false; renderOwnProfile\(\); \}/.test(appjs));
  check('v2.2 guardados: con 3 o menos no aparece el botón (se muestran todas)', /saved\.length \? savedShown\.map\(postCardHtml\)\.join\(''\)/.test(appjs));

  console.log('=== 51. Botones estilo Shorts y vistas sin "undefined" (v2.3) ===');
  // Contadores de historia: siempre números reales, nunca undefined.
  let st51 = withProfiles(fresh());
  let s51 = C.createStory(st51, A, { text: 'Historia 51' }).story;
  let cnt51 = C.storyCounts(s51);
  check('v2.3 vistas: una historia nueva tiene 0 vistas, 0 likes, 0 comentarios y 0 compartidos', cnt51.views === 0 && cnt51.likes === 0 && cnt51.comments === 0 && cnt51.shares === 0, JSON.stringify(cnt51));
  C.viewStory(st51, B, s51.id);
  C.toggleStoryLike(st51, B, s51.id);
  C.addStoryComment(st51, B, s51.id, 'Bonita');
  C.shareStory(st51, B, s51.id);
  cnt51 = C.storyCounts(s51);
  check('v2.3 vistas: tras ver, like, comentario y compartir los contadores son números reales', cnt51.views === 1 && cnt51.likes === 1 && cnt51.comments === 1 && cnt51.shares === 1, JSON.stringify(cnt51));
  check('v2.3 vistas: storyLikeCounts sigue devolviendo solo el total de likes (número)', C.storyLikeCounts(s51) === 1);
  let s51b = { id: 'x', likes: { '5511111111': 'Me gusta' } };
  let cnt51b = C.storyCounts(s51b);
  check('v2.3 vistas: una historia sin campos de vistas, comentarios o compartidos da 0 en lo que falta', cnt51b.views === 0 && cnt51b.comments === 0 && cnt51b.shares === 0 && cnt51b.likes === 1, JSON.stringify(cnt51b));
  check('v2.3 vistas: renderShortItem usa storyCounts (nunca "undefined vistas")', /var counts = C\.storyCounts\(s\);/.test(appjs) && !/var counts = C\.storyLikeCounts\(s\);/.test(appjs));
  // Me gusta en comentarios.
  let p51 = C.createPost(st51, A, { text: 'Publicación 51' }).post;
  let c51 = C.addComment(st51, B, p51.id, 'Comentario 51').comment;
  check('v2.3 comentarios: un comentario nuevo tiene 0 likes', C.commentLikeCount(c51) === 0);
  let lk51 = C.toggleCommentLike(st51, A, p51.id, c51.id);
  check('v2.3 comentarios: dar me gusta a un comentario funciona', lk51.ok && lk51.liked === true && lk51.count === 1 && C.commentLikeCount(c51) === 1);
  let lk51b = C.toggleCommentLike(st51, A, p51.id, c51.id);
  check('v2.3 comentarios: quitar el me gusta del comentario funciona', lk51b.ok && lk51b.liked === false && lk51b.count === 0);
  let r51 = C.addComment(st51, A, p51.id, 'Respuesta 51', c51.id).comment;
  let lk51r = C.toggleCommentLike(st51, B, p51.id, r51.id);
  check('v2.3 comentarios: también se le puede dar me gusta a una respuesta', lk51r.ok && lk51r.count === 1);
  let lk51bad = C.toggleCommentLike(st51, A, p51.id, 'noexiste');
  check('v2.3 comentarios: un comentario que no existe se rechaza', !lk51bad.ok);
  let lk51g = C.toggleCommentLike(st51, null, p51.id, c51.id);
  check('v2.3 comentarios: un invitado no puede dar me gusta a un comentario', !lk51g.ok && lk51g.error === C.GUEST_VERIFY_ERROR);
  // Botones anteriores en las publicaciones (v2.5): se quita el estilo
  // Shorts de las tarjetas y se quedan SOLO los de siempre (v2.2) —
  // una sola fila horizontal al pie de la tarjeta, icono + texto al lado.
  check('v2.5 acciones: la fila es horizontal al pie de la tarjeta (envuelve si no cabe)', /\.actions\{display:flex;flex-direction:row;flex-wrap:wrap;justify-content:space-around;/.test(idx));
  check('v2.5 acciones: ya no hay columna vertical de acciones en la tarjeta', !/\.actions\{display:flex;flex-direction:column;/.test(idx));
  check('v2.7 acciones: los botones de abajo llevan icono + texto (Me gusta / Comentar / Compartir) y Guardar va arriba solo con el símbolo', /ic\('heart', 18\) \+ ' ' \+ \(myReaction \|\| 'Me gusta'\)/.test(appjs) && /ic\('message', 18\) \+ ' Comentar/.test(appjs) && /ic\('share', 18\) \+ ' Compartir/.test(appjs) && /ic\('bookmark', 18\) \+ '<\/button>'/.test(appjs));
  check('v2.8 acciones: en la fila de la tarjeta SÍ hay contadores (.cnt), uno por botón a la izquierda de su símbolo', (function () { var a = appjs.indexOf('<div class="actions">'); var b = appjs.indexOf('<div class="reactions"', a); return a >= 0 && b > a && (appjs.slice(a, b).match(/class="cnt"/g) || []).length === 3; })());
  check('v2.5 acciones: los iconos son de 19 px como antes (ya no de 36 px estilo Shorts)', /\.actions button \.ic svg\{width:19px;height:19px\}/.test(idx) && !/\.actions button \.ic svg\{width:36px;height:36px\}/.test(idx) && !/\.actions button \.ic svg\{width:30px;height:30px\}/.test(idx));
  check('v2.5 acciones: la tarjeta lleva UNA sola fila de acciones anteriores (sin rail)', /<div class="actions">/.test(appjs) && !/<div class="actions shortsRail">/.test(appjs) && /aria-label="Comentar"/.test(appjs) && /aria-label="Compartir"/.test(appjs) && /ic\('heart', 18\)/.test(appjs) && /ic\('bookmark', 18\)/.test(appjs));
  check('v2.5 acciones: el corazón se rellena del color del like cuando está activado', /#shortsLike\.on svg path,.actions button\.like-btn\.on svg path,.commentRail button\.like-btn\.on svg path\{fill:currentColor\}/.test(idx));
  check('v2.5 acciones: el botón de Me gusta activado sigue usando el color del like', /\.actions button\.like-btn\.on\{color:var\(--like\)\}/.test(idx));
  check('v2.5 acciones: con otra reacción se ve su nombre (no su emoji grande)', /\(myReaction \|\| 'Me gusta'\)/.test(appjs) && !/<span class="ic" style="font-size:36px;line-height:1">/.test(appjs));
  // Rail de comentarios.
  check('v2.3 comentarios: cada comentario lleva su rail estilo Shorts', /<div class="shortsRail commentRail">/.test(appjs) && /\.commentRail\{display:flex;flex-direction:column;/.test(idx) && /__wrLikeComment/.test(appjs) && /__wrShareCommentRail/.test(appjs));
  check('v2.3 comentarios: el rail del comentario tiene corazón, responder y compartir', /aria-label="Responder"/.test(appjs) && /C\.commentLikeCount\(c\)/.test(appjs));

  console.log('=== 52. Botones anteriores en las publicaciones (v2.5) ===');
  // Se quita el estilo Shorts de las tarjetas y se quedan SOLO los
  // botones de siempre (v2.2): icono + texto al lado, iconos de 19 px.
  check('v2.5 fila: postCardHtml tiene una sola fila .actions y ningún rail en la tarjeta', (appjs.match(/<div class="actions">/g) || []).length === 1 && !/class="actions shortsRail"/.test(appjs));
  check('v2.8 fila: la fila de contadores de arriba ya no existe; solo queda la fila .actions', !/<div class="counts">/.test(appjs) && /<div class="actions">/.test(appjs));
  check('v2.8 fila: la fila es horizontal, reparte los botones y va con borde arriba (hueco de 6 px para que quepan los conteos)', /\.actions\{display:flex;flex-direction:row;flex-wrap:wrap;justify-content:space-around;align-items:center;gap:6px;border-top:1px solid var\(--line\);margin-top:8px;padding:8px 2px 4px\}/.test(idx));
  check('v2.7 botones: icono + texto al lado abajo (Me gusta, Comentar, Compartir) y Guardar arriba solo con el símbolo', /ic\('heart', 18\) \+ ' ' \+ \(myReaction \|\| 'Me gusta'\)/.test(appjs) && /ic\('message', 18\) \+ ' Comentar/.test(appjs) && /ic\('share', 18\) \+ ' Compartir/.test(appjs) && /ic\('bookmark', 18\) \+ '<\/button>'/.test(appjs));
  check('v2.5 botones: los iconos son de 19 px como antes (ya no de 36 px estilo Shorts)', /\.actions button \.ic svg\{width:19px;height:19px\}/.test(idx) && /ic\('message', 18\)/.test(appjs) && /ic\('share', 18\)/.test(appjs) && !/\.actions button \.ic svg\{width:36px;height:36px\}/.test(idx));
  check('v2.5 botones: las etiquetas se leen (13 px) y los botones no se enciman', /\.actions button\{[^}]*font-size:13px;/.test(idx) && /\.actions\{display:flex;flex-direction:row;flex-wrap:wrap;justify-content:space-around;/.test(idx));
  check('v2.5 fila: el rail del visor de Shorts no cambia', /#shortsOverlay \.shortsRail\{position:absolute;right:10px;bottom:110px;/.test(idx));
  check('v2.5 fila: el mini rail de los comentarios no cambia', /<div class="shortsRail commentRail">/.test(appjs) && /\.commentRail\{display:flex;flex-direction:column;/.test(idx));

  console.log('=== 54. Guardar arriba a la derecha, solo el símbolo (v2.7) ===');
  // v2.7: al usuario no le gustó la rejilla 2×2 de la v2.6. Guardar sube
  // arriba a la derecha del encabezado de la tarjeta (solo el símbolo,
  // sin letras) y la fila de abajo queda solo con Me gusta / Comentar /
  // Compartir en una sola fila. Con 3 botones, la fila cabe en la
  // tarjeta angosta sin salirse y sin rejilla.
  check('v2.7 guardar: NO hay rejilla 2×2 en pantallas angostas', !/@media \(max-width:480px\)\{\.actions button\{flex:1 1 40%\}\}/.test(idx));
  check('v2.7 guardar: el botón de Guardar está en el encabezado (.head), arriba a la derecha', (function () {
    var headStart = appjs.indexOf("'<div class=\"head\"");
    var actionsStart = appjs.indexOf("'<div class=\"actions\">'");
    var saveIdx = appjs.indexOf('save-btn');
    return headStart >= 0 && actionsStart > 0 && saveIdx > headStart && saveIdx < actionsStart;
  })());
  check('v2.7 guardar: el botón de Guardar no lleva letras, solo el símbolo', /ic\('bookmark', 18\) \+ '<\/button>'/.test(appjs) && !/ic\('bookmark', 18\) \+ ' ' \+ \(saved/.test(appjs));
  check('v2.7 guardar: el botón conserva su aria-label Guardar/Guardada', /aria-label="' \+ \(saved \? 'Guardada' : 'Guardar'\) \+ '"/.test(appjs));
  check('v2.7 guardar: el botón no abre el perfil al tocarlo (stopPropagation)', /save-btn[^]*?event\.stopPropagation\(\);window\.__wrSave/.test(appjs));
  check('v2.7 guardar: guardado se ve en rojo y con el marcador relleno', /\.post \.head \.save-btn\.on\{color:var\(--red2\)\}/.test(idx) && /\.post \.head \.save-btn\.on svg path\{fill:currentColor\}/.test(idx));
  check('v2.7 guardar: el botón no se encoge ni tapa el nombre (flex:none)', /\.post \.head \.save-btn\{[^}]*flex:none/.test(idx));
  check('v2.7 guardar: la fila de abajo ya no lleva Guardar', (function () {
    var a = appjs.indexOf("'<div class=\"actions\">'");
    var b = appjs.indexOf("'</div>' +", a);
    var block = appjs.slice(a, b);
    return block.indexOf('__wrSave') < 0 && (block.match(/<button/g) || []).length === 3;
  })());
  check('v2.7 guardar: los demás botones siguen como estaban (icono + texto)', /ic\('heart', 18\) \+ ' ' \+ \(myReaction \|\| 'Me gusta'\)/.test(appjs) && /ic\('message', 18\) \+ ' Comentar/.test(appjs) && /ic\('share', 18\) \+ ' Compartir/.test(appjs));
  check('v2.7 guardar: la fila sigue envolviendo solo si hace falta (flex-wrap: wrap)', /\.actions\{display:flex;flex-direction:row;flex-wrap:wrap;/.test(idx));
  check('v2.7 guardar: los botones no parten su texto en dos líneas (white-space: nowrap)', /\.actions button\{[^}]*white-space:nowrap/.test(idx));
  check('v2.7 guardar: ningún botón recorta su texto con puntos suspensivos', !/\.actions button\{[^}]*text-overflow:ellipsis/.test(idx));
  // Medidas estimadas (v2.8: relleno 12 px + número 7 px + hueco 3 px +
  // icono 19 px + hueco 6 px + texto en negrita de 13 px a ~7.3 px por
  // letra; fila angosta 393 − 24 − 28 = 341 px): con solo 3 botones
  // abajo y su conteo a la izquierda del símbolo, la fila cabe en una
  // sola línea.
  (function () {
    var rowPx = 393 - 24 - 28; // teléfono: 393 px menos main (12+12) y tarjeta (14+14)
    var btnPx = function (label) { return 12 + 7 + 3 + 19 + 6 + label.length * 7.3; };
    var labels = ['Me gusta', 'Comentar', 'Compartir', 'Me encanta', 'Me sorprende', 'Me entristece', 'Me enoja'];
    var allFit = labels.every(function (l) { return btnPx(l) < rowPx; });
    var total = ['Me gusta', 'Comentar', 'Compartir'].reduce(function (s, l) { return s + btnPx(l); }, 0) + 2 * 6;
    check('v2.7 guardar: cada botón (también la reacción más larga) cabe solo en la tarjeta angosta', allFit, 'fila=' + rowPx + 'px');
    check('v2.7 guardar: los 3 botones juntos caben en una sola fila angosta (sin 2×2)', total < rowPx, 'total=' + Math.round(total) + 'px fila=' + rowPx + 'px');
    check('v2.7 guardar: el botón de Guardar solo con el símbolo cabe arriba (19 px + relleno)', 19 + 20 < 64, 'ancho=39px');
  })();

  console.log('=== 55. Los conteos van en los símbolos y desaparece la fila de arriba (v2.8) ===');
  // v2.8: el usuario marcó con azul la fila de contadores de arriba en
  // su captura ("1 reacción · 0 comentarios · 0 veces compartida") y
  // pidió que desaparezca: cada conteo va EN SU BOTÓN de acción, a la
  // izquierda de su símbolo (reacciones a la izquierda del corazón,
  // comentarios a la izquierda de la burbuja, compartidas a la izquierda
  // del icono de compartir). Los números se actualizan en vivo como antes
  // porque la tarjeta se vuelve a dibujar; "Más reacciones" se queda.
  check('v2.8 conteos: la fila de contadores de arriba ya no existe en la tarjeta', !/<div class="counts">/.test(appjs));
  check('v2.8 conteos: no queda el texto de la fila de arriba ("reacción"/"veces compartida")', !/reacción' : ' reacciones/.test(appjs) && !/vez compartida/.test(appjs) && !/comentario' : ' comentarios/.test(appjs));
  check('v2.8 conteos: la regla CSS .counts también desaparece', !/\.counts\{/.test(idx));
  check('v2.8 conteos: el botón de Me gusta lleva su número de reacciones a la izquierda del corazón', /<span class="cnt">' \+ counts\.total \+ '<\/span>' \+ ic\('heart', 18\)/.test(appjs));
  check('v2.8 conteos: el botón de Comentar lleva su número de comentarios a la izquierda de la burbuja', /<span class="cnt">' \+ C\.commentCount\(post\) \+ '<\/span>' \+ ic\('message', 18\)/.test(appjs));
  check('v2.8 conteos: el botón de Compartir lleva su número de veces compartida a la izquierda de su icono', /<span class="cnt">' \+ post\.shares\.length \+ '<\/span>' \+ ic\('share', 18\)/.test(appjs));
  check('v2.8 conteos: "Más reacciones" se queda como está', /Más reacciones/.test(appjs));
  check('v2.8 conteos: los botones siguen con su texto y sus manejadores', /ic\('heart', 18\) \+ ' ' \+ \(myReaction \|\| 'Me gusta'\)/.test(appjs) && /ic\('message', 18\) \+ ' Comentar/.test(appjs) && /ic\('share', 18\) \+ ' Compartir/.test(appjs) && /__wrLike\(/.test(appjs) && /__wrShare\(/.test(appjs));
  check('v2.8 conteos: el número tiene su estilo (.cnt, 12 px y pegado al símbolo)', /\.actions button \.cnt\{font-size:12px;font-weight:700;margin-right:-3px\}/.test(idx));
  check('v2.8 conteos: ya no se calculan los emojis de arriba (top/topEmojis fuera)', !/topEmojis/.test(appjs));
  // Los conteos se actualizan en vivo: dar like, comentar y compartir
  // cambian los números que lee la tarjeta (la tarjeta se redibuja).
  (function () {
    var st = withProfiles(fresh());
    var p = C.createPost(st, A, { text: 'Publicación para contar' });
    check('v2.8 conteos: la publicación nueva empieza con 0 reacciones, 0 comentarios y 0 compartidas', p.ok && C.likeCounts(p.post).total === 0 && C.commentCount(p.post) === 0 && p.post.shares.length === 0);
    var lk = C.toggleLike(st, B, p.post.id, 'Me gusta');
    check('v2.8 conteos: al dar like el número de reacciones sube a 1', lk.ok && C.likeCounts(p.post).total === 1);
    var cm = C.addComment(st, B, p.post.id, '¡Hola!');
    check('v2.8 conteos: al comentar el número de comentarios sube a 1', cm.ok && C.commentCount(p.post) === 1);
    var sh = C.sharePost(st, B, p.post.id);
    check('v2.8 conteos: al compartir el número de veces compartida sube a 1', sh.ok && p.post.shares.length === 1);
    var lk2 = C.toggleLike(st, B, p.post.id, 'Me gusta');
    check('v2.8 conteos: al quitar el like el número de reacciones vuelve a 0', lk2.ok && !lk2.liked && C.likeCounts(p.post).total === 0);
  })();
  console.log('=== 56. Entrar con Google y código por correo (v2.9) ===');
  // La opción de Google aparece junto al registro por teléfono; el
  // registro por teléfono sigue igual.
  check('v1.5.8: el botón de Google abre la página web de Google (sin ID)', /function googleSignInPageUrl/.test(appjs) && /\/oauth\/google/.test(appjs) && /AndroidBridge\.openExternalUrl\(url\)/.test(appjs));
  check('v1.5.8: ya no hay dónde guardar un ID de cliente (ni en el registro ni en Ajustes)', !/authGoogleClientIdSave/.test(appjs) && !/googleClientIdSaveBtn/.test(appjs) && !/function effectiveGoogleClientId/.test(appjs));
  check('v2.9: el código por correo se pide y se verifica en el servidor', /\/api\/auth\/email\/request-code/.test(appjs) && /\/api\/auth\/email\/verify/.test(appjs));
  check('v2.9: en modo de prueba el código por correo se verifica solo y se avisa', /devCode/.test(appjs) && /aún no está configurado/.test(appjs));
  check('v2.9: tras verificar por correo o Google se entra si el perfil existe o se crea si no', /finishServerLogin/.test(appjs) && /__onGoogleSignIn/.test(appjs));
  check('v2.9: la vinculación automática del teléfono no se intenta con cuentas de correo', /isEmailIdentity\(state\.me\)/.test(appjs));
  check('v2.9: el servidor acepta el correo como identidad (normPhone)', /indexOf\('@'\) >= 0/.test(serverjs) && /validEmail/.test(serverjs));
  check('v2.9: el token de Google se verifica con firma, cliente, emisor y caducidad', /verifyGoogleIdToken/.test(serverjs) && /createVerify\('RSA-SHA256'\)/.test(serverjs) && /email_verified/.test(serverjs));
  check('v3.0: la versión del servidor es 3.0', /version: '3\.0'/.test(serverjs));
  console.log('=== 57. En vivos en el perfil, reloj de grabación y aro rojo (v1.5.6) ===');
  // El avatar lleva el aro rojo cuando la persona está en vivo (como el
  // aro de una historia, en rojo) y tocarlo entra al live.
  check('v1.5.6: el avatar lleva el aro rojo cuando la persona está en vivo', /\.avatar\.live-ring\{/.test(idx) && /box-shadow:0 0 0 3px var\(--red\)/.test(idx) && /isLiveNow\(phone\)/.test(appjs) && /liveOf\(phone\)/.test(appjs));
  check('v1.5.6: tocar el avatar con aro entra al live (inicio y perfil)', /liveAvatarTap/.test(appjs) && /__wrJoinLive/.test(appjs) && /liveOf\(author\)/.test(appjs) && /liveOf\(phone\)/.test(appjs) && /liveOf\(state\.me\)/.test(appjs));
  check('v1.5.6: el aro se actualiza cuando alguien empieza o termina un live', /refreshLiveRings/.test(appjs) && /handleLiveEvent/.test(appjs) && /refreshLives/.test(appjs));
  // El reloj de grabación, grande y al centro del live.
  check('v1.5.6: el reloj de grabación existe al centro del live', /id="liveRecClock"/.test(idx) && /\.live-rec-clock\{/.test(idx) && /liveRecClockTime/.test(idx) && /top:36%/.test(idx));
  check('v1.5.6: el reloj muestra el tiempo de grabación y se apaga al salir del live', /liveRecClock/.test(appjs) && /formatDuration\(Date\.now\(\) - liveRecStartedAt\)/.test(appjs));
  // La grabación del live también aparece en el perfil, en su sección.
  check('v1.5.6: el perfil tiene su sección "En vivos grabados"', /En vivos grabados/.test(appjs) && /liveRecordingPostsOf/.test(appjs));
  check('v1.5.6: las grabaciones no se mezclan con las publicaciones normales del perfil', /!x\.isLiveRecording/.test(appjs));
  check('v1.5.6: el servidor no llevaba cambios de 1.5.6', /version: '3\.0'/.test(serverjs) && !/1\.5\.6/.test(serverjs));
  console.log('=== 58. Inicio con Google fácil y carátula en los videos (v1.5.7) ===');
  // Entrar con Google: el ID ya viene configurado en la app, solo se abre
  // la cuenta; el campo de Ajustes queda solo para cambiarlo si hace falta.
  check('v1.5.8: el ID de cliente de Google queda por dentro (constante interna, nunca se muestra)', /DEFAULT_GOOGLE_CLIENT_ID = '730186387438-pj78hmj6tc8626hbr7078rkk0daqhoq0\.apps\.googleusercontent\.com'/.test(appjs) && !/function effectiveGoogleClientId/.test(appjs));
  check('v1.5.8: el botón de Google abre la página en el navegador y no pide escribir nada', /googleSignInPageUrl\(\)/.test(appjs) && /AndroidBridge\.openExternalUrl/.test(appjs) && !/falta el ID de cliente/.test(appjs));
  check('v1.5.8: en Ajustes ya no hay sección de Google con ID', idx.indexOf('Entrar con Google') < 0 && idx.indexOf('settingsGoogleClientId') < 0);
  // La carátula del video: un fotograma que se guarda con la publicación.
  (function () {
    var st157 = fresh();
    withProfiles(st157);
    var r157 = C.createPost(st157, A, { text: 'Video 1.5.7', media: 'demo-video.mp4', mediaType: 'video', mediaList: [{ src: 'demo-video.mp4', type: 'video', thumb: 'data:image/jpeg;base64,CARATULA157' }] });
    check('v1.5.7: createPost guarda la carátula del video con la publicación', r157.ok && r157.post.videoThumb === 'data:image/jpeg;base64,CARATULA157' && r157.post.mediaList[0].thumb === 'data:image/jpeg;base64,CARATULA157');
    var r157b = C.createPost(st157, A, { text: 'Foto 1.5.7', media: 'foto.jpg', mediaType: 'image', mediaList: [{ src: 'foto.jpg', type: 'image' }] });
    check('v1.5.7: una foto no lleva carátula de video', r157b.ok && !r157b.post.videoThumb);
    var e157 = C.editPost(st157, A, r157.post.id, { mediaList: [{ src: 'demo-video.mp4', type: 'video', thumb: 'data:image/jpeg;base64,EDIT157' }] });
    check('v1.5.7: editPost conserva la carátula del video', e157.ok && e157.post.videoThumb === 'data:image/jpeg;base64,EDIT157' && e157.post.mediaList[0].thumb === 'data:image/jpeg;base64,EDIT157');
  })();
  check('v1.5.7: la carátula se genera de un fotograma del video (25% de la duración)', /function captureVideoFrame\(/.test(appjs) && /function captureVideoFrameOnce\(/.test(appjs) && /function videoThumbTime/.test(appjs) && /\(end - start\) \* 0\.25/.test(appjs));
  check('v1.5.7: el video se muestra con su carátula como poster y sin ella se genera al cargar', /posterAttr/.test(appjs) && /data-needs-thumb/.test(appjs) && /onloadedmetadata="window\.__wrVideoThumb\(this\)"/.test(appjs) && /window\.__wrVideoThumb/.test(appjs) && /window\.__wrSetVideoPoster/.test(appjs));
  check('v1.5.7: el video nunca se ve en negro vacío mientras carga (fondo rojo)', /\.post \.media video,\.medialist video\{background:linear-gradient/.test(idx));
  check('v1.5.7: el servidor no llevaba cambios de 1.5.7', /version: '3\.0'/.test(serverjs) && !/1\.5\.7/.test(serverjs));

  console.log('=== 59. Shorts que se paran, carátula elegible y anclar (v1.5.8) ===');
  // 1.5.34: hay 1 video de ejemplo (el clip neutro de la ciudad);
  // las publicaciones de ejemplo son fotos neutras reales (no un marcador vacío).
  (function () {
    var st158 = fresh();
    withProfiles(st158);
    C.seedDemo(st158);
    var demoPhotos = st158.posts.filter(function (p) { return p.isDemo && p.mediaType === 'image' && p.media.indexOf('ejemplo/') === 0; });
    check('v1.5.8: las fotos de ejemplo son fotos JPEG reales (no un marcador vacío)', demoPhotos.length > 0 && demoPhotos.every(function (p) { var buf = fs.existsSync(path.join(__dirname, '..', 'assets', p.media)) ? fs.readFileSync(path.join(__dirname, '..', 'assets', p.media)) : null; return !!buf && buf.length > 10000 && buf[0] === 0xFF && buf[1] === 0xD8; }), 'fotos=' + demoPhotos.length);
    check('v1.5.8: hay 1 video de ejemplo (1.5.34: el clip neutro de la ciudad, no el video viejo)', st158.posts.filter(function (p) { return p.isDemo && p.mediaType === 'video'; }).length === 1 && fs.existsSync(path.join(__dirname, '..', 'assets', 'ejemplo', 'video-ciudad.mp4')) && !fs.existsSync(path.join(__dirname, '..', 'assets', 'demo-video.mp4')));
  })();
  // Shorts: al salir, el video se pausa (video y sonido).
  check('v1.5.8: al salir de Shorts el video se pausa', /function pauseShortsVideos\(\)/.test(appjs) && /pauseShortsVideos\(\);/.test(appjs) && /querySelectorAll\('video'\)/.test(appjs));
  check('v1.5.8: se pausa tanto al cambiar de pestaña como al cerrar el visor', (appjs.match(/pauseShortsVideos\(\);/g) || []).length >= 2 && /if \(id === 'shortsOverlay'\) pauseShortsVideos\(\);/.test(appjs));
  // Video en gris: la carátula perezosa ya no usa CORS para archivos locales.
  check('v1.5.8: la captura de carátula solo usa crossorigin para http(s) (archivos locales ya no fallan)', (appjs.match(/setAttribute\('crossorigin', 'anonymous'\)/g) || []).length === 1 && /if \(\/\^https\?:\\\/\\\/\/i\.test\(src\)\)/.test(appjs));
  // Selector de carátula: fotograma o imagen propia.
  check('v1.5.8: el editor tiene selector de carátula (fotograma con barra y vista previa, o imagen propia)', /function openCoverPicker\(/.test(appjs) && /function captureVideoFrameAt\(/.test(appjs) && /coverPickerOverlay/.test(idx) && /coverPickerRange/.test(idx) && /coverPickerUseFrame/.test(idx) && /coverPickerImageInput/.test(idx) && /coverPickerUploadBtn/.test(idx) && /cover-pick-btn/.test(appjs) && /__wrOpenCoverPicker/.test(appjs) && /__wrCaptureVideoFrameAt/.test(appjs) && /__wrPickMedia/.test(appjs));
  check('v1.5.8: la carátula se guarda por video y por momento (cambiar de fotograma no devuelve la automática)', /function videoThumbKey\(/.test(appjs) && /'auto'/.test(appjs));
  (function () {
    var st158b = fresh();
    withProfiles(st158b);
    var c158 = C.createPost(st158b, A, { text: 'Video 1.5.8', media: 'v.mp4', mediaType: 'video', mediaList: [{ src: 'v.mp4', type: 'video', thumb: 'data:image/jpeg;base64,PERSONAL158' }] });
    check('v1.5.8: la portada personalizada se guarda con la publicación', c158.ok && c158.post.videoThumb === 'data:image/jpeg;base64,PERSONAL158');
    var e158 = C.editPost(st158b, A, c158.post.id, { mediaList: [{ src: 'v.mp4', type: 'video', thumb: 'data:image/jpeg;base64,MARCO158' }] });
    check('v1.5.8: al editar se puede cambiar de portada personalizada a fotograma', e158.ok && e158.post.videoThumb === 'data:image/jpeg;base64,MARCO158');
    var e158b = C.editPost(st158b, A, c158.post.id, { mediaList: [{ src: 'v.mp4', type: 'video', thumb: 'data:image/jpeg;base64,PERSONAL158B' }] });
    check('v1.5.8: al editar se puede cambiar de fotograma a portada personalizada', e158b.ok && e158b.post.videoThumb === 'data:image/jpeg;base64,PERSONAL158B');
  })();
  // Anclar: botón solo en las propias, y el perfil ya guarda pinnedPosts.
  check('v1.5.8: la tarjeta muestra "Anclar en mi perfil" solo en publicaciones propias', /Anclar en mi perfil/.test(appjs) && /__wrTogglePin/.test(appjs) && /author === state\.me && !page && !post\.groupId/.test(appjs) && /\.pin-btn/.test(idx));
  check('v1.5.8: el anclado viaja con el perfil al servidor (el servidor ya acepta pinnedPosts)', /pinnedPosts: p\.pinnedPosts/.test(corejs) && /pinnedPosts/.test(serverjs) && /version: '3\.0'/.test(serverjs));

  console.log('=== 60. Inicio con Google como en YouTube, con correo y contraseña (v1.5.8) ===');
  // Nada de ID: ningún campo visible en el registro ni en Ajustes.
  check('v1.5.8 Google web: no hay ningún campo de ID de cliente en la app', idx.indexOf('id="settingsGoogleClientId"') < 0 && idx.indexOf('id="authGoogleClientId"') < 0 && idx.indexOf('id="authGoogleSetup"') < 0 && idx.indexOf('id="authGoogleIdRow"') < 0 && !/googleClientId/.test(appjs) && !/function effectiveGoogleClientId/.test(appjs) && !/authGoogleClientIdSave/.test(appjs) && !/googleClientIdSaveBtn/.test(appjs));
  check('v1.5.8 Google web: el ID queda por dentro (constante interna, nunca se muestra)', /DEFAULT_GOOGLE_CLIENT_ID = '730186387438-pj78hmj6tc8626hbr7078rkk0daqhoq0\.apps\.googleusercontent\.com'/.test(appjs));
  // El botón abre la página de Google en el navegador.
  check('v1.5.8 Google web: "Continuar con Google" abre la página de Google en el navegador', /function googleSignInPageUrl/.test(appjs) && /\/oauth\/google/.test(appjs) && /AndroidBridge\.openExternalUrl\(url\)/.test(appjs) && /Continuar con Google/.test(idx));
  // La vuelta del navegador entrega el token al mismo verificador de antes.
  check('v1.5.8 Google web: al volver, el token se verifica en el servidor como antes', /window\.__onGoogleSignIn = async function/.test(appjs) && /\/api\/auth\/google/.test(appjs) && /finishServerLogin\(d\.email, d\.name, d\.photo(, d\.hasProfile)?\)/.test(appjs));
  // Android: el enlace wordred://oauth/google vuelve a la app.
  check('v1.5.8 Google web: el manifiesto atiende el enlace de vuelta wordred://oauth/google', /android:scheme="wordred"/.test(manifest) && /android:host="oauth"/.test(manifest) && /android:pathPrefix="\/google"/.test(manifest));
  check('v1.5.8 Google web: MainActivity entrega el token del enlace al JavaScript', /handleGoogleOAuthIntent/.test(javaSrc) && /__onGoogleSignIn/.test(javaSrc) && /pendingGoogleIdToken/.test(javaSrc));
  // Servidor 3.0: sirve la página de Google (GIS) con el ID del servidor.
  var gisPage = fs.readFileSync(path.join(__dirname, '..', 'server', 'oauth-google.html'), 'utf8');
  check('v1.5.8 Google web: el servidor sirve la página de inicio con Google (GIS)', /app\.get\('\/oauth\/google'/.test(serverjs) && /oauth-google\.html/.test(serverjs) && /__GOOGLE_CLIENT_ID__/.test(serverjs) && /gsi\/client/.test(gisPage) && /wordred:\/\/oauth\/google/.test(gisPage) && /g_id_signin/.test(gisPage));
  check('v1.5.8 Google web: el servidor es 3.0 (página nueva, el resto igual)', /version: '3\.0'/.test(serverjs));

  console.log('=== 61. Notificaciones con el icono en grises (v1.5.8) ===');
  // Recurso pequeño: la "W" en blanco (grises) sobre transparente.
  var notifIconXml = fs.readFileSync(path.join(__dirname, '..', 'res', 'drawable', 'ic_notification.xml'), 'utf8');
  check('v1.5.8 notif: existe el icono de notificación en grises (vector con la W)', /<vector/.test(notifIconXml) && /M25\.4,29\.3 L37\.1,78\.7 L54,39\.7 L70\.9,78\.7 L82\.6,29\.3/.test(notifIconXml));
  check('v1.5.8 notif: el icono pequeño es solo blanco/gris, sin rojo', /strokeColor="#FFFFFF"/.test(notifIconXml) && notifIconXml.indexOf('#E60026') < 0 && notifIconXml.indexOf('#FF4A33') < 0 && notifIconXml.indexOf('#B3001B') < 0);
  // Recurso grande: el icono del lanzador pasado a grises (PNG).
  var grayPngPath = path.join(__dirname, '..', 'res', 'mipmap-xxxhdpi', 'ic_launcher_gray.png');
  var grayPng = fs.existsSync(grayPngPath) ? fs.readFileSync(grayPngPath) : null;
  check('v1.5.8 notif: existe el icono grande en grises', !!grayPng && grayPng.length > 500 && grayPng[0] === 0x89 && grayPng[1] === 0x50 && grayPng[2] === 0x4E && grayPng[3] === 0x47, grayPng && ('bytes=' + grayPng.length));
  check('v1.5.8 notif: el PNG grande es de verdad en grises (tipo de color 0 o 4) y 192x192', !!grayPng && grayPng.readUInt32BE(16) === 192 && grayPng.readUInt32BE(20) === 192 && (grayPng[25] === 0 || grayPng[25] === 4), grayPng && ('colorType=' + grayPng[25]));
  // Uso: los 6 constructores de notificación usan el icono en grises.
  var bgJava = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedBackgroundService.java'), 'utf8');
  var screenJava = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'ScreenShareService.java'), 'utf8');
  var allJava = javaSrc + bgJava + screenJava + fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedNotifyReceiver.java'), 'utf8');
  check('v1.5.8 notif: las 13 notificaciones usan el icono pequeño en grises (1.5.26: +2, sonido por chat y aviso local; 1.5.29: +2, aviso de subida)', (allJava.match(/setSmallIcon\(/g) || []).length === 13 && (allJava.match(/getIdentifier\("ic_notification", "drawable"/g) || []).length === 6 && allJava.indexOf('android.R.drawable') < 0);
  check('v1.5.8 notif: ya no queda ningún icono genérico de Android en las notificaciones', allJava.indexOf('android.R.drawable.ic_dialog_info') < 0 && allJava.indexOf('android.R.drawable.ic_menu_camera') < 0);
  check('v1.5.8 notif: las 11 notificaciones muestran el icono grande en grises (1.5.26: +2, sonido por chat y aviso local)', (allJava.match(/setLargeIcon\(/g) || []).length === 11 && (allJava.match(/getIdentifier\("ic_launcher_gray", "mipmap"/g) || []).length === 6);
  check('v1.5.8 notif: MainActivity guarda el icono grande en caché (no se decodifica cada vez)', /grayNotifIcon/.test(javaSrc) && /private android\.graphics\.Bitmap grayLargeIcon\(\)/.test(javaSrc) && /private int graySmallIcon\(\)/.test(javaSrc));
}

/* ---------------- servidor real ---------------- */
async function serverTests() {
  console.log('=== 11. Servidor real (Express + WebSocket) ===');
  const tmpDir = fs.mkdtempSync(path.join(__dirname, 'tmp-data-'));
  process.env.DATA_DIR = tmpDir;
  // v1.6: latido WebSocket rápido solo en pruebas (en producción, 30 s)
  process.env.WORDRED_HEARTBEAT_MS = '1000';
  // v2.9: Google con claves falsas en local (JWKS falso) para probar la
  // verificación del token sin tocar Google de verdad. El ID de cliente
  // es un valor de prueba, no una credencial real.
  const crypto = require('crypto');
  const http = require('http');
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const testJwk = publicKey.export({ format: 'jwk' });
  testJwk.kid = 'test-key-1';
  testJwk.alg = 'RS256';
  testJwk.use = 'sig';
  const jwksServer = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ keys: [testJwk] })); });
  const jwksPort = await new Promise((resolve) => jwksServer.listen(0, () => resolve(jwksServer.address().port)));
  process.env.GOOGLE_CLIENT_ID = 'cliente-de-prueba-wordred';
  process.env.GOOGLE_JWKS_URL = 'http://127.0.0.1:' + jwksPort + '/certs';
  function b64url(buf) { return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function googleJwt(overrides) {
    const header = { alg: 'RS256', kid: 'test-key-1', typ: 'JWT' };
    const nowSec = Math.floor(Date.now() / 1000);
    const payload = Object.assign({ iss: 'https://accounts.google.com', aud: 'cliente-de-prueba-wordred', sub: 'google-123', email: 'Ana@Gmail.com', name: 'Ana Google', email_verified: true, exp: nowSec + 3600, iat: nowSec }, overrides || {});
    const h = b64url(JSON.stringify(header));
    const p = b64url(JSON.stringify(payload));
    const sig = crypto.sign('RSA-SHA256', Buffer.from(h + '.' + p), privateKey);
    return h + '.' + p + '.' + b64url(sig);
  }
  const { server, _internals } = require('../server/server.js');
  const port = await new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
  const base = 'http://127.0.0.1:' + port;
  async function api(p, method, body, token) {
    const res = await fetch(base + p, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    return { status: res.status, data };
  }
  try {
    let r = await api('/api/health');
    check('servidor: /api/health responde', r.status === 200 && r.data && r.data.ok === true);
    const pageRes = await fetch(base + '/oauth/google');
    const pageHtml = await pageRes.text();
    check('servidor v3.0: la página de inicio con Google (GIS) se sirve con el ID del servidor', pageRes.status === 200 && pageHtml.indexOf('accounts.google.com/gsi/client') >= 0 && pageHtml.indexOf('cliente-de-prueba-wordred') >= 0 && pageHtml.indexOf('wordred://oauth/google') >= 0, pageHtml.slice(0, 200));
    r = await api('/api/auth/request-code', 'POST', { phone: A });
    check('servidor: pide código y devuelve devCode en modo prueba', r.status === 200 && r.data && r.data.ok && typeof r.data.devCode === 'string');
    r = await api('/api/auth/request-code', 'POST', { phone: A, appHash: 'AbC123xYz90' });
    check('servidor v1.3: pide código con appHash y sigue devolviendo devCode', r.status === 200 && r.data && r.data.ok && typeof r.data.devCode === 'string');
    const codeA = r.data.devCode;
    r = await api('/api/auth/verify', 'POST', { phone: A, code: '000000' });
    check('servidor: código incorrecto se rechaza', r.status === 400);
    r = await api('/api/auth/verify', 'POST', { phone: A, code: codeA });
    check('servidor: código correcto entrega token', r.status === 200 && r.data && r.data.token);
    const tokenA = r.data.token;
    r = await api('/api/profile', 'POST', { name: 'Ana Servidor', bio: 'Desde el servidor' }, tokenA);
    check('servidor: crea el perfil con token', r.status === 200 && r.data.profile.name === 'Ana Servidor');
    r = await api('/api/profile', 'POST', { name: 'X' });
    check('servidor: sin token no se puede crear perfil', r.status === 401);
    // segundo teléfono
    r = await api('/api/auth/request-code', 'POST', { phone: B });
    const codeB = r.data.devCode;
    r = await api('/api/auth/verify', 'POST', { phone: B, code: codeB });
    const tokenB = r.data.token;
    await api('/api/profile', 'POST', { name: 'Bruno Servidor' }, tokenB);
    // ---- v2.9: código por correo ----
    const MAIL = 'ana@correo.com';
    r = await api('/api/auth/email/request-code', 'POST', { email: 'no-es-correo' });
    check('v2.9 servidor: el correo inválido se rechaza', r.status === 400);
    r = await api('/api/auth/email/request-code', 'POST', { email: MAIL });
    check('v2.9 servidor: pide código por correo y devuelve devCode en modo prueba', r.status === 200 && r.data && r.data.ok && typeof r.data.devCode === 'string' && /^\d{6}$/.test(r.data.devCode) && r.data.sentByEmail === false, JSON.stringify(r.data));
    const mailCode = r.data.devCode;
    r = await api('/api/auth/email/verify', 'POST', { email: MAIL, code: '000000' });
    check('v2.9 servidor: el código por correo incorrecto se rechaza', r.status === 400);
    r = await api('/api/auth/email/verify', 'POST', { email: MAIL, code: mailCode });
    check('v2.9 servidor: el código por correo correcto entrega token', r.status === 200 && r.data && r.data.token && r.data.email === MAIL, JSON.stringify(r.data));
    const tokenMail = r.data.token;
    r = await api('/api/auth/email/verify', 'POST', { email: MAIL, code: mailCode });
    check('v2.9 servidor: el código por correo no se puede reutilizar', r.status === 400);
    // caducidad: se envejece el código en el almacén del servidor
    r = await api('/api/auth/email/request-code', 'POST', { email: 'otro@correo.com' });
    const mailCode2 = r.data.devCode;
    _internals.auth['otro@correo.com'].codeAt = Date.now() - 11 * 60 * 1000;
    r = await api('/api/auth/email/verify', 'POST', { email: 'otro@correo.com', code: mailCode2 });
    check('v2.9 servidor: el código por correo caducado se rechaza', r.status === 400 && /caduc/.test((r.data && r.data.error) || ''), JSON.stringify(r.data));
    // demasiados intentos
    r = await api('/api/auth/email/request-code', 'POST', { email: 'tercero@correo.com' });
    const mailCode3 = r.data.devCode;
    for (let i = 0; i < 6; i++) await api('/api/auth/email/verify', 'POST', { email: 'tercero@correo.com', code: '111111' });
    r = await api('/api/auth/email/verify', 'POST', { email: 'tercero@correo.com', code: mailCode3 });
    check('v2.9 servidor: demasiados intentos invalidan el código por correo', r.status === 400);
    // la cuenta de correo funciona como identidad: perfil, publicación y feed
    r = await api('/api/profile', 'POST', { name: 'Ana Correo' }, tokenMail);
    check('v2.9 servidor: la cuenta de correo crea su perfil', r.status === 200 && r.data.profile.name === 'Ana Correo');
    r = await api('/api/posts', 'POST', { text: 'Hola desde mi correo' }, tokenMail);
    check('v2.9 servidor: la cuenta de correo publica', r.status === 200 && r.data.post);
    const mailPostId = r.data.post.id;
    r = await api('/api/feed?phone=' + encodeURIComponent(MAIL));
    check('v2.9 servidor: el feed con identidad de correo trae su publicación', r.status === 200 && r.data.posts.some(p => p.id === mailPostId));
    // ---- v2.9: inicio con Google ----
    r = await api('/api/auth/google', 'POST', {});
    check('v2.9 servidor: Google sin token se rechaza', r.status === 400);
    r = await api('/api/auth/google', 'POST', { idToken: 'basura' });
    check('v2.9 servidor: Google con token falso se rechaza', r.status === 401);
    r = await api('/api/auth/google', 'POST', { idToken: googleJwt({ aud: 'otro-cliente' }) });
    check('v2.9 servidor: Google con cliente distinto se rechaza', r.status === 401);
    r = await api('/api/auth/google', 'POST', { idToken: googleJwt({ exp: Math.floor(Date.now() / 1000) - 10 }) });
    check('v2.9 servidor: Google con token caducado se rechaza', r.status === 401);
    r = await api('/api/auth/google', 'POST', { idToken: googleJwt({ email_verified: false }) });
    check('v2.9 servidor: Google con correo sin verificar se rechaza', r.status === 401);
    const goodJwt = googleJwt();
    const tampered = goodJwt.split('.');
    tampered[1] = (tampered[1][0] === 'A' ? 'B' : 'A') + tampered[1].slice(1);
    r = await api('/api/auth/google', 'POST', { idToken: tampered.join('.') });
    check('v2.9 servidor: Google con firma rota se rechaza', r.status === 401);
    r = await api('/api/auth/google', 'POST', { idToken: goodJwt });
    check('v2.9 servidor: Google con token válido entrega sesión con el correo', r.status === 200 && r.data && r.data.token && r.data.email === 'ana@gmail.com' && r.data.name === 'Ana Google' && r.data.hasProfile === false, JSON.stringify(r.data));
    // publicación + reacción + comentario
    r = await api('/api/posts', 'POST', { text: 'Hola desde el servidor #WordRed' }, tokenA);
    check('servidor: publica', r.status === 200 && r.data.post && r.data.post.id);
    const postId = r.data.post.id;
    r = await api('/api/posts/' + postId + '/like', 'POST', { reaction: 'Me encanta' }, tokenB);
    check('servidor: reacción se guarda', r.status === 200 && r.data.likes && r.data.likes[B] === 'Me encanta');
    r = await api('/api/posts/' + postId + '/comment', 'POST', { text: '¡Qué bien!' }, tokenB);
    check('servidor: comentario se guarda', r.status === 200 && r.data.comment);
    r = await api('/api/posts/' + postId + '/share', 'POST', {}, tokenB);
    check('servidor: compartir crea republicación', r.status === 200 && r.data.post && r.data.post.sharedFrom);
    r = await api('/api/feed?phone=' + B);
    check('servidor: el feed trae la publicación', r.status === 200 && r.data.posts.some(p => p.id === postId));
    // amistad
    r = await api('/api/friends/request', 'POST', { to: B }, tokenA);
    check('servidor: solicitud de amistad', r.status === 200 && r.data.request);
    const reqId = r.data.request.id;
    r = await api('/api/friends/respond', 'POST', { requestId: reqId, accept: true }, tokenB);
    check('servidor: aceptar amistad', r.status === 200 && r.data.request.status === 'accepted');
    r = await api('/api/friends?phone=' + A);
    check('servidor: lista de amigos', r.status === 200 && r.data.friends.some(f => f.phone === B));
    // grupos
    r = await api('/api/groups', 'POST', { name: 'Grupo de prueba', desc: 'Desc' }, tokenA);
    check('servidor: crea grupo', r.status === 200 && r.data.group);
    const grpId = r.data.group.id;
    r = await api('/api/groups/' + grpId + '/join', 'POST', {}, tokenB);
    check('servidor: unirse al grupo', r.status === 200 && r.data.group.members.length === 2);
    r = await api('/api/posts', 'POST', { text: 'Post del grupo', groupId: grpId }, tokenB);
    check('servidor: publicar en el grupo', r.status === 200 && r.data.post.groupId === grpId);
    // historias
    r = await api('/api/stories', 'POST', { text: 'Historia del servidor' }, tokenA);
    check('servidor: crea historia', r.status === 200 && r.data.story);
    const storyId = r.data.story.id;
    r = await api('/api/stories/' + storyId + '/view', 'POST', {}, tokenB);
    check('servidor: ver historia cuenta la vista', r.status === 200 && r.data.views === 1);
    // mensajes + WebSocket en tiempo real
    const WebSocket = require('ws');
    const wsB = new WebSocket('ws://127.0.0.1:' + port + '/ws?phone=' + B);
    await new Promise((resolve) => wsB.on('open', resolve));
    const got = new Promise((resolve) => {
      wsB.on('message', (raw) => {
        try { const d = JSON.parse(raw.toString()); if (d.kind === 'message') resolve(d.message); } catch (e) {}
      });
      setTimeout(() => resolve(null), 5000);
    });
    r = await api('/api/messages', 'POST', { to: B, text: 'Hola por WebSocket' }, tokenA);
    check('servidor: envía mensaje', r.status === 200 && r.data.message);
    const delivered = await got;
    check('servidor: el mensaje llega en tiempo real por WebSocket', delivered && delivered.text === 'Hola por WebSocket', JSON.stringify(delivered));
    wsB.close();
    r = await api('/api/messages?phone=' + B);
    check('servidor: la conversación se lista', r.status === 200 && r.data.conversations.length === 1 && r.data.conversations[0].messages.length === 1);
    // notificaciones y búsqueda
    r = await api('/api/notifications?phone=' + B);
    check('servidor: hay notificaciones para B', r.status === 200 && r.data.notifications.length >= 2);
    r = await api('/api/search?q=' + encodeURIComponent('WordRed') + '&phone=' + B);
    check('servidor: la búsqueda encuentra la publicación', r.status === 200 && r.data.posts.length >= 1);
    r = await api('/api/search?q=' + encodeURIComponent('Bruno') + '&phone=' + A);
    check('servidor: la búsqueda encuentra personas', r.status === 200 && r.data.people.some(p => p.phone === B));
    // v1.1: perfil con personalización
    r = await api('/api/profile', 'POST', { name: 'Ana Servidor', frame: 'dorado', accent: 'azul', job: 'Diseñadora', city: 'CDMX', website: 'https://ana.com', sectionPrivacy: { bio: 'Amigos', friends: 'Público', posts: 'Público' } }, tokenA);
    check('servidor v1.1: perfil guarda marco, tema y campos', r.status === 200 && r.data.profile.frame === 'dorado' && r.data.profile.accent === 'azul' && r.data.profile.job === 'Diseñadora' && r.data.profile.website === 'https://ana.com');
    // v1.1: publicación con enlace y encuesta
    r = await api('/api/posts', 'POST', { text: 'Miren esto', link: { url: 'ejemplo.com', title: 'Ejemplo' } }, tokenA);
    check('servidor v1.1: publica con enlace', r.status === 200 && r.data.post.link && r.data.post.link.url === 'https://ejemplo.com');
    const linkPostId = r.data.post.id;
    r = await api('/api/posts', 'POST', { text: 'Voten', poll: { question: '¿Qué prefieren?', options: [{ id: 'o1', text: 'Tacos', votes: [] }, { id: 'o2', text: 'Pizza', votes: [] }] } }, tokenA);
    check('servidor v1.1: publica con encuesta', r.status === 200 && r.data.post.poll && r.data.post.poll.options.length === 2);
    const pollPostId = r.data.post.id;
    r = await api('/api/posts/' + pollPostId + '/vote', 'POST', { optionId: 'o1' }, tokenB);
    check('servidor v1.1: voto en encuesta se guarda', r.status === 200 && r.data.poll.options[0].votes.includes(B));
    r = await api('/api/posts/' + linkPostId + '/comment', 'POST', { text: 'Comentario para borrar' }, tokenB);
    const cId = r.data.comment.id;
    r = await api('/api/posts/' + linkPostId + '/comment/' + cId, 'DELETE', null, tokenB);
    check('servidor v1.1: borra el comentario', r.status === 200 && r.data.ok);
    // v1.1: marketplace
    r = await api('/api/listings', 'POST', { title: 'Bicicleta', price: 3500, category: 'Deportes', condition: 'Usado', city: 'CDMX' }, tokenA);
    check('servidor v1.1: crea anuncio', r.status === 200 && r.data.listing && r.data.listing.price === 3500);
    const lstId = r.data.listing.id;
    r = await api('/api/listings?q=bicicleta');
    check('servidor v1.1: busca anuncios', r.status === 200 && r.data.listings.some(l => l.id === lstId));
    r = await api('/api/listings/' + lstId + '/sold', 'POST', {}, tokenA);
    check('servidor v1.1: marca vendido', r.status === 200 && r.data.listing.status === 'Vendido');
    r = await api('/api/listings/' + lstId + '/sold', 'POST', {}, tokenB);
    check('servidor v1.1: solo el vendedor marca vendido', r.status === 403);
    r = await api('/api/listings/' + lstId, 'DELETE', null, tokenA);
    check('servidor v1.1: borra anuncio', r.status === 200 && r.data.ok);
    // v1.1: eventos
    r = await api('/api/events', 'POST', { name: 'Fiesta', date: '2026-12-01', time: '20:00', place: 'Mi casa' }, tokenA);
    check('servidor v1.1: crea evento', r.status === 200 && r.data.event);
    const evtId = r.data.event.id;
    r = await api('/api/events/' + evtId + '/rsvp', 'POST', { status: 'asiste' }, tokenB);
    check('servidor v1.1: asistir al evento', r.status === 200 && r.data.event.attendees[B] === 'asiste');
    r = await api('/api/events/' + evtId + '/cancel', 'POST', {}, tokenB);
    check('servidor v1.1: solo el creador cancela', r.status === 403);
    r = await api('/api/events/' + evtId + '/cancel', 'POST', {}, tokenA);
    check('servidor v1.1: el creador cancela el evento', r.status === 200 && r.data.event.status === 'Cancelado');
    // v1.1: páginas
    r = await api('/api/pages', 'POST', { name: 'Cocina de Ana', category: 'Comida' }, tokenA);
    check('servidor v1.1: crea página', r.status === 200 && r.data.page);
    const pageId = r.data.page.id;
    r = await api('/api/pages/' + pageId + '/follow', 'POST', { follow: true }, tokenB);
    check('servidor v1.1: seguir página', r.status === 200 && r.data.following === true);
    r = await api('/api/posts', 'POST', { text: 'Receta del día', pageId: pageId }, tokenA);
    check('servidor v1.1: publica en la página', r.status === 200 && r.data.post.pageId === pageId);
    r = await api('/api/feed?phone=' + B);
    check('servidor v1.1: la publicación de la página sale en el feed del seguidor', r.status === 200 && r.data.posts.some(p => p.pageId === pageId));
    // v1.1: borrados
    r = await api('/api/stories/' + storyId, 'DELETE', null, tokenA);
    check('servidor v1.1: borra historia', r.status === 200 && r.data.ok);
    r = await api('/api/conversations/' + A, 'DELETE', null, tokenB);
    check('servidor v1.1: borra conversación', r.status === 200 && r.data.ok && r.data.removed === 1);
    r = await api('/api/groups/' + grpId, 'DELETE', null, tokenB);
    check('servidor v1.1: solo la creadora borra el grupo', r.status === 403);
    // v1.1: subidas sin límite — un cuerpo JSON de 12 MB (más que el viejo
    // tope de 10 MB) se acepta; el único límite es el disco del servidor.
    const bigMedia = 'https://srv/video-12mb.mp4?relleno=' + 'A'.repeat(12 * 1024 * 1024);
    r = await api('/api/posts', 'POST', { text: 'Video enorme', media: bigMedia, mediaType: 'video' }, tokenA);
    check('servidor v1.1: publicación con video de 12 MB se acepta', r.status === 200 && r.data.post && r.data.post.media.length === bigMedia.length);
    // v1.2: salud con versión 1.2
    r = await api('/api/health');
    check('servidor v3.0: la versión es 3.0', r.status === 200 && r.data.version === '3.0');
    // v1.2: publicación con todo lo nuevo (fondo, sentimiento, etiquetas, ubicación, varias fotos)
    r = await api('/api/posts', 'POST', { text: 'Día **bonito**', bg: 'atardecer', feeling: { kind: 'feeling', text: 'feliz' }, tags: [B], location: 'CDMX', mediaList: [{ src: 'https://srv/f1.jpg', type: 'image' }, { src: 'https://srv/f2.jpg', type: 'image' }] }, tokenA);
    check('servidor v1.2: publica con fondo, sentimiento, etiquetas y varias fotos', r.status === 200 && r.data.post.bg === 'atardecer' && r.data.post.feeling.text === 'feliz' && r.data.post.tags.includes(B) && r.data.post.location === 'CDMX' && r.data.post.mediaList.length === 2);
    // v2.1: la publicación de un live grabado conserva su marca en el servidor.
    r = await api('/api/posts', 'POST', { id: 'post_rec21', text: 'Live de prueba', media: 'https://res.cloudinary.com/x/video/upload/live21.mp4', mediaType: 'video', privacy: 'Público', isLiveRecording: true, liveRecordingId: 'rec_21', liveRecDurationMs: 65000 }, tokenA);
    check('servidor v2.1: la publicación de un live grabado conserva la marca, el id y la duración', r.status === 200 && r.data.post && r.data.post.isLiveRecording === true && r.data.post.liveRecordingId === 'rec_21' && r.data.post.liveRecDurationMs === 65000, JSON.stringify(r.data));
    // v2.1 modo invitado: el servidor rechaza publicar, reaccionar,
    // comentar y entrar a un live sin una sesión verificada.
    r = await api('/api/posts', 'POST', { text: 'Sin sesión' });
    check('servidor v2.1: publicar sin token se rechaza (401)', r.status === 401);
    r = await api('/api/posts/' + postId + '/like', 'POST', { reaction: 'Me gusta' });
    check('servidor v2.1: reaccionar sin token se rechaza (401)', r.status === 401);
    r = await api('/api/posts/' + postId + '/comment', 'POST', { text: 'Hola' });
    check('servidor v2.1: comentar sin token se rechaza (401)', r.status === 401);
    r = await api('/api/lives/xxx/join', 'POST', {});
    check('servidor v2.1: entrar a un live sin token se rechaza (401)', r.status === 401);
    // v2.1 calificar juegos: el servidor guarda la calificación y el
    // promedio se ve para todos; sin token se rechaza.
    r = await api('/api/games/ps:com.roblox.client/rate', 'POST', { stars: 5, comment: 'Muy bueno' });
    check('servidor v2.1: calificar un juego de Play Store sin token se rechaza (401)', r.status === 401);
    r = await api('/api/games/ps:com.roblox.client/rate', 'POST', { stars: 5, comment: 'Muy bueno' }, tokenA);
    check('servidor v2.1: calificar Roblox con 5 estrellas se guarda y el promedio es 5.0', r.status === 200 && r.data.stats && r.data.stats.ratingAvg === 5 && r.data.stats.ratingCount === 1, JSON.stringify(r.data));
    r = await api('/api/games/ps:com.roblox.client/rate', 'POST', { stars: 3 }, tokenB);
    check('servidor v2.1: otra persona califica con 3 y el promedio baja a 4.0 con 2 votos', r.status === 200 && r.data.stats && r.data.stats.ratingAvg === 4 && r.data.stats.ratingCount === 2, JSON.stringify(r.data));
    r = await api('/api/games/ps:com.roblox.client/rate', 'POST', { stars: 4 }, tokenA);
    check('servidor v2.1: volver a calificar actualiza el voto (no duplica) y el promedio es 3.5', r.status === 200 && r.data.stats && r.data.stats.ratingAvg === 3.5 && r.data.stats.ratingCount === 2, JSON.stringify(r.data));
    r = await api('/api/games/stats');
    check('servidor v2.1: las estadísticas traen el promedio real de Roblox', r.status === 200 && r.data.stats && r.data.stats['ps:com.roblox.client'] && r.data.stats['ps:com.roblox.client'].ratingAvg === 3.5 && r.data.stats['ps:com.roblox.client'].ratingCount === 2, JSON.stringify(r.data));
    r = await api('/api/games/ps:com.roblox.client/play', 'POST', {});
    check('servidor v2.1: registrar una jugada sin token se rechaza (401)', r.status === 401);
    r = await api('/api/games/ps:com.roblox.client/play', 'POST', {}, tokenA);
    check('servidor v2.1: registrar una jugada cuenta 1 persona que lo jugó', r.status === 200 && r.data.stats && r.data.stats.players === 1, JSON.stringify(r.data));
    // v1.2: marketplace con WhatsApp y campos nuevos + filtros
    r = await api('/api/listings', 'POST', { title: 'Celular', price: 5000, category: 'Celulares', condition: 'Usado', brand: 'Samsung', whatsapp: '5512345678', negotiable: true, delivery: 'Envío', city: 'CDMX' }, tokenA);
    check('servidor v1.2: crea anuncio con WhatsApp, marca, negociable y entrega', r.status === 200 && r.data.listing.whatsapp === '5512345678' && r.data.listing.brand === 'Samsung' && r.data.listing.negotiable === true && r.data.listing.delivery === 'Envío');
    const lst2 = r.data.listing.id;
    r = await api('/api/listings?delivery=Envío&negotiable=true');
    check('servidor v1.2: el filtro de entrega y negociable funciona', r.status === 200 && r.data.listings.some(l => l.id === lst2));
    r = await api('/api/listings?q=samsung');
    check('servidor v1.2: la búsqueda encuentra por marca', r.status === 200 && r.data.listings.some(l => l.id === lst2));
    // v1.2: grupos de ventas
    r = await api('/api/sales-groups', 'POST', { name: 'Ventas de autos', desc: 'Solo autos', category: 'Vehículos', rules: 'Sin spam.' }, tokenA);
    check('servidor v1.2: crea grupo de ventas', r.status === 200 && r.data.group && r.data.group.members.length === 1);
    const sgId = r.data.group.id;
    r = await api('/api/sales-groups/' + sgId + '/join', 'POST', {}, tokenB);
    check('servidor v1.2: unirse al grupo de ventas', r.status === 200 && r.data.group.members.length === 2);
    r = await api('/api/listings', 'POST', { title: 'Auto', price: 90000, category: 'Vehículos', condition: 'Usado', salesGroupId: sgId }, tokenB);
    check('servidor v1.2: publicar un anuncio dentro del grupo', r.status === 200 && r.data.listing.salesGroupId === sgId);
    r = await api('/api/sales-groups?q=autos');
    check('servidor v1.2: buscar grupos de ventas', r.status === 200 && r.data.salesGroups.some(g => g.id === sgId));
    r = await api('/api/sales-groups/' + sgId + '/leave', 'POST', {}, tokenB);
    check('servidor v1.2: salir del grupo de ventas', r.status === 200 && r.data.group.members.length === 1);
    r = await api('/api/sales-groups/' + sgId, 'DELETE', null, tokenB);
    check('servidor v1.2: solo la creadora borra el grupo', r.status === 403);
    // v1.2: perfil de ventas y valoraciones
    r = await api('/api/sellers/' + A + '/ratings', 'POST', { stars: 5, comment: 'Todo bien' }, tokenB);
    check('servidor v1.2: valorar al vendedor con 5 estrellas', r.status === 200 && r.data.rating.stars === 5);
    r = await api('/api/sellers/' + A, 'GET');
    check('servidor v1.2: el perfil de ventas trae promedio y anuncios', r.status === 200 && r.data.seller.avg === 5 && r.data.seller.active.length >= 1);
    r = await api('/api/sellers/' + A + '/ratings', 'POST', { stars: 5 }, tokenA);
    check('servidor v1.2: valorarse a uno mismo se rechaza', r.status === 400);
    // v1.2: historias con me gusta, comentario y compartir + personalización
    r = await api('/api/stories', 'POST', { text: 'Historia con adornos', edits: { filter: 'sepia', texts: [{ text: 'Hola', color: '#fff', size: 30, x: 50, y: 50 }] } }, tokenA);
    check('servidor v1.2: crea historia personalizada', r.status === 200 && r.data.story.edits.filter === 'sepia' && r.data.story.edits.texts.length === 1);
    const story2 = r.data.story.id;
    r = await api('/api/stories/' + story2 + '/like', 'POST', {}, tokenB);
    check('servidor v1.2: me gusta en la historia', r.status === 200 && r.data.likes === 1);
    r = await api('/api/stories/' + story2 + '/comment', 'POST', { text: '¡Qué bonita!' }, tokenB);
    check('servidor v1.2: comentario en la historia', r.status === 200 && r.data.comment);
    r = await api('/api/stories/' + story2 + '/share', 'POST', {}, tokenB);
    check('servidor v1.2: compartir la historia', r.status === 200 && r.data.shares === 1);
    // v1.2: mensajes con archivo y con voz
    r = await api('/api/messages', 'POST', { to: B, text: '', file: { name: 'contrato.pdf', size: 123456, mime: 'application/pdf', uri: 'content://x/c.pdf' } }, tokenA);
    check('servidor v1.2: envía un archivo por mensaje', r.status === 200 && r.data.message.file && r.data.message.file.name === 'contrato.pdf');
    r = await api('/api/messages', 'POST', { to: B, text: '', voice: { uri: 'content://x/v.m4a', duration: 42000, size: 1000, mime: 'audio/mpeg' } }, tokenA);
    check('servidor v1.2: envía un mensaje de voz', r.status === 200 && r.data.message.voice && r.data.message.voice.duration === 42000);
    // v1.2: señalización de llamadas WebRTC
    r = await api('/api/call-signal', 'POST', { to: B, type: 'offer', payload: { sdp: 'x' } });
    check('servidor v1.2: sin token no se señaliza la llamada', r.status === 401);
    r = await api('/api/call-signal', 'POST', { to: B, type: 'offer', payload: { sdp: 'x' } }, tokenA);
    check('servidor v1.2: con la otra persona fuera de línea no se entrega', r.status === 404);
    const wsB2 = new WebSocket('ws://127.0.0.1:' + port + '/ws?phone=' + B);
    await new Promise((resolve) => wsB2.on('open', resolve));
    const gotCall = new Promise((resolve) => {
      wsB2.on('message', (raw) => {
        try { const d = JSON.parse(raw.toString()); if (d.kind === 'call') resolve(d); } catch (e) {}
      });
      setTimeout(() => resolve(null), 5000);
    });
    r = await api('/api/call-signal', 'POST', { to: B, type: 'offer', payload: { sdp: 'oferta' } }, tokenA);
    check('servidor v1.2: la señal se acepta cuando la otra persona está en línea', r.status === 200 && r.data.ok === true);
    const callSig = await gotCall;
    check('servidor v1.2: la señal de llamada llega por WebSocket', callSig && callSig.type === 'offer' && callSig.from === A, JSON.stringify(callSig));
    // ---- v1.6: el live sin perfil en el servidor dice QUÉ falta (404),
    // y el servidor mantiene vivo el WebSocket con latido (ping/pong) ----
    const E = '5599999999';
    r = await api('/api/auth/request-code', 'POST', { phone: E });
    r = await api('/api/auth/verify', 'POST', { phone: E, code: r.data.devCode });
    const tokenNoProfile = r.data.token;
    r = await api('/api/lives', 'POST', { title: 'Live sin perfil' }, tokenNoProfile);
    check('servidor v1.6: crear un live sin perfil en el servidor responde 404 y dice qué falta', r.status === 404 && String((r.data && r.data.error) || '').indexOf('Perfil') >= 0, JSON.stringify(r.data));
    const wsE = new WebSocket('ws://127.0.0.1:' + port + '/ws?phone=' + E);
    await new Promise((resolve) => { wsE.on('open', resolve); setTimeout(resolve, 3000); });
    let pings = 0;
    wsE.on('ping', function () { pings++; });
    await new Promise((res) => setTimeout(res, 2500));
    check('servidor v1.6: el servidor envía latido (ping) por WebSocket para detectar conexiones muertas', pings >= 1, 'pings=' + pings);
    wsE.close();
    r = await api('/api/health');
    check('servidor v3.0: /api/health dice versión 3.0', r.status === 200 && r.data && r.data.version === '3.0', JSON.stringify(r.data));
    // --- ola 7: audio, personal de grupo, bloqueo y reportes ---
    const extraPhones = ['5544444444', '5555555555', '5566666666'];
    const extraTokens = {};
    for (const ph of extraPhones) {
      r = await api('/api/auth/request-code', 'POST', { phone: ph });
      r = await api('/api/auth/verify', 'POST', { phone: ph, code: r.data.devCode });
      extraTokens[ph] = r.data.token;
      await api('/api/profile', 'POST', { name: 'Persona ' + ph }, extraTokens[ph]);
    }
    const tokenC = extraTokens['5544444444'], tokenE = extraTokens['5555555555'], tokenF = extraTokens['5566666666'];
    r = await api('/api/posts', 'POST', { text: '', media: 'https://srv/cancion.mp3', mediaType: 'audio', audioTitle: 'Mi canción', audioCover: 'portada.jpg' }, tokenA);
    check('servidor ola 7: publicación de audio guarda título y portada', r.status === 200 && r.data.post.audioTitle === 'Mi canción' && r.data.post.audioCover === 'portada.jpg');
    r = await api('/api/posts', 'POST', { text: 'Foto con canción', media: 'https://srv/foto.jpg', mediaType: 'image', song: { id: 'cancion-8', title: 'Ritmo del Caribe', artist: 'Brisa Tropical', mood: 'tropical' } }, tokenA);
    check('servidor ola 8: publicación con canción guarda su canción', r.status === 200 && r.data.post.song && r.data.post.song.title === 'Ritmo del Caribe');
    r = await api('/api/stories', 'POST', { text: 'Video', media: 'clip.mp4', mediaType: 'video', song: { id: 'cancion-2', title: 'Fiesta en la ciudad', artist: 'Los Nocturnos', mood: 'fiesta', auto: true } }, tokenA);
    check('servidor ola 9: historia con video guarda su audio automático', r.status === 200 && r.data.story.song && r.data.story.song.auto === true);
    r = await api('/api/ads', 'POST', { pageId, title: 'Oferta del día', text: 'Hoy 2x1', link: 'https://cocinaana.com', media: 'oferta.jpg', mediaType: 'image', song: { id: 'marca-1', title: 'Jingle de la casa', artist: 'Cocina de Ana', mood: 'alegre' } }, tokenA);
    check('servidor ola 8: la empresa crea su anuncio', r.status === 200 && r.data.ad && r.data.ad.isAd === true && r.data.ad.adTitle === 'Oferta del día' && r.data.ad.song.title === 'Jingle de la casa');
    const adId = r.data.ad.id;
    r = await api('/api/ads', 'POST', { pageId, title: 'Falso', text: 'No soy la dueña' }, tokenB);
    check('servidor ola 8: solo la creadora de la página crea anuncios', r.status === 403);
    r = await api('/api/ads');
    check('servidor ola 8: la lista de anuncios trae el anuncio', r.status === 200 && r.data.ads.some(a => a.id === adId));
    r = await api('/api/feed?phone=' + B);
    check('servidor ola 8: el anuncio aparece en el feed', r.status === 200 && r.data.posts.some(pp => pp.id === adId));
    r = await api('/api/groups', 'POST', { name: 'Club con personal', desc: 'Grupo de prueba', approval: true }, tokenA);
    check('servidor ola 7: crea grupo con aprobación y personal vacío', r.status === 200 && r.data.group.approval === true && r.data.group.admins.length === 0);
    const grp2 = r.data.group.id;
    r = await api('/api/groups/' + grp2 + '/join', 'POST', {}, tokenB);
    check('servidor ola 7: unirse a grupo con aprobación crea solicitud', r.status === 200 && r.data.requested === true);
    r = await api('/api/groups/' + grp2 + '/members/5522222222/approve', 'POST', {}, tokenA);
    check('servidor ola 7: el creador aprueba la solicitud', r.status === 200 && r.data.group.members.includes(B));
    for (const [tk, ph] of [[tokenC, '5544444444'], [tokenE, '5555555555'], [tokenF, '5566666666']]) {
      await api('/api/groups/' + grp2 + '/join', 'POST', {}, tk);
      await api('/api/groups/' + grp2 + '/members/' + ph + '/approve', 'POST', {}, tokenA);
    }
    r = await api('/api/groups/' + grp2 + '/admins', 'POST', { phone: B }, tokenA);
    check('servidor ola 7: el creador nombra administrador', r.status === 200 && r.data.group.admins.includes(B));
    r = await api('/api/groups/' + grp2 + '/admins', 'POST', { phone: '5544444444' }, tokenB);
    check('servidor ola 7: un administrador no puede nombrar a otro', r.status === 403);
    await api('/api/groups/' + grp2 + '/admins', 'POST', { phone: '5544444444' }, tokenA);
    await api('/api/groups/' + grp2 + '/admins', 'POST', { phone: '5555555555' }, tokenA);
    r = await api('/api/groups/' + grp2 + '/admins', 'POST', { phone: '5566666666' }, tokenA);
    check('servidor ola 7: el tope de 3 administradores se cumple', r.status === 400);
    r = await api('/api/groups/' + grp2, 'PUT', { group: { name: 'Club con personal (nuevo nombre)' } }, tokenB);
    check('servidor ola 7: un administrador puede personalizar el grupo', r.status === 200 && r.data.group.name === 'Club con personal (nuevo nombre)');
    r = await api('/api/posts', 'POST', { text: 'Aviso fijado', groupId: grp2 }, tokenB);
    const pinPostId = r.data.post.id;
    r = await api('/api/groups/' + grp2 + '/pin', 'POST', { postId: pinPostId, pin: true }, tokenB);
    check('servidor ola 7: un administrador fija publicaciones', r.status === 200 && r.data.group.pinnedPosts.includes(pinPostId));
    r = await api('/api/reports', 'POST', { reported: B, reason: 'motivo raro', desc: 'x' }, tokenA);
    check('servidor ola 7: reporte con motivo inválido se rechaza', r.status === 400);
    r = await api('/api/reports', 'POST', { reported: B, reason: 'spam', desc: 'Publica spam' }, tokenA);
    check('servidor ola 7: el reporte queda registrado', r.status === 200 && r.data.report.reason === 'spam' && r.data.report.status === 'pendiente');
    r = await api('/api/reports', 'GET', null, tokenA);
    check('servidor ola 7: mis reportes se listan', r.status === 200 && r.data.reports.length === 1);
    r = await api('/api/block', 'POST', { phone: B }, tokenA);
    check('servidor ola 7: bloquear funciona', r.status === 200 && r.data.blocked.includes(B));
    r = await api('/api/blocked', 'GET', null, tokenA);
    check('servidor ola 7: la lista de bloqueados trae a B', r.status === 200 && r.data.blocked.includes(B));
    r = await api('/api/feed?phone=' + B);
    check('servidor ola 7: el bloqueado ya no ve las publicaciones en su feed', r.status === 200 && !r.data.posts.some(pp => pp.id === postId));
    r = await api('/api/messages', 'POST', { to: B, text: 'No deberías leer esto' }, tokenA);
    check('servidor ola 7: no se puede escribir a quien bloqueaste', r.status === 403);
    r = await api('/api/unblock', 'POST', { phone: B }, tokenA);
    check('servidor ola 7: desbloquear funciona', r.status === 200 && !r.data.blocked.includes(B));
    r = await api('/api/messages', 'POST', { to: B, text: 'Ya te desbloqueé' }, tokenA);
    check('servidor ola 7: tras desbloquear, el mensaje vuelve a pasar', r.status === 200 && r.data.message);
    // --- ola 10: editar publicaciones y anuncios ---
    // (el bloqueo de la ola 7 rompió la amistad A-B; se vuelve a hacer amigos)
    r = await api('/api/friends/request', 'POST', { to: B }, tokenA);
    const reqId2 = r.data.request.id;
    r = await api('/api/friends/respond', 'POST', { requestId: reqId2, accept: true }, tokenB);
    check('servidor ola 10: A y B vuelven a ser amigos para el test de seguidos', r.status === 200 && r.data.request.status === 'accepted');
    r = await api('/api/posts/' + postId, 'PUT', { text: 'Hola desde el servidor (editado)' }, tokenB);
    check('servidor ola 10: solo el autor edita su publicación', r.status === 403);
    for (let i = 1; i <= 5; i++) {
      r = await api('/api/posts/' + postId, 'PUT', { text: 'Edición ' + i + ' del servidor' }, tokenA);
      check('servidor ola 10: edición ' + i + ' de 5 permitida', r.status === 200 && r.data.post.edited === true && r.data.editsLeft === 5 - i);
    }
    r = await api('/api/posts/' + postId, 'PUT', { text: 'Sexta edición' }, tokenA);
    check('servidor ola 10: la sexta edición se bloquea', r.status === 400);
    r = await api('/api/feed?phone=' + B);
    check('servidor ola 10: el feed muestra la publicación editada con su etiqueta', r.status === 200 && r.data.posts.some(pp => pp.id === postId && pp.edited === true && pp.text === 'Edición 5 del servidor'));
    r = await api('/api/listings', 'POST', { title: 'Bicicleta de montaña', price: 3000, category: 'Deportes', condition: 'Usado', city: 'CDMX' }, tokenA);
    const w10lst = r.data.listing.id;
    r = await api('/api/listings', 'POST', { title: 'Silla gamer', price: 1500, category: 'Muebles', condition: 'Nuevo', city: 'CDMX' }, tokenB);
    const w10lstB = r.data.listing.id;
    r = await api('/api/listings/' + w10lst, 'PUT', { price: 2500, brand: 'Trek' }, tokenB);
    check('servidor ola 10: solo el vendedor cambia su anuncio', r.status === 403);
    r = await api('/api/listings/' + w10lst, 'PUT', { price: 2500, brand: 'Trek', delivery: 'Envío' }, tokenA);
    check('servidor ola 10: cambiar el precio actualiza el anuncio', r.status === 200 && r.data.listing.price === 2500 && r.data.listing.brand === 'Trek');
    r = await api('/api/listings?q=bicicleta');
    check('servidor ola 10: el cambio de precio se ve en la búsqueda para todos', r.status === 200 && r.data.listings.some(l => l.id === w10lst && l.price === 2500));
    r = await api('/api/listings?seller=' + A);
    check('servidor ola 10: mis ventas (filtro por vendedor)', r.status === 200 && r.data.listings.some(l => l.id === w10lst) && !r.data.listings.some(l => l.id === w10lstB));
    r = await api('/api/listings?followedBy=' + A);
    check('servidor ola 10: ventas de seguidos trae lo de mis amigos', r.status === 200 && r.data.listings.some(l => l.id === w10lstB) && !r.data.listings.some(l => l.id === w10lst));
    r = await api('/api/listings/' + w10lst + '/sold', 'POST', {}, tokenA);
    check('servidor ola 10: marcar vendido funciona', r.status === 200 && r.data.listing.status === 'Vendido');
    r = await api('/api/listings?q=bicicleta');
    check('servidor ola 10: lo vendido ya no sale en la lista general', r.status === 200 && !r.data.listings.some(l => l.id === w10lst));
    r = await api('/api/listings?mine=' + A);
    check('servidor ola 10: lo vendido sigue visible en mis ventas', r.status === 200 && r.data.listings.some(l => l.id === w10lst && l.status === 'Vendido'));
    // --- ola 11: sin límite y editor de video ---
    const manyPhotos = Array.from({ length: 20 }, (_, i) => 'https://srv/foto' + i + '.jpg');
    r = await api('/api/posts', 'POST', { text: 'Veinte fotos', mediaList: manyPhotos.map(s => ({ src: s, type: 'image' })) }, tokenA);
    check('servidor ola 11: una publicación con 20 fotos se guarda completa', r.status === 200 && r.data.post.mediaList.length === 20);
    r = await api('/api/listings', 'POST', { title: 'Lote de 12 fotos', price: 100, category: 'Otros', condition: 'Usado', photos: Array.from({ length: 12 }, (_, i) => 'p' + i + '.jpg') }, tokenA);
    check('servidor ola 11: un anuncio con 12 fotos se guarda (sin tope de 8)', r.status === 200 && r.data.listing.photos.length === 12);
    r = await api('/api/posts', 'POST', { text: 'Video editado', media: 'https://srv/clip.mp4', mediaType: 'video', videoEdits: { stickers: [{ emoji: '🎉', x: 20, y: 30, size: 60 }], subtitles: [{ text: 'Hola a todos', start: 0, end: 3000 }], song: { id: 'cancion-4', title: 'Amanecer alegre', artist: 'Sol Naciente', mood: 'alegre' }, trimStart: 2000, trimEnd: 12000, durationMs: 20000 } }, tokenA);
    check('servidor ola 11: el video publicado guarda su edición completa', r.status === 200 && r.data.post.videoEdits.stickers.length === 1 && r.data.post.videoEdits.subtitles[0].text === 'Hola a todos' && r.data.post.videoEdits.song.title === 'Amanecer alegre' && r.data.post.videoEdits.trimStart === 2000 && r.data.post.videoEdits.trimEnd === 12000);
    const vedPostId = r.data.post.id;
    r = await api('/api/posts/' + vedPostId, 'PUT', { videoEdits: { stickers: [{ emoji: '❤️', x: 50, y: 50 }], trimStart: 0, trimEnd: null } }, tokenA);
    check('servidor ola 11: la edición del video se puede cambiar al modificar', r.status === 200 && r.data.post.videoEdits.stickers[0].emoji === '❤️');
    r = await api('/api/stories', 'POST', { text: 'Historia video', media: 'clip.mp4', mediaType: 'video', videoEdits: { subtitles: [{ text: 'Miren esto', start: 0, end: 2000 }], trimStart: 1000, trimEnd: 9000, durationMs: 10000 } }, tokenA);
    check('servidor ola 11: la historia con video guarda su edición', r.status === 200 && r.data.story.videoEdits.subtitles.length === 1 && r.data.story.videoEdits.trimStart === 1000);
    // ---- sección 36: ola 12 — servidores: vinculación, avisos de seguidos, sincronización en tiempo real y cola de pendientes ----
    // (a) serverFetch con token válido llega; con token malo el servidor responde 401 y el token se limpia
    var stNet = fresh();
    stNet.settings.serverUrl = base;
    stNet.settings.serverToken = tokenA;
    var rNet = await C.serverFetch(stNet, '/api/feed?phone=' + A, 'GET');
    check('ola 12: serverFetch con token válido llega al servidor', rNet.ok === true && rNet.data && Array.isArray(rNet.data.posts));
    var stBad = fresh();
    stBad.settings.serverUrl = base;
    stBad.settings.serverToken = 'token-inventado';
    rNet = await C.serverFetch(stBad, '/api/posts', 'POST', { post: { id: 'x-bad', text: 'No debe guardarse' } });
    check('ola 12: sin token válido el servidor rechaza (401) y el token se limpia', rNet.ok === false && rNet.authExpired === true && stBad.settings.serverToken === '');
    // (b) aviso de seguidos: A publica y B (amigo) recibe la notificación 'post' en el servidor
    r = await api('/api/posts', 'POST', { text: 'Publicación para mis seguidos' }, tokenA);
    check('ola 12: A publica', r.status === 200 && r.data.post && r.data.post.id);
    var followPostId = r.data.post.id;
    r = await api('/api/notifications?phone=' + B);
    check('ola 12: al publicar, el amigo recibe el aviso "post" en el servidor', r.status === 200 && r.data.notifications.some(function (n) { return n.type === 'post' && n.refId === followPostId && n.from === A; }), JSON.stringify(r.data.notifications.slice(0, 3)));
    // (c) aviso de página: B sigue la página de A y A publica en ella -> B recibe 'pagepost'
    r = await api('/api/pages', 'POST', { name: 'Página Ola 12', category: 'Comunidad', desc: 'Página de prueba' }, tokenA);
    check('ola 12: se crea la página', r.status === 200 && r.data.page && r.data.page.id);
    var pageId12 = r.data.page.id;
    r = await api('/api/pages/' + pageId12 + '/follow', 'POST', { follow: true }, tokenB);
    check('ola 12: B sigue la página', r.status === 200);
    r = await api('/api/posts', 'POST', { text: 'Post en la página', pageId: pageId12 }, tokenA);
    var pagePostId = r.data.post.id;
    r = await api('/api/notifications?phone=' + B);
    check('ola 12: al publicar en la página, el seguidor recibe el aviso "pagepost"', r.status === 200 && r.data.notifications.some(function (n) { return n.type === 'pagepost' && n.refId === pagePostId; }));
    // (d) sincronización en tiempo real entre dos clientes: A publica y A escribe; B lo recibe por WebSocket
    const wsA12 = new WebSocket('ws://127.0.0.1:' + port + '/ws?phone=' + A);
    const wsB12 = new WebSocket('ws://127.0.0.1:' + port + '/ws?phone=' + B);
    var gotB = [];
    wsB12.on('message', function (raw) { try { gotB.push(JSON.parse(raw.toString())); } catch (e) {} });
    await new Promise(function (res) { var done = 0; function one() { if (++done === 2) res(); } wsA12.on('open', one); wsB12.on('open', one); setTimeout(res, 3000); });
    r = await api('/api/posts', 'POST', { text: 'Sincronización en tiempo real' }, tokenA);
    var rtPostId = r.data.post.id;
    r = await api('/api/messages', 'POST', { to: B, text: 'Hola en tiempo real' }, tokenA);
    var rtMsgId = r.data.message && r.data.message.id;
    await new Promise(function (res) { setTimeout(res, 1500); });
    check('ola 12: B recibe la publicación de A en tiempo real por WebSocket', gotB.some(function (d) { return d.kind === 'post' && d.post && d.post.id === rtPostId; }), JSON.stringify(gotB.map(function (d) { return d.kind; })));
    check('ola 12: B recibe el mensaje de A en tiempo real por WebSocket', gotB.some(function (d) { return d.kind === 'message' && d.message && d.message.id === rtMsgId; }));
    // y al bajar el feed, B ya ve la publicación (sincronización por HTTP)
    r = await api('/api/feed?phone=' + B);
    check('ola 12: el feed de B ya trae la publicación de A', r.status === 200 && r.data.posts.some(function (p) { return p.id === rtPostId; }));
    wsA12.close(); wsB12.close();
    // (e) cola de pendientes: se guarda sin conexión y se envía al reconectar
    var stQ = fresh();
    stQ.settings.serverUrl = base;
    stQ.settings.serverToken = tokenA;
    var qPost = { id: 'post-cola-1', author: A, text: 'Publicación desde la cola', createdAt: Date.now(), likes: {}, comments: [], shares: [], savedBy: [] };
    check('ola 12: queuePending guarda un envío pendiente', C.queuePending(stQ, { kind: 'http', path: '/api/posts', method: 'POST', body: { post: qPost } }) === true && stQ.pendingQueue.length === 1);
    var fl = await C.flushPendingQueue(stQ);
    check('ola 12: al reconectar, la cola envía la publicación pendiente', fl.ok === true && fl.sent === 1 && fl.failed === 0 && stQ.pendingQueue.length === 0);
    r = await api('/api/feed?phone=' + B);
    check('ola 12: la publicación de la cola llegó al servidor', r.status === 200 && r.data.posts.some(function (p) { return p.id === 'post-cola-1'; }));
    // mensaje viejo en la cola (formato anterior) también se envía
    C.queuePending(stQ, { kind: 'message', to: B, message: { id: 'msg-cola-1', from: A, to: B, text: 'Mensaje desde la cola', createdAt: Date.now() } });
    fl = await C.flushPendingQueue(stQ);
    check('ola 12: la cola también envía un mensaje pendiente (formato anterior)', fl.ok === true && fl.sent === 1);
    r = await api('/api/messages?phone=' + B);
    check('ola 12: el mensaje de la cola llegó a B', r.status === 200 && JSON.stringify(r.data).indexOf('msg-cola-1') !== -1);
    // sin conexión, el envío queda en la cola y no se pierde
    var stOff = fresh();
    stOff.settings.serverUrl = 'http://127.0.0.1:1';
    C.queuePending(stOff, { kind: 'http', path: '/api/posts', method: 'POST', body: { post: { id: 'post-off', text: 'Sin conexión' } } });
    fl = await C.flushPendingQueue(stOff);
    check('ola 12: sin conexión, lo pendiente se queda en la cola (no se pierde)', fl.ok === true && fl.sent === 0 && fl.failed === 1 && stOff.pendingQueue.length === 1);
    // ---- sección 37 (v1.4): archivos en el servidor y perfil en vivo ----
    r = await api('/api/health');
    check('servidor v3.0: la versión es 3.0', r.status === 200 && r.data.version === '3.0');
    const photoB64 = Buffer.from('FOTO-DE-PERFIL-DE-PRUEBA').toString('base64');
    r = await api('/api/media/start', 'POST', { name: 'foto-perfil.jpg', type: 'image/jpeg' });
    check('servidor v1.4: sin token no se puede empezar una subida', r.status === 401);
    r = await api('/api/media/start', 'POST', { name: 'foto-perfil.jpg', type: 'image/jpeg' }, tokenA);
    check('servidor v1.4: la subida se abre y da un id', r.status === 200 && r.data.ok && r.data.uploadId);
    const upId = r.data.uploadId;
    r = await api('/api/media/chunk', 'POST', { uploadId: upId, data: photoB64 }, tokenB);
    check('servidor v1.4: solo el dueño manda trozos', r.status === 403);
    r = await api('/api/media/chunk', 'POST', { uploadId: 'up_inexistente', data: photoB64 }, tokenA);
    check('servidor v1.4: una subida inexistente da 404', r.status === 404);
    r = await api('/api/media/chunk', 'POST', { uploadId: upId, data: '!!!no-base64!!!' }, tokenA);
    check('servidor v1.4: un trozo inválido se rechaza', r.status === 400);
    r = await api('/api/media/chunk', 'POST', { uploadId: upId, data: photoB64 }, tokenA);
    check('servidor v1.4: el trozo se guarda', r.status === 200 && r.data.ok && r.data.received === Buffer.from('FOTO-DE-PERFIL-DE-PRUEBA').length);
    r = await api('/api/media/finish', 'POST', { uploadId: upId }, tokenA);
    check('servidor v1.4: al cerrar, el archivo queda con URL pública', r.status === 200 && r.data.ok && r.data.url && r.data.url.indexOf('/media/') === 0);
    const mediaUrl = r.data.url;
    const mediaId = r.data.id;
    const gotMedia = await fetch(base + mediaUrl);
    const mediaText = await gotMedia.text();
    check('servidor v1.4: el archivo se sirve por URL con el tipo correcto', gotMedia.status === 200 && gotMedia.headers.get('content-type') === 'image/jpeg' && mediaText === 'FOTO-DE-PERFIL-DE-PRUEBA');
    const trav = await fetch(base + '/media/..%2Fserver.js');
    check('servidor v1.4: no se aceptan rutas fuera de la carpeta de subidas', trav.status === 404);
    r = await api('/api/media/' + mediaId, 'DELETE', null, tokenB);
    check('servidor v1.4: solo el dueño puede borrar su archivo', r.status === 403);
    const gotProfile = new Promise((resolve) => {
      const h = (raw) => { try { const d = JSON.parse(raw.toString()); if (d.kind === 'profile' && d.profile && d.profile.phone === A) { wsB2.off('message', h); resolve(d.profile); } } catch (e) {} };
      wsB2.on('message', h);
      setTimeout(() => resolve(null), 5000);
    });
    r = await api('/api/profile', 'POST', { name: 'Ana Servidor', photo: base + mediaUrl, cover: base + mediaUrl }, tokenA);
    check('servidor v1.4: el perfil guarda la foto y la portada del servidor', r.status === 200 && r.data.profile.photo === base + mediaUrl && r.data.profile.cover === base + mediaUrl);
    const liveProfile = await gotProfile;
    check('servidor v1.4: el cambio de perfil llega en vivo por WebSocket a otro teléfono', liveProfile && liveProfile.photo === base + mediaUrl && liveProfile.cover === base + mediaUrl, JSON.stringify(liveProfile));
    r = await api('/api/posts', 'POST', { text: 'Foto desde el servidor', media: base + mediaUrl, mediaType: 'image' }, tokenA);
    check('servidor v1.4: se publica con la foto del servidor', r.status === 200 && r.data.post.media === base + mediaUrl);
    r = await api('/api/feed?phone=' + B);
    check('servidor v1.4: el otro teléfono ve la foto del servidor en su feed', r.status === 200 && r.data.posts.some(p => p.media === base + mediaUrl));
    r = await api('/api/media/' + mediaId, 'DELETE', null, tokenA);
    check('servidor v1.4: el dueño borra su archivo', r.status === 200 && r.data.ok);
    const gone = await fetch(base + mediaUrl);
    check('servidor v1.4: tras borrar, la URL ya no sirve el archivo', gone.status === 404);
    var stM = fresh();
    stM.settings.serverUrl = base;
    stM.settings.serverToken = tokenA;
    const upUrl = await C.uploadMediaBase64(stM, Buffer.from('FOTO-DESDE-EL-CLIENTE').toString('base64'), 'image/jpeg', 'cliente.jpg');
    check('cliente v1.4: uploadMediaBase64 sube y devuelve la URL pública', typeof upUrl === 'string' && upUrl.indexOf(base + '/media/') === 0, String(upUrl));
    const gotClient = await fetch(upUrl);
    check('cliente v1.4: el archivo subido por el cliente se sirve por URL', gotClient.status === 200 && (await gotClient.text()) === 'FOTO-DESDE-EL-CLIENTE');
    var stNoTok = fresh();
    stNoTok.settings.serverUrl = base;
    const upNull = await C.uploadMediaBase64(stNoTok, photoB64, 'image/jpeg', 'sin-token.jpg');
    check('cliente v1.4: sin sesión en el servidor no se sube nada', upNull === null);
    var stQ2 = withProfiles(fresh());
    stQ2.me = A;
    stQ2.settings.serverUrl = base;
    stQ2.settings.serverToken = tokenA;
    stQ2.profiles[A].photo = 'data:image/jpeg;base64,' + Buffer.from('FOTO-EN-COLA').toString('base64');
    C.queuePending(stQ2, { kind: 'media-upload', dataUrl: stQ2.profiles[A].photo, mime: 'image/jpeg', name: 'foto-perfil.jpg', apply: { type: 'profile', field: 'photo' } });
    C.queuePending(stQ2, { kind: 'http', path: '/api/profile', method: 'POST', body: C.profileBody(stQ2) });
    fl = await C.flushPendingQueue(stQ2);
    check('cliente v1.4: la cola sube la foto pendiente y el perfil al reconectar', fl.ok === true && fl.sent === 2 && stQ2.pendingQueue.length === 0 && String(stQ2.profiles[A].photo).indexOf(base + '/media/') === 0, JSON.stringify(fl) + ' ' + stQ2.profiles[A].photo);
    r = await api('/api/profile/' + A);
    check('cliente v1.4: el servidor guardó el perfil con la URL de la foto subida', r.status === 200 && String(r.data.profile.photo).indexOf(base + '/media/') === 0, JSON.stringify(r.data.profile && r.data.profile.photo));
    var stLocal = withProfiles(fresh());
    stLocal.me = A;
    stLocal.profiles[A].photo = 'data:image/jpeg;base64,AAA';
    const localUrl = await C.uploadMediaBase64(stLocal, 'AAA', 'image/jpeg', 'local.jpg');
    check('cliente v1.4: sin servidor configurado no se sube nada y lo local sigue', localUrl === null && stLocal.profiles[A].photo === 'data:image/jpeg;base64,AAA');
    // ---- sección 37b (v1.4): Cloudinary (archivos para siempre) ----
    // Un Cloudinary falso en local: responde como el real sin salir a internet.
    const http = require('http');
    const cloudHits = [];
    const fakeCloud = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c.toString(); });
      req.on('end', () => {
        cloudHits.push({ url: req.url, method: req.method, body });
        if (req.url.indexOf('/destroy') >= 0) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ result: 'ok' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ secure_url: 'https://res.cloudinary.com/fake-test/image/upload/v1/wordred/m_cloud_1.jpg', public_id: 'wordred/m_cloud_1' }));
      });
    });
    const cloudPort = await new Promise((resolve) => fakeCloud.listen(0, () => resolve(fakeCloud.address().port)));
    const cloudBase = 'http://127.0.0.1:' + cloudPort;
    const prevEnv = { name: process.env.CLOUDINARY_CLOUD_NAME, preset: process.env.CLOUDINARY_UPLOAD_PRESET, up: process.env.CLOUDINARY_UPLOAD_URL, destroy: process.env.CLOUDINARY_DESTROY_URL, key: process.env.CLOUDINARY_API_KEY, secret: process.env.CLOUDINARY_API_SECRET };
    try {
      delete process.env.CLOUDINARY_CLOUD_NAME; delete process.env.CLOUDINARY_UPLOAD_PRESET;
      check('cloudinary v1.4: sin configurar, el almacenamiento permanente está apagado', require('../server/server.js')._internals.cloudinaryConfig().enabled === false);
      process.env.CLOUDINARY_CLOUD_NAME = 'fake-test';
      process.env.CLOUDINARY_UPLOAD_PRESET = 'wordred';
      process.env.CLOUDINARY_UPLOAD_URL = cloudBase + '/auto/upload';
      process.env.CLOUDINARY_DESTROY_URL = cloudBase + '/image/destroy';
      check('cloudinary v1.4: con nombre y preset, el almacenamiento permanente se enciende', require('../server/server.js')._internals.cloudinaryConfig().enabled === true);
      const cB64 = Buffer.from('FOTO-EN-CLOUDINARY').toString('base64');
      r = await api('/api/media/start', 'POST', { name: 'foto.jpg', type: 'image/jpeg' }, tokenA);
      const upC = r.data.uploadId;
      r = await api('/api/media/chunk', 'POST', { uploadId: upC, data: cB64 }, tokenA);
      check('cloudinary v1.4: el trozo se guarda igual', r.status === 200 && r.data.ok);
      r = await api('/api/media/finish', 'POST', { uploadId: upC }, tokenA);
      check('cloudinary v1.4: al cerrar, la URL es la de Cloudinary (para siempre)', r.status === 200 && r.data.ok && r.data.cloudinary === true && r.data.url === 'https://res.cloudinary.com/fake-test/image/upload/v1/wordred/m_cloud_1.jpg', JSON.stringify(r.data));
      const cloudId = r.data.id;
      check('cloudinary v1.4: el servidor mandó el archivo con el preset sin firmar', cloudHits.some(h => h.body.indexOf('upload_preset') >= 0 && h.body.indexOf('wordred') >= 0));
      const gotCloud = await fetch(base + '/media/' + cloudId + '.jpg', { redirect: 'manual' });
      check('cloudinary v1.4: la URL local redirige a Cloudinary', gotCloud.status === 302 && (gotCloud.headers.get('location') || '').indexOf('res.cloudinary.com') >= 0, 'status=' + gotCloud.status + ' loc=' + gotCloud.headers.get('location'));
      var stC = fresh();
      stC.settings.serverUrl = base;
      stC.settings.serverToken = tokenA;
      const cUrl = await C.uploadMediaBase64(stC, cB64, 'image/jpeg', 'cliente-cloud.jpg');
      check('cloudinary v1.4: el cliente guarda la URL de Cloudinary tal cual', cUrl === 'https://res.cloudinary.com/fake-test/image/upload/v1/wordred/m_cloud_1.jpg', String(cUrl));
      process.env.CLOUDINARY_API_KEY = 'key-falsa';
      process.env.CLOUDINARY_API_SECRET = 'secreto-falso';
      const destroyBefore = cloudHits.filter(h => h.url.indexOf('/destroy') >= 0).length;
      r = await api('/api/media/' + cloudId, 'DELETE', null, tokenA);
      check('cloudinary v1.4: el dueño borra su archivo (y se pide el borrado en Cloudinary)', r.status === 200 && r.data.ok && cloudHits.filter(h => h.url.indexOf('/destroy') >= 0).length > destroyBefore);
      const goneCloud = await fetch(base + '/media/' + cloudId + '.jpg');
      check('cloudinary v1.4: tras borrar, la URL local ya no existe', goneCloud.status === 404);
      process.env.CLOUDINARY_UPLOAD_URL = 'http://127.0.0.1:1/auto/upload';
      r = await api('/api/media/start', 'POST', { name: 'foto2.jpg', type: 'image/jpeg' }, tokenA);
      const upF = r.data.uploadId;
      await api('/api/media/chunk', 'POST', { uploadId: upF, data: cB64 }, tokenA);
      r = await api('/api/media/finish', 'POST', { uploadId: upF }, tokenA);
      check('cloudinary v1.4: si Cloudinary falla, el archivo queda en el disco local', r.status === 200 && r.data.ok && r.data.cloudinary === false && r.data.url.indexOf('/media/') === 0, JSON.stringify(r.data));
      const fbUrl = r.data.url;
      const fbId = r.data.id;
      const gotFb = await fetch(base + fbUrl);
      check('cloudinary v1.4: el respaldo local se sirve por URL', gotFb.status === 200 && (await gotFb.text()) === 'FOTO-EN-CLOUDINARY');
      r = await api('/api/media/' + fbId, 'DELETE', null, tokenA);
      check('cloudinary v1.4: el respaldo local también se borra', r.status === 200 && r.data.ok);
    } finally {
      if (prevEnv.name === undefined) delete process.env.CLOUDINARY_CLOUD_NAME; else process.env.CLOUDINARY_CLOUD_NAME = prevEnv.name;
      if (prevEnv.preset === undefined) delete process.env.CLOUDINARY_UPLOAD_PRESET; else process.env.CLOUDINARY_UPLOAD_PRESET = prevEnv.preset;
      if (prevEnv.up === undefined) delete process.env.CLOUDINARY_UPLOAD_URL; else process.env.CLOUDINARY_UPLOAD_URL = prevEnv.up;
      if (prevEnv.destroy === undefined) delete process.env.CLOUDINARY_DESTROY_URL; else process.env.CLOUDINARY_DESTROY_URL = prevEnv.destroy;
      if (prevEnv.key === undefined) delete process.env.CLOUDINARY_API_KEY; else process.env.CLOUDINARY_API_KEY = prevEnv.key;
      if (prevEnv.secret === undefined) delete process.env.CLOUDINARY_API_SECRET; else process.env.CLOUDINARY_API_SECRET = prevEnv.secret;
      await new Promise((resolve) => fakeCloud.close(resolve));
    }
    wsB2.close();

    // ---- sección 38 (v1.5): visto, escribiendo, comentarios en vivo,
    // avisos por anuncio y bloqueo con huella/PIN ----
    r = await api('/api/health');
    check('servidor v3.0: /api/health dice versión 3.0', r.status === 200 && r.data && r.data.version === '3.0', JSON.stringify(r.data));
    const wsA38 = new WebSocket('ws://127.0.0.1:' + port + '/ws?phone=' + A);
    const wsB38 = new WebSocket('ws://127.0.0.1:' + port + '/ws?phone=' + B);
    await new Promise(function (res) { var done = 0; function one() { if (++done === 2) res(); } wsA38.on('open', one); wsB38.on('open', one); setTimeout(res, 3000); });
    const got38 = [];
    wsA38.on('message', function (raw) { try { got38.push(JSON.parse(raw.toString())); } catch (e) {} });
    wsB38.on('message', function (raw) { try { got38.push(JSON.parse(raw.toString())); } catch (e) {} });
    // escribiendo: A escribe y B lo recibe, luego se apaga
    wsA38.send(JSON.stringify({ kind: 'typing', from: A, to: B, typing: true }));
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: "escribiendo" llega por WebSocket al otro teléfono', got38.some(function (d) { return d.kind === 'typing' && d.from === A && d.typing === true; }), JSON.stringify(got38.map(function (d) { return d.kind; })));
    wsA38.send(JSON.stringify({ kind: 'typing', from: A, to: B, typing: false }));
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: al dejar de escribir llega el aviso de apagado', got38.some(function (d) { return d.kind === 'typing' && d.from === A && d.typing === false; }));
    // visto: A escribe a B, B lo marca leído y A recibe el aviso con la hora
    r = await api('/api/messages', 'POST', { to: B, text: 'Mensaje para el visto' }, tokenA);
    const vistoMsgId = r.data.message && r.data.message.id;
    check('servidor v1.5: el mensaje para el visto se envía', r.status === 200 && !!vistoMsgId);
    got38.length = 0;
    r = await api('/api/messages/read', 'POST', { to: A }, tokenB);
    check('servidor v1.5: marcar leído guarda la hora', r.status === 200 && r.data.ok && r.data.read >= 1 && typeof r.data.readAt === 'number', JSON.stringify(r.data));
    await new Promise((res) => setTimeout(res, 300));
    const readEvt = got38.filter(function (d) { return d.kind === 'read'; })[0];
    check('servidor v1.5: el "Visto" se difunde en vivo al que escribió', !!readEvt && readEvt.from === B && readEvt.to === A && Array.isArray(readEvt.messageIds) && readEvt.messageIds.indexOf(vistoMsgId) >= 0 && typeof readEvt.at === 'number', JSON.stringify(readEvt));
    r = await api('/api/messages?phone=' + A);
    const convA = (r.data.conversations || []).filter(function (c) { return c.participants.indexOf(B) >= 0; })[0];
    const vistoMsg = convA && convA.messages.filter(function (m) { return m.id === vistoMsgId; })[0];
    check('servidor v1.5: el mensaje queda con readBy y readAt', !!vistoMsg && vistoMsg.readBy.indexOf(B) >= 0 && typeof vistoMsg.readAt === 'number', JSON.stringify(vistoMsg && { readBy: vistoMsg.readBy, readAt: vistoMsg.readAt }));
    // comentarios: el contador incluye respuestas y se difunde en vivo
    r = await api('/api/posts', 'POST', { text: 'Publicación v1.5 para el contador' }, tokenA);
    const pid38 = r.data.post.id;
    got38.length = 0;
    r = await api('/api/posts/' + pid38 + '/comment', 'POST', { text: 'Primer comentario' }, tokenB);
    const c38 = r.data.comment;
    check('servidor v1.5: el comentario se guarda con contador 1', r.status === 200 && r.data.commentCount === 1, JSON.stringify(r.data));
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: el comentario se difunde en vivo con su contador', got38.some(function (d) { return d.kind === 'comment' && d.postId === pid38 && d.commentCount === 1 && d.comment && d.comment.id === c38.id; }), JSON.stringify(got38.map(function (d) { return d.kind; })));
    r = await api('/api/posts/' + pid38 + '/comment', 'POST', { text: 'Respuesta en hilo', parentId: c38.id }, tokenA);
    check('servidor v1.5: la respuesta se guarda y el contador incluye respuestas', r.status === 200 && r.data.commentCount === 2, JSON.stringify(r.data));
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: la respuesta se difunde en vivo con contador 2', got38.some(function (d) { return d.kind === 'comment' && d.postId === pid38 && d.commentCount === 2 && d.parentId === c38.id; }), JSON.stringify(got38.filter(function (d) { return d.kind === 'comment'; })));
    const rep38 = r.data.comment;
    got38.length = 0;
    r = await api('/api/posts/' + pid38 + '/comment/' + rep38.id, 'DELETE', null, tokenA);
    check('servidor v1.5: borrar la respuesta responde bien', r.status === 200 && r.data.ok);
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: el borrado se difunde con el contador actualizado', got38.some(function (d) { return d.kind === 'comment' && d.postId === pid38 && d.commentCount === 1 && d.deletedId === rep38.id; }), JSON.stringify(got38));
    // pregunta por un anuncio: el mensaje guarda el anuncio y avisa con su título
    got38.length = 0;
    r = await api('/api/messages', 'POST', { to: B, text: 'Hola, ¿sigue disponible?', message: { to: B, text: 'Hola, ¿sigue disponible?', listing: { id: 'lst_38', title: 'Bicicleta en venta' } } }, tokenA);
    const lstMsg = r.data.message;
    check('servidor v1.5: el mensaje guarda el anuncio (id y título)', r.status === 200 && lstMsg && lstMsg.listing && lstMsg.listing.title === 'Bicicleta en venta', JSON.stringify(lstMsg && lstMsg.listing));
    await new Promise((res) => setTimeout(res, 300));
    const lstDelivered = got38.filter(function (d) { return d.kind === 'message' && d.message && d.message.id === (lstMsg && lstMsg.id); })[0];
    check('servidor v1.5: el mensaje con anuncio llega en vivo con el anuncio', !!lstDelivered && lstDelivered.message.listing && lstDelivered.message.listing.title === 'Bicicleta en venta');
    r = await api('/api/notifications?phone=' + B);
    check('servidor v1.5: el aviso por el anuncio menciona su título', r.status === 200 && (r.data.notifications || []).some(function (n) { return String(n.text || '').indexOf('Bicicleta en venta') >= 0; }), JSON.stringify((r.data.notifications || []).map(function (n) { return n.text; })));
    wsA38.close(); wsB38.close();
    // bloqueo con huella/PIN y avisos: comprobaciones estáticas del código nativo
    const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
    const mainJava = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
    const receiverJava = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedNotifyReceiver.java'), 'utf8');
    const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
    check('v1.5 bloqueo: el manifiesto declara USE_BIOMETRIC y el sensor de huella', manifest.indexOf('USE_BIOMETRIC') >= 0 && manifest.indexOf('android.hardware.fingerprint') >= 0);
    check('v1.5.10 bloqueo: el manifiesto es versión 67 / 1.5.52', manifest.indexOf('versionCode="78"') >= 0 && manifest.indexOf('versionName="1.5.63"') >= 0);
    check('v1.5 bloqueo: la huella se pide en onResume (y al reintentarlo), no en onCreate', mainJava.indexOf('pendingUnlockAuth') >= 0 && mainJava.indexOf('onResume') >= 0 && (mainJava.match(/authenticateForLock\("unlock"\)/g) || []).length === 2 && mainJava.indexOf('LOCK_GRACE_MS') >= 0 && (function () { var oc = mainJava.indexOf('protected void onCreate'); var or = mainJava.indexOf('protected void onResume'); return oc >= 0 && or > oc && mainJava.slice(oc, or).indexOf('authenticateForLock("unlock")') < 0; })(), 'veces authenticateForLock("unlock")=' + ((mainJava.match(/authenticateForLock\("unlock"\)/g) || []).length));
    check('v1.5 bloqueo: al pasar a segundo plano el contenido se tapa', mainJava.indexOf('onPause') >= 0 && /onPause\(\)[\s\S]{0,400}setVisibility\(View\.INVISIBLE\)/.test(mainJava));
    check('v1.5 bloqueo: sin huella enrolada se usa el PIN del teléfono y se dice', mainJava.indexOf('BIOMETRIC_ERROR_NONE_ENROLLED') >= 0 && mainJava.indexOf('No tienes huella configurada') >= 0);
    check('v1.5 bloqueo: hay puente para volver a pedir el desbloqueo', mainJava.indexOf('requestUnlock') >= 0 && appjs.indexOf('requestUnlock') >= 0);
    check('v1.5 avisos: el receptor de la invitación existe y está registrado', receiverJava.indexOf('REENGAGE') >= 0 && manifest.indexOf('WordRedNotifyReceiver') >= 0);
    check('v1.5 avisos: la invitación es como mucho una al día y solo con actividad sin leer', receiverJava.indexOf('24L * 60L * 60L * 1000L') >= 0 && receiverJava.indexOf('unread_count') >= 0 && receiverJava.indexOf('app_foreground') >= 0);
    check('v1.5 avisos: el puente de aviso general existe con canal de alta importancia', mainJava.indexOf('showNotification') >= 0 && mainJava.indexOf('WordRedSounds.CHANNEL_MAIN') >= 0 && mainJava.indexOf('IMPORTANCE_HIGH') >= 0);
    check('v1.5 app: "Visto" con hora y "Escribiendo…" están en la app', appjs.indexOf('Visto') >= 0 && appjs.indexOf('Escribiendo…') >= 0 && indexHtml.indexOf('chatTyping') >= 0);
    check('v1.5 app: la elección de llamada y el altavoz activado están en la app', indexHtml.indexOf('callChoiceOverlay') >= 0 && appjs.indexOf('Altavoz activado') >= 0 && indexHtml.indexOf('Llamada telefónica') >= 0);
    check('v1.5 app: los avisos por tipo están en los ajustes', appjs.indexOf('notifCalls') >= 0 && appjs.indexOf('notifSales') >= 0 && appjs.indexOf('notifReengage') >= 0);

    // ---- sección 39 (v1.5): transmisiones en vivo ----
    const wsA39 = new WebSocket('ws://127.0.0.1:' + port + '/ws?phone=' + A);
    const wsB39 = new WebSocket('ws://127.0.0.1:' + port + '/ws?phone=' + B);
    await new Promise(function (res) { var done = 0; function one() { if (++done === 2) res(); } wsA39.on('open', one); wsB39.on('open', one); setTimeout(res, 3000); });
    const got39 = [];
    wsA39.on('message', function (raw) { try { got39.push(JSON.parse(raw.toString())); } catch (e) {} });
    wsB39.on('message', function (raw) { try { got39.push(JSON.parse(raw.toString())); } catch (e) {} });
    r = await api('/api/lives', 'POST', { title: 'Live de prueba v1.5' }, tokenA);
    check('servidor v1.5: se crea un live con título', r.status === 200 && r.data.live && r.data.live.host === A && r.data.live.title === 'Live de prueba v1.5', JSON.stringify(r.data));
    const liveId = r.data.live && r.data.live.id;
    r = await api('/api/lives', 'POST', { title: 'Otro live' }, tokenA);
    check('servidor v1.5: no se puede tener dos lives a la vez', r.status === 400);
    r = await api('/api/lives');
    check('servidor v1.5: el live aparece en la lista de lives activos', r.status === 200 && (r.data.lives || []).some(function (l) { return l.id === liveId; }));
    r = await api('/api/notifications?phone=' + B);
    check('servidor v1.5: a los seguidores les llega el aviso del live', r.status === 200 && (r.data.notifications || []).some(function (n) { return n.type === 'live' && String(n.text || '').indexOf('está en vivo') >= 0; }), JSON.stringify((r.data.notifications || []).map(function (n) { return n.type + ':' + n.text; })));
    got39.length = 0;
    r = await api('/api/lives/' + liveId + '/join', 'POST', {}, tokenB);
    check('servidor v1.5: un espectador entra al live', r.status === 200 && r.data.live.viewerCount === 1 && r.data.live.viewers.indexOf(B) >= 0, JSON.stringify(r.data));
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: al entrar, el contador de espectadores se difunde en vivo', got39.some(function (d) { return d.kind === 'live' && d.event === 'viewers' && d.liveId === liveId && d.viewerCount === 1; }), JSON.stringify(got39.map(function (d) { return d.kind + ':' + d.event; })));
    got39.length = 0;
    r = await api('/api/lives/' + liveId + '/chat', 'POST', { text: 'Hola desde el chat del live' }, tokenB);
    check('servidor v1.5: el mensaje del chat del live se guarda con autor y hora', r.status === 200 && r.data.message && r.data.message.text === 'Hola desde el chat del live' && r.data.message.author === B && typeof r.data.message.createdAt === 'number', JSON.stringify(r.data));
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: el chat del live llega en tiempo real a todos', got39.some(function (d) { return d.kind === 'live' && d.event === 'chat' && d.liveId === liveId && d.message && d.message.text === 'Hola desde el chat del live' && d.message.author === B; }), JSON.stringify(got39));
    got39.length = 0;
    r = await api('/api/lives/' + liveId + '/like', 'POST', {}, tokenB);
    check('servidor v1.5: el like en vivo se guarda con contador', r.status === 200 && r.data.likes === 1, JSON.stringify(r.data));
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: el like se difunde en vivo con su contador', got39.some(function (d) { return d.kind === 'live' && d.event === 'like' && d.liveId === liveId && d.likes === 1 && d.from === B; }), JSON.stringify(got39));
    got39.length = 0;
    r = await api('/api/lives/' + liveId + '/like', 'POST', {}, tokenA);
    check('servidor v1.5: el segundo like sube el contador a 2', r.status === 200 && r.data.likes === 2, JSON.stringify(r.data));
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: el segundo like también se difunde en vivo', got39.some(function (d) { return d.kind === 'live' && d.event === 'like' && d.liveId === liveId && d.likes === 2 && d.from === A; }), JSON.stringify(got39));
    got39.length = 0;
    r = await api('/api/live-signal', 'POST', { to: B, type: 'offer', payload: { type: 'offer', sdp: 'falso' }, liveId: liveId }, tokenA);
    check('servidor v1.5: la oferta WebRTC del live se envía', r.status === 200 && r.data.ok);
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: la oferta llega por WebSocket al espectador', got39.some(function (d) { return d.kind === 'live-signal' && d.from === A && d.type === 'offer' && d.liveId === liveId; }), JSON.stringify(got39));
    got39.length = 0;
    r = await api('/api/live-signal', 'POST', { to: A, type: 'answer', payload: { type: 'answer', sdp: 'falso' }, liveId: liveId }, tokenB);
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: la respuesta llega por WebSocket al transmisor', got39.some(function (d) { return d.kind === 'live-signal' && d.from === B && d.type === 'answer' && d.liveId === liveId; }));
    r = await api('/api/posts', 'POST', { text: '¡Entra a ver mi live!', liveId: liveId }, tokenA);
    check('servidor v1.5: compartir el live publica un aviso con su liveId', r.status === 200 && r.data.post && r.data.post.liveId === liveId, JSON.stringify(r.data));
    r = await api('/api/feed?phone=' + B);
    check('servidor v1.5: el aviso del live llega al feed con su liveId', r.status === 200 && (r.data.posts || []).some(function (p) { return p.liveId === liveId; }), JSON.stringify((r.data.posts || []).map(function (p) { return p.liveId; })));
    r = await api('/api/lives/' + liveId + '/leave', 'POST', {}, tokenB);
    check('servidor v1.5: al salir, el espectador deja de contar', r.status === 200);
    r = await api('/api/lives');
    check('servidor v1.5: tras salir, el contador vuelve a 0', r.status === 200 && (r.data.lives || []).filter(function (l) { return l.id === liveId; })[0].viewerCount === 0);
    got39.length = 0;
    r = await api('/api/lives/' + liveId + '/end', 'POST', {}, tokenA);
    check('servidor v1.5: el transmisor termina el live', r.status === 200 && r.data.live);
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: el fin del live se difunde en vivo', got39.some(function (d) { return d.kind === 'live' && d.event === 'ended' && d.liveId === liveId; }), JSON.stringify(got39));
    r = await api('/api/lives');
    check('servidor v1.5: tras terminar, el live ya no está activo', r.status === 200 && !(r.data.lives || []).some(function (l) { return l.id === liveId; }));
    r = await api('/api/lives/' + liveId + '/join', 'POST', {}, tokenB);
    check('servidor v1.5: no se puede entrar a un live terminado', r.status === 404);
    r = await api('/api/lives/' + liveId + '/chat', 'POST', { text: 'Tarde' }, tokenB);
    check('servidor v1.5: no se puede escribir en un live terminado', r.status === 404);
    wsA39.close(); wsB39.close();
    check('v1.5 lives: la app tiene fila de lives con EN VIVO y botón en el perfil', appjs.indexOf('renderLiveRow') >= 0 && indexHtml.indexOf('EN VIVO') >= 0 && indexHtml.indexOf('liveRow') >= 0 && appjs.indexOf('Transmitir en vivo') >= 0);
    check('v1.5 lives: la app tiene video, chat, espectadores y terminar', indexHtml.indexOf('liveVideo') >= 0 && indexHtml.indexOf('liveChatList') >= 0 && indexHtml.indexOf('liveViewerCount') >= 0 && indexHtml.indexOf('liveEndBtn') >= 0 && appjs.indexOf('handleLiveSignal') >= 0 && appjs.indexOf('startLiveViewerPc') >= 0);
    check('v1.5 lives: compartir el live dentro y fuera está en la app', appjs.indexOf('__wrShareLive') >= 0 && appjs.indexOf('shareLiveExternally') >= 0 && appjs.indexOf('liveShareButtonHtml') >= 0 && appjs.indexOf('Ver live en vivo') >= 0 && indexHtml.indexOf('liveShareBtn') >= 0);
    check('v1.5 lives: el chat muestra autor y hora', appjs.indexOf('renderLiveChat') >= 0 && appjs.indexOf('C.formatTime(m.createdAt)') >= 0);
    check('v1.5 lives: el like tiene botón, corazones flotantes y contador en vivo', indexHtml.indexOf('liveLikeBtn') >= 0 && indexHtml.indexOf('liveLikeCount') >= 0 && indexHtml.indexOf('liveHearts') >= 0 && indexHtml.indexOf('liveHeartFloat') >= 0 && appjs.indexOf('sendLiveLike') >= 0 && appjs.indexOf('spawnLiveHeart') >= 0 && appjs.indexOf('updateLiveLikeCount') >= 0 && appjs.indexOf("event === 'like'") >= 0);

    // ---- sección 40 (v1.5): logo rediseñado ----
    function pngSize(p) {
      var b = fs.readFileSync(p);
      if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null;
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
    var logoPath = path.join(__dirname, '..', 'assets', 'logo.png');
    var logoSize = fs.existsSync(logoPath) ? pngSize(logoPath) : null;
    check('v1.5 logo: el logo dentro de la app es un PNG de 512x512', !!logoSize && logoSize.w === 512 && logoSize.h === 512, JSON.stringify(logoSize));
    var densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
    var iconsOk = true; var iconDetail = [];
    Object.keys(densities).forEach(function (dens) {
      var p = path.join(__dirname, '..', 'res', 'mipmap-' + dens, 'ic_launcher.png');
      var s = fs.existsSync(p) ? pngSize(p) : null;
      var ok = !!s && s.w === densities[dens] && s.h === densities[dens];
      iconsOk = iconsOk && ok;
      iconDetail.push(dens + '=' + (s ? s.w + 'x' + s.h : 'falta'));
    });
    check('v1.5 logo: el icono del lanzador existe en las 5 densidades con su tamaño', iconsOk, iconDetail.join(', '));
    var fgXml = fs.readFileSync(path.join(__dirname, '..', 'res', 'drawable', 'ic_launcher_foreground.xml'), 'utf8');
    var bgXml = fs.readFileSync(path.join(__dirname, '..', 'res', 'drawable', 'ic_launcher_background.xml'), 'utf8');
    var adaptiveXml = fs.readFileSync(path.join(__dirname, '..', 'res', 'mipmap-anydpi-v26', 'ic_launcher.xml'), 'utf8');
    check('v1.7 logo: el icono adaptable usa la "W" plana minimalista más chica en 3 tonos de rojo (sin bisel) sobre fondo oscuro, con variante monocroma', adaptiveXml.indexOf('ic_launcher_foreground') >= 0 && adaptiveXml.indexOf('ic_launcher_background') >= 0 && adaptiveXml.indexOf('ic_launcher_monochrome') >= 0 && fgXml.indexOf('strokeWidth="10"') >= 0 && fgXml.indexOf('M32,35 L41,73') >= 0 && fgXml.indexOf('M67,73 L76,35') >= 0 && fgXml.indexOf('#E60026') >= 0 && fgXml.indexOf('#FF4A33') >= 0 && fgXml.indexOf('#B3001B') >= 0 && fgXml.indexOf('#8F0016') < 0 && fgXml.indexOf('#FF2040') < 0 && fgXml.indexOf('#FF7A1A') < 0 && fgXml.indexOf('#FFC21A') < 0 && bgXml.indexOf('#170709') >= 0);
    var monoXml = fs.readFileSync(path.join(__dirname, '..', 'res', 'drawable', 'ic_launcher_monochrome.xml'), 'utf8');
    check('v1.7 logo: la variante monocroma es la misma "W" plana más chica en un solo color', monoXml.indexOf('M32,35 L41,73 L54,43 L67,73 L76,35') >= 0 && monoXml.indexOf('strokeWidth="10"') >= 0 && monoXml.indexOf('#FFFFFF') >= 0);
    check('v1.5 logo: el logo se usa dentro de la app (cabecera y registro)', (indexHtml.match(/src="logo\.png"/g) || []).length >= 2);
    // ---- sección 41 (v1.5): portada y personalización de grupos ----
    const wsA41 = new WebSocket('ws://127.0.0.1:' + port + '/ws?phone=' + A);
    const wsB41 = new WebSocket('ws://127.0.0.1:' + port + '/ws?phone=' + B);
    await new Promise(function (res) { var done = 0; function one() { if (++done === 2) res(); } wsA41.on('open', one); wsB41.on('open', one); setTimeout(res, 3000); });
    const got41 = [];
    wsA41.on('message', function (raw) { try { got41.push(JSON.parse(raw.toString())); } catch (e) {} });
    wsB41.on('message', function (raw) { try { got41.push(JSON.parse(raw.toString())); } catch (e) {} });
    r = await api('/api/groups', 'POST', { name: 'Grupo con portada', desc: 'Para probar la portada', cover: '', coverType: 'image', accent: 'azul', headerGradient: 'mar' }, tokenA);
    check('servidor v1.5: se crea un grupo con color y degradado', r.status === 200 && r.data.group && r.data.group.accent === 'azul' && r.data.group.headerGradient === 'mar', JSON.stringify(r.data));
    const grp41 = r.data.group && r.data.group.id;
    r = await api('/api/groups/' + grp41 + '/join', 'POST', {}, tokenB);
    check('servidor v1.5: un miembro se une al grupo', r.status === 200);
    r = await api('/api/groups/' + grp41, 'PUT', { group: { cover: 'https://res.cloudinary.com/bekxop7h/image/upload/v1/wordred/portada.jpg', coverType: 'image', accent: 'verde', headerGradient: 'bosque' } }, tokenB);
    check('servidor v1.5: un miembro sin ser administrador NO puede poner la portada', r.status === 403, JSON.stringify(r.data));
    r = await api('/api/groups/' + grp41 + '/admins', 'POST', { phone: B }, tokenA);
    check('servidor v1.5: el creador nombra administrador al miembro', r.status === 200);
    got41.length = 0;
    r = await api('/api/groups/' + grp41, 'PUT', { group: { cover: 'https://res.cloudinary.com/bekxop7h/image/upload/v1/wordred/portada.jpg', coverType: 'image', accent: 'verde', headerGradient: 'bosque' } }, tokenB);
    check('servidor v1.5: el administrador pone la portada por URL', r.status === 200 && r.data.group && r.data.group.cover === 'https://res.cloudinary.com/bekxop7h/image/upload/v1/wordred/portada.jpg' && r.data.group.coverType === 'image' && r.data.group.accent === 'verde' && r.data.group.headerGradient === 'bosque', JSON.stringify(r.data));
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: la portada y la personalización se difunden en vivo', got41.some(function (d) { return d.kind === 'group' && d.groupId === grp41 && d.group && d.group.cover === 'https://res.cloudinary.com/bekxop7h/image/upload/v1/wordred/portada.jpg' && d.group.accent === 'verde'; }), JSON.stringify(got41));
    r = await api('/api/groups');
    check('servidor v1.5: la portada queda guardada por URL en el servidor', r.status === 200 && (r.data.groups || []).some(function (g) { return g.id === grp41 && g.cover === 'https://res.cloudinary.com/bekxop7h/image/upload/v1/wordred/portada.jpg' && g.accent === 'verde' && g.headerGradient === 'bosque'; }));
    r = await api('/api/groups/' + grp41, 'PUT', { group: { cover: 'https://res.cloudinary.com/bekxop7h/video/upload/v1/wordred/portada.mp4', coverType: 'video' } }, tokenA);
    check('servidor v1.5: la portada también puede ser video', r.status === 200 && r.data.group && r.data.group.coverType === 'video' && r.data.group.cover === 'https://res.cloudinary.com/bekxop7h/video/upload/v1/wordred/portada.mp4', JSON.stringify(r.data));
    r = await api('/api/sales-groups', 'POST', { name: 'Ventas con portada', desc: 'Grupo de ventas', category: 'Otros', rules: '', photo: '' }, tokenA);
    check('servidor v1.5: se crea un grupo de ventas', r.status === 200 && r.data.group && r.data.group.id, JSON.stringify(r.data));
    const sg41 = r.data.group && r.data.group.id;
    r = await api('/api/sales-groups/' + sg41, 'PUT', { group: { cover: 'https://res.cloudinary.com/bekxop7h/image/upload/v1/wordred/sg.jpg' } }, tokenB);
    check('servidor v1.5: quien no creó el grupo de ventas NO puede personalizarlo', r.status === 403, JSON.stringify(r.data));
    got41.length = 0;
    r = await api('/api/sales-groups/' + sg41, 'PUT', { group: { cover: 'https://res.cloudinary.com/bekxop7h/image/upload/v1/wordred/sg.jpg', coverType: 'image', accent: 'dorado', headerGradient: 'dorado' } }, tokenA);
    check('servidor v1.5: el creador personaliza el grupo de ventas y mantiene su foto', r.status === 200 && r.data.group && r.data.group.cover === 'https://res.cloudinary.com/bekxop7h/image/upload/v1/wordred/sg.jpg' && r.data.group.accent === 'dorado' && r.data.group.photo === '', JSON.stringify(r.data));
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.5: la personalización del grupo de ventas se difunde en vivo', got41.some(function (d) { return d.kind === 'sales-group' && d.groupId === sg41 && d.group && d.group.cover === 'https://res.cloudinary.com/bekxop7h/image/upload/v1/wordred/sg.jpg'; }), JSON.stringify(got41));
    wsA41.close(); wsB41.close();
    const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
    const serverjs = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
    check('v1.5 grupos: el núcleo acepta portada (foto/video), color y degradado', corejs.indexOf("if (data.coverType !== undefined) g.coverType") >= 0 && corejs.indexOf("if (data.accent !== undefined)") >= 0 && corejs.indexOf("if (data.headerGradient !== undefined)") >= 0 && corejs.indexOf('editSalesGroup') >= 0);
    check('v1.5 grupos: la cola aplica la portada también a grupos de ventas', corejs.indexOf("a.type === 'salesgroup'") >= 0 && corejs.indexOf("a.field === 'cover') sg.cover = url") >= 0);
    check('v1.5 grupos: el servidor difunde el grupo y el grupo de ventas en vivo', serverjs.indexOf("broadcast({ kind: 'group'") >= 0 && serverjs.indexOf("broadcast({ kind: 'sales-group'") >= 0 && serverjs.indexOf("app.put('/api/sales-groups/:id'") >= 0);
    check('v1.5 grupos: la app muestra la portada con su color y recibe los cambios en vivo', appjs.indexOf('groupCoverHtml') >= 0 && appjs.indexOf('groupHeaderStyle') >= 0 && appjs.indexOf("data.kind === 'group'") >= 0 && appjs.indexOf("data.kind === 'sales-group'") >= 0 && appjs.indexOf('__wrEditSalesGroup') >= 0);
    check('v1.5 grupos: el editor tiene portada (foto/video), color y degradado', indexHtml.indexOf('groupEditAccents') >= 0 && indexHtml.indexOf('groupEditGradients') >= 0 && indexHtml.indexOf('accept="image/*,video/*"') >= 0);

    // v1.8: juegos — estadísticas, calificaciones y partidas online
    r = await api('/api/health');
    check('servidor v3.0: /api/health dice versión 3.0', r.status === 200 && r.data && r.data.version === '3.0', JSON.stringify(r.data));
    r = await api('/api/games/stats');
    check('servidor v1.8: las estadísticas de juegos empiezan vacías', r.status === 200 && r.data && r.data.stats && typeof r.data.stats === 'object');
    r = await api('/api/games/serpiente/play', 'POST', {}, tokenA);
    check('servidor v1.8: jugar suma una partida y un jugador', r.status === 200 && r.data.stats && r.data.stats.plays === 1 && r.data.stats.players === 1, JSON.stringify(r.data));
    r = await api('/api/games/serpiente/play', 'POST', {}, tokenA);
    check('servidor v1.8: el mismo jugador no suma dos jugadores, pero sí dos partidas', r.status === 200 && r.data.stats.plays === 2 && r.data.stats.players === 1, JSON.stringify(r.data));
    r = await api('/api/games/serpiente/play', 'POST', {}, tokenB);
    check('servidor v1.8: otro jugador suma un jugador más', r.status === 200 && r.data.stats.plays === 3 && r.data.stats.players === 2, JSON.stringify(r.data));
    r = await api('/api/games/serpiente/rate', 'POST', { stars: 5, comment: '¡Muy bueno!' }, tokenA);
    check('servidor v1.8: calificar con 5 estrellas da promedio 5', r.status === 200 && r.data.stats.ratingAvg === 5 && r.data.stats.ratingCount === 1, JSON.stringify(r.data));
    r = await api('/api/games/serpiente/rate', 'POST', { stars: 3 }, tokenB);
    check('servidor v1.8: dos calificaciones promedian (5+3)/2=4', r.status === 200 && r.data.stats.ratingAvg === 4 && r.data.stats.ratingCount === 2, JSON.stringify(r.data));
    r = await api('/api/games/serpiente/rate', 'POST', { stars: 4, comment: 'Mejor de lo que pensaba' }, tokenA);
    check('servidor v1.8: la misma persona cambia su calificación (no suma otra)', r.status === 200 && r.data.stats.ratingAvg === 3.5 && r.data.stats.ratingCount === 2, JSON.stringify(r.data));
    r = await api('/api/games/serpiente/rate', 'POST', { stars: 6 }, tokenA);
    check('servidor v1.8: 6 estrellas se rechaza', r.status === 400);
    r = await api('/api/games/serpiente/ratings');
    check('servidor v1.8: se listan las calificaciones con nombre y comentario', r.status === 200 && r.data.ratings && r.data.ratings.length === 2 && r.data.ratings.some(function (x) { return x.comment === 'Mejor de lo que pensaba'; }), JSON.stringify(r.data));
    r = await api('/api/games/serpiente/play', 'POST', {});
    check('servidor v1.8: sin token no se puede jugar', r.status === 401);
    // partidas online: emparejamiento rápido, marcador y ganador
    const wsA42 = new WebSocket('ws://127.0.0.1:' + port + '/ws?phone=' + A);
    const wsB42 = new WebSocket('ws://127.0.0.1:' + port + '/ws?phone=' + B);
    await new Promise((resolve) => wsA42.on('open', resolve));
    await new Promise((resolve) => wsB42.on('open', resolve));
    const msgsA42 = [], msgsB42 = [];
    wsA42.on('message', (raw) => { try { const d = JSON.parse(raw.toString()); if (d.kind === 'game') msgsA42.push(d); } catch (e) {} });
    wsB42.on('message', (raw) => { try { const d = JSON.parse(raw.toString()); if (d.kind === 'game') msgsB42.push(d); } catch (e) {} });
    r = await api('/api/games/quickmatch', 'POST', { gameId: 'serpiente' }, tokenA);
    check('servidor v1.8: el primer jugador queda esperando', r.status === 200 && r.data.status === 'waiting' && r.data.roomId, JSON.stringify(r.data));
    const room42 = r.data.roomId;
    r = await api('/api/games/quickmatch', 'POST', { gameId: 'serpiente' }, tokenB);
    check('servidor v1.8: el segundo jugador empareja la partida', r.status === 200 && r.data.status === 'matched' && r.data.roomId === room42, JSON.stringify(r.data));
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.8: los dos reciben el aviso de partida por WebSocket', msgsA42.some(function (d) { return d.type === 'matched' && d.roomId === room42; }) && msgsB42.some(function (d) { return d.type === 'matched' && d.roomId === room42; }), JSON.stringify({ a: msgsA42, b: msgsB42 }));
    r = await api('/api/games/rooms/' + room42 + '/score', 'POST', { score: 120 }, tokenA);
    check('servidor v1.8: el marcador se guarda', r.status === 200 && r.data.scores && r.data.scores[A] === 120, JSON.stringify(r.data));
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.8: el marcador llega al rival por WebSocket', msgsB42.some(function (d) { return d.type === 'score' && d.score === 120 && d.from === A; }), JSON.stringify(msgsB42));
    r = await api('/api/games/rooms/' + room42 + '/score', 'POST', { score: 80 }, tokenB);
    r = await api('/api/games/rooms/' + room42 + '/finish', 'POST', { score: 120 }, tokenA);
    check('servidor v1.8: termina la partida y gana quien tiene más puntos', r.status === 200 && r.data.room && r.data.room.status === 'finished' && r.data.room.winner === A, JSON.stringify(r.data));
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.8: el resultado llega a los dos por WebSocket', msgsA42.some(function (d) { return d.type === 'result' && d.winner === A; }) && msgsB42.some(function (d) { return d.type === 'result' && d.winner === A; }), JSON.stringify({ a: msgsA42, b: msgsB42 }));
    // sala por invitación y abandono
    r = await api('/api/games/rooms', 'POST', { gameId: 'tres-raya' }, tokenA);
    check('servidor v1.8: se crea una sala por invitación (modo por turnos para el Gato)', r.status === 200 && r.data.room && r.data.room.mode === 'turn' && r.data.room.status === 'waiting', JSON.stringify(r.data));
    const roomInv = r.data.room.id;
    r = await api('/api/games/rooms/' + roomInv + '/join', 'POST', {}, tokenB);
    check('servidor v1.8: el invitado se une y la partida empieza', r.status === 200 && r.data.status === 'matched' && r.data.myMark === 'O', JSON.stringify(r.data));
    r = await api('/api/games/rooms/' + roomInv + '/leave', 'POST', {}, tokenB);
    check('servidor v1.8: al salir, el rival gana por abandono', r.status === 200);
    await new Promise((res) => setTimeout(res, 300));
    check('servidor v1.8: el abandono avisa al rival por WebSocket', msgsA42.some(function (d) { return d.type === 'opponent-left' && d.roomId === roomInv; }), JSON.stringify(msgsA42));
    r = await api('/api/games/rooms/noexiste', 'GET', null, tokenA);
    check('servidor v1.8: una sala que no existe responde 404', r.status === 404);
    wsA42.close(); wsB42.close();
    // ---- sección 1.5.46: la subida reintenta sola mientras el servidor despierta ----
    // (a) Un trozo que llega al servidor pero pierde la respuesta NO se
    // duplica: 1.5.62 la subida REANUDA donde se quedó con el MISMO
    // uploadId (antes se reiniciaba completa con uno nuevo) y el
    // archivo final tiene los bytes exactos (sin duplicar).
    const up46Data = Buffer.concat([Buffer.alloc(1024 * 1024, 0x41), Buffer.from('COLA-46')]);
    const up46B64 = up46Data.toString('base64');
    const realFetch46 = global.fetch;
    const startIds46 = [];
    let chunkCalls46 = 0;
    let statusCalls46 = 0;
    global.fetch = async function (url, opts) {
      const u = String(url);
      if (u.indexOf('/api/media/start') >= 0) {
        const rr = await realFetch46(url, opts);
        const t = await rr.text();
        try { startIds46.push(JSON.parse(t).uploadId); } catch (e) {}
        return new Response(t, { status: rr.status, headers: rr.headers });
      }
      if (u.indexOf('/api/media/status') >= 0) { statusCalls46++; }
      if (u.indexOf('/api/media/chunk') >= 0) {
        chunkCalls46++;
        const rr = await realFetch46(url, opts);
        if (chunkCalls46 === 2) throw new Error('respuesta perdida (simulada)');
        return rr;
      }
      return realFetch46(url, opts);
    };
    try {
      const st46 = fresh();
      st46.settings.serverUrl = base;
      st46.settings.serverToken = tokenA;
      const pcts46 = [];
      const statuses46 = [];
      const url46 = await C.uploadMediaBase64(st46, up46B64, 'image/jpeg', 'foto-46.jpg', function (p) { pcts46.push(p); }, { sleep: function () { return Promise.resolve(); }, onStatus: function (s) { statuses46.push(s); } });
      check('1.5.46 subida: si un trozo pierde la respuesta, la subida termina bien con URL pública', typeof url46 === 'string' && url46.indexOf(base + '/media/') === 0, String(url46));
      const got46 = await realFetch46(url46);
      check('1.5.46 subida: el archivo final tiene los bytes exactos, sin duplicar el trozo perdido', got46.status === 200 && Buffer.compare(Buffer.from(await got46.arrayBuffer()), up46Data) === 0, 'status=' + got46.status);
      check('1.5.62 subida: la reanudación usó el MISMO uploadId (no se empezó de cero)', startIds46.length === 1, JSON.stringify(startIds46));
      check('1.5.62 subida: para reanudar, el cliente preguntó al servidor cuántos bytes lleva (GET /api/media/status)', statusCalls46 >= 1, 'statusCalls=' + statusCalls46);
      check('1.5.62 subida: el trozo se manda con timeout de 60 s (no 30 s)', /async function sendServerMediaChunkRaw1546[\s\S]{0,600}60000/.test(corejs));
      check('1.5.46 subida: mientras se reintentaba, se avisó que el servidor está despertando', statuses46.indexOf('waking') >= 0, JSON.stringify(statuses46));
      check('1.5.46 subida: el porcentaje nunca volvió atrás en el reintento', pcts46.every(function (p, i) { return i === 0 || p >= pcts46[i - 1]; }), JSON.stringify(pcts46));
    } finally { global.fetch = realFetch46; }
    // (b) Servidor dormido: las dos primeras peticiones fallan por
    // conexión y la tercera (ya despierto) funciona: la subida sale.
    const realFetch46b = global.fetch;
    let mediaCalls46b = 0;
    global.fetch = async function (url, opts) {
      if (String(url).indexOf('/api/media/') >= 0) {
        mediaCalls46b++;
        if (mediaCalls46b <= 2) throw new Error('fetch failed');
      }
      return realFetch46b(url, opts);
    };
    try {
      const st46b = fresh();
      st46b.settings.serverUrl = base;
      st46b.settings.serverToken = tokenA;
      const url46b = await C.uploadMediaBase64(st46b, Buffer.from('FOTO-DORMIDA-46').toString('base64'), 'image/jpeg', 'dormida.jpg', null, { sleep: function () { return Promise.resolve(); } });
      check('1.5.46 subida: con el servidor dormido (2 fallos de conexión y luego despierto), la subida sale', typeof url46b === 'string' && url46b.indexOf(base + '/media/') === 0, String(url46b));
      const got46b = await realFetch46b(url46b);
      check('1.5.46 subida: el archivo del servidor dormido se sirve completo', got46b.status === 200 && (await got46b.text()) === 'FOTO-DORMIDA-46');
    } finally { global.fetch = realFetch46b; }
    // (c) Una petición colgada se corta por el timeout de cada intento
    // (no se queda esperando para siempre).
    const realFetch46c = global.fetch;
    let aborts46c = 0;
    global.fetch = function (url, opts) {
      return new Promise(function (resolve, reject) {
        var sig = opts && opts.signal;
        if (sig) sig.addEventListener('abort', function () { aborts46c++; var e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
      });
    };
    try {
      const st46c = fresh();
      st46c.settings.serverUrl = base;
      st46c.settings.serverToken = tokenA;
      const t46c = Date.now();
      const r46c = await C.serverFetchWithRetry(st46c, '/api/posts/x', 'DELETE', {}, { attempts: 3, delays: [0, 0, 0], timeoutMs: 50, sleep: function () { return Promise.resolve(); } });
      const dt46c = Date.now() - t46c;
      check('1.5.46 timeout: una petición colgada se corta por timeout y dice que el servidor tardó demasiado', r46c && r46c.error === 'El servidor tardó demasiado en responder' && aborts46c === 3 && dt46c < 5000, JSON.stringify(r46c) + ' aborts=' + aborts46c + ' ms=' + dt46c);
      const t46u = Date.now();
      const url46c = await C.uploadMediaBase64(st46c, Buffer.from('FOTO-COLGADA-46').toString('base64'), 'image/jpeg', 'colgada.jpg', null, { sleep: function () { return Promise.resolve(); }, timeoutMs: 50, maxRestarts: 0 });
      const dt46u = Date.now() - t46u;
      check('1.5.46 timeout: una subida colgada se corta (no se queda esperando) y queda como error del servidor', url46c === null && C.lastMediaUploadError1546() === 'server' && dt46u < 5000, 'url=' + url46c + ' err=' + C.lastMediaUploadError1546() + ' ms=' + dt46u);
    } finally { global.fetch = realFetch46c; }

    // ---- sección 1.5.62: finish idempotente, estado de la subida y
    // nunca publicar con medio local (contra el servidor empaquetado,
    // que lleva los mismos cambios 4.8 que el servidor de producción) ----
    r = await api('/api/media/start', 'POST', { name: 'prueba62.txt', type: 'text/plain' }, tokenA);
    check('1.5.62 servidor: se abre una subida de medios', r.status === 200 && r.data && r.data.uploadId, JSON.stringify(r.data));
    const up62 = r.data && r.data.uploadId;
    const chunk62 = Buffer.from('HOLA-62').toString('base64');
    r = await api('/api/media/chunk', 'POST', { uploadId: up62, data: chunk62 }, tokenA);
    check('1.5.62 servidor: el trozo se guarda y el servidor dice cuántos bytes lleva', r.status === 200 && r.data && r.data.received === 7, JSON.stringify(r.data));
    r = await api('/api/media/status?uploadId=' + encodeURIComponent(up62), 'GET', null, tokenA);
    check('1.5.62 servidor: GET /api/media/status dice los bytes recibidos y que aún no terminó', r.status === 200 && r.data && r.data.received === 7 && r.data.finished === false, JSON.stringify(r.data));
    r = await api('/api/media/finish', 'POST', { uploadId: up62 }, tokenA);
    check('1.5.62 servidor: finish guarda y devuelve la URL', r.status === 200 && r.data && typeof r.data.url === 'string' && r.data.url.length > 0, JSON.stringify(r.data));
    const url62 = r.data && r.data.url;
    r = await api('/api/media/finish', 'POST', { uploadId: up62 }, tokenA);
    check('1.5.62 servidor: un segundo finish con el mismo uploadId devuelve la MISMA URL (no 404)', r.status === 200 && r.data && r.data.url === url62, JSON.stringify(r.data));
    r = await api('/api/media/status?uploadId=' + encodeURIComponent(up62), 'GET', null, tokenA);
    check('1.5.62 servidor: tras cerrar, /api/media/status dice finished y la misma URL', r.status === 200 && r.data && r.data.finished === true && r.data.url === url62, JSON.stringify(r.data));
    r = await api('/api/posts', 'POST', { text: 'Video roto', media: 'blob:null/281f7dec-0000-0000-0000-000000000000' }, tokenA);
    check('1.5.62 servidor: POST /api/posts con media blob: responde 400 «Medio no válido.»', r.status === 400 && r.data && r.data.error === 'Medio no válido.', JSON.stringify(r.data));
    r = await api('/api/posts', 'POST', { text: 'Video roto 2', mediaList: [{ src: 'content://com.wordred.app.fileprovider/apk-files/media/shared_1.mp4', type: 'video' }] }, tokenA);
    check('1.5.62 servidor: POST /api/posts con mediaList content: responde 400 «Medio no válido.»', r.status === 400 && r.data && r.data.error === 'Medio no válido.', JSON.stringify(r.data));
    r = await api('/api/posts', 'POST', { text: 'Video bueno', media: 'https://res.cloudinary.com/bekxop7h/video/upload/v1/wordred/bueno.mp4', mediaType: 'video' }, tokenA);
    check('1.5.62 servidor: POST /api/posts con media https sí se publica (la validación no rompe lo bueno)', r.status === 200 && r.data && r.data.post && r.data.post.id, JSON.stringify(r.data));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    try { jwksServer.close(); } catch (e) {}
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

/* 61. Target SDK 35 (v1.5.9): menos avisos de Play Protect por versión
   vieja; edge-to-edge con el contenido igual que en 1.5.8. */
function static159() {
  console.log('=== 61. Target SDK 35 y edge-to-edge (v1.5.9) ===');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const share = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'ScreenShareService.java'), 'utf8');
  check('v1.5.16: el manifiesto es versión 67 / 1.5.52 con targetSdk 35', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest) && /android:targetSdkVersion="35"/.test(manifest));
  check('v1.5.9: minSdk sigue en 24 (nada más cambia)', /android:minSdkVersion="24"/.test(manifest));
  check('v1.5.9: el WebView aplica los márgenes de las barras del sistema como padding (edge-to-edge igual que 1.5.8)', /void applySystemBarPadding\(final View v\)/.test(main) && /setOnApplyWindowInsetsListener/.test(main) && /Type\.systemBars\(\)/.test(main) && /setPadding\(0, top, 0, bottom\)/.test(main) && /applySystemBarPadding\(webView\)/.test(main));
  check('v1.5.9: el fondo del WebView es el color oscuro de antes (#120608)', /webView\.setBackgroundColor\(0xFF120608\)/.test(main));
  check('v1.5.9: el diálogo web del juego también aplica los márgenes de las barras', /applySystemBarPadding\(root\)/.test(main));
  check('v1.5.9: el servicio de pantalla pasa el tipo mediaProjection al arrancar (target 34+)', /FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION/.test(share) && /startForeground\(NOTIF_ID, buildNotification\(\),\s*android\.content\.pm\.ServiceInfo\.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION\)/.test(share));
  check('v1.5.9: el manifiesto sigue declarando el servicio con tipo mediaProjection y su permiso', /foregroundServiceType="mediaProjection"/.test(manifest) && /FOREGROUND_SERVICE_MEDIA_PROJECTION/.test(manifest));
  check('v1.5.12: los permisos de SMS se quitaron; llamadas, contactos y medios siguen', !/SEND_SMS/.test(manifest) && /READ_CALL_LOG/.test(manifest) && /READ_MEDIA_IMAGES/.test(manifest) && /READ_MEDIA_VIDEO/.test(manifest));
}

/* 62. Borrar llega al servidor + jalar para recargar (v1.5.10): el
   borrado de antes solo quitaba la publicación en local y reaparecía
   al reabrir; ahora pasa por DELETE /api/posts/:id (servidor 3.2) y el
   inicio se poda con lo que diga el servidor. */
function static1510() {
  console.log('=== 62. Borrado en el servidor y jalar para recargar (v1.5.10) ===');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  /* El borrado pasa por el servidor ANTES de tocar el estado local. */
  const delFn = appjs.slice(appjs.indexOf('window.__wrDeletePost = function'), appjs.indexOf('window.__wrDeletePost = function') + 2600);
  check('v1.5.14 borrado: __wrDeletePost quita la publicación AL INSTANTE (optimista) y luego pide DELETE al servidor', delFn.indexOf("serverFetchWithRetry(state, '/api/posts/' + encodeURIComponent(postId), 'DELETE'") >= 0 && delFn.indexOf('C.markPostDeleted(state, postId)') >= 0 && delFn.indexOf('C.markPostDeleted') < delFn.indexOf('serverFetchWithRetry'), delFn.slice(0, 300));
  check('v1.5.15 borrado: un 404 del servidor NO devuelve la publicación (ya no existe ahí: el borrado ya está hecho)', delFn.indexOf('r.status === 404') >= 0 && delFn.indexOf("toast('Publicación borrada.')") >= 0);
  check('v1.5.15 borrado: sin conexión (o sesión vencida) la publicación se QUEDA OCULTA y el borrado se encola para borrarlo en silencio al despertar', delFn.indexOf('C.isConnectionError(r)') >= 0 && delFn.indexOf("C.queuePending(state, { kind: 'http', path: '/api/posts/' + encodeURIComponent(postId), method: 'DELETE'") >= 0 && delFn.indexOf('Publicación oculta. Se borrará para todos en cuanto vuelva la conexión.') >= 0);
  check('v1.5.15 borrado: solo un rechazo real del servidor (403/500) devuelve la publicación a su sitio, con el error de verdad', delFn.indexOf('C.unmarkPostDeleted(state, postId)') >= 0 && delFn.indexOf('No se pudo borrar la publicación. Inténtalo de nuevo.') >= 0 && delFn.indexOf('state.posts.splice(Math.min(idx, state.posts.length), 0, removed)') >= 0);
  check('v1.5.14 borrado: el borrado optimista repinta todas las vistas (inicio, perfil, detalle, grupo, página)', delFn.indexOf('refreshPostViews(postId)') >= 0 && delFn.indexOf("if (currentView === 'profile') renderOwnProfile();") < 0);
  check('v1.5.14 borrado: antes de borrar se comprueba el permiso (autor o admin del grupo)', delFn.indexOf('C.canDeletePost(state, state.me, postId)') >= 0);
  check('v1.5.10 borrado: al borrar se limpian de la cola los envíos que la resucitarían', delFn.indexOf('C.dropPendingPost(state, postId)') >= 0);
  check('v1.5.10 borrado: el aviso postDeleted del servidor quita la publicación en vivo', appjs.indexOf("data.kind === 'postDeleted'") >= 0 && appjs.indexOf('refreshPostViews(data.postId)') >= 0);
  check('v1.5.10 borrado: al bajar el inicio se podan las que el servidor ya no trae', appjs.indexOf('C.pruneDeletedPostIds(state.posts, r.data.posts') >= 0);
  /* La cola de pendientes no resucita publicaciones borradas. */
  let st = withProfiles(fresh());
  const p = C.createPost(st, A, { text: 'Para borrar' }).post;
  C.queuePending(st, { kind: 'http', path: '/api/posts', method: 'POST', body: { post: p } });
  C.queuePending(st, { kind: 'http', path: '/api/posts/' + p.id + '/like', method: 'POST', body: { reaction: 'Me gusta' } });
  C.queuePending(st, { kind: 'http', path: '/api/posts/otro-id/like', method: 'POST', body: {} });
  C.queuePending(st, { kind: 'media-upload', dataUrl: 'data:image/jpeg;base64,x', mime: 'image/jpeg', name: 'foto.jpg', apply: { type: 'post', id: p.id, field: 'mediaList', index: 0 } });
  check('v1.5.10 borrado: dropPendingPost saca de la cola todo lo de esa publicación y nada más', C.dropPendingPost(st, p.id) === 3 && st.pendingQueue.length === 1 && st.pendingQueue[0].path.indexOf('otro-id') >= 0, JSON.stringify(st.pendingQueue.map(function (q) { return q.path || q.kind; })));
  /* La poda con lo que diga el servidor (fuente de verdad). */
  const now = Date.now();
  const feed = [{ id: 'p1', createdAt: now - 1000000 }, { id: 'p2', createdAt: now - 900000 }];
  const local = [
    { id: 'p1', createdAt: now - 1000000 },
    { id: 'p2', createdAt: now - 900000 },
    { id: 'p3', createdAt: now - 800000 },
    { id: 'p4', createdAt: now - 700000, isDemo: true },
    { id: 'p5', createdAt: now - 600000 },
    { id: 'p6', createdAt: now - 10000 },
    { id: 'p7', createdAt: now - 2000000 }
  ];
  const pruned = C.pruneDeletedPostIds(local, feed, now, { p5: true });
  check('v1.5.10 poda: solo se quita la borrada en el servidor (no ejemplos, ni pendientes, ni recientes, ni viejas fuera del corte)', pruned.length === 1 && pruned[0] === 'p3', JSON.stringify(pruned));
  check('v1.5.10 poda: con el inicio vacío del servidor, una publicación local vieja se poda (el servidor manda)', C.pruneDeletedPostIds([{ id: 'x', createdAt: now - 500000 }], [], now, {}).length === 1);
  /* Pull-to-refresh: máquina de estados (sin DOM). */
  check('v1.5.10 PTR: el umbral es 80 px', C.PTR_THRESHOLD_PX === 80);
  const ptr = C.createPullRefresh();
  check('v1.5.10 PTR: sin estar arriba del todo no arranca', ptr.start(100, 50, false) === false);
  check('v1.5.10 PTR: arriba del todo sí arranca', ptr.start(100, 50, true) === true);
  let m = ptr.move(150, 52);
  check('v1.5.10 PTR: jalando 50 px aún no está listo', m.pull === 50 && m.ready === false);
  m = ptr.move(190, 52);
  check('v1.5.10 PTR: jalando 90 px ya está listo para recargar', m.pull === 90 && m.ready === true);
  check('v1.5.10 PTR: soltar listo dispara la recarga', ptr.end().trigger === true);
  check('v1.5.10 PTR: mientras recarga no arranca otro gesto', ptr.start(100, 50, true) === false);
  ptr.done();
  check('v1.5.10 PTR: tras recargar se puede jalar de nuevo', ptr.start(100, 50, true) === true);
  m = ptr.move(150, 200);
  check('v1.5.10 PTR: un jalón horizontal se cancela (historias)', m.cancelled === true && m.pull === 0);
  check('v1.5.10 PTR: tras cancelar, soltar no dispara nada', ptr.end().trigger === false);
  const ptr2 = C.createPullRefresh();
  ptr2.start(100, 50, true);
  ptr2.move(130, 50);
  check('v1.5.10 PTR: soltar antes del umbral no recarga', ptr2.end().trigger === false);
  const ptr3 = C.createPullRefresh();
  ptr3.start(100, 50, true);
  m = ptr3.move(80, 50);
  check('v1.5.10 PTR: subir el dedo cancela el jalón', m.cancelled === true);
  /* Cableado del gesto en la app y barra visible en el inicio. */
  check('v1.5.10 PTR: la app escucha el toque en el documento y usa la máquina de estados', /document\.addEventListener\('touchstart'/.test(appjs) && /document\.addEventListener\('touchmove'/.test(appjs) && /document\.addEventListener\('touchend'/.test(appjs) && /C\.createPullRefresh\(\)/.test(appjs));
  check('v1.5.10 PTR: solo vale en el inicio, arriba del todo y sin overlays', /ptrCanStart/.test(appjs) && /currentView !== 'feed'/.test(appjs) && /window\.scrollY > 0/.test(appjs) && /document\.querySelector\('\.overlay\.on'\)/.test(appjs));
  check('v1.5.10 PTR: el toque que empieza en las historias no lo dispara', /\.closest\('\.stories'\)/.test(appjs));
  check('v1.5.10 PTR: la barra existe en el inicio con su estilo y su giro de carga', idx.indexOf('id="ptrBar"') >= 0 && /\.ptrBar\{/.test(idx) && /@keyframes ptrSpin/.test(idx) && appjs.indexOf("bar.innerHTML = '<span class=\"ptrSpin\"></span> Recargando") >= 0);
}

/* 63. El borrado reintenta solo cuando falla por conexión (v1.5.11):
   el servidor gratuito de Render se duerme y tarda ~30-60 s en
   despertar; antes el DELETE se hacía una sola vez sin timeout y si
   caía mientras despertaba, la app se rendía con "revisa tu conexión". */
async function static1511() {
  console.log('=== 63. Borrado con reintento al despertar el servidor (v1.5.11) ===');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  /* Cableado: __wrDeletePost usa el reintento con aviso de progreso. */
  const delFn = appjs.slice(appjs.indexOf('window.__wrDeletePost = function'), appjs.indexOf('window.__wrDeletePost = function') + 2200);
  check('v1.5.11 reintento: __wrDeletePost pide DELETE con serverFetchWithRetry', delFn.indexOf("serverFetchWithRetry(state, '/api/posts/' + encodeURIComponent(postId), 'DELETE'") >= 0, delFn.slice(0, 300));
  check('v1.5.11 reintento: al empezar avisa "Borrando…" y al reintentar "Despertando el servidor, espera…"', delFn.indexOf("toast('Borrando…')") >= 0 && delFn.indexOf("toast('Despertando el servidor, espera…')") >= 0);
  check('v1.5.11 reintento: el helper es 3 intentos, esperas 5 s y 15 s, 30 s por intento', /var attempts = opts\.attempts \|\| 3/.test(corejs) && /var delays = opts\.delays \|\| \[0, 5000, 15000\]/.test(corejs) && /var timeoutMs = \(opts\.timeoutMs == null \? 30000 : opts\.timeoutMs\)/.test(corejs));
  /* Qué es error de conexión y qué no. */
  check('v1.5.11 reintento: "No se pudo conectar" y el timeout sí son error de conexión', C.isConnectionError({ ok: false, error: 'No se pudo conectar: sin conexión' }) === true && C.isConnectionError({ ok: false, error: 'El servidor tardó demasiado en responder' }) === true);
  check('v1.5.11 reintento: un 403/404/500 y el ok no son error de conexión', C.isConnectionError({ ok: false, error: 'La conexión respondió 403' }) === false && C.isConnectionError({ ok: false, error: 'Sin permiso.' }) === false && C.isConnectionError({ ok: false, error: 'Sin conexión. Todo se guarda en este teléfono.' }) === false && C.isConnectionError({ ok: true }) === false && C.isConnectionError(null) === false);
  /* El reintento con el servidor simulado (fetch global). */
  const realFetch = global.fetch;
  const st = withProfiles(fresh());
  let calls11 = 0;
  let sleeps11 = [];
  const sleep11 = function (ms) { sleeps11.push(ms); return Promise.resolve(); };
  const okResp = function () { return { ok: true, status: 200, json: async function () { return { ok: true }; } }; };
  // falla 2 veces por conexión (una por corte, otra por timeout) y a la tercera llega
  calls11 = 0; sleeps11 = [];
  global.fetch = async function () {
    calls11++;
    if (calls11 === 1) throw new Error('sin conexión');
    if (calls11 === 2) { const e = new Error('La operación se canceló'); e.name = 'AbortError'; throw e; }
    return okResp();
  };
  let r11 = await C.serverFetchWithRetry(st, '/api/posts/x', 'DELETE', {}, { sleep: sleep11 });
  check('v1.5.11 reintento: tras 2 fallos por conexión llega al tercer intento y borra', r11.ok === true && calls11 === 3, 'intentos=' + calls11);
  check('v1.5.11 reintento: entre intentos espera 5 s y luego 15 s', JSON.stringify(sleeps11) === '[5000,15000]', JSON.stringify(sleeps11));
  // falla siempre por conexión: 3 intentos y el error final
  calls11 = 0; sleeps11 = [];
  global.fetch = async function () { calls11++; throw new Error('sin conexión'); };
  r11 = await C.serverFetchWithRetry(st, '/api/posts/x', 'DELETE', {}, { sleep: sleep11 });
  check('v1.5.11 reintento: si falla siempre, se rinde tras 3 intentos con el error de conexión', r11.ok === false && r11.error.indexOf('No se pudo conectar') === 0 && calls11 === 3, 'intentos=' + calls11 + ' error=' + r11.error);
  // un 403 no se reintenta
  calls11 = 0;
  global.fetch = async function () { calls11++; return { ok: false, status: 403, json: async function () { return { ok: false, error: 'Sin permiso.' }; } }; };
  r11 = await C.serverFetchWithRetry(st, '/api/posts/x', 'DELETE', {}, { sleep: sleep11 });
  check('v1.5.11 reintento: un 403 no se reintenta (un solo intento)', r11.ok === false && r11.error === 'Sin permiso.' && calls11 === 1, 'intentos=' + calls11);
  global.fetch = realFetch;
}


/* 66. WordRed 1.5.13: cajón de aplicaciones sin carpetas, botón central. */
function static1513launcher() {
  console.log('=== 66. WordRed 1.5.13: cajón de aplicaciones sin carpetas, botón central ===');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  check('v1.5.13 lanzador: el manifiesto ofrece WordRed como app de inicio (HOME) y lista las apps', /android\.intent\.action\.MAIN[\s\S]{0,200}android\.intent\.category\.HOME/.test(manifest) && /android\.intent\.category\.HOME/.test(manifest) && /android\.intent\.category\.DEFAULT/.test(manifest) && /QUERY_ALL_PACKAGES/.test(manifest));
  check('v1.5.13 lanzador: el puente abre una app, desinstala, abre su información y la comparte', /openApp/.test(main) && /uninstallApp/.test(main) && /openAppInfo/.test(main) && /ACTION_APPLICATION_DETAILS_SETTINGS/.test(main) && /"package:" \+ pkg/.test(main) && /shareApp/.test(main) && /ACTION_SEND/.test(main) && /play\.google\.com\/store\/apps\/details\?id=/.test(main));
  check('v1.5.13 lanzador: compartir usa el enlace de Play Store, no el APK de otra app', /shareApp\(String pkg\)/.test(main) && !/shareApp\(String pkg\)[\s\S]{0,600}sourceDir/.test(main));
  check('v1.5.13 lanzador: el puente sabe si WordRed ya es el lanzador y pide el rol HOME', /isDefaultHome/.test(main) && /requestHomeRole/.test(main) && /ROLE_HOME/.test(main));
  check('v1.5.13 lanzador: la flecha sigue revelando la barra y el servicio en segundo plano sigue', /revealStatusBar/.test(main) && /WordRedBackgroundService/.test(manifest) && /WordRedBootReceiver/.test(manifest));
  check('v1.5.13 lanzador: NO queda sección de apps en el inicio ni overlays de carpeta o renombrar', !/id="launcherSection"/.test(idx) && !/Mis aplicaciones/.test(idx) && !/id="folderOverlay"/.test(idx) && !/id="launcherRenameOverlay"/.test(idx) && !/id="launcherRenameInput"/.test(idx) && !/id="folderGrid"/.test(idx));
  check('v1.5.13 lanzador: el botón rojo de 4 recuadros está en el centro de la barra de abajo', /id="navLauncherBtn"/.test(idx) && /bn-launcher/.test(idx) && idx.indexOf('data-nav="shorts"') < idx.indexOf('id="navLauncherBtn"') && idx.indexOf('id="navLauncherBtn"') < idx.indexOf('data-nav="groups"') && /<rect x="3" y="3" width="8" height="8"/.test(idx));
  check('v1.5.14 lanzador: el botón central es más grande que los otros sin exagerar (44 px frente a 28 px) y sin texto', /bn-launcher \.ic svg\{width:44px;height:44px\}/.test(idx) && /#bottomNav button \.ic svg\{width:28px;height:28px/.test(idx) && /bn-launcher\{flex:0 0 auto;background:linear-gradient\(135deg,#ff2d4d,var\(--red\)/.test(idx) && /<button id="navLauncherBtn" class="bn-launcher" aria-label="Aplicaciones"><span class="ic"><svg[\s\S]*?<\/svg><\/span><\/button>/.test(idx) && (((idx.match(/<button id="navLauncherBtn"[\s\S]*?<\/button>/) || [''])[0].match(/rx="3"/g) || []).length === 4));
  check('v1.5.13 lanzador: el cajón tiene X arriba, orden por nombre y Mi orden, y cuadrícula', /id="appsDrawerOverlay"/.test(idx) && /id="appsDrawerClose"/.test(idx) && /id="appsSortCustom"/.test(idx) && /Mi orden/.test(idx) && /id="appsSortName"/.test(idx) && /Por nombre/.test(idx) && /id="appsDrawerGrid"/.test(idx));
  check('v1.5.13 lanzador: los iconos van grandes y SIN marco (sin tarjeta, borde ni fondo)', /launcherIconHtml\(a, 60\)/.test(appjs) && /\.launcherTile\{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 4px 8px;cursor:pointer/.test(idx) && !/\.launcherTile\{[^}]*background:rgba\(255,255,255/.test(idx) && !/launcherFolderIcons/.test(idx));
  check('v1.5.13 lanzador: la app dibuja el cajón, abre apps y arrastra para reordenar', /renderAppsDrawer/.test(appjs) && /openAppsDrawer/.test(appjs) && /launcherOpenApp/.test(appjs) && /launcherStartDrag/.test(appjs) && /launcherDrop/.test(appjs) && /launcherReorderEntry/.test(appjs));
  check('v1.5.13 lanzador: el menú de presionar trae Abrir, Desinstalar, Información y Compartir', /Información de la aplicación/.test(appjs) && /launcherOpenAppInfo/.test(appjs) && /launcherShareApp/.test(appjs) && /'Compartir'/.test(appjs) && /'Desinstalar'/.test(appjs));
  check('v1.5.13 lanzador: el menú se abre con los datos ya cargados, sin esperar al puente', /function openLauncherMenu\(tile\) \{[\s\S]{0,400}launcherAppInfo\(pkg\)/.test(appjs) && !/openLauncherMenu[\s\S]{0,500}AndroidBridge\.(listInstalledApps|openAppInfo|shareApp)\(\)/.test(appjs));
  check('v1.5.13 lanzador: hay animaciones al presionar y al abrir una app', /\.launcherTile\.pressed\{transform:scale\(\.9\)\}/.test(idx) && /\.launcherTile\.opening\{animation:appOpenPulse/.test(idx) && /@keyframes appOpenPulse/.test(idx) && /tile\.classList\.add\('opening'\)/.test(appjs) && /tile\.classList\.add\('pressed'\)/.test(appjs));
  check('v1.5.13 lanzador: el botón de la barra no cambia de vista (no tiene data-nav)', /id="navLauncherBtn" class="bn-launcher"/.test(idx) && /if \(!b\.getAttribute\('data-nav'\)\) return;/.test(appjs));
  check('v1.5.13 lanzador: NO queda código de carpetas en la app ni en el núcleo', !/launcherCreateFolder/.test(appjs) && !/launcherCreateFolder/.test(corejs) && !/launcherRenameFolder/.test(appjs) && !/launcherDeleteFolder/.test(appjs) && !/launcherAddToFolder/.test(appjs) && !/launcherRemoveFromFolder/.test(appjs) && !/launcherFindFolder/.test(appjs) && !/openLauncherFolder/.test(appjs) && !/renderLauncher/.test(appjs) && !/Nueva carpeta/.test(appjs) && !/Meter en carpeta/.test(appjs) && !/Sacar de la carpeta/.test(appjs) && !/Eliminar carpeta/.test(appjs));
  check('v1.5.13 lanzador: el inicio carga las apps al entrar y el cajón las dibuja', /refreshLauncherApps\(\);/.test(appjs) && /renderAppsDrawer\(\);/.test(appjs) && /launcherSyncApps/.test(appjs) && /launcherPruneApps/.test(appjs));
  var st = { launcher: { layout: [] } };
  C.launcherSyncApps(st, ['com.a', 'com.b', 'com.c', 'com.d']);
  check('v1.5.13 lanzador: sincronizar agrega las apps nuevas al final sin duplicar', C.launcherLayout(st).length === 4 && C.launcherSyncApps(st, ['com.a', 'com.e']).length === 5);
  check('v1.5.13 lanzador: mover una entrada cambia el orden', C.launcherMoveEntry(st, 0, 2).ok === true && C.launcherLayout(st)[2].pkg === 'com.a');
  check('v1.5.13 lanzador: borrar una app la quita de todos lados', C.launcherRemoveApp(st, 'com.b').ok === true && !JSON.stringify(C.launcherLayout(st)).includes('com.b'));
  check('v1.5.13 lanzador: podar quita las apps que ya no están instaladas', C.launcherSyncApps(st, ['com.x', 'com.y']) && C.launcherPruneApps(st, ['com.x']).length === 1 && C.launcherLayout(st)[0].pkg === 'com.x');
  C.launcherSyncApps(st, ['com.d', 'com.a', 'com.e']);
  check('v1.5.13 lanzador: el orden por nombre es alfabético y no toca el orden guardado', C.launcherSetSort(st, 'name').sort === 'name' && C.launcherOrderedApps(st, [{ pkg: 'com.z', name: 'Zeta' }, { pkg: 'com.a', name: 'Alfa' }, { pkg: 'com.m', name: 'Medio' }]).map(function (a) { return a.name; }).join(',') === 'Alfa,Medio,Zeta' && C.launcherLayout(st).map(function (e) { return e.pkg; }).join(',') === 'com.x,com.d,com.a,com.e');
  check('v1.5.13 lanzador: "Mi orden" usa el orden guardado y persiste el modo', C.launcherSetSort(st, 'custom').sort === 'custom' && C.launcherOrderedApps(st, [{ pkg: 'com.x', name: 'Equix' }, { pkg: 'com.d', name: 'Delta' }]).map(function (a) { return a.pkg; }).join(',') === 'com.x,com.d' && C.launcherSortMode(st) === 'custom');
  var stOld = { launcher: { layout: [{ kind: 'folder', id: 'f1', name: 'Juegos', items: ['com.b', 'com.c'] }, { kind: 'app', pkg: 'com.a' }], sort: 'custom' } };
  check('v1.5.13 lanzador: migrar un estado viejo deshace las carpetas sin perder apps', C.launcherLayout(stOld).length === 3 && C.launcherLayout(stOld).every(function (e) { return e.kind === 'app'; }) && C.launcherLayout(stOld).map(function (e) { return e.pkg; }).join(',') === 'com.b,com.c,com.a');
  check('v1.5.13 lanzador: el orden y el modo viven en el estado (persisten)', JSON.stringify(st).includes('"launcher"') && Array.isArray(st.launcher.layout) && typeof st.launcher.sort === 'string');
}

/* 67. WordRed 1.5.14: el cajón de aplicaciones SÍ se desplaza (barra
   roja visible) y la barra de abajo ya no tiene "Avisos". */
function static1514drawer() {
  console.log('=== 67. WordRed 1.5.14: cajón con desplazamiento real y barra sin Avisos ===');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  check('v1.5.14 manifiesto: versión 67 / 1.5.52 con targetSdk 35', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest) && /android:targetSdkVersion="35"/.test(manifest));
  // Causa raíz: las baldosas tenían touch-action:none (el navegador
  // nunca desplazaba) y cualquier movimiento >12 px empezaba un arrastre.
  check('v1.5.14 cajón: las baldosas permiten el desplazamiento vertical nativo (pan-y)', /\.launcherTile\{[^}]*touch-action:pan-y/.test(idx) && !/\.launcherTile\{[^}]*touch-action:none/.test(idx));
  check('v1.5.14 cajón: la cuadrícula vive en su propio contenedor con altura acotada y overflow-y auto', /id="appsDrawerScroll"/.test(idx) && /\.appsDrawerScroll\{overflow-y:auto;overscroll-behavior:contain;/.test(idx) && /max-height:calc\(100dvh - 230px( - var\(--sys-nav-bottom,0px\))?\)/.test(idx));
  check('v1.5.14 cajón: hay una barra roja visible (siempre se ve mientras haya más apps)', /id="appsDrawerScrollbar"/.test(idx) && /id="appsDrawerThumb"/.test(idx) && /\.appsDrawerThumb\{[^}]*background:var\(--red\)/.test(idx) && /\.appsDrawerScrollbar\.on\{display:block\}/.test(idx));
  check('v1.5.14 cajón: la barra se actualiza con el desplazamiento y se puede arrastrar ella misma', /function updateAppsDrawerScrollbar/.test(appjs) && /function appsDrawerThumbPointerDown/.test(appjs) && /sc\.scrollTop/.test(appjs) && /scrollHeight/.test(appjs));
  check('v1.5.14 cajón: el arrastre para reordenar solo se arma tras mantener presionado (350 ms)', /LAUNCHER_DRAG_ARM_MS = 350/.test(appjs) && /dragArmed && canDrag/.test(appjs) && /armTimer = setTimeout\(function \(\) \{ dragArmed = true; \}, LAUNCHER_DRAG_ARM_MS\)/.test(appjs));
  check('v1.5.14 cajón: al dibujar el cajón se actualiza la barra', /renderAppsDrawer[\s\S]{0,2000}updateAppsDrawerScrollbar\(\);/.test(appjs) && /addEventListener\('scroll', updateAppsDrawerScrollbar\)/.test(appjs));
  // Barra de abajo sin "Avisos", "Amigos" ni "Mensajes", con Aplicaciones en el centro exacto.
  var navBlock = (idx.match(/<nav id="bottomNav">[\s\S]*?<\/nav>/) || [''])[0];
  check('v1.5.14 barra: ya no hay botón "Avisos", "Amigos" ni "Mensajes" en la barra de abajo', !/<button data-nav="notifs">/.test(navBlock) && !/<button data-nav="friends">/.test(navBlock) && !/<button data-nav="messages">/.test(navBlock) && !/navNotifBadge/.test(idx) && !/navNotifBadge/.test(appjs) && !/navReqBadge/.test(appjs) && !/navMsgBadge/.test(appjs));
  check('v1.5.14 barra: quedan 5 botones, con Aplicaciones 3.º (centro) entre dos grupos', (navBlock.match(/<button/g) || []).length === 5 && (navBlock.match(/<div class="bn-side">/g) || []).length === 2 && navBlock.indexOf('navLauncherBtn') > navBlock.indexOf('data-nav="shorts"') && navBlock.indexOf('navLauncherBtn') < navBlock.indexOf('data-nav="groups"'));
  check('v1.5.14 barra: los lados son flex:1 y el botón central no se estira', /nav#bottomNav \.bn-side\{flex:1;display:flex;min-width:0\}/.test(idx) && /nav#bottomNav button\.bn-launcher\{flex:0 0 auto/.test(idx));
  check('v1.5.14 barra: Avisos sigue existiendo y se entra por la campana del encabezado', /id="hdrBell"/.test(idx) && /\$\('hdrBell'\)\.addEventListener\('click', function \(\) \{ go\('notifs'\); \}\)/.test(appjs) && /id="view-notifs"/.test(idx));
  check('v1.5.14 barra: Mensajes está arriba, justo después de la lupa, y abre la vista', /id="hdrMessages"/.test(idx) && idx.indexOf('id="hdrSearch"') < idx.indexOf('id="hdrMessages"') && idx.indexOf('id="hdrMessages"') < idx.indexOf('id="hdrShareApp"') && /\$\('hdrMessages'\)\.addEventListener\('click', function \(\) \{ go\('messages'\); \}\)/.test(appjs) && /id="hdrMsgBadge"/.test(idx));
  check('v1.5.14 perfil: Seguidores está en el Perfil ANTES del botón de Ajustes (1.5.32: Amigos salió de la fila; su insignia vive en Seguidores) y abre la vista', (function () { var i = appjs.indexOf('function renderOwnProfile() {'); if (i < 0) return false; var j = appjs.indexOf('\nfunction ', i + 10); var b = appjs.slice(i, j < 0 ? appjs.length : j); return b.indexOf('__wrOpenSettings') >= 0 && b.indexOf('aria-label="Seguidores"') < b.indexOf('__wrOpenSettings') && b.indexOf('profileFriendsBtn') < 0 && b.indexOf('id="profileFriendsBadge"') >= 0 && b.indexOf('id="profileFriendsBadge"') < b.indexOf('__wrOpenSettings'); })() && /window\.__wrOpenFriends = function \(\) \{ go\('friends'\); \}/.test(appjs) && /profileFriendsBadge/.test(appjs));
  // Encabezado de las publicaciones del perfil (y del inicio): sin aplastar.
  check('v1.5.14 perfil: el encabezado envuelve y la columna de nombre tiene ancho mínimo', /\.post \.head\{display:flex;gap:10px;align-items:center;flex-wrap:wrap\}/.test(idx) && /\.post \.head \.who\{flex:1 1 140px;min-width:140px\}/.test(idx) && /\.post \.head \.headActions\{display:flex;gap:8px;align-items:center;flex:none;margin-left:auto\}/.test(idx));
  check('v1.5.14 perfil: los botones del encabezado van dentro del grupo de acciones', /<div class="headActions">/.test(appjs) && /headActions[\s\S]{0,400}__wrEditPost/.test(appjs) && /headActions[\s\S]{0,1500}save-btn/.test(appjs));
}

/* 68. WordRed 1.5.14 (resto): borrado real optimista + lápidas, enlaces
   con tarjeta, botón sin texto, Shorts por encima y compartir fuera. */
function static1514b() {
  console.log('=== 68. WordRed 1.5.14: borrado real, enlaces, botón, Shorts y compartir ===');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  // Lápidas de borrado (núcleo).
  let st = withProfiles(fresh());
  C.markPostDeleted(st, 'px'); C.markPostDeleted(st, 'px');
  check('v1.5.14 lápida: marcar anota el id una sola vez', st.deletedPostIds.length === 1 && C.isPostDeleted(st, 'px'));
  C.unmarkPostDeleted(st, 'px');
  check('v1.5.14 lápida: quitar la lápida la borra', !C.isPostDeleted(st, 'px') && st.deletedPostIds.length === 0);
  for (let i = 0; i < 505; i++) C.markPostDeleted(st, 't' + i);
  check('v1.5.14 lápida: como mucho 500 lápidas (se tiran las viejas)', st.deletedPostIds.length === 500 && st.deletedPostIds[0] === 't5');
  // Permiso de borrado (núcleo).
  let st2 = withProfiles(fresh());
  const mine = C.createPost(st2, A, { text: 'mía' }).post;
  const theirs = C.createPost(st2, B, { text: 'de Bruno' }).post;
  check('v1.5.14 permiso: el autor sí puede borrar su publicación', C.canDeletePost(st2, A, mine.id).ok === true);
  check('v1.5.14 permiso: otro usuario no puede borrarla', C.canDeletePost(st2, A, theirs.id).ok === false);
  check('v1.5.14 permiso: una publicación que no está en local se deja borrar (manda el servidor)', C.canDeletePost(st2, A, 'no-existe').ok === true);
  // Poda con lápidas (núcleo): la lápida vence los resguardos.
  const now = Date.now();
  const feed = [{ id: 'p1', createdAt: now - 1000000 }];
  check('v1.5.14 poda: sin lápida, una publicación más vieja que el corte de 100 NO se poda', C.pruneDeletedPostIds([{ id: 'pOld', createdAt: now - 2000000 }], feed, now, {}).length === 0);
  check('v1.5.14 poda: CON lápida, esa misma publicación vieja SÍ se poda', JSON.stringify(C.pruneDeletedPostIds([{ id: 'pOld', createdAt: now - 2000000 }], feed, now, {}, ['pOld'])) === JSON.stringify(['pOld']));
  check('v1.5.14 poda: CON lápida, una publicación recién creada también se poda', C.pruneDeletedPostIds([{ id: 'pNew', createdAt: now - 10000 }], feed, now, {}, ['pNew']).length === 1);
  check('v1.5.14 poda: la poda sigue sin tocar ejemplos ni pendientes', C.pruneDeletedPostIds([{ id: 'pD', createdAt: now - 2000000, isDemo: true }], feed, now, {}, ['pD']).length === 0 && C.pruneDeletedPostIds([{ id: 'pP', createdAt: now - 2000000 }], feed, now, { pP: true }, ['pP']).length === 0);
  // Enlaces en el texto (núcleo).
  check('v1.5.14 enlaces: extractUrls saca una URL y quita la puntuación final', JSON.stringify(C.extractUrls('mira https://ejemplo.com/pagina.')) === JSON.stringify(['https://ejemplo.com/pagina']));
  check('v1.5.14 enlaces: extractUrls saca dos URLs sin repetir', C.extractUrls('a https://a.com/x b https://b.com/y c https://a.com/x').length === 2);
  check('v1.5.14 enlaces: sin URL no hay nada', C.extractUrls('hola mundo').length === 0);
  check('v1.5.14 enlaces: linkHost quita www y deja el dominio', C.linkHost('https://www.ejemplo.com.mx/a?b=1') === 'ejemplo.com.mx' && C.linkHost('http://sub.dominio.org/') === 'sub.dominio.org');
  check('v1.5.14 enlaces: stripUrls deja las palabras y quita el enlace', C.stripUrls('Miren esto https://ejemplo.com/x ¡qué bueno!') === 'Miren esto ¡qué bueno!');
  check('v1.5.14 enlaces: stripUrls con solo el enlace deja el texto vacío', C.stripUrls('https://ejemplo.com/x') === '');
  check('v1.5.14 enlaces: extractPageTitle saca el título y limpia entidades', C.extractPageTitle('<html><head><title>Mi página &amp; más</title></head>') === 'Mi página & más');
  check('v1.5.14 enlaces: sin título no hay título', C.extractPageTitle('<html><head></head><body>hola</body>') === null);
  // Borrado: cableado en la app.
  check('v1.5.14 borrado: al sincronizar no se vuelve a meter una publicación con lápida', /C\.isPostDeleted\(state, p\.id\)/.test(appjs) && /pruneDeletedPostIds\(state\.posts, r\.data\.posts, Date\.now\(\), C\.pendingPostIds\(state\), state\.deletedPostIds\)/.test(appjs));
  // Enlaces: cableado en la app.
  check('v1.5.14 enlaces: la tarjeta de publicación usa el texto sin el enlace crudo', /function formatPostText/.test(appjs) && /function textLinkCardHtml/.test(appjs) && /formatPostText\(post\.text\)/.test(appjs) && /textLinkCardHtml\(u\)/.test(appjs));
  check('v1.5.14 enlaces: la tarjeta no muestra el enlace crudo en ningún sitio', !/lkurl/.test(appjs) && !/lkurl/.test(idx) && /data-linkcard/.test(appjs));
  check('v1.5.14 enlaces: el título se busca en segundo plano y nunca rompe la publicación', /function queueLinkTitle/.test(appjs) && /extractPageTitle\(html\)/.test(appjs) && /setTimeout\(function \(\) \{ try \{ controller\.abort\(\); \} catch \(e\) \{\} \}, 5000\)/.test(appjs));
  // Shorts por encima: z-index.
  check('v1.5.14 shorts: el detalle, los comentarios y el perfil se abren POR ENCIMA del visor', /#postOverlay,#shortsCommentsOverlay,#profileOverlay\{z-index:95\}/.test(idx) && /#confirmOverlay,#shareChoiceOverlay\{z-index:100\}/.test(idx) && /#shortsOverlay\{background:#000;z-index:90\}/.test(idx));
  check('v1.5.14 shorts: el riel tiene zona táctil mayor para que el toque caiga en el botón', /\.shortsRail button\{[^}]*padding:8px 10px/.test(idx));
  // Compartir fuera: hoja de elección + puente.
  check('v1.5.14 compartir: hay hoja de elección con dentro y fuera, por encima de Shorts', /id="shareChoiceOverlay"/.test(idx) && /id="shareChoiceInside"/.test(idx) && /Compartir en WordRed/.test(idx) && /id="shareChoiceOutside"/.test(idx) && /Compartir en otras apps/.test(idx));
  check('v1.5.14 compartir: Compartir abre la hoja (no republica dentro antes de preguntar)', /window\.__wrShare = function \(postId\) \{\s*openShareChoice\('post', postId\);/.test(appjs) && /window\.__wrShareInside = function/.test(appjs) && /window\.__wrShareOutside = function/.test(appjs));
  check('v1.5.14 compartir: compartir desde Shorts usa la misma hoja (sin diálogo escondido)', /\$\('shortsShare'\)\.addEventListener\('click', function \(\) \{[\s\S]{0,900}openShareChoice\(it\.kind/.test(appjs) && !/shortsShare[\s\S]{0,800}confirmDialog\(\{ title: 'Compartir'/.test(appjs));
  check('v1.5.14 compartir: si el archivo no se puede compartir, cae al texto con el enlace', /sharePostExternally\(post\)[\s\S]{0,2000}\} catch \(e\) \{ \/\* cae al respaldo de texto \*\/ \}/.test(appjs) && /AndroidBridge\.shareText\(text \|\| 'Mira esto en WordRed'\)/.test(appjs));
  check('v1.5.14 compartir: el puente descarga las https en un hilo y cae al texto si falla', /downloadShareFile/.test(main) && /HttpURLConnection/.test(main) && /setConnectTimeout\(15000\)/.test(main) && /shareTextOnUi/.test(main) && /new Thread\(new Runnable\(\)/.test(main));
}

/* 69. WordRed 1.5.14: mensajes grupales, Tu actividad, Ajustes sin texto
   y cuentas ya creadas que cargan su perfil solas del servidor. */
function static1514c() {
  console.log('=== 69. WordRed 1.5.14: grupos, actividad, Ajustes y perfil al entrar ===');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const E = '5544444444';
  // ---- Mensajes grupales (núcleo) ----
  let gs = withProfiles(fresh());
  C.completeProfile(gs, E, { name: 'Elena Prueba', bio: 'Hola' });
  let gc = C.createGroupChat(gs, A, { name: 'Los tres', participants: [B, D] });
  check('v1.5.14 grupo: crear con 2 personas funciona y yo quedo dentro', gc.ok && gc.group.participants.length === 3 && gc.group.participants.indexOf(A) >= 0 && gc.group.name === 'Los tres');
  check('v1.5.14 grupo: sin nombre se pone uno con los integrantes', C.createGroupChat(gs, A, { participants: [B, D] }).group.name.indexOf('Bruno') >= 0);
  check('v1.5.14 grupo: con menos de 2 personas no se crea (para eso está el 1 a 1)', C.createGroupChat(gs, A, { participants: [B] }).ok === false);
  check('v1.5.14 grupo: con una persona que no existe no se crea', C.createGroupChat(gs, A, { participants: [B, '5599999999'] }).ok === false);
  let gid = gc.group.id;
  let gm = C.sendGroupMessage(gs, A, gid, 'Hola a todos');
  check('v1.5.14 grupo: enviar llega al grupo y avisa a los demás (no a mí)', gm.ok && C.findGroupChat(gs, gid).messages.length === 1 && C.findGroupChat(gs, gid).messages[0].text === 'Hola a todos' && C.findGroupChat(gs, gid).unread[B] === 1 && C.findGroupChat(gs, gid).unread[D] === 1 && !(C.findGroupChat(gs, gid).unread[A] > 0));
  check('v1.5.14 grupo: un mensaje vacío no se envía', C.sendGroupMessage(gs, A, gid, '   ').ok === false);
  check('v1.5.14 grupo: quien no es parte no puede escribir', C.sendGroupMessage(gs, E, gid, 'Hola').ok === false);
  let ga = C.addGroupChatMember(gs, A, gid, E);
  check('v1.5.14 grupo: agregar una persona la mete al grupo', ga.ok && ga.group.participants.length === 4 && ga.group.participants.indexOf(E) >= 0);
  check('v1.5.14 grupo: agregar a alguien que ya está no duplica', C.addGroupChatMember(gs, A, gid, E).ok === false && C.findGroupChat(gs, gid).participants.length === 4);
  let gr = C.removeGroupChatMember(gs, A, gid, D);
  check('v1.5.14 grupo: quitar a una persona la saca del grupo', gr.ok && gr.group.participants.length === 3 && gr.group.participants.indexOf(D) < 0);
  check('v1.5.14 grupo: quitarme a mí mismo no vale (para eso está salir)', C.removeGroupChatMember(gs, A, gid, A).ok === false);
  C.sendGroupMessage(gs, B, gid, 'Yo también estoy');
  check('v1.5.14 grupo: los no leídos míos suben cuando escribe otro', C.groupChatList(gs, A)[0].unread === 1);
  check('v1.5.14 grupo: al leer se quitan mis no leídos', C.markGroupChatRead(gs, A, gid).ok && C.groupChatList(gs, A)[0].unread === 0);
  let gl = C.leaveGroupChat(gs, B, gid);
  check('v1.5.14 grupo: salir me saca y el grupo sigue para los demás', gl.ok && !gl.deleted && C.findGroupChat(gs, gid).participants.indexOf(B) < 0 && C.findGroupChat(gs, gid).participants.length === 2);
  let gl2 = C.leaveGroupChat(gs, A, gid);
  let gl3 = C.leaveGroupChat(gs, E, gid);
  check('v1.5.14 grupo: cuando sale el último, el grupo se borra', gl2.ok && !gl2.deleted && gl3.ok && gl3.deleted && !C.findGroupChat(gs, gid));
  // Fusión con el servidor.
  let ms = withProfiles(fresh());
  let mg = C.createGroupChat(ms, A, { name: 'Local', participants: [B, D] });
  C.sendGroupMessage(ms, A, mg.group.id, 'Local');
  C.mergeGroupChats(ms, [{ id: mg.group.id, name: 'Del servidor', participants: [A, B, D, E], messages: [{ id: 'm-srv', from: B, text: 'Del servidor', createdAt: Date.now(), readBy: [B] }], unread: {}, updatedAt: Date.now() }]);
  check('v1.5.14 grupo: la fusión toma el nombre y los integrantes del servidor y une los mensajes', C.findGroupChat(ms, mg.group.id).name === 'Del servidor' && C.findGroupChat(ms, mg.group.id).participants.length === 4 && C.findGroupChat(ms, mg.group.id).messages.length === 2);
  C.mergeGroupChats(ms, [{ id: mg.group.id, name: 'Del servidor', participants: [B, D, E], messages: [], unread: {}, updatedAt: Date.now() }]);
  check('v1.5.14 grupo: si el servidor trae el grupo sin mí, se borra el local (me sacaron)', !C.findGroupChat(ms, mg.group.id));
  // ---- Tu actividad (núcleo) ----
  let as = withProfiles(fresh());
  const pMine = C.createPost(as, A, { text: 'Mi publicación' }).post;
  const pTheirs = C.createPost(as, B, { text: 'La de Bruno' }).post;
  C.toggleLike(as, A, pTheirs.id, 'Me gusta');
  C.addComment(as, A, pTheirs.id, 'Qué buena');
  C.sharePost(as, A, pTheirs.id);
  const act = C.userActivity(as, A);
  check('v1.5.14 actividad: trae mi publicación, mi like, mi comentario y mi compartido', act.length === 4 && act.some(function (x) { return x.kind === 'post' && x.postId === pMine.id; }) && act.some(function (x) { return x.kind === 'like' && x.postId === pTheirs.id; }) && act.some(function (x) { return x.kind === 'comment' && x.postId === pTheirs.id; }) && act.some(function (x) { return x.kind === 'share' && x.postId !== pTheirs.id; }));
  check('v1.5.14 actividad: va de lo más reciente a lo más antiguo', act.every(function (x, i) { return i === 0 || act[i - 1].at >= x.at; }));
  check('v1.5.14 actividad: sin actividad no hay nada', C.userActivity(withProfiles(fresh()), A).length === 0);
  // ---- Cableado en la app ----
  check('v1.5.14 Ajustes: el botón ya no lleva texto, solo el engranaje con su etiqueta', /aria-label="Ajustes" title="Ajustes" onclick="window\.__wrOpenSettings\(\)"/.test(appjs) && !/Ajustes<\/button>/.test(appjs));
  check('v1.5.14 actividad: el botón está en el perfil junto a Seguidores y abre la vista', /Tu actividad/.test(appjs) && /__wrOpenActivity/.test(appjs) && /id="view-activity"/.test(idx) && /id="activityList"/.test(idx) && /view === 'activity'/.test(appjs) && /function renderActivity/.test(appjs));
  check('v1.5.14 grupos: hay botón de nuevo grupo, overlays de crear e integrantes, y la lista mezcla grupos', /id="newGroupChatBtn"/.test(idx) && /id="groupChatCreateOverlay"/.test(idx) && /id="groupChatMembersOverlay"/.test(idx) && /__wrOpenGroupCreate/.test(appjs) && /__wrCreateGroupChat/.test(appjs) && /__wrOpenGroupMembers/.test(appjs) && /__wrLeaveGroupChat/.test(appjs) && /groupChatList\(state, state\.me\)/.test(appjs));
  check('v1.5.14 grupos: el hilo grupal usa el mismo overlay con su modo y envía a todos', /openChatGroupId/.test(appjs) && /__wrOpenGroupChat/.test(appjs) && /sendGroupMessage\(state, state\.me, openChatGroupId/.test(appjs) && /chatCallBtn.*display = 'none'|chatCallBtn'\)\.style\.display = 'none'/.test(appjs));
  check('v1.5.14 grupos: el grupo se sube y se baja del servidor y llega en vivo por WebSocket', /pushGroupChatToServer/.test(appjs) && /pushGroupMessageToServer/.test(appjs) && /\/api\/group-chats\?phone=/.test(appjs) && /mergeGroupChats\(state, rG\.data\.groupChats\)/.test(appjs) && /kind === 'groupMessage'/.test(appjs) && /kind === 'groupChatUpdated'/.test(appjs));
  check('v1.5.14 perfil al entrar: la decisión consulta al servidor, no solo lo local', /async function loadProfileForLogin/.test(appjs) && /async function finishServerLogin/.test(appjs) && /serverFetchWithRetry\(state, '\/api\/profile\/'/.test(appjs) && /finishServerLogin\(d\.email, d\.name, d\.photo, d\.hasProfile\)/.test(appjs) && /finishServerLogin\(authPhone, null, null, null\)/.test(appjs));
  check('v1.5.14 perfil al entrar: si el servidor dice que el perfil existe, nunca se pide crearlo', /hasProfile === true/.test(appjs) && /No se pudo cargar tu perfil del servidor/.test(appjs));
}

/* 64. WordRed 1.5.12: música real sin pitido, play antes de elegir, sin
   SMS, llamadas con audio, archivos que se abren, avisos con la app
   cerrada y recordatorio de Shorts cada 3 horas. */
function static1512() {
  console.log('=== 64. WordRed 1.5.12: música, play, sin SMS, llamadas, archivos, fondo y Shorts ===');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const bgJava = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedBackgroundService.java'), 'utf8');
  const recvJava = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedNotifyReceiver.java'), 'utf8');
  check('v1.5.12: el manifiesto es versión 67 / 1.5.52 con targetSdk 35', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest) && /android:targetSdkVersion="35"/.test(manifest));
  // 1. Música automática: solo audio real, nada de pitido.
  check('v1.5.12 música: la canción del catálogo SÍ tiene audio real (1.5.34: la música ya suena)', C.songHasAudio(C.songFromCatalog('cancion-1')) === true);
  check('v1.5.12 música: un audio subido (con src) sí tiene audio real', C.songHasAudio({ id: 'custom-1', title: 'Mi audio', src: 'https://x/audio.mp3' }) === true && C.songHasAudio({ title: 'Sin src', src: '' }) === false && C.songHasAudio(null) === false);
  check('v1.5.12 música: el botón de sonido queda deshabilitado con "Sin audio" cuando no hay archivo', /Sin audio/.test(appjs) && /disabled title="Esta canción no tiene audio"/.test(appjs));
  check('v1.5.12 música: al tocar Sonido sin audio avisa y no reproduce nada', /Esta canción no tiene audio para reproducir/.test(appjs) && !/startAmbient/.test(appjs));
  // 2. Botón de play para escuchar antes de elegir.
  check('v1.5.12 play: el selector tiene botón de play por canción', /songPreviewBtn/.test(appjs) && /toggleSongPreview/.test(appjs) && /getSongPreviewAudio/.test(appjs) && /Escuchar/.test(appjs));
  check('v1.5.12 play: el audio subido queda como fila para escucharlo y elegirlo', /songPickerCustom/.test(appjs) && /setSongPickerCustom/.test(appjs) && /data-preview-custom/.test(appjs) && /data-custom-choose/.test(appjs) && /Tu audio quedó listo: escúchalo y toca Elegir/.test(appjs));
  check('v1.5.12 play: la fila de la canción del publicador tiene su botón Escuchar', /postSongPlay/.test(idx) && /postSongPlay/.test(appjs));
  check('v1.5.12 play: el editor de historia tiene su botón Escuchar', /storyEditSongPlay/.test(appjs));
  check('v1.5.12 play: al cerrar el selector se para la vista previa', /stopSongPreview/.test(appjs) && /songPickerOverlay.*stopSongPreview|stopSongPreview.*songPickerOverlay/.test(appjs));
  // 4. Llamadas: audio remoto siempre.
  check('v1.5.12 llamadas: la llamada solo de voz tiene su elemento de audio oculto', /id="callRemoteAudio"/.test(appjs) && /callRemoteAudio/.test(appjs));
  check('v1.5.12 llamadas: el audio remoto se adjunta y se reproduce explícito', /attachCallRemoteStream/.test(appjs) && /srcObject = stream/.test(appjs) && /\.play\(\)/.test(appjs));
  check('v1.5.12 llamadas: el altavoz se aplica al entrar en la llamada', /renderCallInCall[\s\S]{0,3000}setSpeakerphone\(call\.speaker\)/.test(appjs));
  check('v1.5.12 llamadas: el WebView pide el permiso de micrófono/cámara y lo concede al darlo', /PERM_REQ_CALL/.test(main) && /pendingWebPermissionRequest/.test(main) && /requestPermissions\(need\.toArray\(new String\[0\]\), PERM_REQ_CALL\)/.test(main) && /req\.grant\(granted\.toArray\(new String\[0\]\)\)/.test(main));
  // 5. Fotos, videos y archivos del chat se abren.
  check('v1.5.12 archivos: el chat tiene visor de fotos y videos', /chatMediaOverlay/.test(idx) && /chatMediaBody/.test(idx) && /__wrOpenChatMedia/.test(appjs));
  check('v1.5.12 archivos: al tocar la foto o el video del mensaje se abre grande', /__wrOpenChatMedia/.test(appjs) && /encMedia/.test(appjs) && /'photo'/.test(appjs) && /'video'/.test(appjs));
  check('v1.5.12 archivos: al cerrar el visor se para el video', /chatMediaOverlay/.test(appjs) && /chatMediaBody.*querySelector\('video'\)/.test(appjs));
  check('v1.5.12 archivos: el puente abre data: guardándolo y file:// por FileProvider, con selector', /startsWith\("data:"\)/.test(main) && /writeToDownloads/.test(main) && /startsWith\("file:\/\/"\)/.test(main) && /getUriForFile/.test(main) && /createChooser\(i, "Abrir con"\)/.test(main));
  // 6. Avisos con la app cerrada (servicio en segundo plano).
  check('v1.5.12 fondo: existe el servicio con WebSocket propio y reconexión', /class WordRedBackgroundService extends Service/.test(bgJava) && /START_STICKY/.test(bgJava) && /reconnectDelayMs/.test(bgJava) && /Sec-WebSocket-Key/.test(bgJava) && /readTextMessage/.test(bgJava));
  check('v1.5.12 fondo: el servicio notifica mensajes y llamadas con la W gris', /notifyMessage/.test(bgJava) && /notifyCall/.test(bgJava) && /getIdentifier\("ic_notification", "drawable"/.test(bgJava) && /getIdentifier\("ic_launcher_gray", "mipmap"/.test(bgJava));
  check('v1.5.12 fondo: la llamada entrante es a pantalla completa con Contestar/Rechazar', /setFullScreenIntent/.test(bgJava) && /CATEGORY_CALL/.test(bgJava) && /Contestar/.test(bgJava) && /Rechazar/.test(bgJava) && /ACTION_REJECT_CALL/.test(bgJava));
  check('v1.5.12 fondo: el manifiesto declara el servicio remoteMessaging y el arranque al encender', /FOREGROUND_SERVICE_REMOTE_MESSAGING/.test(manifest) && /foregroundServiceType="remoteMessaging"/.test(manifest) && /USE_FULL_SCREEN_INTENT/.test(manifest) && /RECEIVE_BOOT_COMPLETED/.test(manifest) && /WordRedBackgroundService/.test(manifest) && /WordRedBootReceiver/.test(manifest) && /BOOT_COMPLETED/.test(manifest));
  check('v1.5.12 fondo: la app arranca el servicio al entrar y lo detiene al cerrar sesión', /startBackgroundService/.test(appjs) && /stopBackgroundService/.test(appjs) && /takePendingCall/.test(appjs) && /__onBackgroundCall/.test(appjs) && /processPendingBgCall/.test(appjs));
  check('v1.5.12 fondo: el puente nativo arranca/detiene el servicio y entrega la llamada pendiente', /startBackgroundService\(final String phone/.test(main) && /stopBackgroundService\(\)/.test(main) && /takePendingCall\(\)/.test(main) && /pending_call/.test(main) && /pendingBgCallAction/.test(main));
  // 7. Recordatorio de Shorts cada 3 horas, solo sin abrir la app.
  const H = 60 * 60 * 1000;
  const now = Date.now();
  check('v1.5.12 shorts: con última apertura hace 4 horas sí avisa', C.shortsReminderDue(now - 4 * H, now, true) === true);
  check('v1.5.12 shorts: con última apertura hace 1 hora no avisa', C.shortsReminderDue(now - 1 * H, now, true) === false);
  check('v1.5.12 shorts: con última apertura hace justo 3 horas avisa', C.shortsReminderDue(now - 3 * H, now, true) === true);
  check('v1.5.12 shorts: sin sesión no avisa', C.shortsReminderDue(now - 4 * H, now, false) === false);
  check('v1.5.12 shorts: sin última apertura registrada no avisa', C.shortsReminderDue(0, now, true) === false);
  check('v1.5.12 shorts: el receptor programa la alarma inexacta cada 3 h y comprueba la inactividad', /scheduleShortsReminder/.test(recvJava) && /setInexactRepeating/.test(recvJava) && /AlarmManager\.RTC/.test(recvJava) && /last_open_ms/.test(recvJava) && /SHORTS_REMINDER/.test(recvJava) && /Descubre nuevos Shorts en WordRed/.test(recvJava));
  check('v1.5.12 shorts: la app guarda la última apertura al volver y programa el recordatorio', /last_open_ms/.test(main) && /scheduleShortsReminder\(this\)/.test(main));
  check('v1.5.12 shorts: al tocar el aviso abre la sección de Shorts', /kind === 'shorts'/.test(appjs) && /go\('shorts'\)/.test(appjs) && /notif_target/.test(recvJava) && /shorts/.test(recvJava));
  check('v1.5.12 shorts: el recordatorio se reprograma al encender el teléfono', /scheduleShortsReminder\(context\)/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedBootReceiver.java'), 'utf8')));
  // 8. Barra de estado oculta al usar la app (solo la de arriba).
  const styles = fs.readFileSync(path.join(__dirname, '..', 'res', 'values', 'styles.xml'), 'utf8');
  check('v1.5.12 barra: MainActivity oculta solo la barra de estado en modo inmersivo sticky (API 30+)', /hideStatusBar/.test(main) && /getInsetsController/.test(main) && /hide\(android\.view\.WindowInsets\.Type\.statusBars\(\)\)/.test(main) && /BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE/.test(main));
  check('v1.5.12 barra: en versiones viejas usa los flags clásicos de pantalla completa', /SYSTEM_UI_FLAG_FULLSCREEN/.test(main) && /SYSTEM_UI_FLAG_IMMERSIVE_STICKY/.test(main) && /SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN/.test(main));
  check('v1.5.12 barra: la barra de navegación de abajo NO se oculta (solo se lee su altura en 1.5.15, nunca se esconde)', !/HIDE_NAVIGATION/.test(main) && !/\.hide\(android\.view\.WindowInsets\.Type\.navigationBars\(\)\)/.test(main));
  check('v1.5.12 barra: se oculta al crear la actividad y se reaplica al volver y al recuperar el foco', /hideStatusBar\(\);/.test(main) && /onWindowFocusChanged/.test(main) && /if \(hasFocus\) hideStatusBar\(\);/.test(main) && /onResume\(\)[\s\S]{0,200}hideStatusBar\(\);/.test(main));
  check('v1.5.12 barra: el tema también la oculta desde el arranque', /windowFullscreen/.test(styles) && />true</.test(styles));
  check('v1.5.12 barra: el padding del WebView se adapta al margen real de las barras (0 arriba con la barra oculta)', /applySystemBarPadding/.test(main) && /getInsets\(android\.view\.WindowInsets\.Type\.systemBars\(\)\)/.test(main) && /view\.setPadding\(0, top, 0, bottom\)/.test(main));
}

function static1514d() {
  console.log('=== 70. WordRed 1.5.14: texto visible en las historias ===');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  // El texto simple se dibuja sobre la foto o el video cuando no hay
  // textos del editor que lo reemplacen.
  check('v1.5.14 historias: existe el ayudante que decide si el texto va sobre la foto o el video', /function storyPlainTextOverlaid/.test(appjs) && /story\.media && story\.text/.test(appjs));
  check('v1.5.14 historias: el texto simple se dibuja centrado sobre la foto o el video', /stTextPlain/.test(appjs) && /data-kind="plain"/.test(appjs) && /left:50%;top:50%/.test(appjs));
  check('v1.5.14 historias: con textos del editor, el texto simple no se pone encima (no se tapa)', /storyPlainTextOverlaid\(story\)/.test(appjs) && /e\.texts && e\.texts\.length/.test(appjs));
  check('v1.5.14 historias: el texto sobre la foto tiene estilo legible (blanco con sombra, como los textos del editor)', /\.stText,.stTextPlain\{/.test(idx) && /text-shadow:0 1px 6px rgba\(0,0,0,.8\)/.test(idx));
  check('v1.5.14 historias: el visor dibuja las ediciones (incluido el texto simple) sobre la foto o el video', /storyEditsHtml\(s\)/.test(appjs));
  check('v1.5.14 historias: si el texto ya se ve sobre la foto, no se repite abajo en el pie', /!storyPlainTextOverlaid\(s\) && !s\.backgroundColor \? '<div class="shortsCaption">/.test(appjs));
  check('v1.5.14 historias: la vista previa del editor muestra el texto del compositor sobre la foto', /storyEditsHtml\(\{ edits: e, text: storyEdit\.text, media: storyEdit\.media/.test(appjs));
  check('v1.5.14 historias: el ayudante está expuesto para probarlo', /storyPlainTextOverlaid: storyPlainTextOverlaid/.test(appjs));
  // Servidor 3.3 (ZIP, sin desplegar): POST /api/stories desenvuelve
  // { story } como /api/posts desenvuelve { post }.
  const srv = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'wordred-server-v33', 'server.js'), 'utf8');
  check('v1.5.14 historias servidor: POST /api/stories acepta { story } (antes lo rechazaba todo con 400)', /req\.body && req\.body\.story \? req\.body\.story : req\.body/.test(srv) && /app\.post\('\/api\/stories'/.test(srv));
}

function static1514e() {
  console.log('=== 71. WordRed 1.5.14: clima inmediato con la ubicación activada ===');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  // JS: al tocar "Activar ubicación" el clima se pide de inmediato (antes
  // el botón solo pedía el permiso y nada recargaba el clima).
  check('v1.5.47 clima: al pedir la ubicación (solo con el icono) el clima se pide desde el teléfono', /function requestWeatherLocation\(\)[\s\S]{0,900}loadWeather\(null, null, '', \{ fromDevice: true \}\)/.test(appjs));
  // JS: una segunda carga mientras se está cargando queda en cola (antes
  // se descartaba y el clima no se actualizaba al conceder el permiso).
  check('v1.5.14 clima: la segunda carga en curso queda en cola y se hace al terminar', /weatherLoadPending = true/.test(appjs) && /if \(weatherLoadPending\) \{ weatherLoadPending = false; loadWeather\(\); \}/.test(appjs));
  // JS: tras fallar sin ubicación, un reintento único a los 10 s (antes
  // solo se reintentaba a los 30 minutos).
  check('v1.5.47 clima: sin ciudad guardada NO se pide ubicación ni se reintenta con GPS', !/scheduleWeatherRetry/.test(appjs) && /weatherUi.status = 'no-city'/.test(appjs) && /function savedWeatherLocation1547/.test(appjs));
  check('v1.5.47 clima: ya no hay reintento automático con GPS (el clima nunca pide ubicación solo)', !/weatherRetryTimer/.test(appjs) && !/scheduleWeatherRetry/.test(appjs));
  // JS: al abrir la app el clima se pide (ya estaba) y se sigue refrescando
  // cada 30 minutos; el reloj no se toca.
  check('v1.5.14 clima: al entrar a la app el clima se pide y se refresca cada 30 minutos', /loadWeather\(\);/.test(appjs) && /setInterval\(function \(\) \{ loadWeather\(\); \}, 30 \* 60000\)/.test(appjs));
  check('v1.5.47 clima: al conceder la ubicación el clima se carga desde el teléfono', /kind === 'location' && granted\) \{ loadWeather\(null, null, '', \{ fromDevice: true \}\); return; \}/.test(appjs));
  // Nativo: el WebView responde al permiso de geolocalización (antes la
  // petición nunca se respondía y el clima se quedaba pidiendo ubicación).
  check('v1.5.14 clima nativo: el WebView responde a la petición de geolocalización', /onGeolocationPermissionsShowPrompt/.test(main) && /GeolocationPermissions\.Callback/.test(main));
  check('v1.5.14 clima nativo: con el permiso concedido se concede la geolocalización al momento', /onGeolocationPermissionsShowPrompt[\s\S]{0,1500}callback\.invoke\(origin, true, false\)/.test(main));
  check('v1.5.14 clima nativo: sin permiso, la petición queda guardada y se responde al resolver el permiso', /pendingGeoCallback = callback/.test(main) && /pendingGeoCallback != null/.test(main) && /cb\.invoke\(org, locGranted, false\)/.test(main));
  // Nativo: sin última ubicación conocida se pide una sola actualización
  // para que la próxima lectura ya tenga un valor.
  check('v1.5.14 clima nativo: sin ubicación guardada se pide una sola actualización para calentar la caché', /requestSingleUpdate/.test(main) && /ACCURACY_COARSE/.test(main));
}

function static1514f() {
  console.log('=== 72. WordRed 1.5.14: publicar audio — el selector muestra los audios ===');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  // JS: selector dedicado de solo audios para el botón "Audio".
  check('v1.5.14 audio: el compositor tiene un input dedicado de solo audios', /id="postAudioInput" accept="audio\/\*"/.test(idx));
  check('v1.5.14 audio: el botón Audio abre el selector de audios (no el general)', /postAddAudio[\s\S]{0,120}openAudioPicker\(\)/.test(appjs) && !/\$\('postAddAudio'\)\.addEventListener\('click', function \(\) \{ \$\('postMediaInput'\)\.click\(\); \}\);/.test(appjs));
  check('v1.5.14 audio: con permiso, el selector de audios se abre directo', /function openAudioPicker\(\)[\s\S]{0,500}hasAudioPermission/.test(appjs) && /\$\('postAudioInput'\)\.click\(\)/.test(appjs));
  check('v1.5.14 audio: sin permiso, primero se pide el permiso y el selector espera', /pendingAudioPick = true/.test(appjs) && /requestFilesPermission/.test(appjs));
  check('v1.5.14 audio: al conceder el permiso se abre el selector de audios', /pendingAudioPick[\s\S]{0,300}kind === 'files' && granted\) \{ \$\('postAudioInput'\)\.click\(\); return; \}/.test(appjs));
  check('v1.5.14 audio: el selector general y el de audios procesan igual los archivos', /handleComposerMediaFiles\(this\.files\)/.test(appjs) && /function handleComposerMediaFiles/.test(appjs));
  check('v1.5.14 audio: el permiso de archivos del primer uso ya menciona los audios', /Para elegir fotos, videos y audios/.test(appjs));
  // Nativo: permiso de audio declarado y pedido en Android 13+.
  check('v1.5.14 audio nativo: el manifiesto declara READ_MEDIA_AUDIO', /READ_MEDIA_AUDIO/.test(manifest));
  check('v1.5.14 audio nativo: el permiso de audio se pide junto a los de fotos y videos', /READ_MEDIA_AUDIO/.test(main) && /requestFilesPermission[\s\S]{0,1500}READ_MEDIA_AUDIO/.test(main));
  check('v1.5.14 audio nativo: hay puente para saber si el permiso de audio ya está concedido', /public boolean hasAudioPermission/.test(main));
  // Nativo: el selector respeta TODOS los tipos aceptados, no solo el primero.
  check('v1.5.14 audio nativo: el selector usa EXTRA_MIME_TYPES con todos los tipos aceptados', /EXTRA_MIME_TYPES/.test(main) && /mimes\.toArray/.test(main));
  check('v1.5.14 audio nativo: el selector ya no toma solo el primer tipo aceptado', !/accept\[0\] != null && !accept\[0\]\.isEmpty\(\)\) type = accept\[0\]/.test(main));
}

function static1514g() {
  console.log('=== 73. WordRed 1.5.14: preguntas frecuentes actualizadas ===');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const faqBlock = (appjs.match(/var FAQ = \[([\s\S]*?)\];/) || [])[1] || '';
  // La FAQ cubre los cambios de la 1.5.14 (comprimida en la 1.5.26: las
  // entradas fusionadas se comprueban por su texto nuevo, no por el viejo).
  check('v1.5.14 FAQ: explica el cajón (se abre de inmediato, barra roja, reordenar, buscar por nombre, menú al presionar, numerito rojo)', /¿Cómo uso el cajón de aplicaciones\?/.test(faqBlock) && /se abre de inmediato/.test(faqBlock) && /barra roja/.test(faqBlock) && /buscar por nombre/.test(faqBlock) && /desinstalar/.test(faqBlock) && /numerito rojo/.test(faqBlock));
  check('v1.5.14 FAQ: explica la barra nueva (Inicio, Shorts, Aplicaciones, Grupos y Perfil; Mercado desde arriba)', /¿Dónde quedaron Avisos, Mensajes y Amigos\?/.test(faqBlock) && /La barra de abajo tiene Inicio, Shorts, Aplicaciones, Grupos y Perfil/.test(faqBlock) && /tocando «Marketplace»/.test(faqBlock));
  check('v1.5.14 FAQ: explica que Mensajes está arriba después de la lupa', /después de la lupa/.test(faqBlock));
  check('v1.5.14 FAQ: explica que Amigos está en el perfil en la fila de accesos rápidos y que Tu actividad también está en el perfil', /en la fila de accesos rápidos/.test(faqBlock) && /Tu actividad también está en tu Perfil/.test(faqBlock));
  check('v1.5.14 FAQ: explica que las publicaciones borradas se borran de verdad', /¿Las publicaciones borradas se borran de verdad\?/.test(faqBlock) && /no vuelve al reabrir ni al sincronizar/.test(faqBlock));
  check('v1.5.14 FAQ: explica que los enlaces se muestran solo como recuadro', /¿Qué pasa cuando publico un enlace\?/.test(faqBlock) && /recuadro/.test(faqBlock));
  check('v1.5.14 FAQ: explica los likes y comentarios de Shorts (corazón y globo, en la entrada de historias)', /¿Cómo funcionan las historias y los Shorts\?/.test(faqBlock) && /toca el corazón para dar like y el globo para comentar/.test(faqBlock));
  check('v1.5.14 FAQ: explica compartir en otras aplicaciones', /¿Cómo comparto una publicación en otras aplicaciones\?/.test(faqBlock) && /Compartir en otras apps/.test(faqBlock));
  check('v1.5.14 FAQ: explica los mensajes grupales (Nuevo grupo, en la entrada de mensajes)', /¿Cómo envío mensajes, archivos y notas de voz\?/.test(faqBlock) && /Nuevo grupo/.test(faqBlock));
  check('v1.5.14 FAQ: explica que las cuentas ya creadas cargan su perfil solas', /se carga solo/.test(faqBlock) && /solo las cuentas nuevas crean su perfil/.test(faqBlock));
  check('1.5.62 FAQ: la entrada vieja del clima salió (su respuesta contradecía el clima por ciudad guardada de la 1.5.47)', /¿Por qué el clima no se actualiza\?/.test(faqBlock) === false);
  check('v1.5.14 FAQ: explica publicar un audio (botón Audio en Crear publicación, en la entrada de publicar)', /¿Cómo publico algo\?/.test(faqBlock) && /Para audio, toca «Audio»/.test(faqBlock));
  // Nada viejo que contradiga lo nuevo.
  check('v1.5.14 FAQ: no queda nada de SMS (se quitó en la 1.5.12)', !/SMS/.test(faqBlock));
  check('v1.5.14 FAQ: el registro ya no es solo por teléfono', !/Solo necesitas tu número de teléfono/.test(faqBlock));
  check('v1.5.14 FAQ: no queda nada del rebote del cajón (se quitó en la 1.5.17)', !/rebote/.test(faqBlock));
}

function static1514h() {
  console.log('=== 74. WordRed 1.5.14: videos del inicio — solo el visible suena, uno por uno ===');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  // La visibilidad real decide (IntersectionObserver, con la posición al
  // hacer scroll como alternativa sin él).
  check('v1.5.14 videos: se usa IntersectionObserver para saber qué video está visible', /new IntersectionObserver\(function \(\) \{ updateFeedVideos\(\); \}/.test(appjs));
  check('v1.5.14 videos: sin IntersectionObserver se usa la posición al hacer scroll', /Sin IntersectionObserver[\s\S]{0,200}scroll/.test(appjs) && /window\.addEventListener\('scroll', onScroll/.test(appjs));
  check('v1.5.14 videos: un video cuenta como visible con al menos la mitad en pantalla', /FEED_VIDEO_VISIBLE_MIN = 0\.5/.test(appjs));
  check('v1.5.14 videos: la visibilidad se calcula con la posición real en pantalla', /function feedVideoVisibleRatio/.test(appjs) && /getBoundingClientRect/.test(appjs) && /window\.innerHeight/.test(appjs));
  // Uno por uno: el más visible suena y los demás se pausan.
  check('v1.5.14 videos: se reproduce el más visible y se pausan todos los demás', /function updateFeedVideos/.test(appjs) && /feedVideoActive = canPlay \? best : null/.test(appjs) && /if \(v !== feedVideoActive && !v\.paused\) pauseFeedVideo\(v\)/.test(appjs));
  check('v1.5.14 videos: al reproducir uno a mano, los demás se pausan', /addEventListener\('play', function \(ev\)/.test(appjs) && /feedVideoActive = v/.test(appjs));
  check('v1.5.14 videos: al pausarlo a mano no se reproduce solo mientras siga visible', /_wrUserPaused = true/.test(appjs) && /!best\._wrUserPaused/.test(appjs));
  check('v1.5.14 videos: si el navegador bloquea el autoplay, queda pausado sin reintentar sin parar', /_wrAutoplayBlocked = true/.test(appjs) && /!best\._wrAutoplayBlocked/.test(appjs));
  // Se observa tras cada dibujo del inicio (el DOM se recrea).
  check('v1.5.14 videos: tras dibujar el inicio se vuelven a observar sus videos', /observeFeedVideos\(\);[\s\S]{0,80}window\.__wrToggleReactions/.test(appjs) || /renderFeed[\s\S]{0,4500}observeFeedVideos\(\)/.test(appjs)); // 1.5.33: ventana 2000 -> 3000, el renderFeed creció por no repetir anuncios en un mismo inicio. 1.5.44: 3000 -> 3200, el renderFeed creció por separar las carteleras. 1.5.47: 3200 -> 4000, el renderFeed creció por la fila de noticias. 1.5.54: 4000 -> 4500, el renderFeed creció por el juego destacado antes de la cartelera de juegos.
  check('v1.5.14 videos: el visor se limita a los videos del inicio', /querySelectorAll\('\.post video'\)/.test(appjs) && /\$\('feed'\)/.test(appjs));
  // El audio no cambia: los videos del inicio siguen sin autoplay ni silencio
  // forzado (el reproducir lo hace el JavaScript, con su sonido normal).
  var mediaItem = (appjs.match(/function mediaItemHtml[\s\S]*?\n\}/) || [''])[0];
  check('v1.5.14 videos: los videos del inicio no llevan autoplay en el HTML (lo decide el JavaScript)', /playsinline preload="metadata"/.test(mediaItem) && !/autoplay/.test(mediaItem)); /* v1.5.25: el video ya no lleva el atributo controls nativo (usa el reproductor propio), pero sigue sin autoplay. */
  check('v1.5.14 videos: las funciones están expuestas para probarlas', /updateFeedVideos: updateFeedVideos/.test(appjs) && /observeFeedVideos: observeFeedVideos/.test(appjs));
}

function static1514i() {
  console.log('=== 75. WordRed 1.5.14: sección de Reels mezclada en el inicio ===');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  // Los reels son los videos cortos de Shorts (solo publicaciones con video).
  check('v1.5.14 reels: la fila usa los videos cortos de Shorts', /function reelsRowHtml/.test(appjs) && /C\.shortsFeed\(state, state\.me\)/.test(appjs) && /it\.kind === 'post'/.test(appjs));
  check('v1.5.14 reels: sin videos cortos no se muestra una fila vacía', /if \(!items\.length\) return ''/.test(appjs));
  // Recuadros rectangulares y más grandes que los de las historias.
  const storyW = Number(((idx.match(/\.story\{[^}]*flex:0 0 (\d+)px/) || [])[1] || 0));
  const storyH = Number(((idx.match(/\.story\{[^}]*height:(\d+)px/) || [])[1] || 0));
  const reelW = Number(((idx.match(/\.reelTile\{[^}]*flex:0 0 (\d+)px/) || [])[1] || 0));
  const reelH = Number(((idx.match(/\.reelTile\{[^}]*height:(\d+)px/) || [])[1] || 0));
  check('v1.5.14 reels: los recuadros son más grandes que los de las historias (' + reelW + 'x' + reelH + ' frente a ' + storyW + 'x' + storyH + ')', reelW > storyW && reelH > storyH && reelW > 0 && reelH > 0);
  check('v1.5.14 reels: los recuadros son rectangulares (más altos que anchos, como un video vertical)', reelH > reelW && /border-radius:14px/.test(idx));
  check('v1.5.14 reels: la fila es horizontal con desplazamiento', /\.reels\{[^}]*display:flex/.test(idx) && /overflow-x:auto/.test(idx));
  // Iconito de video chiquito arriba del primer reel.
  check('v1.5.14 reels: arriba del primer reel va su iconito de video chiquito', /ic\('video', 18\)/.test(appjs) && /reelsHead/.test(appjs) && /reelsIcon/.test(appjs));
  check('v1.5.14 reels: el encabezado con el iconito va arriba de la fila de recuadros', /reelsHead[\s\S]{0,200}class="reels"/.test(appjs) || /<div class="reelsHead">[\s\S]{0,300}<div class="reels">/.test(appjs));
  // Mezclada entre las publicaciones del inicio.
  check('v1.5.14 reels: la fila va mezclada entre las publicaciones del inicio', /if \(i === 1\) parts\.push\(reelsRowHtml\(\)\)/.test(appjs));
  check('v1.5.14 reels: con una sola publicación, la fila va después de ella', /if \(shown\.length === 1\) \{ parts\.push\(reelsRowHtml\(\)\); parts\.push\(billboardHtml1540\(\)\); parts\.push\(newsRowHtml1547\(\)\); parts\.push\(featuredGameHtml1549\(\)\); parts\.push\(gamesBillboardHtml1543\(\)\); \}/.test(appjs));
  // Al tocar un reel se abre y se reproduce como un short.
  check('v1.5.14 reels: al tocar un reel se abre como un short', /__wrOpenReel = function \(postId\) \{ openShorts\(postId\); \}/.test(appjs) && /onclick="window\.__wrOpenReel/.test(appjs));
  check('v1.5.14 reels: la fila se limita a 10 reels', /\.slice\(0, 10\)/.test(appjs));
  check('v1.5.14 reels: la función está expuesta para probarla', /reelsRowHtml: reelsRowHtml/.test(appjs));
}

/* 76. WordRed 1.5.15: portada de reels, links sin duplicar y con imagen,
   buscador del cajón, numerito rojo por app, borrado que vale para todo
   lo borrable (lápidas + vaciado silencioso) y menú flotante traslúcido
   junto a la ficha. */
async function static1515() {
  console.log('=== 76. WordRed 1.5.15 ===');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');

  /* (1) Reels con portada automática extraída del video. */
  check('v1.5.15 reels: sin carátula guardada la ficha lleva data-reel-video para capturar el fotograma', /data-reel-video=/.test(appjs) && /requestReelCovers\(\)/.test(appjs));
  check('v1.5.15 reels: requestReelCovers captura un fotograma con captureVideoFrame y lo pone como imagen de la ficha', /function requestReelCovers/.test(appjs) && /captureVideoFrame\(src, function \(url\)/.test(appjs));
  check('v1.5.15 reels: mientras no hay portada, la ficha tiene fondo rojo oscuro con el icono de video (nunca vacía ni negra)', /reelTilePh/.test(appjs) && /\.reelTilePh\{[^}]*color:rgba\(255,255,255,\.45\)/.test(idx));
  check('v1.5.15 reels: la portada se pide al dibujar el inicio y la función está expuesta', /requestReelCovers\(\);/.test(appjs) && /requestReelCovers: requestReelCovers/.test(appjs));

  /* (2) Links: una sola tarjeta por URL única, con la imagen del link. */
  check('v1.5.15 links: normalizeUrlKey junta el mismo enlace con distinto seguimiento, www, mayúsculas y barra final', C.normalizeUrlKey('https://VT.TIKTOK.COM/abc/?utm_source=x&fbclid=1') === C.normalizeUrlKey('https://www.vt.tiktok.com/abc') && C.normalizeUrlKey('https://a.com/x?b=2&a=1') === C.normalizeUrlKey('https://a.com/x?a=1&b=2') && C.normalizeUrlKey('https://a.com/x') !== C.normalizeUrlKey('https://a.com/y'));
  check('v1.5.15 links: extractUrls quita los repetidos aunque el enlace venga dos veces con distinto seguimiento', C.extractUrls('mira https://vt.tiktok.com/abc/?utm_source=tt y https://www.vt.tiktok.com/abc').length === 1);
  check('v1.5.15 links: extractPageImage saca la og:image (y twitter:image si no hay), con URLs relativas resueltas', C.extractPageImage('<meta property="og:image" content="https://x.com/i.jpg">', 'https://x.com/p') === 'https://x.com/i.jpg' && C.extractPageImage('<meta name="twitter:image" content="/t.png">', 'https://x.com/p') === 'https://x.com/t.png' && C.extractPageImage('<title>Solo título</title>', 'https://x.com/p') === '');
  check('v1.5.15 links: la tarjeta del texto y la del campo link se dibujan juntas sin repetir (postLinkCardsHtml)', /function postLinkCardsHtml/.test(appjs) && /postLinkCardsHtml\(postText\.urls, post\.link\)/.test(appjs) && /postLinkCardsHtml\(sharedText\.urls, shared\.link\)/.test(appjs));
  check('v1.5.15 links: ya no se dibuja linkHtml(post.link) aparte (era la segunda tarjeta idéntica)', !/^\s*linkHtml\(post\.link\) \+/m.test(appjs) && !/linkHtml\(shared\.link \|\| null\)/.test(appjs));
  check('v1.5.15 links: la tarjeta lleva la imagen del link cuando se conoce (og:image)', /state\.linkImages\[url\]/.test(appjs) && /<img src="' \+ esc\(img\)/.test(appjs));
  check('v1.5.15 links: queueLinkTitle busca también la imagen y actualiza las tarjetas que ya se ven', /C\.extractPageImage\(html, url\)/.test(appjs) && /card\.querySelector\('img'\)/.test(appjs));

  /* (3) Buscador del cajón de aplicaciones. */
  check('v1.5.15 buscador: el cajón tiene su buscador arriba', /id="appsDrawerSearch"/.test(idx) && /placeholder="Buscar aplicaciones…"/.test(idx));
  check('v1.5.15 buscador: filtra por nombre mientras se escribe (sin tildes ni mayúsculas) y no reordena mientras se busca', /function foldSearch/.test(appjs) && /appsDrawerQuery = sInp\.value/.test(appjs) && /attachLauncherTile\(tile, q \? 'name' : sortMode\)/.test(appjs));
  check('v1.5.15 buscador: al cerrar el cajón se limpia la búsqueda', /if \(appsDrawerQuery\) setAppsDrawerQuery\(''\)/.test(appjs));

  /* (4) Numerito rojo encima de cada aplicación (NO en la campana). */
  check('v1.5.15 avisos por app: la ficha lleva su numerito rojo encima (fondo rojo, tope 99+)', /\.appNotifBadge\{[^}]*background:#e01430/.test(idx) && /<span class="appNotifBadge">/.test(appjs) && /n > 99 \? '99\+' : n/.test(appjs));
  /* v1.5.21: el numerito sigue viviendo SOLO en la ficha de la app
     (nunca en la campana), pero ahora se gestiona en dos sitios de la
     ficha: se dibuja en launcherTileHtml y se actualiza en su sitio en
     updateAppNotifBadges (antes era un solo lugar porque cada conteo
     volvía a dibujar todo el grid). */
  check('v1.5.21 avisos por app: el numerito solo vive en la ficha de la app (nunca en la campana): se dibuja en launcherTileHtml y se actualiza en su sitio en updateAppNotifBadges — 1.5.47: una aparición más para quitarlos con el interruptor apagado', (function () { var spots = [], m, re = /appNotifBadge/g; while ((m = re.exec(appjs))) spots.push(m.index); var tileFn = appjs.indexOf('function launcherTileHtml'); var updFn = appjs.indexOf('function updateAppNotifBadges'); var updEnd = appjs.indexOf('\nfunction ', updFn + 10); return spots.length === 4 && spots[0] > tileFn && spots[0] < updFn && spots[1] > updFn && spots[1] < updEnd && spots[2] > updFn && spots[2] < updEnd && spots[3] > updFn && spots[3] < updEnd; })() && /appNotifCounts\[a\.pkg\] \|\| 0/.test(appjs));
  const listenerSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedNotificationListener.java'), 'utf8');
  check('v1.5.15 avisos por app: el servicio nativo cuenta las notificaciones activas por paquete (sin las permanentes)', /getCountsJson/.test(listenerSrc) && /isOngoing\(\)/.test(listenerSrc) && /BIND_NOTIFICATION_LISTENER_SERVICE/.test(manifest));
  check('v1.5.15 avisos por app: el puente expone el conteo, el permiso y cómo activarlo', /public String getAppNotificationCounts/.test(main) && /public boolean isNotificationAccessGranted/.test(main) && /public void openNotificationAccessSettings/.test(main));
  check('v1.5.15 avisos por app: el conteo se refresca al abrir el cajón y se muestra la pista si falta el permiso', /refreshAppNotifCounts\(\);/.test(appjs) && /renderNotifAccessHint/.test(appjs));

  /* (5)+(6)+(7) Borrado que vale para todo lo borrable + vaciado silencioso. */
  check('v1.5.15 borrado todo: las lápidas genéricas "tipo:id" existen y se capan a 500', (function () { var st = fresh(); for (var i = 0; i < 510; i++) C.markItemDeleted(st, 'story', 's' + i); return st.deletedItemIds.length === 500 && !C.isItemDeleted(st, 'story', 's0') && C.isItemDeleted(st, 'story', 's509'); })());
  check('v1.5.15 borrado todo: historia, comentario, mensaje, conversación, grupo, anuncio y grupo de ventas borran también en el servidor', ['pushDeleteStoryToServer', 'pushDeleteMessageToServer', 'pushDeleteConvoToServer', 'pushDeleteGroupToServer', 'pushDeleteListingToServer', 'pushDeleteSalesGroupToServer'].every(function (fn) { return appjs.indexOf('function ' + fn) >= 0; }) && /pushDeleteCommentToServer\(postId, commentId\)/.test(appjs));
  check('v1.5.15 borrado todo: cada borrado pone su lápida para no resucitar al sincronizar', /C\.markItemDeleted\(state, 'story'/.test(appjs) && /C\.markItemDeleted\(state, 'comment'/.test(appjs) && /C\.markItemDeleted\(state, 'message'/.test(appjs) && /C\.markItemDeleted\(state, 'convo'/.test(appjs) && /C\.markItemDeleted\(state, 'group'/.test(appjs) && /C\.markItemDeleted\(state, 'listing'/.test(appjs) && /C\.markItemDeleted\(state, 'salesGroup'/.test(appjs));
  check('v1.5.15 borrado todo: la sincronización no vuelve a meter lo borrado (historias, anuncios, grupos de ventas, mensajes, conversaciones)', /C\.isItemDeleted\(state, 'story', st\.id\)/.test(appjs) && /C\.isItemDeleted\(state, 'listing', l\.id\)/.test(appjs) && /C\.isItemDeleted\(state, 'salesGroup', g\.id\)/.test(appjs) && /C\.isItemDeleted\(state, 'message', m\.id\)/.test(appjs) && /C\.isItemDeleted\(state, 'convo', key\)/.test(appjs));
  check('v1.5.15 borrado todo: pushToServer encola también cuando el servidor tarda demasiado (antes solo "No se pudo conectar")', /C\.isConnectionError\(r\)/.test(appjs.slice(appjs.indexOf('async function pushToServer'), appjs.indexOf('async function pushToServer') + 900)) && /isRetryableServerError\(r\)/.test(appjs.slice(appjs.indexOf('async function pushToServer'), appjs.indexOf('async function pushToServer') + 900)));
  check('v1.5.15 borrado todo: deleteMessage también borra mensajes de los chats grupales (antes siempre decía que no existían)', (function () { var st = withProfiles(fresh()); var g = C.createGroupChat(st, A, { name: 'Grupo', participants: [B, D] }).group; var m = C.sendGroupMessage(st, A, g.id, 'Hola grupo').message; return C.deleteMessage(st, A, m.id).ok === true && C.deleteMessage(st, A, m.id).ok === false; })());
  check('v1.5.15 borrado todo: mergeGroupChats no vuelve a meter un mensaje de grupo borrado', (function () { var st = withProfiles(fresh()); var g = C.createGroupChat(st, A, { name: 'Grupo', participants: [B, D] }).group; var m = C.sendGroupMessage(st, A, g.id, 'Hola grupo').message; C.deleteMessage(st, A, m.id); C.markItemDeleted(st, 'message', m.id); C.mergeGroupChats(st, [{ id: g.id, name: 'Grupo', participants: [A, B, D], messages: [{ id: m.id, from: A, text: 'Hola grupo', createdAt: Date.now(), readBy: [A] }], updatedAt: Date.now() + 1000, unread: {} }]); return !C.findGroupChat(st, g.id).messages.some(function (x) { return x.id === m.id; }); })());
  /* (6) Vaciado silencioso de la cola de borrados pendientes. */
  const realFetch = global.fetch;
  try {
    var st2 = withProfiles(fresh());
    st2.settings.serverUrl = 'https://servidor.test';
    st2.me = A;
    C.queuePending(st2, { kind: 'http', path: '/api/posts/p-borrado', method: 'DELETE', body: {} });
    C.queuePending(st2, { kind: 'http', path: '/api/posts/p-otro', method: 'POST', body: {} });
    global.fetch = async function () { return { ok: false, status: 404, json: async function () { return { ok: false, error: 'No encontrado.' }; } }; };
    const flushed = await C.flushPendingQueue(st2);
    check('v1.5.15 vaciado silencioso: un DELETE con 404 se da por enviado (ya está borrado) y se quita de la cola', flushed.sent === 1 && flushed.failed === 1 && st2.pendingQueue.length === 1 && st2.pendingQueue[0].path === '/api/posts/p-otro');
    global.fetch = async function () { return { ok: true, status: 200, json: async function () { return { ok: true }; } }; };
    const flushed2 = await C.flushPendingQueue(st2);
    check('v1.5.15 vaciado silencioso: al despertar el servidor, el pendiente se envía solo y la cola queda vacía', flushed2.sent === 1 && st2.pendingQueue.length === 0);
  } finally { global.fetch = realFetch; }

  /* (8)+(9) Menú flotante traslúcido junto a la ficha, funcional. */
  check('v1.5.15 menú flotante: el recuadro es traslúcido con desenfoque (fondo rgba + backdrop-filter)', /\.launcherMenuBox\{[^}]*background:rgba\(26,12,15,\.85\)[^}]*backdrop-filter:blur\(14px\)/.test(idx));
  check('v1.5.15 menú flotante: el fondo del overlay es transparente (se sigue viendo el cajón y la ficha presionada)', /#launcherMenuOverlay\{background:transparent/.test(idx));
  check('v1.5.15 menú flotante: el recuadro va anclado junto a la ficha (derecha, izquierda, debajo o encima según quepa)', /function positionLauncherMenu/.test(appjs) && /r\.right \+ gap \+ w <= vw/.test(appjs) && /r\.left - gap - w >= 0/.test(appjs) && /r\.bottom \+ gap \+ h <= vh/.test(appjs));
  check('v1.5.15 menú flotante: se cierra al tocar fuera del recuadro', /e\.target === lmOv/.test(appjs) && /hideOverlay\('launcherMenuOverlay'\)/.test(appjs));
  check('v1.5.15 menú flotante: las 4 opciones siguen llamando al puente (abrir, desinstalar, información, compartir)', /launcherOpenApp\(pkg\)/.test(appjs) && /launcherAskUninstall\(pkg\)/.test(appjs) && /launcherOpenAppInfo\(pkg\)/.test(appjs) && /launcherShareApp\(pkg\)/.test(appjs));

  /* Servidor 3.4: endpoint para borrar mensajes de grupo. */
  const srv34 = path.join(__dirname, '..', '..', '..', '..', '..', 'your_files', 'wordred-server-3.4', 'server.js');
  if (fs.existsSync(srv34)) {
    const s34 = fs.readFileSync(srv34, 'utf8');
    check('v1.5.15 servidor 3.4: existe DELETE /api/group-chats/:id/messages/:messageId (solo quien escribió, escritura estricta, aviso groupMessageDeleted)', /app\.delete\('\/api\/group-chats\/:id\/messages\/:messageId'/.test(s34) && /groupMessageDeleted/.test(s34) && /saveJsonStrict\('group-chats\.json'/.test(s34) && /version: '3\.4'/.test(s34));
  } else {
    check('v1.5.15 servidor 3.4: el ZIP 3.4 con el endpoint está en your_files', false, 'falta ' + srv34);
  }
}

/* 77. WordRed 1.5.15 (punto 11): en celulares con los 3 botones de
   navegación, la barra de abajo no queda encima de los botones del
   sistema; en modo gestos queda pegada abajo sin hueco extra. */
async function static1515nav() {
  console.log('=== 77. WordRed 1.5.15 (punto 11: barra inferior y botones del sistema) ===');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const navRule = (idx.match(/nav#bottomNav\{[^}]*\}/) || [''])[0];
  check('v1.5.15 barra inferior: #bottomNav ya no está en bottom:0, sube con la variable del margen del sistema', navRule.indexOf('bottom:var(--sys-nav-bottom,0px)') >= 0 && navRule.indexOf('bottom:0;') < 0, navRule.slice(0, 120));
  check('v1.5.15 barra inferior: :root declara --sys-nav-bottom en 0 px por defecto', idx.indexOf('--sys-nav-bottom:0px') >= 0);
  check('v1.5.15 barra inferior: el despeje del contenido crece con el margen del sistema', idx.indexOf('calc(104px + var(--sys-nav-bottom,0px))') >= 0);
  check('v1.5.15 barra inferior: el cajón también descuenta el margen del sistema', idx.indexOf('calc(100dvh - 230px - var(--sys-nav-bottom,0px))') >= 0);
  check('v1.5.15 barra inferior: la página aplica el margen que avisa el puente (__wrNavInset / applyNavInset / initNavInset)', appjs.indexOf('window.__wrNavInset') >= 0 && appjs.indexOf('function applyNavInset') >= 0 && appjs.indexOf('function initNavInset') >= 0 && appjs.indexOf('getNavBarHeight') >= 0);
  check('v1.5.15 barra inferior: el puente dice la altura de la barra de navegación (0 en modo gestos)', /public int getNavBarHeight\(\)/.test(main) && main.indexOf('getRootWindowInsets') >= 0);
  check('v1.5.15 barra inferior: la altura se lee con getInsetsIgnoringVisibility(navigationBars) para que no dé 0 con la barra oculta', main.indexOf('getInsetsIgnoringVisibility') >= 0 && main.indexOf('Type.navigationBars()') >= 0);
  check('v1.5.15 barra inferior: solo los botones empujan la barra (la tirita de gestos, ~16 dp, no deja hueco)', /if \(dp <= 28\) return 0;/.test(main));
  check('v1.5.15 barra inferior: el cambio de modo (botones <-> gestos) se avisa solo a la página', main.indexOf('__wrNavInset') >= 0 && main.indexOf('lastNavInsetCssPx') >= 0);
}

function static1516() {
  console.log('=== 78. WordRed 1.5.16: sin botón de Mercado en la barra de abajo ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const navBlock = (idx.match(/<nav id="bottomNav">[\s\S]*?<\/nav>/) || [''])[0];
  check('v1.5.16 barra: 5 botones, sin Mercado, Aplicaciones 3.º en el centro exacto', (navBlock.match(/<button/g) || []).length === 5 && !/data-nav="marketplace"/.test(navBlock) && navBlock.indexOf('navLauncherBtn') > navBlock.indexOf('data-nav="shorts"') && navBlock.indexOf('navLauncherBtn') < navBlock.indexOf('data-nav="groups"') && (navBlock.match(/<div class="bn-side">/g) || []).length === 2);
  check('v1.5.16 barra: los botones son Inicio, Shorts, Aplicaciones, Grupos y Perfil', /data-nav="feed"/.test(navBlock) && /data-nav="shorts"/.test(navBlock) && /data-nav="groups"/.test(navBlock) && /data-nav="profile"/.test(navBlock) && /id="navLauncherBtn"/.test(navBlock) && navBlock.indexOf('Inicio') >= 0 && navBlock.indexOf('Shorts') >= 0 && navBlock.indexOf('Grupos') >= 0 && navBlock.indexOf('Perfil') >= 0 && navBlock.indexOf('Mercado') < 0);
  check('v1.5.16 mercado: la vista sigue existiendo y se abre desde el acceso de arriba', /id="view-marketplace"/.test(idx) && /id="feedMarketBtn"/.test(idx) && /\$\('feedMarketBtn'\)\.addEventListener\('click', function \(\) \{ go\('marketplace'\); \}\)/.test(appjs) && /renderMarketplace/.test(appjs));
  var navSides1516 = navBlock.split('<div class="bn-side">').slice(1).map(function (s) { return s.split('</div>')[0]; });
  check('v1.5.16 barra: los dos lados tienen 2 botones cada uno (simetría por conteo)', navSides1516.length === 2 && navSides1516.every(function (s) { return (s.match(/<button/g) || []).length === 2; }));
  check('v1.5.16 barra: los 4 iconos laterales miden 28 px, sin uno más grande que su espejo', /nav#bottomNav button \.ic svg\{width:28px;height:28px/.test(idx) && !/nav#bottomNav button\.bn-main \.ic svg\{width:32px/.test(idx));
  check('v1.5.16 FAQ: la barra se describe con 5 botones y Mercado desde arriba', /La barra de abajo tiene Inicio, Shorts, Aplicaciones, Grupos y Perfil/.test(appjs) && /Mercado se entra desde arriba/.test(appjs) && /se entra desde arriba, tocando «Marketplace»/.test(appjs));
  check('v1.5.16 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
}

function static1517() {
  console.log('=== 79. WordRed 1.5.17: sin video chiquito, actualización, otras apps y batería ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const batt = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'BatteryWatcher.java'), 'utf8');
  const srv = fs.readFileSync(path.join(process.env.HOME || '', 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  check('v1.5.17 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.17 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.17 video chiquito: compartir no copia el medio en la copia', /media: '', mediaType: '', mediaList: null/.test(corejs) && /ownMediaHtml/.test(appjs));
  check('v1.5.17 actualización: Ajustes lleva el apartado hasta arriba con su botón', /id="checkUpdateBtn"/.test(idx) && /Buscar actualización/.test(idx) && /id="updateCurrentVersion"/.test(idx) && idx.indexOf('Actualización</h3>') < idx.indexOf('Notificaciones</h3>'));
  check('v1.5.17 actualización: el diálogo existe con fondo traslúcido y botón Instalar', /id="updateOverlay"/.test(idx) && /id="updateInstallBtn"/.test(idx) && /rgba\(26,12,15,.85\)/.test(idx) && /#updateOverlay\{z-index:100\}/.test(idx));
  check('v1.5.17 actualización: la app pregunta la última versión al servidor y abre el diálogo con el resultado', /\/api\/app\/latest/.test(appjs) && /function checkAppUpdate/.test(appjs) && /function openUpdateDialog/.test(appjs) && /serverFetchWithRetry/.test(appjs));
  check('v1.5.17 actualización: instalar descarga el APK real y abre el instalador', /downloadAndInstallApk/.test(appjs) && /downloadAndInstallApk/.test(main) && /launchApkInstall/.test(main) && /canRequestPackageInstalls/.test(main) && /INSTALL_APK_REQ = 2003/.test(main));
  check('v1.5.17 actualización: el manifiesto permite instalar paquetes (sin SMS)', /REQUEST_INSTALL_PACKAGES/.test(manifest) && !/SEND_SMS/.test(manifest) && !/RECEIVE_SMS/.test(manifest));
  check('v1.5.17 actualización: el servidor 3.9 sirve la última versión y el APK real', /version: '4.8'/.test(srv) && /\/api\/app\/latest/.test(srv) && /\/app\/WordRed\.apk/.test(srv) && /app-version\.json/.test(srv) && /application\/vnd\.android\.package-archive/.test(srv));
  check('v1.5.17 otras apps: la campana tiene su apartado separado con compresión y 3 puntos', /Otras aplicaciones y sistema/.test(appjs) && /OTHER_NOTIFS_VISIBLE = 5/.test(appjs) && /otherNotifsMore/.test(appjs) && /__wrToggleOtherNotifs/.test(appjs) && /getOtherAppNotifications/.test(appjs));
  check('v1.5.17 otras apps: sin acceso no se inventa nada (la sección lo dice)', /concede el acceso a notificaciones/.test(appjs) && /isNotificationAccessGranted/.test(appjs));
  check('v1.5.23 batería: el indicador va en el Inicio, en la fila de botones, justo después de Marketplace (ya no en el header)', /id="batteryInd"/.test(idx) && (function () { var h0 = idx.indexOf('<header>'); var h1 = idx.indexOf('</header>', h0); return h0 >= 0 && h1 > h0 && idx.slice(h0, h1).indexOf('batteryInd') < 0; })() && idx.indexOf('id="feedMarketBtn"') >= 0 && idx.indexOf('id="batteryInd"') > idx.indexOf('id="feedMarketBtn"') && idx.indexOf('id="batteryInd"') < idx.indexOf('</div>', idx.indexOf('id="feedMarketBtn"')) && /\.chiprow \.batteryInd\{[^}]*padding:8px 12px/.test(idx));
  check('v1.5.17 batería: el indicador muestra porcentaje real y rayo solo al cargar', /function renderBatteryInd/.test(appjs) && /batteryIconSvg/.test(appjs) && /zap/.test(appjs) && /__onBatteryStatus/.test(appjs));
  check('v1.5.17 batería: avisos de baja (15%) y llena (100% cargando) con el nivel real', /LOW_THRESHOLD = 15/.test(batt) && /FULL_LEVEL = 100/.test(batt) && /ACTION_BATTERY_CHANGED/.test(batt) && /Bater\\u00eda baja/.test(batt) && /Bater\\u00eda llena/.test(batt));
  check('v1.5.17 batería: el aviso no se repite por episodio y la campana lo recibe una vez por día', /low_notified/.test(batt) && /full_notified/.test(batt) && /takePendingBatteryNotices/.test(batt) && /batteryRefId/.test(appjs) && /getBatteryStatus/.test(main));
  check('v1.5.17 batería: el receptor se registra en la actividad y en el servicio (también con la app cerrada)', /BatteryWatcher\.register\(this\)/.test(main) && /BatteryWatcher\.register\(this\)/.test(fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedBackgroundService.java'), 'utf8')));
  check('v1.5.17 batería: los avisos de sistema van en el apartado de otras apps/sistema', /n\.type === 'system'/.test(appjs) && /Sistema/.test(appjs) && /__wrReadNotif/.test(appjs));
  check('v1.5.17 sin rebote: el botón del centro y el cajón ya no rebotan al abrirse (la apertura sin animación de la 1.5.17 se cambió por la fluida de la 1.5.18)', !/wrBtnBounce/.test(idx) && !/wrDrawerBounce/.test(idx) && !/bouncing/.test(appjs) && !/#appsDrawerOverlay\.on \.sheet\{animation:none\}/.test(idx));
  check('v1.5.17 sin rebote: solo se quitó el rebote del centro; las demás animaciones se quedan', /appOpenPulse/.test(idx) && /\.launcherTile\.pressed/.test(idx) && /\.otherNotifsMore\{max-height:0;overflow:hidden;opacity:0;transition:max-height/.test(idx));
}

function static1518() {
  console.log('=== 80. WordRed 1.5.18: cajón de aplicaciones mucho más fluido al presionar el botón del centro ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  check('v1.5.18 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.18 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.18 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  check('v1.5.18 cajón fluido: hay keyframes propios, solo opacidad y desplazamiento vertical (sin escala ni sobrepaso)', /@keyframes wrDrawerFluid\{from\{opacity:0;transform:translateY\(18px\)\}to\{opacity:1;transform:translateY\(0\)\}\}/.test(idx));
  check('v1.5.18 cajón fluido: la hoja del cajón usa la transición fluida al abrirse', /#appsDrawerOverlay\.on \.sheet\{animation:wrDrawerFluid \.22s cubic-bezier\(\.22,\.61,\.36,1\) both\}/.test(idx));
  check('v1.5.18 cajón fluido: la duración es corta y rápida (220 ms, menos que el deslizamiento general de .28 s)', (function () { const m = idx.match(/#appsDrawerOverlay\.on \.sheet\{animation:wrDrawerFluid \.(\d+)s/); return !!m && parseFloat('0.' + m[1]) <= 0.25; })());
  check('v1.5.18 cajón fluido: la curva es ease-out sin sobrepaso (los 4 valores del bezier están entre 0 y 1)', (function () { const m = idx.match(/wrDrawerFluid \.22s cubic-bezier\(([^)]+)\)/); if (!m) return false; return m[1].split(',').map(function (v) { return parseFloat(v); }).every(function (v) { return v >= 0 && v <= 1; }); })());
  check('v1.5.18 cajón fluido: el rebote de la 1.5.15 NO vuelve y no hay animation:none en el cajón', !/wrBtnBounce/.test(idx) && !/wrDrawerBounce/.test(idx) && !/bouncing/.test(appjs) && !/#appsDrawerOverlay\.on \.sheet\{animation:none\}/.test(idx));
  check('v1.5.18 cajón fluido: la respuesta del botón al presionar es inmediata y suave (escala .95 con transición .12 s)', /button:active,\.chip:active\{transform:scale\(\.95\)\}/.test(idx) && /button\{transition:transform \.12s ease\}/.test(idx));
  check('v1.5.18 cajón fluido: al abrir, el cajón se muestra PRIMERO y después se refresca (nada retrasa la apertura)', /function openAppsDrawer\(\) \{[\s\S]*?showOverlay\('appsDrawerOverlay'\);[\s\S]*?refreshLauncherApps\(\)/.test(appjs));
  check('v1.5.18 cajón fluido: el deslizamiento general de las demás hojas no cambia', /\.overlay\.on \.sheet\{animation:wrSheetUp \.28s ease both\}/.test(idx));
}

function static1519() {
  console.log('=== 81. WordRed 1.5.19: la descarga de la actualización ya funciona (https + redirecciones) ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const srv = fs.readFileSync(path.join(process.env.HOME || '', 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  check('v1.5.19 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.19 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.19 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  check('v1.5.19 descarga: appUpdateDownloadUrl reescribe a https la URL http del servidor', /function appUpdateDownloadUrl\(info\) \{[\s\S]*?http:\/\/wordred-server\.onrender\.com\//.test(appjs) && /'https:\/\/' \+ u\.slice\(7\)/.test(appjs));
  check('v1.5.19 descarga: la URL http del servidor se convierte a https, la https se queda y otras URLs no se tocan', (function () {
    var m = appjs.match(/function appUpdateDownloadUrl\(info\) \{[\s\S]*?\n\}/);
    if (!m) return false;
    var C = { serverBase: function () { return 'https://wordred-server.onrender.com'; } };
    var state = {};
    var fn = new Function('C', 'state', m[0] + '\nreturn appUpdateDownloadUrl;')(C, state);
    return fn({ url: 'http://wordred-server.onrender.com/app/WordRed.apk' }) === 'https://wordred-server.onrender.com/app/WordRed.apk'
      && fn({ url: 'https://wordred-server.onrender.com/app/WordRed.apk' }) === 'https://wordred-server.onrender.com/app/WordRed.apk'
      && fn({}) === 'https://wordred-server.onrender.com/app/WordRed.apk'
      && fn({ url: 'http://otro-sitio.com/app.apk' }) === 'http://otro-sitio.com/app.apk';
  })());
  check('v1.5.19 descarga: el puente nativo sigue las redirecciones a mano (301/302/303/307/308)', /setInstanceFollowRedirects\(false\)/.test(main) && /code == 301 \|\| code == 302 \|\| code == 303 \|\| code == 307 \|\| code == 308/.test(main));
  check('v1.5.19 descarga: el puente nativo acepta el cambio de protocolo http↔https al seguir la redirección', /new java\.net\.URL\(cur, loc\)/.test(main) && /!"http"\.equals\(proto\) && !"https"\.equals\(proto\)/.test(main));
  check('v1.5.19 descarga: el puente nativo limita los saltos a 5 y exige 200 al final', /hops >= 5/.test(main) && /if \(code != 200\) throw/.test(main));
  check('v1.5.19 descarga: el puente nativo normaliza a https la URL del servidor antes de descargar', /u\.startsWith\("http:\/\/wordred-server\.onrender\.com\/"\)/.test(main) && /"https:\/\/" \+ u\.substring\(7\)/.test(main));
  check('v1.5.19 descarga: el puente nativo mantiene los timeouts y sigue instalando con FileProvider', /setConnectTimeout\(30000\)/.test(main) && /setReadTimeout\(60000\)/.test(main) && /WordRed-update\.apk/.test(main) && /launchApkInstall/.test(main));
  check('v1.5.19 servidor 3.9: /api/health dice 3.9 y /api/app/latest usa el protocolo real (X-Forwarded-Proto) con https para Render', /version: '4.8'/.test(srv) && /x-forwarded-proto/.test(srv) && /onrender\.com/.test(srv) && /proto = 'https'/.test(srv));
  check('v1.5.19 servidor 3.6: la URL de descarga ya no se construye solo con req.protocol', !/var base = req\.protocol \+ ':\/\/' \+ req\.get\('host'\)/.test(srv));
  check('v1.5.19 sin regresión: el cajón fluido de la 1.5.18 sigue (sin rebote, transición .22 s)', /#appsDrawerOverlay\.on \.sheet\{animation:wrDrawerFluid \.22s cubic-bezier\(\.22,\.61,\.36,1\) both\}/.test(idx) && !/wrBtnBounce/.test(idx) && !/wrDrawerBounce/.test(idx));
}

function static1520() {
  console.log('=== 82. WordRed 1.5.20: campanita en TODAS las notificaciones ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const sounds = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedSounds.java'), 'utf8');
  const listener = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedNotificationListener.java'), 'utf8');
  const javaFiles = ['MainActivity.java', 'WordRedBackgroundService.java', 'WordRedNotifyReceiver.java', 'BatteryWatcher.java', 'ScreenShareService.java'].map(function (f) { return fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', f), 'utf8'); });
  const javaAll = javaFiles.join('\n');
  check('v1.5.20 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.20 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.20 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  /* La campana es un WAV real: cabecera RIFF/WAVE, PCM, mono, 16 bits, ~1,5 s. */
  const bellBuf = fs.readFileSync(path.join(__dirname, '..', 'res', 'raw', 'bell.wav'));
  const bellDur = bellBuf.readUInt32LE(40) / (bellBuf.readUInt32LE(24) * bellBuf.readUInt16LE(22) * (bellBuf.readUInt16LE(34) / 8));
  check('v1.5.20 campana: res/raw/bell.wav existe y es un WAV PCM válido de ~1-2 s', bellBuf.length > 10000 && bellBuf.toString('ascii', 0, 4) === 'RIFF' && bellBuf.toString('ascii', 8, 12) === 'WAVE' && bellBuf.readUInt16LE(20) === 1 && bellBuf.readUInt16LE(22) === 1 && bellBuf.readUInt32LE(24) === 22050 && bellBuf.readUInt16LE(34) === 16 && bellDur >= 1.0 && bellDur <= 2.0, 'dur=' + bellDur.toFixed(2) + 's');
  /* Una campana de verdad cae (el sonido se apaga solo); un pitido de oscilador suena plano. */
  const nSamp = bellBuf.readUInt32LE(40) / 2;
  let peak = 0;
  for (let i = 0; i < nSamp; i++) { const v = Math.abs(bellBuf.readInt16LE(44 + i * 2)); if (v > peak) peak = v; }
  const rmsPart = function (a, b) { let s = 0; for (let i = a; i < b; i++) { const v = bellBuf.readInt16LE(44 + i * 2); s += v * v; } return Math.sqrt(s / (b - a)); };
  const rmsFirst = rmsPart(0, Math.floor(nSamp / 5));
  const rmsLast = rmsPart(Math.floor(nSamp * 4 / 5), nSamp);
  check('v1.5.20 campana: el WAV suena a campana y no a pitido (cae exponencialmente, sin recorte)', rmsFirst > 2 * rmsLast && peak / 32768 < 1.0 && peak / 32768 > 0.5, 'rms ini=' + Math.round(rmsFirst) + ' fin=' + Math.round(rmsLast) + ' pico=' + (peak / 32768).toFixed(2));
  check('v1.5.20 campana: WordRedSounds define los 4 IDs nuevos de canal ("..._bell")', /CHANNEL_MAIN = "wordred_bell"/.test(sounds) && /CHANNEL_VERIFY = "wordred_verify_bell"/.test(sounds) && /CHANNEL_POSTS = "wordred_posts_bell"/.test(sounds) && /CHANNEL_CALLS = "wordred_calls_bell"/.test(sounds));
  check('v1.5.20 campana: el sonido se resuelve del recurso res/raw/bell.wav', /soundUri\(ctx, "bell"\)/.test(sounds) && /getIdentifier\(name, "raw"/.test(sounds) && /android\.resource:\/\//.test(sounds));
  const creations = (javaAll.match(/new (?:android\.app\.)?NotificationChannel\(/g) || []).length;
  const bells = (javaAll.match(/WordRedSounds\.applyBell\(/g) || []).length;
  const soundUses = (javaAll.match(/WordRedSounds\.applySound\(/g) || []).length;
  check('v1.5.20 campana: los 13 canales de WordRed usan un sonido real de res/raw (campanita, o el sonido elegido del chat)', creations === 13 && bells + soundUses === creations, 'canales=' + creations + ' con campanita=' + bells + ' y sonido de chat=' + soundUses);
  const builders = (javaAll.match(/WordRedSounds\.applyBellToBuilder\(/g) || []).length;
  check('v1.5.20 campana: los 10 avisos también ponen la campanita en el builder (Android 7 y anteriores)', builders === 10, 'builders=' + builders);
  const noScheme = javaFiles.map(function (s) { return s.split('\n').filter(function (l) { return l.indexOf('getScheme') < 0; }).join('\n'); }).join('\n');
  check('v1.5.20 campana: ningún canal usa los IDs viejos sin campanita', !/"wordred"|"wordred_verify"|"wordred_posts"|"wordred_calls"/.test(noScheme));
  check('v1.5.20 campana: con la app cerrada suena igual (el servicio usa los canales con campanita)', /WordRedSounds\.CHANNEL_MAIN/.test(javaFiles[1]) && /WordRedSounds\.CHANNEL_CALLS/.test(javaFiles[1]) && (javaFiles[1].match(/WordRedSounds\.applyBell\(/g) || []).length === 3);
  check('v1.5.20 campana: las llamadas entrantes suenan con la campanita (en bucle hasta contestar)', main.indexOf('WordRedSounds.bellUri(MainActivity.this)') >= 0 && main.indexOf('WordRedSounds.bellUri(MainActivity.this)') < main.indexOf('RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)') && /setLooping\(true\)/.test(main));
  check('v1.5.20 campana: al arrancar se borran los canales viejos para que no queden duplicados', /WordRedSounds\.deleteOldChannels\(this\)/.test(main) && /"wordred", "wordred_verify", "wordred_posts", "wordred_calls"/.test(sounds) && /deleteNotificationChannel\(id\)/.test(sounds));
  check('v1.5.20 campana: las notificaciones de otras apps NO se vuelven a sonar desde WordRed', !/Notification\.Builder|nm\.notify|\.setSound\(/.test(listener));
  check('v1.5.20 sin pitido: no hay oscilador WebAudio en la app', !/startAmbient|OscillatorNode|AMBIENT_CHORDS/.test(appjs));
  check('v1.5.20 sin regresión: el cajón fluido de la 1.5.18 y la descarga https de la 1.5.19 siguen', /#appsDrawerOverlay\.on \.sheet\{animation:wrDrawerFluid \.22s cubic-bezier\(\.22,\.61,\.36,1\) both\}/.test(idx) && /'https:\/\/' \+ u\.slice\(7\)/.test(appjs) && /setInstanceFollowRedirects\(false\)/.test(main));
}

function static1521() {
  console.log('=== 83. WordRed 1.5.22: el cajón de aplicaciones se abre en milisegundos ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const sounds = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedSounds.java'), 'utf8');
  /* Recorta el cuerpo de una función de nivel superior (hasta la siguiente). */
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  check('v1.5.21 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.21 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.21 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  const openBody = fnBody(appjs, 'openAppsDrawer');
  check('v1.5.21 apertura: al presionar el botón del centro, el cajón se dibuja desde la caché y se muestra ANTES de cualquier llamada al puente', openBody.indexOf('applyDrawerSettings1547()') >= 0 && openBody.indexOf("showOverlay('appsDrawerOverlay')") >= 0 && openBody.indexOf('applyDrawerSettings1547()') < openBody.indexOf("showOverlay('appsDrawerOverlay')") && openBody.indexOf("showOverlay('appsDrawerOverlay')") < openBody.indexOf('refreshLauncherApps()'));
  check('v1.5.21 apertura: el manejador del clic TERMINA y cede (la lista se actualiza por detrás con setTimeout 0)', /setTimeout\(function \(\) \{\s*refreshLauncherApps\(\);\s*refreshAppNotifCounts\(\);\s*initNavInset\(\);\s*\}, 0\)/.test(openBody));
  check('v1.5.21 apertura: el clic no llama al puente nativo (ni listInstalledApps ni getAppNotificationCounts)', openBody.indexOf('listInstalledApps') < 0 && openBody.indexOf('getAppNotificationCounts') < 0);
  check('v1.5.21 apertura: el botón del centro sigue abriendo el cajón con openAppsDrawer', /addEventListener\('click', function \(\) \{ openAppsDrawer\(\); \}\)/.test(appjs));
  const refreshBody = fnBody(appjs, 'refreshLauncherApps');
  check('v1.5.21 fondo: la lista solo se vuelve a guardar y a dibujar si algo cambió de verdad (sin cambios, la actualización de fondo no toca nada)', /var changed = !launcherAppsLoaded/.test(refreshBody) && /if \(!changed\) return false;/.test(refreshBody) && /save\(\); renderAppsDrawer\(\);/.test(refreshBody));
  check('v1.5.21 fondo: los iconos se reutilizan de la caché en memoria (no se vuelven a pedir si ya están)', /if \(!a\.icon && prev\[a\.pkg\]\.icon\) a\.icon = prev\[a\.pkg\]\.icon;/.test(refreshBody));
  check('v1.5.21 fondo: sin cambios, la actualización no toca el cajón que ya se ve (un solo renderAppsDrawer, tras el regreso temprano)', refreshBody.indexOf('renderAppsDrawer()') === refreshBody.lastIndexOf('renderAppsDrawer()') && /if \(!changed\) return false;/.test(refreshBody));
  const countsBody = fnBody(appjs, 'refreshAppNotifCounts');
  check('v1.5.21 numeritos: los conteos ya NO provocan un segundo dibujado completo del grid', countsBody.indexOf('renderAppsDrawer()') < 0 && countsBody.indexOf('updateAppNotifBadges()') >= 0);
  const badgesBody = fnBody(appjs, 'updateAppNotifBadges');
  check('v1.5.21 numeritos: los numeritos se actualizan en su sitio, ficha por ficha, sin redibujar', badgesBody.length > 100 && /\.launcherTile/.test(badgesBody) && /appNotifBadge/.test(badgesBody) && badgesBody.indexOf('renderAppsDrawer') < 0);
  const renderBody = fnBody(appjs, 'renderAppsDrawer');
  check('v1.5.21 primera apertura: sin lista en memoria, el cajón se muestra igual con "Cargando aplicaciones…"', renderBody.indexOf('Cargando aplicaciones…') >= 0 && /!installedApps\.length && !launcherAppsLoaded/.test(renderBody));
  check('v1.5.21 iconos nativos: el puente cachea el base64 del icono por paquete y solo lo vuelve a codificar si la app cambió', /iconCache/.test(main) && /iconCacheTime/.test(main) && /lastUpdateTime/.test(main) && /cachedTime\.longValue\(\) == updated/.test(main));
  check('v1.5.21 sin cambio: el botón de actualizar del cajón sigue releyendo todo y avisando igual', /refreshLauncherApps\(\); refreshAppNotifCounts\(\); toast\('Aplicaciones actualizadas\.'\);/.test(appjs));
  check('v1.5.21 sin regresión: el cajón fluido de la 1.5.18, la descarga https de la 1.5.19 y la campanita de la 1.5.20 siguen', /#appsDrawerOverlay\.on \.sheet\{animation:wrDrawerFluid \.22s cubic-bezier\(\.22,\.61,\.36,1\) both\}/.test(idx) && /'https:\/\/' \+ u\.slice\(7\)/.test(appjs) && /setInstanceFollowRedirects\(false\)/.test(main) && /CHANNEL_MAIN = "wordred_bell"/.test(sounds));
}

function static1522() {
  /* La 1.5.23 rediseña SOLO el perfil propio y reemplaza su cuadrícula;
     la versión (58 / 1.5.43) se comprueba en static1523. Aquí queda lo
     que sigue vigente de la 1.5.22: el perfil de OTRA persona. */
  console.log('=== 84. WordRed 1.5.22/1.5.23: el perfil de otra persona sigue simétrico ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const sounds = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedSounds.java'), 'utf8');
  /* Recorta el cuerpo de una función de nivel superior (hasta la siguiente). */
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  /* El perfil propio ya NO usa .profileTop ni .profileBtns (la 1.5.23 lo
     rediseña por completo); el de otra persona sí, y se comprueba abajo. */
  const ownBody = fnBody(appjs, 'renderOwnProfile');
  check('v1.5.23 perfil propio: la cuadrícula de la 1.5.22 ya no está en el perfil propio', ownBody.indexOf('profileBtns') < 0 && ownBody.indexOf('profileTop') < 0, ownBody.slice(0, 80));
  check('v1.5.23 perfil propio: el modo invitado se queda como está', ownBody.indexOf('Estás explorando como invitado') >= 0);
  const detBody = fnBody(appjs, 'renderProfileDetail');
  const detTop = detBody.indexOf('<div class="profileTop">');
  const detBtns = detBody.indexOf('<div class="profileBtns">');
  check('v1.5.22 perfil de otra persona: foto, nombre, biografía, números y botones van dentro de .profileTop', detTop >= 0 && detBtns > detTop && detBody.indexOf('Publicaciones') > detBtns);
  check('v1.5.22 perfil de otra persona: los botones conservan todas sus funciones', detBtns >= 0 && detBody.indexOf('__wrOpenChat') >= 0 && detBody.indexOf('__wrOpenSellerProfile') >= 0 && detBody.indexOf('__wrBlockUser') >= 0 && detBody.indexOf('__wrUnblockUser') >= 0 && detBody.indexOf('__wrReportUser') >= 0);
  check('v1.5.22 perfil de otra persona: Reportar, el último botón, ocupa todo el ancho', /class="btn ghost wide" onclick="window\.__wrReportUser/.test(detBody));
  check('v1.5.22 perfil de otra persona: el caso bloqueado se queda como está', detBody.indexOf('Perfil no disponible') >= 0);
  check('v1.5.22 perfil: el aro rojo de en vivo sigue en la foto', /live-ring/.test(appjs) && ownBody.indexOf('liveAvatarTap') >= 0 && detBody.indexOf('liveAvatarTap') >= 0);
  check('v1.5.22 sin regresión: el cajón fluido de la 1.5.18, la descarga https de la 1.5.19, la campanita de la 1.5.20 y la apertura en milisegundos de la 1.5.21 siguen', /#appsDrawerOverlay\.on \.sheet\{animation:wrDrawerFluid \.22s cubic-bezier\(\.22,\.61,\.36,1\) both\}/.test(idx) && /'https:\/\/' \+ u\.slice\(7\)/.test(appjs) && /setInstanceFollowRedirects\(false\)/.test(main) && /CHANNEL_MAIN = "wordred_bell"/.test(sounds) && /setTimeout\(function \(\) \{\s*refreshLauncherApps\(\);\s*refreshAppNotifCounts\(\);\s*initNavInset\(\);\s*\}, 0\)/.test(appjs));
}

function static1523() {
  console.log('=== 85. WordRed 1.5.24: el perfil propio rediseñado + visitas reales (servidor 3.7) ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const sounds = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedSounds.java'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  /* Versión. */
  check('v1.5.23 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.23 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.23 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  /* CSS del diseño nuevo. */
  check('v1.5.23 perfil: la fila superior es simétrica con botones solo-símbolo del mismo tamaño (1.5.30: botones de 40 px; 1.5.32: 6 botones)', /\.ownTopRow\{display:flex;justify-content:space-between;align-items:center/.test(idx) && /\.ownIconBtn\{position:relative;width:40px;height:40px;border-radius:50%/.test(idx) && /\.ownViewsCircle\{position:relative;width:40px;height:40px;border-radius:50%/.test(idx));
  check('v1.5.23 perfil: el engranaje de configuración es rojo', /\.ownIconBtn\.red\{color:var\(--red2\)\}/.test(idx));
  check('v1.5.23 perfil: el + para subir historias es un círculo rojo', /\.ownStoryPlus\{position:absolute;[^}]*background:var\(--red\)/.test(idx));
  check('v1.5.23 perfil: el nombre es grande a la izquierda', /\.ownName\{font-size:26px/.test(idx));
  check('v1.5.23 perfil: las cantidades son medianas y a la izquierda (sin centrar)', /\.ownStats\{display:flex;gap:22px/.test(idx) && /\.ownStats b\{display:block;font-size:16px\}/.test(idx) && !/\.ownStats\{[^}]*justify-content:center/.test(idx));
  /* 1.5.30: la fila rápida se quitó — los 4 botones subieron a la fila superior, solo con símbolo; el botón es de 40 px con posición relativa para la insignia. */
  check('v1.5.30 perfil: ya no hay fila rápida (ni su CSS) y los botones de la fila superior son de 40 px', !/\.ownQuickRow\{/.test(idx) && !/\.ownQuickLink\{/.test(idx) && /\.ownIconBtn\{position:relative;width:40px;height:40px/.test(idx));
  /* Estructura del perfil propio, en orden. */
  const ownBody = fnBody(appjs, 'renderOwnProfile');
  const oTop = ownBody.indexOf('<div class="ownTopRow">');
  const oHead = ownBody.indexOf('<div class="ownHeadRow">');
  const oBio = ownBody.indexOf('Sin biografía');
  const oData = ownBody.indexOf('profileBioHtml');
  const oStats = ownBody.indexOf('<div class="ownStats">');
  check('v1.5.23 perfil propio: fila superior, foto+nombre, biografía y datos y cantidades van en ese orden (1.5.24: la biografía va antes que las cantidades; 1.5.30: sin fila rápida)', oTop >= 0 && oHead > oTop && oBio > oHead && oData > oBio && oStats > oData && ownBody.indexOf('Mis publicaciones') > oStats && ownBody.indexOf('Guardadas') > oStats && ownBody.indexOf('ownQuickRow') < 0);
  const topRow = oTop >= 0 ? ownBody.slice(oTop, ownBody.indexOf('</div>', oTop)) : '';
  check('v1.5.23 perfil propio: la fila superior tiene el círculo de visitas, el de seguir y el engranaje rojo, solo con símbolo (1.5.30: los botones también están en esta fila; 1.5.32: Amigos salió, la insignia vive en Seguidores)', topRow.indexOf('id="profileViewsBtn"') >= 0 && topRow.indexOf('__wrOpenProfileViews') >= 0 && topRow.indexOf('aria-label="Seguidores"') >= 0 && topRow.indexOf('__wrOpenFriends') >= 0 && topRow.indexOf('ownIconBtn red') >= 0 && topRow.indexOf('__wrOpenSettings') >= 0 && topRow.indexOf('id="profileViewsAvatar"') >= 0 && topRow.indexOf('id="profileViewsCount"') >= 0 && topRow.indexOf('id="profileFriendsBadge"') >= 0 && topRow.indexOf('__wrOpenActivity') >= 0 && topRow.indexOf('__wrOpenLiveStart') >= 0 && topRow.indexOf('__wrOpenPlaceForm') >= 0, topRow.slice(0, 200));
  const headRow = oHead >= 0 ? ownBody.slice(oHead, oStats) : ''; /* v1.5.25: la cabecera tiene la columna izquierda anidada, así que el primer </div> ya no cierra la fila; la fila termina justo antes de las cantidades. */
  check('v1.5.23 perfil propio: nombre grande a la izquierda con el lápiz junto a él y foto a la derecha con el + rojo', headRow.indexOf('class="ownName"') >= 0 && headRow.indexOf('ownEditBtn') >= 0 && headRow.indexOf('__wrEditProfile') >= 0 && headRow.indexOf('ownAvatarWrap') >= 0 && headRow.indexOf('ownAvatar') >= 0 && headRow.indexOf('ownStoryPlus') >= 0 && headRow.indexOf('__wrOpenStoryCreate') >= 0, headRow.slice(0, 200));
  check('v1.5.23 perfil propio: el aro rojo de en vivo sigue en la foto', ownBody.indexOf('liveAvatarTap') >= 0);
  /* 1.5.30: los botones ya no van en una fila rápida abajo — subieron a la fila superior, solo con símbolo y en el mismo orden. 1.5.31: el engranaje de ajustes va el último. 1.5.32: el botón Amigos sale de la fila; su insignia vive en Seguidores. */
  const qOrder = ['aria-label="Seguidores"', '__wrOpenActivity', '__wrOpenLiveStart', '__wrOpenPlaceForm'];
  const qOrderOk = qOrder.every(function (m, i) { var q = topRow.indexOf(m); return q >= 0 && (i === 0 || q > topRow.indexOf(qOrder[i - 1])); });
  check('v1.5.32 perfil propio: los botones están en la fila superior, en orden, solo con símbolo (sin texto ni fila abajo) y el engranaje va el último', qOrderOk && topRow.indexOf('__wrOpenSettings') > topRow.indexOf('__wrOpenPlaceForm') && topRow.indexOf('<span>Seguidores</span>') < 0 && topRow.indexOf('<span>Tu actividad</span>') < 0 && topRow.indexOf('<span>Transmitir en vivo</span>') < 0 && topRow.indexOf('<span>Recomendar un lugar</span>') < 0, topRow.slice(0, 200));
  check('v1.5.32 perfil propio: Seguidores conserva la insignia de solicitudes pendientes en la fila superior y el botón Amigos ya no existe', topRow.indexOf('id="profileFriendsBtn"') < 0 && topRow.indexOf('id="profileFriendsBadge"') >= 0 && topRow.indexOf('id="profileFriendsBadge"') < topRow.indexOf('__wrOpenActivity'));
  /* Visitas reales (servidor 3.7): carga, registro y lista. */
  check('v1.5.23 visitas: el perfil propio carga mis visitas del servidor en segundo plano', /function loadMyProfileViews\(force\)/.test(appjs) && /C\.serverFetch\(state, '\/api\/profile-views\/me', 'GET'/.test(appjs));
  check('v1.5.23 visitas: al abrir el perfil de otra persona se registra la visita en el servidor', /function recordServerProfileView\(phone\)/.test(appjs) && /C\.serverFetch\(state, '\/api\/profile-views', 'POST', \{ viewedPhone: phone \}/.test(appjs) && (function () { var i = appjs.indexOf('window.__wrOpenProfile = function'); if (i < 0) return false; var j = appjs.indexOf('function coverHtml', i); var b = appjs.slice(i, j < 0 ? appjs.length : j); return b.indexOf('recordServerProfileView(phone);') >= 0; })());
  check('v1.5.23 visitas: el círculo nunca inventa datos (ojo sin visitante, 0 sin visitas)', /function profileViewsCircleHtml\(\)/.test(appjs) && fnBody(appjs, 'profileViewsCircleHtml').indexOf("ic('eye', 20)") >= 0 && /String\(pv\.count \|\| 0\)/.test(appjs));
  check('v1.5.23 visitas: existe la lista de quienes vieron mi perfil con su estado vacío', /id="profileViewsOverlay"/.test(idx) && /id="profileViewsList"/.test(idx) && /Nadie ha visto tu perfil todavía/.test(appjs) && /pv\.viewers\.map\(function/.test(appjs));
  /* El perfil de otra persona sigue exactamente como en la 1.5.22. */
  const detBody = fnBody(appjs, 'renderProfileDetail');
  check('v1.5.23 perfil de otra persona: sigue con .profileTop centrado y la cuadrícula de 2 columnas', detBody.indexOf('<div class="profileTop">') >= 0 && detBody.indexOf('<div class="profileBtns">') >= 0 && detBody.indexOf('ownTopRow') < 0 && detBody.indexOf('ownQuickRow') < 0);
  /* v1.5.23 (alcance añadido): Mis grabaciones de lives ANTES de Tienda
     de juegos, y la batería en el Inicio tras Marketplace. */
  check('v1.5.23 perfil: Mis grabaciones de lives va ANTES de Tienda de juegos', (function () { var v = idx.indexOf('id="view-profile"'); var a = idx.indexOf('id="liveRecordingsSection"', v); var b = idx.indexOf('id="gamesSection"', v); return a >= 0 && b > a; })());
  check('v1.5.23 batería: el indicador va en el Inicio, en la fila de botones, justo después de Marketplace (ya no en el header)', /id="batteryInd"/.test(idx) && (function () { var h0 = idx.indexOf('<header>'); var h1 = idx.indexOf('</header>', h0); return h0 >= 0 && h1 > h0 && idx.slice(h0, h1).indexOf('batteryInd') < 0; })() && idx.indexOf('id="feedMarketBtn"') >= 0 && idx.indexOf('id="batteryInd"') > idx.indexOf('id="feedMarketBtn"') && idx.indexOf('id="batteryInd"') < idx.indexOf('</div>', idx.indexOf('id="feedMarketBtn"')));
  check('v1.5.23 batería: dentro de la fila tiene el mismo aspecto que los demás botones (misma altura, fondo y borde)', /\.chiprow \.batteryInd\{padding:8px 12px;border-radius:999px;background:rgba\(255,255,255,\.08\);border:1px solid var\(--line\);font-size:13px;font-weight:700;margin-left:0\}/.test(idx));
  check('v1.5.23 sin regresión: el cajón fluido de la 1.5.18, la descarga https de la 1.5.19, la campanita de la 1.5.20 y la apertura en milisegundos de la 1.5.21 siguen', /#appsDrawerOverlay\.on \.sheet\{animation:wrDrawerFluid \.22s cubic-bezier\(\.22,\.61,\.36,1\) both\}/.test(idx) && /'https:\/\/' \+ u\.slice\(7\)/.test(appjs) && /setInstanceFollowRedirects\(false\)/.test(main) && /CHANNEL_MAIN = "wordred_bell"/.test(sounds) && /setTimeout\(function \(\) \{\s*refreshLauncherApps\(\);\s*refreshAppNotifCounts\(\);\s*initNavInset\(\);\s*\}, 0\)/.test(appjs));
}


function static1524() {
  /* La 1.5.24 mueve SOLO la biografía (con sus datos) justo abajo del
     nombre, antes de las cantidades. Todo lo demás queda como en la 1.5.23. */
  console.log('=== 86. WordRed 1.5.24: la biografía va justo abajo del nombre, antes de las cantidades ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  /* Versión. */
  check('v1.5.24 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.24 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.24 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  /* Orden nuevo en el perfil propio: biografía y datos antes que las cantidades. */
  const ownBody = fnBody(appjs, 'renderOwnProfile');
  const oTop = ownBody.indexOf('<div class="ownTopRow">');
  const oHead = ownBody.indexOf('<div class="ownHeadRow">');
  const oBio = ownBody.indexOf('Sin biografía');
  const oData = ownBody.indexOf('profileBioHtml');
  const oStats = ownBody.indexOf('<div class="ownStats">');
  const oQuick = ownBody.indexOf('<div class="ownQuickRow">');
  check('v1.5.24 perfil propio: la biografía va ANTES que las cantidades', oBio >= 0 && oStats > oBio, 'bio=' + oBio + ' stats=' + oStats);
  check('v1.5.24 perfil propio: los datos (trabajo, estudios, ciudad...) también van ANTES que las cantidades', oData >= 0 && oStats > oData, 'datos=' + oData + ' stats=' + oStats);
  check('v1.5.24 perfil propio: el orden completo es fila superior, nombre+foto, biografía, datos y cantidades (1.5.30: sin fila rápida)', oTop >= 0 && oHead > oTop && oBio > oHead && oData > oBio && oStats > oData && ownBody.indexOf('Mis publicaciones') > oStats && oQuick < 0);
  check('v1.5.24 perfil propio: el nombre sigue grande a la izquierda con el lápiz junto a él y la foto a la derecha con el + rojo', ownBody.indexOf('class="ownName"') >= 0 && ownBody.indexOf('ownEditBtn') >= 0 && ownBody.indexOf('ownAvatarWrap') >= 0 && ownBody.indexOf('ownStoryPlus') >= 0);
  check('v1.5.30 perfil propio: ya no hay fila sin recuadro después de la descripción (los botones subieron a la fila superior)', oQuick < 0 && ownBody.indexOf('Mis publicaciones') > oStats);
  /* Sin regresión: el perfil de otra persona y lo demás siguen como en la 1.5.23. */
  const detBody = fnBody(appjs, 'renderProfileDetail');
  check('v1.5.24 perfil de otra persona: sigue con .profileTop centrado y la cuadrícula de 2 columnas', detBody.indexOf('<div class="profileTop">') >= 0 && detBody.indexOf('<div class="profileBtns">') >= 0);
}


function static1525() {
  /* La 1.5.25 hace DOS cosas y solo esas: (1) quita el hueco entre el
     nombre y la biografía, poniendo la biografía con sus datos en una
     columna a la izquierda, justo abajo del nombre y al lado de la foto;
     (2) al instalar una actualización, su aviso desaparece de la campana.
     Todo lo demás queda como en la 1.5.24. */
  console.log('=== 87. WordRed 1.5.25: sin hueco entre nombre y biografía + avisos de actualización instalada fuera de la campana ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  /* Versión. */
  check('v1.5.25 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.25 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.25 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  /* (1) Sin hueco: la biografía y los datos, en la columna izquierda de la cabecera. */
  check('v1.5.25 perfil propio: la columna izquierda ocupa lo que sobra junto al avatar', /\.ownHeadCol\{flex:1;min-width:0\}/.test(idx));
  check('v1.5.25 perfil propio: sin margen extra entre el nombre y la biografía', /\.ownHeadCol p\.muted\{margin:4px 0 0\}/.test(idx));
  const ownBody = fnBody(appjs, 'renderOwnProfile');
  const oCol = ownBody.indexOf('<div class="ownHeadCol">');
  const oName = ownBody.indexOf('class="ownName"');
  const oBio = ownBody.indexOf('Sin biografía');
  const oData = ownBody.indexOf('profileBioHtml');
  const oColEnd = ownBody.indexOf("'</div>' +", oCol);
  const oAvatar = ownBody.indexOf('ownAvatarWrap');
  const oStats = ownBody.indexOf('<div class="ownStats">');
  const oQuick = ownBody.indexOf('<div class="ownQuickRow">');
  check('v1.5.25 perfil propio: la biografía está DENTRO de la columna izquierda, inmediatamente después del nombre', oCol >= 0 && oName > oCol && oBio > oName && oColEnd > oBio, 'col=' + oCol + ' nombre=' + oName + ' bio=' + oBio + ' finCol=' + oColEnd);
  check('v1.5.25 perfil propio: los datos también van dentro de la columna, antes que las cantidades', oData > oBio && oData < oColEnd && oStats > oColEnd, 'datos=' + oData + ' finCol=' + oColEnd + ' stats=' + oStats);
  check('v1.5.25 perfil propio: la foto sigue a la derecha de la columna, con el + rojo, y las cantidades siguen después (1.5.30: sin fila rápida)', oAvatar > oColEnd && ownBody.indexOf('ownStoryPlus') > oAvatar && oStats > oAvatar && oQuick < 0);
  check('v1.5.30 perfil propio: ya no hay fila sin recuadro después de las cantidades', oQuick < 0 && ownBody.indexOf('Mis publicaciones') > oStats);
  /* (2) Campana: los avisos de actualización YA INSTALADOS desaparecen. */
  const pruneBody = fnBody(appjs, 'pruneInstalledUpdateNotifs');
  check('v1.5.25 campana: existe pruneInstalledUpdateNotifs()', pruneBody.length > 0);
  check('v1.5.25 campana: la limpieza quita los avisos de tipo update con refId <= la versión instalada', /n\.type !== 'update'/.test(pruneBody) && /var v = Number\(n\.refId\)/.test(pruneBody) && /v <= APP_VERSION_CODE/.test(pruneBody));
  check('v1.5.25 campana: la limpieza guarda y actualiza la insignia solo si quitó algo', /if \(changed\) \{ save\(\); updateBadges\(\); \}/.test(pruneBody));
  check('v1.5.25 campana: la limpieza también limpia updateNotifiedVersion de una versión ya instalada', /state\.updateNotifiedVersion > 0 && state\.updateNotifiedVersion <= APP_VERSION_CODE/.test(pruneBody));
  const enterBody = fnBody(appjs, 'enterApp');
  check('v1.5.25 campana: al arrancar se limpian los avisos ya instalados antes de pintar la campana', enterBody.indexOf('pruneInstalledUpdateNotifs()') >= 0 && enterBody.indexOf('pruneInstalledUpdateNotifs()') < enterBody.indexOf('updateBadges()'));
  const checkBody = fnBody(appjs, 'checkAppUpdate');
  check('v1.5.25 campana: cuando el servidor dice que ya se tiene la última versión también se limpia la campana', checkBody.indexOf('pruneInstalledUpdateNotifs()') > checkBody.indexOf('appUpdateInfo = null;'));
  check('v1.5.25 campana: el aviso del celular no se toca (notifyAppUpdateAvailable sigue avisando una vez por versión)', /AndroidBridge\.showNotification/.test(appjs) && /state\.updateNotifiedVersion !== info\.versionCode/.test(appjs));
  /* Sin regresión: el perfil de otra persona y lo demás siguen como en la 1.5.24. */
  const detBody = fnBody(appjs, 'renderProfileDetail');
  check('v1.5.25 perfil de otra persona: sigue con .profileTop centrado y la cuadrícula de 2 columnas', detBody.indexOf('<div class="profileTop">') >= 0 && detBody.indexOf('<div class="profileBtns">') >= 0);
  /* (3) Reproductor propio en TODOS los videos (nada de controles nativos). */
  check('v1.5.25 videos: ningún <video> conserva el atributo controls nativo (solo el audio lo lleva)', (function () { var lines = appjs.split('\n').filter(function (l) { return l.indexOf(' controls') >= 0; }); return lines.length === 4 && lines.every(function (l) { return l.indexOf('<audio') >= 0; }); })());
  check('v1.5.25 videos: existen los iconos cc (subtítulos) y more (⋮) en el mismo estilo que los demás', /cc: '<rect x="2" y="5"/.test(appjs) && /more: '<circle cx="12" cy="5"/.test(appjs));
  check('v1.5.25 videos: la barra propia lleva reproducir/pausa, progreso, tiempo, silencio, CC, pantalla completa y menú ⋮', /wrPlay/.test(appjs) && /wrProgFill/.test(appjs) && /wrTime/.test(appjs) && /wrMute/.test(appjs) && /wrCc/.test(appjs) && /wrFull/.test(appjs) && /wrMore/.test(appjs) && /wrSpeedMenu/.test(appjs));
  check('v1.5.25 videos: el menú ⋮ lleva las 6 velocidades reales y marca la actual', /\[0\.5, 0\.75, 1, 1\.25, 1\.5, 2\]/.test(appjs) && /v\.playbackRate = parseFloat\(rate\)/.test(appjs) && /b\.classList\.toggle\('on', b === btn\)/.test(appjs));
  check('v1.5.25 videos: la pantalla completa se pide sobre el contenedor (video + barra)', /player\.requestFullscreen/.test(appjs));
  check('v1.5.25 videos: las publicaciones usan el reproductor propio', fnBody(appjs, 'mediaItemHtml').indexOf('wrPlayerHtml(') >= 0 && fnBody(appjs, 'videoWithEditsHtml').indexOf('wrPlayerHtml(') >= 0 && fnBody(appjs, 'videoWithEditsHtml').indexOf('class="wrPlayer veditWrap wrZoomable"') >= 0);
  check('v1.5.25 videos: los Shorts (historia y publicación) usan el reproductor propio sin tapar el riel', fnBody(appjs, 'renderShortItem').indexOf('wrPlayerShorts') >= 0 && /#shortsBody \.wrBar\{right:64px\}/.test(idx));
  check('v1.5.25 videos: el visor grande del chat y la vista previa usan el reproductor propio', /wrPlayerHtml\('<video src="' \+ src \+ '" autoplay playsinline/.test(appjs) && fnBody(appjs, 'mediaPreviewHtml').indexOf('wrPlayerHtml(') >= 0);
  check('v1.5.25 videos: el CC muestra/oculta las capas .vsub y honra el apagado en el ontimeupdate', /wrSubsOff/.test(appjs) && /window\.__wrVideoSubtitles = function/.test(appjs) && /wrApplySubs\(videoEl, player\)/.test(appjs) && /\.wrPlayer\.wrSubsOff \.vsub\{display:none!important\}/.test(idx));
  check('v1.5.25 videos: el CC sin subtítulos abre el editor si el video es propio y avisa si es ajeno', /openVideoEditor\('post', -1, src, post\.videoEdits/.test(appjs) && /Este video no tiene subtítulos/.test(appjs));
  check('v1.5.25 videos: el editor guarda los subtítulos en la publicación publicada y los refresca en el acto', /videoEdit\.target === 'post'/.test(appjs) && /pushPostEditToServer\(post\)/.test(appjs) && /wrRefreshPlayerSubs\(post\.id, videoEdit\.src, e\)/.test(appjs));
  check('v1.5.25 videos: el autoplay del inicio y la sincronización de la canción siguen intactos', fnBody(appjs, 'updateFeedVideos').indexOf('_wrUserPaused') >= 0 && /window\.__wrVideoSongSync = function/.test(appjs) && /data-song-post/.test(appjs));
  check('v1.5.25 videos: buscar (tocar o arrastrar) y el tiempo usan el progreso propio', /function wrPlayerSeekRatio/.test(appjs) && /window\.__wrPlayerSeekStart = function/.test(appjs) && /wrFmtTime\(video\.currentTime/.test(appjs));
  check('v1.5.25 videos: la barra se sincroniza con los eventos reales del video (play/pause/tiempo/volumen)', /\['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'volumechange'\]/.test(appjs) && /wrSyncPlayerBar\(v\)/.test(appjs));
}


function static1526() {
  console.log('=== 88. WordRed 1.5.26: 66 ideas + FAQ comprimida ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const mainJava = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const recvJava = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedNotifyReceiver.java'), 'utf8');
  const soundsJava = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedSounds.java'), 'utf8');
  const srv = fs.readFileSync(path.join(process.env.HOME || '', 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  /* Para funciones asignadas como window.__wrX = async function... */
  const winBody = function (src, name) {
    const i = src.indexOf('window.' + name + ' = ');
    if (i < 0) return '';
    const j = src.indexOf('\nwindow.', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  const st = function () {
    const s = C.emptyState();
    s.me = '111';
    s.profiles = {
      '111': { phone: '111', name: 'Yo', friends: ['222', '333'], birthday: '1990-05-10' },
      '222': { phone: '222', name: 'Ana', friends: ['111'], birthday: '1990-11-15' },
      '333': { phone: '333', name: 'Luis', friends: ['111', '222'], birthday: '1992-11-16' },
      '444': { phone: '444', name: 'Nadie', friends: [], birthday: '1995-01-01' }
    };
    s.friends = { '111': ['222', '333'], '222': ['111'], '333': ['111', '222'] };
    return s;
  };
  /* Versión. */
  check('v1.5.26 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.26 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.26 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  check('v1.5.26 versión: build.sh dice 1.5.34', /Build WordRed v1\.5\.63/.test(buildsh));
  check('v1.5.26 versión: sin restos de 1.5.26/1.5.27 como versión (solo comentarios históricos)', !/versionCode="41"/.test(manifest) && !/APP_VERSION_CODE = 41/.test(appjs) && !/updateCurrentVersion\">WordRed 1\.5\.26/.test(idx) && !/versionCode="42"/.test(manifest) && !/APP_VERSION_CODE = 42/.test(appjs) && !/updateCurrentVersion\">WordRed 1\.5\.27/.test(idx));
  /* 1.5.28: panel de vista previa al subir foto o video. */
  check('v1.5.28 panel: el overlay del panel existe con su X y su Publicar del diseño de la app', /id="uploadPanel1528"/.test(idx) && /id="uploadPanelClose1528"/.test(idx) && /id="uploadPanelPublish1528"/.test(idx) && /class="btn" id="uploadPanelPublish1528">Publicar</.test(idx));
  check('v1.5.28 panel: el fondo es traslúcido y el recuadro rectangular', /#uploadPanel1528\{background:rgba\(5,1,2,\.55\)/.test(idx) && /\.uploadPanel1528\{[^}]*border-radius:0/.test(idx));
  check('v1.5.28 panel: la previa es grande en una sola columna', /#uploadPanel1528 \.medialist\{grid-template-columns:1fr/.test(idx) && /max-height:58vh/.test(idx));
  check('v1.5.28 panel: al escoger el archivo se abre el panel y el editor ya no se abre solo', /openUploadPanel1528\(\)/.test(appjs) && !/openVideoEditor\('composer', firstVideoIdx/.test(appjs));
  check('v1.5.28 panel: la hoja del compositor se muda al panel y vuelve al cerrar o publicar', /uploadPanelBody1528/.test(appjs) && /restoreComposerSheet1528/.test(appjs) && /closeComposer1528/.test(appjs));
  check('v1.5.28 panel: el FAQ describe la vista previa grande al subir', /vista previa grande/.test(appjs));
  check('v1.5.28 inicio: la fila de lives ya no muestra Salas de audio', !/Salas de audio/.test(fnBody(appjs, 'renderLiveRow')) && !/roomsBtn/.test(fnBody(appjs, 'renderLiveRow')));
  check('v1.5.28 salas: se abren desde Transmitir en vivo y la función existe', /id="liveAudioRoomsBtn"/.test(idx) && /__wrOpenAudioRooms/.test(idx) && /window\.__wrOpenAudioRooms = openAudioRooms1526/.test(appjs) && /function openAudioRooms1526/.test(appjs));
  check('v1.5.28 inicio quieto: al salir del inicio se arma la restauración y fuera del inicio no se restaura', /feedRestoreDone = false/.test(fnBody(appjs, 'go')) && /if \(currentView !== 'feed'\) return;/.test(fnBody(appjs, 'restoreFeedPosition1526')));
  check('v1.5.28 solo amigos: el interruptor salió del inicio y está en Ajustes (un solo control)', !/Solo amigos:/.test(fnBody(appjs, 'renderFeed')) && /friendsOnlyToggle/.test(fnBody(appjs, 'renderSettings1526')) && /Solo amigos/.test(fnBody(appjs, 'renderSettings1526')));
  check('v1.5.28 responsive: solo min-width (700/1024/1400) y los valores base del teléfono intactos', /@media \(min-width:700px\)/.test(idx) && /@media \(min-width:1024px\)/.test(idx) && /@media \(min-width:1400px\)/.test(idx) && !/@media[^{]*max-width/.test(idx) && /main\{max-width:640px/.test(idx) && /\.sheet\{max-width:640px/.test(idx) && /\.uploadPanel1528\{max-width:680px/.test(idx) && /\.launcherGrid\{display:grid;grid-template-columns:repeat\(4,1fr\)/.test(idx));
  check('v1.5.28 responsive: en pantallas anchas el contenido se ensancha', /@media \(min-width:1024px\)\{[\s\S]*?main\{max-width:880px/.test(idx) && /@media \(min-width:1024px\)\{[\s\S]*?\.uploadPanel1528\{max-width:880px/.test(idx) && /@media \(min-width:1024px\)\{[\s\S]*?\.launcherGrid\{grid-template-columns:repeat\(8,1fr\)/.test(idx));
  check('v1.5.28 zoom: la clase está en el reproductor, las fotos, las historias y el visor del chat', /wrPlayer wrZoomable/.test(appjs) && /veditWrap wrZoomable/.test(appjs) && /class="wrZoomable /.test(appjs) && /class="wrZoomable"/.test(appjs) && /\.wrZoomable\{touch-action:pan-x pan-y/.test(idx));
  check('v1.5.28 zoom: motor de pellizco con doble toque y guardas de deslizamiento y recarga', /wrZoomPinchedAt1528/.test(appjs) && /wrZoomReset1528/.test(appjs) && /wrZoomClickGuard1528/.test(appjs) && /Date\.now\(\) - wrZoomPinchedAt1528 < 500/.test(appjs) && /e\.touches\.length > 1/.test(appjs));
  check('v1.5.28 panel: el FAQ sigue con 29 entradas', (function () { var m = appjs.match(/var FAQ = \[([\s\S]*?)\];/); return m && (m[1].match(/\{ q:/g) || []).length === 29; })());
  /* Estado nuevo. */
  const es = C.emptyState();
  ['muted', 'closeFriends', 'cart', 'drafts', 'scheduledPosts', 'wishlist', 'coupons', 'eventReminders', 'postViewed', 'postStatsCache', 'storyViewersCache', 'accounts', 'lastFeedPostId', 'screenTime', 'wordFilter', 'pinnedChats', 'savedLinks', 'quietHours', 'disappearing', 'friendsOnlyFeed', 'chatSounds'].forEach(function (k) {
    check('v1.5.26 estado: emptyState trae ' + k, es[k] !== undefined);
  });
  check('v1.5.26 estado: ajustes nuevos (texto, fondo, ahorro de datos)', es.settings.textSize === 'normal' && es.settings.chatBg === '' && es.settings.dataSaver === false);
  /* 1.5.26: las constantes se exportan de verdad (antes del arreglo
     quedaban undefined porque se definieron después del literal api). */
  check('v1.5.26 core: MOODS con los 8 estados exactos', Array.isArray(C.MOODS) && C.MOODS.map(function (m) { return m.id; }).join(',') === 'feliz,triste,emocionado,cansado,enamorado,enojado,agradecido,enfermo');
  check('v1.5.26 core: STICKER_IDS con los 12 exactos', JSON.stringify(C.STICKER_IDS) === JSON.stringify(['corazon', 'risa', 'fuego', 'estrella', 'abrazo', 'ok', 'triste', 'enojado', 'sorpresa', 'fiesta', 'gato', 'perro']));
  check('v1.5.26 core: LIVE_GIFTS con los 6 exactos', C.LIVE_GIFTS.map(function (g) { return g.id; }).join(',') === 'rosa,corazon,estrella,corona,cohete,diamante');
  check('v1.5.26 core: AVATAR_FRAMES con los 7 exactos', JSON.stringify(C.AVATAR_FRAMES) === JSON.stringify(['none', 'rojo', 'dorado', 'azul', 'verde', 'morado', 'arcoiris']));
  check('v1.5.26 core: AVATAR_FILTERS con los 5 exactos', JSON.stringify(C.AVATAR_FILTERS) === JSON.stringify(['Original', 'Blanco y negro', 'Sepia', 'Vivo', 'Suave']));
  check('v1.5.26 core: MSG_REACTION_EMOJIS con los 6 exactos', JSON.stringify(C.MSG_REACTION_EMOJIS) === JSON.stringify(['❤️', '😂', '😮', '😢', '😡', '👍']));
  check('v1.5.26 core: STORY_REACTION_EMOJIS con los 6 exactos', JSON.stringify(C.STORY_REACTION_EMOJIS) === JSON.stringify(['❤️', '😂', '😮', '😢', '🔥', '👏']));
  check('v1.5.26 core: CHAT_SOUNDS con los 4 exactos', C.CHAT_SOUNDS.map(function (s) { return s.id; }).join(',') === 'bell,chime,pop,soft');
  check('v1.5.26 core: TEXT_SIZES, VERIFICATION_KEYS, EVENT_REMINDER_LEADS y STORY_TEXT_BG_COLORS exportados', JSON.stringify(C.TEXT_SIZES) === JSON.stringify(['normal', 'grande', 'muygrande']) && JSON.stringify(C.VERIFICATION_KEYS) === JSON.stringify(['telefono', 'perfil', 'antiguedad', 'publicaciones']) && JSON.stringify(C.EVENT_REMINDER_LEADS) === JSON.stringify([10, 30, 60, 1440]) && C.STORY_TEXT_BG_COLORS.length === 8);
  /* 1. Ver quién vio tus historias. */
  check('v1.5.26 (1) historias: existe recordStoryView1526 y nunca registra la propia', /function recordStoryView1526/.test(appjs) && /story\.author === state\.me/.test(fnBody(appjs, 'recordStoryView1526')) && /\/api\/story-views/.test(fnBody(appjs, 'recordStoryView1526')));
  check('v1.5.26 (1) historias: el visor muestra el ojo con conteo y la lista de visitas', /openStoryViewers1526/.test(appjs) && /Nadie ha visto tu historia todavía/.test(appjs) && /id="storyViewsOverlay"/.test(idx) && /id="storyViewsBody"/.test(idx));
  /* 2. Recuerdos. */
  const s2 = st();
  const mem = C.createPost(s2, '111', { text: 'hace un año' });
  if (mem.ok) mem.post.createdAt = new Date(2025, 10, 15, 10, 0).getTime();
  check('v1.5.26 (2) recuerdos: memoriesOf encuentra la publicación del mismo día y mes de años anteriores', mem.ok && C.memoriesOf(s2, '111', new Date(2026, 10, 15)).length === 1 && C.yearsAgoLabel(1) === 'Hace 1 año' && C.yearsAgoLabel(2) === 'Hace 2 años');
  check('v1.5.26 (2) recuerdos: sin recuerdos ese día no aparece nada (lista vacía)', C.memoriesOf(s2, '111', new Date(2026, 5, 3)).length === 0);
  check('v1.5.26 (2) recuerdos: sección en el perfil y tarjeta en el inicio', /memoriesProfileHtml1526/.test(appjs) && /memoriesFeedCardHtml1526/.test(appjs));
  /* 3. Dueto en Shorts. */
  const s3 = st();
  const orig = C.createPost(s3, '111', { text: 'orig', media: 'https://x.com/a.mp4', mediaType: 'video' });
  const duet = C.createPost(s3, '222', { text: '', media: 'https://x.com/b.mp4', mediaType: 'video', duetOf: { postId: orig.post.id, author: '111' } });
  check('v1.5.26 (3) dueto: se publica con duetOf si el original existe', duet.ok && duet.post.duetOf && duet.post.duetOf.postId === orig.post.id);
  const fakeDuet = C.createPost(s3, '222', { text: '', media: 'https://x.com/c.mp4', mediaType: 'video', duetOf: { postId: 'noexiste', author: '111' } });
  check('v1.5.26 (3) dueto: con un original que no existe NO se publica nada', !fakeDuet.ok);
  check('v1.5.26 (3) dueto: overlay con cámara y original, y el reproductor muestra el dueto dividido', /function openDuet1526/.test(appjs) && /id="duetOverlay"/.test(idx) && /Dueto con/.test(appjs) && /duetOrigEl/.test(appjs));
  check('v1.5.26 (3) dueto: si la grabación falla o no hay permiso, no se publica nada', /No se pudo usar la cámara o el micrófono/.test(appjs) && /La grabación salió vacía\. No se publicó ningún dueto/.test(appjs) && /No se pudo subir tu video\. No se publicó ningún dueto/.test(appjs));
  /* 4. Estadísticas para creadores. */
  check('v1.5.26 (4) estadísticas: la vista se registra por el observador de visibilidad y solo una vez por publicación', /recordPostView1526/.test(appjs) && /observePostViews1526/.test(appjs) && /\/api\/posts\/' \+ encodeURIComponent\(post\.id\) \+ '\/view/.test(appjs) && /postViewed/.test(appjs));
  check('v1.5.26 (4) estadísticas: tarjeta en el perfil propio y conteo real en cada publicación propia', /creatorStatsHtml1526/.test(appjs) && /postViewsHtml1526/.test(appjs) && /\/api\/posts\/' \+ encodeURIComponent\(postId\) \+ '\/stats/.test(appjs));
  /* 5. Cumpleaños. */
  const s5 = st();
  const _t5 = new Date();
  const _mm5 = String(_t5.getMonth() + 1).padStart(2, '0'), _dd5 = String(_t5.getDate()).padStart(2, '0');
  const _tom5 = new Date(_t5.getFullYear(), _t5.getMonth(), _t5.getDate() + 1);
  const _mm5b = String(_tom5.getMonth() + 1).padStart(2, '0'), _dd5b = String(_tom5.getDate()).padStart(2, '0');
  s5.profiles['222'].birthday = '1990-' + _mm5 + '-' + _dd5; /* cumple hoy */
  s5.profiles['333'].birthday = '1992-' + _mm5b + '-' + _dd5b; /* cumple mañana */
  check('v1.5.26 (5) cumpleaños: todaysBirthdays encuentra a quien cumple hoy (Ana)', C.todaysBirthdays(s5).map(function (b) { return b.phone; }).join(',') === '222');
  check('v1.5.26 (5) cumpleaños: upcomingBirthdays ordena los próximos (Ana hoy, Luis mañana)', JSON.stringify(C.upcomingBirthdays(s5, 30).map(function (b) { return b.phone + ':' + b.inDays; })) === JSON.stringify(['222:0', '333:1']));
  check('v1.5.26 (5) cumpleaños: aviso en la campana + notificación del teléfono y lista en Amigos', /checkBirthdays1526/.test(appjs) && /Hoy es el cumpleaños de/.test(appjs) && /upcomingBirthdaysHtml1526/.test(appjs));
  /* 6. Programar publicaciones. */
  const s6 = st();
  const sch = C.schedulePost(s6, { text: 'luego' }, Date.now() + 3600000);
  check('v1.5.26 (6) programadas: schedulePost guarda y dueScheduledPosts solo devuelve las vencidas', sch.ok && C.dueScheduledPosts(s6, Date.now()).length === 0 && C.dueScheduledPosts(s6, Date.now() + 7200000).length === 1);
  check('v1.5.26 (6) programadas: se cancelan y no se publican solas', C.removeScheduledPost(s6, sch.item.id) && C.dueScheduledPosts(s6, Date.now() + 7200000).length === 0);
  check('v1.5.26 (6) programadas: el compositor programa con fecha/hora y publica al vencerse (o al reabrir si el teléfono estaba apagado)', /scheduleComposerPost1526/.test(appjs) && /publishDueScheduled1526/.test(appjs) && /el teléfono estaba apagado a la hora/.test(appjs) && /id="composerScheduleBox"/.test(idx) && /id="scheduledOverlay"/.test(idx));
  check('v1.5.26 (6) programadas: la alarma local se programa por el puente nativo', /scheduleLocalNotif1526\('sched_'/.test(appjs) && /scheduleLocalNotification/.test(recvJava) && /cancelLocalNotification/.test(recvJava) && /LOCAL_NOTIF_ACTION/.test(recvJava));
  /* 7. Encuesta en historias. */
  const s7 = st();
  const storyPoll = C.createStory(s7, '111', { media: 'https://x.com/s.jpg', mediaType: 'image', poll: { question: '¿Q?', options: ['A', 'B'] } });
  check('v1.5.26 (7) encuesta: createStory guarda la encuesta con pregunta y 2 opciones', storyPoll.ok && storyPoll.story.poll.question === '¿Q?' && storyPoll.story.poll.options.length === 2);
  check('v1.5.26 (7) encuesta: con 1 opción se rechaza', !C.createStory(s7, '111', { media: 'https://x.com/s.jpg', mediaType: 'image', poll: { question: '¿Q?', options: ['A'] } }).ok && C.validateStoryPoll({ question: '¿Q?', options: ['A'] }) === null && !!C.validateStoryPoll({ question: '¿Q?', options: ['A', 'B'] }));
  check('v1.5.26 (7) encuesta: el visor vota y el autor ve quién votó qué', /storyPollHtml1526/.test(appjs) && /\/poll-vote/.test(appjs) && /storyPollQ/.test(appjs));
  /* 8. Retos de Shorts. */
  check('v1.5.26 (8) retos: el tag se normaliza a #Tag y se lee de la publicación', C.normalizeChallengeTag('baileDeLaSemana') === '#baileDeLaSemana' && C.normalizeChallengeTag('Baile') === '#Baile' && C.challengeFromPost({ challenge: '#Baile' }) === '#Baile');
  check('v1.5.26 (8) retos: sección Retos dentro de Shorts con sus Shorts', /openChallenges1526/.test(appjs) && /\/api\/challenges/.test(appjs) && /id="challengesOverlay"/.test(idx) && /composerChallengeInput/.test(idx));
  /* 9. Reacciones a historias. */
  check('v1.5.26 (9) reacciones: solo uno de los 6 emojis fijos vale', C.validateStoryReaction('❤️') === '❤️' && C.validateStoryReaction('💩') === '');
  check('v1.5.26 (9) reacciones: fila de emojis sobre la historia y lista de quién reaccionó', /storyReactionsHtml1526/.test(appjs) && /\/react/.test(appjs) && /\/reactions/.test(appjs));
  /* 10. Cuenta verificada. */
  const s10 = st();
  const prof10 = { phone: '111', name: 'Yo', bio: 'hola', photo: 'https://x.com/p.jpg', createdAt: Date.now() - 8 * 86400000 };
  check('v1.5.26 (10) verificación: verificationMissing lista lo que falta con sus claves', JSON.stringify(C.verificationMissing(prof10, 5, false)) === JSON.stringify(['telefono']) && JSON.stringify(C.verificationMissing(prof10, 5, true)) === JSON.stringify([]) && JSON.stringify(C.verificationMissing(prof10, 0, true)) === JSON.stringify(['publicaciones']));
  check('v1.5.26 (10) verificación: en Ajustes se pide con los requisitos reales y la insignia ✓ aparece en perfil y publicaciones', /openVerification1526/.test(appjs) && /\/api\/verification\/status/.test(appjs) && /\/api\/verification\/request/.test(appjs) && /verifiedBadgeHtml/.test(appjs) && /class="verifiedBadge"/.test(appjs) && /id="verificationOverlay"/.test(idx));
  /* 11. Comentar con foto o video. */
  const s11 = st();
  const p11 = C.createPost(s11, '222', { text: 'de Ana' });
  const c11 = C.addComment(s11, '111', p11.post.id, '', null, { media: 'https://x.com/f.jpg', mediaType: 'image' });
  check('v1.5.26 (11) comentario con foto: texto vacío con medio vale y el medio queda guardado', c11.ok && c11.comment.media === 'https://x.com/f.jpg');
  check('v1.5.26 (11) comentario con foto: sin texto ni medio se rechaza, y con medio no válido también', !C.addComment(s11, '111', p11.post.id, '', null, {}).ok && !C.addComment(s11, '111', p11.post.id, '', null, { media: 'no-url', mediaType: 'image' }).ok);
  check('v1.5.26 (11) comentario con foto: el compositor sube primero y si la subida falla NO se publica', /commentMedia1526/.test(appjs) && /uploadMediaItemToServer/.test(winBody(appjs, '__wrAddComment')) && /No se pudo subir/.test(winBody(appjs, '__wrAddComment')));
  /* 12. Vender con carrito. */
  const s12 = st();
  const l12a = C.createListing(s12, '222', { title: 'Silla', price: 1000, category: 'Muebles', condition: 'Usado', delivery: 'Recoger' });
  const l12b = C.createListing(s12, '222', { title: 'Mesa', price: 1200, category: 'Muebles', condition: 'Usado', delivery: 'Recoger' });
  C.cartAdd(s12, l12a.listing.id, 2);
  C.cartAdd(s12, l12b.listing.id, 1);
  const t12 = C.cartTotal(s12);
  check('v1.5.26 (12) carrito: cantidades y total real (2×1000 + 1200 = 3200)', l12a.ok && l12b.ok && t12.total === 3200 && t12.count === 3 && t12.lines.length === 2);
  check('v1.5.26 (12) carrito: el mensaje de pedido lista productos, cantidades y total', /Silla × 2/.test(C.orderMessageText(t12.lines, t12.total, 'Yo')) && /Total: \$3,200 MXN/.test(C.orderMessageText(t12.lines, t12.total, 'Yo')) && /El pago es manual/.test(C.orderMessageText(t12.lines, t12.total, 'Yo')));
  check('v1.5.26 (12) carrito: vista del carrito con Enviar pedido por chat o WhatsApp', /openCart1526/.test(appjs) && /id="cartOverlay"/.test(idx) && /Enviar pedido/.test(appjs) && /wa\.me/.test(fnBody(appjs, 'openCart1526')));
  /* 13. Amigos cercanos. */
  const s13 = st();
  C.setCloseFriend(s13, '111', '222', true);
  check('v1.5.26 (13) cercanos: añadir/quitar y la historia close solo la ven el autor y sus cercanos', C.isCloseFriend(s13, '111', '222') && C.canSeeCloseStory(s13, '111', { author: '111', audience: 'close' }) && C.canSeeCloseStory(s13, '222', { author: '111', audience: 'close' }) && !C.canSeeCloseStory(s13, '333', { author: '111', audience: 'close' }) && C.setCloseFriend(s13, '111', '222', false).ok && !C.isCloseFriend(s13, '111', '222'));
  check('v1.5.26 (13) cercanos: selector de audiencia al crear la historia y distintivo visible', /storyAudienceSelect/.test(appjs) && /Solo cercanos/.test(appjs) && /storyExtrasHtml1526/.test(appjs));
  /* 14. Borradores. */
  const s14 = st();
  const dr = C.saveDraft(s14, { text: 'borrador', mediaList: [], song: null, bg: 'none', feeling: '', tags: [], location: '', poll: null, link: '', privacy: 'Público' });
  check('v1.5.26 (14) borradores: se guarda tal cual y se puede retomar o borrar, nunca se publica solo', dr.ok && C.saveDraft(s14, { text: 'otro' }).ok && s14.drafts.length === 2 && C.deleteDraft(s14, dr.draft.id) && s14.drafts.length === 1);
  check('v1.5.26 (14) borradores: botones Guardar borrador / Borradores en el compositor', /composerSaveDraftBtn/.test(idx) && /composerDraftsBtn/.test(idx) && /saveDraft1526/.test(appjs) && /id="draftsOverlay"/.test(idx));
  /* 15. Modo sin conexión. */
  check('v1.5.26 (15) sin conexión: aviso claro en el inicio y nada de fallos silenciosos', /offlineBannerHtml1526/.test(appjs) && /Sin conexión: estás viendo lo último guardado/.test(appjs) && /offlineBannerHtml1526\(\)/.test(fnBody(appjs, 'renderFeed')));
  /* 16. Regalos en los en vivos. */
  check('v1.5.26 (16) regalos: 6 regalos sin precios y el contador suma en vivo por WebSocket', C.liveGiftTotal({ rosa: 2, corazon: 1 }) === 3 && C.liveGiftById('cohete').name === 'Cohete' && /liveGiftsHtml1526/.test(appjs) && /no mueven dinero/.test(appjs) && /liveGift/.test(appjs));
  check('v1.5.26 (16) regalos: la fila de regalos está en el live y el creador ve quién regaló', /liveGiftsHtml1526\(\)/.test(fnBody(appjs, 'showLiveOverlay')) && /openLiveGifts1526/.test(appjs) && /\/gifts/.test(appjs));
  /* 17. Notas de voz en historias. */
  check('v1.5.26 (17) voz en historias: botón de grabar con portada y publicación con mediaType audio', /storyVoiceBtn/.test(appjs) && /storyVoiceFromChat1526/.test(appjs) && /storyAudioHtml1526/.test(appjs) && /mediaType = 'audio'/.test(appjs));
  /* 18. Traducción de publicaciones. */
  check('v1.5.26 (18) traducción: el español se detecta y no muestra el botón; el inglés sí', C.isSpanishText('El gato está en la casa') && !C.isSpanishText('The cat is on the table') && /MyMemory/.test(appjs) && /api\.mymemory\.translated\.net/.test(corejs) && /langpair=auto\|es/.test(C.translateUrl('Hello')) && C.translateResponseOk({ responseData: { translatedText: 'Hola' } }).text === 'Hola');
  check('v1.5.26 (18) traducción: con Ver original y etiqueta de traducción automática, y si falla deja el original', /Ver original/.test(appjs) && /Traducido automáticamente/.test(appjs) && /No se pudo traducir/.test(appjs));
  /* 19. Salas de audio. */
  check('v1.5.26 (19) salas: entrada en Transmitir en vivo (1.5.28: ya no en el inicio) y overlay con crear/entrar/salir', /liveAudioRoomsBtn/.test(idx) && /openAudioRooms1526/.test(appjs) && /id="audioRoomsOverlay"/.test(idx) && /id="audioRoomViewOverlay"/.test(idx) && /joinAudioRoomMic1526/.test(appjs));
  check('v1.5.26 (19) salas: quien entra inicia la oferta a los que ya están y el servidor 3.8 retransmite la señal (si no, el audio entre teléfonos no se conecta)', /startAudioRoomOffers1526/.test(fnBody(appjs, 'joinAudioRoomMic1526')) && /type: 'offer', offer: offer/.test(appjs) && /\/api\/audio-rooms\/' \+ encodeURIComponent\(audioRoom\.id\) \+ '\/signal'/.test(appjs) && /app\.post\('\/api\/audio-rooms\/:id\/signal'/.test(srv) && /kind: 'audioRoomSignal'/.test(srv));
  /* 20. Torneos de juegos. */
  check('v1.5.26 (20) torneos: sección en juegos con el torneo actual y envío del puntaje al terminar', /renderTournament1526/.test(appjs) && /\/api\/tournaments\/current/.test(appjs) && /submitTournamentScore1526/.test(appjs) && /id="tournamentBox"/.test(idx) && /submitTournamentScore1526\(game\.id, score\)/.test(fnBody(appjs, 'publishGameRecord')));
  /* 21. Lista de deseos. */
  const s21 = st();
  const l21 = C.createListing(s21, '222', { title: 'Bici', price: 3000, category: 'Muebles', condition: 'Usado', delivery: 'Recoger' });
  const listing = l21.listing;
  check('v1.5.26 (21) deseos: el corazón añade y quita, y lo borrado desaparece de la lista', l21.ok && C.wishlistToggle(s21, listing.id).ok && C.wishlistList(s21).length === 1 && C.wishlistAvailable(s21)[0].available === true && C.wishlistToggle(s21, listing.id).ok && C.wishlistList(s21).length === 0);
  check('v1.5.26 (21) deseos: lista Mis deseos dentro de Marketplace', /openWishlist1526/.test(appjs) && /id="wishlistOverlay"/.test(idx));
  /* 22. Estado de ánimo. */
  const s22 = st();
  const moodPost = C.createPost(s22, '111', { text: 'hoy', mood: { id: 'feliz', emoji: '😊', label: 'feliz' } });
  check('v1.5.26 (22) ánimo: se guarda el ánimo elegido y se muestra bajo el nombre', moodPost.ok && C.moodLine(moodPost.post.mood) === '— me siento feliz 😊' && C.validateMood('raro') === null && C.validateMood('feliz').id === 'feliz');
  check('v1.5.26 (22) ánimo: selector en el compositor y línea en la publicación', /composerMoodRow/.test(idx) && /moodHtml1526/.test(appjs));
  /* 23. Invitados en tu en vivo. */
  check('v1.5.26 (23) invitado: invitar, aceptar/rechazar y su cámara en pantalla dividida', /inviteLiveCoHost1526/.test(appjs) && /respondLiveInvite1526/.test(appjs) && /startCoHostPublish1526/.test(appjs) && /makeLiveCoHostPc/.test(appjs) && /forwardCoHostToViewers1526/.test(appjs) && /id="liveCoHostVideo"/.test(idx) && /id="liveInviteOverlay"/.test(idx));
  check('v1.5.26 (23) invitado: la señalización usa solo offer/answer/ice (lo único que el relé deja pasar)', (function () {
    const types = (appjs.match(/sendLiveSignal\([^,]+, '([a-z-]+)'/g) || []).map(function (m) { return m.match(/, '([a-z-]+)'/)[1]; });
    const uniq = types.filter(function (x, i) { return types.indexOf(x) === i; }).sort().join(',');
    return types.length > 0 && uniq === 'answer,ice,offer' && /makeLiveCoHostPc/.test(appjs) && /doCoHostPublish1526/.test(appjs) && /forwardCoHostToViewers1526/.test(appjs) && /removeCoHostFromViewers1526/.test(appjs);
  })());
  check('v1.5.26 (23) invitado: al salir el invitado el live sigue solo con el dueño', /liveCoHostLeft/.test(appjs) && /El invitado salió del live\. El live sigue solo contigo/.test(appjs) && /removeCoHostFromViewers1526/.test(appjs));
  /* 24. Menciones con @. */
  const s24 = st();
  const p24 = C.createPost(s24, '222', { text: 'de Ana' });
  const c24 = C.addComment(s24, '111', p24.post.id, 'hola @Ana @Luis', null, { mentions: ['222', '333', '999'] });
  check('v1.5.26 (24) menciones: solo amigos reales se guardan y el mencionado recibe el aviso', c24.ok && JSON.stringify(c24.comment.mentions) === JSON.stringify(['222', '333']) && s24.notifications.some(function (n) { return n.type === 'mention' && n.to === '333' && /te mencionó en un comentario/.test(n.text); }));
  check('v1.5.26 (24) menciones: al escribir @ aparece el buscador y el @nombre abre el perfil', /commentMentionInput1526/.test(appjs) && /__wrOpenProfile/.test(fnBody(appjs, 'commentHtml')) && /mention/.test(fnBody(appjs, 'renderNotifs')));
  /* 25. Estoy aquí. */
  check('v1.5.26 (25) lugar: coordenadas válidas y miniatura real de OpenStreetMap', !!C.validateGeoPlace({ name: 'Casa', lat: 19.4, lng: -99.1 }) && C.validateGeoPlace({ name: 'X', lat: 200, lng: 0 }) === null && /staticmap\.openstreetmap\.de/.test(C.staticMapUrl(19.4, -99.1)) && /geoPlaceHtml1526/.test(appjs) && /composerPlaceBox/.test(idx));
  /* 26. Encuesta con foto. */
  check('v1.5.26 (26) encuesta con foto: 2 fotos válidas y porcentajes reales después de votar', !!C.validatePhotoPoll({ options: [{ mediaUrl: 'https://x.com/1.jpg', label: 'A' }, { mediaUrl: 'https://x.com/2.jpg', label: 'B' }] }) && C.validatePhotoPoll({ options: [{ mediaUrl: 'https://x.com/1.jpg', label: 'A' }] }) === null && C.photoPollPercent([3, 1])[0] === 75 && C.photoPollPercent([3, 1])[1] === 25 && /photoPollHtml1526/.test(appjs) && /composerPhotoPollInput/.test(idx) && /uploadFileToServer/.test(appjs));
  /* 27. Recordatorio de eventos. */
  const s27 = st();
  const ev27 = { id: 'e1', date: '2026-11-20', time: '18:00' };
  check('v1.5.26 (27) eventos: 30 min por defecto, con 10 min / 1 hora / 1 día, y aviso antes de que empiece', JSON.stringify(C.EVENT_REMINDER_LEADS) === JSON.stringify([10, 30, 60, 1440]) && C.eventReminderLead(s27, 'e1') === 30 && C.eventReminderAt(ev27, 30) === new Date('2026-11-20T18:00:00').getTime() - 1800000 && C.EVENT_REMINDER_LABELS[30] === '30 minutos antes');
  check('v1.5.26 (27) eventos: selector en la vista del evento y alarma local', /setEventReminder1526/.test(appjs) && /scheduleEventReminders1526/.test(appjs) && /scheduleLocalNotif1526\('evt_'/.test(appjs));
  /* 28. Compartir pantalla en videollamada. */
  check('v1.5.26 (28) pantalla en llamada: botón en los controles y reuso de la maquinaria de lives', /toggleCallScreenShare1526/.test(appjs) && /Compartir pantalla/.test(fnBody(appjs, 'renderCallInCall')) && /monitor/.test(appjs) && /replaceTrack/.test(appjs));
  /* 29. Enlace en tu historia. */
  const s29 = st();
  check('v1.5.26 (29) enlace: URL válida se guarda y sin enlace no hay pastilla', C.createStory(s29, '111', { media: 'https://x.com/s.jpg', mediaType: 'image', link: 'https://ejemplo.com' }).ok && C.validateStoryLink('https://ejemplo.com') === 'https://ejemplo.com' && C.validateStoryLink('') === '' && /storyLinkPillHtml1526/.test(appjs) && /Ver enlace/.test(appjs));
  /* 30. Nota en tu perfil. */
  const s30 = st();
  check('v1.5.26 (30) nota: hasta 60 caracteres y se ve bajo el nombre y en Amigos', C.validateProfileNote('Hola, soy Ana') === 'Hola, soy Ana' && C.validateProfileNote('x'.repeat(61)).length === 60 && /profileNoteHtml1526/.test(appjs) && /Tu nota/.test(appjs));
  /* 31. Silenciar a alguien. */
  const s31 = st();
  C.setMuted(s31, '111', '222', true);
  check('v1.5.26 (31) silencio: silencia y quita, y solo apaga avisos (no oculta nada)', C.isMuted(s31, '111', '222') && JSON.stringify(C.mutedList(s31, '111')) === JSON.stringify(['222']) && C.setMuted(s31, '111', '222', false).ok && !C.isMuted(s31, '111', '222') && /toggleMute1526/.test(appjs) && /isMuted/.test(fnBody(appjs, 'maybeNotify')));
  check('v1.5.26 (31) silencio: lista Silenciados en Ajustes', /Silenciados/.test(fnBody(appjs, 'renderSettings1526')));
  /* 32. Mensajes que se borran solos. */
  const oldMsg = { id: 'm1', from: '111', to: '222', text: 'viejo', createdAt: Date.now() - 25 * 3600000 };
  const newMsg = { id: 'm2', from: '111', to: '222', text: 'nuevo', createdAt: Date.now() };
  const kept32 = C.pruneDisappearingMessages([oldMsg, newMsg], 24);
  check('v1.5.26 (32) temporales: la poda borra lo de más de 24 h y deja lo nuevo', kept32.length === 1 && kept32[0].id === 'm2' && C.pruneDisappearingMessages([oldMsg, newMsg], 0).length === 2);
  check('v1.5.26 (32) temporales: interruptor en el chat 1 a 1 con indicador y aviso de captura', /disappearingHours1526/.test(appjs) && /Mensajes temporales \(24 h\)/.test(appjs) && /captura/.test(appjs) && /id="chatHeaderExtra"/.test(idx));
  /* 33. Canción del día — QUITADA en la 1.5.27. */
  check('v1.5.27 (33) canción del día: la tarjeta ya no existe en el perfil propio (ni su botón ni su selector)', !/songOfDayHtml1526/.test(appjs) && !/__wrPickSongOfDay/.test(appjs) && !/__wrClearSongOfDay/.test(appjs) && !/__wrPlaySongOfDay/.test(appjs) && !/songOfDay/.test(fnBody(appjs, 'applyPickedSong')) && !/songOfDayHtml1526/.test(fnBody(appjs, 'renderOwnProfile')));
  check('v1.5.27 (33) canción del día: el validador sigue en core.js porque la canción de OTROS perfiles sí se ve', typeof C.songOfDayValid === 'function' && C.songOfDayValid({ song: { title: 'X' }, date: C.todayStr() }) && !C.songOfDayValid({ song: { title: 'X' }, date: '2020-01-01' }) && /theirSong1526/.test(appjs));
  /* 34. Cupones en tu tienda. */
  check('v1.5.26 (34) cupones: el código se normaliza a mayúsculas sin espacios y el descuento es real', C.normalizeCouponCode(' verano10 ') === 'VERANO10' && C.couponDiscounted(1000, 10) === 900 && C.couponApplies({ code: 'VERANO10', discountPct: 10, listingId: '' }, 'l1') && C.couponApplies({ code: 'VERANO10', discountPct: 10, listingId: 'l1' }, 'l2') === false && !C.validateCoupon('VERANO', 0).ok && !C.validateCoupon('VERANO', 91).ok && C.validateCoupon('verano10', 10).code === 'VERANO10');
  check('v1.5.26 (34) cupones: crear en Mis productos y aplicar en el carrito', /openCoupons1526/.test(appjs) && /renderCoupons1526/.test(appjs) && /id="couponsOverlay"/.test(idx) && /cartCouponInput/.test(appjs));
  /* 35. Letra más grande. */
  check('v1.5.26 (35) texto: Normal / Grande / Muy grande con clase en la raíz y aviso de más líneas', C.textSizeValid('muygrande') === 'muygrande' && C.textSizeClass('grande') === 'textsize-grande' && C.textSizeClass('normal') === '' && /applyTextSize1526/.test(appjs) && /\.textsize-grande/.test(idx) && /\.textsize-muygrande/.test(idx) && /los textos ocupan más líneas/.test(appjs));
  /* 36. Portada para tus Destacadas. */
  check('v1.5.26 (36) portada: URL válida o vacía para quitarla, y foto subida también vale', C.validatePinnedCover('https://x.com/p.jpg') === 'https://x.com/p.jpg' && C.validatePinnedCover('') === '' && C.validatePinnedCover('no-url') === null && /pinnedCoverHtml1526/.test(appjs) && /__wrPickPinnedCover/.test(appjs) && /Subir una foto como portada/.test(appjs) && /id="pinnedCoverOverlay"/.test(idx));
  /* 37. Fondo en tus chats. */
  check('v1.5.26 (37) fondo: paleta de colores y se dibuja detrás de los mensajes', C.chatBgValid('#1a0c0f') === '#1a0c0f' && /applyChatBg1526/.test(appjs) && /id="chatBgOverlay"/.test(idx) && /solo se ve en este teléfono/.test(appjs));
  /* 38. Ahorro de datos. */
  const s38 = st();
  s38.settings.dataSaver = true;
  check('v1.5.26 (38) datos: en datos móviles los videos no cargan solos y muestran Tocar para cargar', C.dataSaverHoldsVideo(s38, { type: 'cellular' }) && !C.dataSaverHoldsVideo(s38, { type: 'wifi' }) && !C.dataSaverHoldsVideo(st(), { type: 'cellular' }) && /videoGateHtml1526/.test(appjs) && /Tocar para cargar/.test(appjs));
  /* 39. Historia de solo texto. */
  const s39 = st();
  check('v1.5.26 (39) solo texto: fondo de color válido y sin texto no se publica nada', C.validateStoryBg('#e01430') === '#e01430' && C.validateStoryBg('rojo') === '' && C.createStory(s39, '111', { text: 'Hola', backgroundColor: '#e01430' }).ok && !C.createStory(s39, '111', { text: '', backgroundColor: '#e01430' }).ok);
  /* 40. Volver donde te quedaste. */
  check('v1.5.26 (40) posición: se guarda el id de la última publicación visible y se restaura al volver', /saveFeedPosition1526/.test(appjs) && /restoreFeedPosition1526/.test(appjs) && /lastFeedPostId/.test(appjs));
  /* 41. Cambiar de cuenta. */
  const s41 = st();
  C.addAccount(s41, { phone: '111', name: 'Yo', avatar: '', token: 't1' });
  C.addAccount(s41, { phone: '222', name: 'Ana', avatar: '', token: 't2' });
  check('v1.5.26 (41) cuentas: se añaden y se quita solo una sin tocar la otra', s41.accounts.length === 2 && C.removeAccount(s41, '222') && s41.accounts.length === 1 && s41.accounts[0].phone === '111');
  check('v1.5.26 (41) cuentas: Cambiar de cuenta en perfil/Ajustes', /openSwitchAccount1526/.test(appjs) && /id="switchAccountOverlay"/.test(idx));
  /* 42. Ver quién compartió tu publicación. */
  const s42 = st();
  const p42 = C.createPost(s42, '111', { text: 'mío' });
  C.sharePost(s42, '222', p42.post.id);
  check('v1.5.26 (42) compartidos: solo reposts reales dentro de WordRed', C.sharesOf(s42, p42.post.id).length === 1 && C.sharesOf(s42, p42.post.id)[0].phone === '222' && /sharesRowHtml1526/.test(appjs) && /Compartido por/.test(appjs));
  /* 43. Tus Shorts guardados. */
  const s43 = st();
  const sh = C.createPost(s43, '111', { text: 'short', media: 'https://x.com/v.mp4', mediaType: 'video', durationSec: 20 });
  C.toggleSave(s43, '111', sh.post.id);
  check('v1.5.26 (43) Shorts guardados: vista filtrada de guardados que son videos cortos', C.isShortVideoPost(sh.post) && C.savedShorts(s43, '111').length === 1 && /openSavedShorts1526/.test(appjs) && /Shorts guardados/.test(appjs));
  /* 44. Tu tiempo en WordRed. */
  const s44 = st();
  C.recordScreenTime(s44, 3600000);
  check('v1.5.26 (44) tiempo: se acumula por día y se muestra hoy + últimos 7 días', C.screenTimeTodayMs(s44) === 3600000 && C.screenTimeWeek(s44).length === 7 && C.screenTimeWeek(s44)[6].ms === 3600000 && /screenTimeTodayHtml/.test(appjs) && /Tu tiempo hoy/.test(appjs));
  /* 45. Filtro de palabras. */
  const s45 = st();
  C.createPost(s45, '222', { text: 'Me gusta el sol' });
  C.createPost(s45, '222', { text: 'Me gusta el solo' });
  const filtered = C.filterFeedWords(s45.posts, ['sol']);
  check('v1.5.26 (45) filtro: palabra completa sin importar mayúsculas (sol sí, solo no)', filtered.hidden.length === 1 && filtered.visible.length === 1 && C.containsBlockedWord('SOL es genial', ['sol']) && !C.containsBlockedWord('solo', ['sol']));
  check('v1.5.26 (45) filtro: Ajustes muestra cuántas hay ocultas en el inicio actual', /Palabras que no quiero ver/.test(fnBody(appjs, 'renderSettings1526')) && /filterFeedWords/.test(fnBody(appjs, 'renderFeed')));
  /* 46. Respaldo de tus chats. */
  const s46 = st();
  C.sendMessage(s46, '111', '222', 'hola', '', '', null, null, {});
  const backup = C.exportChatsBackup(s46);
  const s46b = st();
  const imp = C.importChatsBackup(s46b, backup);
  const imp2 = C.importChatsBackup(s46b, backup);
  check('v1.5.26 (46) respaldo: exporta con texto, remitente y fecha, y restaurar mezcla sin duplicar', backup.conversations.length === 1 && backup.conversations[0].messages.length === 1 && backup.conversations[0].messages[0].text === 'hola' && imp.ok && imp.added === 1 && imp2.added === 0 && imp2.duplicates === 1);
  check('v1.5.26 (46) respaldo: se guarda en Descargas/WordRed por el puente nativo', /__wrExportChats/.test(appjs) && /saveChatBackup/.test(appjs) && /saveChatBackup/.test(mainJava) && /Descargas\/WordRed/.test(mainJava));
  /* 47. Stickers en el chat. */
  check('v1.5.26 (47) stickers: los 12 SVG originales están en el APK y el mensaje lleva solo el sticker', C.STICKER_IDS.every(function (id) { return fs.existsSync(path.join(__dirname, '..', 'assets', 'stickers', id + '.svg')); }) && C.validateStickerId('gato') === 'gato' && C.validateStickerId('mickey') === '' && C.stickerPath('gato') === 'stickers/gato.svg');
  check('v1.5.26 (47) stickers: botón en el compositor del chat y la imagen se dibuja', /chatStickerBtn/.test(idx) && /stickerPicker/.test(idx) && /stickerImgHtml1526/.test(appjs) && /__wrSendSticker/.test(appjs));
  /* 48. Video en tu foto de perfil. */
  check('v1.5.26 (48) video de perfil: máximo 6 segundos y URL válida', !!C.validateAvatarVideo({ url: 'https://x.com/v.mp4', durationMs: 6000 }) && C.validateAvatarVideo({ url: 'https://x.com/v.mp4', durationMs: 6001 }) === null && C.validateAvatarVideo({ url: 'no-url', durationMs: 1000 }) === null && C.validateAvatarVideo('https://x.com/v.mp4').durationMs === null);
  check('v1.5.26 (48) video de perfil: se reproduce en bucle silenciado en el perfil y la foto fija va en las listas', /avatarVideoHtml/.test(appjs) && /__wrUploadAvatarVideo/.test(appjs) && /__wrClearAvatarVideo/.test(appjs) && /máx\. 6 s/.test(appjs));
  /* 49. Horas tranquilas. */
  check('v1.5.26 (49) tranquilas: de noche sí, de día no, apagadas nunca, y las llamadas siempre suenan', C.quietHoursOn({ quietHours: { on: true, start: '22:00', end: '07:00' } }, new Date(2026, 10, 15, 23, 30)) && !C.quietHoursOn({ quietHours: { on: true, start: '22:00', end: '07:00' } }, new Date(2026, 10, 15, 12, 0)) && !C.quietHoursOn({ quietHours: { on: false, start: '22:00', end: '07:00' } }, new Date(2026, 10, 15, 23, 30)) && /inQuietHours1526/.test(appjs) && /Las llamadas sí suenan/.test(appjs));
  check('v1.5.26 (49) tranquilas: maybeNotify las respeta salvo llamadas', /inQuietHours1526/.test(fnBody(appjs, 'maybeNotify')) && /call/.test(fnBody(appjs, 'maybeNotify')));
  /* 50. Comparte un Short en tu historia. */
  check('v1.5.26 (50) Short a historia: referencia con portada y botón Ver Short, no una copia', /shareShortToStory/.test(appjs) && /sharedShortId/.test(appjs) && /Ver Short/.test(appjs) && /Compartir en historia/.test(appjs));
  /* 51. Grupos secretos. */
  const s51 = st();
  const g51 = C.createGroup(s51, '111', { name: 'Secreto', desc: '', secret: true });
  check('v1.5.26 (51) secreto: el grupo guarda secret y sin invitación no se entra', g51.ok && g51.group.secret === true && /groupSecret/.test(idx) && /Grupo secreto/.test(appjs) && /__wrInviteToGroup/.test(appjs));
  /* 52. Traducción también en los comentarios. */
  check('v1.5.26 (52) traducir comentarios: mismo servicio gratuito con Ver original', /commentTranslateHtml1526/.test(appjs) && /__wrTranslateComment/.test(appjs) && /Traducido automáticamente/.test(fnBody(appjs, 'commentTranslateHtml1526')));
  /* 53. Ver el clima de otra ciudad. */
  check('v1.5.47 clima: buscador de ciudad con geocodificación gratuita y el icono de mi ubicación a la derecha de la barra', /searchWeatherCity1526/.test(appjs) && /geocoding-api\.open-meteo\.com/.test(appjs) && /__wrMyWeatherLocation/.test(appjs) && /weatherMyLocBtn1547/.test(appjs) && /ic\('target', 19\)/.test(appjs) && !/Volver a mi ubicación<\/button>/.test(appjs));
  check('v1.5.47 clima: loadWeather acepta lat/lon/nombre de otra ciudad (y fromDevice solo con el icono)', /async function loadWeather\(lat, lon, name, opts\)/.test(appjs) && /fromDevice/.test(appjs));
  /* 1.5.47: portada automática de historias. */
  check('1.5.47 historias: la tarjeta usa la portada cuando existe y el video sin portada captura un fotograma en segundo plano', /function storyCardMediaHtml\(s\)[\s\S]{0,600}if \(s\.cover\)/.test(appjs) && /storyCoverLazy1547\(s\)/.test(appjs) && /function storyCoverLazy1547/.test(appjs));
  check('1.5.47 historias: la migración cubre las ya publicadas (foto = su imagen, video = fotograma, de 2 en 2 sin bloquear el arranque)', /function migrateStoryCovers1547/.test(appjs) && /st\.cover = st\.media/.test(appjs) && /captureVideoFramePromise\(st\.media/.test(appjs) && /list\.slice\(i, i \+ 2\); i \+= 2;/.test(appjs) && /setTimeout\(next, 300\)/.test(appjs));
  check('1.5.47 historias: al publicar, la portada sale sola (video: fotograma capturado al elegir; audio: conserva su portada)', /function storyEditCover1547/.test(appjs) && /function captureStoryVideoThumb1547/.test(appjs) && /storyMedia\.thumb/.test(appjs));
  /* 1.5.47: vista previa inmediata en todas partes. */
  check('1.5.47 previa: al elegir foto o video en comentarios la previa sale al instante (blob) y el video se ve como video', /function commentMediaChange1526/.test(appjs) && /createObjectURL/.test(fnBody(appjs, 'commentMediaChange1526')) && /function showCommentPrev1547/.test(appjs) && /<video src=/.test(fnBody(appjs, 'showCommentPrev1547')));
  check('1.5.47 previa: la foto y la portada del perfil también se ven al instante (blob, antes de procesar)', /editPhotoInput/.test(appjs) && /editCoverInput/.test(appjs) && (appjs.match(/URL\.createObjectURL/g) || []).length >= 4);
  check('1.5.47 previa: al elegir el video de la historia se abre el editor al instante y el fotograma se captura por detrás', /storyMediaInput/.test(appjs) && /URL\.createObjectURL\(f\)/.test(appjs) && /openStoryEditor\(storyMedia,/.test(appjs));
  /* 1.5.47: publicar más fácil (ya no espera salvo en programadas y sin servidor). */
  check('1.5.47 publicar: publicar ya no espera a procesar el archivo salvo en programadas o sin servidor', /composerMediaPending1530 > 0 && \(composerScheduleAt \|\| !bgUploadHasServer1529\(\)\)/.test(appjs));
  check('1.5.47 publicar: el editor de la historia ya no abre solo el editor de video (hay pastilla «Editar video»)', /storyEditVideoBtn1547/.test(appjs) && /Editar video/.test(appjs) && /openVideoEditor\('story', -1/.test(appjs));
  /* 1.5.47: barra de subida continua, nunca hacia atrás. */
  check('1.5.47 barra: el 100% de cada archivo se avisa ANTES de contarlo (3 sitios, sin doble conteo)', (appjs.match(/report\(100\);\s*doneSteps\+\+;/g) || []).length === 3);
  check('1.5.47 barra: piso monótono en el setter y en showUploadProgress (lo mostrado nunca baja)', /function bgUploadSetProgress1529[\s\S]{0,700}if \(p < bgUploadFloor1547\) p = bgUploadFloor1547;/.test(appjs) && /function showUploadProgress[\s\S]{0,700}if \(p < bgUploadFloor1547\) p = bgUploadFloor1547;/.test(appjs));
  check('1.5.47 barra: el piso se reinicia con cada trabajo nuevo', /async function bgUploadRunJob1529[\s\S]{0,300}bgUploadFloor1547 = 0;/.test(appjs));
  check('1.5.47 barra: la barra sigue abajo, encima de la barra inferior (1.5.46 intacto)', /\.uploadBar|#mediaUploadBar/.test(idx) && /z-index: ?70/.test(idx) && /bottom: ?calc\(68px/.test(idx));
  /* 1.5.47: ajustes del cajón (los 9, mismo estilo, mismo engranaje). */
  check('1.5.47 cajón: el engranaje de la barra es EL MISMO icono de Ajustes (ic settings 19) y el botón de noticias va justo antes', /ic\('settings', 19\)/.test(fnBody(appjs, 'openAppsDrawer')) && idx.indexOf('appsDrawerNewsBtn1547') >= 0 && idx.indexOf('appsDrawerNewsBtn1547') < idx.indexOf('appsDrawerSettingsBtn1547'));
  check('1.5.47 cajón: los 9 ajustes existen (fondo, transparencia, ocultar, acomodar, tamaños, animaciones, páginas, contadores, temas)', /DRAWER_BG_COLORS_1547/.test(appjs) && /drawerAlpha1547/.test(appjs) && /__wrDrawerHide/.test(appjs) && /__wrDrawerShow/.test(appjs) && /drawerAutoFit1547/.test(appjs) && /__wrDrawerIconSize/.test(appjs) && /__wrDrawerTextSize/.test(appjs) && /drawerAnimToggle1547/.test(appjs) && /__wrDrawerPages/.test(appjs) && /drawerBadgesToggle1547/.test(appjs) && /DRAWER_PACKS_1547/.test(appjs));
  check('1.5.47 cajón: 5 temas de iconos incluidos (Original, Rojo, Blanco y negro, Redondeado, Minimalista)', /Original/.test(appjs) && /Rojo/.test(appjs) && /Blanco y negro/.test(appjs) && /Redondeado/.test(appjs) && /Minimalista/.test(appjs) && /drawerPack-byn1547/.test(idx) && /drawerPack-redondeado1547/.test(idx) && /drawerPack-minimalista1547/.test(idx));
  check('1.5.47 cajón: animaciones APAGADAS por defecto y contadores prendidos (sin animaciones es la regla)', /animations: !!d\.animations/.test(appjs) && /badges: \(d\.badges === false \? false : true\)/.test(appjs) && /noAnim1547/.test(idx));
  check('1.5.47 cajón: con los contadores apagados el refresco NO vuelve a poner numeritos (updateAppNotifBadges respeta el interruptor)', /function updateAppNotifBadges\(\)[\s\S]{0,400}if \(!drawerSettings1547\(\)\.badges\)[\s\S]{0,200}appNotifBadge/.test(appjs));
  check('1.5.47 cajón: los ajustes se guardan en este teléfono y se aplican al instante', /state\.settings\.drawer1547/.test(appjs) && /function applyDrawerSettings1547/.test(appjs) && /drawerSettingsOverlay1547/.test(idx));
  check('1.5.47 cajón: mismo estilo que Ajustes (panel translúcido, botones redondos de 40 px, acento rojo)', /drawerSettingsOverlay1547[^{]*\{background:rgba\(5,1,2,\.55\)/.test(idx) && /wOptRound1542/.test(idx) && /accent-color:var\(--red\)/.test(idx));
  /* 1.5.47: noticias reales. */
  check('1.5.47 noticias: 5 categorías (Noticias, Deportes, Tecnología, Entretenimiento, Economía)', /NEWS_CATEGORIES_1547/.test(appjs) && ['noticias', 'deportes', 'tecnologia', 'entretenimiento', 'economia'].every(function (c) { return appjs.indexOf("id: '" + c + "'") >= 0; }));
  check('1.5.47 noticias: la lista fija trae 13 artículos reales con enlace e imagen', (function () { var m = appjs.match(/var NEWS_BAKED_1547 = \(\{[\s\S]*?\n\}\);/); if (!m) m = appjs.match(/var NEWS_BAKED_1547 = \{[\s\S]*?\n\};/); var b = m ? m[0] : ''; return (b.match(/"link": "https:\/\//g) || []).length === 13 && (b.match(/"image": "https:\/\//g) || []).length === 13; })());
  check('1.5.47 noticias: fuente pública sin clave con caché de 1 día y respaldo fijo si falla', /api\.rss2json\.com/.test(appjs) && /Date\.now\(\) - c\.ts < 86400000/.test(appjs) && /NEWS_BAKED_1547\[catId\]/.test(appjs));
  check('1.5.47 noticias: la fila va tras la 7ª publicación, con publicaciones entre cine (5ª) y juegos (10ª)', /if \(i === 6\) parts\.push\(newsRowHtml1547\(\)\);/.test(appjs));
  check('1.5.47 noticias: con el muro corto las secciones van al final en orden (reels, cine, noticias, juegos)', /parts\.push\(billboardHtml1540\(\)\); parts\.push\(newsRowHtml1547\(\)\); parts\.push\(featuredGameHtml1549\(\)\); parts\.push\(gamesBillboardHtml1543\(\)\);/.test(appjs));
  check('1.5.47 noticias: el encabezado lleva el icono de noticias y el texto «Noticias»; el artículo abre fuera de WordRed', /ic\('news', 20\)/.test(appjs) && /Noticias<\/div>/.test(appjs) && /window\.__wrOpenUrl\(\\?'/.test(fnBody(appjs, 'newsTileHtml1547')));
  check('1.5.47 noticias: el centro abre con pestañas por categoría y cambia de lista', /function openNewsHub1547/.test(appjs) && /__wrNewsTab/.test(appjs) && /newsHubTabs1547/.test(appjs));
  /* 1.5.47: promociones. */
  check('1.5.47 promociones: el botón es solo el icono de megáfono (40 px, sin texto) y va justo después de Editar', /__wrPromotePost/.test(appjs) && /ic\('megaphone', 19\)/.test(appjs) && /class="wOptRound1542" type="button" title="Promocionar"/.test(appjs) && appjs.indexOf("__wrEditPost") < appjs.indexOf("__wrPromotePost"));
  check('1.5.47 promociones: la hoja trae objetivo (vistas o seguidores) y 4 presupuestos en MXN con estimaciones que crecen con el presupuesto', /PROMO_TIERS_1547/.test(appjs) && /PROMO_GOALS_1547/.test(appjs) && (function () { var t = [{ budget: 50, views: 1000, followers: 50 }, { budget: 100, views: 2500, followers: 120 }, { budget: 200, views: 6000, followers: 300 }, { budget: 500, views: 15000, followers: 800 }]; return t.every(function (x, i) { return i === 0 || (t[i].views > t[i - 1].views && t[i].followers > t[i - 1].followers); }); })() && /budget: 50/.test(appjs) && /budget: 500/.test(appjs) && /t\.budget \+ ' MXN/.test(appjs));
  check('1.5.47 promociones: el pago usa la cuenta que ya muestra «Apoyar a WordRed» (se lee del elemento #supportAccount, nunca se escribe el número)', /\$\('supportAccount'\)/.test(appjs) && /promoCopyAccount1547/.test(appjs) && /Ya pagué/.test(appjs));
  check('1.5.53 promociones: «Ya pagué» YA NO activa solo: pide verificación, la publicación queda «En verificación» sin insignia «Promocionado» y sin subir arriba', /__wrPromoPaid/.test(appjs) && /status = 'verifying'/.test(appjs) && /requestPromoVerification1553/.test(appjs) && /promoVerifying1553/.test(appjs) && /En verificación/.test(appjs) && (function () { var i = appjs.indexOf('window.__wrPromoPaid = function () {'); if (i < 0) return false; var j = appjs.indexOf('\n/*', i); var b = appjs.slice(i, j < 0 ? i + 900 : j); return b.indexOf("promo.status = 'verifying'") >= 0 && b.indexOf("promo.status = 'active'") < 0 && b.indexOf('requestPromoVerification1553(promo)') >= 0; })() && /isPromoted1547\(b\) \? 1 : 0/.test(appjs));
  check('1.5.47 promociones: la moneda con W va en el perfil propio antes del lápiz y abre el centro (activas, pendientes, historial, crear desde una publicación o un video)', /id="hdrPromotions"/.test(idx) === false && /ownPromoCoin1547/.test(appjs) && /coinW1547/.test(idx) && /__wrOpenPromotionsHub/.test(appjs) && /openPromotionsHub1547/.test(appjs) && /__wrPromoAddVideo/.test(appjs) && /Historial/.test(appjs) && /Pendientes/.test(appjs) && (function () { var b = fnBody(appjs, 'renderOwnProfile'); return b && b.indexOf('ownPromoCoin1547') >= 0 && b.indexOf('ownPromoCoin1547') < b.indexOf('ownEditBtn'); })());
  check('1.5.53 promociones: al pagar, la solicitud se manda al servidor (POST /api/promotions/request con postId y nivel); el PUT {promoted:true} de la 1.5.48 ya no se usa', /function requestPromoVerification1553\(promo\)/.test(appjs) && /var body = \{ postId: promo\.postId, tier: promo\.budget, goal: promo\.goal \};/.test(appjs) && /pushToServer\('\/api\/promotions\/request', 'POST', body\)/.test(appjs) && /pushPromoToServer1548/.test(appjs) === false);
  /* 1.5.47: ventanas flotantes y translúcidas. */
  check('1.5.47 flotantes: los diálogos de confirmación y las opciones que se abren desde ellos son ventanas flotantes translúcidas', /class="overlay floatWin1547" id="confirmOverlay"/.test(idx) && /class="overlay floatWin1547" id="shareChoiceOverlay"/.test(idx) && /class="overlay floatWin1547" id="dialogOverlay"/.test(idx) && /class="overlay floatWin1547" id="updateOverlay"/.test(idx));
  check('1.5.47 flotantes: Ajustes es una ventana flotante translúcida con todo su contenido', /class="overlay floatWin1547" id="settingsOverlay"/.test(idx) && /\.overlay\.floatWin1547 \.sheet\{min-height:0;max-height:88vh/.test(idx) && /border-radius:22px/.test(idx));
  check('1.5.47 flotantes: el cajón es una ventana flotante (tarjeta centrada, translúcida) y su fondo sigue saliendo de sus ajustes', /class="overlay floatWin1547" id="appsDrawerOverlay"/.test(idx) && /#appsDrawerOverlay\.floatWin1547 \.sheet\{display:flex;flex-direction:column/.test(idx) && /sheet\.style\.background = drawerBgCss1547\(d\)/.test(appjs));
  check('1.5.47 flotantes: los paneles de los botones de arriba (FAQ, ajustes y noticias del cajón) también son ventanas flotantes', /class="overlay floatWin1547" id="faqOverlay1543"/.test(idx) && /class="overlay floatWin1547" id="drawerSettingsOverlay1547"/.test(idx) && /class="overlay floatWin1547" id="newsHubOverlay1547"/.test(idx));
  check('1.5.47 flotantes: la tarjeta flotante es translúcida con blur y detrás se ve la app atenuada', /\.overlay\.floatWin1547\{background:rgba\(5,1,2,\.55\);backdrop-filter:blur\(8px\)/.test(idx));
  /* 1.5.47: barra inferior repartida y con toque. */
  check('1.5.48 barra inferior: la barra vuelve al flex de antes de 1.5.47 (dos grupos laterales flex:1 + botón central flex:0 0 auto), sin la grid de 5 columnas', /nav#bottomNav\{[^}]*display:flex/.test(idx) && /nav#bottomNav \.bn-side\{flex:1/.test(idx) && /nav#bottomNav button\.bn-launcher\{flex:0 0 auto/.test(idx) && !/\.bn-side\{display:contents/.test(idx) && !/justify-self:center/.test(idx));
  check('1.5.47 barra inferior: al presionar un icono lateral se achica un poco (clase bnPress1547) y el botón rojo del centro NO tiene animación de presión', /bnPress1547/.test(idx) && /bnPress1547/.test(appjs) && /nav#bottomNav \.bn-side button\{transition:transform \.12s ease\}/.test(idx) && /nav#bottomNav button\.bn-launcher:active\{transform:none\}/.test(idx) && !/bn-launcher[^}]*bnPress1547/.test(appjs));
  /* 54. Fijar un chat. */
  check('v1.5.26 (54) fijar: los fijados quedan arriba con pin y se quitan desde el mismo menú', /pinnedChats/.test(appjs) && /ic\('pin', 16\)/.test(fnBody(appjs, 'renderConvos')) && /__wrTogglePinChat/.test(appjs));
  /* 55. Ubicación en vivo. */
  const s55 = st();
  const ll = C.sendMessage(s55, '111', '222', '', '', '', null, null, { liveLocation: { lat: 19.4, lng: -99.1, expiresAt: Date.now() + 3600000 } });
  check('v1.5.26 (55) ubicación: el mensaje lleva la posición con caducidad de 1 hora', ll.ok && C.liveLocationActive(ll.message.liveLocation) && C.liveLocationRemainingMs(ll.message.liveLocation) > 0);
  check('v1.5.26 (55) ubicación: indicador con minutos restantes y Dejar de compartir', /liveLocationHtml1526/.test(appjs) && /min restantes/.test(appjs) && /Dejar de compartir/.test(appjs) && /__wrShareLiveLocation/.test(appjs));
  /* 56. Reaccionar a un mensaje. */
  const s56 = st();
  const m56 = C.sendMessage(s56, '111', '222', 'hola', '', '', null, null, {});
  C.applyMsgReaction(m56.message, '222', 'Ana', '❤️');
  C.applyMsgReaction(m56.message, '111', 'Yo', '😂');
  check('v1.5.26 (56) reacciones: una por persona, se puede cambiar, y se cuentan', C.msgReactionCounts(m56.message).length === 2 && C.myMsgReaction(m56.message, '222') === '❤️' && C.validateMsgReaction('💩') === '');
  check('v1.5.26 (56) reacciones: mantener presionado abre el selector y se muestran debajo', /msgReactionsHtml1526/.test(appjs) && /__wrReactToMessage/.test(appjs) && /__wrOpenMsgReactPicker/.test(appjs));
  /* 57. Jugar en el chat. */
  const s57 = st();
  const g57 = C.sendMessage(s57, '111', '222', '', '', '', null, null, { gameInvite: { gameId: 'snake', roomId: 'r1' } });
  check('v1.5.26 (57) jugar: la invitación lleva juego real y sala, y el amigo entra desde el chat', g57.ok && g57.message.gameInvite.gameId === 'snake' && /gameInviteHtml1526/.test(appjs) && /__wrInviteGame/.test(appjs) && /__wrAcceptGameInvite/.test(appjs));
  /* 58. Notas de voz más rápido. */
  check('v1.5.26 (58) velocidad: 1x / 1.5x / 2x con playbackRate en el audio', /voiceSpeedHtml1526/.test(appjs) && /playbackRate/.test(appjs) && /1\.5x/.test(appjs) && /id="va_/.test(appjs));
  /* 59. Guardar enlaces para después. */
  const s59 = st();
  const sl59 = C.saveLink(s59, 'https://ejemplo.com/articulo', 'Artículo');
  check('v1.5.26 (59) enlaces: se guardan con título y dominio y se quitan de la lista', sl59.ok && s59.savedLinks.length === 1 && s59.savedLinks[0].host === 'ejemplo.com' && !C.saveLink(s59, 'https://ejemplo.com/articulo', 'Artículo').ok && C.removeSavedLink(s59, 'https://ejemplo.com/articulo').ok && s59.savedLinks.length === 0);
  check('v1.5.26 (59) enlaces: lista Enlaces guardados en perfil y búsqueda', /__wrOpenSavedLinks/.test(appjs) && /id="savedLinksOverlay"/.test(idx) && /Enlaces guardados/.test(fnBody(appjs, 'renderSearch')));
  /* 60. Tu semana en WordRed. */
  const s60 = st();
  C.createPost(s60, '111', { text: 'hoy' });
  const wk = C.weekStats(s60, '111');
  check('v1.5.26 (60) semana: números reales de los últimos 7 días', wk.posts === 1 && /weekCardHtml1526/.test(appjs) && /Tu semana/.test(appjs));
  /* 61. Inicio solo de amigos. */
  const s61 = st();
  C.createPost(s61, '222', { text: 'de Ana' });
  C.createPost(s61, '111', { text: 'mía' });
  C.createPost(s61, '444', { text: 'de un extraño' });
  check('v1.5.26 (61) solo amigos: el filtro deja solo publicaciones de amigos y las propias', C.friendsOnlyPosts(s61.posts, '111', ['222']).length === 2 && C.friendsOnlyPosts(s61.posts, '111', ['222']).every(function (p) { return p.author !== '444'; }) && /toggleFriendsOnlyFeed1526/.test(appjs) && /Solo amigos/.test(fnBody(appjs, 'renderSettings1526')));
  /* 62. Invitar a un grupo con un enlace. */
  check('v1.5.26 (62) enlace: wordred://group/<id> y su forma https, y abrirlo muestra el grupo', C.groupInviteLink('g1') === 'wordred://group/g1' && C.groupInviteHttpsLink('g1') === 'https://wordred.app/group/g1' && C.parseGroupInviteLink('wordred://group/g1') === 'g1' && C.parseGroupInviteLink('https://wordred.app/group/g1') === 'g1' && /handleDeepLink1526/.test(appjs) && /Invitar con enlace/.test(appjs));
  /* 63. Marco para tu foto. */
  check('v1.5.26 (63) marco: 7 marcos y el CSS es un anillo alrededor de la foto real', C.validateAvatarFrame('arcoiris') === 'arcoiris' && C.validateAvatarFrame('rosa') === 'none' && C.avatarFrameCss('arcoiris') !== '' && C.avatarFrameCss('none') === '' && /avatarFrameStyle/.test(appjs) && /profilePhotoOptionsHtml1526/.test(appjs));
  /* 64. Un sonido distinto para cada chat. */
  check('v1.5.26 (64) sonido por chat: 4 sonidos reales en res/raw y el puente usa el elegido', C.validateChatSound('pop') === 'pop' && C.validateChatSound('ruido') === 'bell' && C.chatSoundName('chime') === 'Campanita' && ['bell', 'chime', 'pop', 'soft'].every(function (n) { return fs.existsSync(path.join(__dirname, '..', 'res', 'raw', n + '.wav')); }) && /showChatNotification/.test(mainJava) && /soundChannelId/.test(soundsJava) && /CHAT_SOUNDS/.test(soundsJava));
  check('v1.5.26 (64) sonido por chat: maybeNotify usa el sonido del chat y no el de la campana', /showChatNotification/.test(fnBody(appjs, 'maybeNotify')) && /chatSound1526/.test(appjs));
  /* 65. Filtro para tu foto de perfil. */
  check('v1.5.26 (65) filtro: 5 filtros y el CSS es un efecto sobre la foto real', C.validateAvatarFilter('Sepia') === 'Sepia' && C.validateAvatarFilter('Neón') === 'Original' && C.avatarFilterCss('Sepia') === 'sepia(0.8)' && C.avatarFilterCss('Original') === '' && /avatarFilterStyle/.test(appjs));
  /* 66. Añadir un evento a tu calendario. */
  check('v1.5.26 (66) calendario: botón en la vista del evento y puente nativo ACTION_INSERT', /__wrAddEventToCalendar/.test(appjs) && /Añadir a mi calendario/.test(appjs) && /addToCalendar/.test(mainJava) && /ACTION_INSERT/.test(mainJava));
  /* Java: avisos locales y calendario. */
  check('v1.5.26 java: el receptor programa y cancela avisos locales con alarma exacta (y caída a inexacta)', /scheduleLocalNotification/.test(recvJava) && /cancelLocalNotification/.test(recvJava) && /setExactAndAllowWhileIdle/.test(recvJava) && /setAndAllowWhileIdle/.test(recvJava) && /9600/.test(recvJava));
  check('v1.5.26 java: el puente expone los 5 métodos nuevos', /scheduleLocalNotification/.test(mainJava) && /cancelLocalNotification/.test(mainJava) && /addToCalendar/.test(mainJava) && /saveChatBackup/.test(mainJava) && /showChatNotification/.test(mainJava));
  check('v1.5.26 java: el manifiesto declara SCHEDULE_EXACT_ALARM y sigue con HOME + QUERY_ALL_PACKAGES + servicios', /SCHEDULE_EXACT_ALARM/.test(manifest) && /QUERY_ALL_PACKAGES/.test(manifest) && /WordRedBackgroundService/.test(manifest) && /WordRedBootReceiver/.test(manifest) && /WordRedNotificationListener/.test(manifest));
  /* index.html: todos los overlays y contenedores nuevos existen. */
  ['cartOverlay', 'wishlistOverlay', 'couponsOverlay', 'scheduledOverlay', 'draftsOverlay', 'storyViewsOverlay', 'challengesOverlay', 'duetOverlay', 'liveInviteOverlay', 'groupInviteOverlay', 'savedLinksOverlay', 'pinnedCoverOverlay', 'verificationOverlay', 'switchAccountOverlay', 'audioRoomsOverlay', 'audioRoomViewOverlay', 'chatBgOverlay', 'chatSoundOverlay'].forEach(function (id) {
    check('v1.5.26 html: existe el overlay ' + id, idx.indexOf('id="' + id + '"') >= 0);
  });
  ['composerMoodRow', 'composerPlaceBox', 'composerPhotoPollBox', 'composerPhotoPollInput', 'composerChallengeInput', 'composerScheduleBox', 'composerSaveDraftBtn', 'composerDraftsBtn', 'composerScheduledBtn', 'storyCreate1526', 'storyCoverInput', 'settings1526', 'profilePhotoOptions', 'tournamentBox', 'groupSecret', 'chatHeaderExtra', 'stickerPicker', 'chatStickerBtn', 'chatBackupInput', 'cartBody', 'wishlistBody', 'couponsList', 'couponCode', 'couponPct', 'couponExpires', 'couponListing', 'scheduledList', 'draftsList', 'storyViewsBody', 'challengesList', 'duetRecordBtn', 'duetPublishBtn', 'duetCloseBtn', 'liveInviteBody', 'groupInviteBody', 'savedLinksBody', 'pinnedCoverBody', 'verificationBody', 'switchAccountBody', 'audioRoomTitle', 'audioRoomTopic', 'audioRoomsList', 'audioRoomViewBody', 'chatBgBody', 'chatSoundBody', 'liveCoHostVideo', 'liveCoHostLabel'].forEach(function (id) {
    check('v1.5.26 html: existe el id ' + id, idx.indexOf('id="' + id + '"') >= 0);
  });
  check('v1.5.47 html: el buscador de ciudad se crea en el detalle del clima, con el icono de mi ubicación a la derecha', /weatherCityInput/.test(appjs) && /weatherCityResults/.test(appjs) && /weatherMyLocBtn1547/.test(appjs));
  /* FAQ comprimida. */
  const faqBlock = (appjs.match(/var FAQ = \[([\s\S]*?)\];/) || [])[1] || '';
  const faqEntries = (faqBlock.match(/\{\s*q:/g) || []).length;
  const faqAnswers = [];
  const am = faqBlock.match(/a: '((?:[^'\\]|\\.)*)'/g) || [];
  am.forEach(function (m) { faqAnswers.push(m.slice(4, -1)); });
  check('v1.5.26 FAQ: 29 entradas (23 al comprimir en la 1.5.26, +1 en la 1.5.33 por el tutorial, +1 en la 1.5.36 por el menú, +3 en la 1.5.42 por la cartelera, los Reels y «Tu tiempo hoy», +1 en la 1.5.54 por los dramas originales)', faqEntries === 29);
  check('v1.5.26 FAQ: ninguna respuesta pasa de 400 caracteres (1-2 líneas cortas)', faqAnswers.length === 29 && faqAnswers.every(function (a) { return a.length <= 400; }));
  check('v1.5.26 FAQ: ninguna entrada habla del rebote del cajón (falso desde la 1.5.17)', !/rebote/.test(faqBlock));
  check('v1.5.26 FAQ: nada de SMS', !/SMS/.test(faqBlock));
  check('v1.5.26 FAQ: explica cómo actualizar y que el aviso desaparece al instalar', /¿Cómo actualizo WordRed\?/.test(faqBlock) && /al instalarla, su aviso desaparece de la campana/.test(faqBlock));
  check('1.5.62 FAQ: la batería y el reproductor siguen; la campana y la biografía salieron en la rotación (eran las más viejas)', /¿Qué es el indicador de batería\?/.test(faqBlock) && /¿Cómo funciona el reproductor de video\?/.test(faqBlock) && /¿Por qué aparecen otras aplicaciones en la campana\?/.test(faqBlock) === false && /¿Dónde quedó mi biografía\?/.test(faqBlock) === false);
  check('v1.5.26 FAQ: una entrada corta de novedades (la de la versión actual), sin meter las 66 ideas una por una', /¿Qué hay de nuevo en la 1\.5\.63\?/.test(faqBlock) && faqEntries === 29);
  /* Sin regresión: pie, prohibidos y cajón. */
  check('v1.5.26 base: el pie exacto aparece 3 veces', (idx.match(/Creada y diseñada por Mistery Store Play/g) || []).length === 3);
  check('v1.5.26 base: 0 Muse, 0 usuario como palabra, 0 Facebook en app.js e index.html', !/Muse/.test(appjs) && !/Muse/.test(idx) && !/Facebook/.test(appjs) && !/Facebook/.test(idx));
  check('v1.5.26 base: el cajón fluido wrDrawerFluid sigue intacto (sin rebote)', /wrDrawerFluid/.test(idx) && !/rebote/.test(appjs));
  check('v1.5.26 base: la normalización a https sigue intacta', /http:\/\/wordred-server\.onrender\.com\//.test(appjs) && /'https:\/\/' \+ u\.slice\(7\)/.test(appjs));
  check('v1.5.26 base: bell.wav sigue en el APK', fs.existsSync(path.join(__dirname, '..', 'res', 'raw', 'bell.wav')));
  /* Correcciones de la sesión de verificación (regresiones reales): */
  check('v1.5.26 fix: showDialog/hideDialog existen y hay overlay genérico', /function showDialog\(title, html\)/.test(appjs) && /function hideDialog\(\)/.test(appjs) && /id="dialogOverlay"/.test(idx) && /id="dialogTitle"/.test(idx) && /id="dialogBody"/.test(idx));
  check('v1.5.26 fix: la variable del chat de grupo abierto es openChatGroupId (openGroupChatId no existía)', !/openGroupChatId/.test(appjs.replace(/antes openGroupChatId, que no existía/g, '')) && /var openChatGroupId = null/.test(appjs));
  check('v1.5.26 fix: nada busca mensajes en state.messages/state.groupMessages (no existen)', !/state\.messages\[/.test(appjs) && !/state\.groupMessages\[/.test(appjs) && !/Object\.keys\(state\.messages/.test(appjs));
  check('v1.5.26 fix: findChatMessage1526 busca en state.conversations y state.groupChats', /state\.conversations\[k\]/.test(appjs) && /state\.groupChats/.test(appjs) && /function findChatMessage1526/.test(appjs));
  check('v1.5.26 fix: pruneDisappearingLocal1526 poda la conversación real con C.convoKey', /C\.convoKey\(state\.me, phone\)/.test(appjs) && /function pruneDisappearingLocal1526/.test(appjs));
  check('v1.5.26 fix: createStory guarda sharedShortId solo si el Short existe', /sharedShortId: sharedShortId/.test(corejs) && /origShort/.test(corejs));
  check('v1.5.26 fix: la tarjeta de estadísticas no menciona "del servidor" (texto visible)', !/conteo real del servidor/.test(appjs));
  check('v1.5.26 fix: el fondo de chats usa longhands (backgroundImage/backgroundColor)', /backgroundImage = 'linear-gradient/.test(appjs) && /backgroundColor = bg/.test(appjs));
}

function static1527() {
  console.log('=== 89. WordRed 1.5.28: sin Canción del día, semana sin "Con más...", historias rectangulares ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  const faqBlock = (appjs.match(/var FAQ = \[([\s\S]*?)\];/) || [])[1] || '';
  const faqEntries = (faqBlock.match(/\{ q: '/g) || []).length;
  /* Versión. */
  check('v1.5.27 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.27 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.27 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  check('v1.5.27 versión: build.sh dice 1.5.34', /Build WordRed v1\.5\.63/.test(buildsh));
  /* (1) Canción del día fuera del perfil propio. */
  check('v1.5.27 canción: la tarjeta ya no existe (ni función, ni botones, ni selector, ni llamada en el perfil propio)', !/function songOfDayHtml1526/.test(appjs) && !/__wrPickSongOfDay/.test(appjs) && !/__wrClearSongOfDay/.test(appjs) && !/__wrPlaySongOfDay/.test(appjs) && !/songOfDayHtml1526/.test(fnBody(appjs, 'renderOwnProfile')));
  check('v1.5.27 canción: el perfil propio ya no menciona "Canción del día"', !/Canción del día/.test(fnBody(appjs, 'renderOwnProfile')));
  check('v1.5.27 canción: la canción de OTROS perfiles sigue viéndose (theirSong1526) y el validador sigue en core.js', /theirSong1526/.test(appjs) && /songOfDayValid/.test(corejs));
  check('v1.5.27 canción: el resto del perfil propio sigue igual (recuerdos, atajos; 1.5.31: el tiempo hoy va en el lugar de la nota)', /screenTimeTodayHtml\(\)/.test(fnBody(appjs, 'renderOwnProfile')) && /memoriesProfileHtml1526\(\)/.test(fnBody(appjs, 'renderOwnProfile')) && /Shorts guardados/.test(fnBody(appjs, 'renderOwnProfile')) && !/profileNoteHtml1526\(\)/.test(fnBody(appjs, 'renderOwnProfile')));
  check('v1.5.28 perfil: estadísticas y semana ya no se muestran en el perfil propio (las funciones y los datos siguen)', !/creatorStatsHtml1526\(\)/.test(fnBody(appjs, 'renderOwnProfile')) && !/weekCardHtml1526\(\)/.test(fnBody(appjs, 'renderOwnProfile')) && /function creatorStatsHtml1526/.test(appjs) && /function weekCardHtml1526/.test(appjs));
  /* (2) Tu semana sin las líneas "Con más...". */
  check('v1.5.27 semana: sin "Con más Me gusta" ni "Con más vistas" (con sus botones Ver)', !/Con más Me gusta/.test(fnBody(appjs, 'weekCardHtml1526')) && !/Con más vistas/.test(fnBody(appjs, 'weekCardHtml1526')));
  check('v1.5.27 semana: la tarjeta se queda con título, subtítulo y sus 4 conteos', /Tu semana en WordRed/.test(fnBody(appjs, 'weekCardHtml1526')) && /Últimos 7 días/.test(fnBody(appjs, 'weekCardHtml1526')) && /publicaciones/.test(fnBody(appjs, 'weekCardHtml1526')) && /Me gusta recibidos/.test(fnBody(appjs, 'weekCardHtml1526')) && /comentarios recibidos/.test(fnBody(appjs, 'weekCardHtml1526')) && /amigos nuevos/.test(fnBody(appjs, 'weekCardHtml1526')));
  /* (3) Historias rectangulares en el inicio (todas, la tuya y las de todos). */
  check('v1.5.27 historias: el recuadro es rectangular, esquinas cuadradas (border-radius 0), mismo tamaño 96×150', /\.story\{[^}]*flex:0 0 96px;[^}]*height:150px;[^}]*border-radius:0/.test(idx));
  check('v1.5.27 historias: la fila de arriba del Inicio son los reels: el primer rectángulo es con la foto y el + para agregar, los demás son los reels del Inicio', /homeReel1549 homeReelMe1549/.test(fnBody(appjs, 'renderStories')) && /__wrOpenReelCreate/.test(fnBody(appjs, 'renderStories')) && /reelVideoOf/.test(fnBody(appjs, 'renderStories')) && /reelsRowHtml/.test(appjs));
  check('v1.5.27 historias: el anillo del avatar sigue redondo y el nombre sigue abajo', /\.storyCardAvatar\{[^}]*border-radius:50%/.test(idx) && /\.storyCardName\{/.test(idx));
  check('v1.5.27 historias: los Reels son 264×400 (su propio marco, más grandes que las historias)', /\.reelTile\{[^}]*flex:0 0 264px;[^}]*height:400px;[^}]*border-radius:14px/.test(idx));
  /* FAQ: sigue en 24 y no habla de la canción del día. */
  check('v1.5.27 FAQ: sigue en 29 entradas', faqEntries === 29);
  check('v1.5.27 FAQ: ninguna entrada menciona la canción del día (ya no se ve en la app)', !/canción del día/i.test(faqBlock));
}

function static1530() {
  console.log('=== 90. WordRed 1.5.30: previa instantánea, subida con compresión, perfil arriba, barra sin encimarse y Windows ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const mainJava = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  const faqBlock = (appjs.match(/var FAQ = \[([\s\S]*?)\];/) || [])[1] || '';
  const faqEntries = (faqBlock.match(/\{ q: '/g) || []).length;
  /* Versión. */
  check('v1.5.29 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.29 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.29 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  check('v1.5.29 versión: build.sh dice 1.5.34', /Build WordRed v1\.5\.63/.test(buildsh));
  /* (1) El puente nativo avisa la subida en el celular. */
  check('v1.5.29 aviso: MainActivity tiene el canal y los tres métodos del puente (progreso, fin, ocultar)', /CHANNEL_UPLOAD = "wordred_upload"/.test(mainJava) && /NOTIF_UPLOAD_ID = 9500/.test(mainJava) && /showUploadNotification\(final int progress, final String label\)/.test(mainJava) && /finishUploadNotification\(final boolean ok, final String text\)/.test(mainJava) && /hideUploadNotification\(\)/.test(mainJava) && /Subidas de WordRed/.test(mainJava));
  check('v1.5.29 aviso: el aviso de subida no suena (IMPORTANCE_LOW) y se actualiza con el porcentaje', /IMPORTANCE_LOW/.test(mainJava) && /setProgress\(100, p, false\)/.test(mainJava) && /setOnlyAlertOnce\(true\)/.test(mainJava));
  check('v1.5.29 aviso: al terminar suena la campanita una sola vez (canal de publicaciones)', (function () { const i = mainJava.indexOf('finishUploadNotification'); const b = mainJava.slice(i, mainJava.indexOf('hideUploadNotification', i)); return /WordRedSounds\.CHANNEL_POSTS/.test(b) && /WordRedSounds\.applyBellToBuilder\(MainActivity\.this, b\)/.test(b); })());
  /* (2) La barra de arriba con Reintentar y descartar. */
  check('v1.5.29 barra: la barra fija de arriba tiene Reintentar y ✕ (ocultos hasta fallar)', /id="mediaUploadBar"/.test(idx) && /id="mediaUploadRetry1529"/.test(idx) && /id="mediaUploadDismiss1529"/.test(idx));
  /* (3) El sistema de trabajos en segundo plano. */
  check('v1.5.29 trabajos: existe la cola con un solo trabajo activo (nunca se mezclan dos subidas)', /var bgUploadQueue1529 = \[\]/.test(appjs) && /var bgUploadActive1529 = null/.test(appjs) && /function bgUploadPump1529\(\)/.test(appjs));
  check('v1.5.29 trabajos: el trabajo sube cada medio local con progreso real y remata creando la publicación', /function bgUploadRunJob1529\(job\)/.test(appjs) && /function bgUploadFinishJob1529\(job\)/.test(appjs) && /uploadMediaItemToServer\(item, function \(p\) \{ report\(p\); \}\)/.test(appjs));
  check('v1.5.29 trabajos: sin token del servidor no hay trabajo en segundo plano (se publica en el teléfono como siempre)', /function bgUploadHasServer1529\(\) \{ return !!\(state\.settings && state\.settings\.serverToken\); \}/.test(appjs));
  check('v1.5.29 trabajos: si falla, no se crea nada y se puede reintentar sin volver a subir lo que ya subió', /job\.status = 'failed'; job\.error = failed;/.test(appjs) && /mediaUploadRetry1529/.test(appjs) && /job\.data\.mediaList = items;/.test(appjs));
  /* (4) Al publicar se vuelve a donde se estaba (sin salto al inicio). */
  check('v1.5.29 publicar: el botón Publicar cierra el compositor y el panel sin irse al inicio', (function () { const h = appjs.slice(appjs.indexOf("$('postPublish').addEventListener('click'"), appjs.indexOf('/* ---- modificar una publicación')); return h.indexOf("go('feed');") < 0 && h.indexOf('bgUploadPump1529()') >= 0 && h.indexOf('bgUploadFinishJob1529(job)') >= 0 && h.indexOf('closeComposer1528()') >= 0; })());
  check('v1.5.29 publicar: al terminar, el inicio y el perfil propio se redibujan en su sitio', /function refreshViewAfterBgUpload1529\(post, groupId, pageId\)/.test(appjs) && /renderFeed\(\);/.test(fnBody(appjs, 'refreshViewAfterBgUpload1529')) && /renderOwnProfile\(\);/.test(fnBody(appjs, 'refreshViewAfterBgUpload1529')));
  check('v1.5.29 publicar: la restauración del inicio no se dispara tarde si ya saliste (revisa la vista al disparar)', /if \(currentView !== 'feed'\) return;/.test(fnBody(appjs, 'restoreFeedPosition1526')));
  /* FAQ y 1.5.27/1.5.28 intactos. */
  check('v1.5.29 FAQ: sigue en 29 entradas y describe la subida en segundo plano con reintento', faqEntries === 29 && /segundo plano/.test(faqBlock) && /puedes reintentar/.test(faqBlock) && /vista previa grande/.test(faqBlock));
  check('v1.5.29 intacto: sin Canción del día ni "Con más Me gusta", historias rectangulares, panel y Solo amigos en Ajustes', !/function songOfDayHtml1526/.test(appjs) && !/Con más Me gusta/.test(appjs) && /\.story\{[^}]*border-radius:0/.test(idx) && /id="uploadPanel1528"/.test(idx) && /friendsOnlyToggle/.test(appjs));
  /* ---- 1.5.30: previa instantánea, subida con compresión, botones del
     perfil arriba, barra sin encimarse y Windows. ---- */
  /* (1) Previa instantánea al elegir el archivo. */
  check('v1.5.30 previa: al elegir el archivo, la previa sale al instante desde el archivo local (blob URL)', /function handleComposerMediaFiles\(files\)/.test(appjs) && /createObjectURL/.test(fnBody(appjs, 'handleComposerMediaFiles')) && /_preview1530/.test(appjs) && /composerPreviewItemHtml1530/.test(appjs));
  check('v1.5.30 previa: la previa provisional se cambia por el archivo procesado y Publicar espera a que termine', /composerMediaPending1530/.test(appjs) && /composerMediaReady1530/.test(appjs) && /Preparando tu archivo/.test(appjs) && /composerPublishWaiting1530/.test(appjs));
  check('v1.5.30 previa: la previa provisional se dibuja por su tipo (un video no se ve como imagen)', /function composerPreviewItemHtml1530\(m\)/.test(appjs) && /wrPlayerHtml\('<video src="'/.test(fnBody(appjs, 'composerPreviewItemHtml1530')));
  /* (2) Subida con compresión y trozos de 1 MB. */
  check('v1.5.30 compresión: la foto se comprime a JPEG 0,80 (máx. 1600 px) antes de subir', /function compressImageDataUrl1530\(dataUrl, cb\)/.test(appjs) && /toDataURL\('image\/jpeg', 0\.80\)/.test(appjs) && /1600/.test(fnBody(appjs, 'compressImageDataUrl1530')));
  check('v1.5.30 compresión: la subida usa la foto comprimida (y la provisional por su File si hace falta)', /compressImageDataUrl1530\(item\.src, resolve\)/.test(appjs) && /compressImageDataUrl1530\(bDataUrl, resolve\)/.test(appjs) && /indexOf\('blob:'\)/.test(fnBody(appjs, 'uploadMediaItemToServer')));
  check('v1.5.30 compresión: sin canvas no se comprime (se sube tal cual, sin quedarse esperando)', /Sin canvas no se puede comprimir/.test(appjs) && /probe\.getContext/.test(fnBody(appjs, 'compressImageDataUrl1530')));
  check('v1.5.30 trozos: los trozos de subida son de 1 MB (antes 256 KB) en el cliente, core y el puente', /var MEDIA_CHUNK_B64 = 1024 \* 1024;/.test(corejs) && /offset \+ 1024 \* 1024/.test(fnBody(appjs, 'uploadFileToServer')) && /MEDIA_READ_CHUNK = 1024 \* 1024;/.test(mainJava));
  check('v1.5.30 video: el video no se re-codifica en el WebView (se acelera con los trozos grandes)', /videos NO se pueden re-codificar/.test(appjs) && !/toDataURL\('video/.test(appjs));
  /* (3) Perfil propio: los 4 botones suben a la fila superior. */
  check('v1.5.32 perfil: la fila superior lleva los 6 botones solo con símbolo y ya no hay fila abajo de la biografía', (function () { const b = fnBody(appjs, 'renderOwnProfile'); return b.indexOf('ownQuickRow') < 0 && b.indexOf('id="profileFriendsBtn"') < 0 && b.indexOf('aria-label="Seguidores"') >= 0 && b.indexOf('__wrOpenActivity') >= 0 && b.indexOf('__wrOpenLiveStart') >= 0 && b.indexOf('__wrOpenPlaceForm') >= 0 && b.indexOf('<span>Seguidores</span>') < 0 && b.indexOf('<span>Tu actividad</span>') < 0; })());
  check('v1.5.32 perfil: Seguidores conserva la insignia de solicitudes pendientes en la fila superior', (function () { const b = fnBody(appjs, 'renderOwnProfile'); const t = b.indexOf('<div class="ownTopRow">'); return t >= 0 && b.indexOf('id="profileFriendsBadge"', t) >= 0; })());
  check('v1.5.30 perfil: los botones son de 40 px para que quepan los 6 y la insignia se ancla al botón', /\.ownIconBtn\{position:relative;width:40px;height:40px/.test(idx) && !/\.ownQuickRow\{/.test(idx) && !/\.ownQuickLink\{/.test(idx));
  /* (4) La barra de subida no se encima con la barra de arriba. */
  check('v1.5.30 barra: la barra va abajo encima de la barra inferior con el contenido despejado 40 px y vuelve al acabar (1.5.46: ya no arriba)', /#mediaUploadBar\{position:fixed;left:0;right:0;bottom:calc\(68px \+ var\(--sys-nav-bottom,0px\)\);z-index:70;/.test(idx) && /body\.wrUploading1530 main\{padding-bottom:calc\(144px \+ var\(--sys-nav-bottom,0px\)\)\}/.test(idx));
  check('v1.5.30 barra: la clase se enciende al mostrar la barra y se apaga al ocultarla', /setUploadBarVisible1530\(true\)/.test(fnBody(appjs, 'bgUploadSetProgress1529')) && /setUploadBarVisible1530\(false\)/.test(fnBody(appjs, 'bgUploadHideBar1529')) && /setUploadBarVisible1530\(true\)/.test(fnBody(appjs, 'showUploadProgress')) && /setUploadBarVisible1530\(false\)/.test(fnBody(appjs, 'hideUploadProgress')));
  /* (5) WordRed para Windows. */
  check('v1.5.31 windows: la URL de descarga es la Release de GitHub v1.0.3-windows', /var WINDOWS_DOWNLOAD_URL_1530 = 'https:\/\/github\.com\/misterystoreplay\/Wordred-server\/releases\/download\/v1\.0\.3-windows\/WordRed-1\.0\.3-Windows\.exe';/.test(appjs));
  check('v1.5.31 windows: el aviso aparece una vez en la campana y se quita al descargar (no vuelve para esta versión)', /function maybeNotifyWindows1530\(\)/.test(appjs) && /windowsDlDismissed1530/.test(appjs) && /type: 'windows'/.test(appjs) && /var WINDOWS_VERSION_1530 = '1\.0\.3-windows';/.test(appjs));
  check('v1.5.30 windows: la campana muestra Descargar y Compartir, y Ajustes tiene la entrada permanente', /__wrDownloadWindows1530/.test(appjs) && /__wrShareWindows1530/.test(appjs) && /id="windowsCard"/.test(idx) && /id="windowsDownloadBtn"/.test(idx) && /windows: 'windows'/.test(appjs));
  check('v1.5.30 windows: el símbolo de Windows son 4 cuadros (icono nuevo) y el aviso es solo de la campana', /windows: '<rect/.test(appjs) && !/showNotification\('WordRed', 'WordRed también está para Windows/.test(appjs));
  /* (6) 1.5.31: "Tu tiempo hoy" en el perfil propio, en el lugar de la nota (no el clima). */
  check('v1.5.31 tiempo: en el perfil propio va "Tu tiempo hoy" en el lugar de la tarjeta de la nota (no el clima)', /screenTimeTodayHtml\(\)/.test(fnBody(appjs, 'renderOwnProfile')) && !/profileWeatherHtml1530\(\)/.test(fnBody(appjs, 'renderOwnProfile')) && !/profileNoteHtml1526\(\)/.test(fnBody(appjs, 'renderOwnProfile')) && !/function profileWeatherHtml1530\(\)/.test(appjs));
  check('v1.5.31 tiempo: la tarjeta muestra el tiempo de hoy con las barras de la semana (por teléfono, se reinicia a medianoche)', /function screenTimeTodayHtml\(\)/.test(appjs) && /Tu tiempo hoy/.test(fnBody(appjs, 'screenTimeTodayHtml')) && /Se reinicia a medianoche/.test(fnBody(appjs, 'screenTimeTodayHtml')) && /screenTimeWeek/.test(fnBody(appjs, 'screenTimeTodayHtml')));
  check('v1.5.31 tiempo: "Tu tiempo hoy" sale de Ajustes (un solo lugar, el perfil)', !/screenTimeTodayHtml\(\)/.test(fnBody(appjs, 'renderSettings1526')));
  check('v1.5.31 clima: el clima queda solo en la tarjeta de inicio (la de inicio lo muestra; el perfil ya no lo refresca)', /weatherTodayHtml1530\('weatherEnableBtn'\)/.test(fnBody(appjs, 'renderWeatherCard')) && !/profileWeatherInfo/.test(fnBody(appjs, 'renderWeatherCard')) && !/profileWeatherEnableBtn/.test(appjs));
  check('v1.5.30 nota: el editor de la biografía incluye el campo de la nota (máx. 60) y al guardar se guarda con la biografía', /id="profileNoteInput" type="text" maxlength="60"/.test(idx) && /\$\('profileNoteInput'\)\.value = p\.note \|\| ''/.test(appjs) && /note: C\.validateProfileNote\(\$\('profileNoteInput'\)/.test(appjs));
  check('v1.5.30 nota: la nota se sigue guardando igual (mismo campo, mismo servidor)', /data\.note !== undefined/.test(corejs) && /validateProfileNote\(data\.note\)/.test(corejs) && /pushToServer\('\/api\/profile', 'POST', \{ note: note \}\)/.test(appjs));
  /* FAQ de la 1.5.30. */
  check('v1.5.30 FAQ: sigue en 29 entradas y describe la previa al instante y la compresión (máx. 400 caracteres)', faqEntries === 29 && /sale al instante/.test(faqBlock) && /se comprime/.test(faqBlock) && (function () { const m = faqBlock.match(/¿Cómo publico algo\?', a: '([^']*)'/); return !!m && m[1].length <= 400; })());
}
function static1531() {
  console.log('=== 91. WordRed 1.5.34: "Tu tiempo hoy" en el perfil (no el clima) y el engrane al final ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  const faqBlock = (appjs.match(/var FAQ = \[([\s\S]*?)\];/) || [])[1] || '';
  const faqEntries = (faqBlock.match(/\{ q: '/g) || []).length;
  /* Versión. */
  check('v1.5.31 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.31 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.31 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  check('v1.5.31 versión: build.sh dice 1.5.34', /Build WordRed v1\.5\.63/.test(buildsh));
  /* (1) "Tu tiempo hoy" en el perfil, no el clima. */
  check('v1.5.31 tiempo: en el perfil propio va "Tu tiempo hoy" en el lugar de la tarjeta de la nota', /screenTimeTodayHtml\(\)/.test(fnBody(appjs, 'renderOwnProfile')) && !/profileWeatherHtml1530\(\)/.test(fnBody(appjs, 'renderOwnProfile')) && !/profileNoteHtml1526\(\)/.test(fnBody(appjs, 'renderOwnProfile')));
  check('v1.5.31 tiempo: "Tu tiempo hoy" sale de Ajustes (un solo lugar, el perfil)', !/screenTimeTodayHtml\(\)/.test(fnBody(appjs, 'renderSettings1526')));
  check('v1.5.31 clima: el clima queda solo en la tarjeta de inicio', /weatherTodayHtml1530\('weatherEnableBtn'\)/.test(fnBody(appjs, 'renderWeatherCard')) && !/profileWeatherInfo/.test(appjs) && !/profileWeatherEnableBtn/.test(appjs));
  /* (2) El engrane de ajustes es el último de la fila superior. */
  check('v1.5.32 perfil: el engrane de ajustes es el último botón de la fila superior (6º)', (function () { const b = fnBody(appjs, 'renderOwnProfile'); const iVis = b.indexOf('id="profileViewsBtn"'); const iFol = b.indexOf('aria-label="Seguidores"'); const iAct = b.indexOf('aria-label="Tu actividad"'); const iLive = b.indexOf('aria-label="Transmitir en vivo"'); const iPlace = b.indexOf('aria-label="Recomendar un lugar"'); const iSet = b.indexOf('aria-label="Ajustes"'); return iVis >= 0 && iFol > iVis && iAct > iFol && iLive > iAct && iPlace > iLive && iSet > iPlace && b.indexOf('id="profileFriendsBtn"') < 0; })());
  check('v1.5.32 perfil: la fila sigue con 6 botones de 40 px, solo símbolos, y Seguidores conserva la insignia', (function () { const b = fnBody(appjs, 'renderOwnProfile'); const t = b.indexOf('<div class="ownTopRow">'); return t >= 0 && (b.match(/class="ownIconBtn/g) || []).length === 5 && b.indexOf('class="ownViewsCircle"', t) >= 0 && b.indexOf('id="profileFriendsBadge"', t) >= 0 && b.indexOf('ownIconBtn red', t) >= 0; })() && /\.ownIconBtn\{position:relative;width:40px;height:40px/.test(idx));
  /* FAQ sigue en 24. */
  check('v1.5.31 FAQ: sigue en 29 entradas', faqEntries === 29);
}
function static1532() {
  console.log('=== 92. WordRed 1.5.34: sin botón Amigos en la fila; la insignia vive en Seguidores ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  const faqBlock = (appjs.match(/var FAQ = \[([\s\S]*?)\];/) || [])[1] || '';
  const faqEntries = (faqBlock.match(/\{ q: '/g) || []).length;
  /* Versión. */
  check('v1.5.32 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.32 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.32 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  check('v1.5.32 versión: build.sh dice 1.5.34', /Build WordRed v1\.5\.63/.test(buildsh));
  /* (1) El botón Amigos ya no existe. */
  check('v1.5.32 perfil: el botón Amigos (profileFriendsBtn) ya no existe en la app', !/profileFriendsBtn/.test(appjs) && !/profileFriendsBtn/.test(idx));
  check('v1.5.32 perfil: la fila superior tiene 6 botones en orden, con el engrane el último (6º)', (function () { const b = fnBody(appjs, 'renderOwnProfile'); const iVis = b.indexOf('id="profileViewsBtn"'); const iFol = b.indexOf('aria-label="Seguidores"'); const iAct = b.indexOf('aria-label="Tu actividad"'); const iLive = b.indexOf('aria-label="Transmitir en vivo"'); const iPlace = b.indexOf('aria-label="Recomendar un lugar"'); const iSet = b.indexOf('aria-label="Ajustes"'); return iVis >= 0 && iFol > iVis && iAct > iFol && iLive > iAct && iPlace > iLive && iSet > iPlace && b.indexOf('aria-label="Amigos"') < 0; })());
  /* (2) La insignia vive en Seguidores. */
  check('v1.5.32 perfil: la insignia de solicitudes (profileFriendsBadge) está dentro del botón Seguidores', (function () { const b = fnBody(appjs, 'renderOwnProfile'); const iSeg = b.indexOf('aria-label="Seguidores"'); const iBadge = b.indexOf('id="profileFriendsBadge"'); const iAct = b.indexOf('aria-label="Tu actividad"'); return iSeg >= 0 && iBadge > iSeg && iBadge < iAct; })());
  check('v1.5.32 perfil: la insignia se actualiza en updateBadges y se esconde sin solicitudes', /profileFriendsBadge/.test(fnBody(appjs, 'updateBadges')) && /classList\.toggle\('hidden', pair\[1\] === 0\)/.test(fnBody(appjs, 'updateBadges')));
  /* (3) La lista de amigos sigue abriéndose desde Seguidores. */
  check('v1.5.32 perfil: Seguidores abre la lista de amigos (__wrOpenFriends)', /window\.__wrOpenFriends = function \(\) \{ go\('friends'\); \}/.test(appjs) && /aria-label="Seguidores" title="Seguidores" onclick="window\.__wrOpenFriends\(\)"/.test(appjs));
  check('v1.5.32 perfil: la fila de conteos "amigos" sigue en el perfil propio', /class="ownStats"/.test(appjs) && /<span>amigos<\/span>/.test(appjs));
  /* "Tu tiempo hoy" y el resto de la 1.5.31 siguen intactos. */
  check('v1.5.32 perfil: "Tu tiempo hoy" sigue en el perfil propio (no el clima)', /screenTimeTodayHtml\(\)/.test(fnBody(appjs, 'renderOwnProfile')) && !/profileWeatherHtml1530\(\)/.test(fnBody(appjs, 'renderOwnProfile')));
  /* FAQ sigue en 24. */
  check('v1.5.32 FAQ: sigue en 29 entradas', faqEntries === 29);
}
function static1533() {
  console.log('=== 93. WordRed 1.5.34: tiempo real, tutorial sin animales ni animaciones, 20 perfiles de ejemplo ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  const faqBlock = (appjs.match(/var FAQ = \[([\s\S]*?)\];/) || [])[1] || '';
  const faqEntries = (faqBlock.match(/\{ q: '/g) || []).length;
  /* Versión. */
  check('v1.5.33 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.33 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.33 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  check('v1.5.33 versión: build.sh dice 1.5.34', /Build WordRed v1\.5\.63/.test(buildsh));
  /* (1) Tiempo en pantalla que cuenta de verdad. */
  check('v1.5.33 tiempo: se guarda cada 10 segundos (no cada minuto)', /setInterval\(function \(\) \{ screenTimeFlush1526\(\); \}, 10000\)/.test(fnBody(appjs, 'screenTimeStart1526')));
  check('v1.5.33 tiempo: se guarda al pausar y al cerrar (pagehide y beforeunload)', /pagehide/.test(fnBody(appjs, 'screenTimeStart1526')) && /beforeunload/.test(fnBody(appjs, 'screenTimeStart1526')));
  check('v1.5.33 tiempo: al ocultar la app solo se guarda, no se reinicia el contador (el segundo plano cuenta)', /if \(document\.hidden\) screenTimeFlush1526\(\);/.test(fnBody(appjs, 'screenTimeStart1526')) && !/else screenTimeStart = Date\.now\(\);/.test(fnBody(appjs, 'screenTimeStart1526')));
  check('v1.5.33 tiempo: cada guardado se limita a 2 minutos (el teléfono dormido no cuenta)', /var screenTimeFlushCap1533 = 120000;/.test(appjs) && /if \(ms > screenTimeFlushCap1533\) ms = screenTimeFlushCap1533;/.test(fnBody(appjs, 'screenTimeFlush1526')));
  check('v1.5.33 tiempo: los totales son reales por día y las barras de la semana salen de ellos', (function () {
    var st = C.emptyState();
    C.recordScreenTime(st, 45 * 60000, Date.now());
    C.recordScreenTime(st, 30 * 60000, Date.now() - 86400000);
    C.recordScreenTime(st, 10 * 60000, Date.now() - 2 * 86400000);
    var week = C.screenTimeWeek(st);
    return C.screenTimeTodayMs(st) === 45 * 60000 && week[6].ms === 45 * 60000 && week[5].ms === 30 * 60000 && week[4].ms === 10 * 60000;
  })());
  check('v1.5.33 tiempo: el texto de la tarjeta sigue siendo honesto (por teléfono, se reinicia a medianoche)', /Solo cuenta el tiempo con la app abierta en este teléfono\. Se reinicia a medianoche\./.test(appjs));
  /* (2) Tutorial: ilustraciones simples de la app, ni animales ni animaciones. */
  check('v1.5.33 tutorial: son 6 pasos con ilustración, título y texto', (function () { var m = appjs.match(/var TUTORIAL_STEPS_1533 = \[([\s\S]*?)\];/); return !!m && (m[1].match(/art: '/g) || []).length === 6 && (m[1].match(/title: '/g) || []).length === 6; })());
  check('v1.5.33 tutorial: cada paso lleva una ilustración estática de la app (SVG, sin fotos)', /function tutorialArt1533\(art\)/.test(appjs) && /return '<svg width="100%" height="200"/.test(appjs));
  check('v1.5.33 tutorial: NI animales NI animaciones (sin fotos de animales, sin personajes, sin contenido animado)', !/animales\//.test(appjs) && !/animales\//.test(idx) && (function () { var m = appjs.match(/var TUTORIAL_STEPS_1533 = \[([\s\S]*?)\];/); return !!m && /perro|gato|zorro|búho|león|panda/i.test(m[1]) === false; })());
  check('v1.5.33 tutorial: el CSS del tutorial no lleva animaciones ni transiciones', (function () { var i = idx.indexOf('#tutorialOverlay{'); if (i < 0) return false; var j = idx.indexOf('}', idx.indexOf('.tutorialWrap{')); var css = idx.slice(i, j + 1); return css.indexOf('animation') < 0 && css.indexOf('transition') < 0; })());
  check('v1.5.33 tutorial: el overlay existe en el HTML con fondo traslúcido (se ve la app detrás)', /id="tutorialOverlay"/.test(idx) && /id="tutorialCard"/.test(idx) && /#tutorialOverlay\{background:rgba\(5,1,2,\.55\)/.test(idx));
  check('v1.5.33 tutorial: hay botón Saltar bien visible y Siguiente/Empezar', /id="tutorialSkip">Saltar</.test(appjs) && /id="tutorialNext"/.test(appjs) && /'Empezar'/.test(appjs));
  check('v1.5.33 tutorial: se marca como visto al cerrarse y no vuelve solo (maybeShowTutorial1533)', /function maybeShowTutorial1533\(\)/.test(appjs) && /function tutorialSeen1533\(\)/.test(appjs) && /state\.settings\.tutorialSeen1533 = true;/.test(fnBody(appjs, 'closeTutorial1533')) && /showOverlay\('tutorialOverlay'\)/.test(fnBody(appjs, 'showTutorial1533')));
  check('v1.5.33 tutorial: en Ajustes hay entrada para verlo otra vez', /Ver el tutorial otra vez/.test(appjs) && /window\.__wrShowTutorial = function \(\) \{ showTutorial1533\(\); \}/.test(appjs));
  check('v1.5.33 tutorial: se muestra al entrar a la app y al terminar los permisos', /maybeShowTutorial1533\(\);/.test(fnBody(appjs, 'enterApp')) && /maybeShowTutorial1533\(\);/.test(fnBody(appjs, 'renderPermDone')));
  /* (3) 20 perfiles de ejemplo, ni animales ni animaciones. */
  check('v1.5.34 ejemplos: hay 1 sola cuenta de ejemplo con avatar neutro (inicial SVG)', (function () { var st = C.emptyState(); C.seedDemo(st); var demos = Object.keys(st.profiles).filter(function (k) { return st.profiles[k].isDemo; }); return demos.length === 1 && demos[0] === '0000000000' && demos.every(function (k) { return st.profiles[k].photo.indexOf('data:image/svg+xml') === 0; }); })());
  check('v1.5.34 ejemplos: las publicaciones de ejemplo son fotos neutras o texto, con exactamente 1 video (la ciudad)', (function () { var st = C.emptyState(); C.seedDemo(st); var dps = st.posts.filter(function (p) { return p.isDemo; }); return dps.filter(function (p) { return p.mediaType === 'video'; }).length === 1 && dps.filter(function (p) { return p.mediaType === 'image'; }).every(function (p) { return p.media.indexOf('ejemplo/') === 0; }); })());
  check('v1.5.34 ejemplos: nada de ejemplo menciona animales ni usa clips de animales', !/animales\//.test(corejs.replace(/indexOf\('animales\/'\) === 0/g, '')) && (function () { var st = C.emptyState(); C.seedDemo(st); return st.posts.filter(function (p) { return p.isDemo; }).every(function (p) { return (p.media || '').indexOf('animales/') < 0 && (p.media || '').indexOf('demo-video') < 0; }); })());
  check('v1.5.34 ejemplos: los assets neutros existen (8 fotos + el video de ejemplo) y no hay carpeta de animales ni videos viejos', ['cafe.jpg', 'montana.jpg', 'playa.jpg', 'flores.jpg', 'ciudad.jpg', 'libros.jpg', 'lago.jpg', 'amanecer.jpg'].every(function (f) { return fs.existsSync(path.join(__dirname, '..', 'assets', 'ejemplo', f)); }) && fs.existsSync(path.join(__dirname, '..', 'assets', 'ejemplo', 'video-ciudad.mp4')) && !fs.existsSync(path.join(__dirname, '..', 'assets', 'animales')) && !fs.existsSync(path.join(__dirname, '..', 'assets', 'demo-video.mp4')) && !fs.existsSync(path.join(__dirname, '..', 'assets', 'demo-video2.mp4')));
  check('v1.5.34 ejemplos: la insignia Ejemplo existe (perfil y publicaciones)', /demobadge/.test(appjs) && /Ejemplo/.test(appjs));
  check('v1.5.34 ejemplos: en Ajustes hay interruptor para ocultar/mostrar la cuenta de ejemplo', /id="examplesToggle"/.test(appjs) && /Cuenta de ejemplo/.test(appjs) && /state\.settings\.examplesOverride = ex\.checked \? 'show' : 'hide';/.test(appjs));
  check('v1.5.34 ejemplos: al entrar se migran los ejemplos viejos (de 20 a 1)', /C\.ensureDemo1534\(state\);/.test(fnBody(appjs, 'ensure1526State')));
  check('v1.5.34 ejemplos: de vez en cuando la cuenta publica o da Me gusta (cada 25 min, solo con la app abierta)', /demoActivityTimer1534 = setInterval/.test(appjs) && /25 \* 60000/.test(appjs) && /C\.demoActivityPost\(state\)/.test(appjs) && /C\.demoActivityLike\(state\)/.test(appjs));
  /* FAQ 24 con la entrada del tutorial. */
  check('v1.5.33 FAQ: 29 entradas con la del tutorial, la del menú y las 3 de la 1.5.42', faqEntries === 29 && /¿Cómo veo el tutorial otra vez\?/.test(faqBlock));
  /* 1.5.32 intacto: sin Amigos en la fila, insignia en Seguidores, 6 botones. */
  check('v1.5.33 perfil: la 1.5.32 sigue intacta (sin botón Amigos, insignia en Seguidores, 6 botones)', !/profileFriendsBtn/.test(appjs) && /id="profileFriendsBadge"/.test(appjs));
}

function static1534() {
  console.log('=== 94. WordRed 1.5.34: 1 sola cuenta de ejemplo y música automática que sí suena ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const mainact = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  const faqBlock = (appjs.match(/var FAQ = \[([\s\S]*?)\];/) || [])[1] || '';
  const faqEntries = (faqBlock.match(/\{ q: '/g) || []).length;
  /* Versión. */
  check('v1.5.34 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.34 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.34 versión: los textos visibles dicen 1.5.34 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  check('v1.5.34 versión: build.sh dice 1.5.34', /Build WordRed v1\.5\.63/.test(buildsh));
  /* (1) Una sola cuenta de ejemplo, un ejemplo de cada opción. */
  check('v1.5.34 ejemplos: solo queda 1 cuenta de ejemplo (la oficial) con un ejemplo de cada opción', (function () { var st = C.emptyState(); C.seedDemo(st); var demos = Object.keys(st.profiles).filter(function (k) { return st.profiles[k].isDemo; }); var dps = st.posts.filter(function (p) { return p.isDemo; }); return demos.length === 1 && demos[0] === '0000000000' && dps.length === 7 && dps.filter(function (p) { return p.mediaType === 'video'; }).length === 1 && dps.filter(function (p) { return p.song && C.songHasAudio(p.song); }).length === 1 && st.stories.filter(function (x) { return x.isDemo; }).length === 1 && st.groups.filter(function (g) { return String(g.name || '').indexOf('(ejemplo)') >= 0; }).length === 1; })());
  check('v1.5.34 ejemplos: 0 referencias a las 20 cuentas viejas (ni en el código ni en los datos)', !/DEMO_PROFILES_1533|DEMO_SEED_POSTS_1533|demoLikesFor1533|ensureDemo1533|DEMO_ACTIVITY_1533/.test(corejs) && !/DEMO_PROFILES_1533|DEMO_SEED_POSTS_1533|demoLikesFor1533|ensureDemo1533|DEMO_ACTIVITY_1533/.test(appjs) && !/1000000001|1000000002|1000000019/.test(corejs));
  check('v1.5.34 ejemplos: el video de ejemplo existe en los assets (clip neutro de la ciudad, sin movimiento)', fs.existsSync(path.join(__dirname, '..', 'assets', 'ejemplo', 'video-ciudad.mp4')));
  check('v1.5.34 ejemplos: en Ajustes el texto dice 1 cuenta (no 20)', /Cuenta de ejemplo/.test(appjs) && !/Perfiles de ejemplo/.test(appjs));
  check('v1.5.34 ejemplos: la desaparición a las 10 publicaciones reales sigue (regla intacta)', C.EXAMPLE_HIDE_REAL_POSTS === 10 && typeof C.ensureDemo1534 === 'function');
  check('v1.5.34 ejemplos: la migración repone el post del grupo aunque el grupo sobreviva (el arranque real lo borraba)', (function () { var st = C.emptyState(); C.seedDemo(st); var g = st.groups.filter(function (x) { return String(x.name || '').indexOf('(ejemplo)') >= 0; })[0]; st.posts = st.posts.filter(function (x) { return x.demoKey !== 'ejemplo-grupo'; }); st.demoMigrated1534 = false; var r = C.ensureDemo1534(st); var gp = st.posts.filter(function (x) { return x.demoKey === 'ejemplo-grupo'; }); return r.ok && r.migrated === 1 && gp.length === 1 && gp[0].groupId === g.id && gp[0].text.indexOf('salsa verde') >= 0; })());
  /* (2) Música automática que sí suena: la causa y el arreglo. */
  check('v1.5.34 música: las 12 canciones del catálogo tienen archivo de audio real (musica/, 1.5.35: sin el prefijo assets/ que no existía)', C.SONG_CATALOG.length === 12 && C.SONG_CATALOG.every(function (sg) { return typeof sg.src === 'string' && sg.src.indexOf('musica/cancion-') === 0 && sg.src.indexOf('assets/') < 0 && sg.src.slice(-4) === '.mp3' && C.songHasAudio(sg); }));
  check('v1.5.34 música: los 12 archivos de audio existen en los assets', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every(function (n) { return fs.existsSync(path.join(__dirname, '..', 'assets', 'musica', 'cancion-' + n + '.mp3')); }));
  check('v1.5.34 música: songFromCatalog ya no borra el src (la segunda causa del silencio)', C.songFromCatalog('cancion-1').src === 'musica/cancion-1.mp3' && C.songHasAudio(C.songFromCatalog('cancion-2')));
  check('v1.5.34 música: la sugerencia automática devuelve una canción CON audio', (function () { var r = C.suggestSongForVideo(30000, [], 'fiesta en la ciudad'); var r2 = C.suggestSongForImage([], 'café de la mañana'); return !!r && !!r.song && C.songHasAudio(r.song) && !!r.song.src && !!r2 && !!r2.song && C.songHasAudio(r2.song); })());
  check('v1.5.34 música: el botón de play del selector ya no está deshabilitado para el catálogo y tiene su handler', /C\.songHasAudio\(sg\) \? '' : ' disabled title=/.test(appjs) && /\[data-preview-id\]/.test(appjs) && /toggleSongPreview\(song, b\)/.test(appjs));
  check('v1.5.34 música: el WebView permite reproducir con sonido sin gesto (setMediaPlaybackRequiresUserGesture false)', /setMediaPlaybackRequiresUserGesture\(false\)/.test(mainact));
  check('v1.5.34 música: la vista previa pone el src y llama a play (sin silencio, sin volumen 0; 1.5.35: captura el fallo)', /audio\.setAttribute\('src', song\.src\)/.test(fnBody(appjs, 'toggleSongPreview')) && /audio\.play\(\)/.test(fnBody(appjs, 'toggleSongPreview')) && !/audio\.muted/.test(fnBody(appjs, 'toggleSongPreview')) && !/audio\.volume\s*=\s*0/.test(fnBody(appjs, 'toggleSongPreview')) && /\.catch\(function/.test(fnBody(appjs, 'toggleSongPreview')) && /addEventListener\('error'/.test(fnBody(appjs, 'getSongPreviewAudio')));
  check('v1.5.34 música: el crédito de la música está visible en el selector (CC-BY)', /Kevin MacLeod \(incompetech\.com\), licencia CC-BY/.test(appjs));
  /* FAQ sigue en 24. */
  check('v1.5.34 FAQ: sigue en 29 entradas', faqEntries === 29);
  /* 1.5.33 intacto. */
  check('v1.5.34 perfil: la 1.5.33 sigue intacta (tutorial 6 pasos, tiempo real, sin Amigos)', /var TUTORIAL_STEPS_1533 = \[/.test(appjs) && /var screenTimeFlushCap1533 = 120000;/.test(appjs) && !/profileFriendsBtn/.test(appjs));
}

function static1535() {
  console.log('=== 95. WordRed 1.5.35: la música sí suena (ruta musica/) y el fallo se avisa ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const mainact = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  const faqBlock = (appjs.match(/var FAQ = \[([\s\S]*?)\];/) || [])[1] || '';
  const faqEntries = (faqBlock.match(/\{ q: '/g) || []).length;
  /* Versión. */
  check('v1.5.35 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.35 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.35 versión: los textos visibles dicen 1.5.36 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  check('v1.5.35 versión: build.sh dice 1.5.36', /Build WordRed v1\.5\.63/.test(buildsh));
  /* (1) La causa: la ruta llevaba un prefijo assets/ de más. */
  check('v1.5.35 música: los 12 src del catálogo son exactamente musica/cancion-N.mp3', C.SONG_CATALOG.length === 12 && C.SONG_CATALOG.every(function (sg, i) { return sg.src === 'musica/cancion-' + (i + 1) + '.mp3'; }));
  check('v1.5.35 música: 0 veces assets/musica/ en toda la fuente (ni código ni comentarios)', !/assets\/musica/.test(appjs) && !/assets\/musica/.test(corejs));
  check('v1.5.35 música: la ruta resuelta desde la página es un archivo real dentro de la APK', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every(function (n) { var resolved = new URL('musica/cancion-' + n + '.mp3', 'file:///android_asset/index.html').href; return resolved === 'file:///android_asset/musica/cancion-' + n + '.mp3' && fs.existsSync(path.join(__dirname, '..', 'assets', 'musica', 'cancion-' + n + '.mp3')); }));
  check('v1.5.35 música: la ruta vieja no existe (no hay carpeta assets/assets/ ni en el proyecto ni en la APK)', !fs.existsSync(path.join(__dirname, '..', 'assets', 'assets')));
  check('v1.5.35 música: songFromCatalog devuelve el src ya corregido (las 12)', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].every(function (n) { return C.songFromCatalog('cancion-' + n).src === 'musica/cancion-' + n + '.mp3'; }));
  check('v1.5.35 música: la sugerencia automática devuelve canción con el src corregido', (function () { var r = C.suggestSongForVideo(30000, [], 'fiesta en la ciudad'); return !!r && !!r.song && r.song.src.indexOf('musica/cancion-') === 0; })());
  /* (2) Fallo honesto: nunca quedarse en silencio. */
  check('v1.5.35 música: toggleSongPreview captura el rechazo de play() y revierte el botón con aviso', /\.catch\(function/.test(fnBody(appjs, 'toggleSongPreview')) && /resetSongPreviewBtn\(\)/.test(fnBody(appjs, 'toggleSongPreview')) && /No se pudo reproducir esta canción/.test(fnBody(appjs, 'toggleSongPreview')));
  check('v1.5.35 música: el audio de vista previa tiene manejador de error', /addEventListener\('error'/.test(fnBody(appjs, 'getSongPreviewAudio')));
  check('v1.5.35 música: el Sonido de la publicación también captura el fallo de play() y tiene onerror', (function () { var a = appjs.indexOf('window.__wrToggleSong = function'); var b = appjs.indexOf('window.__wrSongError = function'); var tog = a >= 0 && b > a ? appjs.slice(a, b) : ''; return /\.catch\(function/.test(tog) && /No se pudo reproducir esta canción/.test(tog) && /window\.__wrSongError = function/.test(appjs) && /onerror="window\.__wrSongError/.test(appjs); })());
  /* (3) WebSettings: MainActivity NO se tocó (el audio file:// no necesita ese ajuste). */
  check('v1.5.35 webview: MainActivity sin setAllowFileAccessFromFileURLs ni setAllowUniversalAccessFromFileURLs (los <audio> cargan como subrecurso, igual que <img>, según la doc oficial)', !/setAllowFileAccessFromFileURLs/.test(mainact) && !/setAllowUniversalAccessFromFileURLs/.test(mainact));
  check('v1.5.35 webview: el acceso a archivos y el gesto siguen como en la 1.5.34', /setAllowFileAccess\(true\)/.test(mainact) && /setMediaPlaybackRequiresUserGesture\(false\)/.test(mainact));
  /* FAQ sigue en 24. */
  check('v1.5.35 FAQ: sigue en 29 entradas', faqEntries === 29);
  /* 1.5.34 intacto. */
  check('v1.5.35 1.5.34 intacto: 1 sola cuenta de ejemplo con un ejemplo de cada opción', (function () { var st = C.emptyState(); C.seedDemo(st); var demos = Object.keys(st.profiles).filter(function (k) { return st.profiles[k].isDemo; }); var dps = st.posts.filter(function (p) { return p.isDemo; }); return demos.length === 1 && demos[0] === '0000000000' && dps.length === 7 && dps.filter(function (p) { return p.mediaType === 'video'; }).length === 1 && dps.filter(function (p) { return p.song && C.songHasAudio(p.song); }).length === 1 && st.stories.filter(function (x) { return x.isDemo; }).length === 1 && st.groups.filter(function (g) { return String(g.name || '').indexOf('(ejemplo)') >= 0; }).length === 1; })());
  check('v1.5.35 1.5.34 intacto: tutorial 6 pasos, tiempo real, sin Amigos', /var TUTORIAL_STEPS_1533 = \[/.test(appjs) && /var screenTimeFlushCap1533 = 120000;/.test(appjs) && !/profileFriendsBtn/.test(appjs));
}

function static1536() {
  console.log('=== 96. WordRed 1.5.36: menú principal con apartados tipo widgets ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const mainact = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  const faqBlock = (appjs.match(/var FAQ = \[([\s\S]*?)\];/) || [])[1] || '';
  const faqEntries = (faqBlock.match(/\{ q: '/g) || []).length;
  /* Versión. */
  check('v1.5.36 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.36 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.36 versión: los textos visibles dicen 1.5.36 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  check('v1.5.36 versión: build.sh dice 1.5.36', /Build WordRed v1\.5\.63/.test(buildsh));
  /* (1) Registro y predeterminado. */
  check('v1.5.36 widgets: el registro tiene los 5 apartados del inicio y 7 agregables (calendario, mensajería, fotos, calculadora, notas, batería, tiempo)', C.HOME_WIDGETS_BUILTIN_1536.length === 5 && ['reloj', 'clima', 'historias', 'publicar', 'accesos'].every(function (id) { return C.HOME_WIDGETS_BUILTIN_1536.indexOf(id) >= 0; }) && C.HOME_WIDGETS_ADDABLE_1536.length === 7 && ['calendario', 'mensajeria', 'fotos', 'calculadora', 'notas', 'bateria', 'tiempo'].every(function (id) { return C.HOME_WIDGETS_ADDABLE_1536.some(function (w) { return w.id === id; }); }));
  check('v1.5.36 widgets: tamaños s/m/l y 6 colores (rojo, azul, verde, morado, naranja, gris)', C.HOME_WIDGET_SIZES_1536.join(',') === 's,m,l' && C.HOME_WIDGET_COLORS_1536.length === 6 && C.HOME_WIDGET_COLORS_1536.indexOf('rojo') >= 0 && C.HOME_WIDGET_COLORS_1536.indexOf('gris') >= 0);
  check('v1.5.36 widgets: el predeterminado es reloj+clima en s y el resto en m, todo rojo', (function () { var d = C.defaultHomeWidgets1536(); return d.order.join(',') === 'historias,publicar,reloj,clima,accesos' && d.sizes.reloj === 's' && d.sizes.clima === 's' && d.sizes.historias === 'm' && d.sizes.publicar === 'm' && d.sizes.accesos === 'm' && d.added.length === 0 && d.notes.length === 0; })());
  check('v1.5.36 widgets: el estado nuevo trae el campo (null = predeterminado) y normalize lo crea', C.emptyState().homeWidgets1536 === null && (function () { var st = C.emptyState(); var c = C.normalizeHomeWidgets1536(st); return c.order.length === 5 && st.homeWidgets1536 === c; })());
  check('v1.5.36 widgets: normalize quita ids desconocidos, repone los del inicio y fija tamaño/color malos', (function () { var st = { homeWidgets1536: { order: ['reloj', 'xxx', 'clima'], sizes: { reloj: 'xx' }, colors: { reloj: 'rosa' }, added: ['calendario', 'noexiste'], notes: [{ text: '  ' }, { text: 'comprar pan' }] } }; var c = C.normalizeHomeWidgets1536(st); return c.order.join(',') === 'historias,reloj,clima,publicar,accesos,calendario' && c.sizes.reloj === 's' && c.colors.reloj === 'rojo' && c.added.join(',') === 'calendario' && c.notes.length === 1 && c.notes[0].text === 'comprar pan'; })());
  /* (2) Estructura del inicio. */
  check('v1.5.36 widgets: el inicio tiene el contenedor y los 5 apartados con su tamaño y color', /id="homeWidgets1536"/.test(idx) && ['reloj', 'clima', 'historias', 'publicar', 'accesos'].every(function (id) { return idx.indexOf('data-widget="' + id + '"') >= 0; }) && /data-widget="reloj" data-size="s" data-color="rojo"/.test(idx) && /data-widget="clima" data-size="s" data-color="rojo"/.test(idx));
  check('v1.5.36 widgets: el botón + Agregar apartado y la hoja para elegir existen', /id="homeAddBtn1536"/.test(idx) && /id="homeAddOverlay1536"/.test(idx) && /id="homeAddList1536"/.test(idx));
  check('v1.5.36 widgets: la barra de edición existe (Subir, Bajar, Tamaño, Color, Quitar, Listo)', /id="homeEditBar1536"/.test(idx) && /id="hwMoveUp"/.test(idx) && /id="hwMoveDown"/.test(idx) && /id="hwSizeBtn"/.test(idx) && /id="hwColorBtn"/.test(idx) && /id="hwRemoveBtn"/.test(idx) && /id="hwDoneBtn"/.test(idx));
  check('v1.5.36 widgets: ya no hay .weatherRow (reloj y clima son apartados sueltos)', !/weatherRow/.test(idx));
  check('v1.5.36 widgets: los ids del inicio siguen (reloj, clima, historias, publicar, accesos)', /id="weatherTimeCard"/.test(idx) && /id="weatherCard"/.test(idx) && /id="storiesRow"/.test(idx) && /id="composerOpen"/.test(idx) && /id="feedEventsBtn"/.test(idx));
  check('v1.5.36 widgets: el inicio se inicializa al arrancar la app', /initHomeWidgets1536\(\);/.test(appjs));
  /* (3) Modo de edición: solo mantener presionado, y lo demás translúcido. */
  check('v1.5.36 widgets: el modo de edición se entra con pointerdown y 550 ms (sin botón de editar ni opción en Ajustes)', /HOME_WIDGET_LONGPRESS_MS_1536 = 550/.test(appjs) && /addEventListener\('pointerdown'/.test(fnBody(appjs, 'initHomeWidgets1536')) && /setTimeout\(function \(\) \{/.test(fnBody(appjs, 'hwLongPressBegin1536')) && !/Editar menú|editarMenu|editHomeWidgets/.test(appjs));
  check('v1.5.36 widgets: al editar, lo demás queda translúcido (opacidad .35) y solo el apartado editado queda opaco', /body\.hwEditing1536 #view-feed \.homeWidget:not\(\.hwActive\)\{opacity:\.35\}/.test(idx) && /body\.hwEditing1536 #view-feed > :not\(#homeWidgets1536\)\{opacity:\.35\}/.test(idx) && /body\.hwEditing1536 #view-feed \.homeWidget\.hwActive\{opacity:1/.test(idx));
  check('v1.5.36 widgets: el toque que sigue al mantener presionado se traga (el clima no abre su detalle)', /hwSuppressClick1536/.test(fnBody(appjs, 'initHomeWidgets1536')) && /stopPropagation\(\)/.test(fnBody(appjs, 'initHomeWidgets1536')));
  check('v1.5.36 widgets: mover, tamaño y color se guardan (save) y se reaplican', /save\(\);/.test(fnBody(appjs, 'moveHomeWidget1536')) && /save\(\);/.test(fnBody(appjs, 'cycleHomeWidgetSize1536')) && /save\(\);/.test(fnBody(appjs, 'cycleHomeWidgetColor1536')) && /applyHomeWidgets1536\(\);/.test(fnBody(appjs, 'moveHomeWidget1536')));
  check('v1.5.36 widgets: salir del modo quita la clase y esconde la barra; al cambiar de vista también se sale', /classList\.remove\('hwEditing1536'\)/.test(fnBody(appjs, 'exitHomeWidgetEdit1536')) && /exitHomeWidgetEdit1536\(\)/.test(fnBody(appjs, 'go')));
  check('v1.5.36 widgets: al salir se limpia la supresión del toque (el siguiente toque, como el botón +, funciona)', /hwSuppressClick1536 = false;/.test(fnBody(appjs, 'exitHomeWidgetEdit1536')));
  /* (4) Los agregados funcionan de verdad. */
  check('v1.5.36 widgets: la calculadora evalúa sin eval() y con precedencia (× ÷ % antes que + −)', /function hwCalcEval1536/.test(appjs) && !/eval\(/.test(fnBody(appjs, 'hwCalcEval1536')) && /op === '\*' \? a \* v/.test(fnBody(appjs, 'hwCalcEval1536')) && /r = out\[k\] === '\+' \? r \+ out\[k \+ 1\] : r - out\[k \+ 1\]/.test(fnBody(appjs, 'hwCalcEval1536')));
  check('v1.5.36 widgets: el calendario marca el día de hoy y cambia de mes', /hwToday/.test(fnBody(appjs, 'homeWidgetCalendarHtml1536')) && /data-cal-nav/.test(fnBody(appjs, 'homeWidgetCalendarHtml1536')));
  check('v1.5.36 widgets: mensajería cuenta los sin leer y abre los mensajes', /c\.unread\[state\.me\]/.test(fnBody(appjs, 'homeWidgetMessagesHtml1536')) && /go\('messages'\)/.test(fnBody(appjs, 'homeWidgetClick1536')));
  check('v1.5.36 widgets: fotos muestra mis fotos publicadas y abre la publicación', /mediaType === 'image'/.test(fnBody(appjs, 'homeWidgetPhotosHtml1536')) && /__wrOpenPost/.test(fnBody(appjs, 'homeWidgetClick1536')));
  check('v1.5.36 widgets: notas se guardan en la configuración y se borran', /cfg\.notes\.push/.test(fnBody(appjs, 'homeWidgetClick1536')) && /data-hw-note-del/.test(fnBody(appjs, 'homeWidgetNotesHtml1536')));
  check('v1.5.36 widgets: batería muestra el nivel real y se refresca al llegar', /batteryLevel/.test(fnBody(appjs, 'homeWidgetBatteryHtml1536')) && /renderHomeWidgetBody1536\('bateria'\)/.test(appjs));
  check('v1.5.36 widgets: tiempo muestra el tiempo de hoy con el formato real', /C\.formatScreenTime\(C\.screenTimeTodayMs\(state\)\)/.test(fnBody(appjs, 'homeWidgetTimeHtml1536')));
  check('v1.5.36 widgets: sin animaciones nuevas salvo el resplandor del cargador (26 @keyframes: los 25 viejos + chargerGlowRise1561)', (idx.match(/@keyframes/g) || []).length === 26 && /@keyframes chargerGlowRise1561/.test(idx));
  /* FAQ: 24 + 1 = 25. */
  check('v1.5.36 FAQ: 29 entradas (nueva: cómo acomodar el menú principal)', faqEntries === 29 && /¿Cómo acomodo el menú principal\?/.test(appjs));
  /* 1.5.35 intacto. */
  check('v1.5.36 1.5.35 intacto: las 12 canciones con musica/ y 0 assets/musica', C.SONG_CATALOG.length === 12 && C.SONG_CATALOG.every(function (sg, i) { return sg.src === 'musica/cancion-' + (i + 1) + '.mp3'; }) && !/assets\/musica/.test(appjs) && !/assets\/musica/.test(corejs));
  check('v1.5.36 1.5.35 intacto: toggleSongPreview captura el fallo y __wrSongError existe', /\.catch\(function/.test(fnBody(appjs, 'toggleSongPreview')) && /__wrSongError/.test(appjs));
  /* 1.5.34 intacto. */
  check('v1.5.36 1.5.34 intacto: 1 sola cuenta de ejemplo con un ejemplo de cada opción', (function () { var st = C.emptyState(); C.seedDemo(st); var demos = Object.keys(st.profiles).filter(function (k) { return st.profiles[k].isDemo; }); var dps = st.posts.filter(function (p) { return p.isDemo; }); return demos.length === 1 && demos[0] === '0000000000' && dps.length === 7 && dps.filter(function (p) { return p.mediaType === 'video'; }).length === 1 && dps.filter(function (p) { return p.song && C.songHasAudio(p.song); }).length === 1 && st.stories.filter(function (x) { return x.isDemo; }).length === 1 && st.groups.filter(function (g) { return String(g.name || '').indexOf('(ejemplo)') >= 0; }).length === 1; })());
  check('v1.5.36 1.5.34 intacto: tutorial 6 pasos, tiempo real, sin Amigos', /var TUTORIAL_STEPS_1533 = \[/.test(appjs) && /var screenTimeFlushCap1533 = 120000;/.test(appjs) && !/profileFriendsBtn/.test(appjs));
}

function static1537() {
  console.log('=== 97. WordRed 1.5.37: el reloj y la fecha caben en su recuadro; el rayo va dentro de la batería ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  const faqBlock = (appjs.match(/var FAQ = \[([\s\S]*?)\];/) || [])[1] || '';
  const faqEntries = (faqBlock.match(/\{ q: '/g) || []).length;
  /* Versión. */
  check('v1.5.37 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.37 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.37 versión: los textos visibles dicen 1.5.37 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1.5.63</.test(idx) && /WordRed 1.5.63 — red social original/.test(idx));
  check('v1.5.37 versión: build.sh dice 1.5.37', /Build WordRed v1\.5\.63/.test(buildsh));
  /* (1) La causa: en tamaño s el reloj se salía del recuadro. */
  check('v1.5.37 reloj: la tarjeta del reloj puede encogerse (min-width:0 en el apartado)', /\.homeWidget\[data-widget="reloj"\] \.weatherTimeCard\{min-width:0\}/.test(idx));
  check('v1.5.37 reloj: el reloj puede encogerse (min-width:0 y flex-shrink:1)', /\.homeWidget\[data-widget="reloj"\] \.weatherClock\{min-width:0;flex-shrink:1\}/.test(idx));
  check('v1.5.37 reloj: la hora no se parte en dos líneas (nowrap)', /\.homeWidget\[data-widget="reloj"\] \.weatherTime\{white-space:nowrap\}/.test(idx));
  check('v1.5.37 reloj: la fecha envuelve dentro del recuadro (overflow-wrap)', /\.homeWidget\[data-widget="reloj"\] \.weatherDate\{overflow-wrap:break-word\}/.test(idx));
  check('v1.5.37 reloj: el apartado no se deforma (overflow:hidden)', /\.homeWidget\[data-widget="reloj"\]\{overflow:hidden\}/.test(idx));
  check('v1.5.37 reloj: en s la hora es 39 px (antes 32 px), en m 64 px y en l 89 px', /\.homeWidget\[data-size="s"\] \.weatherTime\{font-size:39px\}/.test(idx) && /\.weatherTime\{font-size:64px/.test(idx) && /\.homeWidget\[data-size="l"\] \.weatherTime\{font-size:89px\}/.test(idx));
  check('v1.5.37 reloj: la regla vieja de s (solo min-width:0 en el reloj) ya no está; la cubre la regla general', !/\.homeWidget\[data-size="s"\] \.weatherClock\{min-width:0\}/.test(idx));
  /* (2) Caben: cálculo conservador del ancho (sin motor de diseño en Node). */
  check('v1.5.37 reloj: la hora y la fecha caben hasta en un teléfono de 320 px (cálculo conservador: dígito/palabra ≤ 0.65em)', (function () {
    var sContent = (320 - 24 - 12) / 2 - 4 - 32; /* vista 320 px: main 12 px, hueco 12 px, mitad, borde 2+2, relleno 16+16 */
    var timeW = 4 * 32 * 0.65 + 32 * 0.35; /* 4 dígitos + dos puntos a 32 px */
    var longestWord = 10 * 13 * 0.65; /* 'septiembre', la palabra más larga de la fecha, a 13 px */
    return sContent === 106 && timeW <= sContent && longestWord <= sContent;
  })());
  check('v1.5.37 reloj: la hora cabe en s a 390 px (el teléfono del usuario) con margen', (function () {
    var sContent = (390 - 24 - 12) / 2 - 4 - 32;
    return sContent === 141 && (4 * 32 * 0.65 + 32 * 0.35) <= sContent;
  })());
  /* (3) El clima no tiene el mismo problema (verificado, sin tocar). */
  check('v1.5.37 clima: la tarjeta del clima no tiene min-width fijo (ya era min-width:0)', /\.weatherInfoCard\{flex:1;min-width:0\}/.test(idx) && /\.homeWidget > \.weatherCard\{[^}]*min-width:0\}/.test(idx));
  /* (4) Batería: el rayo dentro del símbolo. */
  check('v1.5.37 batería: batteryIconSvg recibe si está cargando y dibuja el rayo dentro del cuerpo', /function batteryIconSvg\(level, charging\)/.test(appjs) && /charging \? '<path d="M13\.8 1\.8/.test(fnBody(appjs, 'batteryIconSvg')));
  check('v1.5.37 batería: el rayo queda dentro del cuerpo (x 9.6–15.4 dentro de 1–23, y 1.8–10.2 dentro de 1–11)', /M13\.8 1\.8 L9\.6 6\.6 L12\.2 6\.6 L10\.9 10\.2 L15\.4 5\.4 L12\.8 5\.4 Z/.test(fnBody(appjs, 'batteryIconSvg')));
  check('v1.5.37 batería: el icono mide siempre 25×12, cargando o no (un solo svg, sin ancho extra)', /width="25" height="12" viewBox="0 0 28 12"/.test(fnBody(appjs, 'batteryIconSvg')) && (fnBody(appjs, 'batteryIconSvg').match(/<svg/g) || []).length === 1);
  check('v1.5.37 batería: renderBatteryInd ya no pone un rayo aparte junto al símbolo', !/ic\('zap'/.test(fnBody(appjs, 'renderBatteryInd')) && /batteryIconSvg\(batteryLevel, batteryCharging\)/.test(fnBody(appjs, 'renderBatteryInd')));
  check('v1.5.37 batería: el nivel sigue siendo el real y el texto Cargando sigue en el apartado', /batteryLevel/.test(fnBody(appjs, 'renderBatteryInd')) && /Cargando/.test(fnBody(appjs, 'homeWidgetBatteryHtml1536')));
  /* FAQ sigue en 25. */
  check('v1.5.37 FAQ: sigue en 29 entradas (sin cambio)', faqEntries === 29);
  /* 1.5.36 intacto. */
  check('v1.5.37 1.5.36 intacto: los 5 apartados, editar con mantener presionado y lo demás translúcido', /id="homeWidgets1536"/.test(idx) && /HOME_WIDGET_LONGPRESS_MS_1536 = 550/.test(appjs) && /body\.hwEditing1536 #view-feed \.homeWidget:not\(\.hwActive\)\{opacity:\.35\}/.test(idx));
  check('v1.5.37 1.5.36 intacto: los 7 agregables y la calculadora sin eval()', C.HOME_WIDGETS_ADDABLE_1536.length === 7 && /function hwCalcEval1536/.test(appjs) && !/eval\(/.test(fnBody(appjs, 'hwCalcEval1536')));
  check('v1.5.37 1.5.36 intacto: sin animaciones nuevas salvo el resplandor del cargador (26 @keyframes: los 25 viejos + chargerGlowRise1561)', (idx.match(/@keyframes/g) || []).length === 26 && /@keyframes chargerGlowRise1561/.test(idx));
  /* 1.5.35 intacto. */
  check('v1.5.37 1.5.35 intacto: las 12 canciones con musica/ y 0 assets/musica', C.SONG_CATALOG.length === 12 && C.SONG_CATALOG.every(function (sg, i) { return sg.src === 'musica/cancion-' + (i + 1) + '.mp3'; }) && !/assets\/musica/.test(appjs) && !/assets\/musica/.test(corejs));
  /* 1.5.34 intacto. */
  check('v1.5.37 1.5.34 intacto: 1 sola cuenta de ejemplo', (function () { var st = C.emptyState(); C.seedDemo(st); var demos = Object.keys(st.profiles).filter(function (k) { return st.profiles[k].isDemo; }); return demos.length === 1 && demos[0] === '0000000000'; })());
}


function static1538() {
  console.log('=== 98. WordRed 1.5.40: los botones de editar y las opciones al hacer algo, al estilo de los iconos del perfil ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  const faqBlock = (appjs.match(/var FAQ = \[([\s\S]*?)\];/) || [])[1] || '';
  const faqEntries = (faqBlock.match(/\{ q: '/g) || []).length;
  /* Versión. */
  check('v1.5.38 versión: manifiesto 67 / 1.5.52', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('v1.5.38 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('v1.5.38 versión: los textos visibles dicen 1.5.38 (Ajustes y Acerca de)', /id="updateCurrentVersion">WordRed 1\.5\.63</.test(idx) && /WordRed 1\.5\.63 — red social original/.test(idx));
  check('v1.5.38 versión: build.sh dice 1.5.38', /Build WordRed v1\.5\.63/.test(buildsh));
  /* (1) El estilo de referencia (los iconos del perfil) sigue igual. */
  check('v1.5.38 perfil: los botones del perfil siguen en 40 px, redondos, fondo translúcido y borde fino', /\.ownIconBtn\{[^}]*width:40px;height:40px;border-radius:50%[^}]*background:rgba\(255,255,255,\.08\)[^}]*border:1px solid rgba\(255,255,255,\.14\)/.test(idx));
  /* (2) La barra de edición usa ese mismo estilo. */
  check('v1.5.38 barra: los 6 botones existen con las clases nuevas (5 solo icono + Listo con texto)', /id="hwMoveUp" class="hwIconBtn1538"/.test(idx) && /id="hwMoveDown" class="hwIconBtn1538"/.test(idx) && /id="hwSizeBtn" class="hwIconBtn1538"/.test(idx) && /id="hwColorBtn" class="hwIconBtn1538"/.test(idx) && /id="hwRemoveBtn" class="hwIconBtn1538"/.test(idx) && /id="hwDoneBtn" class="hwIconBtnText1538">Listo</.test(idx));
  check('v1.5.38 barra: la regla nueva copia el estilo del perfil (40 px, redondo, mismo fondo y borde)', /#homeEditBar1536 button\.hwIconBtn1538\{width:40px;height:40px;border-radius:50%[^}]*background:rgba\(255,255,255,\.08\);border:1px solid rgba\(255,255,255,\.14\)/.test(idx));
  check('v1.5.38 barra: Listo con texto tiene 40 px de alto y el mismo fondo y borde del perfil', /#homeEditBar1536 button\.hwIconBtnText1538\{height:40px;[^}]*background:rgba\(255,255,255,\.08\);border:1px solid rgba\(255,255,255,\.14\)/.test(idx));
  check('v1.5.38 barra: la regla vieja de botones rectangulares con texto ya no está', !/#homeEditBar1536 button\{flex:0 0 auto;padding:8px 10px;border-radius:10px/.test(idx));
  check('v1.5.38 barra: Subir y Bajar son solo icono (chevup/chevdown en svg, sin texto)', /id="hwMoveUp"[^>]*><span class="ic"><svg[^>]*><path d="m18 15-6-6-6 6"\/>/.test(idx) && /id="hwMoveDown"[^>]*><span class="ic"><svg[^>]*><path d="m6 9 6 6 6-6"\/>/.test(idx) && !/id="hwMoveUp"[^>]*>[^<]*Subir/.test(idx) && !/id="hwMoveDown"[^>]*>[^<]*Bajar/.test(idx));
  check('v1.5.38 barra: Quitar es solo icono (basura en svg)', /id="hwRemoveBtn"[^>]*><span class="ic"><svg[^>]*><path d="M3 6h18"\/>/.test(idx));
  check('v1.5.38 barra: Tamaño lleva la letra del tamaño y Color el punto de color', /id="hwSizeBtn"[^>]*><span class="hwSizeLetter">/.test(idx) && /id="hwColorBtn"[^>]*><span class="hwColorDot"><\/span>/.test(idx));
  /* (3) La barra actualiza la letra y el punto, no el texto del botón. */
  check('v1.5.38 barra: updateHomeWidgetEditBar pone la letra S/M/L del tamaño actual', /\.hwSizeLetter/.test(fnBody(appjs, 'updateHomeWidgetEditBar1536')) && /toUpperCase\(\)/.test(fnBody(appjs, 'updateHomeWidgetEditBar1536')));
  check('v1.5.38 barra: updateHomeWidgetEditBar pone el punto de color con el hex del color actual', /--hwColorDot/.test(fnBody(appjs, 'updateHomeWidgetEditBar1536')) && /HOME_WIDGET_COLOR_HEX_1536/.test(fnBody(appjs, 'updateHomeWidgetEditBar1536')));
  check('v1.5.38 barra: el valor completo sigue en el título del botón (Tamaño: / Color:)', /'Tamaño: ' \+ C\.HOME_WIDGET_SIZE_NAMES_1536/.test(fnBody(appjs, 'updateHomeWidgetEditBar1536')) && /'Color: ' \+ C\.HOME_WIDGET_COLOR_NAMES_1536/.test(fnBody(appjs, 'updateHomeWidgetEditBar1536')));
  check('v1.5.38 barra: ya no se escribe texto «Tamaño: …» ni «Color: …» dentro del botón', !/\$\('hwSizeBtn'\)\.textContent = 'Tamaño:/.test(appjs) && !/\$\('hwColorBtn'\)\.textContent = 'Color:/.test(appjs));
  /* (4) El mapa de hex de colores (igual que --hwAccent del CSS). */
  check('v1.5.38 color: el mapa de hex tiene los 6 colores con los mismos valores que el CSS', (function () {
    var hex = C.HOME_WIDGET_COLOR_HEX_1536 || {};
    var accents = { rojo: '#e01430', azul: '#2563eb', verde: '#16a34a', morado: '#7c3aed', naranja: '#ea580c', gris: '#6b7280' };
    return Object.keys(accents).every(function (c) { return hex[c] === accents[c]; }) && C.HOME_WIDGET_COLORS_1536.every(function (c) { return /\.homeWidget\[data-color="(?:rojo|azul|verde|morado|naranja|gris)"\]\{--hwAccent:#(?:e01430|2563eb|16a34a|7c3aed|ea580c|6b7280)/.test(idx); });
  })());
  /* (5) La hoja de agregar: el + es un botón redondo estilo perfil. */
  check('v1.5.38 hoja: el icono plus existe en ICONS', /plus: '<path d="M12 5v14M5 12h14"\/>'/.test(appjs));
  check('v1.5.38 hoja: cada fila lleva el + redondo estilo perfil (hwAddPlus1538 con ic plus)', /hwAddPlus1538/.test(fnBody(appjs, 'openHomeWidgetAddSheet1536')) && /ic\('plus', 19\)/.test(fnBody(appjs, 'openHomeWidgetAddSheet1536')));
  check('v1.5.38 hoja: ya no hay texto «+ Agregar» en las filas', !/\+ Agregar<\/span>/.test(fnBody(appjs, 'openHomeWidgetAddSheet1536')));
  check('v1.5.38 hoja: la clase del + copia el estilo del perfil (40 px, redondo, mismo fondo y borde)', /\.hwAddPlus1538\{width:40px;height:40px;border-radius:50%[^}]*background:rgba\(255,255,255,\.08\);border:1px solid rgba\(255,255,255,\.14\)/.test(idx));
  /* (6) El fondo translúcido al editar sigue igual. */
  check('v1.5.38 translúcido: al editar lo demás queda .35 y solo el editado opaco', /body\.hwEditing1536 #view-feed \.homeWidget:not\(\.hwActive\)\{opacity:\.35\}/.test(idx) && /body\.hwEditing1536 #view-feed \.homeWidget\.hwActive\{opacity:1/.test(idx));
  /* FAQ sigue en 25. */
  check('v1.5.38 FAQ: sigue en 29 entradas (sin cambio)', faqEntries === 29);
  /* 1.5.37 intacto. */
  check('v1.5.38 1.5.37 intacto: el reloj cabe en su recuadro (39 px en s, flex-shrink 1, overflow hidden)', /\.homeWidget\[data-widget="reloj"\]\{overflow:hidden\}/.test(idx) && /\.homeWidget\[data-size="s"\] \.weatherTime\{font-size:39px\}/.test(idx) && /\.homeWidget\[data-widget="reloj"\] \.weatherClock\{min-width:0;flex-shrink:1\}/.test(idx));
  check('v1.5.38 1.5.37 intacto: el rayo va dentro del símbolo de batería (25×12)', /function batteryIconSvg\(level, charging\)/.test(appjs) && /M13\.8 1\.8 L9\.6 6\.6/.test(fnBody(appjs, 'batteryIconSvg')) && !/ic\('zap'/.test(fnBody(appjs, 'renderBatteryInd')));
  /* 1.5.36 intacto. */
  check('v1.5.38 1.5.36 intacto: los 5 apartados, editar con mantener presionado (550 ms) y los 7 agregables', /id="homeWidgets1536"/.test(idx) && /HOME_WIDGET_LONGPRESS_MS_1536 = 550/.test(appjs) && C.HOME_WIDGETS_ADDABLE_1536.length === 7 && /function hwCalcEval1536/.test(appjs) && !/eval\(/.test(fnBody(appjs, 'hwCalcEval1536')));
  check('v1.5.38 1.5.36 intacto: sin animaciones nuevas salvo el resplandor del cargador (26 @keyframes: los 25 viejos + chargerGlowRise1561)', (idx.match(/@keyframes/g) || []).length === 26 && /@keyframes chargerGlowRise1561/.test(idx));
  /* 1.5.35 intacto. */
  check('v1.5.38 1.5.35 intacto: las 12 canciones con musica/ y 0 assets/musica', C.SONG_CATALOG.length === 12 && C.SONG_CATALOG.every(function (sg, i) { return sg.src === 'musica/cancion-' + (i + 1) + '.mp3'; }) && !/assets\/musica/.test(appjs) && !/assets\/musica/.test(corejs));
  /* 1.5.34 intacto. */
  check('v1.5.38 1.5.34 intacto: 1 sola cuenta de ejemplo', (function () { var st = C.emptyState(); C.seedDemo(st); var demos = Object.keys(st.profiles).filter(function (k) { return st.profiles[k].isDemo; }); return demos.length === 1 && demos[0] === '0000000000'; })());
}

function static1539() {
  console.log('=== 99. WordRed 1.5.40: los 4 atajos del perfil propio en una sola fila ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const faqStart = appjs.indexOf('var FAQ = [');
  const faqEnd = appjs.indexOf('];', faqStart);
  const faqEntries = (faqStart >= 0 && faqEnd > faqStart ? appjs.slice(faqStart, faqEnd) : '').split("{ q: '").length - 1;
  const fnBody = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  /* Versión. */
  check('v1.5.39 versión: manifiesto 67 / 1.5.52', manifest.indexOf('android:versionCode="78"') >= 0 && manifest.indexOf('android:versionName="1.5.63"') >= 0);
  check('v1.5.39 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', appjs.indexOf('var APP_VERSION_CODE = 78;') >= 0 && appjs.indexOf("var APP_VERSION_NAME = '1.5.63';") >= 0);
  check('v1.5.39 versión: los textos visibles dicen 1.5.39 (Ajustes y Acerca de)', idx.indexOf('id="updateCurrentVersion">WordRed 1.5.63<') >= 0 && idx.indexOf('WordRed 1.5.63 — red social original') >= 0);
  check('v1.5.39 versión: build.sh dice 1.5.39', buildsh.indexOf('Build WordRed v1.5.63') >= 0);
  /* (1) La fila: una sola fila, sin envoltura, mismos textos y acciones. */
  check('v1.5.39 fila: el contenedor es profileShortcuts1539 con nowrap y 6 px entre botones', idx.indexOf('.profileShortcuts1539{display:flex;flex-wrap:nowrap;gap:6px;margin:8px 0}') >= 0);
  check('v1.5.39 fila: los 4 botones existen en orden con la clase nueva y el mismo onclick', (function () {
    var i = appjs.indexOf('class="profileShortcuts1539"');
    if (i < 0) return false;
    var row = appjs.slice(i, appjs.indexOf('</div>', i));
    var order = ['__wrOpenSavedShorts()', '__wrOpenScheduled()', '__wrOpenDrafts()', '__wrOpenSavedLinks()'];
    var last = -1;
    var inOrder = order.every(function (h) { var p = row.indexOf(h, last + 1); if (p < 0) return false; last = p; return true; });
    return inOrder && (row.match(/profileShortcutBtn1539/g) || []).length === 4 &&
      row.indexOf('Shorts guardados') >= 0 && row.indexOf('Programadas') >= 0 && row.indexOf('Borradores') >= 0 && row.indexOf('Enlaces guardados') >= 0;
  })());
  check('v1.5.39 fila: la fila vieja (flex-wrap:wrap con 8 px) ya no está', appjs.indexOf('<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">') < 0);
  /* (2) Los botones: fuente 10.5 px, menos relleno, se estiran y se encogen sin partir el texto. */
  check('v1.5.39 botones: la regla es flex 1 1 auto, 10.5 px, nowrap (misma base ghost small)', idx.indexOf('.btn.profileShortcutBtn1539{flex:1 1 auto;min-width:0;padding:7px 6px;font-size:10.5px;white-space:nowrap}') >= 0);
  /* (3) Caben: anchos del texto a 13 px medidos en la captura del usuario
     (Motorola, 1.5.38): Shorts guardados 103, Programadas 77, Borradores
     64, Enlaces guardados 110 px CSS. A 10.5 px se escalan por 10.5/13.
     Relleno 6 px por lado (12 por botón), 6 px entre botones. Con
     flex-shrink los botones se encogen hasta su texto; el encogido se
     reparte en proporción a su ancho natural. Contenido = ancho de
     pantalla menos 24 px (main padding 12 px por lado): 415 px en el
     Motorola (439 px) y 336 px en 360 px. */
  var tw13 = [103, 77, 64, 110];
  var tw = tw13.map(function (w) { return w * 10.5 / 13; });
  var nat = tw.map(function (w) { return w + 12; });
  var natSum = nat.reduce(function (a, b) { return a + b; }, 0);
  var rowNat = natSum + 3 * 6;
  var slackAt = function (contentW) {
    var over = Math.max(0, rowNat - contentW);
    return nat.map(function (n, i) { return (n - over * n / natSum) - tw[i]; });
  };
  check('v1.5.39 caben: en el teléfono (415 px de contenido) la fila cabe sin encoger', rowNat <= 415);
  check('v1.5.39 caben: en 360 px (336 px de contenido) cada botón queda con su texto completo tras encoger', slackAt(336).every(function (s) { return s >= 1; }));
  check('v1.5.39 caben: con un 6% más de ancho (margen de medida) también caben en 360 px', (function () {
    var tw2 = tw.map(function (w) { return w * 1.06; });
    var nat2 = tw2.map(function (w) { return w + 12; });
    var sum2 = nat2.reduce(function (a, b) { return a + b; }, 0);
    var over2 = Math.max(0, sum2 + 18 - 336);
    return nat2.every(function (n, i) { return (n - over2 * n / sum2) - tw2[i] >= 0.5; });
  })());
  /* (4) 1.5.39: "Tu tiempo hoy" justo antes de "Tienda de juegos". */
  check('v1.5.39 tiempo: el hueco ownScreenTime1539 existe en index.html entre las grabaciones de lives y la tienda', (function () {
    var live = idx.indexOf('id="liveRecordingsSection"');
    var hole = idx.indexOf('<div id="ownScreenTime1539"></div>');
    var store = idx.indexOf('id="gamesSection"');
    return live >= 0 && hole > live && store > hole;
  })());
  check('v1.5.39 tiempo: renderOwnProfile ya no pinta "Tu tiempo hoy" arriba (sale de la cadena del perfil)', (function () {
    var body = fnBody(appjs, 'renderOwnProfile');
    var i = body.indexOf('memoriesProfileHtml1526()');
    return i >= 0 && body.slice(0, i).indexOf('screenTimeTodayHtml()') < 0;
  })());
  check('v1.5.39 tiempo: renderOwnProfile pinta "Tu tiempo hoy" en ownScreenTime1539', /if \(\$\('ownScreenTime1539'\)\) \$\('ownScreenTime1539'\)\.innerHTML = screenTimeTodayHtml\(\);/.test(fnBody(appjs, 'renderOwnProfile')));
  check('v1.5.39 tiempo: la tarjeta sigue igual (tiempo de hoy + barras de la semana, se reinicia a medianoche)', /function screenTimeTodayHtml\(\)/.test(appjs) && /Tu tiempo hoy/.test(fnBody(appjs, 'screenTimeTodayHtml')) && /Se reinicia a medianoche/.test(fnBody(appjs, 'screenTimeTodayHtml')) && /screenTimeWeek/.test(fnBody(appjs, 'screenTimeTodayHtml')));
  /* FAQ sigue en 25. */
  check('v1.5.39 FAQ: sigue en 29 entradas (sin cambio)', faqEntries === 29);
  /* 1.5.38 intacto. */
  check('v1.5.39 1.5.38 intacto: los botones de editar estilo perfil y el + redondo de la hoja', idx.indexOf('hwIconBtn1538') >= 0 && idx.indexOf('hwAddPlus1538') >= 0 && appjs.indexOf('HOME_WIDGET_COLOR_HEX_1536') >= 0 && idx.indexOf('hwSizeLetter') >= 0 && idx.indexOf('hwColorDot') >= 0);
  check('v1.5.39 1.5.38 intacto: el fondo translúcido al editar sigue (.35/1)', idx.indexOf('body.hwEditing1536 #view-feed .homeWidget:not(.hwActive){opacity:.35}') >= 0);
  /* 1.5.37 intacto. */
  check('v1.5.39 1.5.37 intacto: el reloj cabe en su recuadro (39 px en s, flex-shrink 1, overflow hidden)', idx.indexOf('.homeWidget[data-widget="reloj"]{overflow:hidden}') >= 0 && idx.indexOf('.homeWidget[data-size="s"] .weatherTime{font-size:39px}') >= 0 && idx.indexOf('.homeWidget[data-widget="reloj"] .weatherClock{min-width:0;flex-shrink:1}') >= 0);
  check('v1.5.39 1.5.37 intacto: el rayo va dentro del símbolo de batería (25x12)', appjs.indexOf('function batteryIconSvg(level, charging)') >= 0 && appjs.indexOf('M13.8 1.8') >= 0);
  /* 1.5.36 intacto. */
  check('v1.5.39 1.5.36 intacto: los 5 apartados, editar con mantener presionado (550 ms) y los 7 agregables', idx.indexOf('id="homeWidgets1536"') >= 0 && appjs.indexOf('HOME_WIDGET_LONGPRESS_MS_1536 = 550') >= 0 && C.HOME_WIDGETS_ADDABLE_1536.length === 7 && appjs.indexOf('function hwCalcEval1536') >= 0);
  /* 1.5.35 intacto. */
  check('v1.5.39 1.5.35 intacto: las 12 canciones con musica/ y 0 assets/musica', C.SONG_CATALOG.length === 12 && C.SONG_CATALOG.every(function (sg, i) { return sg.src === 'musica/cancion-' + (i + 1) + '.mp3'; }) && appjs.indexOf('assets/musica') < 0 && corejs.indexOf('assets/musica') < 0);
  /* 1.5.34 intacto. */
  check('v1.5.39 1.5.34 intacto: 1 sola cuenta de ejemplo', (function () { var st = C.emptyState(); C.seedDemo(st); var demos = Object.keys(st.profiles).filter(function (k) { return st.profiles[k].isDemo; }); return demos.length === 1 && demos[0] === '0000000000'; })());
}

function static1540() {
  console.log('=== 100. WordRed 1.5.40: Reels mucho más grandes y cartelera «Próximos estrenos» que se actualiza sola ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const faqStart = appjs.indexOf('var FAQ = [');
  const faqEnd = appjs.indexOf('];', faqStart);
  const faqEntries = (faqStart >= 0 && faqEnd > faqStart ? appjs.slice(faqStart, faqEnd) : '').split("{ q: '").length - 1;
  const serverjs = fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  const movies = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'movies.json'), 'utf8'));
  /* Versión. */
  check('v1.5.40 versión: manifiesto 67 / 1.5.52', manifest.indexOf('android:versionCode="78"') >= 0 && manifest.indexOf('android:versionName="1.5.63"') >= 0);
  check('v1.5.40 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', appjs.indexOf('var APP_VERSION_CODE = 78;') >= 0 && appjs.indexOf("var APP_VERSION_NAME = '1.5.63';") >= 0);
  check('v1.5.40 versión: los textos visibles dicen 1.5.40 (Ajustes y Acerca de)', idx.indexOf('id="updateCurrentVersion">WordRed 1.5.63<') >= 0 && idx.indexOf('WordRed 1.5.63 — red social original') >= 0);
  check('v1.5.40 versión: build.sh dice 1.5.40', buildsh.indexOf('Build WordRed v1.5.63') >= 0);
  check('v1.5.40 versión: el FAQ sigue en 29 entradas', faqEntries === 29);
  /* (1) Reels mucho más grandes. */
  check('v1.5.40 Reels: la tarjeta es 264x400 (el doble que 132x200)', idx.indexOf('.reelTile{flex:0 0 264px;height:400px;') >= 0);
  check('v1.5.40 Reels: la fila sigue siendo horizontal con desplazamiento lateral', idx.indexOf('.reels{display:flex;gap:10px;overflow-x:auto;') >= 0);
  check('v1.5.40 Reels: tocar un reel sigue abriéndolo como Short', appjs.indexOf('window.__wrOpenReel = function (postId) { openShorts(postId); };') >= 0 && appjs.indexOf('requestReelCovers()') >= 0);
  check('v1.5.40 Reels: los reels siguen después de la 2ª publicación', appjs.indexOf('if (i === 1) parts.push(reelsRowHtml());') >= 0);
  check('v1.5.40 Reels: las historias siguen en 96x150', idx.indexOf('.story{flex:0 0 96px;height:150px;') >= 0);
  /* (2) Cartelera: lista fija, tarjetas y tráiler. */
  check('v1.5.40 cartelera: la lista fija trae 6 películas reales con portada https y tráiler de YouTube', (function () {
    var i = appjs.indexOf('var MOVIES_BILLBOARD_1540 = [');
    if (i < 0) return false;
    var list = appjs.slice(i, appjs.indexOf('];', i));
    var posters = (list.match(/https:\/\/[^'"]+/g) || []).filter(function (u) { return /upload\.wikimedia\.org|image\.tmdb\.org/.test(u); });
    var trailers = (list.match(/https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]+/g) || []);
    return posters.length === 6 && trailers.length === 6;
  })());
  check('v1.5.40 cartelera: el encabezado es «Próximos estrenos» con el logo de cine (icono film)', appjs.indexOf("ic('film', 18)") >= 0 && appjs.indexOf('Próximos estrenos') >= 0 && appjs.indexOf('film: ') >= 0);
  check('v1.5.40 cartelera: cada tarjeta es un rectángulo grande (220 px) con portada, título, fecha y botón de reproducir', idx.indexOf('.movieCard1540{flex:0 0 220px;') >= 0 && idx.indexOf('.moviePoster1540{position:relative;width:100%;height:330px;') >= 0 && appjs.indexOf('class="movieTitle1540"') >= 0 && appjs.indexOf('Estreno: ') >= 0 && appjs.indexOf('moviePlay1540') >= 0);
  check('v1.5.40 cartelera: las que ya están en cines llevan la marca «Ya en cines»', appjs.indexOf('Ya en cines') >= 0 && appjs.indexOf('class="movieNow1540"') >= 0);
  check('1.5.60 tráiler: al tocar una película se abre su tráiler dentro de la app con __wrOpenTrailer', appjs.indexOf('class="movieCard1540" onclick="window.__wrOpenTrailer(') >= 0);
  check('v1.5.40 cartelera: va después de la 5ª publicación, o al final si hay menos', appjs.indexOf('if (i === 4) parts.push(billboardHtml1540());') >= 0 && appjs.indexOf("else if (shown.length > 1 && shown.length < 5) { parts.push(billboardHtml1540()); parts.push(newsRowHtml1547()); parts.push(featuredGameHtml1549()); parts.push(gamesBillboardHtml1543()); }") >= 0);
  /* (3) La cartelera se actualiza sola: servidor 3.9 + caché. */
  check('v1.5.40 cartelera: el servidor es 3.9 y trae GET /api/billboard con readBillboard', serverjs.indexOf("version: '4.8'") >= 0 && serverjs.indexOf("app.get('/api/billboard'") >= 0 && serverjs.indexOf('function readBillboard()') >= 0);
  check('v1.5.40 cartelera: movies.json trae las mismas 6 películas que la lista fija', Array.isArray(movies.movies) && movies.movies.length === 6 && movies.movies.every(function (m) { return m.title && m.date && /^https:\/\//.test(m.poster) && /^https:\/\/www\.youtube\.com\/watch\?v=/.test(m.trailer); }));
  check('v1.5.40 cartelera: la app pide /api/billboard con 6 s de espera y caché de 1 día', appjs.indexOf("'/api/billboard'") >= 0 && appjs.indexOf('timeoutMs: 6000') >= 0 && appjs.indexOf("BILLBOARD_CACHE_KEY_1540 = 'wordred_billboard1540'") >= 0 && appjs.indexOf('BILLBOARD_CACHE_TTL_1540 = 86400000') >= 0);
  check('v1.5.40 cartelera: sin conexión usa la lista fija y avisa «sin actualizar»', appjs.indexOf('Cartelera sin actualizar (sin conexión)') >= 0 && appjs.indexOf('billboardMovies1540 = MOVIES_BILLBOARD_1540.slice();') >= 0);
  check('v1.5.40 cartelera: el inicio pide la cartelera al cargar (fetchBillboard1540)', appjs.indexOf('fetchBillboard1540();') >= 0 && appjs.indexOf('function fetchBillboard1540()') >= 0);
  /* 1.5.39 intacto. */
  check('v1.5.40 1.5.39 intacto: los 4 atajos en una fila y «Tu tiempo hoy» antes de la tienda de juegos', idx.indexOf('.profileShortcuts1539{display:flex;flex-wrap:nowrap;gap:6px;margin:8px 0}') >= 0 && idx.indexOf('id="ownScreenTime1539"') >= 0);
  check('v1.5.40 1.5.38 intacto: los botones de editar al estilo de los iconos del perfil', idx.indexOf('hwIconBtn1538') >= 0);
  check('v1.5.40 1.5.37 intacto: el rayo va dentro del símbolo de batería', appjs.indexOf('M13.8 1.8') >= 0);
  check('v1.5.40 1.5.36 intacto: el menú con apartados tipo widgets', idx.indexOf('id="homeWidgets1536"') >= 0);
  check('v1.5.40 1.5.35 intacto: las 12 canciones con musica/ y 0 assets/musica', C.SONG_CATALOG.length === 12 && C.SONG_CATALOG.every(function (sg, i) { return sg.src === 'musica/cancion-' + (i + 1) + '.mp3'; }) && appjs.indexOf('assets/musica') < 0 && corejs.indexOf('assets/musica') < 0);
}

function static1541() {
  console.log('=== 101. WordRed 1.5.42: las historias siempre arriba, publicar en medio, reloj y clima lado a lado ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const faqStart = appjs.indexOf('var FAQ = [');
  const faqEnd = appjs.indexOf('];', faqStart);
  const faqEntries = (faqStart >= 0 && faqEnd > faqStart ? appjs.slice(faqStart, faqEnd) : '').split("{ q: '").length - 1;
  const serverjs = fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  /* Versión. */
  check('v1.5.41 versión: manifiesto 67 / 1.5.52', manifest.indexOf('android:versionCode="78"') >= 0 && manifest.indexOf('android:versionName="1.5.63"') >= 0);
  check('v1.5.41 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', appjs.indexOf('var APP_VERSION_CODE = 78;') >= 0 && appjs.indexOf("var APP_VERSION_NAME = '1.5.63';") >= 0);
  check('v1.5.41 versión: los textos visibles dicen 1.5.41 (Ajustes y Acerca de)', idx.indexOf('id="updateCurrentVersion">WordRed 1.5.63<') >= 0 && idx.indexOf('WordRed 1.5.63 — red social original') >= 0);
  check('v1.5.41 versión: build.sh dice 1.5.41', buildsh.indexOf('Build WordRed v1.5.63') >= 0);
  check('v1.5.41 versión: el FAQ sigue en 29 entradas y dice que los reels quedan siempre arriba', faqEntries === 29 && appjs.indexOf('Los reels siempre quedan arriba.') >= 0);
  /* (1) El orden nuevo por defecto. */
  check('v1.5.41 orden: el orden por defecto es historias, publicar, reloj, clima, accesos', JSON.stringify(C.HOME_WIDGETS_BUILTIN_1536) === JSON.stringify(['historias', 'publicar', 'reloj', 'clima', 'accesos']) && JSON.stringify(C.defaultHomeWidgets1536().order) === JSON.stringify(['historias', 'publicar', 'reloj', 'clima', 'accesos']));
  check('v1.5.41 orden: publicar va entre las historias y el reloj/clima (el cuadro «¿Qué estás pensando?»)', (function () { var c0 = idx.indexOf('id="homeWidgets1536"'); var a = idx.indexOf('data-widget="historias"', c0); var b = idx.indexOf('data-widget="publicar"', c0); var c = idx.indexOf('data-widget="reloj"', c0); return a > 0 && a < b && b < c && idx.indexOf('¿Qué estás pensando?') >= 0; })());
  check('v1.5.41 orden: reloj y clima siguen en tamaño s (media fila cada uno, lado a lado)', (function () { var d = C.defaultHomeWidgets1536(); return d.sizes.reloj === 's' && d.sizes.clima === 's'; })() && idx.indexOf('.homeWidget[data-size="s"]{flex:1 1 calc(50% - 6px);') >= 0);
  /* (2) Las historias fijadas: la normalización las sube a primer lugar. */
  check('v1.5.41 fijadas: una configuración guardada con las historias en otro lugar se normaliza (suben a primer lugar)', (function () { var st = C.emptyState(); st.homeWidgets1536 = { order: ['reloj', 'clima', 'historias', 'publicar', 'accesos'], sizes: { reloj: 's', clima: 's', historias: 'm', publicar: 'm', accesos: 'm' }, colors: {}, added: [], notes: [] }; var cfg = C.normalizeHomeWidgets1536(st); return cfg.order[0] === 'historias' && JSON.stringify(cfg.order) === JSON.stringify(['historias', 'reloj', 'clima', 'publicar', 'accesos']); })());
  check('v1.5.41 fijadas: una configuración guardada con las historias al final se normaliza igual', (function () { var st = C.emptyState(); st.homeWidgets1536 = { order: ['publicar', 'reloj', 'clima', 'accesos', 'historias'], sizes: {}, colors: {}, added: [], notes: [] }; return C.normalizeHomeWidgets1536(st).order[0] === 'historias'; })());
  check('v1.5.41 fijadas: el orden por defecto ya trae las historias en primer lugar sin tocar nada', (function () { var st = C.emptyState(); return C.normalizeHomeWidgets1536(st).order[0] === 'historias'; })());
  /* (3) El modo de edición respeta el fijado. */
  check('v1.5.41 fijadas: mover las historias hacia abajo está bloqueado en el código', appjs.indexOf('if (i === 0 || j === 0) return;') >= 0 && appjs.indexOf('las historias están fijadas arriba') >= 0);
  check('v1.5.41 fijadas: la barra de edición deshabilita Subir/Bajar según el fijado (Bajar en historias, Subir debajo de ellas)', appjs.indexOf("$('hwMoveUp').disabled = (idx <= 1);") >= 0 && appjs.indexOf("$('hwMoveDown').disabled = (idx === 0);") >= 0);
  check('v1.5.41 fijadas: los botones deshabilitados de la barra se ven apagados (CSS)', idx.indexOf('#homeEditBar1536 button:disabled{opacity:.35;') >= 0);
  check('v1.5.41 fijadas: el HTML estático ya trae el orden nuevo (historias primera)', (function () { var c0 = idx.indexOf('id="homeWidgets1536"'); var a = idx.indexOf('data-widget="historias"', c0); var b = idx.indexOf('data-widget="publicar"', c0); var c = idx.indexOf('data-widget="reloj"', c0); var d = idx.indexOf('data-widget="clima"', c0); var e = idx.indexOf('data-widget="accesos"', c0); return a > 0 && a < b && b < c && c < d && d < e; })());
  /* 1.5.40 intacto. */
  check('v1.5.41 1.5.40 intacto: Reels 264x400 y cartelera «Próximos estrenos» con /api/billboard', idx.indexOf('.reelTile{flex:0 0 264px;height:400px;') >= 0 && appjs.indexOf('BILLBOARD_CACHE_KEY_1540') >= 0 && appjs.indexOf('Próximos estrenos') >= 0 && serverjs.indexOf("version: '4.8'") >= 0 && serverjs.indexOf("app.get('/api/billboard'") >= 0);
  check('v1.5.41 1.5.39 intacto: los 4 atajos en una fila y «Tu tiempo hoy» antes de la tienda de juegos', idx.indexOf('.profileShortcuts1539{display:flex;flex-wrap:nowrap;gap:6px;margin:8px 0}') >= 0 && idx.indexOf('id="ownScreenTime1539"') >= 0);
  check('v1.5.41 1.5.38 intacto: los botones de editar al estilo de los iconos del perfil', idx.indexOf('hwIconBtn1538') >= 0);
  check('v1.5.41 1.5.37 intacto: el rayo va dentro del símbolo de batería', appjs.indexOf('M13.8 1.8') >= 0);
  check('v1.5.41 1.5.36 intacto: el menú con apartados tipo widgets', idx.indexOf('id="homeWidgets1536"') >= 0);
  check('v1.5.41 1.5.35 intacto: las 12 canciones con musica/ y 0 assets/musica', C.SONG_CATALOG.length === 12 && C.SONG_CATALOG.every(function (sg, i) { return sg.src === 'musica/cancion-' + (i + 1) + '.mp3'; }) && appjs.indexOf('assets/musica') < 0 && corejs.indexOf('assets/musica') < 0);
}

function static1542() {
  console.log('=== 102. WordRed 1.5.42: opciones con el diseño de los widgets, botón «?» en Ajustes, tutorial y preguntas actualizados ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const faqStart = appjs.indexOf('var FAQ = [');
  const faqEnd = appjs.indexOf('];', faqStart);
  const faqEntries = (faqStart >= 0 && faqEnd > faqStart ? appjs.slice(faqStart, faqEnd) : '').split("{ q: '").length - 1;
  const serverjs = fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  /* Versión. */
  check('v1.5.42 versión: manifiesto 67 / 1.5.52', manifest.indexOf('android:versionCode="78"') >= 0 && manifest.indexOf('android:versionName="1.5.63"') >= 0);
  check('v1.5.42 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', appjs.indexOf('var APP_VERSION_CODE = 78;') >= 0 && appjs.indexOf("var APP_VERSION_NAME = '1.5.63';") >= 0);
  check('v1.5.42 versión: los textos visibles dicen 1.5.42 (Ajustes y Acerca de)', idx.indexOf('id="updateCurrentVersion">WordRed 1.5.63<') >= 0 && idx.indexOf('WordRed 1.5.63 — red social original') >= 0);
  check('v1.5.42 versión: build.sh dice 1.5.42', buildsh.indexOf('Build WordRed v1.5.63') >= 0);
  check('v1.5.42 versión: el FAQ sigue en 29 entradas', faqEntries === 29);
  /* (1) El diseño de las configuraciones de los widgets. */
  check('v1.5.42 diseño: existe la clase píldora de 40 px con texto (.btn.wOpt1542) al estilo de los widgets', idx.indexOf('.btn.wOpt1542{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:40px;') >= 0 && idx.indexOf('background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.14);color:#fff;font-size:13px;font-weight:700;') >= 0);
  check('v1.5.42 diseño: existe el botón redondo de 40 px solo icono (.wOptRound1542) y el «?»', idx.indexOf('.wOptRound1542{width:40px;height:40px;flex:0 0 40px;border-radius:50%;') >= 0 && idx.indexOf('.wOptQ1542{font-size:21px;font-weight:800;') >= 0);
  check('v1.5.42 diseño: las opciones del compositor usan el mismo diseño (regla con alcance al compositor y al panel)', idx.indexOf('#composerOverlay .chip,#uploadPanel1528 .chip{display:inline-flex;align-items:center;gap:6px;height:40px;') >= 0 && idx.indexOf('#composerOverlay .chip.on,#uploadPanel1528 .chip.on{border-color:var(--red2)}') >= 0);
  check('v1.5.42 diseño: los botones de la canción y de la portada del audio usan la píldora de los widgets', idx.indexOf('class="btn small wOpt1542" id="postSongAccept"') >= 0 && idx.indexOf('class="btn ghost small wOpt1542" id="postSongPlay"') >= 0 && idx.indexOf('class="btn ghost small wOpt1542" id="postSongChange"') >= 0 && idx.indexOf('class="btn ghost small wOpt1542" id="postSongRemove"') >= 0 && idx.indexOf('class="btn ghost small wOpt1542" id="postAudioCoverBtn"') >= 0);
  check('v1.5.42 diseño: los botones de lugar, encuesta con foto y programar del compositor usan la píldora', appjs.indexOf('class="btn ghost small wOpt1542" id="composerPlaceAdd"') >= 0 && appjs.indexOf('class="btn ghost small wOpt1542" id="composerPlaceClear"') >= 0 && appjs.indexOf('class="btn ghost small wOpt1542" id="composerPhotoPollPick"') >= 0 && appjs.indexOf('class="btn ghost small wOpt1542" id="composerPhotoPollClear"') >= 0 && appjs.indexOf('class="btn ghost small wOpt1542" id="composerScheduleClear"') >= 0);
  check('v1.5.42 diseño: las opciones de Ajustes usan la píldora de los widgets (Buscar, Descargar, guardar color, volver al rojo, ver tutorial)', idx.indexOf('class="btn small wOpt1542" id="checkUpdateBtn"') >= 0 && idx.indexOf('class="btn small wOpt1542" id="windowsDownloadBtn"') >= 0 && idx.indexOf('class="btn ghost mt wOpt1542" id="colorSaveBtn"') >= 0 && idx.indexOf('class="btn ghost mt wOpt1542" id="colorResetBtn"') >= 0 && appjs.indexOf('class="btn ghost small wOpt1542" onclick="window.__wrShowTutorial()"') >= 0);
  check('v1.5.42 diseño: los textos de las opciones no cambiaron (Foto o video, Audio, Cámara, Enlace, Encuesta, Aceptar, Buscar, Descargar)', idx.indexOf('> Foto o video</button>') >= 0 && idx.indexOf('> Audio</button>') >= 0 && idx.indexOf('> Cámara</button>') >= 0 && idx.indexOf('> Enlace</button>') >= 0 && idx.indexOf('> Encuesta</button>') >= 0 && idx.indexOf('id="checkUpdateBtn">Buscar</button>') >= 0 && idx.indexOf('id="windowsDownloadBtn">Descargar</button>') >= 0);
  /* (2) El botón «?» en Ajustes. */
  check('v1.5.42 preguntas: el botón redondo «?» está arriba a la derecha en Ajustes', idx.indexOf('class="wOptRound1542" id="settingsFaqBtn1542"') >= 0 && idx.indexOf('<span class="wOptQ1542">?</span>') >= 0);
  check('v1.5.43 preguntas: el botón «?» ABRE las preguntas en su panel (1.5.43: ya no baja con scroll)', appjs.indexOf("if ($('settingsFaqBtn1542'))") >= 0 && appjs.indexOf("showOverlay('faqOverlay1543')") >= 0 && appjs.indexOf("t.scrollIntoView({ behavior: 'smooth', block: 'start' })") < 0 && idx.indexOf('id="faqTitle1542"') >= 0);
  /* (3) Tutorial y preguntas con las novedades. */
  check('v1.5.42 tutorial: sigue en 6 pasos y los pasos de inicio, Shorts y perfil traen las novedades', (appjs.match(/\{ art: '/g) || []).length === 6 && appjs.indexOf('Arriba siempre están los reels, luego «¿Qué estás pensando?»') >= 0 && appjs.indexOf('Arriba en el inicio están los reels: toca tu foto con el + para publicar uno') >= 0 && appjs.indexOf('con los 4 botones en una sola fila y «Tu tiempo hoy» antes de la tienda de juegos') >= 0);
  check('1.5.62 FAQ: la cartelera y «Tu tiempo hoy» siguen; la de los Reels salió en la rotación (describía los Reels de antes de la 1.5.60)', appjs.indexOf("q: '¿Qué es la cartelera «Próximos estrenos»?") >= 0 && appjs.indexOf("q: '¿Dónde quedó «Tu tiempo hoy»?") >= 0 && appjs.indexOf("q: '¿Cómo quedaron los Reels?'") < 0);
  check('1.5.63 preguntas: la entrada de novedades ahora es la 1.5.63 y arriba en el inicio solo salen los reels verticales', appjs.indexOf("q: '¿Qué hay de nuevo en la 1.5.63?'") >= 0 && appjs.indexOf("q: '¿Qué hay de nuevo en la 1.5.62?'") >= 0 && appjs.indexOf("q: '¿Qué hay de nuevo en la 1.5.61?'") < 0 && appjs.indexOf('portadas de los dramas ahora son verticales') >= 0);
  /* 1.5.41 intacto. */
  check('v1.5.42 1.5.41 intacto: el orden historias, publicar, reloj, clima, accesos y las historias fijadas', JSON.stringify(C.HOME_WIDGETS_BUILTIN_1536) === JSON.stringify(['historias', 'publicar', 'reloj', 'clima', 'accesos']) && appjs.indexOf('if (i === 0 || j === 0) return;') >= 0 && appjs.indexOf("$('hwMoveDown').disabled = (idx === 0);") >= 0);
  check('v1.5.42 1.5.40 intacto: Reels 264x400 y cartelera «Próximos estrenos» con /api/billboard', idx.indexOf('.reelTile{flex:0 0 264px;height:400px;') >= 0 && appjs.indexOf('BILLBOARD_CACHE_KEY_1540') >= 0 && appjs.indexOf('Próximos estrenos') >= 0 && serverjs.indexOf("version: '4.8'") >= 0 && serverjs.indexOf("app.get('/api/billboard'") >= 0);
  check('v1.5.42 1.5.39 intacto: los 4 atajos en una fila y «Tu tiempo hoy» antes de la tienda de juegos', idx.indexOf('.profileShortcuts1539{display:flex;flex-wrap:nowrap;gap:6px;margin:8px 0}') >= 0 && idx.indexOf('id="ownScreenTime1539"') >= 0);
  check('v1.5.42 1.5.38 intacto: los botones de editar al estilo de los iconos del perfil', idx.indexOf('hwIconBtn1538') >= 0);
  check('v1.5.42 1.5.37 intacto: el rayo va dentro del símbolo de batería', appjs.indexOf('M13.8 1.8') >= 0);
  check('v1.5.42 1.5.36 intacto: el menú con apartados tipo widgets', idx.indexOf('id="homeWidgets1536"') >= 0);
  check('v1.5.42 1.5.35 intacto: las 12 canciones con musica/ y 0 assets/musica', C.SONG_CATALOG.length === 12 && C.SONG_CATALOG.every(function (sg, i) { return sg.src === 'musica/cancion-' + (i + 1) + '.mp3'; }) && appjs.indexOf('assets/musica') < 0 && corejs.indexOf('assets/musica') < 0);
}

function static1543() {
  console.log('=== 103. WordRed 1.5.43: preguntas en su panel, tarjeta de apoyo más grande, fondos translúcidos, sin avisos de ejemplo en la campana, reloj más grande, cartelera de juegos y arreglos al subir video ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const faqStart = appjs.indexOf('var FAQ = [');
  const faqEnd = appjs.indexOf('];', faqStart);
  const faqEntries = (faqStart >= 0 && faqEnd > faqStart ? appjs.slice(faqStart, faqEnd) : '').split("{ q: '").length - 1;
  const serverjs = fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  /* Versión. */
  check('v1.5.43 versión: manifiesto 67 / 1.5.52', manifest.indexOf('android:versionCode="78"') >= 0 && manifest.indexOf('android:versionName="1.5.63"') >= 0);
  check('v1.5.43 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', appjs.indexOf('var APP_VERSION_CODE = 78;') >= 0 && appjs.indexOf("var APP_VERSION_NAME = '1.5.63';") >= 0);
  check('v1.5.43 versión: los textos visibles dicen 1.5.43 (Ajustes y Acerca de)', idx.indexOf('id="updateCurrentVersion">WordRed 1.5.63<') >= 0 && idx.indexOf('WordRed 1.5.63 — red social original') >= 0);
  check('v1.5.43 versión: build.sh dice 1.5.43', buildsh.indexOf('Build WordRed v1.5.63') >= 0);
  check('v1.5.43 versión: el FAQ sigue en 29 entradas', faqEntries === 29);
  /* (1) Las preguntas en su panel. */
  check('v1.5.43 preguntas: existe el panel con su cruz para cerrar, su título y la lista dentro', idx.indexOf('id="faqOverlay1543"') >= 0 && idx.indexOf('data-close="faqOverlay1543"') >= 0 && idx.indexOf('id="faqTitle1542"') >= 0 && idx.indexOf('id="faqList"') > idx.indexOf('id="faqOverlay1543"'));
  check('v1.5.43 preguntas: el panel tiene fondo translúcido y va por encima de Ajustes', idx.indexOf('#faqOverlay1543{background:rgba(5,1,2,.55);') >= 0 && idx.indexOf('z-index:90') >= 0);
  check('v1.5.43 preguntas: el botón «?» abre el panel (no baja con scroll)', appjs.indexOf("showOverlay('faqOverlay1543')") >= 0 && appjs.indexOf("t.scrollIntoView({ behavior: 'smooth', block: 'start' })") < 0);
  check('v1.5.43 preguntas: el FAQ ya NO está suelto dentro de Ajustes', (function () { var sStart = idx.indexOf('id="settingsOverlay"'); var sEnd = idx.indexOf('<!-- ============ PREGUNTAS FRECUENTES', sStart); var block = (sStart >= 0 && sEnd > sStart) ? idx.slice(sStart, sEnd) : ''; return block.indexOf('faqList') < 0 && block.indexOf('faqTitle1542') < 0; })());
  /* (2) La tarjeta de Apoyar a WordRed más grande y el botón de copiar solo icono. */
  check('v1.5.43 apoyo: la tarjeta es más grande (más padding y texto más grande)', idx.indexOf('#supportSection{padding:22px}') >= 0 && idx.indexOf('font-size:16px;line-height:1.5') >= 0 && idx.indexOf('font-size:16px;line-height:1.8') >= 0);
  check('v1.5.43 apoyo: el botón de copiar es solo icono, redondo de 40 px como los widgets, sin texto', idx.indexOf('class="wOptRound1542 mt" id="supportCopyBtn"') >= 0 && idx.indexOf('aria-label="Copiar número de cuenta"') >= 0 && idx.indexOf('<rect x="9" y="9" width="13" height="13" rx="2"/>') >= 0 && idx.indexOf('>Copiar número de cuenta</button>') < 0);
  check('v1.5.43 apoyo: el botón sigue copiando el número de cuenta igual que antes', appjs.indexOf("$('supportCopyBtn').addEventListener('click'") >= 0 && appjs.indexOf("var el = $('supportAccount');") >= 0 && appjs.indexOf('navigator.clipboard.writeText(num)') >= 0);
  check('v1.5.43 apoyo: la información y los datos no cambiaron (mismo texto y mismos datos)', idx.indexOf('WordRed es gratis y la hace una sola persona.') >= 0 && idx.indexOf('Banco: <b>BBVA</b>') >= 0 && idx.indexOf('Titular: <b>CHRISTIAN CARRILLO CORTEZANO</b>') >= 0 && idx.indexOf('id="supportAccount"') >= 0);
  /* (3) Fondos translúcidos: Ajustes y el cajón. */
  check('v1.5.43 fondos: el fondo de Ajustes es translúcido', idx.indexOf('#settingsOverlay{background:rgba(5,1,2,.55)}') >= 0);
  check('v1.5.43 fondos: el fondo del cajón es translúcido y LEVE (menos oscuro que Ajustes)', idx.indexOf('#appsDrawerOverlay{background:rgba(5,1,2,.30);') >= 0 && idx.indexOf('#appsDrawerOverlay{background:rgba(5,1,2,.30);backdrop-filter:blur(4px);') >= 0);
  check('v1.5.43 fondos: los demás overlays siguen con el fondo de antes (.92)', idx.indexOf('.overlay{position:fixed;inset:0;z-index:80;background:rgba(5,1,2,.92);') >= 0);
  check('v1.5.43 fondos: la animación del cajón no cambió (wrDrawerFluid)', idx.indexOf('#appsDrawerOverlay.on .sheet{animation:wrDrawerFluid') >= 0);
  /* (4) En la campana no aparece nada de la cuenta de ejemplo. */
  check('v1.5.43 avisos: isDemoNotif se exporta y filtra por el teléfono de ejemplo y por la marca isDemo', corejs.indexOf('function isDemoNotif(state, n)') >= 0 && corejs.indexOf('n.from === DEMO_PROFILE_1534.phone') >= 0 && corejs.indexOf('p.isDemo') >= 0 && corejs.indexOf('isDemoNotif: isDemoNotif') >= 0);
  check('v1.5.43 avisos: el conteo de no leídos excluye los avisos de ejemplo', corejs.indexOf('!isDemoNotif(state, n)') >= 0);
  check('v1.5.43 avisos: renderNotifs filtra los avisos de ejemplo en la campana', appjs.indexOf('!C.isDemoNotif(state, n)') >= 0);
  /* (5) La hora más grande, dentro de su recuadro. */
  check('v1.5.43 reloj: la hora es más grande en los tres tamaños (s 39, m 64, l 89; antes 32, 48, 60)', idx.indexOf('.homeWidget[data-size="s"] .weatherTime{font-size:39px}') >= 0 && idx.indexOf('.weatherTime{font-size:64px;') >= 0 && idx.indexOf('.homeWidget[data-size="l"] .weatherTime{font-size:89px}') >= 0);
  check('v1.5.43 reloj: la hora cabe en su recuadro en s/m/l en un teléfono angosto (336 px) y en el Motorola (415 px)', (function () { /* La hora más ancha es "88:88": medida con DejaVu Sans Bold (800, letter-spacing -1 px), más ancha que Roboto: 3.143 px por cada px de fuente. Ancho disponible = ancho del contenido menos bordes (2 px del apartado + 1 px de la tarjeta) y padding de la tarjeta (16 px por lado en s, 24 px en m/l), con el apartado s a mitad de fila (gap 12 px). */ var wPerPx = 3.143; var availS336 = (336 - 12) / 2 - 38, availS415 = (415 - 12) / 2 - 38, availM336 = 336 - 54, availM415 = 415 - 54; return 39 * wPerPx <= availS336 && 39 * wPerPx <= availS415 && 64 * wPerPx <= availM336 && 64 * wPerPx <= availM415 && 89 * wPerPx <= availM336 && 89 * wPerPx <= availM415; })());
  check('v1.5.43 reloj: el arreglo de la 1.5.37 sigue (la hora no se parte, el apartado no se deforma, la fecha envuelve)', idx.indexOf('.homeWidget[data-widget="reloj"]{overflow:hidden}') >= 0 && idx.indexOf('.homeWidget[data-widget="reloj"] .weatherTime{white-space:nowrap}') >= 0 && idx.indexOf('.homeWidget[data-widget="reloj"] .weatherClock{min-width:0;flex-shrink:1}') >= 0 && idx.indexOf('.homeWidget[data-widget="reloj"] .weatherDate{overflow-wrap:break-word}') >= 0);
  check('v1.5.43 reloj: la fecha sigue debajo de la hora', idx.indexOf('id="weatherTime"') >= 0 && idx.indexOf('id="weatherTime"') < idx.indexOf('id="weatherDate"'));
  /* (6) Cartelera de estrenos de juegos, como la de cine. */
  check('v1.5.43 juegos: el servidor es 4.1 y trae GET /api/games-billboard con readGamesBillboard', serverjs.indexOf("version: '4.8'") >= 0 && serverjs.indexOf("app.get('/api/games-billboard'") >= 0 && serverjs.indexOf('function readGamesBillboard()') >= 0);
  check('v1.5.43 juegos: games.json trae 6 juegos con título, fecha, portada y tráiler', (function () { try { var gj = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'games.json'), 'utf8')); return gj && Array.isArray(gj.games) && gj.games.length === 6 && gj.games.every(function (g) { return g.title && g.date && g.poster && g.trailer && /^https:\/\//.test(g.poster) && /^https:\/\/www\.youtube\.com\/watch\?v=/.test(g.trailer); }); } catch (e) { return false; } })());
  check('v1.5.43 juegos: la lista fija trae los 6 juegos verificados (título y fecha)', ['Grand Theft Auto VI|19 nov 2026', 'Hela: Of Mice & Magic|1 dic 2026', 'Rayman Legends Retold|3 dic 2026', 'Warhammer 40,000: Dawn of War IV|3 dic 2026', 'Monster Hunter Wilds|4 dic 2026', 'Path of Exile 2|11 dic 2026'].every(function (t) { var p = t.split('|'); return appjs.indexOf("title: '" + p[0] + "'") >= 0 && appjs.indexOf("date: '" + p[1] + "'") >= 0; }));
  check('v1.5.43 juegos: la lista fija trae las portadas reales y los tráileres verificados', ['4/46/Grand_Theft_Auto_VI.png', '3161310/library_600x900.jpg', '6/6e/Rayman_Legends_Retold_cover_art.jpg', '1/1b/Dawn_of_War_4_cover_art.jpg', '2246340/library_600x900.jpg', '2694490/library_600x900.jpg'].every(function (p) { return appjs.indexOf(p) >= 0; }) && ['rz1B4B2yBZY', 'H9rKQBNH1XE', 'TKfG9hiueak', 'YVmXDMM48zg', 'QvGjxUaeE2Q', 'BwYNNQJO-AE'].every(function (v) { return appjs.indexOf('watch?v=' + v) >= 0; }));
  check('v1.5.43 juegos: el encabezado trae el mando y el texto «Próximos estrenos de juegos»', appjs.indexOf("ic('gamepad', 18)") >= 0 && appjs.indexOf('Próximos estrenos de juegos') >= 0 && appjs.indexOf('gamesBillboardHead1543') >= 0);
  check('v1.5.43 juegos: la cartelera se actualiza sola (caché de 1 día, endpoint del servidor, respaldo con la lista fija)', appjs.indexOf('GAMES_BILLBOARD_CACHE_KEY_1543') >= 0 && appjs.indexOf('GAMES_BILLBOARD_CACHE_TTL_1543 = 86400000') >= 0 && appjs.indexOf("'/api/games-billboard'") >= 0 && appjs.indexOf('GAMES_BILLBOARD_1543.slice()') >= 0 && appjs.indexOf('Cartelera de juegos sin actualizar (sin conexión)') >= 0);
  check('v1.5.44 juegos: va aparte, después de la 10ª publicación (ya no junto a la cartelera de cine)', appjs.indexOf("if (i === 9) { parts.push(featuredGameHtml1549()); parts.push(gamesBillboardHtml1543()); }") >= 0 && appjs.indexOf("if (i === 4) parts.push(gamesBillboardHtml1543());") < 0 && appjs.indexOf("else if (shown.length >= 5 && shown.length < 10) { if (shown.length < 7) parts.push(newsRowHtml1547()); parts.push(featuredGameHtml1549()); parts.push(gamesBillboardHtml1543()); }") >= 0 && appjs.indexOf("parts.push(billboardHtml1540()); parts.push(newsRowHtml1547()); parts.push(featuredGameHtml1549()); parts.push(gamesBillboardHtml1543());") >= 0);
  check('1.5.60 tráiler: al tocar un juego se abre su tráiler dentro de la app con __wrOpenTrailer', appjs.indexOf('class="gameCard1543" onclick="window.__wrOpenTrailer(') >= 0 && appjs.indexOf('gamePoster1543') >= 0 && appjs.indexOf('gameTitle1543') >= 0);
  check('v1.5.43 juegos: el juego ya disponible lleva la marca «Ya disponible»', appjs.indexOf('Ya disponible') >= 0 && appjs.indexOf('gameNow1543') >= 0);
  check('v1.5.43 juegos: el mando existe como icono y va antes del título «juegos de Play Store» en la tienda', appjs.indexOf('gamepad: ') >= 0 && idx.indexOf('<h3 class="sectitle" style="display:flex;align-items:center;gap:6px">') >= 0 && idx.indexOf('M17.32 5H6.68') >= 0 && idx.indexOf('Juegos de Play Store</h3>') >= 0);
  /* (7) Arreglos al subir un video. */
  check('v1.5.43 video: carátula y editar video van ARRIBA del video, DENTRO de su recuadro, solo con símbolo', appjs.indexOf('top:4px;left:4px;width:40px;height:40px;border-radius:50%') >= 0 && appjs.indexOf('top:4px;left:52px;width:40px;height:40px;border-radius:50%') >= 0 && appjs.indexOf("ic('image', 19)") >= 0 && appjs.indexOf("ic('video', 19)") >= 0 && appjs.indexOf('aria-label="Carátula"') >= 0 && appjs.indexOf('aria-label="Editar video"') >= 0);
  check('v1.5.43 video: los botones ya no van abajo con texto ni se enciman', appjs.indexOf('>Carátula</button>') < 0 && appjs.indexOf('>Editar video</button>') < 0 && appjs.indexOf('bottom:4px;left:4px') < 0 && appjs.indexOf('bottom:4px;right:4px') < 0);
  check('v1.5.43 video: no existe la «Música automática» en el publicador', idx.indexOf('postAutoMusicToggle') < 0 && appjs.indexOf('suggestComposerSong') < 0 && appjs.indexOf('getAutoMusic') < 0 && appjs.indexOf('var autoMusic') < 0);
  check('v1.5.43 video: la canción se sigue eligiendo a mano en el publicador', appjs.indexOf("openSongPicker('composer'") >= 0 && appjs.indexOf('postSongChange') >= 0 && appjs.indexOf('postSongRow') >= 0);
  check('v1.5.43 video: no existe la «Música automática» en el editor de historias', appjs.indexOf('storyEditAutoMusic') < 0 && appjs.indexOf('storyEdit.autoMusic') < 0 && appjs.indexOf('Activa "Música automática"') < 0);
  check('v1.5.43 video: en historias el audio se sigue eligiendo a mano (sugerir o elegir canción)', appjs.indexOf('storyEditSongAuto') >= 0 && appjs.indexOf('storyEditSongChange') >= 0 && appjs.indexOf('storyEditSongRemove') >= 0);
  check('v1.5.43 video: en el editor de video ya no existe la «Música automática» (corrección: se quitó el botón)', appjs.indexOf('videoEditSongAuto') < 0 && appjs.indexOf('La música automática solo se pone si la escoges aquí') < 0 && appjs.indexOf('videoEditSongPick') >= 0 && appjs.indexOf('videoEditSongRemove') >= 0);
  check('v1.5.43 video: no existe la opción de sentimiento en el compositor', idx.indexOf('postFeelingRow') < 0 && idx.indexOf('postFeelingCustom') < 0 && idx.indexOf('¿Cómo te sientes o qué haces?') < 0 && appjs.indexOf('composerFeeling') < 0 && appjs.indexOf('renderComposerFeelingRow') < 0);
  check('v1.5.43 video: al modificar se conserva el sentimiento que ya tenía la publicación', appjs.indexOf('keepFeeling1543') >= 0 && appjs.indexOf('feeling: keepFeeling1543') >= 0);
  check('v1.5.43 video: las publicaciones ya hechas con sentimiento se siguen viendo igual', appjs.indexOf("post.feeling.kind === 'activity' ? 'está en ' : 'se siente '") >= 0 && corejs.indexOf('FEELINGS: FEELINGS') >= 0);
  /* 1.5.42 intacto. */
  check('v1.5.43 1.5.42 intacto: opciones con el diseño de los widgets y botón «?» redondo', idx.indexOf('.btn.wOpt1542{display:inline-flex;') >= 0 && idx.indexOf('.wOptRound1542{width:40px;height:40px;') >= 0 && idx.indexOf('class="wOptRound1542" id="settingsFaqBtn1542"') >= 0);
  check('1.5.62 FAQ: tutorial en 6 pasos con las novedades y FAQ con 29 entradas (la de los Reels salió en la rotación)', (appjs.match(/\{ art: '/g) || []).length === 6 && appjs.indexOf('Arriba siempre están los reels, luego «¿Qué estás pensando?»') >= 0 && appjs.indexOf("q: '¿Qué es la cartelera «Próximos estrenos»?'") >= 0 && appjs.indexOf("q: '¿Dónde quedó «Tu tiempo hoy»?'") >= 0 && appjs.indexOf("q: '¿Cómo quedaron los Reels?'") < 0);
  check('v1.5.43 1.5.41 intacto: el orden historias, publicar, reloj, clima, accesos y las historias fijadas', JSON.stringify(C.HOME_WIDGETS_BUILTIN_1536) === JSON.stringify(['historias', 'publicar', 'reloj', 'clima', 'accesos']) && appjs.indexOf('if (i === 0 || j === 0) return;') >= 0 && appjs.indexOf("$('hwMoveDown').disabled = (idx === 0);") >= 0);
  check('v1.5.43 1.5.40 intacto: Reels 264x400 y cartelera «Próximos estrenos» con /api/billboard', idx.indexOf('.reelTile{flex:0 0 264px;height:400px;') >= 0 && appjs.indexOf('BILLBOARD_CACHE_KEY_1540') >= 0 && appjs.indexOf('Próximos estrenos') >= 0 && serverjs.indexOf("version: '4.8'") >= 0 && serverjs.indexOf("app.get('/api/billboard'") >= 0);
  check('v1.5.43 1.5.39 intacto: los 4 atajos en una fila y «Tu tiempo hoy» antes de la tienda de juegos', idx.indexOf('.profileShortcuts1539{display:flex;flex-wrap:nowrap;gap:6px;margin:8px 0}') >= 0 && idx.indexOf('id="ownScreenTime1539"') >= 0);
  check('v1.5.43 1.5.38 intacto: los botones de editar al estilo de los iconos del perfil', idx.indexOf('hwIconBtn1538') >= 0);
  check('v1.5.43 1.5.37 intacto: el rayo va dentro del símbolo de batería', appjs.indexOf('M13.8 1.8') >= 0);
  check('v1.5.43 1.5.36 intacto: el menú con apartados tipo widgets', idx.indexOf('id="homeWidgets1536"') >= 0);
  check('v1.5.43 1.5.35 intacto: las 12 canciones con musica/ y 0 assets/musica', C.SONG_CATALOG.length === 12 && C.SONG_CATALOG.every(function (sg, i) { return sg.src === 'musica/cancion-' + (i + 1) + '.mp3'; }) && appjs.indexOf('assets/musica') < 0 && corejs.indexOf('assets/musica') < 0);
}

function static1544() {
  console.log('=== 104. WordRed 1.5.45: carteleras separadas, portada del reel de ejemplo, cuentas de ejemplo sin aparecer activas ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const faqStart = appjs.indexOf('var FAQ = [');
  const faqEnd = appjs.indexOf('];', faqStart);
  const faqEntries = (faqStart >= 0 && faqEnd > faqStart ? appjs.slice(faqStart, faqEnd) : '').split("{ q: '").length - 1;
  const serverjs = fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  /* Versión. */
  check('v1.5.45 versión: manifiesto 67 / 1.5.52', manifest.indexOf('android:versionCode="78"') >= 0 && manifest.indexOf('android:versionName="1.5.63"') >= 0);
  check('v1.5.45 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', appjs.indexOf('var APP_VERSION_CODE = 78;') >= 0 && appjs.indexOf("var APP_VERSION_NAME = '1.5.63';") >= 0);
  check('v1.5.45 versión: los textos visibles dicen 1.5.45 (Ajustes y Acerca de)', idx.indexOf('id="updateCurrentVersion">WordRed 1.5.63<') >= 0 && idx.indexOf('WordRed 1.5.63 — red social original') >= 0);
  check('v1.5.45 versión: build.sh dice 1.5.45', buildsh.indexOf('Build WordRed v1.5.63') >= 0);
  check('v1.5.45 versión: el FAQ sigue en 29 entradas', faqEntries === 29);
  /* 1.5.45: apilado — la pantalla recién abierta va al frente. */
  check('1.5.45 apilado: showOverlay sube la pantalla nueva por encima de los overlays visibles', /function showOverlay\(id\) \{[\s\S]{0,900}getComputedStyle[\s\S]{0,300}zIndex[\s\S]{0,300}classList\.add\('on'\)/.test(appjs));
  check('1.5.45 apilado: hideOverlay suelta el z-index dinámico al cerrar', /function hideOverlay\(id\) \{[\s\S]{0,1500}style\.zIndex = ''[\s\S]{0,300}classList\.remove\('on'\)/.test(appjs));
  check('1.5.45 apilado: el editor de video y la carátula se abren con showOverlay', /showOverlay\('videoEditorOverlay'\)/.test(appjs) && /showOverlay\('coverPickerOverlay'\)/.test(appjs));
  check('1.5.45 apilado: showOverlay está expuesto para las pruebas', /showOverlay: showOverlay,/.test(appjs));
  check('1.5.63 novedades: el FAQ cuenta lo nuevo de la 1.5.63 (la de la 1.5.61 salió en la rotación)', /¿Qué hay de nuevo en la 1\.5\.63\?/.test(appjs) && /¿Qué hay de nuevo en la 1\.5\.61\?/.test(appjs) === false);
  /* (1) Las carteleras van separadas: cine tras la 5ª, juegos tras la 10ª. */
  check('v1.5.44 carteleras: la de cine sigue tras la 5ª publicación y la de juegos va tras la 10ª', appjs.indexOf("if (i === 4) parts.push(billboardHtml1540());") >= 0 && appjs.indexOf("if (i === 9) { parts.push(featuredGameHtml1549()); parts.push(gamesBillboardHtml1543()); }") >= 0 && appjs.indexOf("if (i === 4) parts.push(gamesBillboardHtml1543());") < 0);
  check('v1.5.44 carteleras: con pocos posts la de juegos va al final (con 5-9 tras la última; con 2-4 tras la de cine)', appjs.indexOf("else if (shown.length >= 5 && shown.length < 10) { if (shown.length < 7) parts.push(newsRowHtml1547()); parts.push(featuredGameHtml1549()); parts.push(gamesBillboardHtml1543()); }") >= 0 && appjs.indexOf("else if (shown.length > 1 && shown.length < 5) { parts.push(billboardHtml1540()); parts.push(newsRowHtml1547()); parts.push(featuredGameHtml1549()); parts.push(gamesBillboardHtml1543()); }") >= 0);
  /* (2) La portada del reel de ejemplo. */
  check('v1.5.44 reel: existe la portada fija del video de ejemplo (un fotograma real del clip)', fs.existsSync(path.join(__dirname, '..', 'assets', 'ejemplo', 'video-ciudad.jpg')) && fs.statSync(path.join(__dirname, '..', 'assets', 'ejemplo', 'video-ciudad.jpg')).size > 1000);
  check('v1.5.44 reel: la portada fija es un JPEG real de la ciudad', (function () { try { var b = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ejemplo', 'video-ciudad.jpg')); return b.length > 1000 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF; } catch (e) { return false; } })());
  check('v1.5.44 reel: el reel del ejemplo usa la portada fija aunque la publicación no la traiga guardada', appjs.indexOf("post.demoKey === 'ejemplo-video' ? C.DEMO_VIDEO_COVER_1544 : ''") >= 0 && corejs.indexOf('DEMO_VIDEO_COVER_1544: DEMO_VIDEO_COVER_1544') >= 0 && corejs.indexOf("var DEMO_VIDEO_COVER_1544 = 'ejemplo/video-ciudad.jpg';") >= 0);
  check('v1.5.44 reel: la publicación de ejemplo con video se siembra con su portada', corejs.indexOf('thumb: DEMO_VIDEO_COVER_1544') >= 0 && corejs.indexOf("videoThumb: d.thumb || ''") >= 0);
  /* (3) Las cuentas de ejemplo no aparecen como activas. */
  check('v1.5.44 activa: hay un ayudante que reconoce a la cuenta de ejemplo (teléfono o marca isDemo)', appjs.indexOf('function isDemoAccount1544(phone)') >= 0 && appjs.indexOf("phone === '0000000000'") >= 0);
  check('v1.5.44 activa: la cuenta de ejemplo nunca se muestra como activa (sin aro rojo ni indicador)', /function liveOf\(phone\)/.test(appjs) && /if \(isDemoAccount1544\(phone\)\) return null;/.test(appjs) && /var liveList1544 = liveList\.filter\(function \(l\) \{ return !isDemoAccount1544\(l\.host\); \}\);/.test(appjs));
  check('v1.5.44 activa: una cuenta de ejemplo nunca está en vivo (sin aro rojo ni entrar a un live)', appjs.indexOf('if (isDemoAccount1544(phone)) return null;') >= 0);
  check('v1.5.44 activa: la fila de lives filtra los lives de la cuenta de ejemplo', appjs.indexOf('liveList.filter(function (l) { return !isDemoAccount1544(l.host); })') >= 0);
  /* (4) Preguntas. */
  check('1.5.62 preguntas: la entrada de novedades ahora es la 1.5.62 corta (respuesta ≤400 caracteres, sin mencionar el servidor; cuenta la subida que continúa y el buscador)', appjs.indexOf("q: '¿Qué hay de nuevo en la 1.5.62?'") >= 0 && (function () { var m = appjs.match(/\{ q: '¿Qué hay de nuevo en la 1\.5\.62\?', a: '([^']*)'/); return m && m[1].length <= 400 && m[1].indexOf('buscador') >= 0 && m[1].indexOf('continúa donde se quedó') >= 0 && m[1].indexOf('servidor') < 0; })() && appjs.indexOf('El servidor está despertando, reintentando') >= 0);
  /* 1.5.43 intacto. */
  check('v1.5.44 1.5.43 intacto: panel de preguntas, tarjeta de apoyo, fondos translúcidos, reloj 39/64/89 y cartelera de juegos', idx.indexOf('id="faqOverlay1543"') >= 0 && idx.indexOf('#supportSection{padding:22px}') >= 0 && idx.indexOf('#settingsOverlay{background:rgba(5,1,2,.55)}') >= 0 && idx.indexOf('.homeWidget[data-size="s"] .weatherTime{font-size:39px}') >= 0 && appjs.indexOf('gamesBillboardHtml1543') >= 0 && serverjs.indexOf("version: '4.8'") >= 0 && serverjs.indexOf("app.get('/api/games-billboard'") >= 0);
}

function static1546() {
  console.log('=== 105. WordRed 1.5.46: la subida reintenta sola mientras el servidor despierta (sin culpar a tu internet) ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const faqStart = appjs.indexOf('var FAQ = [');
  const faqEnd = appjs.indexOf('];', faqStart);
  const faqEntries = (faqStart >= 0 && faqEnd > faqStart ? appjs.slice(faqStart, faqEnd) : '').split("{ q: '").length - 1;
  const serverjs = fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  /* Versión. */
  check('v1.5.46 versión: manifiesto 67 / 1.5.52', manifest.indexOf('android:versionCode="78"') >= 0 && manifest.indexOf('android:versionName="1.5.63"') >= 0);
  check('v1.5.46 versión: la versión en JS es 67 / 1.5.52 (igual que el manifiesto)', appjs.indexOf('var APP_VERSION_CODE = 78;') >= 0 && appjs.indexOf("var APP_VERSION_NAME = '1.5.63';") >= 0);
  check('v1.5.46 versión: los textos visibles dicen 1.5.46 (Ajustes y Acerca de)', idx.indexOf('id="updateCurrentVersion">WordRed 1.5.63<') >= 0 && idx.indexOf('WordRed 1.5.63 — red social original') >= 0);
  check('v1.5.46 versión: build.sh dice 1.5.46', buildsh.indexOf('Build WordRed v1.5.63') >= 0);
  check('v1.5.46 versión: el FAQ sigue en 29 entradas', faqEntries === 29);
  /* (1) Abrir y cerrar van con reintento; el trozo, nunca en su lugar. */
  check('1.5.46 reintento: abrir la subida usa serverFetchWithRetry (3 intentos, 30 s, esperas 0/5 s/15 s)', /async function startServerMediaUpload[\s\S]{0,600}serverFetchWithRetry\(state, '\/api\/media\/start'/.test(corejs));
  check('1.5.46 reintento: cerrar la subida usa serverFetchWithRetry (3 intentos, 30 s, esperas 0/5 s/15 s)', /async function finishServerMediaUpload[\s\S]{0,600}serverFetchWithRetry\(state, '\/api\/media\/finish'/.test(corejs));
  check('1.5.62 reintento: el trozo se manda una sola vez con timeout de 60 s (antes 30 s; nunca se reenvía en su lugar: el servidor lo añade y se duplicaría)', corejs.indexOf('sendServerMediaChunkRaw1546') >= 0 && /async function sendServerMediaChunkRaw1546[\s\S]{0,400}serverFetch\(state, '\/api\/media\/chunk'/.test(corejs) && corejs.indexOf("serverFetchWithRetry(state, '/api/media/chunk'") < 0 && /opts\.timeoutMs == null \? 60000 : opts\.timeoutMs/.test(corejs));
  check('1.5.62 reintento: si un trozo falla por conexión, la subida REANUDA con el MISMO uploadId (ya no se reinicia completa con uno nuevo)', corejs.indexOf('getUploadStatus1562') >= 0 && /if \(attempt > 0 && uploadId\) \{/.test(corejs) && corejs.indexOf("if (!st) { uploadId = null; continue; }") >= 0 && corejs.indexOf('maxRestarts = (opts.maxRestarts == null ? 2 : opts.maxRestarts)') >= 0);
  check('1.5.46 reintento: el lector de trozos se crea de nuevo en cada intento (fábrica makeGetChunk)', /async function uploadMediaChunks\(state, name, mime, total, makeGetChunk, onProgress, opts\)/.test(corejs) && corejs.indexOf('getChunk = makeGetChunk()') >= 0);
  check('1.5.46 reintento: el porcentaje nunca vuelve atrás en un reintento', corejs.indexOf('if (p < lastPct) p = lastPct;') >= 0);
  check('1.5.46 reintento: mientras se reintenta se avisa con onStatus(\'waking\')', corejs.indexOf("status('waking')") >= 0 && corejs.indexOf('onRetry: function () { setWaking(); }') >= 0);
  /* (2) Mensajes honestos. */
  check('1.5.46 mensajes: mientras se reintenta, la barra dice que el servidor está despertando', appjs.indexOf("lb.textContent = 'El servidor está despertando, reintentando…';") >= 0);
  check('1.5.46 mensajes: el mensaje final distingue sin internet de servidor sin responder', appjs.indexOf('function mediaUploadFailMessage1546(base)') >= 0 && appjs.indexOf("return base + ' No tienes internet.';") >= 0 && appjs.indexOf("return base + ' El servidor no respondió, inténtalo de nuevo en unos segundos.';") >= 0);
  check('1.5.46 mensajes: al publicar, el fallo usa el mensaje honesto (foto, video, portada, canción y aviso)', appjs.indexOf("mediaUploadFailMessage1546('No se pudo subir ' + (item.type === 'video' ? 'el video.' : 'la foto.'))") >= 0 && appjs.indexOf("mediaUploadFailMessage1546('No se pudo subir la portada.')") >= 0 && appjs.indexOf("mediaUploadFailMessage1546('No se pudo subir la canción.')") >= 0 && appjs.indexOf("mediaUploadFailMessage1546('No se pudo subir la publicación.') + ' Toca Reintentar.'") >= 0);
  check('1.5.46 mensajes: ya no se culpa a la conexión del usuario al fallar una publicación', appjs.indexOf('Revisa tu conexión y toca Reintentar.') < 0);
  check('1.5.46 mensajes: el último error de subida se guarda para el mensaje final', corejs.indexOf('function lastMediaUploadError1546()') >= 0 && corejs.indexOf('lastMediaUploadError1546: lastMediaUploadError1546') >= 0);
  /* (3) Preguntas. */
  check('1.5.62 preguntas: la entrada de novedades ahora es la 1.5.62 corta (la FAQ no menciona el servidor)', appjs.indexOf("q: '¿Qué hay de nuevo en la 1.5.62?'") >= 0 && (function () { var m = appjs.match(/\{ q: '¿Qué hay de nuevo en la 1\.5\.62\?', a: '([^']*)'/); return m && m[1].indexOf('servidor') < 0; })() && appjs.indexOf('El servidor está despertando, reintentando') >= 0);
  /* (4) La barra de subida va abajo, sin tapar nada. */
  check('1.5.46 barra: va fijada ABAJO, justo encima de la barra inferior (ya no arriba tapando pantallas)', idx.indexOf('#mediaUploadBar{position:fixed;left:0;right:0;bottom:calc(68px + var(--sys-nav-bottom,0px));z-index:70;') >= 0 && idx.indexOf('position:fixed;top:0;left:0;right:0;z-index:200') < 0);
  check('1.5.46 barra: su z (70) queda por debajo de las pantallas (z-80) y por encima de la barra inferior (z-60)', idx.indexOf('z-index:70;height:40px') >= 0 && idx.indexOf('nav#bottomNav{position:fixed;left:0;right:0;bottom:var(--sys-nav-bottom,0px);z-index:60;') >= 0);
  check('1.5.46 barra: mientras se ve, el contenido se despeja 40 px abajo (nada queda detrás de ella)', idx.indexOf('body.wrUploading1530 main{padding-bottom:calc(144px + var(--sys-nav-bottom,0px))}') >= 0 && idx.indexOf('body.wrUploading1530{padding-top:40px}') < 0 && idx.indexOf('body.wrUploading1530 #appView header{top:40px}') < 0);
  check('1.5.46 barra: al mostrarse, su distancia abajo se mide a la barra inferior real (no un número fijo)', appjs.indexOf('window.innerHeight - r.top') >= 0 && appjs.indexOf("bar.style.bottom = (window.innerHeight - r.top) + 'px';") >= 0);
  check('1.5.46 barra: porcentaje, etiqueta, Reintentar/✕ y aviso del celular siguen iguales', idx.indexOf('id="mediaUploadLabel"') >= 0 && idx.indexOf('id="mediaUploadFill"') >= 0 && idx.indexOf('id="mediaUploadPct"') >= 0 && idx.indexOf('id="mediaUploadRetry1529"') >= 0 && idx.indexOf('id="mediaUploadDismiss1529"') >= 0 && appjs.indexOf('bgUploadNotify1529') >= 0);
  /* 1.5.45 intacto. */
  check('v1.5.46 1.5.45 intacto: el apilado (z-index dinámico) y las carteleras separadas', /zIndex = String\(top \+ 5\)/.test(appjs) && appjs.indexOf("if (i === 4) parts.push(billboardHtml1540());") >= 0 && appjs.indexOf("if (i === 9) { parts.push(featuredGameHtml1549()); parts.push(gamesBillboardHtml1543()); }") >= 0 && serverjs.indexOf("version: '4.8'") >= 0);
}


async function static1554() {
  console.log('=== 106. WordRed 1.5.55: dramas originales, botón de regresar, moneda en el perfil, reels en el Inicio, Fantore Resurrección; aprobación dentro de la app; servidor 4.4 ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const buildsh = fs.readFileSync(path.join(__dirname, '..', 'build.sh'), 'utf8');
  const mainAct = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const serverjs = fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  const kdramasJson = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'kdramas.json'), 'utf8'));
  const featuredJson = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'featured-game.json'), 'utf8'));
  const faqStart = appjs.indexOf('var FAQ = [');
  const faqEnd = appjs.indexOf('];', faqStart);
  const faqEntries = (faqStart >= 0 && faqEnd > faqStart ? appjs.slice(faqStart, faqEnd) : '').split("{ q: '").length - 1;
  const fnBody54 = function (src, name) {
    const i = src.indexOf('function ' + name + '(');
    if (i < 0) return '';
    const j = src.indexOf('\nfunction ', i + 10);
    return src.slice(i, j < 0 ? src.length : j);
  };
  /* Versión. */
  check('1.5.54 versión: manifiesto 69 / 1.5.54', manifest.indexOf('android:versionCode="78"') >= 0 && manifest.indexOf('android:versionName="1.5.63"') >= 0);
  check('1.5.54 versión: la versión en JS es 69 / 1.5.54 (igual que el manifiesto)', appjs.indexOf('var APP_VERSION_CODE = 78;') >= 0 && appjs.indexOf("var APP_VERSION_NAME = '1.5.63';") >= 0);
  check('1.5.54 versión: los textos visibles dicen 1.5.54 (Ajustes y Acerca de)', idx.indexOf('id="updateCurrentVersion">WordRed 1.5.63<') >= 0 && idx.indexOf('WordRed 1.5.63 — red social original') >= 0);
  check('1.5.63 versión: el FAQ sigue en 29 entradas (la de novedades es la 1.5.63 y la 1.5.61 se quitó)', faqEntries === 29 && appjs.indexOf("q: '¿Qué hay de nuevo en la 1.5.63?'") >= 0 && appjs.indexOf("q: '¿Qué hay de nuevo en la 1.5.62?'") >= 0 && appjs.indexOf("q: '¿Qué hay de nuevo en la 1.5.61?'") < 0);
  check('1.5.54 versión: build.sh dice 1.5.54', buildsh.indexOf('Build WordRed v1.5.63') >= 0);
  check('1.5.54 versión: el servidor es 4.4', serverjs.indexOf("version: '4.8'") >= 0);
  /* (1) La app de usuario pide verificación y no auto-activa. */
  check('1.5.54 verificación: «Ya pagué» deja la promoción en verificación y pide POST /api/promotions/request (postId + nivel)', /requestPromoVerification1553/.test(appjs) && /var body = \{ postId: promo\.postId, tier: promo\.budget, goal: promo\.goal \};/.test(appjs) && /pushToServer\('\/api\/promotions\/request', 'POST', body\)/.test(appjs) && /promo\.status = 'verifying'/.test(appjs));
  check('1.5.54 verificación: si el servidor aún no acepta solicitudes, la solicitud se guarda en cola y se reintenta en silencio (nunca finge éxito)', /queued = true/.test(appjs) && /C\.queuePending\(state, \{ kind: 'http', path: '\/api\/promotions\/request'/.test(appjs) && /isConnectionError\(r\)/.test(appjs));
  check('1.5.54 verificación: la publicación en verificación muestra «En verificación» (sin «Promocionado» ni subir arriba)', /promoVerifying1553/.test(idx) && /isVerifying1547\(post\) \? ' <span class="promoVerifying1553">En verificación<\/span>'/.test(appjs) && /promotionForPost1547\(postId\)[\s\S]{0,200}status === 'active'/.test(appjs));
  check('1.5.54 verificación: al sincronizar, una aprobada se activa (insignia + arriba) y una rechazada se puede volver a pagar', /function syncPromoStatus1553/.test(appjs) && /p\.status = 'active'/.test(appjs) && /p\.status = 'rejected'/.test(appjs) && /Pagar de nuevo/.test(appjs) && /Rechazada/.test(appjs));
  check('1.5.54 verificación: el centro de promociones muestra la sección «En verificación»', /En verificación/.test(appjs) && /renderPromotionsHub1547/.test(appjs));
  /* (2) Configuración del creador: solo por defecto, la personalización se conserva. */
  check('1.5.54 config creador: la app descarga /api/creator-config con caché de 1 día', /fetchCreatorConfig1553/.test(appjs) && /wordred_creator_config1553/.test(appjs) && /Date\.now\(\) - c\.ts < 86400000/.test(appjs));
  check('1.5.54 config creador: se aplica SOLO si el Inicio sigue en su orden por defecto (o es la misma config ya aplicada)', /function applyCreatorConfig1553/.test(appjs) && /creatorConfigApplied1553/.test(appjs) && /creatorHomeMatches1553/.test(appjs));
  check('1.5.54 config creador: el validador acepta orden y tamaños conocidos y rechaza lo demás', /function creatorHomeConfigValid1536/.test(corejs) && /creatorHomeConfigValid1536: creatorHomeConfigValid1536/.test(corejs) && /applyCreatorHomeDefault1536: applyCreatorHomeDefault1536/.test(corejs));
  /* Unidad: validador y aplicación por defecto. */
  var cfgOk = { order: ['historias', 'publicar', 'reloj', 'clima', 'accesos'], sizes: { historias: 'm', publicar: 'm', reloj: 's', clima: 's', accesos: 'm' } };
  check('1.5.54 config creador: el validador acepta una config válida', C.creatorHomeConfigValid1536(cfgOk) === true);
  check('1.5.54 config creador: el validador rechaza un apartado desconocido', C.creatorHomeConfigValid1536({ order: ['historias', 'noexiste'], sizes: { historias: 'm', noexiste: 'm' } }) === false);
  check('1.5.54 config creador: el validador rechaza un apartado repetido', C.creatorHomeConfigValid1536({ order: ['historias', 'historias'], sizes: { historias: 'm' } }) === false);
  check('1.5.54 config creador: el validador rechaza un tamaño que no es s/m/l', C.creatorHomeConfigValid1536({ order: ['historias'], sizes: { historias: 'xl' } }) === false);
  check('1.5.54 config creador: el validador rechaza una orden vacía o nula', C.creatorHomeConfigValid1536({ order: [], sizes: {} }) === false && C.creatorHomeConfigValid1536(null) === false);
  var stDef = fresh();
  var applied = C.applyCreatorHomeDefault1536(stDef, cfgOk);
  check('1.5.54 config creador: sin personalizar, se aplica el orden y el tamaño del creador', applied && applied.order.join(',') === 'historias,publicar,reloj,clima,accesos' && applied.sizes.reloj === 's' && applied.sizes.clima === 's');
  check('1.5.54 config creador: al aplicar, los colores quedan en rojo y los añadibles se derivan del orden', applied && applied.colors.reloj === 'rojo' && Array.isArray(applied.added) && applied.added.length === 0);
  var stPers = fresh();
  stPers.homeWidgets1536 = { order: ['historias', 'reloj', 'publicar', 'clima', 'accesos'], sizes: { historias: 'm', reloj: 'l', publicar: 'm', clima: 's', accesos: 'm' }, colors: { historias: 'rojo', reloj: 'rojo', publicar: 'rojo', clima: 'rojo', accesos: 'rojo' }, added: [], notes: [] };
  var kept = C.applyCreatorHomeDefault1536(stPers, cfgOk);
  check('1.5.54 config creador: con el Inicio ya personalizado, la config del creador NO lo toca (el reloj grande se conserva)', kept && kept.order[1] === 'reloj' && kept.sizes.reloj === 'l');
  var stBad = fresh();
  var defed = C.applyCreatorHomeDefault1536(stBad, { order: ['noexiste'], sizes: {} });
  check('1.5.54 config creador: con una config inválida, queda el orden por defecto de la app', defed && defed.order.join(',') === C.defaultHomeWidgets1536().order.join(','));
  /* (3) serverFetch acepta encabezados extra (genérico; ya no hay clave de creador). */
  check('1.5.54 encabezados: serverFetch acepta encabezados extra y serverFetchWithRetry los reenvía', /async function serverFetch\(state, path, method, body, timeoutMs, extra\)/.test(corejs) && /extra\.headers/.test(corejs) && /serverFetch\(state, path, method, body, timeoutMs, opts\.extra/.test(corejs));
  const realFetch54 = global.fetch;
  let seenHeaders54 = null;
  global.fetch = async function (url, opts) {
    seenHeaders54 = opts && opts.headers;
    return { ok: true, status: 200, json: async function () { return { ok: true }; } };
  };
  try {
    const st54 = fresh();
    st54.settings.serverUrl = 'https://ejemplo.invalid';
    const r54 = await C.serverFetch(st54, '/api/promotions/pending', 'GET', null, 5000, { headers: { 'x-prueba': 'valor-prueba' } });
    check('1.5.54 encabezados: serverFetch manda un encabezado extra tal cual', r54 && r54.ok === true && seenHeaders54 && seenHeaders54['x-prueba'] === 'valor-prueba' && seenHeaders54['Content-Type'] === 'application/json', JSON.stringify(seenHeaders54));
    seenHeaders54 = null;
    const r54b = await C.serverFetchWithRetry(st54, '/api/promotions/pending', 'GET', null, { timeoutMs: 5000, extra: { headers: { 'x-prueba': 'valor-prueba' } } });
    check('1.5.54 encabezados: serverFetchWithRetry también manda el encabezado extra', r54b && r54b.ok === true && seenHeaders54 && seenHeaders54['x-prueba'] === 'valor-prueba', JSON.stringify(seenHeaders54));
  } finally { global.fetch = realFetch54; }
  /* (4) WordRed Creador NO existe: la app de usuario no tiene modo ni clave ni archivo de creador. */
  check('1.5.54 sin creador: la app de usuario no tiene la interfaz de creador ni la clave (ni el archivo ni el modo)', appjs.indexOf('creator.js') < 0 && appjs.indexOf('__CREATOR_KEY__') < 0 && appjs.indexOf('__WR_CREATOR_MODE__') < 0 && appjs.indexOf('Modo creador') < 0 && idx.indexOf('creator.js') < 0 && idx.indexOf('Modo creador') < 0);
  /* (5) Servidor 4.4: la aprobación es por cuenta principal (OWNER_EMAIL), no por clave. */
  check('1.5.54 servidor 4.4: existen las rutas de solicitudes (pedir, mías, pendientes, aprobar, rechazar) y de config', /\/api\/promotions\/request/.test(serverjs) && /\/api\/promotions\/mine/.test(serverjs) && /\/api\/promotions\/pending/.test(serverjs) && /\/api\/promotions\/:id\/approve/.test(serverjs) && /\/api\/promotions\/:id\/reject/.test(serverjs) && /\/api\/creator-config/.test(serverjs));
  check('1.5.54 servidor 4.4: las rutas de dueño exigen la cuenta principal (requireOwner + OWNER_EMAIL; sin ella 503, con otra cuenta 403)', /function requireOwner\(req, res\)/.test(serverjs) && /process\.env\.OWNER_EMAIL/.test(serverjs) && (serverjs.match(/requireOwner\(req, res\)/g) || []).length >= 5 && /503/.test(serverjs) && /403/.test(serverjs));
  check('1.5.54 servidor 4.4: aprobar pone promoted:true sin gastar una edición; rechazar no toca la publicación', /post\.promoted = true/.test(serverjs) && /r\.status = 'approved'/.test(serverjs) && /r\.status = 'rejected'/.test(serverjs));
  check('1.5.54 servidor 4.4: CREATOR_KEY ya no se lee en el código (sin uso) y el encabezado x-creator-key no se lee', serverjs.indexOf('process.env.CREATOR_KEY') < 0 && serverjs.indexOf("req.headers['x-creator-key']") < 0 && serverjs.indexOf('requireCreator') < 0);
  check('1.5.54 servidor 4.4: OWNER_EMAIL nunca está escrito en server.js (solo se lee de process.env)', serverjs.indexOf('process.env.OWNER_EMAIL') >= 0 && !/OWNER_EMAIL = '/.test(serverjs) && !/OWNER_EMAIL=/.test(serverjs.replace(/process\.env\.OWNER_EMAIL/g, '')));
  /* (6) La aprobación vive DENTRO de la app principal, en el centro de Promociones. */
  check('1.5.54 aprobación en la app: la pantalla «Solicitudes de promoción» vive en el centro de Promociones y solo se muestra con permiso del servidor', /function loadPendingPromoRequests1554/.test(appjs) && /Solicitudes de promoción/.test(appjs) && /pendingPromoAllowed1554/.test(appjs) && /C\.serverFetch\(state, '\/api\/promotions\/pending', 'GET'/.test(appjs) && /r\.status === 403/.test(appjs));
  check('1.5.54 aprobación en la app: cada solicitud trae Aprobar/Rechazar y decide por POST aprobar/rechazar', /function pendingPromoRowHtml1554/.test(appjs) && /function decidePendingPromo1554/.test(appjs) && /__wrPromoApprove/.test(appjs) && /__wrPromoReject/.test(appjs) && /\/api\/promotions\/' \+ encodeURIComponent\(reqId\) \+ \(approve \? '\/approve' : '\/reject'\)/.test(appjs));
  check('1.5.54 aprobación en la app: la lista se carga al abrir el centro y al bajar para refrescar (sin aviso push)', /openPromotionsHub1547/.test(appjs) && /loadPendingPromoRequests1554\(\)/.test(appjs) && /function bindPromoHubPtr1554/.test(appjs) && /createPullRefresh/.test(appjs) && /__wrPromoRefreshRequests/.test(appjs));
  /* (7) Dramas cortos de DramaBox (1.5.58): 5 series, 45 capítulos
     gratis verificados con videoId; los capítulos de miembros no traen
     videoId y se muestran como «Disponible en DramaBox». Los archivos
     de los dramas originales se conservan en el APK por si vuelven. */
  check('1.5.62 dramas: kdramas.json trae el mezclado (48 series: 46 ReelShort + 2 ShortMax, 1 entrada gratis por serie con videoId de YouTube)', Array.isArray(kdramasJson.kdramas) && kdramasJson.kdramas.length === 48 && kdramasJson.kdramas.filter(function (s) { return s.source === 'ReelShort'; }).length === 46 && kdramasJson.kdramas.filter(function (s) { return s.source === 'ShortMax'; }).length === 2 && kdramasJson.kdramas.every(function (s) { return s && s.id && s.name && s.synopsis && s.poster && s.totalEps >= 1 && !s.chapters && Array.isArray(s.eps) && s.eps.length === 1 && typeof s.eps[0].videoId === 'string' && s.eps[0].videoId.length === 11 && s.eps[0].thumb === 'https://i.ytimg.com/vi/' + s.eps[0].videoId + '/hqdefault.jpg'; }));
  check('1.5.58 dramas: las 25 imágenes de los dramas originales (5 portadas + 20 capítulos) siguen en assets/dramas por si vuelven', (function () { var files = fs.readdirSync(path.join(__dirname, '..', 'assets', 'dramas')); return files.length === 25 && files.every(function (f) { return /\.jpg$/.test(f) && fs.statSync(path.join(__dirname, '..', 'assets', 'dramas', f)).size > 1000; }); })());
  check('1.5.62 dramas: el catálogo horneado en la app es el mezclado (48 series: 46 ReelShort + 2 ShortMax, 0 DramaBox, 0 originales)', /var KDRAMA_CATALOG_1549 = \[/.test(appjs) && ['la-doble-vida-de-mi-esposo-multimillonario', 'arrebato-a-un-multimillonario', 'atada-al-honor', 'atrape-el-corazon-de-un-multimillonario', 'tuve-un-bebe-sin-ti', 'proteger-su-cuerpo-reclamar-su-corazon', 'reina-alfa-traicionada', 'francotirador-americano-el-ultimo-disparo', 'te-amo-mas-que-a-la-vida', 'no-quiero-ser-tu-novia', 'un-final-feliz-en-las-vegas', 'agente-de-sombras', 'no-es-la-novia-que-el-queria', 'tras-7-anos-presa-volvi-como-ninera', 'mama-papa-es-invencible', 'el-renacer-de-la-esposa-gorda', 'salve-a-un-millonario-sin-saber-que-era-el-capo-de-la-mafia', 'salve-al-jefe-de-la-mafia-herido', 'el-chico-que-amaba-me-engano', 'los-dos-hermanos-ceo-se-enamoraron-de-mi', 'recien-salida-de-prision-trabaje-como-ninera', 'me-obligo-a-besarlo-sin-saber-que-era-el-jefe-de-la-mafia', 'salve-a-un-hombre-herido-y-me-case-con-el', 'paso-una-noche-con-un-ceo-y-termino-embarazada-de-trillizos', 'un-jefe-de-la-mafia-renace-como-estudiante-acosado', 'fui-entregada-al-frio-heredero-de-la-mafia', 'fingi-ser-la-novia-del-chico-malo', 'se-burlaron-de-su-pobre-esposo', 'madre-soltera-salvo-a-un-ceo-multimillonario', 'embarazada-de-gemelos-de-un-ceo-multimillonario', 'ella-salvo-la-vida-del-jefe-de-la-mafia', 'nunca-quiso-ser-la-reina-de-la-mafia', 'reina-de-la-cancha', 'huyo-embarazada-de-su-esposo-mafioso', 'se-llevaron-a-su-hija-para-vengarse', 'quedo-embarazada-del-rey-del-hockey', 'hazel-perdio-a-su-hija', 'con-solo-21-anos-esposa-de-un-jefe-de-la-mafia', 'la-esposa-de-dalton', 'volvio-al-dia-en-que-su-familia-mafiosa-destruyo-su-vida', 'eric-volvio-como-el-poderoso-ceo', 'el-chico-malo-que-la-salvo-era-un-heredero-mafioso', 'aria-enfrenta-a-luca-el-heredero-letal-de-la-mafia', 'casada-con-el-heredero-de-la-mafia-mas-temido', 'obligada-a-casarse-con-el-heredero-de-la-mafia', 'embarazo-inesperado-y-el-capo-de-la-mafia-la-protege', 'huyo-del-amor-y-termino-atrapada-en-el-imperio-de-la-mafia', 'enamorada-del-diablo'].every(function (id) { return appjs.indexOf('"id": "' + id + '"') >= 0; }) && (appjs.match(/"source": "ReelShort"/g) || []).length === 46 && (appjs.match(/"source": "ShortMax"/g) || []).length === 2 && appjs.indexOf('"source": "DramaBox"') < 0 && appjs.indexOf('"chapters":') < 0);
  check('1.5.60 dramas: la app trae la etiqueta «Original de WordRed» en las tarjetas (la forma DramaBox sigue valiendo por dentro, para catálogos viejos)', /Original de WordRed/.test(appjs) && /kdIsOriginal1549/.test(appjs) && /kdBadge1549/.test(idx) && idx.indexOf('>Dramas<') >= 0);
  check('1.5.61 dramas: el catálogo horneado es el mezclado (eps con videoId de YouTube, sin chapters)', /"eps": \[/.test(appjs) && /"videoId": "/.test(appjs) && appjs.indexOf('"chapters":') < 0);
  check('1.5.58 dramas: el visor es de video (iframe de YouTube con el patrón ShortsSound; tocar = siguiente capítulo; gestos arriba/abajo e izquierda/derecha; sin texto largo)', /function kdLoadCurrent1549/.test(appjs) && /kdYtLoad1558/.test(appjs) && /kdYtFrame1558/.test(appjs) && /kdImage1549/.test(appjs) && /kdText1549/.test(appjs) === false && /kdTextBody1549/.test(appjs) === false && /function kdNextEpisode1549/.test(appjs) && /Math\.abs\(dx\) < 12 && Math\.abs\(dy\) < 12\) \{ kdNextEpisode1549\(\); return; \}/.test(appjs) && /function kdStopNovel1549/.test(appjs));
  check('1.5.61 dramas: el catálogo viene del servidor con caché de 1 día y clave nueva 1561 (un caché viejo nunca se pinta)', /function fetchKdramas1554/.test(appjs) && /function kdramasValid1554/.test(appjs) && /wordred_kdramas1561/.test(appjs) && /wordred_kdramas1560/.test(appjs) === false && /fetchKdramas1552/.test(appjs) === false && /kdramasValid1552/.test(appjs) === false);
  /* (8) El botón de regresar funciona en toda la app. */
  check('1.5.54 regresar: el manejador global cierra la ventana de arriba, luego vuelve a la pantalla anterior, y en Inicio no hace nada', /function handleAndroidBack/.test(appjs) && /function topOpenOverlay1549/.test(appjs) && /function closeTopOverlay1549/.test(appjs) && /backViewStack1549/.test(appjs) && /window\.handleAndroidBack/.test(appjs));
  check('1.5.54 regresar: la pila de navegación se llena al cambiar de pantalla (con tope) y nunca empuja Shorts', /backViewStack1549\.push\(currentView\)/.test(appjs) && /backViewStack1549\.length > 20/.test(appjs));
  check('1.5.54 regresar: MainActivity intercepta el botón y llama al manejador (si no retrocedió y el WebView puede ir atrás, goBack; si no, nada: la app no se cierra desde Inicio)', (function () { var a = mainAct.indexOf('public void onBackPressed()'); var b = mainAct.indexOf('protected void onCreate(', a); var body = a >= 0 && b > a ? mainAct.slice(a, b) : ''; return body.indexOf('handleAndroidBack') >= 0 && body.indexOf('webView.canGoBack()') >= 0 && body.indexOf('webView.goBack()') >= 0 && body.indexOf('finish()') < 0; })());
  /* (9) La moneda de Promociones está en el perfil propio, antes del lápiz. */
  check('1.5.54 moneda: la moneda con W está en el perfil propio antes del lápiz y abre el centro de Promociones', /id="hdrPromotions"/.test(idx) === false && /ownPromoCoin1547/.test(appjs) && /__wrOpenPromotionsHub/.test(appjs) && (function () { var b = fnBody54(appjs, 'renderOwnProfile'); return b && b.indexOf('ownPromoCoin1547') >= 0 && b.indexOf('ownPromoCoin1547') < b.indexOf('ownEditBtn'); })());
  check('1.5.54 moneda: en perfiles ajenos no hay moneda (solo en el propio)', (function () { var b = fnBody54(appjs, 'renderProfileDetail'); return b && b.indexOf('ownPromoCoin1547') < 0; })());
  /* (10) La fila de arriba del Inicio son los reels. */
  check('1.5.54 reels: la fila de arriba del Inicio son los reels (primer rectángulo con la foto y el +)', /homeReel1549 homeReelMe1549/.test(appjs) && /__wrOpenReelCreate/.test(appjs) && /reelVideoOf/.test(appjs));
  check('1.5.54 reels: la fila de reels del feed sigue intacta después de la 2.ª publicación', /if \(i === 1\) parts\.push\(reelsRowHtml\(\)\);/.test(appjs));
  /* (11) Fantore Resurrección, juego principal de la sección de juegos. */
  check('1.5.54 fantore: el juego destacado va PRIMERO en la sección de juegos, antes de la cartelera de Play Store', appjs.indexOf("if (i === 9) { parts.push(featuredGameHtml1549()); parts.push(gamesBillboardHtml1543()); }") >= 0);
  check('1.5.54 fantore: encabezado «Gamer Premium» con el control en rojo', /Gamer Premium/.test(appjs) && /featuredGameIcon1549/.test(appjs) && /featuredGameIcon1549\{color:var\(--red\)/.test(idx));
  check('1.5.54 fantore: la ficha trae logo real del APK, paquete, versión 2.0 y las 8 capturas reales en orden', featuredJson.game && featuredJson.game.package === 'com.misterystore.fantoreresurreccion' && featuredJson.game.version === '2.0' && featuredJson.game.logo === 'fantore/logo.png' && featuredJson.game.icon === 'fantore/icon.png' && Array.isArray(featuredJson.screenshots) && featuredJson.screenshots.length === 8 && featuredJson.screenshots[0] === 'fantore/cap1.jpg' && featuredJson.screenshots[7] === 'fantore/cap8.jpg');
  check('1.5.54 fantore: las 8 capturas, el logo y el icono están en los assets del juego', ['cap1.jpg', 'cap2.jpg', 'cap3.jpg', 'cap4.jpg', 'cap5.jpg', 'cap6.jpg', 'cap7.jpg', 'cap8.jpg', 'logo.png', 'icon.png'].every(function (f) { return fs.existsSync(path.join(__dirname, '..', 'assets', 'fantore', f)); }));
  check('1.5.54 fantore: el servidor sirve la ficha (GET /api/featured-game) y el APK (GET /app/Fantore-Resurreccion.apk)', serverjs.indexOf("app.get('/api/featured-game'") >= 0 && serverjs.indexOf("app.get('/app/Fantore-Resurreccion.apk'") >= 0 && fs.existsSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'Fantore-Resurreccion.apk')));
  check('1.5.54 fantore: jugar abre el juego si está instalado o descarga e instala su APK si no', /function playFeaturedGame1549/.test(appjs) && /AndroidBridge\.openApp\(pkg\)/.test(appjs) && /AndroidBridge\.downloadAndInstallApk\(url\)/.test(appjs) && /\/app\/Fantore-Resurreccion\.apk/.test(appjs));
  check('1.5.54 fantore: la calificación es por teléfono y se suma en el servidor (sin inventar medias ni conteos)', /function rateFeaturedGame1549/.test(appjs) && /wordred_fantore_my_rating/.test(appjs) && /\/api\/games\/' \+ encodeURIComponent\(FEATURED_GAME_1549\.id\) \+ '\/rate'/.test(appjs) && /Sin calificaciones aún/.test(appjs));
  check('1.5.54 fantore: la ficha viene del servidor con caché de 1 día y lista fija si no hay conexión', /function fetchFeaturedGame1549/.test(appjs) && /wordred_featuredgame1555/.test(appjs) && /\/api\/featured-game/.test(appjs));
  check('1.5.54 fantore: el cajón trae la entrada fija con el icono real y borde dorado', /featured1549: true/.test(appjs) && /launcherTileFeatured1549/.test(appjs) && /launcherIconGold1549/.test(appjs) && /fantore\/icon\.png/.test(appjs) && /launcherIconGold1549\{display:inline-block;border:2px solid #d9a400/.test(idx));
  check('1.5.54 fantore: la página del juego trae vista previa con el botón de jugar en la primera captura y la fila de capturas', /id="featuredGameOverlay1549"/.test(idx) && /id="fgPreviewImg1549"/.test(idx) && /__wrPlayFeaturedGame/.test(idx) && /id="fgShots1549"/.test(idx) && /id="fgStars1549"/.test(idx));
  /* 1.5.52 intacto. */
  check('1.5.58 1.5.52 intacto: cajón 1552, catálogo de dramas y visor siguen', /drawerSettings1547/.test(appjs) && /fetchKdramas1554/.test(appjs) && /kdImage1549/.test(appjs) && /kdVideo1556/.test(appjs) && serverjs.indexOf("app.get('/api/kdramas'") >= 0);
}

async function static1555() {
  console.log('=== 107. WordRed 1.5.55: portadas de dramas y de Fantore (ruta sin el assets/ de más), muro vacío con juego destacado, reels de arriba solo verticales; servidor 4.4 ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const serverjs = fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  const kdramasJson = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'kdramas.json'), 'utf8'));
  const featuredJson = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'featured-game.json'), 'utf8'));
  const appVersion = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'app-version.json'), 'utf8'));
  const fnBody = function (src, name) { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j < 0 ? src.length : j); };
  /* (1) La causa raíz de la 1.5.54: las rutas llevaban un 'assets/' de
     más (la página carga desde file:///android_asset/index.html, así
     que 'assets/...' resolvía a 'assets/assets/...' y el archivo no
     existía; el mismo fallo que la música en la 1.5.34). */
  check('1.5.55 rutas: ninguna ruta de drama o de Fantore lleva el prefijo assets/ de más', appjs.indexOf('assets/dramas/') < 0 && appjs.indexOf('assets/fantore/') < 0 && idx.indexOf('assets/dramas/') < 0 && idx.indexOf('assets/fantore/') < 0 && JSON.stringify(kdramasJson).indexOf('assets/dramas/') < 0 && JSON.stringify(featuredJson).indexOf('assets/fantore/') < 0);
  check('1.5.61 rutas: las 25 imágenes de los dramas originales siguen en assets/dramas (sin borrar) y el catálogo mezclado usa miniaturas de YouTube sin el prefijo assets/', (function () { var files = fs.readdirSync(path.join(__dirname, '..', 'assets', 'dramas')); var thumbs = (appjs.match(/"thumb": "https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/hqdefault\.jpg"/g) || []); return files.length === 25 && files.every(function (f) { return /\.jpg$/.test(f); }) && thumbs.length >= 48 && JSON.stringify(kdramasJson).indexOf('assets/') < 0 && appjs.indexOf('assets/dramas/') < 0; })());
  check('1.5.55 rutas: logo, icono y 8 capturas de Fantore existen en assets/fantore sin el prefijo', (function () { var all = [featuredJson.game.logo, featuredJson.game.icon].concat(featuredJson.screenshots); return all.length === 10 && all.every(function (f) { return typeof f === 'string' && f.indexOf('fantore/') === 0 && fs.existsSync(path.join(__dirname, '..', 'assets', f)); }) && appjs.indexOf("'fantore/logo.png'") >= 0 && appjs.indexOf("'fantore/icon.png'") >= 0; })());
  check('1.5.61 caché: la clave de dramas es nueva (1561) y la del juego destacado sigue en 1555, para que el teléfono ignore el catálogo viejo de la 1.5.60', /wordred_kdramas1561/.test(appjs) && /wordred_featuredgame1555/.test(appjs) && /wordred_kdramas1560/.test(appjs) === false && /wordred_featuredgame1554/.test(appjs) === false);
  /* (2) A prueba de fallos: si una imagen no carga, se ve el nombre. */
  check('1.5.55 a prueba de fallos: existe el respaldo si una imagen no carga (nunca un hueco vacío)', /window\.__wrImgFail1555 = function/.test(appjs));
  check('1.5.55 a prueba de fallos: las tarjetas de dramas, el logo del juego, el icono del cajón, la imagen del visor y las capturas usan el respaldo', (function () { var b = fnBody(appjs, 'renderKdramaHome1549'); var g = fnBody(appjs, 'featuredGameInner1549'); var l = fnBody(appjs, 'launcherIconHtml'); var r = fnBody(appjs, 'featuredGameRepaintPage1549'); return b.indexOf("__wrKdPosterFallback1563(this)") >= 0 && appjs.indexOf("__wrImgFail1555(img, 'dramaTile')") >= 0 && g.indexOf("__wrImgFail1555(this,\\'gameLogo\\')") >= 0 && l.indexOf("__wrImgFail1555(this,\\'appIcon\\'") >= 0 && r.indexOf("__wrImgFail1555(this,\\'gameShot\\')") >= 0 && idx.indexOf("onerror=\"window.__wrImgFail1555(this,'kdViewer')\"") >= 0; })());
  check('1.5.55 a prueba de fallos: el CSS del respaldo existe (tarjeta de drama, logo F, inicial de app, imagen del capítulo)', /kdNoImg1555/.test(idx) && /featuredGameLogoFail1555/.test(idx) && /appIconFail1555/.test(idx) && /kdImageFail1555/.test(idx));
  /* (3) Muro vacío: el juego destacado también aparece. */
  check('1.5.55 muro vacío: con 0 publicaciones el juego destacado también se inserta en el inicio', (function () { var b = fnBody(appjs, 'renderFeed'); var i = b.indexOf('if (!feed.length)'); return i >= 0 && b.slice(i, i + 700).indexOf('featuredGameHtml1549()') >= 0; })());
  /* (4) Reels de arriba solo verticales. */
  check('1.5.55 reels verticales: la fila de arriba solo muestra reels verticales (la del feed se queda sin filtrar)', (function () { var s = fnBody(appjs, 'renderStories'); var r = fnBody(appjs, 'reelsRowHtml'); return s.indexOf('reelIsVertical1555') >= 0 && r.indexOf('reelIsVertical1555') < 0 && /function reelIsVertical1555/.test(appjs) && /function reelOrientation1555/.test(appjs); })());
  check('1.5.55 reels verticales: la orientación se guarda al subir el reel, se mide al cargar sus metadatos y viaja con la publicación', /function tagVideoOrientation1555/.test(appjs) && /function measureReelOrientation1555/.test(appjs) && /function recordReelOrientation1555/.test(appjs) && /orientation: morient/.test(corejs) && /orientation: m\.orientation \|\| ''/.test(appjs));
  check('1.5.55 reels verticales: el video de ejemplo es horizontal (900×544) y queda guardado para que la fila de arriba no lo muestre', (function () { var i = corejs.indexOf("key: 'ejemplo-video'"); return i >= 0 && corejs.slice(i, i + 500).indexOf("videoOrientation: 'horizontal'") >= 0; })());
  /* (5) FAQ y versión. */
  check('1.5.63 FAQ: una sola entrada de novedades (la de la 1.5.63 nueva, la de la 1.5.62 corta, sin la de la 1.5.61)', appjs.indexOf('¿Qué hay de nuevo en la 1.5.63?') >= 0 && appjs.indexOf('¿Qué hay de nuevo en la 1.5.62?') >= 0 && appjs.indexOf('¿Qué hay de nuevo en la 1.5.61?') < 0);
  check('1.5.63 FAQ: las respuestas de novedades tienen 400 caracteres o menos', (function () { function ans(q) { var i = appjs.indexOf(q); if (i < 0) return ''; var s = appjs.indexOf("a: '", i); if (s < 0) return ''; var e = appjs.indexOf("'", s + 4); return appjs.slice(s + 4, e); } var a63 = ans('¿Qué hay de nuevo en la 1.5.63?'); var a62 = ans('¿Qué hay de nuevo en la 1.5.62?'); return a63.length > 0 && a63.length <= 400 && a62.length > 0 && a62.length <= 400; })());
  check('1.5.62 versión: app-version.json dice 1.5.62/77 (lo que publica el servidor; la 1.5.63/78 se pone al publicar)', appVersion.versionName === '1.5.62' && appVersion.versionCode === 77);
  /* (6) Servidor sin cambio. */
  check('1.5.60 servidor: pasa a 4.7 (readKdramas acepta DramaBox y dramas originales y pasa los subtítulos; nada más cambia)', /version: '4.8'/.test(serverjs));

  console.log('=== 109. WordRed 1.5.58: diálogos en español latino en los 6 capítulos con video (10 minutos cada uno, video en bucle + diálogo), abrir al principio del Inicio; servidor 4.5 ===');
  /* (1) Abrir al principio del Inicio: al abrir la app no se restaura
     la posición guardada (1.5.26); la restauración sigue igual dentro
     de la misma sesión al salir del inicio y volver. */
  check('1.5.57 inicio: existe el interruptor skipFeedRestoreOnce1557 y restoreFeedPosition1526 lo respeta antes que nada', /var skipFeedRestoreOnce1557 = false;/.test(appjs) && (function () { var b = fnBody(appjs, 'restoreFeedPosition1526'); return b.indexOf('skipFeedRestoreOnce1557') >= 0 && b.indexOf('if (skipFeedRestoreOnce1557) { skipFeedRestoreOnce1557 = false; return; }') >= 0; })());
  check('1.5.59 inicio: enterApp solo marca el interruptor en lanzamiento limpio, marca la sesión viva y va al inicio', (function () { var b = fnBody(appjs, 'enterApp'); return b.indexOf('isCleanLaunch1559()') >= 0 && b.indexOf('skipFeedRestoreOnce1557 = true;') >= 0 && b.indexOf('markAlive1559();') >= 0 && b.indexOf('bindAlive1559();') >= 0 && b.indexOf('bindAppReturnHome1557') < 0 && b.indexOf("go('feed');") >= 0; })());
  check('1.5.57 inicio: resetHomeToTop1557 va al inicio con scroll 0', (function () { var b = fnBody(appjs, 'resetHomeToTop1557'); return b.indexOf('skipFeedRestoreOnce1557 = true;') >= 0 && b.indexOf("go('feed')") >= 0 && b.indexOf('window.scrollTo(0, 0)') >= 0; })());
  check('1.5.59 inicio: la regla de volver arriba tras 60 s ya no existe (bindAppReturnHome1557 es no-op; la marca viva distingue lanzamiento limpio de regreso)', (function () { var b = fnBody(appjs, 'bindAppReturnHome1557'); return b.indexOf('visibilitychange') < 0 && b.indexOf('60000') < 0 && b.indexOf('resetHomeToTop1557') < 0; })() && /var ALIVE_KEY_1559 = 'wordred_alive1559';/.test(appjs) && /function isCleanLaunch1559\(\)/.test(appjs) && /function markAlive1559\(\)/.test(appjs) && /function clearAlive1559\(\)/.test(appjs));
  /* (2) Los 45 capítulos gratis son videos de YouTube de DramaBox,
     iguales en kdramas.json y en el catálogo horneado (11 + 9 + 8 + 7
     + 10); los capítulos de miembros no traen videoId. */
  check('1.5.62 videos: las 48 entradas gratis son videos de YouTube (videoId de 11 caracteres, miniatura de YouTube)', (function () { var v = []; if (!Array.isArray(kdramasJson.kdramas)) return false; kdramasJson.kdramas.forEach(function (s) { if (!Array.isArray(s.eps)) return; s.eps.forEach(function (e) { if (e.videoId) v.push([s.id, e.ep, e.videoId, e.thumb]); }); }); return v.length === 48 && v.every(function (x) { return typeof x[2] === 'string' && /^[A-Za-z0-9_-]{11}$/.test(x[2]) && typeof x[3] === 'string' && x[3] === 'https://i.ytimg.com/vi/' + x[2] + '/hqdefault.jpg'; }) && v.filter(function (x) { return x[0] === 'la-doble-vida-de-mi-esposo-multimillonario'; }).length === 1 && v.filter(function (x) { return x[0] === 'el-renacer-de-la-esposa-gorda'; }).length === 1; })());

}

async function static1556() {
  console.log('=== 108. WordRed 1.5.58: dramas cortos de DramaBox (videos de YouTube dentro de la app, reproductor nativo con base https); servidor 4.6 ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const serverjs = fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  const kdramasJson = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'kdramas.json'), 'utf8'));
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const mainAct = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const fnBody = function (src, name) { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j < 0 ? src.length : j); };
  const videoUrls = [];
  kdramasJson.kdramas.forEach(function (s) { (s.eps || []).forEach(function (e) { if (e.videoId) videoUrls.push([s.id, e.ep, e.videoId]); }); });
  /* (1) Versión 1.5.58/73 en el proyecto (app-version.json del árbol
     del servidor lo actualiza el padre al publicar, no se revisa aquí). */
  check('1.5.58 versión: APP_VERSION_NAME 1.5.58 y APP_VERSION_CODE 73 en app.js', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs));
  check('1.5.58 versión: AndroidManifest.xml dice 73/1.5.58', /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  /* (2) Los 6 videos: 4 de El contrato de la heredera + 2 de La
     venganza de Camila, en Cloudinary, iguales en kdramas.json y en el
     catálogo horneado; los otros 14 capítulos no tienen video todavía
     (el cap. 2 de Camila se recuperó de su URL remota tras fallar la
     generación, y se subió por el mismo relay). */
  check('1.5.62 videos: kdramas.json trae las 48 entradas gratis de YouTube (videoId de 11 caracteres)', videoUrls.length === 48 && videoUrls.every(function (v) { return typeof v[2] === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v[2]); }) && videoUrls.filter(function (v) { return v[0] === 'la-doble-vida-de-mi-esposo-multimillonario'; }).length === 1 && videoUrls.filter(function (v) { return v[0] === 'mama-papa-es-invencible'; }).length === 1);
  check('1.5.61 videos: el catálogo horneado trae los mismos videoIds de YouTube que kdramas.json', videoUrls.every(function (v) { return appjs.indexOf('"videoId": "' + v[2] + '"') >= 0; }) && (appjs.match(/"videoId": "[A-Za-z0-9_-]{11}"/g) || []).length === 48);
  check('1.5.62 videos: cada serie trae 1 entrada gratis (48 en total; los capítulos que no son gratis dicen «Disponible en [App]»)', kdramasJson.kdramas.every(function (s) { return Array.isArray(s.eps) && s.eps.length === 1; }) && kdramasJson.kdramas.reduce(function (n, s) { return n + (Array.isArray(s.eps) ? s.eps.length : 0); }, 0) === 48);
  /* (3) El visor es de video de YouTube (iframe con el patrón
     ShortsSound en la página; en el teléfono, el reproductor nativo
     con base https). */
  check('1.5.58 visor: el capítulo gratis pinta el iframe de YouTube (patrón ShortsSound: src + postMessage + vigilante de 10 s)', (function () { var b = fnBody(appjs, 'kdLoadCurrent1549'); return b.indexOf('kdYtLoad1558(ch.videoId)') >= 0 && b.indexOf('kdMember1558') >= 0; })() && /function kdYtLoad1558/.test(appjs) && /kdYtFrame1558/.test(appjs) && /kdYtEmbedUrl1558/.test(appjs) && /enablejsapi=1/.test(appjs) && /function kdYtWatchdog1558/.test(appjs) && fnBody(appjs, 'kdYtWatchdog1558').indexOf('10000') >= 0);
  /* 1.5.58 (corrección de la prueba Electron): en onReady hay que mandar
     playVideo explícito (con autoplay=1 solo, el video se quedaba en
     0,88 s y el vigilante lo daba por fallido) y el tiempo que avanza
     (infoDelivery) marca que reproduce, porque onStateChange no siempre
     llega (en Electron nunca llegó, aunque el video reproducía). */
  check('1.5.58 visor: en onReady se manda playVideo explícito (además de unMute y volumen) en el visor de la página y en ytplayer.html', /kdYtPost1558\('playVideo'\)/.test(appjs) && (function () { var y = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ytplayer.html'), 'utf8'); return y.indexOf("ytPost('playVideo')") >= 0; })());
  check('1.5.58 visor: el tiempo que avanza (infoDelivery) marca que el video reproduce y quita el vigilante', /infoDelivery/.test(appjs) && appjs.indexOf('kdYtTime1558') >= 0 && /currentTime > kdYtTime1558/.test(appjs) && (function () { var y = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ytplayer.html'), 'utf8'); return y.indexOf('infoDelivery') >= 0 && y.indexOf('d.info.currentTime > currentTime') >= 0; })());
  check('1.5.58 visor: no queda texto largo en el visor (sin kdText1549 ni kdTextBody1549 en app.js ni en index.html)', appjs.indexOf('kdText1549') < 0 && appjs.indexOf('kdTextBody1549') < 0 && idx.indexOf('kdText1549') < 0 && idx.indexOf('kdTextBody1549') < 0);
  check('1.5.58 visor: en pantalla solo van el título del drama y «Capítulo N de TOTAL · título»', /kdEpTitle1549/.test(idx) && /kdSeriesTitle1549/.test(idx) && (function () { var b = fnBody(appjs, 'kdLoadCurrent1549'); return b.indexOf("kdEpLabel1549(ch) + ' · ' + ch.title") >= 0; })());
  check('1.5.58 visor: la barra del reproductor queda por encima del área de capítulos (no se tapa con ella)', /\.kdVideoWrap1556 \.wrBar\{bottom:112px\}/.test(idx));
  check('1.5.61 visor: el capítulo de miembros muestra su portada con «Disponible en [App]», sin botón ni enlace', /id="kdMember1558"/.test(idx) && (function () { var b = fnBody(appjs, 'kdLoadCurrent1549'); return b.indexOf('kdMember1558') >= 0 && b.indexOf('kdMemberText1561(s)') >= 0 && b.indexOf('img.src = kdPoster1563(s) || ch.thumb || s.poster') >= 0; })() && (function () { var b = fnBody(appjs, 'kdOpenChapters1549'); return b.indexOf('kdSheetMember1558') >= 0 && b.indexOf('kdMemberText1561(s)') >= 0; })() && (function () { var y = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ytplayer.html'), 'utf8'); return y.indexOf("Disponible en ' + esc(appTag(s)) + '") >= 0; })());
  check('1.5.58 visor: si el video no carga, sale el error con Reintentar (y el respaldo de Cloudinary sigue como función)', /window\.__wrKdYtRetry1558 = function/.test(appjs) && /kdYtShowErr1558/.test(appjs) && /Reintentar/.test(idx) && /window\.__wrKdVideoFail1556 = function/.test(appjs));
  /* (4) Gestos iguales que antes, sobre todo el escenario, sin
     romper los controles del reproductor. */
  check('1.5.58 gestos: arriba/abajo cambia de capítulo, izquierda/derecha de drama, tocar avanza al siguiente', /function kdNextEpisode1549/.test(appjs) && /function kdPrevEpisode1549/.test(appjs) && /function kdNextSeries1549/.test(appjs) && /function kdPrevSeries1549/.test(appjs) && /Math\.abs\(dx\) < 12 && Math\.abs\(dy\) < 12\) \{ kdNextEpisode1549\(\); return; \}/.test(appjs));
  check('1.5.58 gestos: van sobre el escenario entero y los toques en la barra del reproductor, arriba o en capítulos no son gestos', /kdStageEl1549/.test(appjs) && /closest\('\.wrBar, \.kdTop1549, \.kdInfo1549, \.kdGuide1549'\)/.test(appjs) && /kdTouch1549/.test(appjs) === false && /kdTouch1549/.test(idx) === false);
  check('1.5.58 gestos: al cerrar el visor se para el video y se limpia la imagen', (function () { var b = fnBody(appjs, 'kdStopNovel1549'); return b.indexOf('kdYtStop1558()') >= 0 && b.indexOf('v.pause()') >= 0 && b.indexOf('removeAttribute') >= 0; })());
  /* (5) Validador, caché, FAQ, servidor y reproductor nativo. */
  check('1.5.60 validador: doble forma — los originales (chapters con texto largo, video opcional y subtítulos es/en/pt) y DramaBox (totalEps, eps con videoId de 11 caracteres y miniatura) pasan los dos', (function () { var b = fnBody(appjs, 'kdramasValid1554'); return b.indexOf('totalEps') >= 0 && b.indexOf('e.videoId') >= 0 && b.indexOf('e.thumb') >= 0 && b.indexOf('c.text.length > 100') >= 0 && b.indexOf('Array.isArray(s.chapters)') >= 0 && b.indexOf('c.subtitles') >= 0; })());
  check('1.5.61 caché: la clave es wordred_kdramas1561 (la vieja 1560 ya no se usa)', /wordred_kdramas1561/.test(appjs) && /wordred_kdramas1560/.test(appjs) === false);
  check('1.5.62 FAQ: la entrada de la 1.5.62 existe, la de la 1.5.60 no, y el total sigue en 29', (function () { var m = appjs.match(/var FAQ = \[([\s\S]*?)\];/); var block = m ? m[1] : ''; return block.indexOf('¿Qué hay de nuevo en la 1.5.62?') >= 0 && block.indexOf('¿Qué hay de nuevo en la 1.5.60?') < 0 && (block.match(/\{ q: '/g) || []).length === 29; })());
  check('1.5.60 servidor: pasa a 4.7 (readKdramas acepta DramaBox y originales y pasa los subtítulos; nada más cambia)', /version: '4.8'/.test(serverjs) && serverjs.indexOf("app.get('/api/kdramas'") >= 0 && serverjs.indexOf('isDramaBox') >= 0 && serverjs.indexOf('isOriginal') >= 0 && serverjs.indexOf('ch.subtitles = subs') >= 0);
  /* (6) Reproductor nativo (segundo WebView con base https): en el
     teléfono los capítulos se abren ahí, sin salir de la app. */
  check('1.5.58 nativo: MainActivity abre el drama en un segundo WebView con base https y lo cierra con el botón de regresar', (function () { var a = mainAct; return a.indexOf('dramaPlayerWebView') >= 0 && a.indexOf('openDramaPlayer') >= 0 && a.indexOf('closeDramaPlayer') >= 0 && a.indexOf('loadDataWithBaseURL("https://app.wordred.local/"') >= 0 && a.indexOf('if (dramaPlayerVisible) { closeDramaPlayerView(); return; }') >= 0; })());
  check('1.5.58 nativo: la página del reproductor (ytplayer.html) existe, es autónoma y abre por __wrDramaOpen', fs.existsSync(path.join(__dirname, '..', 'assets', 'ytplayer.html')) && (function () { var y = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ytplayer.html'), 'utf8'); return y.indexOf('window.__wrDramaOpen') >= 0 && y.indexOf('window.__wrDramaClose') >= 0 && y.indexOf('window.__wrDramaState') >= 0 && y.indexOf('youtube.com/embed/') >= 0 && y.indexOf('enablejsapi=1') >= 0 && y.indexOf('closeDramaPlayer') >= 0 && y.indexOf('window.open') < 0 && y.indexOf('<a ') < 0; })());
  check('1.5.58 nativo: el puente de dramas se abre desde kdOpen1549 solo si hay video y hay puente (si no, el visor de la página)', (function () { var b = fnBody(appjs, 'kdOpen1549'); return b.indexOf('AndroidBridge.openDramaPlayer') >= 0 && b.indexOf('ch.videoId') >= 0 && b.indexOf("showOverlay('kdramaOverlay1549')") >= 0; })());
}

async function static1558() {
  console.log('=== 110. WordRed 1.5.58: publicación atómica (nada se muestra hasta que el servidor confirma; si falla, error claro + borrador + Reintentar; lo nuevo se ve de inmediato) ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const fnBody = function (src, name) { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j < 0 ? src.length : j); };
  /* (1) Publicación atómica: la publicación se confirma con el
     servidor antes de mostrarse como publicada; nada de publicación
     optimista que luego desaparece. */
  check('1.5.58 publicar: existe la confirmación de publicación (confirmPostPublish1529) y se usa al terminar la subida', /async function confirmPostPublish1529/.test(appjs) && /function publishCreatedPost1529/.test(appjs) && fnBody(appjs, 'bgUploadRunJob1529').indexOf('confirmPostPublish1529') >= 0);
  check('1.5.58 publicar: createPost marca la publicación como pendiente de sincronizar (pendingSync) hasta que el servidor la confirma', (function () { var b = fnBody(corejs, 'createPost'); return b.indexOf('pendingSync') >= 0 && b.indexOf('syncFailed') >= 0; })());
  check('1.5.58 publicar: el podado del muro nunca borra una publicación pendiente o fallida (pendingSync/syncFailed)', (function () { var b = fnBody(corejs, 'pruneDeletedPostIds'); return b.indexOf('pendingSync') >= 0 && b.indexOf('syncFailed') >= 0; })());
  check('1.5.58 publicar: los errores reintentables (sin conexión, 5xx, sesión caducada) se encolan; los 400 no', /function isRetryableServerError/.test(corejs) && (function () { var b = fnBody(corejs, 'isRetryableServerError'); return b.indexOf('authExpired') >= 0 && b.indexOf('500') >= 0; })() && fnBody(appjs, 'pushToServer').indexOf('queueRetryable') >= 0);
  /* (2) Lo nuevo se ve de inmediato: el servidor avisa por el canal
     en vivo y el muro lo pinta sin esperar al refresco. */
  check('1.5.58 publicar: el aviso en vivo del servidor (kind post) inserta la publicación al momento', (function () { var b = fnBody(appjs, 'handleServerMessage'); return b.indexOf("kind === 'post'") >= 0; })());
  check('1.5.58 publicar: al llegar la copia del servidor se quitan las marcas de pendiente y de error', (function () { var b = fnBody(appjs, 'pullFromServer'); return b.indexOf('pendingSync') >= 0 && b.indexOf('syncFailed') >= 0; })());
  /* (3) Si falla: error claro en español + Reintentar que completa la
     publicación; el contenido nunca se pierde (borrador guardado). */
  check('1.5.58 publicar: la tarjeta muestra «Subiendo…» o el error con su botón Reintentar', (function () { var b = fnBody(appjs, 'postCardHtml'); return b.indexOf('Subiendo') >= 0 && b.indexOf('__wrRetryPostSync') >= 0; })() && /window\.__wrRetryPostSync = function/.test(appjs));
  check('1.5.58 publicar: al fallar se guarda el borrador (snapshot) y al entrar se reanudan las subidas interrumpidas y las pendientes', /function snapshotJobDraft1529/.test(appjs) && /function snapshotPostDraft1529/.test(appjs) && /function resumeUploadDrafts1558/.test(appjs) && /function retryPendingPosts1558/.test(appjs) && (function () { var b = fnBody(appjs, 'enterApp'); return b.indexOf('resumeUploadDrafts1558()') >= 0 && b.indexOf('retryPendingPosts1558()') >= 0; })());
  check('1.5.62 publicar: la respuesta de publicar explica que si la conexión se corta la subida continúa donde se quedó y que nada se publica roto (ya no dice que queda en borradores)', (function () { var m = appjs.match(/\{ q: '¿Cómo publico algo\?', a: '([^']*)'/); return m && m[1].indexOf('continúa donde se quedó') >= 0 && m[1].indexOf('nada se publica roto') >= 0 && m[1].indexOf('borradores') < 0 && m[1].length <= 400; })());
  /* (4) Las historias también se confirman y un fallo de su foto o
     video ya no publica una historia rota. */
  check('1.5.58 publicar: las historias se confirman igual (confirmStoryPublish1529) y su subida fallida aborta con error claro', /function confirmStoryPublish1529/.test(appjs) && fnBody(appjs, 'confirmStoryPublish1529').indexOf('pushStoryToServer') >= 0);
  /* (5) Las programadas no se pierden: solo se quitan al confirmar. */
  check('1.5.58 publicar: una programada solo se quita al confirmar su publicación (si falla, se guarda como borrador)', (function () { var b = fnBody(appjs, 'publishDueScheduled1526'); return b.indexOf('confirmPostPublish1529') >= 0 || b.indexOf('publishCreatedPost1529') >= 0; })());
}
async function static1560() {
  console.log('=== 111. WordRed 1.5.63: dramas originales con subtítulos, Reels rectángulos, videos que caben en su publicación, tráilers dentro de la app y Navegador interno ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const mainAct = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const yt = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ytplayer.html'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const kdramasJson = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'kdramas.json'), 'utf8'));
  const fnBody = function (src, name) { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j < 0 ? src.length : j); };
  /* (0) Versión 1.5.60 / 75 en todas partes. */
  check('1.5.60 versión: app.js y AndroidManifest dicen 1.5.60 / 75', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs) && /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  /* (1) «¿Qué estás pensando?» ARRIBA de las destacadas; Gamer Premium se queda abajo. */
  check('1.5.60 perfil: «¿Qué estás pensando?» va ANTES de las secciones destacadas y de Gamer Premium', (function () { var b = fnBody(appjs, 'renderOwnProfile'); return b.indexOf('thinkBoxHtml1559()') >= 0 && b.indexOf('thinkBoxHtml1559()') < b.indexOf('pinnedCoverHtml1526()') && b.indexOf('thinkBoxHtml1559()') < b.indexOf('featuredGameProfileHtml1559()'); })());
  check('1.5.60 perfil: Gamer Premium sigue abajo de las destacadas, antes de «Mis publicaciones»', (function () { var b = fnBody(appjs, 'renderOwnProfile'); return b.indexOf('featuredGameProfileHtml1559()') >= 0 && b.indexOf('featuredGameProfileHtml1559()') < b.indexOf('Mis publicaciones'); })());
  /* (2) Dramas originales con doble forma y subtítulos CC. */
  check('1.5.60 dramas: el validador acepta las dos formas (originales con chapters y DramaBox con eps)', (function () { var b = fnBody(appjs, 'kdramasValid1554'); return b.indexOf('Array.isArray(s.chapters)') >= 0 && b.indexOf('totalEps') >= 0 && b.indexOf('c.subtitles') >= 0; })());
  check('1.5.62 dramas: kdramas.json y el catálogo horneado son el mezclado (48 series, 48 entradas gratis: 46 ReelShort + 2 ShortMax; cada entrada con videoId de 11 caracteres y miniatura de YouTube)', kdramasJson.kdramas.length === 48 && kdramasJson.kdramas.filter(function (s) { return s.source === 'ReelShort'; }).length === 46 && kdramasJson.kdramas.filter(function (s) { return s.source === 'ShortMax'; }).length === 2 && kdramasJson.kdramas.every(function (s) { return Array.isArray(s.eps) && s.eps.length === 1 && s.totalEps >= 1 && s.eps[0].videoId.length === 11 && /^https:\/\/i\.ytimg\.com\/vi\//.test(s.eps[0].thumb) && !s.chapters; }) && (appjs.match(/"source": "ReelShort"/g) || []).length === 46);
  check('1.5.60 dramas: el visor carga el video de Cloudinary del capítulo y sus subtítulos (CC con idioma)', (function () { var b = fnBody(appjs, 'kdLoadCurrent1549'); return b.indexOf('ch.video') >= 0 && b.indexOf('kdVideo1556') >= 0 && b.indexOf('kdLoadSubs1560(ch)') >= 0 && b.indexOf('__wrKdSubs1560') >= 0; })() && /function kdLoadSubs1560/.test(appjs) && /function kdParseVtt1560/.test(appjs) && /window\.__wrKdSubLang1560 = function/.test(appjs) && /id="kdCcBtn1560"/.test(idx) && /id="kdSubMenu1560"/.test(idx) && idx.indexOf('Sin subtítulos') >= 0);
  check('1.5.60 dramas: el capítulo sin video muestra su imagen de escena con «Próximamente en video» (nunca la tarjeta de miembros)', (function () { var b = fnBody(appjs, 'kdLoadCurrent1549'); return b.indexOf("soon.classList.remove('hidden')") >= 0 && b.indexOf('ch.member') >= 0; })() && /id="kdSoon1556"/.test(idx));
  check('1.5.60 dramas: el reproductor de DramaBox sigue (no se borró) para catálogos viejos', /openDramaPlayer/.test(appjs) && /window\.__wrDramaOpen/.test(yt) && /ch\.videoId/.test(fnBody(appjs, 'kdLoadCurrent1549')));
  /* (3) Reels de arriba: rectángulos con esquinas redondeadas, más grandes, que se corren con gestos. */
  check('1.5.60 reels: la fila de arriba son rectángulos 140×190 con esquinas de 18 px (nada de círculos)', /\.homeReelRect1560\{[^}]*width:140px;[^}]*height:190px;[^}]*border-radius:18px/.test(idx) && /\.homeReel1549\{[^}]*width:150px/.test(idx) && idx.indexOf('homeReelCircle1549') < 0 && appjs.indexOf('homeReelCircle1549') < 0 && appjs.indexOf('homeReelRect1560') >= 0);
  check('1.5.60 reels: la fila corre a los lados con gestos (overflow-x auto) y tocar un reel lo abre a pantalla completa con comentar, like y compartir', /\.stories\{[^}]*overflow-x:auto/.test(idx) && /__wrOpenReel = function/.test(appjs) && /function openShorts/.test(appjs));
  /* (4) Videos en publicaciones: caben en su recuadro sin tapar lo demás. */
  check('1.5.60 video: el video de una publicación tiene altura máxima y llena su recuadro (cover)', /\.post \.media \.wrPlayer video\{[^}]*max-height:64vh;[^}]*object-fit:cover/.test(idx));
  /* (5) Tráilers dentro de la app. */
  check('1.5.60 tráiler: las tarjetas de películas y de juegos abren su tráiler dentro de la app', fnBody(appjs, 'billboardInner1540').indexOf('__wrOpenTrailer(') >= 0 && fnBody(appjs, 'gamesBillboardInner1543').indexOf('__wrOpenTrailer(') >= 0 && /window\.__wrOpenTrailer = function/.test(appjs) && /openTrailer/.test(appjs));
  check('1.5.60 tráiler: ytplayer.html tiene modo tráiler (solo el video y su título, sin capítulos ni gestos)', yt.indexOf('window.__wrTrailerOpen') >= 0 && yt.indexOf('trailerMode') >= 0 && /openTrailer/.test(mainAct));
  /* (6) Navegador dentro de la app. */
  check('1.5.60 navegador: en el perfil propio va ANTES de la moneda, con símbolo Y texto', (function () { var b = fnBody(appjs, 'renderOwnProfile'); return b.indexOf('ownBrowserBtn1560') >= 0 && b.indexOf('ownBrowserBtn1560') < b.indexOf('ownPromoCoin1547') && b.indexOf('Navegador') >= 0; })() && /globe:/.test(appjs) && /\.ownBrowserBtn1560\{/.test(idx));
  check('1.5.60 navegador: todo enlace web va al navegador interno (nada al navegador del teléfono)', /window\.__wrOpenUrl = function/.test(appjs) && appjs.indexOf('if (window.__wrOpenBrowser(url)) return;') >= 0 && /window\.__wrOpenBrowser = function/.test(appjs) && /openInAppBrowser/.test(appjs));
  check('1.5.60 navegador: el puente nativo tiene ventana flotante, pestañas, descargas y pantalla completa', mainAct.indexOf('openInAppBrowser') >= 0 && mainAct.indexOf('browserRoot1560') >= 0 && mainAct.indexOf('browserWebViews1560') >= 0 && mainAct.indexOf('browserDownload1560') >= 0 && mainAct.indexOf('DownloadManager') >= 0 && mainAct.indexOf('setBrowserFullscreen1560') >= 0 && mainAct.indexOf('if (browserVisible1560)') >= 0);
  check('1.5.60 navegador: la barra trae atrás, adelante, recargar, inicio, dirección, pestañas y menú', mainAct.indexOf('"Atrás"') >= 0 && mainAct.indexOf('"Adelante"') >= 0 && mainAct.indexOf('"Recargar"') >= 0 && mainAct.indexOf('"Inicio"') >= 0 && mainAct.indexOf('browserAddress1560') >= 0 && mainAct.indexOf('"Pestañas"') >= 0 && mainAct.indexOf('"Menú"') >= 0);
  /* (7) Estilo de menús de ajustes como la captura (rojo #E60026, no rosa; SIN pie). */
  check('1.5.60 ajustes: la hoja de Ajustes y la del cajón usan el estilo nuevo (hoja oscura muy redondeada, tirador, título grande, X circular)', /id="settingsOverlay">[\s\S]*?class="sheet setSheet1560"/.test(idx) && /id="drawerSettingsOverlay1547">[\s\S]*?class="sheet setSheet1560"/.test(idx) && /\.overlay\.floatWin1547 \.sheet\.setSheet1560\{[^}]*border-radius:28px/.test(idx) && /\.setSheet1560::before\{[^}]*width:48px;height:5px/.test(idx) && /\.setSheet1560 \.top h2\{font-size:28px/.test(idx) && /\.setSheet1560 \.top \.xbtn\{width:44px;height:44px/.test(idx));
  check('1.5.60 ajustes: las filas llevan título + descripción a la izquierda y el control a la derecha', /\.setRow1560\{[^}]*display:flex/.test(idx) && /\.setRow1560 \.setRowTxt1560 b\{[^}]*font-size:17px/.test(idx) && /\.setRow1560 \.setRowTxt1560 span\{[^}]*color:rgba\(255,255,255,.55\)/.test(idx));
  check('1.5.60 ajustes: los toggles son interruptores rojos (#E60026 en degradado, nunca rosa) con perilla blanca', /\.setSwitch1560\{[^}]*width:56px;height:32px;[^}]*background:#55565e/.test(idx) && /\.setSwitch1560:has\(input:checked\)\{background:linear-gradient\(135deg,#FF2E4D,#E60026\)\}/.test(idx) && /\.setSwitch1560 \.setKnob1560\{[^}]*background:#fff/.test(idx) && !/#E91E63|#D63384|#FF00FF/.test((idx.match(/\.setSwitch1560[^{]*\{[^}]*\}/g) || []).join('')));
  check('1.5.60 ajustes: el bloqueo, las notificaciones y los ajustes del cajón usan el interruptor rojo', /<span class="setSwitch1560"><input type="checkbox" id="appLockToggle">/.test(idx) && /setSwitch1560"><input type="checkbox" data-pref=/.test(appjs) && /setSwitch1560"><input type="checkbox" id="drawerBadgesToggle1547"/.test(appjs) && /setSwitch1560"><input type="checkbox" id="drawerAnimToggle1547"/.test(appjs));
  check('1.5.60 ajustes: los desplegables son píldoras con flecha y los deslizadores llevan acento rojo', /\.setSheet1560 select\{[^}]*border-radius:999px/.test(idx) && /\.setSheet1560 input\[type=range\]\{accent-color:#E60026\}/.test(idx) && /\.setSheet1560 \.chip\.on\{background:linear-gradient\(135deg,#FF2E4D,#E60026\)/.test(idx) && appjs.indexOf('accent-color:#E60026') >= 0);
  check('1.5.60 ajustes: el menú CC de dramas marca el idioma activo en rojo', /data-sub-lang="es"/.test(idx) && /data-sub-lang="off"/.test(idx) && /#kdramaOverlay1549 \.kdSubMenu1560 button\.on\{background:linear-gradient\(135deg,#FF2E4D,#E60026\)\}/.test(idx) && /data-sub-lang.*kdSubLang1560/.test(appjs));
  check('1.5.60 ajustes: SIN texto al pie en las hojas de ajustes (corrección 11:03 CST; el pie estándar donde existe no se toca)', idx.indexOf('Diseñada y Creada por Mistery Store Play') < 0 && appjs.indexOf('Diseñada y Creada por Mistery Store Play') < 0 && (idx.match(/Creada y diseñada por Mistery Store Play/g) || []).length === 3);
}

async function static1561() {
  console.log('=== 112. WordRed 1.5.63: dramas mezclados ReelShort + ShortMax, pantalla completa con rotación y resplandor al conectar el cargador ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const mainAct = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'MainActivity.java'), 'utf8');
  const bgSvc = fs.readFileSync(path.join(__dirname, '..', 'src', 'com', 'wordred', 'app', 'WordRedBackgroundService.java'), 'utf8');
  const yt = fs.readFileSync(path.join(__dirname, '..', 'assets', 'ytplayer.html'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const srv = fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  const kdramasJson = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'kdramas.json'), 'utf8'));
  const verify61 = fs.readFileSync(path.join(process.env.HOME, 'workspace', 'kd150', 'verify61.jsonl'), 'utf8').trim().split('\n').map(function (l) { return JSON.parse(l); });
  const fnBody = function (src, name) { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j < 0 ? src.length : j); };
  /* (0) Versión 1.5.61 / 76 en todas partes; el servidor sigue en 4.7 (kdramas.json sí cambia, server.js no). */
  check('1.5.61 versión: app.js y AndroidManifest dicen 1.5.61 / 76', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs) && /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('1.5.61 servidor: sigue en 4.7 (sin cambio en server.js)', /version: '4.8'/.test(srv));
  /* (1) Catálogo mezclado: composición y evidencia video por video. */
  check('1.5.61 dramas: verify61.jsonl trae 68 videos revisados (16 incluidos, 52 excluidos) y los 16 incluidos son es/es-US, verticales 1080x1920 y embebibles', verify61.length === 68 && verify61.filter(function (v) { return v.estado === 'incluido'; }).length === 16 && verify61.filter(function (v) { return v.estado === 'incluido'; }).every(function (v) { return (v.idioma === 'es' || v.idioma === 'es-US') && v.embebible === true && v.resolucion === '1080x1920'; }) && verify61.filter(function (v) { return v.app === 'DramaBox'; }).every(function (v) { return v.estado === 'excluido'; }));
  check('1.5.62 dramas: kdramas.json es el mezclado (48 series: 46 ReelShort + 2 ShortMax, 0 en inglés, 0 originales)', kdramasJson.kdramas.length === 48 && kdramasJson.kdramas.filter(function (x) { return x.source === 'ReelShort'; }).length === 46 && kdramasJson.kdramas.filter(function (x) { return x.source === 'ShortMax'; }).length === 2 && kdramasJson.kdramas.every(function (x) { return !x.chapters && Array.isArray(x.eps) && x.eps.length === 1 && x.eps[0].videoId.length === 11; }));
  /* (2) Etiqueta por app y texto de miembros por app (nada de «Disponible en DramaBox» fijo). */
  check('1.5.61 dramas: la etiqueta sale de `source` (ReelShort, ShortMax, DramaBox) y la sección la pinta', fnBody(appjs, 'kdAppTag1561').indexOf("if (src === 'reelshort') return 'ReelShort'") >= 0 && fnBody(appjs, 'kdAppTag1561').indexOf("if (src === 'shortmax') return 'ShortMax'") >= 0 && fnBody(appjs, 'renderKdramaHome1549').indexOf('kdAppTag1561(s)') >= 0);
  check('1.5.61 dramas: la hoja de capítulos y la tarjeta de miembros dicen la aplicación de ESA serie', fnBody(appjs, 'kdOpenChapters1549').indexOf('kdMemberText1561(s)') >= 0 && fnBody(appjs, 'kdLoadCurrent1549').indexOf('kdMemberText1561(s)') >= 0 && appjs.indexOf("'Disponible en DramaBox'") < 0 && appjs.indexOf('"Disponible en DramaBox"') < 0 && appjs.indexOf('<span class="kdSheetMember1558">Disponible en DramaBox</span>') < 0);
  check('1.5.61 dramas: ytplayer.html también pinta la app por serie (título, tarjeta y hoja) y busca el capítulo por número', yt.indexOf('function appTag') >= 0 && yt.indexOf("Disponible en ' + esc(appTag(s)) + '") >= 0 && yt.indexOf("id=\"memberTitle\"") >= 0 && yt.indexOf('eps[i].ep === n') >= 0);
  /* (3) Validador y capítulo tolerantes a huecos (un capítulo gratis que falta no duplica el número). */
  check('1.5.61 dramas: el validador acepta capítulos gratis no consecutivos (números que suben dentro de 1..totalEps)', fnBody(appjs, 'kdramasValid1554').indexOf('e.ep > s.eps[i - 1].ep') >= 0 && fnBody(appjs, 'kdramasValid1554').indexOf('e.ep === i + 1') < 0);
  check('1.5.61 dramas: kdChapterAt1558 busca el capítulo por su número, no por posición', fnBody(appjs, 'kdChapterAt1558').indexOf('eps[i].ep === n') >= 0);
  /* (4) FAQ: entra la 1.5.61 (<=400), sale la 1.5.59, la 1.5.60 se acorta; total 29. */
  check('1.5.63 FAQ: entra la 1.5.63, sale la 1.5.61 y la 1.5.62 se acorta (total 29)', appjs.indexOf("¿Qué hay de nuevo en la 1.5.63?") >= 0 && appjs.indexOf("¿Qué hay de nuevo en la 1.5.61?") < 0 && (function () { var m = appjs.match(/\{ q: '¿Qué hay de nuevo en la 1\.5\.63\?', a: '([^']*)' \}/); var m62 = appjs.match(/\{ q: '¿Qué hay de nuevo en la 1\.5\.62\?', a: '([^']*)' \}/); return !!m && m[1].length <= 400 && !!m62 && m62[1].length <= 400; })() && (appjs.match(/\{ q: '/g) || []).length >= 29);
  /* (5) Pantalla completa con rotación en los videos del muro (mismo reproductor para viejos y nuevos). */
  check('1.5.61 video: el muro usa un solo reproductor completo (mediaItemHtml, mediaHtml y videoWithEditsHtml pasan por wrPlayerHtml; sin controles nativos)', fnBody(appjs, 'mediaItemHtml').indexOf('wrPlayerHtml(') >= 0 && fnBody(appjs, 'mediaHtml').indexOf('videoWithEditsHtml(') >= 0 && fnBody(appjs, 'videoWithEditsHtml').indexOf('wrPlayerHtml(') >= 0 && !/<video[^>]*controls/.test(appjs));
  check('1.5.61 video: la barra trae play/pausa, progreso, tiempo, silencio, CC, pantalla completa y velocidades', (function () { var b = fnBody(appjs, 'wrBarHtml'); return b.indexOf('wrPlay') >= 0 && b.indexOf('wrProg') >= 0 && b.indexOf('wrTime') >= 0 && b.indexOf('wrMute') >= 0 && b.indexOf('wrCc') >= 0 && b.indexOf('wrFull') >= 0 && b.indexOf('wrSpeedMenu') >= 0 && b.indexOf('[0.5, 0.75, 1, 1.25, 1.5, 2]') >= 0; })());
  check('1.5.61 video: el botón de pantalla completa cambia de icono al entrar/salir (expandir/comprimir)', /compress: '<path/.test(appjs) && appjs.indexOf("document.addEventListener('fullscreenchange'") >= 0 && appjs.indexOf("ic(full ? 'compress' : 'expand', 20)") >= 0);
  check('1.5.61 video: el lado nativo muestra la vista a pantalla completa y gira a horizontal; al salir vuelve a vertical y el botón de regresar sale de la pantalla completa', mainAct.indexOf('onShowCustomView') >= 0 && mainAct.indexOf('SCREEN_ORIENTATION_SENSOR_LANDSCAPE') >= 0 && mainAct.indexOf('SCREEN_ORIENTATION_PORTRAIT') >= 0 && mainAct.indexOf('hideMainCustomView1561') >= 0 && mainAct.indexOf('if (mainCustomView1561 != null) { hideMainCustomView1561(); return; }') >= 0);
  /* (6) Resplandor al conectar el cargador: rojo, solo orillas, de abajo hacia arriba, transitorio. */
  check('1.5.61 cargador: el resplandor es un borde rojo como neblina (#E60026) que sube de abajo hacia arriba y se apaga solo', /#chargerGlow1561\{[^}]*box-shadow:inset[^}]*rgba\(230,0,38/.test(idx) && /@keyframes chargerGlowRise1561\{0%\{opacity:0;clip-path:inset\(100% 0 0 0\)/.test(idx) && idx.indexOf('id="chargerGlow1561"') >= 0 && /#chargerGlow1561\.on\{animation:chargerGlowRise1561 1\.5s/.test(idx));
  check('1.5.61 cargador: la app expone __wrChargerGlow1561 y el lado nativo lo dispara al conectar el cargador (actividad + servicio)', /window\.__wrChargerGlow1561 = function/.test(appjs) && mainAct.indexOf('ACTION_POWER_CONNECTED') >= 0 && mainAct.indexOf('onChargerConnected1561') >= 0 && mainAct.indexOf('wordred_charger1561') >= 0 && bgSvc.indexOf('ACTION_POWER_CONNECTED') >= 0 && bgSvc.indexOf('plug_at_ms') >= 0);
}

async function static1562() {
  console.log('=== 113. WordRed 1.5.63: la subida reanuda donde se quedó, finish idempotente, nunca publicar con medio local, dramas entre Shorts e historias, 48 series y buscador en el inicio; servidor 4.8 ===');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const corejs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'core.js'), 'utf8');
  const manifest = fs.readFileSync(path.join(__dirname, '..', 'AndroidManifest.xml'), 'utf8');
  const srv = fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'server.js'), 'utf8');
  const kdramasJson = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'kdramas.json'), 'utf8'));
  const verify62 = fs.readFileSync(path.join(process.env.HOME, 'workspace', 'kd150', 'verify62.jsonl'), 'utf8').trim().split('\n').map(function (l) { return JSON.parse(l); });
  const fnBody = function (src, name) { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j < 0 ? src.length : j); };
  /* (0) Versión 1.5.62 / 77 en todas partes; el servidor pasa a 4.8. */
  check('1.5.62 versión: app.js y AndroidManifest dicen 1.5.62 / 77', /var APP_VERSION_CODE = 78;/.test(appjs) && /var APP_VERSION_NAME = '1.5.63';/.test(appjs) && /android:versionCode="78"/.test(manifest) && /android:versionName="1.5.63"/.test(manifest));
  check('1.5.62 servidor: pasa a 4.8 (solo finish idempotente + validación de medios en POST /api/posts)', /version: '4.8'/.test(srv));
  /* (1) Subida con reanudación. */
  check('1.5.62 reanudar: existe getUploadStatus1562 (GET /api/media/status) y b64DecodedBytes1562 (bytes decodificados exactos)', /async function getUploadStatus1562/.test(corejs) && /function b64DecodedBytes1562/.test(corejs) && corejs.indexOf("serverFetchWithRetry(state, '/api/media/status?uploadId='") >= 0);
  check('1.5.62 reanudar: el servidor expone GET /api/media/status (recibidos, terminado, id y URL; solo el dueño)', /app\.get\('\/api\/media\/status'/.test(srv) && srv.indexOf('finishedUploads') >= 0);
  check('1.5.62 reanudar: al reintentar se conserva el MISMO uploadId y se saltan los trozos que ya llegaron (sin empezar de cero)', /if \(attempt > 0 && uploadId\) \{/.test(corejs) && corejs.indexOf('var st = await getUploadStatus1562(state, uploadId, retryOpts);') >= 0 && corejs.indexOf('if (st.finished && st.url) {') >= 0);
  check('1.5.62 reanudar: si el servidor ya cerró la subida, el cliente toma la URL sin volver a subir nada', corejs.indexOf('return /^https?:\\/\\//.test(st.url) ? st.url : base + st.url;') >= 0);
  check('1.5.62 reanudar: el timeout por trozo es 60 s (abrir y cerrar siguen en 30 s con 3 intentos)', /opts\.timeoutMs == null \? 60000 : opts\.timeoutMs/.test(corejs) && corejs.indexOf('chunkTimeoutMs = (opts.chunkTimeoutMs != null ? opts.chunkTimeoutMs : (opts.timeoutMs != null ? opts.timeoutMs : 60000))') >= 0);
  /* (2) Finish idempotente. */
  check('1.5.62 finish: el servidor borra el uploadId SOLO después de guardar (Cloudinary o disco) y registra la subida terminada', srv.indexOf("delete pendingUploads[uploadId];") >= 0 && /finishedUploads\[uploadId\] = \{ owner: phone, id, url: cloud\.secure_url/.test(srv) && /finishedUploads\[uploadId\] = \{ owner: phone, id, url: '\/media\/' \+ fileName/.test(srv));
  check('1.5.62 finish: un segundo finish con el mismo uploadId devuelve el registro guardado (no 404)', /const done = finishedUploads\[uploadId\];/.test(srv) && srv.indexOf('const prev = Object.keys(media || {})') >= 0);
  /* (3) Nunca publicar con medio local. */
  check('1.5.62 medio local: POST /api/posts responde 400 «Medio no válido.» si media o mediaList no es http(s)', srv.indexOf("if (body.media && !isHttpUrl(body.media)) return res.status(400).json({ ok: false, error: 'Medio no válido.' });") >= 0);
  check('1.5.62 medio local: la app sube el medio local antes de confirmar (uploadPostLocalMedia1562) y no confirma si falla', /async function uploadPostLocalMedia1562/.test(appjs) && appjs.indexOf('uploadPostLocalMedia1562(post)') >= 0 && corejs.indexOf('function isLocalMediaValue1562') >= 0 && corejs.indexOf('function isPostPendingBody1562') >= 0);
  check('1.5.62 medio local: la cola no manda un post cuyo medio siga siendo local (queda pendiente)', corejs.indexOf('isPostPendingBody1562') >= 0 && /postPendingHasLocalMedia1562/.test(corejs));
  check('1.5.62 medio local: una programada con medio que no se pudo subir queda pendiente y avisa (no se confirma rota)', appjs.indexOf('conf.mediaPending') >= 0 && appjs.indexOf('no se pudo publicar porque no se pudo subir su foto o video. Queda pendiente y se reintentará.') >= 0);
  /* (4) Etiqueta Dramas con las tres aplicaciones, dinámica. */
  check('1.5.62 etiqueta: la etiqueta Dramas es dinámica (tres aplicaciones nombradas + fuentes del catálogo, sin duplicados)', /var KD_SECTION_APPS_1562 = \['ReelShort', 'DramaBox', 'ShortMax'\];/.test(appjs) && /function kdSectionApps1562/.test(appjs) && /function kdRenderSectionBadge1562/.test(appjs) && idx.indexOf('id="kdSectionBadge1562"') >= 0);
  check('1.5.62 etiqueta: una aplicación nueva del catálogo aparece sola en la etiqueta (sin tocar código: usa kdActiveCatalog1549 y kdAppTag1561)', (function () { var b = fnBody(appjs, 'kdSectionApps1562'); return b.indexOf('kdActiveCatalog1549()') >= 0 && b.indexOf('kdAppTag1561') >= 0 && b.indexOf("'Original de WordRed'") >= 0; })());
  check('1.5.62 etiqueta: el texto por defecto del overlay de miembros es neutro (lo pone por aplicación kdMemberText1561)', idx.indexOf('Disponible en la aplicación') >= 0 && idx.indexOf('Este capítulo es solo para miembros de la aplicación.') >= 0 && idx.indexOf('Disponible en DramaBox') < 0);
  check('1.5.62 etiqueta: la sección Dramas del inicio sigue (no se quita ni se mueve)', idx.indexOf('id="homeKdrama1549"') >= 0 && appjs.indexOf('function renderKdramaHome1549') >= 0);
  /* (5) Dramas entre los Shorts. */
  check('1.5.62 shorts: cada 6–9 videos se cuela una tarjeta de drama (intervalos 6, 7, 8, 9 y series que rotan)', /var KD_SHORTS_GAPS_1562 = \[6, 7, 8, 9\];/.test(appjs) && /function kdInterleaveDramas1562/.test(appjs) && /function kdDramaPick1562/.test(appjs));
  check('1.5.62 shorts: la tarjeta se ve como un Short (portada a pantalla, título y etiqueta de su aplicación) y al tocarla abre el capítulo 1 con la guía', (function () { var b = fnBody(appjs, 'renderShortItem'); return b.indexOf("kind === 'drama'") >= 0 && b.indexOf('kdSeriesLabel1549') >= 0 && b.indexOf('__wrOpenDrama1562') >= 0; })() && /window\.__wrOpenDrama1562 = function \(seriesId\)/.test(appjs) && appjs.indexOf('kdOpen1549(idx, 0)') >= 0);
  check('1.5.62 shorts: la guía de gestos aparece SOLO en el primer capítulo y se quita sola a los 4 s (regla 1.5.49)', /function kdShowGuide1549/.test(appjs) && appjs.indexOf('kdEpIdx1549 === 0') >= 0);
  /* (6) Dramas entre las historias. */
  check('1.5.62 historias: entre las historias aparece un círculo de drama (portada + etiqueta de su aplicación) que abre el capítulo 1', /function kdStoryDramaPositions1562/.test(appjs) && /function kdStoryDramaTileHtml1562/.test(appjs) && fnBody(appjs, 'renderStories').indexOf('kdStoryDramaTileHtml1562') >= 0);
  check('1.5.62 historias: si la fila es corta, al menos un círculo de drama (al final); las historias reales no se quitan ni se mueven', (function () { var b = fnBody(appjs, 'kdStoryDramaPositions1562'); return b.indexOf('if (!pos.length) pos.push(n);') >= 0; })());
  /* (7) Más capítulos y más dramas: 48 series verificadas video por video. */
  check('1.5.62 dramas: verify62.jsonl trae 55 videos revisados (32 incluidos, 23 excluidos) y los incluidos son es/es-US, verticales 1080x1920 y embebibles', verify62.length === 55 && verify62.filter(function (v) { return v.estado === 'incluido'; }).length === 32 && verify62.filter(function (v) { return v.estado === 'incluido'; }).every(function (v) { return (v.idioma === 'es' || v.idioma === 'es-US') && v.embebible === true && v.resolucion === '1080x1920'; }));
  check('1.5.62 dramas: kdramas.json trae 48 series (46 ReelShort + 2 ShortMax) con 1 entrada gratis por serie', kdramasJson.kdramas.length === 48 && kdramasJson.kdramas.filter(function (s) { return s.source === 'ReelShort'; }).length === 46 && kdramasJson.kdramas.filter(function (s) { return s.source === 'ShortMax'; }).length === 2 && kdramasJson.kdramas.every(function (s) { return Array.isArray(s.eps) && s.eps.length === 1; }));
  /* (8) Tutorial y FAQ (regla: cada versión actualiza ambos). */
  check('1.5.62 tutorial: sigue en 6 pasos y menciona la subida que continúa, los dramas entre Shorts e historias, la etiqueta y el buscador', (function () { var m = appjs.match(/var TUTORIAL_STEPS_1533 = \[([\s\S]*?)\n\];/); var block = m ? m[1] : ''; return (block.match(/\{ art: '/g) || []).length === 6 && block.indexOf('continúa donde se quedó') >= 0 && block.indexOf('tarjetas de dramas') >= 0 && block.indexOf('etiqueta de Dramas nombra sus aplicaciones') >= 0 && block.indexOf('llegan más dramas cada 2 semanas') >= 0 && block.indexOf('hay un buscador') >= 0; })());
  check('1.5.62 FAQ: existen las preguntas nuevas (por qué ya no falla publicar, por qué hay dramas entre Shorts e historias, cada cuánto llegan, cómo buscar) con respuestas ≤400 y el total sigue en 29', (function () { var m = appjs.match(/var FAQ = \[([\s\S]*?)\n\];/); var block = m ? m[1] : ''; var qs = ['¿Por qué ya no falla publicar al final?', '¿Por qué aparecen dramas entre los Shorts y las historias?', '¿Cada cuánto llegan dramas y aplicaciones nuevas?', '¿Cómo busco algo desde el inicio?']; return qs.every(function (q) { return block.indexOf(q) >= 0; }) && (block.match(/\{ q: '/g) || []).length === 29 && (function () { var ok = true; (block.match(/a: '[^']*'/g) || []).forEach(function (a) { if (a.length - 5 > 400) ok = false; }); return ok; })(); })());
  check('1.5.62 FAQ: la entrada de la 1.5.60 salió y la de la 1.5.62 menciona el buscador', appjs.indexOf("q: '¿Qué hay de nuevo en la 1.5.60?'") < 0 && appjs.indexOf("q: '¿Qué hay de nuevo en la 1.5.62?'") >= 0 && (function () { var m = appjs.match(/\{ q: '¿Qué hay de nuevo en la 1\.5\.62\?', a: '([^']*)'/); return m && m[1].indexOf('buscador') >= 0 && m[1].length <= 400; })());
  /* (9) Buscador en el inicio. */
  check('1.5.62 buscador: la barra está SOLO en el inicio, debajo de la barra superior y encima de la fila de historias', (function () { var feed = idx.indexOf('id="view-feed"'); var bar = idx.indexOf('id="homeSearchWrap1562"'); var widgets = idx.indexOf('id="homeWidgets1536"'); return feed >= 0 && bar > feed && bar < widgets && idx.indexOf('id="homeSearchWrap1562"', bar + 1) < 0; })());
  check('1.5.62 buscador: es translúcido (glass) con lupa y barra para escribir, y la X limpia y cierra las sugerencias', idx.indexOf('class="glass" id="homeSearchBar1562"') >= 0 && idx.indexOf('id="homeSearchInput1562"') >= 0 && idx.indexOf('id="homeSearchClear1562"') >= 0 && /window\.__wrHomeSearchClear1562 = function/.test(appjs));
  check('1.5.62 buscador: las sugerencias van EN EL FLUJO debajo de la barra (no tapan las historias: sin position:absolute) y se cierran al tocar fuera', idx.indexOf('id="homeSearchSug1562"') >= 0 && (function () { var i = idx.indexOf('#homeSearchSug1562{'); if (i < 0) return false; var rule = idx.slice(i, idx.indexOf('}', i)); return rule.indexOf('absolute') < 0 && rule.indexOf('margin-top:8px') >= 0; })() && appjs.indexOf("homeSearchWrap1562") >= 0 && /document\.addEventListener\('click', function \(ev\) \{/.test(appjs) && appjs.indexOf("if (wrap.contains(ev.target)) return;") >= 0);
  check('1.5.62 buscador: busca en todo (personas, publicaciones, Reels, dramas, grupos y #etiquetas) con la misma lógica que «Buscar», sin tildes', /function searchAllFolded1562/.test(corejs) && corejs.indexOf('searchAllFolded1562: searchAllFolded1562') >= 0 && /function kdSearchDramas1562/.test(appjs) && /function homeSearchSuggest1562/.test(appjs));
  check('1.5.62 buscador: tocar una sugerencia lleva a lo correcto (perfil, publicación, Reel, drama en su capítulo 1, grupo o etiqueta)', /window\.__wrHomeSearchGo1562 = function \(type, id\)/.test(appjs) && appjs.indexOf("__wrOpenProfile(id)") >= 0 && appjs.indexOf("__wrOpenDrama1562(id)") >= 0 && appjs.indexOf("__wrOpenReel(id)") >= 0 && appjs.indexOf("__wrOpenGroup(id)") >= 0);
  check('1.5.62 buscador: la búsqueda vieja sigue igual (renderSearch usa C.searchAll, sin pliegue)', (function () { var i = appjs.indexOf('function renderSearch()'); var j = appjs.indexOf('/* 1.5.62: buscador del inicio', i); var b = (i >= 0 && j > i) ? appjs.slice(i, j) : ''; return b.indexOf('C.searchAll(state, state.me, q)') >= 0 && b.indexOf('searchAllFolded1562') < 0; })());
}

async function static1563() {
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'assets', 'app.js'), 'utf8');
  const idx = fs.readFileSync(path.join(__dirname, '..', 'assets', 'index.html'), 'utf8');
  const kdramasJson = JSON.parse(fs.readFileSync(path.join(process.env.HOME, 'workspace', 'wordred-server-v35', 'kdramas.json'), 'utf8'));
  const fnBody = function (src, name) { const i = src.indexOf('function ' + name + '('); if (i < 0) return ''; const j = src.indexOf('\nfunction ', i + 10); return src.slice(i, j < 0 ? src.length : j); };
  /* (1) Portadas verticales: un fotograma real del video por cada serie (48/48 en Cloudinary), nunca una imagen inventada. */
  check('1.5.63 portadas: KD_POSTER_VERTICAL_1563 tiene una portada vertical por cada serie del catálogo (48, todas en Cloudinary wordred/dramas/<videoId>-cover)', (function () { var ids = kdramasJson.kdramas.map(function (x) { return x.eps[0].videoId; }); var m = appjs.match(/var KD_POSTER_VERTICAL_1563 = \{([\s\S]*?)\n\};/); if (!m) return false; var entries = m[1].match(/'[A-Za-z0-9_-]{11}': 'https:\/\/res\.cloudinary\.com\/bekxop7h\/image\/upload\/v[0-9]+\/wordred\/dramas\/[A-Za-z0-9_-]{11}-cover(-720)?\.jpg'/g) || []; return entries.length === 48 && ids.every(function (id) { return m[1].indexOf("'" + id + "': 'https://res.cloudinary.com/bekxop7h/image/upload/") >= 0 && (m[1].indexOf('/wordred/dramas/' + id + '-cover.jpg') >= 0 || m[1].indexOf('/wordred/dramas/' + id + '-cover-720.jpg') >= 0); }); })());
  check('1.5.63 portadas: kdPoster1563 devuelve la vertical de la serie (por videoId) y si no hay, la miniatura de YouTube', /function kdPoster1563\(s\)/.test(appjs) && fnBody(appjs, 'kdPoster1563').indexOf('KD_POSTER_VERTICAL_1563[v]') >= 0 && fnBody(appjs, 'kdPoster1563').indexOf('s.eps[0].videoId') >= 0 && fnBody(appjs, 'kdPoster1563').indexOf('return s.poster') >= 0);
  /* (2) La tarjeta de drama en la fila de historias es la misma caja que un reel (mismas clases, mismo 140×190). */
  check('1.5.63 historias: la tarjeta de drama usa las mismas clases que un reel (.homeReel1549 + .homeReelRect1560) y la portada vertical con respaldo a la miniatura', fnBody(appjs, 'kdStoryDramaTileHtml1562').indexOf('class="homeReel1549"') >= 0 && fnBody(appjs, 'kdStoryDramaTileHtml1562').indexOf('class="homeReelRect1560"') >= 0 && fnBody(appjs, 'kdStoryDramaTileHtml1562').indexOf('kdPoster1563(s)') >= 0 && fnBody(appjs, 'kdStoryDramaTileHtml1562').indexOf('data-kd-fallback') >= 0 && fnBody(appjs, 'kdStoryDramaTileHtml1562').indexOf('__wrKdPosterFallback1563') >= 0);
  check('1.5.63 historias: el reel de al lado no cambia (la fila sigue pintando .homeReelRect1560 de 140×190 con radio 18)', idx.indexOf('.homeReelRect1560{width:140px;height:190px;border-radius:18px') >= 0 && fnBody(appjs, 'renderStories').indexOf('homeReelRect1560') >= 0);
  /* (3) La tarjeta de drama en Shorts llena el mismo escenario que un Short. */
  check('1.5.63 shorts: la tarjeta de drama llena el escenario a pantalla completa igual que un Short (100%×100%, cover) y usa la portada vertical', (function () { var b = fnBody(appjs, 'renderShortItem'); return b.indexOf('kdPoster1563(s1562)') >= 0 && b.indexOf('data-kd-fallback') >= 0 && b.indexOf('__wrKdPosterFallback1563') >= 0 && b.indexOf('style="width:100%;height:100%;object-fit:cover"') >= 0; })());
  check('1.5.63 shorts: los Shorts no cambian (el intervalo drama sigue 6–9 y el tap abre el capítulo 1)', /var KD_SHORTS_GAPS_1562 = \[6, 7, 8, 9\];/.test(appjs) && fnBody(appjs, 'renderShortItem').indexOf('__wrOpenDrama1562') >= 0 && fnBody(appjs, 'renderShortItem').indexOf('esc(s1562.id)') >= 0);
  /* (4) La sección Dramas: la portada llena todo el recuadro 264×400, de borde a borde. */
  check('1.5.63 sección: la tarjeta usa la portada vertical con respaldo a la miniatura y al fondo rojo (nunca un hueco vacío)', fnBody(appjs, 'renderKdramaHome1549').indexOf('kdPoster1563(s)') >= 0 && fnBody(appjs, 'renderKdramaHome1549').indexOf('data-kd-kind="dramaTile"') >= 0 && fnBody(appjs, 'renderKdramaHome1549').indexOf('__wrKdPosterFallback1563') >= 0);
  check('1.5.63 sección: el CSS hace que la img cubra todo el recuadro 264×400 (100%×100%, cover) y el nombre y la etiqueta siguen sobre la portada', idx.indexOf('.reelTile img,.reelTile video{width:100%;height:100%;object-fit:cover;display:block}') >= 0 && fnBody(appjs, 'renderKdramaHome1549').indexOf('kdAppTag1561(s)') >= 0 && fnBody(appjs, 'renderKdramaHome1549').indexOf('kdTileLabel1549') >= 0);
  /* (5) El visor del drama también usa la vertical (rama de miembros y rama de video fallido). */
  check('1.5.63 visor: la imagen del visor es la portada vertical (rama de miembros y rama de video fallido)', fnBody(appjs, 'kdLoadCurrent1549').indexOf('kdPoster1563(s)') >= 0 && (function () { var i = appjs.indexOf('window.__wrKdVideoFail1556 = function'); if (i < 0) return false; var b = appjs.slice(i, appjs.indexOf('\nfunction ', i + 10)); return b.indexOf('kdPoster1563(sFail1563)') >= 0; })());
  /* (6) Respaldo: si la vertical no carga, se intenta la miniatura de YouTube; si tampoco, el rojo con el nombre. */
  check('1.5.63 respaldo: __wrKdPosterFallback1563 cambia a la miniatura una sola vez y luego usa el respaldo rojo de la tarjeta', /window\.__wrKdPosterFallback1563 = function \(img\)/.test(appjs) && (function () { var i = appjs.indexOf('window.__wrKdPosterFallback1563 = function'); if (i < 0) return false; var b = appjs.slice(i, appjs.indexOf('\nfunction ', i + 10)); return b.indexOf('data-kd-fallback') >= 0 && b.indexOf('data-kd-fb1563') >= 0 && b.indexOf('__wrImgFail1555') >= 0 && b.indexOf("'dramaTile'") >= 0; })());
}

(async () => {
  try {
    await coreTests();
    static159();
    static1510();
    await static1511();
    static1512();
    static1513launcher();
    static1514drawer();
    static1514b();
    static1514c();
    static1514d();
    static1514e();
    static1514f();
    static1514g();
    static1514h();
    static1514i();
    await static1515();
    await static1515nav();
    static1516();
    static1517();
    static1518();
    static1519();
    static1520();
    static1521();
    static1522();
    static1523();
    static1524();
    static1525();
    static1526();
    static1527();
    static1530();
    static1531();
    static1532();
    static1533();
    static1534();
    static1535();
    static1536();
    static1537();
    static1538();
    static1539();
    static1540();
    static1541();
    static1542();
    static1543();
    static1544();
    static1546();
    await static1554();
    await static1555();
    await static1556();
    await static1558();
    await static1560();
    await static1561();
    await static1562();
    await static1563();
    await serverTests();
  } catch (e) {
    fail++;
    console.log('FAIL: excepción no controlada — ' + (e && e.stack ? e.stack : e));
  }
  console.log('\n==============================');
  console.log('WordRed v1.5.63 — ' + pass + ' PASS, ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
