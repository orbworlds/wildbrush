/**
 * Elite Hoarders: per-enemy elemental state and the controller for their charge, slam, backhand, volley, spikes, nova, pound and lunge attacks, fire patches, rings and eruptions, auras, death burst and the heart container they drop.
 */
import { Color, Group, Vector3 } from 'three';
import { COLORS, PALETTE } from '../core/config.js';
import { clamp } from '../core/math.js';
import { ATTACKS, COUNTER_COLOR, ELITE, eliteStyle, eliteTune, SKY_ELITES, STATUS_BY_COLOR } from './defs.js';
import { COLUMN_MODE, EliteColumns } from './elite-columns.js';
import { EliteHearts } from './elite-hearts.js';
import { EliteSpikes, SPIKE_KIND } from './elite-spikes.js';
import { CH } from './enemy.js';
import { FX_INK, paletteColor } from './fx.js';
import { BONE } from './models.js';
import { partToWorld } from './rig-transforms.js';
import { SKY_ATTACKS, SkyEliteState, SkyMoves } from './sky-elites.js';
import { STORM_VIOLET, STORM_WHITE } from './stormborne.js';
const eliteRand = (min, max) => min + Math.random() * (max - min);
const eliteWrapAngle = (angle) => {
  for (; angle > Math.PI;) angle -= Math.PI * 2;
  for (; angle < -Math.PI;) angle += Math.PI * 2;
  return angle;
};
const ringEase = (t) => 1 - (1 - clamp(t, 0, 1)) ** 2.4;
const _elitePos = new Vector3();
const _eliteVec = new Vector3();
const _eliteDir = new Vector3();
const _elementColor = new Color();
const _mixColor = new Color();
const ELITE_WHITE = new Color(1, 1, 1);
const EMBER_ORANGE = new Color(1, 0.55, 0.18);
const FLAME_ORANGE = new Color(1, 0.42, 0.08);
const FROST_BLUE = new Color(0.7, 0.92, 1);
const ELITE_SMOKE = new Color(0x3a3740);
const ELITE_DUST = new Color(0xb9ad95);
class EliteState {
  element;
  counter;
  name;
  color = new Color();
  tune;
  surge = 0;
  absorb = 0;
  weak = 0;
  deathDur = ELITE.deathDur;
  recoverT = 0;
  chargeCd = 2.5;
  spikeCd = 2;
  novaCd = 0;
  hopT = 0;
  auraT = 0;
  dripT = 0;
  trailT = 0;
  stepT = 0;
  dyingT = 0;
  implode = false;
  lastTrail = new Vector3(1000000000, 0, 0);
  dir = new Vector3(0, 0, 1);
  target = new Vector3();
  locked = false;
  shots = 0;
  bounces = 0;
  flight = 1;
  hitDone = false;
  travelled = 0;
  maxT = 1;
  side = 1;
  arenaId = null;
  style;
  sky = new SkyEliteState();
  constructor(elite, kind, style = 'hoarder') {
    this.element = elite.element;
    this.style = style;
    this.counter = style === 'thornmother' ? SKY_ELITES.thornmother.counter : COUNTER_COLOR[elite.element];
    this.name = elite.name;
    this.tune = eliteTune(kind, style);
    paletteColor(elite.element, this.color);
  }
}
export class Elites {
  ctx;
  d;
  spikes;
  columns;
  heartMeshes;
  hearts = [];
  group = new Group();
  onDefeated = null;
  skyMoves;
  rings = [];
  patches = [];
  eruptions = [];
  igniteTokens = 3;
  constructor(ctx, director) {
    this.ctx = ctx;
    this.d = director;
    this.spikes = new EliteSpikes(ctx, 72);
    this.columns = new EliteColumns(ctx, 12);
    this.heartMeshes = new EliteHearts(ctx, 4);
    this.group.name = 'elites';
    this.group.add(this.spikes.mesh, this.columns.mesh, this.heartMeshes.mesh);
    for (let i = 0; i < 10; i++)
      this.rings.push({
        active: false,
        element: 'red',
        color: new Color(),
        storm: false,
        ownerId: -1,
        x: 0,
        y: 0,
        z: 0,
        r0: 0,
        r1: 0,
        life: 1,
        t: 0,
        prevR: 0,
        w: 0.5,
        damage: 1,
        kb: 6,
        hit: false,
        ignited: false,
        source: 'enemy',
      });
    for (let i = 0; i < 48; i++)
      this.patches.push({
        active: false,
        element: 'red',
        ownerId: -1,
        pos: new Vector3(),
        r: 0.5,
        t: 0,
        life: 1,
        damage: 0.5,
        seed: 0,
      });
    for (let i = 0; i < 6; i++)
      this.eruptions.push({
        active: false,
        element: 'blue',
        ownerId: -1,
        pos: new Vector3(),
        r: 2,
        eta: 1,
        fxT: 0,
        damage: 1,
        source: 'spitter',
        kind: 'spitter',
      });
    this.skyMoves = new SkyMoves(ctx, director, this);
  }
  init(enemy, spec) {
    const element = PALETTE[spec.element] ? spec.element : 'red';
    const eliteName = typeof spec.name == 'string' && spec.name ? spec.name : `${PALETTE[element].name} Hoarder`;
    enemy.elite = {
      name: eliteName,
      element,
    };
    enemy.ex = new EliteState(enemy.elite, enemy.kind, eliteStyle(enemy.kind, eliteName));
    enemy.scale = enemy.ex.tune.scale;
    enemy.orbitRadius =
      enemy.kind === 'spitter' ? eliteRand(10, 12.5) : enemy.kind === 'brute' ? eliteRand(5.6, 6.8) : eliteRand(6, 8);
    enemy.cooldown = eliteRand(0.6, 1.2);
  }
  statusScale(enemy, effect) {
    const ex = enemy.ex;
    return ex
      ? effect === STATUS_BY_COLOR[ex.element]
        ? 0
        : effect === STATUS_BY_COLOR[ex.counter]
          ? ELITE.weakStatus
          : ELITE.offStatus
      : 1;
  }
  engage(enemy, dt, dist) {
    const d = this.d;
    const ex = enemy.ex;
    const def = enemy.def;
    if (ex.style === 'thornmother') return this.skyMoves.engageThorn(enemy, dt, dist);
    if (ex.style === 'galecaller') return this.skyMoves.engageGale(enemy, dt, dist);
    const pPos = d.pPos;
    const off = Math.abs(
      eliteWrapAngle(Math.atan2(pPos.x - enemy.position.x, pPos.z - enemy.position.z) - enemy.facing),
    );
    if (enemy.kind === 'brute') {
      ex.chargeCd -= dt;
      if (enemy.token) {
        if (ex.chargeCd <= 0 && dist > 7.5 && dist < ATTACKS.charge.range && enemy.canSee && off < 0.45) {
          d.startTelegraph(enemy, 'charge', dist);
          return;
        }
        if (dist > 4.5) {
          d.steerTo(enemy, pPos.x, pPos.z, def.runSpeed, 0.5);
          if (enemy.tokenWait > 4.5) d.releaseToken(enemy);
        } else if (off < 0.5) d.startTelegraph(enemy, dist < 3.4 && Math.random() < 0.45 ? 'backhand' : 'slam', dist);
        return;
      }
      if (dist > 10) d.steerTo(enemy, pPos.x, pPos.z, def.walkSpeed * 1.6, 1);
      else d.orbit(enemy, dt, enemy.orbitRadius, 0.3, def.walkSpeed);
      if (enemy.cooldown <= 0 && dist < 17) d.requestToken(enemy);
      return;
    }
    if (enemy.kind === 'spitter') {
      ex.spikeCd -= dt;
      ex.novaCd -= dt;
      if (dist < 5.4) {
        if (ex.novaCd <= 0) {
          if (enemy.token) {
            d.startTelegraph(enemy, 'nova', dist);
            return;
          }
          d.requestToken(enemy);
        }
        const angle =
          Math.atan2(enemy.position.x - pPos.x, enemy.position.z - pPos.z) +
          Math.sin(d.time * 1.3 + enemy.seed * 10) * 0.7;
        enemy.desired.set(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(def.runSpeed * 1.3);
        enemy.speedCap = def.runSpeed * 1.35;
        return;
      }
      if (enemy.token) {
        if (enemy.canSee && dist >= ATTACKS.volley.minRange && dist <= ATTACKS.volley.maxRange) {
          if (ex.spikeCd <= 0 && dist > 6 && Math.random() < 0.55) d.startTelegraph(enemy, 'spikes', dist);
          else d.startTelegraph(enemy, 'volley', dist);
          return;
        }
        if (enemy.tokenWait > 2.5) d.releaseToken(enemy);
      }
      const lost = d.time - enemy.lastSeenT > 1.2;
      if (dist > 15 || lost) d.steerTo(enemy, pPos.x, pPos.z, lost ? def.walkSpeed * 1.6 : def.runSpeed * 0.8, 1);
      else d.orbit(enemy, dt, enemy.orbitRadius, 0.45, def.walkSpeed * 1.4);
      if (enemy.cooldown <= 0 && enemy.canSee && dist >= ATTACKS.volley.minRange && dist <= ATTACKS.volley.maxRange)
        d.requestToken(enemy);
      return;
    }
    ex.hopT -= dt;
    if (enemy.token) {
      if (dist > 4.2 && dist < ATTACKS.pound.range && enemy.canSee) {
        d.startTelegraph(enemy, 'pound', dist);
        return;
      }
      if (dist <= 4.2) {
        if (off < 0.7) d.startTelegraph(enemy, 'lunge', dist);
        else enemy.faceTarget = Math.atan2(pPos.x - enemy.position.x, pPos.z - enemy.position.z);
        return;
      }
      d.steerTo(enemy, pPos.x, pPos.z, def.runSpeed, 1);
      if (enemy.tokenWait > 3) d.releaseToken(enemy);
    } else {
      if (dist > 11) d.steerTo(enemy, pPos.x, pPos.z, def.runSpeed, 1);
      else d.orbit(enemy, dt, enemy.orbitRadius, 1.1, def.runSpeed * 0.6);
      if (enemy.cooldown <= 0 && dist < 14) d.requestToken(enemy);
    }
    const speed = Math.hypot(enemy.vel.x, enemy.vel.z);
    if (enemy.grounded && ex.hopT <= 0 && speed > 0.8 && enemy.airLock <= 0) {
      ex.hopT = eliteRand(0.45, 0.8);
      enemy.vel.y = eliteRand(4.6, 6.2);
      enemy.grounded = false;
      enemy.airLock = 0.12;
      enemy.anim.kick(CH.SQUASH, 4);
    }
  }
  windupOf(enemy, attack) {
    return ATTACKS[attack].windup * (enemy.ex ? enemy.ex.tune.telegraphMul : 1);
  }
  etaOf(enemy, attack, dist) {
    const windup = this.windupOf(enemy, attack);
    if (SKY_ATTACKS.has(attack)) return this.skyMoves.etaOf(enemy, attack, dist, windup);
    switch (attack) {
      case 'charge':
        return windup + Math.max(0, dist - enemy.radius - 0.6) / ATTACKS.charge.speed;
      case 'volley':
        return windup + clamp(dist / 12, 0.8, 1.3);
      case 'pound':
        return windup + this.poundFlight(0, dist);
      case 'lunge':
        return windup + ATTACKS.lunge.strike;
      default:
        return windup + ATTACKS[attack].strike;
    }
  }
  onTelegraph(enemy, attack) {
    const ex = enemy.ex;
    ex.locked = false;
    ex.shots = 0;
    ex.bounces = 0;
    ex.hitDone = false;
    ex.travelled = 0;
    ex.recoverT = 0;
    ex.surge = Math.max(ex.surge, 0.4);
    const d = this.d;
    if (SKY_ATTACKS.has(attack)) {
      this.skyMoves.onTelegraph(enemy, attack);
      return;
    }
    if (attack === 'nova') {
      ex.novaCd = eliteRand(5, 7);
      d.fx.marker(
        _elitePos.copy(enemy.position),
        ATTACKS.nova.radius,
        enemy.windup + ATTACKS.nova.strike,
        ex.color,
        2.2,
      );
    } else if (attack === 'spikes') ex.spikeCd = eliteRand(6, 8.5);
    else if (attack === 'charge') ex.chargeCd = eliteRand(6, 9);
  }
  telegraph(enemy, dt, dist, angle) {
    const d = this.d;
    const ex = enemy.ex;
    const attack = enemy.attack;
    if (SKY_ATTACKS.has(attack)) {
      this.skyMoves.telegraph(enemy, dt, dist, angle);
      return;
    }
    const windup = enemy.windup;
    const stateT = enemy.stateT;
    if (
      stateT <
      windup *
        (attack === 'slam'
          ? 0.7
          : attack === 'backhand'
            ? 0.6
            : attack === 'charge'
              ? 0.72
              : attack === 'lunge' || attack === 'pound'
                ? 0.85
                : 1)
    )
      enemy.faceTarget = angle;
    ex.surge = Math.max(ex.surge, 0.3 + 0.7 * clamp(stateT / windup, 0, 1));
    const fwdX = Math.sin(enemy.facing);
    const fwdZ = Math.cos(enemy.facing);
    switch (attack) {
      case 'slam':
        if (!ex.locked && stateT >= windup * 0.7) {
          ex.locked = true;
          const reach = ATTACKS.slam.reach * enemy.scale;
          const x = enemy.position.x + fwdX * reach;
          const z = enemy.position.z + fwdZ * reach;
          d.fx.marker(
            _elitePos.set(x, d.fxFloor(x, z, enemy.position.y), z),
            3.8,
            Math.max(0.05, windup - stateT + ATTACKS.slam.strike),
            ex.color,
            2,
          );
        }
        break;
      case 'charge':
        if (!ex.locked && stateT >= windup * 0.72) {
          ex.locked = true;
          const pPos = d.pPos;
          const dx = pPos.x + d.pVel.x * 0.25 - enemy.position.x;
          const dz = pPos.z + d.pVel.z * 0.25 - enemy.position.z;
          const len = Math.hypot(dx, dz) || 1;
          ex.dir.set(dx / len, 0, dz / len);
          const laneLen = clamp(len + 5, 7, ATTACKS.charge.speed * ATTACKS.charge.maxT);
          ex.maxT = laneLen / ATTACKS.charge.speed;
          const remain = windup - stateT;
          for (let along = 3; along <= laneLen; along += 3) {
            const x = enemy.position.x + ex.dir.x * along;
            const z = enemy.position.z + ex.dir.z * along;
            d.fx.marker(
              _elitePos.set(x, d.fxFloor(x, z, enemy.position.y), z),
              enemy.radius + 0.5,
              remain + along / ATTACKS.charge.speed,
              ex.color,
              1.6,
            );
          }
        }
        if (ex.locked) enemy.faceTarget = Math.atan2(ex.dir.x, ex.dir.z);
        if (Math.random() < dt * 12) {
          _elitePos.set(
            enemy.position.x - fwdX * enemy.radius,
            enemy.position.y + 0.1,
            enemy.position.z - fwdZ * enemy.radius,
          );
          d.fx.dust(_elitePos, 1, 0.3, 0.5 * enemy.scale, ELITE_DUST, 0.45);
          if (ex.element === 'red') d.fx.sparks(_elitePos, FLAME_ORANGE, 3, 3, 3, 0.07, 5);
        }
        break;
      case 'spikes': {
        const pPos = d.pPos;
        if (!ex.locked && stateT < windup * 0.55) {
          if (Math.random() < dt * 14) {
            const angle = Math.random() * Math.PI * 2;
            const dist = ATTACKS.spikes.radius * Math.sqrt(Math.random());
            const x = pPos.x + Math.cos(angle) * dist;
            const z = pPos.z + Math.sin(angle) * dist;
            d.fx.sparks(
              _elitePos.set(x, d.fxFloor(x, z, pPos.y) + 0.1, z),
              this.elColor(ex.element, _elementColor),
              2,
              1.2,
              3,
              0.08,
              -2,
            );
          }
        } else if (!ex.locked) {
          ex.locked = true;
          const x = pPos.x + d.pVel.x * 0.3;
          const z = pPos.z + d.pVel.z * 0.3;
          const eta = Math.max(0.1, windup - stateT + ATTACKS.spikes.strike);
          this.addEruption(enemy, _elitePos.set(x, d.fxFloor(x, z, pPos.y), z), ATTACKS.spikes.radius, eta);
        }
        break;
      }
      case 'nova':
        if (Math.random() < dt * 30) {
          const angle = Math.random() * Math.PI * 2;
          const dist = ATTACKS.nova.radius * eliteRand(0.7, 1.1);
          _elitePos.set(
            enemy.position.x + Math.cos(angle) * dist,
            enemy.position.y + eliteRand(0.2, 1.6),
            enemy.position.z + Math.sin(angle) * dist,
          );
          d.fx.glows.spawn(
            d.time,
            _elitePos.x,
            _elitePos.y,
            _elitePos.z,
            -Math.cos(angle) * dist * 2.2,
            eliteRand(-0.5, 0.5),
            -Math.sin(angle) * dist * 2.2,
            eliteRand(0.06, 0.12),
            0.4,
            this.elColor(ex.element, _elementColor),
            3,
            0,
            2.2,
            1.5,
          );
        }
        break;
      case 'volley':
        if (Math.random() < dt * 10) {
          const rig = d.models.spitter.rig;
          partToWorld(enemy, rig, BONE.mask, rig.mouth, _elitePos);
          d.fx.sparks(_elitePos, this.elColor(ex.element, _elementColor), 2, 1.5, 3, 0.07, -1);
        }
        break;
      case 'pound':
      case 'lunge':
        if (attack === 'lunge') enemy.desired.set(-fwdX, 0, -fwdZ).multiplyScalar(0.5);
        if (Math.random() < dt * 10)
          d.fx.sparks(enemy.position, this.elColor(ex.element, _elementColor), 2, 2, 3, 0.07, 4);
    }
    if (attack === 'charge' && ex.locked) {
      const eta = this.laneEta(enemy, windup - stateT);
      enemy.telegraphing = eta < Infinity;
      enemy.attackEta = eta < Infinity ? eta : 0;
    } else if (attack === 'spikes' && ex.locked) {
      const eruption = this.eruptions.find((eruption) => eruption.active && eruption.ownerId === enemy.id);
      if (eruption) enemy.attackEta = eruption.eta;
    } else enemy.attackEta = Math.max(0, this.etaOf(enemy, attack, dist) - stateT);
    if (stateT >= windup) this.startAttack(enemy, dist);
  }
  startAttack(enemy, dist) {
    const d = this.d;
    const ex = enemy.ex;
    const attack = enemy.attack;
    d.setState(enemy, 'attack');
    enemy.attackHit = false;
    enemy.attackFired = false;
    ex.hitDone = false;
    const fwdX = Math.sin(enemy.facing);
    const fwdZ = Math.cos(enemy.facing);
    switch (attack) {
      case 'charge':
        if (!ex.locked) {
          ex.dir.set(fwdX, 0, fwdZ);
          ex.maxT = clamp(dist + 5, 7, 14) / ATTACKS.charge.speed;
        }
        ex.travelled = 0;
        ex.stepT = 0;
        enemy.speedCap = ATTACKS.charge.speed + 1;
        enemy.vel.x = ex.dir.x * ATTACKS.charge.speed * 0.6;
        enemy.vel.z = ex.dir.z * ATTACKS.charge.speed * 0.6;
        d.fx.dust(enemy.position, 8, enemy.radius * 1.4, 0.8 * enemy.scale);
        d.emit('camera:shake', {
          strength: 0.25,
          position: enemy.position.clone(),
        });
        d.emit('enemy:attack', {
          id: enemy.id,
          kind: enemy.kind,
          position: enemy.position.clone(),
          attack,
        });
        break;
      case 'pound':
        ex.bounces = 0;
        this.leap(enemy, 0);
        d.emit('enemy:attack', {
          id: enemy.id,
          kind: enemy.kind,
          position: enemy.position.clone(),
          attack,
        });
        break;
      case 'lunge': {
        const speed = clamp((dist - 0.7 * enemy.scale) / 0.3, 4, 13);
        enemy.vel.x = fwdX * speed;
        enemy.vel.z = fwdZ * speed;
        enemy.vel.y = 4.5;
        enemy.grounded = false;
        enemy.airLock = 0.12;
        enemy.ballistic = true;
        enemy.speedCap = speed + 1;
        enemy.attackEta = ATTACKS.lunge.strike;
        enemy.anim.kick(CH.SQUASH, 5);
        d.fx.dust(enemy.position, 4, 0.5, 0.5 * enemy.scale);
        d.emit('enemy:attack', {
          id: enemy.id,
          kind: enemy.kind,
          position: enemy.position.clone(),
          attack,
        });
        break;
      }
      case 'volley':
        ex.shots = 0;
        enemy.attackEta = 0;
        break;
      default:
        enemy.attackEta = ATTACKS[attack].strike;
    }
  }
  attack(enemy, dt, dist, angle) {
    const d2 = this.d;
    const ex = enemy.ex;
    const attack = enemy.attack;
    if (SKY_ATTACKS.has(attack)) {
      this.skyMoves.attack(enemy, dt, dist);
      return;
    }
    const stateT = enemy.stateT;
    const fwdX = Math.sin(enemy.facing);
    const fwdZ = Math.cos(enemy.facing);
    switch (attack) {
      case 'slam': {
        const slam = ATTACKS.slam;
        if (!enemy.attackFired && stateT >= slam.strike) {
          enemy.attackFired = true;
          enemy.telegraphing = false;
          const reach = slam.reach * enemy.scale;
          const x = enemy.position.x + fwdX * reach;
          const z = enemy.position.z + fwdZ * reach;
          const floorY = d2.fxFloor(x, z, enemy.position.y);
          const center = _elitePos.set(x, floorY, z);
          this.elColor(ex.element, _elementColor);
          d2.fx.shockwave(center, 3.8, _elementColor);
          d2.fx.dust(center, 14, 2, 1.1);
          d2.fx.inkSplash(_eliteVec.copy(center).setY(floorY + 0.2), null, 24, 7, 0.1);
          d2.fx.paintSplash(_eliteVec, ex.element, 26, 7, 0.1);
          d2.fx.sparks(_eliteVec, _elementColor, 24, 7, 3.5, 0.1, 6);
          d2.emit('camera:shake', {
            strength: 1,
            position: center.clone(),
          });
          d2.emit('enemy:attack', {
            id: enemy.id,
            kind: enemy.kind,
            position: center.clone(),
            attack,
          });
          const dx = d2.pPos.x - x;
          const dz = d2.pPos.z - z;
          const dist = Math.hypot(dx, dz);
          if (
            dist <= 3.8 &&
            d2.pPos.y - d2.fxFloor(d2.pPos.x, d2.pPos.z, d2.pPos.y) < 0.9 &&
            Math.abs(d2.pPos.y - floorY) < 2.2
          )
            d2.hurtPlayer(
              enemy,
              slam.damage,
              dist > 0.05 ? _eliteDir.set(dx / dist, 0, dz / dist) : _eliteDir.set(fwdX, 0, fwdZ),
              slam.knockback,
            );
          this.addRing(enemy, center, 1.4, 11.5, 1.2, 1, 6);
          if (ex.element !== 'red') this.paintPatch(ex.element, center, 2.2);
          enemy.anim.kick(CH.SQUASH, -3);
          ex.surge = 1.4;
        }
        if (stateT >= slam.strike + 0.2) d2.setState(enemy, 'recover');
        break;
      }
      case 'backhand': {
        const backhand = ATTACKS.backhand;
        if (!enemy.attackFired && stateT >= backhand.strike) {
          enemy.attackFired = true;
          enemy.telegraphing = false;
          d2.emit('enemy:attack', {
            id: enemy.id,
            kind: enemy.kind,
            position: enemy.position.clone(),
            attack,
          });
          const dx = d2.pPos.x - enemy.position.x;
          const dz = d2.pPos.z - enemy.position.z;
          const dist = Math.hypot(dx, dz);
          const dot = dist > 0.01 ? (dx * fwdX + dz * fwdZ) / dist : 1;
          if (
            dist <= backhand.range * 1.35 &&
            dot >= backhand.arc - 0.1 &&
            Math.abs(d2.pPos.y - enemy.position.y) < 3
          ) {
            const sideX = -Math.cos(enemy.facing);
            const sideZ = Math.sin(enemy.facing);
            const dir = _eliteDir
              .set(dx / Math.max(dist, 0.01) + sideX * 0.8, 0, dz / Math.max(dist, 0.01) + sideZ * 0.8)
              .normalize();
            d2.hurtPlayer(enemy, backhand.damage, dir, backhand.knockback);
          }
          const rig = d2.models.brute.rig;
          const fist = partToWorld(enemy, rig, BONE.handR, rig.fists[1], _elitePos);
          d2.fx.inkSplash(fist, _eliteVec.set(-Math.cos(enemy.facing), 0.2, Math.sin(enemy.facing)), 12, 6, 0.08);
          d2.fx.paintSplash(fist, ex.element, 16, 6, 0.09);
          d2.fx.sparks(fist, this.elColor(ex.element, _elementColor), 16, 6, 3.5, 0.09, 4);
          ex.surge = 1;
        }
        if (stateT >= backhand.strike + 0.22) d2.setState(enemy, 'recover');
        break;
      }
      case 'charge':
        this.doCharge(enemy, dt, stateT);
        break;
      case 'volley': {
        const volley = ATTACKS.volley;
        for (; ex.shots < volley.count && stateT >= ex.shots * volley.gap;) {
          this.fireGlob(enemy, ex.shots, dist);
          ex.shots++;
        }
        if (stateT >= volley.gap * (volley.count - 1) + 0.25) d2.setState(enemy, 'recover');
        break;
      }
      case 'spikes':
        enemy.telegraphing = false;
        if (stateT >= ATTACKS.spikes.strike) d2.setState(enemy, 'recover');
        break;
      case 'nova': {
        const nova = ATTACKS.nova;
        if (!enemy.attackFired && stateT >= nova.strike) {
          enemy.attackFired = true;
          enemy.telegraphing = false;
          this.nova(enemy);
        }
        if (stateT >= nova.strike + 0.25) d2.setState(enemy, 'recover');
        break;
      }
      case 'pound':
        enemy.faceTarget = Math.atan2(enemy.vel.x, enemy.vel.z);
        enemy.telegraphing = true;
        enemy.attackEta = Math.max(0, ex.flight - stateT);
        if (stateT > ex.flight + 1.2) this.poundImpact(enemy);
        break;
      case 'lunge': {
        const lunge = ATTACKS.lunge;
        if (!enemy.attackHit && stateT >= lunge.strike * 0.4 && stateT <= lunge.strike + lunge.active + 0.1) {
          _elitePos.set(
            enemy.position.x + fwdX * 0.45 * enemy.scale,
            enemy.position.y + 0.45 * enemy.scale,
            enemy.position.z + fwdZ * 0.45 * enemy.scale,
          );
          if (d2.touchesPlayer(_elitePos, lunge.reach * 0.7 * enemy.scale)) {
            enemy.attackHit = true;
            d2.hurtPlayer(enemy, 1, _eliteVec.set(fwdX, 0, fwdZ), 9);
          }
        }
        if (stateT > lunge.strike + lunge.active) enemy.telegraphing = false;
        if ((stateT > 0.2 && enemy.grounded) || stateT > 0.9) {
          enemy.telegraphing = false;
          enemy.ballistic = false;
          enemy.vel.x *= 0.3;
          enemy.vel.z *= 0.3;
          enemy.anim.kick(CH.SQUASH, -4);
          d2.fx.dust(enemy.position, 4, 0.6, 0.5 * enemy.scale);
          this.paintPatch(ex.element, enemy.position, 1.2);
          d2.setState(enemy, 'recover');
        }
        break;
      }
      default:
        d2.setState(enemy, 'recover');
    }
  }
  doCharge(enemy, dt, stateT) {
    const d2 = this.d;
    const ex = enemy.ex;
    const charge = ATTACKS.charge;
    const ramp = Math.min(1, 0.6 + stateT * 3);
    const speed = charge.speed * ramp;
    enemy.speedCap = charge.speed + 1;
    enemy.desired.set(ex.dir.x * speed, 0, ex.dir.z * speed);
    enemy.vel.x = ex.dir.x * speed;
    enemy.vel.z = ex.dir.z * speed;
    enemy.faceTarget = Math.atan2(ex.dir.x, ex.dir.z);
    const actual = Math.hypot(enemy.actualVel.x, enemy.actualVel.z);
    ex.travelled += actual * dt;
    ex.stepT -= dt;
    if (ex.stepT <= 0 && enemy.grounded) {
      ex.stepT = 0.1;
      ex.side = -ex.side;
      const ox = Math.cos(enemy.facing) * ex.side * enemy.radius * 0.45;
      const oz = -Math.sin(enemy.facing) * ex.side * enemy.radius * 0.45;
      _elitePos.set(enemy.position.x + ox, enemy.position.y, enemy.position.z + oz);
      this.addPatch(enemy, _elitePos, 0.6, 2.6, 0.5);
      d2.fx.dust(_elitePos, 1, 0.3, 0.6, ELITE_DUST, 0.5);
    }
    if (
      !ex.hitDone &&
      (_elitePos.set(
        enemy.position.x + ex.dir.x * enemy.radius * 0.8,
        enemy.position.y + enemy.height * 0.35,
        enemy.position.z + ex.dir.z * enemy.radius * 0.8,
      ),
      d2.touchesPlayer(_elitePos, enemy.radius * 0.95))
    ) {
      ex.hitDone = true;
      const dx = d2.pPos.x - enemy.position.x;
      const dz = d2.pPos.z - enemy.position.z;
      const side = dx * -ex.dir.z + dz * ex.dir.x > 0 ? 1 : -1;
      const dir = _eliteVec.set(ex.dir.x - ex.dir.z * side * 0.7, 0, ex.dir.z + ex.dir.x * side * 0.7).normalize();
      if (d2.hurtPlayer(enemy, charge.damage, dir, charge.knockback))
        d2.emit('camera:shake', {
          strength: 0.7,
          position: enemy.position.clone(),
        });
    }
    const eta = ex.hitDone ? Infinity : this.laneEta(enemy, 0);
    enemy.telegraphing = eta < Infinity;
    enemy.attackEta = eta < Infinity ? eta : 0;
    if (stateT > 0.3 && actual < speed * 0.3) {
      enemy.telegraphing = false;
      enemy.speedCap = 0;
      d2.fx.dust(enemy.position, 12, enemy.radius * 1.5, 1.1 * enemy.scale);
      d2.fx.sparks(
        _elitePos.copy(enemy.position).setY(enemy.position.y + enemy.height * 0.6),
        this.elColor(ex.element, _elementColor),
        20,
        6,
        3,
        0.09,
        5,
      );
      d2.emit('camera:shake', {
        strength: 0.7,
        position: enemy.position.clone(),
      });
      enemy.anim.kick(CH.SQUASH, -5);
      enemy.anim.kick(CH.LEAN_X, -6);
      d2.releaseToken(enemy);
      enemy.cooldown = Math.max(enemy.cooldown, 1.2);
      d2.setState(enemy, 'stagger');
      enemy.hurtT = 1.5;
      return;
    }
    const aheadX = enemy.position.x + ex.dir.x * (enemy.radius + 1.6);
    const aheadZ = enemy.position.z + ex.dir.z * (enemy.radius + 1.6);
    const blocked =
      d2.waterDepth(aheadX, aheadZ, enemy.position.y) > 0.3 ||
      d2.fxFloor(aheadX, aheadZ, enemy.position.y) < enemy.position.y - 2.2;
    if (stateT >= ex.maxT || blocked) {
      enemy.telegraphing = false;
      ex.recoverT = charge.recover;
      if (blocked) enemy.vel.x = enemy.vel.z = 0;
      enemy.vel.x *= 0.45;
      enemy.vel.z *= 0.45;
      d2.fx.dust(enemy.position, 8, enemy.radius, 0.9 * enemy.scale);
      d2.setState(enemy, 'recover');
    }
  }
  laneEta(enemy, delay) {
    const d = this.d;
    const ex = enemy.ex;
    if (!d.pAlive) return Infinity;
    const dx = d.pPos.x - enemy.position.x;
    const dz = d.pPos.z - enemy.position.z;
    const along = dx * ex.dir.x + dz * ex.dir.z;
    const across = Math.abs(dx * ex.dir.z - dz * ex.dir.x);
    return along < 0 || across > enemy.radius + 1.3 || along > ATTACKS.charge.speed * (ex.maxT + 0.1)
      ? Infinity
      : delay + Math.max(0, along - enemy.radius - 0.4) / ATTACKS.charge.speed;
  }
  fireGlob(enemy, shot, dist) {
    const d2 = this.d;
    const ex = enemy.ex;
    const rig = d2.models.spitter.rig;
    const mouth = partToWorld(enemy, rig, BONE.mask, rig.mouth, new Vector3());
    const flight = clamp(dist / 12, 0.8, 1.3) + shot * 0.06;
    const pPos = d2.pPos;
    const dx = pPos.x - enemy.position.x;
    const dz = pPos.z - enemy.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const side = shot === 0 ? 0 : shot === 1 ? -1 : 1;
    const lead = shot === 0 ? 0.35 : 0.7;
    const tx = pPos.x + d2.pVel.x * flight * lead + (-dz / len) * side * 2.1;
    const tz = pPos.z + d2.pVel.z * flight * lead + (dx / len) * side * 2.1;
    const target = _elitePos.set(tx, d2.fxFloor(tx, tz, pPos.y), tz);
    if (d2.globs.fire(mouth, target, flight, enemy.id, ex.element)) {
      enemy.telegraphing = true;
      enemy.attackEta = flight;
    }
    enemy.anim.kick(CH.MASK_PUSH, 1.5);
    d2.fx.sparks(mouth, this.elColor(ex.element, _elementColor), 8, 3, 3, 0.07, 1);
    d2.emit('enemy:attack', {
      id: enemy.id,
      kind: enemy.kind,
      position: enemy.position.clone(),
      attack: 'volley',
    });
  }
  nova(enemy) {
    const d = this.d;
    const ex = enemy.ex;
    const nova = ATTACKS.nova;
    const position = enemy.position;
    this.elColor(ex.element, _elementColor);
    d.fx.waves.spawn(
      d.time,
      position.x,
      d.fxFloor(position.x, position.z, position.y),
      position.z,
      0.5,
      nova.radius + 0.4,
      0.45,
      2.2,
      _elementColor,
      2.4,
    );
    d.fx.ring(position, 0.5, nova.radius + 0.4, 0.5, _elementColor, 3);
    d.fx.sparks(_elitePos.copy(position).setY(position.y + enemy.height * 0.5), _elementColor, 30, 9, 3.5, 0.1, 2);
    if (ex.element === 'blue') d.fx.iceShatter(_elitePos, _eliteVec.set(0, 0, 0), 1.6);
    d.fx.paintSplash(_elitePos, ex.element, 30, 7, 0.1);
    const spikeKind = SPIKE_KIND[ex.element];
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + eliteRand(-0.15, 0.15);
      const dist = eliteRand(1.6, nova.radius - 0.4);
      const x = position.x + Math.cos(angle) * dist;
      const z = position.z + Math.sin(angle) * dist;
      this.spikes.spawn(
        d.time,
        _eliteDir.set(x, d.fxFloor(x, z, position.y) - 0.15, z),
        _eliteVec.set(Math.cos(angle) * 0.7, 1, Math.sin(angle) * 0.7),
        eliteRand(0.9, 1.6),
        eliteRand(0.22, 0.34),
        eliteRand(1.1, 1.5),
        spikeKind,
      );
    }
    d.fx.dust(position, 10, 2.5, 1, ex.element === 'blue' ? FROST_BLUE : ELITE_DUST, 0.5);
    this.paintPatch(ex.element, position, 3.4);
    ex.surge = 1.5;
    d.emit('camera:shake', {
      strength: 0.6,
      position: position.clone(),
    });
    d.emit('enemy:attack', {
      id: enemy.id,
      kind: enemy.kind,
      position: position.clone(),
      attack: 'nova',
    });
    const dx = d.pPos.x - position.x;
    const dz = d.pPos.z - position.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= nova.radius + 0.35 && Math.abs(d.pPos.y - position.y) < 2.6)
      d.hurtPlayer(
        enemy,
        nova.damage,
        dist > 0.05 ? _eliteDir.set(dx / dist, 0, dz / dist) : _eliteDir.set(0, 0, 1),
        nova.knockback,
      );
  }
  poundFlight(bounce, dist) {
    return [1, 0.82, 0.68][Math.min(2, bounce)] * clamp(0.75 + dist / 30, 0.8, 1.15);
  }
  leap(enemy, bounce) {
    const d2 = this.d;
    const ex = enemy.ex;
    const pPos = d2.pPos;
    const dist = Math.hypot(pPos.x - enemy.position.x, pPos.z - enemy.position.z);
    const flight = this.poundFlight(bounce, dist);
    let tx = pPos.x + d2.pVel.x * flight * 0.35;
    let tz = pPos.z + d2.pVel.z * flight * 0.35;
    const dx = tx - enemy.position.x;
    const dz = tz - enemy.position.z;
    const leapDist = Math.hypot(dx, dz);
    const range = ATTACKS.pound.range;
    if (leapDist > range) {
      tx = enemy.position.x + (dx / leapDist) * range;
      tz = enemy.position.z + (dz / leapDist) * range;
    }
    const ty = d2.fxFloor(tx, tz, pPos.y);
    ex.target.set(tx, ty, tz);
    ex.flight = flight;
    enemy.vel.set(
      (tx - enemy.position.x) / flight,
      (ty - enemy.position.y) / flight + 12 * flight,
      (tz - enemy.position.z) / flight,
    );
    enemy.grounded = false;
    enemy.airLock = 0.2;
    enemy.ballistic = true;
    enemy.speedCap = Math.hypot(enemy.vel.x, enemy.vel.z) + 1;
    enemy.telegraphing = true;
    enemy.attackEta = flight;
    enemy.anim.kick(CH.SQUASH, 6);
    const radius = this.poundRadius(bounce);
    d2.fx.marker(ex.target, radius, flight, ex.color, 2.2);
    d2.fx.dust(enemy.position, 6, enemy.radius, 0.7 * enemy.scale);
    d2.fx.sparks(enemy.position, this.elColor(ex.element, _elementColor), 14, 5, 3, 0.08, 6);
  }
  poundRadius(bounce) {
    return ATTACKS.pound.radius * (1 - Math.min(2, bounce) * 0.17);
  }
  poundImpact(enemy) {
    const d2 = this.d;
    const ex = enemy.ex;
    const pound = ATTACKS.pound;
    const center = _elitePos.copy(enemy.position);
    center.y = d2.fxFloor(center.x, center.z, enemy.position.y);
    const radius = this.poundRadius(ex.bounces);
    const falloff = 1 - ex.bounces * 0.2;
    this.elColor(ex.element, _elementColor);
    d2.fx.shockwave(center, Math.min(radius, 3.5), _elementColor);
    d2.fx.dust(center, 14, 1.8, 1);
    d2.fx.paintSplash(_eliteVec.copy(center).setY(center.y + 0.3), ex.element, 30, 7, 0.1);
    d2.fx.sparks(_eliteVec, _elementColor, 24, 7, 3.5, 0.1, 6);
    d2.fx.inkSplash(_eliteVec, null, 16, 6, 0.09);
    if (ex.bounces === 2 || ex.element !== 'yellow') this.paintPatch(ex.element, center, 1.9);
    d2.emit('camera:shake', {
      strength: 0.75 * falloff,
      position: center.clone(),
    });
    d2.emit('enemy:attack', {
      id: enemy.id,
      kind: enemy.kind,
      position: center.clone(),
      attack: 'pound',
    });
    const dx = d2.pPos.x - center.x;
    const dz = d2.pPos.z - center.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= pound.crush && Math.abs(d2.pPos.y - center.y) < 2.2)
      d2.hurtPlayer(
        enemy,
        pound.damage,
        dist > 0.05 ? _eliteDir.set(dx / dist, 0, dz / dist) : _eliteDir.set(0, 0, 1),
        pound.knockback,
      );
    this.addRing(enemy, center, 0.8, radius, 0.55, 1, 7);
    enemy.anim.kick(CH.SQUASH, -7);
    ex.surge = 1.3;
    ex.bounces++;
    const pPos = d2.pPos;
    const playerDist = Math.hypot(pPos.x - enemy.position.x, pPos.z - enemy.position.z);
    if (ex.bounces < 3 && d2.pAlive && playerDist < pound.range + 4 && !this.d.opts.noAttack) {
      d2.setState(enemy, 'attack');
      this.leap(enemy, ex.bounces);
    } else {
      enemy.ballistic = false;
      enemy.speedCap = 0;
      enemy.telegraphing = false;
      enemy.attackEta = 0;
      enemy.vel.x = enemy.vel.z = 0;
      ex.recoverT = pound.recover;
      d2.setState(enemy, 'recover');
    }
  }
  onLand(enemy, impact) {
    const ex = enemy.ex;
    if (ex) {
      if (enemy.state === 'attack' && enemy.attack === 'pound' && enemy.stateT > 0.12) {
        this.poundImpact(enemy);
        return;
      }
      if (enemy.state === 'attack' && enemy.attack === 'windride' && enemy.stateT > 0.15) {
        this.skyMoves.windrideLand(enemy);
        return;
      }
      if (enemy.kind === 'smudgeling' && impact > 2)
        this.d.fx.sparks(enemy.position, this.elColor(ex.element, _elementColor), 5, 2.5, 2.5, 0.06, 5);
    }
  }
  onHurt(enemy, staggered) {
    const ex = enemy.ex;
    if (
      !ex ||
      !enemy.alive ||
      ((ex.surge = Math.max(ex.surge, 0.7)),
      enemy.kind !== 'smudgeling' || staggered || !enemy.controllable || !enemy.grounded) ||
      enemy.state === 'attack' ||
      enemy.state === 'telegraph' ||
      Math.random() > 0.3
    )
      return;
    const d = this.d;
    const angle = Math.atan2(enemy.position.x - d.pPos.x, enemy.position.z - d.pPos.z) + eliteRand(-0.7, 0.7);
    enemy.vel.x = Math.sin(angle) * 7.5;
    enemy.vel.z = Math.cos(angle) * 7.5;
    enemy.vel.y = 7;
    enemy.grounded = false;
    enemy.airLock = 0.15;
    enemy.ballistic = true;
    enemy.speedCap = 8.5;
    d.releaseToken(enemy);
    enemy.cooldown = Math.max(enemy.cooldown, 0.5);
    d.setState(enemy, 'engage');
    enemy.anim.kick(CH.SQUASH, 5);
    d.fx.sparks(enemy.position, this.elColor(ex.element, _elementColor), 12, 4, 3, 0.08, 6);
  }
  addRing(enemy, pos, r0, r1, life, damage, kb) {
    const ex = enemy.ex;
    this.addRingRaw(
      enemy.id,
      enemy.kind,
      ex.element,
      this.elColor(ex.element, _mixColor),
      pos,
      r0,
      r1,
      life,
      damage,
      kb,
      false,
    );
  }
  addRingRaw(ownerId, source, element, color, pos, r0, r1, life, damage, kb, storm) {
    let ring = this.rings.find((ring) => !ring.active);
    ring ||= this.rings.reduce((acc, ring) => (acc.t > ring.t ? acc : ring));
    ring.active = true;
    ring.element = element;
    ring.color.copy(color);
    ring.storm = storm;
    ring.ownerId = ownerId;
    ring.x = pos.x;
    ring.y = pos.y;
    ring.z = pos.z;
    ring.r0 = r0;
    ring.r1 = r1;
    ring.life = life;
    ring.t = 0;
    ring.prevR = r0;
    ring.w = 0.55;
    ring.damage = damage;
    ring.kb = kb;
    ring.hit = false;
    ring.ignited = false;
    ring.source = source;
    const d = this.d;
    const height = element === 'red' ? 1.1 : storm ? 0.7 : 0.8;
    d.fx.waves.spawn(d.time, pos.x, pos.y, pos.z, r0, r1, life, height, color, element === 'red' ? 2.6 : storm ? 3 : 2);
    d.fx.decals.spawn(d.time, pos.x, pos.y, pos.z, r0, r1, life * 1.05, 0, color, storm ? 3 : 2.4, 0, 0);
  }
  addPatch(enemy, pos, radius, life, damage) {
    const ex = enemy.ex;
    let patch = this.patches.find((patch) => !patch.active);
    patch ||= this.patches.reduce((acc, patch) => (acc.t / acc.life > patch.t / patch.life ? acc : patch));
    patch.active = true;
    patch.element = ex.element;
    patch.ownerId = enemy.id;
    patch.pos.set(pos.x, this.d.fxFloor(pos.x, pos.z, pos.y), pos.z);
    patch.r = radius;
    patch.t = 0;
    patch.life = life;
    patch.damage = damage;
    patch.seed = Math.random() * 10;
    const d = this.d;
    if (ex.element === 'red') {
      d.fx.decals.spawn(
        d.time,
        patch.pos.x,
        patch.pos.y,
        patch.pos.z,
        radius * 0.4,
        radius * 1.1,
        life,
        3,
        _elementColor.setRGB(0.06, 0.04, 0.035),
        0.9,
      );
      this.igniteWorld(patch.pos, 0.6);
    } else this.paintPatch(ex.element, patch.pos, radius * 1.2);
  }
  addEruption(enemy, pos, radius, eta, damage = ATTACKS.spikes.damage, knockback = ATTACKS.spikes.knockback) {
    const ex = enemy.ex;
    let eruption = this.eruptions.find((eruption) => !eruption.active);
    eruption ||= this.eruptions.reduce((acc, eruption) => (acc.eta < eruption.eta ? acc : eruption));
    eruption.active = true;
    eruption.element = ex.element;
    eruption.ownerId = enemy.id;
    eruption.pos.copy(pos);
    eruption.r = radius;
    eruption.eta = eta;
    eruption.fxT = 0;
    eruption.damage = damage;
    eruption.kind = enemy.kind;
    eruption.source = ex.style === 'hoarder' ? enemy.kind : ex.style;
    this.d.fx.marker(pos, radius, eta, ex.color, 2.4);
  }
  igniteWorld(pos, radius) {
    if (!(this.igniteTokens < 1)) {
      --this.igniteTokens;
      try {
        this.ctx.elements.ignite(pos.clone(), radius);
      } catch {}
    }
  }
  paintPatch(element, pos, radius) {
    if (element !== 'red') {
      try {
        this.ctx.paint.paintSphere(
          _eliteDir.set(pos.x, this.d.fxFloor(pos.x, pos.z, pos.y), pos.z),
          radius,
          element,
          1,
        );
      } catch {}
      if (element === 'blue')
        try {
          if (this.d.waterDepth(pos.x, pos.z) > 0.05)
            this.ctx.elements.freezeWater(_eliteDir.set(pos.x, this.ctx.water.level, pos.z), radius * 1.3);
        } catch {}
    }
  }
  update(dt) {
    if (dt <= 0) return;
    const d = this.d;
    this.igniteTokens = Math.min(4, this.igniteTokens + dt * 0.5);
    const pPos = d.pPos;
    const pAbove = pPos.y - d.fxFloor(pPos.x, pPos.z, pPos.y);
    for (const ring of this.rings) {
      if (!ring.active) continue;
      ring.t += dt;
      const progress = ring.t / ring.life;
      const radius = ring.r0 + (ring.r1 - ring.r0) * ringEase(progress);
      if (ring.storm && Math.random() < dt * 40) {
        const angle = Math.random() * Math.PI * 2;
        const dist = radius + (Math.random() - 0.5) * 0.3;
        d.fx.glows.spawn(
          d.time,
          ring.x + Math.cos(angle) * dist,
          ring.y + 0.1 + Math.random() * 0.5,
          ring.z + Math.sin(angle) * dist,
          -Math.sin(angle) * 4,
          Math.random() * 3,
          Math.cos(angle) * 4,
          0.06,
          0.12,
          Math.random() < 0.5 ? STORM_WHITE : STORM_VIOLET,
          5,
          0,
          4,
          3,
        );
      }
      if (!ring.hit && d.pAlive) {
        const dist = Math.hypot(pPos.x - ring.x, pPos.z - ring.z);
        if (dist >= ring.prevR - ring.w && dist <= radius + ring.w && pAbove < 0.7 && Math.abs(pPos.y - ring.y) < 2.5) {
          ring.hit = true;
          const owner = d.byId.get(ring.ownerId);
          const dir =
            dist > 0.05 ? _elitePos.set((pPos.x - ring.x) / dist, 0, (pPos.z - ring.z) / dist) : _elitePos.set(0, 0, 1);
          d.hurtPlayerFrom(ring.source, owner?.id ?? ring.ownerId, ring.damage, dir, ring.kb);
        }
      }
      if (ring.element === 'red' && !ring.ignited && progress > 0.55) {
        ring.ignited = true;
        for (let i = 0; i < 3; i++) {
          const angle = Math.random() * Math.PI * 2;
          this.igniteWorld(
            _eliteVec.set(ring.x + Math.cos(angle) * radius, ring.y, ring.z + Math.sin(angle) * radius),
            0.7,
          );
        }
      }
      ring.prevR = radius;
      if (progress >= 1) ring.active = false;
    }
    for (const patch of this.patches)
      if (patch.active) {
        patch.t += dt;
        if (patch.t >= patch.life) {
          patch.active = false;
          if (patch.element === 'red')
            d.fx.smoke(_elitePos.copy(patch.pos).setY(patch.pos.y + 0.2), 1, ELITE_SMOKE, 0.35, 0.3);
          continue;
        }
        if (patch.element === 'red' && d.pAlive && patch.t > 0.15 && patch.t < patch.life - 0.3) {
          const dist = Math.hypot(pPos.x - patch.pos.x, pPos.z - patch.pos.z);
          if (dist < patch.r + 0.3 && pAbove < 0.45) {
            const dir =
              dist > 0.05
                ? _elitePos.set((pPos.x - patch.pos.x) / dist, 0, (pPos.z - patch.pos.z) / dist)
                : _elitePos.set(0, 0, 1);
            d.hurtPlayerFrom('fire', patch.ownerId, patch.damage, dir, 4);
          }
        }
      }
    for (const eruption of this.eruptions)
      if (eruption.active) {
        eruption.eta -= dt;
        eruption.fxT -= dt;
        if (eruption.fxT <= 0 && eruption.eta > 0) {
          eruption.fxT = 0.06;
          const angle = Math.random() * Math.PI * 2;
          const dist = eruption.r * Math.sqrt(Math.random());
          const x = eruption.pos.x + Math.cos(angle) * dist;
          const z = eruption.pos.z + Math.sin(angle) * dist;
          d.fx.sparks(
            _elitePos.set(x, d.fxFloor(x, z, eruption.pos.y) + 0.05, z),
            this.elColor(eruption.element, _elementColor),
            2,
            1.5,
            3,
            0.08,
            -3,
          );
          if (Math.random() < 0.3)
            d.fx.dust(_elitePos, 1, 0.2, 0.5, eruption.element === 'blue' ? FROST_BLUE : ELITE_DUST, 0.35);
        }
        if (eruption.eta <= 0) {
          eruption.active = false;
          this.erupt(eruption);
        }
      }
    this.skyMoves.update(dt);
    this.spikes.update(d.time, (pos, len, kind) => {
      if (kind === SPIKE_KIND.blue || kind === SPIKE_KIND.yellow)
        d.fx.iceShatter(pos, _eliteVec.set(0, 0, 0), 0.35 + len * 0.3);
      else d.fx.dust(pos, 2, 0.4, 0.5);
    });
    this.updateHearts(dt);
  }
  erupt(eruption) {
    const d = this.d;
    const spikeKind = SPIKE_KIND[eruption.element];
    const time = d.time;
    const floorY = d.fxFloor(eruption.pos.x, eruption.pos.z, eruption.pos.y);
    this.spikes.spawn(
      time,
      _elitePos.set(eruption.pos.x, floorY - 0.2, eruption.pos.z),
      _eliteVec.set(eliteRand(-0.1, 0.1), 1, eliteRand(-0.1, 0.1)),
      2.6,
      0.55,
      1.9,
      spikeKind,
    );
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + eliteRand(-0.2, 0.2);
      const dist = eruption.r * eliteRand(0.45, 0.95);
      const x = eruption.pos.x + Math.cos(angle) * dist;
      const z = eruption.pos.z + Math.sin(angle) * dist;
      this.spikes.spawn(
        time,
        _elitePos.set(x, d.fxFloor(x, z, eruption.pos.y) - 0.15, z),
        _eliteVec.set(Math.cos(angle) * 0.45, 1, Math.sin(angle) * 0.45),
        eliteRand(1.2, 2.1),
        eliteRand(0.28, 0.42),
        eliteRand(1.5, 2),
        spikeKind,
      );
    }
    this.elColor(eruption.element, _elementColor);
    _elitePos.set(eruption.pos.x, floorY + 0.6, eruption.pos.z);
    if (eruption.element === 'blue') d.fx.iceShatter(_elitePos, _eliteVec.set(0, 0, 0), 1.2);
    d.fx.sparks(_elitePos, _elementColor, 24, 7, 3.5, 0.1, 5);
    d.fx.dust(_elitePos, 8, eruption.r, 0.9, eruption.element === 'blue' ? FROST_BLUE : ELITE_DUST, 0.5);
    d.fx.ring(eruption.pos, 0.5, eruption.r + 0.6, 0.5, _elementColor, 2.5);
    this.paintPatch(eruption.element, eruption.pos, eruption.r);
    d.emit('camera:shake', {
      strength: 0.45,
      position: eruption.pos.clone(),
    });
    d.emit('enemy:attack', {
      id: eruption.ownerId,
      kind: eruption.kind,
      position: eruption.pos.clone(),
      attack: eruption.element === 'green' && eruption.source === 'thornmother' ? 'thorns' : 'spikes',
    });
    const pPos = d.pPos;
    const dist = Math.hypot(pPos.x - eruption.pos.x, pPos.z - eruption.pos.z);
    if (d.pAlive && dist <= eruption.r + 0.35 && pPos.y - floorY < 1.4) {
      const dir =
        dist > 0.05
          ? _elitePos.set((pPos.x - eruption.pos.x) / dist, 0, (pPos.z - eruption.pos.z) / dist)
          : _elitePos.set(0, 0, 1);
      d.hurtPlayerFrom(eruption.source, eruption.ownerId, eruption.damage, dir, ATTACKS.spikes.knockback);
    }
  }
  threatEta(enemy) {
    const d = this.d;
    if (!d.pAlive) return Infinity;
    const pPos = d.pPos;
    let eta = Infinity;
    for (const ring of this.rings) {
      if (!ring.active || ring.hit || ring.ownerId !== enemy.id) continue;
      const dist = Math.hypot(pPos.x - ring.x, pPos.z - ring.z);
      if (dist <= ring.prevR || dist > ring.r1 + ring.w) continue;
      const hitProgress = 1 - (1 - clamp((dist - ring.r0) / Math.max(0.01, ring.r1 - ring.r0), 0, 1)) ** (1 / 2.4);
      eta = Math.min(eta, Math.max(0, hitProgress * ring.life - ring.t));
    }
    for (const eruption of this.eruptions)
      if (
        eruption.active &&
        eruption.ownerId === enemy.id &&
        Math.hypot(pPos.x - eruption.pos.x, pPos.z - eruption.pos.z) <= eruption.r + 1
      )
        eta = Math.min(eta, Math.max(0, eruption.eta));
    for (const glob of d.globs.list)
      if (!(!glob.active || glob.reflected || glob.hitPlayer || glob.ownerId !== enemy.id))
        if (Math.hypot(pPos.x - glob.target.x, pPos.z - glob.target.z) < 2.2)
          eta = Math.min(eta, Math.max(0, glob.flight - glob.age));
    if (enemy.ex && enemy.ex.style !== 'hoarder') eta = Math.min(eta, this.skyMoves.threatEta(enemy));
    return eta;
  }
  post(enemy, dt) {
    const ex = enemy.ex;
    if (
      ex &&
      ((ex.surge = Math.max(0, ex.surge - dt * 1.6)),
      (ex.absorb = Math.max(0, ex.absorb - dt * 2.5)),
      (ex.weak = Math.max(0, ex.weak - dt * 2)),
      enemy.state !== 'telegraph' && enemy.state !== 'attack' && enemy.alive)
    ) {
      const eta = this.threatEta(enemy);
      enemy.telegraphing = eta < 1.5;
      enemy.attackEta = eta < 1.5 ? eta : 0;
    }
  }
  globLanded(glob, pos, inWater) {
    const element = glob.element;
    if (!element) return;
    const d = this.d;
    this.elColor(element, _elementColor);
    d.fx.sparks(_elitePos.copy(pos).setY(pos.y + 0.2), _elementColor, 12, 4, 3, 0.08, 3);
    if (element === 'blue') d.fx.iceShatter(_elitePos, _eliteVec.set(0, 0, 0), 0.6);
    if (!inWater) d.fx.splat(pos, 1.3, 9, element);
    this.paintPatch(element, pos, glob.size > 1.2 ? 1 : 1.6);
    if (element === 'red') {
      const owner = d.byId.get(glob.ownerId);
      if (owner && owner.ex) this.addPatch(owner, pos, 0.9, 3, 0.5);
    }
  }
  absorbFx(enemy, hitPos) {
    const d = this.d;
    const ex = enemy.ex;
    ex.absorb = 1.2;
    this.elColor(ex.element, _elementColor);
    const cx = enemy.position.x;
    const cy = enemy.position.y + enemy.height * 0.5;
    const cz = enemy.position.z;
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = eliteRand(0.8, 1.6) * Math.sqrt(enemy.scale);
      const x = hitPos.x + Math.cos(angle) * dist;
      const y = hitPos.y + eliteRand(-0.6, 0.8);
      const z = hitPos.z + Math.sin(angle) * dist;
      d.fx.glows.spawn(
        d.time,
        x,
        y,
        z,
        (cx - x) * 3,
        (cy - y) * 3,
        (cz - z) * 3,
        eliteRand(0.06, 0.12),
        0.32,
        _elementColor,
        3.5,
        0,
        2.5,
        1.6,
      );
    }
    d.fx.puffs.spawn(
      d.time,
      hitPos.x,
      hitPos.y,
      hitPos.z,
      0,
      0.3,
      0,
      0.3,
      1.1 * Math.sqrt(enemy.scale),
      0.5,
      _mixColor.copy(_elementColor).lerp(ELITE_WHITE, 0.35),
      0.55,
      0.2,
      3,
    );
    d.fx.glows.spawn(d.time, cx, cy, cz, 0, 0, 0, 1.6 * enemy.scale, 0.25, _elementColor, 1.6, 0, 1, 0);
  }
  weakFx(enemy, hitPos, color) {
    const d = this.d;
    const ex = enemy.ex;
    ex.weak = 1.3;
    ex.surge = Math.max(ex.surge, 1);
    paletteColor(color, _elementColor);
    d.fx.sparks(hitPos, _elementColor, 30, 9, 4, 0.11, 4);
    d.fx.glows.spawn(
      d.time,
      hitPos.x,
      hitPos.y,
      hitPos.z,
      0,
      0,
      0,
      2.2,
      0.18,
      _mixColor.copy(_elementColor).lerp(ELITE_WHITE, 0.3),
      3,
      0,
      1,
      0,
    );
    d.fx.paintSplash(hitPos, color, 18, 6, 0.1);
    this.elColor(ex.element, _elementColor);
    d.fx.inkSplash(hitPos, null, 10, 5, 0.09, _elementColor);
    d.emit('camera:shake', {
      strength: 0.35,
      position: enemy.position.clone(),
    });
    d.hitStop(0.085);
  }
  onKilled(enemy) {
    const ex = enemy.ex;
    if (!ex) return;
    const d = this.d;
    enemy.deathColor = ex.element;
    paletteColor(ex.element, enemy.coat);
    ex.dyingT = 0;
    ex.implode = false;
    ex.surge = 2;
    d.hitStop(0.22);
    try {
      this.ctx.time.slowMo(0.3, 1.6);
    } catch {}
    d.emit('camera:shake', {
      strength: 0.7,
      position: enemy.position.clone(),
    });
    for (const ring of this.rings) if (ring.ownerId === enemy.id) ring.hit = true;
    for (const eruption of this.eruptions) if (eruption.ownerId === enemy.id) eruption.active = false;
    this.skyMoves.onKilled(enemy);
  }
  dying(enemy, dt, progress) {
    const ex = enemy.ex;
    if (!ex) return;
    const d = this.d;
    ex.surge = 1 + progress;
    ex.dyingT -= dt;
    if (ex.dyingT <= 0) {
      ex.dyingT = 0.05;
      this.elColor(ex.element, _elementColor);
      const angle = Math.random() * Math.PI * 2;
      const y = enemy.position.y + enemy.height * eliteRand(0.2, 0.9);
      const radius = enemy.radius * 0.9;
      _elitePos.set(enemy.position.x + Math.cos(angle) * radius, y, enemy.position.z + Math.sin(angle) * radius);
      const spd = eliteRand(3, 6);
      d.fx.glows.spawn(
        d.time,
        _elitePos.x,
        _elitePos.y,
        _elitePos.z,
        Math.cos(angle) * spd,
        eliteRand(1, 4),
        Math.sin(angle) * spd,
        eliteRand(0.08, 0.16) * Math.sqrt(enemy.scale),
        eliteRand(0.3, 0.6),
        _elementColor,
        4,
        6,
        2,
        2,
      );
      d.fx.paintSplash(_elitePos, ex.element, 3, 4, 0.08 * Math.sqrt(enemy.scale));
      if (Math.random() < 0.35)
        d.emit('camera:shake', {
          strength: 0.12 + progress * 0.2,
          position: enemy.position.clone(),
        });
    }
    if (!ex.implode && progress > 0.72) {
      ex.implode = true;
      this.elColor(ex.element, _elementColor);
      const cx = enemy.position.x;
      const cy = enemy.position.y + enemy.height * 0.5;
      const cz = enemy.position.z;
      for (let i = 0; i < 40; i++) {
        const yaw = Math.random() * Math.PI * 2;
        const pitch = eliteRand(-0.6, 1.2);
        const dist = eliteRand(3, 5) * Math.sqrt(enemy.scale);
        const x = cx + Math.cos(yaw) * Math.cos(pitch) * dist;
        const y = cy + Math.sin(pitch) * dist;
        const z = cz + Math.sin(yaw) * Math.cos(pitch) * dist;
        d.fx.glows.spawn(
          d.time,
          x,
          y,
          z,
          (cx - x) * 1.9,
          (cy - y) * 1.9,
          (cz - z) * 1.9,
          eliteRand(0.08, 0.15),
          0.5,
          _elementColor,
          4,
          0,
          1.5,
          2.5,
        );
      }
    }
  }
  deathBurst(enemy) {
    const ex = enemy.ex;
    if (!ex) return;
    const d2 = this.d;
    const pos = enemy.position.clone();
    const floorY = d2.fxFloor(pos.x, pos.z, pos.y);
    pos.y = floorY;
    const size = Math.sqrt(enemy.scale);
    const center = _elitePos.set(pos.x, floorY + enemy.height * 0.5, pos.z);
    this.elColor(ex.element, _elementColor);
    for (let i = 0; i < 3; i++) d2.fx.paintSplash(center, ex.element, 50, 11 * size, 0.16 * size);
    for (const color of COLORS) if (color !== ex.element) d2.fx.paintSplash(center, color, 14, 8, 0.12);
    for (let i = 0; i < 26; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = eliteRand(3, 8) * size;
      d2.fx.drops.spawn(
        d2.time,
        center.x,
        center.y,
        center.z,
        Math.cos(angle) * spd,
        eliteRand(6, 13),
        Math.sin(angle) * spd,
        eliteRand(0.25, 0.42) * size,
        eliteRand(2, 3.2),
        floorY,
        _elementColor,
        0.6,
        16,
        0.4,
      );
    }
    d2.fx.sparks(center, _elementColor, 60, 13, 4.5, 0.13, 3);
    d2.fx.glows.spawn(
      d2.time,
      center.x,
      center.y,
      center.z,
      0,
      0,
      0,
      7 * size,
      0.45,
      _mixColor.copy(_elementColor).lerp(ELITE_WHITE, 0.45),
      3.5,
      0,
      1,
      0,
    );
    d2.fx.ring(pos, 0.4, 9 * size, 0.8, _elementColor, 3);
    d2.fx.ring(pos, 0.4, 15 * size, 1.3, _elementColor, 2);
    d2.fx.waves.spawn(d2.time, pos.x, floorY, pos.z, 0.6, 13, 0.9, 3.2, _elementColor, 2.4);
    d2.fx.splat(pos, 3.2 * size, 30, ex.element);
    for (let i = 0; i < 18; i++)
      d2.fx.shards.spawn(
        d2.time,
        center.x,
        center.y,
        center.z,
        eliteRand(-8, 8),
        eliteRand(4, 11),
        eliteRand(-8, 8),
        eliteRand(0.1, 0.22) * size,
        eliteRand(1.6, 2.6),
        floorY,
        FX_INK,
        1,
        eliteRand(5, 12),
      );
    d2.fx.puffs.spawn(
      d2.time,
      center.x,
      center.y,
      center.z,
      0,
      1.2,
      0,
      1.2 * size,
      4.5 * size,
      1.6,
      _mixColor.copy(_elementColor).lerp(ELITE_WHITE, 0.3),
      0.55,
      1,
      2,
    );
    try {
      this.ctx.paint.bloomVitality(pos.clone(), 20, 2.6);
    } catch {}
    this.paintPatch(ex.element, pos, 3.2);
    d2.emit('camera:shake', {
      strength: 1,
      position: pos.clone(),
    });
    this.columns.add(d2.time, pos, 2.1 * size, 30, COLUMN_MODE.geyser, 1.1, ex.element);
    const dx = d2.pPos.x - pos.x;
    const dz = d2.pPos.z - pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const offset = Math.min(2.6, len * 0.5);
    this.spawnHeart(ex.element, _eliteVec.set(pos.x + (dx / len) * offset, pos.y, pos.z + (dz / len) * offset));
    const dropPos = _eliteVec.set(pos.x, floorY + 1.2, pos.z);
    for (let i = 0; i < 3; i++) d2.pickups.spawn('heart', dropPos, null);
    const inks = [ex.element, ex.element, ex.element, ex.counter, ex.counter, COLORS[Math.floor(Math.random() * 4)]];
    for (const color of inks) d2.pickups.spawn('ink', dropPos, color);
    try {
      this.onDefeated?.(enemy, pos);
    } catch (err) {
      console.warn('[enemies] elite onDefeated failed', err);
    }
    d2.emit('elite:defeated', {
      id: enemy.id,
      name: ex.name,
      element: ex.element,
      position: pos.clone(),
    });
  }
  spawnHeart(color, pos) {
    const floorY = this.d.fxFloor(pos.x, pos.z, pos.y);
    const heart = {
      active: true,
      color,
      pos: new Vector3(pos.x, floorY + 0.8, pos.z),
      groundY: floorY,
      age: 0,
      spin: 0,
      pillar: this.columns.add(
        this.d.time,
        _elitePos.set(pos.x, floorY, pos.z),
        0.45,
        9,
        COLUMN_MODE.pillar,
        0.9,
        color,
      ),
      sparkT: 0,
    };
    this.hearts.push(heart);
  }
  updateHearts(dt) {
    const d = this.d;
    for (const heart of this.hearts) {
      if (!heart.active) continue;
      heart.age += dt;
      heart.spin += dt * 1.25;
      const hoverY = heart.groundY + 1.55 + Math.sin(d.time * 2.1) * 0.12;
      heart.pos.y += (hoverY - heart.pos.y) * (1 - Math.exp(-2.5 * dt));
      heart.sparkT -= dt;
      if (heart.sparkT <= 0) {
        heart.sparkT = 0.07;
        paletteColor(heart.color, _elementColor);
        if (Math.random() < 0.35) _elementColor.lerp(ELITE_WHITE, 0.6);
        const angle = Math.random() * Math.PI * 2;
        d.fx.glows.spawn(
          d.time,
          heart.pos.x + Math.cos(angle) * 0.7,
          heart.pos.y + eliteRand(-0.5, 0.4),
          heart.pos.z + Math.sin(angle) * 0.7,
          0,
          eliteRand(0.4, 1.1),
          0,
          eliteRand(0.05, 0.1),
          0.9,
          _elementColor,
          2.6,
          0,
          1,
          0,
        );
      }
      if (heart.age < 1.2 || !d.pAlive) continue;
      let holding = false;
      try {
        holding = !!this.ctx.player.state.itemHold;
      } catch {
        holding = false;
      }
      if (holding) continue;
      const pPos = d.pPos;
      const dx = pPos.x - heart.pos.x;
      const dz = pPos.z - heart.pos.z;
      const dy = pPos.y + 0.9 - heart.pos.y;
      if (dx * dx + dz * dz < 1.7 * 1.7 && Math.abs(dy) < 2.2) this.collectHeart(heart);
    }
  }
  collectHeart(heart) {
    const d = this.d;
    heart.active = false;
    this.columns.remove(heart.pillar);
    paletteColor(heart.color, _elementColor);
    d.fx.sparks(heart.pos, _elementColor, 36, 6, 4, 0.1, -1);
    d.fx.sparks(heart.pos, ELITE_WHITE, 20, 5, 3, 0.08, -1);
    d.fx.glows.spawn(
      d.time,
      heart.pos.x,
      heart.pos.y,
      heart.pos.z,
      0,
      0,
      0,
      3,
      0.35,
      _mixColor.copy(_elementColor).lerp(ELITE_WHITE, 0.5),
      3,
      0,
      1,
      0,
    );
    d.fx.ring(_elitePos.set(heart.pos.x, heart.groundY, heart.pos.z), 0.3, 5, 0.8, _elementColor, 2.5);
    try {
      this.ctx.player.giveItem('heartContainer');
    } catch (err) {
      console.warn('[enemies] giveItem failed', err);
    }
  }
  elColor(element, out) {
    return element === 'red'
      ? out.copy(EMBER_ORANGE)
      : element === 'blue'
        ? out.copy(FROST_BLUE)
        : paletteColor(element, out);
  }
  aura(enemy, dt, camDistSq) {
    const ex = enemy.ex;
    if (!ex || camDistSq > 4900) return;
    const d = this.d;
    if (ex.style !== 'hoarder') this.skyMoves.aura(enemy, dt, camDistSq);
    const time = d.time;
    const size = Math.sqrt(enemy.scale);
    const near = camDistSq < 1600;
    for (ex.auraT -= dt; ex.auraT <= 0;) {
      ex.auraT += near ? 0.06 : 0.14;
      const angle = Math.random() * Math.PI * 2;
      const dist = enemy.radius * eliteRand(0.3, 1.1);
      const x = enemy.position.x + Math.cos(angle) * dist;
      const z = enemy.position.z + Math.sin(angle) * dist;
      const y = enemy.position.y + enemy.height * eliteRand(0.2, 1);
      switch (ex.element) {
        case 'red':
          _elementColor.copy(Math.random() < 0.5 ? FLAME_ORANGE : EMBER_ORANGE);
          d.fx.glows.spawn(
            time,
            x,
            y,
            z,
            eliteRand(-0.6, 0.6),
            eliteRand(1.4, 3),
            eliteRand(-0.6, 0.6),
            eliteRand(0.05, 0.1) * size,
            eliteRand(0.8, 1.5),
            _elementColor,
            3.5,
            -1.5,
            1.2,
            1.2,
          );
          if (Math.random() < 0.12)
            d.fx.smoke(_elitePos.set(x, enemy.position.y + enemy.height, z), 1, ELITE_SMOKE, 0.35 * size, 0.3);
          break;
        case 'blue':
          d.fx.glows.spawn(
            time,
            x,
            y + 0.3,
            z,
            eliteRand(-0.4, 0.4),
            eliteRand(-0.3, 0.3),
            eliteRand(-0.4, 0.4),
            eliteRand(0.04, 0.08) * size,
            eliteRand(1, 1.6),
            FROST_BLUE,
            3,
            1.2,
            1.5,
            0.6,
          );
          if (Math.random() < 0.18)
            d.fx.puffs.spawn(
              time,
              x,
              enemy.position.y + 0.15,
              z,
              eliteRand(-0.4, 0.4),
              0.1,
              eliteRand(-0.4, 0.4),
              0.3 * size,
              0.9 * size,
              1.3,
              _elementColor.set(15136511),
              0.35,
              0.05,
              2,
            );
          break;
        case 'yellow':
          paletteColor('yellow', _elementColor);
          d.fx.glows.spawn(
            time,
            x,
            y,
            z,
            eliteRand(-1, 1),
            eliteRand(2, 4.5),
            eliteRand(-1, 1),
            eliteRand(0.05, 0.09) * size,
            eliteRand(0.5, 0.8),
            _elementColor,
            3.2,
            9,
            1.2,
            1.4,
          );
          break;
        default:
          paletteColor('green', _elementColor);
          d.fx.glows.spawn(
            time,
            x,
            y,
            z,
            eliteRand(-0.5, 0.5),
            eliteRand(0.6, 1.4),
            eliteRand(-0.5, 0.5),
            eliteRand(0.05, 0.09) * size,
            eliteRand(0.9, 1.4),
            _elementColor,
            3,
            0.5,
            1.2,
            0.8,
          );
      }
    }
    ex.dripT -= dt;
    const rig = d.models[enemy.kind].rig;
    if (ex.dripT <= 0 && rig.dripPoints.length && near) {
      ex.dripT = eliteRand(0.08, 0.2);
      const point = rig.dripPoints[Math.floor(Math.random() * rig.dripPoints.length)];
      partToWorld(enemy, rig, BONE.top, point, _elitePos);
      paletteColor(ex.element, _elementColor);
      const floorY = d.fxFloor(_elitePos.x, _elitePos.z, enemy.position.y);
      d.fx.drops.spawn(
        time,
        _elitePos.x,
        _elitePos.y,
        _elitePos.z,
        enemy.actualVel.x * 0.3,
        -0.5,
        enemy.actualVel.z * 0.3,
        0.05 * size,
        1.4,
        floorY,
        _elementColor,
        0.8,
        16,
        0.2,
      );
      if (Math.random() < 0.12 && enemy.grounded)
        d.fx.splat(_elitePos.set(_elitePos.x, floorY, _elitePos.z), 0.35 * size, 5, ex.element);
    }
    if (ex.element === 'blue' && enemy.alerted && enemy.grounded) {
      ex.trailT -= dt;
      if (ex.trailT <= 0 && enemy.position.distanceToSquared(ex.lastTrail) > 1.44) {
        ex.trailT = 0.3;
        ex.lastTrail.copy(enemy.position);
        this.paintPatch('blue', enemy.position, 1.1);
      }
    }
    if (ex.element === 'red' && enemy.alerted && enemy.grounded && enemy.state !== 'attack') {
      const speed = Math.hypot(enemy.actualVel.x, enemy.actualVel.z);
      ex.stepT -= dt;
      if (speed > 2.2 && ex.stepT <= 0) {
        ex.stepT = 0.34;
        ex.side = -ex.side;
        const ox = Math.cos(enemy.facing) * ex.side * enemy.radius * 0.45;
        const oz = -Math.sin(enemy.facing) * ex.side * enemy.radius * 0.45;
        this.addPatch(
          enemy,
          _elitePos.set(enemy.position.x + ox, enemy.position.y, enemy.position.z + oz),
          0.45,
          1.8,
          0.5,
        );
      }
    }
  }
  renderFlames() {
    const d = this.d;
    const flames = d.flames;
    for (const enemy of d.enemies) {
      const ex = enemy.ex;
      if (!ex || !enemy.rendered || ex.element !== 'red' || enemy.state === 'dying' || enemy.has('frozen')) continue;
      const rig = d.models[enemy.kind].rig;
      const size = Math.sqrt(enemy.scale) * (enemy.kind === 'brute' ? 1 : 0.6);
      const boost = 0.85 + 0.35 * Math.min(1, ex.surge);
      for (let i = 0; i < 2; i++) {
        const fist = rig.fists[i];
        partToWorld(enemy, rig, i === 0 ? BONE.handL : BONE.handR, fist, _elitePos);
        for (let j = 0; j < 3; j++) {
          _eliteVec.set(
            _elitePos.x + Math.sin(j * 2.1) * 0.18 * size,
            _elitePos.y + 0.05 * j,
            _elitePos.z + Math.cos(j * 2.1) * 0.18 * size,
          );
          flames.add(_eliteVec, 0.42 * size * boost, 0.95 * size * boost, 1, enemy.seed * 10 + j * 1.3 + i * 5, 0.25);
        }
      }
    }
    for (const ring of this.rings) {
      if (!ring.active || ring.element !== 'red') continue;
      const progress = ring.t / ring.life;
      const radius = ring.r0 + (ring.r1 - ring.r0) * ringEase(progress);
      const count = Math.min(56, Math.max(12, Math.round(radius * 4.6)));
      const fade = 1 - Math.max(0, (progress - 0.7) / 0.3);
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + ring.x * 0.1;
        const x = ring.x + Math.cos(angle) * radius;
        const z = ring.z + Math.sin(angle) * radius;
        _elitePos.set(x, d.fxFloor(x, z, ring.y), z);
        const flicker = (0.9 + 0.5 * Math.sin(i * 1.7 + ring.t * 9)) * fade;
        flames.add(_elitePos, 0.7 * fade + 0.2, 1.3 * flicker + 0.2, fade, i * 1.37 + ring.y, 0.3);
      }
    }
    for (const patch of this.patches) {
      if (!patch.active || patch.element !== 'red') continue;
      const progress = patch.t / patch.life;
      const fade = Math.min(1, patch.t * 6) * (1 - Math.max(0, (progress - 0.6) / 0.4));
      for (let i = 0; i < 2; i++) {
        _elitePos.set(
          patch.pos.x + Math.sin(patch.seed + i * 3) * patch.r * 0.4,
          patch.pos.y,
          patch.pos.z + Math.cos(patch.seed + i * 3) * patch.r * 0.4,
        );
        flames.add(_elitePos, patch.r * 0.9 * fade + 0.05, patch.r * 1.9 * fade + 0.05, fade, patch.seed + i, 0.2);
      }
    }
  }
  render() {
    this.spikes.render(this.d.time);
    this.heartMeshes.render(this.hearts, this.d.time);
  }
  renderExtra() {
    this.skyMoves.render();
  }
  reset() {
    for (const ring of this.rings) ring.active = false;
    for (const patch of this.patches) patch.active = false;
    for (const eruption of this.eruptions) eruption.active = false;
    this.skyMoves.reset();
  }
}
