import Phaser from "phaser";
import { CELL, COLS, ROWS, WIDTH, HEIGHT } from "./levels";

/**
 * Paleta del escenario. Solo aspecto: la colision vive en la rejilla `grid`
 * de GameScene y no sabe nada de esto.
 */
export interface Theme {
  key: string;
  floor: number; // color base del suelo
  patch: number; // manchas grandes
  specks: number[]; // gravilla
  grid: number; // rejilla de celdas
  detail: "dunas" | "matas" | "placas" | "hielo"; // que se dibuja encima del suelo
  wallDark: number; // acero: contorno
  wallLight: number; // acero: cara
  wallTop: number; // acero: brillo superior
  corkDark: number;
  corkLight: number;
}

export const THEMES: Theme[] = [
  {
    key: "arena",
    floor: 0x7a6440,
    patch: 0x8f7852,
    specks: [0x5f4d31, 0x99815a, 0x6d5937],
    grid: 0x3a2f1d,
    detail: "dunas",
    wallDark: 0x6a5b44,
    wallLight: 0xa08d6c,
    wallTop: 0xc0ab86,
    corkDark: 0x8a6234,
    corkLight: 0xb8894f,
  },
  {
    key: "hierba",
    floor: 0x40663a,
    patch: 0x4e7a44,
    specks: [0x33512e, 0x5c8a4f, 0x2b452a],
    grid: 0x1d2f1a,
    detail: "matas",
    wallDark: 0x4a5450,
    wallLight: 0x7c8a80,
    wallTop: 0x9dab9c,
    corkDark: 0x7d5a2e,
    corkLight: 0xa87a45,
  },
  {
    key: "oxido",
    floor: 0x6e4030,
    patch: 0x87513a,
    specks: [0x522f21, 0x9c5f42, 0x452a1d],
    grid: 0x2e1a12,
    detail: "dunas",
    wallDark: 0x6b4436,
    wallLight: 0x9c6a52,
    wallTop: 0xbb8467,
    corkDark: 0x8a6234,
    corkLight: 0xb8894f,
  },
  {
    key: "hangar",
    floor: 0x435068,
    patch: 0x4f5e79,
    specks: [0x354054, 0x5d6d88, 0x2b3444],
    grid: 0x1a1f28,
    detail: "placas",
    wallDark: 0x4a5364,
    wallLight: 0x76829a,
    wallTop: 0x96a3bc,
    corkDark: 0x8a6234,
    corkLight: 0xb08050,
  },
  {
    key: "asfalto",
    floor: 0x4c5057,
    patch: 0x5b6068,
    specks: [0x3c4046, 0x6c727b, 0x35383d],
    grid: 0x1b1d21,
    detail: "placas",
    wallDark: 0x5a5f66,
    wallLight: 0x8e949c,
    wallTop: 0xb0b6be,
    corkDark: 0x8a6234,
    corkLight: 0xb08050,
  },
  {
    key: "nieve",
    floor: 0x7e8ea3,
    patch: 0x93a3b8,
    specks: [0x6a7a90, 0xa9b8cb, 0x5f6e83],
    grid: 0x3d4757,
    detail: "hielo",
    wallDark: 0x5f7089,
    wallLight: 0x9fb2c9,
    wallTop: 0xd2e0ee,
    corkDark: 0x7a5a34,
    corkLight: 0xa8804d,
  },
];

/** Un tema cada 3 niveles: con 18 niveles salen los seis, uno por tramo. */
export function themeForLevel(level: number): Theme {
  return THEMES[Math.floor(level / 3) % THEMES.length];
}

/**
 * Azar reproducible: el nivel 7 tiene que verse siempre igual, pero distinto
 * del 8 aunque compartan paleta. Con `Math.random()` el suelo bailaba en cada
 * muerte y reintento.
 */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function css(color: number, alpha = 1) {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Aclara (f > 1) u oscurece (f < 1) un color, para variar la paleta por nivel. */
function shade(color: number, f: number) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (c((color >> 16) & 0xff) << 16) | (c((color >> 8) & 0xff) << 8) | c(color & 0xff);
}

const FLOOR_KEY = "floor";

