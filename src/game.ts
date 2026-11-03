import { World, Vec2, Body, Contact } from 'planck';
import { Bike, BikePartData } from './bike';
import { buildTrackPhysics, TrackData, TrackFixtureData } from './track';
import { LEVELS } from './levels';
import { THEMES, ThemeName, drawBackground, drawTrack, drawFlag, drawFinish, drawBike, poseOf, BikePose } from './render';
import { Input } from './input';
import { Sfx } from './audio';
import { GhostFrame, getRecord } from './storage';

const DT = 1 / 120;
const GRAVITY = 15;
const GHOST_HZ = 30;

interface Particle { x: number; y: number; vx: number; vy: number; life: number; size: number }

export interface FinishInfo {
  time: number;
  flips: number;
  ghost: GhostFrame[];
}

export class Game {
  world: World;
  track: TrackData;
  theme: ThemeName;
  bike!: Bike;
  private trackBody: Body;
  private loopPhase: number[];

  timer = 0;
  bonus = 0;
  flips = 0;
  started = false;
  finished = false;
  paused = false;
  private finishDelay = 0;
  private finishTime = 0;
  private checkpoint = -1;
  private crashFlag = false;
  private respawnIn = 0;
  private airTime = 0;
  private airAngle = 0;
  private lastAngle = 0;
  private acc = 0;

  private ghostRec: GhostFrame[] = [];
  private ghost: GhostFrame[] | undefined;
  private particles: Particle[] = [];

  camX = 0;
  camY = 0;
  private zoom = 1;

  onFinish: (info: FinishInfo) => void = () => {};
  onPopup: (text: string, kind?: string) => void = () => {};

  constructor(public levelIndex: number, private input: Input, private sfx: Sfx) {
    const level = LEVELS[levelIndex];
    this.theme = level.theme;
    this.track = level.build();
    this.world = new World({ gravity: new Vec2(0, -GRAVITY) });
    this.trackBody = buildTrackPhysics(this.world, this.track, THEMES[this.theme].friction);
    this.loopPhase = this.track.loops.map(() => 0);
    this.ghost = getRecord(levelIndex)?.ghost;

    this.world.on('pre-solve', (c) => this.preSolve(c));
    this.world.on('post-solve', (c) => {
      if (this.trackFixture(c)) {
        const other = this.otherFixtureData(c);
        if (other && (other.kind === 'head' || other.kind === 'torso')) this.crashFlag = true;
      }
    });

    this.spawn();
    const p = this.bike.chassis.getPosition();
    this.camX = p.x + 6;
    this.camY = p.y + 2;
  }

  private spawn() {
    const cp = this.checkpoint >= 0 ? this.track.checkpoints[this.checkpoint] : this.track.start;
    if (this.bike) this.bike.destroy();
    this.bike = new Bike(this.world, cp.x + 1.2, cp.y + 1.0, '#e8412c', '#2456c9');
    this.loopPhase.fill(0);
    this.crashFlag = false;
    this.airTime = 0;
    this.airAngle = 0;
    this.lastAngle = 0;
  }

  // ----- collision filtering -----

  private trackFixture(c: Contact): { data: TrackFixtureData; child: number; otherA: boolean } | null {
    const a = c.getFixtureA().getUserData() as TrackFixtureData | null;
    if (a && a.track) return { data: a, child: c.getChildIndexA(), otherA: false };
    const b = c.getFixtureB().getUserData() as TrackFixtureData | null;
    if (b && b.track) return { data: b, child: c.getChildIndexB(), otherA: true };
    return null;
  }

  private otherFixtureData(c: Contact): BikePartData | null {
    const a = c.getFixtureA().getUserData() as BikePartData | TrackFixtureData | null;
    if (a && 'kind' in a) return a;
    const b = c.getFixtureB().getUserData() as BikePartData | TrackFixtureData | null;
    if (b && 'kind' in b) return b;
    return null;
  }

