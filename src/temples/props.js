/**
 * Shared helpers for temple props (merged meshes, boxes, sounds, colliders), the temple light rig, sliding doors (stone, bars, locked and boss doors) and the braziers that Ember lights.
 */
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Matrix4,
  Mesh,
  OctahedronGeometry,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';
import { COLLISION_GROUPS, PALETTE } from '../core/config.js';
import { damp } from '../core/math.js';
import { ParticleMode } from '../shared/particles.js';
import { mergeGeometries, randRange, roundedBox, TAU } from '../shared/util.js';
import { _mat4, _pos, _quat, _scale, bakeGeometry, rotQuat } from './kit.js';
import { KIND } from './stone-material.js';
export function mergeMesh(parts, material, label) {
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  const mesh = new Mesh(merged, material);
  mesh.name = label;
  return mesh;
}
export function objBox(x, y, z, w, h, d, color, options = {}, bevel = 0) {
  const geometry = bevel ? roundedBox(w, h, d, bevel, 0.8) : new BoxGeometry(w, h, d);
  rotQuat(options.rot);
  _mat4.compose(_pos.set(x, y, z), _quat, _scale.set(1, 1, 1));
  return bakeGeometry(
    geometry,
    color,
    {
      ...options,
      obj: true,
    },
    _mat4,
  );
}
export function objGeo(geometry, x, y, z, color, options = {}, scale = 1) {
  rotQuat(options.rot);
  _mat4.compose(_pos.set(x, y, z), _quat, _scale.setScalar(scale));
  return bakeGeometry(
    geometry,
    color,
    {
      ...options,
      obj: true,
    },
    _mat4,
  );
}
export const _delta = new Vector3();
export const _sparkPos = new Vector3();
export function sfx(ctx, sound, position, volume = 1, pitch = 1) {
  try {
    ctx.audio.play(sound, {
      position,
      volume,
      pitch,
    });
  } catch {}
}
export function removeCollider(ctx, collider) {
  if (collider)
    try {
      ctx.colliders.unregister(collider);
      ctx.physics.removeCollider(collider, false);
    } catch {}
}
export function addCollider(ctx, desc, surface = 'stone', object, tag) {
  try {
    desc.setCollisionGroups(COLLISION_GROUPS.static).setFriction(0.8);
    const collider = ctx.physics.createCollider(desc);
    ctx.colliders.register(collider, {
      kind: 'structure',
      surface,
      object,
      data: {
        temple: true,
        tag,
      },
    });
    return collider;
  } catch (err) {
    console.warn('[temples] collider failed', err);
    return null;
  }
}
export class TempleLights {
  mat;
  list = [];
  order = [];
  score = [];
  boost = 1;
  constructor(mat) {
    this.mat = mat;
  }
  add(pos, color, intensity, radius, on = 0, flicker = 0.12) {
    this.list.push({
      pos: pos.clone(),
      color: new Color(color),
      intensity,
      radius,
      flicker,
      on,
      target: on,
      seed: Math.random() * 100,
    });
    return this.list.length - 1;
  }
  set(id, target, instant = false) {
    const light = this.list[id];
    if (light) {
      light.target = target;
      if (instant) light.on = target;
    }
  }
  move(id, pos) {
    const light = this.list[id];
    if (light) light.pos.copy(pos);
  }
  setIntensity(id, intensity) {
    const light = this.list[id];
    if (light) light.intensity = intensity;
  }
  get count() {
    return this.list.length;
  }
  update(dt, time, focus) {
    const len = this.list.length;
    this.order.length = 0;
    for (let i = 0; i < len; i++) {
      const light = this.list[i];
      light.on += (light.target - light.on) * damp(3.5, dt);
      if (light.on * light.intensity < 0.01) continue;
      const dist = focus ? light.pos.distanceTo(focus) : 0;
      this.score[i] = dist - light.radius * 0.8;
      this.order.push(i);
    }
    if (this.order.length > this.mat.lightPos.length) this.order.sort((a, b) => this.score[a] - this.score[b]);
    const slots = this.mat.lightPos.length;
    for (let i = 0; i < slots; i++) {
      const idx = i < this.order.length ? this.order[i] : -1;
      if (idx < 0) {
        this.mat.lightPos[i].w = 0;
        this.mat.lightCol[i].setRGB(0, 0, 0);
        continue;
      }
      const light = this.list[idx];
      const flick =
        1 -
        light.flicker +
        light.flicker *
          (0.55 + 0.25 * Math.sin(time * 13.1 + light.seed) + 0.2 * Math.sin(time * 7.3 + light.seed * 2.1));
      const power = light.on * light.intensity * flick * this.boost;
      this.mat.lightPos[i].set(light.pos.x, light.pos.y, light.pos.z, light.radius);
      this.mat.lightCol[i].copy(light.color).multiplyScalar(power);
    }
  }
}
export class TempleDoor {
  ctx;
  opts;
  mesh;
  col = null;
  open01;
  target;
  time;
  depth;
  hy;
  center = new Vector3();
  shakeT = 0;
  onOpened = null;
  wasOpen;
  constructor(ctx, opts, material, root) {
    this.ctx = ctx;
    this.opts = opts;
    const { width, height, style, colors } = opts;
    const thick = style === 'bars' ? 0.3 : style === 'boss' ? 0.7 : 0.5;
    this.depth = height + 0.3;
    this.hy = height / 2;
    const parts = [];
    const halfW = width / 2;
    if (style === 'bars') {
      const count = Math.max(3, Math.round(width / 0.42));
      for (let i = 0; i < count; i++) {
        const x = -halfW + 0.2 + (i / (count - 1)) * (width - 0.4);
        parts.push(
          objGeo(new CylinderGeometry(0.07, 0.07, height, 6), x, 0, 0, colors.metal, {
            kind: KIND.metal,
          }),
        );
        parts.push(
          objGeo(new ConeGeometry(0.11, 0.3, 6), x, height / 2 + 0.12, 0, colors.metal, {
            kind: KIND.metal,
          }),
        );
      }
      for (const y of [-height * 0.3, height * 0.15, height * 0.42])
        parts.push(
          objBox(0, y, 0, width - 0.1, 0.12, 0.16, colors.metal, {
            kind: KIND.metal,
          }),
        );
      parts.push(
        objBox(0, -height * 0.3, 0.1, 0.5, 0.5, 0.06, colors.glass, {
          kind: KIND.glass,
          glow: [0, 1],
        }),
      );
    } else {
      parts.push(
        objBox(
          0,
          0,
          0,
          width,
          height,
          thick,
          colors.stone,
          {
            kind: KIND.ashlar,
          },
          0.05,
        ),
      );
      parts.push(
        objBox(0, height / 2 - 0.2, 0, width + 0.02, 0.24, thick + 0.08, colors.trim, {
          kind: KIND.smooth,
        }),
      );
      parts.push(
        objBox(0, -height / 2 + 0.2, 0, width + 0.02, 0.24, thick + 0.08, colors.trim, {
          kind: KIND.smooth,
        }),
      );
      parts.push(
        objBox(-halfW + 0.14, 0, 0, 0.2, height, thick + 0.06, colors.trim, {
          kind: KIND.smooth,
        }),
      );
      parts.push(
        objBox(halfW - 0.14, 0, 0, 0.2, height, thick + 0.06, colors.trim, {
          kind: KIND.smooth,
        }),
      );
      for (const side of [-1, 1]) {
        const ring = new TorusGeometry(style === 'boss' ? 0.95 : 0.6, style === 'boss' ? 0.1 : 0.07, 6, 28);
        parts.push(
          objGeo(ring, 0, height * 0.12, side * (thick / 2 + 0.03), colors.glass, {
            kind: KIND.glass,
            glow: [0, style === 'boss' ? 1.4 : 0.9],
          }),
        );
        const gem = new OctahedronGeometry(style === 'boss' ? 0.42 : 0.28, 0);
        gem.scale(0.8, 1.2, 0.3);
        parts.push(
          objGeo(gem, 0, height * 0.12, side * (thick / 2 + 0.05), colors.glass, {
            kind: KIND.glass,
            glow: [0, style === 'boss' ? 1.6 : 1],
          }),
        );
        if (style === 'boss') {
          for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * TAU;
            const spike = new ConeGeometry(0.12, 0.8, 4);
            const matrix = new Matrix4().compose(
              new Vector3(Math.cos(angle) * 1.5, height * 0.12 + Math.sin(angle) * 1.5, side * (thick / 2 + 0.04)),
              new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), angle - Math.PI / 2),
              new Vector3(1, 1, 0.5),
            );
            spike.applyMatrix4(matrix);
            parts.push(
              objGeo(spike, 0, 0, 0, colors.trim, {
                kind: KIND.metal,
              }),
            );
          }
          for (const dir of [-1, 1])
            for (let i = 0; i < 6; i++) {
              const link = new TorusGeometry(0.12, 0.035, 4, 10);
              link.rotateY(i % 2 ? Math.PI / 2 : 0);
              parts.push(
                objGeo(
                  link,
                  dir * (0.9 + i * 0.28),
                  height * 0.12 + 1.2 - i * 0.42,
                  side * (thick / 2 + 0.06),
                  colors.metal,
                  {
                    kind: KIND.metal,
                  },
                ),
              );
            }
        }
        if (style === 'locked') {
          parts.push(
            objBox(
              0,
              -height * 0.12,
              side * (thick / 2 + 0.16),
              0.9,
              0.8,
              0.26,
              colors.metal,
              {
                kind: KIND.metal,
              },
              0.06,
            ),
          );
          const shackle = new TorusGeometry(0.3, 0.07, 6, 16, Math.PI);
          parts.push(
            objGeo(shackle, 0, -height * 0.12 + 0.4, side * (thick / 2 + 0.16), colors.metal, {
              kind: KIND.metal,
            }),
          );
          parts.push(
            objBox(0, -height * 0.12 - 0.05, side * (thick / 2 + 0.3), 0.12, 0.3, 0.03, 1709072, {
              kind: KIND.metal,
            }),
          );
          parts.push(
            objBox(0, -height * 0.12 + 0.1, side * (thick / 2 + 0.3), 0.2, 0.16, 0.03, colors.glass, {
              kind: KIND.glass,
              glow: [0, 1.4],
            }),
          );
        }
      }
    }
    this.mesh = mergeMesh(parts, material, `temple-door-${style}`);
    if (!opts.alongX) this.mesh.rotation.y = Math.PI / 2;
    this.center.copy(opts.pos).setY(opts.pos.y + height / 2);
    this.mesh.position.copy(this.center);
    root.add(this.mesh);
    this.open01 = +!!opts.startOpen;
    this.target = this.open01;
    this.wasOpen = this.open01 >= 1;
    this.time = opts.time ?? 1.4;
    const hx = opts.alongX ? width / 2 : thick / 2 + 0.05;
    const hz = opts.alongX ? thick / 2 + 0.05 : width / 2;
    const desc = ctx.RAPIER.ColliderDesc.cuboid(hx, height / 2, hz).setTranslation(
      this.center.x,
      this.center.y,
      this.center.z,
    );
    this.col = addCollider(ctx, desc, 'stone', this.mesh, 'door');
    this.apply();
  }
  get isOpen() {
    return this.open01 >= 0.999;
  }
  get isClosed() {
    return this.open01 <= 0.001;
  }
  open(instant = false) {
    if (this.target !== 1 || instant) {
      this.target = 1;
      if (instant) this.open01 = 1;
      else {
        this.shakeT = 0.35;
        sfx(this.ctx, 'barrier-down', this.center, 0.9);
        try {
          this.ctx.events.emit('camera:shake', {
            strength: 0.18,
            position: this.center.clone(),
          });
        } catch {}
      }
      this.apply();
    }
  }
  close(instant = false) {
    if (this.target !== 0 || instant) {
      this.target = 0;
      this.wasOpen = false;
      if (instant) this.open01 = 0;
      else {
        sfx(this.ctx, 'barrier-up', this.center, 0.9);
        try {
          this.ctx.events.emit('camera:shake', {
            strength: 0.25,
            position: this.center.clone(),
          });
        } catch {}
      }
      this.apply();
    }
  }
  inDoorway(p, margin = 0.6) {
    const opts = this.opts;
    const dx = Math.abs(p.x - opts.pos.x);
    const dz = Math.abs(p.z - opts.pos.z);
    const limX = opts.alongX ? opts.width / 2 : 1.2 + margin;
    const limZ = opts.alongX ? 1.2 + margin : opts.width / 2;
    return dx < limX && dz < limZ && p.y > opts.pos.y - 1 && p.y < opts.pos.y + opts.height;
  }
  update(dt) {
    if (this.open01 === this.target && this.shakeT <= 0) return;
    const step = dt / this.time;
    if (this.open01 < this.target) this.open01 = Math.min(this.target, this.open01 + step);
    else if (this.open01 > this.target) this.open01 = Math.max(this.target, this.open01 - step * 1.6);
    this.shakeT = Math.max(0, this.shakeT - dt);
    this.apply();
    if (!this.wasOpen && this.open01 >= 1) {
      this.wasOpen = true;
      this.onOpened?.();
    }
  }
  apply() {
    const eased = this.open01 * this.open01 * (3 - 2 * this.open01);
    const jitter = this.shakeT > 0 ? (Math.random() - 0.5) * 0.04 : 0;
    this.mesh.position.set(this.center.x + jitter, this.center.y - eased * this.depth, this.center.z);
    this.mesh.visible = eased < 0.995;
    if (this.col)
      try {
        this.col.setTranslation({
          x: this.center.x,
          y: this.center.y - eased * this.depth,
          z: this.center.z,
        });
        this.col.setEnabled(eased < 0.8);
      } catch {}
  }
}
export class Brazier {
  ctx;
  pos;
  flames;
  flameId;
  lights;
  light;
  chan;
  ch;
  particles;
  color;
  lit = false;
  level = 0;
  burst = 0;
  onLit = null;
  constructor(ctx, pos, flames, flameId, lights, light, chan, ch, particles, color = 'red') {
    this.ctx = ctx;
    this.pos = pos;
    this.flames = flames;
    this.flameId = flameId;
    this.lights = lights;
    this.light = light;
    this.chan = chan;
    this.ch = ch;
    this.particles = particles;
    this.color = color;
  }
  hits(p, reach) {
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const dy = p.y - this.pos.y;
    return dx * dx + dz * dz < (1.1 + reach) * (1.1 + reach) && dy > -2.2 - reach * 0.5 && dy < 1.8 + reach * 0.5;
  }
  ignite(instant = false) {
    if (this.lit) return;
    this.lit = true;
    this.lights.set(this.light, 1, instant);
    if (instant) {
      this.level = 1;
      this.apply();
      return;
    }
    this.burst = 1;
    sfx(this.ctx, 'shrine-activate', this.pos, 0.8, 1.15);
    const particles = this.particles;
    if (particles) {
      const color = new Color(PALETTE[this.color].hex);
      const gold = new Color(1, 0.85, 0.4);
      for (let i = 0; i < 30; i++) {
        const ang = Math.random() * TAU;
        const speed = randRange(Math.random, 1.5, 4);
        particles.spawn({
          x: this.pos.x,
          y: this.pos.y + 0.2,
          z: this.pos.z,
          vx: Math.cos(ang) * speed,
          vy: randRange(Math.random, 2, 6),
          vz: Math.sin(ang) * speed,
          color: i % 3 ? color : gold,
          size: randRange(Math.random, 0.08, 0.2),
          life: randRange(Math.random, 0.5, 1.1),
          drag: 1.8,
          gravity: -2,
          bright: 2.5,
        });
      }
    }
    this.onLit?.();
  }
  douse() {
    if (this.lit) {
      this.lit = false;
      this.lights.set(this.light, 0);
    }
  }
  update(dt) {
    const target = +!!this.lit;
    this.level += (target - this.level) * damp(this.lit ? 6 : 3, dt);
    this.burst = Math.max(0, this.burst - dt * 1.4);
    this.apply();
    if (this.lit && this.particles && Math.random() < dt * 5)
      this.particles.spawn({
        x: this.pos.x + (Math.random() - 0.5) * 0.5,
        y: this.pos.y + 0.8,
        z: this.pos.z + (Math.random() - 0.5) * 0.5,
        vx: 0,
        vy: randRange(Math.random, 1.5, 3),
        vz: 0,
        color: new Color(1, 0.7, 0.3),
        size: 0.05,
        life: 1.6,
        mode: ParticleMode.Rise,
        drag: 0.3,
        bright: 3,
      });
  }
  apply() {
    this.flames.level[this.flameId] = this.level * (1 + this.burst * 0.6);
    this.chan[this.ch] = 0.15 + this.level * 1.2 + this.burst * 1.5;
  }
}
