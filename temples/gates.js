/**
 * Temple gates on the island: a yaw-rotated build kit and the Kiln and Cistern gateways set into the terrain, with steps down to the ground, braziers, a heat column, motes and the portal that travels inside.
 */
import {
  BoxGeometry,
  BufferAttribute,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  TorusGeometry,
  Vector3,
} from 'three';
import { COLLISION_GROUPS } from '../core/config.js';
import { Hints } from '../shared/hints.js';
import { Motes } from '../shared/motes.js';
import { lathe, mergeGeometries, rockGeometry } from '../shared/util.js';
import { Portal } from './devices.js';
import { GLYPH, glyphAtlas, makeGlyphMaterial } from './glyphs.js';
import { bakeGeometry } from './kit.js';
import { makeColumnMaterial, makeFlames, makePortalMaterial } from './materials.js';
import { KIND, makeStoneMaterial } from './stone-material.js';
const _gateQuat = new Quaternion();
const _gateMat = new Matrix4();
const _gateVec = new Vector3();
const _gateUp = new Vector3(0, 1, 0);
class GateKit {
  ctx;
  base;
  yaw;
  parts = [];
  glyphs = [];
  cols = [];
  constructor(ctx, base, yaw) {
    this.ctx = ctx;
    this.base = base;
    this.yaw = yaw;
  }
  w(x, y, z, target = new Vector3()) {
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    return target.set(this.base.x + x * cos + z * sin, this.base.y + y, this.base.z - x * sin + z * cos);
  }
  geo(geometry, x, y, z, color, options = {}, scale) {
    const rot = options.rot;
    const localRot =
      rot === undefined
        ? new Quaternion()
        : typeof rot == 'number'
          ? new Quaternion().setFromAxisAngle(_gateUp, rot)
          : new Quaternion().setFromEuler(rot);
    _gateQuat.setFromAxisAngle(_gateUp, this.yaw).multiply(localRot);
    _gateMat.compose(this.w(x, y, z, _gateVec), _gateQuat, scale ?? new Vector3(1, 1, 1));
    this.parts.push(
      bakeGeometry(
        geometry,
        color,
        {
          ...options,
          rot: undefined,
        },
        _gateMat,
      ),
    );
  }
  box(x, y, z, w, h, d, color, options = {}) {
    this.geo(new BoxGeometry(w, h, d), x, y, z, color, options);
    if (options.col) this.colBox(x, y, z, w / 2, h / 2, d / 2, typeof options.rot == 'number' ? options.rot : 0);
  }
  colBox(x, y, z, hx, hy, hz, rot = 0, surface = 'stone') {
    const pos = this.w(x, y, z);
    _gateQuat.setFromAxisAngle(_gateUp, this.yaw + rot);
    const desc = this.ctx.RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(pos.x, pos.y, pos.z).setRotation({
      x: _gateQuat.x,
      y: _gateQuat.y,
      z: _gateQuat.z,
      w: _gateQuat.w,
    });
    this.cols.push({
      desc,
      surface,
    });
  }
  colCyl(x, y, z, halfHeight, radius, surface = 'stone') {
    const pos = this.w(x, y, z);
    this.cols.push({
      desc: this.ctx.RAPIER.ColliderDesc.cylinder(halfHeight, radius).setTranslation(pos.x, pos.y, pos.z),
      surface,
    });
  }
  colRamp(x0, y0, z0, x1, y1, z1, width) {
    const from = this.w(x0, y0, z0);
    const to = this.w(x1, y1, z1);
    const dir = to.clone().sub(from);
    const len = dir.length();
    dir.normalize();
    const flat = new Vector3(dir.x, 0, dir.z).normalize();
    const side = new Vector3().crossVectors(_gateUp, flat).normalize();
    const up = new Vector3().crossVectors(dir, side).normalize();
    if (up.y < 0) up.negate();
    const rot = new Quaternion().setFromRotationMatrix(new Matrix4().makeBasis(side, up, dir));
    const mid = from.clone().add(to).multiplyScalar(0.5).addScaledVector(up, -0.3);
    const desc = this.ctx.RAPIER.ColliderDesc.cuboid(width / 2, 0.3, len / 2)
      .setTranslation(mid.x, mid.y, mid.z)
      .setRotation({
        x: rot.x,
        y: rot.y,
        z: rot.z,
        w: rot.w,
      });
    this.cols.push({
      desc,
      surface: 'stone',
    });
  }
  glyph(x2, y2, z, nx, nz, size, glyph, hex, ch, glow) {
    const geometry = new PlaneGeometry(size, size);
    const uv = geometry.attributes.uv;
    const col = glyph % 4;
    const row = Math.floor(glyph / 4) % 4;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + uv.getX(i)) / 4, 1 - (row + 1 - uv.getY(i)) / 4);
    const cos = Math.cos(this.yaw);
    const sin = Math.sin(this.yaw);
    const normal = new Vector3(nx * cos + nz * sin, 0, -nx * sin + nz * cos).normalize();
    const rot = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal);
    geometry.applyMatrix4(
      new Matrix4().compose(this.w(x2, y2, z).addScaledVector(normal, 0.02), rot, new Vector3(1, 1, 1)),
    );
    geometry.deleteAttribute('normal');
    const count = geometry.attributes.position.count;
    const colors = new Float32Array(count * 3);
    const glows = new Float32Array(count * 2);
    const color = new Color(hex);
    for (let i = 0; i < count; i++) {
      colors.set([color.r, color.g, color.b], i * 3);
      glows.set([ch, glow], i * 2);
    }
    geometry.setAttribute('color', new BufferAttribute(colors, 3));
    geometry.setAttribute('aGl', new BufferAttribute(glows, 2));
    this.glyphs.push(geometry);
  }
}
export class TempleGates {
  ctx;
  group = new Group();
  list = [];
  mat;
  flames;
  hints;
  motes = null;
  near = false;
  stairInfo = [];
  constructor(ctx, defs) {
    this.ctx = ctx;
    this.group.name = 'temple-gates';
    this.mat = makeStoneMaterial(ctx, {
      frost: 0,
      soot: 0,
      litColor: 0xffd08a,
      vitality: true,
      name: 'gates',
    });
    this.mat.chan[2] = 1;
    this.mat.chan[3] = 1;
    this.flames = makeFlames(ctx, 'gates');
    this.hints = new Hints(ctx);
    const glyphMat = makeGlyphMaterial(ctx, this.mat.chan, glyphAtlas());
    const moteDefs = [];
    for (const def of defs)
      try {
        const gate = this.build(def, glyphMat, moteDefs);
        this.list.push(gate);
      } catch (err) {
        console.warn('[temples] gate build failed', err);
      }
    this.flames.build();
    this.group.add(this.flames.mesh);
    try {
      let seed = 1;
      const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      this.motes = new Motes(ctx, moteDefs, rand, ctx.settings?.quality === 'low' ? 0.5 : 1);
      this.motes.points.removeFromParent();
      this.group.add(this.motes.points);
    } catch {
      this.motes = null;
    }
    ctx.scene.add(this.group);
  }
  build(def, glyphMat, moteDefs) {
    const ctx = this.ctx;
    const terrain = ctx.terrain;
    const isKiln = def.style === 'kiln';
    const fwd = new Vector3(Math.sin(def.yaw), 0, Math.cos(def.yaw));
    const right = new Vector3(Math.cos(def.yaw), 0, -Math.sin(def.yaw));
    let groundY = -1000000000;
    for (let across = -5.5; across <= 5.51; across += 0.55)
      for (let along = -1.5; along <= 6.6; along += 0.55) {
        if (Math.hypot(across, along - 1.2) > 5.9) continue;
        const px = def.x + right.x * across + fwd.x * along;
        const pz = def.z + right.z * across + fwd.z * along;
        groundY = Math.max(groundY, terrain.heightAt(px, pz));
      }
    groundY += 0.15;
    const base = new Vector3(def.x, groundY, def.z);
    const kit = new GateKit(ctx, base, def.yaw);
    const stone = isKiln ? 4866107 : 13227486;
    const low = isKiln ? 3879728 : 10465986;
    const trim = isKiln ? 11111021 : 15003123;
    const glass = isKiln ? 16738858 : 5030911;
    const metal = isKiln ? 12155964 : 8825524;
    const geometry = new CylinderGeometry(5.6, 6.2, 8, 8, 1);
    kit.geo(geometry, 0, -4, 1.2, low, {
      kind: isKiln ? KIND.basalt : KIND.ashlar,
      rot: Math.PI / 8,
    });
    kit.geo(new CylinderGeometry(5.75, 5.75, 0.25, 8), 0, -0.1, 1.2, trim, {
      kind: KIND.smooth,
      rot: Math.PI / 8,
    });
    kit.geo(new CylinderGeometry(3.4, 3.4, 0.06, 32), 0, 0.04, 1.6, stone, {
      kind: KIND.smooth,
    });
    {
      const geometry = new PlaneGeometry(4.6, 4.6);
      const uv = geometry.attributes.uv;
      const ring = GLYPH.ring;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, ((ring % 4) + uv.getX(i)) / 4, 1 - (Math.floor(ring / 4) + 1 - uv.getY(i)) / 4);
      geometry.rotateX(-Math.PI / 2);
      geometry.rotateY(def.yaw);
      const center = kit.w(0, 0.09, 1.6);
      geometry.translate(center.x, center.y, center.z);
      geometry.deleteAttribute('normal');
      const count = geometry.attributes.position.count;
      const color = new Color(glass);
      const colors = new Float32Array(count * 3);
      const glows = new Float32Array(count * 2);
      for (let i = 0; i < count; i++) {
        colors.set([color.r, color.g, color.b], i * 3);
        glows.set([2, 0.45], i * 2);
      }
      geometry.setAttribute('color', new BufferAttribute(colors, 3));
      geometry.setAttribute('aGl', new BufferAttribute(glows, 2));
      kit.glyphs.push(geometry);
    }
    kit.colCyl(0, -4, 1.2, 4, 5.75);
    const stairStart = 6.5;
    const slope = 0.8;
    let stairLen = 0;
    let drop = 0;
    for (let dist = 0.25; dist <= 16; dist += 0.25) {
      const p = kit.w(0, 0, stairStart + dist);
      const ground = terrain.heightAt(p.x, p.z);
      stairLen = dist;
      if (groundY - slope * dist <= ground + 0.02) {
        drop = Math.max(0, groundY - ground);
        break;
      }
      drop = slope * dist;
    }
    this.stairInfo.push({
      style: def.style,
      gy: groundY,
      L: stairLen,
      drop,
    });
    if (drop > 0.3) {
      const steps = Math.max(2, Math.round(stairLen / 0.5));
      const run = stairLen / steps;
      const rise = drop / steps;
      for (let i = 0; i < steps; i++) {
        const stepY = -(i + 1) * rise;
        const z = stairStart + (i + 0.5) * run;
        kit.box(0, stepY - 3, z, 4.6, 6, run, i % 2 ? stone : low, {
          kind: KIND.ashlar,
        });
        for (const side of [-1, 1])
          kit.box(side * 2.65, stepY - 2.6, z, 0.7, 6.2, run + 0.01, trim, {
            kind: KIND.smooth,
            col: true,
          });
      }
      kit.colRamp(0, 0.02, 6.4, 0, -drop + 0.02, stairStart + stairLen + 0.15, 4.6);
    }
    const doorH = 5.4;
    if (isKiln) {
      for (const [x, z, height, radius] of [
        [-2.6, -0.4, 7.8, 0.75],
        [2.6, -0.4, 7.8, 0.75],
        [-3.7, -0.9, 6.2, 0.7],
        [3.7, -0.9, 6.6, 0.7],
        [-4.6, -1.6, 4.4, 0.7],
        [4.6, -1.6, 4.8, 0.68],
        [-3.2, 0.6, 3, 0.55],
        [3.3, 0.7, 2.4, 0.5],
        [-1.6, -2.2, 9.2, 0.8],
        [1.6, -2.2, 9.6, 0.8],
        [0, -2.9, 10.4, 0.9],
        [-5.3, -2.6, 3.2, 0.6],
        [5.2, -2.7, 3.6, 0.62],
      ]) {
        kit.geo(new CylinderGeometry(radius * 0.95, radius, height + 3, 6), x, (height - 3) / 2, z, stone, {
          kind: KIND.basalt,
          rot: (x * 1.7) % 1,
        });
        kit.colCyl(x, (height - 3) / 2, z, (height + 3) / 2, radius * 0.92, 'rock');
      }
      const rock = rockGeometry(3.2, 7, 1.1);
      kit.geo(
        rock,
        0,
        2.8,
        -5.4,
        low,
        {
          kind: KIND.basalt,
        },
        new Vector3(1.6, 1.4, 0.7),
      );
      kit.colBox(0, 3, -4.6, 4.6, 4.5, 1.8, 0, 'rock');
      kit.box(0, 5.95, -0.3, 6.4, 1.1, 1.6, trim, {
        kind: KIND.smooth,
        col: true,
      });
      kit.box(0, 6.75, -0.3, 5.6, 0.5, 1.3, stone, {
        kind: KIND.basalt,
      });
      kit.glyph(0, 5.95, 0.52, 0, 1, 1, GLYPH.flame, glass, 2, 1.4);
      for (const [x, z, rot] of [
        [-2.2, 0.6, 0.3],
        [2.4, 0.5, -0.4],
        [-4.2, -0.2, 0.9],
        [4.1, -0.3, -0.8],
        [0, 3.6, 0.2],
      ])
        kit.box(x, 0.05, z, 1.8, 0.04, 0.12, glass, {
          kind: KIND.glass,
          glow: [2, 1.8],
          rot,
        });
      kit.box(0, doorH / 2, -1.5, 3.6, doorH, 0.6, 1314830, {
        kind: KIND.basalt,
        col: true,
      });
    } else {
      for (const side of [-1, 1]) {
        kit.box(side * 2.45, 2.8000000000000003, -0.3, 1.3, 5.6000000000000005, 1.8, stone, {
          kind: KIND.ashlar,
          col: true,
        });
        kit.box(side * 2.45, 0.3, -0.3, 1.6, 0.6, 2.1, trim, {
          kind: KIND.smooth,
        });
        kit.box(side * 2.45, 5.5, -0.3, 1.5, 0.3, 2, trim, {
          kind: KIND.smooth,
        });
        kit.box(side * 3.9, 2.4, -0.9, 1.6, 4.8, 1.4, low, {
          kind: KIND.ashlar,
          col: true,
        });
        kit.glyph(side * 2.45, 2.8, 0.61, 0, 1, 0.8, GLYPH.drop, glass, 2, 1.1);
      }
      const geometry = new TorusGeometry(2.45, 0.62, 8, 20, Math.PI);
      kit.geo(
        geometry,
        0,
        5.65,
        -0.3,
        stone,
        {
          kind: KIND.ashlar,
        },
        new Vector3(1, 0.7, 1.5),
      );
      kit.box(0, 6.5, -0.3, 2.2, 1, 1.6, trim, {
        kind: KIND.smooth,
        col: true,
      });
      kit.glyph(0, 6.550000000000001, 0.51, 0, 1, 1.1, GLYPH.snow, glass, 2, 1.4);
      kit.box(0, doorH / 2, -1.5, 3.6, 6.9, 0.6, 1450540, {
        kind: KIND.ashlar,
        col: true,
      });
      kit.box(0, 4, -2.6, 8, 8.5, 2, low, {
        kind: KIND.ashlar,
        col: true,
      });
      for (let i = 0; i < 22; i++) {
        const angle = (i / 21) * Math.PI;
        const len = 0.4 + ((i * 7) % 5) * 0.22;
        const geometry = new ConeGeometry(0.07 + len * 0.05, len, 5);
        geometry.rotateX(Math.PI);
        kit.geo(geometry, Math.cos(angle) * 2.2, 5.65 + Math.sin(angle) * 1.3 - len / 2 - 0.35, 0.35, 14349311, {
          kind: KIND.ice,
        });
      }
      for (const [x, z, radius] of [
        [-3.2, 2.8, 1.4],
        [3.5, 3.4, 1.1],
        [0.2, 5.2, 1],
      ])
        kit.geo(new CylinderGeometry(radius, radius + 0.1, 0.06, 20), x, 0.03, z, 13627135, {
          kind: KIND.ice,
        });
      for (const [x, z, height] of [
        [-4.6, 0.8, 1.8],
        [-4.2, 1.6, 1.1],
        [4.5, 0.6, 2.1],
        [4.9, 1.4, 1.2],
      ]) {
        const geometry = new OctahedronGeometry(0.5, 0);
        kit.geo(
          geometry,
          x,
          height * 0.5,
          z,
          13627135,
          {
            kind: KIND.ice,
            glow: [2, 0.4],
          },
          new Vector3(0.6, height, 0.6),
        );
      }
    }
    const flameIds = [];
    for (const side of [-1, 1]) {
      const x = side * 4.4;
      const z = 3.6;
      kit.geo(
        lathe(
          [
            [0.55, 0],
            [0.45, 0.15],
            [0.3, 0.5],
            [0.26, 1],
            [0.36, 1.15],
            [0.02, 1.16],
          ],
          10,
        ),
        x,
        0,
        z,
        trim,
        {
          kind: KIND.smooth,
        },
      );
      kit.geo(
        lathe(
          [
            [0.02, 0],
            [0.3, 0.02],
            [0.55, 0.2],
            [0.66, 0.42],
            [0.6, 0.44],
            [0.46, 0.25],
            [0.02, 0.18],
          ],
          14,
        ),
        x,
        1.1,
        z,
        metal,
        {
          kind: KIND.metal,
        },
      );
      kit.colCyl(x, 0.8, z, 0.8, 0.5);
      const flameId = this.flames.add(kit.w(x, 1.35, z), 0.8, 1.4, isKiln ? 16738858 : 7329023);
      this.flames.level[flameId] = 1;
      flameIds.push(flameId);
    }
    const hintPos = kit.w(-3.2, 0, 3.4);
    kit.box(-3.2, 1.1, 3.4, 1, 1.8, 0.34, trim, {
      kind: KIND.smooth,
      col: true,
      rot: 0.5,
    });
    kit.glyph(
      -3.2 + Math.sin(0.5) * 0.18,
      1.35,
      3.4 + Math.cos(0.5) * 0.18,
      Math.sin(0.5),
      Math.cos(0.5),
      0.6,
      isKiln ? GLYPH.flame : GLYPH.snow,
      glass,
      2,
      1.1,
    );
    this.hints.add(hintPos.clone().add(_gateVec.set(fwd.x * 1.1, 0, fwd.z * 1.1)), def.hint, 3);
    const mesh = new Mesh(mergeGeometries(kit.parts), this.mat.material);
    mesh.name = `temple-gate-${def.style}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    for (const part of kit.parts) part.dispose();
    const glyphMesh = new Mesh(mergeGeometries(kit.glyphs), glyphMat);
    glyphMesh.matrixAutoUpdate = false;
    this.group.add(glyphMesh);
    for (const glyph of kit.glyphs) glyph.dispose();
    for (const col of kit.cols)
      try {
        col.desc.setCollisionGroups(COLLISION_GROUPS.static).setFriction(0.8);
        const collider = ctx.physics.createCollider(col.desc);
        ctx.colliders.register(collider, {
          kind: 'structure',
          surface: col.surface,
          object: mesh,
          data: {
            temple: def.style,
            gate: true,
          },
        });
      } catch (err) {
        console.warn('[temples] gate collider failed', err);
      }
    try {
      ctx.vegetation?.clearGrass?.(kit.w(0, 0, 3), 8.5);
    } catch {}
    const veilK = {
      value: 1,
    };
    const portalMat = makePortalMaterial(ctx, isKiln ? 16730650 : 2792703, isKiln ? 16760944 : 14219007, veilK);
    const portalPos = kit.w(0, 0, -0.6);
    const temple = def.temple;
    const portal = new Portal(ctx, portalPos, def.yaw, 3.3, 5.3500000000000005, portalMat, this.group, () => {
      ctx.interiors.travel(temple.entryPos, temple.spec.entry.facing);
    });
    const heatK = {
      value: isKiln ? 0.6 : 0.35,
    };
    const heatGeo = new CylinderGeometry(1.4, 1.8, 6, 16, 1, true);
    heatGeo.translate(0, 3, 0);
    const heatColumn = new Mesh(heatGeo, makeColumnMaterial(ctx, isKiln ? 16747072 : 11068159, heatK));
    heatColumn.position.copy(kit.w(0, 0.1, 0.2));
    heatColumn.renderOrder = 6;
    this.group.add(heatColumn);
    const front = kit.w(0, 0.05, 3.2);
    moteDefs.push({
      x: base.x,
      y: base.y + 0.3,
      z: base.z,
      radius: 5,
      height: isKiln ? 6 : 4,
      count: 60,
      color: isKiln ? 16752720 : 14218495,
      size: isKiln ? 0.08 : 0.07,
      kind: isKiln ? 2 : 0,
    });
    const gate = {
      def,
      base,
      front,
      portal,
      veilK,
      heatK,
      flames: flameIds,
    };
    temple.exitTo = {
      pos: front,
      facing: def.yaw,
    };
    try {
      temple.def.entrance = portalPos.clone();
      ctx.interiors.register(temple.def);
    } catch {}
    return gate;
  }
  update(dt) {
    const state = this.ctx.player?.state;
    if (!state) return;
    let near = false;
    for (const gate of this.list) {
      const dist = Math.hypot(state.position.x - gate.base.x, state.position.z - gate.base.z);
      if (dist > 90) continue;
      near = true;
      const completed = gate.def.temple.completed;
      gate.veilK.value += ((completed ? 1.35 : 1) - gate.veilK.value) * Math.min(1, dt * 2);
      if (dist < 12 && Math.abs(state.position.y - gate.base.y) < 6) gate.portal.update();
    }
    this.mat.chan[2] =
      0.9 +
      0.3 * Math.sin((this.ctx.time?.elapsed ?? 0) * 1.7) +
      (this.list.some((gate) => gate.def.temple.completed) ? 0.4 : 0);
    if (near) {
      this.hints.update();
      this.motes?.update(this.ctx);
    }
    if (near !== this.near) {
      this.near = near;
      this.group.visible = true;
    }
  }
}
