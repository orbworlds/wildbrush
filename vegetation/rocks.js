/**
 * Rocks and pebbles: noisy faceted rock meshes with moss and sand shading, scattered over the island; the bigger ones get convex-hull colliders.
 */
import {
  Color,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { COLLISION_GROUPS } from '../core/config.js';
import { fbm, makeNoise2D, makeNoise3D, makeRng, smoothstep } from '../core/math.js';
import { makeRng as makeRng2, toColor } from '../shared/veg-material.js';
import { InstanceBatcher } from './batcher.js';
function buildRock(seed, detail, scale) {
  const rng = makeRng2(makeRng(seed));
  const noise = makeNoise3D(seed);
  let geometry = new IcosahedronGeometry(1, detail);
  geometry.deleteAttribute('normal');
  geometry.deleteAttribute('uv');
  geometry = mergeVertices(geometry);
  const position = geometry.attributes.position;
  const planes = [];
  const planeCount = 8 + Math.floor(rng.next() * 5);
  for (let i = 0; i < planeCount; i++) {
    const normal = new Vector3(rng.range(-1, 1), rng.range(-0.3, 1), rng.range(-1, 1)).normalize();
    planes.push({
      n: normal,
      d: rng.range(0.5, 0.8),
    });
  }
  planes.push({
    n: new Vector3(0, -1, 0),
    d: 0.45,
  });
  const p2 = new Vector3();
  const colors = [];
  const baseColor = toColor('#a89e91');
  const warmColor = toColor('#b8a893');
  const coolColor = toColor('#948f93');
  const color = new Color();
  for (let i = 0; i < position.count; i++) {
    p2.fromBufferAttribute(position, i);
    for (const plane of planes) {
      const over = p2.dot(plane.n) - plane.d;
      if (over > 0) p2.addScaledVector(plane.n, -over);
    }
    const bump = noise(p2.x * 1.6, p2.y * 1.6, p2.z * 1.6) * 0.05 + noise(p2.x * 5, p2.y * 5, p2.z * 5) * 0.012;
    p2.multiplyScalar(1 + bump);
    p2.multiply(scale);
    position.setXYZ(i, p2.x, p2.y, p2.z);
    const tone = noise(p2.x * 0.9 + 10, p2.y * 0.9, p2.z * 0.9);
    color.copy(baseColor).lerp(tone > 0 ? warmColor : coolColor, Math.abs(tone) * 0.9);
    const band = Math.sin(p2.y * 7 + noise(p2.x, p2.y * 0.3, p2.z) * 2) * 0.5 + 0.5;
    color.multiplyScalar(0.9 + band * 0.12);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const hull = [];
  const stride = Math.max(1, Math.floor(position.count / 90));
  for (let i = 0; i < position.count; i += stride) hull.push(position.getX(i), position.getY(i), position.getZ(i));
  return {
    geo: geometry,
    hull: new Float32Array(hull),
  };
}
const ROCK_PARS_GLSL = `
varying vec3 vRockWorld;
varying vec3 vRockWN;
`;
const ROCK_VERTEX = `
{
  vec4 rw = vec4(transformed, 1.0);
  vec3 rn = objectNormal;
  #ifdef USE_BATCHING
    rw = batchingMatrix * rw;
    rn = mat3(batchingMatrix) * rn;
  #endif
  #ifdef USE_INSTANCING
    rw = instanceMatrix * rw;
    rn = mat3(instanceMatrix) * rn;
  #endif
  vRockWorld = (modelMatrix * rw).xyz;
  vRockWN = normalize(mat3(modelMatrix) * rn);
}
`;
const ROCK_COLOR_FRAGMENT = `
{
  vec3 wn = normalize(vRockWN);
  float n1 = wbNoise2(vRockWorld.xz * 1.3 + vRockWorld.y * 0.7);
  float n2 = wbNoise2(vRockWorld.xz * 5.0 - vRockWorld.y * 2.0);
  float n3 = wbNoise2(vRockWorld.xz * 11.0 + vRockWorld.y * 6.0);
  // painterly vertical streaks + speckle
  float streak = wbNoise2(vec2(dot(vRockWorld.xz, vec2(0.7, 0.7)) * 3.0, vRockWorld.y * 0.6));
  diffuseColor.rgb *= 0.86 + 0.18 * n2 + 0.1 * (streak - 0.5);
  diffuseColor.rgb *= 0.95 + 0.1 * step(0.72, n3);
  // moss on top faces, broken edge, two-tone
  float mossField = wn.y + (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.25 + (n3 - 0.5) * 0.12;
  float moss = smoothstep(0.52, 0.6, mossField) * uRockMoss;
  vec3 mossC = mix(uMossA, uMossB, smoothstep(0.3, 0.8, n2 * 0.6 + wn.y * 0.4));
  mossC *= 0.85 + 0.25 * n3;
  diffuseColor.rgb = mix(diffuseColor.rgb, mossC, moss);
  // sand dusting near the waterline / ground contact
  float groundH = texture(uVegField, (vRockWorld.xz - uVegFieldXf.x) * uVegFieldXf.y + uVegFieldXf.z).r;
  diffuseColor.rgb *= mix(0.72, 1.0, smoothstep(0.0, 0.35, vRockWorld.y - groundH));
}
`;
const ROCK_LIGHTS_FRAGMENT = `
reflectedLight.indirectDiffuse *= vec3(1.0, 0.95, 1.07);
`;
export function createRocks(veg, rules) {
  const { ctx, field } = veg;
  const group = new Group();
  group.name = 'vegetation-rocks';
  const rocks = [];
  [
    new Vector3(1.1, 0.8, 1),
    new Vector3(1, 1.05, 0.9),
    new Vector3(1.4, 0.7, 1),
    new Vector3(0.9, 1.2, 0.85),
    new Vector3(1.2, 0.6, 1.2),
    new Vector3(1, 0.9, 1),
  ].forEach((scale, i) => rocks.push(buildRock(`rock-${i}`, 2, scale)));
  const pebbles = [0, 1, 2].map((i) => buildRock(`pebble-${i}`, 1, new Vector3(1.2, 0.6, 1)));
  const mossA = {
    value: toColor('#4f7a2c'),
  };
  const mossB = {
    value: toColor('#8fb04a'),
  };
  const createRockMaterial = (moss) => {
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0,
    });
    const rockMoss = {
      value: moss,
    };
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, ctx.globals, {
        uMossA: mossA,
        uMossB: mossB,
        uRockMoss: rockMoss,
        uVegField: veg.uniforms.uVegField,
        uVegFieldXf: veg.uniforms.uVegFieldXf,
      });
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${ROCK_PARS_GLSL}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${ROCK_VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\n#include <wb_common>\n${ROCK_PARS_GLSL}\nuniform vec3 uMossA;\nuniform vec3 uMossB;\nuniform float uRockMoss;\nuniform sampler2D uVegField;\nuniform vec4 uVegFieldXf;\n`,
        )
        .replace('#include <color_fragment>', `#include <color_fragment>\n${ROCK_COLOR_FRAGMENT}`)
        .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${ROCK_LIGHTS_FRAGMENT}`);
    };
    material.customProgramCacheKey = () => 'wb-veg-rock';
    try {
      ctx.paint.patchMaterial(material);
    } catch (err) {
      console.warn('[vegetation] paint.patchMaterial(rock) failed', err);
    }
    return material;
  };
  const rockMat = createRockMaterial(1);
  const pebbleMat = createRockMaterial(0.25);
  const rng = makeRng2(makeRng('veg-rocks-v1'));
  const noise = makeNoise2D('veg-rock-fields');
  const rockSpots = [];
  const pebbleSpots = [];
  const up = new Vector3(0, 1, 0);
  const quat = new Quaternion();
  const normal = new Vector3();
  const place = (list, x, z, size, sink, collide) => {
    const ground = Math.min(
      field.heightAt(x, z),
      field.heightAt(x + size * 0.6, z),
      field.heightAt(x - size * 0.6, z),
      field.heightAt(x, z + size * 0.6),
      field.heightAt(x, z - size * 0.6),
    );
    const scale = new Vector3(size * rng.range(0.85, 1.2), size * rng.range(0.75, 1.15), size * rng.range(0.85, 1.2));
    try {
      ctx.terrain.normalAt(x, z, normal);
    } catch {
      normal.set(0, 1, 0);
    }
    const rot = new Quaternion().setFromUnitVectors(up, normal.lerp(up, 0.4).normalize());
    rot.multiply(quat.setFromAxisAngle(up, rng.range(0, Math.PI * 2)));
    rot.multiply(quat.setFromAxisAngle(new Vector3(1, 0, 0), rng.range(-0.2, 0.2)));
    list.push({
      x,
      y: ground - scale.y * sink,
      z,
      s: scale,
      q: rot,
      v: Math.floor(rng.next() * (list === pebbleSpots ? pebbles.length : rocks.length)),
      collide,
    });
  };
  for (let i = 0; i < 26000; i++) {
    const x = rng.range(-155, 155);
    const z = rng.range(-155, 155);
    const h = field.heightAt(x, z);
    if (h < -0.3 || rules.clearDist(x, z) < 1) continue;
    const slope = field.slopeAt(x, z);
    if (slope > 0.5) continue;
    const surf = rules.surface(x, z);
    if (surf === 'path') continue;
    let prob = 0.004;
    if (surf === 'rock') prob += 0.06;
    prob += smoothstep(0.2, 0.5, slope) * 0.05;
    prob += smoothstep(25, 55, h) * 0.02;
    prob += smoothstep(0.45, 0.7, fbm(noise, x * 0.03, z * 0.03, 3)) * 0.05;
    if (surf === 'sand') prob *= 0.3;
    prob *= 1 - rules.dryMeadow(x, z) * 0.6;
    if (rng.next() > prob || rules.nearPath(x, z, 2)) continue;
    const big = rng.next() < 0.3;
    const size = big ? rng.range(1.4, 3.2) : rng.range(0.5, 1.3);
    place(rockSpots, x, z, size, big ? 0.28 : 0.3, size > 0.55);
    if (big) {
      const satellites = 2 + Math.floor(rng.next() * 4);
      for (let j = 0; j < satellites; j++) {
        const ang = rng.range(0, Math.PI * 2);
        const dist = size * rng.range(1, 1.8);
        const px = x + Math.cos(ang) * dist;
        const pz = z + Math.sin(ang) * dist;
        if (rules.clearDist(px, pz) < 1 || rules.surface(px, pz) === 'path') continue;
        const childSize = size * rng.range(0.2, 0.45);
        if (childSize < 0.45) place(pebbleSpots, px, pz, childSize, 0.25, false);
        else place(rockSpots, px, pz, childSize, 0.3, childSize > 0.55);
      }
    }
    if (rockSpots.length > 520) break;
  }
  for (let i = 0; i < 60000 && pebbleSpots.length < 1500; i++) {
    const x = rng.range(-155, 155);
    const z = rng.range(-155, 155);
    const h = field.heightAt(x, z);
    if (h < -0.4 || h > 2.4) continue;
    const surf = rules.surface(x, z);
    const lakeShore = Math.abs(rules.distTo('lake', x, z) - 40) < 12;
    const prob = surf === 'sand' ? 0.06 : lakeShore ? 0.05 : 0.004;
    if (!(rng.next() > prob || rules.clearDist(x, z) < 0 || rules.surface(x, z) === 'path'))
      place(pebbleSpots, x, z, rng.range(0.08, 0.32), 0.3, false);
  }
  const pos = new Vector3();
  const batcher = new InstanceBatcher(ctx.renderer);
  const addRocks = (spots, variants, material, castShadow, label) => {
    variants.forEach((variant, i) => {
      const placed = spots.filter((spot) => spot.v === i);
      if (!placed.length) return;
      const matrices = [];
      placed.forEach((spot, i) => {
        matrices.push(new Matrix4().compose(pos.set(spot.x, spot.y, spot.z), spot.q, spot.s));
        if (spot.collide)
          try {
            const points = new Float32Array(variant.hull.length);
            for (let i = 0; i < points.length; i += 3) {
              points[i] = variant.hull[i] * spot.s.x;
              points[i + 1] = variant.hull[i + 1] * spot.s.y;
              points[i + 2] = variant.hull[i + 2] * spot.s.z;
            }
            const desc = ctx.RAPIER.ColliderDesc.convexHull(points);
            if (desc) {
              desc.setTranslation(spot.x, spot.y, spot.z).setRotation({
                x: spot.q.x,
                y: spot.q.y,
                z: spot.q.z,
                w: spot.q.w,
              });
              desc.setCollisionGroups(COLLISION_GROUPS.static).setFriction(0.9);
              const collider = ctx.physics.createCollider(desc);
              ctx.colliders.register(collider, {
                kind: 'rock',
                surface: 'rock',
                object: group,
              });
            }
          } catch (err) {
            if (i === 0) console.warn('[vegetation] rock collider failed', err);
          }
      });
      batcher.add(label, variant.geo, material, null, castShadow, matrices);
    });
  };
  addRocks(rockSpots, rocks, rockMat, true, 'rock');
  addRocks(pebbleSpots, pebbles, pebbleMat, false, 'pebble');
  batcher.build(group);
  return {
    group,
    count: rockSpots.length + pebbleSpots.length,
    sample: rockSpots
      .filter((spot) => spot.s.x > 1.6)
      .slice(0, 8)
      .map((spot) => [Math.round(spot.x), Math.round(spot.y), Math.round(spot.z)]),
    dispose() {
      for (const variant of [...rocks, ...pebbles]) variant.geo.dispose();
      rockMat.dispose();
      pebbleMat.dispose();
    },
  };
}
