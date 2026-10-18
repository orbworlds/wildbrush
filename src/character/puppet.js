/**
 * Animation preview puppet: when the player is a stub, drives its state through the animation named in the URL, or a showcase loop from idle through walk, run, sprint, jump, land, bounce, flick, slide, glide and swim to climb, along a test path, building a wall to climb and a ledge to mantle when needed.
 */
import { BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { COLORS } from '../core/config.js';
const PUPPET_ANIMS = [
  'idle',
  'turn',
  'mantle',
  'walk',
  'run',
  'sprint',
  'jump',
  'land',
  'climb',
  'glide',
  'swim',
  'slide',
  'aim',
  'flick',
  'bounce',
];
const SHOWCASE = [
  {
    anim: 'idle',
    dur: 4,
  },
  {
    anim: 'walk',
    dur: 4,
  },
  {
    anim: 'run',
    dur: 4,
  },
  {
    anim: 'sprint',
    dur: 3.5,
  },
  {
    anim: 'jump',
    dur: 4,
  },
  {
    anim: 'land',
    dur: 4.5,
  },
  {
    anim: 'bounce',
    dur: 5,
  },
  {
    anim: 'flick',
    dur: 5,
  },
  {
    anim: 'slide',
    dur: 4,
  },
  {
    anim: 'glide',
    dur: 7,
  },
  {
    anim: 'swim',
    dur: 7,
  },
  {
    anim: 'climb',
    dur: 9,
  },
];
const PUPPET_GRAVITY = -24;
export class Puppet {
  ctx;
  s;
  anim;
  cur;
  t = 0;
  segT = 0;
  segIdx = 0;
  u = 0;
  speed = 0;
  pos = new Vector3();
  vel = new Vector3();
  facing = Math.PI;
  airborne = false;
  airStart = 0;
  lastEvent = 0;
  counter = 0;
  wall = null;
  wallN = new Vector3(0, 0, 1);
  wallP = new Vector3();
  center;
  lake;
  climbStart = 0;
  gliding = false;
  airPhase = 0;
  turnBase = 0;
  ledge = null;
  ledgeTop = 0;
  ledgeP = new Vector3();
  constructor(ctx, state) {
    this.ctx = ctx;
    this.s = state;
    const anim = ctx.params.get('anim') ?? 'idle';
    this.anim = anim === 'showcase' || PUPPET_ANIMS.includes(anim) ? anim : 'idle';
    this.center = ctx.terrain.landmarks.spawn.clone().add(new Vector3(0, 0, -10));
    const at = (ctx.params.get('at') ?? '').split(',').map(Number);
    if (at.length === 2 && at.every(Number.isFinite)) this.center.set(at[0], 0, at[1]);
    const lake = ctx.terrain.landmarks.lake;
    this.lake = new Vector3(lake.x, 0, lake.z);
    this.cur = this.anim === 'showcase' ? SHOWCASE[0].anim : this.anim;
    const color = ctx.params.get('color');
    if (color && COLORS.includes(color)) state.selectedColor = color;
    this.enter(this.cur);
  }
  get current() {
    return this.cur;
  }
  ground(x, z) {
    return this.ctx.terrain.heightAt(x, z);
  }
  path(dist, out) {
    const loopLen = 32 + 2 * Math.PI * 6;
    let d = ((dist % loopLen) + loopLen) % loopLen;
    const center = this.center;
    if (d < 16) {
      out.set(center.x - 8 + d, 0, center.z + 6);
      return Math.PI / 2;
    }
    d -= 16;
    const arcLen = Math.PI * 6;
    if (d < arcLen) {
      const ang = d / 6;
      out.set(center.x + 8 + Math.sin(ang) * 6, 0, center.z + Math.cos(ang) * 6);
      return Math.PI / 2 + ang;
    }
    d -= arcLen;
    if (d < 16) {
      out.set(center.x + 8 - d, 0, center.z - 6);
      return -Math.PI / 2;
    }
    d -= 16;
    const ang = d / 6;
    out.set(center.x - 8 - Math.sin(ang) * 6, 0, center.z - Math.cos(ang) * 6);
    return -Math.PI / 2 + ang;
  }
  enter(cur) {
    const state = this.s;
    this.cur = cur;
    this.segT = 0;
    this.counter = 0;
    this.lastEvent = this.t;
    state.aiming = false;
    state.sprinting = false;
    state.exhausted = false;
    state.stamina = state.staminaMax;
    state.climbInput.set(0, 0);
    this.airborne = false;
    this.gliding = false;
    if (this.wall) this.wall.visible = false;
    if (this.ledge) this.ledge.visible = false;
    const pos = this.pos;
    if (cur === 'swim') {
      pos.set(this.lake.x + 10, 0, this.lake.z);
      this.facing = Math.PI;
    } else if (cur === 'climb') {
      this.ensureWall();
      pos.copy(this.wallP).addScaledVector(this.wallN, 0.4);
      pos.y = this.ground(pos.x, pos.z) + 0.25;
      this.facing = Math.atan2(-this.wallN.x, -this.wallN.z);
      this.climbStart = this.t;
    } else if (cur === 'glide') {
      this.path(this.u, pos);
      pos.y = this.ground(pos.x, pos.z) + 24;
      this.airborne = true;
      this.airStart = this.t;
      this.vel.set(0, 0, 0);
    } else if (cur === 'mantle') {
      this.ensureLedge();
      this.facing = Math.PI;
    } else if (cur === 'turn') {
      this.path(this.u, pos);
      this.turnBase = this.facing;
    } else if (cur === 'idle' || cur === 'aim' || cur === 'flick') {
      if (this.anim !== 'showcase' || this.s.speed < 0.1) this.facing = this.path(this.u, pos) - 0.4;
    } else this.facing = this.path(this.u, pos);
    if (cur !== 'glide' && cur !== 'swim' && cur !== 'climb' && cur !== 'mantle') pos.y = this.ground(pos.x, pos.z);
    state.position.copy(pos);
    state.facing = this.facing;
  }
  ensureLedge() {
    if (!this.ledge) {
      const base = this.center.clone().add(new Vector3(6, 0, -2));
      const groundY = this.ground(base.x, base.z);
      this.ledgeTop = groundY + 2;
      const mesh = new Mesh(
        new BoxGeometry(4, 3, 2),
        new MeshStandardMaterial({
          color: 0x9a9184,
          roughness: 0.95,
        }),
      );
      mesh.position.set(base.x, groundY + 1 / 2, base.z - 1);
      mesh.castShadow = mesh.receiveShadow = true;
      this.ctx.scene.add(mesh);
      this.ledge = mesh;
      try {
        const RAPIER = this.ctx.RAPIER;
        const collider = this.ctx.physics.createCollider(
          RAPIER.ColliderDesc.cuboid(2, 3 / 2, 1).setTranslation(base.x, groundY + 1 / 2, base.z - 1),
        );
        this.ctx.colliders.register(collider, {
          kind: 'structure',
          surface: 'stone',
          object: mesh,
        });
      } catch {}
      this.ledgeP.set(base.x, groundY, base.z);
    }
    this.ledge.visible = true;
  }
  ensureWall() {
    if (!this.wall) {
      const geometry = new BoxGeometry(7, 12, 1.2, 14, 24, 2);
      const position = geometry.attributes.position;
      for (let j = 0; j < position.count; j++) {
        const x = position.getX(j);
        const y = position.getY(j);
        const z = position.getZ(j);
        if (z > 0.5) position.setZ(j, z + Math.sin(x * 2.1 + y * 1.3) * 0.02);
      }
      geometry.computeVertexNormals();
      const material = new MeshStandardMaterial({
        color: 0x8f877c,
        roughness: 0.95,
      });
      this.wall = new Mesh(geometry, material);
      this.wall.receiveShadow = true;
      this.wall.castShadow = true;
      this.ctx.scene.add(this.wall);
      const base = this.center.clone().add(new Vector3(-3, 0, -2));
      this.wallN.set(0, 0, 1);
      this.wallP.set(base.x, 0, base.z);
      this.wall.position.set(base.x, this.ground(base.x, base.z) + 5, base.z - 0.6);
    }
    this.wall.visible = true;
  }
  update(dt) {
    if (dt <= 0) return;
    this.t += dt;
    this.segT += dt;
    const state = this.s;
    if (this.anim === 'showcase') {
      const seg = SHOWCASE[this.segIdx];
      if (this.segT > seg.dur) {
        this.segIdx = (this.segIdx + 1) % SHOWCASE.length;
        this.enter(SHOWCASE[this.segIdx].anim);
      }
    }
    const cur = this.cur;
    const elapsed = this.ctx.time.elapsed;
    const pos = this.pos;
    let mode = 'ground';
    let targetSpeed = 0;
    state.surface = 'grass';
    state.waterDepth = 0;
    state.sprinting = false;
    switch (cur) {
      case 'turn': {
        targetSpeed = 0;
        const step = Math.floor(this.segT / 2.2);
        const targetYaw = this.turnBase + (Math.PI / 2) * step * (step % 4 < 2 ? 1 : -0.7);
        this.facing = turnToward(this.facing, targetYaw, 7 * dt);
        break;
      }
      case 'idle':
      case 'aim':
      case 'flick':
        targetSpeed = 0;
        if (cur === 'flick' && this.segT > 7 && this.segT < 10) targetSpeed = 1.6;
        break;
      case 'walk':
        targetSpeed = 1.7;
        break;
      case 'run':
        targetSpeed = 6.5;
        break;
      case 'sprint':
        targetSpeed = 10;
        state.sprinting = true;
        break;
      case 'jump':
      case 'bounce':
        targetSpeed = cur === 'jump' ? 4.5 : 5;
        break;
      case 'land':
        targetSpeed = this.counter % 2 == 0 ? 5.5 : 0;
        break;
      case 'slide':
        targetSpeed = 8;
        mode = 'slide';
        state.surface = 'ice';
        break;
      case 'swim':
        mode = 'swim';
        targetSpeed = this.segT % 10 < 5 ? 1.8 : 3.4;
        state.sprinting = this.segT % 10 >= 5;
        state.surface = 'water';
        state.waterDepth = 5;
        break;
      case 'climb':
        mode = 'climb';
        break;
      case 'glide':
        mode = 'glide';
    }
    if (cur !== 'climb' && cur !== 'glide' && cur !== 'swim' && cur !== 'mantle') {
      this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-3.5 * dt));
      if (this.speed < 0.02 && targetSpeed === 0) this.speed = 0;
      this.u += this.speed * dt;
      const heading = this.path(this.u, _pathPoint);
      const x = _pathPoint.x;
      const z = _pathPoint.z;
      const vx = (x - pos.x) / dt;
      const vz = (z - pos.z) / dt;
      if (this.speed > 0.01) {
        this.vel.x = vx;
        this.vel.z = vz;
      } else {
        this.vel.x = 0;
        this.vel.z = 0;
      }
      pos.x = x;
      pos.z = z;
      if (this.speed > 0.2) this.facing = turnToward(this.facing, heading, 12 * dt);
      if (
        (cur === 'jump' || cur === 'bounce' || cur === 'land') &&
        !this.airborne &&
        this.t - this.lastEvent > (cur === 'land' ? 1.6 : 1.3)
      ) {
        this.airborne = true;
        this.airStart = this.t;
        this.lastEvent = this.t;
        if (cur === 'jump') {
          this.vel.y = 8.5;
          state.lastJumpTime = elapsed;
        } else if (cur === 'bounce') {
          this.vel.y = this.counter % 2 == 0 ? 17 : 11;
          state.lastBounceTime = elapsed;
        } else {
          this.vel.y = this.counter % 2 == 0 ? 15 : 17;
          state.lastJumpTime = elapsed;
        }
        this.counter++;
      }
      const groundY = this.ground(pos.x, pos.z);
      if (this.airborne) {
        this.vel.y += PUPPET_GRAVITY * dt;
        pos.y += this.vel.y * dt;
        mode = 'air';
        if (pos.y <= groundY && this.vel.y < 0) {
          pos.y = groundY;
          state.lastLandImpact = -this.vel.y;
          state.lastLandTime = elapsed;
          this.vel.y = 0;
          this.airborne = false;
          this.lastEvent = this.t;
        }
      } else {
        this.vel.y = 0;
        pos.y = groundY;
      }
    }
    if (cur === 'glide') {
      const cycle = (this.t - this.airStart) % 7;
      const wasGliding = this.gliding;
      this.gliding = cycle > 0.55 && cycle < 5.8;
      if (wasGliding && !this.gliding) this.airPhase = this.t;
      const glideSpeed = 6.5;
      this.facing += Math.sin(this.t * 0.55) * 0.7 * dt;
      this.vel.x = Math.sin(this.facing) * glideSpeed;
      this.vel.z = Math.cos(this.facing) * glideSpeed;
      if (this.gliding) this.vel.y += (-1.8 - this.vel.y) * (1 - Math.exp(-3 * dt));
      else this.vel.y += PUPPET_GRAVITY * 0.6 * dt;
      pos.addScaledVector(this.vel, dt);
      const groundY = this.ground(pos.x, pos.z);
      if (pos.y < groundY + 6) {
        pos.y = groundY + 16;
        this.vel.y = 0;
      }
      mode = this.gliding ? 'glide' : 'air';
      if (cycle < 0.05) {
        state.lastJumpTime = elapsed;
        this.airPhase = this.t;
      }
      this.speed = glideSpeed;
    }
    if (cur === 'swim') {
      this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-2 * dt));
      const ang = Math.atan2(pos.z - this.lake.z, pos.x - this.lake.x) + (this.speed / 9) * dt;
      const x = this.lake.x + Math.cos(ang) * 9;
      const z = this.lake.z + Math.sin(ang) * 9;
      this.vel.set((x - pos.x) / dt, 0, (z - pos.z) / dt);
      pos.set(x, (this.ctx.water?.level ?? 0) - 1.25, z);
      this.facing = turnToward(this.facing, Math.atan2(this.vel.x, this.vel.z), 6 * dt);
    }
    if (cur === 'climb') {
      const cycle = (this.t - this.climbStart) % 11;
      let inX = 0;
      let inY = 0;
      if (cycle < 2.6) inY = 1;
      else if (cycle < 3.8) inY = 0;
      else if (cycle < 5.6) inX = 1;
      else if (cycle < 7.4) inX = -1;
      else if (cycle < 8.2) inY = 0;
      else if (cycle < 9.6) inY = -1;
      state.climbInput.set(inX, inY);
      if (cycle > 9.7 && cycle - dt <= 9.7) state.lastClimbJumpTime = elapsed;
      const sinceJump = elapsed - state.lastClimbJumpTime;
      const boost = sinceJump >= 0 && sinceJump < 0.35 ? 4.2 * (1 - sinceJump / 0.35) : 0;
      const climbSpeed = 1.1;
      const tx = this.wallN.z;
      const tz = -this.wallN.x;
      this.vel.set(-tx * inX * climbSpeed, inY * climbSpeed + boost, -tz * inX * climbSpeed);
      pos.addScaledVector(this.vel, dt);
      const groundY = this.ground(pos.x, pos.z);
      if (pos.y < groundY + 0.25) pos.y = groundY + 0.25;
      if (pos.y > groundY + 7) pos.y = groundY + 7;
      const moving = inX !== 0 || inY !== 0;
      state.stamina = Math.max(0, state.stamina - (moving ? 0.1 : 0.03) * dt);
      if (cycle < 0.1) state.stamina = state.staminaMax;
      state.exhausted = state.stamina <= 0.02;
      this.facing = Math.atan2(-this.wallN.x, -this.wallN.z);
      state.wallNormal.copy(this.wallN);
      state.surface = 'rock';
    }
    if (cur === 'mantle') {
      const cycle = this.segT % 4.2;
      const ledgeP = this.ledgeP;
      const baseY = this.ground(ledgeP.x, ledgeP.z);
      state.wallNormal.set(0, 0, 1);
      this.facing = Math.PI;
      if (cycle < 0.6) {
        mode = 'ground';
        pos.set(ledgeP.x, baseY, ledgeP.z + 0.9);
        this.vel.set(0, 0, 0);
      } else if (cycle < 1.4) {
        mode = 'climb';
        const prog = (cycle - 0.6) / 0.8;
        pos.set(ledgeP.x, baseY + 0.3 + prog * 1, ledgeP.z + 0.4);
        this.vel.set(0, 1.25, 0);
        state.climbInput.set(0, 1);
      } else if (cycle < 1.9) {
        mode = 'climb';
        const prog = (cycle - 1.4) / 0.5;
        const rise = easeInOutQuad(Math.min(1, prog / 0.66));
        const over = easeInOutQuad(Math.min(1, Math.max(0, (prog - 0.4) / 0.6)));
        const y = baseY + 1.3 + (this.ledgeTop + 0.04 - baseY - 1.3) * rise;
        const z = ledgeP.z + 0.4 - 0.75 * over;
        this.vel.set(0, (y - pos.y) / dt, (z - pos.z) / dt);
        pos.set(ledgeP.x, y, z);
        state.climbInput.set(0, 1);
      } else {
        mode = 'ground';
        pos.set(ledgeP.x, this.ledgeTop, ledgeP.z - 0.35);
        this.vel.set(0, 0, 0);
      }
      state.surface = 'stone';
    }
    const aimAt = this.ctx.params.get('aimAt');
    if (cur === 'aim' || cur === 'flick') {
      state.aiming = cur === 'aim' || (this.segT % 7 < 4.2 && this.segT < 7);
      const sweep = Math.sin(this.t * 0.7) * 0.7;
      const yaw = this.facing + sweep;
      state.aimTarget.set(
        pos.x + Math.sin(yaw) * 12,
        pos.y + 1 + Math.sin(this.t * 0.5) * 3,
        pos.z + Math.cos(yaw) * 12,
      );
      if (aimAt) {
        const [dx, dy, dz] = aimAt.split(',').map(Number);
        if ([dx, dy, dz].every(Number.isFinite)) state.aimTarget.set(pos.x + dx, pos.y + dy, pos.z + dz);
      }
      if (cur === 'flick' && this.t - this.lastEvent > 0.8 && this.segT > 0.6) {
        state.lastFlickTime = elapsed;
        this.lastEvent = this.t;
        this.ctx.events.emit('player:flick', {
          color: state.selectedColor,
          direction: new Vector3().subVectors(state.aimTarget, pos).normalize(),
        });
        if (this.ctx.params.get('cycle') === '1')
          state.selectedColor = COLORS[(COLORS.indexOf(state.selectedColor) + 1) % 4];
      }
    } else state.aimTarget.set(pos.x + Math.sin(this.facing) * 10, pos.y + 1, pos.z + Math.cos(this.facing) * 10);
    state.mode = mode;
    state.position.copy(pos);
    state.velocity.copy(this.vel);
    state.facing = this.facing;
    state.speed = Math.hypot(this.vel.x, this.vel.z);
    state.moveIntent.set(this.vel.x, this.vel.z);
    if (state.moveIntent.lengthSq() > 1) state.moveIntent.normalize();
    else state.moveIntent.multiplyScalar(1 / Math.max(1, state.speed));
    if (state.speed < 0.05) state.moveIntent.set(0, 0);
    state.grounded = mode === 'ground' || mode === 'slide';
    state.airTime = mode === 'air' ? this.t - (cur === 'glide' ? this.airPhase : this.airStart) : 0;
    this.ctx.terrain.normalAt(pos.x, pos.z, state.groundNormal);
  }
}
const _pathPoint = new Vector3();
function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
function turnToward(from, to, maxStep) {
  let diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return from + Math.max(-maxStep, Math.min(maxStep, diff));
}
