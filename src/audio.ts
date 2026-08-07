const MUTE_KEY = "wetanks.muted";
const MUSIC_VOL = 0.13; // por debajo de los efectos: acompaña, no compite

/**
 * Loop de fondo sintetizado, en el mismo estilo que los efectos: bajo, arpegio
 * y charles sobre Am-F-C-G. Va por su propio bus de ganancia para poder
 * mezclarlo aparte de los efectos.
 *
 * Las notas se programan con antelación (`schedule()` mira 0.4 s hacia delante)
 * porque un `setInterval` no es puntual: lo que manda es el reloj de WebAudio.
 */
class Music {
  private static readonly STEP = 60 / 96 / 2; // corcheas a 96 bpm
  private static readonly BASS = [110.0, 87.31, 130.81, 98.0]; // A2 F2 C3 G2
  private static readonly ARP = [
    [220.0, 261.63, 329.63], // Am
    [174.61, 220.0, 261.63], // F
    [261.63, 329.63, 392.0], // C
    [196.0, 246.94, 293.66], // G
  ];

  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private step = 0;
  private nextAt = 0;

  start(ctx: AudioContext, noise: AudioBuffer, muted: boolean) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.noise = noise;
    this.out = ctx.createGain();
    this.out.gain.value = muted ? 0 : MUSIC_VOL;
    this.out.connect(ctx.destination);
    this.nextAt = ctx.currentTime + 0.15;
    window.setInterval(() => this.schedule(), 120);
    // sonar en una pestaña de fondo es de mala educación
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
  }

  setMuted(muted: boolean) {
    if (!this.ctx || !this.out) return;
    this.out.gain.setTargetAtTime(muted ? 0 : MUSIC_VOL, this.ctx.currentTime, 0.05);
  }

  private schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextAt < ctx.currentTime + 0.4) {
      this.playStep(this.step % 16, this.nextAt);
      this.nextAt += Music.STEP;
      this.step++;
    }
  }

  private playStep(i: number, t: number) {
    const chord = i >> 2; // dos tiempos por acorde
    if (i % 4 === 0) this.note("triangle", Music.BASS[chord], 0.42, 0.22, t);
    this.note("square", Music.ARP[chord][i % 3], 0.16, 0.05, t);
    if (i % 2 === 1) this.hat(t);
  }

  private note(type: OscillatorType, freq: number, dur: number, vol: number, t: number) {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private hat(t: number) {
    const ctx = this.ctx;
    if (!ctx || !this.out || !this.noise) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(filter).connect(gain).connect(this.out);
    src.start(t);
    src.stop(t + 0.07);
  }
}

const music = new Music();

/** Vibración del móvil. No depende del mute: si silencias es para no hacer ruido. */
export function vibrate(ms: number) {
  navigator.vibrate?.(ms);
}

/** Efectos de sonido sintetizados con WebAudio: sin ficheros que descargar. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  muted = localStorage.getItem(MUTE_KEY) === "1";

  /** Los navegadores exigen un gesto del usuario antes de sonar. */
  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);

      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    // aqui ya hay gesto del usuario, que es lo que exige el navegador
    if (this.noise) music.start(this.ctx, this.noise, this.muted);
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    music.setMuted(this.muted);
    return this.muted;
  }

  private ready(): AudioContext | null {
    if (this.muted || !this.ctx || !this.master) return null;
    return this.ctx;
  }

  private tone(
    type: OscillatorType,
    from: number,
    to: number,
    dur: number,
    vol: number,
    delay = 0
  ) {
    const ctx = this.ready();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.012, dur / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, filterFrom: number, filterTo: number) {
    const ctx = this.ready();
    if (!ctx || !this.master || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterFrom, t);
    filter.frequency.exponentialRampToValueAtTime(filterTo, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  shoot() {
    this.tone("square", 340, 110, 0.09, 0.18);
    this.burst(0.06, 0.12, 2200, 400);
  }

  enemyShoot() {
    this.tone("sawtooth", 260, 90, 0.1, 0.1);
  }

  bounce() {
    this.tone("triangle", 900, 520, 0.06, 0.1);
  }

  /** Dos balas anulandose: chispazo metalico. */
  clash() {
    this.tone("square", 1800, 700, 0.07, 0.12);
    this.burst(0.09, 0.16, 6000, 1200);
  }

  explode() {
    this.burst(0.5, 0.7, 1400, 60);
    this.tone("sine", 160, 40, 0.35, 0.25);
  }

  crumble() {
    this.burst(0.22, 0.35, 3000, 500);
  }

  mineDrop() {
    this.tone("sine", 420, 180, 0.12, 0.16);
  }

  mineBeep() {
    this.tone("sine", 1500, 1500, 0.045, 0.07);
  }

  win() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone("triangle", f, f, 0.16, 0.2, i * 0.09));
  }

  lose() {
    this.tone("sawtooth", 320, 50, 0.8, 0.22);
  }

  extraLife() {
    [784, 988, 1319].forEach((f, i) => this.tone("square", f, f, 0.12, 0.16, i * 0.07));
  }

  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => this.tone("triangle", f, f, 0.3, 0.2, i * 0.18));
  }
}

export const sfx = new Sfx();
