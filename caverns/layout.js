/**
 * Glowcap Caverns layout: chambers, tunnels, chasm, shaft, pool and pillars in cave-local coordinates, the landmark spots for chests, hints and warps, and the cave mouth on the island.
 */
import { Box3, Vector3 } from 'three';
import { INTERIOR_POCKETS } from '../core/config.js';
export const POCKET = INTERIOR_POCKETS.glowcap;
export const OX = POCKET.x;
export const OZ = POCKET.z;
export const OY = POCKET.y + 11;
export const toWorld = (x, y, z, target = new Vector3()) => target.set(OX + x, OY + y, OZ + z);
export const CHAMBERS = [
  {
    id: 'A',
    name: 'Mossy Mouth',
    x: -27,
    z: 27,
    floor: 0,
    rx: 7.5,
    ry: 5.5,
    rz: 7,
  },
  {
    id: 'B',
    name: 'Glowcap Hollow',
    x: -24,
    z: -3,
    floor: -2,
    rx: 11,
    ry: 9.5,
    rz: 10.5,
  },
  {
    id: 'C',
    name: 'Crystal Gallery',
    x: -20,
    z: -27,
    floor: 1,
    rx: 10,
    ry: 7,
    rz: 8,
  },
  {
    id: 'S',
    name: 'Hidden Hollow',
    x: -8.5,
    z: -33.5,
    floor: 7.5,
    rx: 4.3,
    ry: 3.2,
    rz: 3.6,
    rough: 0.6,
  },
  {
    id: 'D',
    name: 'Brazier Hall',
    x: 10,
    z: -24,
    floor: 2,
    rx: 8.5,
    ry: 6.5,
    rz: 8,
  },
  {
    id: 'E',
    name: "Gloomwarden's Hollow",
    x: 22,
    z: 4,
    floor: 0.5,
    rx: 12,
    ry: 8,
    rz: 11,
  },
  {
    id: 'F',
    name: 'Lantern Grotto',
    x: 8,
    z: 28,
    floor: 0,
    rx: 11,
    ry: 10,
    rz: 8.5,
  },
];
export const getChamber = (id) => CHAMBERS.find((chamber) => chamber.id === id);
export const TUNNELS = [
  {
    id: 'T1',
    r: 3.2,
    pts: [
      [-25.5, 0, 22],
      [-21, 0, 17.5],
      [-17, -0.4, 13.5],
      [-17.5, -1.2, 9],
      [-21, -2, 5],
    ],
  },
  {
    id: 'T2',
    r: 3.2,
    pts: [
      [-28, -2, -9],
      [-31, -1.5, -13.5],
      [-29.5, -0.5, -18],
      [-26, 0.5, -21],
      [-23, 1, -23.5],
    ],
  },
  {
    id: 'T3',
    r: 3.1,
    pts: [
      [-12, 1, -25],
      [-7, 1.3, -22],
      [-2, 1.7, -22],
      [3, 2, -23.5],
    ],
  },
  {
    id: 'T4',
    r: 3.2,
    pts: [
      [10, 2, -17],
      [12, 1.6, -12],
      [16, 1, -7],
      [19, 0.5, -3],
    ],
  },
  {
    id: 'T5',
    r: 3.1,
    pts: [
      [14, 0.5, 11],
      [10.5, 0.3, 15],
      [7.5, 0.1, 18.5],
      [7, 0, 22],
    ],
  },
  {
    id: 'alcove',
    r: 2.7,
    pts: [
      [-14.5, 1, -28.5],
      [-13, 1, -33],
    ],
  },
  {
    id: 'exitA',
    r: 2.7,
    pts: [
      [-30, 0, 29.5],
      [-35, 0, 34],
    ],
  },
  {
    id: 'shortcut',
    r: 2.8,
    pts: [
      [-1, 0, 29],
      [-5.5, 0.3, 30],
      [-9.5, 0.6, 31],
    ],
  },
];
export const CHASM = {
  x0: -33,
  x1: -15,
  z0: -6.5,
  z1: 1,
  floor: -8,
  top: -2,
};
export const GIANT = {
  x: -23.5,
  z: -2.75,
  floor: -8,
  capR: 5.2,
};
export const SHAFT = {
  x: -13,
  z: -33,
  r: 2.1,
  y0: 1,
  y1: 10,
};
export const PILLARS = [
  [16.5, 0.5, 1.5],
  [28, 8.5, 1.7],
  [26.5, -3.5, 1.2],
];
export const POOL = {
  x: 2.5,
  z: 27,
  rx: 3.6,
  rz: 2.8,
  depth: 0.55,
};
export const SPOTS = {
  arrive: [-24.5, 0, 25],
  arriveFacing: Math.atan2(3.5, -7.5),
  exitA: [-34.2, 0, 33.2],
  hintA: [-21.8, 0, 29.8],
  hintB: [-18.5, -2, 3.2],
  hintC: [-16.5, 1, -30.5],
  hintD: [10, 2, -20.5],
  hintE: [12.5, 0.5, 9],
  chasmSouth: [-22, -2, 3.4],
  chasmNorth: [-23, -2, -9],
  braziers: [
    [5.3, 2, -25.6],
    [10, 2, -28.6],
    [14.7, 2, -25.6],
  ],
  inkChest: [-27.6, 1, -30.2],
  heartChest: [16.2, 2, -19.4],
  vesselChest: [-6.6, 7.5, -34.4],
  grandChest: [8, 0, 33.2],
  elite: [23.5, 0.5, 5],
  shortcutEnd: [-9.5, 0.6, 31],
  endWarp: [8, 0, 25.5],
};
export const spotPos = (spot, target = new Vector3()) => toWorld(spot[0], spot[1], spot[2], target);
export const BOUNDS = new Box3(
  new Vector3(OX - POCKET.size / 2, POCKET.y - 1, OZ - POCKET.size / 2),
  new Vector3(OX + POCKET.size / 2, POCKET.y + 62, OZ + POCKET.size / 2),
);
export const MOUTH = {
  x: 108.6,
  z: 23.6,
  facing: -Math.PI / 2,
};
export const MOUTH_EXIT = {
  x: 104.2,
  z: 23.3,
  facing: -Math.PI / 2,
};
export const MOUTH_HINT = {
  x: 99.4,
  z: 21.2,
};
