/**
 * Shared paint constants: the paint volume layout (voxel size, brick grid, atlas slots, indirection layers), the vitality map bounds, blob and splat radii, and each ink's channel and colour, with a helper that writes a colour as a GLSL vec3.
 */
import { Color, Vector3 } from 'three';
import { COLORS, PALETTE } from '../core/config.js';
export const VOXEL_SIZE = 0.3;
const BRICK_WORLD_SIZE = VOXEL_SIZE * 8;
export const VOLUME_MIN = new Vector3(-160, -4, -160);
export const GRID_X = Math.ceil(320 / BRICK_WORLD_SIZE);
export const GRID_Y = Math.ceil(305 / BRICK_WORLD_SIZE);
export const GRID_Z = Math.ceil(320 / BRICK_WORLD_SIZE);
export const VOLUME_SIZE = new Vector3(GRID_X * BRICK_WORLD_SIZE, GRID_Y * BRICK_WORLD_SIZE, GRID_Z * BRICK_WORLD_SIZE);
export const VOXELS_X = GRID_X * 8;
export const VOXELS_Y = 1024;
export const VOXELS_Z = GRID_Z * 8;
export const CELL_COUNT = GRID_X * GRID_Y * GRID_Z;
export const SLOT_COUNT = 6144;
export const INDIRECTION_LAYERS = Math.ceil(CELL_COUNT / 25600);
export const ATLAS_DEPTH = 240 + INDIRECTION_LAYERS;
export const SLOT_BYTES = 4000;
export const VITALITY_MIN_X = -160;
export const VITALITY_MIN_Z = -160;
export const VITALITY_SIZE = 320;
export const VITALITY_TEXEL = VITALITY_SIZE / 512;
export const BLOB_RADIUS = 0.2;
export const SPLAT_RADIUS = 1.65;
export const CHANNEL = {
  red: PALETTE.red.channel,
  blue: PALETTE.blue.channel,
  yellow: PALETTE.yellow.channel,
  green: PALETTE.green.channel,
};
export const CHANNEL_COLORS = (() => {
  const colors = [];
  for (const color of COLORS) colors[PALETTE[color].channel] = color;
  return colors;
})();
export const PAINT_COLORS = {
  red: new Color(PALETTE.red.hex),
  blue: new Color(PALETTE.blue.hex),
  yellow: new Color(PALETTE.yellow.hex),
  green: new Color(PALETTE.green.hex),
};
export function glslColor(color) {
  return `vec3(${color.r.toFixed(4)}, ${color.g.toFixed(4)}, ${color.b.toFixed(4)})`;
}
