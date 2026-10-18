/**
 * Procedural plant geometry: a vertex builder with vegetation attributes, plus tubes along curves, leaf cards, fronds and leafy canopies.
 */
import {
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Float32BufferAttribute,
  MathUtils,
  Quaternion,
  Uint16BufferAttribute,
  Uint32BufferAttribute,
  Vector3,
} from 'three';
export class GeoBuilder {
  pos = [];
  nor = [];
  uv = [];
  col = [];
  veg = [];
  cen = [];
  idx = [];
  get count() {
    return this.pos.length / 3;
  }
  vert(pos, normal, u, v, color, veg, center) {
    this.pos.push(pos.x, pos.y, pos.z);
    this.nor.push(normal.x, normal.y, normal.z);
    this.uv.push(u, v);
    if (typeof color == 'number') this.col.push(color, color, color);
    else this.col.push(color.r, color.g, color.b);
    this.veg.push(veg[0], veg[1], veg[2], veg[3]);
    this.cen.push(center.x, center.y, center.z);
    return this.count - 1;
  }
  tri(a, b, c) {
    this.idx.push(a, b, c);
  }
  build() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(this.uv, 2));
    geometry.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    geometry.setAttribute('aVeg', new Float32BufferAttribute(this.veg, 4));
    geometry.setAttribute('aCenter', new Float32BufferAttribute(this.cen, 3));
    geometry.setIndex(
      this.count > 65535 ? new Uint32BufferAttribute(this.idx, 1) : new Uint16BufferAttribute(this.idx, 1),
    );
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}
const _tangent = new Vector3();
const _ringNormal = new Vector3();
const _scratch = new Vector3();
const _vertPos = new Vector3();
const _frameQuat = new Quaternion();
export function addTube(geo, points, segs, radiusAt, colorAt, options = {}) {
  const len = points.length;
  const base = geo.count;
  const dists = [0];
  for (let i = 1; i < len; i++) dists.push(dists[i - 1] + points[i].distanceTo(points[i - 1]));
  const total = dists[len - 1] || 1;
  const tangentAt = (idx, out) =>
    out.subVectors(points[Math.min(len - 1, idx + 1)], points[Math.max(0, idx - 1)]).normalize();
  tangentAt(0, _tangent);
  const frameN = new Vector3(1, 0, 0);
  if (Math.abs(_tangent.x) > 0.9) frameN.set(0, 0, 1);
  frameN.sub(_scratch.copy(_tangent).multiplyScalar(frameN.dot(_tangent))).normalize();
  const prevTangent = _tangent.clone();
  const vScale = options.vScale ?? 1;
  for (let i = 0; i < len; i++) {
    tangentAt(i, _tangent);
    _frameQuat.setFromUnitVectors(prevTangent, _tangent);
    frameN.applyQuaternion(_frameQuat).normalize();
    prevTangent.copy(_tangent);
    const binormal = _scratch.crossVectors(_tangent, frameN).normalize().clone();
    const along = dists[i] / total;
    for (let j = 0; j <= segs; j++) {
      const ang = (j / segs) * Math.PI * 2;
      const rad = radiusAt(along, ang);
      _ringNormal.copy(frameN).multiplyScalar(Math.cos(ang)).addScaledVector(binormal, Math.sin(ang)).normalize();
      _vertPos.copy(points[i]).addScaledVector(_ringNormal, rad);
      geo.vert(
        _vertPos,
        _ringNormal,
        j / segs,
        along,
        colorAt(along, ang),
        [options.rand ?? 0, options.flex ? options.flex(along) : 0, j / segs, (options.v0 ?? 0) + dists[i] * vScale],
        _vertPos,
      );
    }
  }
  for (let i = 0; i < len - 1; i++)
    for (let j = 0; j < segs; j++) {
      const cur = base + i * (segs + 1) + j;
      const above = cur + segs + 1;
      geo.tri(cur, cur + 1, above);
      geo.tri(cur + 1, above + 1, above);
    }
  if (options.capTop) {
    const tip = geo.vert(
      points[len - 1],
      _tangent,
      0.5,
      1,
      colorAt(1, 0),
      [options.rand ?? 0, 0, 0.5, total * vScale],
      points[len - 1],
    );
    const lastRing = base + (len - 1) * (segs + 1);
    for (let i = 0; i < segs; i++) geo.tri(lastRing + i, lastRing + i + 1, tip);
  }
}
export function smoothPath(points, divisions) {
  return new CatmullRomCurve3(points, false, 'centripetal').getPoints(divisions);
}
const _cardRight = new Vector3();
const _cardUp = new Vector3();
const _cardColor = new Color();
function addCard(geo, center, card) {
  const facing = card.facing;
  const ref = Math.abs(facing.y) > 0.95 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  _cardRight.crossVectors(ref, facing).normalize();
  _cardUp.crossVectors(facing, _cardRight).normalize();
  const cosR = Math.cos(card.roll);
  const sinR = Math.sin(card.roll);
  const right = _cardRight.clone().multiplyScalar(cosR).addScaledVector(_cardUp, sinR);
  const up = _cardUp.clone().multiplyScalar(cosR).addScaledVector(_cardRight, -sinR);
  const half = card.size * 0.5;
  const [u0, v0, u1, v1] = card.rect;
  const corners = [
    [-1, -1, u0, v0],
    [1, -1, u1, v0],
    [1, 1, u1, v1],
    [-1, 1, u0, v1],
  ];
  const base = geo.count;
  for (const [sx, sy, texU, texV] of corners) {
    _vertPos
      .copy(center)
      .addScaledVector(right, sx * half)
      .addScaledVector(up, sy * half);
    const ao =
      card.aoBottom === undefined ? 1 : MathUtils.lerp(card.aoBottom, 1, (_vertPos.y - (center.y - half)) / (2 * half));
    if (typeof card.color == 'number') _cardColor.setScalar(card.color * ao);
    else _cardColor.copy(card.color).multiplyScalar(ao);
    geo.vert(_vertPos, card.normal, texU, texV, _cardColor, [card.rand, card.flex, 0, 0], center);
  }
  geo.tri(base, base + 1, base + 2);
  geo.tri(base, base + 2, base + 3);
}
export function addFrond(
  geo,
  root,
  direction,
  len,
  width,
  droop,
  segs,
  rect,
  colorAt,
  rand,
  upBias = 0.6,
  fold = 0.45,
) {
  const dir = direction.clone().normalize();
  const side = new Vector3().crossVectors(dir, new Vector3(0, 1, 0));
  if (side.lengthSq() < 0.000001) side.set(1, 0, 0);
  side.normalize();
  const [u0, v0, u1, v1] = rect;
  const uMid = (u0 + u1) * 0.5;
  const base = geo.count;
  const pos = new Vector3();
  const normal = new Vector3();
  const up = new Vector3(0, 1, 0);
  const cosFold = Math.cos(fold);
  const sinFold = Math.sin(fold);
  for (let i = 0; i <= segs; i++) {
    const along = i / segs;
    pos.copy(root).addScaledVector(dir, along * len);
    pos.y -= droop * along * along * len;
    const tangent = dir.clone();
    tangent.y -= 2 * droop * along;
    tangent.normalize();
    normal.crossVectors(side, tangent).normalize();
    if (normal.y < 0) normal.negate();
    normal.lerp(up, upBias).normalize();
    const half = width * 0.5;
    const texV = v0 + (v1 - v0) * along;
    const col = colorAt(along);
    const foldOff = normal.clone().multiplyScalar(-half * sinFold);
    geo.vert(
      pos
        .clone()
        .addScaledVector(side, -half * cosFold)
        .add(foldOff),
      normal,
      u0,
      texV,
      col,
      [rand, along, 0, 0],
      root,
    );
    geo.vert(pos.clone(), normal, uMid, texV, col, [rand, along, 0, 0], root);
    geo.vert(
      pos
        .clone()
        .addScaledVector(side, half * cosFold)
        .add(foldOff),
      normal,
      u1,
      texV,
      col,
      [rand, along, 0, 0],
      root,
    );
  }
  for (let i = 0; i < segs; i++) {
    const row = base + i * 3;
    geo.tri(row, row + 1, row + 3);
    geo.tri(row + 3, row + 1, row + 4);
    geo.tri(row + 1, row + 2, row + 4);
    geo.tri(row + 4, row + 2, row + 5);
  }
}
function randomDir(rand, target = new Vector3()) {
  const y = rand() * 2 - 1;
  const phi = rand() * Math.PI * 2;
  const radial = Math.sqrt(1 - y * y);
  return target.set(Math.cos(phi) * radial, y, Math.sin(phi) * radial);
}
export const v3 = (x, y, z) => new Vector3(x, y, z);
const _outward = new Vector3();
export function addCanopy(geo, rng, clumps, center, extent, rect, cardScale, density) {
  for (const clump of clumps) {
    const cardCount = Math.max(5, Math.round(clump.r * clump.r * density));
    for (let i = 0; i < cardCount; i++) {
      const dir = randomDir(rng.next);
      dir.y = Math.abs(dir.y) * 0.8 + dir.y * 0.2;
      const away = _outward.copy(clump.c).sub(center);
      if (away.lengthSq() > 0.0001) dir.addScaledVector(away.normalize(), 0.5).normalize();
      const pos = clump.c.clone().addScaledVector(dir, clump.r * rng.range(0.3, 0.95));
      const rel = pos.clone().sub(center).divide(extent);
      const normal = rel
        .clone()
        .normalize()
        .multiplyScalar(0.75)
        .addScaledVector(dir, 0.4)
        .add(v3(0, 0.15, 0))
        .normalize();
      const facing = dir.clone().multiplyScalar(0.55).add(randomDir(rng.next).multiplyScalar(0.45)).normalize();
      const heightT = MathUtils.clamp(rel.y * 0.5 + 0.5, 0, 1);
      const radialT = MathUtils.clamp(rel.length(), 0, 1.2);
      const shade = MathUtils.clamp(0.26 + 0.58 * heightT * heightT + 0.22 * radialT, 0.24, 1.05);
      addCard(geo, pos, {
        rect,
        size: rng.range(0.85, 1.2) * clump.r * cardScale,
        normal,
        color: shade,
        rand: rng.next(),
        flex: 0.4 + 0.6 * Math.min(1, radialT),
        facing,
        roll: rng.range(0, Math.PI * 2),
        aoBottom: 0.8,
      });
    }
  }
}
