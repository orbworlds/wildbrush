/**
 * Colour wheel: hold Tab to slow time and pick a paint with the mouse, look input or number keys; shows each colour's ink level and element.
 */
import { Vector2 } from 'three';
import { COLORS, PALETTE } from '../core/config.js';
import { ringCanvas, shade, splatCanvas } from './brush.js';
import { el, setClass, setStyle, setText } from './dom.js';
import { ELEMENT_ICONS } from './icons.js';
const WHEEL_RADIUS = 9.4;
const WHEEL_METER_RADIUS = 28;
const WHEEL_METER_CIRC = 2 * Math.PI * WHEEL_METER_RADIUS;
const WHEEL_DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];
const ELEMENT_NAMES = {
  red: 'Fire',
  blue: 'Ice',
  yellow: 'Bounce',
  green: 'Growth',
};
export class ColorWheel {
  ctx;
  root;
  items = {};
  cname;
  celem;
  desc;
  ink;
  box;
  ptr;
  v = new Vector2();
  mouse = {
    x: -1,
    y: -1,
  };
  mouseMoved = false;
  hl = 'red';
  isOpen = false;
  constructor(host, ctx) {
    this.ctx = ctx;
    this.root = el('div', 'wb-layer wb-wheel', host);
    el('div', 'wh-dim', this.root);
    this.box = el('div', 'wh-box', this.root);
    const ring = ringCanvas(27, 'rgba(246,239,223,0.9)', 'wheel-ring', 0.012, {
      rFrac: 0.35,
      dry: 0.55,
      sweep: Math.PI * 2.05,
    });
    ring.className = 'wh-ring';
    this.box.appendChild(ring);
    const center = el('div', 'wh-center', this.box);
    const blot = splatCanvas(15, 'rgba(10,11,16,0.86)', 'wheel-center', {
      rFrac: 0.3,
      tendrils: 5,
      drops: 12,
      reach: 0.32,
      rough: 0.5,
    });
    center.appendChild(blot);
    this.cname = el('div', 'wh-cname', center);
    this.celem = el('div', 'wh-celem', center);
    this.desc = el('div', 'wh-desc', center);
    this.ink = el('div', 'wh-ink', center);
    this.ptr = el('div', 'wh-ptr', this.box);
    this.ptr.style.height = '6.1em';
    this.ptr.style.marginTop = '-6.1em';
    this.ptr.innerHTML =
      '<svg viewBox="-10 -10 20 20"><path d="M0 -9 C4 -3 6 1 6 3.5 A6 6 0 0 1 -6 3.5 C-6 1 -4 -3 0 -9Z" fill="currentColor" stroke="rgba(8,9,14,.7)" stroke-width="1.2"/></svg>';
    COLORS.forEach((color, i) => {
      const pal = PALETTE[color];
      const item = el('div', 'wh-item', this.box);
      const splat = splatCanvas(12, pal.css, `wheel-${color}`, {
        rFrac: 0.25,
        tendrils: 8,
        drops: 16,
        reach: 0.85,
        rim: true,
      });
      item.appendChild(splat);
      item.insertAdjacentHTML(
        'beforeend',
        `<svg class="wh-meter" viewBox="0 0 64 64"><circle class="m-t" cx="32" cy="32" r="${WHEEL_METER_RADIUS}"/>
          <circle class="m-f" cx="32" cy="32" r="${WHEEL_METER_RADIUS}" stroke-dasharray="${WHEEL_METER_CIRC} ${WHEEL_METER_CIRC}" transform="rotate(-90 32 32)"/></svg>`,
      );
      const icon = el('div', 'wh-icon', item, ELEMENT_ICONS[color]);
      icon.style.color = shade(pal.css, 0.85);
      el('div', 'wh-name', item, pal.name);
      this.items[color] = {
        root: item,
        meter: item.querySelector('.m-f'),
        i,
      };
    });
    el('div', 'wh-title', this.box, 'Paints');
    el('div', 'wh-foot', this.box, 'Move the mouse to choose · release <span class="wb-key wide">Tab</span>');
    window.addEventListener('mousemove', (ev) => {
      this.mouse.x = ev.clientX;
      this.mouse.y = ev.clientY;
      if (this.isOpen && !this.ctx.input.pointerLocked) this.mouseMoved = true;
    });
    this.layout();
  }
  layout() {
    for (const color of COLORS) this.placeItem(color);
  }
  placeItem(color) {
    const item = this.items[color];
    const [dx, dy] = WHEEL_DIRS[item.i];
    const on = color === this.hl;
    const dist = on ? 9.9 : WHEEL_RADIUS;
    setStyle(item.root, 'transform', `translate(${dx * dist}em, ${dy * dist}em) scale(${on ? 1.14 : 0.9})`);
    setClass(item.root, 'on', on);
  }
  open(color) {
    this.isOpen = true;
    this.mouseMoved = false;
    setClass(this.root, 'open', true);
    const index = Math.max(0, COLORS.indexOf(color));
    this.v.set(WHEEL_DIRS[index][0] * 0.45, WHEEL_DIRS[index][1] * 0.45);
    this.hl = color;
    const inkMax = this.ctx.paint?.inkMax > 0 ? this.ctx.paint.inkMax : 100;
    for (const color of COLORS) {
      const frac = Math.min(1, Math.max(0, (this.ctx.paint?.ink?.[color] ?? inkMax) / inkMax));
      setStyle(this.items[color].meter, 'stroke-dashoffset', (WHEEL_METER_CIRC * (1 - frac)).toFixed(1));
      setStyle(this.items[color].meter, 'opacity', frac < 0.005 ? '0' : '0.9');
      setClass(this.items[color].root, 'empty', frac < 0.005);
    }
    this.setHighlight(color, true);
    setStyle(this.ptr, 'transform', `rotate(${index * 90}deg)`);
    setClass(this.ptr, 'on', false);
  }
  close() {
    this.isOpen = false;
    setClass(this.root, 'open', false);
    return this.hl;
  }
  setHighlight(color, force = false) {
    if (color === this.hl && !force) return;
    const changed = color !== this.hl;
    this.hl = color;
    for (const color of COLORS) this.placeItem(color);
    const pal = PALETTE[color];
    this.box.style.setProperty('--wc', shade(pal.css, 0.15));
    setText(this.cname, pal.name);
    setText(this.celem, ELEMENT_NAMES[color]);
    setText(this.desc, pal.verb);
    const inkMax = this.ctx.paint?.inkMax > 0 ? this.ctx.paint.inkMax : 100;
    const frac = Math.min(1, Math.max(0, (this.ctx.paint?.ink?.[color] ?? inkMax) / inkMax));
    setText(this.ink, frac <= 0.005 ? 'Out of ink' : `Ink ${Math.round(frac * 100)}%`);
    if (changed)
      try {
        this.ctx.audio?.play?.('ui-hover', {
          volume: 0.6,
        });
      } catch {}
  }
  update(dt) {
    if (!this.isOpen) return;
    const input = this.ctx.input;
    const lookDelta = input.lookDelta;
    if (lookDelta.x !== 0 || lookDelta.y !== 0) {
      this.v.x += lookDelta.x / 90;
      this.v.y += lookDelta.y / 90;
    } else if (!input.pointerLocked && this.mouseMoved) {
      const em = parseFloat(getComputedStyle(this.root).fontSize) || 16;
      this.v.set((this.mouse.x - window.innerWidth / 2) / (em * 8), (this.mouse.y - window.innerHeight / 2) / (em * 8));
    }
    const len = this.v.length();
    if (len > 1) this.v.multiplyScalar(1 / len);
    for (const [action, slot] of [
      ['color1', 0],
      ['color2', 1],
      ['color3', 2],
      ['color4', 3],
    ])
      if (input.pressed(action)) this.v.set(WHEEL_DIRS[slot][0], WHEEL_DIRS[slot][1]);
    const current = COLORS.indexOf(this.hl);
    if (input.pressed('colorNext')) this.v.set(...WHEEL_DIRS[(current + 1) % 4]);
    if (input.pressed('colorPrev')) this.v.set(...WHEEL_DIRS[(current + 3) % 4]);
    if (this.v.length() > 0.28) {
      const angle = Math.atan2(this.v.x, -this.v.y);
      const slot = ((Math.round(angle / (Math.PI / 2)) % 4) + 4) % 4;
      this.setHighlight(COLORS[slot]);
      setStyle(this.ptr, 'transform', `rotate(${((angle * 180) / Math.PI).toFixed(1)}deg)`);
      setClass(this.ptr, 'on', true);
    } else setClass(this.ptr, 'on', false);
  }
}
