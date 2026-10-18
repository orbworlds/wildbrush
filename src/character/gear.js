/**
 * The gear the hero wears once found: the hip lantern that swings on a damped pendulum and lights up in the dark, the Ember and Frost Crests on the belt, and the winged Cloudstep boots that flap and puff cloud on air jumps. Also builds the gear models the prize display reuses.
 */
import {
  BackSide,
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ITEM_HOLD } from '../shared/combat-defs.js';
import { darkness } from '../shared/signals.js';
import { BONE, REST_POS } from './rig.js';
import { patchToonMaterial } from './toon-material.js';
import { VfxType } from './vfx.js';
const GEAR_TAU = Math.PI * 2;
const expDamp = (rate, dt) => 1 - Math.exp(-rate * Math.max(0, dt));
const LANTERN_ANCHOR = new Vector3(-0.182, 0.962, -0.012);
const LANTERN_SCALE = 1.3;
const LANTERN_LIGHT = {
  color: 0xffc98a,
  distance: 12,
  decay: 1.45,
  intensity: 7.5,
};
function gearGradient(geometry, low, high, axis = 'y') {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  geo.deleteAttribute('uv');
  const position = geo.attributes.position;
  const count = position.count;
  const colors = new Float32Array(count * 3);
  const lowColor = new Color(low);
  const highColor = new Color(high ?? low);
  const mixed = new Color();
  let min = Infinity;
  let max = -Infinity;
  const along = (index) =>
    axis === 'y' ? position.getY(index) : Math.hypot(position.getX(index), position.getZ(index));
  for (let i = 0; i < count; i++) {
    min = Math.min(min, along(i));
    max = Math.max(max, along(i));
  }
  for (let i = 0; i < count; i++) {
    mixed.copy(lowColor).lerp(highColor, max > min ? (along(i) - min) / (max - min) : 0);
    colors[i * 3] = mixed.r;
    colors[i * 3 + 1] = mixed.g;
    colors[i * 3 + 2] = mixed.b;
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  return geo;
}
function placeGeometry(geometry, x, y, z, rx = 0, ry = 0, rz = 0, scale = 1) {
  const matrix = new Matrix4().compose(
    new Vector3(x, y, z),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
    new Vector3(scale, scale, scale),
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}
function mergeParts(parts) {
  return mergeGeometries(parts, false) ?? parts[0];
}
function gearMaterial(ctx, label, options = {}) {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.55,
    metalness: 0,
    ...options,
  });
  material.name = `hero-gear-${label}`;
  patchToonMaterial(material, ctx, {
    key: `wb-hero-gear-${label}-v1`,
    rim: 0.9,
  });
  return material;
}
function withGearOutline(mesh, outlineWidth, widthScale = 0.55) {
  const material = new MeshBasicMaterial({
    color: 0x3b2a22,
    side: BackSide,
  });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uOutlineWidth = outlineWidth;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uOutlineWidth;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\ntransformed += normalize( normal ) * uOutlineWidth * ${widthScale.toFixed(2)};`,
      );
  };
  material.customProgramCacheKey = () => `wb-gear-outline-${widthScale.toFixed(2)}`;
  const outline = new Mesh(mesh.geometry, material);
  outline.name = `${mesh.name}-outline`;
  outline.castShadow = false;
  outline.frustumCulled = false;
  mesh.add(outline);
  return mesh;
}
export function lanternFrameGeometry() {
  const brass = 15118414;
  const brassDark = 9067036;
  const parts = [];
  parts.push(gearGradient(placeGeometry(new TorusGeometry(0.009, 0.0028, 6, 14), 0, -0.009, 0), brass));
  parts.push(gearGradient(placeGeometry(new CylinderGeometry(0.003, 0.003, 0.016, 6), 0, -0.024, 0), brassDark));
  parts.push(gearGradient(placeGeometry(new SphereGeometry(0.0065, 8, 6), 0, -0.033, 0), brass));
  parts.push(gearGradient(placeGeometry(new ConeGeometry(0.034, 0.024, 12, 1), 0, -0.046, 0), brass, brassDark));
  parts.push(
    gearGradient(placeGeometry(new TorusGeometry(0.031, 0.0045, 6, 18), 0, -0.058, 0, Math.PI / 2), brassDark),
  );
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * GEAR_TAU + Math.PI / 4;
    parts.push(
      gearGradient(
        placeGeometry(
          new CylinderGeometry(0.0034, 0.0034, 0.064, 5),
          Math.cos(angle) * 0.029,
          -0.09,
          Math.sin(angle) * 0.029,
        ),
        brass,
      ),
    );
  }
  parts.push(gearGradient(placeGeometry(new CylinderGeometry(0.03, 0.026, 0.011, 14), 0, -0.126, 0), brass, brassDark));
  parts.push(gearGradient(placeGeometry(new SphereGeometry(0.008, 8, 6), 0, -0.134, 0), brassDark));
  return mergeParts(parts);
}
export function lanternGlowGeometry() {
  const parts = [];
  const dome = new SphereGeometry(0.021, 14, 8, 0, GEAR_TAU, 0, Math.PI / 2);
  dome.scale(1, 0.72, 1);
  parts.push(gearGradient(placeGeometry(dome, 0, -0.088, 0), 16757322, 16773572));
  parts.push(gearGradient(placeGeometry(new CylinderGeometry(0.0065, 0.009, 0.03, 8), 0, -0.104, 0), 16774360));
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * GEAR_TAU + 0.4;
    parts.push(
      gearGradient(
        placeGeometry(new SphereGeometry(0.0035, 5, 4), Math.cos(angle) * 0.012, -0.078, Math.sin(angle) * 0.012),
        16776168,
      ),
    );
  }
  return mergeParts(parts);
}
function lanternGlobeGeometry() {
  const geometry = new SphereGeometry(0.029, 16, 12);
  geometry.scale(1, 1.12, 1);
  geometry.translate(0, -0.092, 0);
  return geometry;
}
export function flameEmblemGeometry(size, depth) {
  const shape = new Shape();
  shape.moveTo(0, -0.5);
  shape.bezierCurveTo(0.42, -0.5, 0.5, -0.1, 0.32, 0.18);
  shape.bezierCurveTo(0.24, 0.32, 0.2, 0.36, 0.12, 0.62);
  shape.bezierCurveTo(0.05, 0.4, -0.02, 0.36, -0.06, 0.3);
  shape.bezierCurveTo(-0.12, 0.48, -0.16, 0.5, -0.22, 0.56);
  shape.bezierCurveTo(-0.2, 0.3, -0.5, 0.12, -0.42, -0.14);
  shape.bezierCurveTo(-0.36, -0.4, -0.2, -0.5, 0, -0.5);
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.4,
    bevelSize: 0.05,
    bevelSegments: 2,
    curveSegments: 8,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.scale(size, size, 1);
  return geometry;
}
export function snowflakeEmblemGeometry(size, depth) {
  const parts = [];
  for (let i = 0; i < 3; i++)
    parts.push(placeGeometry(new BoxGeometry(size, size * 0.13, depth), 0, 0, 0, 0, 0, (i / 3) * Math.PI));
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * GEAR_TAU;
    const x = Math.cos(angle) * size * 0.3;
    const y = Math.sin(angle) * size * 0.3;
    for (const side of [-1, 1])
      parts.push(placeGeometry(new BoxGeometry(size * 0.2, size * 0.08, depth), x, y, 0, 0, 0, angle + side * 0.8));
  }
  const merged =
    mergeGeometries(
      parts.map((part) => (part.index ? part.toNonIndexed() : part)),
      false,
    ) ?? parts[0];
  merged.computeVertexNormals();
  return merged;
}
export function bootWingGeometry() {
  const parts = [];
  for (const [len, width, tilt] of [
    [0.1, 0.028, 0.75],
    [0.085, 0.025, 0.42],
    [0.066, 0.022, 0.12],
  ]) {
    const shape = new Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(width * 0.9, len * 0.35, width * 0.45, len * 0.85);
    shape.quadraticCurveTo(width * 0.15, len * 1.02, 0, len);
    shape.quadraticCurveTo(-width * 0.35, len * 0.6, 0, 0);
    const geometry = new ExtrudeGeometry(shape, {
      depth: 0.004,
      bevelEnabled: false,
      curveSegments: 6,
    });
    geometry.translate(0, 0, -0.002);
    geometry.rotateY(Math.PI / 2);
    geometry.rotateX(-(Math.PI / 2 - tilt));
    parts.push(gearGradient(geometry, 15331062, 16777215, 'r'));
  }
  parts.push(gearGradient(new SphereGeometry(0.009, 8, 6), 15909198, 16769946));
  return mergeParts(parts);
}
export function cloudRingGeometry(radius, seed = 1) {
  const parts = [];
  let state = seed * 9301 + 49297;
  const rand = () => (state = (state * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 11; i++) {
    const angle = (i / 11) * GEAR_TAU + rand() * 0.2;
    const size = 0.017 + rand() * 0.008;
    const geometry = new IcosahedronGeometry(size, 1);
    parts.push(
      gearGradient(
        placeGeometry(geometry, Math.cos(angle) * radius, (rand() - 0.5) * 0.012, Math.sin(angle) * radius),
        13624311,
        16777215,
      ),
    );
  }
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * GEAR_TAU + 0.3;
    const geometry = new IcosahedronGeometry(0.013 + rand() * 0.005, 1);
    parts.push(
      gearGradient(
        placeGeometry(geometry, Math.cos(angle) * radius * 0.82, 0.014, Math.sin(angle) * radius * 0.82),
        14478330,
        16777215,
      ),
    );
  }
  return mergeParts(parts);
}
export class HeroGear {
  ctx;
  light;
  lanternAnchor = new Object3D();
  lantern = new Group();
  glowMat;
  globeMat;
  emblems = [];
  boots = [];
  shown = {
    lantern: 0,
    emberCrest: 0,
    frostCrest: 0,
    cloudstep: 0,
  };
  pop = {
    lantern: 0,
    emberCrest: 0,
    frostCrest: 0,
    cloudstep: 0,
  };
  swing = new Vector2();
  swingV = new Vector2();
  prevP = new Vector3();
  prevV = new Vector3();
  havePrev = false;
  lightK = 0;
  flapT = 9;
  tinkleT = 0;
  forceLight = false;
  lightOverride = new Vector3();
  lightOverrideK = 0;
  v = new Vector3();
  v2 = new Vector3();
  q = new Quaternion();
  qp = new Quaternion();
  dirW = new Vector3();
  constructor(ctx, bones, outlineWidth) {
    this.ctx = ctx;
    const pelvis = bones[BONE.pelvis];
    this.lanternAnchor.position.copy(LANTERN_ANCHOR).sub(REST_POS[BONE.pelvis]);
    pelvis.add(this.lanternAnchor);
    this.lanternAnchor.add(this.lantern);
    this.lantern.name = 'hero-lantern';
    this.lantern.scale.setScalar(LANTERN_SCALE);
    const brass = gearMaterial(ctx, 'brass', {
      roughness: 0.4,
      metalness: 0.15,
    });
    const frame = new Mesh(lanternFrameGeometry(), brass);
    frame.castShadow = true;
    frame.frustumCulled = false;
    this.glowMat = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      emissive: 0xffa94d,
      emissiveIntensity: 0.6,
      toneMapped: true,
    });
    this.glowMat.name = 'hero-lantern-glow';
    const glow = new Mesh(lanternGlowGeometry(), this.glowMat);
    glow.frustumCulled = false;
    this.globeMat = new MeshStandardMaterial({
      color: 0xfff2d6,
      roughness: 0.08,
      metalness: 0,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      emissive: 0xffc070,
      emissiveIntensity: 0.25,
    });
    this.globeMat.name = 'hero-lantern-globe';
    const globe = new Mesh(lanternGlobeGeometry(), this.globeMat);
    globe.renderOrder = 3;
    globe.frustumCulled = false;
    this.lantern.add(withGearOutline(frame, outlineWidth, 0.35), glow, globe);
    this.lantern.visible = false;
    this.light = new PointLight(LANTERN_LIGHT.color, 0, LANTERN_LIGHT.distance, LANTERN_LIGHT.decay);
    this.light.name = 'hero-lantern-light';
    this.light.castShadow = false;
    this.light.position.set(0, -500, 0);
    ctx.scene.add(this.light);
    const addCrest = (item, angle, metalLight, metalDark, gemColor, emblemGeo, emblemColor) => {
      const group = new Group();
      group.name = `hero-${item}`;
      const x = Math.sin(angle) * 0.146;
      const z = Math.cos(angle) * 0.116 + 0.006;
      group.position.set(x, 0.968 - REST_POS[BONE.pelvis].y, z);
      group.rotation.set(0, angle, 0);
      const metal = gearMaterial(ctx, `crest-${item}`, {
        roughness: 0.35,
        metalness: 0.2,
      });
      const bezelGeo = mergeParts([
        gearGradient(new TorusGeometry(0.024, 0.0048, 8, 24), metalLight, metalDark),
        gearGradient(
          placeGeometry(new CylinderGeometry(0.024, 0.024, 0.004, 24), 0, 0, -0.003, Math.PI / 2),
          metalDark,
        ),
      ]);
      const bezel = new Mesh(bezelGeo, metal);
      bezel.castShadow = true;
      const gemMat = new MeshStandardMaterial({
        color: gemColor,
        roughness: 0.25,
        metalness: 0.1,
        emissive: gemColor,
        emissiveIntensity: 0.35,
      });
      gemMat.name = `hero-${item}-gem`;
      const gemGeo = new CylinderGeometry(0.021, 0.021, 0.004, 24);
      gemGeo.rotateX(Math.PI / 2);
      const gem = new Mesh(gemGeo, gemMat);
      gem.position.z = 0.0005;
      const emblem = new Mesh(gearGradient(emblemGeo, emblemColor, 16777215), metal);
      emblem.position.z = 0.0035;
      group.add(withGearOutline(bezel, outlineWidth, 0.3), gem, emblem);
      group.visible = false;
      pelvis.add(group);
      this.emblems.push({
        group,
        gem: gemMat,
        k: 0,
        item,
        glow: 0,
      });
    };
    addCrest('emberCrest', 0.44, 16766058, 10118164, 14168606, flameEmblemGeometry(0.03, 0.004), 16765802);
    addCrest('frostCrest', 0.92, 15398143, 8164275, 2916310, snowflakeEmblemGeometry(0.03, 0.003), 15924223);
    const cloudMat = gearMaterial(ctx, 'cloud', {
      roughness: 0.9,
      emissive: 0x9fb7d6,
      emissiveIntensity: 0.12,
    });
    const wingMat = gearMaterial(ctx, 'wing', {
      roughness: 0.7,
      side: DoubleSide,
      emissive: 0xaec6e6,
      emissiveIntensity: 0.1,
    });
    for (const side of [1, -1]) {
      const shin = bones[side === 1 ? BONE.shinL : BONE.shinR];
      const shinRest = REST_POS[side === 1 ? BONE.shinL : BONE.shinR];
      const boot = new Group();
      boot.name = `hero-cloudstep-${side === 1 ? 'l' : 'r'}`;
      boot.position.set(0, 0, 0);
      const cloud = new Mesh(cloudRingGeometry(0.062, side === 1 ? 3 : 7), cloudMat);
      cloud.position.set(0, 0.346 - shinRest.y, 0.003);
      cloud.castShadow = true;
      const wing = new Group();
      wing.position.set(side * 0.052, 0.235 - shinRest.y, -0.018);
      const feathers = new Mesh(bootWingGeometry(), wingMat);
      feathers.scale.setScalar(1.9);
      feathers.castShadow = true;
      wing.add(withGearOutline(feathers, outlineWidth, 0.25));
      boot.add(withGearOutline(cloud, outlineWidth, 0.3), wing);
      boot.visible = false;
      shin.add(boot);
      this.boots.push({
        root: boot,
        wing,
        side,
      });
    }
  }
  slotWorld(item, out) {
    if (item === 'lantern') {
      this.lanternAnchor.getWorldPosition(out);
      out.y -= 0.09;
      return out;
    }
    if (item === 'emberCrest' || item === 'frostCrest') {
      const crest = this.emblems.find((emblem) => emblem.item === item);
      if (crest) return crest.group.getWorldPosition(out);
    }
    if (item === 'cloudstep' && this.boots.length === 2) {
      this.boots[0].wing.getWorldPosition(out);
      this.boots[1].wing.getWorldPosition(this.v2);
      return out.add(this.v2).multiplyScalar(0.5);
    } else {
      return out;
    }
  }
  flap() {
    this.flapT = 0;
  }
  airJumpPuff(position, fx) {
    if (!fx) return;
    const vfx = fx.vfx;
    const baseY = position.y + 0.05;
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * GEAR_TAU + Math.random() * 0.3;
      const speed = 1.4 + Math.random() * 1.6;
      vfx.emit({
        type: VfxType.Puff,
        x: position.x + Math.cos(angle) * 0.18,
        y: baseY + Math.random() * 0.08,
        z: position.z + Math.sin(angle) * 0.18,
        vx: Math.cos(angle) * speed,
        vy: -0.4 - Math.random() * 0.8,
        vz: Math.sin(angle) * speed,
        size: 0.16 + Math.random() * 0.12,
        grow: 2.2,
        life: 0.55 + Math.random() * 0.35,
        color: 0xf6f9ff,
        alpha: 0.95,
        drag: 3.2,
      });
    }
    for (let i = 0; i < 5; i++)
      vfx.emit({
        type: VfxType.Puff,
        x: position.x + (Math.random() - 0.5) * 0.3,
        y: baseY - 0.05,
        z: position.z + (Math.random() - 0.5) * 0.3,
        vx: 0,
        vy: -0.3,
        vz: 0,
        size: 0.28 + Math.random() * 0.1,
        grow: 1.7,
        life: 0.8 + Math.random() * 0.3,
        color: 0xffffff,
        alpha: 0.9,
        drag: 2,
      });
    vfx.emit({
      type: VfxType.Ring,
      x: position.x,
      y: baseY,
      z: position.z,
      size: 0.2,
      grow: 5.5,
      life: 0.4,
      color: 0xe8f3ff,
      alpha: 0.9,
    });
    vfx.emit({
      type: VfxType.Star,
      x: position.x,
      y: baseY + 0.1,
      z: position.z,
      size: 0.55,
      grow: 1.4,
      life: 0.16,
      color: 0xdff0ff,
      alpha: 1,
    });
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * GEAR_TAU;
      vfx.emit({
        type: VfxType.Star,
        x: position.x + Math.cos(angle) * 0.25,
        y: baseY + 0.1,
        z: position.z + Math.sin(angle) * 0.25,
        vx: Math.cos(angle) * 1.2,
        vy: -0.2 + Math.random() * 0.8,
        vz: Math.sin(angle) * 1.2,
        size: 0.05 + Math.random() * 0.04,
        life: 0.45,
        color: 0xffffff,
        alpha: 1,
        drag: 2,
      });
    }
  }
  update(dt, state, hasItem, fx) {
    const itemHold = state.itemHold;
    const elapsed = this.ctx.time.elapsed;
    for (const item of ['lantern', 'emberCrest', 'frostCrest', 'cloudstep']) {
      let show = +!!hasItem(item);
      if (itemHold && itemHold.item === item && itemHold.t < ITEM_HOLD.lower + 0.32) show = 0;
      const wasShown = this.shown[item];
      this.shown[item] = show;
      if (show && !wasShown) this.pop[item] = 0;
      if (dt > 0 && show) this.pop[item] = Math.min(1, this.pop[item] + dt / 0.35);
      if (!show) this.pop[item] = 0;
    }
    const popScale = (item) => {
      if (!this.shown[item]) return 0;
      const pop = this.pop[item];
      return pop >= 1 ? 1 : 1 - (1 - pop) ** 3 + Math.sin(pop * Math.PI) * 0.35;
    };
    const lanternScale = popScale('lantern');
    this.lantern.visible = lanternScale > 0.01;
    if (this.lantern.visible) this.updateLantern(dt, state, lanternScale);
    else this.havePrev = false;
    const lightTarget =
      (this.shown.lantern ? Math.max(+!!this.forceLight, darkness(this.ctx)) : 0) * (state.dead ? 0.6 : 1);
    this.lightK +=
      (lightTarget - this.lightK) * expDamp(lightTarget > this.lightK ? 2.2 : 1.4, dt > 0 ? dt : this.ctx.time.realDt);
    const flicker = 0.93 + 0.04 * Math.sin(elapsed * 7.1) + 0.03 * Math.sin(elapsed * 17.3 + 1.1);
    this.glowMat.emissiveIntensity = (0.55 + 2.6 * this.lightK) * flicker;
    this.globeMat.emissiveIntensity = 0.2 + 0.9 * this.lightK;
    const lightOverrideK = this.lightOverrideK;
    const lightLevel = Math.max(this.lantern.visible ? this.lightK : 0, lightOverrideK);
    this.light.intensity = lightLevel < 0.004 ? 0 : LANTERN_LIGHT.intensity * lightLevel * flicker;
    if (this.light.intensity > 0)
      if (lightOverrideK > this.lightK || !this.lantern.visible) this.light.position.copy(this.lightOverride);
      else {
        this.lantern.getWorldPosition(this.v);
        this.light.position.set(this.v.x, this.v.y + 0.35, this.v.z);
      }
    if (fx && dt > 0 && this.lantern.visible && this.lightK > 0.3 && state.speed > 2.5) {
      this.tinkleT -= dt * state.speed * 0.5;
      if (this.tinkleT <= 0) {
        this.tinkleT = 1;
        this.lantern.getWorldPosition(this.v);
        fx.vfx.emit({
          type: VfxType.Star,
          x: this.v.x + (Math.random() - 0.5) * 0.1,
          y: this.v.y - 0.1,
          z: this.v.z + (Math.random() - 0.5) * 0.1,
          vx: (Math.random() - 0.5) * 0.3,
          vy: 0.3 + Math.random() * 0.4,
          vz: (Math.random() - 0.5) * 0.3,
          size: 0.025 + Math.random() * 0.02,
          life: 0.6,
          color: 0xffd79a,
          alpha: 0.9,
          drag: 1.5,
        });
      }
    }
    for (const emblem of this.emblems) {
      const scale = popScale(emblem.item);
      emblem.group.visible = scale > 0.01;
      if (!emblem.group.visible) continue;
      emblem.group.scale.setScalar(Math.max(0.001, scale));
      const pop = this.pop[emblem.item];
      const flash = pop < 1 ? (1 - pop) * 2.5 : 0;
      emblem.gem.emissiveIntensity =
        0.3 + 0.15 * Math.sin(elapsed * 2.2 + (emblem.item === 'frostCrest' ? 1.7 : 0)) + flash;
    }
    const bootScale = popScale('cloudstep');
    this.flapT += dt;
    const flap = this.flapT < 0.6 ? Math.sin(this.flapT * 34) * Math.exp(-this.flapT * 5) * 0.9 : 0;
    const airborne = +(state.mode === 'air' || state.mode === 'glide');
    const flutter = Math.sin(elapsed * 3.1) * 0.08 + airborne * Math.sin(elapsed * 9) * 0.12;
    for (const boot of this.boots) {
      boot.root.visible = bootScale > 0.01;
      if (!boot.root.visible) continue;
      boot.root.scale.setScalar(Math.max(0.001, bootScale));
      const spread = 0.35 + 0.35 * airborne + flap;
      boot.wing.rotation.set(-0.15 - 0.25 * Math.abs(flap), -boot.side * (spread + flutter), 0, 'YXZ');
    }
  }
  updateLantern(dt, state, scale) {
    this.lantern.scale.setScalar(LANTERN_SCALE * Math.max(0.001, scale));
    const lanternAnchor = this.lanternAnchor;
    lanternAnchor.updateWorldMatrix(true, false);
    const pos = this.v.setFromMatrixPosition(lanternAnchor.matrixWorld);
    if (!this.havePrev || dt <= 0)
      this.havePrev ||=
        (this.prevP.copy(pos), this.prevV.set(0, 0, 0), this.swing.set(0, 0), this.swingV.set(0, 0), true);
    else {
      const invDt = 1 / dt;
      const vx = (pos.x - this.prevP.x) * invDt;
      const vy = (pos.y - this.prevP.y) * invDt;
      const vz = (pos.z - this.prevP.z) * invDt;
      let ax = (vx - this.prevV.x) * invDt;
      let az = (vz - this.prevV.z) * invDt;
      const accel = Math.hypot(ax, az);
      if (accel > 60) {
        ax *= 60 / accel;
        az *= 60 / accel;
      }
      this.prevV.set(vx, vy, vz);
      this.prevP.copy(pos);
      const armLen = 0.16;
      const damping = 5.5;
      this.swingV.x += (-61.25 * this.swing.x - damping * this.swingV.x - (ax / armLen) * 0.9) * dt;
      this.swingV.y += (-61.25 * this.swing.y - damping * this.swingV.y - (az / armLen) * 0.9) * dt;
      if (state.mode === 'ground' && state.speed > 0.5) {
        const elapsed = this.ctx.time.elapsed;
        this.swingV.x += Math.sin(elapsed * 11.5) * 0.9 * dt * Math.min(1, state.speed / 6);
      }
      this.swing.x += this.swingV.x * dt;
      this.swing.y += this.swingV.y * dt;
      const amp = this.swing.length();
      if (amp > 0.95) this.swing.multiplyScalar(0.95 / amp);
    }
    this.dirW.set(this.swing.x, -1, this.swing.y).normalize();
    this.q.setFromUnitVectors(this.v2.set(0, -1, 0), this.dirW);
    lanternAnchor.getWorldQuaternion(this.qp).invert();
    this.lantern.quaternion.copy(this.qp).multiply(this.q);
  }
  dispose() {
    this.ctx.scene.remove(this.light);
  }
}
