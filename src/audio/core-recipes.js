/**
 * Core sound recipes: piano, harp and celesta note samples across each instrument's range, the secret, pickup, shrine, all-shrines, ink-refill and respawn stingers, and the outdoor and hall reverb impulses.
 */
import { bubble, droplet, makeBuffer, mixPanned, noise, OnePole, range, smooth, tone } from './dsp.js';
import { bellNote, brassNote, celestaNote, harpNote, padNote, pianoNote } from './instruments.js';
export const INSTRUMENT_RANGES = {
  piano: [34, 90],
  celesta: [62, 98],
  harp: [38, 90],
};
function instrumentRoots(inst) {
  const [lo, hi] = INSTRUMENT_RANGES[inst];
  const roots = [];
  for (let midi = lo; midi <= hi; midi += 4) roots.push(midi);
  return roots;
}
const INSTRUMENT_RECIPES = ['piano', 'harp', 'celesta'].flatMap((inst) =>
  instrumentRoots(inst).map((midi) => ({
    id: `${inst}:${midi}`,
    sr: inst === 'celesta' ? 32000 : 24000,
    keepTail: true,
    level: -16,
    render(sr, rng) {
      return inst === 'celesta'
        ? celestaNote(sr, midi, rng)
        : inst === 'harp'
          ? harpNote(sr, midi, rng)
          : pianoNote(sr, midi, rng);
    },
  })),
);
const stingerNoteCache = new Map();
function addStingerNote(out, sr, rng, at, inst, midi, gain, pan = 0) {
  const key = `${inst}:${midi}:${sr}`;
  let note = stingerNoteCache.get(key);
  if (!note) {
    note =
      inst === 'celesta'
        ? celestaNote(sr, midi, rng)
        : inst === 'harp'
          ? harpNote(sr, midi, rng)
          : inst === 'bell'
            ? bellNote(sr, midi, rng, 2.6)
            : pianoNote(sr, midi, rng, 4);
    if (stingerNoteCache.size > 64) stingerNoteCache.clear();
    stingerNoteCache.set(key, note);
  }
  mixPanned(out[0], out[1], note, Math.round(at * sr), gain, pan);
}
function stingerLayer(out, draw, sr, dur, pan = 0, gain = 1) {
  const layer = makeBuffer(sr, dur);
  draw(layer);
  mixPanned(out[0], out[1], layer, 0, gain, pan);
}
function stingerSparkles(out, sr, rng, at, span, count, amp) {
  for (let i = 0; i < count; i++) {
    const t = at + range(rng, 0, span);
    stingerLayer(
      out,
      (buf) =>
        tone(buf, sr, t, {
          f0: range(rng, 3000, 7000),
          amp,
          att: 0.001,
          tau: range(rng, 0.05, 0.2),
        }),
      sr,
      t + 1.5,
      range(rng, -0.8, 0.8),
    );
  }
}
function stingerStereo(sr, dur) {
  return [makeBuffer(sr, dur), makeBuffer(sr, dur)];
}
const STINGER_RECIPES = [
  {
    id: 'st-secret',
    render(sr, rng) {
      const out = stingerStereo(sr, 3.4);
      const notes = [69, 74, 76, 80, 81];
      const times = [0, 0.1, 0.2, 0.3, 0.44];
      notes.forEach((midi, i) => {
        const vel = i === 4 ? 0.8 : 0.55;
        addStingerNote(out, sr, rng, times[i], 'celesta', midi + 12, vel * 0.7, -0.4 + i * 0.2);
        addStingerNote(out, sr, rng, times[i], 'harp', midi, vel * 0.6, 0.3 - i * 0.15);
      });
      addStingerNote(out, sr, rng, 0.44, 'bell', 86, 0.25, 0.3);
      addStingerNote(out, sr, rng, 0.58, 'bell', 88, 0.18, -0.3);
      for (const midi of [50, 57, 64, 68])
        stingerLayer(
          out,
          (buf) => padNote(buf, sr, rng, 0.4, midi, 1.2, 0.05, 0.3, 1.1, 1600),
          sr,
          3.4,
          (midi - 60) / 30,
        );
      stingerSparkles(out, sr, rng, 0.45, 1.2, 12, 0.05);
      return out;
    },
  },
  {
    id: 'st-pickup',
    render(sr, rng) {
      const out = stingerStereo(sr, 1.6);
      addStingerNote(out, sr, rng, 0, 'celesta', 88, 0.6, -0.2);
      addStingerNote(out, sr, rng, 0.075, 'celesta', 93, 0.7, 0.2);
      addStingerNote(out, sr, rng, 0.075, 'bell', 93, 0.12, 0);
      stingerSparkles(out, sr, rng, 0.05, 0.4, 6, 0.05);
      return out;
    },
  },
  {
    id: 'st-shrine-activate',
    render(sr, rng) {
      const dur = 3.6;
      const out = stingerStereo(sr, dur);
      for (const [ch, side] of [
        [0, -1],
        [1, 1],
      ]) {
        const buf = out[ch];
        for (let partial = 4; partial <= 24; partial++) {
          if (partial % 7 == 0 || partial % 11 == 0 || partial % 13 == 0) continue;
          const onset = 0.1 + ((partial - 4) / 20) * 2.1 + range(rng, -0.05, 0.05);
          tone(buf, sr, onset, {
            f0: 73.42 * partial * (1 + (side * range(rng, 0.5, 1.5)) / 1200),
            amp: 0.05 / Math.sqrt(partial / 4),
            dur: dur - onset,
            env: (t) =>
              smooth(t / 0.6) * (1 + 0.25 * Math.sin(2 * Math.PI * 6 * t)) * Math.exp(-Math.max(0, t - 1.6) / 0.9),
          });
        }
      }
      stingerLayer(
        out,
        (buf) =>
          noise(buf, sr, rng, 0, {
            mode: 'bp',
            f0: 400,
            f1: 6000,
            sweep: 2.5,
            q: 1.2,
            amp: 0.2,
            env: (t) => smooth(t / 2.3) * Math.exp(-Math.max(0, t - 2.4) / 0.25),
            dur: 3.3,
          }),
        sr,
        dur,
      );
      for (const midi of [74, 81, 88]) addStingerNote(out, sr, rng, 2.45, 'bell', midi, 0.22, (midi - 81) / 10);
      stingerSparkles(out, sr, rng, 2.4, 1, 10, 0.05);
      return out;
    },
  },
  {
    id: 'st-shrine-complete',
    render(sr, rng) {
      const dur = 6.5;
      const out = stingerStereo(sr, dur);
      addStingerNote(out, sr, rng, 0, 'piano', 38, 0.45, -0.1);
      addStingerNote(out, sr, rng, 0, 'piano', 50, 0.35, 0.1);
      for (const midi of [50, 57, 64, 66, 73])
        stingerLayer(
          out,
          (buf) => padNote(buf, sr, rng, 0, midi, 3.2, 0.06, 0.25, 1.4, 1700),
          sr,
          dur,
          (midi - 62) / 16,
        );
      const run = [62, 64, 66, 68, 69, 71, 73, 74, 76, 78, 80, 81, 83, 85, 86];
      run.forEach((midi, i) =>
        addStingerNote(out, sr, rng, 0.1 + i * 0.045, 'harp', midi, 0.25 + 0.2 * (i / run.length), -0.6 + i * 0.08),
      );
      [86, 85, 81, 78, 76, 74].forEach((midi, i) =>
        addStingerNote(out, sr, rng, 1.2 + i * 0.26, 'bell', midi, 0.3 - i * 0.02, i % 2 ? 0.4 : -0.4),
      );
      addStingerNote(out, sr, rng, 3, 'celesta', 86, 0.35, 0);
      stingerSparkles(out, sr, rng, 0.8, 3, 18, 0.045);
      return out;
    },
  },
  {
    id: 'st-all-shrines',
    render(sr, rng) {
      const out = stingerStereo(sr, 9);
      for (const [midi, at, hold] of [
        [62, 0, 0.35],
        [69, 0.4, 0.35],
        [74, 0.8, 1],
        [73, 1.9, 0.3],
        [74, 2.2, 0.3],
        [76, 2.5, 0.3],
        [78, 2.85, 1.35],
        [76, 4.3, 0.35],
        [81, 4.7, 2.8],
      ]) {
        stingerLayer(out, (buf) => brassNote(buf, sr, rng, at, midi, hold, 0.16, 0.4), sr, 9, -0.15);
        stingerLayer(out, (buf) => brassNote(buf, sr, rng, at + 0.01, midi - 12, hold, 0.08, 0.4), sr, 9, 0.2);
      }
      for (const [chord, at, hold] of [
        [[50, 57, 66], 0, 1.8],
        [[43, 55, 59, 62], 1.8, 1],
        [[52, 56, 59, 64], 2.8, 1.5],
        [[50, 57, 64, 66, 69], 4.3, 3.2],
      ])
        for (const midi of chord)
          stingerLayer(
            out,
            (buf) => padNote(buf, sr, rng, at, midi, hold, 0.05, 0.25, 0.8, 1500),
            sr,
            9,
            (midi - 58) / 20,
          );
      for (const at of [0, 2.8, 4.7])
        stingerLayer(
          out,
          (buf) => {
            tone(buf, sr, at, {
              f0: 80,
              f1: 73.4,
              glide: 0.05,
              amp: 0.35,
              att: 0.004,
              tau: 0.35,
            });
            noise(buf, sr, rng, at, {
              mode: 'lp',
              f0: 250,
              amp: 0.2,
              att: 0.003,
              tau: 0.08,
            });
          },
          sr,
          9,
        );
      [62, 66, 69, 74, 78, 81, 86].forEach((midi, i) =>
        addStingerNote(out, sr, rng, 4.7 + i * 0.08, 'harp', midi, 0.3, -0.5 + i * 0.15),
      );
      addStingerNote(out, sr, rng, 4.75, 'bell', 86, 0.25, 0.3);
      addStingerNote(out, sr, rng, 5.2, 'bell', 93, 0.15, -0.3);
      stingerSparkles(out, sr, rng, 4.7, 3, 20, 0.04);
      return out;
    },
  },
  {
    id: 'st-ink-refill',
    render(sr, rng) {
      const out = stingerStereo(sr, 1.8);
      stingerLayer(
        out,
        (buf) => {
          for (let i = 0; i < 3; i++) bubble(buf, sr, 0.02 + i * 0.07, range(rng, 160, 240), 0.35, 0.05);
          for (let i = 0; i < 26; i++) {
            const frac = i / 26;
            bubble(
              buf,
              sr,
              0.15 + 1 * frac ** 0.85 + range(rng, -0.02, 0.02),
              (300 + 900 * frac) * range(rng, 0.85, 1.15),
              range(rng, 0.12, 0.25),
              range(rng, 0.015, 0.035),
            );
          }
          noise(buf, sr, rng, 0.1, {
            mode: 'bp',
            f0: 900,
            f1: 2200,
            sweep: 1.1,
            q: 1.5,
            amp: 0.2,
            env: (t) => smooth(t / 0.1) * Math.exp(-Math.max(0, t - 0.95) / 0.12),
            dur: 1.4,
          });
          droplet(buf, sr, 1.25, 1800, 0.2);
        },
        sr,
        1.8,
      );
      addStingerNote(out, sr, rng, 1.2, 'celesta', 86, 0.3, 0.2);
      return out;
    },
  },
  {
    id: 'st-respawn',
    render(sr, rng) {
      const out = stingerStereo(sr, 2.4);
      stingerLayer(
        out,
        (buf) =>
          noise(buf, sr, rng, 0, {
            mode: 'bp',
            f0: 3000,
            f1: 700,
            sweep: 0.9,
            q: 1,
            amp: 0.25,
            env: (t) => smooth(t / 0.7) * Math.exp(-Math.max(0, t - 0.75) / 0.12),
            dur: 1.3,
          }),
        sr,
        2.4,
      );
      addStingerNote(out, sr, rng, 0.75, 'celesta', 74, 0.4, -0.2);
      addStingerNote(out, sr, rng, 0.75, 'bell', 81, 0.15, 0.2);
      stingerSparkles(out, sr, rng, 0.2, 0.7, 8, 0.03);
      return out;
    },
  },
];
function roomImpulse(sr, rng, dur, preDelay, rt60, lpStart, lpEnd, lpTau, taps, hpHz) {
  const out = stingerStereo(sr, dur);
  const tau = rt60 / 6.91;
  for (let ch = 0; ch < 2; ch++) {
    const buf = out[ch];
    for (const [time, gain] of taps) {
      const pos = Math.round((time + range(rng, -0.002, 0.002)) * sr);
      const tapLp = new OnePole(sr, 5000);
      for (let j = 0; j < 24 && pos + j < buf.length; j++)
        buf[pos + j] += tapLp.lp(j < 2 ? (rng() < 0.5 ? -1 : 1) * gain : 0) * 3;
    }
    const damp = new OnePole(sr, lpStart);
    const lowCut = new OnePole(sr, hpHz);
    const start = Math.round(preDelay * sr);
    for (let j = start; j < buf.length; j++) {
      const t = (j - start) / sr;
      if (!(j & 63)) damp.set(lpEnd + (lpStart - lpEnd) * Math.exp(-t / lpTau));
      const decay = Math.exp(-t / tau) * smooth(t / 0.03);
      buf[j] += lowCut.hp(damp.lp(rng() * 2 - 1)) * decay * 0.5;
    }
  }
  return out;
}
export const CORE_RECIPES = [
  {
    id: 'ir-outdoor',
    norm: 'none',
    keepTail: true,
    render(sr, rng) {
      const taps = [[0.004, 0.45]];
      for (let i = 0; i < 9; i++) taps.push([range(rng, 0.015, 0.14), range(rng, 0.05, 0.22)]);
      return roomImpulse(sr, rng, 1.6, 0.012, 1.25, 7000, 1300, 0.45, taps, 120);
    },
  },
  {
    id: 'ir-hall',
    norm: 'none',
    keepTail: true,
    render(sr, rng) {
      const taps = [];
      for (let i = 0; i < 18; i++) taps.push([range(rng, 0.018, 0.09), range(rng, 0.08, 0.25)]);
      return roomImpulse(sr, rng, 4.2, 0.022, 3.4, 9000, 1800, 1.2, taps, 150);
    },
  },
  ...STINGER_RECIPES,
  ...INSTRUMENT_RECIPES,
];
