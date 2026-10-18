/**
 * Procedural geometry for the hero: a builder that merges parts into one skinned geometry with vertex colours, up to four bone weights, a paint-tint mask, scarf and hood masks and an outline width, plus loft, capsule, ellipsoid, tube, torus, vertex-weld, transform and smoothstep helpers.
 */
import {
  BufferGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
class SkinWeights {
  idx = [0, 0, 0, 0];
  w = [1, 0, 0, 0];
  n = 0;
  clear() {
    this.n = 0;
    this.idx.fill(0);
    this.w.fill(0);
    return this;
  }
  add(bone, weight) {
    if (weight <= 0.0001) return this;
    for (let i = 0; i < this.n; i++)
      if (this.idx[i] === bone) {
        this.w[i] += weight;
        return this;
      }
    if (this.n < 4) {
      this.idx[this.n] = bone;
      this.w[this.n] = weight;
      this.n++;
    } else {
      let weakest = 0;
      for (let i = 1; i < 4; i++) if (this.w[i] < this.w[weakest]) weakest = i;
      if (weight > this.w[weakest]) {
        this.idx[weakest] = bone;
        this.w[weakest] = weight;
      }
    }
    return this;
  }
  normalize() {
    let sum = 0;
    for (let i = 0; i < 4; i++) sum += this.w[i];
    if (sum <= 0) {
      this.w[0] = 1;
      return this;
    }
    for (let i = 0; i < 4; i++) this.w[i] /= sum;
    return this;
  }
}
const NOT_HOOD = [0, 0, 0];
export class SkinnedMeshBuilder {
  pos = [];
  nrm = [];
  col = [];
  si = [];
  sw = [];
  tint = [];
  outl = [];
  // 0, or 1 + how dark (0–1) for the parts in the scarf's colours (the wardrobe recolours them)
  scarf = [];
  // for the hood's parts, how much of its base, light and lining colours (summing to 1); 0 elsewhere
  hood = [];
  index = [];
  v = new Vector3();
  n = new Vector3();
  c = new Color();
  w = new SkinWeights();
  add(geometry, part) {
    geometry.index;
    const geo = geometry;
    if (part.matrix) geo.applyMatrix4(part.matrix);
    if (!geo.attributes.normal) geo.computeVertexNormals();
    const position = geo.attributes.position;
    const normal = geo.attributes.normal;
    const base = this.pos.length / 3;
    const flatColor = typeof part.color == 'function' ? null : new Color(part.color);
    for (let i = 0; i < position.count; i++) {
      this.v.fromBufferAttribute(position, i);
      this.n.fromBufferAttribute(normal, i).normalize();
      if (part.flip) this.n.negate();
      this.pos.push(this.v.x, this.v.y, this.v.z);
      this.nrm.push(this.n.x, this.n.y, this.n.z);
      if (flatColor) this.c.copy(flatColor);
      else part.color(this.v, this.n, this.c, i);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.w.clear();
      if (typeof part.bone == 'number') this.w.add(part.bone, 1);
      else part.bone(this.v, this.w, i);
      this.w.normalize();
      this.si.push(...this.w.idx);
      this.sw.push(...this.w.w);
      this.tint.push(part.tint === undefined ? 0 : typeof part.tint == 'number' ? part.tint : part.tint(this.v));
      this.scarf.push(part.scarf === undefined ? 0 : typeof part.scarf == 'number' ? part.scarf : part.scarf(this.v));
      const hood = part.hood === undefined ? NOT_HOOD : typeof part.hood == 'function' ? part.hood(this.v, this.n) : part.hood;
      this.hood.push(hood[0], hood[1], hood[2]);
      this.outl.push(
        part.outline === undefined ? 1 : typeof part.outline == 'number' ? part.outline : part.outline(this.v, i),
      );
    }
    if (geo.index) {
      const index = geo.index;
      for (let i = 0; i < index.count; i += 3) {
        const i0 = index.getX(i) + base;
        const i1 = index.getX(i + 1) + base;
        const i2 = index.getX(i + 2) + base;
        if (part.flip) this.index.push(i0, i2, i1);
        else this.index.push(i0, i1, i2);
      }
    } else
      for (let i = 0; i < position.count; i += 3)
        if (part.flip) this.index.push(base + i, base + i + 2, base + i + 1);
        else this.index.push(base + i, base + i + 1, base + i + 2);
    geometry.dispose();
  }
  get indexCount() {
    return this.index.length;
  }
  build() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(this.nrm, 3));
    geometry.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(this.si, 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(this.sw, 4));
    geometry.setAttribute('aTint', new Float32BufferAttribute(this.tint, 1));
    geometry.setAttribute('aOutline', new Float32BufferAttribute(this.outl, 1));
    geometry.setAttribute('aScarf', new Float32BufferAttribute(this.scarf, 1));
    geometry.setAttribute('aHood', new Float32BufferAttribute(this.hood, 3));
    geometry.setIndex(this.index);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}
