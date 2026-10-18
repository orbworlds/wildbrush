/**
 * Flight HUD while riding the brush: altitude and speed readouts, and speed lines at the screen edges that grow with speed and boosting, tinted by the selected colour.
 */
import { PALETTE } from '../core/config.js';
import { makeRng } from '../core/math.js';
import { floorHeightAt } from '../shared/skyground.js';
import { makeCanvas, washCanvas } from './brush.js';
import { el, setClass, setStyle, setText } from './dom.js';
const saturate = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothRamp = (edge0, edge1, x) => {
  const t = saturate((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};
const ALTITUDE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
  <path stroke-width="2.2" d="M2.5 20.5 9 10.5l3.4 4.6 2.6-3.4 6.5 8.8Z" fill="currentColor" fill-opacity=".25"/>
  <path stroke-width="2.4" d="M17 3.2v6.4M14.2 6l2.8-2.8L19.8 6"/></svg>`;
const SPEED_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round">
  <path stroke-width="2.4" d="M3 8.5h11.5c2.3 0 3.6-1.3 3.6-3s-1.4-2.6-2.8-2.3"/>
  <path stroke-width="2.4" d="M3 13h15.5c2.4 0 3.7 1.3 3.7 3s-1.4 2.7-2.9 2.3"/>
  <path stroke-width="2" opacity=".7" d="M5 17.6h6.5"/></svg>`;
function speedLinesCanvas() {
  const { canvas, g } = makeCanvas(960, 540, 1);
  const rng = makeRng('flight-lines');
  const maxR = Math.hypot(480, 270) * 1.05;
  g.lineCap = 'round';
  for (let i = 0; i < 150; i++) {
    const ang = rng() * Math.PI * 2;
    const r0 = maxR * (0.42 + rng() * 0.4);
    const r1 = r0 + maxR * (0.18 + rng() * 0.35);
    const w = 0.8 + rng() * 2.6;
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    const gradient = g.createLinearGradient(480 + ux * r0, 270 + uy * r0, 480 + ux * r1, 270 + uy * r1);
    const alpha = 0.18 + rng() * 0.42;
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.35, `rgba(255,252,244,${alpha})`);
    gradient.addColorStop(1, `rgba(255,252,244,${alpha * 0.4})`);
    g.strokeStyle = gradient;
    for (let j = 0; j < 3; j++) {
      const lw = w * (1 - j * 0.3);
      const off = (j - 1) * w * 0.35;
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(480 + ux * (r0 + j * 6) - uy * off, 270 + uy * (r0 + j * 6) + ux * off);
      g.lineTo(480 + ux * r1 - uy * off, 270 + uy * r1 + ux * off);
      g.stroke();
    }
  }
  return canvas;
}
export class FlightHud {
  ctx;
  root;
  read;
  altEl;
  spdEl;
  lines;
  tintEl;
  on = false;
  rush = 0;
  alt = 0;
  spd = 0;
  color = '';
  lastRush = '';
  readT = 0;
  constructor(hudHost, fxHost, ctx) {
    this.ctx = ctx;
    this.lines = el('div', 'wb-flightlines', fxHost);
    const linesUrl = speedLinesCanvas().toDataURL();
    for (const layer of ['a', 'b']) {
      const layerEl = el('div', `fl-lines fl-${layer}`, this.lines);
      layerEl.style.backgroundImage = `url(${linesUrl})`;
    }
    this.tintEl = el('div', 'fl-tint', this.lines);
    this.root = el('div', 'wb-flight', hudHost);
    this.read = el('div', 'fl-read', this.root);
    const back = washCanvas(22, 5.2, 'flight-read', 0.62);
    back.className = 'fl-back';
    this.read.appendChild(back);
    const altItem = el('div', 'fl-item', this.read);
    el('i', 'fl-ico', altItem, ALTITUDE_SVG);
    this.altEl = el('span', 'fl-num', altItem);
    el('span', 'fl-unit', altItem, 'm');
    el('div', 'fl-sep', this.read);
    const spdItem = el('div', 'fl-item', this.read);
    el('i', 'fl-ico', spdItem, SPEED_SVG);
    this.spdEl = el('span', 'fl-num', spdItem);
    el('span', 'fl-unit', spdItem, 'm/s');
  }
  update(dt, active) {
    const state = this.ctx.player?.state;
    const flying = !!state && state.mode === 'fly' && !state.dead;
    const on = active && flying;
    if (on !== this.on) {
      this.on = on;
      setClass(this.root, 'on', on);
    }
    let target = 0;
    if (flying && state) {
      const velocity = state.velocity;
      const speed = velocity ? Math.hypot(velocity.x, velocity.y, velocity.z) : state.speed;
      const boost = state.sprinting ? 0.35 + 0.65 * smoothRamp(8, 26, speed) : 0;
      const fast = 0.6 * smoothRamp(24, 40, speed);
      target = Math.max(boost, fast);
      this.readT -= dt;
      if (this.readT <= 0) {
        this.readT = 0.12;
        let floor = floorHeightAt(this.ctx, state.position.x, state.position.z, state.position.y);
        if (!Number.isFinite(floor)) floor = 0;
        const alt = Math.max(0, Math.round(state.position.y - floor));
        const spd = Math.round(speed);
        if (alt !== this.alt) {
          this.alt = alt;
          setText(this.altEl, String(alt));
        }
        if (spd !== this.spd) {
          this.spd = spd;
          setText(this.spdEl, String(spd));
        }
        setClass(this.read, 'boost', !!state.sprinting);
      }
      const color = state.selectedColor && PALETTE[state.selectedColor] ? state.selectedColor : '';
      if (color !== this.color) {
        this.color = color;
        this.lines.style.setProperty('--fc', color ? PALETTE[color].css : '#ffffff');
      }
    }
    if (!active) target = 0;
    const k = 1 - Math.exp(-dt * (target > this.rush ? 6 : 3));
    this.rush += (target - this.rush) * k;
    const rush = this.rush < 0.01 ? '0' : this.rush.toFixed(3);
    if (rush !== this.lastRush) {
      this.lastRush = rush;
      setStyle(this.lines, 'opacity', rush);
      setClass(this.lines, 'live', this.rush >= 0.01);
    }
  }
}
