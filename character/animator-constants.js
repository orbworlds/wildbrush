/**
 * Constants the hero animator shares: the locomotion modes it blends, a full turn, the pitch and yaw axes, the foot up vector and rest ankle positions, plus the scratch vectors and quaternions it reuses every frame.
 */
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { BONE, REST_POS } from './rig.js';
export const LOCO_MODES = ['ground', 'air', 'climb', 'glide', 'swim', 'slide', 'fly'];
export const FULL_TURN = Math.PI * 2;
export const _rigV = new Vector3();
export const _rigV2 = new Vector3();
export const _rigV3 = new Vector3();
export const _rigV4 = new Vector3();
export const _rigV5 = new Vector3();
export const _rigQ = new Quaternion();
export const _rigQ2 = new Quaternion();
export const _rigQ3 = new Quaternion();
export const _rigQ4 = new Quaternion();
export const _rigEuler = new Euler();
new Matrix4();
export const FOOT_UP = new Vector3(0, 1, 0);
export const PITCH_AXIS = new Vector3(1, 0, 0);
export const YAW_AXIS = new Vector3(0, 1, 0);
export const REST_ANKLES = [REST_POS[BONE.footL].clone(), REST_POS[BONE.footR].clone()];
