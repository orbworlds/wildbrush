/**
 * Brushflight audio: wind, flutter, boost and paint loops while flying, the hum at the summit perch that wakes once all shrines are done and fades when the brushflight is claimed, and the Skyward Stroke flight music that swells with height and speed.
 */
import { floorHeightAt } from '../shared/skyground.js';
import { BRASS_ROOTS, CHOIR_ROOTS } from './boss-sounds.js';
import { INSTRUMENT_RANGES } from './core-recipes.js';
import { engDbToGain } from './engine.js';
import { FLUTE_ROOTS } from './flight-recipes.js';
const flightClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const flightSmoothstep = (edge0, edge1, x) => {
  const k = flightClamp((x - edge0) / (edge1 - edge0), 0, 1);
  return k * k * (3 - 2 * k);
};
const flightNum = (v, fallback) => (typeof v == 'number' && Number.isFinite(v) ? v : fallback);
const FLIGHT_LOOPS = {
  wind: {
    id: 'fl-wind',
    filter: 'lowpass',
    freq: 1500,
    q: 0.6,
  },
  flutter: {
    id: 'fl-flutter',
    filter: 'bandpass',
    freq: 1500,
    q: 0.7,
  },
  boost: {
    id: 'fl-boost',
    filter: 'lowpass',
    freq: 1400,
    q: 0.6,
  },
  paint: {
    id: 'fl-paint',
    filter: 'bandpass',
    freq: 3500,
    q: 0.6,
  },
};
export class FlightSfx {
  ctx;
  eng;
  loops = {};
  wasBoost = false;
  flying = false;
  flyTime = 0;
  overrides = {};
  constructor(ctx, eng) {
    this.ctx = ctx;
    this.eng = eng;
    ctx.events.on('player:mode', (data) => {
      try {
        if (this.eng.running) this.mode(data?.from, data?.to);
      } catch {}
    });
  }
  get isFlying() {
    return this.flying;
  }
  get secondsFlying() {
    return this.flying ? this.flyTime : 0;
  }
  mode(from, to) {
    const pos = this.ctx.player?.state?.position ?? null;
    if (to === 'fly' && from !== 'fly')
      this.eng.play('fl-mount', {
        pos,
        gain: engDbToGain(-9),
        rate: 0.97 + Math.random() * 0.06,
        prio: 4,
      });
    else if (from === 'fly' && to !== 'fly')
      this.eng.play('fl-dismount', {
        pos,
        gain: engDbToGain(-11),
        rate: 0.96 + Math.random() * 0.08,
        prio: 3,
      });
  }
  ensure() {
    for (const key of Object.keys(FLIGHT_LOOPS)) {
      if (this.loops[key]) continue;
      const spec = FLIGHT_LOOPS[key];
      if (!this.eng.bank.has(spec.id)) continue;
      const loop = this.eng.createLoop(spec.id, {
        bus: 'sfx',
        filter: spec.filter,
        freq: spec.freq,
        q: spec.q,
      });
      if (loop) this.loops[key] = loop;
    }
  }
  update(dt) {
    if (!this.eng.running) return;
    this.ensure();
    const state = this.ctx.player?.state;
    const overrides = this.overrides;
    const flying = overrides.fly ?? (state?.mode === 'fly' && !state.dead);
    const paused = (this.ctx.time?.scale ?? 1) <= 0;
    const velocity = state?.velocity;
    const speed =
      overrides.speed ??
      (velocity
        ? Math.hypot(flightNum(velocity.x, 0), flightNum(velocity.y, 0), flightNum(velocity.z, 0))
        : flightNum(state?.speed, 0));
    const boosting = flying && (overrides.boost ?? !!state?.sprinting);
    let painting = false;
    if (flying && !paused) {
      if (overrides.paint !== undefined) painting = overrides.paint;
      else
        try {
          const input = this.ctx.input;
          const held = input.held('attack') || input.held('paint');
          const selectedColor = state?.selectedColor;
          const ink = selectedColor ? flightNum(this.ctx.paint?.ink?.[selectedColor], 1) : 1;
          painting = held && !state?.aiming && (ink > 0.02 || state?.brush === 'chroma');
        } catch {
          painting = false;
        }
    }
    this.flying = !!flying;
    this.flyTime = flying ? this.flyTime + dt : 0;
    const active = flying && !paused ? 1 : 0;
    const loops = this.loops;
    const speedK = flightSmoothstep(3, 32, speed);
    loops.wind?.set(active * engDbToGain(-13) * (0.3 + 0.7 * speedK), active ? 0.25 : 0.4);
    loops.wind?.setFreq(600 + 3400 * speedK, 0.25);
    loops.wind?.setRate(0.85 + 0.35 * speedK, 0.4);
    loops.flutter?.set(active * engDbToGain(-19) * (0.35 + 0.65 * flightSmoothstep(4, 24, speed)), active ? 0.2 : 0.3);
    loops.flutter?.setRate(0.8 + 0.55 * flightSmoothstep(4, 30, speed), 0.3);
    loops.boost?.set(
      boosting && !paused ? engDbToGain(-15.5) * (0.6 + 0.4 * flightSmoothstep(10, 30, speed)) : 0,
      boosting ? 0.12 : 0.35,
    );
    loops.boost?.setFreq(900 + 1800 * speedK, 0.3);
    loops.boost?.setRate(0.9 + 0.2 * speedK, 0.4);
    const selectedColor = state?.selectedColor;
    loops.paint?.set(painting ? engDbToGain(-17) : 0, painting ? 0.06 : 0.15);
    loops.paint?.setRate(
      selectedColor === 'red' ? 0.92 : selectedColor === 'blue' ? 1.08 : selectedColor === 'yellow' ? 1.14 : 1,
      0.2,
    );
    if (boosting && !this.wasBoost && !paused)
      this.eng.play('fl-boost-on', {
        bus: 'sfx',
        gain: engDbToGain(-10),
        rate: 0.96 + Math.random() * 0.08,
      });
    this.wasBoost = boosting;
  }
}
export class PerchHum {
  ctx;
  eng;
  loop = null;
  awakeAt = -1;
  claimed = false;
  force = false;
  constructor(ctx, eng) {
    this.ctx = ctx;
    this.eng = eng;
    ctx.events.on('content:all-shrines', () => {
      const elapsed = flightNum(ctx.time?.elapsed, 0);
      this.awakeAt = elapsed < 2 ? 0 : elapsed + 8.6;
    });
    ctx.events.on('item:get', (data) => {
      if (data?.item === 'brushflight') this.claimed = true;
    });
  }
  claim() {
    this.claimed = true;
  }
  update() {
    if (!this.eng.running) return;
    if (!this.loop && this.eng.bank.has('perch-hum'))
      this.loop = this.eng.createLoop('perch-hum', {
        bus: 'sfx',
        positional: true,
        wet: 0.35,
      });
    const loop = this.loop;
    if (!loop) return;
    let owned = false;
    try {
      owned = !!this.ctx.player?.hasItem?.('brushflight');
    } catch {
      owned = false;
    }
    const elapsed = flightNum(this.ctx.time?.elapsed, 0);
    const awake = this.force || (this.awakeAt >= 0 && elapsed >= this.awakeAt && !this.claimed && !owned);
    const paused = (this.ctx.time?.scale ?? 1) <= 0;
    loop.set(awake ? engDbToGain(paused ? -14 : -7) : 0, awake ? 1.5 : this.claimed ? 0.5 : 1);
    const summit = this.ctx.terrain?.landmarks?.summit;
    if (this.force) {
      const listener = this.eng.listener;
      loop.setPos({
        x: listener.x + 4,
        y: listener.y,
        z: listener.z - 4,
      });
    } else if (summit)
      loop.setPos(
        {
          x: summit.x,
          y: summit.y + 3.6,
          z: summit.z,
        },
        0.5,
      );
  }
}
const FLIGHT_STEP = 60 / 84 / 2;
const FLIGHT_BAR = FLIGHT_STEP * 6;
const FLIGHT_LOOKAHEAD = 0.2;
const FLIGHT_MIX = 0.66;
const FLIGHT_CHORDS = {
  D: {
    bass: 38,
    tones: [50, 57, 62, 66],
  },
  Dsus: {
    bass: 38,
    tones: [50, 57, 62, 64],
  },
  E: {
    bass: 40,
    tones: [52, 56, 59, 64],
  },
  Bm: {
    bass: 47,
    tones: [47, 54, 59, 62],
  },
  G: {
    bass: 43,
    tones: [43, 55, 59, 62],
  },
  A: {
    bass: 45,
    tones: [45, 52, 57, 61],
  },
  'F#m': {
    bass: 42,
    tones: [54, 57, 61, 66],
  },
  Em: {
    bass: 40,
    tones: [52, 55, 59, 64],
  },
};
const FLIGHT_SONG = [
  {
    chord: 'D',
    mel: [
      [69, 1],
      [74, 1],
      [76, 1],
    ],
  },
  {
    chord: 'D',
    mel: [[81, 3]],
  },
  {
    chord: 'E',
    mel: [
      [80, 1.5],
      [78, 1.5],
    ],
  },
  {
    chord: 'E',
    mel: [[76, 3]],
  },
  {
    chord: 'Bm',
    mel: [
      [78, 1],
      [76, 1],
      [74, 1],
    ],
  },
  {
    chord: 'Bm',
    mel: [
      [71, 1.5],
      [74, 1.5],
    ],
  },
  {
    chord: 'G',
    mel: [
      [76, 2],
      [74, 1],
    ],
  },
  {
    chord: 'A',
    mel: [[76, 3]],
  },
  {
    chord: 'D',
    mel: [
      [69, 1],
      [74, 1],
      [76, 1],
    ],
  },
  {
    chord: 'F#m',
    mel: [
      [81, 2],
      [83, 1],
    ],
  },
  {
    chord: 'G',
    mel: [[86, 3]],
  },
  {
    chord: 'G',
    mel: [
      [83, 1.5],
      [81, 1.5],
    ],
  },
  {
    chord: 'Em',
    mel: [
      [79, 1],
      [78, 1],
      [76, 1],
    ],
  },
  {
    chord: 'A',
    mel: [
      [78, 2],
      [76, 1],
    ],
  },
  {
    chord: 'D',
    mel: [[74, 3]],
  },
  {
    chord: 'Dsus',
    mel: [],
  },
];
const FLIGHT_ARP = [0, 1, 2, 4, 3, 2];
export class FlightMusic {
  ctx;
  eng;
  music;
  battle;
  boss;
  sfx;
  state = 'off';
  bar = 0;
  step = 0;
  nextT = 0;
  drive = 0;
  wantT = 0;
  quietT = 0;
  endAt = 0;
  lead = false;
  full = false;
  mix = -1;
  force = null;
  enabled = true;
  constructor(ctx, eng, music, battle, boss, sfx) {
    this.ctx = ctx;
    this.eng = eng;
    this.music = music;
    this.battle = battle;
    this.boss = boss;
    this.sfx = sfx;
  }
  get describe() {
    return this.state === 'off'
      ? 'off'
      : `${this.state} bar ${this.bar % 16} drive ${this.drive.toFixed(2)}${this.lead ? ' +lead' : ''}${this.full ? ' +full' : ''}`;
  }
  fightOn() {
    return this.battle.active || this.boss.active;
  }
  update(dt) {
    if (!this.eng.running || !this.enabled) return;
    const state = this.ctx.player?.state;
    const flying = this.force !== null || this.sfx.isFlying;
    let target = 0;
    if (this.force !== null) target = this.force;
    else if (flying && state) {
      const height =
        state.position.y - flightNum(floorHeightAt(this.ctx, state.position.x, state.position.z, state.position.y), 0);
      const velocity = state.velocity;
      const speed = velocity
        ? Math.hypot(flightNum(velocity.x, 0), flightNum(velocity.y, 0), flightNum(velocity.z, 0))
        : flightNum(state.speed, 0);
      target = flightClamp(
        0.25 +
          0.4 * flightSmoothstep(8, 55, height) +
          0.3 * flightSmoothstep(9, 26, speed) +
          (state.sprinting ? 0.15 : 0),
        0,
        1,
      );
      if (height > 10 || speed > 13) this.wantT += dt;
      else this.wantT = Math.max(0, this.wantT - dt * 0.5);
    } else this.wantT = 0;
    this.drive += (target - this.drive) * (1 - Math.exp(-dt * 0.6));
    const fighting = this.fightOn();
    if (this.state === 'off') {
      if (!fighting && flying && (this.force !== null || (this.sfx.secondsFlying > 3.5 && this.wantT > 2.5)))
        this.begin();
      return;
    }
    if (this.state === 'playing') {
      if (flying) this.quietT = 0;
      else this.quietT += dt;
      if (fighting) this.end(true);
      else if (this.quietT > 2.2) this.end(false);
    }
    const now = this.eng.now;
    if (this.state === 'playing') {
      const mix = FLIGHT_MIX * (0.8 + 0.2 * this.drive);
      for (
        Math.abs(mix - this.mix) > 0.02 && ((this.mix = mix), this.eng.setFlightMix(mix, 1.2)),
          this.nextT < now - 0.3 && (this.nextT = now + 0.05);
        this.nextT < now + FLIGHT_LOOKAHEAD;
      ) {
        this.schedule(this.nextT);
        this.nextT += FLIGHT_STEP;
      }
    } else if (this.state === 'ending' && now >= this.endAt) this.state = 'off';
  }
  begin() {
    this.state = 'playing';
    this.quietT = 0;
    this.music.suspend();
    const now = this.eng.now;
    this.mix = FLIGHT_MIX * 0.85;
    this.eng.setFlightMix(this.mix, 1.4);
    this.bar = 0;
    this.step = 0;
    const at = now + 0.9;
    [62, 66, 69, 74, 78, 81, 86].forEach((midi, i) =>
      this.inst('harp', midi, at - 0.5 + i * 0.07, engDbToGain(-13), -0.6 + i * 0.2, 2.5),
    );
    this.nextT = at;
  }
  end(forFight) {
    if (this.state !== 'playing') return;
    this.state = 'ending';
    const fade = forFight ? 0.35 : 1.6;
    this.eng.setFlightMix(0, fade);
    this.endAt = this.eng.now + fade * 5;
    if (!forFight) this.music.resume(fade * 3 + 2);
  }
  debugStart(force) {
    this.force = force;
    if (this.state !== 'playing') this.begin();
  }
  debugStop() {
    this.force = null;
    this.end(false);
  }
  schedule(time) {
    const pos = this.step % 6;
    if (pos === 0) {
      this.bar = Math.floor(this.step / 6);
      if ((this.bar % 16) % 4 == 0) {
        this.lead = this.drive > 0.38 || this.force !== null;
        this.full = this.drive > 0.68;
      }
    }
    const songBar = this.bar % 16;
    const measure = FLIGHT_SONG[songBar];
    const chord = FLIGHT_CHORDS[measure.chord];
    const phraseBar = songBar % 8;
    if (pos === 0) {
      this.eng.playPad(
        chord.tones.map((tone) => (tone < 50 ? tone + 12 : tone)),
        time - 0.05,
        FLIGHT_BAR * 1.02,
        0.05 + 0.02 * this.drive,
        0.5,
        1.2,
        1100 + 700 * this.drive,
        'flight',
      );
      this.inst('piano', chord.bass, time, engDbToGain(-9), -0.15, FLIGHT_BAR * 1.1);
      if (this.full)
        this.inst('piano', chord.bass + 7, time + FLIGHT_STEP * 4, engDbToGain(-14), -0.1, FLIGHT_BAR * 0.5);
    }
    const arpNote = [...chord.tones, chord.tones[0] + 12, chord.tones[1] + 12].map((midi) =>
      midi < 55 ? midi + 12 : midi,
    )[FLIGHT_ARP[pos]];
    const accent = pos === 0 ? 1 : pos === 3 ? 0.85 : 0.7;
    this.inst(
      'harp',
      arpNote,
      time,
      engDbToGain(-15) * accent * (0.8 + 0.3 * this.drive),
      -0.35 + (pos / 6) * 0.7,
      FLIGHT_STEP * 3,
    );
    if (this.lead && pos === 0) {
      let beat = 0;
      for (const [midi, beats] of measure.mel) {
        const at = time + beat * FLIGHT_STEP * 2;
        const dur = beats * FLIGHT_STEP * 2 * 0.98;
        this.flute(midi, at, engDbToGain(-9) * (0.85 + 0.25 * this.drive), 0.1, dur);
        if (beats >= 1.5 || this.full)
          this.inst('celesta', midi + 12, at + 0.01, engDbToGain(this.full ? -17 : -20), 0.35, Math.min(dur, 1.6));
        beat += beats;
      }
      if (!measure.mel.length)
        [74, 78, 81, 86].forEach((midi, i) =>
          this.inst('celesta', midi + 12, time + FLIGHT_STEP * (2 + i), engDbToGain(-19), 0.4 - i * 0.25, 1.2),
        );
    }
    if (this.full && pos === 0) {
      if (phraseBar % 2 == 0) {
        this.choir(
          chord.tones[1] < 55 ? chord.tones[1] + 12 : chord.tones[1],
          time,
          engDbToGain(-15),
          -0.3,
          FLIGHT_BAR * 2,
        );
        this.choir(
          chord.tones[2] < 57 ? chord.tones[2] + 12 : chord.tones[2],
          time + 0.02,
          engDbToGain(-17),
          0.3,
          FLIGHT_BAR * 2,
        );
      }
      if (songBar >= 9 && songBar <= 11) this.brass(chord.bass + 12, time, engDbToGain(-13), 0, FLIGHT_BAR * 0.95);
    }
    if (this.full && songBar === 8 && pos === 0) {
      for (let i = 0; i < 6; i++)
        this.eng.playNote(
          'bm-timp',
          1,
          time - FLIGHT_BAR * 0.5 + (FLIGHT_STEP / 2) * i,
          engDbToGain(-22 + i * 1.5),
          0,
          undefined,
          {
            bus: 'flight',
            variation: 2,
          },
        );
      this.eng.playNote('bm-timp', 1, time, engDbToGain(-12), 0, undefined, {
        bus: 'flight',
        variation: 0,
      });
    }
    this.step++;
  }
  inst(inst, midi, time, gain, pan, dur) {
    const [lo, hi] = INSTRUMENT_RANGES[inst];
    let pitch = midi;
    for (; pitch < lo - 2;) pitch += 12;
    for (; pitch > hi + 2;) pitch -= 12;
    const root = Math.min(hi, Math.max(lo, lo + Math.round((pitch - lo) / 4) * 4));
    this.eng.playNote(`${inst}:${root}`, 2 ** ((pitch - root) / 12), time, gain, pan, dur, {
      bus: 'flight',
      release: 0.25,
    });
  }
  sampler(prefix, roots, midi, time, gain, pan, dur, release) {
    let best = roots[0];
    for (const root of roots) if (Math.abs(root - midi) < Math.abs(best - midi)) best = root;
    this.eng.playNote(`${prefix}:${best}`, 2 ** ((midi - best) / 12), time, gain, pan, dur, {
      bus: 'flight',
      release,
    });
  }
  flute(midi, time, gain, pan, dur) {
    this.sampler('fm-flute', FLUTE_ROOTS, midi, time, gain, pan, Math.min(dur, 3.1), 0.18);
  }
  choir(midi, time, gain, pan, dur) {
    this.sampler('bm-choir', CHOIR_ROOTS, midi, time, gain, pan, Math.min(dur, 3.2), 0.5);
  }
  brass(midi, time, gain, pan, dur) {
    this.sampler('bm-brass', BRASS_ROOTS, midi, time, gain, pan, Math.min(dur, 2.2), 0.2);
  }
}
