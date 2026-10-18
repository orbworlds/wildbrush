/**
 * Ambient wildlife: butterflies around meadows that flee the hero, birds circling landmarks and gulls over the beach, dragonflies along the lake shore, and fish that leap from the lake with splashes and ripples.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { randRange, rng, TAU } from '../shared/util.js';
function flapMaterial(ctx, options = {}) {
  const globals = ctx.globals;
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: options.roughness ?? 0.6,
    side: DoubleSide,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, globals);
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        `#include <wb_common>
attribute vec4 aFlap;
void main() {`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        float fAx = abs(position.x);
        float fSide = position.x < 0.0 ? -1.0 : 1.0;
        float fPh = uTime * aFlap.x + aFlap.y;
        float fAng;
        float fHinge = 10.0;
        if (aFlap.w < 0.5) {
          fAng = (sin(fPh) * 0.5 + 0.5) * aFlap.z - 0.2;
        } else if (aFlap.w < 1.5) {
          float flapOn = smoothstep(-0.2, 0.4, sin(uTime * 0.45 + aFlap.y * 3.0));
          fAng = sin(fPh) * aFlap.z * flapOn + 0.1;
          fHinge = 0.45;
        } else {
          fAng = sin(fPh) * aFlap.z + 0.1;
        }
        float fIn = min(fAx, fHinge);
        float fOut = max(fAx - fHinge, 0.0);
        float fAng2 = fAng * 1.7 - 0.05;
        float fN = fOut > 0.0 ? fAng2 : fAng;
        if (fAx > 0.015) objectNormal = vec3(-fSide * sin(fN), cos(fN), 0.0);
        `,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (fAx > 0.015) {
          transformed.x = fSide * (cos(fAng) * fIn + cos(fAng2) * fOut);
          transformed.y += sin(fAng) * fIn + sin(fAng2) * fOut;
        }`,
      );
  };
  material.customProgramCacheKey = () => 'wb-content-flap-v1';
  return material;
}
function triGeometry(positions, colors) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}
function butterflyGeometry() {
  const positions = [];
  const colors = [];
  const tri = (a2, b, c, shadeA, shadeB, shadeC) => {
    positions.push(...a2, ...b, ...c);
    colors.push(shadeA, shadeA, shadeA, shadeB, shadeB, shadeB, shadeC, shadeC, shadeC);
  };
  for (const side of [-1, 1]) {
    const pt = (x, z) => [x * side, 0, z];
    const fore = [pt(0.02, 0.03), pt(0.12, 0.13), pt(0.25, 0.12), pt(0.27, 0.02), pt(0.16, -0.03)];
    for (let i = 1; i < fore.length - 1; i++) tri(fore[0], fore[i], fore[i + 1], 1.15, i === 2 ? 0.35 : 0.9, 0.75);
    const hind = [pt(0.02, -0.02), pt(0.15, -0.04), pt(0.17, -0.12), pt(0.1, -0.2), pt(0.04, -0.14)];
    for (let i = 1; i < hind.length - 1; i++) tri(hind[0], hind[i], hind[i + 1], 1.1, 0.85, i === 2 ? 0.4 : 0.9);
  }
  tri([-0.012, 0.005, 0.07], [0.012, 0.005, 0.07], [0, 0.005, -0.12], 0.12, 0.12, 0.12);
  tri([0, 0.02, 0.07], [0, -0.01, 0.07], [0, 0.005, -0.12], 0.12, 0.12, 0.12);
  return triGeometry(positions, colors);
}
function birdGeometry() {
  const positions = [];
  const colors = [];
  const quad = (a2, b, c, d, shadeIn, shadeOut) => {
    positions.push(...a2, ...b, ...c, ...a2, ...c, ...d);
    colors.push(
      shadeIn,
      shadeIn,
      shadeIn,
      shadeOut,
      shadeOut,
      shadeOut,
      shadeOut,
      shadeOut,
      shadeOut,
      shadeIn,
      shadeIn,
      shadeIn,
      shadeOut,
      shadeOut,
      shadeOut,
      shadeIn,
      shadeIn,
      shadeIn,
    );
  };
  for (const side of [-1, 1]) {
    const pt = (x, y, z) => [x * side, y, z];
    quad(pt(0.05, 0, 0.12), pt(0.45, 0.02, 0.08), pt(0.45, 0.02, -0.12), pt(0.05, 0, -0.12), 0.95, 0.85);
    quad(pt(0.45, 0.02, 0.08), pt(0.95, 0, -0.05), pt(0.9, 0, -0.2), pt(0.45, 0.02, -0.12), 0.85, 0.45);
  }
  const body = [
    [0, 0.06, 0.4],
    [0.08, 0, 0.1],
    [0, -0.06, 0.1],
    [-0.08, 0, 0.1],
    [0, 0.02, -0.35],
  ];
  const tri = (a2, b, c, shade) => {
    positions.push(...a2, ...b, ...c);
    colors.push(shade, shade, shade, shade, shade, shade, shade, shade, shade);
  };
  for (let i = 1; i <= 4; i++) {
    const next = (i % 4) + 1;
    tri(body[0], body[i], body[next], 0.9);
    tri(body[4], body[next], body[i], 0.8);
  }
  tri([0, 0.02, -0.3], [0.15, 0.02, -0.55], [-0.15, 0.02, -0.55], 0.8);
  return triGeometry(positions, colors);
}
function dragonflyGeometry() {
  const positions = [];
  const colors = [];
  const tri = (a2, b, c, colA, colB, colC) => {
    positions.push(...a2, ...b, ...c);
    colors.push(...colA, ...colB, ...colC);
  };
  const wingRoot = [0.85, 0.95, 1];
  const wingTip = [0.6, 0.8, 0.9];
  for (const side of [-1, 1])
    for (const [z, span] of [
      [0.04, 0.2],
      [-0.01, 0.18],
    ]) {
      tri(
        [0.02 * side, 0.01, z],
        [span * side, 0.01, z + 0.02],
        [span * side, 0.01, z - 0.025],
        wingRoot,
        wingTip,
        wingTip,
      );
      tri(
        [0.02 * side, 0.01, z],
        [span * side, 0.01, z - 0.025],
        [0.02 * side, 0.01, z - 0.03],
        wingRoot,
        wingTip,
        wingRoot,
      );
    }
  const bodyFront = [0.1, 0.55, 0.75];
  const bodyTail = [0.12, 0.35, 0.6];
  tri([-0.012, 0.01, 0.08], [0.012, 0.01, 0.08], [0, 0.012, -0.22], bodyFront, bodyFront, bodyTail);
  tri([0, 0.025, 0.08], [0, -0.005, 0.08], [0, 0.012, -0.22], bodyFront, bodyFront, bodyTail);
  tri([-0.025, 0.012, 0.09], [0.025, 0.012, 0.09], [0, 0.02, 0.04], [0.2, 0.3, 0.3], [0.2, 0.3, 0.3], bodyFront);
  return triGeometry(positions, colors);
}
function fishGeometry() {
  const body = new SphereGeometry(0.1, 10, 8);
  body.scale(0.7, 1, 2.6);
  body.deleteAttribute('uv');
  const position = body.attributes.position;
  const bodyColors = [];
  for (let i = 0; i < position.count; i++) {
    const shade = position.getY(i) > 0 ? 0.55 : 1;
    bodyColors.push(0.75 * shade, 0.82 * shade, 0.9 * shade);
  }
  body.setAttribute('color', new Float32BufferAttribute(bodyColors, 3));
  const fins = new BufferGeometry();
  fins.setAttribute(
    'position',
    new Float32BufferAttribute(
      [0, 0, -0.22, 0, 0.1, -0.36, 0, -0.1, -0.36, 0, 0.1, 0, 0, 0.16, -0.12, 0, 0.06, -0.14],
      3,
    ),
  );
  fins.setAttribute(
    'color',
    new Float32BufferAttribute([1, 0.55, 0.3, 1, 0.55, 0.3, 1, 0.55, 0.3, 1, 0.6, 0.35, 1, 0.6, 0.35, 1, 0.6, 0.35], 3),
  );
  fins.computeVertexNormals();
  const merged = new BufferGeometry();
  const flat = body.toNonIndexed();
  const positions = [...flat.attributes.position.array, ...fins.attributes.position.array];
  const colors = [...flat.attributes.color.array, ...fins.attributes.color.array];
  merged.setAttribute('position', new Float32BufferAttribute(positions, 3));
  merged.setAttribute('color', new Float32BufferAttribute(colors, 3));
  merged.computeVertexNormals();
  return merged;
}
export class Wildlife {
  ctx;
  particles;
  butterflies = [];
  birds = [];
  dflies = [];
  fish = [];
  bMesh = null;
  birdMesh = null;
  dMesh = null;
  fMesh = null;
  rMesh = null;
  ripples = [];
  r;
  m = new Matrix4();
  q = new Quaternion();
  e = new Euler(0, 0, 0, 'YXZ');
  s = new Vector3();
  tmp = new Vector3();
  tmp2 = new Vector3();
  lakeCenter = null;
  white = new Color(1, 1, 1);
  cool = new Color(0.8, 0.92, 1);
  constructor(ctx, particles, meadows) {
    this.ctx = ctx;
    this.particles = particles;
    this.r = rng('life');
    const quality = ctx.settings.quality;
    const density = quality === 'low' ? 0.45 : quality === 'medium' ? 0.75 : 1;
    this.initButterflies(meadows, Math.round(44 * density));
    this.initBirds(density);
    this.initLake(Math.round(14 * density));
  }
  groundY(x, z) {
    try {
      return Math.max(this.ctx.terrain.heightAt(x, z), this.ctx.water?.level ?? 0);
    } catch {
      return 0;
    }
  }
  initButterflies(meadows, count) {
    const rand = this.r;
    const homes = meadows.filter((spot) => this.ctx.terrain.heightAt(spot.x, spot.z) > 0.8);
    if (!homes.length || count <= 0) return;
    const colors = [16765803, 16751178, 16118527, 8370431, 14261247, 16773754, 16744366];
    const mesh = new InstancedMesh(butterflyGeometry(), flapMaterial(this.ctx), count);
    const flap = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      const home = homes[i % homes.length].clone();
      const angle = rand() * TAU;
      const dist = rand() * 7;
      const pos = new Vector3(home.x + Math.cos(angle) * dist, 0, home.z + Math.sin(angle) * dist);
      pos.y = this.groundY(pos.x, pos.z) + randRange(rand, 0.5, 1.8);
      this.butterflies.push({
        pos,
        vel: new Vector3(),
        target: pos.clone(),
        home,
        flee: 0,
        retarget: 0,
        phase: rand() * TAU,
      });
      mesh.setColorAt(i, new Color(colors[Math.floor(rand() * colors.length)]));
      flap.set([randRange(rand, 13, 18), rand() * TAU, 1.35, 0], i * 4);
    }
    mesh.geometry.setAttribute('aFlap', new InstancedBufferAttribute(flap, 4));
    mesh.frustumCulled = false;
    mesh.name = 'content-butterflies';
    this.ctx.scene.add(mesh);
    this.bMesh = mesh;
  }
  initBirds(density) {
    const rand = this.r;
    const landmarks = this.ctx.terrain.landmarks;
    const flocks = [
      {
        c: landmarks.summit,
        n: 11,
        r0: 22,
        r1: 46,
        a0: 10,
        a1: 28,
        sp: 7,
        sc: 1,
        gull: false,
      },
      {
        c: landmarks.mesa,
        n: 7,
        r0: 18,
        r1: 32,
        a0: 6,
        a1: 18,
        sp: 6.5,
        sc: 0.9,
        gull: false,
      },
      {
        c: landmarks.tower,
        n: 4,
        r0: 10,
        r1: 18,
        a0: 26,
        a1: 34,
        sp: 6,
        sc: 0.85,
        gull: false,
      },
      {
        c: new Vector3(landmarks.beach.x - 5, 0, landmarks.beach.z - 5),
        n: 8,
        r0: 14,
        r1: 30,
        a0: 9,
        a1: 18,
        sp: 5,
        sc: 1.35,
        gull: true,
      },
    ];
    const birds = [];
    for (const flock of flocks) {
      const count = Math.max(2, Math.round(flock.n * density));
      for (let i = 0; i < count; i++)
        birds.push({
          gull: flock.gull,
          b: {
            center: new Vector3(flock.c.x + (rand() - 0.5) * 8, Math.max(flock.c.y, 0), flock.c.z + (rand() - 0.5) * 8),
            radius: randRange(rand, flock.r0, flock.r1),
            alt: randRange(rand, flock.a0, flock.a1),
            speed: flock.sp * randRange(rand, 0.85, 1.15),
            angle: rand() * TAU,
            wobble: rand() * TAU,
            scale: flock.sc * randRange(rand, 0.85, 1.1),
            dir: rand() < 0.15 ? -1 : 1,
          },
        });
    }
    const total = birds.length;
    const mesh = new InstancedMesh(
      birdGeometry(),
      flapMaterial(this.ctx, {
        roughness: 0.8,
      }),
      total,
    );
    const flap = new Float32Array(total * 4);
    birds.forEach(({ b, gull }, i) => {
      this.birds.push(b);
      mesh.setColorAt(i, gull ? new Color(0xf4f1ea) : new Color(0x4a4640).lerp(new Color(0x6b5a48), rand()));
      flap.set([gull ? randRange(rand, 5, 6) : randRange(rand, 8, 11), rand() * TAU, gull ? 0.45 : 0.6, 1], i * 4);
    });
    mesh.geometry.setAttribute('aFlap', new InstancedBufferAttribute(flap, 4));
    mesh.frustumCulled = false;
    mesh.name = 'content-birds';
    this.ctx.scene.add(mesh);
    this.birdMesh = mesh;
  }
  initLake(count) {
    const ctx = this.ctx;
    const rand = this.r;
    const lake = ctx.terrain.landmarks.lake;
    const level = ctx.water?.level ?? 0;
    const depthAt = (x, z) => {
      try {
        return ctx.water.depthAt(x, z);
      } catch {
        return Math.max(0, level - ctx.terrain.heightAt(x, z));
      }
    };
    if (depthAt(lake.x + 15, lake.z) <= 0 && depthAt(lake.x, lake.z + 15) <= 0) return;
    this.lakeCenter = new Vector3(lake.x, level, lake.z);
    const shore = [];
    for (let angle = 0; angle < TAU; angle += TAU / 36)
      for (let dist = 10; dist < 60; dist += 1) {
        const x = lake.x + Math.cos(angle) * dist;
        const z = lake.z + Math.sin(angle) * dist;
        const depth = depthAt(x, z);
        if (depth > 0.1 && depth < 1.2 && depthAt(x + Math.cos(angle) * 3, z + Math.sin(angle) * 3) < 0.05) {
          shore.push(new Vector3(x, level, z));
          break;
        }
      }
    if (shore.length && count > 0) {
      const dragonflyMesh = new InstancedMesh(
        dragonflyGeometry(),
        flapMaterial(ctx, {
          roughness: 0.3,
        }),
        count,
      );
      const flap = new Float32Array(count * 4);
      const colors = [4182216, 5016831, 10215773, 16742986];
      for (let i = 0; i < count; i++) {
        const anchor = shore[Math.floor(rand() * shore.length)].clone();
        const pos = anchor.clone().add(new Vector3(0, randRange(rand, 0.5, 1.2), 0));
        this.dflies.push({
          anchor,
          pos: pos.clone(),
          from: pos.clone(),
          to: pos.clone(),
          t: 1,
          dur: 1,
          hover: rand() * 2,
          yaw: rand() * TAU,
        });
        dragonflyMesh.setColorAt(i, new Color(colors[i % colors.length]));
        flap.set([randRange(rand, 55, 70), rand() * TAU, 0.35, 2], i * 4);
      }
      dragonflyMesh.geometry.setAttribute('aFlap', new InstancedBufferAttribute(flap, 4));
      dragonflyMesh.frustumCulled = false;
      dragonflyMesh.name = 'content-dragonflies';
      ctx.scene.add(dragonflyMesh);
      this.dMesh = dragonflyMesh;
    }
    const fishMesh = new InstancedMesh(
      fishGeometry(),
      new MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.3,
        metalness: 0.3,
      }),
      3,
    );
    for (let i = 0; i < 3; i++) {
      this.fish.push({
        active: false,
        t: 0,
        dur: 1,
        start: new Vector3(),
        dir: new Vector3(1, 0, 0),
        height: 1,
        wait: randRange(rand, 1, 6) + i * 2,
      });
      fishMesh.setMatrixAt(i, new Matrix4().makeScale(0, 0, 0));
    }
    fishMesh.frustumCulled = false;
    fishMesh.name = 'content-fish';
    ctx.scene.add(fishMesh);
    this.fMesh = fishMesh;
    const ringGeo = new RingGeometry(0.82, 1, 32).rotateX(-Math.PI / 2);
    const material = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    const rippleMesh = new InstancedMesh(ringGeo, material, 10);
    for (let i = 0; i < 10; i++) {
      rippleMesh.setMatrixAt(i, new Matrix4().makeScale(0, 0, 0));
      rippleMesh.setColorAt(i, new Color(0, 0, 0));
      this.ripples.push({
        pos: new Vector3(),
        t: 99,
        size: 1,
      });
    }
    rippleMesh.frustumCulled = false;
    rippleMesh.name = 'content-ripples';
    ctx.scene.add(rippleMesh);
    this.rMesh = rippleMesh;
  }
  splash(pos, strength) {
    for (let i = 0; i < 14 * strength; i++) {
      const angle = Math.random() * TAU;
      const speed = 0.6 + Math.random() * 1.4;
      this.particles.spawn({
        x: pos.x,
        y: pos.y + 0.05,
        z: pos.z,
        vx: Math.cos(angle) * speed,
        vy: 2 + Math.random() * 2.5 * strength,
        vz: Math.sin(angle) * speed,
        gravity: -12,
        color: this.cool,
        bright: 0.9,
        size: 0.05 + Math.random() * 0.05,
        life: 0.55 + Math.random() * 0.3,
      });
    }
    const oldest = this.ripples.reduce((acc, ripple, i, list) => (ripple.t > list[acc].t ? i : acc), 0);
    this.ripples[oldest].pos.copy(pos);
    this.ripples[oldest].t = 0;
    this.ripples[oldest].size = 0.6 + strength * 0.8;
  }
  update(dt) {
    if (dt <= 0) return;
    const elapsed = this.ctx.time.elapsed;
    const playerPos = this.ctx.player?.state?.position;
    const { m: mat, q: quat, e: euler, s: scale, tmp } = this;
    if (this.bMesh) {
      for (let i = 0; i < this.butterflies.length; i++) {
        const fly = this.butterflies[i];
        fly.retarget -= dt;
        fly.flee = Math.max(0, fly.flee - dt);
        if (playerPos && fly.flee <= 0) {
          const dx = fly.pos.x - playerPos.x;
          const dz = fly.pos.z - playerPos.z;
          const dist = Math.hypot(dx, dz);
          if (dist < 3.2 && Math.abs(fly.pos.y - playerPos.y) < 3) {
            fly.flee = 2.5;
            fly.target.set(
              fly.pos.x + (dx / (dist + 0.01)) * 7,
              fly.pos.y + 3 + Math.random() * 2,
              fly.pos.z + (dz / (dist + 0.01)) * 7,
            );
          }
        }
        if (fly.flee <= 0 && (fly.retarget <= 0 || fly.pos.distanceToSquared(fly.target) < 0.3)) {
          fly.retarget = 2 + Math.random() * 3;
          const angle = Math.random() * TAU;
          const reach = Math.random() * 8;
          const x = fly.home.x + Math.cos(angle) * reach;
          const z = fly.home.z + Math.sin(angle) * reach;
          fly.target.set(x, this.groundY(x, z) + 0.4 + Math.random() * 1.8, z);
        }
        const speed = fly.flee > 0 ? 4.5 : 1.6;
        tmp.copy(fly.target).sub(fly.pos);
        const len = tmp.length();
        if (len > 0.001) tmp.multiplyScalar(Math.min(speed, len * 2) / len);
        fly.vel.lerp(tmp, Math.min(1, dt * 2.2));
        fly.pos.addScaledVector(fly.vel, dt);
        const floorY = this.groundY(fly.pos.x, fly.pos.z) + 0.25;
        if (fly.pos.y < floorY) fly.pos.y = floorY;
        const bob = Math.sin(elapsed * 7 + fly.phase) * 0.06;
        const yaw = Math.atan2(fly.vel.x, fly.vel.z);
        euler.set(-0.25 + Math.sin(elapsed * 3 + fly.phase) * 0.15, yaw, Math.sin(elapsed * 2.3 + fly.phase) * 0.2);
        quat.setFromEuler(euler);
        tmp.set(fly.pos.x, fly.pos.y + bob, fly.pos.z);
        mat.compose(tmp, quat, scale.setScalar(1.25));
        this.bMesh.setMatrixAt(i, mat);
      }
      this.bMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.birdMesh) {
      for (let i = 0; i < this.birds.length; i++) {
        const bird = this.birds[i];
        bird.angle += (bird.speed / bird.radius) * dt * bird.dir;
        const radius = bird.radius * (1 + 0.15 * Math.sin(bird.angle * 1.7 + bird.wobble));
        const y = bird.center.y + bird.alt + Math.sin(bird.angle * 2.3 + bird.wobble) * 2.5;
        tmp.set(bird.center.x + Math.cos(bird.angle) * radius, y, bird.center.z + Math.sin(bird.angle) * radius);
        const vx = -Math.sin(bird.angle) * bird.dir;
        const vz = Math.cos(bird.angle) * bird.dir;
        const yaw = Math.atan2(vx, vz);
        euler.set(Math.cos(bird.angle * 2.3 + bird.wobble) * 0.1, yaw, -0.35 * bird.dir);
        quat.setFromEuler(euler);
        mat.compose(tmp, quat, scale.setScalar(bird.scale));
        this.birdMesh.setMatrixAt(i, mat);
      }
      this.birdMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.dMesh) {
      for (let i = 0; i < this.dflies.length; i++) {
        const dfly = this.dflies[i];
        if (dfly.t >= 1) {
          dfly.hover -= dt;
          if (dfly.hover <= 0) {
            dfly.from.copy(dfly.pos);
            const angle = Math.random() * TAU;
            const reach = 0.5 + Math.random() * 3;
            dfly.to.set(
              dfly.anchor.x + Math.cos(angle) * reach,
              dfly.anchor.y + 0.4 + Math.random() * 1.1,
              dfly.anchor.z + Math.sin(angle) * reach,
            );
            dfly.t = 0;
            dfly.dur = Math.max(0.25, dfly.from.distanceTo(dfly.to) / 5);
            dfly.hover = 0.6 + Math.random() * 2.2;
            dfly.yaw = Math.atan2(dfly.to.x - dfly.from.x, dfly.to.z - dfly.from.z);
          }
        } else {
          dfly.t = Math.min(1, dfly.t + dt / dfly.dur);
          const k = dfly.t * dfly.t * (3 - 2 * dfly.t);
          dfly.pos.lerpVectors(dfly.from, dfly.to, k);
        }
        tmp.copy(dfly.pos);
        tmp.y += Math.sin(elapsed * 9 + i) * 0.03;
        tmp.x += Math.sin(elapsed * 13 + i * 2) * 0.015;
        euler.set(0.05, dfly.yaw, 0);
        quat.setFromEuler(euler);
        mat.compose(tmp, quat, scale.setScalar(1.3));
        this.dMesh.setMatrixAt(i, mat);
      }
      this.dMesh.instanceMatrix.needsUpdate = true;
    }
    const nearLake = !!this.lakeCenter && this.ctx.camera.position.distanceTo(this.lakeCenter) < 150;
    if (this.dMesh) this.dMesh.visible = nearLake;
    if (this.fMesh) this.fMesh.visible = nearLake && this.fish.some((fish) => fish.active);
    if (this.rMesh) this.rMesh.visible = nearLake && this.ripples.some((ripple) => ripple.t <= 2);
    if (this.fMesh && this.lakeCenter) {
      const level = this.ctx.water?.level ?? 0;
      for (let i = 0; i < this.fish.length; i++) {
        const fish = this.fish[i];
        if (!fish.active) {
          fish.wait -= dt;
          if (fish.wait <= 0) {
            for (let j = 0; j < 8; j++) {
              const angle = Math.random() * TAU;
              const dist = 8 + Math.random() * 26;
              const x = this.lakeCenter.x + Math.cos(angle) * dist;
              const z = this.lakeCenter.z + Math.sin(angle) * dist;
              let depth = 0;
              try {
                depth = this.ctx.water.depthAt(x, z);
              } catch {
                depth = level - this.ctx.terrain.heightAt(x, z);
              }
              if (depth > 1.4) {
                const heading = Math.random() * TAU;
                fish.start.set(x, level, z);
                fish.dir.set(Math.cos(heading), 0, Math.sin(heading));
                fish.active = true;
                fish.t = 0;
                fish.dur = 0.75 + Math.random() * 0.35;
                fish.height = 0.8 + Math.random() * 0.8;
                this.splash(fish.start, 0.7);
                break;
              }
            }
            if (!fish.active) fish.wait = 2;
          }
          continue;
        }
        fish.t += dt / fish.dur;
        if (fish.t >= 1) {
          fish.active = false;
          fish.wait = 4 + Math.random() * 9;
          this.tmp2.copy(fish.start).addScaledVector(fish.dir, 2.2);
          this.splash(this.tmp2, 1);
          this.fMesh.setMatrixAt(i, mat.makeScale(0, 0, 0));
          continue;
        }
        const u = fish.t;
        tmp.copy(fish.start).addScaledVector(fish.dir, 2.2 * u);
        tmp.y = level + 4 * fish.height * u * (1 - u) - 0.1;
        const vy = (4 * fish.height * (1 - 2 * u)) / fish.dur;
        const vh = 2.2 / fish.dur;
        const pitch = -Math.atan2(vy, vh);
        euler.set(pitch, Math.atan2(fish.dir.x, fish.dir.z), Math.sin(elapsed * 20) * 0.2);
        quat.setFromEuler(euler);
        mat.compose(tmp, quat, scale.setScalar(1.6));
        this.fMesh.setMatrixAt(i, mat);
      }
      this.fMesh.instanceMatrix.needsUpdate = true;
    }
    if (this.rMesh) {
      const white = this.white;
      let any = false;
      for (let i = 0; i < this.ripples.length; i++) {
        const ripple = this.ripples[i];
        if (ripple.t > 2) continue;
        any = true;
        ripple.t += dt;
        const k = Math.min(1, ripple.t / 1.6);
        const size = ripple.size * (0.3 + k * 1.8);
        mat.compose(
          tmp.set(ripple.pos.x, ripple.pos.y + 0.03, ripple.pos.z),
          quat.identity(),
          scale.set(size, 1, size),
        );
        this.rMesh.setMatrixAt(i, mat);
        const alpha = (1 - k) * 0.45;
        this.rMesh.setColorAt(i, white.setScalar(alpha));
        if (k >= 1) this.rMesh.setMatrixAt(i, mat.makeScale(0, 0, 0));
      }
      if (any) {
        this.rMesh.instanceMatrix.needsUpdate = true;
        if (this.rMesh.instanceColor) this.rMesh.instanceColor.needsUpdate = true;
      }
      white.setRGB(1, 1, 1);
    }
  }
}
