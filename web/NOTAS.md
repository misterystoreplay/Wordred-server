# WordRed Web 1.6 — NOTAS

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

La Web 1.4 arregla el botón «Saltar anuncio» de los dramas: con el
video de YouTube, la barra de información del drama (título del
capítulo + «Ver otros capítulos») ya no tapa la esquina inferior
derecha del reproductor — va en flujo debajo de él, y el botón de
YouTube queda libre y se puede presionar. Los anuncios los pone
YouTube y no se pueden quitar ni saltar por código. Todo lo demás
de la 1.3 queda igual.

## Qué hay aquí

- `index.html`, `app.js`, `core.js`, `games.js`, `ytplayer.html`,
  `qrcode.js`, `jsqr.js`, `logo.png`, `musica/`, `dramas/`, `ejemplo/`,
  `fantore/`, `ps-games/`, `store-logos/`, `stickers/`: copias de los
  assets de Android 1.5.64.
- `games.js`, `ytplayer.html`, `qrcode.js`, `jsqr.js`: byte-idénticos
  a los de Android 1.5.64.
- `app.js`, `index.html`: copias ADAPTADAS con cambios documentados,
  cada uno marcado «Web 1.4» (la 1.3 marcó los suyos «Web 1.3», la
  1.2 los suyos «Web 1.2», la 1.1 los suyos «Web 1.1» y la 1.0 los
  suyos «Web 1.0»). En la 1.4 el diff contra Android es:
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

## Qué cambió en la Web 1.4 (todo marcado «Web 1.4»)

1. **El botón «Saltar anuncio» de los dramas ya se puede presionar.**
   Causa real, medida en el DOM: YouTube pone «Saltar anuncio»
   abajo a la derecha del reproductor (encima de su barra de
   controles, ~55–100 px sobre el borde inferior del iframe), y
   la barra de información propia del visor (`.kdInfo1549`:
   título del capítulo + botón «Ver otros capítulos», z-index 3
   sobre el iframe z-index 1) cubría exactamente esos ~107 px
   inferiores del escenario. El botón se veía atenuado a través
   del degradado, pero los toques caían sobre `kdEpTitle1549` /
   `kdChaptersBtn1549` y nunca llegaban al iframe. Medido antes
   del arreglo a 390 px: el iframe mide 375×816 y la barra cubre
   de y=709 a y=816; la zona de saltar (200×110 abajo a la
   derecha) quedaba cubierta al 100%.
2. **El arreglo, de verdad:** con el video de YouTube, la barra
   de información deja de ser un overlay y va en flujo debajo del
   reproductor: al cargar el video, `kdYtLoad1558` pone la clase
   `kdYtOn1558` en el escenario (`#kdStage1549`) y el CSS
   (`#kdramaOverlay1549 .kdStage1549.kdYtOn1558 .kdInfo1549`)
   la deja en `position:static;flex:none`, así el reproductor
   (`flex:1`) se encoge y el iframe termina exactamente donde
   empieza la barra. La esquina inferior derecha del reproductor
   queda libre y el botón de YouTube se puede presionar. Al parar
   el video, `kdYtStop1558` quita la clase y la barra vuelve a
   tapar el reproductor como antes (capítulos de imagen, de
   miembros y videos originales con el reproductor propio, cuya
   barra ya estaba a 112 px para no taparse con la información).
   La guía de gestos, la barra de arriba y los gestos no cambian.
3. **Los anuncios no se pueden quitar.** Los pone YouTube, no
   WordRed: los dramas se reproducen desde los canales oficiales
   de ReelShort/ShortMax y no hay API de YouTube para saltar
   anuncios ni para quitarlos; tampoco se intentó ningún truco
   para bloquearlos. Lo que se arregla es que el botón de saltar
   quede donde se pueda presionar.
4. **Tutorial y FAQ.** El tutorial no cambia (no hay gesto ni
   flujo nuevo). La FAQ tiene una entrada nueva («¿Qué hay de
   nuevo en la Web 1.4?») y quedó en 30 entradas. La versión
   visible queda en «Acerca de»: «WordRed Web 1.4 · contenido
   de Android 1.5.64».

## Qué cambió en la Web 1.5 (todo marcado «Web 1.5», sufijo 1550)

70 novedades en una versión, todas confirmadas por el dueño en
lotes («Todas»). El conteo: el primer encargo traía 3, y cada lote
añadió 6 más hasta 68; el dueño confirmó además 3 que se habían
quedado fuera de la cuenta (instalar como app, audio en segundo
plano y subidas en segundo plano), así que el total real era 71.
El 2026-11-20 ~14:57 el dueño quitó los mini-juegos (trivia en
grupos): el total queda en 70.
Excluido: «Ver quién visitó tu perfil» — ya existe en el perfil
(botón «Quienes vieron tu perfil»).

**Cómo está hecho.** Casi todo el trabajo nuevo vive en un solo
bloque al final de `app.js` (funciones con sufijo `1550`, antes de
`boot1544()`), más ediciones quirúrgicas en los puntos que ya
existían (tarjeta de publicación, comentarios, chat, historias,
grupos, compositor, visor de dramas, Ajustes). El servidor pasa de
4.9 a **5.0** (nuevos conjuntos de datos, endpoints y un barrido
cada 30 s). `core.js` NO se toca. Lo que ya existía en la base
1.5.64 no se reconstruyó: se verificó y se conectó (voz en chat,
lives, encuestas, comentarios con foto, insignia, sugerencias,
vistas, fijar, cumpleaños, menciones en comentarios, fondos de
perfil, historias con música, bloquear/reportar, encuestas y
reacciones en historias, respuestas en comentarios, notas de
perfil, canciones en el compositor, grupos privados, estadísticas
de historias, ahorro de datos, texto grande y QR ya estaban;
lo que faltaba era el extremo del servidor, el botón visible o
la conexión con la pantalla).

