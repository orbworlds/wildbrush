/**
 * Finale: once all four Prisms blaze, coloured arcs rise from each Prism to the summit and a great rainbow unfurls over the island.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  QuadraticBezierCurve3,
  ShaderMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
const RAINBOW_VERTEX = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const RAINBOW_FRAGMENT = `
#include <wb_common>
uniform float uReveal;
uniform float uAlpha;
varying vec2 vUv;
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  float band = vUv.y;
  vec3 c = hue(0.8 * (1.0 - band));
  c = mix(c, vec3(1.0), 0.12);
  float edge = smoothstep(0.0, 0.18, band) * smoothstep(1.0, 0.8, band);
  float ends = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x);
  float fromTop = abs(vUv.x - 0.5) * 2.0;
  float reveal = smoothstep(uReveal, uReveal - 0.08, fromTop);
  float shimmer = 0.85 + 0.15 * wbNoise2(vec2(vUv.x * 40.0 - uTime * 0.5, vUv.y * 3.0));
  float a = edge * ends * reveal * uAlpha * shimmer;
  gl_FragColor = vec4(c * a * 0.75, 1.0);
}
`;
const FINALE_ARC_VERTEX = `
attribute vec3 aColor;
uniform float uRadius;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vW;
void main() {
  vUv = uv;
  vColor = aColor;
  vec4 w = modelMatrix * vec4(position, 1.0);
  float dist = length(cameraPosition - w.xyz);
  vec3 n = normalize(mat3(modelMatrix) * normal);
  w.xyz += n * uRadius * (dist / 140.0);
  vN = n;
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const FINALE_ARC_FRAGMENT = `
#include <wb_common>
uniform float uProgress;
uniform float uAlpha;
varying vec2 vUv;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vW;
void main() {
  vec3 V = normalize(cameraPosition - vW);
  float facing = abs(dot(normalize(vN), V));
  float core = pow(facing, 2.0);
  float t = vUv.x;
  float vis = smoothstep(uProgress, uProgress - 0.03, t);
  float head = exp(-pow((t - uProgress) * 30.0, 2.0)) * 2.0;
  float flow = 0.75 + 0.25 * sin(t * 60.0 - uTime * 6.0);
  float a = core * (vis * flow + head) * uAlpha;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.2) * a * 1.3, clamp(a * 0.6, 0.0, 1.0));
}
`;
export class Finale {
  ctx;
  rainbow;
  arcs;
  ru;
  au;
  t = -1;
  center;
  active = false;
  constructor(ctx, trials) {
    this.ctx = ctx;
    const summit = ctx.terrain.landmarks.summit;
    const globals = ctx.globals;
    this.center = new Vector3(summit.x, summit.y - 30, summit.z);
    const apex = new Vector3(summit.x, summit.y - 30 + 115 - 8, summit.z);
    const positions = [];
    const uvs = [];
    const indices = [];
    for (let i = 0; i <= 128; i++) {
      const u = i / 128;
      const angle = Math.PI * (1 - u);
      for (let j = 0; j <= 6; j++) {
        const v = j / 6;
        const radius = 99 + 16 * v;
        positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
        uvs.push(u, v);
      }
    }
    for (let i = 0; i < 128; i++)
      for (let j = 0; j < 6; j++) {
        const a = i * 7 + j;
        const b = a + 6 + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    this.ru = {
      ...globals,
      uReveal: {
        value: 0,
      },
      uAlpha: {
        value: 0,
      },
    };
    this.rainbow = new Mesh(
      geometry,
      new ShaderMaterial({
        uniforms: this.ru,
        vertexShader: RAINBOW_VERTEX,
        fragmentShader: RAINBOW_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    );
    this.rainbow.position.copy(this.center);
    this.rainbow.frustumCulled = false;
    this.rainbow.visible = false;
    this.rainbow.renderOrder = 6;
    ctx.scene.add(this.rainbow);
    const arcGeos = [];
    for (const trial of trials) {
      if (!trial.prism) continue;
      const from = trial.prism.position.clone().add(new Vector3(0, 55, 0));
      const ctrl = from
        .clone()
        .lerp(apex, 0.5)
        .add(new Vector3(0, 45, 0));
      const curve = new QuadraticBezierCurve3(from, ctrl, apex);
      const geometry = new TubeGeometry(curve, 96, 1, 8, false);
      const count = geometry.attributes.position.count;
      const colors = new Float32Array(count * 3);
      const colorValue = trial.prism.colorValue;
      for (let i = 0; i < count; i++) colors.set([colorValue.r, colorValue.g, colorValue.b], i * 3);
      geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
      arcGeos.push(geometry);
    }
    let merged;
    try {
      merged = arcGeos.length ? mergeArcTubes(arcGeos) : new BufferGeometry();
    } catch {
      merged = new BufferGeometry();
    }
    this.au = {
      ...globals,
      uProgress: {
        value: 0,
      },
      uAlpha: {
        value: 0,
      },
      uRadius: {
        value: 1,
      },
    };
    this.arcs = new Mesh(
      merged,
      new ShaderMaterial({
        uniforms: this.au,
        vertexShader: FINALE_ARC_VERTEX,
        fragmentShader: FINALE_ARC_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
      }),
    );
    this.arcs.frustumCulled = false;
    this.arcs.visible = false;
    this.arcs.renderOrder = 6;
    ctx.scene.add(this.arcs);
  }
  start(instant = false) {
    this.active = true;
    this.t = instant ? 20 : 0;
    this.rainbow.visible = true;
    this.arcs.visible = true;
  }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const t = this.t;
    this.au.uProgress.value = Math.min(1.05, t / 3);
    this.au.uAlpha.value = Math.min(1, t * 2) * (0.65 + 0.35 * Math.min(1, Math.max(0, 1 - (t - 3) / 3)));
    this.ru.uReveal.value = Math.min(1.1, Math.max(0, (t - 2.6) / 4));
    this.ru.uAlpha.value = Math.min(1, Math.max(0, (t - 2.4) / 1.5));
    const camPos = this.ctx.camera.position;
    this.rainbow.rotation.y = Math.atan2(camPos.x - this.center.x, camPos.z - this.center.z);
  }
}
function mergeArcTubes(geos) {
  const merged = new BufferGeometry();
  const attrs = ['position', 'normal', 'uv', 'aColor'];
  let vertexCount = 0;
  let indexCount = 0;
  for (const geo of geos) {
    vertexCount += geo.attributes.position.count;
    indexCount += geo.index.count;
  }
  for (const attr of attrs) {
    const itemSize = geos[0].attributes[attr].itemSize;
    const data = new Float32Array(vertexCount * itemSize);
    let offset = 0;
    for (const geo of geos) {
      data.set(geo.attributes[attr].array, offset);
      offset += geo.attributes[attr].array.length;
    }
    merged.setAttribute(attr, new BufferAttribute(data, itemSize));
  }
  const indices = new Uint32Array(indexCount);
  let cursor = 0;
  let base = 0;
  for (const geo of geos) {
    const array = geo.index.array;
    for (let i = 0; i < array.length; i++) indices[cursor++] = array[i] + base;
    base += geo.attributes.position.count;
  }
  merged.setIndex(new BufferAttribute(indices, 1));
  return merged;
}
