/**
 * Lock-on HUD: the spinning ring and head marker over the locked enemy, with its health bar (draining ghost, ticks, elite name and colour) and status icons, plus floating bars over nearby alerted brutes and elites. Also projects world points to the screen and looks enemies up by id.
 */
import { Vector3 } from 'three';
import { PALETTE } from '../core/config.js';
import { strokeCanvas } from './brush.js';
import { el, setClass, setStyle } from './dom.js';
import { LOCK_ARROW_SVG, lockRingSvg } from './hud-art.js';
import { ELEMENT_ICONS } from './icons.js';
const _ndc = new Vector3();
const _headPos = new Vector3();
const _screen = {
  x: 0,
  y: 0,
  ok: false,
};
export function toScreen(camera, pos) {
  _ndc.copy(pos).project(camera);
  _screen.ok = _ndc.z > -1 && _ndc.z < 1 && Number.isFinite(_ndc.x) && Number.isFinite(_ndc.y);
  _screen.x = (_ndc.x * 0.5 + 0.5) * window.innerWidth;
  _screen.y = (-_ndc.y * 0.5 + 0.5) * window.innerHeight;
  return _screen;
}
export function findEnemy(ctx, id) {
  if (id != null)
    try {
      const enemy = ctx.enemies?.get?.(id);
      return enemy && enemy.position && Number.isFinite(enemy.position.x) ? enemy : undefined;
    } catch {
      return;
    }
}
const ENEMY_NAMES = {
  smudgeling: 'Smudgeling',
  spitter: 'Spitter',
  brute: 'Smudge Brute',
};
const STATUS_COLORS = {
  burning: 'red',
  frozen: 'blue',
  launched: 'yellow',
  rooted: 'green',
};
const STATUSES = ['burning', 'frozen', 'launched', 'rooted'];
let enemyBarMask = null;
function enemyBarMaskUrl() {
  enemyBarMask ||= strokeCanvas(9, 1.1, '#ffffff', 'ebar-mask', {
    widthFrac: 0.78,
    pts: [
      [0.02, 0.52],
      [0.5, 0.47],
      [0.98, 0.5],
    ],
    dry: 0.12,
    core: 1,
    taperStart: 0.04,
    taperEnd: 0.05,
    wobble: 0.08,
  }).toDataURL();
  return enemyBarMask;
}
let enemyBarBack = null;
function enemyBarBackUrl() {
  enemyBarBack ||= strokeCanvas(10, 1.8, '#0c0d12', 'ebar-back', {
    widthFrac: 0.8,
    pts: [
      [0.02, 0.54],
      [0.5, 0.46],
      [0.98, 0.5],
    ],
    dry: 0.35,
    core: 0.8,
    alpha: 0.82,
    taperStart: 0.05,
    taperEnd: 0.08,
  }).toDataURL();
  return enemyBarBack;
}
class EnemyBar {
  root;
  fill;
  ghost;
  ticks;
  name;
  value = -1;
  ghostV = -1;
  hold = 0;
  maxHp = 0;
  lastF = '';
  lastG = '';
  nameKey = '';
  id = null;
  constructor(host, cls = '') {
    this.root = el('div', `wb-ebar ${cls}`, host);
    this.name = el('div', 'eb-name', this.root);
    const track = el('div', 'eb-track', this.root);
    const back = el('i', 'eb-back', track);
    back.style.backgroundImage = `url(${enemyBarBackUrl()})`;
    const inner = el('div', 'eb-in', track);
    const mask = `url(${enemyBarMaskUrl()})`;
    inner.style.setProperty('mask-image', mask);
    inner.style.setProperty('-webkit-mask-image', mask);
    this.ghost = el('div', 'eb-gh', inner);
    this.fill = el('div', 'eb-f', inner);
    this.ticks = el('div', 'eb-ticks', inner);
  }
  reset() {
    this.value = this.ghostV = -1;
    this.hold = 0;
  }
  set(enemy, dt, showName) {
    const maxHp = Number.isFinite(enemy.maxHealth) && enemy.maxHealth > 0 ? enemy.maxHealth : 1;
    const frac = Math.min(1, Math.max(0, (Number.isFinite(enemy.health) ? enemy.health : maxHp) / maxHp));
    if (maxHp !== this.maxHp) {
      this.maxHp = maxHp;
      this.ticks.textContent = '';
      const step = maxHp <= 6 ? 1 : maxHp <= 16 ? maxHp / 4 : maxHp / 5;
      for (let i = step; i < maxHp - 0.001; i += step) {
        const tick = el('i', '', this.ticks);
        tick.style.left = `${((i / maxHp) * 100).toFixed(2)}%`;
      }
    }
    if (this.value < 0) this.value = this.ghostV = frac;
    if (frac < this.value - 0.0001) {
      this.hold = 0.35;
      this.root.animate(
        [
          {
            filter: 'brightness(2.2)',
          },
          {
            filter: 'brightness(1)',
          },
        ],
        {
          duration: 240,
          easing: 'ease-out',
        },
      );
    }
    this.value = frac;
    if (this.ghostV < frac) this.ghostV = frac;
    if (this.hold > 0) this.hold -= dt;
    else if (this.ghostV > frac) this.ghostV = Math.max(frac, this.ghostV - dt * 0.9);
    const fillClip = `inset(0 ${((1 - frac) * 100).toFixed(1)}% 0 0)`;
    const ghostClip = `inset(0 ${((1 - this.ghostV) * 100).toFixed(1)}% 0 0)`;
    if (fillClip !== this.lastF) {
      this.lastF = fillClip;
      setStyle(this.fill, 'clip-path', fillClip);
    }
    if (ghostClip !== this.lastG) {
      this.lastG = ghostClip;
      setStyle(this.ghost, 'clip-path', ghostClip);
    }
    const elite = enemy.elite && PALETTE[enemy.elite.element] ? enemy.elite : null;
    const named = showName || !!elite;
    const key = named ? (elite ? `e:${elite.name}:${elite.element}` : `k:${enemy.kind}`) : '';
    if (key !== this.nameKey) {
      this.nameKey = key;
      if (elite) {
        this.name.textContent = '';
        const icon = el('i', 'eb-el', this.name, ELEMENT_ICONS[elite.element]);
        icon.style.color = PALETTE[elite.element].css;
        this.name.appendChild(document.createTextNode(elite.name));
        this.root.style.setProperty('--ec', PALETTE[elite.element].css);
      } else this.name.textContent = named ? (ENEMY_NAMES[enemy.kind] ?? '') : '';
    }
    setClass(this.root, 'named', named);
    setClass(this.root, 'elite', !!elite);
    setClass(this.root, 'big', enemy.kind === 'brute' && !elite);
  }
}
export class LockOn {
  ctx;
  root;
  ring;
  ringIn;
  head;
  headIn;
  bar;
  icons = {};
  current = null;
  visible = false;
  hideT = 0;
  cx = 0;
  cy = 0;
  hx = 0;
  hy = 0;
  color = '';
  bruteBars = [];
  bruteScan = 0;
  bruteIds = [];
  tmp = new Vector3();
  constructor(host, ctx) {
    this.ctx = ctx;
    this.root = el('div', 'wb-lockon', host);
    for (let i = 0; i < 3; i++) this.bruteBars.push(new EnemyBar(this.root, 'eb-float off'));
    this.ring = el('div', 'lk-ring off', this.root);
    this.ringIn = el('div', 'lk-in', this.ring);
    el('div', 'lk-spin', this.ringIn, lockRingSvg());
    this.head = el('div', 'lk-head off', this.root);
    this.headIn = el('div', 'lk-hin', this.head);
    el('div', 'lk-arrow', this.headIn, LOCK_ARROW_SVG);
    this.bar = new EnemyBar(this.headIn, 'eb-lock');
    const statusRow = el('div', 'lk-status', this.headIn);
    for (const effect of STATUSES) {
      const icon = el('i', '', statusRow, ELEMENT_ICONS[STATUS_COLORS[effect]]);
      icon.style.setProperty('--ic', PALETTE[STATUS_COLORS[effect]].css);
      this.icons[effect] = icon;
    }
  }
  lockId() {
    const lockTargetId = this.ctx.player?.state?.lockTargetId;
    return typeof lockTargetId == 'number' && Number.isFinite(lockTargetId) ? lockTargetId : null;
  }
  poke() {
    this.current = -999;
  }
  update(dt, active) {
    const id = active ? this.lockId() : null;
    const target = findEnemy(this.ctx, id);
    const targetId = target && target.alive ? id : null;
    if (targetId !== this.current) {
      const prev = this.current;
      this.current = targetId;
      if (targetId === null) this.snapOut();
      else this.snapIn(prev !== null && prev !== -999 && this.visible);
    }
    if (this.hideT > 0) {
      this.hideT -= dt;
      if (this.hideT <= 0) {
        setClass(this.ring, 'off', true);
        setClass(this.head, 'off', true);
      }
    }
    if (target && targetId !== null) this.place(target, dt);
    this.updateBrutes(dt, active, targetId);
  }
  snapIn(swap) {
    this.visible = true;
    this.hideT = 0;
    this.bar.reset();
    setClass(this.ring, 'off', false);
    setClass(this.head, 'off', false);
    this.ring.getAnimations().forEach((anim) => anim.cancel());
    this.head.getAnimations().forEach((anim) => anim.cancel());
    this.ringIn.animate(
      [
        {
          transform: `scale(${swap ? 1.5 : 2.6}) rotate(-100deg)`,
          opacity: 0,
        },
        {
          transform: 'scale(0.9) rotate(10deg)',
          opacity: 1,
          offset: 0.68,
        },
        {
          transform: 'scale(1) rotate(0deg)',
          opacity: 1,
        },
      ],
      {
        duration: swap ? 220 : 300,
        easing: 'cubic-bezier(.2,.9,.3,1)',
      },
    );
    this.headIn.animate(
      [
        {
          transform: 'translateY(-1.6em) scale(1.4)',
          opacity: 0,
        },
        {
          transform: 'translateY(0.15em) scale(0.95)',
          opacity: 1,
          offset: 0.7,
        },
        {
          transform: 'none',
          opacity: 1,
        },
      ],
      {
        duration: 320,
        easing: 'cubic-bezier(.2,1,.3,1)',
      },
    );
  }
  snapOut() {
    if (this.visible) {
      this.visible = false;
      this.ring.animate(
        [
          {
            opacity: 1,
            transform: 'scale(1)',
          },
          {
            opacity: 0,
            transform: 'scale(1.35)',
          },
        ],
        {
          duration: 190,
          easing: 'ease-in',
          fill: 'forwards',
        },
      );
      this.head.animate(
        [
          {
            opacity: 1,
          },
          {
            opacity: 0,
            transform: 'translateY(-0.5em)',
          },
        ],
        {
          duration: 190,
          easing: 'ease-in',
          fill: 'forwards',
        },
      );
      this.hideT = 0.2;
    }
  }
  place(target, dt) {
    const camera = this.ctx.camera;
    const aim = target.aim && Number.isFinite(target.aim.x + target.aim.y + target.aim.z) ? target.aim : null;
    const height = aim
      ? Math.max(0.8, Math.min(3, (Number.isFinite(target.radius) ? target.radius : 1) * 1.6))
      : Number.isFinite(target.height) && target.height > 0
        ? target.height
        : 1.2;
    const radius = Number.isFinite(target.radius) && target.radius > 0 ? Math.min(aim ? 1.6 : 99, target.radius) : 0.5;
    if (aim) this.tmp.copy(aim);
    else {
      this.tmp.copy(target.position);
      this.tmp.y += height * 0.5;
    }
    const center = toScreen(camera, this.tmp);
    setStyle(this.ring, 'visibility', center.ok ? 'visible' : 'hidden');
    setStyle(this.head, 'visibility', center.ok ? 'visible' : 'hidden');
    if (!center.ok) return;
    const x = center.x;
    const y2 = center.y;
    if (aim) _headPos.copy(aim).setY(aim.y + height * 0.5 + 0.35);
    else {
      _headPos.copy(target.position);
      _headPos.y += height + 0.35;
    }
    const headPt = toScreen(camera, _headPos);
    const hx = headPt.x;
    const hy = headPt.y;
    const dist = Math.max(1, camera.position.distanceTo(this.tmp));
    const focal = window.innerHeight / (2 * Math.tan((camera.fov ?? 55) * (Math.PI / 360)));
    const size = (Math.max(height, radius * 2.2) * focal) / dist;
    const ringPx = Math.min(window.innerHeight * 0.45, Math.max(78, size * 1.15));
    const k = this.visible && this.cx ? Math.min(1, dt * 30) : 1;
    this.cx += (x - this.cx) * k;
    this.cy += (y2 - this.cy) * k;
    this.hx += (hx - this.hx) * k;
    this.hy += (hy - this.hy) * k;
    setStyle(
      this.ring,
      'transform',
      `translate3d(${this.cx.toFixed(1)}px,${this.cy.toFixed(1)}px,0) scale(${(ringPx / 112).toFixed(3)})`,
    );
    setStyle(
      this.head,
      'transform',
      `translate3d(${this.hx.toFixed(1)}px,${Math.min(this.hy, this.cy - ringPx * 0.5).toFixed(1)}px,0)`,
    );
    const selectedColor = this.ctx.player?.state?.selectedColor;
    const color = selectedColor && PALETTE[selectedColor] ? PALETTE[selectedColor].css : '#f6efdf';
    if (color !== this.color) {
      this.color = color;
      this.root.style.setProperty('--lc', color);
    }
    const danger = !!target.telegraphing;
    setClass(this.ring, 'danger', danger);
    setClass(this.head, 'danger', danger);
    setClass(this.head, 'boss', !!target.boss);
    this.bar.set(target, dt, target.kind === 'brute');
    for (const effect of STATUSES) {
      let on = false;
      try {
        on = !!target.statuses?.has?.(effect);
      } catch {
        on = false;
      }
      setClass(this.icons[effect], 'on', on);
    }
  }
  updateBrutes(dt, active, lockedId) {
    this.bruteScan -= dt;
    if (this.bruteScan <= 0 && ((this.bruteScan = 0.25), (this.bruteIds.length = 0), active))
      try {
        const position = this.ctx.player?.state?.position;
        const nearby = position ? (this.ctx.enemies?.query?.(position, 45) ?? []) : [];
        for (const enemy of nearby) {
          if (
            (enemy.kind === 'brute' || enemy.elite) &&
            !enemy.boss &&
            enemy.alive &&
            enemy.alerted &&
            enemy.id !== lockedId
          )
            this.bruteIds.push(enemy.id);
          if (this.bruteIds.length >= this.bruteBars.length) break;
        }
      } catch {}
    for (let i = 0; i < this.bruteBars.length; i++) {
      const bar = this.bruteBars[i];
      const id = this.bruteIds[i];
      const enemy = id !== undefined && id !== lockedId ? findEnemy(this.ctx, id) : undefined;
      if (!enemy || !enemy.alive) {
        setClass(bar.root, 'off', true);
        bar.id = null;
        continue;
      }
      if (bar.id !== id) {
        bar.id = id;
        bar.reset();
      }
      this.tmp.copy(enemy.position);
      this.tmp.y += (Number.isFinite(enemy.height) ? enemy.height : 2.5) + 0.45;
      const pt = toScreen(this.ctx.camera, this.tmp);
      setClass(bar.root, 'off', !pt.ok);
      if (pt.ok) {
        setStyle(bar.root, 'transform', `translate3d(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px,0)`);
        bar.set(enemy, dt, true);
      }
    }
  }
}