  private preSolve(c: Contact) {
    const t = this.trackFixture(c);
    if (!t) return;
    const td = t.data;
    if (td.loop !== undefined) {
      const ph = this.loopPhase[td.loop];
      if ((td.part === 'entry' && ph === 1) || (td.part === 'exit' && ph === 0)) {
        c.setEnabled(false);
        return;
      }
    }
    // One-sided: only collide from the left side of the travel direction.
    const of = t.otherA ? c.getFixtureA() : c.getFixtureB();
    const od = of.getUserData() as BikePartData | null;
    const lc = od?.lc ?? { x: 0, y: 0 };
    const p = of.getBody().getWorldPoint(new Vec2(lc.x, lc.y));
    const a = td.pts[t.child], b = td.pts[t.child + 1];
    if (!a || !b) return;
    const nx = -(b.y - a.y), ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    const side = ((p.x - a.x) * nx + (p.y - a.y) * ny) / len;
    if (side < -0.05) c.setEnabled(false);
  }

  private updateLoopPhases() {
    const p = this.bike.chassis.getPosition();
    const v = this.bike.chassis.getLinearVelocity();
    for (const l of this.track.loops) {
      const d = Math.hypot(p.x - l.cx, p.y - l.cy);
      // Past the top: inside the ring's upper half and travelling leftwards.
      if (d < l.r * 1.2 && d > l.r * 0.4 && p.x < l.cx && p.y > l.cy + l.r * 0.3 && v.x < -0.5) this.loopPhase[l.id] = 1;
      else if (d > l.r * 1.9) this.loopPhase[l.id] = 0;
    }
  }

  private touching(b: Body) {
    for (let ce = b.getContactList(); ce; ce = ce.next) {
      if (ce.other === this.trackBody && ce.contact.isTouching() && ce.contact.isEnabled()) return true;
    }
    return false;
  }

  // ----- simulation -----

  restartFromStart() {
    this.checkpoint = -1;
    this.timer = 0;
    this.bonus = 0;
    this.flips = 0;
    this.started = false;
    this.finished = false;
    this.finishDelay = 0;
    this.respawnIn = 0;
    this.ghostRec = [];
    this.particles = [];
    this.spawn();
  }

  update(realDt: number) {
    if (this.paused) return;
    this.acc += Math.min(realDt, 0.1);
    while (this.acc >= DT) {
      this.fixedStep();
      this.acc -= DT;
    }
    this.updateCamera(realDt);
    this.updateParticles(realDt);
  }

  private fixedStep() {
    const bike = this.bike;
    const inp = this.input;
    if (!this.started && inp.any() && !this.finished) {
      this.started = true;
      this.onPopup('GO!', 'go');
    }

    if (this.finished) bike.control({ gas: false, brake: true, leanBack: false, leanFwd: false });
    else bike.control(inp);

    this.updateLoopPhases();
    this.world.step(DT, 10, 8);

    if (this.started && !this.finished) this.timer += DT;

    // Ghost recording
    if (this.started && !this.finished && this.ghostRec.length <= this.timer * GHOST_HZ) {
      const ps = poseOf(bike.chassis, bike.rear, bike.front, null);
      const r = (v: number) => Math.round(v * 100) / 100;
      this.ghostRec.push([ps.cx, ps.cy, ps.ca, ps.rx, ps.ry, ps.ra, ps.fx, ps.fy, ps.fa].map(r));
    }

    // Crash checks
    const pos = bike.chassis.getPosition();
    if (!bike.crashed && !this.finished && (this.crashFlag || pos.y < this.track.minY - 15)) {
      bike.crash();
      this.sfx.crash();
      this.onPopup('CRASH!', 'crash');
      this.respawnIn = 1.6;
    }
    this.crashFlag = false;
    if (bike.crashed && this.respawnIn > 0) {
      this.respawnIn -= DT;
      if (this.respawnIn <= 0) this.spawn();
      return;
    }

    // Checkpoints
    const cps = this.track.checkpoints;
    while (this.checkpoint + 1 < cps.length && pos.x > cps[this.checkpoint + 1].x + 1 && !bike.crashed) {
      this.checkpoint++;
      this.sfx.checkpoint();
      this.onPopup('CHECKPOINT', 'cp');
    }

    // Flips
    const grounded = this.touching(bike.rear) || this.touching(bike.front);
    const ang = bike.chassis.getAngle();
    if (!grounded) {
      this.airTime += DT;
      this.airAngle += ang - this.lastAngle;
    } else {
      if (this.airTime > 0.25 && !bike.crashed) {
        const n = Math.floor((Math.abs(this.airAngle) + 0.7) / (Math.PI * 2));
        if (n > 0 && !this.finished) {
          this.flips += n;
          this.bonus += n;
          this.sfx.flip();
          const name = this.airAngle > 0 ? 'BACKFLIP' : 'FRONTFLIP';
          this.onPopup(`${n > 1 ? n + 'x ' : ''}${name}!  −${n}s`, 'flip');
        }
      }
      this.airTime = 0;
      this.airAngle = 0;
    }
    this.lastAngle = ang;

    // Dust
    if (inp.gas && !bike.crashed && this.touching(bike.rear) && Math.random() < 0.5) {
      const rp = bike.rear.getPosition();
      this.particles.push({
        x: rp.x - 0.2, y: rp.y - 0.35,
        vx: -1 - Math.random() * 2, vy: Math.random() * 1.5,
        life: 0.6, size: 0.1 + Math.random() * 0.15,
      });
    }

    // Finish
    if (!this.finished && !bike.crashed && pos.x >= this.track.finish.x) {
      this.finished = true;
      this.finishTime = Math.max(0, this.timer - this.bonus);
      this.finishDelay = 1.3;
      this.sfx.finish();
      this.onPopup('FINISH!', 'finish');
    }
    if (this.finished && this.finishDelay > 0) {
      this.finishDelay -= DT;
      if (this.finishDelay <= 0) this.onFinish({ time: this.finishTime, flips: this.flips, ghost: this.ghostRec });
    }
  }

