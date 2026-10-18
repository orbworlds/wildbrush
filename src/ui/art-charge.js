/**
 * Brush Art charge meter: a ring that fills while the hero holds to charge, with the art's name, its ink cost and a ready notch. It shakes when there is not enough ink, bursts in the art's colour on a cast and puffs grey when the cast fizzles.
 */
import { ART_CHARGE_TIME, ARTS, PALETTE } from '../core/config.js';
import { brushRing, makeCanvas, splatCanvas, washCanvas } from './brush.js';
import { el, setClass, setStyle, setText } from './dom.js';
import { ELEMENT_ICONS } from './icons.js';
const NO_INK_GREY = '#a49f95';
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export function artCost(ctx, color) {
  const def = ARTS[color] ?? ARTS.red;
  let chroma = false;
  try {
    chroma = ctx.player?.state?.brush === 'chroma';
  } catch {
    chroma = false;
  }
  let crest = false;
  try {
    crest = color === 'red' && !!ctx.player?.hasItem?.('emberCrest');
  } catch {
    crest = false;
  }
  const cost = def.ink * (chroma ? 0.5 : 1) * (crest ? 0.75 : 1);
  let inkMax = 100;
  let ink = NaN;
  try {
    const paint = ctx.paint;
    if (Number(paint?.inkMax) > 0) inkMax = Number(paint.inkMax);
    ink = Number(paint?.ink?.[color]);
  } catch {
    ink = NaN;
  }
  if (!Number.isFinite(ink)) ink = inkMax;
  return {
    color,
    art: def.art,
    name: def.name,
    cost,
    ink,
    inkMax,
    enough: ink + 0.000001 >= cost,
  };
}
export function chargingArt(ctx) {
  const state = ctx.player?.state;
  if (!state || !state.aiming || state.dead) return null;
  const raw = Number(state.artCharge);
  const charge = Number.isFinite(raw) ? clamp01(raw) : 0;
  return charge <= 0.03 || !PALETTE[state.selectedColor]
    ? null
    : {
        color: state.selectedColor,
        charge,
      };
}
export function formatInk(amount) {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(1);
}
function chargeRing(sizeEm, color, seed, widthFrac, sheen = 0.22) {
  const size = sizeEm * 16;
  const { canvas, g } = makeCanvas(size, size);
  const radius = size * 0.4;
  const width = size * widthFrac;
  const base = {
    sweep: Math.PI * 2.03,
    start: -Math.PI / 2,
    taperStart: 0.012,
    taperEnd: 0.03,
    wobble: 0.1,
  };
  brushRing(g, size / 2, size / 2, radius, width, color, seed, {
    ...base,
    dry: 0.22,
    core: 0.82,
  });
  if (sheen > 0)
    brushRing(g, size / 2, size / 2, radius - width * 0.12, width * 0.55, 'rgba(255,255,255,1)', `${seed}-h`, {
      ...base,
      dry: 0.82,
      core: 0,
      alpha: sheen,
      bristles: 14,
    });
  return canvas;
}
export class ArtChargeMeter {
  ctx;
  root;
  main;
  inner;
  fillHost;
  fills = new Map();
  fillOn = null;
  notch;
  icon;
  nameEl;
  costEl;
  shown = false;
  color = null;
  enough = true;
  ready = false;
  cost = -1;
  lastA = '';
  shownAt = -1000000000;
  fizzleSplat = null;
  flashSplats = new Map();
  constructor(host, ctx) {
    this.ctx = ctx;
    this.root = el('div', 'wb-artc', host);
    this.main = el('div', 'ac-main', this.root);
    el('div', 'ac-glow', this.main);
    this.inner = el('div', 'ac-in', this.main);
    const track = chargeRing(6, 'rgba(10,11,16,0.9)', 'artc-track', 0.115, 0);
    track.className = 'ac-track';
    this.inner.appendChild(track);
    this.fillHost = el('div', 'ac-fill', this.inner);
    const notchDeg = (ART_CHARGE_TIME * 360).toFixed(1);
    this.inner.insertAdjacentHTML(
      'beforeend',
      `<svg class="ac-svg" viewBox="-50 -50 100 100" aria-hidden="true">
        <g transform="rotate(${notchDeg})"><g class="ac-notch">
          <path class="ac-nk-o" d="M0 -46.5 V-33.5"/>
          <path class="ac-nk" d="M0 -46.5 V-33.5"/>
          <path class="ac-gem" d="M0 -56.5 l3.4 4.2 -3.4 4.2 -3.4 -4.2z"/>
        </g></g>
      </svg>`,
    );
    this.notch = this.inner.querySelector('.ac-notch');
    const label = el('div', 'ac-lab', this.main);
    const wash = washCanvas(14, 6, 'artc-wash', 0.62);
    wash.className = 'ac-wash';
    label.appendChild(wash);
    this.icon = el('div', 'ac-icon', label);
    const text = el('div', 'ac-txt', label);
    this.nameEl = el('div', 'ac-name', text);
    this.costEl = el('div', 'ac-cost', text);
  }
  fillFor(key, css) {
    let fill = this.fills.get(key);
    if (!fill) {
      fill = chargeRing(6, css, `artc-fill-${key}`, 0.095);
      this.fillHost.appendChild(fill);
      this.fills.set(key, fill);
    }
    return fill;
  }
  setFill(key, css) {
    const fill = this.fillFor(key, css);
    if (fill !== this.fillOn) {
      if (this.fillOn) this.fillOn.classList.remove('on');
      fill.classList.add('on');
      this.fillOn = fill;
    }
  }
  setColor(color) {
    this.color = color;
    const pal = PALETTE[color];
    this.root.style.setProperty('--ac', pal.css);
    this.icon.innerHTML = ELEMENT_ICONS[color] ?? '';
    setText(this.nameEl, ARTS[color]?.name ?? '');
    this.cost = -1;
  }
  refreshCost(info) {
    if (info.enough) this.costEl.innerHTML = `<i></i><b>${formatInk(info.cost)}</b> ${PALETTE[info.color].name} ink`;
    else this.costEl.innerHTML = `<i></i>Not enough ink <b>${formatInk(info.cost)}</b>`;
  }
  update(dt, active) {
    const state = this.ctx.player?.state;
    const charging = active ? chargingArt(this.ctx) : null;
    const color =
      charging?.color ?? (state?.selectedColor && PALETTE[state.selectedColor] ? state.selectedColor : null);
    if (color && color !== this.color) this.setColor(color);
    if (!this.color) return;
    const on = !!charging;
    const info = artCost(this.ctx, this.color);
    if (info.enough !== this.enough || info.cost !== this.cost) {
      const ranOut = !info.enough && this.enough;
      this.enough = info.enough;
      this.cost = info.cost;
      setClass(this.root, 'noink', !info.enough);
      this.refreshCost(info);
      if (ranOut && this.shown && on) this.shake();
    }
    this.setFill(this.enough ? this.color : 'grey', this.enough ? PALETTE[this.color].css : NO_INK_GREY);
    if (on !== this.shown) {
      this.shown = on;
      setClass(this.root, 'on', on);
      if (on) {
        this.ready = false;
        setClass(this.root, 'ready', false);
        this.notch.getAnimations().forEach((anim) => anim.cancel());
        if (!this.enough) this.shake();
      }
    }
    if (!on) return;
    this.shownAt = performance.now();
    const charge = charging.charge;
    const ready = charge >= ART_CHARGE_TIME - 0.0001;
    if (ready !== this.ready) {
      this.ready = ready;
      if (ready)
        if (this.enough) this.pop();
        else this.shake();
    }
    setClass(this.root, 'ready', ready && this.enough);
    const deg = (charge * 360).toFixed(1);
    if (deg !== this.lastA) {
      this.lastA = deg;
      setStyle(this.fillHost, '--a', `${deg}deg`);
    }
  }
  pop() {
    this.inner.animate(
      [
        {
          transform: 'scale(1)',
        },
        {
          transform: 'scale(1.16)',
          filter: 'brightness(1.6)',
        },
        {
          transform: 'scale(1)',
        },
      ],
      {
        duration: 380,
        easing: 'cubic-bezier(.2,1.6,.4,1)',
      },
    );
    this.notch.animate(
      [
        {
          transform: 'scale(1)',
        },
        {
          transform: 'scale(1.9)',
        },
        {
          transform: 'scale(1.25)',
        },
      ],
      {
        duration: 420,
        easing: 'cubic-bezier(.2,1.5,.4,1)',
        fill: 'forwards',
      },
    );
  }
  shake() {
    this.main.animate(
      [
        {
          translate: '0 0',
        },
        {
          translate: '-0.32em 0',
        },
        {
          translate: '0.3em 0',
        },
        {
          translate: '-0.22em 0',
        },
        {
          translate: '0.14em 0',
        },
        {
          translate: '0 0',
        },
      ],
      {
        duration: 400,
        easing: 'ease-out',
      },
    );
  }
  fizzle() {
    if (performance.now() - this.shownAt > 350) return;
    this.shake();
    const flash = el('div', 'ac-flash', this.root);
    const splat = (this.fizzleSplat ??= splatCanvas(7, '#5f5a53', 'artc-fizzle', {
      rFrac: 0.17,
      tendrils: 7,
      drops: 12,
      reach: 0.9,
      rough: 0.9,
    }));
    const puff = document.createElement('canvas');
    puff.width = splat.width;
    puff.height = splat.height;
    puff.getContext('2d').drawImage(splat, 0, 0);
    puff.className = 'af-puff';
    flash.appendChild(puff);
    puff.animate(
      [
        {
          transform: 'scale(0.4)',
          opacity: 0.9,
        },
        {
          transform: 'scale(1.05) translateY(-0.3em)',
          opacity: 0.6,
          offset: 0.4,
        },
        {
          transform: 'scale(1.25) translateY(-0.8em)',
          opacity: 0,
        },
      ],
      {
        duration: 480,
        easing: 'ease-out',
        fill: 'forwards',
      },
    );
    setTimeout(() => flash.remove(), 560);
  }
  flash(color) {
    const pal = PALETTE[color];
    if (!pal) return;
    const flash = el('div', 'ac-flash', this.root);
    flash.style.setProperty('--ac', pal.css);
    let splat = this.flashSplats.get(color);
    if (!splat) {
      splat = splatCanvas(9, pal.css, `artc-burst-${color}`, {
        rFrac: 0.13,
        tendrils: 11,
        drops: 22,
        reach: 1.9,
        rough: 0.6,
      });
      this.flashSplats.set(color, splat);
    }
    const burst = document.createElement('canvas');
    burst.width = splat.width;
    burst.height = splat.height;
    burst.getContext('2d').drawImage(splat, 0, 0);
    burst.className = 'af-splat';
    flash.appendChild(burst);
    const ring = document.createElement('canvas');
    const fill = this.fillFor(color, pal.css);
    ring.width = fill.width;
    ring.height = fill.height;
    ring.getContext('2d').drawImage(fill, 0, 0);
    ring.className = 'af-ring';
    flash.appendChild(ring);
    const rot = `${Math.round(Math.random() * 360)}deg`;
    burst.animate(
      [
        {
          transform: `rotate(${rot}) scale(0.35)`,
          opacity: 0.95,
        },
        {
          transform: `rotate(${rot}) scale(1)`,
          opacity: 0.75,
          offset: 0.35,
        },
        {
          transform: `rotate(${rot}) scale(1.12)`,
          opacity: 0,
        },
      ],
      {
        duration: 520,
        easing: 'cubic-bezier(.15,.9,.3,1)',
        fill: 'forwards',
      },
    );
    ring.animate(
      [
        {
          transform: 'scale(1)',
          opacity: 1,
          filter: 'brightness(1.8)',
        },
        {
          transform: 'scale(1.9)',
          opacity: 0,
          filter: 'brightness(1)',
        },
      ],
      {
        duration: 420,
        easing: 'cubic-bezier(.1,.8,.3,1)',
        fill: 'forwards',
      },
    );
    setTimeout(() => flash.remove(), 620);
  }
}
