/**
 * The hero's body mesh: classic and sky outfit colours, skinning rules for torso, tunic, neck and head, the sculpted head with hair and hood, tunic, belt vials, satchel, arms, legs and boots, and the paintbrush, merged into one skinned geometry per outfit.
 */
import { CatmullRomCurve3, Color, Quaternion, SphereGeometry, Vector3 } from 'three';
import { PALETTE } from '../core/config.js';
import {
  capsule,
  ellipsoid,
  loft,
  loftPanels,
  SkinnedMeshBuilder,
  smoothstep,
  torus,
  trs,
  tube,
  weld,
} from './mesh-builder.js';
import { BONE, HEAD_CENTER, HEAD_RADIUS, REST_POS } from './rig.js';
export const HERO_COLORS = {
  skin: 0xf6c6a0,
  skinShade: 0xe9a987,
  nose: 16169877,
  blush: 15765382,
  eye: 0x2a1a17,
  hair: 0x6a3a26,
  hairLight: 0x8a4e30,
  tunic: 15919055,
  tunicShade: 0xe3d3b3,
  hood: 2059120,
  hoodLight: 0x2a8288,
  hoodInner: 1195844,
  scarf: 0xd4602f,
  scarfDark: 0xa9441f,
  trousers: 4081240,
  trousersLight: 0x4f5a72,
  leather: 8210986,
  leatherDark: 0x4f2d19,
  leatherLight: 0x9c6238,
  brass: 14724172,
  wood: 0xa8703f,
  woodDark: 0x7b4c28,
  bristle: 16051416,
  sole: 3810327,
};
export const SKY_OUTFIT_COLORS = {
  hood: 16183782,
  hoodLight: 0xfffcf4,
  hoodShade: 0xe2dccf,
  hoodInner: 2833016,
  scarf: 0x4db3f0,
  scarfDark: 0x2a82c8,
  scarfLight: 0xe8f6ff,
  gold: 15909198,
  goldLight: 0xffe8a0,
  goldDark: 0xb8862a,
  gem: 0x6fd0ff,
};
/** The scarf an outfit comes with, [base, dark, band]: what the hero wears without one from the wardrobe. */
export const outfitScarf = (outfit) =>
  outfit === 'sky'
    ? [SKY_OUTFIT_COLORS.scarf, SKY_OUTFIT_COLORS.scarfDark, SKY_OUTFIT_COLORS.scarfLight]
    : [HERO_COLORS.scarf, HERO_COLORS.scarfDark, HERO_COLORS.tunic];
