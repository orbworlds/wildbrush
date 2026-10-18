/**
 * Greymaw's sound recipes (rising from the ink, roar, slam, sweep, ink rain, crystal, stagger, hurt and death), the boss barrier, chest and item-get fanfares, the elite sting and the elites' attack sounds. Built from a small orchestral kit: choir, timpani, cymbals, cached instrument notes, panned layers and early reflections.
 */
import { formantVoice, gurgle, inkSplat, thump, whoosh } from './combat-sounds.js';
import {
  clamp,
  crackle,
  creak,
  droplet,
  makeBuffer,
  mixPanned,
  modal,
  mtof,
  noise,
  range,
  smooth,
  SVF,
  TAU,
  tone,
} from './dsp.js';
import { bellNote, brassNote, celestaNote, harpNote, padNote, pianoNote, SawOsc } from './instruments.js';
const bossStereo = (sr, dur) => [makeBuffer(sr, dur), makeBuffer(sr, dur)];
const bossMono = (sr, dur) => makeBuffer(sr, dur);
const VOWEL_FORMANTS = {
  ah: [
    [730, 5, 1],
    [1090, 7, 0.5],
    [2440, 10, 0.22],
  ],
  oh: [
    [570, 5, 1],
    [840, 7, 0.45],
    [2410, 10, 0.18],
  ],
  oo: [
    [320, 5, 1],
    [870, 7, 0.28],
    [2240, 10, 0.1],
  ],
};
export function choirNote(buf, sr, rand, t0, midi, dur, amp, opts = {}) {
  const f0 = mtof(midi);
  const att = opts.att ?? 0.35;
  const rel = opts.rel ?? 0.8;
  const i0 = Math.max(0, Math.round(t0 * sr));
  const len = Math.min(buf.length - i0, Math.round((dur + rel * 5) * sr));
  if (len <= 0) return;
  const voices = opts.voices ?? 3;
  const saws = [];
  const detunes = [];
  const phases = [];
  for (let i = 0; i < voices; i++) {
    saws.push(new SawOsc(sr, rand()));
    detunes.push(2 ** (((i - (voices - 1) / 2) * 9 + range(rand, -3, 3)) / 1200));
    phases.push(rand() * TAU);
  }
  const shift = clamp(1 + (midi - 57) * 0.012, 0.85, 1.35);
  const formants = VOWEL_FORMANTS[opts.vowel ?? 'ah'].map(([f, q]) => new SVF(sr, Math.min(sr * 0.4, f * shift), q));
  const gains = VOWEL_FORMANTS[opts.vowel ?? 'ah'].map((formant) => formant[2]);
  const lpf = new SVF(sr, Math.min(sr * 0.4, 4200), 0.7);
  for (let i = 0; i < len; i++) {
    const t2 = i / sr;
    let x = 0;
    for (let j = 0; j < voices; j++) {
      const vib = 1 + 0.0055 * Math.sin(TAU * (5.1 + j * 0.23) * t2 + phases[j]) * smooth((t2 - 0.25) / 0.5);
      x += saws[j].next(f0 * detunes[j] * vib);
    }
    x = x / voices + (rand() * 2 - 1) * 0.06;
    let y = 0;
    for (let j = 0; j < formants.length; j++) {
      formants[j].tick(x);
      y += formants[j].bpn * gains[j];
    }
    lpf.tick(y);
    const env = t2 < dur ? smooth(t2 / att) : Math.exp(-(t2 - dur) / rel);
    buf[i0 + i] += lpf.lp * env * amp;
  }
}
function timpaniHit(buf, sr, rand, t0, midi, amp, decay = 0.9) {
  const f0 = mtof(midi);
  tone(buf, sr, t0, {
    f0: f0 * 1.02,
    f1: f0,
    glide: 0.03,
    amp: amp * 0.9,
    att: 0.002,
    tau: decay,
  });
  modal(
    buf,
    sr,
    rand,
    t0,
    [
      [f0 * 1.5, 0.35, decay * 0.6],
      [f0 * 1.98, 0.22, decay * 0.45],
      [f0 * 2.44, 0.12, decay * 0.3],
      [f0 * 2.9, 0.06, decay * 0.2],
    ],
    {
      amp,
    },
  );
  noise(buf, sr, rand, t0, {
    mode: 'lp',
    f0: 600,
    amp: amp * 0.35,
    att: 0.001,
    tau: 0.03,
  });
}
function reverseCymbal(buf, sr, rand, t0, dur, amp, cutoff = 4200) {
  noise(buf, sr, rand, t0, {
    mode: 'hp',
    f0: cutoff,
    amp,
    env: (t) => clamp(t / dur, 0, 1) ** 2.4 * (t < dur ? 1 : Math.exp(-(t - dur) / 0.02)),
    dur: dur + 0.1,
  });
}
function cymbalCrash(buf, sr, rand, t0, amp, decay = 0.8) {
  noise(buf, sr, rand, t0, {
    mode: 'hp',
    f0: 3000,
    amp: amp * 0.8,
    att: 0.002,
    tau: decay,
    dur: decay * 4,
  });
  noise(buf, sr, rand, t0, {
    mode: 'bp',
    f0: 7000,
    q: 0.7,
    amp: amp * 0.4,
    att: 0.002,
    tau: decay * 1.3,
    dur: decay * 4,
  });
}
function sparkles(out, sr, rand, t0, span, count, amp) {
  for (let i = 0; i < count; i++) {
    const at = t0 + range(rand, 0, span);
    const ping = bossMono(sr, Math.min(out[0].length / sr, at + 0.6));
    tone(ping, sr, at, {
      f0: range(rand, 3200, 8000),
      amp,
      att: 0.001,
      tau: range(rand, 0.05, 0.2),
    });
    mixPanned(out[0], out[1], ping, 0, 1, range(rand, -0.8, 0.8));
  }
}
const noteCache = new Map();
function cachedNote(sr, rand, inst, midi) {
  const key = `${inst}:${midi}:${sr}`;
  let buf = noteCache.get(key);
  if (!buf) {
    buf =
      inst === 'celesta'
        ? celestaNote(sr, midi, rand)
        : inst === 'harp'
          ? harpNote(sr, midi, rand)
          : inst === 'bell'
            ? bellNote(sr, midi, rand, 2.6)
            : pianoNote(sr, midi, rand, 4);
    if (noteCache.size > 80) noteCache.clear();
    noteCache.set(key, buf);
  }
  return buf;
}
function addNote(out, sr, rand, t0, inst, midi, gain, pan = 0) {
  mixPanned(out[0], out[1], cachedNote(sr, rand, inst, midi), Math.round(t0 * sr), gain, pan);
}
function addLayer(out, sr, dur, fill, pan = 0, gain = 1) {
  const buf = bossMono(sr, dur);
  fill(buf);
  mixPanned(out[0], out[1], buf, 0, gain, pan);
}
function addReflections(out, sr, wet, cutoff = 2500) {
  const taps = [
    [0.043, 0.5, 1],
    [0.071, 0.42, -1],
    [0.113, 0.33, 1],
    [0.167, 0.26, -1],
    [0.239, 0.18, 1],
    [0.331, 0.12, -1],
  ];
  const dry = [out[0].slice(), out[1].slice()];
  for (const [delay, gain, side] of taps) {
    const offset = Math.round(delay * sr);
    for (let ch = 0; ch < 2; ch++) {
      const src = dry[side > 0 ? ch : 1 - ch];
      const dst = out[ch];
      const lpf = new SVF(sr, cutoff, 0.6);
      for (let j = 0; j + offset < dst.length; j++) {
        lpf.tick(src[j]);
        dst[j + offset] += lpf.lp * gain * wet;
      }
    }
  }
}
const BOSS_SOUNDS = [
  {
    id: 'bs-rise',
    render(sr, rand) {
      const dur = 4.4;
      const out = bossStereo(sr, dur);
      addLayer(out, sr, dur, (buf) => {
        tone(buf, sr, 0, {
          f0: 34,
          freq: (t) => 34 + 14 * smooth(t / 3.4),
          amp: 0.55,
          env: (t) => smooth(t / 2.5) * Math.exp(-Math.max(0, t - 3.4) / 0.5),
          dur,
          harm: [0.45, 0.2, 0.1],
        });
        noise(buf, sr, rand, 0, {
          mode: 'lp',
          f0: 140,
          amp: 0.7,
          env: (t) => smooth(t / 3) * Math.exp(-Math.max(0, t - 3.5) / 0.4),
          dur,
          color: 'brown',
        });
        for (let i = 0; i < 70; i++) {
          const pos = rand() ** 0.55;
          droplet(
            buf,
            sr,
            0.2 + pos * 3.2,
            range(rand, 55, 190),
            range(rand, 0.15, 0.35) * (0.4 + pos),
            range(rand, 1.3, 1.9),
            range(rand, 0.04, 0.09),
          );
        }
        gurgle(buf, sr, rand, 0.6, 3, 40, 70, 240, 0.28);
        crackle(buf, sr, rand, 0.8, 2.6, 60, {
          fLo: 300,
          fHi: 1400,
          amp: 0.25,
          pow: 1.6,
          shape: (u) => u,
        });
        thump(buf, sr, 3.35, 70, 30, 0.9, 0.4);
        noise(buf, sr, rand, 3.35, {
          mode: 'lp',
          f0: 1200,
          f1: 200,
          amp: 0.8,
          att: 0.004,
          tau: 0.25,
          dur: 1,
        });
        inkSplat(buf, sr, rand, 3.36, 2.4, 0.7);
      });
      addLayer(
        out,
        sr,
        dur,
        (buf) => {
          choirNote(buf, sr, rand, 1, 38, 2.4, 0.5, {
            att: 1.4,
            rel: 0.6,
            vowel: 'oo',
          });
          choirNote(buf, sr, rand, 1.3, 39, 2.1, 0.35, {
            att: 1.2,
            rel: 0.6,
            vowel: 'oo',
          });
        },
        -0.25,
      );
      addLayer(
        out,
        sr,
        dur,
        (buf) =>
          choirNote(buf, sr, rand, 1.6, 45, 1.8, 0.28, {
            att: 1.1,
            rel: 0.6,
            vowel: 'oh',
          }),
        0.3,
      );
      addReflections(out, sr, 0.35, 1600);
      return out;
    },
  },
  {
    id: 'bs-roar',
    vars: 2,
    render(sr, rand, variant) {
      const dur = 3.2;
      const out = bossStereo(sr, dur);
      const roarLen = range(rand, 1.7, 2);
      const f0 = variant ? 46 : 52;
      const roarEnv = (t) =>
        smooth(t / 0.18) *
        (t < roarLen ? 1 - 0.25 * smooth((t - roarLen * 0.6) / (roarLen * 0.4)) : Math.exp(-(t - roarLen) / 0.25));
      addLayer(
        out,
        sr,
        dur,
        (buf) => {
          formantVoice(buf, sr, rand, 0, roarLen + 1, {
            f0: (t) =>
              f0 *
              (1 + 0.55 * Math.sin(Math.PI * Math.min(1, t / (roarLen * 0.9)))) *
              (1 + 0.03 * Math.sin(TAU * 6.5 * t)),
            formants: [
              [range(rand, 380, 440), 2.6, 1.1],
              [range(rand, 850, 950), 3.5, 0.75],
              [2500, 5, 0.3],
            ],
            amp: 1,
            env: roarEnv,
            breath: 0.7,
            rough: 0.75,
            jitter: 0.05,
          });
          noise(buf, sr, rand, 0, {
            mode: 'lp',
            f0: 220,
            amp: 0.45,
            env: roarEnv,
            dur: roarLen + 0.8,
            color: 'brown',
          });
          thump(buf, sr, 0, 90, 35, 0.6, 0.25);
        },
        -0.1,
      );
      addLayer(
        out,
        sr,
        dur,
        (buf) => {
          formantVoice(buf, sr, rand, 0.12, roarLen, {
            f0: (t) => (variant ? 150 : 170) * (1 + 0.45 * Math.sin(Math.PI * Math.min(1, t / (roarLen * 0.85)))),
            formants: [
              [900, 4, 0.6],
              [1700, 6, 0.5],
              [3200, 8, 0.25],
            ],
            amp: 0.32,
            env: (t) => roarEnv(t) * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, t / roarLen))),
            breath: 0.9,
            rough: 0.5,
            jitter: 0.06,
          });
          noise(buf, sr, rand, 0.05, {
            mode: 'bp',
            q: 0.9,
            f0: 700,
            fc: (t) => 700 + 900 * Math.sin(Math.PI * Math.min(1, t / roarLen)),
            amp: 0.35,
            env: roarEnv,
            dur: roarLen + 0.6,
          });
          gurgle(buf, sr, rand, 0.2, roarLen, 18, 120, 420, 0.12);
        },
        0.12,
      );
      addReflections(out, sr, 0.5, 1800);
      return out;
    },
  },
  {
    id: 'bs-slam',
    vars: 3,
    render(sr, rand) {
      const dur = 2.6;
      const out = bossStereo(sr, dur);
      addLayer(out, sr, dur, (buf) => {
        thump(buf, sr, 0, range(rand, 62, 72), 24, 1.1, 0.55);
        noise(buf, sr, rand, 0, {
          mode: 'lp',
          f0: 1100,
          f1: 140,
          sweep: 0.3,
          amp: 1,
          att: 0.0015,
          tau: 0.12,
          dur: 1,
        });
        modal(
          buf,
          sr,
          rand,
          0.005,
          [
            [range(rand, 170, 230), 0.4, 0.09],
            [range(rand, 390, 470), 0.3, 0.06],
            [range(rand, 780, 900), 0.2, 0.035],
          ],
          {
            amp: 0.5,
            noise: 0.4,
            noiseLp: 2500,
          },
        );
        noise(buf, sr, rand, 0.05, {
          mode: 'lp',
          f0: 160,
          amp: 0.55,
          env: (t) => smooth(t / 0.05) * Math.exp(-t / 0.7),
          dur: 2.4,
          color: 'brown',
        });
        inkSplat(buf, sr, rand, 0.01, 2.2, 0.6);
      });
      for (const pan of [-0.6, 0.6])
        addLayer(
          out,
          sr,
          dur,
          (buf) =>
            crackle(buf, sr, rand, 0.06, 1.1, 90, {
              fLo: 700,
              fHi: 5200,
              amp: 0.3,
              pow: 2,
              shape: (u) => 1 - u,
            }),
          pan,
        );
      addReflections(out, sr, 0.3, 1400);
      return out;
    },
  },
  {
    id: 'bs-sweep',
    vars: 2,
    render(sr, rand) {
      const dur = 1.9;
      const out = bossStereo(sr, dur);
      addLayer(
        out,
        sr,
        dur,
        (buf) => {
          whoosh(buf, sr, rand, 0, 1.3, 90, 700, 120, 1, 0.8);
          whoosh(buf, sr, rand, 0.05, 1.1, 300, 2200, 400, 0.45, 1.2);
          tone(buf, sr, 0, {
            f0: 55,
            freq: (t) => 55 + 40 * Math.sin(Math.PI * Math.min(1, t / 1.1)),
            amp: 0.35,
            env: (t) => Math.sin(Math.PI * Math.min(1, t / 1.2)),
            dur: 1.3,
            harm: [0.4, 0.2],
          });
        },
        -0.3,
      );
      addLayer(out, sr, dur, (buf) => whoosh(buf, sr, rand, 0.12, 1.2, 150, 1100, 180, 0.7, 1), 0.35);
      return out;
    },
  },
  {
    id: 'bs-rain',
    render(sr, rand) {
      const dur = 3.4;
      const out = bossStereo(sr, dur);
      for (let i = 0; i < 16; i++) {
        const at = 0.45 + (i / 16) * 2.3 + range(rand, -0.08, 0.08);
        addLayer(
          out,
          sr,
          dur,
          (buf) => {
            const f0 = range(rand, 900, 1500);
            tone(buf, sr, at - 0.42, {
              f0,
              freq: (t) => f0 * 0.45 ** smooth(t / 0.42),
              amp: 0.06,
              env: (t) => smooth(t / 0.2) * +(t < 0.42),
              dur: 0.43,
            });
            inkSplat(buf, sr, rand, at, range(rand, 0.8, 1.4), range(rand, 0.4, 0.7));
            thump(buf, sr, at, 110, 50, 0.3, 0.08);
          },
          range(rand, -0.85, 0.85),
        );
      }
      addLayer(out, sr, dur, (buf) => gurgle(buf, sr, rand, 0.2, 3, 50, 90, 400, 0.1));
      addReflections(out, sr, 0.25);
      return out;
    },
  },
  {
    id: 'bs-crystal',
    render(sr, rand) {
      const dur = 3.2;
      const out = bossStereo(sr, dur);
      for (const pan of [-0.5, 0.5])
        addLayer(
          out,
          sr,
          dur,
          (buf) => {
            const modes = [];
            for (let i = 0; i < 14; i++)
              modes.push([range(rand, 2200, 9500), range(rand, 0.05, 0.14), range(rand, 0.15, 0.8)]);
            modal(buf, sr, rand, 0, modes, {
              amp: 0.55,
              noise: 0.5,
              noiseLp: 9000,
              noiseTau: 0.006,
            });
            noise(buf, sr, rand, 0, {
              mode: 'hp',
              f0: 2500,
              amp: 0.5,
              att: 0.001,
              tau: 0.08,
            });
            crackle(buf, sr, rand, 0.02, 0.7, 160, {
              fLo: 3000,
              fHi: 11000,
              amp: 0.35,
              pow: 2.2,
              shape: (u) => 1 - u,
            });
          },
          pan,
        );
      addLayer(out, sr, dur, (buf) => thump(buf, sr, 0, 140, 60, 0.4, 0.07));
      [74, 78, 81, 83, 86, 90, 93].forEach((midi, i) =>
        addNote(
          out,
          sr,
          rand,
          0.28 + i * 0.07,
          i % 2 ? 'celesta' : 'harp',
          i % 2 ? midi : midi - 12,
          0.3 + i * 0.03,
          -0.6 + i * 0.2,
        ),
      );
      addNote(out, sr, rand, 0.78, 'bell', 86, 0.25, 0);
      sparkles(out, sr, rand, 0.3, 1.4, 16, 0.045);
      return out;
    },
  },
  {
    id: 'bs-stagger',
    render(sr, rand) {
      const dur = 2.2;
      const out = bossStereo(sr, dur);
      addLayer(out, sr, dur, (buf) => {
        formantVoice(buf, sr, rand, 0, 1.6, {
          f0: (t) => 78 * 0.55 ** smooth(t / 1.3) * (1 + 0.06 * Math.sin(TAU * 7 * t)),
          formants: [
            [520, 3, 1],
            [880, 4, 0.55],
            [2300, 6, 0.2],
          ],
          amp: 0.8,
          env: (t) => smooth(t / 0.08) * Math.exp(-Math.max(0, t - 0.9) / 0.35),
          breath: 0.55,
          rough: 0.6,
          jitter: 0.04,
        });
        tone(buf, sr, 0, {
          f0: 48,
          amp: 0.4,
          env: (t) => smooth(t / 0.05) * Math.exp(-t / 0.8) * (0.6 + 0.4 * Math.sin(TAU * 5 * t)),
          dur: 1.8,
          harm: [0.3],
        });
        modal(
          buf,
          sr,
          rand,
          0.02,
          [
            [range(rand, 200, 260), 0.3, 0.1],
            [range(rand, 480, 560), 0.2, 0.06],
          ],
          {
            amp: 0.4,
            noise: 0.3,
            noiseLp: 1800,
          },
        );
        gurgle(buf, sr, rand, 0.1, 1.2, 14, 80, 260, 0.14);
      });
      addReflections(out, sr, 0.35, 1500);
      return out;
    },
  },
  {
    id: 'bs-hurt',
    vars: 3,
    render(sr, rand) {
      const buf = bossMono(sr, 1.1);
      const dur = range(rand, 0.35, 0.5);
      const f0 = range(rand, 62, 80);
      formantVoice(buf, sr, rand, 0, dur + 0.3, {
        f0: (t) => f0 * (1 + 0.7 * Math.sin(Math.PI * Math.min(1, t / dur))),
        formants: [
          [range(rand, 480, 560), 3, 1],
          [range(rand, 820, 900), 4, 0.6],
          [2400, 6, 0.25],
        ],
        amp: 0.9,
        env: (t) => smooth(t / 0.03) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.09)),
        breath: 0.6,
        rough: 0.65,
        jitter: 0.05,
      });
      inkSplat(buf, sr, rand, 0, 1.1, 0.4);
      return buf;
    },
  },
  {
    id: 'bs-death',
    render(sr, rand) {
      const dur = 7.2;
      const out = bossStereo(sr, dur);
      addLayer(out, sr, dur, (buf) => {
        formantVoice(buf, sr, rand, 0, 2.6, {
          f0: (t) => 64 * 0.42 ** smooth(t / 2.3) * (1 + 0.05 * Math.sin(TAU * 5 * t)),
          formants: [
            [430, 2.6, 1.1],
            [900, 3.5, 0.7],
            [2400, 5, 0.25],
          ],
          amp: 0.95,
          env: (t) => smooth(t / 0.15) * Math.exp(-Math.max(0, t - 0.8) / 0.7),
          breath: 0.75,
          rough: 0.8,
          jitter: 0.06,
        });
        noise(buf, sr, rand, 0, {
          mode: 'lp',
          f0: 200,
          amp: 0.5,
          env: (t) => smooth(t / 0.2) * Math.exp(-Math.max(0, t - 1) / 0.9),
          dur: 3.5,
          color: 'brown',
        });
        for (let i = 0; i < 90; i++) {
          const pos = rand();
          droplet(
            buf,
            sr,
            0.4 + pos * 2.4,
            range(rand, 70, 260) * (1 + pos),
            range(rand, 0.1, 0.25) * (1 - pos * 0.6),
            range(rand, 1.4, 2),
            range(rand, 0.03, 0.07),
          );
        }
        noise(buf, sr, rand, 0.8, {
          mode: 'bp',
          q: 1.4,
          f0: 400,
          f1: 7000,
          sweep: 1.6,
          amp: 0.3,
          env: (t) => smooth(t / 1.4) * (t < 1.55 ? 1 : Math.exp(-(t - 1.55) / 0.08)),
          dur: 1.8,
        });
        thump(buf, sr, 2.4, 60, 28, 0.9, 0.6);
      });
      const chordAt = 2.4;
      addLayer(
        out,
        sr,
        dur,
        (buf) => {
          for (const [midi, gain] of [
            [38, 0.35],
            [45, 0.3],
            [50, 0.3],
            [54, 0.26],
            [57, 0.24],
          ])
            choirNote(buf, sr, rand, chordAt, midi, 3.2, gain, {
              att: 0.35,
              rel: 1.4,
              vowel: 'ah',
            });
        },
        -0.2,
      );
      addLayer(
        out,
        sr,
        dur,
        (buf) => {
          for (const [midi, gain] of [
            [62, 0.22],
            [66, 0.2],
            [69, 0.2],
            [74, 0.14],
          ])
            choirNote(buf, sr, rand, 2.4499999999999997, midi, 3.1, gain, {
              att: 0.4,
              rel: 1.4,
              vowel: 'ah',
            });
        },
        0.2,
      );
      addLayer(
        out,
        sr,
        dur,
        (buf) => {
          for (const [midi, gain] of [
            [50, 0.14],
            [57, 0.12],
            [62, 0.1],
            [66, 0.09],
          ])
            brassNote(buf, sr, rand, chordAt, midi, 2.6, gain, 1.2);
        },
        0,
      );
      [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 90].forEach((midi, i) =>
        addNote(out, sr, rand, 2.4499999999999997 + i * 0.05, 'harp', midi, 0.2 + (i / 12) * 0.1, -0.7 + i * 0.12),
      );
      [86, 93, 90, 98].forEach((midi, i) =>
        addNote(out, sr, rand, 2.9 + i * 0.35, i % 2 ? 'celesta' : 'bell', midi, 0.18, i % 2 ? 0.4 : -0.4),
      );
      addLayer(out, sr, dur, (buf) => {
        cymbalCrash(buf, sr, rand, chordAt, 0.35, 1.2);
        timpaniHit(buf, sr, rand, chordAt, 38, 0.7, 1.2);
      });
      sparkles(out, sr, rand, chordAt, 3.5, 30, 0.04);
      addReflections(out, sr, 0.4, 2200);
      return out;
    },
  },
];
const STINGER_SOUNDS = [
  {
    id: 'bs-barrier-up',
    render(sr, rand) {
      const dur = 2.2;
      const out = bossStereo(sr, dur);
      addLayer(out, sr, dur, (buf) => {
        noise(buf, sr, rand, 0, {
          mode: 'bp',
          q: 1.2,
          f0: 250,
          f1: 3200,
          sweep: 1,
          amp: 0.45,
          env: (t) => smooth(t / 0.9) * (t < 1 ? 1 : Math.exp(-(t - 1) / 0.15)),
          dur: 1.4,
        });
        tone(buf, sr, 0, {
          f0: 73.4,
          freq: (t) => 73.4 * 2 ** smooth(t / 1),
          amp: 0.3,
          env: (t) => smooth(t / 0.7) * Math.exp(-Math.max(0, t - 1) / 0.45),
          dur: 2,
          harm: [0.5, 0.35, 0.2, 0.1],
        });
        crackle(buf, sr, rand, 0.3, 1.3, 80, {
          fLo: 1500,
          fHi: 7000,
          amp: 0.2,
          pow: 1.8,
        });
        thump(buf, sr, 1, 80, 36, 0.8, 0.35);
      });
      addLayer(
        out,
        sr,
        dur,
        (buf) =>
          choirNote(buf, sr, rand, 0.5, 50, 0.9, 0.2, {
            att: 0.4,
            rel: 0.4,
            vowel: 'oo',
          }),
        -0.3,
      );
      addLayer(
        out,
        sr,
        dur,
        (buf) =>
          choirNote(buf, sr, rand, 0.5, 51, 0.9, 0.16, {
            att: 0.4,
            rel: 0.4,
            vowel: 'oo',
          }),
        0.3,
      );
      addReflections(out, sr, 0.35);
      return out;
    },
  },
  {
    id: 'bs-barrier-down',
    render(sr, rand) {
      const dur = 2.2;
      const out = bossStereo(sr, dur);
      for (const [pan, freq] of [
        [-0.4, 880],
        [0.4, 1320],
      ])
        addLayer(
          out,
          sr,
          dur,
          (buf) => {
            tone(buf, sr, 0, {
              f0: freq,
              freq: (t) => freq * 0.3 ** smooth(t / 1.2),
              amp: 0.12,
              env: (t) => smooth(t / 0.03) * Math.exp(-t / 0.7),
              dur: 1.6,
              harm: [0.4, 0.2],
            });
            crackle(buf, sr, rand, 0, 1.2, 120, {
              fLo: 2500,
              fHi: 9000,
              amp: 0.25,
              pow: 2,
              shape: (u) => 1 - u,
            });
          },
          pan,
        );
      addLayer(out, sr, dur, (buf) => whoosh(buf, sr, rand, 0, 1.4, 2000, 900, 200, 0.4, 0.9));
      [86, 81, 78, 74].forEach((midi, i) =>
        addNote(out, sr, rand, 0.15 + i * 0.1, 'celesta', midi, 0.22, 0.3 - i * 0.2),
      );
      return out;
    },
  },
  {
    id: 'st-chest-appear',
    render(sr, rand) {
      const dur = 3.2;
      const out = bossStereo(sr, dur);
      for (const [ch, side] of [
        [0, -1],
        [1, 1],
      ]) {
        const chan = out[ch];
        for (let harmonic = 4; harmonic <= 20; harmonic++) {
          if (harmonic % 7 == 0 || harmonic % 11 == 0 || harmonic % 13 == 0) continue;
          const at = 0.05 + ((harmonic - 4) / 16) * 1.1 + range(rand, -0.04, 0.04);
          tone(chan, sr, at, {
            f0: 73.42 * harmonic * (1 + (side * range(rand, 0.5, 1.5)) / 1200),
            amp: 0.045 / Math.sqrt(harmonic / 4),
            dur: dur - at,
            env: (t) => smooth(t / 0.35) * Math.exp(-Math.max(0, t - 0.9) / 0.7),
          });
        }
      }
      addNote(out, sr, rand, 1.3, 'bell', 81, 0.24, 0);
      addNote(out, sr, rand, 1.3, 'harp', 62, 0.3, -0.2);
      addNote(out, sr, rand, 1.36, 'harp', 69, 0.26, 0.2);
      addLayer(out, sr, dur, (buf) => {
        modal(
          buf,
          sr,
          rand,
          1.42,
          [
            [range(rand, 160, 190), 0.5, 0.08],
            [range(rand, 380, 430), 0.3, 0.05],
          ],
          {
            amp: 0.55,
            noise: 0.35,
            noiseLp: 1500,
          },
        );
        thump(buf, sr, 1.42, 110, 60, 0.45, 0.08);
      });
      sparkles(out, sr, rand, 0.3, 2, 18, 0.04);
      return out;
    },
  },
  {
    id: 'st-chest-open',
    render(sr, rand) {
      const dur = 3.8;
      const out = bossStereo(sr, dur);
      addLayer(out, sr, dur, (buf) => {
        creak(buf, sr, rand, 0.02, 0.48, {
          rate0: 30,
          rate1: 95,
          f1: range(rand, 420, 480),
          f2: range(rand, 950, 1050),
          amp: 0.5,
        });
        modal(
          buf,
          sr,
          rand,
          0.5,
          [
            [range(rand, 380, 440), 0.5, 0.05],
            [range(rand, 900, 1000), 0.3, 0.03],
            [2100, 0.15, 0.015],
          ],
          {
            amp: 0.6,
            noise: 0.4,
            noiseLp: 3000,
          },
        );
        thump(buf, sr, 0.5, 120, 70, 0.3, 0.06);
      });
      addLayer(
        out,
        sr,
        dur,
        (buf) => {
          for (const [midi, gain] of [
            [62, 0.24],
            [66, 0.2],
            [69, 0.2],
          ])
            choirNote(buf, sr, rand, 0.52, midi, 1.9, gain, {
              att: 0.25,
              rel: 1,
              vowel: 'ah',
            });
        },
        -0.25,
      );
      addLayer(
        out,
        sr,
        dur,
        (buf) => {
          for (const [midi, gain] of [
            [74, 0.18],
            [78, 0.14],
            [81, 0.12],
          ])
            choirNote(buf, sr, rand, 0.56, midi, 1.8, gain, {
              att: 0.3,
              rel: 1,
              vowel: 'ah',
            });
        },
        0.25,
      );
      [74, 78, 81, 86, 90].forEach((midi, i) =>
        addNote(out, sr, rand, 0.54 + i * 0.07, 'celesta', midi, 0.34 + i * 0.03, -0.4 + i * 0.2),
      );
      addNote(out, sr, rand, 0.95, 'bell', 93, 0.14, 0);
      sparkles(out, sr, rand, 0.52, 1.8, 18, 0.045);
      addReflections(out, sr, 0.3, 3000);
      return out;
    },
  },
  {
    id: 'st-item-get',
    render(sr, rand) {
      const out = bossStereo(sr, 4);
      const melody = [
        [69, 0, 0.07],
        [74, 0.085, 0.07],
        [76, 0.17, 0.07],
        [81, 0.255, 0.4],
        [79, 0.7, 0.1],
        [78, 0.81, 0.1],
        [79, 0.92, 0.1],
        [83, 1.03, 0.34],
        [81, 1.4, 0.09],
        [86, 1.5, 1.35],
      ];
      addLayer(
        out,
        sr,
        4,
        (buf) => {
          for (const [midi, at, noteDur] of melody) brassNote(buf, sr, rand, at, midi, noteDur, 0.2, 0.25);
        },
        0.1,
      );
      addLayer(
        out,
        sr,
        4,
        (buf) => {
          for (const [midi, at, noteDur] of melody) brassNote(buf, sr, rand, at + 0.004, midi - 12, noteDur, 0.1, 0.25);
        },
        -0.15,
      );
      for (const [chord, at, chordDur] of [
        [[50, 57, 62, 66], 0.25, 0.44],
        [[43, 55, 59, 62], 0.7, 0.33],
        [[45, 57, 61, 64], 1.03, 0.45],
        [[38, 50, 57, 62, 66, 69], 1.5, 1.6],
      ])
        addLayer(
          out,
          sr,
          4,
          (buf) => {
            for (const midi of chord) padNote(buf, sr, rand, at, midi, chordDur, 0.05, 0.03, 0.5, 1800);
            brassNote(buf, sr, rand, at, chord[0], chordDur, 0.1, 0.3);
          },
          0,
        );
      addLayer(out, sr, 4, (buf) => {
        for (let i = 0; i < 9; i++) timpaniHit(buf, sr, rand, 1.05 + i * 0.048, 45, 0.12 + i * 0.03, 0.2);
        timpaniHit(buf, sr, rand, 1.5, 38, 0.75, 1.1);
        timpaniHit(buf, sr, rand, 0.25, 38, 0.45, 0.5);
        reverseCymbal(buf, sr, rand, 0.75, 0.75, 0.2);
        cymbalCrash(buf, sr, rand, 1.5, 0.3, 1.1);
      });
      [62, 66, 69, 74, 78, 81, 86, 90].forEach((midi, i) =>
        addNote(out, sr, rand, 1.5 + i * 0.045, 'harp', midi, 0.2 + i * 0.02, -0.6 + i * 0.17),
      );
      addNote(out, sr, rand, 1.52, 'bell', 86, 0.28, 0.15);
      addNote(out, sr, rand, 1.9, 'bell', 93, 0.16, -0.3);
      [81, 86, 90, 93].forEach((midi, i) =>
        addNote(out, sr, rand, 0.255 + i * 0.05, 'celesta', midi, 0.16, 0.5 - i * 0.3),
      );
      sparkles(out, sr, rand, 1.5, 2, 26, 0.04);
      addReflections(out, sr, 0.28, 3500);
      return out;
    },
  },
  {
    id: 'st-heart-get',
    sr: 44100,
    render(sr, rand) {
      const dur = 2.8;
      const out = bossStereo(sr, dur);
      addLayer(out, sr, dur, (buf) => {
        thump(buf, sr, 0, 90, 55, 0.5, 0.09);
        thump(buf, sr, 0.19, 80, 50, 0.38, 0.1);
        for (const midi of [50, 57, 62, 66]) padNote(buf, sr, rand, 0.2, midi, 1.4, 0.05, 0.3, 1, 1600);
      });
      [62, 66, 69, 74, 78, 81].forEach((midi, i) => {
        addNote(out, sr, rand, 0.42 + i * 0.075, 'harp', midi, 0.26, -0.5 + i * 0.2);
        addNote(out, sr, rand, 0.42 + i * 0.075, 'celesta', midi + 12, 0.22 + i * 0.02, 0.5 - i * 0.2);
      });
      addNote(out, sr, rand, 0.9, 'bell', 86, 0.22, 0);
      addNote(out, sr, rand, 1.2, 'celesta', 93, 0.2, 0.3);
      sparkles(out, sr, rand, 0.5, 1.5, 18, 0.045);
      return out;
    },
  },
  {
    id: 'bt-elite-sting',
    render(sr, rand) {
      const dur = 3.6;
      const out = bossStereo(sr, dur);
      addLayer(out, sr, dur, (buf) => {
        for (const [midi, gain] of [
          [38, 0.2],
          [45, 0.16],
          [50, 0.15],
          [51, 0.1],
        ])
          brassNote(buf, sr, rand, 0.02, midi, 0.55, gain, 0.4);
        for (const [midi, gain] of [
          [39, 0.18],
          [46, 0.14],
          [51, 0.13],
          [55, 0.1],
        ])
          brassNote(buf, sr, rand, 0.72, midi, 0.9, gain, 0.6);
        timpaniHit(buf, sr, rand, 0.02, 38, 0.8, 1);
        timpaniHit(buf, sr, rand, 0.72, 39, 0.7, 1.1);
        cymbalCrash(buf, sr, rand, 0.72, 0.35, 1.1);
        thump(buf, sr, 0.02, 90, 40, 0.6, 0.3);
      });
      addLayer(
        out,
        sr,
        dur,
        (buf) => {
          choirNote(buf, sr, rand, 0.7, 62, 1.1, 0.24, {
            att: 0.08,
            rel: 0.7,
            vowel: 'ah',
          });
          choirNote(buf, sr, rand, 0.7, 63, 1.1, 0.18, {
            att: 0.1,
            rel: 0.7,
            vowel: 'ah',
          });
          choirNote(buf, sr, rand, 0.7, 70, 1, 0.14, {
            att: 0.12,
            rel: 0.7,
            vowel: 'ah',
          });
        },
        0.2,
      );
      addLayer(out, sr, dur, (buf) => reverseCymbal(buf, sr, rand, 0.05, 0.65, 0.25), -0.2);
      addReflections(out, sr, 0.3);
      return out;
    },
  },
];
const ELITE_SOUNDS = [
  {
    id: 'el-charge-wind',
    vars: 2,
    render(sr, rand) {
      const buf = bossMono(sr, 1.4);
      const windup = 0.95;
      formantVoice(buf, sr, rand, 0, 1.15, {
        f0: (t) => 58 * (1 + 0.7 * smooth(t / windup)) * (1 + 0.05 * Math.sin(TAU * 9 * t)),
        formants: [
          [360, 3, 1],
          [820, 4, 0.6],
          [2300, 6, 0.25],
        ],
        amp: 0.8,
        env: (t) => smooth(t / 0.2) * (t < windup ? 1 : Math.exp(-(t - windup) / 0.05)),
        breath: 0.7,
        rough: 0.7,
        jitter: 0.05,
      });
      for (let i = 0; i < 2; i++)
        noise(buf, sr, rand, 0.12 + i * 0.36, {
          mode: 'bp',
          q: 1.4,
          f0: 900,
          f1: 300,
          sweep: 0.25,
          amp: 0.45,
          att: 0.01,
          tau: 0.09,
          dur: 0.3,
        });
      noise(buf, sr, rand, 0, {
        mode: 'hp',
        f0: 1800,
        amp: 0.2,
        env: (t) => +(t > 0.7 && t < 0.95) * Math.sin(Math.PI * clamp((t - 0.7) / 0.25, 0, 1)),
        dur: 1,
      });
      return buf;
    },
  },
  {
    id: 'el-charge',
    vars: 2,
    render(sr, rand) {
      const buf = bossMono(sr, 1.8);
      whoosh(buf, sr, rand, 0, 1.2, 120, 900, 150, 0.9, 0.8);
      for (let i = 0; i < 6; i++) {
        const at = 0.02 + i * 0.16 + range(rand, -0.01, 0.01);
        thump(buf, sr, at, 95, 40, 0.7 - i * 0.05, 0.12);
        noise(buf, sr, rand, at, {
          mode: 'lp',
          f0: 700,
          amp: 0.4,
          att: 0.002,
          tau: 0.03,
        });
        crackle(buf, sr, rand, at, 0.12, 120, {
          fLo: 800,
          fHi: 3000,
          amp: 0.15,
          pow: 2,
          shape: (u) => 1 - u,
        });
      }
      return buf;
    },
  },
  {
    id: 'el-nova-wind',
    render(sr, rand) {
      const buf = bossMono(sr, 1.8);
      const windup = 1.3;
      tone(buf, sr, 0, {
        f0: 90,
        freq: (t) => 90 * 4 ** smooth(t / windup),
        amp: 0.3,
        env: (t) =>
          smooth(t / windup) *
          (0.7 + 0.3 * Math.sin(TAU * (3 * t + 10 * t * t))) *
          (t < windup ? 1 : Math.exp(-(t - windup) / 0.03)),
        dur: 1.5,
        harm: [0.6, 0.35, 0.2],
      });
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        q: 1.1,
        f0: 300,
        fc: (t) => 300 * 10 ** smooth(t / windup),
        amp: 0.45,
        env: (t) => smooth(t / windup) * (t < windup ? 1 : Math.exp(-(t - windup) / 0.03)),
        dur: 1.5,
      });
      crackle(buf, sr, rand, 0.3, 1, 90, {
        fLo: 1200,
        fHi: 6000,
        amp: 0.25,
        pow: 1.6,
        shape: (u) => u,
      });
      return buf;
    },
  },
  {
    id: 'el-nova',
    render(sr, rand) {
      const buf = bossMono(sr, 2.4);
      thump(buf, sr, 0, 80, 28, 1, 0.45);
      noise(buf, sr, rand, 0, {
        mode: 'lp',
        f0: 2400,
        f1: 200,
        sweep: 0.5,
        amp: 0.9,
        att: 0.002,
        tau: 0.25,
        dur: 1.5,
      });
      whoosh(buf, sr, rand, 0.02, 0.9, 1600, 700, 180, 0.6, 0.9);
      modal(
        buf,
        sr,
        rand,
        0.01,
        [
          [range(rand, 150, 190), 0.3, 0.3],
          [range(rand, 330, 380), 0.2, 0.2],
        ],
        {
          amp: 0.4,
        },
      );
      noise(buf, sr, rand, 0.05, {
        mode: 'lp',
        f0: 140,
        amp: 0.5,
        env: (t) => Math.exp(-t / 0.8),
        dur: 2.2,
        color: 'brown',
      });
      return buf;
    },
  },
  {
    id: 'el-spikes-wind',
    render(sr, rand) {
      const buf = bossMono(sr, 1.3);
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        q: 2,
        f0: 180,
        amp: 0.35,
        env: (t) => smooth(t / 0.8) * Math.exp(-Math.max(0, t - 0.9) / 0.1),
        dur: 1.2,
        color: 'brown',
      });
      crackle(buf, sr, rand, 0.1, 0.95, 70, {
        fLo: 1500,
        fHi: 7000,
        amp: 0.35,
        pow: 1.5,
        shape: (u) => u,
      });
      tone(buf, sr, 0.1, {
        f0: 1400,
        freq: (t) => 1400 * 1.8 ** smooth(t / 0.9),
        amp: 0.05,
        env: (t) => smooth(t / 0.9) * +(t < 0.9),
        dur: 0.95,
      });
      return buf;
    },
  },
  {
    id: 'el-spikes',
    vars: 2,
    sr: 44100,
    render(sr, rand) {
      const buf = bossMono(sr, 1.6);
      for (let i = 0; i < 5; i++) {
        const at = i * 0.07 + range(rand, 0, 0.02);
        const modes = [];
        for (let j = 0; j < 6; j++)
          modes.push([range(rand, 1800, 7000), range(rand, 0.05, 0.12), range(rand, 0.08, 0.35)]);
        modal(buf, sr, rand, at, modes, {
          amp: 0.45 - i * 0.04,
          noise: 0.4,
          noiseLp: 9000,
          noiseTau: 0.004,
        });
        noise(buf, sr, rand, at, {
          mode: 'lp',
          f0: 900,
          amp: 0.3,
          att: 0.001,
          tau: 0.03,
        });
      }
      thump(buf, sr, 0, 120, 55, 0.5, 0.1);
      return buf;
    },
  },
  {
    id: 'el-volley-wind',
    render(sr, rand) {
      const buf = bossMono(sr, 1);
      for (let i = 0; i < 4; i++) gurgle(buf, sr, rand, 0.05 + i * 0.16, 0.12, 5, 120 + i * 40, 320 + i * 60, 0.3);
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        q: 3,
        f0: 400,
        f1: 1300,
        sweep: 0.7,
        amp: 0.3,
        env: (t) => smooth(t / 0.6) * +(t < 0.72),
        dur: 0.75,
      });
      return buf;
    },
  },
  {
    id: 'el-volley',
    vars: 2,
    render(sr, rand) {
      const buf = bossMono(sr, 1.1);
      for (let i = 0; i < 4; i++) {
        const at = i * 0.085 + range(rand, 0, 0.015);
        noise(buf, sr, rand, at, {
          mode: 'bp',
          q: 1.6,
          f0: range(rand, 700, 1000),
          f1: 300,
          sweep: 0.08,
          amp: 0.55,
          att: 0.002,
          tau: 0.04,
          dur: 0.15,
        });
        tone(buf, sr, at, {
          f0: range(rand, 380, 460),
          f1: 180,
          glide: 0.03,
          amp: 0.3,
          att: 0.002,
          tau: 0.05,
        });
      }
      return buf;
    },
  },
  {
    id: 'el-pound-wind',
    render(sr, rand) {
      const buf = bossMono(sr, 1.1);
      tone(buf, sr, 0, {
        f0: 110,
        freq: (t) => 110 * 3 ** smooth(t / 0.8) * (1 + 0.06 * Math.sin(TAU * 14 * t)),
        amp: 0.35,
        env: (t) => smooth(t / 0.1) * (t < 0.8 ? 1 : Math.exp(-(t - 0.8) / 0.04)),
        dur: 0.9,
        harm: [0.4, 0.2],
      });
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        q: 4,
        f0: 500,
        f1: 1800,
        sweep: 0.8,
        amp: 0.2,
        env: (t) => smooth(t / 0.8) * +(t < 0.82),
        dur: 0.85,
      });
      return buf;
    },
  },
  {
    id: 'el-pound',
    vars: 2,
    render(sr, rand) {
      const buf = bossMono(sr, 1.8);
      for (let i = 0; i < 3; i++) {
        const at = i * 0.22;
        thump(buf, sr, at, 110 - i * 8, 45, 0.8, 0.14);
        noise(buf, sr, rand, at, {
          mode: 'lp',
          f0: 900,
          f1: 200,
          sweep: 0.1,
          amp: 0.55,
          att: 0.002,
          tau: 0.06,
          dur: 0.4,
        });
        tone(buf, sr, at + 0.01, {
          f0: 300,
          freq: (t) => 300 * (1 + 0.8 * Math.exp(-t / 0.05)),
          amp: 0.12,
          att: 0.002,
          tau: 0.12,
        });
      }
      noise(buf, sr, rand, 0.45, {
        mode: 'lp',
        f0: 150,
        amp: 0.4,
        env: (t) => Math.exp(-t / 0.5),
        dur: 1.2,
        color: 'brown',
      });
      return buf;
    },
  },
];
export const CHOIR_ROOTS = [38, 44, 50, 56, 62, 68, 74];
export const BRASS_ROOTS = [34, 40, 46, 52, 58, 64, 70];
const BOSS_MUSIC_RECIPES = [
  ...CHOIR_ROOTS.map((midi) => ({
    id: `bm-choir:${midi}`,
    sr: 24000,
    keepTail: true,
    level: -16,
    render(sr, rng) {
      const out = bossMono(sr, 3.6);
      choirNote(out, sr, rng, 0, midi, 2.6, 0.8, {
        att: 0.25,
        rel: 0.6,
        vowel: midi < 50 ? 'oh' : 'ah',
        voices: 4,
      });
      return out;
    },
  })),
  ...BRASS_ROOTS.map((midi) => ({
    id: `bm-brass:${midi}`,
    sr: 24000,
    keepTail: true,
    level: -16,
    render(sr, rng) {
      const out = bossMono(sr, 2.6);
      brassNote(out, sr, rng, 0, midi, 1.2, 0.7, 0.4);
      brassNote(out, sr, rng, 0.004, midi + 12, 1.2, 0.25, 0.35);
      return out;
    },
  })),
  {
    id: 'bm-timp',
    vars: 3,
    render(sr, rng, variant) {
      const out = bossMono(sr, 1.6);
      timpaniHit(out, sr, rng, 0, [38, 38, 45][variant % 3], 0.9, 1);
      return out;
    },
  },
  {
    id: 'bm-boom',
    vars: 2,
    render(sr, rng) {
      const out = bossMono(sr, 2);
      thump(out, sr, 0, range(rng, 58, 64), 34, 1, 0.6);
      noise(out, sr, rng, 0, {
        mode: 'lp',
        f0: 380,
        amp: 0.6,
        att: 0.002,
        tau: 0.05,
      });
      noise(out, sr, rng, 0.01, {
        mode: 'lp',
        f0: 120,
        amp: 0.4,
        env: (t) => Math.exp(-t / 0.5),
        dur: 1.6,
        color: 'brown',
      });
      return out;
    },
  },
  {
    id: 'bm-anvil',
    vars: 2,
    sr: 44100,
    render(sr, rng) {
      const out = bossMono(sr, 1.4);
      const f0 = range(rng, 780, 860);
      modal(
        out,
        sr,
        rng,
        0,
        [
          [f0, 0.5, 0.5],
          [f0 * 2.76, 0.35, 0.3],
          [f0 * 5.4, 0.25, 0.16],
          [f0 * 8.9, 0.15, 0.08],
        ],
        {
          amp: 0.7,
          noise: 0.5,
          noiseLp: 8000,
          noiseTau: 0.003,
        },
      );
      return out;
    },
  },
  {
    id: 'bm-gong',
    sr: 32000,
    render(sr, rng) {
      const out = bossStereo(sr, 4);
      for (const pan of [-0.4, 0.4])
        addLayer(
          out,
          sr,
          4,
          (buf) => {
            const modes = [];
            for (let i = 0; i < 18; i++)
              modes.push([range(rng, 90, 1400), range(rng, 0.05, 0.2), range(rng, 1.2, 3.2)]);
            modal(buf, sr, rng, 0, modes, {
              amp: 0.4,
              att: 0.02,
            });
            noise(buf, sr, rng, 0, {
              mode: 'bp',
              q: 0.8,
              f0: 500,
              f1: 2500,
              sweep: 1.2,
              amp: 0.25,
              env: (t) => smooth(t / 0.6) * Math.exp(-Math.max(0, t - 0.6) / 1.2),
              dur: 4,
            });
          },
          pan,
        );
      return out;
    },
  },
];
export const BOSS_RECIPES = [...BOSS_SOUNDS, ...STINGER_SOUNDS, ...ELITE_SOUNDS, ...BOSS_MUSIC_RECIPES];
