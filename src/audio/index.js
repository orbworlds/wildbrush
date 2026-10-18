/**
 * Audio system entry: the named cues that other systems play through ctx.audio.play, and create(), which builds the engine, sound effects, ambience and music layers, wires game events to them and returns the audio API.
 */
import { ITEM_HOLD, SKY_MANTLE } from '../shared/combat-defs.js';
import { Ambience } from './ambience.js';
import { AreaAudio } from './areas.js';
import { ArtsSfx } from './arts.js';
import { BattleMusic } from './battle-music.js';
import { BossMusic } from './boss-music.js';
import { CombatSfx } from './combat.js';
import { AudioEngine, engDbToGain } from './engine.js';
import { FlightMusic, FlightSfx, PerchHum } from './flight.js';
import { ExplorationMusic } from './music.js';
import { Sfx, warnOnce } from './sfx.js';
import { SkyAudio } from './sky.js';
export const NAMED = {
  'shrine-activate': {
    id: 'st-shrine-activate',
    bus: 'stinger',
    db: -8,
    dedupe: 1.5,
    duck: [6, 3.5],
  },
  'shrine-complete': {
    id: 'st-shrine-complete',
    bus: 'stinger',
    db: -5,
    dedupe: 3,
    duck: [10, 5.5],
  },
  pickup: {
    id: 'st-pickup',
    bus: 'stinger',
    db: -10,
    dedupe: 0.08,
    duck: [3, 0.8],
  },
  'ink-refill': {
    id: 'st-ink-refill',
    bus: 'sfx',
    db: -9,
    positional: true,
    dedupe: 0.6,
  },
  'ui-click': {
    id: 'ui-click',
    bus: 'ui',
    db: -15,
    dedupe: 0.03,
    rateVar: 0.3,
  },
  'ui-hover': {
    id: 'ui-hover',
    bus: 'ui',
    db: -25,
    dedupe: 0.05,
    rateVar: 0.2,
  },
  'bramble-burn': {
    id: 'bramble-burn',
    bus: 'sfx',
    db: -6,
    positional: true,
    dedupe: 0.5,
    rateVar: 1,
  },
  'chest-open': {
    id: 'st-chest-open',
    bus: 'stinger',
    db: -6,
    dedupe: 1,
    duck: [9, 3.2],
  },
  secret: {
    id: 'st-secret',
    bus: 'stinger',
    db: -6,
    dedupe: 1.5,
    duck: [8, 3],
  },
  'all-shrines': {
    id: 'st-all-shrines',
    bus: 'stinger',
    db: -4,
    dedupe: 6,
    duck: [14, 8],
  },
  respawn: {
    id: 'st-respawn',
    bus: 'stinger',
    db: -12,
    dedupe: 1,
  },
  'wheel-open': {
    id: 'wheel-open',
    bus: 'ui',
    db: -16,
    dedupe: 0.1,
  },
  'wheel-close': {
    id: 'wheel-close',
    bus: 'ui',
    db: -18,
    dedupe: 0.1,
  },
  'pickup-heart': {
    id: 'pickup-heart',
    bus: 'stinger',
    db: -9,
    dedupe: 0.12,
    duck: [3, 0.8],
  },
  'pickup-ink': {
    id: 'pickup-ink',
    bus: 'sfx',
    db: -10,
    positional: true,
    dedupe: 0.06,
  },
  'lock-on': {
    id: 'lock-on',
    bus: 'ui',
    db: -13,
    dedupe: 0.06,
  },
  'lock-off': {
    id: 'lock-off',
    bus: 'ui',
    db: -19,
    dedupe: 0.06,
  },
  'alert-sting': {
    id: 'alert-sting',
    bus: 'stinger',
    db: -10,
    dedupe: 1.5,
  },
  'perfect-dodge': {
    id: 'perfect-dodge',
    bus: 'stinger',
    db: -6,
    dedupe: 0.4,
  },
  flurry: {
    id: 'flurry-run',
    bus: 'stinger',
    db: -8,
    dedupe: 0.8,
  },
  'hero-death': {
    id: 'hero-death',
    bus: 'stinger',
    db: -5,
    dedupe: 2,
  },
  'enemy-burst': {
    id: 'enemy-burst',
    bus: 'sfx',
    db: -6,
    positional: true,
    dedupe: 0.05,
  },
  shatter: {
    id: 'hit-shatter',
    bus: 'sfx',
    db: -4,
    positional: true,
    dedupe: 0.1,
  },
  'battle-sting': {
    id: 'bt-sting',
    bus: 'stinger',
    db: -8,
    dedupe: 2,
  },
  'boss-rise': {
    id: 'bs-rise',
    bus: 'sfx',
    db: -1,
    positional: true,
    dedupe: 2,
    duck: [5, 3.5],
    prio: 9,
  },
  'boss-roar': {
    id: 'bs-roar',
    bus: 'sfx',
    db: 0,
    positional: true,
    dedupe: 0.8,
    duck: [5, 1.8],
    prio: 9,
  },
  'boss-slam': {
    id: 'bs-slam',
    bus: 'sfx',
    db: -1,
    positional: true,
    dedupe: 0.12,
    prio: 8,
  },
  'boss-sweep': {
    id: 'bs-sweep',
    bus: 'sfx',
    db: -4,
    positional: true,
    dedupe: 0.25,
    prio: 7,
  },
  'boss-rain': {
    id: 'bs-rain',
    bus: 'sfx',
    db: -5,
    positional: true,
    dedupe: 1,
    prio: 7,
  },
  'boss-crystal': {
    id: 'bs-crystal',
    bus: 'sfx',
    db: -2,
    positional: true,
    dedupe: 0.3,
    prio: 8,
  },
  'boss-stagger': {
    id: 'bs-stagger',
    bus: 'sfx',
    db: -2,
    positional: true,
    dedupe: 0.8,
    prio: 8,
  },
  'boss-hurt': {
    id: 'bs-hurt',
    bus: 'sfx',
    db: -5,
    positional: true,
    dedupe: 0.25,
    rateVar: 0.8,
    prio: 7,
  },
  'boss-death': {
    id: 'bs-death',
    bus: 'stinger',
    db: -3,
    dedupe: 5,
    duck: [12, 6],
  },
  'barrier-up': {
    id: 'bs-barrier-up',
    bus: 'sfx',
    db: -4,
    positional: true,
    dedupe: 1,
    prio: 7,
  },
  'barrier-down': {
    id: 'bs-barrier-down',
    bus: 'sfx',
    db: -4,
    positional: true,
    dedupe: 1,
    prio: 7,
  },
  'chest-appear': {
    id: 'st-chest-appear',
    bus: 'stinger',
    db: -6,
    dedupe: 2,
    duck: [6, 2.5],
  },
  'item-get': {
    id: 'st-item-get',
    bus: 'stinger',
    db: -4,
    dedupe: 3,
    duck: [14, 3.6],
  },
  'heart-get': {
    id: 'st-heart-get',
    bus: 'stinger',
    db: -6,
    dedupe: 2,
    duck: [6, 2.2],
  },
  'elite-sting': {
    id: 'bt-elite-sting',
    bus: 'stinger',
    db: -7,
    dedupe: 3,
  },
  'perch-socket': {
    id: 'perch-socket',
    bus: 'sfx',
    db: -4,
    positional: true,
    dedupe: 0.5,
    prio: 6,
  },
  'perch-rumble': {
    id: 'st-perch-rumble',
    bus: 'sfx',
    db: -6,
    dedupe: 3,
    duck: [5, 3],
  },
  'perch-bloom': {
    id: 'st-perch-bloom',
    bus: 'stinger',
    db: -4,
    dedupe: 5,
    duck: [12, 7],
  },
  'perch-claim': {
    id: 'st-perch-claim',
    bus: 'stinger',
    db: -5,
    dedupe: 3,
    duck: [10, 3],
  },
  'fly-mount': {
    id: 'fl-mount',
    bus: 'sfx',
    db: -9,
    dedupe: 0.2,
  },
  'fly-dismount': {
    id: 'fl-dismount',
    bus: 'sfx',
    db: -11,
    dedupe: 0.2,
  },
  'fly-boost': {
    id: 'fl-boost-on',
    bus: 'sfx',
    db: -10,
    dedupe: 0.2,
  },
  'area-discover': {
    id: 'st-area',
    bus: 'stinger',
    db: -5,
    dedupe: 8,
    duck: [10, 5],
  },
  'vessel-get': {
    id: 'st-vessel',
    bus: 'stinger',
    db: -6,
    dedupe: 2,
    duck: [6, 2.4],
  },
  'mantle-get': {
    id: 'st-mantle',
    bus: 'stinger',
    db: -5,
    dedupe: 3,
    duck: [9, 3.4],
  },
  'vine-wrap': {
    id: 'vine-wrap',
    bus: 'sfx',
    db: -6,
    positional: true,
    dedupe: 0.3,
    rateVar: 0.8,
    prio: 6,
  },
  'vine-free': {
    id: 'vine-free',
    bus: 'sfx',
    db: -9,
    positional: true,
    dedupe: 0.3,
    rateVar: 1,
    prio: 4,
  },
  'wind-gust': {
    id: 'wind-gust',
    bus: 'sfx',
    db: -4,
    positional: true,
    dedupe: 0.3,
    rateVar: 0.6,
    prio: 7,
  },
  'storm-crackle': {
    id: 'storm-crackle',
    bus: 'sfx',
    db: -6,
    positional: true,
    dedupe: 0.06,
    rateVar: 1.2,
    prio: 6,
  },
  'sky-chime': {
    id: 'sky-chime',
    bus: 'amb',
    db: -14,
    dedupe: 0.3,
    rateVar: 0.4,
  },
  'puzzle-solved': {
    id: 'st-puzzle',
    bus: 'stinger',
    db: -5,
    dedupe: 1.2,
    duck: [8, 2.6],
  },
  'cave-enter': {
    id: 'st-cave-enter',
    bus: 'stinger',
    db: -7,
    dedupe: 5,
    duck: [8, 4],
  },
  'kiln-enter': {
    id: 'st-kiln-enter',
    bus: 'stinger',
    db: -6,
    dedupe: 5,
    duck: [8, 3.5],
  },
  'cistern-enter': {
    id: 'st-cistern-enter',
    bus: 'stinger',
    db: -6,
    dedupe: 5,
    duck: [8, 3.5],
  },
  'lantern-get': {
    id: 'st-lantern',
    bus: 'stinger',
    db: -6,
    dedupe: 2,
    duck: [6, 2.4],
  },
  'ember-crest-get': {
    id: 'st-ember-crest',
    bus: 'stinger',
    db: -6,
    dedupe: 2,
    duck: [7, 2.6],
  },
  'frost-crest-get': {
    id: 'st-frost-crest',
    bus: 'stinger',
    db: -6,
    dedupe: 2,
    duck: [7, 2.6],
  },
  'cloudstep-get': {
    id: 'st-cloudstep',
    bus: 'stinger',
    db: -6,
    dedupe: 2,
    duck: [6, 2.4],
  },
  'double-jump': {
    id: 'dbl-jump',
    bus: 'sfx',
    db: -7,
    positional: true,
    dedupe: 0.08,
    rateVar: 0.4,
    prio: 6,
  },
  'flame-ring': {
    id: 'flame-ring',
    bus: 'sfx',
    db: -6,
    positional: true,
    dedupe: 0.25,
    prio: 6,
  },
  'frost-crackle': {
    id: 'frost-crackle',
    bus: 'sfx',
    db: -10,
    positional: true,
    dedupe: 0.06,
    rateVar: 1,
    prio: 3,
  },
  'lantern-tinkle': {
    id: 'lantern-tinkle',
    bus: 'sfx',
    db: -16,
    positional: true,
    dedupe: 0.2,
    rateVar: 0.5,
    prio: 1,
  },
};
const ITEM_CUES = {
  lantern: 'lantern-get',
  emberCrest: 'ember-crest-get',
  frostCrest: 'frost-crest-get',
  cloudstep: 'cloudstep-get',
};
export async function create(ctx) {
  const params = ctx.params;
  const audioLevels = params.has('audiolevels');
  const eng = new AudioEngine(ctx, ctx.shotMode && !audioLevels);
  try {
    eng.bank.start(params.has('audionoworker'));
  } catch (err) {
    warnOnce('bank start', err);
  }
  eng.setVolumes(ctx.settings?.masterVolume ?? 0.8, ctx.settings?.musicVolume ?? 0.6);
  const sfx = new Sfx(ctx, eng);
  const amb = new Ambience(ctx, eng);
  const music = new ExplorationMusic(ctx, eng);
  const battle = new BattleMusic(ctx, eng, music);
  const bossMusic = new BossMusic(ctx, eng, music, battle);
  const combat = new CombatSfx(ctx, eng, battle);
  const arts = new ArtsSfx(ctx, eng);
  const flightSfx = new FlightSfx(ctx, eng);
  const perchHum = new PerchHum(ctx, eng);
  const flightMusic = new FlightMusic(ctx, eng, music, battle, bossMusic, flightSfx);
  const sky = new SkyAudio(ctx, eng, amb, music, (cue, pos) =>
    playNamed(
      cue,
      pos
        ? {
            position: pos,
          }
        : undefined,
    ),
  );
  const areas = new AreaAudio(ctx, eng, amb, music, (cue, pos) =>
    playNamed(
      cue,
      pos
        ? {
            position: pos,
          }
        : undefined,
    ),
  );
  const state = {
    paused: false,
    wheel: false,
    gameStarted: false,
  };
  const lastPlayed = new Map();
  let pending = [];
  const after = (delay, fn, key) =>
    pending.push({
      at: performance.now() / 1000 + delay,
      fn,
      key,
    });
  const unlock = () => (eng.ensure() ? (eng.resume(), true) : false);
  const startGame = () => {
    state.gameStarted = true;
    if (unlock()) music.start();
  };
  const onGesture = () => {
    try {
      if (eng.running) return;
      unlock();
      if (!state.gameStarted && ctx.ui?.started) startGame();
      else if (state.gameStarted) music.start();
    } catch (err) {
      warnOnce('gesture', err);
    }
  };
  for (const type of ['pointerdown', 'keydown', 'touchend'])
    window.addEventListener(type, onGesture, {
      capture: true,
      passive: true,
    });
  const on = ctx.events.on.bind(ctx.events);
  on('game:start', () => startGame());
  on('game:pause', (data) => {
    state.paused = !!data?.paused;
    eng.setWorldState(state.paused, state.wheel);
  });
  on('ui:wheel', (data) => {
    state.wheel = !!data?.open;
    eng.setWorldState(state.paused, state.wheel);
    playNamed(state.wheel ? 'wheel-open' : 'wheel-close');
  });
  on('settings:changed', (data) => {
    const settings = data?.settings ?? ctx.settings;
    eng.setVolumes(settings?.masterVolume ?? 0.8, settings?.musicVolume ?? 0.6);
  });
  on('content:shrine-complete', () => {
    after(0.25, () => playNamed('shrine-complete'), 'shrine-complete');
    music.swell(3.4);
  });
  on('content:all-shrines', () => {
    pending = pending.filter((job) => job.key !== 'shrine-complete');
    after(0.35, () => playNamed('all-shrines'));
    music.fullTheme((ctx.time?.elapsed ?? 0) < 2 ? 10 : 16.5);
  });
  on('content:ink-refill', (data) =>
    after(0.05, () =>
      playNamed('ink-refill', {
        position: data?.position,
      }),
    ),
  );
  on('item:get', (data) => {
    combat.quietHeals(ITEM_HOLD.dur + 1.5);
    after(0.16, () => playNamed('item-get'), 'item-get');
    if (data?.item === 'heartContainer') after(ITEM_HOLD.lower + 0.25, () => playNamed('heart-get'), 'heart-get');
    if (data?.item === 'staminaVessel') after(ITEM_HOLD.lower + 0.3, () => playNamed('vessel-get'), 'vessel-get');
    if (data?.item === 'skyMantle') after(SKY_MANTLE.on - 0.12, () => playNamed('mantle-get'), 'mantle-get');
    const cue = data?.item ? ITEM_CUES[data.item] : undefined;
    if (cue) after(ITEM_HOLD.lower + 0.28, () => playNamed(cue), cue);
  });
  on('puzzle:solved', () => after(0.08, () => playNamed('puzzle-solved'), 'puzzle-solved'));
  const guard = (label, fn) => {
    try {
      fn();
    } catch (err) {
      warnOnce(label, err);
    }
  };
  on('boss:start', () => guard('boss start', () => bossMusic.start()));
  on('boss:phase', (data) => guard('boss phase', () => bossMusic.setPhase(Number(data?.phase) || 1)));
  on('boss:reset', () => guard('boss reset', () => bossMusic.reset()));
  on('boss:defeated', () => guard('boss defeated', () => bossMusic.victory()));
  on('elite:engage', (data) => guard('elite engage', () => combat.markElite(data?.element, true)));
  on('player:death', () => {
    guard('boss hero down', () => bossMusic.heroDown());
    guard('arts stop', () => arts.stop());
  });
  on('player:respawn', () =>
    after(0.6, () => guard('boss hero back', () => bossMusic.heroBack(!!ctx.boss?.active && !ctx.boss?.defeated))),
  );
  function playNamed(cue, opts) {
    const def = NAMED[cue];
    if (!def) return;
    const now = performance.now() / 1000;
    if (
      (def.dedupe && now - (lastPlayed.get(cue) ?? -1000000000) < def.dedupe) ||
      (cue === 'shrine-complete' && now - (lastPlayed.get('all-shrines') ?? -1000000000) < 9) ||
      (lastPlayed.set(cue, now),
      cue === 'all-shrines' && eng.fadeOut(NAMED['shrine-complete'].id, 0.4),
      cue === 'perch-claim' && perchHum.claim(),
      !eng.running)
    )
      return;
    const volume = Math.max(0, Number(opts?.volume ?? 1) || 0);
    const pitch = Math.min(4, Math.max(0.25, Number(opts?.pitch ?? 1) || 1));
    const jitter = def.rateVar ? 2 ** (((Math.random() * 2 - 1) * def.rateVar) / 12) : 1;
    const pos = def.positional && opts?.position && Number.isFinite(opts.position.x) ? opts.position : null;
    eng.play(def.id, {
      bus: def.bus,
      pos,
      gain: engDbToGain(def.db) * volume,
      rate: pitch * jitter,
      wet: def.bus === 'sfx' ? 0.2 : 0,
      prio: def.prio ?? 4,
      maxDist: pos ? 220 : undefined,
    });
    if (def.duck) {
      eng.duckMusic(def.duck[0], def.duck[1]);
      music.hold(def.duck[1] + 1.5);
    }
  }
  const api = {
    isStub: false,
    play(cue, opts) {
      try {
        playNamed(String(cue), opts);
      } catch (err) {
        warnOnce('play', err);
      }
    },
    update(dt) {
      try {
        sfx.update(dt);
      } catch (err) {
        warnOnce('sfx.update', err);
      }
    },
    lateUpdate() {
      try {
        eng.updateListener(ctx.camera);
        const dt = ctx.time?.realDt ?? 1 / 60;
        amb.update(dt);
        music.update();
        battle.update();
        bossMusic.update();
        combat.update(dt);
        arts.update(dt);
        flightSfx.update(dt);
        perchHum.update();
        flightMusic.update(dt);
        sky.update(dt);
        areas.update(dt);
        if (pending.length) {
          const now = performance.now() / 1000;
          for (let i = pending.length - 1; i >= 0; i--) if (!(pending[i].at > now)) pending.splice(i, 1)[0].fn();
        }
      } catch (err) {
        warnOnce('lateUpdate', err);
      }
    },
    dispose() {
      for (const type of ['pointerdown', 'keydown', 'touchend'])
        window.removeEventListener(type, onGesture, {
          capture: true,
        });
      eng.dispose();
    },
  };
  const internals = {
    ctx,
    eng,
    sfx,
    amb,
    music,
    battle,
    bossMusic,
    combat,
    arts,
    flightSfx,
    perchHum,
    flightMusic,
    sky,
    areas,
    api,
    playNamed,
    unlock,
    startGame,
    NAMED,
  };
  window.__wbAudio = internals;
  if (params.has('audiotest'))
    import('./debug.js').then((mod) => mod.mountAudioTest(internals)).catch((err) => warnOnce('audiotest panel', err));
  return api;
}
