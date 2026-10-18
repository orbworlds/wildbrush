/**
 * Title screen: the WILDBRUSH logo over paint splats and a brush swash, the tagline, and click, Enter or Space to begin with an ink burst.
 */
import { PALETTE } from '../core/config.js';
import { makeRng } from '../core/math.js';
import { brushStroke, makeCanvas, splatCanvas, tint } from './brush.js';
import { el } from './dom.js';
import { MOUSE_SVG } from './icons.js';
const SWASH_WIDTH = 56;
const SWASH_HEIGHT = 15;
export class TitleScreen {
  onBegin;
  root;
  main;
  done = false;
  begin = () => {};
  constructor(host, grainURL, onBegin) {
    this.onBegin = onBegin;
    this.root = el('div', 'wb-layer wb-title', host);
    el('div', 'tt-shade', this.root);
    const grain = el('div', 'tt-grain', this.root);
    grain.style.backgroundImage = `url(${grainURL})`;
    this.main = el('div', 'tt-main', this.root);
    const logo = el('div', 'wb-logo', this.main);
    [
      ['red', 5.2, 3.4, 17, 1.05, 1],
      ['yellow', 51, 2.6, 13, 1.2, 1],
      ['blue', 47.5, 12.4, 17, 1.32, 1],
      ['green', 10, 12.4, 14, 1.44, 1],
    ].forEach(([color, cx, cy, size, delay, alpha], i) => {
      const splat = splatCanvas(size, PALETTE[color].css, `title-${color}`, {
        rFrac: 0.17,
        tendrils: 6 + i,
        drops: 22,
        reach: 1.15,
        rim: true,
      });
      splat.className = 'lg-splat';
      splat.style.cssText += `left:${cx - size / 2}em;top:${cy - size / 2}em;width:${size}em;height:${size}em;--d:${delay}s;--o:${alpha}`;
      logo.appendChild(splat);
    });
    const swash = this.swash();
    swash.className = 'lg-swash';
    logo.appendChild(swash);
    const word = el('div', 'lg-word', logo);
    const rng = makeRng('title-letters');
    'WILDBRUSH'.split('').forEach((letter, i) => {
      const span = el('span', 'lg-l', word, letter);
      span.style.setProperty('--i', String(i));
      span.style.setProperty('--r', `${((rng() - 0.5) * 3.2).toFixed(2)}deg`);
      span.style.setProperty('--y', `${((rng() - 0.5) * 0.05).toFixed(3)}em`);
    });
    const under = this.underline();
    under.className = 'lg-under';
    logo.appendChild(under);
    const tag = el('div', 'tt-tag', this.main);
    el('i', '', tag);
    el('span', '', tag, 'Paint the world back to life');
    el('i', '', tag);
    const beginEl = el('div', 'tt-begin', el('div', 'tt-begin-row', this.root));
    beginEl.innerHTML = `${MOUSE_SVG}<span>Click to begin</span>`;
    el('div', 'tt-foot', this.root, 'Best enjoyed with sound');
    const colors = [PALETTE.red.css, PALETTE.blue.css, PALETTE.yellow.css, PALETTE.green.css];
    this.burstCanvas = splatCanvas(16, colors[Math.floor(Math.random() * 4)], 'title-burst', {
      rFrac: 0.16,
      tendrils: 8,
      drops: 20,
      reach: 1.3,
    });
    const start = (x, y) => {
      if (!this.done) {
        this.done = true;
        this.burst(x, y);
        this.onBegin({
          x,
          y,
        });
      }
    };
    this.root.addEventListener('click', (ev) => start(ev.clientX, ev.clientY));
    this.begin = () => {
      if (this.root.classList.contains('ready')) start(window.innerWidth / 2, window.innerHeight * 0.45);
    };
    window.addEventListener('keydown', (ev) => {
      if (!this.done && this.root.classList.contains('ready') && (ev.code === 'Enter' || ev.code === 'Space'))
        start(window.innerWidth / 2, window.innerHeight * 0.45);
    });
  }
  swash() {
    const w = SWASH_WIDTH * 16;
    const h = SWASH_HEIGHT * 16;
    const { canvas, g } = makeCanvas(w, h);
    const pts = [
      [w * 0.035, h * 0.56],
      [w * 0.25, h * 0.5],
      [w * 0.5, h * 0.53],
      [w * 0.75, h * 0.47],
      [w * 0.965, h * 0.44],
    ];
    brushStroke(g, pts, '#111217', {
      width: h * 0.62,
      seed: 'swash',
      dry: 0.42,
      taperStart: 0.07,
      taperEnd: 0.2,
      core: 0.72,
      alpha: 0.9,
      wobble: 0.14,
    });
    brushStroke(
      g,
      pts.map(([px, py], i) => [px + 6, py + (i % 2 ? 7 : -5)]),
      '#0d0e12',
      {
        width: h * 0.5,
        seed: 'swash2',
        dry: 0.6,
        taperStart: 0.12,
        taperEnd: 0.28,
        core: 0.25,
        alpha: 0.6,
      },
    );
    brushStroke(g, pts, 'rgba(255,240,210,1)', {
      width: h * 0.5,
      seed: 'swash3',
      dry: 0.85,
      core: 0,
      alpha: 0.07,
      bristles: 26,
    });
    g.fillStyle = '#111217';
    for (const [fx, drop, size] of [
      [0.24, 0.07, 9],
      [0.62, 0.1, 11],
      [0.79, 0.05, 7],
    ]) {
      const dripX = w * fx;
      const dripY = h * 0.7;
      const blobY = h * (0.8 + drop);
      const blobR = size * 0.72;
      g.beginPath();
      g.moveTo(dripX - size * 2.2, dripY);
      g.bezierCurveTo(dripX - size * 0.7, dripY + 4, dripX - blobR * 0.55, blobY - blobR * 2.2, dripX - blobR, blobY);
      g.arc(dripX, blobY, blobR, Math.PI, 0, true);
      g.bezierCurveTo(
        dripX + blobR * 0.55,
        blobY - blobR * 2.2,
        dripX + size * 0.7,
        dripY + 4,
        dripX + size * 2.2,
        dripY,
      );
      g.closePath();
      g.globalAlpha = 0.88;
      g.fill();
      g.globalAlpha = 0.18;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(dripX - blobR * 0.3, blobY - blobR * 0.25, blobR * 0.28, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#111217';
    }
    g.globalAlpha = 1;
    return canvas;
  }
  underline() {
    const h = 35.2;
    const { canvas, g } = makeCanvas(512, h);
    brushStroke(
      g,
      [
        [10.24, h * 0.62],
        [153.6, h * 0.5],
        [332.8, h * 0.52],
        [501.76, h * 0.4],
      ],
      '#ffffff',
      {
        width: h * 0.42,
        seed: 'underline',
        dry: 0.35,
        taperStart: 0.06,
        taperEnd: 0.35,
        core: 0.7,
      },
    );
    const gradient = g.createLinearGradient(0, 0, 512, 0);
    gradient.addColorStop(0, PALETTE.red.css);
    gradient.addColorStop(0.33, PALETTE.yellow.css);
    gradient.addColorStop(0.66, PALETTE.green.css);
    gradient.addColorStop(1, PALETTE.blue.css);
    tint(g, gradient, 512, h);
    return canvas;
  }
  burstCanvas = null;
  burst(x, y) {
    const burstCanvas = this.burstCanvas;
    if (burstCanvas) {
      burstCanvas.className = 'tt-burst';
      burstCanvas.style.left = `${x}px`;
      burstCanvas.style.top = `${y}px`;
      this.root.appendChild(burstCanvas);
    }
  }
  play() {
    this.root.classList.add('ready');
  }
  hide() {
    this.root.classList.add('out');
    setTimeout(() => {
      this.root.style.display = 'none';
    }, 1900);
  }
  get dismissed() {
    return this.done;
  }
}
