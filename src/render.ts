import type { Body } from 'planck';
import type { TrackData, P } from './track';
import { WHEEL_R } from './bike';

export type ThemeName = 'desert' | 'ice' | 'neon' | 'forest';

export interface Theme {
  sky: [string, string, string];
  sun: string;
  layers: [string, string, string];
  shape: 'mesa' | 'spikes' | 'city' | 'pines';
  track: string;
  trackHi: string;
  friction: number;
}

export const THEMES: Record<ThemeName, Theme> = {
  desert: {
    sky: ['#ff9a5a', '#ffc98a', '#fff0d2'],
    sun: '#fff7e3',
    layers: ['#efb48a', '#d98a60', '#b8643f'],
    shape: 'mesa',
    track: '#4a1a10',
    trackHi: '#e8603c',
    friction: 1,
  },
  ice: {
    sky: ['#5aa8ea', '#9fd2f8', '#e8f7ff'],
    sun: '#ffffff',
    layers: ['#c6e4f7', '#9ccbec', '#6ea9d8'],
    shape: 'spikes',
    track: '#13305e',
    trackHi: '#4aa3ff',
    friction: 0.7,
  },
  neon: {
    sky: ['#0b0620', '#26104f', '#6d2384'],
    sun: '#ff5fd2',
    layers: ['#2a1656', '#1e0f42', '#120830'],
    shape: 'city',
    track: '#03252b',
    trackHi: '#26f5ff',
    friction: 1,
  },
  forest: {
    sky: ['#8fd1c0', '#cdeedb', '#f3fae4'],
    sun: '#fffbe0',
    layers: ['#9cc9a4', '#6aa57a', '#3f7a52'],
    shape: 'pines',
    track: '#2e1d0f',
    trackHi: '#b07a3e',
    friction: 1,
  },
};

// ---------- seeded scenery ----------

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

interface Feature { x: number; w: number; h: number; v: number }
const PERIOD = 3000;
const sceneryCache = new Map<string, Feature[][]>();

function scenery(theme: ThemeName): Feature[][] {
  let s = sceneryCache.get(theme);
  if (s) return s;
  s = [];
  for (let layer = 0; layer < 3; layer++) {
    const r = rng(theme.length * 997 + layer * 131 + 7);
    const feats: Feature[] = [];
    let x = 0;
    while (x < PERIOD) {
      const w = 60 + r() * (THEMES[theme].shape === 'city' ? 80 : 220) * (1 + layer * 0.3);
      feats.push({ x, w, h: 0.3 + r() * 0.7, v: r() });
      x += w * (0.5 + r() * 0.9);
    }
    s.push(feats);
  }
  sceneryCache.set(theme, s);
  return s;
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: ThemeName,
  camX: number,
  camY: number,
  ppm: number,
) {
  const t = THEMES[theme];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, t.sky[0]);
  g.addColorStop(0.55, t.sky[1]);
  g.addColorStop(1, t.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Sun / moon with glow
  const sx = w * 0.72, sy = h * 0.3, sr = Math.min(w, h) * 0.09;
  const glow = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 4);
  glow.addColorStop(0, t.sun + 'aa');
  glow.addColorStop(1, t.sun + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = t.sun;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();

  if (theme === 'neon') drawStars(ctx, w, h, camX * ppm * 0.02);

  const layers = scenery(theme);
  const scale = h / 700;
  for (let i = 0; i < 3; i++) {
    const f = [0.08, 0.18, 0.32][i];
    const base = h * [0.72, 0.8, 0.9][i] + camY * ppm * f * 0.25;
    const off = camX * ppm * f;
    ctx.fillStyle = t.layers[i];
    const maxH = h * [0.35, 0.3, 0.25][i];
    const start = Math.floor(off / (PERIOD * scale)) - 1;
    for (let rep = start; rep <= start + 2 + Math.ceil(w / (PERIOD * scale)); rep++) {
      for (const ft of layers[i]) {
        const x0 = (rep * PERIOD + ft.x) * scale - off;
        const fw = ft.w * scale;
        if (x0 > w || x0 + fw < 0) continue;
        drawFeature(ctx, t.shape, x0, base, fw, ft.h * maxH, ft.v, i, t);
      }
    }
    ctx.fillStyle = t.layers[i];
    ctx.fillRect(0, base - 1, w, h - base + 2);
  }
}

