/**
 * Trial Prism: a floating faceted crystal with a halo, a light beam and a ground ring. It sits dormant, charges when the trial is won, then bursts and blazes in its colour.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CustomBlending,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { PALETTE } from '../core/config.js';
import { ParticleMode } from '../shared/particles.js';
import { glowTexture, TAU } from '../shared/util.js';
export const PRISM_VERTEX = `
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vL = position;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
export const PRISM_FRAGMENT = `
#include <wb_common>
uniform vec3 uColor;
uniform float uActive;
uniform float uCharge;
uniform float uFlash;
varying vec3 vN;
varying vec3 vW;
varying vec3 vL;
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
vec3 envc(vec3 d) {
  vec3 c = mix(uGroundColor * 0.7, uSkyColor * 1.15, smoothstep(-0.35, 0.45, d.y));
  c = mix(c, vec3(1.0, 0.97, 0.92), smoothstep(0.0, 0.12, d.y) * smoothstep(0.35, 0.0, d.y) * 0.35);
  c += uSunColor * pow(max(dot(d, normalize(uSunDir)), 0.0), 40.0) * 3.0;
  return c;
}
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uCameraPos - vW);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.2);
  vec3 R = reflect(-V, N);
  vec3 refl = envc(R);
  float facet = wbHash13(floor(N * 5.0 + 0.5) + 3.1);
  vec3 k = vec3(2.3, 3.7, 1.9);
  float t = uTime * 0.12;
  vec3 Tr = refract(-V, N, 1.0 / 1.42);
  vec3 Tg = refract(-V, N, 1.0 / 1.50);
  vec3 Tb = refract(-V, N, 1.0 / 1.60);
  // dispersion: each channel sees the internal bands through a different IOR
  vec3 bands = vec3(
    0.5 + 0.5 * sin(dot(Tr, k) * 5.0 + facet * 11.0 + t * 6.0),
    0.5 + 0.5 * sin(dot(Tg, k) * 5.0 + facet * 11.0 + t * 6.0),
    0.5 + 0.5 * sin(dot(Tb, k) * 5.0 + facet * 11.0 + t * 6.0));
  vec3 rainbow = hue(fract(dot(Tg, k) * 0.22 + facet * 0.63 + t + vL.y * 0.15));
  float streak = pow(abs(sin(dot(Tg, vec3(7.0, 11.0, 5.0)) + facet * 17.0 + vL.y * 3.0)), 18.0);
  vec3 through = envc(Tg);

  // dormant: grey smoky glass
  vec3 glass = vec3(0.2, 0.22, 0.25) * (0.35 + 0.65 * through) + refl * fres * 0.55;
  glass *= 0.75 + 0.5 * facet;
  glass += (rainbow * 0.3 + bands * 0.1) * (0.2 + fres) * 0.45;
  glass += uColor * (0.07 + 0.05 * sin(uTime * 1.5 + vL.y * 2.0));
  glass += streak * 0.18;

  // awakened: colour-filled, blazing core, rainbow fringes on the rims
  float core = pow(ndv, 1.6);
  vec3 lit = uColor * (1.0 + 1.9 * core) * (0.75 + 0.5 * facet) + uColor * uColor * core * 0.8;
  lit += rainbow * fres * 0.9 + bands * uColor * 0.25;
  lit += refl * fres * 0.35 + streak * mix(uColor, vec3(1.0), 0.5) * 1.2;

  vec3 col = mix(glass, lit, uActive);
  col += uColor * uCharge * (0.5 + 1.0 * core) * (0.7 + 0.3 * sin(uTime * 30.0));
  col += vec3(1.0) * uFlash * 2.0;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
const BEAM_VERTEX = `
uniform vec3 uCam;
uniform float uHeight;
uniform float uWidth;
varying vec2 vUv;
varying float vDist;
void main() {
  vec3 base = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 toCam = uCam - base;
  toCam.y = 0.0;
  float dist = length(toCam);
  vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam / max(dist, 0.001)));
  float w = uWidth * (1.0 + dist / 110.0);
  float taper = 1.0 - position.y * 0.35;
  vec3 wp = base + right * position.x * w * taper + vec3(0.0, position.y * uHeight, 0.0);
  vUv = vec2(position.x + 0.5, position.y);
  vDist = dist;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;
const BEAM_FRAGMENT = `
#include <wb_common>
uniform vec3 uColor;
uniform float uIntensity;
uniform float uHeight;
uniform float uGrow;
varying vec2 vUv;
varying float vDist;
void main() {
  float x = (vUv.x - 0.5) * 2.0;
  float y = vUv.y;
  float core = exp(-x * x * 28.0);
  float glow = exp(-x * x * 4.0);
  float n = wbNoise2(vec2(x * 3.0, y * uHeight * 0.04 - uTime * 0.9));
  float n2 = wbNoise2(vec2(x * 7.0 + 3.0, y * uHeight * 0.11 - uTime * 2.1));
  float fade = smoothstep(0.0, 0.015, y) * pow(1.0 - y, 1.3);
  float front = smoothstep(uGrow, uGrow - 0.04, y);
  float a = (core * 1.3 + glow * (0.3 + 0.3 * n) + core * n2 * 0.4) * fade * front;
  vec3 c = mix(uColor, vec3(1.0), core * 0.18) * a * uIntensity;
  gl_FragColor = vec4(c, clamp(a * uIntensity * 0.55, 0.0, 1.0));
}
`;
const PRISM_RING_FRAGMENT = `
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float ring = smoothstep(0.78, 0.97, r) * smoothstep(1.0, 0.97, r);
  float inner = smoothstep(0.2, 0.97, r) * 0.25;
  gl_FragColor = vec4(uColor * (ring * 2.2 + inner * ring * 0.0 + inner * 0.3) * uAlpha, 1.0);
}
`;
const PRISM_RING_VERTEX = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
export function crystalGeometry(radius, topH, bandH, bottomH, sides = 6, twist = 0) {
  const positions = [];
  const ring = (y, rad, phase) => {
    const pts = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * TAU + phase;
      pts.push(new Vector3(Math.cos(angle) * rad, y, Math.sin(angle) * rad));
    }
    return pts;
  };
  const upper = ring(bandH / 2, radius, twist);
  const lower = ring(-bandH / 2, radius * 0.94, twist + 0.08);
  const apexTop = new Vector3(0.03, bandH / 2 + topH, 0);
  const apexBottom = new Vector3(-0.02, -bandH / 2 - bottomH, 0.01);
  const tri = (a, b, c) => positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let i = 0; i < sides; i++) {
    const next = (i + 1) % sides;
    const mid = upper[i].clone().lerp(upper[next], 0.5).lerp(apexTop, 0.35).multiplyScalar(1.04);
    tri(upper[next], upper[i], mid);
    tri(upper[i], apexTop, mid);
    tri(mid, apexTop, upper[next]);
    tri(lower[i], upper[i], upper[next]);
    tri(lower[i], upper[next], lower[next]);
    tri(lower[next], apexBottom, lower[i]);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
export class Prism {
  position;
  particles;
  groundY;
  group = new Group();
  color;
  colorValue;
  state = 'dormant';
  glow = 0.12;
  crystal;
  halo;
  beam;
  ring;
  cu;
  bu;
  ru;
  t = 0;
  chargeT = 0;
  completeT = -1;
  spin = 0;
  spinSpeed = 0.35;
  onDone = null;
  emitAcc = 0;
  beamHeightFull = 420;
  constructor(ctx, color, position, particles, groundY) {
    this.position = position;
    this.particles = particles;
    this.groundY = groundY;
    this.color = color;
    this.colorValue = new Color(PALETTE[color].hex);
    const globals = ctx.globals;
    this.cu = {
      ...globals,
      uColor: {
        value: this.colorValue,
      },
      uActive: {
        value: 0,
      },
      uCharge: {
        value: 0,
      },
      uFlash: {
        value: 0,
      },
    };
    const crystalMat = new ShaderMaterial({
      uniforms: this.cu,
      vertexShader: PRISM_VERTEX,
      fragmentShader: PRISM_FRAGMENT,
    });
    this.crystal = new Mesh(crystalGeometry(0.62, 1.15, 0.55, 1.45), crystalMat);
    this.crystal.name = `prism-${color}`;
    this.group.add(this.crystal);
    const parts = [this.crystal.geometry];
    for (let i = 0; i < 3; i++) {
      const shard = crystalGeometry(0.13, 0.28, 0.1, 0.34, 5, i);
      const angle = (i / 3) * TAU;
      shard.rotateZ(0.3 * (i - 1));
      shard.translate(Math.cos(angle) * 1.45, (i - 1) * 0.45, Math.sin(angle) * 1.45);
      parts.push(shard);
    }
    const positions = [];
    const normals = [];
    for (const part of parts) {
      positions.push(...part.attributes.position.array);
      normals.push(...part.attributes.normal.array);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    for (const part of parts) part.dispose();
    this.crystal.geometry = geometry;
    const haloMat = new SpriteMaterial({
      map: glowTexture(),
      color: this.colorValue.clone(),
      blending: AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: 0.18,
      fog: false,
    });
    this.halo = new Sprite(haloMat);
    this.halo.scale.setScalar(4);
    this.halo.renderOrder = 8;
    this.group.add(this.halo);
    this.group.position.copy(position);
    this.crystal.scale.setScalar(1.15);
    ctx.scene.add(this.group);
    this.bu = {
      ...globals,
      uCam: globals.uCameraPos,
      uColor: {
        value: this.colorValue,
      },
      uIntensity: {
        value: 0.28,
      },
      uHeight: {
        value: 70,
      },
      uWidth: {
        value: 0.9,
      },
      uGrow: {
        value: 1.05,
      },
    };
    const beamGeo = new PlaneGeometry(1, 1, 1, 48);
    beamGeo.translate(0, 0.5, 0);
    const beamMat = new ShaderMaterial({
      uniforms: this.bu,
      vertexShader: BEAM_VERTEX,
      fragmentShader: BEAM_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: CustomBlending,
      blendSrc: OneFactor,
      blendDst: OneMinusSrcAlphaFactor,
      side: DoubleSide,
    });
    this.beam = new Mesh(beamGeo, beamMat);
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 7;
    this.beam.position.copy(position).add(new Vector3(0, 0.6, 0));
    ctx.scene.add(this.beam);
    this.ru = {
      uColor: {
        value: this.colorValue,
      },
      uAlpha: {
        value: 0,
      },
    };
    const ringMat = new ShaderMaterial({
      uniforms: this.ru,
      vertexShader: PRISM_RING_VERTEX,
      fragmentShader: PRISM_RING_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
    });
    this.ring = new Mesh(new PlaneGeometry(2, 2).rotateX(-Math.PI / 2), ringMat);
    this.ring.position.set(position.x, groundY + 0.25, position.z);
    this.ring.visible = false;
    this.ring.renderOrder = 8;
    ctx.scene.add(this.ring);
  }
  beamPoint(height, target = new Vector3()) {
    return target.copy(this.position).setY(this.position.y + height);
  }
  activate(onDone) {
    if (this.state !== 'dormant') return false;
    this.state = 'charging';
    this.chargeT = 0;
    this.onDone = onDone;
    const position = this.position;
    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * TAU;
      const radius = 3 + Math.random() * 5;
      const color = i % 3 == 0 ? new Color(1, 1, 1) : this.colorValue;
      this.particles.spawn({
        x: position.x,
        y: position.y - 2.2 + Math.random() * 1.6,
        z: position.z,
        cx: position.x,
        cy: position.y,
        cz: position.z,
        angle,
        radius,
        angVel: 1.4 + Math.random() * 1.6,
        shrink: 1.2 + Math.random() * 0.9,
        mode: ParticleMode.Swirl,
        color,
        bright: 2.2,
        size: 0.12 + Math.random() * 0.16,
        life: 1.35 + Math.random() * 0.3,
      });
    }
    return true;
  }
  completeInstant() {
    this.state = 'complete';
    this.completeT = this.t - 10;
    this.cu.uActive.value = 1;
    this.bu.uGrow.value = 1.05;
  }
  burst() {
    const position = this.position;
    for (let i = 0; i < 120; i++) {
      const up = Math.random() * 2 - 1;
      const angle = Math.random() * TAU;
      const horiz = Math.sqrt(1 - up * up);
      const speed = 4 + Math.random() * 9;
      this.particles.spawn({
        x: position.x,
        y: position.y,
        z: position.z,
        vx: Math.cos(angle) * horiz * speed,
        vy: up * speed * 0.7 + 3,
        vz: Math.sin(angle) * horiz * speed,
        drag: 1.6,
        gravity: -2.5,
        color: i % 4 == 0 ? new Color(1, 1, 1) : this.colorValue,
        bright: 2.4,
        size: 0.14 + Math.random() * 0.2,
        life: 1.2 + Math.random() * 1.4,
      });
    }
  }
  update(dt) {
    this.t += dt;
    const t = this.t;
    const cu = this.cu;
    if (this.state === 'charging') {
      this.chargeT += dt;
      const charge = Math.min(1, this.chargeT / 1.5);
      cu.uCharge.value = charge * charge;
      this.spinSpeed = 0.35 + charge * charge * 9;
      this.halo.scale.setScalar(4 + charge * 3);
      this.halo.material.opacity = 0.18 + charge * 0.4;
      this.glow = 0.12 + 0.3 * charge;
      if (charge >= 1) {
        this.state = 'complete';
        this.completeT = t;
        cu.uCharge.value = 0;
        this.bu.uGrow.value = 0;
        this.ring.visible = true;
        this.burst();
        const onDone = this.onDone;
        this.onDone = null;
        try {
          onDone?.();
        } catch (err) {
          console.warn('[content] prism onDone failed', err);
        }
      }
    }
    if (this.state === 'complete') {
      const since = t - this.completeT;
      cu.uActive.value = Math.min(1, since * 2.5);
      cu.uFlash.value = Math.max(0, 1 - since * 3) * 0.8;
      this.spinSpeed += (0.6 - this.spinSpeed) * Math.min(1, dt * 1.5);
      const pulse = 1 + 0.06 * Math.sin(t * 2.2);
      const pop = since < 0.6 ? 1 + Math.sin((since / 0.6) * Math.PI) * 0.8 : 1;
      this.halo.scale.setScalar(6.5 * pulse * pop);
      this.halo.material.opacity = 0.5;
      this.glow += (1 - this.glow) * Math.min(1, dt * 2);
      this.bu.uGrow.value = Math.min(1.05, since * 0.9);
      this.bu.uHeight.value = this.beamHeightFull;
      this.bu.uWidth.value = 2.1 + Math.max(0, 1 - since) * 2.5;
      this.bu.uIntensity.value = 1.1 + Math.max(0, 1 - since * 0.8) * 1.2;
      if (this.ring.visible) {
        const ringK = since / 1.6;
        if (ringK >= 1) this.ring.visible = false;
        else {
          const ringScale = 1 + (1 - (1 - ringK) ** 3) * 32;
          this.ring.scale.set(ringScale, 1, ringScale);
          this.ru.uAlpha.value = (1 - ringK) * 1.4;
        }
      }
      for (this.emitAcc += dt * 6; this.emitAcc > 1;) {
        --this.emitAcc;
        const angle = Math.random() * TAU;
        const dist = 0.6 + Math.random() * 1.6;
        this.particles.spawn({
          x: this.position.x + Math.cos(angle) * dist,
          y: this.position.y - 1.2 + Math.random() * 2.4,
          z: this.position.z + Math.sin(angle) * dist,
          vy: 0.6 + Math.random() * 0.8,
          mode: ParticleMode.Rise,
          color: this.colorValue,
          bright: 1.6,
          size: 0.08 + Math.random() * 0.08,
          life: 1.6 + Math.random(),
        });
      }
    } else if (this.state === 'dormant') {
      this.bu.uHeight.value = 70;
      this.bu.uWidth.value = 0.8;
      this.bu.uIntensity.value = 0.32 + 0.06 * Math.sin(t * 1.3);
      this.glow = 0.12;
    }
    this.spin += this.spinSpeed * dt;
    this.crystal.rotation.y = this.spin;
    this.crystal.position.y = Math.sin(t * 1.1) * 0.18;
    this.crystal.rotation.z = Math.sin(t * 0.7) * 0.05;
  }
}
