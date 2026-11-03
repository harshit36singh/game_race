export type GhostFrame = number[]; // [cx, cy, ca, rx, ry, ra, fx, fy, fa]

export interface LevelRecord {
  best: number; // seconds
  stars: number;
  ghost?: GhostFrame[];
}

const KEY = 'lr-progress-v1';

type Save = Record<number, LevelRecord>;

function load(): Save {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

let save = load();

export function getRecord(level: number): LevelRecord | undefined {
  return save[level];
}

export function isUnlocked(level: number) {
  return level === 0 || !!save[level - 1];
}

/** Returns true if this is a new best time. */
export function submitRun(level: number, time: number, stars: number, ghost: GhostFrame[]): boolean {
  const prev = save[level];
  if (prev && prev.best <= time) {
    prev.stars = Math.max(prev.stars, stars);
    persist();
    return false;
  }
  save[level] = { best: time, stars: Math.max(stars, prev?.stars ?? 0), ghost };
  persist();
  return true;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Storage full: drop ghosts and retry.
    for (const r of Object.values(save)) delete r.ghost;
    localStorage.setItem(KEY, JSON.stringify(save));
  }
}

export function totalStars() {
  return Object.values(save).reduce((s, r) => s + r.stars, 0);
}
