/**
 * Height fog: replaces three.js fog shader chunks with distance haze, analytic height fog and sun-scattered fog colour, and injects the shared fog uniforms into every material.
 */
import { ShaderChunk, ShaderLib, UniformsLib } from 'three';
const FOG_PARS_VERTEX = `
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vWbFogRel;
#endif
`;
const FOG_VERTEX = `
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	// camera -> vertex offset in WORLD space (inverse view rotation)
	vWbFogRel = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;
#endif
`;
export const FOG_SCATTER_GLSL = `
vec3 wbFogScatterColor( vec3 baseColor, vec3 dir, vec4 sunInfo, vec3 sunColor ) {
	float mu = max( dot( dir, sunInfo.xyz ), 0.0 );
	float s = pow( mu, 5.0 ) * 0.55 + pow( mu, 40.0 ) * 0.7;
	return baseColor + sunColor * ( s * sunInfo.w );
}
`;
const FOG_PARS_FRAGMENT = `
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vWbFogRel;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
	uniform vec4 wbFogParams;
	uniform vec4 wbFogSun;
	uniform vec3 wbFogSunColor;
	#ifndef WB_FOG_SCATTER
	#define WB_FOG_SCATTER
	${FOG_SCATTER_GLSL}
	#endif
#endif
`;
const FOG_FRAGMENT = `
#ifdef USE_FOG
	float fogFactor;
	vec3 wbFogCol = fogColor;
	if ( wbFogParams.x > 0.0 || wbFogParams.y > 0.0 ) {
		float wbDist = length( vWbFogRel );
		vec3 wbDir = vWbFogRel / max( wbDist, 1e-4 );
		float wbK = max( wbFogParams.z, 1e-4 );
		// average height-fog density along the ray (analytic, overflow-safe)
		float wbHc = clamp( cameraPosition.y - wbFogParams.w, -30.0, 400.0 );
		float wbHf = clamp( wbHc + vWbFogRel.y, -30.0, 400.0 );
		float wbEc = exp( - wbK * wbHc );
		float wbEf = exp( - wbK * wbHf );
		float wbDh = ( wbHf - wbHc ) * wbK;
		float wbAvg = abs( wbDh ) > 1e-3 ? ( wbEc - wbEf ) / wbDh : wbEc;
		// distance haze grows quadratically: land stays readable at mid range (150-250m) and
		// only melts into the sky toward the horizon
		float wbD = wbFogParams.x * wbDist;
		float wbTau = wbD * wbD + wbFogParams.y * wbAvg * wbDist;
		fogFactor = 1.0 - exp( - max( wbTau, 0.0 ) );
		wbFogCol = wbFogScatterColor( fogColor, wbDir, wbFogSun, wbFogSunColor );
	} else {
		#ifdef FOG_EXP2
			fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
		#else
			fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
		#endif
	}
	gl_FragColor.rgb = mix( gl_FragColor.rgb, wbFogCol, fogFactor );
#endif
`;
export function installHeightFog(ctx) {
  const fog = {
    params: new Float32Array([0.0016, 0.004, 0.08, 0]),
    sun: new Float32Array([0.4, 0.6, 0.4, 0.5]),
    sunColor: new Float32Array([1, 0.8, 0.55]),
  };
  const chunks = ShaderChunk;
  chunks.fog_pars_vertex = FOG_PARS_VERTEX;
  chunks.fog_vertex = FOG_VERTEX;
  chunks.fog_pars_fragment = FOG_PARS_FRAGMENT;
  chunks.fog_fragment = FOG_FRAGMENT;
  const addFogUniforms = (uniforms) => {
    uniforms.wbFogParams = {
      value: fog.params,
    };
    uniforms.wbFogSun = {
      value: fog.sun,
    };
    uniforms.wbFogSunColor = {
      value: fog.sunColor,
    };
  };
  try {
    addFogUniforms(UniformsLib.fog);
    for (const key of Object.keys(ShaderLib)) {
      const shader = ShaderLib[key];
      if (shader?.uniforms && 'fogColor' in shader.uniforms) addFogUniforms(shader.uniforms);
    }
    addFogUniforms(ctx.globals);
  } catch (err) {
    console.warn('[environment] fog uniform injection failed (falling back to linear fog)', err);
  }
  return fog;
}
