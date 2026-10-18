/**
 * Movement and combat effects on the hero's particle pool: surface-coloured footstep dust and flecks, landing puffs, water splashes, ripples and wakes, slide spray, paint drips and flick sprays from the brush, Spring bounce bursts, hit impacts, ground slams and charge sparks.
 */
import { Color, Vector3 } from 'three';
import { PALETTE } from '../core/config.js';
import { VfxPool, VfxType } from './vfx.js';
const SURFACE_DUST = {
  grass: [0x6f9b45, 0x8fb654, 0x5b8a3a, 0xa9c867],
  dirt: [10848870, 9336408, 12098935],
  path: [12823942, 11573876],
  sand: [0xe6d3a3, 0xd8c28e, 0xf0e2bb],
  rock: [0xa69f95, 0x8f877c],
  stone: [0xa69f95, 0x8f877c],
  snow: [16054267, 14937077],
  ice: [14676991, 12576511, 16777215],
  wood: [0x9a7550, 0x7d5c3d],
  water: [0xe8f7ff, 0xc8ecff],
  paint: [16777215],
};
const _dropColor = new Color();
const _fxTmp = new Vector3();
export class HeroEffects {
  ctx;
  vfx;
  dripT = 0.5;
  rippleT = 0;
  sprayT = 0;
  lastMode = '';
  handBelow = [false, false];
  seenLand = -1;
  seenFlick = -1;
  seenBounce = -1;
  seed = 1;
  constructor(ctx) {
    this.ctx = ctx;
    this.vfx = new VfxPool(ctx);
    this.vfx.onLand = (x, y, z, r, g, b, type) => {
      if (type === VfxType.Drop && this.rand() < 0.7)
        this.vfx.emit({
          type: VfxType.Splat,
          x,
          y: y + 0.012,
          z,
          size: 0.05 + this.rand() * 0.05,
          life: 1.6,
          color: _dropColor.setRGB(r, g, b),
          alpha: 0.9,
        });
    };
  }
  rand() {
    let x = (this.seed = (this.seed * 1664525 + 1013904223) >>> 0);
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  }
  pick(list) {
    return list[Math.floor(this.rand() * list.length) % list.length];
  }
  surfaceColors(surface, paint) {
    return paint ? [PALETTE[paint].hex] : (SURFACE_DUST[surface] ?? SURFACE_DUST.dirt);
  }
  footstep(pos, state, intensity) {
    const surface = state.surface;
    const quality = this.ctx.settings.quality;
    const density = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
    const pace = Math.min(1, state.speed / 7);
    const colors = this.surfaceColors(surface, state.paintUnderfoot);
    const sinF = Math.sin(state.facing);
    const cosF = Math.cos(state.facing);
    if (state.waterDepth > 0.05 && state.mode === 'ground') {
      this.splash(pos.x, this.ctx.water?.level ?? 0, pos.z, 0.5 + pace * 0.6, true);
      return;
    }
    if (state.paintUnderfoot) {
      const count = Math.round((2 + pace * 4) * density);
      for (let i = 0; i < count; i++) {
        const ang = this.rand() * Math.PI * 2;
        this.vfx.emit({
          type: VfxType.Drop,
          x: pos.x,
          y: pos.y + 0.03,
          z: pos.z,
          vx: Math.cos(ang) * 1.2 - sinF * pace * 1.5,
          vy: 1.5 + this.rand() * 1.5,
          vz: Math.sin(ang) * 1.2 - cosF * pace * 1.5,
          size: 0.035 + this.rand() * 0.02,
          life: 0.6,
          color: colors[0],
          gravity: -14,
          floor: pos.y + 0.01,
        });
      }
    }
    switch (surface) {
      case 'grass': {
        const count = Math.round((1 + pace * 4) * density * intensity * 1.4);
        for (let i = 0; i < count; i++) {
          const ang = this.rand() * Math.PI * 2;
          this.vfx.emit({
            type: VfxType.Fleck,
            x: pos.x + Math.cos(ang) * 0.05,
            y: pos.y + 0.04,
            z: pos.z + Math.sin(ang) * 0.05,
            vx: Math.cos(ang) * 0.9 - sinF * pace * 1.2,
            vy: 1.2 + this.rand() * 1.4 * (0.5 + pace),
            vz: Math.sin(ang) * 0.9 - cosF * pace * 1.2,
            size: 0.035 + this.rand() * 0.025,
            life: 0.55 + this.rand() * 0.3,
            color: this.pick(colors),
            gravity: -9,
            drag: 1.5,
            spin: (this.rand() - 0.5) * 18,
            floor: pos.y,
          });
        }
        if (pace > 0.5) this.puff(pos, 10464888, 0.2, 0.35 * pace, 1);
        break;
      }
      case 'sand':
      case 'dirt':
      case 'path':
      case 'snow': {
        const count = Math.round((1 + pace * 2.5) * density);
        for (let i = 0; i < count; i++) {
          const ang = this.rand() * Math.PI * 2;
          const spd = 0.3 + this.rand() * 0.6;
          this.vfx.emit({
            type: VfxType.Puff,
            x: pos.x + Math.cos(ang) * 0.06,
            y: pos.y + 0.06,
            z: pos.z + Math.sin(ang) * 0.06,
            vx: Math.cos(ang) * spd - sinF * pace * 1.2,
            vy: 0.35 + this.rand() * 0.4,
            vz: Math.sin(ang) * spd - cosF * pace * 1.2,
            size: 0.16 + pace * 0.14,
            grow: 2.4,
            life: 0.7 + this.rand() * 0.4,
            color: this.pick(colors),
            alpha: 0.5 * intensity + 0.15,
            drag: 2.5,
          });
        }
        if (surface === 'sand' || surface === 'snow')
          for (let i = 0; i < Math.round(3 * density * pace); i++) {
            const ang = this.rand() * Math.PI * 2;
            this.vfx.emit({
              type: VfxType.Drop,
              x: pos.x,
              y: pos.y + 0.04,
              z: pos.z,
              vx: Math.cos(ang) * 0.8 - sinF * pace,
              vy: 1.4 + this.rand(),
              vz: Math.sin(ang) * 0.8 - cosF * pace,
              size: 0.025,
              life: 0.45,
              color: this.pick(colors),
              gravity: -12,
              floor: pos.y,
            });
          }
        break;
      }
      case 'ice':
        for (let i = 0; i < Math.round(3 * density); i++) this.iceSparkle(pos, 1);
        break;
      default:
        if (pace > 0.55) this.puff(pos, this.pick(colors), 0.14, 0.3, 1);
    }
  }
  puff(pos, color, size, alpha, count) {
    for (let i = 0; i < count; i++) {
      const ang = this.rand() * Math.PI * 2;
      this.vfx.emit({
        type: VfxType.Puff,
        x: pos.x,
        y: pos.y + 0.05,
        z: pos.z,
        vx: Math.cos(ang) * 0.4,
        vy: 0.3,
        vz: Math.sin(ang) * 0.4,
        size,
        grow: 2.2,
        life: 0.6,
        color,
        alpha,
        drag: 2,
      });
    }
  }
  iceSparkle(pos, power) {
    const ang = this.rand() * Math.PI * 2;
    this.vfx.emit({
      type: VfxType.Drop,
      x: pos.x,
      y: pos.y + 0.03,
      z: pos.z,
      vx: Math.cos(ang) * 1.5 * power,
      vy: 1 + this.rand() * 1.5,
      vz: Math.sin(ang) * 1.5 * power,
      size: 0.02 + this.rand() * 0.02,
      life: 0.4,
      color: 0xe8f8ff,
      gravity: -10,
      floor: pos.y,
    });
  }
  land(pos, state, impact) {
    const quality = this.ctx.settings.quality;
    const density = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
    const force = Math.min(1, Math.max(0, (impact - 3) / 14));
    if (force <= 0.02) return;
    if (state.waterDepth > 0.05) {
      this.splash(pos.x, this.ctx.water?.level ?? 0, pos.z, 0.8 + force * 1.2, true);
      return;
    }
    const colors = this.surfaceColors(state.surface, state.paintUnderfoot);
    const count = Math.round((6 + 12 * force) * density);
    const dustColor = state.surface === 'grass' ? 11909516 : this.pick(colors);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + this.rand() * 0.3;
      const spd = 1.2 + force * 2.8;
      this.vfx.emit({
        type: VfxType.Puff,
        x: pos.x + Math.cos(ang) * 0.15,
        y: pos.y + 0.06,
        z: pos.z + Math.sin(ang) * 0.15,
        vx: Math.cos(ang) * spd,
        vy: 0.2 + this.rand() * 0.4,
        vz: Math.sin(ang) * spd,
        size: 0.18 + 0.2 * force,
        grow: 2.2,
        life: 0.55 + 0.4 * force,
        color: dustColor,
        alpha: 0.35 + 0.35 * force,
        drag: 4,
      });
    }
    if (state.surface === 'grass' || state.paintUnderfoot)
      for (let i = 0; i < Math.round((4 + 10 * force) * density); i++) {
        const ang = this.rand() * Math.PI * 2;
        this.vfx.emit({
          type: state.paintUnderfoot ? VfxType.Drop : VfxType.Fleck,
          x: pos.x,
          y: pos.y + 0.05,
          z: pos.z,
          vx: Math.cos(ang) * (1 + 2 * force),
          vy: 2 + this.rand() * 3 * force,
          vz: Math.sin(ang) * (1 + 2 * force),
          size: 0.04,
          life: 0.8,
          color: this.pick(colors),
          gravity: -10,
          drag: 1,
          spin: 12,
          floor: pos.y,
        });
      }
    this.vfx.emit({
      type: VfxType.Ring,
      x: pos.x,
      y: pos.y + 0.03,
      z: pos.z,
      size: 0.4,
      grow: 3 + 3 * force,
      life: 0.35,
      color: 0xfff6e0,
      alpha: 0.35 * force,
    });
  }
  splash(x, y, z, strength, withRipple) {
    const quality = this.ctx.settings.quality;
    const density = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
    const count = Math.round((5 + 12 * strength) * density);
    for (let i = 0; i < count; i++) {
      const ang = this.rand() * Math.PI * 2;
      const spd = 0.6 + this.rand() * 1.6 * strength;
      this.vfx.emit({
        type: VfxType.Drop,
        x: x + Math.cos(ang) * 0.1,
        y: y + 0.02,
        z: z + Math.sin(ang) * 0.1,
        vx: Math.cos(ang) * spd,
        vy: 1.5 + this.rand() * 2.8 * strength,
        vz: Math.sin(ang) * spd,
        size: 0.03 + this.rand() * 0.035,
        life: 0.8,
        color: 0xeaf8ff,
        gravity: -13,
        floor: y - 0.05,
      });
    }
    this.vfx.emit({
      type: VfxType.Puff,
      x,
      y: y + 0.08,
      z,
      vy: 0.4,
      size: 0.3 * strength + 0.1,
      grow: 2,
      life: 0.5,
      color: 0xffffff,
      alpha: 0.45,
      drag: 2,
    });
    if (withRipple) this.ripple(x, y, z, 0.3 + 0.3 * strength, 0.8 + 0.4 * strength);
  }
  impact(pos, color, dirX, dirZ, power, killed, floorY, camPos) {
    const quality = this.ctx.settings.quality;
    const density = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
    _fxTmp.subVectors(camPos, pos).normalize().multiplyScalar(0.35);
    const x = pos.x + _fxTmp.x;
    const y = pos.y + _fxTmp.y;
    const z = pos.z + _fxTmp.z;
    const scale = killed ? 1.5 : 1;
    this.vfx.emit({
      type: VfxType.Star,
      x,
      y,
      z,
      size: (0.75 + 0.35 * power) * scale,
      grow: 1.6,
      life: killed ? 0.2 : 0.13,
      color,
      alpha: 1,
    });
    this.vfx.emit({
      type: VfxType.Shock,
      x,
      y,
      z,
      size: 0.25,
      grow: killed ? 9 : 6,
      life: killed ? 0.3 : 0.2,
      color,
      alpha: 0.9,
    });
    if (killed)
      this.vfx.emit({
        type: VfxType.Shock,
        x,
        y,
        z,
        size: 0.4,
        grow: 14,
        life: 0.45,
        color: 0xffffff,
        alpha: 0.7,
      });
    const count = Math.round((14 + 10 * power + (killed ? 22 : 0)) * density);
    for (let i = 0; i < count; i++) {
      const ang = this.rand() * Math.PI * 2;
      const spd = (1.5 + this.rand() * 5) * (0.7 + 0.3 * power);
      const fling = 2 + this.rand() * 5;
      this.vfx.emit({
        type: VfxType.Drop,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: Math.cos(ang) * spd * 0.6 + dirX * fling,
        vy: 1 + this.rand() * 5 * (0.6 + 0.4 * power),
        vz: Math.sin(ang) * spd * 0.6 + dirZ * fling,
        size: 0.035 + this.rand() * 0.05 * (killed ? 1.4 : 1),
        life: 0.7 + this.rand() * 0.4,
        color,
        gravity: -15,
        drag: 0.6,
        floor: floorY + 0.01,
      });
    }
    for (let i = 0; i < Math.round((3 + (killed ? 5 : 0)) * density); i++) {
      const ang = this.rand() * Math.PI * 2;
      this.vfx.emit({
        type: VfxType.Drop,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: Math.cos(ang) * 2 + dirX * 3,
        vy: 3 + this.rand() * 3,
        vz: Math.sin(ang) * 2 + dirZ * 3,
        size: 0.09 + this.rand() * 0.05,
        life: 1,
        color,
        gravity: -16,
        drag: 0.4,
        floor: floorY + 0.01,
      });
    }
    for (let i = 0; i < 3; i++)
      this.vfx.emit({
        type: VfxType.Puff,
        x: pos.x + (this.rand() - 0.5) * 0.3,
        y: pos.y + (this.rand() - 0.5) * 0.3,
        z: pos.z + (this.rand() - 0.5) * 0.3,
        vx: dirX * 1.5,
        vy: 0.4,
        vz: dirZ * 1.5,
        size: 0.3 + 0.15 * power,
        grow: 2.2,
        life: 0.45,
        color,
        alpha: 0.45,
        drag: 3,
      });
  }
  slam(pos, color, power) {
    const quality = this.ctx.settings.quality;
    const density = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
    const baseY = pos.y;
    this.vfx.emit({
      type: VfxType.Ring,
      x: pos.x,
      y: baseY + 0.05,
      z: pos.z,
      size: 0.5,
      grow: 5 + 3 * power,
      life: 0.35,
      color,
      alpha: 0.9,
    });
    this.vfx.emit({
      type: VfxType.Ring,
      x: pos.x,
      y: baseY + 0.04,
      z: pos.z,
      size: 0.4,
      grow: 8 + 4 * power,
      life: 0.5,
      color: 0xfff6e0,
      alpha: 0.45,
    });
    this.vfx.emit({
      type: VfxType.Star,
      x: pos.x,
      y: baseY + 0.25,
      z: pos.z,
      size: 0.9 + 0.4 * power,
      grow: 1.5,
      life: 0.12,
      color,
      alpha: 1,
    });
    const count = Math.round((18 + 14 * power) * density);
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + this.rand() * 0.4;
      const spd = 2 + this.rand() * 4 * power;
      this.vfx.emit({
        type: VfxType.Drop,
        x: pos.x,
        y: baseY + 0.08,
        z: pos.z,
        vx: Math.cos(ang) * spd,
        vy: 2.5 + this.rand() * 4.5 * power,
        vz: Math.sin(ang) * spd,
        size: 0.035 + this.rand() * 0.05,
        life: 0.9,
        color,
        gravity: -15,
        drag: 0.5,
        floor: baseY + 0.01,
      });
    }
    for (let i = 0; i < Math.round(10 * density); i++) {
      const ang = (i / 10) * Math.PI * 2 + this.rand() * 0.3;
      const spd = 1.5 + power * 2.5;
      this.vfx.emit({
        type: VfxType.Puff,
        x: pos.x + Math.cos(ang) * 0.25,
        y: baseY + 0.08,
        z: pos.z + Math.sin(ang) * 0.25,
        vx: Math.cos(ang) * spd,
        vy: 0.3 + this.rand() * 0.4,
        vz: Math.sin(ang) * spd,
        size: 0.28 + 0.15 * power,
        grow: 2.4,
        life: 0.6 + 0.3 * power,
        color: 0xd9cfb4,
        alpha: 0.5,
        drag: 4,
      });
    }
    for (let i = 0; i < Math.round(5 * density); i++) {
      const ang = this.rand() * Math.PI * 2;
      const dist = this.rand() * 1.2 * power;
      this.vfx.emit({
        type: VfxType.Splat,
        x: pos.x + Math.cos(ang) * dist,
        y: baseY + 0.015,
        z: pos.z + Math.sin(ang) * dist,
        size: 0.15 + this.rand() * 0.2,
        life: 1.8,
        color,
        alpha: 0.95,
      });
    }
  }
  charge(tip, color, amount, dt, chargeFull) {
    for (this.chargeT -= dt * (6 + 26 * amount); this.chargeT <= 0;) {
      this.chargeT += 1;
      const yaw = this.rand() * Math.PI * 2;
      const pitch = (this.rand() - 0.3) * 1.4;
      const radius = 0.45 + this.rand() * 0.35;
      const ox = Math.cos(yaw) * Math.cos(pitch) * radius;
      const oy = Math.sin(pitch) * radius;
      const oz = Math.sin(yaw) * Math.cos(pitch) * radius;
      const life = 0.22;
      this.vfx.emit({
        type: VfxType.Drop,
        x: tip.x + ox,
        y: tip.y + oy,
        z: tip.z + oz,
        vx: -ox / life,
        vy: -oy / life,
        vz: -oz / life,
        size: 0.025 + 0.02 * amount,
        life,
        color: this.rand() < 0.3 ? 16777215 : color,
        alpha: 1,
      });
    }
    if (chargeFull) {
      this.pulseT -= dt;
      if (this.pulseT <= 0) {
        this.pulseT = 0.32;
        this.vfx.emit({
          type: VfxType.Ring,
          x: this.feet.x,
          y: this.feet.y + 0.04,
          z: this.feet.z,
          size: 0.35,
          grow: 4.5,
          life: 0.38,
          color,
          alpha: 0.85,
        });
      }
    } else this.pulseT = 0;
    if (chargeFull && !this.chargeFull) {
      this.vfx.emit({
        type: VfxType.Star,
        x: tip.x,
        y: tip.y,
        z: tip.z,
        size: 0.9,
        grow: 1.8,
        life: 0.18,
        color,
        alpha: 1,
      });
      this.vfx.emit({
        type: VfxType.Shock,
        x: tip.x,
        y: tip.y,
        z: tip.z,
        size: 0.2,
        grow: 7,
        life: 0.25,
        color,
        alpha: 1,
      });
    }
    this.chargeFull = chargeFull;
  }
  chargeT = 0;
  chargeFull = false;
  pulseT = 0;
  feet = new Vector3();
  sparkle(pos, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const yaw = this.rand() * Math.PI * 2;
      const pitch = (this.rand() - 0.2) * 1.5;
      const spd = speed * (0.5 + this.rand());
      this.vfx.emit({
        type: VfxType.Drop,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: Math.cos(yaw) * Math.cos(pitch) * spd,
        vy: Math.sin(pitch) * spd,
        vz: Math.sin(yaw) * Math.cos(pitch) * spd,
        size: 0.03 + this.rand() * 0.03,
        life: 0.5,
        color,
        gravity: -6,
        drag: 2,
      });
    }
  }
  ripple(x, y, z, size, life) {
    this.vfx.emit({
      type: VfxType.Ring,
      x,
      y: y + 0.02,
      z,
      size,
      grow: 4.5,
      life,
      color: 0xf2fbff,
      alpha: 0.55,
    });
  }
  update(dt, state, tip, hands, feet, brushInHand, floorY) {
    if (dt <= 0) {
      this.vfx.update(0);
      return;
    }
    const elapsed = this.ctx.time.elapsed;
    const waterY = this.ctx.water?.level ?? 0;
    const inkColor = PALETTE[state.selectedColor]?.hex ?? 16777215;
    if (state.lastLandTime !== this.seenLand) {
      this.seenLand = state.lastLandTime;
      if (this.seenLand >= 0 && elapsed - state.lastLandTime < 0.25)
        this.land(_fxTmp.copy(state.position), state, state.lastLandImpact);
    }
    if (
      state.lastBounceTime !== this.seenBounce &&
      ((this.seenBounce = state.lastBounceTime), state.lastBounceTime >= 0 && elapsed - state.lastBounceTime < 0.25)
    ) {
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2;
        this.vfx.emit({
          type: VfxType.Drop,
          x: state.position.x,
          y: state.position.y + 0.05,
          z: state.position.z,
          vx: Math.cos(ang) * 2.5,
          vy: 2 + this.rand() * 2,
          vz: Math.sin(ang) * 2.5,
          size: 0.045,
          life: 0.7,
          color: PALETTE.yellow.hex,
          gravity: -12,
          floor: state.position.y,
        });
      }
      this.vfx.emit({
        type: VfxType.Ring,
        x: state.position.x,
        y: state.position.y + 0.04,
        z: state.position.z,
        size: 0.5,
        grow: 5,
        life: 0.45,
        color: PALETTE.yellow.hex,
        alpha: 0.7,
      });
    }
    if (state.mode !== this.lastMode) {
      if (state.mode === 'swim' && this.lastMode !== '' && this.lastMode !== 'swim')
        this.splash(
          state.position.x,
          waterY,
          state.position.z,
          Math.min(2, 0.8 + Math.max(0, -state.velocity.y) * 0.12),
          true,
        );
      this.lastMode = state.mode;
    }
    if (state.mode === 'swim') {
      this.rippleT -= dt;
      if (this.rippleT <= 0) {
        const moving = state.speed > 0.3;
        this.rippleT = moving ? 0.28 : 0.7;
        const ox = Math.sin(state.facing) * 0.25;
        const oz = Math.cos(state.facing) * 0.25;
        this.ripple(state.position.x + ox, waterY, state.position.z + oz, moving ? 0.5 : 0.4, moving ? 1.1 : 1.4);
      }
      for (let i = 0; i < 2; i++) {
        const below = hands[i].y < waterY + 0.02;
        if (below !== this.handBelow[i]) {
          this.handBelow[i] = below;
          if (state.speed > 0.2)
            this.splash(hands[i].x, waterY, hands[i].z, 0.25 + Math.min(0.5, state.speed * 0.1), false);
        }
      }
      if (state.speed > 1 && this.rand() < dt * 20) {
        const x = state.position.x - Math.sin(state.facing) * 0.3;
        const z = state.position.z - Math.cos(state.facing) * 0.3;
        this.vfx.emit({
          type: VfxType.Puff,
          x: x + (this.rand() - 0.5) * 0.3,
          y: waterY + 0.04,
          z: z + (this.rand() - 0.5) * 0.3,
          vy: 0.1,
          size: 0.14,
          grow: 2.2,
          life: 0.6,
          color: 0xffffff,
          alpha: 0.4,
          drag: 2,
        });
      }
    }
    if (state.mode === 'ground' && state.waterDepth > 0.05 && state.speed > 0.5) {
      this.rippleT -= dt;
      if (this.rippleT <= 0) {
        this.rippleT = 0.35;
        this.ripple(state.position.x, waterY, state.position.z, 0.4, 1);
      }
    }
    if (state.mode === 'slide' && state.speed > 1) {
      this.sprayT -= dt;
      const interval = 0.012 + 0.03 / Math.max(1, state.speed);
      for (; this.sprayT <= 0;) {
        this.sprayT += interval;
        const foot = feet[this.rand() < 0.5 ? 0 : 1];
        const side = this.rand() < 0.5 ? -1 : 1;
        const sx = Math.cos(state.facing) * side;
        const sz = -Math.sin(state.facing) * side;
        const backX = -Math.sin(state.facing);
        const backZ = -Math.cos(state.facing);
        const icy = state.surface === 'ice' || state.paintUnderfoot === 'blue';
        this.vfx.emit({
          type: this.rand() < 0.6 ? VfxType.Drop : VfxType.Puff,
          x: foot.x,
          y: floorY + 0.04,
          z: foot.z,
          vx: sx * (1 + this.rand() * 1.5) + backX * state.speed * 0.25,
          vy: 0.8 + this.rand() * 1.4,
          vz: sz * (1 + this.rand() * 1.5) + backZ * state.speed * 0.25,
          size: 0.03 + this.rand() * 0.04,
          grow: 1.6,
          life: 0.4,
          color: icy ? 15136767 : 14208436,
          alpha: 0.8,
          gravity: -9,
          drag: 1.5,
          floor: floorY,
        });
      }
    }
    this.dripT -= dt * (0.6 + brushInHand * 1.5 + Math.min(1, state.speed / 8));
    if (this.dripT <= 0) {
      this.dripT = 0.5 + this.rand() * 0.9;
      this.vfx.emit({
        type: VfxType.Drop,
        x: tip.x + (this.rand() - 0.5) * 0.03,
        y: tip.y - 0.02,
        z: tip.z + (this.rand() - 0.5) * 0.03,
        vx: state.velocity.x * 0.6,
        vy: Math.min(0, state.velocity.y) * 0.5 - 0.2,
        vz: state.velocity.z * 0.6,
        size: 0.03 + this.rand() * 0.015,
        life: 1.4,
        color: inkColor,
        gravity: -11,
        floor: state.mode === 'swim' ? waterY : floorY + 0.005,
      });
    }
    if (
      state.lastFlickTime !== this.seenFlick &&
      ((this.seenFlick = state.lastFlickTime), state.lastFlickTime >= 0 && elapsed - state.lastFlickTime < 0.2)
    ) {
      _fxTmp.subVectors(state.aimTarget, tip);
      if (_fxTmp.lengthSq() < 0.0001) _fxTmp.set(Math.sin(state.facing), 0.2, Math.cos(state.facing));
      _fxTmp.normalize();
      for (let i = 0; i < 12; i++) {
        const spd = 3 + this.rand() * 5;
        this.vfx.emit({
          type: VfxType.Drop,
          x: tip.x,
          y: tip.y,
          z: tip.z,
          vx: _fxTmp.x * spd + (this.rand() - 0.5) * 2,
          vy: _fxTmp.y * spd + this.rand() * 1.5,
          vz: _fxTmp.z * spd + (this.rand() - 0.5) * 2,
          size: 0.025 + this.rand() * 0.035,
          life: 0.7,
          color: inkColor,
          gravity: -14,
          drag: 0.8,
          floor: floorY,
        });
      }
    }
    this.vfx.update(dt);
  }
}
