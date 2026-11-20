/* WordRed Web 1.5 — barras laterales del diseño ancho.
   Rellena #wideLeft1550 y #wideRight1550 solo con datos reales del
   teléfono y del servidor. No inventa nada: si no hay sesión, si
   falta WordRedCore o si el servidor no responde, las barras se
   ocultan o muestran un mensaje honesto. Solo lee localStorage;
   nunca escribe en él. */
(function () {
  'use strict';
  var STATE_KEY = 'wordred_state_v1';
  var SAVED_KEY = 'wordred_saved_v1';
  var DRAMA_MIN_MS = 60000;
  var REFRESH_MS = 5000;
  var MAX_SUGGEST = 6;
  var MAX_DRAMAS = 5;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function digits(p) { return String(p || '').replace(/\D/g, ''); }

  function readState() {
    try {
      var raw = window.localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      var st = JSON.parse(raw);
      if (!st || typeof st !== 'object' || !st.me) return null;
      return st;
    } catch (e) { return null; }
  }

  function readSavedCount(me) {
    try {
      var raw = window.localStorage.getItem(SAVED_KEY);
      if (!raw) return 0;
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return 0;
      var mine = digits(me);
      var n = 0;
      arr.forEach(function (it) {
        if (it && digits(it.phone) === mine) n++;
      });
      return n;
    } catch (e) { return 0; }
  }

  var lastLeftHtml = null;
  var lastRightSig = null;
  var dramaCache = { at: 0, list: null };
  var dramaFailed = false;
  var dramaFetching = false;
  var dramaAttemptAt = 0;

  function core() { return window.WordRedCore || null; }

  function avatarHtml(profile) {
    var name = (profile && profile.name) || '';
    var initial = esc((name || '?').charAt(0).toUpperCase());
    var img = '';
    if (profile && profile.photo) {
      img = '<img src="' + esc(profile.photo) + '" alt="" loading="lazy" onerror="this.remove()">';
    }
    return '<span class="wide1550-avatar">' + initial + img + '</span>';
  }

  function renderLeft(st) {
    var left = $('wideLeft1550');
    if (!left) return;
    var C = core();
    var list = [];
    try {
      if (C && typeof C.friendSuggestions === 'function') {
        list = C.friendSuggestions(st, st.me) || [];
      }
    } catch (e) { list = []; }
    list = list.filter(function (it) { return it && it.profile; }).slice(0, MAX_SUGGEST);
    var html = '<div class="wide1550-sec"><h2 class="wide1550-title">Gente que quizá conozcas</h2>';
    if (!list.length) {
      html += '<p class="wide1550-empty">Sin sugerencias por ahora.</p>';
    } else {
      html += '<div class="wide1550-list">';
      list.forEach(function (it) {
        var p = it.profile;
        var phone = p.phone || '';
        var name = p.name || phone;
        var mutual = (typeof it.mutual === 'number') ? it.mutual : 0;
        var sub = mutual > 0 ? mutual + (mutual === 1 ? ' en común' : ' en común') : 'Sugerencia para ti';
        html += '<div class="wide1550-row" data-phone="' + esc(phone) + '" data-act="open" tabindex="0">' +
          avatarHtml(p) +
          '<span class="wide1550-who"><span class="wide1550-name">' + esc(name) + '</span>' +
          '<span class="wide1550-mutual">' + esc(sub) + '</span></span>' +
          '<button type="button" class="wide1550-follow" data-phone="' + esc(phone) + '" data-act="follow">Seguir</button>' +
          '</div>';
      });
      html += '</div>';
    }
    html += '</div>';
    if (html !== lastLeftHtml) { left.innerHTML = html; lastLeftHtml = html; }
  }

  function dramaRowsHtml() {
    if (dramaCache.list && dramaCache.list.length) {
      var html = '<div class="wide1550-list">';
      dramaCache.list.forEach(function (s) {
        var initial = esc(((s && s.name) || '?').charAt(0).toUpperCase());
        var img = (s && s.poster)
          ? '<img src="' + esc(s.poster) + '" alt="" loading="lazy" onerror="this.remove()">'
          : '';
        var app = (s && s.source) ? esc(s.source) : '';
        html += '<div class="wide1550-drama" data-id="' + esc(s.id || '') + '" data-act="drama" tabindex="0">' +
          '<span class="wide1550-poster">' + initial + img + '</span>' +
          '<span class="wide1550-drama-body"><span class="wide1550-drama-name">' + esc(s.name || '') + '</span>' +
          (app ? '<span class="wide1550-drama-app">' + app + '</span>' : '') +
          '</span></div>';
      });
      html += '</div>';
      return html;
    }
    return '';
  }

  function renderRight(st) {
    var right = $('wideRight1550');
    if (!right) return;
    var savedCount = readSavedCount(st.me);
    var dramaStatus = dramaFailed ? 'off' : (dramaCache.list ? 'ok' : 'loading');
    var dramaSig = dramaCache.list
      ? dramaCache.list.map(function (s) { return s.id; }).join(',')
      : '';
    var sig = savedCount + '|' + dramaStatus + '|' + dramaSig;
    if (sig === lastRightSig) return;
    lastRightSig = sig;
    var html = '<div class="wide1550-sec"><h2 class="wide1550-title">Guardados</h2>' +
      '<button type="button" class="wide1550-saved" data-act="saved">' +
      '<span aria-hidden="true">&#128278;</span><span>Mis guardados</span>' +
      '<span class="wide1550-count">' + savedCount + '</span></button>' +
      (savedCount === 0 ? '<p class="wide1550-empty">Aún no guardas nada.</p>' : '') +
      '</div>';
    html += '<div class="wide1550-sec"><h2 class="wide1550-title">Dramas destacados</h2>';
    if (dramaCache.list && dramaCache.list.length) {
      html += dramaRowsHtml();
      if (dramaFailed) html += '<p class="wide1550-offline">Sin conexión por ahora.</p>';
    } else if (dramaFailed) {
      html += '<p class="wide1550-offline">Sin conexión por ahora.</p>';
    } else {
      html += '<p class="wide1550-empty">Cargando dramas…</p>';
    }
    html += '</div>';
    right.innerHTML = html;
  }

  function maybeFetchDramas(st) {
    var now = Date.now();
    if (dramaCache.list && (now - dramaCache.at) < DRAMA_MIN_MS) return;
    if (dramaFetching) return;
    if ((now - dramaAttemptAt) < DRAMA_MIN_MS && dramaCache.list) return;
    var C = core();
    if (!C || typeof C.serverFetch !== 'function') { dramaFailed = true; return; }
    dramaFetching = true;
    dramaAttemptAt = now;
    var p = null;
    try { p = C.serverFetch(st, '/api/kdramas', 'GET', null, 8000); } catch (e) { p = null; }
    if (!p || typeof p.then !== 'function') {
      dramaFetching = false;
      dramaFailed = true;
      renderRight(st);
      return;
    }
    p.then(function (r) {
      dramaFetching = false;
      if (r && r.ok && r.data && Array.isArray(r.data.kdramas) && r.data.kdramas.length) {
        dramaCache = { at: Date.now(), list: r.data.kdramas.slice(0, MAX_DRAMAS) };
        dramaFailed = false;
      } else {
        dramaFailed = true;
      }
      renderRight(readState() || st);
    }).catch(function () {
      dramaFetching = false;
      dramaFailed = true;
      renderRight(readState() || st);
    });
  }

  function markSent(btn) {
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Enviada';
  }

  function onFollow(phone, btn) {
    try {
      if (typeof window.__wrWideFollow === 'function') {
        window.__wrWideFollow(phone);
        markSent(btn);
        return;
      }
    } catch (e) {}
    try {
      if (typeof window.__wrAddFriend === 'function') {
        window.__wrAddFriend(phone);
        markSent(btn);
        return;
      }
    } catch (e) {}
    try {
      if (typeof window.__wrOpenFriends === 'function') window.__wrOpenFriends();
    } catch (e) {}
  }

  function onOpenProfile(phone) {
    try {
      if (typeof window.__wrOpenProfile === 'function') window.__wrOpenProfile(phone);
    } catch (e) {}
  }

  function onOpenDrama(id) {
    if (!id) return;
    try {
      if (typeof window.__wrWideOpenDrama === 'function') { window.__wrWideOpenDrama(id); return; }
    } catch (e) {}
    try {
      if (typeof window.__wrOpenDrama1562 === 'function') window.__wrOpenDrama1562(id);
    } catch (e) {}
  }

  function onOpenSaved() {
    try {
      if (typeof window.__wrWideOpenSaved === 'function') { window.__wrWideOpenSaved(); return; }
    } catch (e) {}
    try {
      if (typeof window.__wrOpenSavedShorts === 'function') window.__wrOpenSavedShorts();
    } catch (e) {}
  }

  function onAsideClick(ev) {
    var t = ev.target;
    while (t && t !== ev.currentTarget) {
      var act = t.getAttribute ? t.getAttribute('data-act') : null;
      if (act === 'follow') {
        ev.stopPropagation();
        onFollow(t.getAttribute('data-phone') || '', t);
        return;
      }
      if (act === 'open') { onOpenProfile(t.getAttribute('data-phone') || ''); return; }
      if (act === 'drama') { onOpenDrama(t.getAttribute('data-id') || ''); return; }
      if (act === 'saved') { onOpenSaved(); return; }
      t = t.parentNode;
    }
  }

  function onAsideKey(ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    var t = ev.target;
    var act = t.getAttribute ? t.getAttribute('data-act') : null;
    if (!act) return;
    ev.preventDefault();
    if (act === 'follow') onFollow(t.getAttribute('data-phone') || '', t);
    else if (act === 'open') onOpenProfile(t.getAttribute('data-phone') || '');
    else if (act === 'drama') onOpenDrama(t.getAttribute('data-id') || '');
    else if (act === 'saved') onOpenSaved();
  }

  function render() {
    var left = $('wideLeft1550');
    var right = $('wideRight1550');
    if (!left || !right) return;
    var wide = false;
    try { wide = window.matchMedia('(min-width:1024px)').matches; } catch (e) { wide = false; }
    var st = readState();
    var show = wide && !!st;
    left.hidden = !show;
    right.hidden = !show;
    if (!show) { lastLeftHtml = null; lastRightSig = null; return; }
    renderLeft(st);
    renderRight(st);
    maybeFetchDramas(st);
  }

  function bind() {
    var left = $('wideLeft1550');
    var right = $('wideRight1550');
    if (left && !left.dataset.wideBound) {
      left.dataset.wideBound = '1';
      left.addEventListener('click', onAsideClick);
      left.addEventListener('keydown', onAsideKey);
    }
    if (right && !right.dataset.wideBound) {
      right.dataset.wideBound = '1';
      right.addEventListener('click', onAsideClick);
      right.addEventListener('keydown', onAsideKey);
    }
  }

  function init() {
    bind();
    render();
    try { setInterval(render, REFRESH_MS); } catch (e) {}
    try {
      window.addEventListener('storage', function (ev) {
        if (!ev.key || ev.key === STATE_KEY || ev.key === SAVED_KEY) render();
      });
    } catch (e) {}
    var rT = null;
    try {
      window.addEventListener('resize', function () {
        if (rT) clearTimeout(rT);
        rT = setTimeout(render, 200);
      });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
