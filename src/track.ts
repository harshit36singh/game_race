import { World, Vec2, ChainShape } from 'planck';

export type P = { x: number; y: number };

export interface LoopDef {
  id: number;
  cx: number;
  cy: number;
  r: number;
}

export interface ChainDef {
  pts: P[];
  loop?: number;
  part?: 'entry' | 'exit';
}

export interface TrackData {
  chains: ChainDef[];
  loops: LoopDef[];
  checkpoints: P[];
  start: P;
  finish: P;
  minY: number;
  length: number;
}

export interface TrackFixtureData {
  track: true;
  pts: P[];
  loop?: number;
  part?: 'entry' | 'exit';
}

/**
 * Builds a track left-to-right. Every chain's points run in the direction of
 * travel, so the riding surface is always on the left of the path (the "up"
 * side for flat ground, the inside for loops). Collision is one-sided based on
 * that rule.
 */
export class TrackBuilder {
  x = 0;
  y = 0;
  private cur: P[] = [];
  private data: TrackData;

  constructor() {
    this.data = {
      chains: [],
      loops: [],
      checkpoints: [],
      start: { x: 2, y: 0 },
      finish: { x: 0, y: 0 },
      minY: 0,
      length: 0,
    };
    // Backstop wall so the bike cannot roll off the start.
    this.cur = [
      { x: -6, y: 10 },
      { x: -6, y: 0.6 },
      { x: -5.4, y: 0 },
    ];
    this.pt(0, 0);
  }

  private pt(x: number, y: number) {
    const last = this.cur[this.cur.length - 1];
    if (last && Math.hypot(last.x - x, last.y - y) < 0.08) return;
    this.cur.push({ x, y });
  }

  private endChain() {
    if (this.cur.length >= 2) this.data.chains.push({ pts: this.cur });
    this.cur = [];
  }

  flat(len: number) {
    const n = Math.max(1, Math.ceil(len / 2));
    for (let i = 1; i <= n; i++) this.pt(this.x + (len * i) / n, this.y);
    this.x += len;
    return this;
  }

  /** Smooth S-shaped slope that starts and ends flat. */
  slope(dx: number, dy: number) {
    const n = Math.max(8, Math.ceil(dx / 0.5));
    const x0 = this.x, y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.pt(x0 + dx * t, y0 + (dy * (1 - Math.cos(Math.PI * t))) / 2);
    }
    this.x += dx;
    this.y += dy;
    return this;
  }

  /** Smooth bump (positive h) or dip (negative h). */
  hill(len: number, h: number) {
    const n = Math.max(10, Math.ceil(len / 0.4));
    const x0 = this.x, y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.pt(x0 + len * t, y0 + (h * (1 - Math.cos(2 * Math.PI * t))) / 2);
    }
    this.x += len;
    return this;
  }

  bumps(count: number, w: number, h: number) {
    for (let i = 0; i < count; i++) this.hill(w, h);
    return this;
  }

  /** A ramp that rises and ends at an angle; follow it with gap(). */
  kicker(len: number, h: number) {
    const n = Math.max(8, Math.ceil(len / 0.35));
    const x0 = this.x, y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.pt(x0 + len * t, y0 + h * t * t);
    }
    this.x += len;
    this.y += h;
    return this;
  }

  /** Empty space; the track resumes at (x + dx, y + dy). */
  gap(dx: number, dy = 0) {
    this.endChain();
    this.x += dx;
    this.y += dy;
    this.cur = [{ x: this.x, y: this.y }];
    return this;
  }

  /** A downhill landing ramp, steep at first and flat at the end. */
  landing(len: number, drop: number) {
    const n = Math.max(8, Math.ceil(len / 0.4));
    const x0 = this.x, y0 = this.y;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      this.pt(x0 + len * t, y0 - drop * (1 - (1 - t) * (1 - t)));
    }
    this.x += len;
    this.y -= drop;
    return this;
  }

  /** Stair steps going up or down. */
  steps(count: number, w: number, h: number) {
    for (let i = 0; i < count; i++) {
      this.slope(w * 0.35, h);
      this.flat(w * 0.65);
    }
    return this;
  }

  /**
   * A full loop: a trochoid that enters along the ground, goes counter-
   * clockwise all the way around and exits further right. The section where
   * the path crosses itself is split into "entry" and "exit" parts whose
   * collision is toggled depending on how far around the bike is.
   */
  loop(r: number) {
    const k = r * 0.22;
    const x0 = this.x, y0 = this.y;
    const at = (t: number): P => ({
      x: x0 + r * Math.sin(t) + k * t,
      y: y0 + r * (1 - Math.cos(t)),
    });
    // Crossing point: r*sin(t1) + k*t1 = PI*k
    let lo = 0, hi = Math.PI;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      if (r * Math.sin(m) + k * m < Math.PI * k) lo = m;
      else hi = m;
    }
    const t1 = lo;
    const t2 = 2 * Math.PI - t1;
    const step = 0.35 / r; // ~35cm segments
    const sample = (a: number, b: number): P[] => {
      const out: P[] = [];
      const n = Math.max(4, Math.ceil((b - a) / step));
      for (let i = 0; i <= n; i++) out.push(at(a + ((b - a) * i) / n));
      return out;
    };

    for (const p of sample(0, t1).slice(1)) this.pt(p.x, p.y);
    this.endChain();

    const id = this.data.loops.length;
    this.data.loops.push({ id, cx: x0 + Math.PI * k, cy: y0 + r, r });
    this.data.chains.push({ pts: sample(t1 - 0.06, Math.PI + 0.5), loop: id, part: 'entry' });
    this.data.chains.push({ pts: sample(Math.PI - 0.5, t2 + 0.06), loop: id, part: 'exit' });

    const tail = sample(t2, 2 * Math.PI);
    this.cur = [];
    for (const p of tail) this.pt(p.x, p.y);
    this.x = x0 + 2 * Math.PI * k;
    this.y = y0;
    return this;
  }

  checkpoint() {
    this.data.checkpoints.push({ x: this.x, y: this.y });
    return this;
  }

  finish() {
    this.data.finish = { x: this.x, y: this.y };
    this.flat(30);
    this.pt(this.x + 0.6, this.y + 0.6);
    this.pt(this.x + 0.6, this.y + 10);
    this.endChain();
    let minY = Infinity;
    for (const c of this.data.chains) for (const p of c.pts) minY = Math.min(minY, p.y);
    this.data.minY = minY;
    this.data.length = this.data.finish.x - this.data.start.x;
    return this.data;
  }
}

export function buildTrackPhysics(world: World, data: TrackData, friction: number) {
  const body = world.createBody({ type: 'static' });
  for (const c of data.chains) {
    const ud: TrackFixtureData = { track: true, pts: c.pts, loop: c.loop, part: c.part };
    body.createFixture(new ChainShape(c.pts.map((p) => new Vec2(p.x, p.y)), false), {
      friction,
      userData: ud,
    });
  }
  return body;
}