1. **Notificaciones push reales (con la pestaña cerrada).**
   `sw.js` en la raíz de `web/` (alcance `./`), clave VAPID
   generada con `web-push` (en `package.json` del servidor, Render
   lo instala al desplegar). La clave PÚBLICA vive en el código
   web; la PRIVADA solo en la variable de entorno de Render
   (`VAPID_PRIVATE_KEY`) — no está en ningún archivo del repo ni
   en estas notas. Las suscripciones se guardan por teléfono en
   MongoDB (`pushSubs`); el servidor empuja al comentar, al dar
   Me gusta, al mencionar, al seguir un drama con capítulo nuevo
   y 1 h antes de un evento confirmado. En Ajustes hay un
   interruptor real (con explicación antes de pedir el permiso).
   Sin claves en el entorno, el servidor arranca igual con push
   desactivado en silencio.
2. **Guardados.** «Guardar» en publicaciones y en dramas (serie);
   la lista «Guardados» vive en el perfil, a un toque, con quitar.
   Por navegador (`localStorage` `wordred_saved_v1`, solo lo tuyo,
   sobrevive a recargar) — se dice en la FAQ.
3. **Diseño ancho (≥1024 px).** `wide15.css` (todo dentro de
   `@media (min-width:1024px)`) + `web15-wide.js`: la columna
   central crece (hasta 880 px a 1280, 1000 px a 1600) y dos
   barras fijas con datos reales — sugerencias de amigos
   (`friendSuggestions`, con Seguir) y Guardados (contador real)
   + Dramas destacados (del servidor, caché ≤1 min). En el
   teléfono (≤430 px) no cambia nada: verificado por geometría
   DOM a 390 px.
4. **Compartir por WhatsApp.** En publicaciones, historias y
   dramas: `wa.me` con título + enlace profundo
   (`?post=`, `?drama=`, `?perfil=`), que la app abre al cargar.
   Límite honesto: Pages sirve un solo `index.html`, así que
   WhatsApp puede no dibujar la vista previa rica por publicación;
   el texto y el enlace funcionan igual.
5. **Seguir dramas.** Servidor (`dramaFollows`): al entrar un
   capítulo nuevo en el catálogo, los seguidores reciben el aviso
   (push + campana). La primera lectura registra el catálogo en
   silencio, sin avisar de todo lo que ya había.
6. **Buscar y filtrar dramas.** En la sección Dramas: buscar por
   nombre y filtrar por app (Todas/ReelShort/ShortMax/DramaBox),
   en vivo al teclear, con estado vacío. La barra se pinta una
   vez y solo las tarjetas se vuelven a dibujar (si no, el input
   perdería el foco en cada tecla).
7. **Estadísticas del dueño (solo dueño).** Visitas a la web y
   dramas más vistos (`webStats`), con endpoints y sondeo previo:
   la pantalla solo aparece si el servidor responde 200; a los
   demás no se les muestra nada. También solo para el dueño:
   solicitudes de verificación y reportes de la comunidad.
8. **Reels a pantalla completa con deslizamiento.** El visor de
   Shorts ya era a pantalla completa (100dvh) con deslizamiento
   táctil, flechas y botones; se verificó que los gestos no
   pelean con las barras ni con la barra de abajo.
9. **Notas de voz en chats y en publicaciones.** `MediaRecorder`
   → ruta real de medios → reproducción en línea con duración.
   Sin permiso de micrófono, mensaje claro.
10. **Instalar como app (PWA).** `manifest.json` + el mismo
    `sw.js` (un solo worker: push + instalación + Sync). Icono
    192 del logo existente; abre a pantalla completa sin la barra
    del navegador. Alcance: solo la carpeta `web/`.
11. **Audio en segundo plano.** Media Session API (controles en
    la pantalla de bloqueo: reproducir/pausar, título, anterior/
    siguiente entre Shorts). Límite: el navegador puede suspender
    pestañas en segundo plano; el audio suena mientras la pestaña
    siga viva.
12. **Subidas en segundo plano.** Service worker + Background
    Sync (`wordred-upload-sync`) donde el navegador lo permite
    (Chrome Android; Safari/Firefox no) + reanudar al reabrir.
    El servidor ya sabía reanudar (`/api/media/status`); nunca
    se reinicia desde cero.
13. **Transmisiones en vivo.** ws + WebRTC en malla (ya existía
    en la base). Límite: malla entre pocos; sin escala de
    TikTok-Live; solo mientras el transmisor sigue conectado;
    nunca se finge un vivo con un video grabado.
14. **Traducción de publicaciones y comentarios.** «Ver
    traducción» con el endpoint gratuito de Google (gtx,
    verificado desde esta VM; MyMemory se agotó ese día y quedó
    solo como respaldo), con caché local. Nunca reemplaza el
    original; se puede ocultar. Puede fallar por límite del
    servicio gratuito.
15. **Encuestas en publicaciones (2–4 opciones) y en historias
    (2 opciones).** Voto único por cuenta, resultados en vivo con
    porcentajes, en el servidor. En historias, el dueño ve quién
    votó qué.
16. **Comentarios con foto.** Por la ruta real de medios;
    miniatura en el comentario, toque para verla grande.
17. **Insignia verificada (solo la otorga el dueño).** CAMBIO DE
    CONDUCTA DELIBERADO: pedirla ya NO concede sola al cumplir
    los criterios — queda `pending` y solo el dueño la concede o
    la quita (endpoints con `requireOwner`). La pantalla explica
    el flujo nuevo.
