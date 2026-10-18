/**
 * The water system: the sea mesh (a dense grid around the island plus a flat skirt out to the horizon), the underwater screen tint, and water depth queries.
 */
import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, ShaderMaterial, Sphere, Vector3 } from 'three';
import { LANDMARKS } from '../core/config.js';
import { createWaterMaterial } from './material.js';
function createUnderwaterOverlay() {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const material = new ShaderMaterial({
    name: 'underwater-overlay',
    uniforms: {
      uTint: {
        value: new Color('#1b6f86'),
      },
      uStrength: {
        value: 0,
      },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: `
      uniform vec3 uTint;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        float v = smoothstep(1.2, 0.2, length(vUv - 0.5));
        float a = uStrength * mix(0.75, 0.5, v);
        gl_FragColor = vec4(uTint * mix(0.6, 1.0, vUv.y), a);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'underwater-overlay';
  mesh.frustumCulled = false;
  mesh.renderOrder = 10000;
  mesh.visible = false;
  return mesh;
}
const GRID_SIZE = 720;
const SEA_SIZE = 6000;
function createSeaGeometry(res) {
  const positions = [];
  const indices = [];
  const cells = res;
  const step = GRID_SIZE / cells;
  for (let i = 0; i <= cells; i++) for (let j = 0; j <= cells; j++) positions.push(-360 + j * step, 0, -360 + i * step);
  for (let i = 0; i < cells; i++)
    for (let j = 0; j < cells; j++) {
      const a2 = i * (cells + 1) + j;
      const b = a2 + 1;
      const c = a2 + cells + 1;
      const d = c + 1;
      indices.push(a2, c, b, c, d, b);
    }
  const half = SEA_SIZE / 2;
  const base = positions.length / 3;
  positions.push(-3000, 0, -3000, half, 0, -3000, half, 0, half, -3000, 0, half);
  const inner1 = cells;
  const inner2 = (cells + 1) * (cells + 1) - 1;
  const inner3 = cells * (cells + 1);
  const outer0 = base;
  const outer1 = base + 1;
  const outer2 = base + 2;
  const outer3 = base + 3;
  indices.push(outer0, 0, outer1, 0, inner1, outer1);
  indices.push(outer1, inner1, outer2, inner1, inner2, outer2);
  indices.push(outer2, inner2, outer3, inner2, inner3, outer3);
  indices.push(outer3, inner3, outer0, inner3, 0, outer0);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.boundingSphere = new Sphere(new Vector3(), SEA_SIZE);
  return geometry;
}
export async function create(ctx) {
  const waterMaterial = createWaterMaterial(ctx, new Vector3(LANDMARKS.lake.x, LANDMARKS.lake.z, 36));
  const res = ctx.settings.quality === 'low' ? 144 : ctx.settings.quality === 'medium' ? 220 : 288;
  const mesh = new Mesh(createSeaGeometry(res), waterMaterial);
  mesh.name = 'water';
  mesh.position.y = 0;
  mesh.frustumCulled = false;
  mesh.receiveShadow = false;
  mesh.castShadow = false;
  mesh.renderOrder = 1;
  const overlay = createUnderwaterOverlay();
  const overlayMaterial = overlay.material;
  const group = new Group();
  group.name = 'water-root';
  group.add(mesh, overlay);
  ctx.scene.add(group);
  const groundAt = (x, z) => {
    try {
      return ctx.terrain.heightAt(x, z);
    } catch {
      return -10;
    }
  };
  const depthAt = (x, z) => {
    const depth = 0 - groundAt(x, z);
    return depth > 0 ? depth : 0;
  };
  const fogColor = new Color();
  const horizon = waterMaterial.uniforms.uHorizon.value;
  let underwater = 0;
  if (ctx.debug) {
    const folder = ctx.debug.addFolder('Water');
    folder.add(waterMaterial.uniforms.uWaveHeight, 'value', 0, 3, 0.01).name('wave height');
    folder
      .addColor(
        {
          c: '#3fc1c9',
        },
        'c',
      )
      .name('shallow')
      .onChange((hex) => waterMaterial.uniforms.uShallow.value.set(hex));
    folder
      .addColor(
        {
          c: '#135a7a',
        },
        'c',
      )
      .name('deep')
      .onChange((hex) => waterMaterial.uniforms.uDeep.value.set(hex));
    folder.close();
  }
  return {
    level: 0,
    depthAt,
    object: group,
    update() {
      const fog = ctx.scene.fog;
      if (fog && fog.color) fogColor.copy(fog.color);
      else if (ctx.scene.background instanceof Color) fogColor.copy(ctx.scene.background);
      else fogColor.set('#dfe9ef');
      horizon.lerp(fogColor, 0.2);
      const camPos = ctx.globals.uCameraPos.value;
      const elapsed = ctx.time.elapsed;
      const surfaceY = 0 + Math.sin(elapsed * 1.3 + camPos.x * 0.16) * 0.06;
      const target = +(camPos.y < surfaceY - 0.05 && depthAt(camPos.x, camPos.z) > 0.1);
      underwater += (target - underwater) * Math.min(1, Math.max(ctx.time.realDt, 1 / 120) * 10);
      overlay.visible = underwater > 0.01;
      overlayMaterial.uniforms.uStrength.value = underwater;
    },
    dispose() {
      ctx.scene.remove(group);
      mesh.geometry.dispose();
      waterMaterial.dispose();
      overlay.geometry.dispose();
      overlayMaterial.dispose();
    },
  };
}
