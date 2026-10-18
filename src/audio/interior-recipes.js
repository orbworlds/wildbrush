/**
 * Sound recipes for the caverns and temples: cave, kiln and cistern ambience loops, the lantern hum and the cave reverb impulse, drips, chimes and kiln pops, the entry, puzzle, lantern, crest and Cloudstep stingers, and the double-jump puff, flame ring, frost crackle and lantern tinkle.
 */
import { choirNote } from './boss-sounds.js';
import { whoosh } from './combat-sounds.js';
import {
  BrownNoise,
  crackle,
  droplet,
  grains,
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
import { bellNote, brassNote, celestaNote, harpNote, padNote } from './instruments.js';
const interiorStereo = (sr, dur) => [makeBuffer(sr, dur), makeBuffer(sr, dur)];
function interiorNote(sr, rng, inst, midi, bellDur) {
  return inst === 'celesta'
    ? celestaNote(sr, midi, rng)
    : inst === 'harp'
      ? harpNote(sr, midi, rng)
      : bellNote(sr, midi, rng, bellDur ?? 3, 0.8);
}
function addInteriorNote(out, sr, rng, at, inst, midi, gain, pan = 0, bellDur) {
  mixPanned(out[0], out[1], interiorNote(sr, rng, inst, midi, bellDur), Math.round(at * sr), gain, pan);
}
function interiorLayer(out, sr, dur, draw, pan = 0, gain = 1) {
  const layer = makeBuffer(sr, dur);
  draw(layer);
  mixPanned(out[0], out[1], layer, 0, gain, pan);
}
function interiorSparkles(out, sr, rng, at, span, count, amp, fLo = 3500, fHi = 8500) {
  const dur = out[0].length / sr;
  for (let i = 0; i < count; i++) {
    const t = at + range(rng, 0, span);
    if (!(t > dur - 0.3))
      interiorLayer(
        out,
        sr,
        Math.min(dur, t + 0.8),
        (buf) =>
          tone(buf, sr, t, {
            f0: range(rng, fLo, fHi),
            amp,
            att: 0.001,
            tau: range(rng, 0.05, 0.22),
          }),
        range(rng, -0.8, 0.8),
      );
  }
}
function interiorReflections(out, sr, wet, lpHz = 3200, size = 1) {
  const taps = [
    [0.043, 0.5, 1],
    [0.071, 0.42, -1],
    [0.113, 0.33, 1],
    [0.171, 0.26, -1],
    [0.241, 0.2, 1],
    [0.337, 0.14, -1],
    [0.46, 0.09, 1],
  ];
  const dry = [out[0].slice(), out[1].slice()];
  for (const [delay, gain, side] of taps) {
    const lag = Math.round(delay * size * sr);
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
function caveImpulse(sr, rng, dur, preDelay, rt60, lpStart, lpEnd, lpTau, taps, hpHz) {
  const out = interiorStereo(sr, dur);
  const tau = rt60 / 6.91;
  for (let ch = 0; ch < 2; ch++) {
    const buf = out[ch];
    for (const [time, gain] of taps) {
      const pos = Math.round((time + range(rng, -0.003, 0.003)) * sr);
      const tapLp = new OnePole(sr, 3800);
      for (let j = 0; j < 24 && pos + j < buf.length; j++)
        buf[pos + j] += tapLp.lp(j < 2 ? (rng() < 0.5 ? -1 : 1) * gain : 0) * 3;
    }
    const damp = new OnePole(sr, lpStart);
    const lowCut = new OnePole(sr, hpHz);
    const start = Math.round(preDelay * sr);
    for (let j = start; j < buf.length; j++) {
      const t = (j - start) / sr;
      if (!(j & 63)) damp.set(lpEnd + (lpStart - lpEnd) * Math.exp(-t / lpTau));
      const decay = Math.exp(-t / tau) * smooth(t / 0.05);
      buf[j] += lowCut.hp(damp.lp(rng() * 2 - 1)) * decay * 0.5;
    }
  }
  return out;
}
const CAVE_IR_RECIPES = [
  {
    id: 'ir-cave',
    norm: 'none',
    keepTail: true,
    render(sr, rng) {
      const taps = [];
      for (let i = 0; i < 16; i++) taps.push([range(rng, 0.02, 0.19), range(rng, 0.06, 0.2)]);
      return caveImpulse(sr, rng, 4.6, 0.028, 3.9, 5200, 650, 0.55, taps, 80);
    },
  },
];
const INTERIOR_AMBIENCE_RECIPES = [
  {
    id: 'amb-cave',
    sr: 22050,
    loop: 3,
    render(sr, rng) {
      const out = interiorStereo(sr, 18);
      const seed = rng() * 1000000;
      for (let ch = 0; ch < 2; ch++) {
        const buf = out[ch];
        const chRng = mulberry32(seed + ch * 13);
        const brown = new BrownNoise(chRng);
        const pink = new PinkNoise(chRng);
        const rumbleLp = new SVF(sr, 90, 0.7);
        const hollowBp = new SVF(sr, 320, 1.4);
        const airBp = new SVF(sr, 900, 0.5);
        const hollowLfo = smoothNoise(chRng, 0.25);
        const airLfo = smoothNoise(chRng, 0.08);
        for (let j = 0; j < buf.length; j++) {
          const t = j / sr;
          if (!(j & 31)) hollowBp.set(260 + 120 * hollowLfo(t), 1.4);
          const brownSample = brown.next();
          rumbleLp.tick(brownSample);
          const pinkSample = pink.next();
          hollowBp.tick(pinkSample);
          airBp.tick(pinkSample);
          buf[j] =
            rumbleLp.lp * 1.1 +
            hollowBp.bpn * 0.2 * (0.6 + 0.4 * hollowLfo(t * 0.7 + 3)) +
            airBp.bpn * 0.05 * Math.max(0, airLfo(t));
          buf[j] +=
            Math.sin(TAU * 55 * t + ch) * 0.05 + Math.sin(TAU * 55.35 * t) * 0.04 + Math.sin(TAU * 110.2 * t) * 0.015;
        }
      }
      for (let i = 0; i < 7; i++) {
        const dripAt = range(rng, 0.4, 16.5);
        const freq = range(rng, 900, 2200);
        interiorLayer(
          out,
          sr,
          18,
          (buf) => {
            droplet(buf, sr, dripAt, freq, 0.05);
            tone(buf, sr, dripAt + 0.004, {
              f0: freq * 1.9,
              amp: 0.012,
              att: 0.001,
              tau: 0.25,
            });
          },
          range(rng, -0.7, 0.7),
        );
      }
      interiorReflections(out, sr, 0.7, 1800, 1.6);
      return out;
    },
  },
  {
    id: 'amb-kiln',
    sr: 22050,
    loop: 2.5,
    render(sr, rng) {
      const out = interiorStereo(sr, 14);
      const seed = rng() * 1000000;
      for (let ch = 0; ch < 2; ch++) {
        const buf = out[ch];
        const chRng = mulberry32(seed + ch * 7);
        const brown = new BrownNoise(chRng);
        const pink = new PinkNoise(chRng);
        const roarLp = new SVF(sr, 160, 0.8);
        const hissBp = new SVF(sr, 2400, 0.6);
        const heatLfo = smoothNoise(chRng, 0.22);
        const flicker = smoothNoise(chRng, 3);
        for (let j = 0; j < buf.length; j++) {
          const t = j / sr;
          const heat = 0.55 + 0.45 * Math.max(-0.4, heatLfo(t));
          if (!(j & 31)) roarLp.set(130 + 90 * heat, 0.8);
          roarLp.tick(brown.next());
          hissBp.tick(pink.next());
          buf[j] = roarLp.lp * 1.3 * heat + hissBp.bpn * 0.05 * heat * (0.7 + 0.3 * flicker(t));
          buf[j] +=
            Math.sin(TAU * 49 * t + ch * 0.5) * 0.045 * (0.8 + 0.2 * Math.sin(TAU * 0.3 * t)) +
            Math.sin(TAU * 98.3 * t) * 0.018;
        }
        crackle(buf, sr, chRng, 0, 14, 26, {
          fLo: 1200,
          fHi: 5500,
          amp: 0.28,
          pow: 2.4,
        });
      }
      interiorReflections(out, sr, 0.45, 2200, 1.3);
      return out;
    },
  },
  {
    id: 'amb-cistern',
    sr: 24000,
    loop: 2.5,
    render(sr, rng) {
      const out = interiorStereo(sr, 14);
      const seed = rng() * 1000000;
      for (let ch = 0; ch < 2; ch++) {
        const buf = out[ch];
        const chRng = mulberry32(seed + ch * 11);
        const pink = new PinkNoise(chRng);
        const trickleBp = new SVF(sr, 1400, 1.6);
        const airBp = new SVF(sr, 3500, 0.5);
        const rippleLfo = smoothNoise(chRng, 1.8);
        const swellLfo = smoothNoise(chRng, 0.3);
        for (let j = 0; j < buf.length; j++) {
          const t = j / sr;
          if (!(j & 15)) trickleBp.set(1000 + 700 * rippleLfo(t), 1.6);
          const pinkSample = pink.next();
          trickleBp.tick(pinkSample);
          airBp.tick(pinkSample);
          buf[j] = trickleBp.bpn * 0.22 * (0.6 + 0.4 * swellLfo(t)) + airBp.bpn * 0.04;
          buf[j] +=
            (Math.sin(TAU * mtof(86) * t + ch) * 0.006 + Math.sin(TAU * mtof(93) * t * 1.001) * 0.004) *
            (0.6 + 0.4 * Math.sin(TAU * 0.11 * t));
        }
        grains(buf, sr, chRng, 0, 14, 260, {
          fLo: 1500,
          fHi: 5200,
          q: 4,
          gLo: 0.004,
          gHi: 0.018,
          amp: 0.12,
        });
        for (let j = 0; j < 40; j++)
          droplet(buf, sr, range(chRng, 0, 13.8), range(chRng, 700, 1900), range(chRng, 0.01, 0.04));
      }
      interiorReflections(out, sr, 0.5, 4200, 1.4);
      return out;
    },
  },
  {
    id: 'amb-lantern',
    sr: 22050,
    loop: 1,
    render(sr, rng) {
      const out = makeBuffer(sr, 5);
      const flicker = smoothNoise(rng, 4);
      for (let i = 0; i < out.length; i++) {
        const t2 = i / sr;
        const level = 0.8 + 0.2 * flicker(t2);
        out[i] =
          (Math.sin(TAU * mtof(57) * t2) * 0.3 +
            Math.sin(TAU * mtof(64) * t2) * 0.18 +
            Math.sin(TAU * mtof(69) * t2 * 1.002) * 0.1) *
          level;
      }
      noise(out, sr, rng, 0, {
        mode: 'bp',
        f0: 1800,
        q: 1.2,
        amp: 0.05,
        env: () => 1,
        dur: 5,
        color: 'pink',
      });
      crackle(out, sr, rng, 0, 5, 5, {
        fLo: 2500,
        fHi: 6000,
        amp: 0.1,
        pow: 3,
      });
      return out;
    },
  },
];
const CISTERN_CHIME_NOTES = [86, 88, 90, 93, 95, 98, 100];
const INTERIOR_SFX_RECIPES = [
  {
    id: 'cave-drip',
    vars: 6,
    sr: 32000,
    render(sr, rng, variant) {
      const out = makeBuffer(sr, 0.6);
      const freq = [1150, 1400, 1700, 980, 2100, 1300][variant % 6] * range(rng, 0.95, 1.05);
      droplet(out, sr, 0.01, freq, 0.6, 1.8, 0.03);
      tone(out, sr, 0.012, {
        f0: freq * 2.02,
        amp: 0.1,
        att: 0.001,
        tau: 0.08,
      });
      grains(out, sr, rng, 0.015, 0.05, 8, {
        fLo: 3000,
        fHi: 8000,
        q: 2,
        gLo: 0.002,
        gHi: 0.005,
        amp: 0.15,
      });
      return out;
    },
  },
  {
    id: 'cistern-chime',
    vars: 5,
    sr: 44100,
    render(sr, rng, variant) {
      const dur = 3.4;
      const out = interiorStereo(sr, dur);
      let noteAt = 0;
      const count = 2 + (variant % 2);
      for (let i = 0; i < count; i++) {
        const midi = CISTERN_CHIME_NOTES[Math.floor(rng() * CISTERN_CHIME_NOTES.length)];
        const pan = range(rng, -0.5, 0.5);
        addInteriorNote(out, sr, rng, noteAt, 'bell', midi, range(rng, 0.12, 0.2), pan, 2.8);
        interiorLayer(
          out,
          sr,
          dur,
          (buf) =>
            modal(
              buf,
              sr,
              rng,
              noteAt,
              [
                [mtof(midi) * 3.1, 0.1, 0.4],
                [mtof(midi) * 5.9, 0.05, 0.2],
              ],
              {
                amp: 0.2,
              },
            ),
          pan,
        );
        noteAt += range(rng, 0.12, 0.4);
      }
      interiorReflections(out, sr, 0.3, 7000);
      return out;
    },
  },
  {
    id: 'kiln-pop',
    vars: 4,
    sr: 32000,
    render(sr, rng) {
      const out = makeBuffer(sr, 0.9);
      noise(out, sr, rng, 0, {
        mode: 'bp',
        f0: 1800,
        q: 1.2,
        amp: 0.5,
        att: 0.0005,
        tau: 0.012,
      });
      crackle(out, sr, rng, 0.01, 0.5, 60, {
        fLo: 1500,
        fHi: 6000,
        amp: 0.35,
        shape: (u) => (1 - u) ** 2,
      });
      noise(out, sr, rng, 0, {
        mode: 'lp',
        f0: 180,
        color: 'brown',
        amp: 0.6,
        att: 0.01,
        tau: 0.12,
      });
      return out;
    },
  },
  {
    id: 'st-cave-enter',
    sr: 44100,
    render(sr, rng) {
      const out = interiorStereo(sr, 6);
      interiorLayer(out, sr, 6, (buf) => whoosh(buf, sr, rng, 0, 1.4, 150, 700, 180, 0.35, 0.8), -0.3);
      interiorLayer(out, sr, 6, (buf) => whoosh(buf, sr, rng, 0.1, 1.3, 200, 900, 220, 0.25, 0.8), 0.3);
      interiorLayer(out, sr, 6, (buf) =>
        noise(buf, sr, rng, 0.2, {
          mode: 'lp',
          f0: 80,
          color: 'brown',
          amp: 0.9,
          env: (t) => smooth(t / 0.6) * Math.exp(-t / 1.4),
          dur: 4,
        }),
      );
      for (const [midi, pan, gain] of [
        [50, -0.3, 0.09],
        [57, 0.3, 0.08],
        [64, -0.1, 0.06],
        [65, 0.25, 0.05],
        [69, -0.35, 0.045],
      ])
        interiorLayer(out, sr, 6, (buf) => padNote(buf, sr, rng, 0.7, midi, 3, gain, 1.2, 1.8, 1100), pan);
      [86, 81, 77, 76, 74].forEach((midi, i) =>
        addInteriorNote(out, sr, rng, 1.2999999999999998 + i * 0.32, 'celesta', midi, 0.16 - i * 0.015, 0.5 - i * 0.25),
      );
      addInteriorNote(out, sr, rng, 1, 'bell', 62, 0.14, 0, 4);
      interiorReflections(out, sr, 0.6, 2400, 1.5);
      return out;
    },
  },
  {
    id: 'st-kiln-enter',
    sr: 44100,
    render(sr, rng) {
      const out = interiorStereo(sr, 5);
      interiorLayer(out, sr, 5, (buf) => {
        tone(buf, sr, 0, {
          f0: 95,
          f1: 48,
          glide: 0.08,
          amp: 0.8,
          att: 0.002,
          tau: 0.35,
          harm: [0.4, 0.2],
        });
        noise(buf, sr, rng, 0, {
          mode: 'lp',
          f0: 400,
          amp: 0.4,
          att: 0.001,
          tau: 0.05,
        });
        tone(buf, sr, 0.45, {
          f0: 90,
          f1: 46,
          glide: 0.08,
          amp: 0.55,
          att: 0.002,
          tau: 0.3,
          harm: [0.4, 0.2],
        });
      });
      interiorLayer(out, sr, 5, (buf) => whoosh(buf, sr, rng, 0.2, 1.2, 300, 1400, 400, 0.45, 0.9), -0.2);
      interiorLayer(
        out,
        sr,
        5,
        (buf) =>
          crackle(buf, sr, rng, 0.4, 2.5, 40, {
            fLo: 1500,
            fHi: 6000,
            amp: 0.25,
            shape: (u) => 1 - u,
          }),
        0.3,
      );
      interiorLayer(
        out,
        sr,
        5,
        (buf) => {
          for (const [midi, delay, hold] of [
            [50, 0, 0.3],
            [57, 0.3, 1.8],
          ])
            brassNote(buf, sr, rng, 0.5 + delay, midi, hold, 0.18, 0.5);
          brassNote(buf, sr, rng, 0.8, 62, 1.8, 0.12, 0.5);
        },
        0.05,
      );
      interiorReflections(out, sr, 0.45, 2600, 1.3);
      return out;
    },
  },
  {
    id: 'st-cistern-enter',
    sr: 44100,
    render(sr, rng) {
      const dur = 5.5;
      const out = interiorStereo(sr, dur);
      interiorLayer(out, sr, dur, (buf) => whoosh(buf, sr, rng, 0, 1.2, 600, 3200, 900, 0.25, 0.9), -0.3);
      const choirAt = 0.4;
      for (const [midi, pan] of [
        [62, -0.3],
        [69, 0.3],
        [76, 0],
        [78, 0.2],
      ])
        interiorLayer(
          out,
          sr,
          dur,
          (buf) =>
            choirNote(buf, sr, rng, choirAt, midi, 2.8, 0.1, {
              att: 0.9,
              rel: 1.4,
              vowel: 'oo',
              voices: 3,
            }),
          pan,
        );
      [98, 95, 93, 90, 88, 86].forEach((midi, i) =>
        addInteriorNote(out, sr, rng, 0.6000000000000001 + i * 0.12, 'bell', midi, 0.14, -0.6 + i * 0.24, 2.5),
      );
      interiorSparkles(out, sr, rng, choirAt, 2.5, 30, 0.025, 5000, 11000);
      interiorReflections(out, sr, 0.5, 5000, 1.4);
      return out;
    },
  },
  {
    id: 'st-puzzle',
    sr: 44100,
    render(sr, rng) {
      const dur = 3.6;
      const out = interiorStereo(sr, dur);
      const arp1 = [81, 86, 90, 93];
      const arp2 = [83, 88, 92, 95];
      arp1.forEach((midi, i) =>
        addInteriorNote(out, sr, rng, i * 0.085, 'celesta', midi, 0.3 + i * 0.03, -0.4 + i * 0.15),
      );
      arp1.forEach((midi, i) =>
        addInteriorNote(out, sr, rng, i * 0.085 + 0.004, 'harp', midi - 12, 0.2, -0.2 + i * 0.1),
      );
      arp2.forEach((midi, i) =>
        addInteriorNote(out, sr, rng, 0.42 + i * 0.085, 'celesta', midi, 0.32 + i * 0.03, -0.1 + i * 0.15),
      );
      arp2.forEach((midi, i) =>
        addInteriorNote(out, sr, rng, 0.42 + i * 0.085 + 0.004, 'harp', midi - 12, 0.2, 0.1 + i * 0.1),
      );
      const chimeAt = 0.86;
      addInteriorNote(out, sr, rng, chimeAt, 'bell', 98, 0.34, 0.1, 2.8);
      addInteriorNote(out, sr, rng, 0.87, 'celesta', 86, 0.3, -0.2);
      for (const [midi, pan] of [
        [62, -0.3],
        [66, 0.3],
        [69, -0.1],
        [76, 0.2],
      ])
        interiorLayer(
          out,
          sr,
          dur,
          (buf) => padNote(buf, sr, rng, 0.8099999999999999, midi, 1.5, 0.05, 0.08, 1.2, 2600),
          pan,
        );
      interiorSparkles(out, sr, rng, chimeAt, 1.6, 22, 0.03);
      interiorReflections(out, sr, 0.35, 5000);
      return out;
    },
  },
  {
    id: 'st-lantern',
    sr: 44100,
    render(sr, rng) {
      const dur = 3.4;
      const out = interiorStereo(sr, dur);
      interiorLayer(
        out,
        sr,
        dur,
        (buf) =>
          modal(
            buf,
            sr,
            rng,
            0,
            [
              [2350, 0.3, 0.5],
              [3720, 0.2, 0.35],
              [5100, 0.12, 0.25],
            ],
            {
              amp: 0.5,
              noise: 0.2,
              noiseLp: 6000,
            },
          ),
        -0.2,
      );
      interiorLayer(
        out,
        sr,
        dur,
        (buf) =>
          modal(
            buf,
            sr,
            rng,
            0.16,
            [
              [2610, 0.25, 0.45],
              [4130, 0.15, 0.3],
            ],
            {
              amp: 0.4,
            },
          ),
        0.25,
      );
      for (const [midi, pan] of [
        [62, -0.3],
        [66, 0.25],
        [69, -0.1],
        [76, 0.3],
      ])
        interiorLayer(out, sr, dur, (buf) => padNote(buf, sr, rng, 0.1, midi, 1.6, 0.06, 0.5, 1.2, 1800), pan);
      [74, 78, 81, 86].forEach((midi, i) =>
        addInteriorNote(out, sr, rng, 0.3 + i * 0.13, 'celesta', midi, 0.22, -0.4 + i * 0.25),
      );
      interiorSparkles(out, sr, rng, 0.2, 1.8, 26, 0.03, 3000, 7000);
      interiorReflections(out, sr, 0.35, 4200);
      return out;
    },
  },
  {
    id: 'st-ember-crest',
    sr: 44100,
    render(sr, rng) {
      const dur = 3.8;
      const out = interiorStereo(sr, dur);
      interiorLayer(out, sr, dur, (buf) => {
        whoosh(buf, sr, rng, 0, 0.7, 200, 1600, 300, 0.55, 0.8);
        noise(buf, sr, rng, 0.1, {
          mode: 'lp',
          f0: 220,
          color: 'brown',
          amp: 0.8,
          env: (t) => smooth(t / 0.08) * Math.exp(-t / 0.6),
          dur: 1.8,
        });
      });
      interiorLayer(
        out,
        sr,
        dur,
        (buf) =>
          crackle(buf, sr, rng, 0.2, 2.8, 50, {
            fLo: 1500,
            fHi: 7000,
            amp: 0.3,
            shape: (u) => (1 - u) ** 1.5,
          }),
        0.3,
      );
      interiorLayer(
        out,
        sr,
        dur,
        (buf) => {
          for (const midi of [50, 57, 62, 66]) brassNote(buf, sr, rng, 0.3, midi, 1.2, 0.1, 0.6);
          brassNote(buf, sr, rng, 0.8, 69, 1.1, 0.12, 0.6);
        },
        0.05,
      );
      addInteriorNote(out, sr, rng, 0.8, 'bell', 81, 0.2, 0.2, 2.5);
      interiorReflections(out, sr, 0.4, 3000);
      return out;
    },
  },
  {
    id: 'st-frost-crest',
    sr: 44100,
    render(sr, rng) {
      const dur = 3.8;
      const out = interiorStereo(sr, dur);
      interiorLayer(out, sr, dur, (buf) => {
        crackle(buf, sr, rng, 0, 0.35, 180, {
          fLo: 3000,
          fHi: 10000,
          amp: 0.4,
          shape: (u) => 1 - u,
        });
        modal(
          buf,
          sr,
          rng,
          0.02,
          [
            [1720, 0.3, 0.3],
            [2930, 0.2, 0.25],
            [4410, 0.15, 0.18],
          ],
          {
            amp: 0.5,
            noise: 0.3,
            noiseLp: 9000,
          },
        );
      });
      [98, 93, 90, 86, 90, 93, 98, 102].forEach((midi, i) =>
        addInteriorNote(out, sr, rng, 0.12 + i * 0.075, 'bell', midi, 0.12 + (i > 3 ? 0.02 : 0), -0.6 + i * 0.17, 2.2),
      );
      for (const [midi, pan] of [
        [62, -0.3],
        [69, 0.3],
        [74, 0],
        [76, 0.2],
      ])
        interiorLayer(
          out,
          sr,
          dur,
          (buf) =>
            choirNote(buf, sr, rng, 0.35, midi, 1.8, 0.09, {
              att: 0.5,
              rel: 1.2,
              vowel: 'oo',
              voices: 3,
            }),
          pan,
        );
      interiorSparkles(out, sr, rng, 0.3, 1.8, 26, 0.028, 5000, 11000);
      interiorReflections(out, sr, 0.4, 6000);
      return out;
    },
  },
  {
    id: 'st-cloudstep',
    sr: 44100,
    render(sr, rng) {
      const dur = 3.4;
      const out = interiorStereo(sr, dur);
      interiorLayer(
        out,
        sr,
        dur,
        (buf) => {
          noise(buf, sr, rng, 0, {
            mode: 'lp',
            f0: 700,
            amp: 0.4,
            att: 0.004,
            tau: 0.08,
            color: 'pink',
          });
          whoosh(buf, sr, rng, 0.05, 0.9, 300, 2600, 1800, 0.3, 0.9);
        },
        -0.1,
      );
      [62, 66, 69, 74, 78, 81, 86, 90, 93].forEach((midi, i) =>
        addInteriorNote(out, sr, rng, 0.1 + i * 0.05, 'harp', midi, 0.2 + i * 0.015, -0.6 + i * 0.15),
      );
      addInteriorNote(out, sr, rng, 0.6, 'bell', 98, 0.26, 0.2, 2.4);
      addInteriorNote(out, sr, rng, 0.62, 'celesta', 86, 0.22, -0.2);
      interiorSparkles(out, sr, rng, 0.55, 1.3, 20, 0.03);
      interiorReflections(out, sr, 0.35, 5000);
      return out;
    },
  },
  {
    id: 'dbl-jump',
    vars: 3,
    sr: 32000,
    render(sr, rng, variant) {
      const dur = 0.7;
      const out = interiorStereo(sr, dur);
      const f0 = [520, 580, 470][variant % 3];
      interiorLayer(out, sr, dur, (buf) => {
        noise(buf, sr, rng, 0, {
          mode: 'lp',
          f0: 900,
          amp: 0.55,
          att: 0.003,
          tau: 0.06,
          color: 'pink',
        });
        noise(buf, sr, rng, 0, {
          mode: 'bp',
          f0: 1400,
          f1: 3600,
          sweep: 0.2,
          q: 1.1,
          amp: 0.25,
          att: 0.01,
          tau: 0.08,
        });
        tone(buf, sr, 0.01, {
          f0,
          f1: f0 * 2.1,
          glide: 0.06,
          amp: 0.1,
          att: 0.004,
          tau: 0.09,
        });
        tone(buf, sr, 0.03, {
          f0: f0 * 3,
          f1: f0 * 4.2,
          glide: 0.05,
          amp: 0.035,
          att: 0.003,
          tau: 0.08,
        });
        grains(buf, sr, rng, 0, 0.12, 12, {
          fLo: 2000,
          fHi: 6000,
          q: 1.5,
          gLo: 0.003,
          gHi: 0.01,
          amp: 0.12,
        });
      });
      return out;
    },
  },
  {
    id: 'flame-ring',
    sr: 32000,
    render(sr, rng) {
      const dur = 3.6;
      const out = interiorStereo(sr, dur);
      for (let ch = 0; ch < 2; ch++) {
        const buf = out[ch];
        const chRng = mulberry32(Math.floor(rng() * 1000000));
        const ringEnv = (t) => smooth(t / 0.12) * (t < 2.4 ? 1 : Math.max(0, 1 - (t - 2.4) / 0.9));
        noise(buf, sr, chRng, 0, {
          mode: 'lp',
          f0: 260,
          color: 'brown',
          amp: 0.9,
          env: ringEnv,
          dur,
        });
        noise(buf, sr, chRng, 0, {
          mode: 'bp',
          f0: 900,
          q: 0.8,
          amp: 0.14,
          env: (t) => ringEnv(t) * (0.7 + 0.3 * Math.sin(TAU * 7 * t + ch)),
          dur,
          color: 'pink',
        });
        crackle(buf, sr, chRng, 0.05, 3.1, 45, {
          fLo: 1500,
          fHi: 6500,
          amp: 0.4,
          pow: 2.2,
          shape: (u) => (u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25),
        });
      }
      interiorLayer(out, sr, dur, (buf) => whoosh(buf, sr, rng, 0, 0.45, 200, 1200, 300, 0.5, 0.8));
      return out;
    },
  },
  {
    id: 'frost-crackle',
    vars: 4,
    sr: 32000,
    render(sr, rng, variant) {
      const out = makeBuffer(sr, 0.6);
      crackle(out, sr, rng, 0, 0.18, 220, {
        fLo: 3500,
        fHi: 11000,
        amp: 0.45,
        shape: (u) => 1 - u,
      });
      const f0 = [2200, 2600, 1900, 3100][variant % 4];
      modal(
        out,
        sr,
        rng,
        0.005,
        [
          [f0, 0.25, 0.12],
          [f0 * 1.63, 0.15, 0.08],
          [f0 * 2.4, 0.1, 0.05],
        ],
        {
          amp: 0.4,
        },
      );
      noise(out, sr, rng, 0, {
        mode: 'hp',
        f0: 5000,
        amp: 0.15,
        att: 0.001,
        tau: 0.03,
      });
      return out;
    },
  },
  {
    id: 'lantern-tinkle',
    vars: 4,
    sr: 44100,
    render(sr, rng, variant) {
      const out = makeBuffer(sr, 0.9);
      const f0 = [3100, 3480, 2890, 3760][variant % 4];
      modal(
        out,
        sr,
        rng,
        0,
        [
          [f0, 0.3, 0.25],
          [f0 * 1.51, 0.18, 0.18],
          [f0 * 2.27, 0.1, 0.12],
        ],
        {
          amp: 0.4,
          noise: 0.08,
          noiseLp: 8000,
        },
      );
      if (variant % 2)
        modal(out, sr, rng, 0.07, [[f0 * 1.12, 0.2, 0.2]], {
          amp: 0.25,
        });
      return out;
    },
  },
];
export const INTERIOR_RECIPES = [...CAVE_IR_RECIPES, ...INTERIOR_AMBIENCE_RECIPES, ...INTERIOR_SFX_RECIPES];
