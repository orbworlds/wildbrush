/**
 * Another player's hero, played back from the pose they send: the same model, animator, scarf,
 * glider and Sky Mantle as yours, on a player state of its own that drive() keeps up from the pose.
 * It runs on its own clock and event bus, so pausing your game, your slow-motion, your hits and your
 * enemies leave it be, and it fades on its own when your camera comes into it. heroPose() reads the
 * pose off your hero.
 */
import { Group, MathUtils, Vector3 } from 'three';
import { COLORS, GRAVITY_Y, PALETTE } from '../core/config.js';
import { EventBus } from '../core/events.js';
import { createPlayerState } from '../core/stubs.js';
import { DODGES, MOVES } from '../shared/combat-defs.js';
import { floorHeightAt } from '../shared/skyground.js';
import { LOCO_MODES } from './animator-constants.js';
import { HeroAnimator } from './animator.js';
import { classicHood, outfitScarf } from './body-mesh.js';
import { CapeCloth } from './cape.js';
import { clothColliders, fitCape, fitScarf } from './cloth-fit.js';
import { CANOPIES, Glider } from './glider.js';
import { HeroModel } from './hero-model.js';
import { heroProbes } from './probes.js';
import { Scarf } from './scarf.js';

/**
 * The pose a hero is seen by: x, y, z (its feet), ry (facing), vx, vy, vz, mode, on (on the ground),
 * paint (the colour in hand) and counts of its jumps and bounces; and only when they apply: run
 * (sprinting), outfit ('sky'), aim, charge (0–1), wx and wz (the wall it climbs), atk ("count move")
 * and dodge ("count direction") once there has been one. Null while the hero is down.
 */
export function heroPose(state) {
  const seen = {
    jump: state.lastJumpTime,
    bounce: state.lastBounceTime,
    attack: state.lastAttackTime,
    dodge: state.lastDodgeTime,
  };
  let jumps = 0;
  let bounces = 0;
  let attacks = 0;
  let dodges = 0;
  let move = null;
  return () => {
    if (state.lastJumpTime !== seen.jump) {
      seen.jump = state.lastJumpTime;
      jumps++;
    }
    if (state.lastBounceTime !== seen.bounce) {
      seen.bounce = state.lastBounceTime;
      bounces++;
    }
    if (state.lastAttackTime !== seen.attack) {
      seen.attack = state.lastAttackTime;
      attacks++;
    }
    if (state.lastDodgeTime !== seen.dodge) {
      seen.dodge = state.lastDodgeTime;
      dodges++;
    }
    if (state.attack) move = state.attack.move;
    if (state.dead) return null;
    const pos = state.position;
    const vel = state.velocity;
    const pose = {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      ry: state.facing,
      vx: vel.x,
      vy: vel.y,
      vz: vel.z,
      mode: state.mode,
      on: state.grounded,
      paint: state.selectedColor,
      jumps,
      bounces,
    };
    if (state.sprinting) pose.run = true;
    if (state.outfit === 'sky') pose.outfit = 'sky';
    if (state.aiming) pose.aim = true;
    if (state.charge > 0) pose.charge = state.charge;
    if (state.mode === 'climb') {
      pose.wx = state.wallNormal.x;
      pose.wz = state.wallNormal.z;
    }
    if (attacks && move) pose.atk = `${attacks} ${move}`;
    if (dodges) pose.dodge = `${dodges} ${state.dodgeDir}`;
    return pose;
  };
}

const NO_ENEMIES = {
  get: () => undefined,
  query: () => [],
  alertedCount: 0,
};
const CLIMB_SPEED = 1.2;
const num = (n) => (Number.isFinite(n) ? n : 0);
const counted = (s) => {
  const [count, what] = typeof s === 'string' ? s.split(' ') : [];
  return [count ?? null, what ?? null];
};
const stick = (n) => (Math.abs(n) < 0.2 ? 0 : MathUtils.clamp(n, -1, 1));
/** What every double shares: the outfit geometries (not your hero's own) and the probes. */
const sharedOf = new WeakMap();
function shared(ctx) {
  let s = sharedOf.get(ctx);
  if (!s) {
    s = {
      geos: {},
      probes: heroProbes(ctx),
    };
    sharedOf.set(ctx, s);
  }
  return s;
}