18. **Sugerencias de amigos.** «Gente que quizá conozcas» con
    amigos de amigos y conteo de mutuos; solo cuentas reales,
    con botón Seguir. También en la barra lateral ancha.
19. **Reacciones con emoji en publicaciones y comentarios.**
    Seis emojis (❤️ 😂 😮 😢 😡 👍), una por persona, cambiable,
    con conteos por emoji y «quién reaccionó» (visible para quien
    puede ver la publicación). En publicaciones usa el endpoint
    de Me gusta existente (reacciones con nombre, guardadas en el
    servidor); el endpoint nuevo `/api/posts/:id/react` quedó
    disponible para clientes API y cubierto por pruebas.
20. **Llamadas de video y de voz en grupo.** Malla WebRTC: una
    conexión por participante, señalización por el mismo
    `/api/call-signal` (el `payload` lleva `groupId` y viaja
    opaco). Hasta 6 participantes; invitación con «Unirse» o
    rechazo. Límite: malla, no escala a grupos grandes.
21. **Vistas de publicaciones.** Solo cuando la publicación se
    ve de verdad en pantalla (IntersectionObserver ≥50%), en el
    servidor, sin contar las propias, una vez por navegador. El
    autor las ve en sus publicaciones.
22. **Fijar publicaciones (máx. 3, en el perfil) y fijar
    comentarios (el autor, uno por publicación, arriba del todo).**
23. **Recordatorios de cumpleaños.** Solo de amigos que
    compartieron su fecha; el año solo se muestra si el amigo lo
    permite; nunca se inventa un cumpleaños. Con «🎂 Felicitar»,
    que abre el chat con el mensaje listo.
24. **Menciones con @.** Autocompletado desde la lista de
    amigos en el compositor; el mencionado recibe aviso en la
    campana; tocar la mención abre su perfil. El servidor valida
    (solo amigos, máx. 10). Cambiar el nombre no rompe las
    menciones viejas: se resuelven por teléfono.
25. **Archivar publicaciones e historias.** Archivadas: ocultas
    del feed y del perfil, no borradas; «Archivados» en el perfil
    para restaurar o borrar de verdad. Las historias caducadas
    van al «Archivo de historias» privado (máx. 100, solo tú).
26. **Fondos de perfil.** Los que ya tenía la app (degradados,
    portada, acento); visibles para quien visita el perfil.
27. **Historias con música.** Las 12 canciones reales de Kevin
    MacLeod del catálogo; suenan mientras se ve la historia.
28. **Descargar tus publicaciones.** Solo las tuyas: foto/video
    (el archivo) o texto (`.txt`).
29. **Bloquear y reportar.** Bloquear: sus publicaciones y
    comentarios desaparecen para ti y no puede escribirte.
    Reportar: a un post o a una persona, con motivo; el dueño ve
    la lista con nombres. Nada se banea solo sin revisión del
    dueño.
30. **Mensajes que se autodestruyen.** Por mensaje: 1 minuto,
    1 hora o 1 día (botón ⏱ junto a Enviar; se muestra lo que
    queda). El servidor los poda de verdad al leer; también
    existe el ajuste por conversación de antes. No evita
    capturas de pantalla.
31. **Subtítulos automáticos.** El botón CC muestra las pistas
    reales de subtítulos cuando el video las trae (dramas
    originales); en videos de los demás sin pistas no hay
    subtítulos que inventar. La precisión depende del audio y
    del idioma; no es un servicio de pago.
32. **Estado en línea.** Punto verde por presencia ws (solo si
    el otro está conectado Y no ocultó su estado). Cada quien
    puede ocultar el suyo en Ajustes.
33. **Compartir pantalla en videollamadas.** Ya existía en la
    base 1.5.64 (`getDisplayMedia`, botón en la llamada); se
    verificó. Funciona donde el navegador lo permite (escritorio,
    Chrome Android).
34. **Filtros de foto antes de publicar.** Sepia, blanco y negro,
    brillo, contraste, cálido, frío — aplicados de verdad con
    canvas ANTES de publicar, así la foto publicada ya lleva el
    filtro. Solo fotos.
35. **Texto grande y modo lectura.** Ajuste de tamaño en Ajustes
    (ya existía) + modo lectura por publicación larga (fuente
    grande, sin acciones ni distracciones).
36. **Eventos en grupos + recordatorios.** Crear eventos dentro
    de un grupo (solo miembros), confirmar asistencia; el
    servidor avisa 1 h antes (barrido cada 30 s, push donde se
    pueda, campana si no).
37. **Silenciar sin bloquear.** Sus publicaciones y comentarios
    dejan de aparecer en tu feed; sigues siguiéndolo; no se
    entera. Se puede quitar el silencio cuando quieras.
38. **QR de tu perfil.** Reusa `qrcode.js`; desde tu perfil, con
    descarga.
39. **Historial de Me gusta.** «Me gusta» en tu perfil, con
    quitar el Me gusta desde ahí.
40. **Respuestas en comentarios.** Hilos con `parentId`, con
    contador de respuestas.
41. **Notas de perfil.** Nota corta bajo tu nombre (máx. 60
    caracteres, en el servidor), editable y removible, visible
    para visitantes.
42. **Retomar videos.** Guarda dónde dejaste un video largo
    (≥60 s) y ofrece «Retomar desde M:SS». Por navegador
    (`localStorage` `wordred_resume_v1`), no por cuenta.
43. **Buscar y fijar chats.** Buscar por texto o por nombre en
    la vista Mensajes; fijar chats arriba de la lista (1 a 1 y
    grupos), con quitar fijado.
44. **Ahorro de datos.** Interruptor en Ajustes que de verdad
    cambia la carga: sin autoplay de videos y sin cargar las
    portadas pesadas (ya existía en la base).
