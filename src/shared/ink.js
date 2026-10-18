/**
 * Ink plants: a glowing plant species for each paint colour, instanced and swaying, with halo sprites above them. Walking into or interacting with a grown plant refills that ink as sparks fly to the hero, then the plant wilts and regrows.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Points,
  QuadraticBezierCurve3,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { PALETTE } from '../core/config.js';
import { ParticleMode } from './particles.js';
import { colorize, fillAttribute, mergeGeometries, randRange, rng, taperedTube, TAU } from './util.js';
const REGROW_TIME = 30;
const REFILL_AMOUNT = 50;
function prepPart(geometry, color, glow, part) {
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  if (!geometry.attributes.color) colorize(geometry, color);
  if (!geometry.attributes.aGlow) fillAttribute(geometry, 'aGlow', 1, glow);
  fillAttribute(geometry, 'aPart', 1, part);
  return geometry;
}
function leaf(len, width, cup, curl, rootColor, tipColor, rootGlow, tipGlow, cols = 4, rows = 6, taper = 0.8) {
  const positions = [];
  const colors = [];
  const glows = [];
  const indices = [];
  const color = new Color();
  for (let i = 0; i <= rows; i++) {
    const along = i / rows;
    const w =
      Math.sin(Math.min(1, along * (1 + taper * 0.2)) * Math.PI * 0.5 + along * Math.PI * 0.5) ** 0.9 *
      (1 - along * taper * 0.6);
    for (let j = 0; j <= cols; j++) {
      const across = j / cols - 0.5;
      const x = across * width * Math.max(0.05, w);
      const z = along * len;
      const y = across * across * cup * 4 * w + along * along * curl;
      positions.push(x, y, z);
      color.copy(rootColor).lerp(tipColor, along);
      colors.push(color.r, color.g, color.b);
      glows.push(rootGlow + (tipGlow - rootGlow) * along);
    }
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aGlow', new Float32BufferAttribute(glows, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function place(geometry, pos, pitch, yaw, roll = 0) {
  const matrix = new Matrix4().compose(
    pos,
    new Quaternion().setFromEuler(new Euler(pitch, yaw, roll, 'YXZ')),
    new Vector3(1, 1, 1),
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}
function stem(from, to, bend, radius, color) {
  const ctrl = from.clone().lerp(to, 0.5).add(bend);
  const curve = new QuadraticBezierCurve3(from, ctrl, to);
  return prepPart(
    taperedTube(curve, 8, 5, (u) => radius * (1 - u * 0.45)),
    color,
    0,
    0,
  );
}
function addRosette(rand, count, size, hex, parts) {
  const baseColor = new Color(hex).multiplyScalar(0.7);
  const tipColor = new Color(hex);
  for (let i = 0; i < count; i++) {
    const geo = leaf(
      size * randRange(rand, 0.8, 1.2),
      size * 0.32,
      0.05,
      -size * 0.25,
      baseColor,
      tipColor,
      0,
      0,
      3,
      5,
    );
    parts.push(
      prepPart(place(geo, new Vector3(0, 0.02, 0), -randRange(rand, 0.35, 0.7), (i / count) * TAU + rand()), 0, 0, 0),
    );
  }
}
function buildEmberPlant(rand) {
  const parts = [];
  addRosette(rand, 6, 0.45, 4155946, parts);
  const petalBase = new Color(0x9e1422);
  const petalTip = new Color(0xff6a3a);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * TAU + rand() * 0.8;
    const spread = i === 0 ? 0 : randRange(rand, 0.12, 0.28);
    const height = i === 0 ? 0.78 : randRange(rand, 0.42, 0.66);
    const head = new Vector3(Math.cos(angle) * spread, height, Math.sin(angle) * spread);
    parts.push(
      stem(
        new Vector3(Math.cos(angle) * spread * 0.3, 0, Math.sin(angle) * spread * 0.3),
        head,
        new Vector3(Math.cos(angle) * 0.08, 0, Math.sin(angle) * 0.08),
        0.018,
        4481323,
      ),
    );
    const scale = i === 0 ? 1.15 : randRange(rand, 0.8, 1);
    for (let j = 0; j < 6; j++) {
      const petal = leaf(0.2 * scale, 0.13 * scale, 0.03, 0.05 * scale, petalBase, petalTip, 1, 0.55, 4, 5, 0.6);
      parts.push(prepPart(place(petal, head, -0.75, (j / 6) * TAU + i), 0, 0, 1));
    }
    for (let j = 0; j < 4; j++) {
      const petal = leaf(
        0.12 * scale,
        0.09 * scale,
        0.03,
        0.03 * scale,
        petalBase,
        new Color(0xff8a4a),
        1.2,
        0.9,
        3,
        4,
        0.5,
      );
      parts.push(
        prepPart(place(petal, head.clone().add(new Vector3(0, 0.01, 0)), -1.15, (j / 4) * TAU + 0.4 + i), 0, 0, 1),
      );
    }
    const core = new SphereGeometry(0.035 * scale, 8, 6);
    core.translate(head.x, head.y + 0.03, head.z);
    parts.push(prepPart(core, 16765040, 2.2, 1));
  }
  return mergeGeometries(parts);
}
function crystalShard(height, width, rootColor, tipColor, rootGlow, tipGlow) {
  const verts = [
    new Vector3(0, 0, 0),
    new Vector3(width, height * 0.55, 0),
    new Vector3(0, height * 0.5, width * 0.6),
    new Vector3(-width, height * 0.55, 0),
    new Vector3(0, height * 0.5, -width * 0.6),
    new Vector3(0, height, 0),
  ];
  const faces = [
    [0, 1, 2],
    [0, 2, 3],
    [0, 3, 4],
    [0, 4, 1],
    [5, 2, 1],
    [5, 3, 2],
    [5, 4, 3],
    [5, 1, 4],
  ];
  const positions = [];
  const colors = [];
  const glows = [];
  const color = new Color();
  for (const face of faces)
    for (const index of face) {
      const vert = verts[index];
      positions.push(vert.x, vert.y, vert.z);
      const along = vert.y / height;
      color.copy(rootColor).lerp(tipColor, along);
      colors.push(color.r, color.g, color.b);
      glows.push(rootGlow + (tipGlow - rootGlow) * along);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('aGlow', new Float32BufferAttribute(glows, 1));
  geometry.computeVertexNormals();
  return geometry;
}
function buildFrostPlant(rand) {
  const parts = [];
  const leafBase = new Color(0x2c5f4a);
  const leafTip = new Color(0x4f8f76);
  for (let i = 0; i < 5; i++) {
    const geo = leaf(0.42, 0.2, 0.05, -0.12, leafBase, leafTip, 0, 0.05, 3, 5, 0.9);
    parts.push(
      prepPart(place(geo, new Vector3(0, 0.02, 0), -randRange(rand, 0.5, 0.9), (i / 5) * TAU + rand()), 0, 0, 0),
    );
  }
  const crystalBase = new Color(0x1f63c8);
  const crystalTip = new Color(0xd9f7ff);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * TAU + rand();
    const spread = i === 0 ? 0.02 : randRange(rand, 0.14, 0.22);
    const height = i === 0 ? 0.7 : randRange(rand, 0.4, 0.55);
    const head = new Vector3(Math.cos(angle) * spread, height, Math.sin(angle) * spread);
    parts.push(
      stem(new Vector3(0, 0, 0), head, new Vector3(Math.cos(angle) * 0.06, 0, Math.sin(angle) * 0.06), 0.016, 3829091),
    );
    const scale = i === 0 ? 1.1 : randRange(rand, 0.75, 0.95);
    for (let j = 0; j < 6; j++) {
      const shard = crystalShard(0.3 * scale, 0.06 * scale, crystalBase, crystalTip, 0.9, 1.4);
      parts.push(prepPart(place(shard, head, 0.55 + (j % 2) * 0.2, (j / 6) * TAU + i), 0, 0, 1));
    }
    for (let j = 0; j < 3; j++) {
      const shard = crystalShard(0.16 * scale, 0.03 * scale, new Color(0x7fd2ff), crystalTip, 1.5, 2);
      parts.push(prepPart(place(shard, head, 0.2, (j / 3) * TAU + i), 0, 0, 1));
    }
  }
  return mergeGeometries(parts);
}
function buildSpringPlant(rand) {
  const parts = [];
  const leafBase = new Color(0x4f7a2a);
  const leafTip = new Color(0x86a83c);
  for (let i = 0; i < 5; i++) {
    const geo = leaf(0.34, 0.34, 0.06, -0.06, leafBase, leafTip, 0, 0, 4, 5, 0.1);
    parts.push(prepPart(place(geo, new Vector3(0, 0.03, 0), -0.12, (i / 5) * TAU + rand()), 0, 0, 0));
  }
  const bulbBase = new Color(0xffd447);
  const bulbSpot = new Color(0xfff2a8);
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * TAU + rand();
    const spread = i === 0 ? 0 : randRange(rand, 0.2, 0.3);
    const radius = i === 0 ? 0.28 : randRange(rand, 0.16, 0.22);
    const height = (i === 0 ? 0.42 : randRange(rand, 0.22, 0.32)) + radius;
    const head = new Vector3(Math.cos(angle) * spread, height, Math.sin(angle) * spread);
    parts.push(
      stem(
        new Vector3(Math.cos(angle) * spread * 0.4, 0, Math.sin(angle) * spread * 0.4),
        head.clone().setY(height - radius * 0.8),
        new Vector3(0, 0, 0),
        0.035,
        6130228,
      ),
    );
    const bulb = new SphereGeometry(radius, 16, 12);
    bulb.deleteAttribute('uv');
    const position = bulb.attributes.position;
    const colors = [];
    const glows = [];
    const color = new Color();
    for (let j = 0; j < position.count; j++) {
      const x = position.getX(j);
      const y = position.getY(j);
      const z = position.getZ(j);
      const ridge = 1 + 0.06 * Math.sin(Math.atan2(z, x) * 6) * Math.cos((y / radius) * 1.5);
      const squash = y < 0 ? 0.85 : 1;
      position.setXYZ(j, x * ridge, y * squash, z * ridge);
      const spot = +(Math.sin(x * 41 + i) * Math.sin(y * 37) * Math.sin(z * 43) > 0.35);
      color.copy(bulbBase).lerp(bulbSpot, spot * 0.8 + Math.max(0, y / radius) * 0.15);
      colors.push(color.r, color.g, color.b);
      glows.push(0.45 + spot * 0.6);
    }
    bulb.setAttribute('color', new Float32BufferAttribute(colors, 3));
    bulb.setAttribute('aGlow', new Float32BufferAttribute(glows, 1));
    bulb.computeVertexNormals();
    bulb.translate(head.x, head.y, head.z);
    parts.push(prepPart(bulb, 0, 0, 1));
    const tip = new ConeGeometry(radius * 0.22, radius * 0.35, 6);
    tip.translate(head.x, head.y + radius * 0.95, head.z);
    parts.push(prepPart(tip, 16773280, 1.2, 1));
  }
  return mergeGeometries(parts);
}
function buildBloomPlant(rand) {
  const parts = [];
  const leafBase = new Color(0x1f6a2c);
  const leafTip = new Color(0x58d66b);
  const budColor = new Color(0xb8ff9a);
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * TAU + rand() * 0.5;
    const len = randRange(rand, 0.75, 1.05);
    const lean = randRange(rand, 0.45, 0.8);
    const curled = i % 3 == 0;
    const points = [];
    for (let j = 0; j <= 10; j++) {
      const u2 = j / 10;
      const outward = Math.sin(u2 * lean * 1.6) * len * 0.75;
      const up = Math.sin(u2 * Math.PI * 0.55) * len * (1 - lean * 0.35);
      points.push(
        new Vector3(
          Math.cos(angle) * outward,
          up - (u2 > 0.7 ? (u2 - 0.7) * len * 0.5 * lean : 0),
          Math.sin(angle) * outward,
        ),
      );
    }
    if (curled) {
      const tip = points[points.length - 1];
      const dir = new Vector3(Math.cos(angle), 0, Math.sin(angle));
      for (let j = 1; j <= 8; j++) {
        const curlA = (j / 8) * TAU * 1.1;
        const curlR = 0.11 * (1 - j / 10);
        points.push(
          tip
            .clone()
            .addScaledVector(dir, Math.sin(curlA) * curlR)
            .add(new Vector3(0, (1 - Math.cos(curlA)) * curlR, 0)),
        );
      }
    }
    const curve = new CatmullRomCurve3(points);
    parts.push(
      prepPart(
        taperedTube(curve, 24, 4, (u) => 0.014 * (1 - u * 0.6)),
        3045940,
        0.2,
        1,
      ),
    );
    const leafCount = curled ? 9 : 13;
    const point = new Vector3();
    const tangent = new Vector3();
    const side = new Vector3();
    for (let j = 1; j < leafCount; j++) {
      const u2 = (j / leafCount) * (curled ? 0.62 : 0.95);
      curve.getPointAt(u2, point);
      curve.getTangentAt(u2, tangent);
      side.set(0, 1, 0).cross(tangent).normalize();
      const size = 0.17 * (1 - u2 * 0.75);
      for (const sign of [-1, 1]) {
        const geo = leaf(size, size * 0.42, 0.01, 0.02, leafBase, leafTip, 0.1, 0.55, 2, 3, 0.9);
        const facing = side.clone().multiplyScalar(sign).addScaledVector(tangent, 0.5).normalize();
        const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), facing);
        geo.applyQuaternion(quat);
        geo.translate(point.x, point.y, point.z);
        parts.push(prepPart(geo, 0, 0, 1));
      }
    }
    if (curled) {
      const tip = points[points.length - 1];
      const bud = new SphereGeometry(0.045, 8, 6);
      bud.translate(tip.x, tip.y, tip.z);
      parts.push(prepPart(bud, budColor, 2.4, 1));
    }
  }
  return mergeGeometries(parts);
}
function inkMaterial(ctx, bounce) {
  const globals = ctx.globals;
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0,
    side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals);
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `#include <wb_common>
        attribute float aGlow;
        attribute float aPart;
        attribute vec2 aState;
        varying float vInkGlow;
        varying float vInkGrow;
        void main() {`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          float grow = aState.x;
          float seed = aState.y;
          float h = max(transformed.y, 0.0);
          ${
            bounce
              ? `
          float bb = sin(uTime * 3.4 + seed * 6.283);
          float sq = 1.0 + 0.1 * bb * aPart;
          transformed.y *= mix(1.0, sq, aPart);
          transformed.xz *= mix(1.0, inversesqrt(sq), aPart);
          `
              : ''
          }
          float sway = sin(uTime * 1.6 + seed * 6.283) * 0.07 + sin(uTime * 2.7 + seed * 3.1) * 0.035;
          vec2 wv = uWindDir * uWindStrength * 0.1 * (0.6 + 0.4 * sin(uTime * 1.1 + seed * 4.0));
          transformed.x += (sway + wv.x) * h * h;
          transformed.z += (sway * 0.6 + wv.y) * h * h;
          float wilt = 1.0 - grow;
          transformed.y *= mix(1.0, 0.22, wilt);
          transformed.xz *= mix(1.0, 0.6, wilt);
          transformed.xz += normalize(transformed.xz + vec2(0.001)) * wilt * h * 0.35;
          vInkGlow = aGlow;
          vInkGrow = grow;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `#include <wb_common>
varying float vInkGlow;
varying float vInkGrow;
void main() {`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float inkWilt = 1.0 - vInkGrow;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.27, 0.18) * (0.6 + wbLuma(diffuseColor.rgb)), inkWilt * 0.85);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += diffuseColor.rgb * vInkGlow * vInkGrow * vInkGrow * (1.6 + 0.4 * sin(uTime * 2.3 + vInkGlow * 5.0));`,
      );
  };
  material.customProgramCacheKey = () => `wb-content-ink-${bounce ? 'b' : 'n'}-v1`;
  return material;
}
const HALO_VERTEX = `
attribute vec3 aColor;
attribute float aAlpha;
uniform float uScale;
uniform float uTime;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  float pulse = 0.85 + 0.15 * sin(uTime * 1.8 + position.x * 0.7 + position.z);
  gl_PointSize = min(2.6 * pulse * uScale / max(0.5, dist), 360.0);
  // readable from a distance: keep a minimum screen size, fade very far
  gl_PointSize = max(gl_PointSize, 7.0 * smoothstep(150.0, 20.0, dist));
  vColor = aColor;
  vAlpha = aAlpha * smoothstep(170.0, 60.0, dist) * mix(0.55, 1.0, smoothstep(40.0, 5.0, dist));
}
`;
const HALO_FRAGMENT = `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = pow(1.0 - d, 2.2) * 0.5 + smoothstep(0.22, 0.0, d) * 0.35;
  gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
}
`;
export class InkPlants {
  ctx;
  particles;
  plants = [];
  meshes = [];
  states = [];
  haloPts = null;
  haloAlpha = null;
  haloU = {
    uScale: {
      value: 400,
    },
    uTime: {
      value: 0,
    },
  };
  rand;
  promptShown = false;
  chest = new Vector3();
  colors;
  autoCooldown = 0;
  constructor(ctx, particles) {
    this.ctx = ctx;
    this.particles = particles;
    this.rand = rng('ink');
    this.colors = {
      red: new Color(PALETTE.red.hex),
      blue: new Color(PALETTE.blue.hex),
      yellow: new Color(PALETTE.yellow.hex),
      green: new Color(PALETTE.green.hex),
    };
  }
  add(color, x, z) {
    let y;
    try {
      y = this.ctx.terrain.heightAt(x, z);
      if (!Number.isFinite(y) || (this.ctx.water && this.ctx.water.depthAt(x, z) > 0.2)) return false;
    } catch {
      return false;
    }
    for (const plant of this.plants) if (Math.hypot(plant.pos.x - x, plant.pos.z - z) < 1.2) return false;
    const pos = new Vector3(x, y - 0.03, z);
    this.plants.push({
      color,
      pos,
      head: pos.clone().add(new Vector3(0, 0.55, 0)),
      grow: 1,
      timer: 0,
      mesh: -1,
      index: -1,
      halo: -1,
    });
    return true;
  }
  addAt(color, pos) {
    this.plants.push({
      color,
      pos: pos.clone(),
      head: pos.clone().add(new Vector3(0, 0.55, 0)),
      grow: 1,
      timer: 0,
      mesh: -1,
      index: -1,
      halo: -1,
    });
  }
  build() {
    const order = ['red', 'blue', 'yellow', 'green'];
    const builders = {
      red: buildEmberPlant,
      blue: buildFrostPlant,
      yellow: buildSpringPlant,
      green: buildBloomPlant,
    };
    const rand = this.rand;
    const mat4 = new Matrix4();
    const quat = new Quaternion();
    const scale = new Vector3();
    for (const color of order) {
      const batch = this.plants.filter((plant) => plant.color === color);
      if (!batch.length) continue;
      const geometry = builders[color](rng(`ink-${color}`));
      const material = inkMaterial(this.ctx, color === 'yellow');
      const mesh = new InstancedMesh(geometry, material, batch.length);
      mesh.name = `content-ink-${color}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      const state = new Float32Array(batch.length * 2);
      batch.forEach((plant, i) => {
        quat.setFromAxisAngle(new Vector3(0, 1, 0), rand() * TAU);
        scale.setScalar(randRange(rand, 1.6, 1.85));
        mat4.compose(plant.pos, quat, scale);
        mesh.setMatrixAt(i, mat4);
        state[i * 2] = 1;
        state[i * 2 + 1] = rand();
        plant.mesh = this.meshes.length;
        plant.index = i;
        plant.head.copy(plant.pos).add(new Vector3(0, color === 'green' ? 0.95 : 0.9, 0));
      });
      const stateAttr = new InstancedBufferAttribute(state, 2);
      stateAttr.setUsage(DynamicDrawUsage);
      geometry.setAttribute('aState', stateAttr);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.ctx.scene.add(mesh);
      this.meshes.push(mesh);
      this.states.push(stateAttr);
    }
    const count = this.plants.length;
    if (!count) return;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this.haloAlpha = new Float32Array(count).fill(1);
    this.plants.forEach((plant, i) => {
      positions.set([plant.head.x, plant.head.y, plant.head.z], i * 3);
      const color = this.colors[plant.color];
      colors.set([color.r, color.g, color.b], i * 3);
      plant.halo = i;
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(positions, 3));
    geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
    geometry.setAttribute('aAlpha', new BufferAttribute(this.haloAlpha, 1).setUsage(DynamicDrawUsage));
    const material = new ShaderMaterial({
      uniforms: this.haloU,
      vertexShader: HALO_VERTEX,
      fragmentShader: HALO_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.haloPts = new Points(geometry, material);
    this.haloPts.frustumCulled = false;
    this.haloPts.renderOrder = 9;
    this.haloPts.name = 'content-ink-halos';
    this.ctx.scene.add(this.haloPts);
  }
  setGrow(plant, grow) {
    plant.grow = grow;
    const attr = this.states[plant.mesh];
    if (attr) {
      attr.setX(plant.index, grow);
      attr.needsUpdate = true;
    }
    if (this.haloAlpha && this.haloPts) {
      this.haloAlpha[plant.halo] = grow * grow * grow;
      this.haloPts.geometry.attributes.aAlpha.needsUpdate = true;
    }
  }
  harvest(plant) {
    if (plant.grow < 0.98) return;
    plant.timer = -1;
    const ctx = this.ctx;
    try {
      ctx.paint.addInk(plant.color, REFILL_AMOUNT);
    } catch {}
    try {
      ctx.audio.play('ink-refill', {
        position: plant.head,
      });
    } catch {}
    try {
      ctx.events.emit('content:ink-refill', {
        color: plant.color,
        amount: REFILL_AMOUNT,
        position: plant.head.clone(),
      });
    } catch {}
    const color = this.colors[plant.color];
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * TAU;
      const speed = 1.5 + Math.random() * 2.5;
      this.particles.spawn({
        x: plant.head.x + (Math.random() - 0.5) * 0.4,
        y: plant.head.y + (Math.random() - 0.3) * 0.4,
        z: plant.head.z + (Math.random() - 0.5) * 0.4,
        vx: Math.cos(angle) * speed,
        vy: 2 + Math.random() * 3,
        vz: Math.sin(angle) * speed,
        mode: ParticleMode.Homing,
        target: this.chest,
        delay: 0.12 + Math.random() * 0.25,
        color: i % 5 == 0 ? new Color(1, 1, 1) : color,
        bright: 1.7,
        size: 0.1 + Math.random() * 0.16,
        style: i % 3 == 0 ? 0 : 1,
        life: 1.4,
      });
    }
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * TAU;
      this.particles.spawn({
        x: plant.head.x,
        y: plant.head.y,
        z: plant.head.z,
        vx: Math.cos(angle) * 2.5,
        vy: Math.random() * 2,
        vz: Math.sin(angle) * 2.5,
        drag: 3,
        color,
        bright: 2.2,
        size: 0.06,
        life: 0.6,
      });
    }
  }
  update(dt, blocked) {
    const ctx = this.ctx;
    this.haloU.uTime.value = ctx.time.elapsed;
    this.haloU.uScale.value = ctx.renderer.domElement.height / (2 * Math.tan(MathUtils.degToRad(ctx.camera.fov) / 2));
    const state = ctx.player?.state;
    if (state) this.chest.copy(state.position).add(new Vector3(0, 1.1, 0));
    this.autoCooldown = Math.max(0, this.autoCooldown - dt);
    let nearest = null;
    let nearestDist = Infinity;
    for (const plant of this.plants) {
      if (plant.timer < 0) {
        const grow = Math.max(0, plant.grow - dt * 2.2);
        this.setGrow(plant, grow);
        if (grow <= 0) plant.timer = REGROW_TIME;
        continue;
      }
      if (plant.grow < 1) {
        plant.timer -= dt;
        if (plant.timer <= 8) this.setGrow(plant, Math.min(1, plant.grow + dt / 8));
        continue;
      }
      if (!state) continue;
      const dx = plant.pos.x - state.position.x;
      const dz = plant.pos.z - state.position.z;
      const dy = plant.pos.y - state.position.y;
      if (Math.abs(dy) > 2.5) continue;
      const dist = Math.hypot(dx, dz);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = plant;
      }
    }
    let prompting = false;
    if (nearest && !blocked) {
      const full = (ctx.paint.ink?.[nearest.color] ?? 0) >= (ctx.paint.inkMax ?? 100) - 0.5;
      if (nearestDist < 0.95 && !full && this.autoCooldown <= 0 && !ctx.player.isStub) {
        this.harvest(nearest);
        this.autoCooldown = 0.3;
      } else if (nearestDist < 2.4 && !(full && (ctx.enemies?.alertedCount ?? 0) > 0)) {
        prompting = true;
        const inkName = PALETTE[nearest.color].name;
        ctx.ui.showPrompt('ink', full ? `${inkName} Ink is full` : `Gather ${inkName} Ink`, full ? undefined : 'F');
        if (!full && ctx.input.pressed('interact')) this.harvest(nearest);
      }
    }
    if (prompting !== this.promptShown) {
      if (!prompting) ctx.ui.hidePrompt('ink');
      this.promptShown = prompting;
    }
    return prompting;
  }
}
