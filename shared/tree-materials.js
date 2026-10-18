/**
 * Tree shaders and materials: swaying foliage cards, three bark kinds, reeds and solid plants that react to wind, paint and fire.
 */
import { DoubleSide, MeshDepthMaterial, MeshLambertMaterial } from 'three';
import { ATLAS_SIZE, createFoliageAtlas } from './foliage-atlas.js';
import { patchVegMaterial, toColor } from './veg-material.js';
const TREE_ATTRIBS_VERTEX = `
attribute vec4 aVeg;
attribute vec3 aCenter;
`;
const TREE_PARS_GLSL = `
varying vec3 vTreeEmis;
varying vec2 vBarkUv;
#ifndef VEG_SWAY
#define VEG_SWAY 0.0035
#endif
#ifndef BARK_KIND
#define BARK_KIND -1
#endif
`;
const TREE_VERTEX = `
{
  vec3 treeO = vec3(0.0);
  mat3 tim = mat3(1.0);
  #ifdef USE_INSTANCING
    treeO = instanceMatrix[3].xyz;
    tim = mat3(instanceMatrix);
  #endif
  #ifdef USE_BATCHING
    treeO = batchingMatrix[3].xyz;
    tim = mat3(batchingMatrix);
  #endif
  treeO = (modelMatrix * vec4(treeO, 1.0)).xyz;
  float ts2 = max(dot(tim[0], tim[0]), 1e-6);
  float tsc = sqrt(ts2);
  float phase = dot(treeO.xz, vec2(0.37, 0.61));
  float burnt = clamp(wbBurnt(treeO.xz), 0.0, 1.0);
  float burning = clamp(wbBurning(treeO.xz), 0.0, 1.0);
  vec3 cW = treeO + tim * aCenter;
  #if !defined(VEG_DEPTH) && (defined(USE_COLOR) || defined(USE_INSTANCING_COLOR) || defined(USE_BATCHING_COLOR))
  {
    // colour work per vertex (vitality, paint, fire) keeps the fragment stage lean
    vec4 tpaint = clamp(wbPaintSample(cW), 0.0, 1.0);
    vVegGloss = tpaint.b * 0.8 + tpaint.g * 0.4;
    vec3 c = vColor.rgb;
    #ifdef VEG_SOLID_NOISE
      c *= 0.9 + 0.2 * wbNoise2(cW.xz * 1.7 + cW.y * 0.9);
    #endif
    c = wbApplyVitality(c, cW);
    #if BARK_KIND >= 0
      c = mix(c, uPaintGreen * 0.6, tpaint.a * 0.35);
      c = mix(c, vec3(0.8, 0.9, 1.0), tpaint.g * 0.6);
      c = mix(c, uCharcoal * 0.8, burnt * 0.95);
    #else
      c = mix(c, wbSaturation(uPaintGreen * 0.85, 1.3), tpaint.a * 0.55);
      c = mix(c, vec3(0.85, 0.95, 1.05), tpaint.g * 0.7);
      c = mix(c, uPaintYellow * 1.05, tpaint.b * 0.6);
      c = mix(c, mix(uPaintRed, vec3(1.0, 0.5, 0.15), 0.4) * 0.95, tpaint.r * 0.6);
      c = mix(c, uCharcoal * (0.8 + 0.4 * aVeg.x), burnt * 0.92);
    #endif
    vColor.rgb = c;
    vTreeEmis = uFireColor * burning * (0.55 + 0.45 * sin(uTime * 8.0 + aVeg.x * 40.0)) * 1.6
      + mix(uPaintRed, vec3(1.0, 0.55, 0.15), 0.5) * tpaint.r * 0.25;
  }
  #else
    vTreeEmis = vec3(0.0);
  #endif
  vBarkUv = aVeg.zw;
  vVegTrans = 1.0;
  float hy = position.y * tsc;
  vec3 offW = vec3(0.0);
  #ifdef VEG_CARDS
    float gone = smoothstep(aVeg.x - 0.08, aVeg.x + 0.02, burnt * 0.88);
    transformed = mix(transformed, aCenter, gone);
    vec3 wp0 = treeO + tim * transformed;
    vec3 dpp = wp0 - (uPlayerPos + vec3(0.0, 0.7, 0.0));
    float pl = length(dpp);
    float pushF = (1.0 - smoothstep(0.3, 1.6, pl)) * aVeg.y;
    offW += (dpp / max(pl, 1e-3)) * pushF * 0.5;
    float fl = sin(uTime * (2.6 + aVeg.x * 3.5) + aVeg.x * 40.0 + phase) * (0.02 + 0.07 * uWindStrength) * aVeg.y;
    offW += normalize(tim * normal) * fl;
  #endif
  #ifdef VEG_SHRINK
    transformed.xz *= mix(1.0, 0.3, burnt * aVeg.y);
  #endif
  float gust = vegGust(treeO.xz);
  float k = hy * hy * VEG_SWAY;
  float osc = sin(uTime * 1.05 + phase) * 0.6 + sin(uTime * 2.2 + phase * 1.7) * 0.4;
  vec2 wd = vegWindDir();
  vec2 off = wd * k * (uWindStrength * (0.45 + gust * 1.1) + osc * (0.1 + 0.3 * uWindStrength));
  off += vec2(-wd.y, wd.x) * k * sin(uTime * 0.83 + phase * 2.1) * (0.05 + 0.12 * uWindStrength);
  #ifdef VEG_CARDS
    off += wd * aVeg.y * gust * uWindStrength * 0.1 * sin(uTime * 4.5 + aVeg.x * 20.0);
  #endif
  offW += vec3(off.x, 0.0, off.y);
  offW *= 1.0 - burnt * 0.5;
  transformed += (transpose(tim) * offW) / ts2;
}
`;
const CARD_ALPHA_FRAGMENT = `
#ifdef USE_MAP
{
  vec2 vegDx = dFdx(vMapUv * ${ATLAS_SIZE.toFixed(1)});
  vec2 vegDy = dFdy(vMapUv * ${ATLAS_SIZE.toFixed(1)});
  float vegMip = max(0.0, 0.5 * log2(max(dot(vegDx, vegDx), dot(vegDy, vegDy))));
  diffuseColor.a *= 1.0 + min(vegMip, 3.0) * 0.3;
  #ifndef VEG_DEPTH
    // cards seen edge-on smear the texture into streaks: thin them out
    vec3 vegFaceN = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
    float vegEdge = abs(dot(vegFaceN, normalize(vViewPosition)));
    diffuseColor.a *= smoothstep(0.1, 0.5, vegEdge);
  #endif
}
#endif
`;
const TREE_EMISSIVE_FRAGMENT = `
totalEmissiveRadiance += vTreeEmis;
`;
const TREE_RIM_FRAGMENT = `
{
  vec3 vegVd = normalize(vViewPosition);
  float rim = pow(1.0 - saturate(dot(normal, vegVd)), 2.5);
  reflectedLight.indirectDiffuse += diffuseColor.rgb * (uSkyColor * 0.35 + uSunColor * 0.35) * rim * VEG_RIM;
}
`;
const BARK_COLOR_FRAGMENT = `
{
  vec3 c = diffuseColor.rgb;
  vec2 bu = vBarkUv;
  #if BARK_KIND == 0
    float st = wbNoise2(vec2(bu.x * 16.0, bu.y * 1.1));
    float st2 = wbNoise2(vec2(bu.x * 38.0, bu.y * 2.6) + 7.0);
    c *= 0.7 + 0.42 * smoothstep(0.2, 0.8, st) * (0.75 + 0.25 * st2);
  #elif BARK_KIND == 1
    float d = wbNoise2(vec2(bu.x * 5.0, bu.y * 6.0));
    float dash = smoothstep(0.66, 0.72, d) * smoothstep(0.35, 0.6, wbNoise2(vec2(bu.x * 3.0 + 5.0, bu.y * 20.0)));
    c = mix(c, vec3(0.05, 0.045, 0.04), dash * 0.9);
    c *= 0.9 + 0.12 * wbNoise2(vec2(bu.x * 30.0, bu.y * 8.0));
    c = mix(c * vec3(0.35, 0.3, 0.27), c, smoothstep(0.1, 1.0, bu.y));
  #else
    float ring = smoothstep(0.7, 0.95, fract(bu.y * 2.4));
    c *= 1.0 - ring * 0.32;
    c *= 0.85 + 0.15 * wbNoise2(vec2(bu.x * 12.0, bu.y * 4.0));
  #endif
  diffuseColor.rgb = c;
}
`;
const BARK_EMISSIVE_FRAGMENT = `
{
  float crack = smoothstep(0.55, 0.72, wbNoise2(vBarkUv * vec2(9.0, 2.5) + uTime * 0.2));
  totalEmissiveRadiance += vTreeEmis * crack * 1.3;
}
`;
export function createTreeMaterials(veg) {
  const atlas = createFoliageAtlas();
  const materials = [];
  const makeFoliage = (key, sway, low) => {
    const material = new MeshLambertMaterial({
      map: atlas,
      alphaTest: 0.5,
      side: DoubleSide,
      vertexColors: true,
    });
    patchVegMaterial(veg, material, {
      key,
      defines: {
        VEG_CARDS: 1,
        VEG_SWAY: sway,
        VEG_WRAP: '0.55',
        VEG_TRANS: low ? '1.0' : '1.3',
        VEG_RIM: '0.9',
      },
      vertexPars: TREE_ATTRIBS_VERTEX + TREE_PARS_GLSL,
      fragmentPars: TREE_PARS_GLSL,
      vertexPosition: TREE_VERTEX,
      fragmentMap: CARD_ALPHA_FRAGMENT,
      fragmentEmissive: TREE_EMISSIVE_FRAGMENT,
      fragmentPost: TREE_RIM_FRAGMENT,
      noFaceFlip: true,
      transColor: toColor('#f4f08a'),
    });
    const depthMaterial = new MeshDepthMaterial({
      map: atlas,
      alphaTest: 0.5,
      side: DoubleSide,
    });
    patchVegMaterial(veg, depthMaterial, {
      key,
      defines: {
        VEG_CARDS: 1,
        VEG_SWAY: sway,
      },
      vertexPars: TREE_ATTRIBS_VERTEX + TREE_PARS_GLSL,
      fragmentPars: TREE_PARS_GLSL,
      vertexPosition: TREE_VERTEX,
      fragmentMap: CARD_ALPHA_FRAGMENT,
    });
    materials.push(material, depthMaterial);
    return [material, depthMaterial];
  };
  const [foliage, foliageDepth] = makeFoliage('foliage', '0.0035', false);
  const [lowFoliage, lowFoliageDepth] = makeFoliage('foliage-low', '0.03', true);
  const makeBark = (kind) => {
    const material = new MeshLambertMaterial({
      vertexColors: true,
    });
    patchVegMaterial(veg, material, {
      key: `bark${kind}`,
      defines: {
        BARK_KIND: kind,
        VEG_WRAP: '0.35',
        VEG_TRANS: '0.0',
        VEG_RIM: '0.4',
      },
      vertexPars: TREE_ATTRIBS_VERTEX + TREE_PARS_GLSL,
      fragmentPars: TREE_PARS_GLSL,
      vertexPosition: TREE_VERTEX,
      fragmentColor: BARK_COLOR_FRAGMENT,
      fragmentEmissive: BARK_EMISSIVE_FRAGMENT,
      fragmentPost: TREE_RIM_FRAGMENT,
    });
    materials.push(material);
    return material;
  };
  const bark = {
    brown: makeBark(0),
    birch: makeBark(1),
    palm: makeBark(2),
  };
  const barkDepth = new MeshDepthMaterial();
  patchVegMaterial(veg, barkDepth, {
    key: 'bark',
    vertexPars: TREE_ATTRIBS_VERTEX + TREE_PARS_GLSL,
    fragmentPars: TREE_PARS_GLSL,
    vertexPosition: TREE_VERTEX,
  });
  const reed = new MeshLambertMaterial({
    vertexColors: true,
    side: DoubleSide,
  });
  patchVegMaterial(veg, reed, {
    key: 'reed',
    defines: {
      VEG_SWAY: '0.09',
      VEG_WRAP: '0.6',
      VEG_TRANS: '1.0',
      VEG_RIM: '0.6',
    },
    vertexPars: TREE_ATTRIBS_VERTEX + TREE_PARS_GLSL,
    fragmentPars: TREE_PARS_GLSL,
    vertexPosition: TREE_VERTEX,
    fragmentEmissive: TREE_EMISSIVE_FRAGMENT,
    fragmentPost: TREE_RIM_FRAGMENT,
    noFaceFlip: true,
    transColor: toColor('#e8ec9a'),
  });
  materials.push(reed);
  const solid = new MeshLambertMaterial({
    vertexColors: true,
  });
  patchVegMaterial(veg, solid, {
    key: 'solid',
    defines: {
      VEG_SHRINK: 1,
      VEG_SOLID_NOISE: 1,
      VEG_WRAP: '0.6',
      VEG_TRANS: '0.8',
      VEG_RIM: '1.0',
    },
    vertexPars: TREE_ATTRIBS_VERTEX + TREE_PARS_GLSL,
    fragmentPars: TREE_PARS_GLSL,
    vertexPosition: TREE_VERTEX,
    fragmentEmissive: TREE_EMISSIVE_FRAGMENT,
    fragmentPost: TREE_RIM_FRAGMENT,
    transColor: toColor('#b8d68a'),
  });
  const solidDepth = new MeshDepthMaterial();
  patchVegMaterial(veg, solidDepth, {
    key: 'solid',
    defines: {
      VEG_SHRINK: 1,
    },
    vertexPars: TREE_ATTRIBS_VERTEX + TREE_PARS_GLSL,
    fragmentPars: TREE_PARS_GLSL,
    vertexPosition: TREE_VERTEX,
  });
  materials.push(barkDepth, solid, solidDepth);
  return {
    atlas,
    foliage,
    foliageDepth,
    lowFoliage,
    lowFoliageDepth,
    bark,
    barkDepth,
    solid,
    reed,
    solidDepth,
    dispose() {
      atlas.dispose();
      for (const mat of materials) mat.dispose();
    },
  };
}