function drawStars(ctx: CanvasRenderingContext2D, w: number, h: number, off: number) {
  const r = rng(42);
  ctx.fillStyle = '#ffffffaa';
  for (let i = 0; i < 90; i++) {
    const x = (((r() * w * 2 - off) % w) + w) % w;
    const y = r() * h * 0.6;
    ctx.fillRect(x, y, 1.5, 1.5);
  }
}

function drawFeature(
  ctx: CanvasRenderingContext2D,
  shape: Theme['shape'],
  x: number,
  base: number,
  w: number,
  h: number,
  v: number,
  layer: number,
  t: Theme,
) {
  ctx.beginPath();
  switch (shape) {
    case 'mesa': {
      const inset = w * (0.12 + v * 0.1);
      ctx.moveTo(x, base);
      ctx.lineTo(x + inset, base - h * 0.85);
      ctx.lineTo(x + inset * 1.2, base - h);
      ctx.lineTo(x + w - inset * 1.3, base - h);
      ctx.lineTo(x + w - inset, base - h * 0.9);
      ctx.lineTo(x + w, base);
      break;
    }
    case 'spikes': {
      const n = 2 + Math.floor(v * 3);
      ctx.moveTo(x, base);
      for (let i = 0; i < n; i++) {
        const px = x + (w * (i + 0.5)) / n;
        const ph = h * (0.6 + 0.4 * ((v * 7 + i * 0.37) % 1));
        ctx.lineTo(px, base - ph);
        ctx.lineTo(x + (w * (i + 1)) / n, base - ph * 0.25);
      }
      ctx.lineTo(x + w, base);
      break;
    }
    case 'city': {
      const bw = w * 0.7;
      ctx.rect(x, base - h, bw, h);
      ctx.fill();
      if (layer > 0) {
        ctx.fillStyle = layer === 2 ? '#ff4fd877' : '#26f5ff55';
        for (let wy = base - h + 8; wy < base - 8; wy += 14)
          for (let wx = x + 6; wx < x + bw - 8; wx += 12)
            if ((wx * 13 + wy * 7) % 5 < 2) ctx.fillRect(wx, wy, 5, 6);
        ctx.fillStyle = t.layers[layer];
      }
      return;
    }
    case 'pines': {
      const n = 1 + Math.floor(v * 3);
      for (let i = 0; i < n; i++) {
        const cx = x + (w * (i + 0.5)) / n;
        const th = h * (0.7 + 0.3 * ((v * 5 + i * 0.41) % 1));
        const tw = th * 0.35;
        ctx.moveTo(cx - tw, base);
        ctx.lineTo(cx, base - th);
        ctx.lineTo(cx + tw, base);
      }
      break;
    }
  }
  ctx.closePath();
  ctx.fill();
}

// ---------- world-space drawing (ctx already transformed: meters, y-up) ----------

export function drawTrack(ctx: CanvasRenderingContext2D, data: TrackData, theme: ThemeName, ppm: number) {
  const t = THEMES[theme];
  const path = (pts: P[]) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (theme === 'neon') {
    ctx.shadowColor = t.trackHi;
    ctx.shadowBlur = 14;
  }
  for (const c of data.chains) {
    path(c.pts);
    ctx.strokeStyle = t.track;
    ctx.lineWidth = Math.max(0.2, 5 / ppm);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  for (const c of data.chains) {
    path(c.pts);
    ctx.strokeStyle = t.trackHi;
    ctx.lineWidth = Math.max(0.09, 2.2 / ppm);
    ctx.stroke();
  }
}

export function drawFlag(ctx: CanvasRenderingContext2D, p: P, color: string, reached: boolean) {
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 0.08;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(p.x, p.y + 2.6);
  ctx.stroke();
  ctx.fillStyle = reached ? '#3ddc84' : color;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y + 2.6);
  ctx.lineTo(p.x + 1.1, p.y + 2.25);
  ctx.lineTo(p.x, p.y + 1.9);
  ctx.closePath();
  ctx.fill();
}

