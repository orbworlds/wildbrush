/**
 * The terrain system: generates the island, builds the chunked terrain mesh, the Rapier heightfield and the height texture, and answers height, normal, surface and grass-density queries and landmark positions.
 */
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  ClampToEdgeWrapping,
  DataTexture,
  FloatType,
  Group,
  LinearFilter,
  Mesh,
  RedFormat,
  Sphere,
  Vector3,
} from 'three';
import { COLLISION_GROUPS, LANDMARKS } from '../core/config.js';
import { generateHeightmap, HEIGHTS, TERRAIN_RES } from './heightmap.js';
import { createTerrainMaterial } from './material.js';
import { createDistantScenery } from './scenery.js';
import { computeSurface, SURFACES } from './surface.js';
const GRID = TERRAIN_RES;
const HALF_SIZE = 160;
const CHUNKS = 4;
const CHUNK_CELLS = (GRID - 1) / CHUNKS;
export async function create(ctx) {
  const now = performance.now();
  const maps = generateHeightmap();
  const heights = maps.heights;
  const surf = computeSurface(maps);
  const heightAt = (x, z) => {
    let gx = x + HALF_SIZE;
    let gz = z + HALF_SIZE;
    if (gx >= 0) {
      if (gx > GRID - 1) gx = GRID - 1;
    } else gx = 0;
    if (gz >= 0) {
      if (gz > GRID - 1) gz = GRID - 1;
    } else gz = 0;
    let x0 = Math.floor(gx);
    let z0 = Math.floor(gz);
    if (x0 > GRID - 2) x0 = GRID - 2;
    if (z0 > GRID - 2) z0 = GRID - 2;
    const fx = gx - x0;
    const fz = gz - z0;
    const idx = z0 * GRID + x0;
    const h00 = heights[idx];
    const h10 = heights[idx + 1];
    const h01 = heights[idx + GRID];
    if (fx + fz <= 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    const h11 = heights[idx + GRID + 1];
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  };
  const normalAt = (x, z, target = new Vector3()) => {
    const eps = 0.5;
    return target
      .set(heightAt(x - eps, z) - heightAt(x + eps, z), 2 * eps, heightAt(x, z - eps) - heightAt(x, z + eps))
      .normalize();
  };
  const cellIndex = (x, z) => {
    let gx = Math.round(x + HALF_SIZE);
    let gz = Math.round(z + HALF_SIZE);
    if (gx >= 0) {
      if (gx > GRID - 1) gx = GRID - 1;
    } else gx = 0;
    if (gz >= 0) {
      if (gz > GRID - 1) gz = GRID - 1;
    } else gz = 0;
    return gz * GRID + gx;
  };
  const surfaceAt = (x, z) => SURFACES[surf.surface[cellIndex(x, z)]] ?? 'grass';
  const grass = surf.grass;
  const grassDensityAt = (x, z) => {
    const gx = x + HALF_SIZE;
    const gz = z + HALF_SIZE;
    if (!(gx >= 0 && gz >= 0 && gx <= GRID - 1 && gz <= GRID - 1)) return 0;
    let x0 = Math.floor(gx);
    let z0 = Math.floor(gz);
    if (x0 > GRID - 2) x0 = GRID - 2;
    if (z0 > GRID - 2) z0 = GRID - 2;
    const fx = gx - x0;
    const fz = gz - z0;
    const idx = z0 * GRID + x0;
    return (
      (grass[idx] * (1 - fx) + grass[idx + 1] * fx) * (1 - fz) +
      (grass[idx + GRID] * (1 - fx) + grass[idx + GRID + 1] * fx) * fz
    );
  };
  const material = createTerrainMaterial(ctx);
  try {
    ctx.paint.patchMaterial(material);
  } catch (err) {
    console.warn('[terrain] paint.patchMaterial failed', err);
  }
  const group = new Group();
  group.name = 'terrain';
  const side = CHUNK_CELLS + 1;
  const indices = new Uint16Array(CHUNK_CELLS * CHUNK_CELLS * 6);
  {
    let p = 0;
    for (let i = 0; i < CHUNK_CELLS; i++)
      for (let j = 0; j < CHUNK_CELLS; j++) {
        const a2 = i * side + j;
        const b = a2 + 1;
        const c = a2 + side;
        const d = c + 1;
        indices[p++] = a2;
        indices[p++] = c;
        indices[p++] = b;
        indices[p++] = c;
        indices[p++] = d;
        indices[p++] = b;
      }
  }
  const indexAttr = new BufferAttribute(indices, 1);
  for (let cz = 0; cz < CHUNKS; cz++)
    for (let cx = 0; cx < CHUNKS; cx++) {
      const positions = new Float32Array(side * side * 3);
      const normals = new Float32Array(side * side * 3);
      const splatA = new Uint8Array(side * side * 4);
      const splatB = new Uint8Array(side * side * 4);
      let vi = 0;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let row = 0; row < side; row++) {
        const gz = cz * CHUNK_CELLS + row;
        for (let col = 0; col < side; col++) {
          const gx = cx * CHUNK_CELLS + col;
          const src = gz * GRID + gx;
          const h2 = heights[src];
          positions[vi * 3] = gx - HALF_SIZE;
          positions[vi * 3 + 1] = h2;
          positions[vi * 3 + 2] = gz - HALF_SIZE;
          normals[vi * 3] = surf.normals[src * 3];
          normals[vi * 3 + 1] = surf.normals[src * 3 + 1];
          normals[vi * 3 + 2] = surf.normals[src * 3 + 2];
          for (let c = 0; c < 4; c++) {
            splatA[vi * 4 + c] = surf.splatA[src * 4 + c];
            splatB[vi * 4 + c] = surf.splatB[src * 4 + c];
          }
          if (h2 < minY) minY = h2;
          if (h2 > maxY) maxY = h2;
          vi++;
        }
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new BufferAttribute(normals, 3));
      geometry.setAttribute('aSplatA', new BufferAttribute(splatA, 4, true));
      geometry.setAttribute('aSplatB', new BufferAttribute(splatB, 4, true));
      geometry.setIndex(indexAttr);
      const x0 = cx * CHUNK_CELLS - HALF_SIZE;
      const z0 = cz * CHUNK_CELLS - HALF_SIZE;
      geometry.boundingBox = new Box3(new Vector3(x0, minY, z0), new Vector3(x0 + CHUNK_CELLS, maxY, z0 + CHUNK_CELLS));
      geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(new Sphere());
      const mesh = new Mesh(geometry, material);
      mesh.name = `terrain-${cx}-${cz}`;
      mesh.receiveShadow = true;
      mesh.castShadow = maxY > 2;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
    }
  ctx.scene.add(group);
  try {
    const fieldHeights = new Float32Array(GRID * GRID);
    for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) fieldHeights[i * GRID + j] = heights[j * GRID + i];
    const RAPIER = ctx.RAPIER;
    const flags = RAPIER.HeightFieldFlags?.FIX_INTERNAL_EDGES;
    const desc = RAPIER.ColliderDesc.heightfield(
      GRID - 1,
      GRID - 1,
      fieldHeights,
      {
        x: 320,
        y: 1,
        z: 320,
      },
      flags,
    )
      .setCollisionGroups(COLLISION_GROUPS.terrain)
      .setFriction(0.9);
    const collider = ctx.physics.createCollider(desc);
    ctx.colliders.register(collider, {
      kind: 'terrain',
      surface: 'grass',
      object: group,
    });
  } catch (err) {
    console.error('[terrain] heightfield collider failed', err);
  }
  const heightTex = new DataTexture(heights, GRID, GRID, RedFormat, FloatType);
  heightTex.magFilter = LinearFilter;
  heightTex.minFilter = LinearFilter;
  heightTex.wrapS = heightTex.wrapT = ClampToEdgeWrapping;
  heightTex.generateMipmaps = false;
  heightTex.needsUpdate = true;
  heightTex.name = 'terrain-height';
  ctx.globals.uHeightMap.value = heightTex;
  ctx.globals.uHeightBounds.value.set(-HALF_SIZE - 0.5, -HALF_SIZE - 0.5, GRID, GRID);
  const highestNear = (x, z, radius) => {
    let best = new Vector3(x, heightAt(x, z), z);
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const h = heightAt(x + dx, z + dz);
        if (h > best.y) best = new Vector3(x + dx, h, z + dz);
      }
    return best;
  };
  const landmarks = {};
  for (const [key, mark] of Object.entries(LANDMARKS))
    landmarks[key] = new Vector3(mark.x, heightAt(mark.x, mark.z), mark.z);
  landmarks.summit = highestNear(LANDMARKS.summit.x, LANDMARKS.summit.z, 5);
  landmarks.lakeIslet = highestNear(LANDMARKS.lakeIslet.x, LANDMARKS.lakeIslet.z, 2);
  landmarks.lake.y = 0;
  const scenery = createDistantScenery(ctx);
  ctx.scene.add(scenery.object);
  if (ctx.debug) {
    const folder = ctx.debug.addFolder('Terrain');
    folder.add(group, 'visible').name('terrain visible');
    folder.add(scenery.object, 'visible').name('distant scenery');
    folder.add(material, 'wireframe');
    folder.close();
  }
  console.info(`[terrain] island generated in ${(performance.now() - now).toFixed(0)}ms`, {
    summit: landmarks.summit.y.toFixed(1),
    mesa: landmarks.mesa.y.toFixed(1),
    islet: landmarks.lakeIslet.y.toFixed(1),
    tower: landmarks.tower.y.toFixed(1),
    ledge: HEIGHTS.MESA_LEDGE,
  });
  return {
    size: 320,
    heightAt,
    normalAt,
    surfaceAt,
    grassDensityAt,
    landmarks,
    object: group,
    update() {
      scenery.update();
    },
    dispose() {
      ctx.scene.remove(group, scenery.object);
      group.traverse((obj) => obj.geometry?.dispose());
      material.dispose();
      heightTex.dispose();
    },
  };
}
