/**
 * Paint demo (debug panel button or ?paintdemo=1, wall, nowall or loop): throws blobs of all four inks from the camera onto the ground, a stone test wall and nearby water, then blooms vitality around the target.
 */
import { BoxGeometry, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { COLLISION_GROUPS, COLORS, LANDMARKS } from '../core/config.js';
function parseVec3(str) {
  if (!str) return null;
  const [x, y, z] = str.split(',').map(Number);
  return [x, y, z].every(Number.isFinite) ? new Vector3(x, y, z) : null;
}
function groundPointAt(ctx, x, z) {
  try {
    const ray = new ctx.RAPIER.Ray(
      {
        x: x + 0.00013,
        y: 150,
        z: z + 0.00009,
      },
      {
        x: 0.00001,
        y: -1,
        z: 0.00001,
      },
    );
    const hit = ctx.physics.castRay(ray, 300, true, 8, COLLISION_GROUPS.worldQuery);
    if (hit) return new Vector3(x, 150 - hit.timeOfImpact, z);
  } catch {}
  try {
    return new Vector3(x, ctx.terrain.heightAt(x, z), z);
  } catch {
    return null;
  }
}
let demoWall = null;
function ensureDemoWall(ctx, paint, ground, facing) {
  if (demoWall) return demoWall;
  const depth = 1.2;
  const geometry = new BoxGeometry(8, 6, depth, 16, 12, 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const bump = Math.sin(x * 1.7 + y * 2.3) * 0.04 + Math.sin(x * 4.1 - y * 3.3) * 0.02;
    position.setZ(i, z + Math.sign(z) * bump);
  }
  geometry.computeVertexNormals();
  const material = new MeshStandardMaterial({
    color: 0xa39a8c,
    roughness: 0.9,
  });
  paint.patchMaterial(material);
  const mesh = new Mesh(geometry, material);
  const angle = Math.atan2(facing.x, facing.z);
  mesh.position.copy(ground).add(new Vector3(0, 2.6, 0));
  mesh.rotation.y = angle;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.name = 'paint-demo-wall';
  ctx.scene.add(mesh);
  const quaternion = mesh.quaternion;
  const collider = ctx.physics.createCollider(
    ctx.RAPIER.ColliderDesc.cuboid(4, 3, depth / 2)
      .setTranslation(mesh.position.x, mesh.position.y, mesh.position.z)
      .setRotation({
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
      })
      .setCollisionGroups(COLLISION_GROUPS.static),
  );
  ctx.colliders.register(collider, {
    kind: 'structure',
    surface: 'stone',
    object: mesh,
  });
  demoWall = mesh;
  return mesh;
}
export function runPaintDemo(ctx, paint, mode = '1') {
  try {
    const eye =
      parseVec3(ctx.params.get('paintfrom')) ?? parseVec3(ctx.params.get('cam')) ?? ctx.camera.position.clone();
    const aim =
      parseVec3(ctx.params.get('paintat')) ??
      parseVec3(ctx.params.get('look')) ??
      new Vector3(LANDMARKS.spawn.x, 6, LANDMARKS.spawn.z);
    const fwd = new Vector3(aim.x - eye.x, 0, aim.z - eye.z);
    if (fwd.lengthSq() < 0.0001) fwd.set(0, 0, -1);
    fwd.normalize();
    const side = new Vector3(-fwd.z, 0, fwd.x);
    const throwFrom = eye
      .clone()
      .addScaledVector(fwd, 3)
      .add(new Vector3(0, -2.5, 0));
    const vel = new Vector3();
    const throwAt = (target, color, delay, from = throwFrom) => {
      setTimeout(() => {
        paint.addInk(color, 4);
        paint.launchVelocity(from, target, vel);
        paint.throwBlob(from, vel, color);
      }, delay);
    };
    if (mode === 'loop') {
      let shot = 0;
      const tick = () => {
        const color = COLORS[shot++ % 4];
        const target = groundPointAt(ctx, aim.x + (Math.random() - 0.5) * 14, aim.z + (Math.random() - 0.5) * 10);
        if (target) throwAt(target, color, 0);
        setTimeout(tick, 380);
      };
      tick();
      return;
    }
    const wallOnly = mode === 'wall';
    if (!wallOnly)
      ['red', 'blue', 'yellow', 'green'].forEach((color, i) => {
        const offset = (i - 1.5) * 4.6;
        const spot = groundPointAt(ctx, aim.x + side.x * offset, aim.z + side.z * offset);
        if (spot) {
          throwAt(spot, color, i * 90);
          const ahead = groundPointAt(ctx, spot.x + fwd.x * 1.6 + side.x * 0.8, spot.z + fwd.z * 1.6 + side.z * 0.8);
          if (ahead) throwAt(ahead, color, 400 + i * 70);
        }
      });
    const wallBase = groundPointAt(ctx, aim.x + fwd.x * 9 + side.x * 2, aim.z + fwd.z * 9 + side.z * 2);
    if (wallBase && mode !== 'nowall') {
      const wallFace = ensureDemoWall(ctx, paint, wallBase, fwd.clone().negate())
        .position.clone()
        .addScaledVector(fwd, -0.6);
      (wallOnly
        ? [
            [-2.8, 1.4, 'green'],
            [-0.9, 1.2, 'red'],
            [1, 1.5, 'blue'],
            [2.9, 1.3, 'yellow'],
          ]
        : [
            [-2.6, 1.2, 'green'],
            [-2.4, -0.6, 'green'],
            [-1.2, 0.4, 'green'],
            [-3.2, 0.2, 'green'],
            [0.4, 1.4, 'red'],
            [2.2, 1.6, 'blue'],
            [1.4, -0.3, 'yellow'],
            [3.2, 0.1, 'yellow'],
          ]
      ).forEach(([dx, dy, color], i) => {
        const target = wallFace
          .clone()
          .addScaledVector(side, dx)
          .add(new Vector3(0, dy, 0));
        throwAt(
          target,
          color,
          150 + i * 60,
          eye
            .clone()
            .addScaledVector(fwd, 2)
            .add(new Vector3(0, -3, 0)),
        );
      });
    }
    if (wallOnly) return;
    let waterSpot = null;
    for (let dist = 8; dist < 90 && !waterSpot; dist += 6)
      for (let j = 0; j < 16; j++) {
        const angle = (j / 16) * Math.PI * 2;
        const x = aim.x + Math.cos(angle) * dist;
        const z = aim.z + Math.sin(angle) * dist;
        let depth = 0;
        try {
          depth = ctx.water.depthAt(x, z);
        } catch {
          depth = 0;
        }
        if (depth > 0.8) {
          waterSpot = new Vector3(x, ctx.water.level ?? 0, z);
          break;
        }
      }
    if (waterSpot) {
      throwAt(waterSpot, 'blue', 200);
      throwAt(waterSpot.clone().add(new Vector3(2.5, 0, 1)), 'red', 320);
    }
    setTimeout(() => paint.bloomVitality(aim, 45, 3.2), 150);
  } catch (err) {
    console.warn('[paint] demo failed', err);
  }
}