45. **Cambiar tu nombre.** Desde Ajustes, con comprobación de
    unicidad en el servidor (409 si otro lo tiene, sin importar
    mayúsculas). El inicio sigue por teléfono; no se rompe.
46. **Stickers propios.** De una foto tuya: recorte circular en
    canvas, subida por la ruta real de medios y guardado en tu
    paquete (máx. 24). Se envían en chats como `stickerCustom`
    (nuevo campo en el servidor, solo URL http(s) ya subida;
    `data:` rechazado).
47. **Compartir canciones en publicaciones.** Las 12 canciones
    reales del catálogo (selector del compositor, ya existía);
    se reproducen en línea en el feed.
48. **Ver quién reaccionó.** Lista de nombres por emoji, visible
    para quien puede ver la publicación.
49. **Foto con doble cámara.** Frontal + trasera a la vez
    (picture-in-picture) donde el navegador permite abrir dos
    cámaras; si solo deja una, aviso honesto y foto normal.
50. **Editar comentarios.** Solo los tuyos, con marca «editado»
    y fecha, en el servidor.
51. **Borrar mensajes para todos.** El mensaje queda como
    «Mensaje eliminado» en su lugar, para los dos lados
    (lápida en el servidor, no borrado silencioso).
52. **Copiar enlace de una publicación.** URL directa
    (`?post=<id>`) que abre esa publicación exacta en la web.
53. **No molestar.** 1 hora / 8 horas / hasta mañana; mientras
    está activo no se crea ni aviso en la app ni push (el
    servidor lo respeta en `notify()`), con indicador visible
    arriba a la derecha.
54. **Programar historias.** Fecha y hora en los dos creadores;
    el servidor las publica a su hora (barrido cada 30 s) y viven
    24 h desde entonces. Si el envío falla, queda pendiente y se
    reintenta; no se muestra como historia viva antes de tiempo.
55. **Grupos privados.** El interruptor «secreto» ya existía:
    no aparece en búsquedas, solo se entra por invitación.
56. **Reacciones rápidas en historias.** Emoji rápido; el dueño
    ve quién reaccionó con qué (ya existía en el servidor).
57. **Negocio en tu perfil.** Nombre, qué vendes y botón de
    WhatsApp (número validado, 8–15 dígitos). El Marketplace
    queda como está.
58. **Estadísticas de tus historias.** Quién la vio y cuántas
    vistas por historia, solo para el dueño de la historia (el
    botón dice ahora «Estadísticas · quién la vio»).
59. **Escuchar juntos y ver juntos.** En un grupo, por ws: cada
    teléfono reproduce su propia copia (canción del catálogo real
    o drama de YouTube); reproducir/pausar (y posición, en
    dramas) se sincronizan lo mejor posible, no muestra a muestra.
60. **Exportar tus datos.** JSON descargable desde Ajustes: solo
    tus datos (perfil, publicaciones, historias, mensajes, chats
    de grupo donde estás, amigos, grupos, eventos, avisos), con
    tope.
61. **Tutorial y FAQ.** Tutorial actualizado en su lugar (6
    pasos). La FAQ tiene una entrada nueva («¿Qué hay de nuevo
    en la Web 1.5?», con las 70) y quedó en 31 entradas. La
    versión visible queda en «Acerca de»: «WordRed Web 1.5 ·
    contenido de Android 1.5.64». La entrada vieja de avisos se
    corrigió (el push ya existe; antes decía que en la web no
    había avisos fuera de la página).
62. **Servidor 5.0.** Nuevos conjuntos (`pushSubs`,
    `dramaFollows`, `webStats`, `verifyRequests`, `storyArchive`,
    `eventReminders`, `dnd`), endpoints nuevos
    (push, seguir dramas, estadísticas, verificar, reacciones,
    archivar, reportes del dueño, presencia, No molestar,
    archivo de historias, exportar), barrido cada 30 s
    (recordatorios de eventos, publicar historias programadas,
    archivar caducadas), y `notify()` con push + respeto a No
    molestar. La salud dice 5.0 (con campo `push`).

**Limpieza (no es novedad, no va en la FAQ).** Al cargar, la Web
1.5 quita de la copia local de Eventos cualquier evento llamado
«Prueba Web 1.3» o que empiece por «Prueba Web 1.» (los dejaron
las pruebas de la web; la Web 1.3 dejó uno en el teléfono del
dueño porque la web solo sumaba eventos del servidor y nunca
quitaba ninguno). Si uno vuelve a aparecer en el servidor, se
cancela ahí (`POST /api/events/:id/cancel`, solo su creador
puede). Ningún otro evento se toca jamás.

**Mercado más ancho + filtros compactos (no es novedad, no va en
la FAQ).** Los anuncios del Mercado ahora ocupan casi todo el ancho
de la pantalla: la sección recupera 8 px por lado del relleno de
`main` y en el teléfono hay una sola columna (antes siempre 2, con
tarjetas de ~178 px a 390 px); en escritorio, 2 columnas dentro del
diseño ancho. Medido en el DOM antes del cambio: tarjeta ~178 px a
390 px, ~163 px a 360 px; pila de filtros (de la búsqueda al
primer anuncio) 551 px a 390 px, 592 px a 360 px, 413 px a 1280 px.
Después del cambio: tarjeta 407 px a 430 px (1 columna), 2
columnas en escritorio sin desborde; la pila, con los filtros
plegados detrás del botón «Filtros», medía 195 px a 430 px, así
que en una segunda vuelta se apretaron los márgenes y rellenos de
las dos filas de pestañas, la búsqueda y los selectores y quedó en
≤170 px a 430 px (comprobado en el DOM, W37) (nada se quitó: los 7
controles — búsqueda, categorías, precio mín./máx., orden, entrega
y negociable — siguen ahí y el filtro de precio mínimo filtra de
verdad). Ninguna información del anuncio se quitó ni se ocultó.

