# WordRed Web 1.3 — NOTAS

Versión web de WordRed: se abre con un enlace en el navegador, sin
descargar ni instalar nada. Las actualizaciones llegan solas al abrir
la página. Contenido de Android 1.5.64, mismo servidor (4.9), mismas
cuentas y mismas publicaciones.

La Web 1.1 quita el cajón de aplicaciones, quita las actualizaciones
y la descarga de Windows de Ajustes, quita las opciones que solo
funcionan en el teléfono, y cambia las barras: translúcidas, se
ocultan solas al bajar y vuelven al subir; la barra de abajo es más
pequeña, con Mercado en el centro e Inicio en rojo.

La Web 1.2 deja los 5 iconos de la barra de abajo simétricos (mismo
ancho, huecos iguales, grupo centrado), muda los Eventos al perfil
(en el lugar que deja el navegador, que se quita del perfil), quita
del Inicio la fila de botones «Eventos» y «Páginas» y quita el
buscador del Inicio (la búsqueda sigue con la lupa de la barra de
arriba). El reloj, el clima y «+ Agregar apartado» se quedan en el
Inicio como están.

La Web 1.3 mueve los Eventos del perfil: ya no van justo tras la
cabecera, van ABAJO de la caja «¿Qué estás pensando?» (mismo
contenido y misma función: lista, botón «Crear» y diálogo de
creación). Como invitado no hay caja «¿Qué estás pensando?», así
que ahí los Eventos se quedan donde estaban. Todo lo demás de la
1.2 queda igual.

## Qué hay aquí

- `index.html`, `app.js`, `core.js`, `games.js`, `ytplayer.html`,
  `qrcode.js`, `jsqr.js`, `logo.png`, `musica/`, `dramas/`, `ejemplo/`,
  `fantore/`, `ps-games/`, `store-logos/`, `stickers/`: copias de los
  assets de Android 1.5.64.
- `games.js`, `ytplayer.html`, `qrcode.js`, `jsqr.js`: byte-idénticos
  a los de Android 1.5.64.
- `app.js`, `index.html`: copias ADAPTADAS con cambios documentados,
  cada uno marcado «Web 1.3» (la 1.2 marcó los suyos «Web 1.2», la
  1.1 los suyos «Web 1.1» y la 1.0 los suyos «Web 1.0»). En la 1.3
  el diff contra Android es:
  `app.js` pierde ~1.950 líneas y `index.html` ~326; la prueba Node
  comprueba que lo quitado es solo código de cajón/actualizaciones/
  teléfono/buscador del inicio y que lo añadido lleva la marca
  «Web 1.3».
- `core.js`: en la 1.2 se quitaron las dos funciones del buscador del
  inicio (`foldSearchText1562`, `searchAllFolded1562`); su diff
  contra Android es de 50 líneas en 3 hunks (el de la 1.0, la nota
  de lo quitado y la exportación). La vista «Buscar» sigue con
  `searchAll` sin cambios.
- `web-inject.js`: el parche pequeño que queda en tiempo de ejecución
  (puente web mínimo + `history.scrollRestoration = 'manual'` para
  que al cargar la página se empiece arriba del Inicio). En la 1.1
  ya NO oculta tarjetas de actualización: esas tarjetas se borraron
  de verdad, no hay nada que ocultar.
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
y que el navegador no restaure el desplazamiento al cargar).

## Qué cambió en la Web 1.1 (todo marcado «Web 1.1»)

1. **Barras transparentes que se ocultan solas.** La barra de arriba
   (header) y la de abajo (`nav#bottomNav`) pasan de fondo oscuro
   casi opaco a translúcido (`rgba(18,6,8,.45)` con blur): el
   contenido se ve a través, siguiendo la estética flotante
   translúcida de la app. Al bajar en el feed se ocultan solas
   (`translateY` con transición de .25 s) y vuelven al subir o al
   estar arriba del todo (clase `body.bars-hidden-11`).
