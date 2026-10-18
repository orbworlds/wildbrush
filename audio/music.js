/**
 * Exploration music: a generative score that composes phrases, variations and the main motif in the mood of the moment (day, dusk, night, the Aerie, caves, the kiln, the cistern) and queues piano, harp, celesta, flute, choir and pad notes. It swells when a shrine is completed and plays the full theme once all shrines are done.
 */
import { PIZZ_RANGE } from './battle-recipes.js';
import { CHOIR_ROOTS } from './boss-sounds.js';
import { INSTRUMENT_RANGES } from './core-recipes.js';
import { engDbToGain } from './engine.js';
import { FLUTE_ROOTS } from './flight-recipes.js';
const KEY_ROOT = 62;
const MOODS = {
  day: {
    scale: [0, 2, 4, 7, 9],
    color: [6, 11],
    tempo: 66,
    rest: [5, 13],
    range: [64, 86],
    chords: {
      I: {
        root: 0,
        tones: [0, 4, 7, 2],
      },
      II: {
        root: 2,
        tones: [2, 6, 9],
      },
      vi: {
        root: 9,
        tones: [9, 0, 4],
      },
      IV: {
        root: 5,
        tones: [5, 9, 0],
      },
    },
    progressions: [['I'], ['I', 'II'], ['I', 'vi'], ['IV', 'I'], ['vi', 'IV'], ['I', 'II'], ['II', 'I']],
    padP: 0.3,
    bassP: 0.55,
    harpP: 0.22,
    vel: 0.5,
    len: [3, 7],
  },
  dusk: {
    scale: [0, 2, 4, 7, 11],
    color: [9],
    tempo: 60,
    rest: [7, 16],
    range: [62, 84],
    chords: {
      I: {
        root: 0,
        tones: [0, 4, 7, 11],
      },
      IV: {
        root: 5,
        tones: [5, 9, 0, 4],
      },
      vi: {
        root: 9,
        tones: [9, 0, 4, 7],
      },
      iii: {
        root: 4,
        tones: [4, 7, 11],
      },
    },
    progressions: [['I'], ['I', 'IV'], ['vi', 'IV'], ['IV', 'I'], ['iii', 'IV']],
    padP: 0.45,
    bassP: 0.5,
    harpP: 0.15,
    vel: 0.45,
    len: [3, 6],
  },
  night: {
    scale: [0, 2, 3, 7, 10],
    color: [5],
    tempo: 54,
    rest: [9, 22],
    range: [60, 81],
    chords: {
      i: {
        root: 0,
        tones: [0, 3, 7, 2],
      },
      bVI: {
        root: 8,
        tones: [8, 0, 3],
      },
      bVII: {
        root: 10,
        tones: [10, 2, 5],
      },
      iv: {
        root: 5,
        tones: [5, 8, 0],
      },
    },
    progressions: [['i'], ['i', 'bVI'], ['i', 'bVII'], ['iv', 'i'], ['bVI', 'bVII']],
    padP: 0.5,
    bassP: 0.45,
    harpP: 0.05,
    vel: 0.42,
    len: [2, 5],
  },
  aerie: {
    scale: [0, 2, 4, 7, 9],
    color: [6, 11],
    tempo: 62,
    rest: [4, 10],
    range: [69, 91],
    chords: {
      I: {
        root: 0,
        tones: [0, 4, 7, 2],
      },
      II: {
        root: 2,
        tones: [2, 6, 9, 4],
      },
      IV: {
        root: 7,
        tones: [7, 11, 2, 9],
      },
      vi: {
        root: 11,
        tones: [11, 2, 6],
      },
    },
    progressions: [['I'], ['I', 'II'], ['IV', 'I'], ['I', 'IV'], ['vi', 'II'], ['II', 'I'], ['I', 'II', 'IV', 'I']],
    padP: 0.7,
    bassP: 0.3,
    harpP: 0.55,
    vel: 0.4,
    len: [3, 6],
  },
  cave: {
    scale: [0, 3, 5, 7, 10],
    color: [1, 2],
    tempo: 52,
    rest: [8, 18],
    range: [69, 93],
    chords: {
      i: {
        root: 0,
        tones: [0, 3, 7, 2],
      },
      bII: {
        root: 1,
        tones: [1, 5, 8],
      },
      bVII: {
        root: 10,
        tones: [10, 2, 5],
      },
      iv: {
        root: 5,
        tones: [5, 8, 0],
      },
    },
    progressions: [['i'], ['i', 'bII'], ['i', 'bVII'], ['bII', 'i'], ['iv', 'i']],
    padP: 0.55,
    bassP: 0.35,
    harpP: 0.08,
    vel: 0.36,
    len: [2, 4],
  },
  kiln: {
    scale: [0, 2, 3, 7, 8],
    color: [1, 11],
    tempo: 84,
    rest: [2.5, 6],
    range: [62, 81],
    chords: {
      i: {
        root: 0,
        tones: [0, 3, 7],
      },
      bVI: {
        root: 8,
        tones: [8, 0, 3],
      },
      V: {
        root: 7,
        tones: [7, 11, 2],
      },
      iv: {
        root: 5,
        tones: [5, 8, 0],
      },
    },
    progressions: [
      ['i', 'bVI'],
      ['i', 'V'],
      ['i', 'iv', 'V', 'i'],
      ['bVI', 'V'],
      ['i', 'bVI', 'iv', 'V'],
    ],
    padP: 0.35,
    bassP: 0.2,
    harpP: 0.05,
    vel: 0.5,
    len: [4, 7],
  },
  cistern: {
    scale: [0, 2, 3, 7, 9],
    color: [5, 11],
    tempo: 76,
    rest: [3, 7],
    range: [69, 91],
    chords: {
      i: {
        root: 0,
        tones: [0, 3, 7, 2],
      },
      IV: {
        root: 5,
        tones: [5, 9, 0],
      },
      bVII: {
        root: 10,
        tones: [10, 2, 5],
      },
      v: {
        root: 7,
        tones: [7, 10, 2],
      },
    },
    progressions: [
      ['i', 'IV'],
      ['i', 'bVII'],
      ['i', 'IV', 'bVII', 'i'],
      ['v', 'i'],
      ['IV', 'i'],
    ],
    padP: 0.5,
    bassP: 0.2,
    harpP: 0.2,
    vel: 0.42,
    len: [4, 6],
  },
};
const MOTIF = [
  [69, 1],
  [74, 0.5],
  [76, 0.5],
  [81, 2],
  [78, 1],
  [76, 3],
];
const MOTIF_MINOR = [
  [69, 1],
  [74, 0.5],
  [76, 0.5],
  [81, 2],
  [77, 1],
  [76, 3],
];
const RHYTHMS = [
  [1, 1, 2],
  [0.5, 0.5, 1, 2],
  [1, 0.5, 0.5, 1, 3],
  [1.5, 0.5, 2],
  [0.5, 0.5, 0.5, 0.5, 1, 2],
  [2, 1, 3],
  [1, 1, 1, 1, 3],
  [0.75, 0.25, 1, 2],
  [1, 2, 1, 3],
  [0.5, 1.5, 1, 1, 2],
  [1, 1, 0.5, 0.5, 1, 1, 3],
];
const INST_GAIN = {
  piano: engDbToGain(-7),
  celesta: engDbToGain(-10),
  harp: engDbToGain(-9),
  flute: engDbToGain(-10),
  choir: engDbToGain(-15),
  pizz: engDbToGain(-9),
};
const MUSIC_SAMPLERS = {
  flute: {
    prefix: 'fm-flute',
    roots: FLUTE_ROOTS,
    release: 0.2,
    maxLen: 3,
  },
  choir: {
    prefix: 'bm-choir',
    roots: CHOIR_ROOTS,
    release: 0.6,
    maxLen: 3.2,
  },
};
const musicRand = (a, b) => a + (b - a) * Math.random();
const musicRandInt = (lo, hi) => Math.floor(lo + (hi - lo + 1) * Math.random());
const musicPick = (list) => list[Math.floor(Math.random() * list.length)];
const pitchClass = (midi) => (((midi - KEY_ROOT) % 12) + 12) % 12;
export class ExplorationMusic {
  ctx;
  eng;
  queue = [];
  nextPhraseAt = Infinity;
  started = false;
  memory = [];
  lastWasMotif = false;
  celebrateUntil = 0;
  suspended = false;
  enabled = true;
  aerie = false;
  indoor = null;
  moodOverride = null;
  lastMood = 'day';
  phrases = 0;
  constructor(ctx, eng) {
    this.ctx = ctx;
    this.eng = eng;
  }
  mood() {
    if (this.moodOverride) return this.moodOverride;
    if (this.indoor) return this.indoor;
    if (this.aerie) return 'aerie';
    const timeOfDay = Number(this.ctx.environment?.timeOfDay);
    const hour = Number.isFinite(timeOfDay) ? ((timeOfDay % 24) + 24) % 24 : 14;
    return hour >= 7 && hour < 17.5 ? 'day' : (hour >= 5 && hour < 7) || (hour >= 17.5 && hour < 20) ? 'dusk' : 'night';
  }
  start() {
    if (this.started || !this.eng.ac) return;
    this.started = true;
    const at = this.eng.now + 4;
    this.composeMotif(at, 0.36, true);
  }
  get isStarted() {
    return this.started;
  }
  suspend() {
    this.suspended = true;
    const now = this.eng.now;
    this.queue = this.queue.filter((ev) => ev.t < now + 0.05);
    this.nextPhraseAt = Infinity;
  }
  resume(delay = 6) {
    if (this.suspended) {
      this.suspended = false;
      if (this.started) this.nextPhraseAt = this.eng.now + Math.max(0.5, delay);
    }
  }
  get isSuspended() {
    return this.suspended;
  }
  setIndoor(indoor, delay = 3) {
    if (indoor === this.indoor || ((this.indoor = indoor), !this.started || !this.eng.ac)) return;
    const now = this.eng.now;
    this.queue = this.queue.filter((ev) => ev.t < now + 0.1);
    if (!this.suspended) this.nextPhraseAt = now + Math.max(0.5, delay);
  }
  hold(seconds) {
    if (this.started) this.nextPhraseAt = Math.max(this.nextPhraseAt, this.eng.now + seconds);
  }
  update() {
    if (!this.started || !this.eng.running) return;
    const now = this.eng.now;
    if (this.enabled && !this.suspended && this.queue.length === 0 && now + 1.5 >= this.nextPhraseAt)
      this.compose(Math.max(this.nextPhraseAt, now + 1));
    const horizon = now + 0.35;
    for (; this.queue.length && this.queue[0].t < horizon;) {
      const ev = this.queue.shift();
      if (!(ev.t < now - 0.15))
        if (this.enabled)
          if (ev.kind === 'note') this.playNote(ev);
          else if (ev.kind === 'perc') this.eng.playNote(ev.id, 1, ev.t, ev.vel, ev.pan);
          else this.eng.playPad(ev.notes, ev.t, ev.dur, ev.vel, ev.att, ev.rel, ev.cutoff);
    }
  }
  push(ev) {
    this.queue.push(ev);
  }
  sortQueue() {
    this.queue.sort((a, b) => a.t - b.t);
  }
  playNote(note) {
    const sampler = MUSIC_SAMPLERS[note.inst];
    if (sampler) {
      let best = sampler.roots[0];
      for (const root of sampler.roots) if (Math.abs(root - note.midi) < Math.abs(best - note.midi)) best = root;
      this.eng.playNote(
        `${sampler.prefix}:${best}`,
        2 ** ((note.midi - best) / 12),
        note.t,
        note.vel * INST_GAIN[note.inst],
        note.pan,
        Math.min(note.len ?? sampler.maxLen, sampler.maxLen),
        {
          release: sampler.release,
        },
      );
      return;
    }
    if (note.inst === 'pizz') {
      const [lo, hi] = PIZZ_RANGE;
      let midi = note.midi;
      for (; midi < lo - 2;) midi += 12;
      for (; midi > hi + 2;) midi -= 12;
      const root = Math.min(hi, Math.max(lo, lo + Math.round((midi - lo) / 4) * 4));
      this.eng.playNote(`pizz:${root}`, 2 ** ((midi - root) / 12), note.t, note.vel * INST_GAIN.pizz, note.pan);
      return;
    }
    const [lo, hi] = INSTRUMENT_RANGES[note.inst];
    let midi = note.midi;
    for (; midi < lo - 2;) midi += 12;
    for (; midi > hi + 2;) midi -= 12;
    const root = Math.min(hi, Math.max(lo, lo + Math.round((midi - lo) / 4) * 4));
    const rate = 2 ** ((midi - root) / 12);
    this.eng.playNote(`${note.inst}:${root}`, rate, note.t, note.vel * INST_GAIN[note.inst], note.pan, note.len);
  }
  note(time, inst, midi, vel, pan, len) {
    this.push({
      kind: 'note',
      t: time + musicRand(-0.015, 0.015),
      inst,
      midi,
      vel: Math.max(0.05, vel + musicRand(-0.04, 0.04)),
      pan: pan ?? ((midi - 72) / 30) * 0.8,
      len,
    });
  }
  compose(at) {
    const mood = this.mood();
    this.lastMood = mood;
    const spec = MOODS[mood];
    const celebrating = this.eng.now < this.celebrateUntil;
    this.phrases++;
    let end;
    const rnd = Math.random();
    if (!this.lastWasMotif && rnd < (celebrating ? 0.3 : 0.12)) {
      end = this.composeMotif(at, spec.vel * (celebrating ? 1.1 : 0.9), false);
      this.lastWasMotif = true;
    } else if (this.memory.length && rnd < 0.28) {
      end = this.composeVariation(at, mood, celebrating);
      this.lastWasMotif = false;
    } else {
      end = this.composePhrase(at, mood, celebrating);
      this.lastWasMotif = false;
    }
    let rest = musicRand(spec.rest[0], spec.rest[1]);
    if (celebrating) rest = musicRand(2, 6);
    else if (Math.random() < 0.12) rest += musicRand(15, 30);
    this.nextPhraseAt = end + rest;
    this.sortQueue();
  }
  pool(mood, lo, hi) {
    const spec = MOODS[mood];
    const from = lo ?? spec.range[0];
    const to = hi ?? spec.range[1];
    const notes = [];
    for (let i = from; i <= to; i++) if (spec.scale.includes(pitchClass(i))) notes.push(i);
    return notes;
  }
  chordTone(midi, chord, pool) {
    if (chord.tones.includes(pitchClass(midi))) return midi;
    let best = midi;
    let bestDist = Infinity;
    for (const cand of pool) {
      if (!chord.tones.includes(pitchClass(cand))) continue;
      const dist = Math.abs(cand - midi);
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
    return best;
  }
  composePhrase(at, mood, celebrating) {
    const spec = MOODS[mood];
    const beatLen = 60 / (spec.tempo + (celebrating ? 6 : 0));
    const chords = musicPick(spec.progressions).map((numeral) => spec.chords[numeral]);
    const pool = this.pool(mood);
    const count = musicRandInt(spec.len[0], spec.len[1] + +!!celebrating);
    let rhythm = musicPick(RHYTHMS.filter((pattern) => Math.abs(pattern.length - count) <= 1));
    rhythm ||= [1, 1, 2];
    rhythm = rhythm.slice();
    rhythm[rhythm.length - 1] *= musicRand(1.2, 1.8);
    const total = rhythm.reduce((acc, beats) => acc + beats, 0);
    const chordAt = (pos) => chords[Math.min(chords.length - 1, Math.floor((pos / total) * chords.length))];
    const center = (spec.range[0] + spec.range[1]) / 2;
    let index = pool.findIndex((midi) => midi >= center - musicRand(0, 5));
    if (index < 0) index = Math.floor(pool.length / 2);
    const notes = [];
    let beatPos = 0;
    for (let i = 0; i < rhythm.length; i++) {
      const progress = i / Math.max(1, rhythm.length - 1);
      if (i > 0) {
        let step = musicPick([-2, -1, -1, 1, 1, 2, 0, -3, 3]);
        if (progress < 0.5 && Math.random() < 0.35) step = Math.abs(step) || 1;
        if (progress > 0.6 && Math.random() < 0.35) step = -Math.abs(step) || -1;
        index = Math.max(0, Math.min(pool.length - 1, index + step));
      }
      let midi = pool[index];
      const chord = chordAt(beatPos);
      if (rhythm[i] >= 1.5 || i === 0 || i === rhythm.length - 1) midi = this.chordTone(midi, chord, pool);
      else if (Math.random() < 0.08 && spec.color.length) {
        const neighbor = midi + musicPick([-1, 1]);
        if (spec.color.includes(pitchClass(neighbor))) midi = neighbor;
      }
      if (i === rhythm.length - 1) {
        const targets = pool.filter((cand) =>
          [chord.root, (chord.root + 7) % 12, chord.tones[1]].includes(pitchClass(cand)),
        );
        if (targets.length)
          midi = targets.reduce(
            (best, cand) => (Math.abs(cand - midi) < Math.abs(best - midi) ? cand : best),
            targets[0],
          );
      }
      index = Math.max(0, pool.indexOf(midi) >= 0 ? pool.indexOf(midi) : index);
      notes.push({
        midi,
        beats: rhythm[i],
        at: beatPos,
      });
      beatPos += rhythm[i];
    }
    this.remember(notes);
    return this.arrange(at, mood, celebrating, notes, chords, beatLen, total);
  }
  composeVariation(at, mood, celebrating) {
    const spec = MOODS[mood];
    const remembered = musicPick(this.memory);
    const pool = this.pool(mood, spec.range[0] - 5, spec.range[1] + 5);
    const shift = musicPick([-2, -1, 1, 2, 0]);
    const chords = musicPick(spec.progressions).map((numeral) => spec.chords[numeral]);
    const notes = [];
    let beatPos = 0;
    for (const note of remembered) {
      let index = pool.findIndex((cand) => cand >= note.midi);
      if (index < 0) index = pool.length - 1;
      const midi = pool[Math.max(0, Math.min(pool.length - 1, index + shift))];
      notes.push({
        midi,
        beats: note.beats,
        at: beatPos,
      });
      beatPos += note.beats;
    }
    const last = notes[notes.length - 1];
    const lastChord = chords[chords.length - 1];
    last.midi = this.chordTone(last.midi, lastChord, pool);
    const beatLen = 60 / (spec.tempo + (celebrating ? 6 : 0));
    return this.arrange(at, mood, celebrating, notes, chords, beatLen, beatPos);
  }
  remember(notes) {
    this.memory.push(
      notes.map((note) => ({
        midi: note.midi,
        beats: note.beats,
      })),
    );
    if (this.memory.length > 4) this.memory.shift();
  }
  arrange(at, mood, celebrating, notes, chords, beatLen, totalBeats) {
    const spec = MOODS[mood];
    const gliding = this.ctx.player?.state?.mode === 'glide';
    const aerie = mood === 'aerie';
    const cave = mood === 'cave';
    const temple = mood === 'kiln' || mood === 'cistern';
    const rnd = Math.random();
    const lead = aerie
      ? rnd < 0.4
        ? 'flute'
        : rnd < 0.72
          ? 'celesta'
          : 'harp'
      : cave
        ? rnd < 0.6
          ? 'celesta'
          : 'harp'
        : mood === 'cistern'
          ? rnd < 0.55
            ? 'celesta'
            : 'piano'
          : mood === 'kiln'
            ? 'piano'
            : mood === 'night'
              ? Math.random() < 0.55
                ? 'celesta'
                : 'piano'
              : mood === 'day' && Math.random() < 0.18
                ? 'harp'
                : 'piano';
    const len = notes.length;
    const stretch = (index) => (index >= len - 2 ? 1.08 : 1);
    let cursor = at;
    const times = [];
    for (let i = 0; i < len; i++) {
      times.push(cursor);
      cursor += notes[i].beats * beatLen * stretch(i);
    }
    const end = cursor;
    for (let i = 0; i < len; i++) {
      const arch = 0.8 + 0.3 * Math.sin((Math.PI * i) / Math.max(1, len - 1));
      const vel = spec.vel * arch * (i === len - 1 ? 0.85 : 1) * (celebrating ? 1.1 : 1);
      const noteLen = lead === 'flute' ? notes[i].beats * beatLen * stretch(i) * 0.96 : undefined;
      this.note(times[i], lead, notes[i].midi, vel, undefined, noteLen);
      if (mood === 'dusk' && Math.random() < 0.3) this.note(times[i] + 0.02, 'celesta', notes[i].midi + 12, vel * 0.35);
      if (aerie && lead !== 'celesta' && Math.random() < 0.25)
        this.note(times[i] + 0.02, 'celesta', notes[i].midi + 12, vel * 0.3);
    }
    const slots = chords.map((chord, i) => ({
      c: chord,
      b: (i / chords.length) * totalBeats,
    }));
    if (temple) this.ostinato(at, mood, slots, totalBeats, beatLen, end);
    if (!temple && Math.random() < (celebrating ? 0.9 : spec.bassP))
      for (const { c: chord, b: offset } of slots) {
        const time = at + offset * beatLen;
        if (cave) {
          this.note(time, 'piano', 38 + chord.root, spec.vel * 0.55, -0.1);
          continue;
        }
        if (aerie) {
          this.note(time, 'harp', 50 + chord.root, spec.vel * 0.55, -0.15);
          if (Math.random() < 0.5) this.note(time + beatLen, 'harp', 57 + chord.root, spec.vel * 0.35, 0.1);
          continue;
        }
        const bass = 38 + chord.root;
        this.note(time, 'piano', bass, spec.vel * 0.7, -0.1);
        if (Math.random() < 0.5) this.note(time + beatLen, 'piano', bass + 7, spec.vel * 0.45, 0.05);
        else if (Math.random() < 0.3) this.note(time + beatLen * 0.02, 'piano', bass + 12, spec.vel * 0.4, 0.1);
      }
    if (Math.random() < (celebrating ? 0.8 : spec.padP))
      for (const { c: chord, b: offset } of slots) {
        const time = at + offset * beatLen - (offset === 0 ? 0.6 : 0);
        const span = totalBeats / chords.length;
        const voicing = aerie
          ? [62 + chord.root, ...chord.tones.slice(1, 4).map((tone) => 69 + ((tone - 7 + 24) % 12))].sort(
              (a, b) => a - b,
            )
          : [50 + chord.root, ...chord.tones.slice(1, 4).map((tone) => 57 + ((tone - 7 + 24) % 12))].sort(
              (a, b) => a - b,
            );
        const dur = span * beatLen + (offset + span >= totalBeats ? 1.5 : 0.3);
        const vel = mood === 'night' ? 0.045 : aerie ? 0.042 : cave ? 0.05 : temple ? 0.04 : 0.055;
        const cutoff =
          mood === 'night' ? 800 : aerie ? 1500 : cave ? 650 : mood === 'cistern' ? 1400 : mood === 'kiln' ? 900 : 1100;
        this.push({
          kind: 'pad',
          t: time,
          notes: voicing,
          dur,
          vel,
          att: 2.2,
          rel: 3.5,
          cutoff,
        });
        if (cave && Math.random() < 0.35)
          this.note(time + 0.5, 'choir', 50 + chord.root, 0.4, -0.2, Math.min(dur, 3.2));
        if (aerie && Math.random() < 0.55)
          this.note(time + 0.3, 'choir', 62 + ((chord.tones[1] - 0 + 12) % 12), 0.5, 0.2, Math.min(dur, 3.2));
      }
    if (Math.random() < (celebrating ? 0.6 : gliding ? 0.5 : spec.harpP)) {
      const chord = chords[0];
      const gliss = [];
      for (let midi = 50; midi <= 76 && gliss.length < 7; midi++)
        if (chord.tones.includes(pitchClass(midi))) gliss.push(midi);
      gliss.forEach((midi, i) => this.note(at - 0.35 + i * 0.075, 'harp', midi, 0.22 + i * 0.02, -0.5 + i * 0.15));
    }
    if (Math.random() < 0.3 && len >= 2) {
      const tail = notes.slice(-Math.min(3, len));
      let time = end + beatLen * 0.5;
      for (const note of tail) {
        this.note(time, 'celesta', note.midi + 12, 0.2, 0.4);
        time += note.beats * beatLen * 0.8;
      }
      return time + 1;
    }
    return end + 1.5;
  }
  ostinato(at, mood, slots, totalBeats, beatLen, end) {
    const kiln = mood === 'kiln';
    const base = kiln ? 38 : 50;
    const pattern = kiln ? [0, 12, 7, 12, 0, 12, 7, 10] : [0, 7, 12, 7, 3, 7, 12, 7];
    const step = beatLen / 2;
    const until = Math.max(end, at + totalBeats * beatLen);
    let count = 0;
    for (let time = at; time < until - 0.05; time += step, count++) {
      const beatPos = (time - at) / beatLen;
      const slot = slots.filter((cand) => cand.b <= beatPos + 0.001).pop() ?? slots[0];
      const interval = pattern[count % pattern.length];
      const accent = count % 4 == 0;
      this.note(
        time,
        'pizz',
        base + slot.c.root + interval,
        (accent ? 0.62 : 0.42) * (kiln ? 1 : 0.8),
        count % 2 ? 0.2 : -0.2,
      );
      if (kiln && count % 8 == 0)
        this.push({
          kind: 'perc',
          t: time,
          id: 'bt-taiko',
          vel: engDbToGain(-16),
          pan: -0.05,
        });
      if (kiln && count % 8 == 6)
        this.push({
          kind: 'perc',
          t: time,
          id: 'bt-taiko',
          vel: engDbToGain(-22),
          pan: 0.1,
        });
    }
  }
  composeMotif(at, vel, intro) {
    const mood = this.mood();
    const spec = MOODS[mood];
    const minor = mood === 'night' || mood === 'cave' || mood === 'kiln' || mood === 'cistern';
    const motif = minor ? MOTIF_MINOR : MOTIF;
    const beatLen = 60 / spec.tempo;
    const inst =
      mood === 'night' || mood === 'cave' || mood === 'cistern' ? 'celesta' : mood === 'aerie' ? 'flute' : 'piano';
    let time = at;
    for (const [midi, beats] of motif) {
      this.note(time, inst, midi, vel, undefined, inst === 'flute' ? beats * beatLen * 0.95 : undefined);
      if (mood === 'aerie') this.note(time + 0.01, 'celesta', midi + 12, vel * 0.3, 0.35);
      time += beats * beatLen;
    }
    const pad = minor ? [50, 57, 65, 69] : [50, 57, 66, 69];
    this.note(at, 'piano', 38, vel * 0.8, -0.1);
    this.push({
      kind: 'pad',
      t: at - 0.8,
      notes: pad,
      dur: time - at + 1.5,
      vel: intro ? 0.04 : 0.05,
      att: 3,
      rel: 4,
      cutoff: 900,
    });
    this.remember(
      motif.map(([midi, beats]) => ({
        midi,
        beats,
      })),
    );
    this.sortQueue();
    this.nextPhraseAt = time + musicRand(6, 12);
    return time + 1.5;
  }
  swell(delay = 3.2) {
    if (!this.eng.ac) return;
    if (!this.started) this.start();
    const at = this.eng.now + delay;
    this.queue = this.queue.filter((ev) => ev.t < this.eng.now + 0.5);
    this.push({
      kind: 'pad',
      t: at,
      notes: [50, 57, 64, 66, 73],
      dur: 6,
      vel: 0.075,
      att: 2.5,
      rel: 4.5,
      cutoff: 1300,
    });
    const run = [62, 64, 66, 68, 69, 71, 73, 74, 76, 78, 80, 81, 83, 86];
    run.forEach((midi, i) =>
      this.note(at + 1 + i * 0.065, 'harp', midi, 0.14 + 0.16 * (i / run.length), -0.6 + i * 0.09),
    );
    [74, 76, 81].forEach((midi, i) => this.note(at + 3.2 + i * 0.45, 'celesta', midi + 12, 0.3, 0.3 - i * 0.2));
    this.note(at, 'piano', 38, 0.4, -0.1);
    this.sortQueue();
    this.nextPhraseAt = Math.max(this.nextPhraseAt, at + 14);
  }
  fullTheme(delay = 8) {
    if (!this.eng.ac) return;
    if (!this.started) this.start();
    const at = this.eng.now + delay;
    this.queue = this.queue.filter((ev) => ev.t < this.eng.now + 0.5);
    const beatLen = 60 / 64;
    const melody = [...MOTIF, [81, 2], [78, 1], [76, 1], [74, 4]];
    const harmony = [
      [0, [50, 57, 62, 66], 4],
      [4, [52, 56, 59, 62], 4],
      [8, [47, 54, 59, 62], 4],
      [12, [43, 55, 59, 62], 2],
      [14, [38, 50, 57, 66, 69], 4],
    ];
    let cursor = at;
    for (const [midi, beats] of melody) {
      this.note(cursor, 'piano', midi, 0.6);
      const beatPos = (cursor - at) / beatLen;
      const chordPcs = (harmony.filter((chord) => chord[0] <= beatPos + 0.01).pop() ?? harmony[0])[1].map(pitchClass);
      const below = [4, 3, 9, 8, 5].find((interval) => chordPcs.includes(pitchClass(midi - interval)));
      if (below !== undefined && beats >= 1) this.note(cursor + 0.01, 'piano', midi - below, 0.33);
      cursor += beats * beatLen;
    }
    for (const [beatAt, notes, beats] of harmony) {
      const time = at + beatAt * beatLen;
      this.note(time, 'piano', notes[0] - (notes[0] > 45 ? 12 : 0), 0.5, -0.15);
      this.push({
        kind: 'pad',
        t: time - (beatAt === 0 ? 1 : 0.1),
        notes: notes.slice(1),
        dur: beats * beatLen + (beatAt >= 14 ? 3 : 0.2),
        vel: 0.07,
        att: beatAt === 0 ? 2.5 : 0.8,
        rel: 4,
        cutoff: 1300,
      });
      for (let i = 0; i < beats * 3; i++) {
        const midi = notes[(i % (notes.length - 1)) + 1] + 12;
        this.note(time + (i * beatLen) / 3, 'harp', midi, 0.12 + 0.04 * Math.sin(i), (i % 3) * 0.3 - 0.3);
      }
    }
    const end = at + 18 * beatLen;
    [86, 88, 93].forEach((midi, i) => this.note(end + i * 0.5, 'celesta', midi, 0.25, 0.4 - i * 0.3));
    this.sortQueue();
    this.celebrateUntil = end + 180;
    this.nextPhraseAt = end + 6;
  }
  debugPhraseNow() {
    if (!this.started) this.start();
    this.queue = [];
    this.nextPhraseAt = this.eng.now + 0.3;
  }
  debugStop() {
    this.queue = [];
    this.nextPhraseAt = Infinity;
  }
  get queued() {
    return this.queue.length;
  }
  get secondsToNextPhrase() {
    return Math.max(0, this.nextPhraseAt - this.eng.now);
  }
}
