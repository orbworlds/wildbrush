/**
 * Flight effects while riding the brush: drives the sky trail, speed lines and bristle flare, and emits the take-off burst, paint drips, boost spray, poured paint, water skimming and crash sparks.
 */
import { Color, Vector3 } from 'three';
import { COLORS, PALETTE } from '../core/config.js';
import { BristleFlare } from './bristle-flare.js';
import { SkyTrail } from './sky-trail.js';
import { SpeedLines } from './speed-lines.js';
import { VfxType } from './vfx.js';
export class FlightFx {
  ctx;
  trail;
  lines;
  flare;
  tip = new Vector3();
  belly = new Vector3();
  col = new Color();
  dripT = 0;
  sprayT = 0;
  skimT = 0;
  boost = 0;
  wasFlying = false;
  streamP = new Vector3();
  streamV = new Vector3();
  streamN = 0;
  lastStream = -9;
  pourT = 0;
  pour = 0;
  constructor(ctx) {
    this.ctx = ctx;
    this.trail = new SkyTrail(ctx);
    this.lines = new SpeedLines(ctx);
    this.flare = new BristleFlare(ctx);
    ctx.events.on('paint:throw', (data) => {
      const state = ctx.player.state;
      if (data?.origin && !data.remote && state.mode === 'fly' && !state.aiming) {
        this.streamP.copy(data.origin);
        this.streamV.copy(data.velocity);
        this.streamN++;
        this.lastStream = ctx.time.elapsed;
      }
    });
  }
  update(dt, state, brushMatrix, brushW, fx, floorY) {
    try {
      this.step(dt, state, brushMatrix, brushW, fx, floorY);
    } finally {
      if (dt > 0) this.prevVel.copy(state.velocity);
    }
  }
  step(dt, state, brushMatrix, brushW, fx, floorY) {
    const elapsed = this.ctx.time.elapsed;
    const flying = state.mode === 'fly';
    const camPos = this.ctx.camera.position;
    this.tip.set(0, 1.3, 0.04).applyMatrix4(brushMatrix);
    this.belly.set(0, 1.16, 0.02).applyMatrix4(brushMatrix);
    const speed = state.velocity.length();
    this.boost +=
      ((flying && state.sprinting ? 1 : 0) - this.boost) *
      (1 - Math.exp(-(state.sprinting ? 4 : 2.5) * Math.max(dt, 0)));
    const chroma = state.brush === 'chroma';
    const trail = this.trail;
    if (flying && brushW > 0.9) {
      if (!trail.active) trail.begin(elapsed);
      const speedK = flightSmoothstep(0.8, 5, speed);
      this.pour += (+(elapsed - this.lastStream < 0.4) - this.pour) * (1 - Math.exp(-6 * Math.max(dt, 0)));
      const width = (0.22 + 0.017 * Math.min(speed, 30) + 0.3 * this.boost) * speedK * (1 - 0.72 * this.pour);
      this.col.setHex(PALETTE[state.selectedColor]?.hex ?? 16777215);
      const minStep = Math.min(0.9, Math.max(0.22, speed * 0.03));
      if (dt > 0) trail.push(this.tip, width, this.boost, this.col, chroma, minStep, elapsed);
    } else if (trail.active) trail.end(elapsed);
    trail.update(elapsed);
    this.flare.update(
      Math.max(dt, 0),
      elapsed,
      flying ? brushW : 0,
      speed,
      this.boost,
      brushMatrix,
      PALETTE[state.selectedColor]?.hex ?? 16777215,
      chroma,
    );
    this.lines.update(
      Math.max(dt, 0.0001),
      flying ? this.boost * flightSmoothstep(12, 22, speed) : 0,
      state.velocity,
      camPos,
    );
    if (!fx || dt <= 0) {
      this.wasFlying = flying;
      return;
    }
    const quality = this.ctx.settings.quality;
    const density = quality === 'low' ? 0.5 : quality === 'medium' ? 0.75 : 1;
    const color = chroma
      ? PALETTE[COLORS[Math.floor(elapsed * 7) % 4]].hex
      : (PALETTE[state.selectedColor]?.hex ?? 16777215);
    const random = Math.random;
    if (flying && !this.wasFlying) {
      const heroPos = state.position;
      for (let i = 0; i < Math.round(16 * density); i++) {
        const angle = (i / 16) * Math.PI * 2 + random() * 0.3;
        fx.vfx.emit({
          type: VfxType.Drop,
          x: heroPos.x + Math.cos(angle) * 0.3,
          y: heroPos.y + 0.5,
          z: heroPos.z + Math.sin(angle) * 0.3,
          vx: Math.cos(angle) * 3 + state.velocity.x * 0.5,
          vy: 1 + random() * 2.5,
          vz: Math.sin(angle) * 3 + state.velocity.z * 0.5,
          size: 0.03 + random() * 0.03,
          life: 0.7,
          color,
          gravity: -9,
          drag: 1.5,
        });
      }
      fx.vfx.emit({
        type: VfxType.Ring,
        x: heroPos.x,
        y: Math.max(floorY, heroPos.y - 0.05) + 0.04,
        z: heroPos.z,
        size: 0.5,
        grow: 5,
        life: 0.45,
        color,
        alpha: 0.7,
      });
      fx.vfx.emit({
        type: VfxType.Puff,
        x: heroPos.x,
        y: heroPos.y + 0.3,
        z: heroPos.z,
        vy: 0.5,
        size: 0.5,
        grow: 2.2,
        life: 0.5,
        color: 0xffffff,
        alpha: 0.35,
        drag: 2,
      });
    }
    this.wasFlying = flying;
    if (!flying) return;
    for (this.dripT -= dt * (2.5 + speed * 0.35 + this.boost * 14) * density; this.dripT <= 0;) {
      this.dripT += 1;
      const big = random() < 0.25;
      fx.vfx.emit({
        type: VfxType.Drop,
        x: this.belly.x + (random() - 0.5) * 0.08,
        y: this.belly.y - 0.03,
        z: this.belly.z + (random() - 0.5) * 0.08,
        vx: state.velocity.x * 0.55 + (random() - 0.5) * 0.6,
        vy: Math.min(0, state.velocity.y) * 0.4 - 0.5 - random(),
        vz: state.velocity.z * 0.55 + (random() - 0.5) * 0.6,
        size: big ? 0.045 + random() * 0.02 : 0.022 + random() * 0.02,
        life: 1.6,
        color,
        gravity: -12,
        drag: 0.6,
        floor: floorY + 0.01,
      });
    }
    if (this.boost > 0.2)
      for (this.sprayT -= dt * 40 * this.boost * density; this.sprayT <= 0;) {
        this.sprayT += 1;
        const bx = -state.velocity.x / Math.max(speed, 1);
        const by = -state.velocity.y / Math.max(speed, 1);
        const bz = -state.velocity.z / Math.max(speed, 1);
        const kick = 3 + random() * 5;
        fx.vfx.emit({
          type: VfxType.Drop,
          x: this.tip.x,
          y: this.tip.y,
          z: this.tip.z,
          vx: state.velocity.x * 0.7 + bx * kick + (random() - 0.5) * 2.5,
          vy: state.velocity.y * 0.7 + by * kick + (random() - 0.3) * 2.5,
          vz: state.velocity.z * 0.7 + bz * kick + (random() - 0.5) * 2.5,
          size: 0.018 + random() * 0.03,
          life: 0.45 + random() * 0.3,
          color: random() < 0.15 ? 16777215 : color,
          gravity: -6,
          drag: 2.2,
          floor: floorY,
        });
      }
    if (this.pour > 0.3)
      for (this.pourT -= dt * 55 * this.pour * density; this.pourT <= 0;) {
        this.pourT += 1;
        fx.vfx.emit({
          type: VfxType.Drop,
          x: this.belly.x + (random() - 0.5) * 0.1,
          y: this.belly.y - 0.05,
          z: this.belly.z + (random() - 0.5) * 0.1,
          vx: state.velocity.x * 0.9 + (random() - 0.5) * 0.9,
          vy: Math.min(state.velocity.y, 1) * 0.5 - 3 - random() * 5,
          vz: state.velocity.z * 0.9 + (random() - 0.5) * 0.9,
          size: 0.035 + random() * 0.045,
          life: 1.6,
          color,
          gravity: -14,
          drag: 0.15,
          floor: floorY + 0.01,
        });
      }
    if (this.streamN > 0) {
      this.streamN = 0;
      const streamP = this.streamP;
      for (let i = 0; i < Math.round(6 * density); i++)
        fx.vfx.emit({
          type: VfxType.Drop,
          x: streamP.x,
          y: streamP.y,
          z: streamP.z,
          vx: this.streamV.x * (0.7 + random() * 0.3) + (random() - 0.5) * 1.6,
          vy: this.streamV.y * (0.6 + random() * 0.4),
          vz: this.streamV.z * (0.7 + random() * 0.3) + (random() - 0.5) * 1.6,
          size: 0.03 + random() * 0.04,
          life: 1.2,
          color,
          gravity: -14,
          drag: 0.3,
          floor: floorY + 0.01,
        });
      fx.vfx.emit({
        type: VfxType.Puff,
        x: streamP.x,
        y: streamP.y - 0.1,
        z: streamP.z,
        vx: this.streamV.x * 0.5,
        vy: -1,
        vz: this.streamV.z * 0.5,
        size: 0.18,
        grow: 2,
        life: 0.35,
        color,
        alpha: 0.5,
        drag: 3,
      });
    }
    const waterY = Number.isFinite(this.ctx.water?.level) ? this.ctx.water.level : 0;
    const aboveWater = state.position.y - waterY;
    if (state.waterDepth > 0.4 && aboveWater < 1.6 && speed > 5) {
      const skim = (1 - aboveWater / 1.6) * Math.min(1, speed / 16);
      for (this.skimT -= dt * 60 * skim * density; this.skimT <= 0;) {
        this.skimT += 1;
        const side = random() < 0.5 ? -1 : 1;
        const px = (-state.velocity.z / speed) * side;
        const pz = (state.velocity.x / speed) * side;
        fx.vfx.emit({
          type: VfxType.Drop,
          x: state.position.x + px * 0.2,
          y: waterY + 0.03,
          z: state.position.z + pz * 0.2,
          vx: px * (1.5 + random() * 2.5) + state.velocity.x * 0.25,
          vy: 1.5 + random() * 3 * skim,
          vz: pz * (1.5 + random() * 2.5) + state.velocity.z * 0.25,
          size: 0.03 + random() * 0.04,
          life: 0.8,
          color: 0xeaf8ff,
          gravity: -12,
          floor: waterY - 0.05,
        });
      }
      if (random() < dt * 14 * skim) fx.ripple(state.position.x, waterY, state.position.z, 0.5 + 0.4 * skim, 1.2);
    }
    if (
      Math.hypot(
        state.velocity.x - this.prevVel.x,
        state.velocity.y - this.prevVel.y,
        state.velocity.z - this.prevVel.z,
      ) > 8 &&
      this.ctx.time.elapsed - this.lastCrash > 0.4
    ) {
      this.lastCrash = this.ctx.time.elapsed;
      const heroPos = state.position;
      fx.vfx.emit({
        type: VfxType.Star,
        x: heroPos.x,
        y: heroPos.y + 0.9,
        z: heroPos.z,
        size: 1.1,
        grow: 1.6,
        life: 0.16,
        color,
        alpha: 1,
      });
      fx.vfx.emit({
        type: VfxType.Shock,
        x: heroPos.x,
        y: heroPos.y + 0.9,
        z: heroPos.z,
        size: 0.3,
        grow: 8,
        life: 0.3,
        color,
        alpha: 0.85,
      });
      fx.sparkle(this.tip, color, Math.round(22 * density), 5);
      fx.sparkle(this.tip, 16777215, Math.round(6 * density), 3);
    }
  }
  prevVel = new Vector3();
  lastCrash = -9;
}
function flightSmoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
