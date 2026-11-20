# WordRed Web 1.0 — NOTAS

Versión web de WordRed: se abre con un enlace en el navegador, sin
descargar ni instalar nada. Las actualizaciones llegan solas al abrir
la página. Contenido de Android 1.5.64, mismo servidor (4.8), mismas
cuentas y mismas publicaciones.

## Qué hay aquí

- `index.html`, `app.js`, `core.js`, `games.js`, `ytplayer.html`,
  `qrcode.js`, `jsqr.js`, `logo.png`, `musica/`, `dramas/`, `ejemplo/`,
  `fantore/`, `ps-games/`, `store-logos/`, `stickers/`: copias de los
  assets de Android 1.5.64.
- `games.js`, `ytplayer.html`, `qrcode.js`, `jsqr.js`: byte-idénticos
  a los de Android 1.5.64.
- `app.js`, `core.js`, `index.html`: copias ADAPTADAS con cambios
  mínimos y documentados, cada uno marcado «Web 1.0» (la prueba Node
  comprueba que el diff contra Android solo contiene esos cambios:
  `app.js` 150 líneas, `core.js` 4 líneas, `index.html` 11 líneas).
- `web-inject.js`: el parche pequeño que queda en tiempo de ejecución
  (puente web mínimo + ocultar las tarjetas de actualización).
- `tests/`: `test-web.js` (Node) y `test-web-dom.js` (humo DOM en
  Electron real). Correr con `node tests/test-web.js` y con Electron
  + xvfb (ver `tests/`).

## Por qué los cambios van DENTRO de app.js (y no en un parche)

Todo el código de la app vive dentro de una función anónima (IIFE) y
sus variables y funciones NO son propiedades de `window`. Asignar
`window.checkAppUpdate = ...` o `window.refreshLauncherApps = ...`
desde fuera NO cambia lo que la app usa de verdad (la primera versión
de esta web lo hacía así y el cajón seguía mostrando apps de
demostración falsas). Por eso los cambios que tocan el interior van
editados directamente en la copia web de `app.js`/`core.js`, y
`web-inject.js` solo hace lo que sí se puede desde fuera (el puente
`window.AndroidBridge`, que la app sí lee como propiedad de window,
y ocultar tarjetas en el DOM).

## Qué se adaptó (todo marcado «Web 1.0»)

1. Versión «Web 1.0» en todas partes (el contenido sigue siendo el de
   Android 1.5.64).
2. Sin sistema de actualizaciones: `checkAppUpdate` anulada (en la web
   no hay APK: al abrir la página ya tienes la última versión), aviso
   de Windows anulado, tarjetas «Buscar actualización» y «WordRed
   para Windows» ocultas siempre en Ajustes.
3. Cajón de aplicaciones sin apps del teléfono y sin demos falsas:
   la lista queda vacía y el cajón solo muestra la entrada fija de
   Fantore Resurrección (real) y el botón de noticias. Sin la
   entrada «Batería» en «+ Agregar apartado». «Tu tiempo hoy» dice
   que cuenta el tiempo con la página abierta en el navegador.
4. Compartir WordRed comparte el enlace de la página, no un APK.
5. Entrar con Google usa Google Identity Services con el mismo ID de
   cliente web que ya usa la app; el servidor verifica el token igual
   que en Android (`POST /api/auth/google`). Si GIS no carga o este
   origen no está autorizado en Google Cloud, el botón avisa y queda
   el inicio por teléfono, que sí funciona. La nota junto al botón
   dice que Google pide la cuenta en una ventana emergente (no se
   abre una página aparte).
6. Entrar por teléfono usa EL SERVIDOR, no el SMS del teléfono: en
   Android la app manda el código por SMS y lo lee sola; en la web
   no hay SMS que mandar, así que el código se pide al servidor
   (`POST /api/auth/request-code`) y se verifica contra el servidor
   (`POST /api/auth/verify`), igual que el código por correo. En modo
   de prueba el servidor devuelve el código y la app lo verifica
   sola; cuando el servidor tenga SMS de verdad, el código llega por
   SMS y se escribe en la pantalla del código. La petición del código
   va con reintentos (el servidor gratuito se duerme). Sin este cambio
   el inicio por teléfono no funcionaría en la web para nadie.
