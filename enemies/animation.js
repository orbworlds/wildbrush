/**
 * Procedural Smudge animation: sets spring targets each frame for gait, looking at the hero, idle fidgets and every state (notice, telegraph, attack, recover, stagger, flee, dying, statuses), then steps the springs.
 */
import { Vector3 } from 'three';
import { clamp, smoothstep } from '../core/math.js';
import { ATTACKS } from './defs.js';
import { CH } from './enemy.js';
const TAU = Math.PI * 2;
export function initAnim(enemy) {
  const anim = enemy.anim;
  const rate = enemy.kind === 'brute' ? 0.65 : 1;
  anim.set(CH.LEAN_X, 5 * rate, 0.7);
  anim.set(CH.LEAN_Z, 5 * rate, 0.6);
  anim.set(CH.SQUASH, 5.5 * rate, 0.32);
  anim.set(CH.BOB, 9 * rate, 0.9);
  anim.set(CH.TOP_X, 3.6 * rate, 0.26);
  anim.set(CH.TOP_Y, 4.5 * rate, 0.3);
  anim.set(CH.TOP_Z, 3.6 * rate, 0.26);
  anim.set(CH.TOP_PITCH, 4.5 * rate, 0.45);
  anim.set(CH.TOP_YAW, 4.5 * rate, 0.5);
  anim.set(CH.TOP_ROLL, 4.5 * rate, 0.4);
  anim.set(CH.MASK_YAW, 4 * rate, 0.75);
  anim.set(CH.MASK_PITCH, 4 * rate, 0.7);
  anim.set(CH.MASK_ROLL, 4 * rate, 0.5);
  anim.set(CH.MASK_PUSH, 7 * rate, 0.45);
  for (const ch of [CH.HL_PITCH, CH.HR_PITCH, CH.HL_ROLL, CH.HR_ROLL]) anim.set(ch, 5.5 * rate, 0.55);
  for (const ch of [CH.HL_X, CH.HL_Y, CH.HL_Z, CH.HR_X, CH.HR_Y, CH.HR_Z]) anim.set(ch, 6 * rate, 0.6);
  for (const ch of [CH.FL_LIFT, CH.FL_FWD, CH.FR_LIFT, CH.FR_FWD]) anim.set(ch, 12 * rate, 0.9);
  anim.set(CH.EXTRA_A, 4.2, enemy.kind === 'smudgeling' ? 0.18 : 0.5);
  anim.set(CH.EXTRA_B, 3.6, 0.18);
  anim.set(CH.EYE_OPEN, 14, 0.7);
  anim.set(CH.ANGER, 6, 1);
  anim.set(CH.GLOW, 16, 1);
  anim.set(CH.MOUTH, 10, 0.7);
  anim.set(CH.WIDTH, 5, 0.35);
  anim.set(CH.CRACK, 8, 1);
  const target = anim.target;
  target.fill(0);
  target[CH.SQUASH] = 1;
  target[CH.EYE_OPEN] = 1;
  target[CH.WIDTH] = 1;
  anim.snapAll();
}
const _localVel = new Vector3();
const _localAccel = new Vector3();
export function animateEnemy(enemy, dt, frame) {
  const anim = enemy.anim;
  const target = anim.target;
  const time = frame.time + enemy.seed * 10;
  const kind = enemy.kind;
  const isBrute = kind === 'brute';
  const isSmudgeling = kind === 'smudgeling';
  const cos = Math.cos(enemy.facing);
  const sin = Math.sin(enemy.facing);
  const actualVel = enemy.actualVel;
  _localVel.set(actualVel.x * cos - actualVel.z * sin, actualVel.y, actualVel.x * sin + actualVel.z * cos);
  const accel = enemy.accel;
  _localAccel.set(accel.x * cos - accel.z * sin, accel.y, accel.x * sin + accel.z * cos);
  const speed = Math.hypot(actualVel.x, actualVel.z);
  const stride = (isSmudgeling ? 1 : kind === 'spitter' ? 1.25 : 2.3) * enemy.scale;
  const walking = enemy.grounded && speed > 0.25 && enemy.controllable;
  enemy.gaitAmp +=
    ((walking ? clamp(speed / (enemy.def.walkSpeed * 1.4), 0, 1.4) : 0) - enemy.gaitAmp) * (1 - Math.exp(-8 * dt));
  if (walking) enemy.gaitPhase += (speed / stride) * TAU * dt;
  else enemy.gaitPhase += (Math.round(enemy.gaitPhase / Math.PI) * Math.PI - enemy.gaitPhase) * (1 - Math.exp(-6 * dt));
  const gaitPhase = enemy.gaitPhase;
  const gaitAmp = enemy.gaitAmp;
  const swing = Math.sin(gaitPhase);
  const swingCos = Math.cos(gaitPhase);
  const bounce = Math.abs(swing);
  const breath = Math.sin(time * (isBrute ? 1.4 : 2.3));
  target[CH.LEAN_X] = clamp(_localVel.z * (isBrute ? 0.04 : 0.055), -0.3, 0.4);
  target[CH.LEAN_Z] = clamp(-_localVel.x * 0.05, -0.3, 0.3);
  target[CH.SQUASH] = 1 + breath * (isBrute ? 0.015 : 0.025);
  target[CH.BOB] = 0;
  target[CH.TOP_X] = clamp(-_localAccel.x * 0.006 * (isBrute ? 2 : 1), -0.12, 0.12);
  target[CH.TOP_Y] = 0;
  target[CH.TOP_Z] = clamp(-_localAccel.z * 0.006 * (isBrute ? 2 : 1), -0.12, 0.12);
  target[CH.TOP_PITCH] = 0;
  target[CH.TOP_YAW] = 0;
  target[CH.TOP_ROLL] = 0;
  target[CH.MASK_PITCH] = Math.sin(time * 0.7) * 0.05;
  target[CH.MASK_ROLL] = Math.sin(time * 0.53) * 0.06;
  target[CH.MASK_PUSH] = 0;
  target[CH.HL_PITCH] = 0.1 + breath * 0.05;
  target[CH.HR_PITCH] = 0.1 + breath * 0.05;
  target[CH.HL_ROLL] = 0.05;
  target[CH.HR_ROLL] = -0.05;
  target[CH.HL_X] = target[CH.HL_Y] = target[CH.HL_Z] = 0;
  target[CH.HR_X] = target[CH.HR_Y] = target[CH.HR_Z] = 0;
  target[CH.FL_LIFT] = target[CH.FL_FWD] = target[CH.FR_LIFT] = target[CH.FR_FWD] = 0;
  target[CH.EXTRA_A] = 0;
  target[CH.EXTRA_B] = 0;
  target[CH.EYE_OPEN] = 1;
  target[CH.ANGER] = enemy.alerted ? 0.75 : 0;
  target[CH.GLOW] = 0;
  target[CH.MOUTH] = 0;
  target[CH.WIDTH] = 1;
  target[CH.CRACK] = 0;
  let lookYaw = 0;
  let lookPitch = 0;
  if (!frame.freeLook && (enemy.alerted || enemy.awareness > 0.25) && enemy.alive) {
    const dx = frame.player.x - enemy.position.x;
    const dz = frame.player.z - enemy.position.z;
    lookYaw = wrapYaw(Math.atan2(dx, dz) - enemy.facing);
    lookPitch = -Math.atan2(frame.player.y + 1.2 - (enemy.position.y + enemy.height * 0.8), Math.hypot(dx, dz)) * 0.6;
  } else lookYaw = Math.sin(time * 0.37) * 0.5 + Math.sin(time * 0.91) * 0.2;
  const maxYaw = isBrute ? 0.6 : 1;
  target[CH.MASK_YAW] = clamp(lookYaw, -maxYaw, maxYaw);
  target[CH.MASK_PITCH] += clamp(lookPitch, -0.4, 0.4);
  target[CH.TOP_YAW] = clamp(lookYaw * 0.3, -0.3, 0.3);
  enemy.lookYaw = lookYaw;
  enemy.lookPitch = lookPitch;
  if (gaitAmp > 0.01) {
    if (isSmudgeling) {
      target[CH.BOB] += bounce * 0.07 * gaitAmp;
      target[CH.SQUASH] += (bounce - 0.55) * 0.14 * gaitAmp;
      target[CH.LEAN_Z] += swing * 0.16 * gaitAmp;
      target[CH.TOP_ROLL] += -swing * 0.1 * gaitAmp;
      target[CH.EXTRA_A] += -bounce * 0.4 * gaitAmp;
    } else if (kind === 'spitter') {
      target[CH.BOB] += bounce * 0.035 * gaitAmp;
      target[CH.SQUASH] += (bounce - 0.5) * 0.06 * gaitAmp;
      target[CH.LEAN_Z] += swing * 0.08 * gaitAmp;
      target[CH.TOP_ROLL] += -swing * 0.09 * gaitAmp;
      target[CH.TOP_YAW] += swing * 0.08 * gaitAmp;
    } else {
      target[CH.BOB] += (bounce - 0.7) * 0.06 * gaitAmp;
      target[CH.SQUASH] += (bounce - 0.6) * 0.05 * gaitAmp;
      target[CH.LEAN_Z] += swing * 0.07 * gaitAmp;
      target[CH.TOP_YAW] += swing * 0.12 * gaitAmp;
      target[CH.TOP_ROLL] += -swing * 0.04 * gaitAmp;
    }
    const lift = (isSmudgeling ? 0.08 : kind === 'spitter' ? 0.07 : 0.16) * Math.min(1, gaitAmp);
    const reach = (isSmudgeling ? 0.09 : kind === 'spitter' ? 0.11 : 0.28) * Math.min(1.2, gaitAmp);
    target[CH.FL_LIFT] = Math.max(0, swing) * lift;
    target[CH.FR_LIFT] = Math.max(0, -swing) * lift;
    target[CH.FL_FWD] = swingCos * reach;
    target[CH.FR_FWD] = -swingCos * reach;
    const armSwing = (isBrute ? 0.35 : 0.55) * Math.min(1.2, gaitAmp);
    target[CH.HL_PITCH] += -swingCos * armSwing;
    target[CH.HR_PITCH] += swingCos * armSwing;
    target[CH.HL_ROLL] += 0.1 * gaitAmp;
    target[CH.HR_ROLL] -= 0.1 * gaitAmp;
  }
  if ((enemy.state === 'idle' || enemy.state === 'wander') && gaitAmp < 0.2) {
    const fidget = Math.sin(time * 0.23) * Math.sin(time * 0.61);
    if (isSmudgeling) {
      target[CH.EXTRA_B] = Math.sin(time * 1.3) * 0.25;
      target[CH.LEAN_Z] += fidget * 0.12;
    } else if (isBrute) {
      target[CH.EXTRA_A] = Math.max(0, Math.sin(time * 0.35)) * 0.12;
      target[CH.LEAN_X] += 0.08;
    } else target[CH.EXTRA_A] = (Math.sin(time * 1.7) * 0.5 + 0.5) * 0.12;
  }
  const stateT = enemy.stateT;
  switch (enemy.state) {
    case 'notice': {
      const k = stateT / Math.max(0.1, enemy.def.noticeTime);
      const startle = 1 - smoothstep(0, 0.7, k);
      const flinch = 1 - smoothstep(0, 0.25, k);
      target[CH.EYE_OPEN] = 1 + 0.55 * startle;
      target[CH.MASK_PUSH] = 0.07 * startle * enemy.def.size ** 0.5;
      target[CH.MASK_PITCH] = -0.25 * startle;
      target[CH.HL_PITCH] = 2.5 * startle + 0.1;
      target[CH.HR_PITCH] = 2.5 * startle + 0.1;
      target[CH.HL_ROLL] = 0.8 * startle;
      target[CH.HR_ROLL] = -0.8 * startle;
      target[CH.SQUASH] += 0.22 * startle;
      target[CH.WIDTH] = 1 - 0.08 * startle;
      target[CH.LEAN_X] = -0.25 * flinch;
      target[CH.ANGER] = smoothstep(0.35, 0.9, k);
      target[CH.MOUTH] = 0.8 * startle;
      target[CH.EXTRA_A] = isBrute ? 0.85 * startle : kind === 'spitter' ? 0.5 * startle : -0.6 * flinch;
      if (enemy.ex) {
        const roar = smoothstep(0.2, 0.45, k) * (1 - smoothstep(0.85, 1, k));
        target[CH.EYE_OPEN] = 1.25;
        target[CH.ANGER] = 1;
        target[CH.GLOW] = 0.5 + 0.9 * roar;
        target[CH.MOUTH] = Math.max(target[CH.MOUTH], roar);
        target[CH.HL_PITCH] = 0.4 + 1.9 * roar;
        target[CH.HR_PITCH] = 0.4 + 1.9 * roar;
        target[CH.HL_ROLL] = 1 * roar;
        target[CH.HR_ROLL] = -1 * roar;
        target[CH.LEAN_X] = -0.32 * roar;
        target[CH.MASK_PITCH] = -0.35 * roar;
        target[CH.SQUASH] = 1 + 0.12 * roar;
        target[CH.WIDTH] = 1 + 0.08 * roar;
        target[CH.TOP_X] = Math.sin(time * 47) * 0.02 * roar;
        target[CH.EXTRA_A] = isBrute ? 0.9 * roar : kind === 'spitter' ? 0.8 * roar : -0.5 * roar;
        target[CH.CRACK] = isBrute ? 0.8 * roar : 0;
      }
      break;
    }
    case 'telegraph':
      poseTelegraph(enemy, target, stateT, time);
      break;
    case 'attack':
      poseAttack(enemy, target, stateT, time);
      break;
    case 'recover':
      poseRecover(enemy, target, stateT, time);
      break;
    case 'stagger': {
      const k = clamp(stateT / 0.4, 0, 1);
      const reel = 1 - smoothstep(0.3, 1, k);
      target[CH.LEAN_X] = -0.45 * reel;
      target[CH.EYE_OPEN] = 0.25 + 0.75 * (1 - reel);
      target[CH.ANGER] = 0;
      target[CH.HL_PITCH] = 1.4 * reel;
      target[CH.HR_PITCH] = 1.1 * reel;
      target[CH.HL_ROLL] = 0.6 * reel;
      target[CH.HR_ROLL] = -0.6 * reel;
      target[CH.MASK_ROLL] = 0.25 * reel * (enemy.seed > 0.5 ? 1 : -1);
      target[CH.MOUTH] = 0.5 * reel;
      break;
    }
    case 'flee':
      target[CH.MASK_YAW] = clamp(lookYaw, -1.4, 1.4);
      target[CH.HL_PITCH] = 1.6 + Math.sin(time * 18) * 0.5;
      target[CH.HR_PITCH] = 1.6 - Math.sin(time * 18) * 0.5;
      target[CH.HL_ROLL] = 0.6;
      target[CH.HR_ROLL] = -0.6;
      target[CH.EYE_OPEN] = 1.3;
      target[CH.MOUTH] = 0.5;
      target[CH.ANGER] = 0;
      break;
    case 'search':
      target[CH.MASK_YAW] = Math.sin(stateT * 1.8) * 0.9;
      target[CH.MASK_ROLL] = 0.2 * Math.sin(stateT * 0.9);
      target[CH.ANGER] = 0.3;
      break;
    case 'dying': {
      const dur = enemy.ex ? enemy.ex.deathDur : enemy.deathDur;
      const k = clamp(stateT / dur, 0, 1);
      const shake = enemy.ex ? 0.05 + 0.1 * k : enemy.tier === 2 ? 0.04 + 0.09 * k : 0.05;
      target[CH.SQUASH] = 1 + 0.4 * smoothstep(0, 0.8, k);
      target[CH.WIDTH] = 1 - 0.12 * k;
      target[CH.TOP_X] = Math.sin(time * 61) * shake * k;
      target[CH.TOP_Z] = Math.cos(time * 53) * shake * k;
      if (enemy.ex) {
        target[CH.LEAN_X] = -0.3 * smoothstep(0, 0.4, k) + Math.sin(time * 37) * 0.05 * k;
        target[CH.TOP_ROLL] = Math.sin(time * 29) * 0.12 * k;
        target[CH.MASK_ROLL] = Math.sin(time * 23) * 0.25 * k;
      }
      target[CH.HL_PITCH] = 2.8;
      target[CH.HR_PITCH] = 2.8;
      target[CH.HL_ROLL] = 0.8;
      target[CH.HR_ROLL] = -0.8;
      target[CH.EYE_OPEN] = 1.45;
      target[CH.GLOW] = 1;
      target[CH.MOUTH] = 1;
      target[CH.ANGER] = 0;
      target[CH.MASK_PITCH] = -0.35;
      break;
    }
    case 'sink':
      target[CH.HL_PITCH] = 2.7 + Math.sin(time * 14) * 0.4;
      target[CH.HR_PITCH] = 2.7 - Math.sin(time * 14) * 0.4;
      target[CH.EYE_OPEN] = 1.4;
      target[CH.MOUTH] = 1;
      target[CH.MASK_PITCH] = -0.4;
      break;
    case 'rise':
      target[CH.EYE_OPEN] = smoothstep(0.5, 0.9, enemy.rise);
      break;
    case 'fall':
      target[CH.HL_PITCH] = 2.6 + Math.sin(time * 19) * 0.6;
      target[CH.HR_PITCH] = 2.6 - Math.sin(time * 17) * 0.6;
      target[CH.HL_ROLL] = 1;
      target[CH.HR_ROLL] = -1;
      target[CH.EYE_OPEN] = 1.5;
      target[CH.MOUTH] = 1;
      target[CH.ANGER] = 0;
      target[CH.MASK_PITCH] = -0.4;
      target[CH.SQUASH] = 1.1;
      target[CH.FL_LIFT] = target[CH.FR_LIFT] = 0.06;
  }
  if (enemy.has('rooted')) {
    const struggle = Math.sin(time * 9.5);
    target[CH.TOP_ROLL] = struggle * 0.16;
    target[CH.TOP_PITCH] = Math.sin(time * 7.1) * 0.1;
    target[CH.LEAN_Z] = struggle * 0.05;
    target[CH.HL_PITCH] = 1.2 + Math.sin(time * 11) * 0.5;
    target[CH.HR_PITCH] = 1.2 - Math.sin(time * 11) * 0.5;
    target[CH.EYE_OPEN] = 1.25;
    target[CH.ANGER] = 0.2;
    target[CH.MOUTH] = 0.35;
    target[CH.FL_LIFT] = target[CH.FR_LIFT] = 0;
  }
  if (enemy.has('launched')) {
    target[CH.HL_PITCH] = 2.2 + Math.sin(time * 21) * 0.7;
    target[CH.HR_PITCH] = 2.2 - Math.sin(time * 19) * 0.7;
    target[CH.HL_ROLL] = 0.9;
    target[CH.HR_ROLL] = -0.9;
    target[CH.EYE_OPEN] = 1.4;
    target[CH.MOUTH] = 0.9;
    target[CH.ANGER] = 0;
    target[CH.SQUASH] = 1 + clamp(_localVel.y * 0.02, -0.15, 0.2);
    target[CH.FL_LIFT] = 0.05;
    target[CH.FR_LIFT] = 0.05;
  }
  if (enemy.has('burning') && enemy.controllable && enemy.state !== 'dying') {
    target[CH.HL_PITCH] = 2.6 + Math.sin(time * 23) * 0.45;
    target[CH.HR_PITCH] = 2.6 - Math.sin(time * 23) * 0.45;
    target[CH.HL_ROLL] = 0.6;
    target[CH.HR_ROLL] = -0.6;
    target[CH.EYE_OPEN] = 1.35;
    target[CH.MOUTH] = 1;
    target[CH.ANGER] = 0;
    target[CH.MASK_ROLL] = Math.sin(time * 17) * 0.18;
    target[CH.LEAN_X] += 0.15;
  }
  if (!enemy.grounded && !enemy.has('launched') && enemy.state !== 'attack') {
    target[CH.SQUASH] += clamp(_localVel.y * 0.025, -0.12, 0.18);
    target[CH.FL_LIFT] = target[CH.FR_LIFT] = 0.03;
  }
  if (enemy.ex && enemy.alive && enemy.controllable) {
    if (enemy.alerted) target[CH.ANGER] = Math.max(target[CH.ANGER], 0.95);
    target[CH.GLOW] = Math.max(target[CH.GLOW], 0.2);
  }
  if (enemy.slipT > 0 && enemy.controllable) {
    const flail = Math.sin(time * 15);
    target[CH.HL_PITCH] = 1.8 + flail * 0.8;
    target[CH.HR_PITCH] = 1.8 - flail * 0.8;
    target[CH.HL_ROLL] = 1;
    target[CH.HR_ROLL] = -1;
    target[CH.LEAN_Z] += flail * 0.12;
    target[CH.EYE_OPEN] = 1.3;
  }
  enemy.blinkT -= dt;
  if (enemy.blinkT <= 0) {
    enemy.blinkT = 1.8 + ((enemy.seed * 97.3 + frame.time * 0.37) % 1) * 3.5;
    enemy.blink = 0.13;
  }
  if (enemy.blink > 0) {
    enemy.blink -= dt;
    if (enemy.state !== 'telegraph' && enemy.state !== 'dying') target[CH.EYE_OPEN] *= 0.08;
  }
  if (!enemy.has('frozen')) anim.step(dt);
}
function poseTelegraph(enemy, target, stateT, time) {
  const kind = enemy.kind;
  const attack = enemy.attack;
  const windup = enemy.windup > 0 ? enemy.windup : attack ? ATTACKS[attack].windup : 0.6;
  if (attack === 'charge') {
    const k = clamp(stateT / windup, 0, 1);
    const ramp = smoothstep(0, 0.35, k);
    const paw = Math.sin(stateT * 15);
    target[CH.LEAN_X] = 0.45 * ramp;
    target[CH.TOP_PITCH] = 0.22 * ramp;
    target[CH.SQUASH] = 1 - 0.1 * ramp;
    target[CH.WIDTH] = 1 + 0.07 * ramp;
    target[CH.HL_PITCH] = -0.75 * ramp + paw * 0.12 * ramp;
    target[CH.HR_PITCH] = -0.75 * ramp - paw * 0.12 * ramp;
    target[CH.HL_ROLL] = 0.35 * ramp;
    target[CH.HR_ROLL] = -0.35 * ramp;
    target[CH.FL_LIFT] = Math.max(0, paw) * 0.14 * ramp;
    target[CH.FR_LIFT] = Math.max(0, -paw) * 0.14 * ramp;
    target[CH.FL_FWD] = -Math.max(0, paw) * 0.2 * ramp;
    target[CH.FR_FWD] = -Math.max(0, -paw) * 0.2 * ramp;
    target[CH.MASK_PITCH] = -0.3 * ramp;
    target[CH.EYE_OPEN] = 1.15;
    target[CH.ANGER] = 1;
    target[CH.GLOW] = smoothstep(0.1, 0.6, k) * (0.85 + 0.15 * Math.sin(stateT * 30));
    target[CH.CRACK] = smoothstep(0.1, 0.9, k);
    target[CH.EXTRA_A] = 0.4 * ramp;
    target[CH.TOP_X] = Math.sin(time * 51) * 0.025 * smoothstep(0.6, 1, k);
    return;
  }
  if (attack === 'spikes' || attack === 'thorns') {
    const k = clamp(stateT / windup, 0, 1);
    const raise = smoothstep(0, 0.4, k);
    const slam = smoothstep(0.7, 1, k);
    target[CH.HL_PITCH] = 2.9 * raise - 1.2 * slam;
    target[CH.HR_PITCH] = 2.9 * raise - 1.2 * slam;
    target[CH.HL_ROLL] = 0.45 * raise;
    target[CH.HR_ROLL] = -0.45 * raise;
    target[CH.LEAN_X] = -0.28 * raise + 0.3 * slam;
    target[CH.MASK_PITCH] = -0.45 * raise + 0.4 * slam;
    target[CH.SQUASH] = 1 + 0.1 * raise - 0.12 * slam;
    target[CH.EXTRA_A] = 0.6 * raise;
    target[CH.EYE_OPEN] = 1.2;
    target[CH.ANGER] = 1;
    target[CH.GLOW] = 0.4 + 0.8 * smoothstep(0.2, 0.8, k);
    target[CH.TOP_X] = Math.sin(time * 43) * 0.02 * raise;
    return;
  }
  if (attack === 'nova' || attack === 'galering' || attack === 'windride') {
    const k = clamp(stateT / windup, 0, 1);
    const ramp = smoothstep(0, 0.5, k);
    target[CH.SQUASH] = 1 - 0.18 * ramp;
    target[CH.WIDTH] = 1 + 0.1 * ramp;
    target[CH.LEAN_X] = 0.15 * ramp;
    target[CH.HL_PITCH] = 1.3 * ramp;
    target[CH.HR_PITCH] = 1.3 * ramp;
    target[CH.HL_ROLL] = -0.7 * ramp;
    target[CH.HR_ROLL] = 0.7 * ramp;
    target[CH.MASK_PITCH] = 0.25 * ramp;
    target[CH.EXTRA_A] = 0.9 * ramp + Math.sin(stateT * 40) * 0.08 * ramp;
    target[CH.TOP_X] = Math.sin(time * 59) * 0.03 * ramp;
    target[CH.TOP_Z] = Math.cos(time * 47) * 0.03 * ramp;
    target[CH.EYE_OPEN] = 0.6 + 0.7 * k;
    target[CH.ANGER] = 1;
    target[CH.GLOW] = 0.3 + 1 * k;
    return;
  }
  if (kind === 'smudgeling') {
    const k = clamp(stateT / windup, 0, 1);
    const crouch = smoothstep(0, 0.3, k);
    target[CH.SQUASH] = 1 - 0.15 * crouch;
    target[CH.WIDTH] = 1 + 0.05 * crouch;
    target[CH.LEAN_X] = -0.24 * crouch;
    target[CH.TOP_Z] = -0.05 * crouch;
    target[CH.TOP_PITCH] = -0.1 * crouch;
    const shiver = smoothstep(0.2, 0.9, k);
    target[CH.TOP_ROLL] = Math.sin(stateT * 44) * 0.2 * shiver;
    target[CH.LEAN_Z] = Math.sin(stateT * 44 + 1) * 0.07 * shiver;
    target[CH.HL_PITCH] = 2 * crouch;
    target[CH.HR_PITCH] = 2.1 * crouch;
    target[CH.HL_ROLL] = 0.35 * crouch;
    target[CH.HR_ROLL] = -0.35 * crouch;
    target[CH.EYE_OPEN] = 0.8 + 0.35 * k;
    target[CH.ANGER] = 1;
    target[CH.GLOW] = smoothstep(0.1, 0.5, k) * (0.75 + 0.25 * Math.sin(stateT * 38));
    target[CH.EXTRA_A] = -0.9 * crouch;
    target[CH.MASK_PITCH] = 0.12 * crouch;
    target[CH.MOUTH] = 0.25 * shiver;
  } else if (kind === 'spitter') {
    const k = clamp(stateT / windup, 0, 1);
    const inflate = smoothstep(0, 0.9, k);
    target[CH.EXTRA_A] = 1.05 * inflate + Math.sin(stateT * 30) * 0.06 * inflate;
    target[CH.LEAN_X] = -0.32 * inflate;
    target[CH.MASK_PITCH] = -0.35 * inflate;
    target[CH.SQUASH] = 1 + 0.08 * inflate;
    target[CH.WIDTH] = 1 + 0.12 * inflate;
    target[CH.HL_ROLL] = 0.9 * inflate;
    target[CH.HR_ROLL] = -0.9 * inflate;
    target[CH.HL_PITCH] = 0.8 * inflate;
    target[CH.HR_PITCH] = 0.8 * inflate;
    target[CH.EYE_OPEN] = 0.7 + 0.5 * inflate;
    target[CH.ANGER] = 0.9;
    target[CH.GLOW] = smoothstep(0.2, 0.7, k) * (0.8 + 0.2 * Math.sin(stateT * 30));
  } else if (attack === 'slam' || attack === 'rootgrab') {
    const k = clamp(stateT / windup, 0, 1);
    const raise = smoothstep(0, 0.55, k);
    target[CH.HL_PITCH] = 2.95 * raise;
    target[CH.HR_PITCH] = 2.95 * raise;
    target[CH.HL_ROLL] = -0.25 * raise;
    target[CH.HR_ROLL] = 0.25 * raise;
    target[CH.SQUASH] = 1 + 0.1 * raise;
    target[CH.LEAN_X] = -0.26 * raise;
    target[CH.TOP_PITCH] = -0.12 * raise;
    target[CH.EXTRA_A] = 0.55 * smoothstep(0.1, 0.5, k);
    target[CH.EYE_OPEN] = 1.1;
    target[CH.ANGER] = 1;
    const tremble = smoothstep(0.6, 1, k);
    target[CH.TOP_X] = Math.sin(time * 57) * 0.03 * tremble;
    target[CH.GLOW] = smoothstep(0.1, 0.6, k) * (0.8 + 0.2 * Math.sin(stateT * 24));
    target[CH.CRACK] = smoothstep(0.05, 0.8, k) * (0.85 + 0.15 * Math.sin(stateT * 24));
  } else {
    const k = clamp(stateT / windup, 0, 1);
    const wind = smoothstep(0, 0.6, k);
    target[CH.TOP_YAW] = 0.75 * wind;
    target[CH.LEAN_Z] = 0.1 * wind;
    target[CH.HR_PITCH] = 1.3 * wind;
    target[CH.HR_ROLL] = 0.9 * wind;
    target[CH.HR_X] = 0.35 * wind;
    target[CH.HL_PITCH] = 0.3 * wind;
    target[CH.HL_ROLL] = 0.3 * wind;
    target[CH.EYE_OPEN] = 1;
    target[CH.ANGER] = 1;
    target[CH.EXTRA_A] = 0.35 * wind;
    target[CH.GLOW] = smoothstep(0.1, 0.6, k) * (0.8 + 0.2 * Math.sin(stateT * 30));
    target[CH.CRACK] = 0.5 * wind;
  }
}
function poseAttack(enemy, target, stateT, time) {
  const kind = enemy.kind;
  const attack = enemy.attack;
  if (attack === 'charge') {
    const gallop = Math.sin(stateT * 17);
    target[CH.LEAN_X] = 0.55;
    target[CH.TOP_PITCH] = 0.25;
    target[CH.HL_PITCH] = -0.5 + gallop * 0.7;
    target[CH.HR_PITCH] = -0.5 - gallop * 0.7;
    target[CH.HL_ROLL] = 0.3;
    target[CH.HR_ROLL] = -0.3;
    target[CH.MASK_PITCH] = -0.35;
    target[CH.EXTRA_A] = 0.7;
    target[CH.EYE_OPEN] = 1.25;
    target[CH.ANGER] = 1;
    target[CH.GLOW] = 1;
    target[CH.CRACK] = 1;
    target[CH.SQUASH] = 0.95;
    return;
  }
  if (attack === 'spikes' || attack === 'thorns') {
    const k = clamp(stateT / 0.3, 0, 1);
    target[CH.HL_PITCH] = 0.5 - 0.4 * k;
    target[CH.HR_PITCH] = 0.5 - 0.4 * k;
    target[CH.HL_ROLL] = 0.9;
    target[CH.HR_ROLL] = -0.9;
    target[CH.LEAN_X] = 0.35;
    target[CH.MASK_PITCH] = 0.35;
    target[CH.SQUASH] = 0.86;
    target[CH.WIDTH] = 1.1;
    target[CH.EYE_OPEN] = 1.3;
    target[CH.ANGER] = 1;
    target[CH.GLOW] = 1.2;
    return;
  }
  if (attack === 'nova' || attack === 'galering') {
    const k = clamp(stateT / 0.3, 0, 1);
    target[CH.SQUASH] = 1.22 - 0.1 * k;
    target[CH.WIDTH] = 1.15;
    target[CH.HL_PITCH] = 1.8;
    target[CH.HR_PITCH] = 1.8;
    target[CH.HL_ROLL] = 1.4;
    target[CH.HR_ROLL] = -1.4;
    target[CH.LEAN_X] = -0.25;
    target[CH.MASK_PITCH] = -0.3;
    target[CH.EXTRA_A] = -0.2;
    target[CH.EYE_OPEN] = 1.4;
    target[CH.MOUTH] = 1;
    target[CH.ANGER] = 1;
    target[CH.GLOW] = 1.4;
    return;
  }
  if (attack === 'pound' || attack === 'windride') {
    const rising = +(enemy.actualVel.y > 0);
    const falling = clamp(-enemy.actualVel.y / 12, 0, 1);
    target[CH.HL_PITCH] = 2.6 * rising + 1.2 * (1 - rising);
    target[CH.HR_PITCH] = 2.6 * rising + 1.2 * (1 - rising);
    target[CH.HL_ROLL] = 0.8 * rising - 0.3 * (1 - rising);
    target[CH.HR_ROLL] = -0.8 * rising + 0.3 * (1 - rising);
    target[CH.SQUASH] = 1.12 * rising + (0.88 - 0.1 * falling) * (1 - rising);
    target[CH.WIDTH] = 1 + 0.08 * falling;
    target[CH.LEAN_X] = 0.3 * falling;
    target[CH.EXTRA_A] = -0.8;
    target[CH.EYE_OPEN] = 1.3;
    target[CH.MOUTH] = 0.6 + 0.4 * falling;
    target[CH.ANGER] = 1;
    target[CH.GLOW] = 0.6 + 0.6 * falling;
    target[CH.FL_LIFT] = target[CH.FR_LIFT] = 0.06;
    return;
  }
  if (kind === 'smudgeling') {
    const k = clamp(stateT / (ATTACKS.lunge.strike + ATTACKS.lunge.active), 0, 1);
    target[CH.SQUASH] = 1.22 - 0.25 * k;
    target[CH.WIDTH] = 0.92;
    target[CH.LEAN_X] = 0.32;
    target[CH.TOP_Z] = 0.06;
    target[CH.HL_PITCH] = 0.9;
    target[CH.HR_PITCH] = 0.7;
    target[CH.HR_ROLL] = 0.5;
    target[CH.HL_ROLL] = -0.5;
    target[CH.MOUTH] = 1;
    target[CH.EYE_OPEN] = 1.15;
    target[CH.ANGER] = 1;
    target[CH.GLOW] = 0.4 * (1 - k);
    target[CH.EXTRA_A] = 0.9;
    target[CH.FL_LIFT] = target[CH.FR_LIFT] = 0.04;
    target[CH.FL_FWD] = -0.08;
    target[CH.FR_FWD] = -0.08;
  } else if (kind === 'spitter') {
    const k = clamp(stateT / 0.25, 0, 1);
    target[CH.EXTRA_A] = -0.25 + 0.25 * k;
    target[CH.LEAN_X] = 0.45 * (1 - k * 0.5);
    target[CH.MASK_PITCH] = 0.25;
    target[CH.MASK_PUSH] = 0.05 * (1 - k);
    target[CH.SQUASH] = 0.9;
    target[CH.HL_ROLL] = 0.3;
    target[CH.HR_ROLL] = -0.3;
    target[CH.HL_PITCH] = 0.8;
    target[CH.HR_PITCH] = 0.8;
    target[CH.EYE_OPEN] = 1.2;
    target[CH.ANGER] = 1;
    target[CH.GLOW] = 0.3 * (1 - k);
  } else if (enemy.attack === 'slam' || enemy.attack === 'rootgrab') {
    target[CH.HL_PITCH] = 1.05;
    target[CH.HR_PITCH] = 1.05;
    target[CH.HL_ROLL] = -0.12;
    target[CH.HR_ROLL] = 0.12;
    target[CH.LEAN_X] = 0.5;
    target[CH.TOP_PITCH] = 0.25;
    target[CH.SQUASH] = 0.84;
    target[CH.WIDTH] = 1.08;
    target[CH.EXTRA_A] = 0.6;
    target[CH.EYE_OPEN] = 1.2;
    target[CH.ANGER] = 1;
    target[CH.GLOW] = 0.6;
    target[CH.CRACK] = 0.8;
  } else {
    target[CH.TOP_YAW] = -0.85;
    target[CH.LEAN_Z] = -0.12;
    target[CH.HR_PITCH] = 1.35;
    target[CH.HR_ROLL] = -1.35;
    target[CH.HR_X] = -0.1;
    target[CH.HL_PITCH] = 0.2;
    target[CH.EXTRA_A] = 0.45;
    target[CH.EYE_OPEN] = 1.1;
    target[CH.ANGER] = 1;
    target[CH.GLOW] = 0.4;
    target[CH.CRACK] = 0.4;
  }
}
function poseRecover(enemy, target, stateT, time) {
  const kind = enemy.kind;
  const attack = enemy.attack;
  const recover = enemy.ex && enemy.ex.recoverT > 0 ? enemy.ex.recoverT : attack ? ATTACKS[attack].recover : 0.6;
  if (attack === 'charge') {
    const k = clamp(stateT / recover, 0, 1);
    const skid = 1 - smoothstep(0, 0.3, k);
    const daze = 1 - smoothstep(0.7, 1, k);
    target[CH.LEAN_X] = -0.3 * skid + 0.3 * daze * (1 - skid);
    target[CH.SQUASH] = 0.92 + Math.sin(time * 9) * 0.035 * daze;
    target[CH.HL_PITCH] = 0.6 * skid + 0.9 * daze * (1 - skid);
    target[CH.HR_PITCH] = 0.6 * skid + 0.9 * daze * (1 - skid);
    target[CH.HL_ROLL] = 0.5;
    target[CH.HR_ROLL] = -0.5;
    target[CH.MOUTH] = 0.5 * daze;
    target[CH.EYE_OPEN] = 1 - 0.4 * daze;
    target[CH.ANGER] = 0.4;
    target[CH.EXTRA_A] = 0.4 * daze * (0.5 + 0.5 * Math.sin(time * 9));
    return;
  }
  if (attack === 'pound') {
    const k = clamp(stateT / recover, 0, 1);
    const impact = 1 - smoothstep(0.2, 0.45, k);
    const daze = 1 - smoothstep(0.75, 1, k);
    target[CH.SQUASH] = 1 - 0.25 * impact - 0.05 * daze;
    target[CH.WIDTH] = 1 + 0.12 * impact;
    target[CH.LEAN_X] = 0.3 * impact;
    target[CH.TOP_ROLL] = Math.sin(time * 5) * 0.2 * daze;
    target[CH.MASK_ROLL] = Math.sin(time * 5 + 1.2) * 0.35 * daze;
    target[CH.EYE_OPEN] = 1 - 0.75 * daze;
    target[CH.ANGER] = 0;
    target[CH.MOUTH] = 0.4 * daze;
    target[CH.HL_PITCH] = 1 * impact + 0.3 * daze;
    target[CH.HR_PITCH] = 1 * impact + 0.3 * daze;
    target[CH.HL_ROLL] = 0.9 * daze;
    target[CH.HR_ROLL] = -0.9 * daze;
    target[CH.EXTRA_B] = Math.sin(time * 5) * 0.5 * daze;
    return;
  }
  if (kind === 'smudgeling') {
    const k = clamp(stateT / recover, 0, 1);
    const sprawl = 1 - smoothstep(0.35, 0.7, k);
    const daze = 1 - smoothstep(0.6, 1, k);
    target[CH.SQUASH] = 1 - 0.2 * sprawl - 0.05 * daze;
    target[CH.WIDTH] = 1 + 0.1 * sprawl;
    target[CH.LEAN_X] = 0.62 * sprawl + 0.08 * daze;
    target[CH.TOP_ROLL] = Math.sin(time * 6) * 0.16 * daze;
    target[CH.MASK_ROLL] = Math.sin(time * 6 + 1.2) * 0.3 * daze;
    target[CH.EYE_OPEN] = 1 - 0.7 * daze;
    target[CH.ANGER] = 0;
    target[CH.MOUTH] = 0.3 * sprawl;
    target[CH.HL_PITCH] = 1.4 * sprawl + 0.2 * daze;
    target[CH.HR_PITCH] = 1.4 * sprawl + 0.2 * daze;
    target[CH.HL_ROLL] = 0.9 * sprawl + 0.4 * daze;
    target[CH.HR_ROLL] = -0.9 * sprawl - 0.4 * daze;
    target[CH.EXTRA_A] = 0.8 * sprawl;
  } else if (kind === 'spitter') {
    const k = clamp(stateT / recover, 0, 1);
    const settle = 1 - smoothstep(0.5, 1, k);
    target[CH.SQUASH] = 1 + Math.sin(time * 16) * 0.035 * settle;
    target[CH.EXTRA_A] = -0.15 * settle;
    target[CH.LEAN_X] = 0.15 * settle;
    target[CH.EYE_OPEN] = 1 - 0.4 * settle;
  } else if (enemy.attack === 'slam' || enemy.attack === 'rootgrab') {
    const k = clamp(stateT / recover, 0, 1);
    const settle = 1 - smoothstep(0.6, 1, k);
    target[CH.HL_PITCH] = 1 * settle;
    target[CH.HR_PITCH] = 1 * settle;
    target[CH.LEAN_X] = 0.42 * settle + 0.05;
    target[CH.TOP_PITCH] = 0.15 * settle;
    target[CH.SQUASH] = 0.9 + 0.1 * (1 - settle) + Math.sin(time * 7) * 0.02 * settle;
    target[CH.EYE_OPEN] = 1 - 0.5 * settle;
    target[CH.ANGER] = 0.3;
    target[CH.EXTRA_A] = 0.25 * settle * (0.5 + 0.5 * Math.sin(time * 7));
    target[CH.TOP_ROLL] = Math.sin(time * 3) * 0.05 * settle;
  } else {
    const k = clamp(stateT / recover, 0, 1);
    const settle = 1 - smoothstep(0.3, 1, k);
    target[CH.TOP_YAW] = -0.4 * settle;
    target[CH.HR_ROLL] = -0.6 * settle;
    target[CH.HR_PITCH] = 0.4 * settle;
    target[CH.EYE_OPEN] = 1 - 0.2 * settle;
  }
}
function wrapYaw(a) {
  for (; a > Math.PI;) a -= TAU;
  for (; a < -Math.PI;) a += TAU;
  return a;
}