export function drawFinish(ctx: CanvasRenderingContext2D, p: P) {
  const hgt = 4.2, sq = 0.35;
  for (const side of [-0.1, 0.1]) {
    ctx.fillStyle = '#222';
    ctx.fillRect(p.x + side - 0.06, p.y, 0.12, hgt);
  }
  // checkered banner
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 6; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#111' : '#fff';
      ctx.fillRect(p.x - 1.05 + col * sq, p.y + hgt - (row + 1) * sq, sq, sq);
    }
  // ground checker
  ctx.globalAlpha = 0.6;
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = i % 2 ? '#111' : '#fff';
    ctx.fillRect(p.x - 0.2 + (i % 2) * 0.2, p.y - 0.1 + Math.floor(i / 2) * 0.2 - 0.2, 0.2, 0.2);
  }
  ctx.globalAlpha = 1;
}

export interface BikePose {
  cx: number; cy: number; ca: number;
  rx: number; ry: number; ra: number;
  fx: number; fy: number; fa: number;
  // detached rider (if any)
  dx?: number; dy?: number; da?: number;
}

export function poseOf(chassis: Body, rear: Body, front: Body, rider: Body | null): BikePose {
  const c = chassis.getPosition(), r = rear.getPosition(), f = front.getPosition();
  const pose: BikePose = {
    cx: c.x, cy: c.y, ca: chassis.getAngle(),
    rx: r.x, ry: r.y, ra: rear.getAngle(),
    fx: f.x, fy: f.y, fa: front.getAngle(),
  };
  if (rider) {
    const d = rider.getPosition();
    pose.dx = d.x; pose.dy = d.y; pose.da = rider.getAngle();
  }
  return pose;
}

function wheel(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, rim: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = '#1b1b1f';
  ctx.beginPath();
  ctx.arc(0, 0, WHEEL_R, 0, Math.PI * 2);
  ctx.fill();
  // tread knobs
  ctx.fillStyle = '#2c2c33';
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    ctx.save();
    ctx.rotate(ang);
    ctx.fillRect(WHEEL_R - 0.06, -0.035, 0.07, 0.07);
    ctx.restore();
  }
  ctx.fillStyle = '#d8d8de';
  ctx.beginPath();
  ctx.arc(0, 0, WHEEL_R * 0.66, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b1b1f';
  ctx.beginPath();
  ctx.arc(0, 0, WHEEL_R * 0.58, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rim;
  ctx.lineWidth = 0.035;
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang) * WHEEL_R * 0.58, Math.sin(ang) * WHEEL_R * 0.58);
    ctx.stroke();
  }
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(0, 0, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, pts: number[], width: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
}