/**
 * Suelo completo del tamaño del mundo: base, manchas, detalle del tema,
 * gravilla, rejilla y viñeta, todo horneado en una sola textura.
 *
 * Se repinta en cada nivel en vez de cachear una textura por tema: asi cada
 * nivel tiene su propio dibujo sin acumular un canvas de 960x540 por nivel.
 *
 * Se REPINTA, no se borra y se vuelve a crear: `textures.remove()` deja sin
 * frame a las imagenes que sigan apuntando a la textura (la del titulo, sin ir
 * mas lejos) y el render peta con un `resolution` de null.
 */
function floorTexture(scene: Phaser.Scene, t: Theme, level: number) {
  const tex = (scene.textures.exists(FLOOR_KEY)
    ? scene.textures.get(FLOOR_KEY)
    : scene.textures.createCanvas(FLOOR_KEY, WIDTH, HEIGHT)) as Phaser.Textures.CanvasTexture;
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  const r = rng(level * 9973 + t.key.length * 131);

  // cada nivel tira un poco mas claro o mas oscuro dentro de su paleta
  const base = shade(t.floor, 0.93 + r() * 0.14);
  ctx.fillStyle = css(base);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < 26; i++) {
    const x = r() * WIDTH;
    const y = r() * HEIGHT;
    const rad = 60 + r() * 140;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, css(t.patch, 0.28));
    grad.addColorStop(1, css(t.patch, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  detail(ctx, t, r);

  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = css(t.specks[i % t.specks.length], 0.18 + r() * 0.3);
    const s = 1 + r() * 2;
    ctx.fillRect(r() * WIDTH, r() * HEIGHT, s, s);
  }

  ctx.strokeStyle = css(t.grid, 0.16);
  ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL + 0.5, 0);
    ctx.lineTo(c * CELL + 0.5, HEIGHT);
    ctx.stroke();
  }
  for (let row = 1; row < ROWS; row++) {
    ctx.beginPath();
    ctx.moveTo(0, row * CELL + 0.5);
    ctx.lineTo(WIDTH, row * CELL + 0.5);
    ctx.stroke();
  }

  const vig = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.25, WIDTH / 2, HEIGHT / 2, WIDTH * 0.68);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  tex.refresh();
  return FLOOR_KEY;
}

