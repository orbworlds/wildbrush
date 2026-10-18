/**
 * Toast queue: titled cards with a painted stroke in the toast's colour (rainbow when it has none) and ink dots, shown one after another.
 */
import { PALETTE } from '../core/config.js';
import { splatCanvas, strokeCanvas, tint, washCanvas } from './brush.js';
import { el } from './dom.js';
export class Toasts {
  root;
  queue = [];
  busy = false;
  strokes = new Map();
  back;
  constructor(host) {
    this.root = el('div', 'wb-toasts', host);
    this.back = washCanvas(44, 13, 'toast-back', 0.6);
  }
  push(toast) {
    this.queue.push(toast);
    if (this.queue.length > 5) this.queue.splice(0, this.queue.length - 5);
    if (!this.busy) this.next();
  }
  strokeFor(color) {
    let stroke = this.strokes.get(color);
    if (!stroke) {
      stroke = strokeCanvas(28, 2.1, color === 'rainbow' ? '#ffffff' : color, `toast-${color}`, {
        widthFrac: 0.5,
        pts: [
          [0.02, 0.6],
          [0.3, 0.5],
          [0.7, 0.52],
          [0.98, 0.42],
        ],
        dry: 0.55,
        taperStart: 0.08,
        taperEnd: 0.4,
        core: 0.45,
        sheen: 0.16,
        streak: 0.12,
        wobble: 0.25,
      });
      if (color === 'rainbow') {
        const g = stroke.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        const gradient = g.createLinearGradient(0, 0, stroke.width, 0);
        gradient.addColorStop(0, PALETTE.red.css);
        gradient.addColorStop(0.33, PALETTE.yellow.css);
        gradient.addColorStop(0.66, PALETTE.green.css);
        gradient.addColorStop(1, PALETTE.blue.css);
        tint(g, gradient, stroke.width, stroke.height);
      }
      this.strokes.set(color, stroke);
    }
    const canvas = document.createElement('canvas');
    canvas.width = stroke.width;
    canvas.height = stroke.height;
    canvas.getContext('2d').drawImage(stroke, 0, 0);
    return canvas;
  }
  next() {
    const toast = this.queue.shift();
    if (!toast) {
      this.busy = false;
      return;
    }
    this.busy = true;
    const color = toast.color && PALETTE[toast.color] ? PALETTE[toast.color].css : 'rainbow';
    const card = el('div', 'wb-toast', this.root);
    const back = document.createElement('canvas');
    back.width = this.back.width;
    back.height = this.back.height;
    back.getContext('2d').drawImage(this.back, 0, 0);
    back.className = 'ts-back';
    card.appendChild(back);
    el('div', 'ts-title', card).textContent = toast.title;
    const line = el('div', 'ts-line', card);
    const stroke = this.strokeFor(color);
    stroke.className = 'ts-stroke';
    line.appendChild(stroke);
    {
      const colorA = color === 'rainbow' ? PALETTE.red.css : color;
      const colorB = color === 'rainbow' ? PALETTE.blue.css : color;
      const dotA = splatCanvas(4, colorA, `tdot-${toast.title}-a`, {
        rFrac: 0.17,
        tendrils: 5,
        drops: 9,
        reach: 0.9,
        rim: true,
      });
      dotA.className = 'ts-dot';
      dotA.style.left = '-3em';
      line.appendChild(dotA);
      const dotB = splatCanvas(4, colorB, `tdot-${toast.title}-b`, {
        rFrac: 0.12,
        tendrils: 4,
        drops: 7,
        reach: 0.9,
        rim: true,
      });
      dotB.className = 'ts-dot';
      dotB.style.right = '-2.8em';
      dotB.style.animationDelay = '0.75s';
      line.appendChild(dotB);
    }
    if (toast.subtitle) el('div', 'ts-sub', card).textContent = toast.subtitle;
    card.offsetWidth;
    card.classList.add('in');
    const hold = Math.max(2200, 3400 - this.queue.length * 500);
    setTimeout(() => {
      card.classList.remove('in');
      card.classList.add('out');
      setTimeout(() => {
        card.remove();
        this.next();
      }, 620);
    }, hold + 700);
  }
}
