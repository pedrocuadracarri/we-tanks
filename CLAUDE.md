# We Tanks

Clon del minijuego de tanques de *Wii Play*, para jugar en el navegador del móvil.
Vista cenital, arena horizontal, balas que rebotan, minas y muros destructibles.

## Arrancar

```bash
npm run dev
```

Sirve en `http://localhost:5173` y también en la IP de red local (`--host`), que es como se
juega desde el móvil: abrir esa URL en Chrome y "Añadir a pantalla de inicio".
`npm run build` hace `tsc --noEmit` y luego el bundle de producción.

El juego es **horizontal**. En vertical, `index.html` tapa la pantalla con un aviso de girar
el móvil mediante una media query de `orientation: portrait`; no hay JavaScript implicado.

## Stack

- **Phaser 4.2** con física Arcade (la API que se usa aquí es la de siempre). Todas las texturas del juego se generan en tiempo de ejecución
  con `Graphics.generateTexture()` y todos los sonidos se sintetizan con WebAudio. El único fichero
  que se descarga aparte del bundle es `public/logo.png` (el logo del título), y los iconos de la PWA.
- **Vite 8** + **TypeScript 7** en modo estricto. `package.json` tiene que declarar las versiones
  que hay instaladas de verdad: si los rangos no cuadran con `package-lock.json`, `npm ci` falla en
  el workflow aunque `npm run build` funcione en local.
- Mundo fijo de **960×540** con `Scale.FIT`, así que escala a cualquier pantalla sin recolocar nada.

## Archivos

| Archivo | Qué hay |
|---|---|
| `src/main.ts` | Config de Phaser, arranque y registro del service worker. Expone `window.game`. |
| `src/GameScene.ts` | Todo el juego: nivel, tanques, IA, balas, minas, HUD, pausa, fin de ronda. |
| `src/TitleScene.ts` | Menú: jugar, reanudar/continuar, récord, controles. |
| `src/PauseScene.ts` | Menú de pausa (reanudar, reiniciar nivel, salir). Escena aparte. |
| `src/config.ts` | **Balance.** Stats de cada tipo de tanque y constantes de minas/vidas. |
| `src/levels.ts` | **Mapas.** Geometría del mundo y los 18 niveles como texto. |
| `src/theme.ts` | **Aspecto.** Paletas por tramos, textura de suelo, viñeta y muros. |
| `src/Joystick.ts` | Joystick virtual: aparece donde tocas y devuelve un vector. |
| `src/audio.ts` | Efectos y música sintetizados (osciladores + ruido), mute persistente y `vibrate()`. |
| `src/progress.ts` | Récord y partida en curso en `localStorage`. |
| `public/` | `manifest.webmanifest`, `sw.js`, `logo.png` e iconos de la PWA. |
| `scripts/make-icons.mjs` | Genera los PNG de los iconos sin dependencias (`npm run icons`). |

Para tocar la dificultad, `config.ts`. Para tocar los mapas, `levels.ts`. Casi nunca hace falta
entrar en `GameScene.ts` para eso.

## Cómo se juega

- **Móvil**: joystick izquierdo mueve, joystick derecho apunta y **dispara al soltar**, botón
  rojo abajo a la derecha pone mina.
- **PC**: WASD/flechas mueven, arrastrar el ratón por la mitad derecha apunta, espacio dispara,
  `E` pone mina.

Mientras apuntas se dibuja una **línea de mira** que incluye el primer rebote. Apuntar no gasta
munición: el disparo sale al levantar el dedo. Un toque sin arrastrar dispara en la dirección
en la que ya mira la torreta.

El HUD lleva un contador de **balas libres** (`BALAS ●●●○○`): con 5 tuyas en pantalla dejas de
disparar, y sin el contador eso parece que el juego se ha roto. En el nivel 1 sale un aviso de que
se dispara al soltar, que desaparece con tu primer disparo. Las explosiones vibran el móvil
(`navigator.vibrate`), y la vibración **no** depende del mute: si silencias es por no hacer ruido.

## Reglas

- Un impacto mata, a cualquiera. **Tus propias balas y tus propias minas también te matan**, igual
  que en el original.
- Balas: máximo 5 tuyas en pantalla, 3 por enemigo. Rebotan 1 vez (2 los tipos avanzados, que
  además disparan más rápido y salen en naranja) y se destruyen al siguiente impacto.
- Minas: máximo 2 tuyas. Se arman en 0.9 s, detonan a los 5 s o si alguien se acerca, encadenan
  con otras minas y revientan los muros de corcho. El acero no se destruye.
- 3 vidas, una extra cada 5 niveles superados. Perder una reinicia el nivel conservando los puntos;
  quedarse sin vidas vuelve al menú.
- El progreso (mejor nivel y mejor puntuación) vive en `localStorage` bajo `wetanks.progress.v1`;
  el mute, en `wetanks.muted`. La partida a medias (`{level, lives, score}`), en `wetanks.run.v1`:
  se guarda al empezar cada nivel y se borra al terminar la campaña o al quedarte sin vidas, así
  que el título ofrece **REANUDAR** exactamente donde lo dejaste.
