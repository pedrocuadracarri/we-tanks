export interface TankType {
  key: string;
  name: string;
  dark: number; // chasis
  light: number; // cubierta
  barrel: number; // torreta
  speed: number; // px/s (0 = inmovil)
  cooldown: number; // ms entre disparos
  bounces: number; // rebotes de sus balas
  bulletSpeed: number;
  spread: number; // error de punteria en radianes
  aimSpeed: number; // velocidad de giro de la torreta
  lead: number; // 0..1 cuanto adelanta el disparo a tu movimiento
  bankShot: boolean; // busca tiros con rebote cuando no te ve
  mines: boolean;
  invisible: boolean;
  points: number;
}

const base = {
  spread: 0.08,
  aimSpeed: 0.035,
  lead: 0,
  bankShot: false,
  mines: false,
  invisible: false,
  bulletSpeed: 270,
  bounces: 1,
};

export const PLAYER: TankType = {
  ...base,
  key: "player",
  name: "Tú",
  dark: 0x1f4f8f,
  light: 0x3f8fdf,
  barrel: 0x9fd0ff,
  speed: 175,
  cooldown: 400,
  bounces: 1,
  bulletSpeed: 300,
  spread: 0,
  aimSpeed: 1,
  mines: true,
  invisible: false,
  points: 0,
};

/** Tipos enemigos, indexados por el caracter '1'..'7' del mapa. */
export const ENEMY_TYPES: Record<string, TankType> = {
  "1": {
    ...base,
    key: "brown",
    name: "Marrón",
    dark: 0x7a4a20,
    light: 0xb5793d,
    barrel: 0xd9a05b,
    speed: 0,
    cooldown: 2200,
    bulletSpeed: 235,
    spread: 0.14,
    aimSpeed: 0.02,
    points: 100,
  },
  "2": {
    ...base,
    key: "ash",
    name: "Ceniza",
    dark: 0x4a4a52,
    light: 0x8a8a95,
    barrel: 0xc0c0cc,
    speed: 55,
    cooldown: 1800,
    bulletSpeed: 255,
    spread: 0.1,
    aimSpeed: 0.03,
    lead: 0.35,
    points: 200,
  },
  "3": {
    ...base,
    key: "pink",
    name: "Rosa",
    dark: 0x9a2f5e,
    light: 0xe86fa0,
    barrel: 0xffb3d0,
    speed: 110,
    cooldown: 1500,
    spread: 0.09,
    aimSpeed: 0.045,
    lead: 0.55,
    points: 300,
  },
  "4": {
    ...base,
    key: "green",
    name: "Verde",
    dark: 0x246b3e,
    light: 0x4fc07a,
    barrel: 0xa8f0c0,
    speed: 0,
    cooldown: 2000,
    bounces: 2,
    bulletSpeed: 400,
    spread: 0.015,
    aimSpeed: 0.05,
    lead: 0.9,
    bankShot: true,
    points: 400,
  },
  "5": {
    ...base,
    key: "purple",
    name: "Morado",
    dark: 0x4d2878,
    light: 0x9a5fd0,
    barrel: 0xd0a8ff,
    speed: 95,
    cooldown: 1600,
    spread: 0.07,
    aimSpeed: 0.04,
    lead: 0.5,
    bankShot: true,
    mines: true,
    points: 500,
  },
  "6": {
    ...base,
    key: "white",
    name: "Blanco",
    dark: 0x9a9aa4,
    light: 0xf0f0f5,
    barrel: 0xffffff,
    speed: 85,
    cooldown: 1700,
    spread: 0.07,
    aimSpeed: 0.04,
    lead: 0.6,
    bankShot: true,
    mines: true,
    invisible: true,
    points: 600,
  },
  "7": {
    ...base,
    key: "black",
    name: "Negro",
    dark: 0x141419,
    light: 0x35353f,
    barrel: 0x8a8a95,
    speed: 145,
    cooldown: 1300,
    bounces: 2,
    bulletSpeed: 420,
    spread: 0.045,
    aimSpeed: 0.06,
    lead: 1,
    bankShot: true,
    points: 800,
  },
};

// --- reglas generales ---
export const PLAYER_MAX_BULLETS = 5;
export const PLAYER_MAX_MINES = 2;
export const ENEMY_MAX_BULLETS = 3;
export const ENEMY_MAX_MINES = 2;

export const MINE_ARM_MS = 900; // hasta que se activa
export const MINE_FUSE_MS = 5000; // hasta que detona sola
export const MINE_TRIGGER_RADIUS = 46;
export const MINE_BLAST_RADIUS = 78;

export const START_LIVES = 3;
export const EXTRA_LIFE_EVERY = 5; // niveles superados

export const STORAGE_KEY = "wetanks.progress.v1";
export const RUN_KEY = "wetanks.run.v1"; // partida a medias, para reanudar
