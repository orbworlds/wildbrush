/**
 * Layout of the 64 animation channels (body, two arms, two legs), the rest pose, and the spring stiffness, tracking and rate limit tuned for each channel.
 */
export const BODY_CH = {
  hipX: 0,
  hipY: 1,
  hipZ: 2,
  hipPitch: 3,
  hipYaw: 4,
  hipRoll: 5,
  spPitch: 6,
  spYaw: 7,
  spRoll: 8,
  chPitch: 9,
  chYaw: 10,
  chRoll: 11,
  nkPitch: 12,
  nkYaw: 13,
  nkRoll: 14,
  hdPitch: 15,
  hdYaw: 16,
  hdRoll: 17,
  squash: 18,
  blink: 19,
  glider: 20,
  tailSwing: 21,
};
export const ARM_CH = {
  clavUp: 0,
  clavFwd: 1,
  swing: 2,
  abd: 3,
  twist: 4,
  elbow: 5,
  wPitch: 6,
  wRoll: 7,
  wYaw: 8,
  ik: 9,
  tx: 10,
  ty: 11,
  tz: 12,
};
export const LEG_CH = {
  fx: 0,
  fy: 1,
  fz: 2,
  pitch: 3,
  roll: 4,
  yaw: 5,
  knee: 6,
  plant: 7,
};
export const armBase = (side) => (side === 1 ? 22 : 35);
export const legBase = (side) => (side === 1 ? 48 : 56);
export function restPose(channels) {
  channels.fill(0);
  channels[BODY_CH.squash] = 1;
  return channels;
}
export function tuneSprings(omega, track, maxRate) {
  omega.fill(20);
  track.fill(1);
  maxRate.fill(40);
  for (const ch of [BODY_CH.hipX, BODY_CH.hipY, BODY_CH.hipZ]) {
    omega[ch] = 26;
    maxRate[ch] = 6;
  }
  for (const ch of [BODY_CH.hipPitch, BODY_CH.hipYaw, BODY_CH.hipRoll, BODY_CH.spPitch, BODY_CH.spYaw, BODY_CH.spRoll])
    omega[ch] = 22;
  for (const ch of [BODY_CH.chPitch, BODY_CH.chYaw, BODY_CH.chRoll]) {
    omega[ch] = 18;
    track[ch] = 0.85;
  }
  for (const ch of [BODY_CH.nkPitch, BODY_CH.nkYaw, BODY_CH.nkRoll, BODY_CH.hdPitch, BODY_CH.hdYaw, BODY_CH.hdRoll]) {
    omega[ch] = 13;
    track[ch] = 0.7;
  }
  omega[BODY_CH.squash] = 22;
  maxRate[BODY_CH.squash] = 8;
  omega[BODY_CH.blink] = 60;
  maxRate[BODY_CH.blink] = 200;
  omega[BODY_CH.glider] = 30;
  for (const base of [22, 35]) {
    for (let i = 0; i < 13; i++) {
      omega[base + i] = 17;
      track[base + i] = 0.8;
    }
    omega[base + ARM_CH.ik] = 16;
    track[base + ARM_CH.ik] = 1;
    for (const ch of [ARM_CH.tx, ARM_CH.ty, ARM_CH.tz]) {
      omega[base + ch] = 24;
      track[base + ch] = 1;
      maxRate[base + ch] = 12;
    }
    for (const ch of [ARM_CH.wPitch, ARM_CH.wRoll, ARM_CH.wYaw]) {
      omega[base + ch] = 12;
      track[base + ch] = 0.55;
    }
  }
  for (const base of [48, 56]) {
    for (let i = 0; i < 8; i++) omega[base + i] = 22;
    for (const ch of [LEG_CH.fx, LEG_CH.fy, LEG_CH.fz]) maxRate[base + ch] = 10;
    omega[base + LEG_CH.plant] = 26;
  }
}
