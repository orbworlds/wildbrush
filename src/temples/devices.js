/**
 * Temple devices: the Small Key pickup, ink fonts that refill paint, the hot-air vent that lifts the hero, pressure plates and portals.
 */
import { Color, CylinderGeometry, Mesh, OctahedronGeometry, PlaneGeometry, TorusGeometry, Vector3 } from 'three';
import { PALETTE } from '../core/config.js';
import { damp } from '../core/math.js';
import { ParticleMode } from '../shared/particles.js';
import { lathe, mergeGeometries, randRange, TAU } from '../shared/util.js';
import { _delta, addCollider, mergeMesh, objBox, objGeo, sfx } from './props.js';
import { KIND } from './stone-material.js';
export function keyGeometry(metal, glow) {
  const parts = [];
  const bow = new TorusGeometry(0.2, 0.06, 8, 18);
  parts.push(
    objGeo(bow, 0, 0.42, 0, metal, {
      kind: KIND.metal,
    }),
  );
  parts.push(
    objGeo(new OctahedronGeometry(0.09, 0), 0, 0.42, 0, glow, {
      kind: KIND.glass,
      glow: [0, 2],
    }),
  );
  parts.push(
    objGeo(new CylinderGeometry(0.05, 0.05, 0.62, 8), 0, 0, 0, metal, {
      kind: KIND.metal,
    }),
  );
  parts.push(
    objBox(0.1, -0.22, 0, 0.16, 0.07, 0.07, metal, {
      kind: KIND.metal,
    }),
  );
  parts.push(
    objBox(0.08, -0.08, 0, 0.12, 0.06, 0.07, metal, {
      kind: KIND.metal,
    }),
  );
  return mergeGeometries(parts);
}
export class KeyPickup {
  ctx;
  pos;
  particles;
  glow;
  mesh;
  active = false;
  t = 0;
  onCollect = null;
  constructor(ctx, pos, material, root, particles, glow) {
    this.ctx = ctx;
    this.pos = pos;
    this.particles = particles;
    this.glow = glow;
    this.mesh = new Mesh(keyGeometry(15251018, glow.getHex()), material);
    this.mesh.name = 'temple-key';
    this.mesh.scale.setScalar(1.4);
    this.mesh.visible = false;
    this.mesh.position.copy(pos);
    root.add(this.mesh);
  }
  show() {
    this.active = true;
    this.mesh.visible = true;
    this.t = 0;
  }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    this.mesh.position.set(this.pos.x, this.pos.y + 0.25 + Math.sin(this.t * 2.2) * 0.12, this.pos.z);
    this.mesh.rotation.y += dt * 2.2;
    const particles = this.particles;
    if (particles && Math.random() < dt * 14) {
      const ang = Math.random() * TAU;
      particles.spawn({
        x: this.pos.x + Math.cos(ang) * 0.5,
        y: this.pos.y + Math.random() * 0.8,
        z: this.pos.z + Math.sin(ang) * 0.5,
        vy: 0.8,
        color: Math.random() < 0.5 ? this.glow : new Color(1, 0.85, 0.5),
        size: 0.07,
        life: 0.9,
        bright: 2.5,
      });
    }
    const state = this.ctx.player?.state;
    if (!state || this.t < 0.6) return;
    const dx = state.position.x - this.pos.x;
    const dz = state.position.z - this.pos.z;
    const dy = state.position.y + 0.9 - this.pos.y;
    if (dx * dx + dz * dz < 2.25 && Math.abs(dy) < 1.8) {
      this.active = false;
      this.mesh.visible = false;
      if (particles)
        for (let i = 0; i < 40; i++) {
          const ang = Math.random() * TAU;
          const speed = randRange(Math.random, 1, 4);
          particles.spawn({
            x: this.pos.x,
            y: this.pos.y + 0.3,
            z: this.pos.z,
            vx: Math.cos(ang) * speed,
            vy: randRange(Math.random, 1, 4),
            vz: Math.sin(ang) * speed,
            color: i % 2 ? this.glow : new Color(1, 0.85, 0.5),
            size: 0.1,
            life: 0.8,
            drag: 2,
            bright: 2.5,
          });
        }
      this.onCollect?.();
    }
  }
}
export class InkFont {
  ctx;
  pos;
  color;
  particles;
  cd = 0;
  constructor(ctx, pos, color, particles) {
    this.ctx = ctx;
    this.pos = pos;
    this.color = color;
    this.particles = particles;
  }
  update(dt) {
    this.cd = Math.max(0, this.cd - dt);
    const particles = this.particles;
    const color = new Color(PALETTE[this.color].hex);
    if (particles && Math.random() < dt * 6) {
      const ang = Math.random() * TAU;
      particles.spawn({
        x: this.pos.x + Math.cos(ang) * 0.4,
        y: this.pos.y + 0.1,
        z: this.pos.z + Math.sin(ang) * 0.4,
        vy: randRange(Math.random, 0.6, 1.4),
        color,
        size: 0.09,
        life: 1.2,
        mode: ParticleMode.Rise,
        drag: 0.5,
        bright: 2.2,
      });
    }
    if (this.cd > 0) return;
    const state = this.ctx.player?.state;
    if (!state) return;
    const dx = state.position.x - this.pos.x;
    const dz = state.position.z - this.pos.z;
    if (!(dx * dx + dz * dz > 3.61 || Math.abs(state.position.y - (this.pos.y - 1)) > 2.2))
      try {
        const paint = this.ctx.paint;
        const inkMax = paint.inkMax ?? 100;
        if ((paint.ink?.[this.color] ?? 0) >= inkMax - 0.5) return;
        paint.addInk(this.color, inkMax);
        this.ctx.events.emit('content:ink-refill', {
          color: this.color,
          amount: inkMax,
          position: this.pos.clone(),
        });
        sfx(this.ctx, 'ink-refill', this.pos, 1);
        this.cd = 1.5;
        if (particles)
          for (let i = 0; i < 26; i++)
            particles.spawn({
              x: this.pos.x,
              y: this.pos.y + 0.2,
              z: this.pos.z,
              vx: (Math.random() - 0.5) * 2,
              vy: randRange(Math.random, 1, 3),
              vz: (Math.random() - 0.5) * 2,
              color,
              size: 0.12,
              life: 0.8,
              mode: ParticleMode.Homing,
              target: state.position,
              delay: 0.25,
              bright: 2.4,
            });
      } catch {}
  }
}
export class HeatVent {
  ctx;
  base;
  radius;
  top;
  particles;
  active = false;
  level = 0;
  constructor(ctx, base, radius, topY, particles) {
    this.ctx = ctx;
    this.base = base;
    this.radius = radius;
    this.top = topY;
    this.particles = particles;
  }
  hits(p, reach) {
    const dx = p.x - this.base.x;
    const dz = p.z - this.base.z;
    return (
      dx * dx + dz * dz < (this.radius + reach) * (this.radius + reach) && Math.abs(p.y - this.base.y) < 1.5 + reach
    );
  }
  update(dt) {
    this.level += (+!!this.active - this.level) * damp(2.5, dt);
    if (this.level < 0.05) return;
    const particles = this.particles;
    if (particles) {
      const rate = dt * 40 * this.level;
      let count = Math.floor(rate) + +(Math.random() < rate % 1);
      for (; count-- > 0;) {
        const ang = Math.random() * TAU;
        const rad = Math.sqrt(Math.random()) * this.radius * 0.9;
        const spark = Math.random() < 0.55;
        particles.spawn({
          x: this.base.x + Math.cos(ang) * rad,
          y: this.base.y + 0.2,
          z: this.base.z + Math.sin(ang) * rad,
          vx: 0,
          vy: spark ? randRange(Math.random, 6, 11) : randRange(Math.random, 3, 5),
          vz: 0,
          mode: ParticleMode.Rise,
          drag: 0.15,
          color: spark ? new Color(1, 0.72, 0.3) : new Color(1, 0.4, 0.12),
          size: spark ? 0.06 : 0.35,
          life: spark ? 1.6 : 0.6,
          bright: spark ? 3 : 1.4,
        });
      }
    }
    const state = this.ctx.player?.state;
    if (!state || !this.active) return;
    const position = state.position;
    const dx = position.x - this.base.x;
    const dz = position.z - this.base.z;
    const dist = Math.hypot(dx, dz);
    if (
      dist > this.radius + 0.4 ||
      position.y < this.base.y - 0.5 ||
      position.y > this.top + 1.5 ||
      (state.mode !== 'air' && state.mode !== 'glide')
    )
      return;
    const radial = 1 - Math.max(0, (dist - this.radius * 0.6) / (this.radius * 0.4 + 0.4));
    const vertical = Math.max(0, Math.min(1, (this.top + 1.5 - position.y) / 3));
    const strength = radial * vertical * this.level;
    const velocity = state.velocity;
    velocity.y =
      state.mode === 'glide'
        ? Math.min(velocity.y + 30 * strength * dt, 8)
        : Math.min(velocity.y + 59.04 * strength * dt, 9.5 * Math.max(0.3, vertical));
    const pull = this.level * Math.max(0, Math.min(1, (this.top - 2.2 - position.y) / 2));
    if (pull > 0) {
      const blend = Math.min(1, dt * 6 * pull);
      velocity.x += (-dx * 2.2 - velocity.x) * blend;
      velocity.z += (-dz * 2.2 - velocity.z) * blend;
    }
  }
}
export class PressurePlate {
  ctx;
  pos;
  radius;
  pressed = false;
  mesh;
  depth = 0;
  constructor(ctx, pos, radius, material, root, colors, ch) {
    this.ctx = ctx;
    this.pos = pos;
    this.radius = radius;
    const parts = [];
    const slab = lathe(
      [
        [0.02, 0.16],
        [radius - 0.05, 0.16],
        [radius, 0.1],
        [radius, 0],
      ],
      24,
    );
    parts.push(
      objGeo(slab, 0, 0, 0, colors.stone, {
        kind: KIND.smooth,
      }),
    );
    const ring = new TorusGeometry(radius * 0.72, 0.06, 6, 30);
    ring.rotateX(Math.PI / 2);
    parts.push(
      objGeo(ring, 0, 0.17, 0, colors.glass, {
        kind: KIND.glass,
        glow: [ch, 1.3],
      }),
    );
    const inlay = new CylinderGeometry(radius * 0.3, radius * 0.3, 0.04, 6);
    parts.push(
      objGeo(inlay, 0, 0.17, 0, colors.glass, {
        kind: KIND.glass,
        glow: [ch, 1],
      }),
    );
    this.mesh = mergeMesh(parts, material, 'temple-plate');
    this.mesh.position.copy(pos);
    root.add(this.mesh);
    addCollider(
      ctx,
      ctx.RAPIER.ColliderDesc.cylinder(0.08, radius).setTranslation(pos.x, pos.y + 0.08, pos.z),
      'stone',
      this.mesh,
      'plate',
    );
  }
  update(dt) {
    const state = this.ctx.player?.state;
    let onPlate = false;
    if (state && !state.dead) {
      const dx = state.position.x - this.pos.x;
      const dz = state.position.z - this.pos.z;
      onPlate =
        dx * dx + dz * dz < (this.radius + 0.15) * (this.radius + 0.15) &&
        Math.abs(state.position.y - (this.pos.y + 0.16)) < 0.45;
    }
    const wasPressed = this.pressed;
    this.pressed = onPlate;
    this.depth += ((onPlate ? 0.1 : 0) - this.depth) * damp(14, dt);
    this.mesh.position.y = this.pos.y - this.depth;
    if (onPlate && !wasPressed) sfx(this.ctx, 'ui-click', this.pos, 1, 0.6);
    return onPlate && !wasPressed;
  }
}
export class Portal {
  ctx;
  pos;
  facing;
  width;
  height;
  go;
  mesh;
  enabled = true;
  armed = false;
  fwd;
  constructor(ctx, pos, facing, width, height, material, root, go) {
    this.ctx = ctx;
    this.pos = pos;
    this.facing = facing;
    this.width = width;
    this.height = height;
    this.go = go;
    const geometry = new PlaneGeometry(width, height);
    geometry.translate(0, height / 2, 0);
    this.mesh = new Mesh(geometry, material);
    this.mesh.position.copy(pos);
    this.mesh.rotation.y = facing;
    this.mesh.renderOrder = 7;
    this.mesh.name = 'temple-portal';
    root.add(this.mesh);
    this.fwd = new Vector3(Math.sin(facing), 0, Math.cos(facing));
  }
  front(p) {
    _delta.copy(p).sub(this.pos);
    return {
      f: _delta.x * this.fwd.x + _delta.z * this.fwd.z,
      s: _delta.x * this.fwd.z - _delta.z * this.fwd.x,
    };
  }
  update() {
    this.mesh.visible = this.enabled;
    if (!this.enabled) return;
    const state = this.ctx.player?.state;
    if (!state || state.dead) return;
    const { f, s } = this.front(state.position);
    if (!(Math.abs(s) < this.width / 2 && f < 0.7 && f > -1.5 && Math.abs(state.position.y - this.pos.y) < 2)) {
      if (f > 2.2 || Math.abs(s) > this.width / 2 + 1) this.armed = true;
      return;
    }
    if (this.armed) {
      this.armed = false;
      this.go();
    }
  }
  disarm() {
    this.armed = false;
  }
}