- **Pausa**: botón arriba en el centro, `ESC` o `P`. También se pausa sola al perder el foco o al
  esconderse la pestaña, que en el móvil es lo que pasa cuando te llaman.

## Formato de nivel

Cada nivel son 9 filas de 16 caracteres, una celda de 60 px cada uno:

| Char | Significado |
|---|---|
| `.` | vacío |
| `#` | acero, indestructible |
| `o` | corcho, lo revientan las minas |
| `P` | jugador (exactamente uno por nivel) |
| `1`–`7` | enemigo del tipo correspondiente en `ENEMY_TYPES` |

Los tipos van de menos a más peligrosos: `1` marrón (inmóvil), `2` ceniza, `3` rosa (rápido),
`4` verde (inmóvil, balas rápidas de doble rebote), `5` morado (minas), `6` blanco (invisible +
minas), `7` negro (rápido, doble rebote). Cada uno tiene su velocidad, cadencia, puntuación, cuánto
te adelanta el disparo (`lead`) y si busca tiros con rebote (`bankShot`).

Al añadir niveles conviene validar las longitudes de fila; un carácter de más pasa desapercibido
y desplaza medio mapa.

## IA

Cada enemigo hace tres cosas:

1. **Apuntar adelantando tu movimiento.** `lead` (0 a 1) decide cuánto: el marrón apunta a donde
   estás, el negro a donde vas a estar según tu velocidad y el tiempo de vuelo de la bala.
2. **Moverse eligiendo hueco.** `pickDirection()` mide el espacio libre en 8 direcciones sobre la
   rejilla y elige la mejor con algo de azar. Antes giraba al azar y se quedaba clavado en las esquinas.
3. **Buscar tiros con rebote** cuando no tiene línea de visión (`findBankShot()`), si su tipo lo permite.

`findBankShot()` hace un **barrido grueso de 20 ángulos y luego refina** alrededor del mejor
candidato. Un barrido uniforme no sirve: para acertar un blanco de 17 px a 800 px hace falta
alrededor de 1 grado de resolución, o sea unos 360 rayos, que no caben en un frame. El barrido
grueso usa pasos largos y el refinado pasos cortos. Está limitado a **una búsqueda por frame**
(`bankShotBudget`) y a una cada 500 ms por tanque; aun así es lo más caro del juego (pico de ~9 ms).

La rejilla `grid[fila][col]` es la fuente de verdad para trazar rayos, tanto de la mira como de la
IA. **Hay que ponerla a `false` al destruir un corcho**, o la IA seguirá viendo un muro que ya no existe.

## Trampas de Phaser que costaron tiempo

Están todas resueltas, pero conviene no reintroducirlas:

- **`group.add(obj)` reaplica los defaults del grupo al body**, borrando velocidad, rebote y
  `collideWorldBounds`. Hay que crear los objetos con `group.create(x, y, key)` y configurarlos
  después. Un disparo con velocidad 0 es el síntoma.
- **`this.physics.world` ya es `null` cuando corre el handler de `shutdown`.** Si hay que quitar un
  listener del mundo, se captura la referencia en `create()`.
- **`RenderTexture` no sirvió para las marcas de orugas.** `draw()` ignora los objetos con
  `visible = false`, y aun corrigiendo eso no pintaba nada, ni con un `fill()` directo (comprobado
  leyendo píxeles). Las huellas son sprites normales que se desvanecen; el coste es asumible.
- **Los fundidos críticos no van con tweens.** El destello de impacto se atenúa en `update()` usando
  el delta, porque un tween puede quedarse a medias si el bucle se interrumpe y dejaría un velo
  blanco permanente.
- **Una escena pausada no procesa input ni avanza su reloj.** Eso es justo lo que se quiere para
  la pausa (los fusibles de las minas no corren), pero obliga a que el menú viva en otra escena:
  `PauseScene` llama a `resumeFromMenu()` / `restartFromMenu()` / `quitFromMenu()` sobre `GameScene`.
  Un flag `paused` dentro de la propia escena no serviría: `time.now` seguiría corriendo y las minas
  detonarían todas a la vez al reanudar.
- **Phaser pausa el bucle cuando la pestaña no es visible**, y Chrome congela `requestAnimationFrame`
  en pestañas de fondo. `game.loop.actualFps` sigue devolviendo un número creíble aunque no se esté
  renderizando nada: no es fiable en ese estado.

## Probar sin ver la pantalla

Si el juego no está visible, el bucle no avanza y hay que empujarlo a mano desde la consola.
`window.game` está expuesto para esto:

```js
const sc = window.game.scene.getScene('game');
let t = sc.time.now;
for (let i = 0; i < 300; i++) {
  t += 16.6;
  sc.time.update(t, 16.6);
  sc.tweens.update(t, 16.6);
  sc.update(t, 16.6);
  sc.physics.world.step(1 / 60);
}
```

