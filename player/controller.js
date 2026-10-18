/**
 * Hero movement on a Rapier kinematic character controller: running with skids and sprint, coyote and buffered jumps, air jumps, sliding on ice and blue paint, yellow-paint bounces, gliding on updrafts, climbing green paint, vaulting and mantling ledges, swimming, brushflight with crashes, stamina, slows, and respawning at the last safe spot.
 */
import { Vector2, Vector3 } from 'three';
import { COLLISION_GROUPS, DEFAULT_COLOR } from '../core/config.js';
import { clamp, damp } from '../core/math.js';
import { heroSignals } from '../shared/signals.js';
import { waterDepthAt } from '../shared/skyground.js';
import { makeHit, Probes } from './probes.js';
import { TUNING } from './tuning.js';
const WORLD_UP = new Vector3(0, 1, 0);
const WORLD_DOWN = new Vector3(0, -1, 0);
const TWO_PI = Math.PI * 2;
const HALF_HEIGHT = TUNING.height / 2;
const CLIMB_PROBE_Y = 1;
export function makeIntent() {
  return {
    move: new Vector2(),
    jumpPressed: false,
    jumpHeld: false,
    sprintHeld: false,
    dropPressed: false,
    aimHeld: false,
    paintHeld: false,
    paintPressed: false,
    ridePressed: false,
    sinkHeld: false,
    streamHeld: false,
  };
}
function makeState() {
  return {
    mode: 'ground',
    position: new Vector3(),
    velocity: new Vector3(),
    facing: Math.PI,
    moveIntent: new Vector2(),
    speed: 0,
    sprinting: false,
    grounded: true,
    groundNormal: new Vector3(0, 1, 0),
    surface: 'grass',
    paintUnderfoot: null,
    wallNormal: new Vector3(0, 0, 1),
    climbInput: new Vector2(),
    stamina: 1,
    staminaMax: 1,
    exhausted: false,
    airTime: 0,
    waterDepth: 0,
    aiming: false,
    aimTarget: new Vector3(),
    selectedColor: DEFAULT_COLOR,
    lastJumpTime: -1,
    lastLandTime: -1,
    lastLandImpact: 0,
    lastBounceTime: -1,
    lastFlickTime: -1,
    lastClimbJumpTime: -1,
    health: 5,
    healthMax: 5,
    dead: false,
    invulnerable: false,
    lockTargetId: null,
    attack: null,
    charge: 0,
    lastAttackTime: -1,
    lastHurtTime: -1,
    lastDodgeTime: -1,
    dodgeDir: 'back',
    brush: 'wild',
    itemHold: null,
    artCharge: 0,
    lastArtTime: -1,
    outfit: 'classic',
    slowedUntil: -1,
  };
}
export const yawOf = (x, z) => Math.atan2(x, z);
export function wrapAngle(angle) {
  angle = (angle + Math.PI) % TWO_PI;
  if (angle < 0) angle += TWO_PI;
  return angle - Math.PI;
}
export function approachAngle(from, to, maxStep) {
  const delta = wrapAngle(to - from);
  return wrapAngle(Math.abs(delta) <= maxStep ? to : from + Math.sign(delta) * maxStep);
}
const smooth01 = (t) => t * t * (3 - 2 * t);
export class PlayerController {
  ctx;
  state = makeState();
  body;
  collider;
  kcc;
  probes;
  coll;
  flags;
  cameraYaw = Math.PI;
  faceTarget = null;
  faceRate = 18;
  aiming = false;
  onModeChange = null;
  cmb = {
    lockMove: false,
    speedCap: 0,
    noSprint: false,
    drive: false,
    driveX: 0,
    driveZ: 0,
    noJump: false,
  };
  climbAnywhere = false;
  debugPaint = null;
  logEnabled = false;
  cameraPitch = 0.3;
  rideUnlocked = false;
  onFlyCrash = null;
  boostDrainMul = 1;
  glideSinkMul = 1;
  airJumpMax = 0;
  airJumpsLeft = 0;
  airJumpCount = 0;
  lastAirJumpTime = -1;
  interiorRef = null;
  fly = {
    yaw: 0,
    pitch: 0,
    fwd: 0,
    lat: new Vector3(),
    knock: new Vector3(),
    t: 0,
    hop: 0,
    hopV: 0,
    stagger: 0,
    bank: 0,
    turn: 0,
    boosting: false,
    hitInto: 0,
    hitN: new Vector3(),
    hitP: new Vector3(),
    hit: false,
  };
  flyH = new Vector3();
  flyR = new Vector3();
  flyV0 = new Vector3();
  feet = new Vector3();
  vel;
  wish = new Vector3();
  wishMag = 0;
  mode = 'ground';
  coyote = 0;
  jumpBuf = 0;
  playerJump = false;
  ungroundedT = 0;
  groundedT = 0;
  regenDelayT = 0;
  regrab = 0;
  bounceChain = 0;
  strokeCd = 0;
  strokeT = 0;
  climbDash = 0;
  climbDashDir = new Vector2();
  climbLostPaintT = 0;
  wallN = new Vector3(0, 0, 1);
  heightAboveGround = 0;
  groundHandle = -1;
  groundKind = '';
  onIce = false;
  waterDepth = 0;
  respawning = false;
  pendingTeleport = false;
  safeT = 0;
  lastSafe = new Vector3();
  hasSafe = false;
  lastSafeFacing = {
    v: Math.PI,
  };
  controlDisabled = false;
  mantle = {
    active: false,
    t: 0,
    dur: 0.5,
    from: new Vector3(),
    to: new Vector3(),
    inward: new Vector3(),
  };
  desired = {
    x: 0,
    y: 0,
    z: 0,
  };
  hitA = makeHit();
  hitB = makeHit();
  hitC = makeHit();
  t1 = new Vector3();
  t2 = new Vector3();
  t3 = new Vector3();
  upW = new Vector3();
  rightW = new Vector3();
  nextCenter = {
    x: 0,
    y: 0,
    z: 0,
  };
  movedOut = {
    x: 0,
    y: 0,
    z: 0,
  };
  constructor(ctx) {
    this.ctx = ctx;
    const RAPIER = ctx.RAPIER;
    this.vel = this.state.velocity;
    this.flags = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
    const spawn = this.spawnPoint(this.t1);
    this.feet.copy(spawn);
    this.state.position.copy(spawn);
    this.lastSafe.copy(spawn);
    this.body = ctx.physics.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        spawn.x,
        spawn.y + HALF_HEIGHT + TUNING.skin,
        spawn.z,
      ),
    );
    this.collider = ctx.physics.createCollider(
      RAPIER.ColliderDesc.capsule(HALF_HEIGHT - TUNING.radius, TUNING.radius)
        .setCollisionGroups(COLLISION_GROUPS.player)
        .setFriction(0),
      this.body,
    );
    ctx.colliders.register(this.collider, {
      kind: 'player',
    });
    const characterController = ctx.physics.createCharacterController(TUNING.skin);
    characterController.setUp({
      x: 0,
      y: 1,
      z: 0,
    });
    characterController.setSlideEnabled(true);
    characterController.enableAutostep(TUNING.autostep, 0.12, false);
    characterController.setMaxSlopeClimbAngle((TUNING.maxSlopeDeg * Math.PI) / 180);
    characterController.setMinSlopeSlideAngle((TUNING.slideSlopeDeg * Math.PI) / 180);
    characterController.enableSnapToGround(TUNING.snap);
    try {
      characterController.setApplyImpulsesToDynamicBodies(true);
      characterController.setCharacterMass(70);
    } catch {}
    this.kcc = characterController;
    this.coll = new RAPIER.CharacterCollision();
    this.probes = new Probes(ctx);
    this.probes.exclude = this.collider;
    this.state.facing = this.lastSafeFacing.v = this.initialFacing();
    this.pendingTeleport = true;
  }
  get currentMode() {
    return this.mode;
  }
  setControlDisabled(controlDisabled) {
    this.controlDisabled = controlDisabled;
  }
  teleport(position, facing) {
    this.feet.copy(position);
    this.state.position.copy(position);
    this.vel.set(0, 0, 0);
    const center = {
      x: position.x,
      y: position.y + HALF_HEIGHT + TUNING.skin,
      z: position.z,
    };
    this.body.setTranslation(center, true);
    this.body.setNextKinematicTranslation(center);
    if (facing !== undefined && Number.isFinite(facing)) this.state.facing = wrapAngle(facing);
    this.mantle.active = false;
    this.climbDash = 0;
    this.pendingTeleport = true;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.bounceChain = 0;
    this.airJumpsLeft = this.airJumpMax;
    this.airJumpCount = 0;
    this.interiorRef = null;
    this.setMode('air');
  }
  get safePosition() {
    return this.lastSafe;
  }
  get airJumps() {
    return this.airJumpMax;
  }
  set airJumps(value) {
    const count = Math.max(0, Math.floor(Number(value) || 0));
    this.airJumpsLeft = count > this.airJumpMax ? count : Math.min(this.airJumpsLeft, count);
    this.airJumpMax = count;
  }
  get lastInterior() {
    let interior = null;
    try {
      interior = this.ctx.interiors?.current ?? null;
    } catch {
      interior = null;
    }
    return interior ?? this.interiorRef;
  }
  get clearance() {
    return this.heightAboveGround;
  }
  launch(vx, vy, vz) {
    if (!(this.mode === 'climb' || this.mode === 'swim' || this.mantle.active)) {
      this.vel.set(vx, vy, vz);
      this.coyote = 0;
      this.jumpBuf = 0;
      this.playerJump = false;
      this.bounceChain = 0;
      this.ungroundedT = 0;
      this.setMode('air');
    }
  }
  get flyBank() {
    return this.mode === 'fly' ? this.fly.bank : 0;
  }
  get flyTurn() {
    return this.mode === 'fly' ? this.fly.turn : 0;
  }
  get flyTime() {
    return this.mode === 'fly' ? this.fly.t : 0;
  }
  mountFly() {
    const mode = this.mode;
    const state = this.state;
    if (mode === 'fly' || this.mantle.active || this.respawning || state.dead) return false;
    const vel = this.vel;
    const fly = this.fly;
    const hop = mode === 'ground' || mode === 'slide' || mode === 'swim';
    fly.yaw =
      Math.hypot(vel.x, vel.z) > 2
        ? yawOf(vel.x, vel.z)
        : mode === 'climb'
          ? yawOf(state.wallNormal.x, state.wallNormal.z)
          : state.facing;
    fly.pitch = 0;
    fly.t = 0;
    fly.stagger = 0;
    fly.bank = 0;
    fly.turn = 0;
    fly.knock.set(0, 0, 0);
    fly.hop = hop ? TUNING.flyMountTime : 0;
    fly.hopV = mode === 'swim' ? 9.5 : 7;
    const heading = this.flyH.set(Math.sin(fly.yaw), 0, Math.cos(fly.yaw));
    fly.fwd = vel.x * heading.x + vel.z * heading.z;
    fly.lat.set(vel.x - heading.x * fly.fwd, 0, vel.z - heading.z * fly.fwd);
    if (mode === 'climb') {
      fly.fwd = 1.5;
      fly.lat.set(0, 0, 0);
    }
    if (!hop) fly.lat.y = Math.max(-5, Math.min(vel.y * 0.28, 3));
    state.facing = fly.yaw;
    this.climbDash = 0;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.bounceChain = 0;
    this.playerJump = false;
    this.setMode('fly');
    this.log(`mount (${hop ? 'hop' : 'catch'}) from ${mode}`);
    return true;
  }
  dismountFly(into = 'air', lift = 2.2) {
    if (this.mode !== 'fly') return;
    const vel = this.vel;
    const state = this.state;
    this.fly.boosting = false;
    state.sprinting = false;
    this.playerJump = false;
    this.coyote = 0;
    this.jumpBuf = 0;
    if (into === 'air') {
      vel.y = Math.max(vel.y, 0) * 0.6 + Math.min(vel.y, 0) + lift;
      this.setMode('air');
    } else if (into === 'swim') {
      vel.multiplyScalar(0.4);
      this.setMode('swim');
    } else {
      vel.y = 0;
      vel.x *= 0.55;
      vel.z *= 0.55;
      this.setMode(this.isSlippery() ? 'slide' : 'ground');
    }
    if (Math.hypot(vel.x, vel.z) > 1) state.facing = approachAngle(state.facing, yawOf(vel.x, vel.z), 0.4);
    this.log(`dismount -> ${into}`);
  }
  flyKnock(x, y, z) {
    if (this.mode === 'fly') {
      this.fly.knock.x += x;
      this.fly.knock.y += y;
      this.fly.knock.z += z;
    }
  }
  update(dt, intent) {
    if (dt <= 0) return;
    const state = this.state;
    const bodyPos = this.body.translation();
    this.feet.set(bodyPos.x, bodyPos.y - HALF_HEIGHT - TUNING.skin, bodyPos.z);
    if (this.pendingTeleport) {
      this.pendingTeleport = false;
      this.fillState(dt);
      return;
    }
    if (this.respawning || this.controlDisabled) {
      intent.move.set(0, 0);
      intent.jumpPressed = intent.jumpHeld = intent.sprintHeld = intent.dropPressed = false;
      intent.ridePressed = intent.sinkHeld = intent.streamHeld = false;
    }
    const cmb = this.cmb;
    if (cmb.lockMove) {
      intent.move.set(0, 0);
      intent.sprintHeld = false;
    }
    if (cmb.noJump) {
      intent.jumpPressed = false;
      this.jumpBuf = 0;
    }
    if (cmb.noSprint) intent.sprintHeld = false;
    this.computeWish(intent);
    this.coyote = Math.max(0, this.coyote - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.regrab = Math.max(0, this.regrab - dt);
    this.strokeCd = Math.max(0, this.strokeCd - dt);
    this.strokeT = Math.max(0, this.strokeT - dt);
    if (intent.jumpPressed) this.jumpBuf = TUNING.jumpBuffer;
    this.waterDepth = this.safeDepth(this.feet.x, this.feet.z);
    this.updateSlow();
    let drain = 0;
    intent.ridePressed &&=
      (this.mode === 'fly'
        ? this.fly.t > 0.25 &&
          this.dismountFly(this.heightAboveGround < 0.35 && this.state.groundNormal.y > 0.7 ? 'ground' : 'air')
        : this.rideUnlocked && !this.cmb.lockMove && this.mountFly(),
      false);
    if (this.mantle.active) this.stepMantle(dt);
    else
      switch (this.mode) {
        case 'ground':
        case 'slide':
        case 'air':
          drain = this.stepLocomotion(dt, intent);
          break;
        case 'glide':
          drain = this.stepGlide(dt, intent);
          break;
        case 'climb':
          drain = this.stepClimb(dt, intent);
          break;
        case 'swim':
          drain = this.stepSwim(dt, intent);
          break;
        case 'fly':
          drain = this.stepFly(dt, intent);
      }
    if (this.controlDisabled) drain = 0;
    this.updateStamina(dt, drain);
    this.updateSafeSpot(dt);
    if (this.feet.y < -20 && !this.respawning) this.respawn('fell');
    this.checkInteriorFall();
    if (this.mode === 'air' || this.mode === 'glide') state.airTime += dt;
    else state.airTime = 0;
    this.fillState(dt);
  }
  lateUpdate() {
    const bodyPos = this.body.translation();
    this.state.position.set(bodyPos.x, bodyPos.y - HALF_HEIGHT - TUNING.skin, bodyPos.z);
    this.feet.copy(this.state.position);
  }
  stepLocomotion(dt, intent) {
    const state = this.state;
    const vel = this.vel;
    const onGround = this.mode !== 'air';
    const elapsed = this.ctx.time.elapsed;
    let drain = 0;
    if (this.jumpBuf > 0 && (onGround || this.coyote > 0)) {
      const superJump = onGround && state.paintUnderfoot === 'yellow';
      let jumpV = superJump ? TUNING.superJump : Math.sqrt(2 * TUNING.gravity * TUNING.jumpHeight);
      if (this.slowK < 1) {
        jumpV *= 0.62;
        state.slowedUntil = Math.max(elapsed, state.slowedUntil - 0.3);
      }
      vel.y = jumpV;
      this.jumpBuf = 0;
      this.coyote = 0;
      this.playerJump = !superJump;
      this.bounceChain = 0;
      this.setMode('air');
      state.lastJumpTime = elapsed;
      this.ctx.events.emit('player:jump', {
        position: this.feet.clone(),
      });
      if (superJump) {
        state.lastBounceTime = elapsed;
        this.ctx.events.emit('player:bounce', {
          position: this.feet.clone(),
          strength: jumpV,
        });
      }
      this.log(`jump vy=${jumpV.toFixed(1)}${superJump ? ' (super)' : ''}`);
    } else if (intent.jumpPressed && this.mode === 'air' && this.canAirJump()) this.airJump(intent);
    else if (
      intent.jumpPressed &&
      this.mode === 'air' &&
      state.airTime > TUNING.glideMinAir &&
      elapsed - this.lastAirJumpTime > 0.16 &&
      this.canGlide()
    ) {
      this.jumpBuf = 0;
      intent.jumpPressed = false;
      this.setMode('glide');
      this.log(`glide open, height ${this.heightAboveGround.toFixed(1)}`);
      return this.stepGlide(dt, intent);
    }
    if (!this.cmb.noJump) {
      if (this.mode === 'air' && this.wishMag > 0.3) {
        if (this.tryGrabWall(this.wish.x, this.wish.z) || (vel.y < 4 && this.tryVault(1.15))) return 0;
      } else if (
        this.mode === 'ground' &&
        this.wishMag > 0.5 &&
        !this.aiming &&
        this.tryGrabWall(this.wish.x, this.wish.z)
      )
        return 0;
    }
    if (this.mode === 'ground') drain = this.groundHorizontal(dt, intent);
    else if (this.mode === 'slide') this.slideHorizontal(dt);
    else this.airHorizontal(dt);
    const airborne = this.mode === 'air';
    if (!airborne) vel.y = Math.min(vel.y, 0) - TUNING.gravity * dt;
    else {
      let gravity = TUNING.gravity;
      if (vel.y > 0) {
        if (this.playerJump && !intent.jumpHeld) gravity *= TUNING.jumpCutGravity;
        else if (intent.jumpHeld && vel.y < TUNING.apexWindow) gravity *= TUNING.apexGravity;
      } else gravity *= vel.y > -TUNING.apexWindow && intent.jumpHeld ? TUNING.apexGravity : TUNING.fallGravity;
      vel.y = Math.max(vel.y - gravity * dt, -TUNING.terminal);
    }
    const preVy = vel.y;
    let dy = vel.y * dt;
    if (!airborne) {
      const groundNormal = state.groundNormal;
      if (groundNormal.y > 0.66)
        dy += clamp(-(groundNormal.x * vel.x + groundNormal.z * vel.z) / groundNormal.y, -40, 40) * dt;
    }
    const grounded = this.move(vel.x * dt, dy, vel.z * dt, !airborne && vel.y <= 0, dt);
    this.probeGround(40);
    if (airborne) {
      if (grounded && vel.y <= 0.01) this.land(this.impactAlongNormal(preVy), intent);
      else if (this.enterWaterIfDeep()) return 0;
    } else {
      if (grounded) {
        this.ungroundedT = 0;
        vel.y = 0;
        this.setMode(this.isSlippery() ? 'slide' : 'ground');
      } else {
        this.ungroundedT += dt;
        const nearGround = this.heightAboveGround < 0.45;
        if (this.ungroundedT > 0.07 || !nearGround || vel.y > 0) {
          this.setMode('air');
          this.coyote = TUNING.coyote;
          this.playerJump = false;
          vel.y = Math.min(vel.y, 0);
        }
      }
      if (this.enterWaterIfDeep()) return 0;
    }
    if (this.mode === 'ground' || this.mode === 'slide') this.groundedT += dt;
    else this.groundedT = 0;
    return drain;
  }
  groundHorizontal(dt, intent) {
    const state = this.state;
    const vel = this.vel;
    const sprinting =
      intent.sprintHeld &&
      this.wishMag > 0.3 &&
      !state.exhausted &&
      state.stamina > 0 &&
      !this.aiming &&
      this.slowK >= 1;
    state.sprinting = sprinting;
    let topSpeed = state.exhausted ? TUNING.exhaustedSpeed : sprinting ? TUNING.sprintSpeed : TUNING.runSpeed;
    if (this.aiming) topSpeed = TUNING.aimSpeed;
    if (this.cmb.speedCap > 0) topSpeed = Math.min(topSpeed, this.cmb.speedCap);
    topSpeed *= this.slowK;
    if (this.cmb.drive) {
      vel.x = this.cmb.driveX;
      vel.z = this.cmb.driveZ;
      this.applyFaceOverride(dt);
      return 0;
    }
    const wishMag = this.wishMag;
    const walkSpeed = Math.min(TUNING.walkSpeed, topSpeed);
    let targetSpeed =
      wishMag < 0.55 ? (wishMag / 0.55) * walkSpeed : walkSpeed + (topSpeed - walkSpeed) * ((wishMag - 0.55) / 0.45);
    if (wishMag > 0.98) targetSpeed = topSpeed;
    if (this.waterDepth > 0.35 && this.feet.y < this.level() - 0.2) targetSpeed *= TUNING.wadeFactor;
    const groundNormal = state.groundNormal;
    if (groundNormal.y > 0.5 && wishMag > 0.02) {
      const slope = -(groundNormal.x * this.wish.x + groundNormal.z * this.wish.z) / groundNormal.y;
      targetSpeed *= slope > 0 ? clamp(1 - slope * 0.32, 0.72, 1) : 1 + clamp(-slope * 0.12, 0, 0.1);
    }
    const speed = Math.hypot(vel.x, vel.z);
    if (wishMag > 0.02) {
      const wishYaw = yawOf(this.wish.x, this.wish.z);
      if (speed > 0.5) {
        const velYaw = yawOf(vel.x, vel.z);
        if (Math.abs(wrapAngle(wishYaw - velYaw)) < TUNING.skidAngle) {
          const yaw = approachAngle(velYaw, wishYaw, 11 * dt);
          const accel =
            speed > targetSpeed + 0.3
              ? TUNING.overspeedDecel
              : speed < TUNING.runSpeed
                ? TUNING.accel
                : TUNING.sprintAccel;
          const newSpeed = speed + clamp(targetSpeed - speed, -accel * dt, accel * dt);
          vel.x = Math.sin(yaw) * newSpeed;
          vel.z = Math.cos(yaw) * newSpeed;
        } else this.approachH(this.wish.x * targetSpeed, this.wish.z * targetSpeed, TUNING.decel * 1.4 * dt);
      } else this.approachH(this.wish.x * targetSpeed, this.wish.z * targetSpeed, TUNING.accel * dt);
      if (this.faceTarget === null) {
        const turnRate = speed > 7 ? TUNING.turnRateFast : TUNING.turnRateSlow;
        state.facing = approachAngle(state.facing, wishYaw, turnRate * dt);
      }
    } else this.approachH(0, 0, (speed > TUNING.runSpeed + 0.5 ? TUNING.overspeedDecel : TUNING.decel) * dt);
    this.applyFaceOverride(dt);
    return sprinting ? TUNING.sprintDrain : 0;
  }
  slideHorizontal(dt) {
    const state = this.state;
    const vel = this.vel;
    const groundNormal = state.groundNormal;
    state.sprinting = false;
    vel.x += TUNING.slideGravity * groundNormal.y * groundNormal.x * dt;
    vel.z += TUNING.slideGravity * groundNormal.y * groundNormal.z * dt;
    let speed = Math.hypot(vel.x, vel.z);
    const wishMag = this.wishMag;
    if (wishMag > 0.05) {
      const wishYaw = yawOf(this.wish.x, this.wish.z);
      if (speed < 2.5) {
        vel.x += this.wish.x * TUNING.slidePush * wishMag * dt;
        vel.z += this.wish.z * TUNING.slidePush * wishMag * dt;
      } else {
        const velYaw = yawOf(vel.x, vel.z);
        const dYaw = wrapAngle(wishYaw - velYaw);
        if (Math.abs(dYaw) > 2.3) {
          const braked = Math.max(0, speed - TUNING.slideBrake * wishMag * dt);
          vel.x *= braked / speed;
          vel.z *= braked / speed;
        } else {
          const carve = clamp(dYaw, -TUNING.slideCarve * wishMag * dt, TUNING.slideCarve * wishMag * dt);
          const yaw = velYaw + carve;
          const newSpeed = speed * (1 - Math.abs(carve) * 0.04);
          vel.x = Math.sin(yaw) * newSpeed;
          vel.z = Math.cos(yaw) * newSpeed;
        }
      }
    }
    speed = Math.hypot(vel.x, vel.z);
    if (speed > 0.0001) {
      const loss = (TUNING.slideFriction + TUNING.slideDrag * speed * speed) * dt;
      let newSpeed = Math.max(0, speed - loss);
      newSpeed = Math.min(newSpeed, TUNING.slideMax);
      vel.x *= newSpeed / speed;
      vel.z *= newSpeed / speed;
    }
    if (this.faceTarget === null)
      if (speed > 1) state.facing = approachAngle(state.facing, yawOf(vel.x, vel.z), 8 * dt);
      else if (wishMag > 0.05) state.facing = approachAngle(state.facing, yawOf(this.wish.x, this.wish.z), 8 * dt);
    this.applyFaceOverride(dt);
  }
  airHorizontal(dt) {
    const state = this.state;
    const vel = this.vel;
    state.sprinting = false;
    if (this.cmb.drive) {
      vel.x = this.cmb.driveX;
      vel.z = this.cmb.driveZ;
      this.applyFaceOverride(dt);
      return;
    }
    const speed = Math.hypot(vel.x, vel.z);
    const wishMag = this.wishMag;
    if (wishMag > 0.05) {
      const maxSpeed = Math.max((this.aiming ? TUNING.aimSpeed : TUNING.runSpeed) * this.slowK, speed);
      this.approachH(this.wish.x * maxSpeed * wishMag, this.wish.z * maxSpeed * wishMag, TUNING.airAccel * dt);
      const newSpeed = Math.hypot(vel.x, vel.z);
      if (newSpeed > maxSpeed && newSpeed > 0.0001) {
        vel.x *= maxSpeed / newSpeed;
        vel.z *= maxSpeed / newSpeed;
      }
      if (this.faceTarget === null)
        state.facing = approachAngle(state.facing, yawOf(this.wish.x, this.wish.z), TUNING.airTurnRate * dt);
    } else this.approachH(0, 0, (speed > TUNING.runSpeed ? 2 : TUNING.airDecel) * dt);
    this.applyFaceOverride(dt);
  }
  stepGlide(dt, intent) {
    const state = this.state;
    const vel = this.vel;
    state.sprinting = false;
    if (intent.jumpPressed || intent.dropPressed || state.exhausted || state.stamina <= 0) {
      this.jumpBuf = 0;
      this.setMode('air');
      this.playerJump = false;
      intent.jumpPressed = false;
      return this.stepLocomotion(dt, intent);
    }
    const wishMag = this.wishMag;
    if (wishMag > 0.1)
      state.facing = approachAngle(
        state.facing,
        yawOf(this.wish.x, this.wish.z),
        TUNING.glideTurnRate * (0.5 + 0.5 * wishMag) * dt,
      );
    this.applyFaceOverride(dt);
    const fx = Math.sin(state.facing);
    const fz = Math.cos(state.facing);
    const speed = wishMag > 0.1 ? TUNING.glideSpeed * (0.65 + 0.35 * wishMag) : TUNING.glideIdleSpeed;
    this.approachH(fx * speed, fz * speed, TUNING.glideAccel * dt);
    let lift = 0;
    try {
      this.t1.set(this.feet.x, this.feet.y + 1, this.feet.z);
      lift = (this.ctx.elements.updraftAt(this.t1) || 0) * TUNING.glideLiftMul;
    } catch {
      lift = 0;
    }
    vel.y += (-TUNING.glideSink * this.glideSinkMul - vel.y) * damp(TUNING.glideCatch, dt) + lift * dt;
    vel.y = Math.min(vel.y, TUNING.glideMaxRise);
    const grounded = this.move(vel.x * dt, vel.y * dt, vel.z * dt, false, dt);
    this.probeGround(40);
    if (grounded && vel.y <= 0.01) {
      this.land(this.impactAlongNormal(vel.y), intent);
      return 0;
    } else {
      if (this.enterWaterIfDeep()) {
        return 0;
      } else {
        this.tryGrabWall(fx, fz);
        return TUNING.glideDrain;
      }
    }
  }
  stepSwim(dt, intent) {
    const state = this.state;
    const vel = this.vel;
    const waterY = this.level();
    if (state.exhausted && !this.respawning) this.respawn('drown');
    if (
      this.wishMag > 0.3 &&
      !this.respawning &&
      (this.tryGrabWall(this.wish.x, this.wish.z) || this.tryVault(TUNING.swimFeetBelow + 1.55))
    )
      return 0;
    const wishMag = this.wishMag;
    const targetSpeed =
      (this.aiming ? TUNING.swimSpeed * 0.6 : TUNING.swimSpeed) * wishMag * (this.slowK < 1 ? 0.6 : 1);
    const speed = Math.hypot(vel.x, vel.z);
    let drain = 0;
    state.sprinting = false;
    if (intent.sprintHeld && wishMag > 0.2 && !state.exhausted && state.stamina > 0 && !this.aiming) {
      state.sprinting = true;
      if (this.strokeCd <= 0) {
        this.strokeCd = TUNING.swimStrokeEvery;
        this.strokeT = 0.35;
        state.stamina = Math.max(0, state.stamina - TUNING.swimStrokeCost);
        this.regenDelayT = TUNING.regenDelay;
        const fx = Math.sin(state.facing);
        const fz = Math.cos(state.facing);
        vel.x += fx * TUNING.swimStroke;
        vel.z += fz * TUNING.swimStroke;
        const speed = Math.hypot(vel.x, vel.z);
        if (speed > 6.2) {
          vel.x *= 6.2 / speed;
          vel.z *= 6.2 / speed;
        }
      }
      drain = 0.0001;
    }
    const accel = speed > targetSpeed ? TUNING.swimAccel * (this.strokeT > 0 ? 0.35 : 0.9) : TUNING.swimAccel;
    this.approachH(this.wish.x * targetSpeed, this.wish.z * targetSpeed, accel * dt);
    if (wishMag > 0.05 && this.faceTarget === null)
      state.facing = approachAngle(state.facing, yawOf(this.wish.x, this.wish.z), 6 * dt);
    this.applyFaceOverride(dt);
    const bob = Math.sin(this.ctx.time.elapsed * 2.2) * 0.035;
    const floatY = waterY - TUNING.swimFeetBelow + bob;
    const targetVy = clamp((floatY - this.feet.y) * 5, -6, 4);
    vel.y += (targetVy - vel.y) * damp(6, dt);
    let dy = vel.y * dt;
    const groundNormal = state.groundNormal;
    if (this.heightAboveGround < 0.3 && groundNormal.y > 0.66)
      dy += Math.max(0, -(groundNormal.x * vel.x + groundNormal.z * vel.z) / groundNormal.y) * dt;
    const grounded = this.move(vel.x * dt, dy, vel.z * dt, false, dt);
    this.probeGround(4);
    const depthAhead = this.safeDepth(this.feet.x + vel.x * dt, this.feet.z + vel.z * dt);
    if ((grounded && depthAhead < TUNING.swimExitDepth) || depthAhead < 0.75) {
      this.setMode(grounded ? (this.isSlippery() ? 'slide' : 'ground') : 'air');
      if (grounded) vel.y = 0;
    }
    return drain;
  }
  stepFly(dt, intent) {
    const state = this.state;
    const vel = this.vel;
    const fly = this.fly;
    const elapsed = this.ctx.time.elapsed;
    fly.t += dt;
    if (state.dead) {
      this.dismountFly('air', 0);
      return this.stepLocomotion(dt, intent);
    }
    fly.stagger = Math.max(0, fly.stagger - dt);
    const staggered = fly.stagger > 0;
    const move = intent.move;
    const throttle = staggered ? Math.min(0, move.y) : move.y;
    const strafe = move.x * (staggered ? 0.3 : 1);
    const rise = +!!intent.jumpHeld - !!intent.sinkHeld;
    const hasStamina = !state.exhausted && state.stamina > 0.01;
    const boosting = intent.sprintHeld && throttle > 0.3 && hasStamina && !staggered && fly.hop <= 0 && fly.t > 0.2;
    fly.boosting = boosting;
    const speed = vel.length();
    const hasInput = move.lengthSq() > 0.01 || rise !== 0;
    let turnRate =
      TUNING.flyTurnSlow + (TUNING.flyTurnFast - TUNING.flyTurnSlow) * clamp(speed / TUNING.flyBoost, 0, 1);
    if (!hasInput && speed < 2.5) turnRate = TUNING.flyTurnIdle;
    if (staggered) turnRate *= 0.35;
    const prevYaw = fly.yaw;
    fly.yaw = wrapAngle(fly.yaw + wrapAngle(this.cameraYaw - fly.yaw) * damp(turnRate, dt));
    const pitchIn = -(this.cameraPitch - TUNING.flyPitchBias);
    const pitchGoal = clamp(
      Math.sign(pitchIn) * Math.max(0, Math.abs(pitchIn) - 0.05) * TUNING.flyPitchGain,
      -TUNING.flyPitchMax,
      TUNING.flyPitchMax,
    );
    const targetPitch = throttle > 0.05 && !intent.streamHeld && !this.aiming ? pitchGoal : 0;
    fly.pitch += (targetPitch - fly.pitch) * damp(turnRate * 0.9, dt);
    const cosPitch = Math.cos(fly.pitch);
    const heading = this.flyH.set(Math.sin(fly.yaw) * cosPitch, Math.sin(fly.pitch), Math.cos(fly.yaw) * cosPitch);
    const right = this.flyR.set(-Math.cos(fly.yaw), 0, Math.sin(fly.yaw));
    let targetFwd = 0;
    if (throttle > 0.05)
      targetFwd =
        (boosting ? TUNING.flyBoost : TUNING.flyCruise) *
        (throttle > 0.98 ? 1 : 0.3 + 0.7 * throttle) *
        (1 - TUNING.flyDiveGain * Math.sin(fly.pitch));
    else if (throttle < -0.05) targetFwd = fly.fwd > 0.5 ? 0 : -TUNING.flyBack * -throttle;
    let accel;
    accel =
      targetFwd > fly.fwd && targetFwd > 0
        ? boosting
          ? TUNING.flyBoostAccel
          : TUNING.flyAccel
        : targetFwd < fly.fwd && targetFwd < 0 && fly.fwd <= 0.5
          ? TUNING.flyAccel * 0.4
          : throttle < -0.05
            ? TUNING.flyBrake
            : TUNING.flyCoast;
    fly.fwd += clamp(
      (targetFwd - fly.fwd) * damp(throttle < -0.05 ? TUNING.flyEase * 2.2 : TUNING.flyEase, dt),
      -accel * dt,
      accel * dt,
    );
    const targetLat = this.t1.copy(right).multiplyScalar(strafe * TUNING.flyStrafe);
    targetLat.y += rise > 0 ? TUNING.flyRise * rise : TUNING.flySink * rise;
    targetLat.addScaledVector(heading, -targetLat.dot(heading));
    const lat = fly.lat;
    const dx = targetLat.x - lat.x;
    const dy = targetLat.y - lat.y;
    const dz = targetLat.z - lat.z;
    const ease = damp(TUNING.flyLatEase, dt);
    let stepX = dx * ease;
    let stepY = dy * ease;
    let stepZ = dz * ease;
    const stepLen = Math.hypot(stepX, stepY, stepZ);
    const maxStep = TUNING.flyLatAccel * dt;
    if (stepLen > maxStep) {
      stepX *= maxStep / stepLen;
      stepY *= maxStep / stepLen;
      stepZ *= maxStep / stepLen;
    }
    lat.x += stepX;
    lat.y += stepY;
    lat.z += stepZ;
    lat.addScaledVector(heading, -lat.dot(heading));
    fly.knock.multiplyScalar(Math.exp(-2.8 * dt));
    vel.copy(heading).multiplyScalar(fly.fwd).add(lat).add(fly.knock);
    if (fly.hop > 0 && fly.t < fly.hop) {
      const hopK = fly.t / fly.hop;
      vel.y = Math.max(vel.y, fly.hopV * (1 - hopK) * (1 - hopK) + 0.8);
    } else if (fly.hop > 0) {
      lat.y = Math.max(lat.y, 0.8);
      fly.hop = 0;
    }
    const softCeiling = TUNING.flyCeiling - 12;
    if (this.feet.y > softCeiling) {
      const over = clamp((this.feet.y - softCeiling) / 12, 0, 2);
      const maxVy = over < 1 ? 16 * (1 - over) * (1 - over) : -6 * (over - 1);
      if (vel.y > maxVy) vel.y = maxVy;
    }
    const preVel = this.flyV0.copy(vel);
    fly.hit = false;
    fly.hitInto = 0;
    const grounded = this.move(vel.x * dt, vel.y * dt, vel.z * dt, false, dt);
    this.probeGround(60);
    if (fly.hit) {
      const preSpeed = preVel.length();
      if (
        fly.hitInto > TUNING.flyCrashSpeed &&
        preSpeed > 0.001 &&
        fly.hitInto / preSpeed > 0.6 &&
        fly.t > 0.3 &&
        !staggered
      )
        this.flyCrash(preVel);
      else {
        fly.knock.set(0, 0, 0);
        fly.fwd = vel.dot(heading);
        lat.copy(vel).addScaledVector(heading, -fly.fwd);
      }
    }
    const yawRate = wrapAngle(fly.yaw - prevYaw) / dt;
    const hSpeed = Math.hypot(vel.x, vel.z);
    const targetBank = clamp(
      -yawRate * Math.min(hSpeed, 30) * 0.045 + strafe * 0.3 * clamp(hSpeed / 6, 0.3, 1),
      -0.85,
      0.85,
    );
    fly.bank += (targetBank - fly.bank) * damp(5, dt);
    fly.turn = staggered || this.aiming ? 0 : -move.x * TUNING.flyBankTurn * clamp(fly.fwd / TUNING.flyCruise, 0, 1.2);
    state.facing = fly.yaw;
    state.sprinting = boosting;
    if (
      (grounded || this.heightAboveGround < 0.06) &&
      fly.t > 0.5 &&
      fly.hop <= 0 &&
      hSpeed < TUNING.flyLandSpeed &&
      !intent.jumpHeld &&
      (intent.sinkHeld || preVel.y < -0.6) &&
      state.groundNormal.y > 0.7 &&
      this.waterDepth < 0.3
    ) {
      const impact = Math.max(1.2, -preVel.y);
      this.dismountFly('ground');
      state.lastLandTime = elapsed;
      state.lastLandImpact = impact;
      this.ctx.events.emit('player:land', {
        position: this.feet.clone(),
        impact,
        surface: state.surface,
      });
      return 0;
    }
    if (this.waterDepth > TUNING.swimEnterDepth && this.feet.y < this.level() - 0.35 && !this.onIce) {
      this.dismountFly('swim');
      return 0;
    } else {
      return boosting ? TUNING.flyBoostDrain * this.boostDrainMul : 0;
    }
  }
  flyCrash(impactVel) {
    const fly = this.fly;
    const hitN = fly.hitN;
    const hitInto = fly.hitInto;
    const flyH = this.flyH;
    fly.knock.copy(hitN).multiplyScalar(Math.min(13, 3.5 + hitInto * 0.38));
    fly.knock.y += 2;
    this.t2.copy(impactVel).addScaledVector(hitN, -impactVel.dot(hitN)).multiplyScalar(0.25);
    fly.fwd = this.t2.dot(flyH);
    fly.lat.copy(this.t2).addScaledVector(flyH, -fly.fwd);
    fly.stagger = TUNING.flyStagger;
    this.vel.copy(fly.knock).addScaledVector(flyH, fly.fwd).add(fly.lat);
    try {
      this.ctx.events.emit('camera:shake', {
        strength: clamp(0.35 + hitInto * 0.02, 0, 0.9),
        position: this.feet.clone(),
      });
    } catch {}
    try {
      if (Number.isFinite(fly.hitP.x + fly.hitP.y + fly.hitP.z))
        this.ctx.paint.paintSphere(fly.hitP, 1.1, this.state.selectedColor, 0.9);
    } catch {}
    this.onFlyCrash?.(hitInto);
    this.log(`fly crash into=${hitInto.toFixed(1)}`);
  }
  stepClimb(dt, intent) {
    const state = this.state;
    const elapsed = this.ctx.time.elapsed;
    state.sprinting = false;
    if (intent.dropPressed) {
      this.letGo(1.6);
      return 0;
    }
    if (state.exhausted || state.stamina <= 0) {
      this.letGo(1);
      return 0;
    }
    const probe = this.t1.set(this.feet.x, this.feet.y + CLIMB_PROBE_Y, this.feet.z);
    const hitA = this.hitA;
    if (!this.probeWall(probe, this.wallN, hitA)) {
      if (!this.tryMantle(2.3, this.wallN)) this.letGo(0.6);
      return 0;
    }
    this.wallN.lerp(hitA.normal, damp(14, dt)).normalize();
    const wallN = this.wallN;
    if (wallN.y > 0.7) {
      this.setMode('air');
      this.vel.set(-wallN.x * 1.5, 0, -wallN.z * 1.5);
      return 0;
    }
    this.upW.copy(WORLD_UP).addScaledVector(wallN, -wallN.y).normalize();
    this.rightW.copy(wallN).negate().cross(this.upW).normalize();
    let mx = intent.move.x;
    let my = intent.move.y;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const mag = Math.min(1, len);
    if (intent.jumpPressed) {
      this.jumpBuf = 0;
      if (my < -0.5) {
        this.setMode('air');
        this.vel.set(wallN.x * 5.5, 6.5, wallN.z * 5.5);
        state.facing = yawOf(wallN.x, wallN.z);
        this.regrab = 0.45;
        this.playerJump = false;
        state.lastJumpTime = elapsed;
        this.ctx.events.emit('player:jump', {
          position: this.feet.clone(),
        });
        this.log('wall kick-off');
        return 0;
      }
      if (this.climbDash <= 0) {
        state.stamina = Math.max(0, state.stamina - TUNING.climbJumpCost);
        this.regenDelayT = TUNING.regenDelay;
        state.lastClimbJumpTime = elapsed;
        if (mag > 0.2) this.climbDashDir.set(mx / Math.max(mag, 0.0001), my / Math.max(mag, 0.0001)).normalize();
        else this.climbDashDir.set(0, 1);
        this.climbDash = TUNING.climbJumpTime;
        this.log('climb-jump');
      }
    }
    let dx;
    let dy;
    let moving = mag > 0.05;
    if (this.climbDash > 0) {
      const dashK = this.climbDash / TUNING.climbJumpTime;
      const dashSpeed = ((2 * TUNING.climbJumpDist) / TUNING.climbJumpTime) * dashK;
      dx = this.climbDashDir.x * dashSpeed;
      dy = this.climbDashDir.y * dashSpeed;
      this.climbDash = Math.max(0, this.climbDash - dt);
      moving = true;
    } else {
      const speed = TUNING.climbSpeed * (intent.sprintHeld ? TUNING.climbSprintMul : 1);
      dx = mx * speed;
      dy = my * speed;
    }
    const t2 = this.t2;
    if (dy > 0) {
      t2.copy(probe).addScaledVector(this.upW, 0.85);
      if (!this.probeWall(t2, wallN, this.hitB) || this.hitB.normal.y > 0.65) {
        if (this.tryMantle(2.3, wallN)) return 0;
        dy = 0;
      } else if (!this.climbableAt(this.hitB.point, this.hitB.normal)) dy = 0;
    } else if (dy < 0) {
      if (
        this.probes.ray(this.t3.set(this.feet.x, this.feet.y + 0.3, this.feet.z), WORLD_DOWN, 0.75, this.hitC) &&
        this.hitC.normal.y > 0.7
      ) {
        this.setMode('ground');
        this.vel.set(0, 0, 0);
        return 0;
      }
      t2.copy(this.feet).addScaledVector(this.upW, 0.15);
      if (!this.probeWall(t2, wallN, this.hitB) || !this.climbableAt(this.hitB.point, this.hitB.normal)) dy = 0;
    }
    if (dx !== 0) {
      t2.copy(probe).addScaledVector(this.rightW, Math.sign(dx) * 0.5);
      if (!this.probeWall(t2, wallN, this.hitB) || !this.climbableAt(this.hitB.point, this.hitB.normal)) dx = 0;
    }
    if (this.climbDash > 0 && dx === 0 && dy === 0) this.climbDash = 0;
    if (dx === 0 && dy === 0) moving = false;
    const wallDist =
      (probe.x - hitA.point.x) * wallN.x +
      (probe.y - hitA.point.y) * wallN.y +
      (probe.z - hitA.point.z) * wallN.z +
      Math.min((TUNING.radius - CLIMB_PROBE_Y) * wallN.y, (TUNING.height - TUNING.radius - CLIMB_PROBE_Y) * wallN.y);
    const stick = (TUNING.climbWallDist - wallDist) * Math.min(1, 14 * dt);
    const stepX = (this.rightW.x * dx + this.upW.x * dy) * dt + wallN.x * stick;
    const stepY = (this.rightW.y * dx + this.upW.y * dy) * dt + wallN.y * stick;
    const stepZ = (this.rightW.z * dx + this.upW.z * dy) * dt + wallN.z * stick;
    this.move(stepX, stepY, stepZ, false, dt);
    this.vel.set(stepX / dt, stepY / dt, stepZ / dt);
    state.climbInput.set(
      dx === 0 && this.climbDash <= 0 ? 0 : clamp(mx, -1, 1),
      dy === 0 && this.climbDash <= 0 ? 0 : clamp(my, -1, 1),
    );
    state.sprinting = moving && intent.sprintHeld;
    if (this.climbDash > 0) state.climbInput.set(this.climbDashDir.x, this.climbDashDir.y);
    state.facing = approachAngle(state.facing, yawOf(-wallN.x, -wallN.z), 12 * dt);
    state.wallNormal.copy(wallN);
    if (this.climbableAt(hitA.point, hitA.normal)) this.climbLostPaintT = 0;
    else {
      this.climbLostPaintT += dt;
      if (this.climbLostPaintT > 0.3) {
        this.letGo(0.8);
        return 0;
      }
    }
    state.paintUnderfoot = this.debugPaint ?? this.samplePaint(hitA.point, hitA.normal);
    state.surface = 'paint';
    return moving ? (intent.sprintHeld ? TUNING.climbSprintDrain : TUNING.climbDrain) : TUNING.hangDrain;
  }
  stepMantle(dt) {
    const mantle = this.mantle;
    const state = this.state;
    mantle.t += dt / mantle.dur;
    const progress = Math.min(1, mantle.t);
    const rise = smooth01(Math.min(1, progress / 0.66));
    const advance = smooth01(clamp((progress - 0.4) / 0.6, 0, 1));
    const px = mantle.from.x + (mantle.to.x - mantle.from.x) * advance;
    const pz = mantle.from.z + (mantle.to.z - mantle.from.z) * advance;
    const py = mantle.from.y + (mantle.to.y + 0.04 - mantle.from.y) * rise;
    this.vel.set((px - this.feet.x) / dt, (py - this.feet.y) / dt, (pz - this.feet.z) / dt);
    this.nextCenter.x = px;
    this.nextCenter.y = py + HALF_HEIGHT + TUNING.skin;
    this.nextCenter.z = pz;
    this.body.setNextKinematicTranslation(this.nextCenter);
    this.feet.set(px, py, pz);
    state.climbInput.set(0, 1);
    state.facing = approachAngle(state.facing, yawOf(mantle.inward.x, mantle.inward.z), 10 * dt);
    if (progress >= 1) {
      mantle.active = false;
      this.vel.set(mantle.inward.x * 1.8, 0, mantle.inward.z * 1.8);
      this.setMode('ground');
      this.log('mantle done');
    }
  }
  land(impact, intent) {
    const state = this.state;
    const vel = this.vel;
    const elapsed = this.ctx.time.elapsed;
    impact = Math.max(0, impact);
    if (state.paintUnderfoot === 'yellow' && impact > TUNING.bounceMinImpact) {
      const held = intent.jumpHeld || this.jumpBuf > 0;
      let bounceV = 0;
      if (held) {
        bounceV = TUNING.bounceHeld;
        this.bounceChain = 1;
      } else if (this.bounceChain === 0) {
        bounceV = Math.max(impact * TUNING.bounceFactor, TUNING.bounceMin);
        this.bounceChain = 1;
      } else {
        bounceV = impact * TUNING.bounceChainDecay;
        this.bounceChain++;
        if (bounceV < TUNING.bounceSettle) bounceV = 0;
      }
      if (bounceV > 0 && !intent.dropPressed) {
        vel.y = bounceV;
        this.jumpBuf = 0;
        this.playerJump = false;
        this.airJumpsLeft = this.airJumpMax;
        this.airJumpCount = 0;
        this.setMode('air');
        state.lastBounceTime = elapsed;
        state.lastLandTime = elapsed;
        state.lastLandImpact = impact;
        this.ctx.events.emit('player:bounce', {
          position: this.feet.clone(),
          strength: bounceV,
        });
        this.log(`bounce vy=${bounceV.toFixed(1)} impact=${impact.toFixed(1)}`);
        return;
      }
    }
    this.bounceChain = 0;
    vel.y = 0;
    if (impact > 10) {
      const keep = clamp(1 - (impact - 10) * 0.03, 0.55, 1);
      vel.x *= keep;
      vel.z *= keep;
    }
    this.setMode(this.isSlippery() ? 'slide' : 'ground');
    if (state.airTime > 0.08 || impact > 2) {
      state.lastLandTime = elapsed;
      state.lastLandImpact = impact;
      this.ctx.events.emit('player:land', {
        position: this.feet.clone(),
        impact,
        surface: state.surface,
      });
      this.log(`land impact=${impact.toFixed(1)} surface=${state.surface}`);
    }
  }
  impactAlongNormal(vy) {
    const groundNormal = this.state.groundNormal;
    const vel = this.vel;
    const impact = -(vel.x * groundNormal.x + vy * groundNormal.y + vel.z * groundNormal.z);
    return clamp(impact, 0, Math.max(0, -vy));
  }
  enterWaterIfDeep() {
    if (this.onIce) return false;
    const waterDepth = this.waterDepth;
    const feetDepth = this.level() - this.feet.y;
    return (
      waterDepth > TUNING.swimEnterDepth &&
      feetDepth > TUNING.swimFeetBelow - 0.15 &&
      (this.setMode('swim'),
      (this.vel.y *= 0.35),
      (this.vel.x *= 0.5),
      (this.vel.z *= 0.5),
      (this.bounceChain = 0),
      true)
    );
  }
  letGo(push) {
    const wallN = this.wallN;
    const len = Math.hypot(wallN.x, wallN.z) || 1;
    this.vel.set((wallN.x / len) * push, 0, (wallN.z / len) * push);
    this.regrab = TUNING.climbRegrab;
    this.climbDash = 0;
    this.playerJump = false;
    this.setMode('air');
    this.log('let go');
  }
  canAirJump() {
    const state = this.state;
    return !(
      this.airJumpsLeft <= 0 ||
      this.coyote > 0 ||
      state.dead ||
      this.respawning ||
      state.airTime < TUNING.airJumpMinAir ||
      this.slowK < 1 ||
      this.mantle.active ||
      (this.vel.y < 0 && this.heightAboveGround < TUNING.airJumpGroundGap && this.waterDepth <= 0.5)
    );
  }
  airJump(intent) {
    const state = this.state;
    const vel = this.vel;
    const elapsed = this.ctx.time.elapsed;
    this.airJumpsLeft--;
    this.airJumpCount++;
    this.jumpBuf = 0;
    intent.jumpPressed = false;
    const jumpV = Math.sqrt(2 * TUNING.gravity * TUNING.airJumpHeight);
    vel.y = vel.y > jumpV ? vel.y + jumpV * 0.3 : jumpV;
    if (!this.cmb.drive) {
      const speed = Math.hypot(vel.x, vel.z);
      if (this.wishMag > 0.2) {
        const newSpeed = Math.max(speed * 0.92, TUNING.runSpeed * 0.95 * this.wishMag);
        vel.x = this.wish.x * newSpeed;
        vel.z = this.wish.z * newSpeed;
        if (this.faceTarget === null) state.facing = approachAngle(state.facing, yawOf(this.wish.x, this.wish.z), 2.4);
      } else {
        vel.x *= 0.85;
        vel.z *= 0.85;
      }
    }
    this.playerJump = true;
    this.bounceChain = 0;
    this.coyote = 0;
    state.lastJumpTime = elapsed;
    this.lastAirJumpTime = elapsed;
    this.ctx.events.emit('player:jump', {
      position: this.feet.clone(),
    });
    heroSignals(this.ctx).emit('air-jump', {
      position: this.feet.clone(),
      count: this.airJumpCount,
    });
    this.log(`air jump #${this.airJumpCount} vy=${vel.y.toFixed(1)} height ${this.heightAboveGround.toFixed(1)}`);
  }
  canGlide() {
    const state = this.state;
    return state.exhausted || state.stamina <= 0.01 ? false : this.heightAboveGround > TUNING.glideMinHeight;
  }
  tryGrabWall(dx, dz) {
    const state = this.state;
    if (this.regrab > 0 || state.exhausted || state.stamina <= 0.01) return false;
    const len = Math.hypot(dx, dz);
    if (len < 0.0001) return false;
    const dir = this.t2.set(dx / len, 0, dz / len);
    const hitA = this.hitA;
    let found = false;
    for (let i = 0; i < 2 && !found; i++) {
      const from = this.t3.set(this.feet.x, this.feet.y + (i === 0 ? CLIMB_PROBE_Y : 0.5), this.feet.z);
      if (!this.probes.ray(from, dir, TUNING.radius + (i === 0 ? 0.55 : 0.4), hitA)) continue;
      const normal = hitA.normal;
      if (normal.y >= TUNING.climbNormalY || normal.y < -0.35) continue;
      const hLen = Math.hypot(normal.x, normal.z) || 1;
      if (!((dir.x * normal.x + dir.z * normal.z) / hLen > -0.45))
        if (this.climbableAt(hitA.point, normal)) found = true;
    }
    if (!found) return false;
    const normal = hitA.normal;
    this.wallN.copy(normal);
    this.vel.set(0, 0, 0);
    this.climbDash = 0;
    this.climbLostPaintT = 0;
    this.setMode('climb');
    state.facing = yawOf(-normal.x, -normal.z);
    state.wallNormal.copy(normal);
    return true;
  }
  tryVault(maxHeight) {
    const dir = this.t2.set(this.wish.x, 0, this.wish.z);
    const from = this.t3.set(this.feet.x, this.feet.y + Math.min(maxHeight, 1.25), this.feet.z);
    if (
      !this.probes.ray(from, dir, TUNING.radius + 0.45, this.hitB) &&
      ((from.y = this.feet.y + 0.45), !this.probes.ray(from, dir, TUNING.radius + 0.45, this.hitB))
    )
      return false;
    const normal = this.hitB.normal;
    if (normal.y > 0.6 || normal.y < -0.3) return false;
    const hLen = Math.hypot(normal.x, normal.z) || 1;
    return (dir.x * normal.x + dir.z * normal.z) / hLen > -0.4 ? false : this.tryMantle(maxHeight, normal);
  }
  tryMantle(maxHeight, wallNormal) {
    const len = Math.hypot(wallNormal.x, wallNormal.z);
    if (len < 0.001) return false;
    const inX = -wallNormal.x / len;
    const inZ = -wallNormal.z / len;
    const reach = TUNING.climbWallDist + 0.5;
    const from = this.t2.set(this.feet.x + inX * reach, this.feet.y + maxHeight + 0.4, this.feet.z + inZ * reach);
    const hitC = this.hitC;
    if (!this.probes.ray(from, WORLD_DOWN, maxHeight + 0.4 + 0.2, hitC) || hitC.normal.y < 0.6 || hitC.distance < 0.05)
      return false;
    const height = hitC.point.y - this.feet.y;
    if (
      height < 0.2 ||
      height > maxHeight ||
      (this.t3.copy(hitC.point).addScaledVector(WORLD_UP, 0.08), this.probes.ray(this.t3, WORLD_UP, 1.6, this.hitB))
    )
      return false;
    const mantle = this.mantle;
    mantle.active = true;
    mantle.t = 0;
    mantle.dur = TUNING.mantleTime * (0.7 + 0.5 * Math.min(1.2, height / 2));
    mantle.from.copy(this.feet);
    mantle.to.set(hitC.point.x + inX * 0.15, hitC.point.y, hitC.point.z + inZ * 0.15);
    mantle.inward.set(inX, 0, inZ);
    this.state.wallNormal.set(-inX, 0, -inZ);
    this.climbDash = 0;
    this.setMode('climb');
    this.log(`mantle h=${height.toFixed(2)}`);
    return true;
  }
  kccClimb = false;
  move(dx, dy, dz, snap, dt) {
    const flying = this.mode === 'fly';
    const steep = this.mode === 'climb' || flying;
    if (steep !== this.kccClimb) {
      this.kccClimb = steep;
      try {
        this.kcc.setMaxSlopeClimbAngle(((steep ? 89 : TUNING.maxSlopeDeg) * Math.PI) / 180);
        this.kcc.setMinSlopeSlideAngle(((steep ? 89.5 : TUNING.slideSlopeDeg) * Math.PI) / 180);
      } catch {}
    }
    if (this.feet.x + dx > 157 || this.feet.x + dx < -157) {
      dx = clamp(this.feet.x + dx, -157, 157) - this.feet.x;
      this.vel.x = 0;
    }
    if (this.feet.z + dz > 157 || this.feet.z + dz < -157) {
      dz = clamp(this.feet.z + dz, -157, 157) - this.feet.z;
      this.vel.z = 0;
    }
    const desired = this.desired;
    desired.x = dx;
    desired.y = dy;
    desired.z = dz;
    const kcc = this.kcc;
    if (snap) kcc.enableSnapToGround(TUNING.snap);
    else kcc.disableSnapToGround();
    let mx = dx;
    let my = dy;
    let mz = dz;
    let grounded = false;
    try {
      kcc.computeColliderMovement(this.collider, desired, this.flags, COLLISION_GROUPS.player);
      const moved = kcc.computedMovement(this.movedOut);
      mx = moved.x;
      my = moved.y;
      mz = moved.z;
      grounded = kcc.computedGrounded();
      const count = kcc.numComputedCollisions();
      const vel = this.vel;
      for (let j = 0; j < count; j++) {
        const collision = kcc.computedCollision(j, this.coll);
        if (!collision) continue;
        const normal1 = collision.normal1;
        if (flying) {
          const into = -(vel.x * normal1.x + vel.y * normal1.y + vel.z * normal1.z);
          if (into > 0) {
            const fly = this.fly;
            fly.hit = true;
            if (into > fly.hitInto) {
              fly.hitInto = into;
              fly.hitN.set(normal1.x, normal1.y, normal1.z);
              const witness1 = collision.witness1;
              if (witness1) fly.hitP.set(witness1.x, witness1.y, witness1.z);
              else fly.hitP.copy(this.feet);
            }
            vel.x += normal1.x * into;
            vel.y += normal1.y * into;
            vel.z += normal1.z * into;
          }
          continue;
        }
        if (normal1.y > 0.08 && normal1.y < 0.6 && vel.y < -9) vel.y = -9;
        if (normal1.y < 0.6 && normal1.y > -0.3) {
          const hLen = Math.hypot(normal1.x, normal1.z);
          if (hLen > 0.0001) {
            const nx = normal1.x / hLen;
            const nz = normal1.z / hLen;
            const vn = vel.x * nx + vel.z * nz;
            if (vn < 0 && !(snap && this.isStepAt(collision.witness1, nx, nz))) {
              vel.x -= nx * vn;
              vel.z -= nz * vn;
            }
          }
        } else if (normal1.y <= -0.3 && vel.y > 0) vel.y = 0;
      }
    } catch {}
    if (!Number.isFinite(mx + my + mz)) mx = my = mz = 0;
    const nextCenter = this.nextCenter;
    nextCenter.x = this.feet.x + mx;
    nextCenter.y = this.feet.y + my + HALF_HEIGHT + TUNING.skin;
    nextCenter.z = this.feet.z + mz;
    this.body.setNextKinematicTranslation(nextCenter);
    this.feet.set(this.feet.x + mx, this.feet.y + my, this.feet.z + mz);
    return grounded;
  }
  probeGround(range) {
    const state = this.state;
    const hitB = this.hitB;
    const from = this.t3.set(this.feet.x, this.feet.y + 0.4, this.feet.z);
    let grounded = false;
    if (this.probes.ray(from, WORLD_DOWN, range + 0.4, hitB)) {
      this.heightAboveGround = Math.max(0, hitB.distance - 0.4);
      grounded = this.heightAboveGround < 0.35;
    } else {
      this.heightAboveGround = 999;
      try {
        const groundY = this.ctx.terrain.heightAt(this.feet.x, this.feet.z);
        if (Number.isFinite(groundY) && this.feet.y >= groundY - 0.5)
          this.heightAboveGround = Math.max(0, this.feet.y - groundY);
      } catch {}
    }
    const waterY = this.level();
    if (this.waterDepth > 0.5)
      this.heightAboveGround = Math.min(this.heightAboveGround, Math.max(0, this.feet.y - waterY));
    if (grounded) {
      state.groundNormal.copy(hitB.normal);
      this.groundHandle = hitB.handle;
      const info = this.probes.info(hitB.handle);
      this.groundKind = info?.kind ?? 'terrain';
      this.onIce = this.groundKind === 'ice' || info?.surface === 'ice';
      state.surface = this.surfaceFor(info?.kind, info?.surface, hitB.point.x, hitB.point.z);
    } else {
      state.groundNormal.set(0, 1, 0);
      this.groundHandle = -1;
      this.groundKind = '';
      this.onIce = false;
    }
    let paint = null;
    if (grounded) {
      this.t1.set(this.feet.x, this.feet.y - 0.06, this.feet.z);
      paint = this.samplePaint(this.t1, null);
    }
    if (this.debugPaint && grounded) paint = this.debugPaint;
    state.paintUnderfoot = paint;
    if (grounded && paint && !this.onIce) state.surface = 'paint';
    if (this.mode === 'swim' || (this.waterDepth > 0.2 && this.feet.y < waterY - 0.08 && !this.onIce))
      state.surface = 'water';
  }
  surfaceFor(kind, surface, x, z) {
    if (surface) return surface;
    switch (kind) {
      case undefined:
      case 'terrain':
        try {
          return this.ctx.terrain.surfaceAt(x, z);
        } catch {
          return 'grass';
        }
      case 'rock':
        return 'rock';
      case 'tree':
      case 'prop':
      case 'bramble':
        return 'wood';
      case 'structure':
        return 'stone';
      case 'ice':
        return 'ice';
      default:
        return 'dirt';
    }
  }
  isSlippery() {
    return this.onIce || this.state.paintUnderfoot === 'blue';
  }
  probeWall(from, normal, hit) {
    const start = this.t3.copy(from).addScaledVector(normal, 0.35);
    const dir = this.tmpDir.copy(normal).negate();
    return this.probes.ray(start, dir, 0.35 + TUNING.climbWallDist + 0.8, hit) ? hit.normal.y < 0.9 : false;
  }
  tmpDir = new Vector3();
  isStepAt(point, nx, nz) {
    if (!point || !Number.isFinite(point.x + point.y + point.z)) return false;
    const topY = this.feet.y + TUNING.autostep + 0.06;
    if (point.y > topY) return false;
    const from = this.stepProbe.set(point.x - nx * 0.08, topY, point.z - nz * 0.08);
    if (!this.probes.ray(from, WORLD_DOWN, TUNING.autostep + 0.1, this.hitStep)) return false;
    const rise = this.hitStep.point.y - this.feet.y;
    return this.hitStep.normal.y > 0.7 && rise > 0.02 && rise <= TUNING.autostep + 0.02;
  }
  stepProbe = new Vector3();
  hitStep = makeHit();
  climbableAt(point, normal) {
    return this.climbAnywhere || this.debugPaint === 'green' ? true : this.samplePaint(point, normal, 0.3) === 'green';
  }
  paintPt = new Vector3();
  samplePaint(point, normal, radius) {
    try {
      const pt = this.paintPt.copy(point);
      if (normal) pt.addScaledVector(normal, -0.1);
      return this.ctx.paint.dominant(pt, radius) ?? null;
    } catch {
      return null;
    }
  }
  approachH(tx, tz, maxStep) {
    const vel = this.vel;
    const dx = tx - vel.x;
    const dz = tz - vel.z;
    const len = Math.hypot(dx, dz);
    if (len <= maxStep || len < 0.000001) {
      vel.x = tx;
      vel.z = tz;
    } else {
      vel.x += (dx / len) * maxStep;
      vel.z += (dz / len) * maxStep;
    }
  }
  applyFaceOverride(dt) {
    if (this.faceTarget !== null)
      this.state.facing = approachAngle(this.state.facing, this.faceTarget, this.faceRate * dt);
  }
  computeWish(intent) {
    const move = intent.move;
    const sinYaw = Math.sin(this.cameraYaw);
    const cosYaw = Math.cos(this.cameraYaw);
    const wx = sinYaw * move.y - cosYaw * move.x;
    const wz = cosYaw * move.y + sinYaw * move.x;
    const len = Math.hypot(wx, wz);
    this.wishMag = Math.min(1, len);
    if (len > 0.0001) this.wish.set(wx / len, 0, wz / len);
    else this.wish.set(0, 0, 0);
    this.state.moveIntent.set(this.wish.x * this.wishMag, this.wish.z * this.wishMag);
  }
  level() {
    const level = this.ctx.water?.level;
    return Number.isFinite(level) ? level : 0;
  }
  safeDepth(x, z) {
    return waterDepthAt(this.ctx, x, z, this.feet.y);
  }
  slowK = 1;
  get slowed() {
    return this.slowK < 1;
  }
  updateSlow() {
    const state = this.state;
    const elapsed = this.ctx.time.elapsed;
    if (state.slowedUntil > elapsed && (this.mode === 'fly' || this.mode === 'glide' || state.dead || this.respawning))
      state.slowedUntil = elapsed;
    const remaining = state.slowedUntil - elapsed;
    this.slowK = remaining > 0 ? 0.35 + 0.65 * clamp(1 - remaining / 0.25, 0, 1) : 1;
  }
  updateStamina(dt, drain) {
    const state = this.state;
    if (drain > 0) {
      state.stamina = Math.max(0, state.stamina - drain * dt);
      this.regenDelayT = TUNING.regenDelay;
    } else if (this.mode === 'ground' || this.mode === 'slide' || this.mode === 'fly') {
      this.regenDelayT -= dt;
      const regenMul = 1 + 0.5 * Math.max(0, state.staminaMax - 1);
      if (this.regenDelayT <= 0)
        state.stamina = Math.min(
          state.staminaMax,
          state.stamina + (state.exhausted ? TUNING.exhaustedRegen : TUNING.regen) * regenMul * dt,
        );
    }
    if (state.stamina > state.staminaMax) state.stamina = state.staminaMax;
    if (state.stamina <= 0 && !state.exhausted) {
      state.stamina = 0;
      state.exhausted = true;
      this.ctx.events.emit('player:exhausted', {});
      this.log('exhausted');
    } else if (state.exhausted && state.stamina >= Math.min(state.staminaMax, 1) - 0.0001) {
      state.exhausted = false;
      this.log('recovered');
    }
  }
  updateSafeSpot(dt) {
    const state = this.state;
    if (!(this.mode !== 'ground' || this.groundedT < 0.35 || this.respawning)) {
      this.safeT -= dt;
      if (!(this.safeT > 0)) {
        this.safeT = 0.3;
        if (!(state.groundNormal.y < 0.72 || this.onIce || this.waterDepth > 0.15)) {
          this.hasSafe = true;
          if (
            this.groundKind !== 'prop' &&
            this.groundKind !== 'ice' &&
            state.paintUnderfoot !== 'blue' &&
            state.paintUnderfoot !== 'yellow'
          ) {
            this.lastSafe.copy(this.feet);
            this.lastSafeFacing.v = state.facing;
          }
        }
      }
    }
  }
  checkInteriorFall() {
    let current = null;
    try {
      current = this.ctx.interiors?.current ?? null;
    } catch {
      current = null;
    }
    if (current) {
      this.interiorRef = current;
      return;
    }
    const interiorRef = this.interiorRef;
    if (!interiorRef || this.respawning) return;
    const bounds = interiorRef.bounds;
    const feet = this.feet;
    if (!bounds || !bounds.min || !bounds.max) {
      this.interiorRef = null;
      return;
    }
    if (
      !(
        feet.x > bounds.min.x - 4 &&
        feet.x < bounds.max.x + 4 &&
        feet.z > bounds.min.z - 4 &&
        feet.z < bounds.max.z + 4
      ) ||
      feet.y > bounds.max.y + 20
    ) {
      this.interiorRef = null;
      return;
    }
    if (feet.y < bounds.min.y - 6 && this.mode !== 'fly') this.respawn('fell out of interior');
  }
  async respawn(reason) {
    if (this.respawning) return;
    this.respawning = true;
    this.log(`respawn (${reason})`);
    await this.safeFade(true);
    const pos = this.t1.copy(this.lastSafe);
    let facing = this.lastSafeFacing.v;
    const lastInterior = this.lastInterior;
    let fromInterior = false;
    try {
      if (
        lastInterior &&
        !lastInterior.bounds.containsPoint(this.lastSafe) &&
        lastInterior.respawn &&
        Number.isFinite(lastInterior.respawn.x + lastInterior.respawn.y + lastInterior.respawn.z)
      ) {
        pos.copy(lastInterior.respawn);
        if (Number.isFinite(lastInterior.respawnFacing)) facing = lastInterior.respawnFacing;
        fromInterior = true;
      }
    } catch {}
    if (!this.hasSafe && !fromInterior) {
      const spawn = this.ctx.terrain?.landmarks?.spawn;
      if (spawn) {
        pos.copy(spawn);
        try {
          pos.y = this.ctx.terrain.heightAt(spawn.x, spawn.z);
        } catch {}
      }
    }
    pos.y += 0.05;
    this.teleport(pos, facing);
    const state = this.state;
    state.stamina = state.staminaMax;
    state.exhausted = false;
    this.ctx.events.emit('player:respawn', {
      position: pos.clone(),
    });
    this.respawnHook?.();
    await this.safeFade(false);
    this.respawning = false;
  }
  async safeFade(toBlack) {
    try {
      const pending = this.ctx.ui?.fade?.(toBlack);
      if (pending && typeof pending.then == 'function')
        await Promise.race([pending, new Promise((resolve) => setTimeout(resolve, 2500))]);
    } catch {}
  }
  respawnHook = null;
  fillState(dt) {
    const state = this.state;
    state.mode = this.mode;
    state.grounded = this.mode === 'ground' || this.mode === 'slide';
    state.speed = Math.hypot(this.vel.x, this.vel.z);
    state.waterDepth = this.waterDepth;
    state.aiming = this.aiming;
    if (this.mode !== 'climb') state.climbInput.set(0, 0);
    if (this.mode !== 'ground' && this.mode !== 'swim' && this.mode !== 'climb' && this.mode !== 'fly')
      state.sprinting = false;
  }
  setMode(mode) {
    const prev = this.mode;
    if (prev !== mode) {
      this.mode = mode;
      this.state.mode = mode;
      if (mode !== 'air' && mode !== 'glide') {
        this.airJumpsLeft = this.airJumpMax;
        this.airJumpCount = 0;
      }
      if (mode === 'air' && prev !== 'glide') this.state.airTime = 0;
      if (mode === 'climb') this.state.airTime = 0;
      this.ctx.events.emit('player:mode', {
        from: prev,
        to: mode,
      });
      this.onModeChange?.(prev, mode);
      this.log(
        `mode ${prev} -> ${mode} @ ${this.feet.x.toFixed(1)},${this.feet.y.toFixed(1)},${this.feet.z.toFixed(1)}`,
      );
    }
  }
  log(msg) {
    if (this.logEnabled) console.warn(`[player] t=${this.ctx.time.elapsed.toFixed(2)} ${msg}`);
  }
  spawnPoint(out) {
    const ctx = this.ctx;
    let x = 0;
    let z = 105;
    const at = ctx.params.get('at');
    const landmarks = ctx.terrain?.landmarks;
    if (at && landmarks && landmarks[at]) {
      x = landmarks[at].x;
      z = landmarks[at].z;
    } else if (at && at.includes(',')) {
      const [ax, az] = at.split(',').map(Number);
      if (Number.isFinite(ax) && Number.isFinite(az)) {
        x = ax;
        z = az;
      }
    } else if (landmarks?.spawn) {
      x = landmarks.spawn.x;
      z = landmarks.spawn.z;
    }
    let y = 0;
    try {
      y = ctx.terrain.heightAt(x, z);
    } catch {
      y = landmarks?.spawn?.y ?? 0;
    }
    if (!Number.isFinite(y)) y = 0;
    y = Math.max(y, this.levelSafe() - 1.25);
    return out.set(x, y + 0.08, z);
  }
  levelSafe() {
    const level = this.ctx.water?.level;
    return Number.isFinite(level) ? level : 0;
  }
  initialFacing() {
    const deg = Number(this.ctx.params.get('face'));
    return this.ctx.params.has('face') && Number.isFinite(deg) ? wrapAngle((deg * Math.PI) / 180) : Math.PI;
  }
}
