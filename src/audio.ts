/** Tiny synthesized sound: engine drone plus a few effects. */
export class Sfx {
  private ctx: AudioContext | null = null;
  private osc: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private gain: GainNode | null = null;
  private master: GainNode | null = null;
  muted = localStorage.getItem('lr-muted') === '1';

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.osc = ctx.createOscillator();
    this.osc.type = 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = 'square';
    this.osc.connect(filter);
    this.osc2.connect(filter);
    filter.connect(this.gain);
    this.gain.connect(this.master);
    this.osc.start();
    this.osc2.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('lr-muted', this.muted ? '1' : '0');
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  engine(on: boolean, throttle: boolean, speed: number) {
    if (!this.ctx || !this.osc || !this.osc2 || !this.gain) return;
    const t = this.ctx.currentTime;
    const f = 45 + Math.min(speed, 30) * 4.5 + (throttle ? 20 : 0);
    this.osc.frequency.setTargetAtTime(f, t, 0.05);
    this.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.gain.gain.setTargetAtTime(on ? (throttle ? 0.14 : 0.07) : 0, t, 0.08);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol = 0.25, slide = 0) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur);
  }

  crash() {
    if (!this.ctx || !this.master) return;
    const len = this.ctx.sampleRate * 0.4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.5;
    src.connect(g).connect(this.master);
    src.start();
    this.tone(120, 0.35, 'square', 0.2, -80);
  }

  checkpoint() {
    this.tone(660, 0.12, 'triangle');
    setTimeout(() => this.tone(990, 0.18, 'triangle'), 90);
  }

  flip() {
    this.tone(500, 0.25, 'triangle', 0.25, 600);
  }

  finish() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle'), i * 110));
  }

  nitro() {
    this.tone(180, 0.5, 'sawtooth', 0.2, 500);
  }

  jump() {
    this.tone(220, 0.3, 'square', 0.2, 700);
  }

  shield() {
    this.tone(880, 0.3, 'triangle', 0.25, -400);
  }

  coin() {
    this.tone(1320, 0.08, 'square', 0.08);
    setTimeout(() => this.tone(1760, 0.1, 'square', 0.08), 50);
  }
}
