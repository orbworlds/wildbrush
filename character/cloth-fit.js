/**
 * Hangs the hero's cloth on its bones: the scarf's knot and the Sky Mantle's shoulders on the chest,
 * and capsules along the head, body, legs, arms, satchel and brush for the cloth to fall against.
 * Reads the bones' world matrices, so the hero's must be up to date.
 */
import { Matrix3, Vector3 } from 'three';
import { CAPE_ANCHORS } from './cape.js';
import { BONE, REST_POS } from './rig.js';
export function clothColliders(count) {
  const colliders = [];
  for (let i = 0; i < count; i++)
    colliders.push({
      a: new Vector3(),
      b: new Vector3(),
      r: 0.1,
    });
  return colliders;
}
const boneWorld = (bones, bone, out) => out.setFromMatrixPosition(bones[bone].matrixWorld);
const bonePoint = (bones, bone, x, y, z, out) => out.set(x, y, z).applyMatrix4(bones[bone].matrixWorld);
const LEGS = [
  [BONE.thighL, BONE.shinL, BONE.footL],
  [BONE.thighR, BONE.shinR, BONE.footR],
];
const ARMS = [
  [BONE.armL, BONE.foreL],
  [BONE.armR, BONE.foreR],
];
/** The scarf (worn when the Sky Mantle isn't): `colliders` needs room for 8. */
export function fitScarf(bones, scarf, colliders) {
  const chestMatrix = bones[BONE.chest].matrixWorld;
  bonePoint(bones, BONE.chest, 0.07, SCARF_ANCHOR_Y - REST_POS[BONE.chest].y, -0.1, scarf.anchor);
  chestBasis.setFromMatrix4(chestMatrix);
  scarf.anchorSide.set(1, 0, 0).applyMatrix3(chestBasis).normalize();
  scarf.anchorBack.set(0, 0, -1).applyMatrix3(chestBasis).normalize();
  let count = 0;
  const addCollider = (a, b, radius) => {
    const col = colliders[count++];
    col.a.copy(a);
    col.b.copy(b);
    col.r = radius;
  };
  bonePoint(bones, BONE.head, 0, 0.12, -0.01, _segA);
  addCollider(_segA, _segA, 0.2);
  boneWorld(bones, BONE.spine, _segA);
  bonePoint(bones, BONE.chest, 0, 0.17, -0.02, _segB);
  addCollider(_segA, _segB, 0.165);
  bonePoint(bones, BONE.pelvis, 0, -0.14, -0.01, _segA);
  bonePoint(bones, BONE.pelvis, 0, 0.04, -0.01, _segB);
  addCollider(_segA, _segB, 0.18);
  for (const [thigh, shin, foot] of LEGS) {
    boneWorld(bones, thigh, _segA);
    boneWorld(bones, shin, _segB);
    addCollider(_segA, _segB, 0.075);
    boneWorld(bones, foot, _segA);
    addCollider(_segB, _segA, 0.065);
  }
  bonePoint(bones, BONE.brush, 0, 0.05, 0, _segA);
  bonePoint(bones, BONE.brush, 0, 1.3, 0.03, _segB);
  addCollider(_segA, _segB, 0.045);
  scarf.colliders = colliders;
  scarf.colliderCount = count;
}
/** The Sky Mantle: `colliders` needs room for 12. */
export function fitCape(bones, cape, colliders) {
  const chestRest = REST_POS[BONE.chest];
  for (let i = 0; i < CAPE_ANCHORS.length; i++) {
    const anchor = CAPE_ANCHORS[i];
    bonePoint(
      bones,
      BONE.chest,
      anchor.x - chestRest.x,
      anchor.y - chestRest.y,
      anchor.z - chestRest.z,
      cape.anchors[i],
    );
  }
  bonePoint(bones, BONE.chest, 0, 0.1, 0, cape.center);
  bonePoint(bones, BONE.chest, 0, 0.1, -1, cape.back).sub(cape.center);
  let count = 0;
  const addCollider = (a, b, radius) => {
    const col = colliders[count++];
    col.a.copy(a);
    col.b.copy(b);
    col.r = radius;
  };
  bonePoint(bones, BONE.head, 0, 0.12, -0.01, _segA);
  addCollider(_segA, _segA, 0.21);
  boneWorld(bones, BONE.spine, _segA);
  bonePoint(bones, BONE.chest, 0, 0.14, -0.015, _segB);
  addCollider(_segA, _segB, 0.17);
  bonePoint(bones, BONE.chest, 0.1, 0.1, -0.02, _segA);
  bonePoint(bones, BONE.chest, -0.1, 0.1, -0.02, _segB);
  addCollider(_segA, _segB, 0.15);
  bonePoint(bones, BONE.pelvis, 0, -0.14, -0.01, _segA);
  bonePoint(bones, BONE.pelvis, 0, 0.04, -0.01, _segB);
  addCollider(_segA, _segB, 0.19);
  for (const [thigh, shin, foot] of LEGS) {
    boneWorld(bones, thigh, _segA);
    boneWorld(bones, shin, _segB);
    addCollider(_segA, _segB, 0.085);
    boneWorld(bones, foot, _segA);
    addCollider(_segB, _segA, 0.07);
  }
  for (const [arm, forearm] of ARMS) {
    boneWorld(bones, arm, _segA);
    boneWorld(bones, forearm, _segB);
    addCollider(_segA, _segB, 0.06);
  }
  bonePoint(bones, BONE.satchel, 0.01, -0.07, 0.01, _segA);
  addCollider(_segA, _segA, 0.08);
  bonePoint(bones, BONE.brush, 0, 0.05, 0, _segA);
  bonePoint(bones, BONE.brush, 0, 1.3, 0.03, _segB);
  addCollider(_segA, _segB, 0.05);
  cape.colliders = colliders;
  cape.colliderCount = count;
}
const SCARF_ANCHOR_Y = 1.274;
const chestBasis = new Matrix3();
const _segA = new Vector3();
const _segB = new Vector3();
