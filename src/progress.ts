import { STORAGE_KEY, RUN_KEY } from "./config";

export interface Progress {
  bestLevel: number; // niveles superados
  bestScore: number;
}

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bestLevel: 0, bestScore: 0 };
    const p = JSON.parse(raw) as Partial<Progress>;
    return { bestLevel: p.bestLevel ?? 0, bestScore: p.bestScore ?? 0 };
  } catch {
    return { bestLevel: 0, bestScore: 0 };
  }
}

export function saveProgress(clearedLevels: number, score: number) {
  const prev = loadProgress();
  const next: Progress = {
    bestLevel: Math.max(prev.bestLevel, clearedLevels),
    bestScore: Math.max(prev.bestScore, score),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* modo privado: sin guardado */
  }
}

/** Partida a medias: se guarda al empezar cada nivel y se borra al terminarla. */
export interface Run {
  level: number; // indice del nivel en curso
  lives: number;
  score: number;
}

export function loadRun(): Run | null {
  try {
    const raw = localStorage.getItem(RUN_KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as Partial<Run>;
    if (typeof r.level !== "number" || typeof r.lives !== "number" || typeof r.score !== "number") return null;
    if (r.lives <= 0) return null;
    return { level: r.level, lives: r.lives, score: r.score };
  } catch {
    return null;
  }
}

export function saveRun(run: Run) {
  try {
    localStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* modo privado: sin guardado */
  }
}

export function clearRun() {
  try {
    localStorage.removeItem(RUN_KEY);
  } catch {
    /* modo privado: sin guardado */
  }
}
