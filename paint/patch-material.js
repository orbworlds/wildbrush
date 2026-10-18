/**
 * patchMaterial: hooks a three.js standard, physical, Lambert, Phong or toon material's onBeforeCompile so its fragment shader gets the world position and applies paint and vitality from wb_paint_pars.
 */
const PATCH_PARS_VERTEX = `
varying vec3 vWbWorldPos;
`;
const PATCH_WORLDPOS_VERTEX = `
{
  vec4 wbWP = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    wbWP = batchingMatrix * wbWP;
  #endif
  #ifdef USE_INSTANCING
    wbWP = instanceMatrix * wbWP;
  #endif
  wbWP = modelMatrix * wbWP;
  vWbWorldPos = wbWP.xyz;
}
`;
const PATCH_PARS_FRAGMENT = `
varying vec3 vWbWorldPos;
#include <wb_paint_pars>
`;
function patchFragmentGlsl(paint, vitality) {
  return `
{
  vec3 wbWN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  ${
    vitality
      ? `
  diffuseColor.rgb = wbApplyVitalityRaw( diffuseColor.rgb, vWbWorldPos );
  totalEmissiveRadiance += wbVitalityGlow( vWbWorldPos ) * ( 0.25 + diffuseColor.rgb );`
      : ''
  }
  ${
    paint
      ? `
  #if defined( STANDARD )
    float wbRough = roughnessFactor;
  #else
    float wbRough = 0.85;
  #endif
  #ifdef USE_ENVMAP
    float wbEnv = 0.35;
  #else
    float wbEnv = 1.0;
  #endif
  vec3 wbNW = wbWN;
  float wbMask = wbPaintSurfaceN( diffuseColor.rgb, wbRough, totalEmissiveRadiance, wbNW, vWbWorldPos, wbWN, wbEnv );
  if ( wbMask > 0.0 ) {
    normal = normalize( ( viewMatrix * vec4( wbNW, 0.0 ) ).xyz );
    #if defined( STANDARD )
      roughnessFactor = wbRough;
      metalnessFactor = mix( metalnessFactor, 0.0, wbMask );
    #endif
    #if defined( PHONG )
      specularStrength = mix( specularStrength, 1.0, wbMask );
    #endif
  }`
      : ''
  }
}
`;
}
const PATCHABLE_TYPES = [
  'MeshStandardMaterial',
  'MeshPhysicalMaterial',
  'MeshLambertMaterial',
  'MeshPhongMaterial',
  'MeshToonMaterial',
];
export function patchMaterial(ctx, material, options = {}) {
  try {
    if (!material) return;
    const paint = options.paint ?? true;
    const vitality = options.vitality ?? true;
    if (!paint && !vitality) return;
    const userData = material.userData;
    if (userData.wbPaintPatched) return;
    if (!PATCHABLE_TYPES.includes(material.type)) {
      console.warn(`[paint] patchMaterial: unsupported material type ${material.type}`);
      return;
    }
    userData.wbPaintPatched = true;
    const prevOnBeforeCompile = material.onBeforeCompile;
    const prevCacheKey = material.customProgramCacheKey;
    const globals = ctx.globals;
    material.onBeforeCompile = function (shader, renderer) {
      try {
        prevOnBeforeCompile.call(this, shader, renderer);
      } catch (err) {
        console.warn('[paint] chained onBeforeCompile threw', err);
      }
      for (const key of Object.keys(globals)) shader.uniforms[key] = globals[key];
      let vertexShader = shader.vertexShader;
      let fragmentShader = shader.fragmentShader;
      if (
        vertexShader.includes('#include <worldpos_vertex>') &&
        fragmentShader.includes('#include <emissivemap_fragment>')
      ) {
        vertexShader = vertexShader.replace('#include <common>', `#include <common>\n${PATCH_PARS_VERTEX}`);
        vertexShader = vertexShader.replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>\n${PATCH_WORLDPOS_VERTEX}`,
        );
        fragmentShader = fragmentShader.replace('#include <common>', `#include <common>\n${PATCH_PARS_FRAGMENT}`);
        fragmentShader = fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>\n${patchFragmentGlsl(paint, vitality)}`,
        );
        shader.vertexShader = vertexShader;
        shader.fragmentShader = fragmentShader;
      }
    };
    material.customProgramCacheKey = function () {
      let baseKey = '';
      try {
        baseKey = prevCacheKey.call(this);
      } catch {}
      return `${baseKey}|wbpaint:${+!!paint}${+!!vitality}`;
    };
    material.needsUpdate = true;
  } catch (err) {
    console.warn('[paint] patchMaterial failed', err);
  }
}
