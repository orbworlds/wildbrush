/**
 * Atmosphere particles: wind-blown dust motes by day and blinking fireflies at dusk, drawn as point clouds that wrap around the camera and follow the terrain.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
} from 'three';
import { makeRng } from '../core/math.js';
const ATMOSPHERE_PARTICLE_VERTEX = `
#include <wb_common>
attribute vec4 aSeed;
uniform float uBox;
uniform float uHeightMin;
uniform float uHeightMax;
uniform float uSize;
uniform float uKind; // 0 motes, 1 fireflies
uniform float uPixelScale;
uniform vec2 uDrift;
varying float vAlpha;
varying float vGlow;
varying float vSeed;

void main() {
  vec3 s = aSeed.xyz;
  float ph = aSeed.w * 6.2831;
  float t = uTime;
  vec3 p;
  p.xz = s.xz * uBox;
  if ( uKind < 0.5 ) {
    // motes: drift with the wind, lazy swirl
    p.xz += uDrift * ( 0.6 + 0.8 * aSeed.w );
    p.xz += vec2( sin( t * 0.33 + ph ), cos( t * 0.27 + ph * 1.3 ) ) * 1.4;
  } else {
    // fireflies: meander around a home point
    p.xz += vec2( sin( t * 0.21 + ph ) + 0.5 * sin( t * 0.53 + ph * 2.1 ), cos( t * 0.17 + ph * 1.7 ) + 0.5 * cos( t * 0.47 + ph ) ) * 2.2;
  }
  // wrap around the camera
  vec2 rel = mod( p.xz - uCameraPos.xz + 0.5 * uBox, uBox ) - 0.5 * uBox;
  vec2 xz = uCameraPos.xz + rel;
  float ground = wbTerrainHeight( xz );
  float hy = mix( uHeightMin, uHeightMax, s.y );
  float bob = uKind < 0.5 ? sin( t * 0.5 + ph * 3.0 ) * 0.6 : sin( t * 0.9 + ph * 2.0 ) * 0.45;
  vec3 wp = vec3( xz.x, max( ground, uWaterLevel ) + hy + bob, xz.y );
  vec4 mv = viewMatrix * vec4( wp, 1.0 );
  gl_Position = projectionMatrix * mv;

  float dist = -mv.z;
  float edge = 1.0 - smoothstep( 0.32, 0.5, length( rel ) / uBox );
  float nearFade = smoothstep( 1.5, 4.0, dist );
  vAlpha = edge * nearFade;
  if ( uKind > 0.5 ) {
    // blink
    float bl = sin( t * ( 1.1 + aSeed.w * 1.7 ) + ph * 5.0 );
    vGlow = smoothstep( -0.2, 0.9, bl );
    // not over open sea
    vAlpha *= smoothstep( -0.5, 0.8, ground );
  } else {
    vec3 vdir = normalize( wp - uCameraPos );
    float fwd = max( dot( vdir, uSunDir ), 0.0 );
    vGlow = 0.3 + pow( fwd, 4.0 ) * 1.8; // backlit sparkle
  }
  vSeed = aSeed.w;
  gl_PointSize = clamp( uSize * uPixelScale / max( dist, 0.1 ) * ( 0.6 + 0.8 * aSeed.w ), 1.0, 48.0 );
}
`;
const ATMOSPHERE_PARTICLE_FRAGMENT = `
#include <wb_common>
uniform vec3 uColor;
uniform float uIntensity;
uniform float uKind;
varying float vAlpha;
varying float vGlow;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length( c ) * 2.0;
  float core = smoothstep( 1.0, 0.0, r );
  float a;
  vec3 col;
  if ( uKind > 0.5 ) {
    a = ( pow( core, 6.0 ) * 1.4 + pow( core, 2.0 ) * 0.3 ) * vGlow;
    col = mix( uColor, vec3( 1.0, 1.0, 0.8 ), pow( core, 8.0 ) );
  } else {
    a = pow( core, 1.6 );
    col = uColor * mix( vec3( 1.0 ), uSunColor, 0.6 );
  }
  a *= vAlpha * uIntensity;
  if ( a < 0.003 ) discard;
  gl_FragColor = vec4( col * a * ( uKind > 0.5 ? 1.0 : vGlow ), 1.0 );
}
`;
function createParticleLayer(ctx, count, kind, seed) {
  const rng = makeRng(seed);
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count * 4; i++) seeds[i] = rng();
  const geometry = new BufferGeometry();
  geometry.setAttribute('aSeed', new BufferAttribute(seeds, 4));
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.boundingSphere = new Sphere(new Vector3(), 1000000);
  const material = new ShaderMaterial({
    name: kind ? 'wb-fireflies' : 'wb-motes',
    uniforms: {
      ...ctx.globals,
      uBox: {
        value: kind ? 52 : 42,
      },
      uHeightMin: {
        value: kind ? 0.3 : 0.2,
      },
      uHeightMax: {
        value: kind ? 3.2 : 9,
      },
      uSize: {
        value: kind ? 0.3 : 0.035,
      },
      uKind: {
        value: kind,
      },
      uPixelScale: {
        value: 600,
      },
      uDrift: {
        value: new Vector2(),
      },
      uColor: {
        value: kind ? new Color(0.75, 1, 0.35).multiplyScalar(3.2) : new Color(1, 0.94, 0.78),
      },
      uIntensity: {
        value: 0,
      },
    },
    vertexShader: ATMOSPHERE_PARTICLE_VERTEX,
    fragmentShader: ATMOSPHERE_PARTICLE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 20;
  points.name = kind ? 'wb-fireflies' : 'wb-motes';
  ctx.scene.add(points);
  return {
    pts: points,
    mat: material,
    geo: geometry,
    count,
  };
}
export function createAtmosphereParticles(ctx) {
  const motes = createParticleLayer(ctx, 900, 0, 'motes');
  const fireflies = createParticleLayer(ctx, 220, 1, 'fireflies');
  const drift = new Vector2();
  return {
    update(dt, day, dusk, windDir, windStrength) {
      drift.addScaledVector(windDir, (0.4 + windStrength * 1.6) * dt);
      if (Math.abs(drift.x) > 4200) drift.x %= 420;
      if (Math.abs(drift.y) > 4200) drift.y %= 420;
      motes.mat.uniforms.uDrift.value.copy(drift);
      const moteIntensity = 0.1 + 0.4 * day;
      motes.mat.uniforms.uIntensity.value = moteIntensity;
      motes.pts.visible = moteIntensity > 0.01;
      const fireflyIntensity = dusk * 1;
      fireflies.mat.uniforms.uIntensity.value = fireflyIntensity;
      fireflies.pts.visible = fireflyIntensity > 0.01;
    },
    setQuality(quality) {
      motes.geo.setDrawRange(0, quality === 'low' ? 300 : quality === 'medium' ? 600 : motes.count);
      fireflies.geo.setDrawRange(0, quality === 'low' ? 80 : quality === 'medium' ? 150 : fireflies.count);
    },
    setPixelScale(pixelScale) {
      motes.mat.uniforms.uPixelScale.value = pixelScale;
      fireflies.mat.uniforms.uPixelScale.value = pixelScale;
    },
  };
}