2. **Sin cajón de aplicaciones.** Se quitó el botón central
   «Aplicaciones» de la barra de abajo, el overlay del cajón
   (`#appsDrawerOverlay`), su cabecera, sus ajustes
   (`drawerSettings1547`) y TODO el código del cajón (abrir/cerrar,
   páginas, puntos, búsqueda, menú de la ficha, insignias de
   avisos, temas de iconos, tamaños, alfa, fondo, abrir apps
   instaladas, «Enviar APK»). También se quitaron TODAS las opciones
   del launcher en Ajustes («Lanzador de inicio» y sus ajustes). El
   cajón en la web solo guardaba Fantore y el botón de noticias:
   las noticias ya tienen su fila en el feed (después del 7º post)
   y su centro se abre ahora tocando esa fila; Fantore sigue en el
   cartel de juegos. No queda ningún botón muerto ni errores en
   consola por funciones que ya no existen.
3. **Barra de abajo más pequeña.** Altura, padding e iconos
   reducidos (iconos de 28 a 24 px, texto de 10 a 9 px, padding de
   8 a 5 px): se nota más compacta y sigue siendo pulsable.
4. **Mercado en el centro.** El chip de Mercado de arriba
   (`#feedMarketBtn`) se quitó y el botón de Mercado quedó en el
   centro de la barra de abajo (el hueco de Aplicaciones), al MISMO
   tamaño que los otros iconos (no el tamaño grande del botón
   central anterior), conectado a la misma acción del chip
   (`go('marketplace')`).
5. **Inicio en rojo.** El icono y el texto de «Inicio» en rojo
   #E60026 (el rojo de la marca), siempre visible en rojo.
6. **Sin la flechita de arriba.** Se quitó la flecha/chevron
   decorativa del centro de la barra de arriba: el elemento
   `#statusBarArrow` (una `&#8964;` de 52×18 px, `position:fixed`
   en `top:0;left:50%`), su CSS y su único escucha en
   `initLauncher`. En la web esa flecha solo mostraba el aviso
   «La flecha solo funciona en el teléfono con Android.»
7. **Sin actualizaciones ni descarga de Windows en Ajustes.**
   Borradas de verdad (no ocultas): la tarjeta «Actualización» y
   la tarjeta «WordRed para Windows» (`#windowsCard`), la sección
   «Actualización», el diálogo `#updateOverlay`, el código
   (`checkAppUpdate`, `renderUpdateCard`, `openUpdateDialog`,
   `__wrInstallUpdate`, `maybeNotifyWindows1530`,
   `__wrDownloadWindows1530`, `__wrShareWindows1530`, las
   variables de versión de Windows y de actualización) y sus
   llamadas en el arranque y en la campana. En la web no hay APK
   que actualizar: al abrir la página ya tienes la última versión.
   La versión visible queda en «Acerca de»: «WordRed Web 1.1 ·
   contenido de Android 1.5.64».
8. **Sin opciones del teléfono (auditoría).** Se quitaron las
   opciones que en la web no hacen nada porque dependen del
   teléfono (marcado + código que las dibuja/llena, sin dejar
   referencias que den errores en consola):
   - **Bloqueo de la app con huella o PIN** (toggle en Ajustes):
     solo mostraba «El bloqueo solo funciona con la app instalada
     en el teléfono.» — un botón muerto por diseño. No había
     bloqueo real al arrancar en la web.
   - **Indicador de batería** (`#batteryInd` + todo el código de
     batería): en la web el nivel siempre era -1 (el puente no
     tiene `getBatteryStatus`) y el indicador quedaba escondido.
   - **Llamadas telefónicas** (`placePhoneCall`, `renderTelecomCall`,
     la pantalla de llamada del teléfono, el botón «Llamar» de los
     anuncios y el diálogo de elegir entre llamada de teléfono o de
     WordRed): en la web no se puede marcar un número desde el
     navegador; el botón del anuncio solo avisaba «Este teléfono no
     puede hacer llamadas desde WordRed.»
   - **Hoja de permisos del primer arranque** (notificaciones,
     archivos, cámara, micrófono, ubicación): en la web «Permitir»
     no pedía nada real y avanzaba sola tras 3 s. El tutorial sigue
     apareciendo al arrancar, por separado.
   - **Avisos de otras aplicaciones en la campana** («Otras
     aplicaciones y sistema»): llegaban por el oyente de
     notificaciones de Android, que en la web no existe; solo
     mostraba una tarjeta muerta para conceder el acceso. La
     campana ahora muestra solo los avisos del sistema guardados,
     bajo el título «Sistema», y solo si los hay.
   - **Subida en segundo plano con la pestaña cerrada:** no hay
     ninguna opción en la interfaz para eso (la llamada guardada
     ya se saltaba en la web); nada que quitar. Las subidas grandes
     siguen yendo como dataURL en memoria.
   - **Notificaciones push:** no existe código de push (FCM) en la
     web; solo hay avisos dentro de la app (la campana).
