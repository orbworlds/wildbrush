/**
 * Cliff vines: leafy strands, with the odd flower, hung down the cliff faces around a point and swaying in the wind.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { colorize, fillAttribute, mergeGeometries, randRange, rng, taperedTube, TAU } from '../shared/util.js';
const VINE_SWAY_VERTEX = `
{
  // gentle sway, stronger towards the free end of each strand
  float sw = aSway;
  transformed.x += sin(uTime * 0.9 + position.y * 0.35 + position.z * 0.2) * 0.12 * sw;
  transformed.z += cos(uTime * 0.7 + position.y * 0.3 + position.x * 0.2) * 0.12 * sw;
}
`;
export function buildVines(ctx, cx, cz, minDist, maxDist, count, key) {
  const rand = rng(key);
  const terrain = ctx.terrain;
  const baseY = terrain.heightAt(cx, cz);
  const parts = [];
  const leafDark = new Color(0x2f6a2a);
  const leafLight = new Color(0x6fb048);
  const stemColor = new Color(0x3d5a26);
  const flowerColors = [new Color(0xff7a5a), new Color(0xffc3d8), new Color(0xfff0a0)];
  let placed = 0;
  for (let i = 0; i < count * 3 && placed < count; i++) {
    const angle = rand() * TAU;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    let cliff = -1;
    for (let d = minDist; d < maxDist; d += 0.5)
      if (terrain.heightAt(cx + dx * d, cz + dz * d) > baseY + 5) {
        cliff = d;
        break;
      }
    if (cliff < 0) continue;
    let topDist = cliff;
    let topY = terrain.heightAt(cx + dx * cliff, cz + dz * cliff);
    for (let d = cliff; d < cliff + 12; d += 0.4) {
      const y = terrain.heightAt(cx + dx * d, cz + dz * d);
      if (y > topY + 0.05) {
        topY = y;
        topDist = d;
      } else if (y < topY - 0.8) break;
    }
    const len = Math.min(topY - baseY - 0.8, randRange(rand, 4, 11));
    if (len < 2.5) continue;
    placed++;
    const points = [];
    const segs = Math.max(4, Math.round(len / 1.2));
    const drift = randRange(rand, -0.4, 0.4);
    for (let j = 0; j <= segs; j++) {
      const y = topY + 0.2 - (len * j) / segs;
      let dist = topDist;
      for (let probe = topDist; probe > minDist * 0.5; probe -= 0.25)
        if (terrain.heightAt(cx + dx * probe, cz + dz * probe) < y) {
          dist = probe;
          break;
        }
      const inset = 0.25 + (j / segs) * 0.35;
      const px = cx + dx * (dist - inset) - dz * drift * (j / segs);
      const pz = cz + dz * (dist - inset) + dx * drift * (j / segs);
      points.push(new Vector3(px, y, pz));
    }
    const curve = new CatmullRomCurve3(points);
    const stem = taperedTube(curve, segs * 3, 4, (t) => 0.06 * (1 - t * 0.6));
    colorize(stem, stemColor);
    const sway = new Float32Array(stem.attributes.position.count);
    {
      const position = stem.attributes.position;
      for (let j = 0; j < position.count; j++) sway[j] = Math.min(1, Math.max(0, (topY - position.getY(j)) / len));
    }
    stem.setAttribute('aSway', new BufferAttribute(sway, 1));
    parts.push(stem);
    const point = new Vector3();
    const leafCount = Math.round(len * 9);
    for (let j = 0; j < leafCount; j++) {
      const u = rand();
      curve.getPointAt(u, point);
      const size = randRange(rand, 0.2, 0.38) * (1 - u * 0.3);
      const flower = rand() < 0.08;
      const leaf = new BufferGeometry();
      if (flower) {
        const verts = [];
        for (let k = 0; k < 5; k++) {
          const a0 = (k / 5) * TAU;
          const a1 = a0 + 0.5;
          verts.push(
            0,
            0,
            0,
            Math.cos(a0) * size,
            Math.sin(a0) * size,
            0.03,
            Math.cos(a1) * size,
            Math.sin(a1) * size,
            0.03,
          );
        }
        leaf.setAttribute('position', new Float32BufferAttribute(verts, 3));
      } else {
        leaf.setAttribute(
          'position',
          new Float32BufferAttribute(
            [0, 0, 0, size * 0.45, -size * 0.4, 0.05, 0, -size, 0.02, -size * 0.45, -size * 0.4, 0.05],
            3,
          ),
        );
        leaf.setIndex([0, 1, 2, 0, 2, 3]);
      }
      leaf.computeVertexNormals();
      const quat = new Quaternion().setFromEuler(
        new Euler(
          randRange(rand, -0.6, 0.6),
          Math.atan2(-dx, -dz) + randRange(rand, -1.2, 1.2),
          randRange(rand, -0.8, 0.8),
        ),
      );
      leaf.applyQuaternion(quat);
      leaf.translate(point.x - dx * 0.05, point.y, point.z - dz * 0.05);
      colorize(
        leaf,
        flower ? flowerColors[Math.floor(rand() * flowerColors.length)] : leafDark.clone().lerp(leafLight, rand()),
      );
      fillAttribute(leaf, 'aSway', 1, Math.min(1, Math.max(0, (topY - point.y) / len)));
      parts.push(leaf);
    }
  }
  if (!parts.length) return null;
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  const globals = ctx.globals;
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals);
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `#include <wb_common>
attribute float aSway;
void main() {`,
      )
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${VINE_SWAY_VERTEX}`);
  };
  material.customProgramCacheKey = () => 'wb-content-vines-v1';
  try {
    ctx.paint.patchMaterial(material, {
      paint: false,
      vitality: true,
    });
  } catch {}
  const mesh = new Mesh(merged, material);
  mesh.name = `content-vines-${key}`;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  ctx.scene.add(mesh);
  return mesh;
}