**Flujo de entrada (no es novedad, no va en la FAQ).** Sin
cuenta/sesión, al abrir la web van primero las opciones de cuenta
(teléfono, Google o correo, con el botón «Explorar como
invitado» bien visible; con cuentas guardadas, la lista para
elegir otra) — antes del feed. Con la sesión abierta se va
directo a Inicio, sin pantallas de autenticación ni parpadeo (la
vista de autenticación nace oculta). Y un enlace compartido
(`?post=`, `?drama=`, `?perfil=`) tiene prioridad sobre las
opciones de cuenta: sin sesión y sin cuentas guardadas se entra
como invitado y se abre esa publicación (o drama/perfil)
directamente, con las opciones de cuenta disponibles en el aviso
de invitado; con cuentas guardadas van primero las opciones y el
enlace se abre al elegir cuenta; y después de verificar el número
o de crear la cuenta desde un enlace, se sigue cayendo en esa
publicación, no en el inicio genérico. Antes de este cambio el
enlace solo se leía con sesión abierta: sin sesión se perdía al
mostrar la pantalla de cuentas y nunca se abría la publicación.
Implementado con `parseDeepLink1550` / `openDeepLink1550` /
`openPendingDeepLink1550` (el enlace se guarda al arrancar en
`boot1544` y se abre al entrar por cada camino: invitado,
verificación, creación de cuenta y cambio de cuenta). Causa real
encontrada al probar: un invitado nuevo nunca sincroniza el inicio
(sin sesión no hay WebSocket ni pull del servidor: `connectServer`
y el intervalo de 60 s exigen `state.me`), así que la publicación
compartida no estaba en su copia local y el enlace se perdía. Por
eso `fetchDeepLinkPost1550` la busca por id en el servidor
(`GET /api/posts/:id`, nuevo en el servidor 5.0, público como el
inicio, con la misma visibilidad y 404 para archivadas o no
visibles) y la guarda en la copia local antes de abrirla; si el
servidor es anterior a 5.0, busca en el inicio (`GET /api/feed`,
100 recientes). Límite honesto: si la publicación se borró, se
archivó o no es visible para invitados, el enlace cae en el inicio
sin errores.

**Cierre de sesión + ventana de inicio rediseñada (no es novedad,
no va en la FAQ).** Al confirmar «Cerrar sesión» sale una burbuja
con la W grande traslúcida (el logo de WordRed a opacidad .55) y
el mensaje «Cerrando cuenta» centrado, sobre fondo traslúcido; a
los ~1,4 s se cierra y aparecen las cuentas disponibles para
elegir otra (si no hay cuentas guardadas, la ventana de inicio).
El cierre es de verdad: además de `C.logout` (que pone `me` en
null), se borra el token del servidor (`serverToken = ''`) antes
de guardar, así que no queda sesión en el servidor; al volver a
una cuenta se restaura su token guardado. La ventana de inicio
de sesión tiene ahora fondo traslúcido (`rgba(10,2,3,.45)` con
desenfoque, se ve el degradado rojo de la app detrás), una W
gigante traslúcida de marca de agua (340 px, opacidad .10) y la
tarjeta es un cristal oscuro traslúcido como las ventanas
flotantes de la app. Todas las opciones de entrada siguen
exactamente igual (teléfono, Google, correo, invitado). Las
reglas del flujo de entrada no cambian: sin sesión van primero
las opciones de cuenta; con sesión, directo a Inicio; los enlaces
compartidos siguen cayendo en la publicación exacta. Comprobado
en el DOM (W39): burbuja visible con la W y el mensaje, sesión
cerrada (sin cuenta ni token), cuentas disponibles después,
volver a entrar desde la lista, ventana rediseñada a 360 px sin
desborde y entrar de verdad desde ella por teléfono.

## Qué cambió en la Web 1.6 (todo marcado «Web 1.6»)

Seis cambios de aspecto, ninguno es una función nueva: la FAQ
solo crece con su entrada de versión («¿Qué hay de nuevo en la
Web 1.6?», FAQ 32) y el tutorial no cambia.

1. **La sección Dramas del Inicio ya no existe.** El widget
   `#homeKdrama1549` (encabezado «Dramas», búsqueda y filtros por
   app, tarjetas) se quitó del Inicio junto con todo su código
   (`renderKdramaHome1549`, `kdRenderTiles1550`,
   `kdFilteredCatalog1550`, la insignia de la sección y
   `kdSearch1550`/`__wrKdFilter1550`). El trabajo anterior de la
   1.6 que dejó las tarjetas como los Reels (solo portada) queda
   sustituido por esto: ya no hay tarjetas en el Inicio. Los
   dramas ahora salen mezclados AL AZAR entre los Shorts (la vista
   a pantalla completa del botón Shorts de la barra de abajo): cada
   inserción cae tras un número aleatorio de Shorts (4–9) y la serie
   también es aleatoria, sin repetir nunca la misma serie dos veces
   seguidas (`kdShortGap1562` / `kdDramaPick1562`). Con muro corto
   (menos de 4 Shorts) sale al menos un drama en una posición al
   azar, porque sin la sección los Shorts son la única forma de
   encontrarlos. La tarjeta entre
   los Shorts y el visor/reproductor no se tocan: al tocar una se
   abre el drama en su primer capítulo, con la guía de gestos;
   Seguir y Guardados siguen existiendo (en el visor y en el
   perfil). La búsqueda y los filtros de dramas se van CON la
   sección: vivían solo ahí y no se reconstruyen en otro lado. El
   catálogo se sigue descargando (`fetchKdramas1554`) porque lo usan
   el intercalado y el visor. Comprobado en el DOM (W45): en el
   Inicio no hay sección Dramas; en los Shorts hay tarjetas de drama
   mezcladas; al tocar una se abre el drama; y el botón de cambiar
   de cuenta sigue funcionando.
