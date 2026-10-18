/**
 * The Frozen Cistern, the Frost temple: palette, spec and layout. Freeze the channel and the cascade, slip through the timed ice gate, thaw the key with Ember, clear the guard room and outlast the Rimewarden's falling icicles.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { COLLISION_GROUPS, INTERIOR_POCKETS } from '../core/config.js';
import { lathe } from '../shared/util.js';
import { KeyPickup, PressurePlate } from './devices.js';
import { BattleRoom, BossFight } from './encounters.js';
import { GLYPH } from './glyphs.js';
import { banner, buildRoom, glyphFrieze } from './kit.js';
import { makeIceMaterial, makePortalMaterial, makeWaterMaterial } from './materials.js';
import { addCollider, sfx } from './props.js';
import { KIND } from './stone-material.js';
import { Temple } from './temple.js';
const CISTERN_PALETTE = {
  stone: 0xc3ced8,
  low: 5663360,
  trim: 0xdfe8ef,
  floor: 8886182,
  ceil: 4610154,
  metal: 0xc9a45c,
  glass: 5030911,
  accent: 12578815,
};
const CISTERN_SPEC = {
  id: 'cistern',
  name: 'The Frozen Cistern',
  subtitle: 'Still water remembers',
  element: 'blue',
  counter: 'red',
  crest: 'frostCrest',
  pocket: INTERIOR_POCKETS.cistern,
  lighting: {
    ambient: 0.42,
    ambientColor: 0x9ab2cc,
    fogColor: 0x0d2b36,
    fogDensity: 0.011,
    exposure: 1.05,
  },
  litLighting: {
    ambient: 0.54,
    ambientColor: 0xb4d4ee,
    fogColor: 0x184b5c,
    fogDensity: 0.008,
    exposure: 1.08,
  },
  theme: {
    frost: 1,
    soot: 0,
    litColor: 0x6fd4ff,
    vitality: false,
    name: 'cistern',
  },
  palette: CISTERN_PALETTE,
  chest: {
    wood: 0x4a6fa8,
    woodDark: 0x35507e,
    metal: 0xdfe8f2,
    metalDark: 0x9fb1c4,
    gem: 0x7fdcff,
  },
  entry: {
    x: 0,
    z: 27.2,
    facing: Math.PI,
  },
  litToast: ['The Cistern sings again', 'Still water remembers its painters'],
};
const CISTERN_WALL_STYLE = {
  base: CISTERN_PALETTE.stone,
  low: CISTERN_PALETTE.low,
  trim: CISTERN_PALETTE.trim,
  glass: CISTERN_PALETTE.glass,
  glyph: GLYPH.snow,
  lowKind: KIND.ashlar,
  wainscot: 1.3,
};
export class CisternTemple extends Temple {
  water;
  waterParts = [];
  frz = [];
  channel;
  cascade;
  gate;
  plate;
  lanterns = [];
  lanternCh = 0;
  gateT = 0;
  gateSolved = false;
  keyBlock;
  keyPickup;
  icicles = [];
  icicleClock = 0;
  arenaBraziers = [];
  guardBraziers = [];
  portalK = {
    value: 1,
  };
  exitK = {
    value: 0,
  };
  sanctumDoor;
  constructor(ctx) {
    super(ctx, CISTERN_SPEC);
  }
  spots() {
    return {
      cistern: {
        x: 0,
        y: 0.05,
        z: 27.2,
        facing: Math.PI,
      },
      'cistern-skate': {
        x: 0,
        y: 0.05,
        z: 10.4,
        facing: Math.PI,
      },
      'cistern-hub': {
        x: 0,
        y: 0.05,
        z: -12,
        facing: Math.PI,
      },
      'cistern-gallery': {
        x: 11.5,
        y: 7.05,
        z: -20,
        facing: Math.PI,
      },
      'cistern-guard': {
        x: -12,
        y: 0.05,
        z: -20,
        facing: -Math.PI / 2,
      },
      'cistern-boss': {
        x: -23.5,
        y: 0.05,
        z: -13,
        facing: 0,
      },
      'cistern-sanctum': {
        x: -20,
        y: 0.05,
        z: 16,
        facing: 0,
      },
    };
  }
  waterPlane(x0, x1, z0, z1, y, seg, speed, dx, dz) {
    const geometry = new PlaneGeometry(
      x1 - x0,
      z1 - z0,
      Math.max(1, Math.round((x1 - x0) / 1.5)),
      Math.max(1, Math.round((z1 - z0) / 1.5)),
    );
    geometry.rotateX(-Math.PI / 2);
    geometry.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    this.finishWater(geometry, seg, speed, (px, py, pz) => [px * dz - pz * dx, px * dx + pz * dz]);
  }
  waterSheet(x, z, alongX, from, to, y0, y1, seg, speed, yaw) {
    const geometry = new PlaneGeometry(
      to - from,
      y1 - y0,
      Math.max(1, Math.round(to - from)),
      Math.max(2, Math.round((y1 - y0) / 1.2)),
    );
    geometry.rotateY(yaw);
    geometry.translate(alongX ? (from + to) / 2 : x, (y0 + y1) / 2, alongX ? z : (from + to) / 2);
    this.finishWater(geometry, seg, speed, (px, py, pz) => [alongX ? px : pz, -py]);
  }
  finishWater(geometry, seg, speed, uvOf) {
    geometry.deleteAttribute('uv');
    const count = geometry.attributes.position.count;
    const position = geometry.attributes.position;
    const uvs = new Float32Array(count * 2);
    const flow = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const [u, v] = uvOf(position.getX(i), position.getY(i), position.getZ(i));
      uvs.set([u, v], i * 2);
      flow.set([speed, seg], i * 2);
    }
    geometry.setAttribute('aUv2', new BufferAttribute(uvs, 2));
    geometry.setAttribute('aW', new BufferAttribute(flow, 2));
    geometry.translate(this.origin.x, this.origin.y, this.origin.z);
    this.waterParts.push(geometry);
  }
  iceMesh(geometry, x, y, z, span) {
    const reveal = {
      value: 0,
    };
    const revealFrom = {
      value: this.kit.w(x, y, z),
    };
    const material = makeIceMaterial(this.ctx, reveal, revealFrom, span);
    const mesh = new Mesh(geometry, material);
    mesh.position.copy(this.kit.w(x, y, z));
    mesh.visible = false;
    mesh.name = 'cistern-ice';
    this.root.add(mesh);
    return {
      mesh,
      reveal,
      origin: revealFrom,
    };
  }
  layout() {
    const kit = this.kit;
    const ctx = this.ctx;
    this.water = makeWaterMaterial(ctx);
    kit.chunk = 'A';
    buildRoom(kit, {
      x0: -8,
      x1: 8,
      z0: 12,
      z1: 30,
      h: 9,
      style: CISTERN_WALL_STYLE,
      floor: CISTERN_PALETTE.floor,
      ceil: CISTERN_PALETTE.ceil,
      beams: 3,
      noFloor: true,
      doors: [
        {
          side: 'n',
          c: 0,
          w: 3.4,
          h: 4.6,
        },
        {
          side: 's',
          c: 0,
          w: 3.2,
          h: 4.6,
        },
      ],
    });
    kit.box(0, -1.75, 14, 18, 3.5, 6, CISTERN_PALETTE.floor, {
      col: true,
    });
    kit.box(0, -1.75, 27.5, 18, 3.5, 7, CISTERN_PALETTE.floor, {
      col: true,
    });
    kit.box(0, -3.4, 20.5, 19, 0.8, 7, CISTERN_PALETTE.low, {
      col: true,
    });
    for (const side of [-1, 1])
      kit.box(side * 9.35, -1.9, 20.5, 0.7, 3.8, 7.2, CISTERN_PALETTE.low, {
        col: true,
        kind: KIND.ashlar,
      });
    for (const z of [17.1, 23.9])
      kit.box(0, 0.06, z, 16, 0.12, 0.3, CISTERN_PALETTE.trim, {
        kind: KIND.smooth,
      });
    this.waterPlane(-9.2, 9.2, 17, 24, -0.35, 0, 1.6, -1, 0);
    kit.box(7.75, 3, 20.5, 0.5, 2.6, 2.8, CISTERN_PALETTE.trim, {
      kind: KIND.smooth,
      bevel: 0.08,
    });
    const urn = lathe(
      [
        [0.02, 0],
        [0.55, 0.05],
        [0.95, 0.5],
        [1.05, 1.1],
        [0.8, 1.7],
        [0.45, 1.95],
        [0.5, 2.15],
        [0.42, 2.2],
      ],
      18,
    );
    kit.geo(urn, 7.4, 2.6, 20.5, CISTERN_PALETTE.stone, {
      kind: KIND.smooth,
      rot: new Euler(0, 0, 1.25),
    });
    const geometry = new TorusGeometry(1.02, 0.07, 6, 22);
    geometry.rotateY(Math.PI / 2);
    kit.geo(geometry, 6.95, 2.9, 20.5, CISTERN_PALETTE.metal, {
      kind: KIND.metal,
      rot: new Euler(0, 0, 1.25 - Math.PI / 2),
    });
    kit.glyph(7.48, 4.25, 20.5, new Vector3(-1, 0, 0), 0.8, GLYPH.drop, CISTERN_PALETTE.glass, 0, 1.2);
    this.waterSheet(5.55, 20.5, false, 19.9, 21.1, -0.35, 2.45, 3, 3.4, -Math.PI / 2);
    for (const x of [-5.5, 5.5])
      for (const z of [13.6, 27.6]) kit.column(x, z, 0, 7.4, 0.4, CISTERN_PALETTE.trim, CISTERN_PALETTE.stone);
    this.font(5.2, 26.2, 'blue');
    this.hint(
      -5.3,
      26,
      0.9,
      'The current is too wide to leap. Flick Frost onto the water — or loose an Ice Lance — and it will hold you.',
      GLYPH.snow,
    );
    const portalMat = makePortalMaterial(ctx, 3844351, 13169407, this.portalK);
    kit.box(0, 2.5, 31.35, 4.2, 5, 0.7, CISTERN_PALETTE.low, {
      col: true,
    });
    this.portal(0, 30.45, Math.PI, 3.1, 4.5, portalMat, true);
    glyphFrieze(kit, false, -8, 12, 30, 3.4, 1, 2.3, [GLYPH.snow, GLYPH.drop, 7, 8], CISTERN_PALETTE.glass, 1, 0.9);
    glyphFrieze(kit, false, 8, 12, 30, 3.4, -1, 2.3, [GLYPH.snow, GLYPH.drop, 9, 10], CISTERN_PALETTE.glass, 1, 0.9);
    this.lanternPair(kit, [-7.5, 7.5], 25.5, 3.4);
    this.lights.add(kit.w(0, 6.5, 21), 10476799, 3.5, 14, 1, 0.02);
    this.lights.add(kit.w(0, 1, 20.5), 5030911, 4, 9, 1, 0.05);
    this.icicleRow(kit, -7.6, 7.6, 11.9, true, 8.3, 'a');
    const channelIce = this.iceMesh(new BoxGeometry(18.2, 0.35, 7), 0, -0.5, 20.5, 12);
    this.kit.colBox(0, -0.55, 20.5, 9.1, 0.2, 3.5, undefined, 'stone', 'channel-ice');
    this.channel = {
      seg: 0,
      frozen: false,
      t: 0,
      radius: 13,
      cols: [],
      ice: [channelIce],
      test: (x, y, z, radius) =>
        Math.abs(x) < 8 + radius && z > 17 - radius && z < 24 + radius && y > -3.3 && y < 1.8 + radius,
      onFreeze: () => this.solved('channel', [0, 0, 20.5]),
    };
    this.frz.push(this.channel);
    kit.chunk = 'B';
    buildRoom(kit, {
      x0: -4.5,
      x1: 4.5,
      z0: -8,
      z1: 10,
      h: 8,
      style: CISTERN_WALL_STYLE,
      floor: CISTERN_PALETTE.floor,
      ceil: CISTERN_PALETTE.ceil,
      beams: 3,
      noFloor: true,
      doors: [
        {
          side: 's',
          c: 0,
          w: 3.4,
          h: 4.6,
        },
        {
          side: 'n',
          c: 0,
          w: 3.4,
          h: 4.6,
        },
      ],
    });
    kit.floor(-5.5, 5.5, 6.4, 11, 0, CISTERN_PALETTE.floor);
    kit.floor(-5.5, 5.5, -9, 6.4, 0, 12575730, 0.8, 'ice', KIND.ice);
    for (let z = -7; z < 6; z += 2.2)
      kit.box(0, 0.005, z, 8.6, 0.01, 0.06, 15267839, {
        kind: KIND.ice,
      });
    for (const [x, z] of [
      [-2, 2.6],
      [2.1, -2.6],
    ]) {
      const pillar = lathe(
        [
          [0.75, 0],
          [0.55, 0.6],
          [0.5, 3],
          [0.62, 5.5],
          [0.9, 7.2],
          [1.2, 8],
        ],
        12,
      );
      kit.geo(pillar, x, 0, z, 13364991, {
        kind: KIND.ice,
      });
      kit.colCyl(x, 4, z, 4, 0.62);
    }
    this.plate = new PressurePlate(
      ctx,
      kit.w(0, 0, 8.2),
      1.2,
      this.stone.material,
      this.root,
      {
        stone: CISTERN_PALETTE.trim,
        glass: CISTERN_PALETTE.glass,
        metal: CISTERN_PALETTE.metal,
      },
      (this.lanternCh = this.ch()),
    );
    this.gate = this.door(0, -8.5, 3.4, 4.6, true, 'bars', false, 0.35);
    for (const z of [5, 1.2, -2.6, -6.2])
      for (const side of [-1, 1]) {
        kit.box(side * 4.25, 3.1, z, 0.5, 0.2, 0.6, CISTERN_PALETTE.metal, {
          kind: KIND.metal,
        });
        const cup = lathe(
          [
            [0.02, 0],
            [0.18, 0.02],
            [0.26, 0.16],
            [0.02, 0.1],
          ],
          10,
        );
        kit.geo(cup, side * 4.2, 3.2, z, CISTERN_PALETTE.metal, {
          kind: KIND.metal,
        });
        this.lanterns.push(this.flames.add(kit.w(side * 4.2, 3.3, z), 0.4, 0.75, 5030911));
      }
    this.hint(
      -3,
      7.6,
      2.3,
      'Stand on the plate and the gate will rise — but only for a few heartbeats. Slide across the ice!',
      GLYPH.drop,
    );
    this.lights.add(kit.w(0, 5, 1), 10476799, 3, 12, 1, 0.02);
    this.icicleRow(kit, -4.2, 4.2, -7.9, true, 7.3, 'b');
    kit.chunk = 'C';
    buildRoom(kit, {
      x0: -14,
      x1: 14,
      z0: -30,
      z1: -10,
      h: 15,
      style: CISTERN_WALL_STYLE,
      floor: CISTERN_PALETTE.floor,
      ceil: CISTERN_PALETTE.ceil,
      beams: 4,
      pilasters: 4.6,
      doors: [
        {
          side: 's',
          c: 0,
          w: 3.4,
          h: 4.6,
        },
        {
          side: 'w',
          c: -20,
          w: 3.4,
          h: 5,
        },
      ],
    });
    kit.box(11.5, 3.5, -20, 5, 7, 20, CISTERN_PALETTE.low, {
      col: true,
    });
    kit.box(9.1, 6.9, -20, 0.3, 0.3, 20, CISTERN_PALETTE.trim, {
      kind: KIND.smooth,
    });
    for (const [z0, z1] of [
      [-30, -26.1],
      [-21.9, -10],
    ]) {
      const mid = (z0 + z1) / 2;
      kit.box(9.25, 7.55, mid, 0.3, 1.1, z1 - z0, CISTERN_PALETTE.trim, {
        kind: KIND.smooth,
        col: true,
      });
      for (let z = z0 + 0.6; z < z1; z += 1.4)
        kit.box(9.25, 7.4, z, 0.36, 0.8, 0.36, CISTERN_PALETTE.trim, {
          kind: KIND.smooth,
        });
    }
    glyphFrieze(kit, false, 9.2, -30, -10, 4, -1, 2.4, [GLYPH.snow, 11, 12], CISTERN_PALETTE.glass, 1, 1, [
      {
        c: -24,
        w: 4.6,
      },
    ]);
    const stepLen = 10 / 4;
    const stepRise = 7 / 4;
    for (let i = 0; i < 4; i++) {
      const stepX = -1 + i * stepLen;
      const stepTop = (i + 1) * stepRise;
      kit.box(stepX + stepLen / 2, stepTop / 2, -24, stepLen, stepTop, 4, i % 2 ? CISTERN_PALETTE.low : 6255752, {
        col: true,
      });
      this.waterPlane(stepX + 0.05, stepX + stepLen, -25.7, -22.3, stepTop + 0.06, 1, 1.2, -1, 0);
      if (i > 0)
        this.waterSheet(
          stepX + 0.02,
          -24,
          false,
          -25.7,
          -22.3,
          i * stepRise - 0.05,
          stepTop + 0.06,
          1,
          3,
          -Math.PI / 2,
        );
    }
    this.waterSheet(-1.01, -24, false, -25.7, -22.3, 0.05, 1.81, 1, 3, -Math.PI / 2);
    for (const side of [-1, 1]) {
      const edge = new Vector3(-1, 0, -24 + side * 2.25);
      for (let i = 0; i < 4; i++)
        kit.box(
          -1 + i * stepLen + stepLen / 2,
          ((i + 1) * stepRise) / 2 + 0.5,
          edge.z,
          stepLen,
          (i + 1) * stepRise + 1,
          0.5,
          CISTERN_PALETTE.trim,
          {
            kind: KIND.smooth,
            col: true,
          },
        );
    }
    this.waterPlane(-3.4, -1, -25.8, -22.2, 0.05, 1, 0.6, -1, 0);
    this.waterPlane(9, 13.4, -25.5, -22.5, 7.08, 1, 1.4, -1, 0);
    kit.box(13.3, 13.9, -24, 1.2, 1.2, 3, CISTERN_PALETTE.trim, {
      kind: KIND.smooth,
      bevel: 0.15,
    });
    this.waterSheet(13.25, -24, false, -25.3, -22.7, 7.05, 13.4, 1, 3.4, -Math.PI / 2);
    kit.glyph(13.38, 10.2, -26.2, new Vector3(-1, 0, 0), 1.2, GLYPH.drop, CISTERN_PALETTE.glass, 1, 1);
    const rampGeo = new BufferGeometry();
    {
      const len = 10.2;
      const rise = 7.06;
      const width = 3.9;
      const positions = [
        0,
        0,
        -3.9 / 2,
        len,
        rise,
        -3.9 / 2,
        len,
        0,
        -3.9 / 2,
        0,
        0,
        width / 2,
        len,
        0,
        width / 2,
        len,
        rise,
        width / 2,
        0,
        0,
        -3.9 / 2,
        0,
        0,
        width / 2,
        len,
        rise,
        width / 2,
        0,
        0,
        -3.9 / 2,
        len,
        rise,
        width / 2,
        len,
        rise,
        -3.9 / 2,
      ];
      rampGeo.setAttribute('position', new Float32BufferAttribute(positions, 3));
      rampGeo.computeVertexNormals();
    }
    const rampIce = this.iceMesh(rampGeo, -3.6, 0.02, -24, 12);
    const fallGeo = new CylinderGeometry(1.1, 1.5, 6.4, 10, 4);
    const fallIce = this.iceMesh(fallGeo, 12.9, 10.2, -24, 12);
    fallIce.origin.value.copy(rampIce.origin.value);
    this.kit.colRamp(-3.7, 0.02, -24, 6.65, 7.1, -24, 3.9, 0.5, 'stone', 'cascade-ice');
    this.cascade = {
      seg: 1,
      frozen: false,
      t: 0,
      radius: 18,
      cols: [],
      ice: [rampIce, fallIce],
      test: (x, y, z, radius) =>
        (x > -3.8 - radius && x < 9.3 + radius && Math.abs(z - -24) < 2.3 + radius && y > -0.5 && y < 8.5) ||
        (x > 9 && x < 14 && Math.abs(z - -24) < 2 + radius && y > 6.5 && y < 14),
      onFreeze: () => this.solved('cascade', [4, 3.5, -24]),
    };
    this.frz.push(this.cascade);
    const fountain = new Vector3(-7.5, 0, -16.8);
    const basin = lathe(
      [
        [3.4, 0],
        [4.1, 0],
        [4.15, 0.7],
        [3.9, 0.85],
        [3.45, 0.8],
        [3.4, 0.4],
      ],
      40,
    );
    kit.geo(basin, fountain.x, 0, fountain.z, CISTERN_PALETTE.trim, {
      kind: KIND.smooth,
    });
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      kit.colBox(
        fountain.x + Math.cos(angle) * 3.75,
        0.42,
        fountain.z + Math.sin(angle) * 3.75,
        0.4,
        0.42,
        0.8,
        -angle,
      );
    }
    {
      const geometry = new CircleGeometry(3.45, 36);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(fountain.x, 0.55, fountain.z);
      this.finishWater(geometry, 2, 0.25, (px, py, pz) => [px, pz]);
    }
    const pedestal = lathe(
      [
        [0.9, 0],
        [0.8, 0.5],
        [0.6, 1.6],
        [0.75, 1.8],
        [0.02, 1.85],
      ],
      16,
    );
    kit.geo(pedestal, fountain.x, 0.4, fountain.z, CISTERN_PALETTE.trim, {
      kind: KIND.smooth,
    });
    kit.colCyl(fountain.x, 1.1, fountain.z, 0.9, 0.85);
    const statue = lathe(
      [
        [0.55, 0],
        [0.5, 0.8],
        [0.38, 1.7],
        [0.26, 2.2],
        [0.02, 2.3],
      ],
      14,
    );
    kit.geo(statue, fountain.x, 2.25, fountain.z, CISTERN_PALETTE.stone, {
      kind: KIND.smooth,
    });
    const head = new SphereGeometry(0.28, 12, 8);
    kit.geo(head, fountain.x, 4.8, fountain.z, CISTERN_PALETTE.stone, {
      kind: KIND.smooth,
    });
    const jug = lathe(
      [
        [0.02, 0],
        [0.3, 0.05],
        [0.42, 0.35],
        [0.25, 0.7],
        [0.18, 0.8],
        [0.22, 0.9],
      ],
      12,
    );
    kit.geo(jug, fountain.x + 0.55, 4, fountain.z + 0.2, CISTERN_PALETTE.metal, {
      kind: KIND.metal,
      rot: new Euler(0, 0, -1.1),
    });
    this.waterSheet(
      fountain.x + 1.15,
      fountain.z + 0.2,
      false,
      fountain.z - 0.05,
      fountain.z + 0.45,
      0.55,
      4.2,
      2,
      3.2,
      -Math.PI / 2,
    );
    this.lights.add(kit.w(fountain.x, 1.5, fountain.z), 5030911, 5, 9, 1, 0.05);
    this.lanternPair(kit, [-13.5], -26, 4);
    this.lanternPair(kit, [-13.5], -14, 4);
    this.lights.add(kit.w(0, 12, -20), 11068159, 4, 18, 1, 0.02);
    this.lights.add(kit.w(3, 3, -24), 6279423, 5, 10, 1, 0.05);
    this.icicleRow(kit, -13.6, 8.6, -29.9, true, 14.3, 'c1');
    banner(
      kit,
      -13.9,
      -26,
      11,
      Math.PI / 2,
      1.8,
      4.2,
      2772858,
      CISTERN_PALETTE.metal,
      CISTERN_PALETTE.glass,
      GLYPH.snow,
      1,
    );
    banner(
      kit,
      -13.9,
      -14,
      11,
      Math.PI / 2,
      1.8,
      4.2,
      2772858,
      CISTERN_PALETTE.metal,
      CISTERN_PALETTE.glass,
      GLYPH.snow,
      1,
    );
    this.hint(
      3.6,
      -11.6,
      -0.6,
      'The cascade once climbed to the gallery. Freeze the falling water and walk up the ice.',
      GLYPH.drop,
    );
    const keySpot = new Vector3(11.8, 7, -13.6);
    const keyReveal = {
      value: 1,
    };
    const keyIceMat = makeIceMaterial(
      ctx,
      keyReveal,
      {
        value: kit.w(keySpot.x, keySpot.y + 1, keySpot.z),
      },
      2.5,
    );
    keyIceMat.transparent = true;
    keyIceMat.opacity = 0.62;
    keyIceMat.depthWrite = false;
    const mesh = new Mesh(new IcosahedronGeometry(1.35, 1), keyIceMat);
    mesh.scale.set(1.05, 1.15, 1.05);
    mesh.position.copy(kit.w(keySpot.x, keySpot.y + 1.25, keySpot.z));
    mesh.renderOrder = 4;
    mesh.name = 'cistern-key-ice';
    this.root.add(mesh);
    const keyCol = addCollider(
      ctx,
      ctx.RAPIER.ColliderDesc.ball(1.3).setTranslation(mesh.position.x, mesh.position.y, mesh.position.z),
      'ice',
      mesh,
      'key-ice',
    );
    this.keyBlock = {
      mesh,
      reveal: keyReveal,
      col: keyCol,
      melting: 0,
      melted: false,
      pos: mesh.position.clone(),
    };
    this.keyPickup = new KeyPickup(
      ctx,
      kit.w(keySpot.x, keySpot.y + 0.9, keySpot.z),
      this.stone.material,
      this.root,
      this.particles,
      new Color(0x4cc3ff),
    );
    this.keyPickup.mesh.visible = true;
    this.keyPickup.mesh.position.copy(kit.w(keySpot.x, keySpot.y + 1.2, keySpot.z));
    this.keyPickup.onCollect = () => {
      this.gainKey();
      this.setCheckpoint(-10.5, -20, -Math.PI / 2);
    };
    this.pickups.push(this.keyPickup);
    kit.box(keySpot.x, 7.1, keySpot.z, 3, 0.2, 3, CISTERN_PALETTE.trim, {
      kind: KIND.smooth,
    });
    this.font(13, -19.6, 'red', 7);
    this.hint(
      12.9,
      -17.2,
      -Math.PI / 2,
      'Ember melts what Frost has sealed. Fill your red ink at the font, then warm the ice.',
      GLYPH.flame,
      7,
    );
    this.lights.add(kit.w(keySpot.x, 9.5, keySpot.z), 12577023, 5, 8, 1, 0.03);
    kit.chunk = 'D';
    buildRoom(kit, {
      x0: -31,
      x1: -16,
      z0: -30,
      z1: -10,
      h: 10,
      style: CISTERN_WALL_STYLE,
      floor: CISTERN_PALETTE.floor,
      ceil: CISTERN_PALETTE.ceil,
      beams: 3.5,
      pilasters: 3.8,
      doors: [
        {
          side: 'e',
          c: -20,
          w: 3.4,
          h: 5,
        },
        {
          side: 's',
          c: -23.5,
          w: 4,
          h: 5.6,
        },
      ],
    });
    for (const [x, z] of [
      [-27, -25],
      [-20, -25],
      [-27, -15],
      [-20, -15],
    ])
      kit.column(x, z, 0, 8.4, 0.45, CISTERN_PALETTE.trim, CISTERN_PALETTE.stone);
    this.guardBraziers.push(this.brazier(-27.5, -11.3, 0, 0.8, undefined, 5030911));
    this.guardBraziers.push(this.brazier(-19.5, -11.3, 0, 0.8, undefined, 5030911));
    this.font(-29.4, -13, 'red');
    for (const z of [-26, -17]) this.sconce(-30.95, z, 3.4, 1, 0, 7329023);
    for (const x of [-27, -20]) this.sconce(x, -29.95, 3.4, 0, 1, 7329023);
    this.hint(
      -17.4,
      -12.2,
      -0.9,
      'The Rimewarden wears winter like armour. Ember cracks it — fill your red ink here.',
      GLYPH.flame,
    );
    banner(
      kit,
      -30.9,
      -20,
      8.5,
      Math.PI / 2,
      1.8,
      4,
      2772858,
      CISTERN_PALETTE.metal,
      CISTERN_PALETTE.glass,
      GLYPH.mask,
      1,
    );
    this.icicleRow(kit, -30.6, -16.4, -29.9, true, 9.3, 'd');
    kit.chunk = 'E';
    buildRoom(kit, {
      x0: -31,
      x1: -11,
      z0: -8,
      z1: 12,
      h: 14,
      style: {
        ...CISTERN_WALL_STYLE,
        wainscot: 2,
      },
      floor: 8227994,
      ceil: CISTERN_PALETTE.ceil,
      beams: 4,
      pilasters: 0,
      doors: [
        {
          side: 'n',
          c: -23.5,
          w: 4,
          h: 5.6,
        },
        {
          side: 's',
          c: -20,
          w: 3.4,
          h: 4.6,
        },
      ],
    });
    const arena = new Vector3(-21, 0, 2);
    for (const [x, z, radius] of [
      [-26.5, -1.5, 3.2],
      [-15.5, 6.5, 3],
    ]) {
      const geometry = new CylinderGeometry(radius, radius + 0.15, 0.08, 32);
      kit.geo(geometry, x, 0.04, z, 13167871, {
        kind: KIND.ice,
      });
      const desc = ctx.RAPIER.ColliderDesc.cylinder(0.04, radius);
      const pos = kit.w(x, 0.04, z);
      desc.setTranslation(pos.x, pos.y, pos.z);
      kit.cols.push({
        desc: desc.setCollisionGroups(COLLISION_GROUPS.static).setFriction(0.8),
        surface: 'ice',
        tag: 'pond',
      });
    }
    const dais = new CylinderGeometry(3.4, 3.5, 0.08, 40);
    kit.geo(dais, arena.x, 0.04, arena.z, CISTERN_PALETTE.trim, {
      kind: KIND.smooth,
    });
    kit.glyph(arena.x, 0.09, arena.z, new Vector3(0, 1, 0), 5.8, GLYPH.snow, CISTERN_PALETTE.glass, 0, 1.3);
    for (const [x, z] of [
      [-29.4, -6.4],
      [-12.6, -6.4],
      [-29.4, 10.4],
      [-12.6, 10.4],
    ]) {
      const pillar = lathe(
        [
          [1, 0],
          [0.7, 1],
          [0.6, 7],
          [0.8, 11],
          [1.4, 14],
        ],
        10,
      );
      kit.geo(pillar, x, 0, z, 12576511, {
        kind: KIND.ice,
      });
      kit.colCyl(x, 4, z, 4, 0.75);
    }
    for (const [x, z] of [
      [-29.6, -1],
      [-12.4, -1],
      [-29.6, 6],
      [-12.4, 6],
    ])
      this.arenaBraziers.push(this.brazier(x, z, 0, 0.9, undefined, 5030911));
    this.icicleRow(kit, -30.6, -11.4, -7.9, true, 13.3, 'e1');
    this.icicleRow(kit, -30.6, -11.4, 11.9, true, 13.3, 'e2');
    for (let j = 0; j < 26; j++) {
      const x = -30 + ((j * 7.3) % 18);
      const z = -7 + ((j * 11.7) % 18);
      const geometry = new ConeGeometry(0.25 + (j % 3) * 0.12, 1.4 + (j % 4) * 0.7, 6);
      geometry.rotateX(Math.PI);
      kit.geo(geometry, x, 13.3 - (0.7 + (j % 4) * 0.35), z, 13955327, {
        kind: KIND.ice,
      });
    }
    this.lights.add(kit.w(arena.x, 8, arena.z), 11068159, 4, 18, 1, 0.02);
    this.lights.add(kit.w(arena.x, 1.2, arena.z), 5030911, 4, 8, 1, 0.08);
    glyphFrieze(kit, false, -31, -8, 12, 5, 1, 2.6, [GLYPH.snow, GLYPH.mask, GLYPH.drop], CISTERN_PALETTE.glass, 1, 1);
    glyphFrieze(kit, false, -11, -8, 12, 5, -1, 2.6, [GLYPH.snow, GLYPH.mask, GLYPH.drop], CISTERN_PALETTE.glass, 1, 1);
    for (let i = 0; i < 3; i++) {
      const geometry = new ConeGeometry(0.42, 2.6, 7);
      geometry.rotateX(Math.PI);
      const mesh = new Mesh(
        geometry,
        makeIceMaterial(
          ctx,
          {
            value: 1,
          },
          {
            value: new Vector3(),
          },
          99,
        ),
      );
      mesh.visible = false;
      mesh.name = 'cistern-icicle';
      this.root.add(mesh);
      const ringGeo = new RingGeometry(1.1, 1.45, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ring = new Mesh(
        ringGeo,
        new MeshBasicMaterial({
          color: 0x7fdcff,
          transparent: true,
          opacity: 0.8,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.visible = false;
      ring.renderOrder = 6;
      this.root.add(ring);
      this.icicles.push({
        mesh,
        ring,
        state: 'idle',
        t: 0,
        p: new Vector3(),
        y: 0,
        vy: 0,
      });
    }
    kit.chunk = 'F';
    buildRoom(kit, {
      x0: -27,
      x1: -13,
      z0: 14,
      z1: 30,
      h: 12,
      style: {
        ...CISTERN_WALL_STYLE,
        wainscot: 1.2,
      },
      floor: 10136248,
      ceil: CISTERN_PALETTE.ceil,
      beams: 0,
      pilasters: 3.6,
      doors: [
        {
          side: 'n',
          c: -20,
          w: 3.4,
          h: 4.6,
        },
        {
          side: 'w',
          c: 20,
          w: 3,
          h: 4.2,
        },
      ],
    });
    kit.box(-20, 0.4, 26.4, 7, 0.8, 5.6, CISTERN_PALETTE.trim, {
      kind: KIND.smooth,
      col: true,
    });
    kit.box(-20, 0.84, 26.4, 6.6, 0.08, 5.2, 2772858, {
      kind: KIND.wood,
    });
    kit.stairs(-20, 0, 22.7, 0, 1, 2, 0.4, 0.45, 3.2, CISTERN_PALETTE.trim);
    const medallion = new CylinderGeometry(2.6, 2.6, 0.12, 40);
    medallion.rotateX(Math.PI / 2);
    kit.geo(medallion, -20, 6, 29.95, CISTERN_PALETTE.glass, {
      kind: KIND.glass,
      glow: [1, 1.1],
    });
    const medallionRim = new TorusGeometry(2.7, 0.22, 8, 40);
    kit.geo(medallionRim, -20, 6, 29.9, CISTERN_PALETTE.metal, {
      kind: KIND.metal,
    });
    kit.glyph(-20, 6, 29.85, new Vector3(0, 0, -1), 3.8, GLYPH.snow, 14677759, 1, 1.4);
    for (const [x, z] of [
      [-25.6, 15.4],
      [-14.4, 15.4],
      [-25.6, 28.4],
      [-14.4, 28.4],
    ])
      this.brazier(x, z, 0, 0.85, undefined, 5030911);
    kit.box(-28.35, 2.5, 20, 0.7, 5, 4, CISTERN_PALETTE.low, {
      col: true,
    });
    const exitMat = makePortalMaterial(ctx, 5030911, 15268863, this.exitK);
    this.portal(-27.45, 20, Math.PI / 2, 2.9, 4.1, exitMat, false);
    this.lights.add(kit.w(-20, 3, 26), 12577023, 5, 10, 1, 0.03);
    this.shaft(-20, 26.6, 12, 1.6, 2.6, 14218495, 1);
    this.lights.add(kit.w(-20, 9, 20), 14742783, 2.5, 16, 1, 0.02);
    this.icicleRow(kit, -26.6, -13.4, 29.9, true, 11.3, 'f');
    const addMotes = (x, z, radius, height, count) =>
      this.moteDefs.push({
        x,
        y: 0.5,
        z,
        radius,
        height,
        count,
        color: 0xdff6ff,
        size: 0.06,
        kind: 0,
      });
    addMotes(0, 22, 7, 7, 50);
    addMotes(0, 1, 4, 6, 30);
    addMotes(0, -20, 12, 12, 90);
    addMotes(-23.5, -20, 7, 8, 40);
    addMotes(-21, 2, 9, 11, 70);
    addMotes(-20, 22, 6, 9, 40);
    kit.glyph(0, 7, 12.02, new Vector3(0, 0, 1), 2.6, GLYPH.snow, CISTERN_PALETTE.glass, 1, 1.2);
    const emblemRing = new TorusGeometry(1.55, 0.12, 6, 36);
    kit.geo(emblemRing, 0, 7, 12.08, CISTERN_PALETTE.metal, {
      kind: KIND.metal,
    });
    this.lockedDoor(-14.5, -20, 3.4, 5, false, -12.4, -20);
    const hubSeal = this.door(-15.5, -20, 3.4, 5, false, 'bars', true, 0.7);
    const bossDoor = this.door(-23.5, -9.5, 4, 5.6, true, 'boss');
    const arenaSeal = this.door(-23.5, -8.5, 4, 5.6, true, 'bars', true, 0.7);
    this.sanctumDoor = this.door(-20, 12.5, 3.4, 4.6, true, 'slab');
    this.makeChests([
      {
        id: 'cistern-ink',
        kind: 'small',
        pos: kit.w(-12.3, 0, -27.8),
        facing: Math.PI / 2,
        loot: {
          ink: true,
        },
      },
      {
        id: 'cistern-hearts',
        kind: 'small',
        pos: kit.w(-29.4, 0, -21),
        facing: Math.PI / 2,
        loot: {
          hearts: 20,
        },
        hidden: true,
      },
      {
        id: 'cistern-crest',
        kind: 'grand',
        pos: kit.w(-20, 0.88, 26.8),
        facing: Math.PI,
        loot: {
          item: 'frostCrest',
        },
      },
    ]);
    this.rooms.push(
      new BattleRoom(
        this,
        [-29.8, -17.2, -28.8, -11.2],
        [hubSeal, arenaSeal],
        [
          [
            {
              kind: 'smudgeling',
              x: -27,
              z: -23,
              facing: Math.PI / 2,
            },
            {
              kind: 'smudgeling',
              x: -21,
              z: -26,
              facing: Math.PI / 2,
            },
            {
              kind: 'spitter',
              x: -28.5,
              z: -28,
              facing: Math.PI / 4,
            },
          ],
          [
            {
              kind: 'brute',
              x: -23.5,
              z: -20,
              facing: Math.PI / 2,
            },
            {
              kind: 'spitter',
              x: -29,
              z: -15.5,
              facing: Math.PI / 2,
            },
          ],
        ],
        () => this.onGuardCleared(),
      ),
    );
    this.boss = new BossFight(this, {
      door: bossDoor,
      inside: (x, z) => z > -6.2 && x < -11.5 && z < 12,
      kind: 'brute',
      elite: {
        name: 'Rimewarden',
        element: 'blue',
      },
      spawn: {
        x: arena.x,
        z: arena.z + 2,
        facing: Math.PI,
      },
      introCam: [-23.5, 3.8, -5.2],
      exitDoor: this.sanctumDoor,
      exitCam: [-17, 3.8, 5],
      exitLook: [-20, 2.2, 12.5],
      hazards: (dt, fighting) => this.stepIcicles(dt, fighting),
      onStart: () =>
        this.arenaBraziers.forEach((arenaBrazier, i) => setTimeout(() => arenaBrazier.ignite(), 250 + i * 280)),
      onWin: () => this.setCheckpoint(-20, 9, 0),
    });
    const buildInfo = {
      object: this.root,
      site: 'cistern',
    };
    const colliders = kit.build(this.stone.material, this.glyphMat, null, this.root, buildInfo);
    for (const collider of colliders) {
      const tag = ctx.colliders.get(collider.handle)?.data?.tag;
      if (tag === 'channel-ice') {
        this.channel.cols.push(collider);
        collider.setEnabled(false);
      } else if (tag === 'cascade-ice') {
        this.cascade.cols.push(collider);
        collider.setEnabled(false);
      }
    }
    const waterGeo = this.mergeWater();
    const waterMesh = new Mesh(waterGeo, this.water.material);
    waterMesh.name = 'cistern-water';
    waterMesh.matrixAutoUpdate = false;
    this.root.add(waterMesh);
    for (let i = 0; i < 8; i++) this.water.radius[i] = 18;
  }
  mergeWater() {
    const merged = new BufferGeometry();
    const waterParts = this.waterParts;
    let vertCount = 0;
    let indexCount = 0;
    for (const part of waterParts) {
      vertCount += part.attributes.position.count;
      indexCount += part.index ? part.index.count : part.attributes.position.count;
    }
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const flow = new Float32Array(vertCount * 2);
    const indices = new Uint32Array(indexCount);
    let vertOffset = 0;
    let indexOffset = 0;
    for (const part of waterParts) {
      if (!part.attributes.normal) part.computeVertexNormals();
      const count = part.attributes.position.count;
      positions.set(part.attributes.position.array, vertOffset * 3);
      normals.set(part.attributes.normal.array, vertOffset * 3);
      uvs.set(part.attributes.aUv2.array, vertOffset * 2);
      flow.set(part.attributes.aW.array, vertOffset * 2);
      if (part.index)
        for (let i = 0; i < part.index.count; i++) indices[indexOffset++] = part.index.getX(i) + vertOffset;
      else for (let i = 0; i < count; i++) indices[indexOffset++] = i + vertOffset;
      vertOffset += count;
      part.dispose();
    }
    merged.setAttribute('position', new BufferAttribute(positions, 3));
    merged.setAttribute('normal', new BufferAttribute(normals, 3));
    merged.setAttribute('aUv2', new BufferAttribute(uvs, 2));
    merged.setAttribute('aW', new BufferAttribute(flow, 2));
    merged.setIndex(new BufferAttribute(indices, 1));
    merged.computeBoundingSphere();
    return merged;
  }
  lanternPair(kit, xs, z, y) {
    for (const x of xs) {
      const side = Math.sign(x) || 1;
      kit.box(x, y - 0.1, z, 0.6, 0.2, 0.5, CISTERN_PALETTE.metal, {
        kind: KIND.metal,
      });
      const cup = lathe(
        [
          [0.02, 0],
          [0.22, 0.05],
          [0.28, 0.35],
          [0.2, 0.6],
          [0.02, 0.65],
        ],
        8,
      );
      kit.geo(cup, x - side * 0.15, y, z, CISTERN_PALETTE.metal, {
        kind: KIND.metal,
      });
      const flameId = this.flames.add(kit.w(x - side * 0.15, y + 0.12, z), 0.35, 0.55, 7329023);
      this.flames.level[flameId] = 0.9;
      this.lights.add(kit.w(x - side * 0.6, y, z), 7329023, 2.5, 6, 1, 0.1);
    }
  }
  icicleRow(kit, from, to, at, alongX, topY, id) {
    let index = 0;
    const phase = id.length * 1.7;
    for (let i = from; i < to; i += 0.55) {
      const len = 0.4 + Math.abs(Math.sin(i * 3.1 + phase)) * 1.1 + (index % 5 == 0 ? 0.8 : 0);
      const geometry = new ConeGeometry(0.08 + len * 0.06, len, 5);
      geometry.rotateX(Math.PI);
      const inset = alongX ? (at > 0 ? -0.35 : 0.35) : 0;
      kit.geo(geometry, alongX ? i : at, topY - len / 2, alongX ? at + inset : i, 14218239, {
        kind: KIND.ice,
      });
      index++;
    }
  }
  freeze(zone, at, instant = false) {
    if (!zone.frozen) {
      zone.frozen = true;
      zone.t = instant ? 99 : 0;
      this.water.origin[zone.seg].copy(at);
      this.water.radius[zone.seg] = zone.radius;
      for (const col of zone.cols)
        try {
          col.setEnabled(true);
        } catch {}
      for (const ice of zone.ice) {
        ice.mesh.visible = true;
        ice.origin.value.copy(at);
        ice.reveal.value = +!!instant;
      }
      if (instant) {
        this.water.freeze[zone.seg] = 1;
        return;
      }
      sfx(this.ctx, 'shatter', at, 0.7, 0.6);
      sfx(this.ctx, 'shrine-activate', at, 0.6, 1.4);
      try {
        this.ctx.events.emit('ice:freeze', {
          position: at.clone(),
        });
        this.ctx.events.emit('camera:shake', {
          strength: 0.15,
          position: at.clone(),
        });
      } catch {}
      for (let i = 0; i < 40; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;
        this.particles.spawn({
          x: at.x,
          y: at.y + 0.3,
          z: at.z,
          vx: Math.cos(angle) * speed,
          vy: 1 + Math.random() * 3,
          vz: Math.sin(angle) * speed,
          color: i % 2 ? new Color(0.75, 0.93, 1) : new Color(0.3, 0.76, 1),
          size: 0.1 + Math.random() * 0.1,
          life: 0.9,
          drag: 1.8,
          bright: 2.4,
        });
      }
      zone.onFreeze?.();
    }
  }
  onHitExtra(color, pos, radius, kind) {
    const lx = pos.x - this.origin.x;
    const ly = pos.y - this.origin.y;
    const lz = pos.z - this.origin.z;
    if (color === 'blue')
      for (const zone of this.frz) if (!zone.frozen && zone.test(lx, ly, lz, radius)) this.freeze(zone, pos.clone());
    if (
      color === 'red' &&
      !this.keyBlock.melted &&
      this.keyBlock.melting <= 0 &&
      pos.distanceTo(this.keyBlock.pos) < 2.2 + radius
    ) {
      this.keyBlock.melting = 0.001;
      sfx(this.ctx, 'bramble-burn', this.keyBlock.pos, 0.6, 1.3);
      try {
        this.ctx.events.emit('ice:melt', {
          position: this.keyBlock.pos.clone(),
        });
        this.ctx.events.emit('element:steam', {
          position: this.keyBlock.pos.clone(),
        });
      } catch {}
    }
  }
  onLance(from, direction) {
    if (!this.active || !from || !direction) return;
    const dir = direction.clone().normalize();
    const probe = new Vector3();
    for (let dist = 0; dist < 40; dist += 0.5) {
      probe.copy(from).addScaledVector(dir, dist);
      const lx = probe.x - this.origin.x;
      const ly = probe.y - this.origin.y;
      const lz = probe.z - this.origin.z;
      if (ly < -3.5 || ly > 16) break;
      for (const zone of this.frz) if (!zone.frozen && zone.test(lx, ly, lz, 0.2)) this.freeze(zone, probe.clone());
    }
  }
  onGuardCleared() {
    this.chests?.appear('cistern-hearts');
    this.guardBraziers.forEach((guardBrazier, i) => setTimeout(() => guardBrazier.ignite(), 400 + i * 300));
    this.boss?.unseal();
    this.setCheckpoint(-23.5, -13, 0);
    try {
      this.ctx.ui.toast('The boss door stirs', 'Frost creeps from beneath it…', 'blue');
    } catch {}
  }
  isHazard(pos) {
    const lx = pos.x - this.origin.x;
    const ly = pos.y - this.origin.y;
    const lz = pos.z - this.origin.z;
    return !this.channel.frozen && Math.abs(lx) < 9 && lz > 17 && lz < 24 && ly < -0.9 && ly > -6;
  }
  logic(dt) {
    const ctx = this.ctx;
    const state = ctx.player?.state;
    this.portalK.value = 0.9 + 0.1 * Math.sin(ctx.time.elapsed * 2);
    this.exitK.value += (+!!this.completed - this.exitK.value) * Math.min(1, dt * 1.5);
    for (const zone of this.frz) {
      if (!zone.frozen || zone.t > 5) continue;
      zone.t += dt;
      const amount = Math.min(1, zone.t / 1.2);
      this.water.freeze[zone.seg] = amount;
      for (const ice of zone.ice) ice.reveal.value = Math.min(1, zone.t / 1.5);
    }
    if (state && !state.dead && this.isHazard(state.position)) {
      try {
        ctx.ui.toast('Swept away!', 'The current carried you back to the bank', 'blue');
      } catch {}
      this.respawnSafe(0, this.kit.w(0, 0.05, 26.5), Math.PI);
    }
    const justPressed = this.plate.update(dt);
    if (!this.gateSolved) {
      if (justPressed || (this.plate.pressed && this.gateT < 4.2)) {
        if (this.gateT <= 0) sfx(ctx, 'shrine-activate', this.plate.pos, 0.6, 1.3);
        this.gateT = 4.8;
        this.gate.open();
      }
      if (this.gateT > 0) {
        const prev = this.gateT;
        this.gateT -= dt;
        const pairs = this.lanterns.length / 2;
        const litPairs = Math.ceil((this.gateT / 4.8) * pairs);
        if (Math.ceil((prev / 4.8) * pairs) !== litPairs) sfx(ctx, 'ui-click', this.plate.pos, 0.8, 1.6);
        for (let i = 0; i < pairs; i++) {
          const level = i < litPairs ? 1 : 0.05;
          this.flames.level[this.lanterns[i * 2]] = level;
          this.flames.level[this.lanterns[i * 2 + 1]] = level;
        }
        this.stone.chan[this.lanternCh] = 1.4;
        if (state && state.position.z - this.origin.z < -9.6 && Math.abs(state.position.x - this.origin.x) < 3) {
          this.gateSolved = true;
          this.gateT = 0;
          for (const lantern of this.lanterns) this.flames.level[lantern] = 1;
          this.solved('ice-gate', [0, 2, -8.5]);
          this.setCheckpoint(0, -12.5, Math.PI);
        } else if (this.gateT <= 0) {
          if (state && this.gate.inDoorway(state.position)) this.gateT = 0.3;
          else {
            this.gateT = 0;
            this.gate.close();
            for (const lantern of this.lanterns) this.flames.level[lantern] = 0.25;
          }
        }
      } else {
        this.stone.chan[this.lanternCh] = 0.3 + 0.2 * Math.sin(ctx.time.elapsed * 3);
        for (const lantern of this.lanterns) this.flames.level[lantern] = Math.max(this.flames.level[lantern], 0.25);
      }
    }
    const keyBlock = this.keyBlock;
    if (keyBlock.melting > 0 && !keyBlock.melted) {
      keyBlock.melting += dt;
      const melt = Math.min(1, keyBlock.melting / 1.6);
      keyBlock.mesh.scale.setScalar(1.1 * (1 - melt * 0.92));
      keyBlock.mesh.material.opacity = 0.62 * (1 - melt * 0.6);
      if (Math.random() < 0.8)
        this.particles.spawn({
          x: keyBlock.pos.x + (Math.random() - 0.5) * 2,
          y: keyBlock.pos.y + (Math.random() - 0.5),
          z: keyBlock.pos.z + (Math.random() - 0.5) * 2,
          vy: 1.5 + Math.random() * 1.5,
          color: new Color(0.85, 0.92, 1),
          size: 0.4,
          life: 1.2,
          drag: 1,
          bright: 0.7,
        });
      if (melt >= 1) {
        keyBlock.melted = true;
        keyBlock.mesh.visible = false;
        if (keyBlock.col) {
          try {
            ctx.colliders.unregister(keyBlock.col);
            ctx.physics.removeCollider(keyBlock.col, false);
          } catch {}
          keyBlock.col = null;
        }
        this.keyPickup.show();
        this.solved('thaw', keyBlock.pos);
      }
    } else if (!keyBlock.melted) this.keyPickup.mesh.rotation.y += dt * 0.6;
    if (state && !state.dead) {
      const lx = state.position.x - this.origin.x;
      const lz = state.position.z - this.origin.z;
      if (this.gateSolved && lz < -10.5 && lz > -29 && Math.abs(lx) < 8 && this.checkpoint.pos.z - this.origin.z > -9)
        this.setCheckpoint(0, -12.5, Math.PI);
    }
  }
  stepIcicles(dt, fighting) {
    const ctx = this.ctx;
    const state = ctx.player?.state;
    if (fighting && ((this.icicleClock += dt), this.icicleClock > 2.6)) {
      this.icicleClock = 0;
      let launched = 0;
      for (const icicle of this.icicles)
        if (!(icicle.state !== 'idle' || launched >= 2)) {
          launched++;
          icicle.state = 'warn';
          icicle.t = 0;
          if (launched === 1 && state)
            icicle.p.set(
              state.position.x + (Math.random() - 0.5) * 2.4,
              this.origin.y + 0.05,
              state.position.z + (Math.random() - 0.5) * 2.4,
            );
          else icicle.p.copy(this.kit.w(-29 + Math.random() * 16, 0.05, -6 + Math.random() * 16));
          icicle.p.x = Math.max(this.origin.x - 30, Math.min(this.origin.x - 12, icicle.p.x));
          icicle.p.z = Math.max(this.origin.z - 7, Math.min(this.origin.z + 11, icicle.p.z));
          icicle.y = this.origin.y + 12.4;
          icicle.vy = 0;
          icicle.mesh.visible = true;
          icicle.ring.visible = true;
          icicle.mesh.position.set(icicle.p.x, icicle.y, icicle.p.z);
          icicle.ring.position.copy(icicle.p).setY(this.origin.y + 0.12);
          sfx(ctx, 'shatter', icicle.mesh.position, 0.25, 1.8);
        }
    }
    for (const icicle of this.icicles)
      if (icicle.state !== 'idle') {
        icicle.t += dt;
        if (icicle.state === 'warn') {
          icicle.ring.scale.setScalar(1.2 - Math.min(1, icicle.t / 1.3) * 0.25);
          icicle.ring.material.opacity = 0.45 + 0.4 * Math.abs(Math.sin(icicle.t * 8));
          icicle.mesh.position.x = icicle.p.x + Math.sin(icicle.t * 40) * 0.04;
          if (icicle.t > 1.3) {
            icicle.state = 'fall';
            icicle.t = 0;
            icicle.vy = -6;
          }
        } else if (icicle.state === 'fall') {
          icicle.vy -= 34 * dt;
          icicle.y += icicle.vy * dt;
          icicle.mesh.position.set(icicle.p.x, icicle.y, icicle.p.z);
          if (icicle.y <= this.origin.y + 1.3) this.shatterIcicle(icicle);
        }
        if (!fighting && icicle.state === 'warn') {
          icicle.state = 'idle';
          icicle.mesh.visible = false;
          icicle.ring.visible = false;
        }
      }
  }
  shatterIcicle(icicle) {
    const ctx = this.ctx;
    icicle.state = 'idle';
    icicle.mesh.visible = false;
    icicle.ring.visible = false;
    const pos = icicle.p.clone();
    sfx(ctx, 'shatter', pos, 0.9, 0.9);
    try {
      ctx.events.emit('camera:shake', {
        strength: 0.25,
        position: pos.clone(),
      });
    } catch {}
    for (let i = 0; i < 30; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 4;
      this.particles.spawn({
        x: pos.x,
        y: pos.y + 0.5,
        z: pos.z,
        vx: Math.cos(angle) * speed,
        vy: 2 + Math.random() * 4,
        vz: Math.sin(angle) * speed,
        color: i % 2 ? new Color(0.8, 0.95, 1) : new Color(0.4, 0.8, 1),
        size: 0.12,
        life: 0.8,
        gravity: -14,
        drag: 0.6,
        bright: 2,
      });
    }
    const state = ctx.player?.state;
    if (state && !state.dead) {
      const dx = state.position.x - pos.x;
      const dz = state.position.z - pos.z;
      if (dx * dx + dz * dz < 1.6 * 1.6 && state.position.y - pos.y < 2.5)
        try {
          const dir = new Vector3(dx, 0, dz);
          if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
          ctx.player.damage({
            amount: 1,
            direction: dir.normalize(),
            knockback: 7,
            source: 'icicle',
          });
        } catch {}
    }
    const bossId = this.boss?.bossId ?? -1;
    const boss = bossId >= 0 ? ctx.enemies.get(bossId) : undefined;
    if (boss && boss.alive) {
      const dx = boss.position.x - pos.x;
      const dz = boss.position.z - pos.z;
      if (dx * dx + dz * dz < (2 + boss.radius) ** 2)
        try {
          ctx.enemies.damage(bossId, {
            damage: 3,
            color: null,
            direction: new Vector3(dx, 0, dz).normalize(),
            knockback: 2,
            source: 'environment',
            point: pos.clone(),
          });
        } catch {}
    }
  }
  skipTo(stage) {
    const step = ['entry', 'skate', 'hub', 'gallery', 'key', 'guard', 'boss', 'sanctum', 'done'].indexOf(stage);
    if (!(step < 0)) {
      if (step >= 1) this.freeze(this.channel, this.kit.w(0, -0.35, 20.5), true);
      if (step >= 2) {
        this.gateSolved = true;
        this.gate.open(true);
        for (const lantern of this.lanterns) this.flames.level[lantern] = 1;
        this.setCheckpoint(0, -12.5, Math.PI);
      }
      if (step >= 3) this.freeze(this.cascade, this.kit.w(4, 3.5, -24), true);
      if (step >= 4) {
        this.keyBlock.melted = true;
        this.keyBlock.mesh.visible = false;
        if (this.keyBlock.col) {
          try {
            this.ctx.colliders.unregister(this.keyBlock.col);
            this.ctx.physics.removeCollider(this.keyBlock.col, false);
          } catch {}
          this.keyBlock.col = null;
        }
        this.keyPickup.mesh.visible = false;
        this.keys = Math.max(this.keys, 1);
      }
      if (step >= 5) {
        this.keys = 0;
        for (const lock of this.locks) {
          lock.unlocked = true;
          lock.door.open(true);
        }
      }
      if (step >= 6) {
        for (const room of this.rooms) room.skip();
        this.chests?.appear('cistern-hearts', true);
        for (const guardBrazier of this.guardBraziers) guardBrazier.ignite(true);
        this.boss?.unseal();
        this.setCheckpoint(-23.5, -13, 0);
      }
      if (step >= 7) {
        this.boss?.skipWon();
        for (const arenaBrazier of this.arenaBraziers) arenaBrazier.ignite(true);
        this.setCheckpoint(-20, 9, 0);
      }
      if (step >= 8) {
        this.chests?.openInstant('cistern-crest');
        this.lightUp(true);
      }
    }
  }
}
