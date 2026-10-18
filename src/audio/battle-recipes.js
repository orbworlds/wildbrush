/**
 * Battle music samples: Karplus-Strong pizzicato notes across the pizz range, and the taiko, tom, clack, shaker, crash, swell and sting hits the battle music is sequenced from.
 */
import {
  clamp,
  crackle,
  makeBuffer,
  mixPanned,
  modal,
  mtof,
  noise,
  OnePole,
  range,
  smooth,
  SVF,
  TAU,
  tone,
} from './dsp.js';
import { pianoNote } from './instruments.js';
export const PIZZ_RANGE = [34, 78];
function pizzNote(sr, midi, rng) {
  const freq = mtof(midi);
  const decay = clamp(0.95 * (98 / freq) ** 0.4, 0.22, 1.2);
  const out = makeBuffer(sr, decay + 0.12);
  const period = Math.max(2, Math.round(sr / freq - 0.5));
  const line = new Float32Array(period + 1);
  const exciteLp = new OnePole(sr, Math.min(sr * 0.4, freq * 9));
  const burst = new Float32Array(period);
  for (let i = 0; i < period; i++) burst[i] = exciteLp.lp(rng() * 2 - 1);
  const pluckOffset = Math.max(1, Math.round(period / 6));
  let mean = 0;
  for (let i = 0; i < period; i++) {
    line[i] = burst[i] - 0.7 * burst[(i + pluckOffset) % period];
    mean += line[i];
  }
  mean /= period;
  for (let i = 0; i < period; i++) line[i] -= mean;
  const loss = 0.001 ** (1 / (freq * decay));
  const bodyLo = new SVF(sr, 230, 2.2);
  const bodyHi = new SVF(sr, 470, 2.6);
  let pos = 0;
  let prev = line[period - 1];
  for (let i = 0; i < out.length; i++) {
    const cur = line[pos];
    const next = loss * 0.5 * (cur + prev);
    prev = cur;
    line[pos] = next;
    pos = pos + 1 >= period ? 0 : pos + 1;
    bodyLo.tick(next);
    bodyHi.tick(next);
    out[i] = next + 0.35 * bodyLo.bpn + 0.2 * bodyHi.bpn;
  }
  noise(out, sr, rng, 0, {
    mode: 'bp',
    f0: Math.min(4000, freq * 5),
    q: 1,
    amp: 0.06,
    att: 0.0005,
    tau: 0.004,
  });
  return out;
}
const PIZZ_RECIPES = [];
for (let midi = PIZZ_RANGE[0]; midi <= PIZZ_RANGE[1]; midi += 4)
  PIZZ_RECIPES.push({
    id: `pizz:${midi}`,
    sr: 24000,
    level: -16,
    keepTail: true,
    render: (sr, rng) => pizzNote(sr, midi, rng),
  });
