/**
 * Builds the cave's materials by patching MeshStandardMaterial with the cave shader chunks (rock, fungus, crystal, pool, carved stone) and the additive glow-card and light-beam materials.
 */
import { AdditiveBlending, Color, DoubleSide, MeshStandardMaterial, ShaderMaterial } from 'three';
import {
  CRYSTAL_EMISSIVE_FRAGMENT,
  CRYSTAL_LIGHTS_FRAGMENT,
  CRYSTAL_PARS_FRAGMENT,
  CRYSTAL_PARS_VERTEX,
  CRYSTAL_PROJECT_VERTEX,
  FUNGUS_BEGIN_VERTEX,
  FUNGUS_COLOR_FRAGMENT,
  FUNGUS_EMISSIVE_FRAGMENT,
  FUNGUS_LIGHTS_FRAGMENT,
  FUNGUS_PARS_FRAGMENT,
  FUNGUS_PARS_VERTEX,
  FUNGUS_PROJECT_VERTEX,
  POOL_EMISSIVE_FRAGMENT,
  POOL_NORMAL_FRAGMENT,
  POOL_PARS_FRAGMENT,
  POOL_PARS_VERTEX,
  POOL_PROJECT_VERTEX,
  ROCK_COLOR_FRAGMENT,
  ROCK_EMISSIVE_FRAGMENT,
  ROCK_LIGHTS_FRAGMENT,
  ROCK_NORMAL_FRAGMENT,
  ROCK_PARS_FRAGMENT,
  ROCK_PARS_VERTEX,
  ROCK_PROJECT_VERTEX,
  ROCK_ROUGHNESS_FRAGMENT,
  STONE_COLOR_FRAGMENT,
  STONE_EMISSIVE_FRAGMENT,
  STONE_LIGHTS_FRAGMENT,
  STONE_NORMAL_FRAGMENT,
  STONE_PARS_FRAGMENT,
  STONE_PARS_VERTEX,
  STONE_PROJECT_VERTEX,
} from './shaders.js';
export function makeStoneMaterial(ctx, U, emissive = new Color(0, 0, 0)) {
  const globals = ctx.globals;
  const uniforms = U;
  const emit = {
    value: emissive.clone(),
  };
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0,
  });
  material.name = 'glowcap-stone';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, uniforms, {
      uStoneEmit: emit,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${STONE_PARS_VERTEX}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${STONE_PROJECT_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${STONE_PARS_FRAGMENT}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${STONE_COLOR_FRAGMENT}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${STONE_NORMAL_FRAGMENT}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${STONE_EMISSIVE_FRAGMENT}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${STONE_LIGHTS_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => 'wb-glowcap-stone-v1';
  patchPaint(ctx, material);
  material.userData.emit = emit;
  return material;
}
const FUNGUS_FOLD_VERTEX = `
#ifdef CV_FOLD
if (aFung.x > 0.5 && aFung.x < 3.5) {
  // a closed bell (fold 0) that unfurls into the broad cap (fold 1)
  vec3 q = transformed - aPivot;
  float r = length(q.xz);
  float f = uFold;
  q.xz *= mix(0.34, 1.0, f);
  q.y -= (1.0 - f) * r * r * 0.12;
  q.y += (1.0 - f) * 0.9;
  transformed = aPivot + q;
}
#endif
`;
export function makeFungusMaterial(ctx, U, fold) {
  const globals = ctx.globals;
  const uniforms = U;
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.6,
    metalness: 0,
  });
  material.name = fold ? 'glowcap-fungus-fold' : 'glowcap-fungus';
  material.onBeforeCompile = (shader) => {
    Object.assign(
      shader.uniforms,
      globals,
      uniforms,
      fold
        ? {
            uFold: fold,
          }
        : {},
    );
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${
          fold
            ? `#define CV_FOLD 1
uniform float uFold;`
            : ''
        }\n${FUNGUS_PARS_VERTEX}`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${FUNGUS_FOLD_VERTEX}\n${FUNGUS_BEGIN_VERTEX}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${FUNGUS_PROJECT_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n#include <wb_common>\n${FUNGUS_PARS_FRAGMENT}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FUNGUS_COLOR_FRAGMENT}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${FUNGUS_EMISSIVE_FRAGMENT}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FUNGUS_LIGHTS_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => (fold ? 'wb-glowcap-fungus-fold-v1' : 'wb-glowcap-fungus-v1');
  patchPaint(ctx, material);
  return material;
}
function patchPaint(ctx, material) {
  try {
    ctx.paint.patchMaterial(material, {
      paint: true,
      vitality: false,
    });
  } catch (err) {
    console.warn('[caverns] patchMaterial failed', err);
  }
}
export function makeMaterials(ctx, U) {
  const globals = ctx.globals;
  const uniforms = U;
  const makeRock = (outside) => {
    const material = new MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
    });
    material.name = outside ? 'glowcap-rock-out' : 'glowcap-rock';
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, globals, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${ROCK_PARS_VERTEX}`)
        .replace('#include <project_vertex>', `#include <project_vertex>\n${ROCK_PROJECT_VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${ROCK_PARS_FRAGMENT}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${ROCK_COLOR_FRAGMENT}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${ROCK_ROUGHNESS_FRAGMENT}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${ROCK_NORMAL_FRAGMENT}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${ROCK_EMISSIVE_FRAGMENT}`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${ROCK_LIGHTS_FRAGMENT}`);
    };
    material.customProgramCacheKey = () => (outside ? 'wb-glowcap-rock-out-v1' : 'wb-glowcap-rock-v1');
    try {
      ctx.paint.patchMaterial(material, {
        paint: true,
        vitality: outside,
      });
    } catch (err) {
      console.warn('[caverns] patchMaterial failed', err);
    }
    return material;
  };
  const rock = makeRock(false);
  const rockOut = makeRock(true);
  const fungus = makeFungusMaterial(ctx, U);
  const crystal = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.18,
    metalness: 0.05,
    flatShading: true,
  });
  crystal.name = 'glowcap-crystal';
  crystal.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${CRYSTAL_PARS_VERTEX}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${CRYSTAL_PROJECT_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${CRYSTAL_PARS_FRAGMENT}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${CRYSTAL_EMISSIVE_FRAGMENT}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${CRYSTAL_LIGHTS_FRAGMENT}`);
  };
  crystal.customProgramCacheKey = () => 'wb-glowcap-crystal-v1';
  const poolUniforms = {
    uPoolGlow: {
      value: new Color(0.04, 0.26, 0.3),
    },
  };
  const pool = new MeshStandardMaterial({
    color: 0x0c2a33,
    roughness: 0.06,
    metalness: 0,
  });
  pool.name = 'glowcap-pool';
  pool.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, uniforms, poolUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${POOL_PARS_VERTEX}`)
      .replace('#include <project_vertex>', `#include <project_vertex>\n${POOL_PROJECT_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${POOL_PARS_FRAGMENT}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${POOL_NORMAL_FRAGMENT}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${POOL_EMISSIVE_FRAGMENT}`);
  };
  pool.customProgramCacheKey = () => 'wb-glowcap-pool-v1';
  return {
    rock,
    rockOut,
    fungus,
    crystal,
    pool,
    dispose() {
      rock.dispose();
      rockOut.dispose();
      fungus.dispose();
      crystal.dispose();
      pool.dispose();
    },
  };
}
export function makeGlowCardMaterial(ctx, color, intensity = 1) {
  return new ShaderMaterial({
    uniforms: {
      ...ctx.globals,
      uColor: {
        value: color.clone(),
      },
      uI: {
        value: intensity,
      },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      #include <wb_common>
      uniform vec3 uColor;
      uniform float uI;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5) * 2.0;
        float a = pow(max(1.0 - d, 0.0), 2.2);
        float fl = 0.9 + 0.1 * sin(uTime * 6.0);
        gl_FragColor = vec4(uColor * a * uI * fl, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}
export function makeBeamMaterial(ctx, color) {
  return new ShaderMaterial({
    uniforms: {
      ...ctx.globals,
      uColor: {
        value: color.clone(),
      },
      uI: {
        value: 0,
      },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      #include <wb_common>
      uniform vec3 uColor;
      uniform float uI;
      varying vec2 vUv;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float edge = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 1.6);
        float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
        float motes = 0.8 + 0.2 * wbNoise2(vec2(vUv.x * 12.0, vUv.y * 6.0 - uTime * 0.4));
        float a = edge * along * motes * uI;
        gl_FragColor = vec4(uColor * a, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}
