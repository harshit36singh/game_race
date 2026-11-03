import { Game } from './game';
import { Input } from './input';
import { Sfx } from './audio';
import { LEVELS, starTimes } from './levels';
import { drawBackground } from './render';
import { getRecord, isUnlocked, submitRun, totalStars } from './storage';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const ctx = canvas.getContext('2d')!;
const input = new Input();
const sfx = new Sfx();

let game: Game | null = null;
let W = 0, H = 0, DPR = 1;
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

function resize() {
  DPR = Math.min(devicePixelRatio || 1, 2);
  W = innerWidth;
  H = innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
}
addEventListener('resize', resize);
resize();

// ---------- screens ----------

const screens = ['menu', 'levels', 'pause', 'result'] as const;
type Screen = (typeof screens)[number] | null;

function show(s: Screen) {
  for (const id of screens) $(id).classList.toggle('hidden', id !== s);
  const playing = s === null || s === 'pause' || s === 'result';
  $('hud').classList.toggle('hidden', !playing || !game);
  $('touch').classList.toggle('hidden', s !== null || !isTouch || !game);
}

function fmt(t: number) {
  return t.toFixed(2);
}

function starsFor(level: number, time: number) {
  const [three, two] = starTimes(LEVELS[level].build().length);
  return time <= three ? 3 : time <= two ? 2 : 1;
}

function starHtml(n: number) {
  return [0, 1, 2].map((i) => (i < n ? '★' : '<span class="off">★</span>')).join('');
}

function renderLevelGrid() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const rec = getRecord(i);
    const unlocked = isUnlocked(i);
    const b = document.createElement('button');
    b.className = `level-card ${lv.theme}${unlocked ? '' : ' locked'}`;
    b.innerHTML = `
      <div class="num">${unlocked ? i + 1 : '🔒'}</div>
      <div class="name">${lv.name}</div>
      <div class="stars">${starHtml(rec?.stars ?? 0)}</div>
      <div class="best">${rec ? 'Best ' + fmt(rec.best) + 's' : unlocked ? 'Not raced' : 'Locked'}</div>`;
    if (unlocked) b.onclick = () => startLevel(i);
    grid.appendChild(b);
  });
  $('stars-total').innerHTML = `<span class="stars">★</span> ${totalStars()} / ${LEVELS.length * 3}`;
}

function popup(text: string, kind = '') {
  const el = document.createElement('div');
  el.className = `popup ${kind}`;
  el.textContent = text;
  const box = $('popups');
  box.innerHTML = '';
  box.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

function startLevel(i: number) {
  sfx.unlock();
  game = new Game(i, input, sfx);
  game.onPopup = popup;
  game.onFinish = (info) => finish(i, info);
  $('hud-level').textContent = `${i + 1}. ${LEVELS[i].name}`;
  show(null);
}

function finish(level: number, info: { time: number; flips: number; ghost: number[][] }) {
  const stars = starsFor(level, info.time);
  const prev = getRecord(level)?.best;
  const isBest = submitRun(level, info.time, stars, info.ghost);
  const [three, two] = starTimes(LEVELS[level].build().length);
  $('result-title').textContent = isBest && prev !== undefined ? 'New Record!' : 'Finished!';
  $('result-stars').innerHTML = `<span class="stars">${starHtml(stars)}</span>`;
  $('result-time').textContent = `${fmt(info.time)}s`;
  $('result-detail').textContent =
    `Flips: ${info.flips}${prev !== undefined ? `   ·   Best: ${fmt(Math.min(prev, info.time))}s` : ''}\n` +
    `★★★ ${fmt(three)}s   ·   ★★ ${fmt(two)}s`;
  $('btn-next').classList.toggle('hidden', level + 1 >= LEVELS.length);
  show('result');
}

function togglePause() {
  if (!game || game.finished) return;
  game.paused = !game.paused;
  show(game.paused ? 'pause' : null);
}

input.onAction = (a) => {
  if (!game) return;
  if (a === 'pause') togglePause();
  else if (a === 'restart' && !game.finished) {
    game.paused = false;
    game.restartFromStart();
    show(null);
  }
};

$('btn-play').onclick = () => {
  sfx.unlock();
  renderLevelGrid();
  show('levels');
};
$('btn-levels-back').onclick = () => show('menu');
$('btn-pause').onclick = togglePause;
$('btn-resume').onclick = togglePause;
$('btn-restart').onclick = () => game && startLevel(game.levelIndex);
$('btn-retry').onclick = () => game && startLevel(game.levelIndex);
$('btn-next').onclick = () => game && startLevel(game.levelIndex + 1);
const toTracks = () => {
  game = null;
  renderLevelGrid();
  show('levels');
};
$('btn-quit').onclick = toTracks;
$('btn-result-levels').onclick = toTracks;
const muteBtn = $('btn-mute');
muteBtn.textContent = sfx.muted ? '🔇' : '🔊';
muteBtn.onclick = () => (muteBtn.textContent = sfx.toggleMute() ? '🔇' : '🔊');
addEventListener('visibilitychange', () => {
  if (document.hidden && game && !game.paused && !game.finished) togglePause();
});

// ---------- main loop ----------

let last = performance.now();
let menuX = 0;
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game) {
    game.update(dt);
    game.render(ctx, W, H, DPR);
    $('hud-time').textContent = fmt(game.displayTime());
    $('hud-progress').style.width = `${game.progress() * 100}%`;
  } else {
    sfx.engine(false, false, 0);
    menuX += dt * 6;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground(ctx, W, H, 'desert', menuX, 0, Math.min(H / 15, W / 22));
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
show('menu');
