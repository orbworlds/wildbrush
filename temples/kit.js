/**
 * TempleKit, the builder for temple interiors: floors, ceilings, walls with doorways and trim, pilasters, columns, basalt, stairs, braziers, hint stones, glyphs and lava, merged into meshes with static colliders. Also the room, glyph frieze and banner helpers.
 */
import {
  BoxGeometry,
  BufferAttribute,
  CircleGeometry,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  PlaneGeometry,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';
import { COLLISION_GROUPS } from '../core/config.js';
import { columnGeometry, lathe, mergeGeometries, roundedBox } from '../shared/util.js';
import { KIND } from './stone-material.js';
export function buildRoom(kit, room) {
  const walls = {
    n: true,
    s: true,
    e: true,
    w: true,
    ...(room.walls ?? {}),
  };
  const x0 = room.x0 - +!!walls.w;
  const x1 = room.x1 + +!!walls.e;
  const z0 = room.z0 - +!!walls.n;
  const z1 = room.z1 + +!!walls.s;
  if (!room.noFloor)
    kit.floor(x0, x1, z0, z1, 0, room.floor, 0.8, room.floorSurface ?? 'stone', room.floorKind ?? KIND.ashlar);
  kit.ceiling(x0, x1, z0, z1, room.h, room.ceil, room.beams ?? 0, room.style.trim);
  const doors = room.doors ?? [];
  const doorsOn = (side) =>
    doors
      .filter((door) => door.side === side)
      .map((door) => ({
        c: door.c,
        w: door.w,
        h: door.h,
        plain: door.plain,
      }));
  if (walls.n)
    kit.wall(room.x0 - 1, room.z0 - 1 / 2, room.x1 + 1, room.z0 - 1 / 2, 0, room.h, 1, room.style, doorsOn('n'), ['+']);
  if (walls.s)
    kit.wall(room.x0 - 1, room.z1 + 1 / 2, room.x1 + 1, room.z1 + 1 / 2, 0, room.h, 1, room.style, doorsOn('s'), ['-']);
  if (walls.w)
    kit.wall(room.x0 - 1 / 2, room.z0, room.x0 - 1 / 2, room.z1, 0, room.h, 1, room.style, doorsOn('w'), ['+']);
  if (walls.e)
    kit.wall(room.x1 + 1 / 2, room.z0, room.x1 + 1 / 2, room.z1, 0, room.h, 1, room.style, doorsOn('e'), ['-']);
  const pilasters = room.pilasters ?? 0;
  if (pilasters > 0) {
    if (walls.n) kit.pilasters(true, room.z0, room.x0, room.x1, 0, room.h, 1, pilasters, room.style.trim, doorsOn('n'));
    if (walls.s)
      kit.pilasters(true, room.z1, room.x0, room.x1, 0, room.h, -1, pilasters, room.style.trim, doorsOn('s'));
    if (walls.w)
      kit.pilasters(false, room.x0, room.z0, room.z1, 0, room.h, 1, pilasters, room.style.trim, doorsOn('w'));
    if (walls.e)
      kit.pilasters(false, room.x1, room.z0, room.z1, 0, room.h, -1, pilasters, room.style.trim, doorsOn('e'));
  }
}
export function glyphFrieze(kit, alongX, at, from, to, y, side, step, glyphs, color, ch, glow, doors = []) {
  const normal = new Vector3(alongX ? 0 : side, 0, alongX ? side : 0);
  let next = 0;
  for (let along = from + step / 2; along < to; along += step) {
    if (doors.some((door) => Math.abs(along - door.c) < door.w / 2 + 1.2)) continue;
    const glyph = glyphs[next++ % glyphs.length];
    if (alongX) kit.glyph(along, y, at + side * 0.02, normal, 0.75, glyph, color, ch, glow);
    else kit.glyph(at + side * 0.02, y, along, normal, 0.75, glyph, color, ch, glow);
  }
}
export function banner(kit, x, z, y, rot, width, drop, clothColor, rodColor, glyphColor, glyph, ch) {
  const normal = new Vector3(Math.sin(rot), 0, Math.cos(rot));
  kit.box(x, y - drop / 2, z, width, drop, 0.06, clothColor, {
    rot,
    kind: KIND.wood,
  });
  kit.box(x, y + 0.05, z, width + 0.4, 0.14, 0.14, rodColor, {
    rot,
    kind: KIND.metal,
  });
  kit.box(x + normal.z * 0, y - drop - 0.15, z, width * 0.5, 0.3, 0.05, clothColor, {
    rot,
    kind: KIND.wood,
  });
  kit.glyph(
    x + normal.x * 0.05,
    y - drop * 0.45,
    z + normal.z * 0.05,
    normal,
    Math.min(width * 0.8, 1.2),
    glyph,
    glyphColor,
    ch,
    1.1,
  );
}
export const _mat4 = new Matrix4();
export const _quat = new Quaternion();
export const _scale = new Vector3();
export const _pos = new Vector3();
const _color = new Color();
const _zAxis = new Vector3(0, 0, 1);
const _up = new Vector3(0, 1, 0);
export const rotQuat = (rot, target = _quat) =>
  rot === undefined
    ? target.identity()
    : typeof rot == 'number'
      ? target.setFromAxisAngle(_up, rot)
      : target.setFromEuler(rot);
export function bakeGeometry(geometry, color, options = {}, matrix) {
  if (geometry.attributes.uv) geometry.deleteAttribute('uv');
  if (geometry.attributes.uv1) geometry.deleteAttribute('uv1');
  if (matrix) geometry.applyMatrix4(matrix);
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const count = geometry.attributes.position.count;
  const rgb = color instanceof Color ? color : _color.set(color);
  const colors = new Float32Array(count * 3);
  const mats = new Float32Array(count * 4);
  const kind = options.kind ?? KIND.ashlar;
  const ch = options.glow ? options.glow[0] : 0;
  const glow = options.glow ? options.glow[1] : 0;
  for (let i = 0; i < count; i++) {
    colors[i * 3] = rgb.r;
    colors[i * 3 + 1] = rgb.g;
    colors[i * 3 + 2] = rgb.b;
    mats[i * 4] = kind;
    mats[i * 4 + 1] = ch;
    mats[i * 4 + 2] = glow;
    mats[i * 4 + 3] = +!!options.obj;
  }
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  geometry.setAttribute('aMat', new BufferAttribute(mats, 4));
  return geometry;
}
export class TempleKit {
  ctx;
  chunks = new Map();
  glyphParts = [];
  lavaParts = [];
  cols = [];
  chunk = 'main';
  origin;
  constructor(ctx, at) {
    this.ctx = ctx;
    this.origin = at.clone();
  }
  w(x, y, z, target = new Vector3()) {
    return target.set(this.origin.x + x, this.origin.y + y, this.origin.z + z);
  }
  push(geometry) {
    let list = this.chunks.get(this.chunk);
    if (!list) this.chunks.set(this.chunk, (list = []));
    list.push(geometry);
  }
  geo(geometry, x, y, z, color, options = {}, scale) {
    rotQuat(options.rot);
    if (scale === undefined) _scale.set(1, 1, 1);
    else if (typeof scale == 'number') _scale.setScalar(scale);
    else _scale.copy(scale);
    _mat4.compose(this.w(x, y, z, _pos), _quat, _scale);
    const baked = bakeGeometry(geometry, color, options, _mat4);
    this.push(baked);
    return baked;
  }
  box(x, y, z, w, h, d, color, options = {}) {
    const geometry = options.bevel ? roundedBox(w, h, d, options.bevel, 0.6) : new BoxGeometry(w, h, d);
    this.geo(geometry, x, y, z, color, options);
    if (options.col)
      this.colBox(x, y, z, w / 2, h / 2, d / 2, options.rot, typeof options.col == 'string' ? options.col : 'stone');
  }
  colBox(x, y, z, hx, hy, hz, rot, surface = 'stone', tag) {
    const desc = this.ctx.RAPIER.ColliderDesc.cuboid(Math.max(0.01, hx), Math.max(0.01, hy), Math.max(0.01, hz));
    const pos = this.w(x, y, z, _pos);
    rotQuat(rot);
    desc.setTranslation(pos.x, pos.y, pos.z).setRotation({
      x: _quat.x,
      y: _quat.y,
      z: _quat.z,
      w: _quat.w,
    });
    desc.setCollisionGroups(COLLISION_GROUPS.static).setFriction(0.8);
    const col = {
      desc,
      surface,
      tag,
    };
    this.cols.push(col);
    return col;
  }
  colCyl(x, y, z, halfH, radius, surface = 'stone') {
    const desc = this.ctx.RAPIER.ColliderDesc.cylinder(halfH, radius);
    const pos = this.w(x, y, z, _pos);
    desc.setTranslation(pos.x, pos.y, pos.z).setCollisionGroups(COLLISION_GROUPS.static).setFriction(0.8);
    this.cols.push({
      desc,
      surface,
    });
  }
  colRamp(x0, y0, z0, x1, y1, z1, width, thick = 0.4, surface = 'stone', tag) {
    const start = new Vector3(x0, y0, z0);
    const end = new Vector3(x1, y1, z1);
    const dir = end.clone().sub(start);
    const len = dir.length();
    dir.normalize();
    const flat = new Vector3(dir.x, 0, dir.z).normalize();
    const side = new Vector3().crossVectors(_up, flat).normalize();
    const up = new Vector3().crossVectors(dir, side).normalize();
    if (up.y < 0) up.negate();
    const basis = new Matrix4().makeBasis(side, up, dir);
    const quat = new Quaternion().setFromRotationMatrix(basis);
    const mid = start
      .clone()
      .add(end)
      .multiplyScalar(0.5)
      .addScaledVector(up, -thick / 2);
    const desc = this.ctx.RAPIER.ColliderDesc.cuboid(width / 2, thick / 2, len / 2);
    const pos = this.w(mid.x, mid.y, mid.z, _pos);
    desc.setTranslation(pos.x, pos.y, pos.z).setRotation({
      x: quat.x,
      y: quat.y,
      z: quat.z,
      w: quat.w,
    });
    desc.setCollisionGroups(COLLISION_GROUPS.static).setFriction(0.8);
    const col = {
      desc,
      surface,
      tag,
    };
    this.cols.push(col);
    return col;
  }
  glyph(px, py, pz, normal, size, glyphId, hex, ch, glow, spin = 0, height) {
    const geometry = new PlaneGeometry(size, height ?? size);
    const uv = geometry.attributes.uv;
    const col = glyphId % 4;
    const row = Math.floor(glyphId / 4) % 4;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      uv.setXY(i, (col + u) / 4, 1 - (row + 1 - v) / 4);
    }
    const quat = new Quaternion().setFromUnitVectors(_zAxis, normal.clone().normalize());
    quat.multiply(new Quaternion().setFromAxisAngle(_zAxis, spin));
    const pos = this.w(px, py, pz).addScaledVector(normal, 0.015);
    geometry.applyMatrix4(new Matrix4().compose(pos, quat, new Vector3(1, 1, 1)));
    geometry.deleteAttribute('normal');
    const count = geometry.attributes.position.count;
    const color = new Color(hex);
    const colors = new Float32Array(count * 3);
    const glows = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      colors.set([color.r, color.g, color.b], i * 3);
      glows.set([ch, glow], i * 2);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setAttribute('aGl', new BufferAttribute(glows, 2));
    this.glyphParts.push(geometry);
  }
  lava(x0, x1, z0, z1, y, flowX = 0, flowZ = 1) {
    const geometry = new PlaneGeometry(
      x1 - x0,
      z1 - z0,
      Math.max(1, Math.round((x1 - x0) / 2)),
      Math.max(1, Math.round((z1 - z0) / 2)),
    );
    geometry.rotateX(-Math.PI / 2);
    geometry.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    geometry.translate(this.origin.x, this.origin.y, this.origin.z);
    geometry.deleteAttribute('uv');
    geometry.deleteAttribute('normal');
    const count = geometry.attributes.position.count;
    const flow = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) flow.set([flowX, flowZ], i * 2);
    geometry.setAttribute('aFlow', new BufferAttribute(flow, 2));
    this.lavaParts.push(geometry);
  }
  lavaDisc(x, z, radius, y, flowX = 0, flowZ = 1) {
    const geometry = new CircleGeometry(radius, 36);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(this.origin.x + x, this.origin.y + y, this.origin.z + z);
    geometry.deleteAttribute('uv');
    geometry.deleteAttribute('normal');
    const count = geometry.attributes.position.count;
    const flow = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) flow.set([flowX, flowZ], i * 2);
    geometry.setAttribute('aFlow', new BufferAttribute(flow, 2));
    this.lavaParts.push(geometry);
  }
  floor(x0, x1, z0, z1, y, color, thick = 0.8, surface = 'stone', kind = KIND.ashlar) {
    this.box((x0 + x1) / 2, y - thick / 2, (z0 + z1) / 2, x1 - x0, thick, z1 - z0, color, {
      kind,
      col: surface,
    });
  }
  ceiling(x0, x1, z0, z1, y, color, beams = 0, beamColor = color) {
    this.box((x0 + x1) / 2, y + 0.5, (z0 + z1) / 2, x1 - x0, 1, z1 - z0, color, {
      col: true,
    });
    if (beams > 0) {
      const spanX = x1 - x0;
      const spanZ = z1 - z0;
      if (spanX >= spanZ)
        for (let i = x0 + beams; i < x1 - 0.5; i += beams)
          this.box(i, y - 0.3, (z0 + z1) / 2, 0.55, 0.6, spanZ, beamColor, {
            kind: KIND.smooth,
          });
      else
        for (let i = z0 + beams; i < z1 - 0.5; i += beams)
          this.box((x0 + x1) / 2, y - 0.3, i, spanX, 0.6, 0.55, beamColor, {
            kind: KIND.smooth,
          });
    }
  }
  wall(x0, z0, x1, z1, y, height, thick, style, doors = [], faces = ['+', '-']) {
    const alongX = Math.abs(z1 - z0) < 0.000001;
    const from = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
    const to = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const at = alongX ? z0 : x0;
    const spans = [...doors].sort((a, b) => a.c - b.c);
    const wainscot = style.wainscot ?? 1.25;
    const fill = (s0, s1, y0, y1) => {
      if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return;
      const mid = (s0 + s1) / 2;
      const len = s1 - s0;
      const split = Math.min(Math.max(wainscot, y0), y1);
      if (split > y0 + 0.01) {
        const lowH = split - y0;
        if (alongX)
          this.box(mid, y + y0 + lowH / 2, at, len, lowH, thick, style.low, {
            kind: style.lowKind ?? KIND.ashlar,
          });
        else
          this.box(at, y + y0 + lowH / 2, mid, thick, lowH, len, style.low, {
            kind: style.lowKind ?? KIND.ashlar,
          });
      }
      if (y1 > split + 0.01) {
        const highH = y1 - split;
        if (alongX) this.box(mid, y + split + highH / 2, at, len, highH, thick, style.base);
        else this.box(at, y + split + highH / 2, mid, thick, highH, len, style.base);
      }
      if (alongX) this.colBox(mid, y + (y0 + y1) / 2, at, len / 2, (y1 - y0) / 2, thick / 2);
      else this.colBox(at, y + (y0 + y1) / 2, mid, thick / 2, (y1 - y0) / 2, len / 2);
    };
    let cursor = from;
    for (const door of spans) {
      const d0 = door.c - door.w / 2;
      const d1 = door.c + door.w / 2;
      fill(cursor, d0, 0, height);
      fill(d0, d1, door.h, height);
      cursor = d1;
    }
    fill(cursor, to, 0, height);
    for (const face of faces) {
      const sign = face === '+' ? 1 : -1;
      const trimAt = at + sign * (thick / 2 + 0.05);
      let start = from;
      const runs = [];
      for (const door of spans) {
        runs.push([start, door.c - door.w / 2]);
        start = door.c + door.w / 2;
      }
      runs.push([start, to]);
      for (const [r0, r1] of runs) {
        if (r1 - r0 < 0.2) continue;
        const mid = (r0 + r1) / 2;
        const len = r1 - r0;
        if (alongX) {
          this.box(mid, y + wainscot, trimAt, len, 0.14, 0.12, style.trim, {
            kind: KIND.smooth,
          });
          this.box(mid, y + 0.14, trimAt, len, 0.28, 0.12, style.low, {
            kind: KIND.smooth,
          });
        } else {
          this.box(trimAt, y + wainscot, mid, 0.12, 0.14, len, style.trim, {
            kind: KIND.smooth,
          });
          this.box(trimAt, y + 0.14, mid, 0.12, 0.28, len, style.low, {
            kind: KIND.smooth,
          });
        }
      }
      const corniceAt = at + sign * (thick / 2 + 0.18);
      if (alongX)
        this.box((from + to) / 2, y + height - 0.3, corniceAt, to - from, 0.34, 0.36, style.trim, {
          kind: KIND.smooth,
        });
      else
        this.box(corniceAt, y + height - 0.3, (from + to) / 2, 0.36, 0.34, to - from, style.trim, {
          kind: KIND.smooth,
        });
      for (const door of spans) {
        if (door.plain) continue;
        const normal = alongX ? new Vector3(0, 0, sign) : new Vector3(sign, 0, 0);
        const frameAt = at + sign * (thick / 2 + 0.16);
        for (const dir of [-1, 1]) {
          const jambAt = door.c + dir * (door.w / 2 + 0.28);
          if (alongX)
            this.box(jambAt, y + door.h / 2, frameAt, 0.62, door.h, 0.34, style.trim, {
              kind: KIND.smooth,
              col: true,
            });
          else
            this.box(frameAt, y + door.h / 2, jambAt, 0.34, door.h, 0.62, style.trim, {
              kind: KIND.smooth,
              col: true,
            });
        }
        const lintelH = 0.7;
        if (alongX)
          this.box(door.c, y + door.h + lintelH / 2, frameAt, door.w + 1.4, lintelH, 0.4, style.trim, {
            kind: KIND.smooth,
          });
        else
          this.box(frameAt, y + door.h + lintelH / 2, door.c, 0.4, lintelH, door.w + 1.4, style.trim, {
            kind: KIND.smooth,
          });
        const glyphAt = alongX
          ? [door.c, y + door.h + lintelH / 2, at + sign * (thick / 2 + 0.37)]
          : [at + sign * (thick / 2 + 0.37), y + door.h + lintelH / 2, door.c];
        this.glyph(glyphAt[0], glyphAt[1], glyphAt[2], normal, 0.62, style.glyph, style.glass, 1, 1);
      }
    }
  }
  pilasters(alongX, at, from, to, y, height, dir, step, color, doors = [], capColor = color) {
    const count = Math.max(1, Math.floor((to - from) / step));
    const gap = (to - from) / count;
    for (let i = 1; i < count; i++) {
      const along = from + i * gap;
      if (doors.some((door) => Math.abs(along - door.c) < door.w / 2 + 1.1)) continue;
      const faceAt = at + dir * 0.2;
      if (alongX) {
        this.box(along, y + height / 2, faceAt, 0.8, height, 0.4, color, {
          kind: KIND.smooth,
          col: true,
        });
        this.box(along, y + height - 0.8, at + dir * 0.3, 1, 0.3, 0.6, capColor, {
          kind: KIND.smooth,
        });
      } else {
        this.box(faceAt, y + height / 2, along, 0.4, height, 0.8, color, {
          kind: KIND.smooth,
          col: true,
        });
        this.box(at + dir * 0.3, y + height - 0.8, along, 0.6, 0.3, 1, capColor, {
          kind: KIND.smooth,
        });
      }
    }
  }
  column(x, z, y, height, radius, color, capColor = color) {
    const geometry = columnGeometry(radius, height, {
      capital: true,
      seed: x * 3.1 + z,
    });
    this.geo(geometry, x, y, z, color, {
      kind: KIND.smooth,
    });
    this.box(x, y + height + 0.2, z, radius * 3.4, 0.4, radius * 3.4, capColor, {
      kind: KIND.smooth,
    });
    this.colCyl(x, y + height / 2, z, height / 2, radius * 1.1);
  }
  basalt(x, z, y, height, radius, color, solid = true) {
    const geometry = new CylinderGeometry(radius * 0.96, radius, height, 6, 1);
    this.geo(geometry, x, y + height / 2, z, color, {
      kind: KIND.basalt,
      rot: (x * 0.7 + z * 0.3) % 1,
    });
    if (solid) this.colCyl(x, y + height / 2, z, height / 2, radius * 0.95, 'rock');
  }
  stairs(x, y, z, dx, dz, steps, rise, run, width, color, altColor = color) {
    const angle = Math.atan2(dx, dz);
    for (let i = 0; i < steps; i++) {
      const along = (i + 0.5) * run;
      const height = (i + 1) * rise;
      this.box(x + dx * along, y + height / 2, z + dz * along, width, height, run, i % 2 ? color : altColor, {
        rot: angle,
        kind: KIND.ashlar,
      });
    }
    const len = steps * run;
    this.colRamp(
      x - dx * 0.1,
      y + 0.02,
      z - dz * 0.1,
      x + dx * (len + 0.05),
      y + steps * rise,
      z + dz * (len + 0.05),
      width,
      0.6,
    );
  }
  brazier(px, pz, py, trim, metal, glass, ch, scale = 1) {
    const k = scale;
    this.box(px, py + 0.2 * k, pz, 1.3 * k, 0.4 * k, 1.3 * k, trim, {
      kind: KIND.smooth,
      bevel: 0.06,
    });
    const stem = lathe(
      [
        [0.42 * k, 0],
        [0.34 * k, 0.1 * k],
        [0.26 * k, 0.35 * k],
        [0.22 * k, 0.75 * k],
        [0.3 * k, 0.85 * k],
        [0.02, 0.86 * k],
      ],
      10,
    );
    this.geo(stem, px, py + 0.4 * k, pz, trim, {
      kind: KIND.smooth,
    });
    const bowl = lathe(
      [
        [0.02, 0],
        [0.35 * k, 0.02 * k],
        [0.62 * k, 0.22 * k],
        [0.78 * k, 0.5 * k],
        [0.72 * k, 0.52 * k],
        [0.56 * k, 0.3 * k],
        [0.02, 0.2 * k],
      ],
      16,
    );
    this.geo(bowl, px, py + 1.22 * k, pz, metal, {
      kind: KIND.metal,
    });
    const ring = new TorusGeometry(0.7 * k, 0.05 * k, 6, 24);
    ring.rotateX(Math.PI / 2);
    this.geo(ring, px, py + 1.62 * k, pz, glass, {
      kind: KIND.glass,
      glow: [ch, 1.2],
    });
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const coal = new IcosahedronGeometry(0.16 * k, 0);
      this.geo(coal, px + Math.cos(ang) * 0.28 * k, py + 1.5 * k, pz + Math.sin(ang) * 0.28 * k, 2760989, {
        kind: KIND.rough,
        glow: [ch, 0.35],
      });
    }
    this.colCyl(px, py + 0.9 * k, pz, 0.9 * k, 0.62 * k);
    return new Vector3(px, py + 1.55 * k, pz);
  }
  hintStone(x, z, y, rot, trim, glass, glyph) {
    this.box(x, y + 0.15, z, 1.5, 0.3, 1, trim, {
      rot,
      kind: KIND.smooth,
      bevel: 0.05,
    });
    this.box(x, y + 1.15, z, 1.1, 1.8, 0.36, trim, {
      rot,
      kind: KIND.smooth,
      bevel: 0.08,
      col: true,
    });
    const normal = new Vector3(Math.sin(rot), 0, Math.cos(rot));
    this.glyph(x + normal.x * 0.19, y + 1.35, z + normal.z * 0.19, normal, 0.7, glyph, glass, 0, 1.1);
    this.glyph(x + normal.x * 0.19, y + 0.75, z + normal.z * 0.19, normal, 0.9, 15, glass, 0, 0.5, 0, 0.06);
  }
  build(material, glyphMat, lavaMat, root, meta) {
    for (const [label, parts] of this.chunks) {
      if (!parts.length) continue;
      const merged = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      const mesh = new Mesh(merged, material);
      mesh.name = `temple-${meta.site}-${label}`;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      root.add(mesh);
    }
    this.chunks.clear();
    if (this.glyphParts.length) {
      const merged = mergeGeometries(this.glyphParts);
      for (const glyphPart of this.glyphParts) glyphPart.dispose();
      const mesh = new Mesh(merged, glyphMat);
      mesh.name = `temple-${meta.site}-glyphs`;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
      this.glyphParts.length = 0;
    }
    if (this.lavaParts.length && lavaMat) {
      const merged = mergeGeometries(this.lavaParts);
      for (const lavaPart of this.lavaParts) lavaPart.dispose();
      const mesh = new Mesh(merged, lavaMat);
      mesh.name = `temple-${meta.site}-lava`;
      mesh.matrixAutoUpdate = false;
      root.add(mesh);
      this.lavaParts.length = 0;
    }
    const colliders = [];
    for (const col of this.cols)
      try {
        const collider = this.ctx.physics.createCollider(col.desc);
        this.ctx.colliders.register(collider, {
          kind: 'structure',
          surface: col.surface,
          object: meta.object,
          data: {
            temple: meta.site,
            tag: col.tag,
          },
        });
        colliders.push(collider);
      } catch (err) {
        console.warn('[temples] collider failed', err);
      }
    this.cols.length = 0;
    return colliders;
  }
}
