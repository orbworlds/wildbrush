/**
 * The sky dome: zenith-to-horizon gradient, twilight belt, sun halo and disc, stars, moon, overhead cloud puffs and the horizon cumulus band, updated every frame from the time-of-day sky and the wind.
 */
import { BackSide, Color, MathUtils, Mesh, ShaderMaterial, SphereGeometry, Vector2, Vector3 } from 'three';
import { FOG_SCATTER_GLSL } from './height-fog.js';
const SKY_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 wp = vec4( position * 1000.0 + cameraPosition, 1.0 );
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w; // far plane
}
`;
const SKY_FRAGMENT = `
#include <wb_common>
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSkySun;
uniform vec3 uSkyMoon;
uniform vec3 uLightDir;
uniform vec3 uSunDisc;
uniform vec3 uGlow;
uniform float uGlowI;
uniform vec3 uBelt;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uCloudCover;
uniform float uBandCover;
uniform vec2 uCloudOffset;
uniform vec2 uCloudOffset2;
uniform float uBandShift;
uniform float uStars;
uniform float uMoonI;
uniform float uDay;
uniform sampler2D uNoise;
uniform vec4 wbFogSun;
uniform vec3 wbFogSunColor;
varying vec3 vDir;

${FOG_SCATTER_GLSL}

#define TAU 6.28318530718

// Overhead puffs: planar projection field (higher = denser)
float puffField( vec2 p ) {
  vec4 w = texture2D( uNoise, p * 0.09 + uCloudOffset * 0.2 );
  vec2 q = p + ( w.br - 0.5 ) * 0.35;
  float base = texture2D( uNoise, q * 0.12 ).r;
  float bill = texture2D( uNoise, q * 0.33 + 0.13 ).g;
  float det = texture2D( uNoise, q * 1.1 + 0.61 ).a;
  return bill * 0.8 + ( base - 0.5 ) * 0.9 + ( det - 0.5 ) * 0.2;
}

// Horizon cumulus band. Returns rgb + coverage.
vec4 bandClouds( vec3 d, vec3 horizonCol, float mup ) {
  float y = d.y;
  float az = atan( d.z, d.x );
  float u = az / TAU + 0.5 + uBandShift;
  // silhouette: tall towers where two broad noises agree
  float p1 = texture2D( uNoise, vec2( u * 2.0, 0.17 ) ).r;
  float p2 = texture2D( uNoise, vec2( u * 5.0, 0.53 ) ).r;
  float p3 = texture2D( uNoise, vec2( u * 11.0, 0.81 ) ).b;
  float tall = max( p1 * 0.75 + p2 * 0.5 + uBandCover - 0.62, 0.0 );
  float top = 0.01 + pow( tall, 1.25 ) * 1.0 + ( p3 - 0.5 ) * 0.02;
  if ( y > top + 0.05 ) return vec4( 0.0 );
  // billows, isotropic in angle (u*TAU ~ radians)
  float k1 = 18.0;
  float k2 = 45.0;
  float b1 = texture2D( uNoise, vec2( u * k1, y * k1 / TAU + 0.31 ) ).g;
  float b2 = texture2D( uNoise, vec2( u * k2, y * k2 / TAU + 0.77 ) ).a;
  float edge = top + ( b1 - 0.62 ) * 0.07 + ( b2 - 0.55 ) * 0.022 - y;
  float mask = smoothstep( 0.0, 0.0035, edge );
  if ( mask <= 0.0 ) return vec4( 0.0 );

  // shading: tops & sun-facing billows lit, bellies cool
  float h01 = clamp( y / max( top, 0.012 ), 0.0, 1.0 );
  float lit = mix( 0.3, 1.0, smoothstep( 0.05, 0.95, h01 ) );
  // billow self-shadow: sample the billow field toward the light (in angle space)
  float lAz = atan( uLightDir.z, uLightDir.x );
  float dAz = sin( lAz - az ); // which way the light lies around the horizon
  float bL = texture2D( uNoise, vec2( u * k1 + dAz * 0.12, y * k1 / TAU + 0.31 + 0.08 * max( uLightDir.y, 0.1 ) ) ).g;
  lit *= clamp( 0.85 + ( b1 - bL ) * 2.5, 0.45, 1.15 );
  // looking toward the light the bodies are backlit (darker), away they're front-lit
  vec2 hd = normalize( d.xz + 1e-5 );
  vec2 hl = normalize( uLightDir.xz + 1e-5 );
  float toward = dot( hd, hl );
  lit *= mix( 1.08, 0.62, smoothstep( -0.2, 1.0, toward ) );
  // soft painterly banding
  lit = mix( lit, floor( lit * 3.0 + 0.5 ) / 3.0, 0.22 );
  vec3 col = mix( uCloudShade, uCloudLit, clamp( lit, 0.0, 1.2 ) );
  // glowing rims on thin edges near the sun
  float thin = 1.0 - smoothstep( 0.0, 0.03, edge );
  col += uGlow * uGlowI * thin * ( pow( mup, 5.0 ) * 1.4 + pow( mup, 36.0 ) * 3.5 ) * uDay;
  // far away: bellies sink into the haze
  col = mix( horizonCol, col, 0.35 + 0.5 * smoothstep( 0.0, 0.14, y ) );
  return vec4( col, mask * smoothstep( -0.015, 0.006, y ) );
}

