/**
 * The Kiln, the Ember temple: palette, spec and layout. Wake the entry braziers, burn the ink webs, ride the heat vent up to the key ledge, clear the guard room and dodge Kilnheart's erupting fire vents.
 */
import {
  BufferAttribute,
  Color,
  CylinderGeometry,
  Euler,
  IcosahedronGeometry,
  Mesh,
  TorusGeometry,
  Vector3,
} from 'three';
import { INTERIOR_POCKETS } from '../core/config.js';
import { lathe } from '../shared/util.js';
import { HeatVent } from './devices.js';
import { BattleRoom, BossFight } from './encounters.js';
import { GLYPH } from './glyphs.js';
import { banner, buildRoom, glyphFrieze } from './kit.js';
import { makeColumnMaterial, makeLavaMaterial, makePortalMaterial } from './materials.js';
import { sfx } from './props.js';
import { KIND } from './stone-material.js';
import { Temple } from './temple.js';
const KILN_PALETTE = {
  stone: 0xcdb398,
  low: 3879472,
  trim: 0xa98a6d,
  floor: 8216916,
  ceil: 4075561,
  metal: 0xb97c3c,
  glass: 16738858,
  accent: 16757575,
};
const KILN_SPEC = {
  id: 'kiln',
  name: 'The Kiln',
  subtitle: 'Where Ember was first mixed',
  element: 'red',
  counter: 'blue',
  crest: 'emberCrest',
  pocket: INTERIOR_POCKETS.kiln,
  lighting: {
    ambient: 0.36,
    ambientColor: 0xd0a98c,
    fogColor: 0x2e1a12,
    fogDensity: 0.011,
    exposure: 1.1,
  },
  litLighting: {
    ambient: 0.46,
    ambientColor: 0xe8b890,
    fogColor: 0x4a2a18,
    fogDensity: 0.008,
    exposure: 1.12,
  },
  theme: {
    frost: 0,
    soot: 1,
    litColor: 0xff7a3a,
    vitality: false,
    name: 'kiln',
  },
  palette: KILN_PALETTE,
  chest: {
    wood: 0x7d3526,
    woodDark: 0x58251b,
    metal: 0xe8b64a,
    metalDark: 0xb0822e,
    gem: 0xff6a2a,
  },
  entry: {
    x: 0,
    z: 27.2,
    facing: Math.PI,
  },
  litToast: ['The Kiln burns bright', 'Ember remembers its first painters'],
};
const KILN_WALL_STYLE = {
  base: KILN_PALETTE.stone,
  low: KILN_PALETTE.low,
  trim: KILN_PALETTE.trim,
  glass: KILN_PALETTE.glass,
  glyph: GLYPH.flame,
  lowKind: KIND.basalt,
  wainscot: 1.5,
};
export class KilnTemple extends Temple {
  entryBraziers = [];
  entryDoor;
  sanctumDoor;
  vent;
  ventCh = 0;
  ventLight = -1;
  ventFlames = [];
  ventK = {
    value: 0,
  };
  arenaBraziers = [];
  guardBraziers = [];
  fireVents = [];
  ventClock = 0;
  ventPair = 0;
  lavaHeat = {
    value: 1,
  };
  webCount = 0;
  entrySolved = false;
  portalK = {
    value: 1,
  };
  exitK = {
    value: 0,
  };
  crucible = null;
  constructor(ctx) {
    super(ctx, KILN_SPEC);
  }
  spots() {
    return {
      kiln: {
        x: 0,
        y: 0.05,
        z: 27.2,
        facing: Math.PI,
      },
      'kiln-gallery': {
        x: 0,
        y: 0.05,
        z: 13.5,
        facing: Math.PI,
      },
      'kiln-hub': {
        x: 0,
        y: 0.05,
        z: 0,
        facing: Math.PI,
      },
      'kiln-vent': {
        x: 16.5,
        y: 0.05,
        z: -5,
        facing: Math.PI / 2,
      },
      'kiln-ledge': {
        x: 25,
        y: 9.05,
        z: -2,
        facing: -Math.PI / 2,
      },
      'kiln-guard': {
        x: -9.5,
        y: 0.05,
        z: -5,
        facing: -Math.PI / 2,
      },
      'kiln-boss': {
        x: -21,
        y: 0.05,
        z: -8.5,
        facing: Math.PI,
      },
      'kiln-sanctum': {
        x: -5.5,
        y: 0.05,
        z: -22.5,
        facing: Math.PI / 2,
      },
    };
  }
  layout() {
    const kit = this.kit;
    const ctx = this.ctx;
    const lavaMat = makeLavaMaterial(ctx, this.lavaHeat);
    kit.chunk = 'A';
    buildRoom(kit, {
      x0: -8,
      x1: 8,
      z0: 16,
      z1: 30,
      h: 9,
      style: KILN_WALL_STYLE,
      floor: KILN_PALETTE.floor,
      ceil: KILN_PALETTE.ceil,
      beams: 3.5,
      pilasters: 0,
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
    kit.box(0, 2.5, 31.35, 4.2, 5, 0.7, KILN_PALETTE.low, {
      kind: KIND.basalt,
      col: true,
    });
    this.entryDoor = this.door(0, 15.5, 3.4, 4.6, true, 'slab');
    for (const x of [-5, 5])
      for (const z of [19.5, 26.5]) kit.column(x, z, 0, 7.4, 0.42, KILN_PALETTE.trim, KILN_PALETTE.stone);
    for (const side of [-1, 1]) {
      const troughX = side < 0 ? -7.8 : 6.6;
      kit.box(troughX + 0.6, 0.12, 23, 1.2, 0.24, 13, KILN_PALETTE.low, {
        kind: KIND.basalt,
      });
      kit.lava(troughX + 0.1, troughX + 1.1, 16.8, 29.2, 0.2, 0, side);
      for (let z = 17; z <= 29; z += 0.5)
        kit.box(troughX + 0.6, 0.26, z, 1.15, 0.06, 0.08, KILN_PALETTE.metal, {
          kind: KIND.metal,
        });
      for (const z of [17.2, 23, 28.8])
        kit.box(troughX + 0.6, 0.26, z, 1.2, 0.08, 0.18, KILN_PALETTE.metal, {
          kind: KIND.metal,
        });
      kit.colBox(troughX + 0.6, 0.14, 23, 0.6, 0.14, 6.5);
      this.lights.add(kit.w(troughX + 0.6, 0.8, 20), 16742960, 2.4, 6, 1, 0.08);
      this.lights.add(kit.w(troughX + 0.6, 0.8, 26), 16742960, 2.4, 6, 1, 0.08);
    }
    glyphFrieze(kit, false, -8, 16, 30, 3.3, 1, 2.3, [GLYPH.flame, 7, 8, GLYPH.sun], KILN_PALETTE.glass, 1, 0.9);
    glyphFrieze(kit, false, 8, 16, 30, 3.3, -1, 2.3, [GLYPH.flame, 9, 10, GLYPH.sun], KILN_PALETTE.glass, 1, 0.9);
    banner(kit, -3.9, 16.1, 8.2, 0, 1.6, 3.4, 8004120, KILN_PALETTE.metal, KILN_PALETTE.glass, GLYPH.flame, 1);
    banner(kit, 3.9, 16.1, 8.2, 0, 1.6, 3.4, 8004120, KILN_PALETTE.metal, KILN_PALETTE.glass, GLYPH.flame, 1);
    this.entryBraziers.push(this.brazier(-3.5, 17.4, 0, 1, () => this.onEntryBrazier()));
    this.entryBraziers.push(this.brazier(3.5, 17.4, 0, 1, () => this.onEntryBrazier()));
    this.hint(
      -5.6,
      24,
      0.95,
      'Two cold hearths guard the way. Wake them with Ember — flick red paint, or hit them with a red brush.',
      GLYPH.flame,
    );
    this.font(5.3, 23.2, 'red');
    const portalMat = makePortalMaterial(ctx, 16734752, 16760944, this.portalK);
    this.portal(0, 30.45, Math.PI, 3.1, 4.5, portalMat, true);
    this.lights.add(kit.w(0, 2.2, 29.5), 16752736, 3, 7, 1, 0.1);
    this.lights.add(kit.w(0, 7.5, 23), 16765088, 2.5, 15, 1, 0.02);
    kit.chunk = 'B';
    buildRoom(kit, {
      x0: -2.5,
      x1: 2.5,
      z0: 3,
      z1: 15,
      h: 6.4,
      style: KILN_WALL_STYLE,
      floor: KILN_PALETTE.floor,
      ceil: KILN_PALETTE.ceil,
      beams: 2,
      walls: {
        n: false,
        s: false,
      },
      doors: [
        {
          side: 'e',
          c: 8.75,
          w: 2.6,
          h: 3.4,
        },
      ],
    });
    buildRoom(kit, {
      x0: 3.5,
      x1: 6.5,
      z0: 7.2,
      z1: 10.3,
      h: 3.8,
      style: {
        ...KILN_WALL_STYLE,
        wainscot: 1,
      },
      floor: KILN_PALETTE.floor,
      ceil: KILN_PALETTE.ceil,
      walls: {
        w: false,
      },
    });
    this.web(0, 11.2, true, 5, 6.3, 'k1', () => this.onWeb());
    this.web(0, 5.6, true, 5, 6.3, 'k2', () => this.onWeb());
    this.web(3, 8.75, false, 2.6, 3.4, 'k3');
    for (const [x, z, size] of [
      [-1.2, 13, 1.6],
      [1.4, 9.6, 1.2],
      [-0.6, 7.4, 1.9],
      [0.9, 4, 1.4],
      [-1.6, 5.2, 0.9],
    ])
      kit.glyph(x, 0.02, z, new Vector3(0, 1, 0), size, 14, 1512476, 0, 0, x * 2);
    for (const [z, y, size] of [
      [12.2, 2.2, 1.3],
      [7.9, 3.4, 1],
      [4.6, 1.4, 1.5],
    ])
      kit.glyph(-2.49, y, z, new Vector3(1, 0, 0), size, 14, 1512476, 0, 0, z);
    this.lights.add(kit.w(0, 4.5, 9), 16748624, 2.2, 8, 1, 0.1);
    for (const z of [12.8, 4.2])
      for (const side of [-1, 1]) {
        kit.box(side * 2.25, 3.2, z, 0.5, 0.2, 0.6, KILN_PALETTE.metal, {
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
        kit.geo(cup, side * 2.2, 3.3, z, KILN_PALETTE.metal, {
          kind: KIND.metal,
        });
        const flameId = this.flames.add(kit.w(side * 2.2, 3.4, z), 0.35, 0.6, 16742960);
        this.flames.level[flameId] = 0.9;
      }
    kit.chunk = 'C';
    buildRoom(kit, {
      x0: -12,
      x1: 12,
      z0: -12,
      z1: 2,
      h: 11,
      style: KILN_WALL_STYLE,
      floor: KILN_PALETTE.floor,
      ceil: KILN_PALETTE.ceil,
      beams: 4,
      pilasters: 4.5,
      doors: [
        {
          side: 's',
          c: 0,
          w: 3.4,
          h: 4.6,
        },
        {
          side: 'e',
          c: -5,
          w: 3.4,
          h: 5,
        },
        {
          side: 'w',
          c: -5,
          w: 3.4,
          h: 5,
        },
      ],
    });
    const pool = new Vector3(0, 0, -5);
    const rim = lathe(
      [
        [3.1, 0],
        [3.9, 0],
        [3.95, 0.8],
        [3.7, 1],
        [3.2, 0.95],
        [3.1, 0.6],
      ],
      40,
    );
    kit.geo(rim, pool.x, 0, pool.z, KILN_PALETTE.low, {
      kind: KIND.basalt,
    });
    const geometry = new TorusGeometry(3.55, 0.12, 6, 48);
    geometry.rotateX(Math.PI / 2);
    kit.geo(geometry, pool.x, 1, pool.z, KILN_PALETTE.metal, {
      kind: KIND.metal,
    });
    for (let i = 0; i < 16; i++) {
      const angle = (i / 16) * Math.PI * 2;
      kit.colBox(pool.x + Math.cos(angle) * 3.5, 0.5, pool.z + Math.sin(angle) * 3.5, 0.45, 0.5, 0.75, -angle);
    }
    kit.lavaDisc(pool.x, pool.z, 3.2, 0.55, 0.3, 0.2);
    const crucible = lathe(
      [
        [0.1, 0],
        [1.1, 0.1],
        [1.6, 0.8],
        [1.8, 1.8],
        [1.95, 1.9],
        [1.7, 1.95],
        [1.5, 1],
        [0.1, 0.7],
      ],
      24,
    );
    kit.geo(crucible, pool.x + 0.6, 7.6, pool.z, KILN_PALETTE.metal, {
      kind: KIND.metal,
      rot: new Euler(0, 0, 0.35),
    });
    for (const angle of [0, 2.1, 4.2]) {
      const cx = pool.x + 0.6 + Math.cos(angle) * 1.7;
      const cz = pool.z + Math.sin(angle) * 1.7;
      for (let y = 9.6; y < 11; y += 0.3) {
        const geometry = new TorusGeometry(0.1, 0.03, 4, 8);
        geometry.rotateY((y * 10) % 2 < 1 ? 0 : Math.PI / 2);
        kit.geo(geometry, cx, y, cz, KILN_PALETTE.metal, {
          kind: KIND.metal,
        });
      }
    }
    const pourGeo = new CylinderGeometry(0.22, 0.32, 7.3, 10, 6, true);
    pourGeo.translate(pool.x - 1.3, 4.1, pool.z);
    pourGeo.deleteAttribute('uv');
    pourGeo.deleteAttribute('normal');
    const count = pourGeo.attributes.position.count;
    const flow = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) flow.set([0, -3], i * 2);
    pourGeo.setAttribute('aFlow', new BufferAttribute(flow, 2));
    pourGeo.translate(this.origin.x, this.origin.y, this.origin.z);
    kit.lavaParts.push(pourGeo);
    this.lights.add(kit.w(pool.x, 2.5, pool.z), 16748616, 10, 17, 1, 0.1);
    this.lights.add(kit.w(pool.x - 1.3, 6, pool.z), 16752720, 4, 9, 1, 0.1);
    for (const [x, z] of [
      [-10.3, -10.3],
      [10.3, -10.3],
      [-10.3, 0.3],
      [10.3, 0.3],
    ]) {
      kit.basalt(x, z, 0, 5.6, 0.7, 4866107);
      kit.basalt(x + 0.9 * Math.sign(-x), z + 0.5, 0, 3.4, 0.55, 5523521);
      kit.basalt(x + 0.3, z + 0.9 * Math.sign(-z - 5), 0, 2.2, 0.5, 5063229);
    }
    glyphFrieze(kit, true, -12, -12, 12, 6.5, 1, 2.4, [GLYPH.flame, GLYPH.sun, 11, 12], KILN_PALETTE.glass, 1, 1);
    banner(kit, -6, -11.9, 9.5, 0, 1.8, 4, 8004120, KILN_PALETTE.metal, KILN_PALETTE.glass, GLYPH.ring, 1);
    banner(kit, 6, -11.9, 9.5, 0, 1.8, 4, 8004120, KILN_PALETTE.metal, KILN_PALETTE.glass, GLYPH.ring, 1);
    this.hint(
      9.2,
      -1.5,
      -2.3,
      'Heat rises. Wake the chimney’s grate with Ember, then jump into the hot wind and let it carry you up.',
      GLYPH.sun,
    );
    kit.chunk = 'D';
    buildRoom(kit, {
      x0: 14,
      x1: 28,
      z0: -12,
      z1: 2,
      h: 16,
      style: KILN_WALL_STYLE,
      floor: KILN_PALETTE.floor,
      ceil: KILN_PALETTE.ceil,
      pilasters: 0,
      doors: [
        {
          side: 'w',
          c: -5,
          w: 3.4,
          h: 5,
        },
      ],
    });
    kit.box(25.5, 4.5, -5, 5, 9, 14, KILN_PALETTE.low, {
      kind: KIND.basalt,
      col: true,
    });
    kit.box(22.85, 8.8, -5, 0.4, 0.4, 14, KILN_PALETTE.trim, {
      kind: KIND.smooth,
    });
    kit.box(23, 9.1, -5, 0.2, 0.2, 14, KILN_PALETTE.metal, {
      kind: KIND.metal,
    });
    for (const z of [-11, -8, -2, 1]) kit.basalt(23.3, z, 0, 9, 0.45, 4866107, false);
    kit.glyph(22.98, 5.6, -5, new Vector3(-1, 0, 0), 2.4, GLYPH.key, KILN_PALETTE.glass, 1, 1.1);
    const ventPos = new Vector3(19.4, 0, -5);
    this.ventCh = this.ch();
    kit.box(ventPos.x, 0.05, ventPos.z, 5.2, 0.1, 5.2, KILN_PALETTE.low, {
      kind: KIND.basalt,
    });
    const grateRim = new TorusGeometry(2.35, 0.16, 6, 36);
    grateRim.rotateX(Math.PI / 2);
    kit.geo(grateRim, ventPos.x, 0.14, ventPos.z, KILN_PALETTE.metal, {
      kind: KIND.metal,
    });
    const glowRing = new TorusGeometry(2.6, 0.06, 6, 36);
    glowRing.rotateX(Math.PI / 2);
    kit.geo(glowRing, ventPos.x, 0.12, ventPos.z, KILN_PALETTE.glass, {
      kind: KIND.glass,
      glow: [this.ventCh, 1.2],
    });
    for (let i = -4; i <= 4; i++) {
      const len = 2 * Math.sqrt(Math.max(0, 2.3 * 2.3 - i * 0.5 * (i * 0.5)));
      kit.box(ventPos.x + i * 0.5, 0.13, ventPos.z, 0.1, 0.08, len, KILN_PALETTE.metal, {
        kind: KIND.metal,
      });
    }
    for (let j = 0; j < 14; j++) {
      const angle = (j / 14) * Math.PI * 2;
      const dist = 0.6 + (j % 3) * 0.55;
      const geometry = new IcosahedronGeometry(0.35, 0);
      kit.geo(geometry, ventPos.x + Math.cos(angle) * dist, 0.05, ventPos.z + Math.sin(angle) * dist, 2760475, {
        kind: KIND.rough,
        glow: [this.ventCh, 0.6],
      });
    }
    this.vent = new HeatVent(ctx, kit.w(ventPos.x, 0.1, ventPos.z), 2.4, this.origin.y + 13.2, this.particles);
    for (const [dx, dz] of [
      [0, 0],
      [0.9, 0.6],
      [-0.8, -0.7],
      [0.5, -1.1],
      [-0.9, 0.8],
    ])
      this.ventFlames.push(this.flames.add(kit.w(ventPos.x + dx, 0.15, ventPos.z + dz), 1.1, 2.2, 16738858));
    this.ventLight = this.lights.add(kit.w(ventPos.x, 2, ventPos.z), 16742960, 10, 14, 0, 0.12);
    const heatGeo = new CylinderGeometry(2.2, 2.4, 13, 24, 1, true);
    heatGeo.translate(0, 6.5, 0);
    const heatColumn = new Mesh(heatGeo, makeColumnMaterial(ctx, 16747072, this.ventK));
    heatColumn.position.copy(kit.w(ventPos.x, 0.1, ventPos.z));
    heatColumn.renderOrder = 6;
    heatColumn.name = 'kiln-heat-column';
    this.root.add(heatColumn);
    for (const z of [-10.5, 0.5])
      for (let y = 9.4; y < 16; y += 0.34) {
        const geometry = new TorusGeometry(0.12, 0.035, 4, 8);
        geometry.rotateY(((y * 3) | 0) % 2 ? Math.PI / 2 : 0);
        kit.geo(geometry, 27.2, y, z, KILN_PALETTE.metal, {
          kind: KIND.metal,
        });
      }
    this.lights.add(kit.w(26, 11.5, -5), 16760944, 4, 8, 1, 0.05);
    this.lights.add(kit.w(21, 14, -5), 16748624, 3, 12, 1, 0.05);
    glyphFrieze(kit, false, 14, -12, 2, 3.2, 1, 2.3, [GLYPH.flame, 13, 14], KILN_PALETTE.glass, 1, 0.9, [
      {
        c: -5,
        w: 3.4,
      },
    ]);
    kit.chunk = 'E';
    buildRoom(kit, {
      x0: -28,
      x1: -14,
      z0: -12,
      z1: 2,
      h: 10,
      style: KILN_WALL_STYLE,
      floor: KILN_PALETTE.floor,
      ceil: KILN_PALETTE.ceil,
      beams: 3.5,
      pilasters: 3.5,
      doors: [
        {
          side: 'e',
          c: -5,
          w: 3.4,
          h: 5,
        },
        {
          side: 'n',
          c: -21,
          w: 4,
          h: 5.6,
        },
      ],
    });
    for (const [x, z] of [
      [-24.5, -8.5],
      [-17.5, -8.5],
      [-24.5, -1.5],
      [-17.5, -1.5],
    ])
      kit.column(x, z, 0, 8.4, 0.45, KILN_PALETTE.trim, KILN_PALETTE.stone);
    banner(kit, -27.9, -5, 8.5, Math.PI / 2, 1.8, 4, 8004120, KILN_PALETTE.metal, KILN_PALETTE.glass, GLYPH.mask, 1);
    this.guardBraziers.push(this.brazier(-24, -10.6, 0, 0.8));
    this.guardBraziers.push(this.brazier(-18, -10.6, 0, 0.8));
    this.font(-26.6, -9.6, 'blue');
    for (const z of [-9, -1]) this.sconce(-27.95, z, 3.4, 1, 0, 16747066);
    for (const x of [-24.5, -17.5]) this.sconce(x, 1.95, 3.4, 0, -1, 16747066);
    this.hint(
      -15.6,
      -10.3,
      -0.8,
      'Kilnheart was forged in Ember and cannot burn. Frost cracks its hide — fill your blue ink at the font.',
      GLYPH.snow,
    );
    kit.chunk = 'F';
    buildRoom(kit, {
      x0: -31,
      x1: -10,
      z0: -31,
      z1: -14,
      h: 14,
      style: {
        ...KILN_WALL_STYLE,
        wainscot: 2,
      },
      floor: 7098439,
      ceil: KILN_PALETTE.ceil,
      beams: 4.2,
      pilasters: 0,
      doors: [
        {
          side: 's',
          c: -21,
          w: 4,
          h: 5.6,
        },
        {
          side: 'e',
          c: -22.5,
          w: 3.4,
          h: 4.6,
        },
      ],
    });
    const arena = new Vector3(-20.5, 0, -22.5);
    const dais = new CylinderGeometry(3.4, 3.5, 0.1, 40);
    kit.geo(dais, arena.x, 0.05, arena.z, KILN_PALETTE.metal, {
      kind: KIND.metal,
    });
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      kit.box(
        arena.x + Math.cos(angle) * 2.1,
        0.11,
        arena.z + Math.sin(angle) * 2.1,
        1.8,
        0.03,
        0.16,
        KILN_PALETTE.glass,
        {
          kind: KIND.glass,
          glow: [0, 1.6],
          rot: -angle,
        },
      );
    }
    const daisRing = new TorusGeometry(1, 0.08, 6, 30);
    daisRing.rotateX(Math.PI / 2);
    kit.geo(daisRing, arena.x, 0.12, arena.z, KILN_PALETTE.glass, {
      kind: KIND.glass,
      glow: [0, 1.8],
    });
    kit.glyph(arena.x, 0.115, arena.z, new Vector3(0, 1, 0), 1.6, GLYPH.flame, KILN_PALETTE.glass, 0, 1.6);
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2 + 0.3;
      const len = 4 + (i % 3) * 1.6;
      const inner = 3.6;
      const x = arena.x + Math.cos(angle) * (inner + len / 2);
      const z = arena.z + Math.sin(angle) * (inner + len / 2);
      kit.box(x, 0.012, z, len, 0.02, 0.14 + (i % 2) * 0.08, KILN_PALETTE.glass, {
        kind: KIND.glass,
        glow: [0, 1.5],
        rot: -angle,
      });
    }
    this.lights.add(kit.w(arena.x, 9, arena.z), 16756848, 3, 20, 1, 0.02);
    kit.box(-20.5, 0.45, -29.2, 20.4, 0.9, 0.4, KILN_PALETTE.low, {
      kind: KIND.basalt,
      col: true,
    });
    kit.box(-20.5, 0.1, -30.3, 20.4, 0.2, 1.4, KILN_PALETTE.low, {
      kind: KIND.basalt,
    });
    kit.lava(-30.7, -10.3, -30.95, -29.45, 0.35, 1, 0);
    kit.colBox(-20.5, 0.15, -30.3, 10.2, 0.15, 0.7);
    this.lights.add(kit.w(-26, 1, -30), 16734746, 5, 8, 1, 0.1);
    this.lights.add(kit.w(-15, 1, -30), 16734746, 5, 8, 1, 0.1);
    this.lights.add(kit.w(arena.x, 5.5, arena.z), 16747072, 3.2, 13, 1, 0.1);
    for (const [x, z] of [
      [-29.4, -16.3],
      [-11.6, -16.3],
      [-29.4, -27.8],
      [-11.6, -27.8],
    ]) {
      kit.basalt(x, z, 0, 9, 0.8, 4866107);
      kit.basalt(x + 0.8 * Math.sign(-20.5 - x), z + 0.4, 0, 5.5, 0.6, 5523521);
    }
    for (const [x, z] of [
      [-26.5, -15.2],
      [-14.5, -15.2],
      [-29.8, -22.5],
      [-11.2, -22.5],
    ])
      this.arenaBraziers.push(this.brazier(x, z, 0, 0.9));
    glyphFrieze(kit, false, -31, -31, -14, 5, 1, 2.6, [GLYPH.flame, GLYPH.mask, GLYPH.sun], KILN_PALETTE.glass, 1, 1);
    for (const [x2, z] of [
      [-26.3, -18.6],
      [-14.7, -18.6],
      [-26.3, -26.4],
      [-14.7, -26.4],
    ]) {
      const ch = this.ch();
      const geometry = new CylinderGeometry(1.25, 1.35, 0.1, 24);
      kit.geo(geometry, x2, 0.05, z, KILN_PALETTE.low, {
        kind: KIND.basalt,
      });
      const ventRing = new TorusGeometry(1.15, 0.07, 6, 28);
      ventRing.rotateX(Math.PI / 2);
      kit.geo(ventRing, x2, 0.1, z, KILN_PALETTE.glass, {
        kind: KIND.glass,
        glow: [ch, 1.3],
      });
      for (let i = -2; i <= 2; i++)
        kit.box(x2 + i * 0.38, 0.11, z, 0.08, 0.05, 2 * Math.sqrt(1.1 * 1.1 - (i * 0.38) ** 2), KILN_PALETTE.metal, {
          kind: KIND.metal,
        });
      const pos = kit.w(x2, 0.1, z);
      const flameIds = [
        this.flames.add(pos, 1.6, 4.6, 16738858),
        this.flames.add(kit.w(x2 + 0.4, 0.1, z + 0.3), 1.2, 3.8, 16747066),
        this.flames.add(kit.w(x2 - 0.4, 0.1, z - 0.3), 1.2, 3.4, 16732192),
      ];
      const light = this.lights.add(kit.w(x2, 1.5, z), 16736288, 12, 9, 0, 0.2);
      this.fireVents.push({
        p: pos,
        flames: flameIds,
        ch,
        light,
        state: 'idle',
        t: 0,
        hit: false,
      });
    }
    kit.chunk = 'G';
    buildRoom(kit, {
      x0: -8,
      x1: 8,
      z0: -30,
      z1: -16,
      h: 12,
      style: {
        ...KILN_WALL_STYLE,
        wainscot: 1.2,
      },
      floor: 9071192,
      ceil: KILN_PALETTE.ceil,
      beams: 0,
      pilasters: 3.6,
      doors: [
        {
          side: 'w',
          c: -22.5,
          w: 3.4,
          h: 4.6,
        },
        {
          side: 'n',
          c: -1,
          w: 3,
          h: 4.2,
        },
      ],
    });
    kit.box(3.8, 0.4, -22.5, 5.6, 0.8, 7, KILN_PALETTE.trim, {
      kind: KIND.smooth,
      col: true,
    });
    kit.box(3.8, 0.84, -22.5, 5.2, 0.08, 6.6, 9185822, {
      kind: KIND.wood,
    });
    kit.stairs(0.1, 0, -22.5, 1, 0, 2, 0.4, 0.45, 3.2, KILN_PALETTE.trim);
    const medallion = new CylinderGeometry(2.6, 2.6, 0.12, 40);
    medallion.rotateZ(Math.PI / 2);
    kit.geo(medallion, 7.95, 5.4, -22.5, KILN_PALETTE.glass, {
      kind: KIND.glass,
      glow: [1, 1.1],
    });
    const medallionRim = new TorusGeometry(2.7, 0.22, 8, 40);
    medallionRim.rotateY(Math.PI / 2);
    kit.geo(medallionRim, 7.9, 5.4, -22.5, KILN_PALETTE.metal, {
      kind: KIND.metal,
    });
    kit.glyph(7.85, 5.4, -22.5, new Vector3(-1, 0, 0), 3.6, GLYPH.flame, 16765066, 1, 1.4);
    for (const [x, z] of [
      [-5.5, -28],
      [-5.5, -17.5],
      [5.5, -28.3],
      [5.5, -16.8],
    ])
      this.brazier(x, z, 0, 0.85);
    kit.box(-1, 2.5, -31.35, 4, 5, 0.7, KILN_PALETTE.low, {
      kind: KIND.basalt,
      col: true,
    });
    const exitMat = makePortalMaterial(ctx, 16742960, 16769184, this.exitK);
    this.portal(-1, -30.45, 0, 2.9, 4.1, exitMat, false);
    this.lights.add(kit.w(3.8, 3, -22.5), 16756832, 5, 10, 1, 0.05);
    this.shaft(4.2, -22.5, 12, 1.6, 2.6, 16767392, 1);
    this.lights.add(kit.w(0, 9, -22.5), 16769200, 2.5, 16, 1, 0.02);
    const addMotes = (x, z, radius, height, count) =>
      this.moteDefs.push({
        x,
        y: 0.3,
        z,
        radius,
        height,
        count,
        color: 0xffa050,
        size: 0.07,
        kind: 2,
      });
    addMotes(0, 23, 7, 7, 50);
    addMotes(0, 9, 2.5, 5, 18);
    addMotes(0, -5, 9, 9, 70);
    addMotes(21, -5, 6, 14, 60);
    addMotes(-21, -5, 6, 8, 40);
    addMotes(-20.5, -22.5, 9, 11, 70);
    addMotes(0, -22.5, 7, 10, 50);
    kit.glyph(0, 7, 16.02, new Vector3(0, 0, 1), 2.6, GLYPH.flame, KILN_PALETTE.glass, 1, 1.2);
    const emblemRing = new TorusGeometry(1.55, 0.12, 6, 36);
    kit.geo(emblemRing, 0, 7, 16.08, KILN_PALETTE.metal, {
      kind: KIND.metal,
    });
    this.lockedDoor(-12.5, -5, 3.4, 5, false, -10.4, -5);
    const hubSeal = this.door(-13.5, -5, 3.4, 5, false, 'bars', true, 0.7);
    const bossDoor = this.door(-21, -12.5, 4, 5.6, true, 'boss');
    const arenaSeal = this.door(-21, -13.5, 4, 5.6, true, 'bars', true, 0.7);
    this.sanctumDoor = this.door(-9.5, -22.5, 3.4, 4.6, false, 'slab');
    this.makeChests([
      {
        id: 'kiln-ink',
        kind: 'small',
        pos: kit.w(5.4, 0, 8.75),
        facing: -Math.PI / 2,
        loot: {
          ink: true,
        },
      },
      {
        id: 'kiln-key',
        kind: 'key',
        pos: kit.w(26.2, 9, -5),
        facing: -Math.PI / 2,
        loot: {
          key: true,
        },
      },
      {
        id: 'kiln-hearts',
        kind: 'small',
        pos: kit.w(-26.6, 0, -2.5),
        facing: Math.PI / 2,
        loot: {
          hearts: 20,
        },
        hidden: true,
      },
      {
        id: 'kiln-crest',
        kind: 'grand',
        pos: kit.w(4.4, 0.88, -22.5),
        facing: -Math.PI / 2,
        loot: {
          item: 'emberCrest',
        },
      },
    ]);
    this.rooms.push(
      new BattleRoom(
        this,
        [-26.8, -15.2, -10.8, 0.8],
        [hubSeal, arenaSeal],
        [
          [
            {
              kind: 'smudgeling',
              x: -24.5,
              z: -5,
              facing: Math.PI / 2,
            },
            {
              kind: 'smudgeling',
              x: -20,
              z: -9,
              facing: 0,
            },
            {
              kind: 'spitter',
              x: -26,
              z: -9.5,
              facing: Math.PI / 4,
            },
          ],
          [
            {
              kind: 'brute',
              x: -21,
              z: -6,
              facing: Math.PI / 2,
            },
            {
              kind: 'smudgeling',
              x: -25.5,
              z: -1.5,
              facing: Math.PI / 2,
            },
          ],
        ],
        () => this.onGuardCleared(),
      ),
    );
    this.boss = new BossFight(this, {
      door: bossDoor,
      inside: (x, z) => z < -16.2 && x < -10.5,
      kind: 'brute',
      elite: {
        name: 'Kilnheart',
        element: 'red',
      },
      spawn: {
        x: arena.x,
        z: arena.z - 1.5,
        facing: 0,
      },
      introCam: [-21, 3.6, -15.2],
      exitDoor: this.sanctumDoor,
      exitCam: [-16.5, 3.6, -18.5],
      exitLook: [-9.5, 2.2, -22.5],
      hazards: (dt, fighting) => this.stepFireVents(dt, fighting),
      onStart: () =>
        this.arenaBraziers.forEach((arenaBrazier, i) => setTimeout(() => arenaBrazier.ignite(), 250 + i * 280)),
      onWin: () => this.onBossWon(),
    });
    const buildInfo = {
      object: this.root,
      site: 'kiln',
    };
    kit.build(this.stone.material, this.glyphMat, lavaMat, this.root, buildInfo);
  }
  onEntryBrazier() {
    if (!this.entrySolved && this.entryBraziers.every((entryBrazier) => entryBrazier.lit)) {
      this.entrySolved = true;
      setTimeout(() => {
        this.entryDoor.open();
        this.solved('braziers', [0, 2, 16]);
      }, 700);
    }
  }
  onWeb() {
    this.webCount++;
    if (this.webCount === 2) this.solved('webs', [0, 2, 8]);
    if (this.webCount === 1) this.setCheckpoint(0, 14, Math.PI);
  }
  onGuardCleared() {
    this.chests?.appear('kiln-hearts');
    this.guardBraziers.forEach((guardBrazier, i) => setTimeout(() => guardBrazier.ignite(), 400 + i * 300));
    this.boss?.unseal();
    this.setCheckpoint(-21, -8.5, Math.PI);
    try {
      this.ctx.ui.toast('The boss door stirs', 'Something vast breathes behind it…', 'red');
    } catch {}
  }
  onBossWon() {
    this.setCheckpoint(-12.5, -22.5, Math.PI / 2);
    for (const fireVent of this.fireVents) {
      fireVent.state = 'idle';
      for (const flame of fireVent.flames) this.flames.level[flame] = 0;
      this.lights.set(fireVent.light, 0);
    }
  }
  onHitExtra(color, pos, radius) {
    if (color === 'red' && !this.vent.active && this.vent.hits(pos, radius)) {
      this.vent.active = true;
      this.lights.set(this.ventLight, 1);
      sfx(this.ctx, 'shrine-activate', this.vent.base, 1, 0.8);
      sfx(this.ctx, 'bramble-burn', this.vent.base, 0.7, 0.7);
      try {
        this.ctx.events.emit('camera:shake', {
          strength: 0.3,
          position: this.vent.base.clone(),
        });
      } catch {}
      this.solved('vent', this.vent.base);
    }
    if (color === 'blue' && this.boss?.state === 'fight')
      for (const fireVent of this.fireVents) {
        if (fireVent.state === 'doused') continue;
        const dx = pos.x - fireVent.p.x;
        const dz = pos.z - fireVent.p.z;
        if (dx * dx + dz * dz < (1.6 + radius) ** 2 && Math.abs(pos.y - fireVent.p.y) < 3) {
          fireVent.state = 'doused';
          fireVent.t = 0;
          for (const flame of fireVent.flames) this.flames.level[flame] = 0;
          this.lights.set(fireVent.light, 0);
          try {
            this.ctx.events.emit('element:steam', {
              position: fireVent.p.clone(),
            });
          } catch {}
          for (let i = 0; i < 24; i++)
            this.particles.spawn({
              x: fireVent.p.x + (Math.random() - 0.5) * 2,
              y: fireVent.p.y + 0.3,
              z: fireVent.p.z + (Math.random() - 0.5) * 2,
              vy: 2 + Math.random() * 2,
              color: new Color(0.85, 0.9, 1),
              size: 0.5,
              life: 1.2,
              drag: 1,
              bright: 0.8,
            });
        }
      }
  }
  isHazard(pos) {
    const lx = pos.x - this.origin.x;
    const lz = pos.z - this.origin.z;
    const ly = pos.y - this.origin.y;
    return ly < -3 || ly > 6
      ? false
      : (Math.hypot(lx, lz + 5) < 3.15 && ly < 1.2) || (lz < -29.5 && lx < -10 && lx > -31 && ly < 0.9);
  }
  logic(dt) {
    const state = this.ctx.player?.state;
    this.vent.update(dt);
    this.ventK.value = this.vent.level * 0.9;
    this.stone.chan[this.ventCh] = 0.15 + this.vent.level * 1.4;
    for (let i = 0; i < this.ventFlames.length; i++)
      this.flames.level[this.ventFlames[i]] = this.vent.level * (0.85 + 0.15 * Math.sin(this.ctx.time.elapsed * 7 + i));
    this.portalK.value = 0.9 + 0.1 * Math.sin(this.ctx.time.elapsed * 2);
    this.exitK.value += (+!!this.completed - this.exitK.value) * Math.min(1, dt * 1.5);
    this.lavaHeat.value = 1 + this.lit * 0.4;
    if (state && !state.dead && this.isHazard(state.position)) {
      const respawnAt =
        state.position.z - this.origin.z < -29 ? this.kit.w(state.position.x - this.origin.x, 0.05, -27.5) : undefined;
      this.respawnSafe(1, respawnAt);
    }
    if (state && this.entrySolved && !state.dead) {
      const lx = state.position.x - this.origin.x;
      const lz = state.position.z - this.origin.z;
      if (lz < 1 && lz > -11 && Math.abs(lx) < 10 && this.checkpoint.pos.z - this.origin.z > 5)
        this.setCheckpoint(0, 0, Math.PI);
    }
  }
  stepFireVents(dt, fighting) {
    const ctx = this.ctx;
    if (!fighting) {
      for (const fireVent of this.fireVents)
        if (fireVent.state !== 'idle') {
          fireVent.state = 'idle';
          for (const flame of fireVent.flames) this.flames.level[flame] = 0;
          this.lights.set(fireVent.light, 0);
          this.stone.chan[fireVent.ch] = 0.2;
        }
      this.ventClock = 0;
      return;
    }
    this.ventClock += dt;
    if (this.ventClock > 3.6) {
      this.ventClock = 0;
      this.ventPair = (this.ventPair + 1) % 3;
      const picks =
        this.ventPair === 0
          ? [0, 3]
          : this.ventPair === 1
            ? [1, 2]
            : [0, 1, 2, 3].filter(() => Math.random() < 0.6).slice(0, 3);
      for (const index of picks) {
        const vent = this.fireVents[index];
        if (vent && vent.state === 'idle') {
          vent.state = 'warn';
          vent.t = 0;
          vent.hit = false;
          sfx(ctx, 'perch-rumble', vent.p, 0.35, 1.6);
        }
      }
    }
    const state = ctx.player?.state;
    const elapsed = ctx.time.elapsed;
    for (const fireVent of this.fireVents) {
      fireVent.t += dt;
      if (fireVent.state === 'warn') {
        this.stone.chan[fireVent.ch] = 0.6 + 1.4 * Math.abs(Math.sin(fireVent.t * 9));
        for (const flame of fireVent.flames) this.flames.level[flame] = 0.18 + 0.1 * Math.sin(elapsed * 20);
        if (Math.random() < dt * 30)
          this.particles.spawn({
            x: fireVent.p.x + (Math.random() - 0.5) * 2,
            y: fireVent.p.y + 0.1,
            z: fireVent.p.z + (Math.random() - 0.5) * 2,
            vy: 3 + Math.random() * 3,
            color: new Color(1, 0.6, 0.2),
            size: 0.07,
            life: 0.6,
            bright: 3,
          });
        if (fireVent.t > 1.25) {
          fireVent.state = 'erupt';
          fireVent.t = 0;
          this.lights.set(fireVent.light, 1);
          sfx(ctx, 'boss-slam', fireVent.p, 0.35, 1.5);
          try {
            ctx.events.emit('camera:shake', {
              strength: 0.2,
              position: fireVent.p.clone(),
            });
          } catch {}
        }
      } else if (fireVent.state === 'erupt') {
        const blast = Math.min(1, fireVent.t / 0.15) * (1 - Math.max(0, (fireVent.t - 1.4) / 0.3));
        for (let i = 0; i < fireVent.flames.length; i++)
          this.flames.level[fireVent.flames[i]] = blast * (1.2 + 0.2 * Math.sin(elapsed * 14 + i));
        this.stone.chan[fireVent.ch] = 2.2 * blast;
        if (state && !state.dead && !fireVent.hit && blast > 0.5) {
          const dx = state.position.x - fireVent.p.x;
          const dz = state.position.z - fireVent.p.z;
          if (dx * dx + dz * dz < 1.7 * 1.7 && state.position.y - fireVent.p.y < 4.5) {
            fireVent.hit = true;
            try {
              const dir = new Vector3(dx, 0, dz);
              if (dir.lengthSq() < 0.0001) dir.set(0, 0, 1);
              ctx.player.damage({
                amount: 1,
                direction: dir.normalize(),
                knockback: 9,
                source: 'fire',
              });
            } catch {}
          }
        }
        if (fireVent.t > 1.7) {
          fireVent.state = 'idle';
          for (const flame of fireVent.flames) this.flames.level[flame] = 0;
          this.lights.set(fireVent.light, 0);
          this.stone.chan[fireVent.ch] = 0.2;
        }
      } else if (fireVent.state === 'doused') {
        this.stone.chan[fireVent.ch] = 0.05;
        if (Math.random() < dt * 6)
          this.particles.spawn({
            x: fireVent.p.x + (Math.random() - 0.5),
            y: fireVent.p.y + 0.2,
            z: fireVent.p.z + (Math.random() - 0.5),
            vy: 1.2,
            color: new Color(0.8, 0.85, 0.9),
            size: 0.4,
            life: 1.4,
            drag: 0.8,
            bright: 0.5,
          });
        if (fireVent.t > 9) {
          fireVent.state = 'idle';
          this.stone.chan[fireVent.ch] = 0.2;
        }
      }
    }
  }
  skipTo(stage) {
    const step = ['entry', 'gallery', 'hub', 'key', 'guard', 'boss', 'sanctum', 'done'].indexOf(stage);
    if (!(step < 0)) {
      if (step >= 1) {
        for (const entryBrazier of this.entryBraziers) entryBrazier.ignite(true);
        this.entrySolved = true;
        this.entryDoor.open(true);
      }
      if (step >= 2) {
        for (const web of this.webs) web.burnInstant();
        this.webCount = 3;
        this.setCheckpoint(0, 0, Math.PI);
      }
      if (step >= 3) {
        this.vent.active = true;
        this.lights.set(this.ventLight, 1, true);
        this.chests?.openInstant('kiln-key');
        this.keys = Math.max(this.keys, 1);
      }
      if (step >= 4) {
        this.keys = 0;
        for (const lock of this.locks) {
          lock.unlocked = true;
          lock.door.open(true);
        }
      }
      if (step >= 5) {
        for (const room of this.rooms) room.skip();
        this.chests?.appear('kiln-hearts', true);
        for (const guardBrazier of this.guardBraziers) guardBrazier.ignite(true);
        this.boss?.unseal();
        this.setCheckpoint(-21, -8.5, Math.PI);
      }
      if (step >= 6) {
        this.boss?.skipWon();
        for (const arenaBrazier of this.arenaBraziers) arenaBrazier.ignite(true);
        this.setCheckpoint(-12.5, -22.5, Math.PI / 2);
      }
      if (step >= 7) {
        this.chests?.openInstant('kiln-crest');
        this.lightUp(true);
      }
    }
  }
}
