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
    wallDark: 0x4a5450,
    wallLight: 0x7c8a80,
    wallTop: 0x9dab9c,
    corkDark: 0x7d5a2e,
    corkLight: 0xa87a45,
  },
  {
    key: "hangar",
    floor: 0x38414f,
    patch: 0x424d5e,
    specks: [0x2c3341, 0x4d596c, 0x252b36],
    grid: 0x1a1f28,
    wallDark: 0x4a5364,
    wallLight: 0x76829a,
    wallTop: 0x96a3bc,
    corkDark: 0x8a6234,
    corkLight: 0xb08050,
  },
  {
    key: "nieve",
    floor: 0x7e8ea3,
    patch: 0x93a3b8,
    specks: [0x6a7a90, 0xa9b8cb, 0x5f6e83],
    grid: 0x3d4757,
    wallDark: 0x5f7089,
    wallLight: 0x9fb2c9,
    wallTop: 0xd2e0ee,
    corkDark: 0x7a5a34,
    corkLight: 0xa8804d,
  },
];

/** Un tema cada 5 niveles: se nota que avanzas sin diseñar nada nuevo. */
export function themeForLevel(level: number): Theme {
  return THEMES[Math.floor(level / 5) % THEMES.length];
}

function css(color: number, alpha = 1) {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Suelo completo del tamaño del mundo: base, manchas, gravilla, rejilla y
 * viñeta, todo horneado en una sola textura. Un TileSprite repetido se nota;
 * a 960x540 el coste de memoria es irrelevante.
 */
function floorTexture(scene: Phaser.Scene, t: Theme) {
  const key = `floor_${t.key}`;
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.createCanvas(key, WIDTH, HEIGHT)!;
  const ctx = tex.getContext();

  ctx.fillStyle = css(t.floor);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let i = 0; i < 26; i++) {
    const x = Math.random() * WIDTH;
    const y = Math.random() * HEIGHT;
    const r = 60 + Math.random() * 140;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, css(t.patch, 0.28));
    grad.addColorStop(1, css(t.patch, 0));
    ctx.fillStyle = grad;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = css(t.specks[i % t.specks.length], 0.18 + Math.random() * 0.3);
    const s = 1 + Math.random() * 2;
    ctx.fillRect(Math.random() * WIDTH, Math.random() * HEIGHT, s, s);
  }

  ctx.strokeStyle = css(t.grid, 0.16);
  ctx.lineWidth = 1;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * CELL + 0.5, 0);
    ctx.lineTo(c * CELL + 0.5, HEIGHT);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * CELL + 0.5);
    ctx.lineTo(WIDTH, r * CELL + 0.5);
    ctx.stroke();
  }

  const vig = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, HEIGHT * 0.25, WIDTH / 2, HEIGHT / 2, WIDTH * 0.68);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.5)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  tex.refresh();
  return key;
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
  g.fillStyle(t.wallTop).fillRect(3, 3, CELL - 6, 6);
  g.fillStyle(t.wallDark, 0.35);
  for (let i = 0; i < 5; i++) {
    g.fillRect(6 + Math.random() * (CELL - 16), 12 + Math.random() * (CELL - 24), 4 + Math.random() * 12, 2);
  }
  g.fillStyle(t.wallTop, 0.5); // remaches
  [
    [8, 10],
    [CELL - 10, 10],
    [8, CELL - 10],
    [CELL - 10, CELL - 10],
  ].forEach(([x, y]) => g.fillCircle(x, y, 1.6));
  g.generateTexture(`wall_${t.key}`, CELL, CELL);
  g.clear();

  g.fillStyle(t.corkDark).fillRect(0, 0, CELL, CELL);
  g.fillStyle(t.corkLight).fillRect(3, 3, CELL - 6, CELL - 6);
  g.fillStyle(t.corkDark);
  for (let i = 0; i < 22; i++) {
    g.fillCircle(6 + Math.random() * (CELL - 12), 6 + Math.random() * (CELL - 12), 1 + Math.random() * 2.5);
  }
  g.generateTexture(`cork_${t.key}`, CELL, CELL);
  g.destroy();
}

/** Suelo + viñeta. Devuelve la imagen de la viñeta por si hay que reordenarla. */
export function applyBackdrop(scene: Phaser.Scene, t: Theme) {
  scene.add.image(WIDTH / 2, HEIGHT / 2, floorTexture(scene, t)).setDepth(0);
  return scene.add
    .image(WIDTH / 2, HEIGHT / 2, vignetteTexture(scene))
    .setDepth(100)
    .setAlpha(0.85);
}

/** Manchas y grietas sueltas en las celdas libres: rompen la uniformidad. */
export function scatterDecals(scene: Phaser.Scene, t: Theme, isFree: (r: number, c: number) => boolean) {
  const g = scene.add.graphics().setDepth(1);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (!isFree(r, c) || Math.random() > 0.28) continue;
      const x = c * CELL + 8 + Math.random() * (CELL - 16);
      const y = r * CELL + 8 + Math.random() * (CELL - 16);
      if (Math.random() < 0.5) {
        g.fillStyle(t.specks[0], 0.35);
        g.fillEllipse(x, y, 8 + Math.random() * 16, 5 + Math.random() * 9);
      } else {
        g.lineStyle(1.5, t.grid, 0.3);
        let px = x;
        let py = y;
        for (let i = 0; i < 3; i++) {
          const nx = px + Phaser.Math.FloatBetween(-11, 11);
          const ny = py + Phaser.Math.FloatBetween(-11, 11);
          g.lineBetween(px, py, nx, ny);
          px = nx;
          py = ny;
        }
      }
    }
  }
}
