/**
 * Frost ice floes that freeze on water: faceted floe meshes with a glassy, frosted ice shader and walkable kinematic colliders that bob, then crack and sink, or melt under fire.
 */
import {
  BufferGeometry,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { COLLISION_GROUPS } from '../core/config.js';
import { clamp } from '../core/math.js';
import { getNoiseTexture, rand } from './util.js';
const FLOE_VARIANTS = 3;
const FLOES_PER_VARIANT = 14;
const FLOE_RADIUS = 2.2;
const FLOE_LIFETIME = 60;
const CRACK_TIME = 2.4;
const SINK_TIME = 2.2;
const MELT_TIME = 0.9;
function makeFloeGeometry(seed) {
  let state = seed * 7919 + 17;
  const rnd = () => {
    state = (state * 16807) % 2147483647;
    return (state & 65535) / 65535;
  };
  const sides = rnd() > 0.45 ? 6 : 7;
  const angles = [];
  const radii = [];
  for (let i = 0; i < sides; i++) {
    angles.push(((i + (rnd() - 0.5) * 0.5) / sides) * Math.PI * 2);
    radii.push(FLOE_RADIUS * (0.86 + rnd() * 0.22));
  }
  const profile = [
    [0.5, 0.3, 0],
    [0.83, 0.285, 0.3],
    [0.95, 0.235, 1],
    [1, 0.12, 1],
    [0.88, -0.22, 0.55],
  ];
  const rings = profile.map(([scale, y], ring) =>
    angles.map((angle, i) => {
      const jitter = ring === 0 ? (rnd() - 0.5) * 0.03 : ring === 1 ? (rnd() - 0.5) * 0.02 : 0;
      return new Vector3(Math.cos(angle) * radii[i] * scale, y + jitter, Math.sin(angle) * radii[i] * scale);
    }),
  );
  const topCenter = new Vector3(0, 0.31, 0);
  const bottomCenter = new Vector3(0, -0.27, 0);
  const positions = [];
  const edges = [];
  const tri = (a2, b, c, ea, eb, ec) => {
    positions.push(a2.x, a2.y, a2.z, b.x, b.y, b.z, c.x, c.y, c.z);
    edges.push(ea, eb, ec);
  };
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    tri(topCenter, rings[0][next], rings[0][i], 0, 0, 0);
  }
  for (let j = 0; j < profile.length - 1; j++) {
    const e0 = profile[j][2];
    const e1 = profile[j + 1][2];
    for (let k = 0; k < sides; k++) {
      const next = (k + 1) % sides;
      const a = rings[j][k];
      const b = rings[j][next];
      const c = rings[j + 1][next];
      const d = rings[j + 1][k];
      tri(a, b, c, e0, e0, e1);
      tri(a, c, d, e0, e1, e1);
    }
  }
  const last = rings[profile.length - 1];
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    tri(bottomCenter, last[i], last[next], 0.55, 0.55, 0.55);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aEdge', new Float32BufferAttribute(edges, 1));
  geometry.computeVertexNormals();
  const hull = [];
  for (const ring of [rings[1], rings[3], rings[4]]) for (const p of ring) hull.push(p.x, p.y, p.z);
  hull.push(topCenter.x, topCenter.y, topCenter.z);
  return {
    geo: geometry,
    hull: new Float32Array(hull),
  };
}
export class IceFloes {
  ctx;
  fx;
  meshes = [];
  iceAttr = [];
  hulls = [];
  free = [];
  floes = [];
  byHandle = new Map();
  m = new Matrix4();
  q = new Quaternion();
  e = new Euler();
  p = new Vector3();
  sc = new Vector3();
  zero = new Matrix4().makeScale(0, 0, 0);
  constructor(ctx, fx) {
    this.ctx = ctx;
    this.fx = fx;
    const material = this.makeMaterial();
    for (let variant = 0; variant < FLOE_VARIANTS; variant++) {
      const { geo, hull } = makeFloeGeometry(variant * 3 + 11);
      const iceAttr = new InstancedBufferAttribute(new Float32Array(56), 4);
      iceAttr.setUsage(DynamicDrawUsage);
      geo.setAttribute('aIce', iceAttr);
      const mesh = new InstancedMesh(geo, material, FLOES_PER_VARIANT);
      mesh.name = `elements-ice-${variant}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      for (let j = 0; j < FLOES_PER_VARIANT; j++) mesh.setMatrixAt(j, this.zero);
      mesh.visible = false;
      ctx.scene.add(mesh);
      this.meshes.push(mesh);
      this.iceAttr.push(iceAttr);
      this.hulls.push(hull);
      const free = [];
      for (let j = 13; j >= 0; j--) free.push(j);
      this.free.push(free);
    }
  }
  makeMaterial() {
    const ctx = this.ctx;
    const material = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0,
      flatShading: true,
      envMapIntensity: 1,
    });
    const noise = getNoiseTexture();
    material.onBeforeCompile = (shader) => {
      for (const [key, uniform] of Object.entries(ctx.globals))
        if (!(key in shader.uniforms)) shader.uniforms[key] = uniform;
      shader.uniforms.uIceNoise = {
        value: noise,
      };
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute float aEdge;
attribute vec4 aIce;
varying vec3 vIceLocal;
varying vec3 vIceWorld;
varying vec4 vIceData;
varying float vIceEdge;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vIceLocal = position;
vIceEdge = aEdge;
vIceData = aIce;
{
  vec4 iw = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    iw = instanceMatrix * iw;
  #endif
  vIceWorld = (modelMatrix * iw).xyz;
}`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
#include <wb_common>
uniform sampler2D uIceNoise;
varying vec3 vIceLocal;
varying vec3 vIceWorld;
varying vec4 vIceData;
varying float vIceEdge;
float wbIceFrost;
float wbIceCrack;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{
  vec2 lxz = vIceLocal.xz;
  float seed = vIceData.z;
  float n = texture2D(uIceNoise, lxz * 0.09 + seed).r;
  float n2 = texture2D(uIceNoise, lxz * 0.31 + seed * 2.0).g;
  float n3 = texture2D(uIceNoise, lxz * 0.8 + seed * 5.0).b;
  float isTop = smoothstep(0.18, 0.27, vIceLocal.y);
  float depthK = smoothstep(0.22, -0.24, vIceLocal.y);
  vec3 deep = vec3(0.02, 0.2, 0.32);
  vec3 clearA = vec3(0.05, 0.36, 0.48);
  vec3 clearB = vec3(0.22, 0.66, 0.76);
  vec3 frostC = vec3(0.9, 0.97, 1.0);
  vec3 sideC = mix(vec3(0.3, 0.72, 0.8), deep, depthK);
  float r = length(lxz) / ${FLOE_RADIUS.toFixed(2)};
  // frost: crisp crusty patches that thicken toward the rim + a snowy bevel; the middle stays glassy
  float radial = smoothstep(0.25, 0.95, r);
  float patches = smoothstep(0.6, 0.64, n + (n2 - 0.5) * 0.3 + radial * 0.22);
  float speck = step(0.78, n3) * 0.35;
  float rim = smoothstep(0.55, 1.0, vIceEdge) * (0.8 + 0.2 * n3);
  float frost = clamp(patches * 0.9 + speck * (1.0 - patches) * radial + rim, 0.0, 1.0);
  // glassy interior: deep toward the middle (looking into depth), cloudy veins
  vec3 clear = mix(clearA, clearB, radial * 0.65 + n2 * 0.35);
  // internal fracture planes: sparse thin bright lines
  float fr = texture2D(uIceNoise, lxz * 0.075 + seed * 7.0).a;
  float fracture = smoothstep(0.9, 0.96, fr) * (1.0 - frost);
  clear = mix(clear, vec3(0.8, 0.95, 1.0), fracture * 0.75);
  vec3 topC = mix(clear, frostC, frost);
  // crack lines when breaking up
  float ridge = texture2D(uIceNoise, lxz * 0.16 + seed * 3.1).a;
  float crackAmt = vIceData.x;
  wbIceCrack = crackAmt > 0.0 ? smoothstep(1.0 - crackAmt * 0.55, 1.0 - crackAmt * 0.45, ridge) : 0.0;
  vec3 c = mix(sideC, topC, isTop);
  c = mix(c, vec3(0.03, 0.12, 0.18), wbIceCrack * 0.6);
  // melting: glossier, darker, more water-coloured
  c = mix(c, deep * 1.2, vIceData.w * 0.6);
  diffuseColor.rgb = c;
  wbIceFrost = mix(frost * 0.75 + 0.05, 0.2, 1.0 - isTop) * (1.0 - vIceData.w);
}`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
roughnessFactor = mix(0.08, 0.55, wbIceFrost);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
{
  vec3 vdir = normalize(vViewPosition);
  float fres = pow(1.0 - clamp(dot(normal, vdir), 0.0, 1.0), 3.0);
  float skyL = clamp(wbLuma(uSkyColor) * 1.4, 0.15, 1.2);
  float isTopE = smoothstep(0.18, 0.27, vIceLocal.y);
  // translucent subsurface glow, stronger on the sides and toward the waterline
  vec3 sss = vec3(0.06, 0.42, 0.5) * (0.06 + 0.45 * fres + 0.3 * (1.0 - isTopE)) * skyL;
  totalEmissiveRadiance += sss;
  // glitter: random micro-facets reflecting the sun
  vec3 cellP = floor(vIceWorld * 11.0);
  float h = wbHash13(cellP);
  if (h > 0.9) {
    vec3 wn = normalize(inverseTransformDirection(normal, viewMatrix));
    vec3 jit = vec3(wbHash13(cellP + 1.7), wbHash13(cellP + 3.1), wbHash13(cellP + 5.3)) - 0.5;
    vec3 fn = normalize(wn + jit * 0.9);
    vec3 V = normalize(cameraPosition - vIceWorld);
    vec3 R = reflect(-uSunDir, fn);
    float g = pow(max(dot(R, V), 0.0), 60.0);
    float tw = 0.6 + 0.4 * sin(uTime * 3.0 + h * 90.0);
    totalEmissiveRadiance += uSunColor * g * tw * 5.0 * isTopE * smoothstep(0.0, 0.15, uSunDir.y);
  }
  totalEmissiveRadiance += vec3(0.5, 0.85, 1.0) * wbIceCrack * 0.5;
  totalEmissiveRadiance += vec3(0.8, 0.95, 1.0) * vIceData.y * 1.4;
}`,
        );
    };
    material.customProgramCacheKey = () => 'wb-ice-v1';
    return material;
  }
  get count() {
    return this.floes.length;
  }
  isWater(x, z) {
    try {
      const water = this.ctx.water;
      return water && typeof water.depthAt == 'function'
        ? water.depthAt(x, z) > 0.2
        : this.ctx.terrain.heightAt(x, z) < -0.2;
    } catch {
      return false;
    }
  }
  waterLevel() {
    const level = this.ctx.water?.level;
    return Number.isFinite(level) ? level : 0;
  }
  freeze(pos, radius = FLOE_RADIUS) {
    const elapsed = this.ctx.time.elapsed;
    if (!this.isWater(pos.x, pos.z)) return false;
    const size = clamp(radius, 1.2, 3.4);
    for (const floe of this.floes)
      if (
        floe.state !== 'melt' &&
        floe.state !== 'sink' &&
        Math.hypot(floe.x - pos.x, floe.z - pos.z) < FLOE_RADIUS * floe.scale * 0.55
      ) {
        floe.expire = elapsed + FLOE_LIFETIME + rand(-4, 4);
        floe.state = 'alive';
        floe.stateT = elapsed;
        floe.flash = 1;
        this.fx.frost(floe.x, this.waterLevel(), floe.z, FLOE_RADIUS * floe.scale);
        this.ctx.events.emit('ice:freeze', {
          position: new Vector3(floe.x, this.waterLevel(), floe.z),
        });
        return true;
      }
    this.spawn(pos.x, pos.z, size / FLOE_RADIUS, elapsed);
    if (radius > 3.4) {
      const count = Math.min(6, Math.round(radius / 1.4));
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
        const dist = FLOE_RADIUS * 1.55;
        const x = pos.x + Math.cos(angle) * dist;
        const z = pos.z + Math.sin(angle) * dist;
        if (this.isWater(x, z)) this.spawn(x, z, rand(0.8, 1.05), elapsed + i * 0.05);
      }
    }
    this.fx.frost(pos.x, this.waterLevel(), pos.z, size);
    this.ctx.events.emit('ice:freeze', {
      position: new Vector3(pos.x, this.waterLevel(), pos.z),
    });
    return true;
  }
  spawn(x, z, scale, now) {
    if (this.floes.length >= 41) {
      let oldest = null;
      for (const floe of this.floes) if (floe.state === 'alive' && (!oldest || floe.born < oldest.born)) oldest = floe;
      if (oldest) this.beginSink(oldest, now);
    }
    let variant = (Math.random() * FLOE_VARIANTS) | 0;
    for (let i = 0; i < FLOE_VARIANTS; i++) {
      const v = (variant + i) % FLOE_VARIANTS;
      if (this.free[v].length) {
        variant = v;
        break;
      }
    }
    const slot = this.free[variant].pop();
    if (slot === undefined) return;
    const floe = {
      variant,
      slot,
      x,
      z,
      yaw: Math.random() * Math.PI * 2,
      scale: clamp(scale, 0.55, 1.5),
      seed: Math.random(),
      born: now,
      expire: now + FLOE_LIFETIME + rand(-5, 5),
      state: 'alive',
      stateT: now,
      flash: 1,
      body: null,
      collider: null,
    };
    this.createBody(floe);
    this.floes.push(floe);
    const mesh = this.meshes[variant];
    mesh.count = Math.max(mesh.count, slot + 1);
    mesh.visible = true;
  }
  createBody(floe) {
    const { RAPIER, physics } = this.ctx;
    try {
      const level = this.waterLevel();
      const body = physics.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased()
          .setTranslation(floe.x, level, floe.z)
          .setRotation(this.q.setFromAxisAngle(this.p.set(0, 1, 0), floe.yaw)),
      );
      const hull = this.hulls[floe.variant];
      const points = new Float32Array(hull.length);
      for (let i = 0; i < hull.length; i++) points[i] = hull[i] * floe.scale;
      const desc =
        RAPIER.ColliderDesc.convexHull(points) ?? RAPIER.ColliderDesc.cylinder(0.25, FLOE_RADIUS * floe.scale * 0.9);
      desc
        .setCollisionGroups(COLLISION_GROUPS.ice)
        .setFriction(0.02)
        .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0);
      const collider = physics.createCollider(desc, body);
      this.ctx.colliders.register(collider, {
        kind: 'ice',
        surface: 'ice',
        data: floe,
      });
      floe.body = body;
      floe.collider = collider;
      this.byHandle.set(collider.handle, floe);
    } catch (err) {
      console.warn('[elements] ice collider failed', err);
    }
  }
  removeBody(floe) {
    if (floe.collider) {
      this.byHandle.delete(floe.collider.handle);
      this.ctx.colliders.unregister(floe.collider);
    }
    if (floe.body)
      try {
        this.ctx.physics.removeRigidBody(floe.body);
      } catch {}
    floe.body = null;
    floe.collider = null;
  }
  beginSink(floe, now) {
    if (floe.state !== 'sink' && floe.state !== 'melt') {
      floe.state = 'sink';
      floe.stateT = now;
      this.removeBody(floe);
      this.fx.shards(floe.x, this.waterLevel(), floe.z, FLOE_RADIUS * floe.scale);
    }
  }
  beginMelt(floe, now) {
    if (floe.state === 'melt') return;
    floe.state = 'melt';
    floe.stateT = now;
    this.removeBody(floe);
    const level = this.waterLevel();
    this.fx.steam(floe.x, level + 0.2, floe.z, 1.3 * floe.scale);
    const pos = new Vector3(floe.x, level, floe.z);
    this.ctx.events.emit('ice:melt', {
      position: pos,
    });
    this.ctx.events.emit('element:steam', {
      position: pos.clone(),
    });
  }
  meltAt(pos, radius = 1) {
    const elapsed = this.ctx.time.elapsed;
    let melted = false;
    const level = this.waterLevel();
    if (Math.abs(pos.y - level) > radius + 2) return false;
    for (const floe of this.floes)
      if (
        floe.state !== 'melt' &&
        floe.state !== 'sink' &&
        Math.hypot(floe.x - pos.x, floe.z - pos.z) < FLOE_RADIUS * floe.scale + radius
      ) {
        this.beginMelt(floe, elapsed);
        melted = true;
      }
    return melted;
  }
  meltCollider(handle) {
    if (handle == null) return false;
    const floe = this.byHandle.get(handle);
    if (floe) {
      this.beginMelt(floe, this.ctx.time.elapsed);
      return true;
    } else {
      return false;
    }
  }
  isIceCollider(handle) {
    return handle != null && this.byHandle.has(handle);
  }
  floeAt(x, z) {
    for (const floe of this.floes)
      if (
        (floe.state === 'alive' || floe.state === 'crack') &&
        Math.hypot(floe.x - x, floe.z - z) < FLOE_RADIUS * floe.scale * 0.9
      )
        return true;
    return false;
  }
  update(dt) {
    if (!this.floes.length) return;
    const elapsed = this.ctx.time.elapsed;
    const level = this.waterLevel();
    const dirty = new Uint8Array(FLOE_VARIANTS);
    for (let i = this.floes.length - 1; i >= 0; i--) {
      const floe = this.floes[i];
      let scale = floe.scale;
      let y = level;
      let crack = 0;
      let melt = 0;
      const age = elapsed - floe.born;
      if (age < 0.5) {
        const k = clamp(age / 0.5, 0, 1);
        const ease = 1 + 3.2 * (k - 1) ** 3 + 2.2 * (k - 1) ** 2;
        scale *= 0.25 + 0.75 * ease;
        y -= (1 - k) * 0.25;
      }
      floe.flash = Math.max(0, floe.flash - dt * 1.6);
      if (floe.state === 'alive' && elapsed >= floe.expire) {
        floe.state = 'crack';
        floe.stateT = elapsed;
        this.fx.shards(floe.x, level, floe.z, FLOE_RADIUS * floe.scale * 0.7);
      }
      if (floe.state === 'crack') {
        const k = (elapsed - floe.stateT) / CRACK_TIME;
        crack = clamp(k * 1.2, 0, 1);
        if (k >= 1) this.beginSink(floe, elapsed);
      } else if (floe.state === 'sink') {
        const k = clamp((elapsed - floe.stateT) / SINK_TIME, 0, 1);
        crack = 1;
        scale *= 1 - 0.45 * k;
        y -= k * k * 0.75;
        melt = k * 0.5;
        if (k >= 1) {
          this.release(floe, i);
          dirty[floe.variant] = 1;
          continue;
        }
      } else if (floe.state === 'melt') {
        const k = clamp((elapsed - floe.stateT) / MELT_TIME, 0, 1);
        scale *= 1 - 0.8 * k;
        y -= k * 0.35;
        melt = 0.3 + k * 0.7;
        if (k >= 1) {
          this.release(floe, i);
          dirty[floe.variant] = 1;
          continue;
        }
      }
      const phase = floe.seed * 20;
      y += Math.sin(elapsed * 1.25 + phase) * 0.025;
      const pitch =
        Math.sin(elapsed * 0.83 + phase * 1.3) * 0.012 +
        (floe.state === 'crack' ? Math.sin(elapsed * 37) * 0.01 * crack : 0);
      const roll = Math.cos(elapsed * 0.97 + phase * 0.7) * 0.012;
      this.e.set(pitch, floe.yaw, roll, 'YXZ');
      this.q.setFromEuler(this.e);
      this.p.set(floe.x, y, floe.z);
      if (floe.body && (floe.state === 'alive' || floe.state === 'crack')) {
        floe.body.setNextKinematicTranslation(this.p);
        floe.body.setNextKinematicRotation(this.q);
      }
      this.sc.set(scale, floe.state === 'melt' ? scale * 0.8 : scale, scale);
      this.m.compose(this.p, this.q, this.sc);
      this.meshes[floe.variant].setMatrixAt(floe.slot, this.m);
      this.iceAttr[floe.variant].setXYZW(floe.slot, crack, floe.flash, floe.seed * 10, melt);
      dirty[floe.variant] = 1;
    }
    for (let i = 0; i < FLOE_VARIANTS; i++)
      if (dirty[i]) {
        this.meshes[i].instanceMatrix.needsUpdate = true;
        this.iceAttr[i].needsUpdate = true;
      }
  }
  release(floe, index) {
    this.removeBody(floe);
    const mesh = this.meshes[floe.variant];
    mesh.setMatrixAt(floe.slot, this.zero);
    this.free[floe.variant].push(floe.slot);
    this.floes.splice(index, 1);
    let maxSlot = -1;
    for (const floe2 of this.floes) if (floe2.variant === floe.variant && floe2.slot > maxSlot) maxSlot = floe2.slot;
    mesh.count = maxSlot + 1;
    mesh.visible = mesh.count > 0;
  }
}