2. **Fila de arriba simétrica.** Todas las tarjetas de la fila
   (el primer tile con la foto propia y el `+`, y los Reels) miden
   lo mismo: 213 px de alto (rectángulo 140×190 + nombre de 19 px).
   Causa real, medida en el DOM con sesión a 390 px: cuando un Reel
   no tenía portada guardada, `requestReelCovers()` borraba TODOS
   los hijos de la tarjeta (rectángulo + nombre) y dejaba la imagen
   del fotograma suelta dentro de la tarjeta: la imagen quedaba de
   ~150×267 px y la fila (flex, `align-items:stretch`) estiraba
   TODAS las tarjetas a 267 px, así que los Reels se veían más
   largos que el primer tile (213 px). Antes de la captura las dos
   medían 213 px; después de la captura, las dos medían 267 px
   (la primera con 54 px de hueco vacío debajo del nombre). Ahora
   la portada capturada va DENTRO del rectángulo (con su CSS
   `100%` + `cover`) y el nombre se queda; en la fila de reels del
   feed no cambiaba nada porque su CSS ya cubre cualquier `img`
   dentro. Comprobado en el DOM (W41): a 390 y 360 px, tras
   completarse la captura de portadas, todas las tarjetas miden
   213 px (diferencia ≤ 2 px), todas conservan rectángulo y nombre,
   y ninguna tiene una `img` suelta fuera del rectángulo.
3. **Cerrar sesión es un botón de solo símbolo en Ajustes.** El
   botón rojo de texto a lo ancho del final de Ajustes ya no existe;
   en su lugar hay un botón redondo de solo símbolo junto al «?» de
   la cabecera de Ajustes (mismo estilo redondo 40×40, icono de
   puerta con flecha de salida, añadido al juego de iconos propio
   como `logout`), con `title` y `aria-label` «Cerrar sesión». El
   flujo es exactamente el mismo: confirmación → burbuja «Cerrando
   cuenta» → cuentas disponibles. El `id="logoutBtn"` se movió al
   botón nuevo, así que el manejador de siempre sigue atado sin
   tocar JavaScript. Comprobado en el DOM (W42): a 390 y 360 px el
   botón está junto al «?», no hay botón de texto a lo ancho, y al
   tocar el símbolo sale la confirmación, la burbuja y las cuentas
   (W39 sigue pasando igual).
4. **Ajustes rediseñados.** Mismo lenguaje de diseño de la app
   (hoja oscura flotante traslúcida, interruptores rojos #E60026,
   control a la derecha, sin texto de pie) y todas las secciones con
   la misma fila alineada (`.setRow1560`: etiqueta a la izquierda,
   control a la derecha, mismo espaciado). Orden nuevo, de lo más
   intuitivo:
   1. **Cuenta** — Cambiar de cuenta, Mi nombre, Mi código QR,
      Cuenta de ejemplo, Eliminar mi cuenta.
   2. **Apariencia** — Colores, Tamaño del texto, Fondo de chats.
   3. **Notificaciones** — preferencias de avisos (13), avisos
      push, No molestar, Horas tranquilas.
   4. **Privacidad y seguridad** — Privacidad de publicaciones,
      Bloqueados, Silenciados, Palabras que no quiero ver, Estado
      en línea.
   5. **Inicio** — Solo amigos, Ahorro de datos.
   6. **Tus datos** — Respaldo de tus chats, Mis datos (exportar).
   7. **Ayuda** — Tutorial, Cuenta verificada.
   8. **Apoyar a WordRed**.
   9. **Acerca de**.
   Ninguna opción se quita ni cambia de comportamiento; solo cambia
   el orden y la fila. Los interruptores que antes eran casillas a la
   izquierda con el texto a la derecha ahora son el interruptor rojo
   de la app a la derecha, como los de avisos. Dos detalles medidos
   en el DOM: el desplegable de la fila medía 210 px y aplastaba la
   etiqueta a 58 px de ancho (el texto de «Tamaño del texto» se
   estiraba a 360 px de alto); ahora mide 160 px como mucho y la
   etiqueta queda en ~110 px (la fila de «Tamaño del texto» pasó de
   393 px a 82 px de alto; la descripción de «Tamaño del texto» y
   la de «Privacidad de publicaciones» bajaron a nota debajo de la
   fila, para que ninguna se estire: la de privacidad llegaba a
   185 px de alto a 360 px). A 360 px, la fila del horario de «Horas
   tranquilas» se salía 21 px por la derecha (los dos campos de hora
   no cabían: su ancho mínimo era 275 px en una fila de 256 px);
   ahora pueden encogerse (`min-width:0`) y quedan dentro. El título «Seguridad» quedaba vacío (sin
   ningún control debajo): se quitó el título y su contenido vive en
   «Privacidad y seguridad». El `input` oculto duplicado
   `chatBackupInput` (había dos con el mismo `id`, uno muerto)
   también se quitó: queda solo el de la tarjeta de respaldo. Las
   secciones de aspecto del perfil (Marco de avatar, Color de tu
   perfil, Degradado de la portada, Privacidad de cada sección,
   Publicaciones destacadas) viven en «Editar perfil», no en
   Ajustes, y no se mueven. «No molestar» ya aparecía dos veces en
   la 1.5 (una fila en Notificaciones y una tarjeta en la lista
   dinámica, las dos con el mismo botón «Elegir tiempo»): sigue
   apareciendo dos veces, ahora las dos en Notificaciones.
   Comprobado en el DOM (W43): a 390 y 360 px las 9 secciones están
   en ese orden, todos los controles anteriores existen y los
   interruptores cambian de verdad, y todas las filas comparten la
   misma alineación (mismo borde izquierdo y derecho, mismo control
   a la derecha, mismo relleno de 16 px).
