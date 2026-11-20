/* WordRed — Minijuegos (módulo propio, sin librerías externas).
   Juegos originales estilo arcade clásico, dibujados en canvas con JS propio.
   Sin llamadas a internet y sin dependencias externas.
   Expone el global WordRedGames. */
(function () {
  'use strict';

  var RED = '#E60026';
  var RED_DARK = '#B3001E';
  var INK = '#141419';
  var PAPER = '#F5F5F7';
  var GOLD = '#FFC400';
  var GREEN = '#1DB954';
  var BLUE = '#1E88E5';
  var STORAGE_KEY = 'wordred_games';
  var LW = 960;   /* ancho lógico del lienzo */
  var LH = 540;   /* alto lógico del lienzo */

  /* v1.8: categorías de la tienda de juegos y colores vivos del mosaico
     (estilo lanzador: un color por juego, elegido por su id). */
  var GAME_CATEGORIES = ['Clásicos', 'Arcade', 'Puzzle', 'Memoria', 'Acción', 'Deportes', 'Carreras', 'Palabras'];
  var TILE_COLORS = ['#E60026', '#FF6D00', '#F9A825', '#43A047', '#00BFA5', '#1E88E5', '#7C4DFF', '#D81B60', '#8D6E63', '#00838F', '#C2185B', '#5E35B1'];
  function tileColor(id) {
    var h = 0, s = String(id || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return TILE_COLORS[h % TILE_COLORS.length];
  }
  /* v1.8: sonidos propios con WebAudio (sin archivos): un bip al puntuar,
     una fanfarria al ganar o batir récord y un zumbido al perder. Con
     silencio si el teléfono no tiene audio o la persona lo apaga. */
  var soundOn = true;
  var audioCtx = null;
  function beep(freq, dur, type, vol, when) {
    if (!soundOn) return;
    try {
      if (typeof AudioContext === 'undefined' && typeof webkitAudioContext === 'undefined') return;
      if (!audioCtx) audioCtx = new (AudioContext || webkitAudioContext)();
      if (!audioCtx || audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) {} }
      var t0 = audioCtx.currentTime + (when || 0);
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.12, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + (dur || 0.12));
      o.connect(g); g.connect(audioCtx.destination);
      o.start(t0); o.stop(t0 + (dur || 0.12) + 0.02);
    } catch (e) { /* sin audio en este entorno */ }
  }
  var Sfx = {
    tap: function () { beep(620, 0.06, 'triangle', 0.08); },
    score: function () { beep(880, 0.09, 'sine', 0.12); beep(1320, 0.1, 'sine', 0.08, 0.06); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { beep(f, 0.16, 'triangle', 0.14, i * 0.11); }); },
    lose: function () { beep(220, 0.22, 'sawtooth', 0.08); beep(160, 0.3, 'sawtooth', 0.07, 0.14); },
    turn: function () { beep(740, 0.07, 'sine', 0.09); }
  };
  function setSound(on) { soundOn = !!on; return soundOn; }
  function isSoundOn() { return soundOn; }
  function vibrate(ms) {
    try { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(ms || 10); } catch (e) {}
  }

  /* ---------------- utilidades ---------------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function irnd(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[irnd(arr.length)]; }
  /* v1.8: esc local — el marcador online lo usaba y no existía en este
     módulo (en el navegador se resolvía por el global de app.js; aquí
     el módulo es autónomo y sin él el fin del duelo rompía). */
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = irnd(i + 1), t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function hasDoc() { return typeof document !== 'undefined'; }
  function hasWin() { return typeof window !== 'undefined'; }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function circle(ctx, x, y, r) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath();
  }
  function text(ctx, s, x, y, size, color, align, bold) {
    ctx.fillStyle = color || '#fff';
    ctx.font = (bold ? 'bold ' : '') + size + 'px Arial, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(s), x, y);
  }

  /* ---------------- datos: mejor puntuación, partidas, favoritos ---------------- */
  var opts = {};
  var data = null;

  function emptyData() { return { best: {}, plays: {}, favorites: [] }; }

  function loadData() {
    try {
      if (opts.getState) {
        var s = opts.getState();
        if (s) {
          if (!s.games) s.games = emptyData();
          data = s.games;
          if (!data.best) data.best = {};
          if (!data.plays) data.plays = {};
          if (!data.favorites) data.favorites = [];
          return data;
        }
      }
    } catch (e) { /* sigue con el respaldo local */ }
    try {
      if (typeof localStorage !== 'undefined') {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (raw) data = JSON.parse(raw);
      }
    } catch (e) { /* sin respaldo disponible */ }
    if (!data) data = emptyData();
    if (!data.best) data.best = {};
    if (!data.plays) data.plays = {};
    if (!data.favorites) data.favorites = [];
    return data;
  }

  function ensureData() { if (!data) loadData(); return data; }

  function persist() {
    try { if (opts.save) opts.save(); } catch (e) { /* guardar es opcional */ }
    try {
      if (typeof localStorage !== 'undefined' && data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      }
    } catch (e) { /* almacenamiento no disponible */ }
  }

  function showToast(msg) {
    try {
      if (opts.toast) { opts.toast(msg); return; }
    } catch (e) { /* cae al aviso propio */ }
    if (!hasDoc()) return;
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#141419;color:#fff;padding:10px 18px;border-radius:24px;z-index:10010;font-family:Arial,sans-serif;font-size:15px;box-shadow:0 4px 16px rgba(0,0,0,.4)';
    document.body.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2600);
  }

  /* ---------------- API de datos ---------------- */
  function getBest(id) {
    ensureData();
    return data.best[id] || 0;
  }

  function saveBest(id, score) {
    ensureData();
    score = Math.max(0, Math.floor(score || 0));
    if (score > (data.best[id] || 0)) {
      data.best[id] = score;
      persist();
      return true;
    }
    return false;
  }

  function getPlays(id) {
    ensureData();
    return data.plays[id] || 0;
  }

  function registerPlay(id) {
    ensureData();
    data.plays[id] = (data.plays[id] || 0) + 1;
    persist();
    /* v1.8: el servidor cuenta cuántas personas lo han jugado (sin
       servidor, la tienda muestra el conteo de este teléfono). */
    try { if (opts.reportPlay) opts.reportPlay(id); } catch (e) {}
  }

  /* v1.8: calificaciones de la gente (1–5 estrellas + comentario corto).
     Se guardan en este teléfono y se sincronizan con el servidor cuando
     está disponible; el promedio que se ve es el de toda la gente de
     WordRed. Sin servidor, el promedio es el de este teléfono. */
  function rateGame(id, stars, comment) {
    var def = findGame(id);
    if (!def) return null;
    ensureData();
    stars = Math.max(1, Math.min(5, Math.round(Number(stars) || 0)));
    if (!stars) return null;
    if (!data.ratings) data.ratings = {};
    data.ratings[id] = { stars: stars, comment: String(comment || '').slice(0, 140), at: Date.now(), synced: false };
    persist();
    try { if (opts.reportRating) opts.reportRating(id, stars, comment); } catch (e) {}
    return getGameRating(id);
  }
  /* v2.1: la calificación que dio este teléfono a un juego propio (o
     null). `synced` dice si ya llegó al servidor. */
  function getLocalRating(id) {
    ensureData();
    var m = (data.ratings || {})[id];
    return m ? { stars: m.stars, comment: m.comment || '', at: m.at || 0, synced: m.synced === true } : null;
  }
  /* v2.1: marca la calificación como ya sincronizada con el servidor. */
  function markRatingSynced(id) {
    ensureData();
    if (data.ratings && data.ratings[id]) { data.ratings[id].synced = true; persist(); }
  }
  function getGameRating(id) {
    ensureData();
    var mine = (data.ratings || {})[id];
    var srv = null;
    try { if (opts.getServerStats) srv = opts.getServerStats(); } catch (e) {}
    /* El servidor devuelve {ratingAvg, ratingCount} por juego (v1.8). */
    var agg = srv && srv[id];
    if (agg && typeof agg.ratingAvg === 'number' && agg.ratingCount > 0) {
      return { avg: agg.ratingAvg, count: agg.ratingCount, mine: mine ? mine.stars : 0, myComment: mine ? mine.comment : '', source: 'server' };
    }
    if (mine) return { avg: mine.stars, count: 1, mine: mine.stars, myComment: mine.comment || '', source: 'local' };
    return { avg: 0, count: 0, mine: 0, myComment: '', source: 'local' };
  }
  /* v1.8: cuántas personas lo han jugado. Con servidor, personas
     distintas de WordRed; sin él, partidas jugadas en este teléfono. */
  function getGamePlayers(id) {
    var srv = null;
    try { if (opts.getServerStats) srv = opts.getServerStats(); } catch (e) {}
    /* El servidor devuelve {players} por juego (v1.8). */
    var agg = srv && srv[id];
    if (agg && typeof agg.players === 'number') {
      return { count: agg.players, source: 'server' };
    }
    return { count: getPlays(id), source: 'local' };
  }

  function toggleFavorite(id) {
    ensureData();
    var i = data.favorites.indexOf(id);
    if (i >= 0) {
      data.favorites.splice(i, 1);
      persist();
      return false;
    }
    data.favorites.push(id);
    persist();
    return true;
  }

  function getFavorites() {
    ensureData();
    return data.favorites
      .map(function (id) { return getGameInfo(id); })
      .filter(function (g) { return !!g; });
  }

  function getGameInfo(id) {
    var def = findGame(id);
    if (!def) return null;
    ensureData();
    return {
      id: def.id, name: def.name, desc: def.desc, icon: def.icon, cat: def.cat || 'Arcade',
      color: tileColor(def.id),
      best: data.best[id] || 0,
      plays: data.plays[id] || 0,
      favorite: data.favorites.indexOf(id) >= 0,
      rating: getGameRating(id),
      players: getGamePlayers(id)
    };
  }

  function getRecommendations() {
    ensureData();
    var out = [];
    var seen = {};
    var i, def;
    for (i = 0; i < data.favorites.length; i++) {
      def = findGame(data.favorites[i]);
      if (def && !seen[def.id]) { seen[def.id] = true; out.push(getGameInfo(def.id)); }
    }
    var rest = GAMES.slice().sort(function (a, b) {
      var pa = data.plays[a.id] || 0, pb = data.plays[b.id] || 0;
      if (pb !== pa) return pb - pa;
      return (data.best[b.id] || 0) - (data.best[a.id] || 0);
    });
    for (i = 0; i < rest.length && out.length < 8; i++) {
      if (!seen[rest[i].id]) { seen[rest[i].id] = true; out.push(getGameInfo(rest[i].id)); }
    }
    return out;
  }

  function findGame(id) {
    for (var i = 0; i < GAMES.length; i++) if (GAMES[i].id === id) return GAMES[i];
    return null;
  }

  function makeGame(id, w, h, mode, onlineOpts) {
    var def = findGame(id);
    if (!def) return null;
    if (id === 'tres-raya' && mode === 'online') return tictactoeEngine('online', onlineOpts);
    return def.make(w || LW, h || LH);
  }

  /* ---------------- interfaz: pantalla previa ---------------- */
  var previewOv = null;
  var gameOv = null;
  var current = null; /* sesión de juego activa */

  function el(tag, css, txt) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (txt !== undefined && txt !== null) e.textContent = txt;
    return e;
  }

  /* 1.5.43 (8): deslizamiento suave por impulso: una tecla da velocidad
     y el movimiento se frena solo (no hay tecla de soltar). Así la paleta,
     la cesta y el jugador se deslizan en vez de saltar de golpe. */
  function glide(v, dt) { return v * Math.pow(0.002, dt); }

  /* 1.5.43 (8): botones con el diseño de la app (1.5.38/1.5.42): 40 px
     de alto, píldora redondeada (radio 20 px), translúcidos. En las
     superficies oscuras el secundario es blanco translúcido; en las
     tarjetas blancas (onLight) es negro translúcido con texto oscuro. */
  function btn(label, primary, onLight) {
    var b = el('button', 'font-family:Arial,sans-serif;font-size:15px;font-weight:bold;height:40px;padding:0 20px;border-radius:20px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;' +
      (primary
        ? 'background:' + RED + ';color:#fff;border:1px solid transparent'
        : (onLight
          ? 'background:rgba(0,0,0,.06);color:' + INK + ';border:1px solid rgba(0,0,0,.12)'
          : 'background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.14)')));
    b.textContent = label;
    return b;
  }

  /* 1.5.43 (8): botón solo con símbolo, redondo de 40 px, mismo diseño
     translúcido que los botones de los widgets. */
  function iconBtn(sym, label) {
    var b = el('button', 'font-family:Arial,sans-serif;font-size:19px;font-weight:bold;width:40px;height:40px;border-radius:50%;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.14)', sym);
    b.title = label || '';
    if (b.setAttribute) b.setAttribute('aria-label', label || '');
    return b;
  }

  function closePreview() {
    if (previewOv && previewOv.parentNode) previewOv.parentNode.removeChild(previewOv);
    previewOv = null;
  }

  function openGame(id) {
    var info = getGameInfo(id);
    if (!info || !hasDoc()) return false;
    closeGame(false);
    closePreview();
    var ov = el('div', 'position:fixed;inset:0;background:rgba(10,10,14,.92);z-index:9998;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif');
    var card = el('div', 'background:#fff;border-radius:20px;max-width:520px;width:92%;padding:28px 26px;text-align:center;box-shadow:0 12px 40px rgba(0,0,0,.5)');
    var icon = el('div', 'font-size:64px;line-height:1', info.icon);
    var name = el('h2', 'margin:12px 0 6px;font-size:28px;color:' + INK, info.name);
    var desc = el('p', 'margin:0 0 14px;font-size:16px;color:#555;line-height:1.45', info.desc);
    var best = el('div', 'font-size:16px;color:' + INK + ';margin-bottom:4px');
    best.innerHTML = '🏆 Mejor puntuación: <b>' + info.best + '</b>';
    var plays = el('div', 'font-size:14px;color:#888;margin-bottom:18px', 'Partidas jugadas: ' + info.plays);
    var fav = btn(info.favorite ? '★ Favorito' : '☆ Marcar favorito', info.favorite, true);
    fav.style.marginRight = '8px';
    fav.onclick = function () {
      var now = toggleFavorite(id);
      fav.textContent = now ? '★ Favorito' : '☆ Marcar favorito';
      showToast(now ? 'Añadido a favoritos' : 'Quitado de favoritos');
    };
    var play = btn('▶ Jugar', true);
    play.style.marginRight = '8px';
    play.onclick = function () { closePreview(); startGame(id); };
    var back = btn('Volver al perfil', false, true);
    back.onclick = function () { closePreview(); goProfile(); };
    card.appendChild(icon); card.appendChild(name); card.appendChild(desc);
    card.appendChild(best); card.appendChild(plays);
    card.appendChild(fav); card.appendChild(play); card.appendChild(back);
    ov.appendChild(card);
    document.body.appendChild(ov);
    previewOv = ov;
    return true;
  }

  function goProfile() {
    try { if (opts.openProfile) opts.openProfile(); } catch (e) { /* opcional */ }
  }

  /* ---------------- interfaz: partida a pantalla completa ----------------
     v1.8: efectos (partículas, "+puntos" flotante, vibración y sonidos),
     botón de pantalla completa y modo online. En online, `opts.online`
     trae {roomId, mode:'duel'|'turn', opponent, myMark, duration,
     onScore, onMove, onEnd}: en 'duel' es una carrera de puntos con
     tiempo y marcador del rival en vivo; en 'turn' (Tres en raya) se
     juega por turnos contra la otra persona. Sin internet se juega
     en local como siempre. */
  function startGame(id, gopts) {
    var def = findGame(id);
    if (!def || !hasDoc()) return false;
    gopts = gopts || {};
    var online = gopts.online || null;
    closeGame(false);
    registerPlay(id);
    var game = (online && online.mode === 'turn' && id === 'tres-raya')
      ? tictactoeEngine('online', { mark: online.myMark, opponent: online.opponent, onMove: online.onMove })
      : def.make(LW, LH);
    var ov = el('div', 'position:fixed;inset:0;background:#0B0B0F;z-index:9999;display:flex;flex-direction:column;font-family:Arial,sans-serif');
    var bar = el('div', 'display:flex;align-items:center;gap:10px;padding:10px 14px;background:#141419;color:#fff;flex-shrink:0');
    var backBtn = btn('← Volver al perfil', false);
    var title = el('div', 'font-size:17px;font-weight:bold;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', def.icon + ' ' + def.name + (online ? ' · vs ' + online.opponent : ''));
    var scoreEl = el('div', 'font-size:16px;font-weight:bold;color:' + GOLD, 'Puntos: 0');
    var bestEl = el('div', 'font-size:14px;color:#bbb', 'Récord: ' + getBest(id));
    var fsBtn = btn('⛶ Pantalla completa', false);
    fsBtn.id = 'gameFullscreenBtn';
    var pauseBtn = iconBtn('⏸', 'Pausa');
    bar.appendChild(backBtn); bar.appendChild(title); bar.appendChild(scoreEl); bar.appendChild(bestEl);
    var oppEl = null, timerEl = null;
    if (online) {
      oppEl = el('div', 'font-size:15px;font-weight:bold;color:#7dd3fc', online.opponent + ': 0');
      bar.appendChild(oppEl);
      if (online.mode === 'duel') {
        timerEl = el('div', 'font-size:15px;font-weight:bold;color:#fff;background:' + RED + ';border-radius:14px;padding:4px 10px', '60 s');
        bar.appendChild(timerEl);
      } else {
        timerEl = el('div', 'font-size:14px;font-weight:bold;color:#ffd166', 'Tu turno');
        bar.appendChild(timerEl);
      }
    }
    bar.appendChild(fsBtn); bar.appendChild(pauseBtn);
    var wrap = el('div', 'flex:1;position:relative;display:flex;align-items:center;justify-content:center;min-height:0');
    var canvas = document.createElement('canvas');
    canvas.width = LW; canvas.height = LH;
    canvas.style.cssText = 'max-width:100%;max-height:100%;background:#101014;border-radius:6px;touch-action:none';
    wrap.appendChild(canvas);
    var rotate = el('div', 'position:absolute;top:10px;left:50%;transform:translateX(-50%);background:' + GOLD + ';color:#141419;font-weight:bold;font-size:15px;padding:8px 16px;border-radius:20px;display:none;z-index:5', '📱 Gira tu teléfono para jugar en horizontal');
    wrap.appendChild(rotate);
    var panel = el('div', 'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.72);z-index:6');
    var pcard = el('div', 'background:#fff;border-radius:18px;padding:26px 30px;text-align:center;max-width:440px;width:90%');
    var pTitle = el('h2', 'margin:0 0 8px;font-size:26px;color:' + INK, '¡Partida terminada!');
    var pScore = el('div', 'font-size:19px;margin-bottom:4px;color:' + INK);
    var pBest = el('div', 'font-size:16px;margin-bottom:18px;color:#555');
    var pShare = btn('📣 Compartir récord en mi perfil', true);
    var pAgain = btn('↻ Jugar de nuevo', false, true);
    var pBack = btn('Volver al perfil', false, true);
    pShare.style.margin = '4px'; pAgain.style.margin = '4px'; pBack.style.margin = '4px';
    pcard.appendChild(pTitle); pcard.appendChild(pScore); pcard.appendChild(pBest);
    pcard.appendChild(pShare); pcard.appendChild(pAgain); pcard.appendChild(pBack);
    panel.appendChild(pcard);
    wrap.appendChild(panel);
    ov.appendChild(bar); ov.appendChild(wrap);
    document.body.appendChild(ov);
    gameOv = ov;

    var ctx = canvas.getContext('2d');
    var paused = false;
    var finished = false;
    var last = 0;
    var raf = 0;
    /* v1.8: efectos de la partida: puntos flotantes, partículas,
       vibración y sonidos al puntuar y al terminar. */
    var popups = [];
    var particles = [];
    var shake = 0;
    var lastScore = 0;
    var lastSfxAt = 0;
    var duelStart = online && online.mode === 'duel' ? Date.now() : 0;
    var duelDuration = online && online.mode === 'duel' ? (Number(online.duration) || 60) : 0;
    var duelEndSent = false;
    var lastSentScore = -1;
    var lastSentAt = 0;

    function updateRotate() {
      var portrait = hasWin() && window.innerHeight > window.innerWidth;
      rotate.style.display = portrait ? 'block' : 'none';
    }
    updateRotate();

    function spawnBurst(x, y, n, colors) {
      for (var i = 0; i < (n || 12); i++) {
        var a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 260;
        particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.7 + Math.random() * 0.5, max: 1.2, size: 4 + Math.random() * 6, color: (colors || ['#FFC400', '#E60026', '#1E88E5', '#1DB954'])[Math.floor(Math.random() * 4)] });
      }
    }
    function requestGameFullscreen() {
      try {
        if (ov.requestFullscreen) {
          var pr = ov.requestFullscreen();
          if (pr && pr.catch) pr.catch(function () { showToast('Este teléfono no deja poner el juego a pantalla completa.'); });
          return true;
        }
      } catch (e) {}
      showToast('Este teléfono no deja poner el juego a pantalla completa.');
      return false;
    }
    function updateFsBtn() {
      try {
        var fs = hasDoc() && document.fullscreenElement;
        fsBtn.textContent = fs ? '⛶ Salir de pantalla completa' : '⛶ Pantalla completa';
      } catch (e) {}
    }
    fsBtn.onclick = function () {
      try {
        if (hasDoc() && document.fullscreenElement && document.exitFullscreen) { document.exitFullscreen(); return; }
      } catch (e) {}
      requestGameFullscreen();
    };
    if (hasDoc() && document.addEventListener) {
      document.addEventListener('fullscreenchange', updateFsBtn);
    }

    function finish() {
      if (finished) return;
      finished = true;
      var sc = Math.floor(game.score());
      var isRecord = saveBest(id, sc);
      bestEl.textContent = 'Récord: ' + getBest(id);
      if (isRecord) { Sfx.win(); spawnBurst(LW / 2, LH / 2, 40); vibrate(60); }
      else { Sfx.lose(); shake = 10; }
      if (online) {
        pTitle.textContent = online.mode === 'duel' ? '¡Duelo terminado!' : '¡Partido terminado!';
        pScore.innerHTML = 'Tú: <b>' + sc + '</b>' + (oppEl ? ' · ' + esc(online.opponent) + ': <b>' + (online.oppScore || 0) + '</b>' : '');
        pBest.textContent = 'Esperando el resultado del rival…';
        pShare.textContent = '📣 Compartir resultado en mi perfil';
        pShare.onclick = function () {
          try {
            if (opts.shareRecord) opts.shareRecord(getGameInfo(id), sc);
            else showToast('Resultado guardado: ' + sc + ' puntos');
          } catch (e) { showToast('Resultado guardado: ' + sc + ' puntos'); }
        };
        pAgain.textContent = '↻ Revancha';
        pAgain.onclick = function () {
          if (online.onRematch) { try { online.onRematch(); } catch (e) {} }
          closeGame(false);
        };
        if (!duelEndSent) {
          duelEndSent = true;
          try { if (online.onEnd) online.onEnd(sc); } catch (e) {}
        }
      } else {
        pScore.innerHTML = 'Puntos: <b>' + sc + '</b>' + (isRecord ? ' — 🏆 ¡Nuevo récord!' : '');
        pBest.textContent = 'Mejor puntuación: ' + getBest(id);
        pShare.onclick = function () {
          try {
            if (opts.shareRecord) opts.shareRecord(getGameInfo(id), sc);
            else showToast('Récord guardado: ' + sc + ' puntos');
          } catch (e) { showToast('Récord guardado: ' + sc + ' puntos'); }
        };
        pAgain.onclick = function () { closeGame(false); startGame(id); };
      }
      pBack.onclick = function () { closeGame(true); };
      panel.style.display = 'flex';
    }

    /* v1.8 online: el marcador del rival en vivo y el resultado final. */
    function setOnlineOpponentScore(score) {
      if (!online) return;
      online.oppScore = Math.max(0, Math.floor(Number(score) || 0));
      if (oppEl) oppEl.textContent = online.opponent + ': ' + online.oppScore;
      if (finished && pScore) pScore.innerHTML = 'Tú: <b>' + Math.floor(game.score()) + '</b> · ' + esc(online.opponent) + ': <b>' + online.oppScore + '</b>';
    }
    function setOnlineResult(res) {
      if (!online || !finished) return;
      var win = res && res.winner === 'me';
      var draw = res && res.winner === 'draw';
      pTitle.textContent = win ? '¡Ganaste el duelo! 🏆' : draw ? 'Empate' : 'Ganó ' + online.opponent;
      if (res && typeof res.myScore === 'number') {
        pScore.innerHTML = 'Tú: <b>' + res.myScore + '</b> · ' + esc(online.opponent) + ': <b>' + (res.oppScore || 0) + '</b>';
      }
      pBest.textContent = win ? '¡Tu rival quedó atrás! Comparte tu victoria.' : draw ? 'Nadie se llevó el duelo esta vez.' : 'Inténtalo de nuevo: pide la revancha.';
      if (win) { Sfx.win(); spawnBurst(LW / 2, LH / 2, 40); }
    }

    function loop(ts) {
      if (!current || current.ov !== ov) return;
      raf = requestAnimationFrame(loop);
      var dt = last ? (ts - last) / 1000 : 0.016;
      last = ts;
      if (dt > 0.05) dt = 0.05;
      if (!paused && !finished) {
        try { game.update(dt); } catch (e) { /* un juego no debe tumbar la partida */ }
      }
      /* v1.8: vibración de la pantalla al terminar mal y dibujo de
         efectos (partículas y puntos flotantes) sobre el juego. */
      try {
        ctx.save();
        if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= 0.88; if (shake < 0.5) shake = 0; }
        game.draw(ctx);
        ctx.restore();
      } catch (e) { /* dibujo opcional */ }
      if (paused) {
        ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, LW, LH);
        text(ctx, '⏸ Pausa', LW / 2, LH / 2 - 10, 44, '#fff', 'center', true);
        text(ctx, game.hint || '', LW / 2, LH / 2 + 34, 18, '#ddd', 'center');
      } else if (!finished && game.hint) {
        text(ctx, game.hint, 12, LH - 16, 14, 'rgba(255,255,255,.55)', 'left');
      }
      var sc = 0;
      try { sc = Math.floor(game.score()); } catch (e) { sc = 0; }
      scoreEl.textContent = 'Puntos: ' + sc;
      /* v1.8: al subir la puntuación, "+N" flotante, partículas, sonido
         y una vibración corta: el juego se siente vivo al tocar. */
      if (!finished && sc > lastScore) {
        var gain = sc - lastScore;
        popups.push({ x: LW / 2 + (Math.random() - 0.5) * 220, y: LH / 2 - 60, text: '+' + gain, life: 1 });
        spawnBurst(LW / 2 + (Math.random() - 0.5) * 300, LH / 2 - 40, 8);
        var nowMs = Date.now();
        if (nowMs - lastSfxAt > 150) { Sfx.score(); lastSfxAt = nowMs; }
        vibrate(12);
      }
      lastScore = sc;
      /* v1.8 online: el marcador se manda al rival (como mucho 2 veces
         por segundo) y el duelo termina cuando se acaba el tiempo. */
      if (online && !finished) {
        if (online.mode === 'duel') {
          var left = duelDuration - Math.floor((Date.now() - duelStart) / 1000);
          if (timerEl) timerEl.textContent = Math.max(0, left) + ' s';
          if (left <= 0) { finish(); return; }
        } else if (timerEl && game.turnMark) {
          try { timerEl.textContent = game.turnMark() === game.myMark() ? 'Tu turno' : 'Turno de ' + online.opponent; } catch (e) {}
        }
        if (sc !== lastSentScore && Date.now() - lastSentAt > 500) {
          lastSentScore = sc; lastSentAt = Date.now();
          try { if (online.onScore) online.onScore(sc); } catch (e) {}
        }
      }
      /* dibujo de efectos: partículas y puntos flotantes */
      try {
        for (var i = particles.length - 1; i >= 0; i--) {
          var pt = particles[i];
          pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 320 * dt;
          if (pt.life <= 0) { particles.splice(i, 1); continue; }
          ctx.globalAlpha = Math.max(0, pt.life / pt.max);
          ctx.fillStyle = pt.color; circle(ctx, pt.x, pt.y, pt.size); ctx.fill();
        }
        ctx.globalAlpha = 1;
        for (var j = popups.length - 1; j >= 0; j--) {
          var pp = popups[j];
          pp.life -= dt * 0.9; pp.y -= 46 * dt;
          if (pp.life <= 0) { popups.splice(j, 1); continue; }
          ctx.globalAlpha = Math.max(0, pp.life);
          text(ctx, pp.text, pp.x, pp.y, 30, GOLD, 'center', true);
        }
        ctx.globalAlpha = 1;
      } catch (e) { /* los efectos nunca tumban la partida */ }
      if (!finished && game.over) finish();
    }

    function onKey(e) {
      var code = e.key || '';
      if (code === 'Escape') { closeGame(true); return; }
      if (code === 'p' || code === 'P') { togglePause(); return; }
      if (paused || finished) return;
      var map = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', ' ': 'Space', Enter: 'Enter' };
      var k = map[code] || code;
      try { if (game.key) game.key(k); } catch (err) { /* tecla no válida para el juego */ }
      if (['Up', 'Down', 'Left', 'Right', ' '].indexOf(code) >= 0 && e.preventDefault) e.preventDefault();
    }

    function togglePause() {
      paused = !paused;
      pauseBtn.textContent = paused ? '▶' : '⏸';
    }
    pauseBtn.onclick = togglePause;
    backBtn.onclick = function () { closeGame(true); };

    var pStart = null;
    function toLogical(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * (LW / r.width), y: (e.clientY - r.top) * (LH / r.height) };
    }
    canvas.addEventListener('pointerdown', function (e) {
      var p = toLogical(e);
      pStart = p;
      vibrate(8);
      Sfx.tap();
      try { if (game.pointer) game.pointer(p.x, p.y, 'down'); } catch (err) {}
    });
    canvas.addEventListener('pointermove', function (e) {
      if (paused || finished) return;
      var p = toLogical(e);
      try { if (game.pointer) game.pointer(p.x, p.y, 'move'); } catch (err) {}
    });
    canvas.addEventListener('pointerup', function (e) {
      var p = toLogical(e);
      if (pStart) {
        var dx = p.x - pStart.x, dy = p.y - pStart.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > 30) {
          try { if (game.swipe) game.swipe(dx, dy); } catch (err) {}
        } else {
          try { if (game.pointer) game.pointer(p.x, p.y, 'tap'); } catch (err) {}
        }
        pStart = null;
      }
    });

    function onResize() { updateRotate(); }
    if (hasWin()) {
      window.addEventListener('keydown', onKey);
      window.addEventListener('resize', onResize);
    }

    /* pantalla completa + horizontal, con respaldo si el sistema no lo permite */
    try {
      if (ov.requestFullscreen) {
        var pr = ov.requestFullscreen();
        if (pr && pr.catch) pr.catch(function () { /* sigue en el overlay igual */ });
      }
    } catch (e) { /* sigue en el overlay igual */ }
    try {
      if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.lock) {
        var lp = screen.orientation.lock('landscape');
        if (lp && lp.catch) lp.catch(function () { /* sigue en vertical con aviso */ });
      }
    } catch (e) { /* sigue en vertical con aviso */ }

    current = {
      ov: ov, def: def, game: game, finish: finish, online: online || null,
      setOnlineOpponentScore: setOnlineOpponentScore, setOnlineResult: setOnlineResult,
      onlineMove: function (idx) { try { return game.remoteMove ? game.remoteMove(idx) : false; } catch (e) { return false; } },
      stop: function () {
        cancelAnimationFrame(raf);
        if (hasWin()) {
          window.removeEventListener('keydown', onKey);
          window.removeEventListener('resize', onResize);
        }
        try { if (hasDoc() && document.removeEventListener) document.removeEventListener('fullscreenchange', updateFsBtn); } catch (e) {}
        /* v1.8 online: al salir de la partida se avisa para que el
           servidor cierre la sala y el rival sepa que te fuiste. */
        try { if (online && online.onLeave) online.onLeave(); } catch (e) {}
        try {
          if (typeof screen !== 'undefined' && screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
        } catch (e) { /* nada que liberar */ }
        try {
          if (hasDoc() && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen();
        } catch (e) { /* nada que cerrar */ }
      }
    };
    raf = requestAnimationFrame(loop);
    return true;
  }

  function closeGame(toProfile) {
    if (current) {
      try { current.stop(); } catch (e) { /* cierre defensivo */ }
      current = null;
    }
    if (gameOv && gameOv.parentNode) gameOv.parentNode.removeChild(gameOv);
    gameOv = null;
    if (toProfile) goProfile();
  }

  /* ---------------- juego online (v1.8) ---------------- */
  function startOnlineGame(id, match) { return startGame(id, { online: match }); }
  function setOnlineOpponentScore(score) { if (current && current.setOnlineOpponentScore) current.setOnlineOpponentScore(score); }
  function setOnlineResult(res) { if (current && current.setOnlineResult) current.setOnlineResult(res); }
  function onlineMove(idx) { if (current && current.onlineMove) return current.onlineMove(idx); return false; }
  function isOnlineGame() { return !!(current && current.online); }
  function getCurrentGameId() { return current ? current.def.id : ''; }

  function init(o) {
    opts = o || {};
    loadData();
    return api;
  }

  /* ======================================================================
     MOTORES DE JUEGO
     Cada fábrica recibe (W, H) y devuelve:
     { update(dt), draw(ctx), key(código), pointer(x,y,fase), swipe(dx,dy),
       score(), over (booleano), hint (texto de controles) }
     ====================================================================== */

  /* ---------------- SERPIENTE ---------------- */
  function snakeEngine(o) {
    var W = LW, H = LH, CELL = 30, COLS = 32, ROWS = 18;
    var snake = [{ x: 8, y: 9 }, { x: 7, y: 9 }, { x: 6, y: 9 }];
    var dir = { x: 1, y: 0 }, queue = []; /* 1.5.43 (8): cola de giros (máx. 3): los giros rápidos ya no se pierden ni se aplican al revés */
    var step = o.speed || 0.14, acc = 0, score = 0, over = false, foods = 0;
    var walls = o.walls || [];
    function isWall(p) {
      for (var i = 0; i < walls.length; i++) if (walls[i].x === p.x && walls[i].y === p.y) return true;
      return false;
    }
    function onSnake(p) {
      for (var i = 0; i < snake.length; i++) if (snake[i].x === p.x && snake[i].y === p.y) return true;
      return false;
    }
    function placeFood() {
      var p, tries = 0;
      do { p = { x: irnd(COLS), y: irnd(ROWS) }; tries++; }
      while ((onSnake(p) || isWall(p) || (o.portals && portalAt(p))) && tries < 500);
      return p;
    }
    function portalAt(p) {
      if (!o.portals) return null;
      for (var i = 0; i < o.portals.length; i++)
        if (o.portals[i].x === p.x && o.portals[i].y === p.y) return o.portals[(i + 1) % o.portals.length];
      return null;
    }
    var food = placeFood();
    var golden = null, goldenT = 0;
    function stepSnake() {
      if (queue.length) dir = queue.shift();
      var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (o.wrap) {
        head.x = (head.x + COLS) % COLS;
        head.y = (head.y + ROWS) % ROWS;
      }
      var portal = portalAt(head);
      if (portal) head = { x: portal.x, y: portal.y };
      if (!o.wrap && (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS)) { over = true; return; }
      if (isWall(head) || onSnake(head)) { over = true; return; }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        score += 10;
        foods++;
        step = Math.max(0.07, step - 0.004); /* 1.5.43 (8): cada comida acelera un poco la serpiente */
        food = placeFood();
        if (o.golden && Math.random() < 0.18) { golden = placeFood(); goldenT = 8; }
      } else if (golden && head.x === golden.x && head.y === golden.y) {
        score += 50; golden = null;
      } else {
        snake.pop();
      }
    }
    return {
      hint: 'Flechas o desliza para girar',
      get over() { return over; },
      get dir() { return { x: dir.x, y: dir.y }; },
      get level() { return 1 + Math.floor(foods / 5); },
      get stepMs() { return step; },
      get head() { return { x: snake[0].x, y: snake[0].y }; },
      get food() { return { x: food.x, y: food.y }; },
      score: function () { return score; },
      key: function (k) {
        var nd = null;
        if (k === 'Up') nd = { x: 0, y: -1 };
        else if (k === 'Down') nd = { x: 0, y: 1 };
        else if (k === 'Left') nd = { x: -1, y: 0 };
        else if (k === 'Right') nd = { x: 1, y: 0 };
        if (!nd) return;
        var last = queue.length ? queue[queue.length - 1] : dir;
        if (nd.x === -last.x && nd.y === -last.y) return; /* no dar la vuelta */
        if (nd.x === last.x && nd.y === last.y) return; /* giro repetido */
        if (queue.length < 3) queue.push(nd);
      },
      swipe: function (dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) this.key(dx > 0 ? 'Right' : 'Left');
        else this.key(dy > 0 ? 'Down' : 'Up');
      },
      pointer: function () {},
      update: function (dt) {
        if (over) return;
        if (goldenT > 0) { goldenT -= dt; if (goldenT <= 0) golden = null; }
        acc += dt;
        while (acc >= step && !over) { acc -= step; stepSnake(); }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
        for (var gx = 0; gx <= COLS; gx++) { ctx.beginPath(); ctx.moveTo(gx * CELL, 0); ctx.lineTo(gx * CELL, H); ctx.stroke(); }
        for (var gy = 0; gy <= ROWS; gy++) { ctx.beginPath(); ctx.moveTo(0, gy * CELL); ctx.lineTo(W, gy * CELL); ctx.stroke(); }
        ctx.fillStyle = '#666';
        for (var w = 0; w < walls.length; w++) ctx.fillRect(walls[w].x * CELL + 1, walls[w].y * CELL + 1, CELL - 2, CELL - 2);
        if (o.portals) {
          ctx.fillStyle = '#7C4DFF';
          for (var p = 0; p < o.portals.length; p++) {
            circle(ctx, o.portals[p].x * CELL + CELL / 2, o.portals[p].y * CELL + CELL / 2, CELL / 2 - 2);
            ctx.fill();
          }
        }
        ctx.fillStyle = GREEN;
        circle(ctx, food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL / 2 - 4); ctx.fill();
        if (golden) {
          ctx.fillStyle = GOLD;
          circle(ctx, golden.x * CELL + CELL / 2, golden.y * CELL + CELL / 2, CELL / 2 - 3); ctx.fill();
        }
        for (var i = snake.length - 1; i >= 0; i--) {
          ctx.fillStyle = i === 0 ? RED : (i % 2 ? '#FF3355' : '#C40020');
          rr(ctx, snake[i].x * CELL + 2, snake[i].y * CELL + 2, CELL - 4, CELL - 4, 7); ctx.fill();
        }
        text(ctx, 'Puntos: ' + score, 10, 22, 18, '#fff', 'left', true);
      }
    };
  }

  function snakeWallsMuro() {
    var w = [];
    for (var x = 0; x < 32; x++) { w.push({ x: x, y: 0 }); w.push({ x: x, y: 17 }); }
    for (var y = 0; y < 18; y++) { w.push({ x: 0, y: y }); w.push({ x: 31, y: y }); }
    for (var i = 5; i <= 10; i++) { w.push({ x: 10, y: i }); w.push({ x: 21, y: 17 - i }); }
    w.push({ x: 15, y: 5 }); w.push({ x: 16, y: 5 }); w.push({ x: 15, y: 12 }); w.push({ x: 16, y: 12 });
    return w;
  }

  /* ---------------- MEMORIA ---------------- */
  function memoryEngine(cols, rows, timeLimit) {
    var W = LW, H = LH;
    var symbols = ['🍎', '🍌', '🍇', '🍓', '🍊', '🍒', '🥝', '🍑', '⚽', '🎸', '🚗', '✈️', '🐶', '🐱', '🦁', '🐸', '🌸', '⭐', '🎁', '🎈', '🍕', '🍔', '🎮', '📚'];
    var pairs = (cols * rows) / 2;
    var deck = shuffle(symbols.slice(0, pairs).concat(symbols.slice(0, pairs)));
    var cards = deck.map(function (s) { return { sym: s, up: false, done: false }; });
    var cw = Math.min(120, Math.floor(880 / cols)), ch = Math.min(110, Math.floor(440 / rows));
    var ox = (W - cols * cw) / 2, oy = 60 + (440 - rows * ch) / 2;
    var first = -1, lock = 0, moves = 0, found = 0, over = false, win = false;
    var timeLeft = timeLimit || 0;
    return {
      hint: 'Toca dos cartas iguales',
      get over() { return over; },
      score: function () { return found * 100 + (win ? Math.max(0, Math.floor(timeLeft)) * 5 : 0); },
      key: function () {},
      swipe: function () {},
      pointer: function (x, y, phase) {
        if (phase !== 'tap' && phase !== 'down') return;
        if (over || lock > 0) return;
        var cx = Math.floor((x - ox) / cw), cy = Math.floor((y - oy) / ch);
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) return;
        var idx = cy * cols + cx, c = cards[idx];
        if (c.up || c.done) return;
        c.up = true;
        if (first < 0) { first = idx; return; }
        moves++;
        if (cards[first].sym === c.sym) {
          cards[first].done = true; c.done = true; found++; first = -1;
          if (found === pairs) { over = true; win = true; }
        } else {
          lock = 0.7;
          var a = first, b = idx; first = -1;
          setTimeout(function () { cards[a].up = false; cards[b].up = false; }, 650);
        }
      },
      update: function (dt) {
        if (over) return;
        if (lock > 0) lock -= dt;
        if (timeLimit) {
          timeLeft -= dt;
          if (timeLeft <= 0) { timeLeft = 0; over = true; }
        }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        text(ctx, 'Parejas: ' + found + '/' + pairs + '   Movimientos: ' + moves + (timeLimit ? '   Tiempo: ' + Math.ceil(timeLeft) + ' s' : ''), W / 2, 28, 20, '#fff', 'center', true);
        for (var i = 0; i < cards.length; i++) {
          var c = cards[i], cx = ox + (i % cols) * cw, cy = oy + Math.floor(i / cols) * ch;
          if (c.done) { ctx.fillStyle = '#1E3A24'; rr(ctx, cx + 4, cy + 4, cw - 8, ch - 8, 10); ctx.fill(); text(ctx, '✓', cx + cw / 2, cy + ch / 2, 30, GREEN, 'center', true); continue; }
          if (c.up) { ctx.fillStyle = '#fff'; rr(ctx, cx + 4, cy + 4, cw - 8, ch - 8, 10); ctx.fill(); text(ctx, c.sym, cx + cw / 2, cy + ch / 2 + 2, 40, '#141419', 'center'); }
          else { ctx.fillStyle = RED; rr(ctx, cx + 4, cy + 4, cw - 8, ch - 8, 10); ctx.fill(); text(ctx, '?', cx + cw / 2, cy + ch / 2, 34, '#fff', 'center', true); }
        }
        if (over) text(ctx, win ? '¡Completado!' : '¡Tiempo agotado!', W / 2, H - 18, 22, GOLD, 'center', true);
      }
    };
  }

  /* ---------------- ROMPEBLOQUES ---------------- */
  function breakoutEngine(o) {
    var W = LW, H = LH;
    var pw = 130, ph = 16, px = W / 2 - pw / 2, py = H - 44;
    var balls = [], bricks = [], lives = 3, score = 0, over = false, win = false;
    var paddleV = 0, broken = 0; /* 1.5.43 (8): velocidad de la paleta y bloques rotos */
    var ready = true, laserCd = 0, shots = [];
    function buildBricks() {
      bricks = [];
      var cols = 8, rows = 5, bw = 100, bh = 24, gap = 8, ox = (W - (cols * bw + (cols - 1) * gap)) / 2;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++)
        bricks.push({ x: ox + c * (bw + gap), y: 52 + r * (bh + 8), w: bw, h: bh, row: r, alive: true });
    }
    function newBall() {
      balls = [{ x: px + pw / 2, y: py - 10, vx: 260, vy: -300, r: 9 }];
      ready = true;
    }
    buildBricks();
    newBall();
    if (o.balls === 3) balls.push({ x: px + pw / 2 - 30, y: py - 10, vx: -240, vy: -320, r: 9 }, { x: px + pw / 2 + 30, y: py - 10, vx: 200, vy: -340, r: 9 });
    var colors = [RED, '#FF7A00', GOLD, GREEN, BLUE];
    return {
      hint: 'Mueve la paleta con el dedo o las flechas · Espacio para lanzar / disparar',
      get over() { return over; },
      get paddleX() { return px; },
      get level() { return 1 + Math.floor(broken / 10); },
      score: function () { return score; },
      key: function (k) {
        if (k === 'Left') paddleV = -560;
        else if (k === 'Right') paddleV = 560;
        else if (k === 'Space') {
          if (ready) { ready = false; return; }
          if (o.laser && laserCd <= 0) { shots.push({ x: px + pw / 2, y: py - 6 }); laserCd = 0.5; }
        }
      },
      swipe: function (dx) { px = clamp(px + dx, 0, W - pw); },
      pointer: function (x, y, phase) {
        if (phase === 'move') px = clamp(x - pw / 2, 0, W - pw);
        else if (phase === 'tap') { if (ready) ready = false; }
      },
      update: function (dt) {
        if (over) return;
        if (laserCd > 0) laserCd -= dt;
        if (paddleV !== 0) { px = clamp(px + paddleV * dt, 0, W - pw); paddleV = glide(paddleV, dt); if (Math.abs(paddleV) < 12) paddleV = 0; }
        for (var s = shots.length - 1; s >= 0; s--) {
          shots[s].y -= 620 * dt;
          var hit = false;
          for (var b = 0; b < bricks.length; b++) {
            var br = bricks[b];
            if (br.alive && shots[s].x >= br.x && shots[s].x <= br.x + br.w && shots[s].y >= br.y && shots[s].y <= br.y + br.h) {
              br.alive = false; score += 10; broken++; hit = true; break;
            }
          }
          if (hit || shots[s].y < 0) shots.splice(s, 1);
        }
        if (ready) {
          balls[0].x = px + pw / 2; balls[0].y = py - 10;
          return;
        }
        for (var i = balls.length - 1; i >= 0; i--) {
          var ball = balls[i];
          ball.x += ball.vx * dt; ball.y += ball.vy * dt;
          if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
          if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); }
          if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }
          if (ball.vy > 0 && ball.y + ball.r >= py && ball.y + ball.r <= py + ph + 12 && ball.x >= px - ball.r && ball.x <= px + pw + ball.r) {
            var off = (ball.x - (px + pw / 2)) / (pw / 2);
            var sp = Math.min(520 + broken, Math.hypot(ball.vx, ball.vy) + 8); /* 1.5.43 (8): la bola acelera al romper bloques */
            ball.vy = -Math.abs(ball.vy);
            ball.vx = off * sp * 0.85;
            ball.y = py - ball.r;
          }
          for (var j = 0; j < bricks.length; j++) {
            var bk = bricks[j];
            if (!bk.alive) continue;
            if (ball.x + ball.r >= bk.x && ball.x - ball.r <= bk.x + bk.w && ball.y + ball.r >= bk.y && ball.y - ball.r <= bk.y + bk.h) {
              bk.alive = false; score += 10 + (4 - bk.row) * 5; broken++;
              ball.vy = -ball.vy;
              break;
            }
          }
          if (ball.y - ball.r > H) balls.splice(i, 1);
        }
        if (balls.length === 0) {
          lives--;
          if (lives <= 0) { over = true; return; }
          newBall();
        }
        var left = bricks.some(function (bk) { return bk.alive; });
        if (!left) { score += 500; over = true; win = true; }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        for (var i = 0; i < bricks.length; i++) {
          var bk = bricks[i];
          if (!bk.alive) continue;
          ctx.fillStyle = colors[bk.row % colors.length];
          rr(ctx, bk.x, bk.y, bk.w, bk.h, 6); ctx.fill();
        }
        ctx.fillStyle = RED; rr(ctx, px, py, pw, ph, 8); ctx.fill();
        ctx.fillStyle = '#fff';
        for (var b = 0; b < balls.length; b++) { circle(ctx, balls[b].x, balls[b].y, balls[b].r); ctx.fill(); }
        ctx.fillStyle = GOLD;
        for (var s = 0; s < shots.length; s++) ctx.fillRect(shots[s].x - 3, shots[s].y - 12, 6, 14);
        text(ctx, 'Vidas: ' + '❤'.repeat(Math.max(0, lives)) + '   Puntos: ' + score, 12, 24, 18, '#fff', 'left', true);
        if (ready) text(ctx, 'Toca o pulsa Espacio para lanzar', W / 2, H / 2, 22, GOLD, 'center', true);
        if (over && win) text(ctx, '¡Nivel superado!', W / 2, H / 2, 30, GOLD, 'center', true);
      }
    };
  }

  /* ---------------- PONG ---------------- */
  function pongEngine(mode) {
    var W = LW, H = LH;
    var ph = 110, pw = 14;
    var pY = H / 2 - ph / 2, aY = H / 2 - ph / 2;
    var pV = 0; /* 1.5.43 (8): velocidad de la paleta del jugador */
    var ball = { x: W / 2, y: H / 2, vx: 320, vy: 180, r: 10 };
    var pScore = 0, aScore = 0, rally = 0, over = false, win = false;
    function resetBall(dir) {
      ball.x = W / 2; ball.y = H / 2;
      ball.vx = 320 * (dir || (Math.random() < 0.5 ? -1 : 1));
      ball.vy = (Math.random() * 240 - 120);
    }
    return {
      hint: mode === 'ai' ? 'Sube y baja con las flechas o el dedo' : 'Mueve la paleta: no dejes caer la bola',
      get over() { return over; },
      get paddleY() { return pY; },
      score: function () { return mode === 'ai' ? pScore * 100 : rally; },
      key: function (k) {
        if (mode === 'ai') {
          if (k === 'Up') pV = -520;
          else if (k === 'Down') pV = 520;
        } else {
          if (k === 'Left') pV = -520;
          else if (k === 'Right') pV = 520;
        }
      },
      swipe: function (dx, dy) {
        if (mode === 'ai') pY = clamp(pY + dy, 0, H - ph);
        else pY = clamp(pY + dx, 0, W - 140);
      },
      pointer: function (x, y, phase) {
        if (phase === 'move' || phase === 'down') {
          if (mode === 'ai') pY = clamp(y - ph / 2, 0, H - ph);
          else pY = clamp(x - 70, 0, W - 140);
        }
      },
      update: function (dt) {
        if (over) return;
        if (pV !== 0) { pY = clamp(pY + pV * dt, 0, mode === 'ai' ? H - ph : W - 140); pV = glide(pV, dt); if (Math.abs(pV) < 12) pV = 0; }
        if (mode === 'ai') {
          var target = ball.y - ph / 2;
          var diff = target - aY;
          aY += clamp(diff, -260 * dt, 260 * dt);
          aY = clamp(aY, 0, H - ph);
          ball.x += ball.vx * dt; ball.y += ball.vy * dt;
          if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }
          if (ball.y > H - ball.r) { ball.y = H - ball.r; ball.vy = -Math.abs(ball.vy); }
          if (ball.vx < 0 && ball.x - ball.r <= 20 + pw && ball.x > 20 && ball.y >= pY && ball.y <= pY + ph) {
            ball.x = 20 + pw + ball.r; ball.vx = Math.abs(ball.vx) + 12;
            ball.vy += (ball.y - (pY + ph / 2)) * 4;
          }
          if (ball.vx > 0 && ball.x + ball.r >= W - 20 - pw && ball.x < W - 20 && ball.y >= aY && ball.y <= aY + ph) {
            ball.x = W - 20 - pw - ball.r; ball.vx = -(Math.abs(ball.vx) + 12);
            ball.vy += (ball.y - (aY + ph / 2)) * 4;
          }
          if (ball.x < -20) { aScore++; if (aScore >= 7) { over = true; win = false; } else resetBall(1); }
          if (ball.x > W + 20) { pScore++; if (pScore >= 7) { over = true; win = true; } else resetBall(-1); }
        } else {
          /* modo pared: paleta inferior, la bola rebota en las paredes */
          var padW = 140, padY = H - 30;
          ball.x += ball.vx * dt; ball.y += ball.vy * dt;
          if (ball.x < ball.r) { ball.x = ball.r; ball.vx = Math.abs(ball.vx); }
          if (ball.x > W - ball.r) { ball.x = W - ball.r; ball.vx = -Math.abs(ball.vx); }
          if (ball.y < ball.r) { ball.y = ball.r; ball.vy = Math.abs(ball.vy); }
          if (ball.vy > 0 && ball.y + ball.r >= padY && ball.y <= padY + 16 && ball.x >= pY && ball.x <= pY + padW) {
            ball.y = padY - ball.r;
            ball.vy = -(Math.abs(ball.vy) + 14);
            ball.vx += (ball.x - (pY + padW / 2)) * 3;
            rally++;
          }
          if (ball.y - ball.r > H) over = true;
        }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = 'rgba(255,255,255,.15)';
        if (mode === 'ai') {
          for (var y = 0; y < H; y += 24) ctx.fillRect(W / 2 - 2, y, 4, 12);
          ctx.fillStyle = RED; ctx.fillRect(20, pY, pw, ph);
          ctx.fillStyle = '#fff'; ctx.fillRect(W - 20 - pw, aY, pw, ph);
          text(ctx, pScore + '  :  ' + aScore, W / 2, 34, 34, '#fff', 'center', true);
          text(ctx, 'Primero en llegar a 7 gana', W / 2, H - 20, 15, '#999', 'center');
          if (over) text(ctx, win ? '¡Ganaste el partido!' : 'La máquina ganó', W / 2, H / 2, 30, GOLD, 'center', true);
        } else {
          ctx.fillStyle = RED; ctx.fillRect(pY, H - 30, 140, 16);
          ctx.fillStyle = '#fff'; circle(ctx, ball.x, ball.y, ball.r); ctx.fill();
          text(ctx, 'Rebotes: ' + rally, W / 2, 34, 30, '#fff', 'center', true);
        }
        if (mode === 'ai') { ctx.fillStyle = '#fff'; circle(ctx, ball.x, ball.y, ball.r); ctx.fill(); }
      }
    };
  }

  /* ---------------- VUELO (estilo flappy) ---------------- */
  function flappyEngine(o) {
    var W = LW, H = LH;
    var bird = { x: 220, y: H / 2, vy: 0, r: 20 };
    var pipes = [], spawnT = 1, score = 0, over = false;
    var speed = o.speed || 170, gap = o.gap || 160;
    var passed = 0, curSpeed = speed; /* 1.5.43 (8): la velocidad sube con cada tubería superada */
    function flap() { if (!over) bird.vy = -430; }
    return {
      hint: 'Toca o pulsa Espacio para aletear',
      get over() { return over; },
      get speed() { return curSpeed; },
      get birdY() { return bird.y; },
      score: function () { return score; },
      key: function (k) { if (k === 'Space' || k === 'Up') flap(); },
      swipe: function () { flap(); },
      pointer: function (x, y, phase) { if (phase === 'tap' || phase === 'down') flap(); },
      update: function (dt) {
        if (over) return;
        bird.vy += 1350 * dt;
        bird.y += bird.vy * dt;
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnT = 1.7;
          var gy = 90 + Math.random() * (H - 180 - gap);
          pipes.push({ x: W + 20, gapY: gy, passed: false });
        }
        for (var i = pipes.length - 1; i >= 0; i--) {
          var p = pipes[i];
          p.x -= curSpeed * dt;
          if (!p.passed && p.x + 70 < bird.x) { p.passed = true; score++; passed++; curSpeed = Math.min(speed + 90, speed + passed * 6); }
          if (p.x < -90) pipes.splice(i, 1);
          var inX = bird.x + bird.r > p.x && bird.x - bird.r < p.x + 70;
          if (inX && (bird.y - bird.r < p.gapY || bird.y + bird.r > p.gapY + gap)) over = true;
        }
        if (bird.y + bird.r >= H - 8 || bird.y - bird.r <= 0) over = true;
      },
      draw: function (ctx) {
        ctx.fillStyle = '#7EC8E3'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#8ED081';
        for (var i = 0; i < pipes.length; i++) {
          var p = pipes[i];
          ctx.fillRect(p.x, 0, 70, p.gapY);
          ctx.fillRect(p.x, p.gapY + gap, 70, H - p.gapY - gap);
          ctx.fillStyle = '#5DA85A';
          ctx.fillRect(p.x - 3, p.gapY - 22, 76, 22);
          ctx.fillRect(p.x - 3, p.gapY + gap, 76, 22);
          ctx.fillStyle = '#8ED081';
        }
        ctx.fillStyle = '#6B8E23'; ctx.fillRect(0, H - 8, W, 8);
        ctx.fillStyle = GOLD;
        circle(ctx, bird.x, bird.y, bird.r); ctx.fill();
        ctx.fillStyle = '#FF8C00';
        ctx.beginPath(); ctx.moveTo(bird.x + bird.r - 2, bird.y); ctx.lineTo(bird.x + bird.r + 16, bird.y + 5); ctx.lineTo(bird.x + bird.r - 2, bird.y + 10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#141419'; circle(ctx, bird.x + 7, bird.y - 6, 4); ctx.fill();
        text(ctx, String(score), W / 2, 60, 48, '#fff', 'center', true);
      }
    };
  }

  /* ---------------- BLOQUES (tetris sencillo) ---------------- */
  function tetrisEngine(o) {
    var W = LW, H = LH;
    var COLS = 10, ROWS = 20, CELL = 24;
    var ox = 340, oy = 20;
    var SHAPES = [
      [[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]],
      [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]],
      [[0, 1, 1], [1, 1, 0]], [[1, 1, 0], [0, 1, 1]]
    ];
    var COLORS = ['#00BCD4', GOLD, '#9C27B0', '#FF9800', BLUE, GREEN, RED];
    var board = [];
    for (var r = 0; r < ROWS; r++) { board.push([]); for (var c = 0; c < COLS; c++) board[r].push(0); }
    var score = 0, lines = 0, over = false, level = 1;
    var fall = o.speed || 0.8, acc = 0;
    var cur = null, next = irnd(SHAPES.length);
    function spawn() {
      var t = next; next = irnd(SHAPES.length);
      cur = { shape: SHAPES[t], color: COLORS[t], x: 3, y: 0 };
      if (collides(cur.shape, cur.x, cur.y)) over = true;
    }
    function collides(shape, x, y) {
      for (var r = 0; r < shape.length; r++) for (var c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        var bx = x + c, by = y + r;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
      return false;
    }
    function rotate(shape) {
      var out = [];
      for (var c = 0; c < shape[0].length; c++) {
        out.push([]);
        for (var r = shape.length - 1; r >= 0; r--) out[c].push(shape[r][c]);
      }
      return out;
    }
    function lock() {
      for (var r = 0; r < cur.shape.length; r++) for (var c = 0; c < cur.shape[r].length; c++) {
        if (cur.shape[r][c] && cur.y + r >= 0) board[cur.y + r][cur.x + c] = cur.color;
      }
      var cleared = 0;
      for (var y = ROWS - 1; y >= 0; y--) {
        var full = true;
        for (var x = 0; x < COLS; x++) if (!board[y][x]) { full = false; break; }
        if (full) { board.splice(y, 1); board.unshift(new Array(COLS).fill(0)); cleared++; y++; }
      }
      if (cleared) { lines += cleared; score += [0, 100, 300, 500, 800][cleared] * level; level = 1 + Math.floor(lines / 10); }
      spawn();
    }
    spawn();
    return {
      hint: 'Flechas para mover · Arriba gira · Abajo baja rápido',
      get over() { return over; },
      get level() { return level; },
      score: function () { return score; },
      key: function (k) {
        if (over || !cur) return;
        if (k === 'Left' && !collides(cur.shape, cur.x - 1, cur.y)) cur.x--;
        else if (k === 'Right' && !collides(cur.shape, cur.x + 1, cur.y)) cur.x++;
        else if (k === 'Down') { if (!collides(cur.shape, cur.x, cur.y + 1)) cur.y++; else lock(); acc = 0; }
        else if (k === 'Up') {
          var rot = rotate(cur.shape);
          if (!collides(rot, cur.x, cur.y)) cur.shape = rot;
        } else if (k === 'Space') {
          while (!collides(cur.shape, cur.x, cur.y + 1)) cur.y++;
          lock(); acc = 0;
        }
      },
      swipe: function (dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) this.key(dx > 0 ? 'Right' : 'Left');
        else if (dy > 0) this.key('Down');
        else this.key('Up');
      },
      pointer: function (x, y, phase) {
        if (phase !== 'tap') return;
        if (x < ox) this.key('Left');
        else if (x > ox + COLS * CELL) this.key('Right');
        else this.key('Up');
      },
      update: function (dt) {
        if (over || !cur) return;
        acc += dt;
        var interval = Math.max(0.12, fall - (level - 1) * 0.06);
        if (acc >= interval) {
          acc = 0;
          if (!collides(cur.shape, cur.x, cur.y + 1)) cur.y++;
          else lock();
        }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#1C1C22'; ctx.fillRect(ox - 4, oy - 4, COLS * CELL + 8, ROWS * CELL + 8);
        ctx.strokeStyle = 'rgba(255,255,255,.06)';
        for (var gx = 0; gx <= COLS; gx++) { ctx.beginPath(); ctx.moveTo(ox + gx * CELL, oy); ctx.lineTo(ox + gx * CELL, oy + ROWS * CELL); ctx.stroke(); }
        for (var gy = 0; gy <= ROWS; gy++) { ctx.beginPath(); ctx.moveTo(ox, oy + gy * CELL); ctx.lineTo(ox + COLS * CELL, oy + gy * CELL); ctx.stroke(); }
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
          if (board[r][c]) { ctx.fillStyle = board[r][c]; ctx.fillRect(ox + c * CELL + 1, oy + r * CELL + 1, CELL - 2, CELL - 2); }
        }
        if (cur) {
          ctx.fillStyle = cur.color;
          for (var pr = 0; pr < cur.shape.length; pr++) for (var pc = 0; pc < cur.shape[pr].length; pc++)
            if (cur.shape[pr][pc]) ctx.fillRect(ox + (cur.x + pc) * CELL + 1, oy + (cur.y + pr) * CELL + 1, CELL - 2, CELL - 2);
        }
        text(ctx, 'Puntos', 660, 60, 20, '#fff', 'left', true);
        text(ctx, String(score), 660, 92, 30, GOLD, 'left', true);
        text(ctx, 'Nivel ' + level, 660, 140, 20, '#fff', 'left');
        text(ctx, 'Líneas: ' + lines, 660, 170, 20, '#fff', 'left');
        text(ctx, 'Siguiente:', 660, 220, 18, '#bbb', 'left');
        var ns = SHAPES[next];
        ctx.fillStyle = COLORS[next];
        for (var nr = 0; nr < ns.length; nr++) for (var nc = 0; nc < ns[nr].length; nc++)
          if (ns[nr][nc]) ctx.fillRect(660 + nc * 22, 240 + nr * 22, 20, 20);
        if (over) text(ctx, '¡Tablero lleno!', W / 2, H / 2, 30, GOLD, 'center', true);
      }
    };
  }

  /* ---------------- FUSIÓN 2048 ---------------- */
  function fusionEngine(size) {
    var W = LW, H = LH;
    var cell = size === 3 ? 150 : 108;
    var ox = (W - size * cell) / 2, oy = (H - size * cell) / 2 + 10;
    var grid = [], score = 0, over = false, won = false;
    var target = size === 3 ? 512 : 2048;
    for (var i = 0; i < size; i++) { grid.push([]); for (var j = 0; j < size; j++) grid[i].push(0); }
    function emptyCells() {
      var out = [];
      for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) if (!grid[r][c]) out.push({ r: r, c: c });
      return out;
    }
    function spawn() {
      var e = emptyCells();
      if (!e.length) return;
      var p = pick(e);
      grid[p.r][p.c] = Math.random() < 0.9 ? 2 : 4;
    }
    function canMove() {
      if (emptyCells().length) return true;
      for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) {
        if (c + 1 < size && grid[r][c] === grid[r][c + 1]) return true;
        if (r + 1 < size && grid[r][c] === grid[r + 1][c]) return true;
      }
      return false;
    }
    function slideLine(line) {
      var arr = line.filter(function (v) { return v !== 0; });
      for (var i = 0; i < arr.length - 1; i++) {
        if (arr[i] === arr[i + 1]) { arr[i] *= 2; score += arr[i]; if (arr[i] >= target) won = true; arr.splice(i + 1, 1); }
      }
      while (arr.length < size) arr.push(0);
      return arr;
    }
    function move(dir) {
      if (over) return;
      var before = JSON.stringify(grid);
      var r, c, line;
      if (dir === 'Left' || dir === 'Right') {
        for (r = 0; r < size; r++) {
          line = grid[r].slice();
          if (dir === 'Right') line.reverse();
          line = slideLine(line);
          if (dir === 'Right') line.reverse();
          grid[r] = line;
        }
      } else {
        for (c = 0; c < size; c++) {
          line = [];
          for (r = 0; r < size; r++) line.push(grid[r][c]);
          if (dir === 'Down') line.reverse();
          line = slideLine(line);
          if (dir === 'Down') line.reverse();
          for (r = 0; r < size; r++) grid[r][c] = line[r];
        }
      }
      if (JSON.stringify(grid) !== before) {
        spawn();
        if (!canMove()) over = true;
      }
    }
    spawn(); spawn();
    var colors = { 2: '#EEE4DA', 4: '#EDE0C8', 8: '#F2B179', 16: '#F59563', 32: '#F67C5F', 64: '#F65E3B', 128: '#EDCF72', 256: '#EDCC61', 512: '#EDC850', 1024: '#EDC53F', 2048: '#EDC22E', 4096: '#E60026' };
    return {
      hint: 'Flechas o desliza para mover las fichas',
      get over() { return over; },
      score: function () { return score; },
      key: function (k) { if (['Up', 'Down', 'Left', 'Right'].indexOf(k) >= 0) move(k); },
      swipe: function (dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'Right' : 'Left');
        else move(dy > 0 ? 'Down' : 'Up');
      },
      pointer: function () {},
      update: function () {},
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        text(ctx, 'Une iguales hasta llegar a ' + target, W / 2, 30, 20, '#fff', 'center', true);
        text(ctx, 'Puntos: ' + score, W / 2, 58, 18, GOLD, 'center', true);
        ctx.fillStyle = '#1C1C22'; rr(ctx, ox - 8, oy - 8, size * cell + 16, size * cell + 16, 12); ctx.fill();
        for (var r = 0; r < size; r++) for (var c = 0; c < size; c++) {
          var v = grid[r][c];
          ctx.fillStyle = v ? (colors[v] || '#3D3D46') : '#2A2A32';
          rr(ctx, ox + c * cell + 4, oy + r * cell + 4, cell - 8, cell - 8, 10); ctx.fill();
          if (v) text(ctx, String(v), ox + c * cell + cell / 2, oy + r * cell + cell / 2, v >= 100 ? 30 : 38, v <= 4 ? '#5A4A3A' : '#fff', 'center', true);
        }
        if (won) text(ctx, '¡Llegaste a ' + target + '! Sigue sumando', W / 2, H - 14, 18, GOLD, 'center', true);
        if (over) text(ctx, 'Sin movimientos', W / 2, H - 14, 20, RED, 'center', true);
      }
    };
  }

  /* ---------------- DISPAROS ---------------- */
  function shooterEngine(mode) {
    var W = LW, H = LH;
    var player = { x: W / 2, y: H - 60, w: 56, h: 30, lives: 3, cd: 0, inv: 0 };
    var pvx = 0; /* 1.5.43 (8): velocidad lateral del jugador */
    var bullets = [], foes = [], fbullets = [], parts = [];
    var score = 0, over = false, win = false, t = 0;
    var invDir = 1, invT = 0, spawnT = 0, timeLeft = mode === 'blanco' ? 30 : 0;
    function buildInvaders() {
      foes = [];
      for (var r = 0; r < 4; r++) for (var c = 0; c < 8; c++)
        foes.push({ x: 90 + c * 95, y: 60 + r * 48, w: 56, h: 30, alive: true, row: r });
    }
    function spawnAsteroid(big) {
      var r = big ? 34 : (Math.random() < 0.5 ? 22 : 13);
      foes.push({ x: 40 + Math.random() * (W - 80), y: -40, vx: (Math.random() * 60 - 30), vy: 90 + Math.random() * 90, r: r, rot: Math.random() * 6, vr: Math.random() * 2 - 1 });
    }
    function spawnTarget() {
      var kind = Math.random();
      foes.push({
        x: 60 + Math.random() * (W - 120), y: 70 + Math.random() * (H - 180),
        r: kind < 0.12 ? 26 : 34, kind: kind < 0.12 ? 'oro' : (kind < 0.24 ? 'bomba' : 'normal'),
        life: kind < 0.12 ? 0.9 : 1.6
      });
    }
    if (mode === 'invasores') buildInvaders();
    function shoot() {
      if (player.cd > 0 || over) return;
      player.cd = 0.28;
      bullets.push({ x: player.x, y: player.y - 20, vy: -620 });
    }
    return {
      hint: mode === 'blanco' ? 'Toca los blancos: oro vale más, evita las bombas' : 'Flechas para moverte · Espacio o toque para disparar',
      get over() { return over; },
      get playerX() { return player.x; },
      score: function () { return score; },
      key: function (k) {
        if (k === 'Left') pvx = -520;
        else if (k === 'Right') pvx = 520;
        else if (k === 'Space') shoot();
      },
      swipe: function (dx) { player.x = clamp(player.x + dx, 30, W - 30); },
      pointer: function (x, y, phase) {
        if (mode === 'blanco') {
          if (phase !== 'tap') return;
          for (var i = foes.length - 1; i >= 0; i--) {
            var f = foes[i];
            if (Math.hypot(x - f.x, y - f.y) <= f.r + 6) {
              if (f.kind === 'bomba') { score = Math.max(0, score - 20); }
              else if (f.kind === 'oro') { score += 30; }
              else { score += 10; }
              parts.push({ x: f.x, y: f.y, t: 0.3 });
              foes.splice(i, 1);
              return;
            }
          }
          return;
        }
        if (phase === 'move' || phase === 'down') player.x = clamp(x, 30, W - 30);
        else if (phase === 'tap') shoot();
      },
      update: function (dt) {
        if (over) return;
        t += dt;
        if (pvx !== 0) { player.x = clamp(player.x + pvx * dt, 30, W - 30); pvx = glide(pvx, dt); if (Math.abs(pvx) < 12) pvx = 0; }
        if (player.cd > 0) player.cd -= dt;
        if (player.inv > 0) player.inv -= dt;
        if (mode === 'blanco') {
          timeLeft -= dt;
          spawnT -= dt;
          if (spawnT <= 0) { spawnT = 0.7; spawnTarget(); }
          for (var i = foes.length - 1; i >= 0; i--) {
            foes[i].life -= dt;
            if (foes[i].life <= 0) foes.splice(i, 1);
          }
          if (timeLeft <= 0) { timeLeft = 0; over = true; }
          return;
        }
        if (mode === 'asteroides') {
          spawnT -= dt;
          if (spawnT <= 0) { spawnT = Math.max(0.45, 0.9 - t * 0.01); spawnAsteroid(true); } /* 1.5.43 (8): caen más asteroides con el tiempo */
        }
        for (var b = bullets.length - 1; b >= 0; b--) {
          bullets[b].y += bullets[b].vy * dt;
          if (bullets[b].y < -10) bullets.splice(b, 1);
        }
        for (var f = fbullets.length - 1; f >= 0; f--) {
          fbullets[f].y += fbullets[f].vy * dt;
          if (fbullets[f].y > H + 10) { fbullets.splice(f, 1); continue; }
          if (Math.abs(fbullets[f].x - player.x) < 28 && Math.abs(fbullets[f].y - player.y) < 24 && player.inv <= 0) {
            fbullets.splice(f, 1);
            player.lives--; player.inv = 1.5;
            if (player.lives <= 0) over = true;
          }
        }
        if (mode === 'invasores') {
          invT -= dt;
          if (invT <= 0) {
            var aliveCount = foes.filter(function (f2) { return f2.alive; }).length;
            invT = Math.max(0.25, 0.55 - (32 - aliveCount) * 0.01); /* 1.5.43 (8): la flota avanza más rápido al quedar menos invasores */
            var edge = false;
            for (var k = 0; k < foes.length; k++) {
              if (!foes[k].alive) continue;
              foes[k].x += 14 * invDir;
              if (foes[k].x < 30 || foes[k].x > W - 90) edge = true;
            }
            if (edge) {
              invDir *= -1;
              for (var m = 0; m < foes.length; m++) foes[m].y += 18;
            }
          }
          if (Math.random() < dt * 1.4) {
            var alive = foes.filter(function (f2) { return f2.alive; });
            if (alive.length) {
              var s = pick(alive);
              fbullets.push({ x: s.x + s.w / 2, y: s.y + s.h, vy: 260 });
            }
          }
          for (var j = 0; j < foes.length; j++) {
            var iv = foes[j];
            if (!iv.alive) continue;
            if (iv.y + iv.h >= player.y - 10) { over = true; return; }
            for (var bb = bullets.length - 1; bb >= 0; bb--) {
              var bl = bullets[bb];
              if (bl.x >= iv.x && bl.x <= iv.x + iv.w && bl.y >= iv.y && bl.y <= iv.y + iv.h) {
                iv.alive = false; bullets.splice(bb, 1);
                score += iv.row === 0 ? 30 : 10;
                break;
              }
            }
          }
          if (!foes.some(function (f2) { return f2.alive; })) { score += 500; over = true; win = true; }
        } else if (mode === 'asteroides') {
          for (var a = foes.length - 1; a >= 0; a--) {
            var as = foes[a];
            as.x += as.vx * dt; as.y += as.vy * dt; as.rot += as.vr * dt;
            if (as.x < -50) as.x = W + 40; if (as.x > W + 50) as.x = -40;
            if (player.inv <= 0 && Math.hypot(as.x - player.x, as.y - player.y) < as.r + 22) {
              foes.splice(a, 1);
              player.lives--; player.inv = 1.5;
              if (player.lives <= 0) { over = true; return; }
              continue;
            }
            for (var cb = bullets.length - 1; cb >= 0; cb--) {
              var cbl = bullets[cb];
              if (Math.hypot(cbl.x - as.x, cbl.y - as.y) <= as.r + 4) {
                bullets.splice(cb, 1);
                score += as.r >= 30 ? 20 : (as.r >= 18 ? 30 : 50);
                parts.push({ x: as.x, y: as.y, t: 0.3 });
                foes.splice(a, 1);
                break;
              }
            }
            if (as.y > H + 60) foes.splice(a, 1);
          }
        }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#0A0A18'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#fff';
        for (var s = 0; s < 40; s++) {
          var sx = (s * 173) % W, sy = (s * 97) % H;
          ctx.fillRect(sx, sy, 2, 2);
        }
        if (mode === 'invasores') {
          for (var i = 0; i < foes.length; i++) {
            var f = foes[i];
            if (!f.alive) continue;
            ctx.fillStyle = f.row === 0 ? GOLD : (f.row === 1 ? '#FF7A00' : GREEN);
            rr(ctx, f.x, f.y, f.w, f.h, 6); ctx.fill();
            ctx.fillStyle = '#141419';
            ctx.fillRect(f.x + 12, f.y + 10, 8, 8); ctx.fillRect(f.x + f.w - 20, f.y + 10, 8, 8);
          }
        } else if (mode === 'asteroides') {
          for (var a = 0; a < foes.length; a++) {
            var as = foes[a];
            ctx.save();
            ctx.translate(as.x, as.y); ctx.rotate(as.rot);
            ctx.fillStyle = '#9E9E9E';
            ctx.beginPath();
            for (var v = 0; v < 8; v++) {
              var ang = v * Math.PI / 4, rad = as.r * (0.8 + (v % 2) * 0.25);
              if (v === 0) ctx.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
              else ctx.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
            }
            ctx.closePath(); ctx.fill();
            ctx.restore();
          }
        } else {
          for (var tg = 0; tg < foes.length; tg++) {
            var g = foes[tg];
            ctx.fillStyle = g.kind === 'oro' ? GOLD : (g.kind === 'bomba' ? '#222' : RED);
            circle(ctx, g.x, g.y, g.r); ctx.fill();
            ctx.fillStyle = '#fff';
            circle(ctx, g.x, g.y, g.r - 10); ctx.fill();
            ctx.fillStyle = g.kind === 'oro' ? GOLD : (g.kind === 'bomba' ? '#222' : RED);
            circle(ctx, g.x, g.y, g.r - 18); ctx.fill();
            if (g.kind === 'bomba') text(ctx, '💣', g.x, g.y + 1, 26, '#fff', 'center');
          }
        }
        for (var p = 0; p < parts.length; p++) {
          ctx.fillStyle = 'rgba(255,196,0,' + Math.max(0, parts[p].t * 3) + ')';
          circle(ctx, parts[p].x, parts[p].y, 26); ctx.fill();
        }
        ctx.fillStyle = GOLD;
        for (var b = 0; b < bullets.length; b++) ctx.fillRect(bullets[b].x - 3, bullets[b].y - 12, 6, 14);
        ctx.fillStyle = RED;
        for (var fb = 0; fb < fbullets.length; fb++) { circle(ctx, fbullets[fb].x, fbullets[fb].y, 5); ctx.fill(); }
        if (player.inv <= 0 || Math.floor(t * 10) % 2 === 0) {
          ctx.fillStyle = RED;
          ctx.beginPath();
          ctx.moveTo(player.x, player.y - 18);
          ctx.lineTo(player.x - 26, player.y + 14);
          ctx.lineTo(player.x + 26, player.y + 14);
          ctx.closePath(); ctx.fill();
        }
        text(ctx, 'Puntos: ' + score + '   Vidas: ' + '❤'.repeat(Math.max(0, player.lives)), 12, 24, 18, '#fff', 'left', true);
        if (mode === 'blanco') text(ctx, 'Tiempo: ' + Math.ceil(timeLeft) + ' s', W - 12, 24, 18, '#fff', 'right', true);
        if (over && win) text(ctx, '¡Flota destruida! +500', W / 2, H / 2, 30, GOLD, 'center', true);
        else if (over) text(ctx, mode === 'blanco' ? '¡Tiempo terminado!' : '¡Nave destruida!', W / 2, H / 2, 30, GOLD, 'center', true);
      }
    };
  }

  /* ---------------- CORREDOR ---------------- */
  function runnerEngine(mode) {
    var W = LW, H = LH;
    var score = 0, over = false, t = 0;
    var groundY = 460;
    var player = { x: 140, y: groundY - 40, vy: 0, jumping: false, w: 40, h: 56 };
    var pvx = 0; /* 1.5.43 (8): velocidad lateral del jugador */
    var obstacles = [], items = [], spawnT = 0;
    var plats = [], camY = 0, maxH = 0, velY = 0;
    if (mode === 'nubes') {
      plats = [{ x: 100, y: 500, w: 180 }, { x: 400, y: 420, w: 160 }, { x: 700, y: 340, w: 160 }, { x: 250, y: 250, w: 150 }];
      player.x = 160; player.y = 440; velY = -520;
    }
    function jump() {
      if (mode === 'salto' && !player.jumping) { player.vy = -640; player.jumping = true; }
      if (mode === 'nubes') { /* el salto es automático al rebotar */ }
    }
    return {
      hint: mode === 'salto' ? 'Espacio o toque para saltar' : (mode === 'esquiva' ? 'Flechas o dedo para esquivar' : 'Flechas o dedo para moverte en el aire'),
      get over() { return over; },
      get playerX() { return player.x; },
      score: function () { return Math.floor(score); },
      key: function (k) {
        if (mode === 'salto') { if (k === 'Space' || k === 'Up') jump(); }
        else if (mode === 'esquiva') {
          if (k === 'Left') pvx = -560;
          else if (k === 'Right') pvx = 560;
        } else {
          if (k === 'Left') pvx = -560;
          else if (k === 'Right') pvx = 560;
        }
      },
      swipe: function (dx) {
        if (mode === 'salto') { if (dx === 0) jump(); }
        else player.x = clamp(player.x + dx, 20, W - 20);
      },
      pointer: function (x, y, phase) {
        if (mode === 'salto') { if (phase === 'tap' || phase === 'down') jump(); }
        else if (phase === 'move' || phase === 'down') player.x = clamp(x, 20, W - 20);
      },
      update: function (dt) {
        if (over) return;
        t += dt;
        if (mode === 'salto') {
          var speed = 260 + Math.min(320, t * 12);
          score += dt * 10;
          player.vy += 1900 * dt;
          player.y += player.vy * dt;
          if (player.y >= groundY - player.h) { player.y = groundY - player.h; player.vy = 0; player.jumping = false; }
          spawnT -= dt;
          if (spawnT <= 0) {
            spawnT = 0.9 + Math.random() * 0.7;
            obstacles.push({ x: W + 20, w: 26 + Math.random() * 22, h: 44 + Math.random() * 26 });
          }
          for (var i = obstacles.length - 1; i >= 0; i--) {
            obstacles[i].x -= speed * dt;
            if (obstacles[i].x < -60) obstacles.splice(i, 1);
            else if (player.x + player.w - 8 > obstacles[i].x && player.x + 8 < obstacles[i].x + obstacles[i].w &&
              player.y + player.h - 6 > groundY - obstacles[i].h) over = true;
          }
        } else if (mode === 'esquiva') {
          if (pvx !== 0) { player.x = clamp(player.x + pvx * dt, 30, W - 30); pvx = glide(pvx, dt); if (Math.abs(pvx) < 12) pvx = 0; }
          score += dt * 10;
          spawnT -= dt;
          if (spawnT <= 0) {
            spawnT = 0.55;
            items.push({ x: 40 + Math.random() * (W - 80), y: -30, vy: 200 + Math.min(260, t * 10), s: 30 + Math.random() * 18 });
          }
          for (var j = items.length - 1; j >= 0; j--) {
            items[j].y += items[j].vy * dt;
            if (items[j].y > H + 40) items.splice(j, 1);
            else if (Math.abs(items[j].x - player.x) < (items[j].s + 34) / 2 && Math.abs(items[j].y - (groundY - 30)) < 40) over = true;
          }
        } else {
          if (pvx !== 0) { player.x = clamp(player.x + pvx * dt, 20, W - 20); pvx = glide(pvx, dt); if (Math.abs(pvx) < 12) pvx = 0; }
          velY += 1500 * dt;
          player.y += velY * dt;
          if (player.y < camY + 180) camY = player.y - 180;
          maxH = Math.max(maxH, 500 - player.y);
          score = maxH / 10;
          for (var k = 0; k < plats.length; k++) {
            var pl = plats[k];
            if (velY > 0 && player.x + 20 > pl.x && player.x - 20 < pl.x + pl.w &&
              player.y + 28 >= pl.y && player.y + 28 <= pl.y + 18) {
              velY = -640;
              player.y = pl.y - 28;
            }
          }
          var top = camY - 60;
          while (plats.length && plats[plats.length - 1].y > top) {
            var last = plats[plats.length - 1];
            plats.push({ x: 40 + Math.random() * (W - 220), y: last.y - (70 + Math.random() * 50), w: 120 + Math.random() * 80 });
          }
          if (player.y - camY > H + 60) over = true;
        }
      },
      draw: function (ctx) {
        if (mode === 'nubes') {
          ctx.fillStyle = '#87CEEB'; ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = '#fff';
          for (var c = 0; c < 6; c++) {
            var cx = (c * 191 + 40) % W, cy = ((c * 137 + 60) % 500) - camY * 0.2;
            circle(ctx, cx, cy % 560, 26); ctx.fill();
            circle(ctx, cx + 26, cy % 560 + 6, 20); ctx.fill();
          }
          ctx.fillStyle = GREEN;
          for (var p = 0; p < plats.length; p++) {
            var pl = plats[p];
            if (pl.y - camY < -40 || pl.y - camY > H + 40) continue;
            rr(ctx, pl.x, pl.y - camY, pl.w, 18, 9); ctx.fill();
          }
          ctx.fillStyle = RED;
          circle(ctx, player.x, player.y - camY, 22); ctx.fill();
          ctx.fillStyle = '#141419'; circle(ctx, player.x + 8, player.y - camY - 6, 4); ctx.fill();
          text(ctx, 'Altura: ' + Math.floor(score), 12, 26, 20, '#141419', 'left', true);
          return;
        }
        ctx.fillStyle = '#F2E3C6'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#8ED081'; ctx.fillRect(0, groundY, W, H - groundY);
        ctx.fillStyle = '#6B8E23'; ctx.fillRect(0, groundY, W, 8);
        if (mode === 'salto') {
          ctx.fillStyle = '#5B4636';
          for (var i = 0; i < obstacles.length; i++) {
            var ob = obstacles[i];
            ctx.fillRect(ob.x, groundY - ob.h, ob.w, ob.h);
            ctx.fillStyle = GREEN;
            ctx.beginPath(); ctx.moveTo(ob.x + ob.w / 2, groundY - ob.h - 14); ctx.lineTo(ob.x + 4, groundY - ob.h); ctx.lineTo(ob.x + ob.w - 4, groundY - ob.h); ctx.closePath(); ctx.fill();
            ctx.fillStyle = '#5B4636';
          }
        } else {
          ctx.fillStyle = RED;
          for (var j = 0; j < items.length; j++) ctx.fillRect(items[j].x - items[j].s / 2, items[j].y - items[j].s / 2, items[j].s, items[j].s);
        }
        ctx.fillStyle = RED;
        rr(ctx, player.x, player.y, player.w, player.h, 10); ctx.fill();
        ctx.fillStyle = '#fff';
        circle(ctx, player.x + 28, player.y + 16, 5); ctx.fill();
        text(ctx, 'Puntos: ' + Math.floor(score), 12, 26, 20, '#141419', 'left', true);
        if (over) text(ctx, mode === 'salto' ? '¡Chocaste!' : '¡Te alcanzó un bloque!', W / 2, H / 2, 30, RED, 'center', true);
      }
    };
  }

  /* ---------------- DESLIZA 15 ---------------- */
  function slide15Engine() {
    var W = LW, H = LH;
    var cell = 110, ox = (W - 4 * cell) / 2, oy = 70;
    var tiles = [];
    for (var i = 1; i <= 15; i++) tiles.push(i);
    tiles.push(0);
    var moves = 0, over = false;
    function emptyIdx() { return tiles.indexOf(0); }
    function shuffleBoard() {
      for (var n = 0; n < 120; n++) {
        var e = emptyIdx(), opts = [];
        if (e % 4 > 0) opts.push(e - 1);
        if (e % 4 < 3) opts.push(e + 1);
        if (e >= 4) opts.push(e - 4);
        if (e < 12) opts.push(e + 4);
        var t = pick(opts);
        tiles[e] = tiles[t]; tiles[t] = 0;
      }
    }
    shuffleBoard();
    function solved() {
      for (var i = 0; i < 15; i++) if (tiles[i] !== i + 1) return false;
      return tiles[15] === 0;
    }
    function tryMove(idx) {
      if (over) return;
      var e = emptyIdx();
      var er = Math.floor(e / 4), ec = e % 4, ir = Math.floor(idx / 4), ic = idx % 4;
      if (Math.abs(er - ir) + Math.abs(ec - ic) === 1) {
        tiles[e] = tiles[idx]; tiles[idx] = 0; moves++;
        if (solved()) over = true;
      }
    }
    return {
      hint: 'Toca una ficha junto al hueco para moverla',
      get over() { return over; },
      score: function () { return over ? Math.max(100, 2000 - moves * 10) : 0; },
      key: function (k) {
        var e = emptyIdx();
        if (k === 'Up' && e < 12) tryMove(e + 4);
        else if (k === 'Down' && e >= 4) tryMove(e - 4);
        else if (k === 'Left' && e % 4 < 3) tryMove(e + 1);
        else if (k === 'Right' && e % 4 > 0) tryMove(e - 1);
      },
      swipe: function (dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) this.key(dx > 0 ? 'Left' : 'Right');
        else this.key(dy > 0 ? 'Up' : 'Down');
      },
      pointer: function (x, y, phase) {
        if (phase !== 'tap') return;
        var c = Math.floor((x - ox) / cell), r = Math.floor((y - oy) / cell);
        if (c < 0 || c > 3 || r < 0 || r > 3) return;
        tryMove(r * 4 + c);
      },
      update: function () {},
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        text(ctx, 'Ordena del 1 al 15', W / 2, 30, 22, '#fff', 'center', true);
        text(ctx, 'Movimientos: ' + moves, W / 2, 58, 18, GOLD, 'center', true);
        for (var i = 0; i < 16; i++) {
          var v = tiles[i], x = ox + (i % 4) * cell, y = oy + Math.floor(i / 4) * cell;
          if (v === 0) { ctx.fillStyle = '#1C1C22'; rr(ctx, x + 4, y + 4, cell - 8, cell - 8, 12); ctx.fill(); continue; }
          ctx.fillStyle = RED; rr(ctx, x + 4, y + 4, cell - 8, cell - 8, 12); ctx.fill();
          text(ctx, String(v), x + cell / 2, y + cell / 2, 40, '#fff', 'center', true);
        }
        if (over) text(ctx, '¡Completado en ' + moves + ' movimientos!', W / 2, H - 16, 20, GOLD, 'center', true);
      }
    };
  }

  /* ---------------- BUSCAMINAS ---------------- */
  function minesweeperEngine() {
    var W = LW, H = LH;
    var COLS = 9, ROWS = 9, CELL = 48, ox = (W - COLS * CELL) / 2, oy = 56;
    var MINES = 10;
    var grid = [], revealed = 0, flags = 0, over = false, win = false, flagMode = false, started = false;
    var time = 0;
    for (var r = 0; r < ROWS; r++) { grid.push([]); for (var c = 0; c < COLS; c++) grid[r].push({ mine: false, n: 0, open: false, flag: false }); }
    function neighbors(r, c) {
      var out = [];
      for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        var nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) out.push([nr, nc]);
      }
      return out;
    }
    function placeMines(safeR, safeC) {
      var placed = 0;
      while (placed < MINES) {
        var r = irnd(ROWS), c = irnd(COLS);
        if (grid[r][c].mine || (Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1)) continue;
        grid[r][c].mine = true; placed++;
      }
      for (var y = 0; y < ROWS; y++) for (var x = 0; x < COLS; x++) {
        grid[y][x].n = neighbors(y, x).filter(function (p) { return grid[p[0]][p[1]].mine; }).length;
      }
    }
    function openCell(r, c) {
      var cell = grid[r][c];
      if (cell.open || cell.flag) return;
      cell.open = true; revealed++;
      if (cell.mine) { over = true; win = false; return; }
      if (cell.n === 0) {
        neighbors(r, c).forEach(function (p) { openCell(p[0], p[1]); });
      }
      if (revealed === ROWS * COLS - MINES) { over = true; win = true; }
    }
    var numColors = ['', BLUE, GREEN, RED, '#7B1FA2', '#B26A00', '#00ACC1', '#333', '#777'];
    return {
      hint: 'Toca para abrir · Botón 🚩 para marcar minas',
      get over() { return over; },
      score: function () { return revealed * 10 + (win ? Math.max(0, 600 - Math.floor(time)) * 2 + 500 : 0); },
      key: function (k) { if (k === 'f' || k === 'F') flagMode = !flagMode; },
      swipe: function () {},
      pointer: function (x, y, phase) {
        if (phase !== 'tap' || over) return;
        if (x > W - 70 && y < 50) { flagMode = !flagMode; return; }
        var c = Math.floor((x - ox) / CELL), r = Math.floor((y - oy) / CELL);
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
        var cell = grid[r][c];
        if (flagMode) {
          if (!cell.open) { cell.flag = !cell.flag; flags += cell.flag ? 1 : -1; }
          return;
        }
        if (!started) { placeMines(r, c); started = true; }
        openCell(r, c);
      },
      update: function (dt) { if (!over && started) time += dt; },
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        text(ctx, '💣 ' + (MINES - flags) + '   Tiempo: ' + Math.floor(time) + ' s', 12, 26, 20, '#fff', 'left', true);
        ctx.fillStyle = flagMode ? GOLD : '#444';
        rr(ctx, W - 64, 10, 52, 36, 10); ctx.fill();
        text(ctx, '🚩', W - 38, 29, 22, '#fff', 'center');
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
          var cell = grid[r][c], x = ox + c * CELL, y = oy + r * CELL;
          if (cell.open) {
            ctx.fillStyle = '#E8E8E8'; ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
            if (cell.mine) text(ctx, '💣', x + CELL / 2, y + CELL / 2, 26, '#141419', 'center');
            else if (cell.n > 0) text(ctx, String(cell.n), x + CELL / 2, y + CELL / 2, 24, numColors[cell.n], 'center', true);
          } else {
            ctx.fillStyle = '#555'; rr(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 6); ctx.fill();
            if (cell.flag) text(ctx, '🚩', x + CELL / 2, y + CELL / 2, 24, '#fff', 'center');
          }
          if (over && cell.mine && !cell.open) { ctx.fillStyle = 'rgba(230,0,38,.25)'; ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2); text(ctx, '💣', x + CELL / 2, y + CELL / 2, 26, '#fff', 'center'); }
        }
        if (over) text(ctx, win ? '¡Tablero limpio!' : '¡Boom! Pisaste una mina', W / 2, H - 14, 20, win ? GOLD : RED, 'center', true);
      }
    };
  }

  /* ---------------- CONECTA 3 ---------------- */
  function match3Engine() {
    var W = LW, H = LH;
    var COLS = 8, ROWS = 8, CELL = 54, ox = (W - COLS * CELL) / 2, oy = 70;
    var COLORS = [RED, GOLD, GREEN, BLUE, '#9C27B0'];
    var GLYPHS = ['●', '◆', '▲', '■', '★'];
    var grid = [], sel = null, score = 0, timeLeft = 60, over = false, anim = 0;
    function randomGem() { return irnd(COLORS.length); }
    function fill() {
      for (var r = 0; r < ROWS; r++) { grid.push([]); for (var c = 0; c < COLS; c++) grid[r].push(randomGem()); }
      while (findMatches().length) {
        findMatches().forEach(function (p) { grid[p.r][p.c] = randomGem(); });
      }
    }
    function findMatches() {
      var out = [];
      for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
        var v = grid[r][c];
        if (c + 2 < COLS && grid[r][c + 1] === v && grid[r][c + 2] === v) out.push({ r: r, c: c }, { r: r, c: c + 1 }, { r: r, c: c + 2 });
        if (r + 2 < ROWS && grid[r + 1][c] === v && grid[r + 2][c] === v) out.push({ r: r, c: c }, { r: r + 1, c: c }, { r: r + 2, c: c });
      }
      var seen = {}, uniq = [];
      out.forEach(function (p) { var k = p.r + ',' + p.c; if (!seen[k]) { seen[k] = true; uniq.push(p); } });
      return uniq;
    }
    function collapse() {
      for (var c = 0; c < COLS; c++) {
        var col = [];
        for (var r = ROWS - 1; r >= 0; r--) if (grid[r][c] !== -1) col.push(grid[r][c]);
        while (col.length < ROWS) col.push(randomGem());
        for (var r2 = ROWS - 1; r2 >= 0; r2--) grid[r2][c] = col[ROWS - 1 - r2];
      }
    }
    function resolve() {
      var m = findMatches();
      if (!m.length) return;
      score += m.length * 10;
      m.forEach(function (p) { grid[p.r][p.c] = -1; });
      collapse();
      resolve();
    }
    fill();
    return {
      hint: 'Toca dos gemas vecinas para intercambiarlas',
      get over() { return over; },
      score: function () { return score; },
      key: function () {},
      swipe: function () {},
      pointer: function (x, y, phase) {
        if (phase !== 'tap' || over) return;
        var c = Math.floor((x - ox) / CELL), r = Math.floor((y - oy) / CELL);
        if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return;
        if (!sel) { sel = { r: r, c: c }; return; }
        if (Math.abs(sel.r - r) + Math.abs(sel.c - c) === 1) {
          var t = grid[sel.r][sel.c]; grid[sel.r][sel.c] = grid[r][c]; grid[r][c] = t;
          if (findMatches().length) resolve();
          else { var t2 = grid[sel.r][sel.c]; grid[sel.r][sel.c] = grid[r][c]; grid[r][c] = t2; }
        }
        sel = null;
      },
      update: function (dt) {
        if (over) return;
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; over = true; }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        text(ctx, 'Puntos: ' + score + '   Tiempo: ' + Math.ceil(timeLeft) + ' s', W / 2, 30, 22, '#fff', 'center', true);
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
          var v = grid[r][c];
          var x = ox + c * CELL, y = oy + r * CELL;
          if (v < 0) continue;
          ctx.fillStyle = COLORS[v];
          circle(ctx, x + CELL / 2, y + CELL / 2, CELL / 2 - 5); ctx.fill();
          text(ctx, GLYPHS[v], x + CELL / 2, y + CELL / 2 + 1, 20, '#fff', 'center');
          if (sel && sel.r === r && sel.c === c) {
            ctx.strokeStyle = GOLD; ctx.lineWidth = 4;
            circle(ctx, x + CELL / 2, y + CELL / 2, CELL / 2 - 3); ctx.stroke();
            ctx.lineWidth = 1;
          }
        }
        if (over) text(ctx, '¡Tiempo terminado!', W / 2, H - 12, 20, GOLD, 'center', true);
      }
    };
  }

  /* ---------------- SIMÓN ---------------- */
  function simonEngine() {
    var W = LW, H = LH;
    var COLORS = [RED, GREEN, GOLD, BLUE];
    var NAMES = ['Rojo', 'Verde', 'Amarillo', 'Azul'];
    var seq = [], input = 0, phase = 'show', showIdx = 0, showT = 0.6, lit = -1;
    var score = 0, over = false, round = 1, msg = 'Mira la secuencia…';
    seq.push(irnd(4));
    function nextRound() {
      seq.push(irnd(4));
      round = seq.length;
      input = 0; phase = 'show'; showIdx = 0; showT = 0.8; lit = -1;
      msg = 'Mira la secuencia…';
    }
    function padRect(i) {
      var s = 180, gap = 16, ox = (W - (s * 2 + gap)) / 2, oy = 110;
      return { x: ox + (i % 2) * (s + gap), y: oy + Math.floor(i / 2) * (s + gap), w: s, h: s };
    }
    return {
      hint: 'Repite la secuencia tocando los colores',
      get over() { return over; },
      score: function () { return score; },
      key: function (k) {
        var n = parseInt(k, 10);
        if (n >= 1 && n <= 4) this.pointer(0, 0, 'key' + (n - 1));
      },
      swipe: function () {},
      pointer: function (x, y, ph) {
        var idx = -1;
        if (typeof ph === 'string' && ph.indexOf('key') === 0) idx = parseInt(ph.slice(3), 10);
        else {
          if (ph !== 'tap') return;
          for (var i = 0; i < 4; i++) {
            var p = padRect(i);
            if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) { idx = i; break; }
          }
        }
        if (idx < 0 || phase !== 'input' || over) return;
        lit = idx;
        setTimeout(function () { lit = -1; }, 220);
        if (idx === seq[input]) {
          input++;
          if (input === seq.length) {
            score += seq.length * 10;
            msg = '¡Bien! Ronda ' + (seq.length + 1);
            setTimeout(nextRound, 700);
            phase = 'show';
          }
        } else {
          over = true;
          msg = 'Fallaste en la ronda ' + seq.length;
        }
      },
      update: function (dt) {
        if (over || phase !== 'show') return;
        showT -= dt;
        if (showT <= 0) {
          if (showIdx < seq.length) {
            lit = seq[showIdx];
            showIdx++;
            showT = 0.55;
            setTimeout(function () { lit = -1; }, 380);
          } else {
            phase = 'input'; lit = -1;
            msg = 'Tu turno: repite la secuencia';
          }
        }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        text(ctx, 'Ronda ' + round + '   Puntos: ' + score, W / 2, 34, 22, '#fff', 'center', true);
        text(ctx, msg, W / 2, 66, 18, GOLD, 'center');
        for (var i = 0; i < 4; i++) {
          var p = padRect(i);
          ctx.globalAlpha = lit === i ? 1 : 0.45;
          ctx.fillStyle = COLORS[i];
          rr(ctx, p.x, p.y, p.w, p.h, 18); ctx.fill();
          ctx.globalAlpha = 1;
          text(ctx, NAMES[i] + ' (' + (i + 1) + ')', p.x + p.w / 2, p.y + p.h / 2, 20, '#fff', 'center', true);
        }
        if (over) text(ctx, msg, W / 2, H - 16, 20, RED, 'center', true);
      }
    };
  }

  /* ---------------- LABERINTO ---------------- */
  function mazeEngine() {
    var W = LW, H = LH, COLS = 13, ROWS = 9, CELL = 60;
    var ox = (W - COLS * CELL) / 2, oy = 0;
    var maze, px = 0, py = 0, level = 1, timeLeft = 45, score = 0, over = false;
    function gen() {
      maze = [];
      for (var r = 0; r < ROWS; r++) {
        maze.push([]);
        for (var c = 0; c < COLS; c++) maze[r].push({ n: true, s: true, e: true, w: true, seen: false });
      }
      var stack = [[0, 0]];
      maze[0][0].seen = true;
      while (stack.length) {
        var cur = stack[stack.length - 1], cy = cur[0], cx = cur[1];
        var nb = [];
        if (cy > 0 && !maze[cy - 1][cx].seen) nb.push([cy - 1, cx, 'n', 's']);
        if (cy < ROWS - 1 && !maze[cy + 1][cx].seen) nb.push([cy + 1, cx, 's', 'n']);
        if (cx > 0 && !maze[cy][cx - 1].seen) nb.push([cy, cx - 1, 'w', 'e']);
        if (cx < COLS - 1 && !maze[cy][cx + 1].seen) nb.push([cy, cx + 1, 'e', 'w']);
        if (!nb.length) { stack.pop(); continue; }
        var n = pick(nb);
        maze[cy][cx][n[2]] = false; maze[n[0]][n[1]][n[3]] = false;
        maze[n[0]][n[1]].seen = true; stack.push([n[0], n[1]]);
      }
      px = 0; py = 0; timeLeft = 45;
    }
    gen();
    function move(dx, dy) {
      if (over) return;
      var cell = maze[py][px];
      if (dx === 1 && !cell.e) px++;
      else if (dx === -1 && !cell.w) px--;
      else if (dy === 1 && !cell.s) py++;
      else if (dy === -1 && !cell.n) py--;
      if (px === COLS - 1 && py === ROWS - 1) {
        score += 200 + Math.floor(timeLeft) * 5;
        level++;
        gen();
      }
    }
    return {
      hint: 'Flechas o desliza para moverte · Llega a la meta verde',
      get over() { return over; },
      score: function () { return score; },
      key: function (k) {
        if (k === 'Up') move(0, -1);
        else if (k === 'Down') move(0, 1);
        else if (k === 'Left') move(-1, 0);
        else if (k === 'Right') move(1, 0);
      },
      swipe: function (dx, dy) {
        if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 1 : -1, 0);
        else move(0, dy > 0 ? 1 : -1);
      },
      pointer: function () {},
      update: function (dt) {
        if (over) return;
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; over = true; }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = GREEN; ctx.fillRect(ox + (COLS - 1) * CELL + 4, oy + (ROWS - 1) * CELL + 4, CELL - 8, CELL - 8);
        text(ctx, '🏁', ox + (COLS - 1) * CELL + CELL / 2, oy + (ROWS - 1) * CELL + CELL / 2, 30, '#fff', 'center');
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
        for (var r = 0; r < ROWS; r++) for (var c = 0; c < COLS; c++) {
          var m = maze[r][c], x = ox + c * CELL, y = oy + r * CELL;
          ctx.beginPath();
          if (m.n) { ctx.moveTo(x, y); ctx.lineTo(x + CELL, y); }
          if (m.s) { ctx.moveTo(x, y + CELL); ctx.lineTo(x + CELL, y + CELL); }
          if (m.w) { ctx.moveTo(x, y); ctx.lineTo(x, y + CELL); }
          if (m.e) { ctx.moveTo(x + CELL, y); ctx.lineTo(x + CELL, y + CELL); }
          ctx.stroke();
        }
        ctx.lineWidth = 1;
        ctx.fillStyle = RED;
        circle(ctx, ox + px * CELL + CELL / 2, oy + py * CELL + CELL / 2, 18); ctx.fill();
        ctx.fillStyle = '#fff'; circle(ctx, ox + px * CELL + CELL / 2 + 6, oy + py * CELL + CELL / 2 - 5, 4); ctx.fill();
        text(ctx, 'Nivel ' + level + '   Tiempo: ' + Math.ceil(timeLeft) + ' s   Puntos: ' + score, W / 2, H - 12, 16, '#fff', 'center');
      }
    };
  }

  /* ---------------- TRES EN RAYA ----------------
     v1.8: modo online por turnos. En solitario se juega contra la
     máquina como siempre; en online ('online', {mark, opponent, onMove})
     el rival es otra persona: solo se puede tocar en tu turno, tu
     jugada se avisa con onMove y la jugada del rival entra por
     remoteMove. El primero en ganar 3 rondas se lleva el partido. */
  function tictactoeEngine(mode, onlineOpts) {
    var W = LW, H = LH;
    var cell = 130, ox = (W - 3 * cell) / 2, oy = 90;
    var board = new Array(9).fill('');
    var wins = 0, losses = 0, draws = 0, over = false, freeze = 0;
    var online = mode === 'online';
    var myMark = online ? ((onlineOpts && onlineOpts.mark === 'O') ? 'O' : 'X') : 'X';
    var otherMark = myMark === 'X' ? 'O' : 'X';
    var turn = 'X';
    var oppName = (onlineOpts && onlineOpts.opponent) || 'La máquina';
    var msg = online
      ? (turn === myMark ? 'Tu turno: toca una casilla (juegas con ' + myMark + ')' : 'Turno de ' + oppName + '…')
      : 'Tu turno: toca una casilla (juegas con X)';
    var LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    function winner(b) {
      for (var i = 0; i < LINES.length; i++) {
        var l = LINES[i];
        if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return b[l[0]];
      }
      if (b.indexOf('') < 0) return 'D';
      return null;
    }
    function aiMove() {
      var empty = [];
      for (var i = 0; i < 9; i++) if (!board[i]) empty.push(i);
      function tryWin(mark) {
        for (var j = 0; j < empty.length; j++) {
          var b = board.slice(); b[empty[j]] = mark;
          if (winner(b) === mark) return empty[j];
        }
        return -1;
      }
      var m = tryWin('O');
      if (m < 0) m = tryWin('X');
      if (m < 0 && !board[4]) m = 4;
      if (m < 0) {
        var corners = empty.filter(function (i) { return i === 0 || i === 2 || i === 6 || i === 8; });
        m = corners.length ? pick(corners) : pick(empty);
      }
      if (m >= 0) board[m] = 'O';
    }
    function afterMove() {
      var w = winner(board);
      if (!w) return;
      if (w === myMark) { wins++; msg = '¡Ganaste esta ronda!'; }
      else if (w === otherMark) { losses++; msg = online ? oppName + ' ganó esta ronda' : 'La máquina ganó esta ronda'; }
      else { draws++; msg = 'Empate'; }
      if (wins >= 3) { over = true; msg = '¡Ganaste el partido 3 a ' + losses + '!'; return; }
      if (losses >= 3) { over = true; msg = online ? oppName + ' ganó el partido' : 'La máquina ganó el partido'; return; }
      freeze = 1.0;
    }
    function resetRound() {
      board = new Array(9).fill('');
      turn = 'X';
      msg = online
        ? (turn === myMark ? 'Tu turno: toca una casilla (juegas con ' + myMark + ')' : 'Turno de ' + oppName + '…')
        : 'Tu turno: toca una casilla (juegas con X)';
    }
    return {
      hint: 'Toca una casilla vacía · Gana 3 rondas',
      get over() { return over; },
      score: function () { return wins * 100 + draws * 20; },
      turnMark: function () { return turn; },
      myMark: function () { return myMark; },
      isOnline: function () { return online; },
      remoteMove: function (idx) {
        if (!online || over || freeze > 0) return false;
        idx = Math.floor(Number(idx));
        if (isNaN(idx) || idx < 0 || idx > 8 || board[idx] || turn === myMark) return false;
        board[idx] = otherMark;
        turn = myMark;
        Sfx.turn();
        afterMove();
        if (!over && !winner(board)) msg = 'Tu turno: toca una casilla (juegas con ' + myMark + ')';
        return true;
      },
      key: function (k) {
        var n = parseInt(k, 10);
        if (n >= 1 && n <= 9) this.pointer(0, 0, 'cell' + (n - 1));
      },
      swipe: function () {},
      pointer: function (x, y, phase) {
        if (over || freeze > 0) return;
        if (online && turn !== myMark) return; /* no es tu turno */
        var idx = -1;
        if (typeof phase === 'string' && phase.indexOf('cell') === 0) idx = parseInt(phase.slice(4), 10);
        else {
          if (phase !== 'tap') return;
          var c = Math.floor((x - ox) / cell), r = Math.floor((y - oy) / cell);
          if (c < 0 || c > 2 || r < 0 || r > 2) return;
          idx = r * 3 + c;
        }
        if (idx < 0 || board[idx]) return;
        board[idx] = myMark;
        var w = winner(board);
        if (!w) {
          if (online) {
            turn = otherMark;
            msg = 'Turno de ' + oppName + '…';
            try { if (onlineOpts && onlineOpts.onMove) onlineOpts.onMove(idx); } catch (e) {}
          } else { aiMove(); afterMove(); }
        } else afterMove();
      },
      update: function (dt) {
        if (freeze > 0) {
          freeze -= dt;
          if (freeze <= 0) resetRound();
        }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        text(ctx, 'Tú ' + wins + ' — ' + losses + ' ' + oppName + '   Empates: ' + draws, W / 2, 34, 22, '#fff', 'center', true);
        text(ctx, msg, W / 2, 64, 18, GOLD, 'center');
        for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
          var x = ox + c * cell, y = oy + r * cell;
          ctx.fillStyle = '#1C1C22'; rr(ctx, x + 4, y + 4, cell - 8, cell - 8, 12); ctx.fill();
          var v = board[r * 3 + c];
          if (v) text(ctx, v, x + cell / 2, y + cell / 2, 72, v === myMark ? RED : '#fff', 'center', true);
        }
        text(ctx, 'Primero en ganar 3 rondas se lleva el partido', W / 2, H - 14, 16, '#999', 'center');
      }
    };
  }

  /* ---------------- AHORCADO ---------------- */
  function hangmanEngine() {
    var W = LW, H = LH;
    var WORDS = ['MANZANA', 'PERRO', 'GUITARRA', 'MONTAÑA', 'OCEANO', 'LIBRO', 'COCINA', 'TREN', 'SOL', 'LUNA', 'CASTILLO', 'JARDIN', 'ESCUELA', 'MUSICA', 'FIESTA', 'AVION', 'PLAYA', 'BOSQUE', 'CIUDAD', 'AMIGO', 'CASA', 'FLOR', 'RIO', 'NUBE', 'ESTRELLA', 'CABALLO', 'PESCADO', 'VENTANA', 'PUERTA', 'RELOJ'];
    var ROWS_KB = ['QWERTYUIOP', 'ASDFGHJKLÑ', 'ZXCVBNM'];
    var words = shuffle(WORDS.slice()).slice(0, 3);
    var wi = 0, word = words[0], guessed = [], errors = 0, score = 0, over = false;
    var msg = 'Adivina la palabra';
    function reveal() {
      var out = '';
      for (var i = 0; i < word.length; i++) out += guessed.indexOf(word[i]) >= 0 ? word[i] + ' ' : '_ ';
      return out;
    }
    function nextWord(won) {
      if (won) score += word.length * 10 + (6 - errors) * 15;
      wi++;
      if (wi >= 3) { over = true; msg = 'Fin del juego'; return; }
      word = words[wi]; guessed = []; errors = 0;
      msg = 'Palabra ' + (wi + 1) + ' de 3';
    }
    function guess(L) {
      if (over || guessed.indexOf(L) >= 0) return;
      guessed.push(L);
      if (word.indexOf(L) < 0) {
        errors++;
        if (errors >= 6) { msg = 'La palabra era: ' + word; nextWord(false); }
        return;
      }
      var done = true;
      for (var i = 0; i < word.length; i++) if (guessed.indexOf(word[i]) < 0) { done = false; break; }
      if (done) { msg = '¡Palabra adivinada!'; nextWord(true); }
    }
    return {
      hint: 'Toca las letras del teclado o usa el teclado físico',
      get over() { return over; },
      score: function () { return score; },
      key: function (k) {
        if (typeof k === 'string' && k.length === 1) guess(k.toUpperCase());
      },
      swipe: function () {},
      pointer: function (x, y, phase) {
        if (phase !== 'tap' || over) return;
        var keyW = 62, keyH = 52, gap = 6, oy = 330;
        for (var r = 0; r < ROWS_KB.length; r++) {
          var row = ROWS_KB[r], total = row.length * (keyW + gap) - gap;
          var ox = (W - total) / 2, yy = oy + r * (keyH + gap);
          if (y < yy || y > yy + keyH) continue;
          var c = Math.floor((x - ox) / (keyW + gap));
          if (c >= 0 && c < row.length && x >= ox + c * (keyW + gap) && x <= ox + c * (keyW + gap) + keyW) guess(row[c]);
        }
      },
      update: function () {},
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        text(ctx, 'Palabra ' + (wi + 1) + ' de 3   Puntos: ' + score, W / 2, 30, 20, '#fff', 'center', true);
        text(ctx, msg, W / 2, 58, 18, GOLD, 'center');
        var bx = 120, by = 90;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(bx, by + 180); ctx.lineTo(bx + 120, by + 180);
        ctx.moveTo(bx + 60, by + 180); ctx.lineTo(bx + 60, by);
        ctx.moveTo(bx + 60, by); ctx.lineTo(bx + 190, by);
        ctx.moveTo(bx + 190, by); ctx.lineTo(bx + 190, by + 30);
        ctx.stroke();
        ctx.lineWidth = 3;
        if (errors >= 1) { circle(ctx, bx + 190, by + 55, 25); ctx.stroke(); }
        if (errors >= 2) { ctx.beginPath(); ctx.moveTo(bx + 190, by + 80); ctx.lineTo(bx + 190, by + 130); ctx.stroke(); }
        if (errors >= 3) { ctx.beginPath(); ctx.moveTo(bx + 190, by + 95); ctx.lineTo(bx + 160, by + 115); ctx.stroke(); }
        if (errors >= 4) { ctx.beginPath(); ctx.moveTo(bx + 190, by + 95); ctx.lineTo(bx + 220, by + 115); ctx.stroke(); }
        if (errors >= 5) { ctx.beginPath(); ctx.moveTo(bx + 190, by + 130); ctx.lineTo(bx + 165, by + 165); ctx.stroke(); }
        if (errors >= 6) { ctx.beginPath(); ctx.moveTo(bx + 190, by + 130); ctx.lineTo(bx + 215, by + 165); ctx.stroke(); }
        ctx.lineWidth = 1;
        text(ctx, 'Errores: ' + errors + ' / 6', bx + 320, by + 60, 20, '#fff', 'left');
        text(ctx, reveal(), W / 2, 300, 40, '#fff', 'center', true);
        var keyW = 62, keyH = 52, gap = 6, oy = 330;
        for (var r = 0; r < ROWS_KB.length; r++) {
          var row = ROWS_KB[r], total = row.length * (keyW + gap) - gap;
          var ox = (W - total) / 2, yy = oy + r * (keyH + gap);
          for (var c = 0; c < row.length; c++) {
            var L = row[c], used = guessed.indexOf(L) >= 0;
            var good = used && word.indexOf(L) >= 0;
            ctx.fillStyle = used ? (good ? GREEN : '#444') : RED;
            rr(ctx, ox + c * (keyW + gap), yy, keyW, keyH, 8); ctx.fill();
            text(ctx, L, ox + c * (keyW + gap) + keyW / 2, yy + keyH / 2, 24, '#fff', 'center', true);
          }
        }
      }
    };
  }

  /* ---------------- ATRAPA AL TOPO ---------------- */
  function whackEngine() {
    var W = LW, H = LH;
    var timeLeft = 30, score = 0, over = false;
    var mole = null, spawnT = 0.4;
    function holePos(i) {
      var c = i % 3, r = Math.floor(i / 3);
      return { x: W / 2 + (c - 1) * 220, y: 150 + r * 130 };
    }
    return {
      hint: 'Toca al topo cuando asome · El dorado vale 30',
      get over() { return over; },
      score: function () { return score; },
      key: function (k) {
        var n = parseInt(k, 10);
        if (n >= 1 && n <= 9) this.pointer(0, 0, 'hole' + (n - 1));
      },
      swipe: function () {},
      pointer: function (x, y, phase) {
        if (over) return;
        var idx = -1;
        if (typeof phase === 'string' && phase.indexOf('hole') === 0) idx = parseInt(phase.slice(4), 10);
        else {
          if (phase !== 'tap') return;
          for (var i = 0; i < 9; i++) {
            var p = holePos(i);
            if (Math.hypot(x - p.x, y - p.y) < 70) { idx = i; break; }
          }
        }
        if (idx >= 0 && mole && mole.hole === idx) {
          score += mole.golden ? 30 : 10;
          mole = null; spawnT = 0.25;
        }
      },
      update: function (dt) {
        if (over) return;
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; over = true; return; }
        if (mole) {
          mole.t -= dt;
          if (mole.t <= 0) mole = null;
        } else {
          spawnT -= dt;
          if (spawnT <= 0) {
            mole = { hole: irnd(9), t: 0.95, golden: Math.random() < 0.12 };
            spawnT = 0.45;
          }
        }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#7A9B3F'; ctx.fillRect(0, 0, W, H);
        text(ctx, 'Puntos: ' + score + '   Tiempo: ' + Math.ceil(timeLeft) + ' s', W / 2, 30, 22, '#fff', 'center', true);
        for (var i = 0; i < 9; i++) {
          var p = holePos(i);
          ctx.fillStyle = '#3E2C1A';
          ctx.beginPath(); ctx.ellipse(p.x, p.y + 30, 80, 26, 0, 0, Math.PI * 2); ctx.fill();
          if (mole && mole.hole === i) {
            ctx.fillStyle = mole.golden ? GOLD : '#8B5A2B';
            circle(ctx, p.x, p.y, 46); ctx.fill();
            ctx.fillStyle = '#141419';
            circle(ctx, p.x - 16, p.y - 8, 6); ctx.fill();
            circle(ctx, p.x + 16, p.y - 8, 6); ctx.fill();
            ctx.fillStyle = '#FFB6C1'; circle(ctx, p.x, p.y + 12, 8); ctx.fill();
          }
          text(ctx, String(i + 1), p.x, p.y + 66, 14, 'rgba(255,255,255,.6)', 'center');
        }
      }
    };
  }

  /* ---------------- PRUEBA DE REFLEJOS ---------------- */
  function reactionEngine() {
    var W = LW, H = LH;
    var phase = 'idle', waitT = 0, goT = 0, faultT = 0;
    var round = 0, totalRounds = 5, score = 0, over = false, msg = 'Toca la pantalla para empezar';
    var lastMs = 0;
    function startRound() {
      round++;
      phase = 'wait';
      waitT = 1 + Math.random() * 2.5;
      msg = 'Espera a que se ponga verde…';
    }
    return {
      hint: 'Toca solo cuando el panel se ponga verde',
      get over() { return over; },
      score: function () { return score; },
      key: function (k) { if (k === 'Space' || k === 'Enter') this.pointer(0, 0, 'tap'); },
      swipe: function () {},
      pointer: function (x, y, ph) {
        if (ph !== 'tap' || over) return;
        if (phase === 'idle') { startRound(); return; }
        if (phase === 'wait') {
          phase = 'fault'; faultT = 0.9;
          msg = '¡Demasiado pronto! Ronda sin puntos';
          return;
        }
        if (phase === 'go') {
          lastMs = Math.round(goT * 1000);
          score += Math.max(50, 600 - lastMs);
          msg = '¡' + lastMs + ' ms! ' + (round >= totalRounds ? 'Fin' : 'Siguiente ronda');
          if (round >= totalRounds) { over = true; return; }
          phase = 'idle';
        }
      },
      update: function (dt) {
        if (over) return;
        if (phase === 'wait') {
          waitT -= dt;
          if (waitT <= 0) { phase = 'go'; goT = 0; msg = '¡AHORA!'; }
        } else if (phase === 'go') {
          goT += dt;
        } else if (phase === 'fault') {
          faultT -= dt;
          if (faultT <= 0) {
            if (round >= totalRounds) { over = true; return; }
            phase = 'idle'; msg = 'Toca para la siguiente ronda';
          }
        }
      },
      draw: function (ctx) {
        var bg = phase === 'go' ? GREEN : (phase === 'wait' ? RED : (phase === 'fault' ? '#7B1FA2' : '#2A2A32'));
        ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
        text(ctx, 'Ronda ' + Math.max(1, round) + ' de ' + totalRounds, W / 2, 60, 24, '#fff', 'center', true);
        text(ctx, msg, W / 2, H / 2 - 20, 34, '#fff', 'center', true);
        if (lastMs) text(ctx, 'Última reacción: ' + lastMs + ' ms', W / 2, H / 2 + 30, 20, '#fff', 'center');
        text(ctx, 'Puntos: ' + score, W / 2, H - 40, 22, '#fff', 'center', true);
      }
    };
  }

  /* ---------------- ATRAPA FRUTAS ---------------- */
  function catchEngine() {
    var W = LW, H = LH;
    var basket = { x: W / 2, w: 130, y: H - 46 };
    var bvx = 0; /* 1.5.43 (8): velocidad lateral de la cesta */
    var items = [], lives = 3, score = 0, over = false, spawnT = 0.5, t = 0;
    var FRUITS = ['🍎', '🍌', '🍇', '🍓', '🍊', '🍒'];
    return {
      hint: 'Mueve la cesta con el dedo o las flechas · Evita las bombas',
      get over() { return over; },
      get basketX() { return basket.x; },
      score: function () { return score; },
      key: function (k) {
        if (k === 'Left') bvx = -560;
        else if (k === 'Right') bvx = 560;
      },
      swipe: function (dx) { basket.x = clamp(basket.x + dx, basket.w / 2, W - basket.w / 2); },
      pointer: function (x, y, phase) {
        if (phase === 'move' || phase === 'down') basket.x = clamp(x, basket.w / 2, W - basket.w / 2);
      },
      update: function (dt) {
        if (over) return;
        t += dt;
        if (bvx !== 0) { basket.x = clamp(basket.x + bvx * dt, basket.w / 2, W - basket.w / 2); bvx = glide(bvx, dt); if (Math.abs(bvx) < 12) bvx = 0; }
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnT = Math.max(0.35, 0.85 - t * 0.01);
          items.push({
            x: 40 + Math.random() * (W - 80), y: -30,
            vy: 190 + Math.random() * 90 + Math.min(160, t * 4),
            kind: Math.random() < 0.16 ? 'bomba' : 'fruta',
            sym: pick(FRUITS)
          });
        }
        for (var i = items.length - 1; i >= 0; i--) {
          var it = items[i];
          it.y += it.vy * dt;
          if (it.y > H + 30) { items.splice(i, 1); continue; }
          if (it.y >= basket.y - 20 && it.y <= basket.y + 24 && Math.abs(it.x - basket.x) <= basket.w / 2) {
            if (it.kind === 'bomba') {
              lives--;
              if (lives <= 0) { over = true; return; }
            } else score += 10;
            items.splice(i, 1);
          }
        }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#BFE3F0'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#8ED081'; ctx.fillRect(0, H - 14, W, 14);
        for (var i = 0; i < items.length; i++) {
          var it = items[i];
          if (it.kind === 'bomba') text(ctx, '💣', it.x, it.y, 40, '#141419', 'center');
          else text(ctx, it.sym, it.x, it.y, 40, '#141419', 'center');
        }
        ctx.fillStyle = '#8B5A2B';
        rr(ctx, basket.x - basket.w / 2, basket.y - 8, basket.w, 34, 8); ctx.fill();
        ctx.fillStyle = '#6B4423'; ctx.fillRect(basket.x - basket.w / 2, basket.y - 8, basket.w, 8);
        text(ctx, 'Puntos: ' + score + '   Vidas: ' + '❤'.repeat(Math.max(0, lives)), 12, 26, 20, '#141419', 'left', true);
        if (over) text(ctx, '¡Se acabaron las vidas!', W / 2, H / 2, 30, RED, 'center', true);
      }
    };
  }

  /* ---------------- CARRERA DE AUTOS ---------------- */
  function raceEngine() {
    var W = LW, H = LH;
    var lanes = [300, 480, 660];
    var car = { lane: 1, y: 430 };
    var foes = [], score = 0, over = false, t = 0, spawnT = 0.6, roadOff = 0;
    function carY() { return car.y; }
    return {
      hint: 'Flechas o toca un carril para cambiar · Esquiva los autos',
      get over() { return over; },
      score: function () { return Math.floor(score); },
      key: function (k) {
        if (k === 'Left') car.lane = clamp(car.lane - 1, 0, 2);
        else if (k === 'Right') car.lane = clamp(car.lane + 1, 0, 2);
      },
      swipe: function (dx) {
        if (dx < -20) car.lane = clamp(car.lane - 1, 0, 2);
        else if (dx > 20) car.lane = clamp(car.lane + 1, 0, 2);
      },
      pointer: function (x, y, phase) {
        if (phase !== 'tap') return;
        var best = 0, bd = 1e9;
        for (var i = 0; i < lanes.length; i++) {
          var d = Math.abs(x - lanes[i]);
          if (d < bd) { bd = d; best = i; }
        }
        car.lane = best;
      },
      update: function (dt) {
        if (over) return;
        t += dt;
        var speed = 300 + Math.min(380, t * 14);
        score += dt * 12;
        roadOff = (roadOff + speed * dt) % 60;
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnT = 0.75 + Math.random() * 0.5;
          var lane = irnd(3);
          foes.push({ lane: lane, y: -90, color: pick(['#FFC400', '#1E88E5', '#9C27B0', '#00ACC1']) });
        }
        for (var i = foes.length - 1; i >= 0; i--) {
          foes[i].y += speed * dt;
          if (foes[i].y > H + 100) { foes.splice(i, 1); continue; }
          if (foes[i].lane === car.lane && Math.abs(foes[i].y - carY()) < 78) over = true;
        }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#3E7A3E'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#333'; ctx.fillRect(210, 0, 540, H);
        ctx.fillStyle = GOLD;
        for (var y = -60 + roadOff; y < H; y += 60) {
          ctx.fillRect(392, y, 6, 30);
          ctx.fillRect(566, y, 6, 30);
        }
        ctx.fillStyle = '#fff';
        ctx.fillRect(210, 0, 6, H); ctx.fillRect(744, 0, 6, H);
        for (var i = 0; i < foes.length; i++) {
          var f = foes[i];
          ctx.fillStyle = f.color;
          rr(ctx, lanes[f.lane] - 38, f.y - 42, 76, 84, 10); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.75)';
          ctx.fillRect(lanes[f.lane] - 26, f.y - 22, 52, 26);
        }
        ctx.fillStyle = RED;
        rr(ctx, lanes[car.lane] - 38, car.y - 42, 76, 84, 10); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillRect(lanes[car.lane] - 26, car.y - 22, 52, 26);
        ctx.fillStyle = '#141419';
        ctx.fillRect(lanes[car.lane] - 26, car.y + 18, 20, 12);
        ctx.fillRect(lanes[car.lane] + 6, car.y + 18, 20, 12);
        text(ctx, 'Puntos: ' + Math.floor(score), 12, 26, 20, '#fff', 'left', true);
        if (over) text(ctx, '¡Choque!', W / 2, H / 2, 34, GOLD, 'center', true);
      }
    };
  }

  /* ---------------- BURBUJAS ---------------- */
  function bubblesEngine() {
    var W = LW, H = LH;
    var bubbles = [], timeLeft = 30, score = 0, over = false, spawnT = 0.3;
    return {
      hint: 'Toca las burbujas para reventarlas · Las doradas valen 50',
      get over() { return over; },
      score: function () { return score; },
      key: function () {},
      swipe: function () {},
      pointer: function (x, y, phase) {
        if (phase !== 'tap' || over) return;
        for (var i = bubbles.length - 1; i >= 0; i--) {
          var b = bubbles[i];
          if (Math.hypot(x - b.x, y - b.y) <= b.r + 8) {
            score += b.golden ? 50 : 10;
            bubbles.splice(i, 1);
            return;
          }
        }
      },
      update: function (dt) {
        if (over) return;
        timeLeft -= dt;
        if (timeLeft <= 0) { timeLeft = 0; over = true; return; }
        spawnT -= dt;
        if (spawnT <= 0) {
          spawnT = 0.45;
          bubbles.push({ x: 50 + Math.random() * (W - 100), y: H + 30, r: 22 + Math.random() * 22, vy: 60 + Math.random() * 80, golden: Math.random() < 0.1 });
        }
        for (var i = bubbles.length - 1; i >= 0; i--) {
          bubbles[i].y -= bubbles[i].vy * dt;
          if (bubbles[i].y < -50) bubbles.splice(i, 1);
        }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#0A3D62'; ctx.fillRect(0, 0, W, H);
        for (var i = 0; i < bubbles.length; i++) {
          var b = bubbles[i];
          ctx.fillStyle = b.golden ? 'rgba(255,196,0,.85)' : 'rgba(135,206,235,.8)';
          circle(ctx, b.x, b.y, b.r); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 2;
          circle(ctx, b.x, b.y, b.r); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.9)';
          circle(ctx, b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.22); ctx.fill();
          ctx.lineWidth = 1;
        }
        text(ctx, 'Puntos: ' + score + '   Tiempo: ' + Math.ceil(timeLeft) + ' s', W / 2, 30, 22, '#fff', 'center', true);
        if (over) text(ctx, '¡Tiempo terminado!', W / 2, H / 2, 30, GOLD, 'center', true);
      }
    };
  }

  /* ---------------- TORRES ---------------- */
  function towerEngine() {
    var W = LW, H = LH;
    var stack = [{ x: 380, w: 200, y: 500 }];
    var moving = { x: 60, w: 200, dir: 1, speed: 220 };
    var score = 0, over = false, shake = 0;
    function topY() { return stack[stack.length - 1].y - 26; }
    function drop() {
      if (over) return;
      var top = stack[stack.length - 1];
      var left = Math.max(moving.x, top.x);
      var right = Math.min(moving.x + moving.w, top.x + top.w);
      if (right <= left) { over = true; return; }
      stack.push({ x: left, w: right - left, y: top.y - 26 });
      score = stack.length - 1;
      moving.w = right - left;
      moving.x = 40;
      moving.dir = 1;
      moving.speed = Math.min(560, 220 + stack.length * 16);
    }
    return {
      hint: 'Toca o pulsa Espacio para soltar el bloque',
      get over() { return over; },
      score: function () { return score; },
      key: function (k) { if (k === 'Space' || k === 'Enter') drop(); },
      swipe: function () { drop(); },
      pointer: function (x, y, phase) { if (phase === 'tap' || phase === 'down') drop(); },
      update: function (dt) {
        if (over) return;
        moving.x += moving.dir * moving.speed * dt;
        if (moving.x <= 20) { moving.x = 20; moving.dir = 1; }
        if (moving.x + moving.w >= W - 20) { moving.x = W - 20 - moving.w; moving.dir = -1; }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 500, W, 40);
        ctx.fillStyle = '#3E7A3E'; ctx.fillRect(0, 500, W, 6);
        var baseY = 500;
        var shift = Math.max(0, (stack.length - 8) * 26);
        for (var i = 0; i < stack.length; i++) {
          var b = stack[i];
          ctx.fillStyle = i % 2 ? '#FF3355' : RED;
          rr(ctx, b.x, b.y - shift, b.w, 26, 4); ctx.fill();
        }
        if (!over) {
          ctx.fillStyle = GOLD;
          rr(ctx, moving.x, topY() - shift, moving.w, 26, 4); ctx.fill();
        }
        text(ctx, 'Altura: ' + score + ' bloques', W / 2, 30, 22, '#fff', 'center', true);
        if (over) text(ctx, '¡La torre se cayó!', W / 2, 90, 26, GOLD, 'center', true);
      }
    };
  }

  /* ---------------- CATÁLOGO ---------------- */
  var GAMES = [
    { id: 'serpiente', cat: 'Clásicos', name: 'Serpiente clásica', desc: 'Come, crece y no te muerdas la cola. La serpiente de siempre, con velocidad clásica.', icon: '🐍', make: function () { return snakeEngine({ speed: 0.14 }); } },
    { id: 'serpiente-veloz', cat: 'Clásicos', name: 'Serpiente veloz', desc: 'La serpiente corre el doble de rápido. Atrapa las frutas doradas, valen 50 puntos.', icon: '⚡', make: function () { return snakeEngine({ speed: 0.09, golden: true }); } },
    { id: 'serpiente-muro', cat: 'Clásicos', name: 'Serpiente en el laberinto', desc: 'Serpiente con muros por todas partes. Un choque contra un muro termina la partida.', icon: '🧱', make: function () { return snakeEngine({ speed: 0.15, walls: snakeWallsMuro() }); } },
    { id: 'serpiente-portales', cat: 'Clásicos', name: 'Serpiente con portales', desc: 'Los bordes te teletransportan y los portales morados te llevan al otro lado del tablero.', icon: '🌀', make: function () { return snakeEngine({ speed: 0.13, wrap: true, golden: true, portals: [{ x: 2, y: 2 }, { x: 29, y: 15 }] }); } },
    { id: 'memoria', cat: 'Memoria', name: 'Memoria de parejas', desc: 'Encuentra todas las parejas iguales con la menor cantidad de movimientos.', icon: '🃏', make: function () { return memoryEngine(4, 4, 0); } },
    { id: 'memoria-experta', cat: 'Memoria', name: 'Memoria experta', desc: 'Tablero grande de 24 cartas y solo 2 minutos. ¿Cuántas parejas logras?', icon: '🧠', make: function () { return memoryEngine(6, 4, 120); } },
    { id: 'rompebloques', cat: 'Arcade', name: 'Rompebloques', desc: 'Rebota la bola con la paleta y rompe todos los bloques. Tres vidas.', icon: '🧱', make: function () { return breakoutEngine({}); } },
    { id: 'rompebloques-multibola', cat: 'Arcade', name: 'Rompebloques multibola', desc: 'Tres bolas a la vez. Más caos, más puntos, misma paleta.', icon: '🎱', make: function () { return breakoutEngine({ balls: 3 }); } },
    { id: 'rompebloques-laser', cat: 'Arcade', name: 'Rompebloques con láser', desc: 'La paleta dispara con Espacio. Rompe bloques desde lejos.', icon: '🔫', make: function () { return breakoutEngine({ laser: true }); } },
    { id: 'pong', cat: 'Deportes', name: 'Pong contra la máquina', desc: 'El clásico duelo de paletas. Gana quien llegue primero a 7 puntos.', icon: '🏓', make: function () { return pongEngine('ai'); } },
    { id: 'pong-pared', cat: 'Deportes', name: 'Pong contra la pared', desc: 'Solo tú y la bola. Cada rebote suma y la bola acelera. ¿Cuánto aguantas?', icon: '🎾', make: function () { return pongEngine('pared'); } },
    { id: 'vuelo', cat: 'Arcade', name: 'Vuelo', desc: 'Aletea entre las tuberías sin chocar. Un toque, un aleteo.', icon: '🐤', make: function () { return flappyEngine({ speed: 170, gap: 160 }); } },
    { id: 'vuelo-rapido', cat: 'Arcade', name: 'Vuelo rápido', desc: 'Tuberías más rápidas y huecos más estrechos. Solo para reflejos finos.', icon: '🚀', make: function () { return flappyEngine({ speed: 250, gap: 130 }); } },
    { id: 'bloques', cat: 'Puzzle', name: 'Bloques', desc: 'Encaja las piezas que caen y completa líneas. El clásico juego de piezas.', icon: '🟦', make: function () { return tetrisEngine({ speed: 0.8 }); } },
    { id: 'bloques-caida', cat: 'Puzzle', name: 'Bloques en caída libre', desc: 'Las piezas caen mucho más rápido. Completa líneas antes de que se llene el tablero.', icon: '⬇️', make: function () { return tetrisEngine({ speed: 0.5 }); } },
    { id: 'fusion-2048', cat: 'Puzzle', name: 'Fusión 2048', desc: 'Desliza las fichas y fusiona iguales hasta llegar a 2048.', icon: '🔢', make: function () { return fusionEngine(4); } },
    { id: 'fusion-mini', cat: 'Puzzle', name: 'Fusión mini 3x3', desc: 'El mismo reto en un tablero de 3x3. Llega a 512 para ganar.', icon: '🔣', make: function () { return fusionEngine(3); } },
    { id: 'invasores', cat: 'Acción', name: 'Invasores del espacio', desc: 'Defiende la base de la flota invasora. Dispara antes de que lleguen abajo.', icon: '👾', make: function () { return shooterEngine('invasores'); } },
    { id: 'asteroides', cat: 'Acción', name: 'Asteroides', desc: 'Destruye las rocas que caen del cielo. Las pequeñas valen más puntos.', icon: '☄️', make: function () { return shooterEngine('asteroides'); } },
    { id: 'tiro-blanco', cat: 'Acción', name: 'Tiro al blanco', desc: 'Tienes 30 segundos: toca los blancos, el dorado vale 30 y la bomba te quita 20.', icon: '🎯', make: function () { return shooterEngine('blanco'); } },
    { id: 'corredor', cat: 'Carreras', name: 'Corredor saltarín', desc: 'Corre y salta los obstáculos. Cada segundo la velocidad sube.', icon: '🏃', make: function () { return runnerEngine('salto'); } },
    { id: 'esquiva', cat: 'Arcade', name: 'Esquiva bloques', desc: 'Muévete de lado a lado y esquiva la lluvia de bloques. Sobrevive todo lo que puedas.', icon: '🧱', make: function () { return runnerEngine('esquiva'); } },
    { id: 'salto-nubes', cat: 'Arcade', name: 'Salto entre nubes', desc: 'Rebota de nube en nube y sube lo más alto que puedas sin caer.', icon: '☁️', make: function () { return runnerEngine('nubes'); } },
    { id: 'desliza-15', cat: 'Puzzle', name: 'Desliza 15', desc: 'Ordena las fichas del 1 al 15 moviendo solo las que están junto al hueco.', icon: '🔢', make: function () { return slide15Engine(); } },
    { id: 'buscaminas', cat: 'Puzzle', name: 'Buscaminas', desc: 'Abre las casillas sin pisar las 10 minas. Los números te dicen cuántas hay cerca.', icon: '💣', make: function () { return minesweeperEngine(); } },
    { id: 'conecta-3', cat: 'Puzzle', name: 'Conecta 3', desc: 'Intercambia gemas vecinas para alinear 3 o más. Tienes 60 segundos.', icon: '💎', make: function () { return match3Engine(); } },
    { id: 'simon', cat: 'Memoria', name: 'Simón', desc: 'Mira la secuencia de colores y repítela. Cada ronda añade un color más.', icon: '🎨', make: function () { return simonEngine(); } },
    { id: 'laberinto', cat: 'Puzzle', name: 'Laberinto', desc: 'Encuentra la salida verde antes de que se acabe el tiempo. Cada nivel es un laberinto nuevo.', icon: '🗺️', make: function () { return mazeEngine(); } },
    { id: 'tres-raya', cat: 'Clásicos', name: 'Tres en raya', desc: 'El clásico juego de X y O contra la máquina. Gana quien gane 3 rondas.', icon: '❌', make: function () { return tictactoeEngine(); } },
    { id: 'ahorcado', cat: 'Palabras', name: 'Ahorcado', desc: 'Adivina la palabra letra por letra. Tienes 6 errores por palabra y 3 palabras.', icon: '🔤', make: function () { return hangmanEngine(); } },
    { id: 'topo', cat: 'Arcade', name: 'Atrapa al topo', desc: 'Toca al topo cuando asome del agujero. Tienes 30 segundos y el topo dorado vale 30.', icon: '🐹', make: function () { return whackEngine(); } },
    { id: 'reaccion', cat: 'Arcade', name: 'Prueba de reflejos', desc: 'Toca solo cuando el panel se ponga verde. 5 rondas, mientras más rápido, más puntos.', icon: '⚡', make: function () { return reactionEngine(); } },
    { id: 'atrapa-frutas', cat: 'Arcade', name: 'Atrapa frutas', desc: 'Mueve la cesta y atrapa la fruta que cae. Cuidado con las bombas: tienes 3 vidas.', icon: '🍎', make: function () { return catchEngine(); } },
    { id: 'carrera', cat: 'Carreras', name: 'Carrera de autos', desc: 'Cambia de carril y esquiva los autos. La velocidad sube con la distancia.', icon: '🏎️', make: function () { return raceEngine(); } },
    { id: 'burbujas', cat: 'Arcade', name: 'Burbujas', desc: 'Revienta las burbujas antes de que se escapen. 30 segundos, las doradas valen 50.', icon: '🫧', make: function () { return bubblesEngine(); } },
    { id: 'torres', cat: 'Arcade', name: 'Torres', desc: 'Suelta cada bloque justo encima del anterior. Si fallas, la torre se cae.', icon: '🏗️', make: function () { return towerEngine(); } }
  ];

  /* ---------------- exportación ---------------- */
  var api = {
    GAMES: GAMES,
    GAME_CATEGORIES: GAME_CATEGORIES,
    tileColor: tileColor,
    init: init,
    openGame: openGame,
    closeGame: closeGame,
    startGame: startGame,
    getBest: getBest,
    saveBest: saveBest,
    getPlays: getPlays,
    toggleFavorite: toggleFavorite,
    getFavorites: getFavorites,
    getRecommendations: getRecommendations,
    getGameInfo: getGameInfo,
    makeGame: makeGame,
    rateGame: rateGame,
    getGameRating: getGameRating,
    getLocalRating: getLocalRating,
    markRatingSynced: markRatingSynced,
    getGamePlayers: getGamePlayers,
    setSound: setSound,
    isSoundOn: isSoundOn,
    startOnlineGame: startOnlineGame,
    setOnlineOpponentScore: setOnlineOpponentScore,
    setOnlineResult: setOnlineResult,
    onlineMove: onlineMove,
    isOnlineGame: isOnlineGame,
    getCurrentGameId: getCurrentGameId
  };

  if (typeof window !== 'undefined') window.WordRedGames = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
