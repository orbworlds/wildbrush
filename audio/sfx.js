/**
 * Hero and world sound effects driven by game events: footsteps by surface, jumps, landings, bounces, glides, climbing and swim strokes, paint throws and splats, fire, ice and steam, prop impacts, and a heartbeat and heavy breathing when health or stamina run low. Also a warn-once logger for audio errors.
 */
import { engDbToGain } from './engine.js';
const STEP_SOUNDS = {
  grass: 'step-grass',
  dirt: 'step-dirt',
  path: 'step-path',
  sand: 'step-sand',
  rock: 'step-rock',
  snow: 'step-snow',
  water: 'step-water',
  ice: 'step-ice',
  wood: 'step-wood',
  stone: 'step-stone',
  paint: 'step-paint',
};
const SPLAT_SOUNDS = {
  red: 'splat-ember',
  blue: 'splat-frost',
  yellow: 'splat-spring',
  green: 'splat-bloom',
};
const THROW_SEMITONES = {
  red: 0,
  blue: 2,
  yellow: 4,
  green: 7,
};
const SPLAT_DB = {
  red: 0,
  blue: 0,
  yellow: -1.5,
  green: 3,
};
const IMPACT_SOUNDS = {
  crate: 'impact-crate',
  barrel: 'impact-barrel',
  boulder: 'impact-boulder',
  ball: 'impact-ball',
};
const sfxClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const sfxLerp = (a, b, t) => a + (b - a) * t;
const sfxSmoothstep = (edge0, edge1, x) => {
  const t = sfxClamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const sfxSemis = (semis) => 2 ** (semis / 12);
const sfxRateVar = (semis) => sfxSemis((Math.random() * 2 - 1) * semis);
const sfxGainVar = (db) => engDbToGain((Math.random() * 2 - 1) * db);
const sfxNum = (v, fallback) => (typeof v == 'number' && Number.isFinite(v) ? v : fallback);
export class Sfx {
  ctx;
  eng;
  last = new Map();
  realSteps = 0;
  stepDist = 0;
  foot = 'left';
  movingNoSteps = 0;
  swimTimer = 0.5;
  climbTimer = 0;
  heartTimer = 0;
  breathTimer = 0;
  lastBounce = -1;
  constructor(ctx, eng) {
    this.ctx = ctx;
    this.eng = eng;
    const listen = (type, handler) =>
      ctx.events.on(type, (data) => {
        try {
          if (this.eng.running) handler(data);
        } catch (err) {
          warnOnce(`sfx ${String(type)}`, err);
        }
      });
    listen('character:footstep', (ev) => {
      this.realSteps++;
      this.step(ev.surface, ev.position, sfxNum(ev.intensity, 0.6), ev.foot);
    });
    listen('player:jump', (ev) => this.jump(ev.position));
    listen('player:land', (ev) => this.land(ev.position, sfxNum(ev.impact, 4), ev.surface));
    listen('player:bounce', (ev) => this.bounce(ev.position, sfxNum(ev.strength, 12)));
    listen('player:mode', (ev) => this.mode(ev.from, ev.to));
    listen('player:exhausted', () => {
      this.breathTimer = 1.4;
      this.eng.play('breath-heavy', {
        pos: this.playerPos(),
        gain: engDbToGain(-12),
        rate: sfxRateVar(0.5),
      });
    });
    listen('player:respawn', () =>
      this.eng.play('st-respawn', {
        bus: 'stinger',
        gain: engDbToGain(-12),
      }),
    );
    listen('player:color', (ev) => this.color(ev.color));
    listen('paint:throw', (ev) => this.throwPaint(ev.origin, ev.color));
    listen('paint:splat', (ev) => this.splat(ev));
    listen('paint:ink-empty', () => this.inkEmpty());
    listen('fire:ignite', (ev) => this.fireIgnite(ev.position));
    listen('fire:extinguish', (ev) => {
      if (this.gate('fire-out', 0.3))
        this.eng.play('fire-out', {
          pos: ev.position,
          gain: engDbToGain(-12) * sfxGainVar(1.5),
          rate: sfxRateVar(1.5),
          wet: 0.2,
        });
    });
    listen('ice:freeze', (ev) => {
      if (this.gate('freeze', 0.25))
        this.eng.play('ice-freeze', {
          pos: ev.position,
          gain: engDbToGain(-8) * sfxGainVar(1),
          rate: sfxRateVar(1.5),
          wet: 0.25,
          prio: 2,
        });
    });
    listen('ice:melt', (ev) => {
      if (this.gate('melt', 0.4))
        this.eng.play('ice-melt', {
          pos: ev.position,
          gain: engDbToGain(-12),
          rate: sfxRateVar(2),
          wet: 0.25,
        });
    });
    listen('element:steam', (ev) => {
      if (this.gate('steam', 0.3))
        this.eng.play('steam', {
          pos: ev.position,
          gain: engDbToGain(-12) * sfxGainVar(1.5),
          rate: sfxRateVar(1.5),
          wet: 0.2,
        });
    });
    listen('prop:impact', (ev) => this.propImpact(ev.position, ev.kind, sfxNum(ev.strength, 3)));
  }
  now() {
    return performance.now() / 1000;
  }
  gate(key, interval) {
    const now = this.now();
    if (now - (this.last.get(key) ?? -1000000000) < interval) {
      return false;
    } else {
      this.last.set(key, now);
      return true;
    }
  }
  slowmo() {
    const scale = this.ctx.time?.scale ?? 1;
    return scale > 0 && scale < 1 ? 0.82 + 0.18 * scale : 1;
  }
  playerPos() {
    return this.ctx.player?.state?.position ?? null;
  }
  step(surface, pos, intensity, foot) {
    if (!this.gate(`step-${foot ?? 'x'}`, 0.07)) return;
    const level = sfxClamp(intensity, 0, 1.5);
    const id = STEP_SOUNDS[surface] ?? 'step-grass';
    const state = this.ctx.player?.state;
    if (state?.mode === 'climb') {
      this.eng.play('grab', {
        pos,
        gain: engDbToGain(-16) * (0.5 + level),
        rate: sfxRateVar(1.5),
        prio: 1,
      });
      this.eng.play(id, {
        pos,
        gain: engDbToGain(-20) * (0.5 + level),
        rate: sfxRateVar(2),
        prio: 0,
      });
      return;
    }
    const gain = engDbToGain(-12) * (0.35 + 0.65 * level) * sfxGainVar(1.5);
    this.eng.play(id, {
      pos,
      gain,
      rate: sfxRateVar(1.2) * this.slowmo(),
      wet: 0.08,
      prio: 1,
    });
    if (state) {
      if (state.paintUnderfoot && surface !== 'paint' && surface !== 'water')
        this.eng.play('step-paint', {
          pos,
          gain: gain * engDbToGain(-7),
          rate: sfxRateVar(1.5),
          prio: 0,
        });
      if (sfxNum(state.waterDepth, 0) > 0.12 && surface !== 'water')
        this.eng.play('step-water', {
          pos,
          gain: gain * engDbToGain(-3),
          rate: sfxRateVar(1.5),
          prio: 0,
        });
    }
  }
  jump(pos) {
    if (this.gate('jump', 0.08))
      this.eng.play('jump', {
        pos,
        gain: engDbToGain(-13) * sfxGainVar(1),
        rate: sfxRateVar(0.8) * this.slowmo(),
        wet: 0.08,
        prio: 2,
      });
  }
  land(pos, impact, surface) {
    if (!this.gate('land', 0.1)) return;
    if (surface === 'water') {
      if (this.gate('splash', 0.3)) {
        const force = sfxSmoothstep(2, 14, impact);
        this.eng.play(impact > 7 ? 'splash-big' : 'swim-stroke', {
          pos,
          gain: engDbToGain(sfxLerp(-16, -8, force)),
          rate: sfxRateVar(1),
          wet: 0.15,
          prio: 2,
        });
      }
      return;
    }
    if (impact < 2.5) {
      this.step(surface, pos, 0.8);
      return;
    }
    const force = sfxSmoothstep(2.5, 16, impact);
    const damp = this.now() - this.lastBounce < 0.15 ? 0.4 : 1;
    this.eng.play(force > 0.45 ? 'land-heavy' : 'land-soft', {
      pos,
      gain: engDbToGain(sfxLerp(-17, -7, force)) * damp,
      rate: sfxRateVar(1) * this.slowmo(),
      wet: 0.12,
      prio: 2,
    });
    this.last.delete('step-x');
    this.step(surface, pos, 0.9 + 0.5 * force);
  }
  bounce(pos, strength) {
    if (!this.gate('bounce', 0.08)) return;
    this.lastBounce = this.now();
    const force = sfxSmoothstep(6, 26, strength);
    this.eng.play('bounce', {
      pos,
      gain: engDbToGain(-9) * sfxLerp(0.75, 1, force),
      rate: (0.9 + 0.25 * force) * sfxRateVar(0.4),
      wet: 0.15,
      prio: 3,
    });
  }
  mode(from, to) {
    const pos = this.playerPos();
    if (pos) {
      if (to === 'glide')
        this.eng.play('glide-open', {
          pos,
          gain: engDbToGain(-11),
          rate: sfxRateVar(0.8),
          prio: 2,
        });
      else if (from === 'glide' && to !== 'swim')
        this.eng.play('glide-close', {
          pos,
          gain: engDbToGain(-15),
          rate: sfxRateVar(0.8),
          prio: 1,
        });
      if (to === 'climb' && from !== 'climb')
        this.eng.play('grab', {
          pos,
          gain: engDbToGain(-13),
          rate: sfxRateVar(1),
          prio: 2,
        });
      if (to === 'swim' && from !== 'swim' && this.gate('splash', 0.3)) {
        const fallSpeed = Math.abs(sfxNum(this.ctx.player?.state?.velocity?.y, 4));
        this.eng.play('splash-big', {
          pos,
          gain: engDbToGain(-10) * sfxLerp(0.45, 1, sfxSmoothstep(2, 12, fallSpeed)),
          rate: sfxRateVar(1),
          wet: 0.15,
          prio: 3,
        });
      }
      if (from === 'swim' && to === 'ground')
        this.eng.play('step-water', {
          pos,
          gain: engDbToGain(-13),
          rate: sfxRateVar(1),
        });
    }
  }
  color(color) {
    if (this.gate('color', 0.08))
      this.eng.play(`color-${color}`, {
        bus: 'ui',
        gain: engDbToGain(-19),
      });
  }
  throwPaint(pos, color) {
    if (this.gate('throw', 0.04))
      this.eng.play('throw', {
        pos,
        gain: engDbToGain(-11) * sfxGainVar(1),
        rate: sfxSemis(THROW_SEMITONES[color] ?? 0) * 0.94 * sfxRateVar(0.8) * this.slowmo(),
        wet: 0.08,
        prio: 2,
      });
  }
  splat(ev) {
    if (
      !ev?.position ||
      !this.gate('splat', 0.03) ||
      (this.eng.active.get('splat') ?? 0) + (this.eng.active.get('splash-paint') ?? 0) > 5
    )
      return;
    const radius = sfxNum(ev.radius, 1.5);
    const rate = sfxClamp(1.2 - (radius - 1) * 0.1, 0.75, 1.2) * sfxRateVar(1) * this.slowmo();
    const level = sfxClamp(0.65 + radius * 0.12, 0.65, 1.2);
    const position = ev.position;
    const when = this.eng.now + 0.012;
    if (ev.surface === 'water') {
      this.eng.play('splash-paint', {
        pos: position,
        gain: engDbToGain(-7) * level,
        rate,
        wet: 0.2,
        prio: 2,
      });
      if (ev.color === 'blue')
        this.eng.play('splat-frost', {
          pos: position,
          gain: engDbToGain(-15) * level,
          rate: sfxRateVar(1.5),
          when,
          wet: 0.25,
        });
      else if (ev.color === 'red')
        this.eng.play('fire-out', {
          pos: position,
          gain: engDbToGain(-18) * level,
          rate: sfxRateVar(1.5),
          when,
          wet: 0.2,
        });
      return;
    }
    this.eng.play('splat', {
      pos: position,
      gain: engDbToGain(-8) * level * sfxGainVar(1),
      rate,
      wet: 0.15,
      prio: 2,
    });
    const colorSplat = SPLAT_SOUNDS[ev.color];
    if (colorSplat && (this.eng.active.get(colorSplat) ?? 0) < 3)
      this.eng.play(colorSplat, {
        pos: position,
        gain: engDbToGain(-12 + (SPLAT_DB[ev.color] ?? 0)) * level * sfxGainVar(1.5),
        rate: sfxRateVar(1.5),
        when,
        wet: 0.2,
        prio: 1,
      });
  }
  inkEmpty() {
    if (this.gate('ink-empty', 0.25))
      this.eng.play('ink-empty', {
        pos: this.playerPos(),
        gain: engDbToGain(-13),
        rate: sfxRateVar(1),
      });
  }
  fireIgnite(pos) {
    if (!(!pos || this.eng.distanceTo(pos) > 90 || !this.gate('whoomp', 0.3)))
      this.eng.play('fire-whoomp', {
        pos,
        gain: engDbToGain(-8) * sfxGainVar(1.5),
        rate: sfxRateVar(2),
        wet: 0.25,
        prio: 2,
      });
  }
  propImpact(pos, kind, strength) {
    if (strength < 0.8) return;
    const id = IMPACT_SOUNDS[kind];
    if (!id || !this.gate(`prop-${kind}`, 0.06)) return;
    const force = sfxSmoothstep(0.8, 12, strength);
    this.eng.play(id, {
      pos,
      gain: engDbToGain(sfxLerp(-27, -8, force)),
      rate: sfxRateVar(1.5) * (1 + (1 - force) * 0.08),
      wet: 0.15,
      prio: 1,
    });
  }
  update(dt) {
    if (dt <= 0 || !this.eng.running) return;
    const state = this.ctx.player?.state;
    if (!state || !state.position) return;
    const speed = sfxNum(state.speed, 0);
    const walking = state.grounded && state.mode === 'ground' && speed > 0.8;
    if (walking && this.realSteps === 0) this.movingNoSteps += dt;
    const fakeSteps = this.ctx.character?.isStub === true || (this.realSteps === 0 && this.movingNoSteps > 6);
    if (fakeSteps && walking) {
      const stride = 0.45 + speed * 0.25;
      this.stepDist += speed * dt;
      if (this.stepDist >= stride) {
        this.stepDist = 0;
        this.foot = this.foot === 'left' ? 'right' : 'left';
        const surface = sfxNum(state.waterDepth, 0) > 0.25 ? 'water' : (state.surface ?? 'grass');
        this.step(surface, state.position, sfxClamp(speed / 7, 0.3, 1), this.foot);
      }
    } else this.stepDist = 0.4;
    if (state.mode === 'swim' && speed > 0.5) {
      this.swimTimer += dt;
      if (this.swimTimer > (state.sprinting ? 0.55 : 0.95)) {
        this.swimTimer = 0;
        this.eng.play('swim-stroke', {
          pos: state.position,
          gain: engDbToGain(state.sprinting ? -13 : -16),
          rate: sfxRateVar(1.2),
          wet: 0.1,
        });
      }
    } else this.swimTimer = 0.6;
    const climbInput = state.climbInput;
    if (
      fakeSteps &&
      state.mode === 'climb' &&
      climbInput &&
      climbInput.x * climbInput.x + climbInput.y * climbInput.y > 0.04
    ) {
      this.climbTimer += dt;
      if (this.climbTimer > (state.sprinting ? 0.28 : 0.42)) {
        this.climbTimer = 0;
        this.eng.play('grab', {
          pos: state.position,
          gain: engDbToGain(-21),
          rate: sfxRateVar(1.5),
        });
        if (Math.random() < 0.5)
          this.eng.play('step-rock', {
            pos: state.position,
            gain: engDbToGain(-26),
            rate: sfxRateVar(2),
          });
      }
    } else this.climbTimer = 0.3;
    const maxStamina = sfxNum(state.staminaMax, 1);
    const stamina = maxStamina > 0 ? sfxClamp(sfxNum(state.stamina, maxStamina) / maxStamina, 0, 1) : 1;
    const health = sfxNum(state.health, 5);
    const lowHealth = !state.dead && health > 0 && health <= 1;
    if (
      lowHealth ||
      state.exhausted ||
      (stamina < 0.3 && (state.mode === 'climb' || state.mode === 'glide' || state.mode === 'swim' || state.sprinting))
    ) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        let strain = state.exhausted || stamina < 0.3 ? 1 - sfxClamp(stamina / 0.3, 0, 1) : 0;
        if (lowHealth) strain = Math.max(strain, 0.55 + 0.45 * (1 - health));
        this.eng.play('heartbeat', {
          bus: 'sfx',
          gain: engDbToGain(lowHealth ? -13 : -15) * sfxLerp(0.55, 1, strain),
        });
        this.heartTimer = sfxLerp(0.95, 0.6, strain);
      }
    } else this.heartTimer = 0;
    if (state.exhausted) {
      this.breathTimer -= dt;
      if (this.breathTimer <= 0) {
        this.breathTimer = 1.5;
        this.eng.play('breath-heavy', {
          pos: state.position,
          gain: engDbToGain(-15),
          rate: sfxRateVar(0.6),
        });
      }
    }
  }
}
const warnedLabels = new Set();
export function warnOnce(label, err) {
  if (!warnedLabels.has(label)) {
    warnedLabels.add(label);
    console.warn(`[audio] ${label}:`, err);
  }
}