5. **Cambiar de cuenta también es un botón de solo símbolo junto al
   de cerrar sesión.** En la cabecera de Ajustes, junto al «?» y al
   botón de cerrar sesión, hay un segundo botón redondo de solo
   símbolo (mismo estilo 40×40, icono de flechas de intercambio,
   añadido al juego de iconos propio como `switchaccount`), con
   `title` y `aria-label` «Cambiar de cuenta». Al tocarlo se abre la
   misma lista de cuentas de siempre (`openSwitchAccount1526`); el
   flujo no cambia. El botón «Cambiar de cuenta» de la sección
   Cuenta se queda como está, con su texto explicativo («Varias
   cuentas en este teléfono…»). Comprobado en el DOM (W44): a 390 y
   360 px el botón está junto al de cerrar sesión, sin texto, y al
   tocarlo se abre la lista de cuentas; el botón de la sección
   Cuenta sigue existiendo.
6. **Las secciones del Inicio van en posiciones al azar.** La
   cartelera de cine «Próximos estrenos», la fila de noticias y la
   cartelera de juegos «Próximos estrenos de juegos» ya no van
   fijas tras la 5ª, 7ª y 10ª publicación: en cada render caen en
   posiciones sorteadas entre las publicaciones
   (`feedSectionPositions1562`), para que se usen más. Nunca van
   antes de las dos primeras publicaciones, nunca seguidas (al
   menos 2 publicaciones entre dos secciones cuando el muro da
   para ello, 8+ publicaciones) ni pegadas a la fila de Reels. La
   fila de Reels se queda fija tras la 2ª publicación y el juego
   destacado va pegado a su cartelera, como antes. Con muro corto
   ninguna sección se pierde: con 6–7 publicaciones salen las
   tres con al menos 1 publicación entre ellas, con 4–5 salen
   una o dos entre las publicaciones y el resto al final, y con
   menos de 4 van todas al final, como antes. El contenido no
   cambia: mismas películas, noticias y juegos, mismos datos y
   mismos clics (el tráiler y la noticia se abren igual).
   Comprobado en el DOM (W46): el sorteo varía entre renders y
   respeta los huecos, en el Inicio real las tres secciones
   aparecen entre las publicaciones con separación y la fila de
   Reels fija, y el tráiler y la noticia se abren al tocarlos.

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

## Servidor 5.0 — EN EL ÁRBOL (pendiente de publicar en vivo)

El servidor 5.0 está en el árbol de trabajo
(`~/workspace/wordred-server-v35/`, sin publicar todavía): `/api/health`
responde 5.0 (con campo `push`) y el preflight CORS ya devuelve
`Access-Control-Allow-Methods` (GET, POST, PUT, DELETE, OPTIONS),
así que editar y borrar publicaciones, grupos, anuncios y cuenta
funcionan desde la web. La Web 1.5 lo necesita: sin el 5.0 en vivo,
el push, el seguir dramas, la verificación por el dueño, las
reacciones a comentarios, el archivo, los reportes del dueño, la
presencia, No molestar, las historias programadas y la
exportación degradan con aviso (nada se rompe, nada se finge).
También es nuevo en 5.0 `GET /api/posts/:id` (público, misma
visibilidad que el inicio): lo usa el flujo de entrada para abrir
la publicación de un enlace compartido aunque el navegador nunca
haya sincronizado el inicio.

**Variables de entorno nuevas en Render** (las pone el dueño en el
panel de Render, nunca en el repo): `VAPID_PUBLIC_KEY` (la clave
pública del par VAPID, también en el código web) y
`VAPID_PRIVATE_KEY` (la privada, solo ahí). Sin ellas, el servidor
arranca igual con el push desactivado en silencio.

El servidor 4.9 sigue en vivo hasta que se publique el 5.0:
`/api/health` responde 4.9 y el preflight CORS ya devuelve
`Access-Control-Allow-Methods` (GET, POST, PUT, DELETE, OPTIONS).
La Web 1.1 no cambia el servidor (sigue 4.9). Tampoco la 1.2.

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

- `node tests/test-web.js`: **335 PASS, 0 FAIL** (log
  `~/workspace/kd150/test-web-15-node11.log`): archivos, diffs
  «Web 1.5» contra Android 1.5.64 (app.js 3.649 líneas cambiadas,
  index.html 447, core.js sin tocar), sintaxis, sin referencias a
  lo quitado en la 1.1 ni en la 1.2, barras que se ocultan, Mercado
  en el centro, Inicio en rojo, barra simétrica, Eventos en el
  perfil abajo de «¿Qué estás pensando?», sin buscador del Inicio,
  regla de Inicio y desplazamiento, FAQ 31, botón «Saltar anuncio»
  libre (clase kdYtOn1558 al cargar el video de YouTube y quitada
  al pararlo), las 70 novedades (push VAPID, Guardados, dramas con
  búsqueda/filtro/seguir, estadísticas del dueño, reacciones,
  archivar, No molestar, autodestrucción, presencia, stickers,
  llamadas de grupo, historias programadas, escuchar/ver juntos,
  exportar, menciones, filtros de foto, verificación por el dueño,
  retomar videos, enlaces profundos, flujo de entrada con
  `fetchDeepLinkPost1550`, limpieza de eventos de prueba, Mercado
  ancho + filtros compactos), PWA + diseño ancho, y el servidor
  5.0 en el árbol (con `GET /api/posts/:id` para los enlaces
  compartidos).
