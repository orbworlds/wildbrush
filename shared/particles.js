/**
 * Pooled additive point-sprite particles: ballistic, homing, swirling and rising sparks for bursts, pickups and ink refills. Used by content, sky, temples and caverns.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  MathUtils,
  Points,
  ShaderMaterial,
} from 'three';
export const ParticleMode = {
  Ballistic: 0,
  Homing: 1,
  Swirl: 2,
  Rise: 3,
};
const PARTICLE_VERTEX = `
attribute vec4 aColor;
attribute float aSize;
attribute float aStyle;
uniform float uScale;
varying vec4 vColor;
varying float vStyle;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), 256.0);
  vColor = aColor;
  vStyle = aStyle;
}
`;
const PARTICLE_FRAGMENT = `
varying vec4 vColor;
varying float vStyle;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float a;
  if (vStyle > 0.5) {
    float ring = smoothstep(0.62, 0.86, d) * smoothstep(1.0, 0.88, d);
    float fill = (1.0 - d) * 0.35;
    float spec = smoothstep(0.32, 0.0, length(c - vec2(-0.16, 0.16)));
    a = ring + fill + spec * 1.3;
  } else {
    float g = 1.0 - d;
    a = g * g * 0.9 + smoothstep(0.35, 0.0, d) * 1.2;
  }
  gl_FragColor = vec4(vColor.rgb * a * vColor.a, 1.0);
}
`;
export class Particles {
  ctx;
  points;
  max;
  pos;
  col;
  siz;
  sty;
  vel;
  age;
  life;
  size0;
  rgb;
  mode;
  drag;
  grav;
  sw;
  delay;
  targets;
  cursor = 0;
  alive = 0;
  uniforms = {
    uScale: {
      value: 400,
    },
  };
  constructor(ctx, max = 900) {
    this.ctx = ctx;
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.siz = new Float32Array(max);
    this.sty = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.size0 = new Float32Array(max);
    this.rgb = new Float32Array(max * 3);
    this.mode = new Uint8Array(max);
    this.drag = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.sw = new Float32Array(max * 8);
    this.delay = new Float32Array(max);
    this.targets = Array(max).fill(null);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    geometry.setAttribute('aColor', new BufferAttribute(this.col, 4).setUsage(DynamicDrawUsage));
    geometry.setAttribute('aSize', new BufferAttribute(this.siz, 1).setUsage(DynamicDrawUsage));
    geometry.setAttribute('aStyle', new BufferAttribute(this.sty, 1).setUsage(DynamicDrawUsage));
    const material = new ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    this.points = new Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.points.name = 'content-particles';
    ctx.scene.add(this.points);
  }
  spawn(opts) {
    let slot = this.cursor;
    for (let i = 0; i < this.max; i++) {
      const j = (this.cursor + i) % this.max;
      if (this.life[j] <= 0) {
        slot = j;
        break;
      }
    }
    this.cursor = (slot + 1) % this.max;
    const i3 = slot * 3;
    this.pos[i3] = opts.x;
    this.pos[i3 + 1] = opts.y;
    this.pos[i3 + 2] = opts.z;
    this.vel[i3] = opts.vx ?? 0;
    this.vel[i3 + 1] = opts.vy ?? 0;
    this.vel[i3 + 2] = opts.vz ?? 0;
    const bright = opts.bright ?? 1;
    this.rgb[i3] = opts.color.r * bright;
    this.rgb[i3 + 1] = opts.color.g * bright;
    this.rgb[i3 + 2] = opts.color.b * bright;
    this.age[slot] = 0;
    this.life[slot] = opts.life;
    this.size0[slot] = opts.size;
    this.mode[slot] = opts.mode ?? ParticleMode.Ballistic;
    this.drag[slot] = opts.drag ?? 0;
    this.grav[slot] = opts.gravity ?? 0;
    this.delay[slot] = opts.delay ?? 0;
    this.targets[slot] = opts.target ?? null;
    this.sty[slot] = opts.style ?? 0;
    const i8 = slot * 8;
    this.sw[i8] = opts.cx ?? opts.x;
    this.sw[i8 + 1] = opts.cy ?? opts.y;
    this.sw[i8 + 2] = opts.cz ?? opts.z;
    this.sw[i8 + 3] = opts.angle ?? 0;
    this.sw[i8 + 4] = opts.radius ?? 0;
    this.sw[i8 + 5] = opts.angVel ?? 0;
    this.sw[i8 + 6] = opts.shrink ?? 0;
    this.sw[i8 + 7] = opts.y - (opts.cy ?? opts.y);
    this.alive++;
  }
  update(dt) {
    const camera = this.ctx.camera;
    this.uniforms.uScale.value =
      this.ctx.renderer.domElement.height / (2 * Math.tan(MathUtils.degToRad(camera.fov) / 2));
    if (this.alive <= 0) return;
    let alive = 0;
    const elapsed = this.ctx.time.elapsed;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.siz[i] !== 0) this.siz[i] = 0;
        continue;
      }
      alive++;
      const i3 = i * 3;
      this.age[i] += dt;
      const t2 = this.age[i] / this.life[i];
      if (t2 >= 1) {
        this.life[i] = 0;
        this.siz[i] = 0;
        this.col[i * 4 + 3] = 0;
        continue;
      }
      const mode = this.mode[i];
      if (mode === ParticleMode.Swirl) {
        const i8 = i * 8;
        this.sw[i8 + 3] += this.sw[i8 + 5] * dt * (1 + t2 * 2.5);
        this.sw[i8 + 4] *= Math.exp(-this.sw[i8 + 6] * dt);
        this.sw[i8 + 7] *= Math.exp(-this.sw[i8 + 6] * 0.8 * dt);
        const angle = this.sw[i8 + 3];
        const radius = this.sw[i8 + 4];
        this.pos[i3] = this.sw[i8] + Math.cos(angle) * radius;
        this.pos[i3 + 1] = this.sw[i8 + 1] + this.sw[i8 + 7] + Math.sin(angle * 2.3 + i) * 0.1 * radius;
        this.pos[i3 + 2] = this.sw[i8 + 2] + Math.sin(angle) * radius;
      } else {
        const target = this.targets[i];
        if (mode === ParticleMode.Homing && target && this.age[i] > this.delay[i]) {
          const dx = target.x - this.pos[i3];
          const dy = target.y - this.pos[i3 + 1];
          const dz = target.z - this.pos[i3 + 2];
          const dist = Math.hypot(dx, dy, dz);
          if (dist < 0.35) {
            this.life[i] = 0;
            this.siz[i] = 0;
            continue;
          }
          const accel = 28 + this.age[i] * 40;
          this.vel[i3] += (dx / dist) * accel * dt;
          this.vel[i3 + 1] += (dy / dist) * accel * dt;
          this.vel[i3 + 2] += (dz / dist) * accel * dt;
          const damp = Math.exp(-3.2 * dt);
          this.vel[i3] *= damp;
          this.vel[i3 + 1] *= damp;
          this.vel[i3 + 2] *= damp;
        } else if (mode === ParticleMode.Rise) {
          this.vel[i3] += Math.sin(elapsed * 3 + i) * 0.8 * dt;
          this.vel[i3 + 2] += Math.cos(elapsed * 2.7 + i * 1.3) * 0.8 * dt;
        }
        this.vel[i3 + 1] += this.grav[i] * dt;
        if (this.drag[i] > 0) {
          const damp = Math.exp(-this.drag[i] * dt);
          this.vel[i3] *= damp;
          this.vel[i3 + 1] *= damp;
          this.vel[i3 + 2] *= damp;
        }
        this.pos[i3] += this.vel[i3] * dt;
        this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
        this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      }
      const alpha = Math.min(1, t2 * 8) * (1 - t2 * t2);
      this.col[i * 4] = this.rgb[i3];
      this.col[i * 4 + 1] = this.rgb[i3 + 1];
      this.col[i * 4 + 2] = this.rgb[i3 + 2];
      this.col[i * 4 + 3] = alpha;
      this.siz[i] = this.size0[i] * (mode === ParticleMode.Homing ? 1 - t2 * 0.5 : 1 - t2 * 0.35);
    }
    this.alive = alive;
    const geometry = this.points.geometry;
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.aColor.needsUpdate = true;
    geometry.attributes.aSize.needsUpdate = true;
    geometry.attributes.aStyle.needsUpdate = true;
  }
}