  displayTime() {
    return this.finished ? this.finishTime : Math.max(0, this.timer - this.bonus);
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 3 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private updateCamera(dt: number) {
    const c = this.bike.chassis;
    const p = c.getPosition();
    const v = c.getLinearVelocity();
    const tx = p.x + Math.max(-4, Math.min(8, v.x * 0.4)) + 3;
    const ty = p.y + 1.5 + Math.max(-3, Math.min(3, v.y * 0.15));
    const k = 1 - Math.exp(-dt * 4);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    const targetZoom = 1 - Math.min(0.2, this.bike.speed() / 120);
    this.zoom += (targetZoom - this.zoom) * (1 - Math.exp(-dt * 1.5));
  }

  private ghostPose(): BikePose | null {
    const g = this.ghost;
    if (!g || g.length < 2 || !this.started) return null;
    const f = this.timer * GHOST_HZ;
    const i = Math.min(Math.floor(f), g.length - 2);
    const t = Math.min(1, f - i);
    const a = g[i], b = g[i + 1];
    const m = a.map((v, j) => v + (b[j] - v) * t);
    return { cx: m[0], cy: m[1], ca: m[2], rx: m[3], ry: m[4], ra: m[5], fx: m[6], fy: m[7], fa: m[8] };
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
    const ppm = Math.min(h / 15, w / 22) * this.zoom;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(ctx, w, h, this.theme, this.camX, this.camY, ppm);

    ctx.setTransform(dpr * ppm, 0, 0, -dpr * ppm, dpr * (w / 2 - this.camX * ppm), dpr * (h / 2 + this.camY * ppm));

    this.track.checkpoints.forEach((cp, i) => drawFlag(ctx, cp, '#ffcc33', i <= this.checkpoint));
    drawFinish(ctx, this.track.finish);
    drawTrack(ctx, this.track, this.theme, ppm);

    const gp = this.ghostPose();
    if (gp) drawBike(ctx, gp, '#c7c7d1', '#8a8fa3', 0.38);

    const dust = this.theme === 'neon' ? '#26f5ff' : this.theme === 'ice' ? '#ffffff' : '#c9a27a';
    ctx.fillStyle = dust;
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / 0.6) * 0.6;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.6 - p.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const b = this.bike;
    drawBike(ctx, poseOf(b.chassis, b.rear, b.front, b.rider), b.color, b.suit);

    this.sfx.engine(!b.crashed && !this.paused, this.input.gas && !this.finished, b.speed());
  }

  progress() {
    const x = this.bike.chassis.getPosition().x;
    return Math.max(0, Math.min(1, (x - this.track.start.x) / this.track.length));
  }
}
