/**
 * Smudge camps: builds the merged prop mesh (fire ring, ash, logs, mask cairn and banner pole) with a tattered, burnable ink banner, adds colliders, places the camp members around the fire, and burns the banner when it is ignited.
 */
import {
  BufferAttribute,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  ShaderMaterial,
  SphereGeometry,
  UniformsLib,
  Vector3,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLLISION_GROUPS } from '../core/config.js';
import { makeRng } from '../core/math.js';
const CAMP_STONE_A = 8814714;
const CAMP_STONE_B = 6709866;
const CAMP_CHARCOAL = 2762276;
const CAMP_ASH = 7828602;
const CAMP_WOOD = 5064256;
const CAMP_CLOTH = 5591390;
const CAMP_CLOTH_STORM = 3813728;
function tintGeometry(geometry, hex, jitter = 0, rng) {
  const color = new Color(hex);
  const count = geometry.getAttribute('position').count;
  const data = new Float32Array(count * 3);
  const shade = rng ? 1 + (rng() - 0.5) * jitter : 1;
  for (let i = 0; i < count; i++) {
    data[i * 3] = color.r * shade;
    data[i * 3 + 1] = color.g * shade;
    data[i * 3 + 2] = color.b * shade;
  }
  geometry.setAttribute('color', new BufferAttribute(data, 3));
  return geometry;
}
function prepGeometry(geometry) {
  let geo = geometry.index ? geometry.toNonIndexed() : geometry;
  for (const key of Object.keys(geo.attributes))
    if (key !== 'position' && key !== 'normal' && key !== 'color') geo.deleteAttribute(key);
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  geo = geo.clone();
  return geo;
}
function rockGeometry(rng, radius) {
  let geometry = new DodecahedronGeometry(radius, 0);
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++)
    position.setXYZ(
      i,
      position.getX(i) * (0.85 + rng() * 0.3),
      position.getY(i) * (0.55 + rng() * 0.2),
      position.getZ(i) * (0.85 + rng() * 0.3),
    );
  geometry = geometry.toNonIndexed();
  geometry.computeVertexNormals();
  return geometry;
}
const BANNER_VERTEX2 = `
#include <wb_common>
#include <fog_pars_vertex>
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
uniform float uSeed;
void main() {
  vec3 p = position;
  float hang = 1.0 - uv.y; // 0 at top, 1 at bottom
  float w = uWindStrength * 0.6 + 0.25;
  float wave = sin(uTime * 2.3 + p.x * 3.0 + uSeed * 7.0) * 0.5 + sin(uTime * 3.7 - p.y * 2.0 + uSeed) * 0.3;
  p.z += wave * 0.16 * hang * w;
  p.x += sin(uTime * 1.3 + uSeed) * 0.05 * hang * w;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv;
  vN = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
  vWorld = wp.xyz;
  #include <fog_vertex>
}
`;
const BANNER_FRAGMENT2 = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorld;
uniform float uSeed;
uniform float uBurn;
uniform vec3 uCloth;
void main() {
  vec2 uv = vUv;
  // tattered bottom + holes
  float tear = 0.12 + 0.1 * wbNoise2(vec2(uv.x * 9.0, uSeed * 3.0)) + 0.06 * sin(uv.x * 23.0 + uSeed);
  if (uv.y < tear) discard;
  float holes = wbNoise2(uv * vec2(6.0, 8.0) + uSeed * 5.0);
  if (holes > 0.8 && uv.y < 0.8) discard;
  // burning eats upward from the bottom
  float burnEdge = uBurn * 1.25 - 0.1 + (wbNoise2(uv * 7.0 + uSeed) - 0.5) * 0.25;
  if (uv.y < burnEdge) discard;
  vec3 col = uCloth * (0.85 + 0.25 * wbNoise2(uv * vec2(30.0, 4.0)));
  // painted emblem: a white paper mask with two eye holes and ink drips
  vec2 q = (uv - vec2(0.5, 0.62)) * vec2(1.0, 1.25);
  float mask = length(q * vec2(1.0, 0.85)) - 0.26;
  float eyes = min(length((q - vec2(0.1, 0.04)) * vec2(1.0, 0.8)) - 0.055, length((q - vec2(-0.1, 0.04)) * vec2(1.0, 0.8)) - 0.055);
  float drip = 1e5;
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float x = -0.15 + fi * 0.1 + 0.02 * sin(fi * 7.0 + uSeed);
    float len = 0.12 + 0.12 * fract(fi * 0.37 + uSeed);
    drip = min(drip, max(abs(q.x - x) - 0.018, abs(q.y + 0.2 + len * 0.5) - len * 0.5));
  }
  float em = 1.0 - smoothstep(-0.01, 0.01, min(mask, drip));
  col = mix(col, vec3(0.86, 0.83, 0.76), em * 0.9);
  col = mix(col, vec3(0.05), (1.0 - smoothstep(-0.01, 0.01, eyes)) * em);
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float ndl = abs(dot(n, uSunDir));
  vec3 light = uSunColor * (0.35 + 0.65 * ndl) + uSkyColor * 0.45;
  col *= light;
  // glowing burn edge
  float edge = 1.0 - smoothstep(0.0, 0.05, uv.y - burnEdge);
  col += vec3(1.0, 0.45, 0.1) * edge * 3.0 * step(0.001, uBurn);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;