/** Lo que hace que un tema no sea solo "el mismo suelo de otro color". */
function detail(ctx: CanvasRenderingContext2D, t: Theme, r: () => number) {
  if (t.detail === "dunas") {
    // crestas largas y tendidas, como arena barrida por el viento
    for (let i = 0; i < 22; i++) {
      const x = r() * WIDTH;
      const y = r() * HEIGHT;
      const w = 90 + r() * 220;
      ctx.strokeStyle = css(t.specks[1], 0.16 + r() * 0.12);
      ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + w * 0.3, y - 12, x + w * 0.7, y + 12, x + w, y);
      ctx.stroke();
    }
  } else if (t.detail === "matas") {
    // matojos: tres briznas desde un punto
    for (let i = 0; i < 260; i++) {
      const x = r() * WIDTH;
      const y = r() * HEIGHT;
      ctx.strokeStyle = css(r() < 0.5 ? t.specks[0] : t.specks[1], 0.4);
      ctx.lineWidth = 1.4;
      for (let b = -1; b <= 1; b++) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + b * 3 + (r() - 0.5) * 2, y - 5 - r() * 4);
        ctx.stroke();
      }
    }
  } else if (t.detail === "placas") {
    // chapas atornilladas: juntas cada dos celdas y remaches en las esquinas
    ctx.strokeStyle = css(t.grid, 0.3);
    ctx.lineWidth = 2;
    for (let c = 2; c < COLS; c += 2) {
      ctx.beginPath();
      ctx.moveTo(c * CELL, 0);
      ctx.lineTo(c * CELL, HEIGHT);
      ctx.stroke();
    }
    for (let row = 3; row < ROWS; row += 3) {
      ctx.beginPath();
      ctx.moveTo(0, row * CELL);
      ctx.lineTo(WIDTH, row * CELL);
      ctx.stroke();
    }
    for (let c = 2; c < COLS; c += 2) {
      for (let row = 3; row < ROWS; row += 3) {
        ctx.fillStyle = css(t.specks[1], 0.5);
        ctx.beginPath();
        ctx.arc(c * CELL, row * CELL, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    // placas de hielo: manchas claras con un borde mas claro todavia
    for (let i = 0; i < 30; i++) {
      const x = r() * WIDTH;
      const y = r() * HEIGHT;
      const rad = 20 + r() * 60;
      ctx.fillStyle = css(t.specks[1], 0.22);
      ctx.strokeStyle = css(0xffffff, 0.18);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(x, y, rad, rad * (0.4 + r() * 0.4), r() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
}

/** Viñeta suelta que va POR ENCIMA: oscurece tambien muros y tanques del borde. */
function vignetteTexture(scene: Phaser.Scene) {
  const key = "vignette";
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, WIDTH, HEIGHT)!;
  const ctx = tex.getContext();
  const grad = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.42, WIDTH / 2, HEIGHT / 2, WIDTH * 0.72);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(6,6,12,0.55)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  tex.refresh();
  return key;
}

/** Texturas de muro del tema. Las de tanques y balas no dependen del tema. */
export function makeWallTextures(scene: Phaser.Scene, t: Theme) {
  if (scene.textures.exists(`wall_${t.key}`)) return;
  const g = scene.add.graphics();

  g.fillStyle(t.wallDark).fillRect(0, 0, CELL, CELL);
  g.fillStyle(t.wallLight).fillRect(3, 3, CELL - 6, CELL - 6);
  g.fillStyle(t.wallTop).fillRect(3, 3, CELL - 6, 7); // luz arriba
  g.fillStyle(t.wallDark, 0.45).fillRect(3, CELL - 12, CELL - 6, 9); // sombra abajo
  g.fillStyle(t.wallDark, 0.35);
  for (let i = 0; i < 5; i++) {
    g.fillRect(6 + Math.random() * (CELL - 16), 14 + Math.random() * (CELL - 30), 4 + Math.random() * 12, 2);
  }
  g.fillStyle(t.wallTop, 0.5); // remaches
  [
    [8, 11],
    [CELL - 10, 11],
    [8, CELL - 9],
    [CELL - 10, CELL - 9],
  ].forEach(([x, y]) => g.fillCircle(x, y, 1.6));
  g.generateTexture(`wall_${t.key}`, CELL, CELL);
  g.clear();

  g.fillStyle(t.corkDark).fillRect(0, 0, CELL, CELL);
  g.fillStyle(t.corkLight).fillRect(3, 3, CELL - 6, CELL - 6);
  g.fillStyle(t.corkDark, 0.55); // tablas: se ve que es una caja
  g.fillRect(3, CELL / 2 - 2, CELL - 6, 3);
  g.fillRect(CELL / 2 - 2, 3, 3, CELL - 6);
  g.fillStyle(t.corkDark);
  for (let i = 0; i < 22; i++) {
    g.fillCircle(6 + Math.random() * (CELL - 12), 6 + Math.random() * (CELL - 12), 1 + Math.random() * 2.5);
  }
  g.generateTexture(`cork_${t.key}`, CELL, CELL);
  g.destroy();
}

/** Suelo + viñeta. Devuelve la imagen de la viñeta por si hay que reordenarla. */
export function applyBackdrop(scene: Phaser.Scene, t: Theme, level = 0) {
  scene.add.image(WIDTH / 2, HEIGHT / 2, floorTexture(scene, t, level)).setDepth(0);
  return scene.add
    .image(WIDTH / 2, HEIGHT / 2, vignetteTexture(scene))
    .setDepth(100)
    .setAlpha(0.85);
}

/** Manchas y grietas sueltas en las celdas libres: rompen la uniformidad. */
export function scatterDecals(
  scene: Phaser.Scene,
  t: Theme,
  level: number,
  isFree: (r: number, c: number) => boolean
) {
  const g = scene.add.graphics().setDepth(1);
  const rand = rng(level * 7717 + 13);
  for (let row = 0; row < ROWS; row++) {
    for (let c = 0; c < COLS; c++) {
      if (!isFree(row, c) || rand() > 0.28) continue;
      const x = c * CELL + 8 + rand() * (CELL - 16);
      const y = row * CELL + 8 + rand() * (CELL - 16);
      if (rand() < 0.5) {
        g.fillStyle(t.specks[0], 0.35);
        g.fillEllipse(x, y, 8 + rand() * 16, 5 + rand() * 9);
      } else {
        g.lineStyle(1.5, t.grid, 0.3);
        let px = x;
        let py = y;
        for (let i = 0; i < 3; i++) {
          const nx = px + (rand() - 0.5) * 22;
          const ny = py + (rand() - 0.5) * 22;
          g.lineBetween(px, py, nx, ny);
          px = nx;
          py = ny;
        }
      }
    }
  }
}
