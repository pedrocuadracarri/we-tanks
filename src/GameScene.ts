import Phaser from "phaser";
import { Joystick } from "./Joystick";
import { CELL, COLS, ROWS, WIDTH, HEIGHT, LEVELS } from "./levels";
import {
  PLAYER,
  ENEMY_TYPES,
  TankType,
  PLAYER_MAX_BULLETS,
  PLAYER_MAX_MINES,
  ENEMY_MAX_BULLETS,
  ENEMY_MAX_MINES,
  MINE_ARM_MS,
  MINE_FUSE_MS,
  MINE_TRIGGER_RADIUS,
  MINE_BLAST_RADIUS,
  START_LIVES,
  EXTRA_LIFE_EVERY,
} from "./config";
import { sfx, vibrate } from "./audio";
import { saveProgress, saveRun, clearRun } from "./progress";
import { Theme, themeForLevel, makeWallTextures, applyBackdrop, scatterDecals } from "./theme";

type Tank = Phaser.Physics.Arcade.Image & {
  cfg: TankType;
  turret: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  isPlayer: boolean;
  nextBank: number;
  aim: number;
  nextShot: number;
  nextMine: number;
  moveDir: number;
  nextTurn: number;
  lastTrack: number;
  revealUntil: number;
};

type Bullet = Phaser.Physics.Arcade.Image & {
  owner: Tank;
  bounces: number;
  maxBounces: number;
  armedAt: number;
};

type Mine = Phaser.Physics.Arcade.Image & {
  owner: Tank;
  armAt: number;
  fuseAt: number;
  nextBeep: number;
  detonating: boolean;
};

const MINE_COOLDOWN = 900;
const TRACK_MS = 110;

export class GameScene extends Phaser.Scene {
  private level = 0;
  private lives = START_LIVES;
  private score = 0;
  private state: "playing" | "dead" | "won" | "gameover" = "playing";
  private acceptInputAt = 0;

  private steel!: Phaser.Physics.Arcade.StaticGroup;
  private corks!: Phaser.Physics.Arcade.StaticGroup;
  private tanks!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private mines!: Phaser.Physics.Arcade.Group;

  private theme!: Theme;
  private steelRects: Phaser.Geom.Rectangle[] = [];
  private grid: boolean[][] = []; // true = celda bloqueada (acero o corcho)
  private player!: Tank;
  private enemies: Tank[] = [];
  private aimLine!: Phaser.GameObjects.Graphics;
  private flash!: Phaser.GameObjects.Rectangle;
  private bankShotBudget = 0; // como mucho una busqueda de rebote por frame

  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private debris!: Phaser.GameObjects.Particles.ParticleEmitter;

  private moveStick!: Joystick;
  private aimStick!: Joystick;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private mineButton!: Phaser.GameObjects.Container;
  private mineButtonHeld = false;

  private hudLeft!: Phaser.GameObjects.Text;
  private hudRight!: Phaser.GameObjects.Text;
  private muteBtn!: Phaser.GameObjects.Text;
  private pauseBtn!: Phaser.GameObjects.Text;
  private hudAmmo!: Phaser.GameObjects.Text;
  private shownAmmo = -1;
  private hint: Phaser.GameObjects.Text | null = null;
  private message!: Phaser.GameObjects.Text;

  constructor() {
    super("game");
  }

  init(data: { level?: number; lives?: number; score?: number }) {
    this.level = data.level ?? 0;
    this.lives = data.lives ?? START_LIVES;
    this.score = data.score ?? 0;
  }

