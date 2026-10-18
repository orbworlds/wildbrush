/**
 * Area title cards: entering a named area spells its name out letter by letter between painted rules, tinted for caves, kilns, cisterns, temples and the sky island, and the same area is not announced again for 40 seconds.
 */
import { makeRng } from '../core/math.js';
import { strokeCanvas, tint, washCanvas } from './brush.js';
import { el } from './dom.js';
const AREA_HOLD = 3.6;
const AREA_COOLDOWN = 40;
const AREA_TINTS = {
  sky: ['rgba(140,198,244,0.2)', '#8cc6f4', '#ffd25e'],
  cave: ['rgba(120,230,190,0.2)', '#7fe0c0', '#ffd79a'],
  kiln: ['rgba(255,120,60,0.2)', '#ff8a4a', '#ffd46a'],
  cistern: ['rgba(150,215,255,0.2)', '#9fdcff', '#ffffff'],
  temple: ['rgba(255,230,180,0.2)', '#f0d9a8', '#ffffff'],
};
const normalizeAreaName = (label) =>
  label
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
export function areaVariant(id, title, kind) {
  const text = `${id} ${title}`;
  return kind === 'cave' || /cave|cavern|grotto|glowcap/i.test(text)
    ? 'cave'
    : /kiln|ember|forge|fire/i.test(text)
      ? 'kiln'
      : /cistern|frost|frozen|ice/i.test(text)
        ? 'cistern'
        : kind === 'temple' || /temple|shrine/i.test(text)
          ? 'temple'
          : /aerie|sky|cloud|isle/i.test(text)
            ? 'sky'
            : '';
}
export class AreaCard {
  root;
  card = null;
  seen = new Map();
  elapsed = 0;
  hideAt = -1;
  pending = null;
  constructor(host) {
    this.root = el('div', 'wb-area', host);
  }
  show(id, title, sub, variant) {
    const key = String(id || title);
    if (!title) return;
    const titleKey = `name:${normalizeAreaName(title)}`;
    for (const k of [key, titleKey]) {
      const seenAt = this.seen.get(k);
      if (seenAt !== undefined && this.elapsed - seenAt < AREA_COOLDOWN) return;
    }
    this.seen.set(key, this.elapsed);
    this.seen.set(titleKey, this.elapsed);
    const kind = variant ?? areaVariant(key, title);
    if (this.card) {
      this.pending = {
        id: key,
        name: title,
        sub: sub ?? '',
        variant: kind,
      };
      this.hide();
      return;
    }
    this.build(key, title, sub ?? '', kind);
  }
  sinceShown(id, title) {
    const byId = this.seen.get(String(id || title));
    const byTitle = title ? this.seen.get(`name:${normalizeAreaName(title)}`) : undefined;
    const last = Math.max(byId ?? -Infinity, byTitle ?? -Infinity);
    return this.elapsed - last;
  }
  build(id, title, sub, variant) {
    const sparkle = variant !== '' && variant !== 'temple';
    const card = el('div', `ar-card${variant ? ` ${variant}` : ''}`, this.root);
    const wash = washCanvas(60, 18, `ar-wash-${id}`, 0.42);
    wash.className = 'ar-wash';
    card.appendChild(wash);
    const nameRow = el('div', 'ar-name', card);
    const letters = [...title.toUpperCase()];
    letters.forEach((ch, i) => {
      const span = el('span', '', nameRow, ch === ' ' ? '&nbsp;' : ch);
      span.style.animationDelay = `${(0.25 + i * 0.055).toFixed(3)}s`;
    });
    const rule = el('div', 'ar-rule', card);
    for (const side of ['l', 'r']) {
      const stroke = strokeCanvas(16, 1.3, '#ffffff', `ar-rule-${side}`, {
        widthFrac: 0.42,
        dry: 0.45,
        core: 0.6,
        taperStart: side === 'l' ? 0.5 : 0.04,
        taperEnd: side === 'l' ? 0.04 : 0.5,
        pts: [
          [0.02, 0.52],
          [0.5, 0.46],
          [0.98, 0.52],
        ],
      });
      const stops = AREA_TINTS[variant];
      if (stops) {
        const g = stroke.getContext('2d');
        g.setTransform(1, 0, 0, 1, 0, 0);
        const gradient = g.createLinearGradient(side === 'l' ? 0 : stroke.width, 0, side === 'l' ? stroke.width : 0, 0);
        gradient.addColorStop(0, stops[0]);
        gradient.addColorStop(0.6, stops[1]);
        gradient.addColorStop(1, stops[2]);
        tint(g, gradient, stroke.width, stroke.height);
      }
      stroke.className = `ar-stroke ${side}`;
      rule.appendChild(stroke);
    }
    el('i', 'ar-diamond', rule);
    if (sub) el('div', 'ar-sub', card).textContent = sub;
    if (sparkle) {
      const rng = makeRng(`ar-sp-${id}`);
      for (let i = 0; i < 9; i++) {
        const spark = el('i', 'ar-spark', card);
        spark.style.left = `${(8 + rng() * 84).toFixed(1)}%`;
        spark.style.top = `${(10 + rng() * 70).toFixed(1)}%`;
        spark.style.animationDelay = `${(0.4 + rng() * 2).toFixed(2)}s`;
        spark.style.setProperty('--k', (0.5 + rng() * 0.8).toFixed(2));
      }
    }
    card.offsetWidth;
    card.classList.add('in');
    this.card = card;
    this.hideAt = this.elapsed + AREA_HOLD + letters.length * 0.055;
  }
  hide() {
    const card = this.card;
    if (card) {
      this.card = null;
      this.hideAt = -1;
      card.classList.remove('in');
      card.classList.add('out');
      setTimeout(() => {
        card.remove();
        const pending = this.pending;
        if (pending && !this.card) {
          this.pending = null;
          this.build(pending.id, pending.name, pending.sub, pending.variant);
        }
      }, 1300);
    }
  }
  update(dt, visible) {
    this.elapsed += dt;
    this.root.style.opacity = visible ? '' : '0';
    if (this.card && this.hideAt >= 0 && this.elapsed >= this.hideAt) this.hide();
  }
}
