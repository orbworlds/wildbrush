/**
 * Battle music: its 144 BPM timing, minor-key chords and progressions, piano riff cells, accent steps and melody phrases, sequenced with taiko, shakers, pizzicato bass and piano while the hero fights, ending in a victory or escape cadence.
 */
import { PIZZ_RANGE } from './battle-recipes.js';
import { BRASS_ROOTS, CHOIR_ROOTS } from './boss-sounds.js';
import { INSTRUMENT_RANGES } from './core-recipes.js';
import { engDbToGain } from './engine.js';
const BATTLE_STEP = 60 / 144 / 4;
const BATTLE_BAR = BATTLE_STEP * 16;
const BATTLE_LOOKAHEAD = 0.16;
const BATTLE_MIX = 0.5;
const BATTLE_CHORDS = {
  i: {
    root: 0,
    tones: [0, 3, 7],
  },
  bVI: {
    root: 8,
    tones: [8, 0, 3],
  },
  bVII: {
    root: 10,
    tones: [10, 2, 5],
  },
  V: {
    root: 7,
    tones: [7, 11, 2],
  },
  iv: {
    root: 5,
    tones: [5, 8, 0],
  },
  bII: {
    root: 1,
    tones: [1, 5, 8],
  },
};
const BATTLE_PROG_MAIN = ['i', 'bVI', 'bVII', 'V'];
const BATTLE_PROG_ALT = ['iv', 'i', 'bVI', 'V'];
const BATTLE_PROG_TENSE = ['i', 'bII', 'i', 'V'];
const BATTLE_CELLS = [
  [0, -1, 2, 0, 3, -1, 2, -1, 0, -1, 2, 0, 1, -1, 2, 1],
  [0, 0, 2, -1, 0, 0, 3, -1, 0, 0, 2, -1, 1, 1, 2, -1],
  [0, -1, -1, 2, -1, -1, 3, -1, 0, -1, -1, 2, -1, -1, 1, 2],
];
const BATTLE_ACCENTS = new Set([0, 3, 6, 8, 11, 14]);
const BATTLE_MELODY = [
  [
    [69, 1],
    [74, 0.5],
    [76, 0.5],
    [77, 2],
    [76, 1],
    [74, 1],
    [69, 2],
  ],
  [
    [70, 1],
    [74, 0.5],
    [77, 0.5],
    [81, 2],
    [79, 1],
    [77, 1],
    [74, 2],
  ],
  [
    [72, 1],
    [76, 0.5],
    [79, 0.5],
    [76, 2],
    [74, 1],
    [72, 1],
    [76, 2],
  ],
  [
    [73, 1],
    [76, 0.5],
    [81, 0.5],
    [79, 2],
    [77, 1],
    [76, 1],
    [73, 2],
  ],
];
export class BattleMusic {
  ctx;
  eng;
  music;
  phase = 'off';
  step = 0;
  nextT = 0;
  cycle = 0;
  endAt = 0;
  resumeAt = 0;
  cell = 0;
  heavy = false;
  elite = null;
  startedAt = -1000000000;
  lastKill = -1000000000;
  enabled = true;
  constructor(ctx, eng, music) {
    this.ctx = ctx;
    this.eng = eng;
    this.music = music;
  }
  get active() {
    return this.phase !== 'off';
  }
  get playing() {
    return this.phase === 'playing';
  }
  get state() {
    return `${this.phase}${this.heavy ? ' heavy' : ''}${this.elite ? ` elite:${this.elite}` : ''} bar ${Math.floor(this.step / 16)}`;
  }
  start(sting = 'bt-sting') {
    if (!this.eng.ac || !this.enabled) return;
    const now = this.eng.now;
    if (this.phase !== 'playing') {
      if (this.phase === 'ending') {
        this.phase = 'playing';
        this.eng.setMusicMix(0, BATTLE_MIX, 0.15);
        this.music.suspend();
        return;
      }
      this.phase = 'playing';
      this.startedAt = now;
      this.music.suspend();
      this.eng.setMusicMix(0, BATTLE_MIX, 0.25);
      this.play(sting, now + 0.02, engDbToGain(sting === 'bt-sting' ? -2 : -1), 0, 0);
      this.step = 0;
      this.cycle = 0;
      this.cell = Math.floor(Math.random() * BATTLE_CELLS.length);
      this.nextT = now + 0.02 + BATTLE_BAR * 0.5;
    }
  }
  stop(won) {
    if (this.phase !== 'playing' || !this.eng.ac) return;
    this.phase = 'ending';
    const beat = BATTLE_STEP * 4;
    const stepsToBeat = (4 - (this.step % 4)) % 4;
    const at = this.nextT + stepsToBeat * BATTLE_STEP + 0;
    if (won) this.victoryCadence(at, beat);
    else this.escapeCadence(at, beat);
    this.endAt = at + beat * 4;
    this.resumeAt = at + beat * 6;
  }
  abort() {
    this.phase = 'off';
    this.resumeAt = 0;
  }
  kill() {
    if (this.phase !== 'off') {
      this.phase = 'ending';
      this.eng.setMusicMix(0, 0, 0.25);
      this.endAt = this.eng.now + 0.8;
      this.resumeAt = this.eng.now + 7;
    }
  }
  update() {
    if (this.phase === 'off' || !this.eng.running) return;
    const now = this.eng.now;
    if (this.phase === 'playing') {
      for (this.nextT < now - 0.25 && (this.nextT = now + 0.05); this.nextT < now + BATTLE_LOOKAHEAD;) {
        this.scheduleStep(this.step, this.nextT);
        this.step++;
        this.nextT += BATTLE_STEP;
      }
      return;
    }
    if (now >= this.endAt && this.resumeAt > 0) {
      this.eng.setMusicMix(1, 0, 1.6);
      this.music.resume(Math.max(2, this.resumeAt - now));
      this.resumeAt = 0;
    }
    if (now >= this.endAt + 3) this.phase = 'off';
  }
  chordAt(bar) {
    const phrase = Math.floor(bar / 8);
    return BATTLE_CHORDS[
      (this.elite
        ? phrase % 3 == 1
          ? BATTLE_PROG_MAIN
          : BATTLE_PROG_TENSE
        : this.heavy
          ? phrase % 2
            ? BATTLE_PROG_MAIN
            : BATTLE_PROG_TENSE
          : phrase % 3 == 2
            ? BATTLE_PROG_ALT
            : BATTLE_PROG_MAIN)[Math.floor((bar % 8) / 2)]
    ];
  }
  scheduleStep(step, time) {
    const bar = Math.floor(step / 16);
    const pos = step % 16;
    const phraseBar = bar % 8;
    const phrase = Math.floor(bar / 8);
    const chord = this.chordAt(bar);
    const intense = this.heavy || !!this.elite;
    const root = chord.root;
    const swung = time + (pos % 2 ? BATTLE_STEP * 0.04 : 0);
    if (pos === 0 && phraseBar === 0 && bar > 0) {
      this.cycle++;
      this.cell = (this.cell + 1 + Math.floor(Math.random() * 2)) % BATTLE_CELLS.length;
    }
    const accent = BATTLE_ACCENTS.has(pos);
    if (pos % 2 == 0)
      this.play(
        'bt-shaker',
        swung,
        engDbToGain(accent ? -15 : -20) * (0.85 + Math.random() * 0.3),
        (Math.random() - 0.5) * 0.5,
      );
    if (intense) {
      if (accent) this.play('bt-taiko', time, engDbToGain(pos === 0 || pos === 8 ? -7 : -10), -0.1);
    } else {
      if (pos === 0 || pos === 8) this.play('bt-taiko', time, engDbToGain(pos === 0 ? -8 : -10), -0.1);
      if (pos === 6 || pos === 14) this.play('bt-taiko', time, engDbToGain(-15), 0.1);
    }
    if (bar >= 2 && (pos === 4 || pos === 12)) this.play('bt-clack', time, engDbToGain(intense ? -12 : -14), 0.15);
    if (phraseBar === 7 && pos >= 8) {
      if (pos % 2 == 0 || pos >= 12)
        this.play('bt-tom', time, engDbToGain(-11 + (pos - 8) * 0.5), -0.3 + (pos - 8) * 0.08, (pos >> 1) % 3);
      if (pos === 12) this.play('bt-swell', time - 1.15 + BATTLE_STEP * 4, engDbToGain(-14), 0);
    }
    if (phraseBar === 0 && pos === 0 && bar > 0) this.play('bt-crash', time, engDbToGain(-15), 0.2);
    if (accent) {
      const octave = pos === 6 || pos === 14 ? 12 : 0;
      this.pizz(38 + ((root + 12) % 12) - (root > 6 ? 12 : 0) + octave, time, engDbToGain(pos === 0 ? -5 : -8), -0.15);
    }
    const degree = BATTLE_CELLS[this.cell][pos];
    if (degree >= 0) {
      const base = 62 + ((chord.tones[0] + 12) % 12);
      const voicing = [chord.tones[0], chord.tones[1], chord.tones[2]].map((tone) => {
        let pitch = 62 + ((tone + 12) % 12);
        for (; pitch < base;) pitch += 12;
        return pitch;
      });
      const midi = degree === 3 ? base + 12 : voicing[degree];
      const vel = accent ? 0.62 : 0.42;
      this.piano(midi, swung, vel * engDbToGain(-4), 0.25, BATTLE_STEP * 0.85);
      if (accent && pos % 8 == 0) this.piano(midi - 12, time, vel * engDbToGain(-8), -0.2, BATTLE_STEP * 1.5);
    }
    if (pos === 0 && phraseBar % 2 == 0) {
      const bass = 38 + ((root + 12) % 12) - (root > 6 ? 12 : 0);
      this.piano(bass, time, engDbToGain(-6), -0.25, BATTLE_BAR * 1.6);
      this.piano(bass + 12, time, engDbToGain(-9), -0.2, BATTLE_BAR * 1.6);
      const voicing = chord.tones.map((tone) => 57 + ((tone - 7 + 24) % 12));
      for (const midi of voicing) this.piano(midi, time + 0.005, engDbToGain(-15), 0, BATTLE_STEP * 2.2);
      if (intense) this.eng.playPad([bass, bass + 7, bass + 12], time, BATTLE_BAR * 2, 0.05, 0.3, 0.8, 520, 'battle');
    }
    if (intense && pos % 4 == 0) {
      const bass = 38 + ((root + 12) % 12) - (root > 6 ? 12 : 0);
      this.piano(bass, time, engDbToGain(pos === 0 ? -6 : -10), -0.3, BATTLE_STEP * 2);
    }
    if (this.elite) this.eliteLayer(bar, pos, phraseBar, chord, time);
    if (phrase % 2 == 1 && !intense && phrase % 3 != 2 && pos === 0 && phraseBar % 2 == 0) {
      let at = time;
      for (const [midi, beats] of BATTLE_MELODY[phraseBar / 2]) {
        const dur = beats * BATTLE_STEP * 4;
        this.piano(midi + 12, at, engDbToGain(-5), 0.1, Math.min(dur * 0.9, 0.5));
        this.note('celesta', midi + 24, at + 0.004, engDbToGain(-16), 0.35, Math.min(dur, 0.8));
        at += dur;
      }
    }
  }
  eliteLayer(bar, pos, phraseBar, chord, time) {
    const rootPc = (chord.root + 12) % 12;
    const bass = 38 + rootPc - (rootPc > 6 ? 12 : 0);
    if (pos === 0 && phraseBar % 2 == 0) {
      this.sampler('bm-brass', BRASS_ROOTS, bass + 12, time, engDbToGain(-8), 0, BATTLE_STEP * 5, 0.12);
      this.sampler('bm-choir', CHOIR_ROOTS, bass + 12, time + 0.01, engDbToGain(-12), -0.25, BATTLE_BAR * 2, 0.35);
      this.sampler(
        'bm-choir',
        CHOIR_ROOTS,
        50 + ((chord.tones[1] + 12) % 12),
        time + 0.02,
        engDbToGain(-15),
        0.25,
        BATTLE_BAR * 2,
        0.35,
      );
    }
    if (pos === 10 && bar % 2 == 1)
      this.sampler('bm-brass', BRASS_ROOTS, bass + 12, time, engDbToGain(-11), 0, BATTLE_STEP * 2, 0.1);
    switch (this.elite) {
      case 'red':
        if ((pos === 4 || pos === 12) && bar % 2 == 1)
          this.play('bm-anvil', time, engDbToGain(-19), pos === 4 ? -0.3 : 0.3);
        break;
      case 'blue':
        if (pos % 4 == 2 && bar % 2 == 0)
          this.note(
            'celesta',
            86 + ((chord.tones[(pos >> 2) % 3] + 12) % 12),
            time,
            engDbToGain(-19),
            0.4,
            BATTLE_STEP * 2,
          );
        break;
      case 'yellow':
        if (pos % 2 == 1 && bar % 2 == 1) this.play('bt-clack', time, engDbToGain(-19), -0.3);
        break;
      case 'green':
        if (pos % 2 == 0 && phraseBar % 2 == 1)
          this.note(
            'harp',
            62 + ((chord.tones[(pos >> 1) % 3] + 12) % 12) + (pos >= 8 ? 12 : 0),
            time,
            engDbToGain(-15),
            -0.3 + pos * 0.04,
            BATTLE_STEP * 3,
          );
    }
  }
  sampler(prefix, roots, midi, time, gain, pan, dur, release) {
    let best = roots[0];
    for (const root of roots) if (Math.abs(root - midi) < Math.abs(best - midi)) best = root;
    this.eng.playNote(`${prefix}:${best}`, 2 ** ((midi - best) / 12), time, gain, pan, dur, {
      bus: 'battle',
      release,
    });
  }
  victoryCadence(at, beat) {
    for (const midi of [45, 57, 61, 64, 69])
      this.piano(midi, at, engDbToGain(midi < 50 ? -5 : -9), (midi - 60) / 30, beat * 0.9);
    this.pizz(45, at, engDbToGain(-5), -0.1);
    this.play('bt-taiko', at, engDbToGain(-9), 0);
    const tonicAt = at + beat * 1.5;
    for (const midi of [38, 50, 57, 62, 66, 69])
      this.piano(midi, tonicAt, engDbToGain(midi < 50 ? -4 : -8), (midi - 60) / 30, beat * 5);
    this.pizz(38, tonicAt, engDbToGain(-4), -0.1);
    this.play('bt-taiko', tonicAt, engDbToGain(-8), 0);
    this.play('bt-crash', tonicAt, engDbToGain(-18), 0.2);
    [62, 66, 69, 74, 78, 81, 86].forEach((midi, i) =>
      this.note('harp', midi, tonicAt + 0.05 + i * 0.06, engDbToGain(-12), -0.5 + i * 0.15, 2.5),
    );
    [86, 90, 93].forEach((midi, i) =>
      this.note('celesta', midi, tonicAt + 0.6 + i * 0.18, engDbToGain(-14), 0.3 - i * 0.2, 2),
    );
    this.eng.playPad([50, 57, 62, 66], tonicAt, beat * 3, 0.05, 0.2, 1.8, 1000, 'battle');
  }
  escapeCadence(at, beat) {
    this.play('bt-taiko', at, engDbToGain(-12), 0);
    this.pizz(38, at, engDbToGain(-7), -0.1);
    for (const midi of [38, 50, 57, 64, 65])
      this.piano(midi, at, engDbToGain(midi < 50 ? -7 : -12), (midi - 60) / 30, beat * 5);
    this.note('celesta', 76, at + beat, engDbToGain(-16), 0.3, 2);
    this.note('celesta', 81, at + beat * 2, engDbToGain(-18), -0.2, 2);
    this.eng.playPad([50, 57, 64], at, beat * 3, 0.04, 0.3, 2, 700, 'battle');
  }
  play(id, time, gain, pan, variation) {
    const variant = variation ?? Math.floor(Math.random() * 4);
    this.eng.playNote(id, 1, time, gain, pan, undefined, {
      bus: 'battle',
      variation: variant,
    });
  }
  piano(midi, time, gain, pan, dur) {
    this.note('piano', midi, time, gain, pan, dur);
  }
  note(inst, midi, time, gain, pan, dur) {
    const [lo, hi] = INSTRUMENT_RANGES[inst];
    let pitch = midi;
    for (; pitch < lo - 2;) pitch += 12;
    for (; pitch > hi + 2;) pitch -= 12;
    const root = Math.min(hi, Math.max(lo, lo + Math.round((pitch - lo) / 4) * 4));
    this.eng.playNote(`${inst}:${root}`, 2 ** ((pitch - root) / 12), time, gain, pan, dur, {
      bus: 'battle',
      release: 0.06,
    });
  }
  pizz(midi, time, gain, pan) {
    const [lo, hi] = PIZZ_RANGE;
    let pitch = midi;
    for (; pitch < lo - 2;) pitch += 12;
    for (; pitch > hi + 2;) pitch -= 12;
    const root = Math.min(hi, Math.max(lo, lo + Math.round((pitch - lo) / 4) * 4));
    this.eng.playNote(`pizz:${root}`, 2 ** ((pitch - root) / 12), time, gain, pan, undefined, {
      bus: 'battle',
    });
  }
  debugStart(heavy) {
    this.heavy = heavy;
    this.start();
  }
  debugStop(won) {
    if (won) this.lastKill = this.eng.now;
    this.stop(won);
  }
}
