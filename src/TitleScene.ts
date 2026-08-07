import Phaser from "phaser";
import { WIDTH, HEIGHT, LEVELS } from "./levels";
import { applyBackdrop, THEMES } from "./theme";
import { loadProgress, loadRun, clearRun } from "./progress";
import { sfx } from "./audio";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  preload() {
    // unico asset del juego: el resto de texturas se generan en runtime
    this.load.image("logo", `${import.meta.env.BASE_URL}logo.png`);
  }

  create() {
    applyBackdrop(this, THEMES[0]).setDepth(1); // la viñeta va bajo los textos

    if (this.textures.exists("logo")) {
      this.add.image(WIDTH / 2, 122, "logo").setDisplaySize(212, 212);
    } else {
      this.add
        .text(WIDTH / 2, 96, "WE TANKS", {
          fontFamily: "monospace",
          fontSize: "72px",
          color: "#ffffff",
          fontStyle: "bold",
        })
        .setOrigin(0.5);
    }
    this.add
      .text(WIDTH / 2, 248, `${LEVELS.length} niveles · 7 tipos de tanque enemigo`, {
        fontFamily: "monospace",
        fontSize: "18px",
        color: "#c8c0ac",
      })
      .setOrigin(0.5);

    const p = loadProgress();
    const run = loadRun();
    const canContinue = !run && p.bestLevel > 0 && p.bestLevel < LEVELS.length;
    const second = run || canContinue;

    this.button(WIDTH / 2 - (second ? 150 : 0), 316, "JUGAR", 0x3f8fdf, () => {
      clearRun();
      this.start(0);
    });
    if (run) {
      this.button(
        WIDTH / 2 + 150,
        316,
        `REANUDAR\nnivel ${run.level + 1} · ${"♥".repeat(run.lives)}`,
        0x4fc07a,
        () => this.start(run.level, run.lives, run.score)
      );
    } else if (canContinue) {
      this.button(WIDTH / 2 + 150, 316, `CONTINUAR\nnivel ${p.bestLevel + 1}`, 0x4fc07a, () =>
        this.start(p.bestLevel)
      );
    }

    if (p.bestLevel > 0) {
      this.add
        .text(WIDTH / 2, 394, `Récord: nivel ${p.bestLevel} · ${p.bestScore} puntos`, {
          fontFamily: "monospace",
          fontSize: "18px",
          color: "#ffd166",
        })
        .setOrigin(0.5);
    }

    this.add
      .text(
        WIDTH / 2,
        HEIGHT - 78,
        "MÓVIL: joystick izquierdo mueve · joystick derecho apunta y dispara · botón rojo pone mina\n" +
          "PC: WASD mueve · arrastra el ratón por la mitad derecha para apuntar · E pone mina",
        { fontFamily: "monospace", fontSize: "16px", color: "#9a9aa8", align: "center", lineSpacing: 6 }
      )
      .setOrigin(0.5);

    const mute = this.add
      .text(WIDTH - 14, 12, sfx.muted ? "♪ OFF" : "♪ ON", {
        fontFamily: "monospace",
        fontSize: "16px",
        color: "#9a9aa8",
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true });
    mute.on("pointerdown", () => {
      sfx.unlock();
      mute.setText(sfx.toggleMute() ? "♪ OFF" : "♪ ON");
    });

    this.input.on("pointerdown", () => sfx.unlock());
  }

  private button(x: number, y: number, label: string, color: number, onClick: () => void) {
    const box = this.add.rectangle(x, y, 260, 78, color, 0.18).setStrokeStyle(3, color, 0.8);
    const text = this.add
      .text(x, y, label, { fontFamily: "monospace", fontSize: "26px", color: "#ffffff", align: "center" })
      .setOrigin(0.5);
    box.setInteractive({ useHandCursor: true });
    box.on("pointerover", () => box.setFillStyle(color, 0.32));
    box.on("pointerout", () => box.setFillStyle(color, 0.18));
    box.on("pointerdown", () => {
      sfx.unlock();
      box.setFillStyle(color, 0.5);
      this.time.delayedCall(90, onClick);
    });
    return { box, text };
  }

  private start(level: number, lives?: number, score?: number) {
    this.scene.start("game", { level, lives, score });
  }
}