const battleStereo = (sr, dur) => [makeBuffer(sr, dur), makeBuffer(sr, dur)];
export const BATTLE_RECIPES = [
  {
    id: 'bt-taiko',
    vars: 3,
    render(sr, rng) {
      const out = makeBuffer(sr, 1);
      tone(out, sr, 0, {
        f0: range(rng, 100, 112),
        f1: 50,
        glide: 0.035,
        amp: 0.9,
        att: 0.0015,
        tau: 0.22,
      });
      modal(
        out,
        sr,
        rng,
        0,
        [
          [range(rng, 170, 190), 0.3, 0.12],
          [range(rng, 280, 300), 0.2, 0.07],
          [range(rng, 410, 440), 0.12, 0.04],
        ],
        {
          amp: 0.5,
        },
      );
      noise(out, sr, rng, 0, {
        mode: 'lp',
        f0: 450,
        amp: 0.55,
        att: 0.0008,
        tau: 0.02,
      });
      noise(out, sr, rng, 0, {
        mode: 'bp',
        f0: 2500,
        q: 1,
        amp: 0.2,
        att: 0.0003,
        tau: 0.003,
      });
      return out;
    },
  },
  {
    id: 'bt-tom',
    vars: 3,
    render(sr, rng, variant) {
      const out = makeBuffer(sr, 0.7);
      const f0 = [210, 170, 140][variant % 3] * range(rng, 0.97, 1.03);
      tone(out, sr, 0, {
        f0: f0 * 1.25,
        f1: f0,
        glide: 0.02,
        amp: 0.8,
        att: 0.0012,
        tau: 0.13,
      });
      modal(
        out,
        sr,
        rng,
        0,
        [
          [f0 * 1.6, 0.2, 0.06],
          [f0 * 2.3, 0.1, 0.03],
        ],
        {
          amp: 0.5,
        },
      );
      noise(out, sr, rng, 0, {
        mode: 'lp',
        f0: 900,
        amp: 0.4,
        att: 0.0005,
        tau: 0.012,
      });
      return out;
    },
  },
  {
    id: 'bt-clack',
    vars: 3,
    sr: 44100,
    render(sr, rng) {
      const out = makeBuffer(sr, 0.4);
      modal(
        out,
        sr,
        rng,
        0,
        [
          [range(rng, 880, 960), 0.5, 0.025],
          [range(rng, 1550, 1700), 0.35, 0.016],
          [range(rng, 2500, 2800), 0.2, 0.009],
        ],
        {
          amp: 0.7,
          noise: 0.35,
          noiseLp: 6000,
          noiseTau: 0.002,
        },
      );
      noise(out, sr, rng, 0, {
        mode: 'bp',
        f0: 2200,
        q: 0.9,
        amp: 0.35,
        att: 0.0008,
        tau: 0.045,
      });
      tone(out, sr, 0, {
        f0: 240,
        f1: 180,
        glide: 0.02,
        amp: 0.3,
        att: 0.001,
        tau: 0.03,
      });
      return out;
    },
  },
  {
    id: 'bt-shaker',
    vars: 4,
    sr: 44100,
    render(sr, rng) {
      const out = makeBuffer(sr, 0.18);
      noise(out, sr, rng, 0, {
        mode: 'hp',
        f0: range(rng, 5500, 7000),
        amp: 0.5,
        att: range(rng, 0.006, 0.014),
        tau: 0.03,
        dur: 0.12,
      });
      crackle(out, sr, rng, 0.002, 0.06, 900, {
        fLo: 5000,
        fHi: 11000,
        amp: 0.25,
        pow: 1.5,
      });
      return out;
    },
  },
  {
    id: 'bt-crash',
    sr: 44100,
    render(sr, rng) {
      const out = battleStereo(sr, 2.6);
      for (const ch of [0, 1]) {
        const buf = out[ch];
        noise(buf, sr, rng, 0, {
          mode: 'hp',
          f0: 3200 + ch * 200,
          amp: 0.55,
          att: 0.002,
          tau: 0.6,
          dur: 2.5,
        });
        noise(buf, sr, rng, 0, {
          mode: 'bp',
          f0: 7500,
          q: 0.7,
          amp: 0.3,
          att: 0.002,
          tau: 0.9,
          dur: 2.5,
        });
        const modes = [];
        for (let i = 0; i < 10; i++) modes.push([range(rng, 2500, 9000), range(rng, 0.05, 0.12), range(rng, 0.3, 1.1)]);
        modal(buf, sr, rng, 0, modes, {
          amp: 0.5,
        });
      }
      return out;
    },
  },
  {
    id: 'bt-swell',
    sr: 44100,
    render(sr, rng) {
      const dur = 1.3;
      const out = battleStereo(sr, dur);
      for (const ch of [0, 1])
        noise(out[ch], sr, rng, 0, {
          mode: 'hp',
          f0: 4200 + ch * 300,
          amp: 0.45,
          env: (t) => clamp(t / 1.15, 0, 1) ** 2.6 * (t < 1.15 ? 1 : Math.exp(-(t - 1.15) / 0.015)),
          dur,
        });
      return out;
    },
  },
  {
    id: 'bt-sting',
    sr: 32000,
    render(sr, rng) {
      const dur = 3.2;
      const out = battleStereo(sr, dur);
      for (const [midi, gain, pan] of [
        [38, 0.55, -0.15],
        [50, 0.45, 0.1],
        [57, 0.35, -0.2],
        [62, 0.32, 0.2],
        [63, 0.26, 0],
        [74, 0.22, 0.3],
      ])
        mixPanned(out[0], out[1], pianoNote(sr, midi, rng, 2.6), 0, gain, pan);
      const boom = makeBuffer(sr, dur);
      tone(boom, sr, 0, {
        f0: 96,
        f1: 44,
        glide: 0.04,
        amp: 0.9,
        att: 0.0015,
        tau: 0.3,
      });
      noise(boom, sr, rng, 0, {
        mode: 'lp',
        f0: 500,
        amp: 0.6,
        att: 0.001,
        tau: 0.03,
      });
      mixPanned(out[0], out[1], boom, 0, 0.9, 0);
      for (const ch of [0, 1]) {
        noise(out[ch], sr, rng, 0, {
          mode: 'hp',
          f0: 3400 + ch * 250,
          amp: 0.3,
          att: 0.002,
          tau: 0.5,
          dur: 2.4,
        });
        noise(out[ch], sr, rng, 0, {
          mode: 'bp',
          f0: 600,
          f1: 5000,
          sweep: 0.12,
          q: 0.8,
          amp: 0.25,
          att: 0.02,
          tau: 0.08,
        });
      }
      const rumble = makeBuffer(sr, dur);
      noise(rumble, sr, rng, 0, {
        mode: 'bp',
        f0: 150,
        q: 2,
        amp: 0.3,
        env: (t) => smooth(t / 0.05) * Math.exp(-t / 0.9) * (0.7 + 0.3 * Math.sin(TAU * 14 * t)),
        dur: 2.6,
      });
      mixPanned(out[0], out[1], rumble, 0, 1, 0);
      return out;
    },
  },
  ...PIZZ_RECIPES,
];