/** The classic hood's own colours, [base, light, lining] (a wardrobe hood dyes the classic outfit's hood). */
export const classicHood = () => [HERO_COLORS.hood, HERO_COLORS.hoodLight, HERO_COLORS.hoodInner];
const hoodLit = (light) => [1 - light, light, 0];
const HOOD_LIGHT = [0, 1, 0];
const HOOD_LINING = [0, 0, 1];
const toColor = (hex) => new Color(hex);
const SUNSET_RAMP = [16765534, 16753500, 16740216, 13198520].map((hex) => new Color(hex));
function sunsetColor(u, out) {
  const scaled = saturate(u) * (SUNSET_RAMP.length - 1);
  const idx = Math.min(SUNSET_RAMP.length - 2, Math.floor(scaled));
  return out.copy(SUNSET_RAMP[idx]).lerp(SUNSET_RAMP[idx + 1], scaled - idx);
}
export const BRUSH_DIMS = {
  length: 1.345,
  tip: new Vector3(0, 1.335, 0.045),
  grip: 0.2,
  bristleStart: 1.03,
};
const saturate = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const torsoWeights = (y) => {
  const chestW = smoothstep(1.04, 1.16, y);
  const spineW = (1 - chestW) * smoothstep(0.9, 0.99, y);
  return [1 - chestW - spineW, spineW, chestW];
};
const skinTorso = (pos, weights) => {
  const [pelvisW, spineW, chestW] = torsoWeights(pos.y);
  weights.add(BONE.chest, chestW).add(BONE.spine, spineW).add(BONE.pelvis, pelvisW);
};
const skinTunic = (panels) => (pos, weights, idx) => {
  const [pelvisW, spineW, chestW] = torsoWeights(pos.y);
  const panel = panels[idx] ?? 0;
  const legW =
    (0.62 + 0.26 * (panel === 1 ? 1 : panel === -1 ? 0 : smoothstep(-0.09, 0.09, pos.z))) *
    smoothstep(0.95, 0.75, pos.y);
  const leftW = saturate(0.5 + pos.x / 0.13);
  weights
    .add(BONE.chest, chestW)
    .add(BONE.spine, spineW)
    .add(BONE.pelvis, pelvisW * (1 - legW));
  weights.add(BONE.thighL, pelvisW * legW * leftW).add(BONE.thighR, pelvisW * legW * (1 - leftW));
};
const skinNeck = (pos, weights) => {
  const neckW = smoothstep(1.26, 1.34, pos.y);
  weights.add(BONE.neck, neckW).add(BONE.chest, 1 - neckW);
};
const skinHead = (pos, weights) => {
  const headW = smoothstep(1.35, 1.45, pos.y) * 0.85 + 0.15;
  weights.add(BONE.head, headW).add(BONE.neck, 1 - headW);
};
const PAINT_SPLATS = [
  {
    c: new Vector3(0.12, 0.8, 0.13),
    r: 0.048,
    color: PALETTE.red.hex,
  },
  {
    c: new Vector3(0.075, 0.84, 0.135),
    r: 0.02,
    color: PALETTE.red.hex,
  },
  {
    c: new Vector3(-0.1, 1.08, 0.12),
    r: 0.034,
    color: PALETTE.blue.hex,
  },
  {
    c: new Vector3(-0.16, 0.76, -0.07),
    r: 0.042,
    color: PALETTE.yellow.hex,
  },
  {
    c: new Vector3(0.03, 0.76, -0.15),
    r: 0.038,
    color: PALETTE.green.hex,
  },
  {
    c: new Vector3(-0.06, 0.75, 0.15),
    r: 0.018,
    color: PALETTE.yellow.hex,
  },
  {
    c: new Vector3(0.2, 1.13, 0.03),
    r: 0.028,
    color: PALETTE.blue.hex,
  },
];
const _splatColor = new Color();
function applyPaintSplats(pos, base, out) {
  out.copy(base);
  for (const splat of PAINT_SPLATS) {
    const dist = pos.distanceTo(splat.c);
    if (dist < splat.r) {
      const k = smoothstep(splat.r, splat.r * 0.55, dist);
      _splatColor.set(splat.color).lerp(base, 0.12);
      out.lerp(_splatColor, k * 0.92);
    }
  }
}
const CHEEK_L = new Vector3(0.6, -0.32, 0.74).normalize();
const CHEEK_R = new Vector3(-0.6, -0.32, 0.74).normalize();
const CHIN = new Vector3(0, -0.74, 0.67).normalize();
const _headDir = new Vector3();
function headRadius(dir) {
  let radius = HEAD_RADIUS / Math.sqrt(dir.x * dir.x + (dir.y / 0.955) ** 2 + (dir.z / 0.97) ** 2);
  const jaw = smoothstep(-0.05, -0.95, dir.y);
  radius *= 1 - jaw * (0.3 * dir.x * dir.x + 0.07) - 0.07 * smoothstep(-0.55, -1, dir.y);
  radius *= 1 - 0.03 * smoothstep(0.72, 1, dir.z) * (1 - jaw);
  radius +=
    0.0075 * Math.exp(-dir.distanceToSquared(CHEEK_L) / 0.06) +
    0.0075 * Math.exp(-dir.distanceToSquared(CHEEK_R) / 0.06);
  radius += 0.008 * Math.exp(-dir.distanceToSquared(CHIN) / 0.03);
  return radius;
}
const FACE_NORMAL_CENTER = new Vector3(0, -0.015, -0.11);
const _faceDir = new Vector3();
export function smoothFaceNormal(pos, normal) {
  const faceW = smoothstep(-0.2, 0.55, pos.z / HEAD_RADIUS) * (1 - smoothstep(0.08, 0.16, pos.y));
  _faceDir.subVectors(pos, FACE_NORMAL_CENTER).normalize();
  return normal.lerp(_faceDir, 0.6 * faceW).normalize();
}
export function headSurface(x, y, lift, out) {
  const dir = _headDir.set(x, y, Math.sqrt(Math.max(0.000001, HEAD_RADIUS * HEAD_RADIUS - x * x - y * y))).normalize();
  for (let i = 0; i < 8; i++) {
    const rad = headRadius(dir);
    const z = Math.sqrt(Math.max(0.000001, rad * rad - x * x - y * y));
    dir.set(x, y, z).normalize();
  }
  const radius = headRadius(dir) + lift;
  return out.copy(dir).multiplyScalar(radius);
}
function buildBody(builder, outfit) {
  const sky = outfit === 'sky';
  const tunicCol = toColor(HERO_COLORS.tunic);
  const shadeCol = toColor(HERO_COLORS.tunicShade);
  const goldCol = toColor(SKY_OUTFIT_COLORS.gold);
  const rampColor = new Color();
  const tunicRings = [
    {
      y: 1.318,
      rx: 0.066,
      rz: 0.06,
      cz: -0.006,
    },
    {
      y: 1.29,
      rx: 0.113,
      rz: 0.088,
      cz: -0.004,
    },
    {
      y: 1.25,
      rx: 0.146,
      rz: 0.104,
    },
    {
      y: 1.2,
      rx: 0.154,
      rz: 0.113,
      cz: 0.004,
    },
    {
      y: 1.13,
      rx: 0.148,
      rz: 0.116,
      cz: 0.01,
    },
    {
      y: 1.055,
      rx: 0.136,
      rz: 0.107,
      cz: 0.008,
    },
    {
      y: 0.995,
      rx: 0.128,
      rz: 0.1,
      cz: 0.004,
    },
    {
      y: 0.94,
      rx: 0.137,
      rz: 0.106,
    },
    {
      y: 0.885,
      rx: 0.161,
      rz: 0.128,
      cz: 0,
    },
    {
      y: 0.835,
      rx: 0.17,
      rz: 0.136,
      cz: 0,
    },
    {
      y: 0.785,
      rx: 0.173,
      rz: 0.14,
      cz: 0,
    },
    {
      y: 0.742,
      rx: 0.177,
      rz: 0.143,
      cz: 0,
    },
    {
      y: 0.716,
      rx: 0.179,
      rz: 0.145,
      cz: 0,
    },
    {
      y: 0.708,
      rx: 0.172,
      rz: 0.138,
      cz: 0,
    },
  ];
  const tunic = loftPanels(tunicRings, 32, 10, {
    capTop: true,
    yJitter: (angle, ring) => (ring >= 11 ? 0.007 * Math.sin(angle * 5 + 0.7) : 0),
  });
  builder.add(tunic.geo, {
    color: (pos, normal, out) => {
      const hem = smoothstep(0.76, 0.72, pos.y);
      const col = tunicCol.clone().lerp(shadeCol, smoothstep(0.8, 0.72, pos.y) * 0.45 + hem * 0.45);
      if (sky && pos.y < 0.745) col.lerp(goldCol, 0.85);
      applyPaintSplats(pos, col, out);
    },
    bone: skinTunic(tunic.panel),
  });
  builder.add(
    loft(
      [
        {
          y: 0.992,
          rx: 0.13,
          rz: 0.102,
          cz: 0.004,
        },
        {
          y: 0.988,
          rx: 0.136,
          rz: 0.108,
          cz: 0.004,
        },
        {
          y: 0.95,
          rx: 0.14,
          rz: 0.11,
          cz: 0.001,
        },
        {
          y: 0.946,
          rx: 0.135,
          rz: 0.105,
        },
      ],
      28,
    ),
    {
      color: HERO_COLORS.leather,
      bone: skinTorso,
    },
  );
  builder.add(roundedBox(0.05, 0.046, 0.016, 0.006), {
    color: HERO_COLORS.brass,
    bone: BONE.pelvis,
    matrix: trs(0, 0.969, 0.112),
    outline: 0.6,
  });
  builder.add(roundedBox(0.03, 0.026, 0.02, 0.005), {
    color: HERO_COLORS.leatherDark,
    bone: BONE.pelvis,
    matrix: trs(0, 0.969, 0.113),
    outline: 0,
  });
  const vialColors = [PALETTE.red.hex, PALETTE.blue.hex, PALETTE.yellow.hex, PALETTE.green.hex];
  for (let i = 0; i < 4; i++) {
    const angle = -0.45 - i * 0.3;
    const vx = Math.sin(angle) * 0.145;
    const vz = Math.cos(angle) * 0.116;
    builder.add(
      loft(
        [
          {
            y: 0.952,
            rx: 0.008,
            rz: 0.008,
          },
          {
            y: 0.942,
            rx: 0.013,
            rz: 0.013,
          },
          {
            y: 0.909,
            rx: 0.014,
            rz: 0.014,
          },
          {
            y: 0.902,
            rx: 0.009,
            rz: 0.009,
          },
        ],
        8,
        {
          capBottom: true,
          capTop: true,
        },
      ),
      {
        color: vialColors[i],
        bone: BONE.pelvis,
        matrix: trs(vx, 0, vz, 0, angle, 0),
        outline: 0.5,
      },
    );
    builder.add(ellipsoid(0.008, 0.009, 0.008, 6, 4), {
      color: HERO_COLORS.wood,
      bone: BONE.pelvis,
      matrix: trs(vx, 0.957, vz),
      outline: 0,
    });
  }
  builder.add(capsule(0, -0.006, 1.4, 1.24, 0.045, 0.05, 12, 2), {
    color: HERO_COLORS.skin,
    bone: skinNeck,
    outline: 0.5,
  });
  const capeletRings = [
    {
      y: 1.35,
      rx: 0.088,
      rz: 0.084,
      cz: -0.012,
    },
    {
      y: 1.315,
      rx: 0.13,
      rz: 0.112,
      cz: -0.012,
    },
    {
      y: 1.28,
      rx: 0.176,
      rz: 0.134,
      cz: -0.008,
    },
    {
      y: 1.235,
      rx: 0.232,
      rz: 0.16,
      cz: -0.004,
    },
    {
      y: 1.182,
      rx: 0.244,
      rz: 0.168,
    },
    {
      y: 1.152,
      rx: 0.246,
      rz: 0.17,
    },
    {
      y: 1.155,
      rx: 0.232,
      rz: 0.158,
    },
  ];
  const capeletLight = (pos) => smoothstep(1.25, 1.17, pos.y) * 0.35;
  builder.add(
    loft(capeletRings, 32, {
      yJitter: (angle, ring) => (ring >= 4 ? -0.018 * (0.5 + 0.5 * Math.cos(angle * 7)) : 0),
    }),
    {
      color: sky
        ? (pos, normal, out) => {
            out
              .set(SKY_OUTFIT_COLORS.hood)
              .lerp(toColor(SKY_OUTFIT_COLORS.hoodShade), smoothstep(1.3, 1.2, pos.y) * 0.25);
            const hem = smoothstep(1.2, 1.185, pos.y);
            if (hem > 0) out.lerp(sunsetColor(smoothstep(1.195, 1.152, pos.y), rampColor), hem);
            if (Math.abs(pos.y - 1.203) < 0.007) out.set(SKY_OUTFIT_COLORS.gold);
            if (normal.y < -0.5) out.set(SKY_OUTFIT_COLORS.hoodInner);
          }
        : (pos, normal, out) => {
            out.set(HERO_COLORS.hood).lerp(toColor(HERO_COLORS.hoodLight), capeletLight(pos));
            if (normal.y < -0.5) out.set(HERO_COLORS.hoodInner);
          },
      hood: sky ? undefined : (pos, normal) => (normal.y < -0.5 ? HOOD_LINING : hoodLit(capeletLight(pos))),
      bone: (pos, weights) => {
        const armW = 0.28 * smoothstep(0.12, 0.23, Math.abs(pos.x)) * smoothstep(1.31, 1.19, pos.y);
        const neckW = 0.25 * smoothstep(1.29, 1.35, pos.y);
        weights.add(BONE.chest, 1 - armW - neckW).add(BONE.neck, neckW);
        weights.add(pos.x > 0 ? BONE.armL : BONE.armR, armW);
      },
    },
  );
  if (sky) {
    const capeletAt = (y) => ringAt(capeletRings, y);
    const claspY = 1.214;
    const ring = capeletAt(claspY);
    const frontZ = (x) => (ring.cz ?? 0) + ring.rz * Math.sqrt(Math.max(0, 1 - (x * x) / (ring.rx * ring.rx)));
    for (const side of [1, -1]) {
      const px = side * 0.112;
      const pz = frontZ(px) + 0.006;
      const angle = Math.atan2(px / (ring.rx * ring.rx), (pz - (ring.cz ?? 0)) / (ring.rz * ring.rz));
      builder.add(torus(0.024, 0.0065, 8, 22), {
        color: SKY_OUTFIT_COLORS.gold,
        bone: BONE.chest,
        matrix: trs(px, claspY, pz, 0, angle, 0),
        outline: 0.5,
      });
      builder.add(ellipsoid(0.02, 0.02, 0.008, 12, 8), {
        color: SKY_OUTFIT_COLORS.goldLight,
        bone: BONE.chest,
        matrix: trs(px, claspY, pz + Math.cos(angle) * 0.002, 0, angle, 0),
        outline: 0,
      });
      builder.add(ellipsoid(0.0105, 0.0105, 0.0075, 10, 8), {
        color: SKY_OUTFIT_COLORS.gem,
        bone: BONE.chest,
        matrix: trs(px + Math.sin(angle) * 0.006, claspY, pz + Math.cos(angle) * 0.007, 0, angle, 0),
        outline: 0.3,
      });
    }
    const chain = [];
    for (let i = 0; i <= 12; i++) {
      const f = i / 12;
      const px = 0.1 * (f * 2 - 1);
      const py = claspY - 0.03 * Math.sin(Math.PI * f);
      const sec = capeletAt(py);
      chain.push(
        new Vector3(px, py, (sec.cz ?? 0) + sec.rz * Math.sqrt(Math.max(0, 1 - (px * px) / (sec.rx * sec.rx))) + 0.007),
      );
    }
    builder.add(
      tube(chain, () => [0.0035, 0.0035], 6),
      {
        color: SKY_OUTFIT_COLORS.gold,
        bone: BONE.chest,
        outline: 0.3,
      },
    );
  }
  const strap = [];
  for (let i = 0; i < 40; i++) {
    const angle = (i / 40) * Math.PI * 2;
    const sinA = Math.sin(angle);
    const py = 1.06 + 0.21 * sinA * (sinA > 0 ? 1 : 0.8);
    const sec = ringAt(tunicRings, py);
    const px = -sinA * (sec.rx + 0.006);
    const pz = (sec.cz ?? 0) + Math.cos(angle) * (sec.rz + 0.007);
    strap.push(new Vector3(px, py, pz));
  }
  builder.add(
    tube(strap, () => [0.017, 0.0055], 6, {
      closed: true,
      up: (idx, pt) => new Vector3(pt.x, 0, pt.z).normalize(),
    }),
    {
      color: HERO_COLORS.leatherDark,
      bone: skinTorso,
      outline: 0.4,
    },
  );
  const skinSatchel = ((bone) => (pos, weights) => {
    const k = smoothstep(0.93, 0.87, pos.y);
    weights.add(bone, k).add(BONE.pelvis, 1 - k);
  })(BONE.satchel);
  builder.add(roundedBox(0.072, 0.11, 0.14, 0.026), {
    color: HERO_COLORS.leather,
    bone: skinSatchel,
    matrix: trs(0.212, 0.85, 0.01, 0, 0, -0.08),
  });
  builder.add(roundedBox(0.08, 0.06, 0.148, 0.024), {
    color: HERO_COLORS.leatherDark,
    bone: skinSatchel,
    matrix: trs(0.216, 0.885, 0.01, 0, 0, -0.08),
  });
  builder.add(ellipsoid(0.009, 0.013, 0.013, 8, 6), {
    color: HERO_COLORS.brass,
    bone: skinSatchel,
    matrix: trs(0.254, 0.862, 0.01),
    outline: 0.4,
  });
  builder.add(capsule(0.205, -0.042, 0.96, 0.87, 0.015, 0.015, 8, 2), {
    color: 0xfff6e0,
    bone: skinSatchel,
    outline: 0.5,
  });
  for (const side of [1, -1]) {
    const left = side === 1;
    const arm = left ? BONE.armL : BONE.armR;
    const fore = left ? BONE.foreL : BONE.foreR;
    const hand = left ? BONE.handL : BONE.handR;
    const fingers = left ? BONE.fingersL : BONE.fingersR;
    const shoulder = REST_POS[arm];
    const elbow = REST_POS[fore];
    const wrist = REST_POS[hand];
    const armX = shoulder.x;
    builder.add(ellipsoid(0.049, 0.049, 0.049, 14, 10), {
      color: HERO_COLORS.tunic,
      bone: arm,
      matrix: trs(armX, shoulder.y - 0.02, 0),
    });
    builder.add(
      loft(
        [
          {
            y: shoulder.y - 0.015,
            rx: 0.042,
            rz: 0.042,
            cx: armX,
          },
          {
            y: shoulder.y - 0.045,
            rx: 0.056,
            rz: 0.055,
            cx: armX,
          },
          {
            y: shoulder.y - 0.11,
            rx: 0.058,
            rz: 0.056,
            cx: armX,
          },
          {
            y: elbow.y + 0.07,
            rx: 0.052,
            rz: 0.05,
            cx: armX,
          },
          {
            y: elbow.y + 0.05,
            rx: 0.046,
            rz: 0.045,
            cx: armX,
          },
          {
            y: elbow.y + 0.043,
            rx: 0.034,
            rz: 0.034,
            cx: armX,
          },
        ],
        16,
      ),
      {
        color: (pos, normal, out) => applyPaintSplats(pos, toColor(HERO_COLORS.tunic), out),
        bone: arm,
      },
    );
    builder.add(torus(0.047, 0.011, 8, 18), {
      color: HERO_COLORS.tunicShade,
      bone: arm,
      matrix: trs(armX, elbow.y + 0.056, 0, Math.PI / 2, 0, 0),
    });
    builder.add(capsule(armX, 0, elbow.y + 0.06, elbow.y, 0.037, 0.037, 12, 2), {
      color: HERO_COLORS.skin,
      bone: arm,
      outline: 0.8,
    });
    builder.add(ellipsoid(0.039, 0.041, 0.042, 12, 8), {
      color: HERO_COLORS.skin,
      bone: fore,
      matrix: trs(armX, elbow.y, -0.004),
    });
    builder.add(
      loft(
        [
          {
            y: elbow.y + 0.004,
            rx: 0.036,
            rz: 0.037,
            cx: armX,
          },
          {
            y: elbow.y - 0.045,
            rx: 0.042,
            rz: 0.042,
            cx: armX,
            cz: -0.002,
          },
          {
            y: elbow.y - 0.11,
            rx: 0.04,
            rz: 0.04,
            cx: armX,
          },
          {
            y: wrist.y + 0.02,
            rx: 0.033,
            rz: 0.034,
            cx: armX,
          },
          {
            y: wrist.y - 0.004,
            rx: 0.028,
            rz: 0.03,
            cx: armX,
          },
        ],
        14,
        {
          capBottom: true,
        },
      ),
      {
        color: HERO_COLORS.skin,
        bone: fore,
      },
    );
    builder.add(
      loft(
        [
          {
            y: elbow.y - 0.07,
            rx: 0.04,
            rz: 0.04,
            cx: armX,
          },
          {
            y: elbow.y - 0.077,
            rx: 0.047,
            rz: 0.047,
            cx: armX,
          },
          {
            y: wrist.y + 0.03,
            rx: 0.045,
            rz: 0.046,
            cx: armX,
          },
          {
            y: wrist.y + 0.012,
            rx: 0.045,
            rz: 0.046,
            cx: armX,
          },
          {
            y: wrist.y + 0.006,
            rx: 0.034,
            rz: 0.035,
            cx: armX,
          },
        ],
        14,
      ),
      {
        color: (pos, normal, out) =>
          out.set(
            Math.abs(pos.y - (elbow.y - 0.13)) < 0.007 || Math.abs(pos.y - (wrist.y + 0.05)) < 0.006
              ? HERO_COLORS.leatherLight
              : HERO_COLORS.leather,
          ),
        bone: fore,
      },
    );
    builder.add(roundedBox(0.037, 0.064, 0.07, 0.017), {
      color: HERO_COLORS.skin,
      bone: hand,
      matrix: trs(armX + side * 0.004, wrist.y - 0.03, 0.004, 0, 0, side * 0.05),
    });
    const fingersGeo = ellipsoid(0.019, 0.034, 0.035, 14, 10);
    {
      const position = fingersGeo.attributes.position;
      for (let j = 0; j < position.count; j++) {
        const x = position.getX(j);
        const y = position.getY(j);
        if (x * side < 0) position.setX(j, x * 0.8);
        if (y > 0) position.setY(j, y * 0.8);
      }
      fingersGeo.computeVertexNormals();
    }
    const fingersPos = REST_POS[fingers];
    builder.add(fingersGeo, {
      color: HERO_COLORS.skin,
      bone: fingers,
      matrix: trs(fingersPos.x - side * 0.002, fingersPos.y - 0.024, 0.003),
    });
    const thumbBase = new Vector3(armX - side * 0.004, wrist.y - 0.014, 0.03);
    const thumbMid = new Vector3(armX - side * 0.01, wrist.y - 0.042, 0.047);
    const thumbTip = new Vector3(armX - side * 0.014, wrist.y - 0.058, 0.046);
    builder.add(
      tube(
        [thumbBase, thumbBase.clone().lerp(thumbMid, 0.5), thumbMid, thumbTip],
        (along) => [0.0145 - 0.002 * along, 0.0135 - 0.002 * along],
        10,
        {
          caps: true,
        },
      ),
      {
        color: HERO_COLORS.skin,
        bone: hand,
      },
    );
  }
  builder.add(ellipsoid(0.13, 0.08, 0.108, 16, 10), {
    color: HERO_COLORS.trousers,
    bone: (pos, weights) => {
      const legW = smoothstep(0.86, 0.78, pos.y);
      const leftW = saturate(0.5 + pos.x / 0.1);
      weights
        .add(BONE.pelvis, 1 - legW * 0.6)
        .add(BONE.thighL, legW * 0.6 * leftW)
        .add(BONE.thighR, legW * 0.6 * (1 - leftW));
    },
    matrix: trs(0, 0.845, -0.006),
    outline: 0.6,
  });
  for (const side of [1, -1]) {
    const left = side === 1;
    const thigh = left ? BONE.thighL : BONE.thighR;
    const shin = left ? BONE.shinL : BONE.shinR;
    const foot = left ? BONE.footL : BONE.footR;
    const hip = REST_POS[thigh];
    const knee = REST_POS[shin];
    const legX = hip.x;
    const thighRings = [
      {
        y: hip.y + 0.05,
        rx: 0.042,
        rz: 0.05,
        cx: legX - side * 0.008,
        cz: 0,
      },
      {
        y: hip.y + 0.03,
        rx: 0.052,
        rz: 0.064,
        cx: legX - side * 0.008,
        cz: 0.002,
      },
      {
        y: hip.y - 0.02,
        rx: 0.058,
        rz: 0.07,
        cx: legX - side * 0.006,
        cz: 0.004,
      },
      {
        y: hip.y - 0.1,
        rx: 0.066,
        rz: 0.073,
        cx: legX - side * 0.001,
        cz: 0.007,
      },
      {
        y: hip.y - 0.16,
        rx: 0.068,
        rz: 0.073,
        cx: legX + side * 0.002,
        cz: 0.008,
      },
      {
        y: hip.y - 0.25,
        rx: 0.064,
        rz: 0.068,
        cx: legX + side * 0.001,
        cz: 0.007,
      },
      {
        y: knee.y + 0.06,
        rx: 0.057,
        rz: 0.058,
        cx: legX,
        cz: 0.006,
      },
      {
        y: knee.y + 0.02,
        rx: 0.052,
        rz: 0.053,
        cx: legX,
        cz: 0.006,
      },
    ];
    builder.add(
      loft(thighRings, 16, {
        capTop: true,
      }),
      {
        color: HERO_COLORS.trousers,
        bone: (pos, weights) => {
          const pelvisW = smoothstep(hip.y - 0.02, hip.y + 0.05, pos.y) * 0.5;
          weights.add(thigh, 1 - pelvisW).add(BONE.pelvis, pelvisW);
        },
      },
    );
    builder.add(ellipsoid(0.053, 0.056, 0.054, 12, 8), {
      color: HERO_COLORS.trousers,
      bone: shin,
      matrix: trs(legX, knee.y, 0.008),
    });
    builder.add(ellipsoid(0.036, 0.034, 0.022, 12, 8), {
      color: HERO_COLORS.trousersLight,
      bone: shin,
      matrix: trs(legX, knee.y + 0.004, 0.046),
      outline: 0.5,
    });
    builder.add(
      loft(
        [
          {
            y: knee.y - 0.01,
            rx: 0.052,
            rz: 0.053,
            cx: legX,
            cz: 0.004,
          },
          {
            y: knee.y - 0.07,
            rx: 0.053,
            rz: 0.058,
            cx: legX,
            cz: -0.004,
          },
          {
            y: knee.y - 0.12,
            rx: 0.049,
            rz: 0.054,
            cx: legX,
            cz: -0.004,
          },
          {
            y: 0.3,
            rx: 0.043,
            rz: 0.045,
            cx: legX,
            cz: 0,
          },
        ],
        14,
      ),
      {
        color: HERO_COLORS.trousers,
        bone: shin,
      },
    );
    builder.add(torus(0.047, 0.013, 8, 16), {
      color: HERO_COLORS.trousers,
      bone: shin,
      matrix: trs(legX, 0.352, 0.001, Math.PI / 2 - 0.1, 0, 0),
      outline: 0.6,
    });
    builder.add(
      loft(
        [
          {
            y: 0.332,
            rx: 0.05,
            rz: 0.052,
            cx: legX,
            cz: 0.001,
          },
          {
            y: 0.26,
            rx: 0.049,
            rz: 0.051,
            cx: legX,
            cz: 0.002,
          },
          {
            y: 0.17,
            rx: 0.046,
            rz: 0.049,
            cx: legX,
            cz: 0.003,
          },
          {
            y: 0.11,
            rx: 0.049,
            rz: 0.055,
            cx: legX,
            cz: 0.006,
          },
          {
            y: 0.07,
            rx: 0.036,
            rz: 0.038,
            cx: legX,
            cz: 0.006,
          },
        ],
        14,
        {
          capBottom: true,
        },
      ),
      {
        color: HERO_COLORS.leather,
        bone: shin,
      },
    );
    builder.add(torus(0.054, 0.016, 8, 18), {
      color: HERO_COLORS.leatherLight,
      bone: shin,
      matrix: trs(legX, 0.33, 0.002, Math.PI / 2 - 0.1, 0, 0),
    });
    builder.add(ellipsoid(0.05, 0.05, 0.056, 12, 8), {
      color: HERO_COLORS.leather,
      bone: foot,
      matrix: trs(legX, 0.08, 0.004),
    });
    const boot = roundedBox(0.09, 0.074, 0.232, 0.034);
    const position = boot.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const z = position.getZ(i);
      if (z > 0.04) position.setY(i, position.getY(i) + (z - 0.04) * (z - 0.04) * 1.5);
      if (z > 0.05) position.setX(i, position.getX(i) * (1 - (z - 0.05) * 0.9));
    }
    boot.computeVertexNormals();
    builder.add(boot, {
      color: HERO_COLORS.leather,
      bone: foot,
      matrix: trs(legX, 0.044, 0.05),
    });
    const sole = roundedBox(0.097, 0.024, 0.236, 0.011);
    builder.add(sole, {
      color: HERO_COLORS.sole,
      bone: foot,
      matrix: trs(legX, 0.012, 0.048),
      outline: 0.6,
    });
  }
  const headCenter = HEAD_CENTER;
  {
    const geometry = new SphereGeometry(1, 40, 30);
    geometry.deleteAttribute('uv');
    const head = weld(geometry);
    const position = head.attributes.position;
    const dir = new Vector3();
    for (let i = 0; i < position.count; i++) {
      dir.fromBufferAttribute(position, i).normalize();
      const radius = headRadius(dir);
      position.setXYZ(i, headCenter.x + dir.x * radius, headCenter.y + dir.y * radius, headCenter.z + dir.z * radius);
    }
    head.computeVertexNormals();
    const normal = head.attributes.normal;
    const nrm = new Vector3();
    for (let i = 0; i < position.count; i++) {
      dir.fromBufferAttribute(position, i).sub(headCenter);
      smoothFaceNormal(dir, nrm.fromBufferAttribute(normal, i));
      normal.setXYZ(i, nrm.x, nrm.y, nrm.z);
    }
    builder.add(head, {
      color: HERO_COLORS.skin,
      bone: BONE.head,
    });
  }
  {
    const nosePos = headSurface(0, -0.049, 0.001, new Vector3()).add(headCenter);
    builder.add(ellipsoid(0.0092, 0.0078, 0.0105, 12, 10), {
      color: HERO_COLORS.nose,
      bone: BONE.head,
      matrix: trs(nosePos.x, nosePos.y, nosePos.z, -0.25, 0, 0),
      outline: 0,
    });
  }
  const scalp = (x, y, lift) => headSurface(x, y - headCenter.y, lift, new Vector3()).add(headCenter);
  const addHairLock = (points, width, thickness, shine) => {
    const curve = new CatmullRomCurve3(points);
    const samples = [];
    for (let i = 0; i <= 12; i++) samples.push(curve.getPoint(i / 12));
    builder.add(
      tube(
        samples,
        (along) => [
          width * (1 - along) ** 0.5 * (0.8 + 0.2 * Math.sin(Math.PI * Math.min(1, along * 1.6))) + 0.0015,
          thickness * (1 - along * 0.65) + 0.0015,
        ],
        10,
        {
          caps: true,
          up: (idx, pt) => pt.clone().sub(headCenter).normalize(),
        },
      ),
      {
        color: (pos, normal, out) => {
          out.set(HERO_COLORS.hair);
          const facingUp = normal.y * 0.5 + 0.5;
          out.lerp(toColor(HERO_COLORS.hairLight), shine * facingUp * smoothstep(1.5, 1.58, pos.y));
        },
        bone: BONE.head,
        outline: 0.4,
      },
    );
  };
  for (const [rootX, tipX, tipY, width, lift] of [
    [-0.098, -0.128, 1.487, 0.03, 0.007],
    [-0.056, -0.088, 1.51, 0.034, 0.007],
    [-0.012, -0.044, 1.522, 0.034, 0.008],
    [0.032, 0.012, 1.518, 0.032, 0.008],
    [0.072, 0.07, 1.51, 0.03, 0.007],
    [0.104, 0.118, 1.49, 0.026, 0.007],
  ]) {
    const midY = (1.605 + tipY) / 2 + 0.012;
    addHairLock(
      [scalp(rootX, 1.61, 0.012), scalp(rootX * 0.5 + tipX * 0.5, midY, 0.019), scalp(tipX, tipY, 0.01 + lift)],
      width,
      0.015,
      0.85,
    );
  }
  for (const side of [1, -1])
    addHairLock(
      [
        scalp(side * 0.112, 1.585, 0.012),
        scalp(side * 0.13, 1.5, 0.016),
        scalp(side * 0.126, 1.42, 0.016),
        scalp(side * 0.108, 1.36, 0.022),
      ],
      0.026,
      0.014,
      0.5,
    );
  const hoodCenter = new Vector3(0, 1.49, -0.012);
  const openDir = new Vector3(0, -0.2, 1).normalize();
  const openAngle = 1.08;
  const hoodRot = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), openDir.clone().negate());
  const hoodShell = (radius) => {
    const geometry = new SphereGeometry(radius, 36, 18, 0, Math.PI * 2, 0, Math.PI - openAngle);
    geometry.deleteAttribute('uv');
    const shell = weld(geometry);
    shell.applyQuaternion(hoodRot);
    const position = shell.attributes.position;
    for (let i = 0; i < position.count; i++) {
      const y = position.getY(i);
      const z = position.getZ(i);
      position.setXYZ(i, position.getX(i) * 1.02, y * 1.03 + (y > 0 ? 0.004 : 0), z * 1.04 - Math.max(0, y) * 0.02);
    }
    shell.computeVertexNormals();
    shell.translate(hoodCenter.x, hoodCenter.y, hoodCenter.z);
    return shell;
  };
  const shellLight = (pos) => smoothstep(1.54, 1.66, pos.y) * 0.5;
  builder.add(hoodShell(0.194), {
    color: sky
      ? (pos, normal, out) =>
          out.set(SKY_OUTFIT_COLORS.hoodShade).lerp(toColor(SKY_OUTFIT_COLORS.hoodLight), smoothstep(1.42, 1.64, pos.y))
      : (pos, normal, out) => out.set(HERO_COLORS.hood).lerp(toColor(HERO_COLORS.hoodLight), shellLight(pos)),
    hood: sky ? undefined : (pos) => hoodLit(shellLight(pos)),
    bone: skinHead,
  });
  builder.add(hoodShell(0.18), {
    color: sky ? SKY_OUTFIT_COLORS.hoodInner : HERO_COLORS.hoodInner,
    hood: sky ? undefined : HOOD_LINING,
    bone: skinHead,
    flip: true,
    outline: 0,
  });
  {
    const rimCenter = hoodCenter.clone().addScaledVector(openDir, 0.194 * Math.cos(openAngle));
    const rimRadius = 0.187 * Math.sin(openAngle);
    const rim = torus(rimRadius, 0.016, 8, 40);
    const rimRot = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), openDir);
    rim.applyQuaternion(rimRot);
    rim.translate(rimCenter.x, rimCenter.y + 0.004, rimCenter.z);
    builder.add(rim, {
      color: sky
        ? (pos, normal, out) =>
            sunsetColor(smoothstep(rimCenter.y + rimRadius * 0.9, rimCenter.y - rimRadius * 0.9, pos.y), out)
        : HERO_COLORS.hoodLight,
      hood: sky ? undefined : HOOD_LIGHT,
      bone: skinHead,
    });
    if (sky) {
      const trim = torus(rimRadius + 0.012, 0.0045, 6, 40);
      trim.applyQuaternion(rimRot);
      trim.translate(
        rimCenter.x - openDir.x * 0.012,
        rimCenter.y + 0.004 - openDir.y * 0.012,
        rimCenter.z - openDir.z * 0.012,
      );
      builder.add(trim, {
        color: SKY_OUTFIT_COLORS.gold,
        bone: skinHead,
        outline: 0.3,
      });
    }
  }
  {
    const tailLight = (pos) => smoothstep(1.495, 1.605, pos.y) * 0.4;
    const tailPts = [];
    const tailCtrl = [
      new Vector3(0, 1.61, -0.06),
      new Vector3(0, 1.6, -0.14),
      new Vector3(0, 1.56, -0.22),
      new Vector3(0, 1.495, -0.285),
      new Vector3(0, 1.415, -0.318),
    ];
    const curve = new CatmullRomCurve3(tailCtrl);
    for (let i = 0; i <= 16; i++) tailPts.push(curve.getPoint(i / 16));
    builder.add(
      tube(
        tailPts,
        (along) => {
          const rad = 0.1 * (1 - along) ** 1.25 + 0.016;
          return [rad * 1.05, rad * 0.85];
        },
        14,
        {
          caps: true,
        },
      ),
      {
        color: sky
          ? (pos, normal, out) => {
              out
                .set(SKY_OUTFIT_COLORS.hoodShade)
                .lerp(toColor(SKY_OUTFIT_COLORS.hoodLight), smoothstep(1.495, 1.605, pos.y) * 0.7);
              const hem = smoothstep(1.47, 1.43, pos.y);
              if (hem > 0) out.lerp(sunsetColor(smoothstep(1.47, 1.41, pos.y), rampColor), hem);
              if (Math.abs(pos.y - 1.478) < 0.008 && pos.z < -0.25) out.set(SKY_OUTFIT_COLORS.gold);
            }
          : (pos, normal, out) => out.set(HERO_COLORS.hood).lerp(toColor(HERO_COLORS.hoodLight), tailLight(pos)),
        hood: sky ? undefined : (pos) => hoodLit(tailLight(pos)),
        bone: (pos, weights) => {
          const along = Math.min(1, Math.max(0, (-pos.z - 0.06) / 0.26 + (1.545 - pos.y) * 0.8));
          const headW = 1 - smoothstep(0, 0.3, along);
          const hood1W = smoothstep(0, 0.3, along) * (1 - smoothstep(0.45, 0.7, along));
          const hood2W = smoothstep(0.45, 0.7, along) * (1 - smoothstep(0.75, 0.95, along));
          const hood3W = smoothstep(0.75, 0.95, along);
          weights.add(BONE.head, headW).add(BONE.hood1, hood1W).add(BONE.hood2, hood2W).add(BONE.hood3, hood3W);
        },
      },
    );
    builder.add(ellipsoid(0.036, 0.036, 0.036, 12, 8), {
      color: sky
        ? (pos, normal, out) =>
            out.set(SKY_OUTFIT_COLORS.gold).lerp(toColor(SKY_OUTFIT_COLORS.goldLight), smoothstep(1.39, 1.43, pos.y))
        : HERO_COLORS.scarf,
      scarf: sky ? 0 : 1,
      bone: BONE.hood3,
      matrix: trs(0, 1.4, -0.321),
    });
  }
  const scarfCol = sky ? SKY_OUTFIT_COLORS.scarf : HERO_COLORS.scarf;
  const scarfDarkCol = sky ? SKY_OUTFIT_COLORS.scarfDark : HERO_COLORS.scarfDark;
  const wrapShade = (pos) => 0.18 * (0.5 + 0.5 * Math.sin(Math.atan2(pos.x, pos.z) * 14));
  builder.add(torus(0.084, 0.04, 10, 28), {
    color: (pos, normal, out) => {
      out.set(scarfCol);
      out.lerp(toColor(scarfDarkCol), wrapShade(pos));
    },
    scarf: (pos) => 1 + wrapShade(pos),
    bone: skinNeck,
    matrix: trs(0, 1.29, -0.006, Math.PI / 2 - 0.2, 0, 0, 1.12, 1, 1),
  });
  builder.add(ellipsoid(0.04, 0.038, 0.034, 10, 8), {
    color: scarfDarkCol,
    scarf: 2,
    bone: skinNeck,
    matrix: trs(0.07, 1.274, -0.087),
  });
}
function buildBrush(builder) {
  const brush = BONE.brush;
  builder.add(ellipsoid(0.03, 0.03, 0.03, 10, 8), {
    color: HERO_COLORS.brass,
    bone: brush,
    matrix: trs(0, 0.005, 0),
    outline: 0.7,
  });
  builder.add(
    loft(
      [
        {
          y: 0.02,
          rx: 0.02,
          rz: 0.02,
        },
        {
          y: 0.35,
          rx: 0.021,
          rz: 0.021,
        },
        {
          y: 0.6,
          rx: 0.019,
          rz: 0.019,
        },
        {
          y: 0.93,
          rx: 0.022,
          rz: 0.022,
        },
      ],
      10,
    ),
    {
      color: (pos, normal, out) =>
        out.set(HERO_COLORS.wood).lerp(toColor(HERO_COLORS.woodDark), 0.25 + 0.25 * Math.sin(pos.y * 31)),
      bone: brush,
      outline: 0.6,
    },
  );
  builder.add(
    loft(
      [
        {
          y: 0.05,
          rx: 0.024,
          rz: 0.024,
        },
        {
          y: 0.06,
          rx: 0.028,
          rz: 0.028,
        },
        {
          y: 0.3,
          rx: 0.028,
          rz: 0.028,
        },
        {
          y: 0.31,
          rx: 0.024,
          rz: 0.024,
        },
      ],
      12,
    ),
    {
      color: HERO_COLORS.leatherDark,
      bone: brush,
      outline: 0.6,
    },
  );
  for (let i = 0; i < 6; i++)
    builder.add(torus(0.028, 0.004, 5, 14), {
      color: HERO_COLORS.leather,
      bone: brush,
      matrix: trs(0, 0.08 + i * 0.04, 0, Math.PI / 2 + 0.25, 0, 0),
      outline: 0,
    });
  builder.add(
    loft(
      [
        {
          y: 0.915,
          rx: 0.022,
          rz: 0.022,
        },
        {
          y: 0.92,
          rx: 0.03,
          rz: 0.03,
        },
        {
          y: 0.945,
          rx: 0.03,
          rz: 0.03,
        },
        {
          y: 0.95,
          rx: 0.027,
          rz: 0.027,
        },
        {
          y: 0.995,
          rx: 0.031,
          rz: 0.031,
        },
        {
          y: 1,
          rx: 0.036,
          rz: 0.036,
        },
        {
          y: 1.035,
          rx: 0.036,
          rz: 0.036,
        },
      ],
      14,
    ),
    {
      color: HERO_COLORS.brass,
      bone: brush,
      outline: 0.7,
    },
  );
  const bristleProfile = [
    [1.028, 0.034],
    [1.06, 0.056],
    [1.1, 0.068],
    [1.15, 0.07],
    [1.2, 0.062],
    [1.25, 0.048],
    [1.29, 0.031],
    [1.318, 0.015],
    [1.335, 0.004],
  ];
  const bristleBend = (y) => 0.05 * Math.max(0, (y - 1.08) / 0.255) ** 2;
  const bristleRings = bristleProfile.map(([y, radius]) => ({
    y,
    rx: radius,
    rz: radius * 0.92,
    cz: bristleBend(y),
  }));
  builder.add(
    loft(bristleRings, 18, {
      capTop: true,
      shape: (angle, ring) =>
        1 + (ring > 0 && ring < bristleProfile.length - 1 ? 0.07 * Math.sin(angle * 7 + ring * 1.7) : 0),
    }),
    {
      color: (pos, normal, out) =>
        out
          .set(HERO_COLORS.bristle)
          .lerp(toColor(14206884), 0.3 * (0.5 + 0.5 * Math.sin(Math.atan2(pos.x, pos.z) * 9))),
      bone: brush,
      tint: (pos) => smoothstep(1.045, 1.16, pos.y) * 0.96,
    },
  );
}
function ringAt(rings, y) {
  if (y >= rings[0].y) return rings[0];
  for (let i = 0; i < rings.length - 1; i++) {
    const upper = rings[i];
    const lower = rings[i + 1];
    if (y <= upper.y && y >= lower.y) {
      const f = (upper.y - y) / Math.max(0.000001, upper.y - lower.y);
      return {
        y,
        rx: upper.rx + (lower.rx - upper.rx) * f,
        rz: upper.rz + (lower.rz - upper.rz) * f,
        cz: (upper.cz ?? 0) + ((lower.cz ?? 0) - (upper.cz ?? 0)) * f,
      };
    }
  }
  return rings[rings.length - 1];
}
export function roundedBox(w, h2, d, radius) {
  const geometry = new SphereGeometry(1, 20, 14);
  geometry.deleteAttribute('uv');
  const geo = weld(geometry);
  const position = geo.attributes.position;
  const hx = w / 2 - radius;
  const hy = h2 / 2 - radius;
  const hz = d / 2 - radius;
  const p = new Vector3();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const cx = Math.sign(p.x) * hx;
    const cy = Math.sign(p.y) * hy;
    const cz = Math.sign(p.z) * hz;
    position.setXYZ(
      i,
      cx * Math.min(1, Math.abs(p.x) * 3) + p.x * radius,
      cy * Math.min(1, Math.abs(p.y) * 3) + p.y * radius,
      cz * Math.min(1, Math.abs(p.z) * 3) + p.z * radius,
    );
  }
  geo.computeVertexNormals();
  return geo;
}
export function buildHeroGeometry(outfit = 'classic') {
  const builder = new SkinnedMeshBuilder();
  buildBody(builder, outfit);
  const bodyIndexCount = builder.indexCount;
  buildBrush(builder);
  const geometry = builder.build();
  geometry.userData.bodyIndexCount = bodyIndexCount;
  return geometry;
}
