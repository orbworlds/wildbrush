/**
 * Sky waterfalls and pools: one mesh of falling sheets, the streams that feed them and flat pools, with a shader for flutter, foam and ripples. Returns mist points for the clouds at each fall.
 */
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Mesh, ShaderMaterial, UniformsLib, Vector3 } from 'three';
const SKY_WATER_VERTEX = `
#include <wb_common>
#include <fog_pars_vertex>
attribute vec2 aUv;
attribute float aKind;
attribute float aFall;
varying vec2 vUv;
varying float vKind;
varying float vFall;
varying vec3 vW;
varying vec3 vN;
void main() {
  vUv = aUv;
  vKind = aKind;
  vFall = aFall;
  vec3 p = position;
  // the falling sheet flutters and spreads a little as it falls
  if (aKind < 0.5) {
    float w = sin(uTime * 2.3 + aFall * 14.0 + aUv.x * 3.0) * 0.12 + sin(uTime * 4.1 + aFall * 31.0) * 0.06;
    p += normal * w * aFall * 3.0;
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const SKY_WATER_FRAGMENT = `
#include <wb_common>
#include <fog_pars_fragment>
varying vec2 vUv;
varying float vKind;
varying float vFall;
varying vec3 vW;
varying vec3 vN;
void main() {
  vec3 N = normalize(vN);
  vec3 V = normalize(uCameraPos - vW);
  if (dot(N, V) < 0.0) N = -N;
  vec3 shallow = vec3(0.36, 0.72, 0.78);
  vec3 foamC = vec3(0.93, 0.97, 1.0);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 light = uSkyColor * 0.55 + uSunColor * (0.35 + 0.5 * ndl);
  vec4 col;
  if (vKind < 0.5) {
    float t = uTime;
    float n1 = wbNoise2(vec2(vUv.x * 7.0, vUv.y * 0.22 - t * 1.6));
    float n2 = wbNoise2(vec2(vUv.x * 19.0 + 3.0, vUv.y * 0.55 - t * 3.4));
    float n3 = wbNoise2(vec2(vUv.x * 40.0 + 9.0, vUv.y * 1.3 - t * 6.0));
    float streak = smoothstep(0.3, 0.85, n1 * 0.5 + n2 * 0.35 + n3 * 0.15);
    float top = 1.0 - smoothstep(0.0, 0.06, vFall);
    float foam = clamp(streak * 0.85 + top * 0.6 + smoothstep(0.55, 0.9, vFall) * 0.5, 0.0, 1.0);
    vec3 c = mix(shallow, foamC, foam) * light;
    float edge = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x);
    float breakup = smoothstep(0.15, 0.55, n1 + (1.0 - vFall) * 0.35);
    float a = edge * (0.62 + 0.38 * foam) * mix(1.0, breakup, smoothstep(0.35, 0.9, vFall));
    a *= 1.0 - smoothstep(0.72, 1.0, vFall);
    float fr = pow(1.0 - abs(dot(N, V)), 3.0);
    c += uSkyColor * fr * 0.35;
    col = vec4(c, a);
  } else {
    // flat pool / stream water: gentle ripples, sky reflection, flow along vUv.y
    float t = uTime;
    float r1 = wbNoise2(vW.xz * 1.3 + vec2(t * 0.35, -t * 0.2) + vec2(0.0, vUv.y * 0.8 - t * vFall));
    float r2 = wbNoise2(vW.xz * 3.1 - vec2(t * 0.5, t * 0.3));
    float rip = r1 * 0.6 + r2 * 0.4;
    vec3 refl = mix(uSkyColor * 1.1, vec3(1.0), smoothstep(0.62, 0.9, rip) * 0.5);
    float fr = 0.25 + 0.75 * pow(1.0 - max(dot(vec3(0.0, 1.0, 0.0), V), 0.0), 3.0);
    vec3 c = mix(shallow * 0.75 * light, refl, fr * 0.7);
    float spec = pow(max(dot(reflect(-uSunDir, vec3(0.0, 1.0, 0.0) + vec3(rip - 0.5, 0.0, r2 - 0.5) * 0.15), V), 0.0), 80.0);
    c += uSunColor * spec * 1.2;
    float foam = smoothstep(0.72, 0.95, rip) * vFall * 0.6;
    c = mix(c, foamC * light, foam);
    float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    col = vec4(c, (0.72 + 0.2 * fr) * edge);
  }
  gl_FragColor = col;
  #include <fog_fragment>
}
`;
function skyWaterUniforms(ctx) {
  const uniforms = {};
  const fog = UniformsLib.fog;
  for (const key of Object.keys(fog)) uniforms[key] = fog[key];
  Object.assign(uniforms, ctx.globals);
  return uniforms;
}
export function buildSkyWater(ctx, falls, pools, heightAt) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const kinds = [];
  const fallT = [];
  const indices = [];
  const mistPoints = [];
  const addVert = (p, normal, u2, v, kind, fall) => {
    positions.push(p.x, p.y, p.z);
    normals.push(normal.x, normal.y, normal.z);
    uvs.push(u2, v);
    kinds.push(kind);
    fallT.push(fall);
    return positions.length / 3 - 1;
  };
  const addGrid = (rows, cols, base) => {
    for (let i = 0; i < rows - 1; i++)
      for (let j = 0; j < cols - 1; j++) {
        const i0 = base + i * cols + j;
        const i1 = i0 + 1;
        const i2 = i0 + cols;
        const i3 = i2 + 1;
        indices.push(i0, i2, i1, i1, i2, i3);
      }
  };
  const up = new Vector3(0, 1, 0);
  for (const pool of pools) {
    const base = positions.length / 3;
    for (let i = 0; i <= 5; i++) {
      const ringR = (i / 5) * pool.r;
      for (let j = 0; j < 28; j++) {
        const angle = (j / 28) * Math.PI * 2;
        const wobble = i === 5 ? 1 + 0.08 * Math.sin(angle * 3 + pool.r) : 1;
        addVert(
          new Vector3(
            pool.pos.x + Math.cos(angle) * ringR * wobble,
            pool.pos.y,
            pool.pos.z + Math.sin(angle) * ringR * wobble,
          ),
          up,
          1 - (i / 5) * 0.5,
          0,
          1,
          0,
        );
      }
    }
    for (let i = 0; i < 5; i++)
      for (let j = 0; j < 28; j++) {
        const i0 = base + i * 28 + j;
        const i1 = base + i * 28 + ((j + 1) % 28);
        const i2 = i0 + 28;
        const i3 = i1 + 28;
        indices.push(i0, i1, i2, i1, i3, i2);
      }
  }
  for (const fall of falls) {
    const dir = fall.dir.clone().setY(0).normalize();
    const side = new Vector3(-dir.z, 0, dir.x);
    const from = fall.from.clone();
    const lip = fall.lip.clone();
    const dist = Math.hypot(lip.x - from.x, lip.z - from.z);
    if (dist > 0.5) {
      const rows = Math.max(3, Math.ceil(dist / 0.8));
      const base = positions.length / 3;
      const streamDir = new Vector3(lip.x - from.x, 0, lip.z - from.z).normalize();
      const streamSide = new Vector3(-streamDir.z, 0, streamDir.x);
      for (let i = 0; i < rows; i++) {
        const along = i / (rows - 1);
        const mid = from.clone().lerp(lip, along);
        const width = fall.width * (0.55 + 0.3 * along);
        for (let j = 0; j < 4; j++) {
          const across = j / 3;
          const p = mid.clone().addScaledVector(streamSide, (across - 0.5) * width);
          p.y = Math.max(heightAt(p.x, p.z, mid.y) + 0.07, along > 0.92 ? lip.y + 0.05 : -Infinity);
          addVert(p, up, across, along * dist, 1, 1);
        }
      }
      addGrid(rows, 4, base);
    }
    const base = positions.length / 3;
    const speed = 2.4;
    let bottom = fall.lip.clone();
    for (let i = 0; i < 42; i++) {
      const f = (i / 41) ** 1.35;
      const dy = f * fall.drop;
      const reach = speed * Math.sqrt((2 * dy) / 9.8) + 0.25;
      const width = fall.width * (1 + f * 0.9);
      const center = fall.lip
        .clone()
        .addScaledVector(dir, reach)
        .add(new Vector3(0, -dy + 0.05, 0));
      const step = Math.max(0.05, fall.drop / 42);
      const dReach = speed * (Math.sqrt((2 * (dy + step)) / 9.8) - Math.sqrt((2 * dy) / 9.8));
      const tangent = new Vector3()
        .addScaledVector(dir, dReach)
        .add(new Vector3(0, -step, 0))
        .normalize();
      const normal = new Vector3().crossVectors(side, tangent).normalize();
      if (normal.dot(dir) < 0) normal.negate();
      for (let j = 0; j < 7; j++) {
        const across = j / 6;
        const s = (across - 0.5) * 2;
        const bulge = (1 - s * s) * width * 0.28;
        addVert(
          center
            .clone()
            .addScaledVector(side, s * width * 0.5)
            .addScaledVector(normal, bulge),
          normal,
          across,
          dy,
          0,
          i / 41,
        );
      }
      bottom = center;
    }
    addGrid(42, 7, base);
    mistPoints.push({
      pos: bottom.clone().add(new Vector3(0, fall.drop * 0.08, 0)),
      size: 5 + fall.width * 3,
    });
    mistPoints.push({
      pos: fall.lip
        .clone()
        .addScaledVector(dir, 0.8)
        .add(new Vector3(0, -fall.drop * 0.55, 0)),
      size: 2.5 + fall.width * 1.6,
    });
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('aUv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aKind', new Float32BufferAttribute(kinds, 1));
  geometry.setAttribute('aFall', new Float32BufferAttribute(fallT, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const material = new ShaderMaterial({
    uniforms: skyWaterUniforms(ctx),
    vertexShader: SKY_WATER_VERTEX,
    fragmentShader: SKY_WATER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
  material.name = 'sky-water';
  const mesh = new Mesh(geometry, material);
  mesh.name = 'sky-water';
  mesh.renderOrder = 2;
  mesh.matrixAutoUpdate = false;
  return {
    mesh,
    mistPoints,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
