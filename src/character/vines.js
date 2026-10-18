/**
 * Snaring vines: leafy, thorny vines that grow up the hero's shins while slowed, sway and shed leaves as the hero moves, and burst apart when the slow wears off.
 */
import {
  BufferAttribute,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  DoubleSide,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BONE, REST_POS } from './rig.js';
import { patchToonMaterial } from './toon-material.js';
import { VfxType } from './vfx.js';
const VINE_TURNS = 3.1;
const VINE_BOTTOM_Y = REST_POS[BONE.footL].y - REST_POS[BONE.shinL].y + 0.035;
const VINE_TOP_Y = 0.075;
function vinePoint(side, t, out) {
  const angle = side * (t * VINE_TURNS * Math.PI * 2) + (side > 0 ? 0.4 : 2.1);
  const radius = 0.066 - 0.012 * t + 0.004 * Math.sin(t * 23);
  return out.set(
    Math.sin(angle) * radius,
    VINE_BOTTOM_Y + (VINE_TOP_Y - VINE_BOTTOM_Y) * t,
    0.006 + Math.cos(angle) * radius,
  );
}
function buildVineGeometry(side) {
  const points = [];
  for (let i = 0; i <= 40; i++) points.push(vinePoint(side, i / 40, new Vector3()));
  const curve = new CatmullRomCurve3(points);
  const parts = [];
  const stem = new TubeGeometry(curve, 90, 0.0125, 6, false);
  stem.deleteAttribute('uv');
  {
    const count = stem.attributes.position.count;
    const along = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const color = new Color();
    for (let i = 0; i < count; i++) {
      const u = Math.floor(i / 7) / 90;
      along[i] = u;
      color.setHex(0x2d6a2f).lerp(new Color(0x5c9a3c), 0.5 + 0.5 * Math.sin(u * 40));
      colors.set([color.r, color.g, color.b], i * 3);
    }
    stem.setAttribute('aU', new BufferAttribute(along, 1));
    stem.setAttribute('color', new BufferAttribute(colors, 3));
  }
  parts.push(stem);
  const addPart = (geo, u2, lowHex, highHex) => {
    geo.deleteAttribute('uv');
    const count = geo.attributes.position.count;
    const position = geo.attributes.position;
    const us = new Float32Array(count).fill(u2);
    const colors = new Float32Array(count * 3);
    const low = new Color(lowHex);
    const high = new Color(highHex);
    const mixed = new Color();
    let maxY = -1000000000;
    let minY = 1000000000;
    for (let i = 0; i < count; i++) {
      maxY = Math.max(maxY, position.getY(i));
      minY = Math.min(minY, position.getY(i));
    }
    for (let i = 0; i < count; i++) {
      mixed.copy(low).lerp(high, (position.getY(i) - minY) / Math.max(0.00001, maxY - minY));
      colors.set([mixed.r, mixed.g, mixed.b], i * 3);
    }
    geo.setAttribute('aU', new BufferAttribute(us, 1));
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    parts.push(geo);
  };
  const pos = new Vector3();
  const quat = new Quaternion();
  const mat4 = new Matrix4();
  for (let i = 0; i < 6; i++) {
    const u2 = 0.1 + i * 0.155;
    vinePoint(side, u2, pos);
    const outward = new Vector3(pos.x, 0, pos.z - 0.006).normalize();
    const leaf = new SphereGeometry(1, 8, 6);
    leaf.scale(0.018, 0.005, 0.034);
    leaf.translate(0, 0, 0.03);
    quat.setFromUnitVectors(
      new Vector3(0, 0, 1),
      outward
        .clone()
        .add(new Vector3(0, i % 2 ? 0.5 : -0.3, 0))
        .normalize(),
    );
    mat4.compose(pos, quat, new Vector3(1, 1, 1));
    leaf.applyMatrix4(mat4);
    addPart(leaf, u2 + 0.02, 4168261, 9429882);
  }
  for (let i = 0; i < 9; i++) {
    const u2 = 0.05 + i * 0.105;
    vinePoint(side, u2, pos);
    const dir = new Vector3(pos.x, 0.25, pos.z - 0.006).normalize();
    const thorn = new ConeGeometry(0.006, 0.028, 5);
    thorn.translate(0, 0.014, 0);
    quat.setFromUnitVectors(new Vector3(0, 1, 0), dir);
    mat4.compose(pos, quat, new Vector3(1, 1, 1));
    thorn.applyMatrix4(mat4);
    addPart(thorn, u2, 7027244, 14272410);
  }
  return (
    mergeGeometries(
      parts.map((part) => (part.index ? part.toNonIndexed() : part)),
      false,
    ) ?? stem
  );
}
export class HeroVines {
  meshes = [];
  grow = {
    value: 0,
  };
  k = 0;
  wasOn = false;
  shed = 0;
  v = new Vector3();
  constructor(ctx) {
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.8,
      metalness: 0,
      side: DoubleSide,
    });
    material.name = 'hero-vines';
    const grow = this.grow;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uVineGrow = grow;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute float aU;
