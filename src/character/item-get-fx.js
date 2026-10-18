/**
 * Item-get effects while the hero holds up a find: light rays behind it, the heart container crystal, the stamina vessel orb and the Sky Mantle that unfurls and swirls onto the hero, with reveal sparkles and absorb bursts.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  CustomBlending,
  DynamicDrawUsage,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  ShaderMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { COLORS, PALETTE } from '../core/config.js';
import { ITEM_HOLD, SKY_MANTLE } from '../shared/combat-defs.js';
import { roundedBox } from './body-mesh.js';
import { createCapeMaterial } from './cape.js';
import { RAINBOW_GLSL, rainbowUniform } from './chroma-brush.js';
import { AreaPrizes, isGearItem } from './prizes.js';
import { VfxType } from './vfx.js';
const VESSEL_ORB_VERTEX = `
  varying vec3 vN;
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const VESSEL_ORB_FRAGMENT = `
  #include <wb_common>
  uniform float uGlow;
  varying vec3 vN;
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = 1.0 - abs(dot(N, V));
    vec3 p = normalize(vLocal);
    // swirling wind-song ribbons inside the orb
    float a = atan(p.z, p.x);
    float sw = sin(a * 3.0 + p.y * 7.0 - uTime * 3.2) * 0.5 + 0.5;
    float sw2 = sin(a * 5.0 - p.y * 5.0 + uTime * 2.1 + 1.3) * 0.5 + 0.5;
    float n = wbNoise2(vec2(a * 2.0 + uTime * 0.6, p.y * 3.0 - uTime * 0.4));
    vec3 deep = vec3(0.03, 0.42, 0.2);
    vec3 mint = vec3(0.3, 1.0, 0.52);
    vec3 col = mix(deep, mint, 0.25 + 0.5 * sw * n + 0.35 * pow(sw2, 6.0));
    col += vec3(0.6, 1.0, 0.72) * pow(1.0 - fres, 4.0) * 0.45; // soft bright core
    col += vec3(0.35, 1.0, 0.55) * pow(fres, 1.5) * 1.3;      // glowing rim
    col *= 1.0 + uGlow * 0.6;
    float alpha = clamp(0.55 + 0.45 * pow(1.0 - fres, 1.5) + fres * 0.4, 0.0, 1.0);
    gl_FragColor = vec4(col * alpha, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const MANTLE_SWIRL_POINTS = 44;
const HEART_VERTEX = `
  #include <wb_common>
  varying vec3 vN;
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    vLocal = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const HEART_FRAGMENT = `
  #include <wb_common>
  ${RAINBOW_GLSL}
  uniform float uGlow;
  varying vec3 vN;
  varying vec3 vWorld;
  varying vec3 vLocal;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = 1.0 - abs(dot(N, V));
    float ndl = dot(N, normalize(uSunDir)) * 0.5 + 0.5;
    vec3 rose = vec3(1.0, 0.16, 0.26);
    // colour woven through the crystal: slow rainbow ribbons inside
    float sw = wbNoise2(vLocal.xy * 3.2 + vec2(uTime * 0.35, -uTime * 0.2));
    vec3 inner = wbRb(vLocal.x * 2.2 + vLocal.y * 1.6 + sw * 1.4 + uTime * 0.5);
    float veins = smoothstep(0.55, 0.9, sw);
    vec3 col = rose * (0.55 + 0.6 * ndl) + inner * veins * 0.9;
    col += rose * 0.55 * uGlow;
    col += mix(vec3(1.0, 0.75, 0.85), inner, 0.35) * pow(fres, 2.2) * 1.4;
    float spec = pow(max(dot(reflect(-V, N), normalize(uSunDir + vec3(0.0, 0.4, 0.0))), 0.0), 28.0);
    col += vec3(1.0) * spec * 1.2;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const ITEM_RAYS_VERTEX = `
  #include <wb_common>
  uniform vec3 uCenter;
  uniform float uSize;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 wp = uCenter + (right * position.x + up * position.y) * uSize;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;
const ITEM_RAYS_FRAGMENT = `
  #include <wb_common>
  ${RAINBOW_GLSL}
  uniform float uAlpha;
  uniform float uRainbow;
  uniform float uSpin;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x) + uSpin;
    float rays = pow(max(0.0, sin(a * 7.0)), 5.0) * 0.8 + pow(max(0.0, sin(a * 11.0 - uSpin * 3.0 + 1.3)), 9.0) * 0.6;
    rays *= 0.75 + 0.25 * wbNoise2(vec2(a * 3.0, r * 2.0 - uTime * 0.6));
    float fall = 1.0 - smoothstep(0.08, 1.0, r);
    float core = exp(-r * r * 22.0);
    float halo = exp(-r * r * 4.0) * 0.35;
    float v = rays * fall * fall + core * 1.1 + halo;
    vec3 warm = vec3(1.0, 0.93, 0.72);
    vec3 tint = wbRb((a / 6.2831) * 4.0 + uTime * 0.15);
    vec3 col = mix(warm, mix(warm, tint, 0.7), uRainbow * smoothstep(0.1, 0.6, r));
    float alpha = v * uAlpha;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(col * alpha, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
function heartGeometry() {
  const shape = new Shape();
  for (let i = 0; i <= 72; i++) {
    const angle = (i / 72) * Math.PI * 2;
    const x = 16 * Math.sin(angle) ** 3;
    const y = 13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle);
    if (i === 0) shape.moveTo(x / 17, y / 17);
    else shape.lineTo(x / 17, y / 17);
  }
  const geometry = new ExtrudeGeometry(shape, {
    depth: 0.12,
    bevelEnabled: true,
    bevelThickness: 0.26,
    bevelSize: 0.16,
    bevelSegments: 6,
    curveSegments: 48,
  });
  geometry.deleteAttribute('uv');
  geometry.computeBoundingBox();
  const boundingBox = geometry.boundingBox;
  geometry.translate(
    -(boundingBox.min.x + boundingBox.max.x) / 2,
    -(boundingBox.min.y + boundingBox.max.y) / 2,
    -(boundingBox.min.z + boundingBox.max.z) / 2,
  );
  geometry.scale(0.15, 0.15, 0.15);
  geometry.computeVertexNormals();
  return geometry;
}
const itemFxEaseOutBack = (t) => 1 + 3.2 * (t - 1) ** 3 + 2.2 * (t - 1) ** 2;
const itemFxClamp01 = (x) => Math.min(1, Math.max(0, x));
const itemFxEaseInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export class ItemGetFx {
  ctx;
  group = new Group();
  heart;
  drops = [];
  rays;
  heartU = {
    uGlow: {
      value: 0.4,
    },
  };
  rayU;
  itemPos = new Vector3();
  heartPos = new Vector3();
  haveHeartPos = false;
  rayA = 0;
  revealed = -1;
  sparkT = 0;
  lastItem = null;
  absorbT = -1;
  v = new Vector3();
  col = new Color();
  orb;
  orbU = {
    uGlow: {
      value: 0,
    },
  };
  orbPos = new Vector3();
  haveOrbPos = false;
  orbAbsorbT = -1;
  wispT = 0;
  capeMat;
  folded = new Group();
  swirl;
  swirlPos;
  swirlNrm;
  swirlA0 = 0;
  mantleBurst = false;
  sw = new Vector3();
  sw2 = new Vector3();
  mantleOnT = -1;
  prizes;
  slotOf = null;
  slot = new Vector3();
  handsMid = new Vector3();
  constructor(ctx) {
    this.ctx = ctx;
    this.group.name = 'item-get-fx';
    this.prizes = new AreaPrizes(ctx);
    this.group.add(this.prizes.group);
    this.orb = new Mesh(
      new SphereGeometry(0.135, 32, 20),
      new ShaderMaterial({
        uniforms: {
          ...ctx.globals,
          ...this.orbU,
        },
        vertexShader: VESSEL_ORB_VERTEX,
        fragmentShader: VESSEL_ORB_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
      }),
    );
    this.orb.frustumCulled = false;
    this.orb.visible = false;
    this.orb.renderOrder = 6;
    this.group.add(this.orb);
    this.capeMat = createCapeMaterial(ctx);
    for (let j = 0; j < 3; j++) {
      const width = 0.36 - j * 0.02;
      const depth = 0.25 - j * 0.012;
      const foldGeo = roundedBox(width, 0.05, depth, 0.022);
      const position = foldGeo.attributes.position;
      const uvs = new Float32Array(position.count * 2);
      for (let k = 0; k < position.count; k++) {
        uvs[k * 2] = 0.04 + 0.92 * (position.getX(k) / width + 0.5);
        uvs[k * 2 + 1] = 0.08 + 0.86 * (position.getZ(k) / depth + 0.5) * (j === 0 ? 1 : 0.8);
      }
      foldGeo.setAttribute('aUv', new BufferAttribute(uvs, 2));
      const fold = new Mesh(foldGeo, this.capeMat.material);
      fold.position.set(0, j * 0.043, 0);
      fold.rotation.y = (j - 1) * 0.06;
      fold.castShadow = true;
      this.folded.add(fold);
    }
    const clasp = new Mesh(
      new TorusGeometry(0.035, 0.01, 8, 20),
      new MeshStandardMaterial({
        color: 0xf2c14e,
        metalness: 0.6,
        roughness: 0.3,
      }),
    );
    clasp.rotation.x = Math.PI / 2;
    clasp.position.set(0, 0.113, 0);
    this.folded.add(clasp);
    this.folded.visible = false;
    this.group.add(this.folded);
    const swirlGeo = new BufferGeometry();
    this.swirlPos = new BufferAttribute(new Float32Array(264), 3);
    this.swirlPos.setUsage(DynamicDrawUsage);
    this.swirlNrm = new BufferAttribute(new Float32Array(264), 3);
    this.swirlNrm.setUsage(DynamicDrawUsage);
    const swirlUvs = new Float32Array(176);
    const indices = [];
    for (let i = 0; i < MANTLE_SWIRL_POINTS; i++) {
      for (let j = 0; j < 2; j++) {
        swirlUvs[(i * 2 + j) * 2] = 0.05 + j * 0.9;
        swirlUvs[(i * 2 + j) * 2 + 1] = 0.05 + (i / 43) * 0.9;
      }
      if (i < 43) {
        const v = i * 2;
        indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
    swirlGeo.setAttribute('position', this.swirlPos);
    swirlGeo.setAttribute('normal', this.swirlNrm);
    swirlGeo.setAttribute('aUv', new BufferAttribute(swirlUvs, 2));
    swirlGeo.setIndex(indices);
    this.swirl = new Mesh(swirlGeo, this.capeMat.material);
    this.swirl.frustumCulled = false;
    this.swirl.visible = false;
    this.swirl.castShadow = true;
    this.group.add(this.swirl);
    const rainbow = rainbowUniform();
    this.heart = new Mesh(
      heartGeometry(),
      new ShaderMaterial({
        uniforms: {
          ...ctx.globals,
          ...this.heartU,
          uRb: rainbow,
        },
        vertexShader: HEART_VERTEX,
        fragmentShader: HEART_FRAGMENT,
      }),
    );
    this.heart.frustumCulled = false;
    this.heart.visible = false;
    this.heart.castShadow = true;
    this.group.add(this.heart);
    const dropGeo = new SphereGeometry(0.03, 12, 8);
    for (const color of COLORS) {
      const drop = new Mesh(
        dropGeo,
        new MeshBasicMaterial({
          color: new Color(PALETTE[color].hex).multiplyScalar(1.6),
          toneMapped: true,
        }),
      );
      drop.visible = false;
      drop.frustumCulled = false;
      this.drops.push(drop);
      this.group.add(drop);
    }
    this.rayU = {
      uCenter: {
        value: new Vector3(),
      },
      uSize: {
        value: 1.3,
      },
      uAlpha: {
        value: 0,
      },
      uRainbow: {
        value: 0,
      },
      uSpin: {
        value: 0,
      },
    };
    this.rays = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        uniforms: {
          ...ctx.globals,
          ...this.rayU,
          uRb: rainbow,
        },
        vertexShader: ITEM_RAYS_VERTEX,
        fragmentShader: ITEM_RAYS_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
      }),
    );
    this.rays.frustumCulled = false;
    this.rays.visible = false;
    this.rays.renderOrder = 7;
    this.group.add(this.rays);
  }
  update(dt, state, hands, brushTip, brushHead, chest, fx) {
    const itemHold = state.itemHold;
    const hold = ITEM_HOLD;
    const holdT = itemHold ? itemHold.t : 0;
    const item = itemHold ? itemHold.item : null;
    if (item !== this.lastItem) {
      this.lastItem = item;
      this.revealed = -1;
      if (item === 'heartContainer') {
        this.haveHeartPos = false;
        this.absorbT = -1;
      }
    }
    const camPos = this.ctx.camera.position;
    if (item === 'heartContainer') {
      this.itemPos.copy(hands[0]).add(hands[1]).multiplyScalar(0.5);
      this.itemPos.y += 0.22 + 0.025 * Math.sin(holdT * 3.1);
    } else if (item === 'chromaBrush') this.itemPos.copy(brushHead).lerp(brushTip, 0.35);
    else if (item === 'brushflight') {
      this.itemPos.copy(hands[0]).add(hands[1]).multiplyScalar(0.5).lerp(brushHead, 0.45);
      this.itemPos.y += 0.04;
    } else if (item === 'staminaVessel') {
      this.itemPos.copy(hands[0]).add(hands[1]).multiplyScalar(0.5);
      this.itemPos.y += 0.2 + 0.03 * Math.sin(holdT * 2.6);
    } else if (item === 'skyMantle') {
      this.itemPos.copy(hands[0]).add(hands[1]).multiplyScalar(0.5);
      this.itemPos.y += 0.07 + 0.015 * Math.sin(holdT * 2.2);
    } else if (isGearItem(item)) {
      this.itemPos.copy(hands[0]).add(hands[1]).multiplyScalar(0.5);
      this.itemPos.y += item === 'cloudstep' ? 0.18 : item === 'lantern' ? 0.1 : 0.04;
    }
    this.handsMid.copy(hands[0]).add(hands[1]).multiplyScalar(0.5);
    if (isGearItem(item)) {
      this.slot.copy(chest);
      try {
        this.slotOf?.(item, this.slot);
      } catch {}
    }
    this.prizes.update(dt, item, holdT, this.handsMid, this.slot, fx);
    if (item !== this.lastOrbItem) {
      this.lastOrbItem = item;
      this.haveOrbPos = false;
      this.orbAbsorbT = -1;
      this.mantleBurst = false;
    }
    this.updateVessel(dt, item === 'staminaVessel' ? holdT : -1, chest, camPos, fx);
    this.updateMantle(dt, item === 'skyMantle' ? holdT : -1, chest, camPos, state, fx);
    if (item === 'heartContainer' && holdT >= hold.reveal - 0.02) {
      this.haveHeartPos ||= (this.heartPos.copy(this.itemPos), true);
      const lowering = holdT >= hold.lower;
      if (lowering && this.absorbT < 0) this.absorbT = 0;
      this.heartPos.lerp(this.itemPos, 1 - Math.exp(-18 * Math.max(dt, 0.001)));
      let scale = itemFxEaseOutBack(itemFxClamp01((holdT - hold.reveal) / 0.4));
      if (lowering) {
        const k = itemFxClamp01((holdT - hold.lower) / (hold.dur - hold.lower - 0.05));
        this.heartPos.lerp(chest, k * k);
        scale *= 1 - k * k * 0.85;
      }
      this.heart.visible = scale > 0.01;
      this.heart.position.copy(this.heartPos);
      this.heart.scale.setScalar(Math.max(0.001, scale));
      const angle = Math.atan2(camPos.x - this.heartPos.x, camPos.z - this.heartPos.z);
      this.heart.rotation.set(
        0.08 * Math.sin(holdT * 1.7),
        angle + 0.45 * Math.sin(holdT * 1.3),
        0.06 * Math.sin(holdT * 2.3),
        'YXZ',
      );
      this.heartU.uGlow.value =
        0.35 + 0.25 * Math.sin(holdT * 5) + (holdT - hold.reveal < 0.3 ? 1.5 * (1 - (holdT - hold.reveal) / 0.3) : 0);
      for (let i = 0; i < 4; i++) {
        const drop = this.drops[i];
        const angle = holdT * 2.4 + (i / 4) * Math.PI * 2;
        const radius = 0.22 * scale;
        drop.visible = scale > 0.05;
        drop.position.set(
          this.heartPos.x + Math.cos(angle) * radius,
          this.heartPos.y + Math.sin(angle * 1.5 + i) * 0.06 * scale,
          this.heartPos.z + Math.sin(angle) * radius,
        );
        drop.scale.setScalar(Math.max(0.001, scale * (0.9 + 0.2 * Math.sin(holdT * 7 + i))));
      }
    } else {
      if (this.heart.visible) this.heart.visible = false;
      for (const drop of this.drops) drop.visible = false;
    }
    let rayTarget = 0;
    if (item && holdT >= hold.reveal - 0.05)
      rayTarget = holdT >= hold.lower ? Math.max(0, 1 - (holdT - hold.lower) / 0.35) : 1;
    this.rayA += (rayTarget - this.rayA) * (1 - Math.exp(-(rayTarget > this.rayA ? 14 : 6) * Math.max(dt, 0.001)));
    const raysOn = this.rayA > 0.01;
    this.rays.visible = raysOn;
    if (raysOn) {
      this.v.subVectors(this.itemPos, camPos).normalize();
      this.rayU.uCenter.value.copy(this.itemPos).addScaledVector(this.v, 0.35);
      const burst = holdT - hold.reveal < 0.25 ? 1 + 0.6 * (1 - (holdT - hold.reveal) / 0.25) : 1;
      this.rayU.uSize.value =
        (item === 'chromaBrush'
          ? 1.55
          : item === 'brushflight'
            ? 1.75
            : item === 'skyMantle'
              ? 1.6
              : item === 'cloudstep'
                ? 1.45
                : isGearItem(item)
                  ? 1.35
                  : 1.2) *
        burst *
        (0.85 + 0.15 * this.rayA);
      this.rayU.uAlpha.value = this.rayA * (0.58 + 0.08 * Math.sin(holdT * 4));
      this.rayU.uRainbow.value =
        item === 'chromaBrush'
          ? 1
          : item === 'staminaVessel' || item === 'skyMantle'
            ? 0.2
            : isGearItem(item)
              ? 0.15
              : 0.45;
      this.rayU.uSpin.value += dt * 0.35;
    }
    if (fx && item) {
      if (this.revealed < 0 && holdT >= hold.reveal) {
        this.revealed = holdT;
        const itemPos = this.itemPos;
        fx.vfx.emit({
          type: VfxType.Star,
          x: itemPos.x,
          y: itemPos.y,
          z: itemPos.z,
          size: 1.6,
          grow: 1.8,
          life: 0.3,
          color: 0xffffff,
          alpha: 1,
        });
        fx.vfx.emit({
          type: VfxType.Shock,
          x: itemPos.x,
          y: itemPos.y,
          z: itemPos.z,
          size: 0.3,
          grow: 16,
          life: 0.5,
          color: 0xfff1c8,
          alpha: 0.9,
        });
        for (let i = 0; i < 4; i++) {
          const hex = PALETTE[COLORS[i]].hex;
          fx.vfx.emit({
            type: VfxType.Shock,
            x: itemPos.x,
            y: itemPos.y,
            z: itemPos.z,
            size: 0.25,
            grow: 8 + i * 3,
            life: 0.35 + i * 0.07,
            color: hex,
            alpha: 0.85,
          });
          fx.sparkle(itemPos, hex, 9, 4.5);
        }
      }
      if (holdT >= hold.reveal && holdT < hold.lower)
        for (this.sparkT -= dt * 26; this.sparkT <= 0;) {
          this.sparkT += 1;
          const angle = Math.random() * Math.PI * 2;
          const radius = 0.15 + Math.random() * (item === 'chromaBrush' ? 0.5 : item === 'brushflight' ? 0.65 : 0.35);
          const paint = COLORS[Math.floor(Math.random() * 4)];
          if (item === 'staminaVessel') this.col.setHex(Math.random() < 0.4 ? 15335408 : 7208868);
          else if (item === 'skyMantle')
            this.col.setHex(Math.random() < 0.4 ? 16773568 : Math.random() < 0.5 ? 9426175 : 16757611);
          else if (item === 'lantern') this.col.setHex(Math.random() < 0.5 ? 16773320 : 16761962);
          else if (item === 'emberCrest')
            this.col.setHex(Math.random() < 0.35 ? 16769184 : Math.random() < 0.5 ? 16738862 : 16756794);
          else if (item === 'frostCrest') this.col.setHex(Math.random() < 0.4 ? 15924223 : 8177919);
          else if (item === 'cloudstep') this.col.setHex(Math.random() < 0.6 ? 16777215 : 12575487);
          else this.col.setHex(Math.random() < 0.35 ? 16774880 : PALETTE[paint].hex);
          fx.vfx.emit({
            type: Math.random() < 0.3 ? VfxType.Star : VfxType.Drop,
            x: this.itemPos.x + Math.cos(angle) * radius,
            y: this.itemPos.y + (Math.random() - 0.5) * 0.4,
            z: this.itemPos.z + Math.sin(angle) * radius,
            vx: Math.cos(angle) * 0.3,
            vy: 0.5 + Math.random() * 0.8,
            vz: Math.sin(angle) * 0.3,
            size: 0.03 + Math.random() * 0.05,
            life: 0.6 + Math.random() * 0.5,
            color: this.col,
            alpha: 1,
            drag: 1.2,
          });
        }
      if (item === 'heartContainer' && this.absorbT >= 0) {
        this.absorbT += dt;
        if (this.absorbT > 0.42 && this.absorbT - dt <= 0.42) {
          fx.vfx.emit({
            type: VfxType.Star,
            x: chest.x,
            y: chest.y,
            z: chest.z,
            size: 0.9,
            grow: 1.6,
            life: 0.22,
            color: 0xff6f8e,
            alpha: 1,
          });
          fx.sparkle(chest, 16740238, 14, 3);
        }
      }
    }
  }
  lastOrbItem = null;
  updateVessel(dt, holdT, chest, camPos, fx) {
    const hold = ITEM_HOLD;
    if (holdT < hold.reveal - 0.02) {
      if (this.orb.visible) this.orb.visible = false;
      return;
    }
    this.haveOrbPos ||= (this.orbPos.copy(this.itemPos), true);
    this.orbPos.lerp(this.itemPos, 1 - Math.exp(-16 * Math.max(dt, 0.001)));
    let scale = itemFxEaseOutBack(itemFxClamp01((holdT - hold.reveal) / 0.4));
    if (holdT >= hold.lower) {
      if (this.orbAbsorbT < 0) this.orbAbsorbT = 0;
      const k = itemFxClamp01((holdT - hold.lower) / (hold.dur - hold.lower - 0.05));
      this.orbPos.lerp(chest, k * k);
      scale *= 1 - k * k * 0.85;
    }
    this.orb.visible = scale > 0.01;
    this.orb.position.copy(this.orbPos);
    this.orb.scale.setScalar(Math.max(0.001, scale * (1 + 0.05 * Math.sin(holdT * 6))));
    this.orbU.uGlow.value =
      0.25 + 0.15 * Math.sin(holdT * 4.5) + (holdT - hold.reveal < 0.35 ? 1.4 * (1 - (holdT - hold.reveal) / 0.35) : 0);
    if (!(!fx || dt <= 0)) {
      for (this.wispT -= dt * 60; this.wispT <= 0;) {
        this.wispT += 1;
        for (let j = 0; j < 3; j++) {
          const angle = holdT * 3.4 + (j / 3) * Math.PI * 2;
          const radius = 0.2 * scale;
          const bob = Math.sin(angle * 1.3 + j * 2) * 0.1 * scale;
          fx.vfx.emit({
            type: j === 0 ? VfxType.Star : VfxType.Drop,
            x: this.orbPos.x + Math.cos(angle) * radius,
            y: this.orbPos.y + bob,
            z: this.orbPos.z + Math.sin(angle) * radius,
            vx: 0,
            vy: 0.15,
            vz: 0,
            size: 0.03 + 0.015 * Math.random(),
            grow: 0.2,
            life: 0.45,
            color: j === 0 ? 15400946 : 7208868,
            alpha: 0.9,
            drag: 2,
          });
        }
      }
      if (this.orbAbsorbT >= 0) {
        this.orbAbsorbT += dt;
        if (this.orbAbsorbT > 0.42 && this.orbAbsorbT - dt <= 0.42) {
          fx.vfx.emit({
            type: VfxType.Star,
            x: chest.x,
            y: chest.y,
            z: chest.z,
            size: 0.9,
            grow: 1.6,
            life: 0.22,
            color: 0x9dffc0,
            alpha: 1,
          });
          fx.vfx.emit({
            type: VfxType.Shock,
            x: chest.x,
            y: chest.y,
            z: chest.z,
            size: 0.2,
            grow: 9,
            life: 0.4,
            color: 0x6dffa4,
            alpha: 0.85,
          });
          fx.sparkle(chest, 7208868, 16, 3);
        }
      }
    }
  }
  updateMantle(dt, holdT, chest, camPos, state, fx) {
    const hold = ITEM_HOLD;
    const mantle = SKY_MANTLE;
    if (this.mantleOnT >= 0) this.mantleOnT += dt;
    if (holdT < hold.reveal - 0.02) {
      this.folded.visible = false;
      this.swirl.visible = false;
      this.capeMat.glow.value = 0;
      return;
    }
    let scale = itemFxEaseOutBack(itemFxClamp01((holdT - hold.reveal) / 0.4));
    if (holdT >= mantle.unfurl) scale *= Math.max(0, 1 - (holdT - mantle.unfurl) / 0.18);
    this.folded.visible = scale > 0.01;
    if (this.folded.visible) {
      this.folded.position.copy(this.itemPos);
      this.folded.scale.setScalar(Math.max(0.001, scale));
      const angle = Math.atan2(camPos.x - this.itemPos.x, camPos.z - this.itemPos.z);
      this.folded.rotation.set(
        0.5 + 0.06 * Math.sin(holdT * 1.7),
        angle + 0.3 * Math.sin(holdT * 1.1),
        0.05 * Math.sin(holdT * 2.3),
        'YXZ',
      );
    }
    this.capeMat.glow.value =
      holdT < mantle.on
        ? 0.35 + 0.2 * Math.sin(holdT * 5) + (holdT - hold.reveal < 0.3 ? 1.2 * (1 - (holdT - hold.reveal) / 0.3) : 0)
        : 0;
    const swirlDur = mantle.on - mantle.unfurl;
    const swirlT = (holdT - mantle.unfurl) / swirlDur;
    const swirling = swirlT > 0 && swirlT < 1.35;
    this.swirl.visible = swirling;
    if (swirlT <= 0) this.swirlA0 = Math.atan2(camPos.x - chest.x, camPos.z - chest.z);
    if (swirling) this.writeSwirl(swirlT, chest, state);
    if (holdT >= mantle.on && !this.mantleBurst && ((this.mantleBurst = true), (this.mantleOnT = 0), fx)) {
      const at = chest;
      fx.vfx.emit({
        type: VfxType.Star,
        x: at.x,
        y: at.y + 0.1,
        z: at.z,
        size: 1.5,
        grow: 1.7,
        life: 0.3,
        color: 0xffffff,
        alpha: 1,
      });
      fx.vfx.emit({
        type: VfxType.Shock,
        x: at.x,
        y: at.y,
        z: at.z,
        size: 0.3,
        grow: 14,
        life: 0.5,
        color: 0xfff1c8,
        alpha: 0.9,
      });
      fx.vfx.emit({
        type: VfxType.Shock,
        x: at.x,
        y: at.y - 0.3,
        z: at.z,
        size: 0.25,
        grow: 10,
        life: 0.45,
        color: 0x8fd4ff,
        alpha: 0.85,
      });
      fx.sparkle(at, 16766571, 18, 4);
      fx.sparkle(at, 9426175, 14, 3.5);
      fx.sparkle(at, 16748422, 8, 3);
    }
    if (fx && swirling && dt > 0) {
      const head = Math.min(43, Math.max(0, Math.round(this.swirlHead * 43)));
      const pos = this.swirlPos.array;
      const offset = head * 2 * 3;
      for (let i = 0; i < 2; i++)
        fx.vfx.emit({
          type: Math.random() < 0.5 ? VfxType.Star : VfxType.Drop,
          x: pos[offset] + (Math.random() - 0.5) * 0.1,
          y: pos[offset + 1] + (Math.random() - 0.5) * 0.1,
          z: pos[offset + 2] + (Math.random() - 0.5) * 0.1,
          vx: (Math.random() - 0.5) * 0.5,
          vy: 0.3 + Math.random() * 0.5,
          vz: (Math.random() - 0.5) * 0.5,
          size: 0.03 + Math.random() * 0.04,
          life: 0.5 + Math.random() * 0.4,
          color: Math.random() < 0.5 ? 16770720 : 12576511,
          alpha: 1,
          drag: 1.5,
        });
    }
  }
  swirlHead = 0;
  writeSwirl(k, center, state) {
    const pos = this.swirlPos.array;
    const nrm = this.swirlNrm.array;
    const head = Math.min(1, itemFxEaseInOut(itemFxClamp01(k)) * 1.12);
    const tail = Math.max(0, head - 0.7 * (k < 1 ? 1 : Math.max(0, 1 - (k - 1) / 0.35)));
    this.swirlHead = head;
    const itemPos = this.itemPos;
    const endA = state.facing + Math.PI;
    const swirlA0 = this.swirlA0;
    let delta = (endA - swirlA0) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    const sweep = delta - 2 * Math.PI * 2;
    const topY = Math.max(itemPos.y + 0.35, center.y + 1);
    const bottomY = center.y + 0.08;
    const pointAt = (s, out) => {
      const angle = swirlA0 + sweep * s;
      const radius = 0.24 + 0.52 * Math.sin(Math.PI * Math.min(1, 0.15 + s * 0.95)) * (1 - 0.55 * s);
      const y = topY + (bottomY - topY) * (s * s * (3 - 2 * s));
      return out.set(center.x + Math.sin(angle) * radius, y, center.z + Math.cos(angle) * radius);
    };
    for (let i = 0; i < MANTLE_SWIRL_POINTS; i++) {
      const u2 = i / 43;
      const s = tail + (head - tail) * u2;
      pointAt(s, this.sw);
      pointAt(Math.min(1, s + 0.01), this.sw2);
      const width = 0.26 * Math.sin(Math.PI * itemFxClamp01(u2 * 1.02)) ** 0.7 + 0.015;
      const tx = this.sw2.x - this.sw.x;
      const ty = this.sw2.y - this.sw.y;
      const tz = this.sw2.z - this.sw.z;
      const flat = Math.hypot(tx, tz) || 1;
      const twist = 0.35 * Math.sin(s * 18 - k * 9);
      const sx = (-tz / flat) * twist;
      const sz = (tx / flat) * twist;
      const sideLen = Math.hypot(sx, 1, sz) || 1;
      for (let j = 0; j < 2; j++) {
        const offset = (j - 0.5) * width;
        const v = (i * 2 + j) * 3;
        pos[v] = this.sw.x + (sx / sideLen) * offset;
        pos[v + 1] = this.sw.y + (1 / sideLen) * offset;
        pos[v + 2] = this.sw.z + (sz / sideLen) * offset;
        const nx = (1 / sideLen) * tz - (sz / sideLen) * ty;
        const ny = (sz / sideLen) * tx - (sx / sideLen) * tz;
        const nz = (sx / sideLen) * ty - (1 / sideLen) * tx;
        const nLen = Math.hypot(nx, ny, nz) || 1;
        nrm[v] = nx / nLen;
        nrm[v + 1] = ny / nLen;
        nrm[v + 2] = nz / nLen;
      }
    }
    this.swirlPos.needsUpdate = true;
    this.swirlNrm.needsUpdate = true;
  }
}
