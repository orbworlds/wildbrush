/**
 * Highwind Perch and brushflight sound recipes: the perch socket, rumble, bloom, hum and claim, the wind, flutter, boost and paint loops heard while flying, the mount, dismount and boost one-shots, and the flute samples of the flight music.
 */
import { choirNote } from './boss-sounds.js';
import { thump, whoosh } from './combat-sounds.js';
import {
  attackDecay,
  BrownNoise,
  bubble,
  clamp,
  crackle,
  droplet,
  makeBuffer,
  mixPanned,
  modal,
  mtof,
  mulberry32,
  noise,
  OnePole,
  PinkNoise,
  range,
  smooth,
  smoothNoise,
  SVF,
  TAU,
  tone,
} from './dsp.js';
import { bellNote, celestaNote, harpNote, padNote, pianoNote } from './instruments.js';
const flightStereo = (sr, dur) => [makeBuffer(sr, dur), makeBuffer(sr, dur)];
const flightNoteCache = new Map();
function cachedFlightNote(sr, rng, inst, midi) {
  const key = `${inst}:${midi}:${sr}`;
  let note = flightNoteCache.get(key);
  if (!note) {
    note =
      inst === 'celesta'
        ? celestaNote(sr, midi, rng)
        : inst === 'harp'
          ? harpNote(sr, midi, rng)
          : inst === 'bell'
            ? bellNote(sr, midi, rng, 2.6)
            : pianoNote(sr, midi, rng, 4);
    if (flightNoteCache.size > 80) flightNoteCache.clear();
    flightNoteCache.set(key, note);
  }
  return note;
}
function addFlightNote(out, sr, rng, at, inst, midi, gain, pan = 0) {
  mixPanned(out[0], out[1], cachedFlightNote(sr, rng, inst, midi), Math.round(at * sr), gain, pan);
}
function flightLayer(out, sr, dur, draw, pan = 0, gain = 1) {
  const layer = makeBuffer(sr, dur);
  draw(layer);
  mixPanned(out[0], out[1], layer, 0, gain, pan);
}
function flightSparkles(out, sr, rng, at, span, count, amp) {
  const dur = out[0].length / sr;
  for (let i = 0; i < count; i++) {
    const t = at + range(rng, 0, span);
    if (!(t > dur - 0.3))
      flightLayer(
        out,
        sr,
        Math.min(dur, t + 0.8),
        (buf) =>
          tone(buf, sr, t, {
            f0: range(rng, 3200, 8000),
            amp,
            att: 0.001,
            tau: range(rng, 0.05, 0.2),
          }),
        range(rng, -0.8, 0.8),
      );
  }
}
function flightReflections(out, sr, wet, lpHz = 2800) {
  const taps = [
    [0.041, 0.5, 1],
    [0.067, 0.42, -1],
    [0.109, 0.33, 1],
    [0.163, 0.26, -1],
    [0.233, 0.18, 1],
    [0.327, 0.12, -1],
  ];
  const dry = [out[0].slice(), out[1].slice()];
  for (const [delay, gain, side] of taps) {
    const lag = Math.round(delay * sr);
    for (let ch = 0; ch < 2; ch++) {
      const src = dry[side > 0 ? ch : 1 - ch];
      const dst = out[ch];
      const lp = new SVF(sr, lpHz, 0.6);
      for (let j = 0; j + lag < dst.length; j++) {
        lp.tick(src[j]);
        dst[j + lag] += lp.lp * gain * wet;
      }
    }
  }
}
function overtoneLadder(out, sr, rng, at, spread, amp, hold, fundamental = 73.42) {
  for (const [ch, side] of [
    [0, -1],
    [1, 1],
  ]) {
    const buf = out[ch];
    for (let partial = 3; partial <= 22; partial++) {
      if (partial % 7 == 0 || partial % 11 == 0 || partial % 13 == 0) continue;
      const onset = at + ((partial - 3) / 19) * spread + range(rng, -0.05, 0.05);
      tone(buf, sr, onset, {
        f0: fundamental * partial * (1 + (side * range(rng, 0.4, 1.4)) / 1200),
        amp: amp / Math.sqrt(partial / 3),
        dur: spread + hold - (onset - at) + 1.2,
        env: (t) =>
          smooth(t / 0.5) *
          (1 + 0.2 * Math.sin(TAU * 5.5 * t)) *
          Math.exp(-Math.max(0, t - (spread + hold - (onset - at))) / 0.5),
      });
    }
  }
}
const PERCH_RECIPES = [
  {
    id: 'perch-socket',
    sr: 44100,
    render(sr, rng) {
      const dur = 2.6;
      const out = flightStereo(sr, dur);
      addFlightNote(out, sr, rng, 0, 'bell', 86, 0.34, -0.15);
      addFlightNote(out, sr, rng, 0.06, 'celesta', 93, 0.32, 0.2);
      addFlightNote(out, sr, rng, 0.14, 'celesta', 98, 0.2, -0.25);
      flightLayer(out, sr, dur, (buf) => {
        modal(
          buf,
          sr,
          rng,
          0,
          [
            [2349, 0.3, 0.9],
            [3520, 0.2, 0.6],
            [4699, 0.14, 0.4],
            [7040, 0.08, 0.25],
          ],
          {
            amp: 0.35,
            noise: 0.25,
            noiseLp: 9000,
            noiseTau: 0.002,
          },
        );
        noise(buf, sr, rng, 0, {
          mode: 'hp',
          f0: 5000,
          amp: 0.08,
          env: (t) => smooth(t / 0.05) * Math.exp(-t / 0.5),
          dur: 1.8,
        });
      });
      flightSparkles(out, sr, rng, 0.05, 1.2, 12, 0.035);
      flightReflections(out, sr, 0.3, 5000);
      return out;
    },
  },
  {
    id: 'st-perch-rumble',
    render(sr, rng) {
      const dur = 5.2;
      const out = flightStereo(sr, dur);
      for (const pan of [-0.5, 0.5])
        flightLayer(
          out,
          sr,
          dur,
          (buf) => {
            const brown = new BrownNoise(rng);
            const rumbleLp = new SVF(sr, 90, 0.9);
            const rumbleLfo = smoothNoise(rng, 3);
            for (let i = 0; i < buf.length; i++) {
              const t2 = i / sr;
              if (!(i & 31)) rumbleLp.set(70 + 90 * smooth(t2 / 2.4) + 40 * rumbleLfo(t2), 0.9);
              rumbleLp.tick(brown.next());
              const level =
                smooth(t2 / 1.4) * (0.8 + 0.2 * rumbleLfo(t2 * 1.7)) * (t2 < 3.6 ? 1 : Math.exp(-(t2 - 3.6) / 0.6));
              buf[i] += rumbleLp.lp * level * 2.4;
            }
          },
          pan,
        );
      flightLayer(out, sr, dur, (buf) => {
        tone(buf, sr, 0.1, {
          f0: 36.7,
          amp: 0.45,
          dur: 4.6,
          env: (t) => smooth(t / 1.2) * (0.75 + 0.25 * Math.sin(TAU * 7 * t)) * Math.exp(-Math.max(0, t - 3.4) / 0.5),
        });
        for (const knockAt of [0.35, 0.9, 1.5, 1.72, 2.3, 2.9]) {
          noise(buf, sr, rng, knockAt, {
            mode: 'bp',
            q: 3,
            f0: range(rng, 180, 320),
            amp: 0.3,
            env: (t) => smooth(t / 0.05) * Math.exp(-t / 0.35) * (0.6 + 0.4 * Math.sin(TAU * range(rng, 24, 40) * t)),
            dur: 1.2,
          });
          modal(
            buf,
            sr,
            rng,
            knockAt,
            [
              [range(rng, 90, 140), 0.5, 0.12],
              [range(rng, 240, 320), 0.3, 0.07],
            ],
            {
              amp: 0.35,
              noise: 0.4,
              noiseLp: 900,
            },
          );
        }
        crackle(buf, sr, rng, 0.3, 3.2, 26, {
          fLo: 700,
          fHi: 3500,
          amp: 0.16,
          shape: (u) => smooth(u * 3) * (1 - u * 0.5),
        });
      });
      overtoneLadder(out, sr, rng, 1.6, 2.4, 0.03, 0.8);
      return out;
    },
  },
  {
    id: 'st-perch-bloom',
    render(sr, rng) {
      const out = flightStereo(sr, 9);
      flightLayer(out, sr, 9, (buf) => {
        thump(buf, sr, 0.25, 70, 38, 0.8, 0.5);
        whoosh(buf, sr, rng, 0.05, 1.1, 300, 1800, 500, 0.55, 0.8);
        noise(buf, sr, rng, 0.25, {
          mode: 'lp',
          f0: 400,
          amp: 0.4,
          att: 0.004,
          tau: 0.3,
        });
      });
      flightLayer(
        out,
        sr,
        9,
        (buf) => {
          for (const [midi, amp, at] of [
            [50, 0.2, 0.3],
            [57, 0.18, 0.45],
            [62, 0.18, 0.6],
          ])
            choirNote(buf, sr, rng, at, midi, 5.4 - at, amp, {
              att: 1.2,
              rel: 1.6,
              vowel: 'ah',
              voices: 4,
            });
        },
        -0.3,
      );
      flightLayer(
        out,
        sr,
        9,
        (buf) => {
          for (const [midi, amp, at] of [
            [66, 0.15, 0.8],
            [69, 0.13, 1],
            [74, 0.1, 1.4],
          ])
            choirNote(buf, sr, rng, at, midi, 5 - at * 0.5, amp, {
              att: 1.2,
              rel: 1.6,
              vowel: 'ah',
              voices: 4,
            });
        },
        0.3,
      );
      for (const midi of [38, 50, 57, 62, 64])
        flightLayer(out, sr, 9, (buf) => padNote(buf, sr, rng, 0.3, midi, 5.6, 0.035, 1.4, 2, 1500), (midi - 55) / 20);
      for (const [midi, at] of [
        [69, 1],
        [74, 1.35],
        [76, 1.6],
        [81, 1.95],
      ]) {
        addFlightNote(out, sr, rng, at, 'celesta', midi + 12, 0.5, 0.25);
        addFlightNote(out, sr, rng, at + 0.01, 'harp', midi, 0.42, -0.2);
      }
      [
        [86, 2.9],
        [88, 3.15],
        [93, 3.4],
      ].forEach(([midi, at], i) => addFlightNote(out, sr, rng, at, 'celesta', midi, 0.35 - i * 0.05, -0.3 + i * 0.3));
      const run = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88, 90, 93];
      run.forEach((midi, i) =>
        addFlightNote(out, sr, rng, 1.95 + i * 0.05, 'harp', midi, 0.18 + 0.14 * (i / run.length), -0.7 + i * 0.1),
      );
      addFlightNote(out, sr, rng, 1.95, 'bell', 86, 0.3, 0);
      addFlightNote(out, sr, rng, 2.6, 'bell', 93, 0.16, 0.35);
      addFlightNote(out, sr, rng, 4.2, 'bell', 81, 0.12, -0.35);
      overtoneLadder(out, sr, rng, 0.2, 2, 0.022, 3.4);
      flightSparkles(out, sr, rng, 1.9, 5, 40, 0.04);
      flightReflections(out, sr, 0.3, 3200);
      return out;
    },
  },
  {
    id: 'perch-hum',
    sr: 24000,
    loop: 2,
    norm: 'long',
    level: -20,
    render(sr, rng) {
      const out = flightStereo(sr, 10);
      const chord = [50, 57, 62, 64, 66, 69, 76];
      for (const [ch, side] of [
        [0, -1],
        [1, 1],
      ]) {
        const buf = out[ch];
        chord.forEach((midi, i) => {
          const freq = mtof(midi) * (1 + (side * range(rng, 0.8, 2.2)) / 1200);
          const rate = range(rng, 0.07, 0.19);
          const phase = rng() * TAU;
          tone(buf, sr, 0, {
            f0: freq,
            amp: 0.05 / (1 + i * 0.12),
            dur: 10,
            harm: [0.25, 0.08],
            env: (t) => 0.7 + 0.3 * Math.sin(TAU * rate * t + phase),
          });
        });
        for (let i = 0; i < 6; i++) {
          const freq = mtof(86 + [0, 2, 4, 7, 9, 12][i]) * (1 + side * 0.001);
          const rate = range(rng, 0.1, 0.3);
          const phase = rng() * TAU;
          tone(buf, sr, 0, {
            f0: freq,
            amp: 0.012,
            dur: 10,
            env: (t) => Math.max(0, Math.sin(TAU * rate * t + phase)) ** 2,
          });
        }
      }
      flightLayer(out, sr, 10, (buf) => {
        const pink = new PinkNoise(rng);
        const airBp = new SVF(sr, 3000, 1.2);
        const airLfo = smoothNoise(rng, 0.4);
        for (let i = 0; i < buf.length; i++) {
          airBp.tick(pink.next());
          buf[i] += airBp.bpn * 0.05 * (0.6 + 0.4 * airLfo(i / sr));
        }
      });
      return out;
    },
  },
  {
    id: 'st-perch-claim',
    render(sr, rng) {
      const dur = 4.4;
      const out = flightStereo(sr, dur);
      for (const ch of [0, 1]) {
        const buf = out[ch];
        const sweepBp = new SVF(sr, 400, 2);
        for (let i = 0; i < Math.round(2.1 * sr); i++) {
          const t = i / sr;
          if (!(i & 15)) sweepBp.set(300 * 12 ** smooth(t / 2), 2);
          sweepBp.tick(rng() * 2 - 1);
          const swirl = Math.sin(TAU * (0.8 + 2.4 * t) * t + ch * Math.PI);
          buf[i] +=
            sweepBp.bpn *
            smooth(t / 0.6) *
            (0.55 + 0.45 * swirl) *
            0.35 *
            (t < 1.95 ? 1 : Math.exp(-(t - 1.95) / 0.04));
        }
      }
      const run = [62, 66, 69, 74, 76, 78, 81, 83, 86, 88, 90, 93];
      let noteAt = 0.15;
      run.forEach((midi, i) => {
        addFlightNote(
          out,
          sr,
          rng,
          noteAt,
          'celesta',
          midi + (i > 7 ? 0 : 12),
          0.22 + i * 0.015,
          Math.sin(i * 1.3) * 0.7,
        );
        noteAt += 0.2 - i * 0.013;
      });
      flightLayer(out, sr, dur, (buf) => {
        thump(buf, sr, 2, 90, 45, 0.7, 0.35);
        noise(buf, sr, rng, 2, {
          mode: 'hp',
          f0: 3000,
          amp: 0.25,
          att: 0.002,
          tau: 0.5,
          dur: 2,
        });
        for (const midi of [50, 57, 62, 66, 69]) padNote(buf, sr, rng, 2, midi, 1.4, 0.04, 0.05, 1.2, 2200);
      });
      addFlightNote(out, sr, rng, 2, 'bell', 86, 0.32, 0);
      addFlightNote(out, sr, rng, 2.02, 'bell', 93, 0.2, 0.3);
      [74, 78, 81, 86, 90].forEach((midi, i) =>
        addFlightNote(out, sr, rng, 2.02 + i * 0.06, 'harp', midi, 0.28, -0.5 + i * 0.25),
      );
      flightSparkles(out, sr, rng, 1.95, 1.8, 28, 0.045);
      flightReflections(out, sr, 0.3, 3500);
      return out;
    },
  },
];
function renderFlightStereo(sr, rng, dur, fill) {
  const left = makeBuffer(sr, dur);
  const right = makeBuffer(sr, dur);
  fill(left, 0);
  fill(right, 1);
  return [left, right];
}
const FLIGHT_SFX_RECIPES = [
  {
    id: 'fl-wind',
    sr: 24000,
    loop: 1.5,
    render(sr, rng) {
      const seed = rng() * 1000000;
      return renderFlightStereo(sr, rng, 8, (buf, ch) => {
        const gust = smoothNoise(mulberry32(seed + ch * 7), 0.5);
        const pink = new PinkNoise(rng);
        const windBp = new SVF(sr, 900, 0.6);
        const whistleBp = new SVF(sr, 1900, 12);
        const rumbleLp = new OnePole(sr, 240);
        const brown = new BrownNoise(rng);
        for (let i = 0; i < buf.length; i++) {
          const t2 = i / sr;
          const strength = 0.6 + 0.4 * gust(t2);
          if (!(i & 31)) {
            windBp.set(700 + 900 * strength, 0.6);
            whistleBp.set(1600 + 700 * gust(t2 * 0.6 + 5), 12);
          }
          const pinkSample = pink.next();
          windBp.tick(pinkSample);
          whistleBp.tick(pinkSample);
          buf[i] =
            windBp.bpn * 0.8 * strength + whistleBp.bpn * 0.12 * strength * strength + rumbleLp.lp(brown.next()) * 0.6;
        }
      });
    },
  },
  {
    id: 'fl-flutter',
    sr: 16000,
    loop: 0.5,
    render(sr, rng) {
      return renderFlightStereo(sr, rng, 3, (buf) => {
        const flapBp = new SVF(sr, 1400, 0.9);
        const rumbleLp = new SVF(sr, 320, 0.7);
        const rumbleLfo = smoothNoise(rng, 2);
        let nextFlap = 0;
        let flapAt = -1;
        let flapAmp = 1;
        for (let i = 0; i < buf.length; i++) {
          const t = i / sr;
          if (i >= nextFlap) {
            flapAt = t;
            flapAmp = range(rng, 0.5, 1);
            nextFlap = i + Math.round(sr / range(rng, 16, 24));
          }
          const flapEnv = attackDecay(t - flapAt, 0.003, 0.018) * flapAmp;
          const white = rng() * 2 - 1;
          flapBp.tick(white);
          rumbleLp.tick(white);
          buf[i] = flapBp.bpn * flapEnv * 0.9 + rumbleLp.lp * 0.9 * (0.5 + 0.5 * rumbleLfo(t));
        }
      });
    },
  },
  {
    id: 'fl-boost',
    sr: 24000,
    loop: 1,
    render(sr, rng) {
      return renderFlightStereo(sr, rng, 5, (buf) => {
        const brown = new BrownNoise(rng);
        const roarLp = new SVF(sr, 220, 0.8);
        const rushBp = new SVF(sr, 900, 0.7);
        const hissHp = new OnePole(sr, 5000);
        const buffet = smoothNoise(rng, 9);
        const rushLfo = smoothNoise(rng, 1.3);
        for (let i = 0; i < buf.length; i++) {
          const t = i / sr;
          if (!(i & 31)) rushBp.set(700 + 500 * rushLfo(t), 0.7);
          roarLp.tick(brown.next());
          const white = rng() * 2 - 1;
          rushBp.tick(white);
          buf[i] =
            roarLp.lp * 2.2 * (0.8 + 0.2 * buffet(t)) +
            rushBp.bpn * 0.7 * (0.75 + 0.25 * buffet(t + 3)) +
            hissHp.hp(white) * 0.06;
        }
      });
    },
  },
  {
    id: 'fl-paint',
    sr: 32000,
    loop: 0.6,
    render(sr, rng) {
      return renderFlightStereo(sr, rng, 3, (buf) => {
        const sprayBp = new SVF(sr, 3500, 0.8);
        const sprayHp = new OnePole(sr, 1800);
        const flicker = smoothNoise(rng, 6);
        for (let i = 0; i < buf.length; i++) {
          const t = i / sr;
          const white = rng() * 2 - 1;
          sprayBp.tick(white);
          buf[i] = (sprayBp.bpn * 0.6 + sprayHp.hp(white) * 0.25) * (0.7 + 0.3 * flicker(t));
        }
        for (let i = 0; i < 70; i++)
          droplet(buf, sr, range(rng, 0, 2.9), range(rng, 900, 2600), range(rng, 0.04, 0.12), 1.7, 0.02);
        for (let i = 0; i < 30; i++)
          bubble(buf, sr, range(rng, 0, 2.9), range(rng, 300, 700), range(rng, 0.05, 0.12), 0.025);
      });
    },
  },
  {
    id: 'fl-mount',
    render(sr, rng) {
      const dur = 1.6;
      const out = flightStereo(sr, dur);
      flightLayer(out, sr, dur, (buf) => {
        whoosh(buf, sr, rng, 0, 0.65, 350, 2400, 900, 0.7, 0.9);
        noise(buf, sr, rng, 0.12, {
          mode: 'bp',
          q: 1.4,
          f0: 2600,
          f1: 5200,
          sweep: 0.25,
          amp: 0.25,
          att: 0.01,
          tau: 0.08,
        });
        thump(buf, sr, 0.02, 120, 70, 0.25, 0.08);
      });
      [62, 69, 74].forEach((midi, i) =>
        addFlightNote(out, sr, rng, 0.18 + i * 0.07, 'harp', midi + 12, 0.22 + i * 0.04, -0.3 + i * 0.3),
      );
      addFlightNote(out, sr, rng, 0.36, 'celesta', 86, 0.18, 0.2);
      return out;
    },
  },
  {
    id: 'fl-dismount',
    render(sr, rng) {
      const dur = 1.1;
      const out = flightStereo(sr, dur);
      flightLayer(out, sr, dur, (buf) => {
        whoosh(buf, sr, rng, 0, 0.5, 1800, 1200, 300, 0.55, 0.9);
        noise(buf, sr, rng, 0.03, {
          mode: 'bp',
          q: 2,
          f0: 900,
          amp: 0.3,
          att: 0.002,
          tau: 0.03,
        });
        noise(buf, sr, rng, 0.09, {
          mode: 'bp',
          q: 2,
          f0: 1300,
          amp: 0.2,
          att: 0.002,
          tau: 0.025,
        });
      });
      addFlightNote(out, sr, rng, 0.05, 'harp', 69, 0.14, 0.2);
      return out;
    },
  },
  {
    id: 'fl-boost-on',
    render(sr, rng) {
      const dur = 1.3;
      const out = flightStereo(sr, dur);
      flightLayer(out, sr, dur, (buf) => {
        thump(buf, sr, 0, 90, 48, 0.55, 0.16);
        whoosh(buf, sr, rng, 0, 0.7, 250, 1500, 600, 0.65, 0.8);
        noise(buf, sr, rng, 0, {
          mode: 'lp',
          f0: 600,
          amp: 0.35,
          att: 0.003,
          tau: 0.12,
        });
      });
      flightSparkles(out, sr, rng, 0.05, 0.5, 8, 0.03);
      return out;
    },
  },
];
export const FLUTE_ROOTS = [62, 66, 70, 74, 78, 82, 86, 90];
function fluteNote(buf, sr, rng, at, midi, dur, amp) {
  const freq = mtof(midi);
  const start = Math.round(at * sr);
  const len = Math.min(buf.length - start, Math.round(dur * sr));
  const breathBp = new SVF(sr, freq * 2, 3);
  const chiffBp = new SVF(sr, freq * 3, 2);
  const breathHp = new OnePole(sr, 200);
  let phase = rng() * TAU;
  const vibRate = range(rng, 4.8, 5.4);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const vib = 1 + 0.0045 * Math.sin(TAU * vibRate * t) * smooth((t - 0.3) / 0.5);
    phase += (TAU * freq * vib) / sr;
    const wave =
      Math.sin(phase) +
      0.22 * Math.sin(2 * phase + 0.3) +
      0.09 * Math.sin(3 * phase + 0.9) +
      0.03 * Math.sin(4 * phase);
    const white = rng() * 2 - 1;
    breathBp.tick(white);
    chiffBp.tick(white);
    const level =
      smooth(t / 0.07) * (0.92 + 0.08 * Math.sin(TAU * 0.7 * t)) * clamp(1 - (t - (dur - 0.25)) / 0.25, 0, 1);
    const chiff = Math.exp(-t / 0.04);
    buf[start + i] += (wave * 0.8 + breathHp.hp(breathBp.bpn) * 0.18 + chiffBp.bpn * chiff * 0.6) * level * amp;
  }
}
const FLUTE_RECIPES = FLUTE_ROOTS.map((midi) => ({
  id: `fm-flute:${midi}`,
  sr: 24000,
  keepTail: true,
  level: -16,
  render(sr, rng) {
    const out = makeBuffer(sr, 3.4);
    fluteNote(out, sr, rng, 0, midi, 3.3, 0.8);
    return out;
  },
}));
export const FLIGHT_RECIPES = [...PERCH_RECIPES, ...FLIGHT_SFX_RECIPES, ...FLUTE_RECIPES];
