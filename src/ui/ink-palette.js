/**
 * Ink palette: a glass jar for each paint colour whose liquid tracks the hero's ink, with the selected colour's name, a cost preview while an art charges, and flashes when ink runs out or is refilled.
 */
import { COLORS, PALETTE } from '../core/config.js';
import { shade, splatCanvas, strokeCanvas } from './brush.js';
import { el, setClass, setStyle } from './dom.js';
const JAR_PATH =
  'M24 13 L24 19.5 C12 22.5 7 32.5 7 45 C7 61 18 72.5 32 72.5 C46 72.5 57 61 57 45 C57 32.5 52 22.5 40 19.5 L40 13 Z';
const JAR_WAVE_PATH = 'M0 20 q8 -3 16 0 t16 0 t16 0 t16 0 t16 0 t16 0 t16 0 V 90 H0 Z';
const JAR_LEFT = 2.3;
const JAR_SPACING = 4.3;
export class InkPalette {
  ctx;
  root;
  jars = {};
  labels = {};
  nameBox;
  note;
  selected = null;
  pvKey = '';
  pvColor = null;
  splashes = {};
  activity = 0;
  constructor(host, ctx) {
    this.ctx = ctx;
    this.root = el('div', 'wb-palette', host);
    const back = strokeCanvas(21, 7.4, '#0c0d12', 'palette-back', {
      widthFrac: 0.62,
      pts: [
        [0.08, 0.62],
        [0.4, 0.55],
        [0.7, 0.58],
        [0.96, 0.5],
      ],
      dry: 0.5,
      taperStart: 0.2,
      taperEnd: 0.18,
      core: 0.6,
      alpha: 0.9,
    });
    back.className = 'pl-back';
    this.root.appendChild(back);
    this.nameBox = el('div', 'pl-name', this.root);
    COLORS.forEach((color, i) => {
      const splash = splatCanvas(7, PALETTE[color].css, `pal-splash-${color}`, {
        rFrac: 0.2,
        tendrils: 7,
        drops: 14,
        reach: 1.1,
      });
      splash.className = 'pl-splash';
      splash.style.left = `${JAR_LEFT + i * JAR_SPACING - 3.5}em`;
      this.root.appendChild(splash);
      this.splashes[color] = splash;
    });
    COLORS.forEach((color, i) => {
      const pal = PALETTE[color];
      const label = el('div', 'pl-lab', this.nameBox);
      const stroke = strokeCanvas(7.8, 2.2, shade(pal.css, -0.08), `pal-name-${color}`, {
        widthFrac: 0.8,
        dry: 0.3,
        sheen: 0.12,
        streak: 0.1,
      });
      label.appendChild(stroke);
      const text = el('span', '', label, pal.name);
      if (color === 'yellow') text.classList.add('dark');
      this.labels[color] = label;
      const jar = el('div', 'wb-jar', this.root);
      jar.style.left = `${JAR_LEFT + i * JAR_SPACING}em`;
      jar.style.setProperty('--jc', pal.css);
      el('div', 'j-glow', jar);
      const id = `wbj-${color}`;
      jar.insertAdjacentHTML(
        'beforeend',
        `<svg viewBox="0 0 64 76">
          <defs>
            <clipPath id="${id}-c"><path d="${JAR_PATH}"/></clipPath>
            <linearGradient id="${id}-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="${shade(pal.css, 0.35)}"/>
              <stop offset="0.35" stop-color="${pal.css}"/>
              <stop offset="1" stop-color="${shade(pal.css, -0.35)}"/>
            </linearGradient>
            <clipPath id="${id}-hc"><rect class="j-hlr" x="-40" y="0" width="160" height="20"/></clipPath>
            <pattern id="${id}-hp" patternUnits="userSpaceOnUse" width="4.6" height="4.6" patternTransform="rotate(40)">
              <rect width="2" height="4.6" fill="#ffffff"/>
            </pattern>
            <radialGradient id="${id}-s" cx="0.38" cy="0.52" r="0.62">
              <stop offset="0.55" stop-color="#000" stop-opacity="0"/>
              <stop offset="1" stop-color="#000" stop-opacity="0.38"/>
            </radialGradient>
          </defs>
          <path class="j-glass" d="${JAR_PATH}"/>
          <path d="${JAR_PATH}" fill="${pal.css}" opacity="0.16"/>
          <g clip-path="url(#${id}-c)">
            <g class="j-liquid"><g class="j-liquid-in">
              <g class="j-wave2"><path d="${JAR_WAVE_PATH}" fill="${shade(pal.css, -0.25)}" transform="translate(-8 -2.5)"/></g>
              <g class="j-wave"><path d="${JAR_WAVE_PATH}" fill="url(#${id}-g)"/></g>
              <g class="j-hlg" clip-path="url(#${id}-hc)"><g class="j-wave j-hl"><path d="${JAR_WAVE_PATH}" fill="${shade(pal.css, 0.8)}"/><path class="j-hls" d="${JAR_WAVE_PATH}" fill="url(#${id}-hp)"/></g></g>
            </g></g>
            <path class="j-hll" d="M5 0 H59"/>
            <path d="${JAR_PATH}" fill="url(#${id}-s)"/>
          </g>
          <path class="j-sheen" d="M15.5 36 C13 42 13 50 15.5 56"/>
          <circle class="j-sheen2" cx="17.5" cy="31" r="2"/>
          <path class="j-outline" d="${JAR_PATH}" filter="url(#wb-rough)"/>
          <path class="j-lip" d="M21.5 13.2 H42.5"/>
          <path class="j-cork" d="M23 3.2 H41 Q43 3.2 42.6 5.5 L41.5 12.5 H22.5 L21.4 5.5 Q21 3.2 23 3.2 Z"/>
          <path class="j-cork-l" d="M26 6 V10.5 M31.5 5.5 V11 M37.5 6 V10.5"/>
        </svg>`,
      );
      el('div', 'j-key', jar, String(i + 1));
      this.jars[color] = {
        root: jar,
        liquid: jar.querySelector('.j-liquid'),
        level: -1,
        shownLevel: -1,
        hlRect: jar.querySelector('.j-hlr'),
        hlLine: jar.querySelector('.j-hll'),
      };
    });
    const cycleKey = el('div', 'pl-qe', this.root, 'E');
    cycleKey.style.left = '16.7em';
    this.note = el('div', 'pl-note', this.root);
  }
  update(dt) {
    const state = this.ctx.player?.state;
    const paint = this.ctx.paint;
    if (state && state.selectedColor !== this.selected && PALETTE[state.selectedColor])
      this.select(state.selectedColor);
    if (paint?.ink) {
      const inkMax = paint.inkMax > 0 ? paint.inkMax : 100;
      for (const color of COLORS) this.setLevel(color, (paint.ink[color] ?? 0) / inkMax);
    }
    if (state && (state.aiming || this.ctx.time.elapsed - (state.lastFlickTime ?? -99) < 3)) this.activity = 4;
    this.activity = Math.max(0, this.activity - dt);
    setClass(this.root, 'idle', this.activity <= 0);
  }
  poke() {
    this.activity = 5;
  }
  select(selected) {
    const prev = this.selected;
    this.selected = selected;
    this.poke();
    for (const color of COLORS) {
      setClass(this.jars[color].root, 'sel', color === selected);
      setClass(this.labels[color], 'on', color === selected);
    }
    const index = COLORS.indexOf(selected);
    setStyle(this.nameBox, 'transform', `translateX(${(JAR_LEFT + index * JAR_SPACING).toFixed(2)}em)`);
    if (prev) {
      this.splashes[selected].animate(
        [
          {
            transform: 'scale(0.3) rotate(-25deg)',
            opacity: 0.95,
          },
          {
            transform: 'scale(1.05) rotate(0deg)',
            opacity: 0.8,
            offset: 0.4,
          },
          {
            transform: 'scale(1.15) rotate(4deg)',
            opacity: 0,
          },
        ],
        {
          duration: 650,
          easing: 'cubic-bezier(.2,.9,.3,1)',
        },
      );
      this.jars[selected].root.querySelector('svg').animate(
        [
          {
            transform: 'rotate(-9deg)',
          },
          {
            transform: 'rotate(6deg)',
          },
          {
            transform: 'rotate(-3deg)',
          },
          {
            transform: 'rotate(0deg)',
          },
        ],
        {
          duration: 480,
          easing: 'ease-out',
        },
      );
    }
  }
  setLevel(color, level) {
    level = Math.min(1, Math.max(0, level));
    const jar = this.jars[color];
    if (!(Math.abs(level - jar.level) < 0.002)) {
      jar.level = level;
      setStyle(jar.liquid, 'transform', `translateY(${((1 - level) * 54).toFixed(2)}px)`);
      setClass(jar.root, 'low', level > 0.001 && level < 0.2);
      setClass(jar.root, 'empty', level <= 0.001);
    }
  }
  preview(color, cost = 0, ink = 0, inkMax = 100) {
    const max = inkMax > 0 ? inkMax : 100;
    const key = color ? `${color}|${cost.toFixed(2)}|${ink.toFixed(2)}` : '';
    if (key === this.pvKey) return;
    this.pvKey = key;
    if (this.pvColor && this.pvColor !== color) {
      const prevJar = this.jars[this.pvColor];
      setClass(prevJar.root, 'pv', false);
      setClass(prevJar.root, 'short', false);
    }
    this.pvColor = color;
    if (!color || !this.jars[color]) return;
    const jar = this.jars[color];
    const have = Math.min(1, Math.max(0, ink / max));
    const need = Math.min(1, Math.max(0, cost / max));
    const short = ink + 0.000001 < cost;
    const hlFrac = short ? have : need;
    jar.hlRect.setAttribute('height', (20 + hlFrac * 54).toFixed(2));
    const lineY = 20 + (1 - (short ? need : have - need)) * 54;
    jar.hlLine.setAttribute('transform', `translate(0 ${lineY.toFixed(2)})`);
    setClass(jar.root, 'short', short);
    setClass(jar.root, 'pv', true);
    this.poke();
  }
  flashEmpty(color) {
    const jar = this.jars[color];
    if (!jar) return;
    this.poke();
    jar.root.animate(
      [
        {
          translate: '0 0',
          filter: 'brightness(1)',
        },
        {
          translate: '-0.25em 0',
          filter: 'brightness(1.8)',
        },
        {
          translate: '0.25em 0',
        },
        {
          translate: '-0.18em 0',
        },
        {
          translate: '0.12em 0',
        },
        {
          translate: '0 0',
          filter: 'brightness(1)',
        },
      ],
      {
        duration: 420,
        easing: 'ease-out',
      },
    );
    let ink = 0;
    try {
      ink = Number(this.ctx.paint?.ink?.[color]) || 0;
    } catch {
      ink = 0;
    }
    this.note.innerHTML = `<i></i>${ink >= 1 ? 'Not enough' : 'Out of'} ${PALETTE[color].name} ink`;
    this.note.style.setProperty('--nc', PALETTE[color].css);
    this.note.getAnimations().forEach((anim) => anim.cancel());
    this.note.animate(
      [
        {
          opacity: 0,
          transform: 'translateY(0.4em)',
        },
        {
          opacity: 1,
          transform: 'none',
          offset: 0.12,
        },
        {
          opacity: 1,
          transform: 'none',
          offset: 0.8,
        },
        {
          opacity: 0,
          transform: 'translateY(-0.3em)',
        },
      ],
      {
        duration: 1800,
        easing: 'ease-out',
      },
    );
  }
  refill(color) {
    const jar = this.jars[color];
    if (jar) {
      this.poke();
      jar.root.querySelector('svg').animate(
        [
          {
            transform: 'scale(1)',
          },
          {
            transform: 'scale(1.18)',
            filter: 'brightness(1.5)',
          },
          {
            transform: 'scale(1)',
          },
        ],
        {
          duration: 520,
          easing: 'cubic-bezier(.2,1.5,.4,1)',
        },
      );
    }
  }
}
