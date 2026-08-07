import Phaser from "phaser";
import { WIDTH, HEIGHT } from "./levels";
import { sfx } from "./audio";
import type { GameScene } from "./GameScene";

/**
 * Menu de pausa. Va en su propia escena porque una escena pausada no procesa
 * input ni avanza su reloj: asi los fusibles de las minas no corren mientras
 * el menu esta abierto.
 */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super("pause");
  }

  create() {
    this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x0b0b12, 0.78);
    this.add
      .text(WIDTH / 2, 118, "PAUSA", {
        fontFamily: "monospace",
        fontSize: "54px",
        color: "#ffffff",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    const game = this.scene.get("game") as GameScene;
    this.button(WIDTH / 2, 232, "REANUDAR", 0x4fc07a, () => game.resumeFromMenu());
    this.button(WIDTH / 2, 320, "REINICIAR NIVEL", 0xffd166, () => game.restartFromMenu());
    this.button(WIDTH / 2, 408, "SALIR AL MENÚ", 0xff6b6b, () => game.quitFromMenu());

    this.input.keyboard!.on("keydown-ESC", () => game.resumeFromMenu());
    this.input.keyboard!.on("keydown-P", () => game.resumeFromMenu());
  }

  private button(x: number, y: number, label: string, color: number, onClick: () => void) {
    const box = this.add.rectangle(x, y, 320, 66, color, 0.18).setStrokeStyle(3, color, 0.8);
    this.add
      .text(x, y, label, { fontFamily: "monospace", fontSize: "24px", color: "#ffffff" })
      .setOrigin(0.5);
    box.setInteractive({ useHandCursor: true });
    box.on("pointerover", () => box.setFillStyle(color, 0.32));
    box.on("pointerout", () => box.setFillStyle(color, 0.18));
    box.on("pointerdown", () => {
      sfx.unlock();
      box.setFillStyle(color, 0.5);
      this.time.delayedCall(90, onClick);
    });
  }
}
