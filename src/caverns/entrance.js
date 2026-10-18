/**
 * The cave mouth on the island: a carved rock outcrop with a tunnel, glowing fungus, a dark doorway, a hint stone and colliders, and checks for the hero standing near or inside it.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  Group,
  Matrix4,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import { COLLISION_GROUPS } from '../core/config.js';
import { makeNoise3D } from '../core/math.js';
import { taperedTube } from '../shared/util.js';
import { boulderGeometry, caveRng } from './deco.js';
import { addMushroom, FungusBuilder, HUES } from './fungus.js';
import { MOUTH, MOUTH_HINT } from './layout.js';
import { makeGlowCardMaterial } from './materials.js';
import { addHintStone, mergeGeometries, StoneBuilder } from './props.js';
import { sdEllipsoid, SdfGrid, smax, smin, surfaceNets } from './sdf-grid.js';
const mouthNoise = makeNoise3D('glowcap-mouth');
export function buildEntrance(ctx, rockMat, fungusMat, stoneMat, flora, bake) {
  const group = new Group();
  group.name = 'glowcap-entrance';
  const terrain = ctx.terrain;
  const heightAt = (x, z) => {
    try {
      const h = terrain.heightAt(x, z);
      return Number.isFinite(h) ? h : 0;
    } catch {
      return 0;
    }
  };
  const mx = MOUTH.x;
  const mz = MOUTH.z;
  const my = heightAt(mx, mz);
  const lumps = [
    [mx + 5.2, 1.2, mz + 0.4, 6.2, 6.6, 7.2],
    [mx + 8.5, 0.5, mz - 4.2, 4.6, 4.4, 4.4],
    [mx + 3.5, 0.2, mz + 5.6, 4, 3.6, 3.6],
    [mx + 1.6, 0.4, mz - 3.9, 2.8, 3.2, 2.6],
    [mx + 9.5, 0.8, mz + 4.2, 4.2, 4.6, 4.2],
  ].map(([x, dy, z, rx, ry, rz]) => [x, heightAt(x, z) + dy, z, rx, ry, rz]);
  const cell = 0.4;
  const x0 = mx - 3;
  const x1 = mx + 15;
  const z0 = mz - 10.5;
  const z1 = mz + 10.5;
  const nx = Math.ceil((x1 - x0) / cell) + 1;
  const nz = Math.ceil((z1 - z0) / cell) + 1;
  const heights = new Float32Array(nx * nz);
  let minH = my;
  for (let i = 0; i < nz; i++)
    for (let j = 0; j < nx; j++) {
      const h = heightAt(x0 + j * cell, z0 + i * cell);
      heights[j + nx * i] = h;
      minH = Math.min(minH, h);
    }
  const groundAt = (x, z) => {
    const ix = Math.min(nx - 1, Math.max(0, Math.round((x - x0) / cell)));
    const iz = Math.min(nz - 1, Math.max(0, Math.round((z - z0) / cell)));
    return heights[ix + nx * iz];
  };
  const y0 = minH - 2.5;
  const y1 = my + 10;
  const field = new SdfGrid(x0, y0, z0, cell, x1 - x0, y1 - y0, z1 - z0, -6);
  const tunnelA = new Vector3(mx - 4, my + 1.55, mz);
  const tunnelB = new Vector3(mx + 5.2, my + 1.55, mz);
  field.stamp(x0, y0, z0, x1, y1, z1, (x, y, z) => {
    let d = 99;
    for (const [lx, ly, lz, rx, ry, rz] of lumps) d = smin(d, sdEllipsoid(x - lx, y - ly, z - lz, rx, ry, rz), 2.2);
    if (d > 6) return -d;
    if (d < 3) {
      const ridge = 1 - Math.abs(mouthNoise(x * 0.2 + 7, y * 0.24, z * 0.2 - 3));
      d +=
        0.8 * mouthNoise(x * 0.16, y * 0.2, z * 0.16) +
        0.38 * mouthNoise(x * 0.45 + 3, y * 0.5, z * 0.45) -
        0.55 * (ridge * ridge - 0.4) +
        0.1 * Math.sin(y * 1.8 + x * 0.2);
    }
    const span = tunnelB.x - tunnelA.x;
    let t = (x - tunnelA.x) / span;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ax = tunnelA.x + span * t;
    const radius = 2.05 + 0.25 * Math.max(0, 1 - (x - mx + 1) / 3);
    let dTunnel = Math.hypot(x - ax, (y - tunnelA.y) * 0.9, z - tunnelA.z) - radius;
    dTunnel += 0.18 * mouthNoise(x * 0.5, y * 0.5, z * 0.5);
    d = smax(d, -dTunnel, 0.8);
    d = smax(d, groundAt(x, z) - 0.9 - y, 0.4);
    return -d;
  });
  const { positions, indices } = surfaceNets(field);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  const rng = caveRng('mouth');
  const acc = new FungusBuilder();
  const emitters = [];
  const clusterA = flora.allocCluster(
    new Vector3(mx - 0.5, my + 0.3, mz - 2.6),
    new Vector3(0, 1, 0),
    3,
    HUES.cyan,
    'mouth',
  );
  const clusterB = flora.allocCluster(
    new Vector3(mx - 0.5, my + 0.3, mz + 2.6),
    new Vector3(0, 1, 0),
    3,
    HUES.teal,
    'mouth',
  );
  const patches = [
    [mx - 0.9, mz - 2.9, 1, clusterA],
    [mx - 1.8, mz - 2.2, 0.6, clusterA],
    [mx + 0.3, mz - 3.4, 0.8, clusterA],
    [mx - 0.9, mz + 2.9, 0.9, clusterB],
    [mx - 2, mz + 3.4, 0.55, clusterB],
    [mx + 0.6, mz + 3.6, 0.7, clusterB],
    [mx + 2.5, mz - 1.6, 0.45, clusterA],
    [mx + 2.6, mz + 1.5, 0.5, clusterB],
    [mx - 3.4, mz - 4.2, 0.4, clusterA],
  ];
  for (const [px, pz, size, cluster] of patches) {
    const gy = heightAt(px, pz);
    const count = 2 + Math.floor(rng() * 4);
    for (let i = 0; i < count; i++) {
      const ang = rng() * Math.PI * 2;
      const rad = rng() * size * 0.8;
      const scale = (0.5 + rng() * 0.7) * (i === 0 ? 1.3 : 1);
      addMushroom(acc, {
        base: new Vector3(px + Math.cos(ang) * rad, gy - 0.05, pz + Math.sin(ang) * rad),
        up: new Vector3((rng() - 0.5) * 0.4, 1, (rng() - 0.5) * 0.4).normalize(),
        yaw: rng() * 6.28,
        height: size * scale * 0.9,
        capR: size * scale * 0.42,
        hue: cluster.hue,
        cluster: cluster.id,
        pivot: cluster.pos,
        bend: (rng() - 0.5) * 0.4,
        spots: 3 + Math.floor(rng() * 3),
        seed: rng() * 10,
      });
    }
    emitters.push({
      x: px,
      y: gy + 0.6,
      z: pz,
      r: 3 + size * 2,
      color: cluster.hue,
      k: 0.25,
    });
  }
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const pt = new Vector3();
  const nrm = new Vector3();
  const mossColor = new Color(0.22, 0.4, 0.26);
  let strands = 0;
  for (let i = 0; i < position.count && strands < 26; i += 7) {
    pt.fromBufferAttribute(position, i);
    nrm.fromBufferAttribute(normal, i);
    if (nrm.y > -0.5 || pt.x > mx + 1.6 || pt.x < mx - 1.6 || Math.abs(pt.z - mz) > 2.3 || rng() < 0.4) continue;
    const len = 0.4 + rng() * 1.1;
    const anchor = pt.clone().add(new Vector3(0, 0.1, 0));
    const curve = new CatmullRomCurve3([
      anchor,
      anchor.clone().add(new Vector3(rng() * 0.1, -len * 0.5, 0)),
      anchor.clone().add(new Vector3(-0.1, -len, (rng() - 0.5) * 0.2)),
    ]);
    const tube = taperedTube(curve, 6, 3, (t) => 0.05 * (1 - t * 0.6));
    acc.add(tube, new Matrix4(), mossColor, 5, clusterA.id, 0, clusterA.hue, anchor, (vi) => Math.floor(vi / 4) / 6);
    strands++;
  }
  const boulders = [];
  const boulderSpots = [
    [mx - 1.4, mz - 4.6, 1.1, 0.7],
    [mx - 2.6, mz + 4.3, 0.8, 0.6],
    [mx + 1.2, mz + 7.2, 1.3, 0.65],
    [mx + 5.5, mz - 8.2, 1, 0.6],
    [mx - 0.4, mz + 5.6, 0.55, 0.8],
    [mx - 3.8, mz - 2.9, 0.45, 0.75],
  ];
  for (const [bx, bz, size, squash] of boulderSpots) {
    const boulder = boulderGeometry(size, bx * 0.37 + bz, squash);
    boulder.rotateY(bx * 1.7);
    boulder.translate(bx, heightAt(bx, bz) + size * 0.25, bz);
    boulders.push(boulder);
  }
  const rockGeo = mergeGeometries([geometry, ...boulders]);
  geometry.dispose();
  bake(field, rockGeo, emitters);
  const rock = new Mesh(rockGeo, rockMat);
  rock.name = 'glowcap-mouth-rock';
  rock.castShadow = true;
  rock.receiveShadow = true;
  group.add(rock);
  const fungus = new Mesh(acc.geometry(), fungusMat);
  fungus.name = 'glowcap-mouth-fungus';
  group.add(fungus);
  const voidMat = new ShaderMaterial({
    uniforms: {
      ...ctx.globals,
    },
    vertexShader: `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: `
      #include <wb_common>
      varying vec2 vUv;
      void main() {
        vec2 c = (vUv - vec2(0.5, 0.42)) * vec2(1.0, 1.15);
        float d = length(c) * 2.0;
        float a = smoothstep(1.0, 0.35, d);
        float sp = step(0.992, wbHash12(floor(vUv * 60.0))) * (0.5 + 0.5 * sin(uTime * 2.0 + vUv.x * 40.0));
        vec3 col = vec3(0.0, 0.01, 0.015) + vec3(0.2, 0.9, 0.8) * sp * smoothstep(0.9, 0.2, d) * 0.8;
        gl_FragColor = vec4(col, a * 0.97);
      }
    `,
    transparent: true,
    depthWrite: false,
  });
  const voidCard = new Mesh(new PlaneGeometry(5.4, 5), voidMat);
  voidCard.position.set(mx + 2.7, my + 1.9, mz);
  voidCard.rotation.y = -Math.PI / 2;
  voidCard.renderOrder = 5;
  voidCard.name = 'glowcap-mouth-void';
  group.add(voidCard);
  const glowMat = makeGlowCardMaterial(ctx, new Color(0.25, 0.85, 0.75), 0.35);
  const glowCard = new Mesh(new PlaneGeometry(4.6, 3.6), glowMat);
  glowCard.position.set(mx + 1.6, my + 1.3, mz);
  glowCard.rotation.y = -Math.PI / 2;
  glowCard.renderOrder = 6;
  group.add(glowCard);
  const stones = new StoneBuilder();
  const hx = MOUTH_HINT.x;
  const hz = MOUTH_HINT.z;
  const hint = addHintStone(stones, new Vector3(hx, heightAt(hx, hz) - 0.1, hz), Math.atan2(-1, 0.4), 7.7);
  const hintStone = new Mesh(stones.geometry(), stoneMat);
  hintStone.name = 'glowcap-hint-stone';
  hintStone.castShadow = true;
  group.add(hintStone);
  const colliders = [];
  try {
    const rockDesc = ctx.RAPIER.ColliderDesc.trimesh(rockGeo.getAttribute('position').array, rockGeo.getIndex().array);
    if (rockDesc) {
      rockDesc.setCollisionGroups(COLLISION_GROUPS.static).setFriction(0.9);
      const collider = ctx.physics.createCollider(rockDesc);
      ctx.colliders.register(collider, {
        kind: 'rock',
        surface: 'rock',
        object: group,
        data: {
          glowcap: 'mouth',
        },
      });
      colliders.push(collider);
    }
    const stoneDesc = ctx.RAPIER.ColliderDesc.cylinder(0.75, 0.42)
      .setTranslation(hx, heightAt(hx, hz) + 0.75, hz)
      .setCollisionGroups(COLLISION_GROUPS.static);
    const collider = ctx.physics.createCollider(stoneDesc);
    ctx.colliders.register(collider, {
      kind: 'rock',
      surface: 'stone',
      object: group,
    });
    colliders.push(collider);
  } catch (err) {
    console.warn('[caverns] mouth colliders failed', err);
  }
  try {
    ctx.vegetation.clearGrass(new Vector3(mx + 1, my, mz), 5.5);
    ctx.vegetation.clearGrass(new Vector3(mx + 4, my, mz), 5);
  } catch {}
  ctx.scene.add(group);
  return {
    group,
    mouth: new Vector3(mx, my, mz),
    hint,
    colliders,
    inside(p) {
      return p.x > mx + 1.5 && p.x < mx + 6 && Math.abs(p.z - mz) < 2.3 && p.y > my - 1.5 && p.y < my + 3.5;
    },
    near(p) {
      const dx = p.x - (mx - 0.5);
      const dz = p.z - mz;
      return dx * dx + dz * dz < 30.25 && Math.abs(p.y - my) < 3.5;
    },
    setAwake(awake) {
      glowMat.uniforms.uI.value = 0.35 + 0.5 * awake;
    },
    dispose() {
      ctx.scene.remove(group);
      rockGeo.dispose();
      fungus.geometry.dispose();
      hintStone.geometry.dispose();
      voidMat.dispose();
      glowMat.dispose();
      for (const collider of colliders)
        try {
          ctx.colliders.unregister(collider);
          ctx.physics.removeCollider(collider, false);
        } catch {}
    },
  };
}
