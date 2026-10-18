/**
 * Sound recipes for everyday effects, starting with footsteps on every surface (grass, dirt, path, sand, rock, stone, wood, water, ice, paint, snow) built from shared thud, splash, twig-snap and grunt helpers.
 */
import {
  attackDecay,
  bubble,
  crackle,
  creak,
  droplet,
  grains,
  makeBuffer,
  modal,
  noise,
  pick,
  range,
  smooth,
  smoothNoise,
  tone,
} from './dsp.js';
import { celestaNote } from './instruments.js';
const sfxMono = (sr, dur) => makeBuffer(sr, dur);
function stepThud(buf, sr, rng, at, lpHz, amp, tau = 0.022) {
  noise(buf, sr, rng, at, {
    mode: 'lp',
    f0: lpHz,
    q: 0.8,
    amp,
    att: 0.0025,
    tau,
    dur: tau * 6,
  });
}
function waterSplash(buf, sr, rng, at, size) {
  noise(buf, sr, rng, at, {
    mode: 'bp',
    f0: range(rng, 2600, 3400),
    f1: range(rng, 1000, 1400),
    sweep: 0.2 * size + 0.05,
    q: 0.7,
    amp: 0.55,
    att: 0.003 + 0.01 * size,
    tau: 0.05 + 0.1 * size,
  });
  noise(buf, sr, rng, at, {
    mode: 'lp',
    f0: 700,
    f1: 300,
    q: 0.7,
    amp: 0.35 * size,
    att: 0.01,
    tau: 0.08 + 0.18 * size,
    color: 'pink',
  });
  noise(buf, sr, rng, at + 0.004, {
    mode: 'hp',
    f0: 5000,
    amp: 0.14,
    att: 0.002,
    tau: 0.03 + 0.08 * size,
  });
  const bubbles = Math.round(4 + 16 * size);
  for (let i = 0; i < bubbles; i++)
    bubble(
      buf,
      sr,
      at + range(rng, 0.02, 0.15 + 0.6 * size),
      range(rng, 350, 1300),
      range(rng, 0.04, 0.12),
      range(rng, 0.015, 0.045),
    );
  const drops = Math.round(2 + 7 * size);
  for (let i = 0; i < drops; i++)
    droplet(buf, sr, at + range(rng, 0.08, 0.2 + 0.8 * size), range(rng, 900, 2400), range(rng, 0.03, 0.09));
}
function twigSnap(buf, sr, rng, at, amp) {
  modal(
    buf,
    sr,
    rng,
    at,
    [
      [range(rng, 500, 900), 0.5, 0.02],
      [range(rng, 1300, 2200), 0.35, 0.012],
      [range(rng, 2800, 3600), 0.2, 0.007],
    ],
    {
      amp,
      noise: amp * 0.6,
      noiseLp: 5000,
    },
  );
}
const STEP_RECIPES = [
  {
    id: 'step-grass',
    vars: 6,
    render(sr, rng) {
      const out = sfxMono(sr, 0.32);
      stepThud(out, sr, rng, 0, 170, 0.45, 0.025);
      noise(out, sr, rng, 0.004, {
        mode: 'bp',
        f0: range(rng, 3200, 4500),
        f1: range(rng, 1700, 2500),
        q: 0.9,
        amp: 0.3,
        att: 0.02,
        tau: 0.055,
        dur: 0.26,
      });
      grains(out, sr, rng, 0, 0.16, 30, {
        fLo: 2500,
        fHi: 7500,
        q: 1.4,
        gLo: 0.002,
        gHi: 0.007,
        amp: 0.45,
        shape: (u) => (1 - u) ** 1.5,
      });
      grains(out, sr, rng, range(rng, 0.05, 0.075), 0.09, 12, {
        fLo: 2500,
        fHi: 6500,
        q: 1.4,
        gLo: 0.002,
        gHi: 0.006,
        amp: 0.3,
      });
      return out;
    },
  },
  {
    id: 'step-dirt',
    vars: 6,
    render(sr, rng) {
      const out = sfxMono(sr, 0.28);
      stepThud(out, sr, rng, 0, 320, 0.6, 0.02);
      noise(out, sr, rng, 0, {
        mode: 'bp',
        f0: range(rng, 800, 1100),
        q: 0.8,
        amp: 0.2,
        att: 0.003,
        tau: 0.035,
      });
      crackle(out, sr, rng, 0.003, 0.09, 420, {
        fLo: 900,
        fHi: 3800,
        amp: 0.55,
        pow: 2,
        shape: (u) => 1 - u,
      });
      crackle(out, sr, rng, range(rng, 0.05, 0.07), 0.06, 260, {
        fLo: 1000,
        fHi: 4000,
        amp: 0.35,
        pow: 2,
      });
      return out;
    },
  },
  {
    id: 'step-path',
    vars: 6,
    render(sr, rng) {
      const out = sfxMono(sr, 0.3);
      stepThud(out, sr, rng, 0, 300, 0.5, 0.02);
      crackle(out, sr, rng, 0.002, 0.11, 300, {
        fLo: 1300,
        fHi: 5500,
        amp: 0.7,
        pow: 2.4,
        shape: (u) => 1 - u * 0.8,
        len: 0.004,
      });
      crackle(out, sr, rng, range(rng, 0.055, 0.075), 0.07, 220, {
        fLo: 1300,
        fHi: 5000,
        amp: 0.4,
        pow: 2.4,
        len: 0.004,
      });
      return out;
    },
  },
  {
    id: 'step-sand',
    vars: 6,
    render(sr, rng) {
      const out = sfxMono(sr, 0.3);
      stepThud(out, sr, rng, 0, 120, 0.3, 0.03);
      noise(out, sr, rng, 0, {
        mode: 'bp',
        f0: range(rng, 1300, 1700),
        f1: 800,
        q: 0.6,
        amp: 0.5,
        att: 0.02,
        tau: 0.06,
        dur: 0.25,
        color: 'pink',
      });
      grains(out, sr, rng, 0.005, 0.18, 70, {
        fLo: 3000,
        fHi: 8500,
        q: 1,
        gLo: 0.001,
        gHi: 0.003,
        amp: 0.25,
        shape: (u) => 1 - u,
      });
      return out;
    },
  },
  {
    id: 'step-rock',
    vars: 6,
    render(sr, rng) {
      const out = sfxMono(sr, 0.2);
      noise(out, sr, rng, 0, {
        mode: 'hp',
        f0: 3000,
        amp: 0.35,
        att: 0.0003,
        tau: 0.0025,
      });
      modal(
        out,
        sr,
        rng,
        0,
        [
          [range(rng, 900, 1300), 0.4, 0.018],
          [range(rng, 1700, 2300), 0.25, 0.012],
          [range(rng, 2800, 3600), 0.15, 0.008],
        ],
        {
          amp: 0.7,
        },
      );
      stepThud(out, sr, rng, 0, 220, 0.5, 0.018);
      crackle(out, sr, rng, 0.005, 0.05, 250, {
        fLo: 2000,
        fHi: 6500,
        amp: 0.18,
        pow: 2,
      });
      return out;
    },
  },
  {
    id: 'step-stone',
    vars: 6,
    render(sr, rng) {
      const out = sfxMono(sr, 0.25);
      noise(out, sr, rng, 0, {
        mode: 'hp',
        f0: 2500,
        amp: 0.3,
        att: 0.0003,
        tau: 0.003,
      });
      modal(
        out,
        sr,
        rng,
        0,
        [
          [range(rng, 480, 640), 0.5, 0.05],
          [range(rng, 1150, 1400), 0.3, 0.03],
          [range(rng, 2100, 2500), 0.15, 0.02],
        ],
        {
          amp: 0.7,
        },
      );
      stepThud(out, sr, rng, 0, 200, 0.45, 0.02);
      return out;
    },
  },
  {
    id: 'step-wood',
    vars: 6,
    render(sr, rng) {
      const out = sfxMono(sr, 0.35);
      const pitch = range(rng, 0.9, 1.12);
      const modes = [
        [190 * pitch, 0.6, 0.09],
        [410 * pitch, 0.45, 0.06],
        [650 * pitch, 0.3, 0.045],
        [1020 * pitch, 0.2, 0.03],
        [1650 * pitch, 0.1, 0.02],
      ];
      modal(out, sr, rng, 0, modes, {
        amp: 0.8,
        noise: 0.35,
        noiseLp: 2200,
      });
      modal(
        out,
        sr,
        rng,
        range(rng, 0.05, 0.07),
        modes.map(([freq, amp, decay]) => [freq * 1.04, amp, decay * 0.8]),
        {
          amp: 0.3,
          noise: 0.15,
          noiseLp: 2500,
        },
      );
      return out;
    },
  },
  {
    id: 'step-water',
    vars: 6,
    render(sr, rng) {
      const out = sfxMono(sr, 0.5);
      waterSplash(out, sr, rng, 0, 0.35);
      return out;
    },
  },
  {
    id: 'step-ice',
    vars: 6,
    render(sr, rng) {
      const out = sfxMono(sr, 0.25);
      noise(out, sr, rng, 0, {
        mode: 'bp',
        f0: range(rng, 4500, 6000),
        f1: range(rng, 3500, 4500),
        q: 2,
        amp: 0.4,
        att: 0.004,
        tau: 0.035,
        dur: 0.14,
      });
      noise(out, sr, rng, 0, {
        mode: 'hp',
        f0: 7000,
        amp: 0.12,
        att: 0.002,
        tau: 0.02,
      });
      modal(
        out,
        sr,
        rng,
        0,
        [
          [range(rng, 2600, 3000), 0.3, 0.04],
          [range(rng, 4100, 4500), 0.2, 0.03],
          [range(rng, 6000, 6800), 0.12, 0.02],
        ],
        {
          amp: 0.45,
          noise: 0.25,
          noiseLp: 8000,
        },
      );
      stepThud(out, sr, rng, 0, 260, 0.3, 0.015);
      return out;
    },
  },
  {
    id: 'step-paint',
    vars: 6,
    render(sr, rng) {
      const out = sfxMono(sr, 0.35);
      const f0 = range(rng, 220, 300);
      noise(out, sr, rng, 0, {
        mode: 'bp',
        q: 4.5,
        f0,
        fc: (t) => f0 + 900 * smooth(t / 0.08),
        amp: 0.55,
        att: 0.008,
        tau: 0.05,
        dur: 0.2,
      });
      stepThud(out, sr, rng, 0, 300, 0.4, 0.03);
      const popAt = range(rng, 0.085, 0.12);
      noise(out, sr, rng, popAt, {
        mode: 'bp',
        q: 6,
        f0: 500,
        fc: (t) => 500 + 1600 * smooth(t / 0.025),
        amp: 0.3,
        att: 0.002,
        tau: 0.015,
        dur: 0.06,
      });
      bubble(out, sr, popAt + 0.01, range(rng, 800, 1300), 0.08, 0.02);
      return out;
    },
  },
  {
    id: 'step-snow',
    vars: 6,
    render(sr, rng) {
      const out = sfxMono(sr, 0.3);
      stepThud(out, sr, rng, 0, 160, 0.35, 0.03);
      crackle(out, sr, rng, 0, 0.13, 650, {
        fLo: 1200,
        fHi: 3600,
        amp: 0.45,
        pow: 1.6,
        shape: (u) => Math.sin(Math.PI * Math.min(1, u * 1.3)),
      });
      noise(out, sr, rng, 0.02, {
        mode: 'bp',
        f0: 1800,
        q: 3,
        amp: 0.08,
        att: 0.02,
        tau: 0.03,
      });
      return out;
    },
  },
];
function effortGrunt(buf, sr, rng, at, amp) {
  const voiceEnv = (t) => attackDecay(t, 0.018, 0.05);
  noise(buf, sr, rng, at, {
    mode: 'bp',
    f0: range(rng, 620, 760),
    q: 5,
    amp,
    env: voiceEnv,
    dur: 0.18,
  });
  noise(buf, sr, rng, at, {
    mode: 'bp',
    f0: range(rng, 1100, 1250),
    q: 6,
    amp: amp * 0.7,
    env: voiceEnv,
    dur: 0.18,
  });
  noise(buf, sr, rng, at, {
    mode: 'hp',
    f0: 2500,
    amp: amp * 0.25,
    env: voiceEnv,
    dur: 0.18,
  });
}
const MOVEMENT_RECIPES = [
  {
    id: 'jump',
    vars: 5,
    render(sr, rand, variation) {
      const out = sfxMono(sr, 0.5);
      const f0 = range(rand, 400, 520);
      const f1 = range(rand, 1400, 1900);
      noise(out, sr, rand, 0, {
        mode: 'bp',
        q: 0.9,
        f0,
        fc: (t) => f0 * (f1 / f0) ** +smooth(t / 0.14),
        amp: 0.6,
        att: 0.045,
        tau: 0.08,
        dur: 0.4,
      });
      grains(out, sr, rand, 0.01, 0.12, 8, {
        fLo: 800,
        fHi: 2600,
        q: 1,
        gLo: 0.006,
        gHi: 0.02,
        amp: 0.25,
      });
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 900,
        amp: 0.25,
        att: 0.002,
        tau: 0.02,
      });
      if (variation % 5 != 4) effortGrunt(out, sr, rand, 0.012, 0.13);
      return out;
    },
  },
  {
    id: 'land-soft',
    vars: 4,
    render(sr, rand) {
      const out = sfxMono(sr, 0.45);
      tone(out, sr, 0, {
        f0: 95,
        f1: 50,
        glide: 0.03,
        amp: 0.55,
        att: 0.002,
        tau: 0.06,
      });
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 320,
        amp: 0.5,
        att: 0.002,
        tau: 0.04,
      });
      noise(out, sr, rand, 0.01, {
        mode: 'bp',
        f0: 1200,
        q: 0.8,
        amp: 0.15,
        att: 0.01,
        tau: 0.06,
      });
      crackle(out, sr, rand, 0, 0.06, 220, {
        fLo: 1500,
        fHi: 4500,
        amp: 0.15,
        pow: 2,
      });
      return out;
    },
  },
  {
    id: 'land-heavy',
    vars: 4,
    render(sr, rand) {
      const out = sfxMono(sr, 1);
      tone(out, sr, 0, {
        f0: 72,
        f1: 36,
        glide: 0.06,
        amp: 0.9,
        att: 0.003,
        tau: 0.14,
      });
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 420,
        f1: 150,
        q: 0.8,
        amp: 0.7,
        att: 0.002,
        tau: 0.07,
      });
      crackle(out, sr, rand, 0.005, 0.3, 240, {
        fLo: 900,
        fHi: 4000,
        amp: 0.3,
        pow: 2.2,
        shape: (x) => (1 - x) ** 2,
      });
      noise(out, sr, rand, 0.01, {
        mode: 'bp',
        f0: 1000,
        q: 0.7,
        amp: 0.2,
        att: 0.01,
        tau: 0.1,
      });
      noise(out, sr, rand, 0.02, {
        mode: 'lp',
        f0: 1500,
        amp: 0.12,
        att: 0.03,
        tau: 0.2,
        color: 'pink',
      });
      return out;
    },
  },
  {
    id: 'bounce',
    vars: 4,
    render(sr, rand, variation) {
      const out = sfxMono(sr, 0.9);
      tone(out, sr, 0, {
        f0: 130,
        f1: 70,
        glide: 0.03,
        amp: 0.5,
        att: 0.002,
        tau: 0.05,
      });
      const f0 = range(rand, 200, 235) * (1 + variation * 0.03);
      tone(out, sr, 0.004, {
        f0,
        freq: (t) =>
          f0 * (1 + 0.9 * (1 - Math.exp(-t / 0.05))) * (1 + 0.09 * Math.exp(-t / 0.2) * Math.sin(2 * Math.PI * 13 * t)),
        amp: 0.55,
        att: 0.004,
        tau: 0.2,
        harm: [0.3, 0.1],
      });
      tone(out, sr, 0.03, {
        f0: f0 * 3.02 * 1.8,
        amp: 0.06,
        att: 0.003,
        tau: 0.12,
      });
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 600,
        amp: 0.25,
        att: 0.002,
        tau: 0.02,
      });
      return out;
    },
  },
  {
    id: 'glide-open',
    vars: 3,
    render(sr, rand) {
      const out = sfxMono(sr, 0.55);
      noise(out, sr, rand, 0, {
        mode: 'bp',
        f0: range(rand, 1200, 1600),
        q: 1.2,
        amp: 0.8,
        att: 0.0015,
        tau: 0.028,
      });
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 520,
        amp: 0.6,
        att: 0.002,
        tau: 0.055,
      });
      for (const [i2, at] of [0.07, 0.125, 0.175].entries())
        noise(out, sr, rand, at + range(rand, -0.01, 0.01), {
          mode: 'bp',
          f0: range(rand, 800, 1100),
          q: 1,
          amp: 0.3 * (1 - i2 * 0.28),
          att: 0.003,
          tau: 0.02,
        });
      noise(out, sr, rand, 0.01, {
        mode: 'bp',
        f0: 600,
        f1: 1400,
        sweep: 0.2,
        q: 0.7,
        amp: 0.25,
        att: 0.03,
        tau: 0.12,
      });
      return out;
    },
  },
  {
    id: 'glide-close',
    vars: 3,
    render(sr, rand) {
      const out = sfxMono(sr, 0.5);
      noise(out, sr, rand, 0, {
        mode: 'bp',
        f0: 1500,
        f1: 500,
        sweep: 0.25,
        q: 0.8,
        amp: 0.5,
        att: 0.03,
        tau: 0.09,
      });
      grains(out, sr, rand, 0.01, 0.2, 10, {
        fLo: 700,
        fHi: 2500,
        q: 1,
        gLo: 0.008,
        gHi: 0.025,
        amp: 0.2,
      });
      modal(
        out,
        sr,
        rand,
        range(rand, 0.14, 0.18),
        [
          [2200, 0.3, 0.01],
          [3400, 0.15, 0.006],
        ],
        {
          amp: 0.4,
        },
      );
      return out;
    },
  },
  {
    id: 'grab',
    vars: 4,
    render(sr, rand) {
      const out = sfxMono(sr, 0.3);
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 1600,
        amp: 0.7,
        att: 0.0008,
        tau: 0.012,
      });
      noise(out, sr, rand, 0, {
        mode: 'bp',
        f0: 2500,
        q: 1,
        amp: 0.3,
        att: 0.0006,
        tau: 0.008,
      });
      tone(out, sr, 0, {
        f0: 140,
        f1: 90,
        glide: 0.02,
        amp: 0.35,
        att: 0.001,
        tau: 0.03,
      });
      noise(out, sr, rand, 0.02, {
        mode: 'bp',
        f0: 1100,
        q: 0.8,
        amp: 0.15,
        att: 0.01,
        tau: 0.05,
      });
      crackle(out, sr, rand, 0.005, 0.04, 200, {
        fLo: 1500,
        fHi: 5000,
        amp: 0.12,
      });
      return out;
    },
  },
  {
    id: 'splash-big',
    vars: 3,
    render(sr, rand) {
      const out = sfxMono(sr, 1.5);
      tone(out, sr, 0.01, {
        f0: 150,
        f1: 60,
        glide: 0.08,
        amp: 0.45,
        att: 0.004,
        tau: 0.12,
      });
      waterSplash(out, sr, rand, 0, 1.4);
      return out;
    },
  },
  {
    id: 'swim-stroke',
    vars: 5,
    render(sr, rand) {
      const out = sfxMono(sr, 0.8);
      noise(out, sr, rand, 0, {
        mode: 'bp',
        f0: 1900,
        f1: 1000,
        sweep: 0.2,
        q: 0.7,
        amp: 0.45,
        att: 0.03,
        tau: 0.08,
      });
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 650,
        amp: 0.35,
        att: 0.02,
        tau: 0.12,
        color: 'pink',
      });
      for (let i = 0; i < 8; i++)
        bubble(
          out,
          sr,
          range(rand, 0.05, 0.35),
          range(rand, 400, 1100),
          range(rand, 0.04, 0.1),
          range(rand, 0.015, 0.04),
        );
      for (let i = 0; i < 5; i++)
        droplet(out, sr, range(rand, 0.25, 0.7), range(rand, 1000, 2400), range(rand, 0.03, 0.07));
      return out;
    },
  },
  {
    id: 'heartbeat',
    vars: 2,
    sr: 22050,
    render(sr, rand) {
      const out = sfxMono(sr, 0.65);
      tone(out, sr, 0, {
        f0: 62,
        f1: 44,
        glide: 0.03,
        amp: 0.8,
        att: 0.005,
        tau: 0.05,
      });
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 130,
        amp: 0.4,
        att: 0.004,
        tau: 0.03,
      });
      tone(out, sr, 0.2, {
        f0: 72,
        f1: 52,
        glide: 0.03,
        amp: 0.55,
        att: 0.005,
        tau: 0.04,
      });
      noise(out, sr, rand, 0.2, {
        mode: 'lp',
        f0: 150,
        amp: 0.25,
        att: 0.004,
        tau: 0.025,
      });
      return out;
    },
  },
  {
    id: 'breath-heavy',
    vars: 3,
    render(sr, rand) {
      const out = sfxMono(sr, 1.3);
      const inhale = (t) => smooth(t / 0.2) * Math.exp(-Math.max(0, t - 0.25) / 0.06);
      noise(out, sr, rand, 0, {
        mode: 'bp',
        f0: range(rand, 850, 1000),
        q: 3,
        amp: 0.3,
        env: inhale,
        dur: 0.45,
      });
      noise(out, sr, rand, 0, {
        mode: 'bp',
        f0: range(rand, 1500, 1700),
        q: 4,
        amp: 0.2,
        env: inhale,
        dur: 0.45,
      });
      noise(out, sr, rand, 0, {
        mode: 'hp',
        f0: 2500,
        amp: 0.12,
        env: inhale,
        dur: 0.45,
      });
      const exhale = (t) => attackDecay(t, 0.05, 0.22);
      noise(out, sr, rand, 0.48, {
        mode: 'bp',
        f0: range(rand, 560, 660),
        q: 3,
        amp: 0.4,
        env: exhale,
        dur: 0.8,
      });
      noise(out, sr, rand, 0.48, {
        mode: 'bp',
        f0: range(rand, 1050, 1200),
        q: 4,
        amp: 0.25,
        env: exhale,
        dur: 0.8,
      });
      noise(out, sr, rand, 0.48, {
        mode: 'hp',
        f0: 2000,
        amp: 0.1,
        env: exhale,
        dur: 0.8,
      });
      return out;
    },
  },
];
const PAINT_RECIPES = [
  {
    id: 'throw',
    vars: 5,
    render(sr, rand) {
      const out = sfxMono(sr, 0.4);
      const f0 = range(rand, 550, 700);
      const f1 = range(rand, 3500, 4600);
      noise(out, sr, rand, 0, {
        mode: 'bp',
        q: 1.8,
        f0,
        fc: (t) => f0 * (f1 / f0) ** +smooth(t / 0.09),
        amp: 0.6,
        att: 0.035,
        tau: 0.05,
        dur: 0.3,
      });
      tone(out, sr, 0.01, {
        f0: 330,
        f1: 1050,
        glide: 0.025,
        amp: 0.1,
        att: 0.003,
        tau: 0.04,
      });
      noise(out, sr, rand, 0.02, {
        mode: 'lp',
        f0: 700,
        amp: 0.25,
        att: 0.01,
        tau: 0.05,
      });
      droplet(out, sr, range(rand, 0.06, 0.12), range(rand, 1500, 2500), 0.05);
      return out;
    },
  },
  {
    id: 'splat',
    vars: 6,
    render(sr, rand) {
      const out = sfxMono(sr, 0.6);
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 1400,
        amp: 0.8,
        att: 0.0008,
        tau: 0.03,
      });
      const f0 = range(rand, 800, 1000);
      noise(out, sr, rand, 0, {
        mode: 'bp',
        q: 3,
        f0,
        fc: (t) => f0 * 0.24 ** smooth(t / 0.12),
        amp: 0.55,
        att: 0.002,
        tau: 0.07,
        dur: 0.4,
      });
      tone(out, sr, 0.002, {
        f0: range(rand, 260, 340),
        f1: 150,
        glide: 0.04,
        amp: 0.25,
        att: 0.002,
        tau: 0.05,
      });
      crackle(out, sr, rand, 0.03, 0.28, 70, {
        fLo: 1500,
        fHi: 5000,
        amp: 0.3,
        pow: 2,
        shape: (x) => 1 - x,
      });
      noise(out, sr, rand, 0, {
        mode: 'hp',
        f0: 3500,
        amp: 0.2,
        att: 0.001,
        tau: 0.02,
      });
      return out;
    },
  },
  {
    id: 'splat-ember',
    vars: 4,
    render(sr, rand) {
      const out = sfxMono(sr, 1.4);
      const flicker = smoothNoise(rand, 30);
      noise(out, sr, rand, 0.01, {
        mode: 'hp',
        f0: 3000,
        amp: 0.35,
        env: (t) => attackDecay(t, 0.05, 0.35) * (0.7 + 0.3 * flicker(t)),
        dur: 1.3,
      });
      crackle(out, sr, rand, 0.02, 1.1, 90, {
        fLo: 2500,
        fHi: 8000,
        amp: 0.45,
        pow: 2.5,
        shape: (x) => (1 - x) ** 2,
      });
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 250,
        f1: 700,
        sweep: 0.15,
        amp: 0.25,
        att: 0.03,
        tau: 0.1,
        color: 'pink',
      });
      return out;
    },
  },
  {
    id: 'splat-frost',
    vars: 4,
    render(sr, rand, variation) {
      const out = sfxMono(sr, 1.4);
      crackle(out, sr, rand, 0.01, 0.4, 170, {
        fLo: 2000,
        fHi: 7500,
        amp: 0.45,
        pow: 2,
        shape: (x) => Math.sin(Math.PI * x),
      });
      const count = 6 + variation;
      for (let i = 0; i < count; i++) {
        const at = range(rand, 0.03, 0.6);
        const freq = range(rand, 2600, 6500);
        tone(out, sr, at, {
          f0: freq,
          amp: range(rand, 0.05, 0.12),
          att: 0.0006,
          tau: range(rand, 0.06, 0.2),
        });
        tone(out, sr, at, {
          f0: freq * 2.76,
          amp: 0.03,
          att: 0.0005,
          tau: 0.03,
        });
      }
      noise(out, sr, rand, 0.05, {
        mode: 'bp',
        f0: 7000,
        q: 2,
        amp: 0.06,
        att: 0.1,
        tau: 0.3,
      });
      return out;
    },
  },
  {
    id: 'splat-spring',
    vars: 4,
    render(sr, rand) {
      const out = sfxMono(sr, 0.9);
      const f0 = range(rand, 185, 230);
      tone(out, sr, 0, {
        f0,
        freq: (t) =>
          f0 *
          (1 + 0.28 * (1 - Math.exp(-t / 0.06))) *
          (1 + 0.07 * Math.exp(-t / 0.25) * Math.sin(2 * Math.PI * 11 * t)),
        amp: 0.5,
        att: 0.006,
        tau: 0.2,
        harm: [0.35, 0.12],
      });
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 500,
        amp: 0.3,
        att: 0.002,
        tau: 0.02,
      });
      return out;
    },
  },
  {
    id: 'splat-bloom',
    vars: 4,
    render(sr, rand) {
      const out = sfxMono(sr, 1.1);
      grains(out, sr, rand, 0.02, 0.5, 45, {
        fLo: 2500,
        fHi: 7500,
        q: 1.2,
        gLo: 0.003,
        gHi: 0.012,
        amp: 0.4,
        shape: (x) => Math.sin(Math.PI * x) ** 0.7,
      });
      noise(out, sr, rand, 0.02, {
        mode: 'bp',
        f0: 3000,
        q: 0.8,
        amp: 0.1,
        att: 0.08,
        tau: 0.15,
      });
      for (const at of [0.06, 0.16, 0.27]) {
        const f0 = range(rand, 380, 560);
        tone(out, sr, at + range(rand, -0.02, 0.02), {
          f0,
          f1: f0 * 2.2,
          glide: 0.03,
          amp: 0.18,
          att: 0.004,
          tau: 0.045,
          harm: [0.2],
        });
      }
      return out;
    },
  },
  {
    id: 'splash-paint',
    vars: 4,
    render(sr, rand) {
      const out = sfxMono(sr, 0.9);
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 1600,
        amp: 0.4,
        att: 0.001,
        tau: 0.02,
      });
      waterSplash(out, sr, rand, 0, 0.7);
      return out;
    },
  },
  {
    id: 'ink-empty',
    vars: 3,
    render(sr, rand) {
      const out = sfxMono(sr, 0.3);
      grains(out, sr, rand, 0.01, 0.12, 26, {
        fLo: 2500,
        fHi: 6500,
        q: 0.9,
        gLo: 0.002,
        gHi: 0.008,
        amp: 0.4,
        shape: (x) => 1 - x * 0.6,
      });
      modal(
        out,
        sr,
        rand,
        0,
        [
          [2300, 0.4, 0.01],
          [3700, 0.2, 0.008],
        ],
        {
          amp: 0.6,
        },
      );
      modal(
        out,
        sr,
        rand,
        0.09,
        [
          [2100, 0.3, 0.008],
          [3400, 0.15, 0.006],
        ],
        {
          amp: 0.35,
        },
      );
      noise(out, sr, rand, 0.005, {
        mode: 'lp',
        f0: 1200,
        amp: 0.1,
        att: 0.005,
        tau: 0.03,
      });
      return out;
    },
  },
];
const ELEMENT_RECIPES = [
  {
    id: 'fire-whoomp',
    vars: 4,
    render(sr, rand) {
      const out = sfxMono(sr, 1.6);
      const peak = range(rand, 1200, 1800);
      noise(out, sr, rand, 0, {
        mode: 'lp',
        q: 0.9,
        f0: 150,
        color: 'pink',
        fc: (t) => (t < 0.12 ? 150 * (peak / 150) ** (t / 0.12) : peak * (300 / peak) ** Math.min(1, (t - 0.12) / 0.8)),
        amp: 1.2,
        att: 0.07,
        tau: 0.3,
        dur: 1.5,
      });
      tone(out, sr, 0, {
        f0: 62,
        f1: 42,
        glide: 0.1,
        amp: 0.35,
        att: 0.03,
        tau: 0.15,
      });
      noise(out, sr, rand, 0.02, {
        mode: 'bp',
        f0: 800,
        q: 0.5,
        amp: 0.2,
        att: 0.1,
        tau: 0.35,
      });
      crackle(out, sr, rand, 0.15, 1.2, 40, {
        fLo: 1500,
        fHi: 6000,
        amp: 0.3,
        pow: 2.5,
        shape: (x) => 1 - x,
      });
      return out;
    },
  },
  {
    id: 'fire-out',
    vars: 3,
    render(sr, rand) {
      const out = sfxMono(sr, 0.9);
      noise(out, sr, rand, 0, {
        mode: 'hp',
        f0: 2500,
        amp: 0.5,
        att: 0.01,
        tau: 0.2,
      });
      noise(out, sr, rand, 0, {
        mode: 'bp',
        f0: 5500,
        f1: 3500,
        q: 0.7,
        amp: 0.25,
        att: 0.02,
        tau: 0.25,
      });
      crackle(out, sr, rand, 0, 0.5, 60, {
        fLo: 3000,
        fHi: 8000,
        amp: 0.2,
        pow: 2,
        shape: (x) => 1 - x,
      });
      return out;
    },
  },
  {
    id: 'bramble-burn',
    vars: 2,
    render(sr, rand) {
      const out = sfxMono(sr, 3);
      noise(out, sr, rand, 0, {
        mode: 'lp',
        q: 0.8,
        f0: 200,
        color: 'pink',
        fc: (t) => (t < 0.25 ? 200 * 12 ** (t / 0.25) : 2400 * 0.25 ** Math.min(1, (t - 0.25) / 2)),
        amp: 1,
        att: 0.15,
        tau: 0.8,
        dur: 2.9,
      });
      crackle(out, sr, rand, 0.08, 2.6, 75, {
        fLo: 1200,
        fHi: 7000,
        amp: 0.5,
        pow: 2.5,
        shape: (x) => (1 - x) ** 1.2,
      });
      for (let i = 0; i < 10; i++) twigSnap(out, sr, rand, range(rand, 0.15, 2.3), range(rand, 0.15, 0.4));
      noise(out, sr, rand, 0.2, {
        mode: 'lp',
        f0: 380,
        amp: 0.4,
        att: 0.3,
        tau: 0.9,
        color: 'brown',
      });
      return out;
    },
  },
  {
    id: 'ice-freeze',
    vars: 3,
    render(sr, rand) {
      const out = sfxMono(sr, 1.7);
      crackle(out, sr, rand, 0, 0.85, 230, {
        fLo: 1800,
        fHi: 7500,
        amp: 0.5,
        pow: 2,
        shape: (x) => (x < 0.3 ? x / 0.3 : (1 - x) ** 1.5),
      });
      for (let i = 0; i < 4; i++)
        modal(
          out,
          sr,
          rand,
          range(rand, 0.05, 0.5),
          [
            [range(rand, 1800, 2600), 0.4, 0.03],
            [range(rand, 3500, 4500), 0.25, 0.02],
          ],
          {
            amp: 0.5,
            noise: 0.4,
            noiseLp: 9000,
            noiseTau: 0.002,
          },
        );
      creak(out, sr, rand, 0.15, 0.4, {
        rate0: 70,
        rate1: 115,
        f1: 500,
        f2: 1400,
        amp: 0.25,
      });
      for (let i = 0; i < 8; i++)
        tone(out, sr, range(rand, 0.3, 1.2), {
          f0: range(rand, 4000, 8000),
          amp: 0.04,
          att: 0.001,
          tau: 0.2,
        });
      noise(out, sr, rand, 0.2, {
        mode: 'bp',
        f0: 8000,
        q: 3,
        amp: 0.05,
        att: 0.2,
        tau: 0.5,
      });
      return out;
    },
  },
  {
    id: 'ice-melt',
    vars: 3,
    render(sr, rand) {
      const out = sfxMono(sr, 2.1);
      const drips = 5 + Math.floor(rand() * 3);
      for (let i = 0; i < drips; i++)
        droplet(out, sr, range(rand, 0.05, 1.7), range(rand, 900, 2000), range(rand, 0.2, 0.4));
      grains(out, sr, rand, 0.1, 1.3, 40, {
        fLo: 1500,
        fHi: 4000,
        q: 4,
        gLo: 0.005,
        gHi: 0.02,
        amp: 0.1,
      });
      modal(
        out,
        sr,
        rand,
        0,
        [
          [2100, 0.2, 0.02],
          [3300, 0.12, 0.015],
        ],
        {
          amp: 0.3,
          noise: 0.2,
          noiseLp: 7000,
        },
      );
      return out;
    },
  },
  {
    id: 'steam',
    vars: 3,
    render(sr, rand) {
      const out = sfxMono(sr, 1.6);
      const flutter = smoothNoise(rand, 28);
      const f0 = range(rand, 4800, 5600);
      noise(out, sr, rand, 0, {
        mode: 'bp',
        q: 0.6,
        f0,
        fc: (t) => f0 * 0.6 ** (t / 1.4),
        amp: 0.6,
        env: (t) => attackDecay(t, 0.03, 0.45) * (0.85 + 0.15 * flutter(t)),
        dur: 1.55,
      });
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 600,
        amp: 0.15,
        att: 0.02,
        tau: 0.15,
      });
      return out;
    },
  },
];
const IMPACT_RECIPES = [
  {
    id: 'impact-crate',
    vars: 4,
    render(sr, rand) {
      const out = sfxMono(sr, 0.5);
      const scale = range(rand, 0.9, 1.1);
      const modes = [
        [210 * scale, 0.6, 0.1],
        [470 * scale, 0.45, 0.07],
        [730 * scale, 0.3, 0.05],
        [1120 * scale, 0.2, 0.03],
        [1900 * scale, 0.1, 0.015],
      ];
      modal(out, sr, rand, 0, modes, {
        amp: 0.8,
        noise: 0.4,
        noiseLp: 2500,
      });
      modal(
        out,
        sr,
        rand,
        range(rand, 0.025, 0.04),
        modes.map(([freq, amp, tau]) => [freq * 1.07, amp * 0.6, tau * 0.7]),
        {
          amp: 0.35,
          noise: 0.15,
        },
      );
      tone(out, sr, 0, {
        f0: 110,
        f1: 70,
        glide: 0.03,
        amp: 0.3,
        att: 0.002,
        tau: 0.04,
      });
      return out;
    },
  },
  {
    id: 'impact-barrel',
    vars: 4,
    render(sr, rand) {
      const out = sfxMono(sr, 0.8);
      const scale = range(rand, 0.9, 1.1);
      modal(
        out,
        sr,
        rand,
        0,
        [
          [120 * scale, 0.6, 0.25],
          [262 * scale, 0.45, 0.2],
          [415 * scale, 0.3, 0.12],
          [690 * scale, 0.15, 0.06],
        ],
        {
          amp: 0.8,
          noise: 0.35,
          noiseLp: 1800,
        },
      );
      tone(out, sr, 0, {
        f0: 80,
        f1: 55,
        glide: 0.04,
        amp: 0.4,
        att: 0.003,
        tau: 0.08,
      });
      return out;
    },
  },
  {
    id: 'impact-boulder',
    vars: 4,
    render(sr, rand) {
      const out = sfxMono(sr, 0.8);
      tone(out, sr, 0, {
        f0: 64,
        f1: 38,
        glide: 0.05,
        amp: 0.8,
        att: 0.002,
        tau: 0.12,
      });
      noise(out, sr, rand, 0, {
        mode: 'lp',
        f0: 500,
        amp: 0.5,
        att: 0.001,
        tau: 0.04,
      });
      crackle(out, sr, rand, 0.003, 0.22, 300, {
        fLo: 800,
        fHi: 3200,
        amp: 0.4,
        pow: 2,
        shape: (x) => (1 - x) ** 1.5,
        len: 0.004,
      });
      modal(
        out,
        sr,
        rand,
        0,
        [
          [range(rand, 650, 780), 0.3, 0.03],
          [range(rand, 1250, 1400), 0.2, 0.02],
          [range(rand, 2000, 2300), 0.1, 0.012],
        ],
        {
          amp: 0.5,
        },
      );
      return out;
    },
  },
  {
    id: 'impact-ball',
    vars: 4,
    render(sr, rand) {
      const out = sfxMono(sr, 0.45);
      tone(out, sr, 0, {
        f0: 150,
        f1: 90,
        glide: 0.025,
        amp: 0.6,
        att: 0.0015,
        tau: 0.05,
      });
      tone(out, sr, 0, {
        f0: range(rand, 420, 500),
        amp: 0.2,
        att: 0.001,
        tau: 0.08,
      });
      noise(out, sr, rand, 0, {
        mode: 'bp',
        f0: 1800,
        q: 1,
        amp: 0.3,
        att: 0.0005,
        tau: 0.006,
      });
      return out;
    },
  },
];
const UI_RECIPES = [
  {
    id: 'ui-click',
    vars: 3,
    render(sr, rand) {
      const out = sfxMono(sr, 0.2);
      modal(
        out,
        sr,
        rand,
        0,
        [
          [range(rand, 1700, 1900), 0.5, 0.015],
          [range(rand, 3100, 3400), 0.25, 0.01],
        ],
        {
          amp: 0.5,
          noise: 0.2,
          noiseLp: 6000,
          noiseTau: 0.002,
        },
      );
      tone(out, sr, 0.002, {
        f0: 1318.5,
        amp: 0.2,
        att: 0.001,
        tau: 0.04,
        harm: [0.1],
      });
      return out;
    },
  },
  {
    id: 'ui-hover',
    vars: 2,
    render(sr, rand, variation) {
      const out = sfxMono(sr, 0.12);
      tone(out, sr, 0, {
        f0: variation ? 2349.3 : 2637,
        amp: 0.25,
        att: 0.0015,
        tau: 0.018,
      });
      noise(out, sr, rand, 0, {
        mode: 'hp',
        f0: 6000,
        amp: 0.08,
        att: 0.0005,
        tau: 0.002,
      });
      return out;
    },
  },
  {
    id: 'wheel-open',
    render(sr, rand) {
      const out = sfxMono(sr, 1);
      noise(out, sr, rand, 0, {
        mode: 'bp',
        f0: 500,
        f1: 2600,
        sweep: 0.2,
        q: 0.9,
        amp: 0.4,
        att: 0.12,
        tau: 0.1,
      });
      const chime1 = celestaNote(sr, 81, rand);
      const chime2 = celestaNote(sr, 86, rand);
      for (let i = 0; i < chime1.length && i < out.length; i++) out[i] += chime1[i] * 0.12;
      const delay = Math.round(0.07 * sr);
      for (let i = 0; i < chime2.length && i + delay < out.length; i++) out[i + delay] += chime2[i] * 0.1;
      return out;
    },
  },
  {
    id: 'wheel-close',
    render(sr, rand) {
      const out = sfxMono(sr, 0.4);
      noise(out, sr, rand, 0, {
        mode: 'bp',
        f0: 2000,
        f1: 600,
        sweep: 0.15,
        q: 0.9,
        amp: 0.4,
        att: 0.05,
        tau: 0.07,
      });
      return out;
    },
  },
  ...Object.entries({
    red: 74,
    blue: 78,
    yellow: 81,
    green: 83,
  }).map(([color, midi]) => ({
    id: `color-${color}`,
    render(sr, rand) {
      const out = sfxMono(sr, 1.2);
      const chime = celestaNote(sr, midi, rand);
      for (let i = 0; i < chime.length && i < out.length; i++) out[i] += chime[i] * 0.5;
      if (color === 'red')
        crackle(out, sr, rand, 0.01, 0.25, 50, {
          fLo: 3000,
          fHi: 8000,
          amp: 0.15,
          shape: (x) => 1 - x,
        });
      if (color === 'blue')
        tone(out, sr, 0.02, {
          f0: 4186 * pick(rand, [1, 1.12]),
          amp: 0.05,
          att: 0.001,
          tau: 0.25,
        });
      if (color === 'yellow')
        tone(out, sr, 0, {
          f0: 300,
          f1: 520,
          glide: 0.04,
          amp: 0.1,
          att: 0.004,
          tau: 0.08,
        });
      if (color === 'green')
        grains(out, sr, rand, 0, 0.2, 14, {
          fLo: 3000,
          fHi: 7000,
          gLo: 0.003,
          gHi: 0.01,
          amp: 0.15,
        });
      return out;
    },
  })),
];
export const SFX_RECIPES = [
  ...STEP_RECIPES,
  ...MOVEMENT_RECIPES,
  ...PAINT_RECIPES,
  ...ELEMENT_RECIPES,
  ...IMPACT_RECIPES,
  ...UI_RECIPES,
];
