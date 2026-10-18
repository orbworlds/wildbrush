/**
 * Greymaw's procedural pose: 45 spring-driven channels (lean, chest, head, mask, jaw, fist targets, wrists, mane and brush sway, eye glow) composed each frame into the 14 bone matrices, with two-bone arm IK and helpers for bone, mask, mouth and crystal positions in the world.
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { clamp, SpringBank } from './math.js';
import { ARM, BONE } from './model.js';
export const CH = {
  LEAN_P: 0,
  LEAN_R: 1,
  TWIST: 2,
  CHEST_P: 3,
  CHEST_R: 4,
  CHEST_Y: 5,
  CHEST_OX: 6,
  CHEST_OY: 7,
  CHEST_OZ: 8,
  SQUASH: 9,
  WIDTH: 10,
  HEAD_P: 11,
  HEAD_Y: 12,
  HEAD_R: 13,
  MASK_PUSH: 14,
  MASK_P: 15,
  MASK_R: 16,
  JAW: 17,
  LFX: 18,
  LFY: 19,
  LFZ: 20,
  RFX: 21,
  RFY: 22,
  RFZ: 23,
  LP_UP: 24,
  LP_BACK: 25,
  RP_UP: 26,
  RP_BACK: 27,
  LW_P: 28,
  LW_R: 29,
  RW_P: 30,
  RW_R: 31,
  LF_S: 32,
  RF_S: 33,
  MANE_X: 34,
  MANE_Z: 35,
  BRUSH_X: 36,
  BRUSH_Z: 37,
  EYE: 38,
  ANGER: 39,
  GLOW: 40,
  MOUTH: 41,
  GLOW_L: 42,
  GLOW_R: 43,
  SINK: 44,
};
const CH_COUNT = 45;
const _poseEuler = new Euler(0, 0, 0, 'YXZ');
const _poseQuat = new Quaternion();
const _composePos = new Vector3();
const _composeScale = new Vector3();
const _localMat = new Matrix4();
const _wristMat = new Matrix4();
const _limbRestInv = new Matrix4();
const _basisMat = new Matrix4();
const _poseTmp = new Vector3();
const _armLocal = new Vector3();
const _armTarget = new Vector3();
const _armDir = new Vector3();
const _armPole = new Vector3();
function composePivot(out, pivot, ox, oy, oz, pitch, yaw, roll, sx = 1, sy = 1, sz = 1) {
  _poseEuler.set(pitch, yaw, roll, 'YXZ');
  _poseQuat.setFromEuler(_poseEuler);
  out.compose(_composePos.set(pivot.x + ox, pivot.y + oy, pivot.z + oz), _poseQuat, _composeScale.set(sx, sy, sz));
  const elements = out.elements;
  elements[12] -= elements[0] * pivot.x + elements[4] * pivot.y + elements[8] * pivot.z;
  elements[13] -= elements[1] * pivot.x + elements[5] * pivot.y + elements[9] * pivot.z;
  elements[14] -= elements[2] * pivot.x + elements[6] * pivot.y + elements[10] * pivot.z;
  return out;
}
_limbRestInv.makeBasis(new Vector3(-1, 0, 0), new Vector3(0, -1, 0), new Vector3(0, 0, 1)).transpose();
function limbRotation(out, xAxis, yAxis, zAxis) {
  _basisMat.makeBasis(xAxis, yAxis, zAxis);
  return out.multiplyMatrices(_basisMat, _limbRestInv);
}
export class GreymawPose {
  rig;
  sp = new SpringBank(CH_COUNT);
  root = new Vector3();
  yaw = 0;
  rise = 1;
  bones;
  worldFist = [new Vector3(), new Vector3()];
  worldElbow = [new Vector3(), new Vector3()];
  worldWrist = [new Vector3(), new Vector3()];
  worldShoulder = [new Vector3(), new Vector3()];
  fistJitter = [new Vector3(), new Vector3()];
  prevFore = [new Vector3(0, -1, 0), new Vector3(0, -1, 0)];
  chestPrev = new Vector3();
  chestVel = new Vector3();
  mRoot = new Matrix4();
  mBelly = new Matrix4();
  mChest = new Matrix4();
  mHead = new Matrix4();
  rootInv = new Matrix4();
  first = true;
  constructor(rig, bones) {
    this.rig = rig;
    this.bones = bones;
    const sp = this.sp;
    for (const ch of [CH.LEAN_P, CH.LEAN_R, CH.TWIST]) sp.set(ch, 1.1, 0.55);
    for (const ch of [CH.CHEST_P, CH.CHEST_R, CH.CHEST_Y]) sp.set(ch, 1.5, 0.45);
    for (const ch of [CH.CHEST_OX, CH.CHEST_OY, CH.CHEST_OZ]) sp.set(ch, 2.2, 0.35);
    sp.set(CH.SQUASH, 1.8, 0.3);
    sp.set(CH.WIDTH, 1.6, 0.35);
    for (const ch of [CH.HEAD_P, CH.HEAD_Y, CH.HEAD_R]) sp.set(ch, 1.6, 0.6);
    sp.set(CH.MASK_PUSH, 3.5, 0.35);
    sp.set(CH.MASK_P, 2.5, 0.45);
    sp.set(CH.MASK_R, 2.2, 0.3);
    sp.set(CH.JAW, 3, 0.55);
    for (const ch of [CH.LFX, CH.LFY, CH.LFZ, CH.RFX, CH.RFY, CH.RFZ]) sp.set(ch, 1.5, 0.75);
    for (const ch of [CH.LP_UP, CH.LP_BACK, CH.RP_UP, CH.RP_BACK]) sp.set(ch, 1.2, 0.8);
    for (const ch of [CH.LW_P, CH.LW_R, CH.RW_P, CH.RW_R]) sp.set(ch, 2.4, 0.45);
    sp.set(CH.LF_S, 4, 0.3);
    sp.set(CH.RF_S, 4, 0.3);
    for (const ch of [CH.MANE_X, CH.MANE_Z]) sp.set(ch, 1.1, 0.18);
    for (const ch of [CH.BRUSH_X, CH.BRUSH_Z]) sp.set(ch, 1.6, 0.12);
    sp.set(CH.EYE, 6, 0.7);
    sp.set(CH.ANGER, 2.5, 1);
    sp.set(CH.GLOW, 5, 1);
    sp.set(CH.MOUTH, 4, 1);
    sp.set(CH.GLOW_L, 5, 1);
    sp.set(CH.GLOW_R, 5, 1);
    sp.set(CH.SINK, 1.2, 0.8);
    const target = sp.target;
    target.fill(0);
    target[CH.SQUASH] = 1;
    target[CH.WIDTH] = 1;
    target[CH.EYE] = 1;
    target[CH.LF_S] = 1;
    target[CH.RF_S] = 1;
    target[CH.LFX] = 4.8;
    target[CH.LFY] = 1.2;
    target[CH.LFZ] = 4.2;
    target[CH.RFX] = -4.8;
    target[CH.RFY] = 1.2;
    target[CH.RFZ] = 4.2;
    target[CH.LP_UP] = 0.2;
    target[CH.LP_BACK] = 1;
    target[CH.RP_UP] = 0.2;
    target[CH.RP_BACK] = 1;
    sp.snapAll();
  }
  set(ch, value) {
    this.sp.target[ch] = value;
  }
  get(ch) {
    return this.sp.x[ch];
  }
  kick(ch, impulse) {
    this.sp.kick(ch, impulse);
  }
  fist(side, x, y, z) {
    const ch = side === 0 ? CH.LFX : CH.RFX;
    this.sp.target[ch] = x;
    this.sp.target[ch + 1] = y;
    this.sp.target[ch + 2] = z;
  }
  fistWorld(side, pos) {
    this.toLocal(pos, _poseTmp);
    this.fist(side, _poseTmp.x, _poseTmp.y, _poseTmp.z);
  }
  snapFist(side) {
    const ch = side === 0 ? CH.LFX : CH.RFX;
    for (let i = 0; i < 3; i++) {
      this.sp.x[ch + i] = this.sp.target[ch + i];
      this.sp.v[ch + i] = 0;
    }
  }
  setFistStiffness(side, freq, damping = 0.75) {
    const ch = side === 0 ? CH.LFX : CH.RFX;
    for (let i = 0; i < 3; i++) this.sp.set(ch + i, freq, damping);
  }
  toLocal(world, out) {
    const dx = world.x - this.root.x;
    const dz = world.z - this.root.z;
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    return out.set(dx * cos - dz * sin, world.y - this.root.y, dx * sin + dz * cos);
  }
  toWorld(local, out) {
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    return out.set(
      this.root.x + local.x * cos + local.z * sin,
      this.root.y + local.y,
      this.root.z - local.x * sin + local.z * cos,
    );
  }
  step(dt) {
    if (dt > 0) this.sp.step(dt);
    this.compose(dt);
  }
  compose(dt) {
    const val = this.sp.x;
    const rig = this.rig;
    const bones = this.bones;
    const sunk = (1 - clamp(this.rise, 0, 1)) * 10.5;
    _poseEuler.set(0, this.yaw, 0, 'YXZ');
    _poseQuat.setFromEuler(_poseEuler);
    this.mRoot.compose(
      _composePos.set(this.root.x, this.root.y - sunk + val[CH.SINK], this.root.z),
      _poseQuat,
      _composeScale.set(1, 1, 1),
    );
    bones[BONE.root].copy(this.mRoot);
    const squash = Math.max(0.6, val[CH.SQUASH]);
    const width = Math.max(0.7, val[CH.WIDTH]) / Math.sqrt(squash);
    composePivot(
      _localMat,
      rig.pivots[BONE.belly],
      0,
      0,
      0,
      val[CH.LEAN_P],
      val[CH.TWIST],
      val[CH.LEAN_R],
      width,
      squash,
      width,
    );
    this.mBelly.multiplyMatrices(this.mRoot, _localMat);
    bones[BONE.belly].copy(this.mBelly);
    composePivot(
      _localMat,
      rig.pivots[BONE.chest],
      val[CH.CHEST_OX],
      val[CH.CHEST_OY],
      val[CH.CHEST_OZ],
      val[CH.CHEST_P],
      val[CH.CHEST_Y],
      val[CH.CHEST_R],
    );
    this.mChest.multiplyMatrices(this.mBelly, _localMat);
    bones[BONE.chest].copy(this.mChest);
    composePivot(_localMat, rig.pivots[BONE.head], 0, 0, 0, val[CH.HEAD_P], val[CH.HEAD_Y], val[CH.HEAD_R]);
    this.mHead.multiplyMatrices(this.mChest, _localMat);
    bones[BONE.head].copy(this.mHead);
    composePivot(_localMat, rig.pivots[BONE.mask], 0, 0, val[CH.MASK_PUSH], val[CH.MASK_P], 0, val[CH.MASK_R]);
    bones[BONE.mask].multiplyMatrices(this.mHead, _localMat);
    composePivot(_localMat, rig.pivots[BONE.jaw], 0, 0, 0, clamp(val[CH.JAW], -0.1, 0.9), 0, 0);
    bones[BONE.jaw].multiplyMatrices(this.mHead, _localMat);
    composePivot(_localMat, rig.pivots[BONE.mane], 0, 0, 0, val[CH.MANE_X], 0, val[CH.MANE_Z]);
    bones[BONE.mane].multiplyMatrices(this.mHead, _localMat);
    composePivot(_localMat, rig.pivots[BONE.brush], 0, 0, 0, val[CH.BRUSH_X], 0, val[CH.BRUSH_Z]);
    bones[BONE.brush].multiplyMatrices(this.mChest, _localMat);
    const chestPos = _poseTmp.copy(rig.pivots[BONE.chest]).applyMatrix4(this.mChest);
    this.first &&= (this.chestPrev.copy(chestPos), false);
    if (dt > 0.0001) {
      const vx = (chestPos.x - this.chestPrev.x) / dt;
      const vy = (chestPos.y - this.chestPrev.y) / dt;
      const vz = (chestPos.z - this.chestPrev.z) / dt;
      const ax = (vx - this.chestVel.x) / dt;
      const ay = (vy - this.chestVel.y) / dt;
      const az = (vz - this.chestVel.z) / dt;
      this.chestVel.set(vx, vy, vz);
      const cos = Math.cos(this.yaw);
      const sin = Math.sin(this.yaw);
      const sideAcc = ax * cos - az * sin;
      const fwdAcc = ax * sin + az * cos;
      const gain = Math.min(1, dt * 60) * 0.004;
      this.sp.kick(CH.MANE_X, clamp(-fwdAcc * gain + ay * gain * 0.5, -0.3, 0.3));
      this.sp.kick(CH.MANE_Z, clamp(sideAcc * gain, -0.3, 0.3));
      this.sp.kick(CH.BRUSH_X, clamp(-fwdAcc * gain * 1.4 + ay * gain, -0.4, 0.4));
      this.sp.kick(CH.BRUSH_Z, clamp(sideAcc * gain * 1.4, -0.4, 0.4));
    }
    this.chestPrev.copy(chestPos);
    for (let i = 0; i < 2 && (this.solveArm(i), i !== 1); i += 1);
  }
  solveArm(side) {
    const val = this.sp.x;
    const rig = this.rig;
    const bones = this.bones;
    const upperBone = side === 0 ? BONE.lUp : BONE.rUp;
    const foreBone = side === 0 ? BONE.lFore : BONE.rFore;
    const handBone = side === 0 ? BONE.lHand : BONE.rHand;
    const fistCh = side === 0 ? CH.LFX : CH.RFX;
    const sign = side === 0 ? 1 : -1;
    const shoulder = this.worldShoulder[side].copy(rig.shoulders[side]).applyMatrix4(this.mChest);
    const fist = this.toWorld(_armLocal.set(val[fistCh], val[fistCh + 1], val[fistCh + 2]), _armTarget).add(
      this.fistJitter[side],
    );
    fist.y -= (1 - clamp(this.rise, 0, 1)) * 10.5;
    const prevFore = this.prevFore[side];
    const wristGoal = _poseTmp.copy(fist).addScaledVector(prevFore, -ARM.fist);
    const upper = ARM.upper;
    const fore = ARM.fore;
    _armDir.subVectors(wristGoal, shoulder);
    let reach = _armDir.length();
    if (reach < 0.0001) {
      _armDir.set(0, -1, 0);
      reach = 1;
    } else _armDir.divideScalar(reach);
    reach = clamp(reach, Math.abs(upper - fore) + 0.4, upper + fore - 0.02);
    const poleUp = val[side === 0 ? CH.LP_UP : CH.RP_UP];
    const poleBack = val[side === 0 ? CH.LP_BACK : CH.RP_BACK];
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const poleX = sign * 1;
    const poleZ = -poleBack;
    _armPole.set(poleX * cos + poleZ * sin, poleUp, -poleX * sin + poleZ * cos);
    _armPole.addScaledVector(_armDir, -_armPole.dot(_armDir));
    if (_armPole.lengthSq() < 0.000001) _armPole.set(sign * cos, 0, -sign * sin);
    _armPole.normalize();
    const cosShoulder = clamp((upper * upper + reach * reach - fore * fore) / (2 * upper * reach), -1, 1);
    const shoulderAngle = Math.acos(cosShoulder);
    const elbow = this.worldElbow[side]
      .copy(shoulder)
      .addScaledVector(_armDir, upper * Math.cos(shoulderAngle))
      .addScaledVector(_armPole, upper * Math.sin(shoulderAngle));
    const wrist = this.worldWrist[side].copy(shoulder).addScaledVector(_armDir, reach);
    const upperDir = _poseTmp.subVectors(elbow, shoulder).normalize();
    const upperNormal = _armLocal
      .copy(_armDir)
      .multiplyScalar(Math.sin(shoulderAngle))
      .addScaledVector(_armPole, -Math.cos(shoulderAngle));
    if (upperNormal.lengthSq() < 0.000001) upperNormal.copy(_armPole).negate();
    upperNormal.normalize();
    const hinge = _armTarget.crossVectors(upperDir, upperNormal).normalize();
    limbRotation(_localMat, hinge, upperDir, upperNormal);
    this.boneFrom(bones[upperBone], shoulder, _localMat, rig.shoulders[side]);
    const foreDir = _composePos.subVectors(wrist, elbow).normalize();
    limbRotation(_localMat, hinge, foreDir, _composeScale.crossVectors(hinge, foreDir).normalize());
    this.boneFrom(bones[foreBone], elbow, _localMat, rig.elbows[side]);
    prevFore.copy(foreDir);
    const wristPitch = val[side === 0 ? CH.LW_P : CH.RW_P];
    const wristRoll = val[side === 0 ? CH.LW_R : CH.RW_R];
    _poseEuler.set(wristPitch, wristRoll, 0, 'YXZ');
    _poseQuat.setFromEuler(_poseEuler);
    _wristMat.makeRotationFromQuaternion(_poseQuat);
    _localMat.multiply(_wristMat);
    const fistScale = clamp(val[side === 0 ? CH.LF_S : CH.RF_S], 0.5, 1.5);
    const girth = 1 / Math.sqrt(fistScale);
    _wristMat.makeScale(girth, fistScale, girth);
    _localMat.multiply(_wristMat);
    this.boneFrom(bones[handBone], wrist, _localMat, rig.wrists[side]);
    this.worldFist[side].copy(rig.fists[side]).applyMatrix4(bones[handBone]);
  }
  boneFrom(out, pos, rot, pivot) {
    out.copy(rot);
    const elements = out.elements;
    elements[12] = pos.x - (elements[0] * pivot.x + elements[4] * pivot.y + elements[8] * pivot.z);
    elements[13] = pos.y - (elements[1] * pivot.x + elements[5] * pivot.y + elements[9] * pivot.z);
    elements[14] = pos.z - (elements[2] * pivot.x + elements[6] * pivot.y + elements[10] * pivot.z);
    elements[15] = 1;
  }
  boneWorld(bone, local, out) {
    return out.copy(local).applyMatrix4(this.bones[Math.max(0, Math.min(13, bone))]);
  }
  maskWorld(out) {
    return this.boneWorld(BONE.mask, this.rig.maskCenter, out);
  }
  mouthWorld(out) {
    return this.boneWorld(BONE.head, this.rig.mouth, out);
  }
  crystalWorld(index, out) {
    const crystal = this.rig.crystals[index];
    return this.boneWorld(crystal.bone, crystal.pos, out);
  }
  maskForward(out) {
    const elements = this.bones[BONE.mask].elements;
    return out.set(elements[8], elements[9], elements[10]).normalize();
  }
  get rootMatrix() {
    return this.mRoot;
  }
  inverseRoot() {
    return this.rootInv.copy(this.mRoot).invert();
  }
}
