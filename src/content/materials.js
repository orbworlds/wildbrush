/**
 * Content materials: weathered stone with moss, grime and old paint stains, hand-made props, and glowing glyphs drawn from a procedural glyph atlas whose glow follows island vitality or per-site glow slots.
 */
import { CanvasTexture, DoubleSide, MeshStandardMaterial, SRGBColorSpace } from 'three';
import { randRange, rng } from '../shared/util.js';
const CONTENT_VARYINGS_GLSL = `
varying vec3 vCtPos;
varying vec3 vCtNrm;
`;
const CONTENT_WORLDPOS_VERTEX = `
{
  vec4 ctWP = vec4(transformed, 1.0);
  vec3 ctN = objectNormal;
  #ifdef USE_INSTANCING
    ctWP = instanceMatrix * ctWP;
    ctN = mat3(instanceMatrix) * ctN;
  #endif
  ctWP = modelMatrix * ctWP;
  vCtPos = ctWP.xyz;
  vCtNrm = normalize(mat3(modelMatrix) * ctN);
}
`;
const STONE_PARS_FRAGMENT = `
#include <wb_common>
varying vec3 vCtPos;
varying vec3 vCtNrm;
uniform float uCtMoss;
uniform float uCtStain;
vec3 ctPerturb(vec3 surfPos, vec3 surfNorm, float h) {
  vec3 sx = dFdx(surfPos);
  vec3 sy = dFdy(surfPos);
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 grad = sign(det) * (dh.x * r1 + dh.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;
const STONE_COLOR_FRAGMENT = `
float ctMoss = 0.0;
float ctHeight = 0.0;
{
  vec3 p = vCtPos;
  vec3 n = normalize(vCtNrm);
  float big = wbNoise3(p * 0.31);
  float mid = wbNoise3(p * 1.27 + 7.1);
  float fine = wbNoise3(p * 4.9 - 3.3);
  ctHeight = mid * 0.55 + fine * 0.35 + wbNoise3(p * 13.0) * 0.1;
  vec3 col = diffuseColor.rgb;
  col *= 0.8 + 0.24 * big + 0.1 * mid + 0.07 * fine;
  col = mix(col, col * vec3(1.07, 0.97, 0.86), smoothstep(0.3, 0.75, wbNoise3(p * 0.08 + 3.0)));
  float vert = 1.0 - abs(n.y);
  float streak = wbNoise2(vec2((p.x + p.z) * 2.1, p.y * 0.16 + big));
  col *= 1.0 - vert * smoothstep(0.52, 0.9, streak) * 0.2;
  // soft cavity darkening from the height field
  col *= 0.88 + 0.16 * smoothstep(0.2, 0.7, ctHeight);
  // ground contact grime
  float above = p.y - wbTerrainHeight(p.xz);
  float dirt = 1.0 - smoothstep(-0.1, 0.45 + 0.9 * big, above);
  col = mix(col, col * vec3(0.62, 0.57, 0.47), dirt * 0.7);
  // moss / lichen: soft, speckled patches on tops, creeping up from the ground, damp streaks low down
  float up = smoothstep(0.35, 0.9, n.y);
  float lich = wbNoise3(p * 2.7 + 5.0) * 0.6 + fine * 0.4;
  float speck = smoothstep(0.3, 0.7, wbNoise3(p * 12.0 + 3.0));
  float moss = up * smoothstep(0.5, 0.78, lich + big * 0.18) * mix(0.35, 1.0, speck);
  float low = 1.0 - smoothstep(0.3, 2.5, above);
  moss = max(moss, low * smoothstep(0.35, 0.75, lich) * mix(0.4, 1.0, speck) * 0.85);
  moss = max(moss, vert * low * smoothstep(0.62, 0.8, wbNoise3(p * vec3(1.7, 0.7, 1.7) + 11.0)) * 0.5);
  moss *= uCtMoss;
  vec3 mossCol = mix(vec3(0.07, 0.14, 0.03), vec3(0.2, 0.29, 0.06), fine);
  mossCol = mix(mossCol, vec3(0.3, 0.33, 0.12), smoothstep(0.6, 0.9, speck) * 0.4);
  col *= 1.0 - 0.12 * moss;
  col = mix(col, mossCol, moss * 0.9);
  // ancient paint stains: small faded drips of the four colours
  float sn = wbNoise3(vec3(p.x * 2.6, p.y * 0.75 + p.x * 0.2, p.z * 2.6) + 40.0);
  float stain = smoothstep(0.8, 0.83, sn + fine * 0.05) * (1.0 - moss) * uCtStain * smoothstep(0.35, 0.6, wbNoise3(p * 0.3 + 7.0));
  float which = wbNoise3(p * 0.045 + 90.0);
  vec3 sc = which < 0.42 ? vec3(0.95, 0.28, 0.16) : which < 0.5 ? vec3(0.22, 0.6, 0.95)
          : which < 0.58 ? vec3(1.0, 0.78, 0.18) : vec3(0.3, 0.78, 0.32);
  col = mix(col, sc * (0.5 + 0.25 * big), stain * 0.4);
  diffuseColor.rgb = col;
  ctMoss = moss;
}
`;
const STONE_ROUGHNESS_FRAGMENT = `
roughnessFactor = clamp(mix(roughnessFactor, 1.0, ctMoss) - (1.0 - ctHeight) * 0.08, 0.3, 1.0);
`;
const STONE_NORMAL_FRAGMENT = `
normal = ctPerturb(-vViewPosition, normal, ctHeight * (0.035 + 0.03 * ctMoss));
`;
function createGlyphAtlas() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, canvas.width, canvas.height);
  const rand = rng('glyphs');
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (let cell = 0; cell < 16; cell++) {
    const cx = (cell % 4) * 128;
    const cy = Math.floor(cell / 4) * 128;
    if (cell === 15) {
      g.fillRect(cx, cy + 2, 128, 124);
      continue;
    }
    g.save();
    g.translate(cx + 64, cy + 64);
    g.lineWidth = randRange(rand, 8, 11);
    const radius = 43.52;
    const strokes = 2 + Math.floor(rand() * 2);
    const used = new Set();
    for (let j = 0; j < strokes; j++) {
      let kind = Math.floor(rand() * 9);
      for (; used.has(kind);) kind = (kind + 1) % 9;
      used.add(kind);
      g.beginPath();
      switch (kind) {
        case 0:
          g.arc(0, 0, radius * randRange(rand, 0.55, 0.95), rand() * 6.28, rand() * 6.28 + randRange(rand, 2.5, 6.3));
          g.stroke();
          break;
        case 1:
          g.moveTo(randRange(rand, -0.2, 0.2) * radius, -43.52);
          g.quadraticCurveTo(randRange(rand, -0.6, 0.6) * radius, 0, randRange(rand, -0.2, 0.2) * radius, radius * 0.6);
          g.stroke();
          g.beginPath();
          g.arc(0, radius * 0.95, 6, 0, 6.28);
          g.fill();
          break;
        case 2:
          for (let k = 0; k < 3; k++) {
            const y = (k - 1) * radius * 0.5;
            const half = randRange(rand, 0.3, 0.9) * radius;
            g.moveTo(-half, y);
            g.lineTo(half, y);
          }
          g.stroke();
          break;
        case 3: {
          const turns = randRange(rand, 1.3, 2.2);
          for (let k = 0; k <= 40; k++) {
            const angle = (k / 40) * turns * 6.28;
            const rad = (k / 40) * radius * 0.9;
            const x = Math.cos(angle) * rad;
            const y = Math.sin(angle) * rad;
            if (k === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
          break;
        }
        case 4:
          g.moveTo(0, -43.52 * 0.9);
          g.lineTo(radius * 0.8, radius * 0.6);
          g.lineTo(-34.816, radius * 0.6);
          g.closePath();
          g.stroke();
          break;
        case 5:
          for (let k = 0; k <= 24; k++) {
            const x = (k / 24 - 0.5) * 2 * radius;
            const y = Math.sin((k / 24) * 6.28 * randRange(rand, 1, 1.5)) * radius * 0.3;
            if (k === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
          break;
        case 6:
          for (let k = 0; k < 3; k++) {
            g.beginPath();
            const angle = (k / 3) * 6.28 + rand();
            g.arc(Math.cos(angle) * radius * 0.55, Math.sin(angle) * radius * 0.55, 7, 0, 6.28);
            g.fill();
          }
          break;
        case 7:
          g.arc(0, 0, radius * 0.7, 0.6, 5.7);
          g.stroke();
          g.beginPath();
          g.arc(radius * 0.35, 0, radius * 0.45, 1.3, 5);
          g.stroke();
          break;
        case 8:
          g.moveTo(0, -43.52);
          g.bezierCurveTo(radius * 0.8, -4.352, radius * 0.5, radius * 0.9, 0, radius * 0.9);
          g.bezierCurveTo(-21.76, radius * 0.9, -34.816, -4.352, 0, -43.52);
          g.stroke();
      }
    }
    g.restore();
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
export function createMaterials(ctx) {
  const globals = ctx.globals;
  const stoneUniforms = {
    uCtMoss: {
      value: 1,
    },
    uCtStain: {
      value: 1,
    },
  };
  const stoneMat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.86,
    metalness: 0,
  });
  stoneMat.name = 'content-stone';
  stoneMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, stoneUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${CONTENT_VARYINGS_GLSL}\nvoid main() {`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${CONTENT_WORLDPOS_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', `${STONE_PARS_FRAGMENT}\nvoid main() {`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${STONE_COLOR_FRAGMENT}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${STONE_ROUGHNESS_FRAGMENT}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>\n${STONE_NORMAL_FRAGMENT}`);
  };
  stoneMat.customProgramCacheKey = () => 'wb-content-stone-v1';
  const propMat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0,
  });
  propMat.name = 'content-prop';
  propMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', `${CONTENT_VARYINGS_GLSL}\nvoid main() {`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>\n${CONTENT_WORLDPOS_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `#include <wb_common>
