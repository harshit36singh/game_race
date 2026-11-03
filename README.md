# Loop Rider

A physics-based 2D motorbike stunt racer for the browser. Ride across floating tracks, go through full loops, land jumps and flip for time bonuses. Each track records a ghost of your best run that you race against.

## Play locally

```bash
npm install
npm run dev
```

Then open the URL Vite prints. Use `npm run build` to make a static build in `dist/` that you can host anywhere (GitHub Pages, Netlify, etc.).

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Gas | `↑` / `W` | GAS button |
| Brake / reverse | `↓` / `S` / `Space` | BRAKE button |
| Lean back / forward | `←` `→` / `A` `D` | ⟲ / ⟳ buttons |
| Restart | `R` | Pause → Restart |
| Pause | `Esc` / `P` | ❚❚ button |

## Features

- 8 tracks across 4 themes (desert, ice, neon, forest)
- Full loops, ramps, gaps, bumps and stairs
- Every completed flip takes 1 second off your time
- Checkpoints: after a crash you respawn at the last flag
- Up to 3 stars per track, and finishing a track unlocks the next one
- Your best run is saved as a ghost to race against
- Synthesized engine and effect sounds, no audio files needed

## Tech

- [Vite](https://vitejs.dev/) + TypeScript
- [Planck.js](https://piqnt.com/planck.js/) (Box2D) for physics: wheel joints for suspension, a motor on the rear wheel, and one-sided chain collisions
- HTML5 Canvas 2D rendering, with all art drawn in code

## Project layout

```
src/
  main.ts     UI screens, main loop
  game.ts     simulation, collision rules, crashes, flips, ghosts, camera
  bike.ts     bike + rider physics and controls
  track.ts    track builder (flat, slope, hill, kicker, gap, loop, ...)
  levels.ts   level definitions and star times
  render.ts   themes, parallax scenery, bike/track drawing
  input.ts    keyboard + touch input
  audio.ts    WebAudio sound effects
  storage.ts  best times, stars and ghosts in localStorage
```

### Adding a track

Levels are written with the chainable `TrackBuilder` in `src/levels.ts`:

```ts
tb().flat(10).slope(18, -6).loop(4).checkpoint().kicker(5, 1.5).gap(7, -1).landing(10, 2).finish()
```
