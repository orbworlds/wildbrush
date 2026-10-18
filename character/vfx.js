/**
 * The hero's particle effects: one instanced pool of billboards for puffs, paint drops, rings, flecks, splats, impact stars and shock rings, with gravity, drag, landing on the floor and a fade for each type.
 */
import {
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
} from 'three';
export const VfxType = {
  Puff: 0,
  Drop: 1,
  Ring: 2,
  Fleck: 3,
  Splat: 4,
  Star: 5,
  Shock: 6,
};
const MAX_VFX = 700;
export class VfxPool {
  mesh;
  geo;
  iPos;
  iSize;
  iColor;
  iData;
  px = new Float32Array(MAX_VFX);
  py = new Float32Array(MAX_VFX);
  pz = new Float32Array(MAX_VFX);
  vx = new Float32Array(MAX_VFX);
  vy = new Float32Array(MAX_VFX);
  vz = new Float32Array(MAX_VFX);
  life = new Float32Array(MAX_VFX);
  maxLife = new Float32Array(MAX_VFX);
  size = new Float32Array(MAX_VFX);
  grow = new Float32Array(MAX_VFX);
  cr = new Float32Array(MAX_VFX);
  cg = new Float32Array(MAX_VFX);
  cb = new Float32Array(MAX_VFX);
  alpha = new Float32Array(MAX_VFX);
  grav = new Float32Array(MAX_VFX);
  drag = new Float32Array(MAX_VFX);
  rot = new Float32Array(MAX_VFX);
  spin = new Float32Array(MAX_VFX);
  type = new Uint8Array(MAX_VFX);
  floor = new Float32Array(MAX_VFX);
  count = 0;
  col = new Color();
  onLand = null;
  constructor(ctx) {
    const quad = new PlaneGeometry(1, 1);
    this.geo = new InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.attributes.position);
    this.geo.setAttribute('uv', quad.attributes.uv);
    this.iPos = new InstancedBufferAttribute(new Float32Array(MAX_VFX * 3), 3).setUsage(DynamicDrawUsage);
    this.iSize = new InstancedBufferAttribute(new Float32Array(MAX_VFX), 1).setUsage(DynamicDrawUsage);
    this.iColor = new InstancedBufferAttribute(new Float32Array(MAX_VFX * 4), 4).setUsage(DynamicDrawUsage);
    this.iData = new InstancedBufferAttribute(new Float32Array(MAX_VFX * 2), 2).setUsage(DynamicDrawUsage);
    this.geo.setAttribute('iPos', this.iPos);
    this.geo.setAttribute('iSize', this.iSize);
    this.geo.setAttribute('iColor', this.iColor);
    this.geo.setAttribute('iData', this.iData);
    this.geo.instanceCount = 0;
    const material = new ShaderMaterial({
      uniforms: {
        ...ctx.globals,
      },
      transparent: true,
      depthWrite: false,
      vertexShader: `
        #include <wb_common>
        attribute vec3 iPos;
        attribute float iSize;
        attribute vec4 iColor;
        attribute vec2 iData;
        varying vec2 vUv;
        varying vec4 vColor;
        varying float vType;
        void main() {
          vUv = uv;
          vColor = iColor;
          vType = iData.x;
          vec2 c = position.xy * iSize;
          float r = iData.y;
          c = mat2(cos(r), sin(r), -sin(r), cos(r)) * c;
          vec3 wp;
          if ((iData.x > 1.5 && iData.x < 2.5) || (iData.x > 3.5 && iData.x < 4.5)) {
            wp = iPos + vec3(c.x, 0.0, c.y);
          } else {
            vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
            vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
            wp = iPos + right * c.x + up * c.y;
          }
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: `
        #include <wb_common>
        varying vec2 vUv;
        varying vec4 vColor;
        varying float vType;
        void main() {
          vec2 p = vUv * 2.0 - 1.0;
          float r = length(p);
          float a = 0.0;
          vec3 col = vColor.rgb;
          vec3 light = uSkyColor * 0.45 + uSunColor * 0.75;
          if (vType < 0.5) {
            // soft puff with a lumpy edge
            float n = wbNoise2(p * 2.5 + vColor.a * 7.0);
            a = smoothstep(1.0, 0.25, r + (n - 0.5) * 0.45);
            col *= light * (0.85 + 0.25 * (1.0 - p.y));
          } else if (vType < 1.5) {
            a = smoothstep(1.0, 0.8, r);
            float hl = smoothstep(0.45, 0.0, length(p - vec2(-0.3, 0.35)));
            col = col * light * (0.8 + 0.2 * (1.0 - r)) + hl * 0.6;
          } else if (vType < 2.5) {
            a = smoothstep(0.62, 0.8, r) * smoothstep(1.0, 0.86, r);
            col *= light;
          } else if (vType > 5.5) {
            // camera-facing shock ring (hit flash)
            a = smoothstep(0.62, 0.8, r) * (1.0 - smoothstep(0.88, 1.0, r));
            col = mix(vec3(1.0), col, 0.55) * 1.7;
          } else if (vType > 4.5) {
            // impact star: bright white core, rays in the paint colour
            float ang = atan(p.y, p.x);
            float sp = max(pow(abs(cos(ang * 2.0)), 14.0), 0.5 * pow(abs(sin(ang * 2.0)), 18.0));
            float rr = r / (0.2 + 0.8 * sp);
            a = 1.0 - smoothstep(0.55, 1.0, rr);
            col = mix(vec3(1.0, 0.98, 0.92), col, smoothstep(0.12, 0.7, rr)) * 1.9;
          } else if (vType > 3.5) {
            // flat paint splat
            float n = wbNoise2(p * 3.0 + vColor.a * 11.0);
            a = smoothstep(0.85, 0.7, r + (n - 0.5) * 0.35);
            col *= light;
          } else {
            // fleck: little diamond/blade
            a = 1.0 - smoothstep(0.75, 0.95, abs(p.x) * 1.9 + abs(p.y) * 0.7);
            col *= light;
          }
          a *= vColor.a;
          if (a < 0.01) discard;
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    });
    this.mesh = new Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = 'hero-vfx';
  }
  emit(p) {
    let slot = this.count;
    if (slot >= MAX_VFX) {
      let oldest = 0;
      let minLife = 1000000000;
      for (let i = 0; i < MAX_VFX; i += 7)
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
    this.maxLife[slot] = p.life;
    this.size[slot] = p.size;
    this.grow[slot] = p.grow ?? 1;
    if (typeof p.color == 'number') this.col.set(p.color);
    else this.col.copy(p.color);
    this.cr[slot] = this.col.r;
    this.cg[slot] = this.col.g;
    this.cb[slot] = this.col.b;
    this.alpha[slot] = p.alpha ?? 1;
    this.grav[slot] = p.gravity ?? 0;
    this.drag[slot] = p.drag ?? 0;
    this.rot[slot] = Math.random() * Math.PI * 2;
    this.spin[slot] = p.spin ?? 0;
    this.type[slot] = p.type;
    this.floor[slot] = p.floor ?? -1000000000;
  }
  update(dt) {
    const count = this.count;
    let alive = 0;
    const posArr = this.iPos.array;
    const sizeArr = this.iSize.array;
    const colorArr = this.iColor.array;
    const dataArr = this.iData.array;
    for (let i = 0; i < count; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const damp = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= damp;
      this.vy[i] = this.vy[i] * damp + this.grav[i] * dt;
      this.vz[i] *= damp;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      this.rot[i] += this.spin[i] * dt;
      if (this.py[i] < this.floor[i]) {
        this.py[i] = this.floor[i];
        if (this.type[i] === VfxType.Drop || this.type[i] === VfxType.Fleck) {
          this.onLand?.(this.px[i], this.floor[i], this.pz[i], this.cr[i], this.cg[i], this.cb[i], this.type[i]);
          this.life[i] = 0;
          continue;
        }
        this.vy[i] = 0;
      }
      if (alive !== i) this.copy(i, alive);
      const age = 1 - this.life[alive] / this.maxLife[alive];
      const size = this.size[alive] * (1 + (this.grow[alive] - 1) * age);
      let fade;
      fade =
        this.type[alive] === VfxType.Puff
          ? Math.min(1, age * 6) * (1 - age) * (1 - age)
          : this.type[alive] === VfxType.Star || this.type[alive] === VfxType.Shock
            ? (1 - age) * (1 - age) * Math.min(1, age * 25 + 0.2)
            : this.type[alive] === VfxType.Ring || this.type[alive] === VfxType.Splat
              ? (1 - age) * Math.min(1, age * 10)
              : 1 - Math.max(0, (age - 0.75) / 0.25);
      posArr[alive * 3] = this.px[alive];
      posArr[alive * 3 + 1] = this.py[alive];
      posArr[alive * 3 + 2] = this.pz[alive];
      sizeArr[alive] = size;
      colorArr[alive * 4] = this.cr[alive];
      colorArr[alive * 4 + 1] = this.cg[alive];
      colorArr[alive * 4 + 2] = this.cb[alive];
      colorArr[alive * 4 + 3] = this.alpha[alive] * fade;
      dataArr[alive * 2] = this.type[alive];
      dataArr[alive * 2 + 1] = this.rot[alive];
      alive++;
    }
    this.count = alive;
    this.geo.instanceCount = alive;
    if (alive > 0) {
      this.iPos.needsUpdate = true;
      this.iSize.needsUpdate = true;
      this.iColor.needsUpdate = true;
      this.iData.needsUpdate = true;
      this.iPos.addUpdateRange(0, alive * 3);
      this.iSize.addUpdateRange(0, alive);
      this.iColor.addUpdateRange(0, alive * 4);
      this.iData.addUpdateRange(0, alive * 2);
    }
    this.mesh.visible = alive > 0;
  }
  copy(from, to) {
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
    this.type[to] = this.type[from];
    this.floor[to] = this.floor[from];
  }
}
