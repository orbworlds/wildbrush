/**
 * Shared vegetation shading: field and paint uniforms, wind gust and leaf lighting GLSL, and the patch that turns a Lambert or depth material into a vegetation material. Also wraps a seeded random function with range, pick and chance helpers.
 */
import { Color } from 'three';
import { PALETTE } from '../core/config.js';
export const toColor = (hex) => new Color(hex);
export function vegUniforms(field) {
  return {
    uVegField: {
      value: field.texture,
    },
    uVegFieldXf: {
      value: field.xf,
    },
    uPaintRed: {
      value: toColor(PALETTE.red.hex),
    },
    uPaintBlue: {
      value: toColor(PALETTE.blue.hex),
    },
    uPaintYellow: {
      value: toColor(PALETTE.yellow.hex),
    },
    uPaintGreen: {
      value: toColor(PALETTE.green.hex),
    },
    uFireColor: {
      value: new Color(1, 0.36, 0.08),
    },
    uCharcoal: {
      value: toColor('#1d1a18'),
    },
  };
}
const VEG_COMMON_GLSL = `
#ifndef WB_VEG_COMMON
#define WB_VEG_COMMON
uniform sampler2D uVegField;
uniform vec4 uVegFieldXf;
uniform vec3 uPaintRed;
uniform vec3 uPaintBlue;
uniform vec3 uPaintYellow;
uniform vec3 uPaintGreen;
uniform vec3 uFireColor;
uniform vec3 uCharcoal;
varying float vVegTrans;
varying float vVegGloss;
varying float vVegAO;
varying vec3 vVegWorld;

// R height, G grass density, B dryness, A canopy shade
vec4 vegField(vec2 xz) {
  return texture(uVegField, (xz - uVegFieldXf.x) * uVegFieldXf.y + uVegFieldXf.z);
}

uvec4 vegPcg4(uvec4 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v ^= v >> 16u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return v;
}
vec4 vegRand4(uvec4 v) { return vec4(vegPcg4(v)) * (1.0 / 4294967296.0); }

vec2 vegWindDir() {
  float l = length(uWindDir);
  return l > 1e-4 ? uWindDir / l : vec2(1.0, 0.0);
}

// Rolling gust waves travelling across the island with the wind (0..1).
float vegGust(vec2 xz) {
  vec2 wd = vegWindDir();
  vec2 pd = vec2(-wd.y, wd.x);
  float speed = 3.5 + uWindStrength * 6.0;
  float along = dot(xz, wd) - uTime * speed;
  float across = dot(xz, pd);
  // long fronts perpendicular to the wind + breakup
  float n1 = wbNoise2(vec2(along * 0.045, across * 0.018));
  float n2 = wbNoise2(vec2(along * 0.11, across * 0.06) + 13.7);
  float band = 0.5 + 0.5 * sin(along * 0.085 + n2 * 3.0);
  float g = n1 * 0.55 + band * band * 0.45 + (n2 - 0.5) * 0.25;
  return smoothstep(0.3, 0.85, g);
}
#endif
`;
const VEG_LIGHTING_FRAGMENT = `
#ifndef VEG_WRAP
#define VEG_WRAP 0.5
#endif
#ifndef VEG_TRANS
#define VEG_TRANS 1.2
#endif
uniform vec3 uVegTransColor;
void RE_Direct_Veg( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float ndl = dot( geometryNormal, directLight.direction );
  float wrapD = saturate( ( ndl + VEG_WRAP ) / ( 1.0 + VEG_WRAP ) );
  reflectedLight.directDiffuse += wrapD * directLight.color * BRDF_Lambert( material.diffuseColor );
  // light shining through thin leaves / blades toward the viewer
  float back = saturate( dot( -geometryViewDir, directLight.direction ) );
  float trans = ( pow( back, 3.0 ) * 0.85 + 0.15 * saturate( -ndl ) ) * vVegTrans * VEG_TRANS;
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * uVegTransColor * trans * RECIPROCAL_PI;
  // sheen / gloss (golden paint, frost)
  vec3 hv = normalize( directLight.direction + geometryViewDir );
  float spec = pow( saturate( dot( geometryNormal, hv ) ), 48.0 ) * vVegGloss;
  reflectedLight.directDiffuse += directLight.color * spec * 0.6;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Veg
`;
const VEG_AMBIENT_FRAGMENT = `
#if defined( RE_IndirectDiffuse ) && ( NUM_HEMI_LIGHTS == 0 )
  {
    // no hemisphere light in the scene: use the shared sky/ground ambient
    vec3 vegUpV = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
    float vegHemi = dot( geometryNormal, vegUpV ) * 0.5 + 0.5;
    float vegNoAmb = step( dot( ambientLightColor, vec3( 1.0 ) ), 0.001 );
    irradiance += mix( uGroundColor, uSkyColor, vegHemi ) * vegNoAmb * 1.2;
  }
#endif
`;
function injectChunk(src, chunk, code, after = true) {
  if (!code) return src;
  const include = `#include <${chunk}>`;
  return src.includes(include) ? src.replace(include, after ? `${include}\n${code}\n` : `${code}\n${include}`) : src;
}
const VEG_PARS_FRAGMENT = `#include <wb_common>\n#include <wb_paint_pars>\n#include <wb_burn_pars>\n${VEG_COMMON_GLSL}\n`;
const VEG_PARS_VERTEX = `#define fwidth(x) ((x) * 0.0)\n#define dFdx(x) ((x) * 0.0)\n#define dFdy(x) ((x) * 0.0)\n#include <wb_common>\n#include <wb_paint_pars>\n#include <wb_burn_pars>\n#undef fwidth\n#undef dFdx\n#undef dFdy\n${VEG_COMMON_GLSL}\n`;
export function patchVegMaterial(veg, material, opts) {
  const { ctx } = veg;
  const isDepth = material.isMeshDepthMaterial || material.isMeshDistanceMaterial;
  const transColor = {
    value: opts.transColor ?? toColor('#e6f07a'),
  };
  material.defines = {
    ...(material.defines ?? {}),
    ...(opts.defines ?? {}),
    ...(isDepth
      ? {
          VEG_DEPTH: 1,
        }
      : {}),
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, ctx.globals, veg.uniforms, opts.uniforms ?? {}, {
      uVegTransColor: transColor,
    });
    let vertexShader = shader.vertexShader;
    let fragmentShader = shader.fragmentShader;
    vertexShader = vertexShader.replace(
      '#include <common>',
      `#include <common>\n${VEG_PARS_VERTEX}${opts.vertexPars ?? ''}\n`,
    );
    vertexShader = vertexShader.replace(
      'void main() {',
      `void main() {
  vVegTrans = 0.5; vVegGloss = 0.0; vVegAO = 1.0;
`,
    );
    fragmentShader = fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${VEG_PARS_FRAGMENT}${opts.fragmentPars ?? ''}\n`,
    );
    if (isDepth) {
      if (opts.vertexNormal)
        vertexShader = injectChunk(
          vertexShader,
          'begin_vertex',
          `vec3 objectNormal = vec3(0.0, 1.0, 0.0);\n${opts.vertexNormal}`,
          false,
        );
    } else vertexShader = injectChunk(vertexShader, 'beginnormal_vertex', opts.vertexNormal);
    vertexShader = injectChunk(vertexShader, 'begin_vertex', opts.vertexPosition);
    vertexShader = injectChunk(
      vertexShader,
      'project_vertex',
      `{
        vec4 vegWp = vec4(transformed, 1.0);
        #ifdef USE_BATCHING
          vegWp = batchingMatrix * vegWp;
        #endif
        #ifdef USE_INSTANCING
          vegWp = instanceMatrix * vegWp;
        #endif
        vVegWorld = (modelMatrix * vegWp).xyz;
      }`,
      false,
    );
    fragmentShader = injectChunk(fragmentShader, 'map_fragment', opts.fragmentMap);
    fragmentShader = injectChunk(fragmentShader, 'color_fragment', opts.fragmentColor);
    if (!isDepth) {
      if (opts.noFaceFlip)
        fragmentShader = injectChunk(
          fragmentShader,
          'normal_fragment_begin',
          `#ifdef DOUBLE_SIDED
 normal *= faceDirection; 
#endif`,
        );
      fragmentShader = injectChunk(fragmentShader, 'emissivemap_fragment', opts.fragmentEmissive);
      if (opts.vegLighting !== false)
        fragmentShader = injectChunk(fragmentShader, 'lights_lambert_pars_fragment', VEG_LIGHTING_FRAGMENT);
      fragmentShader = injectChunk(fragmentShader, 'lights_fragment_begin', VEG_AMBIENT_FRAGMENT);
      fragmentShader = injectChunk(fragmentShader, 'lights_fragment_end', opts.fragmentPost);
    }
    shader.vertexShader = vertexShader;
    shader.fragmentShader = fragmentShader;
  };
  const cacheKey = `wb-veg-${opts.key}${isDepth ? '-depth' : ''}`;
  material.customProgramCacheKey = () => cacheKey;
}
export function makeRng(rand) {
  return {
    next: rand,
    range: (min, max) => min + (max - min) * rand(),
    pick: (list) => list[Math.floor(rand() * list.length) % list.length],
    chance: (prob) => rand() < prob,
  };
}
