/**
 * The reward chest that appears in the arena once Greymaw is beaten: a wood and gold mesh with glowing gems and a hinged lid, its beam of light and rays, and its collider.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  MathUtils,
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
import { colorize, mergeStatic } from './geometry.js';
import { TAU } from './math.js';
const CHEST_WOOD = 10774586;
const CHEST_WOOD_DARK = 7226406;
const CHEST_METAL = 15251018;
const CHEST_METAL_DARK = 11566884;
const CHEST_INSIDE = 2759184;
const MAT_WOOD = 0;
const MAT_METAL = 1;
const MAT_GLOW = 2;
const MAT_SEAM = 3;
const MAT_INSIDE = 4;
const CHEST_W = 2.1;
const CHEST_D = 1.35;
const CHEST_H = 1;
const LID_R = 0.68;
function chestPart(geometry, hex, mat, matrix) {
  if (matrix) geometry.applyMatrix4(matrix);
  if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
  return colorize(geometry.index ? geometry.toNonIndexed() : geometry, hex, {
    aGlow: mat,
  });
}
const chestTrs = (x, y, z, rx = 0, ry = 0, rz = 0, scale = 1) =>
  new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz, 'YXZ')),
    new Vector3(scale, scale, scale),
  );
function roundedBox(w, h, d, radius) {
  const geometry = new BoxGeometry(w, h, d, 6, 4, 4);
  const position = geometry.getAttribute('position');
  const p = new Vector3();
  const hx = w / 2 - radius;
  const hy = h / 2 - radius;
  const hz = d / 2 - radius;
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i);
    const core = new Vector3(
      MathUtils.clamp(p.x, -hx, hx),
      MathUtils.clamp(p.y, -hy, hy),
      MathUtils.clamp(p.z, -hz, hz),
    );
    const offset = p.clone().sub(core);
    if (offset.lengthSq() > 1e-8) offset.normalize().multiplyScalar(radius);
    p.copy(core).add(offset);
    position.setXYZ(i, p.x, p.y, p.z);
  }
  geometry.computeVertexNormals();
  return geometry;
}
function gemGeometry(size) {
  const geometry = new OctahedronGeometry(size, 0);
  geometry.scale(1, 1.25, 0.45);
  return geometry;
}
export class BossChest {
  ctx;
  position;
  group = new Group();
  lid = new Group();
  uni = {
    uSeam: {
      value: 0.35,
    },
    uOpen: {
      value: 0,
    },
  };
  beam;
  beamUni;
  rays;
  raysUni;
  collider = null;
  lidAngle = 0;
  facing;
  constructor(ctx, position, facing) {
    this.ctx = ctx;
    this.position = position;
    this.facing = facing;
    const globals = ctx.globals;
    const material = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.62,
      metalness: 0,
    });
    material.name = 'boss-chest';
    const uni = this.uni;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, globals, uni);
      shader.vertexShader = shader.vertexShader.replace(
        'void main() {',
        `attribute float aGlow;
varying float vGlow;
varying vec3 vCp;
void main() {
vGlow = aGlow;
vCp = position;`,
      );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          'void main() {',
          `#include <wb_common>
uniform float uSeam;
uniform float uOpen;
varying float vGlow;
varying vec3 vCp;
void main() {`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float chMetal = 0.0;
          vec3 chEmit = vec3(0.0);
          {
            float g = vGlow;
            if (g < 0.5) {
              // planks + grain + carved scroll grooves
              float plank = abs(fract(vCp.y * 3.2 + vCp.x * 0.02) - 0.5);
              float grain = wbNoise3(vec3(vCp.x * 26.0, vCp.y * 2.5, vCp.z * 26.0));
              diffuseColor.rgb *= 0.78 + 0.28 * grain;
              diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.05, 0.5 - plank)) * 0.4;
              float scroll = abs(sin(vCp.x * 9.0 + sin(vCp.y * 12.0) * 1.3));
              diffuseColor.rgb *= 1.0 - (1.0 - smoothstep(0.0, 0.08, scroll)) * 0.18;
            } else if (g < 1.5) {
              chMetal = 1.0;
              float n = wbNoise3(vCp * 14.0);
              diffuseColor.rgb *= 0.85 + 0.3 * n;
            } else if (g < 2.5) {
              chEmit += diffuseColor.rgb * (0.9 + 0.5 * sin(uTime * 2.3 + vCp.x * 4.0)) * (0.6 + uOpen * 1.2);
            } else if (g < 3.5) {
              chEmit += vec3(1.0, 0.78, 0.35) * (uSeam * (1.2 + 0.4 * sin(uTime * 3.0)) + uOpen * 3.0);
            } else {
              // interior / lid underside: dark wood lit by the treasure's gold glow
              float grain = wbNoise3(vec3(vCp.x * 20.0, vCp.y * 3.0, vCp.z * 20.0));
              diffuseColor.rgb = mix(vec3(0.16, 0.1, 0.06), vec3(0.3, 0.2, 0.1), grain);
              chEmit += vec3(1.0, 0.72, 0.32) * uOpen * (0.35 + 0.25 * grain);
            }
          }`,
        )
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
totalEmissiveRadiance += chEmit;`,
        )
        .replace(
          '#include <opaque_fragment>',
          `{ vec3 chV = normalize(vViewPosition); vec3 chN = normalize(normal);
             float fr = pow(1.0 - clamp(dot(chN, chV), 0.0, 1.0), 3.0);
             outgoingLight += (uSkyColor * 0.35 + uSunColor * 0.25) * fr * (0.4 + chMetal); }
           #include <opaque_fragment>`,
        );
    };
    material.customProgramCacheKey = () => 'wb-boss-chest-v1';
    const baseParts = [];
    baseParts.push(chestPart(roundedBox(CHEST_W, CHEST_H, CHEST_D, 0.07), CHEST_WOOD, MAT_WOOD, chestTrs(0, 0.62, 0)));
    baseParts.push(
      chestPart(
        new BoxGeometry(1.8800000000000001, 0.04, 1.1300000000000001),
        CHEST_INSIDE,
        MAT_INSIDE,
        chestTrs(0, 1.1, 0),
      ),
    );
    baseParts.push(
      chestPart(roundedBox(2.18, 0.12, 1.4300000000000002, 0.03), CHEST_METAL, MAT_METAL, chestTrs(0, 1.08, 0)),
    );
    baseParts.push(
      chestPart(roundedBox(2.2, 0.14, 1.4500000000000002, 0.03), CHEST_METAL_DARK, MAT_METAL, chestTrs(0, 0.18, 0)),
    );
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        baseParts.push(
          chestPart(
            roundedBox(0.16, 1.08, 0.16, 0.03),
            CHEST_METAL,
            MAT_METAL,
            chestTrs((CHEST_W / 2) * sx, 0.62, (CHEST_D / 2) * sz),
          ),
        );
        baseParts.push(
          chestPart(
            new SphereGeometry(0.13, 10, 8),
            CHEST_METAL_DARK,
            MAT_METAL,
            chestTrs(sx * (CHEST_W / 2 - 0.12), 0.1, sz * (CHEST_D / 2 - 0.1)),
          ),
        );
      }
    for (const x of [-0.55, 0.55])
      baseParts.push(
        chestPart(
          new BoxGeometry(0.12, CHEST_H, 1.4100000000000001),
          CHEST_METAL_DARK,
          MAT_METAL,
          chestTrs(x, 0.62, 0),
        ),
      );
    baseParts.push(
      chestPart(roundedBox(0.42, 0.5, 0.08, 0.03), CHEST_METAL, MAT_METAL, chestTrs(0, 0.88, 0.7150000000000001)),
    );
    baseParts.push(
      chestPart(new CylinderGeometry(0.05, 0.05, 0.04, 10), 16773312, MAT_SEAM, chestTrs(0, 0.9, 0.765, Math.PI / 2)),
    );
    COLORS.forEach((color, i) => {
      const x = [-0.82, -0.3, 0.3, 0.82][i];
      if (Math.abs(x) < 0.4)
        baseParts.push(
          chestPart(
            gemGeometry(0.1),
            PALETTE[color].hex,
            MAT_GLOW,
            chestTrs(x * 0.95 + (x < 0 ? -0.05 : 0.05), 0.5, 0.7250000000000001),
          ),
        );
      else
        baseParts.push(
          chestPart(gemGeometry(0.13), PALETTE[color].hex, MAT_GLOW, chestTrs(x, 0.55, 0.7250000000000001)),
        );
    });
    for (const side of [-1, 1]) {
      const ring = new TorusGeometry(0.16, 0.035, 6, 14);
      baseParts.push(chestPart(ring, CHEST_METAL, MAT_METAL, chestTrs(side * 1.12, CHEST_H * 0.65, 0, 0, Math.PI / 2)));
    }
    baseParts.push(chestPart(new BoxGeometry(2.12, 0.03, 1.37), 16769696, MAT_SEAM, chestTrs(0, 1.155, 0)));
    const baseMesh = new Mesh(mergeStatic(baseParts), material);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    baseMesh.name = 'boss-chest-base';
    this.group.add(baseMesh);
    const lidParts = [];
    const dome = new CylinderGeometry(LID_R, LID_R, CHEST_W, 24, 1, false, 0, Math.PI);
    lidParts.push(chestPart(dome, CHEST_WOOD_DARK, MAT_WOOD, chestTrs(0, 0, CHEST_D / 2, 0, 0, Math.PI / 2)));
    lidParts.push(
      chestPart(
        new BoxGeometry(2.0500000000000003, 0.05, 1.3),
        CHEST_INSIDE,
        MAT_INSIDE,
        chestTrs(0, 0.02, CHEST_D / 2),
      ),
    );
    for (const x of [-0.95, -0.55, 0, 0.55, 0.95]) {
      const band = new TorusGeometry(0.7000000000000001, x === 0 ? 0.06 : 0.045, 6, 24, Math.PI);
      lidParts.push(
        chestPart(
          band,
          x === 0 ? CHEST_METAL : CHEST_METAL_DARK,
          MAT_METAL,
          chestTrs((CHEST_W / 2) * x, 0, CHEST_D / 2, 0, Math.PI / 2, 0),
        ),
      );
    }
    lidParts.push(chestPart(new SphereGeometry(0.16, 14, 10), 16773572, MAT_GLOW, chestTrs(0, LID_R * 0.72, 1.151)));
    COLORS.forEach((color, i) => {
      const x = (i - 1.5) * 0.46;
      lidParts.push(
        chestPart(
          gemGeometry(0.09),
          PALETTE[color].hex,
          MAT_GLOW,
          chestTrs(x, 0.7000000000000001, CHEST_D / 2, -Math.PI / 2),
        ),
      );
    });
    const lidMesh = new Mesh(mergeStatic(lidParts), material);
    lidMesh.castShadow = true;
    lidMesh.name = 'boss-chest-lid';
    this.lid.add(lidMesh);
    this.lid.position.set(0, 1.16, -1.35 / 2);
    this.group.add(this.lid);
    this.beamUni = {
      ...globals,
      uBeam: {
        value: 0,
      },
    };
    const beamGeo = new CylinderGeometry(1.7, 2.4, 70, 32, 1, true);
    beamGeo.translate(0, 35, 0);
    this.beam = new Mesh(
      beamGeo,
      new ShaderMaterial({
        uniforms: this.beamUni,
        vertexShader: `
          varying vec2 vUv;
          varying vec3 vN;
          varying vec3 vWp;
          void main() {
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWp = wp.xyz;
            vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: `
          #include <wb_common>
          uniform float uBeam;
          varying vec2 vUv;
          varying vec3 vN;
          varying vec3 vWp;
          void main() {
            vec3 V = normalize(uCameraPos - vWp);
            float edge = pow(clamp(1.0 - abs(dot(normalize(vec3(vN.x, 0.0, vN.z) + vec3(1e-4, 0.0, 0.0)), normalize(vec3(V.x, 0.0, V.z) + vec3(0.0, 0.0, 1e-4)))), 0.0, 1.0), 1.5);
            float core = 1.0 - edge;
            float motes = smoothstep(0.75, 0.95, wbNoise2(vec2(vUv.x * 30.0, vUv.y * 40.0 - uTime * 1.5)));
            float fall = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
            float a = (core * 0.35 + motes * 0.5) * fall * uBeam;
            gl_FragColor = vec4(vec3(1.0, 0.88, 0.6) * a * 1.6, a);
          }`,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    );
    this.beam.name = 'boss-chest-beam';
    this.beam.visible = false;
    this.beam.frustumCulled = false;
    this.raysUni = {
      ...globals,
      uRays: {
        value: 0,
      },
    };
    const rayGeos = [];
    for (let i = 0; i < 14; i++) {
      const yaw = (i / 14) * TAU;
      const ray = new PlaneGeometry(0.55 + (i % 3) * 0.25, 7 + (i % 4) * 1.5, 1, 1);
      ray.translate(0, (7 + (i % 4) * 1.5) / 2, 0);
      const seed = new Float32Array(4).fill(i / 14);
      ray.setAttribute('aSeed', new BufferAttribute(seed, 1));
      ray.applyMatrix4(chestTrs(0, 0, 0, 0.35 + (i % 2) * 0.25, yaw, 0));
      rayGeos.push(ray.toNonIndexed());
    }
    this.rays = new Mesh(
      mergeStatic(rayGeos),
      new ShaderMaterial({
        uniforms: this.raysUni,
        vertexShader: `
          attribute float aSeed;
          varying vec2 vUv;
          varying float vSeed;
          void main() {
            vUv = uv;
            vSeed = aSeed;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          #include <wb_common>
          uniform float uRays;
          varying vec2 vUv;
          varying float vSeed;
          void main() {
            float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
            float along = (1.0 - vUv.y) * smoothstep(0.0, 0.08, vUv.y);
            float flick = 0.7 + 0.3 * sin(uTime * (3.0 + vSeed * 5.0) + vSeed * 30.0);
            float a = across * across * along * flick * uRays;
            gl_FragColor = vec4(vec3(1.0, 0.85, 0.5) * a * 1.4, a);
          }`,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: AdditiveBlending,
      }),
    );
    this.rays.name = 'boss-chest-rays';
    this.rays.visible = false;
    this.rays.position.set(0, 1.15, 0);
    this.group.add(this.rays);
    this.group.name = 'boss-chest';
    this.group.position.copy(position);
    this.group.rotation.y = facing;
    this.group.visible = false;
    ctx.scene.add(this.group, this.beam);
    this.beam.position.set(position.x, position.y, position.z);
  }
  standPoint(out, dist = 2.1) {
    return out.set(
      this.position.x + Math.sin(this.facing) * dist,
      this.position.y,
      this.position.z + Math.cos(this.facing) * dist,
    );
  }
  setVisible(visible) {
    this.group.visible = visible;
  }
  setBeam(amount) {
    this.beamUni.uBeam.value = amount;
    this.beam.visible = amount > 0.002;
  }
  setHeight(y, spin) {
    this.group.position.set(this.position.x, y, this.position.z);
    this.group.rotation.y = this.facing + spin;
  }
  setOpen(lidAngle, glow, seam) {
    this.lidAngle = lidAngle;
    this.lid.rotation.x = -lidAngle;
    this.uni.uOpen.value = MathUtils.clamp(glow, 0, 1);
    this.uni.uSeam.value = seam;
    this.raysUni.uRays.value = glow;
    this.rays.visible = glow > 0.002;
    this.rays.rotation.y = (this.ctx.time?.elapsed ?? 0) * 0.15;
  }
  addCollider() {
    if (!this.collider)
      try {
        const rot = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), this.facing);
        const desc = this.ctx.RAPIER.ColliderDesc.cuboid(1.1, 0.85, 0.7250000000000001)
          .setTranslation(this.position.x, this.position.y + 0.85, this.position.z)
          .setRotation({
            x: rot.x,
            y: rot.y,
            z: rot.z,
            w: rot.w,
          })
          .setCollisionGroups(COLLISION_GROUPS.static);
        this.collider = this.ctx.physics.createCollider(desc);
        this.ctx.colliders.register(this.collider, {
          kind: 'structure',
          surface: 'wood',
          object: this.group,
          data: {
            chest: true,
          },
        });
      } catch (err) {
        console.warn('[boss] chest collider failed', err);
      }
  }
  get beamMesh() {
    return this.beam;
  }
  get lidTop() {
    return new Vector3(this.position.x, this.position.y + CHEST_H + 0.5, this.position.z);
  }
}
