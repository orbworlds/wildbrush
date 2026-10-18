/**
 * The four Prism Trials (Ember, Frost, Spring, Bloom): where each shrine stands, a tracker of which are complete, and the HUD row of prisms that fill in, with a prism flying into place when a trial is won.
 */
import { COLORS, LANDMARKS, PALETTE } from '../core/config.js';
import { washCanvas } from './brush.js';
import { el, setClass, setStyle } from './dom.js';
import { prismSvg } from './icons.js';
export const TRIALS = [
  {
    color: 'red',
    landmark: 'grove',
    title: 'Ember Trial',
    place: 'The hidden grove beyond the canyon',
  },
  {
    color: 'blue',
    landmark: 'lakeIslet',
    title: 'Frost Trial',
    place: 'The islet in the western lake',
  },
  {
    color: 'yellow',
    landmark: 'tower',
    title: 'Spring Trial',
    place: 'The ruined tower on the eastern hill',
  },
  {
    color: 'green',
    landmark: 'mesa',
    title: 'Bloom Trial',
    place: 'High atop the north-western mesa',
  },
];
export class TrialTracker {
  ctx;
  done = new Set();
  listeners = [];
  constructor(ctx) {
    this.ctx = ctx;
    ctx.events.on('content:shrine-complete', (data) => {
      let color = data?.color && PALETTE[data.color] ? data.color : undefined;
      if (!color && data?.id)
        color = TRIALS.find((trial) => data.id.toLowerCase().includes(trial.landmark.toLowerCase()))?.color;
      color ||= COLORS.find((color) => !this.done.has(color));
      if (color) this.complete(color);
    });
  }
  complete(color) {
    if (!this.done.has(color)) {
      this.done.add(color);
      for (const listener of this.listeners) listener(color);
    }
  }
  sync() {
    const count = Math.min(4, Math.max(0, this.ctx.content?.shrinesComplete ?? 0));
    if (count > this.done.size)
      for (const trial of TRIALS) {
        if (this.done.size >= count) break;
        if (!this.done.has(trial.color)) {
          this.done.add(trial.color);
          for (const listener of this.listeners) listener(trial.color);
        }
      }
  }
  onChange(fn) {
    this.listeners.push(fn);
  }
  position(trial, out) {
    const landmark = this.ctx.terrain?.landmarks?.[trial.landmark];
    if (landmark) return out.copy(landmark);
    const fallback = LANDMARKS[trial.landmark];
    return out.set(fallback.x, 0, fallback.z);
  }
}
export class TrialsHud {
  tracker;
  root;
  items = {};
  label;
  attention = 8;
  constructor(host, tracker) {
    this.tracker = tracker;
    this.root = el('div', 'wb-trials', host);
    const row = el('div', 'tr-row', this.root);
    const back = washCanvas(15, 7.4, 'trials', 0.62);
    back.className = 'tr-back';
    row.appendChild(back);
    for (const trial of TRIALS) {
      const pip = el('div', 'tr-p', row);
      pip.style.setProperty('--tc', PALETTE[trial.color].css);
      el('div', 'tr-tint', pip);
      pip.insertAdjacentHTML('beforeend', prismSvg());
      this.items[trial.color] = pip;
    }
    this.label = el('div', 'tr-lbl', this.root);
    this.refresh(null);
    tracker.onChange((color) => this.refresh(color));
  }
  refresh(justDone) {
    this.label.innerHTML = `Prism Trials&nbsp; <b>${this.tracker.done.size}</b>&thinsp;/&thinsp;4`;
    for (const trial of TRIALS)
      if (trial.color !== justDone) setClass(this.items[trial.color], 'done', this.tracker.done.has(trial.color));
    if (justDone) {
      this.attention = 12;
      this.fly(justDone);
    }
  }
  fly(color) {
    const pip = this.items[color];
    const land = () => {
      setClass(pip, 'done', true);
      pip.animate(
        [
          {
            transform: 'scale(0.5) rotate(-30deg)',
            filter: 'brightness(3)',
          },
          {
            transform: 'scale(1.7) rotate(6deg)',
            filter: 'brightness(2)',
            offset: 0.4,
          },
          {
            transform: 'scale(1) rotate(0deg)',
            filter: 'brightness(1)',
          },
        ],
        {
          duration: 900,
          easing: 'cubic-bezier(.2,1.2,.3,1)',
        },
      );
    };
    try {
      const host = this.root.parentElement ?? this.root;
      const flyer = el('div', 'tr-fly', host, prismSvg());
      flyer.style.setProperty('--tc', PALETTE[color].css);
      const hostRect = host.getBoundingClientRect();
      const pipRect = pip.getBoundingClientRect();
      const fw = flyer.offsetWidth || 40;
      const fh = flyer.offsetHeight || 56;
      const x0 = hostRect.width / 2 - fw / 2;
      const y0 = hostRect.height * 0.4 - fh / 2;
      const x1 = pipRect.left - hostRect.left + pipRect.width / 2 - fw / 2;
      const y1 = pipRect.top - hostRect.top + pipRect.height / 2 - fh / 2;
      const endScale = pipRect.width / fw;
      const tf = (x, y, s, rot) => `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s}) rotate(${rot}deg)`;
      const anim = flyer.animate(
        [
          {
            transform: tf(x0, y0 + 30, 0.2, -120),
            opacity: 0,
          },
          {
            transform: tf(x0, y0, 2.3, 8),
            opacity: 1,
            offset: 0.22,
          },
          {
            transform: tf(x0, y0 - 8, 2, 0),
            opacity: 1,
            offset: 0.55,
            easing: 'cubic-bezier(.55,0,.3,1)',
          },
          {
            transform: tf(x1, y1, endScale, 0),
            opacity: 1,
          },
        ],
        {
          duration: 2300,
          easing: 'ease-out',
          fill: 'forwards',
        },
      );
      anim.onfinish = () => {
        flyer.remove();
        land();
      };
    } catch {
      land();
    }
  }
  update(dt) {
    this.attention = Math.max(0, this.attention - dt);
    setStyle(this.root, 'opacity', this.attention > 0 ? '1' : '0.62');
  }
  poke() {
    this.attention = 6;
  }
}
