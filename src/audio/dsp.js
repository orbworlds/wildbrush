/**
 * Sound synthesis toolkit for the procedural sound recipes: seeded random numbers, a state-variable filter, one-pole filters, pink and brown noise, and generators for tones, filtered noise, modal rings, grains, crackles, drips, bubbles and creaks. Also mixing and panning, tail trimming, loop crossfades and loudness normalisation.
 */
export const TAU = Math.PI * 2;
export function mulberry32(seed) {
  let state = seed >>> 0 || 2654435769;
  return () => {
    state = (state + 1831565813) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const smoothstep = (edge0, edge1, x) => smooth((x - edge0) / (edge1 - edge0));
export const mtof = (midi) => 440 * 2 ** ((midi - 69) / 12);
const dbToGain = (db) => 10 ** (db / 20);
export const range = (rand, lo, hi) => lo + (hi - lo) * rand();
export const pick = (rand, arr) => arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];
export function makeBuffer(sr, dur) {
  return new Float32Array(Math.max(1, Math.round(dur * sr)));
}
export class SVF {
  sr;
  lp = 0;
  bp = 0;
  bpn = 0;
  hp = 0;
  s1 = 0;
  s2 = 0;
  k = 1;
  a1 = 0;
  a2 = 0;
  a3 = 0;
  constructor(sr, freq = 1000, q = 0.707) {
    this.sr = sr;
    this.set(freq, q);
  }
  set(freq, q = 0.707) {
    const fc = clamp(freq, 5, this.sr * 0.45);
    const g = Math.tan((Math.PI * fc) / this.sr);
    this.k = 1 / Math.max(q, 0.05);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
    return this;
  }
  tick(x) {
    const v3 = x - this.s2;
    const v1 = this.a1 * this.s1 + this.a2 * v3;
    const v2 = this.s2 + this.a2 * this.s1 + this.a3 * v3;
    this.s1 = 2 * v1 - this.s1;
    this.s2 = 2 * v2 - this.s2;
    this.lp = v2;
    this.bp = v1;
    this.bpn = this.k * v1;
    this.hp = x - this.k * v1 - v2;
    return v2;
  }
}
export class OnePole {
  sr;
  y = 0;
  a = 0;
  constructor(sr, freq) {
    this.sr = sr;
    this.set(freq);
  }
  set(freq) {
    this.a = 1 - Math.exp((-TAU * clamp(freq, 1, this.sr * 0.49)) / this.sr);
  }
  lp(x) {
    return (this.y += this.a * (x - this.y));
  }
  hp(x) {
    return x - this.lp(x);
  }
}
export class PinkNoise {
  r;
  b0 = 0;
  b1 = 0;
  b2 = 0;
  constructor(rand) {
    this.r = rand;
  }
  next() {
    const white = this.r() * 2 - 1;
    this.b0 = 0.99765 * this.b0 + white * 0.099046;
    this.b1 = 0.963 * this.b1 + white * 0.2965164;
    this.b2 = 0.57 * this.b2 + white * 1.0526913;
    return (this.b0 + this.b1 + this.b2 + white * 0.1848) * 0.22;
  }
}
export class BrownNoise {
  r;
  y = 0;
  constructor(rand) {
    this.r = rand;
  }
  next() {
    this.y = (this.y + 0.02 * (this.r() * 2 - 1)) / 1.02;
    return this.y * 3.5;
  }
}
export function smoothNoise(rand, rate) {
  const knots = [rand() * 2 - 1, rand() * 2 - 1];
  return (t) => {
    const pos = Math.max(0, t) * rate;
    const idx = Math.floor(pos);
    for (; knots.length < idx + 2;) knots.push(rand() * 2 - 1);
    const frac = pos - idx;
    const w = (1 - Math.cos(Math.PI * frac)) * 0.5;
    return knots[idx] * (1 - w) + knots[idx + 1] * w;
  };
}
export function attackDecay(t2, att, tau) {
  if (t2 < 0) return 0;
  if (t2 < att) {
    const x = t2 / att;
    return x * x * (3 - 2 * x);
  }
  return Math.exp(-(t2 - att) / tau);
}
export const hann = (x) => (x <= 0 || x >= 1 ? 0 : 0.5 - 0.5 * Math.cos(TAU * x));
export function tone(buf, sr, t0, opts) {
  const i0 = Math.max(0, Math.round(t0 * sr));
  if (i0 >= buf.length) return;
  const att = opts.att ?? 0.002;
  const tau = opts.tau ?? 0.2;
  const dur = opts.dur ?? att + tau * 7;
  const len = Math.min(buf.length - i0, Math.round(dur * sr));
  const f1 = opts.f1 ?? opts.f0;
  const glide = opts.glide ?? 0.05;
  const harm = opts.harm;
  const fMax = Math.max(opts.f0, f1) * 1.3;
  const nHarm = harm ? Math.min(harm.length, Math.max(0, Math.floor((sr * 0.45) / fMax) - 1)) : 0;
  const vib = opts.vib;
  const fade = Math.min(len, Math.round(0.005 * sr));
  let phase = 0;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    let f = opts.freq ? opts.freq(t) : f1 + (opts.f0 - f1) * Math.exp(-t / glide);
    if (vib) {
      const ramp = clamp((t - vib[2]) / 0.12, 0, 1);
      if (ramp > 0) f *= 2 ** ((vib[1] * ramp * Math.sin(TAU * vib[0] * t)) / 12);
    }
    phase += (TAU * f) / sr;
    if (phase > 10000) phase -= TAU * 1000;
    let sample = Math.sin(phase);
    for (let h = 0; h < nHarm; h++) sample += harm[h] * Math.sin(phase * (h + 2));
    let gain = (opts.env ? opts.env(t) : attackDecay(t, att, tau)) * opts.amp;
    if (i > len - fade) gain *= (len - i) / fade;
    buf[i0 + i] += sample * gain;
  }
}
export function noise(buf, sr, rand, t0, opts) {
  const i0 = Math.max(0, Math.round(t0 * sr));
  if (i0 >= buf.length) return;
  const att = opts.att ?? 0.003;
  const tau = opts.tau ?? 0.1;
  const dur = opts.dur ?? att + tau * 7;
  const len = Math.min(buf.length - i0, Math.round(dur * sr));
  const q = opts.q ?? 0.707;
  const svf = new SVF(sr, opts.f0, q);
  const pink = opts.color === 'pink' ? new PinkNoise(rand) : null;
  const brown = opts.color === 'brown' ? new BrownNoise(rand) : null;
  const hpf = opts.hp ? new OnePole(sr, opts.hp) : null;
  const lpf = opts.lp ? new OnePole(sr, opts.lp) : null;
  let norm = 1;
  if (!pink && !brown) {
    const nyq = sr / 2;
    const bw = opts.mode === 'lp' ? opts.f0 : opts.mode === 'hp' ? nyq - opts.f0 : (opts.f0 / q) * 1.57;
    norm = clamp(Math.sqrt(nyq / Math.max(bw, 20)) * 0.5, 0.5, 12);
  }
  const sweep = opts.sweep ?? dur;
  const fade = Math.min(len, Math.round(0.005 * sr));
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    if (!(i & 15)) {
      let f0 = opts.f0;
      if (opts.fc) f0 = opts.fc(t);
      else if (opts.f1 !== undefined) f0 = opts.f0 * (opts.f1 / opts.f0) ** +Math.min(1, t / sweep);
      svf.set(f0, q);
    }
    const x2 = pink ? pink.next() : brown ? brown.next() : rand() * 2 - 1;
    svf.tick(x2);
    let y = opts.mode === 'lp' ? svf.lp : opts.mode === 'hp' ? svf.hp : svf.bpn;
    if (hpf) y = hpf.hp(y);
    if (lpf) y = lpf.lp(y);
    let gain = (opts.env ? opts.env(t) : attackDecay(t, att, tau)) * opts.amp * norm;
    if (i > len - fade) gain *= (len - i) / fade;
    buf[i0 + i] += y * gain;
  }
}
export function modal(buf, sr, rand, t0, modes, opts) {
  const i0 = Math.max(0, Math.round(t0 * sr));
  if (i0 >= buf.length) return;
  const attLen = Math.max(1, Math.round((opts.att ?? 0.0004) * sr));
  for (const [freq, gain, decay] of modes) {
    if (freq <= 0 || freq >= sr * 0.45) continue;
    const len = Math.min(buf.length - i0, Math.ceil(decay * 8 * sr));
    const w = (TAU * freq) / sr;
    const cw = Math.cos(w);
    const sw = Math.sin(w);
    let re = Math.cos(rand() * 0.3);
    let im = Math.sin(rand() * 0.3);
    const damp = Math.exp(-1 / (decay * sr));
    let amp = gain * opts.amp;
    for (let i = 0; i < len; i++) {
      const re2 = re * cw - im * sw;
      im = re * sw + im * cw;
      re = re2;
      const ramp = i < attLen ? i / attLen : 1;
      buf[i0 + i] += im * amp * ramp;
      amp *= damp;
    }
  }
  if (opts.noise)
    noise(buf, sr, rand, t0, {
      mode: 'lp',
      f0: opts.noiseLp ?? 3000,
      amp: opts.noise,
      att: 0.0003,
      tau: opts.noiseTau ?? 0.004,
    });
}
export function grains(buf, sr, rand, t0, dur, count, opts) {
  const q = opts.q ?? 1.2;
  const svf = new SVF(sr, 1000, q);
  for (let i = 0; i < count; i++) {
    let pos = rand();
    if (opts.shape) for (let tries = 0; tries < 8 && !(rand() <= opts.shape(pos)); tries++) pos = rand();
    const start = Math.round((t0 + pos * dur) * sr);
    const len = Math.max(4, Math.round(range(rand, opts.gLo, opts.gHi) * sr));
    const freq = opts.fLo * (opts.fHi / opts.fLo) ** +rand();
    svf.set(freq, q);
    const amp = opts.amp * rand() ** +(opts.pow ?? 1.2) * (opts.shape, 1);
    for (let j = 0; j < len && start + j < buf.length; j++)
      if (!(start + j < 0)) {
        svf.tick(rand() * 2 - 1);
        buf[start + j] += svf.bpn * amp * hann(j / len);
      }
  }
}
export function crackle(buf, sr, rand, t0, dur, rate, opts) {
  const svf = new SVF(sr, 2000, opts.q ?? 2.5);
  let t = 0;
  const clickLen = opts.len ?? 0.0025;
  for (; t < dur && ((t += -Math.log(1 - rand() * 0.999) / rate), !(t >= dur));) {
    const pos = t / dur;
    if (opts.shape && rand() > opts.shape(pos)) continue;
    const start = Math.round((t0 + t) * sr);
    const len = Math.max(6, Math.round(range(rand, 0.4, 1.4) * clickLen * sr));
    svf.set(opts.fLo * (opts.fHi / opts.fLo) ** +rand(), opts.q ?? 2.5);
    const amp = opts.amp * rand() ** +(opts.pow ?? 2);
    const decay = Math.exp(-5 / len);
    let env = 1;
    for (let j = 0; j < len * 2 && start + j < buf.length; j++) {
      const x = j < 2 ? rand() * 2 - 1 : (rand() * 2 - 1) * env * 0.5;
      svf.tick(x);
      if (start + j >= 0) buf[start + j] += svf.bpn * amp * (j < len ? 1 : (2 * len - j) / len);
      env *= decay;
    }
  }
}
export function droplet(buf, sr, t0, freq, amp, rise = 1.9, tau = 0.028) {
  tone(buf, sr, t0, {
    freq: (t) => freq * (1 + (rise - 1) * (1 - Math.exp(-t / 0.018))),
    f0: freq,
    amp,
    att: 0.0015,
    tau,
  });
}
export function bubble(buf, sr, t0, freq, amp, tau = 0.03) {
  tone(buf, sr, t0, {
    freq: (t) => freq * (1 + (t / tau) * 0.35),
    f0: freq,
    amp,
    att: 0.001,
    tau,
  });
}
export function creak(buf, sr, rand, t0, dur, opts) {
  const i0 = Math.round(t0 * sr);
  const len = Math.min(buf.length - i0, Math.round(dur * sr));
  const res1 = new SVF(sr, opts.f1, 7);
  const res2 = new SVF(sr, opts.f2, 9);
  let nextTick = 0;
  const jitter = opts.jitter ?? 0.25;
  for (let i = 0; i < len; i++) {
    const t = i / sr;
    const prog = t / dur;
    let imp = 0;
    if (i >= nextTick) {
      imp = range(rand, 0.4, 1);
      const rate = opts.rate0 * (opts.rate1 / opts.rate0) ** +prog;
      nextTick = i + Math.max(2, Math.round((sr / rate) * (1 + (rand() - 0.5) * jitter)));
    }
    res1.tick(imp);
    res2.tick(imp);
    const env = hann(prog * 0.5 + 0.25) * smoothstep(0, 0.05, t) * smoothstep(dur, dur - 0.05, t);
    buf[i0 + i] += (res1.bpn + 0.7 * res2.bpn) * env * opts.amp;
  }
}
function mixInto(dst, src, offset, gain = 1) {
  const end = Math.min(src.length, dst.length - offset);
  for (let i = Math.max(0, -offset); i < end; i++) dst[offset + i] += src[i] * gain;
}
export function mixPanned(left, right, src, offset, gain, pan) {
  const angle = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  mixInto(left, src, offset, gain * Math.cos(angle));
  mixInto(right, src, offset, gain * Math.sin(angle));
}
export function finalize(buf, sr, fadeInMs = 0.8, fadeOutMs = 15, dcBlock = true) {
  let x1 = 0;
  let y1 = 0;
  const pole = 1 - (TAU * 12) / sr;
  for (let i = 0; i < buf.length; i++) {
    let x = buf[i];
    if (!Number.isFinite(x)) x = 0;
    if (dcBlock) {
      const y = x - x1 + pole * y1;
      x1 = x;
      y1 = y;
      buf[i] = y;
    } else buf[i] = x;
  }
  const fadeIn = Math.min(buf.length >> 1, Math.round((fadeInMs / 1000) * sr));
  for (let i = 0; i < fadeIn; i++) buf[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeIn);
  const fadeOut = Math.min(buf.length >> 1, Math.round((fadeOutMs / 1000) * sr));
  for (let i = 0; i < fadeOut; i++) buf[buf.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / fadeOut);
  return buf;
}
export function trimTail(chans, sr, floorDb = -66) {
  let peak = 0;
  for (const ch of chans) for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
  if (peak <= 0) return chans;
  const thresh = peak * dbToGain(floorDb);
  let last = 0;
  for (const ch of chans)
    for (let i = ch.length - 1; i > last; i--)
      if (Math.abs(ch[i]) > thresh) {
        last = i;
        break;
      }
  const end = Math.min(chans[0].length, last + Math.round(0.02 * sr));
  return end >= chans[0].length - 16 ? chans : chans.map((ch) => finalize(ch.slice(0, end), sr, 0, 12, false));
}
export function crossfadeLoop(buf, sr, fadeDur) {
  const fadeLen = Math.round(fadeDur * sr);
  const len = buf.length - fadeLen;
  const out = buf.slice(0, len);
  for (let i = 0; i < fadeLen; i++) {
    const angle = (i / fadeLen) * (Math.PI / 2);
    out[i] = buf[i] * Math.sin(angle) + buf[len + i] * Math.cos(angle);
  }
  return out;
}
function measureLoudness(chans, sr) {
  let peak = 0;
  let sumSq = 0;
  const len = chans[0].length;
  const win = Math.max(8, Math.round(0.05 * sr));
  const hop = win >> 1;
  const filtered = chans.map((ch) => {
    const hpf = new OnePole(sr, 80);
    const out = new Float32Array(ch.length);
    for (let i = 0; i < ch.length; i++) {
      const x = ch[i];
      peak = Math.max(peak, Math.abs(x));
      sumSq += x * x;
      out[i] = hpf.hp(x);
    }
    return out;
  });
  let shortTerm = 0;
  for (let j = 0; j + win <= len || j === 0; j += hop) {
    let sum = 0;
    const end = Math.min(len, j + win);
    for (const ch of filtered) for (let k = j; k < end; k++) sum += ch[k] * ch[k];
    shortTerm = Math.max(shortTerm, Math.sqrt(sum / ((end - j) * chans.length)));
    if (end >= len) break;
  }
  return {
    peak,
    rms: Math.sqrt(sumSq / (len * chans.length)),
    st: shortTerm,
    dur: len / sr,
  };
}
export function normalize(chans, sr, mode, levelDb, ceiling = 0.89) {
  if (mode === 'none') return;
  const stats = measureLoudness(chans, sr);
  const level = mode === 'long' ? stats.rms : mode === 'peak' ? stats.peak : stats.st;
  if (level <= 1e-9) return;
  let gain = dbToGain(levelDb) / level;
  if (stats.peak * gain > ceiling) gain = ceiling / stats.peak;
  for (const ch of chans) for (let i = 0; i < ch.length; i++) ch[i] *= gain;
}
export function renderStereo(sr, rand, dur, fill) {
  const left = makeBuffer(sr, dur);
  const right = makeBuffer(sr, dur);
  fill(left, 0, rand);
  fill(right, 1, rand);
  return [left, right];
}
