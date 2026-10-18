/**
 * Bristle flare: paint-coloured strands that fan out from the brush head while flying and whip faster with speed.
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
import { COLORS, PALETTE } from '../core/config.js';
const FLARE_STRANDS = 15;
const FLARE_POINTS = 6;
export class BristleFlare {
  mesh;
  posA;
  tanA;
  dataA;
  colA;
  p = new Vector3();
  q = new Vector3();
  pts = new Float32Array(18);
  c = new Color();
  amount = 0;
  constructor(ctx) {
    const geometry = new BufferGeometry();
    this.posA = new BufferAttribute(new Float32Array(540), 3).setUsage(DynamicDrawUsage);
    this.tanA = new BufferAttribute(new Float32Array(540), 3).setUsage(DynamicDrawUsage);
    this.dataA = new BufferAttribute(new Float32Array(540), 3).setUsage(DynamicDrawUsage);
    this.colA = new BufferAttribute(new Float32Array(540), 3).setUsage(DynamicDrawUsage);
    const indices = [];
    for (let i = 0; i < FLARE_STRANDS; i++)
      for (let j = 0; j < 5; j++) {
        const v = (i * FLARE_POINTS + j) * 2;
        indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    geometry.setAttribute('position', this.posA);
    geometry.setAttribute('aTan', this.tanA);
    geometry.setAttribute('aData', this.dataA);
    geometry.setAttribute('aColor', this.colA);
    geometry.setIndex(indices);
    geometry.boundingSphere = new Sphere(new Vector3(), 100000);
    const material = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      vertexShader: `
        #include <wb_common>
        attribute vec3 aTan;
        attribute vec3 aData;   // x: side (-1/1), y: half width (m), z: along 0 root … 1 tip
        attribute vec3 aColor;
        varying vec3 vColor;
        varying vec2 vUv;
        void main() {
          vec3 wp = position;
          vec3 toCam = normalize(cameraPosition - wp);
          vec3 side = cross(aTan, toCam);
          float sl = length(side);
          side = sl > 1e-4 ? side / sl : vec3(0.0, 1.0, 0.0);
          wp += side * aData.x * aData.y;
          vColor = aColor;
          vUv = vec2(aData.z, aData.x * 0.5 + 0.5);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: `
        #include <wb_common>
        varying vec3 vColor;
        varying vec2 vUv;
        void main() {
          float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
          float a = smoothstep(0.0, 0.35, across) * (1.0 - smoothstep(0.75, 1.0, vUv.x)) * smoothstep(0.0, 0.08, vUv.x);
          if (a < 0.03) discard;
          vec3 light = uSunColor * 0.7 + uSkyColor * 0.4;
          vec3 col = vColor * light * (0.85 + 0.35 * across) + vColor * 0.18;
          gl_FragColor = vec4(col, a * 0.95);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'hero-bristle-flare';
    this.mesh.visible = false;
  }
  update(dt, time, target, speed, boost, brushMatrix, hex, rainbow) {
    this.amount += (target - this.amount) * (1 - Math.exp(-(target > this.amount ? 6 : 9) * Math.max(dt, 0)));
    const on = this.amount > 0.02;
    this.mesh.visible = on;
    if (!on) return;
    const posArr = this.posA.array;
    const tanArr = this.tanA.array;
    const dataArr = this.dataA.array;
    const colArr = this.colA.array;
    const amount = this.amount;
    const fast = Math.min(1.2, speed / 20);
    const reach = (0.1 + 0.12 * fast + 0.08 * boost) * amount;
    const spread = 0.25 + 0.3 * fast + 0.2 * boost;
    for (let i = 0; i < FLARE_STRANDS; i++) {
      const angle = (i / FLARE_STRANDS) * Math.PI * 2 + 0.3;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      const phase = i * 1.73;
      const strandLen = reach * (0.75 + (0.45 * ((i * 7) % 5)) / 4);
      for (let pt = 0; pt < FLARE_POINTS; pt++) {
        const u = pt / 5;
        const swayX = Math.sin(time * (15 + 10 * fast) + phase - u * 3.2) * (0.02 + 0.05 * fast) * u * u;
        const swayY = Math.cos(time * (11 + 7 * fast) + phase * 1.3 - u * 2.4) * (0.015 + 0.04 * fast) * u * u;
        const radius = 0.045 + spread * strandLen * u * (0.6 + 0.4 * u);
        this.p.set(
          cosA * radius + -sinA * swayX,
          1.14 + strandLen * u + swayY * 0.5,
          sinA * radius + 0.02 + cosA * swayX + swayY,
        );
        this.p.applyMatrix4(brushMatrix);
        this.pts[pt * 3] = this.p.x;
        this.pts[pt * 3 + 1] = this.p.y;
        this.pts[pt * 3 + 2] = this.p.z;
      }
      if (rainbow) this.c.setHex(PALETTE[COLORS[i % 4]].hex);
      else this.c.setHex(hex).lerp(FLARE_WHITE, (i % 3) * 0.08);
      for (let j = 0; j < FLARE_POINTS; j++) {
        const prev = Math.max(0, j - 1) * 3;
        const next = Math.min(5, j + 1) * 3;
        this.q
          .set(
            this.pts[next] - this.pts[prev],
            this.pts[next + 1] - this.pts[prev + 1],
            this.pts[next + 2] - this.pts[prev + 2],
          )
          .normalize();
        const u = j / 5;
        const halfWidth = (0.015 + 0.008 * boost) * (1 - u * 0.85) * (0.6 + 0.4 * amount);
        for (let side = -1; side <= 1; side += 2) {
          const v = ((i * FLARE_POINTS + j) * 2 + +(side > 0)) * 3;
          posArr[v] = this.pts[j * 3];
          posArr[v + 1] = this.pts[j * 3 + 1];
          posArr[v + 2] = this.pts[j * 3 + 2];
          tanArr[v] = this.q.x;
          tanArr[v + 1] = this.q.y;
          tanArr[v + 2] = this.q.z;
          dataArr[v] = side;
          dataArr[v + 1] = halfWidth;
          dataArr[v + 2] = u;
          colArr[v] = this.c.r;
          colArr[v + 1] = this.c.g;
          colArr[v + 2] = this.c.b;
        }
      }
    }
    this.posA.needsUpdate = true;
    this.tanA.needsUpdate = true;
    this.dataA.needsUpdate = true;
    this.colA.needsUpdate = true;
  }
}
const FLARE_WHITE = new Color(1, 1, 1);
