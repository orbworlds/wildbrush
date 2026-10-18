/**
 * Two-bone IK with a soft reach limit for the arms and legs, and helpers that turn a direction plus a hint axis into a bone rotation.
 */
import { Matrix4, Vector3 } from 'three';
const _ikDir = new Vector3();
const _ikBend = new Vector3();
const _basisX = new Vector3();
const _basisY = new Vector3();
const _basisZ = new Vector3();
const _basisMat = new Matrix4();
export function solveTwoBoneIK(root, target, pole, upperLen, lowerLen, outMid, outEnd, soft = 0.02) {
  _ikDir.subVectors(target, root);
  let dist = _ikDir.length();
  if (dist < 0.00001) {
    _ikDir.set(0, -1, 0);
    dist = 0.00001;
  } else _ikDir.divideScalar(dist);
  const chainLen = upperLen + lowerLen;
  const softLen = chainLen * soft;
  const hardLen = chainLen - softLen;
  let reach = dist;
  if (reach > hardLen) reach = hardLen + softLen * (1 - Math.exp(-(reach - hardLen) / softLen));
  reach = Math.max(Math.abs(upperLen - lowerLen) + 0.0001, Math.min(reach, chainLen - 0.0001));
  const cosAngle = (upperLen * upperLen + reach * reach - lowerLen * lowerLen) / (2 * upperLen * reach);
  const angle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));
  _ikBend.copy(pole).addScaledVector(_ikDir, -pole.dot(_ikDir));
  if (_ikBend.lengthSq() < 1e-8) {
    _ikBend.set(0, 0, 1).addScaledVector(_ikDir, -_ikDir.z);
    if (_ikBend.lengthSq() < 1e-8) _ikBend.set(1, 0, 0);
  }
  _ikBend.normalize();
  outMid
    .copy(root)
    .addScaledVector(_ikDir, Math.cos(angle) * upperLen)
    .addScaledVector(_ikBend, Math.sin(angle) * upperLen);
  outEnd.copy(root).addScaledVector(_ikDir, reach);
  return reach / chainLen;
}
export function limbRotation(dir, hinge, out) {
  _basisY.copy(dir).normalize().negate();
  _basisX.copy(hinge).addScaledVector(_basisY, -hinge.dot(_basisY));
  if (_basisX.lengthSq() < 1e-8) {
    _basisX.set(1, 0, 0).addScaledVector(_basisY, -_basisY.x);
    if (_basisX.lengthSq() < 1e-8) _basisX.set(0, 0, 1);
  }
  _basisX.normalize();
  _basisZ.crossVectors(_basisX, _basisY).normalize();
  _basisMat.makeBasis(_basisX, _basisY, _basisZ);
  return out.setFromRotationMatrix(_basisMat);
}
export function rotationAlongY(dir, zHint, out) {
  _basisY.copy(dir).normalize();
  _basisZ.copy(zHint).addScaledVector(_basisY, -zHint.dot(_basisY));
  if (_basisZ.lengthSq() < 1e-8) {
    _basisZ.set(0, 0, 1).addScaledVector(_basisY, -_basisY.z);
    if (_basisZ.lengthSq() < 1e-8) _basisZ.set(1, 0, 0);
  }
  _basisZ.normalize();
  _basisX.crossVectors(_basisY, _basisZ).normalize();
  _basisMat.makeBasis(_basisX, _basisY, _basisZ);
  return out.setFromRotationMatrix(_basisMat);
}