varying vec3 vCtPos;
varying vec3 vCtNrm;
void main() {`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          // subtle hand-made variation: soft mottling + fine grain
          vec3 p = vCtPos;
          float m = wbNoise3(p * 3.1) * 0.6 + wbNoise3(p * 11.0) * 0.4;
          float grain = wbNoise3(vec3(p.x * 30.0, p.y * 4.0, p.z * 30.0));
          diffuseColor.rgb *= 0.88 + 0.2 * m + 0.06 * (grain - 0.5);
        }`,
      );
  };
  propMat.customProgramCacheKey = () => 'wb-content-prop-v1';
  const glyphAtlas = createGlyphAtlas();
  const siteGlow = {
    value: [0, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12, 0.12],
  };
  const glyphMat = new MeshStandardMaterial({
    vertexColors: true,
    map: glyphAtlas,
    alphaTest: 0.45,
    roughness: 0.18,
    metalness: 0.1,
    emissive: 0xffffff,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  glyphMat.name = 'content-glyph';
  glyphMat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals, {
      uSiteGlow: siteGlow,
    });
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `attribute float aGlow;\nvarying float vGlowSrc;\n${CONTENT_VARYINGS_GLSL}\nvoid main() {`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>\nvGlowSrc = aGlow;\n${CONTENT_WORLDPOS_VERTEX}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        `#include <wb_common>
#include <wb_paint_pars>
varying float vGlowSrc;
varying vec3 vCtPos;
varying vec3 vCtNrm;
uniform float uSiteGlow[9];
void main() {`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          int si = int(vGlowSrc + 0.5);
          float glow = 0.0;
          if (si <= 0) {
            float vit = wbVitality(vCtPos);
            glow = 0.12 + 0.75 * smoothstep(0.3, 0.9, vit);
          } else {
            for (int k = 1; k < 9; k++) if (k == si) glow = uSiteGlow[k];
          }
          float shimmer = 0.85 + 0.15 * sin(uTime * 2.0 + vCtPos.x * 0.7 + vCtPos.z * 0.5);
          totalEmissiveRadiance = vColor.rgb * glow * glow * 1.35 * shimmer;
          diffuseColor.rgb = mix(diffuseColor.rgb * 0.35, diffuseColor.rgb, glow);
        }`,
      );
  };
  glyphMat.customProgramCacheKey = () => 'wb-content-glyph-v1';
  try {
    ctx.paint.patchMaterial(stoneMat, {
      paint: true,
      vitality: true,
    });
    ctx.paint.patchMaterial(propMat, {
      paint: true,
      vitality: true,
    });
  } catch (err) {
    console.warn('[content] paint.patchMaterial failed', err);
  }
  return {
    stone: stoneMat,
    prop: propMat,
    glyph: glyphMat,
    glyphAtlas,
    siteGlow,
    dispose() {
      stoneMat.dispose();
      propMat.dispose();
      glyphMat.dispose();
      glyphAtlas.dispose();
    },
  };
}
