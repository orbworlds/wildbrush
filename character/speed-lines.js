/**
 * Speed lines: additive streaks around the camera along the flight direction while boosting.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Mesh,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three';
const SPEEDLINE_COUNT = 40;
export class SpeedLines {
  mesh;
  p = new Float32Array(120);
  life = new Float32Array(SPEEDLINE_COUNT);
  len = new Float32Array(SPEEDLINE_COUNT);
  posA;
  dirA;
  dataA;
  dir = new Vector3(0, 0, 1);
  right = new Vector3();
  up = new Vector3();
  init = false;
  amount = 0;
  constructor(ctx) {
    const geometry = new BufferGeometry();
    const corners = new Float32Array(320);
    const indices = new Uint16Array(240);
    for (let i = 0; i < SPEEDLINE_COUNT; i++) {
      for (let j = 0; j < 4; j++) {
        corners[(i * 4 + j) * 2] = j >> 1;
        corners[(i * 4 + j) * 2 + 1] = j & 1 ? 1 : -1;
      }
      const v = i * 4;
      indices.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6);
    }
    this.posA = new BufferAttribute(new Float32Array(480), 3).setUsage(DynamicDrawUsage);
    this.dirA = new BufferAttribute(new Float32Array(480), 3).setUsage(DynamicDrawUsage);
    this.dataA = new BufferAttribute(new Float32Array(320), 2).setUsage(DynamicDrawUsage);
    geometry.setAttribute('position', this.posA);
    geometry.setAttribute('aDir', this.dirA);
    geometry.setAttribute('aCorner', new BufferAttribute(corners, 2));
    geometry.setAttribute('aData', this.dataA);
    geometry.setIndex(new BufferAttribute(indices, 1));
    geometry.boundingSphere = new Sphere(new Vector3(), 100000);
    const material = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
        uAmount: {
          value: 0,
        },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      vertexShader: `
        #include <wb_common>
        attribute vec3 aDir;     // streak vector (head → tail), length = streak length
        attribute vec2 aCorner;  // x: 0 head / 1 tail, y: side
        attribute vec2 aData;    // x: alpha, y: width
        varying float vA;
        varying vec2 vC;
        void main() {
          vec3 wp = position + aDir * aCorner.x;
          vec3 toCam = normalize(cameraPosition - wp);
          vec3 side = normalize(cross(normalize(aDir + vec3(1e-5)), toCam));
          wp += side * aCorner.y * aData.y;
          vA = aData.x;
          vC = aCorner;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uAmount;
        varying float vA;
        varying vec2 vC;
        void main() {
          float along = sin(3.14159 * clamp(vC.x, 0.0, 1.0));
          float across = 1.0 - abs(vC.y);
          float a = vA * uAmount * along * along * smoothstep(0.0, 0.8, across);
          if (a < 0.003) discard;
          gl_FragColor = vec4(vec3(1.0, 0.98, 0.94) * a, a);
        }
      `,
    });
    this.mesh = new Mesh(geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.name = 'hero-speedlines';
    this.mesh.visible = false;
  }
  spawn(idx, center, ahead) {
    const random = Math.random;
    const angle = random() * Math.PI * 2;
    const radius = 1.6 + random() * 4.2;
    const at = idx * 3;
    this.p[at] =
      center.x + this.dir.x * ahead + (this.right.x * Math.cos(angle) + this.up.x * Math.sin(angle)) * radius;
    this.p[at + 1] =
      center.y + this.dir.y * ahead + (this.right.y * Math.cos(angle) + this.up.y * Math.sin(angle)) * radius;
    this.p[at + 2] =
      center.z + this.dir.z * ahead + (this.right.z * Math.cos(angle) + this.up.z * Math.sin(angle)) * radius;
    this.life[idx] = 0;
    this.len[idx] = 0.6 + random() * 1.4;
  }
  update(dt, target, velocity, camPos) {
    this.amount += (target - this.amount) * (1 - Math.exp(-(target > this.amount ? 5 : 3) * dt));
    const on = this.amount > 0.01;
    this.mesh.visible = on;
    this.mesh.material.uniforms.uAmount.value = this.amount;
    const speed = velocity.length();
    if (!on || speed < 2) {
      this.init = false;
      return;
    }
    this.dir.copy(velocity).divideScalar(speed);
    this.right.set(0, 1, 0).cross(this.dir);
    if (this.right.lengthSq() < 0.0001) this.right.set(1, 0, 0);
    this.right.normalize();
    this.up.crossVectors(this.dir, this.right).normalize();
    if (!this.init) {
      for (let i = 0; i < SPEEDLINE_COUNT; i++) this.spawn(i, camPos, 2 + Math.random() * 26);
      this.init = true;
    }
    const posArr = this.posA.array;
    const dirArr = this.dirA.array;
    const dataArr = this.dataA.array;
    const stretch = Math.min(5, 0.09 * speed);
    for (let i = 0; i < SPEEDLINE_COUNT; i++) {
      const at = i * 3;
      const dx = this.p[at] - camPos.x;
      const dy = this.p[at + 1] - camPos.y;
      const dz = this.p[at + 2] - camPos.z;
      const ahead = dx * this.dir.x + dy * this.dir.y + dz * this.dir.z;
      const dist = Math.hypot(dx - this.dir.x * ahead, dy - this.dir.y * ahead, dz - this.dir.z * ahead);
      if (ahead < -1 || ahead > 40 || dist > 9) this.spawn(i, camPos, 22 + Math.random() * 12);
      this.life[i] += dt;
      const along =
        (this.p[at] - camPos.x) * this.dir.x +
        (this.p[at + 1] - camPos.y) * this.dir.y +
        (this.p[at + 2] - camPos.z) * this.dir.z;
      const alpha =
        Math.min(1, this.life[i] * 4) *
        Math.min(1, Math.max(0, (along + 1) / 4)) *
        Math.min(1, Math.max(0, (34 - along) / 10));
      const streak = stretch * this.len[i];
      for (let j = 0; j < 4; j++) {
        const v3 = (i * 4 + j) * 3;
        posArr[v3] = this.p[at];
        posArr[v3 + 1] = this.p[at + 1];
        posArr[v3 + 2] = this.p[at + 2];
        dirArr[v3] = -this.dir.x * streak;
        dirArr[v3 + 1] = -this.dir.y * streak;
        dirArr[v3 + 2] = -this.dir.z * streak;
        const v2 = (i * 4 + j) * 2;
        dataArr[v2] = 0.14 * alpha;
        dataArr[v2 + 1] = 0.008 + 0.008 * this.len[i];
      }
    }
    this.posA.needsUpdate = true;
    this.dirA.needsUpdate = true;
    this.dataA.needsUpdate = true;
  }
}
