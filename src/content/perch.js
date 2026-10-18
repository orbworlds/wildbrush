/**
 * The Painter's Perch on the summit: a socket for each colour lights up as its trial is won, and once all four are lit the stone bud opens, a pillar of light rises and the Skybrush floats up. Runs the awakening and claiming cinematics and the prompt to take up the Skybrush, which grants brushflight.
 */
import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  CustomBlending,
  DoubleSide,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  QuadraticBezierCurve3,
  Quaternion,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  TubeGeometry,
  Vector3,
  Vector4,
} from 'three';
import { COLLISION_GROUPS, COLORS } from '../core/config.js';
import { ParticleMode } from '../shared/particles.js';
import {
  columnGeometry,
  displace,
  fillAttribute,
  glowTexture,
  heightStats,
  lathe,
  mergeGeometries,
  randRange,
  rng,
  rockGeometry,
  taperedTube,
  TAU,
  yawTo,
} from '../shared/util.js';
import {
  DAIS_H,
  DAIS_R,
  DRUM_R,
  easeInOutCubic,
  easeOutBack,
  paletteHex,
  PERCH_HINT,
  PERCH_RING_FRAGMENT,
  PERCH_RING_VERTEX,
  PETAL_COUNT,
  PETAL_OPEN_ANGLE,
  PETAL_SCALE,
  petalGeometry,
  petalMaterial,
  PILLAR_FRAGMENT,
  PILLAR_VERTEX,
  prongCurve,
  RELIC_RISE,
  RELIC_SCALE,
  relicMaterial,
  RIBBON_FRAGMENT,
  RIBBON_VERTEX,
  SKYBRUSH_HINT,
  skybrushGeometry,
  smoothstep,
  SOCKET_GLOW_SLOT,
  SOCKET_GLYPH,
  SOCKET_R,
  TRIAL_LANDMARK,
  wingGeometry,
  xyz,
} from './perch-parts.js';
import { crystalGeometry, PRISM_FRAGMENT, PRISM_VERTEX } from './prism.js';
import { hintStone, STONE, stoneBlock, stoneColor } from './ruin-kit.js';
import { addClearing, Site } from './site.js';
export class Perch {
  ctx;
  mats;
  particles;
  hints;
  state = 'dormant';
  center;
  floor;
  warp;
  sockets = [];
  onClaimed = null;
  t = 0;
  fired = new Set();
  petals;
  petalYaw = [];
  petalGlow = {
    value: 0,
  };
  petalCurl = {
    value: 0,
  };
  open = 0;
  crack = 0;
  relic = new Group();
  wingL = new Group();
  wingR = new Group();
  relicGlow = {
    value: 0.7,
  };
  relicHalo;
  coreGlow;
  pillar;
  pu;
  arcs = null;
  au;
  ring;
  ru;
  ringT = -1;
  ringMax = 30;
  ringDur = 2;
  budCollider = null;
  rise = 0;
  wings = 0;
  spin = 0;
  pillarK = 0;
  emitAcc = 0;
  promptOn = false;
  claimFrom = new Vector3();
  tip = new Vector3();
  tmp = new Vector3();
  tmp2 = new Vector3();
  shot = {
    position: new Vector3(),
    target: new Vector3(),
    fov: 50,
    blend: 1.1,
  };
  cine = 'none';
  cineEnd = 0;
  cineYaw = 0;
  lookLift = 2.6;
  cineDecided = false;
  controlTaken = false;
  hintPos = null;
  ribbonK = 1;
  constructor(ctx, mats, particles, hints, trials) {
    this.ctx = ctx;
    this.mats = mats;
    this.particles = particles;
    this.hints = hints;
    const summit = ctx.terrain.landmarks.summit;
    let peak = summit.clone();
    for (let dz = -6; dz <= 6; dz += 1)
      for (let dx = -6; dx <= 6; dx += 1) {
        const y = ctx.terrain.heightAt(summit.x + dx, summit.z + dz);
        if (y > peak.y) peak = xyz(summit.x + dx, y, summit.z + dz);
      }
    const floor = Math.max(heightStats(ctx, peak.x, peak.z, 3.4).max, peak.y) + 0.35;
    this.floor = floor;
    this.center = xyz(peak.x, floor, peak.z);
    const center = this.center;
    const colorYaw = {};
    for (const color of COLORS) {
      const landmark = ctx.terrain.landmarks[TRIAL_LANDMARK[color]];
      colorYaw[color] = landmark
        ? Math.atan2(landmark.x - center.x, landmark.z - center.z)
        : (COLORS.indexOf(color) / 4) * TAU;
    }
    const yaws = COLORS.map((color) => ((colorYaw[color] % TAU) + TAU) % TAU).sort((a, b) => a - b);
    let gapYaw = 0;
    let widest = -1;
    for (let i = 0; i < yaws.length; i++) {
      const yaw = yaws[i];
      const next = i + 1 < yaws.length ? yaws[i + 1] : yaws[0] + TAU;
      if (next - yaw > widest) {
        widest = next - yaw;
        gapYaw = (yaw + next) / 2;
      }
    }
    const site = new Site(ctx, 'perch');
    const rand = rng('perch');
    const stairYaw = this.buildDrum(site, rand, gapYaw);
    this.buildFloor(site, rand, colorYaw);
    this.buildRim(site, rand, colorYaw, stairYaw);
    site.build(mats);
    addClearing(center.x, center.z, 5.9);
    const warpYaw = stairYaw - 0.32;
    const warpPos = xyz(center.x + Math.sin(warpYaw) * 3.25, floor + 0.15, center.z + Math.cos(warpYaw) * 3.25);
    this.warp = {
      pos: warpPos,
      facing: yawTo(warpPos.x, warpPos.z, center.x, center.z),
    };
    const globals = ctx.globals;
    for (const color of COLORS) {
      const yaw = colorYaw[color];
      const pos = xyz(center.x + Math.sin(yaw) * SOCKET_R, floor + 1.52, center.z + Math.cos(yaw) * SOCKET_R);
      const uniforms = {
        ...globals,
        uColor: {
          value: new Color(paletteHex(color)),
        },
        uActive: {
          value: 0,
        },
        uCharge: {
          value: 0,
        },
        uFlash: {
          value: 0,
        },
      };
      const crystal = new Mesh(
        crystalGeometry(0.17, 0.27, 0.14, 0.3, 6),
        new ShaderMaterial({
          uniforms,
          vertexShader: PRISM_VERTEX,
          fragmentShader: PRISM_FRAGMENT,
        }),
      );
      crystal.position.copy(pos);
      crystal.name = `perch-socket-${color}`;
      ctx.scene.add(crystal);
      const halo = new Sprite(
        new SpriteMaterial({
          map: glowTexture(),
          color: paletteHex(color),
          blending: AdditiveBlending,
          depthWrite: false,
          transparent: true,
          opacity: 0,
          fog: false,
        }),
      );
      halo.position.copy(pos);
      halo.scale.setScalar(2.2);
      halo.renderOrder = 8;
      ctx.scene.add(halo);
      this.sockets.push({
        color,
        yaw,
        pos,
        crystal,
        cu: uniforms,
        halo,
        lit: false,
        since: -1,
        arc: -1,
        arcIdx: -1,
        glow: 0.12,
      });
    }
    const petalGeo = petalGeometry();
    const petalColors = new Float32Array(24);
    for (let i = 0; i < PETAL_COUNT; i++) {
      const color = new Color(paletteHex(COLORS[i % 4]));
      petalColors.set([color.r, color.g, color.b], i * 3);
      this.petalYaw.push((i / PETAL_COUNT) * TAU + Math.PI / PETAL_COUNT);
    }
    petalGeo.setAttribute('aPetal', new InstancedBufferAttribute(petalColors, 3));
    this.petals = new InstancedMesh(petalGeo, petalMaterial(ctx, this.petalGlow, this.petalCurl), PETAL_COUNT);
    this.petals.frustumCulled = false;
    this.petals.name = 'perch-petals';
    this.petals.castShadow = true;
    this.petals.receiveShadow = true;
    ctx.scene.add(this.petals);
    this.placePetals(0, 0);
    this.coreGlow = new Sprite(
      new SpriteMaterial({
        map: glowTexture(),
        color: 0xfff2d8,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0,
        fog: false,
      }),
    );
    this.coreGlow.position.set(center.x, floor + DAIS_H + 1, center.z);
    this.coreGlow.scale.setScalar(2.5);
    this.coreGlow.renderOrder = 8;
    ctx.scene.add(this.coreGlow);
    const relicMat = relicMaterial(this.relicGlow);
    const brush = new Mesh(skybrushGeometry(), relicMat);
    brush.castShadow = true;
    this.relic.add(brush);
    const wingGeo = wingGeometry();
    const leftWing = new Mesh(wingGeo, relicMat);
    const rightWing = new Mesh(wingGeo.clone().applyMatrix4(new Matrix4().makeScale(1, 1, -1)), relicMat);
    leftWing.castShadow = rightWing.castShadow = true;
    this.wingL.position.set(1.08, 0.04, 0.06);
    this.wingR.position.set(1.08, 0.04, -0.06);
    this.wingL.add(leftWing);
    this.wingR.add(rightWing);
    this.relic.add(this.wingL, this.wingR);
    this.relic.scale.setScalar(RELIC_SCALE);
    this.relic.name = 'perch-skybrush';
    this.relic.visible = false;
    ctx.scene.add(this.relic);
    this.relicHalo = new Sprite(
      new SpriteMaterial({
        map: glowTexture(),
        color: 0xfff6e6,
        blending: AdditiveBlending,
        depthWrite: false,
        transparent: true,
        opacity: 0,
        fog: false,
      }),
    );
    this.relicHalo.scale.setScalar(4.5);
    this.relicHalo.renderOrder = 8;
    this.relicHalo.visible = false;
    ctx.scene.add(this.relicHalo);
    this.pu = {
      ...globals,
      uCam: globals.uCameraPos,
      uIntensity: {
        value: 0,
      },
      uHeight: {
        value: 420,
      },
      uWidth: {
        value: 2,
      },
      uGrow: {
        value: 0,
      },
    };
    const pillarGeo = new PlaneGeometry(1, 1, 1, 64);
    pillarGeo.translate(0, 0.5, 0);
    this.pillar = new Mesh(
      pillarGeo,
      new ShaderMaterial({
        uniforms: this.pu,
        vertexShader: PILLAR_VERTEX,
        fragmentShader: PILLAR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: OneFactor,
        blendDst: OneMinusSrcAlphaFactor,
        side: DoubleSide,
      }),
    );
    this.pillar.frustumCulled = false;
    this.pillar.renderOrder = 9;
    this.pillar.position.set(center.x, floor + DAIS_H + 0.2, center.z);
    this.pillar.visible = false;
    ctx.scene.add(this.pillar);
    this.au = {
      ...globals,
      uRadius: {
        value: 0.32,
      },
      uProg: {
        value: new Vector4(),
      },
      uAlpha: {
        value: new Vector4(),
      },
    };
    const arcGeometries = [];
    for (const trial of trials) {
      const socket = this.sockets.find((socket) => socket.color === trial.def.color);
      if (!trial.prism || !socket) continue;
      const from = trial.prism.position.clone().add(xyz(0, 55, 0));
      const to = socket.pos.clone().add(xyz(0, 0.35, 0));
      const ctrl = from.clone().lerp(to, 0.5);
      ctrl.y = Math.max(from.y, to.y) + 22 + from.distanceTo(to) * 0.12;
      const tube = new TubeGeometry(new QuadraticBezierCurve3(from, ctrl, to), 120, 0.05, 6, false);
      const count = tube.attributes.position.count;
      const colors = new Float32Array(count * 3);
      const color = new Color(paletteHex(trial.def.color));
      for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
      tube.setAttribute('aColor', new BufferAttribute(colors, 3));
      socket.arcIdx = arcGeometries.length;
      fillAttribute(tube, 'aIdx', 1, socket.arcIdx);
      arcGeometries.push(tube);
    }
    if (arcGeometries.length) {
      const merged = mergeGeometries(arcGeometries);
      for (const geometry of arcGeometries) geometry.dispose();
      this.arcs = new Mesh(
        merged,
        new ShaderMaterial({
          uniforms: this.au,
          vertexShader: RIBBON_VERTEX,
          fragmentShader: RIBBON_FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: CustomBlending,
          blendSrc: OneFactor,
          blendDst: OneMinusSrcAlphaFactor,
        }),
      );
      this.arcs.frustumCulled = false;
      this.arcs.renderOrder = 6;
      this.arcs.visible = false;
      this.arcs.name = 'perch-ribbons';
      ctx.scene.add(this.arcs);
    }
    this.ru = {
      uAlpha: {
        value: 0,
      },
    };
    this.ring = new Mesh(
      new PlaneGeometry(2, 2).rotateX(-Math.PI / 2),
      new ShaderMaterial({
        uniforms: this.ru,
        vertexShader: PERCH_RING_VERTEX,
        fragmentShader: PERCH_RING_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    );
    this.ring.position.set(center.x, floor + 0.12, center.z);
    this.ring.visible = false;
    this.ring.renderOrder = 8;
    ctx.scene.add(this.ring);
    this.budCollider = this.addCollider(
      ctx.RAPIER.ColliderDesc.cylinder(0.95 * PETAL_SCALE * 1.25, 0.98 * PETAL_SCALE * 1.2),
      xyz(center.x, floor + DAIS_H + 0.95 * PETAL_SCALE * 1.25, center.z),
    );
    for (let i = 5; i <= 8; i++) mats.siteGlow.value[i] = 0.12;
  }
  buildDrum(site, rand, yaw) {
    const ctx = this.ctx;
    const center = this.center;
    const floor = this.floor;
    const stats = heightStats(ctx, center.x, center.z, 5.3);
    const baseY = Math.min(stats.min, floor) - 1.6;
    const height = floor - baseY;
    const drum = lathe(
      [
        [0, 0],
        [5.05, 0],
        [4.88, height * 0.45],
        [4.72, height - 0.62],
        [4.96, height - 0.5],
        [5, height - 0.14],
        [4.94, height],
        [0, height],
      ],
      48,
    );
    displace(drum, 0.07, 0.6, 5);
    site.stone(drum, xyz(center.x, baseY, center.z), 0, stoneColor(rand, STONE.dark));
    site.cylCol(xyz(center.x, (floor + baseY) / 2, center.z), height / 2, 4.8);
    for (let i = 0; i < 18; i++) {
      const angle = (i / 18) * TAU + randRange(rand, -0.12, 0.12);
      const radius = DRUM_R + randRange(rand, 0.15, 0.6);
      const x = center.x + Math.sin(angle) * radius;
      const z = center.z + Math.cos(angle) * radius;
      const ground = ctx.terrain.heightAt(x, z);
      if (ground > floor - 1.2) continue;
      const size = randRange(rand, 0.4, 0.8);
      site.stone(
        rockGeometry(size, rand() * 99, 0.6),
        xyz(x, ground - size * 0.2, z),
        rand() * TAU,
        stoneColor(rand, STONE.dark).multiplyScalar(0.85),
      );
    }
    const band = lathe(
      [
        [4.72, -0.14],
        [4.8, -0.06],
        [4.8, 0.07],
        [4.72, 0.14],
      ],
      48,
    );
    site.stone(band, xyz(center.x, floor - 1.25, center.z), 0, stoneColor(rand, STONE.marble));
    for (let i = 0; i < 28; i++) {
      const angle = (i / 28) * TAU;
      const normal = xyz(Math.sin(angle), 0, Math.cos(angle));
      site.glyph(
        xyz(center.x, floor - 1.25, center.z).addScaledVector(normal, 4.805000000000001),
        normal,
        0.2,
        (i * 5) % 15,
        15260072,
        0,
      );
    }
    const rise = 0.3;
    const stairR = 5.32;
    const stepAngle = 1 / stairR;
    let best = null;
    for (const dir of [1, -1])
      for (const offset of [0, 0.12, -0.12, 0.25, -0.25]) {
        const topYaw = yaw + offset;
        let steps = 0;
        for (let i = 0; i < 40; i++) {
          const stepYaw = topYaw - dir * (i + 0.5) * stepAngle;
          const stepY = floor - (i + 1) * rise;
          if (
            Math.max(
              ctx.terrain.heightAt(center.x + Math.sin(stepYaw) * 5.9, center.z + Math.cos(stepYaw) * 5.9),
              ctx.terrain.heightAt(center.x + Math.sin(stepYaw) * stairR, center.z + Math.cos(stepYaw) * stairR),
            ) >=
            stepY - 0.25
          )
            break;
          steps++;
        }
        const score = steps + Math.abs(offset) * 6;
        if (!best || score < best.score)
          best = {
            dir,
            top: topYaw,
            n: steps,
            score,
          };
      }
    if (best && best.n > 0) {
      const stepColor = stoneColor(rand, STONE.pale);
      for (let i = 0; i <= best.n; i++) {
        const stepYaw = best.top - best.dir * (i + 0.5) * stepAngle;
        const stepY = floor - (i + 1) * rise;
        stoneBlock(
          site,
          xyz(center.x + Math.sin(stepYaw) * stairR, stepY - 0.15, center.z + Math.cos(stepYaw) * stairR),
          1.08,
          0.3,
          1.3,
          stepYaw,
          rand,
          {
            color: stepColor.clone().multiplyScalar(0.96 + rand() * 0.08),
            round: 0.05,
            wear: 0.02,
          },
        );
        stoneBlock(
          site,
          xyz(center.x + Math.sin(stepYaw) * 4.95, stepY - 0.62, center.z + Math.cos(stepYaw) * 4.95),
          0.55,
          0.62,
          0.7,
          stepYaw,
          rand,
          {
            collider: false,
            color: stoneColor(rand, STONE.dark),
            round: 0.08,
          },
        );
      }
    }
    return best ? best.top : yaw;
  }
  buildFloor(site, rand, colorYaw) {
    this.ctx;
    const center = this.center;
    const floor = this.floor;
    const up = xyz(0, 1, 0);
    const disc = lathe(
      [
        [0, -0.1],
        [4.25, -0.1],
        [4.32, -0.03],
        [4.25, 0.02],
        [0, 0.02],
      ],
      44,
    );
    displace(disc, 0.012, 1.6, 2);
    site.stone(disc, xyz(center.x, floor, center.z), 0, stoneColor(rand, STONE.marble));
    const nearestColor = (yaw) => {
      let best = 'red';
      let bestDiff = Infinity;
      for (const color of COLORS) {
        const diff = Math.abs(Math.atan2(Math.sin(yaw - colorYaw[color]), Math.cos(yaw - colorYaw[color])));
        if (diff < bestDiff) {
          bestDiff = diff;
          best = color;
        }
      }
      return best;
    };
    for (const [radius, thickness] of [
      [2.93, 0.07],
      [3.77, 0.07],
    ]) {
      const count = Math.round((TAU * radius) / 0.32);
      for (let i = 0; i < count; i++) {
        const angle = ((i + 0.5) / count) * TAU;
        const color = nearestColor(angle);
        site.glyph(
          xyz(center.x + Math.sin(angle) * radius, floor + 0.024, center.z + Math.cos(angle) * radius),
          up,
          (TAU * radius) / count + 0.01,
          15,
          paletteHex(color),
          SOCKET_GLOW_SLOT[color],
          angle,
          thickness,
        );
      }
    }
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * TAU;
      const color = nearestColor(angle);
      if (
        !COLORS.some(
          (color) => Math.abs(Math.atan2(Math.sin(angle - colorYaw[color]), Math.cos(angle - colorYaw[color]))) < 0.2,
        )
      )
        site.glyph(
          xyz(center.x + Math.sin(angle) * SOCKET_R, floor + 0.024, center.z + Math.cos(angle) * SOCKET_R),
          up,
          0.46,
          i % 15,
          paletteHex(color),
          SOCKET_GLOW_SLOT[color],
          angle,
        );
    }
    const stand = lathe(
      [
        [0, 0],
        [0.52, 0],
        [0.55, 0.1],
        [0.44, 0.22],
        [0.33, 0.62],
        [0.36, 0.72],
        [0.47, 0.84],
        [0.5, 0.95],
        [0.42, 1],
        [0.2, 0.96],
        [0, 0.95],
      ],
      24,
    );
    displace(stand, 0.012, 2, 4);
    for (const color of COLORS) {
      const yaw = colorYaw[color];
      const dir = xyz(Math.sin(yaw), 0, Math.cos(yaw));
      const base = xyz(center.x, floor, center.z).addScaledVector(dir, SOCKET_R);
      site.stone(stand.clone(), base, yaw, stoneColor(rand, STONE.marble));
      site.cylCol(xyz(base.x, floor + 0.5, base.z), 0.5, 0.47);
      for (let i = 0; i < 3; i++) {
        const angle = yaw + (i / 3) * TAU + Math.PI / 3;
        site.prop(
          taperedTube(prongCurve(angle, base), 12, 6, (t) => 0.045 * (1 - t * 0.75) + 0.007),
          xyz(0, 0, 0),
          0,
          15247662,
        );
      }
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * TAU;
        const normal = xyz(Math.sin(angle), 0, Math.cos(angle));
        site.glyph(
          xyz(base.x, floor + 0.72, base.z).addScaledVector(normal, 0.365),
          normal,
          (TAU * 0.365) / 12 + 0.01,
          15,
          paletteHex(color),
          SOCKET_GLOW_SLOT[color],
          0,
          0.06,
        );
      }
      site.glyph(
        xyz(base.x, floor + 0.45, base.z).addScaledVector(dir, 0.4),
        dir,
        0.34,
        SOCKET_GLYPH[color],
        paletteHex(color),
        SOCKET_GLOW_SLOT[color],
      );
      const back = dir.clone().negate();
      site.glyph(
        xyz(base.x, floor + 0.45, base.z).addScaledVector(back, 0.4),
        back,
        0.34,
        SOCKET_GLYPH[color],
        paletteHex(color),
        SOCKET_GLOW_SLOT[color],
      );
      const pathLen = 1.42;
      const pathMid = xyz(center.x, floor + 0.026, center.z).addScaledVector(dir, 4.16 / 2);
      site.glyph(pathMid, up, pathLen, 15, paletteHex(color), SOCKET_GLOW_SLOT[color], yaw - Math.PI / 2, 0.11);
      for (const side of [-1, 1]) {
        const offset = xyz(dir.z, 0, -dir.x).multiplyScalar(0.16 * side);
        site.glyph(
          pathMid.clone().add(offset),
          up,
          pathLen * 0.9,
          15,
          15260072,
          SOCKET_GLOW_SLOT[color],
          yaw - Math.PI / 2,
          0.03,
        );
      }
    }
    const plinth = lathe(
      [
        [0, 0],
        [1.3, 0],
        [1.33, 0.1],
        [1.2, 0.18],
        [1.12, 0.38],
        [1.2, 0.45],
        [1.16, 0.52],
        [0, DAIS_H],
      ],
      36,
    );
    displace(plinth, 0.012, 2, 8);
    site.stone(plinth, xyz(center.x, floor - 0.02, center.z), 0, stoneColor(rand, STONE.pale));
    site.cylCol(xyz(center.x, floor + DAIS_H / 2, center.z), DAIS_H / 2, DAIS_R);
    for (let i = 0; i < 16; i++) {
      const angle = ((i + 0.5) / 16) * TAU;
      const color = nearestColor(angle);
      const normal = xyz(Math.sin(angle), 0, Math.cos(angle));
      site.glyph(
        xyz(center.x, floor + 0.29, center.z).addScaledVector(normal, 1.125),
        normal,
        0.2,
        (i * 3) % 15,
        paletteHex(color),
        SOCKET_GLOW_SLOT[color],
      );
      site.glyph(
        xyz(center.x, floor + DAIS_H + 0.004, center.z).addScaledVector(normal, 1.05),
        up,
        (TAU * 1.05) / 16 + 0.01,
        15,
        paletteHex(color),
        SOCKET_GLOW_SLOT[color],
        angle,
        0.06,
      );
    }
  }
  buildRim(site, rand, colorYaw, stairYaw) {
    const ctx = this.ctx;
    const center = this.center;
    const floor = this.floor;
    const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const yaws = COLORS.map((color) => colorYaw[color]).sort((a, b) => a - b);
    const pillarYaws = [];
    let count = 0;
    for (let i = 0; i < yaws.length; i++) {
      const yaw = (yaws[i] + (i + 1 < yaws.length ? yaws[i + 1] : yaws[0] + TAU)) / 2;
      if (angleDiff(yaw, stairYaw) < 0.7) continue;
      pillarYaws.push(yaw);
      const x = center.x + Math.sin(yaw) * 4.32;
      const z = center.z + Math.cos(yaw) * 4.32;
      const tall = count++ % 2 == 0;
      const height = tall ? randRange(rand, 3.2, 3.8) : randRange(rand, 1.4, 2.2);
      const column = columnGeometry(0.34, height + 0.1, {
        capital: tall,
        broken: tall ? 0 : randRange(rand, 0.35, 0.6),
        seed: rand() * 100,
      });
      site.stone(
        column,
        xyz(x, floor - 0.1, z),
        new Euler((rand() - 0.5) * 0.04, rand() * TAU, (rand() - 0.5) * 0.04),
        stoneColor(rand),
      );
      site.cylCol(xyz(x, floor - 0.1 + (height + 0.1) / 2, z), (height + 0.1) / 2, 0.37);
      const inward = xyz(Math.sin(yaw), 0, Math.cos(yaw)).negate();
      site.glyph(
        xyz(x, floor + Math.min(height * 0.55, 1.4), z).addScaledVector(inward, 0.33),
        inward,
        0.36,
        (count * 5) % 15,
        15260072,
        0,
      );
    }
    const wallR = 4.4;
    for (let i = 0; i < 14; i++) {
      const yaw = ((i + 0.5) / 14) * TAU;
      if (
        angleDiff(yaw, stairYaw) < 0.5 ||
        pillarYaws.some((pillarYaw) => angleDiff(yaw, pillarYaw) < 0.3) ||
        rand() < 0.3
      )
        continue;
      const height = randRange(rand, 0.35, 0.85);
      const segLen = (TAU * wallR) / 14 - 0.22;
      stoneBlock(
        site,
        xyz(center.x + Math.sin(yaw) * wallR, floor + height / 2 - 0.05, center.z + Math.cos(yaw) * wallR),
        segLen,
        height + 0.1,
        0.42,
        yaw,
        rand,
        {
          color: stoneColor(rand, STONE.pale),
        },
      );
    }
    const hintYaw = stairYaw + 0.62;
    const hx = center.x + Math.sin(hintYaw) * 3.95;
    const hz = center.z + Math.cos(hintYaw) * 3.95;
    const lookX = center.x + Math.sin(stairYaw) * 4.6;
    const lookZ = center.z + Math.cos(stairYaw) * 4.6;
    const hintPos = hintStone(site, ctx, hx, hz, yawTo(hx, hz, lookX, lookZ), 1.5, rand, 15260072, floor + 0.02);
    this.hintPos = hintPos;
    this.hints.add(hintPos, PERCH_HINT, 3);
  }
  addCollider(desc, pos) {
    try {
      desc.setTranslation(pos.x, pos.y, pos.z).setCollisionGroups(COLLISION_GROUPS.static).setFriction(0.8);
      const collider = this.ctx.physics.createCollider(desc);
      this.ctx.colliders.register(collider, {
        kind: 'structure',
        surface: 'stone',
        data: {
          site: 'perch',
        },
      });
      return collider;
    } catch (err) {
      console.warn('[content] perch collider failed', err);
      return null;
    }
  }
  removeBudCollider() {
    const budCollider = this.budCollider;
    if (budCollider) {
      this.budCollider = null;
      try {
        this.ctx.colliders.unregister(budCollider);
        this.ctx.physics.removeCollider(budCollider, false);
      } catch (err) {
        console.warn('[content] perch collider removal failed', err);
      }
    }
  }
  _m = new Matrix4();
  _q = new Quaternion();
  _q2 = new Quaternion();
  _p = new Vector3();
  _s = new Vector3(1, 1, 1);
  _ax = new Vector3();
  placePetals(spread, strain) {
    const center = this.center;
    const radius = 0.98 * PETAL_SCALE;
    const y = this.floor + DAIS_H - 0.02;
    for (let i = 0; i < PETAL_COUNT; i++) {
      const yaw = this.petalYaw[i];
      const jitter = strain ? Math.sin(this.t * 37 + i * 2.3) * 0.02 * strain : 0;
      const tilt =
        spread * PETAL_OPEN_ANGLE * (0.94 + (0.12 * ((i * 7) % 3)) / 2) +
        strain * (0.05 + 0.03 * Math.sin(i * 1.7)) +
        jitter;
      this._q.setFromAxisAngle(this._ax.set(0, 1, 0), yaw - Math.PI / 2);
      this._q2.setFromAxisAngle(this._ax.set(0, 0, 1), -tilt);
      this._q.multiply(this._q2);
      this._p.set(center.x + Math.sin(yaw) * radius, y, center.z + Math.cos(yaw) * radius);
      this._m.compose(this._p, this._q, this._s);
      this.petals.setMatrixAt(i, this._m);
    }
    this.petals.instanceMatrix.needsUpdate = true;
    this.petals.computeBoundingSphere();
  }
  light(color, instant) {
    const socket = this.sockets.find((socket) => socket.color === color);
    if (!(!socket || socket.lit || socket.arc >= 0)) {
      if (this.arcs) this.arcs.visible = true;
      if (instant) {
        socket.arc = 99;
        this.setLit(socket, true);
        return;
      }
      socket.arc = 0;
    }
  }
  setLit(socket, instant) {
    if (
      socket.lit ||
      ((socket.lit = true), (socket.since = instant ? 10 : 0), (socket.cu.uActive.value = +!!instant), instant)
    )
      return;
    const color = new Color(paletteHex(socket.color));
    for (let i = 0; i < 70; i++) {
      const cosT = Math.random() * 2 - 1;
      const phi = Math.random() * TAU;
      const sinT = Math.sqrt(1 - cosT * cosT);
      const speed = 2 + Math.random() * 5;
      this.particles.spawn({
        x: socket.pos.x,
        y: socket.pos.y,
        z: socket.pos.z,
        vx: Math.cos(phi) * sinT * speed,
        vy: cosT * speed * 0.6 + 2,
        vz: Math.sin(phi) * sinT * speed,
        drag: 1.8,
        gravity: -2,
        color: i % 4 == 0 ? new Color(1, 1, 1) : color,
        bright: 2.4,
        size: 0.1 + Math.random() * 0.14,
        life: 0.9 + Math.random(),
      });
    }
    try {
      this.ctx.audio.play('perch-socket', {
        position: socket.pos,
        pitch: 1 + COLORS.indexOf(socket.color) * 0.06,
      });
    } catch {}
  }
  get litCount() {
    return this.sockets.filter((socket) => socket.lit).length;
  }
  awaken(instant, delay = 0) {
    if (this.state === 'dormant') {
      for (const socket of this.sockets) if (!socket.lit) this.light(socket.color, true);
      if (instant) {
        this.state = 'awake';
        this.t = 20;
        this.open = 1;
        this.rise = 1;
        this.wings = 1;
        this.pillarK = 1;
        this.removeBudCollider();
        this.placePetals(1, 0);
        this.relic.visible = true;
        this.relicHalo.visible = true;
        this.pillar.visible = true;
        this.pu.uGrow.value = 1.05;
        this.hintAwake();
        return;
      }
      this.state = 'awakening';
      this.t = -Math.max(0, delay);
      this.fired.clear();
      this.cineDecided = false;
    }
  }
  setClaimed() {
    this.awaken(true);
    this.state = 'claimed';
    this.relic.visible = false;
    this.relicHalo.visible = false;
    this.pillar.visible = false;
    this.pillarK = 0;
    this.hidePrompt();
  }
  hintAwake() {
    const hintPos = this.hintPos;
    if (hintPos) this.hints.setText(hintPos, SKYBRUSH_HINT);
  }
  once(key, at, fn) {
    if (!(this.t < at || this.fired.has(key))) {
      this.fired.add(key);
      try {
        fn();
      } catch (err) {
        console.warn(`[content] perch ${key} failed`, err);
      }
    }
  }
  play(sound, position) {
    try {
      this.ctx.audio.play(
        sound,
        position
          ? {
              position,
            }
          : undefined,
      );
    } catch {}
  }
  shake(amount) {
    const state = this.ctx.player?.state;
    if (!state) return;
    const dist = state.position.distanceTo(this.center);
    const strength = amount * Math.max(0, 1 - dist / 160);
    if (!(strength < 0.04))
      try {
        this.ctx.events.emit('camera:shake', {
          strength,
          position: this.center.clone(),
        });
      } catch {}
  }
  shockwave(ringMax, ringDur) {
    this.ringT = 0;
    this.ringMax = ringMax;
    this.ringDur = ringDur;
    this.ring.visible = true;
  }
  takeControl(taken) {
    if (this.controlTaken !== taken) {
      this.controlTaken = taken;
      try {
        this.ctx.player.setControlEnabled(!taken);
      } catch {}
    }
  }
  setShot(cine) {
    this.cine = cine;
    try {
      this.ctx.player.setCinematic(cine === 'none' ? null : this.shot);
    } catch {}
  }
  startAwakenCinematic() {
    const ctx = this.ctx;
    const state = ctx.player?.state;
    if (!state || state.dead || state.itemHold) return true;
    let inCombat = false;
    try {
      inCombat = (ctx.enemies?.alertedCount ?? 0) > 0 || !!ctx.boss?.active;
    } catch {
      inCombat = false;
    }
    if (inCombat) return true;
    if (state.mode === 'air' && state.airTime < 1.5) return false;
    if (state.mode !== 'ground' && state.mode !== 'slide' && state.mode !== 'swim') return true;
    const center = this.center;
    const dist = Math.hypot(state.position.x - center.x, state.position.z - center.z);
    if (dist < 70) {
      this.cineYaw = Math.atan2(state.position.x - center.x, state.position.z - center.z) || 0;
      this.shot.fov = 50;
      this.shot.blend = 1.2;
      this.cineEnd = 7;
      this.updateNearShot();
      this.setShot('near');
      this.takeControl(true);
    } else if (dist < 280) {
      let clear = false;
      for (const lift of [2.6, 7, 13, 22]) {
        this.lookLift = lift;
        this.updateLookShot();
        if (this.lookClear(this.shot.position, this.tmp.set(center.x, this.floor + 4, center.z))) {
          clear = true;
          break;
        }
      }
      if (!clear) return true;
      this.cineEnd = 5.8;
      this.shot.blend = 1.4;
      this.setShot('look');
      this.takeControl(true);
    }
    return true;
  }
  lookClear(from, to) {
    const ctx = this.ctx;
    try {
      const dir = this.tmp2.copy(to).sub(from);
      const dist = dir.length();
      if (dist < 1) return true;
      dir.divideScalar(dist);
      const ray = new ctx.RAPIER.Ray(
        {
          x: from.x,
          y: from.y,
          z: from.z,
        },
        {
          x: dir.x,
          y: dir.y,
          z: dir.z,
        },
      );
      return !ctx.physics.castRay(
        ray,
        dist * 0.9,
        true,
        ctx.RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        COLLISION_GROUPS.worldQuery,
      );
    } catch {
      return false;
    }
  }
  updateNearShot() {
    const center = this.center;
    const yaw = this.cineYaw + 0.35 + Math.max(-2, this.t) * 0.07;
    const dist = 12 - 2.5 * smoothstep(2, 6, this.t);
    this.shot.position.set(
      center.x + Math.sin(yaw) * dist,
      this.floor + 4.2 - 1.2 * smoothstep(3, 6, this.t),
      center.z + Math.cos(yaw) * dist,
    );
    const targetY = this.rise > 0 ? this.relic.position.y : this.floor + 1.6;
    this.shot.target.set(center.x, MathUtils.lerp(this.floor + 1.6, targetY, smoothstep(3.4, 5.5, this.t)), center.z);
  }
  updateLookShot() {
    const state = this.ctx.player.state;
    const center = this.center;
    const position = state.position;
    const dx = center.x - position.x;
    const dz = center.z - position.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;
    const cam = this.shot.position.set(
      position.x - nx * 5.5 + nz * 1.2,
      position.y + this.lookLift,
      position.z - nz * 5.5 - nx * 1.2,
    );
    try {
      const ground = this.ctx.terrain.heightAt(cam.x, cam.z);
      if (cam.y < ground + 1.4) cam.y = ground + 1.4;
    } catch {}
    this.shot.target.set(center.x, this.floor + 6 + 10 * smoothstep(2.8, 5, this.t), center.z);
    const dist = cam.distanceTo(this.shot.target);
    this.shot.fov = MathUtils.clamp((2 * Math.atan(26 / dist) * 180) / Math.PI, 16, 50);
  }
  endCinematic() {
    if (this.cine !== 'none') this.setShot('none');
    this.takeControl(false);
  }
  claim() {
    if (this.state !== 'awake') return;
    this.state = 'claiming';
    this.t = 0;
    this.fired.clear();
    this.hidePrompt();
    this.claimFrom.copy(this.relic.position);
    this.play('perch-claim', this.center);
    this.takeControl(true);
    const state = this.ctx.player?.state;
    if (state) {
      const center = this.center;
      const yaw = (Math.atan2(state.position.x - center.x, state.position.z - center.z) || 0) + 0.55;
      const dist = Math.hypot(state.position.x - center.x, state.position.z - center.z) + 3.4;
      this.shot.position.set(center.x + Math.sin(yaw) * dist, this.floor + 2.3, center.z + Math.cos(yaw) * dist);
      this.shot.target
        .copy(state.position)
        .lerp(this.relic.position, 0.5)
        .setY(this.floor + 1.9);
      this.shot.fov = 46;
      this.shot.blend = 0.8;
      this.setShot('claim');
    }
  }
  hidePrompt() {
    if (this.promptOn) {
      this.promptOn = false;
      try {
        this.ctx.ui.hidePrompt('perch');
      } catch {}
    }
  }
  update(dt) {
    const ctx = this.ctx;
    const elapsed = ctx.time.elapsed;
    this.t += dt;
    this.ribbonK += ((this.state === 'claimed' ? 0.5 : 1) - this.ribbonK) * Math.min(1, dt * 0.5);
    const uProg = this.au.uProg.value;
    const uAlpha = this.au.uAlpha.value;
    for (const socket of this.sockets) {
      if (socket.arc >= 0 && socket.arc < 99) {
        socket.arc += dt;
        if ((socket.arc - 2) / 2.6 >= 1 && !socket.lit) this.setLit(socket, false);
      }
      const prog = socket.arc < 0 ? 0 : socket.arc >= 99 ? 1.2 : Math.max(0, (socket.arc - 2) / 2.6);
      const alpha =
        socket.arc < 0
          ? 0
          : socket.arc >= 99
            ? 0.6
            : Math.min(1, Math.max(0, (socket.arc - 1.8) * 2)) * (0.6 + 0.4 * Math.max(0, 1 - (socket.arc - 4.6) / 2));
      if (socket.arcIdx >= 0) {
        uProg.setComponent(socket.arcIdx, prog);
        uAlpha.setComponent(socket.arcIdx, alpha * this.ribbonK);
      }
      if (socket.lit) socket.since += dt;
      const since = socket.since;
      const lit = +!!socket.lit;
      socket.cu.uActive.value = socket.lit ? Math.min(1, since * 2.5) : 0;
      socket.cu.uFlash.value = socket.lit ? Math.max(0, 1 - since * 2.5) * 0.9 : 0;
      const targetGlow = socket.lit ? 1 : 0.12;
      socket.glow += (targetGlow - socket.glow) * Math.min(1, dt * 2.5);
      this.mats.siteGlow.value[SOCKET_GLOW_SLOT[socket.color]] = socket.glow * (1 + 0.5 * socket.cu.uCharge.value);
      const pulse = socket.lit && since < 0.6 ? 1 + Math.sin((since / 0.6) * Math.PI) * 0.9 : 1;
      socket.halo.material.opacity =
        lit * (0.42 + 0.08 * Math.sin(elapsed * 2 + socket.yaw)) + socket.cu.uCharge.value * 0.4;
      socket.halo.scale.setScalar(2.2 * pulse * (1 + 0.6 * socket.cu.uCharge.value));
      socket.crystal.rotation.y += dt * (0.5 + 3 * socket.cu.uCharge.value);
      socket.crystal.position.y = socket.pos.y + Math.sin(elapsed * 1.3 + socket.yaw * 3) * 0.06;
      if (socket.lit && dt > 0 && Math.random() < dt * 3) {
        const angle = Math.random() * TAU;
        this.particles.spawn({
          x: socket.pos.x + Math.cos(angle) * 0.3,
          y: socket.pos.y - 0.2,
          z: socket.pos.z + Math.sin(angle) * 0.3,
          vy: 0.5 + Math.random() * 0.6,
          mode: ParticleMode.Rise,
          color: socket.cu.uColor.value,
          bright: 1.6,
          size: 0.06 + Math.random() * 0.06,
          life: 1.4 + Math.random(),
        });
      }
    }
    if (this.state === 'awakening') this.updateAwakening(dt);
    else if (this.state === 'claiming') this.updateClaim(dt);
    if (this.state === 'awake' || this.state === 'awakening') this.poseRelic(dt);
    const core =
      this.state === 'dormant'
        ? 0
        : this.state === 'awakening'
          ? Math.max(this.crack * 0.8, this.open * 0.5)
          : this.state === 'claimed'
            ? 0.22
            : 0.5;
    this.coreGlow.material.opacity = core * (0.85 + 0.15 * Math.sin(elapsed * 3));
    this.coreGlow.scale.setScalar(2.4 + 2.5 * core);
    this.petalGlow.value = Math.max(
      this.open * (this.state === 'claimed' ? 0.35 : 0.6 + 0.12 * Math.sin(elapsed * 1.7)),
      this.state === 'awakening' ? this.crack * 1.6 : 0,
    );
    this.petalCurl.value = this.open * 0.6;
    if (this.pillar.visible) {
      this.pu.uIntensity.value = this.pillarK * (0.95 + 0.1 * Math.sin(elapsed * 2.1));
      this.pu.uWidth.value = 2 + Math.max(0, 1 - (this.t - 2.8)) * (this.state === 'awakening' ? 2.5 : 0);
      if (this.pillarK <= 0.001 && this.state !== 'awakening') this.pillar.visible = false;
    }
    if (this.ringT >= 0) {
      this.ringT += dt;
      const prog = this.ringT / this.ringDur;
      if (prog >= 1) {
        this.ringT = -1;
        this.ring.visible = false;
      } else {
        const scale = 1 + (1 - (1 - prog) ** 3) * this.ringMax;
        this.ring.scale.set(scale, 1, scale);
        this.ru.uAlpha.value = (1 - prog) * 1.3;
      }
    }
    if (this.cine === 'near' || this.cine === 'look') {
      const state = ctx.player?.state;
      if (!state || state.dead || this.t > this.cineEnd) this.endCinematic();
      else if (this.cine === 'near') this.updateNearShot();
      else this.updateLookShot();
    }
    if (this.state === 'awake') this.updatePrompt(dt);
  }
  updatePrompt(dt) {
    const ctx = this.ctx;
    const state = ctx.player?.state;
    const center = this.center;
    let near = false;
    if (state && !state.dead && !state.itemHold && this.cine === 'none')
      near =
        Math.hypot(state.position.x - center.x, state.position.z - center.z) < 3.6 &&
        state.position.y > this.floor - 0.8 &&
        state.position.y < this.floor + 3 &&
        state.mode !== 'fly';
    if (near && !this.promptOn) {
      this.promptOn = true;
      try {
        ctx.ui.showPrompt('perch', 'Take up the Skybrush', 'F');
      } catch {}
    } else if (!near && this.promptOn) this.hidePrompt();
    if (near && dt > 0 && ctx.input.pressed('interact')) this.claim();
  }
  updateAwakening(dt) {
    const t = this.t;
    const center = this.center;
    const floor = this.floor;
    if (!this.cineDecided && t >= -1.4) this.cineDecided = this.startAwakenCinematic() || t > -0.1;
    this.once('rumble', 0, () => {
      this.play('perch-rumble', center);
      this.shake(0.55);
    });
    const stream = smoothstep(0, 1.3, t) * (1 - smoothstep(2.6, 3.2, t));
    for (const socket of this.sockets) {
      const order = COLORS.indexOf(socket.color);
      socket.cu.uCharge.value = smoothstep(order * 0.22, order * 0.22 + 0.9, t) * (1 - smoothstep(2.8, 3.4, t)) * 0.9;
      if (stream > 0.05 && dt > 0 && t > 0) {
        let count = dt * 26 * stream;
        for (; count > 0;) {
          if (Math.random() < count)
            this.particles.spawn({
              x: socket.pos.x + (Math.random() - 0.5) * 0.3,
              y: socket.pos.y,
              z: socket.pos.z + (Math.random() - 0.5) * 0.3,
              vx: (Math.random() - 0.5) * 1.5,
              vy: 1.5 + Math.random(),
              vz: (Math.random() - 0.5) * 1.5,
              mode: ParticleMode.Homing,
              target: this.coreGlow.position,
              delay: 0.1,
              color: socket.cu.uColor.value,
              bright: 2.2,
              size: 0.1 + Math.random() * 0.08,
              life: 1.6,
            });
          --count;
        }
      }
    }
    if (t > 0 && t < 2.8 && dt > 0 && Math.random() < dt * 14) {
      const angle = Math.random() * TAU;
      const radius = 4.5 + Math.random() * 0.4;
      this.particles.spawn({
        x: center.x + Math.sin(angle) * radius,
        y: floor + 0.1,
        z: center.z + Math.cos(angle) * radius,
        vx: Math.sin(angle) * 1.2,
        vy: 0.6 + Math.random(),
        vz: Math.cos(angle) * 1.2,
        gravity: -6,
        drag: 0.6,
        color: new Color(0.95, 0.88, 0.72),
        bright: 0.9,
        size: 0.08 + Math.random() * 0.1,
        life: 1.2,
      });
    }
    this.crack = smoothstep(1.5, 2.7, t);
    this.once('crack', 1.6, () => this.shake(0.3));
    this.once('bloom-audio', 2.55, () => this.play('perch-bloom', center));
    this.once('bloom', 2.8, () => {
      this.removeBudCollider();
      this.shake(0.7);
      this.shockwave(26, 1.8);
      this.pillar.visible = true;
      this.relic.visible = true;
      this.relicHalo.visible = true;
      try {
        this.ctx.paint.bloomVitality(center.clone(), 70, 3);
      } catch {}
      const burstAt = xyz(center.x, floor + DAIS_H + 1, center.z);
      for (let i = 0; i < 180; i++) {
        const rnd = Math.random();
        const angle = Math.random() * TAU;
        const speed = 3 + Math.random() * 9;
        const color = new Color(paletteHex(COLORS[i % 4]));
        this.particles.spawn({
          x: burstAt.x,
          y: burstAt.y,
          z: burstAt.z,
          vx: Math.cos(angle) * speed * (1 - rnd * 0.5),
          vy: 2 + rnd * 10,
          vz: Math.sin(angle) * speed * (1 - rnd * 0.5),
          drag: 1.5,
          gravity: -3,
          color: i % 5 == 0 ? new Color(1, 1, 1) : color,
          bright: 2.5,
          size: 0.12 + Math.random() * 0.2,
          life: 1.2 + Math.random() * 1.6,
        });
      }
    });
    this.once('toast', 3.3, () => {
      try {
        this.ctx.ui.toast('The Painter’s Perch Awakens', 'A light rises from the summit. Something waits at the peak.');
      } catch {}
    });
    const openT = (t - 2.8) / 1.5;
    this.open = t < 2.8 ? 0 : easeOutBack(openT, 1.6);
    const strain = t < 2.8 ? this.crack : Math.max(0, 1 - openT * 3) * 0.5;
    this.placePetals(this.open, strain);
    this.pillarK = smoothstep(2.75, 3.4, t);
    this.pu.uGrow.value = Math.min(1.05, Math.max(0, (t - 2.8) * 0.85));
    this.rise = easeInOutCubic((t - 3.3) / 3);
    this.wings = smoothstep(4.4, 6.2, t);
    if (t >= 6.6) {
      this.state = 'awake';
      this.hintAwake();
    }
  }
  poseRelic(dt) {
    const center = this.center;
    const elapsed = this.ctx.time.elapsed;
    const baseY = this.floor + DAIS_H;
    const y = MathUtils.lerp(baseY + 0.7, baseY + RELIC_RISE, this.rise);
    const bob = Math.sin(elapsed * 1.1) * 0.12 * this.rise;
    this.spin += dt * (0.32 + (1 - this.rise) * 1.6);
    this.relic.position.set(center.x, y + bob, center.z);
    this.relic.rotation.set(Math.sin(elapsed * 0.8) * 0.06, this.spin, 0.1 + Math.sin(elapsed * 0.9) * 0.07, 'YXZ');
    this.relic.scale.setScalar(RELIC_SCALE * (0.55 + 0.45 * Math.min(1, this.rise * 1.6)));
    const flap = Math.sin(elapsed * 3.4) * 0.16 + Math.sin(elapsed * 1.3) * 0.05;
    const wings = this.wings;
    for (
      this.wingL.rotation.set(-(0.2 + flap) * wings - (1 - wings) * 0.2, (1 - wings) * 1.1, 0),
        this.wingR.rotation.set((0.2 + flap) * wings + (1 - wings) * 0.2, -(1 - wings) * 1.1, 0),
        this.wingL.scale.setScalar(0.3 + 0.7 * wings),
        this.wingR.scale.setScalar(0.3 + 0.7 * wings),
        this.relicGlow.value = 0.8 + 0.25 * Math.sin(elapsed * 2.2) + 0.4 * (1 - this.rise),
        this.relicHalo.position.copy(this.relic.position),
        this.relicHalo.material.opacity = (0.35 + 0.1 * Math.sin(elapsed * 2.2)) * Math.min(1, this.rise * 2),
        this.relicHalo.scale.setScalar(4.2 + 0.4 * Math.sin(elapsed * 1.7)),
        this.emitAcc += dt * 16 * this.rise;
      this.emitAcc > 1;
    ) {
      --this.emitAcc;
      const pos =
        Math.random() < 0.5
          ? this.tmp.set(1.6 + Math.random() * 0.6, 0.1, 0)
          : this.tmp.set(
              0.3 - Math.random() * 1.2,
              0.5 + Math.random() * 0.3,
              (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.6),
            );
      this.relic.localToWorld(pos);
      this.particles.spawn({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        vy: 0.3 + Math.random() * 0.5,
        mode: ParticleMode.Rise,
        color: new Color(paletteHex(COLORS[Math.floor(Math.random() * 4)])),
        bright: 2,
        size: 0.07 + Math.random() * 0.07,
        life: 1.2 + Math.random(),
      });
    }
  }
  updateClaim(dt) {
    const t = this.t;
    const state = this.ctx.player?.state;
    const elapsed = this.ctx.time.elapsed;
    if (t < 2) {
      try {
        this.ctx.character.brushTipWorld(this.tip);
      } catch {
        if (state) this.tip.copy(state.position).setY(state.position.y + 1.5);
      }
      if (!Number.isFinite(this.tip.x + this.tip.y + this.tip.z)) this.tip.copy(this.center).setY(this.floor + 1.5);
      const prog = easeInOutCubic(t / 2);
      const orbit = (1 - prog) * 1.7;
      const swirl = t * 6.5;
      this.relic.position.copy(this.claimFrom).lerp(this.tip, prog);
      this.relic.position.x += Math.cos(swirl) * orbit;
      this.relic.position.z += Math.sin(swirl) * orbit;
      this.relic.position.y += Math.sin(prog * Math.PI) * 0.8;
      this.spin += dt * (2 + 9 * prog);
      this.relic.rotation.set(0, this.spin, 0.3 * Math.sin(swirl), 'YXZ');
      this.relic.scale.setScalar(RELIC_SCALE * (1 - 0.85 * prog));
      const flap = Math.sin(elapsed * 12) * 0.3;
      this.wingL.rotation.set(-(0.2 + flap), 0, 0);
      this.wingR.rotation.set(0.2 + flap, 0, 0);
      this.relicGlow.value = 0.9 + prog * 1.5;
      this.relicHalo.position.copy(this.relic.position);
      this.relicHalo.scale.setScalar(4.2 * (1 - 0.6 * prog));
      this.pillarK = Math.max(0, 1 - prog * 0.7);
      if (dt > 0)
        for (let i = 0; i < 3; i++)
          this.particles.spawn({
            x: this.relic.position.x,
            y: this.relic.position.y,
            z: this.relic.position.z,
            vx: (Math.random() - 0.5) * 1.5,
            vy: (Math.random() - 0.5) * 1.5,
            vz: (Math.random() - 0.5) * 1.5,
            drag: 2,
            color: new Color(paletteHex(COLORS[Math.floor(Math.random() * 4)])),
            bright: 2.2,
            size: 0.1 + Math.random() * 0.08,
            life: 0.8 + Math.random() * 0.5,
          });
      if (this.cine === 'claim' && state) {
        this.tmp2.copy(state.position).setY(state.position.y + 1.4);
        this.shot.target.lerp(this.tmp2.lerp(this.relic.position, 0.5 * (1 - prog)), Math.min(1, dt * 3));
      }
    }
    this.once('absorb', 2, () => {
      this.relic.visible = false;
      this.relicHalo.visible = false;
      const tip = this.tip.clone();
      for (let i = 0; i < 160; i++) {
        const cosT = Math.random() * 2 - 1;
        const phi = Math.random() * TAU;
        const sinT = Math.sqrt(1 - cosT * cosT);
        const speed = 3 + Math.random() * 8;
        this.particles.spawn({
          x: tip.x,
          y: tip.y,
          z: tip.z,
          vx: Math.cos(phi) * sinT * speed,
          vy: cosT * speed * 0.6 + 2.5,
          vz: Math.sin(phi) * sinT * speed,
          drag: 1.7,
          gravity: -2.5,
          color: i % 5 == 0 ? new Color(1, 1, 1) : new Color(paletteHex(COLORS[i % 4])),
          bright: 2.6,
          size: 0.12 + Math.random() * 0.18,
          life: 1 + Math.random() * 1.4,
        });
      }
      this.shockwave(46, 2.4);
      this.shake(0.4);
      try {
        this.ctx.paint.bloomVitality(this.center.clone(), 95, 3.5);
      } catch {}
    });
    if (t > 2) this.pillarK = Math.max(0, this.pillarK - dt * 2.5);
    this.once('release', 2.7, () => {
      this.endCinematic();
      this.state = 'claimed';
      try {
        this.ctx.player.giveItem('brushflight');
      } catch (err) {
        console.warn('[content] giveItem(brushflight) failed', err);
      }
      try {
        this.onClaimed?.();
      } catch {}
    });
  }
}