7. Dos avisos de consola corregidos: sin «web-share» en el `allow`
   del iframe del drama (Chromium lo marca como función no
   reconocida) y sin «allow-same-origin» en el sandbox de la vista
   web interna (esa vista solo carga páginas externas —demo del
   juego, Play Store— y Chromium avisa de que `allow-scripts` +
   `allow-same-origin` puede escapar del sandbox).
8. El resto funciona igual que en Android porque ya era JavaScript
   puro: feed, publicaciones, Shorts, dramas (48 series, reproductor
   de YouTube en la página — en la web NO da el Error 153 de
   `file://`), Reels, historias, grupos, perfil, chat, promociones,
   noticias (vía rss2json), búsqueda, ajustes, tutorial y FAQ (29),
   llamadas y lives (WebRTC + `getUserMedia`), geolocalización del
   clima (`navigator.geolocation`), exportar chats (descarga JSON),
   juegos (visor web interno).

## Qué NO funciona igual en la web (quitado limpio, sin botones muertos)

- Lanzador de apps del teléfono: el cajón no lista ni abre apps
  instaladas (no hay «Enviar APK», eso era de la 1.5.65, que no está
  construida).
- Notificaciones del teléfono (push/sistema): no hay. La campana
  interna de WordRed sí funciona (avisos dentro de la app).
- Batería: sin indicador ni avisos de batería; la entrada «Batería»
  no aparece en «+ Agregar apartado».
- «Tu tiempo hoy» cuenta el tiempo con la página abierta en el
  navegador, no el uso del teléfono.
- El botón «atrás» del navegador sale de la página (no cierra
  ventanas como en Android); las ventanas tienen su propio ✕ y
  «‹ Volver».
- Las subidas de video/audio grandes van como dataURL en memoria
  (igual que en Windows): el navegador avisa si no caben. No hay
  subida en segundo plano con la pestaña cerrada.
- Llamadas y lives necesitan HTTPS y permiso de micrófono/cámara del
  navegador (en GitHub Pages es HTTPS, así que vale).
- El juego Fantore: el botón «Jugar» descarga su APK (archivo real
  del servidor) en vez de instalarlo directo; en la web no se puede
  instalar una app Android.

## CORS y servidor 4.9 — PREPARADO, NO PUBLICADO

Hallazgo: el servidor 4.8 YA permite llamadas entre orígenes
(`Access-Control-Allow-Origin: *`, verificado en vivo con preflight),
así que el feed, el inicio de sesión y las subidas funcionan desde
una página web. PERO el preflight NO devuelve
`Access-Control-Allow-Methods`: el navegador bloquea las llamadas
PUT y DELETE (editar publicaciones/grupos/anuncios y borrar
publicaciones/comentarios/cuenta). Comprobado en vivo y en el humo
DOM (la sonda PUT se bloquea).

Cambio mínimo preparado en el árbol de trabajo
`~/workspace/wordred-server-v35/server.js` (NO publicado, lo publica
el agente principal por su flujo habitual):

- Línea del middleware CORS: añadido
  `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`.
- `/api/health`: versión `4.8` → `4.9`.

Al publicar la 4.9 hay que actualizar también el pin de versión en
`tests/test-server.js` (línea 145: dice 4.8) o su prueba fallará.
Mientras la 4.9 no esté en vivo, en la web fallan solo editar y
borrar (el resto funciona); la app muestra el error claro con
Reintentar, como en Android.

## Publicar la web (recomendado: GitHub Pages)

Recomendación: **GitHub Pages** en el repositorio
`misterystoreplay/Wordred-server`, carpeta `web/` con el contenido
de este proyecto (14 MB, ~145 archivos, todo estático, sin paso de
construcción: se copia tal cual). Pasos:

1. Subir esta carpeta como `web/` en el repositorio (rama main).
2. En GitHub: Settings → Pages → Build and deployment → Deploy from
   a branch → rama `main`, carpeta `/web`.
3. La dirección queda
   `https://misterystoreplay.github.io/Wordred-server/web/` (o con
   dominio propio si se configura).
