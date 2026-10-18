/**
 * Full-screen overlays: the fade to and from black, whose promise resolves when it ends, and the Click to take control notice shown while the pointer is free. Also the heart limits (at most 20 hearts, 10 per row) and quarter-heart rounding used by the hearts row.
 */
import { el, setClass, setStyle } from './dom.js';
export class ScreenFade {
  root;
  timer = 0;
  resolve = null;
  constructor(host) {
    this.root = el('div', 'wb-layer wb-fade', host);
  }
  black = false;
  run(black, duration = 0.6) {
    this.black = black;
    const secs = Math.max(0, Number.isFinite(duration) ? duration : 0.6);
    this.resolve &&= (clearTimeout(this.timer), this.resolve(), null);
    setStyle(this.root, 'transition-duration', `${secs}s`);
    setStyle(this.root, 'opacity', black ? '1' : '0');
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.timer = window.setTimeout(
        () => {
          this.resolve = null;
          resolve();
        },
        secs * 1000 + 16,
      );
    });
  }
}
export class RelockPrompt {
  root;
  on = false;
  constructor(host) {
    this.root = el('div', 'wb-relock', host, 'Click to take control');
  }
  set(on) {
    if (on !== this.on) {
      this.on = on;
      setClass(this.root, 'on', on);
    }
  }
}
export const MAX_HEARTS = 20;
export const HEARTS_PER_ROW = 10;
export const roundToQuarter = (v) => Math.round(v * 4) / 4;
export const isNum = (v) => typeof v == 'number' && Number.isFinite(v);
