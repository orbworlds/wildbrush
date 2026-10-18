/**
 * The hero's procedural animator: blends ground, air, slide, swim, climb, mantle, glide and brushflight poses, layers landing, flip, aim, art, fidget, item and face overlays on top and springs the result. It then solves the legs and arms with IK, places the brush on the back or in hand, and swings the hood, satchel and fingers.
 */
import { MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import {
  angleDiff,
  AngleSpring,
  clamp01,
  easeInOut,
  envelope,
  pulse,
  smoothStep,
  Spring3,
  SpringBank,
} from './anim-math.js';
import {
  _rigEuler,
  _rigQ,
  _rigQ2,
  _rigQ3,
  _rigQ4,
  _rigV,
  _rigV2,
  _rigV3,
  _rigV4,
  _rigV5,
  FOOT_UP,
  FULL_TURN,
  LOCO_MODES,
  PITCH_AXIS,
  REST_ANKLES,
  YAW_AXIS,
} from './animator-constants.js';
import { ArtAnimator } from './art-anim.js';
import { BRUSH_DIMS } from './body-mesh.js';
import { ClimbGait } from './climb.js';
import { CombatAnimator } from './combat-anim.js';
import { FlyAnimator } from './fly-anim.js';
import { Gait } from './gait.js';
import { GLIDER_BAR_Y, GLIDER_GRIP_X } from './glider.js';
import { neutralFace } from './hero-model.js';
import { limbRotation, rotationAlongY, solveTwoBoneIK } from './ik.js';
import { ARM_CH, armBase, BODY_CH, LEG_CH, legBase, restPose, tuneSprings } from './pose-channels.js';
import { BONE, FOREARM_LEN, REST_POS, SHIN_LEN, THIGH_LEN, TORSO_LEN, UPPER_ARM_LEN } from './rig.js';
export class HeroAnimator {
  ctx;
  hero;
  probe;
  target = new Float32Array(64);
  tmp = new Float32Array(64);
  rest = restPose(new Float32Array(64));
  springs = new SpringBank(64);
  gait;
  climb = new ClimbGait();
  yaw = new AngleSpring(16);
  weights = {
    ground: 1,
    air: 0,
    climb: 0,
    glide: 0,
    swim: 0,
    slide: 0,
    fly: 0,
  };
  rootPos = new Vector3();
  rootYVel = 0;
  prevStateY = 0;
  prevVel = new Vector3();
  accel = new Vector3();
  yawRate = 0;
  prevYaw = 0;
  init = false;
  lastMode = 'ground';
  modeTime = 0;
  seenJump = -1;
  seenLand = -1;
  seenBounce = -1;
  seenFlick = -1;
  seenClimbJump = -1;
  leadSide = 1;
  landImpact = 0;
  landKind = 'soft';
  flip = null;
  bounceVy = 0;
  pendingBounce = false;
  idleT = 0;
  fidget = null;
  fidgetT = 0;
  nextFidget = 7;
  fidgetIdx = 0;
  lookYaw = 0;
  lookPitch = 0;
  nextLook = 1.5;
  nextBlink = 1.2;
  weightSide = 1;
  weightT = 0;
  weightShift = 0;
  gestL = 0;
  gestR = 0;
  gestIdx = 0;
  lookHandW = 0;
  lookScan = 0;
  blinkT = -1;
  flailW = 0;
  expr = {
    det: 0,
    strain: 0,
    joy: 0,
    happy: 0,
    surprise: 0,
    hurt: 0,
    yawn: 0,
    yell: 0,
    pant: 0,
  };
  faceRest = neutralFace();
  forcedFace = null;
  saccX = 0;
  saccY = 0;
  nextSacc = 0.8;
  curl = [0.4, 0.4];
  gripAmt = [0, 0];
  brushState = 'back';
  brushT = 0;
  brushDrawDur = 0.34;
  brushInHand = 0;
  flySrcBack = 0;
  aimW = 0;
  relaxW = 0;
  twirlW = 0;
  brushTipModel = new Vector3();
  swimPhase = 0;
  freeW = 0;
  gliderSway = Spring3.make(0.9, 0.35);
  satchel = Spring3.make(2.2, 0.18);
  hood = {
    p: [new Vector3(), new Vector3(), new Vector3(), new Vector3()],
    prev: [new Vector3(), new Vector3(), new Vector3(), new Vector3()],
    init: false,
  };
  ankleWorld = [new Vector3(), new Vector3()];
  handWorld = [new Vector3(), new Vector3()];
  groundWPrev = 1;
  reachErr = [0, 0];
  ledgeProbe = null;
  mantleT = -1;
  mantleW = 0;
  ledgeY = 0;
  ledgeIn = new Vector3();
  ledgeBase = new Vector3();
  climbWPrev = 0;
  gliderOpen = 0;
  gliderBank = 0;
  gliderPitch = 0;
  flipQ = new Quaternion();
  squash = 1;
  hit = {
    y: 0,
    normal: new Vector3(0, 1, 0),
  };
  tremble = 0;
  onFootPlant = null;
  onGrab = null;
  cmb;
  fly = new FlyAnimator();
  art;
  omegaBase;
  brushBellyModel = new Vector3();
  constructor(ctx, hero, probe) {
    this.ctx = ctx;
    this.hero = hero;
    this.probe = probe;
    tuneSprings(this.springs.omega, this.springs.track, this.springs.maxRate);
    this.omegaBase = this.springs.omega.slice();
    this.cmb = new CombatAnimator(ctx);
    this.art = new ArtAnimator(ctx);
    this.gait = new Gait(probe);
    this.gait.onPlant = (foot, intensity) => this.onFootPlant?.(foot, intensity);
    const fidgetAt = Number(ctx.params.get('fidgetAt'));
    if (Number.isFinite(fidgetAt) && fidgetAt > 0) this.nextFidget = fidgetAt;
    this.climb.onGrab = (limb) => this.onGrab?.(limb);
    const face = ctx.params.get('face');
    if (face && face in this.expr) this.forcedFace = face;
  }
  get s() {
    return this.ctx.player.state;
  }
  worldToModel(world, out) {
    const yaw = this.yaw.x;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const dx = world.x - this.rootPos.x;
    const dy = world.y - this.rootPos.y;
    const dz = world.z - this.rootPos.z;
    return out.set(dx * cos - dz * sin, dy, dx * sin + dz * cos);
  }
  modelToWorld(local, out) {
    const yaw = this.yaw.x;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return out.set(
      local.x * cos + local.z * sin + this.rootPos.x,
      local.y + this.rootPos.y,
      -local.x * sin + local.z * cos + this.rootPos.z,
    );
  }
  dirToModel(dir, out) {
    const yaw = this.yaw.x;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return out.set(dir.x * cos - dir.z * sin, dir.y, dir.x * sin + dir.z * cos);
  }
  triggerFlip(kind, dur) {
    this.flip = {
      kind,
      t0: this.ctx.time.elapsed,
      dur: Math.max(0.2, dur),
    };
  }
  update(dt) {
    const state = this.s;
    const elapsed = this.ctx.time.elapsed;
    if (!this.init) this.firstFrame();
    if (dt <= 0) return;
    _rigV5.copy(this.rootPos);
    this.updateRoot(dt);
    if (!state.grounded && state.mode !== 'ground' && (_rigV5.subVectors(this.rootPos, _rigV5), _rigV5.lengthSq() < 4))
      for (const foot of this.gait.feet) foot.pos.add(_rigV5);
    this.detectEvents(elapsed);
    this.updateModeWeights(dt);
    this.fly.update(dt, elapsed, state, this.yaw.x, this.yawRate, this.accel);
    this.cmb.update(dt, elapsed, this.yaw.x, state.grounded);
    this.art.update(dt, elapsed, state);
    this.gait.stanceW = this.cmb.stanceW * (1 - Math.min(1, this.cmb.actW));
    const groundW = this.weights.ground + this.weights.slide * 0;
    if (state.mode === 'ground' || (state.mode === 'air' && state.grounded) || groundW > 0.02) {
      if (this.groundWPrev < 0.05 || this.cmb.legW > 0.25)
        this.gait.replant(this.ankleWorld, this.yaw.x, this.rootPos.y);
      const moving = state.moveIntent.lengthSq() > 0.02;
      this.gait.update(dt, elapsed, this.rootPos, this.yaw.x, state.velocity, moving && state.mode === 'ground');
    }
    this.groundWPrev = groundW;
    if (state.mode === 'climb' || this.weights.climb > 0.02) {
      if (this.climbWPrev < 0.02) this.climb.reset(state.position, state.wallNormal);
      const sinceClimbJump = state.lastClimbJumpTime >= 0 ? elapsed - state.lastClimbJumpTime : -1;
      this.climb.update(
        dt,
        elapsed,
        state.position,
        state.wallNormal,
        state.velocity,
        state.climbInput,
        sinceClimbJump,
      );
    }
    this.climbWPrev = this.weights.climb;
    this.updateMantle(dt, elapsed);
    this.updateIdle(dt, elapsed);
    this.updateBrush(dt, elapsed);
    const target = this.target;
    target.set(this.rest);
    for (const mode of LOCO_MODES) {
      const w = this.weights[mode];
      if (w < 0.002) continue;
      const tmp = this.tmp;
      tmp.set(this.rest);
      switch (mode) {
        case 'ground':
          this.poseGround(tmp, elapsed);
          break;
        case 'air':
          this.poseAir(tmp, elapsed);
          break;
        case 'climb':
          this.poseClimb(tmp, elapsed);
          break;
        case 'glide':
          this.poseGlide(tmp, elapsed);
          break;
        case 'swim':
          this.poseSwim(tmp, elapsed, dt);
          break;
        case 'slide':
          this.poseSlide(tmp, elapsed);
          break;
        case 'fly':
          this.fly.pose(tmp, elapsed, state, this.lookYaw, this.lookPitch, this.yawRate);
      }
      for (let i = 0; i < 64; i++) target[i] += (tmp[i] - this.rest[i]) * w;
    }
    if (this.mantleW > 0.002) {
      const tmp = this.tmp;
      tmp.set(this.rest);
      this.poseMantle(tmp, elapsed);
      const mantleW = this.mantleW;
      for (let i = 0; i < 64; i++) target[i] += (tmp[i] - target[i]) * mantleW;
    }
    this.overlayLanding(target, elapsed);
    this.overlayFlip(target, elapsed);
    this.overlayAim(target, elapsed);
    this.overlayArt(target);
    this.overlayFidget(target, elapsed);
    this.cmb.overlay(target, this.rest);
    this.overlayItem(target);
    this.overlayFace(target, elapsed, dt);
    const snap = this.cmb.snap;
    for (const channel of SNAP_CHANNELS) {
      const base = this.omegaBase[channel];
      this.springs.omega[channel] = base + (40 - base) * snap;
    }
    this.springs.step(target, dt);
    this.applyPose(dt, elapsed);
    this.updateFace(dt, elapsed);
  }
  firstFrame() {
    const state = this.s;
    this.yaw.snap(state.facing);
    this.prevYaw = state.facing;
    this.rootPos.copy(state.position);
    this.prevStateY = state.position.y;
    this.prevVel.copy(state.velocity);
    for (const mode of LOCO_MODES) this.weights[mode] = +(mode === state.mode);
    if (state.mode === 'air' && state.grounded) this.weights.ground = 1;
    this.lastMode = state.mode;
    this.seenJump = state.lastJumpTime;
    this.seenLand = state.lastLandTime;
    this.seenBounce = state.lastBounceTime;
    this.seenFlick = state.lastFlickTime;
    this.seenClimbJump = state.lastClimbJumpTime;
    this.gait.snap(state.position, state.facing);
    for (let i = 0; i < 2; i++) this.ankleWorld[i].copy(this.gait.feet[i].pos);
    this.init = true;
  }
  updateRoot(dt) {
    const state = this.s;
    let facing = state.facing;
    if (state.mode === 'climb') facing = Math.atan2(-state.wallNormal.x, -state.wallNormal.z);
    this.yaw.omega = state.mode === 'climb' ? 12 : state.mode === 'glide' ? 7 : state.mode === 'fly' ? 9 : 15;
    this.yaw.step(facing, dt);
    const rawRate = angleDiff(this.yaw.x, this.prevYaw) / dt;
    this.prevYaw = this.yaw.x;
    this.yawRate += (rawRate - this.yawRate) * (1 - Math.exp(-10 * dt));
    this.rootPos.x = state.position.x;
    this.rootPos.z = state.position.z;
    if ((state.mode === 'ground' || state.mode === 'slide') && state.grounded) {
      const offset = this.rootPos.y - state.position.y;
      if (Math.abs(offset) > 0.5) {
        this.rootPos.y = state.position.y;
        this.rootYVel = state.velocity.y;
      } else {
        let vy = (state.position.y - this.prevStateY) / dt;
        if (!Number.isFinite(vy) || Math.abs(vy) > 12) vy = state.velocity.y;
        const relVy = this.rootYVel - vy;
        const decay = Math.exp(-28 * dt);
        const temp = (relVy + 28 * offset) * dt;
        this.rootPos.y = state.position.y + (offset + temp) * decay;
        this.rootYVel = vy + (relVy - 28 * temp) * decay;
      }
    } else {
      this.rootPos.y = state.position.y;
      this.rootYVel = state.velocity.y;
    }
    this.prevStateY = state.position.y;
    _rigV.subVectors(state.velocity, this.prevVel).divideScalar(dt);
    if (_rigV.lengthSq() > 900) _rigV.setLength(30);
    this.accel.lerp(_rigV, 1 - Math.exp(-8 * dt));
    this.prevVel.copy(state.velocity);
  }
  detectEvents(elapsed) {
    const state = this.s;
    if (state.lastJumpTime !== this.seenJump) {
      this.seenJump = state.lastJumpTime;
      const feet = this.gait.feet;
      this.leadSide = feet[0].planted ? (feet[1].planted ? (this.gait.phase < 0.5 ? -1 : 1) : -1) : 1;
    }
    if (state.lastLandTime !== this.seenLand) {
      this.seenLand = state.lastLandTime;
      this.landImpact = state.lastLandImpact;
      this.landKind = 'soft';
      const free =
        (state.mode === 'ground' || state.mode === 'air' || state.mode === 'slide') &&
        !state.attack &&
        !state.dead &&
        this.cmb.action === null;
      if (state.lastLandImpact > 13 && state.speed > 3.5 && free && state.mode !== 'slide') {
        this.landKind = 'roll';
        this.flip = {
          kind: 'roll',
          t0: state.lastLandTime,
          dur: 0.62,
        };
      } else if (state.lastLandImpact > 16 && free) this.landKind = 'crouch';
      else if (!free) this.landImpact = Math.min(this.landImpact, 6);
      this.blinkT = 0;
      if (this.flip && this.flip.kind !== 'roll') this.flip = null;
    }
    if (state.lastBounceTime !== this.seenBounce) {
      this.seenBounce = state.lastBounceTime;
      this.pendingBounce = true;
    }
    if (this.pendingBounce && elapsed - state.lastBounceTime > 0.02) {
      this.pendingBounce = false;
      const vy = Math.max(this.bounceVy, state.velocity.y);
      this.bounceVy = 0;
      if (vy > 13.5) {
        const flightT = (2 * vy) / 26;
        this.flip = {
          kind: 'flip',
          t0: state.lastBounceTime,
          dur: Math.min(1.05, Math.max(0.55, flightT * 0.55)),
        };
      } else if (vy > 8.5)
        this.flip = {
          kind: 'spin',
          t0: state.lastBounceTime,
          dur: Math.min(0.9, Math.max(0.5, ((2 * vy) / 26) * 0.6)),
        };
    }
    if (this.pendingBounce) this.bounceVy = Math.max(this.bounceVy, state.velocity.y);
    if (state.lastClimbJumpTime !== this.seenClimbJump) this.seenClimbJump = state.lastClimbJumpTime;
    if (state.mode !== this.lastMode) {
      this.lastMode = state.mode;
      this.modeTime = 0;
      if (state.mode !== 'air' && state.mode !== 'ground' && this.flip) this.flip = null;
    }
  }
  updateModeWeights(dt) {
    const state = this.s;
    this.modeTime += dt;
    let mode = state.mode;
    if (mode === 'air' && state.grounded) mode = 'ground';
    if (
      mode === 'air' &&
      state.airTime < 0.12 &&
      this.s.lastJumpTime < this.ctx.time.elapsed - 0.3 &&
      state.velocity.y > -4
    )
      mode = 'ground';
    const rate =
      mode === 'air'
        ? 14
        : mode === 'ground'
          ? this.weights.air > 0.5
            ? 20
            : 9
          : mode === 'glide'
            ? 11
            : mode === 'climb'
              ? 10
              : mode === 'fly'
                ? 11
                : 8;
    let sum = 0;
    for (const key of LOCO_MODES) {
      const goal = +(key === mode);
      this.weights[key] += (goal - this.weights[key]) * (1 - Math.exp(-rate * dt));
      sum += this.weights[key];
    }
    for (const key of LOCO_MODES) this.weights[key] /= sum;
    this.gliderOpen = +(state.mode === 'glide');
  }
  updateIdle(dt, elapsed) {
    const state = this.s;
    const resting =
      state.mode === 'ground' &&
      state.speed < 0.15 &&
      !state.aiming &&
      (state.lastFlickTime < 0 || elapsed - state.lastFlickTime > 2.5) &&
      (state.lastLandTime < 0 || elapsed - state.lastLandTime > 0.8) &&
      this.cmb.stanceW < 0.1 &&
      this.cmb.actW < 0.1 &&
      !this.cmb.wantBrush;
    if (resting) this.idleT += dt;
    else {
      this.idleT = 0;
      if (this.fidget && this.fidget !== 'twirl') this.fidget = null;
      if (this.fidget === 'twirl' && (state.speed > 0.5 || state.aiming)) this.fidget = null;
    }
    if (this.fidget) {
      this.fidgetT += dt;
      const dur = this.fidget === 'stretch' ? 3.4 : this.fidget === 'twirl' ? 3 : 3.2;
      if (this.fidgetT > dur) {
        this.fidget = null;
        this.idleT = 0;
        this.nextFidget = 6 + ((this.fidgetIdx * 3.7) % 5);
      }
    } else if (resting && this.idleT > this.nextFidget) {
      const kinds = ['stretch', 'twirl', 'look'];
      const fidget = this.ctx.params.get('fidget');
      this.fidget = fidget && kinds.includes(fidget) ? fidget : kinds[this.fidgetIdx % kinds.length];
      this.fidgetIdx++;
      this.fidgetT = 0;
    }
    this.weightT -= dt;
    if (this.weightT <= 0) {
      this.weightSide = -this.weightSide;
      this.gestIdx++;
      const hash = Math.sin(elapsed * 17.13) * 3141.59;
      this.weightT = 4.5 + (hash - Math.floor(hash)) * 4;
    }
    this.weightShift += (this.weightSide - this.weightShift) * (1 - Math.exp(-2.2 * dt));
    const gesture = this.gestIdx % 4;
    const gestOn = resting && !this.fidget ? 1 : 0;
    this.gestR += ((gesture === 1 || gesture === 3 ? gestOn : 0) - this.gestR) * (1 - Math.exp(-3 * dt));
    this.gestL += ((gesture === 2 || gesture === 3 ? gestOn : 0) - this.gestL) * (1 - Math.exp(-3 * dt));
    this.nextLook -= dt;
    if (this.nextLook <= 0) {
      const hashA = Math.sin(elapsed * 12.9898) * 43758.5453;
      const hashB = Math.sin(elapsed * 78.233) * 12543.123;
      const randA = hashA - Math.floor(hashA);
      const randB = hashB - Math.floor(hashB);
      this.lookYaw = (randA - 0.5) * 1.3;
      this.lookPitch = (randB - 0.45) * 0.35;
      if (randB > 0.7) this.lookYaw *= 0.2;
      this.nextLook = 1.8 + randA * 3;
    }
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) {
      this.blinkT = 0;
      const hash = Math.sin(elapsed * 91.7) * 9631.1;
      this.nextBlink = 2 + (hash - Math.floor(hash)) * 3.5;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT > 0.18) this.blinkT = -1;
    }
  }
  updateBrush(dt, elapsed) {
    const state = this.s;
    const flicked = state.lastFlickTime !== this.seenFlick;
    if (flicked) this.seenFlick = state.lastFlickTime;
    const sinceFlick = state.lastFlickTime >= 0 ? elapsed - state.lastFlickTime : 1000000000;
    const onFoot = state.mode === 'ground' || state.mode === 'air' || state.mode === 'slide';
    let wantHand =
      (onFoot && (state.aiming || this.fidget === 'twirl')) ||
      sinceFlick < (onFoot ? 2 : 0.75) ||
      (this.cmb.wantBrush && (onFoot || !!state.attack || state.dead)) ||
      (this.art.wantBrush && onFoot);
    const brushItem = state.itemHold?.item === 'chromaBrush' || state.itemHold?.item === 'brushflight';
    if (state.itemHold) wantHand = brushItem;
    if (state.mode === 'fly') wantHand = true;
    const urgent =
      !!state.attack ||
      state.charge > 0 ||
      state.lockTargetId !== null ||
      brushItem ||
      state.mode === 'fly' ||
      this.art.wantBrush;
    const stowed = this.brushState === 'back' || this.brushState === 'sheathe';
    if (state.mode === 'fly') {
      if (this.brushState !== 'hand') {
        this.flySrcBack = stowed || this.brushState === 'draw' ? 1 : 0;
        this.brushState = 'hand';
        this.brushT = 0;
      }
    } else if ((flicked && (stowed || this.brushState === 'draw')) || (urgent && stowed && wantHand)) {
      this.brushState = 'draw';
      this.brushDrawDur = 0.1;
      this.brushT = 0.46 * this.brushDrawDur;
    }
    if (state.mode !== 'fly' && this.fly.brushW > 0.01) this.flySrcBack = +!wantHand;
    this.brushT += dt;
    switch (this.brushState) {
      case 'back':
        if (wantHand) {
          this.brushState = 'draw';
          this.brushT = 0;
          this.brushDrawDur = 0.34;
        }
        break;
      case 'draw':
        if (this.brushT >= this.brushDrawDur) {
          this.brushState = 'hand';
          this.brushT = 0;
        }
        break;
      case 'hand':
        if (!wantHand) {
          this.brushState = 'sheathe';
          this.brushT = 0;
        }
        break;
      case 'sheathe':
        if (wantHand) {
          this.brushState = 'draw';
          this.brushDrawDur = 0.3;
          this.brushT = (1 - Math.min(1, this.brushT / 0.42)) * 0.45 * this.brushDrawDur + 0.46 * this.brushDrawDur;
        } else if (this.brushT >= 0.42) {
          this.brushState = 'back';
          this.brushT = 0;
        }
    }
    const ease = 1 - Math.exp(-10 * dt);
    this.aimW += ((state.aiming && (onFoot || state.mode === 'fly') ? 1 : 0) - this.aimW) * ease;
    const recentFlick = +(sinceFlick < 1.2);
    const artWants = +!!this.art.wantBrush;
    this.relaxW +=
      (+(this.brushState === 'hand' && !state.aiming && !recentFlick && !artWants && this.fidget !== 'twirl') -
        this.relaxW) *
      (1 - Math.exp(-(artWants ? 20 : 6) * dt));
    this.twirlW += (+(this.fidget === 'twirl') - this.twirlW) * (1 - Math.exp(-8 * dt));
  }
  setArm(pose, side, swing, abd, elbow, twist = 0, clavUp = 0, clavFwd = 0) {
    const base = armBase(side);
    pose[base + ARM_CH.swing] += swing;
    pose[base + ARM_CH.abd] += abd;
    pose[base + ARM_CH.elbow] += elbow;
    pose[base + ARM_CH.twist] += twist;
    pose[base + ARM_CH.clavUp] += clavUp;
    pose[base + ARM_CH.clavFwd] += clavFwd;
  }
  poseGround(pose, elapsed) {
    const state = this.s;
    const gait = this.gait;
    const speed = Math.hypot(state.velocity.x, state.velocity.z);
    const moveW = smoothStep(0.1, 1.2, speed) * (gait.moving ? 1 : smoothStep(0.3, 0, gait.moveTime) * 0.7);
    const idleW = 1 - moveW;
    const runW = gait.runW;
    const sprintW = gait.sprintW;
    const walkW = 1 - runW;
    const phase = gait.phase;
    const stride = FULL_TURN * (phase - gait.duty / 2);
    const legSwing = Math.cos(FULL_TURN * (phase + (gait.duty - 0.5) / 2));
    _rigV.copy(this.accel);
    this.dirToModel(_rigV, _rigV);
    const accFwd = MathUtils.clamp(_rigV.z, -25, 25);
    const accSide = MathUtils.clamp(_rigV.x, -30, 30);
    const lean = MathUtils.clamp(accFwd * 0.018, -0.22, 0.28) * smoothStep(0.2, 2, speed + Math.abs(accFwd) * 0.2);
    const bank = MathUtils.clamp(-accSide * 0.022 - this.yawRate * speed * 0.012, -0.35, 0.35);
    const bob = 0.022 * walkW - 0.04 * runW - 0.012 * sprintW;
    pose[BODY_CH.hipY] += -0.012 - (0.055 * runW + 0.03 * sprintW) * moveW + bob * Math.cos(2 * stride) * moveW;
    pose[BODY_CH.hipX] += 0.022 * Math.cos(stride) * moveW * (1 - 0.6 * runW);
    const sway = 0.055 * Math.cos(stride) * moveW * (1 - 0.45 * runW);
    pose[BODY_CH.hipRoll] += sway + bank * 0.45;
    const twist = -legSwing * (0.13 + 0.1 * runW) * moveW;
    pose[BODY_CH.hipYaw] += twist;
    pose[BODY_CH.hipPitch] += (0.03 + 0.1 * runW + 0.08 * sprintW) * moveW + lean * 0.3;
    pose[BODY_CH.spPitch] += (0.03 + 0.12 * runW + 0.12 * sprintW) * moveW + lean * 0.45;
    pose[BODY_CH.chPitch] +=
      (0.02 * runW + 0.08 * sprintW) * moveW + lean * 0.35 - 0.02 * Math.cos(2 * stride) * runW * moveW;
    pose[BODY_CH.spRoll] += -sway * 0.6 + bank * 0.3;
    pose[BODY_CH.chRoll] += -sway * 0.3 + bank * 0.15;
    pose[BODY_CH.spYaw] += -twist * 0.35;
    pose[BODY_CH.chYaw] += -twist * 0.9 + legSwing * 0.05 * runW * moveW;
    const pitchSum = pose[BODY_CH.hipPitch] + pose[BODY_CH.spPitch] + pose[BODY_CH.chPitch];
    const rollSum = pose[BODY_CH.hipRoll] + pose[BODY_CH.spRoll] + pose[BODY_CH.chRoll];
    const yawSum = pose[BODY_CH.hipYaw] + pose[BODY_CH.spYaw] + pose[BODY_CH.chYaw];
    const turnLook = MathUtils.clamp(this.yawRate * 0.12, -0.45, 0.45) * moveW;
    pose[BODY_CH.nkPitch] += -pitchSum * 0.35;
    pose[BODY_CH.hdPitch] += -pitchSum * 0.5 + 0.05 * sprintW;
    pose[BODY_CH.hdRoll] += -rollSum * 0.7;
    pose[BODY_CH.hdYaw] += -yawSum * 0.8 + turnLook;
    pose[BODY_CH.nkYaw] += turnLook * 0.5;
    const armAmp = (0.4 * walkW + 0.75 * runW + 0.2 * sprintW) * moveW;
    for (const side of [1, -1]) {
      const swing = -side * legSwing * armAmp;
      const elbow =
        (0.22 + Math.max(0, swing) * 0.35) * walkW + (1.35 + 0.25 * sprintW + 0.25 * Math.max(0, swing)) * runW;
      this.setArm(
        pose,
        side,
        swing + 0.04,
        0.08 + 0.12 * runW,
        elbow * moveW + 0.14 * idleW,
        -0.3 * runW * moveW,
        0.02 * runW,
        swing * 0.12,
      );
      const base = armBase(side);
      pose[base + ARM_CH.wPitch] += -0.15 * runW * moveW;
    }
    for (const side of [1, -1]) {
      const base = legBase(side);
      pose[base + LEG_CH.plant] = 1;
      pose[base + LEG_CH.knee] += 0.04 + 0.05 * idleW;
    }
    if (idleW > 0.001) {
      const t = elapsed;
      const breath = Math.sin((t * FULL_TURN) / 3.6);
      const shift = this.weightShift + Math.sin((t * FULL_TURN) / 3.1) * 0.08;
      pose[BODY_CH.hipX] += 0.034 * shift * idleW;
      pose[BODY_CH.hipRoll] += 0.07 * shift * idleW;
      pose[BODY_CH.hipYaw] += 0.06 * shift * idleW;
      pose[BODY_CH.hipY] += (-0.018 * Math.abs(shift) + 0.004 * breath) * idleW;
      pose[BODY_CH.spRoll] += -0.045 * shift * idleW;
      pose[BODY_CH.chRoll] += -0.035 * shift * idleW;
      pose[BODY_CH.chYaw] += -0.04 * shift * idleW;
      pose[BODY_CH.chPitch] += -0.02 * breath * idleW;
      pose[BODY_CH.spPitch] += 0.02 * idleW;
      pose[BODY_CH.hdRoll] += (0.05 * Math.sin(t * 0.43) + 0.03 * shift) * idleW;
      pose[BODY_CH.hdYaw] += this.lookYaw * 0.75 * idleW;
      pose[BODY_CH.nkYaw] += this.lookYaw * 0.25 * idleW;
      pose[BODY_CH.hdPitch] += this.lookPitch * idleW;
      for (const side of [1, -1]) {
        const base = armBase(side);
        const loaded = +(side * shift > 0);
        pose[base + ARM_CH.clavUp] += 0.035 * breath * idleW;
        pose[base + ARM_CH.abd] += (0.07 + 0.02 * breath + 0.04 * loaded) * idleW;
        pose[base + ARM_CH.swing] += (0.06 - 0.03 * side * shift) * idleW;
        pose[base + ARM_CH.elbow] += 0.12 * idleW;
        pose[base + ARM_CH.twist] += 0.15 * idleW;
        pose[base + ARM_CH.wPitch] += 0.12 * idleW;
        const leg = legBase(side);
        pose[leg + LEG_CH.knee] += 0.12 * (1 - loaded) * idleW;
      }
      const gestR = this.gestR * idleW;
      const gestL = this.gestL * idleW;
      if (gestR > 0.001) {
        const base = armBase(-1);
        pose[base + ARM_CH.ik] += gestR;
        pose[base + ARM_CH.tx] += -0.075 * gestR;
        pose[base + ARM_CH.ty] += REST_POS[BONE.chest].y * gestR;
        pose[base + ARM_CH.tz] += 0.2 * gestR;
      }
      if (gestL > 0.001) {
        const base = armBase(1);
        pose[base + ARM_CH.ik] += gestL;
        pose[base + ARM_CH.tx] += 0.2 * gestL;
        pose[base + ARM_CH.ty] += REST_POS[BONE.satchel].y * gestL;
        pose[base + ARM_CH.tz] += -0.03 * gestL;
        pose[base + ARM_CH.wPitch] += 0.5 * gestL;
        pose[base + ARM_CH.wRoll] += -0.6 * gestL;
      }
    }
  }
  poseAir(pose, elapsed) {
    const state = this.s;
    const vy = state.velocity.y;
    const rise = MathUtils.clamp(vy / 7, -1, 1);
    const up = Math.max(0, rise);
    const down = Math.max(0, -rise);
    const apex = 1 - Math.abs(rise);
    const sinceJump = state.lastJumpTime >= 0 ? elapsed - state.lastJumpTime : 99;
    const fromJump = sinceJump < state.airTime + 0.15;
    const ramp = fromJump ? smoothStep(0, 0.09, sinceJump) : 1;
    const leadSide = this.leadSide;
    const flail = smoothStep(0.8, 1.5, state.airTime) * smoothStep(-7, -13, vy);
    this.flailW = flail;
    const t2 = elapsed;
    for (const side of [1, -1]) {
      const base = legBase(side);
      const lead = side === leadSide;
      let lift = 0;
      let reach = 0;
      if (lead) {
        lift = up * 0.44 + apex * 0.42 + down * 0.12;
        reach = up * 0.22 + apex * 0.12 + down * 0.12;
      } else {
        lift = up * 0.26 + apex * 0.34 + down * 0.16;
        reach = up * -0.24 + apex * -0.02 + down * -0.1;
      }
      lift *= ramp;
      reach *= ramp;
      const phase = t2 * 9 + (side === 1 ? 0 : Math.PI);
      lift = lift * (1 - flail) + flail * (0.2 + 0.12 * Math.sin(phase));
      reach = reach * (1 - flail) + flail * 0.12 * Math.cos(phase);
      pose[base + LEG_CH.fy] += lift;
      pose[base + LEG_CH.fz] += reach;
      pose[base + LEG_CH.fx] += side * 0.02;
      pose[base + LEG_CH.pitch] += 0.35 * ramp * (1 - down * 0.6);
      pose[base + LEG_CH.knee] += 0.15;
      pose[base + LEG_CH.plant] = 0;
    }
    pose[BODY_CH.spPitch] += -0.08 * up + 0.22 * apex + 0.02 * down;
    pose[BODY_CH.chPitch] += -0.06 * up + 0.1 * apex - 0.04 * down;
    pose[BODY_CH.hdPitch] += 0.02 * up - 0.06 * apex + 0.2 * down * (1 - flail);
    pose[BODY_CH.hipPitch] += 0.08 * apex;
    pose[BODY_CH.hipY] += 0.03 * apex;
    for (const side of [1, -1]) {
      const counter = side !== leadSide;
      const fwd = counter ? 1.35 : -0.55;
      const flutter = Math.sin(t2 * 13 + (side === 1 ? 0 : 1.7)) * 0.12 * down * smoothStep(3, 10, -vy);
      let swing = fwd * up + 0.55 * apex + (0.75 + flutter) * down;
      let abd = 0.25 * up + 0.75 * apex + (1.05 - flutter) * down;
      let elbow = (counter ? 0.9 : 0.4) * up + 0.6 * apex + 0.85 * down;
      const phase = t2 * 11 + (side === 1 ? 0 : Math.PI * 0.7);
      swing = swing * (1 - flail) + flail * (1.4 + 1.1 * Math.sin(phase));
      abd = abd * (1 - flail) + flail * (0.9 + 0.25 * Math.cos(phase));
      elbow = elbow * (1 - flail) + flail * 0.35;
      this.setArm(pose, side, swing * ramp + 0.05, abd * ramp + 0.1, elbow * ramp + 0.1, 0, 0.08 * down);
      pose[armBase(side) + ARM_CH.wPitch] += -0.45 * down + flutter;
      pose[armBase(side) + ARM_CH.twist] += 0.35 * down;
    }
    if (fromJump && sinceJump < 0.4) {
      const squish = sinceJump < 0.05 ? Math.sin((Math.PI * sinceJump) / 0.05) : 0;
      pose[BODY_CH.squash] += -0.07 * squish + 0.1 * pulse(sinceJump - 0.04, 0.06, 0.28);
    }
  }
  poseSlide(pose, elapsed) {
    const speed = this.s.speed;
    const bank = MathUtils.clamp(this.yawRate * 0.1 + -this.dirToModel(this.accel, _rigV).x * 0.012, -0.5, 0.5);
    const wobble = Math.sin(elapsed * 3.1) * 0.5 + Math.sin(elapsed * 5.3) * 0.3;
    pose[BODY_CH.hipYaw] += -0.85;
    pose[BODY_CH.hipY] += -0.14 - 0.03 * smoothStep(4, 10, speed);
    pose[BODY_CH.hipRoll] += bank * 0.6;
    pose[BODY_CH.spYaw] += 0.3;
    pose[BODY_CH.chYaw] += 0.25;
    pose[BODY_CH.spPitch] += 0.15;
    pose[BODY_CH.spRoll] += bank * 0.4 + 0.03 * wobble;
    pose[BODY_CH.hdYaw] += 0.25;
    pose[BODY_CH.hdRoll] += -bank * 0.3;
    this.setArm(pose, 1, 0.4 + 0.1 * wobble, 1.15 + 0.1 * wobble, 0.35);
    this.setArm(pose, -1, -0.15 - 0.1 * wobble, 1 - 0.1 * wobble, 0.45);
    const legL = legBase(1);
    const legR = legBase(-1);
    pose[legL + LEG_CH.fx] += 0.1;
    pose[legL + LEG_CH.fz] += 0.2;
    pose[legR + LEG_CH.fx] += -0.1;
    pose[legR + LEG_CH.fz] += -0.2;
    pose[legL + LEG_CH.yaw] += -0.8;
    pose[legR + LEG_CH.yaw] += -0.85;
    pose[legL + LEG_CH.knee] += 0.35;
    pose[legR + LEG_CH.knee] += 0.35;
    pose[legL + LEG_CH.plant] = 0;
    pose[legR + LEG_CH.plant] = 0;
  }
  poseSwim(pose, elapsed, dt) {
    const state = this.s;
    const speed = state.speed;
    const strokeW = smoothStep(0.2, 1.2, speed);
    const freeW = state.sprinting ? smoothStep(1.5, 3, speed) : 0;
    this.freeW = freeW;
    const rate = strokeW > 0.05 ? 0.55 + speed * 0.18 + freeW * 0.25 : 0.45;
    this.swimPhase = (this.swimPhase + rate * dt) % 1;
    const swimPhase = this.swimPhase;
    const ang = FULL_TURN * swimPhase;
    const tilt = 0.25 + 0.75 * strokeW + 0.2 * freeW;
    pose[BODY_CH.hipY] += TORSO_LEN * (1 - Math.cos(tilt)) + 0.06 * strokeW;
    pose[BODY_CH.hipPitch] += tilt * 0.7;
    pose[BODY_CH.spPitch] += tilt * 0.2;
    pose[BODY_CH.chPitch] += tilt * 0.1 + 0.05 * Math.sin(ang) * strokeW * (1 - freeW);
    pose[BODY_CH.nkPitch] += -tilt * 0.5;
    pose[BODY_CH.hdPitch] += -tilt * 0.45 - 0.08;
    pose[BODY_CH.hdRoll] += freeW * 0.25 * Math.sin(ang);
    pose[BODY_CH.hdYaw] += freeW * 0.35 * Math.sin(ang);
    pose[BODY_CH.chYaw] += freeW * 0.35 * Math.sin(ang);
    pose[BODY_CH.hipYaw] += freeW * -0.15 * Math.sin(ang);
    const breastW = (1 - freeW) * strokeW;
    const treadW = 1 - strokeW;
    for (const side of [1, -1]) {
      const base = armBase(side);
      const sweep = smoothStep(0, 0.4, swimPhase) * (1 - smoothStep(0.4, 0.62, swimPhase));
      const tuck = smoothStep(0.38, 0.55, swimPhase) * (1 - smoothStep(0.62, 0.85, swimPhase));
      const glide = 1 - sweep - tuck * 0.7;
      const swing = 1.65 * glide + 0.9 * sweep + 0.8 * tuck;
      const abd = 0.15 * glide + 1 * sweep + 0.25 * tuck;
      const elbow = 0.1 * glide + 0.45 * sweep + 1.9 * tuck;
      pose[base + ARM_CH.swing] += (swing - tilt * 0.4) * breastW;
      pose[base + ARM_CH.abd] += abd * breastW;
      pose[base + ARM_CH.elbow] += elbow * breastW;
      pose[base + ARM_CH.twist] += -0.4 * breastW;
      const scull = Math.sin(elapsed * 3.2 + (side === 1 ? 0 : Math.PI * 0.2));
      pose[base + ARM_CH.swing] += (0.7 + 0.2 * scull) * treadW;
      pose[base + ARM_CH.abd] += (0.7 + 0.25 * scull) * treadW;
      pose[base + ARM_CH.elbow] += 0.9 * treadW;
      pose[base + ARM_CH.twist] += 0.5 * scull * treadW;
      const leg = legBase(side);
      pose[leg + LEG_CH.plant] = 0;
      const kick = smoothStep(0.35, 0.6, swimPhase) * (1 - smoothStep(0.62, 0.8, swimPhase));
      pose[leg + LEG_CH.fy] += (0.32 * kick + 0.1) * breastW;
      pose[leg + LEG_CH.fx] += side * (0.14 * kick + 0.05) * breastW;
      pose[leg + LEG_CH.fz] += (-0.05 - 0.05 * (1 - kick)) * breastW;
      pose[leg + LEG_CH.knee] += 0.9 * kick * breastW;
      pose[leg + LEG_CH.pitch] += 0.6 * breastW;
      const flutter = Math.sin(elapsed * 13 + (side === 1 ? 0 : Math.PI));
      pose[leg + LEG_CH.fy] += (0.12 + 0.07 * flutter) * freeW;
      pose[leg + LEG_CH.fz] += (-0.08 + 0.02 * flutter) * freeW;
      pose[leg + LEG_CH.pitch] += 0.9 * freeW;
      const tread = Math.sin(elapsed * 3.4 + (side === 1 ? 0 : Math.PI));
      pose[leg + LEG_CH.fy] += (0.16 + 0.08 * tread) * treadW;
      pose[leg + LEG_CH.fz] += 0.08 * Math.cos(elapsed * 3.4 + (side === 1 ? 0 : Math.PI)) * treadW;
      pose[leg + LEG_CH.pitch] += 0.4 * treadW;
    }
  }
  poseGlide(pose, elapsed) {
    const state = this.s;
    this.dirToModel(this.accel, _rigV);
    const bank = MathUtils.clamp(-this.yawRate * 0.35 - _rigV.x * 0.02, -0.55, 0.55);
    this.gliderBank = bank;
    this.gliderPitch = MathUtils.clamp(-state.velocity.y * 0.015, -0.2, 0.2);
    pose[BODY_CH.hipRoll] += bank * 0.35;
    pose[BODY_CH.spRoll] += bank * 0.2;
    pose[BODY_CH.spPitch] += -0.04;
    pose[BODY_CH.chPitch] += -0.08;
    pose[BODY_CH.hdPitch] += 0.1;
    pose[BODY_CH.hdYaw] += MathUtils.clamp(this.yawRate * 0.25, -0.5, 0.5);
    pose[BODY_CH.hdRoll] += -bank * 0.3;
    pose[BODY_CH.hipY] += 0.02;
    for (const side of [1, -1]) {
      const base = armBase(side);
      pose[base + ARM_CH.ik] += 1;
      pose[base + ARM_CH.tx] += side * GLIDER_GRIP_X * Math.cos(bank);
      pose[base + ARM_CH.ty] += GLIDER_BAR_Y - 0.05 + side * GLIDER_GRIP_X * Math.sin(bank);
      pose[base + ARM_CH.tz] += 0.05;
      pose[base + ARM_CH.clavUp] += 0.35;
      pose[base + ARM_CH.swing] += 2.6;
      pose[base + ARM_CH.abd] += 0.3;
    }
    this.gliderSway.step(
      -_rigV.x * 0.006 + Math.sin(elapsed * 1.3) * 0.03,
      0,
      -_rigV.z * 0.006 + Math.sin(elapsed * 0.9) * 0.03,
      this.ctx.time.dt,
    );
    for (const side of [1, -1]) {
      const leg = legBase(side);
      const phase = elapsed * 2.1 + (side === 1 ? 0 : 1.9);
      pose[leg + LEG_CH.plant] = 0;
      pose[leg + LEG_CH.fx] += this.gliderSway.x + side * 0.02;
      pose[leg + LEG_CH.fz] += this.gliderSway.z + (side === 1 ? 0.07 : -0.05) + 0.04 * Math.sin(phase);
      pose[leg + LEG_CH.fy] += 0.06 + 0.04 * Math.max(0, Math.sin(phase));
      pose[leg + LEG_CH.pitch] += 0.55;
      pose[leg + LEG_CH.knee] += 0.1;
    }
  }
  poseClimb(pose, elapsed) {
    const state = this.s;
    const stamina = state.staminaMax > 0 ? state.stamina / state.staminaMax : 1;
    this.tremble = Math.max(smoothStep(0.3, 0.05, stamina), +!!state.exhausted);
    const leap = this.climb.leap;
    const leapArc = leap >= 0 ? Math.sin(Math.PI * leap) : 0;
    const moving = +!!this.climb.moving;
    const phase = this.climb.phase;
    const stepSway = Math.cos(FULL_TURN * phase) * moving;
    pose[BODY_CH.hipZ] += 0.12;
    pose[BODY_CH.hipY] += -0.04 + 0.1 * leapArc;
    pose[BODY_CH.hipX] += 0.03 * stepSway;
    pose[BODY_CH.hipRoll] += 0.06 * stepSway;
    pose[BODY_CH.spRoll] += -0.08 * stepSway;
    pose[BODY_CH.hipPitch] += 0.12;
    pose[BODY_CH.spPitch] += 0.02 - 0.1 * leapArc;
    pose[BODY_CH.chPitch] += -0.05 - 0.1 * leapArc;
    pose[BODY_CH.nkPitch] += -0.15;
    pose[BODY_CH.hdPitch] += -0.25 - 0.3 * leapArc + 0.12 * this.tremble;
    pose[BODY_CH.hdYaw] += MathUtils.clamp(state.climbInput.x * -0.35, -0.4, 0.4);
    for (const side of [1, -1]) {
      const base = armBase(side);
      pose[base + ARM_CH.swing] += 2.4;
      pose[base + ARM_CH.abd] += 0.4;
      pose[base + ARM_CH.clavUp] += 0.12 + 0.1 * leapArc;
      const leg = legBase(side);
      pose[leg + LEG_CH.plant] = 0;
      pose[leg + LEG_CH.knee] += 0.5;
    }
    pose[BODY_CH.hipY] += -0.05 * this.tremble;
  }
  updateMantle(dt, elapsed) {
    const state = this.s;
    const wallNormal = state.wallNormal;
    const intoWall = -(state.velocity.x * wallNormal.x + state.velocity.z * wallNormal.z);
    const justLeapt = state.lastClimbJumpTime >= 0 && elapsed - state.lastClimbJumpTime < 0.45;
    if (
      state.mode === 'climb' &&
      state.climbInput.y > 0.5 &&
      !justLeapt &&
      (intoWall > 0.45 || (state.velocity.y > 2.4 && !state.sprinting)) &&
      this.mantleT < 0
    ) {
      this.mantleT = elapsed;
      this.ledgeIn.set(-wallNormal.x, 0, -wallNormal.z);
      if (this.ledgeIn.lengthSq() < 0.000001) this.ledgeIn.set(Math.sin(this.yaw.x), 0, Math.cos(this.yaw.x));
      this.ledgeIn.normalize();
      this.ledgeBase.copy(state.position);
      let probeY = NaN;
      if (this.ledgeProbe) {
        const px = state.position.x + this.ledgeIn.x * 0.62;
        const pz = state.position.z + this.ledgeIn.z * 0.62;
        probeY = this.ledgeProbe(px, pz, state.position.y + 2.9, 2.8);
      }
      this.ledgeY = Number.isFinite(probeY) && probeY > state.position.y + 0.15 ? probeY : state.position.y + 1.6;
    }
    if (this.mantleT >= 0) {
      const age = elapsed - this.mantleT;
      if ((state.mode !== 'climb' && age > 0.15) || age > 1.3 || state.mode === 'air' || state.mode === 'swim')
        this.mantleT = -1;
    }
    const active = +(this.mantleT >= 0);
    this.mantleW += (active - this.mantleW) * (1 - Math.exp(-(active ? 22 : 7) * dt));
  }
  poseMantle(pose, elapsed) {
    const pull = smoothStep(0.35, 0.85, clamp01((this.mantleT >= 0 ? elapsed - this.mantleT : 0.6) / 0.55));
    pose[BODY_CH.hipZ] += 0.1 + 0.08 * pull;
    pose[BODY_CH.hipY] += -0.06 + 0.04 * pull;
    pose[BODY_CH.hipPitch] += 0.15 + 0.25 * pull;
    pose[BODY_CH.spPitch] += 0.1 + 0.35 * pull;
    pose[BODY_CH.chPitch] += 0.05 + 0.15 * pull;
    pose[BODY_CH.nkPitch] += -0.15 - 0.1 * pull;
    pose[BODY_CH.hdPitch] += -0.3 - 0.15 * pull;
    const across = _rigV2.set(this.ledgeIn.z, 0, -this.ledgeIn.x);
    for (const side of [1, -1]) {
      const base = armBase(side);
      _rigV
        .copy(this.ledgeBase)
        .addScaledVector(this.ledgeIn, 0.36)
        .addScaledVector(across, side * 0.2);
      _rigV.y = this.ledgeY + 0.05;
      this.worldToModel(_rigV, _rigV);
      pose[base + ARM_CH.ik] += 1;
      pose[base + ARM_CH.tx] += _rigV.x;
      pose[base + ARM_CH.ty] += _rigV.y;
      pose[base + ARM_CH.tz] += _rigV.z;
      pose[base + ARM_CH.swing] += 2.2;
      pose[base + ARM_CH.clavUp] += 0.2 * (1 - pull);
      const leg = legBase(side);
      const stepLeg = side === -1;
      pose[leg + LEG_CH.plant] = 0;
      pose[leg + LEG_CH.fy] += 0.22 + (stepLeg ? 0.28 : 0.02) * pull;
      pose[leg + LEG_CH.fz] += 0.12 + (stepLeg ? 0.2 : -0.12) * pull;
      pose[leg + LEG_CH.knee] += 0.35;
      pose[leg + LEG_CH.pitch] += 0.3;
    }
  }
  overlayLanding(target, elapsed) {
    const state = this.s;
    if (state.lastLandTime < 0) return;
    const since = elapsed - state.lastLandTime;
    if (since > 1.4 || since < 0) return;
    const groundW = (this.weights.ground + this.weights.slide) * (1 - Math.min(1, this.cmb.actW));
    if (groundW < 0.01) return;
    const landImpact = this.landImpact;
    if (this.landKind === 'crouch') {
      const crouch = envelope(since, 0.05, 0.28, 0.55) * groundW;
      target[BODY_CH.hipY] += -0.34 * crouch;
      target[BODY_CH.hipPitch] += 0.25 * crouch;
      target[BODY_CH.spPitch] += 0.45 * crouch;
      target[BODY_CH.chPitch] += 0.2 * crouch;
      target[BODY_CH.hdPitch] += -0.35 * crouch;
      const legL = legBase(1);
      const legR = legBase(-1);
      target[legL + LEG_CH.knee] += 0.3 * crouch;
      target[legR + LEG_CH.knee] += 0.4 * crouch;
      const armR = armBase(-1);
      target[armR + ARM_CH.ik] += crouch;
      target[armR + ARM_CH.tx] += -0.2 * crouch;
      target[armR + ARM_CH.ty] += 0.12 * crouch;
      target[armR + ARM_CH.tz] += 0.32 * crouch;
      this.setArm(target, 1, -0.5 * crouch, 0.9 * crouch, 0.4 * crouch);
      target[BODY_CH.squash] += -0.1 * pulse(since, 0.04, 0.2) * groundW;
      return;
    }
    if (this.landKind === 'roll') return;
    const depth = MathUtils.clamp((landImpact - 2.5) * 0.019, 0.015, 0.26);
    const depthN = depth / 0.26;
    const dip = pulse(since, 0.055, 0.2 + depth * 1.6) * groundW;
    target[BODY_CH.hipY] += -depth * dip;
    target[BODY_CH.hipPitch] += 0.18 * depthN * dip;
    target[BODY_CH.spPitch] += 0.3 * depthN * dip;
    target[BODY_CH.chPitch] += 0.12 * depthN * dip;
    target[BODY_CH.hdPitch] += -0.25 * depthN * dip;
    for (const side of [1, -1]) {
      this.setArm(target, side, 0.25 * depthN * dip, (0.35 + 0.5 * depthN) * dip, 0.3 * dip);
      target[legBase(side) + LEG_CH.knee] += 0.2 * depthN * dip;
    }
    target[BODY_CH.squash] += -0.13 * Math.min(1, 0.35 + depthN) * pulse(since, 0.05, 0.18 + depth) * groundW;
  }
  flipAngle = 0;
  flipYawAngle = 0;
  overlayFlip(target, elapsed) {
    this.flipAngle = 0;
    this.flipYawAngle = 0;
    const flip = this.flip;
    if (!flip) return;
    const age = elapsed - flip.t0;
    if (age < 0 || age > flip.dur + 0.3) {
      if (age > flip.dur + 0.3) this.flip = null;
      return;
    }
    const prog = clamp01(age / flip.dur);
    const tuck = Math.sin(Math.PI * prog) ** 0.7;
    if (flip.kind === 'roll') {
      this.flipAngle = FULL_TURN * easeInOut(prog);
      const curl = envelope(age, 0.05, flip.dur - 0.2, 0.25);
      target[BODY_CH.hipY] += -0.28 * curl;
      target[BODY_CH.spPitch] += 0.55 * curl;
      target[BODY_CH.chPitch] += 0.35 * curl;
      target[BODY_CH.hdPitch] += 0.45 * curl;
      for (const side of [1, -1]) {
        this.setArm(target, side, 0.9 * curl, 0.25 * curl, 1.6 * curl);
        const leg = legBase(side);
        target[leg + LEG_CH.plant] *= 1 - curl;
        target[leg + LEG_CH.fy] += 0.3 * curl;
        target[leg + LEG_CH.fz] += 0.15 * curl;
      }
    } else if (flip.kind === 'flip') {
      this.flipAngle = FULL_TURN * easeInOut(prog);
      target[BODY_CH.spPitch] += 0.5 * tuck;
      target[BODY_CH.chPitch] += 0.3 * tuck;
      target[BODY_CH.hdPitch] += 0.35 * tuck;
      for (const side of [1, -1]) {
        this.setArm(target, side, 0.8 * tuck, 0.3 * tuck, 1.3 * tuck);
        const leg = legBase(side);
        target[leg + LEG_CH.fy] += 0.3 * tuck;
        target[leg + LEG_CH.fz] += 0.18 * tuck;
      }
    } else {
      this.flipYawAngle = FULL_TURN * easeInOut(prog);
      for (const side of [1, -1]) {
        this.setArm(target, side, 0.1 * tuck, 1.3 * tuck, -0.3 * tuck);
        const leg = legBase(side);
        target[leg + LEG_CH.fy] += (side === 1 ? 0.25 : 0.05) * tuck;
        target[leg + LEG_CH.fz] += (side === 1 ? 0.1 : -0.05) * tuck;
      }
      target[BODY_CH.hdPitch] += -0.2 * tuck;
      target[BODY_CH.spPitch] += -0.1 * tuck;
    }
  }
  overlayAim(target, elapsed) {
    const state = this.s;
    const aimW = this.aimW;
    const sinceFlick = state.lastFlickTime >= 0 ? elapsed - state.lastFlickTime : 1000000000;
    const flickW = this.brushState === 'back' ? 0 : envelope(sinceFlick, 0.06, 0.05, 0.4);
    let amt = Math.max(aimW, flickW);
    if (amt < 0.001) return;
    const otherW = this.weights.climb + this.weights.glide + this.weights.swim + this.weights.fly * 0.45;
    const scale = 1 - 0.65 * Math.min(1, otherW);
    amt *= scale;
    const flick = flickW * scale;
    this.aimDirModel(_rigV2);
    const aimYaw = Math.atan2(_rigV2.x, _rigV2.z);
    const aimPitch = Math.asin(MathUtils.clamp(_rigV2.y, -1, 1));
    const turn = MathUtils.clamp(aimYaw, -1.4, 1.4);
    target[BODY_CH.hipYaw] += -0.12 * flick;
    target[BODY_CH.spYaw] += turn * 0.3 * amt + 0.15 * flick;
    target[BODY_CH.chYaw] += turn * 0.35 * amt + 0.3 * flick;
    target[BODY_CH.hdYaw] += turn * 0.3 * amt - 0.2 * flick;
    target[BODY_CH.chPitch] += -aimPitch * 0.25 * amt + 0.16 * flick;
    target[BODY_CH.spPitch] += 0.18 * flick;
    target[BODY_CH.hipY] += -0.03 * flick;
    target[BODY_CH.chRoll] += 0.08 * flick;
    target[BODY_CH.hdPitch] += -aimPitch * 0.4 * amt;
    this.setArm(
      target,
      1,
      0.9 * aimW - 0.7 * flickW,
      0.15 * aimW + 0.25 * flickW,
      0.35 * aimW + 0.3 * flickW,
      0,
      0,
      0.1 * aimW,
    );
  }
  overlayArt(target) {
    const art = this.art;
    const w = art.w;
    if (w < 0.001) return;
    const pose = art.pose;
    const weights = this.weights;
    const flyW = Math.min(1, weights.fly);
    const otherW = Math.min(1, weights.climb + weights.glide + weights.swim);
    const upperW = w * (1 - 0.45 * flyW) * (1 - 0.6 * otherW);
    const lowerW = w * (1 - flyW) * (1 - otherW);
    target[BODY_CH.hipYaw] += pose.hw * lowerW;
    target[BODY_CH.hipY] += pose.hy * lowerW;
    target[BODY_CH.squash] += (pose.sq - 1) * lowerW;
    target[BODY_CH.spPitch] += pose.sp * upperW;
    target[BODY_CH.spYaw] += pose.sy * upperW;
    target[BODY_CH.chPitch] += pose.cp * upperW;
    target[BODY_CH.chYaw] += pose.cy * upperW;
    target[BODY_CH.chRoll] += pose.cr * upperW;
    target[BODY_CH.hdPitch] += pose.dp * upperW;
    target[BODY_CH.hdYaw] += -(pose.cy + pose.sy) * 0.55 * upperW;
    target[BODY_CH.nkYaw] += -(pose.cy + pose.sy) * 0.2 * upperW;
    const armW = w * (1 - flyW);
    const flyArmW = w * flyW;
    this.setArm(
      target,
      1,
      pose.aS * armW + pose.fS * flyArmW,
      pose.aA * armW + pose.fA * flyArmW,
      pose.aE * armW + pose.fE * flyArmW,
    );
  }
  overlayFidget(target, elapsed) {
    const fidget = this.fidget;
    this.lookHandW = 0;
    if (!fidget) return;
    const fidgetT = this.fidgetT;
    const ground = this.weights.ground;
    if (fidget === 'stretch') {
      const stretch = envelope(fidgetT, 0.8, 1.3, 0.9) * ground;
      const rise = envelope(fidgetT, 1, 0.9, 0.8) * ground;
      for (const side of [1, -1]) {
        this.setArm(target, side, 2.75 * stretch, 0.35 * stretch, 0.4 * stretch, 0, 0.25 * stretch);
        const base = armBase(side);
        target[base + ARM_CH.wPitch] += -0.4 * stretch;
      }
      target[BODY_CH.spPitch] += -0.18 * stretch;
      target[BODY_CH.chPitch] += -0.14 * stretch;
      target[BODY_CH.hdPitch] += -0.3 * stretch;
      target[BODY_CH.hdRoll] += 0.12 * Math.sin(fidgetT * 2.2) * stretch;
      target[BODY_CH.hipY] += 0.02 * rise;
      target[BODY_CH.chRoll] += 0.08 * Math.sin(fidgetT * 2.5) * stretch;
    } else if (fidget === 'look') {
      const look = envelope(fidgetT, 0.5, 2, 0.6) * ground;
      const scan = Math.sin((fidgetT - 0.5) * 1.6) * 0.55;
      target[BODY_CH.hdYaw] += scan * 0.3 * look;
      target[BODY_CH.hdPitch] += -0.1 * look;
      target[BODY_CH.spPitch] += 0.06 * look;
      target[BODY_CH.spYaw] += scan * 0.35 * look;
      target[BODY_CH.chYaw] += scan * 0.35 * look;
      target[BODY_CH.hipY] += 0.015 * Math.max(0, Math.sin(fidgetT * 3)) * look;
      const base = armBase(-1);
      const cos = Math.cos(scan);
      const sin = Math.sin(scan);
      const reach = 0.17;
      target[base + ARM_CH.ik] += look;
      target[base + ARM_CH.tx] += (-0.09 * cos + reach * sin) * look;
      target[base + ARM_CH.ty] += (REST_POS[BONE.head].y + 0.245) * look;
      target[base + ARM_CH.tz] += (0.09 * sin + reach * cos) * look;
      this.lookHandW = look;
      this.lookScan = scan;
      this.setArm(target, 1, -0.1 * look, 0.1 * look, 0.3 * look);
    } else if (fidget === 'twirl') {
      const twirl = envelope(fidgetT, 0.4, 2, 0.5) * ground;
      target[BODY_CH.hdYaw] += -0.2 * twirl;
      target[BODY_CH.hdPitch] += 0.12 * twirl;
      target[BODY_CH.chYaw] += 0.15 * twirl;
      this.setArm(target, 1, 0.1 * twirl, 0.3 * twirl, 0.4 * twirl);
    }
  }
  overlayItem(target) {
    const itemW = this.cmb.itemW;
    if (itemW < 0.002) return;
    const chroma = this.cmb.itemKind === 'chromaBrush';
    const itemT = this.cmb.itemT;
    const itemKind = this.cmb.itemKind;
    const crest = itemKind === 'emberCrest' || itemKind === 'frostCrest';
    const spread = crest ? 0.16 : itemKind === 'cloudstep' ? 0.13 : itemKind === 'lantern' ? 0.05 : 0.07;
    const lift = crest ? 0.36 : itemKind === 'lantern' ? 0.44 : 0.4;
    const fwd = crest ? 0.1 : 0.05;
    for (const side of [1, -1]) {
      const base = armBase(side);
      target[base + ARM_CH.clavUp] += (crest ? 0.26 : 0.2) * itemW;
      if (chroma) continue;
      const bob = 0.012 * Math.sin(itemT * 2.6);
      const tx = side * spread;
      const ty = REST_POS[BONE.head].y + lift + bob;
      const tz = fwd;
      target[base + ARM_CH.ik] = target[base + ARM_CH.ik] * (1 - itemW) + itemW;
      target[base + ARM_CH.tx] = target[base + ARM_CH.tx] * (1 - itemW) + tx * itemW;
      target[base + ARM_CH.ty] = target[base + ARM_CH.ty] * (1 - itemW) + ty * itemW;
      target[base + ARM_CH.tz] = target[base + ARM_CH.tz] * (1 - itemW) + tz * itemW;
      target[base + ARM_CH.wPitch] += 0.7 * itemW;
      target[base + ARM_CH.wRoll] += -0.35 * itemW;
    }
  }
  overlayFace(target, elapsed, dt) {
    let blink = 0;
    if (this.blinkT >= 0) blink = Math.sin(Math.PI * clamp01(this.blinkT / 0.18));
    if (this.fidget === 'stretch') blink = Math.max(blink, envelope(this.fidgetT, 1, 0.9, 0.3) * this.weights.ground);
    if (this.s.dead) blink = Math.max(blink, smoothStep(0.3, 0.9, this.cmb.actT));
    target[BODY_CH.blink] = blink;
  }
  updateFace(dt, elapsed) {
    const state = this.s;
    const ch = this.springs.x;
    const cmb = this.cmb;
    const expr = this.expr;
    const params = this.hero.face.params;
    const action = cmb.action;
    const actW = Math.min(1, cmb.actW);
    const ground = this.weights.ground;
    const sinceFlick = state.lastFlickTime >= 0 ? elapsed - state.lastFlickTime : 1000000000;
    const itemW = cmb.itemKind && cmb.itemW > 0.05 ? cmb.itemW : 0;
    const itemT = cmb.itemT;
    const det = Math.max(
      cmb.stanceW * 0.85,
      this.aimW * 0.75,
      action === 'attack' || action === 'charge' || action === 'dodge' ? actW : 0,
      pulse(sinceFlick, 0.03, 0.5) * 0.8,
      this.gait.sprintW * ground * 0.55,
      this.weights.fly * (0.2 + 0.7 * this.fly.boost),
      this.mantleW * 0.6,
      this.weights.climb * 0.3,
      this.lookHandW * 0.45,
      this.art.det,
    );
    const charging = action === 'charge' ? Math.min(1, state.charge) : 0;
    const strain = Math.max(
      this.tremble * this.weights.climb,
      state.exhausted ? 0.85 : 0,
      charging * 0.85,
      this.mantleW * 0.35,
      this.art.strain,
    );
    const hurt =
      action === 'hurt' || action === 'knockdown'
        ? actW * (action === 'knockdown' ? 1 - smoothStep(0.8, 1.2, cmb.actT) : 1)
        : 0;
    const flipping = this.flip && this.flip.kind !== 'roll' ? 1 : 0;
    const joy = Math.max(
      itemW * smoothStep(ITEM_JOY_T, ITEM_JOY_T + 0.1, itemT),
      action === 'victory' ? actW : 0,
      flipping * 0.9,
      this.weights.glide * 0.45,
      this.weights.fly * 0.45 * (1 - this.fly.boost),
      this.twirlW * 0.6,
    );
    const happy = Math.max(
      itemW * Math.max(0, Math.sin(Math.PI * clamp01((itemT - ITEM_JOY_T) / 0.9))),
      action === 'victory' ? smoothStep(1, 1.15, cmb.actT) * (1 - smoothStep(1.6, 1.8, cmb.actT)) * actW : 0,
      flipping * 0.85,
    );
    const surprise = Math.max(this.flailW * this.weights.air, hurt * 0.2);
    const yawn = this.fidget === 'stretch' ? envelope(this.fidgetT, 0.9, 1, 0.4) * ground : 0;
    const yell = Math.max(cmb.strokeLive ? 1 : action === 'charge' && state.charge >= 1 ? 0.4 : 0, this.art.yell);
    const pant = Math.max(this.gait.sprintW * ground, +!!state.exhausted, this.freeW * this.weights.swim * 0.5);
    this.easeExpr('det', det, dt, 9);
    this.easeExpr('strain', strain, dt, 6);
    this.easeExpr('joy', joy, dt, 7);
    this.easeExpr('happy', happy, dt, 14);
    this.easeExpr('surprise', surprise, dt, 8);
    this.easeExpr('hurt', hurt, dt, 30, 8);
    this.easeExpr('yawn', yawn, dt, 8);
    this.easeExpr('yell', yell, dt, 30, 7);
    this.easeExpr('pant', pant, dt, 4);
    if (this.forcedFace) {
      for (const key in expr) expr[key] = 0;
      expr[this.forcedFace] = 1;
    }
    const faceRest = this.faceRest;
    const calm = 1 - Math.min(1, expr.det + expr.strain + expr.hurt + expr.surprise);
    params.blink = clamp01(ch[BODY_CH.blink]);
    params.happy = clamp01(expr.happy * (1 - expr.hurt));
    params.squeeze = clamp01(Math.max(expr.hurt, smoothStep(0.55, 1, expr.strain) * 0.9));
    params.widen = clamp01(expr.surprise - expr.hurt);
    params.lid = clamp01(
      faceRest.lid * calm + 0.5 * expr.det + 0.35 * expr.strain - 0.2 * expr.joy + 0.25 * expr.pant * (1 - expr.det),
    );
    params.lidTilt = 0.85 * expr.det - 0.7 * expr.strain;
    params.browY = -0.0035 * expr.det + 0.003 * expr.joy + 0.008 * expr.surprise + 0.002 * expr.strain;
    params.browTilt = -0.95 * expr.det + 1 * expr.strain + 0.4 * expr.surprise + 0.8 * expr.hurt;
    params.mouthCurve =
      faceRest.mouthCurve +
      0.7 * expr.joy -
      1.1 * expr.det -
      1 * expr.strain -
      0.9 * expr.hurt -
      0.5 * expr.surprise -
      0.4 * expr.yell;
    params.mouthOpen = clamp01(
      0.75 * expr.joy +
        0.6 * expr.strain +
        0.75 * expr.surprise +
        0.55 * expr.hurt +
        1 * expr.yawn +
        0.7 * expr.yell +
        0.35 * expr.pant,
    );
    params.mouthWidth =
      1 +
      0.6 * expr.joy +
      0.7 * expr.strain +
      0.45 * expr.hurt -
      0.3 * expr.surprise +
      0.25 * expr.yawn -
      0.1 * expr.det +
      0.2 * expr.yell;
    params.teeth = clamp01(Math.max(expr.strain, expr.hurt * 0.9) * (1 - expr.yawn));
    params.blush = clamp01(0.5 * expr.joy + 0.5 * expr.strain + 0.4 * expr.pant);
    this.nextSacc -= dt;
    if (this.nextSacc <= 0) {
      const hashA = Math.sin(elapsed * 45.17) * 9173.3;
      const hashB = Math.sin(elapsed * 23.71) * 4417.9;
      this.saccX = (hashA - Math.floor(hashA) - 0.5) * 0.5;
      this.saccY = (hashB - Math.floor(hashB) - 0.5) * 0.35;
      this.nextSacc = 0.6 + (hashA - Math.floor(hashA)) * 1.8;
    }
    const lookW = ground * (1 - this.aimW) * (1 - cmb.stanceW);
    const headYaw = ch[BODY_CH.hdYaw] + ch[BODY_CH.nkYaw];
    let gazeX = (this.lookYaw - headYaw) * 1.4 * lookW + this.saccX * lookW * 0.6;
    let gazeY = -this.lookPitch * 1.2 * lookW + this.saccY * lookW * 0.5;
    if (this.aimW > 0.01) {
      this.aimDirModel(_rigV);
      const aimYaw = Math.atan2(_rigV.x, _rigV.z);
      const bodyYaw = ch[BODY_CH.hipYaw] + ch[BODY_CH.spYaw] + ch[BODY_CH.chYaw] + headYaw;
      gazeX += MathUtils.clamp((aimYaw - bodyYaw) * 2, -1, 1) * this.aimW;
      gazeY += MathUtils.clamp(Math.asin(MathUtils.clamp(_rigV.y, -1, 1)) * 2, -1, 1) * this.aimW;
    }
    gazeX += MathUtils.clamp(cmb.lookYaw * 1.2, -1, 1) * cmb.stanceW;
    gazeY +=
      this.weights.climb * (0.35 + 0.45 * Math.max(0, state.climbInput.y)) -
      this.weights.glide * 0.35 -
      this.weights.fly * 0.15 * (1 - this.fly.cruise);
    gazeX += this.weights.climb * -state.climbInput.x * 0.5;
    gazeY += itemW * 0.7;
    const ease = 1 - Math.exp(-18 * dt);
    params.lookX += (MathUtils.clamp(gazeX, -1, 1) - params.lookX) * ease;
    params.lookY += (MathUtils.clamp(gazeY, -1, 1) - params.lookY) * ease;
  }
  easeExpr(key, target, dt, rise, fall = rise) {
    const expr = this.expr;
    expr[key] += (target - expr[key]) * (1 - Math.exp(-(target > expr[key] ? rise : fall) * dt));
  }
  updateFingers(dt) {
    const pose = this.hero.pose;
    const weights = this.weights;
    const ease = 1 - Math.exp(-20 * dt);
    const runCurl = 0.55 * this.gait.runW * weights.ground;
    const brushItem = this.cmb.itemKind === 'chromaBrush' || this.cmb.itemKind === 'brushflight';
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      let curl = 0.45 + runCurl - 0.3 * weights.swim - 0.15 * weights.air + 0.25 * this.cmb.stanceW;
      curl += (1.05 - curl) * weights.climb * (1 - this.mantleW);
      curl += (1.7 - curl) * clamp01(Math.max(this.gripAmt[i], weights.glide));
      if (!brushItem) curl += (0.15 - curl) * this.cmb.itemW;
      if (side === -1) {
        curl += (0.08 - curl) * this.lookHandW;
        curl += (0.95 - curl) * this.gestR * weights.ground;
      } else curl += (0.35 - curl) * this.gestL * weights.ground;
      this.curl[i] += (curl - this.curl[i]) * ease;
      const bone = side === 1 ? BONE.fingersL : BONE.fingersR;
      pose.local[bone].setFromAxisAngle(_zAxis, -side * this.curl[i]);
      pose.fkOne(bone);
    }
  }
  aimDirModel(out) {
    const state = this.s;
    const aimTarget = state.aimTarget;
    if (aimTarget.lengthSq() < 0.000001 || aimTarget.distanceToSquared(state.position) < 0.25) {
      return out.set(0, -0.1, 1).normalize();
    } else {
      this.worldToModel(aimTarget, out);
      out.y -= 1.3;
      if (out.lengthSq() < 0.000001) out.set(0, 0, 1);
      return out.normalize();
    }
  }
  applyPose(dt, elapsed) {
    const ch = this.springs.x;
    const pose = this.hero.pose;
    pose.reset();
    this.s;
    pose.localPos[BONE.pelvis].set(ch[BODY_CH.hipX], REST_POS[BONE.pelvis].y + ch[BODY_CH.hipY], ch[BODY_CH.hipZ]);
    pose.local[BONE.pelvis].setFromEuler(
      _rigEuler.set(ch[BODY_CH.hipPitch], ch[BODY_CH.hipYaw], ch[BODY_CH.hipRoll], 'YXZ'),
    );
    pose.local[BONE.spine].setFromEuler(
      _rigEuler.set(ch[BODY_CH.spPitch], ch[BODY_CH.spYaw], ch[BODY_CH.spRoll], 'YXZ'),
    );
    pose.local[BONE.chest].setFromEuler(
      _rigEuler.set(ch[BODY_CH.chPitch], ch[BODY_CH.chYaw], ch[BODY_CH.chRoll], 'YXZ'),
    );
    pose.local[BONE.neck].setFromEuler(
      _rigEuler.set(ch[BODY_CH.nkPitch], ch[BODY_CH.nkYaw], ch[BODY_CH.nkRoll], 'YXZ'),
    );
    pose.local[BONE.head].setFromEuler(
      _rigEuler.set(ch[BODY_CH.hdPitch], ch[BODY_CH.hdYaw], ch[BODY_CH.hdRoll], 'YXZ'),
    );
    if (this.tremble > 0.01 && this.weights.climb > 0.01) {
      const shake = this.tremble * this.weights.climb;
      pose.localPos[BONE.pelvis].x += Math.sin(elapsed * 53) * 0.006 * shake;
      pose.localPos[BONE.pelvis].y += Math.sin(elapsed * 41 + 1) * 0.005 * shake;
      _rigQ.setFromEuler(
        _rigEuler.set(Math.sin(elapsed * 37) * 0.03 * shake, 0, Math.sin(elapsed * 47) * 0.03 * shake),
      );
      pose.local[BONE.chest].multiply(_rigQ);
    }
    if (this.art.tremble > 0.01) {
      const tremble = this.art.tremble;
      pose.localPos[BONE.pelvis].x += Math.sin(elapsed * 53) * 0.003 * tremble;
      _rigQ.setFromEuler(
        _rigEuler.set(
          Math.sin(elapsed * 37) * 0.018 * tremble,
          Math.sin(elapsed * 31 + 2) * 0.014 * tremble,
          Math.sin(elapsed * 47) * 0.02 * tremble,
        ),
      );
      pose.local[BONE.chest].multiply(_rigQ);
    }
    for (const side of [1, -1]) {
      const base = armBase(side);
      const left = side === 1;
      pose.local[left ? BONE.clavL : BONE.clavR].setFromEuler(
        _rigEuler.set(0, -side * ch[base + ARM_CH.clavFwd], side * ch[base + ARM_CH.clavUp], 'XYZ'),
      );
      pose.local[left ? BONE.armL : BONE.armR].setFromEuler(
        _rigEuler.set(-ch[base + ARM_CH.swing], side * ch[base + ARM_CH.twist], side * ch[base + ARM_CH.abd], 'XZY'),
      );
      pose.local[left ? BONE.foreL : BONE.foreR].setFromEuler(
        _rigEuler.set(-Math.max(0, ch[base + ARM_CH.elbow]), 0, 0),
      );
      pose.local[left ? BONE.handL : BONE.handR].setFromEuler(
        _rigEuler.set(-ch[base + ARM_CH.wPitch], side * ch[base + ARM_CH.wYaw], side * ch[base + ARM_CH.wRoll], 'XYZ'),
      );
    }
    pose.fk();
    this.solveLegs(ch);
    this.solveArms(ch, elapsed);
    this.updateFingers(dt);
    this.updateHood(dt);
    this.updateSatchel(dt);
    this.squash = MathUtils.clamp(ch[BODY_CH.squash], 0.75, 1.3);
    const squash = this.squash;
    pose.scale[BONE.root].set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    this.flipQ.identity();
    const cmb = this.cmb;
    const rootPitch = cmb.rootPitch;
    const rootYaw = cmb.rootYaw;
    const rootLift = cmb.rootLift;
    const flyW = this.weights.fly;
    const flyAnim = this.fly;
    if (flyW > 0.002 && Math.abs(flyAnim.pitch) + Math.abs(flyAnim.roll) + Math.abs(flyAnim.lift) > 0.00001) {
      _rigQ.setFromAxisAngle(PITCH_AXIS, flyAnim.pitch * flyW);
      _rigQ2.setFromAxisAngle(_zAxis, flyAnim.roll * flyW);
      this.flipQ.multiplyQuaternions(_rigQ, _rigQ2);
      pose.local[BONE.root].copy(this.flipQ);
      _rigV.set(0, flyAnim.pivotY, 0).applyQuaternion(this.flipQ);
      pose.localPos[BONE.root].set(-_rigV.x, flyAnim.pivotY - _rigV.y + flyAnim.lift * flyW, -_rigV.z);
    } else if (this.flipAngle !== 0 || this.flipYawAngle !== 0 || rootPitch !== 0 || rootYaw !== 0 || rootLift !== 0) {
      const rolling = this.flip?.kind === 'roll';
      let pivotY = rolling ? 0.46 : 0.85;
      if (Math.abs(rootPitch) > Math.abs(this.flipAngle)) pivotY = cmb.pivotY;
      _rigQ.setFromAxisAngle(PITCH_AXIS, this.flipAngle + rootPitch);
      _rigQ2.setFromAxisAngle(YAW_AXIS, this.flipYawAngle + rootYaw);
      this.flipQ.multiplyQuaternions(_rigQ2, _rigQ);
      pose.local[BONE.root].copy(this.flipQ);
      _rigV.set(0, pivotY, 0).applyQuaternion(this.flipQ);
      const lift = rolling
        ? 0.07 * Math.sin(this.flipAngle / 2)
        : cmb.pivotY < 0.6 && rootPitch !== 0
          ? 0.07 * Math.abs(Math.sin(rootPitch / 2))
          : 0;
      pose.localPos[BONE.root].set(-_rigV.x, pivotY - _rigV.y + lift + rootLift, -_rigV.z);
    }
  }
  solveLegs(ch) {
    const pose = this.hero.pose;
    const climbW = this.weights.climb * (1 - this.mantleW);
    const slideW = this.weights.slide;
    const targets = [_rigV3, _rigV4];
    const footRots = [_rigQ3, _rigQ4];
    const drops = [0, 0];
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const base = legBase(side);
      const plant = MathUtils.clamp(ch[base + LEG_CH.plant], 0, 1);
      const target = targets[i];
      const pelvisRot = pose.mRot[BONE.pelvis];
      _rigV
        .copy(REST_ANKLES[i])
        .sub(REST_POS[BONE.pelvis])
        .add(_rigV2.set(ch[base + LEG_CH.fx], ch[base + LEG_CH.fy], ch[base + LEG_CH.fz]));
      target.copy(_rigV.applyQuaternion(pelvisRot)).add(pose.mPos[BONE.pelvis]);
      _rigQ2.setFromEuler(
        _rigEuler.set(ch[base + LEG_CH.pitch], side * 0.08 + ch[base + LEG_CH.yaw], ch[base + LEG_CH.roll], 'YXZ'),
      );
      footRots[i].multiplyQuaternions(pelvisRot, _rigQ2);
      if (slideW > 0.01) {
        this.modelToWorld(target, _rigV);
        this.probe(_rigV.x, _rigV.z, this.rootPos.y, this.hit);
        const groundY = this.hit.y + 0.088 - this.rootPos.y;
        target.y += (groundY - target.y) * slideW * (1 - plant);
        _rigV.set(0, 0, 1).applyQuaternion(footRots[i]);
        const heading = Math.atan2(_rigV.x, _rigV.z);
        this.dirToModel(this.hit.normal, _rigV2);
        _rigQ.setFromUnitVectors(FOOT_UP, _rigV2);
        _rigQ2.setFromEuler(_rigEuler.set(0, heading, 0, 'YXZ'));
        _rigQ.multiply(_rigQ2);
        footRots[i].slerp(_rigQ, slideW);
      }
      if (climbW > 0.01) {
        const grip = this.climb.grips[2 + i];
        this.worldToModel(grip.pos, _rigV);
        _rigV2.copy(this.s.wallNormal);
        this.dirToModel(_rigV2, _rigV2);
        _rigV.addScaledVector(_rigV2, 0.1);
        target.lerp(_rigV, climbW);
        _rigQ.setFromEuler(_rigEuler.set(0.35, side * 0.15, 0, 'YXZ'));
        footRots[i].slerp(_rigQ, climbW);
      }
      if (plant > 0.001) {
        const foot = this.gait.feet[i];
        this.worldToModel(foot.pos, _rigV);
        const pitch = foot.pitch;
        const yaw = foot.yaw - this.yaw.x;
        let pivotY = 0;
        let pivotZ = 0;
        if (pitch >= 0) {
          pivotY = 0.075 * (Math.cos(pitch) - 1) + 0.105 * Math.sin(pitch);
          pivotZ = 0.075 * Math.sin(pitch) - 0.105 * (Math.cos(pitch) - 1);
        } else {
          pivotY = 0.075 * (Math.cos(pitch) - 1) - 0.06 * Math.sin(pitch);
          pivotZ = 0.075 * Math.sin(pitch) + 0.06 * (Math.cos(pitch) - 1);
        }
        this.dirToModel(foot.normal, _rigV2);
        _rigQ.setFromUnitVectors(FOOT_UP, _rigV2);
        _footPivot.set(Math.sin(yaw) * pivotZ, pivotY, Math.cos(yaw) * pivotZ).applyQuaternion(_rigQ);
        _rigV.add(_footPivot);
        target.lerp(_rigV, plant);
        _rigQ2.setFromEuler(_rigEuler.set(pitch, yaw, 0, 'YXZ'));
        _rigQ.multiply(_rigQ2);
        footRots[i].slerp(_rigQ, plant);
        if (foot.planted || plant > 0.5) {
          const hip = pose.mPos[i === 0 ? BONE.thighL : BONE.thighR];
          const reach = (THIGH_LEN + SHIN_LEN) * 0.985;
          const dx = hip.x - target.x;
          const dz = hip.z - target.z;
          const distSq = dx * dx + dz * dz;
          const drop = hip.y - target.y - Math.sqrt(Math.max(0, reach * reach - distSq));
          drops[i] = Math.max(0, drop) * plant * (foot.planted ? 1 : 0.6);
        }
      }
      const legW = Math.min(1, this.cmb.legW);
      if (legW > 0.001) {
        const combatFoot = i === 0 ? this.cmb.frame.fL : this.cmb.frame.fR;
        _rigV.set(combatFoot.x, 0, combatFoot.y);
        this.modelToWorld(_rigV, _rigV2);
        this.probe(_rigV2.x, _rigV2.z, this.rootPos.y, this.hit);
        _rigV.y = this.hit.y - this.rootPos.y + 0.088 + combatFoot.z - this.cmb.rootLift;
        target.lerp(_rigV, legW);
        this.dirToModel(this.hit.normal, _rigV2);
        _rigQ.setFromUnitVectors(FOOT_UP, _rigV2);
        _rigQ2.setFromEuler(_rigEuler.set(combatFoot.z > 0.02 ? 0.35 : 0, i === 0 ? 0.08 : -0.42, 0, 'YXZ'));
        _rigQ.multiply(_rigQ2);
        footRots[i].slerp(_rigQ, legW);
        const hip = pose.mPos[i === 0 ? BONE.thighL : BONE.thighR];
        const reach = (THIGH_LEN + SHIN_LEN) * 0.985;
        const dx = hip.x - target.x;
        const dz = hip.z - target.z;
        const drop = hip.y - target.y - Math.sqrt(Math.max(0, reach * reach - (dx * dx + dz * dz)));
        drops[i] = Math.max(drops[i], Math.max(0, drop) * legW);
      }
    }
    const pelvisDrop = Math.min(0.45, Math.max(drops[0], drops[1]));
    if (pelvisDrop > 0.0001) {
      pose.localPos[BONE.pelvis].y -= pelvisDrop;
      pose.fk(BONE.pelvis);
    }
    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? 1 : -1;
      const base = legBase(side);
      const thighBone = i === 0 ? BONE.thighL : BONE.thighR;
      const shinBone = i === 0 ? BONE.shinL : BONE.shinR;
      const footBone = i === 0 ? BONE.footL : BONE.footR;
      const hip = pose.mPos[thighBone];
      const fwd = _rigV.set(0, 0, 1).applyQuaternion(footRots[i]);
      fwd.y = 0;
      if (fwd.lengthSq() < 0.0001) fwd.set(0, 0, 1);
      fwd.normalize();
      const pole = _rigV2
        .copy(fwd)
        .add(_rigV5.set(side * (0.12 + ch[base + LEG_CH.knee] * 0.5), 0.1, 0))
        .normalize();
      if (this.weights.climb > 0.5) pole.set(side * 0.75, -0.2, 1).normalize();
      const knee = _ikKnee;
      const ankle = _ikAnkle;
      solveTwoBoneIK(hip, targets[i], pole, THIGH_LEN, SHIN_LEN, knee, ankle, 0.015);
      this.reachErr[i] = ankle.distanceTo(targets[i]);
      const legDir = _rigV5.subVectors(ankle, hip).normalize();
      const hinge = _legHinge.crossVectors(legDir, pole).normalize().negate();
      limbRotation(_rigV.subVectors(knee, hip), hinge, _rigQ);
      pose.setModelRot(thighBone, _rigQ);
      limbRotation(_rigV.subVectors(ankle, knee), hinge, _rigQ);
      pose.setModelRot(shinBone, _rigQ);
      pose.setModelRot(footBone, footRots[i]);
      this.modelToWorld(pose.mPos[footBone], this.ankleWorld[i]);
    }
  }
  solveArms(ch, elapsed) {
    const pose = this.hero.pose;
    const elbow = _rigV4;
    const wrist = _rigV5;
    const back = this.brushBack(_brushBackPos, _brushBackRot);
    const hold = this.brushHold(_brushHoldPos, _brushHoldRot, elapsed);
    const brushW = this.fly.brushW;
    if (brushW > 0.001) {
      if (this.flySrcBack > 0.001) {
        hold.pos.lerp(back.pos, this.flySrcBack);
        hold.rot.slerp(back.rot, this.flySrcBack);
      }
      const arc = Math.sin(Math.PI * Math.min(1, brushW));
      _flyGripPos.copy(this.fly.gripPos);
      _flyGripPos.x -= 0.34 * arc;
      _flyGripPos.y += 0.12 * arc;
      hold.pos.lerp(_flyGripPos, brushW);
      hold.rot.slerp(this.fly.rot, brushW);
      back.pos.lerp(_flyGripPos, brushW);
      back.rot.slerp(this.fly.rot, brushW);
    }
    const combatW = this.cmb.brushW * (1 - Math.max(this.aimW, this.art.w));
    let twoHandW = 0;
    if (combatW > 0.001) {
      this.combatBrush(_combatBrushPos, _combatBrushRot);
      hold.pos.lerp(_combatBrushPos, combatW);
      hold.rot.slerp(_combatBrushRot, combatW);
      twoHandW = clamp01(this.cmb.frame.two) * combatW * this.brushInHand * +(this.brushState === 'hand');
    }
    for (const side of [1, -1]) {
      const base = armBase(side);
      const armBone = side === 1 ? BONE.armL : BONE.armR;
      const foreBone = side === 1 ? BONE.foreL : BONE.foreR;
      const handBone = side === 1 ? BONE.handL : BONE.handR;
      let ikW = MathUtils.clamp(ch[base + ARM_CH.ik], 0, 1);
      const target = _rigV3.set(ch[base + ARM_CH.tx], ch[base + ARM_CH.ty], ch[base + ARM_CH.tz]);
      if (ikW > 0.001) target.divideScalar(Math.max(ikW, 0.001));
      let handRot = null;
      const climbW = this.weights.climb * (1 - this.mantleW);
      if (climbW > 0.01) {
        const grip = this.climb.grips[side === 1 ? 0 : 1];
        this.worldToModel(grip.pos, _rigV);
        _rigV2.copy(this.s.wallNormal);
        this.dirToModel(_rigV2, _rigV2);
        _rigV.addScaledVector(_rigV2, 0.05);
        _rigV.y -= 0.03;
        if (ikW > 0.001) target.lerp(_rigV, climbW);
        else target.copy(_rigV);
        ikW = Math.max(ikW, climbW);
        _rigV2.copy(this.s.wallNormal);
        this.dirToModel(_rigV2, _rigV2);
        _rigV.crossVectors(_rigV2, _rigV5.set(0, -1, 0)).multiplyScalar(side);
        handRot = rotationAlongY(_rigV5.set(0, -1, 0), _rigV, _rigQ2);
      }
      const crawlW = this.freeW * this.weights.swim;
      if (crawlW > 0.001) {
        const stroke = FULL_TURN * this.swimPhase + (side === 1 ? 0 : Math.PI);
        const radius = 0.4;
        _rigV.set(
          side * (0.2 + 0.08 * Math.max(0, -Math.sin(stroke))),
          0.12 + radius * Math.cos(stroke),
          0.1 + radius * 1.1 * Math.sin(stroke),
        );
        _rigV.applyQuaternion(pose.mRot[BONE.chest]).add(pose.mPos[BONE.chest]);
        if (ikW > 0.001) target.lerp(_rigV, crawlW);
        else target.copy(_rigV);
        ikW = Math.max(ikW, crawlW);
      }
      let gripL = 0;
      if (side === 1 && twoHandW > 0.001) {
        const shaft = _rigV.set(0, 1, 0).applyQuaternion(hold.rot);
        const gripPt = _rigV2.copy(hold.pos).addScaledVector(shaft, this.cmb.twoGap);
        _rigV5.copy(pose.mPos[BONE.armL]).add(ELBOW_HINT_L).sub(gripPt);
        const rot = quatFromForwardUp(shaft, _rigV5, _rigQ2);
        const wristPos = gripPt.sub(_rigV5.copy(GRIP_OFFSET).applyQuaternion(rot));
        if (ikW > 0.001) target.lerp(wristPos, twoHandW);
        else target.copy(wristPos);
        ikW += (1 - ikW) * twoHandW;
        handRot = rot;
        gripL = twoHandW;
      }
      let gripR = 0;
      if (side === -1 && this.brushState !== 'back') {
        const brushState = this.brushState;
        const dur = brushState === 'draw' ? this.brushDrawDur : 0.42;
        const prog = clamp01(this.brushT / dur);
        let reach = 0;
        let pos;
        let rot;
        if (brushState === 'draw') {
          if (prog < 0.45) {
            reach = smoothStep(0, 0.45, prog);
            pos = back.pos;
            rot = back.rot;
          } else {
            reach = 1;
            const blend = easeInOut((prog - 0.45) / 0.55);
            pos = _rigV.lerpVectors(back.pos, hold.pos, blend);
            rot = _rigQ.slerpQuaternions(back.rot, hold.rot, blend);
            this.brushInHand = blend;
          }
        } else if (brushState === 'sheathe') {
          if (prog < 0.55) {
            reach = 1;
            const blend = easeInOut(prog / 0.55);
            pos = _rigV.lerpVectors(hold.pos, back.pos, blend);
            rot = _rigQ.slerpQuaternions(hold.rot, back.rot, blend);
            this.brushInHand = 1 - blend;
          } else {
            reach = 1 - smoothStep(0.55, 1, prog);
            pos = back.pos;
            rot = back.rot;
            this.brushInHand = 0;
          }
        } else {
          reach = 1;
          pos = hold.pos;
          rot = hold.rot;
          this.brushInHand = 1;
        }
        this.setBrush(pos, rot);
        const gripRot = _rigQ2.multiplyQuaternions(rot, GRIP_ROT);
        const wristPos = _rigV2.copy(pos).sub(_rigV5.copy(GRIP_OFFSET).applyQuaternion(gripRot));
        target.lerp(wristPos, reach);
        if (ikW < 0.001) target.copy(wristPos);
        ikW += (1 - ikW) * reach;
        handRot = gripRot;
        gripR = reach;
      } else if (side === -1) {
        this.brushInHand = 0;
        this.setBrush(back.pos, back.rot);
        if (this.lookHandW > 0.001) {
          _rigV.set(-1, 0, 0).applyAxisAngle(YAW_AXIS, this.lookScan);
          _rigV2.set(0, 0, -1).applyAxisAngle(YAW_AXIS, this.lookScan);
          handRot = rotationAlongY(_rigV, _rigV2, _rigQ2);
          gripR = this.lookHandW;
        }
      }
      const flyGrip = this.fly.gripW[side === 1 ? 0 : 1] * Math.min(1, brushW * 1.5);
      if (flyGrip > 0.001) {
        const handle = this.fly.handlePoint(this.fly.handD[side === 1 ? 0 : 1], _rigV);
        const dir = _rigV2.copy(this.fly.dir).negate();
        _rigV5
          .copy(pose.mPos[armBone])
          .add(side === 1 ? ELBOW_HINT_L : ELBOW_HINT_R)
          .sub(handle);
        const rot = quatFromForwardUp(dir, _rigV5, _flyHandRot);
        const wristPos = handle.sub(_rigV5.copy(GRIP_OFFSET).applyQuaternion(rot));
        if (ikW > 0.001) target.lerp(wristPos, flyGrip);
        else target.copy(wristPos);
        ikW += (1 - ikW) * flyGrip;
        handRot = rot;
        if (side === -1) gripR = Math.max(gripR, flyGrip);
        else gripL = Math.max(gripL, flyGrip);
      }
      this.gripAmt[side === 1 ? 0 : 1] =
        side === -1 ? gripR * (this.lookHandW > 0.001 && this.brushState === 'back' ? 0 : 1) : gripL;
      if (ikW < 0.001) continue;
      const shoulder = pose.mPos[armBone];
      const pole = _rigV.set(side * 0.55, -0.45, -0.7);
      if (side === 1 && this.gestL > 0.01) pole.x += this.gestL * 1.4 * this.weights.ground;
      if (this.weights.glide > 0.5) pole.set(side * 0.9, -0.2, 0.1);
      if (this.weights.fly > 0.5) pole.set(side * 0.8, -0.35, -0.45);
      if (this.weights.climb > 0.5) pole.set(side * 0.9, -0.5, -0.1);
      pole.normalize();
      solveTwoBoneIK(shoulder, target, pole, UPPER_ARM_LEN, FOREARM_LEN, elbow, wrist, 0.02);
      const armDir = _rigV2.subVectors(wrist, shoulder).normalize();
      const hinge = _rigV3.crossVectors(armDir, pole).normalize();
      limbRotation(_rigV2.subVectors(elbow, shoulder), hinge, _rigQ);
      _rigQ4.copy(pose.mRot[armBone]).slerp(_rigQ, ikW);
      pose.setModelRot(armBone, _rigQ4);
      limbRotation(_rigV2.subVectors(wrist, elbow), hinge, _rigQ);
      _rigQ4.copy(pose.mRot[foreBone]);
      _rigQ4.multiplyQuaternions(pose.mRot[armBone], pose.local[foreBone]);
      _rigQ4.slerp(_rigQ, ikW);
      pose.setModelRot(foreBone, _rigQ4);
      if (handRot) {
        _rigQ4
          .multiplyQuaternions(pose.mRot[foreBone], pose.local[handBone])
          .slerp(handRot, Math.max(side === -1 ? gripR : gripL, this.weights.climb));
        pose.setModelRot(handBone, _rigQ4);
      } else pose.fkOne(handBone);
    }
    for (let i = 0; i < 2; i++) this.modelToWorld(pose.mPos[i === 0 ? BONE.handL : BONE.handR], this.handWorld[i]);
    this.brushTipModel.copy(BRUSH_DIMS.tip).applyQuaternion(pose.local[BONE.brush]).add(pose.localPos[BONE.brush]);
  }
  combatBrush(outPos, outRot) {
    const pose = this.hero.pose;
    const frame = this.cmb.frame;
    outPos.copy(frame.g).applyQuaternion(pose.mRot[BONE.chest]).add(pose.mPos[BONE.chest]);
    const cosPitch = Math.cos(frame.bp);
    const dir = _combatBrushDir.set(Math.sin(frame.by) * cosPitch, Math.sin(frame.bp), Math.cos(frame.by) * cosPitch);
    const shoulder = pose.mPos[BONE.armR];
    _rigV.subVectors(outPos, shoulder);
    const dist = _rigV.length();
    if (dist > BRUSH_REACH) outPos.copy(shoulder).addScaledVector(_rigV, BRUSH_REACH / dist);
    if (Math.abs(this.cmb.rootPitch) < 0.2) {
      const len = BRUSH_DIMS.tip.y - BRUSH_DIMS.grip;
      _rigV2.copy(outPos).addScaledVector(dir, len);
      this.modelToWorld(_rigV2, _rigV3);
      this.probe(_rigV3.x, _rigV3.z, this.rootPos.y, this.hit);
      const floorY = this.hit.y - this.rootPos.y + 0.06 - this.cmb.rootLift;
      if (_rigV2.y < floorY) {
        const dy = MathUtils.clamp((floorY - outPos.y) / len, -0.999, 0.999);
        const horiz = Math.hypot(dir.x, dir.z) || 0.0001;
        const flat = Math.sqrt(1 - dy * dy);
        dir.set((dir.x / horiz) * flat, dy, (dir.z / horiz) * flat);
      }
    }
    rotationAlongY(dir, _brushToElbow.copy(shoulder).add(ELBOW_HINT_R).sub(outPos), outRot);
  }
  setBrush(pos, rot) {
    const pose = this.hero.pose;
    pose.local[BONE.brush].copy(rot);
    _rigV2.set(0, BRUSH_DIMS.grip, 0).applyQuaternion(rot);
    pose.localPos[BONE.brush].copy(pos).sub(_rigV2);
    pose.fkOne(BONE.brush);
  }
  brushBack(outPos, outRot) {
    const pose = this.hero.pose;
    const chestPos = pose.mPos[BONE.chest];
    const chestRot = pose.mRot[BONE.chest];
    const swimW = this.weights.swim;
    outRot.copy(chestRot);
    if (swimW > 0.001) outRot.multiply(_rigQ.setFromAxisAngle(_rigV.set(0, 0, 1), 0.45 * swimW));
    outRot.multiply(BACK_BRUSH_ROT);
    outPos
      .copy(BACK_BRUSH_GRIP)
      .sub(REST_POS[BONE.chest])
      .addScaledVector(BACK_BRUSH_DIR, -0.38 * swimW)
      .applyQuaternion(chestRot)
      .add(chestPos);
    return {
      pos: outPos,
      rot: outRot,
    };
  }
  brushHold(outPos, outRot, elapsed) {
    const state = this.s;
    const pose = this.hero.pose;
    const chestPos = pose.mPos[BONE.chest];
    const chestRot = pose.mRot[BONE.chest];
    const sinceFlick = state.lastFlickTime >= 0 ? elapsed - state.lastFlickTime : 1000000000;
    const flick =
      sinceFlick < 0.075
        ? smoothStep(0, 0.075, sinceFlick)
        : sinceFlick < 0.17
          ? 1
          : 1 - smoothStep(0.17, 0.6, sinceFlick);
    const follow = sinceFlick < 0.35 ? Math.sin(Math.PI * clamp01((sinceFlick - 0.04) / 0.3)) : 0;
    const aim = this.aimDirModel(_aimDir);
    const up = _holdUp.set(0, 1, 0).addScaledVector(aim, -aim.y);
    if (up.lengthSq() < 0.0001) up.set(0, 0, -1);
    up.normalize();
    const right = _holdRight.crossVectors(aim, up).normalize();
    let pitch = 2.05 + 0.05 * Math.sin(elapsed * 2.1) + -2.8 * flick - 0.3 * follow;
    const art = this.art;
    const artW = art.w;
    let tiltUp = up;
    let tiltRight = right;
    if (artW > 0.001) {
      pitch += (art.pose.th + art.jitter(elapsed) - pitch) * artW;
      const roll = art.pose.tl * artW;
      if (Math.abs(roll) > 0.0001) {
        tiltUp = _tiltUp.copy(up).multiplyScalar(Math.cos(roll)).addScaledVector(right, Math.sin(roll)).normalize();
        tiltRight = _tiltRight.crossVectors(aim, tiltUp).normalize();
      }
    }
    const cos = Math.cos(pitch);
    const sin = Math.sin(pitch);
    const shaft = _holdShaft
      .copy(aim)
      .multiplyScalar(cos)
      .addScaledVector(tiltUp, sin)
      .addScaledVector(tiltRight, 0.12)
      .normalize();
    const face = _holdFace.copy(aim).multiplyScalar(-sin).addScaledVector(tiltUp, cos);
    const restPos = _holdRestPos.set(-0.2, 0.3, -0.02).applyQuaternion(chestRot).add(chestPos);
    const flickPos = _holdFlickPos
      .set(-0.17, 0.2, 0)
      .applyQuaternion(chestRot)
      .add(chestPos)
      .addScaledVector(aim, 0.38)
      .addScaledVector(up, -0.08);
    const relaxPos = _holdRelaxPos.set(-0.2, 0.08, 0.2).applyQuaternion(chestRot).add(chestPos);
    const relaxShaft = _holdRelaxShaft.set(-0.08, 0.5, -0.86).normalize().applyQuaternion(chestRot);
    const relaxFace = _holdRelaxFace.set(0, 0, -1).applyQuaternion(chestRot);
    const relax = this.relaxW * (1 - flick);
    outPos.copy(restPos).lerp(flickPos, flick).lerp(relaxPos, relax);
    if (artW > 0.001)
      outPos
        .addScaledVector(aim, art.pose.ga * artW)
        .addScaledVector(up, art.pose.gu * artW)
        .addScaledVector(right, art.pose.gr * artW);
    const dir = _holdDir.copy(shaft).lerp(relaxShaft, relax).normalize();
    const fwd = face.lerp(relaxFace, relax);
    if (this.twirlW > 0.001) {
      const fidgetT = this.fidgetT;
      const spin = fidgetT * 10 * smoothStep(0.3, 0.9, fidgetT) * (1 - smoothStep(2.2, 2.6, fidgetT)) + 0.4;
      const twirlPos = _holdRestPos.set(-0.12, -0.02, 0.26).applyQuaternion(chestRot).add(chestPos);
      const twirlDir = _holdRelaxShaft
        .set(Math.sin(spin) * 0.9, Math.cos(spin), 0.25)
        .normalize()
        .applyQuaternion(chestRot);
      outPos.lerp(twirlPos, this.twirlW);
      dir.lerp(twirlDir, this.twirlW).normalize();
      fwd.lerp(relaxFace, this.twirlW);
    }
    rotationAlongY(dir, fwd, outRot);
    return {
      pos: outPos,
      rot: outRot,
    };
  }
  updateHood(dt) {
    const pose = this.hero.pose;
    const hood = this.hood;
    const headRot = pose.mRot[BONE.head];
    const headPos = pose.mPos[BONE.head];
    const rest = HOOD_REST;
    const model = _hoodModel;
    for (let i = 0; i < 4; i++) model[i].copy(rest[i]).sub(REST_POS[BONE.head]).applyQuaternion(headRot).add(headPos);
    if (!hood.init) {
      for (let i = 0; i < 4; i++) {
        this.modelToWorld(model[i], hood.p[i]);
        hood.prev[i].copy(hood.p[i]);
      }
      hood.init = true;
    }
    this.modelToWorld(model[0], hood.p[0]);
    hood.prev[0].copy(hood.p[0]);
    if (hood.p[3].distanceToSquared(hood.p[0]) > 1)
      for (let i = 1; i < 4; i++) {
        this.modelToWorld(model[i], hood.p[i]);
        hood.prev[i].copy(hood.p[i]);
      }
    const keep = 0.9 ** (dt * 60);
    const grav = -9.8 * dt * dt;
    const loose = 1 + this.weights.fly * Math.min(3, this.s.velocity.length() * 0.09);
    const uWindDir = this.ctx.globals.uWindDir.value;
    const uWindStrength = this.ctx.globals.uWindStrength.value;
    for (let i = 1; i < 4; i++) {
      const p = hood.p[i];
      const vx = (p.x - hood.prev[i].x) * keep;
      const vy = (p.y - hood.prev[i].y) * keep;
      const vz = (p.z - hood.prev[i].z) * keep;
      hood.prev[i].copy(p);
      p.x += vx + uWindDir.x * uWindStrength * 0.8 * dt * dt;
      p.y += vy + grav;
      p.z += vz + uWindDir.y * uWindStrength * 0.8 * dt * dt;
      this.modelToWorld(model[i], _rigV);
      p.lerp(_rigV, 1 - Math.exp(-((i === 1 ? 18 : 10) / loose) * dt));
    }
    const segLen = HOOD_SEG_LEN;
    for (let iter = 0; iter < 3; iter++)
      for (let j = 0; j < 3; j++) {
        const p0 = hood.p[j];
        const p1 = hood.p[j + 1];
        _rigV.subVectors(p1, p0);
        const len = _rigV.length() || 0.000001;
        const corr = (len - segLen[j]) / len;
        if (j === 0) p1.addScaledVector(_rigV, -corr);
        else {
          p0.addScaledVector(_rigV, corr * 0.5);
          p1.addScaledVector(_rigV, -corr * 0.5);
        }
      }
    const bones = [BONE.hood1, BONE.hood2, BONE.hood3];
    for (let i = 0; i < 3; i++) {
      const bone = bones[i];
      _rigV.subVectors(rest[i + 1], rest[i]).normalize();
      this.worldToModel(hood.p[i], _rigV2);
      this.worldToModel(hood.p[i + 1], _rigV3);
      _rigV3.sub(_rigV2).normalize();
      _rigV.applyQuaternion(headRot);
      _rigQ.setFromUnitVectors(_rigV, _rigV3);
      _rigQ2.multiplyQuaternions(_rigQ, headRot);
      pose.fkOne(bone);
      pose.setModelRot(bone, _rigQ2);
    }
  }
  updateSatchel(dt) {
    const pose = this.hero.pose;
    this.dirToModel(this.accel, _rigV);
    this.satchel.step(-_rigV.x * 0.012, 0, -_rigV.z * 0.012, dt);
    const pitch = MathUtils.clamp(this.satchel.z, -0.6, 0.6);
    const roll = MathUtils.clamp(-this.satchel.x, -0.5, 0.5);
    _rigQ.setFromEuler(_rigEuler.set(-pitch, 0, roll));
    pose.local[BONE.satchel].copy(_rigQ);
    pose.fkOne(BONE.satchel);
  }
}
const ITEM_JOY_T = 0.46;
const SNAP_CHANNELS = [
  BODY_CH.hipPitch,
  BODY_CH.hipYaw,
  BODY_CH.hipRoll,
  BODY_CH.spPitch,
  BODY_CH.spYaw,
  BODY_CH.spRoll,
  BODY_CH.chPitch,
  BODY_CH.chYaw,
  BODY_CH.chRoll,
  BODY_CH.hipY,
];
const _ikKnee = new Vector3();
const _footPivot = new Vector3();
const _ikAnkle = new Vector3();
const _legHinge = new Vector3();
const _combatBrushPos = new Vector3();
const _combatBrushRot = new Quaternion();
const _combatBrushDir = new Vector3();
const _brushToElbow = new Vector3();
const BRUSH_REACH = 0.43;
const ELBOW_HINT_R = new Vector3(0, -0.14, -0.06);
const ELBOW_HINT_L = new Vector3(0, -0.14, -0.06);
const _fwdUpX = new Vector3();
const _fwdUpY = new Vector3();
const _fwdUpBasis = new Matrix4();
function quatFromForwardUp(fwd, up, out) {
  _fwdUpY.copy(up).addScaledVector(fwd, -up.dot(fwd));
  if (_fwdUpY.lengthSq() < 1e-8) _fwdUpY.set(0, 1, 0);
  _fwdUpY.normalize();
  _fwdUpX.crossVectors(_fwdUpY, fwd).normalize();
  _fwdUpBasis.makeBasis(_fwdUpX, _fwdUpY, fwd);
  return out.setFromRotationMatrix(_fwdUpBasis);
}
const _brushBackPos = new Vector3();
const _brushBackRot = new Quaternion();
const _flyGripPos = new Vector3();
const _flyHandRot = new Quaternion();
const _zAxis = new Vector3(0, 0, 1);
const _brushHoldPos = new Vector3();
const _brushHoldRot = new Quaternion();
const HOOD_REST = [REST_POS[BONE.hood1], REST_POS[BONE.hood2], REST_POS[BONE.hood3], new Vector3(0, 1.385, -0.322)];
const _hoodModel = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const HOOD_SEG_LEN = [
  HOOD_REST[0].distanceTo(HOOD_REST[1]),
  HOOD_REST[1].distanceTo(HOOD_REST[2]),
  HOOD_REST[2].distanceTo(HOOD_REST[3]),
];
const _aimDir = new Vector3();
const _tiltUp = new Vector3();
const _tiltRight = new Vector3();
const _holdUp = new Vector3();
const _holdRight = new Vector3();
const _holdShaft = new Vector3();
const _holdFace = new Vector3();
const _holdRestPos = new Vector3();
const _holdFlickPos = new Vector3();
const _holdRelaxPos = new Vector3();
const _holdRelaxShaft = new Vector3();
const _holdRelaxFace = new Vector3();
const _holdDir = new Vector3();
const GRIP_ROT = new Quaternion()
  .setFromRotationMatrix(new Matrix4().makeBasis(new Vector3(-1, 0, 0), new Vector3(0, 0, 1), new Vector3(0, 1, 0)))
  .clone()
  .invert();
const GRIP_OFFSET = new Vector3(0, -0.048, 0.006);
const BACK_BRUSH_BASE = new Vector3(-0.17, 0.66, -0.19);
const BACK_BRUSH_DIR = new Vector3(0.26, 1.94, -0.21).clone().sub(BACK_BRUSH_BASE).normalize();
const BACK_BRUSH_GRIP = BACK_BRUSH_BASE.clone().addScaledVector(BACK_BRUSH_DIR, BRUSH_DIMS.grip);
const BACK_BRUSH_ROT = new Quaternion();
rotationAlongY(BACK_BRUSH_DIR, new Vector3(0, 0, -1), BACK_BRUSH_ROT);