- `tests/test-web-dom.js` (Electron + xvfb, con servidor HTTP
  local): **56 PASS, 0 FAIL** (log
  `~/workspace/kd150/test-web-15-dom12.log`): todo lo de la 1.4
  (arranque, versión Web 1.5, pantalla de inicio, tarjetas de
  actualización y Windows NO EXISTEN, barra sin Aplicaciones ni
  cajón con Mercado en el centro e Inicio en rojo y más pequeña,
  barra simétrica medida en el DOM a 430, 360 y 1280 px, Inicio sin
  buscador ni Eventos/Páginas con reloj, clima y agregar, Eventos
  en el perfil ABAJO de «¿Qué estás pensando?» con creación real
  de un evento, puente mínimo, feed en vivo, 48 dramas en vivo,
  sonda PUT, botón de Google sin errores, inicio de sesión real
  por teléfono con cuenta NUEVA en cada run, feed dibujado, barras
  que se ocultan al bajar y vuelven al subir, regla de Inicio y
  desplazamiento, drama reproduciéndose con el botón «Saltar
  anuncio» libre a 430, 360 y 1280 px y sin errores de consola)
  MÁS lo de la 1.5: push/service worker, Guardados (publicación +
  drama, sobreviven a recargar), diseño ancho a 1280 px y teléfono
  intacto a 390 px, búsqueda y filtro de dramas, chat con búsqueda
  y No molestar, pantallas del dueño ocultas para otros, Reels a
  pantalla completa, guardar/seguir dramas, limpieza del evento
  «Prueba Web 1.3» (W36), Mercado ancho + filtros compactos con
  medidas a 390/360/1280 px (W37) y flujo de entrada (W38):
  sin sesión van primero las cuentas con invitado claro, con
  sesión directo a Inicio, y el enlace `?post=` abre ESA
  publicación como invitado, tras verificar y con sesión. La
  cuenta de prueba se borra del servidor al final de cada run
  (desde el proceso principal, con DELETE directo). La prueba usa
  un teléfono nuevo en cada run porque el servidor solo deja pedir
  3 códigos por hora y por número: con un número fijo la prueba se
  agota al tercer run (eso pasó una vez: 429).
- Servidor 5.0 (`~/workspace/wordred-server-v35/`,
  `node tests/test-server.js`): **495 PASS, 0 FAIL** (log
  `~/workspace/kd150/test-server-50-run8.log`), incluidos los 4
  nuevos de `GET /api/posts/:id` (trae la publicación sin sesión,
  404 si no existe o está archivada).
- Android (`~/workspace/goals/wordred-2/files/wordred/`,
  `node tests/test-wordred.js`): **2.476 PASS, 0 FAIL** (log
  `~/workspace/kd150/test-wordred-50-run3.log`; los pins de
  versión ya dicen 5.0).

En la 1.4 las pruebas decían (histórico): `node tests/test-web.js`
**273 PASS, 0 FAIL** y `tests/test-web-dom.js` **28 PASS, 0 FAIL**.

En la 1.6 (esta versión):
- `node tests/test-web.js`: **356 PASS, 0 FAIL** (log
  `~/workspace/kd150/test-web-16-node-mine.log`): lo de la 1.5
  (338 PASS en su último re-run) MÁS los checks de la 1.6: tarjetas
  de drama sin etiqueta ni insignia (solo portada, con
  `data-kd-series`, `kdPoster1563` y `aria-label`), fila de tarjetas
  como fila horizontal, icono de cerrar sesión, 7 contenedores
  dinámicos de Ajustes, 9 secciones en orden, desplegable de fila
  de 160 px como mucho, sin `#settings1526`, sin duplicado de
  `chatBackupInput`, sin título «Seguridad» vacío, versión «Web 1.6»
  y FAQ 32.
- `tests/test-web-dom.js` (Electron + xvfb, con servidor HTTP
  local): **85 PASS, 0 FAIL** (log
  `~/workspace/kd150/test-web-16-dom-mine.log`): lo de la 1.5
  (66 PASS en su último re-run) MÁS 19 checks nuevos — W40:
  tarjetas de drama 264×400 solo portada sin etiqueta ni insignia
  (48 tarjetas, en la misma fila, con imágenes y `aria-label`),
  iguales a una tarjeta de Reel, y tocar una abre el visor del
  drama; W41: fila de arriba simétrica a 390 y 360 px (primer tile
  y Reels miden 213 px, rectángulo 140×190 + nombre, sin `<img>`
  suelta), tras esperar a que la captura de portadas termine o se
  estabilice; W42: cerrar sesión es un botón de solo símbolo junto
  al «?» en la cabecera de Ajustes, y al tocarlo pide confirmar,
  sale la burbuja «Cerrando cuenta» y aparecen las cuentas
  disponibles (y se vuelve a entrar para seguir); W43: 9 secciones
  de Ajustes en el orden nuevo con los 26 controles anteriores
  presentes (incluidos los de la 1.5), filas simétricas a 390 y
  360 px (mismo borde, mismo relleno, control a la derecha, títulos
  con el mismo margen, filas con desplegable de 150 px como mucho),
  y los interruptores «Ahorro de datos», «Solo amigos» y «Cuenta de
  ejemplo» y el desplegable «Tamaño del texto» cambian de verdad y
  se restauran. La cuenta de prueba se borra del servidor al final
  de cada run. Nota: el run DOM anterior falló 1 vez en la espera
  de la captura de portadas (W41, la cola tardó más de 45 s) y otra
  vez en la simetría a 360 px (W43, la fila del horario se salía
  21 px y la fila de privacidad medía 185 px) — ambos se arreglaron
  de verdad (espera hasta estabilizarse; `min-width:0` en el horario
  y descripción de privacidad como nota) y el run final pasó 85/0.