9. **Texto de apoyo.** La sección de apoyo dice ahora, como título:
   «¿Quieres apoyar a WordRed?» (antes: «Apoyar a WordRed» y un
   párrafo que hablaba de «la app»). El párrafo quedó solo con su
   primera frase verdadera: «WordRed es gratis y la hace una sola
   persona.» El botón y la cuenta para la transferencia quedan como
   estaban.
10. **Regla de Inicio y desplazamiento.**
    1) Al cargar la página, siempre arriba del Inicio (el navegador
       ya no restaura el desplazamiento de la visita anterior:
       `history.scrollRestoration = 'manual'` en web-inject.js, más
       `window.scrollTo(0, 0)` en el arranque).
    2) Dos toques rápidos seguidos en Inicio (menos de ~500 ms)
       van siempre arriba.
    3) Un solo toque en Inicio estando en otra sección (Shorts,
       Grupos, Perfil, etc.) vuelve al Inicio justo donde se quedó:
       la posición se guarda al salir del Inicio (la publicación
       superior visible) y se restaura al volver (con un segundo
       reintento a los 300 ms por si el layout se mueve); si nunca
       bajó, arriba. Un solo toque estando ya en Inicio no hace
       nada (no se pierde el sitio). El reintento a los 300 ms NO
       devuelve abajo a quien ya subió a mano en ese rato: si la
       publicación guardada ya no está cerca de arriba, no se mueve
       nada (antes, ese temporizador bajaba de nuevo la página
       aunque se acabara de subir).

## Qué cambió en la Web 1.2 (todo marcado «Web 1.2»)

1. **Barra de abajo simétrica.** Los 5 iconos (Inicio, Shorts,
   Mercado al centro, Grupos, Perfil) ahora miden exactamente lo
   mismo y quedan equidistantes y centrados, en móvil (360–430 px)
   y en escritorio. Causa real: los dos lados eran `flex:1` y
   Mercado medía por contenido (37 px contra 86 px a 390 px, con
   huecos entre centros de 86/62/62/86). Arreglo con flex de
   verdad: cada lado (2 botones) es `flex:2` y Mercado al centro
   es `flex:1`, así cada botón ocupa 1/5 de la barra. Medido en
   el DOM: a 390 px los 5 botones miden 76 px y los huecos son
   77/76/76/77 (±1 px por redondeo de subpíxeles), con la misma
   distancia del primer y último centro a su borde. El tamaño de
   la 1.1 se conserva (iconos 24 px, texto 9 px, padding 5 px).
2. **Eventos en el perfil, en el lugar del navegador.** El botón
   «Navegador» del perfil propio (`ownBrowserBtn1560`, que abría
   Google con `__wrOpenBrowserHome`) se quitó, y ahí van los
   Eventos: la sección se pinta con el perfil, tras la cabecera
   (título «Eventos», botón «＋ Crear un evento», lista y mensaje
   de vacío, con los mismos ids de antes, así `renderEvents()`
   funciona igual) y se llena al pintar el perfil. El botón
   «Crear» abre el diálogo con `onclick`
   (`__wrShowEventCreate`): el botón se recrea al pintar el
   perfil, así que el listener del arranque ya no existe. El
   navegador interno (`__wrOpenBrowser`) sigue para los enlaces
   y los tráileres. Los Eventos también se ven como invitado, en
   el perfil.
