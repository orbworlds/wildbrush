/**
 * Attacks of the Painted Aerie's elites: the Thornmother's vine whip, thorn eruptions and root grab lanes, and the Galecaller's gusts, gale ring, wind ride and bouncing orbs, with their telegraphs, hit checks and the vines that bind the hero.
 */
import { Color, Vector3 } from 'three';
import { clamp } from '../core/math.js';
import { ATTACKS, ELITE } from './defs.js';
import { SPIKE_KIND } from './elite-spikes.js';
import { CH } from './enemy.js';
import { paletteColor } from './fx.js';
import { BONE } from './models.js';
import { partToWorld } from './rig-transforms.js';
const skyRand = (min, max) => min + Math.random() * (max - min);
const skyWrapAngle = (angle) => {
  for (; angle > Math.PI;) angle -= Math.PI * 2;
  for (; angle < -Math.PI;) angle += Math.PI * 2;
  return angle;
};
export const SKY_ATTACKS = new Set(['vinewhip', 'thorns', 'rootgrab', 'gust', 'galering', 'windride', 'orbs']);
export class SkyEliteState {
  whipCd = 1.2;
  thornCd = 2.5;
  grabCd = 3.5;
  gustCd = 1;
  ringCd = 0.5;
  rideCd = 3;
  dir = new Vector3(0, 0, 1);
  origin = new Vector3();
  target = new Vector3();
  locked = false;
  shots = 0;
  len = 0;
  hitDone = false;
  spikeT = 0;
  prevU = 0;
  flight = 1;
  trailT = 0;
}
const GALE_GOLD = new Color(1, 0.95, 0.78);
const WIND_WHITE = new Color(0.97, 0.97, 1);
const VINE_GREEN = new Color();
const GALE_YELLOW = new Color();
paletteColor('green', VINE_GREEN);
paletteColor('yellow', GALE_YELLOW);
const THORN_GLOW = new Color(0.35, 1, 0.45);
const ROOT_DUST = new Color(0xa89a80);
const _skyPos = new Vector3();
const _skyDir = new Vector3();
const _skyKnock = new Vector3();
const _edgeDir = new Vector3();
export class SkyMoves {
  ctx;
  d;
  el;
  lanes = [];
  gusts = [];
  heroVines = {
    active: false,
    t: 0,
    dur: 2,
    seed: 0.37,
  };
  constructor(ctx, director, el) {
    this.ctx = ctx;
    this.d = director;
    this.el = el;
    for (let i = 0; i < 3; i++)
      this.lanes.push({
        active: false,
        ownerId: -1,
        o: new Vector3(),
        dx: 0,
        dz: 1,
        len: 0,
        front: 0,
        speed: 1,
        width: 1,
        hit: false,
        spikeAt: 0,
      });
    for (let i = 0; i < 4; i++)
      this.gusts.push({
        active: false,
        ownerId: -1,
        o: new Vector3(),
        dx: 0,
        dz: 1,
        half: 0.5,
        range: 10,
        front: 0,
        speed: 10,
        hit: false,
        ring: false,
        fxT: 0,
        damage: 0.5,
        kb: 10,
      });
  }
  engageThorn(enemy, dt, dist) {
    const d = this.d;
    const sky = enemy.ex.sky;
    const def = enemy.def;
    const pPos = d.pPos;
    sky.whipCd -= dt;
    sky.thornCd -= dt;
    sky.grabCd -= dt;
    const off = Math.abs(skyWrapAngle(Math.atan2(pPos.x - enemy.position.x, pPos.z - enemy.position.z) - enemy.facing));
    if (enemy.token) {
      if (sky.grabCd <= 0 && dist > 5 && dist < ATTACKS.rootgrab.range && enemy.canSee && off < 0.5) {
        d.startTelegraph(enemy, 'rootgrab', dist);
        return;
      }
      if (dist < 3.8 && off < 0.6) {
        d.startTelegraph(enemy, sky.whipCd <= 0 && Math.random() < 0.5 ? 'vinewhip' : 'slam', dist);
        return;
      }
      if (dist < ATTACKS.vinewhip.radius - 1.4 && sky.whipCd <= 0 && off < 0.5) {
        d.startTelegraph(enemy, 'vinewhip', dist);
        return;
      }
      if (sky.thornCd <= 0 && dist > 5.5 && dist < ATTACKS.thorns.range && enemy.canSee) {
        d.startTelegraph(enemy, 'thorns', dist);
        return;
      }
      d.steerTo(enemy, pPos.x, pPos.z, def.runSpeed * 0.85, 0.5);
      if (enemy.tokenWait > 4.5) d.releaseToken(enemy);
      return;
    }
    if (dist > 11) d.steerTo(enemy, pPos.x, pPos.z, def.walkSpeed * 1.6, 1);
    else d.orbit(enemy, dt, enemy.orbitRadius, 0.3, def.walkSpeed);
    if (enemy.cooldown <= 0 && dist < 18) d.requestToken(enemy);
  }
  engageGale(enemy, dt, dist) {
    const d = this.d;
    const sky = enemy.ex.sky;
    const def = enemy.def;
    const pPos = d.pPos;
    sky.gustCd -= dt;
    sky.ringCd -= dt;
    sky.rideCd -= dt;
    if (dist < 5.4) {
      if (sky.ringCd <= 0) {
        if (enemy.token) {
          d.startTelegraph(enemy, 'galering', dist);
          return;
        }
        d.requestToken(enemy);
      } else if (sky.rideCd <= 0 && enemy.grounded) {
        d.startTelegraph(enemy, 'windride', dist);
        return;
      }
      const angle =
        Math.atan2(enemy.position.x - pPos.x, enemy.position.z - pPos.z) +
        Math.sin(d.time * 1.3 + enemy.seed * 10) * 0.7;
      enemy.desired.set(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(def.runSpeed * 1.25);
      enemy.speedCap = def.runSpeed * 1.3;
      return;
    }
    if (enemy.token) {
      if (enemy.canSee && dist >= 4.5 && dist <= ATTACKS.gust.range - 1 && sky.gustCd <= 0) {
        d.startTelegraph(enemy, 'gust', dist);
        return;
      }
      if (enemy.canSee && dist >= ATTACKS.orbs.minRange && dist <= ATTACKS.orbs.maxRange) {
        d.startTelegraph(enemy, 'orbs', dist);
        return;
      }
      if (enemy.tokenWait > 2.5) d.releaseToken(enemy);
    } else if (sky.rideCd <= 0 && enemy.grounded && this.wantsReposition(enemy)) {
      d.startTelegraph(enemy, 'windride', dist);
      return;
    }
    const lost = d.time - enemy.lastSeenT > 1.2;
    if (dist > 15 || lost) d.steerTo(enemy, pPos.x, pPos.z, lost ? def.walkSpeed * 1.6 : def.runSpeed * 0.8, 1);
    else d.orbit(enemy, dt, enemy.orbitRadius, 0.5, def.walkSpeed * 1.4);
    if (enemy.cooldown <= 0 && enemy.canSee && dist >= 4.5 && dist <= ATTACKS.orbs.maxRange) d.requestToken(enemy);
  }
  wantsReposition(enemy) {
    const pPos = this.d.pPos;
    if (this.edgeDir(pPos, _edgeDir) === Infinity) return Math.random() < 0.004;
    const dx = enemy.position.x - pPos.x;
    const dz = enemy.position.z - pPos.z;
    const len = Math.hypot(dx, dz) || 1;
    return (dx * _edgeDir.x + dz * _edgeDir.z) / len > -0.4;
  }
  etaOf(enemy, attack, dist, windup) {
    switch (attack) {
      case 'vinewhip':
        return windup + ATTACKS.vinewhip.strike + ATTACKS.vinewhip.sweep * 0.5;
      case 'thorns':
        return windup * 0.55 + ATTACKS.thorns.eta;
      case 'rootgrab':
        return windup + Math.max(0, dist - enemy.radius) / ATTACKS.rootgrab.speed;
      case 'gust':
        return windup + Math.max(0, dist - 0.8) / ATTACKS.gust.speed;
      case 'galering':
        return windup + ATTACKS.galering.strike + Math.max(0, dist - 0.5) / 14;
      case 'orbs':
        return windup + clamp(dist / 12, 0.8, 1.3);
      default:
        return 0;
    }
  }
  onTelegraph(enemy, attack) {
    const d = this.d;
    const sky = enemy.ex.sky;
    sky.locked = false;
    sky.shots = 0;
    sky.hitDone = false;
    sky.spikeT = 0;
    switch (attack) {
      case 'vinewhip':
        sky.whipCd = skyRand(3.5, 5);
        break;
      case 'thorns':
        sky.thornCd = skyRand(6, 8.5);
        break;
      case 'rootgrab':
        sky.grabCd = skyRand(8, 10.5);
        break;
      case 'gust':
        sky.gustCd = skyRand(5, 7);
        break;
      case 'galering':
        sky.ringCd = skyRand(5.5, 7.5);
        d.fx.marker(
          _skyPos.set(
            enemy.position.x,
            d.ground(enemy.position.x, enemy.position.z, enemy.position.y + 0.5),
            enemy.position.z,
          ),
          ATTACKS.galering.radius,
          enemy.windup + ATTACKS.galering.strike,
          GALE_GOLD,
          2.4,
        );
        break;
      case 'windride':
        sky.rideCd = skyRand(5, 7.5);
        enemy.telegraphing = false;
        enemy.attackEta = 0;
        this.pickRideTarget(enemy, sky.target);
    }
  }
  telegraph(enemy, dt, dist, angle) {
    const d2 = this.d;
    const ex = enemy.ex;
    const sky = ex.sky;
    const attack = enemy.attack;
    const windup = enemy.windup;
    const stateT = enemy.stateT;
    const pPos = d2.pPos;
    if (attack === 'windride')
      enemy.faceTarget = Math.atan2(sky.target.x - enemy.position.x, sky.target.z - enemy.position.z);
    else if (
      stateT <
      windup * (attack === 'vinewhip' ? 0.55 : attack === 'rootgrab' ? 0.7 : attack === 'gust' ? 0.72 : 1)
    )
      enemy.faceTarget = angle;
    ex.surge = Math.max(ex.surge, 0.3 + 0.7 * clamp(stateT / windup, 0, 1));
    const fwdX = Math.sin(enemy.facing);
    const fwdZ = Math.cos(enemy.facing);
    switch (attack) {
      case 'vinewhip':
        if (!sky.locked && stateT >= windup * 0.55) {
          sky.locked = true;
          sky.dir.set(fwdX, 0, fwdZ);
          sky.origin.set(
            enemy.position.x,
            d2.ground(enemy.position.x, enemy.position.z, enemy.position.y + 0.5),
            enemy.position.z,
          );
          const vinewhip = ATTACKS.vinewhip;
          d2.fx.sector(
            sky.origin,
            vinewhip.radius,
            vinewhip.arc,
            enemy.facing,
            Math.max(0.05, windup - stateT + vinewhip.strike + vinewhip.sweep * 0.5),
            VINE_GREEN,
            3.2,
          );
        }
        if (Math.random() < dt * 14) {
          const rig = d2.models.brute.rig;
          partToWorld(enemy, rig, BONE.handR, rig.fists[1], _skyPos);
          d2.fx.sparks(_skyPos, THORN_GLOW, 2, 1.5, 3, 0.07, -1);
        }
        break;
      case 'thorns':
        if (!sky.locked && stateT < windup * 0.55) {
          if (Math.random() < dt * 14) {
            const angle = Math.random() * Math.PI * 2;
            const dist = ATTACKS.thorns.radius * Math.sqrt(Math.random());
            const x = pPos.x + Math.cos(angle) * dist;
            const z = pPos.z + Math.sin(angle) * dist;
            d2.fx.sparks(_skyPos.set(x, d2.ground(x, z, pPos.y + 1) + 0.1, z), THORN_GLOW, 2, 1.2, 3, 0.08, -2);
          }
        } else if (!sky.locked) {
          sky.locked = true;
          this.thornAt(enemy, Math.max(0.15, windup - stateT) + ATTACKS.thorns.eta * 0.5);
          sky.shots = 1;
        }
        break;
      case 'rootgrab': {
        const rootgrab = ATTACKS.rootgrab;
        if (!sky.locked && stateT >= windup * 0.7) {
          sky.locked = true;
          const dx = pPos.x + d2.pVel.x * 0.3 - enemy.position.x;
          const dz = pPos.z + d2.pVel.z * 0.3 - enemy.position.z;
          const len = Math.hypot(dx, dz) || 1;
          sky.dir.set(dx / len, 0, dz / len);
          sky.len = clamp(len + 2.5, 5, rootgrab.range);
          sky.origin.set(
            enemy.position.x,
            d2.ground(enemy.position.x, enemy.position.z, enemy.position.y + 0.5),
            enemy.position.z,
          );
          const remain = windup - stateT;
          for (let along = 2; along <= sky.len; along += 1.7) {
            const x = sky.origin.x + sky.dir.x * along;
            const z = sky.origin.z + sky.dir.z * along;
            d2.fx.marker(
              _skyPos.set(x, d2.ground(x, z, sky.origin.y + 2), z),
              rootgrab.width * 0.75,
              remain + along / rootgrab.speed,
              VINE_GREEN,
              2,
            );
          }
        }
        if (Math.random() < dt * 20) {
          const rig = d2.models.brute.rig;
          partToWorld(
            enemy,
            rig,
            Math.random() < 0.5 ? BONE.handL : BONE.handR,
            rig.fists[Math.random() < 0.5 ? 0 : 1],
            _skyPos,
          );
          const angle = Math.random() * Math.PI * 2;
          const dist = skyRand(1, 1.8);
          d2.fx.glows.spawn(
            d2.time,
            _skyPos.x + Math.cos(angle) * dist,
            _skyPos.y + skyRand(-0.5, 1),
            _skyPos.z + Math.sin(angle) * dist,
            -Math.cos(angle) * dist * 2.5,
            skyRand(-1, 1),
            -Math.sin(angle) * dist * 2.5,
            skyRand(0.06, 0.1),
            0.4,
            THORN_GLOW,
            3,
            0,
            2.5,
            1.5,
          );
        }
        break;
      }
      case 'gust': {
        const gust = ATTACKS.gust;
        if (!sky.locked && stateT >= windup * 0.72) {
          sky.locked = true;
          const dx = pPos.x + d2.pVel.x * 0.25 - enemy.position.x;
          const dz = pPos.z + d2.pVel.z * 0.25 - enemy.position.z;
          const len = Math.hypot(dx, dz) || 1;
          sky.dir.set(dx / len, 0, dz / len);
          sky.origin.set(
            enemy.position.x,
            d2.ground(enemy.position.x, enemy.position.z, enemy.position.y + 0.5),
            enemy.position.z,
          );
          d2.fx.sector(
            sky.origin,
            gust.range,
            gust.half,
            Math.atan2(sky.dir.x, sky.dir.z),
            Math.max(0.05, windup - stateT),
            GALE_GOLD,
            2.6,
          );
        }
        if (sky.locked) enemy.faceTarget = Math.atan2(sky.dir.x, sky.dir.z);
        if (Math.random() < dt * 40) {
          const angle = (sky.locked ? Math.atan2(sky.dir.x, sky.dir.z) : enemy.facing) + skyRand(-gust.half, gust.half);
          const dist = skyRand(3, 9);
          const x = enemy.position.x + Math.sin(angle) * dist;
          const z = enemy.position.z + Math.cos(angle) * dist;
          const y = enemy.position.y + skyRand(0.3, 2.2);
          d2.fx.glows.spawn(
            d2.time,
            x,
            y,
            z,
            -Math.sin(angle) * dist * 2,
            (enemy.position.y + enemy.height * 0.7 - y) * 2,
            -Math.cos(angle) * dist * 2,
            skyRand(0.05, 0.09),
            0.45,
            GALE_GOLD,
            2.5,
            0,
            1.5,
            4,
          );
        }
        break;
      }
      case 'galering':
        if (Math.random() < dt * 34) {
          const angle = Math.random() * Math.PI * 2;
          const dist = ATTACKS.galering.radius * skyRand(0.6, 1);
          const x = enemy.position.x + Math.cos(angle) * dist;
          const z = enemy.position.z + Math.sin(angle) * dist;
          const vx = -Math.cos(angle) * dist * 1.8 - Math.sin(angle) * 5;
          const vz = -Math.sin(angle) * dist * 1.8 + Math.cos(angle) * 5;
          d2.fx.glows.spawn(
            d2.time,
            x,
            enemy.position.y + skyRand(0.2, 2),
            z,
            vx,
            skyRand(-0.5, 0.5),
            vz,
            skyRand(0.05, 0.1),
            0.45,
            GALE_GOLD,
            2.6,
            0,
            2,
            3,
          );
        }
        break;
      case 'windride':
        if (Math.random() < dt * 24) {
          const angle = Math.random() * Math.PI * 2;
          const dist = skyRand(0.8, 1.6) * enemy.scale;
          d2.fx.puffs.spawn(
            d2.time,
            enemy.position.x + Math.cos(angle) * dist,
            enemy.position.y + 0.1,
            enemy.position.z + Math.sin(angle) * dist,
            -Math.sin(angle) * 3,
            skyRand(0.5, 1.5),
            Math.cos(angle) * 3,
            0.25,
            0.8,
            0.6,
            WIND_WHITE,
            0.4,
            0.6,
            2,
          );
        }
        break;
      case 'orbs':
        if (Math.random() < dt * 12) {
          const rig = d2.models.spitter.rig;
          partToWorld(enemy, rig, BONE.mask, rig.mouth, _skyPos);
          d2.fx.sparks(_skyPos, GALE_YELLOW, 2, 1.5, 3, 0.07, -1);
        }
    }
    if (attack === 'windride') {
      enemy.telegraphing = false;
      enemy.attackEta = 0;
    } else if (attack === 'rootgrab' && sky.locked) {
      enemy.attackEta = this.laneEtaFor(
        sky.origin,
        sky.dir.x,
        sky.dir.z,
        enemy.radius,
        ATTACKS.rootgrab.speed,
        sky.len,
        windup - stateT,
      );
      enemy.telegraphing = enemy.attackEta < Infinity;
      if (!enemy.telegraphing) enemy.attackEta = 0;
    } else enemy.attackEta = Math.max(0, this.etaOf(enemy, attack, dist, windup) - stateT);
    if (stateT >= windup) this.startAttack(enemy, dist);
  }
  startAttack(enemy, dist) {
    const d = this.d;
    const ex = enemy.ex;
    const sky = ex.sky;
    const attack = enemy.attack;
    d.setState(enemy, 'attack');
    enemy.attackHit = false;
    enemy.attackFired = false;
    sky.hitDone = false;
    const fwdX = Math.sin(enemy.facing);
    const fwdZ = Math.cos(enemy.facing);
    switch (attack) {
      case 'vinewhip':
        if (!sky.locked) {
          sky.locked = true;
          sky.dir.set(fwdX, 0, fwdZ);
          sky.origin.set(
            enemy.position.x,
            d.ground(enemy.position.x, enemy.position.z, enemy.position.y + 0.5),
            enemy.position.z,
          );
        }
        enemy.attackEta = ATTACKS.vinewhip.strike;
        sky.prevU = 0;
        sky.spikeT = 0;
        break;
      case 'thorns':
        if (sky.shots === 0) {
          this.thornAt(enemy, ATTACKS.thorns.eta);
          sky.shots = 1;
        }
        break;
      case 'rootgrab': {
        const rootgrab = ATTACKS.rootgrab;
        if (!sky.locked) {
          sky.dir.set(fwdX, 0, fwdZ);
          sky.len = clamp(dist + 2.5, 5, rootgrab.range);
          sky.origin.set(
            enemy.position.x,
            d.ground(enemy.position.x, enemy.position.z, enemy.position.y + 0.5),
            enemy.position.z,
          );
        }
        this.addLane(enemy.id, sky.origin, sky.dir, sky.len, enemy.radius * 0.8 + 0.4);
        const rig = d.models.brute.rig;
        for (let i = 0; i < 2; i++) {
          partToWorld(enemy, rig, i === 0 ? BONE.handL : BONE.handR, rig.fists[i], _skyPos);
          d.fx.dust(_skyPos, 5, 0.8, 0.8, ROOT_DUST, 0.5);
          d.fx.sparks(_skyPos, THORN_GLOW, 12, 5, 3, 0.08, 4);
        }
        d.emit('camera:shake', {
          strength: 0.45,
          position: enemy.position.clone(),
        });
        d.emit('enemy:attack', {
          id: enemy.id,
          kind: enemy.kind,
          position: enemy.position.clone(),
          attack,
        });
        ex.surge = 1.3;
        break;
      }
      case 'gust': {
        const gust = ATTACKS.gust;
        if (!sky.locked) {
          sky.dir.set(fwdX, 0, fwdZ);
          sky.origin.set(
            enemy.position.x,
            d.ground(enemy.position.x, enemy.position.z, enemy.position.y + 0.5),
            enemy.position.z,
          );
        }
        this.addGust(
          enemy.id,
          sky.origin,
          sky.dir,
          gust.half,
          gust.range,
          gust.speed,
          gust.damage,
          gust.knockback,
          false,
        );
        d.fx.sectorWave(
          sky.origin,
          gust.range,
          gust.half,
          Math.atan2(sky.dir.x, sky.dir.z),
          gust.range / gust.speed + 0.15,
          GALE_GOLD,
          2.2,
        );
        enemy.anim.kick(CH.MASK_PUSH, 2.5);
        enemy.anim.kick(CH.SQUASH, -3);
        enemy.knock.addScaledVector(sky.dir, -3);
        d.emit('camera:shake', {
          strength: 0.35,
          position: enemy.position.clone(),
        });
        d.emit('enemy:attack', {
          id: enemy.id,
          kind: enemy.kind,
          position: enemy.position.clone(),
          attack,
        });
        ex.surge = 1.4;
        break;
      }
      case 'galering':
        enemy.attackEta = ATTACKS.galering.strike;
        break;
      case 'windride':
        this.leap(enemy);
        break;
      case 'orbs':
        sky.shots = 0;
        enemy.attackEta = 0;
    }
  }
  attack(enemy, dt, dist) {
    const d = this.d;
    const ex = enemy.ex;
    const sky = ex.sky;
    const attack = enemy.attack;
    const stateT = enemy.stateT;
    switch (attack) {
      case 'vinewhip':
        this.sweep(enemy, dt, stateT);
        break;
      case 'thorns': {
        const thorns = ATTACKS.thorns;
        for (; sky.shots < thorns.count && stateT >= (sky.shots - 0.5) * thorns.gap;) {
          this.thornAt(enemy, thorns.eta);
          sky.shots++;
        }
        const eta = this.el.threatEta(enemy);
        enemy.telegraphing = eta < 1.5;
        enemy.attackEta = eta < 1.5 ? eta : 0;
        if (sky.shots >= thorns.count && stateT >= (thorns.count - 1.5) * thorns.gap + 0.3)
          d.setState(enemy, 'recover');
        break;
      }
      case 'rootgrab': {
        const rootgrab = ATTACKS.rootgrab;
        const lane = this.lanes.find((lane) => lane.active && lane.ownerId === enemy.id);
        const eta =
          lane && !lane.hit
            ? this.laneEtaFor(lane.o, lane.dx, lane.dz, lane.front, rootgrab.speed, lane.len, 0)
            : Infinity;
        enemy.telegraphing = eta < Infinity;
        enemy.attackEta = eta < Infinity ? eta : 0;
        if (stateT >= sky.len / rootgrab.speed + 0.15) d.setState(enemy, 'recover');
        break;
      }
      case 'gust': {
        const gust = this.gusts.find((gust) => gust.active && gust.ownerId === enemy.id && !gust.ring);
        const eta = gust && !gust.hit ? this.gustEta(gust) : Infinity;
        enemy.telegraphing = eta < Infinity;
        enemy.attackEta = eta < Infinity ? eta : 0;
        if (stateT >= 0.4) d.setState(enemy, 'recover');
        break;
      }
      case 'galering': {
        const galering = ATTACKS.galering;
        if (!enemy.attackFired && stateT >= galering.strike) {
          enemy.attackFired = true;
          enemy.telegraphing = false;
          const center = _skyPos.set(
            enemy.position.x,
            d.ground(enemy.position.x, enemy.position.z, enemy.position.y + 0.5),
            enemy.position.z,
          );
          this.addGust(
            enemy.id,
            center,
            _skyDir.set(0, 0, 1),
            Math.PI,
            galering.radius,
            15,
            galering.damage,
            galering.knockback,
            true,
          );
          d.fx.waves.spawn(d.time, center.x, center.y, center.z, 0.6, galering.radius + 0.5, 0.45, 2.4, GALE_GOLD, 2.2);
          d.fx.ring(center, 0.5, galering.radius + 0.5, 0.5, GALE_GOLD, 3);
          d.fx.dust(center, 12, 2.5, 1.1, WIND_WHITE, 0.45);
          d.emit('camera:shake', {
            strength: 0.5,
            position: center.clone(),
          });
          d.emit('enemy:attack', {
            id: enemy.id,
            kind: enemy.kind,
            position: center.clone(),
            attack,
          });
          ex.surge = 1.5;
        }
        if (stateT >= galering.strike + 0.3) d.setState(enemy, 'recover');
        break;
      }
      case 'windride':
        enemy.telegraphing = false;
        enemy.faceTarget = Math.atan2(enemy.vel.x, enemy.vel.z);
        sky.trailT -= dt;
        if (sky.trailT <= 0) {
          sky.trailT = 0.045;
          d.fx.puffs.spawn(
            d.time,
            enemy.position.x + skyRand(-0.3, 0.3),
            enemy.position.y + skyRand(0, 0.6),
            enemy.position.z + skyRand(-0.3, 0.3),
            -enemy.vel.x * 0.1,
            skyRand(-0.3, 0.3),
            -enemy.vel.z * 0.1,
            0.35,
            1.2,
            0.8,
            WIND_WHITE,
            0.45,
            0.2,
            2,
          );
          if (Math.random() < 0.5) d.fx.sparks(enemy.position, GALE_YELLOW, 2, 2, 3, 0.07, 1);
        }
        if (stateT > sky.flight + 1.2) this.windrideLand(enemy);
        break;
      case 'orbs': {
        const orbs = ATTACKS.orbs;
        for (; sky.shots < orbs.count && stateT >= sky.shots * orbs.gap;) {
          this.fireOrb(enemy, sky.shots, dist);
          sky.shots++;
        }
        if (stateT >= orbs.gap * (orbs.count - 1) + 0.25) d.setState(enemy, 'recover');
        break;
      }
      default:
        d.setState(enemy, 'recover');
    }
  }
  sweep(enemy, dt, stateT) {
    const d2 = this.d;
    const sky = enemy.ex.sky;
    const vinewhip = ATTACKS.vinewhip;
    const angle = Math.atan2(sky.dir.x, sky.dir.z);
    if (stateT >= vinewhip.strike && stateT <= vinewhip.strike + vinewhip.sweep + dt) {
      if (!enemy.attackFired) {
        enemy.attackFired = true;
        d2.emit('enemy:attack', {
          id: enemy.id,
          kind: enemy.kind,
          position: enemy.position.clone(),
          attack: 'vinewhip',
        });
        d2.emit('camera:shake', {
          strength: 0.35,
          position: enemy.position.clone(),
        });
      }
      const progress = clamp((stateT - vinewhip.strike) / vinewhip.sweep, 0, 1);
      const sweepAngle = angle + vinewhip.arc * (1 - 2 * progress);
      sky.spikeT -= dt;
      if (sky.spikeT <= 0) {
        sky.spikeT = 0.03;
        for (const frac of [0.34, 0.56, 0.78, 0.97]) {
          const dist = vinewhip.radius * frac + skyRand(-0.2, 0.2);
          const x = sky.origin.x + Math.sin(sweepAngle) * dist;
          const z = sky.origin.z + Math.cos(sweepAngle) * dist;
          const y = d2.fxFloor(x, z, sky.origin.y);
          this.el.spikes.spawn(
            d2.time,
            _skyPos.set(x, y - 0.15, z),
            _skyDir.set(
              Math.sin(sweepAngle) * 0.5 - Math.cos(sweepAngle) * 0.35,
              1,
              Math.cos(sweepAngle) * 0.5 + Math.sin(sweepAngle) * 0.35,
            ),
            skyRand(1, 1.6) * (0.7 + frac * 0.4),
            skyRand(0.28, 0.38),
            0.8,
            SPIKE_KIND.green,
          );
          if (Math.random() < 0.4) d2.fx.dust(_skyPos, 1, 0.3, 0.55, ROOT_DUST, 0.4);
        }
      }
      for (let i = 1; i <= 9; i++) {
        const dist = (vinewhip.radius * i) / 9;
        const lift = Math.sin((i / 9) * Math.PI) * 0.35;
        d2.fx.glows.spawn(
          d2.time,
          sky.origin.x + Math.sin(sweepAngle) * dist,
          sky.origin.y + 0.35 + lift,
          sky.origin.z + Math.cos(sweepAngle) * dist,
          -Math.cos(sweepAngle) * 3,
          0.3,
          Math.sin(sweepAngle) * 3,
          0.16,
          0.1,
          THORN_GLOW,
          2.6,
          0,
          1,
          0,
        );
      }
      if (!sky.hitDone && d2.pAlive) {
        const pPos = d2.pPos;
        const dx = pPos.x - sky.origin.x;
        const dz = pPos.z - sky.origin.z;
        const dist = Math.hypot(dx, dz);
        const rel = skyWrapAngle(Math.atan2(dx, dz) - angle);
        const at = (1 - rel / vinewhip.arc) / 2;
        const height = pPos.y - d2.fxFloor(pPos.x, pPos.z, pPos.y);
        if (
          dist <= vinewhip.radius + 0.4 &&
          dist > 0.3 &&
          Math.abs(rel) <= vinewhip.arc + 0.12 &&
          at <= progress + 0.06 &&
          at >= sky.prevU - 0.1 &&
          height < 1 &&
          Math.abs(pPos.y - sky.origin.y) < 2.5
        ) {
          sky.hitDone = true;
          const kx = -Math.cos(sweepAngle);
          const kz = Math.sin(sweepAngle);
          const dir = _skyKnock.set(kx + (dx / (dist || 1)) * 0.6, 0, kz + (dz / (dist || 1)) * 0.6).normalize();
          d2.hurtPlayer(enemy, vinewhip.damage, dir, vinewhip.knockback);
        }
      }
      sky.prevU = progress;
      enemy.telegraphing = !sky.hitDone && progress < 1;
      enemy.attackEta = 0;
    }
    if (stateT > vinewhip.strike + vinewhip.sweep + 0.15) {
      enemy.telegraphing = false;
      d2.setState(enemy, 'recover');
    }
  }
  thornAt(enemy, eta) {
    const d = this.d;
    const pPos = d.pPos;
    const x = pPos.x + d.pVel.x * 0.35;
    const z = pPos.z + d.pVel.z * 0.35;
    this.el.addEruption(
      enemy,
      _skyPos.set(x, d.ground(x, z, pPos.y + 1), z),
      ATTACKS.thorns.radius,
      eta,
      ATTACKS.thorns.damage,
    );
    if (enemy.ex.sky.shots > 0)
      d.emit('enemy:telegraph', {
        id: enemy.id,
        kind: enemy.kind,
        position: _skyPos.clone(),
        attack: 'thorns',
        eta,
      });
  }
  fireOrb(enemy, shot, dist) {
    const d2 = this.d;
    const rig = d2.models.spitter.rig;
    const mouth = partToWorld(enemy, rig, BONE.mask, rig.mouth, new Vector3());
    const flight = clamp(dist / 12, 0.8, 1.3) + shot * 0.08;
    const pPos = d2.pPos;
    const dx = pPos.x - enemy.position.x;
    const dz = pPos.z - enemy.position.z;
    const len = Math.hypot(dx, dz) || 1;
    const side = shot === 0 ? 0 : shot === 1 ? -1 : 1;
    const tx = pPos.x + d2.pVel.x * flight * 0.4 + (-dz / len) * side * 2.4;
    const tz = pPos.z + d2.pVel.z * flight * 0.4 + (dx / len) * side * 2.4;
    const target = _skyPos.set(tx, d2.ground(tx, tz, pPos.y + 1), tz);
    const orbs = ATTACKS.orbs;
    if (
      d2.globs.fire(mouth, target, flight, enemy.id, {
        element: 'yellow',
        size: 1.55,
        bounces: orbs.bounces,
        dmg: orbs.damage,
      })
    ) {
      enemy.telegraphing = true;
      enemy.attackEta = flight;
    }
    enemy.anim.kick(CH.MASK_PUSH, 1.8);
    d2.fx.sparks(mouth, GALE_YELLOW, 10, 3, 3, 0.08, 1);
    d2.emit('enemy:attack', {
      id: enemy.id,
      kind: enemy.kind,
      position: enemy.position.clone(),
      attack: 'orbs',
    });
  }
  pickRideTarget(enemy, out) {
    const d = this.d;
    const pPos = d.pPos;
    const leash = ELITE.leash * 0.7;
    const ok = (x, z) =>
      Math.hypot(x - enemy.home.x, z - enemy.home.z) > leash
        ? false
        : d.skyAt(enemy.position.x, enemy.position.z) === null
          ? d.waterDepth(x, z) < 0.2
          : d.skyGroundOk(x, z, enemy.home.y, 1.8);
    const edge = this.edgeDir(pPos, _edgeDir);
    const base =
      edge < Infinity
        ? Math.atan2(-_edgeDir.x, -_edgeDir.z)
        : Math.atan2(enemy.position.x - pPos.x, enemy.position.z - pPos.z) + (Math.random() < 0.5 ? 1.3 : -1.3);
    const offsets = [0, 0.6, -0.6, 1.2, -1.2, 2, -2, Math.PI];
    for (const off of offsets) {
      const angle = base + off;
      const dist = edge < Infinity ? 8 : 8.5;
      const x = pPos.x + Math.sin(angle) * dist;
      const z = pPos.z + Math.cos(angle) * dist;
      if (ok(x, z)) {
        out.set(x, 0, z);
        return;
      }
    }
    out.set(enemy.home.x, 0, enemy.home.z);
  }
  leap(enemy) {
    const d = this.d;
    const sky = enemy.ex.sky;
    const flight = ATTACKS.windride.flight;
    const tx = sky.target.x;
    const tz = sky.target.z;
    const ty = d.ground(tx, tz, enemy.position.y + 4);
    sky.flight = flight;
    enemy.vel.set(
      (tx - enemy.position.x) / flight,
      (ty - enemy.position.y) / flight + 12 * flight,
      (tz - enemy.position.z) / flight,
    );
    enemy.grounded = false;
    enemy.airLock = 0.2;
    enemy.ballistic = true;
    enemy.speedCap = Math.hypot(enemy.vel.x, enemy.vel.z) + 1;
    enemy.telegraphing = false;
    enemy.attackEta = 0;
    enemy.anim.kick(CH.SQUASH, 5);
    sky.trailT = 0;
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      d.fx.puffs.spawn(
        d.time,
        enemy.position.x,
        enemy.position.y + 0.1,
        enemy.position.z,
        Math.cos(angle) * 5,
        skyRand(0.2, 1),
        Math.sin(angle) * 5,
        0.3,
        1.3,
        0.8,
        WIND_WHITE,
        0.5,
        0.3,
        3,
      );
    }
    d.fx.sparks(enemy.position, GALE_YELLOW, 14, 5, 3, 0.08, 4);
    d.emit('enemy:attack', {
      id: enemy.id,
      kind: enemy.kind,
      position: enemy.position.clone(),
      attack: 'windride',
    });
  }
  windrideLand(enemy) {
    const d = this.d;
    const ex = enemy.ex;
    enemy.ballistic = false;
    enemy.speedCap = 0;
    enemy.vel.x = enemy.vel.z = 0;
    enemy.telegraphing = false;
    enemy.attackEta = 0;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      d.fx.puffs.spawn(
        d.time,
        enemy.position.x,
        enemy.position.y + 0.1,
        enemy.position.z,
        Math.cos(angle) * 3,
        0.3,
        Math.sin(angle) * 3,
        0.3,
        1.1,
        0.7,
        WIND_WHITE,
        0.45,
        0.2,
        3,
      );
    }
    enemy.anim.kick(CH.SQUASH, -4);
    ex.recoverT = ATTACKS.windride.recover;
    ex.sky.gustCd = Math.min(ex.sky.gustCd, 0.6);
    enemy.cooldown = Math.min(enemy.cooldown, 0.3);
    d.setState(enemy, 'recover');
  }
  addLane(ownerId, start, dir, len, front) {
    const rootgrab = ATTACKS.rootgrab;
    let lane = this.lanes.find((lane) => !lane.active);
    lane ||= this.lanes[0];
    lane.active = true;
    lane.ownerId = ownerId;
    lane.o.copy(start);
    lane.dx = dir.x;
    lane.dz = dir.z;
    lane.len = len;
    lane.front = front;
    lane.speed = rootgrab.speed;
    lane.width = rootgrab.width;
    lane.hit = false;
    lane.spikeAt = front;
  }
  addGust(ownerId, start, dir, half, range, speed, damage, kb, ring) {
    let gust = this.gusts.find((gust) => !gust.active);
    gust ||= this.gusts[0];
    gust.active = true;
    gust.ownerId = ownerId;
    gust.o.copy(start);
    gust.dx = dir.x;
    gust.dz = dir.z;
    gust.half = half;
    gust.range = range;
    gust.front = ring ? 0.6 : 0.9;
    gust.speed = speed;
    gust.hit = false;
    gust.ring = ring;
    gust.fxT = 0;
    gust.damage = damage;
    gust.kb = kb;
  }
  laneEtaFor(start, dx, dz, front, speed, len, delay) {
    const d2 = this.d;
    if (!d2.pAlive) return Infinity;
    const px = d2.pPos.x - start.x;
    const pz = d2.pPos.z - start.z;
    const along = px * dx + pz * dz;
    const across = Math.abs(px * dz - pz * dx);
    return along < front - 0.5 || along > len + 0.5 || across > ATTACKS.rootgrab.width + 0.4
      ? Infinity
      : delay + Math.max(0, along - front) / speed;
  }
  gustEta(gust) {
    const d = this.d;
    if (!d.pAlive) return Infinity;
    const dx = d.pPos.x - gust.o.x;
    const dz = d.pPos.z - gust.o.z;
    const dist = Math.hypot(dx, dz);
    return dist > gust.range + 0.5 ||
      dist < gust.front - 0.5 ||
      (!gust.ring && Math.abs(skyWrapAngle(Math.atan2(dx, dz) - Math.atan2(gust.dx, gust.dz))) > gust.half + 0.1)
      ? Infinity
      : Math.max(0, dist - gust.front) / gust.speed;
  }
  threatEta(enemy) {
    let eta = Infinity;
    for (const lane of this.lanes)
      if (lane.active && !lane.hit && lane.ownerId === enemy.id)
        eta = Math.min(eta, this.laneEtaFor(lane.o, lane.dx, lane.dz, lane.front, lane.speed, lane.len, 0));
    for (const gust of this.gusts)
      if (gust.active && !gust.hit && gust.ownerId === enemy.id) eta = Math.min(eta, this.gustEta(gust));
    return eta;
  }
  edgeDir(pos, out) {
    const d = this.d;
    const baseY = d.skyAt(pos.x, pos.z);
    if (baseY === null) return Infinity;
    let best = Infinity;
    for (let ray = 0; ray < 12; ray++) {
      const angle = (ray / 12) * Math.PI * 2;
      const sx = Math.sin(angle);
      const sz = Math.cos(angle);
      for (let dist = 1.5; dist <= 18 && dist < best; dist += 1.5) {
        const y = d.skyAt(pos.x + sx * dist, pos.z + sz * dist);
        if (y === null || y < baseY - 3) {
          best = dist;
          out.set(sx, 0, sz);
          break;
        }
      }
    }
    return best;
  }
  update(dt) {
    if (dt <= 0) return;
    const d = this.d;
    const pPos = d.pPos;
    for (const lane of this.lanes) {
      if (!lane.active) continue;
      const step = lane.speed * dt;
      for (lane.front += step; lane.spikeAt < Math.min(lane.front, lane.len);) {
        const jitter = skyRand(-0.35, 0.35);
        const x = lane.o.x + lane.dx * lane.spikeAt - lane.dz * jitter;
        const z = lane.o.z + lane.dz * lane.spikeAt + lane.dx * jitter;
        const y = d.fxFloor(x, z, lane.o.y);
        this.el.spikes.spawn(
          d.time,
          _skyPos.set(x, y - 0.12, z),
          _skyDir.set(lane.dx * 0.4 + skyRand(-0.3, 0.3), 1, lane.dz * 0.4 + skyRand(-0.3, 0.3)),
          skyRand(0.8, 1.3),
          skyRand(0.22, 0.3),
          1.1,
          SPIKE_KIND.green,
        );
        d.fx.dust(_skyPos, 1, 0.25, 0.45, ROOT_DUST, 0.4);
        if (Math.random() < 0.6) d.fx.sparks(_skyPos.setY(y + 0.2), THORN_GLOW, 3, 2, 3, 0.07, 2);
        lane.spikeAt += 0.75;
      }
      if (!lane.hit && d.pAlive) {
        const dx = pPos.x - lane.o.x;
        const dz = pPos.z - lane.o.z;
        const along = dx * lane.dx + dz * lane.dz;
        const across = Math.abs(dx * lane.dz - dz * lane.dx);
        const height = pPos.y - d.fxFloor(pPos.x, pPos.z, pPos.y);
        if (
          along <= lane.front + 0.3 &&
          along >= lane.front - step - 1 &&
          along <= lane.len + 0.6 &&
          across <= lane.width &&
          height < 1.3 &&
          Math.abs(pPos.y - lane.o.y) < 3
        ) {
          lane.hit = true;
          if (
            d.hurtPlayerFrom(
              'vines',
              lane.ownerId,
              ATTACKS.rootgrab.damage,
              _skyKnock.set(-lane.dx, 0, -lane.dz),
              ATTACKS.rootgrab.knockback,
              ATTACKS.rootgrab.slow,
            )
          )
            this.bindHero(ATTACKS.rootgrab.slow);
          d.fx.sparks(_skyPos.set(pPos.x, pPos.y + 0.8, pPos.z), THORN_GLOW, 18, 5, 3.5, 0.08, 2);
          for (let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2 + skyRand(-0.3, 0.3);
            const x = pPos.x + Math.cos(angle) * 0.9;
            const z = pPos.z + Math.sin(angle) * 0.9;
            this.el.spikes.spawn(
              d.time,
              _skyPos.set(x, d.ground(x, z, pPos.y + 1) - 0.1, z),
              _skyDir.set(-Math.cos(angle) * 0.5, 1, -Math.sin(angle) * 0.5),
              skyRand(0.7, 1.1),
              0.2,
              1.6,
              SPIKE_KIND.green,
            );
          }
        }
      }
      if (lane.front >= lane.len) lane.active = false;
    }
    for (const gust of this.gusts) {
      if (!gust.active) continue;
      const step = gust.speed * dt;
      gust.front += step;
      this.gustFx(gust, dt);
      if (!gust.hit && d.pAlive) {
        const dx = pPos.x - gust.o.x;
        const dz = pPos.z - gust.o.z;
        const dist = Math.hypot(dx, dz);
        let inside = dist <= gust.range + 0.5 && dist <= gust.front + 0.4 && dist >= gust.front - step - 1.2;
        if (inside && !gust.ring)
          inside = Math.abs(skyWrapAngle(Math.atan2(dx, dz) - Math.atan2(gust.dx, gust.dz))) <= gust.half + 0.08;
        if (inside && pPos.y - gust.o.y < 5 && pPos.y - gust.o.y > -2.5) {
          gust.hit = true;
          const dir = gust.ring
            ? _skyDir.set(dist > 0.05 ? dx / dist : 0, 0, dist > 0.05 ? dz / dist : 1)
            : _skyDir.set(gust.dx, 0, gust.dz);
          const push = _skyKnock.copy(dir);
          if (this.edgeDir(pPos, _edgeDir) < 14) push.multiplyScalar(0.55).addScaledVector(_edgeDir, 0.45);
          if (push.lengthSq() < 0.0001) push.copy(dir);
          push.normalize();
          if (d.hurtPlayerFrom('gust', gust.ownerId, gust.damage, push, gust.kb)) {
            for (let i = 0; i < 10; i++)
              d.fx.glows.spawn(
                d.time,
                pPos.x + skyRand(-0.5, 0.5),
                pPos.y + skyRand(0.2, 1.8),
                pPos.z + skyRand(-0.5, 0.5),
                push.x * skyRand(10, 16),
                skyRand(0, 2),
                push.z * skyRand(10, 16),
                skyRand(0.05, 0.09),
                0.35,
                GALE_GOLD,
                3,
                0,
                2,
                4,
              );
            d.fx.puffs.spawn(
              d.time,
              pPos.x,
              pPos.y + 0.8,
              pPos.z,
              push.x * 6,
              0.5,
              push.z * 6,
              0.4,
              1.6,
              0.7,
              WIND_WHITE,
              0.5,
              0.3,
              2,
            );
          }
        }
      }
      if (gust.front > gust.range + 1) gust.active = false;
    }
    const heroVines = this.heroVines;
    if (heroVines.active) {
      heroVines.t += dt;
      let slowedUntil = -1;
      try {
        slowedUntil = this.ctx.player?.state?.slowedUntil ?? -1;
      } catch {
        slowedUntil = -1;
      }
      if (slowedUntil > 0 && heroVines.t > 0.35 && d.time > slowedUntil + 0.05)
        heroVines.t = Math.max(heroVines.t, heroVines.dur - 0.35);
      if (heroVines.t >= heroVines.dur || !d.pAlive) heroVines.active = false;
    }
  }
  gustFx(gust, dt) {
    const d = this.d;
    if (gust.front > gust.range + 0.5 || ((gust.fxT -= dt), gust.fxT > 0)) return;
    gust.fxT = 0.028;
    const angle = Math.atan2(gust.dx, gust.dz);
    const count = gust.ring ? 8 : 5;
    for (let i = 0; i < count; i++) {
      const heading = gust.ring ? Math.random() * Math.PI * 2 : angle + skyRand(-gust.half, gust.half);
      const dist = Math.max(0.5, gust.front * skyRand(0.82, 1));
      const x = gust.o.x + Math.sin(heading) * dist;
      const z = gust.o.z + Math.cos(heading) * dist;
      const spd = gust.speed * skyRand(0.9, 1.25);
      d.fx.glows.spawn(
        d.time,
        x,
        gust.o.y + skyRand(0.15, 2.4),
        z,
        Math.sin(heading) * spd,
        skyRand(-0.5, 1.5),
        Math.cos(heading) * spd,
        skyRand(0.05, 0.09),
        skyRand(0.25, 0.4),
        GALE_GOLD,
        2.4,
        0,
        1.2,
        4,
      );
    }
    if (Math.random() < 0.6) {
      const heading = gust.ring ? Math.random() * Math.PI * 2 : angle + skyRand(-gust.half * 0.8, gust.half * 0.8);
      const dist = gust.front * skyRand(0.8, 1);
      d.fx.puffs.spawn(
        d.time,
        gust.o.x + Math.sin(heading) * dist,
        gust.o.y + skyRand(0.3, 1.4),
        gust.o.z + Math.cos(heading) * dist,
        Math.sin(heading) * gust.speed * 0.6,
        0.3,
        Math.cos(heading) * gust.speed * 0.6,
        0.4,
        1.5,
        0.7,
        WIND_WHITE,
        0.32,
        0.2,
        1.5,
      );
    }
  }
  bindHero(dur) {
    const heroVines = this.heroVines;
    heroVines.active = true;
    heroVines.t = 0;
    heroVines.dur = dur;
    heroVines.seed = Math.random();
  }
  aura(enemy, dt, camDistSq) {
    const ex = enemy.ex;
    if (!ex || ex.style !== 'galecaller' || camDistSq > 2025) return;
    const d = this.d;
    ex.sky.trailT -= dt;
    if ((enemy.state === 'attack' && enemy.attack === 'windride') || ex.sky.trailT > 0) return;
    ex.sky.trailT = 0.09;
    const angle = d.time * 2.4 + Math.random() * 0.8;
    const radius = enemy.radius * 1.7;
    const vx = Math.cos(angle) * 3.5;
    const vz = -Math.sin(angle) * 3.5;
    d.fx.puffs.spawn(
      d.time,
      enemy.position.x + Math.sin(angle) * radius,
      enemy.position.y + skyRand(0.2, enemy.height * 0.9),
      enemy.position.z + Math.cos(angle) * radius,
      vx,
      skyRand(0.2, 0.8),
      vz,
      0.18,
      0.6,
      0.9,
      WIND_WHITE,
      0.3,
      0.3,
      1,
    );
  }
  render() {
    const heroVines = this.heroVines;
    if (!heroVines.active || !this.d.pAlive || (this.ctx.character && !this.ctx.character.isStub)) return;
    const fade = Math.min(1, heroVines.t / 0.25) * (1 - clamp((heroVines.t - (heroVines.dur - 0.4)) / 0.4, 0, 1));
    if (!(fade <= 0.01)) this.d.vines.add(this.d.pPos, 0, 0.44, 1.35, fade, heroVines.seed);
  }
  onKilled(enemy) {
    for (const lane of this.lanes) if (lane.ownerId === enemy.id) lane.active = false;
    for (const gust of this.gusts) if (gust.ownerId === enemy.id) gust.hit = true;
  }
  reset() {
    for (const lane of this.lanes) lane.active = false;
    for (const gust of this.gusts) gust.active = false;
    this.heroVines.active = false;
  }
}
