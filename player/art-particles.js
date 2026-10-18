/**
 * One instanced particle pool for every brush-art effect: flames, smoke, sparks, ice shards, stars, leaves, ground rings, shockwaves, glows, paint drops, mist, embers and snowflakes, each with its own look in a shared shader.
 */
import {
  AddEquation,
  CustomBlending,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
export const PARTICLE_TYPE = {
  Flame: 0,
  Smoke: 1,
  Spark: 2,
  Shard: 3,
  Star: 4,
  Leaf: 5,
  Ring: 6,
  Shock: 7,
  Glow: 8,
  Drop: 9,
  Mist: 10,
  Ember: 11,
  Snow: 12,
};
const MAX_PARTICLES = 1800;
const ART_PARTICLE_VERTEX = `
#include <wb_common>
attribute vec3 iPos;
attribute vec3 iVel;
attribute vec2 iSize;
attribute vec4 iColor;
attribute vec4 iData;
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vData;
varying float vNear;
void main() {
  vUv = uv;
  vColor = iColor;
  vData = iData;
  float type = iData.x;
  float rot = iData.y;
  vec2 q = position.xy;
  vec4 mv;
  if (type > 5.5 && type < 6.5) {
    // flat ring on the ground (xz plane)
    vec2 c = q * iSize.x;
    c = mat2(cos(rot), sin(rot), -sin(rot), cos(rot)) * c;
    mv = viewMatrix * vec4(iPos + vec3(c.x, 0.0, c.y), 1.0);
  } else if ((type > 1.5 && type < 3.5)) {
    // velocity-aligned streaks (sparks, shards): stretched along the screen-space velocity
    mv = viewMatrix * vec4(iPos, 1.0);
    vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
    vec2 d = vv.xy;
    float l = length(d);
    d = l > 1e-4 ? d / l : vec2(cos(rot), sin(rot));
    vec2 side = vec2(-d.y, d.x);
    float len = iSize.x * (1.0 + iSize.y);
    mv.xy += d * q.y * len + side * q.x * iSize.x;
  } else {
    vec2 c = q * iSize.x;
    c = mat2(cos(rot), sin(rot), -sin(rot), cos(rot)) * c;
    mv = viewMatrix * vec4(iPos, 1.0);
    mv.xy += c;
  }
  // fade out particles that brush past the lens (no screen-filling puffs)
  vNear = smoothstep(0.3, 1.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;
const ART_PARTICLE_FRAGMENT = `
#include <wb_common>
varying vec2 vUv;
varying vec4 vColor;
varying vec4 vData;
varying float vNear;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float type = vData.x;
  float t = vData.z;
  float seed = vData.w;
  vec3 light = uSkyColor * 0.5 + uSunColor * 0.75;
  vec3 rgb = vec3(0.0);
  float a = 0.0;      // coverage
  float occl = 1.0;   // how much it hides what is behind (0 = purely additive)
  if (type < 0.5) {
    // FLAME: noisy blob, three crisp bands (hot core → orange → red), cooling with age
    float n = wbNoise2(p * 2.3 + vec2(seed * 13.0, seed * 7.0 - uTime * 3.5));
    float n2 = wbNoise2(p * 5.1 + vec2(seed * 5.0, -uTime * 6.0));
    float d = r + (n - 0.5) * 0.55 + (n2 - 0.5) * 0.2 - p.y * 0.12;
    a = smoothstep(1.0, 0.72, d);
    float heat = (1.0 - d) * 1.5 - t * 1.1 + 0.1;
    vec3 cOut = vec3(0.62, 0.07, 0.02);
    vec3 cMid = vec3(0.95, 0.26, 0.03);
    vec3 cCore = vec3(1.0, 0.52, 0.08) * 1.25;
    vec3 cHot = vec3(1.0, 0.8, 0.36) * 1.7;
    vec3 c = mix(cOut, cMid, smoothstep(0.2, 0.26, heat));
    c = mix(c, cCore, smoothstep(0.46, 0.52, heat));
    c = mix(c, cHot, smoothstep(0.72, 0.78, heat));
    // cooled flame tips go dark (soot) near the end
    c = mix(c, vec3(0.14, 0.05, 0.03), smoothstep(0.5, 1.0, t) * (1.0 - smoothstep(0.15, 0.45, heat)));
    rgb = c * vColor.rgb;
    occl = 0.85;
  } else if (type < 1.5) {
    // SMOKE: lumpy soft puff, lit from above
    float n = wbNoise2(p * 2.2 + seed * 9.0 + vec2(0.0, -t * 1.5));
    a = smoothstep(1.0, 0.2, r + (n - 0.5) * 0.6);
    rgb = vColor.rgb * light * (0.75 + 0.35 * (0.5 - p.y * 0.5));
  } else if (type < 2.5) {
    // SPARK: bright tapered streak
    float w = max(0.0, 1.0 - abs(p.y));
    a = (1.0 - smoothstep(w * 0.25, w * 0.9 + 0.001, abs(p.x))) * smoothstep(1.0, 0.7, abs(p.y));
    rgb = vColor.rgb * (1.5 + 2.0 * (1.0 - abs(p.x) / max(w, 0.01)));
    occl = 0.0;
  } else if (type < 3.5) {
    // SHARD: faceted ice crystal (velocity aligned)
    float edge = abs(p.x) * 1.9 + abs(p.y);
    a = 1.0 - smoothstep(0.9, 1.0, edge);
    float facet = p.x > 0.0 ? 1.0 : 0.62;
    facet *= p.y > 0.0 ? 1.0 : 0.85;
    vec3 ice = mix(vec3(0.55, 0.8, 0.98), vec3(0.92, 0.98, 1.0), facet);
    rgb = ice * vColor.rgb * light * 1.15 + smoothstep(0.72, 0.95, edge) * vec3(0.9, 1.0, 1.1) * 0.9;
    occl = 0.9;
  } else if (type < 4.5) {
    // STAR: four-point twinkle with a hot core
    float ang = atan(p.y, p.x);
    float sp = pow(abs(cos(ang * 2.0)), 16.0);
    float rr = r / (0.14 + 0.86 * sp);
    a = 1.0 - smoothstep(0.35, 1.0, rr);
    a = max(a, exp(-r * r * 22.0));
    rgb = mix(vec3(1.0, 0.98, 0.94), vColor.rgb, smoothstep(0.08, 0.5, r)) * 2.4;
    occl = 0.0;
  } else if (type < 5.5) {
    // LEAF: pointed leaf with a midrib
    float y = p.y;
    float w = 0.55 * sqrt(max(0.0, 1.0 - y * y)) * (1.0 - 0.25 * y);
    a = 1.0 - smoothstep(w - 0.08, w, abs(p.x));
    float rib = 1.0 - smoothstep(0.0, 0.07, abs(p.x));
    vec3 c = vColor.rgb * (0.85 + 0.3 * (0.5 + 0.5 * y));
    c = mix(c, c * 0.55, rib * 0.7);
    c += vec3(0.1, 0.16, 0.02) * smoothstep(w - 0.2, w, abs(p.x));
    rgb = c * light;
    occl = 1.0;
  } else if (type < 7.5) {
    // RING (flat) / SHOCK (camera facing): a band that thins as it grows
    float th = 0.16 + 0.28 * (1.0 - t);
    a = smoothstep(1.0 - th, 1.0 - th * 0.5, r) * (1.0 - smoothstep(0.92, 1.0, r));
    rgb = mix(vec3(1.0), vColor.rgb, 0.6) * 1.8;
    occl = 0.15;
  } else if (type < 8.5) {
    // GLOW: soft radial halo (feeds bloom)
    float g = max(0.0, 1.0 - r);
    a = g * g * (0.35 + 0.65 * g);
    rgb = vColor.rgb;
    occl = 0.0;
  } else if (type < 9.5) {
    // DROP: glossy paint droplet
    a = smoothstep(1.0, 0.78, r);
    float hl = smoothstep(0.45, 0.0, length(p - vec2(-0.3, 0.35)));
    rgb = vColor.rgb * light * (0.8 + 0.25 * (1.0 - r)) + hl * 0.7;
  } else if (type < 10.5) {
    // MIST: bright cold vapour
    float n = wbNoise2(p * 1.8 + seed * 5.0 + vec2(t * 0.8, 0.0));
    a = smoothstep(1.0, 0.1, r + (n - 0.5) * 0.7) * 0.8;
    rgb = vColor.rgb * light * 1.1;
    occl = 0.7;
  } else if (type < 11.5) {
    // EMBER: small round flickering spark
    float fl = 0.6 + 0.4 * sin(uTime * 40.0 + seed * 60.0);
    a = exp(-r * r * 6.0) * (1.0 - smoothstep(0.8, 1.0, r));
    rgb = vColor.rgb * (1.2 + 2.0 * exp(-r * r * 18.0)) * fl;
    occl = 0.0;
  } else {
    // SNOW: six-point flake
    float ang = atan(p.y, p.x);
    float arms = pow(abs(cos(ang * 3.0)), 8.0);
    float rr = r / (0.3 + 0.7 * arms);
    a = (1.0 - smoothstep(0.6, 1.0, rr)) + exp(-r * r * 30.0);
    a = clamp(a, 0.0, 1.0);
    rgb = mix(vColor.rgb, vec3(1.0), 0.5) * 1.6;
    occl = 0.35;
  }
  a *= vColor.a * vNear;
  if (a < 0.004) discard;
  gl_FragColor = vec4(rgb * a, a * occl);
}
`;
export class ArtParticles {
  mesh;
  geo;
  aPos;
  aVel;
  aSize;
  aColor;
  aData;
  px = new Float32Array(MAX_PARTICLES);
  py = new Float32Array(MAX_PARTICLES);
  pz = new Float32Array(MAX_PARTICLES);
  vx = new Float32Array(MAX_PARTICLES);
  vy = new Float32Array(MAX_PARTICLES);
  vz = new Float32Array(MAX_PARTICLES);
  life = new Float32Array(MAX_PARTICLES);
  maxLife = new Float32Array(MAX_PARTICLES);
  size = new Float32Array(MAX_PARTICLES);
  grow = new Float32Array(MAX_PARTICLES);
  cr = new Float32Array(MAX_PARTICLES);
  cg = new Float32Array(MAX_PARTICLES);
  cb = new Float32Array(MAX_PARTICLES);
  alpha = new Float32Array(MAX_PARTICLES);
  grav = new Float32Array(MAX_PARTICLES);
  drag = new Float32Array(MAX_PARTICLES);
  rot = new Float32Array(MAX_PARTICLES);
  spin = new Float32Array(MAX_PARTICLES);
  stretch = new Float32Array(MAX_PARTICLES);
  floor = new Float32Array(MAX_PARTICLES);
  seed = new Float32Array(MAX_PARTICLES);
  type = new Uint8Array(MAX_PARTICLES);
  count = 0;
  q = 1;
  constructor(ctx) {
    const quad = new PlaneGeometry(1, 1);
    quad.scale(2, 2, 1);
    const geo = (this.geo = new InstancedBufferGeometry());
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    geo.setAttribute('uv', quad.attributes.uv);
    const instAttr = (itemSize) =>
      new InstancedBufferAttribute(new Float32Array(MAX_PARTICLES * itemSize), itemSize).setUsage(DynamicDrawUsage);
    this.aPos = instAttr(3);
    this.aVel = instAttr(3);
    this.aSize = instAttr(2);
    this.aColor = instAttr(4);
    this.aData = instAttr(4);
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iVel', this.aVel);
    geo.setAttribute('iSize', this.aSize);
    geo.setAttribute('iColor', this.aColor);
    geo.setAttribute('iData', this.aData);
    geo.instanceCount = 0;
    const material = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
      },
      vertexShader: ART_PARTICLE_VERTEX,
      fragmentShader: ART_PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      blendSrcAlpha: 201,
      blendDstAlpha: 205,
    });
    this.mesh = new Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'art-particles';
  }
  get live() {
    return this.count;
  }
  emit(p) {
    let slot = this.count;
    if (slot >= MAX_PARTICLES) {
      let oldest = 0;
      let minLife = 1000000000;
      for (let i = (Math.random() * 9) | 0; i < MAX_PARTICLES; i += 9)
        if (this.life[i] < minLife) {
          minLife = this.life[i];
          oldest = i;
        }
      slot = oldest;
    } else this.count++;
    this.px[slot] = p.x;
    this.py[slot] = p.y;
    this.pz[slot] = p.z;
    this.vx[slot] = p.vx ?? 0;
    this.vy[slot] = p.vy ?? 0;
    this.vz[slot] = p.vz ?? 0;
    this.life[slot] = p.life;
    this.maxLife[slot] = Math.max(0.0001, p.life);
    this.size[slot] = p.size;
    this.grow[slot] = p.grow ?? 1;
    this.cr[slot] = p.r;
    this.cg[slot] = p.g;
    this.cb[slot] = p.b;
    this.alpha[slot] = p.alpha ?? 1;
    this.grav[slot] = p.gravity ?? 0;
    this.drag[slot] = p.drag ?? 0;
    this.rot[slot] = Math.random() * Math.PI * 2;
    this.spin[slot] = p.spin ?? 0;
    this.stretch[slot] = p.stretch ?? 0;
    this.floor[slot] = p.floor ?? -1000000000;
    this.seed[slot] = Math.random();
    this.type[slot] = p.type;
  }
  update(dt) {
    const count = this.count;
    let live = 0;
    const posArr = this.aPos.array;
    const velArr = this.aVel.array;
    const sizeArr = this.aSize.array;
    const colorArr = this.aColor.array;
    const dataArr = this.aData.array;
    for (let i = 0; i < count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      if (dt > 0) {
        const damping = Math.exp(-this.drag[i] * dt);
        this.vx[i] *= damping;
        this.vy[i] = this.vy[i] * damping + this.grav[i] * dt;
        this.vz[i] *= damping;
        this.px[i] += this.vx[i] * dt;
        this.py[i] += this.vy[i] * dt;
        this.pz[i] += this.vz[i] * dt;
        this.rot[i] += this.spin[i] * dt;
        if (this.py[i] < this.floor[i]) {
          this.py[i] = this.floor[i];
          const type = this.type[i];
          if (type === PARTICLE_TYPE.Drop || type === PARTICLE_TYPE.Ember || type === PARTICLE_TYPE.Spark) {
            this.life[i] = 0;
            continue;
          }
          this.vy[i] = 0;
          this.vx[i] *= 0.6;
          this.vz[i] *= 0.6;
          this.spin[i] *= 0.5;
        }
      }
      if (live !== i) this.move(i, live);
      const age = 1 - this.life[live] / this.maxLife[live];
      const type = this.type[live];
      let fade;
      switch (type) {
        case PARTICLE_TYPE.Flame:
          fade = Math.min(1, age * 10) * (1 - age * age);
          break;
        case PARTICLE_TYPE.Smoke:
          fade = Math.min(1, age * 4) * (1 - age) * (1 - age);
          break;
        case PARTICLE_TYPE.Mist:
          fade = Math.min(1, age * 5) * (1 - age);
          break;
        case PARTICLE_TYPE.Star:
        case PARTICLE_TYPE.Shock:
        case PARTICLE_TYPE.Glow:
          fade = (1 - age) * (1 - age) * Math.min(1, age * 20 + 0.35);
          break;
        case PARTICLE_TYPE.Ring:
          fade = (1 - age) * Math.min(1, age * 12);
          break;
        case PARTICLE_TYPE.Spark:
        case PARTICLE_TYPE.Ember:
          fade = 1 - age * age * age;
          break;
        default:
          fade = 1 - Math.max(0, (age - 0.72) / 0.28);
      }
      const i3 = live * 3;
      posArr[i3] = this.px[live];
      posArr[i3 + 1] = this.py[live];
      posArr[i3 + 2] = this.pz[live];
      velArr[i3] = this.vx[live];
      velArr[i3 + 1] = this.vy[live];
      velArr[i3 + 2] = this.vz[live];
      const size = this.size[live] * (1 + (this.grow[live] - 1) * age);
      sizeArr[live * 2] = size;
      let stretch = this.stretch[live];
      if (type === PARTICLE_TYPE.Spark || type === PARTICLE_TYPE.Shard)
        stretch *= Math.hypot(this.vx[live], this.vy[live], this.vz[live]);
      sizeArr[live * 2 + 1] = stretch;
      const i4 = live * 4;
      colorArr[i4] = this.cr[live];
      colorArr[i4 + 1] = this.cg[live];
      colorArr[i4 + 2] = this.cb[live];
      colorArr[i4 + 3] = this.alpha[live] * fade;
      dataArr[i4] = type;
      dataArr[i4 + 1] = this.rot[live];
      dataArr[i4 + 2] = age;
      dataArr[i4 + 3] = this.seed[live];
      live++;
    }
    this.count = live;
    this.geo.instanceCount = live;
    if (live > 0)
      for (const attr of [this.aPos, this.aVel, this.aSize, this.aColor, this.aData]) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, live * attr.itemSize);
        attr.needsUpdate = true;
      }
    this.mesh.visible = live > 0;
  }
  move(from, to) {
    this.px[to] = this.px[from];
    this.py[to] = this.py[from];
    this.pz[to] = this.pz[from];
    this.vx[to] = this.vx[from];
    this.vy[to] = this.vy[from];
    this.vz[to] = this.vz[from];
    this.life[to] = this.life[from];
    this.maxLife[to] = this.maxLife[from];
    this.size[to] = this.size[from];
    this.grow[to] = this.grow[from];
    this.cr[to] = this.cr[from];
    this.cg[to] = this.cg[from];
    this.cb[to] = this.cb[from];
    this.alpha[to] = this.alpha[from];
    this.grav[to] = this.grav[from];
    this.drag[to] = this.drag[from];
    this.rot[to] = this.rot[from];
    this.spin[to] = this.spin[from];
    this.stretch[to] = this.stretch[from];
    this.floor[to] = this.floor[from];
    this.seed[to] = this.seed[from];
    this.type[to] = this.type[from];
  }
}
