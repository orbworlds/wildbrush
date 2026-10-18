/**
 * Additive sparkle points (star glints, rising embers, soft motes) with drag and buoyancy, used for each ink's landing sparkles and the glitter along bloom waves.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Points, ShaderMaterial } from 'three';
const SPARK_VERTEX = `
#include <wb_common>
attribute vec4 aSpark;  // x size, y life 0..1, z shape (0 star, 1 ember, 2 soft), w seed
attribute vec3 aColor;
varying vec4 vSpark;
varying vec3 vCol;
uniform float uPixelScale;
void main() {
  vSpark = aSpark;
  vCol = aColor;
  vec4 mv = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float life = aSpark.y;
  float grow = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.6, 1.0, life));
  gl_PointSize = clamp(aSpark.x * grow * uPixelScale / max(-mv.z, 0.1), 0.0, 96.0);
}
`;
const SPARK_FRAGMENT = `
#include <wb_common>
varying vec4 vSpark;
varying vec3 vCol;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r = length(p);
  float shape = vSpark.z;
  float a;
  float tw = 0.65 + 0.35 * sin(uTime * 14.0 + vSpark.w * 30.0);
  if (shape < 0.5) {
    float core = exp(-r * r * 9.0);
    float cross = exp(-abs(p.x) * 16.0) * exp(-abs(p.y) * 2.2) + exp(-abs(p.y) * 16.0) * exp(-abs(p.x) * 2.2);
    a = core + cross * 0.55 * tw;
  } else if (shape < 1.5) {
    a = exp(-r * r * 5.0) * (0.75 + 0.25 * tw);
  } else {
    a = exp(-r * r * 3.0) * 0.6;
  }
  a *= smoothstep(1.0, 0.8, r);
  vec3 col = vCol * a + vec3(1.0) * pow(a, 3.0) * 0.5;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export class Sparkles {
  points;
  cap;
  n = 0;
  pos;
  vel;
  life;
  maxLife;
  size;
  shape;
  col;
  aPos;
  aSpark;
  aColor;
  buoy;
  material;
  constructor(ctx, cap = 900) {
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.shape = new Float32Array(cap);
    this.col = new Float32Array(cap * 3);
    this.buoy = new Float32Array(cap);
    const geometry = new BufferGeometry();
    this.aPos = new BufferAttribute(new Float32Array(cap * 3), 3).setUsage(DynamicDrawUsage);
    this.aSpark = new BufferAttribute(new Float32Array(cap * 4), 4).setUsage(DynamicDrawUsage);
    this.aColor = new BufferAttribute(new Float32Array(cap * 3), 3).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.aPos);
    geometry.setAttribute('aSpark', this.aSpark);
    geometry.setAttribute('aColor', this.aColor);
    geometry.setDrawRange(0, 0);
    this.material = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
        uPixelScale: {
          value: 600,
        },
      },
      vertexShader: SPARK_VERTEX,
      fragmentShader: SPARK_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.name = 'paint-sparkles';
  }
  spawn(x, y, z, vx, vy, vz, size, life, color, shape = 0, buoyancy = 0) {
    let i = this.n;
    if (i >= this.cap) i = Math.floor(Math.random() * this.cap);
    else this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = 0;
    this.maxLife[i] = life;
    this.size[i] = size;
    this.shape[i] = shape;
    this.buoy[i] = buoyancy;
    this.col[i * 3] = color.r;
    this.col[i * 3 + 1] = color.g;
    this.col[i * 3 + 2] = color.b;
  }
  update(dt, pixelScale) {
    this.material.uniforms.uPixelScale.value = pixelScale;
    let idx = 0;
    for (; idx < this.n;) {
      this.life[idx] += dt;
      if (this.life[idx] >= this.maxLife[idx]) {
        const last = --this.n;
        if (idx !== last) {
          for (let j = 0; j < 3; j++) {
            this.pos[idx * 3 + j] = this.pos[last * 3 + j];
            this.vel[idx * 3 + j] = this.vel[last * 3 + j];
            this.col[idx * 3 + j] = this.col[last * 3 + j];
          }
          this.life[idx] = this.life[last];
          this.maxLife[idx] = this.maxLife[last];
          this.size[idx] = this.size[last];
          this.shape[idx] = this.shape[last];
          this.buoy[idx] = this.buoy[last];
        }
        continue;
      }
      const drag = Math.exp(-1.6 * dt);
      this.vel[idx * 3] *= drag;
      this.vel[idx * 3 + 1] = this.vel[idx * 3 + 1] * drag + this.buoy[idx] * dt;
      this.vel[idx * 3 + 2] *= drag;
      this.pos[idx * 3] += this.vel[idx * 3] * dt;
      this.pos[idx * 3 + 1] += this.vel[idx * 3 + 1] * dt;
      this.pos[idx * 3 + 2] += this.vel[idx * 3 + 2] * dt;
      idx++;
    }
    const posArr = this.aPos.array;
    const sparkArr = this.aSpark.array;
    const colorArr = this.aColor.array;
    posArr.set(this.pos.subarray(0, this.n * 3));
    colorArr.set(this.col.subarray(0, this.n * 3));
    for (let i = 0; i < this.n; i++) {
      sparkArr[i * 4] = this.size[i];
      sparkArr[i * 4 + 1] = this.life[i] / this.maxLife[i];
      sparkArr[i * 4 + 2] = this.shape[i];
      sparkArr[i * 4 + 3] = (i * 0.618) % 1;
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.points.visible = this.n > 0;
    if (this.n) {
      this.aPos.clearUpdateRanges();
      this.aPos.addUpdateRange(0, this.n * 3);
      this.aPos.needsUpdate = true;
      this.aSpark.clearUpdateRanges();
      this.aSpark.addUpdateRange(0, this.n * 4);
      this.aSpark.needsUpdate = true;
      this.aColor.clearUpdateRanges();
      this.aColor.addUpdateRange(0, this.n * 3);
      this.aColor.needsUpdate = true;
    }
  }
  get count() {
    return this.n;
  }
}
