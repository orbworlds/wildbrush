/**
 * Prize models for the gear items (the lantern, the Ember and Frost medals and the Cloudstep boots) that float over the hero's hands while an item is held up, then fly into their slot on the hero with a burst.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { ITEM_HOLD } from '../shared/combat-defs.js';
import { roundedBox } from './body-mesh.js';
import {
  bootWingGeometry,
  cloudRingGeometry,
  flameEmblemGeometry,
  lanternFrameGeometry,
  lanternGlowGeometry,
  snowflakeEmblemGeometry,
} from './gear.js';
import { patchToonMaterial } from './toon-material.js';
import { VfxType } from './vfx.js';
const GEAR_ITEMS = ['lantern', 'emberCrest', 'frostCrest', 'cloudstep'];
export const isGearItem = (item) => !!item && GEAR_ITEMS.includes(item);
const PRIZE_TAU = Math.PI * 2;
const prizeClamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const prizeEaseOutBack = (t) => 1 + 3.2 * (t - 1) ** 3 + 2.2 * (t - 1) ** 2;
const prizeEaseInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
function prizeMaterial(ctx, label, options = {}) {
  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.5,
    metalness: 0,
    ...options,
  });
  material.name = `prize-${label}`;
  patchToonMaterial(material, ctx, {
    key: `wb-prize-${label}-v1`,
    rim: 1.1,
  });
  return material;
}
function prizeGradient(geometry, low, high = low) {
  const geo = geometry.index ? geometry.toNonIndexed() : geometry;
  if (geo.getAttribute('uv')) geo.deleteAttribute('uv');
  const position = geo.attributes.position;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < position.count; i++) {
    minY = Math.min(minY, position.getY(i));
    maxY = Math.max(maxY, position.getY(i));
  }
  const colors = new Float32Array(position.count * 3);
  const lowColor = new Color(low);
  const highColor = new Color(high);
  const mixed = new Color();
  for (let i = 0; i < position.count; i++) {
    mixed.copy(lowColor).lerp(highColor, maxY > minY ? (position.getY(i) - minY) / (maxY - minY) : 0);
    colors.set([mixed.r, mixed.g, mixed.b], i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  return geo;
}
function prizeBootGeometry() {
  const leather = 8210986;
  const leatherLight = 10248760;
  const shaft = new CylinderGeometry(0.05, 0.047, 0.26, 16, 1, true);
  shaft.translate(0, 0.2, 0);
  const foot = roundedBox(0.09, 0.074, 0.22, 0.034);
  foot.translate(0, 0.045, 0.05);
  const sole = roundedBox(0.097, 0.024, 0.228, 0.011);
  sole.translate(0, 0.012, 0.048);
  const cuff = new TorusGeometry(0.052, 0.014, 8, 18);
  cuff.rotateX(Math.PI / 2);
  cuff.translate(0, 0.325, 0);
  const parts = [
    prizeGradient(shaft, leather, leatherLight),
    prizeGradient(foot, leather),
    prizeGradient(sole, 3810327),
    prizeGradient(cuff, leatherLight),
  ];
  for (const part of parts) if (!part.getAttribute('normal')) part.computeVertexNormals();
  return mergePrizeParts(parts);
}
function mergePrizeParts(parts) {
  let total = 0;
  for (const part of parts) total += part.attributes.position.count;
  const positions = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  let offset = 0;
  for (const part of parts) {
    const pos = part.attributes.position.array;
    const nrm = part.attributes.normal.array;
    const col = part.attributes.color.array;
    positions.set(pos, offset * 3);
    normals.set(nrm, offset * 3);
    colors.set(col, offset * 3);
    offset += part.attributes.position.count;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('color', new BufferAttribute(colors, 3));
  return geometry;
}
export class AreaPrizes {
  ctx;
  group = new Group();
  lantern = new Group();
  lanternGlow;
  ember;
  frost;
  boots = new Group();
  bootWings = [];
  pos = new Vector3();
  havePos = false;
  lastItem = null;
  fxT = 0;
  landed = false;
  v = new Vector3();
  prizeWorld = new Vector3();
  lightK = 0;
  constructor(ctx) {
    this.ctx = ctx;
    this.group.name = 'area-prizes';
    const brass = prizeMaterial(ctx, 'brass', {
      roughness: 0.35,
      metalness: 0.2,
    });
    this.lanternGlow = new MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.6,
      emissive: 0xffa94d,
      emissiveIntensity: 3,
    });
    this.lanternGlow.name = 'prize-lantern-glow';
    const globeMat = new MeshStandardMaterial({
      color: 0xfff2d6,
      roughness: 0.08,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
      emissive: 0xffc070,
      emissiveIntensity: 0.9,
    });
    const globeGeo = new SphereGeometry(0.029, 16, 12);
    globeGeo.scale(1, 1.12, 1);
    globeGeo.translate(0, -0.092, 0);
    const globe = new Mesh(globeGeo, globeMat);
    globe.renderOrder = 3;
    this.lantern.add(new Mesh(lanternFrameGeometry(), brass), new Mesh(lanternGlowGeometry(), this.lanternGlow), globe);
    this.lantern.scale.setScalar(2.6);
    const makeMedal = (id, metalLight, metalDark, gemColor, emblemGeo, emblemColor) => {
      const group = new Group();
      const metal = prizeMaterial(ctx, `medal-${id}`, {
        roughness: 0.3,
        metalness: 0.25,
      });
      const rimGeo = new TorusGeometry(0.1, 0.017, 12, 40);
      const backGeo = new CylinderGeometry(0.1, 0.1, 0.014, 40);
      backGeo.rotateX(Math.PI / 2);
      backGeo.translate(0, 0, -0.008);
      const spikes = [];
      for (let i = 0; i < 8; i++) {
        const spike = new ConeGeometry(0.014, 0.04, 4);
        spike.translate(0, 0.128, 0);
        spike.rotateZ((i / 8) * PRIZE_TAU);
        spikes.push(prizeGradient(spike, metalLight, metalDark));
      }
      const frameGeo = mergePrizeParts([
        prizeGradient(rimGeo, metalLight, metalDark),
        prizeGradient(backGeo, metalDark),
        ...spikes,
      ]);
      const gemMat = new MeshStandardMaterial({
        color: gemColor,
        roughness: 0.2,
        metalness: 0.1,
        emissive: gemColor,
        emissiveIntensity: 0.9,
      });
      gemMat.name = `prize-${id}-gem`;
      const gemGeo = new CylinderGeometry(0.088, 0.088, 0.012, 40);
      gemGeo.rotateX(Math.PI / 2);
      const emblem = new Mesh(prizeGradient(emblemGeo, emblemColor, 16777215), metal);
      emblem.position.z = 0.012;
      group.add(new Mesh(frameGeo, metal), new Mesh(gemGeo, gemMat), emblem);
      return {
        group,
        gem: gemMat,
      };
    };
    this.ember = makeMedal('ember', 16766058, 10118164, 14168606, flameEmblemGeometry(0.13, 0.014), 16765802);
    this.frost = makeMedal('frost', 15398143, 8164275, 2916310, snowflakeEmblemGeometry(0.13, 0.01), 16055295);
    const bootMat = prizeMaterial(ctx, 'boots', {
      roughness: 0.7,
    });
    const cloudMat = prizeMaterial(ctx, 'cloud', {
      roughness: 0.9,
      emissive: 0x9fb7d6,
      emissiveIntensity: 0.18,
    });
    const wingMat = prizeMaterial(ctx, 'wing', {
      roughness: 0.7,
      side: DoubleSide,
      emissive: 0xaec6e6,
      emissiveIntensity: 0.18,
    });
    const bootGeo = prizeBootGeometry();
    const cloudGeo = cloudRingGeometry(0.064, 5);
    const wingGeo = bootWingGeometry();
    for (const side of [1, -1]) {
      const boot = new Group();
      boot.position.set(side * 0.09, 0, 0);
      boot.rotation.set(0.25, side * 0.18, side * -0.08);
      boot.add(new Mesh(bootGeo, bootMat));
      const cloud = new Mesh(cloudGeo, cloudMat);
      cloud.position.y = 0.34;
      boot.add(cloud);
      const wing = new Group();
      wing.position.set(side * 0.052, 0.235, -0.018);
      const feathers = new Mesh(wingGeo, wingMat);
      feathers.scale.setScalar(1.9);
      wing.add(feathers);
      boot.add(wing);
      this.bootWings.push(wing);
      this.boots.add(boot);
    }
    this.boots.scale.setScalar(1.25);
    for (const prize of [this.lantern, this.ember.group, this.frost.group, this.boots]) {
      prize.visible = false;
      prize.traverse((child) => {
        child.frustumCulled = false;
        if (child.isMesh) child.castShadow = true;
      });
      this.group.add(prize);
    }
  }
  obj(item) {
    return item === 'lantern'
      ? this.lantern
      : item === 'emberCrest'
        ? this.ember.group
        : item === 'frostCrest'
          ? this.frost.group
          : this.boots;
  }
  update(dt, item, holdT, handsMid, slot, fx) {
    const hold = ITEM_HOLD;
    const prize = isGearItem(item) ? item : null;
    if (prize !== this.lastItem) {
      if (this.lastItem) this.obj(this.lastItem).visible = false;
      this.lastItem = prize;
      this.havePos = false;
      this.landed = false;
    }
    this.lightK = 0;
    if (!prize || holdT < hold.reveal - 0.02) {
      if (prize) this.obj(prize).visible = false;
      return;
    }
    const model = this.obj(prize);
    const camPos = this.ctx.camera.position;
    const lift = prize === 'cloudstep' ? 0.1 : prize === 'lantern' ? 0.3 : 0.04;
    this.v.copy(handsMid);
    this.v.y += lift + 0.025 * Math.sin(holdT * 2.8);
    this.havePos ||= (this.pos.copy(this.v), true);
    this.pos.lerp(this.v, 1 - Math.exp(-16 * Math.max(dt, 0.001)));
    let pop = prizeEaseOutBack(prizeClamp01((holdT - hold.reveal) / 0.4));
    let stow = 0;
    if (holdT >= hold.lower) {
      stow = prizeEaseInOut(prizeClamp01((holdT - hold.lower) / (hold.dur - hold.lower - 0.12)));
      this.pos.lerp(slot, stow);
      pop *= 1 - stow * 0.72;
    }
    model.visible = pop > 0.01;
    model.position.copy(this.pos);
    const angle = Math.atan2(camPos.x - this.pos.x, camPos.z - this.pos.z);
    const size = Math.max(0.001, pop);
    switch (prize) {
      case 'lantern':
        model.scale.setScalar(2.6 * size);
        model.rotation.set(
          0.12 * Math.sin(holdT * 2.1),
          angle + 0.5 * Math.sin(holdT * 0.9),
          0.1 * Math.sin(holdT * 2.6 + 1),
          'YXZ',
        );
        this.lanternGlow.emissiveIntensity =
          3 + 1.2 * Math.sin(holdT * 5) + (holdT - hold.reveal < 0.35 ? 5 * (1 - (holdT - hold.reveal) / 0.35) : 0);
        this.lightK = pop * (1 - stow * 0.5);
        this.prizeWorld.copy(this.pos);
        this.prizeWorld.y -= 0.2;
        break;
      case 'emberCrest':
      case 'frostCrest': {
        model.scale.setScalar(1.3 * size);
        model.rotation.set(
          0.05 * Math.sin(holdT * 1.7),
          angle + 0.55 * Math.sin(holdT * 1.25),
          0.05 * Math.sin(holdT * 2.1),
          'YXZ',
        );
        const medal = prize === 'emberCrest' ? this.ember : this.frost;
        medal.gem.emissiveIntensity =
          0.9 +
          0.35 * Math.sin(holdT * 4.5) +
          (holdT - hold.reveal < 0.35 ? 3 * (1 - (holdT - hold.reveal) / 0.35) : 0);
        break;
      }
      case 'cloudstep': {
        model.scale.setScalar(1.25 * size);
        model.rotation.set(0.1, angle + 0.75 + 0.3 * Math.sin(holdT * 1.1), 0, 'YXZ');
        const flutter = Math.sin(holdT * 16) * 0.5;
        this.bootWings.forEach((bootWing, i) =>
          bootWing.rotation.set(-0.2, -(i === 0 ? 1 : -1) * (0.8 + flutter), 0, 'YXZ'),
        );
        break;
      }
    }
    if (!(!fx || dt <= 0)) {
      if (holdT < hold.lower + 0.2)
        for (this.fxT -= dt * 34; this.fxT <= 0;) {
          this.fxT += 1;
          this.emitAround(fx, prize, pop);
        }
      if (stow >= 0.98 && !this.landed) {
        this.landed = true;
        const color =
          prize === 'lantern'
            ? 16766874
            : prize === 'emberCrest'
              ? 16747082
              : prize === 'frostCrest'
                ? 11066623
                : 16777215;
        fx.vfx.emit({
          type: VfxType.Star,
          x: slot.x,
          y: slot.y,
          z: slot.z,
          size: 0.55,
          grow: 1.6,
          life: 0.2,
          color,
          alpha: 1,
        });
        fx.sparkle(slot, color, 12, 2.4);
        if (prize === 'cloudstep')
          for (let i = 0; i < 10; i++) {
            const angle = (i / 10) * PRIZE_TAU;
            fx.vfx.emit({
              type: VfxType.Puff,
              x: slot.x + Math.cos(angle) * 0.2,
              y: slot.y,
              z: slot.z + Math.sin(angle) * 0.2,
              vx: Math.cos(angle) * 1.2,
              vy: 0.2,
              vz: Math.sin(angle) * 1.2,
              size: 0.14,
              grow: 2,
              life: 0.6,
              color: 0xf6f9ff,
              alpha: 0.9,
              drag: 3,
            });
          }
      }
    }
  }
  emitAround(fx, item, pop) {
    const pos = this.pos;
    const angle = Math.random() * PRIZE_TAU;
    const radius = (0.12 + Math.random() * 0.14) * Math.max(0.3, pop);
    const vfx = fx.vfx;
    switch (item) {
      case 'lantern':
        vfx.emit({
          type: Math.random() < 0.5 ? VfxType.Star : VfxType.Drop,
          x: pos.x + Math.cos(angle) * radius,
          y: pos.y - 0.15 + (Math.random() - 0.5) * 0.2,
          z: pos.z + Math.sin(angle) * radius,
          vx: Math.cos(angle) * 0.2,
          vy: 0.4 + Math.random() * 0.5,
          vz: Math.sin(angle) * 0.2,
          size: 0.025 + Math.random() * 0.03,
          life: 0.7,
          color: Math.random() < 0.5 ? 16769704 : 16757322,
          alpha: 1,
          drag: 1.4,
        });
        break;
      case 'emberCrest':
        vfx.emit({
          type: VfxType.Drop,
          x: pos.x + Math.cos(angle) * 0.13 * pop,
          y: pos.y + Math.sin(angle) * 0.13 * pop,
          z: pos.z,
          vx: (Math.random() - 0.5) * 0.3,
          vy: 0.9 + Math.random() * 0.8,
          vz: (Math.random() - 0.5) * 0.3,
          size: 0.03 + Math.random() * 0.03,
          grow: 0.3,
          life: 0.45,
          color: Math.random() < 0.5 ? 16742958 : 16760906,
          alpha: 1,
          drag: 1,
        });
        break;
      case 'frostCrest':
        vfx.emit({
          type: Math.random() < 0.4 ? VfxType.Star : VfxType.Fleck,
          x: pos.x + Math.cos(angle) * radius,
          y: pos.y + (Math.random() - 0.5) * 0.25,
          z: pos.z + Math.sin(angle) * radius,
          vx: Math.cos(angle) * 0.25,
          vy: -0.1 + Math.random() * 0.3,
          vz: Math.sin(angle) * 0.25,
          size: 0.025 + Math.random() * 0.025,
          life: 0.8,
          color: Math.random() < 0.5 ? 15267839 : 9425151,
          alpha: 1,
          drag: 1.2,
          spin: 4,
        });
        break;
      case 'cloudstep':
        vfx.emit({
          type: VfxType.Puff,
          x: pos.x + Math.cos(angle) * radius,
          y: pos.y - 0.05,
          z: pos.z + Math.sin(angle) * radius,
          vx: Math.cos(angle) * 0.3,
          vy: -0.3,
          vz: Math.sin(angle) * 0.3,
          size: 0.06 + Math.random() * 0.05,
          grow: 1.8,
          life: 0.6,
          color: 0xffffff,
          alpha: 0.8,
          drag: 2,
        });
    }
  }
}
