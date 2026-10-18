/**
 * Bramble gate: a thorny procedural thicket that bars the canyon into the grove. Only red paint or fire burns it; it chars, glows with embers and dissolves away.
 */
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  MathUtils,
  Matrix4,
  Mesh,
  MeshDepthMaterial,
  MeshStandardMaterial,
  Quaternion,
  RGBADepthPacking,
  Vector3,
} from 'three';
import { COLLISION_GROUPS, PALETTE } from '../core/config.js';
import { ParticleMode } from '../shared/particles.js';
import { colorize, fillAttribute, mergeGeometries, randRange, rng, taperedTube, TAU } from '../shared/util.js';
const BRAMBLE_PARS_VERTEX = `
attribute float aSeed;
varying vec3 vBrPos;
varying float vBrSeed;
`;
const BRAMBLE_WORLDPOS_VERTEX = `
{
  vec4 bw = modelMatrix * vec4(transformed, 1.0);
  vBrPos = bw.xyz;
  vBrSeed = aSeed;
}
`;
const BRAMBLE_PARS_FRAGMENT = `
#include <wb_common>
uniform float uHeat;
uniform float uDissolve;
uniform vec3 uOrigin;
uniform float uGround;
uniform float uSpan;
varying vec3 vBrPos;
varying float vBrSeed;
float brMask(out float edge, out float stump) {
  float n = wbNoise3(vBrPos * 1.9) * 0.6 + wbNoise3(vBrPos * 5.3) * 0.25 + vBrSeed * 0.15;
  float d = length(vBrPos - uOrigin) / uSpan;
  float front = uDissolve * 1.7 - d * 0.55;
  stump = 1.0 - smoothstep(uGround + 0.25, uGround + 0.45, vBrPos.y);
  float m = n - front;
  edge = 1.0 - smoothstep(0.0, 0.12, m);
  return m;
}
`;
const BRAMBLE_DISCARD_FRAGMENT = `
float brEdge, brStump;
float brM = brMask(brEdge, brStump);
if (brStump < 0.5 && brM < 0.0 && uDissolve > 0.0) discard;
`;
const BRAMBLE_CHAR_FRAGMENT = `
{
  float heatN = wbNoise3(vBrPos * 3.0 + vec3(0.0, -uTime * 1.5, 0.0));
  float heatFront = clamp(uHeat * 1.6 - length(vBrPos - uOrigin) / uSpan * 0.9, 0.0, 1.0);
  float charV = max(heatFront, brStump * step(0.001, uDissolve));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.03, 0.03), clamp(charV * 0.9, 0.0, 1.0));
}
`;
const BRAMBLE_EMBER_FRAGMENT = `
{
  float heatN = wbNoise3(vBrPos * 3.0 + vec3(0.0, -uTime * 1.5, 0.0));
  float heatFront = clamp(uHeat * 1.6 - length(vBrPos - uOrigin) / uSpan * 0.9, 0.0, 1.0);
  float flick = 0.7 + 0.3 * sin(uTime * 17.0 + vBrPos.x * 3.0 + vBrPos.y * 2.0);
  vec3 ember = vec3(1.0, 0.36, 0.07);
  totalEmissiveRadiance += ember * heatFront * smoothstep(0.45, 0.8, heatN) * 3.5 * flick;
  if (uDissolve > 0.0 && brStump < 0.5) totalEmissiveRadiance += mix(ember, vec3(1.0, 0.8, 0.4), brEdge) * brEdge * 6.0;
}
`;
export class Bramble {
  ctx;
  particles;
  yaw;
  width;
  height;
  depth;
  state = 'intact';
  center;
  mesh;
  collider = null;
  u;
  heatT = 0;
  dissolveT = 0;
  burntRequested = false;
  spreadTimers = [];
  pendingSplat = null;
  emberColor = new Color(1, 0.45, 0.12);
  flameColor = new Color(PALETTE.red.hex);
  yellow = new Color(1, 0.78, 0.3);
  tmp = new Vector3();
  right;
  fwd;
  offs = [];
  constructor(ctx, particles, center, yaw, width, height, depth) {
    this.ctx = ctx;
    this.particles = particles;
    this.yaw = yaw;
    this.width = width;
    this.height = height;
    this.depth = depth;
    this.center = center.clone();
    this.right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    this.fwd = new Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const geometry = this.buildGeometry();
    const globals = ctx.globals;
    this.u = {
      uHeat: {
        value: 0,
      },
      uDissolve: {
        value: 0,
      },
      uOrigin: {
        value: center.clone().add(new Vector3(0, height * 0.4, 0)),
      },
      uGround: {
        value: center.y,
      },
      uSpan: {
        value: Math.max(width, height),
      },
    };
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.72,
      metalness: 0.05,
    });
    material.name = 'content-bramble';
    const uniforms = this.u;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, globals, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `${BRAMBLE_PARS_VERTEX}\nvoid main() {`)
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${BRAMBLE_WORLDPOS_VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${BRAMBLE_PARS_FRAGMENT}\nvoid main() {`)
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>\n${BRAMBLE_DISCARD_FRAGMENT}`,
        )
        .replace('#include <color_fragment>', `#include <color_fragment>\n${BRAMBLE_CHAR_FRAGMENT}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${BRAMBLE_EMBER_FRAGMENT}`);
    };
    material.customProgramCacheKey = () => 'wb-content-bramble-v1';
    try {
      ctx.paint.patchMaterial(material, {
        paint: true,
        vitality: false,
      });
    } catch {}
    this.mesh = new Mesh(geometry, material);
    this.mesh.name = 'content-bramble';
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    const depthMaterial = new MeshDepthMaterial({
      depthPacking: RGBADepthPacking,
    });
    depthMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, globals, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `${BRAMBLE_PARS_VERTEX}\nvoid main() {`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${BRAMBLE_WORLDPOS_VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('void main() {', `${BRAMBLE_PARS_FRAGMENT}\nvoid main() {`)
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>\n${BRAMBLE_DISCARD_FRAGMENT}`,
        );
    };
    depthMaterial.customProgramCacheKey = () => 'wb-content-bramble-depth-v1';
    this.mesh.customDepthMaterial = depthMaterial;
    ctx.scene.add(this.mesh);
    try {
      const quat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw);
      const desc = ctx.RAPIER.ColliderDesc.cuboid(width / 2 + 0.6, height / 2 + 1, depth / 2)
        .setTranslation(center.x, center.y + height / 2 - 0.5, center.z)
        .setRotation({
          x: quat.x,
          y: quat.y,
          z: quat.z,
          w: quat.w,
        })
        .setCollisionGroups(COLLISION_GROUPS.static)
        .setFriction(0.6);
      this.collider = ctx.physics.createCollider(desc);
      ctx.colliders.register(this.collider, {
        kind: 'bramble',
        surface: 'wood',
        flammable: true,
        object: this.mesh,
      });
    } catch (err) {
      console.warn('[content] bramble collider failed', err);
    }
    try {
      for (const frac of [-0.33, 0, 0.33]) {
        const pos = center
          .clone()
          .addScaledVector(this.right, frac * width)
          .add(new Vector3(0, height * 0.4, 0));
        ctx.elements.addFlammable({
          position: pos,
          radius: Math.max(2.5, width * 0.36),
          onIgnite: () => this.ignite(pos),
          onBurnt: () => this.burnt(),
        });
      }
    } catch (err) {
      console.warn('[content] addFlammable failed', err);
    }
    this.offs.push(
      ctx.events.on('paint:splat', (splat) => {
        if (splat.color === 'red' && this.state === 'intact' && this.contains(splat.position, 1.6))
          if (ctx.elements.isStub) this.ignite(splat.position.clone());
          else
            this.pendingSplat ||= {
              t: 1.2,
              p: splat.position.clone(),
            };
      }),
      ctx.events.on('fire:ignite', (fire) => {
        if (this.state === 'intact' && this.contains(fire.position, 2.2)) this.ignite(fire.position.clone());
      }),
    );
  }
  contains(point, margin = 0) {
    this.tmp.copy(point).sub(this.center);
    const dx = this.tmp.dot(this.right);
    const dz = this.tmp.dot(this.fwd);
    return (
      Math.abs(dx) < this.width / 2 + margin &&
      Math.abs(dz) < this.depth / 2 + margin &&
      this.tmp.y > -1.5 &&
      this.tmp.y < this.height + margin
    );
  }
  buildGeometry() {
    const rand = rng('bramble');
    const width = this.width;
    const height = this.height;
    const depth = this.depth;
    const parts = [];
    const stemColor = new Color(0x3e3045);
    const stemLight = new Color(0x76637c);
    const thornColor = new Color(0xd9ccc4);
    const leafColor = new Color(0x4a2238);
    const leafLight = new Color(0x6e3a4e);
    const at = (x, y, z) =>
      this.center
        .clone()
        .addScaledVector(this.right, x)
        .addScaledVector(this.fwd, z)
        .add(new Vector3(0, y, 0));
    const strands = Math.round(width * 6.5);
    const thornCone = new ConeGeometry(1, 1, 4, 1);
    thornCone.translate(0, 0.5, 0);
    const up = new Vector3(0, 1, 0);
    const point = new Vector3();
    const tangent = new Vector3();
    const dir = new Vector3();
    const mat4 = new Matrix4();
    const quat = new Quaternion();
    for (let i = 0; i < strands; i++) {
      const points = [];
      const roll = rand();
      let px = randRange(rand, -width / 2 - 0.8, width / 2 + 0.8);
      let pz = randRange(rand, -depth / 2, depth / 2);
      let py = -0.3;
      const reach = height * randRange(rand, 0.45, 1.12);
      const segs = 5 + Math.floor(rand() * 3);
      if (roll < 0.25) {
        py = randRange(rand, 0.3, height * 0.8);
        px = -width / 2 - 1;
        for (let j = 0; j <= segs; j++) {
          const u = j / segs;
          points.push(
            at(
              -width / 2 - 1 + (width + 2) * u,
              py + Math.sin(u * Math.PI) * randRange(rand, 0.5, 1.8) + (rand() - 0.5) * 0.8,
              pz + (rand() - 0.5) * 1.2,
            ),
          );
        }
      } else {
        for (let j = 0; j <= segs; j++) {
          const u = j / segs;
          points.push(at(px, py, pz));
          py = -0.3 + reach * (u + 1 / segs) ** 0.9;
          px += (rand() - 0.5) * 2.2;
          pz += (rand() - 0.5) * 1.1;
          pz = MathUtils.clamp(pz, -depth / 2 - 0.4, depth / 2 + 0.4);
        }
        const last = points[points.length - 1];
        points.push(
          last.clone().add(new Vector3((rand() - 0.5) * 1.5, -randRange(rand, 0.4, 1.2), (rand() - 0.5) * 1.5)),
        );
      }
      const curve = new CatmullRomCurve3(points, false, 'centripetal');
      const len = curve.getLength();
      const thick = roll > 0.82;
      const radius = thick ? randRange(rand, 0.2, 0.32) : randRange(rand, 0.09, 0.19);
      const stem = taperedTube(curve, Math.max(12, Math.round(len * 5)), 6, (t) => radius * (1 - t * 0.8) + 0.02);
      colorize(stem, stemColor);
      const colors = stem.attributes.color;
      const position = stem.attributes.position;
      for (let j = 0; j < colors.count; j++) {
        const stripe = 0.5 + 0.5 * Math.sin(position.getY(j) * 5 + position.getX(j) * 3);
        const tint = stemColor.clone().lerp(stemLight, stripe * 0.6);
        colors.setXYZ(j, tint.r, tint.g, tint.b);
      }
      fillAttribute(stem, 'aSeed', 1, rand());
      parts.push(stem);
      const thornCount = Math.round(len * (thick ? 6 : 4.5));
      const leafCount = Math.round(len * 2.2);
      for (let j = 0; j < leafCount; j++) {
        const u = rand();
        curve.getPointAt(u, point);
        const leaf = new BufferGeometry();
        const size = randRange(rand, 0.14, 0.26);
        leaf.setAttribute(
          'position',
          new Float32BufferAttribute(
            [0, 0, 0, size * 0.45, 0.05, size * 0.5, 0, 0.02, size, -size * 0.45, 0.05, size * 0.5],
            3,
          ),
        );
        leaf.setIndex([0, 1, 2, 0, 2, 3]);
        leaf.computeVertexNormals();
        mat4.compose(
          point,
          quat.setFromEuler(new Euler(randRange(rand, -1.2, 1.2), rand() * TAU, randRange(rand, -0.8, 0.8))),
          new Vector3(1, 1, 1),
        );
        leaf.applyMatrix4(mat4);
        colorize(leaf, leafColor.clone().lerp(leafLight, rand()));
        fillAttribute(leaf, 'aSeed', 1, rand());
        parts.push(leaf);
      }
      for (let j = 0; j < thornCount; j++) {
        const frac = (j + rand() * 0.5) / thornCount;
        curve.getPointAt(frac, point);
        curve.getTangentAt(frac, tangent);
        dir
          .set(rand() - 0.5, rand() - 0.5, rand() - 0.5)
          .cross(tangent)
          .normalize();
        dir.addScaledVector(tangent, -0.35).normalize();
        const stemR = radius * (1 - frac * 0.8) + 0.02;
        const thornLen = randRange(rand, 0.16, 0.36) * (1.2 - frac * 0.5) * (thick ? 1.5 : 1);
        quat.setFromUnitVectors(up, dir);
        mat4.compose(
          point.clone().addScaledVector(dir, stemR * 0.7),
          quat,
          new Vector3(randRange(rand, 0.03, 0.055), thornLen, randRange(rand, 0.03, 0.055)),
        );
        const thorn = thornCone.clone();
        thorn.deleteAttribute('uv');
        thorn.applyMatrix4(mat4);
        colorize(thorn, thornColor);
        const colors = thorn.attributes.color;
        const position = thorn.attributes.position;
        for (let k = 0; k < colors.count; k++) {
          const along = Math.min(
            1,
            point.distanceTo(new Vector3(position.getX(k), position.getY(k), position.getZ(k))) / thornLen,
          );
          const tint = stemColor.clone().lerp(thornColor, along);
          colors.setXYZ(k, tint.r, tint.g, tint.b);
        }
        fillAttribute(thorn, 'aSeed', 1, rand());
        parts.push(thorn);
      }
    }
    for (let i = 0; i < 14; i++) {
      const pos = at(
        randRange(rand, -width / 2, width / 2),
        randRange(rand, 0.8, height * 0.95),
        randRange(rand, -depth / 2, depth / 2),
      );
      const burr = new IcosahedronGeometry(randRange(rand, 0.14, 0.24), 0);
      burr.deleteAttribute('uv');
      const position = burr.attributes.position;
      for (let j = 0; j < position.count; j++) {
        const scale = 1 + (j % 3 == 0 ? 0.9 : 0);
        position.setXYZ(j, position.getX(j) * scale, position.getY(j) * scale, position.getZ(j) * scale);
      }
      burr.computeVertexNormals();
      burr.translate(pos.x, pos.y, pos.z);
      colorize(burr, 7024458);
      fillAttribute(burr, 'aSeed', 1, rand());
      parts.push(burr);
    }
    const merged = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    thornCone.dispose();
    return merged;
  }
  ignite(point) {
    if (this.state === 'intact') {
      this.state = 'burning';
      this.heatT = 0;
      this.u.uOrigin.value.copy(point);
      for (const frac of [-0.45, -0.2, 0.2, 0.45]) {
        const pos = this.center
          .clone()
          .addScaledVector(this.right, frac * this.width)
          .add(new Vector3(0, 0.8, 0));
        this.spreadTimers.push({
          t: 0.5 + Math.abs(frac) * 2.5,
          p: pos,
        });
      }
    }
  }
  burnt() {
    if (!(this.state === 'gone' || this.state === 'dissolving' || this.burntRequested)) {
      this.burntRequested = true;
      if (this.state === 'intact') this.ignite(this.center.clone().add(new Vector3(0, 1, 0)));
      this.startDissolve();
    }
  }
  startDissolve() {
    if (this.state !== 'dissolving' && this.state !== 'gone') {
      this.state = 'dissolving';
      this.dissolveT = 0;
      try {
        this.ctx.audio.play('bramble-burn', {
          position: this.center,
        });
      } catch {}
    }
  }
  removeCollider() {
    if (this.collider) {
      try {
        this.ctx.colliders.unregister(this.collider);
        this.ctx.physics.removeCollider(this.collider, false);
      } catch (err) {
        console.warn('[content] bramble collider removal failed', err);
      }
      this.collider = null;
    }
  }
  emitFire(dt, intensity) {
    const rate = intensity * dt * 90;
    let count = Math.floor(rate) + +(Math.random() < rate % 1);
    for (; count-- > 0;) {
      const x = (Math.random() - 0.5) * this.width;
      const z = (Math.random() - 0.5) * this.depth;
      const y = Math.random() * this.height * 0.85;
      const pos = this.center
        .clone()
        .addScaledVector(this.right, x)
        .addScaledVector(this.fwd, z)
        .add(new Vector3(0, y, 0));
      if (pos.distanceTo(this.u.uOrigin.value) / Math.max(this.width, this.height) > this.u.uHeat.value * 1.6) continue;
      const spark = Math.random() < 0.3;
      this.particles.spawn({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: (Math.random() - 0.5) * 0.6,
        vy: spark ? 2.5 + Math.random() * 3 : 1.2 + Math.random() * 1.6,
        vz: (Math.random() - 0.5) * 0.6,
        mode: ParticleMode.Rise,
        drag: spark ? 0.3 : 1.2,
        color: spark ? this.yellow : Math.random() < 0.5 ? this.emberColor : this.flameColor,
        bright: spark ? 3 : 1.8,
        size: spark ? 0.06 + Math.random() * 0.06 : 0.35 + Math.random() * 0.5,
        life: spark ? 1.5 + Math.random() * 1.5 : 0.5 + Math.random() * 0.5,
      });
    }
  }
  update(dt) {
    if (this.pendingSplat) {
      this.pendingSplat.t -= dt;
      if (this.state !== 'intact') this.pendingSplat = null;
      else if (this.pendingSplat.t <= 0) {
        const pos = this.pendingSplat.p;
        this.pendingSplat = null;
        try {
          this.ctx.elements.ignite(pos, 2);
        } catch {}
        this.ignite(pos);
      }
    }
    if (this.state === 'burning' || this.state === 'dissolving') {
      this.heatT += dt;
      this.u.uHeat.value = Math.min(1, this.heatT / 2.2);
      for (const timer of this.spreadTimers)
        if (timer.t > 0 && ((timer.t -= dt), timer.t <= 0))
          try {
            this.ctx.elements.ignite(timer.p, 2.5);
          } catch {}
      this.emitFire(dt, this.state === 'burning' ? 1 : Math.max(0, 1 - this.dissolveT / 2.5));
      const burnTime = this.ctx.elements.isStub ? 4.2 : 9;
      if (this.state === 'burning' && this.heatT > burnTime) this.burnt();
    }
    if (this.state === 'dissolving') {
      this.dissolveT += dt;
      const dissolve = Math.min(1, this.dissolveT / 2.8);
      this.u.uDissolve.value = dissolve;
      if (dissolve > 0.35) this.removeCollider();
      if (dissolve >= 1) {
        this.state = 'gone';
        this.removeCollider();
        this.u.uHeat.value = 0;
      }
    }
  }
  dispose() {
    for (const off of this.offs) off();
    this.removeCollider();
    this.ctx.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}
