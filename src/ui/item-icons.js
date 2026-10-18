/**
 * Rainbow gradient and rainbow brush-stroke helpers, and painted canvas icons for the Heart of Colour, the Chroma Brush, Brushflight, the Stamina Vessel and the Sky Mantle.
 */
import { COLORS, PALETTE } from '../core/config.js';
import { makeRng } from '../core/math.js';
import { brushStroke, makeCanvas, strokeCanvas, tint } from './brush.js';
import { heartPath } from './hud-art.js';
export const PI2 = Math.PI * 2;
export function rainbowGradient(g, x0, x1) {
  const gradient = g.createLinearGradient(x0, 0, x1, 0);
  gradient.addColorStop(0, PALETTE.red.css);
  gradient.addColorStop(0.33, PALETTE.yellow.css);
  gradient.addColorStop(0.66, PALETTE.green.css);
  gradient.addColorStop(1, PALETTE.blue.css);
  return gradient;
}
export function rainbowStroke(width, height, seed, options = {}) {
  const canvas = strokeCanvas(width, height, '#ffffff', seed, options);
  const g = canvas.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  tint(g, rainbowGradient(g, 0, canvas.width), canvas.width, canvas.height);
  return canvas;
}
export function heartContainerIcon(size) {
  const px = size * 16;
  const { canvas, g } = makeCanvas(px, px, 3);
  const unit = px / 40;
  const cx = px / 2;
  const cy = px / 2 + unit * 0.6;
  const heart = heartPath(cx, cy, unit * 1.05, 140);
  const tracePath = (pts) => {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (const pt of pts) g.lineTo(pt[0], pt[1]);
    g.closePath();
  };
  g.save();
  tracePath(heartPath(cx, cy, unit * 1.22, 140));
  g.lineWidth = unit * 2.6;
  g.lineJoin = 'round';
  g.strokeStyle = rainbowGradient(g, cx - unit * 18, cx + unit * 18);
  g.globalAlpha = 0.9;
  g.stroke();
  g.restore();
  g.save();
  tracePath(heart);
  g.clip();
  const gradient = g.createLinearGradient(cx - unit * 14, cy - unit * 16, cx + unit * 12, cy + unit * 18);
  gradient.addColorStop(0, '#ff9ab0');
  gradient.addColorStop(0.4, '#ff3f64');
  gradient.addColorStop(0.8, '#c81f4a');
  gradient.addColorStop(1, '#8e1338');
  g.fillStyle = gradient;
  g.fillRect(0, 0, px, px);
  COLORS.forEach((color, i) => {
    const bandY = cy - unit * 9 + i * unit * 5.5;
    brushStroke(
      g,
      [
        [cx - unit * 20, bandY + unit * 4],
        [cx - unit * 4, bandY - unit * 2],
        [cx + unit * 8, bandY + unit * 2],
        [cx + unit * 20, bandY - unit * 3],
      ],
      PALETTE[color].css,
      {
        width: unit * 2.4,
        seed: `hoc-${i}`,
        dry: 0.45,
        core: 0.5,
        alpha: 0.55,
        bristles: 10,
      },
    );
  });
  const gradient2 = g.createRadialGradient(cx + unit * 4, cy - unit * 5, unit * 8, cx, cy, unit * 22);
  gradient2.addColorStop(0, 'rgba(60,0,20,0)');
  gradient2.addColorStop(1, 'rgba(60,0,20,0.5)');
  g.fillStyle = gradient2;
  g.fillRect(0, 0, px, px);
  g.fillStyle = 'rgba(255,250,244,0.9)';
  g.beginPath();
  g.ellipse(cx - unit * 9, cy - unit * 9, unit * 2.2, unit * 1.2, -0.6, 0, PI2);
  g.fill();
  g.restore();
  g.save();
  tracePath(heart);
  g.strokeStyle = 'rgba(12,8,14,0.8)';
  g.lineWidth = unit * 1.4;
  g.stroke();
  g.restore();
  brushStroke(g, heartPath(cx, cy, unit * 1.05, 110, Math.PI - 0.1, 1.06), '#fff3ea', {
    width: unit * 1.2,
    seed: 'hoc-line',
    dry: 0.3,
    core: 0.7,
    taperStart: 0.04,
    taperEnd: 0.1,
  });
  return canvas;
}
export function chromaBrushIcon(size) {
  const px = size * 16;
  const { canvas, g } = makeCanvas(px, px, 3);
  const unit = px / 40;
  g.save();
  g.translate(px / 2, px / 2);
  g.rotate(-Math.PI / 4);
  const gradient = g.createLinearGradient(0, -unit * 2, 0, unit * 2);
  gradient.addColorStop(0, '#f6f0ff');
  gradient.addColorStop(0.5, '#d9c8f0');
  gradient.addColorStop(1, '#a893cc');
  g.fillStyle = gradient;
  g.beginPath();
  g.roundRect(-unit * 17, -unit * 1.25, unit * 22, unit * 2.5, unit * 1.2);
  g.fill();
  const gradient2 = g.createLinearGradient(-unit * 17, 0, unit * 5, 0);
  gradient2.addColorStop(0, 'rgba(255,120,160,0.35)');
  gradient2.addColorStop(0.35, 'rgba(120,220,255,0.35)');
  gradient2.addColorStop(0.7, 'rgba(160,255,160,0.3)');
  gradient2.addColorStop(1, 'rgba(255,230,120,0.35)');
  g.fillStyle = gradient2;
  g.fillRect(-unit * 17, -unit * 1.25, unit * 22, unit * 1.1);
  const goldBand = (cx, width, halfH) => {
    const gradient = g.createLinearGradient(0, -halfH, 0, halfH);
    gradient.addColorStop(0, '#fff0b0');
    gradient.addColorStop(0.45, '#f0b93a');
    gradient.addColorStop(1, '#9a6414');
    g.fillStyle = gradient;
    g.beginPath();
    g.roundRect(cx - width / 2, -halfH, width, halfH * 2, halfH * 0.5);
    g.fill();
  };
  goldBand(-unit * 17.5, unit * 2.6, unit * 1.9);
  for (const bandX of [-unit * 14, -unit * 11.5, -unit * 9]) goldBand(bandX, unit * 0.9, unit * 1.55);
  goldBand(unit * 5.2, unit * 3.2, unit * 2.1);
  g.fillStyle = '#f5c34a';
  for (const side of [-1, 1]) {
    g.beginPath();
    g.moveTo(unit * 4, side * unit * 1.8);
    g.quadraticCurveTo(unit * 6.5, side * unit * 5.2, unit * 8.6, side * unit * 4.2);
    g.quadraticCurveTo(unit * 7, side * unit * 2.8, unit * 6.8, side * unit * 1.4);
    g.closePath();
    g.fill();
  }
  g.save();
  g.beginPath();
  g.moveTo(unit * 6.6, -unit * 2.4);
  g.bezierCurveTo(unit * 13, -unit * 5.6, unit * 19, -unit * 3.4, unit * 21.5, unit * 0.4);
  g.bezierCurveTo(unit * 18, unit * 3.2, unit * 12, unit * 5, unit * 6.6, unit * 2.4);
  g.closePath();
  g.clip();
  ['red', 'yellow', 'green', 'blue'].forEach((color, i) => {
    g.fillStyle = PALETTE[color].css;
    g.fillRect(unit * 6, -unit * 6 + i * unit * 3, unit * 17, unit * 3.2);
  });
  for (let i = 0; i < 5; i++)
    brushStroke(
      g,
      [
        [unit * 6, -unit * 3 + i * unit * 1.4],
        [unit * 14, -unit * 3.5 + i * unit * 1.6],
        [unit * 22, unit * 0.3],
      ],
      'rgba(255,255,255,1)',
      {
        width: unit * 1.3,
        seed: `cb-br-${i}`,
        dry: 0.6,
        core: 0,
        alpha: 0.35,
        bristles: 8,
      },
    );
  g.restore();
  g.strokeStyle = 'rgba(14,10,20,0.75)';
  g.lineWidth = unit * 0.7;
  g.beginPath();
  g.moveTo(unit * 6.6, -unit * 2.4);
  g.bezierCurveTo(unit * 13, -unit * 5.6, unit * 19, -unit * 3.4, unit * 21.5, unit * 0.4);
  g.bezierCurveTo(unit * 18, unit * 3.2, unit * 12, unit * 5, unit * 6.6, unit * 2.4);
  g.stroke();
  g.restore();
  const rng = makeRng('cb-spark');
  g.fillStyle = '#fffaf0';
  for (let i = 0; i < 6; i++) {
    const sx = px * (0.55 + rng() * 0.4);
    const sy = px * (0.05 + rng() * 0.4);
    const sr = unit * (0.6 + rng() * 1.1);
    g.beginPath();
    g.moveTo(sx, sy - sr * 2);
    g.quadraticCurveTo(sx + sr * 0.25, sy - sr * 0.25, sx + sr * 2, sy);
    g.quadraticCurveTo(sx + sr * 0.25, sy + sr * 0.25, sx, sy + sr * 2);
    g.quadraticCurveTo(sx - sr * 0.25, sy + sr * 0.25, sx - sr * 2, sy);
    g.quadraticCurveTo(sx - sr * 0.25, sy - sr * 0.25, sx, sy - sr * 2);
    g.fill();
  }
  return canvas;
}
export function brushflightIcon(size) {
  const px = size * 16;
  const { canvas, g } = makeCanvas(px, px, 3);
  const unit = px / 40;
  brushStroke(
    g,
    [
      [px * 0.08, px * 0.78],
      [px * 0.3, px * 0.86],
      [px * 0.55, px * 0.8],
    ],
    'rgba(255,255,255,0.9)',
    {
      width: unit * 1.1,
      seed: 'bf-w1',
      dry: 0.5,
      core: 0.4,
      alpha: 0.5,
      taperStart: 0.2,
      taperEnd: 0.5,
    },
  );
  brushStroke(
    g,
    [
      [px * 0.04, px * 0.62],
      [px * 0.18, px * 0.7],
      [px * 0.34, px * 0.68],
    ],
    'rgba(255,255,255,0.9)',
    {
      width: unit * 0.9,
      seed: 'bf-w2',
      dry: 0.5,
      core: 0.4,
      alpha: 0.4,
      taperStart: 0.2,
      taperEnd: 0.5,
    },
  );
  g.save();
  g.translate(px / 2, px / 2 + unit * 1.5);
  g.rotate(-Math.PI / 5);
  const feather = (angle, len, width, tip, side) => {
    g.save();
    g.translate(unit * 5, 0);
    g.rotate(angle * side);
    const gradient = g.createLinearGradient(0, 0, -len, 0);
    gradient.addColorStop(0, '#fff4df');
    gradient.addColorStop(0.35, '#fff4df');
    gradient.addColorStop(1, tip);
    g.fillStyle = gradient;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-len * 0.3, -width * side, -len * 0.75, -width * 1.1 * side, -len, -width * 0.3 * side);
    g.bezierCurveTo(-len * 0.7, width * 0.4 * side, -len * 0.3, width * 0.35 * side, 0, 0);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(14,10,20,0.55)';
    g.lineWidth = unit * 0.45;
    g.stroke();
    g.restore();
  };
  const featherColors = [PALETTE.blue.css, PALETTE.green.css, PALETTE.yellow.css, PALETTE.red.css];
  for (const side of [-1, 1])
    featherColors.forEach((color, i) =>
      feather(0.55 + i * 0.3, unit * (13 - Math.abs(i - 1.5) * 1.6), unit * 2.4, color, side),
    );
  const gradient = g.createLinearGradient(0, -unit * 2, 0, unit * 2);
  gradient.addColorStop(0, '#fbf6ee');
  gradient.addColorStop(0.5, '#e4d8c6');
  gradient.addColorStop(1, '#b3a38c');
  g.fillStyle = gradient;
  g.beginPath();
  g.roundRect(-unit * 18, -unit * 1.1, unit * 23, unit * 2.2, unit * 1.1);
  g.fill();
  COLORS.forEach((color, i) => {
    g.strokeStyle = PALETTE[color].css;
    g.lineWidth = unit * 0.55;
    for (let j = 0; j < 2; j++) {
      const stripeX = -unit * 16 + (i + j * 4) * unit * 2.3;
      g.beginPath();
      g.moveTo(stripeX, -unit * 1.05);
      g.lineTo(stripeX + unit * 1.4, unit * 1.05);
      g.stroke();
    }
  });
  const goldBand = (cx, width, halfH) => {
    const gradient = g.createLinearGradient(0, -halfH, 0, halfH);
    gradient.addColorStop(0, '#fff0b0');
    gradient.addColorStop(0.45, '#f0b93a');
    gradient.addColorStop(1, '#9a6414');
    g.fillStyle = gradient;
    g.beginPath();
    g.roundRect(cx - width / 2, -halfH, width, halfH * 2, halfH * 0.5);
    g.fill();
  };
  goldBand(-unit * 18.3, unit * 2.4, unit * 1.7);
  goldBand(unit * 5.4, unit * 3.4, unit * 2);
  g.save();
  g.beginPath();
  g.moveTo(unit * 6.8, -unit * 2.3);
  g.bezierCurveTo(unit * 13, -unit * 5.4, unit * 19, -unit * 3.2, unit * 22, unit * 0.6);
  g.bezierCurveTo(unit * 18, unit * 3.1, unit * 12, unit * 4.8, unit * 6.8, unit * 2.3);
  g.closePath();
  g.clip();
  const gradient2 = g.createLinearGradient(unit * 6.5, 0, unit * 22, 0);
  gradient2.addColorStop(0, '#fff4df');
  gradient2.addColorStop(0.2, PALETTE.red.css);
  gradient2.addColorStop(0.45, PALETTE.yellow.css);
  gradient2.addColorStop(0.7, PALETTE.green.css);
  gradient2.addColorStop(0.92, PALETTE.blue.css);
  gradient2.addColorStop(1, '#ffffff');
  g.fillStyle = gradient2;
  g.fillRect(unit * 6, -unit * 6, unit * 17, unit * 12);
  for (let i = 0; i < 5; i++)
    brushStroke(
      g,
      [
        [unit * 6, -unit * 3 + i * unit * 1.4],
        [unit * 14, -unit * 3.5 + i * unit * 1.6],
        [unit * 22, unit * 0.6],
      ],
      'rgba(255,255,255,1)',
      {
        width: unit * 1.2,
        seed: `bf-br-${i}`,
        dry: 0.6,
        core: 0,
        alpha: 0.35,
        bristles: 8,
      },
    );
  g.restore();
  g.strokeStyle = 'rgba(14,10,20,0.75)';
  g.lineWidth = unit * 0.7;
  g.beginPath();
  g.moveTo(unit * 6.8, -unit * 2.3);
  g.bezierCurveTo(unit * 13, -unit * 5.4, unit * 19, -unit * 3.2, unit * 22, unit * 0.6);
  g.bezierCurveTo(unit * 18, unit * 3.1, unit * 12, unit * 4.8, unit * 6.8, unit * 2.3);
  g.stroke();
  g.restore();
  const rng = makeRng('bf-spark');
  g.fillStyle = '#fffaf0';
  for (let i = 0; i < 7; i++) {
    const sx = px * (0.5 + rng() * 0.45);
    const sy = px * (0.05 + rng() * 0.35);
    const sr = unit * (0.5 + rng() * 1.1);
    g.beginPath();
    g.moveTo(sx, sy - sr * 2);
    g.quadraticCurveTo(sx + sr * 0.25, sy - sr * 0.25, sx + sr * 2, sy);
    g.quadraticCurveTo(sx + sr * 0.25, sy + sr * 0.25, sx, sy + sr * 2);
    g.quadraticCurveTo(sx - sr * 0.25, sy + sr * 0.25, sx - sr * 2, sy);
    g.quadraticCurveTo(sx - sr * 0.25, sy - sr * 0.25, sx, sy - sr * 2);
    g.fill();
  }
  return canvas;
}
function drawSparkle(g, cx, cy, size) {
  g.beginPath();
  g.moveTo(cx, cy - size * 2);
  g.quadraticCurveTo(cx + size * 0.25, cy - size * 0.25, cx + size * 2, cy);
  g.quadraticCurveTo(cx + size * 0.25, cy + size * 0.25, cx, cy + size * 2);
  g.quadraticCurveTo(cx - size * 0.25, cy + size * 0.25, cx - size * 2, cy);
  g.quadraticCurveTo(cx - size * 0.25, cy - size * 0.25, cx, cy - size * 2);
  g.fill();
}
export function staminaVesselIcon(size) {
  const px = size * 16;
  const { canvas, g } = makeCanvas(px, px, 3);
  const unit = px / 40;
  const cx = px / 2;
  const cy = px / 2;
  const gradient = g.createRadialGradient(cx, cy, unit * 6, cx, cy, unit * 19);
  gradient.addColorStop(0, 'rgba(120,255,170,0.55)');
  gradient.addColorStop(1, 'rgba(120,255,170,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, px, px);
  g.save();
  g.beginPath();
  g.arc(cx, cy, unit * 11.5, 0, PI2);
  g.clip();
  const gradient2 = g.createRadialGradient(cx - unit * 3, cy - unit * 4, unit * 1, cx, cy, unit * 12);
  gradient2.addColorStop(0, '#f2fff5');
  gradient2.addColorStop(0.35, '#8dffb7');
  gradient2.addColorStop(0.75, '#2fc774');
  gradient2.addColorStop(1, '#127a4a');
  g.fillStyle = gradient2;
  g.fillRect(0, 0, px, px);
  for (let i = 0; i < 3; i++) {
    const start = (i / 3) * PI2 + 0.4;
    const pts = [];
    for (let j = 0; j <= 8; j++) {
      const f = j / 8;
      const rad = unit * (2 + f * 9);
      const angle = start + f * 2.6;
      pts.push([cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad * 0.8]);
    }
    brushStroke(g, pts, 'rgba(240,255,245,1)', {
      width: unit * 1.5,
      seed: `sv-rib-${i}`,
      dry: 0.35,
      core: 0.7,
      alpha: 0.75,
      taperStart: 0.3,
      taperEnd: 0.6,
    });
  }
  g.restore();
  g.strokeStyle = 'rgba(10,40,24,0.75)';
  g.lineWidth = unit * 1.1;
  g.beginPath();
  g.arc(cx, cy, unit * 11.5, 0, PI2);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath();
  g.ellipse(cx - unit * 4.5, cy - unit * 5.5, unit * 2.6, unit * 1.3, -0.7, 0, PI2);
  g.fill();
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * PI2 - 0.6;
    const ox = cx + Math.cos(angle) * unit * 15;
    const oy = cy + Math.sin(angle) * unit * 13;
    const gradient = g.createRadialGradient(ox, oy, 0, ox, oy, unit * 2.4);
    gradient.addColorStop(0, 'rgba(240,255,245,1)');
    gradient.addColorStop(1, 'rgba(110,255,160,0)');
    g.fillStyle = gradient;
    g.beginPath();
    g.arc(ox, oy, unit * 2.4, 0, PI2);
    g.fill();
  }
  g.fillStyle = '#f4fff6';
  const rng = makeRng('sv-spark');
  for (let i = 0; i < 5; i++)
    drawSparkle(g, px * (0.1 + rng() * 0.8), px * (0.08 + rng() * 0.3), unit * (0.5 + rng() * 0.9));
  return canvas;
}
export function skyMantleIcon(size) {
  const px = size * 16;
  const { canvas, g } = makeCanvas(px, px, 3);
  const unit = px / 40;
  const cx = px / 2;
  const collarY = unit * 8;
  const hemY = unit * 34;
  const traceCape = () => {
    g.beginPath();
    g.moveTo(cx - unit * 7, collarY);
    g.quadraticCurveTo(cx - unit * 12, collarY + unit * 12, cx - unit * 15.5, hemY - unit * 1);
    for (let i = 0; i < 6; i++) {
      const x0 = cx - unit * 15.5 + (i / 6) * unit * 33;
      const x1 = cx - unit * 15.5 + ((i + 1) / 6) * unit * 33;
      const y0 = hemY - unit * 1 + (i / 6) * unit * -3;
      const y1 = hemY - unit * 1 + ((i + 1) / 6) * unit * -3;
      g.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + unit * 2.6, x1, y1);
    }
    g.quadraticCurveTo(cx + unit * 13, collarY + unit * 11, cx + unit * 7, collarY);
    g.closePath();
  };
  g.save();
  traceCape();
  g.clip();
  const gradient = g.createLinearGradient(0, collarY, 0, hemY);
  gradient.addColorStop(0, '#eef4fa');
  gradient.addColorStop(0.25, '#8cc6f4');
  gradient.addColorStop(0.55, '#3d80e0');
  gradient.addColorStop(0.72, '#4a4cb8');
  gradient.addColorStop(0.76, '#ffd25e');
  gradient.addColorStop(0.86, '#ff9a5c');
  gradient.addColorStop(0.95, '#ff6f78');
  gradient.addColorStop(1, '#c964b8');
  g.fillStyle = gradient;
  g.fillRect(0, 0, px, px);
  const rng = makeRng('sm-cloud');
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 4; i++) {
    const cloudX = cx - unit * 9 + rng() * unit * 18;
    const cloudY = collarY + unit * 6 + rng() * unit * 9;
    for (let j = 0; j < 4; j++) {
      g.beginPath();
      g.arc(
        cloudX + (j - 1.5) * unit * 1.7,
        cloudY - Math.sin((j / 3) * Math.PI) * unit * 1.2,
        unit * (1.2 + rng() * 0.9),
        0,
        PI2,
      );
      g.fill();
    }
  }
  g.fillStyle = '#fff6d8';
  for (let i = 0; i < 7; i++)
    drawSparkle(
      g,
      cx - unit * 11 + rng() * unit * 22,
      collarY + unit * 15 + rng() * unit * 7,
      unit * (0.35 + rng() * 0.45),
    );
  for (let i = -2; i <= 2; i++)
    brushStroke(
      g,
      [
        [cx + i * unit * 2.4, collarY + unit * 2],
        [cx + i * unit * 4.2, collarY + unit * 14],
        [cx + i * unit * 5.8, hemY],
      ],
      'rgba(20,30,80,1)',
      {
        width: unit * 1.4,
        seed: `sm-fold-${i}`,
        dry: 0.5,
        core: 0.3,
        alpha: 0.18,
        taperStart: 0.2,
        taperEnd: 0.2,
      },
    );
  g.restore();
  g.save();
  traceCape();
  g.strokeStyle = '#f2c14e';
  g.lineWidth = unit * 1.6;
  g.stroke();
  g.strokeStyle = 'rgba(14,10,20,0.8)';
  g.lineWidth = unit * 0.6;
  g.stroke();
  g.restore();
  const gradient2 = g.createLinearGradient(0, collarY - unit * 2, 0, collarY + unit * 3);
  gradient2.addColorStop(0, '#ffffff');
  gradient2.addColorStop(1, '#e2dccf');
  g.fillStyle = gradient2;
  g.beginPath();
  g.roundRect(cx - unit * 9, collarY - unit * 2.2, unit * 18, unit * 4.2, unit * 2);
  g.fill();
  g.strokeStyle = 'rgba(14,10,20,0.7)';
  g.lineWidth = unit * 0.5;
  g.stroke();
  g.strokeStyle = '#f2c14e';
  g.lineWidth = unit * 0.7;
  g.beginPath();
  g.moveTo(cx - unit * 5.5, collarY);
  g.quadraticCurveTo(cx, collarY + unit * 3.2, cx + unit * 5.5, collarY);
  g.stroke();
  for (const side of [-1, 1]) {
    const claspX = cx + side * unit * 5.5;
    const gradient = g.createRadialGradient(claspX - unit * 0.6, collarY - unit * 0.6, 0, claspX, collarY, unit * 2.4);
    gradient.addColorStop(0, '#fff3c0');
    gradient.addColorStop(0.6, '#f0b93a');
    gradient.addColorStop(1, '#9a6414');
    g.fillStyle = gradient;
    g.beginPath();
    g.arc(claspX, collarY, unit * 2.3, 0, PI2);
    g.fill();
    g.fillStyle = '#6fd0ff';
    g.beginPath();
    g.arc(claspX, collarY, unit * 1, 0, PI2);
    g.fill();
  }
  g.fillStyle = '#fffaf0';
  const rng2 = makeRng('sm-spark');
  for (let i = 0; i < 5; i++)
    drawSparkle(g, px * (0.05 + rng2() * 0.9), px * (0.04 + rng2() * 0.18), unit * (0.5 + rng2() * 0.8));
  return canvas;
}
