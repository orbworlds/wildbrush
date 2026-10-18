/**
 * The cave's puzzles and gates: three braziers that roll the stone door away, the giant glowcap Bloom wakes to bridge the chasm, the gloom veil, the exit portals and the shortcut roots.
 */
import {
  AdditiveBlending,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  IcosahedronGeometry,
  LatheGeometry,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { COLLISION_GROUPS, PALETTE } from '../core/config.js';
import { clamp, smoothstep } from '../core/math.js';
import { ParticleMode } from '../shared/particles.js';
import { FungusBuilder, HUES } from './fungus.js';
import { CHASM, GIANT, OX, OY, OZ, spotPos, SPOTS } from './layout.js';
import { makeBeamMaterial, makeFungusMaterial, makeGlowCardMaterial } from './materials.js';
import { addBrazier, BRAZIER_BOWL_Y, buildDoor, buildRoots, makeVeilMaterial } from './props.js';
const BRAZIER_GLOW = new Color(1, 0.5, 0.18);
const Y_AXIS = new Vector3(0, 1, 0);
const _tmp = new Vector3();
const _paintSample = {
  red: 0,
  blue: 0,
  yellow: 0,
  green: 0,
};
function polyAt(poly, along) {
  const f = clamp(along, 0, 1) * (poly.n - 1);
  const seg = Math.min(poly.n - 2, Math.floor(f));
  const k = f - seg;
  const i0 = seg * 3;
  const i1 = i0 + 3;
  return {
    p: new Vector3(
      poly.p[i0] + (poly.p[i1] - poly.p[i0]) * k,
      poly.p[i0 + 1] + (poly.p[i1 + 1] - poly.p[i0 + 1]) * k,
      poly.p[i0 + 2] + (poly.p[i1 + 2] - poly.p[i0 + 2]) * k,
    ),
    tan: new Vector3(poly.p[i1] - poly.p[i0], 0, poly.p[i1 + 2] - poly.p[i0 + 2]).normalize(),
    floor: poly.f[seg] + (poly.f[seg + 1] - poly.f[seg]) * k,
  };
}
function addBoxCollider(d, pos, hx, hy, hz, yaw, surface = 'stone') {
  try {
    const rot = new Quaternion().setFromAxisAngle(Y_AXIS, yaw);
    const desc = d.ctx.RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(pos.x, pos.y, pos.z)
      .setRotation({
        x: rot.x,
        y: rot.y,
        z: rot.z,
        w: rot.w,
      })
      .setCollisionGroups(COLLISION_GROUPS.static);
    const collider = d.ctx.physics.createCollider(desc);
    d.ctx.colliders.register(collider, {
      kind: 'structure',
      surface,
      object: d.root,
      data: {
        glowcap: true,
      },
    });
    d.colliders.push(collider);
    return collider;
  } catch (err) {
    console.warn('[caverns] collider failed', err);
    return null;
  }
}
function removeCollider(d, collider) {
  if (!collider) return;
  try {
    d.ctx.colliders.unregister(collider);
    d.ctx.physics.removeCollider(collider, false);
  } catch {}
  const idx = d.colliders.indexOf(collider);
  if (idx >= 0) d.colliders.splice(idx, 1);
}
function buildFlames(ctx, spots) {
  const pos = [];
  const uv = [];
  const tris = [];
  const ids = [];
  spots.forEach((p, i) => {
    for (let j = 0; j < 3; j++) {
      const ang = (j / 3) * Math.PI;
      const dx = Math.cos(ang) * 0.55;
      const dz = Math.sin(ang) * 0.55;
      const base = pos.length / 3;
      const height = 1.5;
      pos.push(
        p.x - dx,
        p.y,
        p.z - dz,
        p.x + dx,
        p.y,
        p.z + dz,
        p.x + dx,
        p.y + height,
        p.z + dz,
        p.x - dx,
        p.y + height,
        p.z - dz,
      );
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      ids.push(i, i, i, i);
      tris.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setAttribute('aIdx', new Float32BufferAttribute(ids, 1));
  geometry.setIndex(tris);
  const lit = new Float32Array(4);
  const material = new ShaderMaterial({
    uniforms: {
      ...ctx.globals,
      uLit: {
        value: lit,
      },
    },
    vertexShader: `
      attribute float aIdx;
      uniform float uLit[4];
      varying vec2 vUv;
      varying float vLit;
      varying float vSeed;
      void main() {
        int i = int(aIdx + 0.5);
        float l = uLit[i];
        vLit = l;
        vUv = uv;
        vSeed = aIdx * 7.3;
        vec3 p = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        if (l < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      }
    `,
    fragmentShader: `
      #include <wb_common>
      varying vec2 vUv;
      varying float vLit;
      varying float vSeed;
      void main() {
        float t = uTime;
        vec2 uv = vUv;
        float n1 = wbNoise2(vec2(uv.x * 3.0 + vSeed, uv.y * 2.2 - t * 2.6));
        float n2 = wbNoise2(vec2(uv.x * 7.0 - vSeed, uv.y * 5.0 - t * 4.3));
        // sway harder toward the tip, tongues licking upward
        float x = uv.x - 0.5 + (n1 - 0.5) * 0.28 * uv.y + sin(t * 3.1 + vSeed) * 0.04 * uv.y;
        float h = uv.y / (0.62 + 0.38 * vLit);
        float w = 0.36 * pow(max(1.0 - h, 0.0), 0.75) * smoothstep(-0.02, 0.16, h) * (0.8 + 0.4 * n2);
        float body = smoothstep(w, w * 0.25, abs(x));
        float tongues = smoothstep(0.25 + 0.6 * n2, 0.1 + 0.6 * n2, h - 0.15);
        body *= max(tongues, smoothstep(0.55, 0.0, h));
        float core = smoothstep(w * 0.6, 0.0, abs(x)) * smoothstep(0.55, 0.0, h);
        vec3 col = mix(vec3(0.95, 0.16, 0.03), vec3(1.0, 0.52, 0.12), smoothstep(0.1, 0.8, body));
        col = mix(col, vec3(1.0, 0.85, 0.45), core * 0.8);
        gl_FragColor = vec4(col * body * 1.25 * vLit, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'glowcap-flames';
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  return {
    mesh,
    lit,
  };
}
export class BrazierPuzzle {
  d;
  bowls = [];
  lit = [false, false, false];
  litK = [0, 0, 0];
  sources = [null, null, null];
  pilots = [];
  doorGlow = null;
  flames;
  door;
  gems = [];
  doorBase;
  doorYaw;
  doorCollider;
  openT = -1;
  solvedAt = -1;
  solved = false;
  checkT = 0;
  emberT = 0;
  shakeT = 0;
  doorPos;
  constructor(d2) {
    this.d = d2;
    const { build, staticStone } = d2;
    SPOTS.braziers.forEach((brazier, i) => {
      const pos = spotPos(brazier);
      pos.y = (build.groundY(pos.x, pos.z, pos.y + 2.5, 6) ?? pos.y) - 0.04;
      addBrazier(staticStone, pos, i * 1.3, i * 3.7);
      this.bowls.push(pos.clone().add(new Vector3(0, BRAZIER_BOWL_Y, 0)));
      addBoxCollider(d2, pos.clone().add(new Vector3(0, 0.78, 0)), 0.55, 0.78, 0.55, 0);
    });
    for (const bowl of this.bowls)
      this.pilots.push(
        d2.glow.add('static', bowl.clone().add(new Vector3(0, 0.5, 0)), 4.6, new Color(1, 0.32, 0.1), 0.42, {
          i: 0.42,
          flicker: 0.6,
        }),
      );
    this.flames = buildFlames(
      d2.ctx,
      this.bowls.map((bowl) => bowl.clone().add(new Vector3(0, 0.08, 0))),
    );
    d2.root.add(this.flames.mesh);
    const at = polyAt(d2.build.polys.T4, 0.16);
    this.doorYaw = Math.atan2(at.tan.x, at.tan.z);
    this.doorBase = new Vector3(at.p.x, at.floor + 1.75, at.p.z);
    this.doorPos = this.doorBase.clone();
    const doorR = 3.55;
    const { door, gems } = buildDoor(doorR);
    this.door = new Mesh(door, d2.stone);
    this.door.name = 'glowcap-door';
    this.door.position.copy(this.doorBase);
    this.door.rotation.y = this.doorYaw;
    d2.root.add(this.door);
    const frame = new TorusGeometry(3.6999999999999997, 0.55, 8, 44);
    const frameMatrix = new Matrix4().compose(
      this.doorBase,
      new Quaternion().setFromAxisAngle(Y_AXIS, this.doorYaw),
      new Vector3(1, 1, 1.4),
    );
    staticStone.add(frame, frameMatrix, 8024680);
    for (const side of [1, -1])
      gems.forEach((gem, index) => {
        const mesh = new Mesh(
          new OctahedronGeometry(0.28, 0),
          new MeshStandardMaterial({
            color: 0x3a2a26,
            emissive: new Color(PALETTE.red.hex),
            emissiveIntensity: 0,
            roughness: 0.3,
          }),
        );
        mesh.position.set(gem.x, gem.y, gem.z * side);
        mesh.scale.set(1, 1.3, 0.6);
        mesh.userData.index = index;
        this.door.add(mesh);
        this.gems.push(mesh);
      });
    this.doorCollider = addBoxCollider(d2, this.doorBase, doorR, doorR, 0.45, this.doorYaw);
    const fwd = new Vector3(-Math.sin(this.doorYaw), 0, -Math.cos(this.doorYaw));
    this.doorGlow = d2.glow.add(
      'static',
      this.doorBase
        .clone()
        .addScaledVector(fwd, 1.6)
        .add(new Vector3(0, 0.6, 0)),
      5.5,
      new Color(1, 0.55, 0.3),
      0.3,
      {
        i: 0.3,
      },
    );
  }
  onSplat(color, pos, radius = 1.2) {
    if (color === 'red')
      this.bowls.forEach((bowl, i) => {
        if (this.lit[i]) return;
        const dx = pos.x - bowl.x;
        const dz = pos.z - bowl.z;
        const dy = pos.y - bowl.y;
        if (dx * dx + dz * dz < (1.6 + radius * 0.6) ** 2 && dy > -1.8 && dy < 3) this.ignite(i);
      });
  }
  ignite(index, instant = false) {
    if (this.lit[index]) return;
    this.lit[index] = true;
    const bowl = this.bowls[index];
    const d = this.d;
    this.pilots[index].target = 0;
    this.sources[index] = d.glow.add('brazier', bowl.clone().add(new Vector3(0, 0.7, 0)), 11, BRAZIER_GLOW, 1.35, {
      flicker: 1,
      flash: instant ? 0 : 2.5,
      i: instant ? 1.35 : 0,
    });
    if (instant) this.litK[index] = 1;
    else {
      d.play('shrine-activate', bowl, 0.7);
      d.play('bramble-burn', bowl, 0.5);
      this.burst(bowl, 36, 5);
    }
    for (const gem of this.gems)
      if (gem.userData.index === index) gem.material.emissiveIntensity = instant ? 2.2 : 0.01;
    if (this.lit.every(Boolean) && !this.solved) {
      this.solved = true;
      this.solvedAt = d.ctx.time.elapsed + (instant ? 0 : 1.1);
      if (instant) this.openInstant();
    }
  }
  openInstant() {
    this.openT = 99;
    this.door.visible = false;
    removeCollider(this.d, this.doorCollider);
    this.doorCollider = null;
  }
  burst(pos, count, speed) {
    const particles = this.d.particles;
    if (!particles) return;
    const colors = [new Color(1, 0.5, 0.1), new Color(1, 0.8, 0.3), new Color(1, 0.25, 0.05)];
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = speed * (0.3 + Math.random() * 0.7);
      particles.spawn({
        x: pos.x,
        y: pos.y + 0.2,
        z: pos.z,
        vx: Math.cos(ang) * spd * 0.4,
        vy: spd * (0.6 + Math.random()),
        vz: Math.sin(ang) * spd * 0.4,
        color: colors[i % 3],
        size: 0.1 + Math.random() * 0.12,
        life: 0.6 + Math.random() * 0.8,
        drag: 1.2,
        gravity: -2,
        mode: ParticleMode.Ballistic,
        bright: 2.4,
      });
    }
  }
  update(dt, active) {
    const d = this.d;
    const elapsed = d.ctx.time.elapsed;
    for (let j = 0; j < 3; j++) {
      const goal = +!!this.lit[j];
      this.litK[j] += (goal - this.litK[j]) * (1 - Math.exp(-3 * dt));
      this.flames.lit[j] = this.litK[j];
      if (this.lit[j])
        for (const gem of this.gems) {
          if (gem.userData.index !== j) continue;
          const material = gem.material;
          material.emissiveIntensity +=
            (2.2 + 0.4 * Math.sin(elapsed * 3 + j) - material.emissiveIntensity) * (1 - Math.exp(-3 * dt));
        }
    }
    if (active) {
      this.checkT -= dt;
      if (this.checkT <= 0) {
        this.checkT = 0.35;
        this.bowls.forEach((bowl, i) => {
          if (!this.lit[i])
            try {
              for (const [ox, oz] of [
                [0, 0],
                [0.4, 0],
                [-0.4, 0],
                [0, 0.4],
                [0, -0.4],
              ])
                if (d.ctx.paint.sample(_tmp.set(bowl.x + ox, bowl.y - 0.02, bowl.z + oz), _paintSample).red > 0.3) {
                  this.ignite(i);
                  break;
                }
            } catch {}
        });
      }
      this.emberT -= dt;
      if (this.emberT <= 0 && d.particles) {
        this.emberT = 0.07;
        this.bowls.forEach((bowl, i) => {
          if (!(this.litK[i] < 0.3))
            d.particles.spawn({
              x: bowl.x + (Math.random() - 0.5) * 0.6,
              y: bowl.y + 0.3,
              z: bowl.z + (Math.random() - 0.5) * 0.6,
              vx: 0,
              vy: 1.4 + Math.random() * 1.4,
              vz: 0,
              color: BRAZIER_GLOW,
              size: 0.05 + Math.random() * 0.06,
              life: 1.2 + Math.random(),
              mode: ParticleMode.Rise,
              bright: 2.2,
            });
        });
      }
      if (this.solved && this.openT < 0 && this.solvedAt >= 0 && elapsed >= this.solvedAt) {
        this.openT = 0;
        d.play('boss-rise', this.doorBase, 0.55);
        d.play('barrier-down', this.doorBase, 0.8);
        const focus = this.doorBase.clone();
        const eye = this.doorBase
          .clone()
          .addScaledVector(new Vector3(Math.sin(this.doorYaw), 0, Math.cos(this.doorYaw)), -8.5)
          .add(new Vector3(1.5, 2.2, 0));
        d.cinematic(eye, focus, 3.4);
        d.solved('glowcap-braziers', this.doorBase.clone());
      }
      if (this.openT >= 0 && this.openT < 99) {
        this.openT += dt;
        const k = smoothstep(0.35, 3, this.openT);
        this.door.position.copy(this.doorBase).add(new Vector3(0, -6.2 * k, 0));
        this.door.rotation.z = Math.sin(this.openT * 22) * 0.012 * (1 - k);
        if (k > 0.15 && this.doorCollider) {
          removeCollider(d, this.doorCollider);
          this.doorCollider = null;
        }
        this.shakeT -= dt;
        if (this.shakeT <= 0 && k < 1) {
          this.shakeT = 0.25;
          try {
            d.ctx.events.emit('camera:shake', {
              strength: 0.25,
              position: this.doorBase.clone(),
            });
          } catch {}
          const particles = d.particles;
          if (particles)
            for (let i = 0; i < 10; i++) {
              const off = (Math.random() - 0.5) * 6;
              const side = new Vector3(Math.cos(this.doorYaw), 0, -Math.sin(this.doorYaw));
              const p = this.doorBase
                .clone()
                .addScaledVector(side, off)
                .add(new Vector3(0, -1.6, 0));
              particles.spawn({
                x: p.x,
                y: p.y,
                z: p.z,
                vx: (Math.random() - 0.5) * 1.5,
                vy: 0.6 + Math.random(),
                vz: (Math.random() - 0.5) * 1.5,
                color: new Color(0.55, 0.5, 0.45),
                size: 0.25 + Math.random() * 0.25,
                life: 1.2,
                drag: 1.5,
                gravity: -0.5,
                mode: ParticleMode.Ballistic,
                bright: 0.5,
              });
            }
        }
        if (this.openT > 3.2) {
          this.openT = 99;
          this.door.visible = false;
          if (this.doorGlow) this.doorGlow.target = 0;
        }
      }
    }
  }
  get open() {
    return this.openT >= 99 || (this.openT > 0.9 && !this.doorCollider);
  }
}
export class GiantGlowcap {
  d;
  base;
  stalk;
  cap;
  cluster;
  stalkH;
  growT = -1;
  awake = false;
  zT = 0;
  capCollider = null;
  checkT = 0;
  capTop;
  fold = {
    value: 0,
  };
  capMat;
  constructor(d2) {
    this.d = d2;
    this.capMat = makeFungusMaterial(d2.ctx, d2.U, this.fold);
    const x2 = OX + GIANT.x;
    const z = OZ + GIANT.z;
    const gy = d2.build.groundY(x2, z, OY + CHASM.floor + 2, 5) ?? OY + CHASM.floor;
    this.base = new Vector3(x2, gy - 0.1, z);
    const capY = OY + CHASM.top + 0.28;
    const capH = 0.62;
    this.stalkH = capY - capH - this.base.y;
    this.capTop = new Vector3(x2, capY, z);
    this.cluster = d2.flora.allocCluster(this.capTop, Y_AXIS, 7, HUES.cyan, 'B');
    this.cluster.giant = true;
    d2.U.uMushB.value[this.cluster.id] = 0.55;
    const cyan = HUES.cyan;
    const stalkPivot = new Vector3(0, this.stalkH, 0);
    const stalkAcc = new FungusBuilder();
    const profile = [];
    for (let i = 0; i <= 10; i++) {
      const k = i / 10;
      profile.push(
        new Vector2(0.75 * (1.45 - 0.55 * k + 0.35 * (1 - k) ** 5) + 0.08 * Math.sin(k * 9), k * this.stalkH),
      );
    }
    const stalkGeo = new LatheGeometry(profile, 18);
    stalkGeo.deleteAttribute('uv');
    const position = stalkGeo.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const k = position.getY(i) / this.stalkH;
      position.setX(i, position.getX(i) + Math.sin(k * 2.6) * 0.35);
    }
    stalkGeo.computeVertexNormals();
    stalkAcc.add(stalkGeo, new Matrix4(), new Color(0.82, 0.8, 0.88), 0, this.cluster.id, 0.4, cyan, stalkPivot);
    this.stalk = new Mesh(stalkAcc.geometry(), d2.mats.fungus);
    this.stalk.name = 'glowcap-giant-stalk';
    this.stalk.position.copy(this.base);
    const capAcc = new FungusBuilder();
    const capR = GIANT.capR;
    const capPivot = new Vector3(0, 0, 0);
    const capProfile = [];
    for (let i = 0; i <= 12; i++) {
      const k = i / 12;
      const rad = capR * k;
      const y = capH - 0.28 * k * k - 0.42 * k ** 6;
      capProfile.push(new Vector2(Math.max(0.001, rad), y));
    }
    capProfile.push(new Vector2(capR * 1.01, -0.22999999999999998));
    capProfile.reverse();
    const capGeo = new LatheGeometry(capProfile, 40);
    capGeo.deleteAttribute('uv');
    capAcc.add(capGeo, new Matrix4(), new Color(0.66, 0.88, 0.9), 1, this.cluster.id, 0.8, cyan, capPivot);
    const gillProfile = [new Vector2(0.9, -0.1), new Vector2(capR * 0.55, -0.12), new Vector2(capR * 1, -0.24)];
    const gillGeo = new LatheGeometry(gillProfile, 40);
    gillGeo.deleteAttribute('uv');
    capAcc.add(gillGeo, new Matrix4(), new Color(0.35, 0.7, 0.75), 2, this.cluster.id, 0.9, cyan, capPivot);
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2 + (i % 3) * 0.4;
      const k = 0.35 + (i % 4) * 0.16;
      const rad = capR * k;
      const y2 = capH - 0.28 * k * k - 0.42 * k ** 6 + 0.02;
      const spot = new IcosahedronGeometry(0.13 + (i % 3) * 0.05, 1);
      spot.deleteAttribute('uv');
      spot.scale(1, 0.35, 1);
      spot.translate(Math.cos(ang) * rad, y2, Math.sin(ang) * rad);
      capAcc.add(spot, new Matrix4(), new Color(0.8, 1, 0.95), 3, this.cluster.id, 0.55, cyan, capPivot);
    }
    this.cap = new Mesh(capAcc.geometry(), this.capMat);
    this.cap.name = 'glowcap-giant-cap';
    d2.root.add(this.stalk, this.cap);
    this.pose(0);
  }
  pose(grow) {
    const ease = grow < 1 ? 1 - (1 - grow) ** 3 : 1;
    const wobble = grow < 1 ? Math.sin(grow * Math.PI) * 0.08 : 0;
    const sy = 0.24 + 0.76 * ease + wobble;
    this.stalk.scale.set(1 + wobble * 0.5, sy, 1 + wobble * 0.5);
    const capPos = this.base.clone().add(new Vector3(0, this.stalkH * sy, 0));
    this.cap.position.copy(capPos).add(new Vector3(0, -0.05, 0));
    const tilt = (1 - ease) * 0.32;
    this.cap.rotation.set(tilt * 0.6, 0.4 * (1 - ease), tilt);
    const s = 1 + wobble * 0.12;
    this.cap.scale.set(s, 1, s);
    this.fold.value = grow >= 1 ? 1 : smoothstep(0.45, 1, grow);
    this.stalk.updateMatrix();
    this.cap.updateMatrix();
  }
  onSplat(color, pos) {
    if (this.awake || color !== 'green') return;
    const position = this.cap.position;
    if (pos.distanceToSquared(position) < 17.64 || pos.distanceToSquared(this.base) < 9) this.wake();
  }
  wake(instant = false) {
    if (this.awake) return;
    this.awake = true;
    const d = this.d;
    if (instant) {
      this.growT = 99;
      this.pose(1);
      this.finish(true);
      return;
    }
    this.growT = 0;
    d.play('chest-appear', this.capTop, 0.8);
    const eye = new Vector3(OX + GIANT.x + 7.5, OY + 3.5, OZ + GIANT.z + 10.5);
    d.cinematic(eye, this.capTop.clone().add(new Vector3(0, -1.5, 0)), 3.8);
  }
  finish(instant) {
    const d = this.d;
    this.cluster.awake = true;
    this.cluster.base = 1.1;
    this.cluster.pulse = +!instant;
    d.glow.add('mush', this.capTop.clone().add(new Vector3(0, 0.6, 0)), 10, HUES.cyan, 0.8, {
      flicker: 0,
      i: instant ? 0.8 : 0,
      flash: instant ? 0 : 2,
    });
    try {
      this.cap.updateMatrixWorld(true);
      const position = this.cap.geometry.getAttribute('position');
      const pts = [];
      const stride = Math.max(1, Math.floor(position.count / 160));
      for (let i = 0; i < position.count; i += stride) {
        _tmp.fromBufferAttribute(position, i).applyMatrix4(this.cap.matrixWorld);
        pts.push(_tmp.x, _tmp.y, _tmp.z);
      }
      const hullDesc = d.ctx.RAPIER.ColliderDesc.convexHull(new Float32Array(pts));
      if (hullDesc) {
        hullDesc.setCollisionGroups(COLLISION_GROUPS.static).setFriction(1);
        this.capCollider = d.ctx.physics.createCollider(hullDesc);
        d.ctx.colliders.register(this.capCollider, {
          kind: 'structure',
          surface: 'wood',
          object: d.root,
          data: {
            glowcap: 'giant',
          },
        });
        d.colliders.push(this.capCollider);
      }
      const stalkDesc = d.ctx.RAPIER.ColliderDesc.cylinder(this.stalkH / 2, 0.9)
        .setTranslation(this.base.x, this.base.y + this.stalkH / 2, this.base.z)
        .setCollisionGroups(COLLISION_GROUPS.static);
      const collider = d.ctx.physics.createCollider(stalkDesc);
      d.ctx.colliders.register(collider, {
        kind: 'tree',
        surface: 'wood',
        object: d.root,
      });
      d.colliders.push(collider);
    } catch (err) {
      console.warn('[caverns] giant colliders failed', err);
    }
    if (!instant) {
      d.solved('glowcap-bridge', this.capTop.clone());
      this.spores(this.capTop, 70, 5);
    }
  }
  spores(pos, count, speed) {
    const particles = this.d.particles;
    if (!particles) return;
    const colors = [HUES.cyan, HUES.teal, new Color(PALETTE.green.hex), new Color(0.85, 1, 0.95)];
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.random() * GIANT.capR;
      const spd = speed * (0.3 + Math.random() * 0.7);
      particles.spawn({
        x: pos.x + Math.cos(ang) * rad,
        y: pos.y + 0.3,
        z: pos.z + Math.sin(ang) * rad,
        vx: Math.cos(ang) * spd * 0.3,
        vy: spd * (0.5 + Math.random()),
        vz: Math.sin(ang) * spd * 0.3,
        color: colors[i % colors.length],
        size: 0.1 + Math.random() * 0.14,
        life: 1.2 + Math.random() * 1.4,
        drag: 1.4,
        gravity: -0.6,
        mode: ParticleMode.Rise,
        bright: 2,
      });
    }
  }
  update(dt, active) {
    const d = this.d;
    if (this.growT >= 0 && this.growT < 99) {
      this.growT += dt;
      const k = clamp(this.growT / 3.2, 0, 1);
      this.pose(k);
      d.U.uMushB.value[this.cluster.id] = 0.55 + 1.4 * smoothstep(0, 0.4, k);
      if (Math.random() < dt * 40) this.spores(this.cap.position, 2, 2.5);
      if (k >= 1) {
        this.growT = 99;
        this.finish(false);
      }
    }
    if (active && !this.awake) {
      const s = 1 + Math.sin(d.ctx.time.elapsed * 1.1) * 0.035;
      this.cap.scale.set(s, 1 / s, s);
      d.U.uMushB.value[this.cluster.id] = 0.55 + 0.15 * Math.sin(d.ctx.time.elapsed * 1.1);
      this.zT -= dt;
      if (this.zT <= 0 && d.particles) {
        this.zT = 0.7;
        const position = this.cap.position;
        d.particles.spawn({
          x: position.x + (Math.random() - 0.5),
          y: position.y + 1.2,
          z: position.z + (Math.random() - 0.5),
          vx: 0,
          vy: 0.6,
          vz: 0,
          color: HUES.cyan,
          size: 0.14 + Math.random() * 0.1,
          life: 2.6,
          mode: ParticleMode.Rise,
          bright: 0.9,
          style: 1,
        });
      }
      this.checkT -= dt;
      if (this.checkT <= 0) {
        this.checkT = 0.4;
        try {
          const position = this.cap.position;
          for (const [ox, oy, oz] of [
            [0, 0.6, 0],
            [1.2, 0.3, 0],
            [-1.2, 0.3, 0],
            [0, 0.3, 1.2],
            [0, 0.3, -1.2],
          ])
            if (
              d.ctx.paint.sample(_tmp.set(position.x + ox, position.y + oy, position.z + oz), _paintSample).green > 0.3
            ) {
              this.wake();
              break;
            }
        } catch {}
      }
    }
  }
}
export class GloomVeil {
  d;
  mesh;
  mat;
  collider;
  openT = -1;
  pos;
  get open() {
    return this.openT >= 0;
  }
  constructor(d2) {
    this.d = d2;
    const at = polyAt(d2.build.polys.T5, 0.42);
    const yaw = Math.atan2(at.tan.x, at.tan.z);
    this.pos = new Vector3(at.p.x, at.floor + 1.8, at.p.z);
    this.mat = makeVeilMaterial(d2.ctx.globals);
    this.mesh = new Mesh(new CircleGeometry(3.9, 48), this.mat);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = yaw;
    this.mesh.name = 'glowcap-veil';
    this.mesh.renderOrder = 7;
    d2.root.add(this.mesh);
    this.collider = addBoxCollider(d2, this.pos, 3.8, 3.4, 0.3, yaw);
  }
  lift(instant = false) {
    if (this.openT >= 0) return;
    this.openT = instant ? 99 : 0;
    removeCollider(this.d, this.collider);
    this.collider = null;
    if (instant) {
      this.mesh.visible = false;
      return;
    }
    this.d.play('barrier-down', this.pos, 1);
    const particles = this.d.particles;
    if (particles)
      for (let i = 0; i < 60; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.random() * 3.5;
        particles.spawn({
          x: this.pos.x + Math.cos(ang) * rad * 0.3,
          y: this.pos.y + Math.sin(ang) * rad,
          z: this.pos.z + Math.cos(ang) * rad * 0.7,
          vx: (Math.random() - 0.5) * 2,
          vy: 0.5 + Math.random() * 1.5,
          vz: (Math.random() - 0.5) * 2,
          color: new Color(0.6, 0.45, 1),
          size: 0.1 + Math.random() * 0.12,
          life: 1 + Math.random(),
          drag: 1.2,
          gravity: 0.3,
          mode: ParticleMode.Ballistic,
          bright: 2,
        });
      }
  }
  update(dt) {
    if (this.openT < 0 || this.openT >= 99) return;
    this.openT += dt;
    const k = clamp(this.openT / 2.2, 0, 1);
    this.mat.uniforms.uVeil.value = 1 - k;
    this.mat.uniforms.uBreak.value = Math.sin(Math.min(1, this.openT / 0.5) * Math.PI) * 0.8;
    if (k >= 1) {
      this.openT = 99;
      this.mesh.visible = false;
    }
  }
}
export class ExitPortal {
  d;
  pos;
  card;
  beam;
  beamMat;
  cardMat;
  k;
  active;
  src = null;
  constructor(d2, pos, facing, opts) {
    this.d = d2;
    this.pos = pos;
    this.active = opts.active;
    this.k = +!!opts.active;
    const warm = new Color(1, 0.86, 0.62);
    this.cardMat = makeGlowCardMaterial(d2.ctx, warm, 1.6);
    this.card = new Mesh(new PlaneGeometry(6.5, 6.5), this.cardMat);
    this.card.position
      .copy(pos)
      .add(new Vector3(0, 1.8, 0))
      .addScaledVector(facing, -0.6);
    this.card.lookAt(this.card.position.clone().add(facing));
    this.card.renderOrder = 6;
    this.card.name = 'glowcap-portal';
    d2.root.add(this.card);
    if (opts.beam) {
      this.beamMat = makeBeamMaterial(d2.ctx, new Color(1, 0.88, 0.6));
      const cone = new CylinderGeometry(1.2, 2.1, 9, 24, 1, true);
      cone.translate(0, 4.5, 0);
      this.beam = new Mesh(cone, this.beamMat);
      this.beam.position.copy(pos).add(new Vector3(0, -0.2, 0));
      this.beam.renderOrder = 6;
      d2.root.add(this.beam);
    } else {
      this.beam = null;
      this.beamMat = null;
    }
    this.setK(this.k);
  }
  activate() {
    this.active = true;
  }
  setK(k) {
    this.card.visible = k > 0.01;
    this.cardMat.uniforms.uI.value = 1.6 * k;
    if (this.beam && this.beamMat) {
      this.beam.visible = k > 0.01;
      this.beamMat.uniforms.uI.value = 0.9 * k;
    }
    if (k > 0.01 && !this.src)
      this.src = this.d.glow.add(
        'static',
        this.pos.clone().add(new Vector3(0, 1.8, 0)),
        9,
        new Color(1, 0.85, 0.6),
        1.1,
        {
          i: 0,
        },
      );
    if (this.src) this.src.target = 1.1 * k;
  }
  update(dt, heroPos) {
    const goal = +!!this.active;
    if (Math.abs(this.k - goal) > 0.001) {
      this.k += (goal - this.k) * (1 - Math.exp(-1.5 * dt));
      this.setK(this.k);
    }
    if (!this.active || !heroPos || this.k < 0.6) return false;
    const dx = heroPos.x - this.pos.x;
    const dz = heroPos.z - this.pos.z;
    const dy = heroPos.y - this.pos.y;
    return dx * dx + dz * dz < 4.41 && Math.abs(dy) < 2.5;
  }
}
export class RootGate {
  d;
  mesh;
  collider;
  t = -1;
  constructor(d2) {
    this.d = d2;
    const at = polyAt(d2.build.polys.shortcut, 0.38);
    const center = new Vector3(at.p.x, at.floor + 1.8, at.p.z);
    const geo = buildRoots(center, at.tan, 2.8, 12345);
    geo.translate(-center.x, -center.y, -center.z);
    this.mesh = new Mesh(geo, d2.stone);
    this.mesh.position.copy(center);
    this.mesh.name = 'glowcap-roots';
    d2.root.add(this.mesh);
    this.collider = addBoxCollider(d2, center, 3.2, 3, 0.7, Math.atan2(at.tan.x, at.tan.z), 'wood');
  }
  retract(instant = false) {
    if (!(this.t >= 0)) {
      this.t = instant ? 99 : 0;
      removeCollider(this.d, this.collider);
      this.collider = null;
      if (instant) this.mesh.visible = false;
      else this.d.play('bramble-burn', this.mesh.position, 0.5);
    }
  }
  update(dt) {
    if (this.t < 0 || this.t >= 99) return;
    this.t += dt;
    const k = smoothstep(0, 2.2, this.t);
    this.mesh.scale.set(1 + k * 0.4, 1 - k * 0.97, 1 - k * 0.5);
    this.mesh.rotation.x = k * 0.3;
    if (k >= 1) {
      this.t = 99;
      this.mesh.visible = false;
    }
  }
}
