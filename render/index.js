/**
 * The environment system (ctx.environment): hemisphere and sun or moon lights with a texel-snapped shadow camera, fog, wind, the day cycle, quality and dynamic resolution, the post chain and the final render. setInterior blends to cave and temple lighting.
 */
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MathUtils,
  PCFShadowMap,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three';
import { clamp, damp, makeNoise2D } from '../core/math.js';
import { createAtmosphereParticles } from './atmosphere-particles.js';
import { installHeightFog } from './height-fog.js';
import { createPostProcessing } from './post.js';
import { createSkyDome } from './sky-dome.js';
import { createSkyNoiseTexture } from './sky-noise.js';
import { computeSky, createSkyState } from './time-of-day.js';
const DAY_SPEED = 24 / 1200;
const HEMI_INTENSITY_SCALE = 2.1;
const SUN_INTENSITY_REF = 3;
const SHADOW_QUALITY = {
  low: {
    mapSize: 1024,
    half: 34,
    radius: 1.5,
  },
  medium: {
    mapSize: 2048,
    half: 44,
    radius: 2,
  },
  high: {
    mapSize: 4096,
    half: 52,
    radius: 2.5,
  },
};
const PIXEL_BUDGET = {
  low: {
    cap: 1,
    maxPixels: 1100000,
  },
  medium: {
    cap: 1.5,
    maxPixels: 1800000,
  },
  high: {
    cap: 2,
    maxPixels: 2600000,
  },
};
const DYNAMIC_RES = {
  min: 0.55,
  down: 0.87,
  up: 1.05,
  lowFps: 50,
  highFps: 57,
  upHold: 3,
  lockAfterBounce: 20,
};
export async function create(ctx) {
  const { renderer, scene, camera, params, globals } = ctx;
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.outputColorSpace = SRGBColorSpace;
  const wbFog = installHeightFog(ctx);
  const fog = new Fog(0xdfe9ef, 25, 650);
  scene.fog = fog;
  scene.background = null;
  const sky = createSkyState();
  let hours = Number.parseFloat(params.get('tod') ?? '');
  if (!Number.isFinite(hours)) hours = 15.5;
  hours = ((hours % 24) + 24) % 24;
  const skyNoise = createSkyNoiseTexture(256);
  const skyDome = createSkyDome(ctx, wbFog, skyNoise);
  const hemiLight = new HemisphereLight(0xcfe6ff, 0x6b5a45, 1);
  hemiLight.name = 'wb-hemi';
  scene.add(hemiLight);
  const sunLight = new DirectionalLight(0xfff2dd, 3);
  sunLight.name = 'wb-sun';
  sunLight.castShadow = true;
  sunLight.shadow.bias = -0.00025;
  sunLight.shadow.normalBias = 0.045;
  scene.add(sunLight, sunLight.target);
  const windNoise = makeNoise2D('wildbrush-wind');
  const wind = {
    direction: new Vector2(0.8, 0.6).normalize(),
    strength: 0.5,
  };
  let windTime = 0;
  let atmosphere = null;
  try {
    atmosphere = createAtmosphereParticles(ctx);
  } catch (err) {
    console.warn('[environment] atmosphere particles disabled', err);
  }
  let post = null;
  if (params.get('post') !== '0')
    try {
      post = createPostProcessing(ctx);
    } catch (err) {
      console.error('[environment] post-processing failed, rendering without it', err);
      post = null;
    }
  if (!post) {
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
  }
  let quality = ctx.settings.quality;
  let width = window.innerWidth;
  let height = window.innerHeight;
  let renderScale = 1;
  const useDynamicRes = !ctx.shotMode && params.get('dynres') !== '0';
  const applyPixelRatio = () => {
    const budget = PIXEL_BUDGET[quality];
    const dpr = window.devicePixelRatio || 1;
    const ratio = Math.min(dpr, budget.cap, Math.sqrt(budget.maxPixels / Math.max(1, width * height)));
    const pixelRatio = clamp(ratio * renderScale, 0.5, 3);
    if (Math.abs(renderer.getPixelRatio() - pixelRatio) > 0.001) renderer.setPixelRatio(pixelRatio);
  };
  let fpsTime = 0;
  let fpsFrames = 0;
  let upStreak = 0;
  let lockTimer = 0;
  let lastUpTime = -1000000000;
  let elapsed = 0;
  const updateDynamicRes = (dt) => {
    if (
      !useDynamicRes ||
      dt <= 0 ||
      ((fpsTime += dt), fpsFrames++, (elapsed += dt), (lockTimer = Math.max(0, lockTimer - dt)), fpsTime < 1)
    )
      return;
    const fps = fpsFrames / fpsTime;
    fpsTime = 0;
    fpsFrames = 0;
    let nextScale = renderScale;
    if (fps < DYNAMIC_RES.lowFps) {
      nextScale = Math.max(DYNAMIC_RES.min, renderScale * DYNAMIC_RES.down);
      upStreak = 0;
      if (elapsed - lastUpTime < 2.5) lockTimer = DYNAMIC_RES.lockAfterBounce;
    } else if (fps > DYNAMIC_RES.highFps) {
      upStreak++;
      if (upStreak >= DYNAMIC_RES.upHold && lockTimer <= 0 && renderScale < 1) {
        nextScale = Math.min(1, renderScale * DYNAMIC_RES.up);
        upStreak = 0;
        lastUpTime = elapsed;
      }
    } else upStreak = 0;
    if (Math.abs(nextScale - renderScale) > 0.001) {
      renderScale = nextScale;
      applyPixelRatio();
      if (post) post.setSize(width, height);
      else renderer.setSize(width, height, false);
      updatePixelScale();
    }
  };
  const updatePixelScale = () => {
    const pixelHeight = height * renderer.getPixelRatio();
    atmosphere?.setPixelScale(pixelHeight / (2 * Math.tan(MathUtils.degToRad(camera.fov) / 2)));
  };
  const applyQuality = (level) => {
    quality = level;
    const shadowSettings = SHADOW_QUALITY[level];
    if (sunLight.shadow.mapSize.x !== shadowSettings.mapSize) {
      sunLight.shadow.mapSize.set(shadowSettings.mapSize, shadowSettings.mapSize);
      sunLight.shadow.map?.dispose();
      sunLight.shadow.map = null;
    }
    sunLight.shadow.radius = shadowSettings.radius;
    const shadowCamera = sunLight.shadow.camera;
    shadowCamera.left = shadowCamera.bottom = -shadowSettings.half;
    shadowCamera.right = shadowCamera.top = shadowSettings.half;
    shadowCamera.near = 1;
    shadowCamera.far = 420;
    shadowCamera.updateProjectionMatrix();
    atmosphere?.setQuality(level);
    post?.setQuality(level);
    applyPixelRatio();
    post?.setSize(width, height);
    if (!post) renderer.setSize(width, height, false);
    updatePixelScale();
  };
  applyQuality(quality);
  ctx.events.on('settings:changed', ({ settings }) => {
    try {
      if (settings.quality !== quality) applyQuality(settings.quality);
    } catch (err) {
      console.warn('[environment] quality change failed', err);
    }
  });
  const camForward = new Vector3();
  const shadowCenter = new Vector3();
  const shadowRight = new Vector3();
  const shadowUp = new Vector3();
  const lightDir = new Vector3();
  const worldUp = new Vector3(0, 1, 0);
  const glowColor = new Color();
  let exposure = 1;
  let interiorLighting = null;
  let interiorMix = 0;
  let interiorTarget = 0;
  const interiorColor = new Color();
  const applyInteriorLighting = () => {
    const blend = interiorMix;
    if (blend <= 0.001 || !interiorLighting) return;
    const lighting = interiorLighting;
    const ambient = lighting.ambient ?? 0.25;
    const ambientColor = lighting.ambientColor ?? 3752026;
    const sunScale = 1 - blend * (1 - (lighting.sun ?? 0));
    sunLight.intensity *= sunScale;
    interiorColor.set(ambientColor);
    hemiLight.color.lerp(interiorColor, blend);
    hemiLight.groundColor.lerp(interiorColor.multiplyScalar(0.55), blend);
    hemiLight.intensity = MathUtils.lerp(hemiLight.intensity, ambient * HEMI_INTENSITY_SCALE, blend);
    globals.uSunColor.value.multiplyScalar(sunScale);
    globals.uSkyColor.value.lerp(interiorColor.set(ambientColor).multiplyScalar(ambient), blend);
    globals.uGroundColor.value.lerp(interiorColor.set(ambientColor).multiplyScalar(ambient * 0.55), blend);
    fog.color.lerp(interiorColor.set(lighting.fogColor ?? 658450), blend);
    renderer.setClearColor(fog.color, 0x000001);
    const fogParams = wbFog.params;
    fogParams[0] = MathUtils.lerp(fogParams[0], lighting.fogDensity ?? 0.03, blend);
    fogParams[1] *= 1 - blend;
    wbFog.sun[3] *= 1 - blend;
    const fogDist = 1 / Math.max(0.00001, fogParams[0]);
    fog.near = fogDist * 0.3;
    fog.far = fogDist * 1.9;
    if (lighting.exposure !== undefined) exposure = MathUtils.lerp(exposure, lighting.exposure, blend);
  };
  const applyTimeOfDay = () => {
    computeSky(hours, sky);
    sunLight.color.copy(sky.keyColor);
    sunLight.intensity = sky.keyIntensity;
    sunLight.shadow.intensity = sky.keyIsMoon ? 0.75 : 1;
    hemiLight.color.copy(sky.hemiSky);
    hemiLight.groundColor.copy(sky.hemiGround);
    hemiLight.intensity = sky.hemiIntensity * HEMI_INTENSITY_SCALE;
    globals.uSunDir.value.copy(sky.keyDir);
    globals.uSunColor.value.copy(sky.keyColor).multiplyScalar(sky.keyIntensity / SUN_INTENSITY_REF);
    globals.uSkyColor.value.copy(sky.hemiSky).multiplyScalar(sky.hemiIntensity);
    globals.uGroundColor.value.copy(sky.hemiGround).multiplyScalar(sky.hemiIntensity);
    fog.color.copy(sky.horizon);
    renderer.setClearColor(sky.horizon, 0x000001);
    const fogParams = wbFog.params;
    fogParams[0] = sky.fogDensity * fogScale;
    fogParams[1] = sky.fogHeight * fogScale;
    fogParams[2] = 0.09;
    fogParams[3] = 0;
    const fogDist = 1 / Math.max(0.00001, sky.fogDensity * fogScale);
    fog.near = fogDist * 0.3;
    fog.far = fogDist * 1.9;
    const useMoon = sky.sunDir.y < -0.06;
    const glowDir = useMoon ? sky.moonDir : sky.sunDir;
    wbFog.sun[0] = glowDir.x;
    wbFog.sun[1] = glowDir.y;
    wbFog.sun[2] = glowDir.z;
    wbFog.sun[3] = useMoon ? 0.18 : sky.glowIntensity * 0.45 * MathUtils.smoothstep(sky.sunDir.y, -0.12, 0.02);
    glowColor.copy(sky.glow);
    wbFog.sunColor[0] = glowColor.r;
    wbFog.sunColor[1] = glowColor.g;
    wbFog.sunColor[2] = glowColor.b;
    exposure = sky.exposure;
    applyInteriorLighting();
  };
  let fogScale = Number.parseFloat(params.get('fog') ?? '1');
  if (!Number.isFinite(fogScale)) fogScale = 1;
  applyTimeOfDay();
  const sunScreen = new Vector3();
  const camDir = new Vector3();
  const shaftColor = new Color();
  const updateSunEffects = () => {
    if (!post) return;
    camera.getWorldDirection(camDir);
    const facing = camDir.dot(sky.sunDir);
    let shaftIntensity = 0;
    let sunU = 0.5;
    let sunV = 0.5;
    if (facing > 0.05 && sky.sunDir.y > -0.03) {
      sunScreen.copy(sky.sunDir).multiplyScalar(1000).add(camera.position).project(camera);
      sunU = sunScreen.x * 0.5 + 0.5;
      sunV = sunScreen.y * 0.5 + 0.5;
      const offscreen = Math.max(Math.abs(sunU - 0.5), Math.abs(sunV - 0.5)) - 0.5;
      shaftIntensity =
        (1 - MathUtils.smoothstep(offscreen, 0, 0.35)) *
        (0.35 + 0.65 * (1 - MathUtils.smoothstep(sky.sunDir.y, 0.1, 0.6))) *
        MathUtils.smoothstep(sky.sunDir.y, -0.03, 0.03) *
        shaftScale;
    }
    shaftColor.copy(sky.glow).lerp(sky.keyColor, 0.5);
    post.setShafts(sunU, sunV, shaftIntensity * (1 - interiorMix), shaftColor);
    const cloudShadow = 0.34 * sky.day * MathUtils.smoothstep(sky.sunDir.y, 0.05, 0.3) * (1 - interiorMix);
    const uCloudOffset = skyDome.material.uniforms.uCloudOffset.value;
    post.setCloudShadows(cloudShadow, sky.sunDir, -uCloudOffset.x * 380, -uCloudOffset.y * 380, 0.68, 700, skyNoise);
  };
  let shaftScale = Number.parseFloat(params.get('shaftI') ?? '1');
  if (!Number.isFinite(shaftScale)) shaftScale = 1;
  const updateShadowFrustum = () => {
    const shadowSettings = SHADOW_QUALITY[quality];
    const playerPos = ctx.player?.state?.position;
    if (playerPos && Number.isFinite(playerPos.x)) shadowCenter.copy(playerPos);
    else shadowCenter.copy(camera.position);
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    if (camForward.lengthSq() > 0.000001)
      shadowCenter.addScaledVector(camForward.normalize(), shadowSettings.half * 0.42);
    lightDir.copy(sky.keyDir).normalize();
    shadowRight.crossVectors(worldUp, lightDir);
    if (shadowRight.lengthSq() < 0.000001) shadowRight.set(1, 0, 0);
    shadowRight.normalize();
    shadowUp.crossVectors(lightDir, shadowRight);
    const texel = (2 * shadowSettings.half) / shadowSettings.mapSize;
    const snapRight = Math.round(shadowCenter.dot(shadowRight) / texel) * texel;
    const snapUp = Math.round(shadowCenter.dot(shadowUp) / texel) * texel;
    const depth = shadowCenter.dot(lightDir);
    shadowCenter
      .copy(shadowRight)
      .multiplyScalar(snapRight)
      .addScaledVector(shadowUp, snapUp)
      .addScaledVector(lightDir, depth);
    sunLight.target.position.copy(shadowCenter);
    sunLight.position.copy(shadowCenter).addScaledVector(lightDir, 200);
    sunLight.target.updateMatrixWorld();
    sunLight.updateMatrixWorld();
  };
  const updateWind = (dt) => {
    windTime += dt;
    const angle = 0.6435 + windNoise(windTime * 0.0035, 1.7) * 0.9;
    wind.direction.set(Math.cos(angle), Math.sin(angle));
    const swell = 0.5 + 0.5 * windNoise(windTime * 0.05, 4.2);
    const gust = Math.max(0, windNoise(windTime * 0.21, 9.1));
    const targetStrength = clamp(0.28 + swell * 0.32 + gust * gust * 0.55, 0.08, 1);
    wind.strength += (targetStrength - wind.strength) * damp(2.5, dt);
    globals.uWindDir.value.copy(wind.direction);
    globals.uWindStrength.value = wind.strength;
  };
  if (ctx.debug)
    try {
      const folder = ctx.debug.addFolder('Environment');
      const controls = {
        get time() {
          return hours;
        },
        set time(value) {
          environment.setTimeOfDay(value);
        },
        get speed() {
          return environment.daySpeed;
        },
        set speed(value) {
          environment.daySpeed = value;
        },
        get fog() {
          return fogScale;
        },
        set fog(value) {
          fogScale = value;
          applyTimeOfDay();
        },
      };
      folder.add(controls, 'time', 0, 24, 0.01).listen();
      folder.add(controls, 'speed', 0, 1, 0.001);
      folder.add(controls, 'fog', 0, 3, 0.01);
    } catch {}
  let postFailed = false;
  const environment = {
    sun: sunLight,
    get timeOfDay() {
      return hours;
    },
    setTimeOfDay(timeOfDay) {
      if (Number.isFinite(timeOfDay)) {
        hours = ((timeOfDay % 24) + 24) % 24;
        applyTimeOfDay();
      }
    },
    daySpeed: DAY_SPEED,
    wind,
    get quality() {
      return quality;
    },
    get renderScale() {
      return renderScale;
    },
    get sky() {
      return sky;
    },
    get __post() {
      return post;
    },
    update(dt) {
      if (environment.daySpeed && dt > 0) hours = (hours + environment.daySpeed * dt) % 24;
      interiorMix += (interiorTarget - interiorMix) * Math.min(1, Math.max(ctx.time.realDt, 0) * 3);
      if (Math.abs(interiorTarget - interiorMix) < 0.001) interiorMix = interiorTarget;
      applyTimeOfDay();
      updateWind(dt);
      skyDome.update(dt, sky, wind.direction, wind.strength);
      atmosphere?.update(dt, sky.day * (1 - interiorMix), sky.dusk * (1 - interiorMix), wind.direction, wind.strength);
    },
    render(dt) {
      renderer.info.reset();
      updateDynamicRes(ctx.time.realDt);
      updateShadowFrustum();
      if (post && !postFailed) {
        post.setExposure(exposure);
        post.setNight(1 - sky.day);
        updateSunEffects();
        try {
          post.render(dt);
          return;
        } catch (err) {
          postFailed = true;
          console.error('[environment] post render failed; falling back to direct rendering', err);
          renderer.toneMapping = ACESFilmicToneMapping;
          renderer.setRenderTarget(null);
        }
      }
      renderer.toneMappingExposure = exposure;
      renderer.render(scene, camera);
    },
    setInterior(interior) {
      if (interior) interiorLighting = interior;
      interiorTarget = +!!interior;
    },
    setSize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      applyPixelRatio();
      if (post) post.setSize(width, height);
      else renderer.setSize(width, height, false);
      updatePixelScale();
    },
    dispose() {
      skyNoise.dispose();
    },
  };
  return environment;
}
