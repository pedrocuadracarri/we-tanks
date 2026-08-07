const MUTE_KEY = "wetanks.muted";

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
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
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
