/**
 * Greymaw's procedural body: bone and part indices, body colours, and the builder that sculpts the torso, pale mask and jaw, rocky arms and fists, mane tufts, the paintbrushes on his back, ink drips and the four stolen-colour crystals into one skinned geometry with the rig's pivot, crystal, drip and surface points.
 */
import { CylinderGeometry, Euler, MathUtils, Matrix4, Quaternion, Vector3 } from 'three';
import { makeRng } from '../core/math.js';
import {
  blob,
  compose,
  crystalGeometry,
  euler,
  ModelBuilder,
  rockGeometry,
  smoothLathe,
  taperedTube,
  v3,
} from './geometry.js';
import { smoothstep } from './math.js';
export const BONE = {
  root: 0,
  belly: 1,
  chest: 2,
  head: 3,
  mask: 4,
  jaw: 5,
  lUp: 6,
  lFore: 7,
  lHand: 8,
  rUp: 9,
  rFore: 10,
  rHand: 11,
  mane: 12,
  brush: 13,
};
const PART = {
  body: 0,
  mask: 1,
  limb: 2,
  drip: 3,
  jaw: 4,
  tuft: 5,
  mouth: 6,
  rock: 7,
  wood: 8,
  bristle: 9,
  crystal0: 10,
  crystal1: 11,
  crystal2: 12,
  crystal3: 13,
};
export const ARM = {
  upper: 5.6,
  fore: 5.6,
  fist: 1.3,
  fistR: 1.5,
};
const BODY_COLOR = 4604752;
const BODY_DARK_COLOR = 3420477;
const LIMB_COLOR = 4012615;
const MASK_COLOR = 15854557;
const MASK_SHADE_COLOR = 14603715;
const ROCK_COLOR = 9077883;
const WOOD_COLOR = 8219221;
const MOUTH_COLOR = 723472;
const CRYSTAL_COLORS = [16735034, 5030911, 16766023, 5822059];
const maskUv = (p) => [p.x * 0.5 + 0.5, p.y * 0.5 + 0.5];
function dripGeometry(radius, len) {
  return smoothLathe(
    [
      [-len, 0],
      [-len * 0.93, radius * 0.72],
      [-len * 0.78, radius * 0.86],
      [-len * 0.52, radius * 0.66],
      [-len * 0.2, radius * 0.78],
      [0, radius],
      [radius * 0.9, 0],
    ],
    10,
    8,
  );
}
export function buildGreymawModel() {
  const builder = new ModelBuilder();
  const rng = makeRng('greymaw-model');
  const pivots = [];
  pivots[BONE.root] = v3(0, 0, 0);
  pivots[BONE.belly] = v3(0, 0.8, 0);
  pivots[BONE.chest] = v3(0, 3.8, 0.1);
  pivots[BONE.head] = v3(0, 6, 1.5);
  pivots[BONE.mask] = v3(0, 6.6, 4.15);
  pivots[BONE.jaw] = v3(0, 5.35, 3.45);
  pivots[BONE.mane] = v3(0, 8.2, 1.2);
  pivots[BONE.brush] = v3(0, 5.6, -2.2);
  const torso = smoothLathe(
    [
      [-4.2, 0],
      [-4, 2.7],
      [-2, 3.25],
      [0, 3.35],
      [1.6, 3.2],
      [3.1, 3.45],
      [4.6, 3.75],
      [5.8, 3.55],
      [6.8, 3],
      [7.6, 2.1],
      [8.1, 1.1],
      [8.3, 0],
    ],
    40,
    40,
    (p, v) => {
      p.x *= 1.14;
      p.z *= 0.86;
      const lean = MathUtils.clamp((p.y - 2) / 6.4, 0, 1);
      p.z += 1.7 * lean * lean;
      if (p.z < 0) p.z -= 0.75 * Math.exp(-((p.y - 6) ** 2) / 2.2);
    },
  );
  builder.add(torso, {
    color: BODY_COLOR,
    color2: BODY_DARK_COLOR,
    shade: (p) => smoothstep(3, -1.5, p.y),
    bone: BONE.belly,
    bone2: BONE.chest,
    weight: (p) => smoothstep(2.6, 5.2, p.y),
    part: PART.body,
    rough: 0.2,
  });
  for (const side of [1, -1])
    builder.add(
      blob(22, 16, (p) => {
        if (p.y < -0.2) p.x *= 0.9;
      }),
      {
        color: BODY_COLOR,
        bone: BONE.chest,
        part: PART.body,
        rough: 0.2,
        matrix: compose(v3(3.25 * side, 7.35, 0.25), euler(0.12, 0, -0.4 * side), v3(2.35, 1.95, 2.25)),
      },
    );
  builder.add(blob(22, 16), {
    color: BODY_COLOR,
    bone: BONE.head,
    part: PART.body,
    rough: 0.2,
    matrix: compose(v3(0, 6.3, 2.75), euler(0.25, 0, 0), v3(2, 1.8, 1.85)),
  });
  builder.add(blob(18, 10), {
    color: BODY_DARK_COLOR,
    bone: BONE.head,
    part: PART.body,
    rough: 0.22,
    matrix: compose(v3(0, 8.2, 3.55), euler(0.35, 0, 0), v3(2.35, 0.62, 1.15)),
  });
  const maskPos = v3(0, 6.6, 4.35);
  const mask = blob(40, 28, (p) => {
    if (p.z < 0) p.z *= 0.35;
    if (p.y > 0.72) p.y = 0.72 + (p.y - 0.72) * 0.5;
    if (p.y < -0.55) p.y = -0.55 + (p.y + 0.55) * 0.4;
    p.x *= 1 + 0.06 * Math.max(0, p.y);
  });
  builder.add(mask, {
    color: MASK_COLOR,
    color2: MASK_SHADE_COLOR,
    shade: (p) => smoothstep(8.3, 6.2, p.y) * 0.6,
    bone: BONE.mask,
    part: PART.mask,
    rough: 0.85,
    matrix: compose(maskPos, euler(0.14, 0, 0), v3(2.1, 1.85, 0.5)),
    uv: maskUv,
  });
  const jaw = blob(30, 14, (p) => {
    p.x *= 1 - 0.28 * Math.max(0, -p.y);
    if (p.z < 0) p.z *= 0.4;
  });
  builder.add(jaw, {
    color: MASK_COLOR,
    color2: MASK_SHADE_COLOR,
    shade: () => 0.45,
    bone: BONE.jaw,
    part: PART.jaw,
    rough: 0.85,
    matrix: compose(v3(0, 4.72, 4.12), euler(0.06, 0, 0), v3(1.5, 0.74, 0.42)),
    uv: maskUv,
  });
  const mouth = v3(0, 5.05, 3.85);
  builder.add(blob(16, 10), {
    color: MOUTH_COLOR,
    bone: BONE.head,
    part: PART.mouth,
    rough: 0.5,
    matrix: compose(mouth, euler(), v3(1.4, 0.8, 0.62)),
  });
  const shoulders = [v3(3.65, 7.3, 0.45), v3(-3.65, 7.3, 0.45)];
  const elbows = [shoulders[0].clone().setY(7.3 - ARM.upper), shoulders[1].clone().setY(7.3 - ARM.upper)];
  const wrists = [elbows[0].clone().setY(elbows[0].y - ARM.fore), elbows[1].clone().setY(elbows[1].y - ARM.fore)];
  const fists = [wrists[0].clone().setY(wrists[0].y - ARM.fist), wrists[1].clone().setY(wrists[1].y - ARM.fist)];
  const crystals = [];
  const dripPoints = [];
  const surface = [];
  for (let i = 0; i < 2; i++) {
    const shoulder = shoulders[i];
    const elbow = elbows[i];
    const wrist = wrists[i];
    const fist = fists[i];
    const sign = i === 0 ? 1 : -1;
    const upBone = i === 0 ? BONE.lUp : BONE.rUp;
    const foreBone = i === 0 ? BONE.lFore : BONE.rFore;
    const handBone = i === 0 ? BONE.lHand : BONE.rHand;
    pivots[upBone] = shoulder.clone();
    pivots[foreBone] = elbow.clone();
    pivots[handBone] = wrist.clone();
    const upper = taperedTube(
      [
        v3(shoulder.x, shoulder.y + 0.4, shoulder.z),
        v3(shoulder.x, shoulder.y - ARM.upper * 0.5, shoulder.z - 0.05),
        v3(elbow.x, elbow.y + 0.2, elbow.z),
      ],
      (t) => 1.5 - t * 0.42,
      14,
      14,
    );
    builder.add(upper, {
      color: LIMB_COLOR,
      bone: BONE.chest,
      bone2: upBone,
      weight: (p) => smoothstep(shoulder.y + 0.6, shoulder.y - 0.9, p.y),
      part: PART.limb,
      rough: 0.22,
    });
    builder.add(blob(14, 10), {
      color: LIMB_COLOR,
      bone: upBone,
      bone2: foreBone,
      weight: (p) => smoothstep(elbow.y + 0.5, elbow.y - 0.5, p.y),
      part: PART.limb,
      rough: 0.22,
      matrix: compose(elbow, euler(), v3(1.15, 1.15, 1.15)),
    });
    const fore = taperedTube(
      [
        v3(elbow.x, elbow.y + 0.3, elbow.z),
        v3(elbow.x, elbow.y - ARM.fore * 0.55, elbow.z + 0.05),
        v3(wrist.x, wrist.y + 0.1, wrist.z),
      ],
      (t) => 1.05 + Math.sin(t * Math.PI * 0.85) * 0.42,
      14,
      14,
    );
    builder.add(fore, {
      color: LIMB_COLOR,
      bone: upBone,
      bone2: foreBone,
      weight: (p) => smoothstep(elbow.y + 0.6, elbow.y - 0.6, p.y),
      part: PART.limb,
      rough: 0.22,
    });
    const fistGeo = blob(22, 16, (p) => {
      if (p.y < -0.45) p.y = -0.45 + (p.y + 0.45) * 0.55;
      if (p.z > 0.3) p.z = 0.3 + (p.z - 0.3) * 0.7;
    });
    builder.add(fistGeo, {
      color: LIMB_COLOR,
      bone: foreBone,
      bone2: handBone,
      weight: (p) => smoothstep(wrist.y + 0.5, wrist.y - 0.2, p.y),
      part: PART.limb,
      rough: 0.2,
      matrix: compose(
        v3(fist.x, fist.y + 0.1, fist.z),
        euler(0, 0, 0),
        v3(ARM.fistR * 1.02, ARM.fistR * 1.05, ARM.fistR * 1.08),
      ),
    });
    for (let j = 0; j < 4; j++) {
      const kx = fist.x + (j - 1.5) * 0.55 * sign;
      const kz = fist.z + 0.55;
      builder.add(rockGeometry(`knuckle-${i}-${j}`, 0.36 + rng() * 0.1), {
        color: ROCK_COLOR,
        color2: 0x6f6a74,
        shade: (p) => smoothstep(fist.y, fist.y - 1.2, p.y),
        bone: handBone,
        part: PART.rock,
        rough: 0.9,
        matrix: compose(v3(kx, fist.y - 0.85, kz), euler(rng() * 0.8, rng() * 3, rng() * 0.5), v3(1, 1, 1)),
      });
    }
    for (let j = 0; j < 3; j++) {
      const y = elbow.y - 1.2 - j * 1.3;
      builder.add(rockGeometry(`fore-${i}-${j}`, 0.42 + rng() * 0.2), {
        color: ROCK_COLOR,
        bone: foreBone,
        part: PART.rock,
        rough: 0.9,
        matrix: compose(
          v3(elbow.x + 0.75 * sign, y, elbow.z + (rng() - 0.5) * 0.9),
          euler(rng(), rng() * 3, rng()),
          v3(1, 1, 1),
        ),
      });
    }
    const slot = i === 0 ? 0 : 1;
    const socket = v3(fist.x + 0.15 * sign, wrist.y - 0.35, fist.z - 1);
    crystals[slot] = {
      pos: socket.clone().add(v3(0, 0, -0.55)),
      bone: handBone,
    };
    addCrystal(
      builder,
      socket,
      v3(0.15 * sign, 0.45, -1).normalize(),
      handBone,
      PART.crystal0 + slot,
      CRYSTAL_COLORS[slot],
      1.9,
      0.42,
      `hand-${i}`,
    );
    dripPoints.push(
      {
        pos: v3(elbow.x, elbow.y - 0.8, elbow.z - 0.6),
        bone: foreBone,
      },
      {
        pos: v3(fist.x, fist.y - 0.8, fist.z),
        bone: handBone,
      },
    );
    surface.push(
      {
        pos: v3(shoulder.x, shoulder.y, shoulder.z),
        bone: BONE.chest,
      },
      {
        pos: v3(elbow.x, elbow.y, elbow.z),
        bone: upBone,
      },
      {
        pos: v3(fist.x, fist.y, fist.z),
        bone: handBone,
      },
    );
  }
  for (let j = 0; j < 2; j++) {
    const sign = j === 0 ? 1 : -1;
    const slot = j === 0 ? 2 : 3;
    const socket = v3(3.55 * sign, 8.7, 0);
    crystals[slot] = {
      pos: socket.clone().add(v3(0.45 * sign, 1.2, -0.1)),
      bone: BONE.chest,
    };
    addCrystal(
      builder,
      socket,
      v3(0.45 * sign, 1, -0.12).normalize(),
      BONE.chest,
      PART.crystal0 + slot,
      CRYSTAL_COLORS[slot],
      3.1,
      0.62,
      `shoulder-${j}`,
    );
    for (let k = 0; k < 3; k++)
      builder.add(rockGeometry(`sh-${j}-${k}`, 0.5 + rng() * 0.25), {
        color: ROCK_COLOR,
        color2: 0x6f6a74,
        shade: (p) => smoothstep(8.5, 7, p.y),
        bone: BONE.chest,
        part: PART.rock,
        rough: 0.9,
        matrix: compose(
          v3((2.3 + k * 0.75) * sign, 8.3 + rng() * 0.5, -1 + k * 0.5),
          euler(rng(), rng() * 3, rng()),
          v3(1, 1, 1),
        ),
      });
  }
  for (let i = 0; i < 5; i++) {
    const spread = ((i - 2) / 2) * 1.1;
    const tuft = taperedTube(
      [
        v3(spread * 0.9, 7.15, 1),
        v3(spread * 1.3, 7.2, -0.8),
        v3(spread * 1.6, 6.5, -2.4),
        v3(spread * 1.9, 5.4, -3.3),
        v3(spread * 2, 4.3, -3.6),
      ],
      (t) => 0.62 * (1 - t) + 0.08,
      18,
      10,
    );
    builder.add(tuft, {
      color: BODY_COLOR,
      bone: BONE.head,
      bone2: BONE.mane,
      weight: (p) => smoothstep(0.8, -1.2, p.z),
      part: PART.tuft,
      rough: 0.18,
    });
    dripPoints.push({
      pos: v3(spread * 2, 4.6, -3.5),
      bone: BONE.mane,
    });
  }
  [
    [1.6, 6, -2.6, -1.35, -0.55, 0],
    [-1.4, 5, -2.8, -1.45, 0.6, 3],
  ].forEach(([x, y2, z, pitch, roll, colorIndex], i) => {
    const len = 2.9 + i * 0.4;
    const tilt = new Euler(pitch, 0, roll, 'YXZ');
    const axis = v3(0, 1, 0).applyEuler(tilt);
    const handleEnd = v3(x, y2, z).addScaledVector(axis, -0.8);
    const ferrulePos = v3(x, y2, z).addScaledVector(axis, len);
    const handle = taperedTube(
      [handleEnd, v3(x, y2, z).addScaledVector(axis, len * 0.5), ferrulePos],
      (t) => 0.2 - t * 0.04,
      8,
      8,
    );
    builder.add(handle, {
      color: WOOD_COLOR,
      color2: 0x5d4d3d,
      shade: (p) => smoothstep(y2, y2 + 2, p.y) * 0.4,
      bone: BONE.brush,
      part: PART.wood,
      rough: 0.75,
    });
    const head = ferrulePos.clone();
    const rot = new Quaternion().setFromUnitVectors(v3(0, 1, 0), axis);
    const ferrule = new CylinderGeometry(0.27, 0.23, 0.45, 10);
    builder.add(ferrule, {
      color: 0x9a8f7d,
      bone: BONE.brush,
      part: PART.rock,
      rough: 0.5,
      matrix: new Matrix4().compose(head.clone().addScaledVector(axis, 0.15), rot, v3(1, 1, 1)),
    });
    const bristles = smoothLathe(
      [
        [0, 0.28],
        [0.25, 0.42],
        [0.6, 0.5],
        [0.95, 0.44],
        [1.15, 0.26],
        [1.25, 0],
      ],
      10,
      12,
    );
    bristles.translate(0, 0.35, 0);
    const position = bristles.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const angle = Math.atan2(position.getZ(i), position.getX(i));
      const flare = 1 + 0.12 * Math.sin(angle * 5) * Math.max(0, y - 0.6);
      position.setXYZ(i, position.getX(i) * flare, y, position.getZ(i) * flare);
    }
    bristles.computeVertexNormals();
    builder.add(bristles, {
      color: CRYSTAL_COLORS[colorIndex],
      color2: 0x6d6873,
      shade: () => 0.75,
      bone: BONE.brush,
      part: PART.bristle,
      rough: 0.8,
      matrix: new Matrix4().compose(head, rot, v3(1, 1, 1)),
    });
  });
  [
    [0.6, 4.2, -3, 0.7],
    [-1.8, 3.1, -2.6, 0.6],
    [2.4, 2.2, -2.2, 0.55],
    [-2.6, 5.6, -1.6, 0.5],
    [1.9, 0.9, 2.9, 0.5],
  ].forEach(([x, y, z, size], i) => {
    builder.add(rockGeometry(`back-${i}`, size), {
      color: ROCK_COLOR,
      color2: 0x6f6a74,
      shade: (p) => smoothstep(y + size * 0.3, y - size * 0.6, p.y),
      bone: y > 3.5 ? BONE.chest : BONE.belly,
      part: PART.rock,
      rough: 0.9,
      matrix: compose(v3(x, y, z), euler(rng(), rng() * 3, rng()), v3(1, 1, 1)),
    });
  });
  const addDrip = (x, y, z, bone, radius, len) => {
    const dripLen = len * (0.7 + rng() * 0.6);
    builder.add(dripGeometry(radius * (0.8 + rng() * 0.4), dripLen), {
      color: BODY_COLOR,
      bone,
      part: PART.drip,
      rough: 0.14,
      matrix: compose(v3(x, y, z), euler(0, rng() * 6, 0), v3(1, 1, 1)),
      drip: {
        phase: rng(),
        len: dripLen * 0.9,
        bodyLen: dripLen,
      },
    });
    dripPoints.push({
      pos: v3(x, y - dripLen, z),
      bone,
    });
  };
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2 + rng() * 0.3;
    const y = 1.5 + rng() * 5.2;
    const ringR = 3.3 + (y > 4 ? 0.2 : 0);
    const x2 = Math.sin(ang) * ringR * 1.1;
    const z = Math.cos(ang) * ringR * 0.86 + 1.25 * MathUtils.clamp((y - 2) / 6.4, 0, 1) ** 2;
    if (!(Math.cos(ang) > 0.6 && y > 5)) addDrip(x2, y, z, y > 4 ? BONE.chest : BONE.belly, 0.2, 0.9);
  }
  for (const side of [1, -1]) addDrip(3.9 * side, 6.1, 0.9, BONE.chest, 0.24, 1.2);
  addDrip(0.6, 4.1, 4.3, BONE.jaw, 0.12, 0.6);
  addDrip(-0.7, 4.15, 4.25, BONE.jaw, 0.1, 0.5);
  surface.push(
    {
      pos: v3(0, 7.8, 0.8),
      bone: BONE.chest,
    },
    {
      pos: v3(2.2, 5, 1.8),
      bone: BONE.chest,
    },
    {
      pos: v3(-2.2, 5, 1.8),
      bone: BONE.chest,
    },
    {
      pos: v3(0, 5.5, -2.6),
      bone: BONE.chest,
    },
    {
      pos: v3(2.8, 2.5, 0.5),
      bone: BONE.belly,
    },
    {
      pos: v3(-2.8, 2.5, 0.5),
      bone: BONE.belly,
    },
    {
      pos: v3(0, 2.8, 3.1),
      bone: BONE.belly,
    },
    {
      pos: v3(0, 7, 2.6),
      bone: BONE.head,
    },
  );
  const rig = {
    pivots,
    shoulders,
    elbows,
    wrists,
    fists,
    maskCenter: maskPos.clone().add(v3(0, 0, 0.35)),
    mouth,
    crystals,
    dripPoints,
    surface,
  };
  return {
    geometry: builder.build(),
    rig,
  };
}
function addCrystal(builder, base, dir, bone, part, color, height, radius, seed) {
  const rng = makeRng(`greymaw-crystal-${seed}`);
  const up = v3(0, 1, 0);
  const layout = [
    [0, 0, 1, 1],
    [0.55, 0.3, 0.62, 0.7],
    [-0.5, 0.35, 0.55, 0.65],
    [0.1, -0.6, 0.48, 0.6],
    [-0.3, -0.45, 0.4, 0.55],
  ];
  const tangent = new Vector3().crossVectors(dir, Math.abs(dir.y) < 0.9 ? up : v3(1, 0, 0)).normalize();
  const bitangent = new Vector3().crossVectors(dir, tangent).normalize();
  layout.forEach(([ox, oy, hMul, rMul], i) => {
    const axis = dir
      .clone()
      .addScaledVector(tangent, ox * 0.8)
      .addScaledVector(bitangent, oy * 0.8)
      .normalize();
    const rot = new Quaternion().setFromUnitVectors(up, axis);
    const pos = base
      .clone()
      .addScaledVector(tangent, ox * radius * 0.9)
      .addScaledVector(bitangent, oy * radius * 0.9);
    const shard = crystalGeometry(height * hMul * (0.9 + rng() * 0.2), radius * rMul, `${seed}-${i}`);
    builder.add(shard, {
      color,
      bone,
      part,
      rough: 0.05,
      matrix: new Matrix4().compose(pos, rot, v3(1, 1, 1)),
    });
  });
  builder.add(blob(12, 8), {
    color: BODY_DARK_COLOR,
    bone,
    part: PART.body,
    rough: 0.2,
    matrix: compose(base, euler(), v3(radius * 1.9, radius * 1.2, radius * 1.9)),
  });
}
