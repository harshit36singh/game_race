import { TrackBuilder, TrackData } from './track';
import type { ThemeName } from './render';

export interface Level {
  name: string;
  theme: ThemeName;
  build: () => TrackData;
}

const tb = () => new TrackBuilder();

export const LEVELS: Level[] = [
  {
    name: 'Dusty Start',
    theme: 'desert',
    build: () =>
      tb()
        .flat(14).hill(12, 1.8).flat(6).slope(14, -3).bumps(3, 5, 0.7).flat(8)
        .checkpoint()
        .flat(4).kicker(6, 1.5).gap(6, -1).landing(10, 2).flat(10)
        .hill(16, 3).flat(6).slope(12, 2.5).flat(4).slope(12, -4).flat(10)
        .finish(),
  },
  {
    name: 'Canyon Loop',
    theme: 'desert',
    build: () =>
      tb()
        .flat(10).slope(18, -6).flat(6).loop(4).flat(8)
        .checkpoint()
        .flat(4).hill(10, 1.5).slope(14, 3).flat(4).kicker(5, 1.2).gap(7, -2).landing(10, 3).flat(6)
        .slope(16, -5).flat(4).loop(4.5).flat(6)
        .checkpoint()
        .bumps(4, 4, 0.8).flat(10)
        .finish(),
  },
  {
    name: 'Frost Bite',
    theme: 'ice',
    build: () =>
      tb()
        .flat(10).slope(14, -4).bumps(5, 4.5, 0.9).flat(6)
        .kicker(6, 2).gap(8, 0).landing(12, 3).flat(6)
        .checkpoint()
        .steps(4, 5, 1).flat(4).slope(16, -7).flat(4).loop(4).flat(6)
        .checkpoint()
        .hill(14, 3).flat(4).kicker(5, 1.5).gap(9, -3).landing(10, 2).flat(10)
        .finish(),
  },
  {
    name: 'Glacier Drop',
    theme: 'ice',
    build: () =>
      tb()
        .flat(8).kicker(6, 2).gap(10, -6).landing(14, 4).flat(6)
        .checkpoint()
        .flat(4).kicker(5, 1.5).gap(7, -0.5).landing(8, 1.5).flat(6).slope(14, -6).flat(3).loop(4.2).flat(6)
        .checkpoint()
        .hill(8, -2).hill(8, -2).flat(4).steps(3, 4, -1.2).flat(6)
        .kicker(5, 1.8).gap(8, -4).landing(12, 3).flat(10)
        .finish(),
  },
  {
    name: 'Neon Rings',
    theme: 'neon',
    build: () =>
      tb()
        .flat(8).slope(16, -6).flat(4).loop(4).flat(12).loop(3.8).flat(6)
        .checkpoint()
        .bumps(3, 6, 0.7).flat(8).kicker(5, 1.6).gap(7, -1).landing(12, 3).flat(4)
        .flat(4).slope(18, -7).flat(3).loop(4.2).flat(8)
        .checkpoint()
        .hill(12, 2.5).flat(10)
        .finish(),
  },
  {
    name: 'Night Shift',
    theme: 'neon',
    build: () =>
      tb()
        .flat(8).steps(5, 4, 0.9).flat(3).kicker(5, 1.5).gap(9, -4).landing(12, 3).flat(6)
        .checkpoint()
        .bumps(4, 4, 0.6).flat(6).slope(16, -6).flat(3).loop(4).flat(10).loop(4.2).flat(6)
        .checkpoint()
        .flat(4).kicker(5, 1.5).gap(8, -1).landing(10, 2).flat(3).kicker(5, 1.5).gap(8, -2).landing(10, 3).flat(10)
        .finish(),
  },
  {
    name: 'Pine Ridge',
    theme: 'forest',
    build: () =>
      tb()
        .flat(10).hill(16, 2.5).hill(18, 3).flat(6).slope(20, -8).loop(4.5).flat(6)
        .checkpoint()
        .bumps(4, 6, 1.4).flat(4).kicker(6, 2.2).gap(10, -2).landing(12, 3).flat(6)
        .checkpoint()
        .steps(4, 4, 1.1).flat(3).slope(14, -7).loop(4).flat(4).hill(10, 2).flat(10)
        .finish(),
  },
  {
    name: 'Timber Trouble',
    theme: 'forest',
    build: () =>
      tb()
        .flat(8).kicker(5, 1.5).gap(7, -1).landing(8, 2).kicker(5, 1.5).gap(7, -1).landing(8, 2).flat(6)
        .checkpoint()
        .slope(18, -8).loop(4.2).flat(2).slope(10, -2).loop(4.5).flat(6)
        .checkpoint()
        .bumps(5, 4, 1.2).steps(4, 4, 1).flat(3).kicker(6, 2).gap(12, -6).landing(14, 4).flat(10)
        .finish(),
  },
];

/** Par times scale with track length. Returns [3-star, 2-star] thresholds in seconds. */
export function starTimes(length: number): [number, number] {
  return [Math.round((length / 16) * 10) / 10, Math.round((length / 12) * 10) / 10];
}
