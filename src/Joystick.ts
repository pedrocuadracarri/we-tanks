import Phaser from "phaser";

const RADIUS = 60;

/**
 * Joystick virtual: aparece donde tocas dentro de su zona y devuelve
 * un vector normalizado con la direccion arrastrada.
 */
export class Joystick {
  pointerId = -1;
  vec = new Phaser.Math.Vector2(0, 0);

  private base: Phaser.GameObjects.Arc;
  private knob: Phaser.GameObjects.Arc;
  private origin = new Phaser.Math.Vector2(0, 0);

  constructor(scene: Phaser.Scene, color: number) {
    this.base = scene.add.circle(0, 0, RADIUS, color, 0.12).setScrollFactor(0).setDepth(100).setVisible(false);
    this.base.setStrokeStyle(3, color, 0.35);
    this.knob = scene.add.circle(0, 0, 26, color, 0.45).setScrollFactor(0).setDepth(101).setVisible(false);
  }

  get active() {
    return this.pointerId !== -1;
  }

  start(pointer: Phaser.Input.Pointer) {
    this.pointerId = pointer.id;
    this.origin.set(pointer.worldX, pointer.worldY);
    this.base.setPosition(this.origin.x, this.origin.y).setVisible(true);
    this.knob.setPosition(this.origin.x, this.origin.y).setVisible(true);
    this.vec.set(0, 0);
  }

  move(pointer: Phaser.Input.Pointer) {
    if (pointer.id !== this.pointerId) return;
    const dx = pointer.worldX - this.origin.x;
    const dy = pointer.worldY - this.origin.y;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, RADIUS);
    if (len > 0.001) {
      this.vec.set(dx / len, dy / len).scale(clamped / RADIUS);
      this.knob.setPosition(this.origin.x + (dx / len) * clamped, this.origin.y + (dy / len) * clamped);
    }
  }

  stop(pointer: Phaser.Input.Pointer) {
    if (pointer.id !== this.pointerId) return;
    this.pointerId = -1;
    this.vec.set(0, 0);
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }

  reset() {
    this.pointerId = -1;
    this.vec.set(0, 0);
    this.base.setVisible(false);
    this.knob.setVisible(false);
  }
}
