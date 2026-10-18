/**
 * Instanced spikes that elites raise from the ground (ice, thorns, cinder, spring crystal) with their shader; each spike pops up, lingers and reports when it expires.
 */
import {
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  LatheGeometry,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  UniformsLib,
  Vector2,
  Vector3,
} from 'three';
function spikeUniforms(ctx) {
  const uniforms = {};
  const fog = UniformsLib.fog;
  for (const key of Object.keys(fog)) uniforms[key] = fog[key];
  Object.assign(uniforms, ctx.globals);
  return uniforms;
}
export const SPIKE_KIND = {
  blue: 0,
  green: 1,
  red: 2,
  yellow: 3,
};
const SPIKE_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec4 aS; // kind, seed, glow, _
varying vec3 vN;
varying vec3 vView;
varying vec3 vLocal;
varying float vKind;
varying float vSeed;
varying float vGlow;
void main() {
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  vN = normalize((viewMatrix * modelMatrix * instanceMatrix * vec4(normal, 0.0)).xyz);
  vView = -mvPosition.xyz;
  vLocal = position;
  vKind = aS.x;
  vSeed = aS.y;
  vGlow = aS.z;
  #include <fog_vertex>
}
`;
const SPIKE_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec3 vN;
varying vec3 vView;
varying vec3 vLocal;
varying float vKind;
varying float vSeed;
varying float vGlow;
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vView);
  float ndv = abs(dot(n, v));
  float fres = pow(1.0 - ndv, 2.5);
  vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
  float ndl = max(dot(n, sunV), 0.0);
  vec3 h = normalize(sunV + v);
  float spec = pow(max(dot(n, h), 0.0), 70.0);
  float y = clamp(vLocal.y, 0.0, 1.0);
  vec3 light = uSunColor * (0.35 + 0.65 * ndl) + uSkyColor * 0.45;
  vec3 col;
  vec3 emit = vec3(0.0);
  if (vKind < 0.5) {
    // ice: deep blue core, pale frosty tips, bright glints
    col = mix(vec3(0.12, 0.45, 0.8), vec3(0.8, 0.95, 1.0), fres * 0.8 + y * 0.35) * light;
    col += uSunColor * spec * 2.5;
    col += vec3(0.9, 0.97, 1.0) * smoothstep(0.6, 0.8, wbNoise3(vLocal * 7.0 + vSeed * 9.0)) * 0.3;
    emit = vec3(0.25, 0.6, 1.0) * (0.15 + fres * 0.5) * vGlow;
  } else if (vKind < 1.5) {
    // thorns: dark bark, green towards the tip
    col = mix(vec3(0.12, 0.2, 0.08), vec3(0.3, 0.75, 0.25), smoothstep(0.3, 1.0, y)) * light;
    col += uSunColor * spec * 0.5;
    emit = vec3(0.3, 0.95, 0.4) * smoothstep(0.7, 1.0, y) * 0.6 * vGlow;
  } else if (vKind < 2.5) {
    // cinder: charred rock split by glowing magma
    float cr = 1.0 - smoothstep(0.0, 0.08, abs(wbNoise3(vLocal * vec3(5.0, 3.0, 5.0) + vSeed * 7.0) - 0.5));
    col = vec3(0.12, 0.1, 0.1) * light;
    emit = vec3(1.0, 0.35, 0.08) * (cr * 2.5 + smoothstep(0.7, 1.0, y) * 1.5) * vGlow;
  } else {
    // spring crystal
    col = mix(vec3(0.9, 0.62, 0.05), vec3(1.0, 0.95, 0.6), fres + y * 0.3) * light;
    col += uSunColor * spec * 2.0;
    emit = vec3(1.0, 0.8, 0.2) * (0.2 + fres * 0.6) * vGlow;
  }
  gl_FragColor = vec4(col + emit, 1.0);
  #include <fog_fragment>
}
`;
function spikeGeometry() {
  const profile = [
    new Vector2(0.0001, -0.25),
    new Vector2(0.62, -0.05),
    new Vector2(0.55, 0.35),
    new Vector2(0.28, 0.72),
    new Vector2(0.0001, 1),
  ];
  const geometry = new LatheGeometry(profile, 6).toNonIndexed();
  geometry.deleteAttribute('uv');
  geometry.computeVertexNormals();
  return geometry;
}
export class EliteSpikes {
  capacity;
  mesh;
  aS;
  list = [];
  m = new Matrix4();
  s = new Vector3();
  constructor(ctx, capacity = 64) {
    this.capacity = capacity;
    const geometry = spikeGeometry();
    this.aS = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.aS.setUsage(DynamicDrawUsage);
    geometry.setAttribute('aS', this.aS);
    const material = new ShaderMaterial({
      uniforms: spikeUniforms(ctx),
      vertexShader: SPIKE_VERTEX,
      fragmentShader: SPIKE_FRAGMENT,
      fog: true,
    });
    this.mesh = new InstancedMesh(geometry, material, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.mesh.visible = false;
    this.mesh.name = 'elite-spikes';
    for (let i = 0; i < capacity; i++)
      this.list.push({
        active: false,
        pos: new Vector3(),
        quat: new Quaternion(),
        len: 1,
        width: 0.2,
        birth: 0,
        life: 1,
        kind: 0,
        seed: 0,
      });
  }
  spawn(time, pos, dir, len, width, life, kind) {
    let spike = this.list.find((s) => !s.active);
    spike ||= this.list.reduce((oldest, s) => (oldest.birth < s.birth ? oldest : s));
    spike.active = true;
    spike.pos.copy(pos);
    spike.quat.setFromUnitVectors(_spikeUp, _spikeTmp.copy(dir).normalize());
    spike.len = len;
    spike.width = width;
    spike.birth = time;
    spike.life = life;
    spike.kind = kind;
    spike.seed = Math.random();
  }
  update(time, onExpire) {
    for (const spike of this.list)
      if (spike.active && time - spike.birth > spike.life) {
        spike.active = false;
        _spikeTmp
          .set(0, spike.len * 0.5, 0)
          .applyQuaternion(spike.quat)
          .add(spike.pos);
        onExpire(_spikeTmp, spike.len, spike.kind);
      }
  }
  render(time) {
    let count = 0;
    for (const spike of this.list) {
      if (!spike.active) continue;
      const age = time - spike.birth;
      const grow = age < 0.14 ? spikeEase(Math.max(0, age / 0.14)) : 1;
      const fade = 1 - smooth01((age - (spike.life - 0.3)) / 0.3);
      const size = Math.max(0.001, grow * fade);
      this.s.set(spike.width * (0.6 + 0.4 * size), spike.len * size, spike.width * (0.6 + 0.4 * size));
      this.m.compose(spike.pos, spike.quat, this.s);
      this.mesh.setMatrixAt(count, this.m);
      this.aS.setXYZW(count, spike.kind, spike.seed, 1 + 1.5 * Math.max(0, 1 - age / 0.35), 0);
      count++;
    }
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    if (count > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.aS.needsUpdate = true;
    }
  }
  clear() {
    for (const spike of this.list) spike.active = false;
  }
}
const _spikeUp = new Vector3(0, 1, 0);
const _spikeTmp = new Vector3();
function spikeEase(t) {
  return 1 + 3.2 * (t - 1) ** 3 + 2.2 * (t - 1) ** 2;
}
function smooth01(x) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
