/**
 * Ambience: wind, rush, glide flutter, grass, surf, lake lapping, crickets, fire and slide loops follow the hero's surroundings, height, speed and the time of day, while birds, owls and frogs call from around the listener.
 */
import { Vector3 } from 'three';
import { groundHeightAt } from '../shared/skyground.js';
import { engDbToGain } from './engine.js';
const AMBIENCE_LOOPS = {
  wind: {
    id: 'amb-wind',
    filter: 'lowpass',
    freq: 1400,
    q: 0.5,
  },
  rush: {
    id: 'amb-rush',
    filter: 'bandpass',
    freq: 700,
    q: 0.6,
    bus: 'sfx',
  },
  flutter: {
    id: 'amb-flutter',
    bus: 'sfx',
  },
  grass: {
    id: 'amb-grass',
    filter: 'highpass',
    freq: 1500,
    q: 0.5,
  },
  surf: {
    id: 'amb-surf',
    filter: 'lowpass',
    freq: 5000,
    q: 0.5,
  },
  lap: {
    id: 'amb-lap',
  },
  crickets: {
    id: 'amb-crickets',
  },
  fire: {
    id: 'fire-loop',
    positional: true,
    wet: 0.25,
  },
  slide: {
    id: 'amb-slide',
    filter: 'bandpass',
    freq: 1800,
    q: 0.7,
    bus: 'sfx',
  },
};
const ambClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const ambSmoothstep = (edge0, edge1, x) => {
  const t = ambClamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const gaussian = (x, mu, sigma) => Math.exp(-((x - mu) * (x - mu)) / (2 * sigma * sigma));
const ambRand = (lo, hi) => lo + (hi - lo) * Math.random();
const ambNum = (v, fallback) => (typeof v == 'number' && Number.isFinite(v) ? v : fallback);
export class Ambience {
  ctx;
  eng;
  loops = {};
  fires = [];
  pending = [];
  tSample = 0;
  tFire = 0;
  tParams = 0;
  waterSpots = [];
  ocean = 0;
  lake = 0;
  grass = 0.5;
  vitality = 1;
  forest = 0;
  agl = 0;
  fireProx = 0;
  skyFactor = 0;
  indoorFactor = 0;
  firePos = {
    x: 0,
    y: 0,
    z: 0,
  };
  tmpV = new Vector3();
  nextBird = 4;
  nextOwl = 25;
  nextFrog = 6;
  overrides = {};
  constructor(ctx, eng) {
    this.ctx = ctx;
    this.eng = eng;
    ctx.events.on('fire:ignite', (data) => this.addFire(data?.position));
    ctx.events.on('fire:extinguish', (data) => {
      const position = data?.position;
      if (position)
        this.fires = this.fires.filter((fire) => (fire.x - position.x) ** 2 + (fire.z - position.z) ** 2 > 25);
    });
  }
  addFire(pos) {
    if (!pos || !Number.isFinite(pos.x + pos.y + pos.z)) return;
    const t = performance.now() / 1000;
    for (const fire of this.fires)
      if ((fire.x - pos.x) ** 2 + (fire.z - pos.z) ** 2 < 9) {
        fire.t = t;
        return;
      }
    this.fires.push({
      x: pos.x,
      y: pos.y,
      z: pos.z,
      t,
    });
    if (this.fires.length > 48) this.fires.shift();
  }
  hour() {
    return (((this.overrides.hour ?? ambNum(this.ctx.environment?.timeOfDay, 14)) % 24) + 24) % 24;
  }
  dayFactor() {
    const hour = this.hour();
    return ambSmoothstep(5.2, 6.8, hour) * (1 - ambSmoothstep(18.8, 20.3, hour));
  }
  nightFactor() {
    const hour = this.hour();
    return ambClamp(ambSmoothstep(18.3, 20.5, hour) + 1 - ambSmoothstep(4.5, 6.2, hour), 0, 1);
  }
  update(dt) {
    if (!this.eng.running) return;
    const step = ambClamp(dt, 0, 0.1);
    this.ensureLoops();
    this.tSample -= step;
    this.tFire -= step;
    this.tParams -= step;
    if (this.tSample <= 0) {
      this.tSample = 0.5;
      this.sampleWorld();
    }
    if (this.tFire <= 0) {
      this.tFire = 0.25;
      this.trackFire();
    }
    if (this.tParams <= 0) {
      this.tParams = 1 / 15;
      this.applyLevels();
    }
    if ((this.ctx.time?.scale ?? 1) > 0) this.critters(step);
    this.flushPending();
  }
  ensureLoops() {
    for (const key of Object.keys(AMBIENCE_LOOPS)) {
      if (this.loops[key]) continue;
      const def = AMBIENCE_LOOPS[key];
      if (!this.eng.bank.has(def.id)) continue;
      const loop = this.eng.createLoop(def.id, def);
      if (loop) this.loops[key] = loop;
    }
  }
  sampleWorld() {
    const { ctx } = this;
    const listener = this.eng.listener;
    const heroPos = ctx.player?.state?.position ?? listener;
    const water = ctx.water;
    const lake = ctx.terrain?.landmarks?.lake;
    let oceanW = 0;
    let lakeW = 0;
    let totalW = 0;
    this.waterSpots.length = 0;
    const probe = (x, z, weight) => {
      totalW += weight;
      let depth = 0;
      try {
        depth = ambNum(water?.depthAt(x, z), 0);
      } catch {
        depth = 0;
      }
      if (depth > 0.3) {
        if (lake && (x - lake.x) ** 2 + (z - lake.z) ** 2 < 2304) lakeW += weight;
        else oceanW += weight;
        if (this.waterSpots.length < 12)
          this.waterSpots.push({
            x,
            z,
          });
      }
    };
    probe(listener.x, listener.z, 2);
    for (const [radius, weight] of [
      [10, 1],
      [25, 0.6],
      [50, 0.3],
    ])
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + radius * 0.1;
        probe(listener.x + Math.cos(angle) * radius, listener.z + Math.sin(angle) * radius, weight);
      }
    this.ocean = this.overrides.ocean ?? (totalW ? oceanW / totalW : 0);
    this.lake = totalW ? lakeW / totalW : 0;
    this.agl = Math.max(
      0,
      ambNum(heroPos.y, 0) - ambNum(groundHeightAt(ctx, heroPos.x, heroPos.z, ambNum(heroPos.y, 0)), 0),
    );
    try {
      let grass = ambNum(ctx.terrain?.grassDensityAt(heroPos.x, heroPos.z), 0.5);
      grass +=
        ambNum(ctx.terrain?.grassDensityAt(heroPos.x + 8, heroPos.z), grass) +
        ambNum(ctx.terrain?.grassDensityAt(heroPos.x - 8, heroPos.z + 5), grass);
      this.grass = ambClamp(grass / 3, 0, 1);
    } catch {
      this.grass = 0.5;
    }
    try {
      this.vitality = ambClamp(ambNum(ctx.paint?.vitalityAt(heroPos.x, heroPos.z), 1), 0, 1);
    } catch {
      this.vitality = 1;
    }
    try {
      const position = ctx.player?.state?.position;
      const trees = position ? ctx.vegetation?.treesNear(position, 30) : null;
      this.forest = ambClamp((trees?.length ?? 0) / 6, 0, 1);
    } catch {
      this.forest = 0;
    }
  }
  trackFire() {
    const { ctx } = this;
    const elements = ctx.elements;
    const hasElements = !!elements && !elements.isStub;
    const now = performance.now() / 1000;
    const listener = this.eng.listener;
    const heroPos = ctx.player?.state?.position ?? listener;
    const kept = [];
    for (const fire of this.fires) {
      let burning = false;
      if (hasElements) {
        try {
          burning = !!elements.isBurning(this.tmpV.set(fire.x, fire.y, fire.z), 3);
        } catch {
          burning = false;
        }
        if (burning || now - fire.t < 1.5) kept.push(fire);
      } else if (now - fire.t < 12) kept.push(fire);
    }
    this.fires = kept;
    let nearest = null;
    let nearestDist = Infinity;
    let heat = 0;
    for (const fire of this.fires) {
      const dist = Math.hypot(fire.x - listener.x, fire.y - listener.y, fire.z - listener.z);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = fire;
      }
      if (dist < 45) heat += 1 / (1 + (dist / 15) ** 2);
    }
    let prox = nearest ? ambClamp(0.45 + heat * 0.25, 0, 1.3) : 0;
    let pos = nearest;
    if (hasElements && heroPos)
      try {
        const probe = this.tmpV.set(heroPos.x, heroPos.y, heroPos.z);
        let heroHeat = 0;
        if (elements.isBurning(probe, 6)) heroHeat = 0.9;
        else if (elements.isBurning(probe, 14)) heroHeat = 0.5;
        else if (elements.isBurning(probe, 28)) heroHeat = 0.22;
        if (heroHeat > 0 && (!nearest || nearestDist > 30)) {
          prox = Math.max(prox, heroHeat);
          pos = heroPos;
        }
      } catch {}
    if (this.overrides.fire !== undefined) {
      prox = this.overrides.fire;
      pos = {
        x: listener.x + 6,
        y: listener.y - 1,
        z: listener.z,
      };
    }
    this.fireProx = prox;
    if (pos) {
      this.firePos.x = pos.x;
      this.firePos.y = pos.y;
      this.firePos.z = pos.z;
    }
  }
  applyLevels() {
    const { ctx } = this;
    const state = ctx.player?.state;
    const listener = this.eng.listener;
    const velocity = state?.velocity;
    const speed =
      this.overrides.speed ??
      (velocity ? Math.hypot(ambNum(velocity.x, 0), ambNum(velocity.y, 0), ambNum(velocity.z, 0)) : 0);
    const gliding = this.overrides.glide ?? state?.mode === 'glide';
    const wind = ambClamp(ambNum(ctx.environment?.wind?.strength, 0.5), 0, 2);
    const aloft = ambSmoothstep(8, 50, this.agl);
    const altitude = ambSmoothstep(25, 70, ambNum(state?.position?.y, listener.y));
    const land = 1 - ambClamp(this.ocean + this.lake, 0, 1);
    const night = this.nightFactor();
    const loops = this.loops;
    const slowmo = (ctx.time?.scale ?? 1) < 1 && (ctx.time?.scale ?? 1) > 0;
    const sky = ambClamp(this.skyFactor, 0, 1);
    const outdoors = 1 - ambClamp(this.indoorFactor, 0, 1);
    const windLevel =
      engDbToGain(-25) *
      (0.6 + 0.8 * wind) *
      (1 + 1.4 * aloft + 1.1 * altitude) *
      (1 - 0.55 * sky) *
      (0.08 + 0.92 * outdoors);
    loops.wind?.set(Math.min(windLevel, engDbToGain(-12)), 0.8);
    loops.wind?.setFreq(900 + 1600 * Math.max(aloft, altitude), 1);
    const rush = ambSmoothstep(4, 24, speed) * (gliding ? 1 : state?.mode === 'fly' ? 0.35 : 0.75);
    loops.rush?.set(engDbToGain(-8) * rush, 0.2);
    loops.rush?.setFreq(380 + ambClamp(speed, 0, 40) * 110, 0.2);
    loops.rush?.setRate(0.9 + 0.2 * ambSmoothstep(5, 30, speed), 0.3);
    loops.flutter?.set(
      gliding ? engDbToGain(-15) * (0.4 + 0.6 * ambSmoothstep(3, 14, speed)) : 0,
      gliding ? 0.15 : 0.1,
    );
    loops.flutter?.setRate(0.85 + 0.35 * ambSmoothstep(3, 18, speed), 0.3);
    loops.grass?.set(engDbToGain(-21) * this.grass * (1 - aloft) * (0.4 + 0.6 * wind) * land * (1 - sky) * outdoors, 1);
    const aboveWater = Math.max(0, listener.y - ambNum(ctx.water?.level, 0));
    const surf =
      ambSmoothstep(0.03, 0.45, this.ocean) *
      (1 - 0.35 * ambSmoothstep(0.85, 1, this.ocean)) *
      (1 - 0.65 * ambSmoothstep(8, 60, aboveWater));
    loops.surf?.set(engDbToGain(-13) * surf * (1 - 0.85 * sky) * outdoors, 1.2);
    loops.surf?.setFreq(2200 + 4000 * surf, 1);
    const swimming = state?.mode === 'swim';
    const lap = ambSmoothstep(0.03, 0.4, this.lake) * (1 - 0.6 * ambSmoothstep(5, 40, aboveWater));
    loops.lap?.set((engDbToGain(-19) * lap + (swimming ? engDbToGain(-21) : 0)) * outdoors, 0.6);
    loops.crickets?.set(
      engDbToGain(-21) * night * land * (0.35 + 0.65 * this.grass) * (1 - aloft) * (1 - sky) * outdoors,
      1.5,
    );
    loops.fire?.set(engDbToGain(-8) * this.fireProx, 0.5);
    loops.fire?.setPos(this.firePos, 0.3);
    const sliding = this.overrides.slide ?? state?.mode === 'slide';
    const icy = state?.surface === 'ice' || state?.paintUnderfoot === 'blue';
    loops.slide?.set(sliding ? engDbToGain(-14) * ambSmoothstep(1, 9, speed || 6) : 0, sliding ? 0.08 : 0.15);
    loops.slide?.setFreq(icy ? 3800 : 1500, 0.1);
    loops.slide?.setRate(slowmo ? 0.85 : 0.9 + 0.2 * ambSmoothstep(2, 14, speed), 0.2);
  }
  critters(dt) {
    if (this.indoorFactor > 0.5) return;
    const listener = this.eng.listener;
    const hour = this.hour();
    const day = this.dayFactor();
    const night = this.nightFactor();
    const land = 1 - ambClamp(this.ocean + this.lake * 0.5, 0, 1);
    const aloft = Math.max(ambSmoothstep(10, 45, this.agl), this.skyFactor);
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      const chorus = 1 + 0.9 * gaussian(hour, 7, 1.3) + 0.5 * gaussian(hour, 18, 1);
      const rate =
        0.32 *
        day *
        land *
        (1 - 0.85 * aloft) *
        (0.3 + 0.7 * this.vitality) *
        (0.6 + 0.25 * this.forest + 0.15 * this.grass) *
        chorus;
      if (rate > 0.01) {
        this.bird(hour, listener);
        this.nextBird = ambClamp(-Math.log(1 - Math.random() * 0.98) / rate, 0.7, 30);
      } else this.nextBird = 4;
    }
    this.nextOwl -= dt;
    if (this.nextOwl <= 0 && ((this.nextOwl = ambRand(25, 70)), night > 0.6 && land > 0.5 && aloft < 0.6)) {
      const pos = this.around(listener, 25, 45, 6, 14);
      this.eng.play('owl', {
        pos,
        gain: engDbToGain(-18) * ambRand(0.7, 1),
        rate: ambRand(0.94, 1.04),
        wet: 0.4,
        maxDist: 70,
      });
    }
    this.nextFrog -= dt;
    if (this.nextFrog <= 0) {
      this.nextFrog = ambRand(2.5, 8);
      const water = this.lake + this.ocean * 0.3;
      if (night > 0.35 && water > 0.04 && water < 0.9 && this.waterSpots.length) {
        const spot = this.waterSpots[Math.floor(Math.random() * this.waterSpots.length)];
        const pos = {
          x: spot.x,
          y: ambNum(this.ctx.water?.level, 0) + 0.2,
          z: spot.z,
        };
        const count = Math.random() < 0.4 ? 2 : 1;
        for (let i = 0; i < count; i++)
          this.pending.push({
            at: performance.now() / 1000 + i * ambRand(0.4, 1.2),
            id: 'frog',
            pos: {
              x: pos.x + ambRand(-4, 4),
              y: pos.y,
              z: pos.z + ambRand(-4, 4),
            },
            gain: engDbToGain(-21) * ambRand(0.6, 1),
            rate: ambRand(0.85, 1.15),
          });
      }
    }
  }
  bird(hour, listener) {
    const pool =
      hour < 10
        ? [
            ['bird-chirp', 3],
            ['bird-whistle', 3],
            ['bird-warble', 2.5],
            ['bird-trill', 1],
            ['bird-dove', 0.5],
          ]
        : hour > 16.5
          ? [
              ['bird-whistle', 3.5],
              ['bird-warble', 3],
              ['bird-dove', 2],
              ['bird-chirp', 1.5],
            ]
          : [
              ['bird-chirp', 3],
              ['bird-whistle', 2],
              ['bird-trill', 2],
              ['bird-warble', 1.5],
              ['bird-dove', 1.5],
            ];
    let total = 0;
    for (const [, weight] of pool) total += weight;
    let roll = Math.random() * total;
    let pick = pool[0][0];
    for (const [id, weight] of pool) {
      roll -= weight;
      if (roll <= 0) {
        pick = id;
        break;
      }
    }
    const pos = this.around(listener, 10, 34, 2, 11);
    const rate = pick === 'bird-dove' ? ambRand(0.94, 1.04) : ambRand(0.9, 1.12);
    const gain = engDbToGain(pick === 'bird-dove' ? -21 : -17) * ambRand(0.55, 1);
    this.eng.play(pick, {
      pos,
      gain,
      rate,
      wet: 0.35,
      maxDist: 60,
      prio: 0,
    });
    if (Math.random() < 0.35)
      this.pending.push({
        at: performance.now() / 1000 + ambRand(0.7, 1.7),
        id: pick,
        pos: this.around(listener, 14, 38, 2, 11),
        gain: gain * ambRand(0.6, 0.9),
        rate: rate * ambRand(0.97, 1.03),
      });
  }
  around(center, minDist, maxDist, minUp, maxUp) {
    const angle = Math.random() * Math.PI * 2;
    const dist = ambRand(minDist, maxDist);
    const x = center.x + Math.cos(angle) * dist;
    const z = center.z + Math.sin(angle) * dist;
    let ground = center.y;
    try {
      ground = ambNum(this.ctx.terrain?.heightAt(x, z), center.y);
    } catch {}
    return {
      x,
      y: Math.max(ground, ambNum(this.ctx.water?.level, 0)) + ambRand(minUp, maxUp),
      z,
    };
  }
  flushPending() {
    if (!this.pending.length) return;
    const now = performance.now() / 1000;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const entry = this.pending[i];
      if (!(entry.at > now)) {
        this.pending.splice(i, 1);
        this.eng.play(entry.id, {
          pos: entry.pos,
          gain: entry.gain,
          rate: entry.rate,
          wet: 0.35,
          maxDist: 70,
          prio: 0,
        });
      }
    }
    if (this.pending.length > 16) this.pending.length = 16;
  }
  debugCritter(id) {
    const listener = this.eng.listener;
    if (id === 'bird') this.bird(this.hour(), listener);
    else
      this.eng.play(id, {
        pos: this.around(listener, 12, 20, 1, 6),
        gain: engDbToGain(id === 'owl' ? -16 : -18),
        wet: 0.35,
      });
  }
  get firesTracked() {
    return this.fires.length;
  }
}
