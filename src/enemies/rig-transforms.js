/**
 * Turns an enemy's animated pose channels into bone matrices for its parts (body, top, mask, hands, feet and the kind-specific extra), packs them with the shading parameters into the instance texture, and maps rig points such as the mouth or fists to world space.
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { clamp } from '../core/math.js';
import { CH } from './enemy.js';
import { BONE } from './models.js';
import { PARAM_TEXEL, writeBone } from './renderer.js';
const _baseMat = new Matrix4();
const _topMat = new Matrix4();
const _maskMat = new Matrix4();
const _localMat = new Matrix4();
const _partMat = new Matrix4();
const _feetMat = new Matrix4();
const _poseQuat = new Quaternion();
const _poseEuler = new Euler(0, 0, 0, 'YXZ');
const _posePos = new Vector3();
const _poseScale = new Vector3();
const _leanMat = new Matrix4();
function pivotMatrix(out, pivot, dx, dy, dz, pitch, yaw, roll, sx = 1, sy = 1, sz = 1) {
  _poseEuler.set(pitch, yaw, roll, 'YXZ');
  _poseQuat.setFromEuler(_poseEuler);
  out.compose(_posePos.set(pivot.x + dx, pivot.y + dy, pivot.z + dz), _poseQuat, _poseScale.set(sx, sy, sz));
  const elements = out.elements;
  elements[12] -= elements[0] * pivot.x + elements[4] * pivot.y + elements[8] * pivot.z;
  elements[13] -= elements[1] * pivot.x + elements[5] * pivot.y + elements[9] * pivot.z;
  elements[14] -= elements[2] * pivot.x + elements[6] * pivot.y + elements[10] * pivot.z;
  return out;
}
function baseMatrix(enemy, out) {
  const pose = enemy.anim.x;
  const sy = Math.max(0.3, pose[CH.SQUASH]) * Math.max(0.02, enemy.rise);
  const sxz = Math.max(0.5, pose[CH.WIDTH]) / Math.sqrt(Math.max(0.3, pose[CH.SQUASH]));
  const pivotY = enemy.tumble === 0 ? 0 : enemy.height * 0.5;
  const scale = enemy.scale;
  _poseEuler.set(0, enemy.facing, 0, 'YXZ');
  _poseQuat.setFromEuler(_poseEuler);
  out.compose(
    _posePos.set(enemy.position.x, enemy.position.y + pose[CH.BOB] * scale + pivotY, enemy.position.z),
    _poseQuat,
    _poseScale.set(1, 1, 1),
  );
  if (enemy.tumble !== 0) {
    _leanMat.makeRotationX(enemy.tumble);
    out.multiply(_leanMat);
    _leanMat.makeRotationZ(enemy.tumbleAxis * enemy.tumble * 0.3);
    out.multiply(_leanMat);
  }
  _poseEuler.set(pose[CH.LEAN_X], 0, pose[CH.LEAN_Z], 'YXZ');
  _poseQuat.setFromEuler(_poseEuler);
  _leanMat.compose(_posePos.set(0, -pivotY, 0), _poseQuat, _poseScale.set(sxz * scale, sy * scale, sxz * scale));
  out.multiply(_leanMat);
  return out;
}
export function topMatrix(enemy, rig, out) {
  const pose = enemy.anim.x;
  baseMatrix(enemy, _baseMat);
  pivotMatrix(
    _localMat,
    rig.pivots[BONE.top],
    pose[CH.TOP_X],
    pose[CH.TOP_Y],
    pose[CH.TOP_Z],
    pose[CH.TOP_PITCH],
    pose[CH.TOP_YAW],
    pose[CH.TOP_ROLL],
  );
  return out.multiplyMatrices(_baseMat, _localMat);
}
function maskMatrix(enemy, rig, out) {
  const pose = enemy.anim.x;
  topMatrix(enemy, rig, _topMat);
  const pivot = rig.pivots[BONE.mask];
  pivotMatrix(
    _localMat,
    pivot,
    0,
    0,
    pose[CH.MASK_PUSH],
    pose[CH.MASK_PITCH],
    pose[CH.MASK_YAW] - pose[CH.TOP_YAW],
    pose[CH.MASK_ROLL],
  );
  return out.multiplyMatrices(_topMat, _localMat);
}
function handMatrix(enemy, rig, side, out) {
  const pose = enemy.anim.x;
  topMatrix(enemy, rig, _topMat);
  handLocal(enemy, rig, side, pose);
  return out.multiplyMatrices(_topMat, _localMat);
}
function handLocal(enemy, rig, side, pose) {
  const part = side === 0 ? BONE.handL : BONE.handR;
  const pitchCh = side === 0 ? CH.HL_PITCH : CH.HR_PITCH;
  const rollCh = side === 0 ? CH.HL_ROLL : CH.HR_ROLL;
  const posCh = side === 0 ? CH.HL_X : CH.HR_X;
  pivotMatrix(
    _localMat,
    rig.pivots[part],
    pose[posCh],
    pose[posCh + 1],
    pose[posCh + 2],
    -pose[pitchCh],
    0,
    pose[rollCh],
  );
}
export function writeInstance(enemy, rig, data, base) {
  const pose = enemy.anim.x;
  baseMatrix(enemy, _baseMat);
  writeBone(data, base + BONE.base * 12, _baseMat);
  pivotMatrix(
    _localMat,
    rig.pivots[BONE.top],
    pose[CH.TOP_X],
    pose[CH.TOP_Y],
    pose[CH.TOP_Z],
    pose[CH.TOP_PITCH],
    pose[CH.TOP_YAW],
    pose[CH.TOP_ROLL],
  );
  _topMat.multiplyMatrices(_baseMat, _localMat);
  writeBone(data, base + BONE.top * 12, _topMat);
  const maskPivot = rig.pivots[BONE.mask];
  pivotMatrix(
    _localMat,
    maskPivot,
    0,
    0,
    pose[CH.MASK_PUSH],
    pose[CH.MASK_PITCH],
    pose[CH.MASK_YAW] - pose[CH.TOP_YAW],
    pose[CH.MASK_ROLL],
  );
  _maskMat.multiplyMatrices(_topMat, _localMat);
  writeBone(data, base + BONE.mask * 12, _maskMat);
  for (
    let side = 0;
    side < 2 &&
    (handLocal(enemy, rig, side, pose),
    _partMat.multiplyMatrices(_topMat, _localMat),
    writeBone(data, base + (side === 0 ? BONE.handL : BONE.handR) * 12, _partMat),
    side !== 1);
    side += 1
  );
  if (!enemy.grounded || enemy.tumble !== 0 || enemy.state === 'sink') _feetMat.copy(_baseMat);
  else {
    _poseEuler.set(0, enemy.facing, 0, 'YXZ');
    _poseQuat.setFromEuler(_poseEuler);
    const rise = Math.max(0.02, enemy.rise);
    _feetMat.compose(
      _posePos.set(enemy.position.x, enemy.position.y, enemy.position.z),
      _poseQuat,
      _poseScale.set(enemy.scale, rise * enemy.scale, enemy.scale),
    );
  }
  for (let side = 0; side < 2; side++) {
    const part = side === 0 ? BONE.footL : BONE.footR;
    const liftCh = side === 0 ? CH.FL_LIFT : CH.FR_LIFT;
    const lift = pose[liftCh];
    const fwd = pose[liftCh + 1];
    pivotMatrix(_localMat, rig.pivots[part], 0, Math.max(0, lift), fwd, -lift * 2.5, 0, 0);
    _partMat.multiplyMatrices(_feetMat, _localMat);
    writeBone(data, base + part * 12, _partMat);
  }
  const extraPivot = rig.pivots[BONE.extra];
  if (enemy.kind === 'smudgeling') {
    pivotMatrix(_localMat, extraPivot, 0, 0, 0, pose[CH.EXTRA_A] * 0.6, 0, pose[CH.EXTRA_B] + pose[CH.TOP_X] * -3);
    _partMat.multiplyMatrices(_topMat, _localMat);
  } else if (enemy.kind === 'spitter') {
    const sac = Math.max(0.4, 1 + pose[CH.EXTRA_A]);
    pivotMatrix(_localMat, extraPivot, 0, 0, (sac - 1) * 0.1, 0, 0, 0, sac, sac * 0.95, sac);
    _partMat.multiplyMatrices(_topMat, _localMat);
  } else {
    pivotMatrix(_localMat, extraPivot, 0, -pose[CH.EXTRA_A] * 0.04, 0, pose[CH.EXTRA_A] * 0.9, 0, 0);
    _partMat.multiplyMatrices(_maskMat, _localMat);
  }
  writeBone(data, base + BONE.extra * 12, _partMat);
  const params = base + PARAM_TEXEL * 4;
  data[params] = clamp(enemy.flash, 0, 1);
  data[params + 1] = clamp(enemy.frozenVis, 0, 1);
  data[params + 2] = clamp(enemy.charr, 0, 1);
  data[params + 3] = clamp(enemy.deathT, 0, 1);
  data[params + 4] = clamp(pose[CH.GLOW], 0, 1.5);
  data[params + 5] = clamp(pose[CH.EYE_OPEN], 0.02, 1.6);
  data[params + 6] = clamp(pose[CH.ANGER], 0, 1);
  data[params + 7] = clamp(pose[CH.MOUTH], 0, 1);
  data[params + 8] = clamp(enemy.lookYaw - pose[CH.MASK_YAW], -1, 1) * 1.5;
  data[params + 9] = clamp(-enemy.lookPitch * 2, -1, 1);
  data[params + 10] = clamp(Math.max(pose[CH.CRACK], enemy.crack), 0, 1.2);
  data[params + 11] = enemy.kind === 'spitter' ? clamp(pose[CH.EXTRA_A] * 0.8, 0, 1.2) : 0;
  data[params + 12] = enemy.coat.r;
  data[params + 13] = enemy.coat.g;
  data[params + 14] = enemy.coat.b;
  data[params + 15] = clamp(enemy.coatAmt, 0, 1);
  data[params + 16] = enemy.seed;
  data[params + 17] = clamp(enemy.fade, 0, 1);
  data[params + 18] = clamp(1 - enemy.health / enemy.maxHealth, 0, 1);
  data[params + 19] = enemy.alerted ? 0.15 : 0;
  const ex = enemy.ex;
  if (ex) {
    data[params + 20] = ex.color.r;
    data[params + 21] = ex.color.g;
    data[params + 22] = ex.color.b;
    data[params + 23] = 1;
    data[params + 24] = clamp(ex.surge, 0, 2);
    data[params + 25] = clamp(ex.absorb, 0, 1.5);
    data[params + 26] = clamp(ex.weak, 0, 1.5);
  } else {
    data[params + 20] = data[params + 21] = data[params + 22] = data[params + 23] = 0;
    data[params + 24] = data[params + 25] = data[params + 26] = 0;
  }
  data[params + 27] = enemy.scale;
  const storm = enemy.tier === 2 && !ex;
  data[params + 28] = +!!storm;
  data[params + 29] = storm ? clamp(enemy.crackle, 0, 2) : 0;
  data[params + 30] = storm && enemy.state === 'dying' ? clamp(enemy.deathT, 0, 1) : 0;
  data[params + 31] = ex && ex.style === 'galecaller' ? 2 : +!!storm;
}
export function partToWorld(enemy, rig, part, point, out) {
  if (part === BONE.mask) maskMatrix(enemy, rig, _partMat);
  else if (part === BONE.handL || part === BONE.handR) handMatrix(enemy, rig, part === BONE.handL ? 0 : 1, _partMat);
  else if (part === BONE.top) topMatrix(enemy, rig, _partMat);
  else baseMatrix(enemy, _partMat);
  return out.copy(point).applyMatrix4(_partMat);
}