`game.scene.start('game', { level, lives, score })` seguido de `game.scene.processQueue()` salta a
cualquier nivel sin esperar al cambio de escena, que es asíncrono. Cronometrando ese bucle se mide
el coste real por frame: ahora mismo 0.37 ms de media con 6 enemigos, sobre un presupuesto de 16.6.

## Aspecto

Todo lo visual del escenario está en `theme.ts` y no toca la jugabilidad: los muros y el suelo
comparten la rejilla lógica `grid`, que es solo colisión.

- Cuatro paletas (**arena, hierba, hangar, nieve**) que rotan cada 5 niveles (`themeForLevel()`).
  Cambian suelo, gravilla, rejilla, acero y corcho.
- El suelo es **una textura de canvas del tamaño del mundo** (960×540) con base, manchas suaves,
  gravilla, rejilla y viñeta horneadas. Un `TileSprite` repetido se notaba; a este tamaño la memoria
  da igual y no hay costuras.
- Encima va una **viñeta suelta** (depth 100) que oscurece también muros y tanques del borde, por
  debajo del joystick y del HUD.
- `scatterDecals()` reparte manchas y grietas por las celdas libres, sin colisión, en un solo
  `Graphics`.

Las texturas de muro se generan por tema (`wall_<tema>`, `cork_<tema>`); las de tanques, balas y
minas no dependen del tema y se generan una vez.

## PWA y publicación

- `vite.config.ts` fija `base: "./"`, así que el build vale tanto en la raíz de un dominio como en
  `/usuario/repo/` de GitHub Pages.
- `public/manifest.webmanifest`: pantalla completa, horizontal, iconos. En `index.html` las rutas
  usan `%BASE_URL%`, que Vite sustituye al construir.
- `public/sw.js`: en `install` se lee el `index.html`, se sacan los `src`/`href` y se cachea todo,
  porque los ficheros de la primera carga no pasan por el worker y si no habría que visitar la web
  dos veces para jugar sin conexión. El HTML va de red primero (para recoger versiones nuevas) y el
  resto de caché primero (los nombres llevan hash). **Al cambiar la estrategia hay que subir
  `CACHE`**, o los navegadores se quedan con la caché vieja.
- Solo se registra en producción (`import.meta.env.PROD`): en `npm run dev` estorba.
- `logo.png` lo carga Phaser en `TitleScene.preload()`, así que **no aparece en el HTML** y el
  precache del worker lo añade a mano. Si algún día se cargan más assets así, hay que añadirlos ahí.
- Los iconos y el logo salen del original en 1024 recortado y reescalado (`icon-192`, `icon-512`,
  `apple-touch-icon`, `logo`). `scripts/make-icons.mjs` genera un icono de respaldo dibujado a mano
  con `zlib` y sin dependencias (`npm run icons`); ya no se usa, pero sirve si se quiere volver a un
  icono vectorial.
- `.github/workflows/deploy.yml` construye y publica en GitHub Pages en cada push a `main`.

## Estado

Los 18 niveles cargan y corren sin errores, el build de producción compila y el service worker
precachea el bundle (comprobado: `caches` contiene index, JS e iconos tras la primera carga).
Lo que sigue sin comprobar es **el balance**: nadie ha jugado la campaña entera de principio a fin.
Los niveles 17 y 18 se bajaron de 8 a 6 enemigos por sospecha, no por medición, y la IA se volvió
bastante más letal después de esa estimación. Si hay que aflojar, los primeros candidatos son
`cooldown` y `lead` en `config.ts`.

## Música

`audio.ts` tiene un loop de fondo (clase `Music`) sobre Am-F-C-G a 96 bpm: bajo, arpegio y charles,
sin ficheros. Va por su **propio bus de ganancia** (`MUSIC_VOL = 0.13`) para mezclarlo aparte de los
efectos, aunque el botón de mute silencia las dos cosas.

- Las notas se programan **con antelación** (`schedule()` mira 0.4 s por delante y lo llama un
  `setInterval` de 120 ms). Programar nota a nota desde el temporizador sonaría a destiempo: el reloj
  bueno es `ctx.currentTime`, no el de JS.
- Arranca dentro de `sfx.unlock()`, que es el único sitio donde hay garantía de gesto del usuario.
- Un listener de `visibilitychange` suspende el `AudioContext` con la pestaña oculta. De paso eso
  frena el programador solo: con el reloj congelado, `schedule()` deja de tener hueco por delante.

## Próximos pasos

### 1. Jugar la campaña entera

Lo único importante que sigue sin hacerse. Ver arriba, en Estado.

### 2. Modo sin fin

Los 18 niveles se acaban. Mapas generados con dificultad creciente compitiendo contra tu récord.
El formato de nivel es texto, así que generarlos es fácil; lo difícil es garantizar que sean
jugables (que el jugador no aparezca encerrado y que haya rutas abiertas).

### 3. Distinguir los tanques por algo más que el color

Siete tipos y siete colores. Un número o una silueta en la torreta se lee mejor de un vistazo y
deja de ser un problema para daltónicos.

### 4. Ajustes

Sensibilidad y tamaño del joystick, e intercambiar los dos joysticks para zurdos.