3. **Del Inicio sale solo la fila «Eventos» y «Páginas».** El
   apartado de accesos del Inicio (los chips «Eventos» y
   «Páginas») se quitó, con sus dos escuchas del arranque. El
   reloj, el clima y «+ Agregar apartado» se quedan en el Inicio
   como están, con toda la edición de apartados (mantener
   presionado, mover, tamaño, color, agregar). «Páginas» no se
   reubica: desaparece del Inicio con esa fila, pero la vista de
   Páginas (`view-pages` + `renderPages`) sigue existiendo sin
   entrada desde el Inicio — se puede volver a poner el acceso
   cuando se quiera, sin reconstruir nada.
4. **Sin buscador del Inicio.** La barra de búsqueda translúcida
   del Inicio (`#homeSearchWrap1562`: barra, input, sugerencias
   en vivo) se quitó por completo, con su CSS y su código
   (`renderHomeSearch1562`, `homeSearchSuggest1562`,
   `homeSearchClose1562`, `__wrHomeSearchGo1562`,
   `__wrHomeSearchClear1562`, `kdSearchDramas1562`, `foldSearch`
   y, en `core.js`, `foldSearchText1562` y
   `searchAllFolded1562`). La lupa de la barra de arriba
   (`#hdrSearch`) SE QUEDA, y la búsqueda sigue en la vista
   «Buscar» (`renderSearch` + `searchAll`), que busca personas,
   publicaciones, grupos y #etiquetas.
5. **Tutorial y FAQ.** El paso «Tu inicio» del tutorial ya no
   menciona el buscador, y el paso «Tu perfil» dice que los
   eventos están en el perfil. La FAQ tiene una entrada nueva
   («¿Qué hay de nuevo en la Web 1.2?») y la de buscar ahora
   apunta a la lupa de arriba («¿Cómo busco algo?»); quedó en 28
   entradas. La versión visible queda en «Acerca de»: «WordRed
   Web 1.2 · contenido de Android 1.5.64».

## Qué se conservó y por qué (sí funciona en la web)

- **Llamadas dentro de WordRed** (botón de llamada en el chat,
  `startCall`/`acceptCall`/`endCall`, la ventana de llamada, los
  sonidos): usan WebRTC de verdad (`getUserMedia` +
  RTCPeerConnection + el servidor como señalización), no el
  teléfono. Funcionan en el navegador.
- **Preferencias de notificaciones en Ajustes** (`renderNotifPrefs`):
  son interruptores de la campana interna (qué avisos aparecen en
  la campana), no push; funcionan en la web, incluido el de
  llamadas (las llamadas WebRTC funcionan).
- **Apartados agregables del inicio** (calendario, mensajería,
  fotos, calculadora, notas, tiempo): todos funcionan en el
  navegador (calendario y calculadora son JavaScript, mensajería
  son los chats de WordRed, fotos son las fotos publicadas, notas
  son `localStorage`, tiempo cuenta el tiempo con la página
  abierta).
- **Centro de noticias:** sigue existiendo; su botón del cajón se
  quitó, así que ahora se abre tocando la fila de noticias del
  feed (después del 7º post).
- **Fantore Resurrección:** sigue en el cartel de juegos (su botón
  «Jugar» descarga el APK real del servidor; en la web no se
  puede instalar una app Android).
- **Botón «Mensaje» de los anuncios:** abre la elección de
  WhatsApp/SMS; WhatsApp es un enlace wa.me y SMS un enlace
  `sms:`, ambos funcionan en el navegador.
- **Ubicación del clima:** el icono «mi ubicación» usa
  `navigator.geolocation` en la web (cuando no hay puente
  Android), así que funciona.
- **Tutorial y FAQ:** el tutorial (6 pasos) menciona las barras
  que se ocultan solas y Mercado en el centro, y que los eventos
  están en el perfil; la FAQ quedó en 28 entradas (27 de la 1.1
  + 1 nueva: «¿Qué hay de nuevo en la Web 1.2?»).

## Qué se adaptó en la Web 1.0 (sigue vigente)

1. Versión «Web 1.0» en todas partes (el contenido sigue siendo el de
   Android 1.5.64); la 1.1 la cambia a «Web 1.1».
