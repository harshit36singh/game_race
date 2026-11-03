import type { Controls } from './bike';

export class Input implements Controls {
  gas = false;
  brake = false;
  leanBack = false;
  leanFwd = false;
  private keys = new Set<string>();
  private touch = { gas: false, brake: false, leanBack: false, leanFwd: false };
  onAction: (a: 'pause' | 'restart') => void = () => {};

  constructor() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') this.onAction('pause');
      else if (e.code === 'KeyR') this.onAction('restart');
      this.keys.add(e.code);
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      this.sync();
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.sync();
    });
    addEventListener('blur', () => {
      this.keys.clear();
      this.sync();
    });

    document.querySelectorAll<HTMLElement>('[data-ctl]').forEach((el) => {
      const k = el.dataset.ctl as keyof typeof this.touch;
      const set = (v: boolean) => (e: Event) => {
        e.preventDefault();
        this.touch[k] = v;
        el.classList.toggle('down', v);
        this.sync();
      };
      el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture((e as PointerEvent).pointerId);
        set(true)(e);
      });
      el.addEventListener('pointerup', set(false));
      el.addEventListener('pointercancel', set(false));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  private sync() {
    const k = this.keys;
    this.gas = k.has('ArrowUp') || k.has('KeyW') || this.touch.gas;
    this.brake = k.has('ArrowDown') || k.has('KeyS') || k.has('Space') || this.touch.brake;
    this.leanBack = k.has('ArrowLeft') || k.has('KeyA') || this.touch.leanBack;
    this.leanFwd = k.has('ArrowRight') || k.has('KeyD') || this.touch.leanFwd;
  }

  any() {
    return this.gas || this.brake || this.leanBack || this.leanFwd;
  }
}
