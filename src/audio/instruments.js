/**
 * Synthesised instrument notes the musical sounds are built from: piano, celesta, harp and FM bell notes made of decaying partials, and brass and pad notes made of band-limited sawtooth oscillators.
 */
import { clamp, makeBuffer, mtof, noise, smooth, SVF, TAU } from './dsp.js';
function addPartials(buf, sr, partials, att, offset = 0, gain = 1) {
  const avail = buf.length - offset;
  const attLen = Math.max(1, Math.round(att * sr));
  for (const part of partials) {
    if (part.f <= 0 || part.f >= sr * 0.45) continue;
    const w = (TAU * part.f) / sr;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    let re = 1;
    let im = 0;
    const k1 = Math.exp(-1 / (part.t1 * sr));
    const k2 = Math.exp(-1 / (part.t2 * sr));
    let amp1 = part.a1 * gain;
    let amp2 = part.a2 * gain;
    const len = Math.min(avail, Math.ceil(Math.max(part.t1, part.t2) * 9 * sr));
    for (let i = 0; i < len; i++) {
      const re2 = re * cw - im * sw;
      im = re * sw + im * cw;
      re = re2;
      if ((i & 1023) == 1023) {
        const norm = 1 / Math.hypot(re, im);
        re *= norm;
        im *= norm;
      }
      let amp = amp1 + amp2;
      if (i < attLen) amp *= smooth(i / attLen);
      buf[offset + i] += im * amp;
      amp1 *= k1;
      amp2 *= k2;
    }
  }
}
function fadeOut(buf, sr, dur) {
  const len = Math.min(buf.length, Math.round(dur * sr));
  for (let i = 0; i < len; i++) {
    const u = i / len;
    buf[buf.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * u);
  }
}
export function pianoNote(sr, midi, rand, maxDur = 4.6) {
  const f0 = mtof(midi);
  const decay = clamp(6 * (130 / f0) ** 0.6, 1.1, 10);
  const dur = Math.min(maxDur, 0.5 + decay * 2.2);
  const inharm = 0.00008 * 2 ** ((midi - 48) / 14);
  const partials = [];
  for (let i = 1; i <= 18; i++) {
    const freq = i * f0 * Math.sqrt(1 + inharm * i * i);
    if (freq > Math.min(sr * 0.42, 9000)) break;
    let amp = Math.exp(-(freq - f0) / (1300 + f0 * 1.4)) / i ** 0.85;
    amp *= 0.35 + 0.65 * Math.abs(Math.sin((i * Math.PI) / 8.3));
    const tSlow = decay / (1 + 0.5 * (i - 1));
    const tFast = Math.min(0.45, tSlow * 0.16);
    const detunes = i <= 4 ? [-0.9, 0.15, 1.05] : [0];
    for (const cents of detunes) {
      const f = freq * 2 ** ((cents + (rand() - 0.5) * 0.3) / 1200);
      const a = amp / detunes.length;
      partials.push({
        f,
        a1: a * 0.6,
        t1: tFast,
        a2: a * 0.4,
        t2: tSlow,
      });
    }
  }
  const buf = makeBuffer(sr, dur);
  addPartials(buf, sr, partials, 0.0045);
  noise(buf, sr, rand, 0, {
    mode: 'lp',
    f0: Math.min(2400, 500 + f0 * 2),
    amp: 0.035,
    att: 0.001,
    tau: 0.01,
  });
  fadeOut(buf, sr, Math.min(dur * 0.4, 1.6));
  return buf;
}
export function celestaNote(sr, midi, rand, maxDur = 3.5) {
  const f0 = mtof(midi);
  const decay = clamp(2.2 * (523 / f0) ** 0.5, 0.45, 3.5);
  const dur = Math.min(maxDur, decay * 3 + 0.15);
  const partials = [
    [1, 1, decay],
    [2.004, 0.09, decay * 0.45],
    [3, 0.03, decay * 0.2],
    [4.07, 0.05, 0.08],
    [6.3, 0.022, 0.03],
    [9.1, 0.014, 0.012],
  ].map(([ratio, amp, tau]) => ({
    f: f0 * ratio * (1 + (rand() - 0.5) * 0.0006),
    a1: amp * 0.45,
    t1: tau * 0.25,
    a2: amp * 0.55,
    t2: tau,
  }));
  const buf = makeBuffer(sr, dur);
  addPartials(buf, sr, partials, 0.0009);
  noise(buf, sr, rand, 0, {
    mode: 'bp',
    f0: Math.min(6000, f0 * 3),
    q: 1.2,
    amp: 0.02,
    att: 0.0005,
    tau: 0.004,
  });
  fadeOut(buf, sr, Math.min(dur * 0.3, 0.8));
  return buf;
}
export function harpNote(sr, midi, rand, maxDur = 4) {
  const f0 = mtof(midi);
  const decay = clamp(3.2 * (196 / f0) ** 0.55, 0.6, 6);
  const dur = Math.min(maxDur, decay * 2.6 + 0.2);
  const partials = [];
  for (let i = 1; i <= 20; i++) {
    const freq = i * f0 * Math.sqrt(1 + 0.00004 * i * i);
    if (freq > Math.min(sr * 0.42, 8000)) break;
    const amp = (Math.abs(Math.sin(i * Math.PI * 0.13)) / i ** 1.25) * Math.exp(-(freq - f0) / 4000);
    const tau = decay / (1 + 0.7 * (i - 1) ** 1.1);
    partials.push({
      f: freq * (1 + (rand() - 0.5) * 0.0004),
      a1: amp * 0.3,
      t1: tau * 0.2,
      a2: amp * 0.7,
      t2: tau,
    });
  }
  const buf = makeBuffer(sr, dur);
  addPartials(buf, sr, partials, 0.0015);
  noise(buf, sr, rand, 0, {
    mode: 'bp',
    f0: Math.min(3500, 800 + f0 * 2),
    q: 1,
    amp: 0.03,
    att: 0.0005,
    tau: 0.005,
  });
  fadeOut(buf, sr, Math.min(dur * 0.35, 1));
  return buf;
}
export function bellNote(sr, midi, rand, dur = 3, bright = 1) {
  const f0 = mtof(midi);
  const fm = f0 * 1.4;
  const decay = clamp(1.6 * (1000 / f0) ** 0.3, 0.6, 3);
  const buf = makeBuffer(sr, dur);
  const index = 1.6 * bright;
  let carPhase = rand() * 0.1;
  let modPhase = 0;
  const len = buf.length;
  for (let i = 0; i < len; i++) {
    const t2 = i / sr;
    carPhase += (TAU * f0) / sr;
    modPhase += (TAU * fm) / sr;
    const beta = index * Math.exp(-t2 / 0.35);
    const env = (t2 < 0.0012 ? t2 / 0.0012 : 1) * Math.exp(-t2 / decay);
    buf[i] =
      (Math.sin(carPhase + beta * Math.sin(modPhase)) * 0.7 +
        Math.sin(carPhase * 0.5) * 0.12 * Math.exp(-t2 / (decay * 1.4))) *
      env;
  }
  fadeOut(buf, sr, Math.min(dur * 0.3, 0.6));
  return buf;
}
export class SawOsc {
  sr;
  ph;
  constructor(sr, ph = 0) {
    this.sr = sr;
    this.ph = ph;
  }
  next(freq) {
    const dt = freq / this.sr;
    this.ph += dt;
    if (this.ph >= 1) --this.ph;
    let y = 2 * this.ph - 1;
    let ph = this.ph;
    if (ph < dt) {
      ph /= dt;
      y -= ph + ph - ph * ph - 1;
    } else if (ph > 1 - dt) {
      ph = (ph - 1) / dt;
      y -= ph * ph + ph + ph + 1;
    }
    return y;
  }
}
export function brassNote(buf, sr, rand, t0, midi, dur, amp, rel = 0.35) {
  const f0 = mtof(midi);
  const i0 = Math.round(t0 * sr);
  const len = Math.min(buf.length - i0, Math.round((dur + rel * 5) * sr));
  const oscs = [new SawOsc(sr, rand()), new SawOsc(sr, rand())];
  const detune = [2 ** (-4 / 1200), 2 ** (5 / 1200)];
  const lpf = new SVF(sr, 400, 0.8);
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const vib = 1 + 0.004 * Math.sin(TAU * 5.2 * t) * smooth((t - 0.3) / 0.4);
    const swell = smooth(t / 0.12);
    if (!(i & 15))
      lpf.set(Math.min(sr * 0.4, f0 * (1.4 + 3.2 * swell * (t < dur ? 1 : Math.exp(-(t - dur) / rel)))), 0.8);
    let x = 0;
    for (let j = 0; j < 2; j++) x += oscs[j].next(f0 * detune[j] * vib);
    lpf.tick(x * 0.5);
    const env = t < dur ? smooth(t / 0.07) * (0.85 + 0.15 * Math.exp(-t / 0.2)) : Math.exp(-(t - dur) / rel);
    buf[i0 + i] += lpf.lp * env * amp;
  }
}
export function padNote(buf, sr, rand, t0, midi, dur, amp, att = 0.4, rel = 1.2, cutoff = 1400) {
  const f0 = mtof(midi);
  const i0 = Math.round(t0 * sr);
  const len = Math.min(buf.length - i0, Math.round((dur + rel * 5) * sr));
  const oscs = [new SawOsc(sr, rand()), new SawOsc(sr, rand()), new SawOsc(sr, rand())];
  const detune = [2 ** (-9 / 1200), 1, 2 ** (8 / 1200)];
  const lpf = new SVF(sr, cutoff, 0.6);
  const lfoPhase = rand() * TAU;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    if (!(i & 31))
      lpf.set(cutoff * (0.55 + 0.45 * smooth(t / (att * 2))) * (1 + 0.08 * Math.sin(lfoPhase + t * 1.3)), 0.6);
    let x = 0;
    for (let j = 0; j < 3; j++) x += oscs[j].next(f0 * detune[j]);
    lpf.tick(x * 0.33);
    const env = t < dur ? smooth(t / att) : Math.exp(-(t - dur) / rel);
    buf[i0 + i] += lpf.lp * env * amp;
  }
}
