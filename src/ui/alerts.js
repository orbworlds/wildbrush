/**
 * Alert marks over enemies: a yellow ! pops up when a Smudge notices the hero and a ? when it gives up the chase, following the enemy on screen.
 */
import { Vector3 } from 'three';
import { el, setClass, setStyle } from './dom.js';
import { ALERT_BANG_SVG, ALERT_QUESTION_SVG } from './hud-art.js';
import { findEnemy, toScreen } from './lock-on.js';
const MAX_ALERTS = 8;
export class AlertMarks {
  ctx;
  root;
  marks = [];
  watched = new Map();
  tmp = new Vector3();
  constructor(host, ctx) {
    this.ctx = ctx;
    this.root = el('div', 'wb-alerts', host);
    for (let i = 0; i < MAX_ALERTS; i++) {
      const root = el('div', 'al-mark off', this.root);
      const inner = el('div', 'al-in', root);
      this.marks.push({
        root,
        inner,
        id: -1,
        t: 0,
        life: 0,
        fallback: new Vector3(),
        busy: false,
      });
    }
  }
  alert(id, pos) {
    this.watched.set(id, 0);
    this.show(id, 'bang', pos);
  }
  clear() {
    for (const mark of this.marks) {
      mark.busy = false;
      setClass(mark.root, 'off', true);
    }
    this.watched.clear();
  }
  show(id, kind, pos) {
    let slot = this.marks.find((mark) => mark.busy && mark.id === id) ?? this.marks.find((mark) => !mark.busy);
    slot ||= this.marks.reduce((acc, mark) => (acc.t > mark.t ? acc : mark));
    slot.busy = true;
    slot.id = id;
    slot.t = 0;
    slot.life = kind === 'bang' ? 1.5 : 1.7;
    if (pos && Number.isFinite(pos.x)) slot.fallback.copy(pos);
    else slot.fallback.set(NaN, NaN, NaN);
    slot.inner.innerHTML = kind === 'bang' ? ALERT_BANG_SVG : ALERT_QUESTION_SVG;
    setClass(slot.root, 'q', kind === 'question');
    setClass(slot.root, 'off', false);
    slot.inner.getAnimations().forEach((anim) => anim.cancel());
    if (kind === 'bang')
      slot.inner.animate(
        [
          {
            transform: 'translateY(0.9em) scale(0.1, 0.4) rotate(-14deg)',
            opacity: 0,
          },
          {
            transform: 'translateY(-0.45em) scale(1.3, 1.15) rotate(6deg)',
            opacity: 1,
            offset: 0.14,
          },
          {
            transform: 'translateY(0.12em) scale(0.9, 1.08) rotate(-3deg)',
            offset: 0.24,
          },
          {
            transform: 'translateY(0) scale(1) rotate(0deg)',
            offset: 0.34,
          },
          {
            transform: 'translateY(0) scale(1) rotate(0deg)',
            opacity: 1,
            offset: 0.8,
          },
          {
            transform: 'translateY(-0.7em) scale(0.85) rotate(0deg)',
            opacity: 0,
          },
        ],
        {
          duration: slot.life * 1000,
          easing: 'linear',
          fill: 'forwards',
        },
      );
    else
      slot.inner.animate(
        [
          {
            transform: 'scale(0.2) rotate(-30deg)',
            opacity: 0,
          },
          {
            transform: 'scale(1.1) rotate(10deg)',
            opacity: 1,
            offset: 0.15,
          },
          {
            transform: 'scale(1) rotate(-8deg)',
            offset: 0.35,
          },
          {
            transform: 'scale(1) rotate(8deg)',
            offset: 0.55,
          },
          {
            transform: 'scale(1) rotate(-4deg)',
            opacity: 1,
            offset: 0.8,
          },
          {
            transform: 'scale(0.8) rotate(0deg) translateY(-0.4em)',
            opacity: 0,
          },
        ],
        {
          duration: slot.life * 1000,
          easing: 'ease-in-out',
          fill: 'forwards',
        },
      );
  }
  update(dt, active) {
    setClass(this.root, 'off', !active);
    if (this.watched.size)
      for (const [id, age] of this.watched) {
        const enemy = findEnemy(this.ctx, id);
        const t = age + dt;
        this.watched.set(id, t);
        if (!enemy || !enemy.alive) {
          this.watched.delete(id);
          continue;
        }
        if (!enemy.alerted && t > 0.6) {
          this.watched.delete(id);
          this.show(id, 'question');
        }
      }
    const camera = this.ctx.camera;
    for (const mark of this.marks) {
      if (!mark.busy) continue;
      mark.t += dt;
      if (mark.t >= mark.life) {
        mark.busy = false;
        setClass(mark.root, 'off', true);
        continue;
      }
      const enemy = findEnemy(this.ctx, mark.id);
      if (enemy) {
        this.tmp.copy(enemy.position);
        this.tmp.y += (Number.isFinite(enemy.height) ? enemy.height : 1.2) + 0.55;
      } else if (Number.isFinite(mark.fallback.x)) {
        this.tmp.copy(mark.fallback);
        this.tmp.y += 1.8;
      } else {
        mark.busy = false;
        setClass(mark.root, 'off', true);
        continue;
      }
      const pt = toScreen(camera, this.tmp);
      if (!pt.ok) {
        setStyle(mark.root, 'visibility', 'hidden');
        continue;
      }
      setStyle(mark.root, 'visibility', 'visible');
      const dist = Math.max(1, camera.position.distanceTo(this.tmp));
      const scale = Math.min(1.25, Math.max(0.55, 14 / dist));
      setStyle(
        mark.root,
        'transform',
        `translate3d(${pt.x.toFixed(1)}px,${pt.y.toFixed(1)}px,0) scale(${scale.toFixed(3)})`,
      );
    }
  }
}
