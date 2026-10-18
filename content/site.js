/**
 * Site: gathers stone, prop and glyph geometry plus static colliders for one piece of world content and merges them into meshes. SiteBatch merges many sites per spatial cell, and grass clearings requested by sites are applied to vegetation in one pass.
 */
import { Group, Matrix4, Mesh, PlaneGeometry, Quaternion, Vector3 } from 'three';
import { COLLISION_GROUPS } from '../core/config.js';
import { colorize, fillAttribute, mergeGeometries } from '../shared/util.js';
const _mat4 = new Matrix4();
const _quat = new Quaternion();
const _scale = new Vector3();
const _zAxis = new Vector3(0, 0, 1);
function toQuaternion(rot, target = new Quaternion()) {
  return rot === undefined
    ? target.identity()
    : typeof rot == 'number'
      ? target.setFromAxisAngle(new Vector3(0, 1, 0), rot)
      : rot.isQuaternion
        ? target.copy(rot)
        : target.setFromEuler(rot);
}
export class Site {
  ctx;
  name;
  parts = {
    stone: [],
    prop: [],
    glyph: [],
  };
  colliderDescs = [];
  colliders = [];
  group = new Group();
  castShadow = true;
  constructor(ctx, id) {
    this.ctx = ctx;
    this.name = id;
    this.group.name = `content-${id}`;
  }
  add(kind, geometry, pos, rot, scale, color) {
    toQuaternion(rot, _quat);
    if (scale === undefined) _scale.set(1, 1, 1);
    else if (typeof scale == 'number') _scale.setScalar(scale);
    else _scale.copy(scale);
    _mat4.compose(pos, _quat, _scale);
    geometry.applyMatrix4(_mat4);
    if (color === undefined) {
      if (!geometry.attributes.color) colorize(geometry, 16777215);
    } else colorize(geometry, color);
    if (!geometry.attributes.normal) geometry.computeVertexNormals();
    this.parts[kind].push(geometry);
    return geometry;
  }
  stone(geometry, pos, rot, color = 14273713, scale) {
    return this.add('stone', geometry, pos, rot, scale, color);
  }
  prop(geometry, pos, rot, color = 16777215, scale) {
    return this.add('prop', geometry, pos, rot, scale, color);
  }
  glyph(pos, normal, size, index, color, glow = 0, rotation = 0, height) {
    const geometry = new PlaneGeometry(size, height ?? size);
    const uv = geometry.attributes.uv;
    const col = index % 4;
    const row = Math.floor(index / 4) % 4;
    for (let i = 0; i < uv.count; i++) {
      const u2 = uv.getX(i);
      const v = uv.getY(i);
      uv.setXY(i, (col + u2) / 4, 1 - (row + 1 - v) / 4);
    }
    const quat = new Quaternion().setFromUnitVectors(_zAxis, normal.clone().normalize());
    quat.multiply(new Quaternion().setFromAxisAngle(_zAxis, rotation));
    _mat4.compose(pos.clone().addScaledVector(normal, 0.012), quat, _scale.set(1, 1, 1));
    geometry.applyMatrix4(_mat4);
    colorize(geometry, color);
    fillAttribute(geometry, 'aGlow', 1, glow);
    this.parts.glyph.push(geometry);
  }
  push(desc, pos, rot) {
    toQuaternion(rot, _quat);
    desc.setTranslation(pos.x, pos.y, pos.z).setRotation({
      x: _quat.x,
      y: _quat.y,
      z: _quat.z,
      w: _quat.w,
    });
    desc.setCollisionGroups(COLLISION_GROUPS.static).setFriction(0.8);
    this.colliderDescs.push(desc);
    return desc;
  }
  boxCol(pos, hx, hy, hz, rot) {
    return this.push(this.ctx.RAPIER.ColliderDesc.cuboid(hx, hy, hz), pos, rot);
  }
  cylCol(pos, halfHeight, radius, rot) {
    return this.push(this.ctx.RAPIER.ColliderDesc.cylinder(halfHeight, radius), pos, rot);
  }
  ballCol(pos, radius) {
    return this.push(this.ctx.RAPIER.ColliderDesc.ball(radius), pos);
  }
  hullCol(geometry) {
    const position = geometry.attributes.position;
    const step = Math.max(1, Math.floor(position.count / 120));
    const points = [];
    for (let i = 0; i < position.count; i += step) points.push(position.getX(i), position.getY(i), position.getZ(i));
    const desc = this.ctx.RAPIER.ColliderDesc.convexHull(new Float32Array(points));
    if (desc) {
      desc.setCollisionGroups(COLLISION_GROUPS.static).setFriction(0.8);
      this.colliderDescs.push(desc);
      return desc;
    } else {
      return null;
    }
  }
  build(mats, container = this.ctx.scene) {
    for (const kind of ['stone', 'prop', 'glyph']) {
      const geos = this.parts[kind];
      if (!geos.length) continue;
      if (activeBatch) {
        for (const geo of geos) activeBatch.add(kind, geo, this.castShadow);
        continue;
      }
      const merged = mergeGeometries(geos);
      for (const geo of geos) geo.dispose();
      const mesh = new Mesh(merged, mats[kind]);
      mesh.name = `${this.group.name}-${kind}`;
      mesh.castShadow = this.castShadow && kind !== 'glyph';
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      this.group.add(mesh);
    }
    this.parts.stone = [];
    this.parts.prop = [];
    this.parts.glyph = [];
    container.add(this.group);
    for (const colliderDesc of this.colliderDescs)
      try {
        const collider = this.ctx.physics.createCollider(colliderDesc);
        this.colliders.push(collider);
        this.ctx.colliders.register(collider, {
          kind: 'structure',
          surface: 'stone',
          object: this.group,
          data: {
            site: this.name,
          },
        });
      } catch (err) {
        console.warn('[content] collider failed', err);
      }
    this.colliderDescs.length = 0;
    return this.group;
  }
}
export class SiteBatch {
  cellSize;
  cells = new Map();
  meshes = [];
  constructor(cellSize = 72) {
    this.cellSize = cellSize;
  }
  add(kind, geometry, castShadow) {
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const center = geometry.boundingSphere.center;
    const key =
      kind === 'stone' ? `${Math.floor(center.x / this.cellSize)},${Math.floor(center.z / this.cellSize)}` : 'all';
    let cell = this.cells.get(key);
    if (!cell)
      this.cells.set(
        key,
        (cell = {
          parts: {
            stone: [],
            prop: [],
            glyph: [],
          },
          shadow: castShadow,
        }),
      );
    cell.parts[kind].push(geometry);
  }
  flush(mats, container) {
    for (const [key, cell] of this.cells)
      for (const kind of ['stone', 'prop', 'glyph']) {
        const geos = cell.parts[kind];
        if (!geos.length) continue;
        const merged = mergeGeometries(geos);
        for (const geo of geos) geo.dispose();
        const mesh = new Mesh(merged, mats[kind]);
        mesh.name = `content-batch-${key}-${kind}`;
        mesh.castShadow = kind !== 'glyph';
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        container.add(mesh);
        this.meshes.push(mesh);
      }
    this.cells.clear();
  }
}
let activeBatch = null;
const pendingClearings = [];
export function addClearing(x, z, radius) {
  if (Number.isFinite(x) && Number.isFinite(z) && radius > 0)
    pendingClearings.push({
      x,
      z,
      r: radius,
    });
}
export function applyClearings(ctx) {
  const sorted = pendingClearings.splice(0).sort((a, b) => b.r - a.r);
  const kept = [];
  for (const clearing of sorted)
    if (!kept.some((other) => Math.hypot(other.x - clearing.x, other.z - clearing.z) + clearing.r <= other.r + 0.3))
      kept.push(clearing);
  const vegetation = ctx.vegetation;
  if (typeof vegetation?.clearGrass == 'function') {
    const pos = new Vector3();
    for (const clearing of kept)
      try {
        vegetation.clearGrass(pos.set(clearing.x, 0, clearing.z), clearing.r);
      } catch (err) {
        console.warn('[content] clearGrass failed', err);
        break;
      }
  }
  return kept;
}
export function setActiveBatch(batch) {
  activeBatch = batch;
}
