/**
 * Ink globs lobbed by spitters and their elite and storm variants: ballistic flight with dripping trails and a landing marker, melee swings that reflect them back at their owner, bouncing orbs, and the ink splat where they land.
 */
import {
  Color,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { COLLISION_GROUPS, PALETTE } from '../core/config.js';
import { FX_INK } from './fx.js';
const GLOB_GRAVITY = 19.6;
const GLOB_RADIUS = 0.2;
const GLOB_SPARK = new Color(0.95, 0.85, 0.7);
const GLOB_INK = new Color(0x2e2b36);
const GLOB_HIGHLIGHT = new Color(0.9, 0.97, 1);
const STORM_GLOB_INK = new Color(0.34, 0.2, 0.78);
const STORM_GLOB_GLOW = new Color(0.55, 0.4, 1);
export class Globs {
  ctx;
  fx;
  hooks;
  mesh;
  list = [];
  ray;
  m = new Matrix4();
  q = new Quaternion();
  s = new Vector3();
  t0 = new Vector3();
  t1 = new Vector3();
  up = new Vector3(0, 1, 0);
  col = new Color();
  constructor(ctx, fx, hooks, capacity = 16) {
    this.ctx = ctx;
    this.fx = fx;
    this.hooks = hooks;
    const geometry = new SphereGeometry(1, 20, 14);
    const material = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.12,
      metalness: 0,
    });
    const globals = ctx.globals;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = globals.uTime;
      shader.uniforms.uSkyColor = globals.uSkyColor;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uTime;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          transformed += normal * (sin(uTime * 17.0 + position.y * 7.0) * 0.06 + sin(uTime * 23.0 + position.x * 9.0) * 0.05);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform vec3 uSkyColor;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          #ifdef USE_COLOR
            // element globs glow; plain ink (dark instance colour) doesn't
            totalEmissiveRadiance += max(vColor.rgb - 0.08, 0.0) * 0.75;
          #endif`,
        )
        .replace(
          '#include <opaque_fragment>',
          `{ float f = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 3.0);
             outgoingLight += uSkyColor * f * 0.6 + vec3(0.55, 0.45, 0.8) * f * 0.25; }
          #include <opaque_fragment>`,
        );
    };
    material.customProgramCacheKey = () => 'wb-enemy-glob-v2';
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.name = 'enemy-globs';
    for (let i = 0; i < capacity; i++)
      this.list.push({
        active: false,
        pos: new Vector3(),
        vel: new Vector3(),
        prev: new Vector3(),
        age: 0,
        flight: 1,
        ownerId: -1,
        reflected: false,
        hitPlayer: false,
        trailT: 0,
        spin: 0,
        element: null,
        target: new Vector3(),
        dmg: 0.5,
        size: 1,
        storm: false,
        bounces: 0,
      });
    this.mesh.setColorAt(0, this.col.copy(GLOB_INK));
    this.ray = new ctx.RAPIER.Ray(
      {
        x: 0,
        y: 0,
        z: 0,
      },
      {
        x: 0,
        y: -1,
        z: 0,
      },
    );
  }
  fire(from, target, flight, ownerId, element = null) {
    const glob = this.list.find((g) => !g.active);
    if (!glob) return null;
    const opts =
      element && typeof element == 'object'
        ? element
        : {
            element,
          };
    element = opts.element ?? null;
    glob.dmg = opts.dmg ?? 0.5;
    glob.size = opts.size ?? 1;
    glob.storm = !!opts.storm;
    glob.bounces = opts.bounces ?? 0;
    glob.active = true;
    glob.pos.copy(from);
    glob.prev.copy(from);
    glob.vel.set(
      (target.x - from.x) / flight,
      (target.y - from.y) / flight + 0.5 * GLOB_GRAVITY * flight,
      (target.z - from.z) / flight,
    );
    glob.age = 0;
    glob.flight = flight;
    glob.ownerId = ownerId;
    glob.reflected = false;
    glob.hitPlayer = false;
    glob.trailT = 0;
    glob.spin = Math.random() * 6;
    glob.element = element;
    glob.target.copy(target);
    if (element) this.fx.marker(target, 1.45 * Math.sqrt(glob.size), flight, this.col.set(PALETTE[element].hex), 2);
    else if (glob.storm) this.fx.marker(target, 1.3, flight, STORM_GLOB_GLOW, 2);
    else this.fx.marker(target, 1.25, flight, GLOB_SPARK, 1.4);
    return glob;
  }
  reflect(glob) {
    if (!glob.active || glob.reflected) return;
    glob.reflected = true;
    const ownerPos = this.hooks.ownerPos(glob.ownerId, this.t0);
    const flight = 0.45;
    if (ownerPos) {
      ownerPos.y += 0.6;
      glob.vel.set(
        (ownerPos.x - glob.pos.x) / flight,
        (ownerPos.y - glob.pos.y) / flight + 0.5 * GLOB_GRAVITY * flight,
        (ownerPos.z - glob.pos.z) / flight,
      );
    } else glob.vel.set(-glob.vel.x * 1.4, Math.abs(glob.vel.y) + 4, -glob.vel.z * 1.4);
    glob.age = 0;
    glob.flight = flight;
    this.fx.sparks(glob.pos, GLOB_SPARK, 14, 6, 3, 0.08, 3);
  }
  overlapping(center, radius, visit) {
    for (const glob of this.list)
      if (glob.active && !glob.reflected && glob.pos.distanceToSquared(center) <= (radius + GLOB_RADIUS + 0.35) ** 2)
        visit(glob);
  }
  update(dt) {
    if (!(dt <= 0))
      for (const glob of this.list) {
        if (!glob.active) continue;
        glob.age += dt;
        glob.prev.copy(glob.pos);
        glob.vel.y -= GLOB_GRAVITY * dt;
        glob.pos.addScaledVector(glob.vel, dt);
        glob.spin += dt * 9;
        glob.trailT -= dt;
        if (glob.trailT <= 0) {
          glob.trailT = 0.035;
          const floorY = this.fx.floorAt(glob.pos.x, glob.pos.z, glob.pos.y);
          this.fx.drops.spawn(
            this.ctx.time.elapsed,
            glob.pos.x + (Math.random() - 0.5) * 0.15,
            glob.pos.y,
            glob.pos.z + (Math.random() - 0.5) * 0.15,
            glob.vel.x * 0.2 + (Math.random() - 0.5),
            glob.vel.y * 0.1,
            glob.vel.z * 0.2 + (Math.random() - 0.5),
            (0.05 + Math.random() * 0.04) * glob.size,
            0.9,
            floorY,
            glob.element ? this.col.set(PALETTE[glob.element].hex) : glob.storm ? STORM_GLOB_INK : FX_INK,
            glob.element ? 0.6 : glob.storm ? 0.8 : 0,
            16,
            1,
          );
          if (glob.storm && Math.random() < 0.5) {
            const angle = Math.random() * Math.PI * 2;
            this.fx.glows.spawn(
              this.ctx.time.elapsed,
              glob.pos.x,
              glob.pos.y,
              glob.pos.z,
              Math.cos(angle) * 5,
              (Math.random() - 0.3) * 5,
              Math.sin(angle) * 5,
              0.05,
              0.12,
              STORM_GLOB_GLOW,
              4,
              0,
              6,
              3,
            );
          }
        }
        if (!glob.reflected && !glob.hitPlayer && this.hooks.touchesPlayer(glob.pos, GLOB_RADIUS * glob.size + 0.1)) {
          glob.hitPlayer = true;
          this.t1.set(glob.vel.x, 0, glob.vel.z).normalize();
          this.hooks.hurtPlayer(glob, this.t1);
          this.splat(glob, glob.pos, false);
          continue;
        }
        if (glob.reflected) {
          const enemyId = this.hooks.enemyAt(glob.pos, 0.4, false, glob.ownerId);
          if (enemyId >= 0) {
            this.t1.set(glob.vel.x, 0, glob.vel.z).normalize();
            this.hooks.hitEnemy(enemyId, glob, this.t1);
            this.splat(glob, glob.pos, false);
            continue;
          }
        }
        const delta = this.t0.subVectors(glob.pos, glob.prev);
        const len = delta.length();
        let hitY = -Infinity;
        if (len > 0.00001)
          try {
            this.ray.origin.x = glob.prev.x;
            this.ray.origin.y = glob.prev.y;
            this.ray.origin.z = glob.prev.z;
            this.ray.dir.x = delta.x / len;
            this.ray.dir.y = delta.y / len;
            this.ray.dir.z = delta.z / len;
            const hit = this.ctx.physics.castRay(
              this.ray,
              len + GLOB_RADIUS,
              true,
              this.ctx.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
              COLLISION_GROUPS.worldQuery,
            );
            if (hit) {
              const timeOfImpact = hit.timeOfImpact;
              glob.pos.set(
                glob.prev.x + (delta.x / len) * timeOfImpact,
                glob.prev.y + (delta.y / len) * timeOfImpact,
                glob.prev.z + (delta.z / len) * timeOfImpact,
              );
              hitY = glob.pos.y;
            }
          } catch {}
        const groundY = this.fx.groundAt(glob.pos.x, glob.pos.z, glob.pos.y + 0.6);
        let inWater = false;
        try {
          inWater = this.ctx.water.depthAt(glob.pos.x, glob.pos.z) > 0.05 && glob.pos.y <= this.ctx.water.level;
        } catch {}
        if (hitY > -Infinity || glob.pos.y <= groundY || inWater || glob.age > 4) {
          if (glob.pos.y < groundY) glob.pos.y = groundY;
          if (glob.bounces > 0 && !inWater && !glob.reflected && glob.age <= 4 && this.bounce(glob)) continue;
          this.splat(glob, glob.pos, inWater);
        }
      }
  }
  bounce(glob) {
    const target = this.hooks.bounceTarget?.(glob, glob.pos, this.t1);
    if (!target) return false;
    glob.bounces--;
    glob.pos.y += 0.05;
    const flight = 0.62;
    glob.vel.set(
      (target.x - glob.pos.x) / flight,
      (target.y - glob.pos.y) / flight + 0.5 * GLOB_GRAVITY * flight,
      (target.z - glob.pos.z) / flight,
    );
    glob.age = 0;
    glob.flight = flight;
    glob.prev.copy(glob.pos);
    glob.target.copy(target);
    const color = glob.element ? this.col.set(PALETTE[glob.element].hex) : GLOB_SPARK;
    this.fx.sparks(glob.pos, color, 12, 4, 3, 0.08, 4);
    this.fx.dust(glob.pos, 2, 0.4, 0.4, undefined, 0.35);
    this.fx.ring(glob.pos, 0.2, 1.4, 0.35, color, 2);
    this.fx.marker(target, 1.3 * Math.sqrt(glob.size), flight, color, 2);
    return true;
  }
  splat(glob, pos, inWater) {
    glob.active = false;
    if (glob.element) this.fx.inkSplash(pos, null, 16, 4.5, 0.08, this.col.set(PALETTE[glob.element].hex));
    else if (glob.storm) {
      this.fx.inkSplash(pos, null, 16, 4.5, 0.08, STORM_GLOB_INK);
      this.fx.sparks(pos, STORM_GLOB_GLOW, 14, 6, 4, 0.07, 2);
      if (!inWater) {
        this.fx.puddle(pos, 1.35, 6, STORM_GLOB_INK, 0.8);
        this.fx.ring(pos, 0.3, 1.8, 0.4, STORM_GLOB_GLOW, 2.4);
      }
    } else {
      this.fx.inkSplash(pos, null, 18, 4.5, 0.08);
      if (!inWater) {
        this.fx.puddle(pos, 1.35, 7);
        this.fx.dust(pos, 3, 0.6, 0.45, FX_INK, 0.35);
      }
    }
    this.hooks.onLand(glob, pos, inWater);
  }
  render() {
    let count = 0;
    for (const glob of this.list) {
      if (!glob.active) continue;
      const speed = glob.vel.length();
      const stretch = 1 + Math.min(0.6, speed * 0.03);
      if (speed > 0.001) this.q.setFromUnitVectors(this.up, this.t0.copy(glob.vel).divideScalar(speed));
      else this.q.identity();
      const radius = GLOB_RADIUS * glob.size * (1 + 0.08 * Math.sin(glob.spin * 2));
      this.s.set(radius / Math.sqrt(stretch), radius * stretch, radius / Math.sqrt(stretch));
      this.m.compose(glob.pos, this.q, this.s);
      this.mesh.setColorAt(
        count,
        glob.element
          ? this.col.set(PALETTE[glob.element].hex).lerp(GLOB_HIGHLIGHT, 0.25)
          : glob.storm
            ? this.col.copy(STORM_GLOB_INK)
            : this.col.copy(GLOB_INK),
      );
      this.mesh.setMatrixAt(count++, this.m);
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    if (count > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }
  clear() {
    for (const glob of this.list) glob.active = false;
  }
}
