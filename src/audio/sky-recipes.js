/**
 * Sound recipes for the Painted Aerie: high wind, a distant choir and waterfalls as ambience loops, wind chimes, the area-discovery, stamina vessel and Sky Mantle stingers, snaring vines, wind gusts and storm crackle.
 */
import { choirNote } from './boss-sounds.js';
import { whoosh } from './combat-sounds.js';
import {
  BrownNoise,
  clamp,
  crackle,
  creak,
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
const skyStereo = (sr, dur) => [makeBuffer(sr, dur), makeBuffer(sr, dur)];
function renderSkyNote(sr, rand, inst, midi, dur) {
  return inst === 'celesta'
    ? celestaNote(sr, midi, rand)
    : inst === 'harp'
      ? harpNote(sr, midi, rand)
      : bellNote(sr, midi, rand, dur ?? 3, 0.8);
}
function skyNote(out, sr, rand, at, inst, midi, gain, pan = 0, dur) {
  mixPanned(out[0], out[1], renderSkyNote(sr, rand, inst, midi, dur), Math.round(at * sr), gain, pan);
}
function skyLayer(out, sr, dur, draw, pan = 0, gain = 1) {
  const buf = makeBuffer(sr, dur);
  draw(buf);
  mixPanned(out[0], out[1], buf, 0, gain, pan);
}
function skySparkles(out, sr, rand, start, spread, count, amp) {
  const total = out[0].length / sr;
  for (let i = 0; i < count; i++) {
    const at = start + range(rand, 0, spread);
    if (!(at > total - 0.3))
      skyLayer(
        out,
        sr,
        Math.min(total, at + 0.8),
        (buf) =>
          tone(buf, sr, at, {
            f0: range(rand, 3500, 8500),
            amp,
            att: 0.001,
            tau: range(rand, 0.05, 0.22),
          }),
        range(rand, -0.8, 0.8),
      );
  }
}
function skyEchoes(out, sr, mix, cutoff = 3200) {
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
    const offset = Math.round(delay * sr);
    for (let ch = 0; ch < 2; ch++) {
      const src = dry[side > 0 ? ch : 1 - ch];
      const dst = out[ch];
      const lp = new SVF(sr, cutoff, 0.6);
      for (let j = 0; j + offset < dst.length; j++) {
        lp.tick(src[j]);
        dst[j + offset] += lp.lp * gain * mix;
      }
    }
  }
}
function skyWhoosh(out, sr, rand, at, dur, f0, f1, amp) {
  noise(out, sr, rand, at, {
    mode: 'bp',
    q: 0.9,
    f0,
    f1,
    sweep: dur,
    color: 'pink',
    amp,
    env: (t) => Math.sin(Math.PI * clamp(t / dur, 0, 1)) ** 1.5,
    dur,
  });
}
const SKY_AMBIENCE_RECIPES = [
  {
    id: 'amb-sky-wind',
    sr: 22050,
    loop: 2.5,
    render(sr, rand) {
      const seed = rand() * 1000000;
      const channels = [];
      for (let ch = 0; ch < 2; ch++) {
        const buf = makeBuffer(sr, 14);
        const gust = smoothNoise(mulberry32(seed + ch * 7), 0.18);
        const drift = smoothNoise(rand, 0.12);
        const whistle = smoothNoise(rand, 0.3);
        const pink = new PinkNoise(rand);
        const brown = new BrownNoise(rand);
        const band = new SVF(sr, 900, 0.6);
        const whistleLo = new SVF(sr, 1800, 14);
        const whistleHi = new SVF(sr, 2700, 18);
        const rumble = new OnePole(sr, 220);
        for (let j = 0; j < buf.length; j++) {
          const t2 = j / sr;
          const level = 0.5 + 0.5 * gust(t2 + ch * 0.4);
          const whistleAmt = Math.max(0, whistle(t2)) ** 2;
          if (!(j & 31)) {
            band.set(700 + 600 * drift(t2) + 700 * level, 0.6);
            whistleLo.set(1500 + 500 * drift(t2 * 0.6 + 2) + 250 * level, 14);
            whistleHi.set(2400 + 400 * drift(t2 * 0.5 + 5), 18);
          }
          const noise = pink.next();
          band.tick(noise);
          whistleLo.tick(noise);
          whistleHi.tick(noise);
          buf[j] =
            band.bpn * 0.75 * level +
            rumble.lp(brown.next()) * 0.35 * level +
            (whistleLo.bpn * 0.3 + whistleHi.bpn * 0.18) * whistleAmt * level;
        }
        channels.push(buf);
      }
      return channels;
    },
  },
  {
    id: 'amb-sky-choir',
    sr: 24000,
    loop: 3,
    render(sr, rand) {
      const out = skyStereo(sr, 18);
      for (const [midi, at, hold, pan] of [
        [62, 0, 8, -0.4],
        [69, 1.2, 7.5, 0.35],
        [76, 3, 6, -0.1],
        [66, 6.5, 8, 0.45],
        [74, 8.5, 7, -0.35],
        [64, 10.5, 6.5, 0.2],
        [81, 12, 5.5, 0.05],
        [57, 13, 7, -0.25],
      ])
        skyLayer(
          out,
          sr,
          18,
          (buf) =>
            choirNote(buf, sr, rand, at, midi, hold, 0.12, {
              att: 2.4,
              rel: 2.2,
              vowel: 'oo',
              voices: 3,
            }),
          pan,
        );
      skyEchoes(out, sr, 0.5, 2600);
      return out;
    },
  },
  {
    id: 'amb-sky-falls',
    sr: 22050,
    loop: 1.5,
    render(sr, rand) {
      const channels = [];
      for (let ch = 0; ch < 2; ch++) {
        const buf = makeBuffer(sr, 8);
        const pink = new PinkNoise(rand);
        const brown = new BrownNoise(rand);
        const sprayHp = new OnePole(sr, 900);
        const spray = new SVF(sr, 4200, 0.6);
        const roar = new SVF(sr, 260, 0.7);
        const swell = smoothNoise(rand, 0.7);
        for (let j = 0; j < buf.length; j++) {
          const t2 = j / sr;
          const noise = pink.next();
          spray.tick(sprayHp.hp(noise));
          roar.tick(brown.next());
          buf[j] = spray.lp * 0.9 * (0.85 + 0.15 * swell(t2)) + roar.lp * 0.7;
        }
        grains(buf, sr, rand, 0, 8, 220, {
          fLo: 2500,
          fHi: 7000,
          q: 3,
          gLo: 0.004,
          gHi: 0.012,
          amp: 0.1,
        });
        channels.push(buf);
      }
      return channels;
    },
  },
];
const SKY_CHIME_NOTES = [86, 88, 90, 93, 95, 98, 100];
const SKY_SFX_RECIPES = [
  {
    id: 'sky-chime',
    vars: 6,
    sr: 44100,
    render(sr, rand, variation) {
      const dur = 4.2;
      const out = skyStereo(sr, dur);
      const count = 3 + (variation % 3);
      let at = 0;
      for (let i = 0; i < count; i++) {
        const midi = SKY_CHIME_NOTES[Math.floor(rand() * SKY_CHIME_NOTES.length)] - (variation % 2 ? 12 : 0);
        const pan = range(rand, -0.6, 0.6);
        skyNote(out, sr, rand, at, 'bell', midi, range(rand, 0.12, 0.26), pan, 3.2);
        skyLayer(
          out,
          sr,
          dur,
          (buf) =>
            modal(
              buf,
              sr,
              rand,
              at,
              [
                [mtof(midi) * 2.76, 0.12, 0.5],
                [mtof(midi) * 5.4, 0.06, 0.25],
              ],
              {
                amp: 0.2,
              },
            ),
          pan,
        );
        at += range(rand, 0.08, 0.45);
      }
      skyEchoes(out, sr, 0.35, 6000);
      return out;
    },
  },
  {
    id: 'st-area',
    sr: 44100,
    render(sr, rand) {
      const dur = 6.8;
      const out = skyStereo(sr, dur);
      skyLayer(out, sr, dur, (buf) => skyWhoosh(buf, sr, rand, 0, 1.4, 300, 2600, 0.22), -0.2);
      skyLayer(out, sr, dur, (buf) => skyWhoosh(buf, sr, rand, 0.2, 1.3, 500, 3400, 0.16), 0.3);
      [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86].forEach((midi, i) =>
        skyNote(out, sr, rand, 0.35 + i * 0.07, 'harp', midi, 0.3 + i * 0.02, -0.6 + i * 0.12),
      );
      const chordAt = 1.15;
      for (const [midi, pan, amp] of [
        [50, -0.3, 0.1],
        [57, 0.25, 0.09],
        [64, -0.15, 0.075],
        [66, 0.35, 0.07],
        [68, -0.4, 0.05],
        [73, 0.1, 0.05],
      ])
        skyLayer(out, sr, dur, (buf) => padNote(buf, sr, rand, chordAt, midi, 3.6, amp, 0.9, 1.6, 2000), pan);
      for (const [midi, pan] of [
        [69, -0.3],
        [74, 0.3],
        [78, 0],
      ])
        skyLayer(
          out,
          sr,
          dur,
          (buf) =>
            choirNote(buf, sr, rand, 1.3499999999999999, midi, 3.2, 0.11, {
              att: 0.8,
              rel: 1.4,
              vowel: 'ah',
              voices: 3,
            }),
          pan,
        );
      [86, 90, 93, 98].forEach((midi, i) =>
        skyNote(out, sr, rand, 2.05 + i * 0.28, 'celesta', midi, 0.26 - i * 0.03, 0.4 - i * 0.25),
      );
      skyNote(out, sr, rand, chordAt, 'bell', 74, 0.2, 0, 4);
      skySparkles(out, sr, rand, chordAt, 3.2, 26, 0.03);
      skyEchoes(out, sr, 0.45, 4200);
      return out;
    },
  },
  {
    id: 'st-vessel',
    sr: 44100,
    render(sr, rand) {
      const dur = 3.2;
      const out = skyStereo(sr, dur);
      skyLayer(out, sr, dur, (buf) => skyWhoosh(buf, sr, rand, 0, 1, 250, 4200, 0.28), -0.25);
      skyLayer(out, sr, dur, (buf) => skyWhoosh(buf, sr, rand, 0.08, 0.95, 400, 5200, 0.2), 0.25);
      [74, 78, 81, 86, 88, 93].forEach((midi, i) =>
        skyNote(out, sr, rand, 0.12 + i * 0.1, 'celesta', midi, 0.24 + i * 0.03, -0.5 + i * 0.2),
      );
      skyNote(out, sr, rand, 0.78, 'bell', 98, 0.28, 0.1, 2.4);
      skyNote(out, sr, rand, 0.8, 'harp', 74, 0.25, -0.1);
      skyLayer(out, sr, dur, (buf) => {
        tone(buf, sr, 0.75, {
          f0: mtof(86),
          amp: 0.06,
          dur: 1.8,
          env: (t) => smooth(t / 0.1) * Math.exp(-t / 0.7) * (1 + 0.3 * Math.sin(TAU * 6 * t)),
        });
      });
      skySparkles(out, sr, rand, 0.7, 1.2, 16, 0.03);
      skyEchoes(out, sr, 0.35, 5000);
      return out;
    },
  },
  {
    id: 'st-mantle',
    sr: 44100,
    render(sr, rand) {
      const dur = 5.4;
      const out = skyStereo(sr, dur);
      skyLayer(out, sr, dur, (buf) => whoosh(buf, sr, rand, 0, 0.7, 300, 1800, 600, 0.35, 0.9), -0.3);
      skyLayer(out, sr, dur, (buf) => whoosh(buf, sr, rand, 0.18, 0.6, 400, 2400, 700, 0.25, 0.9), 0.35);
      [62, 66, 69, 74, 78, 81, 86, 90].forEach((midi, i) =>
        skyNote(out, sr, rand, 0.2 + i * 0.05, 'harp', midi, 0.22 + i * 0.02, -0.5 + i * 0.14),
      );
      const fanfareAt = 0.55;
      const fanfare = [
        [62, 0, 0.3],
        [66, 0.3, 0.3],
        [69, 0.6, 0.3],
        [74, 0.9, 1.9],
      ];
      skyLayer(
        out,
        sr,
        dur,
        (buf) => {
          for (const [midi, offset, hold] of fanfare)
            brassNote(buf, sr, rand, fanfareAt + offset, midi, hold, 0.2, 0.4);
        },
        0.1,
      );
      skyLayer(
        out,
        sr,
        dur,
        (buf) => {
          for (const [midi, offset, hold] of fanfare)
            brassNote(buf, sr, rand, fanfareAt + offset + 0.005, midi - 12, hold, 0.09, 0.4);
        },
        -0.15,
      );
      for (const [midi, pan] of [
        [50, -0.3],
        [57, 0.3],
        [62, -0.1],
        [66, 0.2],
        [69, 0],
        [76, 0.35],
      ])
        skyLayer(out, sr, dur, (buf) => padNote(buf, sr, rand, 1.15, midi, 2.4, 0.06, 0.8, 1.4, 2200), pan);
      skyLayer(out, sr, dur, (buf) => {
        noise(buf, sr, rand, 0.75, {
          mode: 'hp',
          f0: 4500,
          amp: 0.1,
          env: (t) => clamp(t / 1.2, 0, 1) ** 2 * (t < 1.2 ? 1 : Math.exp(-(t - 1.2) / 0.9)),
          dur: 3.5,
        });
      });
      [93, 98].forEach((midi, i) => skyNote(out, sr, rand, 1.55 + i * 0.3, 'celesta', midi, 0.2, 0.3 - i * 0.5));
      skySparkles(out, sr, rand, 1.35, 1.6, 20, 0.028);
      skyEchoes(out, sr, 0.4, 4200);
      return out;
    },
  },
  {
    id: 'vine-wrap',
    vars: 2,
    render(sr, rand) {
      const dur = 1.1;
      const out = skyStereo(sr, dur);
      skyLayer(
        out,
        sr,
        dur,
        (buf) => {
          whoosh(buf, sr, rand, 0, 0.22, 600, 2600, 900, 0.3, 1.4);
          grains(buf, sr, rand, 0.02, 0.45, 70, {
            fLo: 1800,
            fHi: 6500,
            q: 2,
            gLo: 0.003,
            gHi: 0.012,
            amp: 0.3,
            shape: (x) => 1 - x,
          });
          creak(buf, sr, rand, 0.14, 0.55, {
            rate0: 55,
            rate1: 18,
            f1: 420,
            f2: 980,
            amp: 0.45,
            jitter: 0.3,
          });
          crackle(buf, sr, rand, 0.12, 0.5, 30, {
            fLo: 1500,
            fHi: 4000,
            amp: 0.18,
          });
          tone(buf, sr, 0.14, {
            f0: 140,
            f1: 90,
            glide: 0.1,
            amp: 0.25,
            att: 0.004,
            tau: 0.12,
          });
        },
        range(rand, -0.2, 0.2),
      );
      return out;
    },
  },
  {
    id: 'vine-free',
    render(sr, rand) {
      const dur = 0.8;
      const out = skyStereo(sr, dur);
      skyLayer(out, sr, dur, (buf) => {
        grains(buf, sr, rand, 0, 0.5, 60, {
          fLo: 1500,
          fHi: 7000,
          q: 1.8,
          gLo: 0.003,
          gHi: 0.015,
          amp: 0.3,
          shape: (x) => (1 - x) ** 2,
        });
        modal(
          buf,
          sr,
          rand,
          0,
          [
            [620, 0.3, 0.04],
            [1350, 0.2, 0.03],
          ],
          {
            amp: 0.4,
            noise: 0.35,
            noiseLp: 4000,
          },
        );
        whoosh(buf, sr, rand, 0.02, 0.3, 900, 3000, 1500, 0.2, 1.2);
      });
      return out;
    },
  },
  {
    id: 'wind-gust',
    vars: 2,
    sr: 32000,
    render(sr, rand) {
      const dur = 1.8;
      const out = skyStereo(sr, dur);
      skyLayer(out, sr, dur, (buf) => whoosh(buf, sr, rand, 0, 1.3, 200, 1400, 300, 0.7, 0.8), -0.35);
      skyLayer(out, sr, dur, (buf) => whoosh(buf, sr, rand, 0.06, 1.2, 350, 2200, 500, 0.5, 1), 0.35);
      skyLayer(out, sr, dur, (buf) => {
        noise(buf, sr, rand, 0.05, {
          mode: 'lp',
          f0: 180,
          color: 'brown',
          amp: 0.6,
          env: (t) => Math.sin(Math.PI * clamp(t / 1.1, 0, 1)) * (0.7 + 0.3 * Math.sin(TAU * 9 * t)),
          dur: 1.2,
        });
        const wander = smoothNoise(rand, 3);
        noise(buf, sr, rand, 0.2, {
          mode: 'bp',
          q: 9,
          f0: 1500,
          fc: (t) => 1300 + 500 * wander(t),
          amp: 0.1,
          env: (t) => Math.sin(Math.PI * clamp(t / 0.9, 0, 1)),
          dur: 1,
        });
      });
      return out;
    },
  },
  {
    id: 'storm-crackle',
    vars: 3,
    sr: 32000,
    render(sr, rand) {
      const dur = 2.2;
      const out = skyStereo(sr, dur);
      skyLayer(
        out,
        sr,
        dur,
        (buf) => {
          crackle(buf, sr, rand, 0, 0.45, 140, {
            fLo: 2500,
            fHi: 9000,
            amp: 0.4,
            shape: (x) => (1 - x) ** 1.5,
          });
          noise(buf, sr, rand, 0, {
            mode: 'hp',
            f0: 3000,
            amp: 0.35,
            att: 0.001,
            tau: 0.03,
          });
          tone(buf, sr, 0.01, {
            f0: 2400,
            f1: 300,
            glide: 0.06,
            amp: 0.2,
            att: 0.001,
            tau: 0.08,
            harm: [0.5, 0.3, 0.2],
          });
        },
        range(rand, -0.3, 0.3),
      );
      skyLayer(out, sr, dur, (buf) => {
        const roll = smoothNoise(rand, 6);
        noise(buf, sr, rand, 0.25, {
          mode: 'lp',
          f0: 120,
          color: 'brown',
          amp: 0.9,
          env: (t) => smooth(t / 0.15) * Math.exp(-t / 0.6) * (0.6 + 0.4 * Math.abs(roll(t))),
          dur: 1.9,
        });
      });
      return out;
    },
  },
];
export const SKY_RECIPES = [...SKY_AMBIENCE_RECIPES, ...SKY_SFX_RECIPES];