export class EnemyCamps {
  ctx;
  groundFn;
  group = new Group();
  camps = new Map();
  propMat;
  constructor(ctx, groundFn) {
    this.ctx = ctx;
    this.groundFn = groundFn;
    this.group.name = 'enemy-camps';
    this.propMat = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
    });
    try {
      ctx.paint?.patchMaterial?.(this.propMat, {
        paint: true,
        vitality: true,
      });
    } catch {}
  }
  refY = -1000000000;
  ground(x, z) {
    try {
      if (this.groundFn) return this.groundFn(x, z, this.refY);
      const y = this.ctx.terrain.heightAt(x, z);
      return Number.isFinite(y) ? y : 0;
    } catch {
      return 0;
    }
  }
  create(id, center, kinds, radius, respawn, tier = 1) {
    const rng = makeRng(`camp-${id}`);
    this.refY = Number.isFinite(center.y) ? center.y : -1000000000;
    const cx = center.x;
    const cz = center.z;
    const groundAt = (x, z) => this.ground(x, z);
    const parts = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + rng() * 0.3;
      const x = cx + Math.cos(angle) * 0.62;
      const z = cz + Math.sin(angle) * 0.62;
      const rock = rockGeometry(rng, 0.17 + rng() * 0.06);
      rock.rotateY(rng() * 6);
      rock.translate(x, groundAt(x, z) + 0.04, z);
      parts.push(tintGeometry(rock, i % 2 ? CAMP_STONE_A : CAMP_STONE_B, 0.15, rng));
    }
    const ash = new SphereGeometry(0.45, 12, 6);
    ash.scale(1, 0.12, 1);
    ash.translate(cx, groundAt(cx, cz) + 0.01, cz);
    parts.push(tintGeometry(prepGeometry(ash), CAMP_ASH));
    for (let i = 0; i < 4; i++) {
      const stick = new CylinderGeometry(0.06, 0.075, 0.85, 7);
      stick.rotateZ(Math.PI / 2 - 0.35);
      stick.rotateY((i / 4) * Math.PI * 2 + rng());
      stick.translate(cx, groundAt(cx, cz) + 0.18, cz);
      parts.push(tintGeometry(prepGeometry(stick), CAMP_CHARCOAL, 0.2, rng));
    }
    for (let i = 0; i < 2; i++) {
      const angle = rng() * Math.PI * 2;
      const x = cx + Math.cos(angle) * 2.1;
      const z = cz + Math.sin(angle) * 2.1;
      const log = new CylinderGeometry(0.16, 0.18, 1.2, 9);
      log.rotateZ(Math.PI / 2);
      log.rotateY(-angle + Math.PI / 2);
      log.translate(x, groundAt(x, z) + 0.13, z);
      parts.push(tintGeometry(prepGeometry(log), CAMP_WOOD, 0.1, rng));
    }
    const poleAngle = rng() * Math.PI * 2;
    const poleX = cx + Math.cos(poleAngle) * (radius * 0.55 + 1.2);
    const poleZ = cz + Math.sin(poleAngle) * (radius * 0.55 + 1.2);
    const poleY = groundAt(poleX, poleZ);
    const tilt = (rng() - 0.5) * 0.12;
    const pole = new CylinderGeometry(0.045, 0.06, 2.9, 7);
    pole.translate(0, 1.45, 0);
    pole.rotateZ(tilt);
    pole.translate(poleX, poleY - 0.1, poleZ);
    parts.push(tintGeometry(prepGeometry(pole), CAMP_WOOD));
    const crossbar = new CylinderGeometry(0.035, 0.035, 1.05, 6);
    crossbar.rotateZ(Math.PI / 2);
    crossbar.translate(0, 2.55, 0);
    crossbar.rotateZ(tilt);
    crossbar.translate(poleX, poleY - 0.1, poleZ);
    parts.push(tintGeometry(prepGeometry(crossbar), CAMP_WOOD));
    const cairnAngle = poleAngle + Math.PI * (0.7 + rng() * 0.6);
    const cairnX = cx + Math.cos(cairnAngle) * (radius * 0.5 + 1.4);
    const cairnZ = cz + Math.sin(cairnAngle) * (radius * 0.5 + 1.4);
    let cairnY = groundAt(cairnX, cairnZ);
    for (let i = 0; i < 4; i++) {
      const size = 0.3 - i * 0.055;
      const rock = rockGeometry(rng, size);
      rock.rotateY(rng() * 6);
      rock.translate(cairnX + (rng() - 0.5) * 0.05, cairnY + size * 0.5, cairnZ + (rng() - 0.5) * 0.05);
      cairnY += size * 0.95;
      parts.push(tintGeometry(rock, i % 2 ? CAMP_STONE_A : CAMP_STONE_B, 0.1, rng));
    }
    const mask = new SphereGeometry(0.2, 16, 10);
    mask.scale(1, 0.95, 0.35);
    mask.rotateY(Math.atan2(cx - cairnX, cz - cairnZ));
    mask.translate(cairnX, cairnY + 0.14, cairnZ);
    parts.push(tintGeometry(prepGeometry(mask), 15525592));
    const fwd = new Vector3(cx - cairnX, 0, cz - cairnZ).normalize();
    const side = new Vector3(-fwd.z, 0, fwd.x);
    for (const sign of [-1, 1]) {
      const eye = new SphereGeometry(0.04, 8, 6);
      eye.scale(1, 1.3, 0.6);
      eye.translate(
        cairnX + side.x * sign * 0.075 + fwd.x * 0.065,
        cairnY + 0.17,
        cairnZ + side.z * sign * 0.075 + fwd.z * 0.065,
      );
      parts.push(tintGeometry(prepGeometry(eye), 1118228));
    }
    const merged = mergeGeometries(parts.map(prepGeometry), false);
    const group = new Group();
    group.name = `camp-${id}`;
    if (merged) {
      const mesh = new Mesh(merged, this.propMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    const burn = {
      value: 0,
    };
    const bannerGeo = new PlaneGeometry(0.9, 1.45, 8, 14);
    bannerGeo.translate(0, -0.72, 0);
    const bannerMat = new ShaderMaterial({
      uniforms: {
        ...(() => {
          const uniforms = {};
          const fog = UniformsLib.fog;
          for (const key of Object.keys(fog)) uniforms[key] = fog[key];
          return uniforms;
        })(),
        ...this.ctx.globals,
        uSeed: {
          value: rng() * 10,
        },
        uBurn: burn,
        uCloth: {
          value: new Color(tier === 2 ? CAMP_CLOTH_STORM : CAMP_CLOTH),
        },
      },
      vertexShader: BANNER_VERTEX2,
      fragmentShader: BANNER_FRAGMENT2,
      side: DoubleSide,
      fog: true,
    });
    const banner = new Mesh(bannerGeo, bannerMat);
    const bannerPos = new Vector3(0, 2.52, 0)
      .applyAxisAngle(new Vector3(0, 0, 1), tilt)
      .add(new Vector3(poleX, poleY - 0.1, poleZ));
    banner.position.copy(bannerPos);
    banner.rotation.y = Math.atan2(cx - poleX, cz - poleZ) + Math.PI / 2;
    banner.castShadow = true;
    group.add(banner);
    this.group.add(group);
    try {
      const RAPIER = this.ctx.RAPIER;
      const poleBody = this.ctx.physics.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(poleX, poleY + 1.3, poleZ),
      );
      const poleCollider = this.ctx.physics.createCollider(
        RAPIER.ColliderDesc.cylinder(1.4, 0.08).setCollisionGroups(COLLISION_GROUPS.static),
        poleBody,
      );
      this.ctx.colliders.register(poleCollider, {
        kind: 'structure',
        surface: 'wood',
        flammable: true,
      });
      const cairnBody = this.ctx.physics.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(cairnX, groundAt(cairnX, cairnZ) + 0.5, cairnZ),
      );
      const cairnCollider = this.ctx.physics.createCollider(
        RAPIER.ColliderDesc.cylinder(0.5, 0.28).setCollisionGroups(COLLISION_GROUPS.static),
        cairnBody,
      );
      this.ctx.colliders.register(cairnCollider, {
        kind: 'rock',
        surface: 'stone',
      });
    } catch {}
    try {
      this.ctx.vegetation?.clearGrass?.(new Vector3(cx, groundAt(cx, cz), cz), 1.6);
    } catch {}
    const members = [];
    const len = kinds.length;
    kinds.forEach((kind, i) => {
      const angle = (i / Math.max(1, len)) * Math.PI * 2 + rng() * 0.5 + 0.3;
      const dist = kind === 'brute' ? 2.9 : kind === 'spitter' ? Math.min(radius, 3.6) : 1.7 + rng() * 0.7;
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      const home = new Vector3(x, groundAt(x, z), z);
      members.push({
        kind,
        home,
        facing: Math.atan2(cx - x, cz - z) + (rng() - 0.5) * 0.6,
        id: -1,
      });
    });
    const camp = {
      id,
      center: new Vector3(cx, groundAt(cx, cz), cz),
      radius,
      respawn,
      members,
      clearedAt: null,
      tier,
      group,
      banner: {
        pos: new Vector3(poleX, poleY + 1.6, poleZ),
        burn,
        burning: false,
        burnt: false,
      },
      smokeT: rng() * 2,
    };
    try {
      this.ctx.elements?.addFlammable?.({
        position: camp.banner.pos.clone(),
        radius: 0.8,
        onIgnite: () => {
          camp.banner.burning = true;
        },
        onBurnt: () => {
          camp.banner.burnt = true;
          burn.value = 1;
        },
      });
    } catch {}
    this.camps.set(id, camp);
    return camp;
  }
  update(dt) {
    for (const camp of this.camps.values())
      if (camp.banner.burning && !camp.banner.burnt) {
        camp.banner.burn.value = Math.min(1, camp.banner.burn.value + dt * 0.3);
        if (camp.banner.burn.value >= 1) camp.banner.burnt = true;
      }
  }
}
