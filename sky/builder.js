/**
 * Collects the stone, glass and rock pieces of the sky's structures with their collider descriptions, then merges each kind into one static mesh and registers the colliders.
 */
import { Matrix4, Mesh, Quaternion, Vector3 } from 'three';
import { COLLISION_GROUPS } from '../core/config.js';
import { colorize, fillAttribute, mergeGeometries } from '../shared/util.js';
const _matrix = new Matrix4();
const _rotation = new Quaternion();
const _scale = new Vector3();
const _yAxis = new Vector3(0, 1, 0);
export function toQuat(rot, target = new Quaternion()) {
  return rot === undefined
    ? target.identity()
    : typeof rot == 'number'
      ? target.setFromAxisAngle(_yAxis, rot)
      : rot.isQuaternion
        ? target.copy(rot)
        : target.setFromEuler(rot);
}
function prepForMerge(geometry) {
  for (const key of Object.keys(geometry.attributes))
    if (key !== 'position' && key !== 'normal' && key !== 'color' && !key.startsWith('a'))
      geometry.deleteAttribute(key);
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  return geometry;
}
export class SkyBuilder {
  ctx;
  stoneParts = [];
  glassParts = [];
  rockParts = [];
  colliderDescs = [];
  constructor(ctx) {
    this.ctx = ctx;
  }
  xf(geometry, position, rotation, scale) {
    toQuat(rotation, _rotation);
    if (scale === undefined) _scale.set(1, 1, 1);
    else if (typeof scale == 'number') _scale.setScalar(scale);
    else _scale.copy(scale);
    _matrix.compose(position, _rotation, _scale);
    geometry.applyMatrix4(_matrix);
    return prepForMerge(geometry);
  }
  stone(geometry, position, rotation, color = 14471350, scale) {
    this.xf(geometry, position, rotation, scale);
    if (!geometry.attributes.color) colorize(geometry, color);
    this.stoneParts.push(geometry);
    return geometry;
  }
  glass(geometry, position, rotation, color, glow = 1, sway, scale) {
    this.xf(geometry, position, rotation, scale);
    if (!geometry.attributes.color) colorize(geometry, color);
    fillAttribute(geometry, 'aGlow', 1, glow);
    fillAttribute(geometry, 'aSway', 4, sway ? [sway.pivot.x, sway.pivot.y, sway.pivot.z, sway.amount] : [0, 0, 0, 0]);
    this.glassParts.push(geometry);
    return geometry;
  }
  rock(geometry, position, rotation, scale, splat = [1, 0, 0, 0], floatPhase = 0) {
    this.xf(geometry, position, rotation, scale);
    fillAttribute(geometry, 'aSky', 4, splat);
    fillAttribute(geometry, 'aFloat', 1, floatPhase);
    this.rockParts.push(geometry);
    return geometry;
  }
  push(desc, info, position, rotation) {
    if (position) {
      toQuat(rotation, _rotation);
      desc.setTranslation(position.x, position.y, position.z).setRotation({
        x: _rotation.x,
        y: _rotation.y,
        z: _rotation.z,
        w: _rotation.w,
      });
    }
    desc.setCollisionGroups(COLLISION_GROUPS.static).setFriction(0.8);
    this.colliderDescs.push({
      desc,
      info,
    });
    return desc;
  }
  box(
    position,
    hx,
    hy,
    hz,
    rotation,
    info = {
      kind: 'structure',
      surface: 'stone',
    },
  ) {
    return this.push(this.ctx.RAPIER.ColliderDesc.cuboid(hx, hy, hz), info, position, rotation);
  }
  cyl(
    position,
    halfHeight,
    radius,
    rotation,
    info = {
      kind: 'structure',
      surface: 'stone',
    },
  ) {
    return this.push(this.ctx.RAPIER.ColliderDesc.cylinder(halfHeight, radius), info, position, rotation);
  }
  ball(
    position,
    radius,
    info = {
      kind: 'rock',
      surface: 'rock',
    },
  ) {
    return this.push(this.ctx.RAPIER.ColliderDesc.ball(radius), info, position);
  }
  hull(
    geometry,
    info = {
      kind: 'rock',
      surface: 'rock',
    },
    maxPoints = 90,
  ) {
    const position = geometry.attributes.position;
    const step = Math.max(1, Math.floor(position.count / maxPoints));
    const points = [];
    for (let i = 0; i < position.count; i += step) points.push(position.getX(i), position.getY(i), position.getZ(i));
    const desc = this.ctx.RAPIER.ColliderDesc.convexHull(new Float32Array(points));
    return desc ? this.push(desc, info) : null;
  }
  build(mats, group) {
    const merge = (parts, material, meshName, castShadow) => {
      if (!parts.length) return null;
      const geometry = mergeGeometries(parts);
      for (const part of parts) part.dispose();
      parts.length = 0;
      const mesh = new Mesh(geometry, material);
      mesh.name = meshName;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      return mesh;
    };
    const stone = merge(this.stoneParts, mats.stone, 'sky-stone', true);
    const glass = merge(this.glassParts, mats.glass, 'sky-glass', true);
    const rock = merge(this.rockParts, mats.isle, 'sky-rock', true);
    const colliders = [];
    for (const { desc, info } of this.colliderDescs)
      try {
        const collider = this.ctx.physics.createCollider(desc);
        this.ctx.colliders.register(collider, {
          ...info,
          object: group,
          data: {
            sky: true,
          },
        });
        colliders.push(collider);
      } catch (err) {
        console.warn('[sky] collider failed', err);
      }
    this.colliderDescs.length = 0;
    return {
      stone,
      glass,
      rock,
      colliders,
    };
  }
}
