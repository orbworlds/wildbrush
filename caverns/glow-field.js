/**
 * Live glow sources in the caverns (painted Ember and Frost, braziers, mushrooms, flashes): ranked and packed into shader uniforms each frame, with a few pooled point lights for the nearest.
 */
import { Color, PointLight, Vector3 } from 'three';
const EMBER_GLOW = new Color(1, 0.42, 0.13);
const FROST_GLOW = new Color(0.32, 0.6, 1);
const MAX_PAINT_GLOWS = 110;
export class GlowField {
  ctx;
  U;
  sources = [];
  nextId = 1;
  slots = [];
  sample = {
    red: 0,
    blue: 0,
    yellow: 0,
    green: 0,
  };
  tmp = new Vector3();
  ranked = [];
  lightCands = [];
  want = [];
  taken = new Set();
  checkCursor = 0;
  lightScale = 1;
  parked = false;
  constructor(ctx, U, lightCount) {
    this.ctx = ctx;
    this.U = U;
    for (let i = 0; i < lightCount; i++) {
      const light = new PointLight(0xffffff, 0, 10, 2);
      light.castShadow = false;
      light.position.set(0, -600, 0);
      light.name = `glowcap-light-${i}`;
      ctx.scene.add(light);
      this.slots.push({
        light,
        src: null,
        k: 0,
        want: null,
      });
    }
  }
  add(kind, pos, radius, color, target, options = {}) {
    const src = {
      id: this.nextId++,
      kind,
      pos: pos.clone(),
      nrm: options.nrm ? options.nrm.clone() : new Vector3(0, 1, 0),
      r: radius,
      color: color.clone(),
      i: options.i ?? 0,
      target,
      flash: options.flash ?? 0,
      flicker: options.flicker ?? 0,
      life: options.life ?? Infinity,
      checkAt: options.checkAt ?? Infinity,
      born: this.ctx.time.elapsed,
      dead: false,
      tag: options.tag,
      lightOnly: options.lightOnly,
    };
    this.sources.push(src);
    return src;
  }
  paintSplat(color, pos, nrm, radius) {
    const elapsed = this.ctx.time.elapsed;
    const isEmber = color === 'red';
    const mergeR = isEmber ? 1.7 : 2.2;
    let best = null;
    let bestD2 = mergeR * mergeR;
    for (const source of this.sources) {
      if (source.dead || source.kind !== (isEmber ? 'ember' : 'frost')) continue;
      const d2 = source.pos.distanceToSquared(pos);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = source;
      }
    }
    for (const source of this.sources)
      if ((source.kind === 'ember' || source.kind === 'frost') && source.pos.distanceToSquared(pos) < (radius + 1) ** 2)
        source.checkAt = Math.min(source.checkAt, elapsed + 0.25);
    if (best) {
      best.pos.lerp(pos, 0.3);
      best.nrm.lerp(nrm, 0.3).normalize();
      if (isEmber) {
        best.target = Math.min(1.7, best.target + 0.22);
        best.r = Math.min(7.5, best.r + 0.35);
        best.flash = Math.min(2.2, best.flash + 1.1);
      } else {
        best.target = Math.min(0.55, best.target + 0.08);
        best.flash = Math.min(0.6, best.flash + 0.3);
      }
      best.checkAt = elapsed + 1.5;
      return;
    }
    if (isEmber)
      this.add('ember', pos, 5.8, EMBER_GLOW, 1.05, {
        nrm,
        flash: 1.8,
        flicker: 0.8,
        checkAt: elapsed + 1.5,
      });
    else
      this.add('frost', pos, 3.6, FROST_GLOW, 0.32, {
        nrm,
        flash: 0.5,
        flicker: 0,
        checkAt: elapsed + 1.5,
      });
    let count = 0;
    for (const source of this.sources)
      if (!source.dead && (source.kind === 'ember' || source.kind === 'frost')) count++;
    if (count > MAX_PAINT_GLOWS) {
      const position = this.ctx.player?.state?.position;
      let victim = null;
      let worst = -Infinity;
      for (const source of this.sources) {
        if (source.dead || (source.kind !== 'ember' && source.kind !== 'frost')) continue;
        const score = (position ? source.pos.distanceTo(position) : 0) + (elapsed - source.born) * 0.05;
        if (score > worst) {
          worst = score;
          victim = source;
        }
      }
      if (victim) victim.target = 0;
    }
  }
  flash(pos, radius, color, strength, life) {
    this.add('fx', pos, radius, color, 0, {
      flash: strength,
      life,
      flicker: 0.5,
      i: 0,
    });
  }
  update(dt, active) {
    if (!active) {
      if (!this.parked) {
        this.parked = true;
        this.U.uGlowN.value = 0;
        for (const slot of this.slots) {
          slot.light.intensity = 0;
          slot.src = slot.want = null;
          slot.k = 0;
          slot.light.position.y = -600;
        }
      }
      return;
    }
    this.parked = false;
    const elapsed = this.ctx.time.elapsed;
    const step = Math.max(dt, 0);
    const sources = this.sources;
    for (let i = sources.length - 1; i >= 0; i--) {
      const src = sources[i];
      if (src.life !== Infinity) {
        src.life -= step;
        if (src.life <= 0) src.target = 0;
      }
      src.i += (src.target - src.i) * (1 - Math.exp(-(src.target > src.i ? 9 : 2.2) * step));
      src.flash *= Math.exp(-(src.kind === 'fx' ? 2.2 : 3.2) * step);
      if (src.target <= 0 && src.i < 0.01 && src.flash < 0.01) {
        src.dead = true;
        sources.splice(i, 1);
      }
    }
    let checks = 0;
    const len = sources.length;
    for (let i = 0; i < len && checks < 4; i++) {
      this.checkCursor = (this.checkCursor + 1) % len;
      const src = sources[this.checkCursor];
      if (!(!src || (src.kind !== 'ember' && src.kind !== 'frost') || src.target <= 0 || elapsed < src.checkAt)) {
        checks++;
        src.checkAt = elapsed + 1.2 + Math.random() * 0.6;
        try {
          this.tmp.copy(src.pos).addScaledVector(src.nrm, -0.06);
          const here = this.ctx.paint.sample(this.tmp, this.sample);
          if ((src.kind === 'ember' ? here.red : here.blue) < 0.18) {
            let found = false;
            for (let j = 0; j < 4 && !found; j++) {
              const ang = (j / 4) * Math.PI * 2;
              this.tmp
                .set(src.pos.x + Math.cos(ang) * 0.8, src.pos.y, src.pos.z + Math.sin(ang) * 0.8)
                .addScaledVector(src.nrm, -0.06);
              const there = this.ctx.paint.sample(this.tmp, this.sample);
              if ((src.kind === 'ember' ? there.red : there.blue) > 0.25) found = true;
            }
            if (!found) src.target = 0;
          }
        } catch {}
      }
    }
    const position = this.ctx.camera.position;
    const ranked = this.ranked;
    ranked.length = 0;
    const lightCands = this.lightCands;
    lightCands.length = 0;
    const focus = this.ctx.player?.state?.position ?? position;
    for (const src of sources) {
      const level = src.i + src.flash;
      if (level < 0.01 || (src.pos.distanceToSquared(focus) < (src.r + 7) ** 2 && lightCands.push(src), src.lightOnly))
        continue;
      const dist = src.pos.distanceTo(position);
      if (!(dist - src.r > 42)) {
        src._score = (level * src.r) / (1 + Math.max(0, dist - src.r) * 0.25);
        ranked.push(src);
      }
    }
    ranked.sort((a, b) => b._score - a._score);
    const uGlowP = this.U.uGlowP.value;
    const uGlowC = this.U.uGlowC.value;
    const count = Math.min(24, ranked.length);
    for (let i = 0; i < count; i++) {
      const src = ranked[i];
      const level = src.i + src.flash;
      uGlowP[i * 4] = src.pos.x + src.nrm.x * 0.35;
      uGlowP[i * 4 + 1] = src.pos.y + src.nrm.y * 0.35;
      uGlowP[i * 4 + 2] = src.pos.z + src.nrm.z * 0.35;
      uGlowP[i * 4 + 3] = src.r * (0.85 + 0.15 * Math.min(1.5, level));
      uGlowC[i * 4] = src.color.r * level;
      uGlowC[i * 4 + 1] = src.color.g * level;
      uGlowC[i * 4 + 2] = src.color.b * level;
      uGlowC[i * 4 + 3] = src.flicker;
    }
    this.U.uGlowN.value = count;
    this.updateLights(step);
  }
  updateLights(dt) {
    const focus = this.ctx.player?.state?.position ?? this.ctx.camera.position;
    const want = this.want;
    want.length = 0;
    const lightCands = this.lightCands;
    for (const src of lightCands) {
      const dist = src.pos.distanceTo(focus);
      const level = src.i + src.flash;
      src._lv = dist > src.r + 7 ? -1 : (level * src.r) / (1 + dist * dist * 0.08);
    }
    lightCands.sort((a, b) => b._lv - a._lv);
    for (let i = 0; i < Math.min(this.slots.length, lightCands.length); i++)
      if (lightCands[i]._lv > 0) want.push(lightCands[i]);
    const taken = this.taken;
    taken.clear();
    for (const slot of this.slots)
      if (slot.src && want.includes(slot.src)) {
        slot.want = slot.src;
        taken.add(slot.src);
      } else slot.want = null;
    for (const src of want) {
      if (taken.has(src)) continue;
      const free = this.slots.find((slot) => !slot.want);
      if (!free) break;
      free.want = src;
      taken.add(src);
    }
    for (const slot of this.slots) {
      if (slot.src === slot.want) {
        if (slot.src) {
          slot.k = Math.min(1, slot.k + dt * 3);
          this.place(slot);
        }
      } else {
        slot.k = Math.max(0, slot.k - dt * 5);
        if (slot.k <= 0) {
          slot.src = slot.want;
          if (slot.src) this.place(slot);
        }
      }
      const src = slot.src;
      if (!src || src.dead) {
        slot.light.intensity = 0;
        if (src?.dead) slot.src = null;
        continue;
      }
      const level = src.i + src.flash;
      const flick =
        src.flicker > 0
          ? 1 +
            src.flicker *
              (Math.sin(this.ctx.time.elapsed * 13 + src.id) * 0.08 +
                Math.sin(this.ctx.time.elapsed * 31 + src.id * 2.3) * 0.05)
          : 1;
      slot.light.color.copy(src.color);
      slot.light.intensity = level * 14 * slot.k * flick * this.lightScale;
      slot.light.distance = src.r * 1.9;
    }
  }
  place(slot) {
    const src = slot.src;
    if (src) slot.light.position.copy(src.pos).addScaledVector(src.nrm, 0.7);
  }
  clearPaint() {
    for (const source of this.sources) if (source.kind === 'ember' || source.kind === 'frost') source.target = 0;
  }
  dispose() {
    for (const slot of this.slots) this.ctx.scene.remove(slot.light);
  }
}
