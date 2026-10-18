/**
 * Procedural Smudge meshes: a skinned-geometry builder with bone, part and drip attributes, and the smudgeling, spitter and brute bodies with masks, limbs, drips, elite crowns and cloud mantles.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  DodecahedronGeometry,
  Euler,
  Float32BufferAttribute,
  LatheGeometry,
  MathUtils,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng } from '../core/math.js';
export const BONE = {
  base: 0,
  top: 1,
  mask: 2,
  handL: 3,
  handR: 4,
  footL: 5,
  footR: 6,
  extra: 7,
};
const PART = {
  body: 0,
  mask: 1,
  limb: 2,
  drip: 3,
  jaw: 4,
  tuft: 5,
  sac: 6,
  rock: 7,
  spout: 8,
  hole: 9,
  crown: 10,
  mantle: 11,
};
const INK_COLOR = {
  smudgeling: 4933719,
  spitter: 5459294,
  brute: 4473164,
};
const LIMB_COLOR = 3881284;
const MASK_COLOR = 15722972;
const MASK_SHADE = 14998731;
const ROCK_COLOR = 9209470;
const SAC_COLOR = 5919590;
const HOLE_COLOR = 920851;
const _vtx = new Vector3();
const _vtxColor = new Color();
function lathe(profile, rings, segments, deform) {
  const points = new CatmullRomCurve3(
    profile.map(([y, r]) => new Vector3(r, y, 0)),
    false,
    'centripetal',
  ).getSpacedPoints(rings);
  points[0].x = 0;
  points[points.length - 1].x = 0;
  const positions = [];
  const indices = [];
  const v = new Vector3();
  const addVertex = (x, y, z, along, angle) => {
    v.set(x, y, z);
    deform?.(v, along, angle);
    positions.push(v.x, v.y, v.z);
  };
  addVertex(0, points[0].y, 0, 0, 0);
  for (let i = 1; i < rings; i++) {
    const along = i / rings;
    for (let j = 0; j < segments; j++) {
      const angle = (j / segments) * Math.PI * 2;
      addVertex(Math.sin(angle) * points[i].x, points[i].y, Math.cos(angle) * points[i].x, along, angle);
    }
  }
  addVertex(0, points[rings].y, 0, 1, 0);
  const vi = (ring, seg) => 1 + (ring - 1) * segments + (((seg % segments) + segments) % segments);
  const apex = positions.length / 3 - 1;
  for (let i = 0; i < segments; i++) indices.push(0, vi(1, i + 1), vi(1, i));
  for (let i = 1; i < rings - 1; i++)
    for (let j = 0; j < segments; j++) {
      const a2 = vi(i, j);
      const b = vi(i, j + 1);
      const c = vi(i + 1, j);
      const d = vi(i + 1, j + 1);
      indices.push(a2, b, d, a2, d, c);
    }
  for (let i = 0; i < segments; i++) indices.push(vi(rings - 1, i), vi(rings - 1, i + 1), apex);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return {
    geo: geometry,
    rAt: (y) => {
      let r2 = 0;
      let best = Infinity;
      for (const p of points) {
        const d = Math.abs(p.y - y);
        if (d < best) {
          best = d;
          r2 = p.x;
        }
      }
      return r2;
    },
  };
}
function blob(widthSegments, heightSegments, deform) {
  let geometry = new SphereGeometry(1, widthSegments, heightSegments);
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry, 0.0001);
  if (deform) {
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      _vtx.fromBufferAttribute(position, i);
      deform(_vtx);
      position.setXYZ(i, _vtx.x, _vtx.y, _vtx.z);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}
function tube(points, radiusAt, segments = 12, radial = 8) {
  const curve = new CatmullRomCurve3(points, false, 'centripetal');
  const frenet = curve.computeFrenetFrames(segments, false);
  const positions = [];
  const indices = [];
  const start = curve.getPointAt(0);
  const end = curve.getPointAt(1);
  positions.push(start.x, start.y, start.z);
  for (let i = 0; i <= segments; i++) {
    const along = i / segments;
    const p = curve.getPointAt(along);
    const r = Math.max(0.0001, radiusAt(along));
    const nrm = frenet.normals[i];
    const bin = frenet.binormals[i];
    for (let j = 0; j < radial; j++) {
      const angle = (j / radial) * Math.PI * 2;
      const offN = Math.cos(angle) * r;
      const offB = Math.sin(angle) * r;
      positions.push(
        p.x + nrm.x * offN + bin.x * offB,
        p.y + nrm.y * offN + bin.y * offB,
        p.z + nrm.z * offN + bin.z * offB,
      );
    }
  }
  positions.push(end.x, end.y, end.z);
  const vi = (ring, seg) => 1 + ring * radial + (((seg % radial) + radial) % radial);
  const endIndex = positions.length / 3 - 1;
  for (let i = 0; i < radial; i++) indices.push(0, vi(0, i), vi(0, i + 1));
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < radial; j++) {
      const a2 = vi(i, j);
      const b = vi(i, j + 1);
      const c = vi(i + 1, j);
      const d = vi(i + 1, j + 1);
      indices.push(a2, c, d, a2, d, b);
    }
  for (let i = 0; i < radial; i++) indices.push(vi(segments, i + 1), vi(segments, i), endIndex);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mid = Math.floor(segments / 2);
  const midPoint = curve.getPointAt(mid / segments);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const probe = vi(mid, 0);
  if (
    (position.getX(probe) - midPoint.x) * normal.getX(probe) +
      (position.getY(probe) - midPoint.y) * normal.getY(probe) +
      (position.getZ(probe) - midPoint.z) * normal.getZ(probe) <
    0
  ) {
    for (let i = 0; i < indices.length; i += 3) {
      const tmp = indices[i + 1];
      indices[i + 1] = indices[i + 2];
      indices[i + 2] = tmp;
    }
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
  }
  return geometry;
}
function smudgeRock(seed, size) {
  const rng = makeRng(`smudge-rock-${seed}`);
  let geometry = new DodecahedronGeometry(size, 0);
  geometry.deleteAttribute('uv');
  geometry.deleteAttribute('normal');
  geometry = mergeVertices(geometry, 0.0001);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    _vtx.fromBufferAttribute(position, i);
    _vtx.multiplyScalar(0.8 + rng() * 0.35);
    _vtx.y *= 0.62;
    position.setXYZ(i, _vtx.x, _vtx.y, _vtx.z);
  }
  geometry = geometry.toNonIndexed();
  geometry.computeVertexNormals();
  return mergeVertices(geometry, 0.000001);
}
class ModelBuilder {
  parts = [];
  add(geometry, opts) {
    let geo = geometry.index ? geometry : mergeVertices(geometry, 0.00001);
    if (!geo.getAttribute('normal')) geo.computeVertexNormals();
    const position = geo.getAttribute('position');
    const count = position.count;
    const uvs = new Float32Array(count * 2);
    const fx = new Float32Array(count * 4);
    if (opts.uv || opts.drip)
      for (let i = 0; i < count; i++) {
        _vtx.fromBufferAttribute(position, i);
        if (opts.uv) {
          const [u, v] = opts.uv(_vtx);
          uvs[i * 2] = u;
          uvs[i * 2 + 1] = v;
        }
        if (opts.drip) fx[i * 4 + 1] = MathUtils.clamp(-_vtx.y / opts.drip.bodyLen, 0, 1);
      }
    geo = geo.clone();
    if (opts.matrix) geo.applyMatrix4(opts.matrix);
    const position2 = geo.getAttribute('position');
    const colors = new Float32Array(count * 3);
    const skin = new Float32Array(count * 4);
    const colorA = new Color(opts.color);
    const colorB = new Color(opts.color2 ?? opts.color);
    for (let i = 0; i < count; i++) {
      _vtx.fromBufferAttribute(position2, i);
      const shade = opts.shade ? MathUtils.clamp(opts.shade(_vtx), 0, 1) : 0;
      _vtxColor.copy(colorA).lerp(colorB, shade);
      colors[i * 3] = _vtxColor.r;
      colors[i * 3 + 1] = _vtxColor.g;
      colors[i * 3 + 2] = _vtxColor.b;
      skin[i * 4] = opts.bone;
      skin[i * 4 + 1] = opts.bone2 ?? opts.bone;
      skin[i * 4 + 2] = opts.weight ? MathUtils.clamp(opts.weight(_vtx), 0, 1) : 0;
      skin[i * 4 + 3] = opts.part;
      fx[i * 4] = opts.drip ? opts.drip.phase : 0;
      fx[i * 4 + 2] = opts.rough;
      fx[i * 4 + 3] = opts.drip ? opts.drip.len : 0;
    }
    for (const key of Object.keys(geo.attributes)) if (key !== 'position' && key !== 'normal') geo.deleteAttribute(key);
    geo.setAttribute('uv', new BufferAttribute(uvs, 2));
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    geo.setAttribute('aSkin', new BufferAttribute(skin, 4));
    geo.setAttribute('aFx', new BufferAttribute(fx, 4));
    geo.morphAttributes = {};
    this.parts.push(geo);
  }
  build() {
    const merged = mergeGeometries(this.parts, false);
    if (!merged) throw Error('[enemies] merge failed');
    merged.computeBoundingSphere();
    return merged;
  }
}
const trs = (pos, rotation, scale) => new Matrix4().compose(pos, new Quaternion().setFromEuler(rotation), scale);
const v3 = (x, y, z) => new Vector3(x, y, z);
const euler = (x = 0, y = 0, z = 0) => new Euler(x, y, z, 'YXZ');
const sstep = (edge0, edge1, x) => {
  const t = MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const maskUv = (p) => [p.x * 0.5 + 0.5, p.y * 0.5 + 0.5];
function dripGeometry(radius, len) {
  return lathe(
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
  ).geo;
}
function addDrips(builder, rAt, count, yRange, radius, len, color, weight, seed, points, depthScale = 1) {
  const rng = makeRng(seed);
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rng() * 0.9 + 0.3;
    const y = yRange[0] + (yRange[1] - yRange[0]) * rng();
    const r = rAt(y) * 0.93;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r * depthScale;
    if (Math.cos(angle) > 0.75 && y > yRange[0] + (yRange[1] - yRange[0]) * 0.5) continue;
    const dripLen = len * (0.7 + rng() * 0.6);
    const dripR = radius * (0.75 + rng() * 0.5);
    builder.add(dripGeometry(dripR, dripLen), {
      color,
      bone: BONE.base,
      bone2: BONE.top,
      weight,
      part: PART.drip,
      rough: 0.16,
      matrix: trs(v3(x, y, z), euler(0, angle, 0), v3(1, 1, 1)),
      drip: {
        phase: rng(),
        len: dripLen * 0.9,
        bodyLen: dripLen,
      },
    });
    points.push(v3(x, y - dripLen, z));
  }
}
const CROWN_COLOR = 16052479;
const _crownUp = new Vector3(0, 1, 0);
function crownShard(height, radius, sides = 5) {
  const profile = [
    new Vector2(0.0001, -radius * 0.5),
    new Vector2(radius * 0.75, -radius * 0.1),
    new Vector2(radius, height * 0.5),
    new Vector2(radius * 0.62, height * 0.78),
    new Vector2(0.0001, height),
  ];
  const geo = new LatheGeometry(profile, sides).toNonIndexed();
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  return geo;
}
function crownHorn(points, radius) {
  const geo = tube(points, (t) => radius * (1 - t) ** 0.85 + 0.004, 10, 5).toNonIndexed();
  geo.computeVertexNormals();
  return geo;
}
function addCrownShard(builder, bone, pos, dir, height, radius, twist = 0) {
  const quat = new Quaternion().setFromUnitVectors(_crownUp, dir.clone().normalize());
  quat.multiply(new Quaternion().setFromAxisAngle(_crownUp, twist));
  builder.add(crownShard(height, radius), {
    color: CROWN_COLOR,
    bone,
    part: PART.crown,
    rough: 0.08,
    matrix: new Matrix4().compose(pos, quat, new Vector3(1, 1, 1)),
  });
}
function addCrownHorn(builder, bone, points, radius) {
  builder.add(crownHorn(points, radius), {
    color: CROWN_COLOR,
    bone,
    part: PART.crown,
    rough: 0.08,
  });
}
const MANTLE_DARK = 3486538;
const MANTLE_LIGHT = 9078438;
function addMantle(builder, opts) {
  const rng = makeRng(opts.seed);
  const shade = (p) => sstep(opts.c.y - opts.size[1], opts.c.y + opts.size[1] * 1.2, p.y);
  for (let i = 0; i < opts.puffs; i++) {
    const along = (i + 0.5) / opts.puffs;
    const angle = opts.open + along * (Math.PI * 2 - opts.open * 2) + (rng() - 0.5) * 0.25;
    const size = opts.size[0] + (opts.size[1] - opts.size[0]) * rng();
    const ring = opts.ring * (0.95 + rng() * 0.15);
    const pos = v3(
      opts.c.x + Math.sin(angle) * ring,
      opts.c.y + (rng() - 0.35) * size * 0.7,
      opts.c.z + Math.cos(angle) * ring,
    );
    const phase = rng() * 10;
    const puff = blob(12, 9, (p) => {
      const bump = Math.sin(p.x * 5 + phase) * Math.sin(p.y * 4 + phase * 0.7) * Math.sin(p.z * 5 - phase);
      p.multiplyScalar(1 + bump * 0.14);
      if (p.y < -0.25) p.y = -0.25 + (p.y + 0.25) * 0.4;
    });
    builder.add(puff, {
      color: MANTLE_DARK,
      color2: MANTLE_LIGHT,
      shade,
      bone: BONE.top,
      part: PART.mantle,
      rough: 0.9,
      matrix: trs(pos, euler(rng() * 0.3, angle, rng() * 0.3), v3(size * 1.25, size * 0.85, size)),
    });
  }
  for (let i = 0; i < opts.tatters; i++) {
    const angle = Math.PI + (i - (opts.tatters - 1) / 2) * 0.55 + (rng() - 0.5) * 0.2;
    const len = opts.tatterLen * (0.65 + rng() * 0.55);
    const width = opts.tatterW * (0.75 + rng() * 0.5);
    const pos = v3(
      opts.c.x + Math.sin(angle) * opts.ring * 0.92,
      opts.c.y - opts.size[0] * 0.3,
      opts.c.z + Math.cos(angle) * opts.ring * 0.92,
    );
    const phase = rng() * 6;
    const tatter = blob(8, 10, (p) => {
      const down = (1 - p.y) * 0.5;
      const radial = Math.sqrt(Math.max(0.000001, p.x * p.x + p.z * p.z));
      const rad = sstep(0, 0.14, down) * (1 - 0.82 * down) * (1 + Math.sin(down * 9 + phase) * 0.12);
      const nx = radial > 0.001 ? p.x / radial : 0;
      const nz = radial > 0.001 ? p.z / radial : 0;
      p.set(nx * rad + Math.sin(down * 5 + phase) * 0.12 * down, -down, nz * rad * 0.35);
    });
    builder.add(tatter, {
      color: MANTLE_DARK,
      color2: MANTLE_LIGHT,
      shade: (p) => sstep(pos.y - len, pos.y, p.y) * 0.6,
      bone: BONE.top,
      part: PART.mantle,
      rough: 0.9,
      matrix: trs(pos, euler(-0.18, angle, 0), v3(width, len, width)),
    });
  }
}
function buildSmudgeling() {
  const builder = new ModelBuilder();
  const weight = (p) => sstep(0.1, 0.7, p.y);
  const { geo, rAt } = lathe(
    [
      [0, 0],
      [0.014, 0.25],
      [0.06, 0.35],
      [0.18, 0.39],
      [0.32, 0.375],
      [0.46, 0.33],
      [0.6, 0.25],
      [0.72, 0.16],
      [0.8, 0.09],
      [0.86, 0],
    ],
    28,
    28,
    (p) => {
      p.z *= 0.95 + 0.05 * Math.sign(p.z);
      const above = Math.max(0, p.y - 0.5);
      p.z -= above * above * 0.5;
    },
  );
  builder.add(geo, {
    color: INK_COLOR.smudgeling,
    bone: BONE.base,
    bone2: BONE.top,
    weight,
    part: PART.body,
    rough: 0.2,
  });
  const maskPos = v3(0, 0.45, 0.285);
  const mask = blob(30, 20, (p) => {
    if (p.y < 0) p.x *= 1 - 0.22 * (-p.y) ** 1.5;
    if (p.y > 0.7) p.y = 0.7 + (p.y - 0.7) * 0.55;
  });
  builder.add(mask, {
    color: MASK_COLOR,
    color2: MASK_SHADE,
    shade: (p) => sstep(0.45, 0.2, p.y),
    bone: BONE.mask,
    part: PART.mask,
    rough: 0.85,
    matrix: trs(maskPos, euler(-0.16, 0, 0), v3(0.285, 0.255, 0.075)),
    uv: maskUv,
  });
  const tuftPivot = v3(0, 0.72, -0.07);
  const tuft = tube(
    [
      v3(0, 0.66, -0.06),
      v3(0, 0.8, -0.1),
      v3(0.01, 0.92, -0.09),
      v3(0.02, 0.99, -0.02),
      v3(0.01, 0.99, 0.05),
      v3(-0.01, 0.94, 0.07),
    ],
    (t) => 0.11 * (1 - t) ** 0.9 + 0.012,
    20,
    10,
  );
  builder.add(tuft, {
    color: INK_COLOR.smudgeling,
    bone: BONE.extra,
    part: PART.tuft,
    rough: 0.2,
  });
  const shoulders = [v3(0.25, 0.38, 0.03), v3(-0.25, 0.38, 0.03)];
  const fists = [];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const bone = i === 0 ? BONE.handL : BONE.handR;
    const arm = tube(
      [v3(0.2 * side, 0.4, 0.02), v3(0.33 * side, 0.32, 0.05), v3(0.4 * side, 0.25, 0.08)],
      (t) => 0.085 - t * 0.02,
      8,
      10,
    );
    builder.add(arm, {
      color: LIMB_COLOR,
      bone,
      part: PART.limb,
      rough: 0.24,
    });
    const fist = v3(0.41 * side, 0.235, 0.09);
    fists.push(fist);
    builder.add(blob(12, 10), {
      color: LIMB_COLOR,
      bone,
      part: PART.limb,
      rough: 0.22,
      matrix: trs(fist, euler(), v3(0.08, 0.075, 0.08)),
    });
  }
  const feet = [v3(0.15, 0.045, 0.07), v3(-0.15, 0.045, 0.07)];
  for (let i = 0; i < 2; i++) {
    const foot = blob(12, 8, (p) => {
      if (p.y < -0.3) p.y = -0.3;
    });
    builder.add(foot, {
      color: LIMB_COLOR,
      bone: i === 0 ? BONE.footL : BONE.footR,
      part: PART.limb,
      rough: 0.3,
      matrix: trs(feet[i], euler(0, i === 0 ? 0.25 : -0.25, 0), v3(0.105, 0.075, 0.14)),
    });
  }
  for (const side of [1, -1]) {
    addCrownHorn(
      builder,
      BONE.top,
      [
        v3(0.14 * side, 0.6, 0.1),
        v3(0.27 * side, 0.7, 0.1),
        v3(0.35 * side, 0.85, 0.06),
        v3(0.34 * side, 1, 0.1),
        v3(0.28 * side, 1.07, 0.17),
      ],
      0.075,
    );
    addCrownShard(builder, BONE.top, v3(0.2 * side, 0.5, -0.26), v3(0.5 * side, 0.5, -1), 0.2, 0.045, side);
  }
  addCrownShard(builder, BONE.top, v3(0, 0.66, -0.2), v3(0, 0.8, -1), 0.26, 0.055);
  addCrownShard(builder, BONE.top, v3(0, 0.46, -0.34), v3(0, 0.3, -1), 0.22, 0.05, 0.5);
  addCrownShard(builder, BONE.top, v3(0.05, 0.84, -0.02), v3(0.1, 1, -0.3), 0.2, 0.045, 0.3);
  addMantle(builder, {
    c: v3(0, 0.56, -0.02),
    ring: 0.285,
    size: [0.085, 0.125],
    puffs: 9,
    open: 1,
    tatters: 4,
    tatterLen: 0.32,
    tatterW: 0.09,
    seed: 'smudgeling-mantle',
  });
  const dripPoints = [];
  addDrips(builder, rAt, 6, [0.22, 0.52], 0.03, 0.075, INK_COLOR.smudgeling, weight, 'smudgeling-drips', dripPoints);
  const rig = {
    pivots: [v3(0, 0, 0), v3(0, 0.32, 0), v3(0, 0.45, 0.02), shoulders[0], shoulders[1], feet[0], feet[1], tuftPivot],
    bodyTop: 0.86,
    flamePoints: [
      v3(0, 0.82, -0.08),
      v3(0.22, 0.52, -0.1),
      v3(-0.22, 0.55, -0.08),
      v3(0.1, 0.32, -0.3),
      v3(-0.15, 0.28, 0.2),
    ],
    dripPoints,
    mouth: v3(0, 0.36, 0.36),
    fists: [fists[0], fists[1]],
    maskCenter: maskPos.clone().add(v3(0, 0, 0.06)),
    bodyRadius: 0.4,
  };
  return {
    geometry: builder.build(),
    rig,
  };
}
function buildSpitter() {
  const builder = new ModelBuilder();
  const weight = (p) => sstep(0.2, 0.95, p.y);
  const { geo, rAt } = lathe(
    [
      [0, 0],
      [0.015, 0.27],
      [0.08, 0.37],
      [0.22, 0.4],
      [0.38, 0.35],
      [0.52, 0.25],
      [0.66, 0.2],
      [0.8, 0.22],
      [0.95, 0.25],
      [1.07, 0.215],
      [1.16, 0.12],
      [1.2, 0],
    ],
    32,
    26,
  );
  builder.add(geo, {
    color: INK_COLOR.spitter,
    bone: BONE.base,
    bone2: BONE.top,
    weight,
    part: PART.body,
    rough: 0.2,
  });
  const sacPos = v3(0, 0.64, 0.21);
  builder.add(blob(18, 14), {
    color: SAC_COLOR,
    bone: BONE.extra,
    part: PART.sac,
    rough: 0.12,
    matrix: trs(sacPos, euler(), v3(0.16, 0.14, 0.13)),
  });
  const maskPos = v3(0, 0.98, 0.215);
  const mask = blob(26, 20, (p) => {
    if (p.y < 0) p.x *= 1 - 0.18 * (-p.y) ** 1.2;
  });
  builder.add(mask, {
    color: MASK_COLOR,
    color2: MASK_SHADE,
    shade: (p) => sstep(0.95, 0.7, p.y),
    bone: BONE.mask,
    part: PART.mask,
    rough: 0.85,
    matrix: trs(maskPos, euler(-0.1, 0, 0), v3(0.21, 0.26, 0.07)),
    uv: maskUv,
  });
  const spout = tube([v3(0, 0.9, 0.25), v3(0, 0.9, 0.34), v3(0, 0.895, 0.42)], (t) => 0.055 + t * 0.02, 6, 12);
  builder.add(spout, {
    color: MASK_COLOR,
    bone: BONE.mask,
    part: PART.spout,
    rough: 0.8,
  });
  builder.add(new CircleGeometry(0.058, 14), {
    color: HOLE_COLOR,
    bone: BONE.mask,
    part: PART.hole,
    rough: 0.9,
    matrix: trs(v3(0, 0.895, 0.423), euler(0, 0, 0), v3(1, 1, 1)),
  });
  const rng = makeRng('spitter-crown');
  for (let i = 0; i < 4; i++) {
    const angle = -0.9 + i * 0.6 + (rng() - 0.5) * 0.2;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    const tuft = tube(
      [v3(sin * 0.1, 1.08, cos * 0.02 - 0.05), v3(sin * 0.16, 1.24, -0.08 + cos * 0.02), v3(sin * 0.24, 1.32, -0.14)],
      (t) => 0.05 * (1 - t) + 0.008,
      8,
      7,
    );
    builder.add(tuft, {
      color: INK_COLOR.spitter,
      bone: BONE.top,
      part: PART.tuft,
      rough: 0.2,
    });
  }
  const shoulders = [v3(0.3, 0.5, 0), v3(-0.3, 0.5, 0)];
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? 1 : -1;
    const bone = i === 0 ? BONE.handL : BONE.handR;
    builder.add(
      tube(
        [v3(0.28 * side, 0.52, 0), v3(0.4 * side, 0.4, 0.04), v3(0.44 * side, 0.28, 0.08)],
        (t) => 0.045 - t * 0.015,
        8,
        7,
      ),
      {
        color: LIMB_COLOR,
        bone,
        part: PART.limb,
        rough: 0.25,
      },
    );
    builder.add(blob(10, 8), {
      color: LIMB_COLOR,
      bone,
      part: PART.limb,
      rough: 0.22,
      matrix: trs(v3(0.45 * side, 0.26, 0.09), euler(), v3(0.06, 0.06, 0.06)),
    });
  }
  const feet = [v3(0.16, 0.045, 0.05), v3(-0.16, 0.045, 0.05)];
  for (let i = 0; i < 2; i++)
    builder.add(
      blob(12, 8, (p) => {
        if (p.y < -0.3) p.y = -0.3;
      }),
      {
        color: LIMB_COLOR,
        bone: i === 0 ? BONE.footL : BONE.footR,
        part: PART.limb,
        rough: 0.3,
        matrix: trs(feet[i], euler(0, i === 0 ? 0.2 : -0.2, 0), v3(0.11, 0.075, 0.15)),
      },
    );
  for (let i = 0; i < 5; i++) {
    const angle = (i - 2) * 0.42;
    const sin = Math.sin(angle);
    const cos = Math.cos(angle);
    addCrownShard(
      builder,
      BONE.top,
      v3(sin * 0.12, 1.1 - Math.abs(i - 2) * 0.03, -0.04 + cos * 0.02),
      v3(sin * 0.9, 1.6, -0.35),
      0.42 - Math.abs(i - 2) * 0.08,
      0.055,
      i,
    );
  }
  for (const side of [1, -1])
    addCrownShard(builder, BONE.top, v3(0.3 * side, 0.62, -0.06), v3(1 * side, 0.9, -0.2), 0.24, 0.045, side);
  addMantle(builder, {
    c: v3(0, 0.76, -0.01),
    ring: 0.235,
    size: [0.1, 0.145],
    puffs: 9,
    open: 0.95,
    tatters: 4,
    tatterLen: 0.46,
    tatterW: 0.1,
    seed: 'spitter-mantle',
  });
  const dripPoints = [];
  addDrips(builder, rAt, 7, [0.12, 0.62], 0.04, 0.13, INK_COLOR.spitter, weight, 'spitter-drips', dripPoints);
  const rig = {
    pivots: [
      v3(0, 0, 0),
      v3(0, 0.46, 0),
      v3(0, 0.98, 0),
      shoulders[0],
      shoulders[1],
      feet[0],
      feet[1],
      sacPos.clone().setZ(0.12),
    ],
    bodyTop: 1.2,
    flamePoints: [
      v3(0, 1.18, -0.05),
      v3(0.3, 0.35, 0),
      v3(-0.3, 0.38, -0.05),
      v3(0.15, 0.75, -0.18),
      v3(-0.15, 0.25, -0.3),
    ],
    dripPoints,
    mouth: v3(0, 0.895, 0.45),
    fists: [v3(0.45, 0.26, 0.09), v3(-0.45, 0.26, 0.09)],
    maskCenter: maskPos.clone().add(v3(0, 0, 0.05)),
    bodyRadius: 0.42,
  };
  return {
    geometry: builder.build(),
    rig,
  };
}
function buildBrute() {
  const builder = new ModelBuilder();
  const weight = (p) => sstep(0.45, 1.75, p.y);
  const { geo, rAt } = lathe(
    [
      [0, 0],
      [0.03, 0.5],
      [0.22, 0.64],
      [0.7, 0.72],
      [1.2, 0.82],
      [1.6, 0.86],
      [1.86, 0.74],
      [2.02, 0.5],
      [2.1, 0],
    ],
    32,
    32,
    (p, along) => {
      p.x *= 1.08;
      p.z *= 0.86;
      p.z += 0.3 * along * along;
    },
  );
  builder.add(geo, {
    color: INK_COLOR.brute,
    bone: BONE.base,
    bone2: BONE.top,
    weight,
    part: PART.body,
    rough: 0.24,
  });
  const headPos = v3(0, 1.72, 0.74);
  builder.add(blob(18, 14), {
    color: INK_COLOR.brute,
    bone: BONE.top,
    part: PART.body,
    rough: 0.22,
    matrix: trs(headPos, euler(), v3(0.44, 0.38, 0.36)),
  });
  const maskPos = v3(0, 1.78, 1.02);
  const mask = blob(28, 18, (p) => {
    if (p.y > 0.55) p.y = 0.55 + (p.y - 0.55) * 0.35;
    if (p.y < 0) p.x *= 1 - 0.22 * (-p.y) ** 1.2;
    p.x *= 1 + 0.08 * Math.max(0, p.y);
  });
  builder.add(mask, {
    color: MASK_COLOR,
    color2: MASK_SHADE,
    shade: (p) => sstep(2.1, 1.85, p.y),
    bone: BONE.mask,
    part: PART.mask,
    rough: 0.85,
    matrix: trs(maskPos, euler(0.05, 0, 0), v3(0.42, 0.3, 0.1)),
    uv: maskUv,
  });
  const jawPivot = v3(0, 1.66, 0.82);
  const jaw = blob(22, 12, (p) => {
    p.x *= 1 - 0.3 * Math.max(0, -p.y);
  });
  builder.add(jaw, {
    color: MASK_COLOR,
    color2: MASK_SHADE,
    shade: () => 0.5,
    bone: BONE.extra,
    part: PART.jaw,
    rough: 0.85,
    matrix: trs(v3(0, 1.53, 0.99), euler(0.12, 0, 0), v3(0.3, 0.13, 0.085)),
    uv: maskUv,
  });
  [
    [0.55, 1.72, -0.1, 0.26, 0.4],
    [-0.6, 1.68, -0.05, 0.28, -0.3],
    [0.1, 1.95, -0.25, 0.3, 0.1],
    [-0.25, 1.4, -0.55, 0.22, 0.7],
    [0.35, 1.25, -0.58, 0.2, -0.5],
  ].forEach(([x, y, z, size, tilt], i) => {
    builder.add(smudgeRock(i, size), {
      color: ROCK_COLOR,
      color2: 0x6f6a74,
      shade: (p) => sstep(y + size * 0.3, y - size * 0.5, p.y),
      bone: BONE.top,
      part: PART.rock,
      rough: 0.9,
      matrix: trs(v3(x, y, z), euler(tilt * 0.5, tilt, tilt * 0.3), v3(1, 1, 1)),
    });
  });
  const shoulders = [v3(0.86, 1.66, 0.2), v3(-0.86, 1.66, 0.2)];
  const fists = [v3(1.02, 0.46, 0.42), v3(-1.02, 0.46, 0.42)];
  for (let j = 0; j < 2; j++) {
    const side = j === 0 ? 1 : -1;
    const bone = j === 0 ? BONE.handL : BONE.handR;
    builder.add(
      tube(
        [
          v3(0.78 * side, 1.72, 0.18),
          v3(0.98 * side, 1.35, 0.28),
          v3(1.04 * side, 0.95, 0.36),
          v3(1.03 * side, 0.62, 0.4),
        ],
        (t) => 0.27 - t * 0.06,
        12,
        12,
      ),
      {
        color: INK_COLOR.brute,
        bone,
        part: PART.limb,
        rough: 0.26,
      },
    );
    const fist = blob(16, 12, (p) => {
      if (p.z > 0.2) p.z = 0.2 + (p.z - 0.2) * 0.55;
      if (p.y < -0.5) p.y = -0.5 + (p.y + 0.5) * 0.5;
    });
    builder.add(fist, {
      color: LIMB_COLOR,
      bone,
      part: PART.limb,
      rough: 0.22,
      matrix: trs(fists[j], euler(0.2, 0, 0), v3(0.34, 0.32, 0.36)),
    });
    for (let k = 0; k < 3; k++)
      builder.add(smudgeRock(10 + j * 3 + k, 0.09), {
        color: ROCK_COLOR,
        bone,
        part: PART.rock,
        rough: 0.9,
        matrix: trs(
          v3(fists[j].x + (k - 1) * 0.15 * side, fists[j].y + 0.18, fists[j].z + 0.24),
          euler(0.5, k, 0),
          v3(1, 1, 1),
        ),
      });
  }
  const feet = [v3(0.42, 0.18, 0.05), v3(-0.42, 0.18, 0.05)];
  for (let i = 0; i < 2; i++)
    builder.add(
      blob(14, 10, (p) => {
        if (p.y < -0.55) p.y = -0.55;
      }),
      {
        color: LIMB_COLOR,
        bone: i === 0 ? BONE.footL : BONE.footR,
        part: PART.limb,
        rough: 0.3,
        matrix: trs(feet[i], euler(), v3(0.3, 0.3, 0.36)),
      },
    );
  for (const side of [1, -1]) {
    addCrownHorn(
      builder,
      BONE.top,
      [
        v3(0.28 * side, 1.9, 0.66),
        v3(0.58 * side, 2.05, 0.56),
        v3(0.8 * side, 2.32, 0.6),
        v3(0.8 * side, 2.62, 0.78),
        v3(0.66 * side, 2.8, 0.98),
      ],
      0.16,
    );
    addCrownShard(builder, BONE.top, v3(0.62 * side, 1.86, -0.08), v3(0.7 * side, 1, -0.3), 0.5, 0.1, side);
    addCrownShard(builder, BONE.top, v3(0.38 * side, 1.55, -0.55), v3(0.4 * side, 0.6, -1), 0.36, 0.08, side * 2);
  }
  addCrownShard(builder, BONE.top, v3(0, 2.02, 0.18), v3(0, 1, -0.25), 0.55, 0.11);
  addCrownShard(builder, BONE.top, v3(0.05, 1.96, -0.22), v3(0.1, 0.8, -0.8), 0.46, 0.1, 1.1);
  addCrownShard(builder, BONE.top, v3(-0.06, 1.62, -0.62), v3(-0.1, 0.4, -1), 0.4, 0.09, 2.1);
  addMantle(builder, {
    c: v3(0, 1.86, 0.18),
    ring: 0.72,
    size: [0.19, 0.28],
    puffs: 11,
    open: 1.15,
    tatters: 5,
    tatterLen: 0.85,
    tatterW: 0.24,
    seed: 'brute-mantle',
  });
  const dripPoints = [];
  addDrips(builder, rAt, 10, [0.35, 1.3], 0.07, 0.24, INK_COLOR.brute, weight, 'brute-drips', dripPoints, 0.86);
  const rig = {
    pivots: [v3(0, 0, 0), v3(0, 0.95, 0.1), v3(0, 1.72, 0.6), shoulders[0], shoulders[1], feet[0], feet[1], jawPivot],
    bodyTop: 2.1,
    flamePoints: [
      v3(0, 2.1, 0.2),
      v3(0.6, 1.75, -0.15),
      v3(-0.6, 1.75, -0.15),
      v3(0.3, 1.2, -0.6),
      v3(-0.35, 0.9, -0.55),
      v3(0.7, 0.8, 0.1),
      v3(-0.7, 1.1, 0.2),
    ],
    dripPoints,
    mouth: v3(0, 1.55, 1.1),
    fists,
    maskCenter: maskPos.clone().add(v3(0, 0, 0.08)),
    bodyRadius: 0.92,
  };
  return {
    geometry: builder.build(),
    rig,
  };
}
export function buildModel(kind) {
  switch (kind) {
    case 'smudgeling':
      return buildSmudgeling();
    case 'spitter':
      return buildSpitter();
    default:
      return buildBrute();
  }
}