export function loft(rings, segments = 20, options = {}) {
  const positions = [];
  const indices = [];
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    for (let j = 0; j < segments; j++) {
      const angle = (j / segments) * Math.PI * 2;
      const scale = options.shape ? options.shape(angle, i, ring.y) : 1;
      const x = (ring.cx ?? 0) + Math.sin(angle) * ring.rx * scale;
      const z = (ring.cz ?? 0) + Math.cos(angle) * ring.rz * scale;
      const y = ring.y + (options.yJitter ? options.yJitter(angle, i) : 0);
      positions.push(x, y, z);
    }
  }
  const topDown = rings.length > 1 && rings[0].y > rings[rings.length - 1].y;
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < segments; j++) {
      const v00 = i * segments + j;
      const v01 = i * segments + ((j + 1) % segments);
      const v10 = (i + 1) * segments + j;
      const v11 = (i + 1) * segments + ((j + 1) % segments);
      if (topDown) indices.push(v00, v10, v01, v01, v10, v11);
      else indices.push(v00, v01, v10, v01, v11, v10);
    }
  const addCap = (ringIdx, center, isTop) => {
    const hub = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    for (let i = 0; i < segments; i++) {
      const v0 = ringIdx * segments + i;
      const v1 = ringIdx * segments + ((i + 1) % segments);
      if (isTop) indices.push(hub, v0, v1);
      else indices.push(hub, v1, v0);
    }
  };
  const first = rings[0];
  const last = rings[rings.length - 1];
  if (options.capTop) {
    const ring = topDown ? first : last;
    addCap(topDown ? 0 : rings.length - 1, new Vector3(ring.cx ?? 0, ring.y, ring.cz ?? 0), true);
  }
  if (options.capBottom) {
    const ring = topDown ? last : first;
    addCap(topDown ? rings.length - 1 : 0, new Vector3(ring.cx ?? 0, ring.y, ring.cz ?? 0), false);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export function loftPanels(rings, segments, splitFrom, options = {}) {
  const positions = [];
  const indices = [];
  const panels = [];
  const seamL = segments / 4;
  const seamR = (3 * segments) / 4;
  for (let i = 0; i < rings.length; i++) {
    const ring = rings[i];
    for (let j = 0; j < segments; j++) {
      const angle = (j / segments) * Math.PI * 2;
      const scale = options.shape ? options.shape(angle, i) : 1;
      positions.push(
        (ring.cx ?? 0) + Math.sin(angle) * ring.rx * scale,
        ring.y + (options.yJitter ? options.yJitter(angle, i) : 0),
        (ring.cz ?? 0) + Math.cos(angle) * ring.rz * scale,
      );
      const facing = Math.cos(angle);
      panels.push(i < splitFrom ? 0 : facing > 0.000001 ? 1 : -1);
    }
  }
  const seamCopies = new Map();
  for (let i = splitFrom; i < rings.length; i++)
    for (const seam of [seamL, seamR]) {
      const src = i * segments + seam;
      seamCopies.set(src, positions.length / 3);
      positions.push(positions[src * 3], positions[src * 3 + 1], positions[src * 3 + 2]);
      panels.push(1);
    }
  const vertexAt = (ringIdx, seg, front) => {
    const idx = ringIdx * segments + (seg % segments);
    return front && seamCopies.has(idx) ? seamCopies.get(idx) : idx;
  };
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < segments; j++) {
      const front = j >= seamR || j + 1 <= seamL;
      const v00 = vertexAt(i, j, front);
      const v01 = vertexAt(i, j + 1, front);
      const v10 = vertexAt(i + 1, j, front);
      const v11 = vertexAt(i + 1, j + 1, front);
      indices.push(v00, v10, v01, v01, v10, v11);
    }
  if (options.capTop) {
    const ring = rings[0];
    const hub = positions.length / 3;
    positions.push(ring.cx ?? 0, ring.y, ring.cz ?? 0);
    panels.push(0);
    for (let i = 0; i < segments; i++) indices.push(hub, i, (i + 1) % segments);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return {
    geo: geometry,
    panel: Int8Array.from(panels),
  };
}
export function capsule(cx, cz, yTop, yBottom, rTop, rBottom, segments = 14, capSteps = 4) {
  const rings = [];
  for (let i = capSteps; i >= 1; i--) {
    const angle = (i / capSteps) * (Math.PI / 2);
    rings.push({
      y: yTop + Math.sin(angle) * rTop * 0.9,
      rx: Math.cos(angle) * rTop + 0.0001,
      rz: Math.cos(angle) * rTop + 0.0001,
      cx,
      cz,
    });
  }
  for (let i = 0; i <= 4; i++) {
    const f = i / 4;
    const radius = rTop + (rBottom - rTop) * f;
    rings.push({
      y: yTop + (yBottom - yTop) * f,
      rx: radius,
      rz: radius,
      cx,
      cz,
    });
  }
  for (let i = 1; i <= capSteps; i++) {
    const angle = (i / capSteps) * (Math.PI / 2);
    rings.push({
      y: yBottom - Math.sin(angle) * rBottom * 0.9,
      rx: Math.cos(angle) * rBottom + 0.0001,
      rz: Math.cos(angle) * rBottom + 0.0001,
      cx,
      cz,
    });
  }
  return loft(rings, segments, {
    capTop: true,
    capBottom: true,
  });
}
export function ellipsoid(rx, ry, rz, wSeg = 16, hSeg = 12) {
  const geometry = new SphereGeometry(1, wSeg, hSeg);
  geometry.deleteAttribute('uv');
  geometry.scale(rx, ry, rz);
  return weld(geometry);
}
export function weld(src) {
  const position = src.attributes.position;
  const seen = new Map();
  const remap = [];
  const positions = [];
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
    let idx = seen.get(key);
    if (idx === undefined) {
      idx = positions.length / 3;
      seen.set(key, idx);
      positions.push(position.getX(i), position.getY(i), position.getZ(i));
    }
    remap.push(idx);
  }
  const indices = [];
  const index = src.index;
  const count = index ? index.count : position.count;
  for (let i = 0; i < count; i += 3) {
    const v0 = remap[index ? index.getX(i) : i];
    const v1 = remap[index ? index.getX(i + 1) : i + 1];
    const v2 = remap[index ? index.getX(i + 2) : i + 2];
    if (v0 !== v1 && v1 !== v2 && v0 !== v2) indices.push(v0, v1, v2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  src.dispose();
  return geometry;
}
export function tube(points, radiusAt, sides = 8, options = {}) {
  const len = points.length;
  const positions = [];
  const indices = [];
  const tangent = new Vector3();
  const up = new Vector3();
  const side = new Vector3();
  let prevUp = new Vector3(0, 1, 0);
  for (let i = 0; i < len; i++) {
    const prev = points[options.closed ? (i - 1 + len) % len : Math.max(0, i - 1)];
    const next = points[options.closed ? (i + 1) % len : Math.min(len - 1, i + 1)];
    tangent.subVectors(next, prev).normalize();
    if (options.up) up.copy(options.up(i, points[i]));
    else {
      up.copy(prevUp);
      if (i === 0) {
        up.set(0, 1, 0);
        if (Math.abs(up.dot(tangent)) > 0.9) up.set(1, 0, 0);
      }
    }
    up.addScaledVector(tangent, -up.dot(tangent)).normalize();
    side.crossVectors(tangent, up).normalize();
    prevUp = up.clone();
    const [rx, ry] = radiusAt(len > 1 ? i / (len - 1) : 0);
    for (let j = 0; j < sides; j++) {
      const angle = (j / sides) * Math.PI * 2;
      const u = Math.cos(angle) * rx;
      const v = Math.sin(angle) * ry;
      positions.push(
        points[i].x + side.x * u + up.x * v,
        points[i].y + side.y * u + up.y * v,
        points[i].z + side.z * u + up.z * v,
      );
    }
  }
  const spans = options.closed ? len : len - 1;
  for (let i = 0; i < spans; i++) {
    const nextRing = (i + 1) % len;
    for (let j = 0; j < sides; j++) {
      const v00 = i * sides + j;
      const v01 = i * sides + ((j + 1) % sides);
      const v10 = nextRing * sides + j;
      const v11 = nextRing * sides + ((j + 1) % sides);
      indices.push(v00, v10, v01, v01, v10, v11);
    }
  }
  if (options.caps && !options.closed)
    for (const [ring, first] of [
      [0, true],
      [len - 1, false],
    ]) {
      const hub = positions.length / 3;
      positions.push(points[ring].x, points[ring].y, points[ring].z);
      for (let i = 0; i < sides; i++) {
        const v0 = ring * sides + i;
        const v1 = ring * sides + ((i + 1) % sides);
        if (first) indices.push(hub, v0, v1);
        else indices.push(hub, v1, v0);
      }
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
export function torus(radius, tubeRadius, radialSegments = 10, tubularSegments = 24) {
  const geometry = new TorusGeometry(radius, tubeRadius, radialSegments, tubularSegments);
  geometry.deleteAttribute('uv');
  return weld(geometry);
}
export function trs(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, order = 'XYZ') {
  return new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz, order)),
    new Vector3(sx, sy, sz),
  );
}
export const smoothstep = (edge0, edge1, x) => {
  const k = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return k * k * (3 - 2 * k);
};
