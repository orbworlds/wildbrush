/**
 * Crosshair in the middle of the screen that opens into an inked aiming reticle in the selected colour while the hero aims.
 */
import { PALETTE } from '../core/config.js';
import { el, setClass } from './dom.js';
export class Crosshair {
  ctx;
  root;
  ret;
  aiming = false;
  color = '';
  constructor(host, ctx) {
    this.ctx = ctx;
    this.root = el('div', 'wb-cross', host);
    el('div', 'dot', this.root);
    this.ret = el('div', 'ret', this.root);
    const dash = `${((2 * Math.PI * 14) / 4 - 4).toFixed(2)} 4`;
    this.ret.insertAdjacentHTML(
      'beforeend',
      `<svg viewBox="-32 -32 64 64">
        <g fill="none" stroke-linecap="round" filter="url(#wb-rough)">
          <circle r="14" stroke="rgba(8,9,14,.55)" stroke-width="4.6" stroke-dasharray="${dash}" stroke-dashoffset="-2"/>
          <path d="M0 -27 V-19 M0 19 V27 M-27 0 H-19 M19 0 H27" stroke="rgba(8,9,14,.55)" stroke-width="5"/>
          <circle r="14" stroke="currentColor" stroke-width="2.4" stroke-dasharray="${dash}" stroke-dashoffset="-2"/>
          <path d="M0 -27 V-19 M0 19 V27 M-27 0 H-19 M19 0 H27" stroke="currentColor" stroke-width="3"/>
        </g>
      </svg>`,
    );
  }
  update(active) {
    const state = this.ctx.player?.state;
    const aiming = !!state?.aiming;
    if (aiming !== this.aiming) {
      this.aiming = aiming;
      setClass(this.root, 'aim', aiming);
    }
    const color = state?.selectedColor && PALETTE[state.selectedColor] ? PALETTE[state.selectedColor].css : '#f6efdf';
    if (color !== this.color) {
      this.color = color;
      this.root.style.setProperty('--pc', color);
    }
    setClass(this.root, 'off', !active);
  }
}
