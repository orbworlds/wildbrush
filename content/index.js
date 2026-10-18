/**
 * Content system: builds the trials, the Perch, the smudge camps and the world dressing, and wires trial completion to toasts, events, the Perch and the finale. Applies the trials, perch and warp URL presets and updates all content each frame.
 */
import { AdditiveBlending, Color, Sprite, SpriteMaterial, Vector3 } from 'three';
import { COLORS, PALETTE } from '../core/config.js';
import { Hints } from '../shared/hints.js';
import { InkPlants } from '../shared/ink.js';
import { Motes } from '../shared/motes.js';
import { ParticleMode, Particles } from '../shared/particles.js';
import { glowTexture, rng, safe } from '../shared/util.js';
import { Finale } from './finale.js';
import { buildBossHint, EliteHints } from './lair-hints.js';
import { createMaterials } from './materials.js';
import { Perch } from './perch.js';
import { applyClearings, setActiveBatch, Site, SiteBatch } from './site.js';
import { buildSmudgeCamps, spawnSmudgeCamps } from './smudge-camps.js';
import { TRIAL_DEFS, Trials } from './trials.js';
import { Wildlife } from './wildlife.js';
import { buildWorld } from './world.js';
export async function create(ctx) {
  const now = performance.now();
  const quality = ctx.settings.quality;
  const mats = createMaterials(ctx);
  const particles = new Particles(ctx, quality === 'low' ? 500 : 1000);
  const hints = new Hints(ctx);
  const inkPlants = new InkPlants(ctx, particles);
  const trials = new Trials(ctx, mats, particles, hints, inkPlants);
  const batch = new SiteBatch(72);
  setActiveBatch(batch);
  trials.build();
  const perch = safe('perch', () => new Perch(ctx, mats, particles, hints, trials.trials)) ?? null;
  if (perch) trials.warps.summit = perch.warp;
  const world = safe('world', () => buildWorld(ctx, mats, hints, inkPlants));
  const camps = safe('encounters', () => buildSmudgeCamps(ctx, mats, hints)) ?? [];
  safe('boss hint', () => {
    const site = new Site(ctx, 'boss-hint');
    buildBossHint(ctx, site, hints);
    site.build(mats);
  });
  setActiveBatch(null);
  safe('batch', () => batch.flush(mats, ctx.scene));
  safe('ink', () => inkPlants.build());
  const t0 = performance.now();
  const clearings = safe('clearings', () => applyClearings(ctx)) ?? [];
  const clearMs = performance.now() - t0;
  const moteDefs = [...(world?.motes ?? [])];
  const grove = ctx.terrain.landmarks.grove;
  moteDefs.push({
    x: grove.x,
    y: grove.y,
    z: grove.z,
    radius: 18,
    height: 3.5,
    count: 70,
    color: 0xffe79a,
    size: 0.08,
    kind: 1,
    ground: true,
  });
  moteDefs.push({
    x: grove.x,
    y: grove.y,
    z: grove.z,
    radius: 12,
    height: 2.5,
    count: 20,
    color: 0xff9a6a,
    size: 0.06,
    kind: 2,
    ground: true,
  });
  for (const trial of trials.trials)
    moteDefs.push({
      x: trial.touch.x,
      y: trial.daisTop,
      z: trial.touch.z,
      radius: 6,
      height: 3,
      count: 14,
      color: PALETTE[trial.def.color].hex,
      size: 0.06,
      kind: 0,
    });
  const motes = safe('motes', () => new Motes(ctx, moteDefs, rng('motes'), quality === 'low' ? 0.5 : 1));
  const life = safe(
    'life',
    () => new Wildlife(ctx, particles, world?.meadows ?? [ctx.terrain.landmarks.spawn.clone()]),
  );
  const finale = safe('finale', () => new Finale(ctx, trials.trials));
  const eliteHints = safe('elite hints', () => new EliteHints(ctx, mats, hints));
  const campFire = world?.campFire ?? null;
  let fireGlow = null;
  if (campFire) {
    fireGlow = new Sprite(
      new SpriteMaterial({
        map: glowTexture(),
        color: 0xff9a4a,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.55,
        fog: false,
      }),
    );
    fireGlow.position.copy(campFire).add(new Vector3(0, 0.5, 0));
    fireGlow.scale.setScalar(2.4);
    ctx.scene.add(fireGlow);
  }
  if (world?.lantern) {
    const lanternGlow = new Sprite(
      new SpriteMaterial({
        map: glowTexture(),
        color: 0xffc070,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0.45,
        fog: false,
      }),
    );
    lanternGlow.position.copy(world.lantern);
    lanternGlow.scale.setScalar(1.3);
    ctx.scene.add(lanternGlow);
  }
  const flameColor = new Color(1, 0.55, 0.15);
  const sparkColor = new Color(1, 0.82, 0.35);
  let flameAcc = 0;
  const failures = {};
  const safeUpdate = (key, fn) => {
    if (!((failures[key] ?? 0) > 20))
      try {
        fn();
      } catch (err) {
        failures[key] = (failures[key] ?? 0) + 1;
        if (failures[key] <= 3) console.warn(`[content] ${key} update failed`, err);
      }
  };
  const timers = [];
  const after = (delay, fn) =>
    timers.push({
      t: delay,
      fn,
    });
  const attempt = (label, fn) => {
    try {
      fn();
    } catch (err) {
      console.warn(`[content] ${label} failed`, err);
    }
  };
  let allDone = false;
  let started = false;
  const lateEvents = [];
  const onAllComplete = (instant) => {
    if (!allDone) {
      allDone = true;
      if (instant) {
        finale?.start(true);
        attempt('all-shrines vitality', () => ctx.paint.bloomVitality(new Vector3(0, 0, 0), 260, 0.1));
        attempt('perch awaken', () => (perchMode === 'awaken' ? perch?.awaken(false, 2.5) : perch?.awaken(true)));
        return;
      }
      after(3.8, () => {
        attempt('all-shrines event', () => ctx.events.emit('content:all-shrines', {}));
        attempt('all-shrines vitality', () => ctx.paint.bloomVitality(new Vector3(0, 0, 0), 260, 8));
        attempt('all-shrines audio', () => ctx.audio.play('all-shrines'));
        attempt('all-shrines toast', () =>
          ctx.ui.toast('The island breathes again', 'All four Prisms blaze. Colour has come home.'),
        );
        finale?.start(false);
        attempt('perch awaken', () => perch?.awaken(false, 6));
      });
    }
  };
  trials.onComplete = (trial, instant) => {
    const colorName = PALETTE[trial.def.color].name;
    attempt('perch socket', () => perch?.light(trial.def.color, instant));
    const pos = trial.prism?.position.clone() ?? trial.site.clone();
    attempt('player control', () => ctx.player.setControlEnabled(true));
    if (instant) attempt('shrine vitality', () => ctx.paint.bloomVitality(trial.site.clone(), 70, 0.1));
    else {
      attempt('shrine audio', () =>
        ctx.audio.play('shrine-complete', {
          position: pos,
        }),
      );
      attempt('shrine vitality', () => ctx.paint.bloomVitality(trial.site.clone(), 70, 4));
      after(0.6, () =>
        attempt('shrine toast', () => ctx.ui.toast(`${colorName} Trial Complete`, trial.def.line, trial.def.color)),
      );
    }
    const emitComplete = () =>
      ctx.events.emit('content:shrine-complete', {
        id: trial.def.id,
        name: colorName,
        position: pos,
        color: trial.def.color,
      });
    if (instant && !started) lateEvents.push(emitComplete);
    else attempt('shrine event', emitComplete);
    if (trials.completeCount >= TRIAL_DEFS.length) onAllComplete(instant);
  };
  const baseComplete = trials.complete.bind(trials);
  trials.complete = (color, instant) => {
    if (!instant) {
      attempt('player control', () => ctx.player.setControlEnabled(false));
      after(3, () => attempt('player control', () => ctx.player.setControlEnabled(true)));
    }
    baseComplete(color, instant);
  };
  const perchMode = ctx.params.get('perch');
  const trialParams = (ctx.params.get('trials') ?? '').split(',').filter(Boolean);
  if (perchMode === 'awake' || perchMode === 'claimed' || perchMode === 'awaken') trialParams.push('all');
  const colorById = {
    bloom: 'green',
    frost: 'blue',
    spring: 'yellow',
    ember: 'red',
  };
  const presetColors = new Set();
  for (const preset of trialParams)
    if (preset === 'all') COLORS.forEach((color) => presetColors.add(color));
    else if (COLORS.includes(preset)) presetColors.add(preset);
    else if (colorById[preset]) presetColors.add(colorById[preset]);
  for (const color of presetColors) {
    trials.complete(color, true);
    if (color === 'red') trials.bramble?.burnt();
  }
  if (perchMode === 'claimed') attempt('perch claimed', () => perch?.setClaimed());
  const warp = (target) => {
    const camp = target.startsWith('camp-') ? camps.find((c) => `camp-${c.id}` === target) : undefined;
    if (camp) {
      attempt('warp', () => ctx.player.teleport(camp.warp.pos.clone(), camp.warp.facing));
      return;
    }
    const landmark = ctx.terrain.landmarks[target];
    if (!landmark) return;
    const warpDef = trials.warps[target];
    let pos;
    let facing = Math.PI;
    if (warpDef) {
      pos = warpDef.pos.clone();
      facing = warpDef.facing;
    } else {
      pos = landmark.clone().add(new Vector3(0, 0, 6));
      pos.y = Math.max(ctx.terrain.heightAt(pos.x, pos.z), ctx.water?.level ?? 0) + 0.3;
    }
    attempt('warp', () => ctx.player.teleport(pos, facing));
  };
  const warpTarget = ctx.params.get('warp');
  let warpFrames =
    warpTarget && (ctx.terrain.landmarks[warpTarget] || camps.some((c) => `camp-${c.id}` === warpTarget)) ? 3 : 0;
  if (warpFrames && warpTarget) {
    warp(warpTarget);
    ctx.events.on('game:start', () => warp(warpTarget));
  }
  const readyMs = Math.round(performance.now() - now);
  console.info(`[content] ready in ${readyMs}ms (${clearings.length} grass clearings, ${Math.round(clearMs)}ms)`);
  if (ctx.shotMode || ctx.debug) {
    globalThis.__content = {
      readyMs,
      clearMs: Math.round(clearMs),
      clearings: clearings.length,
    };
    globalThis.__wbPerch = perch;
  }
  return {
    get shrinesTotal() {
      return TRIAL_DEFS.length;
    },
    get shrinesComplete() {
      return trials.completeCount;
    },
    get trials() {
      return trials;
    },
    get ink() {
      return inkPlants;
    },
    camps,
    perch,
    clearings,
    debugComplete(which, instant = false) {
      const colors = which === 'all' ? COLORS : [which];
      for (const color of colors) {
        trials.complete(color, instant);
        if (color === 'red' && instant) trials.bramble?.burnt();
      }
    },
    warp,
    update(dt) {
      if (!started) {
        started = true;
        for (const fn of lateEvents.splice(0)) attempt('late event', fn);
        attempt('spawn camps', () => spawnSmudgeCamps(ctx, camps));
        if (allDone && trials.completeCount >= TRIAL_DEFS.length)
          attempt('all-shrines event', () => ctx.events.emit('content:all-shrines', {}));
        if (perchMode === 'claimed')
          attempt('perch item', () => {
            if (!ctx.player.hasItem('brushflight')) ctx.player.giveItem('brushflight');
          });
      }
      if (warpFrames > 0 && warpTarget) {
        warpFrames--;
        warp(warpTarget);
      }
      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt;
        if (timers[i].t <= 0) {
          const timer = timers[i];
          timers.splice(i, 1);
          attempt('timer', timer.fn);
        }
      }
      let prismNear = false;
      safeUpdate('trials', () => (prismNear = trials.update(dt)));
      safeUpdate('hints', () => hints.update());
      safeUpdate('ink', () => inkPlants.update(dt, prismNear));
      safeUpdate('life', () => life?.update(dt));
      safeUpdate('finale', () => finale?.update(dt));
      safeUpdate('perch', () => perch?.update(dt));
      safeUpdate('elite hints', () => eliteHints?.update(dt));
      if (campFire && fireGlow && dt > 0) {
        for (flameAcc += dt * 22; flameAcc > 1;) {
          --flameAcc;
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.random() * 0.25;
          particles.spawn({
            x: campFire.x + Math.cos(angle) * radius,
            y: campFire.y + 0.15,
            z: campFire.z + Math.sin(angle) * radius,
            vy: 0.8 + Math.random() * 0.8,
            mode: ParticleMode.Rise,
            drag: 0.8,
            color: Math.random() < 0.5 ? flameColor : sparkColor,
            bright: 1.6,
            size: 0.18 + Math.random() * 0.18,
            life: 0.45 + Math.random() * 0.35,
          });
        }
        if (Math.random() < dt * 3)
          particles.spawn({
            x: campFire.x,
            y: campFire.y + 0.4,
            z: campFire.z,
            vx: (Math.random() - 0.5) * 0.4,
            vy: 1.5 + Math.random() * 1.5,
            vz: (Math.random() - 0.5) * 0.4,
            mode: ParticleMode.Rise,
            color: sparkColor,
            bright: 3,
            size: 0.04,
            life: 2,
          });
        const flicker = 0.85 + 0.15 * Math.sin(ctx.time.elapsed * 13) * Math.sin(ctx.time.elapsed * 7.3);
        fireGlow.scale.setScalar(2.2 * flicker);
        fireGlow.material.opacity = 0.5 * flicker;
      }
    },
    lateUpdate() {
      safeUpdate('particles', () => particles.update(ctx.time.dt));
      safeUpdate('motes', () => motes?.update(ctx));
    },
    dispose() {
      trials.bramble?.dispose();
      mats.dispose();
    },
  };
}
