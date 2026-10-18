/**
 * The UI system: builds the HUD layers and overlays, runs the title, pause and colour-wheel flows, routes game events to the widgets, and exposes toasts, prompts and fades.
 */
import { Vector3 } from 'three';
import { DEFAULT_COLOR, PALETTE } from '../core/config.js';
import { skyFactor } from '../shared/skyground.js';
import { AlertMarks } from './alerts.js';
import { AreaCard, areaVariant } from './area-card.js';
import { ArtChargeMeter, artCost, chargingArt } from './art-charge.js';
import { ArtTips } from './art-tips.js';
import { BossHud, EliteBanner } from './boss-hud.js';
import { paperGrain } from './brush.js';
import { ColorWheel } from './color-wheel.js';
import { CombatFx } from './combat-fx.js';
import { CombatTips } from './combat-tips.js';
import { Compass } from './compass.js';
import { ControlsHint } from './controls-hint.js';
import { Crosshair } from './crosshair.js';
import { el, setClass } from './dom.js';
import { FlightHud } from './flight-hud.js';
import { FlightTips } from './flight-tips.js';
import { Hearts } from './hearts.js';
import { InkPalette } from './ink-palette.js';
import { ItemBanner } from './item-banner.js';
import { LockOn } from './lock-on.js';
import { RelockPrompt, ScreenFade } from './overlays.js';
import { PauseMenu } from './pause-menu.js';
import { Prompts } from './prompts.js';
import { PuzzleCard } from './puzzle-card.js';
import { StaminaRing } from './stamina-ring.js';
import { TitleScreen } from './title-screen.js';
import { Toasts } from './toasts.js';
import { TrialsHud, TrialTracker } from './trials.js';
const CONTROLS_HINT_SECONDS = 150;
const WHEEL_TIME_SCALE = 0.15;
export async function create(ctx) {
  let uiRoot = document.getElementById('ui-root');
  if (!uiRoot) {
    uiRoot = document.createElement('div');
    uiRoot.id = 'ui-root';
    uiRoot.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10';
    document.body.appendChild(uiRoot);
  }
  const root = el('div', 'wb-ui', uiRoot);
  root.insertAdjacentHTML(
    'afterbegin',
    `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
      <filter id="wb-rough" x="-15%" y="-15%" width="130%" height="130%">
        <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="7" result="n"/>
        <feDisplacementMap in="SourceGraphic" in2="n" scale="2.4" xChannelSelector="R" yChannelSelector="G"/>
      </filter></defs></svg>`,
  );
  const updateScale = () => {
    const scale = Math.min(1.6, Math.max(0.74, window.innerHeight / 900, Math.min(window.innerWidth / 1600, 1)));
    root.style.setProperty('--s', scale.toFixed(3));
  };
  updateScale();
  for (const font of [
    '700 32px Cinzel',
    '400 20px Cinzel',
    '600 20px Cinzel',
    '700 16px "Nunito Variable"',
    'italic 500 16px "Nunito Variable"',
  ])
    document.fonts?.load(font).catch(() => undefined);
  const flags = new Set((ctx.params.get('ui') ?? '').split(',').filter(Boolean));
  const playSound = (id) => {
    try {
      ctx.audio?.play?.(id);
    } catch {}
  };
  const setControlEnabled = (enabled) => {
    try {
      const player = ctx.player;
      if (typeof player?.setInputHold == 'function') player.setInputHold('ui', !enabled);
      else player?.setControlEnabled?.(enabled);
    } catch (err) {
      console.warn('[ui] setControlEnabled failed', err);
    }
  };
  const grainURL = paperGrain(180, 'ui-grain');
  const tracker = new TrialTracker(ctx);
  const fxUnder = el('div', 'wb-layer wb-fxhost', root);
  const hud = el('div', 'wb-layer wb-hud hidden', root);
  const lockOn = new LockOn(hud, ctx);
  const alerts = new AlertMarks(hud, ctx);
  const compass = new Compass(hud, ctx, tracker);
  const hearts = new Hearts(hud, ctx);
  const trials = new TrialsHud(hud, tracker);
  const palette = new InkPalette(hud, ctx);
  const controlsHint = new ControlsHint(hud);
  const crosshair = new Crosshair(hud, ctx);
  const artCharge = new ArtChargeMeter(hud, ctx);
  const stamina = new StaminaRing(hud, ctx);
  const relock = new RelockPrompt(hud);
  const bossHud = new BossHud(hud, ctx);
  const eliteBanner = new EliteBanner(hud);
  const promptLayer = el('div', 'wb-layer wb-hud hidden', root);
  const prompts = new Prompts(promptLayer);
  const fxOver = el('div', 'wb-layer wb-fxhost', root);
  const bannerLayer = el('div', 'wb-layer', root);
  const areaBanner = new AreaCard(bannerLayer);
  const puzzleBanner = new PuzzleCard(bannerLayer);
  const itemBanner = new ItemBanner(bannerLayer, ctx);
  const combatFx = new CombatFx(fxUnder, fxOver, ctx);
  const flight = new FlightHud(hud, fxUnder, ctx);
  const wheel = new ColorWheel(root, ctx);
  const fader = new ScreenFade(root);
  const toasts = new Toasts(el('div', 'wb-layer', root));
  const pauseMenu = new PauseMenu(root, ctx, tracker, {
    resume: () => requestResume(),
  });
  pauseMenu.root.querySelector('.pz-grain').style.backgroundImage = `url(${grainURL})`;
  const showTitle = (!ctx.shotMode || flags.has('title')) && !flags.has('off');
  let started = !showTitle;
  let paused = false;
  let wheelOpen = false;
  let scaleBeforePause = 1;
  let scaleBeforeWheel = 1;
  let pausedAt = 0;
  let resuming = false;
  let resumeBy = 0;
  let playTime = 0;
  let hintOverride = flags.has('hint') ? true : null;
  let unlockedFor = 0;
  let controlOn = null;
  const uiOff = flags.has('off');
  if (uiOff) root.style.display = 'none';
  const allowControl = (on) => {
    if (controlOn !== on) {
      controlOn = on;
      setControlEnabled(on);
    }
  };
  const syncLayers = () => {
    setClass(hud, 'hidden', uiOff || !started || paused);
    setClass(fxUnder, 'hidden', uiOff);
    setClass(fxOver, 'hidden', uiOff);
    setClass(promptLayer, 'hidden', !started || paused || wheelOpen);
    compass.root.style.opacity = wheelOpen ? '0.25' : '';
    trials.root.style.visibility = wheelOpen ? 'hidden' : '';
    palette.root.style.visibility = wheelOpen ? 'hidden' : '';
  };
  let titleScreen = null;
  if (showTitle) {
    allowControl(false);
    titleScreen = new TitleScreen(root, grainURL, () => {
      if (!started) {
        try {
          ctx.input.requestPointerLock();
        } catch {}
        started = true;
        allowControl(true);
        ctx.events.emit('game:start', {});
        playSound('ui-click');
        titleScreen?.hide();
        setTimeout(() => {
          syncLayers();
          trials.poke();
        }, 550);
      }
    });
    const fontsReady = Promise.race([
      Promise.all([
        document.fonts.load('700 64px Cinzel'),
        document.fonts.load('400 24px Cinzel'),
        document.fonts.load('800 16px "Nunito Variable"'),
      ]).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
    let ready = false;
    ctx.events.once('game:ready', () => {
      ready = true;
      fontsReady.then(() => setTimeout(() => titleScreen?.play(), 450));
    });
    setTimeout(() => {
      if (!ready) titleScreen?.play();
    }, 6000);
  } else ctx.events.once('game:ready', () => ctx.events.emit('game:start', {}));
  syncLayers();
  const openPause = (tab = 'journal') => {
    if (!paused && started) {
      if (wheelOpen) closeWheel(false);
      paused = true;
      pausedAt = performance.now();
      resuming = false;
      scaleBeforePause = ctx.time.scale > 0 ? ctx.time.scale : 1;
      ctx.time.scale = 0;
      allowControl(false);
      if (ctx.input.pointerLocked) ctx.input.exitPointerLock();
      pauseMenu.open(tab);
      syncLayers();
      ctx.events.emit('game:pause', {
        paused: true,
      });
    }
  };
  const closePause = () => {
    if (paused) {
      paused = false;
      resuming = false;
      ctx.time.scale = scaleBeforePause > 0 ? scaleBeforePause : 1;
      allowControl(true);
      pauseMenu.close();
      syncLayers();
      ctx.events.emit('game:pause', {
        paused: false,
      });
    }
  };
  const requestResume = () => {
    if (paused) {
      if (ctx.shotMode || ctx.input.pointerLocked || ctx.input.usingGamepad) {
        closePause();
        return;
      }
      resuming = true;
      resumeBy = performance.now() + 1200;
      ctx.input.requestPointerLock();
    }
  };
  ctx.events.on('input:pointerlock', ({ locked }) => {
    if (locked) {
      unlockedFor = 0;
      if (paused) closePause();
      return;
    }
    if (started && !paused && !ctx.shotMode) openPause();
  });
  document.addEventListener('pointerlockerror', () => {
    if (resuming)
      setTimeout(() => {
        if (paused && !ctx.input.pointerLocked) {
          resuming = false;
          pauseMenu.nudgeResume();
        }
      }, 250);
  });
  ctx.renderer.domElement.addEventListener('mousedown', () => {
    if (started && !paused && !ctx.input.pointerLocked && !ctx.shotMode) ctx.input.requestPointerLock();
  });
  const currentColor = () => {
    const selectedColor = ctx.player?.state?.selectedColor;
    return selectedColor && PALETTE[selectedColor] ? selectedColor : DEFAULT_COLOR;
  };
  const openWheel = () => {
    wheelOpen = true;
    scaleBeforeWheel = ctx.time.scale > 0 ? ctx.time.scale : 1;
    ctx.time.scale = WHEEL_TIME_SCALE;
    wheel.open(currentColor());
    syncLayers();
    ctx.events.emit('ui:wheel', {
      open: true,
    });
  };
  function closeWheel(commit) {
    if (!wheelOpen) return;
    wheelOpen = false;
    const color = wheel.close();
    if (ctx.time.scale === WHEEL_TIME_SCALE) ctx.time.scale = scaleBeforeWheel;
    syncLayers();
    ctx.events.emit('ui:wheel', {
      open: false,
    });
    if (commit) {
      ctx.events.emit('ui:select-color', {
        color,
      });
      if (ctx.player?.isStub && ctx.player.state.selectedColor !== color) {
        ctx.player.state.selectedColor = color;
        ctx.events.emit('player:color', {
          color,
        });
      }
      playSound('ui-click');
    }
  }
  ctx.events.on('paint:ink-empty', ({ color }) => palette.flashEmpty(color));
  ctx.events.on('paint:ink-changed', () => palette.poke());
  ctx.events.on('player:color', ({ color }) => {
    if (PALETTE[color]) palette.select(color);
  });
  ctx.events.on('content:ink-refill', ({ color }) => palette.refill(color));
  ctx.events.on('player:exhausted', () => stamina.bump());
  ctx.events.on('content:shrine-complete', () => trials.poke());
  const combatTips = new CombatTips(
    ctx,
    (id, text, key) => prompts.show(id, text, key),
    (id) => prompts.hide(id),
  );
  const listen = (type, handler) =>
    ctx.events.on(type, (data) => {
      try {
        handler(data);
      } catch (err) {
        console.warn(`[ui] ${String(type)} handler failed`, err);
      }
    });
  const flightTips = new FlightTips(
    ctx,
    (id, text, key) => prompts.show(id, text, key),
    (id) => prompts.hide(id),
  );
  const artTips = new ArtTips(
    ctx,
    (id, text, key, sub) => prompts.show(id, text, key, sub),
    (id) => prompts.hide(id),
  );
  listen('combat:art', (art) => {
    if (art?.color && PALETTE[art.color]) artCharge.flash(art.color);
    palette.poke();
  });
  listen('paint:ink-empty', () => {
    if (chargingArt(ctx)) artCharge.shake();
    else artCharge.fizzle();
  });
  listen('player:hurt', (hurt) => combatFx.hurt(Number(hurt?.amount) || 0.5));
  listen('player:death', () => {
    combatFx.dead();
    alerts.clear();
  });
  listen('player:respawn', () => combatFx.clearDeath(fader.black));
  listen('combat:perfect-dodge', () => combatFx.masterstroke());
  listen('combat:flurry', (flurry) => combatFx.flurry(!!flurry?.active));
  listen('combat:lock', () => lockOn.poke());
  listen('item:get', (got) => {
    if (got?.item) itemBanner.onItem(got.item);
    if (got?.item === 'brushflight') {
      compass.removePerch();
      controlsHint.setRide(true);
    }
  });
  let perchAt = -1;
  listen('content:all-shrines', () => {
    perchAt = ctx.time.elapsed < 2 ? 0 : ctx.time.elapsed + 8.8;
  });
  listen('boss:start', (boss) => bossHud.onStart(String(boss?.name ?? '')));
  listen('boss:phase', (change) => bossHud.onPhase(Number(change?.phase) || 1));
  listen('boss:reset', () => bossHud.onReset());
  listen('boss:defeated', () => {
    bossHud.onDefeated();
    compass.bossDefeated();
  });
  let uiClock = 0;
  let areaShownAt = -99;
  let pendingInterior = null;
  const lastOutdoor = {
    x: 0,
    y: 0,
    z: 0,
    at: -99,
  };
  const interiorVariant = () => {
    try {
      const current = ctx.interiors?.current;
      return current ? areaVariant(current.id, current.name, current.kind) : '';
    } catch {
      return '';
    }
  };
  listen('area:enter', (area) => {
    if (!area?.name) return;
    areaShownAt = uiClock;
    if (pendingInterior && pendingInterior.at - uiClock > -0.4) pendingInterior = null;
    let kind;
    try {
      kind = ctx.interiors?.current?.kind;
    } catch {
      kind = undefined;
    }
    areaBanner.show(
      String(area.id ?? area.name),
      String(area.name),
      area.subtitle ? String(area.subtitle) : undefined,
      areaVariant(String(area.id ?? ''), String(area.name), kind),
    );
  });
  listen('interior:enter', (interior) => {
    if (!interior?.id) return;
    const variant = areaVariant(String(interior.id), String(interior.name ?? ''), interior.kind);
    compass.setIndoor(String(interior.id));
    if (uiClock - lastOutdoor.at < 4)
      try {
        compass.addEntrance(String(interior.id), variant, new Vector3(lastOutdoor.x, lastOutdoor.y, lastOutdoor.z));
      } catch {}
    if (uiClock - areaShownAt < 1 || !interior.name) return;
    let subtitle;
    try {
      const current = ctx.interiors?.current;
      if (current && current.id === interior.id && current.subtitle) subtitle = String(current.subtitle);
    } catch {
      subtitle = undefined;
    }
    pendingInterior = {
      id: `interior:${interior.id}`,
      name: String(interior.name),
      sub: subtitle,
      variant,
      at: uiClock + 0.9,
    };
  });
  listen('interior:exit', () => {
    try {
      if (!ctx.interiors?.current) compass.setIndoor(null);
    } catch {
      compass.setIndoor(null);
    }
  });
  listen('puzzle:solved', () => puzzleBanner.show(interiorVariant()));
  listen('elite:engage', (elite) => {
    if (typeof elite?.id != 'number') return;
    const inSky = !!elite.position && skyFactor(ctx, elite.position) > 0.5;
    const colorName = elite.element && PALETTE[elite.element] ? PALETTE[elite.element].name : '';
    eliteBanner.show(
      elite.id,
      String(elite.name ?? ''),
      elite.element,
      inSky ? `Sky Warden · Hoarder of ${colorName}` : undefined,
    );
    compass.addElite(elite.id, elite.element, elite.position);
  });
  listen('elite:defeated', (elite) => {
    if (typeof elite?.id == 'number') compass.removeElite(elite.id);
    const color = elite?.element && PALETTE[elite.element] ? elite.element : undefined;
    if (elite?.name)
      setTimeout(
        () =>
          toasts.push({
            title: `${elite.name} Falls`,
            subtitle: color ? `${PALETTE[color].name} flows back into the land.` : undefined,
            color,
          }),
        1400,
      );
  });
  listen('enemy:alert', (enemy) => {
    if (typeof enemy?.id == 'number') alerts.alert(enemy.id, enemy.position);
  });
  ctx.events.on('settings:changed', ({ settings }) => {
    hintOverride = settings.showControlsHint ? playTime > CONTROLS_HINT_SECONDS || null : false;
  });
  window.addEventListener('keydown', (ev) => {
    if (!(ev.code !== 'KeyH' || ev.repeat || !started || paused)) hintOverride = !controlsHint.shown;
  });
  window.addEventListener('resize', () => {
    updateScale();
    compass.layout();
  });
  ctx.events.once('game:ready', () => {
    const requestIdle = window.requestIdleCallback;
    const prepare = () => {
      try {
        pauseMenu.prepare();
      } catch (err) {
        console.warn('[ui] prepare failed', err);
      }
    };
    if (requestIdle)
      requestIdle(prepare, {
        timeout: 3000,
      });
    else setTimeout(prepare, 1500);
  });
  if (flags.has('pause') || flags.has('settings') || flags.has('controls') || flags.has('arts') || flags.has('wardrobe')) {
    const tab = flags.has('settings')
      ? 'settings'
      : flags.has('controls')
        ? 'controls'
        : flags.has('arts')
          ? 'arts'
          : flags.has('wardrobe')
            ? 'wardrobe'
            : 'journal';
    ctx.events.once('game:ready', () => setTimeout(() => openPause(tab), 50));
  }
  const holdWheel = flags.has('wheel');
  for (const place of ['cave', 'kiln', 'cistern']) {
    if (!flags.has(place)) continue;
    const titles = {
      cave: 'The Glowcap Caverns',
      kiln: 'The Kiln',
      cistern: 'The Frozen Cistern',
    };
    ctx.events.once('game:start', () =>
      setTimeout(
        () =>
          ctx.events.emit('interior:enter', {
            id: place === 'cave' ? 'glowcap' : place,
            name: titles[place],
            kind: place === 'cave' ? 'cave' : 'temple',
          }),
        900,
      ),
    );
  }
  if (flags.has('puzzle'))
    ctx.events.once('game:start', () =>
      setTimeout(
        () =>
          ctx.events.emit('puzzle:solved', {
            id: 'debug',
            area: 'debug',
            position: ctx.player.state.position.clone(),
          }),
        1200,
      ),
    );
  if (flags.has('area'))
    ctx.events.once('game:start', () =>
      setTimeout(
        () =>
          ctx.events.emit('area:enter', {
            id: 'aerie',
            name: 'The Painted Aerie',
            subtitle: 'Isles of the First Painters',
          }),
        900,
      ),
    );
  const updaters = [
    ['compass', () => compass.update()],
    ['trials', (dt) => trials.update(dt)],
    ['palette', (dt) => palette.update(dt)],
    ['cross', () => crosshair.update(started && !paused && !wheelOpen)],
    ['arts', (dt) => artCharge.update(dt, started && !paused && !wheelOpen)],
    ['artTips', () => artTips.update(started && !paused && !wheelOpen)],
    [
      'artCost',
      () => {
        const charging = started && !paused && !wheelOpen ? chargingArt(ctx) : null;
        if (!charging) return palette.preview(null);
        const art = artCost(ctx, charging.color);
        palette.preview(charging.color, art.cost, art.ink, art.inkMax);
      },
    ],
    ['stamina', (dt) => stamina.update(dt, started && !paused && !uiOff)],
    ['hearts', (dt) => hearts.update(dt)],
    ['lock', (dt) => lockOn.update(dt, started && !paused)],
    ['alerts', (dt) => alerts.update(dt, started && !paused)],
    ['cfx', (dt) => combatFx.update(dt, hearts.low && started)],
    ['tips', () => combatTips.update()],
    ['banner', (dt) => itemBanner.update(dt)],
    ['boss', (dt) => bossHud.update(dt, started && !paused)],
    ['elites', (dt) => eliteBanner.update(dt)],
    ['area', (dt) => areaBanner.update(dt, started && !paused && !uiOff)],
    ['puzzle', (dt) => puzzleBanner.update(dt, started && !paused && !uiOff)],
    [
      'interior',
      (dt) => {
        uiClock += dt;
        const pending = pendingInterior;
        if (pending && uiClock >= pending.at) {
          pendingInterior = null;
          areaBanner.show(pending.id, pending.name, pending.sub, pending.variant);
        }
        const state = ctx.player?.state;
        let indoors = false;
        try {
          indoors = !!ctx.interiors?.current;
        } catch {
          indoors = false;
        }
        if (state && !state.dead && !indoors && Number.isFinite(state.position.x)) {
          lastOutdoor.x = state.position.x;
          lastOutdoor.y = state.position.y;
          lastOutdoor.z = state.position.z;
          lastOutdoor.at = uiClock;
        }
      },
    ],
    ['flight', (dt) => flight.update(dt, started && !paused && !uiOff)],
    ['flightTips', (dt) => flightTips.update(dt, started && !paused)],
  ];
  const failures = {};
  let syncTimer = 0;
  return {
    get started() {
      return started;
    },
    toast(title, subtitle, color) {
      try {
        toasts.push({
          title: String(title ?? ''),
          subtitle,
          color,
        });
      } catch (err) {
        console.warn('[ui] toast failed', err);
      }
    },
    showPrompt(id, text, key) {
      try {
        prompts.show(id, text, key);
      } catch (err) {
        console.warn('[ui] prompt failed', err);
      }
    },
    hidePrompt(id) {
      try {
        prompts.hide(id);
      } catch {}
    },
    fade(black, duration) {
      return fader.run(!!black, duration);
    },
    update() {
      const input = ctx.input;
      if (!started) {
        if (titleScreen && input.usingGamepad && (input.pressed('jump') || input.pressed('pause'))) titleScreen.begin();
        return;
      }
      if (paused) {
        if (input.pressed('pause') && performance.now() - pausedAt > 300) requestResume();
        if (resuming && performance.now() > resumeBy) {
          resuming = false;
          if (!ctx.input.pointerLocked) pauseMenu.nudgeResume();
        }
        return;
      }
      if (input.pressed('pause')) {
        openPause();
        return;
      }
      const wantWheel = holdWheel || input.held('wheel');
      if (wantWheel && !wheelOpen) openWheel();
      else if (!wantWheel && wheelOpen) closeWheel(true);
      if (wheelOpen)
        try {
          wheel.update(ctx.time.realDt);
        } catch (err) {
          console.warn('[ui] wheel', err);
        }
    },
    lateUpdate() {
      const dt = Math.min(0.1, ctx.time.realDt || 0.016);
      for (const [key, tick] of updaters)
        if (!((failures[key] ?? 0) > 20))
          try {
            tick(dt);
          } catch (err) {
            failures[key] = (failures[key] ?? 0) + 1;
            if (failures[key] <= 2) console.warn(`[ui] ${key} update failed`, err);
          }
      if (started && !paused) playTime += dt;
      const autoHint = ctx.settings.showControlsHint && playTime < CONTROLS_HINT_SECONDS && !ctx.shotMode;
      controlsHint.set(started && !paused && !wheelOpen && (hintOverride ?? autoHint));
      unlockedFor =
        started &&
        !paused &&
        !ctx.shotMode &&
        !ctx.input.pointerLocked &&
        !ctx.input.usingGamepad &&
        (titleScreen?.dismissed ?? true)
          ? unlockedFor + dt
          : 0;
      relock.set(unlockedFor > 1.2 && !wheelOpen);
      syncTimer -= dt;
      if (syncTimer <= 0) {
        syncTimer = 1;
        tracker.sync();
        let canFly = false;
        try {
          canFly = !!ctx.player?.hasItem?.('brushflight');
        } catch {
          canFly = false;
        }
        controlsHint.setRide(canFly);
        if (canFly) compass.removePerch();
      }
      if (perchAt >= 0 && ctx.time.elapsed >= perchAt) {
        perchAt = -1;
        try {
          if (!ctx.player?.hasItem?.('brushflight')) compass.addPerch(ctx.terrain.landmarks.summit);
        } catch (err) {
          console.warn('[ui] perch mark failed', err);
        }
      }
    },
    dispose() {
      root.remove();
    },
  };
}
