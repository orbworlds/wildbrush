/**
 * Ambience sound recipes: seamless loops for wind, rushing water, fluttering, rustling grass, surf, lapping water, crickets, fire and sliding, plus wildlife calls (bird chirps, whistles, trills and warbles, a dove, an owl and frogs).
 */
import {
  attackDecay,
  BrownNoise,
  bubble,
  crackle,
  grains,
  hann,
  makeBuffer,
  modal,
  noise,
  OnePole,
  pick,
  PinkNoise,
  range,
  renderStereo,
  smooth,
  smoothNoise,
  SVF,
  TAU,
  tone,
} from './dsp.js';
const AMBIENT_LOOPS = [
  {
    id: 'amb-wind',
    sr: 16000,
    loop: 2,
    render(sr, rand) {
      const seed = rand() * 1000000;
      return renderStereo(sr, rand, 12, (buf, ch) => {
        const gust = smoothNoise(seededRandom(seed), 0.22);
        const drift = smoothNoise(rand, 0.15);
        const pink = new PinkNoise(rand);
        const brown = new BrownNoise(rand);
        const band = new SVF(sr, 400, 0.7);
        const howl = new SVF(sr, 1100, 7);
        const rumble = new OnePole(sr, 160);
        const offset = ch ? 0.35 : 0;
        for (let i = 0; i < buf.length; i++) {
          const t2 = i / sr;
          const level = 0.55 + 0.45 * gust(t2 + offset);
          if (!(i & 31)) {
            band.set(380 + 260 * drift(t2) + 200 * level, 0.7);
            howl.set(1000 + 250 * drift(t2 * 0.7 + 3), 7);
          }
          const x = pink.next();
          band.tick(x);
          howl.tick(x);
          buf[i] =
            band.bpn * 0.9 * level +
            rumble.lp(brown.next()) * 0.8 * (0.6 + 0.4 * level) +
            howl.bpn * 0.12 * level * level;
        }
      });
    },
  },
  {
    id: 'amb-rush',
    sr: 24000,
    loop: 1,
    render(sr, rand) {
      return renderStereo(sr, rand, 5, (buf) => {
        const flutter = smoothNoise(rand, 11);
        const hpf = new OnePole(sr, 300);
        const lpf = new SVF(sr, 6000, 0.6);
        for (let i = 0; i < buf.length; i++) {
          const t = i / sr;
          const x = hpf.hp(rand() * 2 - 1);
          lpf.tick(x);
          buf[i] = lpf.lp * (0.85 + 0.15 * flutter(t));
        }
      });
    },
  },
  {
    id: 'amb-flutter',
    sr: 16000,
    loop: 0.5,
    render(sr, rand) {
      return renderStereo(sr, rand, 4, (buf) => {
        const flap = new SVF(sr, 700, 0.8);
        const low = new SVF(sr, 280, 0.7);
        const drift = smoothNoise(rand, 3);
        let nextFlap = 0;
        let lastFlap = -1;
        for (let i = 0; i < buf.length; i++) {
          const t = i / sr;
          if (i >= nextFlap) {
            lastFlap = t;
            nextFlap = i + Math.round(sr / range(rand, 11, 17));
          }
          const env = attackDecay(t - lastFlap, 0.004, 0.025);
          const x = rand() * 2 - 1;
          flap.tick(x);
          low.tick(x);
          buf[i] = flap.bpn * env * 0.8 + low.lp * 1.5 * (0.6 + 0.4 * drift(t));
        }
      });
    },
  },
  {
    id: 'amb-grass',
    sr: 24000,
    loop: 2,
    render(sr, rand) {
      const seed = rand() * 1000000;
      return renderStereo(sr, rand, 10, (buf, ch, rand) => {
        const gust = smoothNoise(seededRandom(seed), 0.3);
        const sway = (u) => (0.5 + 0.5 * gust(u * 10 + (ch ? 0.4 : 0))) ** 1.5;
        grains(buf, sr, rand, 0, 10, 750, {
          fLo: 2500,
          fHi: 9000,
          q: 1.5,
          gLo: 0.003,
          gHi: 0.015,
          amp: 0.35,
          shape: sway,
        });
        const hiss = new SVF(sr, 3500, 0.5);
        for (let i = 0; i < buf.length; i++) {
          hiss.tick(rand() * 2 - 1);
          buf[i] += hiss.bpn * 0.08 * sway(i / buf.length);
        }
      });
    },
  },
  {
    id: 'amb-surf',
    sr: 22050,
    loop: 3,
    render(sr, rand) {
      return renderStereo(sr, rand, 19, (buf, ch, rand) => {
        const brown = new BrownNoise(rand);
        const lpf = new OnePole(sr, 260);
        for (let i = 0; i < buf.length; i++) buf[i] += lpf.lp(brown.next()) * 0.35;
        let at = ch ? range(rand, 1.5, 2.8) : range(rand, 0, 1);
        for (; at < 18;) {
          surfWave(buf, sr, rand, at, range(rand, 0.7, 1.1));
          at += range(rand, 4.2, 6.2);
        }
      });
    },
  },
  {
    id: 'amb-lap',
    sr: 22050,
    loop: 2,
    render(sr, rand) {
      return renderStereo(sr, rand, 10, (buf, ch, rand) => {
        noise(buf, sr, rand, 0, {
          mode: 'lp',
          f0: 400,
          amp: 0.1,
          env: () => 1,
          dur: 10,
          color: 'pink',
        });
        let at = range(rand, 0, 0.6);
        for (; at < 10;) {
          const size = range(rand, 0.25, 0.5);
          noise(buf, sr, rand, at, {
            mode: 'bp',
            f0: range(rand, 500, 1100),
            q: 1.5,
            amp: size,
            att: 0.03,
            tau: 0.09,
          });
          noise(buf, sr, rand, at + 0.02, {
            mode: 'bp',
            f0: 400,
            f1: 900,
            sweep: 0.12,
            q: 5,
            amp: size * 0.25,
            att: 0.02,
            tau: 0.05,
          });
          for (let j = 0; j < 3; j++)
            bubble(buf, sr, at + range(rand, 0.03, 0.25), range(rand, 350, 900), size * 0.25, 0.03);
          at += range(rand, 0.5, 1.4);
        }
      });
    },
  },
  {
    id: 'amb-crickets',
    sr: 24000,
    loop: 1,
    render(sr, rand) {
      const left = makeBuffer(sr, 7);
      const right = makeBuffer(sr, 7);
      for (let i = 0; i < 6; i++) {
        const freq = range(rand, 4200, 5400);
        const pan = range(rand, -0.9, 0.9);
        const gainL = Math.cos(((pan + 1) * Math.PI) / 4);
        const gainR = Math.sin(((pan + 1) * Math.PI) / 4);
        const amp = range(rand, 0.2, 0.5);
        const period = range(rand, 0.45, 0.95);
        const pulses = Math.floor(range(rand, 2, 4.99));
        const pulseRate = range(rand, 24, 34);
        let at = range(rand, 0, period);
        for (; at < 6.7;) {
          for (let k = 0; k < pulses; k++) {
            const pulseAt = at + k / pulseRate;
            const start = Math.round(pulseAt * sr);
            const len = Math.round(0.022 * sr);
            let phase = rand() * TAU;
            for (let l = 0; l < len && start + l < left.length; l++) {
              phase += (TAU * freq) / sr;
              const env = attackDecay(l / sr, 0.004, 0.006) * amp;
              const x = Math.sin(phase) * env;
              left[start + l] += x * gainL;
              right[start + l] += x * gainR;
            }
          }
          at += period * range(rand, 0.9, 1.12);
        }
      }
      for (const [buf, rateOffset] of [
        [left, 1],
        [right, 2],
      ]) {
        const hiss = new SVF(sr, 4800, 6);
        for (let i = 0; i < buf.length; i++) {
          hiss.tick(rand() * 2 - 1);
          buf[i] += hiss.bpn * 0.05 * (0.6 + 0.4 * Math.sin(TAU * (29 + rateOffset) * (i / sr)));
        }
      }
      return [left, right];
    },
  },
  {
    id: 'fire-loop',
    sr: 24000,
    loop: 1,
    render(sr, rand) {
      return renderStereo(sr, rand, 7, (buf, ch, rand) => {
        const flicker = smoothNoise(rand, 5);
        const drift = smoothNoise(rand, 0.7);
        const brown = new BrownNoise(rand);
        const roar = new SVF(sr, 350, 0.7);
        const flame = new SVF(sr, 900, 0.9);
        const hiss = new OnePole(sr, 5000);
        for (let i = 0; i < buf.length; i++) {
          const t = i / sr;
          const level = 0.6 + 0.4 * flicker(t);
          const x = rand() * 2 - 1;
          roar.tick(brown.next());
          if (!(i & 63)) flame.set(700 + 500 * drift(t), 0.9);
          flame.tick(x);
          buf[i] = roar.lp * 0.9 * (0.7 + 0.3 * drift(t)) + flame.bpn * 0.15 * level + hiss.hp(x) * 0.03 * level;
        }
        crackle(buf, sr, rand, 0, 7, 14, {
          fLo: 1200,
          fHi: 7000,
          amp: 0.55,
          pow: 3,
        });
        const pops = 5 + Math.floor(rand() * 3);
        for (let i = 0; i < pops; i++)
          modal(
            buf,
            sr,
            rand,
            range(rand, 0.2, 6.7),
            [
              [range(rand, 500, 900), 0.5, 0.02],
              [range(rand, 1400, 2200), 0.3, 0.012],
            ],
            {
              amp: range(rand, 0.15, 0.35),
              noise: 0.2,
              noiseLp: 6000,
            },
          );
      });
    },
  },
  {
    id: 'amb-slide',
    sr: 24000,
    loop: 0.5,
    render(sr, rand) {
      return renderStereo(sr, rand, 4, (buf, ch, rand) => {
        const flutter = smoothNoise(rand, 9);
        noise(buf, sr, rand, 0, {
          mode: 'bp',
          f0: 1800,
          q: 0.6,
          amp: 0.4,
          env: (t) => 0.8 + 0.2 * flutter(t),
          dur: 4.6,
        });
        grains(buf, sr, rand, 0, 4.5, 350, {
          fLo: 1500,
          fHi: 6000,
          q: 1.5,
          gLo: 0.002,
          gHi: 0.006,
          amp: 0.25,
        });
      });
    },
  },
];
function seededRandom(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 1831565813) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function surfWave(buf, sr, rand, t0, size) {
  const rise = range(rand, 2, 2.8);
  noise(buf, sr, rand, t0, {
    mode: 'lp',
    f0: 150,
    fc: (t) => 150 + 650 * smooth(t / rise),
    q: 0.7,
    color: 'brown',
    amp: 0.55 * size,
    env: (t) => smooth(t / rise) * Math.exp(-Math.max(0, t - rise) / 1.2),
    dur: rise + 5,
  });
  const crash = t0 + rise;
  noise(buf, sr, rand, crash - 0.3, {
    mode: 'bp',
    f0: 1500,
    f1: 2600,
    sweep: 0.8,
    q: 0.5,
    color: 'pink',
    amp: 0.7 * size,
    att: 0.4,
    tau: 1.1,
    dur: 5,
  });
  noise(buf, sr, rand, crash - 0.1, {
    mode: 'hp',
    f0: 3500,
    amp: 0.18 * size,
    att: 0.5,
    tau: 1.8,
    dur: 6,
  });
  grains(buf, sr, rand, crash + 0.3, 4, 500, {
    fLo: 2000,
    fHi: 7000,
    q: 1.2,
    gLo: 0.002,
    gHi: 0.008,
    amp: 0.2 * size,
    shape: (u) => (1 - u) ** 1.3,
  });
  crackle(buf, sr, rand, crash + 1.2, 3, 25, {
    fLo: 1500,
    fHi: 4000,
    amp: 0.12 * size,
    pow: 2,
    shape: (u) => 1 - u,
  });
}
function chirp(buf, sr, t0, freq, sweep, dur, amp) {
  const i0 = Math.round(t0 * sr);
  const len = Math.round(dur * sr);
  let phase = 0;
  for (let i = 0; i < len && i0 + i < buf.length; i++) {
    const u2 = i / len;
    const f = freq * (1 + sweep * u2) * (1 + 0.02 * Math.sin(TAU * 60 * (i / sr)));
    phase += (TAU * f) / sr;
    const env = Math.sin(Math.PI * u2) ** 0.8 * amp;
    buf[i0 + i] += (Math.sin(phase) + 0.1 * Math.sin(2 * phase)) * env;
  }
}
function whistle(buf, sr, t0, contour, dur, amp, vibRate = 0, vibDepth = 0) {
  const i0 = Math.round(t0 * sr);
  const len = Math.round(dur * sr);
  let phase = 0;
  let seg = 0;
  for (let i = 0; i < len && i0 + i < buf.length; i++) {
    const t = i / sr;
    for (; seg < contour.length - 2 && t > contour[seg + 1][0];) seg++;
    const [ta, fa] = contour[seg];
    const [tb, fb] = contour[Math.min(seg + 1, contour.length - 1)];
    const w = tb > ta ? smooth((t - ta) / (tb - ta)) : 0;
    let f = fa + (fb - fa) * w;
    if (vibDepth) f *= 1 + vibDepth * Math.sin(TAU * vibRate * t);
    phase += (TAU * f) / sr;
    const env = Math.min(1, t / 0.012, (dur - t) / 0.03) * amp;
    buf[i0 + i] += (Math.sin(phase) + 0.06 * Math.sin(2 * phase)) * Math.max(0, env);
  }
}
const WILDLIFE_SOUNDS = [
  {
    id: 'bird-chirp',
    vars: 5,
    render(sr, rand) {
      const buf = makeBuffer(sr, 1);
      const count = Math.floor(range(rand, 2, 5.99));
      const freq = range(rand, 2800, 4600);
      const sweep = pick(rand, [-0.45, 0.4, -0.3]);
      let at = 0.01;
      for (let i = 0; i < count; i++) {
        chirp(buf, sr, at, freq * range(rand, 0.93, 1.07), sweep, range(rand, 0.04, 0.07), range(rand, 0.5, 0.9));
        at += range(rand, 0.08, 0.14);
      }
      return buf;
    },
  },
  {
    id: 'bird-whistle',
    vars: 4,
    render(sr, rand, variant) {
      const buf = makeBuffer(sr, 1.2);
      const freq = range(rand, 2600, 3400);
      if (variant % 2 == 0) {
        whistle(
          buf,
          sr,
          0.01,
          [
            [0, freq],
            [0.05, freq * 1.04],
            [0.22, freq * 1.02],
          ],
          0.24,
          0.7,
        );
        whistle(
          buf,
          sr,
          0.3,
          [
            [0, freq * 0.82],
            [0.2, freq * 0.8],
            [0.26, freq * 0.74],
          ],
          0.28,
          0.6,
        );
      } else {
        whistle(
          buf,
          sr,
          0.01,
          [
            [0, freq * 0.9],
            [0.12, freq],
          ],
          0.14,
          0.6,
        );
        whistle(
          buf,
          sr,
          0.2,
          [
            [0, freq * 1.12],
            [0.1, freq * 1.1],
          ],
          0.12,
          0.55,
        );
        whistle(
          buf,
          sr,
          0.38,
          [
            [0, freq * 0.95],
            [0.3, freq * 0.78],
          ],
          0.34,
          0.6,
          18,
          0.01,
        );
      }
      return buf;
    },
  },
  {
    id: 'bird-trill',
    vars: 3,
    render(sr, rand) {
      const buf = makeBuffer(sr, 1.2);
      const freq = range(rand, 3300, 4200);
      const rate = range(rand, 20, 28);
      const dur = range(rand, 0.7, 1);
      const len = Math.round(dur * sr);
      let phase = 0;
      for (let i = 0; i < len; i++) {
        const t2 = i / sr;
        const f = freq * (1 - (t2 / dur) * 0.18);
        phase += (TAU * f) / sr;
        const pulse = Math.max(0, Math.sin(Math.PI * ((t2 * rate) % 1))) ** 2;
        const env = Math.sin(Math.PI * Math.min(1, t2 / dur)) ** 0.6;
        buf[i + 400] += Math.sin(phase) * pulse * env * 0.7;
      }
      return buf;
    },
  },
  {
    id: 'bird-warble',
    vars: 4,
    render(sr, rand) {
      const dur = range(rand, 1, 1.5);
      const buf = makeBuffer(sr, dur + 0.1);
      const contour = [];
      let at = 0;
      for (; at < dur;) {
        contour.push([at, range(rand, 2000, 4500)]);
        at += range(rand, 0.05, 0.11);
      }
      const flutter = smoothNoise(rand, 12);
      const len = Math.round(dur * sr);
      let phase = 0;
      let seg = 0;
      for (let i = 0; i < len; i++) {
        const t2 = i / sr;
        for (; seg < contour.length - 2 && t2 > contour[seg + 1][0];) seg++;
        const [ta, fa] = contour[seg];
        const [tb, fb] = contour[Math.min(seg + 1, contour.length - 1)];
        const f = fa + (fb - fa) * smooth((t2 - ta) / Math.max(0.001, tb - ta));
        phase += (TAU * f * (1 + 0.015 * Math.sin(TAU * 32 * t2))) / sr;
        const amp = smooth((flutter(t2) + 0.3) * 3);
        buf[i] += Math.sin(phase) * amp * Math.min(1, t2 / 0.02, (dur - t2) / 0.05) * 0.6;
      }
      return buf;
    },
  },
  {
    id: 'bird-dove',
    vars: 2,
    render(sr, rand) {
      const buf = makeBuffer(sr, 2.2);
      const freq = range(rand, 420, 520);
      for (const [at, dur, pitch, level] of [
        [0, 0.22, 1, 0.7],
        [0.32, 0.5, 1.07, 1],
        [0.95, 0.25, 0.97, 0.7],
        [1.3, 0.3, 0.95, 0.6],
      ]) {
        tone(buf, sr, at, {
          f0: freq * pitch * 0.96,
          f1: freq * pitch,
          glide: 0.05,
          amp: 0.5 * level,
          env: (t) => hann(t / dur) ** 0.7,
          dur,
          harm: [0.18, 0.05],
        });
        noise(buf, sr, rand, at, {
          mode: 'lp',
          f0: 900,
          amp: 0.03 * level,
          env: (t) => hann(t / dur),
          dur,
        });
      }
      return buf;
    },
  },
  {
    id: 'owl',
    vars: 2,
    render(sr, rand, variant) {
      const buf = makeBuffer(sr, 2.2);
      const freq = range(rand, 340, 400);
      const hoots = variant
        ? [
            [0, 0.4],
            [0.75, 0.18],
            [1, 0.45],
          ]
        : [
            [0, 0.5],
            [0.8, 0.5],
          ];
      for (const [at, dur] of hoots) {
        tone(buf, sr, at, {
          f0: freq * 1.03,
          f1: freq * 0.96,
          glide: dur,
          amp: 0.5,
          env: (t) => hann(t / dur) ** 0.6,
          dur,
          harm: [0.08],
        });
        noise(buf, sr, rand, at, {
          mode: 'bp',
          f0: freq * 2,
          q: 2,
          amp: 0.05,
          env: (t) => hann(t / dur),
          dur,
        });
      }
      return buf;
    },
  },
  {
    id: 'frog',
    vars: 4,
    render(sr, rand) {
      const buf = makeBuffer(sr, 1);
      const count = Math.floor(range(rand, 1, 2.99));
      let at = 0.01;
      for (let i = 0; i < count; i++) {
        const dur = range(rand, 0.18, 0.32);
        const rate = range(rand, 22, 34);
        const freq = range(rand, 380, 520);
        const start = Math.round(at * sr);
        const len = Math.round(dur * sr);
        const formant1 = new SVF(sr, freq, 5);
        const formant2 = new SVF(sr, freq * 2.4, 6);
        const lpf = new OnePole(sr, 900);
        let nextPulse = 0;
        for (let j = 0; j < len && start + j < buf.length; j++) {
          let imp = 0;
          if (j >= nextPulse) {
            imp = 1;
            nextPulse = j + Math.round(sr / rate);
          }
          const x = lpf.lp(imp + (rand() * 2 - 1) * 0.02);
          formant1.tick(x);
          formant2.tick(x);
          buf[start + j] += (formant1.bpn + 0.6 * formant2.bpn) * hann(j / len) ** 0.5;
        }
        at += dur + range(rand, 0.08, 0.2);
      }
      return buf;
    },
  },
];
export const AMBIENCE_SOUNDS = [...AMBIENT_LOOPS, ...WILDLIFE_SOUNDS];
