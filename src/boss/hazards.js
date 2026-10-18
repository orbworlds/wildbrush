/**
 * The fight's gameplay hazards: expanding shockwave rings to jump over, lobbed ink globs, fire lines, ice and thorn spikes and the creeping edge ink. Each spawns its effects, damages the hero on contact and reports how soon the next threat lands.
 */
import { Color, Vector3 } from 'three';
import { PALETTE } from '../core/config.js';
import { INK_COLOR } from './fx.js';
import { clamp, rand, TAU } from './math.js';
const _fxPos = new Vector3();
const _pushDir = new Vector3();
const _hazardTint = new Color();
new Color(1, 1, 1);
const SHOCK_COLOR = new Color(0xb9ad95);
const GLOB_COLOR = new Color(0x24222b);
const FIRE_COLOR = new Color(1, 0.55, 0.18);
const FIRE_HOT_COLOR = new Color(1, 0.68, 0.3);
const SMOKE_COLOR = new Color(0x3a3538);
const FROST_COLOR = new Color(0x9fdcff);
const THORN_COLOR = new Color(0x3f7a2c);
const SCORCH_COLOR = new Color(0xff5a1e);
export class Hazards {
  ctx;
  fx;
  center;
  floorY;
  shocks = [];
  globs = [];
  fires = [];
  spikes = [];
  time = 0;
  edgeFront = 99;
  edgeOn = false;
  edgeTick = 0;
  dmgMul = 1;
  onPlayerHit = null;
  constructor(ctx, fx, center, floorY) {
    this.ctx = ctx;
    this.fx = fx;
    this.center = center;
    this.floorY = floorY;
  }
  clear() {
    this.shocks.length = 0;
    this.globs.length = 0;
    this.fires.length = 0;
    this.spikes.length = 0;
    this.edgeOn = false;
    this.edgeFront = 99;
  }
  fizzle() {
    let count = 0;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fire = this.fires[i];
      if (!(fire.t >= 0)) {
        this.fx.smoke(
          _fxPos.set(fire.ox + fire.dx * 1.5, this.floorY + 0.3, fire.oz + fire.dz * 1.5),
          3,
          SMOKE_COLOR,
          0.55,
          0.4,
        );
        this.fires.splice(i, 1);
        count++;
      }
    }
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const spike = this.spikes[i];
      if (!(spike.done || this.time >= spike.at)) {
        this.fx.smoke(
          _fxPos.set(spike.x, this.floorY + 0.2, spike.z),
          2,
          spike.kind === 0 ? FROST_COLOR : THORN_COLOR,
          0.45,
          0.35,
        );
        this.spikes.splice(i, 1);
        count++;
      }
    }
    return count;
  }
  get busy() {
    return this.shocks.length + this.globs.length + this.fires.length + this.spikes.length > 0;
  }
  shock(x, z, speed, maxR, dmg, color = SHOCK_COLOR, height = 0.75, r0 = 0.6) {
    this.shocks.push({
      x,
      z,
      r: r0,
      speed,
      maxR,
      height,
      dmg,
      hit: false,
      color: color.clone(),
      age: 0,
      dust: 0,
    });
    const life = (maxR - r0) / speed;
    this.fx.waves.spawn(this.fx.now, x, this.floorY, z, r0, maxR, life, height * 1.45, color, 2.1);
  }
  glob(from, to, flight, dmg, radius = 1.9) {
    const tLand = Math.max(0.35, flight);
    const v0 = new Vector3(
      (to.x - from.x) / tLand,
      (to.y - from.y + 15 * tLand * tLand) / tLand,
      (to.z - from.z) / tLand,
    );
    this.globs.push({
      p0: from.clone(),
      v0,
      g: 30,
      t: 0,
      tLand,
      land: to.clone(),
      radius,
      dmg,
    });
    this.fx.drops.spawn(
      this.fx.now,
      from.x,
      from.y,
      from.z,
      v0.x,
      v0.y,
      v0.z,
      0.55,
      tLand + 0.05,
      to.y - 0.4,
      GLOB_COLOR,
      0.05,
      30,
      0.001,
    );
    for (let i = 0; i < 3; i++) {
      const delay = 0.06 + i * 0.05;
      this.fx.drops.spawn(
        this.fx.now + delay,
        from.x,
        from.y,
        from.z,
        v0.x,
        v0.y,
        v0.z,
        0.24 - i * 0.05,
        tLand + 0.05,
        to.y - 0.4,
        GLOB_COLOR,
        0.05,
        30,
        0.001,
      );
    }
    this.fx.marker(_fxPos.set(to.x, this.floorY + 0.02, to.z), radius, tLand, _hazardTint.set(10325247), 2.6);
  }
  fireLine(ox, oz, dx, dz, speed, len, delay, dmg) {
    const norm = Math.hypot(dx, dz) || 1;
    this.fires.push({
      ox,
      oz,
      dx: dx / norm,
      dz: dz / norm,
      speed,
      len,
      t: -delay,
      delay,
      trail: 1.7,
      width: 1.15,
      dmg,
      lastPuff: 0,
      lastHit: -9,
      scorch: 1,
    });
    const marks = Math.floor(len / 1.4);
    for (let i = 1; i <= marks; i++) {
      const d = i * 1.4;
      const mx = ox + (dx / norm) * d;
      const mz = oz + (dz / norm) * d;
      this.fx.decals.spawn(
        this.fx.now,
        mx,
        this.floorY,
        mz,
        0.55,
        0.55,
        delay + d / speed + 0.1,
        1,
        FIRE_COLOR,
        1.6,
        0,
        0,
        delay + d / speed,
      );
    }
  }
  spike(x, z, delay, kind, dmg, radius = 1.15, height = 2.6) {
    this.spikes.push({
      x,
      z,
      at: this.time + delay,
      kind,
      radius,
      height,
      dmg,
      warned: false,
      done: false,
      life: kind === 0 ? 2.8 : 2.2,
    });
    const tint = kind === 0 ? FROST_COLOR : THORN_COLOR;
    this.fx.marker(_fxPos.set(x, this.floorY + 0.02, z), radius * 1.1, delay, tint, 2.2);
  }
  update(dt) {
    if (dt <= 0) return;
    this.time += dt;
    const state = this.ctx.player?.state;
    if (!state) return;
    const position = state.position;
    const above = position.y - this.floorY;
    const px = position.x;
    const pz = position.z;
    const alive = !state.dead;
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const shock = this.shocks[i];
      const prevR = shock.r;
      shock.r += shock.speed * dt;
      shock.age += dt;
      if (alive && !shock.hit && shock.dmg > 0) {
        const dist = Math.hypot(px - shock.x, pz - shock.z);
        const pad = 0.55;
        if (dist >= prevR - pad && dist <= shock.r + pad && above < shock.height * 0.62) {
          shock.hit = true;
          this.hurt(shock.dmg, _pushDir.set(px - shock.x, 0, pz - shock.z), 9, 'shockwave');
        }
      }
      shock.dust += dt;
      if (shock.dust > 0.06 && shock.r < shock.maxR) {
        shock.dust = 0;
        const count = Math.min(10, Math.round(shock.r * 0.6));
        for (let j = 0; j < count; j++) {
          const ang = Math.random() * TAU;
          const x = shock.x + Math.cos(ang) * shock.r;
          const z = shock.z + Math.sin(ang) * shock.r;
          this.fx.puffs.spawn(
            this.fx.now,
            x,
            this.floorY + 0.2,
            z,
            Math.cos(ang) * 2,
            rand(0.5, 1.6),
            Math.sin(ang) * 2,
            0.3,
            rand(0.8, 1.3),
            rand(0.5, 0.8),
            SHOCK_COLOR,
            0.35,
            0.3,
            3,
          );
        }
      }
      if (shock.r >= shock.maxR) this.shocks.splice(i, 1);
    }
    for (let i = this.globs.length - 1; i >= 0; i--) {
      const glob = this.globs[i];
      glob.t += dt;
      if (glob.t >= glob.tLand) {
        this.globs.splice(i, 1);
        this.splashGlob(glob, alive, px, pz, above);
      }
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fire = this.fires[i];
      fire.t += dt;
      if (fire.t < 0) continue;
      const head = Math.min(fire.len, fire.t * fire.speed);
      const tail = Math.max(0, head - fire.speed * fire.trail);
      const lifetime = fire.len / fire.speed + fire.trail;
      fire.lastPuff += dt;
      if (fire.lastPuff > 0.03) {
        fire.lastPuff = 0;
        const span = Math.max(0.1, head - tail);
        const count = 4 + Math.round(span * 0.35);
        for (let j = 0; j < count; j++) {
          const d = tail + Math.random() * span;
          const x = fire.ox + fire.dx * d + rand(-0.45, 0.45);
          const z = fire.oz + fire.dz * d + rand(-0.45, 0.45);
          const atHead = d > head - 2;
          const size = rand(0.55, 1) * (atHead ? 1.35 : 1);
          this.fx.glows.spawn(
            this.fx.now,
            x,
            this.floorY + 0.35,
            z,
            rand(-0.4, 0.4),
            rand(3.5, 6.5),
            rand(-0.4, 0.4),
            size,
            rand(0.3, 0.55),
            atHead ? FIRE_HOT_COLOR : FIRE_COLOR,
            atHead ? 2.3 : 1.7,
            -2,
            1.4,
            2.4,
          );
        }
        if (head < fire.len) {
          const x = fire.ox + fire.dx * head;
          const z = fire.oz + fire.dz * head;
          this.fx.glows.spawn(
            this.fx.now,
            x,
            this.floorY + 0.8,
            z,
            fire.dx * 4,
            rand(2, 4),
            fire.dz * 4,
            rand(1.4, 2),
            0.25,
            FIRE_HOT_COLOR,
            2.6,
            0,
            3,
            1,
          );
          this.fx.glows.spawn(
            this.fx.now,
            x,
            this.floorY + 0.4,
            z,
            rand(-3, 3),
            rand(3, 7),
            rand(-3, 3),
            0.1,
            rand(0.5, 0.9),
            FIRE_COLOR,
            4,
            6,
            1,
            1.5,
          );
        }
        if (Math.random() < 0.6) {
          const d = tail + Math.random() * span;
          this.fx.puffs.spawn(
            this.fx.now,
            fire.ox + fire.dx * d,
            this.floorY + 1.6,
            fire.oz + fire.dz * d,
            0,
            rand(1.5, 2.5),
            0,
            0.5,
            rand(1.4, 2.2),
            rand(0.9, 1.4),
            SMOKE_COLOR,
            0.4,
            0.9,
            2,
          );
        }
      }
      const step = 1.3;
      for (; fire.scorch * step < head;) {
        const d = fire.scorch * step;
        fire.scorch++;
        this.fx.decals.spawn(
          this.fx.now,
          fire.ox + fire.dx * d,
          this.floorY,
          fire.oz + fire.dz * d,
          0.5,
          1.15,
          fire.trail + 1.6,
          3,
          SCORCH_COLOR,
          0.9,
        );
      }
      if (alive && above < 2.2 && this.time - fire.lastHit > 0.8) {
        const rx = px - fire.ox;
        const rz = pz - fire.oz;
        const along = rx * fire.dx + rz * fire.dz;
        const across = Math.abs(rx * fire.dz - rz * fire.dx);
        if (along >= tail - 0.4 && along <= head + 0.5 && across < fire.width) {
          fire.lastHit = this.time;
          this.hurt(
            fire.dmg,
            _pushDir.set(
              fire.dz * Math.sign(rx * fire.dz - rz * fire.dx || 1),
              0,
              -fire.dx * Math.sign(rx * fire.dz - rz * fire.dx || 1),
            ),
            8,
            'fire',
          );
        }
      }
      if (fire.t > lifetime) this.fires.splice(i, 1);
    }
    for (let i = this.spikes.length - 1; i >= 0; i--) {
      const spike = this.spikes[i];
      if (!spike.done && this.time >= spike.at) {
        spike.done = true;
        this.erupt(spike);
        if (alive && Math.hypot(px - spike.x, pz - spike.z) < spike.radius + 0.35 && above < spike.height * 0.8)
          this.hurt(spike.dmg, _pushDir.set(px - spike.x, 0, pz - spike.z), 10, spike.kind === 0 ? 'ice' : 'thorns');
      }
      if (spike.done && this.time > spike.at + 0.3) this.spikes.splice(i, 1);
    }
    if (this.edgeOn && alive) {
      this.edgeTick -= dt;
      if (
        Math.hypot(px - this.center.x, pz - this.center.z) > this.edgeFront - 0.2 &&
        above < 1.2 &&
        this.edgeTick <= 0
      ) {
        this.edgeTick = 1;
        this.hurt(0.5, _pushDir.set(this.center.x - px, 0, this.center.z - pz), 7, 'ink');
      }
    }
  }
  splashGlob(glob, alive, px, pz, above) {
    const land = glob.land;
    const fx = this.fx;
    fx.inkSplash(_fxPos.set(land.x, this.floorY + 0.2, land.z), null, 16, 6, 0.14, INK_COLOR);
    fx.puddle(_fxPos, glob.radius * 1.1, 5, INK_COLOR, 0.92);
    fx.decals.spawn(
      fx.now,
      land.x,
      this.floorY,
      land.z,
      0.3,
      glob.radius * 1.5,
      0.45,
      0,
      _hazardTint.set(7168680),
      1.6,
    );
    for (let i = 0; i < 6; i++) {
      const ang = Math.random() * TAU;
      fx.puffs.spawn(
        fx.now,
        land.x,
        this.floorY + 0.3,
        land.z,
        Math.cos(ang) * 3,
        rand(0.5, 1.5),
        Math.sin(ang) * 3,
        0.4,
        rand(1, 1.6),
        rand(0.6, 0.9),
        SMOKE_COLOR,
        0.4,
        0.3,
        3,
      );
    }
    if (alive && Math.hypot(px - land.x, pz - land.z) < glob.radius + 0.3 && above < 2)
      this.hurt(glob.dmg, _pushDir.set(px - land.x, 0, pz - land.z), 6, 'ink');
  }
  erupt(spike) {
    const fx = this.fx;
    const count = spike.kind === 0 ? 5 : 6;
    const tint = spike.kind === 0 ? FROST_COLOR : THORN_COLOR;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * TAU + Math.random();
      const dist = i === 0 ? 0 : spike.radius * rand(0.35, 0.8);
      const h = spike.height * (i === 0 ? 1 : rand(0.45, 0.8));
      const tilt = i === 0 ? 0 : 0.35;
      fx.spikes.spawn(
        fx.now,
        spike.x + Math.cos(ang) * dist,
        this.floorY - 0.1,
        spike.z + Math.sin(ang) * dist,
        h,
        spike.kind === 0 ? rand(0.3, 0.45) : rand(0.22, 0.34),
        spike.life,
        spike.kind,
        tint,
        0.1,
        Math.cos(ang) * tilt,
        Math.sin(ang) * tilt,
      );
    }
    if (spike.kind === 0) {
      fx.sparks(_fxPos.set(spike.x, this.floorY + 0.6, spike.z), FROST_COLOR, 10, 5, 2.6, 0.09, 6);
      fx.puffs.spawn(
        fx.now,
        spike.x,
        this.floorY + 0.4,
        spike.z,
        0,
        0.6,
        0,
        0.6,
        1.8,
        0.9,
        _hazardTint.set(15136511),
        0.5,
        0.4,
        2,
      );
      for (let i = 0; i < 6; i++)
        fx.shards.spawn(
          fx.now,
          spike.x,
          this.floorY + 0.4,
          spike.z,
          rand(-4, 4),
          rand(3, 7),
          rand(-4, 4),
          rand(0.06, 0.14),
          rand(0.8, 1.3),
          this.floorY,
          FROST_COLOR,
          0,
          rand(6, 14),
        );
    } else {
      fx.inkSplash(_fxPos.set(spike.x, this.floorY + 0.2, spike.z), null, 8, 4, 0.07, _hazardTint.set(5192232));
      fx.sparks(_fxPos.set(spike.x, this.floorY + 0.8, spike.z), _hazardTint.set(8120426), 10, 4, 2.4, 0.09, -1);
      fx.dust(_fxPos.set(spike.x, this.floorY, spike.z), 4, 1, 0.5);
    }
  }
  hurt(amount, push, knockback, kind) {
    if (!(amount > 0)) return;
    const dir = push.clone().setY(0);
    if (dir.lengthSq() < 0.000001) dir.set(0, 0, 1);
    dir.normalize();
    let hit = false;
    try {
      hit = !!this.ctx.player.damage({
        amount: amount * this.dmgMul,
        direction: dir,
        knockback,
        source: `greymaw-${kind}`,
      });
    } catch {
      hit = false;
    }
    if (hit) this.onPlayerHit?.(kind);
  }
  threatEta() {
    const state = this.ctx.player?.state;
    if (!state) return Infinity;
    const position = state.position;
    let eta = Infinity;
    for (const shock of this.shocks) {
      if (shock.hit || shock.dmg <= 0) continue;
      const dist = Math.hypot(position.x - shock.x, position.z - shock.z);
      if (dist >= shock.r - 0.5 && dist <= shock.maxR) eta = Math.min(eta, Math.max(0, (dist - shock.r) / shock.speed));
    }
    for (const glob of this.globs)
      if (Math.hypot(position.x - glob.land.x, position.z - glob.land.z) < glob.radius + 0.6)
        eta = Math.min(eta, glob.tLand - glob.t);
    for (const spike of this.spikes)
      if (!spike.done && Math.hypot(position.x - spike.x, position.z - spike.z) < spike.radius + 0.6)
        eta = Math.min(eta, spike.at - this.time);
    for (const fire of this.fires) {
      const rx = position.x - fire.ox;
      const rz = position.z - fire.oz;
      const along = rx * fire.dx + rz * fire.dz;
      if (Math.abs(rx * fire.dz - rz * fire.dx) < fire.width + 0.4 && along > 0 && along < fire.len) {
        const arrive = along / fire.speed - fire.t;
        if (arrive >= 0) eta = Math.min(eta, arrive);
      }
    }
    return eta;
  }
  static linear(color, out) {
    return out.set(PALETTE[color].hex);
  }
  static clampToArena(pos, center, maxR, minR = 0) {
    const dx = pos.x - center.x;
    const dz = pos.z - center.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.0001) return pos.set(center.x + minR, pos.y, center.z);
    const r = clamp(dist, minR, maxR);
    return pos.set(center.x + (dx / dist) * r, pos.y, center.z + (dz / dist) * r);
  }
}