function drawRider(ctx: CanvasRenderingContext2D, suit: string, helmet: string, onBike: boolean) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // leg
  line(ctx, onBike ? [-0.3, 0.5, 0.12, 0.45, -0.02, 0.02] : [-0.3, 0.5, -0.05, 0.15, 0.1, -0.2], 0.17, '#1e2a44');
  ctx.fillStyle = '#111';
  ctx.fillRect(onBike ? -0.12 : 0.02, onBike ? -0.05 : -0.27, 0.22, 0.1); // boot
  // torso
  line(ctx, [-0.3, 0.5, -0.02, 0.98], 0.3, suit);
  // stripe
  line(ctx, [-0.22, 0.6, 0.0, 0.95], 0.06, '#ffffffaa');
  // arm
  line(ctx, onBike ? [-0.02, 0.92, 0.22, 0.74, 0.46, 0.66] : [-0.02, 0.92, 0.15, 0.6, 0.3, 0.45], 0.12, suit);
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(onBike ? 0.46 : 0.3, onBike ? 0.66 : 0.45, 0.07, 0, Math.PI * 2);
  ctx.fill();
  // helmet
  ctx.fillStyle = helmet;
  ctx.beginPath();
  ctx.arc(0.05, 1.2, 0.23, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-0.18, 1.16, 0.2, 0.05); // helmet stripe
  ctx.fillStyle = '#1d2433';
  ctx.beginPath();
  ctx.moveTo(0.12, 1.28);
  ctx.quadraticCurveTo(0.3, 1.25, 0.28, 1.12);
  ctx.lineTo(0.1, 1.12);
  ctx.closePath();
  ctx.fill();
  // visor peak
  line(ctx, [0.0, 1.4, 0.32, 1.36], 0.05, helmet);
}

export function drawBike(
  ctx: CanvasRenderingContext2D,
  p: BikePose,
  color: string,
  suit: string,
  alpha = 1,
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const ca = Math.cos(p.ca), sa = Math.sin(p.ca);
  const toWorld = (lx: number, ly: number) => [p.cx + lx * ca - ly * sa, p.cy + lx * sa + ly * ca];

  // swingarm & fork (world space so suspension travel is visible)
  const [sx, sy] = toWorld(-0.1, -0.05);
  line(ctx, [sx, sy, p.rx, p.ry], 0.11, '#3a3a44');
  const [fx1, fy1] = toWorld(0.6, 0.5);
  line(ctx, [fx1, fy1, p.fx, p.fy], 0.1, '#9aa0aa');

  wheel(ctx, p.rx, p.ry, p.ra, color);
  wheel(ctx, p.fx, p.fy, p.fa, color);

  ctx.save();
  ctx.translate(p.cx, p.cy);
  ctx.rotate(p.ca);

  // engine
  ctx.fillStyle = '#4a4a55';
  ctx.beginPath();
  ctx.roundRect(-0.35, -0.3, 0.6, 0.38, 0.08);
  ctx.fill();
  line(ctx, [-0.3, -0.2, -0.75, -0.05, -0.95, 0.05], 0.08, '#777'); // exhaust
  // body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-0.95, 0.22);
  ctx.lineTo(-0.55, 0.32);
  ctx.lineTo(0.1, 0.36);
  ctx.quadraticCurveTo(0.45, 0.52, 0.66, 0.36);
  ctx.lineTo(0.4, 0.06);
  ctx.lineTo(-0.35, 0.06);
  ctx.closePath();
  ctx.fill();
  // seat
  line(ctx, [-0.8, 0.3, -0.05, 0.39], 0.09, '#15151a');
  // front fender + number plate
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0.6, 0.14);
  ctx.quadraticCurveTo(0.95, 0.24, 1.25, 0.05);
  ctx.lineTo(1.2, 0.0);
  ctx.quadraticCurveTo(0.95, 0.14, 0.62, 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(0.66, 0.42, 0.06, 0.13, -0.35, 0, Math.PI * 2);
  ctx.fill();
  // handlebar
  line(ctx, [0.58, 0.48, 0.48, 0.68], 0.06, '#222');
  line(ctx, [0.4, 0.68, 0.56, 0.7], 0.06, '#222');

  if (p.dx === undefined) drawRider(ctx, suit, color, true);
  ctx.restore();

  if (p.dx !== undefined) {
    ctx.save();
    ctx.translate(p.dx, p.dy!);
    ctx.rotate(p.da!);
    drawRider(ctx, suit, color, false);
    ctx.restore();
  }
  ctx.restore();
}
