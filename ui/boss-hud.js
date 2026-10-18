/**
 * Boss HUD: the boss's title card, then a health bar with a lagging ghost and phase pips; plus the smaller banner that announces elite foes.
 */
import { COLORS, PALETTE } from '../core/config.js';
import { makeRng } from '../core/math.js';
import { splatCanvas, strokeCanvas, washCanvas } from './brush.js';
import { el, setClass, setStyle, setText } from './dom.js';
import { ELEMENT_ICONS } from './icons.js';
import { PI2, rainbowStroke } from './item-icons.js';
const BOSS_EPITHETS = {
  greymaw: 'The Colour Thief',
};
export class BossHud {
  ctx;
  root;
  card = null;
  bar;
  fill;
  ghost;
  sheen;
  notches;
  nameEl;
  phaseEl;
  active = false;
  barOn = false;
  barAt = -1;
  elapsed = 0;
  value = 1;
  ghostV = 1;
  hold = 0;
  phase = 1;
  lastF = '';
  lastG = '';
  name = 'Greymaw';
  defeatedAt = -1;
  constructor(host, ctx) {
    this.ctx = ctx;
    this.root = el('div', 'wb-boss', host);
    this.bar = el('div', 'bb-wrap off', this.root);
    const head = el('div', 'bb-head', this.bar);
    this.nameEl = el('div', 'bb-name', head);
    this.phaseEl = el('div', 'bb-phase', head);
    const track = el('div', 'bb-track', this.bar);
    const back = strokeCanvas(40, 3.4, '#0b0b10', 'bb-back', {
      widthFrac: 0.86,
      pts: [
        [0.01, 0.52],
        [0.5, 0.46],
        [0.99, 0.5],
      ],
      dry: 0.3,
      core: 0.85,
      alpha: 0.88,
      taperStart: 0.02,
      taperEnd: 0.03,
      wobble: 0.1,
    });
    back.className = 'bb-back';
    track.appendChild(back);
    const inner = el('div', 'bb-in', track);
    const maskURL = strokeCanvas(38, 1.6, '#ffffff', 'bb-mask', {
      widthFrac: 0.8,
      pts: [
        [0.01, 0.52],
        [0.5, 0.48],
        [0.99, 0.5],
      ],
      dry: 0.1,
      core: 1,
      taperStart: 0.015,
      taperEnd: 0.02,
      wobble: 0.06,
    }).toDataURL();
    inner.style.setProperty('mask-image', `url(${maskURL})`);
    inner.style.setProperty('-webkit-mask-image', `url(${maskURL})`);
    this.ghost = el('div', 'bb-gh', inner);
    this.fill = el('div', 'bb-f', inner);
    this.sheen = el('div', 'bb-sheen', this.fill);
    this.notches = el('div', 'bb-notches', inner);
    for (const at of [0.3, 0.65]) {
      const notch = el('i', '', this.notches);
      notch.style.left = `${(at * 100).toFixed(2)}%`;
    }
    COLORS.forEach((color, i) => {
      const dot = splatCanvas(4, PALETTE[color].css, `bb-dot-${color}`, {
        rFrac: 0.17,
        tendrils: 5,
        drops: 8,
        reach: 0.9,
        rim: true,
      });
      dot.className = 'bb-dot';
      dot.style.left = i < 2 ? `${-3.6 + i * 1.5}em` : `calc(100% + ${-0.4 + (i - 2) * 1.5}em)`;
      track.appendChild(dot);
    });
  }
  bossName() {
    try {
      const label = this.ctx.boss?.name;
      if (typeof label == 'string' && label) return label;
    } catch {}
    return this.name;
  }
  onStart(bossName) {
    this.name = bossName || this.bossName();
    this.active = true;
    this.defeatedAt = -1;
    this.value = this.ghostV = 1;
    this.phase = 1;
    this.showCard(this.name);
    this.barAt = this.elapsed + 3.3;
    setText(this.nameEl, this.name.toUpperCase());
    this.setPhase(1, false);
  }
  onPhase(phase) {
    if (this.active) this.setPhase(phase, true);
  }
  onReset() {
    this.active = false;
    this.hideCard();
    this.showBar(false);
  }
  onDefeated() {
    if (!(!this.active || this.defeatedAt >= 0)) {
      this.defeatedAt = this.elapsed;
      this.hideCard();
    }
  }
  setPhase(phase, pulse) {
    const level = Math.max(1, Math.min(9, Math.round(phase) || 1));
    this.phase = level;
    this.phaseEl.textContent = '';
    for (let i = 1; i <= Math.max(3, level); i++) el('i', i <= level ? 'on' : '', this.phaseEl);
    setClass(this.bar, 'p2', level === 2);
    setClass(this.bar, 'p3', level >= 3);
    if (pulse && this.barOn)
      this.bar.animate(
        [
          {
            transform: 'translateX(-50%) scale(1)',
            filter: 'brightness(1)',
          },
          {
            transform: 'translateX(-50%) scale(1.04)',
            filter: 'brightness(2)',
          },
          {
            transform: 'translateX(-50%) scale(1)',
            filter: 'brightness(1)',
          },
        ],
        {
          duration: 600,
          easing: 'cubic-bezier(.2,.9,.3,1)',
        },
      );
  }
  showCard(title, win = false) {
    this.hideCard(true);
    const card = el('div', `bt-card${win ? ' win' : ''}`, this.root);
    const wash = washCanvas(64, 26, 'bt-wash', win ? 0.55 : 0.7);
    wash.className = 'bt-wash';
    card.appendChild(wash);
    const strokeOpts = {
      widthFrac: 0.78,
      pts: [
        [0.02, 0.6],
        [0.28, 0.46],
        [0.62, 0.54],
        [0.98, 0.4],
      ],
      dry: 0.5,
      core: 0.85,
      alpha: 0.93,
      taperStart: 0.05,
      taperEnd: 0.25,
      wobble: 0.28,
      streak: 0.2,
    };
    const stroke = win
      ? rainbowStroke(58, 11, 'bt-win', {
          ...strokeOpts,
          alpha: 0.95,
          streak: 0.1,
          sheen: 0.25,
        })
      : strokeCanvas(58, 11, '#07070b', 'bt-stroke', strokeOpts);
    stroke.className = 'bt-stroke';
    card.appendChild(stroke);
    const rng = makeRng(`bt-${title}`);
    for (let i = 0; i < 7; i++) {
      const splat = splatCanvas(8, i < 4 ? PALETTE[COLORS[i]].css : '#1d1c24', `bt-sp-${i}`, {
        rFrac: 0.15 + rng() * 0.06,
        tendrils: 7,
        drops: 14,
        reach: 1.3,
        rim: true,
      });
      splat.className = `bt-sp ${i < 4 ? 'col' : ''}`;
      const angle = (i / 7) * PI2 + rng() * 0.5;
      splat.style.left = `calc(50% + ${(Math.cos(angle) * (23 + rng() * 5)).toFixed(1)}em - 4em)`;
      splat.style.top = `calc(50% + ${(Math.sin(angle) * (4 + rng() * 2)).toFixed(1)}em - 4em)`;
      splat.style.animationDelay = `${(0.25 + i * 0.06).toFixed(2)}s`;
      card.appendChild(splat);
    }
    const letters = el('div', 'bt-name', card);
    const text = win ? 'COLOUR RESTORED' : title.toUpperCase();
    for (const [index, letter] of [...text].entries()) {
      const span = el('span', '', letters, letter === ' ' ? '&nbsp;' : letter);
      span.style.animationDelay = `${(0.35 + index * (win ? 0.045 : 0.06)).toFixed(2)}s`;
    }
    const sub = win
      ? `${title}, ${BOSS_EPITHETS[title.toLowerCase()] ?? 'the thief'}, is no more`
      : (BOSS_EPITHETS[title.toLowerCase()] ?? '');
    if (sub) el('div', 'bt-sub', card).textContent = sub;
    card.offsetWidth;
    card.classList.add('in');
    this.card = card;
    const shown = card;
    setTimeout(
      () => {
        if (this.card === shown) this.hideCard();
      },
      win ? 4200 : 3300,
    );
  }
  hideCard(instant = false) {
    const card = this.card;
    if (card) {
      this.card = null;
      if (instant) {
        card.remove();
        return;
      }
      card.classList.remove('in');
      card.classList.add('out');
      setTimeout(() => card.remove(), 900);
    }
  }
  showBar(on) {
    if (on !== this.barOn) {
      this.barOn = on;
      setClass(this.bar, 'off', !on);
      if (on) {
        this.bar.getAnimations().forEach((anim) => anim.cancel());
        this.bar.animate(
          [
            {
              opacity: 0,
              transform: 'translateX(-50%) translateY(1.2em) scaleX(0.6)',
            },
            {
              opacity: 1,
              transform: 'translateX(-50%) translateY(0) scaleX(1)',
            },
          ],
          {
            duration: 700,
            easing: 'cubic-bezier(.2,.9,.3,1)',
          },
        );
      }
    }
  }
  update(dt, visible) {
    this.elapsed += dt;
    setClass(this.root, 'hidden', !visible);
    if (!this.active) return;
    if (this.defeatedAt >= 0) {
      this.value = 0;
      if (this.elapsed - this.defeatedAt > 2.2) {
        this.active = false;
        this.showBar(false);
        return;
      }
    } else {
      let frac = 1;
      try {
        const boss = this.ctx.boss;
        const max = Number(boss?.maxHealth);
        const health = Number(boss?.health);
        if (Number.isFinite(max) && max > 0 && Number.isFinite(health)) frac = Math.min(1, Math.max(0, health / max));
        const phase = Number(boss?.phase);
        if (Number.isFinite(phase) && phase >= 1 && Math.round(phase) !== this.phase) this.setPhase(phase, true);
        if (boss?.defeated) this.onDefeated();
      } catch {
        frac = this.value;
      }
      if (frac < this.value - 0.0001) {
        this.hold = 0.55;
        this.fill.animate(
          [
            {
              filter: 'brightness(2.4)',
            },
            {
              filter: 'brightness(1)',
            },
          ],
          {
            duration: 260,
            easing: 'ease-out',
          },
        );
      }
      this.value = frac;
    }
    if (this.barAt >= 0 && this.elapsed >= this.barAt) {
      this.barAt = -1;
      this.showBar(true);
    }
    if (this.ghostV < this.value) this.ghostV = this.value;
    if (this.hold > 0) this.hold -= dt;
    else if (this.ghostV > this.value)
      this.ghostV = Math.max(this.value, this.ghostV - dt * 0.45 - (this.ghostV - this.value) * dt * 1.5);
    const fillClip = `inset(0 ${((1 - this.value) * 100).toFixed(2)}% 0 0)`;
    const ghostClip = `inset(0 ${((1 - this.ghostV) * 100).toFixed(2)}% 0 0)`;
    if (fillClip !== this.lastF) {
      this.lastF = fillClip;
      setStyle(this.fill, 'clip-path', fillClip);
    }
    if (ghostClip !== this.lastG) {
      this.lastG = ghostClip;
      setStyle(this.ghost, 'clip-path', ghostClip);
    }
    this.sheen;
  }
}
export class EliteBanner {
  root;
  seen = new Map();
  elapsed = 0;
  constructor(host) {
    this.root = el('div', 'wb-elitebanner', host);
  }
  show(id, title, color, subtitle) {
    const seenAt = this.seen.get(id);
    if (seenAt !== undefined && this.elapsed - seenAt < 20) return;
    this.seen.set(id, this.elapsed);
    const pal = PALETTE[color] ?? PALETTE.red;
    for (const old of this.root.querySelectorAll('.eb-card')) old.remove();
    const card = el('div', 'eb-card', this.root);
    card.style.setProperty('--ec', pal.css);
    const wash = washCanvas(40, 11, 'eb-wash', 0.7);
    wash.className = 'eb-wash';
    card.appendChild(wash);
    const back = strokeCanvas(30, 5.4, '#0b0b10', `eb-back-${color}`, {
      widthFrac: 0.8,
      pts: [
        [0.02, 0.55],
        [0.4, 0.46],
        [0.98, 0.52],
      ],
      dry: 0.45,
      core: 0.85,
      alpha: 0.88,
      taperStart: 0.03,
      taperEnd: 0.3,
      wobble: 0.2,
    });
    back.className = 'eb-back';
    card.appendChild(back);
    const icon = el('i', 'eb-icon', card, ELEMENT_ICONS[color] ?? '');
    icon.style.color = pal.css;
    const text = el('div', 'eb-text', card);
    el('div', 'eb-name', text).textContent = title;
    const line = el('div', 'eb-line', text);
    const under = strokeCanvas(20, 1.2, pal.css, `eb-under-${color}`, {
      widthFrac: 0.55,
      dry: 0.5,
      taperStart: 0.05,
      taperEnd: 0.4,
      core: 0.5,
    });
    under.className = 'eb-under';
    line.appendChild(under);
    el('div', 'eb-sub', text).textContent = subtitle ?? `Hoarder of ${pal.name}`;
    card.offsetWidth;
    card.classList.add('in');
    setTimeout(() => {
      card.classList.remove('in');
      card.classList.add('out');
      setTimeout(() => card.remove(), 700);
    }, 3200);
  }
  update(dt) {
    this.elapsed += dt;
  }
}
