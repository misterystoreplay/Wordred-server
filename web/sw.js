// WordRed Web — Service Worker (Web 1.5)
// ------------------------------------------------------------
// IMPORTANTE: este archivo se sirve desde la raíz de la carpeta
// web/ de GitHub Pages (https://misterystoreplay.github.io/
// Wordred-server/web/), por eso el registro debe ser RELATIVO
// ('sw.js', scope './') y NUNCA absoluto ('/sw.js'): una ruta
// absoluta apuntaría a la raíz del dominio y el worker quedaría
// fuera del alcance de la app. El alcance (scope) de este
// worker es solo la carpeta web/.
// ------------------------------------------------------------
// El worker NO cachea nada: la app es una página estática y
// las publicaciones se reintentan desde la página. Su trabajo
// es: (1) mostrar notificaciones push, (2) abrir la app al
// tocar una notificación, (3) avisar a la página abierta para
// que reintente las subidas pendientes (Background Sync).
// ------------------------------------------------------------

'use strict';

var APP_ROOT = './';
var ICON = 'logo.png';
var GENERIC_TITLE = 'WordRed';
var GENERIC_BODY = 'Tienes un aviso nuevo en WordRed.';
var SYNC_TAG = 'wordred-upload-sync';

// ----------------------------------------------------------
// Instalación / activación: tomar el control cuanto antes.
// ----------------------------------------------------------
self.addEventListener('install', function (event) {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

// ----------------------------------------------------------
// Push: el servidor envía exactamente
//   JSON.stringify({ title, body, data: data || {} })
// Mostrar la notificación; si el mensaje falta o viene roto,
// mostrar un aviso genérico. Nunca romper por un push malo.
// ----------------------------------------------------------
self.addEventListener('push', function (event) {
  var title = GENERIC_TITLE;
  var body = GENERIC_BODY;
  var data = {};

  if (event.data) {
    try {
      var payload = event.data.json();
      if (payload) {
        if (typeof payload.title === 'string' && payload.title) {
          title = payload.title;
        }
        if (typeof payload.body === 'string' && payload.body) {
          body = payload.body;
        }
        if (payload.data && typeof payload.data === 'object') {
          data = payload.data;
        }
      }
    } catch (err) {
      // Mensaje mal formado: se usa el aviso genérico.
      title = GENERIC_TITLE;
      body = GENERIC_BODY;
      data = {};
    }
  }

  var options = {
    body: body,
    icon: ICON,
    badge: ICON,
    data: data
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ----------------------------------------------------------
// Tocar la notificación: cerrarla y abrir (o enfocar) la app.
// Si el mensaje trae data.url, abrir esa ruta dentro de la
// app; si no, abrir la raíz. Funciona aunque la pestaña esté
// cerrada.
// ----------------------------------------------------------
self.addEventListener('notificationclick', function (event) {
  event.notification.close();

  var target;
  var data = event.notification.data;
  if (data && typeof data.url === 'string' && data.url) {
    // La url del servidor es una ruta dentro de la app
    // (por ejemplo '/?post=123'); se resuelve contra la raíz.
    try {
      target = new URL(data.url, self.registration.scope).href;
    } catch (err) {
      target = null;
    }
  }
  if (!target) {
    // Sin url: abrir la raíz de la app (resuelta en absoluto
    // para que la comparación con las pestañas abiertas sea exacta).
    try {
      target = new URL(APP_ROOT, self.registration.scope).href;
    } catch (err) {
      target = APP_ROOT;
    }
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url === target && 'focus' in client) {
            return client.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(target);
        }
      })
  );
});

// ----------------------------------------------------------
// Background Sync ('wordred-upload-sync'): avisar a cualquier
// pestaña abierta de la app para que reintente las subidas
// pendientes. Si no hay ninguna pestaña abierta, no hacer
// nada: la app reanuda las subidas al volver a abrirse (ese
// es el comportamiento de respaldo documentado). Nunca lanzar
// errores.
// ----------------------------------------------------------
self.addEventListener('sync', function (event) {
  if (event.tag !== SYNC_TAG) {
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (clientList) {
        for (var i = 0; i < clientList.length; i++) {
          try {
            clientList[i].postMessage({ type: 'wordred-flush-pending' });
          } catch (err) {
            // Un cliente que no acepta el mensaje no debe romper el sync.
          }
        }
      })
      .catch(function () {
        // Sin clientes o sin soporte: el respaldo es reanudar al abrir.
      })
  );
});
