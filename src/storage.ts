export type GhostFrame = number[]; // [cx, cy, ca, rx, ry, ra, fx, fy, fa]

export interface LevelRecord {
  best: number; // seconds
  stars: number;
  ghost?: GhostFrame[];
  ghostBike?: string;
}

export type PowerupId = 'nitro' | 'jump' | 'shield' | 'magnet';

export interface Profile {
  coins: number;
  bikes: string[];
  bike: string;
  pu: Record<PowerupId, number>;
}

const KEY = 'lr-progress-v1';
const PROFILE_KEY = 'lr-profile-v1';

type Save = Record<number, LevelRecord>;

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? { ...fallback, ...JSON.parse(v) } : fallback;
  } catch {
    return fallback;
  }
}

let save: Save = read<Save>(KEY, {});
const profile: Profile = read<Profile>(PROFILE_KEY, {
  coins: 100,
  bikes: ['scout'],
  bike: 'scout',
  pu: { nitro: 2, jump: 1, shield: 0, magnet: 0 },
});

// ---------- levels ----------

export function getRecord(level: number): LevelRecord | undefined {
  return save[level];
}

export function isUnlocked(level: number) {
  return level === 0 || !!save[level - 1];
}

/** Returns true if this is a new best time. */
export function submitRun(level: number, time: number, stars: number, ghost: GhostFrame[], bike: string): boolean {
  const prev = save[level];
  if (prev && prev.best <= time) {
    prev.stars = Math.max(prev.stars, stars);
    persist();
    return false;
  }
  save[level] = { best: time, stars: Math.max(stars, prev?.stars ?? 0), ghost, ghostBike: bike };
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

// ---------- profile / economy ----------

function persistProfile() {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function getProfile(): Readonly<Profile> {
  return profile;
}

export function addCoins(n: number) {
  profile.coins += Math.max(0, Math.round(n));
  persistProfile();
}

export function spend(price: number): boolean {
  if (profile.coins < price) return false;
  profile.coins -= price;
  persistProfile();
  return true;
}

export function ownBike(id: string) {
  if (!profile.bikes.includes(id)) profile.bikes.push(id);
  persistProfile();
}

export function equipBike(id: string) {
  if (profile.bikes.includes(id)) profile.bike = id;
  persistProfile();
}

export function addPowerup(id: PowerupId, n: number) {
  profile.pu[id] = (profile.pu[id] ?? 0) + n;
  persistProfile();
}

/** Uses one charge. Returns false if none left. */
export function usePowerup(id: PowerupId): boolean {
  if ((profile.pu[id] ?? 0) <= 0) return false;
  profile.pu[id]--;
  persistProfile();
  return true;
}
