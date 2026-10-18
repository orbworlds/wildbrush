/**
 * Stamina ring floating beside the hero's head: a vine-wreathed dial that drains and refills, extra segmented rings from Stamina Vessels, and a badge while the hero is slowed.
 */
import { Vector3 } from 'three';
import { damp } from '../core/math.js';
import { ringCanvas } from './brush.js';
import { el, setClass, setStyle } from './dom.js';
const STAMINA_RADIUS = 27;
const STAMINA_CIRC = 2 * Math.PI * STAMINA_RADIUS;
const EXTRA_RING_RADII = [34.8, 41.2];
const EXTRA_RING_SEGMENTS = 5;
const EXTRA_RING_GAP = 1.6;
const SLOW_BADGE_RADIUS = 13;
const SLOW_BADGE_CIRC = 2 * Math.PI * SLOW_BADGE_RADIUS;
function vineWreathSvg() {
  let vine = '';
  const leaves = [];
  const thorns = [];
  for (let i = 0; i <= 90; i++) {
    const angle = (i / 90) * Math.PI * 2;
    const rad = 44 + 2.6 * Math.sin(angle * 7);
    const px = 50 + Math.cos(angle) * rad;
    const py = 50 + Math.sin(angle) * rad;
    vine += `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`;
    if (i % 9 == 4 && i < 90) {
      const lx = 50 + Math.cos(angle) * (rad + 4);
      const ly = 50 + Math.sin(angle) * (rad + 4);
      const rot = (angle * 180) / Math.PI + (i % 18 == 4 ? 40 : -40);
      leaves.push(
        `<ellipse class="vl" cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" rx="5" ry="2.4" transform="rotate(${rot.toFixed(0)} ${lx.toFixed(1)} ${ly.toFixed(1)})"/>`,
      );
    }
    if (i % 9 == 0 && i < 90) {
      const tx = 50 + Math.cos(angle) * (rad - 2.5);
      const ty = 50 + Math.sin(angle) * (rad - 2.5);
      const dx = Math.cos(angle + 0.5) * 4;
      const dy = Math.sin(angle + 0.5) * 4;
      thorns.push(
        `<path class="vt" d="M${(tx - dy * 0.3).toFixed(1)} ${(ty + dx * 0.3).toFixed(1)}L${(tx - dx).toFixed(1)} ${(ty - dy).toFixed(1)}L${(tx + dy * 0.3).toFixed(1)} ${(ty - dx * 0.3).toFixed(1)}Z"/>`,
      );
    }
  }
  return `<svg class="st-vine" viewBox="0 0 100 100"><path class="vn" d="${vine}Z"/>${thorns.join('')}${leaves.join('')}</svg>`;
}
export class StaminaRing {
  ctx;
  root;
  fill;
  ghost;
  head = new Vector3();
  right = new Vector3();
  up = new Vector3();
  p = new Vector3();
  x = -1;
  y = -1;
  shown = false;
  fullFor = 10;
  value = 1;
  ghostVal = 1;
  ghostHold = 0;
  prev = 1;
  drainT = 0;
  lastFill = -1;
  lastGhost = -1;
  rings = [];
  xInit = false;
  lastMax = 1;
  slowed = false;
  slowTotal = 1;
  lastSlowEnd = -1;
  badgeArc = null;
  lastBadge = -1;
  constructor(host, ctx) {
    this.ctx = ctx;
    this.root = el('div', 'wb-stamina', host);
    const inner = el('div', 'st-in', this.root);
    inner.insertAdjacentHTML('beforeend', vineWreathSvg());
    inner.appendChild(
      ringCanvas(5.4, 'rgba(246,239,223,0.9)', 'stamina-ring', 0.035, {
        rFrac: 0.4,
        dry: 0.5,
      }),
    );
    inner.insertAdjacentHTML(
      'beforeend',
      `<svg viewBox="0 0 80 80">
        <circle class="st-disk" cx="40" cy="40" r="33"/>
        <circle class="st-track" cx="40" cy="40" r="${STAMINA_RADIUS}"/>
        <g transform="rotate(-90 40 40)" filter="url(#wb-rough)">
          <circle class="st-ghost" cx="40" cy="40" r="${STAMINA_RADIUS}" stroke-dasharray="${STAMINA_CIRC} ${STAMINA_CIRC}"/>
          <circle class="st-fill" cx="40" cy="40" r="${STAMINA_RADIUS}" stroke-dasharray="${STAMINA_CIRC} ${STAMINA_CIRC}"/>
        </g>
        <circle class="st-hl" cx="40" cy="40" r="23.8"/>
      </svg>`,
    );
    this.fill = inner.querySelector('.st-fill');
    this.ghost = inner.querySelector('.st-ghost');
    const dialSvg = inner.querySelector('svg:not(.st-vine)');
    const svgNS = 'http://www.w3.org/2000/svg';
    for (const radius of EXTRA_RING_RADII) {
      const segments = [];
      const circ = 2 * Math.PI * radius;
      const segLen = circ / EXTRA_RING_SEGMENTS - EXTRA_RING_GAP;
      const group = document.createElementNS(svgNS, 'g');
      group.setAttribute('transform', 'rotate(-90 40 40)');
      group.setAttribute('filter', 'url(#wb-rough)');
      dialSvg.appendChild(group);
      for (let i = 0; i < EXTRA_RING_SEGMENTS; i++) {
        const arc = (cls) => {
          const circle = document.createElementNS(svgNS, 'circle');
          circle.setAttribute('class', cls);
          circle.setAttribute('cx', '40');
          circle.setAttribute('cy', '40');
          circle.setAttribute('r', String(radius));
          circle.setAttribute('stroke-dasharray', `0 ${circ}`);
          circle.setAttribute('stroke-dashoffset', String(-(circ * i) / EXTRA_RING_SEGMENTS - EXTRA_RING_GAP / 2));
          circle.style.display = 'none';
          group.appendChild(circle);
          return circle;
        };
        segments.push({
          track: arc('st-xtrack'),
          fill: arc('st-xfill'),
          len: segLen,
          last: -1,
          on: false,
        });
      }
      this.rings.push(segments);
    }
    const badge = el('div', 'st-badge', this.root);
    badge.innerHTML = `<svg viewBox="0 0 36 36">
      <circle class="bd" cx="18" cy="18" r="16"/>
      <g transform="rotate(-90 18 18)"><circle class="bt" cx="18" cy="18" r="${SLOW_BADGE_RADIUS}" stroke-dasharray="${SLOW_BADGE_CIRC} ${SLOW_BADGE_CIRC}"/></g>
      <path d="M11 25c3-9 9-13 15-14-2 6-6 12-15 14z" fill="#58d66b" stroke="#1c4a22" stroke-width="1"/>
      <path d="M11 25c4-4 8-7 12-10" fill="none" stroke="#1c4a22" stroke-width="1"/>
      <path d="M9 14l3 1.2-2.4 1.8zM24 25l1.8 2.8-3.1-.4z" fill="#e7d8a8"/>
    </svg>`;
    this.badgeArc = badge.querySelector('.bt');
  }
  updateRings(stamina, max) {
    const grew = max > this.lastMax + 0.0001;
    if (max !== this.lastMax || !this.xInit) setClass(this.root, 'xrings', max > 1.001);
    this.xInit = true;
    this.lastMax = max;
    for (let i = 0; i < this.rings.length; i++) {
      const cap = Math.min(1, Math.max(0, max - (i + 1)));
      const level = Math.min(cap, Math.max(0, stamina - (i + 1)));
      const ring = this.rings[i];
      for (let j = 0; j < EXTRA_RING_SEGMENTS; j++) {
        const seg = ring[j];
        const on = cap >= (j + 1) / EXTRA_RING_SEGMENTS - 0.0001;
        if (on !== seg.on) {
          seg.on = on;
          seg.track.style.display = on ? '' : 'none';
          seg.fill.style.display = on ? '' : 'none';
          seg.track.setAttribute('stroke-dasharray', `${seg.len.toFixed(2)} 999`);
          if (on && grew) {
            seg.fill.classList.remove('grow');
            seg.fill.getBoundingClientRect();
            seg.fill.classList.add('grow');
          }
        }
        if (!on) continue;
        const frac = Math.min(1, Math.max(0, (level - j / EXTRA_RING_SEGMENTS) * EXTRA_RING_SEGMENTS));
        if (Math.abs(frac - seg.last) > 0.004) {
          seg.last = frac;
          seg.fill.setAttribute('stroke-dasharray', `${(seg.len * frac).toFixed(2)} 999`);
        }
      }
    }
  }
  updateSlow() {
    const state = this.ctx.player?.state;
    const now = this.ctx.time?.elapsed ?? 0;
    const until = Number(state?.slowedUntil);
    const left = Number.isFinite(until) ? until - now : 0;
    const slowed = left > 0.02 && !state?.dead;
    if (slowed && until !== this.lastSlowEnd) {
      if (!this.slowed || until > this.lastSlowEnd + 0.05) this.slowTotal = Math.max(0.3, left);
      this.lastSlowEnd = until;
    }
    if (slowed !== this.slowed) {
      this.slowed = slowed;
      setClass(this.root, 'slowed', slowed);
    }
    if (slowed && this.badgeArc) {
      const frac = Math.min(1, Math.max(0, left / this.slowTotal));
      if (Math.abs(frac - this.lastBadge) > 0.005) {
        this.lastBadge = frac;
        setStyle(this.badgeArc, 'stroke-dashoffset', (SLOW_BADGE_CIRC * (1 - frac)).toFixed(2));
      }
    }
    return slowed;
  }
  update(dt, visible) {
    const state = this.ctx.player?.state;
    if (!state) return;
    const max = state.staminaMax > 0 ? Math.min(3, state.staminaMax) : 1;
    const mainMax = Math.min(1, max);
    const value = Math.min(1, Math.max(0, state.stamina / mainMax));
    const total = Math.min(1, Math.max(0, state.stamina / max));
    this.value = value;
    this.updateRings(Math.max(0, state.stamina), max);
    const slowed = this.updateSlow();
    const draining = total < this.prev - 0.00001;
    this.prev = total;
    this.drainT = draining ? 0.4 : Math.max(0, this.drainT - dt);
    if (value > this.ghostVal) this.ghostVal = value;
    else if (draining) this.ghostHold = 0.45;
    else if (this.ghostHold > 0) this.ghostHold -= dt;
    else this.ghostVal += (value - this.ghostVal) * damp(5, dt);
    const full = total >= 0.999 && !state.exhausted;
    this.fullFor = full ? this.fullFor + dt : 0;
    const show = visible && (!full || this.fullFor < 0.9 || this.drainT > 0 || slowed);
    if (show !== this.shown) {
      this.shown = show;
      setClass(this.root, 'show', show);
    }
    setClass(this.root, 'exhausted', !!state.exhausted);
    setClass(this.root, 'low', value < 0.22 && !state.exhausted);
    if (Math.abs(value - this.lastFill) > 0.0008) {
      this.lastFill = value;
      setStyle(this.fill, 'stroke-dashoffset', (STAMINA_CIRC * (1 - value)).toFixed(2));
      setStyle(this.fill, 'opacity', value < 0.004 ? '0' : '1');
    }
    const ghost = Math.max(value, this.ghostVal);
    if (Math.abs(ghost - this.lastGhost) > 0.0008) {
      this.lastGhost = ghost;
      setStyle(this.ghost, 'stroke-dashoffset', (STAMINA_CIRC * (1 - ghost)).toFixed(2));
    }
    if (!(!this.shown && this.x >= 0)) this.place(dt);
  }
  place(dt) {
    const camera = this.ctx.camera;
    const character = this.ctx.character;
    try {
      if (character?.headWorld) character.headWorld(this.head);
      else this.head.copy(this.ctx.player.state.position).setY(this.ctx.player.state.position.y + 1.6);
    } catch {
      this.head.copy(this.ctx.player.state.position).setY(this.ctx.player.state.position.y + 1.6);
    }
    this.right.setFromMatrixColumn(camera.matrixWorld, 0);
    this.up.setFromMatrixColumn(camera.matrixWorld, 1);
    const dist = this.head.distanceTo(camera.position);
    const side = Math.min(1.4, 0.45 + dist * 0.045);
    this.p
      .copy(this.head)
      .addScaledVector(this.right, side)
      .addScaledVector(this.up, 0.15 + dist * 0.01);
    this.p.project(camera);
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    let sx;
    let sy;
    if (this.p.z > 1 || !Number.isFinite(this.p.x)) {
      sx = viewW * 0.62;
      sy = viewH * 0.42;
    } else {
      sx = (this.p.x * 0.5 + 0.5) * viewW;
      sy = (-this.p.y * 0.5 + 0.5) * viewH;
    }
    sx = Math.min(viewW - 70, Math.max(70, sx));
    sy = Math.min(viewH - 70, Math.max(70, sy));
    if (this.x < 0 || !this.shown) {
      this.x = sx;
      this.y = sy;
    } else {
      const k = damp(22, dt);
      this.x += (sx - this.x) * k;
      this.y += (sy - this.y) * k;
    }
    setStyle(this.root, 'transform', `translate3d(${this.x.toFixed(1)}px,${this.y.toFixed(1)}px,0)`);
  }
  bump() {
    this.root.animate(
      [
        {
          translate: '0 0',
        },
        {
          translate: '-4px 0',
        },
        {
          translate: '4px 0',
        },
        {
          translate: '-3px 0',
        },
        {
          translate: '0 0',
        },
      ],
      {
        duration: 320,
        easing: 'ease-out',
      },
    );
  }
}
