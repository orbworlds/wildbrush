/**
 * Heart and ink pickups dropped by defeated Smudges: they pop out, settle and bob on the ground, drift toward the nearby hero and heal or refill ink when collected.
 */
import {
  Color,
  DynamicDrawUsage,
  Euler,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Shape,
  Vector2,
  Vector3,
} from 'three';
import { PALETTE } from '../core/config.js';
const PICKUP_LIFETIME = 45;
const PICKUP_MAGNET_RADIUS = 3.2;
const PICKUP_COLLECT_RADIUS = 0.9;
function pickupHeartGeometry() {
  const shape = new Shape();
  shape.moveTo(0, -0.55);
  shape.bezierCurveTo(-0.15, -0.38, -0.62, -0.12, -0.6, 0.18);
  shape.bezierCurveTo(-0.58, 0.48, -0.2, 0.62, 0, 0.32);
  shape.bezierCurveTo(0.2, 0.62, 0.58, 0.48, 0.6, 0.18);
  shape.bezierCurveTo(0.62, -0.12, 0.15, -0.38, 0, -0.55);
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.1,
    bevelSize: 0.08,
    bevelSegments: 4,
    curveSegments: 16,
  });
  geometry.translate(0, 0, -0.09);
  geometry.computeVertexNormals();
  return geometry;
}
function inkDropGeometry() {
  const profile = [];
  for (let i = 0; i <= 18; i++) {
    const t2 = i / 18;
    const angle = t2 * Math.PI;
    const radius = Math.sin(angle) * (0.25 + 0.75 * t2 ** 0.9) * 0.5;
    const y = 0.62 - t2 * 1.1 - (t2 > 0.6 ? (t2 - 0.6) * 0.1 : 0);
    profile.push(new Vector2(Math.max(0.001, radius), y));
  }
  profile[0].x = 0.0001;
  profile[18].x = 0.0001;
  const geometry = new LatheGeometry(profile, 18);
  geometry.computeVertexNormals();
  return geometry;
}
export class Pickups {
  ctx;
  fx;
  group = new Group();
  list = [];
  hearts;
  inks;
  m = new Matrix4();
  q = new Quaternion();
  e = new Euler();
  s = new Vector3();
  p = new Vector3();
  c = new Color();
  to = new Vector3();
  constructor(ctx, fx, capacity = 48) {
    this.ctx = ctx;
    this.fx = fx;
    const addGlow = (material, cacheKey, glow) => {
      const globals = ctx.globals;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = globals.uTime;
        shader.fragmentShader = shader.fragmentShader
          .replace(
            '#include <common>',
            `#include <common>
uniform float uTime;`,
          )
          .replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
            totalEmissiveRadiance += diffuseColor.rgb * ${glow.toFixed(2)} * (0.8 + 0.2 * sin(uTime * 5.0));`,
          )
          .replace(
            '#include <opaque_fragment>',
            `{ float f = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.0);
               outgoingLight += diffuseColor.rgb * f * 1.4 + vec3(1.0) * f * 0.2; }
            #include <opaque_fragment>`,
          );
      };
      material.customProgramCacheKey = () => cacheKey;
    };
    const heartMaterial = new MeshStandardMaterial({
      color: 0xff4d6a,
      roughness: 0.25,
    });
    addGlow(heartMaterial, 'wb-enemy-heart-v1', 0.55);
    const inkMaterial = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.15,
    });
    addGlow(inkMaterial, 'wb-enemy-ink-v1', 0.6);
    this.hearts = new InstancedMesh(pickupHeartGeometry(), heartMaterial, capacity);
    this.inks = new InstancedMesh(inkDropGeometry(), inkMaterial, capacity);
    for (const mesh of [this.hearts, this.inks]) {
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.count = 0;
    }
    this.inks.setColorAt(0, this.c.set(1, 1, 1));
    this.group.add(this.hearts, this.inks);
    this.group.name = 'enemy-pickups';
    for (let i = 0; i < capacity; i++)
      this.list.push({
        active: false,
        kind: 'heart',
        color: null,
        pos: new Vector3(),
        vel: new Vector3(),
        age: 0,
        grounded: false,
        spin: 0,
        sparkT: 0,
        bobPhase: 0,
      });
  }
  spawn(kind, pos, color) {
    let pickup = this.list.find((p) => !p.active);
    pickup ||= this.list.reduce((oldest, p) => (oldest.age > p.age ? oldest : p));
    pickup.active = true;
    pickup.kind = kind;
    pickup.color = color;
    pickup.pos.copy(pos);
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 2;
    pickup.vel.set(Math.cos(angle) * speed, 6 + Math.random() * 2.5, Math.sin(angle) * speed);
    pickup.age = 0;
    pickup.grounded = false;
    pickup.spin = Math.random() * 6;
    pickup.sparkT = 0;
    pickup.bobPhase = Math.random() * 6;
  }
  update(dt, playerPos, playerAlive) {
    if (dt <= 0) return;
    const elapsed = this.ctx.time.elapsed;
    for (const pickup of this.list) {
      if (!pickup.active) continue;
      pickup.age += dt;
      if (pickup.age > PICKUP_LIFETIME) {
        pickup.active = false;
        this.fx.sparks(pickup.pos, this.c.set(1, 1, 1), 6, 2, 1.5, 0.06, 0);
        continue;
      }
      pickup.spin += dt * 2.2;
      const groundY = this.fx.groundAt(pickup.pos.x, pickup.pos.z, pickup.pos.y + 0.6);
      let depth = 0;
      try {
        depth = this.ctx.water.depthAt(pickup.pos.x, pickup.pos.z);
      } catch {
        depth = 0;
      }
      const floorY = depth > 0.05 ? Math.max(groundY, this.ctx.water.level) : groundY;
      const hover = 0.7 + Math.sin(elapsed * 2.6 + pickup.bobPhase) * 0.1;
      let attracted = false;
      if (playerPos && playerAlive && pickup.age > 0.5) {
        this.to.set(playerPos.x - pickup.pos.x, playerPos.y + 0.9 - pickup.pos.y, playerPos.z - pickup.pos.z);
        const dist = this.to.length();
        if (dist < PICKUP_COLLECT_RADIUS) {
          this.collect(pickup);
          continue;
        }
        if (dist < PICKUP_MAGNET_RADIUS) {
          attracted = true;
          const pull = 14 * (1 - dist / PICKUP_MAGNET_RADIUS) + 5;
          pickup.vel.addScaledVector(this.to.divideScalar(dist), pull * dt);
          pickup.vel.multiplyScalar(Math.exp(-3 * dt));
        }
      }
      if (!attracted)
        if (pickup.grounded) {
          pickup.vel.x *= Math.exp(-6 * dt);
          pickup.vel.z *= Math.exp(-6 * dt);
          pickup.vel.y += ((floorY + hover - pickup.pos.y) * 30 - pickup.vel.y * 8) * dt;
        } else {
          pickup.vel.y -= 18 * dt;
          pickup.vel.x *= Math.exp(-0.8 * dt);
          pickup.vel.z *= Math.exp(-0.8 * dt);
        }
      pickup.pos.addScaledVector(pickup.vel, dt);
      if (!attracted && !pickup.grounded && pickup.pos.y < floorY + 0.25 && pickup.vel.y < 0) {
        pickup.pos.y = floorY + 0.25;
        if (pickup.vel.y < -3) {
          pickup.vel.y *= -0.45;
          this.fx.dust(pickup.pos, 1, 0.1, 0.3, undefined, 0.3);
        } else {
          pickup.grounded = true;
          pickup.vel.y = 0;
        }
      }
      if (pickup.pos.y < floorY + 0.1) pickup.pos.y = floorY + 0.1;
      pickup.sparkT -= dt;
      if (pickup.sparkT <= 0) {
        pickup.sparkT = 0.12 + Math.random() * 0.1;
        this.col(pickup, this.c);
        this.fx.glows.spawn(
          elapsed,
          pickup.pos.x + (Math.random() - 0.5) * 0.5,
          pickup.pos.y + (Math.random() - 0.5) * 0.4,
          pickup.pos.z + (Math.random() - 0.5) * 0.5,
          0,
          0.5 + Math.random() * 0.4,
          0,
          0.07,
          0.6,
          this.c,
          2.2,
          0,
          1,
          0,
        );
      }
    }
  }
  col(pickup, out) {
    return pickup.kind === 'heart' ? out.set(16738946) : out.set(PALETTE[pickup.color ?? 'red'].hex);
  }
  collect(pickup) {
    pickup.active = false;
    this.col(pickup, this.c);
    this.fx.sparks(pickup.pos, this.c, 14, 3.5, 3, 0.08, -1);
    this.fx.glows.spawn(
      this.ctx.time.elapsed,
      pickup.pos.x,
      pickup.pos.y,
      pickup.pos.z,
      0,
      0,
      0,
      1,
      0.18,
      this.c,
      2,
      0,
      1,
      0,
    );
    try {
      if (pickup.kind === 'heart') {
        this.ctx.player.heal(1);
        this.ctx.events.emit('pickup', {
          kind: 'heart',
          position: pickup.pos.clone(),
          amount: 1,
        });
      } else {
        const color = pickup.color ?? 'red';
        this.ctx.paint.addInk(color, 15);
        this.ctx.events.emit('pickup', {
          kind: 'ink',
          position: pickup.pos.clone(),
          amount: 15,
          color,
        });
      }
    } catch (err) {
      console.warn('[enemies] pickup failed', err);
    }
  }
  render() {
    let heartCount = 0;
    let inkCount = 0;
    const elapsed = this.ctx.time.elapsed;
    for (const pickup of this.list) {
      if (!pickup.active || (pickup.age > 40 && Math.sin(pickup.age * 18) > 0.3)) continue;
      const appear = Math.min(1, pickup.age * 5);
      const size =
        (pickup.kind === 'heart' ? 0.4 : 0.38) *
        (0.6 + 0.4 * appear) *
        (1 + 0.06 * Math.sin(elapsed * 5 + pickup.bobPhase));
      this.e.set(pickup.kind === 'heart' ? 0 : 0.25 * Math.sin(pickup.spin), pickup.spin, 0);
      this.q.setFromEuler(this.e);
      this.s.setScalar(size);
      this.m.compose(this.p.copy(pickup.pos), this.q, this.s);
      if (pickup.kind === 'heart') this.hearts.setMatrixAt(heartCount++, this.m);
      else {
        this.inks.setMatrixAt(inkCount, this.m);
        this.inks.setColorAt(inkCount, this.col(pickup, this.c));
        inkCount++;
      }
    }
    this.hearts.count = heartCount;
    this.inks.count = inkCount;
    this.hearts.visible = heartCount > 0;
    this.inks.visible = inkCount > 0;
    if (heartCount) this.hearts.instanceMatrix.needsUpdate = true;
    if (inkCount) {
      this.inks.instanceMatrix.needsUpdate = true;
      if (this.inks.instanceColor) this.inks.instanceColor.needsUpdate = true;
    }
  }
}
