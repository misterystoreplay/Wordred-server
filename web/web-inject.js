/* WordRed Web 1.2 — parche en tiempo de ejecución (web-inject.js).
   Se carga justo después de app.js en index.html y corre en el mundo
   principal de la página, antes de que arranque la app.

   DIVISIÓN DE TRABAJO (importante): app.js y core.js ya llevan los cambios
   que necesitan tocar el interior de la app (versión «Web 1.2», barras
   transparentes que se ocultan solas, sin cajón de aplicaciones, Mercado
   en el centro de la barra, Inicio en rojo, sin actualizaciones ni
   descarga de Windows, sin opciones del teléfono, regla de Inicio y
   desplazamiento, iconos de la barra de abajo simétricos, Eventos en el
   perfil, sin buscador del Inicio). Todo el código de la app vive dentro de una función
   anónima (IIFE) y sus variables y funciones NO son propiedades de
   window, así que asignar window.checkAppUpdate = ... NO cambia lo que
   la app usa de verdad. Este parche solo hace lo que SÍ se puede desde
   fuera: el puente mínimo (window.AndroidBridge, que la app sí lee como
   propiedad de window) y que el navegador no restaure el desplazamiento
   al cargar (regla 1 de Inicio: siempre arriba).
   Web 1.1: las tarjetas de actualización y de Windows YA NO EXISTEN en
   app.js ni en index.html (se borraron de verdad), así que ya no hay
   nada que ocultar en el DOM: la función hideUpdateCards de la 1.0 se
   quitó. */
(function () {
'use strict';
var WEB_VERSION = 'Web 1.11';
/* Marcador de diagnóstico (solo para pruebas externas): la versión que
   se muestra sale del app.js editado (APP_VERSION_NAME = 'Web 1.2'); esta
   propiedad de window NO toca el interior de la app. */
window.__wrWebPatchInstalled = true;
window.APP_VERSION_NAME = WEB_VERSION;

/* Web 1.1, regla 1 de Inicio: al cargar la página, siempre arriba del
   Inicio. El navegador no restaura el desplazamiento de la visita
   anterior (sin esto, al recargar, el navegador dejaría la página
   donde estaba). */
try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) {}

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
})();
