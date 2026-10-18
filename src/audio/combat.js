/**
 * Combat sounds: sword swings and flurries, hits coloured by the paint used, frozen foes shattering, enemy alerts, telegraphs, attacks, voices and footsteps, elite moves, the hero getting hurt or healed, pickups, lock-on, perfect dodges and the charge hum. It also starts and stops the battle music as fights begin and end.
 */
import { COLORS } from '../core/config.js';
import { engDbToGain } from './engine.js';
import { warnOnce } from './sfx.js';
const COLOR_HIT = {
  red: 'hit-ember',
  blue: 'hit-frost',
  yellow: 'hit-spring',
  green: 'hit-bloom',
};
const COLOR_HIT_DB = {
  red: -11,
  blue: -10,
  yellow: -12,
  green: -10,
};
const ENEMY_PITCH = {
  smudgeling: 1.1,
  spitter: 0.97,
  brute: 0.8,
};
const ELITE_MOVES = new Set(['charge', 'nova', 'spikes', 'volley', 'pound']);
const combatClamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const combatLerp = (a, b, k) => a + (b - a) * k;
const combatSemis = (semis) => 2 ** (semis / 12);
const combatRateVar = (semis) => combatSemis((Math.random() * 2 - 1) * semis);
const combatGainVar = (dbRange) => engDbToGain((Math.random() * 2 - 1) * dbRange);
const combatNum = (v, fallback) => (typeof v == 'number' && Number.isFinite(v) ? v : fallback);
const combatRand = (a, b) => a + (b - a) * Math.random();
export class CombatSfx {
  ctx;
  eng;
  battle;
  last = new Map();
  frozen = new Set();
  unfrozeAt = new Map();
  chargeLoop = null;
  chargeReady = false;
  scanT = 0;
  scanN = 0;
  tracked = new Map();
  lastRespawn = -1000000000;
  inCombat = false;
  sawStateEvent = false;
  stopAt = 0;
  pollT = 0;
  heavyUntil = 0;
  lastLock = null;
  quietHealUntil = 0;
  eliteColor = null;
  eliteUntil = 0;
  eliteStung = -1000000000;
  chargeOverride = null;
  constructor(ctx, eng, battle) {
    this.ctx = ctx;
    this.eng = eng;
    this.battle = battle;
    const on = (type, handler, always = false) =>
      ctx.events.on(type, (data) => {
        try {
          if (always || this.eng.running) handler(data);
        } catch (err) {
          warnOnce(`combat ${String(type)}`, err);
        }
      });
    on('combat:swing', (data) => this.swing(data.move, data.position));
    on('combat:hit', (data) => this.hit(data));
    on('enemy:alert', (data) => {
      try {
        const enemy = typeof data.id == 'number' ? ctx.enemies?.get?.(data.id) : undefined;
        if (enemy?.elite && !enemy.boss) this.markElite(enemy.elite.element, false);
      } catch {}
      this.alert(data.kind, data.position);
    });
    on('enemy:telegraph', (data) => {
      if (this.eliteMove(data.attack, 'wind', data.position, data.id))
        this.eng.play('telegraph', {
          pos: data.position,
          gain: engDbToGain(-8),
          rate: combatClamp(0.6 / combatClamp(combatNum(data.eta, 0.6), 0.15, 2), 0.7, 1.7),
          prio: 6,
          maxDist: 60,
        });
      else this.telegraph(data.kind, combatNum(data.eta, 0.6), data.position);
    });
    on('enemy:attack', (data) => {
      if (!this.eliteMove(data.attack, 'hit', data.position, data.id)) this.attack(data.kind, data.position);
    });
    on('enemy:status', (data) => this.status(data), true);
    on('enemy:death', (data) => this.death(data.id, data.kind, data.position, data.color), true);
    on('player:hurt', (data) => this.hurt(combatNum(data.amount, 0.5)));
    on('player:heal', (data) => this.heal(combatNum(data.amount, 0)));
    on('player:death', () => this.heroDeath(), true);
    on('player:respawn', () => (this.lastRespawn = this.now()), true);
    on('pickup', (data) => this.pickup(data.kind, data.position));
    on('combat:lock', (data) => this.lock(data.enemyId ?? null));
    on('combat:perfect-dodge', () => this.perfectDodge());
    on('combat:flurry', (data) => {
      if (data.active) this.flurry();
    });
    on(
      'combat:state',
      (data) => {
        this.sawStateEvent = true;
        this.setCombat(!!data.inCombat);
      },
      true,
    );
  }
  now() {
    return performance.now() / 1000;
  }
  gate(key, cooldown) {
    const now = this.now();
    if (now - (this.last.get(key) ?? -1000000000) < cooldown) {
      return false;
    } else {
      this.last.set(key, now);
      return true;
    }
  }
  playerPos() {
    return this.ctx.player?.state?.position ?? null;
  }
  slow() {
    const scale = this.ctx.time?.scale ?? 1;
    return scale > 0 && scale < 1 ? 0.85 + 0.15 * scale : 1;
  }
  swing(move, position) {
    const pos = position && Number.isFinite(position.x) ? position : this.playerPos();
    if (!pos) return;
    const isFlurry = move === 'flurry';
    if (!this.gate(isFlurry ? 'swing-f' : 'swing', isFlurry ? 0.03 : 0.06)) return;
    let id = 'swing-light';
    let level = -9;
    let rate = 1;
    switch (move) {
      case 'slash2':
        rate = 1.09;
        break;
      case 'slash3':
        id = 'swing-heavy';
        level = -7;
        break;
      case 'spin':
        id = 'swing-spin';
        level = -6;
        this.chargeReady = false;
        break;
      case 'jumpSlash':
        id = 'swing-dive';
        level = -7;
        break;
      case 'flurry':
        id = 'swing-flurry';
        level = -12;
        rate = 1.05;
    }
    this.eng.play(id, {
      pos,
      gain: engDbToGain(level) * combatGainVar(1),
      rate: rate * combatRateVar(isFlurry ? 2 : 0.8) * this.slow(),
      wet: 0.08,
      prio: 3,
    });
  }
  hurt(amount) {
    const pos = this.playerPos();
    if (!this.gate('hurt', 0.15)) return;
    const severity = combatClamp(amount / 1.5, 0.4, 1);
    this.eng.play('hero-hurt', {
      pos,
      gain: engDbToGain(combatLerp(-9, -5, severity)),
      rate: combatRateVar(0.6),
      wet: 0.1,
      prio: 7,
    });
    this.eng.duckMusic(combatLerp(3, 6, severity), 0.35);
  }
  eliteMove(attack, stage, position, enemyId) {
    if (!attack || !ELITE_MOVES.has(attack) || !position || !Number.isFinite(position.x)) return false;
    if (!this.gate(`el-${attack}-${stage}-${enemyId ?? 0}`, 0.12)) return true;
    let element = null;
    try {
      element = typeof enemyId == 'number' ? (this.ctx.enemies?.get?.(enemyId)?.elite?.element ?? null) : null;
    } catch {
      element = null;
    }
    const pos = {
      x: position.x,
      y: position.y + 1.2,
      z: position.z,
    };
    const heavy = attack === 'nova' || attack === 'charge' || attack === 'pound';
    this.eng.play(`el-${attack}${stage === 'wind' ? '-wind' : ''}`, {
      pos,
      gain: engDbToGain(stage === 'wind' ? -6 : heavy ? -2 : -4),
      rate: combatRateVar(0.6),
      prio: 7,
      wet: 0.2,
      maxDist: 120,
    });
    if (stage === 'hit') {
      if (heavy) this.eng.duckMusic(3, 0.4);
      const layer =
        element === 'red'
          ? 'fire-whoomp'
          : element === 'blue'
            ? 'ice-freeze'
            : element === 'yellow'
              ? 'bounce'
              : element === 'green'
                ? 'splat-bloom'
                : null;
      if (layer)
        this.eng.play(layer, {
          pos,
          gain: engDbToGain(-9),
          rate: combatRateVar(1) * (heavy ? 0.85 : 1),
          prio: 4,
          wet: 0.2,
          when: this.eng.now + 0.02,
        });
    }
    return true;
  }
  quietHeals(seconds) {
    this.quietHealUntil = this.now() + seconds;
  }
  markElite(eliteColor, sting) {
    if (
      !eliteColor ||
      !COLORS.includes(eliteColor) ||
      ((this.eliteColor = eliteColor),
      (this.eliteUntil = this.now() + 6),
      (this.heavyUntil = this.now() + 6),
      (this.battle.elite = eliteColor),
      (this.battle.heavy = true),
      !sting || !this.eng.running || !this.battle.enabled)
    )
      return;
    const now = this.eng.now;
    if (now - this.eliteStung < 10) return;
    this.eliteStung = now;
    const justStarted = this.battle.playing && now - this.battle.startedAt < 1.5;
    this.eng.play('bt-elite-sting', {
      bus: 'stinger',
      gain: engDbToGain(justStarted ? -9 : -7),
    });
    this.eng.duckMusic(4, 1.2);
  }
  heal(amount) {
    if (!(amount <= 0 || this.now() - this.lastRespawn < 2 || this.now() < this.quietHealUntil)) this.heartJingle(-11);
  }
  heartJingle(level) {
    if (this.gate('heart-jingle', 0.5)) {
      this.eng.play('pickup-heart', {
        bus: 'stinger',
        gain: engDbToGain(level),
      });
      this.eng.duckMusic(3, 0.8);
    }
  }
  heroDeath() {
    this.battle.kill();
    this.inCombat = false;
    this.stopAt = 0;
    this.chargeLoop?.set(0, 0.05);
    if (this.eng.running && this.gate('death', 2)) {
      this.eng.play('hero-death', {
        bus: 'stinger',
        gain: engDbToGain(-5),
      });
      this.eng.duckMusic(10, 4);
    }
  }
  pickup(kind, position) {
    if (kind === 'heart') this.heartJingle(-9);
    else {
      if (!this.gate('pickup-ink', 0.06)) return;
      const pos = position && Number.isFinite(position.x) ? position : this.playerPos();
      this.eng.play('pickup-ink', {
        pos,
        gain: engDbToGain(-10),
        rate: combatRateVar(1.5),
        prio: 3,
      });
    }
  }
  lock(target) {
    if (target === this.lastLock) return;
    const prev = this.lastLock;
    this.lastLock = target;
    if (this.gate('lock', 0.06))
      if (target === null)
        this.eng.play('lock-off', {
          bus: 'ui',
          gain: engDbToGain(-19),
        });
      else
        this.eng.play('lock-on', {
          bus: 'ui',
          gain: engDbToGain(prev === null ? -13 : -16),
          rate: prev === null ? 1 : 1.06,
        });
  }
  perfectDodge() {
    if (this.gate('perfect', 0.4)) {
      this.eng.play('perfect-dodge', {
        bus: 'stinger',
        gain: engDbToGain(-6),
      });
      this.eng.slowmo(0.9);
      this.eng.duckMusic(6, 0.9);
    }
  }
  flurry() {
    if (this.gate('flurry', 0.8))
      this.eng.play('flurry-run', {
        bus: 'stinger',
        gain: engDbToGain(-8),
      });
  }
  hit(data) {
    const position = data.position;
    if (!position || !Number.isFinite(position.x)) return;
    const now = this.now();
    const kind = data.kind;
    const pitch = ENEMY_PITCH[kind] ?? 1;
    if (data.source === 'fire') {
      if (this.gate(`burn-${data.enemyId}`, 0.35))
        this.eng.play('hit-ember', {
          pos: position,
          gain: engDbToGain(-17),
          rate: combatRateVar(2),
          prio: 1,
        });
      return;
    }
    if (!this.gate('hit', 0.02) || (this.eng.active.get('hit-thwack') ?? 0) > 4) return;
    const impact = combatClamp(combatNum(data.damage, 1) / 2, 0.35, 1.25);
    const isFlurry = data.source === 'flurry';
    const slow = this.slow();
    this.eng.play('hit-thwack', {
      pos: position,
      gain: engDbToGain(isFlurry ? -9 : combatLerp(-7, -3, combatClamp(impact, 0, 1))) * combatGainVar(1),
      rate:
        pitch * (isFlurry ? combatRand(1.02, 1.2) : combatRateVar(1)) * slow * (1.05 - 0.1 * combatClamp(impact, 0, 1)),
      wet: 0.12,
      prio: 5,
    });
    if (data.color && COLOR_HIT[data.color] && (this.eng.active.get(COLOR_HIT[data.color]) ?? 0) < 3)
      this.eng.play(COLOR_HIT[data.color], {
        pos: position,
        gain: engDbToGain(COLOR_HIT_DB[data.color] - (isFlurry ? 4 : 0)),
        rate: combatRateVar(1.2) * slow,
        when: this.eng.now + 0.01,
        wet: 0.18,
        prio: 3,
      });
    if (
      (this.frozen.has(data.enemyId) || now - (this.unfrozeAt.get(data.enemyId) ?? -1000000000) < 0.15) &&
      data.color !== 'blue' &&
      this.gate(`shatter-${data.enemyId}`, 0.5)
    ) {
      this.eng.play('hit-shatter', {
        pos: position,
        gain: engDbToGain(-4),
        rate: pitch * combatRateVar(0.8),
        wet: 0.25,
        prio: 7,
      });
      this.frozen.delete(data.enemyId);
    }
    if (data.killed) {
      this.eng.play('hit-heavy', {
        pos: position,
        gain: engDbToGain(kind === 'brute' ? -3 : -7),
        rate: pitch * combatRateVar(1) * slow,
        wet: 0.2,
        prio: 6,
      });
      this.battle.lastKill = this.eng.now;
    } else if (this.gate(`ouch-${data.enemyId}`, kind === 'brute' ? 0.7 : 0.25)) {
      const voice = this.voicePos(position, kind);
      if (kind === 'brute')
        this.eng.play('brute-growl', {
          pos: voice,
          gain: engDbToGain(-13),
          rate: combatRand(1.25, 1.45),
          prio: 2,
        });
      else
        this.eng.play('smudge-hurt', {
          pos: voice,
          gain: engDbToGain(-12),
          rate: (kind === 'spitter' ? 0.78 : 1) * combatRateVar(1.5),
          prio: 2,
        });
    }
  }
  voicePos(pos, kind) {
    return {
      x: pos.x,
      y: pos.y + (kind === 'brute' ? 2.2 : kind === 'spitter' ? 1.1 : 0.6),
      z: pos.z,
    };
  }
  alert(kind, position) {
    if (!position || !Number.isFinite(position.x)) return;
    const voice = this.voicePos(position, kind);
    if (kind === 'smudgeling')
      this.eng.play('smudge-squeal', {
        pos: voice,
        gain: engDbToGain(-9),
        rate: combatRateVar(1.5),
        prio: 4,
      });
    else if (kind === 'spitter')
      this.eng.play('spitter-hiss', {
        pos: voice,
        gain: engDbToGain(-9),
        rate: combatRateVar(1),
        prio: 4,
      });
    else
      this.eng.play('brute-growl', {
        pos: voice,
        gain: engDbToGain(-5),
        rate: combatRateVar(0.5),
        prio: 5,
        wet: 0.2,
      });
    const starting = !this.battle.playing || this.eng.now - this.battle.startedAt < 1.5;
    if (this.battle.enabled && !starting && this.gate('alert-sting', 3))
      this.eng.play('alert-sting', {
        bus: 'stinger',
        gain: engDbToGain(-15),
      });
    else if (!this.battle.enabled && this.gate('alert-sting', 3))
      this.eng.play('alert-sting', {
        bus: 'stinger',
        gain: engDbToGain(-10),
      });
    if (kind === 'brute') this.heavyUntil = this.now() + 4;
    if (!this.sawStateEvent) this.setCombat(true);
  }
  telegraph(kind, eta, position) {
    if (!position || !Number.isFinite(position.x)) return;
    const windup = combatClamp(eta, 0.15, 2);
    const voice = this.voicePos(position, kind);
    this.eng.play('telegraph', {
      pos: voice,
      gain: engDbToGain(kind === 'brute' ? -6 : -9),
      rate: combatClamp(0.6 / windup, 0.7, 1.7),
      prio: 6,
      maxDist: 60,
    });
    if (kind === 'smudgeling')
      this.eng.play('smudge-chitter', {
        pos: voice,
        gain: engDbToGain(-11),
        rate: 1.2 * combatRateVar(1),
        prio: 3,
      });
    else if (kind === 'spitter')
      this.eng.play('spitter-inflate', {
        pos: voice,
        gain: engDbToGain(-8),
        rate: combatClamp(0.8 / windup, 0.7, 1.6),
        prio: 4,
      });
    else
      this.eng.play('brute-windup', {
        pos: voice,
        gain: engDbToGain(-5),
        rate: combatClamp(1 / windup, 0.7, 1.6),
        prio: 5,
        wet: 0.2,
      });
  }
  attack(kind, position) {
    if (!position || !Number.isFinite(position.x)) return;
    const voice = this.voicePos(position, kind);
    if (kind === 'smudgeling')
      this.eng.play('smudge-lunge', {
        pos: voice,
        gain: engDbToGain(-9),
        rate: combatRateVar(1.5),
        prio: 4,
      });
    else if (kind === 'spitter')
      this.eng.play('spitter-spit', {
        pos: voice,
        gain: engDbToGain(-8),
        rate: combatRateVar(1.5),
        prio: 4,
      });
    else {
      this.eng.play('brute-slam', {
        pos: position,
        gain: engDbToGain(-2),
        rate: combatRateVar(0.8),
        prio: 7,
        wet: 0.25,
        maxDist: 200,
      });
      this.eng.duckMusic(3, 0.3);
    }
  }
  status(data) {
    if (data.status === 'frozen')
      if (data.on) this.frozen.add(data.id);
      else {
        this.frozen.delete(data.id);
        this.unfrozeAt.set(data.id, this.now());
      }
    if (!data.on || !this.eng.running || !data.position || !this.gate(`st-${data.status}`, 0.2)) return;
    const position = data.position;
    switch (data.status) {
      case 'burning':
        this.eng.play('fire-whoomp', {
          pos: position,
          gain: engDbToGain(-15),
          rate: combatRateVar(2) * 1.15,
          prio: 2,
        });
        break;
      case 'frozen':
        this.eng.play('ice-freeze', {
          pos: position,
          gain: engDbToGain(-12),
          rate: combatRateVar(1.5) * 1.1,
          wet: 0.2,
          prio: 3,
        });
        break;
      case 'launched':
        this.eng.play('bounce', {
          pos: position,
          gain: engDbToGain(-11),
          rate: combatRateVar(1) * 1.1,
          prio: 3,
        });
        break;
      case 'rooted':
        this.eng.play('splat-bloom', {
          pos: position,
          gain: engDbToGain(-11),
          rate: combatRateVar(1.5) * 0.85,
          prio: 3,
        });
    }
  }
  death(id, kind, position, color) {
    this.battle.lastKill = this.eng.now;
    this.tracked.delete(id);
    this.frozen.delete(id);
    if (!this.eng.running || !position || !Number.isFinite(position.x)) return;
    const variation = color ? Math.max(0, COLORS.indexOf(color)) : Math.floor(Math.random() * 4);
    this.eng.play('enemy-burst', {
      pos: {
        x: position.x,
        y: position.y + 0.8,
        z: position.z,
      },
      gain: engDbToGain(kind === 'brute' ? -3 : -6),
      rate: kind === 'brute' ? 0.84 : combatRateVar(0.3),
      variation,
      wet: 0.3,
      prio: 6,
    });
  }
  setCombat(combat) {
    if (combat) {
      this.stopAt = 0;
      if (!this.inCombat) {
        this.inCombat = true;
        this.battle.heavy = this.now() < this.heavyUntil;
        const elite = this.now() < this.eliteUntil ? this.eliteColor : null;
        this.battle.elite = elite;
        if (elite && this.battle.enabled) this.eliteStung = this.eng.now;
        this.battle.start(elite ? 'bt-elite-sting' : undefined);
      }
    } else if (this.inCombat && !this.stopAt) this.stopAt = this.now() + 1.1;
  }
  update(dt) {
    if (!this.eng.running) return;
    const now = this.now();
    const state = this.ctx.player?.state;
    const charge =
      this.chargeOverride ?? ((this.ctx.time?.scale ?? 1) > 0 ? combatClamp(combatNum(state?.charge, 0), 0, 1) : 0);
    if (charge > 0.02 && !this.chargeLoop && this.eng.bank.has('charge-hum'))
      this.chargeLoop = this.eng.createLoop('charge-hum', {
        bus: 'sfx',
        filter: 'lowpass',
        freq: 700,
        q: 0.8,
      });
    if (this.chargeLoop) {
      const audible = charge > 0.02 && !state?.dead;
      this.chargeLoop.set(audible ? engDbToGain(-15) * (0.35 + 0.65 * charge) : 0, audible ? 0.06 : 0.05);
      this.chargeLoop.setRate(0.82 + 0.5 * charge, 0.05);
      this.chargeLoop.setFreq(500 + 5500 * charge * charge, 0.05);
    }
    if (charge >= 0.999 && !this.chargeReady) {
      this.chargeReady = true;
      this.eng.play('charge-ready', {
        bus: 'sfx',
        gain: engDbToGain(-11),
      });
    } else if (charge < 0.5) this.chargeReady = false;
    if (this.stopAt && now >= this.stopAt) {
      this.stopAt = 0;
      this.inCombat = false;
      const won = this.eng.now - this.battle.lastKill < 2.5;
      this.battle.stop(won);
    }
    this.pollT -= dt;
    if (this.pollT <= 0 && ((this.pollT = 0.5), !this.sawStateEvent)) {
      const alerted = combatNum(this.ctx.enemies?.alertedCount, 0);
      this.setCombat(alerted > 0);
    }
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.12;
      this.scan(now);
    }
  }
  scan(now) {
    const position = this.ctx.player?.state?.position;
    if (!position || !Number.isFinite(position.x)) return;
    let enemies = [];
    try {
      enemies = this.ctx.enemies?.query?.(position, 42) ?? [];
    } catch {
      return;
    }
    this.scanN++;
    let bruteAlerted = false;
    let elite = null;
    for (const enemy of enemies) {
      if (!enemy || !enemy.alive || !enemy.position) continue;
      if (enemy.elite && enemy.alerted && !enemy.boss) elite = enemy.elite.element;
      const enemyPos = enemy.position;
      let track = this.tracked.get(enemy.id);
      if (!track) {
        track = {
          x: enemyPos.x,
          z: enemyPos.z,
          acc: 0,
          voiceAt: now + combatRand(1, 6),
          seen: this.scanN,
        };
        this.tracked.set(enemy.id, track);
      }
      const moved = Math.hypot(enemyPos.x - track.x, enemyPos.z - track.z);
      track.x = enemyPos.x;
      track.z = enemyPos.z;
      track.seen = this.scanN;
      if (moved < 3) track.acc += moved;
      const heroDist = Math.hypot(enemyPos.x - position.x, enemyPos.z - position.z);
      if (enemy.kind === 'brute') {
        if (enemy.alerted) bruteAlerted = true;
        if (track.acc > 1.8) {
          track.acc = 0;
          this.eng.play('brute-step', {
            pos: enemyPos,
            gain: engDbToGain(-10) * combatGainVar(1.5),
            rate: combatRateVar(1.2),
            prio: 2,
            wet: 0.12,
          });
        }
      } else if (track.acc > (enemy.kind === 'spitter' ? 1.3 : 0.95)) {
        track.acc = 0;
        if (heroDist < 20)
          this.eng.play('smudge-step', {
            pos: enemyPos,
            gain: engDbToGain(-19) * combatGainVar(2),
            rate: (enemy.kind === 'spitter' ? 0.8 : 1) * combatRateVar(2),
            prio: 0,
          });
      }
      if (now >= track.voiceAt) {
        const alerted = !!enemy.alerted;
        track.voiceAt =
          now + (enemy.kind === 'brute' ? combatRand(5, 9) : alerted ? combatRand(2, 4.5) : combatRand(5, 11));
        if (heroDist > (alerted ? 40 : 28) || enemy.telegraphing) continue;
        const voice = this.voicePos(enemyPos, enemy.kind);
        if (enemy.kind === 'smudgeling')
          this.eng.play('smudge-chitter', {
            pos: voice,
            gain: engDbToGain(alerted ? -13 : -17),
            rate: combatRateVar(2),
            prio: 1,
          });
        else if (enemy.kind === 'spitter')
          this.eng.play('spitter-hiss', {
            pos: voice,
            gain: engDbToGain(alerted ? -15 : -19),
            rate: combatRateVar(1.5) * 0.9,
            prio: 1,
          });
        else
          this.eng.play('brute-growl', {
            pos: voice,
            gain: engDbToGain(alerted ? -10 : -15),
            rate: combatRateVar(1),
            prio: 2,
            wet: 0.2,
          });
      }
    }
    for (const [id, track] of this.tracked) if (this.scanN - track.seen > 20) this.tracked.delete(id);
    if (bruteAlerted) this.heavyUntil = now + 3;
    if (elite) {
      this.eliteColor = elite;
      this.eliteUntil = Math.max(this.eliteUntil, now + 3);
      this.heavyUntil = Math.max(this.heavyUntil, now + 3);
    }
    this.battle.heavy = now < this.heavyUntil;
    this.battle.elite = now < this.eliteUntil ? this.eliteColor : null;
  }
}
