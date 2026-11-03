import type { Body } from 'planck';
import type { TrackData, P, ChainDef } from './track';
import type { BikeSpec } from './catalog';
import { WHEEL_R } from './bike';

export type ThemeName = 'desert' | 'ice' | 'neon' | 'forest';

export interface Theme {
  sky: [string, string, string];
  sun: string;
  clouds: string | null;
  layers: [string, string, string];
  layerHi: [string, string, string];
  shape: 'mesa' | 'spikes' | 'city' | 'pines';
  body: string;
  dark: string;
  rim: string;
  strut: string;
  dust: string;
  glow: boolean;
  friction: number;
}

export const INK = '#140C1F';

export const THEMES: Record<ThemeName, Theme> = {
  desert: {
    sky: ['#FF7B54', '#FFB26B', '#FFE3B3'],
    sun: '#FFF3D6',
    clouds: '#FFE9D2',
    layers: ['#F4A27E', '#DC7C59', '#AE553B'],
    layerHi: ['#F8B593', '#E8916D', '#C4694B'],
    shape: 'mesa',
    body: '#8C3B2A', dark: '#3B1620', rim: '#FFD27A', strut: '#6B2E25',
    dust: '#E9BE8C', glow: false, friction: 1,
  },
  ice: {
    sky: ['#4F9BE8', '#94CCF7', '#E6F6FF'],
    sun: '#FFFFFF',
    clouds: '#FFFFFF',
    layers: ['#C4E3F8', '#92C4EC', '#5F98D0'],
    layerHi: ['#E2F3FF', '#B8DCF7', '#86B6E3'],
    shape: 'spikes',
    body: '#2E5C9A', dark: '#152C52', rim: '#E8FBFF', strut: '#3C6DAA',
    dust: '#FFFFFF', glow: false, friction: 0.7,
  },
  neon: {
    sky: ['#0E0624', '#2A0E52', '#7A1F86'],
    sun: '#FF5FBF',
    clouds: null,
    layers: ['#3A1A6B', '#271250', '#160A33'],
    layerHi: ['#4A2585', '#361A6A', '#221048'],
    shape: 'city',
    body: '#1B1440', dark: '#07040F', rim: '#29E3D6', strut: '#231A52',
    dust: '#29E3D6', glow: true, friction: 1,
  },
  forest: {
    sky: ['#6FBFAE', '#BCE6D0', '#F4F8DD'],
    sun: '#FFFBE6',
    clouds: '#FFFFFF',
    layers: ['#A9D1AB', '#70A87F', '#3E7350'],
    layerHi: ['#BCDDBA', '#84BA90', '#4F8A61'],
    shape: 'pines',
    body: '#5B3A22', dark: '#2A1A10', rim: '#B6E36A', strut: '#4A2F1C',
    dust: '#C9A779', glow: false, friction: 1,
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
const PERIOD = 3200;
const sceneryCache = new Map<string, Feature[][]>();

function scenery(theme: ThemeName): Feature[][] {
  let s = sceneryCache.get(theme);
  if (s) return s;
  s = [];
  const city = THEMES[theme].shape === 'city';
  for (let layer = 0; layer < 3; layer++) {
    const r = rng(theme.length * 997 + layer * 131 + 7);
    const feats: Feature[] = [];
    let x = 0;
    while (x < PERIOD) {
      const w = (city ? 70 + r() * 90 : 90 + r() * 240) * (1 + layer * 0.35);
      feats.push({ x, w, h: 0.35 + r() * 0.65, v: r() });
      x += w * (city ? 0.75 + r() * 0.4 : 0.55 + r() * 0.8);
    }
    s.push(feats);
  }
  sceneryCache.set(theme, s);
  return s;
}

interface Cloud { x: number; y: number; s: number; puffs: { dx: number; dy: number; r: number }[] }
let cloudCache: Cloud[] | null = null;
function clouds(): Cloud[] {
  if (cloudCache) return cloudCache;
  const r = rng(99);
  cloudCache = [];
  for (let i = 0; i < 9; i++) {
    const puffs = [];
    const n = 3 + Math.floor(r() * 3);
    for (let j = 0; j < n; j++) puffs.push({ dx: (j - n / 2) * 34 + r() * 12, dy: -r() * 22, r: 26 + r() * 22 });
    cloudCache.push({ x: r() * 2400, y: 0.08 + r() * 0.3, s: 0.6 + r() * 0.7, puffs });
  }
  return cloudCache;
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: ThemeName,
  camX: number,
  camY: number,
  ppm: number,
  time: number,
) {
  const t = THEMES[theme];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, t.sky[0]);
  g.addColorStop(0.6, t.sky[1]);
  g.addColorStop(1, t.sky[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  if (theme === 'neon') drawStars(ctx, w, h, camX * ppm * 0.02, time);

  // Sun
  const sx = w * 0.7 - camX * ppm * 0.01, sy = h * 0.32 + camY * ppm * 0.02, sr = Math.min(w, h) * 0.1;
  const glow = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 4.5);
  glow.addColorStop(0, t.sun + '88');
  glow.addColorStop(1, t.sun + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  if (theme === 'neon') {
    const sg = ctx.createLinearGradient(0, sy - sr, 0, sy + sr);
    sg.addColorStop(0, '#FFD36B');
    sg.addColorStop(1, '#FF3FA4');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = t.sky[1];
    for (let i = 0; i < 5; i++) {
      const yy = sy + sr * (0.1 + i * 0.19);
      ctx.fillRect(sx - sr, yy, sr * 2, 2 + i * 1.6);
    }
  } else {
    ctx.fillStyle = t.sun;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Clouds
  if (t.clouds) {
    const span = w + 600;
    for (const c of clouds()) {
      const x = ((((c.x - camX * ppm * 0.03 - time * 6 * c.s) % span) + span) % span) - 300;
      const y = h * c.y + camY * ppm * 0.01;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(c.s, c.s);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = t.clouds;
      ctx.beginPath();
      for (const p of c.puffs) {
        ctx.moveTo(p.dx + p.r, p.dy);
        ctx.arc(p.dx, p.dy, p.r, 0, Math.PI * 2);
      }
      ctx.fill();
      // flat base
      ctx.fillRect(c.puffs[0].dx - 10, -6, c.puffs[c.puffs.length - 1].dx - c.puffs[0].dx + 20, 18);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  const layers = scenery(theme);
  const scale = h / 720;
  for (let i = 0; i < 3; i++) {
    const f = [0.06, 0.14, 0.28][i];
    const base = h * [0.7, 0.8, 0.92][i] + camY * ppm * f * 0.3;
    const off = camX * ppm * f;
    const maxH = h * [0.36, 0.3, 0.26][i];
    const start = Math.floor(off / (PERIOD * scale)) - 1;
    for (let rep = start; rep <= start + 2 + Math.ceil(w / (PERIOD * scale)); rep++) {
      for (const ft of layers[i]) {
        const x0 = (rep * PERIOD + ft.x) * scale - off;
        const fw = ft.w * scale;
        if (x0 > w || x0 + fw < 0) continue;
        drawFeature(ctx, t, x0, base, fw, ft.h * maxH, ft.v, i, time);
      }
    }
    ctx.fillStyle = t.layers[i];
    ctx.fillRect(0, base - 1, w, h - base + 2);
    // haze between layers
    const hz = ctx.createLinearGradient(0, base - maxH * 0.6, 0, h);
    hz.addColorStop(0, t.sky[2] + '00');
    hz.addColorStop(1, t.sky[2] + (i === 2 ? '22' : '44'));
    ctx.fillStyle = hz;
    ctx.fillRect(0, base - maxH * 0.6, w, h);
  }
}

function drawStars(ctx: CanvasRenderingContext2D, w: number, h: number, off: number, time: number) {
  const r = rng(42);
  for (let i = 0; i < 110; i++) {
    const x = (((r() * w * 2 - off) % w) + w) % w;
    const y = r() * h * 0.62;
    const tw = 0.5 + 0.5 * Math.sin(time * 2 + i);
    ctx.fillStyle = `rgba(255,255,255,${0.25 + tw * 0.6})`;
    ctx.fillRect(x, y, 1.6, 1.6);
  }
}

function drawFeature(
  ctx: CanvasRenderingContext2D,
  t: Theme,
  x: number,
  base: number,
  w: number,
  h: number,
  v: number,
  layer: number,
  time: number,
) {
  const col = t.layers[layer], hi = t.layerHi[layer];
  switch (t.shape) {
    case 'mesa': {
      const inset = w * (0.1 + v * 0.1);
      const top = base - h;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x + inset, top + h * 0.12);
      ctx.lineTo(x + inset * 1.25, top);
      ctx.lineTo(x + w - inset * 1.3, top);
      ctx.lineTo(x + w - inset, top + h * 0.1);
      ctx.lineTo(x + w, base);
      ctx.closePath();
      ctx.fill();
      // lit cap + strata
      ctx.fillStyle = hi;
      ctx.fillRect(x + inset * 1.25, top, w - inset * 2.55, Math.max(3, h * 0.06));
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#000';
      for (let k = 1; k <= 3; k++) {
        const yy = top + h * (0.22 + k * 0.17);
        const ins = inset * (1 - (yy - top) / h);
        ctx.fillRect(x + ins + inset * 0.2, yy, w - ins * 2 - inset * 0.4, Math.max(1.5, h * 0.018));
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'spikes': {
      const n = 2 + Math.floor(v * 3);
      for (let i = 0; i < n; i++) {
        const px = x + (w * (i + 0.5)) / n;
        const ph = h * (0.55 + 0.45 * ((v * 7 + i * 0.37) % 1));
        const hw = (w / n) * 0.62;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(px - hw, base);
        ctx.lineTo(px, base - ph);
        ctx.lineTo(px + hw, base);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = hi;
        ctx.beginPath();
        ctx.moveTo(px - hw, base);
        ctx.lineTo(px, base - ph);
        ctx.lineTo(px - hw * 0.15, base);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'city': {
      const bw = w * 0.72;
      ctx.fillStyle = col;
      ctx.fillRect(x, base - h, bw, h);
      ctx.fillStyle = hi;
      ctx.fillRect(x, base - h, bw, 3);
      if (v > 0.6) ctx.fillRect(x + bw * 0.45, base - h - 14, 3, 14); // antenna
      if (layer > 0) {
        for (let wy = base - h + 10; wy < base - 8; wy += 14)
          for (let wx = x + 7; wx < x + bw - 9; wx += 12) {
            const k = (Math.floor(wx * 13 + wy * 7) % 7 + 7) % 7;
            if (k < 2) {
              const on = Math.sin(time * 0.5 + wx * 0.1 + wy) > -0.8;
              ctx.fillStyle = layer === 2 ? (on ? '#FF5FBF66' : '#FF5FBF22') : on ? '#29E3D655' : '#29E3D61A';
              ctx.fillRect(wx, wy, 5, 6);
            }
          }
      }
      break;
    }
    case 'pines': {
      const n = 1 + Math.floor(v * 3);
      for (let i = 0; i < n; i++) {
        const cx = x + (w * (i + 0.5)) / n;
        const th = h * (0.65 + 0.35 * ((v * 5 + i * 0.41) % 1));
        const tw = th * 0.32;
        ctx.fillStyle = t.dark + '55';
        ctx.fillRect(cx - tw * 0.08, base - th * 0.2, tw * 0.16, th * 0.2);
        for (let tier = 0; tier < 3; tier++) {
          const ty = base - th * 0.15 - tier * th * 0.26;
          const tw2 = tw * (1 - tier * 0.22);
          ctx.fillStyle = tier % 2 ? hi : col;
          ctx.beginPath();
          ctx.moveTo(cx - tw2, ty);
          ctx.lineTo(cx, ty - th * 0.45);
          ctx.lineTo(cx + tw2, ty);
          ctx.closePath();
          ctx.fill();
        }
      }
      break;
    }
  }
}

// ---------- world-space drawing (ctx transformed: meters, y-up) ----------

interface ChainGeo { top: P[]; mid: P[]; struts: { x: number; y: number }[] }
const geoCache = new WeakMap<ChainDef, ChainGeo>();

function chainGeo(c: ChainDef): ChainGeo {
  let g = geoCache.get(c);
  if (g) return g;
  const pts = c.pts;
  const normals: P[] = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: -dy / l, y: dx / l };
  });
  const off = (d: number) => pts.map((p, i) => ({ x: p.x + normals[i].x * d, y: p.y + normals[i].y * d }));
  const struts: { x: number; y: number }[] = [];
  if (c.loop === undefined) {
    let next = pts[0].x + 3;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i], b = pts[i + 1];
      if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x) * 2) continue; // walls
      while (next >= a.x && next < b.x) {
        const y = a.y + ((next - a.x) / (b.x - a.x)) * (b.y - a.y);
        struts.push({ x: next, y });
        next += 7;
      }
    }
  }
  g = { top: off(-0.05), mid: off(-0.3), struts };
  geoCache.set(c, g);
  return g;
}

function polyline(ctx: CanvasRenderingContext2D, pts: P[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
}

export function drawTrack(ctx: CanvasRenderingContext2D, data: TrackData, theme: ThemeName, ppm: number, viewL: number, viewR: number) {
  const t = THEMES[theme];
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const visible = data.chains.filter((c) => {
    const xs = c.pts.map((p) => p.x);
    return Math.max(...xs) > viewL - 2 && Math.min(...xs) < viewR + 2;
  });

  // Support struts
  for (const c of visible) {
    for (const s of chainGeo(c).struts) {
      if (s.x < viewL - 1 || s.x > viewR + 1) continue;
      ctx.fillStyle = t.strut;
      ctx.fillRect(s.x - 0.16, s.y - 60, 0.32, 60 - 0.3);
      ctx.fillStyle = t.dark + '66';
      ctx.fillRect(s.x + 0.04, s.y - 60, 0.12, 60 - 0.3);
      // cross brace
      ctx.strokeStyle = t.strut;
      ctx.lineWidth = 0.1;
      ctx.beginPath();
      ctx.moveTo(s.x - 0.16, s.y - 1.2);
      ctx.lineTo(s.x - 1.1, s.y - 0.35);
      ctx.moveTo(s.x + 0.16, s.y - 1.2);
      ctx.lineTo(s.x + 1.1, s.y - 0.35);
      ctx.stroke();
    }
  }

  // Beam: outline, body, rim
  for (const c of visible) {
    const g = chainGeo(c);
    polyline(ctx, g.mid);
    ctx.strokeStyle = t.dark;
    ctx.lineWidth = 0.72;
    ctx.stroke();
  }
  for (const c of visible) {
    const g = chainGeo(c);
    polyline(ctx, g.mid);
    ctx.strokeStyle = t.body;
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  if (t.glow) {
    ctx.shadowColor = t.rim;
    ctx.shadowBlur = 16;
  }
  for (const c of visible) {
    const g = chainGeo(c);
    polyline(ctx, g.top);
    ctx.strokeStyle = t.rim;
    ctx.lineWidth = 0.16;
    ctx.stroke();
  }
  ctx.shadowBlur = 0;
  // rivets
  ctx.fillStyle = t.dark + 'AA';
  for (const c of visible) {
    const m = chainGeo(c).mid;
    let acc = 0;
    for (let i = 1; i < m.length; i++) {
      acc += Math.hypot(m[i].x - m[i - 1].x, m[i].y - m[i - 1].y);
      if (acc > 1.4) {
        acc = 0;
        if (m[i].x < viewL || m[i].x > viewR) continue;
        ctx.beginPath();
        ctx.arc(m[i].x, m[i].y, 0.055, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

export function drawCoin(ctx: CanvasRenderingContext2D, x: number, y: number, time: number) {
  const sx = Math.abs(Math.cos(time * 3 + x * 0.7));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(Math.max(0.15, sx), 1);
  ctx.fillStyle = '#C77700';
  ctx.beginPath();
  ctx.arc(0, 0, 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFB21A';
  ctx.beginPath();
  ctx.arc(0, 0, 0.26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFE08A';
  ctx.fillRect(-0.05, -0.15, 0.1, 0.3);
  ctx.restore();
}

export function drawFlag(ctx: CanvasRenderingContext2D, p: P, reached: boolean, time: number) {
  ctx.fillStyle = INK;
  ctx.fillRect(p.x - 0.06, p.y, 0.12, 3);
  ctx.beginPath();
  ctx.arc(p.x, p.y + 3, 0.12, 0, Math.PI * 2);
  ctx.fill();
  const col = reached ? '#3DDC84' : '#FFC93C';
  ctx.beginPath();
  const n = 8;
  ctx.moveTo(p.x + 0.06, p.y + 2.9);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    ctx.lineTo(p.x + 0.06 + u * 1.3, p.y + 2.9 + Math.sin(time * 6 + u * 4) * 0.08 * u);
  }
  for (let i = n; i >= 0; i--) {
    const u = i / n;
    ctx.lineTo(p.x + 0.06 + u * 1.3, p.y + 2.2 + Math.sin(time * 6 + u * 4) * 0.08 * u);
  }
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.05;
  ctx.stroke();
}

export function drawFinish(ctx: CanvasRenderingContext2D, p: P) {
  const hgt = 4.6, half = 1.6, sq = 0.4;
  for (const sx of [-half, half]) {
    ctx.fillStyle = INK;
    ctx.fillRect(p.x + sx - 0.12, p.y, 0.24, hgt);
  }
  ctx.fillStyle = INK;
  ctx.fillRect(p.x - half - 0.2, p.y + hgt - 0.95, half * 2 + 0.4, 1.05);
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 8; col++) {
      ctx.fillStyle = (row + col) % 2 ? '#140C1F' : '#FFF4E2';
      ctx.fillRect(p.x - half + col * sq, p.y + hgt - 0.1 - (row + 1) * sq, sq, sq);
    }
  ctx.fillStyle = '#FFC93C';
  ctx.beginPath();
  ctx.arc(p.x - half, p.y + hgt + 0.25, 0.22, 0, Math.PI * 2);
  ctx.arc(p.x + half, p.y + hgt + 0.25, 0.22, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- bike ----------

export interface BikePose {
  cx: number; cy: number; ca: number;
  rx: number; ry: number; ra: number;
  fx: number; fy: number; fa: number;
  dx?: number; dy?: number; da?: number; // detached rider
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

/** A neutral pose for previews (garage cards). */
export function staticPose(x = 0, y = 0): BikePose {
  return { cx: x, cy: y, ca: 0, rx: x - 0.8, ry: y - 0.45, ra: 0, fx: x + 0.85, fy: y - 0.45, fa: 0 };
}

let OW = 0.04; // outline width (meters), set per draw from ppm

function shape(ctx: CanvasRenderingContext2D, fill: string, build: () => void) {
  ctx.beginPath();
  build();
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = OW;
  ctx.stroke();
}

function limb(ctx: CanvasRenderingContext2D, pts: number[], width: number, color: string) {
  const path = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  };
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  path();
  ctx.strokeStyle = INK;
  ctx.lineWidth = width + OW * 2;
  ctx.stroke();
  path();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function wheel(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, spec: BikeSpec) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(0, 0, WHEEL_R + OW * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2A2233';
  ctx.beginPath();
  ctx.arc(0, 0, WHEEL_R - 0.02, 0, Math.PI * 2);
  ctx.fill();
  if (spec.style === 'dirt') {
    ctx.fillStyle = INK;
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      ctx.save();
      ctx.rotate(ang);
      ctx.fillRect(WHEEL_R - 0.05, -0.04, 0.08, 0.08);
      ctx.restore();
    }
  }
  // rim
  ctx.strokeStyle = spec.accent === '#1E1330' ? '#D9D2E6' : spec.accent;
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.arc(0, 0, WHEEL_R * 0.64, 0, Math.PI * 2);
  ctx.stroke();
  if (spec.style === 'dirt') {
    ctx.strokeStyle = '#D9D2E6';
    ctx.lineWidth = 0.025;
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ang) * WHEEL_R * 0.62, Math.sin(ang) * WHEEL_R * 0.62);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = ctx.strokeStyle;
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i / 5) * Math.PI * 2);
      ctx.fillRect(0, -0.03, WHEEL_R * 0.62, 0.06);
      ctx.restore();
    }
  }
  ctx.fillStyle = '#D9D2E6';
  ctx.beginPath();
  ctx.arc(0, 0, 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = OW * 0.6;
  ctx.stroke();
  ctx.restore();
}

function drawRider(ctx: CanvasRenderingContext2D, spec: BikeSpec, onBike: boolean) {
  const tuck = spec.style === 'sport' ? 0.12 : 0;
  // leg
  limb(ctx, onBike ? [-0.3, 0.5, 0.14, 0.44, -0.02, 0.04] : [-0.3, 0.5, -0.05, 0.15, 0.1, -0.2], 0.18, '#2A2440');
  shape(ctx, INK, () => ctx.rect(onBike ? -0.12 : 0.02, onBike ? -0.04 : -0.27, 0.24, 0.12));
  // torso
  limb(ctx, [-0.3, 0.5, -0.02 + tuck, 0.98 - tuck * 0.6], 0.32, spec.suit);
  ctx.strokeStyle = spec.accent === '#1E1330' ? spec.paint : spec.accent;
  ctx.lineWidth = 0.07;
  ctx.beginPath();
  ctx.moveTo(-0.24, 0.6);
  ctx.lineTo(-0.02 + tuck, 0.94 - tuck * 0.6);
  ctx.stroke();
  // arm
  limb(ctx, onBike ? [tuck, 0.92 - tuck * 0.6, 0.24, 0.74, 0.46, 0.66] : [-0.02, 0.92, 0.15, 0.6, 0.3, 0.45], 0.13, spec.suit);
  shape(ctx, INK, () => ctx.arc(onBike ? 0.46 : 0.3, onBike ? 0.66 : 0.45, 0.07, 0, Math.PI * 2));
  // helmet
  const hx = 0.05 + tuck, hy = 1.2 - tuck * 0.7;
  shape(ctx, spec.helmet, () => ctx.arc(hx, hy, 0.24, 0, Math.PI * 2));
  ctx.fillStyle = '#FFFFFF66';
  ctx.beginPath();
  ctx.arc(hx - 0.06, hy + 0.08, 0.08, 0, Math.PI * 2);
  ctx.fill();
  shape(ctx, '#1D2433', () => {
    ctx.moveTo(hx + 0.06, hy + 0.08);
    ctx.quadraticCurveTo(hx + 0.27, hy + 0.06, hx + 0.24, hy - 0.1);
    ctx.lineTo(hx + 0.04, hy - 0.08);
  });
  ctx.fillStyle = '#7FD8FF88';
  ctx.fillRect(hx + 0.1, hy, 0.1, 0.04);
  if (spec.style === 'dirt') {
    shape(ctx, spec.helmet, () => {
      ctx.moveTo(hx - 0.05, hy + 0.2);
      ctx.lineTo(hx + 0.36, hy + 0.14);
      ctx.lineTo(hx + 0.3, hy + 0.08);
      ctx.lineTo(hx - 0.02, hy + 0.12);
    });
  }
}

function dirtBody(ctx: CanvasRenderingContext2D, s: BikeSpec) {
  // engine
  shape(ctx, '#4A4458', () => ctx.roundRect(-0.36, -0.32, 0.62, 0.4, 0.08));
  ctx.fillStyle = '#6E6880';
  ctx.fillRect(-0.28, -0.24, 0.46, 0.06);
  // exhaust
  limb(ctx, [-0.3, -0.2, -0.75, -0.02, -1.0, 0.1], 0.09, '#8E879E');
  // body panel
  shape(ctx, s.paint, () => {
    ctx.moveTo(-1.0, 0.24);
    ctx.lineTo(-0.55, 0.33);
    ctx.lineTo(0.1, 0.37);
    ctx.quadraticCurveTo(0.45, 0.54, 0.68, 0.37);
    ctx.lineTo(0.42, 0.04);
    ctx.lineTo(-0.36, 0.04);
  });
  ctx.fillStyle = '#FFFFFF55';
  ctx.fillRect(-0.5, 0.26, 0.5, 0.05);
  // side number plate
  shape(ctx, s.accent, () => ctx.ellipse(-0.6, 0.16, 0.14, 0.09, 0, 0, Math.PI * 2));
  // seat
  limb(ctx, [-0.82, 0.31, -0.06, 0.4], 0.09, '#241B30');
  // front fender
  shape(ctx, s.paint, () => {
    ctx.moveTo(0.6, 0.16);
    ctx.quadraticCurveTo(0.98, 0.27, 1.3, 0.06);
    ctx.lineTo(1.24, 0.0);
    ctx.quadraticCurveTo(0.98, 0.15, 0.62, 0.07);
  });
  // front plate
  shape(ctx, '#FFF4E2', () => ctx.ellipse(0.67, 0.43, 0.07, 0.14, -0.35, 0, Math.PI * 2));
  // handlebar
  limb(ctx, [0.58, 0.48, 0.48, 0.7], 0.06, '#241B30');
  limb(ctx, [0.4, 0.7, 0.58, 0.72], 0.06, '#241B30');
}

function sportBody(ctx: CanvasRenderingContext2D, s: BikeSpec) {
  shape(ctx, '#3D3550', () => ctx.roundRect(-0.36, -0.3, 0.6, 0.36, 0.08));
  limb(ctx, [-0.36, -0.22, -0.9, 0.12], 0.12, '#8E879E');
  // tail + tank + fairing
  shape(ctx, s.paint, () => {
    ctx.moveTo(-1.02, 0.42);
    ctx.lineTo(-0.5, 0.36);
    ctx.lineTo(-0.05, 0.4);
    ctx.quadraticCurveTo(0.3, 0.6, 0.62, 0.52);
    ctx.lineTo(0.98, 0.3);
    ctx.quadraticCurveTo(1.04, 0.08, 0.86, -0.06);
    ctx.lineTo(0.3, -0.24);
    ctx.lineTo(0.1, 0.02);
    ctx.lineTo(-0.4, 0.1);
    ctx.lineTo(-0.85, 0.24);
  });
  // accent stripe
  ctx.fillStyle = s.accent;
  ctx.beginPath();
  ctx.moveTo(-0.9, 0.33);
  ctx.lineTo(0.2, 0.3);
  ctx.lineTo(0.88, 0.12);
  ctx.lineTo(0.9, 0.04);
  ctx.lineTo(0.2, 0.2);
  ctx.lineTo(-0.88, 0.26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#FFFFFF55';
  ctx.fillRect(-0.4, 0.37, 0.5, 0.04);
  // windscreen
  shape(ctx, '#7FD8FF99', () => {
    ctx.moveTo(0.62, 0.52);
    ctx.quadraticCurveTo(0.8, 0.72, 0.9, 0.66);
    ctx.lineTo(0.98, 0.3);
  });
  // headlight
  shape(ctx, '#FFF4E2', () => ctx.ellipse(0.95, 0.2, 0.05, 0.08, 0.3, 0, Math.PI * 2));
  // seat
  limb(ctx, [-0.75, 0.43, -0.1, 0.44], 0.08, '#241B30');
  // clip-on bar
  limb(ctx, [0.6, 0.5, 0.46, 0.66], 0.06, '#241B30');
  // front fender
  shape(ctx, s.paint, () => {
    ctx.moveTo(0.7, 0.0);
    ctx.quadraticCurveTo(0.95, 0.06, 1.15, -0.06);
    ctx.lineTo(1.1, -0.11);
    ctx.quadraticCurveTo(0.95, -0.02, 0.72, -0.06);
  });
}

export interface BikeDrawOpts {
  alpha?: number;
  nitro?: boolean;
  time?: number;
  ppm: number;
}

export function drawBike(ctx: CanvasRenderingContext2D, p: BikePose, spec: BikeSpec, o: BikeDrawOpts) {
  OW = Math.max(0.03, 2 / o.ppm);
  ctx.save();
  ctx.globalAlpha = o.alpha ?? 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const ca = Math.cos(p.ca), sa = Math.sin(p.ca);
  const toWorld = (lx: number, ly: number) => [p.cx + lx * ca - ly * sa, p.cy + lx * sa + ly * ca];

  // nitro flame (behind everything)
  if (o.nitro) {
    const t = o.time ?? 0;
    ctx.save();
    ctx.translate(p.cx, p.cy);
    ctx.rotate(p.ca);
    const len = 1.1 + Math.sin(t * 40) * 0.2 + Math.random() * 0.25;
    const ex = spec.style === 'sport' ? -0.92 : -1.02, ey = spec.style === 'sport' ? 0.12 : 0.1;
    ctx.fillStyle = '#29E3D6';
    ctx.globalAlpha = (o.alpha ?? 1) * 0.85;
    ctx.beginPath();
    ctx.moveTo(ex, ey + 0.16);
    ctx.quadraticCurveTo(ex - len * 0.6, ey + 0.2, ex - len, ey);
    ctx.quadraticCurveTo(ex - len * 0.6, ey - 0.2, ex, ey - 0.16);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(ex, ey + 0.07);
    ctx.quadraticCurveTo(ex - len * 0.35, ey + 0.08, ex - len * 0.55, ey);
    ctx.quadraticCurveTo(ex - len * 0.35, ey - 0.08, ex, ey - 0.07);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = o.alpha ?? 1;
  }

  // swingarm & fork
  const [sx, sy] = toWorld(-0.1, -0.05);
  limb(ctx, [sx, sy, p.rx, p.ry], 0.11, '#4A4458');
  const [fx1, fy1] = toWorld(0.6, 0.5);
  limb(ctx, [fx1, fy1, p.fx, p.fy], 0.1, '#BDB6CC');

  wheel(ctx, p.rx, p.ry, p.ra, spec);
  wheel(ctx, p.fx, p.fy, p.fa, spec);

  ctx.save();
  ctx.translate(p.cx, p.cy);
  ctx.rotate(p.ca);
  if (spec.style === 'dirt') dirtBody(ctx, spec);
  else sportBody(ctx, spec);
  if (p.dx === undefined) drawRider(ctx, spec, true);
  ctx.restore();

  if (p.dx !== undefined) {
    ctx.save();
    ctx.translate(p.dx, p.dy!);
    ctx.rotate(p.da!);
    drawRider(ctx, spec, false);
    ctx.restore();
  }
  ctx.restore();
}

/** Renders a bike into a small canvas, for garage cards. */
export function bikePreview(canvas: HTMLCanvasElement, spec: BikeSpec) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || 180, h = canvas.clientHeight || 92;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d')!;
  const ppm = h / 2.4;
  ctx.setTransform(dpr * ppm, 0, 0, -dpr * ppm, (dpr * w) / 2, dpr * (h * 0.78));
  drawBike(ctx, staticPose(0, 0.45 + WHEEL_R), spec, { ppm });
}
