/**
 * Interior audio for caverns and temples: ambience loops and reverb for caves, the kiln and the cistern, with drips, chimes and pops, entry stings and the indoor music mood. It also plays the lantern hum and tinkle and the double-jump, flame-ring and frost-patch sounds.
 */
import { darkness, heroSignals } from '../shared/signals.js';
import { engDbToGain } from './engine.js';
const areaClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const areaRand = (a, b) => a + (b - a) * Math.random();
const AREA_LOOPS = {
  cave: {
    id: 'amb-cave',
    bus: 'amb',
  },
  kiln: {
    id: 'amb-kiln',
    bus: 'amb',
  },
  cistern: {
    id: 'amb-cistern',
    bus: 'amb',
  },
  lantern: {
    id: 'amb-lantern',
    bus: 'sfx',
    filter: 'lowpass',
    freq: 5000,
    q: 0.5,
    positional: true,
  },
};
const AREA_AMB_DB = {
  cave: -13,
  kiln: -12,
  cistern: -14,
};
const AREA_REVERB = {
  cave: [0.62, 2600],
  kiln: [0.34, 3600],
  cistern: [0.5, 5200],
};
function classifyInterior(id, label, kind) {
  const text = `${id} ${label}`;
  return /kiln|ember|forge|fire/i.test(text)
    ? 'kiln'
    : /cistern|frost|frozen|ice/i.test(text) || kind === 'temple'
      ? 'cistern'
      : 'cave';
}
export class AreaAudio {
  ctx;
  eng;
  amb;
  music;
  play;
  loops = {};
  k = {
    cave: 0,
    kiln: 0,
    cistern: 0,
  };
  where = null;
  whereId = null;
  lastVerb = -1;
  tPoll = 0;
  nextDrip = 1;
  nextChime = 3;
  nextPop = 1.5;
  nextTinkle = 1;
  lanternK = 0;
  lastFrost = -9;
  lastPuff = -9;
  stung = new Map();
  force = null;
  setForce(force) {
    this.force = force;
    try {
      this.music.setIndoor(force ?? this.where, 1.5);
    } catch {}
  }
  forceLantern = false;
  constructor(ctx, eng, amb, music, play) {
    this.ctx = ctx;
    this.eng = eng;
    this.amb = amb;
    this.music = music;
    this.play = play;
    const on = ctx.events.on.bind(ctx.events);
    on('interior:enter', (data) =>
      this.safe(() => this.enter(String(data?.id ?? ''), String(data?.name ?? ''), data?.kind)),
    );
    on('interior:exit', () => this.safe(() => this.poll()));
    const signals = heroSignals(ctx);
    signals.on('air-jump', (data) => this.safe(() => this.puff(data.position)));
    signals.on('flame-ring', (data) => this.safe(() => this.play('flame-ring', data.position)));
    signals.on('frost-patch', (data) => this.safe(() => this.frost(data.position)));
  }
  safe(fn) {
    try {
      fn();
    } catch {}
  }
  now() {
    return performance.now() / 1000;
  }
  enter(id, label, kind) {
    const where = classifyInterior(id, label, kind);
    this.setWhere(where, id);
    const now = this.now();
    if (now - (this.stung.get(id) ?? -1000000000) > 40) {
      this.stung.set(id, now);
      this.play(where === 'cave' ? 'cave-enter' : where === 'kiln' ? 'kiln-enter' : 'cistern-enter');
    }
  }
  setWhere(where, whereId) {
    this.where = where;
    this.whereId = whereId;
    try {
      this.music.setIndoor(where, where ? 3.5 : 4);
    } catch {}
  }
  poll() {
    let interior = null;
    try {
      interior = this.ctx.interiors?.current ?? null;
    } catch {
      interior = null;
    }
    if (interior) {
      if (interior.id !== this.whereId)
        this.setWhere(classifyInterior(interior.id, interior.name, interior.kind), interior.id);
    } else if (this.where && !this.force) this.setWhere(null, null);
  }
  puff(pos) {
    const now = this.now();
    if (!(now - this.lastPuff < 0.08 || !this.eng.running)) {
      this.lastPuff = now;
      this.eng.play('dbl-jump', {
        pos,
        gain: engDbToGain(-7),
        rate: areaRand(0.97, 1.05),
        wet: 0.1,
        prio: 6,
        variation: Math.floor(Math.random() * 3),
      });
    }
  }
  frost(pos) {
    const now = this.now();
    if (!(now - this.lastFrost < 0.07 || !this.eng.running)) {
      this.lastFrost = now;
      this.eng.play('frost-crackle', {
        pos,
        gain: engDbToGain(-10) * areaRand(0.7, 1),
        rate: areaRand(0.92, 1.1),
        wet: 0.2,
        prio: 3,
        variation: Math.floor(Math.random() * 4),
      });
    }
  }
  ensureLoops() {
    for (const key of Object.keys(AREA_LOOPS)) {
      if (this.loops[key]) continue;
      const spec = AREA_LOOPS[key];
      if (!this.eng.bank.has(spec.id)) continue;
      const loop = this.eng.createLoop(spec.id, spec);
      if (loop) this.loops[key] = loop;
    }
  }
  update(dt) {
    const delta = areaClamp(dt, 0, 0.1);
    this.tPoll -= delta;
    if (this.tPoll <= 0) {
      this.tPoll = 0.25;
      this.poll();
    }
    if (!this.eng.running) return;
    this.ensureLoops();
    const where = this.force ?? this.where;
    const blend = 1 - Math.exp(-delta * 1.2);
    let indoor = 0;
    for (const kind of ['cave', 'kiln', 'cistern']) {
      this.k[kind] += (+(where === kind) - this.k[kind]) * blend;
      indoor = Math.max(indoor, this.k[kind]);
    }
    this.amb.indoorFactor = indoor;
    const paused = (this.ctx.time?.scale ?? 1) <= 0;
    const dim = paused ? 0.45 : 1;
    const loops = this.loops;
    loops.cave?.set(engDbToGain(AREA_AMB_DB.cave) * this.k.cave * dim, 0.6);
    loops.kiln?.set(engDbToGain(AREA_AMB_DB.kiln) * this.k.kiln * dim, 0.6);
    loops.cistern?.set(engDbToGain(AREA_AMB_DB.cistern) * this.k.cistern * dim, 0.6);
    const verb = where ? AREA_REVERB[where][0] : 0;
    if (verb !== this.lastVerb) {
      this.lastVerb = verb;
      this.eng.setIndoor(verb, where ? AREA_REVERB[where][1] : 3200, where ? 0.6 : 1.2);
    }
    this.eng.tickIndoor();
    if (!paused && where) this.scatter(delta, where);
    this.lantern(delta, paused);
  }
  scatter(dt, where) {
    const listener = this.eng.listener;
    const around = (minDist, maxDist, minY, maxY) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = areaRand(minDist, maxDist);
      return {
        x: listener.x + Math.cos(angle) * dist,
        y: listener.y + areaRand(minY, maxY),
        z: listener.z + Math.sin(angle) * dist,
      };
    };
    if (where === 'cave' || where === 'cistern') {
      this.nextDrip -= dt;
      if (this.nextDrip <= 0) {
        this.nextDrip = where === 'cave' ? areaRand(0.7, 3.2) : areaRand(1.5, 4.5);
        this.eng.play('cave-drip', {
          pos: around(3, 16, -1, 6),
          gain: engDbToGain(-15) * areaRand(0.5, 1),
          rate: areaRand(0.9, 1.12),
          wet: 0.4,
          maxDist: 60,
          prio: 0,
          variation: Math.floor(Math.random() * 6),
        });
      }
    }
    if (where === 'cistern') {
      this.nextChime -= dt;
      if (this.nextChime <= 0) {
        this.nextChime = areaRand(4, 11);
        this.eng.play('cistern-chime', {
          pos: around(5, 18, 1, 7),
          gain: engDbToGain(-19) * areaRand(0.6, 1),
          rate: areaRand(0.98, 1.02),
          wet: 0.5,
          maxDist: 60,
          prio: 0,
          variation: Math.floor(Math.random() * 5),
        });
      }
    }
    if (where === 'kiln') {
      this.nextPop -= dt;
      if (this.nextPop <= 0) {
        this.nextPop = areaRand(0.8, 3.5);
        this.eng.play('kiln-pop', {
          pos: around(4, 15, -1, 3),
          gain: engDbToGain(-14) * areaRand(0.5, 1),
          rate: areaRand(0.85, 1.15),
          wet: 0.3,
          maxDist: 60,
          prio: 0,
          variation: Math.floor(Math.random() * 4),
        });
      }
    }
  }
  lantern(dt, paused) {
    let hasLantern = false;
    try {
      hasLantern = !!this.ctx.player?.hasItem?.('lantern');
    } catch {
      hasLantern = false;
    }
    const state = this.ctx.player?.state;
    const target = this.forceLantern ? 1 : hasLantern ? darkness(this.ctx) : 0;
    this.lanternK += (target - this.lanternK) * (1 - Math.exp(-dt * 1.5));
    const lantern = this.loops.lantern;
    const position = state?.position;
    lantern?.set(engDbToGain(-24) * this.lanternK * (paused ? 0.4 : 1), 0.4);
    if (position && lantern)
      lantern.setPos(
        {
          x: position.x,
          y: position.y + 0.9,
          z: position.z,
        },
        0.1,
      );
    if (paused || !position || this.lanternK < 0.3) return;
    const speed = Number(state?.speed) || 0;
    if (!(speed < 2 || state?.mode !== 'ground')) {
      this.nextTinkle -= dt * speed * 0.18;
      if (this.nextTinkle <= 0) {
        this.nextTinkle = areaRand(0.8, 2.2);
        this.eng.play('lantern-tinkle', {
          pos: {
            x: position.x,
            y: position.y + 0.8,
            z: position.z,
          },
          gain: engDbToGain(-21) * areaRand(0.6, 1),
          rate: areaRand(0.96, 1.05),
          wet: 0.1,
          prio: 1,
          variation: Math.floor(Math.random() * 4),
        });
      }
    }
  }
  get describe() {
    return `${this.force ?? this.where ?? 'outdoors'}  cave ${this.k.cave.toFixed(2)} kiln ${this.k.kiln.toFixed(2)} cistern ${this.k.cistern.toFixed(2)}  verb ${this.eng.indoorLevel.toFixed(2)}  lantern ${this.lanternK.toFixed(2)}`;
  }
}
