/**
 * The game's post-processing chain: N8AO, bloom, light shafts with drifting cloud shadows and ink outlines, a painterly grade with AgX, ACES or neutral tone mapping, SMAA and the paper-grain finish.
 */
import { Color, HalfFloatType, NoToneMapping, Uniform, Vector2, Vector3, Vector4 } from 'three';
import { N8AOPostPass } from 'n8ao';
import {
  BlendFunction,
  BloomEffect,
  EdgeDetectionMode,
  Effect,
  EffectAttribute,
  EffectComposer,
  EffectPass,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
} from 'postprocessing';
const GRADE_FRAGMENT = `
uniform float uExposure;
uniform float uLookPow;
uniform float uLookSat;
uniform float uSat;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uVignette;
uniform vec3 uVignetteTint;
uniform float uLift;
uniform float uNight;

const mat3 gToRec2020 = mat3(
  vec3( 0.6274, 0.0691, 0.0164 ),
  vec3( 0.3293, 0.9195, 0.0880 ),
  vec3( 0.0433, 0.0113, 0.8956 )
);
const mat3 gFromRec2020 = mat3(
  vec3( 1.6605, -0.1246, -0.0182 ),
  vec3( -0.5876, 1.1329, -0.1006 ),
  vec3( -0.0728, -0.0083, 1.1187 )
);

vec3 gAgxContrast( vec3 x ) {
  vec3 x2 = x * x;
  vec3 x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

vec3 gAgx( vec3 color ) {
  const mat3 inset = mat3(
    vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
    vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
    vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
  );
  const mat3 outset = mat3(
    vec3( 1.1271005818144368, -0.1413297634984383, -0.14132976349843826 ),
    vec3( -0.11060664309660323, 1.157823702216272, -0.11060664309660294 ),
    vec3( -0.016493938717834573, -0.016493938717834257, 1.2519364065950405 )
  );
  const float minEv = -12.47393;
  const float maxEv = 4.026069;
  color = gToRec2020 * color;
  color = inset * color;
  color = max( color, 1e-10 );
  color = log2( color );
  color = ( color - minEv ) / ( maxEv - minEv );
  color = clamp( color, 0.0, 1.0 );
  color = gAgxContrast( color );
  // look (Blender "punchy"-style)
  float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = pow( max( color, 0.0 ), vec3( uLookPow ) );
  float l2 = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = l2 + uLookSat * ( color - l2 );
  color = outset * color;
  color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
  color = gFromRec2020 * color;
  return clamp( color, 0.0, 1.0 );
}

vec3 gAcesFit( vec3 v ) {
  vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
  vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
  return a / b;
}
vec3 gAces( vec3 color ) {
  const mat3 inM = mat3( vec3( 0.59719, 0.07600, 0.02840 ), vec3( 0.35458, 0.90834, 0.13383 ), vec3( 0.04823, 0.01566, 0.83777 ) );
  const mat3 outM = mat3( vec3( 1.60475, -0.10208, -0.00327 ), vec3( -0.53108, 1.10813, -0.07276 ), vec3( -0.07367, -0.00605, 1.07602 ) );
  color = inM * ( color / 0.6 );
  color = gAcesFit( color );
  return clamp( outM * color, 0.0, 1.0 );
}
vec3 gNeutral( vec3 color ) {
  const float start = 0.76;
  const float desat = 0.15;
  float x = min( color.r, min( color.g, color.b ) );
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max( color.r, max( color.g, color.b ) );
  if ( peak < start ) return color;
  float d = 1.0 - start;
  float newPeak = 1.0 - d * d / ( peak + d - start );
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / ( desat * ( peak - newPeak ) + 1.0 );
  return mix( color, vec3( newPeak ), g );
}

void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
  vec3 c = max( inputColor.rgb, 0.0 ) * uExposure;
  #if TM_MODE == 1
    c = gAces( c );
  #elif TM_MODE == 2
    c = gNeutral( c );
  #else
    c = gAgx( c );
  #endif
  // work in a perceptual (gamma) space for grading
  vec3 p = pow( max( c, 0.0 ), vec3( 1.0 / 2.2 ) );
  float l = dot( p, vec3( 0.2126, 0.7152, 0.0722 ) );
  // split toning: cool shadows, warm highlights
  vec3 tint = mix( uShadowTint, uHighTint, smoothstep( 0.08, 0.78, l ) );
  p *= tint;
  // gentle lift of the blacks toward blue (painted, never pitch black)
  p += uLift * vec3( 0.55, 0.65, 1.0 ) * ( 1.0 - smoothstep( 0.0, 0.35, l ) );
  // night: scotopic shift toward desaturated moonlit blue
  vec3 scot = vec3( l ) * vec3( 0.74, 0.88, 1.28 );
  // bright lights (paint, fire, fireflies) keep their color
  p = mix( p, scot, uNight * 0.5 * ( 1.0 - smoothstep( 0.3, 0.75, l ) ) );
  // soft S-curve
  vec3 s = p * p * ( 3.0 - 2.0 * p );
  p = mix( p, s, uContrast );
  // saturation (luma preserving)
  float l2 = dot( p, vec3( 0.2126, 0.7152, 0.0722 ) );
  p = mix( vec3( l2 ), p, uSat );
  // vignette (aspect-aware, very soft, slightly tinted)
  vec2 q = ( uv - 0.5 ) * vec2( aspect, 1.0 );
  float vg = smoothstep( 0.35, 1.25, length( q ) );
  p = mix( p, p * uVignetteTint, vg * uVignette );
  c = pow( max( p, 0.0 ), vec3( 2.2 ) );
  outputColor = vec4( c, inputColor.a );
}
`;
const SHAFTS_FRAGMENT = `
uniform vec2 uSunUV;
uniform float uShaftI;
uniform vec3 uShaftColor;
uniform float uInk;
uniform vec3 uInkColor;
uniform float uCloudShadow;
uniform vec4 uCloudShadowParams; // xy: drift (m), z: coverage threshold, w: fog-fade distance
uniform vec3 uCloudSunDir;
uniform mat4 uProjInv;
uniform mat4 uCamWorld;
uniform sampler2D uCloudNoise;
void mainImage( const in vec4 inputColor, const in vec2 uv, const in float depth, out vec4 outputColor ) {
  vec3 add = vec3( 0.0 );
  vec3 base = inputColor.rgb;
  if ( uCloudShadow > 0.001 && depth < 0.99999 ) {
    // drifting cloud shadows: project the world position up the sun ray to the cloud layer
    vec4 vp = uProjInv * vec4( uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
    vp /= vp.w;
    vec3 wp = ( uCamWorld * vec4( vp.xyz, 1.0 ) ).xyz;
    float dist = length( vp.xyz );
    vec2 cxz = wp.xz + uCloudSunDir.xz / max( uCloudSunDir.y, 0.15 ) * ( 160.0 - wp.y ) + uCloudShadowParams.xy;
    vec2 q = cxz * 0.0022;
    float n = texture2D( uCloudNoise, q ).r * 0.75 + texture2D( uCloudNoise, q * 2.3 + 0.37 ).g * 0.4;
    float sh = smoothstep( uCloudShadowParams.z, uCloudShadowParams.z + 0.22, n );
    sh *= 1.0 - smoothstep( 0.3, 1.0, dist / uCloudShadowParams.w );
    sh *= smoothstep( 0.4, 2.0, wp.y ); // land only: the sea mirrors the sky instead
    base *= 1.0 - sh * uCloudShadow;
  }
  if ( uInk > 0.001 && depth < 0.99999 ) {
    // soft ink on silhouettes: this pixel is in front of a much farther neighbour
    float zc = -getViewZ( depth );
    vec2 o = texelSize * 1.0;
    float z1 = -getViewZ( readDepth( uv + vec2( o.x, 0.0 ) ) );
    float z2 = -getViewZ( readDepth( uv - vec2( o.x, 0.0 ) ) );
    float z3 = -getViewZ( readDepth( uv + vec2( 0.0, o.y ) ) );
    float z4 = -getViewZ( readDepth( uv - vec2( 0.0, o.y ) ) );
    float zm = max( max( z1, z2 ), max( z3, z4 ) );
    float rel = ( zm - zc ) / max( zc, 0.1 );
    float edge = smoothstep( 0.25, 0.9, rel ) * ( 1.0 - smoothstep( 25.0, 90.0, zc ) );
    base = mix( base, base * uInkColor, edge * uInk );
  }
  if ( uShaftI > 0.001 ) {
    vec2 toSun = uSunUV - uv;
    vec2 st = toSun / float( SHAFT_SAMPLES ) * 0.9;
    float jit = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
    vec2 p = uv + st * jit;
    float sum = 0.0;
    float w = 1.0;
    // depth-only occlusion march (no colour fetches): open sky near the sun emits
    for ( int i = 0; i < SHAFT_SAMPLES; i++ ) {
      float sky = step( 0.99999, readDepth( p ) );
      float r = length( ( p - uSunUV ) * vec2( aspect, 1.0 ) );
      sum += sky * exp( -r * 9.0 ) * w;
      w *= 0.96;
      p += st;
    }
    float d = length( toSun * vec2( aspect, 1.0 ) );
    add = uShaftColor * ( sum / float( SHAFT_SAMPLES ) ) * uShaftI * 2.2 * exp( -d * 2.2 );
  }
  outputColor = vec4( base + add, inputColor.a );
}
`;
const FINISH_FRAGMENT = `
uniform float uGrain;
uniform float uPaper;
uniform float uFrame;

float fHash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float fNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p );
  vec2 u = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( fHash( i ), fHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( fHash( i + vec2( 0.0, 1.0 ) ), fHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
}

void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
  vec3 c = inputColor.rgb;
  vec2 px = uv * resolution;
  // animated fine grain (also dithers gradients)
  float g = fHash( px + fract( uFrame * 0.6180339 ) * 311.0 ) + fHash( px * 1.37 - fract( uFrame * 0.381966 ) * 173.0 ) - 1.0;
  // static paper tooth: low-contrast fibrous noise fixed to the screen like a canvas
  vec2 pp = px / max( resolution.y, 1.0 ) * 720.0;
  float paper = fNoise( pp * 0.9 ) * 0.5 + fNoise( pp * 2.3 + 17.0 ) * 0.3 + fNoise( vec2( pp.x * 0.35, pp.y * 3.1 ) ) * 0.2;
  paper = paper - 0.5;
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  float mid = 4.0 * l * ( 1.0 - l ) + 0.25;
  c *= 1.0 + paper * uPaper * mid;
  c += g * uGrain * ( 0.004 + sqrt( max( l, 0.0 ) ) * 0.012 );
  outputColor = vec4( max( c, 0.0 ), inputColor.a );
}
`;
export function createPostProcessing(ctx) {
  const { renderer, scene, camera, params } = ctx;
  renderer.toneMapping = NoToneMapping;
  const composer = new EffectComposer(renderer, {
    frameBufferType: HalfFloatType,
    multisampling: 0,
  });
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const drawingBufferSize = renderer.getDrawingBufferSize(new Vector2());
  const aoDisabled = params.get('ao') === '0';
  const aoPass = new N8AOPostPass(scene, camera, drawingBufferSize.x, drawingBufferSize.y);
  aoPass.autoDetectTransparency = false;
  aoPass.configuration.transparencyAware = false;
  aoPass.configuration.aoRadius = 2;
  aoPass.configuration.distanceFalloff = 1.2;
  aoPass.configuration.intensity = 1.7;
  aoPass.configuration.color = new Color(0.06, 0.07, 0.14);
  aoPass.configuration.gammaCorrection = false;
  aoPass.setQualityMode('Medium');
  composer.addPass(aoPass);
  const bloom = new BloomEffect({
    mipmapBlur: true,
    luminanceThreshold: 0.92,
    luminanceSmoothing: 0.35,
    intensity: 0.55,
    radius: 0.72,
    levels: 7,
  });
  const tm = params.get('tm');
  const toneMapMode = tm === 'aces' ? 1 : tm === 'neutral' ? 2 : 0;
  const gradeUniforms = new Map([
    ['uExposure', new Uniform(1)],
    ['uLookPow', new Uniform(1.12)],
    ['uLookSat', new Uniform(1.3)],
    ['uSat', new Uniform(1.08)],
    ['uContrast', new Uniform(0.12)],
    ['uShadowTint', new Uniform(new Vector3(0.95, 0.98, 1.06))],
    ['uHighTint', new Uniform(new Vector3(1.035, 1, 0.95))],
    ['uVignette', new Uniform(0.38)],
    ['uVignetteTint', new Uniform(new Vector3(0.62, 0.6, 0.72))],
    ['uLift', new Uniform(0.012)],
    ['uNight', new Uniform(0)],
  ]);
  const grade = new Effect('WbGrade', GRADE_FRAGMENT, {
    blendFunction: BlendFunction.SRC,
    uniforms: gradeUniforms,
    defines: new Map([['TM_MODE', String(toneMapMode)]]),
  });
  const smaa = new SMAAEffect({
    preset: SMAAPreset.HIGH,
    edgeDetectionMode: EdgeDetectionMode.COLOR,
  });
  const finishUniforms = new Map([
    ['uGrain', new Uniform(params.get('grain') === '0' ? 0 : 1)],
    ['uPaper', new Uniform(params.get('paper') === '0' ? 0 : 0.05)],
    ['uFrame', new Uniform(0)],
  ]);
  const finish = new Effect('WbFinish', FINISH_FRAGMENT, {
    blendFunction: BlendFunction.SRC,
    uniforms: finishUniforms,
  });
  const shaftUniforms = new Map([
    ['uSunUV', new Uniform(new Vector2(0.5, 0.5))],
    ['uShaftI', new Uniform(0)],
    ['uShaftColor', new Uniform(new Color(1, 0.8, 0.6))],
    ['uInk', new Uniform(Number.parseFloat(params.get('ink') ?? '0') || 0)],
    ['uInkColor', new Uniform(new Color(0.45, 0.42, 0.58))],
    ['uCloudShadow', new Uniform(0)],
    ['uCloudShadowParams', new Uniform(new Vector4(0, 0, 0.72, 600))],
    ['uCloudSunDir', new Uniform(new Vector3(0, 1, 0))],
    ['uProjInv', new Uniform(camera.projectionMatrixInverse)],
    ['uCamWorld', new Uniform(camera.matrixWorld)],
    ['uCloudNoise', new Uniform(null)],
  ]);
  const shafts = new Effect('WbShafts', SHAFTS_FRAGMENT, {
    blendFunction: BlendFunction.SRC,
    attributes: EffectAttribute.DEPTH,
    uniforms: shaftUniforms,
    defines: new Map([['SHAFT_SAMPLES', '24']]),
  });
  let shaftsOn = params.get('shafts') !== '0';
  const cloudShadowsOn = params.get('cloudshadows') !== '0';
  const effectPass = new EffectPass(camera, shafts, bloom, grade);
  const finishPass = new EffectPass(camera, smaa, finish);
  composer.addPass(effectPass);
  composer.addPass(finishPass);
  if (params.get('bloom') === '0') bloom.blendMode.opacity.value = 0;
  const aoAllowed = !aoDisabled;
  let frameCount = 0;
  const post = {
    composer,
    ao: aoPass,
    bloom,
    get aoEnabled() {
      return aoPass.enabled;
    },
    render(dt) {
      frameCount++;
      finishUniforms.get('uFrame').value = frameCount % 1000;
      composer.render(dt);
    },
    setSize(width, height) {
      composer.setSize(width, height, false);
    },
    setQuality(quality) {
      aoPass.enabled = aoAllowed && quality !== 'low';
      aoPass.configuration.halfRes = true;
      aoPass.setQualityMode(params.get('aoq') === 'med' ? 'Medium' : 'Performance');
      aoPass.configuration.denoiseIterations = quality === 'high' ? 2 : 1;
      shaftsOn = params.get('shafts') !== '0' && quality !== 'low';
      const shaftSamples = quality === 'high' ? '24' : '16';
      if (shafts.defines.get('SHAFT_SAMPLES') !== shaftSamples) {
        shafts.defines.set('SHAFT_SAMPLES', shaftSamples);
        shafts.setChanged();
      }
      smaa.applyPreset(quality === 'low' ? SMAAPreset.LOW : quality === 'medium' ? SMAAPreset.MEDIUM : SMAAPreset.HIGH);
      bloom.mipmapBlurPass.levels = quality === 'low' ? 4 : 6;
    },
    setExposure(exposure) {
      gradeUniforms.get('uExposure').value = exposure;
    },
    setCloudShadows(intensity, sunDir, driftX, driftZ, coverThreshold, fadeDistance, noise) {
      shaftUniforms.get('uCloudShadow').value = cloudShadowsOn ? intensity : 0;
      shaftUniforms.get('uCloudSunDir').value.copy(sunDir);
      shaftUniforms.get('uCloudShadowParams').value.set(driftX, driftZ, coverThreshold, fadeDistance);
      shaftUniforms.get('uCloudNoise').value = noise;
    },
    setShafts(sunU, sunV, intensity, color) {
      shaftUniforms.get('uSunUV').value.set(sunU, sunV);
      shaftUniforms.get('uShaftI').value = shaftsOn ? intensity : 0;
      shaftUniforms.get('uShaftColor').value.copy(color);
    },
    setNight(night) {
      gradeUniforms.get('uShadowTint').value.set(0.95 - 0.05 * night, 0.98, 1.06 + 0.06 * night);
      gradeUniforms.get('uLift').value = 0.012 + 0.018 * night;
      gradeUniforms.get('uSat').value = 1.08 - 0.12 * night;
      gradeUniforms.get('uNight').value = night;
    },
  };
  post.setQuality(ctx.settings.quality);
  return post;
}
