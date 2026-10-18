/**
 * Painted Aerie audio: sky wind, choir and waterfall loops that fade in as the hero reaches the sky island, wind chimes, the area discovery sting, and vine, gust and storm-crackle sounds.
 */
import { skyFactor, skyIsland } from '../shared/skyground.js';
import { engDbToGain } from './engine.js';
const skyClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const skyRand = (a, b) => a + (b - a) * Math.random();
const skyNum = (v, fallback) => (typeof v == 'number' && Number.isFinite(v) ? v : fallback);
const GUST_RE = /gust|gale|wind|tornado|cyclone|squall|blast/i;
const VINE_RE = /thorn|vine|bramble|root|snare|grasp|grab/i;
const SKY_LOOPS = {
  wind: {
    id: 'amb-sky-wind',
    bus: 'amb',
    filter: 'lowpass',
    freq: 4000,
    q: 0.5,
  },
  choir: {
    id: 'amb-sky-choir',
    bus: 'amb',
  },
  falls: {
    id: 'amb-sky-falls',
    bus: 'amb',
    positional: true,
    wet: 0.3,
  },
};
export class SkyAudio {
  ctx;
  eng;
  amb;
  music;
  play;
  loops = {};
  factor = 0;
  tSample = 0;
  raw = 0;
  nextChime = 3;
  fallsPos = {
    x: 0,
    y: 0,
    z: 0,
  };
  fallsDist = 1000000000;
  lastSlowUntil = -1;
  wasSlowed = false;
  lastVine = -9;
  lastGust = -9;
  lastCrackle = -9;
  lastSting = -99;
  force = false;
  constructor(ctx, eng, amb, music, play) {
    this.ctx = ctx;
    this.eng = eng;
    this.amb = amb;
    this.music = music;
    this.play = play;
    const on = ctx.events.on.bind(ctx.events);
    on('area:enter', (data) =>
      this.safe(() => {
        const label = `${data?.id ?? ''} ${data?.name ?? ''}`;
        if (!/cave|cavern|glowcap|kiln|cistern|temple/i.test(label)) {
          try {
            if (ctx.interiors?.current) return;
          } catch {}
          this.sting();
        }
      }),
    );
    on('player:hurt', (data) =>
      this.safe(() => {
        const source = String(data?.source ?? '');
        const pos = data?.position ?? ctx.player?.state?.position;
        if (GUST_RE.test(source)) this.gust(pos);
        if (VINE_RE.test(source)) this.vine(pos);
        if (/storm|lightning|static|discharge/i.test(source)) this.crackle(pos ?? this.eng.listener);
      }),
    );
    on('enemy:attack', (data) =>
      this.safe(() => {
        const attack = String(data?.attack ?? '');
        if (GUST_RE.test(attack)) this.gust(data?.position);
        if (/discharge/i.test(attack) && data?.position) this.crackle(data.position);
      }),
    );
    on('enemy:death', (data) =>
      this.safe(() => {
        if (data?.position && this.isStormborne(data.id, data.position)) this.crackle(data.position);
      }),
    );
  }
  safe(fn) {
    try {
      fn();
    } catch {}
  }
  now() {
    return performance.now() / 1000;
  }
  sting() {
    const now = this.now();
    if (!(now - this.lastSting < 20)) {
      this.lastSting = now;
      this.play('area-discover');
    }
  }
  vine(pos) {
    const now = this.now();
    if (!(now - this.lastVine < 0.4)) {
      this.lastVine = now;
      this.play('vine-wrap', pos);
    }
  }
  gust(pos) {
    const now = this.now();
    if (!(now - this.lastGust < 0.35)) {
      this.lastGust = now;
      this.play('wind-gust', pos);
    }
  }
  crackle(pos) {
    const now = this.now();
    if (!(now - this.lastCrackle < 0.08)) {
      this.lastCrackle = now;
      this.play('storm-crackle', pos);
    }
  }
  isStormborne(id, pos) {
    try {
      const enemy = this.ctx.enemies?.get?.(id);
      if (enemy && enemy.tier === 2) return true;
      if (enemy && enemy.tier === 1) return false;
    } catch {}
    return skyFactor(this.ctx, pos) > 0.5;
  }
  ensureLoops() {
    for (const key of Object.keys(SKY_LOOPS)) {
      if (this.loops[key]) continue;
      const spec = SKY_LOOPS[key];
      if (!this.eng.bank.has(spec.id)) continue;
      const loop = this.eng.createLoop(spec.id, spec);
      if (loop) this.loops[key] = loop;
    }
  }
  update(dt) {
    const delta = skyClamp(dt, 0, 0.1);
    const state = this.ctx.player?.state;
    if (state) {
      const slowedUntil = skyNum(state.slowedUntil, -1);
      const slowed = slowedUntil > skyNum(this.ctx.time?.elapsed, 0) + 0.02 && !state.dead;
      if (
        (slowed && slowedUntil > this.lastSlowUntil + 0.3 && !this.wasSlowed) ||
        (slowed && slowedUntil > this.lastSlowUntil + 1)
      )
        this.vine(state.position);
      if (!slowed && this.wasSlowed) this.play('vine-free', state.position);
      this.wasSlowed = slowed;
      this.lastSlowUntil = slowedUntil;
    }
    if (!this.eng.running) return;
    this.ensureLoops();
    this.tSample -= delta;
    if (this.tSample <= 0) {
      this.tSample = 0.25;
      this.sample();
    }
    const target = this.force ? 1 : this.raw;
    this.factor += (target - this.factor) * (1 - Math.exp(-delta * 0.8));
    const factor = this.factor;
    this.amb.skyFactor = factor;
    const aerie = this.music.aerie ? factor > 0.3 : factor > 0.65;
    if (aerie !== this.music.aerie) this.music.aerie = aerie;
    const paused = (this.ctx.time?.scale ?? 1) <= 0;
    const loops = this.loops;
    const dim = paused ? 0.4 : 1;
    const wind = skyClamp(skyNum(this.ctx.environment?.wind?.strength, 0.5), 0, 2);
    loops.wind?.set(engDbToGain(-15) * factor * (0.7 + 0.3 * wind) * dim, 1.2);
    loops.choir?.set(engDbToGain(-27) * factor * factor * dim, 2.5);
    const near = skyClamp(1 - (this.fallsDist - 12) / 90, 0, 1);
    loops.falls?.set(engDbToGain(-11) * near * Math.max(factor, 0.35 * near) * dim, 0.8);
    loops.falls?.setPos(this.fallsPos, 0.4);
    if (!paused && factor > 0.4 && ((this.nextChime -= delta), this.nextChime <= 0)) {
      this.nextChime = skyRand(3.5, 10);
      const listener = this.eng.listener;
      const angle = Math.random() * Math.PI * 2;
      const dist = skyRand(7, 22);
      const pos = {
        x: listener.x + Math.cos(angle) * dist,
        y: listener.y + skyRand(1, 6),
        z: listener.z + Math.sin(angle) * dist,
      };
      this.eng.play('sky-chime', {
        pos,
        gain: engDbToGain(-19) * factor * skyRand(0.6, 1),
        rate: skyRand(0.97, 1.03),
        wet: 0.45,
        maxDist: 60,
        prio: 0,
        variation: Math.floor(Math.random() * 6),
      });
    }
  }
  sample() {
    const ctx = this.ctx;
    const listener = this.eng.listener;
    const pos = ctx.player?.state?.position ?? listener;
    this.raw = skyFactor(ctx, pos);
    let nearest = 1000000000;
    try {
      const spots = ctx.sky?.spots ?? {};
      for (const [id, spot] of Object.entries(spots)) {
        if (!/fall|water|cascade|spring/i.test(id) || !spot) continue;
        const dist = Math.hypot(spot.x - listener.x, spot.y - listener.y, spot.z - listener.z);
        if (dist < nearest) {
          nearest = dist;
          this.fallsPos.x = spot.x;
          this.fallsPos.y = spot.y - 4;
          this.fallsPos.z = spot.z;
        }
      }
    } catch {}
    if (nearest > 100000000) {
      const island = skyIsland(ctx);
      let dx = listener.x - island.x;
      let dz = listener.z - island.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len;
      dz /= len;
      this.fallsPos.x = island.x + dx * island.radius * 0.95;
      this.fallsPos.y = island.y - 10;
      this.fallsPos.z = island.z + dz * island.radius * 0.95;
      nearest = Math.hypot(this.fallsPos.x - listener.x, this.fallsPos.y - listener.y, this.fallsPos.z - listener.z);
    }
    this.fallsDist = nearest;
  }
  debugChime() {
    const listener = this.eng.listener;
    this.eng.play('sky-chime', {
      pos: {
        x: listener.x + 5,
        y: listener.y + 2,
        z: listener.z - 4,
      },
      gain: engDbToGain(-14),
      wet: 0.4,
      variation: Math.floor(Math.random() * 6),
    });
  }
}
