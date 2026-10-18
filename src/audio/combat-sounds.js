/**
 * Combat sound recipes: brush swings and the spin charge, hits for each paint colour, Smudge, Spitter and Brute noises, the attack telegraph and alert sting, and the hero's hurt, death, pickup, lock-on, perfect-dodge and flurry sounds. Defines the whoosh, ink splat, thump and formant voice helpers that later recipes reuse.
 */
import {
  attackDecay,
  bubble,
  clamp,
  crackle,
  droplet,
  grains,
  makeBuffer,
  mixPanned,
  modal,
  mtof,
  noise,
  pick,
  range,
  smooth,
  smoothNoise,
  SVF,
  TAU,
  tone,
} from './dsp.js';
import { bellNote, celestaNote, harpNote, pianoNote, SawOsc } from './instruments.js';
const mono = (sr, dur) => makeBuffer(sr, dur);
const stereo = (sr, dur) => [makeBuffer(sr, dur), makeBuffer(sr, dur)];
export function whoosh(buf, sr, rand, t0, dur, f0, fPeak, f1, amp, q = 1.1) {
  const peakAt = dur * range(rand, 0.38, 0.5);
  noise(buf, sr, rand, t0, {
    mode: 'bp',
    q,
    f0,
    fc: (t) =>
      t < peakAt
        ? f0 * (fPeak / f0) ** +smooth(t / peakAt)
        : fPeak * (f1 / fPeak) ** +smooth((t - peakAt) / (dur - peakAt)),
    amp,
    env: (t) => (t < peakAt ? smooth(t / peakAt) : Math.exp(-(t - peakAt) / (dur * 0.22))) ** 1.4,
    dur: dur * 1.6,
  });
}
export function inkSplat(buf, sr, rand, t0, size, gain) {
  noise(buf, sr, rand, t0, {
    mode: 'lp',
    f0: 1600,
    amp: 0.8 * gain,
    att: 0.0006,
    tau: 0.018 * size,
  });
  const squelchF = range(rand, 700, 950);
  noise(buf, sr, rand, t0, {
    mode: 'bp',
    q: 3.2,
    f0: squelchF,
    fc: (t) => squelchF * 0.3 ** smooth(t / (0.09 * size)),
    amp: 0.6 * gain,
    att: 0.002,
    tau: 0.06 * size,
    dur: 0.35 * size,
  });
  const slurpF = range(rand, 240, 320);
  noise(buf, sr, rand, t0 + 0.01, {
    mode: 'bp',
    q: 5,
    f0: slurpF,
    fc: (t) => slurpF + 900 * smooth(t / 0.06),
    amp: 0.35 * gain,
    att: 0.004,
    tau: 0.04 * size,
    dur: 0.2 * size,
  });
  const drops = Math.round(3 + 5 * size);
  for (let i = 0; i < drops; i++)
    droplet(buf, sr, t0 + range(rand, 0.05, 0.12 + 0.2 * size), range(rand, 900, 2600), range(rand, 0.03, 0.08) * gain);
  crackle(buf, sr, rand, t0 + 0.02, 0.18 * size, 90, {
    fLo: 1500,
    fHi: 5000,
    amp: 0.3 * gain,
    pow: 2,
    shape: (u) => 1 - u,
  });
}
export function thump(buf, sr, t0, f0, f1, amp, tau) {
  tone(buf, sr, t0, {
    f0,
    f1,
    glide: tau * 0.5,
    amp,
    att: 0.0015,
    tau,
  });
}
export function formantVoice(buf, sr, rand, t0, dur, opts) {
  const i0 = Math.round(t0 * sr);
  const len = Math.min(buf.length - i0, Math.round(dur * sr));
  const saw = new SawOsc(sr, rand());
  const filters = opts.formants.map(([f, q]) => new SVF(sr, f, q));
  const wobble = smoothNoise(rand, 28);
  const rough = opts.rough ?? 0;
  let subGain = 0;
  let subPhase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let f = opts.f0(t) * (1 + (opts.jitter ?? 0.01) * wobble(t));
    subPhase += f / sr / 2;
    if (subPhase > 1) --subPhase;
    subGain = 1 - rough * (subPhase < 0.5 ? 0 : 1);
    f = Math.max(20, f);
    const x = saw.next(f) * subGain + (opts.breath ?? 0.15) * (rand() * 2 - 1);
    let y = 0;
    for (let j = 0; j < filters.length; j++) {
      filters[j].tick(x);
      y += filters[j].bpn * opts.formants[j][2];
    }
    const fade = i > len - 64 ? (len - i) / 64 : 1;
    buf[i0 + i] += y * opts.env(t) * opts.amp * fade;
  }
}
function mixAt(dst, src, t0, sr, gain) {
  const offset = Math.round(t0 * sr);
  for (let i = 0; i < src.length && offset + i < dst.length; i++) if (offset + i >= 0) dst[offset + i] += src[i] * gain;
}
const SWING_SOUNDS = [
  {
    id: 'swing-light',
    vars: 5,
    render(sr, rand) {
      const buf = mono(sr, 0.5);
      const dur = range(rand, 0.2, 0.26);
      whoosh(buf, sr, rand, 0, dur, range(rand, 500, 650), range(rand, 2600, 3400), range(rand, 900, 1200), 0.7, 1.2);
      whoosh(buf, sr, rand, 0.01, dur * 0.9, 1800, 6500, 3000, 0.18, 0.8);
      grains(buf, sr, rand, dur * 0.4, 0.12, 10, {
        fLo: 3000,
        fHi: 8000,
        q: 1.2,
        gLo: 0.002,
        gHi: 0.006,
        amp: 0.2,
      });
      for (let i = 0; i < 3; i++)
        droplet(buf, sr, range(rand, dur * 0.6, dur + 0.12), range(rand, 1400, 2800), range(rand, 0.02, 0.05));
      return buf;
    },
  },
  {
    id: 'swing-heavy',
    vars: 3,
    render(sr, rand) {
      const buf = mono(sr, 0.8);
      const dur = range(rand, 0.34, 0.4);
      whoosh(buf, sr, rand, 0, dur, 280, range(rand, 1500, 1900), 500, 0.9, 1);
      whoosh(buf, sr, rand, 0.02, dur, 900, 4200, 1500, 0.22, 0.8);
      noise(buf, sr, rand, 0, {
        mode: 'lp',
        f0: 260,
        amp: 0.25,
        env: (t) => smooth(t / (dur * 0.45)) * Math.exp(-Math.max(0, t - dur * 0.45) / 0.08),
        dur: dur * 1.5,
      });
      grains(buf, sr, rand, dur * 0.45, 0.16, 16, {
        fLo: 2500,
        fHi: 7000,
        q: 1.2,
        gLo: 0.002,
        gHi: 0.007,
        amp: 0.2,
      });
      return buf;
    },
  },
  {
    id: 'swing-spin',
    vars: 2,
    render(sr, rand) {
      const buf = mono(sr, 1.2);
      const dur = 0.72;
      const whirl = (t) => 0.55 + 0.45 * Math.sin(TAU * (7 * t + 9 * t * t));
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        q: 1.4,
        f0: 400,
        fc: (t) => 400 * 9 ** smooth(t / dur),
        amp: 0.85,
        env: (t) => smooth(t / 0.12) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.1)) * whirl(t),
        dur: 1.12,
      });
      noise(buf, sr, rand, 0, {
        mode: 'lp',
        f0: 300,
        amp: 0.3,
        env: (t) => smooth(t / 0.2) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.08)),
        dur: 1.02,
      });
      tone(buf, sr, 0.05, {
        f0: mtof(74),
        freq: (t) => mtof(74) * 2 ** ((7 / 12) * smooth(t / dur)),
        amp: 0.08,
        env: (t) => smooth(t / 0.3) * (t < 0.6699999999999999 ? 1 : Math.exp(-(t - dur + 0.05) / 0.12)),
        dur: 1.12,
        harm: [0.3],
      });
      grains(buf, sr, rand, 0.2, 0.6, 30, {
        fLo: 3000,
        fHi: 8500,
        q: 1.2,
        gLo: 0.002,
        gHi: 0.006,
        amp: 0.18,
        shape: (u) => u,
      });
      return buf;
    },
  },
  {
    id: 'swing-dive',
    vars: 2,
    render(sr, rand) {
      const buf = mono(sr, 0.8);
      const dur = 0.42;
      tone(buf, sr, 0, {
        f0: 1500,
        freq: (t) => 1500 * 0.22 ** smooth(t / dur),
        amp: 0.12,
        env: (t) => smooth(t / 0.08) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.05)),
        dur: 0.62,
      });
      whoosh(buf, sr, rand, 0, dur, 2200, 3200, 400, 0.8, 1);
      noise(buf, sr, rand, 0.05, {
        mode: 'lp',
        f0: 400,
        amp: 0.3,
        env: (t) => smooth(t / (dur * 0.8)) * Math.exp(-Math.max(0, t - dur * 0.8) / 0.06),
        dur: 0.62,
      });
      return buf;
    },
  },
  {
    id: 'swing-flurry',
    vars: 6,
    sr: 44100,
    render(sr, rand) {
      const buf = mono(sr, 0.3);
      const dur = range(rand, 0.09, 0.13);
      whoosh(buf, sr, rand, 0, dur, range(rand, 900, 1300), range(rand, 4200, 6000), 2000, 0.8, 1.3);
      grains(buf, sr, rand, dur * 0.5, 0.06, 5, {
        fLo: 3500,
        fHi: 9000,
        q: 1.2,
        gLo: 0.002,
        gHi: 0.005,
        amp: 0.2,
      });
      return buf;
    },
  },
  {
    id: 'charge-hum',
    loop: 0.5,
    render(sr, rand) {
      const dur = 3.5;
      const buf = mono(sr, dur);
      const drift = smoothNoise(rand, 1.3);
      for (const [midi, gain] of [
        [50, 0.4],
        [57, 0.25],
        [62, 0.2],
        [69, 0.08],
        [74, 0.05],
      ]) {
        const freq = mtof(midi);
        tone(buf, sr, 0, {
          f0: freq,
          freq: (t) => freq * (1 + 0.003 * drift(t + midi)),
          amp: gain,
          env: () => 1,
          dur,
          harm: [0.15],
        });
      }
      const wobble = smoothNoise(rand, 3);
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        q: 2,
        f0: 1200,
        fc: (t) => 1200 * 2 ** wobble(t),
        amp: 0.12,
        env: () => 1,
        dur,
      });
      grains(buf, sr, rand, 0, dur, 60, {
        fLo: 3000,
        fHi: 8000,
        q: 1.5,
        gLo: 0.003,
        gHi: 0.01,
        amp: 0.05,
      });
      return buf;
    },
  },
  {
    id: 'charge-ready',
    sr: 44100,
    render(sr, rand) {
      const out = stereo(sr, 1.6);
      mixPanned(out[0], out[1], bellNote(sr, 86, rand, 1.4), 0, 0.35, -0.2);
      mixPanned(out[0], out[1], celestaNote(sr, 93, rand), Math.round(0.03 * sr), 0.4, 0.25);
      const air = mono(sr, 1.6);
      noise(air, sr, rand, 0, {
        mode: 'hp',
        f0: 6000,
        amp: 0.1,
        att: 0.001,
        tau: 0.08,
      });
      mixPanned(out[0], out[1], air, 0, 1, 0);
      return out;
    },
  },
];
const HIT_SOUNDS = [
  {
    id: 'hit-thwack',
    vars: 6,
    render(sr, rand) {
      const buf = mono(sr, 0.7);
      noise(buf, sr, rand, 0, {
        mode: 'hp',
        f0: 2500,
        amp: 0.5,
        att: 0.0003,
        tau: 0.004,
      });
      modal(
        buf,
        sr,
        rand,
        0,
        [
          [range(rand, 380, 480), 0.4, 0.03],
          [range(rand, 900, 1100), 0.25, 0.018],
        ],
        {
          amp: 0.5,
        },
      );
      thump(buf, sr, 0, range(rand, 140, 170), 55, 0.85, 0.07);
      noise(buf, sr, rand, 0, {
        mode: 'lp',
        f0: 700,
        amp: 0.55,
        att: 0.001,
        tau: 0.035,
      });
      inkSplat(buf, sr, rand, 0.004, 0.8, 0.8);
      return buf;
    },
  },
  {
    id: 'hit-heavy',
    vars: 3,
    render(sr, rand) {
      const buf = mono(sr, 1.4);
      thump(buf, sr, 0, 95, 32, 1, 0.22);
      noise(buf, sr, rand, 0, {
        mode: 'lp',
        f0: 500,
        f1: 180,
        amp: 0.7,
        att: 0.001,
        tau: 0.08,
      });
      noise(buf, sr, rand, 0, {
        mode: 'hp',
        f0: 3000,
        amp: 0.35,
        att: 0.0003,
        tau: 0.006,
      });
      inkSplat(buf, sr, rand, 0.01, 1.5, 1);
      noise(buf, sr, rand, 0.02, {
        mode: 'bp',
        f0: 1800,
        f1: 400,
        sweep: 0.4,
        q: 0.8,
        amp: 0.25,
        att: 0.01,
        tau: 0.15,
      });
      for (let i = 0; i < 10; i++)
        bubble(buf, sr, range(rand, 0.05, 0.5), range(rand, 250, 900), range(rand, 0.04, 0.1), range(rand, 0.02, 0.05));
      return buf;
    },
  },
  {
    id: 'hit-ember',
    vars: 3,
    render(sr, rand) {
      const buf = mono(sr, 1.2);
      const flicker = smoothNoise(rand, 34);
      noise(buf, sr, rand, 0, {
        mode: 'hp',
        f0: 3200,
        amp: 0.45,
        env: (t) => attackDecay(t, 0.01, 0.25) * (0.7 + 0.3 * flicker(t)),
        dur: 1.1,
      });
      crackle(buf, sr, rand, 0.01, 0.8, 140, {
        fLo: 2500,
        fHi: 8500,
        amp: 0.5,
        pow: 2.3,
        shape: (u) => (1 - u) ** 1.6,
      });
      noise(buf, sr, rand, 0, {
        mode: 'lp',
        f0: 220,
        fc: (t) => 220 + 1200 * Math.exp(-t / 0.1),
        q: 0.8,
        amp: 0.4,
        att: 0.02,
        tau: 0.12,
        color: 'pink',
      });
      return buf;
    },
  },
  {
    id: 'hit-frost',
    vars: 3,
    sr: 44100,
    render(sr, rand) {
      const buf = mono(sr, 1.1);
      noise(buf, sr, rand, 0, {
        mode: 'hp',
        f0: 5000,
        amp: 0.35,
        att: 0.0003,
        tau: 0.01,
      });
      modal(
        buf,
        sr,
        rand,
        0,
        [
          [range(rand, 2400, 2800), 0.35, 0.05],
          [range(rand, 3900, 4400), 0.25, 0.035],
          [range(rand, 6100, 6900), 0.18, 0.02],
          [range(rand, 8200, 9000), 0.1, 0.012],
        ],
        {
          amp: 0.7,
          noise: 0.3,
          noiseLp: 9000,
          noiseTau: 0.002,
        },
      );
      crackle(buf, sr, rand, 0.005, 0.35, 260, {
        fLo: 2500,
        fHi: 9000,
        amp: 0.4,
        pow: 2,
        shape: (u) => 1 - u,
      });
      for (let i = 0; i < 6; i++)
        tone(buf, sr, range(rand, 0.04, 0.5), {
          f0: range(rand, 3500, 8000),
          amp: range(rand, 0.03, 0.07),
          att: 0.0008,
          tau: range(rand, 0.05, 0.15),
        });
      return buf;
    },
  },
  {
    id: 'hit-spring',
    vars: 3,
    render(sr, rand) {
      const buf = mono(sr, 0.9);
      const freq = range(rand, 150, 180);
      tone(buf, sr, 0, {
        f0: freq,
        freq: (t) =>
          freq * (1 + 1.4 * (1 - Math.exp(-t / 0.07))) * (1 + 0.1 * Math.exp(-t / 0.25) * Math.sin(TAU * 14 * t)),
        amp: 0.55,
        att: 0.004,
        tau: 0.22,
        harm: [0.35, 0.12],
      });
      noise(buf, sr, rand, 0, {
        mode: 'lp',
        f0: 600,
        amp: 0.3,
        att: 0.002,
        tau: 0.02,
      });
      return buf;
    },
  },
  {
    id: 'hit-bloom',
    vars: 3,
    render(sr, rand) {
      const buf = mono(sr, 0.9);
      modal(
        buf,
        sr,
        rand,
        0,
        [
          [range(rand, 550, 850), 0.5, 0.02],
          [range(rand, 1400, 2100), 0.35, 0.012],
          [range(rand, 2900, 3500), 0.2, 0.007],
        ],
        {
          amp: 0.7,
          noise: 0.45,
          noiseLp: 5000,
        },
      );
      grains(buf, sr, rand, 0.01, 0.35, 40, {
        fLo: 2500,
        fHi: 7500,
        q: 1.2,
        gLo: 0.003,
        gHi: 0.012,
        amp: 0.4,
        shape: (u) => (1 - u) ** 1.2,
      });
      for (const at of [0.04, 0.11]) {
        const freq = range(rand, 420, 600);
        tone(buf, sr, at, {
          f0: freq,
          f1: freq * 2.1,
          glide: 0.03,
          amp: 0.15,
          att: 0.004,
          tau: 0.05,
          harm: [0.2],
        });
      }
      return buf;
    },
  },
  {
    id: 'hit-shatter',
    vars: 2,
    sr: 44100,
    render(sr, rand) {
      const out = stereo(sr, 2.2);
      const impact = mono(sr, 2.2);
      thump(impact, sr, 0, 120, 45, 0.6, 0.08);
      noise(impact, sr, rand, 0, {
        mode: 'hp',
        f0: 3000,
        amp: 0.8,
        att: 0.0003,
        tau: 0.03,
      });
      noise(impact, sr, rand, 0, {
        mode: 'bp',
        f0: 5000,
        f1: 2500,
        sweep: 0.3,
        q: 0.8,
        amp: 0.4,
        att: 0.001,
        tau: 0.12,
      });
      mixPanned(out[0], out[1], impact, 0, 1, 0);
      for (let i = 0; i < 38; i++) {
        const shard = mono(sr, 2.2);
        const at = rand() ** 1.6 * 0.9;
        const freq = range(rand, 1800, 9500);
        modal(
          shard,
          sr,
          rand,
          at,
          [
            [freq, 0.5, range(rand, 0.03, 0.12)],
            [freq * range(rand, 1.5, 2.8), 0.25, 0.02],
          ],
          {
            amp: range(rand, 0.12, 0.35) * (1 - at * 0.6),
          },
        );
        mixPanned(out[0], out[1], shard, 0, 1, range(rand, -0.9, 0.9));
      }
      const debris = mono(sr, 2.2);
      crackle(debris, sr, rand, 0.01, 1.4, 90, {
        fLo: 3000,
        fHi: 9500,
        amp: 0.35,
        pow: 2,
        shape: (u) => (1 - u) ** 2,
      });
      mixPanned(out[0], out[1], debris, 0, 1, 0.1);
      return out;
    },
  },
  {
    id: 'enemy-burst',
    vars: 4,
    sr: 44100,
    render(sr, rand, variant) {
      const out = stereo(sr, 2.6);
      const burst = mono(sr, 2.6);
      thump(burst, sr, 0, 170, 60, 0.6, 0.08);
      inkSplat(burst, sr, rand, 0, 1.4, 0.9);
      for (let i = 0; i < 14; i++)
        bubble(
          burst,
          sr,
          range(rand, 0.02, 0.45),
          range(rand, 300, 1400),
          range(rand, 0.05, 0.12),
          range(rand, 0.015, 0.04),
        );
      noise(burst, sr, rand, 0.02, {
        mode: 'bp',
        f0: 1500,
        f1: 6000,
        sweep: 0.25,
        q: 0.8,
        amp: 0.2,
        att: 0.03,
        tau: 0.12,
      });
      mixPanned(out[0], out[1], burst, 0, 1, 0);
      const chords = [
        [74, 78, 81, 86],
        [74, 76, 80, 85],
        [74, 78, 83, 88],
        [74, 76, 81, 86],
      ];
      const chord = chords[variant % chords.length];
      chord.forEach((midi, i) => {
        mixPanned(
          out[0],
          out[1],
          celestaNote(sr, midi, rand, 2.2),
          Math.round((0.05 + i * 0.035) * sr),
          0.32 - i * 0.03,
          -0.45 + i * 0.3,
        );
      });
      mixPanned(out[0], out[1], bellNote(sr, chord[3] + 12, rand, 1.8), Math.round(0.19 * sr), 0.1, 0.2);
      for (let i = 0; i < 10; i++) {
        const ping = mono(sr, 2.6);
        tone(ping, sr, range(rand, 0.15, 0.9), {
          f0: range(rand, 3000, 7500),
          amp: 0.05,
          att: 0.001,
          tau: range(rand, 0.05, 0.2),
        });
        mixPanned(out[0], out[1], ping, 0, 1, range(rand, -0.8, 0.8));
      }
      return out;
    },
  },
];
export function gurgle(buf, sr, rand, t0, span, count, fLo, fHi, amp) {
  for (let i = 0; i < count; i++)
    bubble(
      buf,
      sr,
      t0 + range(rand, 0, span),
      range(rand, fLo, fHi),
      range(rand, 0.5, 1) * amp,
      range(rand, 0.015, 0.04),
    );
}
function squeak(buf, sr, rand, t0, dur, f0, f1, amp) {
  const flutter = range(rand, 20, 40);
  tone(buf, sr, t0, {
    f0,
    freq: (t) => (f0 + (f1 - f0) * smooth(t / dur)) * (1 + 0.04 * Math.sin(TAU * flutter * t)),
    amp,
    env: (t) => smooth(t / 0.008) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.015)),
    dur: dur + 0.08,
    harm: [0.35, 0.18, 0.08],
  });
}
const ENEMY_SOUNDS = [
  {
    id: 'smudge-chitter',
    vars: 6,
    render(sr, rand) {
      const buf = mono(sr, 0.8);
      let at = 0.005;
      const count = 3 + Math.floor(rand() * 4);
      const base = range(rand, 1100, 1700);
      for (let i = 0; i < count; i++) {
        const dur = range(rand, 0.025, 0.05);
        const f0 = base * range(rand, 0.8, 1.35);
        squeak(buf, sr, rand, at, dur, f0, f0 * range(rand, 0.7, 1.4), range(rand, 0.2, 0.32));
        if (rand() < 0.5)
          noise(buf, sr, rand, at, {
            mode: 'bp',
            f0: 3500,
            q: 2,
            amp: 0.1,
            att: 0.001,
            tau: 0.006,
          });
        at += dur + range(rand, 0.02, 0.05);
      }
      gurgle(buf, sr, rand, 0, at, 6, 220, 520, 0.14);
      return buf;
    },
  },
  {
    id: 'smudge-squeal',
    vars: 3,
    render(sr, rand) {
      const buf = mono(sr, 0.9);
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        f0: 1800,
        q: 2.5,
        amp: 0.2,
        att: 0.01,
        tau: 0.03,
      });
      const dur = range(rand, 0.28, 0.36);
      const f0 = range(rand, 800, 1000);
      tone(buf, sr, 0.03, {
        f0,
        freq: (t) => f0 * 2.8 ** smooth(t / (dur * 0.6)) * (1 + 0.05 * Math.sin(TAU * 18 * t) * smooth(t / 0.1)),
        amp: 0.4,
        env: (t) => smooth(t / 0.02) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.05)),
        dur: dur + 0.3,
        harm: [0.4, 0.2, 0.1],
      });
      gurgle(buf, sr, rand, 0.02, 0.35, 10, 250, 700, 0.18);
      return buf;
    },
  },
  {
    id: 'smudge-hurt',
    vars: 4,
    render(sr, rand) {
      const buf = mono(sr, 0.5);
      const f0 = range(rand, 1700, 2200);
      squeak(buf, sr, rand, 0, range(rand, 0.09, 0.13), f0, f0 * 0.42, 0.4);
      gurgle(buf, sr, rand, 0.03, 0.2, 7, 200, 600, 0.2);
      return buf;
    },
  },
  {
    id: 'smudge-lunge',
    vars: 3,
    render(sr, rand) {
      const buf = mono(sr, 0.6);
      const f0 = range(rand, 1000, 1300);
      squeak(buf, sr, rand, 0, 0.1, f0, f0 * 1.8, 0.3);
      whoosh(buf, sr, rand, 0.03, 0.22, 500, 2200, 700, 0.5, 1.1);
      gurgle(buf, sr, rand, 0, 0.15, 4, 250, 500, 0.12);
      return buf;
    },
  },
  {
    id: 'spitter-inflate',
    vars: 2,
    render(sr, rand) {
      const buf = mono(sr, 1.1);
      const dur = 0.8;
      for (let i = 0; i < 46; i++) {
        const pos = rand() ** 0.8;
        bubble(
          buf,
          sr,
          pos * dur,
          (150 + 500 * pos) * range(rand, 0.85, 1.15),
          range(rand, 0.1, 0.22) * (0.5 + pos),
          range(rand, 0.015, 0.035),
        );
      }
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        q: 1.4,
        f0: 900,
        fc: (t) => 900 * 4 ** smooth(t / dur),
        amp: 0.35,
        env: (t) => smooth(t / dur) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.04)),
        dur: 1,
      });
      tone(buf, sr, 0, {
        f0: 130,
        freq: (t) => 130 * 3.2 ** smooth(t / dur) * (1 + 0.03 * Math.sin(TAU * 11 * t)),
        amp: 0.3,
        env: (t) => smooth(t / 0.2) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.03)),
        dur: 0.9500000000000001,
        harm: [0.5, 0.25],
      });
      return buf;
    },
  },
  {
    id: 'spitter-spit',
    vars: 3,
    render(sr, rand) {
      const buf = mono(sr, 0.7);
      noise(buf, sr, rand, 0, {
        mode: 'lp',
        f0: 900,
        amp: 0.8,
        att: 0.0005,
        tau: 0.008,
      });
      tone(buf, sr, 0, {
        f0: range(rand, 380, 460),
        f1: 140,
        glide: 0.03,
        amp: 0.55,
        att: 0.001,
        tau: 0.05,
      });
      noise(buf, sr, rand, 0.02, {
        mode: 'bp',
        f0: range(rand, 1300, 1700),
        f1: 700,
        sweep: 0.15,
        q: 1.2,
        amp: 0.55,
        att: 0.008,
        tau: 0.08,
      });
      noise(buf, sr, rand, 0.02, {
        mode: 'hp',
        f0: 3000,
        amp: 0.2,
        att: 0.005,
        tau: 0.05,
      });
      gurgle(buf, sr, rand, 0.03, 0.2, 6, 300, 900, 0.18);
      return buf;
    },
  },
  {
    id: 'spitter-hiss',
    vars: 2,
    render(sr, rand) {
      const buf = mono(sr, 1);
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        f0: 3800,
        f1: 2400,
        sweep: 0.6,
        q: 1.2,
        amp: 0.5,
        env: (t) => attackDecay(t, 0.05, 0.25),
        dur: 0.9,
      });
      gurgle(buf, sr, rand, 0.05, 0.5, 14, 180, 500, 0.2);
      tone(buf, sr, 0.02, {
        f0: 240,
        f1: 160,
        glide: 0.3,
        amp: 0.2,
        att: 0.03,
        tau: 0.2,
        harm: [0.4],
      });
      return buf;
    },
  },
  {
    id: 'glob-splat',
    vars: 3,
    render(sr, rand) {
      const buf = mono(sr, 0.7);
      thump(buf, sr, 0, 120, 60, 0.4, 0.05);
      inkSplat(buf, sr, rand, 0, 1, 0.8);
      gurgle(buf, sr, rand, 0.02, 0.3, 8, 150, 450, 0.2);
      return buf;
    },
  },
  {
    id: 'brute-growl',
    vars: 3,
    render(sr, rand) {
      const buf = mono(sr, 1.8);
      const dur = range(rand, 1, 1.3);
      const f0 = range(rand, 58, 70);
      formantVoice(buf, sr, rand, 0, dur + 0.3, {
        f0: (t) => f0 * (1 + 0.25 * Math.sin(Math.PI * Math.min(1, t / dur)) + 0.04 * Math.sin(TAU * 5.5 * t)),
        formants: [
          [range(rand, 320, 380), 3, 1.1],
          [range(rand, 750, 850), 4, 0.6],
          [2200, 6, 0.2],
        ],
        amp: 0.9,
        env: (t) => smooth(t / 0.15) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.1)),
        breath: 0.5,
        rough: 0.55,
        jitter: 0.03,
      });
      noise(buf, sr, rand, 0, {
        mode: 'lp',
        f0: 180,
        amp: 0.25,
        env: (t) => smooth(t / 0.2) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.1)),
        dur: dur + 0.4,
        color: 'brown',
      });
      gurgle(buf, sr, rand, 0.2, dur * 0.7, 10, 90, 260, 0.2);
      return buf;
    },
  },
  {
    id: 'brute-windup',
    vars: 2,
    render(sr, rand) {
      const buf = mono(sr, 1.3);
      const f0 = range(rand, 62, 72);
      formantVoice(buf, sr, rand, 0, 1.1, {
        f0: (t) => f0 * (1 + 0.6 * smooth(t / 1)),
        formants: [
          [340, 3, 1],
          [800, 4, 0.6],
          [2300, 6, 0.25],
        ],
        amp: 0.8,
        env: (t) => smooth(t / 0.3) * (t < 1 ? 1 : Math.exp(-(t - 1) / 0.03)),
        breath: 0.55,
        rough: 0.6,
        jitter: 0.04,
      });
      tone(buf, sr, 0, {
        f0: 80,
        freq: (t) => 80 * 3.2 ** smooth(t / 1),
        amp: 0.3,
        env: (t) =>
          smooth(t / 1) * (0.6 + 0.4 * Math.sin(TAU * (4 * t + 8 * t * t))) * (t < 1 ? 1 : Math.exp(-(t - 1) / 0.02)),
        dur: 1.1,
        harm: [0.5, 0.3],
      });
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        q: 1,
        f0: 300,
        fc: (t) => 300 * 6 ** smooth(t / 1),
        amp: 0.3,
        env: (t) => smooth(t / 1) * (t < 1 ? 1 : Math.exp(-(t - 1) / 0.03)),
        dur: 1.1,
      });
      return buf;
    },
  },
  {
    id: 'brute-slam',
    vars: 2,
    render(sr, rand) {
      const buf = mono(sr, 2);
      thump(buf, sr, 0, 62, 26, 1, 0.45);
      noise(buf, sr, rand, 0, {
        mode: 'lp',
        f0: 700,
        f1: 160,
        amp: 0.9,
        att: 0.001,
        tau: 0.08,
      });
      noise(buf, sr, rand, 0, {
        mode: 'hp',
        f0: 2500,
        amp: 0.4,
        att: 0.0003,
        tau: 0.008,
      });
      crackle(buf, sr, rand, 0.01, 0.9, 260, {
        fLo: 700,
        fHi: 4500,
        amp: 0.45,
        pow: 2.2,
        shape: (u) => (1 - u) ** 1.8,
        len: 0.004,
      });
      inkSplat(buf, sr, rand, 0.005, 1.8, 0.8);
      noise(buf, sr, rand, 0.02, {
        mode: 'bp',
        f0: 2200,
        f1: 180,
        sweep: 0.6,
        q: 0.8,
        amp: 0.4,
        att: 0.02,
        tau: 0.25,
      });
      return buf;
    },
  },
  {
    id: 'brute-step',
    vars: 4,
    render(sr, rand) {
      const buf = mono(sr, 0.6);
      thump(buf, sr, 0, range(rand, 75, 90), 40, 0.8, 0.09);
      noise(buf, sr, rand, 0, {
        mode: 'lp',
        f0: 380,
        amp: 0.5,
        att: 0.002,
        tau: 0.035,
      });
      crackle(buf, sr, rand, 0.004, 0.12, 280, {
        fLo: 900,
        fHi: 3800,
        amp: 0.3,
        pow: 2,
        shape: (u) => 1 - u,
      });
      gurgle(buf, sr, rand, 0.02, 0.12, 3, 120, 300, 0.1);
      return buf;
    },
  },
  {
    id: 'smudge-step',
    vars: 4,
    render(sr, rand) {
      const buf = mono(sr, 0.3);
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        q: 4,
        f0: 260,
        fc: (t) => 260 + 700 * smooth(t / 0.05),
        amp: 0.5,
        att: 0.004,
        tau: 0.03,
        dur: 0.12,
      });
      bubble(buf, sr, 0.02, range(rand, 500, 900), 0.2, 0.02);
      return buf;
    },
  },
  {
    id: 'telegraph',
    vars: 2,
    sr: 44100,
    render(sr, rand) {
      const buf = mono(sr, 0.9);
      const dur = 0.6;
      const f0 = mtof(74);
      const rise = (t) => smooth(t / dur) ** 1.3 * (t < dur ? 1 : Math.exp(-(t - dur) / 0.025));
      tone(buf, sr, 0, {
        f0,
        freq: (t) => f0 * 2 ** smooth(t / dur),
        amp: 0.35,
        env: (t) => rise(t) * (0.7 + 0.3 * Math.sin(TAU * (6 * t + 14 * t * t))),
        dur: 0.75,
        harm: [0.25, 0.12],
      });
      tone(buf, sr, 0, {
        f0: f0 * 1.5,
        freq: (t) => f0 * 1.5 * 2 ** smooth(t / dur),
        amp: 0.08,
        env: rise,
        dur: 0.75,
      });
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        q: 2,
        f0: 2000,
        fc: (t) => 2000 * 4 ** smooth(t / dur),
        amp: 0.2,
        env: rise,
        dur: 0.75,
      });
      noise(buf, sr, rand, 0.595, {
        mode: 'hp',
        f0: 5000,
        amp: 0.2,
        att: 0.001,
        tau: 0.02,
      });
      return buf;
    },
  },
  {
    id: 'alert-sting',
    sr: 44100,
    render(sr, rand) {
      const out = stereo(sr, 1.6);
      for (const [midi, gain, pan] of [
        [74, 0.4, -0.2],
        [75, 0.3, 0.2],
        [86, 0.22, 0.1],
        [62, 0.35, -0.1],
      ])
        mixPanned(out[0], out[1], pianoNote(sr, midi, rand, 1.2), 0, gain, pan);
      const air = mono(sr, 1.6);
      noise(air, sr, rand, 0, {
        mode: 'bp',
        f0: 600,
        f1: 4000,
        sweep: 0.08,
        q: 0.9,
        amp: 0.3,
        att: 0.03,
        tau: 0.06,
      });
      noise(air, sr, rand, 0, {
        mode: 'hp',
        f0: 6000,
        amp: 0.15,
        att: 0.001,
        tau: 0.1,
      });
      mixPanned(out[0], out[1], air, 0, 1, 0);
      return out;
    },
  },
];
const HURT_VOWELS = [
  [
    [650, 4, 1],
    [1080, 5, 0.6],
    [2500, 7, 0.25],
  ],
  [
    [780, 4, 1],
    [1250, 5, 0.55],
    [2600, 7, 0.22],
  ],
  [
    [560, 4, 1],
    [1700, 5, 0.5],
    [2600, 7, 0.22],
  ],
  [
    [450, 4, 1],
    [900, 5, 0.6],
    [2400, 7, 0.2],
  ],
];
const HERO_SOUNDS = [
  {
    id: 'hero-hurt',
    vars: 4,
    render(sr, rand, variant) {
      const buf = mono(sr, 0.7);
      const dur = range(rand, 0.14, 0.2);
      const f0 = range(rand, 250, 290);
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        f0: 1400,
        q: 1.5,
        amp: 0.25,
        att: 0.004,
        tau: 0.02,
      });
      formantVoice(buf, sr, rand, 0.012, dur + 0.1, {
        f0: (t) => f0 * (1.12 - 0.3 * smooth(t / dur)),
        formants: HURT_VOWELS[variant % HURT_VOWELS.length],
        amp: 0.55,
        env: (t) => smooth(t / 0.012) * (t < dur * 0.5 ? 1 : Math.exp(-(t - dur * 0.5) / (dur * 0.35))),
        breath: 0.35,
        rough: 0.15,
        jitter: 0.02,
      });
      thump(buf, sr, 0, 120, 50, 0.6, 0.06);
      noise(buf, sr, rand, 0, {
        mode: 'lp',
        f0: 900,
        amp: 0.4,
        att: 0.0008,
        tau: 0.02,
      });
      inkSplat(buf, sr, rand, 0.005, 0.5, 0.5);
      return buf;
    },
  },
  {
    id: 'hero-death',
    sr: 32000,
    render(sr, rand) {
      const dur = 4.5;
      const out = stereo(sr, dur);
      for (const [ch, side] of [
        [0, -1],
        [1, 1],
      ]) {
        const chan = out[ch];
        const freq = mtof(74) * (1 + side * 0.002);
        tone(chan, sr, 0.05, {
          f0: freq,
          freq: (t) => freq * 0.25 ** smooth(t / 3),
          amp: 0.18,
          env: (t) => smooth(t / 0.3) * Math.exp(-Math.max(0, t - 1.2) / 1.1),
          dur: 4.2,
          harm: [0.3, 0.1],
        });
      }
      for (const [midi, gain, pan] of [
        [38, 0.45, -0.1],
        [50, 0.3, 0.1],
        [57, 0.22, -0.3],
        [65, 0.18, 0.3],
        [64, 0.12, 0],
      ])
        mixPanned(out[0], out[1], pianoNote(sr, midi, rand, 4.2), Math.round(0.02 * sr), gain, pan);
      const wash = mono(sr, dur);
      noise(wash, sr, rand, 0, {
        mode: 'lp',
        f0: 5000,
        fc: (t) => 5000 * 0.05 ** smooth(t / 2.5),
        amp: 0.25,
        env: (t) => smooth(t / 0.4) * Math.exp(-Math.max(0, t - 0.8) / 0.9),
        dur: 4,
        color: 'pink',
      });
      mixPanned(out[0], out[1], wash, 0, 1, 0);
      return out;
    },
  },
  {
    id: 'pickup-heart',
    sr: 44100,
    render(sr, rand) {
      const out = stereo(sr, 2.2);
      [74, 78, 81, 86, 90].forEach((midi, i) => {
        mixPanned(
          out[0],
          out[1],
          celestaNote(sr, midi + 12, rand, 1.6),
          Math.round(i * 0.065 * sr),
          0.34 + i * 0.03,
          -0.5 + i * 0.25,
        );
        if (i < 4)
          mixPanned(out[0], out[1], harpNote(sr, midi, rand, 1.5), Math.round(i * 0.065 * sr), 0.22, 0.4 - i * 0.2);
      });
      mixPanned(out[0], out[1], bellNote(sr, 93, rand, 1.8), Math.round(0.33 * sr), 0.14, 0);
      for (let i = 0; i < 14; i++) {
        const ping = mono(sr, 2.2);
        tone(ping, sr, range(rand, 0.2, 1), {
          f0: range(rand, 3500, 8000),
          amp: 0.05,
          att: 0.001,
          tau: range(rand, 0.05, 0.18),
        });
        mixPanned(out[0], out[1], ping, 0, 1, range(rand, -0.8, 0.8));
      }
      return out;
    },
  },
  {
    id: 'pickup-ink',
    vars: 3,
    render(sr, rand) {
      const buf = mono(sr, 0.8);
      for (let i = 0; i < 9; i++)
        bubble(
          buf,
          sr,
          0.01 + i * 0.03 + range(rand, -0.01, 0.01),
          (350 + i * 110) * range(rand, 0.9, 1.1),
          range(rand, 0.2, 0.35),
          range(rand, 0.02, 0.04),
        );
      tone(buf, sr, 0.25, {
        f0: 700,
        f1: 1400,
        glide: 0.02,
        amp: 0.25,
        att: 0.002,
        tau: 0.05,
      });
      mixAt(buf, celestaNote(sr, pick(rand, [86, 88, 90]), rand, 1), 0.26, sr, 0.25);
      return buf;
    },
  },
  {
    id: 'lock-on',
    sr: 44100,
    render(sr, rand) {
      const buf = mono(sr, 0.5);
      modal(
        buf,
        sr,
        rand,
        0,
        [
          [2100, 0.5, 0.012],
          [3500, 0.25, 0.008],
        ],
        {
          amp: 0.6,
          noise: 0.25,
          noiseLp: 7000,
          noiseTau: 0.002,
        },
      );
      tone(buf, sr, 0.015, {
        f0: mtof(81),
        f1: mtof(88),
        glide: 0.012,
        amp: 0.3,
        att: 0.002,
        tau: 0.08,
        harm: [0.2],
      });
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        f0: 900,
        f1: 3500,
        sweep: 0.06,
        q: 1.2,
        amp: 0.2,
        att: 0.01,
        tau: 0.03,
      });
      return buf;
    },
  },
  {
    id: 'lock-off',
    sr: 44100,
    render(sr, rand) {
      const buf = mono(sr, 0.4);
      tone(buf, sr, 0, {
        f0: mtof(86),
        f1: mtof(79),
        glide: 0.015,
        amp: 0.25,
        att: 0.002,
        tau: 0.05,
      });
      noise(buf, sr, rand, 0, {
        mode: 'bp',
        f0: 3000,
        f1: 900,
        sweep: 0.08,
        q: 1.2,
        amp: 0.15,
        att: 0.005,
        tau: 0.03,
      });
      return buf;
    },
  },
  {
    id: 'perfect-dodge',
    sr: 44100,
    render(sr, rand) {
      const out = stereo(sr, 2);
      const slowmo = mono(sr, 2);
      noise(slowmo, sr, rand, 0, {
        mode: 'bp',
        q: 1.2,
        f0: 3500,
        fc: (t) => 3500 * 0.08 ** smooth(t / 0.9),
        amp: 0.7,
        env: (t) => smooth(t / 0.05) * Math.exp(-t / 0.5),
        dur: 1.4,
      });
      tone(slowmo, sr, 0, {
        f0: 440,
        freq: (t) => 440 * 0.5 ** smooth(t / 0.7) * (1 + 0.01 * Math.sin(TAU * 3 * t)),
        amp: 0.25,
        env: (t) => smooth(t / 0.02) * Math.exp(-t / 0.6),
        dur: 1.5,
        harm: [0.4, 0.2],
      });
      thump(slowmo, sr, 0, 90, 40, 0.5, 0.15);
      mixPanned(out[0], out[1], slowmo, 0, 1, 0);
      for (const [ch, step] of [
        [0, 1],
        [1, 2],
      ]) {
        const swell = mono(sr, 2);
        noise(swell, sr, rand, 0.35, {
          mode: 'hp',
          f0: 4500 + step * 300,
          amp: 0.3,
          env: (t) => clamp(t / 1.1, 0, 1) ** 3 * (t < 1.1 ? 1 : Math.exp(-(t - 1.1) / 0.02)),
          dur: 1.2,
        });
        for (let i = 0; i < swell.length; i++) out[ch][i] += swell[i];
      }
      mixPanned(out[0], out[1], bellNote(sr, 81, rand, 1.8), Math.round(0.02 * sr), 0.12, 0);
      return out;
    },
  },
  {
    id: 'flurry-run',
    sr: 44100,
    render(sr, rand) {
      const out = stereo(sr, 2.2);
      [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86, 88, 90, 93].forEach((midi, i) => {
        mixPanned(
          out[0],
          out[1],
          harpNote(sr, midi, rand, 1.2),
          Math.round(i * 0.032 * sr),
          0.22 + i * 0.012,
          -0.7 + i * 0.1,
        );
        if (i % 2 == 0)
          mixPanned(
            out[0],
            out[1],
            celestaNote(sr, midi + 12, rand, 1.2),
            Math.round(i * 0.032 * sr),
            0.12,
            0.5 - i * 0.07,
          );
      });
      const sweep = mono(sr, 2.2);
      noise(sweep, sr, rand, 0, {
        mode: 'bp',
        f0: 800,
        f1: 7000,
        sweep: 0.45,
        q: 1,
        amp: 0.2,
        env: (t) => smooth(t / 0.4) * Math.exp(-Math.max(0, t - 0.45) / 0.1),
        dur: 1,
      });
      mixPanned(out[0], out[1], sweep, 0, 1, 0);
      return out;
    },
  },
];
export const COMBAT_SOUNDS = [...SWING_SOUNDS, ...HIT_SOUNDS, ...ENEMY_SOUNDS, ...HERO_SOUNDS];