  create() {
    this.theme = themeForLevel(this.level);
    this.makeTextures();
    makeWallTextures(this, this.theme);
    this.state = "playing";
    this.enemies = [];
    this.steelRects = [];
    this.mineButtonHeld = false;
    this.grid = Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false));

    this.physics.world.setBounds(0, 0, WIDTH, HEIGHT);
    applyBackdrop(this, this.theme);

    this.steel = this.physics.add.staticGroup();
    this.corks = this.physics.add.staticGroup();
    this.tanks = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.mines = this.physics.add.group();

    this.trail = this.add
      .particles(0, 0, "spark", {
        lifespan: 200,
        scale: { start: 0.6, end: 0 },
        alpha: { start: 0.45, end: 0 },
        speed: 0,
        emitting: false,
      })
      .setDepth(19);
    this.debris = this.add
      .particles(0, 0, "spark", {
        lifespan: { min: 250, max: 600 },
        scale: { start: 1.4, end: 0 },
        speed: { min: 40, max: 220 },
        angle: { min: 0, max: 360 },
        alpha: { start: 1, end: 0 },
        tint: [0xffd166, 0xff8c2b, 0xff5a3c],
        emitting: false,
      })
      .setDepth(26);

    this.buildLevel();
    scatterDecals(this, this.theme, (r, c) => !this.grid[r][c]);

    this.physics.add.collider(this.tanks, this.steel);
    this.physics.add.collider(this.tanks, this.corks);
    this.physics.add.collider(this.tanks, this.tanks);
    this.physics.add.collider(this.bullets, this.steel, this.onBulletHitWall, undefined, this);
    this.physics.add.collider(this.bullets, this.corks, this.onBulletHitWall, undefined, this);
    this.physics.add.overlap(this.bullets, this.tanks, this.onBulletHitTank, undefined, this);
    const world = this.physics.world; // en shutdown this.physics.world ya es null
    world.on("worldbounds", this.onBulletHitWorldBounds, this);
    this.events.once("shutdown", () => world.off("worldbounds", this.onBulletHitWorldBounds, this));

    this.setupInput();
    this.setupHud();
    saveRun({ level: this.level, lives: this.lives, score: this.score });
  }

  // ---------------- texturas ----------------

  private makeTextures() {
    if (this.textures.exists("bullet")) return;
    const g = this.add.graphics();

    const tank = (t: TankType) => {
      g.fillStyle(0x0e0e14).fillRect(0, 0, 36, 30); // contorno: los separa del suelo
      g.fillStyle(t.dark).fillRect(1, 1, 34, 28);
      g.fillStyle(0x000000, 0.32).fillRect(1, 1, 34, 6); // orugas
      g.fillStyle(0x000000, 0.32).fillRect(1, 23, 34, 6);
      g.fillStyle(t.light).fillRect(5, 8, 26, 14); // cubierta
      g.fillStyle(t.dark).fillRect(27, 11, 9, 8); // morro
      g.generateTexture(`body_${t.key}`, 36, 30);
      g.clear();

      g.fillStyle(0x0e0e14).fillCircle(7, 7, 8);
      g.fillStyle(0x0e0e14).fillRect(7, 3, 25, 9);
      g.fillStyle(t.barrel).fillCircle(7, 7, 6);
      g.fillStyle(t.barrel).fillRect(7, 5, 23, 5);
      g.generateTexture(`turret_${t.key}`, 32, 14);
      g.clear();
    };
    tank(PLAYER);
    Object.values(ENEMY_TYPES).forEach(tank);

    g.fillStyle(0x1c1c22).fillRect(0, 0, 26, 7).fillRect(0, 17, 26, 7);
    g.generateTexture("track", 26, 24);
    g.clear();

    g.fillStyle(0x000000).fillEllipse(22, 16, 40, 28);
    g.generateTexture("shadow", 44, 32);
    g.clear();

    g.fillStyle(0xf5e7b0).fillCircle(5, 5, 5);
    g.generateTexture("bullet", 10, 10);
    g.clear();

    g.fillStyle(0xffffff).fillCircle(4, 4, 4);
    g.generateTexture("spark", 8, 8);
    g.clear();

    g.fillStyle(0x33333c).fillCircle(11, 11, 11);
    g.fillStyle(0x55555f).fillCircle(11, 11, 7);
    g.fillStyle(0xff4444).fillCircle(11, 11, 3);
    g.generateTexture("mine", 22, 22);
    g.destroy();
  }

  // ---------------- nivel ----------------

  private buildLevel() {
    const layout = LEVELS[this.level];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = layout[r][c];
        const x = c * CELL + CELL / 2;
        const y = r * CELL + CELL / 2;

        if (ch === "#") {
          this.wallShadow(x, y);
          this.steel.create(x, y, `wall_${this.theme.key}`).setDepth(5);
          this.steelRects.push(new Phaser.Geom.Rectangle(x - CELL / 2, y - CELL / 2, CELL, CELL));
          this.grid[r][c] = true;
        } else if (ch === "o") {
          this.wallShadow(x, y);
          const cork = this.corks.create(x, y, `cork_${this.theme.key}`) as Phaser.Physics.Arcade.Image;
          cork.setDepth(5).setData("cell", { r, c });
          this.grid[r][c] = true;
        } else if (ch === "P") {
          this.player = this.spawnTank(x, y, PLAYER, true);
        } else if (ENEMY_TYPES[ch]) {
          this.enemies.push(this.spawnTank(x, y, ENEMY_TYPES[ch], false));
        }
      }
    }
  }

  private wallShadow(x: number, y: number) {
    this.add.rectangle(x + 5, y + 5, CELL, CELL, 0x000000, 0.3).setDepth(4);
  }

  /** true si el punto cae fuera del mundo o dentro de un muro. */
  private solidAt(x: number, y: number) {
    if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) return true;
    return this.grid[Math.floor(y / CELL)][Math.floor(x / CELL)];
  }

  /**
   * Traza la trayectoria de una bala con rebotes por pasos discretos.
   * Devuelve los vertices del camino y, si se pasa `target`, si lo alcanza.
   */
  private castRay(
    ox: number,
    oy: number,
    angle: number,
    maxBounces: number,
    maxDist: number,
    target?: Tank,
    STEP = 5
  ): { points: Phaser.Types.Math.Vector2Like[]; hitsTarget: boolean; minDist: number } {
    let minDist = Infinity;
    let x = ox;
    let y = oy;
    let dx = Math.cos(angle);
    let dy = Math.sin(angle);
    let bounces = 0;
    let dist = 0;
    const points: Phaser.Types.Math.Vector2Like[] = [{ x, y }];

    while (dist < maxDist) {
      const nx = x + dx * STEP;
      const ny = y + dy * STEP;

      if (this.solidAt(nx, ny)) {
        if (bounces >= maxBounces) break;
        // que eje provoco el choque decide como rebota
        const blockedX = this.solidAt(nx, y);
        const blockedY = this.solidAt(x, ny);
        if (blockedX && !blockedY) dx = -dx;
        else if (blockedY && !blockedX) dy = -dy;
        else {
          dx = -dx;
          dy = -dy;
        }
        bounces++;
        points.push({ x, y });
        continue;
      }

      x = nx;
      y = ny;
      dist += STEP;
      if (target && dist > 34) {
        const d = Phaser.Math.Distance.Between(x, y, target.x, target.y);
        if (d < minDist) minDist = d;
        if (d < 17) {
          points.push({ x, y });
          return { points, hitsTarget: true, minDist };
        }
      }
    }
    points.push({ x, y });
    return { points, hitsTarget: false, minDist };
  }

  private spawnTank(x: number, y: number, cfg: TankType, isPlayer: boolean): Tank {
    // crear DENTRO del grupo: group.add() reaplicaria los defaults del grupo al body
    const tank = this.tanks.create(x, y, `body_${cfg.key}`) as Tank;
    tank.setCollideWorldBounds(true);
    tank.setCircle(13, 5, 2);
    tank.setDepth(10);
    tank.cfg = cfg;
    tank.isPlayer = isPlayer;
    tank.aim = isPlayer ? 0 : Math.PI;
    tank.rotation = tank.aim;
    tank.nextShot = this.time.now + (isPlayer ? 0 : 1500);
    tank.nextMine = isPlayer ? 0 : this.time.now + Phaser.Math.Between(3000, 7000);
    tank.moveDir = Phaser.Math.FloatBetween(0, Math.PI * 2);
    tank.nextTurn = 0;
    tank.lastTrack = 0;
    tank.revealUntil = 0;
    tank.nextBank = 0;

    tank.shadow = this.add.image(x, y, "shadow").setAlpha(0.3).setDepth(9);
    tank.turret = this.add.image(x, y, `turret_${cfg.key}`).setOrigin(7 / 32, 0.5).setDepth(11);
    tank.turret.rotation = tank.aim;
    if (cfg.invisible) {
      tank.setAlpha(0.12);
      tank.turret.setAlpha(0.12);
      tank.shadow.setAlpha(0.04);
    }
    return tank;
  }

  // ---------------- input ----------------

  private setupInput() {
    this.input.addPointer(3);
    this.moveStick = new Joystick(this, 0x7fd4ff);
    this.aimStick = new Joystick(this, 0xffd166);
    this.buildMineButton();

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      sfx.unlock();
      if (this.hitsMuteButton(p)) {
        this.muteBtn.setText(sfx.toggleMute() ? "♪ OFF" : "♪ ON");
        return;
      }
      if (this.state === "playing" && this.hitsButton(p, this.pauseBtn)) {
        this.pauseGame();
        return;
      }
      if (this.state !== "playing") {
        if (this.time.now >= this.acceptInputAt) this.advance();
        return;
      }
      if (this.hitsMineButton(p)) {
        this.mineButtonHeld = true;
        this.dropMine(this.player);
        return;
      }
      if (p.worldX < WIDTH / 2) {
        if (!this.moveStick.active) this.moveStick.start(p);
      } else if (!this.aimStick.active) {
        this.aimStick.start(p);
      }
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      this.moveStick.move(p);
      this.aimStick.move(p);
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      // se dispara al SOLTAR: asi puedes apuntar con calma sin gastar balas
      if (this.state === "playing" && p.id === this.aimStick.pointerId) {
        if (this.aimStick.vec.length() > 0.2) {
          this.player.aim = Math.atan2(this.aimStick.vec.y, this.aimStick.vec.x);
        }
        this.tryShoot(this.player, this.time.now);
      }
      this.moveStick.stop(p);
      this.aimStick.stop(p);
      this.mineButtonHeld = false;
    });

    this.aimLine = this.add.graphics().setDepth(18);
    this.flash = this.add
      .rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0xffffff, 0)
      .setDepth(199);

    this.keys = this.input.keyboard!.addKeys("W,A,S,D,UP,LEFT,DOWN,RIGHT,SPACE,E,ESC,P") as Record<
      string,
      Phaser.Input.Keyboard.Key
    >;
    this.keys.E.on("down", () => this.state === "playing" && this.dropMine(this.player));
    this.keys.SPACE.on("down", () => this.state === "playing" && this.tryShoot(this.player, this.time.now));
    this.keys.ESC.on("down", () => this.pauseGame());
    this.keys.P.on("down", () => this.pauseGame());

    // si el movil cambia de app, pausar: volver muerto no es divertido
    const autoPause = () => this.pauseGame();
    this.game.events.on(Phaser.Core.Events.BLUR, autoPause);
    this.game.events.on(Phaser.Core.Events.HIDDEN, autoPause);
    this.events.once("shutdown", () => {
      this.game.events.off(Phaser.Core.Events.BLUR, autoPause);
      this.game.events.off(Phaser.Core.Events.HIDDEN, autoPause);
    });
  }

  // ---------------- pausa ----------------

  pauseGame() {
    if (this.state !== "playing" || this.scene.isPaused()) return;
    this.moveStick.reset();
    this.aimStick.reset();
    this.mineButtonHeld = false;
    for (const t of this.allTanks()) t.setVelocity(0, 0);
    this.scene.launch("pause");
    this.scene.pause();
  }

  resumeFromMenu() {
    this.scene.stop("pause");
    this.scene.resume();
  }

  restartFromMenu() {
    this.scene.stop("pause");
    this.scene.resume();
    this.scene.restart({ level: this.level, lives: this.lives, score: this.score });
  }

  quitFromMenu() {
    this.scene.stop("pause");
    this.scene.resume();
    this.scene.start("title");
  }

  /** Linea de mira: tramo recto hasta el muro y tramo tenue tras el primer rebote. */
  private drawAim() {
    this.aimLine.clear();
    if (this.state !== "playing" || !this.player.active) return;
    if (!this.aimStick.active || this.aimStick.vec.length() <= 0.2) return;

    const angle = this.player.aim;
    const { points } = this.castRay(
      this.player.x + Math.cos(angle) * 26,
      this.player.y + Math.sin(angle) * 26,
      angle,
      PLAYER.bounces,
      620
    );
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      this.aimLine.lineStyle(i === 0 ? 3 : 2, 0xffd166, i === 0 ? 0.55 : 0.25);
      this.aimLine.lineBetween(a.x!, a.y!, b.x!, b.y!);
    }
    const end = points[points.length - 1];
    this.aimLine.fillStyle(0xffd166, 0.5).fillCircle(end.x!, end.y!, 4);
  }

  private buildMineButton() {
    const circle = this.add.circle(0, 0, 38, 0xff6b6b, 0.18).setStrokeStyle(3, 0xff6b6b, 0.5);
    const icon = this.add.image(0, -6, "mine").setScale(1.1);
    const label = this.add.text(0, 18, "", {
      fontFamily: "monospace",
      fontSize: "15px",
      color: "#ffb3b3",
    });
    label.setOrigin(0.5);
    this.mineButton = this.add.container(WIDTH - 62, HEIGHT - 62, [circle, icon, label]).setDepth(150);
    this.mineButton.setData("label", label);
  }

  private hitsMineButton(p: Phaser.Input.Pointer) {
    return Phaser.Math.Distance.Between(p.worldX, p.worldY, this.mineButton.x, this.mineButton.y) <= 44;
  }

  private hitsMuteButton(p: Phaser.Input.Pointer) {
    return this.hitsButton(p, this.muteBtn);
  }

  /** Los botones del HUD son texto suelto: area tactil con margen para el dedo. */
  private hitsButton(p: Phaser.Input.Pointer, btn: Phaser.GameObjects.Text) {
    const b = Phaser.Geom.Rectangle.Inflate(Phaser.Geom.Rectangle.Clone(btn.getBounds()), 14, 10);
    return Phaser.Geom.Rectangle.Contains(b, p.worldX, p.worldY);
  }

  private setupHud() {
    const style = { fontFamily: "monospace", fontSize: "19px", color: "#e8e8ef" };
    this.hudLeft = this.add.text(12, 10, "", style).setDepth(200);
    this.hudRight = this.add.text(WIDTH - 12, 10, "", style).setOrigin(1, 0).setDepth(200);
    this.muteBtn = this.add
      .text(WIDTH - 12, 34, sfx.muted ? "♪ OFF" : "♪ ON", { ...style, fontSize: "16px", color: "#9a9aa8" })
      .setOrigin(1, 0)
      .setDepth(200);
    this.pauseBtn = this.add
      .text(WIDTH / 2, 10, "❚❚ PAUSA", { ...style, fontSize: "17px", color: "#9a9aa8" })
      .setOrigin(0.5, 0)
      .setDepth(200);
    this.hudAmmo = this.add
      .text(12, 34, "", { ...style, fontSize: "17px", color: "#f5e7b0" })
      .setDepth(200);
    if (this.level === 0) {
      this.hint = this.add
        .text(WIDTH / 2, HEIGHT - 34, "Apunta arrastrando en la mitad derecha · suelta para disparar", {
          fontFamily: "monospace",
          fontSize: "17px",
          color: "#ffffff",
          backgroundColor: "#000000aa",
          padding: { x: 12, y: 7 },
        })
        .setOrigin(0.5)
        .setDepth(200);
    }
    this.message = this.add
      .text(WIDTH / 2, HEIGHT / 2, "", {
        fontFamily: "monospace",
        fontSize: "30px",
        color: "#ffffff",
        align: "center",
        backgroundColor: "#000000cc",
        padding: { x: 24, y: 18 },
      })
      .setOrigin(0.5)
      .setDepth(200)
      .setVisible(false);
    this.updateHud();
  }

  private updateHud() {
    this.hudLeft.setText(`NIVEL ${this.level + 1}/${LEVELS.length}   ENEMIGOS ${this.enemies.length}`);
    this.hudRight.setText(`${"♥".repeat(Math.max(this.lives, 0))}   ${this.score}`);
    const label = this.mineButton.getData("label") as Phaser.GameObjects.Text;
    label.setText(`${PLAYER_MAX_MINES - this.countMines(this.player)}`);
  }

  /** Balas libres. Sin esto llegas al tope de 5 en pantalla y no sabes por qué no dispara. */
  private updateAmmo() {
    const free = PLAYER_MAX_BULLETS - this.countBullets(this.player);
    if (free === this.shownAmmo) return; // setText re-renderiza la textura: solo al cambiar
    this.shownAmmo = free;
    this.hudAmmo.setText(`BALAS ${"●".repeat(free)}${"○".repeat(PLAYER_MAX_BULLETS - free)}`);
  }

  // ---------------- bucle ----------------

  update(time: number, delta: number) {
    this.bankShotBudget = 1;
    if (this.state === "playing") {
      this.updatePlayer(time);
      for (const e of this.enemies) this.updateEnemy(e, time, delta);
      this.updateMines(time);
      if (this.mineButtonHeld) this.dropMine(this.player);
    }

    for (const t of this.allTanks()) {
      t.turret.setPosition(t.x, t.y);
      t.turret.rotation = t.aim;
      t.shadow.setPosition(t.x + 4, t.y + 5);
      t.shadow.rotation = t.rotation;
      this.leaveTracks(t, time);
      if (t.cfg.invisible) this.updateStealth(t, time);
    }
    for (const b of this.bullets.getChildren() as Bullet[]) {
      if (b.active) this.trail.emitParticleAt(b.x, b.y);
    }
    this.drawAim();
    this.updateAmmo();
    if (this.flash.alpha > 0) this.flash.setAlpha(Math.max(0, this.flash.alpha - delta / 180));
  }

  private allTanks(): Tank[] {
    const list = this.enemies.filter((t) => t.active);
    if (this.player && this.player.active) list.push(this.player);
    return list;
  }

  private leaveTracks(t: Tank, time: number) {
    const body = t.body as Phaser.Physics.Arcade.Body;
    if (time - t.lastTrack < TRACK_MS || body.velocity.lengthSq() < 100) return;
    t.lastTrack = time;
    const mark = this.add.image(t.x, t.y, "track").setRotation(t.rotation).setDepth(1).setAlpha(0.32);
    this.tweens.add({
      targets: mark,
      alpha: 0,
      duration: 3200,
      ease: "Quad.easeIn",
      onComplete: () => mark.destroy(),
    });
  }

  private updateStealth(t: Tank, time: number) {
    const near = this.player.active && Phaser.Math.Distance.Between(t.x, t.y, this.player.x, this.player.y) < 110;
    const target = time < t.revealUntil || near ? 1 : 0.12;
    const a = Phaser.Math.Linear(t.alpha, target, 0.12);
    t.setAlpha(a);
    t.turret.setAlpha(a);
    t.shadow.setAlpha(a * 0.3);
  }

  private updatePlayer(time: number) {
    if (!this.player.active) return;

    let vx = this.moveStick.vec.x;
    let vy = this.moveStick.vec.y;
    const k = this.keys;
    if (k.A.isDown || k.LEFT.isDown) vx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) vx += 1;
    if (k.W.isDown || k.UP.isDown) vy -= 1;
    if (k.S.isDown || k.DOWN.isDown) vy += 1;

    const len = Math.hypot(vx, vy);
    if (len > 1) {
      vx /= len;
      vy /= len;
    }
    this.player.setVelocity(vx * PLAYER.speed, vy * PLAYER.speed);
    if (len > 0.15) {
      this.player.rotation = Phaser.Math.Angle.RotateTo(this.player.rotation, Math.atan2(vy, vx), 0.25);
    }

    // apuntar es continuo; el disparo va en el pointerup / tecla espacio
    if (this.aimStick.active && this.aimStick.vec.length() > 0.2) {
      this.player.aim = Math.atan2(this.aimStick.vec.y, this.aimStick.vec.x);
    }
  }

  private updateEnemy(tank: Tank, time: number, delta: number) {
    if (!tank.active) return;
    const cfg = tank.cfg;

    if (this.player.active) {
      const target = Phaser.Math.Angle.Between(tank.x, tank.y, this.aimPointX(tank), this.aimPointY(tank));
      tank.aim = Phaser.Math.Angle.RotateTo(tank.aim, target, cfg.aimSpeed * (delta / 16.6));
    }

    if (cfg.speed > 0) {
      const body = tank.body as Phaser.Physics.Arcade.Body;
      const stuck = body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down;
      const flee = this.nearestArmedMine(tank);

      if (flee) {
        tank.moveDir = Phaser.Math.Angle.Between(flee.x, flee.y, tank.x, tank.y);
        tank.nextTurn = time + 500;
      } else if (time > tank.nextTurn || stuck) {
        tank.moveDir = this.pickDirection(tank);
        tank.nextTurn = time + Phaser.Math.Between(900, 2200);
      }
      tank.setVelocity(Math.cos(tank.moveDir) * cfg.speed, Math.sin(tank.moveDir) * cfg.speed);
      tank.rotation = Phaser.Math.Angle.RotateTo(tank.rotation, tank.moveDir, 0.1);

      if (cfg.mines && time > tank.nextMine) {
        tank.nextMine = time + Phaser.Math.Between(4000, 8000);
        this.dropMine(tank);
      }
    }

    if (!this.player.active || time < tank.nextShot) return;

    if (this.hasLineOfSight(tank, this.player)) {
      this.tryShoot(tank, time);
    } else if (cfg.bankShot && time > tank.nextBank && this.bankShotBudget > 0) {
      // sin linea directa: buscar un tiro que llegue rebotando
      tank.nextBank = time + 500;
      this.bankShotBudget--;
      const angle = this.findBankShot(tank);
      if (angle !== null) {
        tank.aim = angle;
        this.tryShoot(tank, time);
      }
    }
  }

  /** Punto al que apunta la IA: adelanta el disparo segun tu velocidad. */
  private aimPointX(tank: Tank) {
    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    if (!body || tank.cfg.lead === 0) return this.player.x;
    const t = Phaser.Math.Distance.Between(tank.x, tank.y, this.player.x, this.player.y) / tank.cfg.bulletSpeed;
    return this.player.x + body.velocity.x * t * tank.cfg.lead;
  }

  private aimPointY(tank: Tank) {
    const body = this.player.body as Phaser.Physics.Arcade.Body | null;
    if (!body || tank.cfg.lead === 0) return this.player.y;
    const t = Phaser.Math.Distance.Between(tank.x, tank.y, this.player.x, this.player.y) / tank.cfg.bulletSpeed;
    return this.player.y + body.velocity.y * t * tank.cfg.lead;
  }

  /**
   * Busca un angulo cuya trayectoria con rebotes alcance al jugador.
   * Barrido grueso + refinado: acertar un blanco de 17px a 800px pide ~1 grado
   * de resolucion, y lanzar 360 rayos por frame no es viable.
   */
  private findBankShot(tank: Tank): number | null {
    // el barrido grueso va a pasos largos (mas barato); el refinado, fino
    const shoot = (angle: number, step: number) => {
      const ox = tank.x + Math.cos(angle) * 26;
      const oy = tank.y + Math.sin(angle) * 26;
      if (this.solidAt(ox, oy)) return null;
      return this.castRay(ox, oy, angle, tank.cfg.bounces, 1200, this.player, step);
    };

    const COARSE = 20;
    let step = (Math.PI * 2) / COARSE;
    let best = 0;
    let bestDist = Infinity;
    const offset = Phaser.Math.FloatBetween(0, step); // desfase: no probar siempre los mismos angulos
    for (let i = 0; i < COARSE; i++) {
      const angle = offset + i * step;
      const r = shoot(angle, 11);
      if (!r) continue;
      if (r.hitsTarget) return angle;
      if (r.minDist < bestDist) {
        bestDist = r.minDist;
        best = angle;
      }
    }
    if (bestDist > 220) return null; // ni de lejos: no gastar mas tiempo

    for (let pass = 0; pass < 2; pass++) {
      step /= 6;
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const angle = best + i * step;
        const r = shoot(angle, 5);
        if (!r) continue;
        if (r.hitsTarget) return angle;
        if (r.minDist < bestDist) {
          bestDist = r.minDist;
          best = angle;
        }
      }
    }
    return null;
  }

  /** Elige rumbo mirando cuanto espacio libre hay: nada de girar al azar contra la pared. */
  private pickDirection(tank: Tank) {
    let best = tank.moveDir;
    let bestScore = -1;
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4 + Phaser.Math.FloatBetween(-0.2, 0.2);
      let dist = 0;
      while (dist < 160 && !this.solidAt(tank.x + Math.cos(angle) * dist, tank.y + Math.sin(angle) * dist)) {
        dist += 16;
      }
      const score = dist * Phaser.Math.FloatBetween(0.7, 1.3); // algo de azar para que no sean robots
      if (score > bestScore) {
        bestScore = score;
        best = angle;
      }
    }
    return best;
  }

  private nearestArmedMine(tank: Tank): Mine | null {
    for (const m of this.mines.getChildren() as Mine[]) {
      if (!m.active) continue;
      if (Phaser.Math.Distance.Between(m.x, m.y, tank.x, tank.y) < MINE_BLAST_RADIUS + 30) return m;
    }
    return null;
  }

  private hasLineOfSight(from: Tank, to: Tank) {
    const line = new Phaser.Geom.Line(from.x, from.y, to.x, to.y);
    for (const rect of this.steelRects) {
      if (Phaser.Geom.Intersects.LineToRectangle(line, rect)) return false;
    }
    for (const c of this.corks.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!c.active) continue;
      const r = new Phaser.Geom.Rectangle(c.x - CELL / 2, c.y - CELL / 2, CELL, CELL);
      if (Phaser.Geom.Intersects.LineToRectangle(line, r)) return false;
    }
    return true;
  }

  // ---------------- disparos ----------------

  private tryShoot(tank: Tank, time: number) {
    const cfg = tank.cfg;
    if (time < tank.nextShot) return;
    const max = tank.isPlayer ? PLAYER_MAX_BULLETS : ENEMY_MAX_BULLETS;
    if (this.countBullets(tank) >= max) return;
    tank.nextShot = time + cfg.cooldown;
    tank.revealUntil = time + 700;

    const angle = tank.aim + Phaser.Math.FloatBetween(-cfg.spread, cfg.spread);
    const bullet = this.bullets.create(
      tank.x + Math.cos(angle) * 26,
      tank.y + Math.sin(angle) * 26,
      "bullet"
    ) as Bullet;
    bullet.setCircle(5);
    bullet.setBounce(1, 1);
    bullet.setCollideWorldBounds(true);
    (bullet.body as Phaser.Physics.Arcade.Body).onWorldBounds = true;
    bullet.setVelocity(Math.cos(angle) * cfg.bulletSpeed, Math.sin(angle) * cfg.bulletSpeed);
    bullet.setDepth(20);
    bullet.setTint(cfg.bounces > 1 ? 0xff9f5b : 0xf5e7b0);
    bullet.owner = tank;
    bullet.bounces = 0;
    bullet.maxBounces = cfg.bounces;
    bullet.armedAt = time + 60;

    if (tank.isPlayer) {
      sfx.shoot();
      this.dismissHint();
    } else sfx.enemyShoot();
  }

  /** El aviso del primer nivel se va con el primer disparo: ya lo has entendido. */
  private dismissHint() {
    if (!this.hint) return;
    const hint = this.hint;
    this.hint = null;
    this.tweens.add({ targets: hint, alpha: 0, duration: 400, onComplete: () => hint.destroy() });
  }

  private countBullets(tank: Tank) {
    let n = 0;
    for (const b of this.bullets.getChildren() as Bullet[]) if (b.active && b.owner === tank) n++;
    return n;
  }

  private bounce(bullet: Bullet) {
    bullet.bounces++;
    if (bullet.bounces > bullet.maxBounces) this.popBullet(bullet);
    else sfx.bounce();
  }

  private popBullet(bullet: Bullet) {
    this.debris.explode(4, bullet.x, bullet.y);
    bullet.destroy();
  }

  private onBulletHitWall: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (obj) => {
    this.bounce(obj as Bullet);
  };

  private onBulletHitWorldBounds(body: Phaser.Physics.Arcade.Body) {
    const go = body.gameObject as Bullet;
    if (go && this.bullets.contains(go)) this.bounce(go);
  }

  private onBulletHitTank: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (a, b) => {
    const bullet = a as Bullet;
    const tank = b as Tank;
    if (this.state !== "playing" || !bullet.active || !tank.active) return;
    if (bullet.owner === tank && this.time.now < bullet.armedAt) return;
    this.popBullet(bullet);
    this.killTank(tank);
  };

  // ---------------- minas ----------------

  private countMines(tank: Tank) {
    let n = 0;
    for (const m of this.mines.getChildren() as Mine[]) if (m.active && m.owner === tank) n++;
    return n;
  }

  private dropMine(tank: Tank) {
    if (!tank || !tank.active) return;
    if (!tank.cfg.mines) return;
    const time = this.time.now;
    if (time < tank.nextMine && tank.isPlayer) return;
    const max = tank.isPlayer ? PLAYER_MAX_MINES : ENEMY_MAX_MINES;
    if (this.countMines(tank) >= max) return;
    if (tank.isPlayer) tank.nextMine = time + MINE_COOLDOWN;

    const mine = this.mines.create(tank.x, tank.y, "mine") as Mine;
    mine.setDepth(2);
    mine.owner = tank;
    mine.armAt = time + MINE_ARM_MS;
    mine.fuseAt = time + MINE_FUSE_MS;
    mine.nextBeep = time + 400;
    mine.detonating = false;
    mine.setAlpha(0.55);
    sfx.mineDrop();
    if (tank.isPlayer) this.updateHud();
  }

  private updateMines(time: number) {
    for (const m of this.mines.getChildren() as Mine[]) {
      if (!m.active || m.detonating) continue;

      if (time > m.armAt) {
        m.setAlpha(1);
        if (time > m.nextBeep) {
          const left = m.fuseAt - time;
          m.nextBeep = time + Phaser.Math.Clamp(left / 6, 90, 500);
          sfx.mineBeep();
          this.tweens.add({ targets: m, scale: 1.35, duration: 90, yoyo: true });
        }
        for (const t of this.allTanks()) {
          if (Phaser.Math.Distance.Between(m.x, m.y, t.x, t.y) < MINE_TRIGGER_RADIUS) {
            this.detonate(m);
            break;
          }
        }
      }
      if (m.active && !m.detonating && time > m.fuseAt) this.detonate(m);
    }
  }

  private detonate(mine: Mine) {
    if (mine.detonating) return;
    mine.detonating = true;
    const { x, y } = mine;
    const isPlayerMine = mine.owner === this.player;
    mine.destroy();

    sfx.explode();
    vibrate(45);
    this.debris.explode(26, x, y);
    const flash = this.add.circle(x, y, MINE_BLAST_RADIUS, 0xffb703, 0.55).setDepth(25);
    this.tweens.add({ targets: flash, alpha: 0, scale: 1.15, duration: 260, onComplete: () => flash.destroy() });
    this.cameras.main.shake(220, 0.012);

    for (const c of this.corks.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
      if (c.active && Phaser.Math.Distance.Between(x, y, c.x, c.y) < MINE_BLAST_RADIUS + CELL * 0.4) {
        this.debris.explode(6, c.x, c.y);
        const cell = c.getData("cell") as { r: number; c: number };
        this.grid[cell.r][cell.c] = false; // la mira y la IA deben ver el hueco
        c.destroy();
      }
    }
    for (const t of this.allTanks()) {
      if (Phaser.Math.Distance.Between(x, y, t.x, t.y) < MINE_BLAST_RADIUS) this.killTank(t);
    }
    for (const other of this.mines.getChildren().slice() as Mine[]) {
      if (other.active && !other.detonating && Phaser.Math.Distance.Between(x, y, other.x, other.y) < MINE_BLAST_RADIUS) {
        this.time.delayedCall(90, () => other.active && this.detonate(other));
      }
    }
    if (isPlayerMine) this.updateHud();
  }

  // ---------------- muerte / fin de ronda ----------------

  /** Golpe seco: medio segundo de ralenti y un fogonazo blanco. */
  private impactFeedback() {
    this.physics.world.timeScale = 3.2;
    this.time.delayedCall(120, () => {
      if (this.physics.world) this.physics.world.timeScale = 1;
    });
    this.flash.setAlpha(0.3); // el fundido lo hace update(), no un tween: nunca se queda a medias
  }

  private killTank(tank: Tank) {
    if (!tank.active) return;
    this.debris.explode(22, tank.x, tank.y);
    const boom = this.add.circle(tank.x, tank.y, 16, 0xffb703, 0.9).setDepth(30);
    this.tweens.add({ targets: boom, scale: 2.6, alpha: 0, duration: 320, onComplete: () => boom.destroy() });
    this.cameras.main.shake(150, 0.007);
    sfx.explode();
    this.impactFeedback();

    const wasPlayer = tank.isPlayer;
    vibrate(wasPlayer ? 200 : 25);
    const points = tank.cfg.points;
    tank.turret.destroy();
    tank.shadow.destroy();
    tank.destroy();

    if (wasPlayer) {
      this.endRound("dead");
      return;
    }
    this.score += points;
    this.enemies = this.enemies.filter((e) => e !== tank);
    this.updateHud();
    if (this.enemies.length === 0) this.endRound("won");
  }

  private endRound(result: "dead" | "won") {
    if (this.state !== "playing") return; // la primera muerte decide la ronda
    this.moveStick.reset();
    this.aimStick.reset();
    this.mineButtonHeld = false;
    for (const t of this.allTanks()) t.setVelocity(0, 0);
    this.acceptInputAt = this.time.now + 600;

    if (result === "won") {
      this.state = "won";
      const cleared = this.level + 1;
      if (cleared % EXTRA_LIFE_EVERY === 0) {
        this.lives++;
        this.time.delayedCall(500, () => sfx.extraLife());
      }
      saveProgress(cleared, this.score);
      if (cleared >= LEVELS.length) clearRun();
      this.updateHud();
      sfx.win();
      this.message
        .setText(
          cleared >= LEVELS.length
            ? `¡HAS TERMINADO LOS ${LEVELS.length} NIVELES!\nPUNTOS: ${this.score}\n\ntoca para volver al menú`
            : `NIVEL ${cleared} SUPERADO\nPUNTOS: ${this.score}\n\ntoca para continuar`
        )
        .setVisible(true);
      return;
    }

    this.lives--;
    this.updateHud();
    if (this.lives <= 0) {
      this.state = "gameover";
      saveProgress(this.level, this.score);
      clearRun();
      sfx.gameOver();
      this.message.setText(`GAME OVER\nPUNTOS: ${this.score}\n\ntoca para volver al menú`).setVisible(true);
    } else {
      this.state = "dead";
      sfx.lose();
      const vidas = this.lives === 1 ? "Te queda 1 vida" : `Te quedan ${this.lives} vidas`;
      this.message.setText(`DESTRUIDO\n${vidas}\n\ntoca para reintentar`).setVisible(true);
    }
  }

  private advance() {
    if (this.state === "won") {
      const next = this.level + 1;
      if (next >= LEVELS.length) {
        this.scene.start("title");
        return;
      }
      this.scene.restart({ level: next, lives: this.lives, score: this.score });
    } else if (this.state === "dead") {
      this.scene.restart({ level: this.level, lives: this.lives, score: this.score });
    } else {
      this.scene.start("title");
    }
  }
}
