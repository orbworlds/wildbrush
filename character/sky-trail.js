/**
 * Sky trail: the paint stroke the brush leaves behind while flying, a camera-facing ribbon smoothed with Catmull-Rom splines, with bristle streaks and dry-brush breakup, that fades with age.
 */
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  ShaderMaterial,
  Sphere,
  UniformsLib,
  Vector3,
} from 'three';
import { RAINBOW_GLSL, rainbowUniform } from './chroma-brush.js';
const SKYTRAIL_STROKES = 4;
const SKYTRAIL_MAX_POINTS = 200;
const SKYTRAIL_SUBDIV = 3;
const SKYTRAIL_MAX_SAMPLES = 598;
const SKYTRAIL_MAX_VERTS = SKYTRAIL_STROKES * SKYTRAIL_MAX_SAMPLES * 2;
const SKYTRAIL_STRIDE = 11;
function skytrailCatmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
export class SkyTrail {
  mesh;
  life = 5.5;
  strokes = [];
  cur = null;
  geo;
  pos;
  tan;
  info;
  style;
  col;
  index;
  g = new Float32Array(SKYTRAIL_MAX_SAMPLES * SKYTRAIL_STRIDE);
  seedN = 7;
  constructor(ctx) {
    for (let i = 0; i < SKYTRAIL_STROKES; i++)
      this.strokes.push({
        alive: false,
        live: false,
        n: 0,
        d: new Float32Array(2200),
        seed: 0,
        endTime: 0,
      });
    const geometry = (this.geo = new BufferGeometry());
    const dynamicAttr = (count, itemSize) =>
      new BufferAttribute(new Float32Array(count * itemSize), itemSize).setUsage(DynamicDrawUsage);
    this.pos = dynamicAttr(SKYTRAIL_MAX_VERTS, 3);
    this.tan = dynamicAttr(SKYTRAIL_MAX_VERTS, 3);
    this.info = dynamicAttr(SKYTRAIL_MAX_VERTS, 4);
    this.style = dynamicAttr(SKYTRAIL_MAX_VERTS, 4);
    this.col = dynamicAttr(SKYTRAIL_MAX_VERTS, 3);
    this.index = new BufferAttribute(new Uint16Array(SKYTRAIL_STROKES * 597 * 6), 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.pos);
    geometry.setAttribute('aTan', this.tan);
    geometry.setAttribute('aInfo', this.info);
    geometry.setAttribute('aStyle', this.style);
    geometry.setAttribute('aColor', this.col);
    geometry.setIndex(this.index);
    geometry.setDrawRange(0, 0);
    geometry.boundingSphere = new Sphere(new Vector3(), 100000);
    const material = new ShaderMaterial({
      uniforms: {
        ...UniformsLib.fog,
        ...ctx.globals,
        uRb: rainbowUniform(),
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      fog: true,
      vertexShader: `
        #include <wb_common>
        #include <fog_pars_vertex>
        attribute vec3 aTan;
        attribute vec4 aInfo;   // age01, along (m), from head (m), side (-1 / +1)
        attribute vec4 aStyle;  // width (m), glow, rainbow, seed
        attribute vec3 aColor;
        varying vec2 vUv;
        varying vec4 vInfo;
        varying vec4 vStyle;
        varying vec3 vColor;
        varying float vNear;
        void main() {
          vInfo = aInfo;
          vStyle = aStyle;
          vColor = aColor;
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          vec3 toCam = cameraPosition - wp;
          float camD = length(toCam);
          vec3 side = cross(aTan, toCam / max(camD, 1e-4));
          float sl = length(side);
          side = sl > 1e-3 ? side / sl : vec3(0.0, 1.0, 0.0);
          wp += side * aInfo.w * aStyle.x * 0.5;
          vUv = vec2(aInfo.y, aInfo.w * 0.5 + 0.5);
          // never paint over the lens: fade the stroke where it passes right by the camera
          vNear = smoothstep(1.2, 4.5, camD);
          vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }
      `,
      fragmentShader: `
        #include <wb_common>
        #include <fog_pars_fragment>
        ${RAINBOW_GLSL}
        varying vec2 vUv;
        varying vec4 vInfo;
        varying vec4 vStyle;
        varying vec3 vColor;
        varying float vNear;
        void main() {
          float along = vUv.x;
          float v = vUv.y;                        // 0 .. 1 across the stroke
          float age = clamp(vInfo.x, 0.0, 1.0);
          float fromHead = vInfo.z;
          float glow = vStyle.y;
          float seed = vStyle.w;
          // bristle streaks running along the stroke (long lanes, finer hairs, broad loading)
          float s1 = wbNoise2(vec2(v * 15.0 + seed, along * 0.3 + seed * 0.37));
          float s2 = wbNoise2(vec2(v * 46.0 - seed * 1.7, along * 0.8 + 4.1));
          float s3 = wbNoise2(vec2(v * 4.0 + seed * 3.1, along * 0.1));
          float streak = s1 * 0.5 + s2 * 0.32 + s3 * 0.18;
          // pigment loading along the stroke: the brush runs richer, then thinner
          float load = wbNoise2(vec2(along * 0.045 + seed, seed * 0.3)) * 0.65 + wbNoise2(vec2(along * 0.16, seed + 5.0)) * 0.35;
          // both edges ragged like a loaded flat brush pulled sideways
          float e0 = 0.06 + (s2 - 0.5) * 0.1 + (s3 - 0.5) * 0.14;
          float e1 = 0.92 + (s1 - 0.5) * 0.1 - (s3 - 0.5) * 0.16;
          float body = smoothstep(e0 - 0.03, e0 + 0.03, v) * (1.0 - smoothstep(e1 - 0.03, e1 + 0.02, v));
          // dry-brush breakup: the tail dries first; speed and thin pigment leave "flying white"
          float edge = abs(v - 0.5) * 2.0;
          float dry = age * age * 0.55 + age * 0.45;
          float thresh = 0.02 + (1.0 - load) * 0.2 + glow * 0.1 + dry * 1.0 + edge * edge * (0.28 + 0.35 * age);
          float a = body * smoothstep(thresh - 0.045, thresh + 0.045, streak);
          // grows out of the bristles
          a *= smoothstep(0.0, 0.35, fromHead);
          a *= vNear;
          if (a < 0.02) discard;
          vec3 paint = vColor;
          if (vStyle.z > 0.5) paint = wbRb(v * 3.4 + along * 0.08 + seed * 0.7 - uTime * 0.6 + (s1 - 0.5) * 0.35);
          float wet = 1.0 - smoothstep(0.0, 0.4, age);
          float rim = max(1.0 - smoothstep(0.0, 0.16, v), 1.0 - smoothstep(0.0, 0.16, 1.0 - v));
          // watercolour-ish body: darker hairlines, richer where loaded, pooled pigment at the rims
          vec3 col = paint * (0.5 + 0.62 * streak) * (0.8 + 0.35 * load);
          col *= 0.82 + 0.3 * s2;
          col = mix(col, paint * paint * 0.7, rim * 0.55);
          float lum = dot(uSunColor * 0.75 + uSkyColor * 0.35, vec3(0.3333));
          col *= mix(1.0, lum, 0.3);
          // a broken wet gloss on the fresh paint
          float gloss = (1.0 - smoothstep(0.0, 0.05, abs(v - 0.28 - (s3 - 0.5) * 0.1))) * wet * smoothstep(0.45, 0.75, s1);
          col += vec3(1.0, 0.98, 0.94) * gloss * 0.45;
          col += paint * wet * 0.12;
          // boosting: the paint burns brighter with a luminous core
          col += paint * glow * (0.3 + 0.35 * wet) + vec3(1.0, 0.97, 0.9) * glow * wet * 0.14 * (1.0 - smoothstep(0.1, 0.45, abs(v - 0.5)));
          col += paint * vStyle.z * (0.15 + 0.25 * wet);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }
      `,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'hero-skytrail';
  }
  get active() {
    return this.cur !== null;
  }
  begin(time) {
    this.end(time);
    let slot = this.strokes.find((stroke) => !stroke.alive);
    if (!slot) {
      slot = this.strokes[0];
      for (const stroke of this.strokes) if (stroke.endTime < slot.endTime) slot = stroke;
    }
    slot.alive = true;
    slot.live = true;
    slot.n = 0;
    slot.seed = ((this.seedN = (this.seedN * 16807) % 2147483647) % 1000) / 37;
    slot.endTime = 1000000000;
    this.cur = slot;
  }
  end(time) {
    if (this.cur) {
      this.cur.live = false;
      this.cur.endTime = time;
      if (this.cur.n < 2) this.cur.alive = false;
    }
    this.cur = null;
  }
  push(point, width, glow, color, rainbow, minStep, time) {
    const cur = this.cur;
    if (!cur || !Number.isFinite(point.x + point.y + point.z)) return;
    const data = cur.d;
    let idx = cur.n;
    let along = 0;
    if (idx >= 1) {
      const last = (idx - 1) * SKYTRAIL_STRIDE;
      const lx = data[last];
      const ly = data[last + 1];
      const lz = data[last + 2];
      if (idx >= 2) {
        const prev = (idx - 2) * SKYTRAIL_STRIDE;
        const dist = Math.hypot(point.x - data[prev], point.y - data[prev + 1], point.z - data[prev + 2]);
        if (dist < minStep) {
          --idx;
          along = data[prev + 9] + dist;
        } else along = data[last + 9] + Math.hypot(point.x - lx, point.y - ly, point.z - lz);
      } else along = data[last + 9] + Math.hypot(point.x - lx, point.y - ly, point.z - lz);
    }
    if (idx >= SKYTRAIL_MAX_POINTS) {
      data.copyWithin(0, SKYTRAIL_STRIDE);
      idx = 199;
      cur.n = 199;
    }
    const at = idx * SKYTRAIL_STRIDE;
    data[at] = point.x;
    data[at + 1] = point.y;
    data[at + 2] = point.z;
    data[at + 3] = time;
    data[at + 4] = width;
    data[at + 5] = glow;
    data[at + 6] = color.r;
    data[at + 7] = color.g;
    data[at + 8] = color.b;
    data[at + 9] = along;
    data[at + 10] = +!!rainbow;
    cur.n = Math.max(cur.n, idx + 1);
  }
  update(time) {
    const posArr = this.pos.array;
    const tanArr = this.tan.array;
    const infoArr = this.info.array;
    const styleArr = this.style.array;
    const colArr = this.col.array;
    const indexArr = this.index.array;
    const life = this.life;
    let vertCount = 0;
    let indexCount = 0;
    for (const stroke of this.strokes) {
      if (!stroke.alive) continue;
      let expired = 0;
      for (; expired < stroke.n - 1 && time - stroke.d[expired * SKYTRAIL_STRIDE + 3] > life;) expired++;
      if (expired > 0) {
        stroke.d.copyWithin(0, expired * SKYTRAIL_STRIDE, stroke.n * SKYTRAIL_STRIDE);
        stroke.n -= expired;
      }
      if (!stroke.live && (stroke.n < 2 || time - stroke.d[(stroke.n - 1) * SKYTRAIL_STRIDE + 3] > life)) {
        stroke.alive = false;
        continue;
      }
      if (stroke.n < 2) continue;
      const count = this.generate(stroke);
      if (count < 2) continue;
      const samples = this.g;
      const headAlong = samples[(count - 1) * SKYTRAIL_STRIDE + 9];
      const base = vertCount;
      for (let i = 0; i < count; i++) {
        const at = i * SKYTRAIL_STRIDE;
        const age = (time - samples[at + 3]) / life;
        const fromHead = headAlong - samples[at + 9];
        const prev = Math.max(0, i - 1) * SKYTRAIL_STRIDE;
        const next = Math.min(count - 1, i + 1) * SKYTRAIL_STRIDE;
        let tx = samples[next] - samples[prev];
        let ty = samples[next + 1] - samples[prev + 1];
        let tz = samples[next + 2] - samples[prev + 2];
        const len = Math.hypot(tx, ty, tz) || 1;
        tx /= len;
        ty /= len;
        tz /= len;
        const headTaper = 0.3 + 0.7 * skytrailSmoothstep(0, 1.6, fromHead);
        const ageSwell = (1 + 0.5 * skytrailSmoothstep(0, 0.45, age)) * (1 - 0.6 * skytrailSmoothstep(0.5, 1, age));
        const wobble =
          0.88 +
          0.12 * Math.sin(samples[at + 9] * 0.45 + stroke.seed) +
          0.06 * Math.sin(samples[at + 9] * 1.7 + stroke.seed * 2.3);
        const width = samples[at + 4] * headTaper * ageSwell * wobble;
        for (let side = -1; side <= 1; side += 2) {
          const v3 = vertCount * 3;
          posArr[v3] = samples[at];
          posArr[v3 + 1] = samples[at + 1];
          posArr[v3 + 2] = samples[at + 2];
          tanArr[v3] = tx;
          tanArr[v3 + 1] = ty;
          tanArr[v3 + 2] = tz;
          const v4 = vertCount * 4;
          infoArr[v4] = age;
          infoArr[v4 + 1] = samples[at + 9];
          infoArr[v4 + 2] = fromHead;
          infoArr[v4 + 3] = side;
          styleArr[v4] = width;
          styleArr[v4 + 1] = samples[at + 5];
          styleArr[v4 + 2] = samples[at + 10];
          styleArr[v4 + 3] = stroke.seed;
          colArr[v3] = samples[at + 6];
          colArr[v3 + 1] = samples[at + 7];
          colArr[v3 + 2] = samples[at + 8];
          vertCount++;
        }
      }
      for (let i = 0; i < count - 1; i++) {
        const v = base + i * 2;
        indexArr[indexCount++] = v;
        indexArr[indexCount++] = v + 1;
        indexArr[indexCount++] = v + 2;
        indexArr[indexCount++] = v + 1;
        indexArr[indexCount++] = v + 3;
        indexArr[indexCount++] = v + 2;
      }
    }
    this.geo.setDrawRange(0, indexCount);
    this.mesh.visible = indexCount > 0;
    if (indexCount > 0) {
      for (const [attr, size] of [
        [this.pos, 3],
        [this.tan, 3],
        [this.info, 4],
        [this.style, 4],
        [this.col, 3],
      ]) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, vertCount * size);
        attr.needsUpdate = true;
      }
      this.index.clearUpdateRanges();
      this.index.addUpdateRange(0, indexCount);
      this.index.needsUpdate = true;
    }
  }
  generate(stroke) {
    const count = stroke.n;
    const src = stroke.d;
    const out = this.g;
    let total = 0;
    for (let i = 0; i < count - 1; i++) {
      const i0 = Math.max(0, i - 1) * SKYTRAIL_STRIDE;
      const i1 = i * SKYTRAIL_STRIDE;
      const i2 = (i + 1) * SKYTRAIL_STRIDE;
      const i3 = Math.min(count - 1, i + 2) * SKYTRAIL_STRIDE;
      const steps = i === count - 2 ? 4 : SKYTRAIL_SUBDIV;
      for (let step = 0; step < steps; step++) {
        const t = step / SKYTRAIL_SUBDIV;
        const at = total * SKYTRAIL_STRIDE;
        out[at] = skytrailCatmullRom(src[i0], src[i1], src[i2], src[i3], t);
        out[at + 1] = skytrailCatmullRom(src[i0 + 1], src[i1 + 1], src[i2 + 1], src[i3 + 1], t);
        out[at + 2] = skytrailCatmullRom(src[i0 + 2], src[i1 + 2], src[i2 + 2], src[i3 + 2], t);
        for (let k = 3; k < SKYTRAIL_STRIDE; k++) out[at + k] = src[i1 + k] + (src[i2 + k] - src[i1 + k]) * t;
        total++;
      }
    }
    return total;
  }
}
function skytrailSmoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
