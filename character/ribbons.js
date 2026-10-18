/**
 * Brush stroke ribbons: each live stroke of the brush leaves a painterly ribbon behind the tip, smoothed with Catmull-Rom splines, that dries and fades from the tail, with dry-brush streaks at speed and rainbow colour lanes.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Mesh,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three';
import { RAINBOW_GLSL, rainbowUniform } from './chroma-brush.js';
const MAX_STROKES = 10;
const STROKE_POINTS = 44;
const STROKE_SUBDIV = 5;
const RIBBON_POINTS = 216;
const RIBBON_VERTS = 4320;
const STROKE_MIN_STEP = 0.06;
const _prevTip = new Vector3();
new Vector3();
function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
export class BrushRibbons {
  mesh;
  strokes = [];
  cur = null;
  geo;
  pos;
  uv;
  info;
  col;
  rb;
  index;
  gTip = new Float32Array(648);
  gBase = new Float32Array(648);
  gTime = new Float32Array(RIBBON_POINTS);
  gLen = new Float32Array(RIBBON_POINTS);
  gSpd = new Float32Array(RIBBON_POINTS);
  seedN = 1;
  constructor(ctx) {
    for (let i = 0; i < MAX_STROKES; i++)
      this.strokes.push({
        alive: false,
        live: false,
        n: 0,
        tip: new Float32Array(132),
        base: new Float32Array(132),
        time: new Float32Array(STROKE_POINTS),
        speed: new Float32Array(STROKE_POINTS),
        color: new Color(),
        width: 1,
        life: 0.42,
        seed: 0,
        endTime: 0,
        rainbow: false,
      });
    this.geo = new BufferGeometry();
    this.pos = new BufferAttribute(new Float32Array(RIBBON_VERTS * 3), 3).setUsage(DynamicDrawUsage);
    this.uv = new BufferAttribute(new Float32Array(RIBBON_VERTS * 2), 2).setUsage(DynamicDrawUsage);
    this.info = new BufferAttribute(new Float32Array(RIBBON_VERTS * 4), 4).setUsage(DynamicDrawUsage);
    this.col = new BufferAttribute(new Float32Array(RIBBON_VERTS * 3), 3).setUsage(DynamicDrawUsage);
    this.rb = new BufferAttribute(new Float32Array(RIBBON_VERTS), 1).setUsage(DynamicDrawUsage);
    this.index = new BufferAttribute(new Uint16Array(12900), 1).setUsage(DynamicDrawUsage);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('aUv', this.uv);
    this.geo.setAttribute('aInfo', this.info);
    this.geo.setAttribute('aColor', this.col);
    this.geo.setAttribute('aRb', this.rb);
    this.geo.setIndex(this.index);
    this.geo.setDrawRange(0, 0);
    this.geo.boundingSphere = new Sphere(new Vector3(), 100000);
    const material = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
        uRb: rainbowUniform(),
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      vertexShader: `
        #include <wb_common>
        attribute vec2 aUv;
        attribute vec4 aInfo;
        attribute vec3 aColor;
        attribute float aRb;
        varying vec2 vUv;
        varying vec4 vInfo;
        varying vec3 vColor;
        varying float vFacing;
        varying float vRb;
        void main() {
          vRb = aRb;
          vUv = aUv;
          vInfo = aInfo;
          vColor = aColor;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        #include <wb_common>
        ${RAINBOW_GLSL}
        varying vec2 vUv;
        varying vec4 vInfo;
        varying vec3 vColor;
        varying float vRb;
        void main() {
          float along = vUv.x;          // meters along the stroke
          float v = vUv.y;              // 0 = outer edge (crisp), 1 = inner edge (ragged bristles)
          float dry = clamp(vInfo.x, 0.0, 1.0);
          float h = vInfo.y;            // 0 tail … 1 head (at the brush)
          float seed = vInfo.z;
          float fly = vInfo.w;          // "flying white": dry-brush streaking from a fast brush
          // bristle streaks running along the stroke
          float s1 = wbNoise2(vec2(v * 19.0 + seed, along * 0.7 + seed * 0.37));
          float s2 = wbNoise2(vec2(v * 47.0 - seed * 1.7, along * 1.7 + 4.1));
          float s3 = wbNoise2(vec2(v * 5.0 + seed * 3.1, along * 0.3));
          float streak = s1 * 0.5 + s2 * 0.32 + s3 * 0.18;
          // shape: crisp outer rim, ragged bristle fringe on the inside
          float fringe = 0.8 + (s2 - 0.5) * 0.42 + (s3 - 0.5) * 0.28;
          float body = smoothstep(0.0, 0.03, v) * (1.0 - smoothstep(fringe - 0.1, fringe + 0.03, v));
          // rounded, pressed-down entry
          float capR = 0.16;
          if (along < capR) {
            vec2 q = vec2((capR - along) / capR, (v - 0.4) / 0.58);
            body *= 1.0 - smoothstep(0.82, 1.0, length(q));
          }
          // dry-brush breakup: age dries it from the tail, speed streaks the fresh head
          float fw = fly * smoothstep(0.35, 1.0, h);
          float thresh = -0.32 + dry * 1.32 + fw * 0.5 + v * (0.22 + 0.4 * dry) + (1.0 - h) * 0.15 * dry;
          float a = body * smoothstep(thresh - 0.045, thresh + 0.045, streak);
          if (a < 0.02) discard;
          // colour: saturated pigment, darker where it pools at the rim, a wet gloss line
          vec3 paint = vColor;
          if (vRb > 0.5) {
            // multi-loaded brush: four colour lanes across the stroke, flowing along it
            paint = wbRb(v * 3.4 + along * 0.22 + seed * 0.7 - uTime * 0.5 + (s1 - 0.5) * 0.35);
          }
          float rim = 1.0 - smoothstep(0.0, 0.13, v);
          vec3 col = paint * (0.74 + 0.4 * streak);
          col = mix(col, paint * paint * 0.75, rim * 0.6);
          float lum = dot(uSunColor * 0.75 + uSkyColor * 0.35, vec3(0.3333));
          col *= mix(1.0, lum, 0.3) * 1.08;
          float wet = 1.0 - smoothstep(0.0, 0.5, dry);
          float gloss = (1.0 - smoothstep(0.0, 0.05, abs(v - 0.15))) * wet * (0.45 + 0.55 * s1);
          col += vec3(1.0, 0.98, 0.94) * gloss * 0.55;
          col += paint * wet * 0.22;
          col += paint * vRb * (0.22 + 0.3 * wet);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'hero-ribbons';
  }
  begin(color, width, time, rainbow = false) {
    this.end(time);
    let slot = this.strokes.find((stroke) => !stroke.alive);
    if (!slot) {
      slot = this.strokes[0];
      for (const stroke of this.strokes) if (stroke.endTime < slot.endTime) slot = stroke;
    }
    slot.alive = true;
    slot.live = true;
    slot.n = 0;
    slot.color.copy(color);
    slot.width = rainbow ? width * 1.12 : width;
    slot.rainbow = rainbow;
    slot.life = 0.36 + 0.12 * Math.min(1.5, width) + (rainbow ? 0.14 : 0);
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
  get active() {
    return this.cur !== null;
  }
  push(tip, base, time) {
    const cur = this.cur;
    if (!cur) return;
    let idx = cur.n;
    let speed = 0;
    if (idx >= 1) {
      const prev = (idx - 1) * 3;
      const gap = time - cur.time[idx - 1];
      if (gap > 0.0001)
        speed = Math.hypot(tip.x - cur.tip[prev], tip.y - cur.tip[prev + 1], tip.z - cur.tip[prev + 2]) / gap;
    }
    if (idx >= 2) {
      const prev2 = (idx - 2) * 3;
      _prevTip.set(cur.tip[prev2], cur.tip[prev2 + 1], cur.tip[prev2 + 2]);
      if (_prevTip.distanceTo(tip) < STROKE_MIN_STEP) --idx;
    }
    if (idx >= STROKE_POINTS) {
      cur.tip.copyWithin(0, 3);
      cur.base.copyWithin(0, 3);
      cur.time.copyWithin(0, 1);
      cur.speed.copyWithin(0, 1);
      idx = 43;
    }
    if (speed > 0 || idx === 0)
      cur.speed[idx] = Math.max(idx > 0 && idx === cur.n - 1 ? cur.speed[idx] * 0.5 : 0, speed);
    cur.tip[idx * 3] = tip.x;
    cur.tip[idx * 3 + 1] = tip.y;
    cur.tip[idx * 3 + 2] = tip.z;
    cur.base[idx * 3] = base.x;
    cur.base[idx * 3 + 1] = base.y;
    cur.base[idx * 3 + 2] = base.z;
    cur.time[idx] = time;
    cur.n = Math.max(cur.n, idx + 1);
  }
  update(time) {
    const positions = this.pos.array;
    const uvs = this.uv.array;
    const infos = this.info.array;
    const colors = this.col.array;
    const rainbows = this.rb.array;
    const indices = this.index.array;
    let vertCount = 0;
    let indexCount = 0;
    for (const stroke of this.strokes) {
      if (!stroke.alive) continue;
      const lastT = stroke.time[stroke.n - 1];
      if (!stroke.live && time - lastT > stroke.life + 0.05) {
        stroke.alive = false;
        continue;
      }
      if (stroke.n < 2) continue;
      const count = this.generate(stroke);
      if (count < 2) continue;
      const totalLen = Math.max(0.001, this.gLen[count - 1]);
      const firstVert = vertCount;
      for (let i = 0; i < count; i++) {
        const age = (time - this.gTime[i]) / stroke.life;
        const along = this.gLen[i] / totalLen;
        const taper = 0.5 + 0.5 * ribbonSmoothstep(0, Math.min(0.45, 0.3 / totalLen + 0.06), along);
        const spd = this.gSpd[i];
        const pressure =
          (0.38 + 0.62 * ribbonSmoothstep(3, 16, spd)) * (0.9 + 0.1 * Math.sin(this.gLen[i] * 2.3 + stroke.seed));
        const dryThin = 1 - 0.6 * ribbonSmoothstep(0.45, 1.05, age);
        const release = stroke.live
          ? 1
          : 1 - 0.9 * ribbonSmoothstep(0.6, 1, along) * Math.min(1, (time - stroke.endTime) / 0.09);
        const width = taper * pressure * dryThin * release * Math.min(1.25, stroke.width);
        const flyWhite = ribbonSmoothstep(9, 26, this.gSpd[i]);
        const g3 = i * 3;
        const tx = this.gTip[g3];
        const ty = this.gTip[g3 + 1];
        const tz = this.gTip[g3 + 2];
        const bx = tx + (this.gBase[g3] - tx) * width;
        const by = ty + (this.gBase[g3 + 1] - ty) * width;
        const bz = tz + (this.gBase[g3 + 2] - tz) * width;
        const o3 = vertCount * 3;
        positions[o3] = tx;
        positions[o3 + 1] = ty;
        positions[o3 + 2] = tz;
        positions[o3 + 3] = bx;
        positions[o3 + 4] = by;
        positions[o3 + 5] = bz;
        const o2 = vertCount * 2;
        uvs[o2] = this.gLen[i];
        uvs[o2 + 1] = 0;
        uvs[o2 + 2] = this.gLen[i];
        uvs[o2 + 3] = 1;
        const o4 = vertCount * 4;
        infos[o4] = age;
        infos[o4 + 1] = along;
        infos[o4 + 2] = stroke.seed;
        infos[o4 + 3] = flyWhite;
        infos[o4 + 4] = age;
        infos[o4 + 5] = along;
        infos[o4 + 6] = stroke.seed;
        infos[o4 + 7] = flyWhite;
        colors[o3] = colors[o3 + 3] = stroke.color.r;
        colors[o3 + 1] = colors[o3 + 4] = stroke.color.g;
        colors[o3 + 2] = colors[o3 + 5] = stroke.color.b;
        rainbows[vertCount] = rainbows[vertCount + 1] = +!!stroke.rainbow;
        vertCount += 2;
      }
      for (let i = 0; i < count - 1; i++) {
        const v0 = firstVert + i * 2;
        indices[indexCount++] = v0;
        indices[indexCount++] = v0 + 1;
        indices[indexCount++] = v0 + 2;
        indices[indexCount++] = v0 + 1;
        indices[indexCount++] = v0 + 3;
        indices[indexCount++] = v0 + 2;
      }
    }
    this.geo.setDrawRange(0, indexCount);
    this.mesh.visible = indexCount > 0;
    if (indexCount > 0) {
      this.pos.addUpdateRange(0, vertCount * 3);
      this.uv.addUpdateRange(0, vertCount * 2);
      this.info.addUpdateRange(0, vertCount * 4);
      this.col.addUpdateRange(0, vertCount * 3);
      this.rb.addUpdateRange(0, vertCount);
      this.rb.needsUpdate = true;
      this.index.addUpdateRange(0, indexCount);
      this.pos.needsUpdate = true;
      this.uv.needsUpdate = true;
      this.info.needsUpdate = true;
      this.col.needsUpdate = true;
      this.index.needsUpdate = true;
    }
  }
  generate(stroke) {
    const count = stroke.n;
    let out = 0;
    let len = 0;
    let lastX = 0;
    let lastY = 0;
    let lastZ = 0;
    for (let i = 0; i < count - 1; i++) {
      const prev = Math.max(0, i - 1);
      const next = i + 1;
      const next2 = Math.min(count - 1, i + 2);
      const steps = i === count - 2 ? 6 : STROKE_SUBDIV;
      for (let j = 0; j < steps; j++) {
        const frac = j / STROKE_SUBDIV;
        const o3 = out * 3;
        for (let axis = 0; axis < 3; axis++) {
          this.gTip[o3 + axis] = catmullRom(
            stroke.tip[prev * 3 + axis],
            stroke.tip[i * 3 + axis],
            stroke.tip[next * 3 + axis],
            stroke.tip[next2 * 3 + axis],
            frac,
          );
          this.gBase[o3 + axis] = catmullRom(
            stroke.base[prev * 3 + axis],
            stroke.base[i * 3 + axis],
            stroke.base[next * 3 + axis],
            stroke.base[next2 * 3 + axis],
            frac,
          );
        }
        this.gTime[out] = stroke.time[i] + (stroke.time[next] - stroke.time[i]) * frac;
        this.gSpd[out] = stroke.speed[i] + (stroke.speed[next] - stroke.speed[i]) * frac;
        const x = this.gTip[o3];
        const y = this.gTip[o3 + 1];
        const z = this.gTip[o3 + 2];
        if (out > 0) len += Math.hypot(x - lastX, y - lastY, z - lastZ);
        lastX = x;
        lastY = y;
        lastZ = z;
        this.gLen[out] = len;
        out++;
      }
    }
    return out;
  }
}
function ribbonSmoothstep(edge0, edge1, x) {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
