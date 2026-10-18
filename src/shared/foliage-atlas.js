/**
 * Paints the foliage texture atlas on a canvas: broadleaf and birch leaf clumps, fern and palm fronds.
 */
import { CanvasTexture, LinearFilter, LinearMipMapLinearFilter, SRGBColorSpace } from 'three';
import { makeRng as makeRng2 } from '../core/math.js';
export const ATLAS_RECTS = {
  broadleaf: [0, 0.5, 0.5, 1],
  birch: [0.5, 0.5, 1, 1],
  fern: [0, 0, 0.5, 0.5],
  palm: [0.5, 0, 1, 0.5],
};
export const ATLAS_SIZE = 1024;
function drawLeaf(ctx2d, len, width, lum, fullness) {
  const tipX = len;
  const halfW = width;
  ctx2d.beginPath();
  ctx2d.moveTo(0, 0);
  ctx2d.bezierCurveTo(tipX * 0.25, -halfW * (0.9 + fullness), tipX * (0.7 + fullness * 0.2), -halfW * 0.8, tipX, 0);
  ctx2d.bezierCurveTo(tipX * (0.7 + fullness * 0.2), halfW * 0.8, tipX * 0.25, halfW * (0.9 + fullness), 0, 0);
  const grey = Math.round(Math.max(0, Math.min(1, lum)) * 255);
  ctx2d.fillStyle = `rgb(${grey},${grey},${grey})`;
  ctx2d.fill();
  const veinGrey = Math.round(Math.max(0, Math.min(1, lum * 1.12 + 0.04)) * 255);
  ctx2d.strokeStyle = `rgba(${veinGrey},${veinGrey},${veinGrey},0.55)`;
  ctx2d.lineWidth = Math.max(1, halfW * 0.12);
  ctx2d.beginPath();
  ctx2d.moveTo(tipX * 0.08, 0);
  ctx2d.lineTo(tipX * 0.85, 0);
  ctx2d.stroke();
}
function paintLeafClump(ctx2d, x0, y0, size, seed, count, leafLen, leafW, fullness) {
  const rand = makeRng2(seed);
  const cx = x0 + size / 2;
  const cy = y0 + size / 2;
  const spread = size * 0.36;
  const leaves = [];
  for (let i = 0; i < count; i++) {
    const dist = rand() ** 0.6;
    const ang = rand() * Math.PI * 2;
    const px = cx + Math.cos(ang) * dist * spread;
    const py = cy + Math.sin(ang) * dist * spread;
    const rot = ang + (rand() - 0.5) * 1.3 * (0.4 + dist);
    const len = leafLen * (0.7 + rand() * 0.6) * (0.8 + 0.3 * dist);
    const light = 0.5 - 0.5 * (Math.cos(ang) * 0.35 + Math.sin(ang) * 0.65) * dist;
    const lum = 0.5 + 0.28 * dist + 0.2 * light + (rand() - 0.5) * 0.18;
    leaves.push({
      x: px,
      y: py,
      a: rot,
      l: len,
      lum,
      d: dist,
    });
  }
  leaves.sort((a, b) => a.d - b.d);
  for (const leaf of leaves) {
    ctx2d.save();
    ctx2d.translate(leaf.x, leaf.y);
    ctx2d.rotate(leaf.a);
    drawLeaf(ctx2d, leaf.l, leafW * (leaf.l / leafLen), leaf.lum, fullness);
    ctx2d.restore();
  }
}
function paintFrond(ctx2d, x0, y0, size, seed, pairs, leafLen, leafW, leafAngle, lum) {
  const rand = makeRng2(seed);
  const cx = x0 + size / 2;
  const baseY = y0 + size * 0.97;
  const tipY = y0 + size * 0.04;
  ctx2d.strokeStyle = `rgb(${Math.round(lum * 200)},${Math.round(lum * 200)},${Math.round(lum * 200)})`;
  ctx2d.lineWidth = size * 0.012;
  ctx2d.beginPath();
  ctx2d.moveTo(cx, baseY);
  ctx2d.lineTo(cx, tipY);
  ctx2d.stroke();
  for (let i = 0; i < pairs; i++) {
    const along = (i + 0.5) / pairs;
    const pairY = baseY + (tipY - baseY) * along;
    const len = leafLen * (1 - along * 0.85) * (0.72 + 0.28 * Math.min(1, along * 4)) * (0.88 + rand() * 0.24);
    for (const side of [-1, 1]) {
      ctx2d.save();
      ctx2d.translate(cx, pairY);
      ctx2d.rotate(side < 0 ? Math.PI + leafAngle : -leafAngle);
      const shade = lum + (rand() - 0.5) * 0.14 + (1 - along) * 0.05;
      drawLeaf(ctx2d, len, leafW * (0.8 + 0.3 * (1 - along)), shade, -0.3);
      ctx2d.restore();
    }
  }
}
export function createFoliageAtlas() {
  const size = ATLAS_SIZE;
  const half = size / 2;
  let canvas;
  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
  } else canvas = new OffscreenCanvas(size, size);
  const ctx2d = canvas.getContext('2d');
  ctx2d.clearRect(0, 0, size, size);
  paintLeafClump(ctx2d, 0, 0, half, 'atlas-broadleaf', 330, half * 0.085, half * 0.034, 0.1);
  paintLeafClump(ctx2d, half, 0, half, 'atlas-birch', 380, half * 0.06, half * 0.03, 0.35);
  paintFrond(ctx2d, 0, half, half, 'atlas-fern', 19, half * 0.36, half * 0.075, 0.5, 0.74);
  paintFrond(ctx2d, half, half, half, 'atlas-palm', 28, half * 0.4, half * 0.036, 0.55, 0.7);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = LinearMipMapLinearFilter;
  texture.magFilter = LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