4. Publicar el servidor 4.9 (arriba) para que editar/borrar
   funcionen desde la web.
5. En Google Cloud Console, en el cliente web de WordRed
   (`730186387438-pj78hmj6tc8626hbr7078rkk0daqhoq0...`), añadir la
   dirección de Pages a «Orígenes de JavaScript autorizados» para que
   el inicio con Google funcione. Sin ese paso, Google avisa y queda
   el inicio por teléfono (que sí funciona). La consola de Google
   sigue en TESTING: con Google solo puede entrar
   misterystoreplay@gmail.com, igual que en Android.

Por qué Pages y no las otras opciones:

- **Render Static Site**: también vale (HTTPS, siempre despierto),
  pero es otro servicio que mantener y el usuario ya usa GitHub
  para publicar WordRed.
- **Servir la web desde el propio servidor Node** (mismo origen, sin
  CORS): se descartó porque la página dejaría de cargar cuando el
  servidor gratuito se duerme; en Pages la página abre al instante
  y solo las llamadas a la API esperan a que Render despierte (la
  app ya lo maneja con reintentos, como en Android).

## Límites honestos

- NO probado en un navegador real ni en un teléfono real: las
  pruebas corren en Electron (Chromium) en esta máquina virtual.
  Solo el usuario lo confirma abriendo el enlace en su PC o en su
  Motorola.
- El inicio con Google depende de que el origen de Pages se añada
  en Google Cloud (arriba); sin eso, Google no entra y queda el
  teléfono.
- La prueba de que un drama «suena» se hizo en Electron con audio
  silenciado: se comprueba el tiempo real del reproductor de YouTube
  avanzando (API de YouTube por postMessage), no se escucha de verdad
  aquí. Ojo: en esta VM el Chromium no confía en el certificado de
  YouTube por el proxy de salida (ERR_CERT_AUTHORITY_INVALID), así
  que la prueba DOM se corre con `--ignore-certificate-errors`
  (solo la prueba, no la app); en un navegador real el certificado
  de YouTube es válido.
- La librería de Google (GIS) escribe un aviso en la consola sobre
  FedCM (sus métodos de estado del prompt dejarán de funcionar
  cuando FedCM sea obligatorio). No es un error ni un fallo de la
  app; migrar a FedCM queda para una versión posterior. La prueba
  DOM lo ignora a propósito y documenta por qué.
- Sin PWA ni modo sin conexión: la página necesita internet (el
  servidor gratuito duerme tras 15 min sin uso; la app reintenta al
  despertar, como en Android).
- Los datos (cuenta, borradores, ajustes) viven en el
  `localStorage` del navegador: son por navegador y se pierden si se
  borran los datos del sitio; no se comparten con la app de Android.

## Pruebas

- `node tests/test-web.js`: **87 PASS, 0 FAIL** (archivos, diffs
  «Web 1.0» contra Android 1.5.64, sintaxis, palabras prohibidas,
  pie, mismo servidor, parche, servidor 4.9 en el árbol y servidor
  EN VIVO: salud, feed, 48 dramas, preflight CORS).
- `tests/test-web-dom.js` (Electron + xvfb, con servidor HTTP
  local): **13 PASS, 0 FAIL** — arranque, versión Web 1.0, pantalla
  de inicio, tarjetas de actualización ocultas, cajón sin demos (solo
  Fantore), puente mínimo, feed en vivo, 48 dramas en vivo, sonda PUT
  bloqueada hasta la 4.9, botón de Google sin errores, inicio de
  sesión real por teléfono (cuenta NUEVA en cada run, con
  verificación automática por el servidor en modo de prueba), feed
  dibujado, drama reproduciéndose (tiempo de YouTube avanzando) y sin
  errores de consola. La cuenta de prueba se borra del servidor al
  final de cada run (desde el proceso principal, porque el DELETE
  desde el navegador está bloqueado por CORS hasta la 4.9). La prueba
  usa un teléfono nuevo en cada run porque el servidor solo deja
  pedir 3 códigos por hora y por número: con un número fijo la
  prueba se agota al tercer run (eso pasó una vez: 429).
