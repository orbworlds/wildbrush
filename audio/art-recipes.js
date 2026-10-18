/**
 * Brush art sound recipes for the four colours: seamless charge hums and the ready chimes, the cast and hit sounds of the fireball, ice lance, bounce orb and vine lash, the heavy hit and the fizzle when ink runs out.
 */
import { inkSplat, thump, whoosh } from './combat-sounds.js';
import {
  attackDecay,
  crackle,
  creak,
  droplet,
  grains,
  makeBuffer,
  mixPanned,
  modal,
  mtof,
  noise,
  range,
  smooth,
  smoothNoise,
  SVF,
  TAU,
  tone,
} from './dsp.js';
import { bellNote, celestaNote } from './instruments.js';
const artMono = (sr, dur) => makeBuffer(sr, dur);
const artStereo = (sr, dur) => [makeBuffer(sr, dur), makeBuffer(sr, dur)];
function artLayer(out, sr, dur, draw, pan = 0, gain = 1) {
  const layer = artMono(sr, dur);
  draw(layer);
  mixPanned(out[0], out[1], layer, 0, gain, pan);
}
function artReflections(out, sr, wet, lpHz = 2200) {
  const taps = [
    [0.037, 0.5, 1],
    [0.061, 0.42, -1],
    [0.097, 0.33, 1],
    [0.149, 0.25, -1],
    [0.211, 0.17, 1],
    [0.293, 0.11, -1],
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
function leafRustle(buf, sr, rng, at, span, count, amp, shape, fLo = 1800, fHi = 7500) {
  const bp = new SVF(sr, 3000, 1.1);
  for (let i = 0; i < count; i++) {
    const pos = rng();
    const gain = amp * shape(pos) * rng() ** 1.2;
    const len = Math.max(4, Math.round(range(rng, 0.003, 0.015) * sr));
    const freq = fLo * (fHi / fLo) ** +rng();
    if (gain < 0.0001) continue;
    const start = Math.round((at + pos * span) * sr);
    bp.set(freq, 1.1);
    for (let j = 0; j < len && start + j < buf.length; j++)
      if (!(start + j < 0)) {
        bp.tick(rng() * 2 - 1);
        buf[start + j] += bp.bpn * gain * (0.5 - 0.5 * Math.cos((TAU * j) / len));
      }
  }
}
function frostGlints(buf, sr, rng, at, span, count, amp, fLo = 4200, fHi = 9500) {
  for (let i = 0; i < count; i++)
    tone(buf, sr, at + range(rng, 0, span), {
      f0: range(rng, fLo, fHi),
      amp: amp * range(rng, 0.5, 1),
      att: 0.0008,
      tau: range(rng, 0.04, 0.14),
    });
}
function loopSafeFreq(freq, bend, loopLen) {
  const steps = Math.round(loopLen * 4000);
  let cycles = 0;
  for (let i = 0; i < steps; i++) cycles += bend((i + 0.5) / 4000) / 4000;
  cycles *= freq;
  return (Math.max(1, Math.round(cycles)) / cycles) * freq;
}
const ART_CHARGE_LOOP = 3;
const ART_CHARGE_XFADE = 0.5;
const ART_CHARGE_RECIPES = [
  {
    id: 'art-charge-red',
    loop: ART_CHARGE_XFADE,
    render(sr, rng) {
      const dur = 3.5;
      const out = artMono(sr, dur);
      const flicker = smoothNoise(rng, 7);
      const sweepLfo = smoothNoise(rng, 1.6);
      noise(out, sr, rng, 0, {
        mode: 'lp',
        q: 0.9,
        color: 'pink',
        f0: 420,
        fc: (t) => 420 * 2 ** (0.6 * sweepLfo(t)),
        amp: 0.9,
        env: (t) => 0.72 + 0.28 * flicker(t),
        dur,
      });
      noise(out, sr, rng, 0, {
        mode: 'lp',
        f0: 130,
        color: 'brown',
        amp: 0.55,
        env: (t) => 0.8 + 0.2 * sweepLfo(t + 3),
        dur,
      });
      noise(out, sr, rng, 0, {
        mode: 'bp',
        q: 0.8,
        f0: 2400,
        fc: (t) => 2400 * 2 ** (0.5 * flicker(t + 1)),
        amp: 0.1,
        env: (t) => 0.6 + 0.4 * flicker(t + 2),
        dur,
      });
      crackle(out, sr, rng, 0, dur, 55, {
        fLo: 1500,
        fHi: 7000,
        amp: 0.55,
        pow: 2.4,
      });
      crackle(out, sr, rng, 0, dur, 18, {
        fLo: 600,
        fHi: 2000,
        amp: 0.4,
        pow: 2,
        len: 0.004,
      });
      return out;
    },
  },
  {
    id: 'art-charge-blue',
    loop: ART_CHARGE_XFADE,
    sr: 44100,
    render(sr, rng) {
      const dur = 3.5;
      const out = artMono(sr, dur);
      [86, 93, 98, 100, 102, 105].forEach((midi, i) => {
        const freq = mtof(midi) * (1 + range(rng, -0.002, 0.002));
        const shimmer = smoothNoise(rng, range(rng, 2.5, 5));
        const vibRate = 0.6 + i * 0.13;
        tone(out, sr, 0, {
          f0: freq,
          freq: (t) => freq * (1 + 0.0025 * Math.sin(TAU * vibRate * t)),
          amp: 0.09 / (1 + i * 0.25),
          env: (t) => (0.5 + 0.5 * shimmer(t)) ** 2,
          dur,
        });
      });
      const sweepLfo = smoothNoise(rng, 1.2);
      noise(out, sr, rng, 0, {
        mode: 'bp',
        q: 1.6,
        f0: 7000,
        fc: (t) => 7000 * 2 ** (0.4 * sweepLfo(t)),
        amp: 0.1,
        env: () => 1,
        dur,
      });
      frostGlints(out, sr, rng, 0, 3.3, 26, 0.05, 3500, 9000);
      crackle(out, sr, rng, 0, dur, 30, {
        fLo: 4000,
        fHi: 10000,
        amp: 0.15,
        pow: 2,
      });
      return out;
    },
  },
  {
    id: 'art-charge-yellow',
    loop: 0.06,
    render(sr, rng) {
      const dur = 3.06;
      const out = artMono(sr, dur);
      const rootWobble = (t) => 2 ** ((1.1 * Math.sin(TAU * 5 * t) + 0.35 * Math.sin((5 / 3) * TAU * t)) / 12);
      const rootFreq = loopSafeFreq(mtof(50), rootWobble, ART_CHARGE_LOOP);
      tone(out, sr, 0, {
        f0: rootFreq,
        freq: (t) => rootFreq * rootWobble(t),
        amp: 0.5,
        env: (t) => 0.8 + 0.2 * Math.sin(TAU * 5 * t + 1),
        dur,
        harm: [0.45, 0.25, 0.12, 0.06],
      });
      const fifthWobble = (t) => 2 ** ((0.8 * Math.sin((10 / 3) * TAU * t + 2)) / 12);
      const fifthFreq = loopSafeFreq(mtof(57), fifthWobble, ART_CHARGE_LOOP);
      tone(out, sr, 0, {
        f0: fifthFreq,
        freq: (t) => fifthFreq * fifthWobble(t),
        amp: 0.22,
        env: (t) => 0.7 + 0.3 * Math.sin((10 / 3) * TAU * t),
        dur,
        harm: [0.3, 0.1],
      });
      noise(out, sr, rng, 0, {
        mode: 'bp',
        q: 4,
        f0: 600,
        fc: (t) => 600 * 2 ** (0.9 * Math.sin(TAU * 5 * t)),
        amp: 0.12,
        env: () => 1,
        dur,
      });
      return out;
    },
  },
  {
    id: 'art-charge-green',
    loop: ART_CHARGE_XFADE,
    render(sr, rng) {
      const dur = 3.5;
      const out = artMono(sr, dur);
      const sway = smoothNoise(rng, 2.2);
      grains(out, sr, rng, 0, dur, 520, {
        fLo: 1800,
        fHi: 7500,
        q: 1.1,
        gLo: 0.003,
        gHi: 0.014,
        amp: 0.4,
        shape: (u) => 0.45 + 0.55 * (0.5 + 0.5 * sway(u * dur)),
      });
      for (let i = 0; i < 4; i++)
        creak(out, sr, rng, i * 0.82 + range(rng, 0, 0.25), range(rng, 0.35, 0.6), {
          rate0: range(rng, 28, 40),
          rate1: range(rng, 45, 70),
          f1: range(rng, 280, 420),
          f2: range(rng, 800, 1200),
          amp: 0.28,
        });
      noise(out, sr, rng, 0, {
        mode: 'lp',
        f0: 180,
        color: 'brown',
        amp: 0.35,
        env: (t) => 0.8 + 0.2 * sway(t + 5),
        dur,
      });
      for (let i = 0; i < 6; i++)
        modal(
          out,
          sr,
          rng,
          range(rng, 0, 3.4),
          [
            [range(rng, 900, 1600), 0.4, 0.012],
            [range(rng, 2200, 3200), 0.25, 0.007],
          ],
          {
            amp: 0.15,
            noise: 0.1,
            noiseLp: 4000,
          },
        );
      return out;
    },
  },
  {
    id: 'art-ready',
    vars: 4,
    sr: 44100,
    render(sr, rng, variant) {
      const out = artStereo(sr, 1.4);
      const midi = [81, 86, 78, 74][variant] ?? 86;
      mixPanned(out[0], out[1], bellNote(sr, midi + 12, rng, 1.2), 0, 0.28, -0.15);
      mixPanned(out[0], out[1], celestaNote(sr, midi, rng, 1.3), Math.round(0.012 * sr), 0.45, 0.15);
      artLayer(out, sr, 1.4, (buf) => {
        if (variant === 0) {
          noise(buf, sr, rng, 0, {
            mode: 'lp',
            color: 'pink',
            f0: 300,
            f1: 2400,
            sweep: 0.08,
            amp: 0.5,
            att: 0.01,
            tau: 0.12,
          });
          crackle(buf, sr, rng, 0.01, 0.3, 90, {
            fLo: 2000,
            fHi: 7000,
            amp: 0.35,
            shape: (u) => 1 - u,
          });
        } else if (variant === 1) {
          frostGlints(buf, sr, rng, 0, 0.25, 6, 0.05, 5000, 9500);
          noise(buf, sr, rng, 0, {
            mode: 'hp',
            f0: 7000,
            amp: 0.12,
            att: 0.001,
            tau: 0.1,
          });
        } else if (variant === 2) {
          const f0 = mtof(62);
          tone(buf, sr, 0, {
            f0,
            freq: (t) =>
              f0 * (1 + (1 - Math.exp(-t / 0.05))) * (1 + 0.06 * Math.exp(-t / 0.15) * Math.sin(TAU * 14 * t)),
            amp: 0.25,
            att: 0.003,
            tau: 0.14,
            harm: [0.3],
          });
        } else {
          leafRustle(buf, sr, rng, 0, 0.25, 45, 0.3, (u) => (1 - u) ** 1.5, 2500, 7000);
          modal(
            buf,
            sr,
            rng,
            0,
            [
              [1100, 0.3, 0.02],
              [2500, 0.2, 0.01],
            ],
            {
              amp: 0.3,
            },
          );
        }
      });
      return out;
    },
  },
];
const ART_CAST_RECIPES = [
  {
    id: 'art-cast-fireball',
    vars: 2,
    render(sr, rng) {
      const out = artMono(sr, 1.6);
      noise(out, sr, rng, 0, {
        mode: 'lp',
        q: 1,
        f0: 200,
        color: 'pink',
        fc: (t) => (t < 0.07 ? 200 * 15 ** (t / 0.07) : 3000 * 0.12 ** Math.min(1, (t - 0.07) / 0.9)),
        amp: 1.3,
        att: 0.012,
        tau: 0.22,
        dur: 1.4,
      });
      thump(out, sr, 0, 110, 40, 0.8, 0.09);
      whoosh(out, sr, rng, 0.03, 0.55, 500, 1400, 250, 0.7, 0.9);
      noise(out, sr, rng, 0.05, {
        mode: 'bp',
        q: 1.2,
        f0: 900,
        f1: 350,
        sweep: 0.8,
        amp: 0.3,
        att: 0.05,
        tau: 0.35,
        dur: 1.2,
      });
      crackle(out, sr, rng, 0.02, 1, 110, {
        fLo: 1500,
        fHi: 7000,
        amp: 0.45,
        pow: 2.2,
        shape: (u) => (1 - u) ** 1.5,
      });
      return out;
    },
  },
  {
    id: 'art-cast-icelance',
    vars: 2,
    sr: 44100,
    render(sr, rng) {
      const out = artMono(sr, 1.1);
      noise(out, sr, rng, 0, {
        mode: 'hp',
        f0: 4000,
        amp: 0.7,
        att: 0.0003,
        tau: 0.006,
      });
      modal(
        out,
        sr,
        rng,
        0,
        [
          [range(rng, 2600, 3000), 0.35, 0.04],
          [range(rng, 4300, 4800), 0.25, 0.03],
          [range(rng, 6800, 7500), 0.15, 0.02],
        ],
        {
          amp: 0.6,
          noise: 0.3,
          noiseLp: 9000,
          noiseTau: 0.002,
        },
      );
      const f0 = range(rng, 1800, 2100);
      tone(out, sr, 0.01, {
        f0,
        freq: (t) => (t < 0.06 ? f0 * 2.6 ** (t / 0.06) : f0 * 2.6 * 0.55 ** Math.min(1, (t - 0.06) / 0.5)),
        amp: 0.22,
        env: (t) => attackDecay(t, 0.004, 0.18),
        dur: 0.75,
        harm: [0.2, 0.08],
      });
      noise(out, sr, rng, 0.005, {
        mode: 'bp',
        q: 6,
        f0: 5000,
        fc: (t) => 5000 * 0.45 ** Math.min(1, t / 0.5),
        amp: 0.25,
        att: 0.003,
        tau: 0.15,
        dur: 0.7,
      });
      whoosh(out, sr, rng, 0, 0.2, 2500, 7000, 2000, 0.35, 1.2);
      frostGlints(out, sr, rng, 0.03, 0.55, 10, 0.05);
      return out;
    },
  },
  {
    id: 'art-cast-bounceorb',
    vars: 2,
    render(sr, rng) {
      const out = artMono(sr, 1);
      noise(out, sr, rng, 0, {
        mode: 'lp',
        f0: 900,
        amp: 0.55,
        att: 0.001,
        tau: 0.02,
      });
      thump(out, sr, 0, 140, 70, 0.45, 0.04);
      const f0 = range(rng, 170, 190);
      tone(out, sr, 0.005, {
        f0,
        freq: (t) =>
          f0 * (1 + 1.8 * (1 - Math.exp(-t / 0.06))) * (1 + 0.12 * Math.exp(-t / 0.3) * Math.sin(TAU * 11 * t)),
        amp: 0.6,
        att: 0.004,
        tau: 0.3,
        dur: 0.95,
        harm: [0.4, 0.15, 0.06],
      });
      tone(out, sr, 0.02, {
        f0: f0 * 4.1,
        freq: (t) => f0 * 4.1 * (1 + 0.5 * (1 - Math.exp(-t / 0.05))),
        amp: 0.07,
        att: 0.003,
        tau: 0.12,
      });
      whoosh(out, sr, rng, 0, 0.25, 700, 2400, 900, 0.25, 1);
      return out;
    },
  },
  {
    id: 'art-cast-vinelash',
    vars: 3,
    render(sr, rng) {
      const out = artMono(sr, 1);
      const crackAt = range(rng, 0.12, 0.16);
      noise(out, sr, rng, 0, {
        mode: 'bp',
        q: 1.1,
        f0: 500,
        fc: (t) => 500 * 9 ** smooth(t / crackAt),
        amp: 0.7,
        env: (t) => (t < crackAt ? (t / crackAt) ** 2 : Math.exp(-(t - crackAt) / 0.03)),
        dur: crackAt + 0.25,
      });
      noise(out, sr, rng, crackAt, {
        mode: 'hp',
        f0: 1800,
        amp: 1.2,
        att: 0.0002,
        tau: 0.004,
      });
      noise(out, sr, rng, crackAt, {
        mode: 'bp',
        q: 0.8,
        f0: 3000,
        amp: 0.5,
        att: 0.0003,
        tau: 0.012,
      });
      modal(
        out,
        sr,
        rng,
        crackAt,
        [
          [range(rng, 1200, 1500), 0.4, 0.015],
          [range(rng, 2600, 3100), 0.3, 0.01],
        ],
        {
          amp: 0.5,
        },
      );
      leafRustle(out, sr, rng, 0.02, 0.45, 80, 0.35, (u) => (u < 0.3 ? u / 0.3 : ((1 - u) / 0.7) ** 1.5), 2200, 7500);
      creak(out, sr, rng, crackAt + 0.02, 0.28, {
        rate0: 60,
        rate1: 35,
        f1: 350,
        f2: 950,
        amp: 0.25,
      });
      return out;
    },
  },
];
const ART_HIT_RECIPES = [
  {
    id: 'art-hit-fireball',
    vars: 3,
    render(sr, rng) {
      const dur = 2.8;
      const out = artStereo(sr, dur);
      artLayer(out, sr, dur, (buf) => {
        thump(buf, sr, 0, range(rng, 72, 82), 26, 1.2, 0.42);
        noise(buf, sr, rng, 0, {
          mode: 'lp',
          f0: 3200,
          f1: 160,
          sweep: 0.45,
          amp: 1.1,
          att: 0.0015,
          tau: 0.18,
          dur: 1.4,
        });
        noise(buf, sr, rng, 0.01, {
          mode: 'lp',
          q: 0.9,
          f0: 300,
          color: 'pink',
          fc: (t) => (t < 0.08 ? 300 * 8 ** (t / 0.08) : 2400 * 0.15 ** Math.min(1, (t - 0.08) / 1.6)),
          amp: 1,
          att: 0.02,
          tau: 0.5,
          dur: 2.4,
        });
        noise(buf, sr, rng, 0.05, {
          mode: 'lp',
          f0: 150,
          color: 'brown',
          amp: 0.5,
          env: (t) => smooth(t / 0.05) * Math.exp(-t / 0.7),
          dur: 2.5,
        });
      });
      for (const pan of [-0.65, 0.65])
        artLayer(
          out,
          sr,
          dur,
          (buf) => {
            crackle(buf, sr, rng, 0.03, 1.9, 120, {
              fLo: 1200,
              fHi: 7500,
              amp: 0.45,
              pow: 2.3,
              shape: (u) => (1 - u) ** 1.3,
            });
            for (let i = 0; i < 7; i++)
              modal(
                buf,
                sr,
                rng,
                range(rng, 0.2, 1.6),
                [
                  [range(rng, 600, 1400), 0.4, 0.02],
                  [range(rng, 1800, 3200), 0.25, 0.012],
                ],
                {
                  amp: range(rng, 0.08, 0.2),
                  noise: 0.1,
                  noiseLp: 4000,
                },
              );
          },
          pan,
        );
      artReflections(out, sr, 0.35, 1600);
      return out;
    },
  },
  {
    id: 'art-hit-icelance',
    vars: 3,
    sr: 44100,
    render(sr, rng) {
      const dur = 1.8;
      const out = artStereo(sr, dur);
      artLayer(out, sr, dur, (buf) => {
        noise(buf, sr, rng, 0, {
          mode: 'hp',
          f0: 3500,
          amp: 0.9,
          att: 0.0003,
          tau: 0.02,
        });
        thump(buf, sr, 0, 150, 60, 0.5, 0.06);
        noise(buf, sr, rng, 0, {
          mode: 'bp',
          f0: 5500,
          f1: 2800,
          sweep: 0.25,
          q: 0.8,
          amp: 0.4,
          att: 0.001,
          tau: 0.1,
        });
        crackle(buf, sr, rng, 0.02, 0.8, 260, {
          fLo: 2000,
          fHi: 9000,
          amp: 0.4,
          pow: 2,
          shape: (u) => (u < 0.2 ? u / 0.2 : (1 - u) ** 1.4),
        });
        creak(buf, sr, rng, 0.08, 0.35, {
          rate0: 80,
          rate1: 130,
          f1: 600,
          f2: 1600,
          amp: 0.2,
        });
      });
      for (let i = 0; i < 22; i++) {
        const shardAt = rng() ** 1.5 * 0.7;
        const freq = range(rng, 2000, 9500);
        const amp = range(rng, 0.1, 0.3) * (1 - shardAt * 0.7);
        const ratio = range(rng, 1.6, 2.7);
        const decay = range(rng, 0.03, 0.14);
        artLayer(
          out,
          sr,
          dur,
          (buf) =>
            modal(
              buf,
              sr,
              rng,
              shardAt,
              [
                [freq, 0.5, decay],
                [freq * ratio, 0.25, 0.02],
              ],
              {
                amp,
              },
            ),
          range(rng, -0.85, 0.85),
        );
      }
      return out;
    },
  },
  {
    id: 'art-hit-bounceorb',
    vars: 2,
    render(sr, rng) {
      const out = artMono(sr, 0.9);
      thump(out, sr, 0, 170, 80, 0.55, 0.035);
      noise(out, sr, rng, 0, {
        mode: 'lp',
        f0: 1200,
        amp: 0.4,
        att: 0.0008,
        tau: 0.015,
      });
      const f0 = mtof(62) * (1 + range(rng, -0.004, 0.004));
      tone(out, sr, 0.003, {
        f0: f0 * 0.7,
        freq: (t) =>
          f0 * (0.7 + 0.3 * (1 - Math.exp(-t / 0.025))) * (1 + 0.1 * Math.exp(-t / 0.18) * Math.sin(TAU * 16 * t)),
        amp: 0.55,
        att: 0.002,
        tau: 0.2,
        dur: 0.85,
        harm: [0.35, 0.12],
      });
      tone(out, sr, 0.01, {
        f0: f0 * 3,
        amp: 0.08,
        att: 0.002,
        tau: 0.1,
      });
      return out;
    },
  },
  {
    id: 'art-hit-vinelash',
    vars: 3,
    render(sr, rng) {
      const out = artMono(sr, 1.7);
      noise(out, sr, rng, 0, {
        mode: 'hp',
        f0: 2500,
        amp: 0.5,
        att: 0.0003,
        tau: 0.006,
      });
      modal(
        out,
        sr,
        rng,
        0,
        [
          [range(rng, 600, 800), 0.4, 0.02],
          [range(rng, 1500, 1900), 0.3, 0.012],
        ],
        {
          amp: 0.5,
          noise: 0.3,
          noiseLp: 4000,
        },
      );
      leafRustle(
        out,
        sr,
        rng,
        0.02,
        1.1,
        300,
        0.42,
        (u) => (u < 0.22 ? u / 0.22 : ((1 - u) / 0.78) ** 1.6),
        1800,
        7000,
      );
      creak(out, sr, rng, 0.05, 0.7, {
        rate0: 30,
        rate1: 90,
        f1: 320,
        f2: 900,
        amp: 0.35,
      });
      creak(out, sr, rng, 0.3, 0.5, {
        rate0: 45,
        rate1: 70,
        f1: 420,
        f2: 1200,
        amp: 0.2,
      });
      const snapAt = range(rng, 0.14, 0.2);
      modal(
        out,
        sr,
        rng,
        snapAt,
        [
          [range(rng, 380, 520), 0.5, 0.03],
          [range(rng, 1100, 1500), 0.35, 0.015],
          [range(rng, 2500, 3200), 0.2, 0.008],
        ],
        {
          amp: 0.8,
          noise: 0.6,
          noiseLp: 5000,
        },
      );
      thump(out, sr, snapAt, 120, 55, 0.5, 0.06);
      noise(out, sr, rng, snapAt, {
        mode: 'lp',
        f0: 400,
        amp: 0.4,
        att: 0.002,
        tau: 0.08,
        color: 'brown',
      });
      return out;
    },
  },
  {
    id: 'art-heavy',
    vars: 4,
    render(sr, rng, variant) {
      const out = artMono(sr, 1.2);
      thump(out, sr, 0, range(rng, 105, 120), 38, 1, 0.13);
      noise(out, sr, rng, 0, {
        mode: 'lp',
        f0: 900,
        f1: 200,
        sweep: 0.15,
        amp: 0.7,
        att: 0.001,
        tau: 0.05,
      });
      inkSplat(out, sr, rng, 0.003, 1.1, 0.7);
      if (variant === 0) {
        noise(out, sr, rng, 0.01, {
          mode: 'lp',
          color: 'pink',
          f0: 400,
          f1: 1800,
          sweep: 0.05,
          amp: 0.6,
          att: 0.01,
          tau: 0.25,
        });
        crackle(out, sr, rng, 0.02, 0.7, 120, {
          fLo: 2000,
          fHi: 8000,
          amp: 0.35,
          pow: 2.2,
          shape: (u) => 1 - u,
        });
      } else if (variant === 1) {
        modal(
          out,
          sr,
          rng,
          0.005,
          [
            [range(rng, 900, 1100), 0.45, 0.04],
            [range(rng, 1900, 2300), 0.3, 0.03],
            [range(rng, 3300, 3900), 0.2, 0.02],
          ],
          {
            amp: 0.55,
            noise: 0.4,
            noiseLp: 8000,
          },
        );
        crackle(out, sr, rng, 0.01, 0.4, 200, {
          fLo: 1500,
          fHi: 6000,
          amp: 0.35,
          pow: 2,
          shape: (u) => 1 - u,
        });
      } else if (variant === 2) {
        const f0 = range(rng, 95, 105);
        tone(out, sr, 0.004, {
          f0,
          freq: (t) =>
            f0 * (1 + 1.2 * (1 - Math.exp(-t / 0.05))) * (1 + 0.1 * Math.exp(-t / 0.25) * Math.sin(TAU * 9 * t)),
          amp: 0.5,
          att: 0.003,
          tau: 0.25,
          harm: [0.4, 0.15],
        });
      } else {
        modal(
          out,
          sr,
          rng,
          0.004,
          [
            [range(rng, 300, 420), 0.5, 0.04],
            [range(rng, 800, 1000), 0.35, 0.02],
            [range(rng, 1800, 2400), 0.2, 0.01],
          ],
          {
            amp: 0.6,
            noise: 0.5,
            noiseLp: 4000,
          },
        );
        leafRustle(out, sr, rng, 0.01, 0.3, 45, 0.3, (u) => (1 - u) ** 1.5, 2000, 6500);
      }
      return out;
    },
  },
  {
    id: 'art-fizzle',
    vars: 3,
    render(sr, rng) {
      const out = artMono(sr, 0.8);
      noise(out, sr, rng, 0, {
        mode: 'bp',
        q: 0.9,
        f0: 1400,
        f1: 500,
        sweep: 0.25,
        amp: 0.5,
        att: 0.008,
        tau: 0.09,
      });
      crackle(out, sr, rng, 0.02, 0.45, 70, {
        fLo: 1500,
        fHi: 5000,
        amp: 0.35,
        pow: 1.8,
        shape: (u) => (1 - u) ** 2,
      });
      const f0 = range(rng, 520, 600);
      tone(out, sr, 0, {
        f0,
        freq: (t) => f0 * 0.4 ** smooth(t / 0.45) * (1 + 0.03 * Math.sin(TAU * 17 * t)),
        amp: 0.14,
        env: (t) => attackDecay(t, 0.01, 0.2),
        dur: 0.6,
        harm: [0.3, 0.1],
      });
      droplet(out, sr, 0.12, range(rng, 700, 900), 0.08, 0.6, 0.04);
      return out;
    },
  },
];
export const ART_RECIPES = [...ART_CHARGE_RECIPES, ...ART_CAST_RECIPES, ...ART_HIT_RECIPES];
