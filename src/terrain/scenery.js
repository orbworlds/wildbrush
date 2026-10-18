/**
 * Distant scenery: low-poly islands on the horizon, lit by the sun and hazed toward the fog colour.
 */
import { BufferGeometry, Color, Float32BufferAttribute, Mesh, ShaderMaterial } from 'three';
import { clamp, fbm, makeNoise2D, makeRng, smoothstep } from '../core/math.js';
const DISTANT_ISLANDS = [
  {
    x: -220,
    z: -820,
    r: 360,
    h: 95,
    peaks: 5,
    rough: 0.35,
    seed: 1,
  },
  {
    x: 300,
    z: -1050,
    r: 420,
    h: 125,
    peaks: 6,
    rough: 0.4,
    seed: 2,
  },
  {
    x: 40,
    z: -600,
    r: 150,
    h: 42,
    peaks: 3,
    rough: 0.3,
    seed: 3,
  },
  {
    x: -700,
    z: -640,
    r: 300,
    h: 80,
    peaks: 4,
    rough: 0.35,
    seed: 4,
  },
  {
    x: -950,
    z: -60,
    r: 260,
    h: 60,
    peaks: 3,
    rough: 0.3,
    seed: 5,
  },
  {
    x: -440,
    z: -250,
    r: 80,
    h: 20,
    peaks: 2,
    rough: 0.25,
    seed: 6,
  },
  {
    x: -780,
    z: 560,
    r: 240,
    h: 48,
    peaks: 3,
    rough: 0.3,
    seed: 7,
  },
  {
    x: 140,
    z: 980,
    r: 220,
    h: 34,
    peaks: 3,
    rough: 0.25,
    seed: 8,
  },
  {
    x: -320,
    z: 440,
    r: 70,
    h: 15,
    peaks: 2,
    rough: 0.2,
    seed: 9,
  },
  {
    x: 780,
    z: 660,
    r: 280,
    h: 62,
    peaks: 4,
    rough: 0.3,
    seed: 10,
  },
  {
    x: 1050,
    z: -240,
    r: 320,
    h: 90,
    peaks: 5,
    rough: 0.35,
    seed: 11,
  },
  {
    x: 600,
    z: -680,
    r: 200,
    h: 55,
    peaks: 3,
    rough: 0.35,
    seed: 12,
  },
  {
    x: 400,
    z: 320,
    r: 60,
    h: 14,
    peaks: 2,
    rough: 0.2,
    seed: 13,
  },
  {
    x: 320,
    z: -350,
    r: 34,
    h: 22,
    peaks: 1,
    rough: 0.4,
    seed: 14,
  },
];
function addIsland(island, positions, colors, indices) {
  const rng = makeRng('scenery-' + island.seed);
  const noise = makeNoise2D('scenery-n-' + island.seed);
  const peaks = [];
  for (let i = 0; i < island.peaks; i++) {
    const ang = rng() * Math.PI * 2;
    const dist = i === 0 ? 0 : island.r * (0.25 + rng() * 0.35);
    peaks.push({
      x: Math.cos(ang) * dist,
      z: Math.sin(ang) * dist,
      r: island.r * (0.45 + rng() * 0.35),
      h: island.h * (i === 0 ? 1 : 0.45 + rng() * 0.4),
    });
  }
  const size = island.r;
  const base = positions.length / 3;
  const color = new Color();
  const grassColor = new Color('#6f9a58');
  const rockColor = new Color('#9a9088');
  const sandColor = new Color('#d8c89c');
  for (let j = 0; j <= 34; j++)
    for (let k = 0; k <= 34; k++) {
      const u2 = (k / 34) * 2 - 1;
      const v2 = (j / 34) * 2 - 1;
      const x2 = u2 * size * 1.15;
      const z = v2 * size * 1.15;
      const radial = Math.hypot(x2, z) / size;
      let h = 0;
      for (const peak of peaks) {
        const d = Math.hypot(x2 - peak.x, z - peak.z) / peak.r;
        const f = clamp(1 - d, 0, 1);
        h = Math.max(h, peak.h * f * f * (3 - 2 * f));
      }
      const n = fbm(noise, x2 * 0.006, z * 0.006, 4);
      h *= 1 + n * island.rough * 1.6;
      h += (1 - Math.abs(noise(x2 * 0.02, z * 0.02))) * island.h * 0.06;
      const mask = smoothstep(1.05, 0.7, radial + n * 0.25);
      const y = h * mask + (mask - 1) * 12 - 1.5 + mask * 3;
      positions.push(island.x + x2, y, island.z + z);
      const alt = clamp(y / Math.max(20, island.h * 0.55), 0, 1);
      color.copy(grassColor).lerp(rockColor, smoothstep(0.35, 0.8, alt));
      if (y < 2.5) color.copy(sandColor);
      colors.push(color.r, color.g, color.b);
    }
  for (let i = 0; i < 34; i++)
    for (let j = 0; j < 34; j++) {
      const a2 = base + i * 35 + j;
      const b = a2 + 1;
      const c = a2 + 35;
      const d = c + 1;
      indices.push(a2, c, b, c, d, b);
    }
}
export function createDistantScenery(ctx) {
  const positions = [];
  const colors = [];
  const indices = [];
  for (const island of DISTANT_ISLANDS) addIsland(island, positions, colors, indices);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const haze = new Color('#dfe9ef');
  const material = new ShaderMaterial({
    name: 'distant-scenery',
    uniforms: {
      ...ctx.globals,
      uHaze: {
        value: haze,
      },
    },
    vertexColors: true,
    fog: false,
    vertexShader: `
      #include <common>
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vC;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vC = color;
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: `
      #include <common>
      #include <wb_common>
      uniform vec3 uHaze;
      varying vec3 vN;
      varying vec3 vW;
      varying vec3 vC;
      void main() {
        vec3 N = normalize(vN);
        float ndl = max(dot(N, normalize(uSunDir)), 0.0);
        vec3 lit = vC * (uSkyColor * 0.55 + uSunColor * ndl * 0.85);
        float dist = length(vW.xz - cameraPosition.xz);
        float h = clamp(1.0 - exp(-dist * 0.0012), 0.42, 0.88);
        h = mix(h, 1.0, (1.0 - smoothstep(0.0, 40.0, vW.y)) * 0.22);
        vec3 col = mix(lit, uHaze, h);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'distant-scenery';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  const fogColor = new Color();
  return {
    object: mesh,
    update() {
      const fog = ctx.scene.fog;
      if (fog && fog.color) fogColor.copy(fog.color);
      else if (ctx.scene.background instanceof Color) fogColor.copy(ctx.scene.background);
      else fogColor.set('#dfe9ef');
      haze.lerp(fogColor, 0.25);
    },
  };
}
