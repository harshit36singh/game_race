import { World, Vec2, Body, Contact } from 'planck';
import { Bike, BikePartData } from './bike';
import { buildTrackPhysics, TrackData, TrackFixtureData } from './track';
import { LEVELS } from './levels';
import {
  THEMES, ThemeName, drawBackground, drawTrack, drawFlag, drawFinish, drawBike, drawCoin, poseOf, BikePose,
} from './render';
import { Sfx } from './audio';
import { GhostFrame, getRecord, getProfile, usePowerup } from './storage';
import { BikeSpec, bikeById } from './catalog';
import type { Controls } from './bike';

const DT = 1 / 120;
const GRAVITY = 15;
const GHOST_HZ = 30;
const COIN_R = 1.0;
const MAGNET_R = 6.5;

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; grav: number }
interface Ring { x: number; y: number; t: number; color: string }
interface Coin { x: number; y: number; taken: boolean; pulled: boolean }

export interface FinishInfo {
  time: number;
  flips: number;
  coins: number;
  ghost: GhostFrame[];
}

export interface InputLike extends Controls {
  any(): boolean;
}

export class Game {
  world: World;
  track: TrackData;
  theme: ThemeName;
  bike!: Bike;
  spec: BikeSpec;
  private trackBody: Body;
  private loopPhase: number[];

  timer = 0;
  bonus = 0;
  flips = 0;
  runCoins = 0;
  started = false;
  finished = false;
  paused = false;
  shieldArmed = false;
  magnet = false;
  private invuln = 0;
  private finishDelay = 0;
  private finishTime = 0;
  private checkpoint = -1;
  private crashFlag = false;
  private respawnIn = 0;
  private airTime = 0;
  private airAngle = 0;
  private lastAngle = 0;
  private sinceGround = 0;
  private acc = 0;
  time = 0;

  private ghostRec: GhostFrame[] = [];
  private ghost: GhostFrame[] | undefined;
  private ghostSpec: BikeSpec;
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  coins: Coin[];
  private shake = 0;

  camX = 0;
  camY = 0;
  private zoom = 1;

  onFinish: (info: FinishInfo) => void = () => {};
  onPopup: (text: string, kind?: string) => void = () => {};