void main() {
  vec3 d = normalize( vDir );
  float y = d.y;
  float h = max( y, 0.0 );

  // ── gradient: hazy horizon band into a deep zenith
  vec3 horizonCol = wbFogScatterColor( uHorizon, d, wbFogSun, wbFogSunColor );
  float t = pow( h, 0.5 );
  t = t * t * ( 3.0 - 2.0 * t );
  vec3 col = mix( horizonCol, uZenith, t );
  float mu = dot( d, uSkySun );
  float mup = max( mu, 0.0 );
  // twilight "belt": pink band opposite the sun
  float anti = max( -dot( normalize( d.xz + 1e-5 ), normalize( uSkySun.xz + 1e-5 ) ), 0.0 );
  col += uBelt * ( 0.35 + 0.65 * anti * anti ) * exp( -h * 7.0 ) * smoothstep( -0.02, 0.03, y );
  // below the horizon: match the fog color (distant sea melts in)
  if ( y < 0.0 ) col = horizonCol * mix( 1.0, 0.92, smoothstep( 0.0, -0.4, y ) );

  // ── sun halo
  col += uGlow * uGlowI * ( pow( mup, 900.0 ) * 1.2 + pow( mup, 90.0 ) * 0.35 + pow( mup, 10.0 ) * 0.12 );

  // ── stars
  float starVis = uStars * smoothstep( -0.02, 0.2, y );
  if ( starVis > 0.001 ) {
    vec3 space = vec3( 0.0 );
    vec3 sp = d * 260.0;
    vec3 id = floor( sp );
    vec3 f = fract( sp ) - 0.5;
    float hs = wbHash13( id );
    if ( hs > 0.955 ) {
      vec3 off = ( vec3( wbHash13( id + 1.7 ), wbHash13( id + 3.1 ), wbHash13( id + 5.3 ) ) - 0.5 ) * 0.5;
      float r = length( f - off );
      float b = ( hs - 0.955 ) / 0.045;
      float tw = 0.65 + 0.35 * sin( uTime * ( 1.5 + b * 3.0 ) + hs * 91.0 );
      vec3 tint = mix( vec3( 0.75, 0.85, 1.0 ), vec3( 1.0, 0.9, 0.75 ), wbHash13( id + 9.0 ) );
      space += tint * smoothstep( 0.24, 0.0, r ) * ( 0.6 + b * b * 5.0 ) * tw;
    }
    float band = exp( -pow( dot( d, normalize( vec3( 0.35, 0.25, -0.9 ) ) ) * 3.2, 2.0 ) );
    float mw = texture2D( uNoise, d.xz / ( y + 0.6 ) * 0.6 ).b;
    space += vec3( 0.28, 0.32, 0.5 ) * band * smoothstep( 0.35, 0.8, mw ) * 0.22;
    col += space * starVis;
  }

  // ── moon
  float mm = dot( d, uSkyMoon );
  float moonVis = uMoonI * smoothstep( -0.03, 0.04, uSkyMoon.y );
  if ( moonVis > 0.001 ) {
    float moonR = 0.0335; // ~1.9 deg
    float cr = cos( moonR );
    float disc = smoothstep( cr - 0.00004, cr + 0.00003, mm );
    vec3 up = abs( uSkyMoon.y ) > 0.95 ? vec3( 1.0, 0.0, 0.0 ) : vec3( 0.0, 1.0, 0.0 );
    vec3 mx = normalize( cross( up, uSkyMoon ) );
    vec3 my = cross( uSkyMoon, mx );
    vec2 mp = vec2( dot( d, mx ), dot( d, my ) ) / moonR;
    float maria = texture2D( uNoise, mp * 0.22 + 0.3 ).r;
    float crater = texture2D( uNoise, mp * 0.5 + 0.1 ).a;
    float lum = 1.0 - smoothstep( 0.45, 0.75, maria ) * 0.28 - smoothstep( 0.55, 0.9, crater ) * 0.12;
    lum *= 0.55 + 0.45 * smoothstep( -0.9, 0.4, mp.x + mp.y * 0.2 );
    vec3 moonCol = vec3( 0.95, 0.96, 1.0 ) * lum * 2.2;
    float halo = pow( max( mm, 0.0 ), 1200.0 ) * 0.35 + pow( max( mm, 0.0 ), 60.0 ) * 0.06;
    col = mix( col, moonCol, disc * moonVis );
    col += vec3( 0.55, 0.65, 0.95 ) * halo * moonVis;
  }

  // ── sun disc (HDR, blooms)
  float sunR = 0.0245; // ~1.4 deg
  float sdisc = smoothstep( cos( sunR * 1.25 ), cos( sunR * 0.9 ), mu );
  col += uSunDisc * sdisc;

  if ( y > -0.02 ) {
    // ── cirrus wisps (high, stretched)
    float fadeHi = smoothstep( 0.02, 0.2, y );
    vec2 cp2 = d.xz / ( y + 0.22 ) * vec2( 0.16, 0.45 ) + uCloudOffset2;
    vec4 ci = texture2D( uNoise, cp2 );
    float cir = smoothstep( 0.6, 0.95, ci.b * 0.8 + ci.r * 0.35 ) * 0.22 * fadeHi;
    vec3 cirCol = mix( uCloudLit, horizonCol, 0.3 ) + uGlow * pow( mup, 8.0 ) * uGlowI * 0.8 * uDay;
    col = mix( col, cirCol, cir );

    // ── overhead puffs
    if ( y > 0.02 ) {
      vec2 cp = d.xz / ( y + 0.06 ) * 0.42 + uCloudOffset;
      float c0 = puffField( cp );
      // extra fine billows keep overhead (magnified) clouds crisp
      c0 += ( texture2D( uNoise, cp * 1.9 + 0.23 ).g - 0.6 ) * 0.1 * smoothstep( 0.3, 0.9, y );
      float cover = uCloudCover;
      float aa = max( fwidth( c0 ) * 1.5, 0.012 );
      float dens = smoothstep( cover, cover + min( aa, 0.09 ), c0 ) * smoothstep( cover, cover + 0.1, c0 + 0.02 );
      if ( dens > 0.001 ) {
        vec2 ldir = normalize( uLightDir.xz + vec2( 1e-4 ) );
        float c1 = puffField( cp + ldir * 0.07 );
        float lit = clamp( 0.62 + ( c0 - c1 ) * 5.0, 0.0, 1.0 );
        float core = smoothstep( cover + 0.05, cover + 0.3, c0 );
        lit *= 1.0 - core * 0.3;
        // internal billow texture so big overhead clouds never read as flat cut-outs
        float fine = texture2D( uNoise, cp * 2.3 + 0.41 ).g;
        lit *= 0.78 + 0.36 * fine;
        lit = mix( lit, 1.0, 0.15 * smoothstep( 0.3, 0.9, uLightDir.y ) );
        lit = mix( lit, floor( lit * 3.0 + 0.5 ) / 3.0, 0.25 );
        vec3 cc = mix( uCloudShade, uCloudLit, lit );
        float edge = dens * ( 1.0 - dens ) * 4.0;
        cc += uGlow * uGlowI * ( edge * 0.8 + ( 1.0 - core ) * 0.3 ) * ( pow( mup, 6.0 ) * 1.4 + pow( mup, 40.0 ) * 2.5 ) * uDay;
        cc = mix( cc, horizonCol, ( 1.0 - smoothstep( 0.02, 0.35, y ) ) * 0.5 );
        col = mix( col, cc, dens * smoothstep( 0.02, 0.12, y ) * 0.97 );
      }
    }

    // ── horizon cumulus band (in front of everything else in the sky)
    vec4 bc = bandClouds( d, horizonCol, mup );
    col = mix( col, bc.rgb, bc.a );
  }

  gl_FragColor = vec4( col, 1.0 );
}
`;
export function createSkyDome(ctx, wbFog, noise) {
  const geometry = new SphereGeometry(1, 64, 32);
  const material = new ShaderMaterial({
    name: 'wb-sky',
    uniforms: {
      ...ctx.globals,
      uZenith: {
        value: new Color(),
      },
      uHorizon: {
        value: new Color(),
      },
      uSkySun: {
        value: new Vector3(0, 1, 0),
      },
      uSkyMoon: {
        value: new Vector3(0, -1, 0),
      },
      uLightDir: {
        value: new Vector3(0, 1, 0),
      },
      uSunDisc: {
        value: new Color(),
      },
      uGlow: {
        value: new Color(),
      },
      uGlowI: {
        value: 0.5,
      },
      uBelt: {
        value: new Color(0, 0, 0),
      },
      uCloudLit: {
        value: new Color(),
      },
      uCloudShade: {
        value: new Color(),
      },
      uCloudCover: {
        value: 0.66,
      },
      uBandCover: {
        value: 0.1,
      },
      uCloudOffset: {
        value: new Vector2(),
      },
      uCloudOffset2: {
        value: new Vector2(0.3, 0.7),
      },
      uBandShift: {
        value: 0,
      },
      uStars: {
        value: 0,
      },
      uMoonI: {
        value: 0,
      },
      uDay: {
        value: 1,
      },
      uNoise: {
        value: noise,
      },
      wbFogSun: {
        value: wbFog.sun,
      },
      wbFogSunColor: {
        value: wbFog.sunColor,
      },
    },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'wb-sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = 10000;
  mesh.matrixAutoUpdate = false;
  ctx.scene.add(mesh);
  const clouds = Number.parseFloat(ctx.params.get('clouds') ?? '');
  if (Number.isFinite(clouds)) {
    material.uniforms.uCloudCover.value = 0.85 - clouds * 0.35;
    material.uniforms.uBandCover.value = 0.1 + (clouds - 0.5) * 0.3;
  }
  const uniforms = material.uniforms;
  const discColor = new Color();
  const beltColor = new Color(0xd98aa0);
  return {
    mesh,
    material,
    update(dt, sky, windDir, windStrength) {
      uniforms.uZenith.value.copy(sky.zenith);
      uniforms.uHorizon.value.copy(sky.horizon);
      uniforms.uSkySun.value.copy(sky.sunDir);
      uniforms.uSkyMoon.value.copy(sky.moonDir);
      uniforms.uLightDir.value.copy(sky.sunDir.y > -0.05 ? sky.sunDir : sky.moonDir);
      uniforms.uGlow.value.copy(sky.glow);
      uniforms.uGlowI.value = sky.glowIntensity;
      uniforms.uCloudLit.value.copy(sky.cloudLit);
      uniforms.uCloudShade.value.copy(sky.cloudShade);
      uniforms.uStars.value = sky.stars;
      uniforms.uMoonI.value = 0.3 + 0.7 * (1 - sky.day);
      uniforms.uDay.value = sky.day;
      const belt = Math.exp(-(((sky.sunDir.y + 0.02) / 0.07) ** 2));
      uniforms.uBelt.value.copy(beltColor).multiplyScalar(0.35 * belt);
      const lowSun = 1 - MathUtils.smoothstep(sky.sunDir.y, 0, 0.35);
      discColor.setRGB(1, 0.93 - 0.3 * lowSun, 0.8 - 0.5 * lowSun);
      const sunUp = MathUtils.smoothstep(sky.sunDir.y, -0.03, 0.01);
      uniforms.uSunDisc.value.copy(discColor).multiplyScalar((22 - 10 * lowSun) * sunUp);
      const drift = 0.004 + windStrength * 0.006;
      uniforms.uCloudOffset.value.x += windDir.x * drift * dt;
      uniforms.uCloudOffset.value.y += windDir.y * drift * dt;
      uniforms.uCloudOffset2.value.x += (windDir.x * 0.8 - windDir.y * 0.3) * drift * 1.6 * dt;
      uniforms.uCloudOffset2.value.y += (windDir.y * 0.8 + windDir.x * 0.3) * drift * 1.6 * dt;
      uniforms.uBandShift.value = (uniforms.uBandShift.value + dt * 0.00012) % 1;
    },
  };
}