2. Sin sistema de actualizaciones: `checkAppUpdate` anulada (en la web
   no hay APK: al abrir la página ya tienes la última versión), aviso
   de Windows anulado, tarjetas «Buscar actualización» y «WordRed
   para Windows» ocultas siempre en Ajustes. **En la 1.1 se borraron
   de verdad (ver punto 7 de arriba).**
3. Cajón de aplicaciones sin apps del teléfono y sin demos falsas:
   la lista queda vacía y el cajón solo muestra la entrada fija de
   Fantore Resurrección (real) y el botón de noticias. Sin la
   entrada «Batería» en «+ Agregar apartado». «Tu tiempo hoy» dice
   que cuenta el tiempo con la página abierta en el navegador.
   **En la 1.1 el cajón se quitó entero (ver punto 2 de arriba).**
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
   noticias (vía rss2json), búsqueda, ajustes, tutorial y FAQ (28
   en la 1.2), llamadas y lives (WebRTC + `getUserMedia`),
   geolocalización del clima (`navigator.geolocation`), exportar
   chats (descarga JSON), juegos (visor web interno). La 1.2 quita
   el buscador del Inicio (la búsqueda sigue con la lupa de arriba)
   y muda los Eventos al perfil.

## Qué NO funciona igual en la web (quitado limpio, sin botones muertos)

- Lanzador de apps del teléfono: quitado entero en la 1.1 (no hay
  cajón, ni botón «Aplicaciones», ni «Enviar APK» — eso era de la
  1.5.65, que no está construida).
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
- El desplazamiento al volver al Inicio depende del navegador: la
  restauración usa la publicación superior visible guardada y un
  segundo intento a los 300 ms; si el feed cambia de altura (por
  ejemplo, al cargar imágenes), la posición puede quedar a unas
  publicaciones de distancia.

## Servidor 4.9 — EN VIVO

El servidor 4.9 está en vivo desde la publicación de la Web 1.0:
`/api/health` responde 4.9 y el preflight CORS ya devuelve
`Access-Control-Allow-Methods` (GET, POST, PUT, DELETE, OPTIONS),
así que editar y borrar publicaciones, grupos, anuncios y cuenta
funcionan desde la web. La Web 1.1 no cambia el servidor (sigue 4.9).
Tampoco la 1.2.

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
4. En Google Cloud Console, en el cliente web de WordRed
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

- `node tests/test-web.js`: **268 PASS, 0 FAIL** (archivos, diffs
  «Web 1.3» contra Android 1.5.64, sintaxis, sin referencias a lo
  quitado en la 1.1 ni en la 1.2, barras que se ocultan, Mercado en
  el centro, Inicio en rojo, barra simétrica, Eventos en el perfil
  abajo de «¿Qué estás pensando?», sin buscador del Inicio, regla
  de Inicio y desplazamiento, FAQ 29,
  servidor 4.9 en vivo).
- `tests/test-web-dom.js` (Electron + xvfb, con servidor HTTP
  local): **24 PASS, 0 FAIL** (arranque, versión Web 1.3, pantalla
  de inicio, tarjetas de actualización y Windows NO EXISTEN, barra
  sin Aplicaciones ni cajón con Mercado en el centro e Inicio en
  rojo y más pequeña, barra simétrica medida en el DOM a 430, 360
  y 1280 px, Inicio sin buscador ni Eventos/Páginas con reloj,
  clima y agregar, Eventos en el perfil ABAJO de «¿Qué estás
  pensando?» (orden real del DOM) con creación real de un
  evento, puente mínimo, feed en vivo, 48 dramas en vivo, sonda
  PUT permitida con la 4.9 en vivo, botón de Google sin
  errores, inicio de sesión real por teléfono con cuenta NUEVA en
  cada run, feed dibujado, barras que se ocultan al bajar y vuelven
  al subir, regla de Inicio y desplazamiento —doble toque a arriba,
  un toque restaura la posición, cargar arriba—, drama
  reproduciéndose y sin errores de consola). La cuenta de prueba se borra del servidor al final
  de cada run (desde el proceso principal, con DELETE directo). La
  prueba usa un teléfono nuevo en cada run porque el servidor solo
  deja pedir 3 códigos por hora y por número: con un número fijo la
  prueba se agota al tercer run (eso pasó una vez: 429).
