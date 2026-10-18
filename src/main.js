/**
 * Boot: sets up the renderer, Rapier and the shared ctx, creates each system in order (falling back to its stub), warms up the shaders and runs the frame loop.
 */
import {
  ACESFilmicToneMapping,
  HalfFloatType,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { GUI } from 'lil-gui';
import { ColliderRegistry } from './core/colliders.js';
import { GRAVITY_Y } from './core/config.js';
import { EventBus } from './core/events.js';
import { Input } from './core/input.js';
import { InteriorManager } from './core/interiors.js';
import { loadSettings } from './core/settings.js';
import { createGlobalUniforms, installShaderChunks } from './core/shaders.js';
import { STUBS } from './core/stubs.js';
import { SYSTEM_LOADERS, SYSTEM_ORDER } from './core/systems.js';
import { createMultiplayer } from './orb/multiplayer.js';
import { Wardrobe } from './orb/wardrobe.js';
async function boot() {
  const bootStart = performance.now();
  const params = new URLSearchParams(location.search);
  const app = document.getElementById('app');
  const renderer = new WebGLRenderer({
    antialias: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.domElement.tabIndex = 0;
  app.appendChild(renderer.domElement);
  const scene = new Scene();
  const camera = new PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2500);
  const rapierStart = performance.now();
  await RAPIER.init();
  const rapierMs = Math.round(performance.now() - rapierStart);
  const world = new RAPIER.World({
    x: 0,
    y: GRAVITY_Y,
    z: 0,
  });
  const eventQueue = new RAPIER.EventQueue(true);
  installShaderChunks();
  const events = new EventBus();
  const timeFx = {
    hitStop: 0,
    slowScale: 1,
    slowLeft: 0,
    slowTotal: 0,
  };
  const ctx = {
    params,
    renderer,
    scene,
    camera,
    RAPIER,
    physics: world,
    colliders: new ColliderRegistry(),
    events,
    input: new Input(renderer.domElement, events),
    time: {
      elapsed: 0,
      dt: 0,
      realDt: 0,
      scale: 1,
      frame: 0,
      hitStop(seconds) {
        if (Number.isFinite(seconds)) timeFx.hitStop = Math.min(0.35, Math.max(timeFx.hitStop, seconds));
      },
      slowMo(scale, duration) {
        if (Number.isFinite(scale) && Number.isFinite(duration)) {
          timeFx.slowScale = Math.min(1, Math.max(0.02, scale));
          timeFx.slowLeft = Math.min(10, Math.max(0, duration));
          timeFx.slowTotal = timeFx.slowLeft;
          if (timeFx.slowLeft > 0)
            events.emit('combat:slowmo', {
              active: true,
              scale: timeFx.slowScale,
            });
        }
      },
    },
    globals: createGlobalUniforms(),
    settings: loadSettings(params),
    debug: params.has('debug')
      ? new GUI({
          title: 'Wildbrush debug',
        })
      : null,
    shotMode: params.has('shot'),
  };
  ctx.interiors = new InteriorManager(ctx);
  // Orb: looks sold for credits (before the systems: the pause menu lists them)
  ctx.wardrobe = new Wardrobe(ctx);
  const errors = [];
  const services = {};
  const perf = {
    fps: 0,
    frameMs: 0,
    calls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  };
  window.__wb = {
    ctx,
    ready: false,
    perf,
    errors,
    services,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    async hold(code, ms) {
      ctx.input.inject(code, true);
      await new Promise((resolve) => setTimeout(resolve, ms));
      ctx.input.inject(code, false);
    },
    async tap(code) {
      await window.__wb.hold(code, 60);
    },
  };
  const real = params.get('real');
  const realSystems = new Set(real ? real.split(',').filter(Boolean) : SYSTEM_ORDER);
  for (const key of (params.get('stub') ?? '').split(',').filter(Boolean)) realSystems.delete(key);
  const systems = [];
  const loadingLabels = {
    environment: 'Painting the sky',
    paint: 'Mixing the paints',
    terrain: 'Shaping the island',
    water: 'Filling the sea',
    vegetation: 'Growing the meadows',
    sky: 'Raising the Aerie',
    enemies: 'Waking the Smudges',
    boss: 'Something stirs in the north',
    player: 'Finding the hero',
    content: 'Building the ruins',
    ui: 'Framing the canvas',
    audio: 'Tuning the wind',
  };
  const bootLoading = document.getElementById('boot-loading');
  const setProgress = (label, fraction) => {
    if (bootLoading) bootLoading.textContent = `${label.toUpperCase()}…  ${Math.round(fraction * 100)}%`;
  };
  const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const bootTimes = {
    bootStartAt: Math.round(bootStart),
    rapier: rapierMs,
  };
  let loaded = 0;
  for (const key of SYSTEM_ORDER) {
    setProgress(loadingLabels[key] ?? 'Loading', (loaded++ / SYSTEM_ORDER.length) * 0.85);
    await nextTick();
    let sys;
    const importStart = performance.now();
    if (realSystems.has(key))
      try {
        const mod = await SYSTEM_LOADERS[key]();
        const createStart = performance.now();
        sys = await mod.create(ctx);
        bootTimes[key] = Math.round(performance.now() - createStart);
        bootTimes[key + ':import'] = Math.round(createStart - importStart);
        services[key] = sys.isStub ? 'stub' : 'real';
      } catch (err) {
        console.error(`[boot] real "${key}" failed to create — falling back to stub`, err);
        errors.push(`[${key}] create failed: ${err?.stack ?? err}`);
        sys = await STUBS[key](ctx);
        services[key] = 'stub-fallback';
      }
    else {
      sys = await STUBS[key](ctx);
      services[key] = 'stub';
    }
    ctx[key] = sys;
    systems.push({
      key,
      sys,
      errors: 0,
      disabled: false,
    });
  }
  // Orb: playing together, and the scarf from the wardrobe, run in the frame loop like the systems
  ctx.wardrobe.apply();
  ctx.multiplayer = createMultiplayer(ctx);
  for (const [key, sys] of [
    ['wardrobe', ctx.wardrobe],
    ['multiplayer', ctx.multiplayer],
  ])
    systems.push({
      key,
      sys,
      errors: 0,
      disabled: false,
    });
  console.info('[boot] services', services);
  setProgress('Warming up the brushes', 0.9);
  await nextTick();
  const compileStart = performance.now();
  const target = new WebGLRenderTarget(4, 4, {
    type: HalfFloatType,
  });
  try {
    renderer.setRenderTarget(target);
    await Promise.race([renderer.compileAsync(scene, camera), new Promise((resolve) => setTimeout(resolve, 20000))]);
  } catch (err) {
    console.warn('[boot] compileAsync failed', err);
  } finally {
    renderer.setRenderTarget(null);
    target.dispose();
  }
  bootTimes.compileAsync = Math.round(performance.now() - compileStart);
  bootTimes.programsAfterCompile = renderer.info.programs?.length ?? 0;
  bootTimes.loopStartAt = Math.round(performance.now());
  setProgress('Almost there', 0.97);
  await nextTick();
  console.info('[boot] create ms', bootTimes);
  window.__wb.bootTimes = bootTimes;
  const onResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    ctx.environment.setSize(width, height);
  };
  window.addEventListener('resize', onResize);
  onResize();
  const parseVec3 = (str) => {
    if (!str) return null;
    const [x, y, z] = str.split(',').map(Number);
    return [x, y, z].every(Number.isFinite) ? new Vector3(x, y, z) : null;
  };
  const camPos = parseVec3(params.get('cam'));
  const camLook = parseVec3(params.get('look'));
  let statsEl = null;
  if (params.has('stats')) {
    statsEl = document.createElement('div');
    statsEl.style.cssText =
      'position:fixed;left:8px;top:8px;z-index:1000;font:12px/1.4 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,.55);padding:6px 8px;border-radius:6px;pointer-events:none;white-space:pre';
    document.body.appendChild(statsEl);
  }
  const callSystems = (method, dt) => {
    for (const entry of systems) {
      const fn = entry.sys[method];
      if (fn && !entry.disabled)
        try {
          fn.call(entry.sys, dt);
        } catch (err) {
          entry.errors++;
          if (entry.errors <= 3) {
            console.error(`[loop] ${entry.key}.${method} threw`, err);
            errors.push(`[${entry.key}.${method}] ${err?.stack ?? err}`);
          }
          if (entry.errors > 60) {
            entry.disabled = true;
            console.error(`[loop] disabling ${entry.key} after repeated errors`);
          }
        }
    }
  };
  let lastTime = performance.now();
  let fpsTime = 0;
  let fpsFrames = 0;
  const firstFrames = [];
  window.__wb.firstFrames = firstFrames;
  const loop = (now) => {
    requestAnimationFrame(loop);
    const frameStart = performance.now();
    const realDt = Math.min((now - lastTime) / 1000, 0.1);
    lastTime = now;
    const time = ctx.time;
    time.realDt = realDt;
    let fxScale = 1;
    if (timeFx.hitStop > 0) {
      timeFx.hitStop -= realDt;
      fxScale = 0.03;
    }
    if (timeFx.slowLeft > 0 && time.scale > 0) {
      timeFx.slowLeft -= realDt;
      if (timeFx.slowLeft <= 0)
        events.emit('combat:slowmo', {
          active: false,
          scale: 1,
        });
      const fade = Math.min(1, Math.max(0, timeFx.slowLeft / Math.min(0.3, timeFx.slowTotal || 0.3)));
      fxScale = Math.min(fxScale, 1 - (1 - timeFx.slowScale) * fade);
    }
    time.dt = Math.min(realDt, 1 / 30) * time.scale * fxScale;
    time.elapsed += time.dt;
    time.frame++;
    ctx.input.beginFrame(realDt);
    ctx.globals.uTime.value = time.elapsed;
    callSystems('update', time.dt);
    if (time.dt > 0) {
      world.timestep = time.dt;
      world.step(eventQueue);
      eventQueue.drainCollisionEvents((handle1, handle2, started) =>
        events.emit('physics:collision', {
          handle1,
          handle2,
          started,
        }),
      );
    }
    callSystems('lateUpdate', time.dt);
    try {
      ctx.interiors.update();
    } catch (err) {
      if (errors.length < 50) errors.push(`[interiors] ${err?.stack ?? err}`);
    }
    if (camPos) {
      camera.position.copy(camPos);
      if (camLook) camera.lookAt(camLook);
    }
    ctx.globals.uCameraPos.value.copy(camera.position);
    ctx.globals.uPlayerPos.value.copy(ctx.player.state.position);
    try {
      ctx.environment.render(time.dt);
    } catch (err) {
      if (errors.length < 50) errors.push(`[render] ${err?.stack ?? err}`);
      renderer.render(scene, camera);
    }
    ctx.input.endFrame();
    if (firstFrames.length < 30) firstFrames.push(Math.round(performance.now() - frameStart));
    fpsTime += realDt;
    fpsFrames++;
    if (fpsTime > 0.5) {
      perf.fps = Math.round(fpsFrames / fpsTime);
      perf.frameMs = +((fpsTime / fpsFrames) * 1000).toFixed(1);
      fpsTime = 0;
      fpsFrames = 0;
      const info = renderer.info;
      perf.calls = info.render.calls;
      perf.triangles = info.render.triangles;
      perf.geometries = info.memory.geometries;
      perf.textures = info.memory.textures;
      if (statsEl)
        statsEl.textContent = `${perf.fps} fps  ${perf.frameMs} ms\ncalls ${perf.calls}  tris ${(perf.triangles / 1000).toFixed(0)}k`;
    }
    if (time.frame === 20) {
      window.__wb.ready = true;
      events.emit('game:ready', {});
      const bootLoading = document.getElementById('boot-loading');
      if (bootLoading) {
        bootLoading.style.opacity = '0';
        setTimeout(() => bootLoading.remove(), 900);
      }
    }
  };
  requestAnimationFrame(loop);
}
boot().catch((err) => {
  console.error('[boot] fatal', err);
  const bootLoading = document.getElementById('boot-loading');
  if (bootLoading) bootLoading.textContent = 'FAILED TO START — see console';
});
