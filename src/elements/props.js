/**
 * Paintable physics props (crate, barrel, boulder, ball): red sets wood alight and makes stone red-hot, blue frosts them and makes them slippery, yellow makes them bouncy, green sprouts grass tufts, and water floats wood and puts fires out.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLLISION_GROUPS, GRAVITY_Y, PALETTE } from '../core/config.js';
import { clamp, makeNoise3D } from '../core/math.js';
import { getNoiseTexture, hash, rand } from './util.js';
const PROP_KINDS = ['crate', 'barrel', 'boulder', 'ball'];
const SLOTS_PER_KIND = 24;
const MAX_PROPS = 48;
const MAX_TUFTS = 200;
const PROP_DEFS = {
  crate: {
    wooden: true,
    half: 0.52,
    radius: 0.74,
    friction: 0.7,
    restitution: 0.12,
    density: 0.6,
    burnTime: 6.5,
  },
  barrel: {
    wooden: true,
    half: 0.56,
    radius: 0.72,
    friction: 0.65,
    restitution: 0.15,
    density: 0.55,
    burnTime: 7.5,
  },
  boulder: {
    wooden: false,
    half: 0.72,
    radius: 0.9,
    friction: 0.85,
    restitution: 0.08,
    density: 2.4,
    burnTime: 0,
  },
  ball: {
    wooden: false,
    half: 0.62,
    radius: 0.62,
    friction: 0.6,
    restitution: 0.3,
    density: 2.2,
    burnTime: 0,
  },
};
function colorize(geometry, color) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  geo.deleteAttribute('uv');
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const position = geo.getAttribute('position');
  const normal = geo.getAttribute('normal');
  const colors = new Float32Array(position.count * 3);
  const p = new Vector3();
  const nrm = new Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    nrm.fromBufferAttribute(normal, i);
    const c = typeof color == 'function' ? color(p, nrm) : color;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  return geo;
}
function hexColor(hex) {
  return new Color(hex);
}
function makeCrateGeometry() {
  const parts = [];
  const plank = hexColor(13081186);
  const frame = hexColor(8410415);
  parts.push(colorize(new RoundedBoxGeometry(0.94, 0.94, 0.94, 2, 0.05), plank));
  const bar = 0.14;
  const len = 1.04;
  const off = 0.45;
  for (const [u, v] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    parts.push(colorize(new RoundedBoxGeometry(len, bar, bar, 1, 0.03).translate(0, v * off, u * off), frame));
    parts.push(colorize(new RoundedBoxGeometry(bar, len, bar, 1, 0.03).translate(u * off, 0, v * off), frame));
    parts.push(colorize(new RoundedBoxGeometry(bar, bar, len, 1, 0.03).translate(u * off, v * off, 0), frame));
  }
  const braceLen = Math.SQRT2 * 0.86;
  for (let i = 0; i < 4; i++) {
    const brace = new RoundedBoxGeometry(braceLen, 0.13, 0.07, 1, 0.025);
    brace.rotateZ((Math.PI / 4) * (i % 2 ? 1 : -1));
    brace.translate(0, 0, 0.485);
    brace.rotateY((i * Math.PI) / 2);
    parts.push(colorize(brace, frame));
  }
  const geo = mergeGeometries(parts);
  geo.computeBoundingSphere();
  return geo;
}
function makeBarrelGeometry() {
  const parts = [];
  const wood = hexColor(11565637);
  const darkWood = hexColor(9067059);
  const iron = hexColor(4868688);
  const profile = [];
  const halfHeight = 0.55;
  for (let i = 0; i <= 12; i++) {
    const y = -0.55 + (i / 12) * 2 * halfHeight;
    profile.push(new Vector2(0.4 + 0.075 * Math.cos((y / halfHeight) * (Math.PI / 2)), y));
  }
  parts.push(colorize(new LatheGeometry(profile, 20), wood));
  const lid = new CircleGeometry(0.4, 20);
  parts.push(
    colorize(
      lid
        .clone()
        .rotateX(-Math.PI / 2)
        .translate(0, 0.52, 0),
      darkWood,
    ),
  );
  parts.push(
    colorize(
      lid
        .clone()
        .rotateX(Math.PI / 2)
        .translate(0, -0.52, 0),
      darkWood,
    ),
  );
  const hoop = (y, radius) => {
    const pts = [
      new Vector2(radius + 0.012, y - 0.045),
      new Vector2(radius + 0.028, y - 0.03),
      new Vector2(radius + 0.028, y + 0.03),
      new Vector2(radius + 0.012, y + 0.045),
    ];
    return colorize(new LatheGeometry(pts, 20), iron);
  };
  const radiusAt = (y) => 0.4 + 0.075 * Math.cos((y / halfHeight) * (Math.PI / 2));
  for (const y of [-0.46, -0.26, 0.26, 0.46]) parts.push(hoop(y, radiusAt(y)));
  const rim = (y, dir) =>
    colorize(
      new LatheGeometry(
        [
          new Vector2(0.36, y),
          new Vector2(0.41, y),
          new Vector2(0.41, y + dir * 0.05),
          new Vector2(0.36, y + dir * 0.05),
        ],
        20,
      ),
      darkWood,
    );
  parts.push(rim(0.52, 1));
  parts.push(rim(-0.52, -1));
  const geo = mergeGeometries(parts);
  geo.computeBoundingSphere();
  return geo;
}
function makeBoulderGeometry() {
  let geometry = new IcosahedronGeometry(0.85, 1);
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry);
  const noise3D = makeNoise3D('boulder');
  const position = geometry.getAttribute('position');
  const v = new Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    const bump = 1 + noise3D(v.x * 1.3, v.y * 1.3, v.z * 1.3) * 0.2 + noise3D(v.x * 3, v.y * 3, v.z * 3) * 0.06;
    v.multiplyScalar(bump);
    v.y *= 0.84;
    if (v.y < -0.55) v.y = -0.55 + (v.y + 0.55) * 0.4;
    position.setXYZ(i, v.x, v.y, v.z);
  }
  const hull = new Float32Array(position.array);
  const faceted = geometry.toNonIndexed();
  faceted.computeVertexNormals();
  const stone = hexColor(9800832);
  const under = hexColor(8024976);
  const moss = hexColor(8359768);
  const color = new Color();
  return {
    geo: colorize(faceted, (p, nrm) => {
      const grain = hash(Math.floor(p.x * 7) * 31 + Math.floor(p.y * 7) * 17 + Math.floor(p.z * 7));
      color.copy(stone).multiplyScalar(0.88 + grain * 0.2);
      if (nrm.y < -0.2) color.lerp(under, clamp(-nrm.y, 0, 1) * 0.55);
      if (nrm.y > 0.55) color.lerp(moss, (nrm.y - 0.55) * 0.9);
      return color;
    }),
    hull,
  };
}
function makeBallGeometry() {
  return colorize(new SphereGeometry(0.62, 30, 20), hexColor(10721932));
}
function makeTuftGeometry() {
  const positions = [];
  const colors = [];
  const rootCol = hexColor(3107626);
  const midCol = hexColor(5216826);
  const tipCol = hexColor(10474598);
  const vert = (p, c) => {
    positions.push(p.x, p.y, p.z);
    colors.push(c.r, c.g, c.b);
  };
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2 + (i % 2) * 0.3;
    const tilt = 0.5 + (i % 3) * 0.18;
    const len = 0.3 + (i % 2) * 0.12;
    const dir = new Vector3(Math.cos(angle) * Math.sin(tilt), Math.cos(tilt), Math.sin(angle) * Math.sin(tilt));
    const side = new Vector3(-Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(0.07);
    const root = new Vector3(0, 0, 0);
    const mid = dir
      .clone()
      .multiplyScalar(len * 0.5)
      .add(new Vector3(0, len * 0.08, 0));
    const tip = dir
      .clone()
      .multiplyScalar(len)
      .add(new Vector3(Math.cos(angle), -0.3, Math.sin(angle)).multiplyScalar(len * 0.25));
    const left = mid.clone().add(side);
    const right = mid.clone().sub(side);
    vert(root, rootCol);
    vert(left, midCol);
    vert(right, midCol);
    vert(left, midCol);
    vert(tip, tipCol);
    vert(right, midCol);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
export class Props {
  ctx;
  fx;
  flames;
  fire;
  ice;
  meshes = {};
  coatAttr = {};
  fxAttr = {};
  freeSlots = {};
  props = [];
  byHandle = new Map();
  tuftMesh;
  tuftFree = [];
  flameFree = [];
  boulderHull = new Float32Array();
  nextId = 1;
  m = new Matrix4();
  m2 = new Matrix4();
  q = new Quaternion();
  p = new Vector3();
  v = new Vector3();
  s = new Vector3();
  zero = new Matrix4().makeScale(0, 0, 0);
  sample = {
    red: 0,
    blue: 0,
    yellow: 0,
    green: 0,
  };
  heatList = [];
  constructor(ctx, fx, flames, fire, ice) {
    this.ctx = ctx;
    this.fx = fx;
    this.flames = flames;
    this.fire = fire;
    this.ice = ice;
    const geos = {
      crate: makeCrateGeometry(),
      barrel: makeBarrelGeometry(),
      boulder: (() => {
        const boulder = makeBoulderGeometry();
        this.boulderHull = boulder.hull;
        return boulder.geo;
      })(),
      ball: makeBallGeometry(),
    };
    PROP_KINDS.forEach((kind, kindIndex) => {
      const geo = geos[kind];
      const coatAttr = new InstancedBufferAttribute(new Float32Array(96), 4);
      const fxAttr = new InstancedBufferAttribute(new Float32Array(96), 4);
      coatAttr.setUsage(DynamicDrawUsage);
      fxAttr.setUsage(DynamicDrawUsage);
      geo.setAttribute('aCoat', coatAttr);
      geo.setAttribute('aFx', fxAttr);
      const material = this.makeMaterial(kindIndex, PROP_DEFS[kind].wooden);
      const mesh = new InstancedMesh(geo, material, SLOTS_PER_KIND);
      mesh.name = `elements-prop-${kind}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      for (let i = 0; i < SLOTS_PER_KIND; i++) mesh.setMatrixAt(i, this.zero);
      mesh.count = 0;
      mesh.visible = false;
      ctx.scene.add(mesh);
      this.meshes[kind] = mesh;
      this.coatAttr[kind] = coatAttr;
      this.fxAttr[kind] = fxAttr;
      const free = [];
      for (let i = 23; i >= 0; i--) free.push(i);
      this.freeSlots[kind] = free;
    });
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.65,
      side: DoubleSide,
    });
    this.tuftMesh = new InstancedMesh(makeTuftGeometry(), material, MAX_TUFTS);
    this.tuftMesh.name = 'elements-prop-tufts';
    this.tuftMesh.castShadow = true;
    this.tuftMesh.frustumCulled = false;
    this.tuftMesh.count = 0;
    this.tuftMesh.visible = false;
    this.tuftMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (let i = 0; i < MAX_TUFTS; i++) this.tuftMesh.setMatrixAt(i, this.zero);
    for (let i = 199; i >= 0; i--) this.tuftFree.push(i);
    ctx.scene.add(this.tuftMesh);
    for (let i = flames.propSlots - 1; i >= 0; i--) this.flameFree.push(i);
    fire.heatSources = () => this.heatSources();
  }
  makeMaterial(kindIndex, wooden) {
    const ctx = this.ctx;
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: wooden ? 0.78 : 0.88,
      metalness: 0,
      flatShading: kindIndex === 2,
    });
    const noise = getNoiseTexture();
    material.onBeforeCompile = (shader) => {
      for (const [key, uniform] of Object.entries(ctx.globals))
        if (!(key in shader.uniforms)) shader.uniforms[key] = uniform;
      shader.uniforms.uPropNoise = {
        value: noise,
      };
      shader.defines = shader.defines ?? {};
      shader.defines.PROP_KIND = kindIndex;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec4 aCoat;
attribute vec4 aFx;
varying vec3 vPropLocal;
varying vec4 vPropCoat;
varying vec4 vPropFx;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vPropLocal = position;
vPropCoat = aCoat;
vPropFx = aFx;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
#include <wb_common>
uniform sampler2D uPropNoise;
varying vec3 vPropLocal;
varying vec4 vPropCoat;
varying vec4 vPropFx;
float wbPropN;
float wbPropCoatMask;`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
{
  vec3 lp = vPropLocal;
  float seed = vPropFx.w;
  float n = texture2D(uPropNoise, vec2(lp.x + lp.z, lp.y) * 0.35 + seed).r;
  wbPropN = n;
#if PROP_KIND == 0 || PROP_KIND == 1
  // wood: grain streaks + plank / stave grooves
  float grain = texture2D(uPropNoise, vec2((lp.x + lp.z) * 0.25 + seed, lp.y * 2.4)).g;
  diffuseColor.rgb *= 0.8 + 0.4 * grain;
  float bright = dot(diffuseColor.rgb, vec3(0.33));
  #if PROP_KIND == 0
    vec3 al = abs(lp);
    float onSideX = step(0.455, al.x) * step(al.x, 0.49);
    float onSideZ = step(0.455, al.z) * step(al.z, 0.49);
    float g = abs(fract((lp.y + 0.5) * 3.0) - 0.5);
    float grooveY = 1.0 - smoothstep(0.44, 0.47, g);
    float gt = abs(fract((lp.x + 0.5) * 3.0) - 0.5);
    float grooveTop = (1.0 - smoothstep(0.44, 0.47, gt)) * step(0.455, al.y);
    diffuseColor.rgb *= 1.0 - 0.35 * max(max(onSideX, onSideZ) * (1.0 - grooveY), grooveTop);
  #else
    float ang = atan(lp.z, lp.x);
    float st = abs(fract(ang / 6.2831853 * 16.0) - 0.5);
    float stave = smoothstep(0.43, 0.49, st) * step(abs(lp.y), 0.53) * step(0.2, bright);
    diffuseColor.rgb *= 1.0 - 0.3 * stave;
  #endif
#else
  // stone: speckles, and carved grooves on the ball
  float sp = texture2D(uPropNoise, lp.xz * 1.3 + lp.y * 0.7 + seed).g;
  diffuseColor.rgb *= 0.84 + 0.3 * sp;
  #if PROP_KIND == 3
    float gr = min(abs(lp.y), min(abs(lp.x), abs(lp.x * 0.5 + lp.z * 0.866)));
    float groove = 1.0 - smoothstep(0.028, 0.05, gr);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.3, 0.28, 0.34), groove * 0.8);
  #endif
#endif
#if PROP_KIND >= 2
  // red-hot stone turns dark basalt around its glowing cracks
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.055, 0.05), clamp(vPropFx.y * 1.2, 0.0, 0.9));
#endif
  // paint coat (painterly edge that grows in)
  float cn = texture2D(uPropNoise, vec2(lp.x - lp.z, lp.y + lp.z) * 0.6 + seed * 3.0).r;
  wbPropCoatMask = smoothstep(0.0, 0.12, vPropCoat.a * 1.25 - cn * 0.45);
#if PROP_KIND >= 2
  wbPropCoatMask *= 1.0 - clamp(vPropFx.y * 1.4, 0.0, 0.85);
#endif
  diffuseColor.rgb = mix(diffuseColor.rgb, vPropCoat.rgb, wbPropCoatMask * 0.92);
  // char from burning
  float ch = vPropFx.x;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.045, 0.035, 0.03), clamp(ch * (0.75 + 0.5 * n), 0.0, 1.0));
  // frost crystals
  float fr = vPropFx.z * smoothstep(0.35, 0.7, texture2D(uPropNoise, lp.xz * 1.7 + lp.y + seed).a + 0.3);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.85, 0.95, 1.0), fr * 0.18);
}`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.42, wbPropCoatMask);
roughnessFactor = mix(roughnessFactor, 0.3, vPropFx.z);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
{
  vec3 lp = vPropLocal;
  float hot = vPropFx.y;
  if (hot > 0.001) {
    // thin crack network from two projections of the ridge noise
    float r1 = texture2D(uPropNoise, lp.xz * 1.1 + vPropFx.w).a;
    float r2 = texture2D(uPropNoise, lp.xy * 1.1 + vPropFx.w * 1.7 + 0.37).a;
    float r3 = texture2D(uPropNoise, lp.zy * 1.1 + vPropFx.w * 2.3 + 0.71).a;
    float ridge = max(r1, max(r2, r3));
    float crack = smoothstep(0.8, 0.96, ridge);
    float fl = 0.8 + 0.2 * sin(uTime * 6.0 + vPropFx.w * 30.0 + lp.y * 5.0);
    vec3 glow = mix(vec3(1.0, 0.16, 0.02), vec3(1.0, 0.42, 0.07), crack);
    totalEmissiveRadiance += glow * hot * (0.06 + 1.15 * crack) * fl;
  }
  totalEmissiveRadiance += vPropCoat.rgb * wbPropCoatMask * 0.14 * (1.0 - vPropFx.x);
}`,
        );
    };
    material.customProgramCacheKey = () => `wb-prop-${kindIndex}`;
    try {
      this.ctx.paint?.patchMaterial?.(material, {
        paint: true,
        vitality: true,
      });
    } catch (err) {
      console.warn('[elements] paint.patchMaterial failed for props', err);
    }
    return material;
  }
  get count() {
    return this.props.length;
  }
  spawn(kind, pos) {
    if (!PROP_DEFS[kind]) return null;
    if (this.props.length >= MAX_PROPS) {
      const oldest = this.props.reduce((a, b) => (a.born < b.born ? a : b));
      this.remove(oldest);
    }
    const slot = this.freeSlots[kind].pop();
    if (slot === undefined) return null;
    const info = PROP_DEFS[kind];
    const { RAPIER, physics } = this.ctx;
    let y = pos.y;
    try {
      const ground = this.ctx.terrain.heightAt(pos.x, pos.z);
      if (Number.isFinite(ground) && y < ground + info.half + 0.05) y = ground + info.half + 0.05;
    } catch {}
    const yaw = Math.random() * Math.PI * 2;
    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(pos.x, y, pos.z)
        .setRotation(this.q.setFromAxisAngle(this.v.set(0, 1, 0), yaw))
        .setLinearDamping(0.08)
        .setAngularDamping(kind === 'ball' ? 0.18 : 0.35)
        .setCcdEnabled(kind === 'ball'),
    );
    let desc;
    switch (kind) {
      case 'crate':
        desc = RAPIER.ColliderDesc.roundCuboid(0.48, 0.48, 0.48, 0.04);
        break;
      case 'barrel':
        desc = RAPIER.ColliderDesc.cylinder(0.55, 0.46);
        break;
      case 'boulder':
        desc = RAPIER.ColliderDesc.convexHull(this.boulderHull) ?? RAPIER.ColliderDesc.ball(0.8);
        break;
      default:
        desc = RAPIER.ColliderDesc.ball(0.62);
    }
    desc
      .setCollisionGroups(COLLISION_GROUPS.prop)
      .setDensity(info.density)
      .setFriction(info.friction)
      .setRestitution(info.restitution)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const collider = physics.createCollider(desc, body);
    const mesh = this.meshes[kind];
    const prop = {
      id: this.nextId++,
      kind,
      info,
      slot,
      body,
      collider,
      coat: null,
      coatAmt: 0,
      coatCol: new Color(),
      burning: false,
      burnStart: 0,
      burnEnd: 0,
      char: 0,
      hot: 0,
      frost: 0,
      tufts: [],
      flameSlots: [],
      prevVel: new Vector3(),
      lastImpact: 0,
      groundPaint: null,
      paintCheck: Math.random() * 0.2,
      dying: 0,
      born: this.ctx.time.elapsed,
      seed: Math.random() * 10,
      inWater: false,
      frictionNow: info.friction,
      restNow: info.restitution,
    };
    this.ctx.colliders.register(collider, {
      kind: 'prop',
      dynamic: true,
      surface: info.wooden ? 'wood' : 'stone',
      flammable: info.wooden,
      object: mesh,
      data: prop,
    });
    this.byHandle.set(collider.handle, prop);
    this.props.push(prop);
    mesh.count = Math.max(mesh.count, slot + 1);
    mesh.visible = true;
    this.fxAttr[kind].setXYZW(slot, 0, 0, 0, prop.seed);
    this.coatAttr[kind].setXYZW(slot, 0, 0, 0, 0);
    this.fxAttr[kind].needsUpdate = true;
    this.coatAttr[kind].needsUpdate = true;
    return prop;
  }
  remove(prop) {
    const index = this.props.indexOf(prop);
    if (index >= 0) this.props.splice(index, 1);
    this.byHandle.delete(prop.collider.handle);
    this.ctx.colliders.unregister(prop.collider);
    try {
      this.ctx.physics.removeRigidBody(prop.body);
    } catch {}
    const mesh = this.meshes[prop.kind];
    mesh.setMatrixAt(prop.slot, this.zero);
    mesh.instanceMatrix.needsUpdate = true;
    this.freeSlots[prop.kind].push(prop.slot);
    let maxSlot = -1;
    for (const other of this.props) if (other.kind === prop.kind && other.slot > maxSlot) maxSlot = other.slot;
    mesh.count = maxSlot + 1;
    mesh.visible = mesh.count > 0;
    for (const tuft of prop.tufts) {
      this.tuftMesh.setMatrixAt(tuft.slot, this.zero);
      this.tuftFree.push(tuft.slot);
    }
    this.tuftMesh.instanceMatrix.needsUpdate = true;
    prop.tufts.length = 0;
    this.releaseFlames(prop);
  }
  releaseFlames(prop) {
    for (const flameSlot of prop.flameSlots) {
      this.flames.clearPropFlame(flameSlot);
      this.flameFree.push(flameSlot);
    }
    prop.flameSlots.length = 0;
  }
  byCollider(handle) {
    return handle == null ? undefined : this.byHandle.get(handle);
  }
  near(pos, radius, out = []) {
    out.length = 0;
    for (const prop of this.props) {
      if (prop.dying) continue;
      const p = prop.body.translation();
      const dx = p.x - pos.x;
      const dy = p.y - pos.y;
      const dz = p.z - pos.z;
      const reach = radius + prop.info.radius;
      if (dx * dx + dy * dy + dz * dz < reach * reach) out.push(prop);
    }
    return out;
  }
  applyPaint(prop, color, point, normal) {
    const elapsed = this.ctx.time.elapsed;
    const pos = prop.body.translation();
    this.p.set(pos.x, pos.y, pos.z);
    if (normal) {
      const mass = prop.body.mass();
      this.v.copy(normal).multiplyScalar(-mass * 1.4);
      this.v.y = Math.max(this.v.y, 0) + mass * 0.6;
      prop.body.applyImpulse(this.v, true);
    }
    const coat = prop.coat;
    if (
      (color === 'red' && (coat === 'blue' || prop.frost > 0.3)) ||
      (color === 'blue' && (coat === 'red' || prop.burning || prop.hot > 0.2))
    ) {
      this.fx.steam(pos.x, pos.y + 0.3, pos.z, 1);
      this.ctx.events.emit('element:steam', {
        position: this.p.clone(),
      });
      if (prop.burning) this.extinguishProp(prop, false);
      prop.hot = 0;
      prop.frost = 0;
      prop.coat = null;
      prop.coatAmt = 0;
      this.applySurface(prop);
      return;
    }
    prop.coat = color;
    prop.coatCol.setHex(PALETTE[color].hex);
    prop.coatAmt = Math.max(prop.coatAmt, 0.001);
    switch (color) {
      case 'red':
        if (prop.info.wooden) this.igniteProp(prop);
        else {
          prop.hot = 1;
          this.fx.sparks(pos.x, pos.y + 0.4, pos.z, 16, 0.8);
        }
        prop.frost = 0;
        break;
      case 'blue':
        prop.frost = 1;
        break;
      case 'green':
        this.sprout(prop, elapsed);
    }
    this.applySurface(prop);
  }
  igniteProp(prop) {
    if (!prop.info.wooden || prop.burning || prop.dying || prop.inWater) return false;
    const elapsed = this.ctx.time.elapsed;
    prop.burning = true;
    prop.burnStart = elapsed;
    prop.burnEnd = elapsed + prop.info.burnTime * rand(0.9, 1.1);
    prop.kind;
    for (let i = 0; i < 3; i++) {
      const slot = this.flameFree.pop();
      if (slot !== undefined) prop.flameSlots.push(slot);
    }
    const pos = prop.body.translation();
    this.p.set(pos.x, pos.y, pos.z);
    this.fx.ignition(pos.x, pos.y, pos.z, 0.7);
    this.ctx.events.emit('fire:ignite', {
      position: this.p.clone(),
    });
    return true;
  }
  extinguishProp(prop, withSteam = true) {
    if (!prop.burning && prop.hot < 0.05) return;
    const pos = prop.body.translation();
    prop.burning = false;
    prop.hot = 0;
    this.releaseFlames(prop);
    if (withSteam) {
      this.fx.steam(pos.x, pos.y + 0.3, pos.z, 0.8);
      this.ctx.events.emit('element:steam', {
        position: new Vector3(pos.x, pos.y, pos.z),
      });
    }
    this.ctx.events.emit('fire:extinguish', {
      position: new Vector3(pos.x, pos.y, pos.z),
    });
  }
  igniteNear(pos, radius) {
    let any = false;
    for (const prop of this.near(pos, radius, [])) if (this.igniteProp(prop)) any = true;
    return any;
  }
  extinguishNear(pos, radius) {
    let any = false;
    for (const prop of this.near(pos, radius, []))
      if (prop.burning || prop.hot > 0.05) {
        this.extinguishProp(prop);
        any = true;
      }
    return any;
  }
  isBurningNear(pos, radius) {
    for (const prop of this.near(pos, radius, [])) if (prop.burning) return true;
    return false;
  }
  sprout(prop, now) {
    const count = (prop.kind === 'boulder' ? 8 : 7) - prop.tufts.length;
    for (let i = 0; i < count; i++) {
      const slot = this.tuftFree.pop();
      if (slot === undefined) break;
      const angle = Math.random() * Math.PI * 2;
      const y = rand(-0.15, 1);
      const dir = new Vector3(
        Math.cos(angle) * Math.sqrt(1 - y * y),
        y,
        Math.sin(angle) * Math.sqrt(1 - y * y),
      ).normalize();
      const point = this.surfacePoint(prop.kind, dir);
      const rot = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir);
      rot.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.random() * 6.28));
      const local = new Matrix4().compose(point.addScaledVector(dir, -0.02), rot, new Vector3(1, 1, 1));
      prop.tufts.push({
        slot,
        local,
        grow: 0,
        delay: now + i * 0.07,
        size: rand(0.8, 1.35),
      });
      this.tuftMesh.count = Math.max(this.tuftMesh.count, slot + 1);
    }
    this.tuftMesh.visible = true;
    const pos = prop.body.translation();
    this.fx.bloom(pos.x, pos.y, pos.z, prop.info.radius);
  }
  surfacePoint(kind, dir) {
    switch (kind) {
      case 'crate': {
        const maxAxis = Math.max(Math.abs(dir.x), Math.abs(dir.y), Math.abs(dir.z));
        return dir.clone().multiplyScalar(0.52 / maxAxis);
      }
      case 'barrel': {
        const dist = Math.hypot(dir.x, dir.z);
        const toSide = dist > 0.001 ? 0.47 / dist : Infinity;
        const toCap = Math.abs(dir.y) > 0.001 ? 0.56 / Math.abs(dir.y) : Infinity;
        return dir.clone().multiplyScalar(Math.min(toSide, toCap));
      }
      case 'boulder':
        return dir
          .clone()
          .multiplyScalar(0.78)
          .setY(dir.y * 0.66);
      default:
        return dir.clone().multiplyScalar(0.62);
    }
  }
  applySurface(prop) {
    const { RAPIER } = this.ctx;
    const coat = prop.coat;
    const groundPaint = prop.groundPaint;
    let friction = prop.info.friction;
    let restitution = prop.info.restitution;
    if (coat === 'blue' || groundPaint === 'blue') friction = 0.015;
    if (coat === 'yellow' || groundPaint === 'yellow') restitution = 0.88;
    if (friction !== prop.frictionNow) {
      prop.collider.setFriction(friction);
      prop.collider.setFrictionCombineRule(
        friction < 0.1 ? RAPIER.CoefficientCombineRule.Min : RAPIER.CoefficientCombineRule.Average,
      );
      prop.frictionNow = friction;
      prop.body.wakeUp();
    }
    if (restitution !== prop.restNow) {
      prop.collider.setRestitution(restitution);
      prop.collider.setRestitutionCombineRule(
        restitution > 0.5 ? RAPIER.CoefficientCombineRule.Max : RAPIER.CoefficientCombineRule.Average,
      );
      prop.restNow = restitution;
    }
  }
  heatSources() {
    const heatList = this.heatList;
    heatList.length = 0;
    for (const prop of this.props) {
      if (prop.dying || (!prop.burning && prop.hot < 0.3)) continue;
      const pos = prop.body.translation();
      heatList.push({
        x: pos.x,
        y: pos.y - prop.info.half,
        z: pos.z,
        amount: prop.burning ? 1.1 : prop.hot * 0.9,
        radius: prop.burning ? 1.3 : 0.9,
      });
    }
    return heatList;
  }
  update(dt) {
    if (dt <= 0) return;
    const level = this.ctx.water?.level ?? 0;
    for (const prop of this.props) {
      const vel = prop.body.linvel();
      prop.prevVel.set(vel.x, vel.y, vel.z);
      if (prop.body.isSleeping()) continue;
      const pos = prop.body.translation();
      const bottom = pos.y - prop.info.half;
      if (bottom < level) {
        let depth = 0;
        try {
          depth = this.ctx.water?.depthAt?.(pos.x, pos.z) ?? 0;
        } catch {
          depth = 0;
        }
        if (depth > 0.15) {
          const submerged = clamp((level - bottom) / (prop.info.half * 2), 0, 1);
          const mass = prop.body.mass();
          const buoyancy = prop.info.wooden ? -GRAVITY_Y * 1.9 * submerged : -GRAVITY_Y * 0.25 * submerged;
          const drag = 1.8 * submerged;
          this.v.set(-vel.x * drag * mass * dt, (buoyancy - vel.y * drag) * mass * dt, -vel.z * drag * mass * dt);
          prop.body.applyImpulse(this.v, true);
          const spin = prop.body.angvel();
          prop.body.setAngvel(
            {
              x: spin.x * (1 - 1.5 * submerged * dt),
              y: spin.y * (1 - 1.5 * submerged * dt),
              z: spin.z * (1 - 1.5 * submerged * dt),
            },
            false,
          );
          if (!prop.inWater) {
            prop.inWater = true;
            if (prop.burning || prop.hot > 0.2) this.extinguishProp(prop);
          }
          continue;
        }
      }
      prop.inWater = false;
    }
  }
  lateUpdate(dt) {
    if (!this.props.length) {
      this.flames.flushProps();
      return;
    }
    const elapsed = this.ctx.time.elapsed;
    const dirty = new Set();
    let tuftsDirty = false;
    for (let i = this.props.length - 1; i >= 0; i--) {
      const prop = this.props[i];
      const pos = prop.body.translation();
      const rot = prop.body.rotation();
      if (pos.y < -45) {
        this.remove(prop);
        dirty.add(prop.kind);
        continue;
      }
      const asleep = prop.body.isSleeping();
      if (dt > 0 && !asleep) {
        const vel = prop.body.linvel();
        const dvx = vel.x - prop.prevVel.x;
        const dvy = vel.y - prop.prevVel.y - GRAVITY_Y * dt;
        const dvz = vel.z - prop.prevVel.z;
        const impact = Math.sqrt(dvx * dvx + dvy * dvy + dvz * dvz);
        if (
          impact > 3 &&
          elapsed - prop.lastImpact > 0.14 &&
          ((prop.lastImpact = elapsed),
          this.p.set(pos.x, pos.y - prop.info.half * 0.6, pos.z),
          this.ctx.events.emit('prop:impact', {
            position: this.p.clone(),
            kind: prop.kind,
            strength: impact,
          }),
          prop.hot > 0.4 &&
            this.fx.sparks(pos.x, pos.y - prop.info.half * 0.8, pos.z, Math.min(30, Math.round(impact * 3)), 0.7),
          (prop.coat === 'yellow' || prop.groundPaint === 'yellow') && prop.prevVel.y < -3.2 && dvy > 2)
        ) {
          const bounce = Math.min(15, -prop.prevVel.y * 0.94);
          if (vel.y < bounce)
            prop.body.setLinvel(
              {
                x: vel.x,
                y: bounce,
                z: vel.z,
              },
              true,
            );
        }
      }
      prop.paintCheck -= dt;
      if (prop.paintCheck <= 0 && !asleep) {
        prop.paintCheck = 0.1;
        let ground = null;
        try {
          if (this.ctx.paint && !this.ctx.paint.isStub) {
            this.p.set(pos.x, pos.y - prop.info.half - 0.15, pos.z);
            const sample = this.ctx.paint.sample(this.p, this.sample);
            if (sample.yellow > 0.35 && sample.yellow >= sample.blue) ground = 'yellow';
            else if (sample.blue > 0.35) ground = 'blue';
          }
        } catch {
          ground = null;
        }
        if (ground !== prop.groundPaint) {
          prop.groundPaint = ground;
          this.applySurface(prop);
        }
      }
      if (prop.coat) prop.coatAmt = Math.min(1, prop.coatAmt + dt * 3);
      if (prop.hot > 0) {
        prop.hot = Math.max(0, prop.hot - dt / 22);
        if (prop.hot > 0.3) {
          this.p.set(pos.x, pos.y - prop.info.half * 0.5, pos.z);
          if (this.ice.meltAt(this.p, prop.info.radius * 0.6)) prop.hot = Math.max(0, prop.hot - 0.35);
          if (Math.random() < dt * 1.2)
            this.fx.glows.spawn(
              pos.x,
              pos.y + prop.info.half * 0.5,
              pos.z,
              Math.random() - 0.5,
              1.5,
              Math.random() - 0.5,
              1.2,
              0.04,
              0.8,
              1,
              1,
              0.5,
              0.15,
              3,
              0.4,
              14,
              0.5,
              1,
            );
        }
        if (prop.hot <= 0 && prop.coat === 'red') prop.coat = null;
      }
      if (prop.frost > 0 && prop.coat !== 'blue') prop.frost = Math.max(0, prop.frost - dt / 4);
      if (prop.burning) {
        const progress = (elapsed - prop.burnStart) / (prop.burnEnd - prop.burnStart);
        prop.char = Math.min(1, Math.max(prop.char, progress * 1.1));
        if (progress >= 1 && !prop.dying) {
          prop.dying = elapsed;
          this.releaseFlames(prop);
          this.fx.emberPuff(pos.x, pos.y, pos.z, 1);
          this.p.set(pos.x, pos.y, pos.z);
          this.ctx.events.emit('fire:extinguish', {
            position: this.p.clone(),
          });
        } else {
          const seed = prop.seed;
          for (let j = 0; j < prop.flameSlots.length; j++) {
            const angle = seed + (j / prop.flameSlots.length) * Math.PI * 2;
            const dist = j === 0 ? 0 : prop.info.radius * 0.45;
            const size = j === 0 ? 1.3 : 0.95;
            this.flames.setPropFlame(
              prop.flameSlots[j],
              pos.x + Math.cos(angle) * dist,
              pos.y + (j === 0 ? prop.info.half * 0.1 : -prop.info.half * 0.5),
              pos.z + Math.sin(angle) * dist,
              seed + j * 0.37,
              size,
              size * 1.75,
              1.1,
              prop.burnStart + j * 0.15,
              prop.burnEnd + 0.4,
            );
          }
          if (Math.random() < dt * 5)
            this.fx.puffs.spawn(
              pos.x,
              pos.y + 1.2,
              pos.z,
              (Math.random() - 0.5) * 0.4,
              2 + Math.random(),
              (Math.random() - 0.5) * 0.4,
              3.5,
              0.6,
              2.6,
              0.6,
              0.4,
              0.3,
              0.29,
              0.28,
              0.4,
              1,
              1,
              0.2,
            );
        }
      }
      let scale = 1;
      if (prop.dying) {
        const k = (elapsed - prop.dying) / 0.5;
        if (k >= 1) {
          this.remove(prop);
          dirty.add(prop.kind);
          continue;
        }
        scale = 1 - k * k;
      }
      this.p.set(pos.x, pos.y, pos.z);
      this.q.set(rot.x, rot.y, rot.z, rot.w);
      this.s.setScalar(scale);
      this.m.compose(this.p, this.q, this.s);
      this.meshes[prop.kind].setMatrixAt(prop.slot, this.m);
      const coatAttr = this.coatAttr[prop.kind];
      coatAttr.setXYZW(
        prop.slot,
        prop.coatCol.r,
        prop.coatCol.g,
        prop.coatCol.b,
        prop.coat ? prop.coatAmt : Math.max(0, coatAttr.getW(prop.slot) - dt * 2),
      );
      const hot = prop.info.wooden ? (prop.burning ? Math.min(1, 0.15 + prop.char * 0.95) : 0) : prop.hot;
      this.fxAttr[prop.kind].setXYZW(prop.slot, prop.char, hot, prop.frost, prop.seed);
      dirty.add(prop.kind);
      for (const tuft of prop.tufts) {
        if (elapsed < tuft.delay) continue;
        if (tuft.grow < 1) tuft.grow = Math.min(1, tuft.grow + dt * 2.2);
        const grow = tuft.grow;
        const size =
          grow *
          (grow < 1 ? 1 + Math.sin(grow * Math.PI) * 0.35 : 1) *
          tuft.size *
          scale *
          (prop.char > 0.5 ? 1 - (prop.char - 0.5) * 1.6 : 1);
        this.m2.copy(tuft.local);
        this.m2.scale(this.s.setScalar(Math.max(0.0001, size)));
        this.m2.premultiply(this.m);
        this.tuftMesh.setMatrixAt(tuft.slot, this.m2);
        tuftsDirty = true;
      }
    }
    for (const kind of dirty) {
      this.meshes[kind].instanceMatrix.needsUpdate = true;
      this.coatAttr[kind].needsUpdate = true;
      this.fxAttr[kind].needsUpdate = true;
    }
    if (tuftsDirty) this.tuftMesh.instanceMatrix.needsUpdate = true;
    this.flames.flushProps();
  }
}
