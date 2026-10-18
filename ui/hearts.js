/**
 * Heart row in the HUD: painted hearts fill and drain by quarters behind a lagging ghost, crack and splash on damage, sparkle when healed or when a new heart is gained, and beat when health runs low.
 */
import { damp } from '../core/math.js';
import { washCanvas } from './brush.js';
import { el, setClass, setStyle } from './dom.js';
import { crackPath, getHeartArt, SPARKLE_SVG } from './hud-art.js';
import { HEARTS_PER_ROW, isNum, MAX_HEARTS, roundToQuarter } from './overlays.js';
export class Hearts {
  ctx;
  root;
  row;
  hearts = [];
  max = 0;
  shown = -1;
  target = -1;
  ghost = -1;
  ghostHold = 0;
  idleFor = 0;
  lowNow = false;
  deadNow = false;
  art = getHeartArt();
  back;
  constructor(host, ctx) {
    this.ctx = ctx;
    this.root = el('div', 'wb-hearts', host);
    const back = washCanvas(20, 7, 'hearts-back', 0.5);
    back.className = 'hp-back';
    this.root.appendChild(back);
    this.back = back;
    this.row = el('div', 'hp-row', this.root);
  }
  get low() {
    return this.lowNow;
  }
  build(max) {
    const prevMax = this.max;
    this.row.textContent = '';
    this.hearts = [];
    this.max = max;
    setStyle(this.row, 'width', `${Math.min(max, HEARTS_PER_ROW) * 2.5 + 0.3}em`);
    const rows = Math.ceil(max / HEARTS_PER_ROW);
    setStyle(this.back, 'width', `${Math.max(20, Math.min(max, HEARTS_PER_ROW) * 2.5 + 8)}em`);
    setStyle(this.back, 'height', `${7 + (rows - 1) * 2.4}em`);
    for (let i = 0; i < max; i++) {
      const heart = el('div', 'hp-h', this.row);
      heart.style.setProperty('--d', `${i * 45}ms`);
      const bg = el('i', 'hp-bg', heart);
      bg.style.backgroundImage = `url(${this.art.back})`;
      const ghost = el('i', 'hp-gh', heart);
      ghost.style.backgroundImage = `url(${this.art.ghost})`;
      const fill = el('i', 'hp-f', heart);
      fill.style.backgroundImage = `url(${this.art.fill})`;
      const line = el('i', 'hp-ln', heart);
      line.style.backgroundImage = `url(${this.art.line})`;
      heart.insertAdjacentHTML(
        'beforeend',
        `<svg class="hp-crack" viewBox="0 0 100 100" preserveAspectRatio="none"><path class="ck-a" d="${crackPath(`ck-${i}`)}" pathLength="1"/><path class="ck-b" d="${crackPath(`ck-${i}`)}" pathLength="1"/></svg>`,
      );
      this.hearts.push({
        root: heart,
        fill,
        ghost,
        crack: heart.querySelector('svg'),
        shownF: '',
        shownG: '',
      });
    }
    if (prevMax > 0 && max > prevMax)
      for (let i = prevMax; i < max; i++) {
        const heart = this.hearts[i];
        if (heart) {
          heart.root.classList.add('fresh');
          this.sparkle(heart, 200, 8);
          setTimeout(() => heart.root.classList.remove('fresh'), 1400);
        }
      }
  }
  update(dt) {
    const state = this.ctx.player?.state;
    if (!state || !isNum(state.health)) {
      setClass(this.root, 'off', true);
      return;
    }
    setClass(this.root, 'off', false);
    const max = Math.max(1, Math.min(MAX_HEARTS, Math.round(isNum(state.healthMax) ? state.healthMax : 5)));
    if (max !== this.max) {
      this.build(max);
      this.shown = this.target = this.ghost = -1;
    }
    const health = roundToQuarter(Math.min(max, Math.max(0, state.health)));
    if (this.shown < 0) this.shown = this.target = this.ghost = health;
    else if (health < this.target - 0.0001) {
      this.onLoss(this.target, health);
      this.target = health;
      this.shown = health;
      this.ghostHold = 0.42;
    } else if (health > this.target + 0.0001) {
      this.onGain(this.target, health);
      this.target = health;
    }
    if (this.shown < this.target)
      this.shown = Math.min(this.target, this.shown + dt * 2.6 + (this.target - this.shown) * damp(4, dt));
    if (this.ghost < this.shown) this.ghost = this.shown;
    if (this.ghostHold > 0) this.ghostHold -= dt;
    else if (this.ghost > this.shown) {
      this.ghost -= dt * 1.4 + (this.ghost - this.shown) * damp(6, dt);
      if (this.ghost < this.shown + 0.004) this.ghost = this.shown;
    }
    for (let i = 0; i < this.hearts.length; i++) {
      const heart = this.hearts[i];
      const fill = Math.min(1, Math.max(0, this.shown - i));
      const ghost = Math.min(1, Math.max(0, this.ghost - i));
      const fillDeg = (fill * 360).toFixed(1);
      const ghostDeg = (ghost * 360).toFixed(1);
      if (fillDeg !== heart.shownF) {
        heart.shownF = fillDeg;
        setStyle(heart.fill, '--a', `${fillDeg}deg`);
        setClass(heart.fill, 'full', fill >= 0.999);
        setClass(heart.root, 'empty', fill <= 0.001 && ghost <= 0.001);
      }
      if (ghostDeg !== heart.shownG) {
        heart.shownG = ghostDeg;
        setStyle(heart.ghost, '--a', `${ghostDeg}deg`);
        setClass(heart.ghost, 'full', ghost >= 0.999);
      }
    }
    const low = health > 0 && health <= 1 && !state.dead;
    this.lowNow = low;
    setClass(this.root, 'low', low);
    const beat = low ? Math.max(0, Math.ceil(health) - 1) : -1;
    for (let i = 0; i < this.hearts.length; i++) setClass(this.hearts[i].root, 'beat', i === beat);
    if (!!state.dead !== this.deadNow) {
      this.deadNow = !!state.dead;
      setClass(this.root, 'dead', this.deadNow);
    }
    const full = health >= max - 0.0001;
    this.idleFor = full ? this.idleFor + dt : 0;
    setClass(this.root, 'idle', this.idleFor > 8);
  }
  onLoss(from, to) {
    const first = Math.floor(to + 0.0001);
    const last = Math.min(this.hearts.length - 1, Math.ceil(from - 0.0001) - 1);
    for (let i = first; i <= last; i++) {
      const heart = this.hearts[i];
      if (heart) {
        this.splash(heart, i === last ? 1 : 0.7);
        heart.root.animate(
          [
            {
              transform: 'translate(0,0) scale(1)',
              filter: 'brightness(2.4)',
            },
            {
              transform: 'translate(-0.14em,0.05em) scale(1.18) rotate(-6deg)',
              filter: 'brightness(1.6)',
              offset: 0.18,
            },
            {
              transform: 'translate(0.12em,-0.04em) scale(1.06) rotate(4deg)',
              offset: 0.42,
            },
            {
              transform: 'translate(-0.05em,0) scale(1.02) rotate(-1deg)',
              offset: 0.7,
            },
            {
              transform: 'none',
              filter: 'brightness(1)',
            },
          ],
          {
            duration: 520,
            easing: 'ease-out',
          },
        );
      }
    }
    const crackIndex = Math.max(first, Math.min(last, this.hearts.length - 1));
    const cracked = this.hearts[crackIndex];
    if (cracked) {
      cracked.crack.getAnimations().forEach((anim) => anim.cancel());
      cracked.crack.animate(
        [
          {
            opacity: 1,
          },
          {
            opacity: 1,
            offset: 0.7,
          },
          {
            opacity: 0,
          },
        ],
        {
          duration: 1300,
          easing: 'ease-in',
        },
      );
      for (const path of cracked.crack.querySelectorAll('path'))
        path.animate(
          [
            {
              strokeDashoffset: 1,
            },
            {
              strokeDashoffset: 0,
            },
          ],
          {
            duration: 170,
            easing: 'cubic-bezier(.2,.8,.3,1)',
            fill: 'both',
          },
        );
    }
    this.idleFor = 0;
    this.row.animate(
      [
        {
          translate: '0 0',
        },
        {
          translate: '-0.3em 0.1em',
        },
        {
          translate: '0.26em -0.08em',
        },
        {
          translate: '-0.16em 0.05em',
        },
        {
          translate: '0.08em 0',
        },
        {
          translate: '0 0',
        },
      ],
      {
        duration: 380,
        easing: 'ease-out',
      },
    );
  }
  splash(heart, scale) {
    const splat = document.createElement('i');
    splat.className = 'hp-splash';
    heart.root.insertBefore(splat, heart.root.firstChild);
    splat.style.backgroundImage = `url(${this.art.splash})`;
    const angle = Math.round(Math.random() * 360);
    splat.animate(
      [
        {
          transform: `scale(${0.25 * scale}) rotate(${angle}deg)`,
          opacity: 1,
        },
        {
          transform: `scale(${1.05 * scale}) rotate(${angle + 8}deg)`,
          opacity: 0.9,
          offset: 0.35,
        },
        {
          transform: `scale(${1.25 * scale}) rotate(${angle + 12}deg)`,
          opacity: 0,
        },
      ],
      {
        duration: 620,
        easing: 'cubic-bezier(.15,.9,.3,1)',
      },
    ).onfinish = () => splat.remove();
  }
  onGain(from, to) {
    const first = Math.max(0, Math.floor(from + 0.0001));
    const last = Math.min(this.hearts.length - 1, Math.ceil(to - 0.0001) - 1);
    const many = last - first > 2;
    for (let i = first; i <= last; i++) {
      const heart = this.hearts[i];
      if (!heart) continue;
      const delay = many ? (i - first) * 70 : (i - first) * 110;
      heart.root.animate(
        [
          {
            transform: 'scale(1)',
            filter: 'brightness(1)',
          },
          {
            transform: 'scale(1.28)',
            filter: 'brightness(1.9)',
            offset: 0.35,
          },
          {
            transform: 'scale(0.96)',
            offset: 0.7,
          },
          {
            transform: 'scale(1)',
            filter: 'brightness(1)',
          },
        ],
        {
          duration: 520,
          delay,
          easing: 'cubic-bezier(.2,1.2,.4,1)',
        },
      );
      this.sparkle(heart, delay, many ? 3 : 5);
    }
    this.idleFor = 0;
  }
  sparkle(heart, delay, count) {
    for (let i = 0; i < count; i++) {
      const spark = el('i', 'hp-spark', heart.root, SPARKLE_SVG);
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.8;
      const dist = 1.3 + Math.random() * 0.7;
      const scale = 0.55 + Math.random() * 0.55;
      spark.animate(
        [
          {
            transform: 'translate(0,0) scale(0) rotate(0deg)',
            opacity: 1,
          },
          {
            transform: `translate(${(Math.cos(angle) * dist * 0.6).toFixed(2)}em,${(Math.sin(angle) * dist * 0.6).toFixed(2)}em) scale(${scale}) rotate(45deg)`,
            opacity: 1,
            offset: 0.45,
          },
          {
            transform: `translate(${(Math.cos(angle) * dist).toFixed(2)}em,${(Math.sin(angle) * dist - 0.3).toFixed(2)}em) scale(0) rotate(90deg)`,
            opacity: 0,
          },
        ],
        {
          duration: 700 + Math.random() * 250,
          delay: delay + i * 25,
          easing: 'cubic-bezier(.2,.8,.3,1)',
          fill: 'backwards',
        },
      ).onfinish = () => spark.remove();
    }
  }
}