  constructor(public levelIndex: number, private input: InputLike, private sfx: Sfx, spec?: BikeSpec) {
    const level = LEVELS[levelIndex];
    this.theme = level.theme;
    this.spec = spec ?? bikeById(getProfile().bike);
    this.track = level.build();
    this.world = new World({ gravity: new Vec2(0, -GRAVITY) });
    this.trackBody = buildTrackPhysics(this.world, this.track, THEMES[this.theme].friction);
    this.loopPhase = this.track.loops.map(() => 0);
    const rec = getRecord(levelIndex);
    this.ghost = rec?.ghost;
    this.ghostSpec = bikeById(rec?.ghostBike ?? 'scout');
    this.coins = placeCoins(this.track);
    this.shieldArmed = getProfile().pu.shield > 0;

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
    this.bike = new Bike(this.world, cp.x + 1.2, cp.y + 1.0, this.spec);
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
    const of = t.otherA ? c.getFixtureA() : c.getFixtureB();
    const od = of.getUserData() as BikePartData | null;
    // While the shield is popping, the rider passes through the track.
    if (this.invuln > 0 && od && (od.kind === 'head' || od.kind === 'torso') && of.getBody() === this.bike.chassis) {
      c.setEnabled(false);
      return;
    }
    // One-sided: only collide from the left side of the travel direction.
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

  // ----- power-ups -----

  canNitro() {
    return this.started && !this.finished && !this.bike.crashed && this.bike.nitro <= 0 && getProfile().pu.nitro > 0;
  }

  useNitro() {
    if (!this.canNitro() || !usePowerup('nitro')) return;
    this.bike.startNitro();
    this.sfx.nitro();
    this.onPopup('NITRO!', 'nitro');
  }

  canJump() {
    return this.started && !this.finished && !this.bike.crashed && this.sinceGround < 0.25 && getProfile().pu.jump > 0;
  }

  useJump() {
    if (!this.canJump() || !usePowerup('jump')) return;
    this.bike.superJump();
    this.sinceGround = 1;
    const p = this.bike.chassis.getPosition();
    this.rings.push({ x: p.x, y: p.y - 0.8, t: 0, color: '#9BE05A' });
    this.sfx.jump();
    this.onPopup('SUPER JUMP!', 'jump');
  }

  // ----- simulation -----

  restartFromStart() {
    this.checkpoint = -1;
    this.timer = 0;
    this.bonus = 0;
    this.flips = 0;
    this.runCoins = 0;
    this.started = false;
    this.finished = false;
    this.finishDelay = 0;
    this.respawnIn = 0;
    this.invuln = 0;
    this.ghostRec = [];
    this.particles = [];
    this.coins = placeCoins(this.track);
    this.shieldArmed = getProfile().pu.shield > 0;
    this.spawn();
  }

  update(realDt: number) {
    if (this.paused) return;
    this.time += realDt;
    this.acc += Math.min(realDt, 0.1);
    while (this.acc >= DT) {
      this.fixedStep();
      this.acc -= DT;
    }
    this.updateCamera(realDt);
    this.updateFx(realDt);
  }

  private burst(x: number, y: number, n: number, color: string, speed: number, size = 0.14, grav = 6) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      const life = 0.4 + Math.random() * 0.5;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, size, color, grav });
    }
  }

  private fixedStep() {
    const bike = this.bike;
    const inp = this.input;
    if (!this.started && inp.any() && !this.finished) {
      this.started = true;
      this.onPopup('GO!', 'go');
      if (!this.magnet && getProfile().pu.magnet > 0 && usePowerup('magnet')) {
        this.magnet = true;
        setTimeout(() => this.onPopup('COIN MAGNET', 'magnet'), 700);
      }
    }

    if (this.finished) bike.control({ gas: false, brake: true, leanBack: false, leanFwd: false }, DT);
    else bike.control(inp, DT);

    this.updateLoopPhases();
    this.world.step(DT, 10, 8);
    if (this.invuln > 0) this.invuln -= DT;

    if (this.started && !this.finished) this.timer += DT;

    // Ghost recording
    if (this.started && !this.finished && this.ghostRec.length <= this.timer * GHOST_HZ) {
      const ps = poseOf(bike.chassis, bike.rear, bike.front, null);
      const r = (v: number) => Math.round(v * 100) / 100;
      this.ghostRec.push([ps.cx, ps.cy, ps.ca, ps.rx, ps.ry, ps.ra, ps.fx, ps.fy, ps.fa].map(r));
    }

    // Crash checks
    const pos = bike.chassis.getPosition();
    const fell = pos.y < this.track.minY - 15;
    if (!bike.crashed && !this.finished && this.invuln <= 0 && (this.crashFlag || fell)) {
      if (!fell && this.shieldArmed && usePowerup('shield')) {
        this.shieldArmed = getProfile().pu.shield > 0;
        bike.rescue();
        this.invuln = 1.2;
        const p = bike.chassis.getPosition();
        this.rings.push({ x: p.x, y: p.y, t: 0, color: '#FF7AC8' });
        this.burst(p.x, p.y, 24, '#FF7AC8', 7, 0.12, 0);
        this.sfx.shield();
        this.onPopup('SHIELD SAVED YOU!', 'shield');
      } else {
        bike.crash();
        this.sfx.crash();
        this.shake = 0.5;
        this.burst(pos.x, pos.y + 0.6, 18, THEMES[this.theme].dust, 6, 0.18);
        this.onPopup('CRASH!', 'crash');
        this.respawnIn = 1.6;
      }
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

    // Coins
    const head = bike.chassis.getWorldPoint(new Vec2(0, 0.8));
    for (const c of this.coins) {
      if (c.taken) continue;
      const d = Math.hypot(c.x - head.x, c.y - head.y);
      if (this.magnet && d < MAGNET_R) c.pulled = true;
      if (c.pulled) {
        const k = Math.min(1, (22 * DT) / Math.max(d, 0.01));
        c.x += (head.x - c.x) * k;
        c.y += (head.y - c.y) * k;
      }
      if (d < COIN_R) {
        c.taken = true;
        this.runCoins++;
        this.sfx.coin();
        this.burst(c.x, c.y, 6, '#FFC93C', 3, 0.08, 0);
      }
    }

    // Flips
    const grounded = this.touching(bike.rear) || this.touching(bike.front);
    this.sinceGround = grounded ? 0 : this.sinceGround + DT;
    const ang = bike.chassis.getAngle();
    if (!grounded) {
      this.airTime += DT;
      this.airAngle += ang - this.lastAngle;
    } else {
      if (this.airTime > 0.25 && !bike.crashed) {
        if (this.airTime > 0.6) {
          const rp = bike.rear.getPosition();
          this.burst(rp.x, rp.y - 0.4, 10, THEMES[this.theme].dust, 3.5, 0.16);
        }
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

    // Dust / nitro trail
    if ((inp.gas || bike.nitro > 0) && this.touching(bike.rear) && Math.random() < 0.5) {
      const rp = bike.rear.getPosition();
      this.particles.push({
        x: rp.x - 0.2, y: rp.y - 0.35, vx: -1 - Math.random() * 2, vy: Math.random() * 1.5,
        life: 0.6, max: 0.6, size: 0.12 + Math.random() * 0.15, color: THEMES[this.theme].dust, grav: 3,
      });
    }
    if (bike.nitro > 0 && Math.random() < 0.7) {
      const ep = bike.chassis.getWorldPoint(new Vec2(-1.3, 0.1));
      this.particles.push({
        x: ep.x, y: ep.y, vx: -2 + Math.random(), vy: (Math.random() - 0.5) * 1.5,
        life: 0.35, max: 0.35, size: 0.1 + Math.random() * 0.1, color: '#29E3D6', grav: 0,
      });
    }

    // Finish
    if (!this.finished && !bike.crashed && pos.x >= this.track.finish.x) {
      this.finished = true;
      this.finishTime = Math.max(0, this.timer - this.bonus);
      this.finishDelay = 1.3;
      this.sfx.finish();
      this.burst(this.track.finish.x, this.track.finish.y + 4.4, 40, '#FFC93C', 9, 0.14, 4);
      this.burst(this.track.finish.x, this.track.finish.y + 4.4, 30, '#FF6A2B', 8, 0.12, 4);
      this.onPopup('FINISH!', 'finish');
    }
    if (this.finished && this.finishDelay > 0) {
      this.finishDelay -= DT;
      if (this.finishDelay <= 0)
        this.onFinish({ time: this.finishTime, flips: this.flips, coins: this.runCoins, ghost: this.ghostRec });
    }
  }

  displayTime() {
    return this.finished ? this.finishTime : Math.max(0, this.timer - this.bonus);
  }

  private updateFx(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= p.grav * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < 0.6);
    this.shake = Math.max(0, this.shake - dt);
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
    const targetZoom = 1 - Math.min(0.22, this.bike.speed() / 110) - (this.bike.nitro > 0 ? 0.06 : 0);
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
    const sh = this.shake > 0 ? this.shake * 0.6 : 0;
    const camX = this.camX + (Math.random() - 0.5) * sh;
    const camY = this.camY + (Math.random() - 0.5) * sh;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground(ctx, w, h, this.theme, camX, camY, ppm, this.time);

    ctx.setTransform(dpr * ppm, 0, 0, -dpr * ppm, dpr * (w / 2 - camX * ppm), dpr * (h / 2 + camY * ppm));
    const viewL = camX - w / 2 / ppm, viewR = camX + w / 2 / ppm;

    drawTrack(ctx, this.track, this.theme, ppm, viewL, viewR);
    this.track.checkpoints.forEach((cp, i) => {
      if (cp.x > viewL - 3 && cp.x < viewR + 3) drawFlag(ctx, cp, i <= this.checkpoint, this.time);
    });
    drawFinish(ctx, this.track.finish);

    for (const c of this.coins) if (!c.taken && c.x > viewL - 1 && c.x < viewR + 1) drawCoin(ctx, c.x, c.y, this.time);

    const gp = this.ghostPose();
    if (gp) drawBike(ctx, gp, this.ghostSpec, { ppm, alpha: 0.32 });

    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + (1 - p.life / p.max)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    const b = this.bike;
    const pose = poseOf(b.chassis, b.rear, b.front, b.rider);
    drawBike(ctx, pose, this.spec, { ppm, nitro: b.nitro > 0, time: this.time });

    // Shield bubble (armed: faint; popping: bright)
    if (!b.crashed && (this.shieldArmed || this.invuln > 0)) {
      const c = b.chassis.getWorldPoint(new Vec2(0, 0.35));
      const pulse = 1 + Math.sin(this.time * 4) * 0.03;
      ctx.lineWidth = this.invuln > 0 ? 0.12 : 0.06;
      ctx.strokeStyle = this.invuln > 0 ? '#FF7AC8' : '#FF7AC866';
      ctx.fillStyle = this.invuln > 0 ? '#FF7AC833' : '#FF7AC811';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 1.55 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Magnet aura
    if (this.magnet && !b.crashed) {
      const c = b.chassis.getWorldPoint(new Vec2(0, 0.8));
      ctx.strokeStyle = '#FF547055';
      ctx.lineWidth = 0.06;
      for (let i = 0; i < 2; i++) {
        const r = ((this.time * 2 + i * 0.5) % 1) * MAGNET_R;
        ctx.globalAlpha = 1 - r / MAGNET_R;
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (const r of this.rings) {
      ctx.globalAlpha = 1 - r.t / 0.6;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 0.15;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, 0.5 + r.t * 6, 0.2 + r.t * 2, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Screen-space: speed lines + vignette
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const spd = b.speed();
    if ((spd > 19 || b.nitro > 0) && !b.crashed) {
      const k = Math.min(1, (spd - 15) / 15) + (b.nitro > 0 ? 0.5 : 0);
      ctx.strokeStyle = b.nitro > 0 ? 'rgba(41,227,214,0.5)' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 10 * k; i++) {
        const y = Math.random() * h;
        const x = Math.random() * w;
        const len = 60 + Math.random() * 140 * k;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len, y);
        ctx.stroke();
      }
    }
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(20,12,31,0)');
    vg.addColorStop(1, 'rgba(20,12,31,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    this.sfx.engine(!b.crashed && !this.paused, (this.input.gas || b.nitro > 0) && !this.finished, spd);
  }

  progress() {
    const x = this.bike.chassis.getPosition().x;
    return Math.max(0, Math.min(1, (x - this.track.start.x) / this.track.length));
  }
}

/** Coins: clusters along the ground, arcs over gaps, and a ring around the top of each loop. */
export function placeCoins(track: TrackData): Coin[] {
  const out: Coin[] = [];
  const add = (x: number, y: number) => {
    if (x < 8 || x > track.finish.x - 2) return;
    out.push({ x, y, taken: false, pulled: false });
  };
  const ground = track.chains.filter((c) => c.loop === undefined);
  for (const c of ground) {
    let dist = 0, nextAt = 6, inCluster = 0;
    for (let i = 1; i < c.pts.length; i++) {
      const a = c.pts[i - 1], b = c.pts[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x) * 1.5) { dist += seg; continue; }
      const nx = -(b.y - a.y) / seg, ny = (b.x - a.x) / seg;
      while (nextAt <= dist + seg) {
        const u = (nextAt - dist) / seg;
        add(a.x + (b.x - a.x) * u + nx * 1.1, a.y + (b.y - a.y) * u + ny * 1.1);
        inCluster++;
        if (inCluster >= 5) {
          inCluster = 0;
          nextAt += 16;
        } else nextAt += 2.2;
      }
      dist += seg;
    }
  }
  for (let i = 0; i + 1 < ground.length; i++) {
    const A = ground[i].pts[ground[i].pts.length - 1], B = ground[i + 1].pts[0];
    if (B.x - A.x < 3 || B.x - A.x > 20) continue;
    for (let k = 1; k <= 5; k++) {
      const u = k / 6;
      add(A.x + (B.x - A.x) * u, A.y + (B.y - A.y) * u + 1.4 + Math.sin(u * Math.PI) * 2.4);
    }
  }
  for (const l of track.loops) {
    for (let k = 0; k < 7; k++) {
      const th = Math.PI * (0.1 + (0.8 * k) / 6);
      add(l.cx + Math.cos(th) * (l.r - 1.2), l.cy + Math.sin(th) * (l.r - 1.2));
    }
  }
  return out;
}