varying float vVineU;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vVineU = aU;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform float uVineGrow;
varying float vVineU;`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
if (vVineU > uVineGrow) discard;`,
        );
    };
    patchToonMaterial(material, ctx, {
      key: 'wb-hero-vines-v1',
      rim: 0.8,
    });
    for (const side of [1, -1]) {
      const mesh = new Mesh(buildVineGeometry(side), material);
      mesh.name = 'hero-vines';
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.visible = false;
      this.meshes.push(mesh);
    }
  }
  update(dt, state, now, fx, ankles) {
    const slowed = Math.max(0, state.slowedUntil - now) > 0.02 && !state.dead;
    const target = +!!slowed;
    this.k += (target - this.k) * (1 - Math.exp(-(slowed ? 7 : 14) * Math.max(dt, 0.001)));
    if (!slowed && this.k < 0.01) this.k = 0;
    const visible = this.k > 0.005;
    this.grow.value = this.k * 1.02;
    const time = now;
    for (let i = 0; i < this.meshes.length; i++) {
      const mesh = this.meshes[i];
      mesh.visible = visible;
      if (!visible) continue;
      const amp = state.speed > 0.3 ? 1 : 0.4;
      mesh.rotation.set(0, Math.sin(time * 17 + i * 2) * 0.05 * amp * this.k, 0);
      mesh.scale.setScalar(0.96 + 0.04 * this.k + (slowed ? 0.02 * Math.sin(time * 9 + i) : 0));
    }
    if (!fx || dt <= 0) {
      this.wasOn = slowed;
      return;
    }
    if (this.wasOn && !slowed)
      for (const ankle of ankles)
        for (let i = 0; i < 10; i++) {
          const angle = Math.random() * Math.PI * 2;
          fx.vfx.emit({
            type: i % 3 == 0 ? VfxType.Fleck : VfxType.Drop,
            x: ankle.x + Math.cos(angle) * 0.08,
            y: ankle.y + 0.1 + Math.random() * 0.3,
            z: ankle.z + Math.sin(angle) * 0.08,
            vx: Math.cos(angle) * (1 + Math.random() * 1.5),
            vy: 1.5 + Math.random() * 2,
            vz: Math.sin(angle) * (1 + Math.random() * 1.5),
            size: 0.03 + Math.random() * 0.03,
            life: 0.7 + Math.random() * 0.4,
            color: i % 3 == 0 ? 2976303 : 7328619,
            alpha: 1,
            gravity: -9,
            drag: 1.2,
            spin: 6,
            floor: ankle.y - 0.05,
          });
        }
    else if (slowed && ((this.shed -= dt * (state.speed > 0.3 ? 5 : 1.5)), this.shed <= 0)) {
      this.shed += 1;
      const ankle = ankles[Math.random() < 0.5 ? 0 : 1];
      this.v.set(
        ankle.x + (Math.random() - 0.5) * 0.12,
        ankle.y + 0.1 + Math.random() * 0.35,
        ankle.z + (Math.random() - 0.5) * 0.12,
      );
      fx.vfx.emit({
        type: VfxType.Fleck,
        x: this.v.x,
        y: this.v.y,
        z: this.v.z,
        vx: (Math.random() - 0.5) * 0.8,
        vy: 0.6 + Math.random(),
        vz: (Math.random() - 0.5) * 0.8,
        size: 0.035,
        life: 0.9,
        color: 0x58d66b,
        alpha: 1,
        gravity: -5,
        drag: 1.5,
        spin: 5,
        floor: ankle.y - 0.05,
      });
    }
    this.wasOn = slowed;
  }
}
