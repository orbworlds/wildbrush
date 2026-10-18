/**
 * Greymaw's boss music: three phases at 84, 112 and 140 BPM with gongs, timpani, choir, brass and the stolen motifs, a victory fanfare when the boss falls, and dips or fades when the hero goes down or the fight resets.
 */
import { PIZZ_RANGE } from './battle-recipes.js';
import { BRASS_ROOTS, CHOIR_ROOTS } from './boss-sounds.js';
import { INSTRUMENT_RANGES } from './core-recipes.js';
import { engDbToGain } from './engine.js';
const BOSS_LOOKAHEAD = 0.18;
const BOSS_MIX = 0.56;
const BOSS_BPM = [84, 112, 140];
const BOSS_CHORDS = {
  i: {
    root: 0,
    tones: [0, 3, 7],
  },
  bII: {
    root: 1,
    tones: [1, 5, 8],
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
  dim: {
    root: 2,
    tones: [2, 5, 8],
  },
};
const BOSS_PROGRESSIONS = [
  ['i', 'bII', 'bVI', 'V'],
  ['i', 'bVI', 'bVII', 'V'],
  ['i', 'bII', 'dim', 'V'],
];
const STOLEN_MOTIFS = [
  {
    notes: [69, 74, 75, 81, 80, 75],
    inst: 'celesta',
    pan: -0.55,
  },
  {
    notes: [81, 77, 75, 74, 69, 74],
    inst: 'celesta',
    pan: 0.55,
  },
  {
    notes: [69, 81, 74, 81, 76, 81],
    inst: 'harp',
    pan: -0.3,
  },
  {
    notes: [74, 75, 77, 79, 81, 86],
    inst: 'harp',
    pan: 0.3,
  },
];
const BOSS_VICTORY_THEME = [
  [69, 1],
  [74, 0.5],
  [76, 0.5],
  [81, 2],
  [78, 1],
  [76, 1],
  [74, 3],
];
export class BossMusic {
  ctx;
  eng;
  music;
  battle;
  state = 'off';
  step = 0;
  nextT = 0;
  phase = 1;
  wantPhase = 1;
  endAt = 0;
  resumeAt = 0;
  stolenIdx = 0;
  enabled = true;
  constructor(ctx, eng, music, battle) {
    this.ctx = ctx;
    this.eng = eng;
    this.music = music;
    this.battle = battle;
  }
  get active() {
    return this.state !== 'off';
  }
  get describe() {
    return this.state === 'off' ? 'off' : `${this.state} phase ${this.phase} bar ${Math.floor(this.step / 16)}`;
  }
  get stepLen() {
    return 60 / BOSS_BPM[Math.min(2, Math.max(0, this.phase - 1))] / 4;
  }
  start() {
    if (!this.eng.ac || !this.enabled) return;
    const now = this.eng.now;
    this.battle.enabled = false;
    this.battle.abort();
    this.music.suspend();
    this.eng.setMusicMix(0, BOSS_MIX, 0.3);
    if (this.state !== 'playing') {
      this.state = 'playing';
      this.phase = this.wantPhase = 1;
      this.step = 0;
      this.stolenIdx = 0;
      this.play('bm-gong', now + 0.05, engDbToGain(-6), 0);
      this.play('bm-boom', now + 0.05, engDbToGain(-3), 0);
      this.choir(38, now + 0.1, engDbToGain(-8), -0.2, (60 / 84) * 4 * 1.5);
      this.choir(39, now + 0.4, engDbToGain(-12), 0.25, (60 / 84) * 4 * 1.2);
      this.nextT = now + 0.1 + (60 / 84) * 4 * 1.5;
    }
  }
  setPhase(phase) {
    const next = Math.max(1, Math.min(3, Math.round(phase) || 1));
    this.wantPhase = next;
  }
  victory() {
    if (this.state === 'off' || !this.eng.ac) return;
    this.state = 'victory';
    const at = this.eng.now + 2.6;
    const beat = 60 / 76;
    this.eng.playPad([38, 50, 57, 62, 66], at - 0.4, beat * 12, 0.09, 1.2, 4, 1300, 'battle');
    this.choir(50, at, engDbToGain(-9), -0.3, beat * 6);
    this.choir(57, at, engDbToGain(-11), 0.1, beat * 6);
    this.choir(66, at + 0.05, engDbToGain(-13), 0.35, beat * 6);
    this.play('bm-timp', at, engDbToGain(-6), 0, 0);
    this.play('bt-crash', at, engDbToGain(-14), 0.2, 0);
    let time = at + beat;
    for (const [midi, beats] of BOSS_VICTORY_THEME) {
      this.brass(midi - 12, time, engDbToGain(-7), 0.05, Math.min(1.8, beats * beat * 0.95));
      this.note('celesta', midi + 12, time + 0.01, engDbToGain(-15), 0.3, 1);
      time += beats * beat;
    }
    [62, 66, 69, 74, 78, 81, 86, 90].forEach((midi, i) =>
      this.note('harp', midi, time + i * 0.06, engDbToGain(-12), -0.6 + i * 0.17, 2.5),
    );
    this.play('bm-timp', time, engDbToGain(-7), 0, 0);
    this.endAt = time + 3;
    this.resumeAt = time + 4.5;
  }
  reset() {
    if (this.state !== 'off' && this.eng.ac) {
      this.state = 'fading';
      this.eng.setMusicMix(0, 0, 0.7);
      this.endAt = this.eng.now + 2.2;
      this.resumeAt = this.endAt + 0.5;
    }
  }
  heroDown() {
    if (this.state === 'playing' && this.eng.ac) this.eng.setMusicMix(0, BOSS_MIX * 0.2, 0.4);
  }
  heroBack(bossActive) {
    if (this.state === 'playing' && this.eng.ac)
      if (bossActive) this.eng.setMusicMix(0, BOSS_MIX, 1.2);
      else this.reset();
  }
  stop() {
    this.state = 'off';
    this.battle.enabled = true;
  }
  update() {
    if (this.state === 'off' || !this.eng.running) return;
    const now = this.eng.now;
    if (this.state === 'playing') {
      for (this.nextT < now - 0.3 && (this.nextT = now + 0.05); this.nextT < now + BOSS_LOOKAHEAD;) {
        if (this.step % 16 == 0 && this.wantPhase !== this.phase) this.changePhase(this.nextT);
        this.scheduleStep(this.step, this.nextT);
        this.step++;
        this.nextT += this.stepLen;
      }
      return;
    }
    if (now >= this.endAt && this.resumeAt > 0) {
      this.eng.setMusicMix(1, 0, 1.8);
      this.music.resume(Math.max(2, this.resumeAt - now));
      this.resumeAt = 0;
      this.battle.enabled = true;
    }
    if (now >= this.endAt + 4) this.state = 'off';
  }
  changePhase(time) {
    const rising = this.wantPhase > this.phase;
    this.phase = this.wantPhase;
    this.step = 0;
    if (rising) {
      this.play('bm-gong', time, engDbToGain(-7), 0);
      this.play('bm-boom', time, engDbToGain(-2), 0);
      this.play('bt-crash', time, engDbToGain(-12), 0.2, 0);
      this.play('bt-swell', time - 1.15, engDbToGain(-12), 0, 0);
      this.choir(50, time, engDbToGain(-9), -0.2, 1.4);
      this.choir(51, time, engDbToGain(-11), 0.2, 1.4);
    }
  }
  chordAt(bar) {
    return BOSS_CHORDS[BOSS_PROGRESSIONS[Math.min(2, this.phase - 1)][Math.floor((bar % 8) / 2)]];
  }
  scheduleStep(step, time) {
    const bar = Math.floor(step / 16);
    const pos = step % 16;
    const phraseBar = bar % 8;
    const chord = this.chordAt(bar);
    const rootPc = (chord.root + 12) % 12;
    const bass = 38 + rootPc - (rootPc > 6 ? 12 : 0);
    const barLen = this.stepLen * 16;
    const chordChange = pos === 0 && phraseBar % 2 == 0;
    const phase = this.phase;
    if (phase === 1) {
      if (pos === 0) {
        this.play('bm-boom', time, engDbToGain(-4), 0);
        this.play('bm-timp', time, engDbToGain(phraseBar % 2 ? -10 : -6), -0.1, phraseBar % 2 ? 2 : 0);
        this.piano(bass - 12, time, engDbToGain(-6), -0.2, barLen * 1.2);
        this.piano(bass, time, engDbToGain(-9), -0.1, barLen * 1.2);
      }
      if (pos === 8) this.play('bm-timp', time, engDbToGain(-13), 0.1, 1);
      if (pos === 6 || pos === 10) this.pizz(bass, time, engDbToGain(pos === 6 ? -8 : -10), -0.1);
      if (pos === 12) this.play('bt-taiko', time, engDbToGain(-13), 0.15);
      if (phraseBar === 7 && pos >= 8 && pos % 2 == 0)
        this.play('bt-tom', time, engDbToGain(-12 + (pos - 8)), -0.3 + (pos - 8) * 0.08, (pos >> 1) % 3);
      if (chordChange) {
        const voicing = chord.tones.map((tone) => 50 + ((tone + 12) % 12));
        this.choir(bass, time, engDbToGain(-9), -0.2, barLen * 2);
        this.choir(voicing[1] + (voicing[1] < 52 ? 12 : 0), time + 0.02, engDbToGain(-13), 0.25, barLen * 2);
        if (phraseBar === 0 && bar > 0) this.play('bm-gong', time, engDbToGain(-12), 0);
      }
      if (pos === 0 && phraseBar % 4 == 0) this.brass(bass + 12, time, engDbToGain(-8), 0, barLen * 0.95);
      if (pos === 0 && phraseBar % 4 == 1) this.brass(bass + 15, time, engDbToGain(-9), 0, barLen * 0.45);
      if (pos === 8 && phraseBar % 4 == 1) this.brass(bass + 13, time, engDbToGain(-9), 0, barLen * 0.45);
      if (pos === 10 && phraseBar % 2 == 1)
        this.note('celesta', 86 + +(bar % 4 == 1), time, engDbToGain(-17), bar % 4 == 1 ? 0.5 : -0.5, 1.5);
      return;
    }
    const accent = phase === 2 ? [0, 3, 6, 8, 11, 14].includes(pos) : pos % 4 == 0;
    if (pos % 2 == 0)
      this.play(
        'bt-shaker',
        time + (pos % 4 == 2 ? this.stepLen * 0.05 : 0),
        engDbToGain(accent ? -15 : -20),
        (Math.random() - 0.5) * 0.5,
      );
    if (phase === 2) {
      if (pos === 0 || pos === 8) this.play('bm-boom', time, engDbToGain(pos === 0 ? -5 : -9), 0);
      if (accent) this.play('bt-taiko', time, engDbToGain(pos === 0 ? -8 : -11), -0.1);
      if (pos === 4 || pos === 12) this.play('bt-clack', time, engDbToGain(-14), 0.15);
    } else {
      if (pos % 4 == 0) this.play('bt-taiko', time, engDbToGain(pos === 0 ? -6 : -9), -0.1);
      if (pos === 0 || pos === 8) this.play('bm-boom', time, engDbToGain(-5), 0);
      if (pos === 4 || pos === 12) {
        this.play('bt-clack', time, engDbToGain(-12), 0.15);
        if (bar % 2 == 1) this.play('bm-anvil', time, engDbToGain(-18), pos === 4 ? -0.35 : 0.35);
      }
      if (bar % 2 == 1 && pos >= 12)
        this.play('bt-tom', time, engDbToGain(-11 + (pos - 12)), -0.2 + (pos - 12) * 0.12, pos % 3);
      if (pos === 0 && bar % 2 == 0) this.play('bt-crash', time, engDbToGain(-16), 0.2, 0);
    }
    if (phraseBar === 7 && pos >= 8 && phase === 2 && pos % 2 == 0)
      this.play('bt-tom', time, engDbToGain(-11 + (pos - 8) * 0.5), -0.3 + (pos - 8) * 0.08, (pos >> 1) % 3);
    if (pos === 0 && phraseBar === 0 && bar > 0) this.play('bt-crash', time, engDbToGain(-14), 0.2, 0);
    if (phase === 2) {
      if (accent) this.pizz(bass + (pos === 6 || pos === 14 ? 12 : 0), time, engDbToGain(pos === 0 ? -5 : -8), -0.15);
    } else {
      const pedal = 38 + (bar % 4);
      if (pos % 2 == 0) this.pizz(pedal + (pos % 4 == 2 ? 12 : 0), time, engDbToGain(pos % 4 == 0 ? -5 : -9), -0.15);
    }
    const riffBase = 50 + rootPc - (rootPc > 6 ? 12 : 0);
    const interval = (
      phase === 2
        ? [0, -1, 7, 12, -1, 7, 1, 7, 0, -1, 7, 12, 13, 12, 7, -1]
        : [0, 12, 7, 12, 1, 12, 7, 12, 0, 12, 7, 13, 12, 7, 3, 7]
    )[pos];
    if (interval >= 0) this.piano(riffBase + interval, time, engDbToGain(accent ? -7 : -10), 0.2, this.stepLen * 0.85);
    if (phase === 2 && chordChange) {
      this.choir(bass + 12, time, engDbToGain(-10), -0.25, barLen * 2);
      this.choir(50 + ((chord.tones[1] + 12) % 12) + 12, time + 0.02, engDbToGain(-13), 0.25, barLen * 2);
    }
    if (phase === 3 && (pos === 0 || pos === 10)) {
      this.choir(bass + 12, time, engDbToGain(-10), -0.2, this.stepLen * (pos === 0 ? 5 : 4));
      this.choir(bass + 15, time, engDbToGain(-13), 0.2, this.stepLen * (pos === 0 ? 5 : 4));
    }
    if (phase === 2 ? pos === 0 || (pos === 6 && bar % 2 == 1) : pos === 0 || pos === 3 || pos === 6 || pos === 10)
      this.brass(bass + 12, time, engDbToGain(phase === 3 ? -9 : -8), 0, this.stepLen * (phase === 3 ? 2 : 3));
    if (pos === 0 && (phase === 3 || bar % 2 == 1)) {
      const motif = STOLEN_MOTIFS[this.stolenIdx % STOLEN_MOTIFS.length];
      this.stolenIdx++;
      const spacing = this.stepLen * (phase === 3 ? 1 : 2);
      motif.notes.forEach((note, i) => {
        this.note(
          motif.inst,
          note + 0,
          time + i * spacing,
          engDbToGain(phase === 3 ? -13 : -11),
          motif.pan,
          spacing * 1.6,
        );
        if (i % 2 == 0)
          this.note('celesta', note + 12, time + i * spacing + 0.004, engDbToGain(-19), -motif.pan, spacing * 1.4);
      });
    }
  }
  play(id, time, gain, pan, variation) {
    const variant = variation ?? Math.floor(Math.random() * 3);
    this.eng.playNote(id, 1, time, gain, pan, undefined, {
      bus: 'battle',
      variation: variant,
    });
  }
  sampler(prefix, roots, midi, time, gain, pan, dur, release) {
    let best = roots[0];
    for (const root of roots) if (Math.abs(root - midi) < Math.abs(best - midi)) best = root;
    this.eng.playNote(`${prefix}:${best}`, 2 ** ((midi - best) / 12), time, gain, pan, dur, {
      bus: 'battle',
      release,
    });
  }
  choir(midi, time, gain, pan, dur) {
    this.sampler('bm-choir', CHOIR_ROOTS, midi, time, gain, pan, Math.min(dur, 3.2), 0.35);
  }
  brass(midi, time, gain, pan, dur) {
    this.sampler('bm-brass', BRASS_ROOTS, midi, time, gain, pan, Math.min(dur, 2.2), 0.12);
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
}
