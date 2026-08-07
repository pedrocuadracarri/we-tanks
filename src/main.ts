import Phaser from "phaser";
import { GameScene } from "./GameScene";
import { TitleScene } from "./TitleScene";
import { PauseScene } from "./PauseScene";
import { WIDTH, HEIGHT } from "./levels";

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: "#1a1a1f",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  scene: [TitleScene, GameScene, PauseScene],
});

// util para depurar desde la consola del navegador
(window as unknown as { game: Phaser.Game }).game = game;

// PWA: instalable y jugable sin conexion. En dev estorba, asi que solo en produccion.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .catch(() => {
        /* sin service worker se juega igual, solo que sin offline */
      });
  });
}
