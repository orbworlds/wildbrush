/**
 * Full-screen combat effects: painted vignettes for getting hurt and for low health, the Masterstroke banner and strike prompt after a perfect dodge (and its flurry), and the death screen.
 */
import { PALETTE } from '../core/config.js';
import { splatCanvas, strokeCanvas } from './brush.js';
import { el, setClass, setText } from './dom.js';
import { paintedVignette } from './hud-art.js';
export class CombatFx {
  ctx;
  under;
  over;
  hurtV;
  lowV;
  ms;
  msBanner;
  msStroke;
  msPrompt;
  msKey;
  death;
  msOn = false;
  msFlurry = false;
  msT = 0;
  deathOn = false;
  deathT = 0;
  sawDead = false;
  strokes = new Map();
  lowOn = false;
  constructor(underHost, overHost, ctx) {
    this.ctx = ctx;
    this.under = el('div', 'wb-layer wb-cfx', underHost);
    this.lowV = el('div', 'cf-vig cf-low', this.under);
    this.lowV.style.backgroundImage = `url(${paintedVignette('#d4202a', 'low', {
      alpha: 0.9,
      strokes: 60,
      reach: 0.75,
      deep: '#7d0b17',
    })})`;
    this.hurtV = el('div', 'cf-vig cf-hurt', this.under);
    this.hurtV.style.backgroundImage = `url(${paintedVignette('#e0262b', 'hurt', {
      alpha: 1,
      strokes: 90,
      reach: 1.1,
      deep: '#8f0c18',
    })})`;
    this.over = el('div', 'wb-layer wb-cfx-over', overHost);
    this.ms = el('div', 'wb-layer cf-ms', this.over);
    el('div', 'ms-desat', this.ms);
    const inkVig = el('div', 'cf-vig ms-ink', this.ms);
    inkVig.style.backgroundImage = `url(${paintedVignette('#16171e', 'ink', {
      alpha: 1,
      strokes: 100,
      reach: 1.35,
      deep: '#07080c',
    })})`;
    this.msBanner = el('div', 'ms-banner', this.ms);
    this.msStroke = el('div', 'ms-stroke', this.msBanner);
    const dotA = splatCanvas(5, '#fffaf0', 'ms-dot-a', {
      rFrac: 0.14,
      tendrils: 6,
      drops: 10,
      reach: 1,
    });
    dotA.className = 'ms-dot a';
    this.msBanner.appendChild(dotA);
    const dotB = splatCanvas(5, '#fffaf0', 'ms-dot-b', {
      rFrac: 0.11,
      tendrils: 5,
      drops: 8,
      reach: 1,
    });
    dotB.className = 'ms-dot b';
    this.msBanner.appendChild(dotB);
    el('div', 'ms-title', this.msBanner, 'Masterstroke');
    this.msPrompt = el('div', 'ms-prompt', this.ms);
    this.msKey = el('span', 'wb-key wide', this.msPrompt, 'LMB');
    el('span', 'ms-ptext', this.msPrompt, 'Strike!');
    this.death = el('div', 'wb-layer cf-death', this.over);
    el('div', 'dt-grey', this.death);
    const deathInk = el('div', 'cf-vig dt-ink', this.death);
    deathInk.style.backgroundImage = `url(${paintedVignette('#1b1c22', 'death', {
      alpha: 1,
      strokes: 120,
      reach: 1.6,
      deep: '#0a0b0f',
    })})`;
    const box = el('div', 'dt-box', this.death);
    el('div', 'dt-title', box, 'Your colours fade…');
    const line = strokeCanvas(22, 1.6, '#c9c6bd', 'dt-line', {
      widthFrac: 0.55,
      dry: 0.6,
      taperStart: 0.1,
      taperEnd: 0.5,
      core: 0.4,
      alpha: 0.85,
    });
    line.className = 'dt-line';
    box.appendChild(line);
    el('div', 'dt-sub', box, '…but the brush remembers.');
  }
  strokeFor(color) {
    let url = this.strokes.get(color);
    if (!url) {
      url = strokeCanvas(34, 5, PALETTE[color].css, `ms-stroke-${color}`, {
        widthFrac: 0.72,
        pts: [
          [0.02, 0.62],
          [0.28, 0.5],
          [0.66, 0.52],
          [0.98, 0.4],
        ],
        dry: 0.5,
        taperStart: 0.05,
        taperEnd: 0.35,
        core: 0.6,
        sheen: 0.2,
        streak: 0.18,
        wobble: 0.2,
      }).toDataURL();
      this.strokes.set(color, url);
    }
    return url;
  }
  hurt(amount) {
    const peak = Math.min(0.88, 0.5 + amount * 0.28);
    this.hurtV.getAnimations().forEach((anim) => anim.cancel());
    this.hurtV.animate(
      [
        {
          opacity: 0,
          transform: 'scale(1.08)',
        },
        {
          opacity: peak,
          transform: 'scale(1.02)',
          offset: 0.08,
        },
        {
          opacity: peak * 0.55,
          transform: 'scale(1)',
          offset: 0.35,
        },
        {
          opacity: 0,
          transform: 'scale(1)',
        },
      ],
      {
        duration: 780,
        easing: 'ease-out',
      },
    );
  }
  masterstroke() {
    if (this.deathOn) return;
    this.msOn = true;
    this.msFlurry = false;
    this.msT = 0;
    const selectedColor = this.ctx.player?.state?.selectedColor;
    this.msStroke.style.backgroundImage = `url(${this.strokeFor(selectedColor && PALETTE[selectedColor] ? selectedColor : 'yellow')})`;
    setText(this.msKey, this.ctx.input?.usingGamepad ? 'X' : 'LMB');
    setClass(this.ms, 'on', true);
    setClass(this.ms, 'flurry', false);
    this.msBanner.getAnimations().forEach((anim) => anim.cancel());
    this.msBanner.animate(
      [
        {
          transform: 'translateX(-1.5em) scale(1.12) rotate(-3deg)',
          opacity: 0,
        },
        {
          transform: 'translateX(0.2em) scale(0.98) rotate(-1.2deg)',
          opacity: 1,
          offset: 0.6,
        },
        {
          transform: 'translateX(0) scale(1) rotate(-1.5deg)',
          opacity: 1,
        },
      ],
      {
        duration: 260,
        easing: 'cubic-bezier(.2,.9,.3,1)',
        fill: 'forwards',
      },
    );
  }
  flurry(active) {
    if (active) {
      if (!this.msOn) this.masterstroke();
      this.msFlurry = true;
      this.msT = 0;
      setClass(this.ms, 'flurry', true);
      this.msBanner.animate(
        [
          {
            filter: 'brightness(2.2)',
          },
          {
            filter: 'brightness(1)',
          },
        ],
        {
          duration: 350,
          easing: 'ease-out',
        },
      );
    } else if (this.msOn) this.endMasterstroke();
  }
  endMasterstroke() {
    this.msOn = false;
    this.msFlurry = false;
    setClass(this.ms, 'on', false);
    setClass(this.ms, 'flurry', false);
  }
  dead() {
    if (!this.deathOn) {
      this.endMasterstroke();
      this.deathOn = true;
      this.deathT = 0;
      this.sawDead = false;
      setClass(this.death, 'on', true);
      setClass(this.death, 'out', false);
    }
  }
  clearDeath(instant = false) {
    if (this.deathOn) {
      this.deathOn = false;
      setClass(this.death, 'out', !instant);
      setClass(this.death, 'on', false);
      if (!instant) setTimeout(() => setClass(this.death, 'out', false), 900);
    }
  }
  get isDead() {
    return this.deathOn;
  }
  update(dt, low) {
    const showLow = low && !this.deathOn;
    if (showLow !== this.lowOn) {
      this.lowOn = showLow;
      setClass(this.lowV, 'on', showLow);
    }
    if (this.msOn) {
      this.msT += dt;
      if ((!this.msFlurry && this.msT > 2.6) || this.msT > 7) this.endMasterstroke();
    }
    if (this.deathOn) {
      this.deathT += dt;
      const state = this.ctx.player?.state;
      if (state?.dead) this.sawDead = true;
      if ((this.sawDead && state && !state.dead && this.deathT > 1.2) || this.deathT > 14) this.clearDeath();
    }
  }
}
