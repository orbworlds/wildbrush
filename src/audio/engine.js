/**
 * WebAudio engine: master compressor and limiter, the world low-pass for pause and slow motion, sfx, ambience, UI, stinger and music buses, outdoor, hall and cave reverbs, a pool of 3D voices, one-shots, pitched notes and synth pads, music ducking, the listener and a level meter. Also the looping sound used for ambience and charge hums.
 */
import { SoundBank } from './bank.js';
const engClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const engSmoothstep = (edge0, edge1, x) => {
  const t = engClamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const engDbToGain = (db) => 10 ** (db / 20);
const MASTER_BOOST = engDbToGain(4);
export class AudioEngine {
  ctx;
  silent;
  ac = null;
  bank = new SoundBank();
  failed = false;
  listener = {
    x: 0,
    y: 0,
    z: 0,
  };
  voices = [];
  master;
  limiter;
  worldFilter;
  worldGain;
  buses;
  musicDuck;
  exploreGain;
  musicPause;
  musicVol;
  outdoor;
  outdoorReturn;
  hall;
  cave;
  caveSend;
  caveTone;
  caveOn = false;
  caveLevel = 0;
  caveZeroAt = 0;
  outdoorIn;
  sfxSend;
  padWave = null;
  analyser = null;
  meterBuf = null;
  hidden = false;
  wantRunning = false;
  volumes = {
    master: 0.8,
    music: 0.6,
  };
  world = {
    paused: false,
    wheel: false,
  };
  active = new Map();
  handles = new Map();
  constructor(ctx, silent) {
    this.ctx = ctx;
    this.silent = silent;
    try {
      document.addEventListener('visibilitychange', () => {
        this.hidden = document.visibilityState === 'hidden';
        if (this.ac)
          if (this.hidden) this.ac.suspend().catch(() => {});
          else if (this.wantRunning) this.ac.resume().catch(() => {});
      });
    } catch {}
  }
  get running() {
    return !!this.ac && this.ac.state === 'running';
  }
  get now() {
    return this.ac ? this.ac.currentTime : 0;
  }
  ensure() {
    if (this.ac) return true;
    if (this.failed) return false;
    try {
      const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
      if (!AudioCtx) {
        this.failed = true;
        return false;
      }
      this.ac = new AudioCtx({
        latencyHint: 'interactive',
      });
      this.build();
      this.bank.attach(this.ac);
      const irOutdoor = this.bank.get('ir-outdoor', 0);
      const irHall = this.bank.get('ir-hall', 0);
      const irCave = this.bank.get('ir-cave', 0);
      if (irOutdoor) this.outdoor.buffer = irOutdoor;
      if (irHall) this.hall.buffer = irHall;
      if (irCave) this.cave.buffer = irCave;
      this.setWorldState(this.world.paused, this.world.wheel);
      return true;
    } catch (err) {
      console.warn('[audio] could not create AudioContext', err);
      this.failed = true;
      this.ac = null;
      return false;
    }
  }
  resume() {
    this.wantRunning = true;
    if (this.ac && !this.hidden && this.ac.state !== 'running') this.ac.resume().catch(() => {});
  }
  build() {
    const ac = this.ac;
    const makeGain = (level = 1) => {
      const gain = ac.createGain();
      gain.gain.value = level;
      return gain;
    };
    this.master = makeGain(0);
    const compressor = ac.createDynamicsCompressor();
    compressor.threshold.value = -20;
    compressor.knee.value = 18;
    compressor.ratio.value = 2.5;
    compressor.attack.value = 0.012;
    compressor.release.value = 0.3;
    this.limiter = ac.createDynamicsCompressor();
    this.limiter.threshold.value = -2.5;
    this.limiter.knee.value = 0;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.002;
    this.limiter.release.value = 0.12;
    this.master.connect(compressor).connect(this.limiter).connect(ac.destination);
    const worldBus = makeGain();
    this.worldFilter = ac.createBiquadFilter();
    this.worldFilter.type = 'lowpass';
    this.worldFilter.frequency.value = Math.min(20000, ac.sampleRate * 0.45);
    this.worldFilter.Q.value = 0.5;
    this.worldGain = makeGain();
    worldBus.connect(this.worldFilter).connect(this.worldGain).connect(this.master);
    this.buses = {
      sfx: makeGain(),
      amb: makeGain(),
      ui: makeGain(),
      stinger: makeGain(),
      music: makeGain(),
      battle: makeGain(0),
      flight: makeGain(0),
    };
    this.buses.sfx.connect(worldBus);
    this.buses.amb.connect(worldBus);
    this.buses.ui.connect(this.master);
    this.outdoor = ac.createConvolver();
    this.outdoor.normalize = true;
    this.outdoorIn = makeGain();
    this.outdoorReturn = makeGain(0.9);
    this.outdoorIn.connect(this.outdoor).connect(this.outdoorReturn).connect(worldBus);
    this.sfxSend = makeGain(0.18);
    this.sfxSend.connect(this.outdoorIn);
    this.cave = ac.createConvolver();
    this.cave.normalize = true;
    this.caveSend = makeGain(0);
    this.caveTone = ac.createBiquadFilter();
    this.caveTone.type = 'lowpass';
    this.caveTone.frequency.value = 3200;
    this.caveTone.Q.value = 0.5;
    this.caveSend.connect(this.caveTone).connect(this.cave).connect(makeGain(1)).connect(worldBus);
    this.hall = ac.createConvolver();
    this.hall.normalize = true;
    const hallIn = makeGain();
    hallIn.connect(this.hall).connect(makeGain(0.85)).connect(this.master);
    this.musicDuck = makeGain();
    this.musicPause = makeGain();
    this.musicVol = makeGain();
    this.exploreGain = makeGain();
    this.buses.music.connect(this.exploreGain).connect(this.musicDuck);
    this.buses.battle.connect(this.musicDuck);
    this.buses.flight.connect(this.musicDuck);
    this.musicDuck.connect(this.musicPause).connect(this.musicVol).connect(this.master);
    this.musicVol.connect(makeGain(0.6)).connect(hallIn);
    this.buses.stinger.connect(this.master);
    this.buses.stinger.connect(makeGain(0.45)).connect(hallIn);
    const quality = this.ctx.settings?.quality ?? 'high';
    const voiceCount = quality === 'low' ? 10 : quality === 'medium' ? 16 : 24;
    for (let j = 0; j < voiceCount; j++) {
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 0.5;
      const panner = ac.createPanner();
      panner.panningModel = quality === 'high' && j < 8 ? 'HRTF' : 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 7;
      panner.maxDistance = 400;
      panner.rolloffFactor = 1.1;
      const dry = makeGain();
      const wet = makeGain(0);
      filter.connect(panner);
      panner.connect(dry).connect(this.buses.sfx);
      panner.connect(wet).connect(this.outdoorIn);
      this.voices.push({
        filter,
        panner,
        dry,
        wet,
        src: null,
        g: null,
        end: 0,
        prio: 0,
      });
    }
    const real = new Float32Array(20);
    const imag = new Float32Array(20);
    for (let i = 1; i < 20; i++) imag[i] = 1 / i ** 1.7;
    this.padWave = ac.createPeriodicWave(real, imag);
    this.applyVolumes();
  }
  bus(id) {
    return this.buses[id];
  }
  setVolumes(master, music) {
    this.volumes.master = engClamp(Number(master) || 0, 0, 1);
    this.volumes.music = engClamp(Number(music) || 0, 0, 1);
    this.applyVolumes();
  }
  applyVolumes() {
    if (!this.ac) return;
    const currentTime = this.ac.currentTime;
    const level = this.silent ? 0 : this.volumes.master ** 1.5 * MASTER_BOOST;
    this.master.gain.setTargetAtTime(level, currentTime, 0.05);
    this.musicVol.gain.setTargetAtTime(this.volumes.music ** 1.5, currentTime, 0.05);
  }
  setSilent(silent) {
    this.silent = silent;
    this.applyVolumes();
  }
  setWorldState(paused, wheel) {
    this.world.paused = paused;
    this.world.wheel = wheel;
    if (!this.ac) return;
    const currentTime = this.ac.currentTime;
    const maxFreq = this.ac.sampleRate * 0.45;
    const cutoff = paused ? 650 : wheel ? 1700 : Math.min(20000, maxFreq);
    this.worldFilter.frequency.cancelScheduledValues(currentTime);
    this.worldFilter.frequency.setTargetAtTime(cutoff, currentTime, paused || wheel ? 0.08 : 0.2);
    this.worldGain.gain.setTargetAtTime(paused ? 0.45 : wheel ? 0.8 : 1, currentTime, 0.1);
    this.musicPause.gain.setTargetAtTime(paused ? 0.65 : 1, currentTime, 0.2);
  }
  setMusicMix(explore, battle, tau = 0.4) {
    if (!this.ac) return;
    const currentTime = this.ac.currentTime;
    for (const [param, target] of [
      [this.exploreGain.gain, explore],
      [this.buses.battle.gain, battle],
    ]) {
      param.cancelScheduledValues(currentTime);
      param.setValueAtTime(param.value, currentTime);
      param.setTargetAtTime(engClamp(target, 0, 2), currentTime, Math.max(0.01, tau));
    }
  }
  setIndoor(amount, tone = 3200, tau = 0.8) {
    const ac = this.ac;
    if (!ac) return;
    const currentTime = ac.currentTime;
    const level = engClamp(Number(amount) || 0, 0, 1.5);
    if (level > 0.001 && !this.caveOn) {
      this.caveOn = true;
      this.buses.sfx.connect(this.caveSend);
      this.buses.amb.connect(this.caveSend);
    }
    if (level <= 0.001 && this.caveLevel > 0.001) this.caveZeroAt = currentTime;
    this.caveLevel = level;
    const sendGain = this.caveSend.gain;
    sendGain.cancelScheduledValues(currentTime);
    sendGain.setValueAtTime(sendGain.value, currentTime);
    sendGain.setTargetAtTime(level, currentTime, Math.max(0.01, tau));
    this.caveTone.frequency.setTargetAtTime(engClamp(tone, 300, 12000), currentTime, 0.3);
    const returnGain = this.outdoorReturn.gain;
    returnGain.cancelScheduledValues(currentTime);
    returnGain.setValueAtTime(returnGain.value, currentTime);
    returnGain.setTargetAtTime(0.9 * (1 - 0.8 * engClamp(level / 0.5, 0, 1)), currentTime, Math.max(0.01, tau));
  }
  tickIndoor() {
    if (!(!this.ac || !this.caveOn || this.caveLevel > 0.001) && !(this.ac.currentTime - this.caveZeroAt < 8)) {
      this.caveOn = false;
      try {
        this.buses.sfx.disconnect(this.caveSend);
        this.buses.amb.disconnect(this.caveSend);
      } catch {}
    }
  }
  get indoorLevel() {
    return this.caveLevel;
  }
  setFlightMix(level, tau = 1) {
    if (!this.ac) return;
    const gain = this.buses.flight.gain;
    const currentTime = this.ac.currentTime;
    gain.cancelScheduledValues(currentTime);
    gain.setValueAtTime(gain.value, currentTime);
    gain.setTargetAtTime(engClamp(level, 0, 2), currentTime, Math.max(0.01, tau));
  }
  get flightMix() {
    return this.ac ? this.buses.flight.gain.value : 0;
  }
  slowmo(dur) {
    if (!this.ac || this.world.paused) return;
    const currentTime = this.ac.currentTime;
    const frequency = this.worldFilter.frequency;
    const maxFreq = Math.min(20000, this.ac.sampleRate * 0.45);
    frequency.cancelScheduledValues(currentTime);
    frequency.setValueAtTime(frequency.value, currentTime);
    frequency.setTargetAtTime(1500, currentTime, 0.04);
    frequency.setTargetAtTime(this.world.wheel ? 1700 : maxFreq, currentTime + Math.max(0.1, dur), 0.25);
  }
  duckMusic(db, hold) {
    if (!this.ac) return;
    const gain = this.musicDuck.gain;
    const currentTime = this.ac.currentTime;
    gain.cancelScheduledValues(currentTime);
    gain.setValueAtTime(gain.value, currentTime);
    gain.setTargetAtTime(engDbToGain(-Math.abs(db)), currentTime, 0.15);
    gain.setTargetAtTime(1, currentTime + hold, 1.2);
  }
  updateListener(camera) {
    camera.updateMatrixWorld();
    const elements = camera.matrixWorld.elements;
    const x = elements[12];
    const y = elements[13];
    const z = elements[14];
    if (!Number.isFinite(x + y + z) || ((this.listener.x = x), (this.listener.y = y), (this.listener.z = z), !this.ac))
      return;
    const listener = this.ac.listener;
    const fx = -elements[8];
    const fy = -elements[9];
    const fz = -elements[10];
    if (listener.positionX) {
      listener.positionX.value = x;
      listener.positionY.value = y;
      listener.positionZ.value = z;
      listener.forwardX.value = fx;
      listener.forwardY.value = fy;
      listener.forwardZ.value = fz;
      listener.upX.value = elements[4];
      listener.upY.value = elements[5];
      listener.upZ.value = elements[6];
    } else {
      const legacy = listener;
      legacy.setPosition(x, y, z);
      legacy.setOrientation(fx, fy, fz, elements[4], elements[5], elements[6]);
    }
  }
  distanceTo(pos) {
    return Math.hypot(pos.x - this.listener.x, pos.y - this.listener.y, pos.z - this.listener.z);
  }
  play(id, options = {}) {
    const ac = this.ac;
    if (!ac || ac.state !== 'running') return null;
    const buffer = this.bank.get(id, options.variation);
    if (!buffer) return null;
    const rate = engClamp(options.rate ?? 1, 0.25, 4);
    const when = Math.max(ac.currentTime, options.when ?? 0);
    const level = Math.max(0, options.gain ?? 1);
    if (level < 0.0001) return null;
    let voice = null;
    let dist = 0;
    if (
      options.pos &&
      (!Number.isFinite(options.pos.x + options.pos.y + options.pos.z) ||
        ((dist = this.distanceTo(options.pos)), dist > (options.maxDist ?? 150)) ||
        ((voice = this.acquire(ac.currentTime, options.prio ?? 1)), !voice))
    )
      return null;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = ac.createGain();
    gain.gain.value = level;
    source.connect(gain);
    const end = when + buffer.duration / rate;
    let extras = [];
    if (voice) {
      const pos = options.pos;
      const panner = voice.panner;
      if (panner.positionX) {
        panner.positionX.value = pos.x;
        panner.positionY.value = pos.y;
        panner.positionZ.value = pos.z;
      } else panner.setPosition(pos.x, pos.y, pos.z);
      voice.filter.frequency.value = engClamp(
        20000 * Math.exp(-dist / 70),
        1400,
        Math.min(20000, ac.sampleRate * 0.45),
      );
      voice.wet.gain.value = (options.wet ?? 0.15) * (0.6 + 1 * engSmoothstep(4, 60, dist));
      gain.connect(voice.filter);
      voice.src = source;
      voice.g = gain;
      voice.end = end;
      voice.prio = options.prio ?? 1;
    } else {
      let out = gain;
      if (options.pan) {
        const panner = ac.createStereoPanner();
        panner.pan.value = engClamp(options.pan, -1, 1);
        gain.connect(panner);
        out = panner;
        extras.push(panner);
      }
      const bus = options.bus ?? 'sfx';
      out.connect(this.buses[bus]);
      if (options.wet && (bus === 'sfx' || bus === 'amb')) {
        const send = ac.createGain();
        send.gain.value = options.wet;
        out.connect(send).connect(this.outdoorIn);
        extras.push(send);
      }
    }
    this.active.set(id, (this.active.get(id) ?? 0) + 1);
    const handle = voice
      ? null
      : {
          src: source,
          g: gain,
        };
    if (handle) {
      let group = this.handles.get(id);
      if (!group) this.handles.set(id, (group = new Set()));
      group.add(handle);
    }
    source.onended = () => {
      this.active.set(id, Math.max(0, (this.active.get(id) ?? 1) - 1));
      if (handle) this.handles.get(id)?.delete(handle);
      try {
        gain.disconnect();
        for (const node of extras) node.disconnect();
      } catch {}
      extras = [];
      if (voice && voice.src === source) {
        voice.src = null;
        voice.g = null;
      }
    };
    source.start(when);
    return source;
  }
  fadeOut(id, tau = 0.25) {
    const group = this.handles.get(id);
    if (!group || !this.ac) return;
    const currentTime = this.ac.currentTime;
    for (const handle of group)
      try {
        handle.g.gain.cancelScheduledValues(currentTime);
        handle.g.gain.setTargetAtTime(0, currentTime, tau);
        handle.src.stop(currentTime + tau * 6);
      } catch {}
  }
  acquire(now, prio) {
    let victim = null;
    let best = Infinity;
    for (const voice of this.voices) {
      if (!voice.src || voice.end <= now) return voice;
      if (voice.prio > prio) continue;
      const score = voice.prio * 1000 + (voice.end - now);
      if (score < best) {
        best = score;
        victim = voice;
      }
    }
    if (victim && victim.src && victim.g) {
      try {
        victim.g.gain.cancelScheduledValues(now);
        victim.g.gain.setTargetAtTime(0, now, 0.012);
        victim.src.stop(now + 0.06);
      } catch {}
      victim.src = null;
      victim.g = null;
    }
    return victim;
  }
  voicesBusy() {
    const now = this.now;
    let count = 0;
    for (const voice of this.voices) if (voice.src && voice.end > now) count++;
    return count;
  }
  createLoop(id, opts) {
    const ac = this.ac;
    const buffer = this.bank.get(id, 0);
    if (!ac || !buffer) return null;
    try {
      return new SoundLoop(ac, buffer, this.buses[opts.bus ?? 'amb'], this.outdoorIn, opts);
    } catch (err) {
      console.warn('[audio] loop failed', id, err);
      return null;
    }
  }
  playNote(id, rate, when, level, pan, dur, opts) {
    const ac = this.ac;
    if (!ac) return;
    const buffer = this.bank.get(id, opts?.variation ?? 0);
    if (!buffer) return;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    const gain = ac.createGain();
    gain.gain.value = level;
    const panner = ac.createStereoPanner();
    panner.pan.value = engClamp(pan, -1, 1);
    source
      .connect(gain)
      .connect(panner)
      .connect(this.buses[opts?.bus ?? 'music']);
    const start = Math.max(ac.currentTime, when);
    source.start(start);
    if (dur && dur < buffer.duration / rate) {
      const release = opts?.release ?? 0.25;
      gain.gain.setValueAtTime(level, start + dur);
      gain.gain.setTargetAtTime(0, start + dur, release);
      source.stop(start + dur + release * 6);
    }
    source.onended = () => {
      try {
        gain.disconnect();
        panner.disconnect();
      } catch {}
    };
  }
  playPad(notes, when, dur, level, attack, release, cutoff = 1100, bus = 'music') {
    const ac = this.ac;
    if (!ac || !this.padWave || !notes.length) return;
    const start = Math.max(ac.currentTime, when);
    const gain = ac.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0, start);
    gain.gain.setTargetAtTime(level, start, attack / 3);
    gain.gain.setTargetAtTime(0, start + dur, release / 3);
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.4;
    filter.frequency.setValueAtTime(cutoff * 0.5, start);
    filter.frequency.setTargetAtTime(cutoff, start, attack / 2);
    filter.frequency.setTargetAtTime(cutoff * 0.6, start + dur, release / 2);
    filter.connect(gain).connect(this.buses[bus]);
    const end = start + dur + release * 2.2;
    const nodes = [gain, filter];
    const voiceGain = 1 / (notes.length * 2);
    notes.forEach((midi, index) => {
      const freq = 440 * 2 ** ((midi - 69) / 12);
      const panner = ac.createStereoPanner();
      panner.pan.value = notes.length > 1 ? (index / (notes.length - 1) - 0.5) * 0.7 : 0;
      const gain = ac.createGain();
      gain.gain.value = voiceGain;
      gain.connect(panner).connect(filter);
      nodes.push(panner, gain);
      for (const cents of [-7, 6]) {
        const osc = ac.createOscillator();
        osc.setPeriodicWave(this.padWave);
        osc.frequency.value = freq;
        osc.detune.value = cents;
        osc.connect(gain);
        osc.start(start);
        osc.stop(end);
        nodes.push(osc);
      }
    });
    const last = nodes[nodes.length - 1];
    last.onended = () => {
      for (const node of nodes)
        try {
          node.disconnect();
        } catch {}
    };
  }
  meter() {
    const ac = this.ac;
    if (!ac) return null;
    if (!this.analyser) {
      this.analyser = ac.createAnalyser();
      this.analyser.fftSize = 2048;
      this.limiter.connect(this.analyser);
      this.meterBuf = new Float32Array(this.analyser.fftSize);
    }
    const buf = this.meterBuf;
    this.analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    let sumSq = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i]);
      if (v > peak) peak = v;
      sumSq += v * v;
    }
    const toDb = (v) => 20 * Math.log10(Math.max(v, 0.000001));
    return {
      peakDb: toDb(peak),
      rmsDb: toDb(Math.sqrt(sumSq / buf.length)),
    };
  }
  dispose() {
    try {
      this.ac?.close();
    } catch {}
    this.ac = null;
  }
}
class SoundLoop {
  ac;
  src;
  gain;
  filter = null;
  panner = null;
  level = 0;
  freq = -1;
  rate = 1;
  pos = {
    x: NaN,
    y: NaN,
    z: NaN,
  };
  constructor(ac, buffer, bus, reverbIn, opts) {
    this.ac = ac;
    this.src = ac.createBufferSource();
    this.src.buffer = buffer;
    this.src.loop = true;
    this.gain = ac.createGain();
    this.gain.gain.value = 0;
    let tail = this.src;
    if (opts.filter) {
      this.filter = ac.createBiquadFilter();
      this.filter.type = opts.filter;
      this.filter.frequency.value = opts.freq ?? 1000;
      this.filter.Q.value = opts.q ?? 0.7;
      tail.connect(this.filter);
      tail = this.filter;
    }
    tail.connect(this.gain);
    tail = this.gain;
    if (opts.positional) {
      this.panner = ac.createPanner();
      this.panner.panningModel = 'equalpower';
      this.panner.distanceModel = 'inverse';
      this.panner.refDistance = 6;
      this.panner.rolloffFactor = 1;
      this.panner.maxDistance = 300;
      tail.connect(this.panner);
      tail = this.panner;
    }
    tail.connect(bus);
    if (opts.wet) {
      const send = ac.createGain();
      send.gain.value = opts.wet;
      tail.connect(send).connect(reverbIn);
    }
    this.src.start(ac.currentTime + 0.01, Math.random() * buffer.duration);
  }
  get current() {
    return this.level;
  }
  set(level, tau = 0.25) {
    const target = Number.isFinite(level) ? Math.max(0, level) : 0;
    if (!(Math.abs(target - this.level) < Math.max(0.0001, this.level * 0.015))) {
      this.level = target;
      this.gain.gain.setTargetAtTime(target, this.ac.currentTime, tau);
    }
  }
  setFreq(freq, tau = 0.2) {
    if (this.filter && Number.isFinite(freq))
      if (!(Math.abs(freq - this.freq) < this.freq * 0.01)) {
        this.freq = freq;
        this.filter.frequency.setTargetAtTime(engClamp(freq, 20, this.ac.sampleRate * 0.45), this.ac.currentTime, tau);
      }
  }
  setRate(rate, tau = 0.3) {
    if (!(!Number.isFinite(rate) || Math.abs(rate - this.rate) < 0.004)) {
      this.rate = rate;
      this.src.playbackRate.setTargetAtTime(engClamp(rate, 0.25, 4), this.ac.currentTime, tau);
    }
  }
  setPos(point, tau = 0.15) {
    const panner = this.panner;
    if (!panner || !Number.isFinite(point.x + point.y + point.z)) return;
    const pos = this.pos;
    if ((point.x - pos.x) ** 2 + (point.y - pos.y) ** 2 + (point.z - pos.z) ** 2 < 0.04) return;
    pos.x = point.x;
    pos.y = point.y;
    pos.z = point.z;
    const currentTime = this.ac.currentTime;
    if (panner.positionX) {
      panner.positionX.setTargetAtTime(point.x, currentTime, tau);
      panner.positionY.setTargetAtTime(point.y, currentTime, tau);
      panner.positionZ.setTargetAtTime(point.z, currentTime, tau);
    } else panner.setPosition(point.x, point.y, point.z);
  }
}
