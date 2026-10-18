/**
 * Stormborne (tier 2) Smudges: violet crackle, sparks and arcs around them, and the lightning discharge ring they release when they die.
 */
import { Color, Vector3 } from 'three';
import { ATTACKS, STORMBORNE } from './defs.js';
const stormRand = (min, max) => min + Math.random() * (max - min);
export const STORM_VIOLET = new Color(0.55, 0.36, 1);
export const STORM_WHITE = new Color(0.86, 0.86, 1);
export const STORM_INK = new Color(0.2, 0.14, 0.45);
const _arcFrom = new Vector3();
const _arcTo = new Vector3();
const _zapColor = new Color();
export class Stormborne {
  ctx;
  d;
  constructor(ctx, director) {
    this.ctx = ctx;
    this.d = director;
  }
  init(enemy) {
    enemy.tier = 2;
    enemy.dmgMul = STORMBORNE.damageMul;
    enemy.crackle = 0.3;
    enemy.sparkT = Math.random() * 0.3;
  }
  ambient(enemy, dt, camDistSq) {
    const attacking = enemy.state === 'telegraph' || enemy.state === 'attack';
    const target = enemy.state === 'dying' ? 1.6 : attacking ? 1.25 : enemy.alerted ? 0.55 : 0.28;
    enemy.crackle += (target - enemy.crackle) * (1 - Math.exp(-(attacking ? 10 : 3) * dt));
    if (!(camDistSq > 1444)) {
      enemy.sparkT -= dt * (attacking ? 3 : 1);
      if (!(enemy.sparkT > 0)) {
        enemy.sparkT = stormRand(0.12, 0.34);
        this.zap(enemy, attacking ? 3 : 1);
        if (Math.random() < 0.18) this.arc(enemy);
      }
    }
  }
  zap(enemy, count) {
    const d = this.d;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const y = enemy.position.y + enemy.height * stormRand(0.25, 1);
      const dist = enemy.radius * stormRand(0.8, 1.15) * enemy.scale;
      const x = enemy.position.x + Math.sin(angle) * dist;
      const z = enemy.position.z + Math.cos(angle) * dist;
      const spd = stormRand(3, 6);
      _zapColor.copy(Math.random() < 0.5 ? STORM_WHITE : STORM_VIOLET);
      d.fx.glows.spawn(
        d.time,
        x,
        y,
        z,
        Math.sin(angle) * spd,
        stormRand(-2, 3),
        Math.cos(angle) * spd,
        stormRand(0.035, 0.06) * Math.sqrt(enemy.def.size),
        stormRand(0.08, 0.16),
        _zapColor,
        4.5,
        0,
        8,
        3.5,
      );
    }
  }
  arc(enemy) {
    const d = this.d;
    const a0 = Math.random() * Math.PI * 2;
    const a1 = a0 + stormRand(0.8, 2.2) * (Math.random() < 0.5 ? -1 : 1);
    const radius = enemy.radius * 1.05 * enemy.scale;
    const y0 = enemy.position.y + enemy.height * stormRand(0.3, 0.9);
    const y1 = enemy.position.y + enemy.height * stormRand(0.3, 0.9);
    _arcFrom.set(enemy.position.x + Math.sin(a0) * radius, y0, enemy.position.z + Math.cos(a0) * radius);
    _arcTo.set(enemy.position.x + Math.sin(a1) * radius, y1, enemy.position.z + Math.cos(a1) * radius);
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;
      const jitter = i === 0 || i === 6 ? 0 : 0.12 * Math.sqrt(enemy.def.size);
      d.fx.glows.spawn(
        d.time,
        _arcFrom.x + (_arcTo.x - _arcFrom.x) * u + stormRand(-jitter, jitter),
        _arcFrom.y + (_arcTo.y - _arcFrom.y) * u + stormRand(-jitter, jitter),
        _arcFrom.z + (_arcTo.z - _arcFrom.z) * u + stormRand(-jitter, jitter),
        0,
        0,
        0,
        0.05 * Math.sqrt(enemy.def.size),
        0.09,
        STORM_WHITE,
        5,
        0,
        1,
        0,
      );
    }
  }
  onKilled(enemy) {
    const d = this.d;
    enemy.deathDur = STORMBORNE.deathDur[enemy.kind];
    enemy.crackle = 1.2;
    const radius = STORMBORNE.dischargeRadius[enemy.kind];
    const floor = d.ground(enemy.position.x, enemy.position.z, enemy.position.y + 0.5);
    d.fx.marker(_arcFrom.set(enemy.position.x, floor, enemy.position.z), radius, enemy.deathDur, STORM_VIOLET, 3.4);
    d.emit('enemy:telegraph', {
      id: enemy.id,
      kind: enemy.kind,
      position: enemy.position.clone(),
      attack: 'discharge',
      eta: enemy.deathDur,
    });
  }
  dying(enemy, dt, progress) {
    const d = this.d;
    if (Math.random() < dt * (18 + 30 * progress)) {
      const radius = STORMBORNE.dischargeRadius[enemy.kind];
      const floor = d.fxFloor(enemy.position.x, enemy.position.z, enemy.position.y);
      const angle = Math.random() * Math.PI * 2;
      d.fx.glows.spawn(
        d.time,
        enemy.position.x + Math.cos(angle) * radius,
        floor + 0.12,
        enemy.position.z + Math.sin(angle) * radius,
        -Math.sin(angle) * 2.5,
        stormRand(0.5, 2),
        Math.cos(angle) * 2.5,
        stormRand(0.06, 0.1),
        stormRand(0.12, 0.22),
        Math.random() < 0.4 ? STORM_WHITE : STORM_VIOLET,
        4.5,
        0,
        3,
        2.5,
      );
    }
    enemy.sparkT -= dt * (2 + progress * 4);
    if (!(enemy.sparkT > 0)) {
      enemy.sparkT = stormRand(0.08, 0.16);
      this.zap(enemy, 2 + Math.round(progress * 3));
      if (Math.random() < 0.5) this.arc(enemy);
    }
  }
  discharge(enemy) {
    const d = this.d;
    const radius = STORMBORNE.dischargeRadius[enemy.kind];
    const floor = d.ground(enemy.position.x, enemy.position.z, enemy.position.y + 0.5);
    const center = _arcFrom.set(enemy.position.x, floor, enemy.position.z);
    d.elite.addRingRaw(
      enemy.id,
      'storm',
      null,
      STORM_VIOLET,
      center,
      0.4,
      radius - 0.5,
      0.42,
      ATTACKS.discharge.damage,
      ATTACKS.discharge.knockback,
      true,
    );
    d.fx.waves.spawn(d.time, center.x, floor, center.z, 0.4, radius + 0.3, 0.38, 1.4, STORM_WHITE, 2.6);
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + stormRand(-0.2, 0.2);
      const spd = radius / 0.3;
      d.fx.glows.spawn(
        d.time,
        center.x,
        floor + stormRand(0.15, 0.6),
        center.z,
        Math.sin(angle) * spd,
        stormRand(0, 2),
        Math.cos(angle) * spd,
        stormRand(0.07, 0.11),
        0.3,
        Math.random() < 0.5 ? STORM_WHITE : STORM_VIOLET,
        5,
        0,
        3,
        3,
      );
    }
    const core = _arcTo.set(center.x, floor + enemy.height * 0.5, center.z);
    d.fx.glows.spawn(
      d.time,
      core.x,
      core.y,
      core.z,
      0,
      0,
      0,
      2.2 * Math.sqrt(enemy.def.size),
      0.18,
      STORM_WHITE,
      3,
      0,
      1,
      0,
    );
    d.fx.sparks(core, STORM_VIOLET, 20, 8, 4.5, 0.08, 2);
    d.emit('enemy:attack', {
      id: enemy.id,
      kind: enemy.kind,
      position: center.clone(),
      attack: 'discharge',
    });
    d.emit('camera:shake', {
      strength: 0.25,
      position: center.clone(),
    });
  }
}