export class HeroDouble {
  group = new Group();
  state = createPlayerState();
  clock = {
    elapsed: 0,
    dt: 0,
    realDt: 0,
    scale: 1,
    frame: 0,
    hitStop() {},
    slowMo() {},
  };
  fade = {
    value: 1,
  };
  look = null;
  glider = null;
  canopy = null;
  cape = null;
  placed = false;
  seen = {};
  vy = 0;
  fallVy = 0;
  flickAt = -9;
  hit = {
    y: 0,
    normal: new Vector3(0, 1, 0),
  };
  scarfColliders = clothColliders(9);
  capeColliders = clothColliders(14);
  constructor(ctx) {
    const { geos, probes } = shared(ctx);
    const own = Object.create(ctx);
    own.time = this.clock;
    own.player = {
      isStub: true,
      state: this.state,
      hasItem: () => false,
    };
    own.events = new EventBus();
    own.enemies = NO_ENEMIES;
    own.paint = null;
    own.heroFade = this.fade;
    this.ctx = own;
    this.probe = probes.ground;
    this.group.name = 'hero-double';
    this.hero = new HeroModel(own, geos);
    this.group.add(this.hero.group);
    this.anim = new HeroAnimator(own, this.hero, probes.ground);
    this.anim.ledgeProbe = probes.ledge;
    this.scarf = new Scarf(own, this.hero.mats.body);
    this.scarf.mesh.name = 'double-scarf';
    this.group.add(this.scarf.mesh);
  }
  /** The scarf they wear (its tails, wrap and knot): [base, dark, band, tip?], or null for their outfit's own. */
  setScarf(look) {
    this.look = look;
    this.paintScarf();
  }
  /** The hood they wear: [base, light, lining], or null for the classic. */
  setHood(colors) {
    const [base, light, lining] = colors ?? classicHood();
    const hood = this.hero.mats.hood;
    hood.base.value.set(base);
    hood.light.value.set(light);
    hood.lining.value.set(lining);
  }
  /** Their glider's canopy: a CANOPIES key, or null for the classic (the glider is made when they first glide). */
  setGlider(canopy) {
    this.canopy = CANOPIES[canopy] ?? null;
    this.glider?.setDesign(this.canopy);
  }
  /** One of their throws: the brush flicks toward where the blob flew. */
  flick(origin, velocity) {
    const state = this.state;
    state.lastFlickTime = this.clock.elapsed;
    this.flickAt = this.clock.elapsed;
    state.aimTarget.copy(velocity).normalize().multiplyScalar(10).add(origin);
  }
  /** Plays the hero on to `pose` (heroPose's fields; x, y, z and ry may be smoothed), `dt` seconds on. */
  drive(pose, dt) {
    const step = Math.min(dt, 0.1);
    const clock = this.clock;
    clock.dt = step;
    clock.realDt = step;
    clock.elapsed += dt;
    clock.frame++;
    const now = clock.elapsed;
    const state = this.state;
    const seen = this.seen;
    const pos = state.position;
    const vel = state.velocity;
    const x = num(pose.x);
    let y = num(pose.y);
    const z = num(pose.z);
    const mode = LOCO_MODES.includes(pose.mode) ? pose.mode : 'ground';
    const grounded = typeof pose.on === 'boolean' ? pose.on : mode === 'ground' || mode === 'slide';
    if (grounded && (mode === 'ground' || mode === 'slide')) {
      // their feet on our ground: the smoothed height lags on slopes
      const groundY = this.probe(x, z, y, this.hit).y;
      if (Math.abs(groundY - y) < 0.5) y = groundY;
    }
    const sample = pose.vy !== seen.vy;
    seen.vy = pose.vy;
    if (sample) this.vy = num(pose.vy);
    else if (mode === 'air' && !grounded) this.vy = Math.max(-40, this.vy + GRAVITY_Y * dt);
    // somewhere else all at once (a respawn, a long way between updates): start over there
    const jumped = !this.placed || Math.hypot(x - pos.x, y - pos.y, z - pos.z) > Math.max(6, 50 * dt);
    if (jumped || dt <= 0) vel.set(num(pose.vx), this.vy, num(pose.vz));
    else {
      // how fast the body moves, so the feet keep up with it
      const k = 1 - Math.exp(-12 * dt);
      vel.x += ((x - pos.x) / dt - vel.x) * k;
      vel.z += ((z - pos.z) / dt - vel.z) * k;
      vel.y = this.vy;
    }
    pos.set(x, y, z);
    if (jumped) {
      this.anim.init = false;
      this.scarf.reset();
      this.cape?.reset();
    }
    const [atkCount, atkMove] = counted(pose.atk);
    const [dodgeCount, dodgeDir] = counted(pose.dodge);
    if (this.placed) {
      if (pose.jumps !== seen.jumps) {
        state.lastJumpTime = now;
        if (!state.grounded && state.mode === 'air' && !state.aiming && !state.attack)
          this.anim.triggerFlip('flip', 0.5);
      }
      if (pose.bounces !== seen.bounces) state.lastBounceTime = now;
      if (atkCount !== seen.atk && Object.hasOwn(MOVES, atkMove)) {
        state.attack = {
          move: atkMove,
          t: 0,
          duration: MOVES[atkMove].duration,
        };
        state.lastAttackTime = now;
      }
      if (dodgeCount !== seen.dodge && Object.hasOwn(DODGES, dodgeDir)) {
        state.lastDodgeTime = now;
        state.dodgeDir = dodgeDir;
      }
    }
    seen.jumps = pose.jumps;
    seen.bounces = pose.bounces;
    seen.atk = atkCount;
    seen.dodge = dodgeCount;
    this.placed = true;
    if (grounded && !state.grounded && state.airTime > 0.2) {
      state.lastLandTime = now;
      state.lastLandImpact = Math.max(0, -this.fallVy);
    }
    this.fallVy = grounded ? 0 : Math.min(this.fallVy, vel.y);
    state.airTime = grounded ? 0 : state.airTime + dt;
    state.grounded = grounded;
    state.mode = mode;
    state.facing = num(pose.ry);
    const speed = Math.hypot(vel.x, vel.z);
    state.speed = speed;
    if (speed < 0.05) state.moveIntent.set(0, 0);
    else state.moveIntent.set(vel.x, vel.z).multiplyScalar(1 / Math.max(1, speed));
    state.sprinting = pose.run === true;
    state.aiming = pose.aim === true;
    state.charge = MathUtils.clamp(num(pose.charge), 0, 1);
    if (COLORS.includes(pose.paint)) state.selectedColor = pose.paint;
    state.outfit = pose.outfit === 'sky' ? 'sky' : 'classic';
    if (mode === 'climb') {
      if (Math.hypot(num(pose.wx), num(pose.wz)) > 0.1) state.wallNormal.set(pose.wx, 0, pose.wz).normalize();
      const wall = state.wallNormal;
      state.climbInput.set(stick(-(vel.x * wall.z - vel.z * wall.x) / CLIMB_SPEED), stick(vel.y / CLIMB_SPEED));
    } else state.climbInput.set(0, 0);
    // they don't send where they aim: ahead of them, or where their last throw flew
    if (now - this.flickAt > 1.2)
      state.aimTarget.set(pos.x + Math.sin(state.facing) * 10, pos.y + 1.3, pos.z + Math.cos(state.facing) * 10);
    if (state.attack && (state.attack.t += dt) >= state.attack.duration) state.attack = null;
    this.animate(step);
  }
  animate(dt) {
    const state = this.state;
    const hero = this.hero;
    const anim = this.anim;
    if (hero.setOutfit(state.outfit)) this.dress();
    anim.update(dt);
    hero.group.position.copy(anim.rootPos);
    hero.group.rotation.set(0, anim.yaw.x, 0);
    hero.applyPose();
    const mats = hero.mats;
    mats.tint.value.set(PALETTE[state.selectedColor]?.hex ?? 0xffffff);
    hero.group.updateMatrixWorld(true);
    const camPos = this.ctx.camera.position;
    const rootPos = anim.rootPos;
    const focusY = Math.min(Math.max(camPos.y, rootPos.y + 0.25), rootPos.y + 1.55);
    const eyeDist = Math.hypot(camPos.x - rootPos.x, camPos.y - focusY, camPos.z - rootPos.z) - 0.18;
    const fade = Math.min(1, Math.max(0, (eyeDist - 0.35) / 0.65));
    this.fade.value = fade * fade * (3 - 2 * fade);
    mats.outlineWidth.value = MathUtils.clamp(camPos.distanceTo(hero.group.position) * 0.0023, 0.0035, 0.03);
    const sinceFlick = state.lastFlickTime >= 0 ? this.clock.elapsed - state.lastFlickTime : 9;
    const cmb = anim.cmb;
    mats.tintGlow.value = Math.max(
      sinceFlick < 0.4 ? 0.5 * (1 - sinceFlick / 0.4) : 0,
      cmb.glow * 1.6,
      anim.art.glow * 1.5,
    );
    mats.flashColor.value.copy(cmb.flashColor);
    mats.flashAmt.value = cmb.flash;
    if (!this.glider && state.mode === 'glide') {
      this.glider = new Glider(this.ctx, this.canopy);
      hero.group.add(this.glider.group);
    }
    this.glider?.update(dt, anim.gliderOpen, anim.gliderBank, anim.gliderPitch, state.speed);
    if (dt <= 0) return;
    const groundY =
      state.mode === 'fly'
        ? this.floorAt(state.position.x, state.position.z, rootPos.y - 40, state.position.y)
        : rootPos.y + (state.mode === 'swim' ? 1.25 : 0);
    const capeOn = !!this.cape?.mesh.visible;
    this.scarf.mesh.visible = !capeOn;
    if (capeOn) {
      fitCape(hero.bones, this.cape, this.capeColliders);
      this.cape.groundY = groundY;
      this.cape.update(dt);
    } else {
      fitScarf(hero.bones, this.scarf, this.scarfColliders);
      this.scarf.groundY = groundY;
      this.scarf.update(dt);
    }
  }
  floorAt(x, z, fallback, y) {
    const floorY = floorHeightAt(this.ctx, x, z, y);
    return Number.isFinite(floorY) ? floorY : fallback;
  }
  /** Into another outfit: the Sky Mantle on or off, and the scarf that goes with it. */
  dress() {
    const sky = this.hero.outfit === 'sky';
    if (sky && !this.cape) {
      this.cape = new CapeCloth(this.ctx);
      this.cape.mesh.name = 'double-mantle';
      this.group.add(this.cape.mesh);
    }
    if (this.cape) {
      this.cape.mesh.visible = sky;
      this.cape.reset();
    }
    this.paintScarf();
  }
  paintScarf() {
    const [base, dark, band, tip] = this.look ?? outfitScarf(this.hero.outfit);
    this.scarf.setColors(base, dark, band, tip);
    this.hero.mats.scarf.base.value.set(base);
    this.hero.mats.scarf.dark.value.set(dark);
  }
  dispose() {
    this.group.removeFromParent();
    const sharedGeos = new Set(Object.values(this.hero.geos));
    this.group.traverse((obj) => {
      if (obj.geometry && !sharedGeos.has(obj.geometry)) obj.geometry.dispose();
      for (const mat of [obj.material].flat())
        if (mat) {
          mat.map?.dispose();
          mat.dispose();
        }
    });
    this.hero.skeleton.dispose();
  }
}
