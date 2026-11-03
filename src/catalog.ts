import type { PowerupId } from './storage';

export interface BikeSpec {
  id: string;
  name: string;
  price: number;
  style: 'dirt' | 'sport';
  desc: string;
  paint: string;
  accent: string;
  suit: string;
  helmet: string;
  // physics
  maxSpeed: number; // wheel rad/s
  torque: number;
  lean: number;
  grip: number;
  susp: number; // suspension Hz
}

export const BIKES: BikeSpec[] = [
  {
    id: 'scout', name: 'Scout', price: 0, style: 'dirt',
    desc: 'Light, forgiving dirt bike. Where everyone starts.',
    paint: '#FF6A2B', accent: '#FFC93C', suit: '#2B4FD8', helmet: '#FF6A2B',
    maxSpeed: 58, torque: 14, lean: 30, grip: 1.35, susp: 4.5,
  },
  {
    id: 'dune', name: 'Dune Racer', price: 300, style: 'dirt',
    desc: 'More punch out of corners and grippier tyres.',
    paint: '#FFC93C', accent: '#1E1330', suit: '#1E1330', helmet: '#FFC93C',
    maxSpeed: 62, torque: 15.5, lean: 32, grip: 1.45, susp: 4.6,
  },
  {
    id: 'frost', name: 'Frost Fang', price: 650, style: 'sport',
    desc: 'Sport fairing, higher top speed, stiffer springs.',
    paint: '#E8FBFF', accent: '#29E3D6', suit: '#13305E', helmet: '#29E3D6',
    maxSpeed: 66, torque: 16.5, lean: 34, grip: 1.5, susp: 5,
  },
  {
    id: 'volt', name: 'Volt X', price: 1100, style: 'sport',
    desc: 'Electric torque. Snappy flips, sticky tyres.',
    paint: '#9BE05A', accent: '#1E1330', suit: '#1E1330', helmet: '#9BE05A',
    maxSpeed: 70, torque: 18, lean: 38, grip: 1.6, susp: 5.2,
  },
  {
    id: 'inferno', name: 'Inferno GT', price: 1800, style: 'sport',
    desc: 'The fastest thing in the garage. Hold on.',
    paint: '#E8263A', accent: '#FFC93C', suit: '#2A0E1A', helmet: '#FFC93C',
    maxSpeed: 74, torque: 19.5, lean: 42, grip: 1.7, susp: 5.5,
  },
];

export function bikeById(id: string): BikeSpec {
  return BIKES.find((b) => b.id === id) ?? BIKES[0];
}

/** 0..1 stat bars for the garage. */
export function bikeStats(b: BikeSpec) {
  return {
    speed: (b.maxSpeed - 50) / 26,
    power: (b.torque - 11) / 10,
    grip: (b.grip - 1.1) / 0.7,
    air: (b.lean - 24) / 20,
  };
}

export interface PowerupSpec {
  id: PowerupId;
  name: string;
  glyph: string;
  key: string;
  pack: number;
  price: number;
  desc: string;
}

export const POWERUPS: PowerupSpec[] = [
  { id: 'nitro', name: 'Nitro', glyph: '»', key: 'E', pack: 3, price: 45, desc: '1.6s rocket boost. Great before loops and big gaps.' },
  { id: 'jump', name: 'Super Jump', glyph: '⤒', key: 'Q', pack: 3, price: 45, desc: 'Launch straight up off the ground. Clears anything.' },
  { id: 'shield', name: 'Shield', glyph: '◈', key: 'auto', pack: 1, price: 40, desc: 'Saves you from one crash and puts you back on your wheels.' },
  { id: 'magnet', name: 'Coin Magnet', glyph: 'U', key: 'auto', pack: 1, price: 30, desc: 'Pulls in coins from far away for a whole race.' },
];
