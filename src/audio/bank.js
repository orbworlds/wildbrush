/**
 * Sound bank: renders every recipe in the synth worker, or in short main-thread slices if the worker fails, turns the results into AudioBuffers once the AudioContext exists (rendering the reverb impulse responses at its sample rate) and hands out a random variation of a sound without repeating the last one.
 */
import { spawnModuleWorker } from '../core/spawn-worker.js';
import { RECIPES, renderSound } from './recipes.js';
const IR_IDS = new Set(['ir-outdoor', 'ir-hall', 'ir-cave']);
export class SoundBank {
  raw = new Map();
  bufs = new Map();
  lastVar = new Map();
  ac = null;
  worker = null;
  fallbackStarted = false;
  total = RECIPES.length;
  loaded = 0;
  done = false;
  errors = [];
  onLoaded = null;
  start(noWorker = false) {
    if (noWorker) {
      this.startFallback();
      return;
    }
    try {
      this.worker = spawnModuleWorker(new URL('./synth.worker.js', import.meta.url));
      this.worker.onmessage = (ev) => this.onMessage(ev.data);
      this.worker.onerror = (ev) => {
        this.errors.push(`worker error: ${ev.message}`);
        ev.preventDefault?.();
        this.startFallback();
      };
      this.worker.postMessage({
        type: 'render',
        skip: [...IR_IDS],
      });
    } catch (err) {
      this.errors.push(`worker unavailable: ${String(err)}`);
      this.startFallback();
    }
  }
  onMessage(msg) {
    if (msg.type === 'sound' && msg.sound) this.accept(msg.sound);
    else if (msg.type === 'error') this.errors.push(`${msg.id}: ${msg.message}`);
    else if (msg.type === 'done') {
      this.done = true;
      this.worker?.terminate();
      this.worker = null;
    }
  }
  startFallback() {
    if (this.fallbackStarted) return;
    this.fallbackStarted = true;
    try {
      this.worker?.terminate();
    } catch {}
    this.worker = null;
    const queue = RECIPES.filter(
      (recipe) => !this.raw.has(recipe.id) && !this.bufs.has(recipe.id) && !IR_IDS.has(recipe.id),
    );
    const pump = () => {
      const start = performance.now();
      for (; queue.length && performance.now() - start < 6;) {
        const recipe = queue.shift();
        try {
          this.accept(renderSound(recipe));
        } catch (err) {
          this.errors.push(`${recipe.id}: ${String(err)}`);
        }
      }
      if (queue.length) setTimeout(pump, 16);
      else this.done = true;
    };
    setTimeout(pump, 50);
  }
  accept(sound) {
    if (!(this.bufs.has(sound.id) || this.raw.has(sound.id))) {
      this.loaded++;
      if (this.ac) this.convert(sound);
      else this.raw.set(sound.id, sound);
      try {
        this.onLoaded?.(sound.id);
      } catch {}
    }
  }
  convert(sound) {
    const ac = this.ac;
    const buffers = [];
    for (const channels of sound.vars)
      try {
        const buffer = ac.createBuffer(channels.length, channels[0].length, sound.sr);
        channels.forEach((data, ch) => buffer.copyToChannel(data, ch));
        buffers.push(buffer);
      } catch (err) {
        this.errors.push(`${sound.id}: buffer ${String(err)}`);
      }
    if (buffers.length) this.bufs.set(sound.id, buffers);
  }
  attach(ac) {
    this.ac = ac;
    for (const sound of this.raw.values()) this.convert(sound);
    this.raw.clear();
    for (const id of IR_IDS) {
      const recipe = RECIPES.find((rec) => rec.id === id);
      if (recipe)
        try {
          this.convert(
            renderSound({
              ...recipe,
              sr: ac.sampleRate,
            }),
          );
          this.loaded++;
        } catch (err) {
          this.errors.push(`${id}: ${String(err)}`);
        }
    }
  }
  has(id) {
    return this.bufs.has(id);
  }
  get(id, variation) {
    const bufs = this.bufs.get(id);
    if (!bufs || !bufs.length) return null;
    if (variation !== undefined) return bufs[Math.abs(variation) % bufs.length];
    if (bufs.length === 1) return bufs[0];
    const last = this.lastVar.get(id) ?? -1;
    let index;
    if (last < 0) index = Math.floor(Math.random() * bufs.length);
    else {
      index = Math.floor(Math.random() * (bufs.length - 1));
      if (index >= last) index++;
    }
    this.lastVar.set(id, index);
    return bufs[index];
  }
}
