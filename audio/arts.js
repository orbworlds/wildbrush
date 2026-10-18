/**
 * Brush art sounds: the charge hum for each colour and the ready ping, casts and impacts for fireball, ice lance, bounce orb and vine lash (rising in pitch on combos), and the fizzle when ink runs out.
 */
import { ARTS, COLORS, PALETTE } from '../core/config.js';
import { engDbToGain } from './engine.js';
import { warnOnce } from './sfx.js';
const artsClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const artsSemis = (semis) => 2 ** (semis / 12);
const artsRateVar = (semis) => artsSemis((Math.random() * 2 - 1) * semis);
const artsGainVar = (db) => engDbToGain((Math.random() * 2 - 1) * db);
const isValidPos = (pos) => !!pos && Number.isFinite(pos.x + pos.y + pos.z);
const ART_CAST_SOUNDS = {
  fireball: {
    id: 'art-cast-fireball',
    db: -8,
  },
  iceLance: {
    id: 'art-cast-icelance',
    db: -5,
  },
  bounceOrb: {
    id: 'art-cast-bounceorb',
    db: -9,
  },
  vineLash: {
    id: 'art-cast-vinelash',
    db: -4,
  },
};
const ART_HIT_SOUNDS = {
  fireball: {
    id: 'art-hit-fireball',
    db: -1,
  },
  iceLance: {
    id: 'art-hit-icelance',
    db: -6,
  },
  bounceOrb: {
    id: 'art-hit-bounceorb',
    db: -8,
  },
  vineLash: {
    id: 'art-hit-vinelash',
    db: -6,
  },
};
const ART_CHARGE_LOOPS = {
  red: [-13, 700, 6500],
  blue: [-15, 2500, 14000],
  yellow: [-14, 900, 5000],
  green: [-15, 1200, 9000],
};
const ORB_SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14];
const ART_COLOR = {
  fireball: 'red',
  iceLance: 'blue',
  bounceOrb: 'yellow',
  vineLash: 'green',
};
export class ArtsSfx {
  ctx;
  eng;
  loops = new Map();
  last = new Map();
  prevCharge = 0;
  prevColor = null;
  readyFor = null;
  chargedAt = -1000000000;
  dropAt = 0;
  castAt = -1000000000;
  fizzleAt = -1000000000;
  orbT = -1000000000;
  orbN = 0;
  lanceT = -1000000000;
  lanceN = 0;
  chargeOverride = null;
  constructor(ctx, eng) {
    this.ctx = ctx;
    this.eng = eng;
    const listen = (type, handler) =>
      ctx.events.on(type, (data) => {
        try {
          if (this.eng.running) handler(data);
        } catch (err) {
          warnOnce(`arts ${String(type)}`, err);
        }
      });
    listen('combat:art', (ev) => this.cast(ev.art, ev.color, ev.origin));
    listen('combat:art-impact', (ev) => this.impact(ev.art, ev.color, ev.position, !!ev.enemyHit));
    listen('paint:ink-empty', () => {
      if (this.now() - this.chargedAt < 0.3) this.fizzle();
    });
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
  heroPos() {
    const position = this.ctx.player?.state?.position;
    return isValidPos(position) ? position : null;
  }
  slow() {
    const scale = this.ctx.time?.scale ?? 1;
    return scale > 0 && scale < 1 ? 0.85 + 0.15 * scale : 1;
  }
  enoughInk(color) {
    try {
      const cost = (ARTS[color]?.ink ?? 0) * (this.ctx.player?.state?.brush === 'chroma' ? 0.5 : 1);
      const ink = Number(this.ctx.paint?.ink?.[color]);
      return !Number.isFinite(ink) || ink + 0.000001 >= cost;
    } catch {
      return true;
    }
  }
  cast(art, color, from) {
    const sound = ART_CAST_SOUNDS[art];
    if (!sound || !this.gate('cast', 0.08)) return;
    this.castAt = this.now();
    this.chargedAt = -1000000000;
    for (const loop of this.loops.values()) loop.set(0, 0.03);
    const pos = isValidPos(from) ? from : this.heroPos();
    this.eng.play(sound.id, {
      pos,
      gain: engDbToGain(sound.db) * artsGainVar(0.8),
      rate: artsRateVar(0.5) * this.slow(),
      wet: 0.15,
      prio: 7,
    });
    if (art === 'fireball') this.eng.duckMusic(2, 0.25);
  }
  impact(art, color, pos, enemyHit) {
    const sound = ART_HIT_SOUNDS[art];
    if (!sound || !isValidPos(pos)) return;
    const now = this.now();
    const slow = this.slow();
    let db = sound.db;
    let rate = artsRateVar(0.6) * slow;
    switch (art) {
      case 'fireball':
        if (!this.gate('imp-fireball', 0.06)) return;
        rate = artsRateVar(0.8) * slow;
        this.eng.duckMusic(enemyHit ? 5 : 4, 0.5);
        break;
      case 'iceLance':
        this.lanceN = now - this.lanceT < 0.35 ? this.lanceN + 1 : 0;
        this.lanceT = now;
        if (this.lanceN > 4 || !this.gate('imp-lance', 0.03)) return;
        db -= this.lanceN * 1.5;
        rate = artsSemis(this.lanceN * 1.5) * artsRateVar(0.4) * slow;
        break;
      case 'bounceOrb':
        this.orbN = now - this.orbT < 1.6 ? this.orbN + 1 : 0;
        this.orbT = now;
        if (!this.gate('imp-orb', 0.04)) return;
        rate = artsSemis(ORB_SCALE[Math.min(this.orbN, ORB_SCALE.length - 1)]) * slow;
        break;
      case 'vineLash':
        if (!this.gate('imp-vine', 0.08)) return;
    }
    const isFireball = art === 'fireball';
    this.eng.play(sound.id, {
      pos,
      gain: engDbToGain(db) * artsGainVar(0.8),
      rate,
      wet: isFireball ? 0.3 : 0.2,
      prio: isFireball ? 8 : 6,
      maxDist: isFireball ? 170 : 120,
    });
    if (enemyHit && this.gate(`heavy-${art}`, 0.05)) {
      const heavyColor = PALETTE[color] ? color : ART_COLOR[art];
      this.eng.play('art-heavy', {
        pos,
        gain: engDbToGain(isFireball ? -5 : -7) * artsGainVar(1),
        rate: artsRateVar(0.8) * slow,
        variation: Math.max(0, COLORS.indexOf(heavyColor)),
        when: this.eng.now + 0.008,
        wet: 0.15,
        prio: 6,
      });
    }
  }
  fizzle() {
    const now = this.now();
    if (!(now - this.castAt < 0.25 || now - this.fizzleAt < 0.4)) {
      this.fizzleAt = now;
      this.chargedAt = -1000000000;
      for (const loop of this.loops.values()) loop.set(0, 0.03);
      this.eng.play('art-fizzle', {
        pos: this.heroPos(),
        gain: engDbToGain(-9) * artsGainVar(1),
        rate: artsRateVar(0.8),
        wet: 0.08,
        prio: 5,
      });
    }
  }
  readyPing(color, hasInk) {
    if (this.gate('ready', 0.2))
      if (hasInk)
        this.eng.play('art-ready', {
          bus: 'sfx',
          gain: engDbToGain(-12),
          variation: Math.max(0, COLORS.indexOf(color)),
        });
      else
        this.eng.play('ink-empty', {
          bus: 'sfx',
          gain: engDbToGain(-15),
          rate: 0.85,
        });
  }
  update(dt) {
    if (!this.eng.running) return;
    const state = this.ctx.player?.state;
    let color = null;
    let charge = 0;
    const chargeOverride = this.chargeOverride;
    if (chargeOverride && PALETTE[chargeOverride.color]) {
      color = chargeOverride.color;
      charge = artsClamp(Number(chargeOverride.charge) || 0, 0, 1);
    } else if (state && PALETTE[state.selectedColor]) {
      color = state.selectedColor;
      const canCharge = (this.ctx.time?.scale ?? 1) > 0 && !!state.aiming && !state.dead;
      const artCharge = Number(state.artCharge);
      charge = canCharge && Number.isFinite(artCharge) ? artsClamp(artCharge, 0, 1) : 0;
    }
    const charging = !!color && charge > 0.02;
    if (charging && color && !this.loops.has(color) && this.eng.bank.has(`art-charge-${color}`)) {
      const loop = this.eng.createLoop(`art-charge-${color}`, {
        bus: 'sfx',
        filter: 'lowpass',
        freq: ART_CHARGE_LOOPS[color][1],
        q: 0.9,
      });
      if (loop) this.loops.set(color, loop);
    }
    const charged = charging && charge >= 0.4 - 0.0001;
    for (const [loopColor, loop] of this.loops)
      if (charging && loopColor === color) {
        const [db, f0, f1] = ART_CHARGE_LOOPS[loopColor];
        const amt = charge;
        loop.set(engDbToGain(db) * (0.3 + 0.55 * amt + (charged ? 0.15 : 0)), 0.05);
        loop.setRate(0.82 + 0.38 * amt + (charged ? 0.04 : 0), 0.06);
        loop.setFreq(f0 + (f1 - f0) * amt * amt, 0.05);
      } else loop.set(0, loopColor === this.prevColor && this.prevCharge > 0.02 ? 0.06 : 0.1);
    const now = this.now();
    if (charged && color) {
      this.chargedAt = now;
      if (this.readyFor !== color) {
        this.readyFor = color;
        this.readyPing(color, this.enoughInk(color));
      }
    } else if (charging) {
      if (charge < 0.4 - 0.05) this.readyFor = null;
    } else this.readyFor = null;
    if (this.prevCharge >= 0.4 - 0.0001 && !charging && this.prevColor && !this.enoughInk(this.prevColor))
      this.dropAt = now + 0.12;
    if (this.dropAt && now >= this.dropAt) {
      this.dropAt = 0;
      if (now - this.castAt > 0.3) this.fizzle();
    }
    this.prevCharge = charging ? charge : 0;
    this.prevColor = color;
  }
  stop() {
    for (const loop of this.loops.values()) loop.set(0, 0.03);
  }
}
