/**
 * Toon shading for the hero: a banded light ramp, sun and sky rim light, paint tint, the worn scarf's and hood's colours and hit flash, and a dithered fade when the camera comes close, patched into standard materials. Also builds the body and inverted-hull outline materials.
 */
import { BackSide, Color, DoubleSide, FrontSide, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { HERO_COLORS } from './body-mesh.js';
const TOON_LIGHTING_GLSL = `
float wbToonRamp(float ndl) {
  float band = smoothstep(-0.04, 0.2, ndl);
  float wrap = clamp(ndl * 0.5 + 0.5, 0.0, 1.0);
  return mix(band, wrap * band, 0.25);
}
void RE_Direct_WBToon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  float ndl = dot( geometryNormal, directLight.direction );
  vec3 irradiance = wbToonRamp( ndl ) * directLight.color;
  reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
  vec3 H = normalize( directLight.direction + geometryViewDir );
  float nh = max( dot( geometryNormal, H ), 0.0 );
  float spec = smoothstep( 0.965, 0.995, nh ) * ( 1.0 - material.roughness ) * 0.06;
  reflectedLight.directSpecular += irradiance * spec;
}
#undef RE_Direct
#define RE_Direct RE_Direct_WBToon
`;
export const heroFade = {
  value: 1,
};
export const FADE_DITHER_GLSL = `
uniform float uWbFade;
float wbBayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  // 4x4 Bayer matrix, row-major
  if (i < 0.5) return 0.0; if (i < 1.5) return 8.0; if (i < 2.5) return 2.0; if (i < 3.5) return 10.0;
  if (i < 4.5) return 12.0; if (i < 5.5) return 4.0; if (i < 6.5) return 14.0; if (i < 7.5) return 6.0;
  if (i < 8.5) return 3.0; if (i < 9.5) return 11.0; if (i < 10.5) return 1.0; if (i < 11.5) return 9.0;
  if (i < 12.5) return 15.0; if (i < 13.5) return 7.0; if (i < 14.5) return 13.0; return 5.0;
}
`;
export const FADE_DISCARD_GLSL = `
if ( uWbFade < 0.999 && uWbFade * 16.0 <= wbBayer4( gl_FragCoord.xy ) + 0.5 ) discard;
`;
export function patchToonMaterial(material, ctx, opts) {
  const globals = ctx.globals;
  const rim = (opts.rim ?? 1).toFixed(3);
  const hasTint = !!opts.tint;
  const hasScarf = !!opts.scarf;
  const hasHood = !!opts.hood;
  // another player's hero (character/double.js) fades on its own, not when the camera nears yours
  const fade = ctx.heroFade ?? heroFade;
  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    prevCompile?.call(material, shader, renderer);
    if (opts.tint) shader.uniforms.uTint = opts.tint;
    if (hasScarf) {
      shader.uniforms.uScarf = opts.scarf.base;
      shader.uniforms.uScarfDark = opts.scarf.dark;
    }
    if (hasHood) {
      shader.uniforms.uHood = opts.hood.base;
      shader.uniforms.uHoodLight = opts.hood.light;
      shader.uniforms.uHoodLining = opts.hood.lining;
    }
    shader.uniforms.uWbFade = fade;
    shader.uniforms.uTintGlow = opts.tintGlow ?? {
      value: 0,
    };
    shader.uniforms.uWbFlash = opts.flashColor ?? {
      value: new Color(1, 1, 1),
    };
    shader.uniforms.uWbFlashAmt = opts.flashAmt ?? {
      value: 0,
    };
    for (const key of ['uSunDir', 'uSunColor', 'uSkyColor']) shader.uniforms[key] = globals[key];
    if (hasTint)
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute float aTint;
varying float vTint;`,
        )
        .replace(
          '#include <color_vertex>',
          `#include <color_vertex>
vTint = aTint;`,
        );
    if (hasScarf)
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute float aScarf;
varying float vScarf;`,
        )
        .replace(
          '#include <color_vertex>',
          `#include <color_vertex>
vScarf = aScarf;`,
        );
    if (hasHood)
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
attribute vec3 aHood;
varying vec3 vHood;`,
        )
        .replace(
          '#include <color_vertex>',
          `#include <color_vertex>
vHood = aHood;`,
        );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
` +
          FADE_DITHER_GLSL +
          `uniform float uTintGlow;
uniform vec3 uWbFlash;
uniform float uWbFlashAmt;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
` +
          (hasTint
            ? `uniform vec3 uTint;
varying float vTint;
`
            : '') +
          (hasScarf
            ? `uniform vec3 uScarf;
uniform vec3 uScarfDark;
varying float vScarf;
`
            : '') +
          (hasHood
            ? `uniform vec3 uHood;
uniform vec3 uHoodLight;
uniform vec3 uHoodLining;
varying vec3 vHood;
`
            : ''),
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
` + FADE_DISCARD_GLSL,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
` +
          (hasScarf ? 'if (vScarf > 0.5) diffuseColor.rgb = mix(uScarf, uScarfDark, clamp(vScarf - 1.0, 0.0, 1.0));' : '') +
          (hasHood
            ? '{ float wbHoodW = vHood.x + vHood.y + vHood.z; if (wbHoodW > 0.5) diffuseColor.rgb = (uHood * vHood.x + uHoodLight * vHood.y + uHoodLining * vHood.z) / wbHoodW; }'
            : '') +
          (hasTint ? 'diffuseColor.rgb = mix(diffuseColor.rgb, uTint, vTint);' : ''),
      )
      .replace(
        '#include <lights_physical_pars_fragment>',
        `#include <lights_physical_pars_fragment>
` + TOON_LIGHTING_GLSL,
      )
      .replace(
        '#include <opaque_fragment>',
        `
        {
          vec3 wbV = normalize( vViewPosition );
          vec3 wbN = normalize( normal );
          float wbFres = pow( 1.0 - clamp( abs( dot( wbN, wbV ) ), 0.0, 1.0 ), 3.0 );
          vec3 wbSunV = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
          float wbSunSide = clamp( dot( wbN, wbSunV ) * 0.7 + 0.45, 0.0, 1.0 );
          float wbUp = clamp( dot( wbN, normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz ) ) * 0.5 + 0.5, 0.0, 1.0 );
          vec3 wbRim = ( uSunColor * 0.55 * wbSunSide + uSkyColor * 0.3 * wbUp ) * wbFres * ${rim};
          outgoingLight += wbRim * diffuseColor.rgb * 1.6 + wbRim * 0.12;
          ${hasTint ? 'outgoingLight += uTint * vTint * ( 0.12 + uTintGlow );' : ''}
          ${opts.translucency ? `outgoingLight += diffuseColor.rgb * uSunColor * ( clamp( -dot( wbN, wbSunV ), 0.0, 1.0 ) * ${opts.translucency.toFixed(3)} + ${(opts.translucency * 0.25).toFixed(3)} );` : ''}
          outgoingLight = mix( outgoingLight, uWbFlash * ( 0.75 + 0.5 * wbFres ), uWbFlashAmt );
        }
        #include <opaque_fragment>`,
      );
  };
  const prevKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|${opts.key}`;
}
export function createHeroMaterials(ctx) {
  const tint = {
    value: new Color(1, 0.4, 0.3),
  };
  const tintGlow = {
    value: 0,
  };
  const outlineWidth = {
    value: 0.012,
  };
  const flashColor = {
    value: new Color(1, 1, 1),
  };
  const flashAmt = {
    value: 0,
  };
  // the scarf's wrap and knot (and the classic hood's bobble), in whatever scarf is worn
  const scarf = {
    base: {
      value: new Color(HERO_COLORS.scarf),
    },
    dark: {
      value: new Color(HERO_COLORS.scarfDark),
    },
  };
  // the classic hood and its shoulder cape, in whatever hood is worn
  const hood = {
    base: {
      value: new Color(HERO_COLORS.hood),
    },
    light: {
      value: new Color(HERO_COLORS.hoodLight),
    },
    lining: {
      value: new Color(HERO_COLORS.hoodInner),
    },
  };
  const bodyMat = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0,
    side: DoubleSide,
    shadowSide: FrontSide,
  });
  bodyMat.name = 'hero-body';
  patchToonMaterial(bodyMat, ctx, {
    key: 'wb-hero-toon-v6',
    tint,
    tintGlow,
    flashColor,
    flashAmt,
    scarf,
    hood,
  });
  const outlineMat = new MeshBasicMaterial({
    color: 0x5a463c,
    side: BackSide,
    vertexColors: true,
  });
  outlineMat.name = 'hero-outline';
  const fade = ctx.heroFade ?? heroFade;
  outlineMat.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineWidth = outlineWidth;
    shader.uniforms.uTint = tint;
    shader.uniforms.uScarf = scarf.base;
    shader.uniforms.uScarfDark = scarf.dark;
    shader.uniforms.uHood = hood.base;
    shader.uniforms.uHoodLight = hood.light;
    shader.uniforms.uHoodLining = hood.lining;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aOutline;
attribute float aTint;
attribute float aScarf;
attribute vec3 aHood;
uniform float uOutlineWidth;
uniform vec3 uTint;
uniform vec3 uScarf;
uniform vec3 uScarfDark;
uniform vec3 uHood;
uniform vec3 uHoodLight;
uniform vec3 uHoodLining;`,
      )
      .replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>
transformed += normalize( objectNormal ) * uOutlineWidth * aOutline;
if ( aOutline < 0.01 ) transformed *= 0.0;`,
      )
      .replace(
        '#include <color_vertex>',
        `#include <color_vertex>
#ifdef USE_COLOR
if ( aScarf > 0.5 ) vColor.rgb = mix( uScarf, uScarfDark, clamp( aScarf - 1.0, 0.0, 1.0 ) );
float wbHoodW = aHood.x + aHood.y + aHood.z;
if ( wbHoodW > 0.5 ) vColor.rgb = ( uHood * aHood.x + uHoodLight * aHood.y + uHoodLining * aHood.z ) / wbHoodW;
vColor.rgb = mix( vColor.rgb, uTint, aTint ) * 0.32;
#endif`,
      );
    shader.uniforms.uWbFade = fade;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
` + FADE_DITHER_GLSL,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
` + FADE_DISCARD_GLSL,
      );
  };
  outlineMat.customProgramCacheKey = () => 'wb-hero-outline-v4';
  return {
    body: bodyMat,
    outline: outlineMat,
    tint,
    outlineWidth,
    tintGlow,
    flashColor,
    flashAmt,
    scarf,
    hood,
  };
}
