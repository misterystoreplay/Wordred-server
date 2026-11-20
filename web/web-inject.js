/* WordRed Web 1.0 — parche en tiempo de ejecución (web-inject.js).
   Se carga justo después de app.js en index.html y corre en el mundo
   principal de la página, antes de que arranque la app.

   DIVISIÓN DE TRABAJO (importante): app.js y core.js ya llevan los cambios
   que necesitan tocar el interior de la app (versión «Web 1.0»,
   actualización desactivada, cajón sin apps del teléfono, compartir el
   enlace, entrar con Google con Google Identity Services, tiempo en
   pantalla). Todo el código de la app vive dentro de una función anónima
   (IIFE) y sus variables y funciones NO son propiedades de window, así
   que asignar window.checkAppUpdate = ... NO cambia lo que la app usa de
   verdad. Este parche solo hace lo que SÍ se puede desde fuera: el puente
   mínimo (window.AndroidBridge, que la app sí lee como propiedad de
   window) y ocultar las tarjetas de actualización en el DOM. */
(function () {
'use strict';
var WEB_VERSION = 'Web 1.0';
/* Marcador de diagnóstico (solo para pruebas externas): la versión que
   se muestra sale del app.js editado (APP_VERSION_NAME = 'Web 1.0'); esta
   propiedad de window NO toca el interior de la app. */
window.__wrWebPatchInstalled = true;
window.APP_VERSION_NAME = WEB_VERSION;

/* 1. Puente mínimo para la web. La app solo usa estos tres métodos fuera
   de los gestos que ya tienen alternativa en el navegador: abrir enlaces
   y descargar (window.open), copiar texto (portapapeles) y compartir
   (navigator.share o portapapeles). Deliberadamente NO se implementan
   startMediaUpload, saveMediaFile, listInstalledApps ni openApp: sin
   ellos la app usa sus alternativas del navegador, que ya funcionan. */
window.AndroidBridge = {
  openExternalUrl: function (url) {
    try { window.open(url, '_blank'); } catch (e) {}
  },
  copyText: function (text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(String(text || ''));
      }
    } catch (e) {}
    return '';
  },
  shareText: function (text) {
    var t = String(text || '');
    try {
      if (navigator.share) { navigator.share({ text: t }); return; }
    } catch (e) {}
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(t);
      }
    } catch (e) {}
  }
};

/* 2. Sin tarjetas de actualización en la web: al abrir la página ya
   tienes la última versión. Se ocultan en el DOM (no se borran, por si
   algo las vuelve a dibujar) y un observador las vuelve a ocultar si
   reaparecen; el paso de seguridad al segundo y medio cubre el dibujado
   tardío de Ajustes. */
function hideUpdateCards() {
  ['updateCard', 'windowsCard'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el && el.style.display !== 'none') el.style.setProperty('display', 'none', 'important');
  });
  document.querySelectorAll('#settingsView .sectitle').forEach(function (el) {
    var t = (el.textContent || '').trim();
    if (t === 'Actualizaciones' || t === 'Descargar para Windows') el.style.setProperty('display', 'none', 'important');
  });
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hideUpdateCards);
} else {
  hideUpdateCards();
}
try {
  new MutationObserver(function () { hideUpdateCards(); }).observe(document.documentElement, { childList: true, subtree: true });
} catch (e) {}
setTimeout(hideUpdateCards, 1500);
})();
