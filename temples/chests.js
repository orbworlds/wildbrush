/**
 * Temple chests (small, key and grand): parts built per style, lids hinged in the shader, the open prompt and the opening cinematic with rays and bursts, and the rewards (an item, a full ink cache, hearts or a Small Key).
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { COLLISION_GROUPS, COLORS, PALETTE } from '../core/config.js';
import { clamp, smoothstep } from '../core/math.js';
import { mergeGeometries } from '../shared/util.js';
import { removeCollider, sfx } from './props.js';
const MAX_CHESTS = 6;
const TWO_PI = Math.PI * 2;
const MAT_WOOD = 0;
const MAT_METAL = 1;
const MAT_GLOW = 2;
const MAT_SEAM = 3;
const MAT_VELVET = 4;
const CHEST_SIZES = {
  small: {
    W: 1.25,
    D: 0.82,
    H: 0.62,
  },
  key: {
    W: 1.35,
    D: 0.9,
    H: 0.7,
  },
  grand: {
    W: 2.3,
    D: 1.45,
    H: 1.05,
  },
};
function chestBox(w, h, depth, radius) {
  const geometry = new BoxGeometry(w, h, depth, 4, 3, 3);
  const position = geometry.getAttribute('position');
  const p = new Vector3();
  const core = new Vector3();
  const hx = w / 2 - radius;
  const hy = h / 2 - radius;
  const hz = depth / 2 - radius;
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    core.set(clamp(p.x, -hx, hx), clamp(p.y, -hy, hy), clamp(p.z, -hz, hz));
    const offset = p.clone().sub(core);
    if (offset.lengthSq() > 1e-8) offset.normalize().multiplyScalar(radius);
    p.copy(core).add(offset);
    position.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}
const trs = (x, y, z, rx = 0, ry = 0, rz = 0) =>
  new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'YXZ')),
    new Vector3(1, 1, 1),
  );
function chestPart(geometry, hex, mat, lid, matrix) {
  if (matrix) geometry.applyMatrix4(matrix);
  if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const count = geo.getAttribute('position').count;
  const color = new Color(hex);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.setAttribute('aGlow', new BufferAttribute(new Float32Array(count).fill(mat), 1));
  geo.setAttribute('aLid', new BufferAttribute(new Float32Array(count).fill(lid), 1));
  return geo;
}
function gemGeometry(size) {
  const geometry = new OctahedronGeometry(size, 0);
  geometry.scale(1, 1.25, 0.45);
  return geometry;
}
function chestParts(kind, style) {
  const { W: w, D: depth, H: h } = CHEST_SIZES[kind];
  const lidR = depth / 2;
  const parts = [];
  const bandH = (w / 2.1) * 0.12;
  parts.push(chestPart(chestBox(w, h, depth, 0.06), style.wood, MAT_WOOD, 0, trs(0, h / 2 + 0.08, 0)));
  parts.push(chestPart(new BoxGeometry(w - 0.2, 0.04, depth - 0.2), 2759184, MAT_VELVET, 0, trs(0, h + 0.06, 0)));
  parts.push(chestPart(chestBox(w + 0.07, bandH, depth + 0.07, 0.03), style.metal, MAT_METAL, 0, trs(0, h + 0.05, 0)));
  parts.push(
    chestPart(chestBox(w + 0.09, bandH * 1.1, depth + 0.09, 0.03), style.metalDark, MAT_METAL, 0, trs(0, 0.12, 0)),
  );
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      parts.push(
        chestPart(
          chestBox(0.13, h + 0.06, 0.13, 0.03),
          style.metal,
          MAT_METAL,
          0,
          trs((w / 2) * sx, h / 2 + 0.08, (depth / 2) * sz),
        ),
      );
      if (kind !== 'small')
        parts.push(
          chestPart(
            new SphereGeometry((w / 2) * 0.1, 8, 6),
            style.metalDark,
            MAT_METAL,
            0,
            trs(sx * (w / 2 - 0.1), 0.07, sz * (depth / 2 - 0.08)),
          ),
        );
    }
  for (const fx of [-0.28, 0.28])
    parts.push(
      chestPart(new BoxGeometry(0.1, h, depth + 0.05), style.metalDark, MAT_METAL, 0, trs(fx * w, h / 2 + 0.08, 0)),
    );
  parts.push(
    chestPart(
      chestBox((w / 1.6) * 0.34, (h / 0.8) * 0.4, 0.07, 0.025),
      style.metal,
      MAT_METAL,
      0,
      trs(0, h - 0.1, depth / 2 + 0.03),
    ),
  );
  parts.push(
    chestPart(
      new CylinderGeometry(0.04, 0.04, 0.04, 8),
      16773312,
      MAT_SEAM,
      0,
      trs(0, h - 0.08, depth / 2 + 0.07, Math.PI / 2),
    ),
  );
  if (kind === 'grand')
    COLORS.forEach((color, i) => {
      const x = [-0.82, -0.3, 0.3, 0.82][i];
      parts.push(
        chestPart(
          gemGeometry(Math.abs(x) < 0.4 ? 0.1 : 0.13),
          PALETTE[color].hex,
          MAT_GLOW,
          0,
          trs(Math.abs(x) < 0.4 ? x * 1.1 : x, 0.52, depth / 2 + 0.05),
        ),
      );
    });
  else
    for (const side of [-1, 1])
      parts.push(
        chestPart(gemGeometry(0.09), style.gem, MAT_GLOW, 0, trs(side * w * 0.34, h * 0.55, depth / 2 + 0.04)),
      );
  parts.push(chestPart(new BoxGeometry(w + 0.01, 0.025, depth + 0.01), 16769696, MAT_SEAM, 0, trs(0, h + 0.105, 0)));
  const hingeY = h + 0.1;
  const hingeZ = -depth / 2;
  parts.push(
    chestPart(
      new CylinderGeometry(lidR, lidR, w, 20, 1, false, 0, Math.PI),
      style.woodDark,
      MAT_WOOD,
      1,
      trs(0, hingeY, hingeZ + depth / 2, 0, 0, Math.PI / 2),
    ),
  );
  parts.push(
    chestPart(
      new BoxGeometry(w - 0.05, 0.04, depth - 0.05),
      2759184,
      MAT_VELVET,
      1,
      trs(0, hingeY + 0.02, hingeZ + depth / 2),
    ),
  );
  const bands = kind === 'small' ? [-0.8, 0.8] : [-0.95, -0.5, 0, 0.5, 0.95];
  for (const fx of bands) {
    const strap = new TorusGeometry(lidR + 0.02, fx === 0 ? 0.05 : 0.038, 5, 18, Math.PI);
    parts.push(
      chestPart(
        strap,
        fx === 0 ? style.metal : style.metalDark,
        MAT_METAL,
        1,
        trs((w / 2) * fx, hingeY, hingeZ + depth / 2, 0, Math.PI / 2, 0),
      ),
    );
  }
  if (kind === 'grand') {
    parts.push(
      chestPart(
        new SphereGeometry(0.17, 12, 9),
        style.gem,
        MAT_GLOW,
        1,
        trs(0, hingeY + lidR * 0.72, hingeZ + depth / 2 + lidR * 0.7),
      ),
    );
    for (const side of [-1, 1])
      for (let i = 0; i < 3; i++) {
        const spike = new ConeGeometry(0.07, 0.55 - i * 0.1, 4);
        parts.push(
          chestPart(
            spike,
            style.metal,
            MAT_METAL,
            1,
            trs(
              side * (0.25 + i * 0.16),
              hingeY + lidR * 0.82,
              hingeZ + depth / 2 + lidR * 0.5,
              1.2,
              0,
              side * (0.9 + i * 0.25),
            ),
          ),
        );
      }
  } else if (kind === 'key')
    parts.push(
      chestPart(
        new TorusGeometry(0.11, 0.03, 5, 14),
        style.gem,
        MAT_GLOW,
        1,
        trs(0, hingeY + lidR * 0.7, hingeZ + depth / 2 + lidR * 0.72, -0.8, 0, 0),
      ),
    );
  return parts;
}
const CHEST_COMMON_VERTEX = `
#include <wb_common>
attribute float aGlow;
attribute float aLid;
attribute float aChest;
attribute vec4 aHinge;
attribute vec3 aBase;
uniform float uLid[${MAX_CHESTS}];
uniform float uOpen[${MAX_CHESTS}];
uniform float uSeam[${MAX_CHESTS}];
uniform float uShow[${MAX_CHESTS}];
varying float vGlow;
varying vec3 vCp;
varying float vOpen;
varying float vSeam;
vec3 chRot(vec3 v, vec3 ax, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(ax, v) * s + ax * dot(ax, v) * (1.0 - c);
}
`;
const CHEST_NORMAL_VERTEX = `
int chI = int(aChest + 0.5);
float chLid = 0.0, chOpen = 0.0, chSeam = 0.0, chShow = 1.0;
for (int i = 0; i < ${MAX_CHESTS}; i++) { if (i == chI) { chLid = uLid[i]; chOpen = uOpen[i]; chSeam = uSeam[i]; chShow = uShow[i]; } }
vec3 chAx = vec3(cos(aHinge.w), 0.0, -sin(aHinge.w));
if (aLid > 0.5) objectNormal = chRot(objectNormal, chAx, -chLid);
`;
const CHEST_BEGIN_VERTEX = `
if (aLid > 0.5) transformed = aHinge.xyz + chRot(transformed - aHinge.xyz, chAx, -chLid);
{
  float sh = clamp(chShow, 0.0, 1.0);
  float e = sh * sh * (3.0 - 2.0 * sh);
  vec3 rel = transformed - aBase;
  float spin = (1.0 - e) * 6.0;
  rel = chRot(rel, vec3(0.0, 1.0, 0.0), spin);
  transformed = aBase + rel * max(e, 0.001) + vec3(0.0, (1.0 - e) * 3.0, 0.0);
}
vGlow = aGlow;
vOpen = chOpen;
vSeam = chSeam;
vCp = chRot(position - aHinge.xyz, vec3(0.0, 1.0, 0.0), -aHinge.w);
`;
const CHEST_COMMON_FRAGMENT = `
#include <wb_common>
varying float vGlow;
varying vec3 vCp;
varying float vOpen;
varying float vSeam;
`;
const CHEST_COLOR_FRAGMENT = `
float chMetal = 0.0;
vec3 chEmit = vec3(0.0);
{
  float g = vGlow;
  if (g < 0.5) {
    float plank = abs(fract(vCp.y * 3.4 + vCp.x * 0.02) - 0.5);
    float grain = wbNoise3(vec3(vCp.x * 26.0, vCp.y * 2.5, vCp.z * 26.0));
    diffuseColor.rgb *= 0.8 + 0.26 * grain;
    diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.05, 0.5 - plank)) * 0.35;
  } else if (g < 1.5) {
    chMetal = 1.0;
    diffuseColor.rgb *= 0.85 + 0.3 * wbNoise3(vCp * 14.0);
  } else if (g < 2.5) {
    chEmit += diffuseColor.rgb * (0.9 + 0.5 * sin(uTime * 2.3 + vCp.x * 4.0)) * (0.7 + vOpen * 1.2);
  } else if (g < 3.5) {
    chEmit += vec3(1.0, 0.8, 0.4) * (vSeam * (1.1 + 0.4 * sin(uTime * 3.0)) + vOpen * 3.0);
  } else {
    float soft = wbNoise3(vCp * 4.0);
    diffuseColor.rgb = mix(vec3(0.22, 0.08, 0.12), vec3(0.34, 0.14, 0.18), soft);
    chEmit += vec3(1.0, 0.7, 0.4) * vOpen * (0.2 + 0.1 * soft);
  }
}
`;
const CHEST_RAYS_FRAGMENT = `
#include <wb_common>
uniform float uRays;
uniform vec3 uRayColor;
varying vec2 vUv;
varying float vSeed;
void main() {
  float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
  float along = (1.0 - vUv.y) * smoothstep(0.0, 0.08, vUv.y);
  float flick = 0.7 + 0.3 * sin(uTime * (3.0 + vSeed * 5.0) + vSeed * 30.0);
  float a = across * across * along * flick * uRays;
  gl_FragColor = vec4(uRayColor * a * 1.4, a);
}
`;
const _chestFwd = new Vector3();
const _chestSide = new Vector3();
export class TempleChests {
  ctx;
  particles;
  group = new Group();
  chests = [];
  uni = {
    uLid: {
      value: Array(MAX_CHESTS).fill(0),
    },
    uOpen: {
      value: Array(MAX_CHESTS).fill(0),
    },
    uSeam: {
      value: Array(MAX_CHESTS).fill(0.3),
    },
    uShow: {
      value: Array(MAX_CHESTS).fill(1),
    },
  };
  rays;
  rayUni;
  mode = 'idle';
  active = null;
  t = 0;
  fired = new Set();
  itemGiven = false;
  itemWait = 0;
  promptOn = null;
  shot = {
    position: new Vector3(),
    target: new Vector3(),
    blend: 0.7,
  };
  shotOn = false;
  controlLocked = false;
  keyMesh;
  onOpened = null;
  onKey = null;
  constructor(ctx, defs, style, particles, keyGeo, keyMat) {
    this.ctx = ctx;
    this.particles = particles;
    this.group.name = 'temple-chests';
    const parts = [];
    defs.slice(0, MAX_CHESTS).forEach((def, i) => {
      const size = CHEST_SIZES[def.kind];
      const quat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), def.facing);
      const matrix = new Matrix4().compose(def.pos, quat, new Vector3(1, 1, 1));
      const hinge = new Vector3(0, size.H + 0.1, -size.D / 2).applyQuaternion(quat).add(def.pos);
      for (const part of chestParts(def.kind, style)) {
        part.applyMatrix4(matrix);
        const count = part.getAttribute('position').count;
        part.setAttribute('aChest', new BufferAttribute(new Float32Array(count).fill(i), 1));
        const hinges = new Float32Array(count * 4);
        const bases = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          hinges.set([hinge.x, hinge.y, hinge.z, def.facing], i * 4);
          bases.set([def.pos.x, def.pos.y, def.pos.z], i * 3);
        }
        part.setAttribute('aHinge', new BufferAttribute(hinges, 4));
        part.setAttribute('aBase', new BufferAttribute(bases, 3));
        parts.push(part);
      }
      const chest = {
        def,
        index: i,
        lid: 0,
        open: 0,
        seam: def.kind === 'grand' ? 0.6 : 0.35,
        show: +!def.hidden,
        showing: false,
        opened: false,
        collider: null,
      };
      this.chests.push(chest);
      this.uni.uShow.value[i] = chest.show;
      if (!def.hidden) this.addCollider(chest);
    });
    const merged = mergeGeometries(parts);
    parts.forEach((part) => part.dispose());
    const globals = ctx.globals;
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      metalness: 0,
    });
    material.name = 'temple-chest';
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, globals, this.uni);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${CHEST_COMMON_VERTEX}`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>\n${CHEST_NORMAL_VERTEX}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n${CHEST_BEGIN_VERTEX}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${CHEST_COMMON_FRAGMENT}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${CHEST_COLOR_FRAGMENT}`)
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
metalnessFactor = chMetal * 0.85;`,
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.3, chMetal);`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
totalEmissiveRadiance += chEmit + diffuseColor.rgb * (0.22 + 0.2 * chMetal);`,
        )
        .replace(
          '#include <opaque_fragment>',
          `{ vec3 chV = normalize(vViewPosition); vec3 chN = normalize(normal);
             float fr = pow(1.0 - clamp(dot(chN, chV), 0.0, 1.0), 3.0);
             outgoingLight += uSkyColor * 0.3 * fr * (0.25 + chMetal * 0.75); }
           #include <opaque_fragment>`,
        );
    };
    material.customProgramCacheKey = () => 'wb-temple-chest-v1';
    const mesh = new Mesh(merged, material);
    mesh.name = 'temple-chests';
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    for (const chest of this.chests) this.uni.uSeam.value[chest.index] = chest.seam;
    this.rayUni = {
      ...globals,
      uRays: {
        value: 0,
      },
      uRayColor: {
        value: new Color(1, 0.85, 0.5),
      },
    };
    const rayGeos = [];
    for (let i = 0; i < 14; i++) {
      const yaw = (i / 14) * TWO_PI;
      const len = 6 + (i % 4) * 1.4;
      const geometry = new PlaneGeometry(0.5 + (i % 3) * 0.22, len, 1, 1);
      geometry.translate(0, len / 2, 0);
      geometry.setAttribute('aSeed', new BufferAttribute(new Float32Array(4).fill(i / 14), 1));
      geometry.applyMatrix4(trs(0, 0, 0, 0.35 + (i % 2) * 0.25, yaw, 0));
      rayGeos.push(geometry.toNonIndexed());
    }
    const rayGeometry = mergeGeometries(rayGeos);
    rayGeos.forEach((geo) => geo.dispose());
    this.rays = new Mesh(
      rayGeometry,
      new ShaderMaterial({
        uniforms: this.rayUni,
        vertexShader: `
          attribute float aSeed;
          varying vec2 vUv;
          varying float vSeed;
          void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: CHEST_RAYS_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    );
    this.rays.name = 'temple-chest-rays';
    this.rays.visible = false;
    this.rays.renderOrder = 5;
    this.group.add(this.rays);
    this.keyMesh = new Mesh(keyGeo, keyMat);
    this.keyMesh.visible = false;
    this.keyMesh.scale.setScalar(1.3);
    this.group.add(this.keyMesh);
  }
  addCollider(chest) {
    if (!chest.collider)
      try {
        const size = CHEST_SIZES[chest.def.kind];
        const quat = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), chest.def.facing);
        const desc = this.ctx.RAPIER.ColliderDesc.cuboid(size.W / 2 + 0.04, (size.H + 0.4) / 2, size.D / 2 + 0.04)
          .setTranslation(chest.def.pos.x, chest.def.pos.y + (size.H + 0.4) / 2, chest.def.pos.z)
          .setRotation({
            x: quat.x,
            y: quat.y,
            z: quat.z,
            w: quat.w,
          })
          .setCollisionGroups(COLLISION_GROUPS.static);
        chest.collider = this.ctx.physics.createCollider(desc);
        this.ctx.colliders.register(chest.collider, {
          kind: 'structure',
          surface: 'wood',
          object: this.group,
          data: {
            chest: true,
            temple: chest.def.id,
          },
        });
      } catch (err) {
        console.warn('[temples] chest collider failed', err);
      }
  }
  get(id) {
    return this.chests.find((chest) => chest.def.id === id);
  }
  appear(id, instant = false) {
    const chest = this.get(id);
    if (!(!chest || chest.show >= 1 || chest.showing)) {
      if (instant) {
        chest.show = 1;
        this.uni.uShow.value[chest.index] = 1;
        this.addCollider(chest);
        return;
      }
      chest.showing = true;
      sfx(this.ctx, 'chest-appear', chest.def.pos, 1);
    }
  }
  openInstant(id) {
    const chest = this.get(id);
    if (chest) {
      this.appear(id, true);
      chest.opened = true;
      chest.lid = 1.9;
      chest.open = 0.3;
      this.uni.uLid.value[chest.index] = chest.lid;
      this.uni.uOpen.value[chest.index] = chest.open;
    }
  }
  update(dt, realDt) {
    const ctx = this.ctx;
    for (const chest of this.chests) {
      if (chest.showing) {
        chest.show = Math.min(1, chest.show + realDt / 1.3);
        this.uni.uShow.value[chest.index] = chest.show;
        if (this.particles && Math.random() < 0.6) {
          const ang = Math.random() * TWO_PI;
          this.particles.spawn({
            x: chest.def.pos.x + Math.cos(ang) * 1.2,
            y: chest.def.pos.y + (1 - chest.show) * 3 + Math.random(),
            z: chest.def.pos.z + Math.sin(ang) * 1.2,
            vy: 1.2,
            color: new Color(1, 0.86, 0.5),
            size: 0.1,
            life: 0.8,
            bright: 2.6,
          });
        }
        if (chest.show >= 1) {
          chest.showing = false;
          this.addCollider(chest);
          this.burst(chest.def.pos.clone().add(new Vector3(0, 0.6, 0)), 30, 4);
        }
      }
      if (chest.opened) continue;
      const seamTarget = chest.def.kind === 'grand' ? 0.7 : 0.35;
      chest.seam += (seamTarget - chest.seam) * Math.min(1, dt * 2);
      this.uni.uSeam.value[chest.index] = chest.seam;
    }
    if (this.mode === 'opening') {
      this.stepOpening(realDt);
      return;
    }
    const state = ctx.player?.state;
    if (!state || state.dead) return this.setPrompt(null);
    let nearest = null;
    let nearestDist = Infinity;
    for (const chest of this.chests) {
      if (chest.opened || chest.show < 1) continue;
      const dx = state.position.x - chest.def.pos.x;
      const dz = state.position.z - chest.def.pos.z;
      const dy = state.position.y - chest.def.pos.y;
      if (Math.abs(dy) > 1.6) continue;
      const dist = Math.hypot(dx, dz);
      const fx = Math.sin(chest.def.facing);
      const fz = Math.cos(chest.def.facing);
      if (!((dx * fx + dz * fz) / Math.max(dist, 0.001) < -0.2))
        if (dist < CHEST_SIZES[chest.def.kind].W * 0.5 + 1.9 && dist < nearestDist) {
          nearestDist = dist;
          nearest = chest;
        }
    }
    if (!nearest || (state.mode !== 'ground' && state.mode !== 'slide') || state.itemHold) return this.setPrompt(null);
    this.setPrompt('open');
    if (ctx.input.pressed('interact')) this.begin(nearest);
  }
  setPrompt(kind) {
    if (kind !== this.promptOn) {
      this.promptOn = kind;
      try {
        if (kind === 'open') this.ctx.ui.showPrompt('temple-chest', 'Open', 'F');
        else this.ctx.ui.hidePrompt('temple-chest');
      } catch {}
    }
  }
  get prompting() {
    return this.promptOn !== null;
  }
  get busy() {
    return this.mode === 'opening';
  }
  begin(chest) {
    const ctx = this.ctx;
    this.mode = 'opening';
    this.active = chest;
    this.t = 0;
    this.fired.clear();
    this.itemGiven = false;
    this.itemWait = 0;
    this.setPrompt(null);
    try {
      ctx.player.setControlEnabled(false);
      this.controlLocked = true;
    } catch {}
    const size = CHEST_SIZES[chest.def.kind];
    const fwd = _chestFwd.set(Math.sin(chest.def.facing), 0, Math.cos(chest.def.facing));
    const stand = chest.def.pos.clone().addScaledVector(fwd, size.D / 2 + 0.95);
    stand.y = chest.def.pos.y + 0.05;
    try {
      ctx.player.teleport(stand, chest.def.facing + Math.PI);
    } catch {}
    if (chest.def.kind !== 'small') {
      const side = _chestSide.set(fwd.z, 0, -fwd.x);
      const zoom = chest.def.kind === 'grand' ? 1.25 : 0.95;
      this.shot.position
        .copy(chest.def.pos)
        .addScaledVector(fwd, 4.2 * zoom)
        .addScaledVector(side, 2.4 * zoom)
        .setY(chest.def.pos.y + 2.2 * zoom);
      this.shot.target.copy(chest.def.pos).setY(chest.def.pos.y + 0.9 * zoom);
      this.shot.blend = 0.7;
      try {
        ctx.player.setCinematic(this.shot);
        this.shotOn = true;
      } catch {}
    }
    this.rays.position.copy(chest.def.pos).add(new Vector3(0, size.H + 0.1, 0));
    this.rays.scale.setScalar(chest.def.kind === 'grand' ? 1.2 : chest.def.kind === 'key' ? 0.8 : 0.6);
  }
  once(key, t, at) {
    return t >= at && !this.fired.has(key) && (this.fired.add(key), true);
  }
  stepOpening(dt) {
    const chest = this.active;
    if (!chest) {
      this.mode = 'idle';
      return;
    }
    this.t += dt;
    const t = this.t;
    const big = chest.def.kind !== 'small';
    const scale = big ? 1 : 0.6;
    const creakAt = 0.45 * scale;
    const popAt = 0.95 * scale;
    let lid = 0;
    if (t > creakAt) lid = 0.14 * easeOut(clamp((t - creakAt) / 0.25, 0, 1));
    if (t > popAt) lid = 0.14 + 1.76 * easeOut(clamp((t - popAt) / 0.7, 0, 1));
    chest.lid = lid;
    chest.open = smoothstep(popAt - 0.4, popAt + 0.5, t);
    this.uni.uLid.value[chest.index] = lid;
    this.uni.uOpen.value[chest.index] = chest.open;
    const rays = chest.open * (1 - smoothstep(4.5, 6.5, t));
    this.rayUni.uRays.value = rays;
    this.rays.visible = rays > 0.002;
    this.rays.rotation.y = this.ctx.time.elapsed * 0.15;
    if (this.once('creak', t, creakAt)) sfx(this.ctx, 'chest-open', chest.def.pos, big ? 1 : 0.8);
    if (
      this.once('burst', t, popAt) &&
      (this.burst(
        chest.def.pos.clone().add(new Vector3(0, CHEST_SIZES[chest.def.kind].H + 0.5, 0)),
        big ? 50 : 24,
        big ? 5 : 3,
      ),
      'item' in chest.def.loot)
    )
      try {
        this.ctx.events.emit('chest:open', {
          position: chest.def.pos.clone(),
          item: chest.def.loot.item,
        });
      } catch {}
    if (this.shotOn) {
      const fwd = _chestFwd.set(Math.sin(chest.def.facing), 0, Math.cos(chest.def.facing));
      const side = _chestSide.set(fwd.z, 0, -fwd.x);
      const zoom = chest.def.kind === 'grand' ? 1.25 : 0.9;
      const goal = new Vector3()
        .copy(chest.def.pos)
        .addScaledVector(fwd, 3.7 * zoom)
        .addScaledVector(side, 2.1 * zoom)
        .setY(chest.def.pos.y + 2 * zoom);
      this.shot.position.lerp(goal, Math.min(1, dt * 1.5));
    }
    if ('key' in chest.def.loot && t > popAt) {
      const rise = clamp((t - popAt) / 1.6, 0, 1);
      const size = CHEST_SIZES[chest.def.kind];
      this.keyMesh.visible = rise < 1;
      this.keyMesh.position.copy(chest.def.pos).add(_chestFwd.set(0, size.H + 0.3 + easeOut(rise) * 1.4, 0));
      this.keyMesh.rotation.y = t * 5;
      if (this.particles && Math.random() < 0.7)
        this.particles.spawn({
          x: this.keyMesh.position.x,
          y: this.keyMesh.position.y,
          z: this.keyMesh.position.z,
          vx: Math.random() - 0.5,
          vy: 0.5,
          vz: Math.random() - 0.5,
          color: new Color(1, 0.85, 0.45),
          size: 0.08,
          life: 0.7,
          bright: 3,
        });
    }
    const giveAt = 'key' in chest.def.loot ? 2.7 : big ? 1.9 : 1.15;
    if (this.once('give', t, giveAt)) {
      this.itemGiven = true;
      this.itemWait = 0;
      this.keyMesh.visible = false;
      this.grant(chest);
    }
    if (this.itemGiven) {
      this.itemWait += dt;
      const itemHold = this.ctx.player?.state?.itemHold;
      const minWait = 'item' in chest.def.loot ? 1 : 0.3;
      if ((this.itemWait > minWait && !itemHold) || this.itemWait > 9) this.finish(chest);
    }
  }
  grant(chest) {
    const ctx = this.ctx;
    const loot = chest.def.loot;
    try {
      if ('item' in loot) ctx.player.giveItem(loot.item);
      else if ('ink' in loot) {
        for (const color of COLORS) ctx.paint.addInk(color, ctx.paint.inkMax ?? 100);
        const pos = chest.def.pos.clone().add(new Vector3(0, 1, 0));
        ctx.events.emit('content:ink-refill', {
          color: 'red',
          amount: ctx.paint.inkMax ?? 100,
          position: pos,
        });
        sfx(ctx, 'ink-refill', pos, 1);
        ctx.ui.toast('Painter’s Ink Cache', 'Every colour of ink is full');
      } else if ('hearts' in loot) {
        ctx.player.heal(loot.hearts);
        const pos = chest.def.pos.clone().add(new Vector3(0, 1, 0));
        ctx.events.emit('pickup', {
          kind: 'heart',
          position: pos,
          amount: loot.hearts,
        });
        sfx(ctx, 'pickup', pos, 1);
        ctx.ui.toast('Ember-warm Hearts', 'Your hearts are restored');
      } else if ('key' in loot) {
        sfx(ctx, 'secret', chest.def.pos, 0.8);
        this.onKey?.(chest.def);
      }
    } catch (err) {
      console.warn('[temples] chest reward failed', err);
    }
  }
  finish(chest) {
    chest.opened = true;
    this.mode = 'idle';
    this.active = null;
    this.rays.visible = false;
    this.rayUni.uRays.value = 0;
    this.keyMesh.visible = false;
    if (this.shotOn) {
      try {
        this.ctx.player.setCinematic(null);
      } catch {}
      this.shotOn = false;
    }
    if (this.controlLocked) {
      try {
        this.ctx.player.setControlEnabled(true);
      } catch {}
      this.controlLocked = false;
    }
    this.onOpened?.(chest.def);
  }
  burst(pos, count, power) {
    const particles = this.particles;
    if (!particles) return;
    const palette = COLORS.map((color) => new Color(PALETTE[color].hex));
    const gold = new Color(1, 0.85, 0.5);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * TWO_PI;
      const lift = 0.4 + Math.random() * 0.9;
      const speed = power * (0.4 + Math.random() * 0.6);
      particles.spawn({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vx: Math.cos(angle) * speed * 0.6,
        vy: speed * lift,
        vz: Math.sin(angle) * speed * 0.6,
        color: i % 3 == 0 ? gold : palette[i % palette.length],
        size: 0.12 + Math.random() * 0.14,
        life: 0.8 + Math.random() * 0.9,
        drag: 1.4,
        gravity: -3,
        bright: 2.2,
      });
    }
  }
  abort() {
    if (this.active) this.finish(this.active);
    this.setPrompt(null);
  }
  dispose() {
    this.abort();
    for (const chest of this.chests) removeCollider(this.ctx, chest.collider);
  }
}
function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}
