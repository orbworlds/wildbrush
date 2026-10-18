/**
 * Ink webs that block temple passages until Ember burns them away: strands, thorns and eyes, charring, embers and the dissolve.
 */
import {
  BufferAttribute,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import { ParticleMode } from '../shared/particles.js';
import { mergeGeometries, randRange, rng, taperedTube, TAU } from '../shared/util.js';
import { _delta, _sparkPos, addCollider, removeCollider, sfx } from './props.js';
const WEB_COMMON_FRAGMENT = `
#include <wb_common>
uniform float uHeat;
uniform float uDissolve;
uniform vec3 uOrigin;
uniform float uSpan;
varying vec3 vWebW;
`;
const WEB_CLIP_FRAGMENT = `
float webN = wbNoise3(vWebW * 2.1) * 0.6 + wbNoise3(vWebW * 6.0) * 0.4;
float webD = length(vWebW - uOrigin) / uSpan;
float webM = webN - (uDissolve * 1.9 - webD * 0.6);
if (uDissolve > 0.0 && webM < 0.0) discard;
float webEdge = uDissolve > 0.0 ? 1.0 - smoothstep(0.0, 0.14, webM) : 0.0;
`;
const WEB_COLOR_FRAGMENT = `
{
  float front = clamp(uHeat * 1.8 - length(vWebW - uOrigin) / uSpan, 0.0, 1.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.025, 0.03), front * 0.8);
}
`;
const WEB_EMISSIVE_FRAGMENT = `
{
  float front = clamp(uHeat * 1.8 - length(vWebW - uOrigin) / uSpan, 0.0, 1.0);
  float hn = wbNoise3(vWebW * 3.0 + vec3(0.0, -uTime * 1.6, 0.0));
  float flick = 0.75 + 0.25 * sin(uTime * 15.0 + vWebW.x * 3.0 + vWebW.y * 2.0);
  vec3 ember = vec3(1.0, 0.36, 0.07);
  totalEmissiveRadiance += ember * front * smoothstep(0.4, 0.8, hn) * 3.2 * flick;
  totalEmissiveRadiance += mix(ember, vec3(1.0, 0.85, 0.45), webEdge) * webEdge * 5.0;
  // faint sickly sheen on untouched ink
  totalEmissiveRadiance += vec3(0.22, 0.14, 0.3) * (1.0 - front) * 0.12 * (0.6 + 0.4 * sin(uTime * 1.7 + vWebW.y * 2.0));
}
`;
export class InkWeb {
  ctx;
  center;
  alongX;
  width;
  height;
  particles;
  state = 'intact';
  mesh;
  col = null;
  u;
  t = 0;
  right;
  normal;
  onBurnt = null;
  constructor(ctx, center, alongX, width, height, root, particles, seed) {
    this.ctx = ctx;
    this.center = center;
    this.alongX = alongX;
    this.width = width;
    this.height = height;
    this.particles = particles;
    this.right = alongX ? new Vector3(1, 0, 0) : new Vector3(0, 0, 1);
    this.normal = alongX ? new Vector3(0, 0, 1) : new Vector3(1, 0, 0);
    const geometry = this.build(seed);
    this.u = {
      uHeat: {
        value: 0,
      },
      uDissolve: {
        value: 0,
      },
      uOrigin: {
        value: center.clone().add(new Vector3(0, height / 2, 0)),
      },
      uSpan: {
        value: Math.max(width, height),
      },
    };
    const globals = ctx.globals;
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.35,
      metalness: 0.1,
    });
    material.name = 'temple-inkweb';
    const uniforms = this.u;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, globals, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
varying vec3 vWebW;`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
vWebW = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${WEB_COMMON_FRAGMENT}`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${WEB_CLIP_FRAGMENT}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${WEB_COLOR_FRAGMENT}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${WEB_EMISSIVE_FRAGMENT}`);
    };
    material.customProgramCacheKey = () => 'wb-temple-inkweb-v1';
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'temple-inkweb';
    root.add(this.mesh);
    const hx = alongX ? width / 2 : 0.35;
    const hz = alongX ? 0.35 : width / 2;
    const desc = ctx.RAPIER.ColliderDesc.cuboid(hx, height / 2, hz).setTranslation(
      center.x,
      center.y + height / 2,
      center.z,
    );
    this.col = addCollider(ctx, desc, 'wood', this.mesh, 'web');
  }
  build(seed) {
    const rand = rng(`web-${seed}`);
    const width = this.width;
    const height = this.height;
    const parts = [];
    const core = this.center.clone().add(new Vector3(0, height * 0.5, 0));
    const at = (side, up, out = 0) =>
      core
        .clone()
        .addScaledVector(this.right, side)
        .add(new Vector3(0, up, 0))
        .addScaledVector(this.normal, out);
    const inkColor = new Color(0x1c1822);
    const sheenColor = new Color(0x4a3d58);
    const thornColor = new Color(0xe4ddd2);
    const addPart = (geometry, base, shimmer = 0) => {
      const count = geometry.attributes.position.count;
      const colors = new Float32Array(count * 3);
      const position = geometry.attributes.position;
      for (let i = 0; i < count; i++) {
        const wave = shimmer
          ? 0.5 + 0.5 * Math.sin(position.getY(i) * 4 + position.getX(i) * 3 + position.getZ(i) * 2)
          : 0;
        const col = base.clone().lerp(sheenColor, wave * 0.5);
        colors.set([col.r, col.g, col.b], i * 3);
      }
      geometry.setAttribute('color', new BufferAttribute(colors, 3));
      if (geometry.attributes.uv) geometry.deleteAttribute('uv');
      parts.push(geometry);
    };
    const anchors = [];
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * TAU + rand() * 0.2;
      const ax = Math.cos(ang) * width * 0.55;
      const ay = Math.sin(ang) * height * 0.55;
      anchors.push(
        at(
          Math.max(-width / 2 - 0.1, Math.min(width / 2 + 0.1, ax)),
          Math.max(-height / 2, Math.min(height / 2 + 0.1, ay)),
          (rand() - 0.5) * 0.3,
        ),
      );
    }
    const hub = at(randRange(rand, -0.3, 0.3), randRange(rand, -0.2, 0.3), 0);
    const strand = (points, radius) => {
      const curve = new CatmullRomCurve3(points, false, 'centripetal');
      const len = curve.getLength();
      const tube = taperedTube(
        curve,
        Math.max(8, Math.round(len * 4)),
        5,
        (u) => radius * (0.55 + 0.45 * Math.sin(u * Math.PI)) + 0.025,
      );
      addPart(tube, inkColor, 1);
      const thorns = Math.round(len * 2.2);
      const point = new Vector3();
      const tangent = new Vector3();
      const dir = new Vector3();
      for (let i = 0; i < thorns; i++) {
        const u = (i + rand()) / thorns;
        curve.getPointAt(u, point);
        curve.getTangentAt(u, tangent);
        dir
          .set(rand() - 0.5, rand() - 0.5, rand() - 0.5)
          .cross(tangent)
          .normalize();
        const thorn = new ConeGeometry(0.045, randRange(rand, 0.18, 0.34), 4);
        thorn.translate(0, 0.12, 0);
        thorn.applyMatrix4(
          new Matrix4().compose(
            point,
            new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir),
            new Vector3(1, 1, 1),
          ),
        );
        addPart(thorn, thornColor);
      }
    };
    for (const anchor of anchors) {
      const sag = hub
        .clone()
        .lerp(anchor, 0.5)
        .add(new Vector3(0, -randRange(rand, 0.1, 0.35), 0))
        .addScaledVector(this.normal, (rand() - 0.5) * 0.4);
      strand([hub.clone(), sag, anchor.clone()], randRange(rand, 0.06, 0.1));
    }
    for (const f of [0.3, 0.55, 0.8]) {
      const ring = [];
      for (let i = 0; i <= 12; i++) {
        const anchor = anchors[i % 12];
        ring.push(
          hub
            .clone()
            .lerp(anchor, f + (rand() - 0.5) * 0.08)
            .add(new Vector3(0, -0.12, 0)),
        );
      }
      strand(ring, 0.045);
    }
    const body = new SphereGeometry(0.34, 12, 8, 0, Math.PI);
    body.scale(1, 1.25, 0.35);
    const quat = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), this.normal);
    body.applyMatrix4(
      new Matrix4().compose(hub.clone().addScaledVector(this.normal, 0.08), quat, new Vector3(1, 1, 1)),
    );
    addPart(body, new Color(0xeee6d8));
    const back = body.clone();
    back.applyMatrix4(new Matrix4().makeTranslation(-hub.x, -hub.y, -hub.z));
    back.applyMatrix4(new Matrix4().makeRotationY(Math.PI));
    back.applyMatrix4(new Matrix4().makeTranslation(hub.x, hub.y, hub.z));
    parts.push(back);
    for (const side of [-1, 1]) {
      const eye = new SphereGeometry(0.05, 6, 4);
      eye.translate(0, 0, 0);
      const eyePos = hub
        .clone()
        .addScaledVector(this.right, side * 0.12)
        .add(new Vector3(0, 0.08, 0))
        .addScaledVector(this.normal, 0.2);
      eye.translate(eyePos.x, eyePos.y, eyePos.z);
      addPart(eye, new Color(0x15121a));
      const eye2 = new SphereGeometry(0.05, 6, 4);
      const eyePos2 = hub
        .clone()
        .addScaledVector(this.right, side * 0.12)
        .add(new Vector3(0, 0.08, 0))
        .addScaledVector(this.normal, -0.2);
      eye2.translate(eyePos2.x, eyePos2.y, eyePos2.z);
      addPart(eye2, new Color(0x15121a));
    }
    const merged = mergeGeometries(
      parts.map((part) => {
        part.index;
        return part;
      }),
    );
    for (const part of parts) part.dispose();
    return merged;
  }
  hits(p, reach) {
    _delta.copy(p).sub(this.center);
    const along = _delta.dot(this.right);
    const across = _delta.dot(this.normal);
    return (
      Math.abs(along) < this.width / 2 + reach + 0.3 &&
      Math.abs(across) < 0.8 + reach &&
      _delta.y > -1 - reach &&
      _delta.y < this.height + reach
    );
  }
  ignite(point) {
    if (this.state === 'intact') {
      this.state = 'burning';
      this.t = 0;
      this.u.uOrigin.value.copy(point);
      sfx(this.ctx, 'bramble-burn', this.center, 1);
    }
  }
  burnInstant() {
    this.state = 'gone';
    this.mesh.visible = false;
    removeCollider(this.ctx, this.col);
    this.col = null;
  }
  update(dt) {
    if (this.state !== 'burning') return;
    this.t += dt;
    this.u.uHeat.value = Math.min(1, this.t / 0.9);
    this.u.uDissolve.value = Math.max(0, Math.min(1, (this.t - 0.8) / 1.5));
    if (this.t > 1.25 && this.col) {
      removeCollider(this.ctx, this.col);
      this.col = null;
    }
    const particles = this.particles;
    if (particles) {
      const count = Math.random() < 0.5 ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const along = (Math.random() - 0.5) * this.width;
        const up = Math.random() * this.height;
        const pos = _sparkPos
          .copy(this.center)
          .addScaledVector(this.right, along)
          .add(_delta.set(0, up, 0));
        if (pos.distanceTo(this.u.uOrigin.value) > this.u.uHeat.value * 1.8 * this.u.uSpan.value) continue;
        const ember = Math.random() < 0.35;
        particles.spawn({
          x: pos.x,
          y: pos.y,
          z: pos.z,
          vx: (Math.random() - 0.5) * 0.6,
          vy: ember ? 2.5 + Math.random() * 2.5 : 1 + Math.random() * 1.4,
          vz: (Math.random() - 0.5) * 0.6,
          mode: ParticleMode.Rise,
          drag: ember ? 0.3 : 1.2,
          color: ember ? new Color(1, 0.8, 0.35) : new Color(1, 0.4, 0.12),
          bright: ember ? 3 : 1.8,
          size: ember ? 0.06 : 0.3 + Math.random() * 0.4,
          life: ember ? 1.4 : 0.5 + Math.random() * 0.4,
        });
      }
    }
    if (this.t > 2.4) {
      this.state = 'gone';
      this.mesh.visible = false;
      this.onBurnt?.();
    }
  }
}
