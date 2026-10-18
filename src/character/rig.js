/**
 * The hero's skeleton: the 29 bone indices, each bone's parent and rest position, the limb lengths derived from them, bone creation, and Pose, which holds local rotations and offsets, runs forward kinematics and writes the result to the bones.
 */
import { Bone, Quaternion, Vector3 } from 'three';
export const BONE = {
  root: 0,
  pelvis: 1,
  spine: 2,
  chest: 3,
  neck: 4,
  head: 5,
  clavL: 6,
  armL: 7,
  foreL: 8,
  handL: 9,
  clavR: 10,
  armR: 11,
  foreR: 12,
  handR: 13,
  thighL: 14,
  shinL: 15,
  footL: 16,
  thighR: 17,
  shinR: 18,
  footR: 19,
  brush: 20,
  eyeL: 21,
  eyeR: 22,
  hood1: 23,
  hood2: 24,
  hood3: 25,
  satchel: 26,
  fingersL: 27,
  fingersR: 28,
};
const BONE_DEFS = [];
BONE_DEFS[BONE.root] = [-1, 0, 0, 0];
BONE_DEFS[BONE.pelvis] = [BONE.root, 0, 0.88, 0];
BONE_DEFS[BONE.spine] = [BONE.pelvis, 0, 0.99, 0];
BONE_DEFS[BONE.chest] = [BONE.spine, 0, 1.1, 0];
BONE_DEFS[BONE.neck] = [BONE.chest, 0, 1.285, -0.005];
BONE_DEFS[BONE.head] = [BONE.neck, 0, 1.355, 0];
BONE_DEFS[BONE.clavL] = [BONE.chest, 0.045, 1.25, 0];
BONE_DEFS[BONE.armL] = [BONE.clavL, 0.17, 1.24, 0];
BONE_DEFS[BONE.foreL] = [BONE.armL, 0.17, 1.005, 0];
BONE_DEFS[BONE.handL] = [BONE.foreL, 0.17, 0.798, 0];
BONE_DEFS[BONE.clavR] = [BONE.chest, -0.045, 1.25, 0];
BONE_DEFS[BONE.armR] = [BONE.clavR, -0.17, 1.24, 0];
BONE_DEFS[BONE.foreR] = [BONE.armR, -0.17, 1.005, 0];
BONE_DEFS[BONE.handR] = [BONE.foreR, -0.17, 0.798, 0];
BONE_DEFS[BONE.thighL] = [BONE.pelvis, 0.088, 0.855, 0];
BONE_DEFS[BONE.shinL] = [BONE.thighL, 0.088, 0.462, 0.006];
BONE_DEFS[BONE.footL] = [BONE.shinL, 0.088, 0.088, 0];
BONE_DEFS[BONE.thighR] = [BONE.pelvis, -0.088, 0.855, 0];
BONE_DEFS[BONE.shinR] = [BONE.thighR, -0.088, 0.462, 0.006];
BONE_DEFS[BONE.footR] = [BONE.shinR, -0.088, 0.088, 0];
BONE_DEFS[BONE.brush] = [BONE.root, 0, 0, 0];
BONE_DEFS[BONE.eyeL] = [BONE.head, 0.047, 1.458, 0.14];
BONE_DEFS[BONE.eyeR] = [BONE.head, -0.047, 1.458, 0.14];
BONE_DEFS[BONE.hood1] = [BONE.head, 0, 1.575, -0.12];
BONE_DEFS[BONE.hood2] = [BONE.hood1, 0, 1.535, -0.25];
BONE_DEFS[BONE.hood3] = [BONE.hood2, 0, 1.445, -0.325];
BONE_DEFS[BONE.satchel] = [BONE.pelvis, 0.2, 0.93, 0];
BONE_DEFS[BONE.fingersL] = [BONE.handL, 0.176, 0.742, 0];
BONE_DEFS[BONE.fingersR] = [BONE.handR, -0.176, 0.742, 0];
const BONE_PARENT = BONE_DEFS.map((def) => def[0]);
export const REST_POS = BONE_DEFS.map((def) => new Vector3(def[1], def[2], def[3]));
const REST_LOCAL = BONE_DEFS.map((def, i) =>
  def[0] < 0 ? new Vector3(def[1], def[2], def[3]) : new Vector3().subVectors(REST_POS[i], REST_POS[def[0]]),
);
export const THIGH_LEN = REST_POS[BONE.thighL].distanceTo(REST_POS[BONE.shinL]);
export const SHIN_LEN = REST_POS[BONE.shinL].distanceTo(REST_POS[BONE.footL]);
export const UPPER_ARM_LEN = REST_POS[BONE.armL].distanceTo(REST_POS[BONE.foreL]);
export const FOREARM_LEN = REST_POS[BONE.foreL].distanceTo(REST_POS[BONE.handL]);
REST_POS[BONE.footL].y;
export const PELVIS_Y = REST_POS[BONE.pelvis].y;
export const TORSO_LEN = REST_POS[BONE.armL].y - REST_POS[BONE.pelvis].y;
export const HEAD_CENTER = new Vector3(0, 1.47, 0.012);
export const HEAD_RADIUS = 0.157;
export function createBones() {
  const bones = [];
  for (let i = 0; i < 29; i++) {
    const bone = new Bone();
    bone.name = Object.keys(BONE).find((key) => BONE[key] === i) ?? `b${i}`;
    bone.position.copy(REST_LOCAL[i]);
    bones.push(bone);
  }
  for (let i = 0; i < 29; i++) if (BONE_PARENT[i] >= 0) bones[BONE_PARENT[i]].add(bones[i]);
  return bones;
}
export class Pose {
  local = [];
  localPos = [];
  scale = [];
  mRot = [];
  mPos = [];
  tmp = new Vector3();
  constructor() {
    for (let i = 0; i < 29; i++) {
      this.local.push(new Quaternion());
      this.localPos.push(REST_LOCAL[i].clone());
      this.scale.push(new Vector3(1, 1, 1));
      this.mRot.push(new Quaternion());
      this.mPos.push(REST_POS[i].clone());
    }
  }
  reset() {
    for (let i = 0; i < 29; i++) {
      this.local[i].identity();
      this.localPos[i].copy(REST_LOCAL[i]);
      this.scale[i].set(1, 1, 1);
    }
  }
  fk(start = 0) {
    for (let i = start; i < 29; i++) {
      const parentIdx = BONE_PARENT[i];
      if (parentIdx < 0) {
        this.mRot[i].copy(this.local[i]);
        this.mPos[i].copy(this.localPos[i]);
      } else {
        this.mRot[i].multiplyQuaternions(this.mRot[parentIdx], this.local[i]);
        this.tmp.copy(this.localPos[i]).applyQuaternion(this.mRot[parentIdx]);
        this.mPos[i].addVectors(this.mPos[parentIdx], this.tmp);
      }
    }
  }
  fkOne(bone) {
    const parentIdx = BONE_PARENT[bone];
    if (parentIdx < 0) {
      this.mRot[bone].copy(this.local[bone]);
      this.mPos[bone].copy(this.localPos[bone]);
      return;
    }
    this.mRot[bone].multiplyQuaternions(this.mRot[parentIdx], this.local[bone]);
    this.tmp.copy(this.localPos[bone]).applyQuaternion(this.mRot[parentIdx]);
    this.mPos[bone].addVectors(this.mPos[parentIdx], this.tmp);
  }
  setModelRot(bone, rot) {
    const parentIdx = BONE_PARENT[bone];
    if (parentIdx < 0) this.local[bone].copy(rot);
    else this.local[bone].copy(this.mRot[parentIdx]).invert().multiply(rot);
    this.fkOne(bone);
  }
  apply(bones) {
    for (let i = 0; i < 29; i++) {
      const bone = bones[i];
      bone.quaternion.copy(this.local[i]);
      bone.position.copy(this.localPos[i]);
      bone.scale.copy(this.scale[i]);
    }
  }
}
