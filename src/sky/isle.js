/**
 * One floating isle: a noisy outline, a domed top with flats, bumps and paths, a lobed rocky underside and splat weights, with fast height, rim and underside queries.
 */
import { BufferAttribute, BufferGeometry } from 'three';
import { clamp, fbm, makeNoise2D, makeNoise3D, smoothstep } from '../core/math.js';
const TAU = Math.PI * 2;
const UNDERSIDE_PROFILE = [
  [1.012, -0.4, 0, 1],
  [1.018, -1.2, 0, 1],
  [1.014, -2.2, 0, 0.75],
  [1, -3.4, 0, 0.25],
  [0.965, -4.8, 0, 0],
  [0.91, 0, 0.24, 0],
  [0.82, 0, 0.34, 0],
  [0.71, 0, 0.45, 0],
  [0.59, 0, 0.56, 0],
  [0.47, 0, 0.67, 0],
  [0.35, 0, 0.77, 0],
  [0.24, 0, 0.86, 0],
  [0.13, 0, 0.935, 0],
];
export class FloatingIsle {
  def;
  S;
  K;
  U = UNDERSIDE_PROFILE.length;
  cx;
  cz;
  Rj;
  ux;
  uz;
  maxR;
  pos;
  index;
  splat;
  grass;
  topVerts;
  topTris;
  vertCount;
  minY = Infinity;
  maxY = -Infinity;
  bottomY = Infinity;
  flatY;
  nh;
  no;
  n3;
  lobePhase;
  constructor(def) {
    this.def = def;
    this.S = def.segs;
    this.K = def.rings;
    this.cx = def.cx;
    this.cz = def.cz;
    this.nh = makeNoise2D(`${def.seed}-h`);
    this.no = makeNoise2D(`${def.seed}-o`);
    this.n3 = makeNoise3D(`${def.seed}-u`);
    this.lobePhase = (this.no(3.3, 7.7) + 1) * Math.PI;
    const segs = this.S;
    this.Rj = new Float64Array(segs);
    this.ux = new Float64Array(segs);
    this.uz = new Float64Array(segs);
    let maxR = 0;
    for (let i = 0; i < segs; i++) {
      const angle = (i / segs) * TAU;
      this.ux[i] = Math.cos(angle);
      this.uz[i] = Math.sin(angle);
      this.Rj[i] = this.outline(angle);
      maxR = Math.max(maxR, this.Rj[i]);
    }
    this.maxR = maxR;
    this.flatY = def.flats.map((flat) => this.natural(def.cx + flat.x, def.cz + flat.z) + (flat.lift ?? 0));
    const rings = this.K;
    const under = this.U;
    this.topVerts = 1 + rings * segs;
    this.vertCount = 1 + (rings + under) * segs + 1;
    this.topTris = segs + 2 * segs * (rings - 1);
    const tris = this.topTris + 2 * segs * under + segs;
    this.pos = new Float32Array(this.vertCount * 3);
    this.splat = new Float32Array(this.vertCount * 4);
    this.grass = new Float32Array(this.topVerts);
    this.index = new Uint32Array(tris * 3);
    this.build();
  }
  outline(angle) {
    const def = this.def;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const wob = this.no(dx * 1.3, dz * 1.3) * 0.65 + this.no(dx * 3.1 + 9, dz * 3.1) * 0.35;
    return def.r * (1 + def.elong * Math.cos(2 * (angle - def.elongAngle)) + def.wobble * wob);
  }
  natural(x, z) {
    const def = this.def;
    const dx = x - def.cx;
    const dz = z - def.cz;
    const dist = Math.hypot(dx, dz);
    const angle = Math.atan2(dz, dx);
    const rt = dist / Math.max(0.001, this.outline(angle));
    let h = def.y + def.relief * fbm(this.nh, x * 0.045, z * 0.045, 3) + def.dome * (1 - Math.min(1, rt * rt));
    for (const bump of def.bumps) {
      const d = Math.hypot(dx - bump.x, dz - bump.z) / bump.r;
      if (d < 1) {
        const k = 1 - d * d;
        h += bump.h * k * k * (1 + 0.15 * this.nh(x * 0.3, z * 0.3));
      }
    }
    const rim = smoothstep(0.8, 1, rt);
    h -= rim ** 1.6 * (0.9 + 0.035 * def.r);
    return h;
  }
  flatten(x, z, y) {
    const def = this.def;
    const dx = x - def.cx;
    const dz = z - def.cz;
    def.flats.forEach((flat, i) => {
      const dist = Math.hypot(dx - flat.x, dz - flat.z);
      const w = 1 - smoothstep(flat.r, flat.r + flat.soft, dist);
      if (w > 0) y += (this.flatY[i] - y) * w;
    });
    return y;
  }
  pathMask(lx, lz) {
    let mask = 0;
    for (const path of this.def.paths)
      for (let i = 0; i + 1 < path.pts.length; i++) {
        const [ax, az] = path.pts[i];
        const [bx, bz] = path.pts[i + 1];
        const dx = bx - ax;
        const dz = bz - az;
        const len2 = dx * dx + dz * dz;
        const t = len2 > 0 ? clamp(((lx - ax) * dx + (lz - az) * dz) / len2, 0, 1) : 0;
        const dist = Math.hypot(lx - (ax + dx * t), lz - (az + dz * t));
        mask = Math.max(mask, 1 - smoothstep(path.w * 0.5 - 0.3, path.w * 0.5 + 0.5, dist));
      }
    return mask;
  }
  vid(ring, seg) {
    return 1 + (ring - 1) * this.S + (((seg % this.S) + this.S) % this.S);
  }
  build() {
    const def = this.def;
    const { S: segs, K: rings, U: under, pos, splat, grass } = this;
    const rimY = new Float64Array(segs);
    const setPos = (vi, x, y, z) => {
      pos[vi * 3] = x;
      pos[vi * 3 + 1] = y;
      pos[vi * 3 + 2] = z;
      if (y < this.minY) this.minY = y;
      if (y > this.maxY) this.maxY = y;
    };
    const setSplat = (vi, x, z, radial) => {
      const lx = x - def.cx;
      const lz = z - def.cz;
      let pave = 0;
      let dirt = 0;
      def.flats.forEach((flat) => {
        const dist = Math.hypot(lx - flat.x, lz - flat.z);
        const w = 1 - smoothstep(flat.r - 1.2, flat.r + 0.4, dist);
        if (flat.pave) pave = Math.max(pave, w * flat.pave);
        if (flat.dirt) dirt = Math.max(dirt, w * flat.dirt * (0.6 + 0.4 * this.nh(x * 0.21, z * 0.21)));
      });
      pave = Math.max(pave, this.pathMask(lx, lz));
      const rocky = smoothstep(0.55, 0.85, (this.nh(x * 0.11 + 40, z * 0.11) + 1) * 0.5 + def.rocky * 0.25) * def.rocky;
      const rim = smoothstep(0.9, 1, radial) * 0.55;
      const rock = clamp(Math.max(rocky, rim) * (1 - pave), 0, 1);
      splat[vi * 4] = rock;
      splat[vi * 4 + 1] = pave;
      splat[vi * 4 + 2] = dirt;
      splat[vi * 4 + 3] = 0;
      grass[vi] = clamp(
        (1 - rock * 1.2) * (1 - pave * 1.1) * (1 - dirt * 0.8) * (1 - smoothstep(0.9, 0.985, radial)) * def.grass,
        0,
        1,
      );
      if (def.attr) grass[vi] = clamp(grass[vi] * def.attr(lx, lz, splat, vi * 4), 0, 1);
    };
    {
      let y = this.flatten(def.cx, def.cz, this.natural(def.cx, def.cz));
      if (def.mod) y = def.mod(0, 0, y);
      setPos(0, def.cx, y, def.cz);
      setSplat(0, def.cx, def.cz, 0);
    }
    for (let ring = 1; ring <= rings; ring++) {
      const radial = ring / rings;
      for (let seg = 0; seg < segs; seg++) {
        const x = def.cx + radial * this.Rj[seg] * this.ux[seg];
        const z = def.cz + radial * this.Rj[seg] * this.uz[seg];
        let y = this.flatten(x, z, this.natural(x, z));
        y -= this.pathMask(x - def.cx, z - def.cz) * 0.05;
        if (def.mod) y = def.mod(x - def.cx, z - def.cz, y);
        const vi = this.vid(ring, seg);
        setPos(vi, x, y, z);
        setSplat(vi, x, z, radial);
        if (ring === rings) rimY[seg] = y;
      }
    }
    const scale = clamp(def.r / 24, 0.45, 1.15);
    const lobes = def.lobes;
    for (let i = 0; i < under; i++) {
      const [radiusK, drop, depthK, earth] = UNDERSIDE_PROFILE[i];
      const blend = smoothstep(0, 0.3, depthK);
      for (let seg = 0; seg < segs; seg++) {
        const angle = (seg / segs) * TAU;
        const lobe =
          (0.5 +
            0.5 * Math.cos(lobes * angle + this.lobePhase + this.no(this.ux[seg] * 0.8, this.uz[seg] * 0.8) * 0.9)) **
          3;
        const swell = 1 + def.lobeAmp * lobe;
        const coarse = this.n3(this.ux[seg] * 1.6, this.uz[seg] * 1.6, i * 0.55);
        const mid = this.n3(this.ux[seg] * 4.2 + 11, this.uz[seg] * 4.2, i * 1.3);
        const taper = def.taper ?? 1;
        let radScale =
          (depthK > 0 ? Math.max(0.04, 1 - (1 - radiusK) * taper) : radiusK) * (1 + def.lobeAmp * 0.9 * lobe * depthK);
        const ridge = this.n3(this.ux[seg] * 7.5, this.uz[seg] * 7.5, 3.3);
        const fine = this.n3(this.ux[seg] * 17, this.uz[seg] * 17, 8.1);
        const ledge = i >= 4 ? (i % 2 == 0 ? 0.05 : -0.025) * (0.6 + 0.4 * mid) : 0;
        radScale *=
          i >= 3
            ? 1 + 0.08 * coarse + 0.045 * mid + (0.03 * ridge + 0.01 * fine) * smoothstep(0, 0.3, depthK + 0.05) + ledge
            : 1 + 0.012 * mid + 0.02 * fine;
        const rad = this.Rj[seg] * radScale;
        const x = def.cx + rad * this.ux[seg];
        const z = def.cz + rad * this.uz[seg];
        let y =
          rimY[seg] +
          (def.y - 1.2 - rimY[seg]) * blend +
          drop * scale -
          depthK * def.depth * swell * (1 + 0.12 * ridge);
        y += (coarse * 0.5 + mid * 0.3) * (i >= 3 ? 0.6 + depthK * 3.2 : 0.12);
        const vi = this.vid(rings + 1 + i, seg);
        setPos(vi, x, y, z);
        splat[vi * 4] = 1 - earth;
        splat[vi * 4 + 1] = 0;
        splat[vi * 4 + 2] = earth;
        splat[vi * 4 + 3] = 0;
      }
    }
    {
      const tip = this.vertCount - 1;
      const tipY = def.y - 1.2 - def.depth * (1 + def.lobeAmp * 0.25);
      setPos(tip, def.cx + this.no(1.1, 2.2) * def.r * 0.08, tipY, def.cz + this.no(5.1, 0.2) * def.r * 0.08);
      this.bottomY = tipY;
      splat[tip * 4] = 1;
    }
    const index = this.index;
    let ptr = 0;
    for (let seg = 0; seg < segs; seg++) {
      index[ptr++] = 0;
      index[ptr++] = this.vid(1, seg + 1);
      index[ptr++] = this.vid(1, seg);
    }
    const lastRing = rings + under;
    for (let ring = 1; ring < lastRing; ring++)
      for (let seg = 0; seg < segs; seg++) {
        const v00 = this.vid(ring, seg);
        const v01 = this.vid(ring, seg + 1);
        const v10 = this.vid(ring + 1, seg);
        const v11 = this.vid(ring + 1, seg + 1);
        index[ptr++] = v00;
        index[ptr++] = v01;
        index[ptr++] = v10;
        index[ptr++] = v01;
        index[ptr++] = v11;
        index[ptr++] = v10;
      }
    const tip = this.vertCount - 1;
    for (let seg = 0; seg < segs; seg++) {
      index[ptr++] = this.vid(lastRing, seg);
      index[ptr++] = this.vid(lastRing, seg + 1);
      index[ptr++] = tip;
    }
  }
  locate(x2, z, loc) {
    const dx = x2 - this.cx;
    const dz = z - this.cz;
    const d2 = dx * dx + dz * dz;
    if (!(d2 <= this.maxR * this.maxR)) return false;
    const segs = this.S;
    const rings = this.K;
    const pos = this.pos;
    let angle = Math.atan2(dz, dx);
    if (angle < 0) angle += TAU;
    let seg = Math.floor((angle / TAU) * segs);
    if (seg >= segs) seg = segs - 1;
    if (seg < 0) seg = 0;
    const next = (seg + 1) % segs;
    const ia = this.vid(rings, seg) * 3;
    const ib = this.vid(rings, next) * 3;
    const ax = pos[ia] - this.cx;
    const az = pos[ia + 2] - this.cz;
    const bx = pos[ib] - this.cx;
    const bz = pos[ib + 2] - this.cz;
    const ex = bx - ax;
    const ez = bz - az;
    const den = dx * ez - dz * ex;
    let rt;
    if (Math.abs(den) < 1e-9) rt = Math.sqrt(d2) / Math.max(0.000001, Math.hypot(ax, az));
    else {
      const s = -(dx * az - dz * ax) / den;
      const px = ax + ex * s;
      const pz = az + ez * s;
      rt = (dx * px + dz * pz) / Math.max(1e-9, px * px + pz * pz);
    }
    if (rt > 1 + 0.00001) return false;
    let ring = Math.floor(rt * rings);
    if (ring >= rings) ring = rings - 1;
    if (ring < 0) ring = 0;
    if (ring === 0) return this.bary(x2, z, 0, this.vid(1, next), this.vid(1, seg), loc, true);
    const q00 = this.vid(ring, seg);
    const q01 = this.vid(ring, next);
    const q10 = this.vid(ring + 1, seg);
    const q11 = this.vid(ring + 1, next);
    return this.bary(x2, z, q00, q01, q10, loc, false) || this.bary(x2, z, q01, q11, q10, loc, false)
      ? true
      : this.bary(x2, z, q01, q11, q10, loc, true);
  }
  bary(x, z, ia, ib, ic, loc, force) {
    const pos = this.pos;
    const ax = pos[ia * 3];
    const az = pos[ia * 3 + 2];
    const bx = pos[ib * 3];
    const bz = pos[ib * 3 + 2];
    const cx = pos[ic * 3];
    const cz = pos[ic * 3 + 2];
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-12)
      return force
        ? ((loc.i0 = ia), (loc.i1 = ib), (loc.i2 = ic), (loc.w0 = 1), (loc.w1 = 0), (loc.w2 = 0), true)
        : false;
    let w0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
    let w1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
    let w2 = 1 - w0 - w1;
    const eps = -0.00001;
    if (!force && (w0 < eps || w1 < eps || w2 < eps)) return false;
    if (force) {
      w0 = Math.max(0, w0);
      w1 = Math.max(0, w1);
      w2 = Math.max(0, w2);
      const sum = w0 + w1 + w2 || 1;
      w0 /= sum;
      w1 /= sum;
      w2 /= sum;
    }
    loc.i0 = ia;
    loc.i1 = ib;
    loc.i2 = ic;
    loc.w0 = w0;
    loc.w1 = w1;
    loc.w2 = w2;
    return true;
  }
  heightFrom(loc) {
    const pos = this.pos;
    return pos[loc.i0 * 3 + 1] * loc.w0 + pos[loc.i1 * 3 + 1] * loc.w1 + pos[loc.i2 * 3 + 1] * loc.w2;
  }
  grassFrom(loc) {
    const grass = this.grass;
    const g0 = loc.i0 < this.topVerts ? grass[loc.i0] : 0;
    const g1 = loc.i1 < this.topVerts ? grass[loc.i1] : 0;
    const g2 = loc.i2 < this.topVerts ? grass[loc.i2] : 0;
    return g0 * loc.w0 + g1 * loc.w1 + g2 * loc.w2;
  }
  radialT(x, z) {
    const dx = x - this.cx;
    const dz = z - this.cz;
    return Math.hypot(dx, dz) / Math.max(0.001, this.outline(Math.atan2(dz, dx)));
  }
  lipAt(angle, out, outward) {
    let ang = angle % TAU;
    if (ang < 0) ang += TAU;
    const f = (ang / TAU) * this.S;
    const seg = Math.floor(f) % this.S;
    const t = f - Math.floor(f);
    const ia = this.vid(this.K, seg) * 3;
    const ib = this.vid(this.K, seg + 1) * 3;
    const pos = this.pos;
    out.set(
      pos[ia] + (pos[ib] - pos[ia]) * t,
      pos[ia + 1] + (pos[ib + 1] - pos[ia + 1]) * t,
      pos[ia + 2] + (pos[ib + 2] - pos[ia + 2]) * t,
    );
    if (outward) outward.set(out.x - this.cx, 0, out.z - this.cz).normalize();
    return out;
  }
  undersideAt(angle, ring, out) {
    let ang = angle % TAU;
    if (ang < 0) ang += TAU;
    const seg = Math.round((ang / TAU) * this.S) % this.S;
    const vi = this.vid(this.K + 1 + clamp(Math.round(ring), 0, this.U - 1), seg) * 3;
    return out.set(this.pos[vi], this.pos[vi + 1], this.pos[vi + 2]);
  }
  undersideBelow(angle, radial, out) {
    let ang = angle % TAU;
    if (ang < 0) ang += TAU;
    const seg = Math.round((ang / TAU) * this.S) % this.S;
    const pos = this.pos;
    const rimR = this.Rj[seg];
    let prevT = 1.1;
    let prevY = pos[this.vid(this.K, seg) * 3 + 1];
    for (let i = 0; i < this.U; i++) {
      const vi = this.vid(this.K + 1 + i, seg) * 3;
      const rt = Math.hypot(pos[vi] - this.cx, pos[vi + 2] - this.cz) / rimR;
      const y = pos[vi + 1];
      if (rt <= radial) {
        const k = clamp((prevT - radial) / Math.max(0.0001, prevT - rt), 0, 1);
        return out.set(
          this.cx + this.ux[seg] * radial * rimR,
          prevY + (y - prevY) * k,
          this.cz + this.uz[seg] * radial * rimR,
        );
      }
      prevT = rt;
      prevY = y;
    }
    return out.set(this.cx + this.ux[seg] * radial * rimR, this.bottomY, this.cz + this.uz[seg] * radial * rimR);
  }
  geometry() {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
    geometry.setAttribute('aSky', new BufferAttribute(this.splat, 4));
    geometry.setIndex(new BufferAttribute(this.index, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    return geometry;
  }
}
